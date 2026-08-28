# Los 11 proyectos, leídos del Jira

Fuente: `cecyteinformatica.atlassian.net`, API de proyectos, 2026-08-27. **PM-care no se
conecta a Jira** (regla 11, `connect-src 'none'`): esto se leyó una vez, fuera de la app, y
se escribió aquí. Si cambia, se vuelve a leer a mano.

## Claves

La clave es **inmutable** y es el prefijo de todos los ids del proyecto. Tres no son las
que uno adivinaría:

| Clave | Nombre en Jira | Ojo |
|---|---|---|
| `SICOE` | SICOE | |
| `SIES` | SIEST | la clave **no** es `SIEST` |
| `PED` | Plataforma Eventos Deportivos | |
| `DW` | DGETI web | la clave **no** es `DGETI-WEB` |
| `IN` | Infraestructura | la clave **no** es `INFRA` |
| `IDCE` | IDCE | |
| `INDICA` | INDICA | |
| `PULSO` | PULSO | |
| `REDOC` | REDOC | |
| `RENAC` | RENAC | |
| `SISEC` | SISEC | |

## Qué nivel tiene cada uno, de verdad

Esto es lo que decidió N9, y no era una preferencia de diseño: **cinco de los once
proyectos no tienen nivel de historia en Jira**. Usan «Flujo de trabajo» (nivel 1) y
«Tarea» (nivel 0), nada en medio.

| Proyecto | Nivel 1 | Nivel 0 | Jerarquía real |
|---|---|---|---|
| SICOE, SIES, PED, DW | Epic | Historia · Tarea · Error | épica → historia → tarea |
| IN, RENAC | Epic / Función | Historia · Tarea · Error | épica → historia → tarea |
| IDCE, INDICA, PULSO, REDOC, SISEC | Flujo de trabajo | Tarea | **épica → tarea**, sin historia |

Obligar a esos cinco a una historia «General» inventada habría metido un nivel falso en
más de un tercio del tablero. De ahí la regla 18.

**Y en la práctica ni siquiera los que tienen los tres niveles los usan siempre:** las 12
tareas abiertas de Infraestructura cuelgan **directamente de la épica `IN-2`**, sin una
sola historia de por medio. `IN-1` («Servidores en CECyTE») es una «Función» sin padre
ninguno.

## Cómo se traduce el estado

Jira tiene más nombres de estado que PM-care, y a propósito: PM-care tiene cuatro.

| Categoría de Jira | Nombres vistos | Estado en PM-care |
|---|---|---|
| `new` | Por hacer · Tareas por hacer | `pendiente` |
| `indeterminate` | En curso · En revisión | `en_curso` |
| `done` | Listo · Terminado | `hecha` |

«En revisión» cae en `en_curso` porque ya empezó y no está cerrada. PM-care no tiene un
estado de revisión y no lo va a tener: sería un quinto color para decir lo que el conteo
ya dice.

## Qué se trajo

Solo una muestra, por decisión del usuario (2026-08-27): **tres tarjetas reales y dos
simuladas**, no el histórico. Ver `datos/semilla.json` y `tests/modelo/semilla.test.ts`.
