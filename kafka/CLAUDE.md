# Messaging Simulator — `kafka.html`

Simulador educativo **single-file** para enseñar visualmente cómo funcionan los
message brokers. Empezó como simulador de Kafka; ahora cubre también **Azure
Service Bus Queues** y la idea es seguir añadiendo modelos. Hermano de
`../kubernetes/scheduler.html` y `../graphics/camera.html` (mismo estilo).

## Hermano: `tapper.html` (Kafka en el bar)

Comparativa Kafka vs Azure Service Bus que imita la pantalla del arcade Tapper; de
momento solo está Kafka. Es otra página de un solo HTML y no comparte código ni
estética con `kafka.html`.

- **Pantalla:** la escena ocupa toda la ventana y no hay paneles (Pablo quitó los cajones de
  controles y de explicación, con todo lo que tenían).
  Sobre la pared del fondo, en la misma caja que el canvas (`.stage`, se escala con él): a la
  izquierda de la pizarra el selector de velocidad (x1, x2, x10) y a su derecha el botón del paso
  (`.step`). El registro de eventos (`S.events`) ya no se muestra en la página; lo usan los tests.
  Sin pausa, sin reiniciar (se recarga la página) y sin control de clientes por minuto.
- **Sin textos en la escena:** Pablo quiere probar si se entiende sola, así que no hay
  marcador, rótulos, números ni carteles. Las excepciones son
  la placa «QUEUER» con el nombre del restaurante, el bocadillo «¡Oído cocina!» del jefe de
  sala (Pablo lo quiere literal), la pizarra de la pared del fondo, que ocupa el sitio del
  antiguo letrero («TAPAS» / «MENÚ DEL DÍA», la pidió Pablo) y la vista «Kafka real», que existe
  precisamente para poner nombre a cada pieza. La clave de cada
  mensaje es el color del comensal (en el código sigue siendo una letra, y `KEY_NAMES` la
  traduce en el registro).
- **Tutorial:** es el paso 1 del botón de la pared. Cada clic oscurece todo menos un tipo de actor,
  en el orden en que viaja un pedido: comensales y mesas, camareros, hilos y jefe de sala,
  cocineros y cocinas, mostrador. Tras el último vuelve a la escena completa.
  Oscurece la escena y vuelve a dibujar encima a esos actores, con el aspecto que tengan (bar o
  Kafka), así que se iluminan sus píxeles exactos; por eso los contadores de animación del dibujo
  avanzan con `frameTick`, que vale 0 en esa segunda pasada. Escape sale del tutorial.
- **Vista «Kafka real»:** se abre con el mismo botón de avance, después del reenvío sin ack.
  Cada clic convierte un tipo de actor en su pieza técnica, en el orden en que viaja un mensaje
  (`kafkaStep`, `KAFKA_STAGES`, `morphDraw`).
  - Ya transformado es un diagrama: **las piezas están quietas y solo se mueven los mensajes**
    (lo pidió Pablo). Producer a la izquierda, topic en medio y grupo a la derecha, entre las dos
    particiones (`PRODUCER_BOX`, `PARTITIONER_BOX`, `GROUP_BOX`).
  - Comensales → un solo `PRODUCER` que envía todo: en `SEND()` esperan los mensajes de los
    comensales que aún no ha atendido el camarero (`UNSENT`). Camarero con bloc → `PARTITIONER`
    dentro del producer: qué colores van a `P0` y cuáles a `P1`, el lote del comensal atendido en
    la fila de su partición y una flecha de cada fila a su partición, `HASH(KEY) % 2`.
  - Hilos → `PARTITION 0/1` dentro de `TOPIC: COMANDAS`, con las comandas como records con su
    offset. Un mensaje en vuelo sale del lote, sigue la flecha y corre por encima de los records
    hasta el final del log (`flightPath`, `alongPath`); se dibuja encima de todo
    (`drawMessagesInFlight`).
  - Cocineros → `CONSUMER C1/C2` fijos dentro de `CONSUMER GROUP`, con lo que hacen
    (`consumerAction`: `FETCH 3`, `PROCESS`, `OUTPUT`, `COMMIT 4`, `REBALANCE`, `CRASHED`…) y
    las particiones asignadas (`P0`, `P1`). Al leer, una copia del record vuela al consumer y el
    original sigue en el log; al confirmar, un triángulo verde vuela a la casilla del siguiente
    offset y el del grupo salta allí al llegar (`drawConsumerTraffic`).
  - Los mensajes dejan de ser comida (lo pidió Pablo): un record es la cabecera con el color de
    su clave y el offset, y debajo unas líneas de datos cuya longitud sale del id del mensaje
    (`drawPayload`); el resultado de un consumer es una marca de hecho (`CHECK_MARK`).
  - El jefe de sala se va con los hilos: es el broker. Su «¡Oído cocina!» pasa a ser un `ACK` que
    vuelve por la flecha hasta el lote del partitioner (`drawAck`).
  - Mostrador y camarero con bandeja → desaparecen: no son Kafka. Mientras el mostrador sigue,
    el resultado del consumer vuela a él; luego solo se desvanece.
  - El grupo se aparta del borde derecho: la pestaña «Explicación» tapa el centro de ese borde.
  - El cambio es un fundido de píxeles (dither de Bayer en bloques de 2 px, `morphDraw`) de
    `MORPH_S` segundos reales; con movimiento reducido es instantáneo. Cada actor se dibuja en
    una capa auxiliar apuntando `g` a ella. Comandas y platos que viajan dentro de otro actor
    cambian con su propia etapa (`drawTicket`, `drawPlate`), y dentro de su grupo se usan las
    versiones fijas (`drawTicketBar`/`drawRecord`, `drawPlateBar`/`drawResult`).
  - Entre etapas conviven los dos mundos: con solo el producer hecho, el camarero aún camina
    hasta él a por las comandas; con solo los consumers, los resultados aún van al mostrador.
  - El contorno del topic es un corchete que une las dos particiones por la izquierda y deja
    fuera el centro de la sala. Azul celeste = broker, amarillo = consumers, blanco = producer;
    cada record lleva el color de su clave. El restaurante se oscurece a medida que avanza.
  - Fiel a Kafka: el record solo muestra offset cuando el broker lo añade (en vuelo va sin
    número), leer no lo marca (solo se apaga) y el commit guarda el siguiente offset a leer, así
    que el triángulo verde va una casilla más allá.
  - Las cocinas tienen su propia capa (`stovesLayer`) para poder disolverse con los cocineros.
