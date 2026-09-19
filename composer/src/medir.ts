import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { aCp850, carpetaDeTrabajo, desdeCp850, ejecutar } from './motor.js';

export interface Aviso {
  /** Línea del texto de entrada, contada como la cuenta el motor. */
  linea: number;
  mensaje: string;
}

export interface Medida {
  cm: number | null;
  didots: number | null;
  /** El texto ya formateado por el motor (el `.frm`), en UTF-8. */
  formateado: string;
  errores: Aviso[];
  /** Crudo, por si hace falta ver exactamente qué dijo el motor. */
  salidaCruda: string;
  ms: number;
}

/**
 * El motor antepone a cada línea la ruta del archivo que midió:
 *
 *     /var/tmp/…/nota.medir(539): Atencion: La longitud es: 33.9 cm (900 didots)
 *     /var/tmp/…/nota.medir(45): Error: Caracter no imprimible
 *
 * La ruta es interna del servicio y no le sirve a nadie afuera, así que se
 * descarta y queda el número de línea, que es lo que el redactor necesita para
 * ir a corregir.
 */
const LINEA = /^.*?\((\d+)\):\s*(?:Error|Atencion):\s*(.*)$/;
const LONGITUD = /La longitud es:\s*([\d.]+)\s*cm\s*\((\d+)\s*didots\)/;

/** Saca la ruta interna de la carpeta de trabajo, que afuera no significa nada. */
function sinRuta(texto: string): string {
  return texto.replace(/^[^(\n]*\/nota\.medir\(/gm, '(');
}

function parsear(texto: string): Aviso[] {
  return texto
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() !== '')
    .map((l) => {
      const m = LINEA.exec(l);
      if (!m) return { linea: 0, mensaje: l.trim() };
      return { linea: Number(m[1]), mensaje: (m[2] ?? '').trim() };
    });
}

/**
 * Mide un texto: cuánto ocupa en la página y qué problemas tipográficos tiene.
 *
 * El texto entra en UTF-8 y se escribe en cp850, una palabra por línea, que es
 * el formato que el cliente Swing le dejaba al motor.
 */
export async function medir(texto: string): Promise<Medida> {
  const { ruta, borrar } = await carpetaDeTrabajo();
  try {
    const entrada = join(ruta, 'nota.medir');
    await writeFile(entrada, aCp850(texto));

    const corrida = await ejecutar('medir', ['-f', entrada], ruta);

    if (corrida.colgado) {
      // Pasa de verdad: ver config.topeMotorMs y pruebas/cuelga/.
      throw Object.assign(
        new Error('El motor no terminó dentro del tiempo permitido y se lo cortó.'),
        { codigo: 'MOTOR_COLGADO' },
      );
    }

    const salida = desdeCp850(corrida.salida);
    const errores = parsear(desdeCp850(corrida.errores));

    const largo = LONGITUD.exec(salida);
    let formateado = '';
    try {
      formateado = desdeCp850(await readFile(join(ruta, 'nota.frm')));
    } catch {
      // Si el texto no llegó a formatearse, el .frm no existe. No es fatal.
    }

    return {
      cm: largo ? Number(largo[1]) : null,
      didots: largo ? Number(largo[2]) : null,
      formateado,
      errores,
      salidaCruda: sinRuta(salida).trim(),
      ms: corrida.ms,
    };
  } finally {
    await borrar();
  }
}
