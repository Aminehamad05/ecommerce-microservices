export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: "customer" | "admin";
  createdAt: Date;
}

/** Public shape — never expose passwordHash outside the service. */
export interface PublicUser {
  id: string;
  email: string;
  role: User["role"];
  createdAt: Date;
}

/** Row shape returned by the users table (snake_case columns). */
export interface UserRow {
  id: string;
  email: string;
  role: User["role"];
  created_at: Date;
}

export function toPublicUser(user: Pick<User, "id" | "email" | "role" | "createdAt">): PublicUser {
  const { id, email, role, createdAt } = user;
  return { id, email, role, createdAt };
}

export function rowToPublicUser(row: UserRow): PublicUser {
  return { id: row.id, email: row.email, role: row.role, createdAt: row.created_at };
}
