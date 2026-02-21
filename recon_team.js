require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

function safeName(s) {
  return s.replace(/^https?:\/\//, "").replace(/[^\w.-]+/g, "_").slice(0, 180);
}

async function main() {
  const leagueId = process.env.LEAGUE_ID;
  const teamId = process.env.TEAM_ID;
  if (!leagueId) throw new Error("Missing LEAGUE_ID in .env");
  if (!teamId) throw new Error("Missing TEAM_ID in .env");

  const authPath = path.join(__dirname, "auth.json");
  if (!fs.existsSync(authPath)) throw new Error("auth.json not found.");

  const outDir = path.join(__dirname, "captures_team");
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: authPath,
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120000);

  const seen = new Set();
  const index = [];

  page.on("response", async (resp) => {
    try {
      const url = resp.url();
      const ct = (resp.headers()["content-type"] || "").toLowerCase();
      if (!ct.includes("application/json") && !ct.includes("text/json") && !ct.includes("application/vnd")) return;

      const noisy = /(doubleclick|googlesyndication|primis|rubiconproject|openrtb|pubmatic|criteo|adsrvr|optable|3lift|amazon-adsystem|id5-sync|casalemedia|adnxs|floors\.dev|btloader|trustx|ingage)/i.test(url);

      const key = `${resp.status()}|${url}`;
      if (seen.has(key)) return;
      seen.add(key);

      const bodyText = await resp.text();
      const filename = `${String(index.length).padStart(3, "0")}_${safeName(url)}.json`;
      fs.writeFileSync(path.join(outDir, filename), bodyText, "utf8");

      index.push({ i: index.length, status: resp.status(), contentType: ct, url, file: filename });

      if (!noisy) console.log(`[CAPTURED] ${resp.status()} ${url}`);
    } catch {}
  });

  const url = `https://www.fantrax.com/fantasy/league/${leagueId}/team/${teamId}`;
  console.log("Opening:", url);
  await page.goto(url, { waitUntil: "domcontentloaded" });

  await page.waitForTimeout(15000);

  fs.writeFileSync(path.join(outDir, "_index.json"), JSON.stringify(index, null, 2), "utf8");
  console.log(`Done. Captured ${index.length} JSON responses. See captures_team/_index.json`);

  await browser.close();
}

main().catch((e) => {
  console.error("Recon failed:", e.message);
  process.exit(1);
});
