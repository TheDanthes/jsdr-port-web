import type { FastifyInstance } from 'fastify';
import { buscarCables, obtenerCable, reservasDeCable } from '../datos/cables.js';
import { ORDEN_CABLES, type OrdenCables } from '../dominio/tipos.js';

const enteros = (v?: string) =>
  v ? v.split(',').map((x) => Number(x.trim())).filter(Number.isInteger) : undefined;

interface QueryCables {
  usuario?: string; agencias?: string; prioridad?: string;
  desde?: string; hasta?: string; tema?: string; texto?: string;
  numero?: string; orden?: string; asc?: string; offset?: string; limite?: string;
}

export async function rutasCables(app: FastifyInstance) {
  app.get<{ Querystring: QueryCables }>('/cables', async (req, rep) => {
    const q = req.query;
    if (q.orden && !(q.orden in ORDEN_CABLES)) {
      return rep.code(400).send({
        error: `orden inválido: ${q.orden}`,
        validos: Object.keys(ORDEN_CABLES),
      });
    }
    return buscarCables({
      username: q.usuario,
      agencias: enteros(q.agencias),
      prioridad: q.prioridad,
      desde: q.desde, hasta: q.hasta,
      tema: q.tema, texto: q.texto,
      numero: q.numero ? Number(q.numero) : undefined,
      orden: q.orden as OrdenCables | undefined,
      ascendente: q.asc === 'true',
      offset: q.offset ? Number(q.offset) : undefined,
      limite: q.limite ? Number(q.limite) : undefined,
    });
  });

  app.get<{ Params: { id: string } }>('/cables/:id', async (req, rep) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return rep.code(400).send({ error: 'id inválido' });
    const c = await obtenerCable(id);
    return c ?? rep.code(404).send({ error: 'cable no encontrado' });
  });

  app.get<{ Params: { id: string } }>('/cables/:id/reservas', async (req) =>
    reservasDeCable(Number(req.params.id)));
}
