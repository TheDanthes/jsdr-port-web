import type { FastifyInstance } from 'fastify';
import { buscarNoticias, obtenerNoticia, versionesEliminadas } from '../datos/noticias.js';
import { ORDEN_NOTICIAS, type OrdenNoticias } from '../dominio/tipos.js';

const enteros = (v?: string) =>
  v ? v.split(',').map((x) => Number(x.trim())).filter(Number.isInteger) : undefined;

interface QueryBuscar {
  usuario?: string; secciones?: string; desde?: string; hasta?: string;
  estado?: string; niveles?: string; redactor?: string; guia?: string;
  texto?: string; orden?: string; asc?: string; offset?: string; limite?: string;
}

export async function rutasNoticias(app: FastifyInstance) {
  app.get<{ Querystring: QueryBuscar }>('/noticias', async (req, rep) => {
    const q = req.query;
    if (q.orden && !(q.orden in ORDEN_NOTICIAS)) {
      return rep.code(400).send({
        error: `orden inválido: ${q.orden}`,
        validos: Object.keys(ORDEN_NOTICIAS),
      });
    }
    return buscarNoticias({
      username: q.usuario,
      secciones: enteros(q.secciones),
      desde: q.desde, hasta: q.hasta,
      estado: q.estado,
      niveles: enteros(q.niveles),
      redactor: q.redactor, guia: q.guia, texto: q.texto,
      orden: q.orden as OrdenNoticias | undefined,
      ascendente: q.asc === 'true',
      offset: q.offset ? Number(q.offset) : undefined,
      limite: q.limite ? Number(q.limite) : undefined,
    });
  });

  app.get<{ Params: { id: string }; Querystring: { usuario?: string } }>(
    '/noticias/:id',
    async (req, rep) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return rep.code(400).send({ error: 'id inválido' });
      const n = await obtenerNoticia(id, req.query.usuario);
      return n ?? rep.code(404).send({ error: 'noticia no encontrada' });
    },
  );

  app.get<{ Params: { username: string } }>(
    '/usuarios/:username/versiones-eliminadas',
    async (req) => versionesEliminadas(req.params.username),
  );
}
