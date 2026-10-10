import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MENSAJES, puedeAutorizarNoticia, puedeCambiarConfidencialidadNoticia, puedeEliminarNoticia,
  puedePasarDeNivelNoticia, puedeRestaurarVersion, type NoticiaReglas, type UsuarioReglas,
} from './reglas.js';

const redactor: UsuarioReglas = { username: 'mgomez', nivel: 10, porSeccion: { REDACTAR_NOTICIA: [1] } };
const jefe: UsuarioReglas = { username: 'jperez', nivel: 20, porSeccion: { REDACTAR_NOTICIA: [1] } };
const otroJefe: UsuarioReglas = { username: 'otro', nivel: 20, porSeccion: { REDACTAR_NOTICIA: [5] } };

const nota = (x: Partial<NoticiaReglas> = {}): NoticiaReglas => ({
  estado: 'EN_EJECUCION', nivel: 10, redactor: 'mgomez', id_seccion: 1,
  fecha_publicacion: '2999-01-01', confidencial: false,
  versiones: [{ numero: 1, confidencial: false, nivel_redactor: 10, redactor: 'mgomez' }],
  ...x,
});

const falla = (f: () => void, mensaje: string) => assert.throws(f, (e: Error) => e.message === mensaje);

test('autorizar: su redactor, en su nivel, estando EN_EJECUCION', () => {
  puedeAutorizarNoticia(nota(), redactor);
  falla(() => puedeAutorizarNoticia(nota(), jefe), MENSAJES.nivelDistinto);
  falla(() => puedeAutorizarNoticia(nota({ estado: 'AUTORIZADA' }), redactor), MENSAJES.noEnEjecucion);
  falla(() => puedeAutorizarNoticia(nota({ redactor: 'otro' }), redactor), MENSAJES.usuarioNoRedactor);
});

test('pasar de nivel: mismo nivel, con permiso en la sección, ya autorizada', () => {
  puedePasarDeNivelNoticia(nota({ estado: 'AUTORIZADA' }), redactor, 20);
  falla(() => puedePasarDeNivelNoticia(nota(), redactor, 20), MENSAJES.enEjecucion);
  falla(() => puedePasarDeNivelNoticia(nota({ estado: 'EN_EDICION' }), redactor, 20), MENSAJES.enEdicion);
  falla(() => puedePasarDeNivelNoticia(nota({ estado: 'AUTORIZADA' }), jefe, 30), MENSAJES.nivelDistinto);
  // En nivel 10, una autorizada sólo la pasa su redactor; en 20 ya no importa quién la escribió.
  falla(() => puedePasarDeNivelNoticia(nota({ estado: 'AUTORIZADA', redactor: 'otro' }), redactor, 20), MENSAJES.usuarioNoRedactor);
  puedePasarDeNivelNoticia(nota({ estado: 'AUTORIZADA', nivel: 20 }), jefe, 30);
  falla(() => puedePasarDeNivelNoticia(nota({ estado: 'AUTORIZADA', nivel: 20 }), otroJefe, 30), MENSAJES.permisoRedaccionSeccion);
});

test('una confidencial no baja del nivel de quien la marcó', () => {
  const conf = nota({
    estado: 'AUTORIZADA', nivel: 20, redactor: 'jperez', confidencial: true,
    versiones: [{ numero: 1, confidencial: true, nivel_redactor: 20, redactor: 'jperez' }],
  });
  puedePasarDeNivelNoticia(conf, jefe, 30);
  falla(() => puedePasarDeNivelNoticia(conf, jefe, 10), MENSAJES.pasarNivelConfidencial);
});

test('eliminar: sólo su redactor, en su nivel, EN_EJECUCION', () => {
  puedeEliminarNoticia(nota(), redactor);
  falla(() => puedeEliminarNoticia(nota({ estado: 'AUTORIZADA' }), redactor), MENSAJES.noEnEjecucion);
  falla(() => puedeEliminarNoticia(nota({ nivel: 20 }), redactor), MENSAJES.nivelDistinto);
});

test('confidencialidad y restaurar', () => {
  puedeCambiarConfidencialidadNoticia(nota(), redactor);
  falla(() => puedeCambiarConfidencialidadNoticia(nota({ estado: 'FOTOCOMPUESTA', fecha_publicacion: '2000-01-01' }), redactor), MENSAJES.cerrada);
  puedeRestaurarVersion(2, 3);
  falla(() => puedeRestaurarVersion(1, 3), MENSAJES.existeVersionPosterior);
});

test('permisos por sección: jefe en su sección por defecto, secretario en las suyas', async () => {
  const { seccionesParaAsignarPermisos: puede, MENSAJES_PERMISOS_SECCION: M } = await import('./reglas.js');
  const secciones = [{ id: 1, seccion_default: false }, { id: 5, seccion_default: true }, { id: 9, seccion_default: null }];
  assert.deepEqual(puede({ nivel: 10, permisos: ['ASIGNAR_PERMISOS'], secciones }), { error: M.nivel });
  assert.deepEqual(puede({ nivel: 20, permisos: [], secciones }), { error: M.permiso });
  assert.deepEqual(puede({ nivel: 20, permisos: ['ASIGNAR_PERMISOS'], secciones }), { secciones: [5] });
  assert.deepEqual(puede({ nivel: 20, permisos: ['ASIGNAR_PERMISOS'], secciones: [{ id: 1, seccion_default: false }] }),
    { error: M.seccionDefault });
  assert.deepEqual(puede({ nivel: 30, permisos: ['ASIGNAR_PERMISOS'], secciones }), { secciones: [1, 5, 9] });
  assert.deepEqual(puede({ nivel: 30, permisos: ['ASIGNAR_PERMISOS'], secciones: [] }), { error: M.secciones });
});
