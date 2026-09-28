# Planificador de capacidad — `scheduler.html`

Aplicación educativa de un solo HTML, vanilla JS, sin build ni dependencias.
Interfaz en español; comentarios del código en inglés. Estética clara, gris/azul,
tipografía system-ui y cabeceras compactas.

## Alcance actual

- La línea temporal es la única pantalla: servicios arriba y grupos de nodos debajo.
- Sin simulación en vivo, reloj, scheduler interactivo, paneles laterales, tarjetas,
  comparación, optimización, escenarios ni menú «Más».
- Las réplicas se editan directamente por hora, escribiendo o arrastrando.
  Durante el arrastre se actualizan nodos, costes, cobertura y pendientes;
  se conserva el track con captura del puntero para no interrumpir el gesto.
- Tolerancias siempre visibles como etiquetas compactas: clic para añadir/quitar.
  Sugerencias de nodos deduplicadas; + abre opciones para una regla personalizada.
- Los nombres de servicios y nodos se editan directamente en sus filas.
- CPU por réplica y réplicas fijas se editan en la fila del servicio. CPU por nodo,
  máximo de nodos y precio por hora se editan en la fila del nodo.
  Conservar estos inputs al recalcular: sustituir solo las gráficas.
- «Opciones», «+ Servicio» y «+ Nodo» abren `openResourceEditor`.
  Los recursos existentes reservan el popup para color, modo y restricciones.
  El formulario trabaja con una copia: Guardar aplica; Cancelar descarta.
  No reconstruir el formulario durante la edición ni al pulsar un stepper.
- Configuración de servicio: nombre, color, CPU por réplica (mínimo 1, paso 1),
  modo horario o réplicas fijas y tolerancias.
- Configuración de nodo: nombre, CPU, máximo de instancias, tarifa y taints.
- Coste, cobertura y pico permanecen en un resumen compacto. «Ver pendientes»
  abre las horas afectadas y permite enfocar su demanda en la tabla.

## Modelo

`S` contiene servicios, nodos y selección de día/hora. La selección solo navega;
no avanza automáticamente. No hay temporizadores ni fases de arranque/parada.

`computeWeekCost` calcula las 168 horas en un estado aislado, conserva las
colocaciones entre horas y devuelve costes, réplicas por servicio/nodo,
instancias con su ocupación y pendientes. Reutiliza reglas de capacidad,
restricciones y asignación. La caché depende de la configuración, y el cálculo
no modifica el estado visible. El mes equivale al patrón semanal × 52/12.

Los nombres internos heredados de scheduler/autoscaler describen únicamente
el cálculo de asignación; no representan herramientas o pantallas del producto.

## Representación

- `TIMELINE_CPU_UNIT`: escala común en píxeles por CPU.
- Cada pod es una sola pieza de su color; las marcas interiores representan CPU.
  Las marcas se pintan con CSS para no crear un elemento por unidad de CPU.
- Cada marco de nodo tiene altura fija según capacidad. Se muestran las instancias
  hasta el máximo configurado, diferenciando las inactivas y el espacio libre.
- Las cantidades están debajo de las barras. Pending amarillo = falta capacidad;
  rojo = ningún nodo compatible.
- Textos de uso en Ayuda y tooltips; bandas con solo Pods/Nodos, sin instrucciones
  repetidas ni leyenda de CPU permanente.
- Sin resaltado del día/hora actual. Campos visibles en una columna fija de 176 px
  (156 px en móvil); restricciones del nodo visibles como etiquetas.
- Semana/día comparten columnas entre servicios y nodos; nombres fijos al desplazar.
- `reconcile` recalcula el resumen y la tabla, sin construir vistas ocultas.
- Rendimiento: las filas se reconstruyen solo si cambian columnas o recursos
  (`timelineStructure`); los cambios de datos pasan por `track._update`, que
  redibuja solo las celdas cuya firma cambió. El arrastre agrupa movimientos
  en un recálculo por frame. `.timeline-scroll` y `.timeline-detail` usan
  `contain: strict` para que el texto de estado no fuerce relayout de la tabla.
  Las marcas de CPU son una capa de fondo del pod, sin pseudo-elementos.

## Verificación

- `node --test scheduler.test.cjs`: pruebas del modelo sin dependencias.
- Comprobar edición de réplicas, CPU=1, formularios Guardar/Cancelar, altas/bajas,
  restricciones, navegación por día, costes y estados vacíos.
- Mantener el HTML independiente. Puede abrirse directamente o servirse con
  `python -m http.server`; config local en `.claude/launch.json`.
