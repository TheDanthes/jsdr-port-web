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

/**
 * Conexiones de ESCRITURA, sólo para el editor (Fase 3).
 *
 * Es un pool aparte, a propósito: el de arriba sigue declarando cada conexión
 * read-only, así que el buscador, los exports y el login no pueden escribir
 * aunque un error lo intente. Sólo existe si la edición está habilitada
 * (JSDR_EDICION=si); si no, pedirlo es un error.
 */
let poolEscritura: pg.Pool | null = null;

function escritura(): pg.Pool {
  if (!config.edicion) {
    throw Object.assign(new Error('La edición está deshabilitada en esta instalación.'), {
      statusCode: 403,
    });
  }
  poolEscritura ??= new pg.Pool({
    connectionString: config.databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  return poolEscritura;
}

/**
 * Corre `trabajo` dentro de una transacción de escritura.
 *
 * El EJB original hacía cada sentencia por separado y en autocommit: si se
 * caía a mitad de `insertVersion`, quedaba la versión sin actualizar
 * `noticias`. Acá cada operación del editor es todo o nada.
 */
export async function transaccion<T>(trabajo: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await escritura().connect();
  try {
    await c.query('BEGIN');
    const r = await trabajo(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function cerrarPools() {
  await pool.end();
  await poolEscritura?.end();
}

export async function consultar<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(sql, params);
  return r.rows as T[];
}

export async function consultarUno<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await consultar<T>(sql, params);
  return rows[0] ?? null;
}
