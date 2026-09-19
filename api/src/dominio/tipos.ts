// Tipos que reflejan el esquema real de jSDR (PostgreSQL 8.0.3).
// Los nombres de campo se mantienen en castellano, como en la base.

export interface Seccion {
  id: number;
  nombre: string | null;
  codigo: string | null;
}

export interface Agencia {
  id: number;
  nombre: string;
  codigo: string;
  habilitada: boolean | null;
  dias_vida_util: number | null;
}

export interface Permiso {
  id: number;
  nombre: string | null;
  descripcion: string | null;
  general: boolean | null;
}

/** Nunca incluye `password`: esa columna no sale de la capa de datos. */
export interface Usuario {
  id: number;
  username: string;
  nivel: number | null;
  nombre_apellido: string | null;
  dni: string | null;
  habilitado: boolean | null;
}

export interface Medida {
  cm: number | null;
  lineas: number | null;
}

export interface Version {
  id_noticia: number;
  numero: number;
  fecha_publicacion: string | null;
  seccion: Seccion;
  volanta: string | null;
  titulo: string | null;
  bajada: string | null;
  cuerpo: string | null;
  titular: string | null;
  estado: string;
  eliminada: boolean | null;
  nivel: number | null;
  nivel_redactor: number | null;
  redactor: string;
  id_redactor: number | null;
  fotocomponedor: string | null;
  fecha_eliminacion: string | null;
  confidencial: boolean | null;
  medida: Medida;
  medidas: {
    volanta: Medida;
    titulo: Medida;
    bajada: Medida;
    cuerpo: Medida;
    titular: Medida;
  };
}

export interface Noticia {
  id: number;
  guia: string | null;
  numero_version_activa: number;
  numero_proxima_version: number | null;
  version?: Version;
  versiones?: Version[];
}

export interface Cable {
  id: number;
  numero: number;
  prioridad: string | null;
  fecha_recepcion: string;
  hora_recepcion: string;
  tema: string | null;
  titulo: string;
  cuerpo: string | null;
  agencia: { id: number; nombre: string | null; codigo: string | null };
  medida: Medida;
}

export interface Pagina<T> {
  items: T[];
  /** Cantidad de resultados. Si `total_exacto` es false, es el tope alcanzado. */
  total: number;
  /** false cuando el conteo se cortó en el tope: hay más de `total`. */
  total_exacto: boolean;
  /**
   * Si hay al menos una página más. Se sabe con certeza porque la consulta
   * pide una fila de más y la descarta; no se deduce del total, que puede
   * venir acotado.
   */
  hay_mas: boolean;
  offset: number;
  limite: number;
}

/** Órdenes del buscador de noticias — Constants.FIND_NOTICIAS_ORDEN_* */
export const ORDEN_NOTICIAS = {
  seccion: 's.nombre',
  fecha: 'v.fecha_publicacion',
  estado: 'v.estado',
  redactor: 'v.redactor',
  /**
   * Por los primeros 200 caracteres, no por el título entero.
   *
   * `titulo` es `text` sin límite y en la base real hay títulos de casi 7 KB.
   * Un índice btree no puede indexar un valor mayor a 2704 bytes: el índice
   * sobre la columna completa falla al crearse, con datos reales.
   *
   * Ordenar por los primeros 200 caracteres es indistinguible de ordenar por
   * el título completo —ningún título difiere recién en el carácter 201— y
   * permite indexarlo. La expresión tiene que ser IDÉNTICA a la del índice
   * `ix_v_titulo_orden`, si no el planificador no lo usa.
   */
  titulo: 'left(v.titulo, 200)',
  guia: 'n.guia',
  nivel: 'v.nivel',
} as const;
export type OrdenNoticias = keyof typeof ORDEN_NOTICIAS;

/**
 * Órdenes del buscador de cables — Constants.FIND_CABLES_ORDEN_*
 * Son listas de columnas: la dirección se aplica a CADA una. Escrito como
 * string único, `ORDER BY fecha, hora DESC` ordenaría fecha ASC y hora DESC.
 */
export const ORDEN_CABLES = {
  agencia: ['a.nombre'],
  fecha: ['c.fecha_recepcion', 'c.hora_recepcion'],
  prioridad: ['c.prioridad'],
  numero: ['c.numero'],
  titulo: ['c.titulo'],
} as const;
export type OrdenCables = keyof typeof ORDEN_CABLES;

/** jsdr.common.Estado */
export const ESTADOS = [
  'EN_EDICION',
  'EN_EJECUCION',
  'AUTORIZADA',
  'FOTOCOMPUESTA',
  'EN_PRODUCCION',
] as const;
