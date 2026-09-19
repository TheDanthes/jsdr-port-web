import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { config } from './config.js';
import { pool } from './db.js';
import { exigirSesion } from './sesion/guardia.js';
import { rutasSesion } from './rutas/sesion.js';
import { rutasCatalogos } from './rutas/catalogos.js';
import { rutasNoticias } from './rutas/noticias.js';
import { rutasCables } from './rutas/cables.js';
import { rutasExportar } from './rutas/exportar.js';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

// CORS sólo para el servidor de desarrollo de Vite. En producción la web se
// sirve desde este mismo origen y no hace falta.
if (process.env.NODE_ENV !== 'production') {
  const cors = await import('@fastify/cors');
  await app.register(cors.default, { origin: [...config.origenesDev] });
}

app.get('/salud', async () => {
  const { rows } = await pool.query(
    `SELECT (SELECT count(*) FROM noticias)  AS noticias,
            (SELECT count(*) FROM versiones) AS versiones,
            current_setting('server_version')  AS postgres`,
  );
  return { ok: true, fase: 1, solo_lectura: true, ...rows[0] };
});

// Login: la única ruta de /api que no exige sesión.
await app.register(rutasSesion, { prefix: '/api' });

// Todo lo demás sí. El hook corre antes de cada ruta de este ámbito.
await app.register(
  async (protegido) => {
    protegido.addHook('onRequest', exigirSesion);
    await protegido.register(rutasCatalogos);
    await protegido.register(rutasNoticias);
    await protegido.register(rutasCables);
    await protegido.register(rutasExportar);
  },
  { prefix: '/api' },
);

// ---------------------------------------------------------------------------
//  La web, servida por el mismo proceso
// ---------------------------------------------------------------------------
const aqui = dirname(fileURLToPath(import.meta.url));
const rutaWeb = resolve(aqui, config.rutaWeb);

if (existsSync(join(rutaWeb, 'index.html'))) {
  const estaticos = await import('@fastify/static');
  await app.register(estaticos.default, { root: rutaWeb, index: ['index.html'] });

  // La web maneja sus propias rutas: cualquier camino que no sea de la API
  // devuelve index.html y el ruteo sigue del lado del navegador.
  app.setNotFoundHandler((req, rep) => {
    if (req.url.startsWith('/api') || req.url === '/salud') {
      return rep.code(404).send({ error: 'no encontrado' });
    }
    return rep.sendFile('index.html');
  });

  app.log.info({ rutaWeb }, 'sirviendo la web');
} else {
  app.log.info({ rutaWeb }, 'sin build de la web: arranca sólo la API');
}

const cerrar = async () => { await app.close(); await pool.end(); process.exit(0); };
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);

await app.listen({ port: config.puerto, host: '0.0.0.0' });
