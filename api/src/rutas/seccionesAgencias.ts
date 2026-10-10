import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import {
  eliminarAgencia, eliminarSeccion, exigir, guardarAgencia, guardarSeccion, listarAgencias, listarSecciones,
} from '../datos/seccionesAgencias.js';

const entero = (v: string) => (/^\d+$/.test(v) ? Number(v) : null);

/** Administración → Secciones (ADMINISTRAR_SECCIONES) y Agencias (ADMINISTRAR_AGENCIAS). */
export async function rutasSeccionesAgencias(app: FastifyInstance) {
  const edicion = async (_req: FastifyRequest, rep: FastifyReply) => {
    if (!config.edicion) {
      return rep.code(403).send({ error: 'La edición está deshabilitada en esta instalación (sólo lectura).' });
    }
  };

  for (const que of ['secciones', 'agencias'] as const) {
    const permiso = async (req: FastifyRequest) => { exigir(req.sesion, que); };
    const escribe = { preHandler: [permiso, edicion] };
    const guardar = que === 'secciones' ? guardarSeccion : guardarAgencia;
    const borrar = que === 'secciones' ? eliminarSeccion : eliminarAgencia;
    const base = `/admin/${que}`;

    app.get(base, { preHandler: permiso }, async () => (que === 'secciones' ? listarSecciones() : listarAgencias()));

    app.post<{ Body: Record<string, unknown> | null }>(base, escribe, async (req) => {
      const r = await guardar(null, req.body ?? {});
      req.log.info({ por: req.sesion.usuario.username, ...r }, `alta en ${que}`);
      return r;
    });

    app.put<{ Params: { id: string }; Body: Record<string, unknown> | null }>(`${base}/:id`, escribe, async (req, rep) => {
      const id = entero(req.params.id);
      if (!id) return rep.code(400).send({ error: 'id inválido' });
      const r = await guardar(id, req.body ?? {});
      req.log.info({ por: req.sesion.usuario.username, ...r }, `modificación en ${que}`);
      return r;
    });

    app.delete<{ Params: { id: string } }>(`${base}/:id`, escribe, async (req, rep) => {
      const id = entero(req.params.id);
      if (!id) return rep.code(400).send({ error: 'id inválido' });
      const r = await borrar(id);
      req.log.info({ por: req.sesion.usuario.username, id, ...r }, `baja en ${que}`);
      return r;
    });
  }
}
