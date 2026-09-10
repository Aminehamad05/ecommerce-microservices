import { createHash } from "node:crypto";
import type { Response } from "express";
import { createClient, type RedisClientType } from "redis";

/**
 * Catalog cache (Redis). Fail-open by design: every helper swallows
 * connection/serialization errors and falls back to null so the service
 * keeps serving from Postgres when Redis is down or unconfigured.
 */

const PRODUCT_TTL = 300; // single product / category: 5 min
const LIST_TTL = 60; // listings go stale faster conceptually: 1 min

let client: RedisClientType | null = null;

export async function connectCache(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("REDIS_URL is not set — catalog cache is disabled");
    return;
  }
  try {
    client = createClient({
      url,
      // Fail fast when disconnected: without this, commands queue silently
      // while offline and every catalog read would hang instead of
      // falling back to the database.
      disableOfflineQueue: true,
      socket: { connectTimeout: 3000 },
    });
    client.on("error", (err: Error) => {
      console.warn(`Redis error, falling back to database: ${err.message}`);
    });
    await client.connect();
    console.log("Connected to Redis");
  } catch (err) {
    client = null;
    console.warn(`Could not connect to Redis, falling back to database: ${(err as Error).message}`);
  }
}

export async function disconnectCache(): Promise<void> {
  try {
    await client?.quit();
  } catch {
    // shutting down anyway
  }
  client = null;
}

function getClient(): RedisClientType | null {
  return client !== null && client.isOpen ? client : null;
}

/** Stamp HIT/MISS, but stay silent when the cache itself is unavailable. */
export function markCache(res: Response, hit: boolean): void {
  if (getClient()) {
    res.setHeader("X-Cache", hit ? "HIT" : "MISS");
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const c = getClient();
  if (!c) return null;
  try {
    const raw = await c.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // fail-open
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const c = getClient();
  if (!c || keys.length === 0) return;
  try {
    await c.del(keys);
  } catch {
    // fail-open
  }
}

/** SCAN-based pattern delete (never KEYS — safe to use in production). */
export async function cacheDelPattern(pattern: string): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    let cursor = "0";
    do {
      const reply = await c.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor.toString();
      if (reply.keys.length > 0) {
        await c.del(reply.keys.map((key) => key.toString()));
      }
    } while (cursor !== "0");
  } catch {
    // fail-open
  }
}

/**
 * Listings embed data that changes on any catalog write, so they share a
 * version suffix: writers bump it, readers embed the current value in the key.
 * Old versions simply expire via TTL — no SCAN needed.
 */
const PRODUCTS_LIST_VERSION_KEY = "products:list:version";

export async function getListVersion(): Promise<string> {
  const c = getClient();
  if (!c) return "1";
  try {
    const version = await c.get(PRODUCTS_LIST_VERSION_KEY);
    return version ?? "1";
  } catch {
    return "1";
  }
}

export async function bumpListVersion(): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.incr(PRODUCTS_LIST_VERSION_KEY);
  } catch {
    // fail-open
  }
}

/** Stable key for a listing query regardless of parameter order. */
export function listKey(query: Record<string, unknown>, version: string): string {
  const normalized = JSON.stringify(query, Object.keys(query).sort());
  const hash = createHash("sha1").update(normalized).digest("hex");
  return `products:list:v${version}:${hash}`;
}

export const PRODUCT_KEY = (id: string): string => `product:${id}`;
export const CATEGORY_KEY = (id: string): string => `category:${id}`;
export const CATEGORIES_LIST_KEY = "categories:list";

export { LIST_TTL, PRODUCT_TTL };
