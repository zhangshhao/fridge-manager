import type { Preferences, MealInput } from "@fridge/shared";
export function operationKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // LAN HTTP pages can use getRandomValues, but randomUUID requires HTTPS.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}
export type Batch = {
  id: string;
  region: string;
  original: string;
  remaining: string;
  expiresAt: string | null;
  purchasedAt: string | null;
  createdAt: string;
  archived: boolean;
};
export type Ingredient = {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  unit: string;
  archived: boolean;
  batches: Batch[];
};
export type Family = {
  id: string;
  name: string;
  role: string;
  preferences: Preferences;
  inventoryVersion: number;
};
export type Me = { id: string; username: string; families: Family[] };
export type Meal = MealInput & {
  id: string;
  authorId: string;
  authorName: string;
  status: string;
  revision: number;
  createdAt: string;
};
export type Ledger = {
  id: string;
  batchId: string;
  ingredientName: string;
  delta: string;
  unit: string;
  reason: string;
  actorName: string;
  createdAt: string;
  reversalOf: string | null;
};
export type Member = {
  userId: string;
  role: string;
  user: { username: string };
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
let familyId = "";
export function setApiFamily(id: string) {
  familyId = id;
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; key?: string } = {},
): Promise<T> {
  if (!navigator.onLine)
    throw new ApiError("当前处于离线状态，请联网后再操作。填写内容会保留。", 0);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method || "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "x-family-id": familyId,
        ...(options.key ? { "Idempotency-Key": options.key } : {}),
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
  } catch {
    throw new ApiError("连接暂时中断，请重新联网后重试；填写内容已保留。", 0);
  }
  const body = await response
    .json()
    .catch(() => ({ message: "服务返回异常，请稍后重试" }));
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(body.message || "请求失败", response.status);
  }
  return body as T;
}
export const localDate = (value = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
export const daysUntil = (date: string | null) =>
  date
    ? Math.round((Date.parse(date) - Date.parse(localDate())) / 86400000)
    : null;
export const formatQty = (v: string | number) =>
  String(v).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
export const emoji = (name: string) => {
  const rules: [string, string][] = [
    ["蛋", "🥚"],
    ["番茄|西红柿", "🍅"],
    ["菜|菠菜|生菜", "🥬"],
    ["肉|排骨", "🥩"],
    ["鸡", "🍗"],
    ["鱼", "🐟"],
    ["虾", "🦐"],
    ["奶", "🥛"],
    ["豆腐", "🧈"],
    ["胡萝卜", "🥕"],
    ["土豆", "🥔"],
    ["葱", "🌱"],
    ["椒", "🫑"],
    ["菇", "🍄"],
    ["苹果", "🍎"],
    ["香蕉", "🍌"],
    ["米|饭", "🍚"],
    ["面", "🍜"],
    ["柠檬", "🍋"],
    ["黄瓜", "🥒"],
  ];
  return rules.find(([r]) => new RegExp(r).test(name))?.[1] || "🧺";
};
