import { describe, expect, it } from "vitest";
import catalog from "../apps/api/src/data/recipes.json" with { type: "json" };
import { rankLocalRecipes, type RecipeStock } from "../apps/api/src/recipes.js";
import { canonicalIngredient } from "../apps/api/src/recipe-ingredients.js";
import {
  localRecommendInput,
  type Preferences,
} from "../packages/shared/src/index.js";

const day = "2026-10-27";
const prefs: Preferences = {
  expiringDays: 3,
  seasonings: ["油", "盐", "生抽"],
  avoid: [],
  taste: "清淡",
};
const input = (extra: object = {}) =>
  localRecommendInput.parse({
    servings: 2,
    minutes: 0,
    avoid: [],
    taste: "",
    limit: 24,
    ...extra,
  });
const food = (name: string, extra: Partial<RecipeStock> = {}): RecipeStock => ({
  id: name,
  name,
  aliases: [],
  unit: "个",
  archived: false,
  batches: [{ remaining: "10", archived: false, expiresAt: null }],
  ...extra,
});
const tomato = (stock: RecipeStock[], options = {}, preferences = prefs) =>
  rankLocalRecipes(
    stock,
    preferences,
    input({ query: "西红柿炒鸡蛋", ...options }),
    day,
  ).recipes.find((r) => r.name === "西红柿炒鸡蛋");

