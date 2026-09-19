import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * Token de sesión propio, sin dependencias.
 *
 * Formato:  base64url(payload JSON) + '.' + base64url(HMAC-SHA256)
 *
 * No es un JWT y no pretende serlo: no hay nada que negociar con terceros,
 * el único que firma y verifica es este servicio. El token lleva el username
 * y el vencimiento; todo lo demás se relee de la base en cada pedido, así que
 * un usuario deshabilitado deja de entrar sin esperar a que venza nada.
 */

export interface Carga {
  /** username */
  u: string;
  /** vencimiento, en segundos desde epoch */
  exp: number;
}

const b64url = (b: Buffer) => b.toString('base64url');

function firmar(datos: string): Buffer {
  return createHmac('sha256', config.secretoSesion).update(datos).digest();
}

export function emitirToken(username: string): { token: string; vence: string } {
  const exp = Math.floor(Date.now() / 1000) + config.horasSesion * 3600;
  const carga: Carga = { u: username, exp };
  const cuerpo = b64url(Buffer.from(JSON.stringify(carga), 'utf8'));
  return {
    token: `${cuerpo}.${b64url(firmar(cuerpo))}`,
    vence: new Date(exp * 1000).toISOString(),
  };
}

/** Devuelve la carga si el token es válido y no venció; si no, null. */
export function verificarToken(token: string | undefined): Carga | null {
  if (!token) return null;

  const corte = token.lastIndexOf('.');
  if (corte <= 0) return null;

  const cuerpo = token.slice(0, corte);
  const firmaDada = Buffer.from(token.slice(corte + 1), 'base64url');
  const firmaReal = firmar(cuerpo);

  // Comparación en tiempo constante. timingSafeEqual exige igual longitud.
  if (firmaDada.length !== firmaReal.length) return null;
  if (!timingSafeEqual(firmaDada, firmaReal)) return null;

  let carga: Carga;
  try {
    carga = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof carga?.u !== 'string' || typeof carga?.exp !== 'number') return null;
  if (carga.exp < Math.floor(Date.now() / 1000)) return null;

  return carga;
}

/** Saca el token del header Authorization: Bearer <token>. */
export function tokenDeCabecera(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const [esquema, valor] = authorization.split(' ');
  return esquema?.toLowerCase() === 'bearer' ? valor : undefined;
}
