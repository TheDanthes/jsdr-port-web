import { useEffect, useRef, useState } from 'react';

/**
 * El diálogo "Ortografía" del editor (RevisorOrtograficoJDialog del Swing):
 * mismos campos y mismos botones, en el mismo orden.
 *
 *   Palabra No reconocida · Cambiar a · Sugerencias
 *   Omitir · Omitir Todas · Cambiar · Cambiar Todo · Cancelar
 *
 * Agregado: "Agregar al diccionario", sólo para quien tiene el permiso
 * ADMINISTRAR_DICCIONARIO (en el Swing eso se hacía en otra pantalla).
 */
export interface PedidoOrtografia {
  palabra: string;
  sugerencias: string[];
  /** El texto alrededor de la palabra, para ubicarla. */
  antes: string;
  despues: string;
  puedeAgregar: boolean;
}

export type AccionOrtografia = 'omitir' | 'omitir_todas' | 'cambiar' | 'cambiar_todo' | 'agregar' | 'cancelar';

export interface RespuestaOrtografia { accion: AccionOrtografia; texto: string }

const NO_HAY_SUGERENCIAS = '(No hay sugerencias)';

export function DialogoOrtografia({
  pedido, alResponder,
}: {
  pedido: PedidoOrtografia;
  alResponder: (r: RespuestaOrtografia) => void;
}) {
  const [cambiarA, setCambiarA] = useState(pedido.sugerencias[0] ?? '');
  const [elegida, setElegida] = useState(pedido.sugerencias.length ? 0 : -1);
  const campo = useRef<HTMLInputElement>(null);

  // Cada palabra nueva arranca con su primera sugerencia elegida, como el Swing.
  useEffect(() => {
    setCambiarA(pedido.sugerencias[0] ?? '');
    setElegida(pedido.sugerencias.length ? 0 : -1);
    campo.current?.focus();
    campo.current?.select();
  }, [pedido]);

  const responder = (accion: AccionOrtografia) => alResponder({ accion, texto: cambiarA.trim() });
  const puedeCambiar = cambiarA.trim() !== '' && cambiarA.trim() !== pedido.palabra;

  function teclas(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); responder('cancelar'); }
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
      e.preventDefault();
      responder(puedeCambiar ? 'cambiar' : 'omitir');
    }
    e.stopPropagation();
  }

  return (
    <div className="dialogo-fondo" role="presentation" onKeyDown={teclas}>
      <div className="dialogo panel ortografia" role="dialog" aria-modal="true" aria-labelledby="orto-titulo">
        <header><h2 id="orto-titulo">Ortografía</h2></header>
        <div className="dialogo-cuerpo">
          <p className="orto-contexto">
            …{pedido.antes}<mark>{pedido.palabra}</mark>{pedido.despues}…
          </p>
          <div className="orto-grilla">
            <label htmlFor="orto-palabra">Palabra No reconocida:</label>
            <input id="orto-palabra" type="text" readOnly value={pedido.palabra} spellCheck={false} />
            <label htmlFor="orto-cambiar">Cambiar a:</label>
            <input
              id="orto-cambiar" type="text" ref={campo} value={cambiarA} spellCheck={false}
              onChange={(e) => { setCambiarA(e.target.value); setElegida(-1); }}
            />
            <label htmlFor="orto-sugerencias">Sugerencias:</label>
            <ul id="orto-sugerencias" className="orto-sugerencias" role="listbox" aria-label="Sugerencias">
              {pedido.sugerencias.length === 0 && <li className="tenue">{NO_HAY_SUGERENCIAS}</li>}
              {pedido.sugerencias.map((s, i) => (
                <li
                  key={s} role="option" aria-selected={i === elegida}
                  className={i === elegida ? 'elegida' : ''}
                  onClick={() => { setElegida(i); setCambiarA(s); }}
                  onDoubleClick={() => alResponder({ accion: 'cambiar', texto: s })}
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <footer className="acciones orto-botones">
          <button type="button" onClick={() => responder('omitir')}>Omitir</button>
          <button type="button" onClick={() => responder('omitir_todas')}>Omitir Todas</button>
          <button type="button" className="primario" disabled={!puedeCambiar} onClick={() => responder('cambiar')}>
            Cambiar
          </button>
          <button type="button" disabled={!puedeCambiar} onClick={() => responder('cambiar_todo')}>Cambiar Todo</button>
          {pedido.puedeAgregar && (
            <button type="button" onClick={() => responder('agregar')} title="Agregar la palabra al diccionario de la redacción">
              Agregar al diccionario
            </button>
          )}
          <button type="button" onClick={() => responder('cancelar')}>Cancelar</button>
        </footer>
      </div>
    </div>
  );
}
