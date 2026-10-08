/**
 * Un campo de texto del editor (Titular o Cuerpo), sobre CodeMirror 6.
 *
 * Reemplaza al JTextPane del cliente Swing con las mismas teclas. Las vistas
 * se crean una vez por noticia abierta y viven mientras la pestaña esté
 * abierta: así conservan el historial de deshacer y la posición del cursor
 * aunque el redactor vaya al buscador y vuelva.
 */
import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
import {
  Decoration, EditorView, MatchDecorator, ViewPlugin, keymap,
  type DecorationSet, type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, redo, undo } from '@codemirror/commands';
import { openSearchPanel, search, searchKeymap } from '@codemirror/search';

import { CARACTERES, POR_CARACTER } from './caracteres';

export type Campo = 'titular' | 'cuerpo';

/** Lo que una tecla le pide a la pantalla (que es la que sabe hacerlo). */
export type Accion =
  | 'cerrar' | 'medir-noticia' | 'medir-alto' | 'medir-ancho'
  | 'ortografia' | 'guardar' | 'letra-mas' | 'letra-menos';

// --- marcas de los caracteres de control -----------------------------------

const patron = new RegExp(`[${CARACTERES.map((c) => c.edicion).join('')}]`, 'gu');

const marcador = new MatchDecorator({
  regexp: patron,
  decoration: (m) => {
    const c = POR_CARACTER.get(m[0]);
    return Decoration.mark({
      class: `cc cc-${c?.tipo ?? 'X'}`,
      attributes: { title: c ? `${c.nombre} (${c.etiqueta})` : '' },
    });
  },
});

/**
 * Los códigos de control se ven resaltados y con su nombre al pasar el mouse.
 * En el Swing eran caracteres sueltos entre el texto, fáciles de perder de
 * vista; acá son los mismos caracteres, sólo que no se confunden con letras.
 */
const marcas = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(v: EditorView) { this.decorations = marcador.createDeco(v); }
    update(u: ViewUpdate) { this.decorations = marcador.updateDeco(u, this.decorations); }
  },
  { decorations: (v) => v.decorations },
);

// --- textos de la búsqueda en castellano ------------------------------------

const frases = EditorState.phrases.of({
  'Find': 'Buscar',
  'Replace': 'Reemplazar con',
  'next': 'siguiente',
  'previous': 'anterior',
  'all': 'todos',
  'match case': 'mayúsc./minúsc.',
  'regexp': 'expresión regular',
  'by word': 'palabra completa',
  'replace': 'reemplazar',
  'replace all': 'reemplazar todo',
  'close': 'cerrar',
  'current match': 'coincidencia actual',
  'on line': 'en la línea',
  'replaced match on line $': 'reemplazado en la línea $',
  'replaced $ matches': '$ reemplazos',
  'Go to line': 'Ir a la línea',
  'go': 'ir',
});

// --- tamaño de letra (Ctrl+↑ / Ctrl+↓, para todas las noticias a la vez) ----

export const letra = new Compartment();
export const temaLetra = (px: number): Extension =>
  EditorView.theme({ '&': { fontSize: `${px}px` } });

// --- la vista ----------------------------------------------------------------

export interface OpcionesVista {
  campo: Campo;
  texto: string;
  tamanoLetra: number;
  /** Cada cambio del texto (para "sin guardar", autoguardado y medición en vivo). */
  alCambiar: () => void;
  /** Una tecla de acción (F2, F3, Ctrl+L...). */
  alAccion: (a: Accion) => void;
  /** Recibió el foco: es "el campo actual" para Insertar, MAYÚS, Pegar... */
  alEnfocar: () => void;
}

/** Inserta en el cursor, como `insertString(getCaretPosition())` del Swing. */
function insertar(texto: string) {
  return (v: EditorView) => {
    const pos = v.state.selection.main.head;
    v.dispatch({
      changes: { from: pos, insert: texto },
      selection: { anchor: pos + texto.length },
      scrollIntoView: true,
      userEvent: 'input.type',
    });
    return true;
  };
}

export function crearVista(o: OpcionesVista): EditorView {
  const accion = (a: Accion) => () => { o.alAccion(a); return true; };

  // Prioridad máxima: estas teclas le ganan a las de CodeMirror y a las del
  // navegador (F3 buscar, F5 recargar, Ctrl+L barra de direcciones...).
  const teclasJsdr = Prec.highest(keymap.of([
    ...CARACTERES.map((c) => ({ key: c.tecla, run: insertar(c.edicion), preventDefault: true })),
    { key: 'F2', run: accion('cerrar'), preventDefault: true },
    { key: 'F3', run: accion('medir-noticia'), preventDefault: true },
    { key: 'Mod-l', run: accion('medir-alto'), preventDefault: true },
    // Ctrl+A mide en ancho, como en el Swing: NO selecciona todo.
    { key: 'Mod-a', run: accion('medir-ancho'), preventDefault: true },
    { key: 'Mod-i', run: accion('ortografia'), preventDefault: true },
    { key: 'Mod-f', run: openSearchPanel, preventDefault: true },
    { key: 'Mod-z', run: undo, preventDefault: true },
    { key: 'Mod-y', run: redo, preventDefault: true },
    { key: 'Mod-ArrowUp', run: accion('letra-mas'), preventDefault: true },
    { key: 'Mod-ArrowDown', run: accion('letra-menos'), preventDefault: true },
    // No estaba en el Swing; evita que el navegador ofrezca guardar la página.
    { key: 'Mod-s', run: accion('guardar'), preventDefault: true },
  ]));

  return new EditorView({
    state: EditorState.create({
      doc: o.texto,
      extensions: [
        teclasJsdr,
        history(),
        search({ top: true }),
        keymap.of([...searchKeymap, ...historyKeymap, ...defaultKeymap]),
        EditorView.lineWrapping,
        marcas,
        frases,
        letra.of(temaLetra(o.tamanoLetra)),
        EditorView.contentAttributes.of({
          spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off',
          'aria-label': o.campo === 'titular' ? 'Titular' : 'Cuerpo',
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) o.alCambiar();
          if (u.focusChanged && u.view.hasFocus) o.alEnfocar();
        }),
      ],
    }),
  });
}

/** Selecciona la palabra número `n` (1 = la primera), como doMarcarErrorMedir. */
export function seleccionarPalabra(v: EditorView, n: number) {
  const texto = v.state.doc.toString();
  let cuenta = 0;
  let inicio = 0, fin = 0;
  let i = 0;
  const blanco = (c: string) => /\s/.test(c);
  while (cuenta < n && i < texto.length) {
    if (!blanco(texto[i]!)) {
      inicio = i;
      while (++i < texto.length && !blanco(texto[i]!)) { /* avanza */ }
      fin = i;
      cuenta++;
    }
    i++;
  }
  v.focus();
  v.dispatch({ selection: { anchor: inicio, head: fin }, scrollIntoView: true });
}
