import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  mealInput,
  type MealInput,
} from "../../../packages/shared/src/index.js";
import {
  actor,
  operation,
  AppError,
  db,
  decimal,
  toBase,
  today,
  writeLedger,
  type Actor,
  type Tx,
} from "./core.js";

async function consume(tx: Tx, a: Actor, mealId: string, input: MealInput) {
  // A family row lock spans all dishes and batch mutations: concurrent meals cannot overspend.
  for (const dish of input.dishes)
    for (const usage of dish.usages) {
      if (usage.untracked) continue;
      const item = await tx.ingredient.findFirst({
        where: {
          id: usage.ingredientId,
          familyId: a.familyId,
          archived: false,
        },
      });
      if (!item) throw new AppError(400, "库存食材不存在或已归档");
      usage.name = item.name;
      const normalized = toBase(usage.quantity, usage.unit, item.unit);
      usage.quantity = normalized.value.toFixed(3);
      usage.unit = item.unit as typeof usage.unit;
      const batches = await tx.batch.findMany({
        where: {
          ingredientId: item.id,
          familyId: a.familyId,
          archived: false,
          remaining: { gt: 0 },
          ...(usage.batchId ? { id: usage.batchId } : {}),
          ...(!usage.allowExpired
            ? { OR: [{ expiresAt: null }, { expiresAt: { gte: today() } }] }
            : {}),
        },
        orderBy: [
          { expiresAt: { sort: "asc", nulls: "last" } },
          { createdAt: "asc" },
          { id: "asc" },
        ],
      });
      const available = batches.reduce(
        (s, b) => s.add(b.remaining),
        decimal(0),
      );
      if (available.lt(normalized.value))
        throw new AppError(
          409,
          `${item.name}库存不足，还缺 ${normalized.value.sub(available).toString()} ${item.unit}。请调整用量或补录入库。`,
          {
            ingredientId: item.id,
            shortage: normalized.value.sub(available).toFixed(3),
          },
        );
      let rest = normalized.value;
      for (const batch of batches) {
        if (rest.isZero()) break;
        const take = decimal(batch.remaining).lt(rest)
          ? decimal(batch.remaining)
          : rest;
        await writeLedger(tx, a, {
          batchId: batch.id,
          delta: take.negated(),
          ingredientName: item.name,
          unit: item.unit,
          reason: `做菜：${dish.name}`,
          mealId,
        });
        rest = rest.sub(take);
      }
    }
}
async function restore(tx: Tx, a: Actor, mealId: string) {
  const rows = await tx.ledger.findMany({
    where: { mealId, delta: { lt: 0 }, reversalOf: null },
  });
  for (const row of rows) {
    if (await tx.ledger.findUnique({ where: { reversalOf: row.id } })) continue;
    await writeLedger(tx, a, {
      batchId: row.batchId,
      delta: decimal(row.delta).negated(),
      ingredientName: row.ingredientName,
      unit: row.unit,
      reason: "冲回做菜消耗",
      mealId,
      reversalOf: row.id,
    });
  }
}
export function mealRoutes(app: FastifyInstance) {
  app.get("/api/meals", async (req) => {
    const a = await actor(req);
    const q = z
      .object({
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
      })
      .parse(req.query);
    return db.meal.findMany({
      where: {
        familyId: a.familyId,
        ...(q.month ? { date: { startsWith: q.month } } : {}),
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 1000,
    });
  });
  app.get("/api/meals/:id/audit", async (req) => {
    const a = await actor(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    if (!(await db.meal.findFirst({ where: { id, familyId: a.familyId } })))
      throw new AppError(404, "记录不存在");
    return db.audit.findMany({
      where: { mealId: id },
      orderBy: { createdAt: "asc" },
    });
  });
  app.post("/api/meals", async (req) => {
    const a = await actor(req);
    const input = mealInput.parse(req.body);
    return operation(req, a, input, async (tx) => {
      const meal = await tx.meal.create({
        data: {
          ...input,
          dishes: [],
          familyId: a.familyId,
          authorId: a.userId,
          authorName: a.username,
        },
      });
      await consume(tx, a, meal.id, input);
      const saved = await tx.meal.update({
        where: { id: meal.id },
        data: { dishes: input.dishes },
      });
      await tx.audit.create({
        data: {
          mealId: meal.id,
          actorId: a.userId,
          action: "创建",
          snapshot: JSON.parse(JSON.stringify(saved)),
        },
      });
      return saved;
    });
  });
  app.put("/api/meals/:id", async (req) => {
    const a = await actor(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const input = mealInput
      .extend({ revision: z.number().int().positive() })
      .parse(req.body);
    return operation(req, a, input, async (tx) => {
      const old = await tx.meal.findFirst({
        where: { id, familyId: a.familyId },
      });
      if (!old) throw new AppError(404, "记录不存在");
      if (a.role !== "admin" && old.authorId !== a.userId)
        throw new AppError(403, "仅可修改自己的记录");
      if (old.status !== "active" || old.revision !== input.revision)
        throw new AppError(409, "记录已被修改或撤销，请重新打开");
      await restore(tx, a, id);
      await consume(tx, a, id, input);
      const { revision: _, ...content } = input;
      const saved = await tx.meal.update({
        where: { id },
        data: {
          ...content,
          dishes: content.dishes,
          revision: { increment: 1 },
        },
      });
      await tx.audit.create({
        data: {
          mealId: id,
          actorId: a.userId,
          action: "修改",
          snapshot: JSON.parse(JSON.stringify(saved)),
        },
      });
      return saved;
    });
  });
  app.post("/api/meals/:id/cancel", async (req) => {
    const a = await actor(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return operation(req, a, {}, async (tx) => {
      const old = await tx.meal.findFirst({
        where: { id, familyId: a.familyId },
      });
      if (!old) throw new AppError(404, "记录不存在");
      if (a.role !== "admin" && old.authorId !== a.userId)
        throw new AppError(403, "仅可撤销自己的记录");
      if (old.status === "cancelled") return old;
      await restore(tx, a, id);
      const saved = await tx.meal.update({
        where: { id },
        data: { status: "cancelled", revision: { increment: 1 } },
      });
      await tx.audit.create({
        data: {
          mealId: id,
          actorId: a.userId,
          action: "撤销",
          snapshot: JSON.parse(JSON.stringify(saved)),
        },
      });
      return saved;
    });
  });
}
