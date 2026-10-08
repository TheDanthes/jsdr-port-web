/**
 * Cliente del composer (motor tipográfico, Fase 2).
 *
 * La API no habla con los binarios: le pide al composer por HTTP. Así el
 * motor de 2005 vive en su propio contenedor y una nota que lo cuelga no
 * se lleva puesta la web.
 */
import { config } from './config.js';

export interface Aviso { linea: number; mensaje: string }

export interface MedicionComposer {
  cm: number | null;
  didots: number | null;
  formateado: string;
  errores: Aviso[];
  ms: number;
}

export interface MedicionAnchoComposer {
  medidas: { palabra: number; valor: string }[];
  errores: Aviso[];
  ms: number;
}

export interface ComposicionComposer {
  archivo: string;
  carpeta: string;
  bytes: number;
  ms: number;
  avisos: Aviso[];
}

/** Error que viene del composer, con el código HTTP que corresponde devolver. */
export class ErrorComposer extends Error {
  constructor(readonly statusCode: number, mensaje: string, readonly detalle?: unknown) {
    super(mensaje);
  }
}

async function pedir<T>(ruta: string, cuerpo: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${config.composerUrl}${ruta}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
      // El composer corta el motor a los 20 s; esto es el margen de la red.
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ErrorComposer(
      502,
      `No se pudo hablar con el motor tipográfico (${config.composerUrl}). ` +
        '¿Está levantado el contenedor jsdr-composer?',
    );
  }
  const datos = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) {
    // 504: el motor se colgó con este texto. 422: errores de la nota.
    throw new ErrorComposer(
      r.status === 504 || r.status === 422 ? r.status : 502,
      datos.error ?? `El motor tipográfico respondió ${r.status}`,
      datos,
    );
  }
  return datos as T;
}

export const composer = {
  medir: (texto: string) => pedir<MedicionComposer>('/medir', { texto }),
  medirAncho: (texto: string) => pedir<MedicionAnchoComposer>('/medir-ancho', { texto }),
  componer: (texto: string, guia: string, seccion: string) =>
    pedir<ComposicionComposer>('/componer', { texto, guia, seccion }),
};
