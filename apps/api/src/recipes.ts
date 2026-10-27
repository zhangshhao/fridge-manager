import type { FastifyInstance } from "fastify";
import { z } from "zod";
import catalog from "./data/recipes.json" with { type: "json" };
import {
  localRecommendInput,
  type LocalRecipe,
  type Preferences,
} from "../../../packages/shared/src/index.js";
import { actor, db, decimal, today } from "./core.js";
import { canonicalIngredient } from "./recipe-ingredients.js";

export type RecipeStock = {
  id: string;
  name: string;
  aliases: string[];
  unit: string;
  archived: boolean;
  batches: {
    remaining: { toString(): string } | string;
    expiresAt: string | null;
    archived: boolean;
  }[];
};
type Input = z.infer<typeof localRecommendInput>;
const allergens: Record<string, string[]> = {
  鸡蛋: ["鸡蛋", "蛋黄", "蛋白", "蛋液"],
  蛋: ["鸡蛋", "鸭蛋", "鹅蛋", "鹌鹑蛋", "蛋黄", "蛋白", "蛋液"],
  海鲜: [
    "虾",
    "蟹",
    "鱼",
    "贝",
    "蛤",
    "蚝",
    "蛎",
    "鱿",
    "章鱼",
    "海参",
    "海胆",
  ],
  猪肉: [
    "猪",
    "五花肉",
    "里脊",
    "排骨",
    "肉末",
    "肉馅",
    "培根",
    "火腿",
    "腊肠",
    "午餐肉",
  ],
  牛奶: ["牛奶", "奶粉", "奶油", "奶酪", "黄油", "乳酪", "炼乳", "酸奶"],
  乳制品: ["奶", "黄油", "乳酪"],
  坚果: ["花生", "核桃", "杏仁", "腰果", "榛子", "松子", "开心果"],
  大豆: [
    "大豆",
    "黄豆",
    "豆腐",
    "豆干",
    "豆皮",
    "豆浆",
    "腐竹",
    "酱油",
    "生抽",
    "老抽",
    "豆瓣",
    "蚝油",
  ],
  辣: ["辣", "小米椒", "青椒", "红椒", "豆瓣酱"],
};

