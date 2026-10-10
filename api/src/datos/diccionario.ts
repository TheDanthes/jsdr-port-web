/**
 * Administración del diccionario de la redacción (Administración → Diccionario).
 *
 * Port de AdministradorDiccionarioJPanel / AdministradorDiccionarioBean, con lo
 * que la redacción pidió de más: buscar también "contiene", con páginas (el
 * Swing traía las primeras 100 que empezaran con lo buscado y nada más),
 * corregir una palabra mal cargada y agregar una lista de una vez.
 *
 * Mismos mensajes que el Swing donde existían. Todo lo que cambia se refleja
 * al instante en la revisión ortográfica (el caché de ortografia.ts).
 */
import { consultar, transaccion } from '../db.js';
import { config } from '../config.js';
import { ErrorEditor } from './edicion.js';
import { actualizarCache, diccionario } from './ortografia.js';

export const MENSAJES_DICCIONARIO = {
  sinPermiso: 'No tiene permiso para administrar el diccionario',
  existente: 'La palabra ya existe en el diccionario',
  inexistente: 'La palabra no está en el diccionario',
  invalida: 'La palabra sólo puede tener letras, sin espacios (hasta 30).',
} as const;

/** `diccionario.palabra` es varchar(30). Sólo letras: es lo único que la revisión compara. */
const PALABRA_VALIDA = /^\p{L}{1,30}$/u;

export function normalizar(p: unknown): string | null {
  if (typeof p !== 'string') return null;
  const w = p.normalize('NFC').trim();
  return PALABRA_VALIDA.test(w) ? w : null;
}

/** Los comodines de LIKE escritos por el usuario se buscan literales. */
const escaparLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export type ModoBusqueda = 'empieza' | 'contiene';

/**
 * Buscar palabras. Como el Swing, sin distinguir mayúsculas (ILIKE); con
 * páginas y conteo acotado como el buscador de noticias.
 */
export async function buscarPalabras(q: string, modo: ModoBusqueda, offset: number, limite: number) {
  const texto = q.normalize('NFC').trim();
  const patron = texto === '' ? '%' : modo === 'contiene' ? `%${escaparLike(texto)}%` : `${escaparLike(texto)}%`;
  const tope = config.topeConteo;
  const [{ n }] = await consultar<{ n: number }>(
    `SELECT count(*)::int AS n FROM (SELECT 1 FROM diccionario WHERE palabra ILIKE $1 LIMIT ${tope + 1}) t`,
    [patron],
  ) as [{ n: number }];
  const filas = await consultar<{ palabra: string }>(
    `SELECT palabra FROM diccionario WHERE palabra ILIKE $1
      ORDER BY palabra LIMIT $2 OFFSET $3`,
    [patron, limite + 1, offset],
  );
  const hay_mas = filas.length > limite;
  if (hay_mas) filas.pop();
  const dic = await diccionario().catch(() => null);
  return {
    items: filas.map((f) => f.palabra),
    total: Math.min(n, tope),
    total_exacto: n <= tope,
    hay_mas, offset, limite,
    /** Cuántas palabras tiene el diccionario entero. */
    en_total: dic?.size ?? null,
  };
}

/** AdministradorDiccionario.agregarPalabra: una sola, con el "ya existe" del Swing. */
export async function agregarPalabra(palabra: unknown) {
  const p = normalizar(palabra);
  if (!p) throw new ErrorEditor(400, MENSAJES_DICCIONARIO.invalida);
  const r = await transaccion((c) =>
    c.query('INSERT INTO diccionario (palabra) VALUES ($1) ON CONFLICT DO NOTHING', [p]));
  if (r.rowCount === 0) throw new ErrorEditor(409, MENSAJES_DICCIONARIO.existente, undefined, 'existente');
  actualizarCache([p]);
  return { palabra: p };
}

/**
 * Agregar una lista pegada de una vez (separada por líneas, espacios, comas
 * o punto y coma). Devuelve qué entró, qué ya estaba y qué no es una palabra.
 */
export async function agregarLista(texto: unknown) {
  if (typeof texto !== 'string') throw new ErrorEditor(400, 'Falta la lista de palabras.');
  const crudas = [...new Set(texto.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
  if (crudas.length > 5000) throw new ErrorEditor(413, 'Son demasiadas palabras de una vez (hasta 5000).');
  const validas: string[] = [];
  const invalidas: string[] = [];
  for (const x of crudas) {
    const p = normalizar(x);
    if (p) validas.push(p); else invalidas.push(x);
  }
  const agregadas = validas.length === 0 ? [] : await transaccion(async (c) => {
    const r = await c.query<{ palabra: string }>(
      `INSERT INTO diccionario (palabra) SELECT unnest($1::text[])
       ON CONFLICT DO NOTHING RETURNING palabra`,
      [validas],
    );
    return r.rows.map((f) => f.palabra);
  });
  actualizarCache(agregadas);
  const nuevas = new Set(agregadas);
  return {
    agregadas,
    ya_estaban: validas.filter((p) => !nuevas.has(p)),
    invalidas,
  };
}

/**
 * Corregir una palabra mal cargada. Si la corrección ya estaba en el
 * diccionario, la mal escrita simplemente se borra.
 */
export async function corregirPalabra(vieja: string, nueva: unknown) {
  const n = normalizar(nueva);
  if (!n) throw new ErrorEditor(400, MENSAJES_DICCIONARIO.invalida);
  const resultado = await transaccion(async (c) => {
    const existe = await c.query('SELECT 1 FROM diccionario WHERE palabra = $1 FOR UPDATE', [vieja]);
    if (existe.rowCount === 0) throw new ErrorEditor(404, MENSAJES_DICCIONARIO.inexistente);
    if (n === vieja) return 'sin_cambios' as const;
    const ya = await c.query('SELECT 1 FROM diccionario WHERE palabra = $1', [n]);
    if (ya.rowCount) {
      await c.query('DELETE FROM diccionario WHERE palabra = $1', [vieja]);
      return 'unificada' as const;
    }
    await c.query('UPDATE diccionario SET palabra = $1 WHERE palabra = $2', [n, vieja]);
    return 'corregida' as const;
  });
  if (resultado !== 'sin_cambios') actualizarCache([n], [vieja]);
  return { resultado, palabra: n };
}

/** AdministradorDiccionario.eliminarPalabra. */
export async function eliminarPalabra(palabra: string) {
  const r = await transaccion((c) => c.query('DELETE FROM diccionario WHERE palabra = $1', [palabra]));
  if (r.rowCount === 0) throw new ErrorEditor(404, MENSAJES_DICCIONARIO.inexistente);
  actualizarCache([], [palabra]);
  return { palabra };
}
