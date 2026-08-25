# Client Questionnaire: Turning an Idea into a Web Solution

This questionnaire guides the BA Agent through Stage 1 (Requirements Gathering) of the Idea-to-Web-Solution Framework. Questions are organized by category — ask progressively, not all at once. Each question maps to one or more sections of the PRD template (`PRD/templates/prd-template.md`).

---

## Stage 1: Idea & Problem Discovery (PRD §1–§4)

### 1. What is the core idea in one sentence?
Maps to: **PRD §1 — Main Feature**

### 2. What specific pain point(s) does this solve? For whom? How often do they experience it?
Maps to: **PRD §2 — Problem Alignment (Pain point)**

### 3. What current solutions exist, and what's missing from them? (Competitors, workarounds, manual processes)
Maps to: **PRD §4 — Background & Evidence**

### 4. What evidence supports this problem is real? (User interviews, data, market research, anecdotal feedback)
Maps to: **PRD §4 — Background & Evidence**

### 5. What does success look like for the business? (Revenue, efficiency, user growth, compliance?)
Maps to: **PRD §1 — Why it matters / Business value**

### 6. Are there any existing products, drafts, or prototypes we should reference?
Maps to: **PRD §9 — Supporting Documents**

---

## Stage 2: Target Users & Personas (PRD §5)

### 7. Who are the primary users? Describe each persona — demographics, tech comfort level, context of use.
Maps to: **PRD §5 — Target Users table**

### 8. How many distinct user roles/types will there be? (e.g., admin, customer, reviewer, public visitor)
Maps to: **PRD §5 — Target Users; informs access control design**

### 9. Will users need accounts? If so, what authentication methods? (email/password, SSO, OAuth via Google/Apple/Microsoft, magic links, phone OTP)
Maps to: **Code Builder — config-rules.md §User Questions (auth choices)**

### 10. Is there a hierarchy or permissions structure? (admin/editor/viewer, RBAC roles, approval workflows)
Maps to: **PRD §6 — UX Design Principles; design system state definitions**

### 11. What are the key goals of each persona? What does "task complete" look like for them?
Maps to: **PRD §5 — Key Goal column; PRD §8 — User Stories**

### 12. Any accessibility requirements beyond WCAG 2.1 AA? (specific disability groups, screen reader users, elderly users?)
Maps to: **Design system — WCAG guidelines**

---

## Stage 3: Features & Priorities (PRD §1–§3)

### 13. List all desired features — what must the app do?
Maps to: **PRD §7 — In Scope; PRD §8 — User Stories**

### 14. Which features are critical for launch (MVP) vs. nice-to-have? Assign priority: P0/P1/P2/P3
Maps to: **PRD §3 — Timing & Priority table**

### 15. What data will users create, read, update, or delete? (CRUD operations on what entities?)
Maps to: **Design system — data models; Code Builder — database schema**

### 16. Are there any workflows with multiple steps? (e.g., onboarding, checkout, approval chains)
Maps to: **Design system — user flows/wireframes/interactive prototype**

### 17. Do any features depend on others shipping first? Identify dependencies and required order.
Maps to: **PRD §3 — Dependencies column; PRD §10 — Release Milestones**

### 18. What should NOT be built in this phase? Be explicit about out-of-scope items.
Maps to: **PRD §7 — Out of Scope**

---

## Stage 4: Business Rules & Logic (PRD §6–§12)

### 19. What are the business rules governing each feature? (e.g., "only account owners can delete," "reports auto-generate monthly," "prices round to nearest dollar")
Maps to: **PRD §6 — UX Design Principles; design system state definitions**

### 20. Are there conditional behaviors based on user state or data? (different views for different segments, dynamic layouts)
Maps to: **Design system — states of different business rules**

### 21. Any compliance requirements? (GDPR, HIPAA, PCI-DSS, COPPA, SOC 2, industry-specific regulations)
Maps to: **Code Builder — security guidelines; code builder config**

### 22. Do users need to export or import data? (CSV upload/export, API integrations with external systems)
Maps to: **PRD §8 — User Stories; design system interactions**

### 23. Any audit trail or logging requirements? (track who did what and when)
Maps to: **Design system states (activity logs); code builder config**

