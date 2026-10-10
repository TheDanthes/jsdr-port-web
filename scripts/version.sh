#!/usr/bin/env bash
#-----------------------------------------------------------------------------
# Cambia la versión del sistema (la API y la web van juntas, en la misma imagen).
#
#   scripts/version.sh 0.4.5
#
# Numeración (ver CHANGELOG.md):
#   0.FASE.ENTREGA   mientras la web no reemplaza al Swing
#   2.0.0            el día que los periodistas cargan noticias en producción
#                    (el jSDR de escritorio es la 1.6 / 1.7: la web es "jSDR 2")
#
# El composer lleva su propia versión: sólo cambia cuando cambia el motor
# (composer/package.json, a mano).
#
# Después: anotar la versión en CHANGELOG.md, commit, y la etiqueta:
#   git tag -a v0.4.5 -m "0.4.5 — ..." && git push origin main --tags
#-----------------------------------------------------------------------------
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
v="${1:-}"
if ! [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Uso: $0 X.Y.Z   (versión actual: $(node -p "require('$raiz/api/package.json').version"))"
  exit 1
fi
for d in api web; do
  (cd "$raiz/$d" && npm version "$v" --no-git-tag-version --allow-same-version >/dev/null)
  echo "  $d → $v"
done
grep -q "^## $v " "$raiz/CHANGELOG.md" || echo "  Falta anotar la $v en CHANGELOG.md"
