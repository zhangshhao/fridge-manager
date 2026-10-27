import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
mkdirSync(".local/screenshots", { recursive: true });
const browser = await chromium.launch();
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 393, height: 852 },
]) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: viewport.width < 600,
    hasTouch: viewport.width < 600,
  });
  const page = await context.newPage();
  await page.goto("http://localhost:5173");
  await page.getByLabel("用户名", { exact: true }).fill("fridge");
  await page.getByLabel("密码", { exact: true }).fill("FreshKitchen2026!");
  await page.getByRole("button", { name: "打开我的冰箱" }).click();
  await page.locator(".stock-row").first().waitFor();
  const size = viewport.width < 600 ? "mobile" : "desktop";
  await page.screenshot({
    path: `.local/screenshots/${size}-stock.png`,
    fullPage: true,
  });
  const nav = page.locator(
    viewport.width < 600 ? ".bottom-nav" : ".sidebar nav",
  );
  for (const [tab, label] of [
    ["recipes", "今天吃什么"],
    ["meals", "做菜记录"],
    ["settings", viewport.width < 600 ? "我的" : "我的小家"],
  ]) {
    await nav.getByRole("button", { name: label, exact: true }).click();
    await page.locator("main h1").waitFor();
    await page.screenshot({
      path: `.local/screenshots/${size}-${tab}.png`,
      fullPage: true,
    });
  }
  await context.close();
}
await browser.close();
console.log("Desktop and mobile screenshots saved under .local/screenshots");
