const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

async function main() {
  const authPath = path.join(__dirname, "auth.json");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120000);

  console.log("Opening Fantrax login. Log in manually in the browser window.");
  await page.goto("https://www.fantrax.com/login", { waitUntil: "domcontentloaded" });

  console.log("\nWhen you are fully logged in (not on /login anymore), come back here and press ENTER.");
  await new Promise((resolve) => process.stdin.once("data", resolve));

  const url = page.url();
  if (url.includes("/login")) {
    console.log("Still on /login. Not saving auth.json. Try again after you’re logged in.");
    await browser.close();
    process.exit(1);
  }

  await context.storageState({ path: authPath });
  console.log("Saved auth state to:", authPath);

  await browser.close();
}

main().catch((e) => {
  console.error("auth_manual failed:", e.message);
  process.exit(1);
});
