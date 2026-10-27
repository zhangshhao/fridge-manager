import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const sourceUrl = new URL(process.env.DATABASE_URL!);
if (
  !["localhost", "127.0.0.1"].includes(sourceUrl.hostname) ||
  process.env.NODE_ENV === "production"
)
  throw new Error("Local recovery drill only");
const targetName = "fridge_recovery_test";
const targetUrl = new URL(sourceUrl);
targetUrl.pathname = `/${targetName}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = "/postgres";
const admin = new PrismaClient({
  datasources: { db: { url: adminUrl.toString() } },
});
const source = new PrismaClient();
const target = new PrismaClient({
  datasources: { db: { url: targetUrl.toString() } },
});
const bundledBin = resolve(
  `node_modules/@embedded-postgres/${process.platform === "win32" ? "windows" : process.platform}-${process.arch}/native/bin`,
);
const bin =
  process.env.PG_CLIENT_BIN ||
  (existsSync(
    resolve(bundledBin, `pg_dump${process.platform === "win32" ? ".exe" : ""}`),
  )
    ? bundledBin
    : resolve(".local/pg-client"));
const ext = process.platform === "win32" ? ".exe" : "";
mkdirSync(".local", { recursive: true });
const dump = resolve(".local/recovery-drill.dump");
if (existsSync(dump))
  throw new Error("Drill dump already exists; archive it before a new drill");
const pgEnv = {
  ...process.env,
  PGHOST: sourceUrl.hostname,
  PGPORT: sourceUrl.port,
  PGUSER: decodeURIComponent(sourceUrl.username),
  PGPASSWORD: decodeURIComponent(sourceUrl.password),
};
try {
  const found = await admin.$queryRaw<
    { exists: boolean }[]
  >`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=${targetName})`;
  if (found[0].exists)
    throw new Error("Recovery database already exists; refusing to overwrite");
  execFileSync(
    resolve(bin, `pg_dump${ext}`),
    [
      "-d",
      sourceUrl.pathname.slice(1),
      "-Fc",
      "--no-owner",
      "--no-acl",
      "-f",
      dump,
    ],
    { env: pgEnv, stdio: "pipe" },
  );
  await admin.$executeRawUnsafe("CREATE DATABASE fridge_recovery_test");
  execFileSync(
    resolve(bin, `pg_restore${ext}`),
    ["-d", targetName, "--no-owner", "--no-acl", "--exit-on-error", dump],
    { env: pgEnv, stdio: "pipe" },
  );
  const summarize = async (client: PrismaClient) => ({
    users: await client.user.count(),
    families: await client.family.count(),
    members: await client.member.count(),
    ingredients: await client.ingredient.count(),
    batches: await client.batch.count(),
    meals: await client.meal.count(),
    ledger: await client.ledger.count(),
    audits: await client.audit.count(),
  });
  const before = await summarize(source);
  const restored = await summarize(target);
  const discrepancies = await target.$queryRaw<
    unknown[]
  >`SELECT b.id FROM "Batch" b LEFT JOIN "Ledger" l ON l."batchId"=b.id GROUP BY b.id HAVING b.remaining <> COALESCE(SUM(l.delta),0)`;
  const same =
    JSON.stringify(before) === JSON.stringify(restored) &&
    discrepancies.length === 0;
  const report = {
    performedAt: new Date().toISOString(),
    source: sourceUrl.pathname.slice(1),
    target: targetName,
    before,
    restored,
    discrepancies,
    passed: same,
  };
  writeFileSync(".local/recovery-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!same) process.exitCode = 1;
} finally {
  await Promise.all([
    admin.$disconnect(),
    source.$disconnect(),
    target.$disconnect(),
  ]);
}
