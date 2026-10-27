import { describe, expect, it } from "vitest";
import {
  blocksToText,
  prepareRecipeSource,
  readableRecipeBlocks,
  readableRecipeSteps,
  readableRecipeText,
} from "../scripts/recipe-text.js";
import catalog from "../apps/api/src/data/recipes.json" with { type: "json" };

describe("recipe reading text", () => {
  it("removes presentation markup while retaining text and link labels", () => {
    const text = readableRecipeText(
      "### 小贴士\n\n> **小火**煮至*软烂*，_拌匀_。\n[做法（参考）](https://example.com/recipe_(a))\n![照片](image.jpg)",
    );
    expect(text).toBe("小贴士：\n\n小火煮至软烂，拌匀。\n做法（参考）");
    expect(
      readableRecipeText("[教程\\_哔哩哔哩\\_bilibili](https://example.com)"),
    ).toBe("教程 哔哩哔哩 bilibili");
  });
  it("retains quantities, dimensions, inequalities and escaped multiplication", () => {
    expect(readableRecipeText("盐（份数\\*4g - 份数*6g）")).toBe(
      "盐（份数 × 4g - 份数 × 6g）",
    );
    expect(
      readableRecipeText("切成 4cm*4cm*5cm；1.5 个 * 份数；加热 *30s*。"),
    ).toBe("切成 4cm × 4cm × 5cm；1.5 个 × 份数；加热 30s。");
    expect(
      readableRecipeText(
        "$0.7cm \\times 2.5cm$；$\\pm 5$ 分钟；咸度 < 预期，温度 > 60℃。",
      ),
    ).toBe("0.7cm × 2.5cm；± 5 分钟；咸度 < 预期，温度 > 60℃。");
  });
  it("keeps every table cell with column labels", () => {
    const blocks = readableRecipeBlocks(
      "| 原料 | 6 寸 | 8 寸 |\n| :--- | ---: | --- |\n| 鸡蛋 | 3 个 | 5 个 |\n| 牛奶 | 30g | 50g |",
    );
    expect(blocks).toEqual([
      {
        type: "table",
        headers: ["原料", "6 寸", "8 寸"],
        rows: [
          ["鸡蛋", "3 个", "5 个"],
          ["牛奶", "30g", "50g"],
        ],
      },
    ]);
    expect(blocksToText(blocks)).toContain("原料：牛奶；6 寸：30g；8 寸：50g");
  });
  it("omits redundant diagrams, preserves text ratios and rejects untranslated code", () => {
    expect(
      readableRecipeText("### 流程图解\n```mermaid\ngraph TD\nA-->B\n```"),
    ).toBe("");
    expect(
      readableRecipeText("```text\n面粉 : 水 : 盐\n100 : 70 : 0.6\n```"),
    ).toBe("面粉 : 水 : 盐\n100 : 70 : 0.6");
    expect(() =>
      readableRecipeText("```shell\nwhile (true) run();\n```"),
    ).toThrow("Untranslated recipe code block");
  });
  it("keeps phase headings separate from steps and bounds saved meal snapshots", () => {
    const result = readableRecipeSteps(
      "### 准备\n1. 洗菜\n  - 沥干水分\n### 烹饪\n" +
        Array.from({ length: 24 }, (_, i) => `${i + 1}. 翻炒 ${i + 1} 秒`).join(
          "\n",
        ),
    );
    expect(result.sections[0]).toEqual({
      title: "准备",
      steps: ["洗菜\n沥干水分"],
    });
    expect(result.sections[1].steps).toHaveLength(24);
    expect(result.steps.length).toBeLessThanOrEqual(20);
    expect(result.steps[0]).toContain("准备：\n洗菜");
  });
  it("translates cooking loops without losing timings, quantities or stop conditions", () => {
    const sun = catalog.recipes.find((r) => r.name === "太阳蛋")!;
    expect(sun.stepSections.map((s) => s.title)).toEqual([
      "方法一：可调火力的微波炉",
      "方法二：仅能设置时间的微波炉",
    ]);
    expect(sun.steps.join("\n")).toContain(
      "每次继续用微波炉加热 30 秒，加热后检查，重复至蛋液大面积凝固",
    );
    expect(sun.tips).toContain("每次继续加热 1 分钟");
    expect(sun.steps.join("\n")).toContain("牙签戳 5 个或筷子戳 1 个");
    expect(
      catalog.recipes.find((r) => r.name === "日式肥牛丼饭")!.tips,
    ).toContain("每次加入 1 克酱油，搅匀后再尝");
    expect(prepareRecipeSource("青椒酿（fork 版本）", "example.md")).toBe(
      "青椒酿（替换做法）",
    );
  });
  it("all bundled recipes have complete readable sections without source syntax", () => {
    expect(catalog.recipes).toHaveLength(331);
    for (const recipe of catalog.recipes) {
      expect(
        recipe.stepSections.flatMap((s) => s.steps).length,
      ).toBeGreaterThan(0);
      const display = [
        ...recipe.ingredients.map((ingredient) => ingredient.name),
        ...recipe.ingredientNotes,
        recipe.quantityNotes,
        ...recipe.steps,
        recipe.tips,
      ].join("\n");
      expect(display, recipe.name).not.toMatch(
        /```|#{3,6}|\b(?:while|struct|implements|extends|fork)\b|\\(?:times|pm)|\*\*|\[[^\]]+\]\(/,
      );
      expect(
        recipe.ingredients.map((i) => i.name).join("\n"),
        recipe.name,
      ).not.toMatch(/[#*_`\\[\]]/);
    }
    expect(
      catalog.recipes.find((r) => r.name === "戚风蛋糕")!.ingredients,
    ).toContainEqual({
      name: "柠檬汁或白醋",
      choices: ["柠檬汁", "白醋"],
      optional: true,
      seasoning: false,
    });
    expect(
      catalog.recipes
        .find((r) => r.name === "魔芋蛋糕")!
        .ingredients.some((i) => i.name.includes("分蛋器")),
    ).toBe(false);
  });
});
