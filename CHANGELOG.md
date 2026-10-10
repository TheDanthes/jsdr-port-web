# Versiones de jSDR web

La versión se ve al pie del login y de todas las pantallas, y en `/salud`.

## Cómo se numera

- **`0.FASE.ENTREGA`** mientras la web no reemplace al Swing. El segundo número es la fase
  del plan (1 lectura, 2 composer, 3 editor, 4 flujo y administración) y el tercero, la
  entrega dentro de esa fase.
- **`2.0.0`** el día que los periodistas empiecen a cargar noticias en producción (Fase 5).
  El jSDR de escritorio es la 1.6 (cliente) y la 1.7 (servidor): la web es **jSDR 2**, su
  sucesor. Una "1.0" parecería más vieja que lo que reemplaza.
- Después: `2.x.0` para lo nuevo y `2.x.y` para correcciones.

La API y la web van juntas, en la misma imagen (`ghcr.io/thedanthes/jsdr-api`), y llevan
la misma versión. El composer (`jsdr-composer`) lleva la suya, porque sólo cambia cuando
cambia el motor: hoy es la **0.2.3**.

Cada versión tiene su imagen (`jsdr-api:0.4.4`), así se puede volver a una anterior desde
Container Manager, y su etiqueta en git (`v0.4.4`), que pone el workflow **Etiquetar
versiones** (pestaña Actions → Run workflow; `scripts/etiquetas.sh`).

Para una versión nueva: `scripts/version.sh X.Y.Z`, anotarla acá (`## X.Y.Z — fecha ·
título`), commit y push; después correr "Etiquetar versiones".

---

## 0.4.5 — 2026-10-10 · Usuarios

- Administración → **Usuarios**, como el Swing: buscar (usuario, nombre, nivel), agregar,
  modificar (nombre, DNI, nivel, habilitado, permisos generales, secciones y la de por
  defecto) y eliminar, con sus validaciones y mensajes. Un usuario con noticias no se
  elimina: se deshabilita.
- **Blanquear contraseña**: queda en **123456** y la pantalla lo muestra bien grande, para
  saber qué pasarle al usuario. Lo mismo al crear uno.
- **Cambiar contraseña** (botón "Contraseña" en la barra), con las reglas del Swing: de 6
  a 10 caracteres, repetida igual, distinta de la por defecto.
- Quien entra con la contraseña por defecto (nuevo o blanqueado) **tiene que cambiarla**
  antes de hacer nada, como en el Swing; si se la blanquean estando conectado, en su
  próxima acción.
- Nadie se puede deshabilitar ni eliminar a sí mismo.

## 0.4.4 — 2026-10-10 · Permisos/Sección

- Administración → **Permisos/Sección** ("Asignación de Permisos en Sección"), como el
  Swing: un jefe asigna en su sección por defecto, un secretario en todas las suyas; se
  tildan Redactar y Fotocomponer. La lista muestra los permisos de cada uno y los cambios
  valen en el acto.
- La versión se ve en el login y al pie de cada pantalla, y en `/salud`.

## 0.4.3 — 2026-10-10 · Una sola sesión por usuario

- "Ya te encontrás logueado. ¿Deseás seguir aquí?" Sí cierra la sesión del otro equipo
  (sus noticias abiertas quedan para recuperar); No se queda en el login. El otro equipo
  vuelve al login con aviso.

## 0.4.2 — 2026-10-10 · Monitor de Usuarios

- Administración → **Monitor de Usuarios**: quién está conectado (verde) o colgado (rojo),
  desde cuándo, su IP y qué noticia tiene abierta. Se actualiza cada 5 segundos.

## 0.4.1 — 2026-10-10 · Flujo de la redacción

- En la ficha: **pasar de nivel / autorizar**, **eliminar**, **confidencial / hacer
  pública**. En "Eliminadas": **restaurar**. Mismas reglas y mensajes que el Swing.
- Una confidencial la ve sólo su redactor (decisión de la redacción).

## 0.4.0 — 2026-10-10 · Administración → Diccionario

- Menú **Administración** según los permisos de cada uno.
- **Diccionario**: buscar (empieza con / contiene), agregar una palabra o una lista,
  corregir y eliminar. Se refleja al instante en la revisión ortográfica.

## 0.3.1 — 2026-10-10 · Recuperar y ortografía

- Autoguardado cada minuto. Las notas que quedan abiertas al cerrar el navegador aparecen
  "para recuperar" (en rojizo) y al abrirlas piden guardar; un jefe puede destrabarlas.
- Revisión ortográfica con el diccionario del jSDR (Ctrl+I, marcas azules) además de la de
  Chrome.

## 0.3.0 — 2026-10-08 · Fase 3: el editor

- Editor de noticias web con los atajos, mensajes y reglas del Swing: medir con el motor,
  guardar, cerrar, fotocomponer (el .txt para InDesign idéntico al del Swing).

## 0.2.3 — 2026-10-08 · Banco del motor sin root

- El banco de pruebas del composer corre como el usuario del contenedor.

## 0.2.2 — 2026-10-07 · Composer en el ZimaOS

- Composer instalable desde Container Manager; guía para instalar en un equipo nuevo.

## 0.2.1 — 2026-09-19 · Composer completo

- Perl completo en la imagen del composer; el banco informa bien cuando algo falla.

## 0.2.0 — 2026-09-19 · Fase 2: el motor tipográfico

- El motor de 2005 que mide y fotocompone, en un contenedor: 534 comparaciones byte a byte
  contra producción, todas idénticas.

## 0.1.4 — 2026-09-19 · Arreglo de la imagen

- El nombre de la imagen en minúsculas (el build de GitHub fallaba por eso).

## 0.1.3 — 2026-09-19 · Buscador más rápido (2)

- Índice de título por prefijo; limpieza de índices viejos.

## 0.1.2 — 2026-09-19 · Buscador más rápido

- Índices del buscador y conteo acotado ("más de 1.000").

## 0.1.1 — 2026-09-19 · Fase 1: la web de lectura

- Login con el usuario del jSDR de escritorio, buscadores de noticias y cables, ficha con
  versiones, eliminadas, exportar a CSV y texto. Una sola imagen (API + web).

## 0.1.0 — 2026-09-18 · Primera API

- API de lectura sobre la copia de la base, despliegue en el ZimaOS y restauración de la
  copia.

## 0.0.1 — 2026-09-18 · Comienzo

- Base del proyecto: entorno de desarrollo y esquema de la base.
