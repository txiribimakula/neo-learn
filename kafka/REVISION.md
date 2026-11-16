# Repaso de Tapper y propuestas pendientes

El recorrido parte de la cola del bar, introduce el bloqueo temporal, el orden por clave, la retención, el commit y el ack, y desemboca en la vista técnica. Ahí la ficha de un material contrasta el orden dentro de una partición con el procesamiento entre dos. El cierre usa el mismo lote de anidado en Kafka y en una cola compartida de Azure Service Bus. Los tiempos que se muestran salen de los ocho trabajos de ejemplo.

## Para presentar el recorrido

1. **Acceso directo a un capítulo.** Un selector discreto con «Bar», «Material» y «Anidado» ayudaría a retomar la charla o repetir una demostración. Cada punto de entrada debería reproducir el estado que se alcanza siguiendo los pasos.
2. **Repetir y pausar.** Poder volver a ejecutar solo el caso actual y congelar un instante facilitaría señalar la pinza, el reloj, el offset o el momento en que C2 queda ocioso.
3. **Cierre de las dos preguntas.** Una última pantalla podría preguntar si los mensajes necesitan orden por entidad o si son trabajos independientes. El material y el anidado servirían de respuesta visual.

## Casos opcionales para más adelante

1. **Otro reparto del mismo anidado en Kafka.** Mezclar trabajos cortos y largos entre P0 y P1 permitiría separar el efecto del reparto de claves del efecto de la cola compartida. También mostraría por qué contar mensajes por partición dice poco sobre su coste.
2. **Sesiones de Service Bus.** Después del material, mostrar cómo agrupar mensajes por SessionId cuando importa el orden de una entidad. Contrasta con la cola de trabajos independientes del cierre. [Sesiones de Azure Service Bus](https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sessions)
3. **Renovación y mensajes imposibles de procesar.** El reloj existente da pie a explicar cómo renovar un bloqueo cuando un cálculo tarda más de lo previsto. En un caso separado, un trabajo inválido podría ilustrar los reintentos y la cola de mensajes fallidos. [Bloqueos y liquidación en Azure Service Bus](https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-transfers-locks-settlement)

## Mantenimiento

- Tener una semilla fija para las escenas de una presentación facilitaría reproducir la misma secuencia de pedidos y medir tiempos. La aleatoriedad puede seguir disponible para explorar.
- Si siguen creciendo las demos técnicas, separar sus modelos y su dibujo del recorrido del bar haría más fácil localizar las reglas de cada caso.
