import { consultar, consultarUno } from '../db.js';
import { config } from '../config.js';
import {
  ORDEN_NOTICIAS,
  type Noticia,
  type OrdenNoticias,
  type Pagina,
  type Version,
} from '../dominio/tipos.js';

export interface FiltroNoticias {
  /** Usuario que consulta. Determina qué confidenciales puede ver. */
  username?: string;
  secciones?: number[];
  desde?: string;
  hasta?: string;
  estado?: string;
  niveles?: number[];
  redactor?: string;
  guia?: string;
  /** Busca en el título (ILIKE). Es el campo "Noticia:" del buscador viejo. */
  texto?: string;
  orden?: OrdenNoticias;
  ascendente?: boolean;
  offset?: number;
  limite?: number;
  /** Tope de filas por pedido. La pantalla usa 200; el export, más. */
  tope?: number;
}

const COLUMNAS_VERSION = `
  v.id_noticia, v.numero, v.fecha_publicacion,
  v.id_seccion, s.nombre AS seccion_nombre, s.codigo AS seccion_codigo,
  v.volanta, v.titulo, v.bajada, v.cuerpo, v.titular,
  v.estado, v.eliminada, v.nivel, v.nivel_redactor,
  v.redactor, v.id_redactor, v.fotocomponedor,
  v.fecha_eliminacion, v.confidencial,
  v.medida_cm, v.medida_lineas,
  v.medida_volanta_cm, v.medida_volanta_lineas,
  v.medida_titulo_cm,  v.medida_titulo_lineas,
  v.medida_bajada_cm,  v.medida_bajada_lineas,
  v.medida_cuerpo_cm,  v.medida_cuerpo_lineas,
  v.medida_titular_cm, v.medida_titular_lineas`;

interface FilaVersion {
  id_noticia: number; numero: number; fecha_publicacion: string | null;
  id_seccion: number; seccion_nombre: string | null; seccion_codigo: string | null;
  volanta: string | null; titulo: string | null; bajada: string | null;
  cuerpo: string | null; titular: string | null;
  estado: string; eliminada: boolean | null; nivel: number | null;
  nivel_redactor: number | null; redactor: string; id_redactor: number | null;
  fotocomponedor: string | null; fecha_eliminacion: string | null;
  confidencial: boolean | null;
  medida_cm: number | null; medida_lineas: number | null;
  medida_volanta_cm: number | null; medida_volanta_lineas: number | null;
  medida_titulo_cm: number | null;  medida_titulo_lineas: number | null;
  medida_bajada_cm: number | null;  medida_bajada_lineas: number | null;
  medida_cuerpo_cm: number | null;  medida_cuerpo_lineas: number | null;
  medida_titular_cm: number | null; medida_titular_lineas: number | null;
  guia?: string | null;
  numero_version_activa?: number;
  numero_proxima_version?: number | null;
}

function aVersion(f: FilaVersion): Version {
  return {
    id_noticia: f.id_noticia,
    numero: f.numero,
    fecha_publicacion: f.fecha_publicacion,
    seccion: { id: f.id_seccion, nombre: f.seccion_nombre, codigo: f.seccion_codigo },
    volanta: f.volanta, titulo: f.titulo, bajada: f.bajada,
    cuerpo: f.cuerpo, titular: f.titular,
    estado: f.estado, eliminada: f.eliminada,
    nivel: f.nivel, nivel_redactor: f.nivel_redactor,
    redactor: f.redactor, id_redactor: f.id_redactor,
    fotocomponedor: f.fotocomponedor,
    fecha_eliminacion: f.fecha_eliminacion,
    confidencial: f.confidencial,
    medida: { cm: f.medida_cm, lineas: f.medida_lineas },
    medidas: {
      volanta: { cm: f.medida_volanta_cm, lineas: f.medida_volanta_lineas },
      titulo:  { cm: f.medida_titulo_cm,  lineas: f.medida_titulo_lineas },
      bajada:  { cm: f.medida_bajada_cm,  lineas: f.medida_bajada_lineas },
      cuerpo:  { cm: f.medida_cuerpo_cm,  lineas: f.medida_cuerpo_lineas },
      titular: { cm: f.medida_titular_cm, lineas: f.medida_titular_lineas },
    },
  };
}

