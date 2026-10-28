import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { mealInput } from "../packages/shared/src/index.js";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://fridge:fridge_local_only@localhost:54329/fridge_test?schema=public";
if (!new URL(process.env.DATABASE_URL).pathname.endsWith("_test"))
  throw new Error("Tests require a database ending in _test");
process.env.APP_ORIGIN = "http://localhost:5173";
process.env.AI_API_KEY = "";
const { db, today } = await import("../apps/api/src/core.js");
const { buildApp } = await import("../apps/api/src/server.js");
let app: FastifyInstance;
let cookie: string;
let familyId: string;
let userId: string;
let callNumber = 1;
const nextIP = () =>
  `127.0.${Math.floor(callNumber / 250)}.${(callNumber++ % 250) + 1}`;
const headers = (key = randomUUID()) => ({
  origin: process.env.APP_ORIGIN!,
  cookie,
  "x-family-id": familyId,
  "idempotency-key": key,
});
async function call(
  method: "POST" | "PUT" | "GET" | "DELETE" | "PATCH",
  url: string,
  body?: unknown,
  key?: string,
) {
  return app.inject({
    method,
    url,
    remoteAddress: nextIP(),
    headers: headers(key),
    ...(body !== undefined ? { payload: body } : {}),
  });
}
async function stock(name: string, quantity: string, extra: object = {}) {
  const res = await call("POST", "/api/inventory", {
    name,
    quantity,
    unit: "个",
    region: "冷藏",
    category: "蔬菜",
    aliases: [],
    ...extra,
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json().id as string;
}
async function item(name: string) {
  return db.ingredient.findFirstOrThrow({
    where: { familyId, name },
    include: { batches: true },
  });
}
async function meal(eggQty = "3", tomatoQty = "2") {
  const egg = await item("鸡蛋");
  const tomato = await item("番茄");
  return {
    date: today(),
    mealType: "晚餐",
    servings: 2,
    note: "",
    dishes: [
      {
        name: "番茄炒蛋",
        steps: ["炒熟"],
        usages: [
          { ingredientId: egg.id, name: "鸡蛋", quantity: eggQty, unit: "个" },
          {
            ingredientId: tomato.id,
            name: "番茄",
            quantity: tomatoQty,
            unit: "个",
          },
        ],
      },
    ],
  };
}
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: process.env, stdio: "pipe" },
  );
  app = await buildApp(false);
  await app.ready();
});
beforeEach(async () => {
  await db.family.deleteMany();
  await db.user.deleteMany();
  const u = await db.user.create({
    data: {
      username: "tester",
      passwordHash: await argon2.hash("TestPassword123!"),
      memberships: {
        create: { role: "admin", family: { create: { name: "测试家庭" } } },
      },
    },
    include: { memberships: true },
  });
  userId = u.id;
  familyId = u.memberships[0].familyId;
  const res = await app.inject({
    method: "POST",
    url: "/api/login",
    remoteAddress: nextIP(),
    headers: { origin: process.env.APP_ORIGIN! },
    payload: { username: "tester", password: "TestPassword123!" },
  });
  expect(res.statusCode).toBe(200);
  cookie = res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});
