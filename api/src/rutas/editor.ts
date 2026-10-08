import type { FastifyInstance } from 'fastify';
import iconv from 'iconv-lite';
import { filtrarParaTXT } from '../dominio/caracteres.js';
import { consultarUno } from '../db.js';
import { config } from '../config.js';
import {
  autoguardar, cerrar, comandosPara, fotocomponer, guardar, iniciarCreacion, iniciarEdicion,
  medirAncho, medirCampo, medirNoticia, type AccionCierre, type DatosEditor,
} from '../datos/edicion.js';

const entero = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

const ACCIONES: AccionCierre[] = ['guardando', 'sin_guardar', 'descartar_creacion', 'descartar_version'];

/**
 * Editor de noticias (Fase 3).
 *
 * Las rutas que escriben exigen JSDR_EDICION=si. Medir no escribe nada y
 * funciona siempre: sirve también para medir desde la web de lectura.
 */
export async function rutasEditor(app: FastifyInstance) {
  // Las que escriben: con la edición apagada responden 403 antes de tocar nada.
  const exigirEdicion = async (_req: unknown, rep: { code: (n: number) => { send: (x: unknown) => unknown } }) => {
    if (!config.edicion) {
      return rep.code(403).send({ error: 'La edición está deshabilitada en esta instalación (sólo lectura).' });
    }
  };

  app.post('/editor/nueva', { preHandler: exigirEdicion }, async (req) => iniciarCreacion(req.sesion));

  app.post<{ Params: { id: string } }>(
    '/editor/:id/abrir', { preHandler: exigirEdicion },
    async (req, rep) => {
      const id = entero(req.params.id);
      if (!id) return rep.code(400).send({ error: 'id inválido' });
      return iniciarEdicion(id, req.sesion);
    },
  );

  app.put<{ Params: { id: string; numero: string }; Body: DatosEditor }>(
    '/editor/:id/:numero', { preHandler: exigirEdicion },
    async (req, rep) => {
      const id = entero(req.params.id), numero = entero(req.params.numero);
      if (!id || !numero) return rep.code(400).send({ error: 'id o versión inválidos' });
      return guardar(id, numero, req.body ?? {}, req.sesion);
    },
  );

  app.put<{ Params: { id: string; numero: string }; Body: DatosEditor }>(
    '/editor/:id/:numero/temporal', { preHandler: exigirEdicion },
    async (req, rep) => {
      const id = entero(req.params.id), numero = entero(req.params.numero);
      if (!id || !numero) return rep.code(400).send({ error: 'id o versión inválidos' });
      return autoguardar(id, numero, req.body ?? {}, req.sesion);
    },
  );

  app.post<{ Params: { id: string; numero: string }; Body: DatosEditor & { accion?: string } }>(
    '/editor/:id/:numero/cerrar', { preHandler: exigirEdicion },
    async (req, rep) => {
      const id = entero(req.params.id), numero = entero(req.params.numero);
      if (!id || !numero) return rep.code(400).send({ error: 'id o versión inválidos' });
      const accion = req.body?.accion as AccionCierre;
      if (!ACCIONES.includes(accion)) {
        return rep.code(400).send({ error: 'accion inválida', validas: ACCIONES });
      }
      return cerrar(id, numero, accion, req.body ?? {}, req.sesion);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/noticias/:id/fotocomponer', { preHandler: exigirEdicion },
    async (req, rep) => {
      const id = entero(req.params.id);
      if (!id) return rep.code(400).send({ error: 'id inválido' });
      return fotocomponer(id, req.sesion);
    },
  );

  app.get<{ Querystring: { seccion?: string } }>('/editor/comandos', async (req, rep) => {
    const seccion = entero(req.query.seccion ?? '');
    if (!seccion) return rep.code(400).send({ error: 'falta la sección' });
    return comandosPara(seccion, req.sesion.usuario.id);
  });

  // --- medir: no escribe nada ---------------------------------------------

  /** F3: la noticia entera (titular y cuerpo por separado, y la suma). */
  app.post<{ Body: { titular?: unknown; cuerpo?: unknown } }>('/editor/medir', async (req) =>
    medirNoticia(texto(req.body?.titular), texto(req.body?.cuerpo)));

  /** Ctrl+L: un campo en alto. */
  app.post<{ Body: { texto?: unknown } }>('/editor/medir-campo', async (req) =>
    medirCampo(texto(req.body?.texto)));

  /** Ctrl+A: un campo en ancho. */
  app.post<{ Body: { texto?: unknown } }>('/editor/medir-ancho', async (req) =>
    medirAncho(texto(req.body?.texto)));

  /**
   * Exportar a TXT lo que hay en el editor (ExportadorHelper.generarTXT).
   *
   * Mismo encabezado que el cliente Swing y la misma codificación: el Java
   * escribía con el charset por defecto de la PC, que en las de la redacción
   * es Windows-1252. El archivo se llama como la guía.
   */
  app.post<{ Body: {
    guia?: unknown; fecha?: unknown; seccion_id?: unknown; redactor?: unknown;
    titular?: unknown; cuerpo?: unknown;
  } }>('/editor/exportar-txt', async (req, rep) => {
    const b = req.body ?? {};
    const guia = texto(b.guia) || 'noticia';
    const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto(b.fecha));
    const seccion = await consultarUno<{ nombre: string | null }>(
      'SELECT nombre FROM secciones WHERE id = $1', [Number(b.seccion_id) || 0],
    );
    const titular = filtrarParaTXT(texto(b.titular));
    const cuerpo = filtrarParaTXT(texto(b.cuerpo));
    const contenido =
      'La Capital - jSDR\r\n' +
      `Noticia: ${guia}\r\n` +
      `Fecha de publicación: ${f ? `${f[3]}/${f[2]}/${f[1]}` : ''}\r\n` +
      `Sección: ${seccion?.nombre ?? ''}\r\n` +
      `Redactor: ${texto(b.redactor) || req.sesion.usuario.username}\r\n\r\n` +
      (titular ? `${titular}\r\n` : '') +
      cuerpo;
    const nombre = `${guia.replace(/[^\w.-]+/g, '_')}.txt`;
    return rep
      .header('content-type', 'text/plain; charset=windows-1252')
      .header('content-disposition', `attachment; filename="${nombre}"`)
      .send(iconv.encode(contenido, 'windows-1252'));
  });
}
