import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, db } from "./core.js";
import { authRoutes } from "./auth.js";
import { inventoryRoutes } from "./inventory.js";
import { mealRoutes } from "./meals.js";
import { aiRoutes } from "./ai.js";
import { recipeRoutes } from "./recipes.js";

export async function buildApp(logging = true) {
  if (!process.env.APP_ORIGIN) throw new Error("APP_ORIGIN is required");
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.APP_ORIGIN.startsWith("https://")
  )
    throw new Error("Production APP_ORIGIN must use HTTPS");
  const app = Fastify({
    bodyLimit: 65536,
    logger: logging
      ? {
          level: "info",
          redact: [
            "req.headers.cookie",
            "req.headers.authorization",
            'req.headers["idempotency-key"]',
          ],
          serializers: {
            req: (req: { method: string; url: string }) => ({
              method: req.method,
              path: req.url.split("?")[0],
            }),
          },
        }
      : false,
    trustProxy:
      process.env.NODE_ENV === "production"
        ? (_address: string, hop: number) => hop === 0
        : false,
  });
  await app.register(cookie);
  await app.register(helmet);
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: "操作太频繁，请稍后再试",
    }),
  });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== process.env.APP_ORIGIN
    )
      throw new AppError(403, "请求来源不受信任，请从应用页面操作");
  });
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError)
      return reply
        .code(400)
        .send({
          message: err.issues[0]?.message || "输入无效",
          issues: err.issues,
        });
    if (err instanceof AppError)
      return reply
        .code(err.statusCode)
        .send({ message: err.message, details: err.details });
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    )
      return reply.code(409).send({ message: "数据已存在，请刷新后重试" });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500)
      return reply
        .code(status)
        .send({
          message: status === 429 ? "操作太频繁，请稍后再试" : "请求格式无效",
        });
    req.log.error(
      {
        errorType: err instanceof Error ? err.name : "unknown",
        requestId: req.id,
      },
      "request_failed",
    );
    return reply
      .code(500)
      .send({
        message: "服务暂时不可用，填写内容已保留，请稍后重试",
        requestId: req.id,
      });
  });
  app.get("/api/health", async (_req, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { status: "ok", version: "1.0.0" };
    } catch {
      return reply.code(503).send({ status: "unhealthy" });
    }
  });
  app.get("/api/privacy", async () => ({
    contact: process.env.PRIVACY_CONTACT || "请联系家庭管理员",
    version: "2026-10-20",
  }));
  authRoutes(app);
  inventoryRoutes(app);
  mealRoutes(app);
  aiRoutes(app);
  recipeRoutes(app);
  return app;
}
