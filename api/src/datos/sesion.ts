import { consultar } from '../db.js';
import type { Usuario, Seccion, Permiso } from '../dominio/tipos.js';

/**
 * Preferencias de tipografía que el cliente Swing guardaba por usuario:
 * una para el editor y una para cada buscador (bn = noticias, bc = cables).
 */
export interface Preferencias {
  font_size_editor: number | null;
  font_size_bn: number | null;
  font_size_bc: number | null;
}

export interface SesionUsuario {
  usuario: Usuario & Preferencias;
  secciones: (Seccion & { seccion_default: boolean | null })[];
  permisos: Permiso[];
  /** Permisos acotados a ciertas secciones: permiso -> ids de sección. */
  permisos_por_seccion: Record<string, number[]>;
}

/**
 * Valida usuario y contraseña contra la tabla `usuarios`.
 *
 * La comparación la hace PostgreSQL en el WHERE, igual que el DAO original
 * (`WHERE username = ? AND password = ?`): así la contraseña nunca se
 * selecciona ni viaja a la aplicación. Sigue siendo texto plano en la base
 * —deuda heredada, documentada— y se reemplaza por hash en la Fase 5.
 *
 * Devuelve null si no coincide o si el usuario está deshabilitado, sin
 * distinguir entre ambos casos: el que pregunta no tiene por qué saber si
 * el username existe.
 */
export async function autenticar(
  username: string,
  password: string,
): Promise<(Usuario & Preferencias) | null> {
  const filas = await consultar<Usuario & Preferencias>(
    `SELECT id, username, nivel, nombre_apellido, dni, habilitado,
            font_size_editor, font_size_bn, font_size_bc
       FROM usuarios
      WHERE username = $1
        AND password = $2
        AND habilitado = true
      ORDER BY id`,
    [username, password],
  );

  // `usuarios.username` no tiene UNIQUE en el esquema original. Si alguna vez
  // hay dos, entra el de id más bajo y queda registrado en el log: es un
  // agujero de integridad conocido, a cerrar en el sistema nuevo.
  if (filas.length > 1) {
    console.warn(
      `[sesion] El username "${username}" tiene ${filas.length} filas en usuarios. ` +
        `Se usa id=${filas[0]!.id}.`,
    );
  }

  return filas[0] ?? null;
}

/** Relee de la base todo lo que define qué puede ver y hacer el usuario. */
export async function cargarSesion(username: string): Promise<SesionUsuario | null> {
  const [usuario] = await consultar<Usuario & Preferencias>(
    `SELECT id, username, nivel, nombre_apellido, dni, habilitado,
            font_size_editor, font_size_bn, font_size_bc
       FROM usuarios
      WHERE username = $1 AND habilitado = true
      ORDER BY id`,
    [username],
  );
  if (!usuario) return null;

  const [secciones, permisos, porSeccion] = await Promise.all([
    consultar<Seccion & { seccion_default: boolean | null }>(
      `SELECT s.id, s.nombre, s.codigo, us.seccion_default
         FROM secciones s
         JOIN usuarios_secciones us ON us.id_seccion = s.id
        WHERE us.id_usuario = $1
        ORDER BY s.codigo`,
      [usuario.id],
    ),
    consultar<Permiso>(
      `SELECT p.id, p.nombre, p.descripcion, p.general
         FROM permisos p
         JOIN usuarios_permisos up ON up.id_permiso = p.id
        WHERE up.id_usuario = $1
        ORDER BY p.id`,
      [usuario.id],
    ),
    consultar<{ nombre: string | null; id_seccion: number }>(
      `SELECT p.nombre, ups.id_seccion
         FROM usuarios_permisos_secciones ups
         JOIN permisos p ON p.id = ups.id_permiso
        WHERE ups.id_usuario = $1
        ORDER BY p.nombre, ups.id_seccion`,
      [usuario.id],
    ),
  ]);

  const permisos_por_seccion: Record<string, number[]> = {};
  for (const fila of porSeccion) {
    const clave = fila.nombre ?? '(sin nombre)';
    (permisos_por_seccion[clave] ??= []).push(fila.id_seccion);
  }

  return { usuario, secciones, permisos, permisos_por_seccion };
}
