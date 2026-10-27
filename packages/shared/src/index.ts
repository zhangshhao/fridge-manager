import { z } from "zod";

export const units = ["克", "毫升", "个", "袋", "盒", "份"] as const;
export const regions = ["冷藏", "冷冻", "常温"] as const;
export const mealTypes = ["早餐", "午餐", "晚餐", "加餐"] as const;
export const quantity = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, "请输入最多 3 位小数的非负数量");
export const positiveQuantity = quantity.refine(
  (v) => Number(v) > 0,
  "数量必须大于 0",
);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式不正确")
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "日期不存在",
  );
export const credentials = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_\-]+$/, "用户名使用字母、数字或下划线"),
  password: z.string().min(10, "密码至少 10 位").max(128),
});
export const stockInput = z.object({
  ingredientId: z.string().optional(),
  name: z.string().trim().min(1).max(40),
  category: z.string().trim().min(1).max(20).default("其他"),
  unit: z.enum([...units, "千克", "升"]),
  quantity: positiveQuantity,
  region: z.enum(regions),
  purchasedAt: date.optional(),
  expiresAt: date.optional(),
  aliases: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});
export const usageInput = z
  .object({
    ingredientId: z.string().optional(),
    batchId: z.string().optional(),
    name: z.string().trim().min(1).max(60),
    quantity: positiveQuantity,
    unit: z.enum([...units, "千克", "升"]),
    untracked: z.boolean().default(false),
    allowExpired: z.boolean().default(false),
  })
  .refine(
    (v) => v.untracked || !!v.ingredientId,
    "请选择库存食材或标记为未入库食材",
  );
export const mealInput = z.object({
  date,
  mealType: z.enum(mealTypes),
  servings: z.number().int().min(1).max(20),
  note: z.string().max(500).default(""),
  dishes: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        steps: z.array(z.string().max(1000)).max(20).default([]),
        usages: z.array(usageInput).max(30),
      }),
    )
    .min(1)
    .max(10),
});
export const preferencesInput = z.object({
  expiringDays: z.number().int().min(0).max(30),
  seasonings: z.array(z.string().trim().min(1).max(30)).max(30),
  avoid: z.array(z.string().trim().min(1).max(30)).max(30),
  taste: z.string().max(100),
});
export const recommendInput = z.object({
  servings: z.number().int().min(1).max(20),
  minutes: z.number().int().min(5).max(180),
  taste: z.string().max(100),
  avoid: z.array(z.string().min(1).max(30)).max(30),
});
export const recipeSchema = z.object({
  name: z.string().min(1).max(80),
  servings: z.number().int().min(1).max(20),
  minutes: z.number().int().min(1).max(240),
  ingredients: z
    .array(
      z.object({
        ingredientId: z.string(),
        quantity: positiveQuantity,
        unit: z.enum(units),
      }),
    )
    .max(20),
  missing: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        quantity: positiveQuantity,
        unit: z.enum(units),
      }),
    )
    .max(15),
  steps: z.array(z.string().min(1).max(1000)).min(1).max(15),
});
export const recommendationSchema = z.object({
  recipes: z.array(recipeSchema).length(3),
});
export type MealInput = z.infer<typeof mealInput>;
export type UsageInput = z.infer<typeof usageInput>;
export type Recipe = z.infer<typeof recipeSchema>;
export type StockInput = z.infer<typeof stockInput>;
export type Preferences = z.infer<typeof preferencesInput>;

export const localRecommendInput = recommendInput.extend({
  scope: z.enum(["inventory", "all"]).default("inventory"),
  minutes: z.number().int().min(0).max(1440),
  query: z.string().trim().max(60).default(""),
  category: z
    .enum(["", "素菜", "荤菜", "水产", "汤羹", "主食", "早餐", "甜品"])
    .default(""),
  readyOnly: z.boolean().default(false),
  offset: z.number().int().min(0).max(10000).default(0),
  limit: z.number().int().min(1).max(24).default(12),
});
export type LocalRecipeIngredient = {
  name: string;
  optional: boolean;
  seasoning: boolean;
  pantry: boolean;
  ingredientId?: string;
  unit?: string;
  available?: string;
  expiring?: boolean;
};
export type LocalRecipe = {
  id: string;
  name: string;
  category: string;
  servings: number;
  minutes: number | null;
  ingredients: LocalRecipeIngredient[];
  ingredientNotes: string[];
  quantityNotes: string;
  quantityBlocks: RecipeTextBlock[];
  steps: string[];
  stepSections: RecipeStepSection[];
  tips: string;
  tipBlocks: RecipeTextBlock[];
  sourceUrl: string;
  matchedCount: number;
  requiredCount: number;
  ready: boolean;
  missing: string[];
  expiring: string[];
};
export type RecipeTextBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };
export type RecipeStepSection = { title: string; steps: string[] };
export type LocalRecommendation = {
  recipes: LocalRecipe[];
  total: number;
  catalogSize: number;
  offset: number;
  hasMore: boolean;
};
