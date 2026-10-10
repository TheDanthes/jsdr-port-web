#!/usr/bin/env python3
"""
Pruebas del flujo de la redacción: pasar de nivel / autorizar, eliminar,
restaurar y confidencialidad.

    API=127.0.0.1:3099 python3 api/verificar-flujo.py

Usa los usuarios de los datos de prueba (db/datos-prueba.sql): mgomez
(redactor, nivel 10) y jperez (jefe, nivel 20), los dos con permiso de
redacción en POLITICA. Crea noticias de prueba con guía "flujo…"; es para la
base de desarrollo, no para la copia del ZimaOS.
"""
import atexit
import json
import os
import sys
import urllib.error
import urllib.request

B = 'http://' + os.environ.get('API', '127.0.0.1:3099')
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


def entrar(u):
    c, r = pedir('POST', '/sesion', cuerpo={'username': u, 'password': '1234', **FZ})
    if c == 409:
        print(f'  {u} ya está logueado en otro equipo ({r.get("ip")}): cerrá esa sesión o corré con FORZAR=si')
    if c == 200:
        _sesiones.append(r['token'])
    if c != 200:
        sys.exit(f'No se pudo entrar como {u}')
    return r['token']


def si(nombre, condicion, detalle=''):
    global ok, fallas
    if condicion:
        ok += 1
        print(f'  ok    {nombre}')
    else:
        fallas += 1
        print(f'  FALLA {nombre} -> {detalle}')


def nueva(t, guia, cuerpo='Texto de prueba del flujo.'):
    """Crea, guarda y cierra una noticia: queda EN_EJECUCION."""
    c, a = pedir('POST', '/editor/nueva', t)
    n = a['noticia']
    d = {'apertura': a['apertura'], 'guia_usuario': guia, 'seccion_id': n['seccion_id'], 'fecha': n['fecha'],
         'confidencial': False, 'titular': 'Titular ' + guia, 'cuerpo': cuerpo,
         'medidas': {'titular': {'cm': 1, 'lineas': 1}, 'cuerpo': {'cm': 1, 'lineas': 1}, 'noticia': {'cm': 2, 'lineas': 2}}}
    c, r = pedir('POST', f"/editor/{n['id']}/1/cerrar", t, {**d, 'accion': 'guardando'})
    assert c == 200, (c, r)
    return n['id'], d


def version(t, nid):
    c, r = pedir('GET', f'/noticias/{nid}', t)
    return r['version'] if c == 200 else None


mg, jp = entrar('mgomez'), entrar('jperez')
print(f'flujo en {B}')

# --- pasar de nivel y autorizar ------------------------------------------------
a, _ = nueva(mg, 'flujoa')
c, r = pedir('POST', f'/noticias/{a}/nivel', jp, {'nivel': 30})
si('un jefe no puede pasar una nota de nivel 10', c == 409 and r['error'] == 'El usuario tiene un nivel distinto al de la noticia', (c, r))
c, r = pedir('POST', f'/noticias/{a}/nivel', mg, {'nivel': 10})
v = version(mg, a)
si('al mismo nivel: sólo la autoriza', c == 200 and r['autorizada'] and v['estado'] == 'AUTORIZADA' and v['nivel'] == 10, (c, r, v and v['estado']))
c, r = pedir('POST', f'/noticias/{a}/nivel', mg, {'nivel': 10})
si('otra vez al mismo nivel: "Seleccione un nivel distinto…"', c == 409 and r['error'] == 'Seleccione un nivel distinto al de la noticia', (c, r))
c, r = pedir('POST', f'/noticias/{a}/nivel', mg, {'nivel': 20})
v = version(mg, a)
si('el redactor la pasa a Jefe', c == 200 and r['nivel_nombre'] == 'Jefe' and v['nivel'] == 20, (c, r))
c, r = pedir('POST', f'/noticias/{a}/nivel', mg, {'nivel': 30})
si('ya no es de su nivel', c == 409 and 'nivel distinto' in r['error'], (c, r))
c, r = pedir('POST', f'/noticias/{a}/nivel', jp, {'nivel': 30})
si('el jefe la pasa a Secretario', c == 200 and version(jp, a)['nivel'] == 30, (c, r))

