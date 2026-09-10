import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// ==========================================
// CONFIGURATION
// ==========================================
const CONFIG = {
  usdToInr: 84.0,
  alertHistoryPath: path.resolve("./data/alert_history.json"),
  priceHistoryPath: path.resolve("./data/price_history.json"),
  dedupTtlHours: 48,
  dateWindows: [
    { dep: 21, ret: 28 },
    { dep: 35, ret: 42 },
  ],
};

// ==========================================
// NEARBY AIRPORTS
// ==========================================
const NEARBY_ORIGINS = {
  BOM: ["BOM", "PNQ"],       // Mumbai, Pune
  DEL: ["DEL", "CCU"],       // Delhi, Kolkata
  BLR: ["BLR", "CCJ"],       // Bangalore, Kochi
  MAA: ["MAA", "TRV"],       // Chennai, Trivandrum
};

// ==========================================
// WATCHED ROUTES
// ==========================================
const WATCHED_ROUTES = [
  // Southeast Asia
  { origins: ["BOM"], dest: "DPS", name: "Bali, Indonesia", baselineInr: 38000, dealThresholdInr: 24000, visa: "Visa on Arrival (30 Days)" },
  { origins: ["DEL"], dest: "BKK", name: "Bangkok, Thailand", baselineInr: 32000, dealThresholdInr: 19000, visa: "Visa-Free / VoA" },
  { origins: ["BLR"], dest: "SIN", name: "Singapore", baselineInr: 35000, dealThresholdInr: 22000, visa: "eVisa required" },
  { origins: ["MAA"], dest: "KUL", name: "Kuala Lumpur, Malaysia", baselineInr: 30000, dealThresholdInr: 18000, visa: "Visa-Free entry" },
  { origins: ["BOM"], dest: "HAN", name: "Hanoi, Vietnam", baselineInr: 35000, dealThresholdInr: 22000, visa: "30-day eVisa" },

  // East Asia
  { origins: ["BOM"], dest: "NRT", name: "Tokyo, Japan", baselineInr: 65000, dealThresholdInr: 38000, visa: "eVisa required" },
  { origins: ["DEL"], dest: "ICN", name: "Seoul, South Korea", baselineInr: 45000, dealThresholdInr: 28000, visa: "Standard Tourist Visa" },

  // Middle East & Central Asia
  { origins: ["DEL"], dest: "DXB", name: "Dubai, UAE", baselineInr: 30000, dealThresholdInr: 17000, visa: "Pre-arranged or VoA with US/UK Visa" },
  { origins: ["DEL"], dest: "ALA", name: "Almaty, Kazakhstan", baselineInr: 55000, dealThresholdInr: 32000, visa: "Visa-Free (14 Days)" },
  { origins: ["BOM"], dest: "TBS", name: "Tbilisi, Georgia", baselineInr: 50000, dealThresholdInr: 30000, visa: "eVisa required" },

  // Europe & UK
  { origins: ["BOM"], dest: "CDG", name: "Paris, France", baselineInr: 70000, dealThresholdInr: 42000, visa: "Schengen Visa" },
  { origins: ["DEL"], dest: "MXP", name: "Milan, Italy", baselineInr: 65000, dealThresholdInr: 40000, visa: "Schengen Visa" },
  { origins: ["BOM"], dest: "LHR", name: "London, UK", baselineInr: 75000, dealThresholdInr: 45000, visa: "UK Standard Visitor Visa" },

  // Nearby airport routes
  { origins: ["PNQ"], dest: "BKK", name: "Bangkok via Pune", baselineInr: 32000, dealThresholdInr: 19000, visa: "Visa-Free / VoA" },
  { origins: ["PNQ"], dest: "DXB", name: "Dubai via Pune", baselineInr: 30000, dealThresholdInr: 17000, visa: "Pre-arranged or VoA" },
  { origins: ["CCU"], dest: "BKK", name: "Bangkok via Kolkata", baselineInr: 32000, dealThresholdInr: 19000, visa: "Visa-Free / VoA" },
  { origins: ["CCU"], dest: "SIN", name: "Singapore via Kolkata", baselineInr: 35000, dealThresholdInr: 22000, visa: "eVisa required" },
  { origins: ["TRV"], dest: "KUL", name: "KL via Trivandrum", baselineInr: 30000, dealThresholdInr: 18000, visa: "Visa-Free entry" },
  { origins: ["CCJ"], dest: "SIN", name: "Singapore via Kochi", baselineInr: 35000, dealThresholdInr: 22000, visa: "eVisa required" },
];

