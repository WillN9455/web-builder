/**
 * Database client setup.
 *
 * Uses Drizzle ORM with a Postgres connection pool (via the 'postgres' driver).
 * The connection string comes from DATABASE_URL env var.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Connection pool settings — adjust based on expected concurrency
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Create the Drizzle instance
export const db = drizzle(pool, { schema: schema });

// Debug mode — log queries in development
if (process.env.DEBUG_MODE === 'true') {
  db.on('query', (query) => {
    console.log(`[DB] ${query.params ? query.sql + ' (' + JSON.stringify(query.params) + ')' : query.sql}`);
  });
}
