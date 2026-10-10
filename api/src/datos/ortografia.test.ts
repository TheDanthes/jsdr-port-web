import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sugerir, textoParaRevisar } from './ortografia.js';

test('textoParaRevisar tapa merge, campana y comandos sin mover las posiciones', () => {
  const t = '<m15.3>Hola∏mundo ♫ahcasa ♫bfin╠';
  const r = textoParaRevisar(t);
  assert.equal(r.length, t.length);
  assert.equal(r, '       Hola mundo    casa   fin╠');
});

test('campana al final del texto no se pasa del largo', () => {
  assert.equal(textoParaRevisar('fin♫'), 'fin ');
  assert.equal(textoParaRevisar('fin♫a'), 'fin  ');
});

test('sugerencias: primero los acentos, respeta la mayúscula inicial', () => {
  const dic = new Set(['medición', 'medicina', 'Rosario', 'casa', 'cosa', 'causa']);
  assert.deepEqual(sugerir(dic, 'medicion').slice(0, 1), ['medición']);
  assert.deepEqual(sugerir(dic, 'Medicion').slice(0, 1), ['Medición']);
  assert.deepEqual(sugerir(dic, 'rosrio'), ['Rosario']);
  assert.ok(sugerir(dic, 'csa').includes('casa'));
  assert.deepEqual(sugerir(dic, 'xyzwq'), []);
});
