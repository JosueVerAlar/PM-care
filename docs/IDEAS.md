# Ideas anotadas, sin etapa asignada

Cosas que el usuario pidió tener presentes pero que **no entran todavía**.
No son alcance comprometido: son notas con su contexto, para decidir después.

---

## Consultas tipo JQL o SQL sobre las tareas

**Petición del usuario, 26 de agosto de 2026:**

> quiero poder buscar tareas mediante jql o sql por ejemplo, para que si tengo demasiados
> proyectos, pueda hacer consultas más fácil o hay que acomodarlos directamente en cada
> proyecto

**El problema real detrás:** con once proyectos y cientos de tareas, los conmutadores de
la vista «Backlog del área» (alcance, agrupación, filtro de texto) se quedan cortos.
Preguntas como *«todo lo bloqueado de Jesús en proyectos que no sean SICOE»* o
*«lo que vence esta semana y no tiene responsable»* hoy no se pueden hacer.

**Qué ya está resuelto y juega a favor:**

- El modelo es un árbol JSON completo en memoria, así que **no hace falta una base de
  datos** para consultarlo: filtrar 1500 tareas se midió en 81 ms.
- Los predicados de cada vista ya viven separados en `src/compartido/dominio/clasificar.ts`
  y son composables. Una consulta es una combinación de predicados que ya existen.
- Cada tarea sabe su proyecto por el prefijo de su id (`SICOE-T14`), sin subir por el árbol.

**Tres caminos, de menos a más costo:**

1. **Filtros compuestos con la interfaz** — varios desplegables que se acumulan
   (proyecto + responsable + estado + bloqueada + vence antes de…). Cubre la mayoría de
   las preguntas reales sin que el usuario aprenda una sintaxis. Es lo más barato.
2. **Un lenguaje de consulta propio y pequeño**, al estilo JQL pero acotado a lo que el
   modelo tiene: `responsable = "jesus-castillo" AND bloqueada = true AND proyecto != SICOE`.
   Un analizador de ~200 líneas sobre los predicados existentes. Sin base de datos.
   Permite guardar consultas con nombre, que es donde está el valor real para once proyectos.
3. **SQL de verdad** — exigiría SQLite y aplanar el árbol a tablas. Contradice el requisito
   de que el archivo sea un JSON legible y editable a mano, que es una decisión del producto,
   no una etapa intermedia hacia una base de datos.

**Recomendación cuando se retome:** empezar por (1) y medir si se queda corto de verdad.
Si se queda corto, (2) es viable sin tocar el almacén ni el modelo. (3) solo si algún día
el archivo deja de caber en memoria, que con este volumen no va a pasar.

**Lo que decide entre (1) y (2):** si el usuario repite las mismas preguntas —entonces
guardar consultas con nombre paga el analizador— o si cada vez pregunta algo distinto
—entonces los filtros compuestos bastan.
