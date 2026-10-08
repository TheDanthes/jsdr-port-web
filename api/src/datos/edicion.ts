/**
 * Operaciones del editor de noticias (Fase 3).
 *
 * Port de `AdministradorNoticiasBean` (iniciarCreacionNoticia,
 * iniciarEdicionNoticia, guardarNoticia, autoSave, terminar*,
 * fotocomponerNoticia) con el SQL de `PostgresqlNoticiaDAO`.
 *
 * El "bloqueo" de una noticia mientras se edita es el mismo del sistema viejo:
 * el estado EN_EDICION de su versión activa, más la fila en `versiones_tmp`.
 * Así el cliente Swing y la web se respetan entre sí: si una está abierta en
 * uno, el otro recibe "La noticia está EN_EDICION".
 *
 * Diferencias deliberadas con el original, todas a favor de no perder datos:
 *  - cada operación es una transacción (el EJB hacía sentencia por sentencia);
 *  - al abrir se toma la fila de `noticias` con FOR UPDATE, para que dos
 *    personas que abren a la vez no pasen las dos el chequeo de EN_EDICION;
 *  - la versión nueva que se crea al editar una AUTORIZADA/FOTOCOMPUESTA nace
 *    con su `confidencial` y sus medidas (el `insertVersion` original las
 *    dejaba en NULL hasta el primer guardado: una nota confidencial abierta y
 *    abandonada aparecía como pública en el buscador);
 *  - guardar exige que quien guarda sea quien la tiene abierta.
 */
import type pg from 'pg';

import { consultar, transaccion } from '../db.js';
import type { SesionUsuario } from './sesion.js';
import { composer, ErrorComposer, type Aviso } from '../composer.js';
import {
  contarLineas, filtrarParaMedir, filtrarSalidaMedir, textoParaFotocomponer,
} from '../dominio/caracteres.js';
import {
  GUIA_USUARIO, ReglaRota, guiaAutogenerada, hoy, manana,
  puedeCrearNoticia, puedeEditarNoticia, puedeFotocomponerNoticia,
  validarParaGuardar, type NoticiaReglas, type UsuarioReglas,
} from '../dominio/reglas.js';

// --- tipos -----------------------------------------------------------------

export interface MedidaSimple { cm: number; lineas: number }

export interface Comando {
  id: number;
  nombre: string;
  valor: string;
  /** Como lo mostraba el combo del editor: "u- " delante si es del usuario. */
  etiqueta: string;
  de_usuario: boolean;
}

/** Todo lo que la pantalla del editor necesita de una noticia abierta. */
export interface EstadoEditor {
  id: number;
  numero: number;
  guia_usuario: string;
  guia_auto: string;
  /** La parte del usuario sólo se escribe una vez: mientras está vacía. */
  guia_editable: boolean;
  seccion_id: number;
  fecha: string;
  /** Si la fecha era anterior a hoy, se pasó a mañana: acá queda la original. */
  fecha_anterior: string | null;
  confidencial: boolean;
  titular: string;
  cuerpo: string;
  medidas: { titular: MedidaSimple; cuerpo: MedidaSimple; noticia: MedidaSimple };
  estado: string;
  nivel: number;
  redactor: string;
  /** Se está creando (cerrar sin guardar la borra entera). */
  creando: boolean;
  /** Se creó una versión nueva al abrir (cerrar sin guardar la borra). */
  nueva_version: boolean;
}

export interface AperturaEditor {
  noticia: EstadoEditor;
  /** Secciones con permiso REDACTAR_NOTICIA, ordenadas por nombre. */
  secciones: { id: number; nombre: string | null; codigo: string | null }[];
  comandos: Comando[];
  autosave_cambios: number;
}

/** Lo que manda la pantalla al guardar. */
export interface DatosEditor {
  guia_usuario?: unknown;
  seccion_id?: unknown;
  fecha?: unknown;
  confidencial?: unknown;
  titular?: unknown;
  cuerpo?: unknown;
  medidas?: unknown;
}

export class ErrorEditor extends Error {
  constructor(readonly statusCode: number, mensaje: string, readonly errores?: string[]) {
    super(mensaje);
  }
}

// --- sesión → reglas ---------------------------------------------------------

