import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const CONFIG = {
  usdToInr: 84.0,
  historyFilePath: path.resolve("./deals_cache.json"),
  dedupTtlHours: 48,
};

const WATCHED_ROUTES = [
  // Southeast Asia
  { origin: "BOM", dest: "DPS", name: "Bali, Indonesia", baselineInr: 38000, dealThresholdInr: 24000, visa: "Visa on Arrival (30 Days)" },
  { origin: "DEL", dest: "BKK", name: "Bangkok, Thailand", baselineInr: 32000, dealThresholdInr: 19000, visa: "Visa-Free / VoA" },
  { origin: "BLR", dest: "SIN", name: "Singapore", baselineInr: 35000, dealThresholdInr: 22000, visa: "eVisa required" },
  { origin: "MAA", dest: "KUL", name: "Kuala Lumpur, Malaysia", baselineInr: 30000, dealThresholdInr: 18000, visa: "Visa-Free entry" },
  { origin: "BOM", dest: "HAN", name: "Hanoi, Vietnam", baselineInr: 35000, dealThresholdInr: 22000, visa: "30-day eVisa" },

  // East Asia
  { origin: "BOM", dest: "NRT", name: "Tokyo, Japan", baselineInr: 65000, dealThresholdInr: 38000, visa: "eVisa required" },
  { origin: "DEL", dest: "ICN", name: "Seoul, South Korea", baselineInr: 45000, dealThresholdInr: 28000, visa: "Standard Tourist Visa" },

  // Middle East & Central Asia
  { origin: "DEL", dest: "DXB", name: "Dubai, UAE", baselineInr: 30000, dealThresholdInr: 17000, visa: "Pre-arranged or VoA with US/UK Visa" },
  { origin: "DEL", dest: "ALA", name: "Almaty, Kazakhstan", baselineInr: 55000, dealThresholdInr: 32000, visa: "Visa-Free (14 Days)" },
  { origin: "BOM", dest: "TBS", name: "Tbilisi, Georgia", baselineInr: 50000, dealThresholdInr: 30000, visa: "eVisa required" },

  // Europe & UK
  { origin: "BOM", dest: "CDG", name: "Paris, France", baselineInr: 70000, dealThresholdInr: 42000, visa: "Schengen Visa" },
  { origin: "DEL", dest: "MXP", name: "Milan, Italy", baselineInr: 65000, dealThresholdInr: 40000, visa: "Schengen Visa" },
  { origin: "BOM", dest: "LHR", name: "London, UK", baselineInr: 75000, dealThresholdInr: 45000, visa: "UK Standard Visitor Visa" }
];

function loadAlertHistory() {
  if (fs.existsSync(CONFIG.historyFilePath)) {
    try { return JSON.parse(fs.readFileSync(CONFIG.historyFilePath, "utf8")); } catch { return {}; }
  }
  return {};
}

function saveAlertHistory(history) {
  fs.writeFileSync(CONFIG.historyFilePath, JSON.stringify(history, null, 2), "utf8");
}

function isRecentDuplicate(history, routeKey, price) {
  const record = history[routeKey];
  if (!record) return false;
  const hoursSince = (Date.now() - record.timestamp) / (1000 * 60 * 60);
  return hoursSince < CONFIG.dedupTtlHours && price >= record.price * 0.95;
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
  if (!apiKey) throw new Error("Missing IGNAV_API_KEY in .env — sign up at https://ignav.com");

  let bestFlight = null;
  let bestPrice = Infinity;

  // Search across multiple departure dates (next 3-4 weeks)
  for (let weekOffset = 2; weekOffset <= 3; weekOffset++) {
    const depDate = getDateStr(weekOffset * 7);
    const retDate = getDateStr(weekOffset * 7 + 7);

    const res = await fetch("https://ignav.com/api/fares/round-trip", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        origin,
        destination: dest,
        departure_date: depDate,
        return_date: retDate,
      }),
    });

    if (!res.ok) continue;

    const json = await res.json();
    const itineraries = json.itineraries || [];

    for (const it of itineraries) {
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
  const alertHistory = loadAlertHistory();
  let dispatchedCount = 0;

  for (const route of WATCHED_ROUTES) {
    process.stdout.write(`${route.origin} -> ${route.dest} (${route.name})... `);
    const best = await searchFlights(route.origin, route.dest);
    if (!best) { console.log("no results"); continue; }

    const priceInr = Math.round(best.price.amount * CONFIG.usdToInr);
    const routeKey = `${route.origin}-${route.dest}`;

    if (priceInr <= route.dealThresholdInr) {
      if (isRecentDuplicate(alertHistory, routeKey, priceInr)) {
        console.log(`skip (₹${priceInr})`);
        continue;
      }

      const discountPct = Math.round(((route.baselineInr - priceInr) / route.baselineInr) * 100);
      const isMistakeFare = discountPct >= 55;
      const depDate = best.outbound?.segments?.[0]?.departure_time_local?.split("T")[0] || "TBA";
      const airline = best.outbound?.carrier || "Multiple";

      const msg = [
        `${isMistakeFare ? "🔥 *MISTAKE FARE*" : "🚨 *FLIGHT DEAL*"}`,
        `*${route.origin} → ${route.name} (${route.dest})*`,
        ``,
        `💰 *₹${priceInr.toLocaleString("en-IN")}* round-trip (*${discountPct}% off*)`,
        `📊 Typical: ₹${route.baselineInr.toLocaleString("en-IN")}`,
        `🗓️ ${depDate}`,
        `✈️ ${airline}`,
        `🛂 ${route.visa}`,
      ].join("\n");

      await sendTelegram(msg);
      dispatchedCount++;
      alertHistory[routeKey] = { price: priceInr, timestamp: Date.now() };
      console.log(`DEAL ₹${priceInr}`);
    } else {
      console.log(`₹${priceInr} (no deal)`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  saveAlertHistory(alertHistory);
  console.log(`\nDone. Sent ${dispatchedCount} deal alerts.`);
}

runEngine().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
