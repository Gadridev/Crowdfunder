---
name: Project CRUD (Blueprint)
sourcePlan: /.cursor/plans/project_crud_a46676e4.plan.md
overview: Expanded blueprint with full data-flow scenarios for each endpoint (success + failure), aligned with the current implementation and your UML fields.
---

# Goal

Implement the first backend slice for the Project Owner: create, list, update, delete, and manually close projects.

# Key alignment with your UML class diagram

Your UML `Project` entity fields:

- `title`
- `description`
- `capital` (project target capital)
- `currentAmount` (amount raised so far)
- `status` (`open` | `closed`)
- `maxInvestmentPercentage`
- `ownerId`

This blueprint matches the current code implementation:

- Model: `[src/models/Project.model.ts](src/models/Project.model.ts)`
- Schemas: `[src/schemas/project.schema.ts](src/schemas/project.schema.ts)`
- Controllers: `[src/controller/Project.Controller.ts](src/controller/Project.Controller.ts)`
- Routes: `[src/routes/project.routes.ts](src/routes/project.routes.ts)`
- Mount: `[src/app.ts](src/app.ts)` at `/api/projects`

# Assumption for this slice

Project creation does **not** create investments yet. Therefore:

- `currentAmount` starts at `0`
- project auto-closure based on capital reached is a **next phase** (not implemented here)

# Common building blocks (used by every endpoint)

## Middleware chain patterns

All endpoints use `protect` (JWT) and `restrictTo("project_owner")` for authorization.

### `protect`
Location: `[src/middleware/auth.middleware.ts](src/middleware/auth.middleware.ts)`

- Reads `Authorization` header expecting `Bearer <token>`
- `jwt.verify(token, JWT_SECRET)`
- Loads user from DB: `User.findById(decoded.id)`
- Sets `req.user = { id, role }`

Typical failure responses:

- Missing token: `401` with message `"You are not logged in. Please log in to get access."`
- Invalid token: `401` with message `"Invalid token. Please log in again."`
- Token user missing: `401` with message `"The user belonging to this token no longer exists."`

### `restrictTo("project_owner")`
Location: `[src/middleware/auth.middleware.ts](src/middleware/auth.middleware.ts)`

- If `req.user` missing: `401` `"User not authenticated"`
- If role not allowed: `403` `"You do not have permission to perform this action"`

### `validateBody(schema)`
Location: `[src/middleware/validate.middleware.ts](src/middleware/validate.middleware.ts)`

- Runs `schema.safeParse(req.body)`
- On fail: `400` with message concatenated from Zod issue messages
- On success: sets `req.body` to parsed normalized values

## Error handling

- Controllers throw `AppError(message, statusCode)` where appropriate.
- Global error formatting is in `[src/middleware/error.middleware.ts](src/middleware/error.middleware.ts)`.

Response formats:

- For `AppError`: `{ "status": "fail", "message": "..." }`
- For unexpected errors: `{ "status": "error", "message": "Something went wrong" }` (or error.message in development)

# Endpoints (base mount `/api/projects`)

## Endpoint 1: Create Project

`POST /api/projects/`

### Middleware chain

```text
protect
-> restrictTo("project_owner")
-> validateBody(projectCreateBodySchema)
-> Project.Controller.createProject
```

### Mermaid data-flow (create - success)

```mermaid
flowchart TD
  Client[Client request] -->|POST /api/projects| Express[Express app]
  Express --> Validate[validateBody(projectCreateBodySchema)]
  Validate --> Protect[protect (JWT verify + req.user)]
  Protect --> Restrict[restrictTo(project_owner)]
  Restrict --> Create[Project.Controller.createProject]
  Create --> Mongo[Project.create in MongoDB]
  Mongo --> Create
  Create --> Response[200/201 JSON response]
```

### Success scenario

#### Preconditions

- Caller is authenticated (`Authorization: Bearer <jwt>`)
- Caller role is `project_owner`
- Body matches `projectCreateBodySchema`

