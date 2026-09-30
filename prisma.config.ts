import "dotenv/config";
import { defineConfig } from "prisma/config";

// Replaces the deprecated `"prisma": { "seed": ... }` block in package.json
// (Prisma Config went GA in 6.13.0).
//
// IMPORTANT: once a prisma.config.ts file exists, the Prisma CLI stops
// auto-loading .env itself ("Prisma config detected, skipping environment
// variable loading" in its output) — the `import "dotenv/config"` line above
// is what loads DATABASE_URL from .env now. Without it, `prisma migrate dev`
// and `prisma db seed` fail with "Environment variable not found:
// DATABASE_URL" even though .env is filled in correctly.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
