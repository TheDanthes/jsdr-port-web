import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { _vaciar, anotar, entrar, enSesion, olvidar } from './conectados.js';
import { VIDA_SIN_LATIDO_MS } from './aperturas.js';

const exp = () => Math.floor(Date.now() / 1000) + 3600;

test('una fila por sesión; sin señal pasa a rojo y va al final', () => {
  mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  try {
    _vaciar();
    entrar('tok-a', 'ana', '10.0.0.1', exp());
    entrar('tok-b', 'beto', '10.0.0.2', exp());
    assert.deepEqual(enSesion().map((f) => [f.username, f.vivo]), [['ana', true], ['beto', true]]);

    mock.timers.tick(VIDA_SIN_LATIDO_MS);
    anotar('tok-b', 'beto', '10.0.0.2', exp());   // beto sigue; ana no avisó
    assert.deepEqual(enSesion().map((f) => [f.username, f.vivo]), [['beto', true], ['ana', false]]);
  } finally {
    mock.timers.reset();
  }
});

test('volver a entrar reemplaza las sesiones colgadas del mismo usuario, no las vivas', () => {
  mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  try {
    _vaciar();
    entrar('vieja', 'ana', '10.0.0.1', exp());
    mock.timers.tick(VIDA_SIN_LATIDO_MS + 1);
    entrar('otra-pc', 'ana', '10.0.0.5', exp());
    entrar('nueva', 'ana', '10.0.0.1', exp());
    const filas = enSesion().filter((f) => f.username === 'ana');
    assert.equal(filas.length, 2);
    assert.ok(filas.every((f) => f.vivo));
  } finally {
    mock.timers.reset();
  }
});

test('salir la saca; un token vencido deja de figurar solo', () => {
  mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  try {
    _vaciar();
    entrar('t1', 'ana', '10.0.0.1', exp());
    entrar('t2', 'beto', '10.0.0.2', Math.floor(Date.now() / 1000) + 60);
    olvidar('t1');
    assert.deepEqual(enSesion().map((f) => f.username), ['beto']);
    mock.timers.tick(61_000);
    assert.deepEqual(enSesion(), []);
  } finally {
    mock.timers.reset();
  }
});