export function usuarioReglas(s: SesionUsuario): UsuarioReglas {
  return {
    username: s.usuario.username,
    nivel: s.usuario.nivel ?? 0,
    porSeccion: s.permisos_por_seccion,
  };
}

// --- lectura de la noticia a editar -----------------------------------------

interface FilaVersion {
  numero: number;
  fecha_publicacion: string | null;
  id_seccion: number;
  seccion_codigo: string | null;
  volanta: string | null; titulo: string | null; bajada: string | null;
  cuerpo: string | null; titular: string | null;
  redactor: string; estado: string; nivel: number | null;
  nivel_redactor: number | null; id_redactor: number | null;
  confidencial: boolean | null;
  medida_cm: number | null; medida_lineas: number | null;
  medida_volanta_cm: number | null; medida_volanta_lineas: number | null;
  medida_titulo_cm: number | null; medida_titulo_lineas: number | null;
  medida_bajada_cm: number | null; medida_bajada_lineas: number | null;
  medida_cuerpo_cm: number | null; medida_cuerpo_lineas: number | null;
  medida_titular_cm: number | null; medida_titular_lineas: number | null;
}

interface NoticiaCargada {
  id: number;
  guia: string | null;
  numero_version_activa: number;
  numero_proxima_version: number;
  /** Las no eliminadas, como las carga PostgresqlNoticiaDAO.getNoticia. */
  versiones: FilaVersion[];
  activa: FilaVersion;
}

/**
 * Lee la noticia con todas sus versiones no eliminadas y bloquea su fila de
 * `noticias` hasta el final de la transacción.
 */
