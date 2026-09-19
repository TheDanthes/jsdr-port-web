import type { FastifyInstance } from 'fastify';
import { buscarCables, obtenerCable, reservasDeCable } from '../datos/cables.js';
import { ORDEN_CABLES, type OrdenCables } from '../dominio/tipos.js';

const enteros = (v?: string) =>
  v ? v.split(',').map((x) => Number(x.trim())).filter(Number.isInteger) : undefined;

export interface QueryCables {
  agencias?: string; prioridad?: string;
  desde?: string; hasta?: string; tema?: string; texto?: string;
  numero?: string; orden?: string; asc?: string; offset?: string; limite?: string;
}

/** El username sale de la sesión: define qué cables figuran como leídos. */
export function filtroCablesDesdeQuery(q: QueryCables, username: string) {
  return {
    username,
    agencias: enteros(q.agencias),
    prioridad: q.prioridad,
    desde: q.desde, hasta: q.hasta,
    tema: q.tema, texto: q.texto,
    numero: q.numero ? Number(q.numero) : undefined,
    orden: q.orden as OrdenCables | undefined,
    ascendente: q.asc === 'true',
    offset: q.offset ? Number(q.offset) : undefined,
    limite: q.limite ? Number(q.limite) : undefined,
  };
}

export const ordenCablesInvalido = (orden: string | undefined) =>
  orden !== undefined && orden !== '' && !(orden in ORDEN_CABLES);

export async function rutasCables(app: FastifyInstance) {
  app.get<{ Querystring: QueryCables }>('/cables', async (req, rep) => {
    if (ordenCablesInvalido(req.query.orden)) {
      return rep.code(400).send({
        error: `orden inválido: ${req.query.orden}`,
        validos: Object.keys(ORDEN_CABLES),
      });
    }
    return buscarCables(filtroCablesDesdeQuery(req.query, req.sesion.usuario.username));
  });

  app.get<{ Params: { id: string } }>('/cables/:id', async (req, rep) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return rep.code(400).send({ error: 'id inválido' });
    const c = await obtenerCable(id);
    return c ?? rep.code(404).send({ error: 'cable no encontrado' });
  });

  app.get<{ Params: { id: string } }>('/cables/:id/reservas', async (req, rep) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return rep.code(400).send({ error: 'id inválido' });
    return reservasDeCable(id);
  });
}
