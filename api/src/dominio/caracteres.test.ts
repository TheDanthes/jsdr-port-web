/**
 * El port de FiltradorNoticia tiene que dar EXACTAMENTE lo mismo que el Java.
 *
 * `caracteres.golden.json` se generó corriendo los métodos originales del
 * cliente jSDR 1.6.0 (decompilados, sin tocar) sobre 419 entradas: casos
 * escritos a mano con todos los caracteres de control, tabs, espacios y saltos
 * en los bordes, y 400 cadenas al azar con el mismo alfabeto. Si una de estas
 * comparaciones falla, el editor nuevo mediría distinto que el viejo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CARACTERES, contarLineas, filtrarParaMedir, filtrarParaTXT, filtrarSalidaMedir,
} from './caracteres.js';

const golden = JSON.parse(
  readFileSync(new URL('./caracteres.golden.json', import.meta.url), 'utf8'),
) as {
  motor: string[];
  casos: { entrada: string; paraMedir: string; salidaMedir: string; paraTXT: string }[];
};

const cp = (c: string) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');

test('los 13 caracteres del motor son los que decodifica Java con cp850', () => {
  assert.deepEqual(CARACTERES.map((c) => cp(c.motor)), golden.motor);
});

test(`filtrarParaMedir coincide con el Java en ${golden.casos.length} casos`, () => {
  for (const [i, c] of golden.casos.entries()) {
    assert.equal(filtrarParaMedir(c.entrada), c.paraMedir, `caso ${i}: ${JSON.stringify(c.entrada)}`);
  }
});

test(`filtrarSalidaMedir coincide con el Java en ${golden.casos.length} casos`, () => {
  for (const [i, c] of golden.casos.entries()) {
    assert.equal(filtrarSalidaMedir(c.entrada), c.salidaMedir, `caso ${i}: ${JSON.stringify(c.entrada)}`);
  }
});

test(`filtrarParaTXT coincide con el Java en ${golden.casos.length} casos`, () => {
  for (const [i, c] of golden.casos.entries()) {
    assert.equal(filtrarParaTXT(c.entrada), c.paraTXT, `caso ${i}: ${JSON.stringify(c.entrada)}`);
  }
});

test('las líneas se cuentan como StringTokenizer: las vacías no cuentan', () => {
  assert.equal(contarLineas(''), 0);
  assert.equal(contarLineas('a\n'), 1);
  assert.equal(contarLineas('a\n\nb\n'), 2);
  assert.equal(contarLineas('\n\n'), 0);
});
