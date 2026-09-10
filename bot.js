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
  const apiKey = process.env.IGNAV_API_KEY;
  if (!apiKey) throw new Error("Missing IGNAV_API_KEY");

  let bestFlight = null;
  let bestPrice = Infinity;

  if (type === "oneway") {
    for (let w = 1; w <= 4; w++) {
      const dep = getDateStr(w * 7);
      try {
        const res = await fetch("https://ignav.com/api/fares/one-way", {
          method: "POST",
          headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ origin, destination: dest, departure_date: dep }),
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
  } else {
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
  }

  // Get booking links if we have a flight
  if (bestFlight?.ignav_id) {
    try {
      const res = await fetch("https://ignav.com/api/fares/booking-links", {
        method: "POST",
        headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ ignav_id: bestFlight.ignav_id }),
      });
      if (res.ok) {
        const data = await res.json();
        bestFlight._bookingLinks = data.booking_options || [];
      }
    } catch {}
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

  const priceInr = Math.round(best.price.amount * CONFIG.usdToInr);
  const depDate = best.outbound?.segments?.[0]?.departure_time_local?.split("T")[0] || "TBA";
  const airline = best.outbound?.carrier || "Multiple";
  const stops = (best.outbound?.segments?.length || 1) - 1;

  const lines = [
    `✅ *${origin} → ${dest}* (${label})`, ``,
    `💰 *₹${priceInr.toLocaleString("en-IN")}*`,
    `🗓️ ${depDate}`,
    `✈️ ${airline}`,
    `🚦 ${stops === 0 ? "Nonstop" : stops + " stop(s)"}`,
  ];

  if (type === "round") {
    const retDate = best.inbound?.segments?.[0]?.departure_time_local?.split("T")[0] || "TBA";
    lines.splice(3, 0, `🔄 Return: ${retDate}`);
  }

  // Add booking links
  const bookingLinks = best._bookingLinks || [];
  if (bookingLinks.length > 0) {
    lines.push(``, `🔗 *Book now:*`);
    for (const option of bookingLinks.slice(0, 3)) {
      const links = option.links || [];
      for (const link of links.slice(0, 2)) {
        if (link.url) {
          lines.push(`• [${link.provider || "Book"}](${link.url})`);
        }
      }
    }
  } else {
    // Fallback to Google Flights
    const gfLink = `https://www.google.com/travel/flights?q=Flights+to+${dest}+from+${origin}`;
    lines.push(``, `🔗 [Search on Google Flights](${gfLink})`);
  }

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
