import { Link } from 'react-router-dom';
import type { Sesion } from '../api/tipos';
import { useUsuario } from '../sesion';

/**
 * El menú "Administración" del Swing (JMainFrame), con las mismas opciones y
 * los mismos permisos (MotorReglas.puedeAdministrar*). Se ve lo que el usuario
 * puede usar; lo que todavía no está en la web aparece apagado.
 */
interface Opcion {
  nombre: string;
  descripcion: string;
  /** Ruta en la web; sin ruta, todavía no está portada. */
  ruta?: string;
  puede: (s: Sesion) => boolean;
}

const tiene = (s: Sesion, permiso: string) => s.permisos.some((p) => p.nombre === permiso);
const nivel = (s: Sesion) => s.usuario.nivel ?? 0;

export const OPCIONES_ADMINISTRACION: Opcion[] = [
  {
    nombre: 'Diccionario',
    descripcion: 'Las palabras que usa la revisión ortográfica: buscar, agregar, corregir y eliminar.',
    ruta: '/administracion/diccionario',
    puede: (s) => tiene(s, 'ADMINISTRAR_DICCIONARIO'),
  },
  {
    nombre: 'Monitor de Usuarios',
    descripcion: 'Quién está conectado, desde cuándo y qué noticia tiene abierta.',
    ruta: '/administracion/monitor',
    puede: (s) => tiene(s, 'MONITOREAR_USUARIOS'),
  },
  {
    nombre: 'Usuarios',
    descripcion: 'Alta, baja y modificación de usuarios; blanquear contraseñas.',
    ruta: '/administracion/usuarios',
    puede: (s) => tiene(s, 'ADMINISTRAR_USUARIOS'),
  },
  {
    nombre: 'Permisos/Sección',
    descripcion: 'Qué puede hacer cada usuario en cada sección (redactar, fotocomponer).',
    ruta: '/administracion/permisos-seccion',
    puede: (s) => tiene(s, 'ASIGNAR_PERMISOS') && nivel(s) >= 20,
  },
  {
    nombre: 'Secciones',
    descripcion: 'Las secciones del diario.',
    ruta: '/administracion/secciones',
    puede: (s) => tiene(s, 'ADMINISTRAR_SECCIONES'),
  },
  {
    nombre: 'Agencias',
    descripcion: 'Las agencias de cables y cuántos días se guardan.',
    ruta: '/administracion/agencias',
    puede: (s) => tiene(s, 'ADMINISTRAR_AGENCIAS'),
  },
  {
    nombre: 'Comandos de Sección',
    descripcion: 'Los comandos del combo "Insertar" de cada sección.',
    puede: (s) => nivel(s) >= 20,
  },
  {
    nombre: 'Usos',
    descripcion: 'Textos numerados (número, descripción y texto).',
    puede: (s) => tiene(s, 'ADMINISTRAR_USOS'),
  },
];

/** Si el usuario tiene algo que administrar (para mostrar el menú). */
export const veAdministracion = (s: Sesion) => OPCIONES_ADMINISTRACION.some((o) => o.puede(s));

export function Administracion() {
  const s = useUsuario();
  const mias = OPCIONES_ADMINISTRACION.filter((o) => o.puede(s));

  return (
    <div className="panel">
      <header><h2>Administración</h2></header>
      <ul className="admin-opciones">
        {mias.map((o) => (
          <li key={o.nombre}>
            {o.ruta ? (
              <Link to={o.ruta} className="admin-opcion">
                <b>{o.nombre}</b>
                <span>{o.descripcion}</span>
              </Link>
            ) : (
              <div className="admin-opcion apagada" aria-disabled="true">
                <b>{o.nombre}</b>
                <span>{o.descripcion}</span>
                <small>Todavía no está en la web: por ahora, desde el jSDR de escritorio.</small>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
