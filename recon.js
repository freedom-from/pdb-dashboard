require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

function safeName(s) {
  return s.replace(/^https?:\/\//, "").replace(/[^\w.-]+/g, "_").slice(0, 180);
}

async function main() {
  const leagueId = process.env.LEAGUE_ID;
  if (!leagueId) throw new Error("Missing LEAGUE_ID in .env");

  const authPath = path.join(__dirname, "auth.json");
  if (!fs.existsSync(authPath)) throw new Error("auth.json not found. Run: node auth_manual.js first.");

  const outDir = path.join(__dirname, "captures");
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: authPath,
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  const seen = new Set();
  const index = [];

  page.on("response", async (resp) => {
    try {
      const url = resp.url();
      const ct = (resp.headers()["content-type"] || "").toLowerCase();
      if (!ct.includes("application/json") && !ct.includes("text/json") && !ct.includes("application/vnd")) return;

      const key = `${resp.status()}|${url}`;
      if (seen.has(key)) return;
      seen.add(key);

      const bodyText = await resp.text();
      const filename = `${String(index.length).padStart(3, "0")}_${safeName(url)}.json`;
      fs.writeFileSync(path.join(outDir, filename), bodyText, "utf8");

      index.push({ i: index.length, status: resp.status(), contentType: ct, url, file: filename });
      console.log(`[CAPTURED] ${resp.status()} ${url}`);
    } catch {}
  });

  const leagueUrl = `https://www.fantrax.com/fantasy/league/${leagueId}/team/chart`;
  console.log("Opening:", leagueUrl);
  await page.goto(leagueUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);

  fs.writeFileSync(path.join(outDir, "_index.json"), JSON.stringify(index, null, 2), "utf8");
  console.log(`Done. Captured ${index.length} JSON responses. See captures/_index.json`);

  await browser.close();
}

main().catch((e) => {
  console.error("Recon failed:", e.message);
  process.exit(1);
});