// ==========================================
// DATA LAYER
// ==========================================
function ensureDataDir() {
  const dir = path.dirname(CONFIG.alertHistoryPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadJSON(filePath) {
  if (fs.existsSync(filePath)) {
    try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return {}; }
  }
  return {};
}

function saveJSON(filePath, data) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function isRecentDuplicate(history, routeKey, price) {
  const record = history[routeKey];
  if (!record) return false;
  const hoursSince = (Date.now() - record.timestamp) / (1000 * 60 * 60);
  return hoursSince < CONFIG.dedupTtlHours && price >= record.price * 0.95;
}

function updatePriceHistory(priceHistory, routeKey, price) {
  if (!priceHistory[routeKey]) priceHistory[routeKey] = [];
  priceHistory[routeKey].push({ price, timestamp: Date.now() });
  // Keep last 90 days only
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  priceHistory[routeKey] = priceHistory[routeKey].filter(p => p.timestamp > cutoff);
}

function getHistoricalStats(priceHistory, routeKey) {
  const prices = (priceHistory[routeKey] || []).map(p => p.price);
  if (prices.length < 2) return null;
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { avg, min, max, count: prices.length };
}

function getDateStr(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

// ==========================================
// IGNAV FLIGHT API
// ==========================================
async function searchFlights(origin, dest) {
  const apiKey = process.env.IGNAV_API_KEY;
  if (!apiKey) throw new Error("Missing IGNAV_API_KEY in .env");

  let bestFlight = null;
  let bestPrice = Infinity;

  for (const window of CONFIG.dateWindows) {
    const res = await fetch("https://ignav.com/api/fares/round-trip", {
      method: "POST",
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        origin,
        destination: dest,
        departure_date: getDateStr(window.dep),
        return_date: getDateStr(window.ret),
      }),
    });

    if (!res.ok) continue;

    const json = await res.json();
    for (const it of (json.itineraries || [])) {
      const price = it.price?.amount || Infinity;
      if (price < bestPrice) {
        bestPrice = price;
        bestFlight = it;
      }
    }

    await new Promise(r => setTimeout(r, 200));
  }

  return bestFlight;
}

// ==========================================
// SECRET FLYING SCRAPER
// ==========================================
async function fetchSecretFlyingDeals() {
  try {
    const res = await fetch("https://secretflying.com/feed/", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const deals = [];
    const items = xml.split("<item>").slice(1, 6); // Get last 5 posts
    for (const item of items) {
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
                    item.match(/<title>(.*?)<\/title>/)?.[1] || "";
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || "";
      const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
                   item.match(/<description>(.*?)<\/description>/)?.[1] || "";

      // Extract prices mentioned (₹, $, €, £)
      const priceMatch = desc.match(/[₹$€£]\s*[\d,]+/g) || [];

      deals.push({ title: title.trim(), link, prices: priceMatch });
    }
    return deals;
  } catch {
    return [];
  }
}

// ==========================================
// TELEGRAM
// ==========================================
async function sendTelegram(text) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("\n[ALERT]\n" + text + "\n");
    return;
  }
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown", disable_web_page_preview: false }),
  });
}

