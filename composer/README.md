# jSDR — servicio del motor tipográfico (Fase 2)

El motor que mide y fotocompone las notas de *La Capital* desde 2005, sacado del
servidor viejo y puesto detrás de HTTP, sin recompilarlo y sin reescribirlo.

```
texto  ──►  medir   ──►  cm y didots, errores tipográficos, texto formateado
texto  ──►  sr2xp   ──►  .xtg  ──►  xtg2ind.pl  ──►  <guia>.txt para InDesign
```

## Por qué esto es el hito que decide el port

El algoritmo tipográfico no está en el Java del sistema: está en dos binarios
independientes, `medir` y `sr2xp`, de los que **no hay código fuente**. Si no se
podían seguir usando tal cual, había que ingeniería-inversarlos y el proyecto
cambiaba de escala.

Se pueden. Y se comprueba en cada build.

## Verificación

```
sh verificar-motor.sh
```

534 comparaciones **byte a byte** contra salidas reales del servidor de
producción:

| | |
|---|---|
| `medir` | 139 casos × 3 salidas — la medida, los errores y el texto formateado |
| `sr2xp` | 58 casos — el `.xtg` que levanta InDesign |
| cadena a InDesign | 58 casos — el Perl original contra la implementación nueva |
| el caso que cuelga | 1 — que siga colgándose (ver abajo) |

No son casos inventados: son noticias que se publicaron, con la medida que el
motor les dio ese día. Están en `pruebas/`, salidas de `Server JSDR/medir/` y
`Server JSDR/fotocomponer/` del servidor.

El banco corre **dentro de la imagen** en cada build (`build-composer.yml`). Si
el motor deja de medir igual, no sale imagen.

## API

| | |
|---|---|
| `GET /salud` | estado, raíz del motor, carpeta de salida |
| `POST /medir` | `{ texto }` → `{ cm, didots, formateado, errores[], ms }` |
| `POST /componer` | `{ texto, guia, seccion }` → deja `<guia>.txt` y devuelve dónde |

El texto entra y sale en **UTF-8**. La conversión a cp850 —el charset de toda
la cadena original— ocurre en un solo punto, al entrar al motor.

## Configuración

| Variable | Default | |
|---|---|---|
| `COMPOSER_PORT` | `3098` | |
| `SDR_ROOT` | `/opt/jsdr/motor` | raíz del motor: `bin/`, `fonts/`, `formatos/`, `estilos/`, `excepciones/` |
| `JSDR_SALIDA_INDESIGN` | `/salida-indesign` | dónde caen los `.txt`. En producción, `/u/indesign` |
| `JSDR_TRABAJO` | `/var/tmp/jsdr-composer` | carpeta de trabajo — **sin puntos en la ruta**, ver abajo |
| `JSDR_TOPE_MOTOR_MS` | `20000` | tope por corrida |
| `JSDR_CONCURRENCIA` | `4` | corridas simultáneas |
| `JSDR_SECCIONES` | `./secciones.json` | mapa sección → carpeta |

## Cuatro cosas que conviene saber antes de tocar esto

**1. La imagen es amd64, no i386.** Los binarios son ELF 32-bit, pero un x86_64
los ejecuta nativo con `libc6:i386` instalada — es todo lo que piden, libc y
libm. Una imagen i386 entera hubiera obligado a escribir el servicio en otro
lenguaje, porque Node no publica binarios de 32 bits para Linux. Sin QEMU y sin
binfmt.

**2. `sr2xp` corta la ruta en el primer punto.** Arma el nombre del `.xtg` con
`cut -f1 -d"."` sobre la ruta de entrada. Con una carpeta de trabajo tipo
`/tmp/tmp.AbC123`, el archivo sale escrito en `/tmp/tmp.xtg` — sin error y sin
aviso, simplemente no aparece donde se lo espera. Por eso `JSDR_TRABAJO` no
puede tener puntos.

**3. `medir` se cuelga.** Con ciertas entradas entra en un bucle infinito: 100 %
de un núcleo, sin salida y sin terminar nunca. No es una hipótesis: en el
servidor de producción quedó guardado el archivo que lo colgaba, con el nombre
`cuelga_medir`, y se reprodujo. Está en `pruebas/cuelga/` y el banco comprueba
que siga colgando. De ahí el tope de tiempo: sin él, una sola nota deja un
proceso girando para siempre. El servicio devuelve **504**, no 500 — el motor no
falló, no terminó, y quien llama tiene que poder distinguirlo.

**4. Los `.pl` rescatados vienen con CRLF.** Con eso el shebang queda
`#!/usr/bin/perl \r` y el script no arranca. En producción no puede ser así
—el diario sale todos los días—, así que el CRLF entró al pasar los archivos por
Windows durante el rescate. La imagen los normaliza al construirse; en el
repositorio quedan tal cual se rescataron.

## Lo que se reescribió y lo que no

| | |
|---|---|
| `medir`, `sr2xp` | **tal cual**, los binarios de producción |
| `xtg2ind.pl` | **tal cual** — 723 líneas de Perl de 2005 que traducen XPress Tags a Tagged Text. No se reescribe lo que no hace falta |
| `mac.pl` | reescrito: cuatro sustituciones y el mapa de secciones, que pasó de un `SWITCH` adentro del Perl a `secciones.json` |
| la cola CUPS `MAC_NUE` | **eliminada**. Su única función era llamar a `mac.pl`; ahora se llama directo, y el error se ve en el momento en lugar de terminar en `/tmp/error_mac_pl` |

La reescritura de `mac.pl` es justamente lo que verifica el bloque 3 del banco:
los 58 casos pasados por la cadena original en Perl y por la nueva, byte a byte.
