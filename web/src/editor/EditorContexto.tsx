/**
 * Estado y acciones del editor de noticias.
 *
 * Port de EditorNoticiasJPanel + ModuloEditorNoticiasJInternalFrame. Vive por
 * encima de las rutas: las noticias abiertas siguen abiertas aunque el
 * redactor vaya al buscador y vuelva, como el JInternalFrame del Swing, que
 * quedaba abierto en el escritorio mientras se usaba el buscador.
 */
import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';
import type { EditorView } from '@codemirror/view';
import { redo, undo } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';

import { api, descargar, ErrorApi } from '../api/cliente';
import type {
  AccionCierre, AperturaEditor, Comando, DatosEditor, EstadoEditor, Seccion,
} from '../api/tipos';
import { Dialogo, type PedidoDialogo, type RespuestaDialogo } from '../componentes/Dialogo';
import { useUsuario } from '../sesion';
import {
  crearVista, letra, seleccionarPalabra, temaLetra, type Accion, type Campo,
} from './vista';

// --- tipos -------------------------------------------------------------------

export interface MedidaVista { cm: number; lineas: number; error: boolean }

export interface ErrorSalida { campo: Campo; palabra: number; mensaje: string }

/** El panel de abajo: el texto formateado o la lista de errores de la medición. */
export type Salida =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'errores'; items: ErrorSalida[] };

export interface Mensaje { texto: string; tipo: 'info' | 'error' | 'aviso' }

export interface Pestana {
  clave: string;
  n: EstadoEditor;
  secciones: Seccion[];
  comandos: Comando[];
  comandoSel: number | null;
  autosaveCambios: number;
  medidas: Record<Campo | 'noticia', MedidaVista>;
  /** seGuardoAlgunaVez / seModificoPostGuardado del Swing. */
  seGuardo: boolean;
  modPost: boolean;
  salida: Salida | null;
  mensaje: Mensaje | null;
  ocupada: string | null;
}

interface Contexto {
  pestanas: Pestana[];
  activa: string | null;
  setActiva: (clave: string) => void;
  tamanoLetra: number;

  vista: (clave: string, campo: Campo) => EditorView | undefined;
  enfocar: (clave: string, campo: Campo) => void;

  nueva: () => Promise<void>;
  abrir: (id: number) => Promise<boolean>;
  guardar: (clave: string) => Promise<void>;
  cerrar: (clave: string) => Promise<void>;
  accion: (clave: string, campo: Campo | null, a: Accion) => void;

  cambiarGuia: (clave: string, valor: string) => void;
  cambiarSeccion: (clave: string, id: number) => Promise<void>;
  cambiarFecha: (clave: string, fecha: string) => void;
  cambiarConfidencial: (clave: string) => Promise<void>;
  elegirComando: (clave: string, id: number) => void;
  insertarComando: (clave: string) => void;
  mayusculas: (clave: string, mayus: boolean) => void;
  portapapeles: (clave: string, que: 'cortar' | 'copiar' | 'pegar') => Promise<void>;
  buscarReemplazar: (clave: string) => void;
  deshacer: (clave: string) => void;
  rehacer: (clave: string) => void;
  exportarTxt: (clave: string) => Promise<void>;
  noDisponible: (clave: string, que: string) => void;
  irAError: (clave: string, e: ErrorSalida) => void;
  ocultarSalida: (clave: string) => void;

  preguntar: (p: PedidoDialogo) => Promise<RespuestaDialogo>;
  dialogoAbierto: boolean;
}

const Ctx = createContext<Contexto | null>(null);

export function useEditor() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useEditor fuera del proveedor');
  return c;
}

// --- utilidades ----------------------------------------------------------------

/** "##0.00" con coma decimal, como Constants.getMedidaCMFormat en es_AR. */
export const cm = (n: number) => n.toFixed(2).replace('.', ',');

/** EditorNoticiasJPanel.agregarNumeroLineas. */
export function numerarLineas(texto: string): string {
  const lineas = texto.split(/\r\n|\r|\n/);
  if (lineas.length > 0 && lineas[lineas.length - 1] === '') lineas.pop();
  return lineas
    .map((l, i) => {
      const n = i + 1;
      const sep = n < 10 ? '    ' : n < 100 ? '   ' : '  ';
      return `${n}${sep}${l}\n`;
    })
    .join('');
}