// ==========================================
// ENGINE
// ==========================================
async function runEngine() {
  console.log(`[${new Date().toISOString()}] Scanning flight deals...\n`);
  ensureDataDir();
  const alertHistory = loadJSON(CONFIG.alertHistoryPath);
  const priceHistory = loadJSON(CONFIG.priceHistoryPath);
  let dispatchedCount = 0;

  // 1. Scan flight routes (with nearby airports)
  for (const route of WATCHED_ROUTES) {
    let bestOverall = null;
    let bestPriceOverall = Infinity;
    let bestOrigin = route.origins[0];

    for (const origin of route.origins) {
      process.stdout.write(`  ${origin} -> ${route.dest}... `);
      const best = await searchFlights(origin, route.dest);
      if (best && (best.price?.amount || Infinity) < bestPriceOverall) {
        bestPriceOverall = best.price.amount;
        bestOverall = best;
        bestOrigin = origin;
      }
    }

    if (!bestOverall) { console.log(`${route.name}: no results`); continue; }

    const priceInr = Math.round(bestOverall.price.amount * CONFIG.usdToInr);
    const routeKey = `${bestOrigin}-${route.dest}`;
    const stats = getHistoricalStats(priceHistory, routeKey);

    // Track price history
    updatePriceHistory(priceHistory, routeKey, priceInr);

    // Calculate deal score
    let dealLabel = "";
    let isDeal = false;

    if (priceInr <= route.dealThresholdInr) {
      isDeal = true;
      const discountPct = Math.round(((route.baselineInr - priceInr) / route.baselineInr) * 100);
      if (discountPct >= 55) dealLabel = "🔥 MISTAKE FARE";
      else if (discountPct >= 45) dealLabel = "🔥 INSANE DEAL";
      else dealLabel = "🚨 FLIGHT DEAL";
    } else if (stats && priceInr <= stats.avg * 0.85) {
      isDeal = true;
      dealLabel = "📉 BELOW AVERAGE";
    }

    if (isDeal) {
      if (isRecentDuplicate(alertHistory, routeKey, priceInr)) {
        console.log(`${route.name}: skip duplicate ₹${priceInr}`);
        continue;
      }

      const discountPct = Math.round(((route.baselineInr - priceInr) / route.baselineInr) * 100);
      const depDate = bestOverall.outbound?.segments?.[0]?.departure_time_local?.split("T")[0] || "TBA";
      const retDate = bestOverall.inbound?.segments?.[0]?.departure_time_local?.split("T")[0] || "TBA";
      const airline = bestOverall.outbound?.carrier || "Multiple";

      const lines = [
        `${dealLabel}`,
        `*${bestOrigin} → ${route.name} (${route.dest})*`,
        ``,
        `💰 *₹${priceInr.toLocaleString("en-IN")}* round-trip`,
      ];

      if (discountPct > 0) lines.push(`📊 Typical: ₹${route.baselineInr.toLocaleString("en-IN")} (*${discountPct}% off*)`);
      if (stats) lines.push(`📈 History: avg ₹${stats.avg.toLocaleString("en-IN")} | low ₹${stats.min.toLocaleString("en-IN")}`);
      lines.push(``, `🗓️ ${depDate} → ${retDate}`, `✈️ ${airline}`, `🛂 ${route.visa}`);

      await sendTelegram(lines.join("\n"));
      dispatchedCount++;
      alertHistory[routeKey] = { price: priceInr, timestamp: Date.now() };
      console.log(`${route.name}: ${dealLabel} ₹${priceInr}`);
    } else {
      console.log(`${route.name}: ₹${priceInr}`);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  // 2. Fetch Secret Flying deals
  console.log(`\nFetching Secret Flying deals...`);
  const sfDeals = await fetchSecretFlyingDeals();
  if (sfDeals.length > 0) {
    const sfKey = "secret-flying";
    if (!isRecentDuplicate(alertHistory, sfKey, 0)) {
      const lines = [`🌐 *SECRET FLYING - Latest Deals*`, ``];
      for (const deal of sfDeals.slice(0, 3)) {
        lines.push(`• ${deal.title}`);
        if (deal.prices.length) lines.push(`  ${deal.prices.join(" | ")}`);
        lines.push(`  [Link](${deal.link})`, ``);
      }
      await sendTelegram(lines.join("\n"));
      dispatchedCount++;
      alertHistory[sfKey] = { price: 0, timestamp: Date.now() };
    }
  }

  saveJSON(CONFIG.alertHistoryPath, alertHistory);
  saveJSON(CONFIG.priceHistoryPath, priceHistory);
  console.log(`\nDone. Sent ${dispatchedCount} alerts.`);
}

// ==========================================
// CLI: Search a specific route on demand
// ==========================================
const args = process.argv.slice(2);
const routeArg = args.find(a => a.startsWith("--route="))?.split("=")[1];

if (routeArg) {
  const [origin, dest] = routeArg.toUpperCase().split("-");
  if (!origin || !dest) {
    console.error("Usage: node scanner.js --route=DEL-BKK");
    process.exit(1);
  }

  console.log(`\nSearching ${origin} → ${dest} across 4 weeks...\n`);

  (async () => {
    const apiKey = process.env.IGNAV_API_KEY;
    if (!apiKey) throw new Error("Missing IGNAV_API_KEY");

    let bestFlight = null;
    let bestPrice = Infinity;
    let bestDep = "";

    for (let w = 1; w <= 4; w++) {
      const dep = getDateStr(w * 7);
      const ret = getDateStr(w * 7 + 7);
      process.stdout.write(`  Week ${w} (${dep} → ${ret})... `);

      const res = await fetch("https://ignav.com/api/fares/round-trip", {
        method: "POST",
        headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination: dest, departure_date: dep, return_date: ret }),
      });

      if (!res.ok) { console.log("error"); continue; }

      const json = await res.json();
      const itins = json.itineraries || [];
      console.log(`${itins.length} fares`);

      for (const it of itins) {
        const p = it.price?.amount || Infinity;
        if (p < bestPrice) {
          bestPrice = p;
          bestFlight = it;
          bestDep = dep;
        }
      }
      await new Promise(r => setTimeout(r, 300));
    }

    if (!bestFlight) {
      console.log("\nNo fares found.");
      return;
    }

    const priceInr = Math.round(bestPrice * CONFIG.usdToInr);
    const depDate = bestFlight.outbound?.segments?.[0]?.departure_time_local?.split("T")[0] || "TBA";
    const retDate = bestFlight.inbound?.segments?.[0]?.departure_time_local?.split("T")[0] || "TBA";
    const airline = bestFlight.outbound?.carrier || "Multiple";
    const stops = bestFlight.outbound?.segments?.length - 1 || 0;

    console.log(`\n========================================`);
    console.log(`BEST FARE: ${origin} → ${dest}`);
    console.log(`========================================`);
    console.log(`Price:     ₹${priceInr.toLocaleString("en-IN")} round-trip`);
    console.log(`Dates:     ${depDate} → ${retDate}`);
    console.log(`Airline:   ${airline}`);
    console.log(`Stops:     ${stops === 0 ? "Nonstop" : stops + " stop(s)"}`);
    console.log(`========================================\n`);

    // Also send to Telegram
    const msg = [
      `🔍 *Route Search: ${origin} → ${dest}*`,
      ``,
      `💰 *₹${priceInr.toLocaleString("en-IN")}* round-trip`,
      `🗓️ ${depDate} → ${retDate}`,
      `✈️ ${airline}`,
      `🚦 ${stops === 0 ? "Nonstop" : stops + " stop(s)"}`,
    ].join("\n");
    await sendTelegram(msg);
    console.log("Sent to Telegram.");
  })().catch(err => {
    console.error("Error:", err.message);
    process.exit(1);
  });

} else {
  // Normal scheduled scan
  runEngine().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
