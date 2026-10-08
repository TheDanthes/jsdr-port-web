// Espejo de api/src/dominio/tipos.ts. Se mantiene a mano y no se genera:
// son pocos tipos y el esquema de la base está congelado.

export interface Seccion {
  id: number;
  nombre: string | null;
  codigo: string | null;
  seccion_default?: boolean | null;
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

export interface Usuario {
  id: number;
  username: string;
  nivel: number | null;
  nombre_apellido: string | null;
  dni: string | null;
  habilitado: boolean | null;
  font_size_editor: number | null;
  font_size_bn: number | null;
  font_size_bc: number | null;
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
  leido?: boolean;
  reservado_por?: string | null;
}

export interface Reserva {
  username: string;
  fecha: string;
}

export interface Pagina<T> {
  items: T[];
  /** Si `total_exacto` es false, es el tope alcanzado: hay más que esto. */
  total: number;
  total_exacto: boolean;
  /** Si hay al menos una página más. Lo sabe la API con certeza. */
  hay_mas: boolean;
  offset: number;
  limite: number;
}

export interface Sesion {
  token?: string;
  vence: string;
  usuario: Usuario;
  secciones: Seccion[];
  permisos: Permiso[];
  permisos_por_seccion: Record<string, number[]>;
  /** Si esta instalación permite editar (JSDR_EDICION en la API). */
  edicion?: boolean;
}

// --- editor (Fase 3) ---------------------------------------------------------

export interface MedidaSimple { cm: number; lineas: number }

export interface Aviso { linea: number; mensaje: string }

/** Medición de un campo: `linea` de cada error es el número de palabra. */
export interface MedidaCampo extends MedidaSimple {
  formateado: string;
  errores: Aviso[];
}

export interface MedicionNoticia {
  titular: MedidaCampo;
  cuerpo: MedidaCampo;
  noticia: MedidaSimple;
}

export interface Comando {
  id: number;
  nombre: string;
  valor: string;
  etiqueta: string;
  de_usuario: boolean;
}

export interface EstadoEditor {
  id: number;
  numero: number;
  guia_usuario: string;
  guia_auto: string;
  guia_editable: boolean;
  seccion_id: number;
  fecha: string;
  fecha_anterior: string | null;
  confidencial: boolean;
  titular: string;
  cuerpo: string;
  medidas: { titular: MedidaSimple; cuerpo: MedidaSimple; noticia: MedidaSimple };
  estado: string;
  nivel: number;
  redactor: string;
  creando: boolean;
  nueva_version: boolean;
}

export interface AperturaEditor {
  noticia: EstadoEditor;
  secciones: Seccion[];
  comandos: Comando[];
  autosave_cambios: number;
}

export type AccionCierre = 'guardando' | 'sin_guardar' | 'descartar_creacion' | 'descartar_version';

/** Lo que se manda al guardar, autoguardar o cerrar. */
export interface DatosEditor {
  guia_usuario: string;
  seccion_id: number;
  fecha: string;
  confidencial: boolean;
  titular: string;
  cuerpo: string;
  medidas: { titular: MedidaSimple; cuerpo: MedidaSimple; noticia: MedidaSimple };
}

/** jsdr.common.Estado — los cinco del código Java. */
export const ESTADOS = [
  'EN_EDICION',
  'EN_EJECUCION',
  'AUTORIZADA',
  'FOTOCOMPUESTA',
  'EN_PRODUCCION',
] as const;

/**
 * Niveles de usuario del sistema original.
 * En la base: 91 usuarios en 10, 52 en 20, 27 en 30.
 */
export const NIVELES: Record<number, string> = {
  10: 'Redactor',
  20: 'Jefe',
  30: 'Secretario',
};

/**
 * Claves de ordenamiento que acepta la API — Constants.FIND_*_ORDEN_*.
 * Cada encabezado de columna de los buscadores usa una de éstas.
 */
export const ORDENES_NOTICIAS = ['fecha', 'seccion', 'estado', 'redactor', 'titulo', 'guia', 'nivel'] as const;
export const ORDENES_CABLES = ['fecha', 'agencia', 'prioridad', 'numero', 'titulo'] as const;
