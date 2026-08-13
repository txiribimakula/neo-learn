# Línea temporal de la historia de España

Guía de continuidad para personas o modelos que vayan a modificar esta sección.

## Objetivo

`linea-temporal-espana.html` es una página autónoma con una cronología vertical uniforme (1000 a. C.–actualidad) y un mapa que cambia según el año activo.

- En los periodos peninsulares muestra poderes históricos mediante zonas basadas en provincias actuales, sin enseñar por defecto las fronteras provinciales.
- Cuando hay una presencia ultramarina relevante, cambia al encuadre mundial. Ese encuadre usa países actuales solo para situar el alcance aproximado; **no** equivale a fronteras coloniales exactas.
- Canarias se representa en un inserto del mapa peninsular; antes de 1496 aparece como pueblos canarios y después como parte de la entidad que controla el resto de España.

## Archivos

| Ruta | Función |
| --- | --- |
| `linea-temporal-espana.html` | Página, estilos, datos narrativos, hitos y renderizado en el navegador. |
| `build-map-data.py` | Genera los paths SVG y reemplaza únicamente el bloque `__MAPDATA_START__` / `__MAPDATA_END__` del HTML. |
| `data/es-provinces.topo.json` | TopoJSON de provincias españolas; es la malla de la que se derivan las zonas históricas. |
| `data/pt-adm1.geojson` | Distritos de Portugal, usados para su geometría real y para identificar la frontera luso-española. |
| `data/countries-110m.json` | Geometría global de referencia para el encuadre mundial. |

## Flujo de trabajo

1. Edita el HTML para cambiar textos, entidades, hitos, estilos o comportamiento.
2. Si cambias `build-map-data.py`, cualquiera de los archivos de `data/` o la proyección, regenera los datos:

   ```bash
   python3 history/build-map-data.py
   ```

3. Comprueba la sintaxis antes de entregar:

   ```bash
   node -e "const fs=require('fs'); const h=fs.readFileSync('history/linea-temporal-espana.html','utf8'); for(const m of h.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)) new Function(m[1]); console.log('JavaScript válido');"
   python3 -c "compile(open('history/build-map-data.py', encoding='utf-8').read(), 'history/build-map-data.py', 'exec'); print('Python válido')"
   git diff --check
   ```

4. Abre la página y revisa como mínimo un hito prerromano, uno medieval, uno de 409–411, Canarias antes y después de 1496, un hito mundial y 1898.

No edites a mano el JSON grande de `MAPDATA` dentro del HTML: se sobrescribe al ejecutar el generador.

## Añadir o corregir hitos

Los hitos cartográficos están en el array `SNAPSHOTS` del HTML y deben estar estrictamente ordenados por `y`.

Cada hito tiene esta forma básica:

```js
{
  y: 1521,
  t: 'Título breve',
  note: 'Texto histórico con el alcance y las limitaciones de la representación.',
  map: { ZONA: 'entidad', /* … */ },
  prov: { 'código-INE': 'entidad' }, // opcional; afina dentro de una zona
  world: { spanish: ['724'], portuguese: ['620'] } // opcional; activa el encuadre mundial
}
```

- `map` asigna una entidad a cada zona histórica. Utiliza `full(...)`, `reconq(...)`, `espanaPt` y las constantes ya existentes para no repetir mapas completos.
- `prov` solo debe usarse si de verdad hace falta dividir una zona. Sus claves son códigos INE de dos cifras para España o identificadores de las piezas portuguesas.
- `world` admite arrays de identificadores numéricos ISO 3166-1 de `countries-110m.json`, mantenidos como cadenas (por ejemplo, España: `'724'`, Portugal: `'620'`). Añádelo solo cuando el contexto mundial sea esencial.
- Los eventos de `EVENTS` no alteran el mapa. No dupliques un mismo año en `EVENTS` y `SNAPSHOTS`.

Para cambios de conquista, unión, independencia o retirada, introduce varios hitos si el proceso fue escalonado. Nunca hagas aparecer o desaparecer grandes conjuntos territoriales de golpe solo por comodidad visual.

## Reglas cartográficas importantes

### Fronteras peninsulares

- Las formas españolas se agrupan mediante `INE_ZONE` en `build-map-data.py`.
- La capa de bordes solo se ve cuando separa dos poderes distintos. Los bordes provinciales internos del mismo poder deben permanecer ocultos.
- Los arcos con un solo propietario se consideran costa o frontera exterior únicamente si `e: true`. Esta distinción evita trazos sueltos junto a geometrías excluidas como Gibraltar, Ceuta o Melilla.
- La frontera con Portugal se etiqueta con `p` al regenerar datos. No debe aparecer antes de que exista Portugal como poder diferente: en periodos ibéricos compartidos, toda la península se colorea como un conjunto.
- Las rutas militares discontinuas (`routes`) representan movimiento, no control territorial. Deben empezar y terminar en puntos geográficamente coherentes.

### Canarias y Baleares

- Baleares forma parte de la malla peninsular (`BAL`).
- Canarias usa `CAN` y las provincias `35` y `38`; su geometría se reproyecta mediante `project_canaries()` para el inserto. No añadas sus arcos a la capa de fronteras peninsulares.
- Al introducir una etapa anterior a 1496, la lógica de renderizado asigna `canarios` a `CAN` automáticamente. Si se modifica esa fecha, actualiza a la vez esa condición, el texto del inserto y los hitos afectados.

### Contexto mundial

- La clase `world-mode` alterna entre `#iberianMap` y `#worldMap` con una transición suave.
- En el mundo, `world-spanish` y `world-portuguese` son colores de pertenencia contextual. No uses esa vista para afirmar límites coloniales precisos dentro de países actuales.
- La progresión americana se construye con `PRIMER_VIAJE`, `CARIBE_INICIAL`, `AMERICA_1521`, `AMERICA_1524`, `AMERICA_1533`, `AMERICA_1542`, `AMERICA_1556` e `IMPERIO_AMERICANO`. Mantén esa progresión escalonada también al cambiar los años de independencia.

## Criterios históricos y de redacción

- Distingue entre presencia militar, área de influencia, administración, conquista efectiva y frontera estable. No son equivalentes.
- Declara en `note` las simplificaciones inevitables: la base provincial moderna es una aproximación para mostrar procesos históricos.
- Conserva una sección de “Restos y testimonios actuales” para cada gran periodo mediante `testimonyFor(year)`.
- No presentes las divisiones administrativas modernas como estados antiguos ni una unión dinástica como una unificación institucional inmediata.
- Ante una duda histórica de fronteras o fechas, documenta la incertidumbre en el texto y añade hitos intermedios en lugar de inventar un salto nítido.

## Lista breve de regresión visual

- Las áreas con el mismo color no muestran líneas internas negras.
- Ningún borde queda aislado en el mar o fuera de la región correspondiente.
- Portugal comparte el color del resto de Iberia cuando no es un poder separado.
- En 409 las flechas parten de los Pirineos occidentales y no convierten su recorrido en conquista inmediata.
- Canarias aparece dentro de su inserto y no fuera del `viewBox`.
- El modo mundial se activa desde 1492 cuando corresponde, progresa entre 1492 y 1556, retrocede por 1816–1824 y vuelve al mapa peninsular en 1898.
- Los botones Anterior/Siguiente, el deslizador y el scroll de la cronología siguen seleccionando el hito correcto.
