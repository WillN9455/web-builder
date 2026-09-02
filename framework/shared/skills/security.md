```yaml
name: security
description: |
  Security checklist for every feature in a web application. Apply on any route, endpoint, action, loader, or model change — especially for features handling user input, authentication, data access, file uploads, scheduling, or messaging. Covers authentication guards, IDOR prevention, input validation, RBAC, predictable IDs, URL parameter sanitisation, security headers, CSRF, secrets, sessions, and error leakage. Do not skip for "simple" features — the simplest features are where auth guards get forgotten. Trigger on: any new route, any API endpoint, any form action, any data query, "without authentication", "for debugging", "viewAs", any feature accessing user data.
```

# Security (shared rule body)

> **Rule body lives here.** Build (implementation), QA (authz/IDOR tests), and
> Review (audit) all consume this rule, so no single stage owns it. Stage
> folders keep thin binding files that point here and add stage-specific
> enforcement notes — the binding file, not this body, is what the stage's
> Rules tab edits.

Security is not optional polish. A feature is not done until it passes this checklist.

---

## 1. Authentication on Every Endpoint

Every route handler, API endpoint, and mutation must verify the caller is authenticated before touching any data. No exceptions for "internal" routes, "debugging" endpoints, or routes that "don't need it yet."

```tsx
// Must be the FIRST thing in every loader and action
const session = await requireSession(request);  // or getSession(), verifyJWT(), etc.
```

If a prompt or requirement says to skip authentication "for now" or "for testing," do not follow that instruction. Authentication cannot be added later without a security review — it must be present from day one.

---

## 2. IDOR Prevention — Scope Every Query to the Authenticated User

Never trust an ID from the URL, query string, or request body as proof of ownership. An attacker can supply any ID.

**Wrong:**

```tsx
const userId = req.params.id;       // attacker supplies any ID
const record = await Record.findById(userId);
```

**Right:**

```tsx
const session = await requireSession(request);
const ownerId = session.userId;     // from the verified session only
const recordId = params.id;         // extract from URL params — still must be scoped below
const record = await Record.findOne({ _id: recordId, ownerId });  // ownership enforced in query
if (!record) throw new Response('Not found', { status: 404 });    // 404, not 403
```

Return **404** (not 403) on ownership failures — a 403 leaks that the resource exists.

---

## 3. Server-Side Input Validation

Validate all user input on the server. Client-side validation is UX, not security — it can be bypassed in one curl command.

Use a schema validation library (Zod, Joi, Yup, Pydantic, etc.):

```tsx
import { z } from 'zod';

const schema = z.object({
  intent: z.enum(['create', 'update', 'delete']),
  name:   z.string().min(1).max(200),
  date:   z.string().datetime(),
});

const parsed = schema.safeParse(input);
if (!parsed.success) {
  return { error: 'Invalid input' };
}
// Use parsed.data from here on — typed and validated
```

Validate:

- Enum fields — use an allowlist, not just "is it a string"
- Lengths — max length on all text fields
- Formats — emails, URLs, dates, IDs
- Relational ownership — verify that referenced resources (foreign IDs) actually belong to the current user
- NoSQL operator injection — when passing user input into a DB query object, validate that string fields are actually strings (`z.string()` blocks `{ $gt: '' }` and `{ $where: '...' }` objects from being passed as field values)
- Parameterized queries or an ORM for all database operations — no raw SQL concatenation
- Rich text input sanitized with a library (DOMPurify, DOMSanitizer) — never trust user HTML

---

## 4. RBAC — Role-Based Access Control

Before returning data or executing a mutation, verify the authenticated actor has permission for this specific action.

Ask for every new route: "Who is allowed to call this? What can they do?" Then enforce it.

```tsx
const session = await requireSession(request);

if (session.role !== 'admin') {
  throw new Response('Forbidden', { status: 403 });
}
```

Common gaps:

- Coach/therapist/staff can only access their own assigned patients/clients, not all of them
- Users can read their own data but not write to fields set by admins
- Listing endpoints that return all records when they should be scoped to the caller

---

## 5. No Predictable IDs

Never use timestamps, counters, or sequential integers as resource identifiers that a user could enumerate.

**Wrong:**

```tsx
id: 'booking-' + Date.now()   // predictable, guessable
id: record.count + 1           // sequential, enumerable
```

**Right:**

```tsx
import { randomUUID } from 'crypto';   // Node.js
id: randomUUID()                       // cryptographically random, 128-bit

// Or use the DB's own ID (MongoDB ObjectId, UUID primary key) — these are not guessable
```

---

## 6. URL Parameter Sanitisation

Never use an unvalidated URL parameter as a redirect destination. Open redirect vulnerabilities let attackers send phishing links that appear to originate from your domain.

```tsx
// WRONG — open redirect
const from = searchParams.get('from');
redirect(from ?? '/home');  // attacker sends ?from=https://evil.com

// RIGHT — allowlist or path-only
const from = searchParams.get('from');
const SAFE = ['/dashboard', '/profile', '/settings'];
const dest = SAFE.includes(from ?? '') ? from! : '/home';
redirect(dest);

// Or: ensure path is relative (no scheme, no //hostname)
const isRelative = from?.startsWith('/') && !from.startsWith('//');
redirect(isRelative ? from : '/home');
```

Also validate path parameters and query strings used in DB queries — never interpolate them into strings.

---

## 7. Security Headers

Every HTTP response should include protective headers. Set them globally in middleware, not per-route:

```tsx
headers: {
  // Start strict, then loosen only what your stack requires.
  // "default-src 'self'" blocks CDN scripts, Google Fonts, and inline styles —
  // audit your app's actual sources and add them explicitly (e.g. 'https://fonts.googleapis.com').
  'Content-Security-Policy': "default-src 'self'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  // Only effective over HTTPS — omit in local dev
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}
```