async function cargar(c: pg.PoolClient, id: number): Promise<NoticiaCargada | null> {
  const cab = await c.query<{
    id: number; guia: string | null;
    numero_version_activa: number; numero_proxima_version: number | null;
  }>(
    `SELECT id, guia, numero_version_activa, numero_proxima_version
       FROM noticias WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const n = cab.rows[0];
  if (!n) return null;

  const vs = await c.query<FilaVersion>(
    `SELECT v.numero, v.fecha_publicacion, v.id_seccion, s.codigo AS seccion_codigo,
            v.volanta, v.titulo, v.bajada, v.cuerpo, v.titular,
            v.redactor, v.estado, v.nivel, v.nivel_redactor, v.id_redactor, v.confidencial,
            v.medida_cm, v.medida_lineas,
            v.medida_volanta_cm, v.medida_volanta_lineas,
            v.medida_titulo_cm,  v.medida_titulo_lineas,
            v.medida_bajada_cm,  v.medida_bajada_lineas,
            v.medida_cuerpo_cm,  v.medida_cuerpo_lineas,
            v.medida_titular_cm, v.medida_titular_lineas
       FROM versiones v JOIN secciones s ON s.id = v.id_seccion
      WHERE v.id_noticia = $1 AND v.eliminada IS NOT TRUE
      ORDER BY v.numero DESC`,
    [id],
  );
  const activa = vs.rows.find((v) => v.numero === n.numero_version_activa);
  if (!activa) return null;
  return {
    ...n,
    numero_proxima_version: n.numero_proxima_version ?? n.numero_version_activa + 1,
    versiones: vs.rows,
    activa,
  };
}

/**
 * Version.migrar(): las notas anteriores al campo "titular" tenían volanta,
 * título y bajada por separado. Al abrirlas se juntan en el titular —una por
 * línea— y sus medidas se suman. Al guardar, los tres campos viejos quedan
 * en NULL.
 */
function titularMigrado(v: FilaVersion): { texto: string; medida: MedidaSimple } {
  if (v.titular !== null) {
    return { texto: v.titular, medida: { cm: v.medida_titular_cm ?? 0, lineas: v.medida_titular_lineas ?? 0 } };
  }
  const texto =
    (v.volanta !== null ? `${v.volanta}\n` : '') +
    (v.titulo !== null ? `${v.titulo}\n` : '') +
    (v.bajada ?? '');
  return {
    texto,
    medida: {
      cm: (v.medida_volanta_cm ?? 0) + (v.medida_titulo_cm ?? 0) + (v.medida_bajada_cm ?? 0),
      lineas: (v.medida_volanta_lineas ?? 0) + (v.medida_titulo_lineas ?? 0) + (v.medida_bajada_lineas ?? 0),
    },
  };
}

const aReglas = (n: NoticiaCargada): NoticiaReglas => ({
  estado: n.activa.estado,
  nivel: n.activa.nivel ?? 0,
  redactor: n.activa.redactor,
  id_seccion: n.activa.id_seccion,
  fecha_publicacion: n.activa.fecha_publicacion,
  confidencial: n.activa.confidencial === true,
  versiones: n.versiones.map((v) => ({
    numero: v.numero, confidencial: v.confidencial === true,
    nivel_redactor: v.nivel_redactor, redactor: v.redactor,
  })),
});

function partesGuia(guia: string | null, id: number) {
  if (!guia) return { usuario: '', auto: guiaAutogenerada(id) };
  const i = guia.lastIndexOf('-');
  // Guía sin guion: no debería existir (el editor viejo fallaba al abrirla).
  // Se respeta tal cual y no se le agrega nada.
  if (i < 0) return { usuario: guia, auto: '' };
  return { usuario: guia.slice(0, i), auto: guia.slice(i + 1) };
}

const armarGuia = (usuario: string, auto: string) => (auto ? `${usuario}-${auto}` : usuario);

// --- catálogos del editor -----------------------------------------------------

export async function seccionesRedaccion(s: SesionUsuario) {
  const ids = s.permisos_por_seccion.REDACTAR_NOTICIA ?? [];
  if (ids.length === 0) return [];
  // Usuario.getSecciones(permiso) ordena con Seccion.compareTo: por nombre.
  const filas = await consultar<{ id: number; nombre: string | null; codigo: string | null }>(
    `SELECT id, nombre, codigo FROM secciones WHERE id = ANY($1::int[])`,
    [ids],
  );
  return filas.sort((a, b) => cmpJava(a.nombre ?? '', b.nombre ?? ''));
}

/** String.compareTo de Java: por unidades UTF-16, sin reglas de idioma. */
const cmpJava = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Comandos del combo: los de la sección más los del usuario.
 * ComandosComboModelAdapter + Comando.compareTo: primero los de sección,
 * después los del usuario, cada grupo por nombre.
 */
export async function comandosPara(idSeccion: number, idUsuario: number): Promise<Comando[]> {
  const filas = await consultar<{
    id: number; nombre: string; valor: string; id_seccion: number | null; id_usuario: number | null;
  }>(
    `SELECT id, nombre, valor, id_seccion, id_usuario
       FROM comandos WHERE id_seccion = $1 OR id_usuario = $2`,
    [idSeccion, idUsuario],
  );
  return filas
    .map((f) => {
      // Comando.esComandoSeccion(): idSeccion > 0 && idUsuario <= 0.
      const deUsuario = !((f.id_seccion ?? 0) > 0 && (f.id_usuario ?? 0) <= 0);
      return {
        id: f.id, nombre: f.nombre, valor: f.valor, de_usuario: deUsuario,
        etiqueta: deUsuario ? `u- ${f.nombre}` : f.nombre,
      };
    })
    .sort((a, b) =>
      a.de_usuario === b.de_usuario ? cmpJava(a.nombre, b.nombre) : a.de_usuario ? 1 : -1);
}

async function apertura(s: SesionUsuario, noticia: EstadoEditor): Promise<AperturaEditor> {
  const [secciones, comandos] = await Promise.all([
    seccionesRedaccion(s),
    comandosPara(noticia.seccion_id, s.usuario.id),
  ]);
  return { noticia, secciones, comandos, autosave_cambios: 40 };
}

// --- crear ------------------------------------------------------------------

/** AdministradorNoticias.iniciarCreacionNoticia + `new Noticia(usuario)`. */
export async function iniciarCreacion(s: SesionUsuario): Promise<AperturaEditor> {
  const u = usuarioReglas(s);
  puedeCrearNoticia(u);

  const secciones = await seccionesRedaccion(s);
  const porDefecto = s.secciones.find((x) => x.seccion_default)?.id;
  const seccion = secciones.find((x) => x.id === porDefecto) ?? secciones[0];
  if (!seccion) throw new ReglaRota('No tiene permiso para Redactar Noticias');

  const fecha = manana();
  const estado = await transaccion(async (c) => {
    const { rows } = await c.query<{ id: number }>(
      `INSERT INTO noticias (guia, numero_version_activa, numero_proxima_version)
       VALUES (NULL, 1, 2) RETURNING id`,
    );
    const id = rows[0]!.id;
    await c.query(
      `INSERT INTO versiones (
          id_noticia, numero, fecha_publicacion, id_seccion,
          volanta, titulo, bajada, cuerpo, titular,
          redactor, estado, eliminada, nivel, nivel_redactor, id_redactor, confidencial,
          medida_cm, medida_lineas, medida_volanta_cm, medida_volanta_lineas,
          medida_titulo_cm, medida_titulo_lineas, medida_bajada_cm, medida_bajada_lineas,
          medida_cuerpo_cm, medida_cuerpo_lineas, medida_titular_cm, medida_titular_lineas)
       VALUES ($1, 1, $2, $3, NULL, NULL, NULL, NULL, NULL,
               $4, 'EN_EDICION', false, $5, $5, $6, false,
               0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)`,
      [id, fecha, seccion.id, u.username, u.nivel, s.usuario.id],
    );
    await insertarTemporal(c, {
      id, numero: 1, fecha, seccion_id: seccion.id, titular: null, cuerpo: null,
      redactor: u.username, nivel: u.nivel, guia: null, confidencial: false,
    });
    return {
      id, numero: 1,
      guia_usuario: '', guia_auto: guiaAutogenerada(id), guia_editable: true,
      seccion_id: seccion.id, fecha, fecha_anterior: null, confidencial: false,
      titular: '', cuerpo: '',
      medidas: { titular: { cm: 0, lineas: 0 }, cuerpo: { cm: 0, lineas: 0 }, noticia: { cm: 0, lineas: 0 } },
      estado: 'EN_EDICION', nivel: u.nivel, redactor: u.username,
      creando: true, nueva_version: false,
    } satisfies EstadoEditor;
  });
  return apertura(s, estado);
}

// --- abrir -------------------------------------------------------------------

/** AdministradorNoticias.iniciarEdicionNoticia. */
export async function iniciarEdicion(id: number, s: SesionUsuario): Promise<AperturaEditor> {
  const u = usuarioReglas(s);

  const estado = await transaccion(async (c) => {
    const n = await cargar(c, id);
    if (!n) throw new ErrorEditor(404, 'No se puede editar la noticia porque fue eliminada.');

    puedeEditarNoticia(aReglas(n), u);

    // verificarFechaPublicacion: si la fecha quedó atrás, pasa a mañana.
    let fecha = n.activa.fecha_publicacion ?? manana();
    let fechaAnterior: string | null = null;
    if (fecha.slice(0, 10) < hoy()) {
      fechaAnterior = fecha;
      fecha = manana();
    }

    const { texto: titular, medida: medTitular } = titularMigrado(n.activa);
    const cuerpo = n.activa.cuerpo ?? '';
    const medCuerpo = { cm: n.activa.medida_cuerpo_cm ?? 0, lineas: n.activa.medida_cuerpo_lineas ?? 0 };
    const medNoticia = { cm: n.activa.medida_cm ?? 0, lineas: n.activa.medida_lineas ?? 0 };
    const confidencial = n.activa.confidencial === true;

    let numero = n.numero_version_activa;
    let nuevaVersion = false;
    let redactor = n.activa.redactor;

    if (n.activa.estado === 'AUTORIZADA' || n.activa.estado === 'FOTOCOMPUESTA') {
      // Noticia.crearNuevaVersion(u) + insertVersion.
      numero = n.numero_proxima_version;
      nuevaVersion = true;
      redactor = u.username;
      await c.query(
        `INSERT INTO versiones (
            id_noticia, numero, fecha_publicacion, id_seccion,
            volanta, titulo, bajada, cuerpo, titular,
            redactor, estado, eliminada, nivel, nivel_redactor, id_redactor, confidencial,
            medida_cm, medida_lineas, medida_cuerpo_cm, medida_cuerpo_lineas,
            medida_titular_cm, medida_titular_lineas,
            medida_volanta_cm, medida_volanta_lineas, medida_titulo_cm, medida_titulo_lineas,
            medida_bajada_cm, medida_bajada_lineas)
         VALUES ($1, $2, $3, $4, NULL, NULL, NULL, $5, $6,
                 $7, 'EN_EDICION', false, $8, $8, $9, $10,
                 $11, $12, $13, $14, $15, $16, 0, 0, 0, 0, 0, 0)`,
        [id, numero, fecha, n.activa.id_seccion, cuerpo, titular,
          u.username, u.nivel, s.usuario.id, confidencial,
          medNoticia.cm, medNoticia.lineas, medCuerpo.cm, medCuerpo.lineas,
          medTitular.cm, medTitular.lineas],
      );
      await c.query(
        `UPDATE noticias SET numero_version_activa = $1, numero_proxima_version = $2 WHERE id = $3`,
        [numero, n.numero_proxima_version + 1, id],
      );
    } else {
      // updateEstadoNivel
      await c.query(
        `UPDATE versiones SET estado = 'EN_EDICION', nivel = $1 WHERE id_noticia = $2 AND numero = $3`,
        [u.nivel, id, numero],
      );
    }

    await insertarTemporal(c, {
      id, numero, fecha, seccion_id: n.activa.id_seccion, titular, cuerpo,
      redactor, nivel: u.nivel, guia: n.guia, confidencial,
    });

    const g = partesGuia(n.guia, id);
    return {
      id, numero,
      guia_usuario: g.usuario, guia_auto: g.auto, guia_editable: g.usuario === '',
      seccion_id: n.activa.id_seccion, fecha, fecha_anterior: fechaAnterior, confidencial,
      titular, cuerpo,
      medidas: { titular: medTitular, cuerpo: medCuerpo, noticia: medNoticia },
      estado: 'EN_EDICION', nivel: u.nivel, redactor,
      creando: false, nueva_version: nuevaVersion,
    } satisfies EstadoEditor;
  });
  return apertura(s, estado);
}

async function insertarTemporal(c: pg.PoolClient, t: {
  id: number; numero: number; fecha: string; seccion_id: number;
  titular: string | null; cuerpo: string | null; redactor: string; nivel: number;
  guia: string | null; confidencial: boolean;
}) {
  // Si quedó una temporal vieja de la misma versión (un cierre que no llegó),
  // se pisa: es la misma versión que se está abriendo ahora.
  await c.query(
    `INSERT INTO versiones_tmp (
        id_noticia, numero, fecha_publicacion, id_seccion,
        volanta, titulo, bajada, cuerpo, titular, redactor, nivel, guia, confidencial)
     VALUES ($1, $2, $3, $4, NULL, NULL, NULL, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id_noticia, numero) DO UPDATE SET
        fecha_publicacion = EXCLUDED.fecha_publicacion, id_seccion = EXCLUDED.id_seccion,
        cuerpo = EXCLUDED.cuerpo, titular = EXCLUDED.titular, redactor = EXCLUDED.redactor,
        nivel = EXCLUDED.nivel, guia = EXCLUDED.guia, confidencial = EXCLUDED.confidencial`,
    [t.id, t.numero, t.fecha, t.seccion_id, t.cuerpo, t.titular,
      t.redactor, t.nivel, t.guia, t.confidencial],
  );
}

// --- guardar / autoguardar / cerrar -----------------------------------------

interface Normalizados {
  guia: string;
  seccion_id: number;
  fecha: string;
  confidencial: boolean;
  titular: string;
  cuerpo: string;
  medidas: { titular: MedidaSimple; cuerpo: MedidaSimple; noticia: MedidaSimple };
}

const MAX_TEXTO = 1_000_000;

function medida(x: unknown): MedidaSimple {
  const m = (x ?? {}) as { cm?: unknown; lineas?: unknown };
  const cm = Number(m.cm), lineas = Number(m.lineas);
  return {
    cm: Number.isFinite(cm) && cm >= 0 ? cm : 0,
    lineas: Number.isInteger(lineas) && lineas >= 0 ? lineas : 0,
  };
}

/**
 * Valida lo que manda la pantalla contra la noticia abierta. Lo que no se
 * puede cambiar (la parte de la guía ya escrita) sale de la base, no del
 * pedido.
 */
async function normalizar(
  n: NoticiaCargada, d: DatosEditor, s: SesionUsuario,
): Promise<Normalizados> {
  const g = partesGuia(n.guia, n.id);
  let guiaUsuario = g.usuario;
  if (g.usuario === '') {
    const dada = typeof d.guia_usuario === 'string' ? d.guia_usuario.trim() : '';
    if (dada !== '' && !GUIA_USUARIO.test(dada)) {
      throw new ErrorEditor(400, 'La guia no puede ser vacía ni tener más de 10 caracteres.');
    }
    guiaUsuario = dada;
  }

  const seccionId = Number(d.seccion_id);
  const permitidas = s.permisos_por_seccion.REDACTAR_NOTICIA ?? [];
  if (!Number.isInteger(seccionId) || !permitidas.includes(seccionId)) {
    throw new ErrorEditor(400, 'No tiene permiso para Redactar Noticias en esta sección');
  }

  const fecha = typeof d.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? d.fecha : null;
  const titular = typeof d.titular === 'string' ? d.titular : '';
  const cuerpo = typeof d.cuerpo === 'string' ? d.cuerpo : '';
  if (titular.length > MAX_TEXTO || cuerpo.length > MAX_TEXTO) {
    throw new ErrorEditor(413, 'El texto es demasiado largo.');
  }

  const m = (d.medidas ?? {}) as Record<string, unknown>;
  return {
    guia: armarGuia(guiaUsuario, g.auto),
    seccion_id: seccionId,
    fecha: fecha ?? '',
    confidencial: d.confidencial === true,
    titular, cuerpo,
    medidas: { titular: medida(m.titular), cuerpo: medida(m.cuerpo), noticia: medida(m.noticia) },
  };
}

/** La noticia tiene que estar abierta, en esa versión y por quien pide. */
async function abiertaPor(c: pg.PoolClient, id: number, numero: number, s: SesionUsuario) {
  const n = await cargar(c, id);
  if (!n) throw new ErrorEditor(404, 'La noticia fue eliminada.');
  if (n.numero_version_activa !== numero || n.activa.estado !== 'EN_EDICION') {
    throw new ErrorEditor(409, 'La noticia ya no está abierta para edición.');
  }
  if (n.activa.redactor !== s.usuario.username) {
    throw new ErrorEditor(409, 'La noticia está abierta por otro usuario.');
  }
  return n;
}

async function actualizarVersion(c: pg.PoolClient, id: number, numero: number, x: Normalizados, estado?: string) {
  // PostgresqlNoticiaDAO.updateNoticia. Volanta/título/bajada: si la versión
  // todavía no tenía titular (nota anterior al campo), quedaron migrados al
  // titular al abrirla y se vacían; si no, se dejan como estaban.
  await c.query(`UPDATE noticias SET guia = $1 WHERE id = $2`, [x.guia, id]);
  await c.query(
    `UPDATE versiones SET
        fecha_publicacion = $1, id_seccion = $2,
        volanta = CASE WHEN titular IS NULL THEN NULL ELSE volanta END,
        titulo  = CASE WHEN titular IS NULL THEN NULL ELSE titulo END,
        bajada  = CASE WHEN titular IS NULL THEN NULL ELSE bajada END,
        medida_volanta_cm = CASE WHEN titular IS NULL THEN 0 ELSE medida_volanta_cm END,
        medida_volanta_lineas = CASE WHEN titular IS NULL THEN 0 ELSE medida_volanta_lineas END,
        medida_titulo_cm = CASE WHEN titular IS NULL THEN 0 ELSE medida_titulo_cm END,
        medida_titulo_lineas = CASE WHEN titular IS NULL THEN 0 ELSE medida_titulo_lineas END,
        medida_bajada_cm = CASE WHEN titular IS NULL THEN 0 ELSE medida_bajada_cm END,
        medida_bajada_lineas = CASE WHEN titular IS NULL THEN 0 ELSE medida_bajada_lineas END,
        cuerpo = $3, titular = $4, confidencial = $5,
        medida_cuerpo_cm = $6, medida_cuerpo_lineas = $7,
        medida_titular_cm = $8, medida_titular_lineas = $9,
        medida_cm = $10, medida_lineas = $11,
        estado = COALESCE($12, estado)
      WHERE id_noticia = $13 AND numero = $14`,
    [x.fecha, x.seccion_id, x.cuerpo, x.titular, x.confidencial,
      x.medidas.cuerpo.cm, x.medidas.cuerpo.lineas,
      x.medidas.titular.cm, x.medidas.titular.lineas,
      x.medidas.noticia.cm, x.medidas.noticia.lineas,
      estado ?? null, id, numero],
  );
}

async function actualizarTemporal(c: pg.PoolClient, id: number, numero: number, x: Normalizados) {
  // PostgresqlNoticiaDAO.updateNoticiaTemporal
  await c.query(
    `UPDATE versiones_tmp SET
        fecha_publicacion = $1, id_seccion = $2,
        volanta = NULL, titulo = NULL, bajada = NULL,
        cuerpo = $3, guia = $4, confidencial = $5, titular = $6
      WHERE id_noticia = $7 AND numero = $8`,
    [x.fecha || null, x.seccion_id, x.cuerpo, x.guia, x.confidencial, x.titular, id, numero],
  );
}

function exigirValida(x: Normalizados) {
  const errores = validarParaGuardar(x.guia, x.seccion_id, x.fecha || null);
  if (errores.length) {
    throw new ErrorEditor(422, 'Se ha producido un error al guardar la noticia', errores);
  }
}

/** AdministradorNoticias.guardarNoticia: guarda la versión y la temporal. */
export async function guardar(id: number, numero: number, d: DatosEditor, s: SesionUsuario) {
  return transaccion(async (c) => {
    const n = await abiertaPor(c, id, numero, s);
    const x = await normalizar(n, d, s);
    exigirValida(x);
    await actualizarVersion(c, id, numero, x);
    await actualizarTemporal(c, id, numero, x);
    return { guia: x.guia };
  });
}

/** AdministradorNoticias.autoSave: sólo la versión temporal. */
export async function autoguardar(id: number, numero: number, d: DatosEditor, s: SesionUsuario) {
  return transaccion(async (c) => {
    const n = await abiertaPor(c, id, numero, s);
    const x = await normalizar(n, d, s);
    await actualizarTemporal(c, id, numero, x);
    return { ok: true };
  });
}

export type AccionCierre = 'guardando' | 'sin_guardar' | 'descartar_creacion' | 'descartar_version';

/**
 * Cerrar la noticia (F2). EditorNoticiasJPanel.cerrarNoticia decide, según
 * lo que hizo el redactor, cuál de los cuatro cierres del EJB corresponde:
 *
 *   guardando          terminarRedaccionGuardando: guarda y pasa a EN_EJECUCION
 *   sin_guardar        terminarRedaccionSinGuardar: EN_EJECUCION, sin tocar el texto
 *   descartar_creacion terminarCreacionSinGuardar: era nueva y nunca se guardó: se borra
 *   descartar_version  terminarEdicionNuevaVersionSinGuardar: se borra la versión creada al abrir
 */
export async function cerrar(
  id: number, numero: number, accion: AccionCierre, d: DatosEditor, s: SesionUsuario,
) {
  return transaccion(async (c) => {
    const n = await abiertaPor(c, id, numero, s);
    const borrarTemporal = () =>
      c.query(`DELETE FROM versiones_tmp WHERE id_noticia = $1 AND numero = $2`, [id, numero]);

    switch (accion) {
      case 'guardando': {
        const x = await normalizar(n, d, s);
        exigirValida(x);
        await borrarTemporal();
        await actualizarVersion(c, id, numero, x, 'EN_EJECUCION');
        return { cerrada: true };
      }
      case 'sin_guardar': {
        await c.query(
          `UPDATE versiones SET estado = 'EN_EJECUCION' WHERE id_noticia = $1 AND numero = $2`,
          [id, numero],
        );
        await borrarTemporal();
        return { cerrada: true };
      }
      case 'descartar_creacion': {
        if (n.versiones.length !== 1 || numero !== 1) {
          throw new ErrorEditor(409, 'La noticia no es nueva: no se puede descartar entera.');
        }
        await borrarTemporal();
        await c.query(`DELETE FROM noticias WHERE id = $1`, [id]);
        return { cerrada: true, borrada: true };
      }
      case 'descartar_version': {
        const restantes = n.versiones.filter((v) => v.numero !== numero);
        if (numero === 1 || restantes.length === 0) {
          throw new ErrorEditor(409, 'No hay una versión anterior a la que volver.');
        }
        await borrarTemporal();
        await c.query(`DELETE FROM versiones WHERE id_noticia = $1 AND numero = $2`, [id, numero]);
        // Noticia.eliminarVersion(): la activa pasa a ser la de número más alto
        // que queda; la próxima versión baja en uno.
        const activa = Math.max(...restantes.map((v) => v.numero));
        await c.query(
          `UPDATE noticias SET numero_version_activa = $1, numero_proxima_version = $2 WHERE id = $3`,
          [activa, n.numero_proxima_version - 1, id],
        );
        return { cerrada: true };
      }
      default:
        throw new ErrorEditor(400, 'Acción de cierre inválida.');
    }
  });
}

// --- medir ---------------------------------------------------------------------

export interface MedidaCampo extends MedidaSimple {
  /** Texto formateado por el motor, con los símbolos de edición. */
  formateado: string;
  /** `linea` es el número de palabra: el motor recibe una palabra por línea. */
  errores: Aviso[];
}

const VACIA: MedidaCampo = { cm: 0, lineas: 0, formateado: '', errores: [] };

/** ProgramaMedir.medirAlto sobre un campo. Vacío no se mide: vale cero. */
export async function medirCampo(texto: string): Promise<MedidaCampo> {
  if (!texto) return VACIA;
  const m = await composer.medir(filtrarParaMedir(texto));
  return {
    cm: m.cm ?? 0,
    lineas: contarLineas(m.formateado),
    formateado: filtrarSalidaMedir(m.formateado),
    errores: m.errores,
  };
}

/** ServicioMedicion.medirAlto(Noticia): cada campo por separado; la noticia es la suma. */
export async function medirNoticia(titular: string, cuerpo: string) {
  const [t, c] = await Promise.all([medirCampo(titular), medirCampo(cuerpo)]);
  return {
    titular: t,
    cuerpo: c,
    // Suma en float de 32 bits como el Java (Medida.centimetros es float),
    // redondeada a 2 decimales para mostrar como Constants.getMedidaCMFormat.
    noticia: { cm: Math.round((t.cm + c.cm) * 100) / 100, lineas: t.lineas + c.lineas },
  };
}

export async function medirAncho(texto: string) {
  if (!texto) return { medidas: [], errores: [] };
  const m = await composer.medirAncho(filtrarParaMedir(texto));
  return { medidas: m.medidas, errores: m.errores };
}

// --- fotocomponer ----------------------------------------------------------------

/** AdministradorNoticias.fotocomponerNoticia. */
export async function fotocomponer(id: number, s: SesionUsuario) {
  const u = usuarioReglas(s);
  return transaccion(async (c) => {
    const n = await cargar(c, id);
    if (!n) throw new ErrorEditor(404, 'No se puede fotocomponer la noticia porque fue eliminada');
    puedeFotocomponerNoticia(aReglas(n), u);

    const { texto: titular } = titularMigrado(n.activa);
    const texto = textoParaFotocomponer(titular, n.activa.cuerpo);
    if (!texto) throw new ErrorEditor(422, 'La noticia está vacía: no hay nada que fotocomponer.');
    if (!n.guia) throw new ErrorEditor(422, 'La noticia no tiene guía.');

    let r;
    try {
      r = await composer.componer(texto, n.guia, n.activa.seccion_codigo ?? '');
    } catch (e) {
      if (e instanceof ErrorComposer) throw e;
      throw new ErrorEditor(500, 'Se ha producido un error al fotocomponer la noticia');
    }

    await c.query(
      `UPDATE versiones SET estado = 'FOTOCOMPUESTA', fotocomponedor = $1, nivel = $2
        WHERE id_noticia = $3 AND numero = $4`,
      [u.username, u.nivel, id, n.numero_version_activa],
    );
    return { archivo: r.archivo, carpeta: r.carpeta, bytes: r.bytes, avisos: r.avisos };
  });
}
