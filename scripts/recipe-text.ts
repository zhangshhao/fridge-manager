import type {
  RecipeTextBlock,
  RecipeStepSection,
} from "../packages/shared/src/index.js";

// These edits translate the pinned source's programming jokes into cooking instructions.
// Keep the original conditions, quantities and timings; never execute source code.
export function prepareRecipeSource(text: string, path: string): string {
  if (path === "dishes/breakfast/太阳蛋.md") {
    text = text
      .replace(
        "while（太阳蛋 否 大面积成固体状） 用微波炉打(30s);",
        "如果蛋液还没有大面积凝固，每次继续用微波炉加热 30 秒，加热后检查，重复至蛋液大面积凝固。",
      )
      .replace(
        "while（太阳蛋的熟度 不符合 个人口味） 用微波炉打（1 分钟）;",
        "如果熟度还不符合个人口味，可每次继续加热 1 分钟，每次加热后检查，达到所需熟度后停止。",
      )
      .replace("### 可控火候微波炉", "### 方法一：可调火力的微波炉")
      .replace("### 不可控火候微波炉", "### 方法二：仅能设置时间的微波炉");
  }
  if (path === "dishes/staple/日式肥牛丼饭/日式肥牛丼饭.md") {
    text = text.replace(
      /```shell\n[\s\S]*?```/,
      "尝一口汤汁；如果咸度不够，每次加入 1 克酱油，搅匀后再尝，直到符合口味。",
    );
  }
  if (path === "dishes/meat_dish/桂林十八酿/桂林十八酿.md") {
    text = text.replace(
      /### 桥接模式[\s\S]*?(?=^## 附加内容)/m,
      "### 食材与馅料的搭配\n\n青椒、苦瓜、茄子、豆腐、香菇等食材，可以分别搭配猪肉馅、虾滑馅或鱼肉馅。猪肉也可以与虾滑或螺肉混合。更换外层食材或馅料，就能做出不同口味的酿菜。\n\n",
    );
  }
  if (path === "dishes/meat_dish/土豆炖排骨/土豆炖排骨.md") {
    const edits = [
      ["注意：以下参数为标准", "以下用量适合"],
      ["的精确配置。", "。"],
      ["预处理：调料封装与异步任务", "准备调料和开水"],
      ["封装酱汁碗（一键调用）", "调好酱汁"],
      ["封装香料碟（一键调用）", "备好香料"],
      ["开启异步水程", "提前烧水"],
      ["核心炒制：糖色与爆香（高并发阶段）", "炒糖色与爆香"],
      ["一键爆香", "倒入香料爆香"],
      ["一键调味", "倒入酱汁调味"],
      ["作为 UI 点缀", "点缀"],
    ];
    for (const [from, to] of edits) text = text.replaceAll(from, to);
  }
  if (path === "dishes/staple/蛋炒饭.md") {
    text = text.replace("份数*1.5 // 1 向下取整", "份数 × 1.5，向下取整");
  }
  return text.replace(/\bfork\s*版本/g, "替换做法");
}

// Retain link labels (including nested brackets), discard URLs and images.
function links(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; ) {
    const start = i;
    const image = text[i] === "!" && text[i + 1] === "[";
    const open = image ? i + 1 : i;
    if (text[open] !== "[") {
      result += text[i++];
      continue;
    }
    let depth = 1,
      close = open + 1;
    for (; close < text.length && depth; close++) {
      if (text[close] === "\\") {
        close++;
        continue;
      }
      if (text[close] === "[") depth++;
      if (text[close] === "]") depth--;
    }
    if (depth || text[close] !== "(") {
      result += text[i++];
      continue;
    }
    let end = close + 1;
    depth = 1;
    for (; end < text.length && depth; end++) {
      if (text[end] === "\\") {
        end++;
        continue;
      }
      if (text[end] === "(") depth++;
      if (text[end] === ")") depth--;
    }
    if (depth) {
      result += text[i++];
      continue;
    }
    if (!image) result += text.slice(open + 1, close - 1);
    i = end;
    if (i <= start) throw new Error("Invalid link boundary");
  }
  return result;
}

