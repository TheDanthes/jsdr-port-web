import type {
  Agencia, Cable, Noticia, Pagina, Permiso, Reserva, Seccion, Sesion, Usuario, Version,
} from './tipos';

const CLAVE_TOKEN = 'jsdr.token';

/** El token vive en localStorage. En navegación privada puede fallar: no rompe. */
export const guardarToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(CLAVE_TOKEN, t);
    else localStorage.removeItem(CLAVE_TOKEN);
  } catch { /* sin almacenamiento: la sesión dura lo que la pestaña */ }
  enMemoria = t;
};

let enMemoria: string | null = null;

export const leerToken = (): string | null => {
  if (enMemoria) return enMemoria;
  try { enMemoria = localStorage.getItem(CLAVE_TOKEN); } catch { enMemoria = null; }
  return enMemoria;
};

export class ErrorApi extends Error {
  constructor(readonly codigo: number, mensaje: string) {
    super(mensaje);
  }
  /** La sesión venció o el usuario dejó de estar habilitado. */
  get esSesion() { return this.codigo === 401; }
}

/** Se dispara cuando la API rechaza la sesión: la app vuelve al login. */
type Escucha = () => void;
const escuchas = new Set<Escucha>();
export const alPerderSesion = (f: Escucha) => {
  escuchas.add(f);
  return () => { escuchas.delete(f); };
};

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const token = leerToken();
  const r = await fetch(ruta, {
    ...opciones,
    headers: {
      ...(opciones.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...opciones.headers,
    },
  });

  if (!r.ok) {
    let mensaje = `Error ${r.status}`;
    try {
      const cuerpo = await r.json();
      if (cuerpo?.error) mensaje = cuerpo.error;
    } catch { /* la respuesta no era JSON */ }

    if (r.status === 401) {
      guardarToken(null);
      escuchas.forEach((f) => f());
    }
    throw new ErrorApi(r.status, mensaje);
  }

  return r.status === 204 ? (undefined as T) : r.json();
}

/** Arma la query string descartando lo vacío, para no ensuciar la URL. */
export function query(p: Record<string, string | number | boolean | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const api = {
  // -- sesión ---------------------------------------------------------------
  async login(username: string, password: string): Promise<Sesion> {
    const s = await pedir<Sesion>('/api/sesion', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (s.token) guardarToken(s.token);
    return s;
  },

  sesion: () => pedir<Sesion>('/api/sesion'),

  salir() { guardarToken(null); },

  // -- catálogos ------------------------------------------------------------
  secciones: () => pedir<Seccion[]>('/api/secciones'),
  agencias: (soloHabilitadas = false) =>
    pedir<Agencia[]>(`/api/agencias${query({ habilitadas: soloHabilitadas })}`),
  permisos: () => pedir<Permiso[]>('/api/permisos'),
  usuarios: (todos = false) => pedir<Usuario[]>(`/api/usuarios${query({ todos })}`),

  // -- noticias -------------------------------------------------------------
  noticias: (p: Record<string, string | number | boolean | undefined>) =>
    pedir<Pagina<Noticia>>(`/api/noticias${query(p)}`),
  noticia: (id: number) => pedir<Noticia>(`/api/noticias/${id}`),
  misEliminadas: () => pedir<Version[]>('/api/mis-versiones-eliminadas'),

  // -- cables ---------------------------------------------------------------
  cables: (p: Record<string, string | number | boolean | undefined>) =>
    pedir<Pagina<Cable>>(`/api/cables${query(p)}`),
  cable: (id: number) => pedir<Cable>(`/api/cables/${id}`),
  reservas: (id: number) => pedir<Reserva[]>(`/api/cables/${id}/reservas`),
};

/**
 * Descarga un archivo de la API.
 *
 * No se puede usar un <a href> directo porque el token va en un header, no en
 * la URL: se baja con fetch y se entrega desde un blob. De paso, así una
 * descarga rechazada muestra el error en pantalla en vez de abrir una página
 * con un JSON de error.
 */
export async function descargar(ruta: string, nombrePorDefecto: string) {
  const token = leerToken();
  const r = await fetch(ruta, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

  if (!r.ok) {
    let mensaje = `Error ${r.status}`;
    try { mensaje = (await r.json())?.error ?? mensaje; } catch { /* no era JSON */ }
    if (r.status === 401) { guardarToken(null); escuchas.forEach((f) => f()); }
    throw new ErrorApi(r.status, mensaje);
  }

  // El nombre lo propone la API en content-disposition.
  const cd = r.headers.get('content-disposition') ?? '';
  const m = /filename="([^"]+)"/.exec(cd);
  const nombre = m?.[1] ?? nombrePorDefecto;

  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return {
    total: Number(r.headers.get('x-jsdr-total') ?? 0),
    exportadas: Number(r.headers.get('x-jsdr-exportadas') ?? 0),
  };
}
