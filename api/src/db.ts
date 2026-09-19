import pg from 'pg';
import { config } from './config.js';

// El sistema viejo guarda medidas como `real`; node-postgres las devuelve como
// string por defecto sólo para numeric/int8. real (OID 700) ya viene number.
// int8 (OID 20) lo forzamos a number: ningún conteo de esta base se acerca a
// 2^53, y así los JSON no mezclan string con number.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
// date (OID 1082) → 'YYYY-MM-DD' tal cual, sin pasar por Date y sin zona horaria.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  // La Fase 1 es de sólo lectura: la sesión se declara read-only y el motor
  // rechaza cualquier INSERT/UPDATE/DELETE que se escape por error.
  options: '-c default_transaction_read_only=on',
});

export async function consultar<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(sql, params);
  return r.rows as T[];
}

export async function consultarUno<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await consultar<T>(sql, params);
  return rows[0] ?? null;
}
