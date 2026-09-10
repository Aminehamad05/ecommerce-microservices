import { describe, expect, it } from "vitest";
import type { User } from "../generated/client/index.js";
import { toPublicUser, toRoleJwt } from "./user.js";

function makeDbUser(overrides: Partial<User> = {}): User {
  return {
    id: "fb8f22ee-7086-4548-966a-28fae2847278",
    email: "test@example.com",
    passwordHash: "hashed-password",
    role: "CUSTOMER",
    createdAt: new Date("2026-09-08T20:10:21.025Z"),
    ...overrides,
  };
}

describe("toRoleJwt", () => {
  it("maps ADMIN to admin", () => {
    expect(toRoleJwt("ADMIN")).toBe("admin");
  });

  it("maps CUSTOMER to customer", () => {
    expect(toRoleJwt("CUSTOMER")).toBe("customer");
  });
});

describe("toPublicUser", () => {
  it("exposes id, email, role and createdAt", () => {
    const user = makeDbUser();

    expect(toPublicUser(user)).toEqual({
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    });
  });

  it("never exposes the password hash", () => {
    const publicUser = toPublicUser(makeDbUser());

    expect(publicUser).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(publicUser)).not.toContain("hashed-password");
  });
});
