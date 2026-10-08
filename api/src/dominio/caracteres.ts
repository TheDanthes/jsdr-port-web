/**
 * Caracteres de control de fotocomposición y los filtros de texto del editor.
 *
 * Port 1:1 de `jsdr.common.util.CaracteresEspeciales` y
 * `jsdr.common.FiltradorNoticia` (cliente jSDR 1.6.0, decompilado).
 *
 * CÓMO FUNCIONABA EL SISTEMA VIEJO
 *
 * El texto de una noticia se guarda en la base tal como lo ve el redactor. Para
 * que los códigos de control se distingan en pantalla, el editor inserta
 * algunos como símbolos "de edición" (∏ ■ □ ▪ ♫ “ ”) y otros directamente con
 * el carácter que lee el motor (┴ ╠ ╬ ╣ « »). Recién al medir o fotocomponer,
 * `filtrarParaMedir` cambia los símbolos de edición por los del motor —el byte
 * cp850 que `medir` y `sr2xp` entienden— y además pone una palabra por línea.
 *
 * El texto que se guarda es SIEMPRE el de edición. La traducción al motor ocurre
 * en un solo lugar (acá), igual que antes.
 */

/** Los 13 caracteres especiales, en el orden de las constantes Java. */
export interface CaracterEspecial {
  /** Nombre de la constante en CaracteresEspeciales. */
  tipo: string;
  /** Nombre para mostrar. */
  nombre: string;
  /** Atajo del editor (KeyBinder / EditorNoticiasJPanel.addBindings). */
  tecla: string;
  /** Lo que lee el motor: el byte cp850 de `caracteresEspecialesEdicionASCII`. */
  motor: string;
  /**
   * Lo que se inserta en el editor y se guarda en la base. Cuando el Java no
   * define un símbolo de edición (`caracteresEspecialesEdicionMapping` = 0), se
   * inserta directamente el carácter del motor.
   */
  edicion: string;
}

// Bytes cp850 → carácter, tal como los decodifica `new String(bytes, "cp850")`.
// Verificado contra el Java original en caracteres.test.ts.
export const CARACTERES: readonly CaracterEspecial[] = [
  { tipo: 'MERGE',                     nombre: 'Merge',                    tecla: 'F4',       motor: 'õ', edicion: '∏' }, // õ (0xE4) / ∏
  { tipo: 'EM_SPACE',                  nombre: 'Cuadratín (EM space)',     tecla: 'F5',       motor: '■', edicion: '■' }, // ■ (0xFE) / ■
  { tipo: 'EN_SPACE',                  nombre: 'Medio cuadratín (EN space)', tecla: 'F6',     motor: '­', edicion: '□' }, // (0xF0) / □
  { tipo: 'THIN_SPACE',                nombre: 'Espacio fino (thin space)', tecla: 'F7',      motor: 'Ò', edicion: '▪' }, // Ò (0xE3) / ▪
  { tipo: 'BELL',                      nombre: 'Bell (comando)',           tecla: 'F8',       motor: 'Ø', edicion: '♫' }, // Ø (0x9D) / ♫
  { tipo: 'TAB_RET',                   nombre: 'Tab ret',                  tecla: 'Shift+F5', motor: '┴', edicion: '┴' }, // ┴ (0xC1)
  { tipo: 'QUAD_LEFT',                 nombre: 'Quad left (fin de párrafo)', tecla: 'F9',     motor: '╠', edicion: '╠' }, // ╠ (0xCC)
  { tipo: 'QUAD_CENTER',               nombre: 'Quad center',              tecla: 'F10',      motor: '╬', edicion: '╬' }, // ╬ (0xCE)
  { tipo: 'QUAD_RIGHT',                nombre: 'Quad right',               tecla: 'F11',      motor: '╣', edicion: '╣' }, // ╣ (0xB9)
  { tipo: 'ABRIR_COMILLAS_DOBLES',     nombre: 'Abrir comillas dobles',    tecla: 'Shift+F9', motor: '"',      edicion: '“' }, // " (0x22) / “
  { tipo: 'CERRAR_COMILLAS_DOBLES',    nombre: 'Cerrar comillas dobles',   tecla: 'Shift+F10', motor: '´', edicion: '”' }, // ´ (0xEF) / ”
  { tipo: 'ABRIR_COMILLAS_FRANCESAS',  nombre: 'Abrir comillas francesas', tecla: 'Shift+F11', motor: '«', edicion: '«' }, // « (0xAE)
  { tipo: 'CERRAR_COMILLAS_FRANCESAS', nombre: 'Cerrar comillas francesas', tecla: 'Shift+F12', motor: '»', edicion: '»' }, // » (0xAF)
];

const porTipo = (tipo: string) => CARACTERES.find((c) => c.tipo === tipo)!;

/**
 * Los que tienen un símbolo de edición distinto del carácter del motor. Son
 * los únicos que `filtrarParaMedir` traduce (MERGE, EM/EN/THIN, BELL y las
 * comillas dobles); el resto ya está guardado como lo lee el motor.
 */
const TRADUCIBLES = ['MERGE', 'EM_SPACE', 'EN_SPACE', 'THIN_SPACE', 'BELL',
  'ABRIR_COMILLAS_DOBLES', 'CERRAR_COMILLAS_DOBLES'].map(porTipo);

