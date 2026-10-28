// Runs core (tsc --watch), the API and the web app together for local development.
// A tiny script instead of adding a dependency such as `concurrently`.
import { spawn } from "node:child_process";

const tasks = [
  ["core", ["run", "build", "-w", "@clearance-gateway/core", "--", "--watch", "--preserveWatchOutput"]],
  ["api", ["run", "dev", "-w", "@clearance-gateway/api"]],
  ["web", ["run", "dev", "-w", "@clearance-gateway/web"]],
];

const children = tasks.map(([name, args]) => {
  const child = spawn("npm", args, { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  const prefix = (chunk) =>
    chunk
      .toString()
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .map((line) => `[${name}] ${line}`)
      .join("\n") + "\n";
  child.stdout.on("data", (chunk) => process.stdout.write(prefix(chunk)));
  child.stderr.on("data", (chunk) => process.stderr.write(prefix(chunk)));
  child.on("exit", (code) => console.log(`[${name}] exited with code ${code}`));
  return child;
});

const stopAll = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
