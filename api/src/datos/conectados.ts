/**
 * Quién está usando la web, ahora: el "Monitor de Usuarios" del Swing.
 *
 * El sistema viejo lo llevaba en memoria del servidor (un HashMap en
 * PostgresqlUsuarioDAO.usuariosLogueados): cada cliente avisaba que seguía
 * vivo una vez por minuto (notifyAlive) y el monitor pintaba en verde a los
 * que avisaron hace poco y en rojo a los que dejaron de avisar ("zombies":
 * se les colgó la PC o cerraron sin salir). Acá es lo mismo, también en
 * memoria y por el mismo motivo: no agrega tablas a una base que el Swing
 * sigue usando.
 *
 * Una diferencia: el Swing tenía una fila por usuario porque no dejaba entrar
 * dos veces al mismo. La web sí lo deja (dos pestañas, dos PCs), así que hay
 * una fila por sesión: cada login es una sesión distinta.
 *
 * Si la API se reinicia el registro arranca vacío y se rearma solo con el
 * próximo latido de cada navegador (como mucho, un minuto). Lo que se pierde
 * es la hora exacta de cada pedido; la de inicio de sesión se recalcula del
 * vencimiento del token.
 */
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { VIDA_SIN_LATIDO_MS } from './aperturas.js';

interface Conexion {
  username: string;
  ip: string;
  /** Inicio de la sesión (login), en ms. */
  inicio: number;
  /** Último pedido o latido, en ms. */
  ultima: number;
  /** Vencimiento del token, en ms: después de eso la sesión ya no existe. */
  vence: number;
}

const conexiones = new Map<string, Conexion>();

/** La clave de una sesión: un resumen del token (el token no se guarda). */
const clave = (token: string) => createHash('sha256').update(token).digest('base64url').slice(0, 22);

/**
 * Anota actividad de una sesión. Lo llama la guardia en cada pedido
 * autenticado, así que también cuentan la búsqueda, el editor, etc.; el
 * latido de la web es para el que está mirando una pantalla sin tocar nada.
 */
export function anotar(token: string, username: string, ip: string, expSeg: number) {
  const k = clave(token);
  const ahora = Date.now();
  const c = conexiones.get(k);
  if (c) {
    c.ultima = ahora;
    c.ip = ip;
    return;
  }
  const vence = expSeg * 1000;
  // El token no lleva la hora de emisión, pero sí el vencimiento, que es
  // siempre emisión + horasSesion.
  const inicio = Math.min(ahora, vence - config.horasSesion * 3_600_000);
  conexiones.set(k, { username, ip, inicio, ultima: ahora, vence });
}

/**
 * Login. Las sesiones anteriores del mismo usuario que ya no dan señales se
 * descartan: quedaron de un navegador cerrado sin "Salir" y el que vuelve a
 * entrar es el mismo. Es lo que hacía el Swing, que tenía una sola fila por
 * usuario y la reemplazaba en cada login. Las que siguen vivas (otra pestaña,
 * otra PC) quedan.
 */
export function entrar(token: string, username: string, ip: string, expSeg: number) {
  const ahora = Date.now();
  for (const [k, c] of conexiones) {
    if (c.username === username && ahora - c.ultima >= VIDA_SIN_LATIDO_MS) conexiones.delete(k);
  }
  anotar(token, username, ip, expSeg);
}

/** "Salir": la sesión deja de figurar (logout del Swing). */
export function olvidar(token: string) {
  conexiones.delete(clave(token));
}

export interface UsuarioEnSesion {
  username: string;
  ip: string;
  inicio: string;
  ultima: string;
  /** Avisó hace poco (verde en el Swing); si no, quedó colgado (rojo). */
  vivo: boolean;
}

/**
 * Las sesiones abiertas: las vivas primero, y dentro de cada grupo por
 * usuario. Las de token vencido ya no cuentan y se descartan.
 */
export function enSesion(): UsuarioEnSesion[] {
  const ahora = Date.now();
  const lista: UsuarioEnSesion[] = [];
  for (const [k, c] of conexiones) {
    if (c.vence <= ahora) { conexiones.delete(k); continue; }
    lista.push({
      username: c.username,
      ip: c.ip,
      inicio: new Date(c.inicio).toISOString(),
      ultima: new Date(c.ultima).toISOString(),
      vivo: ahora - c.ultima < VIDA_SIN_LATIDO_MS,
    });
  }
  return lista.sort((a, b) =>
    Number(b.vivo) - Number(a.vivo) || a.username.localeCompare(b.username) || a.inicio.localeCompare(b.inicio));
}

/** Para las pruebas. */
export const _vaciar = () => conexiones.clear();