describe("bundled recipe recommendations", () => {
  it("bundles hundreds of distinct sourced recipes with complete bounded meal steps", () => {
    expect(catalog.recipes.length).toBeGreaterThanOrEqual(300);
    expect(new Set(catalog.recipes.map((r) => r.id)).size).toBe(
      catalog.recipes.length,
    );
    expect(catalog.license).toBe("Unlicense");
    for (const recipe of catalog.recipes) {
      expect(recipe.sourcePath).toMatch(
        /^dishes\/(?!template|drink|condiment)/,
      );
      expect(recipe.ingredients.some((i) => !i.seasoning && !i.optional)).toBe(
        true,
      );
      expect(recipe.ingredients.length).toBeLessThanOrEqual(30);
      expect(recipe.steps.length).toBeGreaterThan(0);
      expect(recipe.steps.length).toBeLessThanOrEqual(20);
      expect(recipe.steps.every((s) => s.length > 0 && s.length <= 1000)).toBe(
        true,
      );
    }
    expect(
      catalog.recipes.find((r) => r.name === "西红柿炒鸡蛋")!.quantityNotes,
    ).toContain("1.5 个 × 份数");
  });
  it("matches common and user aliases, uses original units and never invents quantities", () => {
    const recipe = tomato([
      food("番茄"),
      food("土鸡蛋", { aliases: ["鸡蛋"], unit: "盒" }),
    ])!;
    expect(recipe.ready).toBe(true);
    expect(recipe.matchedCount).toBe(2);
    const egg = recipe.ingredients.find((i) => i.name === "鸡蛋")!;
    expect(egg.ingredientId).toBe("土鸡蛋");
    expect(egg.unit).toBe("盒");
    expect(egg).not.toHaveProperty("quantity");
    expect(canonicalIngredient("鸡胸肉")).not.toBe(
      canonicalIngredient("鸡腿肉"),
    );
    expect(canonicalIngredient("虾仁")).not.toBe(canonicalIngredient("虾"));
  });
  it("excludes expired, empty and archived stock and reports missing seasonings", () => {
    const eggs = food("鸡蛋");
    for (const invalid of [
      food("番茄", { archived: true }),
      food("番茄", {
        batches: [
          { remaining: "100", expiresAt: "2026-10-26", archived: false },
        ],
      }),
      food("番茄", {
        batches: [{ remaining: "0", expiresAt: null, archived: false }],
      }),
      food("番茄", {
        batches: [{ remaining: "100", expiresAt: null, archived: true }],
      }),
    ])
      expect(tomato([eggs, invalid])!.missing).toContain("西红柿");
    expect(tomato([eggs], { readyOnly: true })).toBeUndefined();
    expect(
      tomato([eggs, food("番茄")], {}, { ...prefs, seasonings: ["盐"] })!
        .missing,
    ).toContain("食用油");
    expect(tomato([eggs, food("番茄")])!.missing).not.toContain("糖");
  });
  it("adds family avoidances, checks optional ingredients and the original procedure", () => {
    const stock = [food("番茄"), food("鸡蛋")];
    expect(tomato(stock, { avoid: ["蛋"] })).toBeUndefined();
    expect(
      tomato(stock, { avoid: [] }, { ...prefs, avoid: ["鸡蛋"] }),
    ).toBeUndefined();
    expect(tomato(stock, { avoid: ["糖"] })).toBeUndefined();
    expect(tomato(stock, { avoid: ["醋"] })).toBeUndefined();
    expect(tomato(stock, { avoid: ["香蕉"] })).toBeDefined();
    expect(
      tomato([...stock, food("花生油", { aliases: ["油"] })], {
        avoid: ["花生"],
      }),
    ).toBeUndefined();
  });
  it("ranks ready recipes first, marks usable expiring batches and paginates stably", () => {
    const stock = [
      food("番茄", {
        batches: [{ remaining: "4", expiresAt: day, archived: false }],
      }),
      food("鸡蛋"),
    ];
    const full = rankLocalRecipes(stock, prefs, input({ limit: 24 }), day);
    expect(full.recipes[0].ready).toBe(true);
    expect(tomato(stock)!.expiring).toContain("西红柿");
    const first = rankLocalRecipes(stock, prefs, input({ limit: 3 }), day);
    const second = rankLocalRecipes(
      stock,
      prefs,
      input({ limit: 3, offset: 3 }),
      day,
    );
    expect([...first.recipes, ...second.recipes].map((r) => r.id)).toEqual(
      full.recipes.slice(0, 6).map((r) => r.id),
    );
    expect(first.hasMore).toBe(true);
    expect(
      rankLocalRecipes(stock, prefs, input({ offset: 9999 }), day).recipes,
    ).toEqual([]);
  });
  it("supports browsing with no stock and applies time and category filters", () => {
    expect(rankLocalRecipes([], prefs, input(), day).recipes).toEqual([]);
    expect(tomato([], { scope: "all" })!.missing).toContain("鸡蛋");
    const stock = [food("番茄"), food("鸡蛋")];
    expect(tomato(stock, { minutes: 10 })).toBeUndefined();
    expect(tomato(stock, { minutes: 15 })).toBeDefined();
    expect(tomato(stock, { category: "水产" })).toBeUndefined();
    const limited = rankLocalRecipes(stock, prefs, input({ minutes: 15 }), day);
    expect(
      limited.recipes.every((r) => r.minutes !== null && r.minutes <= 15),
    ).toBe(true);
  });
  it("browses the entire catalog across pages even with an empty fridge", () => {
    const ids: string[] = [];
    for (let offset = 0; offset < catalog.recipes.length; offset += 24) {
      const page = rankLocalRecipes(
        [],
        prefs,
        input({ scope: "all", offset }),
        day,
      );
      expect(page.total).toBe(catalog.recipes.length);
      expect(page.catalogSize).toBe(catalog.recipes.length);
      expect(page.hasMore).toBe(offset + 24 < catalog.recipes.length);
      ids.push(...page.recipes.map((recipe) => recipe.id));
    }
    expect(new Set(ids).size).toBe(catalog.recipes.length);
    expect(ids.length).toBe(catalog.recipes.length);
    expect(tomato([])).toBeUndefined();
    expect(tomato([], { scope: "all", readyOnly: true })).toBeUndefined();
    expect(tomato([], { scope: "all", avoid: ["鸡蛋"] })).toBeUndefined();
    expect(tomato([], { scope: "all", category: "水产" })).toBeUndefined();
    expect(tomato([], { scope: "all", minutes: 10 })).toBeUndefined();
    const stock = [food("番茄"), food("鸡蛋")];
    const matched = rankLocalRecipes(stock, prefs, input(), day);
    const all = rankLocalRecipes(stock, prefs, input({ scope: "all" }), day);
    expect(matched.total).toBeLessThan(all.total);
    expect(all.total).toBe(catalog.recipes.length);
  });
});
