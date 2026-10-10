import type {
  AccionCierre, Agencia, AperturaEditor, Bloqueo, Cable, Comando, DatosEditor, ErrorOrtografico, MedicionNoticia,
  AgenciaAdmin, CatalogosUsuarios, SeccionAdmin, DatosUsuarioAdmin, InicioPermisosSeccion, MedidaCampo, UsuarioAdmin, MonitorUsuarios, Noticia, UsuarioDeSeccion, Pagina, PaginaPalabras, ParaRecuperar, Permiso, Reserva, ResultadoLista, Seccion, Sesion,
  Usuario, Version,
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
  constructor(
    readonly codigo: number, mensaje: string, readonly errores: string[] = [],
    /** Distingue casos con el mismo código (p. ej. 409 "abierta en otra ventana"). */
    readonly motivo: string | null = null,
    /** La respuesta entera, para los casos que traen datos aparte del mensaje. */
    readonly cuerpo: Record<string, unknown> | null = null,
  ) {
    super(mensaje);
  }
  /** La sesión venció o el usuario dejó de estar habilitado. */
  get esSesion() { return this.codigo === 401; }
}

/**
 * Se dispara cuando la API rechaza la sesión: la app vuelve al login. Recibe
 * el error, para avisar por qué (p. ej. "entraste desde otro equipo").
 */
type Escucha = (e: ErrorApi) => void;
const escuchas = new Set<Escucha>();
export const alPerderSesion = (f: Escucha) => {
  escuchas.add(f);
  return () => { escuchas.delete(f); };
};

/**
 * Se dispara cuando la API dice que primero hay que cambiar la contraseña
 * por defecto (por ejemplo, porque la blanquearon con la sesión abierta).
 */
