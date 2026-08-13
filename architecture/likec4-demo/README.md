# likec4-demo — modelo de ejemplo

Proyecto LikeC4 **ejecutable y validado** que acompaña a [`../likec4.html`](../likec4.html).
Modela un caso equivalente al real: servicios accesibles por REST y por Kafka, otros por
Azure Service Bus, con una migración Kafka → Service Bus en curso, corriendo en AKS,
escribiendo en Blob Storage y en un disco de Azure, y con un wrapper C# sobre un motor C++.

## Arrancar

```bash
npx likec4 start .        # visor interactivo con recarga en caliente
npx likec4 validate .     # comprobar el modelo (esto va en CI)
npx likec4 build -o dist  # sitio estático navegable
npx likec4 export png -o out
```

Recomendado: extensión **LikeC4** de VS Code (autocompletado y preview en vivo).

## Ficheros

| Fichero | Contiene |
| --- | --- |
| `01-specification.c4` | Vocabulario: kinds de elemento, kinds de relación por transporte, tags, estilos y kinds de deployment. |
| `02-model.c4` | Modelo lógico. Los cuatro niveles de C4 emergen de la anidación. |
| `03-deployment.c4` | Modelo físico: suscripción, región, AKS, node pools, pods, PaaS y el disco montado. |
| `04-views.c4` | Vistas: C1–C4, migración, transversal de mensajería, flujo dinámico y despliegue. |
| `05-environments.c4` | Entorno DEV (mismos elementos lógicos, otra topología, ya migrado) + vistas de análisis. |

## Vistas incluidas

- `index` — C1 · contexto
- `containers` / `containersTarget` / `migration` — C2 hoy, objetivo y las dos rutas a la vez
- `tileRenderer` — C3 · el sándwich C# ↔ C++ con grupos
- `renderCore` — C4 · interior del motor nativo
- `messagingOnly` — transversal: sólo lo asíncrono
- `estadoCompartido` — quién comparte estado por ficheros (el acoplamiento invisible)
- `jobFlow` — vista dinámica del flujo completo
- `prodDeployment` / `rendererDeployment` / `devDeployment` — despliegue por entorno
- `impactoRenderer` — entrantes y salientes: quién se ve afectado si tocas el renderer
- `riesgoMigracion` — servicios cuya metadata dice que necesitan orden o replay
- `engineLifecycle` — secuencia del ciclo de vida del motor nativo

## Ideas clave que ilustra

1. **El transporte va en el _kind_ de la relación** (`rest`, `kafka`, `asb`, `blob`, `disk`):
   estilo consistente y, sobre todo, vistas filtrables por transporte.
2. **La migración se modela con tags** `#as-is` / `#to-be` sobre las relaciones, no duplicando
   el modelo. Tres vistas filtran el mismo modelo. Cuando un servicio termina de migrar, se
   borra una línea.
3. **La infraestructura vive en `deployment`**, no en el modelo lógico. Blob Storage es lógico
   (dependencia funcional); el disco de scratch **privado** sólo existe abajo (detalle de ejecución).
   Pero un **volumen compartido entre servicios** sí sube al modelo lógico: es un canal de
   integración con contrato implícito, y el acoplamiento debe verse (`sharedArea`, tag
   `#shared-state`, vista `estadoCompartido`). Nota técnica: Azure Disk es ReadWriteOnce —
   compartir entre pods de servicios distintos requiere Azure Files / NFS (RWX).
4. **El motor C++ es un componente, no un container**: vive en el mismo proceso. La capa de
   interop es un componente de primera clase porque es donde aparecen los problemas.
5. **Declara cada relación en el nivel más profundo donde ocurre.** `uploader -> blobStorage`
   se dibuja sola como `tileRenderer -> blobStorage` en la vista de containers (derivación).
   Declararla dos veces produce una conexión fusionada con título `[...]`.
6. **La metadata sirve para consultar el modelo**, no sólo para documentar: `ordering` y
   `replay` en el renderer alimentan la vista `riesgoMigracion`, que es la lista de trabajo
   real de la migración.
7. **Otros entornos no duplican el modelo lógico**: `05-environments.c4` instancia los mismos
   elementos con otra topología. Comparar `prodDeployment` y `devDeployment` enseña la
   asimetría (dev ya migrado, prod no) que suele vivir sólo en la cabeza de la gente.
