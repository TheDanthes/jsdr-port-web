import type { FastifyInstance } from 'fastify';
import * as cat from '../datos/catalogos.js';

export async function rutasCatalogos(app: FastifyInstance) {
  app.get('/secciones', async () => cat.listarSecciones());

  app.get<{ Querystring: { habilitadas?: string } }>('/agencias', async (req) =>
    cat.listarAgencias(req.query.habilitadas === 'true'));

  app.get('/permisos', async () => cat.listarPermisos());

  app.get<{ Querystring: { todos?: string } }>('/usuarios', async (req) =>
    cat.listarUsuarios(req.query.todos !== 'true'));

  app.get<{ Params: { username: string } }>(
    '/usuarios/:username/secciones',
    async (req) => cat.seccionesDeUsuario(req.params.username),
  );
}