### 24. Data retention rules? (auto-delete after X days, archive policies)
Maps to: **Code Builder — data management configuration**

---

## Stage 5: Content & Data (Design System)

### 25. What content types exist in the app? (products, listings, articles, users, orders, tasks, media files)
Maps to: **Design system — components; database schema**

### 26. Will users upload files/images/media? What formats? Size limits? Thumbnail generation?
Maps to: **Design system — file upload loading states; security guidelines**

### 27. Is there existing content/data to migrate? Source format and volume?
Maps to: **PRD §9 — Supporting Documents; PRD §10 — Release Milestones**

### 28. Any multilingual or localization needs? Languages, RTL support, date/number/currency formats?
Maps to: **Design system responsiveness/localization tokens; code builder config**

---

## Stage 6: UX & Design Preferences (Design Agent input)

### 29. Do you have existing brand guidelines? Colors, logo, typography, tone of voice? If not, describe the desired feel.
Maps to: **Design system — tokens (colors, typography); brand guidelines**

### 30. Any design references or sites you admire? (specific URLs, apps, or screenshots)
Maps to: **Design system — component selection; visual direction**

### 31. What's the overall mood/tone? (corporate/trustworthy, playful/bold, minimal/serene, energetic/colorful)
Maps to: **Design system — tokens and design language**

### 32. What devices/browsers must work? Desktop-first? Mobile app equivalent? Specific browser requirements?
Maps to: **Design system — responsiveness breakpoints; cross-references table**

### 33. Any layout preferences? (dashboard-style, card-based, list-heavy, form-driven, visual/masonry)
Maps to: **Design system — component selection and page layouts**

### 34. Navigation style preference? (sidebar nav, top nav, tabbed, hamburger menu, wizard/stepper)
Maps to: **Design system — user flows and wireframes**

### 35. Do you have a preferred component library or design system? (shadcn/ui, MUI, Ant Design, custom-built)
Maps to: **Code Builder — config-rules.md §tech stack choices**

---

## Stage 7: Technical Stack & Architecture (Code Builder config)

### 36. Frontend framework preference? (Next.js, React, Vue, Svelte, plain HTML/CSS/JS, other)
Maps to: **Code Builder — config-rules.md §frontend choice; scaffold selection**

### 37. Database preference or requirements? (PostgreSQL, MySQL, MongoDB, Firestore, Supabase, Prisma?)
Maps to: **Code Builder — config-rules.md §database choice**

### 38. Hosting/platform preference? (Vercel, AWS, GCP, Azure, Netlify, self-hosted, Heroku-like?)
Maps to: **Code Builder — config-rules.md §hosting choice**

### 39. API needs? REST, GraphQL, tRPC, serverless functions? Internal only or public-facing?
Maps to: **Code Builder — config-rules.md §API choices**

### 40. Do you need real-time features? (live updates, chat, notifications, collaborative editing) → WebSockets?
Maps to: **Code Builder — tech stack; design system — interaction patterns**

### 41. Any third-party integrations required? (Stripe/PayPal for payments, SendGrid/SES for email, Twilio for SMS, Google Maps, Slack/Discord webhooks, CRM tools)
Maps to: **PRD §8 — User Stories; Code Builder — config-rules.md**

### 42. File storage needs? (AWS S3, Cloudinary, Firebase Storage, local?)
Maps to: **Code Builder — config-rules.md; design system — file upload states**

### 43. Search requirements? (Elasticsearch, Algolia, PostgreSQL full-text, Meilisearch?)
Maps to: **PRD §8 — User Stories; Code Builder — config-rules.md**

---

## Stage 8: Security & Data Protection

### 44. How sensitive is the data? (public info, PII, financial, health, confidential business data)
Maps to: **Skills — security guidelines; security.md detailed checklist**

### 45. Do you need encryption at rest and in transit? (beyond default TLS — AES for database fields?)
Maps to: **Skills — security guidelines**

### 46. Rate limiting needs? (public API endpoints, form submissions, login attempts)
Maps to: **Skills — security guidelines; code builder config**

