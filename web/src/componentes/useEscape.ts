import { useEffect, useRef } from 'react';

/**
 * Escape cierra el diálogo aunque el foco haya quedado afuera (por ejemplo,
 * después de cerrar un mensaje encima). No actúa mientras hay otro diálogo
 * del editor abierto arriba: ese se cierra primero.
 */
export function useEscape(alEscape: () => void, otroDialogoAbierto: boolean) {
  const f = useRef(alEscape);
  f.current = alEscape;
  const otro = useRef(otroDialogoAbierto);
  otro.current = otroDialogoAbierto;
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !otro.current) { e.preventDefault(); f.current(); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);
}