- **De una cola a Kafka, por pasos:** Pablo quiere explicar Kafka partiendo de una cola normal
  (Azure Service Bus) y que cada característica llegue justificada: primero se ve el fallo, en un
  paso, y la pieza que lo arregla, en otro. La página empieza en `FIRST_SCENE`: un solo hilo sobre
  el mostrador del medio, un cocinero con su cocina ya en la fila de arriba (`cookRows`), la
  papelera a la derecha del todo de la fila del mostrador, sin jefe de sala, se piden tapas (`TAPAS`, el
  orden da igual) y es una cola: el cocinero coge la comanda del hilo (lock), la cocina y la tira
  a la papelera (`BIN_X`) de un taconazo al completarla. Sin offsets ni commits. `S.features`
  (`menus`, `keys`, `retain`, `commit`) dice qué tiene ya de Kafka; `createSim` sin opciones es
  Kafka entero, que es lo que usan casi todos los tests. Un solo botón en la pared lo recorre todo
  (21 pasos): el paso 1 es el tutorial (un clic por tipo de actor; ya no hay botón de tutorial
  aparte), luego `UPGRADES`, la vista Kafka real y los ejemplos. El botón tiene dos líneas cortas
  que caben en la pared (`refreshUpgrade`, letra pequeña, sin saltos de línea y con «…» si algo
  no cupiera; el texto entero va en el `title`): arriba «▶ n/21 lo que está pasando…» o
  «✓ n/21 lo último visto», y debajo, en otro color, «› n/21 Problema/Solución/Novedad: tema» de
  lo que trae el siguiente clic; en espera, sin el tipo y con «· en espera». Cada paso de
  `UPGRADES` lleva su tipo (`kind`), su tema (`name`) y lo que pasa mientras dura (`doing`),
  cortos a propósito: caben unos 44 caracteres por línea. Si se pulsa
  cuando el paso aún no puede empezar (otro en marcha, alguien ocupado), el botón se queda pulsado
  «en espera» (`pendingStep`) y el paso arranca solo en cuanto puede. La barra espaciadora hace lo
  mismo que el botón, esté donde esté el foco (salvo en campos de texto).
  - Cada fallo tiene una demostración preparada en su paso. Los adelantamientos del paso 5
    pueden repetirse mientras los dos cocineros compartan el hilo.
  - El rebalance es de Kafka (`features.keys`, un dueño por hilo). En la cola, un cocinero que se
    desmaya suelta lo que tenía (`dropJob`) sin rebalance: `triggerRebalance` solo reparte, sin
    pausa ni contador. La intoxicación del panel espera a que haya un hilo por color.
  - Transiciones sin saltos: nadie se teletransporta entre fotogramas (comprobado recorriendo todos
    los pasos con varias semillas). Si algo se coloca, que llegue andando o se interpole.
  Paso 1: tutorial. Luego:
  2. Otro cocinero (`startSecondCook`): C2 entra de espaldas arrastrando su cocina hasta la fila de
     abajo, que ya es su sitio final, y coge del mismo hilo (competing consumers). La cocina de C1
     ya está arriba desde el principio. Cada uno cocina en su cocina (`job.cookRow`).
  3. Una comanda se olvida (`startBurnt`), fallo: al principio el cocinero, nada más leerla, la
     quita del hilo y la tira a la papelera de un taconazo (recibir y borrar: `read` → `take` →
     `bin` sin `job.cooked`) y luego cocina de memoria. Justo cuando C2 empieza a
     cocinar, su cocina echa los humos verdes de la intoxicación (`c2.faint` en `fumes`,
     `stats.faints`): se desmaya, se levanta con «Am I already at Monkey Island™?» y el pedido
     que tenía en la cabeza se ha perdido; en el hilo ya no está, C1 no puede hacerla y el
     comensal se va sin ese plato. La consecuencia se ve: mientras lo espera (`c.waitingLost`), tranquilo, ese
     plato queda enmarcado en rojo en el menú del comensal en cuanto se pierde la comanda; a los `GIVE_UP_S` se enfada una sola vez: da
     puñetazos y protesta primero «Kurwa!» (`KURWA_S`) y luego con la frase del plato que le falta (`LOST_DISH_LINES`) durante `COMPLAIN_S` (`state: 'complain'`) y se va. Lo
     mismo en «una comanda se pierde».
  4. Mirar sin quitar (`startPeekLock`). Cuando los dos cocineros han terminado la comanda y
     están en sus fogones, el jefe entra por la derecha y dice «Chavales... peek and lock!»
     al llegar. Ambos contestan «Sí, jefe». El jefe se retira y los cocineros empiezan a usar
     `features.peekLock`. Cada cocinero mira la comanda y,
     sin quitarla, le ata debajo un reloj de arena (`hang`, `HANG_S`, `drawHourglass`): de puntillas, el reloj
     sube desde sus manos por delante de él, o sea, detrás de su cuerpo visto desde aquí; asoma
     por encima de la cabeza y lo ata con un meneo mientras aparece la cuerda. Los relojes se
     dibujan tras el mostrador y antes de los cocineros (`drawHangingHourglasses`). Al salir hacia la
     comanda ya la reserva (`lockedBy`), pero no se ve nada hasta que ata el reloj. El bloqueo dura
     lo que la arena (`LOCK_S`, `lockFrom`/`lockUntil`): es el LockDuration de Service Bus. Con el
     plato ya en el mostrador (`job.cooked`) vuelve, la quita con su reloj (`toTake`, `take`) y la
     tira desde ahí mismo (`bin`). Los mismos humos le hacen olvidarla igual, pero sigue en el hilo: el
     reloj sigue corriendo, parpadea al final, se acaba (`expireLocks`, `stats.lapsed`) y la
     cocina C1. Su comensal, harto de esperar, da golpes en la mesa y en el primer enfado
     dice «Kurwa!» y la frase del plato retrasado. Cuando llega, se queda a comérselo. Si la arena se acaba con el cocinero aún en ello, pierde el bloqueo
     (`job.lockLost`): no la quita y otro la vuelve a cocinar (sobra un plato). `LOCK_S` es largo
     a propósito para que a ritmo normal no pase nunca.
  5. Menús (`startMenus`), fallo: la pizarra está en la pared del fondo, donde antes iba el
     letrero (`drawSign`; el nombre queda en una placa encima). El camarero va hasta ella
     (`signGo`), y de pie delante, con el brazo levantado (`drawWaiterAtBoard`, `cookArmPose`),
     borra «TAPAS» con un trapo de izquierda a derecha (`signWipe`), vuelve andando al principio
     (`signStep`) y escribe «MENÚ DEL DÍA» con tiza letra a letra (`signWrite`). La mano sigue
     `signHand` y el cuerpo va detrás a `SIGN_REACH`; entonces `features.menus`. Sin
     comensales nuevos (`build.quiet`) hasta que la cola se vacía, y entra uno con `SET_MENU`
     (paella lenta, `SET_MENU_SLOW`, y flan). Un cocinero empieza la paella y el otro sirve el
     flan antes de que llegue el primero. El comensal reacciona con «?!» (`puzzled`, `brokeOrder`,
     `stats.outOfOrder`). En los menús siguientes cada cocinero sigue cogiendo la comanda libre
     más antigua y un plato rápido puede volver a adelantar a otro del mismo comensal.
  6. Un hilo por color (`startKeyedWires`), arreglo: el camarero y C1 suben el hilo (`S.move`) y C2
     monta el de abajo (`stepWire`). Al plantarlo hay partición 1, `keys` y un dueño por hilo.
     Tres colores fijos por hilo. Los comensales nuevos favorecen el hilo con menos mesas
     ocupadas; en empate, el que ha recibido menos platos en los pedidos. Solo los pedidos
     que el camarero aún no ha tomado se asignan con la nueva regla al montar el segundo hilo.
  7. Hacer caja (`startCashCount`), fallo y arreglo en una sola visita (lo pidió Pablo): el jefe de
     sala va directo al hueco donde colgaría la última comanda retirada del hilo de arriba y
     rodea deprisa el mostrador por la izquierda para llegar al del hilo de abajo. En cada
     punto mira una vez a cada lado con una gota de sudor (`search`, `SEARCH_S`, `b.nervous`).
     Dice «DISAPPOINTED!», va a la
     papelera y, sin decir nada, la echa de una patada hacia la derecha (`bin.kicked`,
     `BIN_FLY_S`). Con los cocineros ya en sus cocinas (el paso para las comandas nuevas con
     `hold`) les dice «¡AQUÍ NO SE TIRA NADA!» (`keepOrders`), con la luz ensanchada a toda la
     franja de la derecha (`sy` del foco); ellos contestan «¡SÍ, JEFE!» y él se va. No vuelve a
     contar. Sin commits: cada cocinero sabe por cuál va solo de memoria, y las comandas guardadas
     no llevan ninguna marca hasta que llegan los commits. Las comandas no llevan nunca reborde
     de «en curso» (Pablo lo quitó): lo dicen el reloj de arena y el sello.
  8. No se acuerda de por dónde iba (`startBreak`), fallo: otra vez los humos, justo cuando empieza
     a cocinar un cocinero que ya ha servido unas cuantas de su hilo (`REREAD_MIN`). Se desmaya sin
     salir del grupo (`faint.stay`, `forget`: pierde lo que llevaba y por cuál iba; sin rebalance),
     se levanta preguntando «IS THIS REAL LIFE?» (`faint.waking`). Sin
     nada marcado, relee su hilo desde el principio (`stats.rereads`) y vuelve a cocinar lo ya
     servido. Esos platos llegan igual a la mesa (`S.strays`, `STRAY_S`): quien esté sentada protesta, con
     una frase distinta cada vez y por turno (`STRAY_LINES`: «¡ESTO YA ME LO HE COMIDO!», «¿OTRA VEZ
     LO MISMO?»… si era suyo; «¿Y ESTO? ¡NO LO HE PEDIDO!», «¿DE QUIÉN ES ESTO?»… si no). Guiño a
     las peleas de insultos de Monkey Island: el primer plato sobrante de todos lleva «YOU COOK
     LIKE A DAIRY FARMER!» (`STRAY_INSULT`, lo pidió Pablo así) y el cocinero de ese hilo lo
     piensa, en una nube a su lado y sin luz (es un huevo de pascua): «HOW APPROPRIATE. YOU EAT
     LIKE A COW.» (`c.think`, `drawThought`, `COMEBACK_DELAY_S`). En la rueda queda «¡HE VISTO
     MONOS QUE SIRVEN MEJOR!»; la luz solo
     señala el primero. El paso termina al llegar a las mesas los platos de la relectura;
     la última protesta puede seguir visible mientras entra el jefe.
     (Ya no hay descanso ni explosión: Pablo los quitó por confusos.)
  9. Marcar por dónde va (`startCommits`), arreglo: entra el jefe de sala, se pone entre las
     cocinas y les dice «¡CHAVALES! COMMIT WHERE YOU ARE!» nada más llegar
     (`markBoss`, `markSay`; «chavales» en español y el resto en inglés, lo pidió Pablo así; luz en
     toda la franja de la derecha). Cuando ambos terminan el trabajo en curso, aparece el commit
     (visible en el bar con el sello): primero cada uno sella
     deprisa las que ya había hecho hasta ponerse al día (`markCatch`, `job.fast`) mientras el jefe
     se va. El paso acaba cuando ambos han terminado de marcar y el jefe ha salido.
  10. Una comanda se pierde (`startLoss`), fallo: el camarero envía el pedido entero, pero la pinza de la última comanda se abre
     a mitad del hilo y el papel cae antes de llegar (`S.loseNext`, `S.fallen`); nadie confirma nada, nadie se entera y el comensal se va
     sin ese plato (`GIVE_UP_S`), tras decir «Kurwa!» y luego la frase del plato que le falta (`LOST_DISH_LINES`).
  11. ¡Oído cocina! (`startAcks`). El jefe llega al pase y le dice al camarero del bloc
     «¡Un poco de orden, chaval!». El camarero contesta «Sí, jefe» y vuelve a su tarea.
     Cada comanda que llega al hilo recibe su propio «¡Oído cocina!». El paso termina
     cuando se ha visto el de la última comanda del pedido. Si se espera aquí, los pedidos siguen llegando con normalidad.
  12. Reenvío sin ack (`startLoss`). Al avanzar, se suelta la última comanda de un pedido.
     El camarero espera `ACK_WAIT_S`, reenvía la comanda que falta y oye el «¡Oído cocina!» de esa comanda.
  13–17. Kafka real: el mismo botón transforma por orden a los comensales en el producer,
     al camarero en el partitioner, a los hilos y al jefe en el topic y su ack, y a los cocineros
     en los consumers. El último clic retira el mostrador y el camarero con bandeja. La
     transformación se apoya en la misma simulación (`KAFKA_STAGES`, `kafkaMix`). El diagrama completo queda a la vista.
     «Abrir ejemplo de materiales» da paso mediante un fundido al topic `materiales` vacío, a x1. El CREATE de `MAT-104` sale
     solo; el botón envía cada uno de los dos UPDATE y el DELETE. El consumer cambia la ficha
     central al aplicar el evento y después confirma el siguiente offset. La ficha distingue
     sin crear, creado, actualizado y borrado. En un UPDATE muestra el valor anterior y el nuevo. El DELETE elimina la
     ficha; los cuatro eventos permanecen en la partición.
  18. Comparar dos particiones. Publica CREATE en P0 y luego UPDATE en P1 con la misma
     clave. P1 procesa primero, la aplicación descarta el UPDATE por no existir la ficha y el
     CREATE posterior deja la densidad original.
  19. Anidado en Kafka. El productor, las particiones y los consumidores conservan su posición;
     el panel central pasa de la ficha del material al resultado del lote. Ocho cálculos independientes, con cuatro largos de 3 s en P0 y
     cuatro cortos de 0,75 s en P1. C2 queda ocioso a los 3 s mientras C1 acaba P0 a los
     12 s. Los trabajos completados siguen visibles en el log.
  20. Anidado en Azure Service Bus. Los dos carriles se unen en una cola y se repite el mismo
     lote. Cada receptor libre toma el primer trabajo disponible con Peek-Lock y el mensaje
     sale de la cola al completarlo. Con este lote y esta secuencia, los dos acaban juntos a
     los 7,5 s. El resumen compara tiempos simulados.
  21. Cierre. Tras leer la comparación, un clic muestra «The secret of queue systems» sobre
     negro con The Secret Font of Monkey Island 1990, incluida en el HTML.
  - Las filas son estado: `S.rows[part]` es la fila de cada partición (`rowOf(S, part)`) y
    `c.row` la de cada cocinero y su cocina. Todos los hilos ocupan el mismo tramo
    (`barStart()`/`barEnd()`); el mostrador tiene el suyo (`COUNTER_START`/`COUNTER_END`). En una
    cola las comandas se colocan por su sitio en la fila (`entryX`, `orderX`), no por offset.
  - Los elementos nuevos los traen los personajes, nada aparece de golpe.
  - En la cola, la comanda va a la papelera de un taconazo (`drawBinToss`). La papelera está en
    la fila del mostrador, a la derecha del todo, donde antes iba la primera cocina (`BIN_X`); el
    cocinero no va hasta ella: desde donde quita la comanda del hilo se pone de espaldas a la
    papelera, la deja caer junto al talón y la golpea de tacón a ras de suelo, como un taconazo de
    fútbol, y la comanda hace una parábola hasta la papelera, más alta cuanto más lejos esté
    (`binTossAt`, `LEGS_HEEL`, `KICK_AT`). Guiño al baloncesto: desde que hay un hilo por color, una
    de cada tres (`S.tossCount`, `job.rimShot`) da en el aro, rebota al otro lado, vuelve y cae
    dentro (`RIM_S`, `RIM_SPLITS`, con un destello en cada golpe).
  - En la vista Kafka, mientras es cola: `QUEUE: COMANDAS`, `RECEIVERS`, records sin offset ni
    triángulo, `RECEIVE`/`COMPLETE` y el record va a la papelera; con hilo por color, `PARTITION n`
    y `CONSUMER GROUP`; al guardar, `TOPIC`, offsets y commits. Mientras el único hilo cuelga en
    medio, el grupo se pone debajo (`groupBox`).
