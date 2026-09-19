import type { FastifyInstance } from 'fastify';
import { buscarNoticias, obtenerNoticia, versionesEliminadas } from '../datos/noticias.js';
import { ORDEN_NOTICIAS, type OrdenNoticias } from '../dominio/tipos.js';

const enteros = (v?: string) =>
  v ? v.split(',').map((x) => Number(x.trim())).filter(Number.isInteger) : undefined;

export interface QueryBuscar {
  secciones?: string; desde?: string; hasta?: string;
  estado?: string; niveles?: string; redactor?: string; guia?: string;
  texto?: string; orden?: string; asc?: string; offset?: string; limite?: string;
}

/**
 * Traduce la query string a un filtro. El username NO sale de acá: viene de la
 * sesión. Si lo tomara de un parámetro, cualquiera podría leer las noticias
 * confidenciales de otro con sólo cambiar la URL.
 */
export function filtroDesdeQuery(q: QueryBuscar, username: string) {
  return {
    username,
    secciones: enteros(q.secciones),
    desde: q.desde, hasta: q.hasta,
    estado: q.estado,
    niveles: enteros(q.niveles),
    redactor: q.redactor, guia: q.guia, texto: q.texto,
    orden: q.orden as OrdenNoticias | undefined,
    ascendente: q.asc === 'true',
    offset: q.offset ? Number(q.offset) : undefined,
    limite: q.limite ? Number(q.limite) : undefined,
  };
}

export const ordenNoticiasInvalido = (orden: string | undefined) =>
  orden !== undefined && orden !== '' && !(orden in ORDEN_NOTICIAS);

export async function rutasNoticias(app: FastifyInstance) {
  app.get<{ Querystring: QueryBuscar }>('/noticias', async (req, rep) => {
    if (ordenNoticiasInvalido(req.query.orden)) {
      return rep.code(400).send({
        error: `orden inválido: ${req.query.orden}`,
        validos: Object.keys(ORDEN_NOTICIAS),
      });
    }
    return buscarNoticias(filtroDesdeQuery(req.query, req.sesion.usuario.username));
  });

  app.get<{ Params: { id: string } }>('/noticias/:id', async (req, rep) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return rep.code(400).send({ error: 'id inválido' });

    const n = await obtenerNoticia(id, req.sesion.usuario.username);
    // 404 y no 403: una noticia confidencial ajena no debe confirmar ni que existe.
    return n ?? rep.code(404).send({ error: 'noticia no encontrada' });
  });

  /**
   * Versiones eliminadas recuperables. Siempre las propias: en el sistema
   * original, recuperar es cosa del redactor que borró.
   */
  app.get('/mis-versiones-eliminadas', async (req) =>
    versionesEliminadas(req.sesion.usuario.username));
}
