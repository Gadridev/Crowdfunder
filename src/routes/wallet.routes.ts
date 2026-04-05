import { Router } from "express";
import { protect, restrictTo } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { topUp } from "../controller/Wallet.Controller.js";
import { topUpBodySchema } from "../schemas/wallet.schema.js";

const router = Router();

router.post("/top-up", protect, restrictTo("investor", "project_owner"), validateBody(topUpBodySchema), topUp);

export default router;

