/**
 * Reglas de negocio del editor. Port de `jsdr.services.MotorReglas`.
 *
 * Mismos chequeos, en el mismo orden y con los mismos mensajes
 * (`services/mensajes_error.properties`): el redactor tiene que encontrar el
 * mismo "no" que le daba el sistema viejo, por la misma razón.
 */
import { config } from '../config.js';

export const MENSAJES = {
  permisoRedaccion: 'No tiene permiso para Redactar Noticias',
  permisoRedaccionSeccion: 'No tiene permiso para Redactar Noticias en esta sección',
  permisoFotocomposicion: 'No tiene permiso para Fotocomponer Noticias',
  enEdicion: 'La noticia está EN_EDICION',
  nivelInferior: 'El usuario tiene un nivel inferior al de la noticia',
  usuarioNoRedactor: 'El usuario no es el redactor de la noticia',
  confidencial: 'La noticia es CONFIDENCIAL',
  fechaAnterior: 'La noticia tiene fecha anterior a hoy',
  cerrada: 'La noticia está cerrada',
  nivelDistinto: 'El usuario tiene un nivel distinto al de la noticia',
  noEnEjecucion: 'La noticia no está en estado Estado.EN_EJECUCION',
  enEjecucion: 'La noticia está en estado Estado.EN_EJECUCION',
  pasarNivelConfidencial: 'No se puede pasar la noticia a un nivel inferior al nivel de quien la colocó confidencial',
  existeVersionPosterior: 'No se puede restaurar la versión porque se ha creado una versión posterior',
  // services/mensajes_error.properties — AdministradorNoticiasBean
  igualNivel: 'Seleccione un nivel distinto al de la noticia',
  pasarNivelEliminada: 'No se puede pasar de nivel porque la noticia ya fue eliminada',
  eliminarEliminada: 'No se puede eliminar la noticia porque ya fue eliminada.',
  confidencialEliminada: 'No se puede cambiar la confidencialidad de la noticia porque fue eliminada',
  restaurarPermiso: 'No tiene permiso para restaurar la versión eliminada',
  // No existía en el Swing (ver puedeDestrabarNoticia).
  destrabarNivel: 'Sólo el redactor o un usuario de nivel superior pueden destrabar la noticia',
  // common/mensajes_error.properties — Noticia.isValid()
  guiaNula: 'La guía debe contener un valor',
  seccionNula: 'La sección debe contener un valor',
  fechaNula: 'La fecha de publicación debe contener un valor',
  fechaNoValida: 'La fecha de publicación no puede ser anterior a hoy',
} as const;

export class ReglaRota extends Error {
  readonly statusCode = 409;
  constructor(mensaje: string) { super(mensaje); }
}

/** Lo que las reglas necesitan saber del usuario. */
export interface UsuarioReglas {
  username: string;
  nivel: number;
  /** Permiso → ids de sección donde lo tiene (usuarios_permisos_secciones). */
  porSeccion: Record<string, number[]>;
}

export interface VersionReglas {
  numero: number;
  confidencial: boolean;
  nivel_redactor: number | null;
  redactor: string;
}

/** La noticia con su versión activa, más todas sus versiones no eliminadas. */
export interface NoticiaReglas {
  estado: string;
  nivel: number;
  redactor: string;
  id_seccion: number;
  fecha_publicacion: string | null;
  confidencial: boolean;
  versiones: VersionReglas[];
}

// --- fechas ------------------------------------------------------------------

/** "Hoy" en la zona del diario, como 'YYYY-MM-DD'. */
export function hoy(desplazamientoDias = 0): string {
  const ahora = new Date(Date.now() + desplazamientoDias * 86_400_000);
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
}
export const manana = () => hoy(1);

/** Las fechas son 'YYYY-MM-DD': se comparan como texto. */
const esAnteriorAHoy = (f: string) => f.slice(0, 10) < hoy();

