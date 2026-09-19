import { consultar, consultarUno } from '../db.js';
import { config } from '../config.js';
import { ORDEN_CABLES, type Cable, type OrdenCables, type Pagina } from '../dominio/tipos.js';

export interface FiltroCables {
  agencias?: number[];
  prioridad?: string;
  desde?: string;
  hasta?: string;
  tema?: string;
  texto?: string;
  numero?: number;
  orden?: OrdenCables;
  ascendente?: boolean;
  offset?: number;
  limite?: number;
  /** Si viene, marca cada cable como leído/reservado por este usuario. */
  username?: string;
}

interface FilaCable {
  id: number; numero: number; prioridad: string | null;
  fecha_recepcion: string; hora_recepcion: string;
  tema: string | null; titulo: string; cuerpo: string | null;
  id_agencia: number; agencia_nombre: string | null; agencia_codigo: string | null;
  medida_cm: number | null; medida_lineas: number | null;
  leido?: boolean; reservado_por?: string | null;
}

const aCable = (f: FilaCable): Cable & { leido?: boolean; reservado_por?: string | null } => ({
  id: f.id, numero: f.numero, prioridad: f.prioridad,
  fecha_recepcion: f.fecha_recepcion, hora_recepcion: f.hora_recepcion,
  tema: f.tema, titulo: f.titulo, cuerpo: f.cuerpo,
  agencia: { id: f.id_agencia, nombre: f.agencia_nombre, codigo: f.agencia_codigo },
  medida: { cm: f.medida_cm, lineas: f.medida_lineas },
  ...(f.leido !== undefined ? { leido: f.leido } : {}),
  ...(f.reservado_por !== undefined ? { reservado_por: f.reservado_por } : {}),
});

/** Buscador de cables. Equivale a BuscadorCables.buscar() + getCantidadCables(). */
export async function buscarCables(f: FiltroCables): Promise<Pagina<Cable>> {
  const cond: string[] = [];
  const par: unknown[] = [];
  const p = (v: unknown) => `$${par.push(v)}`;

  if (f.agencias?.length) cond.push(`c.id_agencia = ANY(${p(f.agencias)}::int[])`);
  if (f.prioridad) cond.push(`c.prioridad = ${p(f.prioridad)}`);
  if (f.desde)     cond.push(`c.fecha_recepcion >= ${p(f.desde)}::date`);
  if (f.hasta)     cond.push(`c.fecha_recepcion <= ${p(f.hasta)}::date`);
  if (f.tema)      cond.push(`c.tema ILIKE ${p(`%${f.tema}%`)}`);
  if (f.texto)     cond.push(`c.titulo ILIKE ${p(`%${f.texto}%`)}`);
  if (f.numero !== undefined) cond.push(`c.numero = ${p(f.numero)}`);

  const where = cond.length ? `WHERE ${cond.join('\n       AND ')}` : '';
  const limite = Math.min(f.limite ?? config.limitePagina, 200);
  const offset = f.offset ?? 0;
  const dir = f.ascendente ? 'ASC' : 'DESC';
  // La dirección se repite por columna, si no `fecha, hora DESC` sale mal.
  const orden = ORDEN_CABLES[f.orden ?? 'fecha']
    .map((col) => `${col} ${dir} NULLS LAST`)
    .join(', ');

  const base = `
      FROM cables   c
      JOIN agencias a ON a.id = c.id_agencia
     ${where}`;

  const [{ total }] = await consultar<{ total: number }>(
    `SELECT count(*)::bigint AS total ${base}`, par,
  ) as [{ total: number }];

  // El estado leído/reservado depende del usuario; se resuelve en la misma consulta.
  const pUser = f.username ? `$${par.push(f.username)}` : null;
  const extra = pUser
    ? `,
       EXISTS (SELECT 1 FROM cables_leidos cl
                JOIN usuarios u ON u.id = cl.id_usuario
               WHERE cl.id_cable = c.id AND u.username = ${pUser}) AS leido,
       (SELECT r.username FROM reservas_cables r
         WHERE r.id_cable = c.id ORDER BY r.fecha DESC LIMIT 1) AS reservado_por`
    : '';

  const filas = await consultar<FilaCable>(
    `SELECT c.id, c.numero, c.prioridad, c.fecha_recepcion, c.hora_recepcion,
            c.tema, c.titulo, c.cuerpo, c.id_agencia,
            a.nombre AS agencia_nombre, a.codigo AS agencia_codigo,
            c.medida_cm, c.medida_lineas${extra}
       ${base}
     ORDER BY ${orden}, c.id ${dir}
     LIMIT ${limite} OFFSET ${offset}`,
    par,
  );

  return { items: filas.map(aCable), total, offset, limite };
}

export async function obtenerCable(id: number): Promise<Cable | null> {
  const f = await consultarUno<FilaCable>(
    `SELECT c.id, c.numero, c.prioridad, c.fecha_recepcion, c.hora_recepcion,
            c.tema, c.titulo, c.cuerpo, c.id_agencia,
            a.nombre AS agencia_nombre, a.codigo AS agencia_codigo,
            c.medida_cm, c.medida_lineas
       FROM cables c JOIN agencias a ON a.id = c.id_agencia
      WHERE c.id = $1`,
    [id],
  );
  return f ? aCable(f) : null;
}

export const reservasDeCable = (id: number) =>
  consultar<{ username: string; fecha: string }>(
    `SELECT username, fecha FROM reservas_cables WHERE id_cable = $1 ORDER BY fecha DESC`,
    [id],
  );
