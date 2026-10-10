#!/usr/bin/env python3
"""
Pruebas de Administración → Permisos/Sección.

    API=192.168.3.100:3099 USUARIO=xxx CLAVE=yyy python3 api/verificar-permisos.py

USUARIO tiene que poder asignar permisos (ASIGNAR_PERMISOS, nivel jefe o
secretario). En la primera sección que administra, a un usuario de esa
sección le cambia un permiso y se lo devuelve: al terminar quedan como
estaban. Opcional: SIN_PERMISO=otro_usuario (redactor) para comprobar que a
él se le niega; CLAVE_SIN_PERMISO si su clave es otra.
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
_sesiones = []
atexit.register(lambda: [pedir('DELETE', '/sesion', t) for t in _sesiones])


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
print(f'permisos por sección en {B}, como {U}')

c, ini = pedir('GET', '/permisos-seccion', T)
si('arranca: secciones que administra y permisos de sección', c == 200 and ini['secciones'] and ini['permisos'], (c, ini))
if c != 200 or not ini['secciones']:
    sys.exit(1)
nombres = {p['nombre'] for p in ini['permisos']}
si('los permisos son los de sección (redactar, fotocomponer), no los generales',
   'REDACTAR_NOTICIA' in nombres and not nombres & {'ASIGNAR_PERMISOS', 'ADMINISTRAR_DICCIONARIO', 'MONITOREAR_USUARIOS'},
   nombres)
sec = ini['secciones'][0]['id']

c, us = pedir('GET', f'/permisos-seccion/{sec}/usuarios', T)
si('usuarios de la sección, por username', c == 200 and [u['username'] for u in us] == sorted(u['username'] for u in us), (c, us))
si('con su sección por defecto marcada y sus permisos', all('es_default' in u and 'permisos' in u for u in us), us[:1])
blanco = next((u for u in us if u['username'] != U), us[0] if us else None)
if not blanco:
    sys.exit('La sección no tiene usuarios para probar')
antes = sorted(blanco['permisos'])
pid = ini['permisos'][0]['id']
nuevo = sorted(set(antes) ^ {pid})   # le cambia uno: si lo tenía se lo saca, si no se lo da

c, r = pedir('PUT', f'/permisos-seccion/{sec}/usuarios/{blanco["id"]}', T, {'permisos': nuevo})
si(f'cambiar un permiso de {blanco["username"]}', c == 200 and r['permisos'] == nuevo and r['agregados'] + r['quitados'] == 1, (c, r))
c, us2 = pedir('GET', f'/permisos-seccion/{sec}/usuarios', T)
ahora = next(u for u in us2 if u['id'] == blanco['id'])['permisos']
si('quedó guardado', sorted(ahora) == nuevo, ahora)
c, r = pedir('PUT', f'/permisos-seccion/{sec}/usuarios/{blanco["id"]}', T, {'permisos': nuevo})
si('guardar lo mismo no cambia nada', c == 200 and r['agregados'] == 0 and r['quitados'] == 0, (c, r))
c, r = pedir('PUT', f'/permisos-seccion/{sec}/usuarios/{blanco["id"]}', T, {'permisos': antes})
si('devolverlo como estaba', c == 200 and r['permisos'] == antes, (c, r))

general = 9999
c, r = pedir('PUT', f'/permisos-seccion/{sec}/usuarios/{blanco["id"]}', T, {'permisos': antes + [general]})
si('un permiso que no es de sección: 400', c == 400, (c, r))
c, r = pedir('PUT', f'/permisos-seccion/{sec}/usuarios/{blanco["id"]}', T, {'permisos': 'todos'})
si('permisos mal armados: 400', c == 400, (c, r))
c, todas = pedir('GET', '/secciones', T)
ajena = next((s['id'] for s in todas if s['id'] not in {x['id'] for x in ini['secciones']}), None)
if ajena:
    c, r = pedir('GET', f'/permisos-seccion/{ajena}/usuarios', T)
    si('una sección que no administra: 403', c == 403, (c, r))
    c, r = pedir('PUT', f'/permisos-seccion/{ajena}/usuarios/{blanco["id"]}', T, {'permisos': []})
    si('ni para guardar', c == 403, (c, r))
c, r = pedir('PUT', f'/permisos-seccion/{sec}/usuarios/999999', T, {'permisos': []})
si('un usuario que no es de la sección: 404', c == 404, (c, r))

T2 = entrar(OTRO, os.environ.get('CLAVE_SIN_PERMISO', P))
if T2:
    c, r = pedir('GET', '/permisos-seccion', T2)
    si(f'{OTRO} no puede: mensaje del Swing',
       c == 403 and r['error'] in ('El usuario no tiene el nivel JEFE o SECRETARIO', 'El usuario no tiene permisos de ASIGNAR_PERMISOS'),
       (c, r))
    c, r = pedir('PUT', f'/permisos-seccion/{sec}/usuarios/{blanco["id"]}', T2, {'permisos': []})
    si('ni guardando por la API', c == 403, (c, r))

c, us3 = pedir('GET', f'/permisos-seccion/{sec}/usuarios', T)
si('al final, todo como estaba', sorted(next(u for u in us3 if u['id'] == blanco['id'])['permisos']) == antes, us3)

print('  ---------------------------------')
print(f'  {ok} pasan, {fallas} fallan')
sys.exit(1 if fallas else 0)
