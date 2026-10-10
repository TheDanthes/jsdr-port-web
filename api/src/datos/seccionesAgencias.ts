/**
 * Administración → Secciones y Agencias. Port de AdministradorSeccionesJPanel
 * / EditorSeccionJPanel y AdministradorAgenciasJPanel / EditorAgenciaJPanel,
 * de sus beans y de PostgresqlSeccionDAO / PostgresqlAgenciaDAO, con las
 * validaciones de Seccion.isValid / Agencia.isValid y sus mensajes.
 *
 * Igual que el Swing: no puede haber otra con el mismo nombre o código (el
 * código de agencia distingue mayúsculas: 'S' y 's' son agencias distintas
 * en los cables), y no se elimina la que tiene información relacionada
 * (noticias o usuarios en una sección, cables en una agencia).
 */
import type pg from 'pg';
import { consultar, transaccion } from '../db.js';
import type { SesionUsuario } from './sesion.js';
import { ErrorEditor } from './edicion.js';

export const MENSAJES_SA = {
  sinPermisoSecciones: 'No tiene permiso para administrar secciones',
  sinPermisoAgencias: 'No tiene permiso para administrar agencias',
  nombreVacio: 'El nombre no puede ser vacío',
  nombreLargo: (max: number) => `El nombre supera la longitud máxima (${max})`,
  codigoVacio: 'El código no puede ser vacío',
  codigoLargo: (max: number) => `El código supera la longitud máxima (${max})`,
  diasVidaUtil: 'La cantidad de días de vida útil debe ser mayor a 0',
  seccionExiste: 'Ya existe otra sección con el nombre y/o código ingresados',
  agenciaExiste: 'Ya existe otra agencia con el nombre y/o código ingresados',
  seccionRelacionada: 'La sección no se puede eliminar porque existe información relacionada'
    + ' (noticias o usuarios de la sección)',
  agenciaRelacionada: 'La agencia no se puede eliminar porque existe información relacionada'
    + ' (cables de la agencia). Se puede deshabilitar.',
} as const;

