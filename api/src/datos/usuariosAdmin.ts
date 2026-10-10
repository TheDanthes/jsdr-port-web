/**
 * Administración → Usuarios. Port de AdministradorUsuariosJPanel +
 * EditorUsuarioJPanel, de AdministradorUsuariosBean (buscarUsuarios,
 * crearUsuario, actualizarUsuario, eliminarUsuario) y de su SQL en
 * PostgresqlUsuarioDAO, con las validaciones de Usuario.isValid y sus
 * mensajes (sin las erratas).
 *
 * Las contraseñas siguen en texto plano, como en el sistema viejo (decisión
 * de la redacción: se cifran en el pase a producción). Un usuario nuevo y uno
 * blanqueado quedan con la contraseña por defecto (123456) y tienen que
 * cambiarla al entrar.
 *
 * Diferencias con el Swing, todas para no perder datos ni dejar a nadie
 * afuera: todo va en una transacción; el nombre de usuario no se repite ni
 * cambiando mayúsculas; nadie se puede deshabilitar ni eliminar a sí mismo; y
 * el buscador no arma el SQL pegando el texto (el Swing sí: una comilla lo
 * rompía).
 */
import type pg from 'pg';
import { consultar, transaccion } from '../db.js';
import { config } from '../config.js';
import type { SesionUsuario } from './sesion.js';
import { ErrorEditor } from './edicion.js';
import { olvidarUsuario, sesionViva } from './conectados.js';

/** Los mensajes del Swing (administracionusuarios.*, administradorusuarios.*). */
export const MENSAJES_USUARIOS = {
  sinPermiso: 'No tiene permiso para administrar usuarios',
  usernameVacio: 'El nombre de usuario no puede ser vacío',
  usernameLargo: 'El nombre de usuario supera la longitud máxima (15)',
  nombreVacio: 'El nombre/apellido no puede ser vacío',
  nombreLargo: 'El nombre/apellido supera la longitud máxima (50)',
  dniLargo: 'El DNI supera la longitud máxima (10)',
  seccionDefault: 'La sección por defecto no puede ser vacía',
  nivelVacio: 'El nivel no puede ser vacío',
  asignarPermisosRedactor: 'El permiso ASIGNAR_PERMISOS no puede ser asignado al nivel REDACTOR',
  usernameExistente: 'El nombre de usuario ya existe',
  eliminarLogueado: 'No se puede eliminar el usuario porque se encuentra logueado en el sistema',
  eliminarRelacionado: 'El usuario no se puede eliminar porque existe información relacionada'
    + ' (por ejemplo, noticias suyas). Se puede deshabilitar.',
  aSiMismo: 'No puede deshabilitarse ni eliminarse a sí mismo.',
} as const;

const NIVELES = [10, 20, 30];

export interface UsuarioAdmin {
  id: number;
  username: string;
  nombre_apellido: string | null;
  dni: string | null;
  nivel: number | null;
  habilitado: boolean | null;
  /** Ids de sus permisos generales (usuarios_permisos). */
  permisos: number[];
  /** Sus secciones (usuarios_secciones). */
  secciones: number[];
  seccion_default: number | null;
  /** Tiene la contraseña por defecto: la va a tener que cambiar al entrar. */
  clave_por_defecto: boolean;
}

export function exigirAdministrarUsuarios(s: SesionUsuario) {
  if (!s.permisos.some((p) => p.nombre === 'ADMINISTRAR_USUARIOS')) {
    throw new ErrorEditor(403, MENSAJES_USUARIOS.sinPermiso);
  }
}

/** Para el editor: los permisos generales (getPermisos(true)) y todas las secciones. */
export async function catalogos() {
  const [permisos, secciones] = await Promise.all([
    consultar<{ id: number; nombre: string; descripcion: string | null }>(
      `SELECT id, nombre, descripcion FROM permisos WHERE general = true ORDER BY nombre`),
    consultar<{ id: number; nombre: string | null; codigo: string | null }>(
      `SELECT id, nombre, codigo FROM secciones ORDER BY nombre`),
  ]);
  return { permisos, secciones, niveles: NIVELES, clave_por_defecto: config.claveDefecto };
}

const escaparLike = (t: string) => t.replace(/[\\%_]/g, (m) => `\\${m}`);

const SELECT_USUARIOS = `
  SELECT u.id, u.username, u.nombre_apellido, u.dni, u.nivel, u.habilitado,
         COALESCE((SELECT array_agg(DISTINCT up.id_permiso ORDER BY up.id_permiso)
                     FROM usuarios_permisos up WHERE up.id_usuario = u.id), '{}') AS permisos,
         COALESCE((SELECT array_agg(us.id_seccion ORDER BY us.id_seccion)
                     FROM usuarios_secciones us WHERE us.id_usuario = u.id), '{}') AS secciones,
         (SELECT us.id_seccion FROM usuarios_secciones us
           WHERE us.id_usuario = u.id AND us.seccion_default = true ORDER BY us.id_seccion LIMIT 1) AS seccion_default,
         COALESCE(u.password = $1, false) AS clave_por_defecto
    FROM usuarios u`;

