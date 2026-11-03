# Atlas · Arquitectura en movimiento

Web independiente para explorar la arquitectura de un sistema y seguir el
recorrido de una petición. No modifica ni depende del simulador de `kafka/`.

Abre `index.html` directamente en un navegador. No necesita instalación,
compilación, servidor, CDN ni acceso a servicios externos. También puedes servir
esta carpeta con cualquier servidor HTTP estático.

## Primera arquitectura

El ejemplo adapta el recorrido descrito para esta primera versión:

1. Un cliente externo publica en `job.requests`.
2. `Request Service` consume la petición y lee `/config/request-service.json`.
3. Llama por REST a `Processing API`, propagando `correlationId`.
4. La API lee su configuración del mismo file share y consulta/escribe Cosmos DB.
5. La respuesta vuelve por REST a `Request Service`, que publica en `job.responses`.
6. El cliente recibe la respuesta correlacionada.

Los nombres de servicios, rutas, réplicas, contenedores y tiempos son de ejemplo.
El segundo recorrido incorpora descarga y subida de blobs; el tercero aísla las
lecturas de configuración. No hay conexión a infraestructura ni telemetría real.

## Interacción

- Arrastra el fondo para desplazar el mapa y usa la rueda o `+` / `−` para zoom.
  El control de encuadre ajusta todos los componentes. Con el mapa enfocado,
  funcionan las flechas, `+`, `−` y `0` (encuadrar).
- Arrastra los componentes para recolocarlos. Selecciona uno para inspeccionar
  sus accesos, editarlo o conectarlo. La búsqueda localiza nombres, tecnologías,
  tipos y despliegues; Intro centra la primera coincidencia.
- «Detalle» añade tecnología, despliegue/montaje y réplicas a las tarjetas.
- Las flechas representan **el movimiento de datos**. En una lectura o descarga,
  el almacén es el origen y el servicio solicitante es el destino. La petición de
  lectura y su resultado se resumen en esa operación; no son trazas de red.
- Cada recorrido se reproduce, pausa, reinicia y avanza paso a paso. Pulsar un
  paso lo selecciona. La velocidad solo afecta a la animación; se impone una
  duración mínima visible por paso para poder seguirlo.
- «Editar recorrido» permite elegir, añadir, quitar y reordenar operaciones.
  «Nuevo» permite construir otro recorrido con las conexiones del modelo.
- El selector de transporte transforma los componentes de tipo topic/cola y
  los protocolos de publicación/consumo. Kafka se representa mediante dos
  topics; Service Bus mediante dos colas. No se simulan particiones, grupos,
  offsets, locks, acknowledgements, retries, concurrencia, errores ni DLQ.
  La alternativa con topics/subscriptions de Service Bus queda para otra versión.
- Las réplicas son metadatos declarativos, no instancias ejecutándose.
- La configuración se lee en cada petición del ejemplo por claridad. No se
  modela caché, recarga, arranque ni consistencia del file share.

## Guardar y llevarse el proyecto

Los cambios se guardan en `localStorage` bajo `atlas-system-map-v1`. Es un guardado
por navegador y origen; en `file://` depende de las restricciones del navegador.
Si el almacenamiento falla, la aplicación lo avisa. **Exportar** genera un JSON
portable; **Importar** valida el fichero y permite revisar el reemplazo.

«Editar modelo» expone el JSON completo: `version`, `transport`, `name`,
`description`, `example`, `nodes`, `edges` y `flows`. Cada paso de un recorrido
referencia el `id` de una conexión. Un recorrido puede usar una conexión varias
veces. Al eliminar un componente o conexión se limpian sus referencias; los
recorridos que queden vacíos también se eliminan. La validación rechaza referencias
rotas, IDs duplicados, tipos desconocidos y valores fuera de rango.

Para personalizar el sistema, cambia `name` y `description`, y marca `example:
false`. Esto quita el distintivo y las bandas decorativas del ejemplo. La posición
de cada componente se almacena en `x` e `y`.

Para extraerlo de neo-learn, copia esta carpeta y tus modelos JSON:

- `index.html`: estructura de la web.
- `styles.css`: presentación y diseño adaptable.
- `model.js`: ejemplo, contrato de datos y transformaciones; independiente del DOM.
- `app.js`: mapa, cámara, reproducción, inspector, edición y persistencia.
- `model.test.cjs`: pruebas del contrato de datos y operaciones sobre el grafo.

Ejecutar las pruebas desde esta carpeta:

```sh
node --test model.test.cjs
```

La siguiente ampliación natural es agrupar componentes por entorno/despliegue,
entrar en un servicio para ver sus componentes y modelar errores o concurrencia.
El zoom actual es espacial; el detalle se activa con el selector de vista.
