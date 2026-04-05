import { Router } from "express";
import { getMe, login, register } from "../controller/Auth.Controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { loginBodySchema, registerBodySchema } from "../schemas/auth.schema.js";

const router = Router();

router.post("/register", validateBody(registerBodySchema), register);
router.post("/login", validateBody(loginBodySchema), login);
router.get("/me", protect, getMe);
export default router;
