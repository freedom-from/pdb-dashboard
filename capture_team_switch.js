require("dotenv").config();
const fs = require("fs");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: "auth.json",
  });

  const page = await context.newPage();

  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.includes("/fxpa/req")) {
      try {
        const body = await resp.text();
        const ts = Date.now();
        fs.writeFileSync(`team_switch_${ts}.json`, body);
        console.log("Captured:", url);
      } catch {}
    }
  });

  await page.goto(
    `https://www.fantrax.com/fantasy/league/${process.env.LEAGUE_ID}/team/roster`,
    { waitUntil: "domcontentloaded" }
  );

  console.log("\nNow manually click a DIFFERENT team in the left dropdown.\n");
})();
