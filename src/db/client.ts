import { Pool, PoolConfig } from 'pg';

let pool: Pool | null = null;

export function getPool(config?: PoolConfig): Pool {
  if (!pool) {
    pool = new Pool(
      config ?? {
        connectionString: process.env.DATABASE_URL,
        max: 20,
      }
    );
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export default { getPool, closePool };
