require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

async function main() {
  if (!process.env.FANTRAX_EMAIL || !process.env.FANTRAX_PASSWORD) {
    throw new Error("Missing FANTRAX_EMAIL or FANTRAX_PASSWORD in .env");
  }

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120000);

  console.log("Opening Fantrax login…");
  await page.goto("https://www.fantrax.com/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  // Cookie/consent banner dismissal (best-effort)
  const cookieButtons = [
    page.getByRole("button", { name: /accept/i }),
    page.getByRole("button", { name: /agree/i }),
    page.getByRole("button", { name: /dismiss/i }),
    page.getByRole("button", { name: /close/i }),
    page.getByRole("button", { name: /ok/i }),
  ];
  for (const b of cookieButtons) {
    try {
      if (await b.isVisible({ timeout: 800 })) {
        await b.click({ timeout: 1500 });
        break;
      }
    } catch {}
  }

  // Wait for the real fields you discovered (Angular Material)
  await page.locator("#mat-input-0").waitFor({ state: "visible", timeout: 30000 });
  await page.fill("#mat-input-0", process.env.FANTRAX_EMAIL);
  await page.fill("#mat-input-1", process.env.FANTRAX_PASSWORD);

  // Click Login (button type submit exists per your dump)
  await page.click('button[type="submit"]');

  // Confirm we actually left the login route
  await page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 120000 });

  const authPath = path.join(__dirname, "auth.json");
  await context.storageState({ path: authPath });
  console.log("Saved auth state to:", authPath);

  console.log("Close the browser window to finish.");
  await page.waitForEvent("close").catch(() => {});
  await browser.close();
}

main().catch((e) => {
  console.error("auth_setup failed:", e.message);
  process.exit(1);
});
