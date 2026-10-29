import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";

export const authRouter = Router();

authRouter.post("/register", authLimiter, AuthController.register);
authRouter.post("/login", authLimiter, AuthController.login);
authRouter.get("/me", requireAuth, AuthController.getMe);
authRouter.patch("/profile", requireAuth, AuthController.updateProfile);
authRouter.post("/admin/verify-phone", AuthController.adminVerifyPhone);
