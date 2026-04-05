import { Router } from "express";
import { protect, restrictTo } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { createProject, closeProjectManually, deleteProject, listMyProjects, updateProject } from "../controller/Project.Controller.js";
import { getOwnerInvestorPortfolio, invest, listProjectInvestors } from "../controller/Investment.Controller.js";
import { projectCreateBodySchema, projectUpdateBodySchema } from "../schemas/project.schema.js";
import { investBodySchema } from "../schemas/investment.schema.js";

const router = Router();

// Project Owner CRUD

/**
 * @swagger
 * /api/projects:
 *   post:
 *     tags: [Projects]
 *     summary: Create project (project_owner)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, capital, maxInvestmentPercentage]
 *             example:
 *               title: Solar panels for schools
 *               description: Funding clean energy installations for rural schools in our region.
 *               capital: 100000
 *               maxInvestmentPercentage: 25
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 120
 *               description:
 *                 type: string
 *                 minLength: 20
 *                 maxLength: 2000
 *               capital:
 *                 type: integer
 *                 minimum: 1
 *               maxInvestmentPercentage:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 50
 *               initialInvestmentAmount:
 *                 type: integer
 *                 minimum: 1
 *               initialInvestmentPercentage:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *     responses:
 *       201:
 *         description: Project created (optional initial owner investment in same transaction)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Validation or business rule error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a project_owner
 */
router.post(
  "/",
  protect,
  restrictTo("project_owner"),
  validateBody(projectCreateBodySchema),
  createProject,
);

/**
 * @swagger
 * /api/projects/mine:
 *   get:
 *     tags: [Projects]
 *     summary: List my projects (project_owner)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of projects owned by the current user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a project_owner
 */
router.get(
  "/mine",
  protect,
  restrictTo("project_owner"),
  listMyProjects,
);

/**
 * @swagger
 * /api/projects/{id}:
 *   patch:
 *     tags: [Projects]
 *     summary: Update project (owner, open projects only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             example:
 *               title: Updated campaign title
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 120
 *               description:
 *                 type: string
 *                 minLength: 20
 *                 maxLength: 2000
 *               capital:
 *                 type: integer
 *                 minimum: 1
 *               maxInvestmentPercentage:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 50
 *     responses:
 *       200:
 *         description: Updated project
 *       400:
 *         description: Validation or capital less than currentAmount
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not owner
 *       404:
 *         description: Project not found
 */
router.patch(
  "/:id",
  protect,
  restrictTo("project_owner"),
  validateBody(projectUpdateBodySchema),
  updateProject,
);

/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     tags: [Projects]
 *     summary: Delete project (owner, open only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project deleted
 *       400:
 *         description: Project is closed
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not owner
 *       404:
 *         description: Project not found
 */
router.delete(
  "/:id",
  protect,
  restrictTo("project_owner"),
  deleteProject,
);

/**
 * @swagger
 * /api/projects/{id}/close:
 *   patch:
 *     tags: [Projects]
 *     summary: Manually close project (owner, open only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project closed
 *       400:
 *         description: Already closed
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not owner
 *       404:
 *         description: Project not found
 */
router.patch(
  "/:id/close",
  protect,
  restrictTo("project_owner"),
  closeProjectManually,
);

/**
 * @swagger
 * /api/projects/{id}/investors:
 *   get:
 *     tags: [Projects]
 *     summary: List investors and amounts for a project (owner)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Aggregated investors for this project
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not owner
 *       404:
 *         description: Project not found
 */
router.get("/:id/investors", protect, restrictTo("project_owner"), listProjectInvestors);

/**
 * @swagger
 * /api/projects/{projectId}/investors/{investorId}/portfolio:
 *   get:
 *     tags: [Projects]
 *     summary: Investor portfolio across my projects only (owner)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: investorId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Portfolio slice for that investor on projects you own
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not owner
 *       404:
 *         description: Project not found
 */
router.get(
  "/:projectId/investors/:investorId/portfolio",
  protect,
  restrictTo("project_owner"),
  getOwnerInvestorPortfolio,
);

/**
 * @swagger
 * /api/projects/{id}/invest:
 *   post:
 *     tags: [Projects]
 *     summary: Invest in a project (investor or project_owner)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               amount: 5000
 *             properties:
 *               amount:
 *                 type: integer
 *                 minimum: 1
 *               percentage:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *     responses:
 *       200:
 *         description: Investment recorded; returns investment and updated project
 *       400:
 *         description: Validation, closed project, cap, balance, etc.
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Role not allowed
 *       404:
 *         description: Project or wallet not found
 */
router.post(
  "/:id/invest",
  protect,
  restrictTo("investor", "project_owner"),
  validateBody(investBodySchema),
  invest,
);

export default router;
