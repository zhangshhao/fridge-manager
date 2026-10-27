import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import {
  blocksToText,
  prepareRecipeSource,
  readableRecipeBlocks,
  readableRecipeSteps,
  readableRecipeText,
} from "./recipe-text.js";
import {
  canonicalIngredient,
  ingredientChoices,
  isSeasoning,
} from "../apps/api/src/recipe-ingredients.js";

// Rebuild from a local, pinned HowToCook checkout. Never fetch recipes at runtime.
const commit = "308cc8b7dab1da84b20e7fafdf836a715437f582";
const repo = resolve(process.argv[2] || ".local/howtocook");
if (
  execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim() !== commit
)
  throw new Error(`Use HowToCook commit ${commit}`);
const license = readFileSync(resolve(repo, "LICENSE"), "utf8");
if (!license.includes("This is free and unencumbered software"))
  throw new Error("Unexpected source license");
const categories: Record<string, string> = {
  aquatic: "水产",
  breakfast: "早餐",
  dessert: "甜品",
  meat_dish: "荤菜",
  soup: "汤羹",
  staple: "主食",
  vegetable_dish: "素菜",
};
const plain = (text: string) =>
  text
    .replace(/!\[[^\]]*\]\([^\n)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^\n)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "")
    .replace(/\\\*/g, "*")
    .trim();
function section(text: string, name: string) {
  return (
    text
      .match(
        new RegExp(
          `^##\\s+${name}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`,
          "m",
        ),
      )?.[1]
      ?.trim() || ""
  );
}
const tools =
  /(?:锅|烤箱|微波炉|电饭煲|蒸箱|空气炸锅|刀|菜板|砧板|容器|碗|盘|勺|筷|筛|搅拌|料理机|打蛋器|分蛋器|保鲜膜|锡纸|锡箔|厨房纸|烘焙纸|油纸|模具|温度计|手套|竹签|牙签|裱花|硅胶|密封袋|杯|咖啡机|滤纸|擀面杖|刮板|秤|压面机|料理棒|盆|电磁炉|煤气灶|燃气灶|粉碎机|蒸笼|蒸架|蒸篦|烤网|烧烤炉|鏊子|电饼铛|轻食机|面包机|夹|铲|布|擦丝器|刨丝器|过滤网|滤网|捣药罐|秒表|定时器|小斧头|草垫|披萨石|炭火|簸箕|冰箱|笊篱|刷子)/;
