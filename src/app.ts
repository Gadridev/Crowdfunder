import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";
import walletRoutes from "./routes/wallet.routes.js";
import investmentsRoutes from "./routes/investments.routes.js";
import { AppError } from "./utils/AppError.js";
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

app.use(express.json({ limit: "10kb" }));

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}


app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/investments", investmentsRoutes);
app.use(errorHandler);

export default app;
