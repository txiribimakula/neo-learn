# Formación: cómo resolvemos un caso de Jira

> Guion esquemático, versión 0. Lo que está entre `[?]` falta por confirmar.
> Caso simulado de geometría: ver [casos-propuestos.md](casos-propuestos.md). Cada paso tendrá su explicación en HTML generada por IA.

---

## 0. Introducción
- Quiénes somos y qué hacemos
- Herramientas: Jira · nuestro software · IDE/debugger `[?]` · Git `[?]` · pipelines `[?]`
- El recorrido completo de un caso, de principio a fin

## 1. Llega el caso
- Alguien abre el caso en Jira (soporte / cliente / QA `[?]`)
- Se le asigna a un desarrollador
- **Estado:** `Abierto` → `En análisis` `[?]`

## 2. Entender el problema
- Leer descripción y comentarios
- Revisar versión del cliente, prioridad, componente
- Descargar los adjuntos (trabajo del cliente, logs, capturas)
- ¿Falta información? → se pide en un comentario
  - **Estado:** `Esperando información` `[?]`

## 3. Reproducir
- Importar el trabajo del cliente en nuestro software
- Seguir los pasos del caso con la opción de dibujo afectada (fijarse en la condición que muestra el vídeo/captura)
- ¿Se reproduce?
  - **Sí** → seguimos
  - **No** → probar con su versión / pedir más datos
- Depurar: breakpoints, localizar la causa

## 4. Arreglar
- Crear la rama desde `[?]` → nombre `[?]` (p. ej. `bugfix/PROJ-1234`)
- Hacer el cambio
- Probar en local con el trabajo del cliente
- Commit (mensaje con la clave de Jira `[?]`)
- Push al remoto
- **Estado:** `En curso` → `En revisión` `[?]`

## 5. Pull request
- Abrir el PR (título, descripción, enlace al Jira)
- Asignar revisores `[?]`
- Saltan los pipelines: compilación, tests, análisis `[?]`
- Comentarios de revisión → correcciones → nuevo push
- Aprobación + pipelines en verde → merge

## 6. Copia al destino
- `[?]` ¿Qué es exactamente? (cherry-pick a la rama de release / copiar el build a un entorno / otra cosa)

## 7. Hotfix semanal
- Fin de semana `[?]`: se genera el hotfix con todo lo mergeado
- Se etiqueta la rama (tag `[?]`)
- **Jira:** versión de corrección + estado `Resuelto` / `Cerrado` `[?]`

## 8. Cierre
- Avisar al cliente / soporte `[?]`
- Resumen del recorrido completo

---

## Más adelante: hacerlo con IA (Copilot)
- Pendiente. Mapear cada paso → qué puede hacer Copilot (skills, prompts, MCP de Jira/Git…)

---

## Preguntas abiertas
1. Estados reales del flujo de Jira (nombres exactos)
2. ¿Dónde está el código y los PR? (Azure DevOps / GitHub / Bitbucket / GitLab)
3. Rama base y convención de nombres de ramas y commits
4. "Copiar al destino": ¿qué significa en vuestro flujo?
5. Hotfix: ¿quién lo genera, qué día, a mano o con script? ¿Formato del tag?
6. ¿Qué es "el trabajo" que se importa? (proyecto del cliente, base de datos, fichero…)
7. IDE y lenguaje (¿Visual Studio + C++?)
8. ¿Cuántos revisores y qué se revisa?
9. Copilot: ¿GitHub Copilot en VS / VS Code, o Microsoft 365 Copilot?
