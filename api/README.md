# API — Fase 1 (sólo lectura)

Fastify + TypeScript sobre el esquema existente de jSDR. **Ni un INSERT, UPDATE
o DELETE**: el pool abre las conexiones con `default_transaction_read_only=on`,
así que el motor rechaza cualquier escritura que se escape por error.

```bash
npm install
DATABASE_URL=postgresql://jsdr:jsdr_dev@127.0.0.1:55432/jsdr_copia npm run dev
```

Si existe `../web/dist`, la API además sirve la web en el mismo puerto. Si no,
arranca sólo como API — que es lo que conviene en desarrollo, con Vite sirviendo
el front aparte.

## Sesión

Hay login real contra la tabla `usuarios`. La comparación de contraseña la hace
PostgreSQL en el `WHERE`, igual que el DAO original, así que **la contraseña
nunca se selecciona ni llega a la aplicación**. Sigue siendo texto plano en la
base: deuda heredada, documentada, que se salda en la Fase 5.

| Método | Ruta | |
|---|---|---|
| POST | `/api/sesion` | `{username, password}` → token + usuario, secciones y permisos |
| GET | `/api/sesion` | Estado de la sesión actual |

El token es HMAC-SHA256 propio, sin dependencias: `base64url(carga).base64url(firma)`.
No es un JWT y no pretende serlo — el único que firma y verifica es este servicio.
Lleva sólo el username y el vencimiento; **todo lo demás se relee de la base en
cada pedido**, así que deshabilitar a alguien en el sistema viejo le corta el
acceso al nuevo de inmediato, sin esperar a que venza nada.

Todo `/api/*` exige sesión, salvo el propio `POST /api/sesion`.

| Variable | |
|---|---|
| `JSDR_SECRETO_SESION` | Firma los tokens. Sin ella se genera una al azar en cada arranque y las sesiones se cierran al reiniciar |
| `JSDR_HORAS_SESION` | Duración, 12 por defecto |

Login fallido responde **siempre lo mismo** —usuario inexistente, contraseña
incorrecta o usuario deshabilitado— y hay un freno de 8 intentos por minuto por
username: las contraseñas son de hasta 10 caracteres, conviene que probarlas
cueste.

## Endpoints

| Método | Ruta | |
|---|---|---|
| GET | `/salud` | Estado, versión de Postgres y conteos. No exige sesión |
| GET | `/api/secciones` | 26 secciones |
| GET | `/api/agencias?habilitadas=true` | Agencias de cables |
| GET | `/api/permisos` | Los 9 permisos |
| GET | `/api/usuarios?todos=true` | Usuarios, **nunca con `password`** |
| GET | `/api/usuarios/:username/secciones` | Secciones del usuario + su default |
| GET | `/api/noticias` | Buscador (ver filtros abajo) |
| GET | `/api/noticias/:id` | Noticia con todas sus versiones |
| GET | `/api/mis-versiones-eliminadas` | Las del usuario de la sesión |
| GET | `/api/cables` | Buscador de cables |
| GET | `/api/cables/:id` | Un cable (por **id**, no por `numero`) |
| GET | `/api/cables/:id/reservas` | Reservas de un cable |
| GET | `/api/noticias.csv` | Resultados del buscador, hasta 5000 filas |
| GET | `/api/cables.csv` | Ídem para cables |
| GET | `/api/noticias/:id/versiones/:numero/texto` | Una versión en texto plano |
| GET | `/api/cables/:id/texto` | Un cable en texto plano |

### Filtros de `/api/noticias`

`secciones` (ids separados por coma) · `desde` · `hasta` (YYYY-MM-DD) ·
`estado` · `niveles` · `redactor` · `guia` · `texto` (busca en el título) ·
`orden` (`seccion|fecha|estado|redactor|titulo|guia|nivel`) · `asc` · `offset` · `limite`

Devuelve **una fila por noticia: su versión activa**, como el buscador original.
Paginado por defecto de 30, igual que `Constants.FIND_NOTICIAS_LIMIT`.

### Filtros de `/api/cables`

`agencias` · `prioridad` · `desde` · `hasta` · `tema` · `texto` · `numero` ·
`orden` (`agencia|fecha|prioridad|numero|titulo`) · `asc` · `offset` · `limite`

> **No existe un parámetro `usuario`.** Lo hubo antes del login y se quitó: con
> sesión real, dejarlo sería una puerta abierta a las noticias confidenciales de
> cualquiera con sólo editar la URL. El usuario sale del token.

## Reglas de negocio portadas

- **Confidencialidad** (`MotorReglas`): una noticia confidencial sólo la ve quien
  la redactó. Está en el `WHERE`, no en la presentación. Por id devuelve **404 y
  no 403**, para no confirmar siquiera que existe. Los exports pasan por la misma
  función, así que tampoco filtran.
- **Versiones eliminadas**: excluidas del buscador; endpoint propio, y sólo las
  propias — recuperar es cosa del redactor que borró.
- **Versión activa**: el buscador une por `v.numero = n.numero_version_activa`.
- **`password` nunca se selecciona** en la capa de datos.
- **Orden por varias columnas**: la dirección se repite en cada una. Escrito como
  un solo string, `ORDER BY fecha, hora DESC` ordena fecha ASC y hora DESC — que
  fue exactamente el error que las pruebas encontraron en los cables.

## Exports

CSV con separador `;` y BOM: así el Excel en español lo abre de doble clic, en
columnas y con los acentos bien. Con coma y sin BOM entra todo en una columna.

El texto plano es para leer, imprimir o pegar. **No es Tagged Text ni XPress
Tags**: eso lo produce el composer en la Fase 2, con el motor tipográfico
original.

## Verificar

```bash
psql -d jsdr_copia -f ../db/datos-prueba.sql
API=localhost:3099 ./verificar.sh
```

32 comprobaciones sobre sesión, confidencialidad, filtros, orden, paginado,
exports y fuga de datos.
