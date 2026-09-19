import Fastify from 'fastify';

import { componer } from './componer.js';
import { config } from './config.js';
import { medir } from './medir.js';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  // Una nota larga con sus códigos de control ronda los 50 KB; 2 MB sobra y
  // evita que un pegado accidental tumbe el servicio.
  bodyLimit: 2 * 1024 * 1024,
});

app.get('/salud', async () => ({
  ok: true,
  fase: 2,
  motor: config.motor,
  salida: config.salidaIndesign,
  secciones: Object.keys(config.secciones.mapa).length,
}));

/**
 * Medir: cuánto ocupa el texto en la página.
 *
 * Es lo que el redactor pide con F3 en el cliente Swing, y lo que la Fase 3 va
 * a llamar mientras escribe.
 */
app.post<{ Body: { texto?: unknown } }>('/medir', async (req, res) => {
  const texto = req.body?.texto;
  if (typeof texto !== 'string' || texto.length === 0) {
    return res.code(400).send({ error: 'Falta el texto a medir.' });
  }
  try {
    return await medir(texto);
  } catch (e) {
    const err = e as Error & { codigo?: string };
    if (err.codigo === 'MOTOR_COLGADO') {
      // 504 y no 500: el motor no falló, no terminó. Pasa de verdad — ver
      // pruebas/cuelga/ — y el que llama tiene que poder distinguirlo.
      return res.code(504).send({ error: err.message, codigo: err.codigo });
    }
    req.log.error({ err }, 'medir');
    return res.code(500).send({ error: 'No se pudo medir el texto.' });
  }
});

/**
 * Fotocomponer: dejar el material listo para InDesign.
 *
 * `guia` es el nombre del archivo que espera el diagramador —el mismo que usa
 * hoy— y `seccion` decide en qué carpeta cae.
 */
app.post<{ Body: { texto?: unknown; guia?: unknown; seccion?: unknown } }>(
  '/componer',
  async (req, res) => {
    const { texto, guia, seccion } = req.body ?? {};
    if (typeof texto !== 'string' || texto.length === 0) {
      return res.code(400).send({ error: 'Falta el texto a componer.' });
    }
    if (typeof guia !== 'string' || !/^[\w.-]{1,64}$/.test(guia)) {
      // La guía termina siendo un nombre de archivo: no puede traer barras ni
      // salirse de la carpeta de la sección.
      return res.code(400).send({ error: 'Guía inválida.' });
    }
    if (typeof seccion !== 'string' || seccion.length === 0) {
      return res.code(400).send({ error: 'Falta la sección.' });
    }
    try {
      return await componer(texto, guia, seccion);
    } catch (e) {
      const err = e as Error & { codigo?: string };
      if (err.codigo === 'MOTOR_COLGADO') {
        return res.code(504).send({ error: err.message, codigo: err.codigo });
      }
      req.log.error({ err }, 'componer');
      return res.code(500).send({ error: err.message });
    }
  },
);

app.listen({ port: config.puerto, host: '0.0.0.0' }).then(
  () => app.log.info(`composer escuchando en ${config.puerto}; motor en ${config.motor}`),
  (e) => {
    app.log.error(e);
    process.exit(1);
  },
);
