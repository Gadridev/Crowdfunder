# Swagger & OpenAPI: complete beginner → confident user

This guide is for **Crowdfunder** (`swagger-ui-express` + `swagger-jsdoc`). It assumes you have never used Swagger before and walks you through concepts, daily use, testing habits, and how to grow toward an advanced level.

---

## Part 1 — Absolute basics: what are these words?

### API documentation

An **API** is a set of URLs your server exposes (for example `POST /api/auth/login`). **Documentation** explains each URL: method, body, headers, and what comes back. Without that, you guess or read source code.

### OpenAPI

**OpenAPI** (formerly “Swagger specification”) is a **standard format** (YAML or JSON) that describes a REST API in a structured way: paths, parameters, request bodies, responses, security, examples.

Tools read that description and can generate **docs**, **client code**, or **tests**.

### Swagger UI

**Swagger UI** is a **web page** that renders an OpenAPI document as interactive documentation. You can **Try it out**: it sends real HTTP requests to your server and shows the response.

In this project it lives at **`/api-docs`**.

### swagger-jsdoc

**swagger-jsdoc** is a Node library that **builds** an OpenAPI document by scanning files (here: `src/routes/*.ts`) and parsing special comments that start with **`@swagger`**. Those comments contain **YAML** nested under the path.

So: **you maintain docs next to routes**; at startup, one object (`swaggerDocs`) is produced and passed to Swagger UI.

---

## Part 2 — How Crowdfunder wires Swagger

| Piece | File | Role |
|--------|------|------|
| Global OpenAPI metadata (title, server URL, JWT scheme) | [`src/swagger.ts`](../src/swagger.ts) | `definition` + `apis` glob |
| Interactive UI | [`src/app.ts`](../src/app.ts) | `app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs))` |
| Per-endpoint docs | e.g. [`src/routes/auth.routes.ts`](../src/routes/auth.routes.ts) | `@swagger` blocks above `router.post(...)` |

Important details:

- **`apis: ["./src/routes/*.ts"]`** — only files matching this glob are scanned. If you add docs in another folder, add another glob in `swagger.ts`.
- **Path in `@swagger` must be the full URL path** Express uses, e.g. `/api/auth/register`, not `/register`. Routers are mounted with prefixes in `app.ts` (`/api/auth`, `/api/projects`, …).
- **Server URL** in the spec is `http://localhost:${PORT}` (default **5000** if `PORT` is unset). If Swagger calls the wrong host/port, fix `.env` / `PORT` or add another entry under `servers` in `swagger.ts`.

---

## Part 3 — Your first hands-on session (step by step)

### 3.1 Prerequisites

1. MongoDB running and `MONGO_DB`, `JWT_SECRET`, `JWT_EXPIRES_IN` set in `.env` (same as normal app startup).
2. From the project root: `npm run dev`.
3. Confirm the log shows the app listening (e.g. port **5000**).

### 3.2 Open Swagger UI

In the browser, open:

`http://localhost:5000/api-docs`

(Replace **5000** with your `PORT` if different.)

You should see the **Crowdfunder API** title and, under **Auth**, the documented operations (e.g. register and login).

### 3.3 Try **Register**

1. Expand **POST** `/api/auth/register`.
2. Click **Try it out**.
3. The **Request body** is editable JSON. Set realistic values, for example:

```json
{
  "name": "Test User",
  "email": "test@example.com",
  "password": "secret12",
  "role": "investor"
}
```

4. Click **Execute**.
5. Read **Server response**:
   - **Code** `201` — success; copy **`token`** from the JSON for later.
   - **Code** `400` — validation or “email already registered”; read **message**.

### 3.4 Try **Login**

Same flow for **POST** `/api/auth/login` with `email` and `password`. On success you get another **`token`**.

### 3.5 What you learned

- Swagger UI is a **real HTTP client** pointed at your running API.
- The doc only shows operations that have **`@swagger`** blocks; undocumented routes still exist but do not appear here.

---

## Part 4 — JWT and the **Authorize** button

Protected routes expect a header:

