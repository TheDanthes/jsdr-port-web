import { consultar } from '../db.js';
import type { Seccion, Agencia, Permiso, Usuario } from '../dominio/tipos.js';

export const listarSecciones = () =>
  consultar<Seccion>(
    `SELECT id, nombre, codigo FROM secciones ORDER BY codigo`,
  );

export const listarAgencias = (soloHabilitadas = false) =>
  consultar<Agencia>(
    `SELECT id, nombre, codigo, habilitada, dias_vida_util
       FROM agencias
      ${soloHabilitadas ? `WHERE habilitada = true` : ``}
      ORDER BY codigo`,
  );

export const listarPermisos = () =>
  consultar<Permiso>(
    `SELECT id, nombre, descripcion, general FROM permisos ORDER BY id`,
  );

// Nunca selecciona `password`.
export const listarUsuarios = (soloHabilitados = true) =>
  consultar<Usuario>(
    `SELECT id, username, nivel, nombre_apellido, dni, habilitado
       FROM usuarios
      ${soloHabilitados ? `WHERE habilitado = true` : ``}
      ORDER BY username`,
  );

/** Secciones a las que el usuario tiene acceso, con su sección por defecto. */
export const seccionesDeUsuario = (username: string) =>
  consultar<Seccion & { seccion_default: boolean | null }>(
    `SELECT s.id, s.nombre, s.codigo, us.seccion_default
       FROM secciones s
       JOIN usuarios_secciones us ON us.id_seccion = s.id
       JOIN usuarios u           ON u.id = us.id_usuario
      WHERE u.username = $1
      ORDER BY s.codigo`,
    [username],
  );
