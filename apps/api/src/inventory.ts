import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { stockInput, quantity } from "../../../packages/shared/src/index.js";
import {
  actor,
  operation,
  AppError,
  decimal,
  toBase,
  writeLedger,
  db,
} from "./core.js";

export function inventoryRoutes(app: FastifyInstance) {
  app.get("/api/inventory", async (req) => {
    const a = await actor(req);
    return db.ingredient.findMany({
      where: { familyId: a.familyId },
      include: {
        batches: {
          orderBy: [
            { expiresAt: { sort: "asc", nulls: "last" } },
            { createdAt: "asc" },
          ],
        },
      },
      orderBy: { name: "asc" },
    });
  });
  app.post("/api/inventory", async (req) => {
    const a = await actor(req);
    const input = stockInput.parse(req.body);
    return operation(req, a, input, async (tx) => {
      let item = input.ingredientId
        ? await tx.ingredient.findFirst({
            where: { id: input.ingredientId, familyId: a.familyId },
          })
        : await tx.ingredient.findFirst({
            where: {
              familyId: a.familyId,
              OR: [{ name: input.name }, { aliases: { has: input.name } }],
            },
          });
      if (input.ingredientId && !item) throw new AppError(404, "食材不存在");
      const normalized = toBase(input.quantity, input.unit, item?.unit);
      if (!item) {
        const allNames = [input.name, ...input.aliases];
        if (
          await tx.ingredient.findFirst({
            where: {
              familyId: a.familyId,
              OR: [
                { name: { in: allNames } },
                { aliases: { hasSome: allNames } },
              ],
            },
          })
        )
          throw new AppError(409, "名称或别名已属于其他食材");
        item = await tx.ingredient.create({
          data: {
            familyId: a.familyId,
            name: input.name,
            aliases: input.aliases,
            category: input.category,
            unit: normalized.unit,
          },
        });
      }
      if (item.archived)
        await tx.ingredient.update({
          where: { id: item.id },
          data: { archived: false },
        });
      const batch = await tx.batch.create({
        data: {
          familyId: a.familyId,
          ingredientId: item.id,
          region: input.region,
          original: normalized.value,
          remaining: 0,
          purchasedAt: input.purchasedAt,
          expiresAt: input.expiresAt,
        },
      });
      await writeLedger(tx, a, {
        batchId: batch.id,
        delta: normalized.value,
        ingredientName: item.name,
        unit: item.unit,
        reason: "食材入库",
      });
      return { id: batch.id };
    });
  });
  app.post("/api/batches/:id/adjust", async (req) => {
    const a = await actor(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const input = z
      .object({
        quantity,
        kind: z.enum(["吃掉", "丢弃", "盘点"]),
        reason: z.string().trim().min(1, "请填写原因").max(200),
      })
      .parse(req.body);
    return operation(req, a, input, async (tx) => {
      const b = await tx.batch.findFirst({
        where: { id, familyId: a.familyId },
        include: { ingredient: true },
      });
      if (!b) throw new AppError(404, "批次不存在");
      const delta =
        input.kind === "盘点"
          ? decimal(input.quantity).sub(b.remaining)
          : decimal(input.quantity).negated();
      if (b.remaining.add(delta).lt(0))
        throw new AppError(409, "该批次剩余数量不足，请重新确认");
      await writeLedger(tx, a, {
        batchId: id,
        delta,
        ingredientName: b.ingredient.name,
        unit: b.ingredient.unit,
        reason: `${input.kind}：${input.reason}`,
      });
      return { ok: true };
    });
  });
  app.patch("/api/ingredients/:id", async (req) => {
    const a = await actor(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const input = z
      .object({
        archived: z.boolean().optional(),
        aliases: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
      })
      .parse(req.body);
    return operation(req, a, input, async (tx) => {
      const item = await tx.ingredient.findFirst({
        where: { id, familyId: a.familyId },
      });
      if (!item) throw new AppError(404, "食材不存在");
      if (
        input.aliases &&
        (await tx.ingredient.findFirst({
          where: {
            familyId: a.familyId,
            id: { not: id },
            OR: [
              { name: { in: input.aliases } },
              { aliases: { hasSome: input.aliases } },
            ],
          },
        }))
      )
        throw new AppError(409, "别名已属于其他食材");
      return tx.ingredient.update({ where: { id }, data: input });
    });
  });
  app.get("/api/ledger", async (req) => {
    const a = await actor(req);
    const q = z
      .object({ batchId: z.string().optional(), cursor: z.string().optional() })
      .parse(req.query);
    return db.ledger.findMany({
      where: { familyId: a.familyId, batchId: q.batchId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
  });
}
