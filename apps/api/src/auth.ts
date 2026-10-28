import type { FastifyInstance } from "fastify";
import { z } from "zod";
import argon2 from "argon2";
import { Prisma } from "@prisma/client";
import {
  credentials,
  preferencesInput,
} from "../../../packages/shared/src/index.js";
import {
  actor,
  user,
  db,
  digest,
  token,
  AppError,
  transaction,
  lockFamily,
} from "./core.js";

const sessionOptions = () => ({
  path: "/",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 86400 * Number(process.env.SESSION_DAYS || 14),
});
export function authRoutes(app: FastifyInstance) {
  app.post(
    "/api/register",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const input = credentials
        .extend({
          familyName: z.string().trim().min(1, "请输入家庭名称").max(40),
        })
        .parse(req.body);
      const passwordHash = await argon2.hash(input.password, {
        type: argon2.argon2id,
      });
      const raw = token();
      try {
        // Nested writes keep the account, family, membership and session atomic.
        await db.user.create({
          data: {
            username: input.username,
            passwordHash,
            memberships: {
              create: {
                role: "admin",
                family: { create: { name: input.familyName } },
              },
            },
            sessions: {
              create: {
                id: digest(raw),
                expiresAt: new Date(
                  Date.now() + sessionOptions().maxAge * 1000,
                ),
              },
            },
          },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002" &&
          Array.isArray(e.meta?.target) &&
          e.meta.target.includes("username")
        )
          throw new AppError(409, "用户名已被使用，请换一个或直接登录");
        throw e;
      }
      reply.setCookie("session", raw, sessionOptions());
      return reply.code(201).send({ ok: true });
    },
  );
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const input = credentials.parse(req.body);
      const u = await db.user.findUnique({
        where: { username: input.username },
      });
      // Always verify an Argon2 hash, including unknown users, to reduce account enumeration by timing.
      const hash =
        u?.passwordHash ||
        "$argon2id$v=19$m=65536,t=3,p=4$MDEyMzQ1Njc4OWFiY2RlZg$Zb8wvSQh5hRfVkfdcj70DQI5cI5k/hlhkjyFYs0dVB8";
      const valid = await argon2
        .verify(hash, input.password)
        .catch(() => false);
      if (!u || !valid) throw new AppError(401, "用户名或密码不正确");
      const raw = token();
      await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      await db.session.create({
        data: {
          id: digest(raw),
          userId: u.id,
          expiresAt: new Date(Date.now() + sessionOptions().maxAge * 1000),
        },
      });
      reply.setCookie("session", raw, sessionOptions());
      return { ok: true };
    },
  );
  app.post("/api/logout", async (req, reply) => {
    if (req.cookies.session)
      await db.session.deleteMany({
        where: { id: digest(req.cookies.session) },
      });
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/me", async (req) => {
    const u = await user(req);
    const memberships = await db.member.findMany({
      where: { userId: u.id },
      include: { family: true },
    });
    return {
      id: u.id,
      username: u.username,
      families: memberships.map((m) => ({ ...m.family, role: m.role })),
    };
  });
  app.post("/api/password", async (req, reply) => {
    const u = await user(req);
    const input = z
      .object({
        current: z.string().max(128),
        password: z.string().min(10).max(128),
      })
      .parse(req.body);
    if (!(await argon2.verify(u.passwordHash, input.current)))
      throw new AppError(400, "当前密码不正确");
    await transaction(async (tx) => {
      await tx.user.update({
        where: { id: u.id },
        data: {
          passwordHash: await argon2.hash(input.password, {
            type: argon2.argon2id,
          }),
        },
      });
      await tx.session.deleteMany({ where: { userId: u.id } });
    });
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  app.post("/api/families", async (req) => {
    const u = await user(req);
    const { name } = z
      .object({ name: z.string().trim().min(1).max(40) })
      .parse(req.body);
    return db.family.create({
      data: { name, members: { create: { userId: u.id, role: "admin" } } },
    });
  });
  app.get("/api/members", async (req) => {
    const a = await actor(req);
    return db.member.findMany({
      where: { familyId: a.familyId },
      select: {
        id: true,
        userId: true,
        role: true,
        joinedAt: true,
        user: { select: { username: true } },
      },
    });
  });
  app.post(
    "/api/invites",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req) => {
      const a = await actor(req);
      if (a.role !== "admin") throw new AppError(403, "仅管理员可邀请成员");
      const raw = token();
      return transaction(async (tx) => {
        await lockFamily(tx, a);
        if ((await tx.member.count({ where: { familyId: a.familyId } })) >= 5)
          throw new AppError(409, "家庭最多 5 位成员");
        await tx.invite.create({
          data: {
            familyId: a.familyId,
            tokenHash: digest(raw),
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        const basePath = (process.env.APP_BASE_PATH || "").replace(
          /^\/+|\/+$/g,
          "",
        );
        return {
          url: `${process.env.APP_ORIGIN}/${basePath ? `${basePath}/` : ""}?invite=${raw}`,
          expiresInHours: 24,
        };
      });
    },
  );
  app.post(
    "/api/invites/accept",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = credentials
        .extend({ token: z.string().min(30).max(100) })
        .parse(req.body);
      const existing = await db.user.findUnique({
        where: { username: input.username },
      });
      if (
        existing &&
        !(await argon2.verify(existing.passwordHash, input.password))
      )
        throw new AppError(401, "已有账号的密码不正确");
      const passwordHash = existing
        ? existing.passwordHash
        : await argon2.hash(input.password, { type: argon2.argon2id });
      return transaction(async (tx) => {
        const invite = await tx.invite.findUnique({
          where: { tokenHash: digest(input.token) },
        });
        if (!invite) throw new AppError(400, "邀请不存在");
        await tx.$queryRaw`SELECT id FROM "Family" WHERE id = ${invite.familyId} FOR UPDATE`;
        const fresh = await tx.invite.findUniqueOrThrow({
          where: { id: invite.id },
        });
        if (fresh.usedAt || fresh.expiresAt < new Date())
          throw new AppError(400, "邀请已使用或已过期");
        if (
          (await tx.member.count({ where: { familyId: fresh.familyId } })) >= 5
        )
          throw new AppError(409, "家庭成员已满");
        const u =
          existing ||
          (await tx.user.create({
            data: { username: input.username, passwordHash },
          }));
        if (
          await tx.member.findUnique({
            where: {
              familyId_userId: { familyId: fresh.familyId, userId: u.id },
            },
          })
        )
          throw new AppError(409, "你已加入该家庭");
        await tx.member.create({
          data: { familyId: fresh.familyId, userId: u.id },
        });
        await tx.invite.update({
          where: { id: fresh.id },
          data: { usedAt: new Date() },
        });
        return { ok: true };
      });
    },
  );
  app.delete("/api/members/:userId", async (req) => {
    const a = await actor(req);
    const target = z.object({ userId: z.string() }).parse(req.params).userId;
    if (a.role !== "admin" && target !== a.userId)
      throw new AppError(403, "仅管理员可移除其他成员");
    return transaction(async (tx) => {
      await lockFamily(tx, a);
      const m = await tx.member.findUnique({
        where: { familyId_userId: { familyId: a.familyId, userId: target } },
      });
      if (!m) throw new AppError(404, "成员不存在");
      if (
        m.role === "admin" &&
        (await tx.member.count({
          where: { familyId: a.familyId, role: "admin" },
        })) === 1
      )
        throw new AppError(
          400,
          "最后一位管理员不能退出，请通过维护流程处理家庭数据",
        );
      await tx.member.delete({ where: { id: m.id } });
      return { ok: true };
    });
  });
  app.put("/api/preferences", async (req) => {
    const a = await actor(req);
    const input = preferencesInput.parse(req.body);
    if (a.role !== "admin") throw new AppError(403, "仅管理员可修改家庭设置");
    return transaction(async (tx) => {
      await lockFamily(tx, a);
      return tx.family.update({
        where: { id: a.familyId },
        data: { preferences: input },
      });
    });
  });
}
