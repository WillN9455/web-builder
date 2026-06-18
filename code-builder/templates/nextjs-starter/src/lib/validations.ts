/**
 * Zod validation schemas.
 *
 * Every API route validates its input with a Zod schema before processing.
 * This prevents injection, type errors, and data corruption at the boundary.
 */

import { z } from 'zod';

// --- User update/validation ---

export const userUpdateSchema = z
  .object({
    name: z.string().min(1).max(100),
    avatarUrl: z.string().url().nullable(),
  })
  .partial(); // All fields optional for PATCH

// --- User registration ---

export const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

// --- User login ---

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// --- Pagination (reusable query param schema) ---

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

// --- Example CRUD entity (adjust for your actual entities from the PRD) ---

export const itemCreateSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  isPublic: z.boolean().default(false),
});

export const itemUpdateSchema = itemCreateSchema.partial();