/** PostgresqlUsuarioDAO.getUsuarios(username, nombre, nivel): "contiene", sin distinguir mayúsculas. */
export async function buscar(filtro: { username?: string; nombre?: string; nivel?: number }) {
  const params: unknown[] = [config.claveDefecto];
  const donde: string[] = [];
  if (filtro.username?.trim()) {
    params.push(`%${escaparLike(filtro.username.trim())}%`);
    donde.push(`u.username ILIKE $${params.length}`);
  }
  if (filtro.nombre?.trim()) {
    params.push(`%${escaparLike(filtro.nombre.trim())}%`);
    donde.push(`u.nombre_apellido ILIKE $${params.length}`);
  }
  if (filtro.nivel && NIVELES.includes(filtro.nivel)) {
    params.push(filtro.nivel);
    donde.push(`u.nivel = $${params.length}`);
  }
  return consultar<UsuarioAdmin>(
    `${SELECT_USUARIOS} ${donde.length ? `WHERE ${donde.join(' AND ')}` : ''} ORDER BY u.username, u.id`,
    params,
  );
}

async function uno(c: pg.PoolClient, id: number): Promise<UsuarioAdmin | null> {
  const r = await c.query<UsuarioAdmin>(`${SELECT_USUARIOS} WHERE u.id = $2`, [config.claveDefecto, id]);
  return r.rows[0] ?? null;
}

export interface DatosUsuario {
  username?: unknown;
  nombre_apellido?: unknown;
  dni?: unknown;
  nivel?: unknown;
  habilitado?: unknown;
  permisos?: unknown;
  secciones?: unknown;
  seccion_default?: unknown;
}

interface Validado {
  username: string;
  nombre_apellido: string;
  dni: string | null;
  nivel: number;
  habilitado: boolean;
  permisos: number[];
  secciones: number[];
  seccion_default: number | null;
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const enteros = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is number => Number.isInteger(x)))] : [];

/**
 * Usuario.isValid, con todos los errores juntos como el ErrorDialog del
 * Swing. Los permisos y secciones tienen que existir y los permisos ser
 * generales (los de sección se asignan en Permisos/Sección).
 */
async function validar(c: pg.PoolClient, d: DatosUsuario, creando: boolean): Promise<Validado> {
  const v: Validado = {
    username: texto(d.username),
    nombre_apellido: texto(d.nombre_apellido),
    dni: texto(d.dni) || null,
    nivel: Number(d.nivel),
    habilitado: d.habilitado !== false,
    permisos: enteros(d.permisos),
    secciones: enteros(d.secciones),
    seccion_default: Number.isInteger(d.seccion_default) ? (d.seccion_default as number) : null,
  };
  const errores: string[] = [];
  if (creando) {
    if (!v.username) errores.push(MENSAJES_USUARIOS.usernameVacio);
    else if (v.username.length > 15) errores.push(MENSAJES_USUARIOS.usernameLargo);
  }
  if (!v.nombre_apellido) errores.push(MENSAJES_USUARIOS.nombreVacio);
  else if (v.nombre_apellido.length > 50) errores.push(MENSAJES_USUARIOS.nombreLargo);
  if (v.dni && v.dni.length > 10) errores.push(MENSAJES_USUARIOS.dniLargo);
  if (v.secciones.length > 0 && (v.seccion_default === null || !v.secciones.includes(v.seccion_default))) {
    errores.push(MENSAJES_USUARIOS.seccionDefault);
  }
  if (!NIVELES.includes(v.nivel)) errores.push(MENSAJES_USUARIOS.nivelVacio);

  const permisos = await c.query<{ id: number; nombre: string }>(
    `SELECT id, nombre FROM permisos WHERE general = true AND id = ANY($1)`, [v.permisos]);
  if (permisos.rowCount !== v.permisos.length) throw new ErrorEditor(400, 'Hay permisos que no existen o no son generales.');
  if (v.nivel === 10 && permisos.rows.some((p) => p.nombre === 'ASIGNAR_PERMISOS')) {
    errores.push(MENSAJES_USUARIOS.asignarPermisosRedactor);
  }
  const secciones = await c.query(`SELECT id FROM secciones WHERE id = ANY($1)`, [v.secciones]);
  if (secciones.rowCount !== v.secciones.length) throw new ErrorEditor(400, 'Hay secciones que no existen.');
  if (v.secciones.length === 0) v.seccion_default = null;

  if (errores.length) throw new ErrorEditor(400, errores[0]!, errores);
  return v;
}

