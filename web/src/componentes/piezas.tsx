import type { ReactNode } from 'react';
import type { Medida, Version } from '../api/tipos';

export function Etiqueta({ clase, children }: { clase?: string; children: ReactNode }) {
  return <span className={`etiqueta ${clase ?? ''}`}>{children}</span>;
}

export function EstadoNoticia({ estado }: { estado: string }) {
  return <Etiqueta clase={estado}>{estado.replace(/_/g, ' ').toLowerCase()}</Etiqueta>;
}

export function AvisoError({ children }: { children: ReactNode }) {
  return <div className="aviso error" role="alert">{children}</div>;
}

export function Cargando({ que = 'Buscando' }: { que?: string }) {
  return <div className="cargando" role="status">{que}…</div>;
}

export function Vacio({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <div className="vacio">
      <p><strong>{titulo}</strong></p>
      {detalle && <p className="chico">{detalle}</p>}
    </div>
  );
}

/** "14,1 cm (48 líneas)" — la unidad con la que trabaja la redacción. */
export function textoMedida(m: Medida | undefined | null): string {
  if (!m || (m.cm === null && m.lineas === null)) return 'sin medir';
  const cm = m.cm === null ? '?' : m.cm.toLocaleString('es-AR', { maximumFractionDigits: 2 });
  const l = m.lineas === null ? '?' : m.lineas;
  return `${cm} cm (${l} líneas)`;
}

/** Las fechas de la base son `date` sin zona: se muestran tal cual, sin convertir. */
export function fecha(f: string | null | undefined): string {
  if (!f) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : f;
}

export const hora = (h: string | null | undefined) => (h ? h.slice(0, 5) : '—');

export function Dato({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="dato">
      <span>{rotulo}</span>
      <b>{children ?? '—'}</b>
    </div>
  );
}

/** Encabezado de columna que ordena al hacer clic. */
export function ThOrden({
  clave, etiqueta, orden, asc, alOrdenar, className,
}: {
  clave: string;
  etiqueta: string;
  orden: string;
  asc: boolean;
  alOrdenar: (clave: string) => void;
  className?: string;
}) {
  const activo = orden === clave;
  return (
    <th
      className={`ordenable ${className ?? ''}`}
      onClick={() => alOrdenar(clave)}
      aria-sort={activo ? (asc ? 'ascending' : 'descending') : 'none'}
      title={`Ordenar por ${etiqueta.toLowerCase()}`}
    >
      {etiqueta}
      {activo && <span className="flecha" aria-hidden="true">{asc ? '▲' : '▼'}</span>}
    </th>
  );
}

export function Paginado({
  total, totalExacto = true, hayMas, mostrados, offset, limite, alIr,
}: {
  total: number;
  /** false cuando el conteo se cortó en el tope: se muestra "más de N". */
  totalExacto?: boolean;
  /** Lo dice la API, no se deduce del total (que puede venir acotado). */
  hayMas: boolean;
  mostrados: number;
  offset: number;
  limite: number;
  alIr: (offset: number) => void;
}) {
  const desde = mostrados === 0 ? 0 : offset + 1;
  const hasta = offset + mostrados;
  const hayAnterior = offset > 0;

  const cuenta = () => {
    if (mostrados === 0) return 'Sin resultados';
    const rango = `${desde.toLocaleString('es-AR')}–${hasta.toLocaleString('es-AR')}`;
    return totalExacto
      ? `${rango} de ${total.toLocaleString('es-AR')}`
      // Contar exacto sobre el archivo entero cuesta casi un segundo y no
      // aporta: quien busca en serio filtra.
      : `${rango} de más de ${total.toLocaleString('es-AR')}`;
  };

  return (
    <div className="paginado">
      <span className="cuenta">{cuenta()}</span>
      <div className="acciones">
        <button onClick={() => alIr(0)} disabled={!hayAnterior}>« Primera</button>
        <button onClick={() => alIr(Math.max(0, offset - limite))} disabled={!hayAnterior}>
          ‹ Anterior
        </button>
        <button onClick={() => alIr(offset + limite)} disabled={!hayMas}>
          Siguiente ›
        </button>
      </div>
    </div>
  );
}

/** Resalta el tramo que coincide con lo buscado, para ubicarlo de un vistazo. */
export function Resaltado({ texto, busca }: { texto: string | null; busca: string }) {
  if (!texto) return null;
  const q = busca.trim();
  if (!q) return <>{texto}</>;

  const i = texto.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{texto}</>;

  return (
    <>
      {texto.slice(0, i)}
      <mark>{texto.slice(i, i + q.length)}</mark>
      {texto.slice(i + q.length)}
    </>
  );
}

/** Marcas de una versión: confidencial y eliminada. */
export function MarcasVersion({ v }: { v: Version }) {
  return (
    <>
      {v.confidencial && <Etiqueta clase="confidencial">confidencial</Etiqueta>}
      {v.eliminada && <Etiqueta clase="eliminada">eliminada</Etiqueta>}
    </>
  );
}
