---
name: Investment Core
overview: Add investment core (Investment model, invest + wallet top-up endpoints, automatic project closing) plus the Project Owner views for investor lists and investor portfolios scoped to the owner’s projects.
sourcePlan: /.cursor/plans/investment_core_de02e42c.plan.md
---

## Scope / what this slice delivers

Build the next missing features needed for Project Owner stories:

- Owner can define **initial investment** when creating a project (cleanly implemented by reusing the same investment logic used for later investments).
- **Investor list per project** for the project owner (name, amount invested, percentage of capital).
- **Investor portfolio** for a project owner, scoped to investors who invested in the owner’s projects.
- A functional **Investment core**:
  - `Investment` model
  - wallet top-up
  - `invest` endpoint
  - enforce rules (project open, remaining capital, investor cap via `maxInvestmentPercentage`, wallet balance)
  - automatic close when `currentAmount >= capital`

Also provide investor “my investments” so investor portfolio story can be satisfied in the same slice.

## Clean design decisions already selected

- Owner is allowed to invest (at least initial; here we allow `project_owner` to use the invest endpoint too).
- Percentages are computed dynamically on read (`compute_on_read`). Investment stores `amount` only.
- Wallet exists for both `investor` and `project_owner` roles.
- Investment cap applies to owner’s initial investment too.
- Portfolio for owner is scoped to investments in the owner’s projects.

## Data-flow diagrams (endpoint-level)

### Invest flow (success)

```mermaid
flowchart TD
  Client[Client] -->|POST /api/projects/:id/invest| Express[Express]
  Express --> Protect[protect]
  Protect --> Restrict[restrictTo("investor","project_owner")]
  Restrict --> Validate[validateBody(investBodySchema)]
  Validate --> InvestCtrl[Investment.Controller.invest]
  InvestCtrl --> LoadProject[Project.findById]
  InvestCtrl --> CheckOpen[status open?]
  InvestCtrl --> CheckCaps[wallet + investor cap + remaining]
  InvestCtrl --> Tx[Mongo transaction:
Wallet--;
Project.currentAmount++;
Investment.create]
  Tx --> AutoClose[if currentAmount>=capital => status closed]
  AutoClose --> Response[200 JSON]
```

### Project create with initial investment (success)

```mermaid
flowchart TD
  Client[Client] -->|POST /api/projects| Express[Express]
  Express --> Validate[validateBody(projectCreateBodySchema)]
  Validate --> Protect[protect]
  Protect --> Restrict[restrictTo("project_owner")]
  Restrict --> CreateProject[Project.Controller.createProject]
  CreateProject --> MongoCreate[Project.create]
  MongoCreate -->? InitialInv{initialInvestment present?}
  InitialInv -->|yes| InvestLogic[reuse investment logic]
  InvestLogic --> Tx[Wallet--, Project.currentAmount++, Investment.create]
  InitialInv -->|no| Skip[skip]
  Tx --> AutoClose[if reaches capital => closed]
  Skip --> Response[201 JSON]
```

## Implementation notes

### Reuse investment logic

To keep things clean and avoid code duplication, implement a single internal function (or service-like helper) used by:

- `POST /api/projects/:id/invest`
- optional “initial investment” inside `POST /api/projects`

Even if the repo currently doesn’t have a services layer, we can implement this as private helpers inside `src/controller/Investment.Controller.ts` (or a small `src/service/investmentLogic.ts`).

### Percentage computation (dynamic on read)

For any endpoint returning holdings:

- `percentage = (totalInvestedByInvestor / project.capital) * 100`
- Return percentage rounded (e.g. 2 decimals).

## Todos

1. Add Investment model
   - Add `src/models/Investment.model.ts`
   - Fields:
     - `investorId` (ref `User`)
     - `projectId` (ref `Project`)
     - `amount` (int, positive)
   - Indexes:
     - `{ projectId: 1, investorId: 1 }`

2. Extend project creation schema + controller for “initial investment”
   - Update `src/schemas/project.schema.ts`:
     - add optional `initialInvestmentAmount?` and `initialInvestmentPercentage?`
     - require at least one if any initial investment fields are present
     - if both present, validate consistency against `capital` (or at least ensure computed values match within a small tolerance)
   - Update `src/controller/Project.Controller.ts`:
     - after `Project.create`, if initial investment provided:
       - execute investment logic for `investorId = ownerId`
       - update wallet, project currentAmount, create Investment
       - auto-close if reached

3. Add wallet top-up endpoint
   - Add schema `src/schemas/wallet.schema.ts` (or reuse a simple inline Zod)
   - Add `src/controller/Wallet.Controller.ts` with `topUp`
   - Add routes `src/routes/wallet.routes.ts`
   - Middleware order:
     - `protect` -> `restrictTo("investor","project_owner")` -> `validateBody(topUpSchema)` -> controller

4. Add invest endpoint
   - Add schemas `src/schemas/investment.schema.ts`
   - Add `src/controller/Investment.Controller.ts` with `invest`
   - Add route in `src/routes/project.routes.ts` (or a new investments route):
     - `POST /api/projects/:id/invest`
     - middleware order:
       - `protect` -> `restrictTo("investor","project_owner")` -> `validateBody(investBodySchema)` -> `invest`
   - Enforce rules:
     - project must be `open`
     - remaining capital: `capital - currentAmount >= amount`
     - investor cap: `(existingSumAmount + amount) <= capital * (maxInvestmentPercentage/100)`
     - wallet balance: `wallet.balance >= amount`
   - Use Mongo transaction for atomicity.

5. Add project owner endpoint to list investors of a project
   - Add route `GET /api/projects/:id/investors`
   - Middleware:
     - `protect` -> `restrictTo("project_owner")`
   - Controller:
     - verify the project belongs to owner
     - aggregate investments by `investorId`
     - join user `name`
     - compute dynamic percentage from `sumAmount` and `project.capital`

6. Add project owner endpoint to consult an investor portfolio (scoped)
   - Add route (example):
     - `GET /api/projects/:projectId/investors/:investorId/portfolio`
   - Middleware:
     - `protect` -> `restrictTo("project_owner")`
   - Controller logic:
     - verify `:projectId` belongs to owner
     - query investments where:
       - `investorId = :investorId`
       - `projectId` in all projects owned by `req.user.id`
     - return portfolio: list invested projects + amounts + computed percentage

7. Add investor “my investments” endpoint
   - Add route `GET /api/investments/me`
   - Middleware:
     - `protect` -> `restrictTo("investor","project_owner")` (clean default; owner also has wallet/investments)
   - Controller:
     - list investments by `req.user.id`
     - join project data for title/capital/status
     - compute dynamic percentage

8. Wire routes in `src/app.ts`
   - Mount `/api/wallet` and any investment routes.

9. Documentation
   - Add or update a deep-dive doc:
     - `docs/INVESTMENT_CORE_DEEP_DIVE.md`
     - include endpoint-by-endpoint success + failure scenarios with response shapes
     - include Mermaid data-flow diagrams for each new endpoint

10. Verify build
    - `tsc --noEmit` and fix any TS issues.

## Definition of Done

- All new endpoints work and enforce:
  - role + ownership rules
  - “project open only” rule
  - wallet balance and remaining capital rules
  - per-investor cap via `maxInvestmentPercentage`
  - automatic close when `currentAmount >= capital`
- Project Owner can:
  - define initial investment during project creation
  - list investors of their project with percentage
  - view portfolio of an investor scoped to their projects
- `percentage` is computed dynamically on read.

