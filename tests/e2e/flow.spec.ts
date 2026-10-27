import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import "dotenv/config";
const db = new PrismaClient();
test("login → batches → meal → calendar → edit → cancel, plus offline and AI fallback", async ({
  page,
  context,
}, testInfo) => {
  const username = `e2e_${testInfo.project.name.split("-")[0]}_${Date.now()}`;
  const user = await db.user.create({
    data: {
      username,
      passwordHash: await argon2.hash("EndToEndPassword1!"),
      memberships: {
        create: { role: "admin", family: { create: { name: "验收测试家庭" } } },
      },
    },
    include: { memberships: true },
  });
  const familyId = user.memberships[0].familyId;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto("/");
    await page.getByLabel("用户名", { exact: true }).fill(username);
    await page.getByLabel("密码", { exact: true }).fill("EndToEndPassword1!");
    await page.getByRole("button", { name: "打开我的冰箱" }).click();
    await expect(
      page.getByRole("heading", { name: "我的冰箱." }),
    ).toBeVisible();
    for (const [name, quantity, category] of [
      ["鸡蛋", "6", "肉蛋水产"],
      ["番茄", "3", "蔬菜"],
    ]) {
      await page.getByRole("button", { name: "食材入库", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "添一份新鲜" });
      await dialog.getByLabel("食材名称").fill(name);
      await dialog.getByLabel("数量", { exact: true }).fill(quantity);
      await dialog.getByLabel("分类", { exact: true }).selectOption(category);
      await dialog.getByRole("button", { name: "确认入库" }).click();
      await expect(dialog).not.toBeVisible();
    }
    const nav = page.locator(
      testInfo.project.name.startsWith("mobile")
        ? ".bottom-nav"
        : ".sidebar nav",
    );
    await nav.getByRole("button", { name: "做菜记录" }).click();
    await page.getByRole("button", { name: "记一餐", exact: true }).click();
    await page.getByLabel("菜品名称").fill("番茄炒蛋");
    const inventory = await db.ingredient.findMany({ where: { familyId } });
    for (const [name, q] of [
      ["鸡蛋", "3"],
      ["番茄", "2"],
    ]) {
      await page.getByRole("button", { name: "添加一种用料" }).click();
      const usage = page.locator(".usage-card").last();
      await usage
        .getByLabel("选择库存食材")
        .selectOption(inventory.find((i) => i.name === name)!.id);
      await usage.getByLabel(`${name}实际用量`).fill(q);
    }
    await page.getByRole("button", { name: "确认保存这一餐" }).click();
    await expect(page.locator(".meal-card").first()).toContainText("番茄炒蛋");
    expect(
      (
        await db.batch.findFirstOrThrow({
          where: { familyId, ingredient: { name: "鸡蛋" } },
        })
      ).remaining.toString(),
    ).toBe("3");
    await page.locator(".meal-card").first().click();
    await page.getByRole("button", { name: "修改记录" }).click();
    await page.getByLabel("鸡蛋实际用量").fill("2");
    await page.getByRole("button", { name: "确认保存这一餐" }).click();
    await expect(page.locator(".meal-card").first()).toBeVisible();
    expect(
      (
        await db.batch.findFirstOrThrow({
          where: { familyId, ingredient: { name: "鸡蛋" } },
        })
      ).remaining.toString(),
    ).toBe("4");
    await page.locator(".meal-card").first().click();
    await page.getByRole("button", { name: "撤销记录", exact: true }).click();
    await page.getByRole("button", { name: "确认", exact: true }).click();
    await expect(page.locator(".meal-card")).toHaveCount(0);
    expect(
      (
        await db.batch.findFirstOrThrow({
          where: { familyId, ingredient: { name: "鸡蛋" } },
        })
      ).remaining.toString(),
    ).toBe("6");
    await nav.getByRole("button", { name: "今天吃什么" }).click();
    await expect(page.locator(".recipe-card").first()).toBeVisible();
    await page.getByRole("button", { name: "AI 灵感（可选）", exact: true }).click();
    await page.getByRole("button", { name: "给我 3 道菜的灵感" }).click();
    await expect(page.getByRole("alert")).toContainText("AI 服务尚未配置");
    await context.setOffline(true);
    await expect(page.locator(".offline-bar")).toBeVisible();
    await context.setOffline(false);
    await expect(page.locator(".offline-bar")).not.toBeVisible();
    await nav
      .getByRole("button", {
        name: testInfo.project.name.startsWith("mobile") ? "冰箱" : "我的冰箱",
        exact: true,
      })
      .click();
    await page.reload();
    await expect(page.locator(".stock-row")).toHaveCount(2);
    await page.screenshot({
      path: `.local/${testInfo.project.name}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await db.family.delete({ where: { id: familyId } });
    await db.user.delete({ where: { id: user.id } });
  }
});
test.afterAll(async () => {
  await db.$disconnect();
});
