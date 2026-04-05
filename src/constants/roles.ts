export const USER_ROLES = ["project_owner", "investor", "admin"] as const;
        export type UserRole = (typeof USER_ROLES)[number];

export const REGISTER_ROLES = ["project_owner", "investor"] as const;
export type RegisterRole = (typeof REGISTER_ROLES)[number];