const hoy = () => {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

const sumar = (a: MedidaVista, b: MedidaVista): MedidaVista => ({
  cm: Math.round((a.cm + b.cm) * 100) / 100,
  lineas: a.lineas + b.lineas,
  error: a.error || b.error,
});

const GUIA = /^[a-zA-Z_0-9]{0,10}$/;

/** Espera de la medición en vivo después de la última tecla. */
const ESPERA_MEDICION_MS = 700;

// --- proveedor -----------------------------------------------------------------

export function ProveedorEditor({ children }: { children: ReactNode }) {
  const sesion = useUsuario();

  const [pestanas, setPestanas] = useState<Pestana[]>([]);
  const lista = useRef<Pestana[]>([]);
  const [activa, setActivaEstado] = useState<string | null>(null);
  const [tamanoLetra, setTamanoLetra] = useState(sesion.usuario.font_size_editor || 16);
  const letraRef = useRef(tamanoLetra);

  const vistas = useRef(new Map<string, Record<Campo, EditorView>>());
  const campoActual = useRef(new Map<string, Campo>());
  const cambios = useRef(new Map<string, number>());
  const autoguardando = useRef(new Set<string>());
  const temporizadores = useRef(new Map<string, number>());
  const secuencias = useRef(new Map<string, number>());

  // --- diálogos ---------------------------------------------------------------
  const [pedido, setPedido] = useState<PedidoDialogo | null>(null);
  const resolver = useRef<((r: RespuestaDialogo) => void) | null>(null);
  const preguntar = useCallback((p: PedidoDialogo) => new Promise<RespuestaDialogo>((ok) => {
    resolver.current = ok;
    setPedido(p);
  }), []);
  const avisar = useCallback(async (titulo: string, mensaje: string, detalles?: string[]) => {
    await preguntar({ titulo, mensaje, detalles, botones: [{ etiqueta: 'Aceptar', valor: 'ok', principal: true }] });
  }, [preguntar]);

  // --- estado de las pestañas -----------------------------------------------
  const poner = (nueva: Pestana[]) => { lista.current = nueva; setPestanas(nueva); };
  const p = (clave: string) => lista.current.find((x) => x.clave === clave);
  const actualizar = (clave: string, f: (x: Pestana) => Pestana) =>
    poner(lista.current.map((x) => (x.clave === clave ? f(x) : x)));
  const mensaje = (clave: string, texto: string, tipo: Mensaje['tipo'] = 'info') =>
    actualizar(clave, (x) => ({ ...x, mensaje: texto ? { texto, tipo } : null }));

  const setActiva = useCallback((clave: string) => setActivaEstado(clave), []);

  const vista = useCallback((clave: string, campo: Campo) => vistas.current.get(clave)?.[campo], []);
  const actual = (clave: string) => vista(clave, campoActual.current.get(clave) ?? 'titular');

  const enfocar = useCallback((clave: string, campo: Campo) => {
    const v = vistas.current.get(clave)?.[campo];
    if (v) { v.focus(); campoActual.current.set(clave, campo); }
  }, []);

  const textos = (clave: string) => ({
    titular: vista(clave, 'titular')?.state.doc.toString() ?? '',
    cuerpo: vista(clave, 'cuerpo')?.state.doc.toString() ?? '',
  });

  const datos = (clave: string): DatosEditor => {
    const x = p(clave)!;
    const t = textos(clave);
    return {
      guia_usuario: x.n.guia_usuario, seccion_id: x.n.seccion_id, fecha: x.n.fecha,
      confidencial: x.n.confidencial, titular: t.titular, cuerpo: t.cuerpo,
      medidas: {
        titular: { cm: x.medidas.titular.cm, lineas: x.medidas.titular.lineas },
        cuerpo: { cm: x.medidas.cuerpo.cm, lineas: x.medidas.cuerpo.lineas },
        noticia: { cm: x.medidas.noticia.cm, lineas: x.medidas.noticia.lineas },
      },
    };
  };

  const guiaCompleta = (x: Pestana) =>
    x.n.guia_auto ? `${x.n.guia_usuario}-${x.n.guia_auto}` : x.n.guia_usuario;

  // --- autoguardado: checkAutoSave -------------------------------------------

  async function autoguardar(clave: string) {
    const x = p(clave);
    if (!x || autoguardando.current.has(clave)) return;
    autoguardando.current.add(clave);
    mensaje(clave, 'Auto Guardando Noticia...');
    try {
      await api.editor.autoguardar(x.n.id, x.n.numero, datos(clave));
      cambios.current.set(clave, 0);
      if (p(clave)?.mensaje?.texto === 'Auto Guardando Noticia...') mensaje(clave, '');
    } catch (e) {
      mensaje(clave, '');
      await avisar('Editor de Noticias', mensajeDe(e));
    } finally {
      autoguardando.current.delete(clave);
    }
  }

  /** Cualquier cambio: texto, sección, fecha, confidencialidad, medir. */
  function marcarCambio(clave: string) {
    const x = p(clave);
    if (!x) return;
    // Sólo se re-renderiza si algo cambia de verdad: no en cada tecla.
    if ((x.seGuardo && !x.modPost) || x.mensaje) {
      actualizar(clave, (y) => ({ ...y, modPost: y.seGuardo ? true : y.modPost, mensaje: null }));
    }
    const n = (cambios.current.get(clave) ?? 0) + 1;
    cambios.current.set(clave, n);
    if (n >= x.autosaveCambios && !autoguardando.current.has(clave)) void autoguardar(clave);
  }

  // --- medición en vivo -------------------------------------------------------
  // No estaba en el Swing (ahí se medía con F3 o Ctrl+L): la medida del campo
  // se actualiza sola un instante después de dejar de escribir. El motor tarda
  // 5 ms: no hace falta esperar al F3 para saber cuánto ocupa la nota.

  function programarMedicion(clave: string, campo: Campo) {
    const k = `${clave}:${campo}`;
    const t = temporizadores.current.get(k);
    if (t) window.clearTimeout(t);
    temporizadores.current.set(k, window.setTimeout(() => void medirEnVivo(clave, campo), ESPERA_MEDICION_MS));
  }

  async function medirEnVivo(clave: string, campo: Campo) {
    const k = `${clave}:${campo}`;
    const sec = (secuencias.current.get(k) ?? 0) + 1;
    secuencias.current.set(k, sec);
    const texto = vista(clave, campo)?.state.doc.toString() ?? '';
    try {
      const m = await api.editor.medirCampo(texto);
      if (secuencias.current.get(k) !== sec || !p(clave)) return; // llegó otra más nueva
      actualizar(clave, (x) => {
        const medidas = { ...x.medidas, [campo]: { cm: m.cm, lineas: m.lineas, error: m.errores.length > 0 } };
        return { ...x, medidas: { ...medidas, noticia: sumar(medidas.titular, medidas.cuerpo) } };
      });
    } catch {
      // Sin motor no hay medida en vivo; el F3 dirá por qué.
    }
  }

  // --- crear las vistas de una noticia ----------------------------------------

  function agregarPestana(a: AperturaEditor): string {
    const clave = `n${a.noticia.id}-${Date.now()}`;
    const m = a.noticia.medidas;
    const nueva: Pestana = {
      clave, n: a.noticia, secciones: a.secciones, comandos: a.comandos,
      comandoSel: a.comandos[0]?.id ?? null,
      autosaveCambios: a.autosave_cambios,
      medidas: {
        titular: { ...m.titular, error: false },
        cuerpo: { ...m.cuerpo, error: false },
        noticia: { ...m.noticia, error: false },
      },
      seGuardo: false, modPost: false, salida: null,
      mensaje: a.noticia.fecha_anterior
        ? { tipo: 'aviso', texto: `La fecha de publicación era ${a.noticia.fecha_anterior.split('-').reverse().join('/')}: se pasó a mañana.` }
        : null,
      ocupada: null,
    };
    const opciones = (campo: Campo) => ({
      campo,
      texto: campo === 'titular' ? a.noticia.titular : a.noticia.cuerpo,
      tamanoLetra: letraRef.current,
      alCambiar: () => { marcarCambioRef.current(clave); programarMedicionRef.current(clave, campo); },
      alAccion: (ac: Accion) => accionRef.current(clave, campo, ac),
      alEnfocar: () => campoActual.current.set(clave, campo),
    });
    vistas.current.set(clave, { titular: crearVista(opciones('titular')), cuerpo: crearVista(opciones('cuerpo')) });
    cambios.current.set(clave, 0);
    poner([...lista.current, nueva]);
    setActivaEstado(clave);
    return clave;
  }

  function quitarPestana(clave: string) {
    const v = vistas.current.get(clave);
    v?.titular.destroy();
    v?.cuerpo.destroy();
    vistas.current.delete(clave);
    campoActual.current.delete(clave);
    cambios.current.delete(clave);
    const i = lista.current.findIndex((x) => x.clave === clave);
    const resto = lista.current.filter((x) => x.clave !== clave);
    poner(resto);
    setActivaEstado((a) => (a !== clave ? a : (resto[Math.min(i, resto.length - 1)]?.clave ?? null)));
  }

  /** initCreacion: el diálogo "Ingrese la guía de la noticia". */
  async function pedirGuia(clave: string) {
    const r = await preguntar({
      titulo: 'Ingrese la guía de la noticia',
      entrada: {
        valor: '', filtro: GUIA, largoMaximo: 10,
        ayuda: 'Hasta 10 letras, números o guion bajo.',
      },
      botones: [{ etiqueta: 'Aceptar', valor: 'ok', principal: true }],
      cancelar: 'ok',
    });
    if (r.texto) {
      actualizar(clave, (x) => ({ ...x, n: { ...x.n, guia_usuario: r.texto } }));
      marcarCambio(clave);
      window.setTimeout(() => enfocar(clave, 'titular'), 0);
    } else {
      window.setTimeout(() => document.getElementById(`guia-${clave}`)?.focus(), 0);
    }
  }

  // --- acciones -----------------------------------------------------------------

  async function nueva() {
    try {
      const a = await api.editor.nueva();
      const clave = agregarPestana(a);
      await pedirGuia(clave);
    } catch (e) {
      await avisar('Editor de Noticias', mensajeDe(e));
    }
  }

  async function abrir(id: number) {
    const ya = lista.current.find((x) => x.n.id === id);
    if (ya) { setActivaEstado(ya.clave); return true; }
    try {
      const a = await api.editor.abrir(id);
      const clave = agregarPestana(a);
      if (a.noticia.guia_editable) await pedirGuia(clave);
      else window.setTimeout(() => enfocar(clave, 'titular'), 0);
      return true;
    } catch (e) {
      await avisar('Editar noticia', mensajeDe(e));
      return false;
    }
  }

  /** guardarNoticia: si ya se guardó y no se tocó nada desde entonces, no hace nada. */
  async function guardar(clave: string) {
    const x = p(clave);
    if (!x || (x.seGuardo && !x.modPost)) return;
    actualizar(clave, (y) => ({ ...y, ocupada: 'Guardando…' }));
    try {
      await api.editor.guardar(x.n.id, x.n.numero, datos(clave));
      cambios.current.set(clave, 0);
      actualizar(clave, (y) => ({
        ...y, seGuardo: true, modPost: false, ocupada: null,
        mensaje: { tipo: 'info', texto: 'La noticia se guardó correctamente' },
      }));
    } catch (e) {
      actualizar(clave, (y) => ({ ...y, ocupada: null }));
      await avisar('Guardar noticia', mensajeDe(e), e instanceof ErrorApi ? e.errores : undefined);
      if (e instanceof ErrorApi && e.errores[0]) mensaje(clave, e.errores[0], 'error');
    }
  }

  /** EditorNoticiasJPanel.cerrarNoticia. */
  async function cerrar(clave: string) {
    const x = p(clave);
    if (!x) return;
    let accion: AccionCierre;

    if (x.seGuardo && !x.modPost) {
      accion = 'sin_guardar';
    } else {
      const r = await preguntar({
        titulo: 'Edición de Noticias',
        mensaje: '¿Quiere guardar la noticia?',
        botones: [
          { etiqueta: 'Sí', valor: 'si', principal: true },
          { etiqueta: 'No', valor: 'no' },
          { etiqueta: 'Cancelar', valor: 'cancelar' },
        ],
        cancelar: 'cancelar',
      });
      if (r.boton === 'cancelar') return;
      if (r.boton === 'si') accion = 'guardando';
      else if (x.seGuardo) accion = 'sin_guardar';
      else if (x.n.creando) accion = 'descartar_creacion';
      else if (x.n.nueva_version) accion = 'descartar_version';
      else accion = 'sin_guardar';
    }

    try {
      await api.editor.cerrar(x.n.id, x.n.numero, accion, accion === 'guardando' ? datos(clave) : undefined);
      quitarPestana(clave);
    } catch (e) {
      await avisar('Edición de Noticias', mensajeDe(e), e instanceof ErrorApi ? e.errores : undefined);
      if (e instanceof ErrorApi && e.codigo === 409) {
        // Ya no está abierta (la cerró otro, o se venció): no tiene sentido retenerla.
        quitarPestana(clave);
      }
    }
  }

  // --- medir --------------------------------------------------------------------

  async function medirNoticia(clave: string) {
    const t = textos(clave);
    actualizar(clave, (y) => ({ ...y, ocupada: 'Midiendo…' }));
    try {
      const m = await api.editor.medir(t.titular, t.cuerpo);
      // checkAutoSave va ANTES del mensaje, como en el Swing: limpia el
      // mensaje anterior y cuenta como cambio (cambiaron las medidas).
      marcarCambio(clave);
      const hayError = m.titular.errores.length > 0 || m.cuerpo.errores.length > 0;
      const formateado = m.titular.formateado + m.cuerpo.formateado;
      actualizar(clave, (y) => ({
        ...y, ocupada: null,
        medidas: {
          titular: { cm: m.titular.cm, lineas: m.titular.lineas, error: m.titular.errores.length > 0 },
          cuerpo: { cm: m.cuerpo.cm, lineas: m.cuerpo.lineas, error: m.cuerpo.errores.length > 0 },
          noticia: { ...m.noticia, error: hayError },
        },
        salida: hayError
          ? {
            tipo: 'errores',
            items: [
              ...m.titular.errores.map((e) => ({ campo: 'titular' as const, palabra: e.linea, mensaje: e.mensaje })),
              ...m.cuerpo.errores.map((e) => ({ campo: 'cuerpo' as const, palabra: e.linea, mensaje: e.mensaje })),
            ],
          }
          : { tipo: 'texto', texto: '----Texto formateado----\n' + (formateado ? numerarLineas(formateado) : '') },
        mensaje: hayError
          ? { tipo: 'error', texto: 'Error al medir la noticia' }
          : { tipo: 'info', texto: 'Se midió correctamente la noticia' },
      }));
    } catch (e) {
      actualizar(clave, (y) => ({ ...y, ocupada: null }));
      await avisar('Medir noticia', mensajeDe(e));
    }
  }

  async function medirAlto(clave: string, campo: Campo) {
    const texto = vista(clave, campo)?.state.doc.toString() ?? '';
    try {
      const m = await api.editor.medirCampo(texto);
      const conError = m.errores.length > 0;
      marcarCambio(clave);
      actualizar(clave, (y) => {
        const medidas = { ...y.medidas, [campo]: { cm: m.cm, lineas: m.lineas, error: conError } };
        return {
          ...y,
          medidas: { ...medidas, noticia: sumar(medidas.titular, medidas.cuerpo) },
          salida: conError
            ? { tipo: 'errores', items: m.errores.map((e) => ({ campo, palabra: e.linea, mensaje: e.mensaje })) }
            : { tipo: 'texto', texto: `${campo} - texto formateado:\n${numerarLineas(m.formateado)}` },
          mensaje: conError
            ? { tipo: 'error', texto: `Error al medir: ${campo}` }
            : { tipo: 'info', texto: `Se midió correctamente: ${campo}` },
        };
      });
    } catch (e) {
      await avisar('Medir', mensajeDe(e));
    }
  }

  async function medirAncho(clave: string, campo: Campo) {
    const texto = vista(clave, campo)?.state.doc.toString() ?? '';
    try {
      const m = await api.editor.medirAncho(texto);
      const conError = m.errores.length > 0;
      actualizar(clave, (y) => ({
        ...y,
        salida: conError
          ? { tipo: 'errores', items: m.errores.map((e) => ({ campo, palabra: e.linea, mensaje: e.mensaje })) }
          : {
            tipo: 'texto',
            texto: `${campo} - medidas en ancho:\n` +
              m.medidas.map((x) => `Desde la palabra ${x.palabra}: ${x.valor}\n`).join(''),
          },
        mensaje: conError
          ? { tipo: 'error', texto: `Error al medir: ${campo}` }
          : { tipo: 'info', texto: `Se midió correctamente: ${campo}` },
      }));
    } catch (e) {
      await avisar('Medir en ancho', mensajeDe(e));
    }
  }

  // --- teclas que piden algo a la pantalla -----------------------------------

  function accion(clave: string, campo: Campo | null, a: Accion) {
    const c = campo ?? campoActual.current.get(clave) ?? 'titular';
    switch (a) {
      case 'cerrar': void cerrar(clave); break;
      case 'medir-noticia': void medirNoticia(clave); break;
      case 'medir-alto': void medirAlto(clave, c); break;
      case 'medir-ancho': void medirAncho(clave, c); break;
      case 'guardar': void guardar(clave); break;
      case 'ortografia': noDisponible(clave, 'La revisión ortográfica'); break;
      case 'letra-mas': cambiarLetra(+1); break;
      case 'letra-menos': cambiarLetra(-1); break;
    }
  }

  /** FontManager: de 5 a 100 puntos, de a uno, para todas las noticias abiertas. */
  function cambiarLetra(delta: number) {
    const nuevo = Math.min(100, Math.max(5, letraRef.current + delta));
    letraRef.current = nuevo;
    setTamanoLetra(nuevo);
    for (const v of vistas.current.values()) {
      v.titular.dispatch({ effects: letra.reconfigure(temaLetra(nuevo)) });
      v.cuerpo.dispatch({ effects: letra.reconfigure(temaLetra(nuevo)) });
    }
  }

  // Las vistas se crean una vez: llaman siempre a la versión más nueva de
  // estas funciones a través de refs.
  const marcarCambioRef = useRef(marcarCambio);
  const programarMedicionRef = useRef(programarMedicion);
  const accionRef = useRef(accion);
  marcarCambioRef.current = marcarCambio;
  programarMedicionRef.current = programarMedicion;
  accionRef.current = accion;

  // --- cabecera ------------------------------------------------------------------

  function cambiarGuia(clave: string, valor: string) {
    if (!GUIA.test(valor)) return;
    actualizar(clave, (x) => ({ ...x, n: { ...x.n, guia_usuario: valor } }));
    marcarCambio(clave);
  }

  async function cambiarSeccion(clave: string, id: number) {
    actualizar(clave, (x) => ({ ...x, n: { ...x.n, seccion_id: id } }));
    marcarCambio(clave);
    try {
      // updateComandosSeccion: cambian los comandos del combo.
      const comandos = await api.editor.comandos(id);
      actualizar(clave, (x) => ({ ...x, comandos, comandoSel: comandos[0]?.id ?? null }));
    } catch { /* el combo queda como estaba */ }
  }

  function cambiarFecha(clave: string, fecha: string) {
    if (!fecha) return;
    if (fecha < hoy()) {
      mensaje(clave, 'La fecha de publicación no puede ser anterior a hoy', 'aviso');
      return;
    }
    actualizar(clave, (x) => ({ ...x, n: { ...x.n, fecha } }));
    marcarCambio(clave);
  }

  async function cambiarConfidencial(clave: string) {
    const x = p(clave);
    if (!x) return;
    const destino = x.n.confidencial ? 'PÚBLICA' : 'CONFIDENCIAL';
    const r = await preguntar({
      titulo: 'Cambiar confidencialidad',
      mensaje: `¿Está seguro que desea pasar la noticia a "${destino}"?`,
      botones: [{ etiqueta: 'Si', valor: 'si' }, { etiqueta: 'No', valor: 'no', principal: true }],
      cancelar: 'no',
    });
    if (r.boton !== 'si') return;
    actualizar(clave, (y) => ({ ...y, n: { ...y.n, confidencial: !y.n.confidencial } }));
    marcarCambio(clave);
    await avisar('Cambiar confidencialidad', `La noticia es "${destino}"`);
  }

  // --- barra de herramientas ------------------------------------------------------

  function elegirComando(clave: string, id: number) {
    actualizar(clave, (x) => ({ ...x, comandoSel: id }));
  }

  /** InsertarComandoAction: reemplaza la selección por el valor del comando. */
  function insertarComando(clave: string) {
    const x = p(clave);
    const c = x?.comandos.find((y) => y.id === x.comandoSel);
    const v = actual(clave);
    if (!c || !v) return;
    v.dispatch(v.state.replaceSelection(c.valor));
    v.focus();
  }

  /** MayusculaAction / MinusculaAction: sobre lo seleccionado. */
  function mayusculas(clave: string, mayus: boolean) {
    const v = actual(clave);
    if (!v) return;
    const sel = v.state.selection.main;
    if (sel.empty) return;
    const t = v.state.sliceDoc(sel.from, sel.to);
    v.dispatch({
      changes: { from: sel.from, to: sel.to, insert: mayus ? t.toUpperCase() : t.toLowerCase() },
      selection: { anchor: sel.from, head: sel.to },
    });
    v.focus();
  }

  async function portapapeles(clave: string, que: 'cortar' | 'copiar' | 'pegar') {
    const v = actual(clave);
    if (!v) return;
    v.focus();
    if (que !== 'pegar') {
      document.execCommand(que === 'cortar' ? 'cut' : 'copy');
      return;
    }
    try {
      const t = await navigator.clipboard.readText();
      v.dispatch(v.state.replaceSelection(t));
    } catch {
      // Por http en la red interna el navegador no deja leer el portapapeles
      // desde un botón. El teclado sí funciona siempre.
      mensaje(clave, 'Para pegar usá Ctrl+V: el navegador no deja pegar desde un botón en esta conexión.', 'aviso');
    }
  }

  function buscarReemplazar(clave: string) {
    const v = actual(clave);
    if (v) openSearchPanel(v);
  }

  function deshacer(clave: string) { const v = actual(clave); if (v) { undo(v); v.focus(); } }
  function rehacer(clave: string) { const v = actual(clave); if (v) { redo(v); v.focus(); } }

  async function exportarTxt(clave: string) {
    const x = p(clave);
    if (!x) return;
    const t = textos(clave);
    const guia = guiaCompleta(x);
    try {
      await descargar('/api/editor/exportar-txt', `${guia || 'noticia'}.txt`, {
        guia, fecha: x.n.fecha, seccion_id: x.n.seccion_id, redactor: x.n.redactor,
        titular: t.titular, cuerpo: t.cuerpo,
      });
    } catch (e) {
      await avisar('Exportar a TXT', mensajeDe(e));
    }
  }

  function noDisponible(clave: string, que: string) {
    mensaje(clave, `${que} todavía no está en la versión web: queda para la próxima etapa.`, 'aviso');
  }

  /** Clic en un error de la lista: selecciona la palabra (doMarcarErrorMedir). */
  function irAError(clave: string, e: ErrorSalida) {
    const v = vista(clave, e.campo);
    if (v) { seleccionarPalabra(v, e.palabra); campoActual.current.set(clave, e.campo); }
  }

  function ocultarSalida(clave: string) {
    actualizar(clave, (x) => ({ ...x, salida: null }));
  }

  // --- salir de la página con noticias abiertas --------------------------------
  // Una noticia abierta queda EN_EDICION (bloqueada) hasta que se cierra. Si
  // se cierra la pestaña del navegador sin cerrarla, queda como quedaba en el
  // Swing cuando se colgaba la PC: bloqueada, con su versión temporal.
  useEffect(() => {
    const alSalir = (e: BeforeUnloadEvent) => {
      if (lista.current.length > 0) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, []);

  useEffect(() => () => {
    for (const v of vistas.current.values()) { v.titular.destroy(); v.cuerpo.destroy(); }
    for (const t of temporizadores.current.values()) window.clearTimeout(t);
  }, []);

  const valor: Contexto = {
    pestanas, activa, setActiva, tamanoLetra, vista, enfocar,
    nueva, abrir, guardar, cerrar, accion,
    cambiarGuia, cambiarSeccion, cambiarFecha, cambiarConfidencial,
    elegirComando, insertarComando, mayusculas, portapapeles, buscarReemplazar,
    deshacer, rehacer, exportarTxt, noDisponible, irAError, ocultarSalida,
    preguntar, dialogoAbierto: pedido !== null,
  };

  return (
    <Ctx.Provider value={valor}>
      {children}
      {pedido && (
        <Dialogo
          pedido={pedido}
          alResponder={(r) => { setPedido(null); resolver.current?.(r); resolver.current = null; }}
        />
      )}
    </Ctx.Provider>
  );
}
