import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const db = new PrismaClient();

test("register → create family → auto-login → reload → login again", async ({
  page,
  context,
}, testInfo) => {
  const mobile = testInfo.project.name.startsWith("mobile");
  const username = `signup_${mobile ? "m" : "d"}_${Date.now()}`;
  const password = "RegistrationTest1!";
  const familyName = "注册测试的小家";
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "打开我的冰箱" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "注册账号并创建家庭" }).click();
    const dialog = page.getByRole("dialog", { name: "注册并创建家庭" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("用户名", { exact: true }).fill(username);
    await dialog
      .getByLabel("密码（至少 10 位）", { exact: true })
      .fill(password);
    await dialog
      .getByLabel("确认密码", { exact: true })
      .fill("DifferentPassword1!");
    await dialog.getByLabel("家庭名称", { exact: true }).fill(familyName);
    await dialog.getByRole("button", { name: "注册并打开冰箱" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "两次输入的密码不一致",
    );
    expect(await db.user.findUnique({ where: { username } })).toBeNull();
    await expect(dialog.getByLabel("家庭名称", { exact: true })).toHaveValue(
      familyName,
    );
    await dialog.getByLabel("确认密码", { exact: true }).fill(password);
    await page.screenshot({
      path: `.local/registration-${mobile ? "mobile" : "desktop"}.png`,
    });
    await dialog.getByRole("button", { name: "注册并打开冰箱" }).click();
    await expect(
      page.getByRole("heading", { name: "我的冰箱." }),
    ).toBeVisible();
    await expect(dialog).not.toBeVisible();
    const created = await db.user.findUniqueOrThrow({
      where: { username },
      include: { memberships: { include: { family: true } } },
    });
    expect(created.memberships).toHaveLength(1);
    expect(created.memberships[0].role).toBe("admin");
    expect(created.memberships[0].family.name).toBe(familyName);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "我的冰箱." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await context.clearCookies();
    await page.reload();
    await page.getByLabel("用户名", { exact: true }).fill(username);
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "打开我的冰箱" }).click();
    await expect(
      page.getByRole("heading", { name: "我的冰箱." }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    const created = await db.user.findUnique({
      where: { username },
      include: { memberships: true },
    });
    if (created) {
      await db.family.deleteMany({
        where: { id: { in: created.memberships.map((m) => m.familyId) } },
      });
      await db.user.delete({ where: { id: created.id } });
    }
  }
});

test.afterAll(async () => {
  await db.$disconnect();
});
