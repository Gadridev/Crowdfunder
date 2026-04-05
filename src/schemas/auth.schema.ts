import { z } from "zod";

export const registerBodySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["project_owner", "investor"], {
    error: () => ({ message: "Role must be project_owner or investor" }),
  }),
});

export const loginBodySchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
