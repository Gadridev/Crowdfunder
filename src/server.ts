import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "./app.js";

dotenv.config({ path: "./.env" });

const requiredEnv = ["MONGO_DB", "JWT_SECRET", "JWT_EXPIRES_IN"] as const;
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const port = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGO_DB as string)
  .then(() => {
    console.log("DB connection successful!");
    app.listen(port, () => {
      console.log(`App running on port ${port}...`);
    });
  })
  .catch((err) => {
    console.error("DB :", err.message);
    process.exit(1);
});