`Authorization: Bearer <your-jwt>`

In Swagger UI:

1. Call **login** or **register** and copy **`token`** (the long string only, not the word `Bearer` unless the UI asks for the full header — see below).
2. Click **Authorize** (lock icon, top right).
3. In the `bearerAuth` field, many versions of Swagger UI expect **only the token**. If requests return 401, try pasting `Bearer <token>` as a single string, or only `<token>`, depending on what your UI version sends.
4. Click **Authorize**, then **Close**.
5. Now calls to endpoints that declare `security: [ bearerAuth: [] ]` in their `@swagger` block will include the header automatically.

Until you document **`GET /api/auth/me`** (or other protected routes) with `@swagger` and `security`, they will not appear in the UI — you can still test them with curl or another client using the same token.

---

## Part 5 — Reading Swagger UI like a product spec

For each operation, learn to look for:

| UI area | Meaning |
|---------|---------|
| **Summary / description** | Human explanation (you write this in YAML). |
| **Parameters** | Query, path, header (e.g. `:id`). |
| **Request body** | JSON schema and example. |
| **Responses** | Status codes and (optional) response schemas. |
| **Try it out** | Sends a request; does not replace automated tests. |

**Codes you will see often in this API**

- **200** — OK  
- **201** — Created  
- **400** — Bad request / validation / business rule (`status: "fail"` in JSON often)  
- **401** — Not logged in or bad JWT  
- **403** — Logged in but wrong role  
- **404** — Not found  
- **500** — Server error  

---

## Part 6 — Writing and extending `@swagger` comments

### 6.1 Rules that prevent silent failures

1. **Every line of YAML inside the comment** (after `@swagger`) must start with ` * ` (space, asterisk, space) so it stays inside the block comment.
2. **Indentation is YAML** — use spaces consistently; breaking indent breaks parsing.
3. **One path per block** — e.g. `/api/auth/register:` then `post:` underneath.
4. **HTTP method** is lowercase: `get`, `post`, `patch`, `delete`.

### 6.2 Minimal template for a new POST with JSON body

Copy and adapt (path, tag, fields):

```text
/**
 * @swagger
 * /api/example/path:
 *   post:
 *     tags: [YourTag]
 *     summary: Short human title
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fieldA]
 *             properties:
 *               fieldA:
 *                 type: string
 *     responses:
 *       200:
 *         description: OK
 */
```

### 6.2b Where “Example Value” comes from (request body)

Swagger UI shows two tabs for the body: **Example Value** and **Schema**.

- **Schema** — built from `schema.type`, `required`, and `schema.properties` (field names and types).
- **Example Value** — use a full JSON sample by adding **`example:`** at the **same indentation level** as `type` and `properties`, still under `schema:`:

```yaml
 *           schema:
 *             type: object
 *             required: [email, password]
 *             example:
 *               email: user@example.com
 *               password: secret12
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
```

You can instead put `example: someValue` on **individual** properties under `properties:` if you only want hints per field. Restart the dev server after editing `@swagger` comments.

### 6.3 Protected route template

Add under `post:` (or `get:`), same indent as `summary:`:

```yaml
 *     security:
 *       - bearerAuth: []
```

### 6.4 Path parameters

For `GET /api/projects/{id}`:

```yaml
 * /api/projects/{id}:
 *   get:
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
```

Use **`{id}`** in the path string, not `:id` (OpenAPI style).

### 6.5 Register the tag (optional but nice)

In [`src/swagger.ts`](../src/swagger.ts), extend the `tags` array so the sidebar groups your new section, e.g. `{ name: "Projects", description: "..." }`.

---

## Part 7 — Reusing schemas (intermediate)

Duplicating big JSON schemas in every route is tedious. OpenAPI allows **`components.schemas`** and **`$ref`**.

You can define shared models in **either** place:

- In `swagger.ts` under `definition.components.schemas`, or  
- In a `@swagger` block that only defines `components` (swagger-jsdoc merges definitions).

Example reference in a request body:

