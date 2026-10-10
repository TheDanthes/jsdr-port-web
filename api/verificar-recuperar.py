#!/usr/bin/env python3
"""
Pruebas de la recuperación de noticias que quedan abiertas (Fase 3).

    API=192.168.3.100:3099 VIDA=180 python3 api/verificar-recuperar.py

Simula lo que pasa cuando alguien cierra el navegador con una noticia abierta:
deja de "latir", y pasado VIDA segundos la noticia queda para recuperar. Por eso
conviene correrlo contra una API levantada con JSDR_VIDA_SIN_LATIDO_SEG chico
(8 en las pruebas locales); contra la del ZimaOS (180) tarda unos minutos.

Usa los usuarios de los datos de prueba (mgomez nivel 10, jperez nivel 20, los
dos con permiso de redacción en POLITICA). Deja una noticia de prueba guardada
(guía "recup-NNNN"); la de jperez la borra.
"""
import atexit
import json
import os
import sys
import time
import urllib.error
import urllib.request

B = 'http://' + os.environ.get('API', '127.0.0.1:3099')
VIDA = int(os.environ.get('VIDA', '8'))
CLAVE = os.environ.get('CLAVE', '1234')
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
    c, r = pedir('POST', '/sesion', cuerpo={'username': u, 'password': CLAVE, **FZ})
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


def datos(a, titular, cuerpo, guia=None, apertura=True):
    n = a['noticia']
    d = {
        'guia_usuario': guia if guia is not None else n['guia_usuario'],
        'seccion_id': n['seccion_id'], 'fecha': n['fecha'], 'confidencial': n['confidencial'],
        'titular': titular, 'cuerpo': cuerpo,
        'medidas': {'titular': {'cm': 1, 'lineas': 1}, 'cuerpo': {'cm': 1, 'lineas': 1},
                    'noticia': {'cm': 2, 'lineas': 2}},
    }
    if apertura:
        d['apertura'] = a['apertura']
    return d


def abandonar():
    time.sleep(VIDA + 1)


def estado(token, nid):
    c, r = pedir('GET', f'/noticias/{nid}', token)
    return r['version']['estado'] if c == 200 else c


creadas = []
mg, jp = entrar('mgomez'), entrar('jperez')
print(f'recuperación en {B} (vida sin latido: {VIDA} s)')

# --- 1. nueva, autoguardada y nunca guardada; se cierra el navegador -------------
c, a = pedir('POST', '/editor/nueva', mg)
nid, num = a['noticia']['id'], a['noticia']['numero']
creadas.append(nid)
si('crear devuelve el identificador de la ventana', bool(a.get('apertura')), a)
si('y autoguarda cada 60 segundos', a.get('autosave_segundos') == 60, a.get('autosave_segundos'))
c, _ = pedir('PUT', f'/editor/{nid}/{num}/temporal', mg, datos(a, 'Titular recuperable', 'Cuerpo que no se guardó', 'recup'))
si('autoguardar', c == 200, c)
c, _ = pedir('POST', f'/editor/{nid}/{num}/latido', mg, {'apertura': a['apertura']})
si('latido', c == 200, c)

c, b = pedir('GET', f'/noticias/{nid}/bloqueo', mg)
si('recién abierta: no está para recuperar', b['bloqueada'] and not b['para_recuperar'] and b['abierta_ahora_por'] == 'mgomez', b)
c, r = pedir('POST', f'/editor/{nid}/abrir', mg)
si('abrirla otra vez mientras late: 409 "abierta en otra ventana"', c == 409 and r.get('motivo') == 'abierta_otra_ventana', (c, r))

abandonar()
c, lista = pedir('GET', '/editor/para-recuperar', mg)
si('pasado el tiempo sin latir, aparece en "para recuperar"', any(x['id'] == nid for x in lista), lista)
c, r = pedir('GET', '/noticias?estado=EN_EDICION', mg)
fila = next((x for x in r['items'] if x['id'] == nid), None)
si('en el buscador figura para_recuperar', fila is not None and fila.get('para_recuperar') is True, fila)
c, b = pedir('GET', f'/noticias/{nid}/bloqueo', mg)
si('la ficha muestra lo autoguardado', b['para_recuperar'] and b['temporal'] and b['temporal']['cuerpo'] == 'Cuerpo que no se guardó', b)
si('y al dueño le ofrece recuperar', b['puede'] == 'recuperar', b['puede'])

c, a2 = pedir('POST', f'/editor/{nid}/abrir', mg)
n2 = a2['noticia'] if c == 200 else {}
si('abrirla la recupera', c == 200 and n2.get('recuperada') is True and n2.get('hay_temporal') is True, (c, a2))
si('con el texto autoguardado', n2.get('cuerpo') == 'Cuerpo que no se guardó' and n2.get('titular') == 'Titular recuperable', n2)
si('con la guía que había escrito', n2.get('guia_usuario') == 'recup', n2.get('guia_usuario'))
si('y sabe que nunca se guardó (No la borra)', n2.get('creando') is True, n2.get('creando'))
c, r = pedir('PUT', f'/editor/{nid}/{num}/temporal', mg, datos(a, 'x', 'ventana vieja'))
si('la ventana vieja ya no puede autoguardar (409 otra_ventana)', c == 409 and r.get('motivo') == 'otra_ventana', (c, r))
c, r = pedir('PUT', f'/editor/{nid}/{num}', mg, datos(a2, 'Titular recuperable', 'Cuerpo que no se guardó'))
si('la nueva sí guarda', c == 200, (c, r))
c, r = pedir('POST', f'/editor/{nid}/{num}/cerrar', mg, {'accion': 'sin_guardar', 'apertura': a2['apertura']})
si('cerrar', c == 200, (c, r))
si('queda EN_EJECUCION', estado(mg, nid) == 'EN_EJECUCION', estado(mg, nid))
c, lista = pedir('GET', '/editor/para-recuperar', mg)
si('y ya no está para recuperar', not any(x['id'] == nid for x in lista), lista)

