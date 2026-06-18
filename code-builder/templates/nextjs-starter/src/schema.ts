/**
 * Drizzle ORM schema definitions.
 *
 * This file is the single source of truth for your database tables.
 * Run `drizzle-kit generate` after adding/modifying tables, then `drizzle-kit migrate`.
 */

import {
  pgTable,
  varchar,
  text,
  timestamp,
  boolean,
  pgEnum,
} from 'drizzle-orm/pg-core';

// --- Enums ---

export const roleEnum = pgEnum('role', ['user', 'admin', 'moderator']);
export const statusEnum = pgEnum('status', ['active', 'inactive', 'suspended']);

// --- Users table ---

export const usersTable = pgTable('users', {
  id: varchar('id', { length: 36 }).primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  passwordHash: text('password_hash'), // NULL when only OAuth is used
  role: roleEnum('role').notNull().default('user'),
  avatarUrl: text('avatar_url'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .$onUpdate(() => new Date()),
});

// --- Sessions table (manual — NextAuth stores these in DB if using DB strategy) ---

export const sessionsTable = pgTable('sessions', {
  id: varchar('id', { length: 36 }).primaryKey().defaultRandom(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- Generic audit trail / activity log ---

export const auditLogsTable = pgTable('audit_logs', {
  id: varchar('id', { length: 36 }).primaryKey().defaultRandom(),
  userId: varchar('user_id', { length: 36 }).references(() => usersTable.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 50 }).notNull(), // e.g., 'create', 'update', 'delete', 'login'
  entityType: varchar('entity_type', { length: 50 }).notNull(), // e.g., 'user', 'document'
  entityId: varchar('entity_id', { length: 36 }),
  changes: text('changes'), // JSON-encoded diff
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Export schema object for Drizzle
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
export const schema = {
  users: usersTable,
  sessions: sessionsTable,
  auditLogs: auditLogsTable,
};

// --- Type exports ---

export type User = InferSelectModel<typeof usersTable>;
export type NewUser = InferInsertModel<typeof usersTable>;
export type Session = InferSelectModel<typeof sessionsTable>;
export type AuditLog = InferSelectModel<typeof auditLogsTable>;
