import { Pool, type QueryResult, type QueryResultRow } from "pg";

// One DB per service — this pool belongs to the auth service only.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/** Small typed wrapper so callers never fight pg's generics. */
export async function query<T extends QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}
