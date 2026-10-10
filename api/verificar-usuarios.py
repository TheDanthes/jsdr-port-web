#!/usr/bin/env python3
"""
Pruebas de Administración → Usuarios y del cambio de contraseña.

    API=192.168.3.100:3099 USUARIO=xxx CLAVE=yyy python3 api/verificar-usuarios.py

USUARIO tiene que tener ADMINISTRAR_USUARIOS. Crea un usuario de prueba
("zzprueba"), lo modifica, le blanquea la contraseña, entra con él, la cambia
y al final lo elimina: no deja nada. Opcional: SIN_PERMISO=otro_usuario (y
CLAVE_SIN_PERMISO) para comprobar que a él se le niega.
"""
import atexit
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

B = 'http://' + os.environ.get('API', '127.0.0.1:3099')
U, P = os.environ.get('USUARIO', 'lsosa'), os.environ.get('CLAVE', '1234')
OTRO = os.environ.get('SIN_PERMISO', 'mgomez')
PRUEBA = 'zzprueba'
ok = fallas = 0
FZ = {'forzar': True} if os.environ.get('FORZAR', '').lower() in ('si', 'sí', '1') else {}
_sesiones = []


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


def entrar(u, p, forzar=False):
    c, r = pedir('POST', '/sesion', cuerpo={'username': u, 'password': p, **(FZ or ({'forzar': True} if forzar else {}))})
    if c == 409:
        print(f'  {u} ya está logueado en otro equipo ({r.get("ip")}): cerrá esa sesión o corré con FORZAR=si')
    if c != 200:
        return None, r
    _sesiones.append(r['token'])
    return r['token'], r


def si(nombre, condicion, detalle=''):
    global ok, fallas
    if condicion:
        ok += 1
        print(f'  ok    {nombre}')
    else:
        fallas += 1
        print(f'  FALLA {nombre} -> {detalle}')


def del_prueba(t):
    c, us = pedir('GET', f'/admin/usuarios?username={PRUEBA}', t)
    for u in (us if c == 200 else []):
        if u['username'].lower() == PRUEBA:
            pedir('DELETE', f'/admin/usuarios/{u["id"]}', t)


T, _ = entrar(U, P)
if not T:
    sys.exit(f'No se pudo entrar como {U}')
atexit.register(lambda: [pedir('DELETE', '/sesion', t) for t in reversed(_sesiones)])
atexit.register(lambda: del_prueba(T))
del_prueba(T)   # por si quedó de una corrida cortada
print(f'usuarios en {B}, como {U}')

c, cat = pedir('GET', '/admin/usuarios/catalogos', T)
si('catálogos: permisos generales, secciones y la contraseña por defecto',
   c == 200 and cat['permisos'] and cat['secciones'] and cat['clave_por_defecto'], (c, cat))
pid = {p['nombre']: p['id'] for p in cat['permisos']}
si('los permisos son los generales (no redactar ni fotocomponer)',
   'REDACTAR_NOTICIA' not in pid and 'ADMINISTRAR_USUARIOS' in pid, pid)
CLAVE_DEF = cat['clave_por_defecto']
secs = [s['id'] for s in cat['secciones']]

c, todos = pedir('GET', '/admin/usuarios', T)
si('buscar sin filtro: todos, por username', c == 200 and [u['username'] for u in todos] == sorted(u['username'] for u in todos), c)
c, r = pedir('GET', '/admin/usuarios?username=' + urllib.parse.quote(U[1:4].upper()), T)
si('buscar por usuario ("contiene", sin mayúsculas)', c == 200 and any(u['username'] == U for u in r), r)
c, r = pedir('GET', '/admin/usuarios?nombre=' + urllib.parse.quote("%'_"), T)
si("un texto con comillas y comodines no rompe la búsqueda", c == 200 and r == [], (c, r))
c, r = pedir('GET', '/admin/usuarios?nivel=20', T)
si('buscar por nivel', c == 200 and all(u['nivel'] == 20 for u in r), r)

