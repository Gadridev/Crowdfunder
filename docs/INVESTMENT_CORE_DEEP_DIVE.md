# Crowdfunder API — Investment Core (Deep Dive)

This document explains the **Investment core** slice that enables:

- Investor investment into projects
- Project Owner initial investment at project creation
- Automatic project closing when `currentAmount >= capital`
- Project Owner reads: investors-per-project + investor portfolio (scoped)
- Investor/Admin-adjacent reads: `GET /api/investments/me`

---

## Endpoints covered

Base paths are mounted in `src/app.ts`:

- `/api/wallet`
- `/api/projects`
- `/api/investments`

### Wallet top-up

- `POST /api/wallet/top-up`

### Investing

- `POST /api/projects/:id/invest`

### Project Owner reads

- `GET /api/projects/:id/investors`
- `GET /api/projects/:projectId/investors/:investorId/portfolio`

### Investor reads

- `GET /api/investments/me`

---

## Data model: `Investment`

Implemented in `[src/models/Investment.model.ts](src/models/Investment.model.ts)`.

Fields:

- `investorId` (ref `User`)
- `projectId` (ref `Project`)
- `amount` (positive number; stored as int by validation)
- `timestamps: true`

Indexes:

- `{ projectId: 1, investorId: 1 }` (supports grouping for portfolios and investor lists)

---

## Shared atomic investment logic

Implemented in `[src/service/investmentLogic.ts](src/service/investmentLogic.ts)`.

### `applyInvestment(...)` purpose

Single source of truth for applying an investment:

- Validates invariants
- Checks:
  - project is `open`
  - `capital - currentAmount >= amount`
  - per-investor cap via `project.maxInvestmentPercentage`
  - wallet exists and has enough balance
- Performs atomic updates:
  - `wallet.balance -= amount`
  - `project.currentAmount += amount`
  - create `Investment` record
  - if `project.currentAmount >= project.capital` => `project.status = "closed"`

### Transaction requirement

`applyInvestment` must be called inside a MongoDB session transaction; callers in:

- `Project.Controller.createProject` (initial investment)
- `Investment.Controller.invest` (later investments)

start the session and pass `session` into `applyInvestment`.

---

## Initial investment at project creation

This is implemented by extending `projectCreateBodySchema` and `Project.Controller.createProject`.

Code locations:

- Schema: `[src/schemas/project.schema.ts](src/schemas/project.schema.ts)`
- Controller: `[src/controller/Project.Controller.ts](src/controller/Project.Controller.ts)`

### Inputs

`POST /api/projects/` accepts:

- `initialInvestmentAmount` (optional, positive int)
- `initialInvestmentPercentage` (optional, positive up to 100)

Rule when both are present:

- The controller/schema validates that `initialInvestmentAmount` matches the derived amount from
  `capital * initialInvestmentPercentage / 100` (within a tolerance of 1).

### Success data-flow (Mermaid)

```mermaid
flowchart TD
  Client[Client request] -->|POST /api/projects| Express[Express]
  Express --> Validate[validateBody(projectCreateBodySchema)]
  Validate --> Protect[protect]
  Protect --> Restrict[restrictTo(project_owner)]
  Restrict --> Create[Project.Controller.createProject]
  Create --> Tx[Mongo transaction]
  Tx --> ProjectCreate[Project.create]
  ProjectCreate -->? InitInv{initial investment provided?}
  InitInv -->|yes| Apply[applyInvestment(ownerId, projectId, amount)]
  InitInv -->|no| Skip[skip investment]
  Apply --> AutoClose[if currentAmount>=capital => status closed]
  Skip --> Commit[commit]
  Commit --> Response[201 JSON with project]
```

### Failure scenarios (initial investment)

1. Invalid JWT / wrong role
   - Where: `protect`, `restrictTo("project_owner")`
   - Status: `401` or `403`

2. Invalid body / mismatch between amount and percentage
   - Where: `validateBody(projectCreateBodySchema)`
   - Status: `400`

3. Owner wallet has no balance (or insufficient balance)
   - Where: `applyInvestment` checks `wallet.balance < amount`
   - Status: `400`
   - Message: `"Insufficient wallet balance"`

4. Project closed (should not happen for creation in this slice, but enforced)
   - Where: `applyInvestment`
   - Status: `400`
   - Message: `"Project is closed"`

5. Not enough remaining capital
   - Where: `applyInvestment`
   - Status: `400`
   - Message: `"Not enough remaining capital"`

6. Exceeds per-investor cap
   - Where: `applyInvestment`
   - Status: `400`
   - Message: `"Investment exceeds per-investor cap"`

---

## Wallet top-up

Endpoint: `POST /api/wallet/top-up`

Implemented in:

- Route: `[src/routes/wallet.routes.ts](src/routes/wallet.routes.ts)`
- Schema: `[src/schemas/wallet.schema.ts](src/schemas/wallet.schema.ts)`
- Controller: `[src/controller/Wallet.Controller.ts](src/controller/Wallet.Controller.ts)`

### Middleware chain

- `protect` -> `restrictTo("investor","project_owner")` -> `validateBody(topUpBodySchema)` -> `topUp`

### Success behavior

- Finds wallet by `userId=req.user.id`
- If wallet missing, creates it with balance `0` (safe guard)
- Adds `amount` to `wallet.balance`
- Returns:
  - `200 { status: "success", data: { wallet } }`

### Failure scenarios

1. Missing/invalid JWT => `401` from `protect`
2. Wrong role => `403` from `restrictTo`
3. Invalid body => `400` from `validateBody`

