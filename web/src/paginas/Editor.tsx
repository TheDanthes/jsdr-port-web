import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { EditorView } from '@codemirror/view';

import { cm, useEditor, type Pestana } from '../editor/EditorContexto';
import { CARACTERES, OTROS_ATAJOS } from '../editor/caracteres';

/** Engancha la vista de CodeMirror (que vive en el contexto) en este lugar del DOM. */
function Montaje({ vista }: { vista: EditorView | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const caja = ref.current;
    if (!caja || !vista) return;
    caja.appendChild(vista.dom);
    vista.requestMeasure();
    return () => { if (vista.dom.parentNode === caja) caja.removeChild(vista.dom); };
  }, [vista]);
  return <div className="campo-editor-texto" ref={ref} />;
}

/** Botón de la barra: no se lleva el foco, así Insertar o MAYÚS actúan sobre el campo. */
function B({
  titulo, alHacer, children, deshabilitado, clase,
}: {
  titulo: string; alHacer: () => void; children: ReactNode; deshabilitado?: boolean; clase?: string;
}) {
  return (
    <button
      type="button" title={titulo} aria-label={titulo} disabled={deshabilitado}
      className={`herramienta ${clase ?? ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={alHacer}
    >
      {children}
    </button>
  );
}

const hoyIso = () => {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function Atajos({ alCerrar }: { alCerrar: () => void }) {
  return (
    <div className="dialogo-fondo" onClick={alCerrar} onKeyDown={(e) => e.key === 'Escape' && alCerrar()}>
      <div className="dialogo panel atajos" role="dialog" aria-label="Atajos de teclado" onClick={(e) => e.stopPropagation()}>
        <header><h2>Atajos de teclado</h2></header>
        <div className="dialogo-cuerpo">
          <p className="chico tenue">Los mismos del jSDR de escritorio.</p>
          <table className="lista">
            <thead><tr><th>Tecla</th><th>Inserta</th><th></th></tr></thead>
            <tbody>
              {CARACTERES.map((c) => (
                <tr key={c.tipo}>
                  <td className="mono apretado">{c.etiqueta}</td>
                  <td><span className={`cc cc-${c.tipo}`}>{c.edicion}</span></td>
                  <td>{c.nombre}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="lista" style={{ marginTop: 12 }}>
            <tbody>
              {OTROS_ATAJOS.map(([t, d]) => (
                <tr key={t}><td className="mono apretado">{t}</td><td>{d}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="acciones">
          <button className="primario" autoFocus onClick={alCerrar}>Cerrar</button>
        </footer>
      </div>
    </div>
  );
}

function Hoja({ x }: { x: Pestana }) {
  const ed = useEditor();
  const k = x.clave;
  const m = x.medidas;
  const seccion = x.secciones.find((s) => s.id === x.n.seccion_id);

  return (
    <div className="editor-hoja">
      <div className="editor-cabecera">
        <label className="dato-ed">
          <span>Versión</span>
          <input className="solo-lectura corto" readOnly tabIndex={-1} value={x.n.numero} />
        </label>
        <label className="dato-ed">
          <span>Guía</span>
          <span className="guia">
            <input
              id={`guia-${k}`} className={x.n.guia_editable ? 'guia-usuario' : 'guia-usuario solo-lectura'}
              readOnly={!x.n.guia_editable} tabIndex={x.n.guia_editable ? 0 : -1}
              value={x.n.guia_usuario} maxLength={10} spellCheck={false}
              onChange={(e) => ed.cambiarGuia(k, e.target.value)}
              title="Hasta 10 letras, números o guion bajo"
            />
            <span>-</span>
            <input className="solo-lectura corto" readOnly tabIndex={-1} value={x.n.guia_auto} />
          </span>
        </label>
        <label className="dato-ed">
          <span>Sección</span>
          <select value={x.n.seccion_id} onChange={(e) => void ed.cambiarSeccion(k, Number(e.target.value))}>
            {x.secciones.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            {!seccion && <option value={x.n.seccion_id}>(sección {x.n.seccion_id})</option>}
          </select>
        </label>
        <label className="dato-ed">
          <span>Fecha</span>
          <input type="date" value={x.n.fecha} min={hoyIso()} onChange={(e) => ed.cambiarFecha(k, e.target.value)} />
        </label>
        <button
          type="button"
          className={`candado ${x.n.confidencial ? 'cerrado' : ''}`}
          aria-pressed={x.n.confidencial}
          title={x.n.confidencial ? 'Noticia Confidencial!' : 'Noticia Pública'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void ed.cambiarConfidencial(k)}
        >
          {x.n.confidencial ? '🔒 Confidencial' : '🔓 Pública'}
        </button>
        <span className={`medida-total ${m.noticia.error ? 'con-error' : ''}`} aria-live="polite">
          {cm(m.noticia.cm)} cm, {m.noticia.lineas} líneas
        </span>
      </div>

      <div className="editor-campos">
        <div className="campo-editor titular">
          <div className="rotulo-campo">
            <button type="button" className="enlace-rotulo" onClick={() => ed.enfocar(k, 'titular')}>
              <u>T</u>itular
            </button>
            <span className={m.titular.error ? 'con-error' : ''}>({cm(m.titular.cm)} - {m.titular.lineas})</span>
          </div>
          <Montaje vista={ed.vista(k, 'titular')} />
        </div>
        <div className="campo-editor cuerpo">
          <div className="rotulo-campo">
            <button type="button" className="enlace-rotulo" onClick={() => ed.enfocar(k, 'cuerpo')}>
              <u>C</u>uerpo
            </button>
            <span className={m.cuerpo.error ? 'con-error' : ''}>{cm(m.cuerpo.cm)}<br />{m.cuerpo.lineas}</span>
          </div>
          <Montaje vista={ed.vista(k, 'cuerpo')} />
        </div>
      </div>

      {x.salida && (
        <section className="editor-salida" aria-label="Resultado de la medición">
          <header>
            <h3>{x.salida.tipo === 'errores' ? 'Errores de la medición' : 'Salida del motor'}</h3>
            <button
              type="button" className="plano" title="Ocultar"
              onMouseDown={(e) => e.preventDefault()} onClick={() => ed.ocultarSalida(k)}
            >
              ✕
            </button>
          </header>
          {x.salida.tipo === 'texto' ? (
            <pre className="salida-texto">{x.salida.texto}</pre>
          ) : (
            <ul className="salida-errores">
              {x.salida.items.map((e, i) => (
                <li key={i}>
                  <button type="button" onClick={() => ed.irAError(k, e)}>
                    <span className="tenue chico">{e.campo} · palabra {e.palabra}</span>
                    {e.mensaje}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="editor-estado" role="status">
        {x.ocupada && <span className="ocupada">{x.ocupada}</span>}
        {x.mensaje && <span className={`msj ${x.mensaje.tipo}`}>{x.mensaje.texto}</span>}
        <span className="crece" />
        <span className="tenue chico">{x.n.estado.replace(/_/g, ' ').toLowerCase()} · {x.n.redactor}</span>
      </div>
    </div>
  );
}

export function Editor() {
  const ed = useEditor();
  const navegar = useNavigate();
  const [atajos, setAtajos] = useState(false);
  const x = ed.pestanas.find((y) => y.clave === ed.activa) ?? null;
  const k = x?.clave ?? '';

  // Teclas de la pantalla, también con el foco fuera de los campos: Alt+T,
  // Alt+C y Alt+N siempre; F2 y F3 desde la cabecera; y que F5, Ctrl+L y
  // compañía no recarguen la página ni se vayan a la barra del navegador.
  const estado = useRef({ ed, x });
  estado.current = { ed, x };
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const { ed: e2, x: activa } = estado.current;
      if (e2.dialogoAbierto) return;
      const enCampo = (e.target as Element | null)?.closest?.('.cm-editor');
      const tecla = e.key.toLowerCase();

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (tecla === 'n') { e.preventDefault(); void e2.nueva(); return; }
        if (activa && (tecla === 't' || tecla === 'c')) {
          e.preventDefault();
          e2.enfocar(activa.clave, tecla === 't' ? 'titular' : 'cuerpo');
          return;
        }
      }
      if (enCampo) return; // dentro del campo manda el keymap de CodeMirror

      if (/^f([1-9]|1[01])$/.test(tecla)) {
        e.preventDefault();
        if (activa && tecla === 'f2') e2.accion(activa.clave, null, 'cerrar');
        if (activa && tecla === 'f3') e2.accion(activa.clave, null, 'medir-noticia');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && ['l', 'f', 'i', 's'].includes(tecla)) {
        e.preventDefault();
        if (activa && tecla === 's') e2.guardar(activa.clave);
        if (activa && tecla === 'f') e2.buscarReemplazar(activa.clave);
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  const conNoticia = !!x;
  const comandoSel = x?.comandos.find((c) => c.id === x.comandoSel);

  return (
    <div className="editor">
      <div className="editor-barra" role="toolbar" aria-label="Editor de noticias">
        <div className="grupo">
          <B titulo="Nueva (Alt+N)" alHacer={() => void ed.nueva()}>Nueva</B>
          <B titulo="Guardar" alHacer={() => void ed.guardar(k)} deshabilitado={!conNoticia}>Guardar</B>
          <B titulo="Cerrar (F2)" alHacer={() => void ed.cerrar(k)} deshabilitado={!conNoticia}>Cerrar</B>
        </div>
        <div className="grupo">
          <B titulo="Buscador de Noticias" alHacer={() => navegar('/noticias')}>Noticias</B>
          <B titulo="Buscador de Cables" alHacer={() => navegar('/cables')}>Cables</B>
        </div>
        <div className="grupo">
          <B titulo="Exportar a PDF" alHacer={() => ed.noDisponible(k, 'Exportar a PDF')} deshabilitado={!conNoticia}>PDF</B>
          <B titulo="Exportar a TXT" alHacer={() => void ed.exportarTxt(k)} deshabilitado={!conNoticia}>TXT</B>
        </div>
        <div className="grupo">
          <B titulo="Revisar Ortografía (Ctrl+I)" alHacer={() => ed.accion(k, null, 'ortografia')} deshabilitado={!conNoticia}>Ortografía</B>
          <B titulo="Medir noticia (F3)" alHacer={() => ed.accion(k, null, 'medir-noticia')} deshabilitado={!conNoticia} clase="destacada">Medir</B>
        </div>
        <div className="grupo">
          <B titulo="Cortar texto" alHacer={() => void ed.portapapeles(k, 'cortar')} deshabilitado={!conNoticia}>Cortar</B>
          <B titulo="Copiar texto" alHacer={() => void ed.portapapeles(k, 'copiar')} deshabilitado={!conNoticia}>Copiar</B>
          <B titulo="Pegar texto" alHacer={() => void ed.portapapeles(k, 'pegar')} deshabilitado={!conNoticia}>Pegar</B>
          <B titulo="Buscar y Reemplazar texto (Ctrl+F)" alHacer={() => ed.buscarReemplazar(k)} deshabilitado={!conNoticia}>Buscar</B>
        </div>
        <div className="grupo">
          <B titulo="Deshacer cambios (Ctrl+Z)" alHacer={() => ed.deshacer(k)} deshabilitado={!conNoticia}>↶</B>
          <B titulo="Rehacer cambios (Ctrl+Y)" alHacer={() => ed.rehacer(k)} deshabilitado={!conNoticia}>↷</B>
        </div>
        <div className="grupo">
          <B titulo="Convertir a Mayúscula" alHacer={() => ed.mayusculas(k, true)} deshabilitado={!conNoticia} clase="letra"><b>M</b></B>
          <B titulo="Convertir a minúscula" alHacer={() => ed.mayusculas(k, false)} deshabilitado={!conNoticia} clase="letra"><b>m</b></B>
        </div>
        <div className="grupo comandos">
          <select
            aria-label="Comando a insertar" disabled={!conNoticia || !x?.comandos.length}
            value={x?.comandoSel ?? ''} onChange={(e) => ed.elegirComando(k, Number(e.target.value))}
            title={comandoSel ? comandoSel.valor : 'Sin comandos para esta sección'}
          >
            {!x?.comandos.length && <option value="">(sin comandos)</option>}
            {x?.comandos.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
          </select>
          <B titulo="Insertar Comando" alHacer={() => ed.insertarComando(k)} deshabilitado={!comandoSel}>Insertar</B>
        </div>
        <span className="crece" />
        <B titulo="Atajos de teclado" alHacer={() => setAtajos(true)} clase="ayuda">?</B>
      </div>

      {ed.pestanas.length === 0 ? (
        <div className="panel editor-vacio">
          <p><strong>No hay noticias abiertas.</strong></p>
          <p className="chico tenue">
            Creá una con <b>Nueva</b> (Alt+N), o abrí una existente desde el{' '}
            <Link to="/noticias">buscador de noticias</Link> con <b>Editar</b>.
          </p>
          <p><button className="primario" onClick={() => void ed.nueva()}>Nueva noticia</button></p>
        </div>
      ) : (
        <>
          <div className="editor-pestanas" role="tablist">
            {ed.pestanas.map((y) => {
              const guardada = y.seGuardo && !y.modPost;
              return (
                <button
                  key={y.clave} role="tab" aria-selected={y.clave === ed.activa}
                  className={y.clave === ed.activa ? 'activa' : ''}
                  onClick={() => ed.setActiva(y.clave)}
                  title={guardada ? 'Guardada' : 'Sin guardar'}
                >
                  <span className={`punto ${guardada ? 'guardada' : 'sin-guardar'}`} aria-hidden="true" />
                  {y.n.guia_usuario || 'Noticia nueva'}
                  {y.n.confidencial && <span aria-label="confidencial"> 🔒</span>}
                </button>
              );
            })}
          </div>
          {x && <Hoja key={x.clave} x={x} />}
        </>
      )}

      {atajos && <Atajos alCerrar={() => setAtajos(false)} />}
    </div>
  );
}

