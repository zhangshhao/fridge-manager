import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";

export const db = new PrismaClient();
export type Tx = Prisma.TransactionClient;
export const decimal = (v: string | number | Prisma.Decimal) =>
  new Prisma.Decimal(v);
export const digest = (v: unknown) =>
  createHash("sha256")
    .update(typeof v === "string" ? v : JSON.stringify(v))
    .digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export type Actor = {
  userId: string;
  username: string;
  familyId: string;
  role: string;
};
export async function user(req: FastifyRequest) {
  const raw = req.cookies.session;
  if (!raw) throw new AppError(401, "请先登录");
  const session = await db.session.findUnique({
    where: { id: digest(raw) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date())
    throw new AppError(401, "登录已过期，请重新登录");
  return session.user;
}
export async function actor(req: FastifyRequest): Promise<Actor> {
  const u = await user(req);
  const familyId = req.headers["x-family-id"];
  if (typeof familyId !== "string") throw new AppError(400, "请选择家庭");
  const m = await db.member.findUnique({
    where: { familyId_userId: { familyId, userId: u.id } },
  });
  if (!m) throw new AppError(403, "你已不属于这个家庭");
  return { userId: u.id, username: u.username, familyId, role: m.role };
}
export async function lockFamily(tx: Tx, a: Actor) {
  await tx.$queryRaw`SELECT id FROM "Family" WHERE id = ${a.familyId} FOR UPDATE`;
  const m = await tx.member.findUnique({
    where: { familyId_userId: { familyId: a.familyId, userId: a.userId } },
  });
  if (!m) throw new AppError(403, "你已不属于这个家庭");
  return m;
}
export async function transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try {
      return await db.$transaction(work, { maxWait: 10000, timeout: 15000 });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2028"].includes(e.code)
      ) {
        if (i < 2) continue;
        throw new AppError(409, "库存正在变化，请保留用量并重新确认");
      }
      throw e;
    }
  }
  throw new AppError(409, "请重试");
}
export async function operation(
  req: FastifyRequest,
  a: Actor,
  content: unknown,
  work: (tx: Tx) => Promise<unknown>,
) {
  const key = req.headers["idempotency-key"];
  if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(key))
    throw new AppError(400, "缺少有效的操作编号");
  const hash = digest({ userId: a.userId, url: req.url, content });
  return transaction(async (tx) => {
    await lockFamily(tx, a);
    const previous = await tx.operation.findUnique({
      where: { familyId_key: { familyId: a.familyId, key } },
    });
    if (previous) {
      if (previous.digest !== hash)
        throw new AppError(409, "操作编号已用于其他内容，请重新确认");
      return previous.result;
    }
    const result = JSON.parse(JSON.stringify(await work(tx)));
    await tx.operation.create({
      data: { familyId: a.familyId, key, digest: hash, result },
    });
    await tx.family.update({
      where: { id: a.familyId },
      data: { inventoryVersion: { increment: 1 } },
    });
    return result;
  });
}
export function toBase(amount: string, inputUnit: string, base?: string) {
  const unit =
    inputUnit === "千克" ? "克" : inputUnit === "升" ? "毫升" : inputUnit;
  if (base && unit !== base)
    throw new AppError(
      400,
      `单位无法换算：${inputUnit} → ${base}，请使用库存单位`,
    );
  const value = decimal(amount).mul(
    ["千克", "升"].includes(inputUnit) ? 1000 : 1,
  );
  if (value.gt("999999999999.999")) throw new AppError(400, "数量过大");
  return { unit, value };
}
export async function writeLedger(
  tx: Tx,
  a: Actor,
  data: {
    batchId: string;
    delta: Prisma.Decimal;
    ingredientName: string;
    unit: string;
    reason: string;
    mealId?: string;
    reversalOf?: string;
  },
) {
  await tx.batch.update({
    where: { id: data.batchId },
    data: { remaining: { increment: data.delta } },
  });
  return tx.ledger.create({
    data: {
      ...data,
      familyId: a.familyId,
      actorId: a.userId,
      actorName: a.username,
    },
  });
}
