import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import {
  actualizar, blanquear, buscar, catalogos, crear, eliminar, exigirAdministrarUsuarios, type DatosUsuario,
} from '../datos/usuariosAdmin.js';

const entero = (v: string) => (/^\d+$/.test(v) ? Number(v) : null);

/**
 * Administración → Usuarios. Todo exige ADMINISTRAR_USUARIOS (con el mensaje
 * del Swing); lo que escribe exige además la edición habilitada.
 */
export async function rutasUsuariosAdmin(app: FastifyInstance) {
  const permiso = async (req: FastifyRequest) => { exigirAdministrarUsuarios(req.sesion); };
  const edicion = async (_req: FastifyRequest, rep: FastifyReply) => {
    if (!config.edicion) {
      return rep.code(403).send({ error: 'La edición está deshabilitada en esta instalación (sólo lectura).' });
    }
  };
  const escribe = { preHandler: [permiso, edicion] };

  app.get('/admin/usuarios/catalogos', { preHandler: permiso }, async () => catalogos());

  app.get<{ Querystring: { username?: string; nombre?: string; nivel?: string } }>(
    '/admin/usuarios', { preHandler: permiso },
    async (req) => buscar({ username: req.query.username, nombre: req.query.nombre, nivel: Number(req.query.nivel) || undefined }));

  app.post<{ Body: DatosUsuario | null }>('/admin/usuarios', escribe, async (req) => {
    const r = await crear(req.body ?? {});
    req.log.info({ por: req.sesion.usuario.username, creado: r.usuario.username }, 'alta de usuario');
    return r;
  });

  app.put<{ Params: { id: string }; Body: DatosUsuario | null }>('/admin/usuarios/:id', escribe, async (req, rep) => {
    const id = entero(req.params.id);
    if (!id) return rep.code(400).send({ error: 'usuario inválido' });
    const r = await actualizar(req.sesion, id, req.body ?? {});
    req.log.info({ por: req.sesion.usuario.username, usuario: r.username }, 'usuario modificado');
    return r;
  });

  app.post<{ Params: { id: string } }>('/admin/usuarios/:id/blanquear', escribe, async (req, rep) => {
    const id = entero(req.params.id);
    if (!id) return rep.code(400).send({ error: 'usuario inválido' });
    const r = await blanquear(id);
    req.log.info({ por: req.sesion.usuario.username, usuario: r.username }, 'contraseña blanqueada');
    return r;
  });

  app.delete<{ Params: { id: string } }>('/admin/usuarios/:id', escribe, async (req, rep) => {
    const id = entero(req.params.id);
    if (!id) return rep.code(400).send({ error: 'usuario inválido' });
    const r = await eliminar(req.sesion, id);
    req.log.info({ por: req.sesion.usuario.username, usuario: r.username }, 'usuario eliminado');
    return r;
  });
}