#### Body requirements

Schema: `[src/schemas/project.schema.ts](src/schemas/project.schema.ts)`

- `title`: trimmed, min 3, max 120
- `description`: trimmed, min 20, max 2000
- `capital`: positive integer
- `maxInvestmentPercentage`: number in `0..50` (current implementation constraint)

#### What the controller writes

Controller: `[src/controller/Project.Controller.ts](src/controller/Project.Controller.ts)`

It creates a project document with:

- `ownerId = req.user!.id`
- `currentAmount = 0`
- `status = "open"`
- `capital`, `maxInvestmentPercentage`, `title`, `description` from body

#### Success response (shape)

Status: `201`

```json
{
  "status": "success",
  "data": { "project": { "...": "..." } }
}
```

### Failure scenarios (create)

1. Missing `Authorization` header
   - Where: `protect`
   - Status: `401`
   - Message: `"You are not logged in. Please log in to get access."`

2. Invalid/expired JWT
   - Where: `protect` during `jwt.verify`
   - Status: `401`
   - Message: `"Invalid token. Please log in again."`

3. Role not `project_owner`
   - Where: `restrictTo`
   - Status: `403`
   - Message: `"You do not have permission to perform this action"`

4. Body fails Zod validation
   - Where: `validateBody(projectCreateBodySchema)`
   - Status: `400`
   - Message: concatenation of Zod issue messages

5. Invalid Mongo/DB error
   - Where: `Project.create(...)`
   - Status: usually `500`
   - Response: `{ "status": "error", "message": "Something went wrong" }` (or error.message in development)

---

## Endpoint 2: List My Projects

`GET /api/projects/mine`

### Middleware chain

```text
protect
-> restrictTo("project_owner")
-> Project.Controller.listMyProjects
```

### Mermaid data-flow (list - success)

```mermaid
flowchart TD
  Client[Client request] -->|GET /api/projects/mine| Express[Express app]
  Express --> Protect[protect]
  Protect --> Restrict[restrictTo(project_owner)]
  Restrict --> List[Project.Controller.listMyProjects]
  List --> Mongo[Project.find({ ownerId })]
  Mongo --> List
  List --> Response[200 JSON response]
```

### Success scenario

#### Preconditions

- Authenticated
- Role is `project_owner`

#### What controller does

- `ownerId = req.user!.id`
- `Project.find({ ownerId }).sort({ createdAt: -1 })`

#### Success response (shape)

Status: `200`

```json
{
  "status": "success",
  "count": 3,
  "data": { "projects": [ { "...": "..." } ] }
}
```

### Failure scenarios (list)

1. Missing/invalid JWT
   - Status: `401`
   - From: `protect`

2. Wrong role
   - Status: `403`
   - From: `restrictTo`

3. Database error
   - Status: `500`
   - From: global `errorHandler`

---

## Endpoint 3: Update Project (only when open)

`PATCH /api/projects/:id`

### Middleware chain

```text
protect
-> restrictTo("project_owner")
-> validateBody(projectUpdateBodySchema)
-> Project.Controller.updateProject
```

### Success scenario (update open project)

#### Preconditions

- Authenticated
- Role is `project_owner`
- `:id` is a valid Mongo ObjectId string
- Project exists and belongs to caller (`ownerId`)
- Project `status` is `"open"`
- Body matches `projectUpdateBodySchema` and includes at least one field

#### Controller checks

In `[src/controller/Project.Controller.ts](src/controller/Project.Controller.ts)`:

- `assertValidProjectId(id)` -> throws `400 "Invalid project id"` if invalid
- `Project.findOne({ _id: id, ownerId })`
  - if not found: `404 "Project not found"`
- `assertProjectIsOpen(project)`
  - if closed: `400 "Project is closed"`
- Applies optional updates:
  - `title`, `description`, `capital`, `maxInvestmentPercentage`
