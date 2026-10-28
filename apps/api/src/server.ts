// Local development entry point. Vercel imports src/app.ts directly and never runs this file.
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // No .env file: fall back to the process environment.
}

// Imported after loading .env so configuration sees the values.
const { default: app } = await import("./app.js");

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`Clearance Gateway API listening on http://localhost:${port}`);
});
