import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, descargar } from '../api/cliente';
import { ESTADOS, NIVELES, type Noticia, type Pagina, type Seccion, type Usuario } from '../api/tipos';
import {
  AvisoError, Cargando, EstadoNoticia, MarcasVersion, Paginado, Resaltado,
  ThOrden, Vacio, fecha, textoMedida,
} from '../componentes/piezas';

const LIMITE = 30;   // Constants.FIND_NOTICIAS_LIMIT

/** Campos del formulario, tal como viajan en la URL. */
interface Formulario {
  texto: string; guia: string; redactor: string;
  desde: string; hasta: string; estado: string;
  secciones: string[]; niveles: string[];
}

const VACIO: Formulario = {
  texto: '', guia: '', redactor: '', desde: '', hasta: '', estado: '',
  secciones: [], niveles: [],
};

const multi = (p: URLSearchParams, k: string) => {
  const v = p.get(k);
  return v ? v.split(',').filter(Boolean) : [];
};

export function BuscadorNoticias() {
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();

  // Lo que se ve en la URL manda: es lo que se comparte y lo que recuerda el
  // botón "atrás". El formulario arranca de ahí.
  const desdeUrl = useMemo<Formulario>(() => ({
    texto: params.get('texto') ?? '',
    guia: params.get('guia') ?? '',
    redactor: params.get('redactor') ?? '',
    desde: params.get('desde') ?? '',
    hasta: params.get('hasta') ?? '',
    estado: params.get('estado') ?? '',
    secciones: multi(params, 'secciones'),
    niveles: multi(params, 'niveles'),
  }), [params]);

  const orden = params.get('orden') ?? 'fecha';
  const asc = params.get('asc') === 'true';
  const offset = Number(params.get('offset') ?? 0);

  const [form, setForm] = useState<Formulario>(desdeUrl);
  useEffect(() => { setForm(desdeUrl); }, [desdeUrl]);

  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [pagina, setPagina] = useState<Pagina<Noticia> | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    Promise.all([api.secciones(), api.usuarios()])
      .then(([s, u]) => { setSecciones(s); setUsuarios(u); })
      .catch(() => { /* los catálogos son ayuda: si fallan, el buscador sigue */ });
  }, []);

  // La consulta se dispara con la URL, no con cada tecla.
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);

    api.noticias({
      texto: desdeUrl.texto || undefined,
      guia: desdeUrl.guia || undefined,
      redactor: desdeUrl.redactor || undefined,
      desde: desdeUrl.desde || undefined,
      hasta: desdeUrl.hasta || undefined,
      estado: desdeUrl.estado || undefined,
      secciones: desdeUrl.secciones.join(',') || undefined,
      niveles: desdeUrl.niveles.join(',') || undefined,
      orden, asc, offset, limite: LIMITE,
    })
      .then((p) => { if (vivo) setPagina(p); })
      .catch((e) => { if (vivo) setError(e.message); })
      .finally(() => { if (vivo) setCargando(false); });

    return () => { vivo = false; };
  }, [desdeUrl, orden, asc, offset]);

  function aplicar(cambios: Partial<Formulario>, reiniciarPagina = true) {
    const f = { ...form, ...cambios };
    const p = new URLSearchParams();
    if (f.texto) p.set('texto', f.texto);
    if (f.guia) p.set('guia', f.guia);
    if (f.redactor) p.set('redactor', f.redactor);
    if (f.desde) p.set('desde', f.desde);
    if (f.hasta) p.set('hasta', f.hasta);
    if (f.estado) p.set('estado', f.estado);
    if (f.secciones.length) p.set('secciones', f.secciones.join(','));
    if (f.niveles.length) p.set('niveles', f.niveles.join(','));
    if (orden !== 'fecha') p.set('orden', orden);
    if (asc) p.set('asc', 'true');
    if (!reiniciarPagina && offset) p.set('offset', String(offset));
    setParams(p);
  }

  function ordenarPor(clave: string) {
    const p = new URLSearchParams(params);
    if (orden === clave) p.set('asc', String(!asc));
    else { p.set('orden', clave); p.delete('asc'); }
    p.delete('offset');
    setParams(p);
  }

  function irA(nuevoOffset: number) {
    const p = new URLSearchParams(params);
    if (nuevoOffset) p.set('offset', String(nuevoOffset));
    else p.delete('offset');
    setParams(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function exportar() {
    setExportando(true);
    setError(null);
    try {
      const p = new URLSearchParams(params);
      p.delete('offset');
      await descargar(`/api/noticias.csv?${p}`, 'noticias.csv');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar');
    } finally {
      setExportando(false);
    }
  }

  const hayFiltros = JSON.stringify(desdeUrl) !== JSON.stringify(VACIO);

  return (
    <div className="panel">
      <header>
        <h2>Buscador de noticias</h2>
        <div className="acciones">
          <button onClick={exportar} disabled={exportando || !pagina?.total}>
            {exportando ? 'Exportando…' : 'Exportar CSV'}
          </button>
        </div>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); aplicar({}); }}>
      <div className="filtros">
        <div className="campo ancho">
          <label htmlFor="f-texto">Noticia (título)</label>
          <input
            id="f-texto" type="search" value={form.texto}
            onChange={(e) => setForm({ ...form, texto: e.target.value })}
            placeholder="palabras del título"
          />
        </div>

        <div className="campo">
          <label htmlFor="f-guia">Guía</label>
          <input
            id="f-guia" type="search" value={form.guia}
            onChange={(e) => setForm({ ...form, guia: e.target.value })}
          />
        </div>

        <div className="campo">
          <label htmlFor="f-redactor">Redactor</label>
          <input
            id="f-redactor" list="lista-redactores" value={form.redactor}
            onChange={(e) => setForm({ ...form, redactor: e.target.value })}
            placeholder="usuario exacto"
          />
          <datalist id="lista-redactores">
            {usuarios.map((u) => (
              <option key={u.id} value={u.username}>{u.nombre_apellido ?? ''}</option>
            ))}
          </datalist>
        </div>

        <div className="campo">
          <label htmlFor="f-estado">Estado</label>
          <select
            id="f-estado" value={form.estado}
            onChange={(e) => setForm({ ...form, estado: e.target.value })}
          >
            <option value="">(todos)</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>{e.replace(/_/g, ' ').toLowerCase()}</option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="f-desde">Publicación desde</label>
          <input
            id="f-desde" type="date" value={form.desde}
            onChange={(e) => setForm({ ...form, desde: e.target.value })}
          />
        </div>

        <div className="campo">
          <label htmlFor="f-hasta">hasta</label>
          <input
            id="f-hasta" type="date" value={form.hasta}
            onChange={(e) => setForm({ ...form, hasta: e.target.value })}
          />
        </div>

        <div className="campo">
          <label htmlFor="f-secciones">Secciones</label>
          <select
            id="f-secciones" multiple value={form.secciones}
            onChange={(e) => setForm({
              ...form,
              secciones: [...e.target.selectedOptions].map((o) => o.value),
            })}
          >
            {secciones.map((s) => (
              <option key={s.id} value={s.id}>{s.codigo} — {s.nombre}</option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="f-niveles">Nivel</label>
          <select
            id="f-niveles" multiple value={form.niveles}
            onChange={(e) => setForm({
              ...form,
              niveles: [...e.target.selectedOptions].map((o) => o.value),
            })}
          >
            {Object.entries(NIVELES).map(([n, etiqueta]) => (
              <option key={n} value={n}>{n} — {etiqueta}</option>
            ))}
          </select>
        </div>

      </div>

        <div className="filtros-pie">
          <button type="submit" className="primario">Buscar</button>
          {hayFiltros && (
            <button
              type="button" className="plano"
              onClick={() => setParams(new URLSearchParams())}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </form>

      {error && <div style={{ padding: '0 14px 14px' }}><AvisoError>{error}</AvisoError></div>}

      {cargando && !pagina && <Cargando />}

      {pagina && (
        <>
          <div className="tabla-marco">
            <table className="lista">
              <thead>
                <tr>
                  <ThOrden clave="guia" etiqueta="Guía" orden={orden} asc={asc} alOrdenar={ordenarPor} />
                  <ThOrden clave="seccion" etiqueta="Secc." orden={orden} asc={asc} alOrdenar={ordenarPor} />
                  <ThOrden clave="titulo" etiqueta="Noticia" orden={orden} asc={asc} alOrdenar={ordenarPor} />
                  <ThOrden clave="estado" etiqueta="Estado" orden={orden} asc={asc} alOrdenar={ordenarPor} />
                  <ThOrden clave="nivel" etiqueta="Niv." orden={orden} asc={asc} alOrdenar={ordenarPor} className="num" />
                  <ThOrden clave="redactor" etiqueta="Redactor" orden={orden} asc={asc} alOrdenar={ordenarPor} />
                  <ThOrden clave="fecha" etiqueta="Publicación" orden={orden} asc={asc} alOrdenar={ordenarPor} />
                  <th className="num">Medida</th>
                </tr>
              </thead>
              <tbody>
                {pagina.items.map((n) => {
                  const v = n.version!;
                  return (
                    <tr
                      key={n.id}
                      className="clicable"
                      onClick={() => navegar(`/noticias/${n.id}`)}
                    >
                      <td className="mono apretado">{n.guia ?? '—'}</td>
                      <td className="apretado">{v.seccion.codigo}</td>
                      <td>
                        <div className="titulo-celda">
                          {v.volanta && <span className="volanta">{v.volanta}</span>}
                          <span className="titulo">
                            <Resaltado texto={v.titulo} busca={desdeUrl.texto} />
                          </span>
                          {v.bajada && <span className="bajada">{v.bajada}</span>}
                        </div>
                      </td>
                      <td className="apretado">
                        <EstadoNoticia estado={v.estado} /> <MarcasVersion v={v} />
                      </td>
                      <td className="num">{v.nivel ?? '—'}</td>
                      <td className="apretado">{v.redactor}</td>
                      <td className="apretado">{fecha(v.fecha_publicacion)}</td>
                      <td className="num apretado tenue chico">{textoMedida(v.medida)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pagina.items.length === 0 && !cargando && (
            <Vacio
              titulo="Ninguna noticia coincide"
              detalle={hayFiltros ? 'Probá quitando algún filtro.' : undefined}
            />
          )}

          <Paginado
            total={pagina.total}
            totalExacto={pagina.total_exacto}
            hayMas={pagina.hay_mas}
            mostrados={pagina.items.length}
            offset={pagina.offset}
            limite={pagina.limite}
            alIr={irA}
          />
        </>
      )}
    </div>
  );
}