- Defensive invariant:
  - if `project.capital < project.currentAmount` -> `400`

#### Success response

Status: `200`

```json
{
  "status": "success",
  "data": { "project": { "...": "..." } }
}
```

### Failure scenarios (update)

1. Missing/invalid JWT
   - `401` from `protect`

2. Wrong role
   - `403` from `restrictTo`

3. `:id` is not a valid ObjectId
   - `400` with message `"Invalid project id"`

4. Project doesn’t exist OR doesn’t belong to caller
   - `404` with message `"Project not found"`

5. Project is closed
   - `400` with message `"Project is closed"`

6. Body fails Zod validation
   - `400` from `validateBody(projectUpdateBodySchema)`
   - Note: schema requires at least one field (refinement), so `{}` fails.

7. Defensive invariant fails
   - `400` `"Project capital cannot be less than current amount"`

8. Database error
   - `500` from `errorHandler`

---

## Endpoint 4: Delete Project (only when open)

`DELETE /api/projects/:id`

### Middleware chain

```text
protect
-> restrictTo("project_owner")
-> Project.Controller.deleteProject
```

### Success scenario

#### Preconditions

- Authenticated
- Role is `project_owner`
- `:id` is a valid ObjectId
- Project exists and belongs to caller
- Project `status` is `"open"`

#### Controller checks

- `assertValidProjectId(id)` -> `400 "Invalid project id"` if invalid
- `Project.findOne({ _id: id, ownerId })`
  - not found -> `404 "Project not found"`
- `assertProjectIsOpen(project)` -> if closed -> `400 "Project is closed"`
- `project.deleteOne()`

#### Success response

Status: `200`

```json
{
  "status": "success",
  "message": "Project deleted"
}
```

### Failure scenarios (delete)

1. Missing/invalid JWT -> `401`
2. Wrong role -> `403`
3. Invalid `:id` -> `400 "Invalid project id"`
4. Not owned / not found -> `404 "Project not found"`
5. Project closed -> `400 "Project is closed"`
6. Database error -> `500`

---

## Endpoint 5: Close Project Manually (only when open)

`PATCH /api/projects/:id/close`

### Middleware chain

```text
protect
-> restrictTo("project_owner")
-> Project.Controller.closeProjectManually
```

### Success scenario

#### Preconditions

- Authenticated
- Role is `project_owner`
- `:id` is valid ObjectId
- Project exists and belongs to caller
- Project is currently `"open"`

#### Controller checks

- `assertValidProjectId(id)` -> `400 "Invalid project id"` if invalid
- `Project.findOne({ _id: id, ownerId })`
  - not found -> `404 "Project not found"`
- `assertProjectIsOpen(project)` -> closed -> `400 "Project is closed"`
- Sets:
  - `project.status = "closed"`
  - `project.save()`

#### Success response

Status: `200`

```json
{
  "status": "success",
  "data": { "project": { "...": "..." } }
}
```

### Failure scenarios (close)

1. Missing/invalid JWT -> `401`
2. Wrong role -> `403`
3. Invalid `:id` -> `400 "Invalid project id"`
4. Not owned / not found -> `404 "Project not found"`
5. Already closed -> `400 "Project is closed"`
6. Database error -> `500`

# What is intentionally NOT implemented yet in this slice

To be consistent with your decision (“project-only now; investments next phase”):

- `Investment` model/endpoints
- Wallet top-ups and balance debits/credits
- Automatic closing when `currentAmount >= capital`
- Percentage calculation for investor holdings

# Quick “definition of done” check

- Create/list/update/delete/close routes exist and are wired to controller logic.
- Role authorization uses `restrictTo("project_owner")`.
- Ownership is enforced in controllers via `{ _id: id, ownerId }`.
- Update/delete/close require `status === "open"`.
- TypeScript compile passes (`tsc --noEmit`).
- End-to-end scenarios are documented above.