// --- chequeos (los private check* de MotorReglas) ---------------------------

const tienePermiso = (u: UsuarioReglas, permiso: string, idSeccion: number) =>
  (u.porSeccion[permiso] ?? []).includes(idSeccion);

function checkPermisoRedaccion(n: NoticiaReglas, u: UsuarioReglas) {
  if (!tienePermiso(u, 'REDACTAR_NOTICIA', n.id_seccion)) {
    throw new ReglaRota(MENSAJES.permisoRedaccionSeccion);
  }
}

function checkPermisoFotocomposicion(n: NoticiaReglas, u: UsuarioReglas) {
  if (!tienePermiso(u, 'FOTOCOMPONER_NOTICIA', n.id_seccion)) {
    throw new ReglaRota(MENSAJES.permisoFotocomposicion);
  }
}

function checkEstadoEnEdicion(n: NoticiaReglas) {
  if (n.estado === 'EN_EDICION') throw new ReglaRota(MENSAJES.enEdicion);
}

function checkNivelIgualSuperior(n: NoticiaReglas, u: UsuarioReglas) {
  if (u.nivel < n.nivel && n.redactor !== u.username) {
    throw new ReglaRota(MENSAJES.nivelInferior);
  }
}

function checkNivelIgual(n: NoticiaReglas, u: UsuarioReglas) {
  if (u.nivel !== n.nivel) throw new ReglaRota(MENSAJES.nivelDistinto);
}

/** El nivel de quien pasó la noticia a confidencial (ver checkConfidencial). */
function nivelPasoAConfidencial(n: NoticiaReglas): number {
  let nivel = 0;
  for (const v of [...n.versiones].sort((a, b) => b.numero - a.numero)) {
    if (!v.confidencial) break;
    nivel = v.nivel_redactor ?? 0;
  }
  return nivel;
}

function checkUsuarioIgual(n: NoticiaReglas, u: UsuarioReglas) {
  if (n.redactor !== u.username) throw new ReglaRota(MENSAJES.usuarioNoRedactor);
}

function checkFechaAnterior(n: NoticiaReglas) {
  if (n.fecha_publicacion && esAnteriorAHoy(n.fecha_publicacion)) {
    throw new ReglaRota(MENSAJES.fechaAnterior);
  }
}

function checkNoticiaCerrada(n: NoticiaReglas) {
  if (n.estado === 'FOTOCOMPUESTA') {
    try {
      checkFechaAnterior(n);
    } catch {
      throw new ReglaRota(MENSAJES.cerrada);
    }
  }
}

/**
 * Una noticia confidencial la puede tocar quien la redactó, o alguien de nivel
 * superior al de quien la pasó a confidencial, o esa misma persona.
 *
 * "Quien la pasó a confidencial": se recorren las versiones de la más nueva a
 * la más vieja mientras sigan siendo confidenciales; la última de esa racha es
 * la que la volvió confidencial.
 */
function checkConfidencial(n: NoticiaReglas, u: UsuarioReglas) {
  if (!n.confidencial) return;
  let nivelPaso = 0;
  let usernamePaso: string | null = null;
  const versiones = [...n.versiones].sort((a, b) => b.numero - a.numero);
  for (const v of versiones) {
    if (!v.confidencial) break;
    nivelPaso = v.nivel_redactor ?? 0;
    usernamePaso = v.redactor;
  }
  if (n.redactor !== u.username) {
    if (u.nivel < nivelPaso) throw new ReglaRota(MENSAJES.confidencial);
    if (u.nivel === nivelPaso && u.username !== usernamePaso) {
      throw new ReglaRota(MENSAJES.confidencial);
    }
  }
}

// --- reglas públicas ---------------------------------------------------------

export function puedeCrearNoticia(u: UsuarioReglas) {
  if (!(u.porSeccion.REDACTAR_NOTICIA?.length)) throw new ReglaRota(MENSAJES.permisoRedaccion);
}