/** Deja permisos generales y secciones exactamente como pide `v` (DAO: agrega lo nuevo, borra lo quitado). */
async function guardarRelaciones(c: pg.PoolClient, id: number, v: Validado) {
  await c.query(
    `DELETE FROM usuarios_permisos up USING permisos p
      WHERE up.id_usuario = $1 AND p.id = up.id_permiso AND p.general = true AND NOT (up.id_permiso = ANY($2))`,
    [id, v.permisos]);
  await c.query(
    `INSERT INTO usuarios_permisos (id_usuario, id_permiso)
     SELECT $1, x FROM unnest($2::int[]) x
      WHERE NOT EXISTS (SELECT 1 FROM usuarios_permisos WHERE id_usuario = $1 AND id_permiso = x)`,
    [id, v.permisos]);

  // Quitar una sección borra también los permisos que tenía en ella (la FK de
  // usuarios_permisos_secciones es ON DELETE CASCADE), como en el Swing.
  await c.query(`DELETE FROM usuarios_secciones WHERE id_usuario = $1 AND NOT (id_seccion = ANY($2))`, [id, v.secciones]);
  await c.query(
    `INSERT INTO usuarios_secciones (id_usuario, id_seccion, seccion_default)
     SELECT $1, x, false FROM unnest($2::int[]) x
      WHERE NOT EXISTS (SELECT 1 FROM usuarios_secciones WHERE id_usuario = $1 AND id_seccion = x)`,
    [id, v.secciones]);
  await c.query(
    `UPDATE usuarios_secciones SET seccion_default = (id_seccion = $2) WHERE id_usuario = $1`,
    [id, v.seccion_default]);
}

async function usernameLibre(c: pg.PoolClient, username: string) {
  const r = await c.query(`SELECT 1 FROM usuarios WHERE lower(username) = lower($1)`, [username]);
  if (r.rowCount) throw new ErrorEditor(409, MENSAJES_USUARIOS.usernameExistente);
}

/** AdministradorUsuariosBean.crearUsuario: con la contraseña por defecto. */
export async function crear(d: DatosUsuario) {
  return transaccion(async (c) => {
    const v = await validar(c, d, true);
    await usernameLibre(c, v.username);
    const r = await c.query<{ id: number }>(
      `INSERT INTO usuarios (username, nivel, password, nombre_apellido, dni, habilitado)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [v.username, v.nivel, config.claveDefecto, v.nombre_apellido, v.dni, v.habilitado]);
    const id = r.rows[0]!.id;
    await guardarRelaciones(c, id, v);
    return { usuario: (await uno(c, id))!, clave: config.claveDefecto };
  });
}

async function cargarParaCambiar(c: pg.PoolClient, id: number) {
  const r = await c.query<{ id: number; username: string }>(
    `SELECT id, username FROM usuarios WHERE id = $1 FOR UPDATE`, [id]);
  if (!r.rows[0]) throw new ErrorEditor(404, 'El usuario no existe.');
  return r.rows[0];
}

/** AdministradorUsuariosBean.actualizarUsuario. El nombre de usuario no se cambia (en el Swing tampoco). */
export async function actualizar(s: SesionUsuario, id: number, d: DatosUsuario) {
  return transaccion(async (c) => {
    const actual = await cargarParaCambiar(c, id);
    const v = await validar(c, d, false);
    if (id === s.usuario.id && !v.habilitado) throw new ErrorEditor(409, MENSAJES_USUARIOS.aSiMismo);
    await c.query(
      `UPDATE usuarios SET nombre_apellido = $1, dni = $2, nivel = $3, habilitado = $4 WHERE id = $5`,
      [v.nombre_apellido, v.dni, v.nivel, v.habilitado, id]);
    await guardarRelaciones(c, id, v);
    return { usuario: (await uno(c, id))!, username: actual.username };
  });
}

/**
 * Blanquear la contraseña ("Resetear contraseña" del Swing): queda la por
 * defecto y se devuelve, para que quien la blanqueó sepa cuál pasar.
 */
export async function blanquear(id: number) {
  return transaccion(async (c) => {
    const u = await cargarParaCambiar(c, id);
    await c.query(`UPDATE usuarios SET password = $1 WHERE id = $2`, [config.claveDefecto, id]);
    return { username: u.username, clave: config.claveDefecto };
  });
}

/** AdministradorUsuariosBean.eliminarUsuario. */
export async function eliminar(s: SesionUsuario, id: number) {
  if (id === s.usuario.id) throw new ErrorEditor(409, MENSAJES_USUARIOS.aSiMismo);
  try {
    return await transaccion(async (c) => {
      const u = await cargarParaCambiar(c, id);
      if (sesionViva(u.username)) throw new ErrorEditor(409, MENSAJES_USUARIOS.eliminarLogueado);
      // usuarios_permisos y usuarios_secciones se van solos (ON DELETE CASCADE);
      // si tiene noticias, la FK de versiones lo impide.
      await c.query(`DELETE FROM usuarios WHERE id = $1`, [id]);
      olvidarUsuario(u.username);
      return { username: u.username };
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23503') throw new ErrorEditor(409, MENSAJES_USUARIOS.eliminarRelacionado);
    throw e;
  }
}