function splitIngredients(line: string) {
  const parts: string[] = [];
  let depth = 0,
    current = "";
  for (const char of line) {
    if (/[（(\[]/.test(char)) depth++;
    if (/[）)\]]/.test(char)) depth = Math.max(0, depth - 1);
    if (char === "、" && depth === 0) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  return [...parts, current];
}
function parseIngredient(line: string) {
  const raw = plain(line.replace(/^\s*[-*+]\s+/, "")).replace(
    /[\p{Extended_Pictographic}\uFE0F]/gu,
    "",
  );
  if (
    !raw ||
    /^(?:可选|必备|必须|进阶|额外|其他|辅料|调料|调味|原料|食材|材料|工具|主料|配料|总量|总重|份数|人数|注|方法|原则|根据|如果|按照|每份|每次|单人|直径|可根据|一般|其中|米粥能够|中断大火|冷藏时间|淹过|煮玉米)/.test(
      raw,
    )
  )
    return null;
  let label = raw
    .replace(/^\[可选\]\s*/, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/\*注[\s\S]*$/, "")
    .replace(/[：:=，,；;].*$/, "")
    .trim();
  // The ingredient list normally names foods; remove quantities, keeping its original line for reference.
  label = label
    .replace(
      /^\d+(?:\.\d+)?\s*(?:kg|g|ml|l|克|千克|毫升|升|个|只|条|颗|棵|根|片|块|袋|盒|把|斤|两)\s*(?:的)?\s*/i,
      "",
    )
    .replace(
      /^(?:一|二|三|四|五|六|七|八|九|十|半|两)(?:个|只|条|颗|棵|根|片|块|袋|盒|把|斤|两|瓣|头)\s*/,
      "",
    )
    .replace(/\s*\d[\s\S]*$/, "")
    .replace(/\s+(?:适量|少许|若干)[\s\S]*$/, "")
    .replace(
      /(?:一|二|三|四|五|六|七|八|九|十|半|两)(?:个|只|条|颗|棵|根|片|块|袋|盒|把|斤|两)$/,
      "",
    )
    .replace(/\s+.+$/, "")
    .replace(
      /(?:的)?(?:用量|数量|比例|质量|体积|量|共需|共|约|大约|用量通常来说为|手指头大小|拳头大小)[\s\S]*$/,
      "",
    )
    .replace(/(?:半|四五|三四|一|两)(?:瓣|头|盒|包|瓶|朵)$/, "")
    .replace(/[（(][\s\S]*$/, "")
    .replace(/[*—。；;]+$/, "")
    .replace(/可选$/, "")
    .trim();
  if (!label || label.length > 40 || tools.test(label)) return null;
  if (
    /喜好|口味|根据|足够|可按|可准备|选择|推荐|均可|都可以|等配料|等调味|等蔬菜|等肉类/.test(
      label,
    )
  )
    return null;
  const choices = ingredientChoices(label);
  if (!choices.length || choices.every((v) => v === "水")) return null;
  return {
    name: label,
    choices,
    optional: /可选|备选|非必需|可不|可加可不加|按需|随意/.test(raw),
    seasoning: choices.every(isSeasoning),
  };
}
function duration(text: string): number | null {
  const intro = text.split(/^##\s/m)[0];
  const times = [
    ...intro.matchAll(
      /(\d+(?:\.\d+)?)\s*(?:[-~～—至到]\s*(\d+(?:\.\d+)?))?\s*(分钟|小时)(?:\s*(\d+)\s*分钟)?/g,
    ),
  ].map(
    (m) =>
      Number(m[2] || m[1]) * (m[3] === "小时" ? 60 : 1) + Number(m[4] || 0),
  );
  return times.length ? Math.ceil(Math.max(...times)) : null;
}
const recipes = [];
const skipped: string[] = [];
const base = resolve(repo, "dishes");
for (const entry of readdirSync(base, {
  recursive: true,
  withFileTypes: true,
})) {
  if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
  const file = resolve(entry.parentPath, entry.name);
  const path = relative(repo, file).replace(/\\/g, "/");
  const category = categories[path.split("/")[1]];
  if (!category) continue;
  const text = prepareRecipeSource(
    readFileSync(file, "utf8").replace(/\r\n/g, "\n"),
    path,
  );
  const ingredientText = section(text, "必备原料和工具");
  const notes = ingredientText
    .split(/\r?\n/)
    .filter((line) => /^\s*[-*+]\s+/.test(line))
    .map((line) => readableRecipeText(line.replace(/^\s*[-*+]\s+/, "")))
    .filter(Boolean);
  const parsed = (ingredientText + "\n" + section(text, "计算"))
    .split(/\r?\n/)
    .filter((line) => /^\s*[-*+]\s+/.test(line))
    .flatMap((line) => splitIngredients(line).map(parseIngredient))
    .filter((v) => v !== null);
  const ingredients = parsed
    .filter(
      (item, index) =>
        parsed.findIndex(
          (other) =>
            canonicalIngredient(other.name) === canonicalIngredient(item.name),
        ) === index,
    )
    .map((item) => ({
      ...item,
      optional: parsed.some(
        (other) =>
          canonicalIngredient(other.name) === canonicalIngredient(item.name) &&
          other.optional,
      ),
    }));
  const procedure = readableRecipeSteps(section(text, "操作"));
  if (
    !ingredients.some((i) => !i.optional && !i.seasoning) ||
    !procedure.steps.length ||
    procedure.steps.length > 20 ||
    ingredients.filter((i) => !i.optional).length > 30
  ) {
    skipped.push(path);
    continue;
  }
  const name = plain(text.match(/^#\s+(.+)$/m)?.[1] || entry.name.slice(0, -3))
    .replace(/的做法$/, "")
    .slice(0, 80);
  const quantityBlocks = readableRecipeBlocks(section(text, "计算"));
  const tipBlocks = readableRecipeBlocks(
    section(text, "附加内容").replace(/如果您遵循本指南[\s\S]*$/, ""),
  );
  recipes.push({
    id: createHash("sha256").update(path).digest("hex").slice(0, 16),
    name,
    category,
    minutes: duration(text),
    ingredients,
    ingredientNotes: notes,
    quantityNotes: blocksToText(quantityBlocks),
    quantityBlocks,
    steps: procedure.steps,
    stepSections: procedure.sections,
    tips: blocksToText(tipBlocks),
    tipBlocks,
    sourcePath: path,
  });
}
recipes.sort((a, b) => a.id.localeCompare(b.id));
if (recipes.length < 300)
  throw new Error(`Only ${recipes.length} recipes survived validation`);
const output = resolve("apps/api/src/data");
mkdirSync(output, { recursive: true });
writeFileSync(
  resolve(output, "recipes.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      source: "HowToCook",
      sourceUrl: "https://github.com/Anduin2017/HowToCook",
      sourceCommit: commit,
      license: "Unlicense",
      recipes,
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(resolve(output, "HowToCook-LICENSE.txt"), license);
console.log(
  JSON.stringify(
    {
      imported: recipes.length,
      timed: recipes.filter((r) => r.minutes !== null).length,
      skipped,
    },
    null,
    2,
  ),
);
