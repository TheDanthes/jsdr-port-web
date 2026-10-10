/**
 * Administración → Permisos/Sección ("Asignación de Permisos en Sección").
 *
 * Port de AdministradorPermisosSeccionJPanel + EditorPermisosSeccionJPanel y
 * de AdministradorUsuariosBean (iniciarAdministradorPermisosSeccion,
 * buscarUsuarios, getPermisos(false), actualizarPermisosSeccion), con el SQL
 * de PostgresqlUsuarioDAO.
 *
 * Se elige una sección, se ven los usuarios que pertenecen a ella y a cada
 * uno se le tildan los permisos "de sección" (permisos.general = false:
 * redactar, fotocomponer...). Los permisos generales (administrar el
 * diccionario, monitorear usuarios...) no se asignan acá.
 *
 * Controles que el Swing tenía sólo en la pantalla y acá están también en el
 * servidor: la sección tiene que ser una de las que el usuario puede
 * administrar, el usuario editado tiene que pertenecer a esa sección y los
 * permisos tienen que ser de sección.
 */
import { consultar, transaccion } from '../db.js';
import type { SesionUsuario } from './sesion.js';
import { ErrorEditor } from './edicion.js';
import { seccionesParaAsignarPermisos } from '../dominio/reglas.js';

export interface PermisoSeccion { id: number; nombre: string; descripcion: string | null }

export interface UsuarioDeSeccion {
  id: number;
  username: string;
  nombre_apellido: string | null;
  dni: string | null;
  nivel: number | null;
  habilitado: boolean | null;
  /** Esta sección es su sección por defecto (el tilde de la última columna del Swing). */
  es_default: boolean;
  /** Ids de los permisos que tiene en esta sección. */
  permisos: number[];
}

/** Las secciones que el usuario de la sesión puede administrar, o el mensaje del Swing (403). */
export function seccionesPermitidas(s: SesionUsuario): number[] {
  const r = seccionesParaAsignarPermisos({
    nivel: s.usuario.nivel ?? 0,
    permisos: s.permisos.map((p) => p.nombre ?? ''),
    secciones: s.secciones,
  });
  if ('error' in r) throw new ErrorEditor(403, r.error);
  return r.secciones;
}

function exigirSeccion(s: SesionUsuario, idSeccion: number) {
  if (!seccionesPermitidas(s).includes(idSeccion)) {
    throw new ErrorEditor(403, 'No puede asignar permisos en esa sección.');
  }
}

/** PostgresqlUsuarioDAO.getPermisos(false): los permisos de sección, por nombre. */
export const permisosDeSeccion = () =>
  consultar<PermisoSeccion>(
    `SELECT id, nombre, descripcion FROM permisos WHERE general = false ORDER BY nombre`);

/** Lo que la pantalla necesita para arrancar: las secciones del combo y los permisos. */
export async function iniciar(s: SesionUsuario) {
  const ids = seccionesPermitidas(s);
  const [secciones, permisos] = await Promise.all([
    ids.length
      ? consultar<{ id: number; nombre: string | null; codigo: string | null }>(
        `SELECT id, nombre, codigo FROM secciones WHERE id = ANY($1) ORDER BY nombre`, [ids])
      : [],
    permisosDeSeccion(),
  ]);
  return { secciones, permisos };
}

/**
 * PostgresqlUsuarioDAO.getUsuarios(secciones): los usuarios que pertenecen a
 * la sección (habilitados o no, como el Swing), por username. Se suma lo que
 * tiene cada uno en la sección, para verlo sin abrir uno por uno.
 */
export async function usuariosDeSeccion(s: SesionUsuario, idSeccion: number): Promise<UsuarioDeSeccion[]> {
  exigirSeccion(s, idSeccion);
  return consultar<UsuarioDeSeccion>(
    `SELECT u.id, u.username, u.nombre_apellido, u.dni, u.nivel, u.habilitado,
            COALESCE(bool_or(us.seccion_default), false) AS es_default,
            COALESCE((SELECT array_agg(DISTINCT ups.id_permiso ORDER BY ups.id_permiso)
                        FROM usuarios_permisos_secciones ups
                       WHERE ups.id_usuario = u.id AND ups.id_seccion = $1), '{}') AS permisos
       FROM usuarios u
       JOIN usuarios_secciones us ON us.id_usuario = u.id AND us.id_seccion = $1
      GROUP BY u.id
      ORDER BY u.username, u.id`,
    [idSeccion],
  );
}

/**
 * AdministradorUsuariosBean.actualizarPermisosSeccion: deja al usuario, en
 * esa sección, con exactamente los permisos tildados. Como el DAO, agrega los
 * nuevos y borra los que se destildaron; acá en una sola transacción, y sin
 * tocar los permisos generales aunque alguno figure cargado por sección.
 */
export async function actualizar(s: SesionUsuario, idSeccion: number, idUsuario: number, pedidos: unknown) {
  exigirSeccion(s, idSeccion);
  if (!Array.isArray(pedidos) || !pedidos.every((p) => Number.isInteger(p))) {
    throw new ErrorEditor(400, 'permisos inválidos');
  }
  const deSeccion = await permisosDeSeccion();
  const validos = new Set(deSeccion.map((p) => p.id));
  const quiere = new Set(pedidos as number[]);
  for (const p of quiere) {
    if (!validos.has(p)) throw new ErrorEditor(400, 'Ese permiso no se asigna por sección.');
  }

  return transaccion(async (c) => {
    const miembro = await c.query(
      `SELECT 1 FROM usuarios_secciones WHERE id_usuario = $1 AND id_seccion = $2`, [idUsuario, idSeccion]);
    if (!miembro.rowCount) throw new ErrorEditor(404, 'El usuario no pertenece a esa sección.');

    const actuales = await c.query<{ id_permiso: number }>(
      `SELECT DISTINCT id_permiso FROM usuarios_permisos_secciones
        WHERE id_usuario = $1 AND id_seccion = $2 AND id_permiso = ANY($3)`,
      [idUsuario, idSeccion, [...validos]]);
    const tiene = new Set(actuales.rows.map((r) => r.id_permiso));

    const agregar = [...quiere].filter((p) => !tiene.has(p));
    const quitar = [...tiene].filter((p) => !quiere.has(p));
    for (const p of agregar) {
      await c.query(
        `INSERT INTO usuarios_permisos_secciones (id_usuario, id_permiso, id_seccion) VALUES ($1, $2, $3)`,
        [idUsuario, p, idSeccion]);
    }
    if (quitar.length) {
      await c.query(
        `DELETE FROM usuarios_permisos_secciones
          WHERE id_usuario = $1 AND id_seccion = $2 AND id_permiso = ANY($3)`,
        [idUsuario, idSeccion, quitar]);
    }
    return { permisos: [...quiere].sort((a, b) => a - b), agregados: agregar.length, quitados: quitar.length };
  });
}
