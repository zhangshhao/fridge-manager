import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
const db = new PrismaClient();
const [action, familyId, output] = process.argv.slice(2);
try {
  if (!familyId || !["export", "reconcile", "delete"].includes(action))
    throw new Error(
      "Usage: npm run data:manage -- export|reconcile|delete FAMILY_ID [OUTPUT]",
    );
  const family = await db.family.findUniqueOrThrow({ where: { id: familyId } });
  if (action === "reconcile") {
    const discrepancies = await db.$queryRaw<
      { id: string; remaining: string; ledgerTotal: string }[]
    >`SELECT b.id, b.remaining::text, COALESCE(SUM(l.delta),0)::text AS "ledgerTotal" FROM "Batch" b LEFT JOIN "Ledger" l ON l."batchId"=b.id WHERE b."familyId"=${familyId} GROUP BY b.id HAVING b.remaining <> COALESCE(SUM(l.delta),0)`;
    console.log(
      JSON.stringify(
        { familyId, consistent: discrepancies.length === 0, discrepancies },
        null,
        2,
      ),
    );
    if (discrepancies.length) process.exitCode = 1;
  } else if (action === "export") {
    if (!output)
      throw new Error(
        "Provide a private output path outside the public web root",
      );
    const destination = resolve(output);
    const snapshot = await db.$transaction(
      async (tx) => ({
        exportedAt: new Date().toISOString(),
        family,
        members: await tx.member.findMany({
          where: { familyId },
          select: {
            userId: true,
            role: true,
            joinedAt: true,
            user: { select: { username: true } },
          },
        }),
        ingredients: await tx.ingredient.findMany({ where: { familyId } }),
        batches: await tx.batch.findMany({ where: { familyId } }),
        meals: await tx.meal.findMany({
          where: { familyId },
          include: { audits: true },
        }),
        ledger: await tx.ledger.findMany({ where: { familyId } }),
        aiCalls: await tx.aiCall.findMany({ where: { familyId } }),
      }),
      { isolationLevel: "RepeatableRead" },
    );
    writeFileSync(destination, JSON.stringify(snapshot, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    console.log(`Export written: ${destination}`);
  } else {
    if (process.env.CONFIRM_DELETE_FAMILY_ID !== familyId)
      throw new Error(
        "Requires CONFIRM_DELETE_FAMILY_ID matching FAMILY_ID. Export and verify backups before deletion.",
      );
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Family" WHERE id=${familyId} FOR UPDATE`;
      await tx.family.delete({ where: { id: familyId } });
    });
    console.log(
      "Family data deleted. User accounts remain; encrypted backups expire through retention.",
    );
  }
} finally {
  await db.$disconnect();
}