export function puedeEditarNoticia(n: NoticiaReglas, u: UsuarioReglas) {
  checkPermisoRedaccion(n, u);
  checkEstadoEnEdicion(n);
  checkNivelIgualSuperior(n, u);
  checkNoticiaCerrada(n);
  if (n.estado === 'EN_EJECUCION') checkUsuarioIgual(n, u);
  checkConfidencial(n, u);
}

export function puedeFotocomponerNoticia(n: NoticiaReglas, u: UsuarioReglas) {
  checkPermisoFotocomposicion(n, u);
  checkEstadoEnEdicion(n);
  checkNivelIgualSuperior(n, u);
  checkFechaAnterior(n);
  if (n.estado === 'EN_EJECUCION') checkUsuarioIgual(n, u);
  checkConfidencial(n, u);
}

/** MotorReglas.puedeAutorizarNoticia: la autoriza su redactor, en su nivel, estando EN_EJECUCION. */
export function puedeAutorizarNoticia(n: NoticiaReglas, u: UsuarioReglas) {
  checkNivelIgual(n, u);
  checkPermisoRedaccion(n, u);
  if (n.estado !== 'EN_EJECUCION') throw new ReglaRota(MENSAJES.noEnEjecucion);
  checkUsuarioIgual(n, u);
}

/** MotorReglas.puedePasarDeNivelNoticia (se evalúa después de autorizarla, si correspondía). */
export function puedePasarDeNivelNoticia(n: NoticiaReglas, u: UsuarioReglas, nuevoNivel: number) {
  checkEstadoEnEdicion(n);
  checkNivelIgual(n, u);
  checkPermisoRedaccion(n, u);
  if (n.estado === 'EN_EJECUCION') throw new ReglaRota(MENSAJES.enEjecucion);
  if ((n.estado === 'AUTORIZADA' || n.estado === 'FOTOCOMPUESTA') && n.nivel === 10) {
    checkUsuarioIgual(n, u);
  }
  checkConfidencial(n, u);
  if (n.confidencial && nuevoNivel < nivelPasoAConfidencial(n)) {
    throw new ReglaRota(MENSAJES.pasarNivelConfidencial);
  }
}

/** MotorReglas.puedeEliminarNoticia: sólo su redactor, en su nivel, estando EN_EJECUCION. */
export function puedeEliminarNoticia(n: NoticiaReglas, u: UsuarioReglas) {
  checkPermisoRedaccion(n, u);
  checkEstadoEnEdicion(n);
  checkNivelIgual(n, u);
  checkUsuarioIgual(n, u);
  if (n.estado !== 'EN_EJECUCION') throw new ReglaRota(MENSAJES.noEnEjecucion);
}

/** MotorReglas.puedeCambiarConfidencialidadNoticia. */
export function puedeCambiarConfidencialidadNoticia(n: NoticiaReglas, u: UsuarioReglas) {
  checkEstadoEnEdicion(n);
  checkNivelIgual(n, u);
  checkPermisoRedaccion(n, u);
  if (n.estado === 'EN_EJECUCION') checkUsuarioIgual(n, u);
  checkNoticiaCerrada(n);
  checkConfidencial(n, u);
}

/** MotorReglas.puedeVerNoticia: sólo la confidencialidad. */
export function puedeVerNoticia(n: NoticiaReglas, u: UsuarioReglas): boolean {
  try { checkConfidencial(n, u); return true; } catch { return false; }
}

/**
 * MotorReglas.puedeRestaurarVersion: sólo la última versión creada (si
 * después se creó otra, ya no).
 */
export function puedeRestaurarVersion(numeroVersion: number, numeroProximaVersion: number) {
  if (numeroVersion + 1 !== numeroProximaVersion) throw new ReglaRota(MENSAJES.existeVersionPosterior);
}

