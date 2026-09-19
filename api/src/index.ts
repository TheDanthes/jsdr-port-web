import Fastify from 'fastify';
import { config } from './config.js';
import { pool } from './db.js';
import { rutasCatalogos } from './rutas/catalogos.js';
import { rutasNoticias } from './rutas/noticias.js';
import { rutasCables } from './rutas/cables.js';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

app.get('/salud', async () => {
  const { rows } = await pool.query(
    `SELECT (SELECT count(*) FROM noticias)  AS noticias,
            (SELECT count(*) FROM versiones) AS versiones,
            current_setting('server_version')  AS postgres`,
  );
  return { ok: true, fase: 1, solo_lectura: true, ...rows[0] };
});

await app.register(rutasCatalogos, { prefix: '/api' });
await app.register(rutasNoticias,  { prefix: '/api' });
await app.register(rutasCables,    { prefix: '/api' });

const cerrar = async () => { await app.close(); await pool.end(); process.exit(0); };
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);

await app.listen({ port: config.puerto, host: '0.0.0.0' });
