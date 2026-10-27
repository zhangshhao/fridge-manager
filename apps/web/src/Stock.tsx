import { useMemo, useRef, useState } from "react";
import Decimal from "decimal.js";
import {
  Plus,
  Search,
  SlidersHorizontal,
  ArrowUpRight,
  ChevronRight,
  Snowflake,
  Leaf,
  Archive,
  History,
} from "lucide-react";
import { units, regions, type StockInput } from "@fridge/shared";
import {
  api,
  operationKey,
  emoji,
  formatQty,
  daysUntil,
  localDate,
  type Ingredient,
  type Family,
  type Ledger,
} from "./api";
import {
  Button,
  Sheet,
  Field,
  AsyncForm,
  Empty,
  notify,
  confirm,
} from "./components";

export const total = (item: Ingredient, region = "全部") =>
  item.batches
    .filter((b) => !b.archived && (region === "全部" || b.region === region))
    .reduce((s, b) => s.add(b.remaining), new Decimal(0));
export function Stock({
  items,
  family,
  mealCount,
  refresh,
  dirty,
}: {
  items: Ingredient[];
  family: Family;
  mealCount: number;
  refresh: () => Promise<void>;
  dirty: (v: boolean) => void;
}) {
  const [region, setRegion] = useState("全部");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("全部食材");
  const [add, setAdd] = useState(false);
  const [selected, setSelected] = useState<Ingredient | null>(null);
  const [ledger, setLedger] = useState<Ledger[] | null>(null);
  const [showZero, setShowZero] = useState(false);
  const threshold = family.preferences.expiringDays;
  const active = items.filter((i) => !i.archived && total(i).gt(0));
  const expiring = active.filter((i) =>
    i.batches.some(
      (b) =>
        new Decimal(b.remaining).gt(0) &&
        b.expiresAt &&
        (daysUntil(b.expiresAt) || 0) <= threshold,
    ),
  );
  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          !i.archived &&
          (showZero || total(i, region).gt(0)) &&
          [i.name, ...i.aliases].some((n) => n.includes(search)) &&
          (filter === "全部食材" ||
            (filter === "优先吃掉"
              ? expiring.some((e) => e.id === i.id)
              : i.category === filter)),
      ),
    [items, region, search, filter, showZero],
  );
  const categories = [
    ...new Set(items.filter((i) => !i.archived).map((i) => i.category)),
  ];
  async function openLedger() {
    try {
      setLedger(await api<Ledger[]>("/ledger"));
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FRESH FOOD, BETTER DAYS</div>
          <h1>
            我的冰箱<span className="heading-dot">.</span>
          </h1>
          <p>好好存放，每一份新鲜。</p>
        </div>
        <Button
          onClick={() => {
            setAdd(true);
            dirty(true);
          }}
        >
          <Plus size={18} />
          食材入库
        </Button>
      </div>
      <section className="dashboard-grid">
        <div className="fridge-hero">
          <div className="hero-copy">
            <span className="hero-tag">
              <span className="live-dot" /> {family.name}
            </span>
            <h2>
              小小冰箱，
              <br />
              装着生活的好滋味。
            </h2>
            <p>把食材交给管家，把时间留给生活。</p>
            <button
              className="text-link light"
              onClick={() => {
                setFilter("优先吃掉");
                document
                  .getElementById("inventory-list")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              看看今天先吃什么 <ArrowUpRight size={17} />
            </button>
          </div>
          <div className="fridge-art" aria-hidden="true">
            <div className="art-orbit" />
            <span className="art-leaf">🌿</span>
            <span className="art-tomato">🍅</span>
            <div className="mini-fridge">
              <div className="fridge-top">
                <i />
              </div>
              <div className="fridge-bottom">
                <i />
                <span className="fridge-note">
                  FRESH
                  <br />
                  <b>every day</b>
                  <span>🥕</span>
                </span>
              </div>
            </div>
            <span className="art-spark">✧</span>
          </div>
        </div>
        <div className="stats-stack">
          <div className="stat-card">
            <span className="stat-icon mint">
              <Archive size={20} />
            </span>
            <div>
              <span>在库食材</span>
              <p>
                <b>{active.length}</b>
                <small> 种新鲜</small>
              </p>
            </div>
            <span className="stat-line" />
          </div>
          <button className="stat-card" onClick={() => setFilter("优先吃掉")}>
            <span className="stat-icon peach">
              <Leaf size={20} />
            </span>
            <div>
              <span>需要优先吃</span>
              <p>
                <b>{expiring.length}</b>
                <small> 种食材</small>
              </p>
            </div>
            <ChevronRight size={18} />
          </button>
          <div className="stat-card">
            <span className="stat-icon lavender">
              <History size={20} />
            </span>
            <div>
              <span>本月好好吃饭</span>
              <p>
                <b>{mealCount}</b>
                <small> 餐已记录</small>
              </p>
            </div>
          </div>
        </div>
      </section>
      {expiring.length > 0 && (
        <div className="fresh-notice">
          <span>🌱</span>
          <div>
            <b>新鲜不等人，记得优先安排</b>
            <p>
              {expiring
                .slice(0, 4)
                .map((i) => i.name)
                .join("、")}
              等 {expiring.length} 种食材已到期或将在 {threshold} 天内到期
            </p>
          </div>
          <button className="text-link" onClick={() => setFilter("优先吃掉")}>
            去看看 <ChevronRight size={16} />
          </button>
        </div>
      )}
      <section id="inventory-list" className="inventory-section">
        <div className="section-title">
          <div>
            <h2>冰箱里的新鲜</h2>
            <span>{visible.length} 种食材，慢慢变成好吃的一餐</span>
          </div>
          <button className="quiet-button" onClick={openLedger}>
            <History size={16} />
            出入库流水
          </button>
        </div>
        <div className="inventory-toolbar">
          <div className="region-tabs">
            {["全部", ...regions].map((r, index) => (
              <button
                key={r}
                className={r === region ? "active" : ""}
                onClick={() => setRegion(r)}
              >
                {index === 2 && <Snowflake size={14} />} {r}
                {r === "全部" && <span>{active.length}</span>}
              </button>
            ))}
          </div>
          <div className="search-box">
            <Search size={17} />
            <input
              aria-label="搜索食材"
              placeholder="找找冰箱里有什么"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="category-row">
          <div className="category-chips">
            {["全部食材", "优先吃掉", ...categories].map((c) => (
              <button
                key={c}
                className={`chip ${filter === c ? "active" : ""}`}
                onClick={() => setFilter(c)}
              >
                {c === "优先吃掉" && "◷ "}
                {c}
              </button>
            ))}
          </div>
          <label className="zero-toggle">
            <input
              type="checkbox"
              checked={showZero}
              onChange={(e) => setShowZero(e.target.checked)}
            />
            <SlidersHorizontal size={14} />
            显示零库存
          </label>
        </div>
        <div className="stock-table">
          <div className="stock-table-head">
            <span>食材 / 分类</span>
            <span>剩余数量</span>
            <span>存放区域</span>
            <span>新鲜状态</span>
            <span />
          </div>
          {visible.length === 0 ? (
            <Empty title={search ? "没有找到这份食材" : "给冰箱添一点新鲜"}>
              {search
                ? "试试其他名称或别名。"
                : "点一下“食材入库”，从今天的第一份食材开始。"}
            </Empty>
          ) : (
            visible.map((item) => {
              const batches = item.batches.filter(
                (b) =>
                  Number(b.remaining) > 0 &&
                  (region === "全部" || b.region === region),
              );
              const dates = batches
                .map((b) => b.expiresAt)
                .filter((v): v is string => !!v)
                .sort();
              const days = daysUntil(dates[0] || null);
              return (
                <button
                  className="stock-row"
                  key={item.id}
                  onClick={() => setSelected(item)}
                >
                  <span className="food-info">
                    <span
                      className={`food-emoji ${item.category === "蔬菜" ? "veg" : item.category === "肉蛋水产" ? "protein" : ""}`}
                    >
                      {emoji(item.name)}
                    </span>
                    <span>
                      <b>{item.name}</b>
                      <small>
                        {item.category} · {batches.length} 个批次
                      </small>
                    </span>
                  </span>
                  <span className="stock-qty">
                    <b>{formatQty(total(item, region).toString())}</b>{" "}
                    <small>{item.unit}</small>
                  </span>
                  <span className="stock-region">
                    {[...new Set(batches.map((b) => b.region))].join(" / ") ||
                      "—"}
                  </span>
                  <span
                    className={`fresh-pill ${days !== null && days < 0 ? "expired" : days !== null && days <= threshold ? "soon" : ""}`}
                  >
                    {days === null
                      ? "未设到期日"
                      : days < 0
                        ? `已过期 ${-days} 天`
                        : days === 0
                          ? "今天到期"
                          : days <= threshold
                            ? `${days} 天内到期`
                            : "新鲜在库"}
                  </span>
                  <ChevronRight size={17} />
                </button>
              );
            })
          )}
        </div>
        <div className="inventory-footer">
          <span className="live-dot" />
          云端保存 · 每一次取用都有迹可循<span>到期日仅供管理参考</span>
        </div>
      </section>
      <div className="bottom-tip">
        <Leaf size={17} />
        <span>冰箱不必装满，生活可以很满。少一点浪费，多一点美味。</span>
      </div>
      {add && (
        <StockForm
          items={items}
          close={() => {
            setAdd(false);
            dirty(false);
          }}
          saved={async () => {
            setAdd(false);
            dirty(false);
            await refresh();
            notify("新鲜入库，已保存");
          }}
        />
      )}
      {selected && (
        <BatchDetail
          item={items.find((i) => i.id === selected.id) || selected}
          close={() => setSelected(null)}
          refresh={refresh}
        />
      )}
      {ledger && (
        <LedgerSheet
          entries={ledger}
          close={() => setLedger(null)}
          more={async () => {
            try {
              const rows = await api<Ledger[]>(
                `/ledger?cursor=${ledger.at(-1)?.id}`,
              );
              setLedger([...ledger, ...rows]);
              if (!rows.length) notify("已显示全部流水");
            } catch (e) {
              notify((e as Error).message);
            }
          }}
        />
      )}
    </>
  );
}
function StockForm({
  items,
  close,
  saved,
}: {
  items: Ingredient[];
  close: () => void;
  saved: () => void;
}) {
  const key = useRef(operationKey());
  const content = useRef("");
  const [form, setForm] = useState<StockInput>({
    name: "",
    quantity: "",
    unit: "个",
    region: "冷藏",
    category: "蔬菜",
    aliases: [],
  });
  const [aliases, setAliases] = useState("");
  const change = (field: keyof StockInput, value: string) =>
    setForm({ ...form, [field]: value });
  return (
    <Sheet title="添一份新鲜" close={close}>
      <p className="sheet-description">
        每次购买独立存成一个批次，新鲜有迹可循。
      </p>
      <AsyncForm
        label="确认入库"
        onSuccess={saved}
        submit={async () => {
          const matched = items.find((i) =>
            [i.name, ...i.aliases].includes(form.name),
          );
          const body = {
            ...form,
            ingredientId: matched?.id,
            aliases: aliases
              .split(/[，,]/)
              .map((v) => v.trim())
              .filter(Boolean),
            purchasedAt: form.purchasedAt || undefined,
            expiresAt: form.expiresAt || undefined,
          };
          const next = JSON.stringify(body);
          if (content.current && content.current !== next)
            key.current = operationKey();
          content.current = next;
          return api("/inventory", { method: "POST", body, key: key.current });
        }}
      >
        <Field label="食材名称">
          <input
            autoFocus
            required
            maxLength={40}
            placeholder="例如：番茄"
            value={form.name}
            list="ingredients"
            onChange={(e) => {
              const match = items.find((i) =>
                [i.name, ...i.aliases].includes(e.target.value),
              );
              setForm({
                ...form,
                name: e.target.value,
                ...(match
                  ? {
                      unit: match.unit as StockInput["unit"],
                      category: match.category,
                    }
                  : {}),
              });
            }}
          />
          <datalist id="ingredients">
            {items.map((i) => (
              <option key={i.id} value={i.name} />
            ))}
          </datalist>
        </Field>
        <div className="form-grid">
          <Field label="数量">
            <input
              required
              inputMode="decimal"
              pattern="[0-9]+(\.[0-9]{1,3})?"
              placeholder="0"
              value={form.quantity}
              onChange={(e) => change("quantity", e.target.value)}
            />
          </Field>
          <Field label="单位">
            <select
              value={form.unit}
              onChange={(e) => change("unit", e.target.value)}
            >
              {[...units, "千克", "升"].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-grid">
          <Field label="存放区域">
            <select
              value={form.region}
              onChange={(e) => change("region", e.target.value)}
            >
              {regions.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="分类">
            <select
              value={form.category}
              onChange={(e) => change("category", e.target.value)}
            >
              {["蔬菜", "肉蛋水产", "水果", "乳品", "主食", "调料", "其他"].map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
          </Field>
        </div>
        <div className="form-grid">
          <Field label="购买日期（可选）">
            <input
              type="date"
              value={form.purchasedAt || ""}
              onChange={(e) => change("purchasedAt", e.target.value)}
            />
          </Field>
          <Field label="到期日期（可选）">
            <input
              type="date"
              value={form.expiresAt || ""}
              onChange={(e) => change("expiresAt", e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="别名（新食材可选）"
          hint="多个别名用逗号分隔，例如：西红柿"
        >
          <input
            maxLength={400}
            placeholder="换个名字，也能找到它"
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
          />
        </Field>
      </AsyncForm>
    </Sheet>
  );
}
function BatchDetail({
  item,
  close,
  refresh,
}: {
  item: Ingredient;
  close: () => void;
  refresh: () => Promise<void>;
}) {
  const [adjust, setAdjust] = useState<string | null>(null);
  const [kind, setKind] = useState("吃掉");
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("");
  const [entries, setEntries] = useState<Ledger[] | null>(null);
  const key = useRef(operationKey());
  const previous = useRef("");
  const [aliases, setAliases] = useState(item.aliases.join("，"));
  return (
    <Sheet title={`${emoji(item.name)} ${item.name}`} close={close}>
      <div className="detail-total">
        <b>{formatQty(total(item).toString())}</b> {item.unit}
        <span>{item.category} · 固定基准单位</span>
      </div>
      <h3>批次明细</h3>
      {item.batches.map((b) => (
        <div className="batch-card" key={b.id}>
          <div className="split">
            <b>
              {b.region} · {formatQty(b.remaining)} {item.unit}
            </b>
            <span className="muted">
              原始 {formatQty(b.original)} {item.unit}
            </span>
          </div>
          <p>
            到期：{b.expiresAt || "未设置"}　购买：{b.purchasedAt || "未设置"}
          </p>
          <p>
            入库：
            {new Date(b.createdAt).toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai",
            })}
          </p>
          <div className="button-row">
            <button
              className="text-link"
              onClick={() => {
                setAdjust(b.id);
                setQ("");
                setReason("");
              }}
            >
              取用 / 调整
            </button>
            <button
              className="text-link"
              onClick={async () => {
                try {
                  setEntries(await api(`/ledger?batchId=${b.id}`));
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              查看流水
            </button>
          </div>
          {adjust === b.id && (
            <AsyncForm
              label="保存变化"
              onSuccess={async () => {
                setAdjust(null);
                await refresh();
                notify("库存已更新");
              }}
              submit={async () => {
                const body = { quantity: q, kind, reason };
                const next = JSON.stringify(body);
                if (previous.current !== next) {
                  key.current = operationKey();
                  previous.current = next;
                }
                return api(`/batches/${b.id}/adjust`, {
                  method: "POST",
                  body,
                  key: key.current,
                });
              }}
            >
              <Field label="操作">
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  {["吃掉", "丢弃", "盘点"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field
                label={
                  kind === "盘点"
                    ? `盘点后的实际数量（${item.unit}）`
                    : `取出数量（${item.unit}）`
                }
              >
                <input
                  required
                  value={q}
                  inputMode="decimal"
                  onChange={(e) => setQ(e.target.value)}
                />
              </Field>
              <Field label="原因">
                <input
                  required
                  maxLength={200}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            </AsyncForm>
          )}
        </div>
      ))}
      <div className="settings-divider" />
      <AsyncForm
        label="保存别名"
        submit={() =>
          api(`/ingredients/${item.id}`, {
            method: "PATCH",
            key: operationKey(),
            body: {
              aliases: aliases
                .split(/[，,]/)
                .map((s) => s.trim())
                .filter(Boolean),
            },
          })
        }
        onSuccess={async () => {
          await refresh();
          notify("别名已保存");
        }}
      >
        <Field label="食材别名（逗号分隔）">
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </Field>
      </AsyncForm>
      <Button
        secondary
        className="full archive-button"
        onClick={async () => {
          if (
            await confirm(
              "归档后将隐藏此食材，并暂停推荐和扣减。已有批次和流水会保留；再次入库可重新启用。",
            )
          ) {
            try {
              await api(`/ingredients/${item.id}`, {
                method: "PATCH",
                key: operationKey(),
                body: { archived: true },
              });
              close();
              await refresh();
            } catch (e) {
              notify((e as Error).message);
            }
          }
        }}
      >
        归档食材
      </Button>
      {entries && (
        <LedgerSheet entries={entries} close={() => setEntries(null)} />
      )}
    </Sheet>
  );
}
function LedgerSheet({
  entries,
  close,
  more,
}: {
  entries: Ledger[];
  close: () => void;
  more?: () => void;
}) {
  return (
    <Sheet title="出入库流水" close={close}>
      {entries.length === 0 && (
        <Empty title="还没有流水">入库和取用后，会在这里留下记录。</Empty>
      )}
      {entries.map((e) => (
        <div key={e.id} className="ledger-row">
          <span className="ledger-icon">{emoji(e.ingredientName)}</span>
          <div>
            <b>{e.ingredientName}</b>
            <p>{e.reason}</p>
            <small>
              {e.actorName} ·{" "}
              {new Date(e.createdAt).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}
            </small>
          </div>
          <strong className={Number(e.delta) >= 0 ? "positive" : ""}>
            {Number(e.delta) > 0 ? "+" : ""}
            {formatQty(e.delta)}
            <small>{e.unit}</small>
          </strong>
        </div>
      ))}
      {more && entries.length >= 100 && (
        <Button secondary className="full" onClick={more}>
          加载更多
        </Button>
      )}
    </Sheet>
  );
}
