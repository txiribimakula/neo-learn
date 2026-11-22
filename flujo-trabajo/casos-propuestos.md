# Caso simulado: un fallo al dibujar

Qué tiene que cumplir el caso:
- Ocurre **mientras se dibuja** (no al editar)
- **Muy evidente**: se ve nada más hacerlo
- **Verosímil**: hay una historia creíble de cómo se coló y de por qué nadie lo vio antes
- **Depende del trabajo del cliente**, así tiene sentido descargar el adjunto e importarlo
- Arreglo corto, test unitario y un HTML que lo explique

---

## 1. El imán que "secuestra" la línea ⭐ recomendado
- **Jira:** "Al dibujar una línea, el final se va solo a otro punto que está lejísimos. No puedo dibujar."
- **Muy evidente:** mueves el ratón y la línea salta a un vértice que no tiene nada que ver
- **"A mí no me pasa":** en tus dibujos de prueba (en mm) el imán va bien
- **Con el trabajo del cliente:** es un plano de una nave **en metros** → falla nada más empezar
- **Causa:** la tolerancia del imán es `10` y se compara con distancias **en unidades del dibujo**, cuando debería medirse **en píxeles de pantalla**
  - En mm y con zoom normal, 10 unidades ≈ 10 px → parece correcto
  - En metros, 10 unidades = **10 metros** → el imán atrapa cualquier cosa
- **Cómo se coló (verosímil):** el código original se escribió y se probó siempre con dibujos en mm, y la confusión entre px y unidades nunca dio la cara
- **Debug:** breakpoint en `buscarPuntoImán` → `distancia = 7.3`, `tolerancia = 10` → "imanta" un punto que está a 7 metros
- **Arreglo:** convertir la tolerancia de píxeles a unidades con el zoom actual → `tolerancia = 10 / escala`
- **Test:** con escala de 100 px/unidad, un punto a 0,5 unidades **no** se imanta
- **HTML:** un lienzo con zoom y un círculo de captura del imán; con el bug, el círculo crece con el zoom y con el arreglo se mantiene fijo en pantalla

## 2. Polilínea: el arco que no sigue la curva
- **Jira:** "En una polilínea, si encadeno dos arcos, el segundo sale con un pico en vez de continuar suave"
- **Muy evidente:** una S que debería ser suave sale con una esquina
- **"A mí no me pasa":** línea + arco va bien. Solo falla con **arco + arco**
- **Causa:** la dirección tangente para continuar se calcula como `fin - inicio` del tramo anterior. Eso vale para una línea, pero en un arco es la cuerda, no la tangente
- **Cómo se coló:** el modo arco se añadió después y reutilizó la función de las líneas
- **Debug:** `tangente = (0.7, 0.7)` cuando en el punto final del arco debería ser `(0, 1)`
- **Arreglo:** si el tramo anterior es un arco, la tangente es perpendicular al radio en el punto final
- **Test:** dos arcos encadenados comparten tangente en la unión
- **HTML:** se dibuja la S y se ven la cuerda frente a la tangente real y el pico que aparece

## 3. Orto que se equivoca de eje
- **Jira:** "Con Orto activado, si dibujo hacia la izquierda la línea sale vertical"
- **Muy evidente:** quieres una horizontal y sale vertical
- **Causa:** `if (dx > dy)` sin valor absoluto → hacia la izquierda `dx` es negativo
- **Cómo se coló:** se probó arrastrando hacia la derecha y hacia arriba
- **Arreglo:** `Math.abs(dx) > Math.abs(dy)`
- **Nota:** es muy creíble, pero bastante sencillo, y **no depende del trabajo del cliente**

---

## Recomendación
**Imán (1).** Es lo primero que nota cualquier usuario al dibujar, y la historia de cómo se coló es muy creíble (siempre se probó en mm). Obliga a usar el trabajo del cliente porque es en metros, y el porqué (píxeles frente a unidades) se entiende enseguida con un dibujo.

## Decisión pendiente
- ¿**Vuestro software real** (una rama de formación con el bug metido) o un **mini visor** hecho aquí?