- **Aspecto:** paleta sacada de la pantalla original (`PAL`), figuras a 2x con contorno
  negro y cocinas con fuego en lugar de barriles. No uses el logotipo de la cerveza del
  original.
- **Escena de izquierda a derecha:** comedor con 3 mesas de color liso,
  hilos y cocineros. Al final del recorrido, de arriba abajo: hilo de comandas partición 0,
  mostrador de platos, hilo de comandas partición 1; al principio hay un solo hilo, sobre el
  mostrador (ver el recorrido). Los hilos miden lo mismo y no tienen barra debajo. Las cocinas
  están a la derecha del todo (ya no hay franja de pared lateral), a la misma distancia del mostrador por arriba y por abajo: por
  eso las filas no están igual de separadas (`ROW_TOPS`; `barTop` admite filas fraccionarias).
- **Solo las comandas son la cola o Kafka:** cuelgan con pinzas del hilo; desde «guardar las
  comandas» siguen ahí tras leerlas. El mostrador central es una cola normal: el plato
  desaparece al recogerlo.
- **Jefe de sala = el ack del broker** (se queda en el pase desde el paso 11): calvo con cerco gris, arrugas, gafas, barba blanca de
  unos días y camisa, de brazos cruzados en el pase: en la fila del mostrador, lo más a la derecha
  que cabe, junto a la cocina y donde las comandas llegan al final del hilo (`BOSS_SPOT`, lo pidió
  Pablo). Mira al comedor y de vez en cuando echa un vistazo a la cocina, salvo mientras sube un
  pedido. Al añadir cada comanda a su partición, el jefe dice «¡Oído cocina!»
  (`acknowledgeMessage`). Cada papel se ilustra como un envío individual. El camarero espera
  a que regresen sus confirmaciones (`ACK_S`) antes de irse. Si se cae un papel, reenvía
  solo la comanda pendiente. Los cocineros leen a su ritmo.
