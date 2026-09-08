import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { HttpError } from "@ecommerce/shared";
import { query } from "../models/db.js";
import { rowToPublicUser } from "../models/user.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is not set");
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
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: "15m" });
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = parseCredentials(req.body);

    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount && existing.rowCount > 0) {
      throw new HttpError(409, "Email already registered");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const inserted = await query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role, created_at",
      [email, passwordHash],
    );
    const row = inserted.rows[0];
    if (!row) throw new HttpError(500, "Failed to create user");

    const token = signToken({ id: row.id, email: row.email, role: row.role });

    res.status(201).json({ user: rowToPublicUser(row), token });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = parseCredentials(req.body);

    const result = await query(
      "SELECT id, email, role, password_hash, created_at FROM users WHERE email = $1",
      [email],
    );
    const row = result.rows[0];
    if (!row) throw new HttpError(401, "Invalid credentials");

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) throw new HttpError(401, "Invalid credentials");

    const token = signToken({ id: row.id, email: row.email, role: row.role });

    res.json({ user: rowToPublicUser(row), token });
  } catch (err) {
    next(err);
  }
}
