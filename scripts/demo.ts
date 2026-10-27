import "dotenv/config";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { db, today } from "../apps/api/src/core.js";
import { buildApp } from "../apps/api/src/server.js";
if (
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Demo data only permitted on localhost in development");
const username = "fridge";
const password = "FreshKitchen2026!";
if (await db.user.findUnique({ where: { username } })) {
  console.log("Demo account already exists; nothing changed.");
  await db.$disconnect();
  process.exit(0);
}
const u = await db.user.create({
  data: {
    username,
    passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    memberships: {
      create: { role: "admin", family: { create: { name: "新鲜小家" } } },
    },
  },
  include: { memberships: true },
});
const familyId = u.memberships[0].familyId;
const app = await buildApp(false);
const login = await app.inject({
  method: "POST",
  url: "/api/login",
  headers: { origin: process.env.APP_ORIGIN },
  payload: { username, password },
});
const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const dateAfter = (days: number) =>
  new Date(Date.parse(today()) + days * 86400000).toISOString().slice(0, 10);
const samples: [string, string, string, string, string, number | null][] = [
  ["番茄", "5", "个", "冷藏", "蔬菜", 2],
  ["鸡蛋", "12", "个", "冷藏", "肉蛋水产", 12],
  ["西兰花", "500", "克", "冷藏", "蔬菜", 3],
  ["鲜牛奶", "1000", "毫升", "冷藏", "乳品", 1],
  ["鸡胸肉", "600", "克", "冷冻", "肉蛋水产", 30],
  ["胡萝卜", "3", "个", "冷藏", "蔬菜", 10],
  ["香菇", "250", "克", "冷藏", "蔬菜", 4],
  ["土豆", "4", "个", "常温", "蔬菜", 14],
  ["大米", "2000", "克", "常温", "主食", null],
  ["虾仁", "300", "克", "冷冻", "肉蛋水产", 25],
  ["黄瓜", "2", "个", "冷藏", "蔬菜", 5],
  ["苹果", "4", "个", "冷藏", "水果", 10],
];
for (const [name, quantity, unit, region, category, expires] of samples) {
  const res = await app.inject({
    method: "POST",
    url: "/api/inventory",
    headers: {
      origin: process.env.APP_ORIGIN,
      cookie,
      "x-family-id": familyId,
      "idempotency-key": randomUUID(),
    },
    payload: {
      name,
      quantity,
      unit,
      region,
      category,
      purchasedAt: today(),
      ...(expires !== null ? { expiresAt: dateAfter(expires) } : {}),
      aliases: name === "番茄" ? ["西红柿"] : [],
    },
  });
  if (res.statusCode !== 200) throw new Error(res.body);
}
await app.close();
await db.$disconnect();
console.log(
  "Local demo ready: username fridge, password FreshKitchen2026! (development only).",
);
