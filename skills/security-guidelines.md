# Security Guidelines

Security requirements every Code Agent and Dev Reviewer must enforce.

## Authentication & Authorization

- Never store passwords in plain text — use bcrypt (or framework-equivalent) hashing
- JWT tokens: short-lived access tokens (15min) + refresh token rotation
- All routes except public ones require authentication check middleware
- Role-based access control at both route and data levels
- Implement brute-force protection: rate limiting on login endpoints, account lockout after 5 failed attempts

## Data Validation

- Validate all input on the server side — client validation is UX only
- Use parameterized queries or an ORM for all database operations (no raw SQL concatenation)
- Sanitize rich text input with a library (DOMPurify, DOMSanitizer) — never trust user HTML
- Enforce content type, size, and field count on all file uploads

## API Security

- All APIs behind HTTPS/TLS 1.2+
- Implement CORS explicitly — never wildcard `*` in production
- API rate limiting per endpoint and per user/IP
- Never expose internal error details to the client (log server-side, show generic message to user)
- Use environment variables for all secrets — never commit `.env` files

## Common Vulnerability Prevention

| Vulnerability | Prevention |
|--------------|------------|
| XSS | Escape all output; use framework escaping by default; CSP headers |
| CSRF | Anti-CSRF tokens on all state-changing requests |
| SQL Injection | Parameterized queries only; ORM where possible |
| SSRF | URL allowlisting for server-to-server calls; reject private IPs |
| Open Redirect | Validate redirect URLs against approved hostlist |
| Insecure Deserialization | Type-checking on deserialized data; never deserialize untrusted input |

## Headers & Configuration (Production)

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

## Secrets Management

- API keys, database credentials, and signing secrets in environment variables only
- Rotate keys on a 90-day schedule
- Never log secrets or include them in error messages
- Use different keys for dev/staging/production

## Session Management

- Secure and HttpOnly flags on all session cookies
- SameSite=Strict or Lax on cookies
- Logout invalidates server-side session token (not just clears frontend)
- Idle timeout: 30 minutes; absolute timeout: 8 hours

## Related Files

| File | Relationship |
|------|-------------|
| [`security.md`](./security.md) | This file covers standards; security.md has the detailed checklist with code examples — use both together |
| `design-system/tokens/color.md` §Semantic Palette | Security banners (error/warning/info colors) must use semantic palette tokens, not custom "alert" colors |
| [`testing/playwright/README.md`](../testing/playwright/README.md) §QA Agent Test Execution Rules | QA Agent should verify security headers are present on deployed feature as part of test suite |
| `workflows/README.md` Workflow 4 Phase "Review Security" | Dev Reviewer B uses these guidelines + security.md checklist for the security review dimension |
