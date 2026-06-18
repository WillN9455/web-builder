/**
 * Database seed script — populates initial data for local development.
 * Run with: npx tsx prisma/seed.ts
 */

import { hashPassword } from '../src/lib/security';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { usersTable } from '../src/schema';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  console.log('🌱 Seeding database...\n');

  const passwordHash = await hashPassword('SeedPassword123!');

  const [admin, user] = await db
    .insert(usersTable)
    .values([
      {
        name: 'Admin User',
        email: 'admin@example.com',
        passwordHash,
        role: 'admin' as const,
        isActive: true,
      },
      {
        name: 'Demo User',
        email: 'user@example.com',
        passwordHash,
        role: 'user' as const,
        isActive: true,
      },
    ])
    .returning();

  console.log('Seeded users:');
  console.log(`  Admin: ${admin.email} (password: SeedPassword123!)`);
  console.log(`  User:  ${user.email} (password: SeedPassword123!)`);
  console.log('\n🌱 Done.\n');

  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
