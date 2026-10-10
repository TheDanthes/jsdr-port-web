#!/usr/bin/env python3
"""
Pruebas de Administración → Secciones y → Agencias.

    API=192.168.3.100:3099 USUARIO=xxx CLAVE=yyy python3 api/verificar-secciones-agencias.py

USUARIO tiene que tener ADMINISTRAR_SECCIONES y ADMINISTRAR_AGENCIAS. Crea una
sección y una agencia de prueba ("ZZ Prueba"), las modifica y las elimina: no
deja nada. Opcional: SIN_PERMISO=otro_usuario.
"""
import atexit
import json
import os
import sys
import urllib.error
import urllib.request

B = 'http://' + os.environ.get('API', '127.0.0.1:3099')
U, P = os.environ.get('USUARIO', 'lsosa'), os.environ.get('CLAVE', '1234')
OTRO = os.environ.get('SIN_PERMISO', 'mgomez')
ok = fallas = 0
FZ = {'forzar': True} if os.environ.get('FORZAR', '').lower() in ('si', 'sí', '1') else {}
_sesiones, _creadas = [], []


def pedir(metodo, ruta, token=None, cuerpo=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    r = urllib.request.Request(B + '/api' + ruta, data=datos, method=metodo)
    if datos is not None:
        r.add_header('content-type', 'application/json')
    if token:
        r.add_header('authorization', 'Bearer ' + token)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read() or b'null')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b'null')
        except ValueError:
            return e.code, None


def entrar(u, p):
    c, r = pedir('POST', '/sesion', cuerpo={'username': u, 'password': p, **FZ})
    if c == 409:
        print(f'  {u} ya está logueado en otro equipo ({r.get("ip")}): cerrá esa sesión o corré con FORZAR=si')
    if c != 200:
        return None
    _sesiones.append(r['token'])
    return r['token']


def si(nombre, condicion, detalle=''):
    global ok, fallas
    if condicion:
        ok += 1
        print(f'  ok    {nombre}')
    else:
        fallas += 1
        print(f'  FALLA {nombre} -> {detalle}')


T = entrar(U, P)
if not T:
    sys.exit(f'No se pudo entrar como {U}')
atexit.register(lambda: [pedir('DELETE', '/sesion', t) for t in _sesiones])
atexit.register(lambda: [pedir('DELETE', f'/admin/{q}/{i}', T) for q, i in _creadas])
print(f'secciones y agencias en {B}, como {U}')

# --- secciones --------------------------------------------------------------------------
c, secs = pedir('GET', '/admin/secciones', T)
si('lista de secciones, por nombre, con cuánto se usa cada una',
   c == 200 and [s['nombre'] for s in secs] == sorted(s['nombre'] for s in secs) and 'versiones' in secs[0], (c, secs[:1]))
for s in secs:   # restos de una corrida cortada
    if s['nombre'].startswith('ZZ Prueba'):
        pedir('DELETE', f'/admin/secciones/{s["id"]}', T)
libre = next(a + b for a in 'ZYXW' for b in 'ZYXWVQ' if a + b not in {s['codigo'] for s in secs})
c, r = pedir('POST', '/admin/secciones', T, {'nombre': '', 'codigo': ''})
si('vacía: "El nombre no puede ser vacío" y "El código no puede ser vacío"',
   c == 400 and set(r.get('errores', [])) >= {'El nombre no puede ser vacío', 'El código no puede ser vacío'}, (c, r))
c, r = pedir('POST', '/admin/secciones', T, {'nombre': 'x' * 31, 'codigo': 'ABC'})
si('largos máximos (30 y 2)', c == 400 and len(r.get('errores', [])) == 2, (c, r))
c, r = pedir('POST', '/admin/secciones', T, {'nombre': 'ZZ Prueba', 'codigo': libre.lower()})
si('agregar (el código queda en mayúsculas)', c == 200 and r['codigo'] == libre, (c, r))
sid = r.get('id')
if sid:
    _creadas.append(('secciones', sid))
c, r = pedir('POST', '/admin/secciones', T, {'nombre': 'ZZ Prueba', 'codigo': 'QQ'})
si('mismo nombre: "Ya existe otra sección con el nombre y/o código ingresados"', c == 409 and 'Ya existe otra sección' in r['error'], (c, r))
c, r = pedir('POST', '/admin/secciones', T, {'nombre': 'ZZ Otra', 'codigo': secs[0]['codigo']})
si('mismo código: también', c == 409, (c, r))
c, r = pedir('PUT', f'/admin/secciones/{sid}', T, {'nombre': 'ZZ Prueba 2', 'codigo': libre})
si('modificar', c == 200 and r['nombre'] == 'ZZ Prueba 2', (c, r))
c, r = pedir('PUT', f'/admin/secciones/{sid}', T, {'nombre': 'ZZ Prueba 2', 'codigo': secs[0]['codigo']})
si('modificar a un código de otra: no', c == 409, (c, r))
usada = next((s for s in secs if s['versiones'] > 0 or s['usuarios'] > 0), None)
if usada:
    c, r = pedir('DELETE', f'/admin/secciones/{usada["id"]}', T)
    si(f'con noticias o usuarios no se elimina ({usada["nombre"]})', c == 409 and 'información relacionada' in r['error'], (c, r))
