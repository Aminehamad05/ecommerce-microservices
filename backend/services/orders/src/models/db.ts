import { PrismaClient } from "../generated/client/index.js";

// One DB per service — this client belongs to the orders service only.
export const prisma = new PrismaClient();
