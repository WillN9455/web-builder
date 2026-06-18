/**
 * GET/PATCH /api/users/[id] — Get or update a single user.
 * Demonstrates IDOR prevention and input validation.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { usersTable } from '@/schema';
import { eq } from 'drizzle-orm';
import { userUpdateSchema } from '@/lib/validations';

// ============================================
// GET /api/users/[id]
// ============================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // IDOR check: users can only view their own profile unless admin
  const currentUser = await db.query.users.findFirst({
    where: eq(usersTable.id, session.user.id),
    columns: { role: true },
  });

  if (session.user.id !== id && currentUser?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const user = await db.query.users.findFirst({
    where: eq(usersTable.id, id),
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Omit sensitive fields from response
  const { passwordHash, ...publicUser } = user;
  return NextResponse.json({ data: publicUser });
}

// ============================================
// PATCH /api/users/[id]
// ============================================

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // IDOR check
  if (session.user.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse and validate body with Zod
  const body = await request.json();
  const validated = userUpdateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validated.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const updated = await db
      .update(usersTable)
      .set({
        name: validated.data.name,
        avatarUrl: validated.data.avatarUrl,
      })
      .where(eq(usersTable.id, id))
      .returning();

    return NextResponse.json({ data: updated[0] });
  } catch {
    console.error('Failed to update user');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
