# Crowdfunder API — Authentication & Authorization (Deep Dive)

This document explains **how authentication works in this codebase**, **what each file and function does**, and **how data moves from the HTTP request to the response** (and back through the database). It is written for someone who wants to **read the code once and understand the whole system**.

---

## Table of contents

1. [Big picture](#1-big-picture)
2. [How a request enters and leaves the server](#2-how-a-request-enters-and-leaves-the-server)
3. [Environment variables](#3-environment-variables)
4. [Roles and business rules](#4-roles-and-business-rules)
5. [MongoDB models (data shapes)](#5-mongodb-models-data-shapes)
6. [Entry point: `server.ts`](#6-entry-point-serverts)
7. [Application shell: `app.ts`](#7-application-shell-appts)
8. [Routes: `routes/auth.routes.ts`](#8-routes-routesauthroutests)
9. [Validation schemas: `schemas/auth.schema.ts`](#9-validation-schemas-schemasauthschemats)
10. [Validation middleware: `middleware/validate.middleware.ts`](#10-validation-middleware-middlewarevalidatemiddlewarets)
11. [Auth middleware: `middleware/auth.middleware.ts`](#11-auth-middleware-middlewareauthmiddlewarets)
12. [JWT utilities: `utils/token.ts`](#12-jwt-utilities-utilstokents)
13. [Errors: `utils/AppError.ts` and `middleware/error.middleware.ts`](#13-errors-utilsapperrorts-and-middlewareerrormiddlewarets)
14. [HTTP controllers: `controller/Auth.Controller.ts`](#14-http-controllers-controllerauthcontrollerts)
15. [Type augmentation: `types/express.d.ts`](#15-type-augmentation-typesexpressdts)
16. [End-to-end data flows](#16-end-to-end-data-flows)
17. [Security notes (what we protect and how)](#17-security-notes-what-we-protect-and-how)
18. [How to extend (next features)](#18-how-to-extend-next-features)
---

## 1. Big picture

### What “auth” means here

- **Authentication**: proving *who* the caller is (usually via **JWT** after login/register).
- **Authorization**: deciding *what* that user is allowed to do (via **`role`** and future route guards like **`restrictTo`**).

### Main technologies

| Concern | Technology |
|--------|------------|
| HTTP API | Express |
| Persistence | MongoDB via Mongoose |
| Password storage | bcrypt (hashing + compare) |
| Tokens | JSON Web Tokens (`jsonwebtoken`) |
| Input validation | Zod |
| Async route errors | `express-async-handler` |

### Folder roles (mental model)

| Area | Responsibility |
|------|----------------|
| `server.ts` | Boot: load `.env`, validate env, connect DB, listen HTTP |
| `app.ts` | Express app: middleware stack, mount routes, 404, global error handler |
| `routes/` | Map URLs + HTTP methods to middleware + controller functions |
| `controller/` | HTTP layer: read `req`, call services/models, respond with `res` |
| `middleware/` | Cross-cutting: validate body, verify JWT, map errors to JSON |
| `models/` | Mongoose schemas and collections |
| `schemas/` | Zod schemas (runtime validation + types) |
| `utils/` | Small helpers: JWT signing, `AppError` |
| `constants/` | Shared enums/tuples (roles) |
| `types/` | TypeScript augmentation for Express `Request` |

---

## 2. How a request enters and leaves the server

### Startup sequence (once)

1. Node runs `server.ts`.
2. `dotenv` loads variables from `.env` into `process.env`.
3. The code checks that **`MONGO_DB`**, **`JWT_SECRET`**, and **`JWT_EXPIRES_IN`** exist (otherwise the process exits).
4. Mongoose connects to MongoDB.
5. On success, Express **starts listening** on `PORT` (default `5000`).

### Per-request sequence (every HTTP call)

1. **HTTP** hits Express (`app`).
2. Express runs **global middleware** in order (JSON parser, CORS, Helmet, logging in dev).
3. Express matches a **route** (e.g. `POST /api/auth/login`).
4. **Route-specific middleware** runs (e.g. `validateBody`, then `protect`).
5. The **controller** runs (business logic + DB).
6. The controller sends **`res.json(...)`** (success) or **throws / `next(err)`** (failure).
7. If an error occurred, **global `errorHandler`** formats JSON and status code.

---

## 3. Environment variables

| Variable | Purpose |
|----------|---------|
| `MONGO_DB` | MongoDB connection URI (required). |
| `JWT_SECRET` | Symmetric secret used to **sign** and **verify** JWTs. Must stay private. |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d`, `24h` (passed to `jsonwebtoken` `expiresIn`). |
| `PORT` | Optional HTTP port (defaults to `5000`). |
| `NODE_ENV` | When set to `development`, enables Morgan request logging and more detailed 500 error messages. |

---

## 4. Roles and business rules

Defined in `constants/roles.ts`.

### `USER_ROLES`

- `project_owner` — creates/manages projects (future routes).
- `investor` — invests in projects, uses wallet (future routes).
- `admin` — global read/admin actions (future routes).

**Important:** `admin` is **not** exposed on public registration. Admins are expected to be created **manually** (database seed, admin tooling) so random users cannot self-promote.

### `REGISTER_ROLES` / `RegisterRole`

- Only `project_owner` and `investor` may register through the API.
- This matches the use case diagram: **Project Owner** and **Investor** use **Register / Login**.

---

## 5. MongoDB models (data shapes)

### `models/User.model.ts` — `User`

**Purpose:** One document per user account.

| Field | Notes |
|-------|--------|
| `name` | Display name. |
| `email` | Unique, lowercased, basic email regex. |
| `password` | **Hashed** string. `select: false` so normal queries **never return** `password` unless you explicitly `select("+password")`. |
| `role` | One of `USER_ROLES`. |
| `createdAt` / `updatedAt` | Added by `timestamps: true`. |

**Why `select: false` on password?**  
So that `User.findById`, `User.find`, etc. do not accidentally leak passwords in API responses. Login explicitly opts in to read the hash.

### `models/Wallet.model.ts` — `Wallet`

**Purpose:** One wallet per investor (balance for investing / top-ups).

| Field | Notes |
|-------|--------|
| `userId` | Reference to `User`, **unique** (one wallet per user). |
| `balance` | Number, default `0`. |

**Registration rule:** On `register`, if `role === "investor"`, a `Wallet` with `balance: 0` is created. Project owners do not get a wallet automatically in the current flow (you can change this later if needed).

---

## 6. Entry point: `server.ts`

### What it does

1. Loads **`dotenv`** from `./.env`.
2. **Validates required environment variables** (`MONGO_DB`, `JWT_SECRET`, `JWT_EXPIRES_IN`). If any is missing, logs and **`process.exit(1)`** so the server never runs with broken auth config.
3. Connects Mongoose to **`process.env.MONGO_DB`**.
4. On success, calls **`app.listen(port)`** so the Express app from `app.ts` accepts HTTP traffic.
5. On DB failure, logs and exits.

### Why this order matters

- JWT and DB must be configured **before** the app serves requests that issue or verify tokens.
- Failing fast on missing env avoids subtle bugs (e.g. “tokens work in dev but secret was undefined in prod”).

---

## 7. Application shell: `app.ts`

### What it creates

A single Express `app` with:

1. **`express.json({ limit: "10kb" })`**  
   Parses JSON bodies into `req.body`. The limit reduces abuse via huge payloads.

2. **`cors()`**  
   Allows browsers from other origins to call the API (adjust in production if you need a strict allowlist).

3. **`helmet()`**  
   Sets security-related HTTP headers (good practice for APIs).

4. **`morgan("dev")`** (only if `NODE_ENV === "development"`)  
   Logs each request in a readable format for debugging.

5. **`GET /health`**  
   Simple liveness check. Useful for load balancers and manual “is the server up?” checks.

6. **`app.use("/api/auth", authRoutes)`**  
   Mounts all auth routes under the `/api/auth` prefix.

7. **`app.all("*", ...)`** — catch-all 404  
   Any unmatched path becomes an **`AppError`** with status **404** and passes to the error handler.

8. **`app.use(errorHandler)`** — global error handler  
   Must be **after** routes. It catches errors passed to `next(err)` and thrown errors from async handlers (via `express-async-handler`).

### Middleware order (critical)

Order is **top to bottom**. The global error handler is **last** so it can handle errors from routes and the 404 handler.

---

## 8. Routes: `routes/auth.routes.ts`

### What a router does

A `Router` groups related endpoints. This file **does not** contain business logic; it only **wires** URL + method → middleware chain → controller.

### Endpoints

| Method | Path | Middleware chain | Controller |
|--------|------|------------------|------------|
| `POST` | `/register` | `validateBody(registerBodySchema)` → `register` | `register` |
| `POST` | `/login` | `validateBody(loginBodySchema)` → `login` | `login` |
| `GET` | `/me` | `protect` → `getMe` | `getMe` |

Full paths (with `app.ts` mount): `/api/auth/register`, `/api/auth/login`, `/api/auth/me`.

### Why `validateBody` only on register/login

- `POST` bodies need schema validation.
- `GET /me` has **no body**; the user is identified by the **Authorization** header, handled in `protect`.

---

## 9. Validation schemas: `schemas/auth.schema.ts`

### Purpose

**Zod** schemas describe the **shape and rules** of JSON bodies. They run at runtime **before** controllers execute, so invalid input never reaches `User.create` or `bcrypt`.

### `registerBodySchema`

| Field | Rules |
|-------|--------|
| `name` | Trimmed string, min length 2. |
| `email` | Trimmed, lowercased, valid email format. |
| `password` | Min length 6 (matches schema `minlength` on password in Mongoose; you can tighten both together later). |
| `role` | Must be exactly `"project_owner"` or `"investor"`. |

### `loginBodySchema`

| Field | Rules |
|-------|--------|
| `email` | Same email normalization as register. |
| `password` | Non-empty string (presence check). |

### Why Zod here

- **Single source of truth** for “what is valid input.”
- Clear error messages aggregated in `validateBody` when validation fails.

---

## 10. Validation middleware: `middleware/validate.middleware.ts`

### `validateBody(schema)`

**Purpose:** Factory that returns an Express middleware function.

**Parameters:**

- `schema` — any Zod schema (`z.ZodType`).

**Behavior:**

1. Runs **`schema.safeParse(req.body)`** (does not throw; returns success or failure).
2. If **failure**: builds one string from all Zod issue messages, calls **`next(new AppError(message, 400))`**, so the global error handler returns **400 Bad Request**.
3. If **success**: replaces **`req.body`** with the **parsed/coerced** data (e.g. trimmed strings, lowercased email) and calls **`next()`**.

**Why replace `req.body`?**  
Downstream code sees **clean, normalized** data (e.g. email always lowercase).

---

## 11. Auth middleware: `middleware/auth.middleware.ts`

### `protect`

**Purpose:** **Authenticate** the request: ensure a valid JWT is present and map it to a real user.

**Steps:**

1. Read **`Authorization`** header.  
   Expected format: **`Bearer <token>`** (note the space after `Bearer `).  
   If missing or malformed → **401** via `AppError`.

2. **`jwt.verify(token, JWT_SECRET)`**  
   - On success: payload is treated as **`{ id: string }`** (user id).  
   - On failure (expired, tampered, wrong signature): **401**.

3. **`User.findById(decoded.id)`**  
   - If no user: **401** (token valid but user deleted — session should not be trusted).  
   - If user exists: attach **`req.user`**:
     - `id` — string form of `_id`
     - `role` — **current role from the database** (not only from the token; avoids stale role if you change roles in DB)

4. **`next()`** so the next handler (e.g. `getMe`) runs.

**Why load the user from DB every time?**  
Trade-off: slightly more DB work per request, but **stronger correctness** when a user is deleted or their role changes. You can later optimize (e.g. cache, shorter TTL, or refresh tokens).

### `restrictTo(...roles)`

**Purpose:** **Authorize** a route: after `protect`, only allow certain roles.

**Parameters:**

- `...roles` — one or more `UserRole` values.

**Behavior:**

1. If **`req.user`** is missing → **401** (should not happen if `protect` ran first).
2. If **`req.user.role`** is not in the allowed list → **403 Forbidden**.
3. Otherwise **`next()`**.

**Usage pattern (future):**

```text
router.post("/projects", protect, restrictTo("project_owner"), createProject);
```

### Note on ordering

Always use **`protect` before `restrictTo`** so `req.user` is defined.

---

## 12. JWT utilities: `utils/token.ts`

### `signToken(id: string)`

**Purpose:** Create a signed JWT **access token** for a user after they register or log in.

**Payload:**

- Only **`{ id }`** — the user’s MongoDB `_id` as a string.  
  Role is **not** embedded in the token in this implementation; `protect` reads the role from DB.

**Signing:**

- `jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })`

**Why `SignOptions` typing?**  
TypeScript’s `@types/jsonwebtoken` types `expiresIn` strictly (`ms.StringValue | number`), so `process.env` strings are asserted to match.

---

## 13. Errors: `utils/AppError.ts` and `middleware/error.middleware.ts`

### `AppError` class

**Purpose:** Represent **operational** errors (expected failures: bad input, wrong password, wrong role).

**Fields:**

- `message` — human-readable message sent to the client.
- `statusCode` — HTTP status (400, 401, 403, 404, etc.).
- `isOperational` — flag for future use (e.g. distinguish from unexpected bugs).

**`Error.captureStackTrace`**  
Improves stack traces in Node for this class.

### `errorHandler` middleware

**Purpose:** Single place to convert any thrown/passed error into a **JSON response**.

**Branches:**

1. **`err instanceof AppError`**  
   Response: `{ status: "fail", message }` with **`err.statusCode`**.

2. **Mongo duplicate key (`code === 11000`)**  
   Often a **race** on unique `email` if two requests register the same email at once. Returns **400** with a generic duplicate message.

3. **Everything else**  
   Logged to server console. Client gets **500** with:
   - In **development**: `err.message` if it’s an `Error`.
   - Otherwise: generic `"Something went wrong"` (avoid leaking internals in production).

---

## 14. HTTP controllers: `controller/Auth.Controller.ts`

Controllers are **thin** HTTP adapters: they use `req`/`res`, call Mongoose/bcrypt/JWT, and **throw `AppError`** or send JSON.

### `asyncHandler` wrapper

Every exported handler is wrapped with **`asyncHandler`**. That means:

- Async errors are **passed to `next(err)`** automatically.
- You can **`throw new AppError(...)`** instead of manually calling `next`.

### `toPublicUser(user)` (internal helper)

**Purpose:** Never expose internal fields (`password`, `__v`, etc.) to the client.

**Returns:** `{ id, name, email, role }` with `id` as string.

### `register`

**Purpose:** Create a new user and return a JWT + public user profile.

**Data flow:**

1. Body already validated by Zod (`name`, `email`, `password`, `role`).
2. **`User.findOne({ email })`** — if exists → **400** “Email already registered.”
3. **`bcrypt.hash(password, 12)`** — 12 salt rounds (tunable for performance vs security).
4. **`User.create({ name, email, password: hashed, role })`** — persists user.
5. If **`role === "investor"`** → **`Wallet.create({ userId, balance: 0 })`**.
6. **`signToken(user._id.toString())`**.
7. **201** response: `{ status, token, data: { user } }`.

### `login`

**Purpose:** Verify credentials and issue a JWT.

**Data flow:**

1. **`User.findOne({ email }).select("+password")`** — includes password hash for comparison.
2. If no user or **`bcrypt.compare`** fails → **401** with a **generic** message (“Incorrect email or password”) so attackers cannot distinguish “unknown email” vs “wrong password” easily.
3. **`signToken(user._id.toString())`**.
4. **200** response: `{ status, token, data: { user } }`.

### `getMe`

**Purpose:** Return the **current** user profile for a logged-in client.

**Precondition:** `protect` must have run so **`req.user.id`** exists.

**Data flow:**

1. **`User.findById(req.user!.id)`** — password stays excluded (default schema behavior).
2. If user missing → **401**.
3. **200** with `{ status, data: { user } }`.

---

## 15. Type augmentation: `types/express.d.ts`

**Purpose:** Teach TypeScript that **`express.Request`** may have **`user?: { id, role }`**.

**Why `export {}`?**  
Makes the file a **module** so the `declare global` block merges correctly.

Without this file, `req.user` would be a type error in controllers and middleware.

---

## 16. End-to-end data flows

This section is the “scenario encyclopedia”. For each endpoint, you’ll see:

- **Preconditions**: what must be true before the request can succeed
- **Step-by-step path**: middleware/controller steps and where data changes
- **Success response**: shape you should expect
- **Failure scenarios**: every common way it can fail and which component returns the error

> Notes about error responses:
>
> - Operational errors thrown as `AppError` return `{ "status": "fail", "message": "..." }`.
> - Unexpected/unhandled errors return `{ "status": "error", "message": "Something went wrong" }` (or the message in development).

### A. `POST /api/auth/register` (Project Owner / Investor registration)

#### A0 — Preconditions and invariants

- Request body must match `registerBodySchema`.
- `email` must not already exist in the `users` collection (unique).
- Server must have `JWT_SECRET` and `JWT_EXPIRES_IN` configured (enforced at startup).
- MongoDB must be reachable (connection established at startup).
- `role` can only be `project_owner` or `investor` (admins are not public-registerable).

#### A1 — Success scenario (register `project_owner`)

```text
Client
  → HTTP POST JSON body
  → express.json() → req.body
  → validateBody(registerBodySchema)
        → safeParse; on fail → AppError 400 → errorHandler
        → on success → normalized req.body
  → register controller
        → User.findOne(email)
        → bcrypt.hash
        → User.create
        → Wallet.create is skipped (role is project_owner)
        → signToken
        → res.status(201).json({ token, data: { user } })
```

Example request body:

```json
{
  "name": "Alice Owner",
  "email": "alice@example.com",
  "password": "123456",
  "role": "project_owner"
}
```

Success response (shape):

```json
{
  "status": "success",
  "token": "<jwt>",
  "data": {
    "user": {
      "id": "<mongoId>",
      "name": "Alice Owner",
      "email": "alice@example.com",
      "role": "project_owner"
    }
  }
}
```

#### A2 — Success scenario (register `investor`, wallet created)

Same flow as A1, but with one additional DB write:

```text
register controller
  → User.create(...)
  → Wallet.create({ userId: user._id, balance: 0 })
  → signToken(...)
  → 201 response
```

Why create wallet here?

- It guarantees the invariant: “every investor has exactly one wallet” (enforced by `Wallet.userId` uniqueness).

#### A3 — Failure scenario: invalid body (Zod validation fails) → 400

Where it fails:

- `validateBody(registerBodySchema)` in `middleware/validate.middleware.ts`

How it fails:

1. `schema.safeParse(req.body)` returns `{ success: false, error }`.
2. Middleware aggregates issue messages and calls `next(new AppError(message, 400))`.
3. `errorHandler` formats JSON and status.

Example invalid request:

```json
{ "email": "not-an-email", "password": "1", "role": "admin" }
```

Example response:

```json
{ "status": "fail", "message": "Invalid email address, Password must be at least 6 characters, Role must be project_owner or investor" }
```

#### A4 — Failure scenario: email already registered → 400

Where it fails:

- `register` controller in `controller/Auth.Controller.ts`

How it fails:

1. `User.findOne({ email })` returns a document.
2. Controller throws `new AppError("Email already registered", 400)`.
3. `errorHandler` returns 400.

Response:

```json
{ "status": "fail", "message": "Email already registered" }
```

#### A5 — Failure scenario: duplicate email race condition → 400

What causes it:

- Two register requests for the same email arrive almost simultaneously.
- Both pass `findOne` before either writes.
- `User.create` triggers Mongo’s unique index constraint and throws a duplicate key error (`code === 11000`).

Where it fails:

- In MongoDB write layer (Mongoose throws), caught by `errorHandler`’s duplicate-key check.

Response:

```json
{ "status": "fail", "message": "Duplicate field value — this resource already exists." }
```

#### A6 — Failure scenario: bcrypt/hash failure or DB error during create → 500

Where it fails:

- Inside `register` controller (unexpected errors)

How it fails:

- Any unexpected exception (bcrypt internal error, Mongo write error not handled as duplicate key, etc.) bubbles to `errorHandler` as an unknown error → **500**.

Response (production):

```json
{ "status": "error", "message": "Something went wrong" }
```

#### A7 — Failure scenario: investor wallet creation fails after user creation → 500 (and why that matters)

Where it fails:

- `Wallet.create(...)` in `register` controller

Why it matters:

- The user document may already be created, but the wallet failed. That leaves a partial state (investor without wallet).

Current behavior:

- The request returns 500.

Recommended future improvement:

- Use a MongoDB transaction (session) so `User.create` and `Wallet.create` are atomic, or perform a compensating action (delete user if wallet creation fails). This is not implemented yet.

---

### B. `POST /api/auth/login` (Issue JWT for existing user)

#### B0 — Preconditions and invariants

- Request body must match `loginBodySchema`.
- The user must exist.
- Password must match bcrypt hash stored in DB.

#### B1 — Success scenario (correct email + password)

```text
Client
  → HTTP POST JSON body
  → express.json()
  → validateBody(loginBodySchema)
  → login controller
        → User.findOne + select("+password")
        → bcrypt.compare
        → signToken
        → res.status(200).json({ token, data: { user } })
```

Example request:

```json
{ "email": "alice@example.com", "password": "123456" }
```

Success response (shape):

```json
{
  "status": "success",
  "token": "<jwt>",
  "data": { "user": { "id": "<mongoId>", "name": "...", "email": "...", "role": "..." } }
}
```

#### B2 — Failure scenario: invalid body (Zod validation fails) → 400

Where it fails:

- `validateBody(loginBodySchema)`

Example response:

```json
{ "status": "fail", "message": "Invalid email address, Password is required" }
```

#### B3 — Failure scenario: user not found → 401

Where it fails:

- `login` controller after `User.findOne({ email }).select("+password")` returns `null`.

Response:

```json
{ "status": "fail", "message": "Incorrect email or password" }
```

#### B4 — Failure scenario: wrong password → 401

Where it fails:

- `bcrypt.compare(password, user.password)` returns `false`.

Response:

```json
{ "status": "fail", "message": "Incorrect email or password" }
```

Why same message for both B3 and B4?

- To reduce information leakage (account enumeration).

#### B5 — Failure scenario: unexpected DB error → 500

Where it fails:

- `User.findOne(...)` throws (DB error) or jwt signing fails unexpectedly.

Response:

```json
{ "status": "error", "message": "Something went wrong" }
```

---

### C. `GET /api/auth/me` (Read “current user” profile)

#### C0 — Preconditions and invariants

- Client must send `Authorization: Bearer <jwt>`.
- JWT must be valid (signed, not expired).
- The referenced user must still exist in DB.

#### C1 — Success scenario (valid token)

```text
Client
  → Header: Authorization: Bearer <jwt>
  → protect middleware
        → jwt.verify
        → User.findById
        → req.user = { id, role }
  → getMe controller
        → User.findById(req.user.id)
        → res.status(200).json({ data: { user } })
```

Success response (shape):

```json
{
  "status": "success",
  "data": { "user": { "id": "<mongoId>", "name": "...", "email": "...", "role": "..." } }
}
```

#### C2 — Failure scenario: missing `Authorization` header → 401

Where it fails:

- `protect` middleware before verify (no token extracted).

Response:

```json
{ "status": "fail", "message": "You are not logged in. Please log in to get access." }
```

#### C3 — Failure scenario: malformed `Authorization` header → 401

Example malformed headers:

- `Authorization: Token <jwt>` (wrong scheme)
- `Authorization: Bearer` (missing token)

Current behavior:

- If it doesn’t start with `Bearer `, token is not set → same as C2 (401 not logged in).

#### C4 — Failure scenario: invalid token (wrong signature / tampered / not a JWT) → 401

Where it fails:

- `jwt.verify` throws inside `protect`.

Response:

```json
{ "status": "fail", "message": "Invalid token. Please log in again." }
```

#### C5 — Failure scenario: expired token → 401

Where it fails:

- `jwt.verify` throws a `TokenExpiredError` internally; current code treats all verify failures the same.

Response (same as C4):

```json
{ "status": "fail", "message": "Invalid token. Please log in again." }
```

Possible future improvement:

- Detect `TokenExpiredError` and return a more specific message (“Token expired”). This is not implemented yet.

#### C6 — Failure scenario: user deleted after token issuance → 401

Where it fails:

- `User.findById(decoded.id)` inside `protect` returns `null`.

Response:

```json
{ "status": "fail", "message": "The user belonging to this token no longer exists." }
```

#### C7 — Failure scenario: user exists in `protect` but not in `getMe` → 401

When it can happen:

- The user was deleted between `protect` and `getMe` (rare but possible under concurrency).

Where it fails:

- `getMe` controller: `User.findById(req.user!.id)` returns null → `AppError("User no longer exists", 401)`.

Response:

```json
{ "status": "fail", "message": "User no longer exists" }
```

#### C8 — Failure scenario: unexpected DB error → 500

Where it fails:

- Any DB call inside `protect` or `getMe`.

Response:

```json
{ "status": "error", "message": "Something went wrong" }
```

---

### D. Global scenarios (apply to all endpoints)

#### D1 — Unknown route → 404

Where it fails:

- `app.all(\"*\", ...)` in `app.ts` throws an `AppError` with 404.

Response:

```json
{ "status": "fail", "message": "Can't find /some/path on this server" }
```

#### D2 — Body too large → 413 (Express JSON limit)

Where it fails:

- `express.json({ limit: \"10kb\" })` rejects payloads larger than the limit.

Current behavior:

- Express throws an error which is routed to `errorHandler` and returned as 500 (because it is not an `AppError` and not handled specially).

Recommended future improvement:

- Add a handler that detects the JSON body size error and maps it to **413 Payload Too Large** with a clean message.

---

### Flow D — Error (example trace: invalid token)

```text
protect
  → jwt.verify throws
  → next(AppError 401)
  → errorHandler
  → res.status(401).json({ status: "fail", message: "..." })
```

---

## 17. Security notes (what we protect and how)

| Topic | What we do |
|-------|------------|
| Passwords | Never store plaintext; only hashes. Never return password in normal queries (`select: false`). |
| Login errors | Generic message to reduce account enumeration (still not perfect against timing attacks). |
| JWT | Signed with `JWT_SECRET`; short enough `JWT_EXPIRES_IN` for your threat model. |
| HTTPS | Not enforced in code — **use HTTPS in production** so tokens are not sent in cleartext. |
| `admin` role | Not registerable via public API. |
| Body size | `express.json` limit 10kb. |

---

## 18. How to extend (next features)

### Add a project-owner-only route

1. Create route, e.g. `POST /api/projects`.
2. Middleware chain: **`protect`**, **`restrictTo("project_owner")`**, then controller.
3. In controller, ensure **resource ownership** (e.g. `project.ownerId === req.user.id`) when updating/deleting.

### Add an admin-only route

```text
protect → restrictTo("admin") → handler
```

### Refresh tokens / logout

- Current design: **stateless JWT**; “logout” on client = delete token; **server-side invalidation** would need a blacklist or short-lived access tokens + refresh tokens (not implemented yet).

---

## Quick reference — file map

| File | Role |
|------|------|
| `server.ts` | Boot: env, DB, HTTP listen |
| `app.ts` | Middleware stack, mount `/api/auth`, 404, errors |
| `routes/auth.routes.ts` | Route table |
| `schemas/auth.schema.ts` | Zod body shapes |
| `middleware/validate.middleware.ts` | `validateBody` |
| `middleware/auth.middleware.ts` | `protect`, `restrictTo` |
| `middleware/error.middleware.ts` | `errorHandler` |
| `controller/Auth.Controller.ts` | `register`, `login`, `getMe` |
| `utils/token.ts` | `signToken` |
| `utils/AppError.ts` | `AppError` |
| `models/User.model.ts` | User document |
| `models/Wallet.model.ts` | Wallet document |
| `constants/roles.ts` | Role definitions |
| `types/express.d.ts` | `req.user` typing |

---

*This document describes the auth system as implemented in the repository. When you add new modules (projects, investments, admin dashboards), extend the “How to extend” section and add new per-module flow sections.*
