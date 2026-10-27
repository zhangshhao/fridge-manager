import { test, expect } from "@playwright/test";
test("production PWA caches its shell, keeps API responses out of cache and opens offline", async ({
  page,
  context,
}) => {
  await page.goto("http://localhost:4173/");
  await expect(
    page.getByRole("heading", { name: "新鲜生活，从这里开始" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const manifest = await page.evaluate(async () =>
    (await fetch("/manifest.webmanifest")).json(),
  );
  expect(manifest.display).toBe("standalone");
  expect(
    manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable"),
  ).toBe(true);
  await page.evaluate(async () => {
    await fetch("/api/health", { cache: "no-store" });
  });
  const cachedUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(request.url);
    }
    return urls;
  });
  expect(cachedUrls.some((url) => url.includes("/assets/"))).toBe(true);
  expect(cachedUrls.some((url) => url.includes("/api/"))).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".offline-bar")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "新鲜生活，从这里开始" }),
  ).toBeVisible();
  await page.getByLabel("用户名", { exact: true }).fill("offline_user");
  await page.getByLabel("密码", { exact: true }).fill("OfflinePassword1!");
  await page.getByRole("button", { name: "打开我的冰箱" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "当前处于离线状态",
  );
  await expect(page.getByLabel("用户名", { exact: true })).toHaveValue(
    "offline_user",
  );
  await context.setOffline(false);
});
