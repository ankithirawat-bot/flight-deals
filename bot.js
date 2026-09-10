import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const CONFIG = {
  usdToInr: 84.0,
  priceHistoryPath: path.resolve("./data/price_history.json"),
};

// ==========================================
// HELPERS
// ==========================================
function getDateStr(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

function loadJSON(filePath) {
  if (fs.existsSync(filePath)) {
    try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return {}; }
  }
  return {};
}

function getHistoricalStats(priceHistory, routeKey) {
  const prices = (priceHistory[routeKey] || []).map(p => p.price);
  if (prices.length < 2) return null;
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const min = Math.min(...prices);
  return { avg, min, count: prices.length };
}

// ==========================================
// FLIGHT SEARCH
// ==========================================
async function searchFlights(origin, dest) {
  const apiKey = process.env.IGNAV_API_KEY;
  if (!apiKey) throw new Error("Missing IGNAV_API_KEY");

  let bestFlight = null;
  let bestPrice = Infinity;

  for (let w = 1; w <= 4; w++) {
    const dep = getDateStr(w * 7);
    const ret = getDateStr(w * 7 + 7);

    try {
      const res = await fetch("https://ignav.com/api/fares/round-trip", {
        method: "POST",
        headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination: dest, departure_date: dep, return_date: ret }),
      });

      if (!res.ok) continue;

      const json = await res.json();
      for (const it of (json.itineraries || [])) {
        const p = it.price?.amount || Infinity;
        if (p < bestPrice) { bestPrice = p; bestFlight = it; }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }

  return bestFlight;
}

// ==========================================
// TELEGRAM BOT
// ==========================================
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId, text, parseMode = "Markdown") {
  await fetch(`${API_URL}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode, disable_web_page_preview: false }),
  });
}

async function getUpdates(offset) {
  const res = await fetch(`${API_URL}/getUpdates?offset=${offset}&timeout=30`);
  return res.json();
}

// ==========================================
// COMMAND HANDLER
// ==========================================
async function handleCommand(chatId, text) {
  const msg = text.trim().toUpperCase().replace(/\s+/g, "-");

  // Parse route: DEL-BKK or DEL BKK or DEL->BKK
  const match = msg.match(/^([A-Z]{3})[\s\-\>→]+([A-Z]{3})$/);
  if (!match) {
    await sendMessage(chatId, [
      `🔍 *How to search:*`,
      ``,
      `Just type a route:`,
      `  DEL BKK`,
      `  BOM-LHR`,
      `  BLR → SIN`,
      ``,
      `Or use /search DEL-BKK`,
      `Or /all to scan all routes`,
    ].join("\n"));
    return;
  }

  const [, origin, dest] = match;
  await sendMessage(chatId, `Searching ${origin} → ${dest} across 4 weeks...`);

  const best = await searchFlights(origin, dest);
  if (!best) {
    await sendMessage(chatId, `No fares found for ${origin} → ${dest}`);
    return;
  }

  const priceInr = Math.round(best.price.amount * CONFIG.usdToInr);
  const depDate = best.outbound?.segments?.[0]?.departure_time_local?.split("T")[0] || "TBA";
  const retDate = best.inbound?.segments?.[0]?.departure_time_local?.split("T")[0] || "TBA";
  const airline = best.outbound?.carrier || "Multiple";
  const stops = (best.outbound?.segments?.length || 1) - 1;

  const priceHistory = loadJSON(CONFIG.priceHistoryPath);
  const stats = getHistoricalStats(priceHistory, `${origin}-${dest}`);

  const lines = [
    `✅ *${origin} → ${dest}*`,
    ``,
    `💰 *₹${priceInr.toLocaleString("en-IN")}* round-trip`,
    `🗓️ ${depDate} → ${retDate}`,
    `✈️ ${airline}`,
    `🚦 ${stops === 0 ? "Nonstop" : stops + " stop(s)"}`,
  ];

  if (stats) {
    lines.push(`📈 History: avg ₹${stats.avg.toLocaleString("en-IN")} | low ₹${stats.min.toLocaleString("en-IN")}`);
    if (priceInr < stats.avg * 0.85) lines.push(`🔥 *Below average price!*`);
  }

  await sendMessage(chatId, lines.join("\n"));
}

// ==========================================
// BOT POLLING LOOP
// ==========================================
async function runBot() {
  console.log("Bot started. Listening for messages...");
  let offset = 0;

  while (true) {
    try {
      const data = await getUpdates(offset);
      if (!data.ok) {
        console.error("getUpdates failed:", data);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      for (const update of data.result) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg?.text) continue;

        const chatId = msg.chat.id;
        const text = msg.text;

        console.log(`[${msg.from?.first_name || chatId}] ${text}`);

        if (text === "/start" || text === "/help") {
          await sendMessage(chatId, [
            `✈️ *Flight Deal Bot*`,
            ``,
            `Type any route to search:`,
            `  DEL BKK`,
            `  BOM-LHR`,
            `  BLR → SIN`,
            ``,
            `I'll find the cheapest round-trip fare across 4 weeks and send you the deal.`,
          ].join("\n"));
        } else {
          await handleCommand(chatId, text);
        }
      }
    } catch (err) {
      console.error("Polling error:", err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

runBot();
