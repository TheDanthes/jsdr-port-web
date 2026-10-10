import type { FastifyReply, FastifyRequest } from 'fastify';
import { tokenDeCabecera, verificarToken, type Carga } from './token.js';
import { cargarSesion, type SesionUsuario } from '../datos/sesion.js';
import { anotar, revocada } from '../datos/conectados.js';

/** La IP del pedido, sin el prefijo IPv6 de las direcciones IPv4 (::ffff:). */
export const ipDe = (req: FastifyRequest) => req.ip.replace(/^::ffff:/, '');

declare module 'fastify' {
  interface FastifyRequest {
    /** Sesión del usuario autenticado. La pone `exigirSesion`. */
    sesion: SesionUsuario;
  }
}

/** Lo que ve el equipo cuya sesión se cerró porque el usuario entró desde otro. */
export const mensajeReemplazada = (ip: string | null) =>
  `Tu sesión se cerró porque entraste desde otro equipo${ip ? ` (IP ${ip})` : ''}.`;

type Resultado =
  | { ok: true; token: string; carga: Carga; sesion: SesionUsuario }
  | { ok: false; cuerpo: { error: string; motivo?: string } };

/**
 * Valida el token del pedido: firma y vencimiento, que la sesión no se haya
 * cerrado (otro login o "Salir") y que el usuario siga habilitado. Si todo
 * va, anota la actividad para el monitor.
 */
export async function sesionDelPedido(req: FastifyRequest): Promise<Resultado> {
  const token = tokenDeCabecera(req.headers.authorization);
  const carga = verificarToken(token);
  if (!token || !carga) return { ok: false, cuerpo: { error: 'sesión inválida o vencida' } };

  const cerrada = revocada(token);
  if (cerrada) {
    return {
      ok: false,
      cuerpo: cerrada.motivo === 'reemplazada'
        ? { error: mensajeReemplazada(cerrada.ip), motivo: 'sesion_reemplazada' }
        : { error: 'La sesión se cerró.', motivo: 'sesion_cerrada' },
    };
  }

  const sesion = await cargarSesion(carga.u);
  if (!sesion) return { ok: false, cuerpo: { error: 'el usuario ya no está habilitado' } };

  // Monitor de usuarios: cualquier pedido cuenta como "sigue conectado".
  // Si no se puede anotar, es que el usuario ya entró después desde otro lado.
  if (!anotar(token, carga.u, ipDe(req), carga.exp)) {
    const r = revocada(token);
    return { ok: false, cuerpo: { error: mensajeReemplazada(r?.ip ?? null), motivo: 'sesion_reemplazada' } };
  }
  return { ok: true, token, carga, sesion };
}

/**
 * Exige una sesión válida y la deja en `req.sesion`.
 *
 * Relee el usuario de la base en cada pedido, en vez de confiar en lo que
 * diga el token: así, deshabilitar a alguien en el sistema viejo le corta el
 * acceso al nuevo de inmediato, sin esperar a que venza la sesión.
 */
export async function exigirSesion(req: FastifyRequest, rep: FastifyReply) {
  const r = await sesionDelPedido(req);
  if (!r.ok) return rep.code(401).send(r.cuerpo);
  req.sesion = r.sesion;
}
