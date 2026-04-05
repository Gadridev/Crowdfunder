import { Router } from "express";
import { protect, restrictTo } from "../middleware/auth.middleware.js";
import { getMyInvestments } from "../controller/Investment.Controller.js";

const router = Router();

router.get("/me", protect, restrictTo("investor", "project_owner"), getMyInvestments);

export default router;

