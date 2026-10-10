#!/usr/bin/env python3
"""
Pruebas de Administración → Diccionario.

    API=192.168.3.100:3099 USUARIO=xxx CLAVE=yyy python3 api/verificar-diccionario.py

USUARIO tiene que tener el permiso ADMINISTRAR_DICCIONARIO. Agrega, corrige y
borra palabras inventadas ("Zzjsdrprueba..."): al terminar no deja nada.
Opcional: SIN_PERMISO=otro_usuario para comprobar que a él se le niega.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

B = 'http://' + os.environ.get('API', '127.0.0.1:3099')
U, P = os.environ.get('USUARIO', 'mgomez'), os.environ.get('CLAVE', '1234')
OTRO = os.environ.get('SIN_PERMISO', 'jperez')
ok = fallas = 0


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
    c, r = pedir('POST', '/sesion', cuerpo={'username': u, 'password': p})
    return r.get('token') if c == 200 else None


def si(nombre, condicion, detalle=''):
    global ok, fallas
    if condicion:
        ok += 1
        print(f'  ok    {nombre}')
    else:
        fallas += 1
        print(f'  FALLA {nombre} -> {detalle}')


q = urllib.parse.quote
T = entrar(U, P)
if not T:
    sys.exit(f'No se pudo entrar como {U}')
A, B2, C = 'Zzjsdrpruebauno', 'Zzjsdrpruebados', 'Zzjsdrpruebatres'
for w in (A, B2, C):   # por si quedó algo de una corrida cortada
    pedir('DELETE', '/diccionario/' + q(w), T)
print(f'diccionario en {B}, como {U}')

c, r = pedir('GET', '/diccionario?q=a&limite=5', T)
si('buscar (empieza con)', c == 200 and len(r['items']) <= 5 and r['en_total'], (c, r))
c, r = pedir('POST', '/diccionario', T, {'palabra': A})
si('agregar una', c == 200 and r['palabra'] == A, (c, r))
c, r = pedir('POST', '/diccionario', T, {'palabra': A})
si('repetida: "La palabra ya existe en el diccionario"', c == 409 and 'ya existe' in r['error'], (c, r))
c, r = pedir('POST', '/diccionario', T, {'palabra': 'dos palabras'})
si('inválida se rechaza (400)', c == 400, (c, r))
c, r = pedir('POST', '/diccionario', T, {'lista': f'{A}, {B2}\nno-vale'})
si('agregar una lista', c == 200 and r['agregadas'] == [B2] and r['ya_estaban'] == [A] and r['invalidas'] == ['no-vale'], (c, r))
c, r = pedir('GET', '/diccionario?modo=contiene&q=' + q('jsdrprueba'), T)
si('buscar (contiene)', c == 200 and set(r['items']) == {A, B2}, (c, r))
c, r = pedir('POST', '/editor/ortografia', T, {'texto': f'{A} {C}'})
si('la ortografía las conoce al instante', c == 200 and [e['palabra'] for e in r['errores']] == [C], (c, r))
c, r = pedir('PUT', '/diccionario/' + q(B2), T, {'nueva': C})
si('corregir', c == 200 and r['resultado'] == 'corregida', (c, r))
c, r = pedir('PUT', '/diccionario/' + q(C), T, {'nueva': A})
si('corregir a una que ya estaba: se unifica', c == 200 and r['resultado'] == 'unificada', (c, r))
c, r = pedir('DELETE', '/diccionario/' + q(A), T)
si('eliminar', c == 200, (c, r))
c, r = pedir('DELETE', '/diccionario/' + q(A), T)
si('eliminar una que no está: 404', c == 404, (c, r))
c, r = pedir('GET', '/diccionario?modo=contiene&q=' + q('jsdrprueba'), T)
si('no quedó nada', c == 200 and r['items'] == [], (c, r))

T2 = entrar(OTRO, os.environ.get('CLAVE_SIN_PERMISO', P))
if T2:
    c, r = pedir('GET', '/diccionario?q=a', T2)
    si(f'{OTRO} sin el permiso: 403', c == 403, (c, r))

print('  ---------------------------------')
print(f'  {ok} pasan, {fallas} fallan')
sys.exit(1 if fallas else 0)
