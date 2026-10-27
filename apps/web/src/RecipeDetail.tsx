import {
  BookOpen,
  Clock3,
  CookingPot,
  ExternalLink,
  Lightbulb,
  Users,
} from "lucide-react";
import type { LocalRecipe, RecipeTextBlock } from "@fridge/shared";
import { formatQty } from "./api";
import { Sheet } from "./components";

function RecipeNotes({ blocks }: { blocks: RecipeTextBlock[] }) {
  return (
    <div className="recipe-reader-notes">
      {blocks.map((block, index) => {
        if (block.type === "heading") return <h4 key={index}>{block.text}</h4>;
        if (block.type === "table")
          return (
            <div
              className="recipe-reader-table"
              role="region"
              aria-label="菜谱参考表"
              tabIndex={0}
              key={index}
            >
              <table>
                <thead>
                  <tr>
                    {block.headers.map((header, i) => (
                      <th scope="col" key={i}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) =>
                        j === 0 ? (
                          <th scope="row" key={j}>
                            {cell}
                          </th>
                        ) : (
                          <td key={j}>{cell}</td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        const lines = block.text.split("\n").filter(Boolean);
        return lines.length > 1 ? (
          <ul key={index}>
            {lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>{block.text}</p>
        );
      })}
    </div>
  );
}

export function RecipeDetail({
  recipe,
  servings,
  close,
}: {
  recipe: LocalRecipe;
  servings: number;
  close: () => void;
}) {
  const quantityBlocks = recipe.quantityBlocks.length
    ? recipe.quantityBlocks
    : recipe.ingredientNotes.map(
        (text): RecipeTextBlock => ({ type: "paragraph", text }),
      );
  return (
    <Sheet title={recipe.name} close={close} className="recipe-reader">
      <div className="recipe-reader-summary">
        <div className="recipe-reader-tags">
          <span>
            <BookOpen size={15} />
            {recipe.category}
          </span>
          <span>
            <Clock3 size={15} />
            {recipe.minutes === null
              ? "时长未注明"
              : `约 ${recipe.minutes} 分钟`}
          </span>
          <span>
            <Users size={15} />
            计划 {servings} 人用餐
          </span>
        </div>
        <p>
          {recipe.ready
            ? "食材种类已齐，开做前再核对一下用量。"
            : `还需准备：${recipe.missing.join("、")}。`}
        </p>
      </div>

      <section className="recipe-reader-section" aria-label="准备食材">
        <div className="recipe-reader-section-head">
          <h3>准备食材</h3>
          <span>对照冰箱，备齐再开火</span>
        </div>
        <ul className="recipe-reader-ingredients">
          {recipe.ingredients.map((food, index) => (
            <li key={index}>
              <div>
                <strong>{food.name}</strong>
                {food.optional && <small>可选</small>}
              </div>
              <div className="recipe-reader-availability">
                {food.ingredientId && (
                  <span>
                    {formatQty(food.available || "0")} {food.unit} 可用
                  </span>
                )}
                <span
                  className={`recipe-reader-status ${food.ingredientId || food.pantry ? "available" : food.optional ? "optional" : "missing"}`}
                >
                  {food.ingredientId
                    ? "有库存"
                    : food.pantry
                      ? "家中常备"
                      : food.optional
                        ? "按需准备"
                        : "待补充"}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <div className="recipe-reader-quantities">
          <h4>用量参考</h4>
          <RecipeNotes blocks={quantityBlocks} />
          <p className="recipe-reader-portion-note">
            保留菜谱原份数，请按 {servings}{" "}
            人的食量调整。记餐时填写实际用量后，才会扣减库存。
          </p>
        </div>
      </section>

      <section className="recipe-reader-section" aria-label="烹饪步骤">
        <div className="recipe-reader-section-head">
          <h3>
            <CookingPot size={20} />
            开始做菜
          </h3>
          <span>一步一步，慢慢来</span>
        </div>
        {recipe.stepSections.map((section, index) => (
          <div className="recipe-reader-phase" key={index}>
            {section.title && <h4>{section.title}</h4>}
            <ol className="recipe-reader-steps">
              {section.steps.map((step, i) => (
                <li key={i}>
                  <span aria-hidden="true" className="recipe-reader-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      {recipe.tipBlocks.length > 0 && (
        <aside className="recipe-reader-tips" aria-label="小贴士">
          <h3>
            <Lightbulb size={20} />
            小贴士
          </h3>
          <RecipeNotes blocks={recipe.tipBlocks} />
        </aside>
      )}
      <footer className="recipe-reader-source">
        <span>菜谱来自 HowToCook</span>
        <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">
          查看原始菜谱与配图 <ExternalLink size={14} />
        </a>
      </footer>
    </Sheet>
  );
}
