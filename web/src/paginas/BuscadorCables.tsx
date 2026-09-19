import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, descargar } from '../api/cliente';
import type { Agencia, Cable, Pagina, Reserva } from '../api/tipos';
import {
  AvisoError, Cargando, Etiqueta, Paginado, Resaltado, ThOrden, Vacio,
  fecha, hora, textoMedida,
} from '../componentes/piezas';

const LIMITE = 30;   // Constants.FIND_CABLES_LIMIT

interface Formulario {
  texto: string; tema: string; numero: string;
  desde: string; hasta: string; prioridad: string; agencias: string[];
}

const VACIO: Formulario = {
  texto: '', tema: '', numero: '', desde: '', hasta: '', prioridad: '', agencias: [],
};

const multi = (p: URLSearchParams, k: string) => {
  const v = p.get(k);
  return v ? v.split(',').filter(Boolean) : [];
};

/** Panel lateral con el cable elegido: texto completo y quién lo reservó. */
function DetalleCable({ id, alCerrar }: { id: number; alCerrar: () => void }) {
  const [cable, setCable] = useState<Cable | null>(null);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCable(null);
    setError(null);

    Promise.all([api.cable(id), api.reservas(id)])
      .then(([c, r]) => { if (vivo) { setCable(c); setReservas(r); } })
      .catch((e) => { if (vivo) setError(e.message); });

    return () => { vivo = false; };
  }, [id]);

  if (error) return <div className="panel" style={{ padding: 14 }}><AvisoError>{error}</AvisoError></div>;
  if (!cable) return <div className="panel"><Cargando que="Abriendo el cable" /></div>;

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <header>
        <h2>
          {cable.agencia.codigo} · {cable.numero}
          <span className="tenue chico" style={{ fontWeight: 400, marginLeft: 8 }}>
            {fecha(cable.fecha_recepcion)} {hora(cable.hora_recepcion)}
          </span>
        </h2>
        <div className="acciones">
          {cable.prioridad && (
            <Etiqueta clase={`prioridad-${cable.prioridad}`}>
              prioridad {cable.prioridad}
            </Etiqueta>
          )}
          <span className="chico tenue">{textoMedida(cable.medida)}</span>
          <button onClick={() => descargar(`/api/cables/${cable.id}/texto`, `cable-${cable.id}.txt`)}>
            Exportar texto
          </button>
          <button className="plano" onClick={alCerrar}>Cerrar</button>
        </div>
      </header>

      {reservas.length > 0 && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--borde-suave)' }}>
          <span className="chico tenue">Reservado por: </span>
          <span className="chico">
            {reservas.map((r) => `${r.username} (${fecha(r.fecha)})`).join(' · ')}
          </span>
        </div>
      )}

      <div className="cable-cuerpo">
        <p className="cable-titulo">{cable.titulo}</p>
        {cable.tema && <p className="cable-tema">{cable.tema}</p>}
        {cable.cuerpo && <div className="cable-texto">{cable.cuerpo}</div>}
      </div>
    </div>
  );
}