# --- validaciones de Usuario.isValid -------------------------------------------------
c, r = pedir('POST', '/admin/usuarios', T, {'nivel': 10})
si('vacío: usuario y nombre/apellido obligatorios',
   c == 400 and 'El nombre de usuario no puede ser vacío' in r.get('errores', []) and
   'El nombre/apellido no puede ser vacío' in r.get('errores', []), (c, r))
c, r = pedir('POST', '/admin/usuarios', T, {'username': 'x' * 16, 'nombre_apellido': 'N', 'nivel': 10, 'dni': '1' * 11})
si('largos máximos (usuario 15, DNI 10)', c == 400 and len(r.get('errores', [])) == 2, (c, r))
if 'ASIGNAR_PERMISOS' in pid:
    c, r = pedir('POST', '/admin/usuarios', T, {'username': PRUEBA, 'nombre_apellido': 'Prueba', 'nivel': 10,
                                               'permisos': [pid['ASIGNAR_PERMISOS']]})
    si('un redactor no puede tener ASIGNAR_PERMISOS',
       c == 400 and 'El permiso ASIGNAR_PERMISOS no puede ser asignado al nivel REDACTOR' in r.get('errores', []), (c, r))
c, r = pedir('POST', '/admin/usuarios', T, {'username': PRUEBA, 'nombre_apellido': 'Prueba', 'nivel': 10, 'secciones': secs[:1]})
si('con secciones, la sección por defecto es obligatoria',
   c == 400 and 'La sección por defecto no puede ser vacía' in r.get('errores', []), (c, r))

# --- alta ------------------------------------------------------------------------------
c, r = pedir('POST', '/admin/usuarios', T, {
    'username': PRUEBA, 'nombre_apellido': 'Usuario de Prueba', 'dni': '99999999', 'nivel': 10,
    'secciones': secs[:2], 'seccion_default': secs[0], 'permisos': [pid['ADMINISTRAR_DICCIONARIO']] if 'ADMINISTRAR_DICCIONARIO' in pid else []})
si('alta: entra con la contraseña por defecto, y la API la dice', c == 200 and r['clave'] == CLAVE_DEF and r['usuario']['clave_por_defecto'], (c, r))
nuevo = r['usuario'] if c == 200 else None
if not nuevo:
    sys.exit(1)
si('con sus secciones y la de por defecto', nuevo['secciones'] == sorted(secs[:2]) and nuevo['seccion_default'] == secs[0], nuevo)
c, r = pedir('POST', '/admin/usuarios', T, {'username': PRUEBA.upper(), 'nombre_apellido': 'Otro', 'nivel': 10})
si('repetido (aunque cambien mayúsculas): "El nombre de usuario ya existe"', c == 409 and r['error'] == 'El nombre de usuario ya existe', (c, r))

# --- entrar con la contraseña por defecto: tiene que cambiarla ----------------------
TP, ses = entrar(PRUEBA, CLAVE_DEF)
si('entra con la contraseña por defecto y la sesión lo marca', TP and ses['usuario']['debe_cambiar_password'] is True, ses)
c, r = pedir('GET', '/noticias', TP)
si('no puede hacer nada más: "Debe modificar la contraseña asignada por defecto"',
   c == 403 and r.get('motivo') == 'debe_cambiar_password', (c, r))
c, _ = pedir('POST', '/sesion/latido', TP)
si('pero sigue conectado (latido)', c == 204, c)
c, r = pedir('PUT', '/sesion/clave', TP, {'nueva': 'abc', 'repeticion': 'abc'})
si('largo: "La longitud de la contraseña es incorrecta"', c == 400 and r['error'].startswith('La longitud de la contraseña es incorrecta'), (c, r))
c, r = pedir('PUT', '/sesion/clave', TP, {'nueva': 'prueba1', 'repeticion': 'prueba2'})
si('"La contraseña nueva y su repetición no coinciden"', c == 400 and 'no coinciden' in r['error'], (c, r))
c, r = pedir('PUT', '/sesion/clave', TP, {'nueva': CLAVE_DEF, 'repeticion': CLAVE_DEF})
si('no puede volver a ser la de por defecto', c == 400 and 'por defecto' in r['error'], (c, r))
c, r = pedir('PUT', '/sesion/clave', TP, {'nueva': 'prueba1', 'repeticion': 'prueba1'})
si('la cambia (sin pedir la actual: era la por defecto)', c == 200 and r.get('ok'), (c, r))
c, r = pedir('GET', '/sesion', TP)
si('y ya puede usar el sistema', c == 200 and r['usuario']['debe_cambiar_password'] is False, (c, r))
c, r = pedir('PUT', '/sesion/clave', TP, {'actual': 'mal', 'nueva': 'prueba2', 'repeticion': 'prueba2'})
si('cambio normal con la actual mal: "La contraseña actual es incorrecta"', c == 400 and r['error'] == 'La contraseña actual es incorrecta', (c, r))
c, r = pedir('PUT', '/sesion/clave', TP, {'actual': 'prueba1', 'nueva': 'prueba2', 'repeticion': 'prueba2'})
si('cambio normal', c == 200, (c, r))

