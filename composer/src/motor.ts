import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import iconv from 'iconv-lite';

import { config } from './config.js';

/**
 * Variables de entorno del motor.
 *
 * Copiadas de `medir.sh` y `fotocomponer.sh` del servidor de producción. Las
 * barras finales no son adorno: el motor concatena sin agregar separador, y
 * sin ellas busca las fuentes en el directorio de al lado.
 */
export function entornoMotor(): NodeJS.ProcessEnv {
  const raiz = config.motor;
  return {
    PATH: process.env.PATH,
    SDR_ROOT: raiz,
    SDR_EXCEP_PPAL: `${raiz}/excepciones/`,
    SDR_FONTS: `${raiz}/fonts/`,
    SDR_FUENT_PPAL: `${raiz}/fonts/`,
    SDR_UFRM: `${raiz}/formatos/`,
    SDR_ESTIL_PPAL: `${raiz}/estilos/`,
    SDR_TMP: '/tmp/',
  };
}

/**
 * El motor trabaja entero en cp850.
 *
 * Es el charset de la cadena original de punta a punta: la base vieja guarda
 * bytes cp850, el cliente Swing los mandaba así y las tablas de métricas de
 * `medir` están indexadas por esos bytes. La web y la API nueva trabajan en
 * UTF-8, así que la conversión ocurre acá y sólo acá: en el borde.
 *
 * `translit` para que un carácter que no existe en cp850 —una comilla
 * tipográfica pegada desde Word, un guión largo— entre como su equivalente
 * ASCII en lugar de convertirse en basura.
 */
export function aCp850(texto: string): Buffer {
  return iconv.encode(texto, 'cp850', { addBOM: false });
}

export function desdeCp850(bytes: Buffer): string {
  return iconv.decode(bytes, 'cp850');
}

// --- cola --------------------------------------------------------------------
// Semáforo de andar por casa: sin dependencias y suficiente para cuatro
// procesos. Lo que importa es que en el cierre no se disparen 80 `medir` a la
// vez sobre un contenedor con dos núcleos.
let enCurso = 0;
const esperando: Array<() => void> = [];

async function conTurno<T>(tarea: () => Promise<T>): Promise<T> {
  if (enCurso >= config.concurrencia) {
    await new Promise<void>((seguir) => esperando.push(seguir));
  }
  enCurso++;
  try {
    return await tarea();
  } finally {
    enCurso--;
    const siguiente = esperando.shift();
    if (siguiente) siguiente();
  }
}

export interface Corrida {
  salida: Buffer;
  errores: Buffer;
  codigo: number | null;
  /** true si se cortó por tiempo: el motor quedó colgado y hubo que matarlo. */
  colgado: boolean;
  ms: number;
}

/**
 * Corre un binario del motor con tope de tiempo.
 *
 * El código de salida NO indica error: `medir` devuelve la cantidad de avisos
 * que encontró. Lo que vale es la salida.
 */
export function ejecutar(
  binario: string,
  argumentos: string[],
  cwd: string,
): Promise<Corrida> {
  return conTurno(
    () =>
      new Promise<Corrida>((resolver) => {
        const empezo = Date.now();
        const hijo = execFile(
          join(config.motor, 'bin', binario),
          argumentos,
          {
            cwd,
            env: entornoMotor(),
            timeout: config.topeMotorMs,
            killSignal: 'SIGKILL', // SIGTERM no saca a un binario de 2005 de un bucle
            encoding: 'buffer',
            maxBuffer: 16 * 1024 * 1024,
          },
          (error, stdout, stderr) => {
            const conCodigo = error as (Error & { code?: number | string; killed?: boolean }) | null;
            resolver({
              salida: stdout,
              errores: stderr,
              codigo: typeof conCodigo?.code === 'number' ? conCodigo.code : 0,
              colgado: conCodigo?.killed === true,
              ms: Date.now() - empezo,
            });
          },
        );
        hijo.on('error', () => {
          /* lo reporta el callback */
        });
      }),
  );
}

/**
 * Carpeta de trabajo de una corrida, con nombre sin puntos (ver config.trabajo).
 * `mkdtemp` agrega sufijo aleatorio, no punto.
 */
export async function carpetaDeTrabajo(): Promise<{ ruta: string; borrar: () => Promise<void> }> {
  await mkdir(config.trabajo, { recursive: true });
  const ruta = await mkdtemp(join(config.trabajo, 'corrida-'));
  return { ruta, borrar: () => rm(ruta, { recursive: true, force: true }) };
}