export function BuscadorCables() {
  const [params, setParams] = useSearchParams();

  const desdeUrl = useMemo<Formulario>(() => ({
    texto: params.get('texto') ?? '',
    tema: params.get('tema') ?? '',
    numero: params.get('numero') ?? '',
    desde: params.get('desde') ?? '',
    hasta: params.get('hasta') ?? '',
    prioridad: params.get('prioridad') ?? '',
    agencias: multi(params, 'agencias'),
  }), [params]);

  const orden = params.get('orden') ?? 'fecha';
  const asc = params.get('asc') === 'true';
  const offset = Number(params.get('offset') ?? 0);
  const abierto = params.get('cable') ? Number(params.get('cable')) : null;

  const [form, setForm] = useState<Formulario>(desdeUrl);
  useEffect(() => { setForm(desdeUrl); }, [desdeUrl]);

  const [agencias, setAgencias] = useState<Agencia[]>([]);
  const [pagina, setPagina] = useState<Pagina<Cable> | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    api.agencias().then(setAgencias).catch(() => { /* ayuda, no requisito */ });
  }, []);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);

    api.cables({
      texto: desdeUrl.texto || undefined,
      tema: desdeUrl.tema || undefined,
      numero: desdeUrl.numero || undefined,
      desde: desdeUrl.desde || undefined,
      hasta: desdeUrl.hasta || undefined,
      prioridad: desdeUrl.prioridad || undefined,
      agencias: desdeUrl.agencias.join(',') || undefined,
      orden, asc, offset, limite: LIMITE,
    })
      .then((p) => { if (vivo) setPagina(p); })
      .catch((e) => { if (vivo) setError(e.message); })
      .finally(() => { if (vivo) setCargando(false); });

    return () => { vivo = false; };
  }, [desdeUrl, orden, asc, offset]);

  function aplicar() {
    const p = new URLSearchParams();
    if (form.texto) p.set('texto', form.texto);
    if (form.tema) p.set('tema', form.tema);
    if (form.numero) p.set('numero', form.numero);
    if (form.desde) p.set('desde', form.desde);
    if (form.hasta) p.set('hasta', form.hasta);
    if (form.prioridad) p.set('prioridad', form.prioridad);
    if (form.agencias.length) p.set('agencias', form.agencias.join(','));
    if (orden !== 'fecha') p.set('orden', orden);
    if (asc) p.set('asc', 'true');
    setParams(p);
  }

  function cambiarParam(f: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(params);
    f(p);
    setParams(p);
  }

  const ordenarPor = (clave: string) => cambiarParam((p) => {
    if (orden === clave) p.set('asc', String(!asc));
    else { p.set('orden', clave); p.delete('asc'); }
    p.delete('offset');
  });

  const irA = (nuevo: number) => cambiarParam((p) => {
    if (nuevo) p.set('offset', String(nuevo)); else p.delete('offset');
  });

  const abrir = (id: number) => cambiarParam((p) => p.set('cable', String(id)));
  const cerrar = () => cambiarParam((p) => p.delete('cable'));

  async function exportar() {
    setExportando(true);
    setError(null);
    try {
      const p = new URLSearchParams(params);
      p.delete('offset'); p.delete('cable');
      await descargar(`/api/cables.csv?${p}`, 'cables.csv');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar');
    } finally {
      setExportando(false);
    }
  }

  const hayFiltros = JSON.stringify(desdeUrl) !== JSON.stringify(VACIO);

  return (
    <>
      {abierto !== null && <DetalleCable id={abierto} alCerrar={cerrar} />}

      <div className="panel">
        <header>
          <h2>Buscador de cables</h2>
          <div className="acciones">
            <button onClick={exportar} disabled={exportando || !pagina?.total}>
              {exportando ? 'Exportando…' : 'Exportar CSV'}
            </button>
          </div>
        </header>

        <form onSubmit={(e) => { e.preventDefault(); aplicar(); }}>
        <div className="filtros">
          <div className="campo ancho">
            <label htmlFor="c-texto">Cable (título)</label>
            <input
              id="c-texto" type="search" value={form.texto}
              onChange={(e) => setForm({ ...form, texto: e.target.value })}
            />
          </div>

          <div className="campo">
            <label htmlFor="c-tema">Tema</label>
            <input
              id="c-tema" type="search" value={form.tema}
              onChange={(e) => setForm({ ...form, tema: e.target.value })}
            />
          </div>

          <div className="campo">
            <label htmlFor="c-numero">Número</label>
            <input
              id="c-numero" type="number" value={form.numero}
              onChange={(e) => setForm({ ...form, numero: e.target.value })}
            />
          </div>

          <div className="campo">
            <label htmlFor="c-prioridad">Prioridad</label>
            <input
              id="c-prioridad" type="text" value={form.prioridad}
              onChange={(e) => setForm({ ...form, prioridad: e.target.value })}
              maxLength={2}
            />
          </div>

          <div className="campo">
            <label htmlFor="c-desde">Recibido desde</label>
            <input
              id="c-desde" type="date" value={form.desde}
              onChange={(e) => setForm({ ...form, desde: e.target.value })}
            />
          </div>

          <div className="campo">
            <label htmlFor="c-hasta">hasta</label>
            <input
              id="c-hasta" type="date" value={form.hasta}
              onChange={(e) => setForm({ ...form, hasta: e.target.value })}
            />
          </div>

          <div className="campo">
            <label htmlFor="c-agencias">Agencias</label>
            <select
              id="c-agencias" multiple value={form.agencias}
              onChange={(e) => setForm({
                ...form,
                agencias: [...e.target.selectedOptions].map((o) => o.value),
              })}
            >
              {agencias.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} — {a.nombre}{a.habilitada ? '' : ' (baja)'}
                </option>
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
                    <ThOrden clave="agencia" etiqueta="Agencia" orden={orden} asc={asc} alOrdenar={ordenarPor} />
                    <ThOrden clave="numero" etiqueta="Nº" orden={orden} asc={asc} alOrdenar={ordenarPor} className="num" />
                    <ThOrden clave="prioridad" etiqueta="Pr." orden={orden} asc={asc} alOrdenar={ordenarPor} />
                    <ThOrden clave="titulo" etiqueta="Cable" orden={orden} asc={asc} alOrdenar={ordenarPor} />
                    <ThOrden clave="fecha" etiqueta="Recibido" orden={orden} asc={asc} alOrdenar={ordenarPor} />
                    <th>Reservado</th>
                    <th className="num">Medida</th>
                  </tr>
                </thead>
                <tbody>
                  {pagina.items.map((c) => (
                    <tr
                      key={c.id}
                      className={`clicable ${c.leido === false ? 'no-leido' : ''}`}
                      onClick={() => abrir(c.id)}
                    >
                      <td className="apretado">{c.agencia.codigo}</td>
                      <td className="num">{c.numero}</td>
                      <td className="apretado">
                        {c.prioridad
                          ? <Etiqueta clase={`prioridad-${c.prioridad}`}>{c.prioridad}</Etiqueta>
                          : '—'}
                      </td>
                      <td>
                        <div className="titulo-celda">
                          <span className="titulo">
                            <Resaltado texto={c.titulo} busca={desdeUrl.texto} />
                          </span>
                          {c.tema && <span className="bajada">{c.tema}</span>}
                        </div>
                      </td>
                      <td className="apretado">
                        {fecha(c.fecha_recepcion)} <span className="tenue">{hora(c.hora_recepcion)}</span>
                      </td>
                      <td className="apretado chico">{c.reservado_por ?? '—'}</td>
                      <td className="num apretado tenue chico">{textoMedida(c.medida)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagina.items.length === 0 && !cargando && (
              <Vacio
                titulo="Ningún cable coincide"
                detalle="Los cables se depuran solos a los 1 a 3 días según la agencia: la tabla es una ventana móvil, no un archivo."
              />
            )}

            <Paginado
              total={pagina.total} offset={pagina.offset} limite={pagina.limite} alIr={irA}
            />
          </>
        )}
      </div>
    </>
  );
}
