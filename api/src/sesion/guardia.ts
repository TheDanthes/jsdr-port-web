import type { FastifyReply, FastifyRequest } from 'fastify';
import { tokenDeCabecera, verificarToken } from './token.js';
import { cargarSesion, type SesionUsuario } from '../datos/sesion.js';
import { anotar } from '../datos/conectados.js';

/** La IP del pedido, sin el prefijo IPv6 de las direcciones IPv4 (::ffff:). */
export const ipDe = (req: FastifyRequest) => req.ip.replace(/^::ffff:/, '');

declare module 'fastify' {
  interface FastifyRequest {
    /** Sesión del usuario autenticado. La pone `exigirSesion`. */
    sesion: SesionUsuario;
  }
}

/**
 * Exige una sesión válida y la deja en `req.sesion`.
 *
 * Relee el usuario de la base en cada pedido, en vez de confiar en lo que
 * diga el token: así, deshabilitar a alguien en el sistema viejo le corta el
 * acceso al nuevo de inmediato, sin esperar a que venza la sesión.
 */
export async function exigirSesion(req: FastifyRequest, rep: FastifyReply) {
  const token = tokenDeCabecera(req.headers.authorization);
  const carga = verificarToken(token);
  if (!carga) {
    return rep.code(401).send({ error: 'sesión inválida o vencida' });
  }

  const sesion = await cargarSesion(carga.u);
  if (!sesion) {
    return rep.code(401).send({ error: 'el usuario ya no está habilitado' });
  }

  req.sesion = sesion;
  // Monitor de usuarios: cualquier pedido cuenta como "sigue conectado".
  anotar(token!, carga.u, ipDe(req), carga.exp);
}
