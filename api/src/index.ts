import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { config } from './config.js';
import { cerrarPools, pool } from './db.js';
import { exigirSesion } from './sesion/guardia.js';
import { rutasSesion } from './rutas/sesion.js';
import { rutasCatalogos } from './rutas/catalogos.js';
import { rutasNoticias } from './rutas/noticias.js';
import { rutasCables } from './rutas/cables.js';
import { rutasExportar } from './rutas/exportar.js';
import { diccionario } from './datos/ortografia.js';
import { rutasEditor } from './rutas/editor.js';
import { rutasDiccionario } from './rutas/diccionario.js';
import { rutasMonitor } from './rutas/monitor.js';
import { rutasPermisosSeccion } from './rutas/permisosSeccion.js';
import { rutasUsuariosAdmin } from './rutas/usuariosAdmin.js';
import { rutasSeccionesAgencias } from './rutas/seccionesAgencias.js';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

/**
 * La versión del sistema (CHANGELOG.md). Sale de package.json, que está un
 * nivel arriba tanto de src/ (desarrollo) como de dist/ (la imagen).
 */
const VERSION: string = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version ?? '?';
  } catch { return '?'; }
})();

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
  return { ok: true, version: VERSION, edicion: config.edicion, ...rows[0] };
});

/**
 * Errores con mensaje para el usuario.
 *
 * Las reglas del editor (MotorReglas), las validaciones y el composer tiran
 * errores con `statusCode` y un mensaje en castellano pensado para mostrarse
 * tal cual —"La noticia está EN_EDICION"—. Se devuelven como `{ error }`, que
 * es lo que la web ya sabe mostrar. Lo inesperado (500) se registra y no
 * expone detalles internos.
 */
app.setErrorHandler((err: Error & { statusCode?: number; errores?: unknown; motivo?: string }, req, rep) => {
  const codigo = err.statusCode ?? 500;
  if (codigo >= 500 && codigo !== 502 && codigo !== 504) {
    req.log.error({ err }, 'error interno');
    return rep.code(codigo).send({ error: 'Error interno del servidor.' });
  }
  return rep.code(codigo).send({
    error: err.message,
    ...(err.errores ? { errores: err.errores } : {}),
    // Para que la web distinga casos que se resuelven distinto con el mismo
    // código (p. ej. 409 "abierta en otra ventana" se puede retomar).
    ...(err.motivo ? { motivo: err.motivo } : {}),
  });
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
    await protegido.register(rutasEditor);
    await protegido.register(rutasDiccionario);
    await protegido.register(rutasMonitor);
    await protegido.register(rutasPermisosSeccion);
    await protegido.register(rutasUsuariosAdmin);
    await protegido.register(rutasSeccionesAgencias);
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

const cerrar = async () => { await app.close(); await cerrarPools(); process.exit(0); };
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);

await app.listen({ port: config.puerto, host: '0.0.0.0' });
app.log.info(`jSDR versión ${VERSION}`);

// El diccionario (379 mil palabras en producción) se carga de entrada, para
// que la primera revisión ortográfica del día no espere. Si falla, se reintenta
// en la primera revisión.
if (config.edicion) {
  diccionario()
    .then((d) => app.log.info(`diccionario: ${d.size} palabras`))
    .catch((e) => app.log.warn({ err: e }, 'no se pudo cargar el diccionario'));
}