c, r = pedir('DELETE', f'/admin/secciones/{sid}', T)
si('eliminar', c == 200, (c, r))
if c == 200:
    _creadas.remove(('secciones', sid))

# --- agencias ---------------------------------------------------------------------------
c, ags = pedir('GET', '/admin/agencias', T)
si('lista de agencias, con sus cables', c == 200 and 'cables' in ags[0] and 'dias_vida_util' in ags[0], (c, ags[:1]))
for a in ags:
    if a['nombre'].startswith('ZZ Prueba'):
        pedir('DELETE', f'/admin/agencias/{a["id"]}', T)
codigos = {a['codigo'] for a in ags}
libre = next(ch for ch in 'ZzYyXxWwQq9876' if ch not in codigos)
c, r = pedir('POST', '/admin/agencias', T, {'nombre': 'ZZ Prueba', 'codigo': libre, 'dias_vida_util': 0})
si('vida útil 0: "La cantidad de días de vida útil debe ser mayor a 0"', c == 400 and 'mayor a 0' in r['error'], (c, r))
c, r = pedir('POST', '/admin/agencias', T, {'nombre': 'ZZ Prueba', 'codigo': 'ab', 'dias_vida_util': 3})
si('código de más de 1 carácter: no', c == 400, (c, r))
c, r = pedir('POST', '/admin/agencias', T, {'nombre': 'ZZ Prueba', 'codigo': libre, 'dias_vida_util': 5, 'habilitada': False})
si('agregar', c == 200 and r['codigo'] == libre and r['habilitada'] is False, (c, r))
aid = r.get('id')
if aid:
    _creadas.append(('agencias', aid))
otro = libre.swapcase() if libre.swapcase() not in codigos and libre.swapcase() != libre else None
if otro:
    c, r = pedir('POST', '/admin/agencias', T, {'nombre': 'ZZ Prueba B', 'codigo': otro, 'dias_vida_util': 3})
    si(f'el código distingue mayúsculas ("{libre}" y "{otro}" son distintas)', c == 200, (c, r))
    if c == 200:
        pedir('DELETE', f'/admin/agencias/{r["id"]}', T)
c, r = pedir('POST', '/admin/agencias', T, {'nombre': ags[0]['nombre'], 'codigo': '!', 'dias_vida_util': 3})
si('mismo nombre: "Ya existe otra agencia…"', c == 409 and 'Ya existe otra agencia' in r['error'], (c, r))
c, r = pedir('PUT', f'/admin/agencias/{aid}', T, {'nombre': 'ZZ Prueba 2', 'codigo': libre, 'dias_vida_util': 7, 'habilitada': True})
si('modificar', c == 200 and r['dias_vida_util'] == 7 and r['habilitada'] is True, (c, r))
con_cables = next((a for a in ags if a['cables'] > 0), None)
if con_cables:
    c, r = pedir('DELETE', f'/admin/agencias/{con_cables["id"]}', T)
    si(f'con cables no se elimina ({con_cables["nombre"]})', c == 409 and 'información relacionada' in r['error'], (c, r))
c, r = pedir('DELETE', f'/admin/agencias/{aid}', T)
si('eliminar', c == 200, (c, r))
if c == 200:
    _creadas.remove(('agencias', aid))

T2 = entrar(OTRO, os.environ.get('CLAVE_SIN_PERMISO', P))
if T2:
    c, r = pedir('GET', '/admin/secciones', T2)
    si(f'{OTRO}: "No tiene permiso para administrar secciones"', c == 403 and r['error'] == 'No tiene permiso para administrar secciones', (c, r))
    c, r = pedir('POST', '/admin/agencias', T2, {'nombre': 'x', 'codigo': 'x', 'dias_vida_util': 1})
    si(f'{OTRO}: "No tiene permiso para administrar agencias"', c == 403 and r['error'] == 'No tiene permiso para administrar agencias', (c, r))

print('  ---------------------------------')
print(f'  {ok} pasan, {fallas} fallan')
sys.exit(1 if fallas else 0)
