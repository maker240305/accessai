import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
const source = await readFile("proxy/.dev.vars", "utf8");
const key = source
  .split("\n")
  .find((l) => l.startsWith("GEMINI_API_KEY="))
  ?.slice(15)
  .trim()
  .replace(/^["']|["']$/g, "");
if (!key) throw Error("Missing key");
const child = spawn(
  "pnpm",
  [
    "exec",
    "wrangler",
    "secret",
    "put",
    "GEMINI_API_KEY",
    "--config",
    "proxy/wrangler.toml",
  ],
  {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: process.cwd() + "/.wrangler/logs",
      WRANGLER_SEND_METRICS: "false",
    },
  },
);
child.stdin.end(key + "\n");
child.stdout.on("data", (chunk) =>
  process.stdout.write(chunk.toString().replaceAll(key, "[REDACTED]")),
);
child.stderr.on("data", (chunk) =>
  process.stderr.write(chunk.toString().replaceAll(key, "[REDACTED]")),
);
child.on("exit", (code) => process.exit(code || 0));
