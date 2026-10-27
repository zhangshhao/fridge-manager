import { buildApp } from "./server.js";
import { db } from "./core.js";
const app = await buildApp();
await app.listen({
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || "127.0.0.1",
});
async function stop() {
  await app.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