- **Barril del jefe de sala:** de vez en cuando entra por la derecha un bidón metálico con
  «OIL» (excepción a la escena sin textos pedida por Pablo). El jefe se gira, prepara la pierna,
  le da una patada y el barril sale por la derecha con el giro invertido. Conserva el sprite
  arcade original. Va con el tiempo de simulación, tiene aleatoriedad independiente y espera
  a que termine el ack para empezar; no afecta a Kafka. Se disuelve con el jefe en la vista
  Kafka y se ilumina con él en el tutorial. No tiene botón para provocarlo. Nunca ocurre a
  mitad de un paso (`S.build`). El primero de todos es seguro y llega `MONKEY_AFTER_S` después del
  último paso: trae encima, haciendo equilibrio, un mono de tres cabezas (guiño a Monkey Island,
  dibujado aquí: brazos abiertos, pies pisando al revés que el giro, más bamboleo tras la patada;
  `b.monkey`, `drawThreeHeadedMonkey`, a 1,5 veces el tamaño del resto). Ese bidón va a su
  ritmo (`oilTimes`): entra despacio (`MONKEY_IN_S`), se queda quieto un poco apartado del jefe
  (`MONKEY_GAP`) mientras él, sin enterarse, sigue mirando a la sala (`MONKEY_HOLD_S`); cuando se
  da cuenta se gira, el bidón rueda lo que falta hasta su pie, patada, y sale más deprisa que
  los demás (`MONKEY_OUT_S`). Solo esa vez. Para que quepa, el jefe está un poco más a
  la izquierda (`BOSS_SPOT.x` 672).
