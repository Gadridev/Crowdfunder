/**
 * One-off: create an admin user (no wallet). Run from project root:
 *   ADMIN_SEED_EMAIL=... ADMIN_SEED_PASSWORD=... npm run seed:admin
 * Or set those variables in `.env`.
 */
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { User } from "../models/User.model.js";

dotenv.config({ path: ".env" });

async function main(): Promise<void> {
  const mongo = process.env.MONGO_DB;
  if (!mongo) {
    console.error("Missing MONGO_DB in .env");
    process.exit(1);
  }

  const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD;
  const name = process.env.ADMIN_SEED_NAME?.trim() || "Admin";

  if (!email || !password) {
    console.error("Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD (e.g. in .env) before running seed:admin.");
    process.exit(1);
  }

  await mongoose.connect(mongo);

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role === "admin") {
      console.log("Admin already exists:", email);
    } else {
      console.error("Email already used with role:", existing.role);
      process.exit(1);
    }
    await mongoose.disconnect();
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  await User.create({
    name,
    email,
    password: hashedPassword,
    role: "admin",
  });

  console.log("Admin user created:", email);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
