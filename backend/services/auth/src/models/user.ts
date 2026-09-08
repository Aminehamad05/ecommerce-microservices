import type { User } from "@prisma/client";

/** Public shape — never expose passwordHash outside the service. */
export interface PublicUser {
  id: string;
  email: string;
  role: User["role"];
  createdAt: Date;
}

/** Prisma role enum values are uppercase; JWTs use the lowercase wire format. */
export function toRoleJwt(role: User["role"]): "customer" | "admin" {
  return role === "ADMIN" ? "admin" : "customer";
}

export function toPublicUser(user: Pick<User, "id" | "email" | "role" | "createdAt">): PublicUser {
  const { id, email, role, createdAt } = user;
  return { id, email, role, createdAt };
}
