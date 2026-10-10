import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { alDebeCambiarClave, alPerderSesion, api, ErrorApi, leerToken } from './api/cliente';
import type { Sesion } from './api/tipos';

interface Contexto {
  sesion: Sesion | null;
  cargando: boolean;
  /** Con `forzar`, cierra la sesión que el usuario tenga abierta en otro equipo. */
  entrar: (usuario: string, clave: string, forzar?: boolean) => Promise<void>;
  salir: () => void;
  /** Por qué se volvió al login sin que el usuario saliera (p. ej. entró desde otro equipo). */
  aviso: string | null;
  /** Vuelve a leer la sesión de la API (después de cambiar la contraseña). */
  refrescar: () => Promise<void>;
}

const Ctx = createContext<Contexto | null>(null);

/** Cada cuánto avisa la web que sigue abierta (notificacion.alive=60000 del Swing). */
const LATIDO_MS = 60_000;

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  // Al abrir, si hay token guardado se revalida contra la API: así un usuario
  // deshabilitado o un token vencido no entran aunque el navegador lo recuerde.
  useEffect(() => {
    let vivo = true;
    if (!leerToken()) { setCargando(false); return; }
    api.sesion()
      .then((s) => { if (vivo) setSesion(s); })
      .catch((e) => {
        if (!vivo) return;
        setSesion(null);
        if (e instanceof ErrorApi && e.motivo === 'sesion_reemplazada') setAviso(e.message);
      })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  // Cualquier 401 posterior devuelve al login sin pantallas rotas de por medio.
  // Si fue porque el usuario entró desde otro equipo, el login lo dice.
  useEffect(() => alPerderSesion((e) => {
    setSesion(null);
    setAviso(e.motivo === 'sesion_reemplazada' ? e.message : null);
  }), []);

  // "Sigo acá" una vez por minuto, aunque no se toque nada: es lo que el
  // Monitor de Usuarios pinta en verde (notifyAlive del Swing). De paso, a un
  // usuario deshabilitado lo devuelve al login en menos de un minuto.
  const conSesion = sesion !== null;
  useEffect(() => {
    if (!conSesion) return;
    const t = window.setInterval(() => { api.latidoSesion().catch(() => {}); }, LATIDO_MS);
    return () => window.clearInterval(t);
  }, [conSesion]);

  // Le blanquearon la contraseña con la sesión abierta: a la pantalla de cambio.
  useEffect(() => alDebeCambiarClave(() => setSesion((s) =>
    s && !s.usuario.debe_cambiar_password ? { ...s, usuario: { ...s.usuario, debe_cambiar_password: true } } : s)), []);

  const refrescar = useCallback(async () => { setSesion(await api.sesion()); }, []);

  const entrar = useCallback(async (usuario: string, clave: string, forzar = false) => {
    const s = await api.login(usuario, clave, forzar);
    setAviso(null);
    setSesion(s);
  }, []);

  const salir = useCallback(() => { api.salir(); setAviso(null); setSesion(null); }, []);

  const valor = useMemo(
    () => ({ sesion, cargando, entrar, salir, aviso, refrescar }),
    [sesion, cargando, entrar, salir, aviso, refrescar],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSesion() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSesion fuera del proveedor');
  return c;
}

/** La sesión ya establecida. Sólo para pantallas detrás del login. */
export function useUsuario() {
  const { sesion } = useSesion();
  if (!sesion) throw new Error('pantalla sin sesión');
  return sesion;
}
