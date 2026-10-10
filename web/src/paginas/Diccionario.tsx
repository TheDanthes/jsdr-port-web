import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ErrorApi } from '../api/cliente';
import type { PaginaPalabras, ResultadoLista } from '../api/tipos';
import { useEditor } from '../editor/EditorContexto';
import { useSesion } from '../sesion';
import { AvisoError, Cargando, Paginado } from '../componentes/piezas';

/**
 * Administración → Diccionario. Port de AdministradorDiccionarioJPanel, con
 * los mismos mensajes, más lo que pidió la redacción: buscar "contiene",
 * páginas, corregir una palabra y agregar una lista de una vez.
 */
const LIMITE = 100;   // las mismas 100 que traía el Swing, ahora con páginas

type Modo = 'empieza' | 'contiene';

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));
const miles = (n: number) => n.toLocaleString('es-AR');

export function Diccionario() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const modo: Modo = params.get('modo') === 'contiene' ? 'contiene' : 'empieza';
  const offset = Number(params.get('offset') ?? 0);

  const [texto, setTexto] = useState(q);
  const [pagina, setPagina] = useState<PaginaPalabras | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recargar, setRecargar] = useState(0);
  const [editando, setEditando] = useState<string | null>(null);
  const [nueva, setNueva] = useState('');
  const [lista, setLista] = useState('');
  const [resultadoLista, setResultadoLista] = useState<ResultadoLista | null>(null);
  const edicion = useSesion().sesion?.edicion === true;
  const ed = useEditor();
  const campoEditar = useRef<HTMLInputElement>(null);

  // La URL manda (se puede volver atrás y compartir la búsqueda).
  // Se arma sobre la URL del momento (no la de cuando se programó la búsqueda):
  // si se cambia "Contiene" mientras corre la pausa de tipeo, no se pierde.
  // (react-router le pasa al actualizador la URL del render, no la de ahora:
  // por eso se lee de window.location.)
  function ir(cambios: { q?: string; modo?: Modo; offset?: number }) {
    setParams(() => {
      const actual = new URLSearchParams(window.location.search);
      const p = new URLSearchParams();
      const nq = cambios.q ?? actual.get('q') ?? '';
      const nm = cambios.modo ?? (actual.get('modo') === 'contiene' ? 'contiene' : 'empieza');
      const no = cambios.offset ?? 0;
      if (nq) p.set('q', nq);
      if (nm !== 'empieza') p.set('modo', nm);
      if (no) p.set('offset', String(no));
      return p;
    }, { replace: true });
  }

  // Buscar mientras se escribe, con una pausa corta.
  useEffect(() => {
    if (texto === q) return;
    const t = window.setTimeout(() => ir({ q: texto.trim() }), 300);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  useEffect(() => { setTexto(q); }, [q]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    api.diccionario.buscar(q, modo, offset, LIMITE)
      .then((p) => { if (vivo) setPagina(p); })
      .catch((e) => { if (vivo) setError(mensajeDe(e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [q, modo, offset, recargar]);

  useEffect(() => { if (editando) campoEditar.current?.select(); }, [editando]);

  const confirmar = async (titulo: string, mensaje: string) =>
    (await ed.preguntar({
      titulo, mensaje,
      botones: [{ etiqueta: 'Si', valor: 'si', principal: true }, { etiqueta: 'No', valor: 'no' }],
      cancelar: 'no',
    })).boton === 'si';

  const informar = (titulo: string, mensaje: string) =>
    ed.preguntar({ titulo, mensaje, botones: [{ etiqueta: 'Aceptar', valor: 'ok', principal: true }], cancelar: 'ok' });

  // --- agregar ---------------------------------------------------------------

  /** Una palabra: como el Swing (confirma y avisa). Varias: un resumen. */
  async function agregar() {
    const palabras = lista.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (palabras.length === 0) return;
    setAviso(null);
    setResultadoLista(null);

    if (palabras.length === 1) {
      const p = palabras[0]!;
      if (!(await confirmar('Agregar palabra', `¿Está seguro que desea agregar "${p}" al diccionario?`))) {
        await informar('Agregar palabra', `No se agregó "${p}" al diccionario`);
        return;
      }
      try {
        await api.diccionario.agregar(p);
        setLista('');
        setAviso(`La palabra "${p}" se agregó correctamente al diccionario`);
        setRecargar((n) => n + 1);
      } catch (e) {
        await informar('Agregar palabra', mensajeDe(e));
      }
      return;
    }

    if (!(await confirmar('Agregar palabras', `¿Está seguro que desea agregar ${palabras.length} palabras al diccionario?`))) {
      return;
    }
    try {
      const r = await api.diccionario.agregarLista(lista);
      setResultadoLista(r);
      if (r.invalidas.length === 0) setLista('');
      else setLista(r.invalidas.join('\n'));   // quedan a la vista las que no entraron
      setRecargar((n) => n + 1);
    } catch (e) {
      await informar('Agregar palabras', mensajeDe(e));
    }
  }

  // --- corregir y eliminar -------------------------------------------------------

  async function guardarCorreccion(vieja: string) {
    const n = nueva.trim();
    if (!n || n === vieja) { setEditando(null); return; }
    try {
      const r = await api.diccionario.corregir(vieja, n);
      setEditando(null);
      setAviso(r.resultado === 'unificada'
        ? `"${n}" ya estaba en el diccionario: se eliminó "${vieja}".`
        : `Se corrigió "${vieja}" por "${n}".`);
      setRecargar((x) => x + 1);
    } catch (e) {
      await informar('Corregir palabra', mensajeDe(e));
      if (e instanceof ErrorApi && e.codigo === 404) { setEditando(null); setRecargar((x) => x + 1); }
    }
  }

  async function eliminar(p: string) {
    if (!(await confirmar('Eliminar palabra', `¿Está seguro que quiere eliminar la palabra "${p}" del diccionario?`))) return;
    try {
      await api.diccionario.eliminar(p);
      setAviso(`La palabra "${p}" se eliminó correctamente del diccionario`);
      setRecargar((x) => x + 1);
    } catch (e) {
      await informar('Eliminar palabra', mensajeDe(e));
      setRecargar((x) => x + 1);
    }
  }

  const items = pagina?.items ?? [];
  const sinResultados = !cargando && pagina && items.length === 0;

  return (
    <div className="panel diccionario">
      <header>
        <h2>
          <Link to="/administracion" className="tenue" style={{ fontWeight: 400 }}>Administración</Link>
          {' › '}Diccionario
        </h2>
        {pagina?.en_total != null && (
          <span className="chico tenue">{miles(pagina.en_total)} palabras · el que usa la revisión ortográfica</span>
        )}
      </header>

      <div className="dicc">
        <section className="dicc-buscar" aria-label="Buscar palabras">
          <form className="dicc-form" onSubmit={(e) => { e.preventDefault(); ir({ q: texto.trim() }); }}>
            <label htmlFor="dicc-q">Palabra a buscar</label>
            <div className="fila">
              <input
                id="dicc-q" type="search" value={texto} spellCheck={false} autoComplete="off"
                onChange={(e) => setTexto(e.target.value)} placeholder="ej.: rosar"
              />
              <select value={modo} onChange={(e) => ir({ modo: e.target.value as Modo })} aria-label="Cómo buscar">
                <option value="empieza">Empieza con</option>
                <option value="contiene">Contiene</option>
              </select>
              <button type="submit">Buscar</button>
            </div>
          </form>

          {aviso && <div className="aviso info" role="status">{aviso}</div>}
          {error && <AvisoError>{error}</AvisoError>}
          {cargando && !pagina && <Cargando que="Buscando en el diccionario" />}

          {sinResultados && (
            <p className="vacio">
              {q
                ? `No se encontraron palabras en el diccionario que ${modo === 'contiene' ? 'contengan' : 'comiencen con'} "${q}"`
                : 'El diccionario está vacío.'}
            </p>
          )}

          {items.length > 0 && (
            <>
              <p className="chico tenue" style={{ margin: '10px 0 6px' }}>Palabras encontradas:</p>
              <ul className={`dicc-palabras ${cargando ? 'cargando-suave' : ''}`}>
                {items.map((p) => (
                  <li key={p} className={editando === p ? 'editando' : ''}>
                    {editando === p ? (
                      <form
                        className="dicc-editar"
                        onSubmit={(e) => { e.preventDefault(); void guardarCorreccion(p); }}
                      >
                        <input
                          ref={campoEditar} type="text" value={nueva} spellCheck={false}
                          aria-label={`Corregir "${p}"`} maxLength={30}
                          onChange={(e) => setNueva(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Escape') setEditando(null); }}
                        />
                        <button type="submit" className="primario">Guardar</button>
                        <button type="button" onClick={() => setEditando(null)}>Cancelar</button>
                      </form>
                    ) : (
                      <>
                        <span className="palabra">{p}</span>
                        {edicion && (
                          <span className="dicc-acciones">
                            <button
                              type="button" className="plano" title={`Corregir "${p}"`}
                              onClick={() => { setEditando(p); setNueva(p); }}
                            >
                              Corregir
                            </button>
                            <button
                              type="button" className="plano peligro" title={`Eliminar "${p}"`}
                              onClick={() => void eliminar(p)}
                            >
                              Eliminar
                            </button>
                          </span>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <Paginado
                total={pagina!.total} totalExacto={pagina!.total_exacto} hayMas={pagina!.hay_mas}
                mostrados={items.length} offset={offset} limite={LIMITE}
                alIr={(o) => ir({ offset: o })}
              />
            </>
          )}
        </section>

        {edicion && (
          <aside className="dicc-agregar" aria-label="Agregar palabras">
            <h3>Agregar</h3>
            <label htmlFor="dicc-nueva">Palabra nueva</label>
            <textarea
              id="dicc-nueva" rows={6} value={lista} spellCheck={false}
              onChange={(e) => setLista(e.target.value)}
              onKeyDown={(e) => {
                // Enter agrega si es una sola palabra; para varias, Ctrl+Enter.
                if (e.key === 'Enter' && (e.ctrlKey || !lista.trim().includes('\n'))) {
                  if (!e.shiftKey) { e.preventDefault(); void agregar(); }
                }
              }}
              placeholder={'Una palabra, o varias:\nseparadas por espacios, comas\no una por renglón'}
            />
            <button type="button" className="primario" onClick={() => void agregar()} disabled={!lista.trim()}>
              Agregar
            </button>
            <p className="chico tenue">
              Enter agrega (Shift+Enter, otro renglón). Sólo letras, con acentos y ñ, hasta 30.
              Se respetan las mayúsculas: "Rosario" no vale para "rosario".
            </p>
            {resultadoLista && (
              <div className="dicc-resumen" role="status">
                <p><b>{resultadoLista.agregadas.length}</b> agregadas
                  {resultadoLista.agregadas.length > 0 && `: ${resultadoLista.agregadas.join(', ')}`}</p>
                {resultadoLista.ya_estaban.length > 0 && (
                  <p><b>{resultadoLista.ya_estaban.length}</b> ya estaban: {resultadoLista.ya_estaban.join(', ')}</p>
                )}
                {resultadoLista.invalidas.length > 0 && (
                  <p className="peligro">
                    <b>{resultadoLista.invalidas.length}</b> no son palabras válidas (quedaron arriba para
                    corregirlas): {resultadoLista.invalidas.join(', ')}
                  </p>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
