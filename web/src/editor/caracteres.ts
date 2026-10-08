/**
 * Caracteres de control del editor y sus teclas.
 *
 * Espejo de api/src/dominio/caracteres.ts (que a su vez es el port de
 * CaracteresEspeciales del cliente Java). `edicion` es lo que se inserta y se
 * guarda; la traducción a lo que lee el motor la hace la API al medir.
 *
 * Las teclas son EXACTAMENTE las de KeyBinder / EditorNoticiasJPanel: la
 * redacción las tiene en los dedos y no se cambian.
 */
export interface Caracter {
  tipo: string;
  nombre: string;
  /** Tecla en notación de CodeMirror. */
  tecla: string;
  /** Tecla para mostrar. */
  etiqueta: string;
  edicion: string;
}

export const CARACTERES: readonly Caracter[] = [
  { tipo: 'MERGE', nombre: 'Merge', tecla: 'F4', etiqueta: 'F4', edicion: '∏' },
  { tipo: 'EM_SPACE', nombre: 'Cuadratín (EM space)', tecla: 'F5', etiqueta: 'F5', edicion: '■' },
  { tipo: 'EN_SPACE', nombre: 'Medio cuadratín (EN space)', tecla: 'F6', etiqueta: 'F6', edicion: '□' },
  { tipo: 'THIN_SPACE', nombre: 'Espacio fino (thin space)', tecla: 'F7', etiqueta: 'F7', edicion: '▪' },
  { tipo: 'BELL', nombre: 'Bell (comando)', tecla: 'F8', etiqueta: 'F8', edicion: '♫' },
  { tipo: 'QUAD_LEFT', nombre: 'Quad left (fin de párrafo)', tecla: 'F9', etiqueta: 'F9', edicion: '╠' },
  { tipo: 'QUAD_CENTER', nombre: 'Quad center', tecla: 'F10', etiqueta: 'F10', edicion: '╬' },
  { tipo: 'QUAD_RIGHT', nombre: 'Quad right', tecla: 'F11', etiqueta: 'F11', edicion: '╣' },
  { tipo: 'TAB_RET', nombre: 'Tab ret', tecla: 'Shift-F5', etiqueta: 'Shift+F5', edicion: '┴' },
  { tipo: 'ABRIR_COMILLAS_DOBLES', nombre: 'Abrir comillas dobles', tecla: 'Shift-F9', etiqueta: 'Shift+F9', edicion: '“' },
  { tipo: 'CERRAR_COMILLAS_DOBLES', nombre: 'Cerrar comillas dobles', tecla: 'Shift-F10', etiqueta: 'Shift+F10', edicion: '”' },
  { tipo: 'ABRIR_COMILLAS_FRANCESAS', nombre: 'Abrir comillas francesas', tecla: 'Shift-F11', etiqueta: 'Shift+F11', edicion: '«' },
  { tipo: 'CERRAR_COMILLAS_FRANCESAS', nombre: 'Cerrar comillas francesas', tecla: 'Shift-F12', etiqueta: 'Shift+F12', edicion: '»' },
];

/** Carácter → su descripción, para el tooltip de la marca en el texto. */
export const POR_CARACTER = new Map(CARACTERES.map((c) => [c.edicion, c]));

/** Atajos que no insertan caracteres (EditorNoticiasJPanel.addBindings y el módulo). */
export const OTROS_ATAJOS: readonly [string, string][] = [
  ['F2', 'Cerrar la noticia'],
  ['F3', 'Medir la noticia'],
  ['Ctrl+L', 'Medir el campo en alto'],
  ['Ctrl+A', 'Medir el campo en ancho'],
  ['Ctrl+F', 'Buscar y reemplazar'],
  ['Ctrl+I', 'Revisar ortografía'],
  ['Ctrl+Z / Ctrl+Y', 'Deshacer / rehacer'],
  ['Ctrl+↑ / Ctrl+↓', 'Agrandar / achicar la letra'],
  ['Alt+T / Alt+C', 'Ir al titular / al cuerpo'],
  ['Alt+N', 'Noticia nueva'],
];