function inline(text: string): string {
  return (
    links(text)
      .replace(/<!--[^]*?-->/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      // Do not mistake comparisons such as "咸度 < 预期" for HTML.
      .replace(
        /<\/?(?:p|div|span|b|strong|em|i|u|s|del|sub|sup|img|a)\b[^>]*>/gi,
        "",
      )
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\\times\b/g, "×")
      .replace(/\\pm\b/g, "±")
      .replace(/\$([^$\n]+)\$/g, "$1")
      // Escaped multiplication must not be paired with a later emphasis marker.
      .replace(/\\\*/g, " × ")
      .replace(/\\_/g, " ")
      .replace(/\*\*([^]*?)\*\*|__([^]*?)__/g, (_all, a, b) => a ?? b)
      .replace(/`([^`]+)`/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")
      .replace(
        /(?<!\*)\*([^\s*](?:[^*\n]*?[^\s*])?)\*(?!\*)/g,
        (all, content: string, offset: number, source: string) => {
          if (/^\s|\s$/.test(content)) return all;
          if (
            /\w/.test(source[offset - 1] || "") &&
            /\w/.test(source[offset + all.length] || "")
          )
            return all;
          return content;
        },
      )
      .replace(/_([^_\n]+)_/g, "$1")
      .replace(/_/g, " ")
      .replace(/\[可选\]/g, "（可选）")
      .replace(/\\([*_\[\]()#])/g, "$1")
      .replace(/\*(?=注|：|[（(]注)|(?<=参考)\*/g, "")
      .replace(/[ \t]*\*[ \t]*/g, " × ")
      .replace(/[ \t]*×[ \t]*/g, " × ")
      .trim()
  );
}

export function readableRecipeBlocks(markdown: string): RecipeTextBlock[] {
  const text = markdown
    .replace(/\r\n/g, "\n")
    .replace(
      /```\s*([^\n]*)\n([^]*?)```/g,
      (_all, type: string, body: string) => {
        if (type.trim() === "mermaid") return ""; // Duplicates the numbered cooking instructions.
        if (type.trim() && type.trim() !== "text")
          throw new Error(`Untranslated recipe code block: ${type}`);
        return body;
      },
    );
  const lines = text.split("\n");
  const blocks: RecipeTextBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length)
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || /^[-*+]$/.test(raw) || /^(?:[-*_][ \t]*){3,}$/.test(raw)) {
      flush();
      continue;
    }
    const heading = raw.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/);
    if (heading) {
      flush();
      blocks.push({
        type: "heading",
        text: inline(heading[1]).replace(/^\d+[.、]\s*/, ""),
      });
      continue;
    }
    if (
      /^\|/.test(raw) &&
      /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[i + 1] || "")
    ) {
      flush();
      const cells = (line: string) =>
        line
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map(inline);
      const headers = cells(raw);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i]))
        rows.push(cells(lines[i++]));
      i--;
      blocks.push({ type: "table", headers, rows });
      continue;
    }
    const value = inline(
      raw
        .replace(/^(?:>\s*)+/, "")
        .replace(/^[-*+]\s+/, "")
        .replace(/^\[([ xX])\]\s*/, ""),
    );
    if (value) paragraph.push(value);
  }
  flush();
  return blocks.filter(
    (block, index) =>
      block.type !== "heading" ||
      (blocks[index + 1] && blocks[index + 1].type !== "heading"),
  );
}

export function blocksToText(blocks: RecipeTextBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === "heading") return `${block.text}：`;
      if (block.type === "paragraph") return block.text;
      return block.rows
        .map((row) =>
          row
            .map((cell, index) => `${block.headers[index]}：${cell}`)
            .join("；"),
        )
        .join("\n");
    })
    .join("\n\n");
}

export const readableRecipeText = (text: string) =>
  blocksToText(readableRecipeBlocks(text));

export function readableRecipeSteps(markdown: string): {
  sections: RecipeStepSection[];
  steps: string[];
} {
  const sections: RecipeStepSection[] = [];
  let current: RecipeStepSection = { title: "", steps: [] };
  for (const raw of markdown.split("\n")) {
    const heading = raw.trim().match(/^#{3,6}\s+(.+)/);
    if (heading) {
      if (current.steps.length) sections.push(current);
      current = {
        title: inline(heading[1]).replace(/^\d+[.、]\s*/, ""),
        steps: [],
      };
      continue;
    }
    const line = readableRecipeText(raw).replace(/^\d+[.、)]\s*/, "");
    if (!line) continue;
    if (line.length > 1000)
      throw new Error("A source step needs manual splitting");
    if (
      /^\s{2,}|^\s*>/.test(raw) &&
      current.steps.length &&
      current.steps.at(-1)!.length + line.length < 900
    ) {
      current.steps[current.steps.length - 1] += "\n" + line;
    } else current.steps.push(line);
  }
  if (current.steps.length) sections.push(current);
  const steps = sections.flatMap((section) =>
    section.steps.map((step, index) =>
      section.title && index === 0 ? `${section.title}：\n${step}` : step,
    ),
  );
  while (steps.length > 20) {
    const index = steps.findIndex(
      (step, i) =>
        i + 1 < steps.length && step.length + steps[i + 1].length < 900,
    );
    if (index < 0) break;
    steps.splice(index, 2, steps[index] + "\n" + steps[index + 1]);
  }
  return { sections, steps };
}