---

## Invest endpoint

Endpoint: `POST /api/projects/:id/invest`

Implemented in:

- Route: `[src/routes/project.routes.ts](src/routes/project.routes.ts)`
- Schema: `[src/schemas/investment.schema.ts](src/schemas/investment.schema.ts)`
- Controller: `[src/controller/Investment.Controller.ts](src/controller/Investment.Controller.ts)`
- Shared logic: `[src/service/investmentLogic.ts](src/service/investmentLogic.ts)`

### Middleware chain

- `protect` -> `restrictTo("investor","project_owner")` -> `validateBody(investBodySchema)` -> `invest`

### Inputs

Request body accepts:

- `amount` (optional, positive int)
- `percentage` (optional, positive up to 100)

At least one must be provided.

If both are provided:

- controller derives amount from `percentage` and checks it matches `amount` (tolerance: 1).

### Success data-flow (Mermaid)

```mermaid
flowchart TD
  Client[Client] -->|POST /api/projects/:id/invest| Express[Express]
  Express --> Protect[protect]
  Protect --> Restrict[restrictTo(investor,project_owner)]
  Restrict --> Validate[validateBody(investBodySchema)]
  Validate --> InvestCtrl[Investment.Controller.invest]
  InvestCtrl --> Tx[start session transaction]
  Tx --> LoadProject[Project.findById]
  LoadProject --> ComputeAmount{amount/percentage?}
  ComputeAmount --> Apply[applyInvestment(in transaction)]
  Apply --> AutoClose{currentAmount>=capital?}
  AutoClose -->|yes| Close[status=closed]
  AutoClose -->|no| KeepOpen[status open]
  Close --> Commit[commit]
  KeepOpen --> Commit
  Commit --> Response[200 JSON]
```

### Success response shape

Status: `200`

```json
{
  "status": "success",
  "data": {
    "investment": { "...": "..." },
    "project": { "...": "..." }
  }
}
```

### Failure scenarios (invest)

1. Missing/invalid JWT => `401`
2. Wrong role => `403`
3. Invalid body => `400` (Zod)
4. Invalid `:id` => `400` message `"Invalid project id"`
5. `amount`/`percentage` mismatch => `400` message
   - `"amount and percentage do not match project capital"`
6. Project not found => `404` `"Project not found"`
7. Project closed => `400` `"Project is closed"`
8. Not enough remaining capital => `400` `"Not enough remaining capital"`
9. Insufficient wallet balance => `400` `"Insufficient wallet balance"`
10. Exceeds per-investor cap => `400` `"Investment exceeds per-investor cap"`

---

## Project Owner: list investors of a project

Endpoint: `GET /api/projects/:id/investors`

Implemented in:

- Route: `[src/routes/project.routes.ts](src/routes/project.routes.ts)`
- Controller: `[src/controller/Investment.Controller.ts](src/controller/Investment.Controller.ts)`

### Authorization

- `protect` -> `restrictTo("project_owner")`
- Controller verifies the project belongs to the caller:
  - `Project.findOne({ _id: projectId, ownerId })`

### Success behavior

- Aggregates Investments by `investorId` for that `projectId`
- Joins `User` to get investor `name`
- Computes dynamic percentage:
  - `percentage = (sumAmount / project.capital) * 100` (rounded to 2 decimals)

### Response shape

```json
{
  "status": "success",
  "data": {
    "projectId": "…",
    "investors": [
      { "investorId": "…", "name": "…", "amountInvested": 123, "percentage": 25.5 }
    ]
  }
}
```

### Failure scenarios

1. Missing/invalid JWT => `401`
2. Wrong role => `403`
3. Invalid project id => `400` `"Invalid project id"`
4. Project not found / not owned => `404` `"Project not found"`

---

## Project Owner: consult investor portfolio (scoped)

Endpoint: `GET /api/projects/:projectId/investors/:investorId/portfolio`

### Authorization and scoping

- `protect` -> `restrictTo("project_owner")`
- Controller first verifies `projectId` belongs to the owner (ensures ownership context)
- Portfolio is scoped to all projects owned by the same owner, for the provided `investorId`.

### Success response

Returns:

- `portfolio[]`: list of projects the investor invested in
  - includes `title`, `amountInvested`, `percentage`, `status`
- `totalInvested`: sum across portfolio

If the investor has no investments, `portfolio` is an empty array.

### Failure scenarios

1. Missing/invalid JWT => `401`
2. Wrong role => `403`
3. Invalid `projectId` or `investorId` => `400`
4. `projectId` not owned => `404` `"Project not found"`

---

## Investor / Owner: my investments

Endpoint: `GET /api/investments/me`

### Authorization

- `protect` -> `restrictTo("investor","project_owner")`

### Success behavior

- Aggregates investments where `investorId = req.user.id`
- Joins `Project` to return title/capital/status
- Computes dynamic percentage per investment bucket:
  - `sumAmount / project.capital * 100`

Response:

```json
{
  "status": "success",
  "data": {
    "investments": [ { "projectId": "...", "title": "...", "amountInvested": 1000, "percentage": 20 } ],
    "totalInvested": 1000
  }
}
```

### Failure scenarios

1. Missing/invalid JWT => `401`
2. Wrong role => `403`
3. Invalid id (should never happen with JWT, but enforced) => `400`

---

## “What changed” in existing Project Owner flow

`POST /api/projects` now optionally accepts:

- `initialInvestmentAmount`
- `initialInvestmentPercentage`

When provided, the controller applies the investment logic immediately inside the same transaction and will automatically close the project if `capital` is reached.

