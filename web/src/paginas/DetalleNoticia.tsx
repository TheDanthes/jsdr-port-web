import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, descargar } from '../api/cliente';
import { useSesion } from '../sesion';
import { useEditor } from '../editor/EditorContexto';
import type { Medida, Noticia, Version } from '../api/tipos';
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
  const edicion = useSesion().sesion?.edicion === true;
  const ed = useEditor();

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);

    api.noticia(Number(id))
      .then((n) => {
        if (!vivo) return;
        setNoticia(n);
        setActiva(n.numero_version_activa);
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
            {noticia.versiones.map((x) => (
              <li key={x.numero}>
                <button
                  className={x.numero === v.numero ? 'activa' : ''}
                  onClick={() => setActiva(x.numero)}
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
              {edicion && esActiva && (
                <>
                  <button className="primario" onClick={() => void editar()}>Editar</button>
                  <button onClick={() => void fotocomponer()}>Fotocomponer</button>
                </>
              )}
              <button onClick={exportarTexto}>Exportar texto</button>
            </div>
          </header>

          {aviso && <div style={{ padding: '10px 14px 0' }}><div className="aviso info" role="status">{aviso}</div></div>}
          {errorAccion && <div style={{ padding: '10px 14px 0' }}><AvisoError>{errorAccion}</AvisoError></div>}

          <div className="ficha">
            <Dato rotulo="Sección">{v.seccion.codigo} — {v.seccion.nombre}</Dato>
            <Dato rotulo="Estado"><EstadoNoticia estado={v.estado} /></Dato>
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
        </article>
      </div>
    </>
  );
}
