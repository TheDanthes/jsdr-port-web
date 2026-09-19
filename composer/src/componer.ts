import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from './config.js';
import { aCp850, carpetaDeTrabajo, desdeCp850, ejecutar, entornoMotor } from './motor.js';

export interface Composicion {
  /** Ruta final del .txt que levanta InDesign. */
  archivo: string;
  carpeta: string;
  bytes: number;
  ms: number;
}

/**
 * Carpeta de salida de una sección.
 *
 * Sale de `secciones.json`, que reemplaza el bloque SWITCH que `mac.pl` tenía
 * escrito adentro: agregar una sección era editar Perl en el servidor.
 */
export function carpetaDeSeccion(seccion: string): string {
  const codigo = config.secciones.alias[seccion] ?? seccion;
  return config.secciones.mapa[codigo] ?? config.secciones.default;
}

/**
 * Las cuatro sustituciones de `mac.pl`, sobre los bytes del `.xtg`.
 *
 * Se trabaja en latin1 (un byte, un carácter) y no en UTF-8 a propósito: el
 * `.xtg` está en cp850 y estas sustituciones son todas ASCII. Decodificar y
 * volver a codificar no aportaría nada y sí podría alterar un byte.
 *
 * El original, textual:
 *
 *     $output =~ s/\@Normal:\@Normal:/\@Normal:/g;
 *     $output =~ s/^\@Normal://g;
 *     $output =~ s/\@Normal:/\n/g;
 *     $output =~ s/<\\b>/\n/g;
 *
 * `s/^@Normal://g` va SIN /m, así que ese `^` es el principio del texto entero,
 * no el de cada línea. Reproducido igual acá; parece un detalle y decide si la
 * primera línea del material sale con la etiqueta pegada o no.
 */
export function transformarComoMacPl(xtg: Buffer): Buffer {
  // `while (<>) { chomp; $input .= $_ . "\n" }`: normaliza el final del
  // archivo, garantizando un \n al cierre aunque la última línea no lo tenga.
  let texto = xtg.toString('latin1');
  const lineas = texto.split('\n');
  if (lineas.length > 0 && lineas[lineas.length - 1] === '') lineas.pop();
  texto = lineas.length > 0 ? lineas.join('\n') + '\n' : '';

  texto = texto.replaceAll('@Normal:@Normal:', '@Normal:');
  if (texto.startsWith('@Normal:')) texto = texto.slice('@Normal:'.length);
  texto = texto.replaceAll('@Normal:', '\n');
  texto = texto.replaceAll('<\\b>', '\n');

  // `$\ = "\015"`: el separador de registro de salida de mac.pl. Cada print
  // termina en CR, así que el texto entra al conversor con un CR al final.
  return Buffer.from(texto + '\r', 'latin1');
}

/** Pasa el texto por `xtg2ind.pl`, sin tocar el script. */
function porXtg2ind(entrada: Buffer): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    const perl = spawn('perl', [join(config.motor, 'bin', 'xtg2ind.pl')], {
      env: entornoMotor(),
    });
    const trozos: Buffer[] = [];
    const ruido: Buffer[] = [];
    perl.stdout.on('data', (d: Buffer) => trozos.push(d));
    perl.stderr.on('data', (d: Buffer) => ruido.push(d));
    perl.on('error', rechazar);
    perl.on('close', (codigo) => {
      if (codigo !== 0) {
        rechazar(new Error(`xtg2ind.pl terminó con ${codigo}: ${Buffer.concat(ruido).toString()}`));
        return;
      }
      resolver(Buffer.concat(trozos));
    });
    perl.stdin.end(entrada);
  });
}

/**
 * Fotocompone una noticia y deja el archivo donde InDesign lo busca.
 *
 * Es la cadena completa del sistema viejo, con la cola CUPS afuera:
 *
 *     texto --> sr2xp --> .xtg --> (mac.pl) --> xtg2ind.pl --> <guia>.txt
 *
 * Antes, el paso del medio lo disparaba `lp -d MAC_NUE`, cuya única función
 * era llamar a `mac.pl`. Acá se llama directo: una cola de impresión menos
 * que mantener, y el error se ve en el momento en lugar de terminar en
 * /tmp/error_mac_pl.
 */
export async function componer(
  texto: string,
  guia: string,
  seccion: string,
): Promise<Composicion> {
  const empezo = Date.now();
  const { ruta, borrar } = await carpetaDeTrabajo();
  try {
    const entrada = join(ruta, 'nota.sr2xp');
    await writeFile(entrada, aCp850(texto));

    const corrida = await ejecutar('sr2xp', [entrada], ruta);
    if (corrida.colgado) {
      throw Object.assign(new Error('sr2xp no terminó dentro del tiempo permitido.'), {
        codigo: 'MOTOR_COLGADO',
      });
    }

    let xtg: Buffer;
    try {
      xtg = await readFile(join(ruta, 'nota.xtg'));
    } catch {
      throw Object.assign(
        new Error(
          `sr2xp no generó el .xtg. Salida del motor: ${desdeCp850(corrida.errores).trim() || '(vacía)'}`,
        ),
        { codigo: 'SIN_XTG' },
      );
    }

    const paraIndesign = await porXtg2ind(transformarComoMacPl(xtg));

    const carpeta = carpetaDeSeccion(seccion);
    const destino = join(config.salidaIndesign, carpeta);
    await mkdir(destino, { recursive: true });

    // Se escribe al lado y se renombra: InDesign puede estar mirando la
    // carpeta, y un rename es atómico. Nadie levanta un archivo a medio
    // escribir.
    const final = join(destino, `${guia}.txt`);
    const parcial = join(destino, `${guia}-parcial`);
    await writeFile(parcial, paraIndesign);
    await chmod(parcial, 0o666); // como el `chmod 0666, $filesal` del original
    await rename(parcial, final);

    return { archivo: final, carpeta, bytes: paraIndesign.length, ms: Date.now() - empezo };
  } finally {
    await borrar();
  }
}
