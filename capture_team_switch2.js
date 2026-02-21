require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

function safeName(s) {
  return String(s).replace(/[^a-z0-9._-]+/gi, "_").slice(0, 140);
}

(async () => {
  const outDir = path.join(__dirname, "switch_capture2");
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: "auth.json" });
  const page = await context.newPage();

  // Capture REQUEST payloads to /fxpa/req
  page.on("request", async (req) => {
    const url = req.url();
    if (!url.includes("/fxpa/req")) return;

    const ts = Date.now();
    const method = req.method();
    const post = req.postData() || "";
    const rec = {
      ts,
      method,
      url,
      headers: req.headers(),
      postData: post,
    };

    const fn = path.join(outDir, `${ts}_REQ_${safeName(method)}.json`);
    fs.writeFileSync(fn, JSON.stringify(rec, null, 2));
    console.log("REQ captured:", method, url);
  });

  // Capture RESPONSES (optional but helpful)
  page.on("response", async (resp) => {
    const url = resp.url();
    if (!url.includes("/fxpa/req")) return;

    const ts = Date.now();
    try {
      const txt = await resp.text();
      const fn = path.join(outDir, `${ts}_RESP.json`);
      fs.writeFileSync(fn, txt);
      console.log("RESP captured:", resp.status(), url);
    } catch {}
  });

  const startUrl = `https://www.fantrax.com/fantasy/league/${process.env.LEAGUE_ID}/team/roster`;
  await page.goto(startUrl, { waitUntil: "domcontentloaded" });

  console.log("\nNOW: manually switch to 2-3 DIFFERENT teams via the UI dropdown.\nThen close the browser window.\n");
})();