export function exigir(s: SesionUsuario, que: 'secciones' | 'agencias') {
  const permiso = que === 'secciones' ? 'ADMINISTRAR_SECCIONES' : 'ADMINISTRAR_AGENCIAS';
  if (!s.permisos.some((p) => p.nombre === permiso)) {
    throw new ErrorEditor(403, que === 'secciones' ? MENSAJES_SA.sinPermisoSecciones : MENSAJES_SA.sinPermisoAgencias);
  }
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function validarBasico(nombre: string, codigo: string, maxNombre: number, maxCodigo: number) {
  const errores: string[] = [];
  if (!nombre) errores.push(MENSAJES_SA.nombreVacio);
  else if (nombre.length > maxNombre) errores.push(MENSAJES_SA.nombreLargo(maxNombre));
  if (!codigo) errores.push(MENSAJES_SA.codigoVacio);
  else if (codigo.length > maxCodigo) errores.push(MENSAJES_SA.codigoLargo(maxCodigo));
  return errores;
}

const fallar = (errores: string[]) => { if (errores.length) throw new ErrorEditor(400, errores[0]!, errores); };

async function eliminarCon(sql: string, id: number, relacionada: string) {
  try {
    return await transaccion(async (c) => {
      const r = await c.query(sql, [id]);
      if (!r.rowCount) throw new ErrorEditor(404, 'No existe.');
      return r.rows[0] as Record<string, unknown>;
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23503') throw new ErrorEditor(409, relacionada);
    throw e;
  }
}

// --- secciones --------------------------------------------------------------------------

/** Con cuántas noticias y usuarios tiene cada una (para saber si se puede eliminar). */
export const listarSecciones = () =>
  consultar<{ id: number; nombre: string | null; codigo: string | null; usuarios: number; versiones: number }>(
    `SELECT s.id, s.nombre, trim(s.codigo) AS codigo,
            (SELECT count(*)::int FROM usuarios_secciones us WHERE us.id_seccion = s.id) AS usuarios,
            (SELECT count(*)::int FROM versiones v WHERE v.id_seccion = s.id) AS versiones
       FROM secciones s ORDER BY s.nombre`);

async function seccionLibre(c: pg.PoolClient, nombre: string, codigo: string, id: number | null) {
  const r = await c.query(
    `SELECT 1 FROM secciones WHERE (nombre = $1 OR trim(codigo) = $2) AND ($3::int IS NULL OR id <> $3)`,
    [nombre, codigo, id]);
  if (r.rowCount) throw new ErrorEditor(409, MENSAJES_SA.seccionExiste);
}

export async function guardarSeccion(id: number | null, d: { nombre?: unknown; codigo?: unknown }) {
  const nombre = texto(d.nombre), codigo = texto(d.codigo).toUpperCase();
  fallar(validarBasico(nombre, codigo, 30, 2));
  return transaccion(async (c) => {
    await seccionLibre(c, nombre, codigo, id);
    if (id === null) {
      const r = await c.query<{ id: number }>(`INSERT INTO secciones (nombre, codigo) VALUES ($1, $2) RETURNING id`, [nombre, codigo]);
      return { id: r.rows[0]!.id, nombre, codigo };
    }
    const r = await c.query(`UPDATE secciones SET nombre = $1, codigo = $2 WHERE id = $3`, [nombre, codigo, id]);
    if (!r.rowCount) throw new ErrorEditor(404, 'La sección no existe.');
    return { id, nombre, codigo };
  });
}

export const eliminarSeccion = (id: number) =>
  eliminarCon(`DELETE FROM secciones WHERE id = $1 RETURNING nombre`, id, MENSAJES_SA.seccionRelacionada);

// --- agencias ---------------------------------------------------------------------------

export const listarAgencias = () =>
  consultar<{ id: number; nombre: string; codigo: string; habilitada: boolean | null; dias_vida_util: number | null; cables: number }>(
    `SELECT a.id, a.nombre, a.codigo, a.habilitada, a.dias_vida_util,
            (SELECT count(*)::int FROM cables c WHERE c.id_agencia = a.id) AS cables
       FROM agencias a ORDER BY a.nombre`);

async function agenciaLibre(c: pg.PoolClient, nombre: string, codigo: string, id: number | null) {
  const r = await c.query(
    `SELECT 1 FROM agencias WHERE (nombre = $1 OR codigo = $2) AND ($3::int IS NULL OR id <> $3)`,
    [nombre, codigo, id]);
  if (r.rowCount) throw new ErrorEditor(409, MENSAJES_SA.agenciaExiste);
}

export async function guardarAgencia(
  id: number | null,
  d: { nombre?: unknown; codigo?: unknown; dias_vida_util?: unknown; habilitada?: unknown },
) {
  const nombre = texto(d.nombre), codigo = texto(d.codigo);   // el código distingue mayúsculas
  const dias = Number(d.dias_vida_util);
  const errores = validarBasico(nombre, codigo, 50, 1);
  if (!Number.isInteger(dias) || dias <= 0) errores.push(MENSAJES_SA.diasVidaUtil);
  fallar(errores);
  const habilitada = d.habilitada !== false;
  return transaccion(async (c) => {
    await agenciaLibre(c, nombre, codigo, id);
    if (id === null) {
      const r = await c.query<{ id: number }>(
        `INSERT INTO agencias (nombre, codigo, habilitada, dias_vida_util) VALUES ($1, $2, $3, $4) RETURNING id`,
        [nombre, codigo, habilitada, dias]);
      return { id: r.rows[0]!.id, nombre, codigo, habilitada, dias_vida_util: dias };
    }
    const r = await c.query(
      `UPDATE agencias SET nombre = $1, codigo = $2, habilitada = $3, dias_vida_util = $4 WHERE id = $5`,
      [nombre, codigo, habilitada, dias, id]);
    if (!r.rowCount) throw new ErrorEditor(404, 'La agencia no existe.');
    return { id, nombre, codigo, habilitada, dias_vida_util: dias };
  });
}

export const eliminarAgencia = (id: number) =>
  eliminarCon(`DELETE FROM agencias WHERE id = $1 RETURNING nombre`, id, MENSAJES_SA.agenciaRelacionada);
