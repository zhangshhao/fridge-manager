import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  Plus,
  Search,
} from "lucide-react";
import type {
  LocalRecipe,
  LocalRecommendation,
  UsageInput,
} from "@fridge/shared";
import { api, emoji, type Family, type Ingredient } from "./api";
import { Button, Empty, ErrorBox, Field } from "./components";
import { newDraft, type Draft } from "./Meals";
import { RecipeDetail } from "./RecipeDetail";

export function LocalRecipes({
  family,
  items,
  cook,
  manual,
}: {
  family: Family;
  items: Ingredient[];
  cook: (draft: Draft) => void;
  manual: () => void;
}) {
  const [filters, setFilters] = useState({
    servings: 2,
    minutes: 0,
    query: "",
    category: "",
    scope: "inventory" as "inventory" | "all",
    readyOnly: false,
    avoid: family.preferences.avoid.join("，"),
    taste: family.preferences.taste,
    offset: 0,
  });
  const [result, setResult] = useState<LocalRecommendation | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<LocalRecipe | null>(null);
  const [reload, setReload] = useState(0);
  const setFilter = (patch: Partial<typeof filters>) =>
    setFilters((f) => ({ ...f, ...patch, offset: 0 }));
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setSelected([]);
    setDetail(null);
    const timer = window.setTimeout(async () => {
      try {
        const data = await api<LocalRecommendation>("/recipes/recommend", {
          method: "POST",
          body: {
            ...filters,
            avoid: filters.avoid
              .split(/[，,、]/)
              .map((v) => v.trim())
              .filter(Boolean),
            limit: 12,
          },
        });
        if (active) setResult(data);
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          setResult(null);
        }
      } finally {
        if (active) setBusy(false);
      }
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [filters, family.inventoryVersion, family.preferences, reload]);

  function prepare() {
    if (!result || busy) return;
    const draft = newDraft();
    draft.servings = filters.servings;
    draft.dishes = result.recipes
      .filter((r) => selected.includes(r.id))
      .map((recipe) => {
        const usages: UsageInput[] = [];
        for (const food of recipe.ingredients) {
          if (food.optional || (food.pantry && !food.ingredientId)) continue;
          // Never invent a gram/count conversion or an actual quantity from free-form source text.
          if (
            food.ingredientId &&
            usages.some((u) => u.ingredientId === food.ingredientId)
          )
            continue;
          const item = items.find((i) => i.id === food.ingredientId);
          usages.push({
            ...(item ? { ingredientId: item.id } : {}),
            name: item?.name || food.name,
            quantity: "",
            unit: (item?.unit || "份") as UsageInput["unit"],
            untracked: !item,
            allowExpired: false,
          });
        }
        return {
          name: recipe.name,
          steps: recipe.steps,
          usages,
        };
      });
    cook(draft);
  }
  const recipes = busy ? [] : result?.recipes || [];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FROM YOUR FRIDGE, WITH LOVE</div>
          <h1>
            今天吃什么<span className="heading-dot">?</span>
          </h1>
          <p>从现有食材出发，翻翻家常菜谱。</p>
        </div>
        <Button secondary onClick={manual}>
          <Plus size={17} />
          手动记一餐
        </Button>
      </div>
      <div className="recipe-banner">
        <div className="recipe-banner-icon">📖</div>
        <div>
          <span className="hero-tag dark">
            <BookOpen size={14} />
            本地菜谱库
          </span>
          <h2>冰箱里有什么，今天就做什么。</h2>
          <p>
            {result ? `${result.catalogSize} 道菜` : "数百道家常菜"}
            随程序保存，无需 AI 密钥；优先食材齐全和临期食材。
          </p>
        </div>
        <span className="recipe-banner-leaf">🌿</span>
      </div>
      <div className="recipe-mode" role="group" aria-label="菜谱范围">
        <button
          aria-pressed={filters.scope === "inventory"}
          onClick={() => setFilter({ scope: "inventory" })}
        >
          按库存推荐
        </button>
        <button
          aria-pressed={filters.scope === "all"}
          onClick={() => setFilter({ scope: "all" })}
        >
          全部菜谱
        </button>
      </div>
      <section className="panel preferences-panel">
        <div className="form-grid four">
          <Field label="几个人吃">
            <select
              value={filters.servings}
              onChange={(e) => setFilter({ servings: Number(e.target.value) })}
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
              value={filters.minutes}
              onChange={(e) => setFilter({ minutes: Number(e.target.value) })}
            >
              <option value={0}>不限时间</option>
              {[15, 30, 45, 60, 90, 180].map((n) => (
                <option key={n} value={n}>
                  {n} 分钟内
                </option>
              ))}
            </select>
          </Field>
          <Field label="菜品分类">
            <select
              value={filters.category}
              onChange={(e) => setFilter({ category: e.target.value })}
            >
              <option value="">全部分类</option>
              {["素菜", "荤菜", "水产", "汤羹", "主食", "早餐", "甜品"].map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
          </Field>
          <Field label="忌口与过敏原">
            <input
              maxLength={300}
              value={filters.avoid}
              placeholder="多个忌口用逗号分隔"
              onChange={(e) => setFilter({ avoid: e.target.value })}
            />
          </Field>
        </div>
        <div className="local-recipe-search">
          <Field label="搜菜名或食材">
            <div className="local-search-input">
              <Search size={17} />
              <input
                aria-label="搜菜名或食材"
                maxLength={60}
                value={filters.query}
                placeholder="例如：番茄、鸡蛋、红烧肉"
                onChange={(e) => setFilter({ query: e.target.value })}
              />
            </div>
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={filters.readyOnly}
              onChange={(e) => setFilter({ readyOnly: e.target.checked })}
            />
            只看食材齐全
          </label>
        </div>
        <div className="recipe-actions">
          <span>
            常备调料：{family.preferences.seasonings.join("、") || "未设置"}
            <small>
              食材齐全表示种类匹配，用量请在记餐时填写。过期、归档和零库存批次不参与匹配。
            </small>
          </span>
          <Button
            secondary
            loading={busy}
            onClick={() => setReload((n) => n + 1)}
          >
            {filters.scope === "inventory" ? "按最新库存推荐" : "刷新菜谱"}
          </Button>
        </div>
        <p className="small-note">
          忌口按菜名、用料和做法中的关键词过滤；复合调料及过敏原请核对原包装。设置时间上限后，仅展示原文注明时长的菜谱。
        </p>
        <ErrorBox error={error} />
      </section>
      <div className="section-title">
        <div>
          <h2>
            {filters.scope === "inventory"
              ? "从冰箱里挑一桌家常菜"
              : "浏览全部家常菜谱"}
          </h2>
          <span aria-live="polite">
            {busy
              ? "正在筛选菜谱…"
              : result
                ? `菜谱库共 ${result.catalogSize} 道 · ${filters.scope === "inventory" ? "当前库存匹配" : "当前筛选"} ${result.total} 道`
                : "暂时无法读取菜谱数量"}
            {` · 已选 ${selected.length} 道`}
          </span>
          <p className="small-note">
            {filters.scope === "inventory"
              ? "这里只展示命中现有库存主料的菜，点击“全部菜谱”可浏览整个菜谱库。"
              : "包含暂时缺料的菜谱；分类、时间、忌口和“只看食材齐全”筛选仍然生效。"}
          </p>
        </div>
      </div>
      {!recipes.length ? (
        <div className="recipe-empty">
          <Empty
            icon="👨‍🍳"
            title={
              busy
                ? "正在匹配冰箱里的食材…"
                : error
                  ? "暂时没能打开菜谱"
                  : "没有找到合适的菜谱"
            }
          >
            {busy
              ? "菜谱保存在本地，很快就好。"
              : filters.scope === "inventory"
                ? "可以补充库存、放宽筛选，或切换“全部菜谱”浏览。"
                : "可以清空搜索、放宽分类和时间筛选，或取消“只看食材齐全”。"}
          </Empty>
        </div>
      ) : (
        <>
          <div className="recipe-grid">
            {recipes.map((recipe, index) => (
              <article
                className={`recipe-card ${selected.includes(recipe.id) ? "selected" : ""}`}
                key={recipe.id}
              >
                <div className={`recipe-art art-${index % 3}`}>
                  <span>
                    {emoji(
                      recipe.ingredients.find((i) => !i.seasoning)?.name ||
                        recipe.name,
                    )}
                  </span>
                  <small>本地菜谱 · {recipe.category}</small>
                  <button
                    aria-label={`选择${recipe.name}`}
                    aria-pressed={selected.includes(recipe.id)}
                    className={`recipe-check ${selected.includes(recipe.id) ? "active" : ""}`}
                    disabled={
                      !selected.includes(recipe.id) && selected.length >= 10
                    }
                    onClick={() =>
                      setSelected((prev) =>
                        prev.includes(recipe.id)
                          ? prev.filter((id) => id !== recipe.id)
                          : [...prev, recipe.id],
                      )
                    }
                  >
                    {selected.includes(recipe.id) ? (
                      <Check size={17} />
                    ) : (
                      <Plus size={17} />
                    )}
                  </button>
                </div>
                <div className="recipe-card-body">
                  <h3>{recipe.name}</h3>
                  <div className="recipe-meta">
                    <span>
                      <Clock3 size={14} />
                      {recipe.minutes === null
                        ? "时长未注明"
                        : `约 ${recipe.minutes} 分钟`}
                    </span>
                    <span>
                      主料 {recipe.matchedCount}/{recipe.requiredCount}
                    </span>
                  </div>
                  <p>
                    {recipe.ingredients
                      .filter((i) => !i.seasoning && !i.optional)
                      .map((i) => i.name)
                      .join(" · ")}
                  </p>
                  <span className={`fresh-pill ${recipe.ready ? "" : "soon"}`}>
                    {recipe.ready
                      ? "食材齐全 · 用量待确认"
                      : `需补 ${recipe.missing.join("、")}`}
                  </span>
                  {recipe.expiring.length > 0 && (
                    <p className="local-expiring">
                      优先用掉：{recipe.expiring.join("、")}
                    </p>
                  )}
                  <button
                    className="text-link"
                    onClick={() => setDetail(recipe)}
                  >
                    看看怎么做
                    <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="local-recipe-pages">
            <Button
              secondary
              disabled={!filters.offset}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  offset: Math.max(0, f.offset - 12),
                }))
              }
            >
              <ArrowLeft size={16} />
              上一页
            </Button>
            <span>
              {filters.offset + 1}–{filters.offset + recipes.length} /{" "}
              {result?.total}
              <small className="local-page-catalog">
                {filters.scope === "inventory" ? "库存匹配" : "当前筛选"} · 全库{" "}
                {result?.catalogSize} 道
              </small>
            </span>
            <Button
              secondary
              disabled={!result?.hasMore}
              onClick={() =>
                setFilters((f) => ({ ...f, offset: f.offset + 12 }))
              }
            >
              下一页
              <ArrowRight size={16} />
            </Button>
          </div>
          <div className="cook-selection">
            <span>
              <BookOpen size={20} />
              选好菜，再填写实际用量。
            </span>
            <Button disabled={!selected.length} onClick={prepare}>
              确认用量，记下这一餐
              <ArrowRight size={16} />
            </Button>
          </div>
        </>
      )}
      <p className="small-note local-source">
        菜谱来源：
        <a
          href="https://github.com/Anduin2017/HowToCook"
          target="_blank"
          rel="noreferrer"
        >
          HowToCook
        </a>
        （Unlicense）。原文用量保留原份数，请按实际人数和食量调整。
      </p>
      {detail && (
        <RecipeDetail
          recipe={detail}
          servings={filters.servings}
          close={() => setDetail(null)}
        />
      )}
    </>
  );
}
