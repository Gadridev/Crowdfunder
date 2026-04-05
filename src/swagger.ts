import swaggerJSDoc from "swagger-jsdoc";

/**
 * Swagger + swagger-jsdoc setup (same idea as
 * https://dev.to/qbentil/swagger-express-documenting-your-nodejs-rest-api-4lj7 ).
 * Add more endpoints by copying the @swagger blocks from auth.routes.ts into other route files.
 */
const port = process.env.PORT || 5000;

export const swaggerDocs = swaggerJSDoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Crowdfunder API",
      version: "1.0.0",
      description:
        "Interactive API docs. Two sample paths are in `src/routes/auth.routes.ts` — copy that `@swagger` pattern for other routes. " +
        "Beginner → advanced tutorial: `docs/SWAGGER_COMPLETE_GUIDE.md`.",
    },
    servers: [{ url: `http://localhost:${port}` }],
    tags: [
      { name: "Auth", description: "Register, login, current user" },
      { name: "Projects", description: "Project CRUD, owner views, invest (mounted at /api/projects)" },
      { name: "Admin", description: "Read-only admin (JWT role admin)" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  // Same role as `apis: ['./routes/*.js']` in the guide; paths are full paths (e.g. /api/auth/register).
  apis: ["./src/routes/*.ts"],
});
