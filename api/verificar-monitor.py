#!/usr/bin/env python3
"""
Pruebas de Administración → Monitor de Usuarios.

    API=192.168.3.100:3099 USUARIO=xxx CLAVE=yyy OTRO=zzz CLAVE_OTRO=www python3 api/verificar-monitor.py

USUARIO tiene que tener el permiso MONITOREAR_USUARIOS y OTRO no. Sólo entra,
mira el monitor y sale: no escribe en la base.

Opcionales:
  EDITAR=si   OTRO crea una noticia, la marca confidencial y la descarta (no
              deja nada): comprueba que el monitor la muestra sin identificarla.
  VIDA=8      segundos sin señal para pasar a rojo, si la API corre con
              JSDR_VIDA_SIN_LATIDO_SEG (en producción son 180: no se prueba).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

B = 'http://' + os.environ.get('API', '127.0.0.1:3099')
U, P = os.environ.get('USUARIO', 'lsosa'), os.environ.get('CLAVE', '1234')
O, PO = os.environ.get('OTRO', 'mgomez'), os.environ.get('CLAVE_OTRO', os.environ.get('CLAVE', '1234'))
EDITAR = os.environ.get('EDITAR', '').lower() in ('si', 'sí', '1')
VIDA = int(os.environ.get('VIDA', '0'))
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
    if c != 200:
        sys.exit(f'No se pudo entrar como {u}: {c} {r}')
    return r['token']


def si(nombre, condicion, detalle=''):
    global ok, fallas
    if condicion:
        ok += 1
        print(f'  ok    {nombre}')
    else:
        fallas += 1
        print(f'  FALLA {nombre} -> {detalle}')


def monitor(t):
    c, r = pedir('GET', '/monitor/usuarios', t)
    if c != 200:
        sys.exit(f'El monitor respondió {c}: {r}')
    return r['usuarios']


def filas(lista, username):
    return [f for f in lista if f['username'] == username]


print(f'monitor en {B}: {U} mira, {O} es el otro')
T = entrar(U, P)
T2 = entrar(O, PO)

c, r = pedir('GET', '/monitor/usuarios', T2)
si(f'{O} sin permiso: "No tiene permiso para monitorear usuarios"',
   c == 403 and r['error'] == 'No tiene permiso para monitorear usuarios', (c, r))

lista = monitor(T)
yo = filas(lista, U)
si(f'{U} se ve a sí mismo, en verde', len(yo) >= 1 and all(f['vivo'] for f in yo), yo)
si('con IP, nombre, nivel, desde y última señal',
   yo and all(yo[0].get(k) not in (None, '') for k in ('ip', 'inicio', 'ultima')) and 'nombre_apellido' in yo[0]
   and 'nivel' in yo[0], yo[:1])
otro = filas(lista, O)
si(f'{O} figura recién entrado', len(otro) >= 1 and otro[0]['vivo'], otro)
si('ordenados: los en línea primero',
   [f['vivo'] for f in lista] == sorted([f['vivo'] for f in lista], reverse=True), [f['vivo'] for f in lista])

antes = max(f['ultima'] for f in filas(monitor(T), O))
time.sleep(1.1)
c, _ = pedir('POST', '/sesion/latido', T2)
si('latido de la web: 204', c == 204, c)
despues = max(f['ultima'] for f in filas(monitor(T), O))
si('el latido actualiza la última señal', despues > antes, (antes, despues))
c, _ = pedir('POST', '/sesion/latido', 'no.vale')
si('latido con token inválido: 401', c == 401, c)

if EDITAR:
    c, a = pedir('POST', '/editor/nueva', T2)
    if c != 200:
        si('crear una noticia para la prueba', False, (c, a))
    else:
        nid, num = a['noticia']['id'], a['noticia']['numero']
        try:
            mia = [n for f in filas(monitor(T), O) for n in f['noticias']]
            si(f'la noticia que {O} tiene abierta aparece en su fila',
               any(n.get('id') == nid and n['numero'] == num for n in mia), mia)
            n = a['noticia']
            d = {'guia_usuario': 'monitor', 'seccion_id': n['seccion_id'], 'fecha': n['fecha'],
                 'confidencial': True, 'titular': 'Prueba del monitor', 'cuerpo': 'Cuerpo',
                 'medidas': {'titular': {'cm': 1, 'lineas': 1}, 'cuerpo': {'cm': 1, 'lineas': 1},
                             'noticia': {'cm': 2, 'lineas': 2}},
                 'apertura': a['apertura']}
            c, r = pedir('PUT', f'/editor/{nid}/{num}/temporal', T2, d)
            si('marcarla confidencial (autoguardado)', c == 200, (c, r))
            mia = [n for f in filas(monitor(T), O) for n in f['noticias']]
            conf = [n for n in mia if n.get('confidencial')]
            si('confidencial de otro: el monitor no dice cuál es',
               len(conf) == 1 and set(conf[0]) == {'numero', 'confidencial'}, mia)
        finally:
            c, r = pedir('POST', f'/editor/{nid}/{num}/cerrar', T2,
                         {'accion': 'descartar_creacion', 'apertura': a['apertura']})
            si('descartarla (no queda nada)', c == 200, (c, r))
        mia = [n for f in filas(monitor(T), O) for n in f['noticias']]
        si('cerrada, ya no figura', not mia, mia)

if VIDA:
    T3 = entrar(O, PO)   # otra sesión de OTRO, que se queda callada
    time.sleep(VIDA + 2)
    pedir('POST', '/sesion/latido', T)
    pedir('POST', '/sesion/latido', T2)
    lista = monitor(T)
    rojas = [f for f in filas(lista, O) if not f['vivo']]
    si(f'{VIDA} s sin señal: queda en rojo ("sin señal")', len(rojas) >= 1, filas(lista, O))
    si('y va al final de la lista', lista[-1]['vivo'] is False, [f['vivo'] for f in lista])
    c, _ = pedir('DELETE', '/sesion', T3)

c, _ = pedir('DELETE', '/sesion', T2)
si('salir: 204', c == 204, c)
quedan = filas(monitor(T), O)
si(f'{O} salió y ya no figura (esa sesión)', len(quedan) == len(otro) - 1 if len(otro) > 1 else not quedan,
   quedan)
c, _ = pedir('GET', '/monitor/usuarios', 'no.vale')
si('el monitor sin sesión: 401', c == 401, c)
pedir('DELETE', '/sesion', T)

print(f'\n{ok} ok, {fallas} fallas')
sys.exit(1 if fallas else 0)
