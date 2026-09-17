# ZiqTech AI Coding Rules

## Project Overview

ZiqTech is an e-commerce technology store.

The application uses:

- Node.js
- Express.js
- PostgreSQL
- HTML
- CSS
- Vanilla JavaScript

The backend owns the API, authentication, database access, and business logic.

The frontend must communicate with the backend through API endpoints.

---

## Architecture Rules

1. Do not introduce Supabase unless explicitly requested.

2. PostgreSQL is the main production database.

3. Never allow frontend JavaScript to access PostgreSQL directly.

4. Database queries must be handled by the backend.

5. Keep frontend code inside the `frontend/` directory.

6. Keep backend logic inside the `backend/` directory.

7. Do not change the existing architecture unless there is a clear reason.

8. Before making a large architectural change, explain why it is necessary.

---

## API Rules

1. Keep API responses consistent.

2. Do not silently change an existing API response structure.

3. If an API response must change, identify all frontend code that depends on it.

4. Validate all user input on the backend.

5. Return appropriate HTTP status codes.

6. Do not expose internal errors, passwords, database credentials, or secrets to the frontend.

---

## Authentication Rules

1. Authentication and authorization must be enforced by the backend.

2. Never trust a frontend role such as `admin` without server verification.

3. Admin-only routes must verify the authenticated user's role.

4. Passwords must never be stored as plain text.

5. Session and authentication changes require deeper testing.

---

## Database Rules

1. Use PostgreSQL as the source of truth.

2. Use parameterized SQL queries.

3. Never concatenate untrusted user input directly into SQL.

4. Preserve existing data when changing schemas.

5. Database migrations must be reviewed before execution.

6. Do not delete tables, columns, orders, users, or products unless explicitly requested.

7. Verify important changes directly against database records.

---

## Product Variant Rules

Products may contain multiple variants.

A variant can contain:

- variant ID
- name
- storage or size
- colour
- price
- stock

Variant IDs must remain consistent between:

- product
- cart
- checkout
- order
- invoice
- database

Never rely only on a variant name when a stable variant ID exists.

---

## Order Rules

An order must preserve the product and variant information that existed when the order was placed.

Do not allow later product price changes to modify historical order prices.

Order totals must be calculated and validated by the backend.

---

## Security Rules

Never expose:

- database passwords
- session secrets
- API keys
- payment secrets
- environment variables

Secrets belong in `.env`.

Never hard-code production secrets into frontend or committed source files.

---

## AI Change Rules

Before editing code:

1. Understand the existing implementation.
2. Identify which files depend on the code being changed.
3. Prefer the smallest safe change.
4. Do not rewrite unrelated working code.
5. Preserve existing functionality unless the task explicitly requires changing it.

After editing:

1. Check for syntax errors.
2. Check variable scope.
3. Check API compatibility.
4. Check database compatibility.
5. Test the affected user flow.

---

## High-Risk Changes

Perform deeper testing when changes affect:

- authentication
- authorization
- payments
- PostgreSQL schema
- database migrations
- cart
- checkout
- order creation
- product variants
- invoices
- shared API endpoints

For high-risk changes, test the complete flow end-to-end.

Example:

Product → Variant → Cart → Checkout → Order → Database → Invoice

---

## Coding Style

- Prefer readable code over clever code.
- Use clear variable and function names.
- Keep functions focused on one responsibility.
- Avoid unnecessary dependencies.
- Reuse existing project helpers where appropriate.
- Follow the existing formatting style of the file being edited.

---

## AI Behaviour

Do not blindly assume existing code is wrong.

Do not replace working systems simply because another implementation is newer.

When uncertain about an important architectural decision, explain the trade-off before making the change.

The human developer owns the architecture and final decision.