/**
 * Destrabar una noticia que quedó EN_EDICION sin nadie que la tenga abierta
 * (se cerró el navegador, se colgó la PC). No es una regla del Swing: allá
 * sólo el mismo redactor podía restaurar sus temporales, al volver a entrar.
 * Acordado con la redacción: además del redactor, puede un usuario de nivel
 * SUPERIOR al de quien la tenía abierta, con permiso de redacción en la
 * sección y respetando la confidencialidad.
 */
export function puedeDestrabarNoticia(n: NoticiaReglas, u: UsuarioReglas) {
  if (n.redactor === u.username) return;
  checkPermisoRedaccion(n, u);
  if (u.nivel <= n.nivel) throw new ReglaRota(MENSAJES.destrabarNivel);
  checkConfidencial(n, u);
}

/**
 * Noticia.isValid() — lo que se exige para guardar.
 *
 * Ojo con la guía: el Java da error si mide exactamente 5 (es decir, "-NNNN"
 * sin la parte del usuario) o más de 15. Se replica tal cual.
 */
export function validarParaGuardar(guia: string | null, idSeccion: number | null, fecha: string | null): string[] {
  const errores: string[] = [];
  if (guia === null || guia.trim().length === 5 || guia.trim().length > 15) {
    errores.push(MENSAJES.guiaNula);
  }
  if (idSeccion === null) errores.push(MENSAJES.seccionNula);
  if (!fecha) errores.push(MENSAJES.fechaNula);
  else if (esAnteriorAHoy(fecha)) errores.push(MENSAJES.fechaNoValida);
  return errores;
}

/** La parte de la guía que escribe el usuario: `[a-zA-Z_0-9]{1,10}`. */
export const GUIA_USUARIO = /^[a-zA-Z_0-9]{1,10}$/;

/** Los últimos 4 dígitos del id, con ceros a la izquierda. */
export function guiaAutogenerada(id: number): string {
  const s = String(id);
  return s.length >= 4 ? s.slice(-4) : s.padStart(4, '0');
}

// --- Administración → Permisos/Sección ---------------------------------------------

export const MENSAJES_PERMISOS_SECCION = {
  nivel: 'El usuario no tiene el nivel JEFE o SECRETARIO',
  permiso: 'El usuario no tiene permisos de ASIGNAR_PERMISOS',
  seccionDefault: 'El usuario no tiene asignada una sección por defecto',
  secciones: 'El usuario no tiene secciones asignadas',
} as const;

export interface AsignadorPermisos {
  nivel: number;
  permisos: string[];
  /** Sus secciones (usuarios_secciones), con cuál es la de por defecto. */
  secciones: { id: number; seccion_default: boolean | null }[];
}

/**
 * MotorReglas.puedeAsignarPermisosSeccion + AdministradorUsuariosBean
 * .iniciarAdministradorPermisosSeccion: quién puede asignar permisos y en qué
 * secciones. Un jefe (20), sólo en su sección por defecto; un secretario
 * (30), en todas las suyas. Devuelve los ids de sección, o el mensaje del
 * Swing si no puede.
 */
export function seccionesParaAsignarPermisos(u: AsignadorPermisos): { secciones: number[] } | { error: string } {
  if (u.nivel < 20) return { error: MENSAJES_PERMISOS_SECCION.nivel };
  if (!u.permisos.includes('ASIGNAR_PERMISOS')) return { error: MENSAJES_PERMISOS_SECCION.permiso };
  if (u.nivel === 20) {
    const def = u.secciones.find((s) => s.seccion_default === true);
    if (!def) return { error: MENSAJES_PERMISOS_SECCION.seccionDefault };
    return { secciones: [def.id] };
  }
  if (u.nivel === 30 && u.secciones.length === 0) return { error: MENSAJES_PERMISOS_SECCION.secciones };
  // Un nivel que no es 20 ni 30 (no existe en la base) no tiene secciones, como en el Swing.
  return { secciones: u.nivel === 30 ? u.secciones.map((s) => s.id) : [] };
}
