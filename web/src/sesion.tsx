import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { alPerderSesion, api, leerToken } from './api/cliente';
import type { Sesion } from './api/tipos';

interface Contexto {
  sesion: Sesion | null;
  cargando: boolean;
  entrar: (usuario: string, clave: string) => Promise<void>;
  salir: () => void;
}

const Ctx = createContext<Contexto | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [cargando, setCargando] = useState(true);

  // Al abrir, si hay token guardado se revalida contra la API: así un usuario
  // deshabilitado o un token vencido no entran aunque el navegador lo recuerde.
  useEffect(() => {
    let vivo = true;
    if (!leerToken()) { setCargando(false); return; }
    api.sesion()
      .then((s) => { if (vivo) setSesion(s); })
      .catch(() => { if (vivo) setSesion(null); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  // Cualquier 401 posterior devuelve al login sin pantallas rotas de por medio.
  useEffect(() => alPerderSesion(() => setSesion(null)), []);

  const entrar = useCallback(async (usuario: string, clave: string) => {
    setSesion(await api.login(usuario, clave));
  }, []);

  const salir = useCallback(() => { api.salir(); setSesion(null); }, []);

  const valor = useMemo(
    () => ({ sesion, cargando, entrar, salir }),
    [sesion, cargando, entrar, salir],
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