- **Analogía:** comensales = producer (en la vista Kafka, uno solo para todos); color del comensal =
  clave del mensaje, que fija siempre el hilo; camarero con bloc = partitioner del producer, que
  lleva cada comanda al hilo de su clave; comanda = mensaje con un solo plato; 2 hilos =
  particiones de `comandas`; cocineros = grupo `cocina`.
- **Un color es un comensal:** no puede estar dos veces en el comedor, y las 6 personas se
  turnan en las 3 mesas, así que para entrar hace falta una libre. Cada visita es un
  menú de 1 a 4 mensajes, uno por plato y siempre en orden: primero, segundo, postre y
  café. La cabecera de la comanda y el propio plato son del color del comensal, sin más números que
  el offset bajo la comanda. Cada color conserva su orden dentro de su hilo, así que
  el postre nunca llega antes que el primero.
- **Recorrido:** el comensal entra y se sienta; un camarero con bloc le toma nota en la
  mesa, va al borde izquierdo del hilo de ese color, manda las comandas y vuelve. Uno
  con bandeja va hasta el plato, pone la bandeja debajo (el mostrador tiene su misma altura)
  y se lo lleva, de uno en uno.
  El comensal los come por orden de llegada,
  con su menú en iconos sobre la cabeza que se apagan al comer, y solo entonces se va.
