import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import {
  MENSAJES_DICCIONARIO, agregarLista, agregarPalabra, buscarPalabras, corregirPalabra, eliminarPalabra,
  type ModoBusqueda,
} from '../datos/diccionario.js';

/**
 * Administración → Diccionario. Todo exige el permiso ADMINISTRAR_DICCIONARIO,
 * como el menú del Swing (MotorReglas.puedeAdministrarDiccionario). Lo que
 * escribe exige además la edición habilitada (JSDR_EDICION).
 */
export async function rutasDiccionario(app: FastifyInstance) {
  const exigirPermiso = async (req: FastifyRequest, rep: FastifyReply) => {
    if (!req.sesion.permisos.some((p) => p.nombre === 'ADMINISTRAR_DICCIONARIO')) {
      return rep.code(403).send({ error: MENSAJES_DICCIONARIO.sinPermiso });
    }
  };
  const exigirEdicion = async (_req: FastifyRequest, rep: FastifyReply) => {
    if (!config.edicion) {
      return rep.code(403).send({ error: 'La edición está deshabilitada en esta instalación (sólo lectura).' });
    }
  };
  const escribe = { preHandler: [exigirPermiso, exigirEdicion] };

  app.get<{ Querystring: { q?: string; modo?: string; offset?: string; limite?: string } }>(
    '/diccionario', { preHandler: exigirPermiso },
    async (req) => {
      const modo: ModoBusqueda = req.query.modo === 'contiene' ? 'contiene' : 'empieza';
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const limite = Math.min(500, Math.max(1, Number(req.query.limite) || 100));
      return buscarPalabras(req.query.q ?? '', modo, offset, limite);
    },
  );

  /** `{ palabra }` agrega una (con "La palabra ya existe…"); `{ lista }` agrega varias. */
  app.post<{ Body: { palabra?: unknown; lista?: unknown } | null }>('/diccionario', escribe, async (req) =>
    (req.body?.lista !== undefined ? agregarLista(req.body.lista) : agregarPalabra(req.body?.palabra)));

  app.put<{ Params: { palabra: string }; Body: { nueva?: unknown } | null }>(
    '/diccionario/:palabra', escribe,
    async (req) => corregirPalabra(req.params.palabra, req.body?.nueva),
  );

  app.delete<{ Params: { palabra: string } }>('/diccionario/:palabra', escribe, async (req) =>
    eliminarPalabra(req.params.palabra));
}
