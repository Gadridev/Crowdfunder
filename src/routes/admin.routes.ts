import { Router } from "express";
import {
  getInvestorPortfolioAdmin,
  getProjectOwnerPortfolioAdmin,
  listInvestors,
  listProjectOwners,
} from "../controller/Admin.Controller.js";
import { protect, restrictTo } from "../middleware/auth.middleware.js";

const router = Router();

router.use(protect, restrictTo("admin"));

/**
 * @swagger
 * /api/admin/investors:
 *   get:
 *     tags: [Admin]
 *     summary: List all investors
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
router.get("/investors", listInvestors);

/**
 * @swagger
 * /api/admin/project-owners:
 *   get:
 *     tags: [Admin]
 *     summary: List all project owners
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
router.get("/project-owners", listProjectOwners);

/**
 * @swagger
 * /api/admin/investors/{investorId}/portfolio:
 *   get:
 *     tags: [Admin]
 *     summary: Investor portfolio (funded projects, total invested)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: investorId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: User is not an investor
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       404:
 *         description: User not found
 */
router.get("/investors/:investorId/portfolio", getInvestorPortfolioAdmin);

/**
 * @swagger
 * /api/admin/project-owners/{ownerId}/portfolio:
 *   get:
 *     tags: [Admin]
 *     summary: Owner portfolio (created projects, amounts raised)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ownerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: User is not a project owner
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       404:
 *         description: User not found
 */
router.get("/project-owners/:ownerId/portfolio", getProjectOwnerPortfolioAdmin);

export default router;
