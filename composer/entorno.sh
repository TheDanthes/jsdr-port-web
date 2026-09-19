#!/bin/sh
#-----------------------------------------------------------------------------
#  Variables de entorno del motor tipográfico.
#
#  Salen tal cual de `medir.sh` y `fotocomponer.sh` del servidor de producción.
#  El motor NO tiene rutas compiladas adentro: todo lo que necesita se lo dice
#  el entorno, así que la única diferencia con producción es dónde vive la
#  carpeta. Se puede mover entera sin tocar un binario.
#
#  Uso:  . /opt/jsdr/entorno.sh
#-----------------------------------------------------------------------------

# Raíz del motor. En producción es /home/jsdr; acá, donde lo deje el Dockerfile.
SDR_ROOT="${SDR_ROOT:-/opt/jsdr/motor}"

SDR_EXCEP_PPAL="${SDR_ROOT}/excepciones/"
SDR_FONTS="${SDR_ROOT}/fonts/"
SDR_UFRM="${SDR_ROOT}/formatos/"
SDR_ESTIL_PPAL="${SDR_ROOT}/estilos/"
SDR_FUENT_PPAL="${SDR_FONTS}"
SDR_TMP="${SDR_TMP:-/tmp/}"

export SDR_ROOT SDR_EXCEP_PPAL SDR_FONTS SDR_UFRM SDR_ESTIL_PPAL SDR_FUENT_PPAL SDR_TMP

# Las barras finales NO son adorno: el motor concatena sin agregar separador.
