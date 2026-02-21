require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

async function main() {
  const outDir = path.join(__dirname, "debug");
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Increase navigation timeout for this script only
  page.setDefaultNavigationTimeout(120000);

  console.log("Opening login page…");
  await page.goto("https://www.fantrax.com/login", { waitUntil: "domcontentloaded" });

  // Give the app time to hydrate/render
  await page.waitForTimeout(2500);

  // Try to wait for any plausible login field without assuming types
  const candidates = [
    'input[type="password"]',
    'input[autocomplete="current-password"]',
    'input[name*="pass" i]',
    'input[id*="pass" i]',
    'input[placeholder*="password" i]',
  ];

  let found = false;
  for (const sel of candidates) {
    try {
      if (await page.locator(sel).first().isVisible({ timeout: 2000 })) {
        found = true;
        console.log("Found password-ish field via:", sel);
        break;
      }
    } catch {}
  }

  // Always write artifacts even if we didn't find inputs yet
  await page.screenshot({ path: path.join(outDir, "login_page.png"), fullPage: true });

  const frames = page.frames().map(f => f.url());
  fs.writeFileSync(path.join(outDir, "frames.json"), JSON.stringify(frames, null, 2), "utf8");

  const html = await page.content();
  fs.writeFileSync(path.join(outDir, "login_page.html"), html, "utf8");

  // Dump elements Playwright can see in main frame
  const inputsButtons = await page.$$eval("input, button", els =>
    els.slice(0, 250).map(el => ({
      tag: el.tagName,
      type: el.getAttribute("type"),
      name: el.getAttribute("name"),
      id: el.getAttribute("id"),
      aria: el.getAttribute("aria-label"),
      placeholder: el.getAttribute("placeholder"),
      autocomplete: el.getAttribute("autocomplete"),
      text: el.tagName === "BUTTON" ? (el.textContent || "").trim().slice(0, 120) : ""
    }))
  );
  fs.writeFileSync(path.join(outDir, "inputs_buttons.json"), JSON.stringify(inputsButtons, null, 2), "utf8");

  console.log("Wrote debug artifacts to:", outDir);
  console.log("Found login fields:", found);

  console.log("\nLeave the browser open for a moment to visually confirm the login form is there.");
  console.log("Close the browser window when done.");
  await page.waitForEvent("close").catch(() => {});
  await browser.close();
}

main().catch(e => {
  console.error("debug failed:", e);
  process.exit(1);
});
