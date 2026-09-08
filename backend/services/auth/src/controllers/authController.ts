import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { HttpError } from "@ecommerce/shared";
import { prisma } from "../models/db.js";
import { toPublicUser, toRoleJwt } from "../models/user.js";

const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
})();
const SALT_ROUNDS = 10;

interface CredentialsBody {
  email?: unknown;
  password?: unknown;
}

function parseCredentials(body: CredentialsBody): { email: string; password: string } {
  const { email, password } = body;
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new HttpError(400, "Valid email is required");
  }
  if (typeof password !== "string" || password.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters");
  }
  return { email, password };
}

function signToken(payload: { id: string; email: string; role: "customer" | "admin" }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = parseCredentials(req.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new HttpError(409, "Email already registered");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });

    const token = signToken({ id: user.id, email: user.email, role: toRoleJwt(user.role) });

    res.status(201).json({ user: toPublicUser(user), token });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = parseCredentials(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new HttpError(401, "Invalid credentials");

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new HttpError(401, "Invalid credentials");

    const token = signToken({ id: user.id, email: user.email, role: toRoleJwt(user.role) });

    res.json({ user: toPublicUser(user), token });
  } catch (err) {
    next(err);
  }
}