/** Arma el WHERE compartido por buscar() y contar(), con parámetros ligados. */
function armarFiltro(f: FiltroNoticias) {
  const cond: string[] = [`v.eliminada = false`];
  const par: unknown[] = [];
  const p = (v: unknown) => `$${par.push(v)}`;

  if (f.secciones?.length) cond.push(`v.id_seccion = ANY(${p(f.secciones)}::int[])`);
  if (f.desde)   cond.push(`v.fecha_publicacion >= ${p(f.desde)}::date`);
  if (f.hasta)   cond.push(`v.fecha_publicacion <= ${p(f.hasta)}::date`);
  if (f.estado)  cond.push(`v.estado = ${p(f.estado)}`);
  if (f.niveles?.length) cond.push(`v.nivel = ANY(${p(f.niveles)}::int[])`);
  if (f.redactor) cond.push(`v.redactor = ${p(f.redactor)}`);
  if (f.guia)     cond.push(`n.guia ILIKE ${p(`%${f.guia}%`)}`);
  if (f.texto)    cond.push(`v.titulo ILIKE ${p(`%${f.texto}%`)}`);

  // Regla de MotorReglas: una noticia confidencial sólo la ve quien la redactó.
  if (f.username) {
    cond.push(`(v.confidencial IS NOT TRUE OR v.redactor = ${p(f.username)})`);
  } else {
    cond.push(`v.confidencial IS NOT TRUE`);
  }

  return { where: cond.join('\n     AND '), par };
}

/**
 * Buscador de noticias. Devuelve una fila por noticia: su versión activa.
 * Equivale a BuscadorNoticias.buscar() + getCantidadNoticias().
 */
export async function buscarNoticias(f: FiltroNoticias): Promise<Pagina<Noticia>> {
  const { where, par } = armarFiltro(f);
  const limite = Math.min(f.limite ?? config.limitePagina, f.tope ?? 200);
  const offset = f.offset ?? 0;
  const orden = ORDEN_NOTICIAS[f.orden ?? 'fecha'];
  const dir = f.ascendente ? 'ASC' : 'DESC';

  const base = `
      FROM versiones v
      JOIN noticias  n ON n.id = v.id_noticia AND v.numero = n.numero_version_activa
      JOIN secciones s ON s.id = v.id_seccion
     WHERE ${where}`;

  const [{ total }] = await consultar<{ total: number }>(
    `SELECT count(*)::bigint AS total ${base}`, par,
  ) as [{ total: number }];

  const filas = await consultar<FilaVersion>(
    `SELECT n.guia, n.numero_version_activa, n.numero_proxima_version, ${COLUMNAS_VERSION}
       ${base}
     ORDER BY ${orden} ${dir} NULLS LAST, v.id_noticia ${dir}
     LIMIT ${limite} OFFSET ${offset}`,
    par,
  );

  return {
    items: filas.map((f2) => ({
      id: f2.id_noticia,
      guia: f2.guia ?? null,
      numero_version_activa: f2.numero_version_activa!,
      numero_proxima_version: f2.numero_proxima_version ?? null,
      version: aVersion(f2),
    })),
    total,
    offset,
    limite,
  };
}

/** Una noticia con todas sus versiones. Equivale a AdministradorNoticias.getNoticia(). */
export async function obtenerNoticia(
  id: number,
  username?: string,
): Promise<Noticia | null> {
  const cab = await consultarUno<{
    id: number; guia: string | null;
    numero_version_activa: number; numero_proxima_version: number | null;
  }>(
    `SELECT id, guia, numero_version_activa, numero_proxima_version
       FROM noticias WHERE id = $1`,
    [id],
  );
  if (!cab) return null;

  const filas = await consultar<FilaVersion>(
    `SELECT ${COLUMNAS_VERSION}
       FROM versiones v
       JOIN secciones s ON s.id = v.id_seccion
      WHERE v.id_noticia = $1
        AND (v.confidencial IS NOT TRUE OR v.redactor = $2)
      ORDER BY v.numero DESC`,
    [id, username ?? null],
  );
  if (filas.length === 0) return null;   // existe pero es confidencial de otro

  const versiones = filas.map(aVersion);
  return {
    ...cab,
    versiones,
    version: versiones.find((v) => v.numero === cab.numero_version_activa) ?? versiones[0],
  };
}

/** Versiones eliminadas recuperables de un redactor. */
export const versionesEliminadas = (username: string) =>
  consultar<FilaVersion>(
    `SELECT ${COLUMNAS_VERSION}, n.guia
       FROM versiones v
       JOIN noticias  n ON n.id = v.id_noticia
       JOIN secciones s ON s.id = v.id_seccion
      WHERE v.eliminada = true AND v.redactor = $1
      ORDER BY v.fecha_publicacion DESC`,
    [username],
  ).then((fs) => fs.map(aVersion));
