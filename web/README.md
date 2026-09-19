# web — la interfaz de la Fase 1

React + Vite + TypeScript. Sin librería de componentes ni de estado: una hoja
de estilos propia y `useState`. La aplicación tiene cuatro pantallas; meter un
framework encima sería más código para mantener, no menos.

## Desarrollo

```bash
# 1. la API, en otra terminal
cd api && npm run dev          # queda en :3099

# 2. la web
cd web && npm install && npm run dev    # queda en :5173
```

Vite manda `/api` y `/salud` al 3099, así que no hay que configurar nada más.
En producción no hay proxy: la API sirve el build en su mismo puerto.

## Pantallas

| Ruta | |
|---|---|
| *(sin sesión)* | Login contra la tabla `usuarios` |
| `/noticias` | Buscador con los 12 filtros, orden por columna y paginado de 30 |
| `/noticias/:id` | Detalle: historial de versiones y el texto de la elegida |
| `/cables` | Buscador de cables, con el detalle en un panel arriba |
| `/eliminadas` | Versiones que borró el propio redactor |

## Decisiones

**Los filtros viven en la URL.** Una búsqueda se puede guardar en favoritos,
pasar por chat o recorrer con el botón "atrás". El formulario es un borrador;
recién al buscar se escribe la URL, y la URL es la que dispara la consulta.
Así no hay dos fuentes de verdad.

**La identidad sale del token, nunca de la URL.** La API dejó de aceptar
`?usuario=`: con login real, un parámetro así sería una puerta abierta a las
noticias confidenciales de cualquiera.

**El texto de las notas va en serif y con medida acotada.** Es texto de diario
y se lee mejor así. La interfaz alrededor va en la tipografía del sistema.

**Las medidas se muestran siempre en cm y líneas**, como las calcula el motor
tipográfico. Es la unidad con la que la redacción trabaja, no un detalle
interno.

**Descargas por `fetch`, no por `<a href>`.** El token viaja en una cabecera,
no en la URL: el archivo se baja con `fetch` y se entrega desde un blob. De
paso, un rechazo se muestra como error en pantalla en vez de abrir una pestaña
con un JSON.

**Tema claro y oscuro** por `prefers-color-scheme`. La redacción cierra de
noche.

## Lo que todavía no hace

Es de **sólo lectura**. No edita, no fotocompone, no recupera versiones
eliminadas: todo eso escribe en la base y llega en las fases 3 y 4. Los botones
no están escondidos, directamente no existen.