- **Plantilla fija:** 1 camarero con bloc y 1 con bandeja, siempre visibles y siempre con
  ese objeto en la mano. Nunca aparecen de la nada: esperan en su sitio y, si están
  ocupados, el comensal espera.
- **El cocinero se mueve por cada mensaje:** se pone justo debajo de la comanda, de espaldas
  a nosotros y mirando hacia arriba, para leerla, y se la queda en la cabeza: nunca se lleva la comanda a la cocina (ni en la mano
  ni arrastrándola por el hilo). Vuelve a la cocina, cocina, va a la barra del
  medio para dejar el plato y de ahí va directo a lo siguiente, sin pasar por su cocina (que no
  pinta nada ahí): al commit, a quitar la comanda, o, tras el taconazo, a leer la siguiente. Sin nada que
  leer (o durante un rebalance) espera en su propia cocina (`c.row`), no en la fila del hilo. Al subir al mostrador se eleva y baja suave
  (`c.lift`, `COUNTER_LIFT_SPEED`) (cada cambio de fila copia las capturas de Tapper que pasó
  Pablo: piernas cruzadas como en el original, inclinado y con brazos de corredor, sale casi al instante y deja unas
  volutas claras donde estaba) y regresa al mismo sitio para confirmar (commit): levanta un sello, da un saltito y lo
  aprieta contra la comanda en lo más alto, con un brazo de codo y largo fijo. La marca se
  queda en la comanda. Sin textos en la escena para estas acciones. Si sale del grupo entre
  el plato y el commit, otro la recocina y sobra un plato: es at-least-once. Fuera del
  grupo sigue visible al lado de su sitio. `BASE_SPEED` fija la velocidad de x1.
- **Cocina:** al cocinar solo se enciende el fuego de arriba; el horno nunca se ilumina, para
  que no parezca que lo que hay dentro se está asando.
- **Guiño a Tapper:** un cocinero que lleva un rato parado (1,5-14 s de simulación seguidos,
  tras un margen de 1,5 s) se toma una caña y se limpia el bigote; volver a trabajar reinicia
  la espera. Si sigue parado, la siguiente tarda 18-40 s. Nunca los dos a la vez, y entre una
  y otra pasan al menos 5 s.
- **El horno:** a veces, en vez de la caña (`OVEN_CHANCE`), un cocinero parado ve temblar la
  puerta un instante, la abre, salen tentáculos cortos de golpe o una pata de gato que intenta arañarle (`CAT_CHANCE`), fuera lo que duran 3 zarpazos (arriba, abajo, arriba), retrocede lo bastante para que
  no le toquen y la cierra. Cerrar es lo inverso de abrir: se acerca, coge la puerta y avanza
  con ella en la mano (`ovenBodyOffset`). No significa nada en Kafka: es
  un chiste, y comparte las reglas de la caña para no solaparse con ella.
  Solo ocurren de forma natural: no hay manera de pedirlos desde el panel.
- **Intoxicación (pasos 3 y 4, y botón en «Prueba esto» desde que hay un hilo por color):** un
  cocinero respira humos verdes de su cocina, se desmaya (con hilos por color sale del grupo:
  rebalance, el otro lleva los dos hilos; en la cola no hay rebalance), se levanta del todo con el
  bocadillo «Am I already at Monkey Island™?» y, en cuanto termina la pregunta, vuelve a
  entrar (otro rebalance, si hay grupo). Las estrellas solo salen mientras está en el suelo. Ese bocadillo es una excepción pedida por Pablo a la escena sin textos.
- **Comensal enfadado, solo si algo ha fallado** (Pablo quitó el enfado por esperar sin más):
  se pone rojo y da puñetazos en la mesa (con el codo apoyado, en recuerdo de los clientes del
  original) cuando un plato suyo no llega por un fallo. Si se ha perdido para siempre
  (`waitingLost`), espera tranquilo `GIVE_UP_S`, se enfada una vez, dice la frase del plato que le falta y se
  va (Pablo no quiere brotes repetidos ahí). Si solo se ha
  retrasado porque el cocinero lo dejó a medias con su reloj colgado (`entry.lockAbandonedByFaint`,
  `waitingDelayed`), a los `DELAY_ANGRY_S` empieza a dar puñetazos a ratos (`FIT_S` de cada
  `LOST_FIT_CYCLE_S`), y en el primer enfado dice «Kurwa!» y la frase del plato
  (`customer.say`, `stats.protested`). Se queda a comérselo cuando llega.
