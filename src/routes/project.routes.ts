import { Router } from "express";
import { protect, restrictTo } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { createProject, closeProjectManually, deleteProject, listMyProjects, updateProject } from "../controller/Project.Controller.js";
import { getMyInvestments, getOwnerInvestorPortfolio, invest, listProjectInvestors } from "../controller/Investment.Controller.js";
import { projectCreateBodySchema, projectUpdateBodySchema } from "../schemas/project.schema.js";
import { investBodySchema } from "../schemas/investment.schema.js";

const router = Router();

// Project Owner CRUD
router.post(
  "/",
  protect,
  restrictTo("project_owner"),
  validateBody(projectCreateBodySchema),
  createProject,
);

router.get(
  "/mine",
  protect,
  restrictTo("project_owner"),
  listMyProjects,
);

router.patch(
  "/:id",
  protect,
  restrictTo("project_owner"),
  validateBody(projectUpdateBodySchema),
  updateProject,
);

router.delete(
  "/:id",
  protect,
  restrictTo("project_owner"),
  deleteProject,
);

router.patch(
  "/:id/close",
  protect,
  restrictTo("project_owner"),
  closeProjectManually,
);

// Owner views / investments
router.get("/:id/investors", protect, restrictTo("project_owner"), listProjectInvestors);
router.get(
  "/:projectId/investors/:investorId/portfolio",
  protect,
  restrictTo("project_owner"),
  getOwnerInvestorPortfolio,
);

// Investments
router.post(
  "/:id/invest",
  protect,
  restrictTo("investor", "project_owner"),
  validateBody(investBodySchema),
  invest,
);

export default router;

