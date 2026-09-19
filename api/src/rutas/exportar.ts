import type { FastifyInstance } from 'fastify';
import { buscarNoticias, obtenerNoticia } from '../datos/noticias.js';
import { buscarCables, obtenerCable } from '../datos/cables.js';
import { ORDEN_CABLES, ORDEN_NOTICIAS, type Version } from '../dominio/tipos.js';
import {
  filtroDesdeQuery,
  ordenNoticiasInvalido,
  type QueryBuscar,
} from './noticias.js';
import {
  filtroCablesDesdeQuery,
  ordenCablesInvalido,
  type QueryCables,
} from './cables.js';

/** Tope de filas de un export. Más que esto ya no es una consulta, es un dump. */
const TOPE_EXPORT = 5000;

// ---------------------------------------------------------------------------
//  CSV
// ---------------------------------------------------------------------------

/**
 * El separador es `;` y el archivo lleva BOM.
 *
 * Con coma y sin BOM, el Excel en español abre el archivo en una sola columna
 * y rompe los acentos. Así se abre bien de doble clic, que es como lo van a
 * usar en la redacción.
 */
const SEPARADOR = ';';
const BOM = '﻿';

function celda(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v)
    // Saltos de línea y tabulaciones fuera: una fila, una línea.
    .replace(/\r?\n/g, ' ')
    .replace(/\t/g, ' ')
    .trim();
  return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const fila = (vs: unknown[]) => vs.map(celda).join(SEPARADOR);

function csv(cabeceras: string[], filas: unknown[][]): string {
  return BOM + [fila(cabeceras), ...filas.map(fila)].join('\r\n') + '\r\n';
}

const nombreArchivo = (base: string) => {
  const f = new Date().toISOString().slice(0, 10);
  return `${base}-${f}.csv`;
};

// ---------------------------------------------------------------------------
//  Texto plano
// ---------------------------------------------------------------------------

const medida = (m: { cm: number | null; lineas: number | null }) =>
  m.cm === null && m.lineas === null
    ? 'sin medir'
    : `${m.cm ?? '?'} cm (${m.lineas ?? '?'} líneas)`;

/**
 * Una versión como la leería alguien de la redacción: encabezado con los
 * datos de control y después el texto en el orden en que sale publicado.
 *
 * No es Tagged Text ni XPress Tags: eso lo produce el composer en la Fase 2,
 * con el motor tipográfico original. Esto es para leer, imprimir o pegar.
 */
function versionComoTexto(guia: string | null, v: Version): string {
  const l: string[] = [];
  l.push(`Guía:      ${guia ?? '-'}`);
  l.push(`Noticia:   ${v.id_noticia}   versión ${v.numero}`);
  l.push(`Sección:   ${v.seccion.codigo ?? '-'} — ${v.seccion.nombre ?? '-'}`);
  l.push(`Fecha:     ${v.fecha_publicacion ?? '-'}`);
  l.push(`Estado:    ${v.estado}${v.nivel !== null ? `   nivel ${v.nivel}` : ''}`);
  l.push(`Redactor:  ${v.redactor}`);
  if (v.fotocomponedor) l.push(`Fotocompuso: ${v.fotocomponedor}`);
  if (v.confidencial) l.push('CONFIDENCIAL');
  l.push(`Medida:    ${medida(v.medida)}`);
  l.push('');
  l.push('-'.repeat(72));
  l.push('');

  if (v.volanta) { l.push(v.volanta); l.push(''); }
  if (v.titulo)  { l.push(v.titulo);  l.push(''); }
  if (v.bajada)  { l.push(v.bajada);  l.push(''); }
  if (v.cuerpo)  { l.push(v.cuerpo);  l.push(''); }
  if (v.titular) { l.push(''); l.push(`Titular: ${v.titular}`); }

  return l.join('\n');
}

// ---------------------------------------------------------------------------

