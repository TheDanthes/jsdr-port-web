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
import atexit
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
# Una sola sesión por usuario: si alguno ya está conectado en otro equipo, la
# API pregunta (409). Con FORZAR=si se cierra esa sesión. Al terminar, sale.
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
    if c == 200:
        _sesiones.append(r['token'])
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

def entrar_de_nuevo(u, p, forzar):
    """Login sin las ayudas de entrar(): para probar la pregunta "¿Deseás seguir aquí?"."""
    c, r = pedir('POST', '/sesion', cuerpo={'username': u, 'password': p, **({'forzar': True} if forzar else {})})
    if c == 200:
        _sesiones.append(r['token'])
    return c, r


nid = num = None
if EDITAR:
    c, a = pedir('POST', '/editor/nueva', T2)
    if c != 200:
        si('crear una noticia para la prueba', False, (c, a))
    else:
        nid, num = a['noticia']['id'], a['noticia']['numero']
        mia = [n for f in filas(monitor(T), O) for n in f['noticias']]
        si(f'la noticia que {O} tiene abierta aparece en su fila',
           any(n.get('id') == nid and n['numero'] == num for n in mia), mia)
        n = a['noticia']
        d = {'guia_usuario': 'monitor', 'seccion_id': n['seccion_id'], 'fecha': n['fecha'],
             'confidencial': True, 'titular': 'Prueba del monitor', 'cuerpo': 'Cuerpo autoguardado',
             'medidas': {'titular': {'cm': 1, 'lineas': 1}, 'cuerpo': {'cm': 1, 'lineas': 1},
                         'noticia': {'cm': 2, 'lineas': 2}},
             'apertura': a['apertura']}
        c, r = pedir('PUT', f'/editor/{nid}/{num}/temporal', T2, d)
        si('marcarla confidencial (autoguardado)', c == 200, (c, r))
        mia = [n for f in filas(monitor(T), O) for n in f['noticias']]
        conf = [n for n in mia if n.get('confidencial')]
        si('confidencial de otro: el monitor no dice cuál es',
           len(conf) == 1 and set(conf[0]) == {'numero', 'confidencial'}, mia)

# --- una sola sesión por usuario -------------------------------------------------
c, r = entrar_de_nuevo(O, PO, False)
si(f'{O} entra desde otro equipo: "Ya te encontrás logueado. ¿Deseás seguir aquí?"',
   c == 409 and r.get('motivo') == 'ya_logueado' and 'seguir aquí' in r.get('error', ''), (c, r))
si('la pregunta dice desde dónde y desde cuándo', bool(r.get('ip')) and bool(r.get('desde')), r)
c, _ = pedir('POST', '/sesion/latido', T2)
si('"No": la sesión anterior sigue andando', c == 204, c)
c, r = entrar_de_nuevo(O, PO, True)
T3 = r.get('token') if c == 200 else None
si('"Sí": entra', c == 200 and T3, (c, r))
c, r = pedir('POST', '/sesion/latido', T2)
si('y la sesión anterior queda cerrada, con aviso',
   c == 401 and r.get('motivo') == 'sesion_reemplazada' and 'entraste desde otro equipo' in r.get('error', ''), (c, r))
c, r = pedir('GET', '/sesion', T2)
si('también al volver a abrir la web en el equipo anterior', c == 401 and r.get('motivo') == 'sesion_reemplazada', (c, r))
quedan = filas(monitor(T), O)
si(f'en el monitor, {O} figura una sola vez', len(quedan) == 1 and quedan[0]['vivo'], quedan)

if nid:
    c, r = pedir('GET', '/editor/para-recuperar', T3)
    si('la noticia que tenía abierta queda para recuperar en el acto',
       c == 200 and any(x['id'] == nid for x in r), (c, r))
    c, a3 = pedir('POST', f'/editor/{nid}/abrir', T3, {})
    si('al abrirla se recupera lo autoguardado',
       c == 200 and a3['noticia'].get('cuerpo') == 'Cuerpo autoguardado' and a3['noticia'].get('recuperada') is True, (c, a3))
    c, r = pedir('POST', f'/editor/{nid}/{num}/cerrar', T3,
                 {'accion': 'descartar_creacion', 'apertura': a3.get('apertura') if isinstance(a3, dict) else None})
    si('descartarla (no queda nada)', c == 200, (c, r))
    mia = [n for f in filas(monitor(T), O) for n in f['noticias']]
    si('cerrada, ya no figura', not mia, mia)

if VIDA and T3:
    time.sleep(VIDA + 2)
    pedir('POST', '/sesion/latido', T)
    lista = monitor(T)
    rojas = [f for f in filas(lista, O) if not f['vivo']]
    si(f'{VIDA} s sin señal: queda en rojo ("sin señal")', len(rojas) == 1, filas(lista, O))
    si('y va al final de la lista', lista[-1]['vivo'] is False, [f['vivo'] for f in lista])
    c, r = entrar_de_nuevo(O, PO, False)
    si('una sesión colgada no pregunta: entra directo', c == 200, (c, r))
    if c == 200:
        T3 = r['token']
    quedan = filas(monitor(T), O)
    si('y reemplaza a la colgada', len(quedan) == 1 and quedan[0]['vivo'], quedan)

c, _ = pedir('DELETE', '/sesion', T3)
si('salir: 204', c == 204, c)
si(f'{O} salió y ya no figura', not filas(monitor(T), O), filas(monitor(T), O))
c, r = pedir('POST', '/sesion/latido', T3)
si('y ese token ya no vale', c == 401 and r.get('motivo') == 'sesion_cerrada', (c, r))
c, _ = pedir('GET', '/monitor/usuarios', 'no.vale')
si('el monitor sin sesión: 401', c == 401, c)

print(f'\n{ok} ok, {fallas} fallas')
sys.exit(1 if fallas else 0)