```yaml
 *           schema:
 *             $ref: '#/components/schemas/RegisterBody'
```

Mastering this means your docs stay **DRY** (don’t repeat yourself) and match **named** concepts (User, Project, Error).

---

## Part 8 — Testing mindset: what Swagger is and is not

### What Swagger UI is great for

- **Exploration** — quick learning of endpoints while the server runs.  
- **Manual checks** — one-off verification after a change.  
- **Sharing** — send `/api-docs` to a teammate so they see the same contract.  
- **Onboarding** — matches how many backends document public APIs.

### What it does **not** do by itself

- **Regression testing** — it does not remember past runs or run in CI.  
- **Guarantee parity with code** — if you change Zod validation but forget `@swagger`, the UI lies.  
- **Load or security testing** — not a replacement for dedicated tools.

### Suggested “real world” test flow for Crowdfunder

Use Swagger UI in this **order** to mimic a real journey:

1. **Register** two users: one `project_owner`, one `investor` (or use one user with both roles if your product allows — here roles are single; use two accounts).  
2. **Login** as investor → **Authorize** → **top-up** wallet (when documented).  
3. **Login** as owner → create **project** (when documented).  
4. **Invest** as investor (when documented).  
5. Check **list** / **me** endpoints.

That sequence catches most integration mistakes (auth, role, empty wallet, closed project).

---

## Part 9 — Troubleshooting

| Symptom | Things to check |
|---------|------------------|
| `/api-docs` is empty or missing paths | `@swagger` typo; YAML indent; file not under `src/routes/*.ts`; restart server after edits. |
| **Failed to fetch** / CORS | Usually wrong **server** URL in spec vs where the app runs; mixed `https`/`http`. |
| 401 on protected routes | **Authorize** token missing/expired; route expects `Bearer`. |
| Request body “not valid JSON” | Trailing commas or comments in JSON (JSON does not allow comments). |
| Doc says X but API does Y | Update `@swagger` or Zod — treat **code** as source of truth for behavior, **docs** as something you sync. |

After changing `swagger.ts` or route comments, **restart** `npm run dev` so `swagger-jsdoc` runs again.

---

## Part 10 — Leveling up toward “mastery”

1. **Read the OpenAPI spec** — skim [OpenAPI 3.0 specification](https://swagger.io/specification/) sections on paths, components, security schemes. You do not need to memorize everything; learn to **look up** keywords.  
2. **Export JSON** — optionally add a small route `GET /api-docs.json` that returns `swaggerDocs` so you can import the API into **Postman** or **Insomnia** (same contract, different UI).  
3. **Validate the document** — use [Swagger Editor](https://editor.swagger.io/) by pasting generated YAML/JSON to catch spec errors.  
4. **Keep docs and validation aligned** — when you change [`src/schemas/*.ts`](../src/schemas/), update the matching `@swagger` schema or a shared `components.schemas` entry.  
5. **Version your API** — when you ship breaking changes, bump `info.version` in `swagger.ts` and consider documenting `/api/v2/...` paths.  
6. **Optional advanced path** — libraries can generate OpenAPI from Zod automatically; that reduces drift but adds tooling. For now, manual `@swagger` is fine while you learn.

---

## Quick reference — files to touch

| Goal | Where |
|------|--------|
| Change title, server list, JWT scheme, global tags | `src/swagger.ts` |
| Document or tweak one endpoint | `src/routes/<feature>.routes.ts` above the `router.*` line |
| Change Swagger URL | `app.ts` — first argument of `app.use(...)` (default `/api-docs`) |

---

## Summary

- **OpenAPI** = machine-readable API description.  
- **swagger-jsdoc** = builds that description from **`@swagger`** comments.  
- **Swagger UI** = browser tool to read and **execute** requests at **`/api-docs`**.  
- **Mastery** = fast navigation of the spec, consistent docs with your validation, JWT flows second nature, and knowing when to move heavy testing to other tools.

When you add each new route to the app, **add or update the `@swagger` block** in the same edit as the code when possible — that habit keeps documentation trustworthy.
