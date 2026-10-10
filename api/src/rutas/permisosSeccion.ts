import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { actualizar, iniciar, usuariosDeSeccion } from '../datos/permisosSeccion.js';

const entero = (v: string) => (/^\d+$/.test(v) ? Number(v) : null);

/**
 * Administración → Permisos/Sección. Quién puede y en qué secciones lo
 * decide la regla del Swing (seccionesParaAsignarPermisos); sin permiso,
 * 403 con su mensaje. Guardar exige además la edición habilitada.
 */
export async function rutasPermisosSeccion(app: FastifyInstance) {
  app.get('/permisos-seccion', async (req) => iniciar(req.sesion));

  app.get<{ Params: { seccion: string } }>('/permisos-seccion/:seccion/usuarios', async (req, rep) => {
    const id = entero(req.params.seccion);
    if (!id) return rep.code(400).send({ error: 'sección inválida' });
    return usuariosDeSeccion(req.sesion, id);
  });

  app.put<{ Params: { seccion: string; usuario: string }; Body: { permisos?: unknown } | null }>(
    '/permisos-seccion/:seccion/usuarios/:usuario', async (req, rep) => {
      if (!config.edicion) {
        return rep.code(403).send({ error: 'La edición está deshabilitada en esta instalación (sólo lectura).' });
      }
      const sec = entero(req.params.seccion), usu = entero(req.params.usuario);
      if (!sec || !usu) return rep.code(400).send({ error: 'sección o usuario inválidos' });
      const r = await actualizar(req.sesion, sec, usu, req.body?.permisos);
      req.log.info({ por: req.sesion.usuario.username, seccion: sec, usuario: usu, ...r }, 'permisos de sección');
      return r;
    });
}
