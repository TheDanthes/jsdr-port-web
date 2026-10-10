import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import type { Version } from '../api/tipos';
import {
  AvisoError, Cargando, EstadoNoticia, Vacio, fecha, lineaTitular, textoMedida,
} from '../componentes/piezas';
import { useUsuario } from '../sesion';
import { useEditor } from '../editor/EditorContexto';

/**
 * Versiones que el propio redactor eliminó, para restaurarlas.
 * RestauracionVersionesEliminadasJPanel del Swing: mismos mensajes. Sólo se
 * puede restaurar la última versión creada de cada noticia.
 */
export function Eliminadas() {
  const sesion = useUsuario();
  const { usuario } = sesion;
  const edicion = sesion.edicion === true;
  const navegar = useNavigate();
  const ed = useEditor();

  const [versiones, setVersiones] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recargar, setRecargar] = useState(0);

  useEffect(() => {
    let vivo = true;
    api.misEliminadas()
      .then((v) => { if (vivo) setVersiones(v); })
      .catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [recargar]);

  async function restaurar(v: Version) {
    const r = await ed.preguntar({
      titulo: 'Restaurar Versiones Eliminadas',
      mensaje: '¿Está seguro que quiere restaurar esta versión?',
      botones: [{ etiqueta: 'Sí', valor: 'si', principal: true }, { etiqueta: 'No', valor: 'no' }],
      cancelar: 'no',
    });
    if (r.boton !== 'si') return;
    setAviso(null);
    setError(null);
    try {
      await api.restaurar(v.id_noticia, v.numero);
      setAviso('La versión se restauró correctamente!');
      setRecargar((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Se ha producido un error al restaurar la versión eliminada');
    }
  }

  return (
    <div className="panel">
      <header>
        <h2>Mis versiones eliminadas</h2>
        <span className="chico tenue">{usuario.username}</span>
      </header>

      {error && <div style={{ padding: '14px 14px 0' }}><AvisoError>{error}</AvisoError></div>}
      {aviso && <div style={{ padding: '14px 14px 0' }}><div className="aviso info" role="status">{aviso}</div></div>}

      {!versiones && !error && <Cargando que="Buscando" />}

      {versiones && versiones.length === 0 && (
        <Vacio
          titulo="No tenés versiones eliminadas"
          detalle="Acá aparecen las versiones que borraste, para poder recuperarlas."
        />
      )}

      {versiones && versiones.length > 0 && (
        <>
          {!edicion && (
            <div className="aviso info" style={{ margin: 14 }}>
              Esta instalación es de sólo lectura: las versiones se pueden ver, pero no restaurar.
            </div>
          )}

          <div className="tabla-marco">
            <table className="lista">
              <thead>
                <tr>
                  <th>Secc.</th>
                  <th>Noticia</th>
                  <th>Estado</th>
                  <th>Publicación</th>
                  <th>Eliminada</th>
                  <th className="num">Vers.</th>
                  <th className="num">Medida</th>
                  {edicion && <th aria-label="Acciones" />}
                </tr>
              </thead>
              <tbody>
                {versiones.map((v) => (
                  <tr
                    key={`${v.id_noticia}-${v.numero}`}
                    className="clicable"
                    onClick={() => navegar(`/noticias/${v.id_noticia}`)}
                  >
                    <td className="apretado">{v.seccion.codigo}</td>
                    <td>
                      <div className="titulo-celda">
                        {v.volanta && <span className="volanta">{v.volanta}</span>}
                        <span className="titulo">{v.titulo ?? lineaTitular(v.titular) ?? '(sin título)'}</span>
                      </div>
                    </td>
                    <td className="apretado"><EstadoNoticia estado={v.estado} /></td>
                    <td className="apretado">{fecha(v.fecha_publicacion)}</td>
                    <td className="apretado">{fecha(v.fecha_eliminacion)}</td>
                    <td className="num">{v.numero}</td>
                    <td className="num apretado tenue chico">{textoMedida(v.medida)}</td>
                    {edicion && (
                      <td className="apretado">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void restaurar(v); }}
                          title="Restaurar esta versión"
                        >
                          Restaurar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