describe("PostgreSQL inventory transactions", () => {
  it("deducts a whole meal exactly once and reverses exactly once", async () => {
    await stock("鸡蛋", "6");
    await stock("番茄", "3");
    const body = await meal();
    const key = randomUUID();
    const saved = await call("POST", "/api/meals", body, key);
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await call("POST", "/api/meals", body, key)).json().id).toBe(
      saved.json().id,
    );
    expect((await item("鸡蛋")).batches[0].remaining.toString()).toBe("3");
    expect((await item("番茄")).batches[0].remaining.toString()).toBe("1");
    const conflict = structuredClone(body);
    conflict.servings = 3;
    expect((await call("POST", "/api/meals", conflict, key)).statusCode).toBe(
      409,
    );
    expect(await db.meal.count()).toBe(1);
    expect(
      (await call("POST", `/api/meals/${saved.json().id}/cancel`, {}))
        .statusCode,
    ).toBe(200);
    expect(
      (await call("POST", `/api/meals/${saved.json().id}/cancel`, {}))
        .statusCode,
    ).toBe(200);
    expect((await item("鸡蛋")).batches[0].remaining.toString()).toBe("6");
    expect((await item("番茄")).batches[0].remaining.toString()).toBe("3");
    expect(await db.audit.count()).toBe(2);
  });
  it("aggregates repeated ingredients across dishes and rolls back every write on shortage", async () => {
    await stock("鸡蛋", "3");
    const egg = await item("鸡蛋");
    const dish = {
      name: "鸡蛋",
      steps: [],
      usages: [
        { ingredientId: egg.id, name: "鸡蛋", quantity: "2", unit: "个" },
      ],
    };
    const res = await call("POST", "/api/meals", {
      date: today(),
      mealType: "午餐",
      servings: 2,
      note: "",
      dishes: [dish, dish],
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toContain("还缺 1");
    expect(await db.meal.count()).toBe(0);
    expect(await db.ledger.count()).toBe(1);
    expect((await item("鸡蛋")).batches[0].remaining.toString()).toBe("3");
  });
  it("serializes concurrent family consumers without negative stock", async () => {
    await stock("鸡蛋", "2");
    await stock("番茄", "2");
    const raw = "second-session";
    const { digest } = await import("../apps/api/src/core.js");
    const second = await db.user.create({
      data: {
        username: "second",
        passwordHash: "unused",
        memberships: { create: { familyId } },
      },
    });
    await db.session.create({
      data: {
        id: digest(raw),
        userId: second.id,
        expiresAt: new Date(Date.now() + 100000),
      },
    });
    const body = await meal("2", "1");
    const responses = await Promise.all([
      call("POST", "/api/meals", body),
      app.inject({
        method: "POST",
        url: "/api/meals",
        payload: body,
        headers: { ...headers(), cookie: `session=${raw}` },
      }),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect((await item("鸡蛋")).batches[0].remaining.toString()).toBe("0");
  });
  it("edits by reversing the old revision and rejects stale edits; failed edit restores old state", async () => {
    await stock("鸡蛋", "6");
    await stock("番茄", "3");
    const body = await meal();
    const saved = (await call("POST", "/api/meals", body)).json();
    const changed = await meal("1", "1");
    const result = await call("PUT", `/api/meals/${saved.id}`, {
      ...changed,
      revision: 1,
    });
    expect(result.statusCode, result.body).toBe(200);
    expect((await item("鸡蛋")).batches[0].remaining.toString()).toBe("5");
    expect(
      (await call("PUT", `/api/meals/${saved.id}`, { ...changed, revision: 1 }))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await call("PUT", `/api/meals/${saved.id}`, {
          ...(await meal("20", "1")),
          revision: 2,
        })
      ).statusCode,
    ).toBe(409);
    expect((await item("鸡蛋")).batches[0].remaining.toString()).toBe("5");
    await call("POST", `/api/meals/${saved.id}/cancel`, {});
    expect((await item("鸡蛋")).batches[0].remaining.toString()).toBe("6");
    expect(await db.audit.count()).toBe(3);
  });
  it("uses earliest expiry then entry order, excludes expired, and supports explicit batches", async () => {
    const noDate = await stock("鸡蛋", "2");
    const late = await stock("鸡蛋", "2", { expiresAt: "2099-02-01" });
    const early = await stock("鸡蛋", "2", { expiresAt: "2099-01-01" });
    await stock("鸡蛋", "9", { expiresAt: "2020-01-01" });
    await stock("番茄", "3");
    expect(
      (await call("POST", "/api/meals", await meal("3", "1"))).statusCode,
    ).toBe(200);
    expect(
      (
        await db.batch.findUniqueOrThrow({ where: { id: early } })
      ).remaining.toString(),
    ).toBe("0");
    expect(
      (
        await db.batch.findUniqueOrThrow({ where: { id: late } })
      ).remaining.toString(),
    ).toBe("1");
    expect(
      (
        await db.batch.findUniqueOrThrow({ where: { id: noDate } })
      ).remaining.toString(),
    ).toBe("2");
    const input = await meal("1", "1");
    (input.dishes[0].usages[0] as unknown as { batchId: string }).batchId =
      noDate;
    expect((await call("POST", "/api/meals", input)).statusCode).toBe(200);
    expect(
      (
        await db.batch.findUniqueOrThrow({ where: { id: noDate } })
      ).remaining.toString(),
    ).toBe("1");
  });
  it("converts kilograms exactly, resolves aliases, refuses packaging guesses, and audits adjustments", async () => {
    const batch = await stock("番茄", "0.125", {
      unit: "千克",
      aliases: ["西红柿"],
    });
    await stock("西红柿", "0.001", { unit: "千克" });
    expect(await db.ingredient.count()).toBe(1);
    expect((await item("番茄")).unit).toBe("克");
    expect(
      (await item("番茄")).batches.reduce((s, b) => s + Number(b.remaining), 0),
    ).toBe(126);
    expect(
      (
        await call("POST", "/api/inventory", {
          name: "番茄",
          quantity: "1",
          unit: "袋",
          region: "冷藏",
        })
      ).statusCode,
    ).toBe(400);
    await call("POST", `/api/batches/${batch}/adjust`, {
      quantity: "124.999",
      kind: "盘点",
      reason: "重新称重",
    });
    const sum = (
      await db.ledger.findMany({ where: { batchId: batch } })
    ).reduce(
      (s, l) => s.add(l.delta),
      (await import("@prisma/client")).Prisma.Decimal(0),
    );
    expect(sum.toString()).toBe("124.999");
  });
  it("keeps untracked ingredients in snapshots without touching stock", async () => {
    const res = await call("POST", "/api/meals", {
      date: today(),
      mealType: "早餐",
      servings: 1,
      dishes: [
        {
          name: "面包",
          usages: [
            { name: "面包", quantity: "1", unit: "份", untracked: true },
          ],
        },
      ],
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().dishes[0].usages[0].untracked).toBe(true);
    expect(await db.ledger.count()).toBe(0);
  });
});
describe("Permissions and sessions", () => {
  it("registers an isolated family admin with a hashed password and an active session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/register",
      remoteAddress: nextIP(),
      headers: { origin: process.env.APP_ORIGIN! },
      payload: {
        username: " new_admin ",
        password: "NewAdminPassword1!",
        familyName: " 新家庭 ",
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toEqual({ ok: true });
    const session = response.cookies.find((c) => c.name === "session")!;
    expect(session.httpOnly).toBe(true);
    expect(session.sameSite).toBe("Strict");
    const h = { cookie: `session=${session.value}` };
    const me = (await app.inject({ url: "/api/me", headers: h })).json();
    expect(me.username).toBe("new_admin");
    expect(me.families).toHaveLength(1);
    expect(me.families[0]).toMatchObject({
      name: "新家庭",
      role: "admin",
      timezone: "Asia/Shanghai",
    });
    const created = await db.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(created.passwordHash).not.toBe("NewAdminPassword1!");
    expect(
      await argon2.verify(created.passwordHash, "NewAdminPassword1!"),
    ).toBe(true);
    const { digest } = await import("../apps/api/src/core.js");
    expect(
      await db.session.findUnique({ where: { id: digest(session.value) } }),
    ).toMatchObject({ userId: me.id });
    const inventory = await app.inject({
      url: "/api/inventory",
      headers: { ...h, "x-family-id": me.families[0].id },
    });
    expect(inventory.statusCode).toBe(200);
    expect(inventory.json()).toEqual([]);
    expect(
      (
        await app.inject({
          url: "/api/inventory",
          headers: { ...h, "x-family-id": familyId },
        })
      ).statusCode,
    ).toBe(403);
  });
  it.each([
    { username: "ab" },
    { username: "invalid user" },
    { password: "short" },
    { familyName: "   " },
    { familyName: "家".repeat(41) },
    { familyName: undefined },
  ])(
    "rejects invalid registration without creating accounts or families: %j",
    async (invalid) => {
      const response = await call("POST", "/api/register", {
        username: "new_admin",
        password: "NewAdminPassword1!",
        familyName: "新家庭",
        ...invalid,
      });
      expect(response.statusCode).toBe(400);
      expect(await db.user.count()).toBe(1);
      expect(await db.family.count()).toBe(1);
      expect(await db.session.count()).toBe(1);
    },
  );
  it("does not overwrite an existing account or leave a family after duplicate registration", async () => {
    const response = await call("POST", "/api/register", {
      username: "tester",
      password: "DifferentPassword1!",
      familyName: "不应创建的家庭",
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain("用户名已被使用");
    expect(response.cookies).toHaveLength(0);
    expect(await db.family.count()).toBe(1);
    expect(await db.session.count()).toBe(1);
    const original = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await argon2.verify(original.passwordHash, "TestPassword123!")).toBe(
      true,
    );
  });
  it("creates only one account, family and session for concurrent duplicate registrations", async () => {
    const responses = await Promise.all(
      ["家庭甲", "家庭乙"].map((familyName) =>
        call("POST", "/api/register", {
          username: "concurrent_admin",
          password: "NewAdminPassword1!",
          familyName,
        }),
      ),
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await db.user.count()).toBe(2);
    expect(await db.family.count()).toBe(2);
    expect(await db.member.count()).toBe(2);
    expect(await db.session.count()).toBe(2);
  });
  it("rejects untrusted registration origins and limits anonymous registration attempts", async () => {
    const untrusted = await app.inject({
      method: "POST",
      url: "/api/register",
      headers: { origin: "https://untrusted.example" },
      payload: {
        username: "new_admin",
        password: "NewAdminPassword1!",
        familyName: "新家庭",
      },
    });
    expect(untrusted.statusCode).toBe(403);
    for (let i = 0; i < 6; i++) {
      const response = await app.inject({
        method: "POST",
        url: "/api/register",
        remoteAddress: "203.0.113.51",
        headers: { origin: process.env.APP_ORIGIN! },
        payload: {},
      });
      expect(response.statusCode).toBe(i < 5 ? 400 : 429);
      if (i === 5) expect(response.json().message).toContain("频繁");
    }
    expect(await db.user.count()).toBe(1);
    expect(await db.family.count()).toBe(1);
  });
  it("returns a usable 429 response when login limit is reached", async () => {
    const responses = [];
    for (let i = 0; i < 11; i++)
      responses.push(
        await app.inject({
          method: "POST",
          url: "/api/login",
          remoteAddress: "203.0.113.50",
          headers: { origin: process.env.APP_ORIGIN! },
          payload: { username: "unknown_user", password: "UnknownPassword1!" },
        }),
      );
    expect(responses.at(-1)?.statusCode).toBe(429);
    expect(responses.at(-1)?.json().message).toContain("频繁");
  });
  it("prevents regular members from maintaining others records or family settings", async () => {
    await stock("鸡蛋", "6");
    await stock("番茄", "3");
    const saved = (await call("POST", "/api/meals", await meal())).json();
    const relative = await db.user.create({
      data: {
        username: "regular",
        passwordHash: "unused",
        memberships: { create: { familyId } },
      },
    });
    const { digest } = await import("../apps/api/src/core.js");
    const raw = "regular-session";
    await db.session.create({
      data: {
        id: digest(raw),
        userId: relative.id,
        expiresAt: new Date(Date.now() + 100000),
      },
    });
    const h = { ...headers(), cookie: `session=${raw}` };
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/meals/${saved.id}/cancel`,
          headers: h,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/api/meals/${saved.id}`,
          headers: { ...h, "idempotency-key": randomUUID() },
          payload: { ...(await meal()), revision: 1 },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/invites",
          headers: h,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect((await item("鸡蛋")).batches[0].remaining.toString()).toBe("3");
  });
  it("keeps invite links inside the configured deployment subpath", async () => {
    const previous = process.env.APP_BASE_PATH;
    process.env.APP_BASE_PATH = "/fridge-manager/";
    try {
      const response = await call("POST", "/api/invites", {});
      expect(response.statusCode).toBe(200);
      const url = new URL(response.json().url);
      expect(url.origin).toBe(process.env.APP_ORIGIN);
      expect(url.pathname).toBe("/fridge-manager/");
      expect(url.searchParams.get("invite")).toBeTruthy();
    } finally {
      if (previous === undefined) delete process.env.APP_BASE_PATH;
      else process.env.APP_BASE_PATH = previous;
    }
  });
  it("rejects expired invites and never exceeds the five-member limit", async () => {
    const invite = (await call("POST", "/api/invites", {})).json();
    const inviteToken = new URL(invite.url).searchParams.get("invite")!;
    const { digest } = await import("../apps/api/src/core.js");
    await db.invite.update({
      where: { tokenHash: digest(inviteToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (
        await call("POST", "/api/invites/accept", {
          token: inviteToken,
          username: "new_user",
          password: "NewPassword123!",
        })
      ).statusCode,
    ).toBe(400);
    for (let i = 0; i < 4; i++)
      await db.user.create({
        data: {
          username: `member_${i}`,
          passwordHash: "unused",
          memberships: { create: { familyId } },
        },
      });
    expect((await call("POST", "/api/invites", {})).statusCode).toBe(409);
    expect(await db.member.count({ where: { familyId } })).toBe(5);
  });
  it("refuses foreign household reads, consumption and mutation", async () => {
    await stock("鸡蛋", "6");
    await stock("番茄", "3");
    const other = await db.family.create({ data: { name: "另一个家" } });
    const original = familyId;
    familyId = other.id;
    for (const path of [
      "/api/inventory",
      "/api/meals",
      "/api/ledger",
      "/api/members",
    ])
      expect((await call("GET", path)).statusCode).toBe(403);
    familyId = original;
    const foreign = await db.ingredient.create({
      data: {
        familyId: other.id,
        name: "苹果",
        aliases: [],
        unit: "个",
        category: "水果",
      },
    });
    const body = await meal();
    body.dishes[0].usages[0].ingredientId = foreign.id;
    expect((await call("POST", "/api/meals", body)).statusCode).toBe(400);
    expect(await db.meal.count()).toBe(0);
  });
  it("rejects cross-origin writes and invalidates a logged-out session", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/logout",
          headers: { ...headers(), origin: "https://evil.example" },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    await call("POST", "/api/logout", {});
    expect((await call("GET", "/api/me")).statusCode).toBe(401);
  });
  it("accepts single-use invites and immediately denies removed members", async () => {
    const invite = await call("POST", "/api/invites", {});
    const inviteToken = new URL(invite.json().url).searchParams.get("invite");
    const body = {
      token: inviteToken,
      username: "relative",
      password: "RelativePassword1!",
    };
    expect((await call("POST", "/api/invites/accept", body)).statusCode).toBe(
      200,
    );
    expect((await call("POST", "/api/invites/accept", body)).statusCode).toBe(
      400,
    );
    const login = await call("POST", "/api/login", {
      username: "relative",
      password: "RelativePassword1!",
    });
    const relativeCookie = login.cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const relative = await db.user.findUniqueOrThrow({
      where: { username: "relative" },
    });
    await call("DELETE", `/api/members/${relative.id}`);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/inventory",
          headers: { ...headers(), cookie: relativeCookie },
        })
      ).statusCode,
    ).toBe(403);
  });
});
describe("local recipe API", () => {
  it("recommends with no AI key, enforces family access and never mutates stock or calls providers", async () => {
    await stock("鸡蛋", "6");
    await stock("番茄", "3");
    const before = (await item("番茄")).batches[0].remaining.toString();
    const ledgerCount = await db.ledger.count();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const response = await call("POST", "/api/recipes/recommend", {
        servings: 2,
        minutes: 30,
        taste: "",
        avoid: [],
        query: "西红柿炒鸡蛋",
        readyOnly: true,
      });
      expect(response.statusCode, response.body).toBe(200);
      const recipe = response.json().recipes[0];
      expect(recipe.name).toBe("西红柿炒鸡蛋");
      expect(recipe.ready).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await db.aiCall.count()).toBe(0);
      expect((await item("番茄")).batches[0].remaining.toString()).toBe(before);
      expect(await db.ledger.count()).toBe(ledgerCount);
      expect(
        (await call("GET", "/api/recipes/catalog")).json().count,
      ).toBeGreaterThanOrEqual(300);
      const all = await call("POST", "/api/recipes/recommend", {
        servings: 2,
        minutes: 0,
        taste: "",
        avoid: [],
        scope: "all",
      });
      expect(all.statusCode, all.body).toBe(200);
      expect(all.json().total).toBe(all.json().catalogSize);
      const other = await db.family.create({ data: { name: "另一个家庭" } });
      const denied = await app.inject({
        method: "GET",
        url: "/api/recipes/catalog",
        headers: { ...headers(), "x-family-id": other.id },
        remoteAddress: nextIP(),
      });
      expect(denied.statusCode).toBe(403);
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/api/recipes/catalog",
            remoteAddress: nextIP(),
          })
        ).statusCode,
      ).toBe(401);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("AI adapter validation", () => {
  it("enforces paid-call quotas even after failed calls", async () => {
    await stock("鸡蛋", "6");
    process.env.AI_API_KEY = "test-key";
    process.env.AI_USER_DAILY_LIMIT = "1";
    await db.aiCall.create({
      data: {
        familyId,
        userId,
        cacheKey: "failed",
        model: "test",
        status: "failed",
      },
    });
    try {
      expect(
        (
          await call("POST", "/api/recommend", {
            servings: 2,
            minutes: 30,
            taste: "",
            avoid: [],
          })
        ).statusCode,
      ).toBe(429);
    } finally {
      process.env.AI_API_KEY = "";
      delete process.env.AI_USER_DAILY_LIMIT;
    }
  });
  it("times out slow providers without changing inventory", async () => {
    await stock("鸡蛋", "6");
    const server = createServer((_req, res) => {
      setTimeout(() => res.end("{}"), 150);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    process.env.AI_API_KEY = "test-key";
    process.env.AI_BASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    process.env.AI_TIMEOUT_MS = "30";
    try {
      expect(
        (
          await call("POST", "/api/recommend", {
            servings: 2,
            minutes: 30,
            taste: "",
            avoid: [],
          })
        ).statusCode,
      ).toBe(502);
      expect((await item("鸡蛋")).batches[0].remaining.toString()).toBe("6");
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      process.env.AI_API_KEY = "";
      delete process.env.AI_TIMEOUT_MS;
    }
  });
  it("keeps manual features working when no AI key is configured", async () => {
    expect(
      (
        await call("POST", "/api/recommend", {
          servings: 2,
          minutes: 30,
          taste: "",
          avoid: [],
        })
      ).statusCode,
    ).toBe(503);
    expect((await call("GET", "/api/inventory")).statusCode).toBe(200);
  });
  it("validates real HTTP provider responses, isolates cache and rejects bad units/references/avoidances", async () => {
    await stock("鸡蛋", "6");
    const egg = await item("鸡蛋");
    let mode = "valid";
    let received = "";
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c);
      received = Buffer.concat(chunks).toString();
      const recipe = {
        name: mode === "avoid" ? "花生鸡蛋" : "蒸鸡蛋",
        servings: 2,
        minutes: 15,
        ingredients: [
          {
            ingredientId: mode === "reference" ? "unknown" : egg.id,
            quantity: "1",
            unit: mode === "unit" ? "克" : "个",
          },
        ],
        missing: [],
        steps: ["蒸熟"],
      };
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          id: "test-provider",
          choices: [
            {
              message: {
                content:
                  mode === "structure"
                    ? "{}"
                    : JSON.stringify({ recipes: [recipe, recipe, recipe] }),
              },
            },
          ],
          usage: { total_tokens: 25 },
        }),
      );
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const address = server.address() as { port: number };
    process.env.AI_API_KEY = "test-provider-key";
    process.env.AI_BASE_URL = `http://127.0.0.1:${address.port}`;
    try {
      const base = {
        servings: 2,
        minutes: 30,
        taste: "",
        avoid: [] as string[],
      };
      expect((await call("POST", "/api/recommend", base)).statusCode).toBe(200);
      expect((await call("POST", "/api/recommend", base)).statusCode).toBe(200);
      expect(await db.aiCall.count()).toBe(1);
      expect(received).not.toContain("TestPassword");
      expect(received).not.toContain("tester");
      for (const v of ["unit", "reference", "structure", "avoid"]) {
        mode = v;
        await db.aiCall.deleteMany();
        const r = await call("POST", "/api/recommend", {
          ...base,
          taste: v,
          avoid: v === "avoid" ? ["花生"] : [],
        });
        expect(r.statusCode, r.body).toBe(502);
      }
      expect((await item("鸡蛋")).batches[0].remaining.toString()).toBe("6");
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      process.env.AI_API_KEY = "";
    }
  });
});
