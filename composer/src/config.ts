import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
/** La raíz del proyecto: `dist/` en producción, `src/` con tsx. */
const raiz = join(aqui, '..');

interface Secciones {
  default: string;
  alias: Record<string, string>;
  mapa: Record<string, string>;
}

function cargarSecciones(): Secciones {
  const ruta = process.env.JSDR_SECCIONES ?? join(raiz, 'secciones.json');
  const crudo = JSON.parse(readFileSync(ruta, 'utf8')) as Secciones;
  return { default: crudo.default, alias: crudo.alias ?? {}, mapa: crudo.mapa };
}

export const config = {
  puerto: Number(process.env.COMPOSER_PORT ?? 3098),

  /**
   * Raíz del motor tipográfico: adentro viven `bin/`, `fonts/`, `formatos/`,
   * `estilos/` y `excepciones/`. El motor no tiene rutas compiladas: se entera
   * de todo por las variables SDR_* que arma `entornoMotor()`.
   */
  motor: process.env.SDR_ROOT ?? '/opt/jsdr/motor',

  /**
   * Dónde quedan los .txt que levanta InDesign.
   *
   * En producción es `/u/indesign`, que es lo que tenía hardcodeado mac.pl.
   * Acá es una variable justamente para poder probar sin tocar esa carpeta:
   * el día del corte se cambia el valor y nada más.
   */
  salidaIndesign: process.env.JSDR_SALIDA_INDESIGN ?? '/salida-indesign',

  /**
   * Carpeta de trabajo. OJO: no puede contener un punto en ninguna parte de
   * la ruta. `sr2xp` arma el nombre del .xtg cortando la ruta de entrada en el
   * PRIMER punto (`cut -f1 -d"."`, tal cual en fotocomponer.sh), así que con
   * un directorio como /tmp/tmp.AbC123 el archivo sale escrito en /tmp/tmp.xtg
   * y no hay error ni aviso: simplemente no aparece donde se lo espera.
   */
  trabajo: process.env.JSDR_TRABAJO ?? '/var/tmp/jsdr-composer',

  /**
   * Tope de tiempo por corrida del motor, en milisegundos.
   *
   * NO es una precaución teórica: `medir` entra en un bucle infinito con
   * ciertas entradas. En el servidor de producción quedó guardado el archivo
   * que lo colgaba —`/home/jsdr/bin/cuelga_medir`— y se reprodujo: 100 % de un
   * núcleo, sin salida y sin terminar nunca. Está en `pruebas/cuelga/`.
   *
   * Sin este tope, una sola noticia deja un proceso girando para siempre.
   */
  topeMotorMs: Number(process.env.JSDR_TOPE_MOTOR_MS ?? 20_000),

  /**
   * Corridas simultáneas del motor.
   *
   * Son procesos de 2005 que leen y escriben archivos y no se pensaron para
   * correr de a cientos. Con la redacción entera midiendo al cierre, la cola
   * protege al contenedor: es preferible esperar 200 ms a que el equipo se
   * quede sin CPU.
   */
  concurrencia: Number(process.env.JSDR_CONCURRENCIA ?? 4),

  secciones: cargarSecciones(),
} as const;
