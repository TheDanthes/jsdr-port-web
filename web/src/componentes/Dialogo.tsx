import { useEffect, useRef, useState } from 'react';

/**
 * Diálogo modal: el reemplazo de los JOptionPane del cliente Swing
 * ("¿Quiere guardar la noticia?" Sí / No / Cancelar, "Ingrese la guía...").
 *
 * Teclado como en Swing: Enter acepta el botón principal, Escape cancela.
 */
export interface Boton { etiqueta: string; valor: string; principal?: boolean }

export interface PedidoDialogo {
  titulo: string;
  mensaje?: string;
  /** Lista de detalles (por ejemplo, los errores de validación). */
  detalles?: string[];
  /** Una aclaración debajo del mensaje, en gris (no es un error). */
  nota?: string;
  /** Un dato que tiene que verse bien (p. ej. la contraseña blanqueada). */
  destacado?: string;
  botones: Boton[];
  /** Si viene, el diálogo pide un texto. */
  entrada?: { valor: string; filtro?: RegExp; largoMaximo?: number; ayuda?: string };
  /** Valor que se devuelve con Escape o al cerrar. */
  cancelar?: string;
}

export interface RespuestaDialogo { boton: string; texto: string }

export function Dialogo({
  pedido, alResponder,
}: {
  pedido: PedidoDialogo;
  alResponder: (r: RespuestaDialogo) => void;
}) {
  const [texto, setTexto] = useState(pedido.entrada?.valor ?? '');
  const caja = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const principal = pedido.botones.find((b) => b.principal) ?? pedido.botones[0]!;
  const cancelar = pedido.cancelar ?? pedido.botones[pedido.botones.length - 1]!.valor;

  useEffect(() => {
    if (campo.current) campo.current.focus();
    else caja.current?.querySelector<HTMLButtonElement>('button.primario')?.focus();
  }, []);

  function teclas(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); alResponder({ boton: cancelar, texto }); }
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
      e.preventDefault();
      alResponder({ boton: principal.valor, texto });
    }
    e.stopPropagation();
  }

  return (
    <div className="dialogo-fondo" role="presentation" onKeyDown={teclas}>
      <div
        className="dialogo panel" role="dialog" aria-modal="true"
        aria-labelledby="dialogo-titulo" ref={caja}
      >
        <header><h2 id="dialogo-titulo">{pedido.titulo}</h2></header>
        <div className="dialogo-cuerpo">
          {pedido.mensaje && <p>{pedido.mensaje}</p>}
          {pedido.destacado && <p className="dialogo-destacado">{pedido.destacado}</p>}
          {pedido.nota && <p className="dialogo-nota">{pedido.nota}</p>}
          {pedido.detalles && pedido.detalles.length > 0 && (
            <ul className="dialogo-detalles">
              {pedido.detalles.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
          {pedido.entrada && (
            <>
              <input
                ref={campo} type="text" value={texto} spellCheck={false}
                maxLength={pedido.entrada.largoMaximo}
                onChange={(e) => {
                  const v = e.target.value;
                  // Como el DocumentFilter del Swing: lo que no vale, no entra.
                  if (!pedido.entrada?.filtro || v === '' || pedido.entrada.filtro.test(v)) setTexto(v);
                }}
              />
              {pedido.entrada.ayuda && <p className="chico tenue">{pedido.entrada.ayuda}</p>}
            </>
          )}
        </div>
        <footer className="acciones">
          {pedido.botones.map((b) => (
            <button
              key={b.valor} type="button" className={b.principal ? 'primario' : ''}
              onClick={() => alResponder({ boton: b.valor, texto })}
            >
              {b.etiqueta}
            </button>
          ))}
        </footer>
      </div>
    </div>
  );
}
