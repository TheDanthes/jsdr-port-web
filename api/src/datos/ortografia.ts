/**
 * Revisión ortográfica con el diccionario de la redacción.
 *
 * El Swing (RevisorOrtografico, sobre la biblioteca Jazzy) no usaba un
 * diccionario de español estándar: volcaba la tabla `diccionario` a un
 * archivo (`spanish.txt`, 379 mil palabras en producción) y revisaba contra
 * eso. Es el diccionario que la redacción fue armando durante 20 años, con
 * los nombres propios y las palabras de la ciudad. Acá se carga la misma
 * tabla en memoria —unos 30 MB— y se revisa contra ella.
 *
 * El corrector del navegador (Chrome) sigue funcionando aparte, con otro
 * color: el de Chrome no conoce las palabras de la redacción, y éste no sabe
 * de gramática. Los dos juntos, como se acordó.
 */
import { consultar } from '../db.js';

let palabras: Set<string> | null = null;
let cargadoEn = 0;
let cargando: Promise<Set<string>> | null = null;

/**
 * Las palabras se releen de la base cada tanto: mientras el Swing siga en uso,
 * alguien puede agregar palabras desde su pantalla de administración.
 */
const RELEER_MS = 10 * 60_000;

function cargar(): Promise<Set<string>> {
  cargando ??= consultar<{ palabra: string }>('SELECT palabra FROM diccionario')
    .then((filas) => {
      palabras = new Set(filas.map((f) => f.palabra.normalize('NFC')));
      cargadoEn = Date.now();
      return palabras;
    })
    .finally(() => { cargando = null; });
  return cargando;
}

export function diccionario(): Promise<Set<string>> {
  if (!palabras) return cargar();
  // Vencido: se relee de fondo y mientras tanto se sigue con el que hay.
  if (Date.now() - cargadoEn > RELEER_MS) cargar().catch(() => { /* sigue el anterior */ });
  return Promise.resolve(palabras);
}

// --- qué se revisa ---------------------------------------------------------------

/**
 * FiltradorNoticia.filtrarParaRevisorOrtografico: el merge (∏) y los comandos
 * de campana (♫ seguido de una o dos letras de comando) no son texto. Se tapan
 * con espacios del mismo largo, para que las posiciones sigan coincidiendo con
 * las del editor.
 */
export function textoParaRevisar(texto: string): string {
  let r = '';
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]!;
    if (ch === '∏') { r += ' '; continue; }
    if (ch === '♫') {
      const sig = texto[i + 1];
      const largo = sig === undefined ? 1 : sig === 'a' || sig === 'x' ? 3 : 2;
      const tapa = Math.min(largo, texto.length - i);
      r += ' '.repeat(tapa);
      i += tapa - 1;
      continue;
    }
    r += ch;
  }
  // Los comandos de formato <...> tampoco son texto.
  return r.replace(/<[^<>\n]*>/g, (m) => ' '.repeat(m.length));
}

export interface ErrorOrtografico {
  /** Posiciones en el texto tal como está en el editor. */
  desde: number;
  hasta: number;
  palabra: string;
  sugerencias?: string[];
}

const PALABRA = /[\p{L}\p{N}]+/gu;
const TIENE_DIGITO = /\p{N}/u;
const ES_MAYUSCULA = (w: string) => w === w.toUpperCase() && w !== w.toLowerCase();

/**
 * ¿Está bien escrita? Como Jazzy con su configuración por defecto: no revisa
 * palabras con números ni las que están enteras en mayúsculas (siglas), y
 * acepta una palabra con mayúscula inicial si está en minúscula en el
 * diccionario (principio de oración).
 */
function correcta(dic: Set<string>, w: string): boolean {
  if (w.length < 2 || TIENE_DIGITO.test(w) || ES_MAYUSCULA(w)) return true;
  if (dic.has(w)) return true;
  const min = w.toLowerCase();
  // Al revés no: "rosario" en minúscula no vale porque esté "Rosario".
  return dic.has(min);
}

export async function revisar(texto: string, conSugerencias: boolean): Promise<ErrorOrtografico[]> {
  const dic = await diccionario();
  const limpio = textoParaRevisar(texto.normalize('NFC'));
  const errores: ErrorOrtografico[] = [];
  for (const m of limpio.matchAll(PALABRA)) {
    const w = m[0];
    if (correcta(dic, w)) continue;
    errores.push({ desde: m.index!, hasta: m.index! + w.length, palabra: w });
  }
  if (conSugerencias) {
    const cache = new Map<string, string[]>();
    for (const e of errores) {
      if (!cache.has(e.palabra)) cache.set(e.palabra, sugerir(dic, e.palabra));
      e.sugerencias = cache.get(e.palabra);
    }
  }
  return errores;
}

// --- sugerencias -------------------------------------------------------------------

const LETRAS = 'abcdefghijklmnñopqrstuvwxyzáéíóúü';
const sinAcentos = (w: string) => w.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Todo lo que está a una tecla de distancia: borrar, cambiar, agregar o invertir dos letras. */
function ediciones(w: string): string[] {
  const r: string[] = [];
  for (let i = 0; i <= w.length; i++) {
    const a = w.slice(0, i), b = w.slice(i);
    if (b) r.push(a + b.slice(1));
    if (b.length > 1) r.push(a + b[1] + b[0] + b.slice(2));
    for (const c of LETRAS) {
      if (b) r.push(a + c + b.slice(1));
      r.push(a + c + b);
    }
  }
  return r;
}

/**
 * Las palabras del diccionario más parecidas. Primero las que sólo difieren
 * en acentos ("medicion" → "medición"), después las que están a una tecla y,
 * si no hay ninguna, a dos (sólo en palabras cortas: el costo crece rápido).
 */
export function sugerir(dic: Set<string>, palabra: string, maximo = 8): string[] {
  const capital = palabra[0] !== palabra[0]!.toLowerCase();
  const w = palabra.toLowerCase();
  const vistos = new Set<string>();
  const conAcentos: string[] = [];
  const unaTecla: string[] = [];

  const probar = (c: string, destino: string[]) => {
    if (vistos.has(c) || c === w) return;
    vistos.add(c);
    const ok = dic.has(c) ? c : dic.has(c[0]!.toUpperCase() + c.slice(1)) ? c[0]!.toUpperCase() + c.slice(1) : null;
    if (ok) destino.push(ok);
  };

  for (const c of ediciones(w)) {
    probar(c, sinAcentos(c) === sinAcentos(w) ? conAcentos : unaTecla);
  }
  let r = [...conAcentos, ...unaTecla];
  if (r.length === 0 && w.length <= 10) {
    const dos: string[] = [];
    for (const c1 of ediciones(w)) {
      for (const c2 of ediciones(c1)) {
        probar(c2, dos);
        if (dos.length >= maximo) break;
      }
      if (dos.length >= maximo) break;
    }
    r = dos;
  }
  return r.slice(0, maximo).map((s) => (capital ? s[0]!.toUpperCase() + s.slice(1) : s));
}

// --- el caché, al día con lo que se cambia desde la administración -----------------

/** Lo agregado, corregido o borrado se refleja al instante en la revisión. */
export function actualizarCache(agregar: string[], quitar: string[] = []) {
  if (!palabras) return;          // todavía no se cargó: se cargará ya al día
  for (const q of quitar) palabras.delete(q.normalize('NFC'));
  for (const a of agregar) palabras.add(a.normalize('NFC'));
}