b, _ = nueva(mg, 'flujob')
c, r = pedir('POST', f'/noticias/{b}/nivel', mg, {'nivel': 20})
v = version(mg, b)
si('EN_EJECUCION a otro nivel: la autoriza y la pasa, de una vez', c == 200 and v['estado'] == 'AUTORIZADA' and v['nivel'] == 20, (c, r))
c, r = pedir('POST', f'/noticias/{b}/nivel', mg, {'nivel': 99})
si('nivel inexistente: 400', c == 400, (c, r))

# --- confidencialidad -------------------------------------------------------------
cc, _ = nueva(jp, 'flujoc')
c, r = pedir('POST', f'/noticias/{cc}/confidencialidad', jp)
si('pasar a confidencial', c == 200 and r['confidencial'] is True and r['visible'], (c, r))
c, r = pedir('GET', f'/noticias/{cc}', mg)
si('otro usuario ya no la ve', c == 404, c)
pedir('POST', f'/noticias/{cc}/nivel', jp, {'nivel': 20})
c, r = pedir('POST', f'/noticias/{cc}/nivel', jp, {'nivel': 10})
si('no baja del nivel de quien la marcó confidencial', c == 409 and 'nivel inferior al nivel de quien la' in r['error'], (c, r))
c, r = pedir('POST', f'/noticias/{cc}/confidencialidad', jp)
si('y vuelve a pública', c == 200 and r['confidencial'] is False, (c, r))

# --- eliminar y restaurar -----------------------------------------------------------
d, _ = nueva(mg, 'flujod')
c, r = pedir('POST', f'/noticias/{d}/eliminar', jp)
si('un jefe no elimina la nota de un redactor', c == 409, (c, r))
c, r = pedir('POST', f'/noticias/{d}/eliminar', mg)
si('eliminar: sin versión activa', c == 200 and r['version_activa'] is None, (c, r))
c, r = pedir('GET', '/noticias?guia=flujod', mg)
si('ya no aparece en el buscador', c == 200 and not any(x['id'] == d for x in r['items']), (c, r['total']))
c, r = pedir('GET', '/mis-versiones-eliminadas', mg)
si('aparece en "Eliminadas"', any(x['id_noticia'] == d for x in r), r)
c, r = pedir('POST', f'/noticias/{d}/eliminar', mg)
si('eliminarla otra vez: "ya fue eliminada"', c == 404 and 'ya fue eliminada' in r['error'], (c, r))
c, r = pedir('POST', f'/noticias/{d}/versiones/1/restaurar', jp)
si('otro usuario no puede restaurarla', c == 403, (c, r))
c, r = pedir('POST', f'/noticias/{d}/versiones/1/restaurar', mg)
v = version(mg, d)
si('restaurar: vuelve a estar activa', c == 200 and v and v['numero'] == 1 and not v['eliminada'], (c, r))
c, r = pedir('POST', f'/noticias/{d}/eliminar', mg)
pedir('POST', f'/noticias/{d}/versiones/1/restaurar', mg)

# versión posterior: v1 fotocompuesta, v2 eliminada, se crea v3 -> v2 ya no se restaura
e, dat = nueva(mg, 'flujoe')
c, r = pedir('POST', f'/noticias/{e}/fotocomponer', mg)
fotocompuso = c == 200
if fotocompuso:
    c, ap = pedir('POST', f'/editor/{e}/abrir', mg)
    pedir('POST', f'/editor/{e}/2/cerrar', mg, {**dat, 'apertura': ap['apertura'], 'cuerpo': 'v2', 'fecha': ap['noticia']['fecha'], 'accion': 'guardando'})
    c, r = pedir('POST', f'/noticias/{e}/eliminar', mg)
    si('eliminar la v2: vuelve la v1', c == 200 and r['version_activa'] == 1, (c, r))
    c, ap = pedir('POST', f'/editor/{e}/abrir', mg)
    si('editar la v1 fotocompuesta crea la v3', c == 200 and ap['noticia']['numero'] == 3, (c, ap))
    pedir('POST', f'/editor/{e}/3/cerrar', mg, {**dat, 'apertura': ap['apertura'], 'cuerpo': 'v3', 'fecha': ap['noticia']['fecha'], 'accion': 'guardando'})
    c, r = pedir('POST', f'/noticias/{e}/versiones/2/restaurar', mg)
    si('la v2 ya no se puede restaurar: hay una posterior', c == 409 and 'versión posterior' in r['error'], (c, r))
else:
    print('  (salteado: versión posterior; el composer no está)')

print('  ---------------------------------')
print(f'  {ok} pasan, {fallas} fallan')
sys.exit(1 if fallas else 0)