export async function rutasExportar(app: FastifyInstance) {
  /** Resultados del buscador de noticias, con los mismos filtros de pantalla. */
  app.get<{ Querystring: QueryBuscar }>('/noticias.csv', async (req, rep) => {
    if (ordenNoticiasInvalido(req.query.orden)) {
      return rep.code(400).send({
        error: `orden inválido: ${req.query.orden}`,
        validos: Object.keys(ORDEN_NOTICIAS),
      });
    }

    const filtro = filtroDesdeQuery(req.query, req.sesion.usuario.username);
    const pagina = await buscarNoticias({
      ...filtro,
      offset: 0,
      limite: TOPE_EXPORT,
      tope: TOPE_EXPORT,
    });

    const cuerpo = csv(
      ['id', 'guia', 'fecha', 'seccion', 'volanta', 'titulo', 'bajada',
       'estado', 'nivel', 'redactor', 'version', 'cm', 'lineas'],
      pagina.items.map((n) => {
        const v = n.version!;
        return [
          n.id, n.guia, v.fecha_publicacion, v.seccion.codigo,
          v.volanta, v.titulo, v.bajada,
          v.estado, v.nivel, v.redactor, v.numero,
          v.medida.cm, v.medida.lineas,
        ];
      }),
    );

    return rep
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${nombreArchivo('noticias')}"`)
      .header('x-jsdr-total', String(pagina.total))
      .header('x-jsdr-exportadas', String(pagina.items.length))
      .send(cuerpo);
  });

  /** Resultados del buscador de cables. */
  app.get<{ Querystring: QueryCables }>('/cables.csv', async (req, rep) => {
    if (ordenCablesInvalido(req.query.orden)) {
      return rep.code(400).send({
        error: `orden inválido: ${req.query.orden}`,
        validos: Object.keys(ORDEN_CABLES),
      });
    }

    const filtro = filtroCablesDesdeQuery(req.query, req.sesion.usuario.username);
    const pagina = await buscarCables({
      ...filtro,
      offset: 0,
      limite: TOPE_EXPORT,
      tope: TOPE_EXPORT,
    });

    const cuerpo = csv(
      ['id', 'agencia', 'numero', 'prioridad', 'fecha', 'hora', 'tema', 'titulo', 'cm', 'lineas'],
      pagina.items.map((c) => [
        c.id, c.agencia.codigo, c.numero, c.prioridad,
        c.fecha_recepcion, c.hora_recepcion, c.tema, c.titulo,
        c.medida.cm, c.medida.lineas,
      ]),
    );

    return rep
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${nombreArchivo('cables')}"`)
      .header('x-jsdr-total', String(pagina.total))
      .header('x-jsdr-exportadas', String(pagina.items.length))
      .send(cuerpo);
  });

  /** Una versión de una noticia, en texto plano. */
  app.get<{ Params: { id: string; numero: string } }>(
    '/noticias/:id/versiones/:numero/texto',
    async (req, rep) => {
      const id = Number(req.params.id);
      const numero = Number(req.params.numero);
      if (!Number.isInteger(id) || !Number.isInteger(numero)) {
        return rep.code(400).send({ error: 'id o número de versión inválido' });
      }

      // Pasa por obtenerNoticia, así la regla de confidencialidad es la misma
      // que en pantalla: no hay puerta de atrás por el export.
      const n = await obtenerNoticia(id, req.sesion.usuario.username);
      const v = n?.versiones?.find((x) => x.numero === numero);
      if (!n || !v) return rep.code(404).send({ error: 'versión no encontrada' });

      const nombre = `${n.guia?.replace(/[^\w.-]+/g, '_') || `noticia-${id}`}-v${numero}.txt`;
      return rep
        .header('content-type', 'text/plain; charset=utf-8')
        .header('content-disposition', `attachment; filename="${nombre}"`)
        .send(versionComoTexto(n.guia, v));
    },
  );

  /** Un cable, en texto plano. */
  app.get<{ Params: { id: string } }>('/cables/:id/texto', async (req, rep) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return rep.code(400).send({ error: 'id inválido' });

    const c = await obtenerCable(id);
    if (!c) return rep.code(404).send({ error: 'cable no encontrado' });

    const texto = [
      `Agencia:   ${c.agencia.codigo ?? '-'} — ${c.agencia.nombre ?? '-'}`,
      `Número:    ${c.numero}`,
      `Recibido:  ${c.fecha_recepcion} ${c.hora_recepcion}`,
      `Prioridad: ${c.prioridad ?? '-'}`,
      `Tema:      ${c.tema ?? '-'}`,
      `Medida:    ${medida(c.medida)}`,
      '',
      '-'.repeat(72),
      '',
      c.titulo,
      '',
      c.cuerpo ?? '',
    ].join('\n');

    return rep
      .header('content-type', 'text/plain; charset=utf-8')
      .header('content-disposition', `attachment; filename="cable-${c.id}.txt"`)
      .send(texto);
  });
}
