# =============================================================================
#  jSDR — servicio del motor tipográfico (Fase 2)
#
#  POR QUÉ LA IMAGEN ES amd64 Y NO i386
#
#  `medir` y `sr2xp` son ELF 32-bit i386 de 2005 y no hay código fuente para
#  recompilarlos. La salida obvia parecía ser una imagen `i386/debian` entera,
#  pero eso arrastra un problema: Node no publica binarios de 32 bits para
#  Linux desde hace años, así que el servicio tendría que escribirse en otro
#  lenguaje que el resto del port.
#
#  No hace falta. Un x86_64 ejecuta binarios i386 de forma nativa mientras
#  estén las bibliotecas de 32 bits: `medir` sólo pide libc y libm. Así que la
#  imagen es amd64 —Node moderno, mismo stack que la API— con `libc6:i386`
#  agregada. Los dos binarios corren sin emulación, sin QEMU y sin binfmt.
#
#  Verificado: 534/534 salidas idénticas byte a byte contra producción.
#  El banco de pruebas corre DENTRO de esta imagen en cada build (ver el
#  workflow build-composer.yml): si el motor deja de medir igual, no sale
#  imagen.
# =============================================================================

# --- 1. compilar el servicio -------------------------------------------------
FROM node:22-bookworm-slim AS construccion
WORKDIR /build
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc


# --- 2. la imagen que corre --------------------------------------------------
FROM node:22-bookworm-slim

# Las bibliotecas de 32 bits, que es todo lo que el motor necesita.
# `perl` viene en la imagen base (perl-base) y alcanza: xtg2ind.pl no usa
# un solo módulo externo.
RUN dpkg --add-architecture i386 \
 && apt-get update \
 && apt-get install -y --no-install-recommends libc6:i386 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/jsdr

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=construccion /build/dist ./dist
COPY secciones.json ./
COPY motor ./motor
COPY pruebas ./pruebas
COPY verificar-motor.sh entorno.sh ./

# Los .pl y .sh rescatados vienen con finales de línea CRLF, y con eso el
# shebang queda `#!/usr/bin/perl \r`: el kernel llama a perl con un argumento
# vacío y el script muere con "Can't open perl script". En producción no puede
# ser así —el diario sale todos los días—, o sea que el CRLF entró al pasar los
# archivos por Windows durante el rescate. Se normaliza acá, en la imagen; los
# archivos del repositorio quedan tal cual se rescataron.
RUN find motor/bin pruebas -type f \( -name '*.pl' -o -name '*.sh' \) \
      -exec sed -i 's/\r$//' {} + \
 && chmod +x motor/bin/medir motor/bin/sr2xp motor/bin/*.pl motor/bin/*.sh \
 && chmod +x verificar-motor.sh

# `xtg2ind.pl` abre /home/jsdr/bin/lista_fonts con la ruta escrita adentro.
# Se le da esa ruta en lugar de editar el script.
RUN mkdir -p /home/jsdr && ln -s /opt/jsdr/motor/bin /home/jsdr/bin

# Carpeta de trabajo de las corridas. SIN PUNTOS en el nombre: sr2xp arma el
# nombre del .xtg cortando la ruta en el primer punto.
RUN mkdir -p /var/tmp/jsdr-composer /salida-indesign /usr/local/jSDR/medir/amedir \
 && chown -R node:node /var/tmp/jsdr-composer /salida-indesign /usr/local/jSDR

ENV NODE_ENV=production \
    SDR_ROOT=/opt/jsdr/motor \
    JSDR_TRABAJO=/var/tmp/jsdr-composer \
    JSDR_SALIDA_INDESIGN=/salida-indesign \
    COMPOSER_PORT=3098

USER node
EXPOSE 3098

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.COMPOSER_PORT||3098)+'/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