### 47. File upload security rules? (allowed types, virus scanning, size limits, CDN delivery)
Maps to: **Skills — security.md (file uploads section); design system states**

### 48. Any IP allowlisting or network restrictions?
Maps to: **Skills — security guidelines**

---

## Stage 9: Performance & Scale

### 49. Expected traffic/volume? (daily active users, concurrent users, records/rows to handle)
Maps to: **Code Builder — config-rules.md (infrastructure choices); design system performance constraints**

### 50. Performance expectations? (page load targets, time-to-interactive budgets)
Maps to: **PRD §3 — Timing; Code Builder — config-rules.md**

### 51. Any CDN or edge computing requirements?
Maps to: **Code Builder — config-rules.md §hosting configuration**

---

## Stage 10: Analytics & Monitoring

### 52. What metrics do you want to track? (conversion rates, user engagement, feature usage, error rates)
Maps to: **PRD §9 — Supporting Documents (analytics/metrics)**

### 53. Analytics tooling preference? (Google Analytics, Plausible, PostHog, Mixpanel, custom?)
Maps to: **Code Builder — config-rules.md**

### 54. Error monitoring/logging needs? (Sentry, LogRocket, custom dashboard?)
Maps to: **Code Builder — config-rules.md**

---

## Stage 11: Timeline & Process

### 55. What's your target launch date? Any hard deadlines?
Maps to: **PRD §3 — Target release; PRD §10 — Release Milestones**

### 56. Do you want to ship an MVP first, or a full-featured release?
Maps to: **PRD §7 — Scope (in/out); PRD §10 — Phased plan**

### 57. What milestones matter to you? (design review, feature demos, beta testing, soft launch)
Maps to: **PRD §10 — Release Milestones & Plan table**

### 58. Who will provide feedback during development? What's the approval cadence?
Maps to: **Framework workflow — user approval gates per stage (§6: User always has final approval)**

### 59. Will there be beta testers or real users before public launch?
Maps to: **PRD §10 — Release Milestones; PRD §9 — Supporting documents**

---

## Stage 12: Post-Launch & Maintenance

### 60. Do you need ongoing maintenance/hosting management after launch?
Maps to: **Code Builder — config-rules.md (deployment strategy)**

### 61. Any CI/CD requirements? (GitHub Actions, GitLab CI, CircleCI, manual deploys)
Maps to: **Code Builder — config-rules.md**

### 62. Domain and DNS setup needed? SSL certificates? Custom domain?
Maps to: **Code Builder — config-rules.md §hosting & deployment**

### 63. SEO requirements? (SSR vs CSR, meta tags, sitemap, structured data, Open Graph, blog/content marketing?)
Maps to: **Frontend framework choice; Code Builder — config-rules.md**

### 64. Email templates and transactional email needs? (welcome emails, password resets, notifications)
Maps to: **PRD §8 — User Stories; design system components**

---

## Stage 13: Constraints & Risks

### 65. Budget constraints? (affects SaaS tool choices, hosting tier, AI tool usage)
Maps to: **PRD §3 — Timing & Priority; Code Builder — config-rules.md**

### 66. Team technical capabilities? (what can you maintain post-launch?)
Maps to: **Framework guidelines (§general-best-practices); tech stack selection**

### 67. What are your biggest concerns or risks about this project?
Maps to: **PRD §12 — Assumptions & Risks**

### 68. Are there legal or IP considerations? (open-source license compatibility, data ownership)
Maps to: **Skills — security guidelines; PRD §9 — Supporting Documents**

---

## Usage Notes for the BA Agent

- **Ask progressively:** Present questions in order, grouping related ones. Don't overwhelm the client with all 68 at once.
- **Skip irrelevant sections:** If a question doesn't apply (e.g., no file uploads), note it and skip.
- **Use Section 11 of the PRD template** (`User Clarifications & Questions`) to track items requiring user input before proceeding.
- **All reviewer comments in Section 13** (`Requirements Review Log`) must be resolved by the BA Agent and Requirements Reviewer before design begins.
- **Missing answers block downstream flow:** The PRD cannot be approved until all answered sections are complete and both reviewers sign off per CLAUDE.md §6 — "The user always has final approval before moving between stages."