const escuchasClave = new Set<() => void>();
export const alDebeCambiarClave = (f: () => void) => {
  escuchasClave.add(f);
  return () => { escuchasClave.delete(f); };
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
    let errores: string[] = [];
    let motivo: string | null = null;
    let cuerpo: Record<string, unknown> | null = null;
    try {
      cuerpo = await r.json();
      if (typeof cuerpo?.error === 'string') mensaje = cuerpo.error;
      if (typeof cuerpo?.motivo === 'string') motivo = cuerpo.motivo;
      if (Array.isArray(cuerpo?.errores)) {
        errores = cuerpo.errores.map((e: unknown) =>
          typeof e === 'string' ? e : (e as { mensaje?: string })?.mensaje ?? String(e));
      }
    } catch { /* la respuesta no era JSON */ }

    const error = new ErrorApi(r.status, mensaje, errores, motivo, cuerpo);
    if (r.status === 401) {
      guardarToken(null);
      escuchas.forEach((f) => f(error));
    }
    if (r.status === 403 && motivo === 'debe_cambiar_password') escuchasClave.forEach((f) => f());
    throw error;
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
  /**
   * Entrar. Si el usuario ya tiene una sesión abierta en otro equipo, la API
   * responde 409 `ya_logueado` (con `ip` y `desde`); con `forzar` la cierra.
   */
  async login(username: string, password: string, forzar = false): Promise<Sesion> {
    const s = await pedir<Sesion>('/api/sesion', {
      method: 'POST',
      body: JSON.stringify({ username, password, ...(forzar ? { forzar: true } : {}) }),
    });
    if (s.token) guardarToken(s.token);
    return s;
  },

  sesion: () => pedir<Sesion>('/api/sesion'),

  /**
   * Salir: la API deja de mostrar la sesión en el monitor y el navegador se
   * olvida del token. No espera la respuesta: salir no puede fallar.
   */
  salir() {
    const token = leerToken();
    if (token) {
      try {
        void fetch('/api/sesion', {
          method: 'DELETE', keepalive: true, headers: { authorization: `Bearer ${token}` },
        }).catch(() => {});
      } catch { /* sin red: igual sale */ }
    }
    guardarToken(null);
  },

  /**
   * Cambiar la contraseña propia. `actual` no hace falta cuando se está
   * cambiando la por defecto (obligatorio después de un alta o un blanqueo).
   */
  cambiarClave: (d: { actual?: string; nueva: string; repeticion: string }) =>
    pedir<{ ok: true; mensaje: string }>('/api/sesion/clave', { method: 'PUT', body: JSON.stringify(d) }),

  /** "Sigo acá", una vez por minuto (notifyAlive del Swing). */
  latidoSesion: () => pedir<void>('/api/sesion/latido', { method: 'POST' }),

  monitorUsuarios: () => pedir<MonitorUsuarios>('/api/monitor/usuarios'),

  // -- Administración → Secciones y Agencias ----------------------------------------
  admin: {
    secciones: () => pedir<SeccionAdmin[]>('/api/admin/secciones'),
    agencias: () => pedir<AgenciaAdmin[]>('/api/admin/agencias'),
    crear: (que: 'secciones' | 'agencias', d: object) =>
      pedir<{ id: number }>(`/api/admin/${que}`, { method: 'POST', body: JSON.stringify(d) }),
    actualizar: (que: 'secciones' | 'agencias', id: number, d: object) =>
      pedir<{ id: number }>(`/api/admin/${que}/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    eliminar: (que: 'secciones' | 'agencias', id: number) =>
      pedir<{ nombre: string }>(`/api/admin/${que}/${id}`, { method: 'DELETE' }),
  },

  // -- Administración → Usuarios ----------------------------------------------------
  usuariosAdmin: {
    catalogos: () => pedir<CatalogosUsuarios>('/api/admin/usuarios/catalogos'),
    buscar: (f: { username?: string; nombre?: string; nivel?: number }) =>
      pedir<UsuarioAdmin[]>(`/api/admin/usuarios${query(f)}`),
    crear: (d: DatosUsuarioAdmin) =>
      pedir<{ usuario: UsuarioAdmin; clave: string }>('/api/admin/usuarios', { method: 'POST', body: JSON.stringify(d) }),
    actualizar: (id: number, d: DatosUsuarioAdmin) =>
      pedir<{ usuario: UsuarioAdmin }>(`/api/admin/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    blanquear: (id: number) =>
      pedir<{ username: string; clave: string }>(`/api/admin/usuarios/${id}/blanquear`, { method: 'POST' }),
    eliminar: (id: number) =>
      pedir<{ username: string }>(`/api/admin/usuarios/${id}`, { method: 'DELETE' }),
  },

  // -- Administración → Permisos/Sección ------------------------------------------
  permisosSeccion: {
    iniciar: () => pedir<InicioPermisosSeccion>('/api/permisos-seccion'),
    usuarios: (seccion: number) => pedir<UsuarioDeSeccion[]>(`/api/permisos-seccion/${seccion}/usuarios`),
    actualizar: (seccion: number, usuario: number, permisos: number[]) =>
      pedir<{ permisos: number[]; agregados: number; quitados: number }>(
        `/api/permisos-seccion/${seccion}/usuarios/${usuario}`,
        { method: 'PUT', body: JSON.stringify({ permisos }) }),
  },

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

  // -- editor (Fase 3) ------------------------------------------------------
  editor: {
    nueva: () => pedir<AperturaEditor>('/api/editor/nueva', { method: 'POST' }),
    abrir: (id: number, forzar = false) =>
      pedir<AperturaEditor>(`/api/editor/${id}/abrir`, { method: 'POST', body: JSON.stringify({ forzar }) }),
    latido: (id: number, numero: number, apertura: string) =>
      pedir<{ ok: true }>(`/api/editor/${id}/${numero}/latido`, { method: 'POST', body: JSON.stringify({ apertura }) }),
    /**
     * Autoguardado al cerrar la pestaña del navegador: `keepalive` deja que el
     * pedido termine aunque la página ya no exista. No espera respuesta.
     */
    autoguardarAlSalir(id: number, numero: number, d: DatosEditor) {
      const token = leerToken();
      try {
        void fetch(`/api/editor/${id}/${numero}/temporal`, {
          method: 'PUT', keepalive: true, body: JSON.stringify(d),
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        }).catch(() => { /* la página se está yendo */ });
      } catch { /* keepalive tiene un tope de 64 KB: una nota enorme no entra */ }
    },
    paraRecuperar: () => pedir<ParaRecuperar[]>('/api/editor/para-recuperar'),
    ortografia: (texto: string, sugerencias = false) =>
      pedir<{ errores: ErrorOrtografico[] }>('/api/editor/ortografia', {
        method: 'POST', body: JSON.stringify({ texto, sugerencias }),
      }),
    agregarPalabra: (palabra: string) =>
      pedir<{ palabra: string }>('/api/diccionario', { method: 'POST', body: JSON.stringify({ palabra }) }),
    guardar: (id: number, numero: number, d: DatosEditor) =>
      pedir<{ guia: string }>(`/api/editor/${id}/${numero}`, { method: 'PUT', body: JSON.stringify(d) }),
    autoguardar: (id: number, numero: number, d: DatosEditor) =>
      pedir<{ ok: true }>(`/api/editor/${id}/${numero}/temporal`, { method: 'PUT', body: JSON.stringify(d) }),
    cerrar: (id: number, numero: number, accion: AccionCierre, d?: DatosEditor) =>
      pedir<{ cerrada: true }>(`/api/editor/${id}/${numero}/cerrar`, {
        method: 'POST', body: JSON.stringify({ accion, ...(d ?? {}) }),
      }),
    comandos: (seccion: number) => pedir<Comando[]>(`/api/editor/comandos${query({ seccion })}`),
    medir: (titular: string, cuerpo: string) =>
      pedir<MedicionNoticia>('/api/editor/medir', { method: 'POST', body: JSON.stringify({ titular, cuerpo }) }),
    medirCampo: (texto: string) =>
      pedir<MedidaCampo>('/api/editor/medir-campo', { method: 'POST', body: JSON.stringify({ texto }) }),
    medirAncho: (texto: string) =>
      pedir<{ medidas: { palabra: number; valor: string }[]; errores: { linea: number; mensaje: string }[] }>(
        '/api/editor/medir-ancho', { method: 'POST', body: JSON.stringify({ texto }) }),
  },
  bloqueo: (id: number) => pedir<Bloqueo>(`/api/noticias/${id}/bloqueo`),

  // -- administración ------------------------------------------------------
  diccionario: {
    buscar: (q: string, modo: 'empieza' | 'contiene', offset: number, limite: number) =>
      pedir<PaginaPalabras>(`/api/diccionario${query({ q, modo, offset, limite })}`),
    agregar: (palabra: string) =>
      pedir<{ palabra: string }>('/api/diccionario', { method: 'POST', body: JSON.stringify({ palabra }) }),
    agregarLista: (lista: string) =>
      pedir<ResultadoLista>('/api/diccionario', { method: 'POST', body: JSON.stringify({ lista }) }),
    corregir: (palabra: string, nueva: string) =>
      pedir<{ resultado: 'corregida' | 'unificada' | 'sin_cambios'; palabra: string }>(
        `/api/diccionario/${encodeURIComponent(palabra)}`, { method: 'PUT', body: JSON.stringify({ nueva }) }),
    eliminar: (palabra: string) =>
      pedir<{ palabra: string }>(`/api/diccionario/${encodeURIComponent(palabra)}`, { method: 'DELETE' }),
  },
  destrabar: (id: number, modo: 'guardar' | 'descartar') =>
    pedir<{ resultado: 'guardada' | 'borrada' | 'version_descartada' | 'destrabada' }>(
      `/api/noticias/${id}/destrabar`, { method: 'POST', body: JSON.stringify({ modo }) }),
  // -- flujo de la redacción (Fase 4) ----------------------------------------
  pasarDeNivel: (id: number, nivel: number) =>
    pedir<{ guia: string | null; estado: string; nivel: number; nivel_nombre: string; autorizada: boolean; visible: boolean }>(
      `/api/noticias/${id}/nivel`, { method: 'POST', body: JSON.stringify({ nivel }) }),
  eliminar: (id: number) =>
    pedir<{ guia: string | null; version_activa: number | null }>(`/api/noticias/${id}/eliminar`, { method: 'POST' }),
  restaurar: (id: number, numero: number) =>
    pedir<{ guia: string | null; version_activa: number }>(
      `/api/noticias/${id}/versiones/${numero}/restaurar`, { method: 'POST' }),
  cambiarConfidencialidad: (id: number) =>
    pedir<{ guia: string | null; confidencial: boolean; visible: boolean }>(
      `/api/noticias/${id}/confidencialidad`, { method: 'POST' }),

  fotocomponer: (id: number) =>
    pedir<{ archivo: string; carpeta: string; bytes: number; avisos: { linea: number; mensaje: string }[] }>(
      `/api/noticias/${id}/fotocomponer`, { method: 'POST' }),
};

/**
 * Descarga un archivo de la API.
 *
 * No se puede usar un <a href> directo porque el token va en un header, no en
 * la URL: se baja con fetch y se entrega desde un blob. De paso, así una
 * descarga rechazada muestra el error en pantalla en vez de abrir una página
 * con un JSON de error.
 */
export async function descargar(ruta: string, nombrePorDefecto: string, cuerpo?: unknown) {
  const token = leerToken();
  const r = await fetch(ruta, {
    // Con cuerpo, POST: es el caso de exportar lo que está en el editor, que
    // todavía no está guardado en ningún lado.
    ...(cuerpo !== undefined ? { method: 'POST', body: JSON.stringify(cuerpo) } : {}),
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}),
    },
  });

  if (!r.ok) {
    let mensaje = `Error ${r.status}`;
    let motivo: string | null = null;
    try {
      const c = await r.json();
      mensaje = c?.error ?? mensaje;
      if (typeof c?.motivo === 'string') motivo = c.motivo;
    } catch { /* no era JSON */ }
    const error = new ErrorApi(r.status, mensaje, [], motivo);
    if (r.status === 401) { guardarToken(null); escuchas.forEach((f) => f(error)); }
    throw error;
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
