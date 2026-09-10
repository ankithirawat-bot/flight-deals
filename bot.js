import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const CONFIG = {
  usdToInr: 95.0,
  priceHistoryPath: path.resolve("./data/price_history.json"),
};

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

async function searchFlights(origin, dest, type = "round") {
  const apiKey = process.env.FLIGHTAPI_KEY;
  if (!apiKey) throw new Error("Missing FLIGHTAPI_KEY in .env");

  let bestFlight = null;
  let bestPrice = Infinity;

  for (let w = 1; w <= 4; w++) {
    const dep = getDateStr(w * 7);
    const ret = getDateStr(w * 7 + 7);

    try {
      const url = type === "oneway"
        ? `https://api.flightapi.io/onewaytrip/${apiKey}/${origin}/${dest}/${dep}/1/0/0/Economy/INR`
        : `https://api.flightapi.io/roundtrip/${apiKey}/${origin}/${dest}/${dep}/${ret}/1/0/0/Economy/INR`;

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
          bestFlight._carriers = json.carriers || {};
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

  return bestFlight;
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: false }),
  });
}

async function getUpdates(offset) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`);
  return res.json();
}

async function handleCommand(chatId, text) {
  const clean = text.trim().toUpperCase();

  // Check for one-way: "oneway DEL BKK" or "ow DEL-BKK"
  let type = "round";
  let routeText = clean;
  if (clean.startsWith("ONEWAY") || clean.startsWith("OW ")) {
    type = "oneway";
    routeText = clean.replace(/^ONEWAY\s+|^OW\s+/, "");
  }

  const match = routeText.match(/^([A-Z]{3})[\s\-\>→]+([A-Z]{3})$/);
  if (!match) {
    await sendMessage(chatId, [
      `🔍 *How to search:*`,
      ``,
      `*Round-trip (default):*`,
      `  DEL BKK`,
      `  BOM-LHR`,
      ``,
      `*One-way:*`,
      `  oneway DEL BKK`,
      `  ow BOM-LHR`,
    ].join("\n"));
    return;
  }

  const [, origin, dest] = match;
  const label = type === "oneway" ? "One-way" : "Round-trip";
  await sendMessage(chatId, `Searching ${origin} → ${dest} (${label})...`);

  const best = await searchFlights(origin, dest, type);
  if (!best) { await sendMessage(chatId, `No fares found for ${origin} → ${dest}`); return; }

  const priceInr = Math.round(best.pricing_options?.[0]?.price?.amount || 0);
  const depLegId = best.leg_ids?.[0];
  const depLeg = best._legs?.find(l => l.id === depLegId);
  const retLegId = best.leg_ids?.[1];
  const retLeg = best._legs?.find(l => l.id === retLegId);
  const depDate = depLeg?.departure?.split("T")[0] || "TBA";
  const retDate = retLeg?.departure?.split("T")[0] || "TBA";
  const carrierId = Math.abs(depLeg?.marketing_carrier_ids?.[0] || 0);
  const airline = Object.values(best._carriers || {}).find(c => Math.abs(c.id) === carrierId)?.display_code || "Multiple";
  const stops = depLeg?.stop_count || 0;

  const lines = [
    `✅ *${origin} → ${dest}* (${label})`, ``,
    `💰 *₹${priceInr.toLocaleString("en-IN")}*`,
    `🗓️ ${depDate}`,
  ];

  if (type === "round") lines.push(`🔄 Return: ${retDate}`);
  lines.push(`✈️ ${airline}`, `🚦 ${stops === 0 ? "Nonstop" : stops + " stop(s)"}`);

  const gfLink = `https://www.google.com/travel/flights?q=Flights+to+${dest}+from+${origin}`;
  lines.push(``, `[Book on Google Flights](${gfLink})`);

  await sendMessage(chatId, lines.join("\n"));
}

// Keep-alive endpoint
app.get("/", (req, res) => res.send("Bot is running"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Start Express to keep Render alive
app.listen(PORT, () => console.log(`Server on port ${PORT}`));

// Start Telegram bot polling
async function runBot() {
  console.log("Bot started...");
  let offset = 0;
  while (true) {
    try {
      const data = await getUpdates(offset);
      if (!data.ok) { await new Promise(r => setTimeout(r, 5000)); continue; }
      for (const update of data.result) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg?.text) continue;
        console.log(`[${msg.from?.first_name}] ${msg.text}`);
        if (msg.text === "/start" || msg.text === "/help") {
          await sendMessage(msg.chat.id, [
            `✈️ *Flight Deal Bot*`,
            ``,
            `*Round-trip:*`,
            `  DEL BKK`,
            `  BOM-LHR`,
            ``,
            `*One-way:*`,
            `  oneway DEL BKK`,
            `  ow BOM-LHR`,
          ].join("\n"));
        } else {
          await handleCommand(msg.chat.id, msg.text);
        }
      }
    } catch (err) {
      console.error("Error:", err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

runBot();
