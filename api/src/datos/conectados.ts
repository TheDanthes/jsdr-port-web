/**
 * Quién está usando la web, ahora: el "Monitor de Usuarios" del Swing, y la
 * regla de una sola sesión por usuario.
 *
 * El sistema viejo lo llevaba en memoria del servidor (un HashMap en
 * PostgresqlUsuarioDAO.usuariosLogueados): cada cliente avisaba que seguía
 * vivo una vez por minuto (notifyAlive) y el monitor pintaba en verde a los
 * que avisaron hace poco y en rojo a los que dejaron de avisar ("zombies":
 * se les colgó la PC o cerraron sin salir). Acá es lo mismo, también en
 * memoria y por el mismo motivo: no agrega tablas a una base que el Swing
 * sigue usando.
 *
 * Una sola sesión por usuario, como en el Swing ("El usuario ya se encuentra
 * logueado en el sistema"), pero con opción: la web pregunta "¿Deseás seguir
 * aquí?" y, si sí, la sesión anterior queda cerrada (revocada). El equipo
 * anterior se entera en su próximo pedido —como mucho, el latido del minuto—
 * y vuelve al login. Las noticias que tenía abiertas quedan "para recuperar"
 * desde su último autoguardado.
 *
 * Si la API se reinicia, el registro arranca vacío y se rearma solo con el
 * próximo latido de cada navegador (como mucho, un minuto). Para que una
 * sesión ya cerrada no "resucite" en ese momento, cuando aparecen dos del
 * mismo usuario gana la más nueva (la hora de login sale del token).
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

/** Por qué una sesión ya no vale. */
export interface Revocada {
  motivo: 'reemplazada' | 'salio';
  /** Desde dónde se volvió a entrar (para el aviso del equipo anterior). */
  ip: string | null;
  vence: number;
}

const conexiones = new Map<string, Conexion>();
const revocadas = new Map<string, Revocada>();

/** La clave de una sesión: un resumen del token (el token no se guarda). */
const clave = (token: string) => createHash('sha256').update(token).digest('base64url').slice(0, 22);

/** El token no lleva la hora de emisión, pero sí el vencimiento, que es siempre emisión + horasSesion. */
const inicioDe = (vence: number, ahora: number) => Math.min(ahora, vence - config.horasSesion * 3_600_000);

const viva = (c: Conexion, ahora: number) => ahora - c.ultima < VIDA_SIN_LATIDO_MS;

function revocar(k: string, r: Omit<Revocada, 'vence'>) {
  const c = conexiones.get(k);
  conexiones.delete(k);
  revocadas.set(k, { ...r, vence: c?.vence ?? Date.now() + config.horasSesion * 3_600_000 });
}

/** Si la sesión de este token fue cerrada (por otro login o por "Salir"). */
export function revocada(token: string): Revocada | null {
  const k = clave(token);
  const r = revocadas.get(k);
  if (!r) return null;
  if (r.vence <= Date.now()) { revocadas.delete(k); return null; }
  return r;
}

/**
 * Anota actividad de una sesión. Lo llama la guardia en cada pedido
 * autenticado, así que también cuentan la búsqueda, el editor, etc.; el
 * latido de la web es para el que está mirando una pantalla sin tocar nada.
 *
 * Devuelve false si la sesión ya no vale: fue cerrada, o es una que el
 * registro no conocía (la API se reinició) y el usuario ya entró después
 * desde otro lado.
 */
export function anotar(token: string, username: string, ip: string, expSeg: number): boolean {
  if (revocada(token)) return false;
  const k = clave(token);
  const ahora = Date.now();
  const c = conexiones.get(k);
  if (c) {
    c.ultima = ahora;
    c.ip = ip;
    return true;
  }
  const vence = expSeg * 1000;
  const inicio = inicioDe(vence, ahora);
  // Una sola por usuario: gana la de login más reciente.
  for (const [k2, otra] of conexiones) {
    if (otra.username !== username) continue;
    if (otra.inicio > inicio) {
      revocadas.set(k, { motivo: 'reemplazada', ip: otra.ip, vence });
      return false;
    }
    if (otra.inicio < inicio) revocar(k2, { motivo: 'reemplazada', ip });
  }
  conexiones.set(k, { username, ip, inicio, ultima: ahora, vence });
  return true;
}

/** La sesión viva del usuario, si tiene una (para preguntar "¿Deseás seguir aquí?"). */
export function sesionViva(username: string): { ip: string; inicio: string } | null {
  const ahora = Date.now();
  let mejor: Conexion | null = null;
  for (const c of conexiones.values()) {
    if (c.username === username && viva(c, ahora) && (!mejor || c.ultima > mejor.ultima)) mejor = c;
  }
  return mejor ? { ip: mejor.ip, inicio: new Date(mejor.inicio).toISOString() } : null;
}

/**
 * Login. Cierra todas las sesiones anteriores del usuario: las colgadas
 * (navegador cerrado sin "Salir") y, si se eligió "seguir aquí", la viva.
 * Devuelve si había una viva (para soltar sus noticias abiertas).
 */
export function entrar(token: string, username: string, ip: string, expSeg: number): boolean {
  const ahora = Date.now();
  let habiaViva = false;
  for (const [k, c] of conexiones) {
    if (c.username !== username) continue;
    if (viva(c, ahora)) habiaViva = true;
    revocar(k, { motivo: 'reemplazada', ip });
  }
  anotar(token, username, ip, expSeg);
  return habiaViva;
}

/** "Salir" (logout del Swing): la sesión deja de figurar y el token deja de valer. */
export function olvidar(token: string) {
  revocar(clave(token), { motivo: 'salio', ip: null });
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
      vivo: viva(c, ahora),
    });
  }
  for (const [k, r] of revocadas) if (r.vence <= ahora) revocadas.delete(k);
  return lista.sort((a, b) =>
    Number(b.vivo) - Number(a.vivo) || a.username.localeCompare(b.username) || a.inicio.localeCompare(b.inicio));
}

/** Para las pruebas. */
export const _vaciar = () => { conexiones.clear(); revocadas.clear(); };