export function rankLocalRecipes(
  stock: RecipeStock[],
  preferences: Preferences,
  input: Input,
  day = today(),
) {
  const available = stock
    .filter((item) => !item.archived)
    .map((item) => {
      const batches = item.batches.filter(
        (b) =>
          !b.archived &&
          decimal(b.remaining.toString()).gt(0) &&
          (!b.expiresAt || b.expiresAt >= day),
      );
      const expiry = new Date(`${day}T00:00:00Z`);
      expiry.setUTCDate(expiry.getUTCDate() + preferences.expiringDays);
      return {
        ...item,
        names: [item.name, ...item.aliases].map(canonicalIngredient),
        available: batches
          .reduce((sum, b) => sum.add(b.remaining.toString()), decimal(0))
          .toFixed(3),
        expiring: batches.some(
          (b) =>
            b.expiresAt && b.expiresAt <= expiry.toISOString().slice(0, 10),
        ),
      };
    })
    .filter((item) => decimal(item.available).gt(0));
  const pantry = new Set(preferences.seasonings.map(canonicalIngredient));
  const avoid = [
    ...new Set([...preferences.avoid, ...input.avoid].map(canonicalIngredient)),
  ]
    .filter(Boolean)
    .flatMap((word) => [word, ...(allergens[word] || [])]);
  const query = canonicalIngredient(input.query);
  const taste = input.taste.split(/[，,、\s]+/).filter((v) => v.length > 1);
  const ranked: { recipe: LocalRecipe; score: number }[] = [];
  for (const source of catalog.recipes) {
    if (input.category && source.category !== input.category) continue;
    // No invented times: a time limit excludes recipes without an explicit source estimate.
    if (
      input.minutes &&
      (source.minutes === null || source.minutes > input.minutes)
    )
      continue;
    const text = [
      source.name,
      ...source.ingredientNotes,
      source.quantityNotes,
      ...source.steps,
      source.tips,
    ]
      .join(" ")
      .normalize("NFKC")
      .toLowerCase();
    const foodNames = source.ingredients.flatMap((i) => i.choices);
    if (
      avoid.some(
        (word) =>
          text.includes(word) || foodNames.some((name) => name.includes(word)),
      )
    )
      continue;
    if (
      query &&
      !canonicalIngredient(source.name).includes(query) &&
      !foodNames.some((name) => name.includes(query))
    )
      continue;
    const ingredients = source.ingredients.map((ingredient) => {
      const matches = available.filter((item) =>
        item.names.some((name) => ingredient.choices.includes(name)),
      );
      matches.sort(
        (a, b) =>
          Number(b.expiring) - Number(a.expiring) || a.id.localeCompare(b.id),
      );
      const item = matches[0];
      return {
        name: ingredient.name,
        optional: ingredient.optional,
        seasoning: ingredient.seasoning,
        pantry: !item && ingredient.choices.some((name) => pantry.has(name)),
        ...(item
          ? {
              ingredientId: item.id,
              unit: item.unit,
              available: item.available,
              expiring: item.expiring,
            }
          : {}),
      };
    });
    // User-defined aliases may refer to a more specific product than the source ingredient.
    if (
      ingredients.some((ingredient) => {
        const item = available.find((i) => i.id === ingredient.ingredientId);
        return (
          item &&
          avoid.some((word) =>
            [item.name, ...item.aliases].some((name) =>
              canonicalIngredient(name).includes(word),
            ),
          )
        );
      })
    )
      continue;
    const main = ingredients.filter((i) => !i.optional && !i.seasoning);
    const matchedCount = main.filter((i) => !!i.ingredientId).length;
    if (input.scope === "inventory" && !matchedCount) continue;
    const missing = ingredients
      .filter((i) => !i.optional && !i.ingredientId && !i.pantry)
      .map((i) => i.name);
    const ready = !missing.length;
    if (input.readyOnly && !ready) continue;
    const expiring = [
      ...new Set(
        ingredients.filter((i) => i.expiring && !i.optional).map((i) => i.name),
      ),
    ];
    const score =
      (ready ? 10000 : 0) +
      (matchedCount / Math.max(main.length, 1)) * 1000 -
      missing.length * 20 +
      Math.min(expiring.length, 5) * 15 +
      Math.min(matchedCount, 10) +
      taste.filter((word) => text.includes(word)).length * 2;
    ranked.push({
      score,
      recipe: {
        id: source.id,
        name: source.name,
        category: source.category,
        servings: input.servings,
        minutes: source.minutes,
        ingredients,
        ingredientNotes: source.ingredientNotes,
        quantityNotes: source.quantityNotes,
        quantityBlocks: source.quantityBlocks as LocalRecipe["quantityBlocks"],
        steps: source.steps,
        stepSections: source.stepSections,
        tips: source.tips,
        tipBlocks: source.tipBlocks as LocalRecipe["tipBlocks"],
        sourceUrl: `${catalog.sourceUrl}/blob/${catalog.sourceCommit}/${source.sourcePath.split("/").map(encodeURIComponent).join("/")}`,
        matchedCount,
        requiredCount: main.length,
        ready,
        missing,
        expiring,
      },
    });
  }
  ranked.sort(
    (a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id),
  );
  return {
    recipes: ranked
      .slice(input.offset, input.offset + input.limit)
      .map((r) => r.recipe),
    total: ranked.length,
    catalogSize: catalog.recipes.length,
    offset: input.offset,
    hasMore: input.offset + input.limit < ranked.length,
  };
}

export function recipeRoutes(app: FastifyInstance) {
  app.get("/api/recipes/catalog", async (req) => {
    await actor(req);
    return {
      count: catalog.recipes.length,
      categories: [...new Set(catalog.recipes.map((r) => r.category))],
      source: catalog.source,
      sourceUrl: catalog.sourceUrl,
      license: catalog.license,
    };
  });
  app.post("/api/recipes/recommend", async (req) => {
    const a = await actor(req);
    const input = localRecommendInput.parse(req.body);
    const [family, items] = await db.$transaction([
      db.family.findUniqueOrThrow({ where: { id: a.familyId } }),
      db.ingredient.findMany({
        where: { familyId: a.familyId, archived: false },
        include: { batches: true },
      }),
    ]);
    await actor(req);
    return rankLocalRecipes(items, family.preferences as Preferences, input);
  });
}