- **Colores de cada cocinero:** solo cambia lo que era amarillo, el mandil: amarillo para C1 y
  rosa para C2 (`COOK_APRONS`, un color que no lleva ningún comensal para que no se confunda con
  una clave); la chaquetilla y el gorro siguen blancos. Los relojes de arena que ata cada uno
  llevan el marco de su color.
- **Comensales con piernas al andar:** sentados la mesa tapa todo lo que queda bajo el pecho; al
  entrar y al irse se dibujan con piernas (`DINER_LEGS`), bajando los pies para que el busto quede
  a la misma altura.
- **Parados pero vivos:** cada persona respira, parpadea y, cocineros y comensales, mira de
  reojo, con un ritmo propio (`breathLift`, `isBlinking`, `isGlancing`) para que no se muevan
  a la vez. Va con el tiempo de simulación, así que se detiene en pausa.
- **Lo que no hay que perder:** leer no borra (la comanda se apaga y solo cae por
  retención), cada hilo tiene un solo dueño y en la vista técnica el triángulo marca el offset
  confirmado, que sobrevive al rebalance.
- **Población cerrada:** con 3 mesas, el lag total no pasa de 12, así que la retención (20)
  no llega a borrar nada sin leer. Por simplicidad, además, solo borra lo ya confirmado.
  Para enseñar esa pérdida haría falta otra fuente de mensajes.
- **Código:** el modelo va antes del marcador `// initial`, sin DOM, y lo prueba
  `node --test tapper.test.cjs`. Detrás van el dibujo (canvas de 730×420 ampliado
  sin suavizado) y el panel.
- **Simplificaciones:** retención por número de mensajes (20 por hilo), hash de la
  clave simplificado y una comanda en curso por partición.
- **Verificar:** con la pestaña oculta el `requestAnimationFrame` va a ~1 fps y la
  simulación casi no avanza. Sustituye `requestAnimationFrame` y `performance.now`
  antes de cargar el script para avanzar el reloj a mano. Si reescribes la página con
  `document.write`, el script anterior sigue vivo y también actualiza el panel: fíate solo
  del canvas, y comprueba el panel en una carga limpia.

## Filosofía (no romper)

- **Un solo HTML**, vanilla JS dentro de un IIFE en `'use strict'`. Sin build, sin
  framework, sin dependencias. Se abre con doble clic o `python -m http.server`.
- Estética cream/blue (`--bg`, `--card`, `--accent`… en `:root`).
- **UI en español, comentarios de código en inglés.**
- Educational-first: cada decisión visual existe para que se entienda qué pasa.
  Fidelidad al comportamiento real del broker por encima de la comodidad de
  implementación (los walkthroughs explican internals con precisión).

## Cómo correr / verificar

- Servidor: config `kafka` en `.claude/launch.json` (`python -m http.server 8123`).
- Verificar con las tools `preview_*`. **Nota del entorno:** la pestaña de preview
  suele estar oculta → Chromium *throttlea* `requestAnimationFrame`, así que las
  bolitas (`flyAlong`) y el `loop()` no avanzan. Verifica el DOM estático y la
  lógica con `preview_eval`; los screenshots de animación pueden no capturar
  estados en vuelo. `state` vive en un closure (no es global) — no es accesible
  desde `preview_eval`; condúcelo por la UI (clicks/inputs).

## Layout

`<main class="grid">` con cuatro columnas + capa SVG de conectores (`#links`,
con `pointer-events:none`) + `#flyLayer` (bolitas) + `#walkLayer` (paneles de
paso a paso flotantes).

```
| Producers | Brokers (topics/queues) | Consumer Groups | REST APIs |
```

El header dice **"Producers · Brokers · Consumers"** y la columna central
**"Brokers"** (genérico para Kafka topics + ASB queues).

## Modelos

### Kafka
- **Topic** con N **particiones** (`{messages, nextOffset, earliestOffset, flashUntil}`).
- **Producer**: modos `rr`/`random`/`sticky`/`key`. Partitioner decide en cliente
  at-send-time. Puede **fan-out a varias colas/topics**: `producer.topicIds` es un
  **array** — el mismo mensaje se publica a todos los destinos (una bolita por destino).
- **Consumer Group**: N consumers, asignación `range`, rebalance al añadir/quitar.
- Ciclo: `fetch → process → commit`. Offset committed por (group, partición).
- **Vaciar partición**: botón papelera por partición = `DeleteRecords` (borra
  mensajes, sube `earliestOffset` a `nextOffset`; offsets monótonos, no se
  reinician; consumers rezagados se fast-forwardean = pérdida de datos, fiel).

### Azure Service Bus Queue (`topic.kind === 'sb-queue'`)
- **Queue** = lane lineal (`topic.messages`), sin particiones.
- **Competing consumers** con **peek-lock** (`m.lockedBy`, `m.lockedUntil`,
  `m.deliveryCount`). Al hacer Complete el mensaje se **elimina** (vs Kafka).
- Conexión modelada como AMQP persistente y silenciosa en reposo (vs Kafka =
  TCP persistente + poll-loop continuo). Esto está en los tooltips de conectores.
