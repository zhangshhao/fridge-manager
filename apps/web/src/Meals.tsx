import { useEffect, useMemo, useRef, useState } from "react";
import Decimal from "decimal.js";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  RotateCcw,
  Pencil,
  ChefHat,
} from "lucide-react";
import {
  mealTypes,
  units,
  type MealInput,
  type UsageInput,
} from "@fridge/shared";
import {
  api,
  operationKey,
  localDate,
  daysUntil,
  emoji,
  formatQty,
  type Ingredient,
  type Meal,
  type Me,
  type Family,
} from "./api";
import {
  Button,
  Field,
  ErrorBox,
  Empty,
  Sheet,
  confirm,
  notify,
} from "./components";

export type Draft = MealInput & { id?: string; revision?: number };
export const newDraft = (): Draft => ({
  date: localDate(),
  mealType: "晚餐",
  servings: 2,
  note: "",
  dishes: [{ name: "", steps: [], usages: [] }],
});
const blankUsage = (): UsageInput => ({
  name: "",
  quantity: "",
  unit: "个",
  untracked: false,
  allowExpired: false,
});
export function MealEditor({
  initial,
  items,
  close,
  saved,
  dirty,
}: {
  initial: Draft;
  items: Ingredient[];
  close: () => void;
  saved: () => Promise<void>;
  dirty: (v: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft>(structuredClone(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(operationKey());
  const lastBody = useRef("");
  const update = (fn: (d: Draft) => void) => {
    setDraft((prev) => {
      const d = structuredClone(prev);
      fn(d);
      return d;
    });
    dirty(true);
  };
  const totals = useMemo(() => {
    const map = new Map<string, Decimal>();
    for (const d of draft.dishes)
      for (const u of d.usages)
        if (!u.untracked && u.ingredientId) {
          try {
            map.set(
              u.ingredientId,
              (map.get(u.ingredientId) || new Decimal(0)).add(u.quantity || 0),
            );
          } catch {
            /* Server validates the exact decimal string. */
          }
        }
    return [...map.entries()].map(([id, used]) => {
      const item = items.find((i) => i.id === id);
      const available =
        item?.batches
          .filter(
            (b) =>
              !b.archived &&
              (daysUntil(b.expiresAt) === null || daysUntil(b.expiresAt)! >= 0),
          )
          .reduce((s, b) => s.add(b.remaining), new Decimal(0)) ||
        new Decimal(0);
      return { id, item, used, available, remaining: available.sub(used) };
    });
  }, [draft, items]);
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    const { id, ...body } = draft;
    const serialized = JSON.stringify(body);
    if (lastBody.current && lastBody.current !== serialized)
      key.current = operationKey();
    lastBody.current = serialized;
    try {
      await api(id ? `/meals/${id}` : "/meals", {
        method: id ? "PUT" : "POST",
        body,
        key: key.current,
      });
      dirty(false);
      close();
      await saved();
      notify("这一餐已记下，库存同步更新");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="meal-editor">
      <button
        className="back-link"
        onClick={async () => {
          if (await confirm("离开会放弃这次尚未保存的填写内容，确认离开？")) {
            dirty(false);
            close();
          }
        }}
      >
        <ArrowLeft size={17} />
        返回
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A MEAL WORTH REMEMBERING</div>
          <h1>
            {draft.id ? "修改这一餐" : "确认做菜"}
            <span className="heading-dot">.</span>
          </h1>
          <p>按实际用量记下这一餐，保存后才会扣减库存。</p>
        </div>
        <span className="step-indicator">
          最后一步 <Check size={16} />
        </span>
      </div>
      <div className="editor-layout">
        <div>
          <section className="panel">
            <h3>这一餐的小信息</h3>
            <div className="form-grid three">
              <Field label="日期">
                <input
                  type="date"
                  required
                  value={draft.date}
                  onChange={(e) =>
                    update((d) => {
                      d.date = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="餐次">
                <select
                  value={draft.mealType}
                  onChange={(e) =>
                    update((d) => {
                      d.mealType = e.target.value as Draft["mealType"];
                    })
                  }
                >
                  {mealTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="用餐人数">
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={draft.servings}
                  onChange={(e) =>
                    update((d) => {
                      d.servings = Number(e.target.value);
                    })
                  }
                />
              </Field>
            </div>
          </section>
          {draft.dishes.map((dish, di) => (
            <section className="panel dish-editor" key={di}>
              <div className="split">
                <span className="eyebrow">
                  DISH {String(di + 1).padStart(2, "0")}
                </span>
                {draft.dishes.length > 1 && (
                  <button
                    className="icon-button"
                    aria-label="移除菜品"
                    onClick={() =>
                      update((d) => {
                        d.dishes.splice(di, 1);
                      })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
              <Field label="菜品名称">
                <input
                  required
                  placeholder="今天做了什么好吃的？"
                  maxLength={80}
                  value={dish.name}
                  onChange={(e) =>
                    update((d) => {
                      d.dishes[di].name = e.target.value;
                    })
                  }
                />
              </Field>
              <h4>实际用料</h4>
              {dish.usages.map((u, ui) => {
                const item = items.find((i) => i.id === u.ingredientId);
                return (
                  <div className="usage-card" key={ui}>
                    <div className="usage-top">
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={u.untracked}
                          onChange={(e) =>
                            update((d) => {
                              d.dishes[di].usages[ui] = {
                                ...blankUsage(),
                                untracked: e.target.checked,
                              };
                            })
                          }
                        />
                        未入库食材（仅记录）
                      </label>
                      <button
                        aria-label="移除用料"
                        className="icon-button"
                        onClick={() =>
                          update((d) => {
                            d.dishes[di].usages.splice(ui, 1);
                          })
                        }
                      >
                        <XIcon />
                      </button>
                    </div>
                    <div className="usage-fields">
                      <Field label="食材">
                        {u.untracked ? (
                          <input
                            required
                            maxLength={60}
                            placeholder="食材名称"
                            value={u.name}
                            onChange={(e) =>
                              update((d) => {
                                d.dishes[di].usages[ui].name = e.target.value;
                              })
                            }
                          />
                        ) : (
                          <select
                            aria-label="选择库存食材"
                            value={u.ingredientId || ""}
                            onChange={(e) =>
                              update((d) => {
                                const next = items.find(
                                  (i) => i.id === e.target.value,
                                );
                                if (next)
                                  d.dishes[di].usages[ui] = {
                                    ...u,
                                    ingredientId: next.id,
                                    name: next.name,
                                    unit: next.unit as UsageInput["unit"],
                                    batchId: undefined,
                                  };
                              })
                            }
                          >
                            <option value="">选择库存食材</option>
                            {items
                              .filter((i) => !i.archived)
                              .map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.name}（{i.unit}）
                                </option>
                              ))}
                          </select>
                        )}
                      </Field>
                      <Field label="实际用量">
                        <input
                          required
                          aria-label={`${u.name || "食材"}实际用量`}
                          inputMode="decimal"
                          placeholder="0"
                          value={u.quantity}
                          onChange={(e) =>
                            update((d) => {
                              d.dishes[di].usages[ui].quantity = e.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label="单位">
                        {u.untracked ? (
                          <select
                            value={u.unit}
                            onChange={(e) =>
                              update((d) => {
                                d.dishes[di].usages[ui].unit = e.target
                                  .value as UsageInput["unit"];
                              })
                            }
                          >
                            {units.map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        ) : (
                          <input value={u.unit} readOnly />
                        )}
                      </Field>
                    </div>
                    {!u.untracked && item && (
                      <>
                        <Field label="实际使用批次">
                          <select
                            value={u.batchId || ""}
                            onChange={(e) =>
                              update((d) => {
                                d.dishes[di].usages[ui].batchId =
                                  e.target.value || undefined;
                              })
                            }
                          >
                            <option value="">自动分配：优先较早到期</option>
                            {item.batches
                              .filter((b) => !b.archived)
                              .map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.region} · 到期 {b.expiresAt || "未设置"} ·
                                  剩余 {formatQty(b.remaining)}
                                  {item.unit}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <label className="checkbox muted">
                          <input
                            type="checkbox"
                            checked={u.allowExpired}
                            onChange={(e) =>
                              update((d) => {
                                d.dishes[di].usages[ui].allowExpired =
                                  e.target.checked;
                              })
                            }
                          />
                          包含已过期批次（请自行判断实际状态）
                        </label>
                      </>
                    )}
                  </div>
                );
              })}
              {dish.usages.length === 0 && (
                <p className="muted">添加用料后，会汇总显示预计库存变化。</p>
              )}
              <button
                className="text-link"
                onClick={() =>
                  update((d) => {
                    d.dishes[di].usages.push(blankUsage());
                  })
                }
              >
                <Plus size={16} />
                添加一种用料
              </button>
              {dish.steps.length > 0 && (
                <details className="recipe-steps">
                  <summary>查看做法</summary>
                  <ol>
                    {dish.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </details>
              )}
            </section>
          ))}
          <Button
            secondary
            className="full dashed"
            onClick={() =>
              update((d) => {
                d.dishes.push({ name: "", steps: [], usages: [] });
              })
            }
          >
            <Plus size={17} />
            再加一道菜
          </Button>
          <section className="panel">
            <Field label="给这一餐留句话（可选）">
              <textarea
                maxLength={500}
                placeholder="比如：家人都说今天的番茄炒蛋很下饭。"
                value={draft.note}
                onChange={(e) =>
                  update((d) => {
                    d.note = e.target.value;
                  })
                }
              />
            </Field>
          </section>
        </div>
        <aside className="panel meal-summary">
          <span className="eyebrow">MEAL CHECKLIST</span>
          <h2>整餐用料确认</h2>
          <p className="muted">
            {draft.dishes.length} 道菜 · {draft.servings} 人份
          </p>
          {totals.length === 0 && (
            <p className="muted">添加用料后，在这里查看整餐合计。</p>
          )}
          {totals.map((t) => (
            <div className="summary-item" key={t.id}>
              <div>
                <b>
                  {emoji(t.item?.name || "")} {t.item?.name || "食材不存在"}
                </b>
                <span>
                  {formatQty(t.used.toString())} {t.item?.unit}
                </span>
              </div>
              <small className={t.remaining.lt(0) ? "warning" : ""}>
                {draft.id
                  ? "修改时先冲回旧用量，再校验新用量"
                  : draft.dishes.some((d) =>
                        d.usages.some(
                          (u) =>
                            u.ingredientId === t.id &&
                            (u.allowExpired || u.batchId),
                        ),
                      )
                    ? "指定批次 / 过期范围，以保存时校验为准"
                    : t.remaining.lt(0)
                      ? `还缺 ${formatQty(t.remaining.abs().toString())} ${t.item?.unit}`
                      : `预计剩余 ${formatQty(t.remaining.toString())} ${t.item?.unit}`}
              </small>
            </div>
          ))}
          <div className="summary-note">
            未入库食材仅记录，不扣库存。保存时按实时批次统一校验，失败会保留全部填写内容。
          </div>
          <ErrorBox error={error} />
          <Button className="full" loading={busy} onClick={save}>
            <Check size={18} />
            确认保存这一餐
          </Button>
        </aside>
      </div>
    </div>
  );
}
const XIcon = () => <Trash2 size={15} />;
export function MealCalendar({
  meals,
  me,
  family,
  edit,
  repeat,
  refresh,
  create,
}: {
  meals: Meal[];
  me: Me;
  family: Family;
  edit: (m: Meal) => void;
  repeat: (m: Meal) => void;
  refresh: () => Promise<void>;
  create: () => void;
}) {
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [selected, setSelected] = useState(localDate());
  const [detail, setDetail] = useState<Meal | null>(null);
  const [audit, setAudit] = useState<
    { action: string; createdAt: string; snapshot: Meal }[] | null
  >(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [monthMeals, setMonthMeals] = useState(meals);
  useEffect(() => {
    let cancelled = false;
    api<Meal[]>(`/meals?month=${month}`)
      .then((rows) => {
        if (!cancelled) setMonthMeals(rows);
      })
      .catch((e) => {
        if (!cancelled) notify((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [month, meals, family.id]);
  const [year, m] = month.split("-").map(Number);
  const count = new Date(year, m, 0).getDate();
  const offset = (new Date(year, m - 1, 1).getDay() + 6) % 7;
  function changeMonth(delta: number) {
    const d = new Date(year, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setMonth(next);
    setSelected(`${next}-01`);
  }
  const dayMeals = monthMeals.filter(
    (r) => r.date === selected && (showCancelled || r.status === "active"),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">LITTLE MOMENTS, GOOD MEALS</div>
          <h1>
            做菜记录<span className="heading-dot">.</span>
          </h1>
          <p>把认真吃过的每一餐，留在日历里。</p>
        </div>
        <Button onClick={create}>
          <Plus size={18} />
          记一餐
        </Button>
      </div>
      <div className="calendar-layout">
        <section className="panel calendar-panel">
          <div className="calendar-head">
            <h2>
              {year} 年 {m} 月
            </h2>
            <div>
              <button
                className="icon-button"
                aria-label="上个月"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                className="icon-button"
                aria-label="下个月"
                onClick={() => changeMonth(1)}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
          <div className="calendar-grid">
            {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
              <span className="weekday" key={d}>
                {d}
              </span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`empty-${i}`} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, "0")}`;
              const has = monthMeals.some(
                (r) => r.date === date && r.status === "active",
              );
              return (
                <button
                  key={date}
                  aria-label={date}
                  className={`${selected === date ? "selected" : ""} ${date === localDate() ? "today" : ""}`}
                  onClick={() => setSelected(date)}
                >
                  <span>{i + 1}</span>
                  <i className={has ? "has-meal" : ""} />
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <span className="live-dot" />
            有认真吃饭的日子
            <button
              className="text-link"
              onClick={() => {
                setMonth(localDate().slice(0, 7));
                setSelected(localDate());
              }}
            >
              回到今天
            </button>
          </div>
        </section>
        <section className="day-records">
          <div className="section-title">
            <div>
              <h2>
                {selected === localDate()
                  ? "今天的餐桌"
                  : `${Number(selected.slice(5, 7))} 月 ${Number(selected.slice(8))} 日`}
              </h2>
              <span>{dayMeals.length} 餐记录</span>
            </div>
            <label className="checkbox muted">
              <input
                type="checkbox"
                checked={showCancelled}
                onChange={(e) => setShowCancelled(e.target.checked)}
              />
              含已撤销
            </label>
          </div>
          {dayMeals.length === 0 ? (
            <div className="panel">
              <Empty icon="🍽️" title="这一天的餐桌，等你来记录">
                每一顿家常饭，都值得被记住。
                <button className="text-link centered" onClick={create}>
                  记下这一餐 <ArrowRight size={16} />
                </button>
              </Empty>
            </div>
          ) : (
            mealTypes.map((type) => {
              const rows = dayMeals.filter((r) => r.mealType === type);
              return (
                rows.length > 0 && (
                  <div className="meal-group" key={type}>
                    <h3>
                      <span />
                      {type}
                    </h3>
                    {rows.map((r) => (
                      <button
                        key={r.id}
                        className="meal-card"
                        onClick={() => {
                          setDetail(r);
                          setAudit(null);
                        }}
                      >
                        <div className="meal-card-icon">
                          {r.mealType === "早餐"
                            ? "🥪"
                            : r.mealType === "加餐"
                              ? "🍎"
                              : "🍲"}
                        </div>
                        <div>
                          <h3>{r.dishes.map((d) => d.name).join("、")}</h3>
                          <p>
                            {r.servings} 人份 · {r.dishes.length} 道菜 ·{" "}
                            {r.authorName}
                          </p>
                          {r.note && <small>{r.note}</small>}
                          {r.status === "cancelled" && (
                            <span className="fresh-pill expired">已撤销</span>
                          )}
                        </div>
                        <ChevronRight size={18} />
                      </button>
                    ))}
                  </div>
                )
              );
            })
          )}
        </section>
      </div>
      {detail && (
        <Sheet
          title={`${detail.date} · ${detail.mealType}`}
          close={() => setDetail(null)}
        >
          <p className="muted">
            {detail.authorName}记录 · {detail.servings} 人 · 第{" "}
            {detail.revision} 版 {detail.status === "cancelled" && "· 已撤销"}
          </p>
          {detail.dishes.map((d, i) => (
            <div className="record-dish" key={i}>
              <h3>
                <ChefHat size={19} />
                {d.name}
              </h3>
              {d.usages.map((u, j) => (
                <div key={j} className="split usage-display">
                  <span>
                    {emoji(u.name)} {u.name}
                    {u.untracked && <small>（未入库）</small>}
                  </span>
                  <span>
                    {formatQty(u.quantity)} {u.unit}
                  </span>
                </div>
              ))}
              {d.steps.length > 0 && (
                <details className="recipe-steps">
                  <summary>做法</summary>
                  <ol>
                    {d.steps.map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          ))}
          {detail.note && <p className="note-card">{detail.note}</p>}
          <Button
            className="full"
            onClick={() => {
              repeat(detail);
              setDetail(null);
            }}
          >
            <RotateCcw size={17} />
            再做一次
          </Button>
          {detail.status === "active" &&
            (family.role === "admin" || detail.authorId === me.id) && (
              <div className="button-row spaced">
                <Button
                  secondary
                  onClick={() => {
                    edit(detail);
                    setDetail(null);
                  }}
                >
                  <Pencil size={16} />
                  修改记录
                </Button>
                <Button
                  secondary
                  danger
                  loading={busy}
                  onClick={async () => {
                    if (
                      !(await confirm(
                        "撤销后将恢复本次实际消耗的库存，原记录及流水仍会保留。确认撤销？",
                      ))
                    )
                      return;
                    setBusy(true);
                    try {
                      await api(`/meals/${detail.id}/cancel`, {
                        method: "POST",
                        body: {},
                        key: operationKey(),
                      });
                      setDetail(null);
                      await refresh();
                      notify("已撤销，用料已冲回库存");
                    } catch (e) {
                      notify((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  撤销记录
                </Button>
              </div>
            )}
          <button
            className="text-link centered"
            onClick={async () => {
              try {
                setAudit(await api(`/meals/${detail.id}/audit`));
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            查看修改与撤销历史
          </button>
          {audit?.map((a, i) => (
            <details className="audit" key={i}>
              <summary>
                {a.action} ·{" "}
                {new Date(a.createdAt).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                })}
              </summary>
              <p>
                第 {a.snapshot.revision} 版 ·{" "}
                {a.snapshot.dishes.map((d) => d.name).join("、")}
              </p>
              {a.snapshot.dishes.map((d, j) => (
                <p key={j}>
                  {d.name}：
                  {d.usages
                    .map((u) => `${u.name} ${formatQty(u.quantity)}${u.unit}`)
                    .join("，")}
                </p>
              ))}
            </details>
          ))}
        </Sheet>
      )}
    </>
  );
}
