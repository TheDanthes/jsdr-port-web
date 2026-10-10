import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, descargar } from '../api/cliente';
import { useSesion } from '../sesion';
import { useEditor } from '../editor/EditorContexto';
import type { Bloqueo, Medida, Noticia, Version } from '../api/tipos';
import {
  AvisoError, Cargando, Dato, EstadoNoticia, MarcasVersion, Vacio,
  fecha, textoMedida,
} from '../componentes/piezas';

function CampoNota({
  rotulo, medida, clase, texto,
}: {
  rotulo: string; medida?: Medida; clase: string; texto: string | null;
}) {
  if (!texto) return null;
  return (
    <div className="campo-nota">
      <div className="rotulo">
        {rotulo}
        {medida && <span className="medida">{textoMedida(medida)}</span>}
      </div>
      <div className={clase}>{texto}</div>
    </div>
  );
}

export function DetalleNoticia() {
  const { id } = useParams();
  const navegar = useNavigate();

  const [noticia, setNoticia] = useState<Noticia | null>(null);
  const [activa, setActiva] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [recargar, setRecargar] = useState(0);
  const [bloqueo, setBloqueo] = useState<Bloqueo | null>(null);
  /** Mirando lo autoguardado ("Recuperado") en vez de una versión. */
  const [viendoRecuperado, setViendoRecuperado] = useState(false);
  const edicion = useSesion().sesion?.edicion === true;
  const ed = useEditor();

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);

    setBloqueo(null);
    setViendoRecuperado(false);
    api.noticia(Number(id))
      .then(async (n) => {
        if (!vivo) return;
        setNoticia(n);
        setActiva(n.numero_version_activa);
        // Si está EN_EDICION: quién la tiene y si quedó algo para recuperar.
        const activaV = n.versiones?.find((x) => x.numero === n.numero_version_activa);
        if (activaV?.estado === 'EN_EDICION') {
          const b = await api.bloqueo(n.id).catch(() => null);
          if (vivo) setBloqueo(b);
        }
      })
      .catch((e) => { if (vivo) setError(e.message); })
      .finally(() => { if (vivo) setCargando(false); });

    return () => { vivo = false; };
  }, [id, recargar]);

  if (cargando) return <Cargando que="Abriendo la noticia" />;

  if (error) {
    return (
      <div className="panel" style={{ padding: 14 }}>
        <AvisoError>{error}</AvisoError>
        <p style={{ marginTop: 12 }}>
          <button onClick={() => navegar(-1)}>‹ Volver</button>
        </p>
      </div>
    );
  }

  if (!noticia?.versiones?.length) {
    return <Vacio titulo="No hay nada que mostrar" />;
  }

  const v: Version =
    noticia.versiones.find((x) => x.numero === activa) ?? noticia.versiones[0]!;
  const esActiva = v.numero === noticia.numero_version_activa;
  const b = bloqueo?.bloqueada ? bloqueo : null;
  const recuperado = b?.para_recuperar ? b.temporal : null;
  const verRecuperado = viendoRecuperado && recuperado !== null;

  /** La retoma en el editor con lo autoguardado (sólo su redactor). */
  async function recuperar() {
    if (await ed.abrir(noticia!.id)) navegar('/editor');
  }

  /**
   * Un usuario de nivel superior la destraba sin abrirla: se queda con lo
   * autoguardado o lo descarta (lo que hacía la ventana de restauración del
   * Swing, pero desde la ficha y no sólo para el redactor).
   */
  async function destrabar() {
    if (!b) return;
    const botones = [
      ...(b.temporal ? [{ etiqueta: 'Guardar lo recuperado', valor: 'guardar', principal: true }] : []),
      { etiqueta: 'Descartar lo recuperado', valor: 'descartar' },
      { etiqueta: 'Cancelar', valor: 'cancelar' },
    ];
    const r = await ed.preguntar({
      titulo: 'Destrabar noticia',
      mensaje: `La noticia quedó abierta por ${b.redactor} y nadie la está usando. `
        + (b.temporal
          ? '¿Qué hacemos con lo que había quedado sin guardar? (se puede ver en "Recuperado", en la lista de versiones)'
          : 'No hay nada autoguardado: se destraba como estaba guardada.'),
      botones,
      cancelar: 'cancelar',
    });
    if (r.boton !== 'guardar' && r.boton !== 'descartar') return;
    setErrorAccion(null);
    setAviso(null);
    try {
      const x = await api.destrabar(noticia!.id, r.boton);
      if (x.resultado === 'borrada') {
        await ed.preguntar({
          titulo: 'Destrabar noticia',
          mensaje: 'La noticia nunca se había guardado: se descartó entera.',
          botones: [{ etiqueta: 'Aceptar', valor: 'ok', principal: true }],
          cancelar: 'ok',
        });
        navegar('/noticias');
        return;
      }
      setAviso({
        guardada: 'Se destrabó la noticia guardando lo recuperado.',
        version_descartada: 'Se destrabó la noticia: la versión nueva no tenía cambios y se descartó.',
        destrabada: 'Se destrabó la noticia como estaba guardada.',
      }[x.resultado]);
      setRecargar((n) => n + 1);
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : 'No se pudo destrabar la noticia');
    }
  }

  /** BuscadorNoticiasJPanel.editarNoticia: confirma y abre en el editor. */
  async function editar() {
    const r = await ed.preguntar({
      titulo: 'Buscador de Noticias', mensaje: '¿Quiere editar la noticia?',
      botones: [{ etiqueta: 'Sí', valor: 'si', principal: true }, { etiqueta: 'No', valor: 'no' }],
      cancelar: 'no',
    });
    if (r.boton !== 'si') return;
    if (await ed.abrir(noticia!.id)) navegar('/editor');
  }

  /** BuscadorNoticiasJPanel.fotocomponerNoticia. */
  async function fotocomponer() {
    const r = await ed.preguntar({
      titulo: 'Buscador de Noticias', mensaje: '¿Quiere fotocomponer la noticia?',
      botones: [{ etiqueta: 'Sí', valor: 'si', principal: true }, { etiqueta: 'No', valor: 'no' }],
      cancelar: 'no',
    });
    if (r.boton !== 'si') return;
    setErrorAccion(null);
    setAviso(null);
    try {
      const f = await api.fotocomponer(noticia!.id);
      const avisos = f.avisos.length
        ? ` Atención, el motor avisó: ${f.avisos.map((a) => `línea ${a.linea}: ${a.mensaje}`).join('; ')}.`
        : '';
      setAviso(`Noticia fotocompuesta. Quedó en la carpeta "${f.carpeta}" para InDesign.${avisos}`);
      setRecargar((n) => n + 1);
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : 'Se ha producido un error al fotocomponer la noticia');
    }
  }

  async function exportarTexto() {
    try {
      await descargar(
        `/api/noticias/${noticia!.id}/versiones/${v.numero}/texto`,
        `noticia-${noticia!.id}-v${v.numero}.txt`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar');
    }
  }

  return (
    <>
      <div className="fila" style={{ marginBottom: 12 }}>
        <button onClick={() => navegar(-1)}>‹ Volver</button>
        <Link to="/noticias" className="chico tenue">Buscador de noticias</Link>
      </div>

      <div className="detalle">
        <aside className="panel">
          <header>
            <h2>Versiones</h2>
            <span className="chico tenue">{noticia.versiones.length}</span>
          </header>
          <ul className="versiones-lista">
            {recuperado && (
              <li>
                <button
                  className={`recuperado ${verRecuperado ? 'activa' : ''}`}
                  onClick={() => setViendoRecuperado(true)}
                  title="Lo último autoguardado de la noticia que quedó abierta"
                >
                  <span className="linea-1">
                    <span className="nro">Recuperado</span>
                    <span className="etiqueta recuperar">sin guardar</span>
                  </span>
                  <span className="meta">
                    {fecha(recuperado.fecha_publicacion)} · {b!.redactor}
                  </span>
                  <span className="meta">
                    {b!.autoguardado
                      ? `autoguardado ${new Date(b!.autoguardado).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
                      : `de la versión ${recuperado.numero}`}
                  </span>
                </button>
              </li>
            )}
            {noticia.versiones.map((x) => (
              <li key={x.numero}>
                <button
                  className={x.numero === v.numero && !verRecuperado ? 'activa' : ''}
                  onClick={() => { setActiva(x.numero); setViendoRecuperado(false); }}
                >
                  <span className="linea-1">
                    <span className="nro">v{x.numero}</span>
                    {x.numero === noticia.numero_version_activa && (
                      <span className="etiqueta">activa</span>
                    )}
                  </span>
                  <span className="meta">
                    {fecha(x.fecha_publicacion)} · {x.redactor}
                  </span>
                  <span className="meta">
                    {x.estado.replace(/_/g, ' ').toLowerCase()} · {textoMedida(x.medida)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <article className="panel">
          <header>
            <h2>
              {noticia.guia ?? `Noticia ${noticia.id}`}
              {!esActiva && (
                <span className="tenue chico" style={{ fontWeight: 400, marginLeft: 8 }}>
                  viendo una versión anterior
                </span>
              )}
            </h2>
            <div className="acciones">
              <MarcasVersion v={v} />
              {edicion && esActiva && b?.puede === 'recuperar' && (
                <button className="primario" onClick={() => void recuperar()}>
                  {b.para_recuperar ? 'Recuperar' : 'Continuar acá'}
                </button>
              )}
              {edicion && esActiva && b?.puede === 'destrabar' && (
                <button className="primario" onClick={() => void destrabar()}>Destrabar</button>
              )}
              {edicion && esActiva && !b && (
                <>
                  <button className="primario" onClick={() => void editar()}>Editar</button>
                  <button onClick={() => void fotocomponer()}>Fotocomponer</button>
                </>
              )}
              <button onClick={exportarTexto}>Exportar texto</button>
            </div>
          </header>

          {b && (
            <div style={{ padding: '10px 14px 0' }}>
              <div className={`aviso ${b.para_recuperar ? 'recuperar' : 'info'}`} role="status">
                {b.abierta_ahora_por
                  ? `La está usando ${b.abierta_ahora_por} en este momento.`
                  : `Quedó abierta por ${b.redactor} sin cerrar y nadie la está usando.`}
                {b.para_recuperar && b.puede === 'recuperar' && ' Recupérela para seguir y guardarla.'}
                {b.para_recuperar && b.puede === 'destrabar' && ' Puede destrabarla.'}
                {b.porque && b.para_recuperar && ` ${b.porque}.`.replace('..', '.')}
              </div>
            </div>
          )}
          {aviso && <div style={{ padding: '10px 14px 0' }}><div className="aviso info" role="status">{aviso}</div></div>}
          {errorAccion && <div style={{ padding: '10px 14px 0' }}><AvisoError>{errorAccion}</AvisoError></div>}

          {verRecuperado ? (
            <>
              <div className="ficha">
                <Dato rotulo="Sección">{recuperado.seccion.codigo} — {recuperado.seccion.nombre}</Dato>
                <Dato rotulo="Estado"><EstadoNoticia estado="EN_EDICION" paraRecuperar /></Dato>
                <Dato rotulo="Publicación">{fecha(recuperado.fecha_publicacion)}</Dato>
                <Dato rotulo="Redactor">{b!.redactor}</Dato>
                <Dato rotulo="Guía">{recuperado.guia ?? '—'}</Dato>
              </div>
              <div className="nota">
                <CampoNota rotulo="Titular" clase="titular-texto" texto={recuperado.titular} />
                <CampoNota rotulo="Cuerpo" clase="cuerpo-texto" texto={recuperado.cuerpo} />
                {!recuperado.titular && !recuperado.cuerpo && <Vacio titulo="Lo autoguardado está vacío" />}
              </div>
            </>
          ) : (<>
          <div className="ficha">
            <Dato rotulo="Sección">{v.seccion.codigo} — {v.seccion.nombre}</Dato>
            <Dato rotulo="Estado"><EstadoNoticia estado={v.estado} paraRecuperar={esActiva && b?.para_recuperar} /></Dato>
            <Dato rotulo="Publicación">{fecha(v.fecha_publicacion)}</Dato>
            <Dato rotulo="Redactor">{v.redactor}</Dato>
            <Dato rotulo="Nivel">{v.nivel ?? '—'}</Dato>
            <Dato rotulo="Versión">
              {v.numero} de {noticia.versiones.length}
            </Dato>
            <Dato rotulo="Medida total">{textoMedida(v.medida)}</Dato>
            {v.fotocomponedor && <Dato rotulo="Fotocompuso">{v.fotocomponedor}</Dato>}
            {v.fecha_eliminacion && (
              <Dato rotulo="Eliminada el">{fecha(v.fecha_eliminacion)}</Dato>
            )}
          </div>

          <div className="nota">
            <CampoNota rotulo="Volanta" medida={v.medidas.volanta} clase="volanta-texto" texto={v.volanta} />
            <CampoNota rotulo="Título"  medida={v.medidas.titulo}  clase="titulo-texto"  texto={v.titulo} />
            <CampoNota rotulo="Bajada"  medida={v.medidas.bajada}  clase="bajada-texto"  texto={v.bajada} />
            <CampoNota rotulo="Cuerpo"  medida={v.medidas.cuerpo}  clase="cuerpo-texto"  texto={v.cuerpo} />
            <CampoNota rotulo="Titular" medida={v.medidas.titular} clase="titular-texto" texto={v.titular} />

            {!v.volanta && !v.titulo && !v.bajada && !v.cuerpo && !v.titular && (
              <Vacio titulo="Esta versión está vacía" />
            )}
          </div>
          </>)}
        </article>
      </div>
    </>
  );
}
