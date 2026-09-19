import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import type { Version } from '../api/tipos';
import {
  AvisoError, Cargando, EstadoNoticia, Vacio, fecha, textoMedida,
} from '../componentes/piezas';
import { useUsuario } from '../sesion';

/**
 * Versiones que el propio redactor eliminó.
 *
 * En esta fase sólo se listan: recuperarlas escribe en la base, y la Fase 1 no
 * escribe. El botón aparece cuando el flujo de edición entre en la Fase 4.
 */
export function Eliminadas() {
  const { usuario } = useUsuario();
  const navegar = useNavigate();

  const [versiones, setVersiones] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    api.misEliminadas()
      .then((v) => { if (vivo) setVersiones(v); })
      .catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, []);

  return (
    <div className="panel">
      <header>
        <h2>Mis versiones eliminadas</h2>
        <span className="chico tenue">{usuario.username}</span>
      </header>

      {error && <div style={{ padding: 14 }}><AvisoError>{error}</AvisoError></div>}

      {!versiones && !error && <Cargando que="Buscando" />}

      {versiones && versiones.length === 0 && (
        <Vacio
          titulo="No tenés versiones eliminadas"
          detalle="Acá aparecen las versiones que borraste, para poder recuperarlas."
        />
      )}

      {versiones && versiones.length > 0 && (
        <>
          <div className="aviso info" style={{ margin: 14 }}>
            Esta versión de la web es de sólo lectura: las versiones se pueden
            ver, pero todavía no recuperar.
          </div>

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
                        <span className="titulo">{v.titulo ?? '(sin título)'}</span>
                      </div>
                    </td>
                    <td className="apretado"><EstadoNoticia estado={v.estado} /></td>
                    <td className="apretado">{fecha(v.fecha_publicacion)}</td>
                    <td className="apretado">{fecha(v.fecha_eliminacion)}</td>
                    <td className="num">{v.numero}</td>
                    <td className="num apretado tenue chico">{textoMedida(v.medida)}</td>
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
