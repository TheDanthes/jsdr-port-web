#!/usr/bin/env bash
#-----------------------------------------------------------------------------
# Pone en git una etiqueta por versión (v0.4.4, ...) y las sube a GitHub.
# No toca las que ya existen: se puede correr las veces que haga falta.
#
# Lo corre el workflow "Etiquetar versiones" (pestaña Actions → Run workflow),
# o a mano desde una copia del repo:  bash scripts/etiquetas.sh
#
#   - Las versiones anteriores a la numeración (0.0.1 a 0.4.3) van a mano,
#     acá abajo, sobre el commit de cada entrega.
#   - De la 0.4.4 en adelante, cada versión anotada en CHANGELOG.md se
#     etiqueta en el commit que puso ese número en api/package.json.
#-----------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

etiquetar() {   # versión commit descripción
  if git rev-parse -q --verify "refs/tags/v$1" >/dev/null; then
    echo "  v$1 ya existe"
  else
    git tag -a "v$1" "$2" -m "$1 — $3"
    echo "  v$1 → $(git rev-parse --short "$2")  $3"
  fi
}

etiquetar 0.0.1 42d299c "Comienzo: entorno de desarrollo y esquema de la base"
etiquetar 0.1.0 9caf11c "Primera API: lectura, despliegue en ZimaOS, restauración de la copia"
etiquetar 0.1.1 a29adbd "Fase 1: login, web de lectura completa, imagen única"
etiquetar 0.1.2 d4eb279 "Índices del buscador y conteo acotado"
etiquetar 0.1.3 db497bf "Índice de título por prefijo"
etiquetar 0.1.4 4227500 "Arreglo: nombre de imagen en minúsculas"
etiquetar 0.2.0 2abe3cd "Fase 2: motor tipográfico en contenedor, 534/534"
etiquetar 0.2.1 cfbe372 "Composer: Perl completo y banco que informa bien"
etiquetar 0.2.2 206a8b0 "Composer en ZimaOS (Container Manager)"
etiquetar 0.2.3 0a6d3f3 "Banco del motor sin root"
etiquetar 0.3.0 19f6ea7 "Fase 3: editor de noticias web"
etiquetar 0.3.1 b071be3 "Recuperar notas abandonadas y ortografía"
etiquetar 0.4.0 c86fbb7 "Administración: Diccionario"
etiquetar 0.4.1 7c066d5 "Flujo de la redacción"
etiquetar 0.4.2 89b9f99 "Monitor de Usuarios"
etiquetar 0.4.3 fc9f16a "Una sola sesión por usuario"

# De acá en adelante, lo que diga CHANGELOG.md ("## 0.4.4 — fecha · título").
grep -E '^## [0-9]+\.[0-9]+\.[0-9]+ ' CHANGELOG.md | while read -r _ v _ _ _ titulo; do
  git rev-parse -q --verify "refs/tags/v$v" >/dev/null && continue
  commit=$(git log --reverse --format=%H -G"\"version\": \"$v\"" -- api/package.json | head -1)
  if [ -z "$commit" ]; then
    echo "  v$v: ningún commit puso esa versión en api/package.json (¿falta scripts/version.sh?)"
    continue
  fi
  etiquetar "$v" "$commit" "${titulo:-versión $v}"
done

git push origin --tags
