import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import "dotenv/config";

const db = new PrismaClient();
test("local recipes match stock without AI and save only confirmed actual quantities", async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name.startsWith("mobile");
  const username = `local_${mobile ? "m" : "d"}_${Date.now()}`;
  const password = "LocalRecipeTest1!";
  const user = await db.user.create({
    data: {
      username,
      passwordHash: await argon2.hash(password),
      memberships: {
        create: {
          role: "admin",
          family: { create: { name: "本地菜谱测试家庭" } },
        },
      },
    },
    include: { memberships: true },
  });
  const familyId = user.memberships[0].familyId;
  const errors: string[] = [];
  const aiCalls: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === "/api/recommend")
      aiCalls.push(req.url());
  });
  try {
    await page.goto("/");
    await page.getByLabel("用户名", { exact: true }).fill(username);
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "打开我的冰箱" }).click();
    await expect(
      page.getByRole("heading", { name: "我的冰箱." }),
    ).toBeVisible();
    const origin = new URL(page.url()).origin;
    for (const [name, quantity] of [
      ["鸡蛋", "6"],
      ["番茄", "3"],
    ]) {
      const res = await page.request.post(`${origin}/api/inventory`, {
        headers: {
          origin,
          "x-family-id": familyId,
          "idempotency-key": randomUUID(),
        },
        data: {
          name,
          quantity,
          unit: "个",
          region: "冷藏",
          category: "蔬菜",
          aliases: [],
        },
      });
      expect(res.status()).toBe(200);
    }
    await page.reload();
    const nav = page.locator(mobile ? ".bottom-nav" : ".sidebar nav");
    await nav.getByRole("button", { name: "今天吃什么" }).click();
    await expect(
      page.getByRole("button", { name: "本地菜谱", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const counts = page.locator('.section-title [aria-live="polite"]');
    await expect(counts).toContainText(/菜谱库共 331 道 · 当前库存匹配 \d+ 道/);
    await page.getByRole("button", { name: "全部菜谱", exact: true }).click();
    await expect(counts).toContainText("菜谱库共 331 道 · 当前筛选 331 道");
    await expect(page.locator(".recipe-card")).toHaveCount(12);
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(page.locator(".local-recipe-pages")).toContainText(
      "13–24 / 331",
    );
    await page.getByRole("button", { name: "按库存推荐", exact: true }).click();
    await expect(counts).toContainText(/当前库存匹配 \d+ 道/);
    await expect(page.locator(".local-recipe-pages")).toContainText("1–12 /");
    await page.getByLabel("搜菜名或食材", { exact: true }).fill("西红柿炒鸡蛋");
    await page.getByLabel("只看食材齐全").check();
    const card = page.locator(".recipe-card").filter({
      has: page.getByRole("heading", { name: "西红柿炒鸡蛋", exact: true }),
    });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("食材齐全");
    await page.screenshot({
      path: `.local/local-recipes-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await card.getByRole("button", { name: "看看怎么做" }).click();
    const detail = page.getByRole("dialog", { name: "西红柿炒鸡蛋" });
    await expect(detail).toContainText("用量参考");
    await expect(detail).toContainText("1.5 个 × 份数");
    await expect(
      detail.getByRole("link", { name: "查看原始菜谱与配图" }),
    ).toHaveAttribute("href", /github\.com\/Anduin2017\/HowToCook\/blob\//);
    await detail.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByLabel("只看食材齐全").uncheck();
    await page.getByRole("button", { name: "全部菜谱", exact: true }).click();
    await page.getByLabel("搜菜名或食材", { exact: true }).fill("太阳蛋");
    await page
      .locator(".recipe-card")
      .filter({
        has: page.getByRole("heading", { name: "太阳蛋", exact: true }),
      })
      .getByRole("button", { name: "看看怎么做" })
      .click();
    const sun = page.getByRole("dialog", { name: "太阳蛋", exact: true });
    await expect(
      sun.getByRole("heading", { name: "方法一：可调火力的微波炉" }),
    ).toBeAttached();
    await expect(sun).toContainText("每次继续用微波炉加热 30 秒");
    await expect(sun).not.toContainText(/while|###|```/);
    await page.screenshot({
      path: `.local/recipe-detail-${mobile ? "mobile" : "desktop"}.png`,
    });
    await sun
      .getByRole("heading", {
        name: "方法二：仅能设置时间的微波炉",
        exact: true,
      })
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.screenshot({
      path: `.local/recipe-steps-${mobile ? "mobile" : "desktop"}.png`,
    });
    expect(await sun.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    await sun.getByRole("button", { name: "关闭", exact: true }).click();

    await page.getByLabel("搜菜名或食材", { exact: true }).fill("戚风蛋糕");
    await page
      .locator(".recipe-card")
      .filter({
        has: page.getByRole("heading", { name: "戚风蛋糕", exact: true }),
      })
      .getByRole("button", { name: "看看怎么做" })
      .click();
    const cake = page.getByRole("dialog", { name: "戚风蛋糕", exact: true });
    await expect(cake.getByRole("table")).toContainText("6 寸");
    await expect(cake.getByRole("table")).toContainText("90g");
    await cake.getByRole("table").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `.local/recipe-table-${mobile ? "mobile" : "desktop"}.png`,
    });
    expect(await cake.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    await cake.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "按库存推荐", exact: true }).click();
    await page.getByLabel("搜菜名或食材", { exact: true }).fill("西红柿炒鸡蛋");
    await page.getByLabel("只看食材齐全").check();
    await expect(card).toHaveCount(1);
    await card
      .getByRole("button", { name: "选择西红柿炒鸡蛋", exact: true })
      .click();
    await page.getByRole("button", { name: "确认用量，记下这一餐" }).click();
    await expect(page.getByLabel("鸡蛋实际用量")).toHaveValue("");
    await expect(page.getByLabel("番茄实际用量")).toHaveValue("");
    expect(await db.meal.count({ where: { familyId } })).toBe(0);
    const stock = await db.ingredient.findMany({
      where: { familyId },
      include: { batches: true },
    });
    expect(
      stock.find((i) => i.name === "鸡蛋")!.batches[0].remaining.toString(),
    ).toBe("6");
    await page.getByLabel("鸡蛋实际用量").fill("2");
    await page.getByLabel("番茄实际用量").fill("1");
    await page.getByRole("button", { name: "确认保存这一餐" }).click();
    await expect(page.locator(".meal-editor")).toHaveCount(0);
    const saved = await db.ingredient.findMany({
      where: { familyId },
      include: { batches: true },
    });
    expect(
      saved.find((i) => i.name === "鸡蛋")!.batches[0].remaining.toString(),
    ).toBe("4");
    expect(
      saved.find((i) => i.name === "番茄")!.batches[0].remaining.toString(),
    ).toBe("2");
    expect(await db.meal.count({ where: { familyId } })).toBe(1);
    expect(await db.aiCall.count({ where: { familyId } })).toBe(0);
    expect(aiCalls).toEqual([]);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await db.family.delete({ where: { id: familyId } });
    await db.user.delete({ where: { id: user.id } });
  }
});
test.afterAll(async () => {
  await db.$disconnect();
});
