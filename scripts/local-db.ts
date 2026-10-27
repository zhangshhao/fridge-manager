import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const dir = resolve(".local/postgres");
mkdirSync(".local", { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  port: 54329,
  user: "fridge",
  password: "fridge_local_only",
  persistent: true,
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: (message) => {
    if (String(message).includes("ready to accept"))
      console.log("Local PostgreSQL ready on 127.0.0.1:54329");
  },
});
if (!existsSync(resolve(dir, "PG_VERSION"))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
for (const name of ["fridge", "fridge_test"]) {
  const found = await client.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [name],
  );
  if (!found.rowCount) await pg.createDatabase(name);
}
await client.end();
console.log(
  "Development and isolated test databases ready. Keep this terminal open.",
);
const keepAlive = setInterval(() => {}, 60000);
async function stop() {
  clearInterval(keepAlive);
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