# --- 2. guardada, editada y abandonada: la destraba un jefe guardando ----------
c, a = pedir('POST', f'/editor/{nid}/abrir', mg)
num = a['noticia']['numero']
pedir('PUT', f'/editor/{nid}/{num}/temporal', mg, datos(a, 'Titular recuperable', 'Texto nuevo del autoguardado'))
c, r = pedir('POST', f'/noticias/{nid}/destrabar', jp, {'modo': 'guardar'})
si('un jefe NO puede destrabar mientras la ventana late', c == 409, (c, r))
abandonar()
c, b = pedir('GET', f'/noticias/{nid}/bloqueo', jp)
si('abandonada: al jefe (nivel 20) le ofrece destrabar', b['puede'] == 'destrabar', b)
c, b = pedir('GET', f'/noticias/{nid}/bloqueo', mg)
si('al redactor, recuperar', b['puede'] == 'recuperar', b['puede'])
c, r = pedir('POST', f'/noticias/{nid}/destrabar', jp, {'modo': 'guardar'})
si('el jefe destraba guardando lo autoguardado', c == 200 and r.get('resultado') == 'guardada', (c, r))
c, r = pedir('GET', f'/noticias/{nid}', mg)
v = r['version']
si('la versión quedó con el texto autoguardado', v['cuerpo'] == 'Texto nuevo del autoguardado', v['cuerpo'])
si('EN_EJECUCION y medida por el motor', v['estado'] == 'EN_EJECUCION' and (v['medida']['cm'] or 0) > 0, (v['estado'], v['medida']))
c, b = pedir('GET', f'/noticias/{nid}/bloqueo', mg)
si('y ya no está bloqueada', b == {'bloqueada': False}, b)

# --- 3. otra vez abandonada: el jefe descarta ----------------------------------
c, a = pedir('POST', f'/editor/{nid}/abrir', mg)
num = a['noticia']['numero']
pedir('PUT', f'/editor/{nid}/{num}/temporal', mg, datos(a, 'Titular recuperable', 'Esto se va a descartar'))
abandonar()
c, r = pedir('POST', f'/noticias/{nid}/destrabar', jp, {'modo': 'descartar'})
si('el jefe destraba descartando', c == 200 and r.get('resultado') == 'destrabada', (c, r))
c, r = pedir('GET', f'/noticias/{nid}', mg)
si('queda lo último guardado', r['version']['cuerpo'] == 'Texto nuevo del autoguardado' and r['version']['estado'] == 'EN_EJECUCION', r['version']['cuerpo'])

# --- 4. un redactor no destraba la de un jefe ------------------------------------
c, a = pedir('POST', '/editor/nueva', jp)
nj = a['noticia']['id']
creadas.append(nj)
pedir('PUT', f'/editor/{nj}/1/temporal', jp, datos(a, 'De jperez', 'abc', 'dejefe'))
abandonar()
c, b = pedir('GET', f'/noticias/{nj}/bloqueo', mg)
si('un redactor (10) no puede destrabar la de un jefe (20)', b['puede'] is None and 'nivel superior' in (b['porque'] or ''), b)
c, r = pedir('POST', f'/noticias/{nj}/destrabar', mg, {'modo': 'descartar'})
si('y la API lo rechaza igual si lo intenta', c == 409, (c, r))
c, r = pedir('POST', f'/noticias/{nj}/destrabar', jp, {'modo': 'descartar'})
si('el dueño la descarta: nunca guardada, se borra', c == 200 and r.get('resultado') == 'borrada', (c, r))
creadas.remove(nj)

# --- 5. fotocompuesta reabierta y abandonada sin tocar: se descarta la versión ----
# Escribe un .txt en la carpeta de InDesign: sólo si se pide (FOTOCOMPONER=si).
if os.environ.get('FOTOCOMPONER') != 'si':
    print('  (salteado: reabrir una fotocompuesta; FOTOCOMPONER=si para incluirlo)')
    print('  ---------------------------------')
    print(f'  {ok} pasan, {fallas} fallan')
    sys.exit(1 if fallas else 0)
c, r = pedir('POST', f'/noticias/{nid}/fotocomponer', mg)
si('fotocomponer la de prueba', c == 200, (c, r))
c, a = pedir('POST', f'/editor/{nid}/abrir', mg)
si('reabrir una fotocompuesta crea la versión 2', c == 200 and a['noticia']['numero'] == 2, (c, a))
abandonar()
c, a3 = pedir('POST', f'/editor/{nid}/abrir', mg)
si('al recuperarla sabe que la versión nueva nunca se guardó', a3['noticia'].get('nueva_version') is True, a3['noticia'])
c, r = pedir('POST', f'/editor/{nid}/2/cerrar', mg, {'accion': 'descartar_version', 'apertura': a3['apertura']})
si('"No" descarta la versión 2 y vuelve la fotocompuesta', c == 200 and estado(mg, nid) == 'FOTOCOMPUESTA', (c, r, estado(mg, nid)))

# --- limpieza ---------------------------------------------------------------------
print('  (las noticias de prueba se borran a mano: ' + ', '.join(map(str, creadas)) + ')')
print('  ---------------------------------')
print(f'  {ok} pasan, {fallas} fallan')
sys.exit(1 if fallas else 0)
