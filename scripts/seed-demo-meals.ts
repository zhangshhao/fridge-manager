import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db, today } from "../apps/api/src/core.js";
import { buildApp } from "../apps/api/src/server.js";
if (
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Local demo only");
const demo = await db.user.findUniqueOrThrow({
  where: { username: "fridge" },
  include: { memberships: true },
});
const familyId = demo.memberships[0].familyId;
if (await db.meal.count({ where: { familyId } })) {
  await db.$disconnect();
  process.exit(0);
}
const app = await buildApp(false);
const login = await app.inject({
  method: "POST",
  url: "/api/login",
  headers: { origin: process.env.APP_ORIGIN },
  payload: { username: "fridge", password: "FreshKitchen2026!" },
});
if (login.statusCode !== 200)
  throw new Error("Demo password changed; refusing to alter data");
const items = await db.ingredient.findMany({ where: { familyId } });
const samples = [
  {
    name: "番茄炒蛋",
    mealType: "午餐",
    ingredients: [
      ["鸡蛋", "3"],
      ["番茄", "2"],
    ],
  },
  {
    name: "西兰花炒鸡胸肉",
    mealType: "晚餐",
    ingredients: [
      ["西兰花", "200"],
      ["鸡胸肉", "150"],
    ],
  },
];
for (const sample of samples) {
  const result = await app.inject({
    method: "POST",
    url: "/api/meals",
    headers: {
      origin: process.env.APP_ORIGIN,
      cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "x-family-id": familyId,
      "idempotency-key": randomUUID(),
    },
    payload: {
      date: today(),
      mealType: sample.mealType,
      servings: 2,
      note: "本机演示记录",
      dishes: [
        {
          name: sample.name,
          steps: [],
          usages: sample.ingredients.map(([name, quantity]) => {
            const item = items.find((i) => i.name === name)!;
            return { ingredientId: item.id, name, quantity, unit: item.unit };
          }),
        },
      ],
    },
  });
  if (result.statusCode !== 200) throw new Error(result.body);
}
await app.close();
await db.$disconnect();
console.log("Two sample meals recorded using inventory transactions.");