- `dlq` preparado pero no se llena. Lock timeout no se enforce. Sin sessions.

**Kafka y SB NO comparten campos en la UI** (es un principio): consumer row,
group meta, topic card, producer card, walkthrough… todo se bifurca por `kind`.
SB usa "Receiver / peek-lock / seq / entrega #N"; Kafka usa "partición / offset /
lag / rebalance".

## Tiempos de procesamiento (sistema clave)

- **Producer estampa** `msgProcessingMs` en cada mensaje que produce (`m.processingMs`),
  visible como chip dentro del cuadrado del mensaje.
- **Consumer**: el tiempo de proceso local vive **a nivel de GRUPO** (`g.processingMs`,
  `g.followMsgTime`), no por consumer. Toggle `⏱ msg`: si ON, el grupo tarda lo que
  diga `m.processingMs`; el stepper de tiempo fijo **desaparece** cuando está ON.
- **REST API**: tiempo + `⏱ msg` viven en el API y aplican a **todos los callers por
  igual** (`api.processingMs`, `api.followMsgTime`).
- **Pin de réplica por (api, grupo)**: se edita en la **acción REST del grupo** (el
  caller), no en el API. Se guarda en `api.groupOverrides[groupId].replicaIdx`
  (`null` = auto/k8s-random). `pickReplica(api, g, c, action)` lo respeta; clamp a
  auto si la réplica deja de existir.
- **Override REST por consumer** (encima de las acciones del grupo): el grupo define
  la **lista ordenada** de acciones REST; cada consumer puede redirigir una llamada
  concreta a **otra API** y/o **fijar réplica**, guardado en
  `c.restOverrides[actionId] = {apiId?, replicaIdx?}` (campos ausentes/`null` =
  heredan del grupo). Se edita en la fila del consumer (bloque `.consumer-routing`,
  una línea por acción REST del grupo). Resolución: `resolveActionApi(c, action)` (qué
  API llama de verdad) y `pickReplica` con prioridad consumer-pin → group-pin (solo si
  NO redirige; redirigir resetea a auto) → aleatorio. Limpieza: `pruneConsumerOverrides(g)`
  al quitar acción/API; clamp de pins al reducir réplicas.
- Resolución de tiempos: `effectiveConsumerLocalMs(c,g)` y `effectiveApiMs(api,c,g)`
  centralizan "follow-msg-time o valor fijo", con fallback si el mensaje no estaba
  estampado.

## REST APIs + réplicas

- N réplicas por API (`api.replicas`, `api._replicaState[i].inflightCount`).
- `pickReplica` aleatorio (estilo kube-proxy) salvo pin por grupo o por consumer.
- **Penalización de concurrencia super-lineal** (thrashing): `slowdown = N^1.35`
  (`concurrencySlowdown(n)`, `CONCURRENCY_EXPONENT`). Con N reqs en una réplica
  cada una avanza a `1/N^1.35` → concurrente es **peor** que secuencial (N=2 ≈ +27%,
  N=3 ≈ +47%). El status de la réplica muestra el factor.
- El conector consumer→API **no es permanente**: solo línea discontinua mientras
  hay una request en vuelo (HTTP stateless). Sin lista de "quién llama".

## Paso a paso (walkthrough)

- Modo educativo (toggle "Paso a paso"). Producers y consumers explican cada fase
  con pasos y un botón ✓ para avanzar.
- Kafka: `poll → FetchRequest → FetchResponse → process → OffsetCommit → ack`.
- SB: `Receive → peek-lock/transfer-frame → process → Complete → settle`
  (funciones `computeSbReceiverDecision`, `beginSbReceiverWalkthrough`,
  `finalizeSbComplete`).
- Los paneles de log **flotan fuera del card** en `#walkLayer` (top-level, sobre
  todo el resto). `ensureWalkPanel(key, anchorEl)` los crea/posiciona; `renderLive`
  los recoloca cada frame (a la derecha del row, o debajo si se sale; cascada
  anti-solape; no cruzan la columna de APIs). Click-to-front por z-index.

## Conectores (`updateLinks`)

- Producer→partición (sólido, solo sticky) / →queue (discontinuo in-flight).
- Partición→consumer y queue→receiver: **sólidos** (la conexión TCP/AMQP siempre
  viva). Tooltip al hover explica el modelo de conexión (path transparente ancho
  de 16px encima para captar el hover pese a `pointer-events:none` del SVG).
- Consumer→API: discontinuo solo durante la request.

## Persistencia

- `localStorage`, debounce ~600ms (`scheduleSave`). `STORAGE_KEY`. Export/Import JSON.
- Hidratación tolerante con migraciones: `producer.topicId`→`topicIds`,
  tiempo de consumer per-consumer→per-grupo, tiempo de acción REST→`api.groupOverrides`,
  `api.groupOverrides` ahora solo guarda `replicaIdx`. `c.restOverrides` se persiste y
  rehidrata por consumer (default `{}`).

## Convenciones al editar

- Mantén el split Kafka/SB: si tocas algo de consumer/topic/producer, pregúntate
  si aplica a un solo `kind` y bifurca.
- IDs numéricos (`newId()`). Colores de `PALETTE`.
- Tras cambios, verifica en preview que no hay errores de consola y que el DOM
  esperado existe (recuerda el throttling de RAF en pestaña oculta).
