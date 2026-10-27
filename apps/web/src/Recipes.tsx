import { useState } from "react";
import {
  Sparkles,
  Clock3,
  Users,
  Plus,
  Check,
  ArrowRight,
  ChefHat,
} from "lucide-react";
import type { Recipe } from "@fridge/shared";
import { api, emoji, formatQty, type Family, type Ingredient } from "./api";
import { Button, Field, ErrorBox, Empty, Sheet } from "./components";
import { newDraft, type Draft } from "./Meals";
import { LocalRecipes } from "./LocalRecipes";

function AiRecipes({
  family,
  items,
  cook,
  manual,
}: {
  family: Family;
  items: Ingredient[];
  cook: (d: Draft) => void;
  manual: () => void;
}) {
  const [servings, setServings] = useState(2);
  const [minutes, setMinutes] = useState(30);
  const [taste, setTaste] = useState(family.preferences.taste);
  const [avoid, setAvoid] = useState(family.preferences.avoid.join("，"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [detail, setDetail] = useState<Recipe | null>(null);
  async function generate() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ recipes: Recipe[] }>("/recommend", {
        method: "POST",
        body: {
          servings,
          minutes,
          taste,
          avoid: avoid
            .split(/[，,]/)
            .map((v) => v.trim())
            .filter(Boolean),
        },
      });
      setRecipes(result.recipes);
      setSelected([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function prepare() {
    const draft = newDraft();
    draft.servings = servings;
    draft.dishes = selected.map((index) => {
      const r = recipes[index];
      return {
        name: r.name,
        steps: r.steps,
        usages: [
          ...r.ingredients.map((u) => ({
            ...u,
            name:
              items.find((i) => i.id === u.ingredientId)?.name || "未知食材",
            untracked: false,
            allowExpired: false,
          })),
          ...r.missing.map((u) => ({
            ...u,
            untracked: true,
            allowExpired: false,
          })),
        ],
      };
    });
    cook(draft);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FROM YOUR FRIDGE, WITH LOVE</div>
          <h1>
            今天吃什么<span className="heading-dot">?</span>
          </h1>
          <p>冰箱里现有的食材，也能变出一桌小惊喜。</p>
        </div>
        <Button secondary onClick={manual}>
          <Plus size={17} />
          手动记一餐
        </Button>
      </div>
      <div className="recipe-banner">
        <div className="recipe-banner-icon">🥘</div>
        <div>
          <span className="hero-tag dark">
            <Sparkles size={14} /> AI 厨房灵感
          </span>
          <h2>少一点纠结，多一点好吃。</h2>
          <p>根据家中库存推荐 3 道菜，过期食材默认不参与推荐。</p>
        </div>
        <span className="recipe-banner-leaf">🌿</span>
      </div>
      <section className="panel preferences-panel">
        <div className="form-grid four">
          <Field label="几个人吃">
            <select
              value={servings}
              onChange={(e) => setServings(Number(e.target.value))}
            >
              {Array.from({ length: 10 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1} 人份
                </option>
              ))}
            </select>
          </Field>
          <Field label="准备花多久">
            <select
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {[15, 30, 45, 60, 90].map((n) => (
                <option key={n} value={n}>
                  {n} 分钟内
                </option>
              ))}
            </select>
          </Field>
          <Field label="今天的口味">
            <input
              maxLength={100}
              value={taste}
              onChange={(e) => setTaste(e.target.value)}
              placeholder="清淡、微辣、下饭…"
            />
          </Field>
          <Field label="忌口与过敏原">
            <input
              maxLength={300}
              value={avoid}
              onChange={(e) => setAvoid(e.target.value)}
              placeholder="多个忌口用逗号分隔"
            />
          </Field>
        </div>
        <div className="recipe-actions">
          <span>
            常备调料：{family.preferences.seasonings.join("、") || "未设置"}
            <small> AI 生成内容请核对食材及忌口</small>
          </span>
          <Button loading={busy} onClick={generate}>
            <Sparkles size={17} />
            {busy
              ? "正在想点好吃的…"
              : recipes.length
                ? "换一组灵感"
                : "给我 3 道菜的灵感"}
          </Button>
        </div>
        <ErrorBox error={error} />
      </section>
      {recipes.length === 0 ? (
        <div className="recipe-empty">
          <Empty
            icon="👨‍🍳"
            title={
              busy ? "正在翻翻冰箱，想想菜单…" : "今天的菜单，从你的冰箱开始"
            }
          >
            {busy
              ? "通常需要十几秒，稍等一会儿。"
              : "选好人数和口味，管家就来帮你安排。没有 AI 也能手动记录每一餐。"}
          </Empty>
        </div>
      ) : (
        <>
          <div className="section-title">
            <div>
              <h2>为你推荐的家常味道</h2>
              <span>AI 生成 · 勾选菜品，再确认整餐实际用量</span>
            </div>
            <span className="muted">已选 {selected.length} 道</span>
          </div>
          <div className="recipe-grid">
            {recipes.map((r, index) => (
              <article
                className={`recipe-card ${selected.includes(index) ? "selected" : ""}`}
                key={index}
              >
                <div className={`recipe-art art-${index}`}>
                  <span>
                    {emoji(
                      items.find((i) => i.id === r.ingredients[0]?.ingredientId)
                        ?.name || "",
                    )}
                  </span>
                  <small>AI 生成</small>
                  <button
                    aria-label={`选择${r.name}`}
                    className={`recipe-check ${selected.includes(index) ? "active" : ""}`}
                    onClick={() =>
                      setSelected((prev) =>
                        prev.includes(index)
                          ? prev.filter((i) => i !== index)
                          : [...prev, index],
                      )
                    }
                  >
                    {selected.includes(index) ? (
                      <Check size={17} />
                    ) : (
                      <Plus size={17} />
                    )}
                  </button>
                </div>
                <div className="recipe-card-body">
                  <h3>{r.name}</h3>
                  <div className="recipe-meta">
                    <span>
                      <Clock3 size={14} />
                      {r.minutes} 分钟
                    </span>
                    <span>
                      <Users size={14} />
                      {r.servings} 人份
                    </span>
                  </div>
                  <p>
                    {r.ingredients
                      .map(
                        (i) =>
                          items.find((it) => it.id === i.ingredientId)?.name,
                      )
                      .join(" · ")}
                  </p>
                  <span
                    className={`fresh-pill ${r.missing.length ? "soon" : ""}`}
                  >
                    {r.missing.length
                      ? `需补 ${r.missing.map((i) => i.name).join("、")}`
                      : "库存食材就能做"}
                  </span>
                  <button className="text-link" onClick={() => setDetail(r)}>
                    看看怎么做 <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="cook-selection">
            <span>
              <ChefHat size={21} />
              选好了，就把灵感变成一餐。
            </span>
            <Button disabled={!selected.length} onClick={prepare}>
              确认用量，记下这一餐 <ArrowRight size={16} />
            </Button>
          </div>
        </>
      )}
      {detail && (
        <Sheet title={detail.name} close={() => setDetail(null)}>
          <p className="muted">
            AI 生成 · {detail.minutes} 分钟 · {detail.servings} 人份
          </p>
          <h3>建议用料</h3>
          {detail.ingredients.map((u, i) => (
            <div className="split usage-display" key={i}>
              <span>{items.find((it) => it.id === u.ingredientId)?.name}</span>
              <span>
                {formatQty(u.quantity)} {u.unit}
              </span>
            </div>
          ))}
          {detail.missing.length > 0 && (
            <>
              <h3>还需要补充</h3>
              {detail.missing.map((u, i) => (
                <div className="split usage-display" key={i}>
                  <span>{u.name}</span>
                  <span>
                    {formatQty(u.quantity)} {u.unit}
                  </span>
                </div>
              ))}
              <p className="small-note">
                缺料会在确认页标记为“未入库食材”。如果要扣减库存，请先入库并改选对应食材。
              </p>
            </>
          )}
          <h3>一起做起来</h3>
          <ol className="steps-list">
            {detail.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <p className="small-note">
            用量为 AI 建议，做完后请按实际使用数量确认。
          </p>
        </Sheet>
      )}
    </>
  );
}

export function Recipes(props: Parameters<typeof AiRecipes>[0]) {
  const [mode, setMode] = useState<"local" | "ai">("local");
  return (
    <>
      <div className="recipe-mode" role="group" aria-label="推荐方式">
        <button
          aria-pressed={mode === "local"}
          onClick={() => setMode("local")}
        >
          本地菜谱
        </button>
        <button aria-pressed={mode === "ai"} onClick={() => setMode("ai")}>
          AI 灵感（可选）
        </button>
      </div>
      {mode === "local" ? (
        <LocalRecipes {...props} />
      ) : (
        <AiRecipes {...props} />
      )}
    </>
  );
}
