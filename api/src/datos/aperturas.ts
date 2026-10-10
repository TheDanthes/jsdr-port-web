/**
 * Quién tiene abierta cada noticia, ahora.
 *
 * El sistema viejo no lo sabía: una noticia EN_EDICION con su fila en
 * `versiones_tmp` podía estar abierta en una PC o abandonada porque esa PC se
 * colgó, y no había forma de distinguirlo. Por eso el Swing ofrecía restaurar
 * las temporales recién al volver a entrar.
 *
 * Acá cada ventana del editor "late" una vez por minuto (con el autoguardado o
 * con un latido vacío). Una noticia EN_EDICION que no latió en los últimos
 * minutos quedó abandonada: se marca "para recuperar".
 *
 * Vive en memoria y a propósito: no agrega columnas a una base que el sistema
 * viejo sigue usando. Si la API se reinicia, el registro arranca vacío y se
 * rearma solo con el primer latido de cada ventana (como mucho, un minuto).
 *
 * Cada apertura tiene un identificador propio. Si la misma noticia se abre en
 * otra ventana (el redactor cerró el navegador y volvió a entrar enseguida),
 * la ventana vieja deja de poder guardar: así nunca hay dos ventanas pisándose
 * el mismo texto.
 */
import { randomUUID } from 'node:crypto';

/**
 * Sin latidos durante este tiempo, la ventana se da por cerrada. La web late
 * cada minuto: tres minutos de margen cubren una red lenta o una PC ocupada.
 * (JSDR_VIDA_SIN_LATIDO_SEG existe para las pruebas.)
 */
export const VIDA_SIN_LATIDO_MS = (Number(process.env.JSDR_VIDA_SIN_LATIDO_SEG) || 180) * 1000;

interface Apertura {
  numero: number;
  usuario: string;
  apertura: string;
  latido: number;
  /** Último autoguardado recibido (para mostrar "recuperado de las 18:42"). */
  autoguardado: number | null;
}

const abiertas = new Map<number, Apertura>();
/** Hora del último autoguardado de cada noticia, aunque la ventana ya no esté. */
const ultimosAutoguardados = new Map<number, number>();

export class AperturaVencida extends Error {
  readonly statusCode = 409;
  readonly motivo = 'otra_ventana';
  constructor() {
    super('La noticia se abrió en otra ventana: esta ya no puede guardarla.');
  }
}

/** Registra una apertura nueva y devuelve su identificador. */
export function abrir(id: number, numero: number, usuario: string): string {
  const apertura = randomUUID();
  abiertas.set(id, { numero, usuario, apertura, latido: Date.now(), autoguardado: null });
  return apertura;
}

/**
 * Una ventana da señales de vida. Si la noticia no figura (la API se
 * reinició), se la adopta. Si figura con OTRA apertura, esta ventana quedó
 * desplazada por una más nueva.
 */
export function latir(id: number, numero: number, usuario: string, apertura: unknown, autoguardo = false) {
  const a = abiertas.get(id);
  const ahora = Date.now();
  if (autoguardo) ultimosAutoguardados.set(id, ahora);
  if (!a) {
    if (typeof apertura !== 'string' || !apertura) return;
    abiertas.set(id, { numero, usuario, apertura, latido: ahora, autoguardado: autoguardo ? ahora : null });
    return;
  }
  // Pedidos sin identificador (clientes viejos o el script de pruebas): se
  // aceptan mientras sean del mismo usuario; el control de reglas ya lo hizo
  // la base. Sólo una apertura distinta y explícita queda afuera.
  if (a.usuario !== usuario) throw new AperturaVencida();
  if (typeof apertura === 'string' && apertura && apertura !== a.apertura) throw new AperturaVencida();
  a.latido = ahora;
  a.numero = numero;
  if (autoguardo) a.autoguardado = ahora;
}

export const registrada = (id: number) => abiertas.has(id);

export function cerrar(id: number) {
  abiertas.delete(id);
  ultimosAutoguardados.delete(id);
}

/** ¿Hay una ventana viva con esta noticia abierta? */
export function viva(id: number): boolean {
  const a = abiertas.get(id);
  return !!a && Date.now() - a.latido < VIDA_SIN_LATIDO_MS;
}

export function quien(id: number): string | null {
  return viva(id) ? abiertas.get(id)!.usuario : null;
}

export function ultimoAutoguardado(id: number): string | null {
  const t = ultimosAutoguardados.get(id);
  return t ? new Date(t).toISOString() : null;
}
