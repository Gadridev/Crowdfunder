# Crowdfunder — Next Features Preview & Build Plan

This file gives a practical roadmap for what to build next after authentication.
It is intentionally action-focused: what to add, why it matters, and in which order.

---

## 1) Current baseline (already done)

- Auth endpoints are live:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/auth/me`
- JWT authentication middleware exists: `protect`.
- Role authorization middleware exists: `restrictTo(...roles)`.
- Roles are defined: `project_owner`, `investor`, `admin`.
- Investor wallet model exists and is created on investor registration.
- Global error handler + validation middleware are wired.

This means the project is ready for feature routes with secure role gates.

---

## 2) Product direction from your use-case diagram

From your diagram, the app should support 3 actors:

- Project Owner
  - Create project
  - Update project
  - Delete project
  - Close project manually
  - View own projects
  - View project investors
- Investor
  - Top up balance
  - Browse open projects
  - Invest in a project
  - View my investments
- Admin
  - View all investors
  - View all project owners
  - View portfolios

---

## 3) Recommended implementation order (step-by-step)

Build in this order to reduce risk and keep each step testable.

### Phase 1 — Project domain (owner + public browse)

1. Add `Project` model.
2. Add owner project CRUD + close endpoint.
3. Add public/project list endpoint for investors.

Why first:
- Investment flows depend on project existence and status.

### Phase 2 — Wallet and investment core

1. Add top-up endpoint for investors.
2. Add `Investment` model.
3. Add invest endpoint with all money/status checks.
4. Add “my investments” endpoint.

Why second:
- This is the financial core and needs solid project rules from Phase 1.

### Phase 3 — Admin read views

1. Add admin list endpoints.
2. Add portfolio aggregates.

Why third:
- Admin data depends on user/project/investment data being present.

### Phase 4 — Hardening and quality

1. Transactions for money-critical writes.
2. Pagination/filter/sort.
3. Rate limiting and security extras.
4. Tests and API docs.

---

## 4) Concrete features to build next (with route previews)

## A) Project Owner features

### A1. Create a project

- Route: `POST /api/projects`
- Access: `protect`, `restrictTo("project_owner")`
- Body (example):
  - `title`, `description`, `targetAmount`, `deadline`
- Rules:
  - `targetAmount > 0`
  - `deadline` in the future
- Data:
  - `ownerId = req.user.id`
  - `status = "open"`

### A2. Update own project

- Route: `PATCH /api/projects/:id`
- Access: `protect`, `restrictTo("project_owner")`
- Rule:
  - only owner can update
  - no update if closed/finished (your business choice)

### A3. Delete own project

- Route: `DELETE /api/projects/:id`
- Access: `protect`, `restrictTo("project_owner")`
- Rule:
  - only owner can delete
  - block delete if has investments (recommended)

### A4. Close project manually

- Route: `PATCH /api/projects/:id/close`
- Access: `protect`, `restrictTo("project_owner")`
- Rule:
  - only owner can close
  - only open projects can be closed

### A5. View own projects

- Route: `GET /api/projects/mine`
- Access: `protect`, `restrictTo("project_owner")`
- Supports:
  - pagination
  - status filter (`open`, `closed`, `funded`)

### A6. View project investors

- Route: `GET /api/projects/:id/investors`
- Access: `protect`, `restrictTo("project_owner")`
- Rule:
  - project must belong to current owner
- Data source:
  - `Investment` collection joined with investor users

---

## B) Investor features

### B1. Top up balance

- Route: `POST /api/wallet/top-up`
- Access: `protect`, `restrictTo("investor")`
- Body:
  - `amount`
- Rule:
  - `amount > 0`
- Behavior:
  - increment wallet balance
  - create wallet transaction log (recommended new model)

### B2. Browse open projects

- Route: `GET /api/projects/open`
- Access:
  - either public or `protect` (choose your product policy)
- Filters:
  - category, min/max target, deadline, search

### B3. Invest in a project

- Route: `POST /api/projects/:id/invest`
- Access: `protect`, `restrictTo("investor")`
- Body:
  - `amount`
- Critical rules:
  - project status must be `open`
  - project not expired / closed
  - amount > 0
  - wallet balance >= amount
- Atomic behavior (important):
  - decrease wallet balance
  - increase project raised amount
  - create investment record
  - all in one DB transaction

### B4. View my investments

- Route: `GET /api/investments/me`
- Access: `protect`, `restrictTo("investor")`
- Returns:
  - list of investments with project details and timestamps

---

## C) Admin features

### C1. View all investors

- Route: `GET /api/admin/investors`
- Access: `protect`, `restrictTo("admin")`

### C2. View all project owners

- Route: `GET /api/admin/project-owners`
- Access: `protect`, `restrictTo("admin")`

### C3. View portfolios

- Route: `GET /api/admin/portfolios`
- Access: `protect`, `restrictTo("admin")`
- Suggested data:
  - investor wallet balances
  - investments total per investor
  - project exposure summary

---

## 5) Data model additions suggested

### `Project` model (new)

Suggested fields:
- `ownerId` (ref User)
- `title`, `description`
- `targetAmount`
- `raisedAmount` (default 0)
- `deadline`
- `status` (`open` | `closed` | `funded`)
- `createdAt`, `updatedAt`

### `Investment` model (new)

Suggested fields:
- `investorId` (ref User)
- `projectId` (ref Project)
- `amount`
- `createdAt`

Indexes:
- `(investorId, createdAt)`
- `(projectId, createdAt)`

### `WalletTransaction` model (optional but recommended)

Suggested fields:
- `walletId`
- `type` (`top_up` | `invest_debit` | `refund`)
- `amount`
- `reference` (project/investment id)
- `createdAt`

This gives traceability for every balance change.

---

## 6) Authorization matrix (quick reference)

| Action | project_owner | investor | admin |
|-------|---------------|----------|-------|
| Register/Login | Yes | Yes | No (manual create) |
| Create/Update/Delete/Close project | Yes (own only) | No | No |
| View own projects | Yes | No | No |
| View project investors | Yes (own project) | No | Optional |
| Top up wallet | No | Yes | No |
| Browse open projects | Optional/Yes | Yes | Yes |
| Invest | No | Yes | No |
| View my investments | No | Yes | No |
| View all investors/owners/portfolios | No | No | Yes |

---

## 7) Suggested immediate next step (what we should do now)

Start with **Phase 1, Step A1: Create Project**.

Exact deliverables for this first next feature:

1. Add `src/models/Project.model.ts`
2. Add `src/schemas/project.schema.ts` for create validation
3. Add `src/controller/Project.Controller.ts` with `createProject`
4. Add `src/routes/project.routes.ts` with:
   - `POST /api/projects` guarded by `protect`, `restrictTo("project_owner")`
5. Mount routes in `app.ts`
6. Add detailed data flow section for this endpoint in docs

---

## 8) Definition of done for each feature

Each new endpoint should only be considered done when:

- Request validation exists (Zod)
- Auth/authz guard is correct (`protect` + `restrictTo` when needed)
- Ownership checks are implemented (where relevant)
- Error paths return correct status codes
- Basic manual test examples are documented
- TypeScript build passes

---

If you want, next I can implement Phase 1 Step A1 immediately (Create Project) in code, with the same deep documentation style used for auth.