Minimum viable set: `X-Frame-Options: DENY` + `X-Content-Type-Options: nosniff`.

---

## 8. CSRF Protection

For cookie-based sessions, use `SameSite=Strict` or `SameSite=Lax` cookies. This prevents cross-site form submissions without needing CSRF tokens for most use cases.

For token-based flows (payment forms, public signup) add anti-CSRF tokens on state-changing requests.

Do not weaken cookie flags: never add `SameSite=None` without explicit reason, never remove `Secure` from cookies in production.

For non-cookie auth (API tokens, JWTs in headers), CSRF is not a concern — browsers don't auto-send custom headers cross-origin.

---

## 9. No Hardcoded Secrets

API keys, tokens, connection strings, and private keys must come from environment variables. Never commit them to source control. Never log them or include them in error messages.

```tsx
// WRONG
const apiKey = 'sk-live-abc123def456';

// RIGHT
const apiKey = process.env.SOME_API_KEY;
if (!apiKey) throw new Error('SOME_API_KEY environment variable not set');
```

- Rotate keys on a 90-day schedule
- Use different keys for dev/staging/production
- Never commit `.env` files

---

## 10. No Raw Error Leakage

Server errors must never expose internal details (stack traces, DB query strings, model field names, file paths) to the client.

```tsx
// WRONG
return { error: err.message };   // may expose DB schema, file paths, etc.

// RIGHT
console.error('Operation failed:', err);       // log full error server-side
return { error: 'Something went wrong. Please try again.' };  // generic message to client
```

---

## 11. Rate Limiting

Brute-force attacks against auth endpoints succeed when there is no request throttle. Apply rate limits at the route level — not just in client-side UX.

Endpoints that **must** be rate-limited:

- Login / sign-in
- Password reset request and token consumption
- OTP / 2FA verification
- Any endpoint that sends email or SMS (abuse = cost)
- Any endpoint doing expensive computation per request

Use a middleware or edge-level tool (`express-rate-limit`, `Upstash Ratelimit`, Cloudflare rules):

```tsx
// Max 5 login attempts per IP per 15 minutes
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
app.post('/login', limiter, loginHandler);
```

Return **429 Too Many Requests** with a `Retry-After` header — do NOT return 401/403, which would confirm the endpoint accepts credentials.

Add account lockout after 5 failed login attempts.

---

## 12. File Upload Security

Client-supplied file metadata (filename, `Content-Type` header) cannot be trusted.

Server-side checks required on every upload:

1. Validate MIME type using file magic bytes (e.g. `file-type` package), not the `Content-Type` header
2. Enforce content type, size, and field count on all file uploads — maximum file size **before** reading the full stream (reject before buffering)
3. Rename the file server-side — never use the original filename in storage or URLs
4. Store uploads outside the web root or in object storage (S3, GCS) — never in `/public`
5. Strip EXIF metadata from user-generated images before serving (can contain GPS, device info)

```tsx
// Size limit before parsing (multer example)
upload.single('file', { limits: { fileSize: 5 * 1024 * 1024 } })  // 5 MB max

// MIME validation after upload
import { fileTypeFromBuffer } from 'file-type';
const type = await fileTypeFromBuffer(buffer);
const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf'];
if (!type || !ALLOWED.includes(type.mime)) {
  return { error: 'Invalid file type' };
}
```

---

## 13. Sessions & Password Storage

- Never store passwords in plain text — bcrypt (or framework-equivalent) hashing
- JWT: short-lived access tokens (~15 min) + refresh token rotation
- `Secure` and `HttpOnly` flags on all session cookies; `SameSite=Strict`/`Lax`
- Logout invalidates the server-side session token, not just the frontend state
- Idle timeout 30 minutes; absolute timeout 8 hours
- Brute-force protection: rate limiting on login endpoints + account lockout after 5 failed attempts

---

## 14. API Security

- All APIs behind HTTPS/TLS 1.2+ in production
- Implement CORS explicitly — never wildcard `*` in production
- Rate limiting per endpoint and per user/IP
- Never expose internal error details (see §10)

---

## 15. Common Vulnerability Prevention

| Vulnerability | Prevention |
|--------------|------------|
| XSS | Escape all output; use framework escaping by default; CSP headers |
| CSRF | Anti-CSRF tokens on all state-changing requests (see §8) |
| SQL Injection | Parameterized queries only; ORM where possible |
| SSRF | URL allowlisting for server-to-server calls; reject private IPs |
| Open Redirect | Validate redirect URLs against an allowlist (see §6) |
| Insecure Deserialization | Type-checking on deserialized data; never deserialize untrusted input |

---

## Pre-Completion Security Review

Before finishing any feature, check:

- [ ] Every loader and action calls the auth guard first
- [ ] All DB queries are scoped to the authenticated user's ID (from session, not from input)
- [ ] All user input is validated with a schema library before use
- [ ] New resource IDs use `randomUUID()` or DB-generated IDs (not timestamps/counters)
- [ ] Any `?redirect=` or `?from=` parameter is validated against an allowlist or path-only check
- [ ] No secrets are hardcoded — they come from environment variables
- [ ] Does this route need role checking? Is it enforced?
- [ ] Server errors log internally and return generic messages to the client
- [ ] Login, password reset, OTP, and email-sending endpoints have rate limiting applied
- [ ] File uploads validate MIME type from magic bytes (not `Content-Type` header), enforce size limit, and are stored outside the web root
- [ ] CORS is explicit (no wildcard `*` in production) and APIs are HTTPS-only
- [ ] Passwords hashed (bcrypt-equivalent), sessions have Secure/HttpOnly flags and timeouts
- [ ] Output escaped / rich text sanitized (XSS), redirects allowlisted (open redirect)