import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { _vaciar, anotar, entrar, enSesion, olvidar, revocada, sesionViva } from './conectados.js';
import { VIDA_SIN_LATIDO_MS } from './aperturas.js';
import { config } from '../config.js';

const AHORA = 1_800_000_000_000;
/** Vencimiento de un token emitido hace `haceMs`. */
const exp = (haceMs = 0) => Math.floor((Date.now() - haceMs) / 1000) + config.horasSesion * 3600;

function conReloj(prueba: () => void) {
  mock.timers.enable({ apis: ['Date'], now: AHORA });
  try { _vaciar(); prueba(); } finally { mock.timers.reset(); }
}

test('una fila por sesión; sin señal pasa a rojo y va al final', () => conReloj(() => {
  entrar('tok-a', 'ana', '10.0.0.1', exp());
  entrar('tok-b', 'beto', '10.0.0.2', exp());
  assert.deepEqual(enSesion().map((f) => [f.username, f.vivo]), [['ana', true], ['beto', true]]);

  mock.timers.tick(VIDA_SIN_LATIDO_MS);
  anotar('tok-b', 'beto', '10.0.0.2', exp());   // beto sigue; ana no avisó
  assert.deepEqual(enSesion().map((f) => [f.username, f.vivo]), [['beto', true], ['ana', false]]);
  assert.equal(sesionViva('ana'), null);
  assert.equal(sesionViva('beto')?.ip, '10.0.0.2');
}));

test('volver a entrar cierra la sesión anterior: el otro equipo queda afuera con aviso', () => conReloj(() => {
  const vieja = exp();
  entrar('pc-1', 'ana', '10.0.0.1', vieja);
  mock.timers.tick(5_000);
  assert.equal(entrar('pc-2', 'ana', '10.0.0.5', exp()), true, 'había una viva');
  assert.deepEqual(revocada('pc-1'), { motivo: 'reemplazada', ip: '10.0.0.5', vence: vieja * 1000 });
  assert.equal(anotar('pc-1', 'ana', '10.0.0.1', vieja), false, 'la vieja ya no se anota');
  assert.deepEqual(enSesion().map((f) => f.ip), ['10.0.0.5']);

  // Una colgada también se cierra, pero no cuenta como "había una viva".
  mock.timers.tick(VIDA_SIN_LATIDO_MS + 1);
  assert.equal(entrar('pc-3', 'ana', '10.0.0.9', exp()), false);
  assert.equal(revocada('pc-2')?.motivo, 'reemplazada');
}));

test('después de reiniciar la API gana la sesión más nueva', () => conReloj(() => {
  const vieja = exp(60_000), nueva = exp();
  // Llega primero la nueva y después la vieja: la vieja queda afuera.
  assert.equal(anotar('nueva', 'ana', '10.0.0.5', nueva), true);
  assert.equal(anotar('vieja', 'ana', '10.0.0.1', vieja), false);
  assert.equal(revocada('vieja')?.ip, '10.0.0.5');
  // Al revés: la nueva desplaza a la vieja.
  _vaciar();
  assert.equal(anotar('vieja', 'ana', '10.0.0.1', vieja), true);
  assert.equal(anotar('nueva', 'ana', '10.0.0.5', nueva), true);
  assert.equal(revocada('vieja')?.motivo, 'reemplazada');
  assert.deepEqual(enSesion().map((f) => f.ip), ['10.0.0.5']);
}));

test('salir la cierra; un token vencido deja de figurar solo', () => conReloj(() => {
  entrar('t1', 'ana', '10.0.0.1', exp());
  entrar('t2', 'beto', '10.0.0.2', Math.floor(Date.now() / 1000) + 60);
  olvidar('t1');
  assert.equal(revocada('t1')?.motivo, 'salio');
  assert.deepEqual(enSesion().map((f) => f.username), ['beto']);
  mock.timers.tick(61_000);
  assert.deepEqual(enSesion(), []);
}));
