import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { credentials } from "../packages/shared/src/index.js";
const db = new PrismaClient();
try {
  const input = credentials.parse({
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
  });
  if (await db.user.findUnique({ where: { username: input.username } }))
    throw new Error("Account already exists; refusing to overwrite");
  await db.user.create({
    data: {
      username: input.username,
      passwordHash: await argon2.hash(input.password, {
        type: argon2.argon2id,
      }),
      memberships: {
        create: {
          role: "admin",
          family: { create: { name: process.env.FAMILY_NAME || "我们的家" } },
        },
      },
    },
  });
  console.log("管理员及家庭已创建。请登录后修改初始密码。");
} finally {
  await db.$disconnect();
}