const EDICION_A_MOTOR = new Map(TRADUCIBLES.map((c) => [c.edicion, c.motor]));
const MOTOR_A_EDICION = new Map(TRADUCIBLES.map((c) => [c.motor, c.edicion]));

/**
 * FiltradorNoticia.filtrarParaMedir — lo que se le da a `medir` y a `sr2xp`.
 *
 *  - símbolos de edición → caracteres del motor;
 *  - cada espacio se vuelve fin de línea (una palabra por línea);
 *  - se quitan los espacios y saltos al principio de línea (y los repetidos);
 *  - el tab cuenta como espacio;
 *  - siempre termina en '\n'.
 *
 * Reproduce el recorrido del Java carácter por carácter, incluidos sus
 * detalles: el espacio NO se reemplaza por '\n', se le INSERTA un '\n' detrás;
 * y como el tab se cambia por espacio y se vuelve a procesar, un espacio
 * seguido de tab termina en "espacio, salto, espacio, salto". Por eso el
 * código se parece al original en lugar de usar expresiones regulares: una
 * versión "más limpia" mediría distinto.
 */
export function filtrarParaMedir(contenido: string): string {
  const sb = [...contenido];
  let i = 0;
  while (i < sb.length) {
    const chAnterior = i > 0 ? sb[i - 1] : '\u0000';
    const ch = sb[i]!;
    const motor = EDICION_A_MOTOR.get(ch);
    if (motor !== undefined) {
      sb[i] = motor;
    } else if (ch === ' ') {
      if (chAnterior === '\n' || i === 0) {
        sb.splice(i, 1);
        i--;
      } else {
        sb.splice(i + 1, 0, '\n');
        i++;
      }
    } else if (ch === '\n') {
      if (chAnterior === '\n' || i === 0) {
        sb.splice(i, 1);
        i--;
      }
    } else if (ch === '\t') {
      sb[i] = ' ';
      i--;
    }
    i++;
  }
  if (sb.length > 0 && sb[sb.length - 1] !== '\n') sb.push('\n');
  return sb.join('');
}

/** FiltradorNoticia.filtrarSalidaMedir — el texto formateado, de vuelta a símbolos de edición. */
export function filtrarSalidaMedir(textoFormateado: string): string {
  return [...textoFormateado].map((ch) => MOTOR_A_EDICION.get(ch) ?? ch).join('');
}

/**
 * FiltradorNoticia.filtrarParaTXT — la nota como texto plano, para exportar.
 *
 * Saltos de línea de Windows, comillas tipográficas a comillas rectas, y fuera
 * los códigos de control (merge, espacios especiales, quads) y los comandos
 * bell con su argumento. Se respeta un detalle del original: las comillas de
 * CIERRE también se cambian por la de apertura del motor (`"`), porque el Java
 * usa la constante 9 en los dos reemplazos.
 */
export function filtrarParaTXT(contenido: string): string {
  const abrir = porTipo('ABRIR_COMILLAS_DOBLES');
  const cerrar = porTipo('CERRAR_COMILLAS_DOBLES');
  const s = contenido
    .replaceAll('\n', '\r\n')
    .replaceAll(abrir.edicion, abrir.motor)
    .replaceAll(cerrar.edicion, abrir.motor);

  // eliminarCaracteresEspeciales: los símbolos de edición de merge y espacios,
  // y los quads (que se guardan con el carácter del motor).
  const fuera = new Set([
    ...['MERGE', 'EM_SPACE', 'EN_SPACE', 'THIN_SPACE'].map((t) => porTipo(t).edicion),
    ...['QUAD_LEFT', 'QUAD_CENTER', 'QUAD_RIGHT'].map((t) => porTipo(t).motor),
  ]);
  const sb = [...s].filter((ch) => !fuera.has(ch));

  // eliminarComandosBell: ♫ + 'a'/'x' + un carácter más, o ♫ + un carácter.
  const bell = porTipo('BELL').edicion;
  let i = 0;
  while (i < sb.length) {
    if (sb[i] === bell) {
      if (i + 1 < sb.length && (sb[i + 1] === 'a' || sb[i + 1] === 'x')) sb.splice(i, 3);
      else if (i + 1 < sb.length) sb.splice(i, 2);
      else sb.splice(i, 1);
      continue;
    }
    i++;
  }
  return sb.join('');
}

/**
 * Lo que se le pasa al motor para fotocomponer una noticia
 * (ProgramaFotocomponer.generarArchivo): titular y cuerpo filtrados, uno
 * detrás del otro, sólo si tienen contenido.
 */
export function textoParaFotocomponer(titular: string | null, cuerpo: string | null): string {
  let s = '';
  if (titular) s += filtrarParaMedir(titular);
  if (cuerpo) s += filtrarParaMedir(cuerpo);
  return s;
}

/**
 * Cantidad de líneas de una medición, como la cuenta ProgramaMedir:
 * `new StringTokenizer(textoFormateado, "\n").countTokens()` — las líneas
 * vacías no cuentan.
 */
export function contarLineas(textoFormateado: string): number {
  return textoFormateado.split('\n').filter((l) => l.length > 0).length;
}