# --- modificar ---------------------------------------------------------------------------
c, r = pedir('PUT', f'/admin/usuarios/{nuevo["id"]}', T, {
    'nombre_apellido': 'Usuario Modificado', 'dni': '', 'nivel': 20, 'habilitado': True,
    'secciones': secs[1:2], 'seccion_default': secs[1], 'permisos': []})
u2 = r.get('usuario', {}) if c == 200 else {}
si('modificar: nombre, nivel, secciones y permisos',
   c == 200 and u2['nombre_apellido'] == 'Usuario Modificado' and u2['nivel'] == 20 and u2['secciones'] == secs[1:2]
   and u2['seccion_default'] == secs[1] and u2['permisos'] == [] and u2['dni'] is None, (c, r))
si('el nombre de usuario no cambia', u2.get('username') == PRUEBA, u2)

# --- blanquear ----------------------------------------------------------------------------
c, r = pedir('POST', f'/admin/usuarios/{nuevo["id"]}/blanquear', T)
si(f'blanquear: queda en {CLAVE_DEF} y la API la dice', c == 200 and r['clave'] == CLAVE_DEF and r['username'] == PRUEBA, (c, r))
c, r = pedir('GET', '/noticias', TP)
si('el usuario, aunque esté conectado, tiene que cambiarla en el acto', c == 403 and r.get('motivo') == 'debe_cambiar_password', (c, r))
c, r = pedir('PUT', '/sesion/clave', TP, {'nueva': 'prueba3', 'repeticion': 'prueba3'})
si('y la cambia sin saber cuál era', c == 200, (c, r))

# --- eliminar ------------------------------------------------------------------------------
c, r = pedir('DELETE', f'/admin/usuarios/{nuevo["id"]}', T)
si('conectado: "No se puede eliminar el usuario porque se encuentra logueado en el sistema"',
   c == 409 and 'logueado' in r['error'], (c, r))
pedir('DELETE', '/sesion', TP)
c, r = pedir('DELETE', f'/admin/usuarios/{nuevo["id"]}', T)
si('después de salir, se elimina', c == 200 and r['username'] == PRUEBA, (c, r))
c, r = pedir('GET', f'/admin/usuarios?username={PRUEBA}', T)
si('y ya no está', c == 200 and r == [], r)

# --- a sí mismo y sin permiso ------------------------------------------------------------
yo = next(u for u in todos if u['username'] == U)
c, r = pedir('DELETE', f'/admin/usuarios/{yo["id"]}', T)
si('nadie se elimina a sí mismo', c == 409, (c, r))
c, r = pedir('PUT', f'/admin/usuarios/{yo["id"]}', T, {**yo, 'habilitado': False})
si('ni se deshabilita', c == 409, (c, r))
T2, _ = entrar(OTRO, os.environ.get('CLAVE_SIN_PERMISO', P))
if T2:
    c, r = pedir('GET', '/admin/usuarios', T2)
    si(f'{OTRO} sin permiso: "No tiene permiso para administrar usuarios"', c == 403 and r['error'] == 'No tiene permiso para administrar usuarios', (c, r))
    c, r = pedir('POST', f'/admin/usuarios/{yo["id"]}/blanquear', T2)
    si('ni puede blanquear', c == 403, (c, r))

print('  ---------------------------------')
print(f'  {ok} pasan, {fallas} fallan')
sys.exit(1 if fallas else 0)
