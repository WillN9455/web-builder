/**
 * Drizzle Kit configuration.
 *
 * Controls: schema discovery, migration generation, and studio URL.
 */

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Schema file location — relative to this config
  schema: './src/schema.ts',

  // Output directory for generated migrations
  out: './prisma/migrations',

  // Database connection — same as app, can be different env in CI
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },

  // Tables to include/exclude from introspection (useful for Postgres extensions)
  verbose: true,
  strict: true,
});
