import { PrismaClient } from "@prisma/client";

// One DB per service — this client belongs to the auth service only.
export const prisma = new PrismaClient();
