import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// ==========================================
// CONFIGURATION
// ==========================================
const CONFIG = {
  usdToInr: 95.0,
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
// WATCHED ROUTES — Mumbai first, then Delhi, then others
// ==========================================
const WATCHED_ROUTES = [
  // ===== MUMBAI (BOM) FIRST =====
  { origins: ["BOM"], dest: "BKK", name: "Bangkok", baselineInr: 32000, dealThresholdInr: 19000, visa: "Visa-Free / VoA" },
  { origins: ["BOM"], dest: "SIN", name: "Singapore", baselineInr: 35000, dealThresholdInr: 22000, visa: "eVisa required" },
  { origins: ["BOM"], dest: "KUL", name: "Kuala Lumpur", baselineInr: 30000, dealThresholdInr: 18000, visa: "Visa-Free entry" },
  { origins: ["BOM"], dest: "DPS", name: "Bali, Indonesia", baselineInr: 38000, dealThresholdInr: 24000, visa: "Visa on Arrival (30 Days)" },
  { origins: ["BOM"], dest: "HAN", name: "Hanoi, Vietnam", baselineInr: 35000, dealThresholdInr: 22000, visa: "30-day eVisa" },
  { origins: ["BOM"], dest: "SGN", name: "Ho Chi Minh, Vietnam", baselineInr: 35000, dealThresholdInr: 22000, visa: "30-day eVisa" },
  { origins: ["BOM"], dest: "PNH", name: "Phnom Penh, Cambodia", baselineInr: 38000, dealThresholdInr: 24000, visa: "eVisa / VoA" },
  { origins: ["BOM"], dest: "MLE", name: "Malé, Maldives", baselineInr: 35000, dealThresholdInr: 22000, visa: "Visa on Arrival (30 Days)" },
  { origins: ["BOM"], dest: "CMB", name: "Colombo, Sri Lanka", baselineInr: 22000, dealThresholdInr: 14000, visa: "ETA required" },
  { origins: ["BOM"], dest: "NRT", name: "Tokyo, Japan", baselineInr: 65000, dealThresholdInr: 38000, visa: "eVisa required" },
  { origins: ["BOM"], dest: "ICN", name: "Seoul, South Korea", baselineInr: 45000, dealThresholdInr: 28000, visa: "Standard Tourist Visa" },
  { origins: ["BOM"], dest: "TPE", name: "Taipei, Taiwan", baselineInr: 45000, dealThresholdInr: 28000, visa: "Visa-Free (30 Days)" },
  { origins: ["BOM"], dest: "HKG", name: "Hong Kong", baselineInr: 38000, dealThresholdInr: 24000, visa: "Visa-Free (7 Days)" },
  { origins: ["BOM"], dest: "DXB", name: "Dubai, UAE", baselineInr: 30000, dealThresholdInr: 17000, visa: "Pre-arranged or VoA" },
  { origins: ["BOM"], dest: "DOH", name: "Doha, Qatar", baselineInr: 28000, dealThresholdInr: 17000, visa: "Visa on Arrival" },
  { origins: ["BOM"], dest: "MCT", name: "Muscat, Oman", baselineInr: 28000, dealThresholdInr: 17000, visa: "eVisa required" },
  { origins: ["BOM"], dest: "IST", name: "Istanbul, Turkey", baselineInr: 45000, dealThresholdInr: 28000, visa: "eVisa required" },
  { origins: ["BOM"], dest: "TBS", name: "Tbilisi, Georgia", baselineInr: 50000, dealThresholdInr: 30000, visa: "eVisa required" },
  { origins: ["BOM"], dest: "ALA", name: "Almaty, Kazakhstan", baselineInr: 55000, dealThresholdInr: 32000, visa: "Visa-Free (14 Days)" },
  { origins: ["BOM"], dest: "TAS", name: "Tashkent, Uzbekistan", baselineInr: 45000, dealThresholdInr: 28000, visa: "Visa-Free (30 Days)" },
  { origins: ["BOM"], dest: "CDG", name: "Paris, France", baselineInr: 70000, dealThresholdInr: 42000, visa: "Schengen Visa" },
  { origins: ["BOM"], dest: "LHR", name: "London, UK", baselineInr: 75000, dealThresholdInr: 45000, visa: "UK Standard Visitor Visa" },
  { origins: ["BOM"], dest: "FCO", name: "Rome, Italy", baselineInr: 65000, dealThresholdInr: 40000, visa: "Schengen Visa" },
  { origins: ["BOM"], dest: "BCN", name: "Barcelona, Spain", baselineInr: 68000, dealThresholdInr: 42000, visa: "Schengen Visa" },
  { origins: ["BOM"], dest: "LIS", name: "Lisbon, Portugal", baselineInr: 65000, dealThresholdInr: 40000, visa: "Schengen Visa" },
  { origins: ["BOM"], dest: "AMS", name: "Amsterdam, Netherlands", baselineInr: 68000, dealThresholdInr: 42000, visa: "Schengen Visa" },
  { origins: ["BOM"], dest: "ZRH", name: "Zurich, Switzerland", baselineInr: 72000, dealThresholdInr: 45000, visa: "Schengen Visa" },
  { origins: ["BOM"], dest: "MRU", name: "Mauritius", baselineInr: 55000, dealThresholdInr: 35000, visa: "Visa on Arrival (60 Days)" },
  { origins: ["BOM"], dest: "JFK", name: "New York, USA", baselineInr: 85000, dealThresholdInr: 55000, visa: "US Visa" },
  { origins: ["BOM"], dest: "LAX", name: "Los Angeles, USA", baselineInr: 85000, dealThresholdInr: 55000, visa: "US Visa" },

  // ===== DELHI (DEL) SECOND =====
  { origins: ["DEL"], dest: "BKK", name: "Bangkok", baselineInr: 32000, dealThresholdInr: 19000, visa: "Visa-Free / VoA" },
  { origins: ["DEL"], dest: "SIN", name: "Singapore", baselineInr: 35000, dealThresholdInr: 22000, visa: "eVisa required" },
  { origins: ["DEL"], dest: "KUL", name: "Kuala Lumpur", baselineInr: 30000, dealThresholdInr: 18000, visa: "Visa-Free entry" },
  { origins: ["DEL"], dest: "DPS", name: "Bali, Indonesia", baselineInr: 38000, dealThresholdInr: 24000, visa: "Visa on Arrival (30 Days)" },
  { origins: ["DEL"], dest: "HAN", name: "Hanoi, Vietnam", baselineInr: 35000, dealThresholdInr: 22000, visa: "30-day eVisa" },
  { origins: ["DEL"], dest: "PNH", name: "Phnom Penh, Cambodia", baselineInr: 38000, dealThresholdInr: 24000, visa: "eVisa / VoA" },
  { origins: ["DEL"], dest: "MLE", name: "Malé, Maldives", baselineInr: 35000, dealThresholdInr: 22000, visa: "Visa on Arrival (30 Days)" },
  { origins: ["DEL"], dest: "CMB", name: "Colombo, Sri Lanka", baselineInr: 22000, dealThresholdInr: 14000, visa: "ETA required" },
  { origins: ["DEL"], dest: "NRT", name: "Tokyo, Japan", baselineInr: 65000, dealThresholdInr: 38000, visa: "eVisa required" },
  { origins: ["DEL"], dest: "ICN", name: "Seoul, South Korea", baselineInr: 45000, dealThresholdInr: 28000, visa: "Standard Tourist Visa" },
  { origins: ["DEL"], dest: "PEK", name: "Beijing, China", baselineInr: 50000, dealThresholdInr: 30000, visa: "Chinese Visa" },
  { origins: ["DEL"], dest: "TPE", name: "Taipei, Taiwan", baselineInr: 45000, dealThresholdInr: 28000, visa: "Visa-Free (30 Days)" },
  { origins: ["DEL"], dest: "HKG", name: "Hong Kong", baselineInr: 38000, dealThresholdInr: 24000, visa: "Visa-Free (7 Days)" },
  { origins: ["DEL"], dest: "DXB", name: "Dubai, UAE", baselineInr: 30000, dealThresholdInr: 17000, visa: "Pre-arranged or VoA" },
  { origins: ["DEL"], dest: "DOH", name: "Doha, Qatar", baselineInr: 28000, dealThresholdInr: 17000, visa: "Visa on Arrival" },
  { origins: ["DEL"], dest: "AUH", name: "Abu Dhabi, UAE", baselineInr: 30000, dealThresholdInr: 18000, visa: "Pre-arranged or VoA" },
  { origins: ["DEL"], dest: "MCT", name: "Muscat, Oman", baselineInr: 28000, dealThresholdInr: 17000, visa: "eVisa required" },
  { origins: ["DEL"], dest: "BAH", name: "Bahrain", baselineInr: 28000, dealThresholdInr: 17000, visa: "eVisa / VoA" },
  { origins: ["DEL"], dest: "KWI", name: "Kuwait", baselineInr: 25000, dealThresholdInr: 15000, visa: "eVisa required" },
  { origins: ["DEL"], dest: "RUH", name: "Riyadh, Saudi Arabia", baselineInr: 30000, dealThresholdInr: 18000, visa: "eVisa / Umrah Visa" },
  { origins: ["DEL"], dest: "JED", name: "Jeddah, Saudi Arabia", baselineInr: 30000, dealThresholdInr: 18000, visa: "eVisa / Umrah Visa" },
  { origins: ["DEL"], dest: "ALA", name: "Almaty, Kazakhstan", baselineInr: 55000, dealThresholdInr: 32000, visa: "Visa-Free (14 Days)" },
  { origins: ["DEL"], dest: "NQZ", name: "Astana, Kazakhstan", baselineInr: 55000, dealThresholdInr: 33000, visa: "Visa-Free (14 Days)" },
  { origins: ["DEL"], dest: "TAS", name: "Tashkent, Uzbekistan", baselineInr: 45000, dealThresholdInr: 28000, visa: "Visa-Free (30 Days)" },
  { origins: ["DEL"], dest: "SKD", name: "Samarkand, Uzbekistan", baselineInr: 48000, dealThresholdInr: 30000, visa: "Visa-Free (30 Days)" },
  { origins: ["DEL"], dest: "FRU", name: "Bishkek, Kyrgyzstan", baselineInr: 45000, dealThresholdInr: 28000, visa: "Visa-Free (30 Days)" },
  { origins: ["DEL"], dest: "DYU", name: "Dushanbe, Tajikistan", baselineInr: 45000, dealThresholdInr: 28000, visa: "eVisa required" },
  { origins: ["DEL"], dest: "TBS", name: "Tbilisi, Georgia", baselineInr: 50000, dealThresholdInr: 30000, visa: "eVisa required" },
  { origins: ["DEL"], dest: "EVN", name: "Yerevan, Armenia", baselineInr: 45000, dealThresholdInr: 28000, visa: "Visa on Arrival (120 Days)" },
  { origins: ["DEL"], dest: "GYD", name: "Baku, Azerbaijan", baselineInr: 40000, dealThresholdInr: 25000, visa: "eVisa required" },
  { origins: ["DEL"], dest: "IST", name: "Istanbul, Turkey", baselineInr: 45000, dealThresholdInr: 28000, visa: "eVisa required" },
  { origins: ["DEL"], dest: "CDG", name: "Paris, France", baselineInr: 70000, dealThresholdInr: 42000, visa: "Schengen Visa" },
  { origins: ["DEL"], dest: "LHR", name: "London, UK", baselineInr: 75000, dealThresholdInr: 45000, visa: "UK Standard Visitor Visa" },
  { origins: ["DEL"], dest: "MXP", name: "Milan, Italy", baselineInr: 65000, dealThresholdInr: 40000, visa: "Schengen Visa" },
  { origins: ["DEL"], dest: "FRA", name: "Frankfurt, Germany", baselineInr: 65000, dealThresholdInr: 40000, visa: "Schengen Visa" },
  { origins: ["DEL"], dest: "AMS", name: "Amsterdam, Netherlands", baselineInr: 68000, dealThresholdInr: 42000, visa: "Schengen Visa" },
  { origins: ["DEL"], dest: "ZRH", name: "Zurich, Switzerland", baselineInr: 72000, dealThresholdInr: 45000, visa: "Schengen Visa" },
  { origins: ["DEL"], dest: "VIE", name: "Vienna, Austria", baselineInr: 60000, dealThresholdInr: 38000, visa: "Schengen Visa" },
  { origins: ["DEL"], dest: "PRG", name: "Prague, Czech Republic", baselineInr: 58000, dealThresholdInr: 36000, visa: "Schengen Visa" },
  { origins: ["DEL"], dest: "ATH", name: "Athens, Greece", baselineInr: 58000, dealThresholdInr: 36000, visa: "Schengen Visa" },
  { origins: ["DEL"], dest: "BUD", name: "Budapest, Hungary", baselineInr: 55000, dealThresholdInr: 35000, visa: "Schengen Visa" },
  { origins: ["DEL"], dest: "SVO", name: "Moscow, Russia", baselineInr: 55000, dealThresholdInr: 35000, visa: "eVisa required" },
  { origins: ["DEL"], dest: "JNB", name: "Johannesburg, South Africa", baselineInr: 55000, dealThresholdInr: 35000, visa: "eVisa required" },
  { origins: ["DEL"], dest: "JFK", name: "New York, USA", baselineInr: 85000, dealThresholdInr: 55000, visa: "US Visa" },
  { origins: ["DEL"], dest: "LAX", name: "Los Angeles, USA", baselineInr: 85000, dealThresholdInr: 55000, visa: "US Visa" },
  { origins: ["DEL"], dest: "YYZ", name: "Toronto, Canada", baselineInr: 75000, dealThresholdInr: 48000, visa: "Canada Visa" },

  // ===== OTHER CITIES THIRD =====
  { origins: ["BLR"], dest: "SIN", name: "Singapore via Bangalore", baselineInr: 35000, dealThresholdInr: 22000, visa: "eVisa required" },
  { origins: ["BLR"], dest: "BKK", name: "Bangkok via Bangalore", baselineInr: 32000, dealThresholdInr: 19000, visa: "Visa-Free / VoA" },
  { origins: ["BLR"], dest: "DXB", name: "Dubai via Bangalore", baselineInr: 30000, dealThresholdInr: 17000, visa: "Pre-arranged or VoA" },
  { origins: ["MAA"], dest: "KUL", name: "KL via Chennai", baselineInr: 30000, dealThresholdInr: 18000, visa: "Visa-Free entry" },
  { origins: ["MAA"], dest: "SIN", name: "Singapore via Chennai", baselineInr: 35000, dealThresholdInr: 22000, visa: "eVisa required" },
  { origins: ["HYD"], dest: "SIN", name: "Singapore via Hyderabad", baselineInr: 35000, dealThresholdInr: 22000, visa: "eVisa required" },
  { origins: ["HYD"], dest: "DXB", name: "Dubai via Hyderabad", baselineInr: 30000, dealThresholdInr: 17000, visa: "Pre-arranged or VoA" },
  { origins: ["CCU"], dest: "BKK", name: "Bangkok via Kolkata", baselineInr: 32000, dealThresholdInr: 19000, visa: "Visa-Free / VoA" },
  { origins: ["CCU"], dest: "SIN", name: "Singapore via Kolkata", baselineInr: 35000, dealThresholdInr: 22000, visa: "eVisa required" },
  { origins: ["PNQ"], dest: "BKK", name: "Bangkok via Pune", baselineInr: 32000, dealThresholdInr: 19000, visa: "Visa-Free / VoA" },
  { origins: ["PNQ"], dest: "DXB", name: "Dubai via Pune", baselineInr: 30000, dealThresholdInr: 17000, visa: "Pre-arranged or VoA" },
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
  const apiKey = process.env.FLIGHTAPI_KEY;
  if (!apiKey) throw new Error("Missing FLIGHTAPI_KEY in .env — sign up at https://api.flightapi.io");

  let bestFlight = null;
  let bestPrice = Infinity;

  for (const window of CONFIG.dateWindows) {
    const dep = getDateStr(window.dep);
    const ret = getDateStr(window.ret);
    const url = `https://api.flightapi.io/roundtrip/${apiKey}/${origin}/${dest}/${dep}/${ret}/1/0/0/Economy/INR`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      const itins = json.itineraries || [];
      for (const it of itins) {
        const price = it.pricing_options?.[0]?.price?.amount || Infinity;
        if (price < bestPrice) {
          bestPrice = price;
          bestFlight = it;
          bestFlight._legs = json.legs || [];
          bestFlight._segments = json.segments || [];
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 500));
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
      if (best) {
        const price = best.pricing_options?.[0]?.price?.amount || Infinity;
        if (price < bestPriceOverall) {
          bestPriceOverall = price;
          bestOverall = best;
          bestOrigin = origin;
        }
      }
    }

    if (!bestOverall) { console.log(`${route.name}: no results`); continue; }

    const priceInr = Math.round(bestOverall.pricing_options[0].price.amount);
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
      const depLeg = bestOverall._legs?.[0];
      const retLeg = bestOverall._legs?.[1];
      const depDate = depLeg?.departureDateTime?.split("T")[0] || "TBA";
      const retDate = retLeg?.departureDateTime?.split("T")[0] || "TBA";
      const airline = depLeg?.airlineCodes?.[0] || "Multiple";

      const lines = [
        `${dealLabel}`,
        `*${bestOrigin} → ${route.name} (${route.dest})*`,
        ``,
        `💰 *₹${priceInr.toLocaleString("en-IN")}* round-trip`,
      ];

      if (discountPct > 0) lines.push(`📊 Typical: ₹${route.baselineInr.toLocaleString("en-IN")} (*${discountPct}% off*)`);
      if (stats) lines.push(`📈 History: avg ₹${stats.avg.toLocaleString("en-IN")} | low ₹${stats.min.toLocaleString("en-IN")}`);
      lines.push(``, `🗓️ ${depDate} → ${retDate}`, `✈️ ${airline}`, `🛂 ${route.visa}`);

      const gfLink = `https://www.google.com/travel/flights?q=Flights+to+${route.dest}+from+${bestOrigin}`;
      lines.push(``, `[Book on Google Flights](${gfLink})`);

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
const oneWay = args.includes("--oneway");

if (routeArg) {
  const [origin, dest] = routeArg.toUpperCase().split("-");
  if (!origin || !dest) {
    console.error("Usage: node scanner.js --route=DEL-BKK [--oneway]");
    process.exit(1);
  }

  const label = oneWay ? "one-way" : "round-trip";
  console.log(`\nSearching ${origin} → ${dest} (${label}) across 4 weeks...\n`);

  (async () => {
    const apiKey = process.env.IGNAV_API_KEY;
    if (!apiKey) throw new Error("Missing IGNAV_API_KEY");

    let bestFlight = null;
    let bestPrice = Infinity;
    let bestDep = "";

    for (let w = 1; w <= 4; w++) {
      const dep = getDateStr(w * 7);
      const ret = getDateStr(w * 7 + 7);
      process.stdout.write(`  Week ${w} (${dep})... `);

      try {
        const url = oneWay
          ? `https://api.flightapi.io/onewaytrip/${apiKey}/${origin}/${dest}/${dep}/1/0/0/Economy/INR`
          : `https://api.flightapi.io/roundtrip/${apiKey}/${origin}/${dest}/${dep}/${ret}/1/0/0/Economy/INR`;

        const res = await fetch(url);
        if (!res.ok) { console.log("error"); continue; }

        const json = await res.json();
        const itins = json.itineraries || [];
        console.log(`${itins.length} fares`);

        for (const it of itins) {
          const p = it.pricing_options?.[0]?.price?.amount || Infinity;
          if (p < bestPrice) {
            bestPrice = p;
            bestFlight = it;
            bestFlight._legs = json.legs || [];
            bestDep = dep;
          }
        }
      } catch { console.log("error"); }
      await new Promise(r => setTimeout(r, 500));
    }

    if (!bestFlight) {
      console.log("\nNo fares found.");
      return;
    }

    const priceInr = Math.round(bestPrice);
    const depLeg = bestFlight._legs?.[0];
    const retLeg = bestFlight._legs?.[1];
    const depDate = depLeg?.departureDateTime?.split("T")[0] || "TBA";
    const retDate = retLeg?.departureDateTime?.split("T")[0] || "TBA";
    const airline = depLeg?.airlineCodes?.[0] || "Multiple";
    const stops = depLeg?.stopoversCount || 0;

    console.log(`\n========================================`);
    console.log(`BEST FARE: ${origin} → ${dest} (${label})`);
    console.log(`========================================`);
    console.log(`Price:     ₹${priceInr.toLocaleString("en-IN")}`);
    console.log(`Date:      ${depDate}${oneWay ? "" : " → " + retDate}`);
    console.log(`Airline:   ${airline}`);
    console.log(`Stops:     ${stops === 0 ? "Nonstop" : stops + " stop(s)"}`);
    console.log(`========================================\n`);

    const gfLink = `https://www.google.com/travel/flights?q=Flights+to+${dest}+from+${origin}`;
    const msg = [
      `🔍 *Route Search: ${origin} → ${dest}* (${label})`,
      ``,
      `💰 *₹${priceInr.toLocaleString("en-IN")}*`,
      `🗓️ ${depDate}${oneWay ? "" : " → " + retDate}`,
      `✈️ ${airline}`,
      `🚦 ${stops === 0 ? "Nonstop" : stops + " stop(s)"}`,
      ``,
      `[Book on Google Flights](${gfLink})`,
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
