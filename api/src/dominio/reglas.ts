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
