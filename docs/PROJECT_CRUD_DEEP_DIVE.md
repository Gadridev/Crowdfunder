# Crowdfunder API — Project CRUD (Deep Dive)

This document explains the **Project CRUD** slice implemented for `project_owner` users.
It describes:

1. The data model (`Project`)
2. Endpoints, middleware order, and responsibilities
3. End-to-end data flows (success + failure scenarios)
4. Exact authorization/ownership rules enforced by the controllers

## What this slice implements

Only the **Project Owner** can manage projects:

- Create a project
- List your projects
- Update a project (while open)
- Delete a project (while open)
- Manually close a project

This slice does **not** implement investments yet. Therefore:

- `currentAmount` starts at `0` and remains `0` for now
- “automatic closing when capital is reached” is a **next phase** (not implemented in this slice)

---

## Quick endpoint reference

Base path is mounted in `src/app.ts` at `/api/projects`.

1. `POST /api/projects/`  
   Middlewares: `protect` -> `restrictTo("project_owner")` -> `validateBody(projectCreateBodySchema)` -> `createProject`

2. `GET /api/projects/mine`  
   Middlewares: `protect` -> `restrictTo("project_owner")` -> `listMyProjects`

3. `PATCH /api/projects/:id`  
   Middlewares: `protect` -> `restrictTo("project_owner")` -> `validateBody(projectUpdateBodySchema)` -> `updateProject`

4. `DELETE /api/projects/:id`  
   Middlewares: `protect` -> `restrictTo("project_owner")` -> `deleteProject`

5. `PATCH /api/projects/:id/close`  
   Middlewares: `protect` -> `restrictTo("project_owner")` -> `closeProjectManually`

---

## Data model: `Project`

Implemented in `[src/models/Project.model.ts](src/models/Project.model.ts)`.

### Fields (match your UML class diagram)

- `ownerId` (`ObjectId`, ref `User`)
  - The project owner in the system.
  - Used for ownership enforcement in every handler.
- `title` (`string`)
- `description` (`string`)
- `capital` (`number`)
  - The project’s target capital (called `capital` in the UML diagram).
- `currentAmount` (`number`, default `0`)
  - The amount currently raised (starts at 0 in this slice).
- `maxInvestmentPercentage` (`number`)
  - Max percentage a single investor may invest (input-controlled by owner).
  - Currently constrained in schemas to `0..50` to respect your business constraint that an investor cannot exceed 50%.
- `status` (`"open" | "closed"`)
  - Controls whether updates/deletes/close are allowed.

### Important Mongoose behaviors

- Schema uses `{ timestamps: true }`, so documents get `createdAt`/`updatedAt`.
- Indices:
  - `ownerId` + `createdAt` for “list my projects”
  - `status` for future filtering

---

## Authorization and ownership rules (enforced consistently)

All handlers depend on:

1. `protect` middleware sets `req.user = { id, role }`
2. `restrictTo("project_owner")` ensures only owners can call these endpoints
3. Controllers enforce ownership by querying with:

```text
{ _id: id, ownerId: req.user.id }
```

This means:

- If you pass an ID that belongs to another owner, the controller behaves as if it does not exist (`404`), preventing information leaks.

Additionally, this slice enforces:

- Only projects with `status === "open"` can be updated, deleted, or closed.
- If `status !== "open"`, the controller throws `AppError("Project is closed", 400)`.

---

## Middleware responsibilities (where each rule lives)

### `protect` (`src/middleware/auth.middleware.ts`)

- Extracts Bearer token from `Authorization` header
- Verifies JWT with `JWT_SECRET`
- Loads the user from MongoDB
- Sets `req.user`

If it fails, the response is `401` with an `AppError` message.

### `restrictTo("project_owner")`

- Checks `req.user.role` is included in the allowed roles list
- If not, response is `403`

### `validateBody(...)`

- Runs `schema.safeParse(req.body)`
- On invalid input:
  - throws `AppError(message, 400)`
  - the global `errorHandler` returns `{ status: "fail", message }`

---

## End-to-end data flows (all scenarios)

Below, “success path” shows what happens when everything is valid, and “failure scenarios” list what can go wrong and where it fails.

### 1) Create a project

Endpoint: `POST /api/projects/`

#### Success scenario (owner creates an open project)

Example request:

```http
POST /api/projects/
Authorization: Bearer <jwt>
Content-Type: application/json
```

Body:

```json
{
  "title": "Seed Funding Round",
  "description": "A detailed project description with at least 20 characters.",
  "capital": 100000,
  "maxInvestmentPercentage": 25
}
```

Data flow:

```text
Client
  -> Express parses JSON into req.body
  -> validateBody(projectCreateBodySchema)
       -> safeParse succeeds
       -> req.body is normalized by Zod
  -> protect
       -> jwt.verify succeeds
       -> User.findById succeeds
       -> req.user set (id, role)
  -> restrictTo("project_owner")
       -> role check passes
  -> createProject controller
       -> Project.create({
            ownerId: req.user.id,
            title, description, capital,
            currentAmount: 0,
            maxInvestmentPercentage,
            status: "open"
          })
  -> res.status(201).json({ status: "success", data: { project } })
```

Success response shape:

```json
{
  "status": "success",
  "data": { "project": { "...project fields..." } }
}
```

#### Failure scenarios (what can go wrong)

