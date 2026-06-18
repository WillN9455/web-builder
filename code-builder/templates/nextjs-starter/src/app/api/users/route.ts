/**
 * GET /api/users — List all users (admin-only).
 * Demonstrates the auth + RBAC pattern used across protected endpoints.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import { usersTable } from '@/schema';

export async function GET() {
  // 1. Verify authentication (is the caller logged in?)
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Verify authorization (is the caller allowed to do this?)
  // Fetch user role from DB — never cache roles on session token alone
  const currentUser = await db.query.users.findFirst({
    where: eq(usersTable.id, session.user.id),
    columns: { role: true },
  });

  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Execute protected query
  try {
    const allUsers = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .orderBy(asc(usersTable.createdAt))
      .execute();

    return NextResponse.json({ data: allUsers });
  } catch {
    // Log internally — never leak stack traces to clients
    console.error('Failed to fetch users');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
