# API — Fase 1 (sólo lectura)

Fastify + TypeScript sobre el esquema existente de jSDR. **Ni un INSERT, UPDATE
o DELETE**: el pool abre las conexiones con `default_transaction_read_only=on`,
así que el motor rechaza cualquier escritura que se escape por error.

```bash
npm install
DATABASE_URL=postgresql://jsdr:jsdr_dev@127.0.0.1:55432/jsdr_copia npm run dev
```

## Endpoints

| Método | Ruta | |
|---|---|---|
| GET | `/salud` | Estado, versión de Postgres y conteos |
| GET | `/api/secciones` | 26 secciones |
| GET | `/api/agencias?habilitadas=true` | Agencias de cables |
| GET | `/api/permisos` | Los 9 permisos |
| GET | `/api/usuarios?todos=true` | Usuarios, **nunca con `password`** |
| GET | `/api/usuarios/:username/secciones` | Secciones del usuario + su default |
| GET | `/api/noticias` | Buscador (ver filtros abajo) |
| GET | `/api/noticias/:id?usuario=` | Noticia con todas sus versiones |
| GET | `/api/usuarios/:username/versiones-eliminadas` | Recuperables |
| GET | `/api/cables` | Buscador de cables |
| GET | `/api/cables/:id` | Un cable |
| GET | `/api/cables/:id/reservas` | Reservas de un cable |

### Filtros de `/api/noticias`

`usuario` · `secciones` (ids separados por coma) · `desde` · `hasta` (YYYY-MM-DD) ·
`estado` · `niveles` · `redactor` · `guia` · `texto` (busca en el título) ·
`orden` (`seccion|fecha|estado|redactor|titulo|guia|nivel`) · `asc` · `offset` · `limite`

Devuelve **una fila por noticia: su versión activa**, como el buscador original.
Paginado por defecto de 30, igual que `Constants.FIND_NOTICIAS_LIMIT`.

### Filtros de `/api/cables`

`usuario` (agrega `leido` y `reservado_por`) · `agencias` · `prioridad` ·
`desde` · `hasta` · `tema` · `texto` · `numero` ·
`orden` (`agencia|fecha|prioridad|numero|titulo`) · `asc` · `offset` · `limite`

## Reglas de negocio portadas

- **Confidencialidad** (`MotorReglas`): una noticia confidencial sólo la ve quien la
  redactó. Sin `usuario` en la consulta, ninguna confidencial sale — ni en el listado
  ni por id.
- **Versiones eliminadas**: excluidas del buscador; se consultan por su propio endpoint.
- **Versión activa**: el buscador une por `v.numero = n.numero_version_activa`.
- **`password` nunca se selecciona** en la capa de datos.

## Verificar

```bash
psql -d jsdr_copia -f ../db/datos-prueba.sql
API=localhost:3000 ./verificar.sh
```

18 comprobaciones sobre confidencialidad, filtros, orden, paginado y fuga de datos.