1. Missing/invalid JWT
   - Where: `protect` middleware
   - Response: `401`
   - Example messages:
     - `"You are not logged in. Please log in to get access."`
     - `"Invalid token. Please log in again."`

2. Wrong role
   - Where: `restrictTo("project_owner")`
   - Response: `403`
   - Message: `"You do not have permission to perform this action"`

3. Body validation fails (Zod)
   - Where: `validateBody(projectCreateBodySchema)`
   - Response: `400`
   - Example causes:
     - `title` too short/too long
     - `description` too short
     - `capital` not positive integer
     - `maxInvestmentPercentage` out of `0..50`

4. MongoDB write error / duplicate constraint
   - Where: `Project.create(...)`
   - Response:
     - Duplicate key handling is not explicitly customized for Project in `errorHandler` (it does handle `code === 11000` generically)
     - Otherwise: `500` (`Something went wrong`)

---

### 2) List “my projects”

Endpoint: `GET /api/projects/mine`

#### Success scenario (list projects owned by caller)

Data flow:

```text
Client
  -> protect verifies JWT and sets req.user
  -> restrictTo("project_owner")
  -> listMyProjects controller
       -> Project.find({ ownerId: req.user.id }).sort({ createdAt: -1 })
  -> res.status(200).json({ status, count, data: { projects } })
```

Success response:

```json
{
  "status": "success",
  "count": 3,
  "data": {
    "projects": [ { "...": "..." } ]
  }
}
```

#### Failure scenarios

1. Missing/invalid JWT
   - Where: `protect`
   - Response: `401`

2. Wrong role
   - Where: `restrictTo`
   - Response: `403`

3. MongoDB error
   - Where: `Project.find(...)`
   - Response: `500`

---

### 3) Update a project (only when open)

Endpoint: `PATCH /api/projects/:id`

#### Success scenario (owner updates an open project)

Body example:

```json
{
  "title": "Updated title",
  "capital": 120000
}
```

Data flow:

```text
Client
  -> validateBody(projectUpdateBodySchema)
       -> safeParse succeeds
  -> protect + restrictTo
  -> updateProject controller
       -> assertValidProjectId(:id)
       -> Project.findOne({ _id: id, ownerId: req.user.id })
       -> if not found -> 404
       -> assertProjectIsOpen(project)
       -> apply provided fields to the document
       -> invariant check: if capital < currentAmount -> 400
       -> project.save()
  -> res.status(200).json({ status: "success", data: { project } })
```

#### Failure scenarios

1. Invalid `:id` format
   - Where: `assertValidProjectId`
   - Response: `400`
   - Message: `"Invalid project id"`

2. Project not owned by caller
   - Where: `Project.findOne({ _id: id, ownerId })`
   - Response: `404`
   - Message: `"Project not found"`

3. Project is closed
   - Where: `assertProjectIsOpen`
   - Response: `400`
   - Message: `"Project is closed"`

4. Zod body validation fails
   - Where: `validateBody(projectUpdateBodySchema)`
   - Response: `400`
   - Example: no fields provided (empty object)

5. MongoDB/other unexpected error
   - Response: `500`

---

### 4) Delete a project (only when open)

Endpoint: `DELETE /api/projects/:id`

#### Success scenario (owner deletes an open project)

Data flow:

```text
protect + restrictTo
  -> deleteProject controller
       -> assertValidProjectId(:id)
       -> Project.findOne({ _id: id, ownerId: req.user.id })
       -> if not found -> 404
       -> assertProjectIsOpen(project)
       -> project.deleteOne()
  -> res.status(200).json({ status: "success", message: "Project deleted" })
```

Success response:

```json
{
  "status": "success",
  "message": "Project deleted"
}
```

#### Failure scenarios

1. Invalid `:id`
   - Response: `400` (`Invalid project id`)

2. Not owned / not found
   - Response: `404` (`Project not found`)

3. Closed project deletion
   - Response: `400` (`Project is closed`)

4. MongoDB errors
   - Response: `500`

---

### 5) Close a project manually (only when open)

Endpoint: `PATCH /api/projects/:id/close`

#### Success scenario

Data flow:

```text
protect + restrictTo
  -> closeProjectManually controller
       -> assertValidProjectId(:id)
       -> Project.findOne({ _id: id, ownerId: req.user.id })
       -> if not found -> 404
       -> assertProjectIsOpen(project)
       -> project.status = "closed"
       -> project.save()
  -> res.status(200).json({ status: "success", data: { project } })
```

#### Failure scenarios

1. Invalid `:id` -> `400`
2. Not owned / not found -> `404`
3. Already closed -> `400` (`Project is closed`)
4. MongoDB error -> `500`

---

## Current limitations (important for the next phase)

This slice intentionally does not implement:

- Investment creation
- Wallet balance debits/credits
- Automatic closing when `currentAmount` reaches `capital`
- Investment percentages calculation dynamics

Because investments aren’t present yet, `currentAmount` is always `0` at project creation time and no code updates it in this slice.

---

## Files involved

- Model: `[src/models/Project.model.ts](src/models/Project.model.ts)`
- Schemas:
  - `[src/schemas/project.schema.ts](src/schemas/project.schema.ts)`
- Controller:
  - `[src/controller/Project.Controller.ts](src/controller/Project.Controller.ts)`
- Routes:
  - `[src/routes/project.routes.ts](src/routes/project.routes.ts)`
- App mount:
  - `[src/app.ts](src/app.ts)`

