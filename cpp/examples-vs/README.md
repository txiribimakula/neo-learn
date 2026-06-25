# Ejemplos para Visual Studio (MSVC)

Dos proyectos: **B** (`Widget`, una DLL) y **A** (`App`, un .exe que la usa). La idea:
A se compila **una vez** contra `widget.h`; luego se recompila **solo B** y se vuelve a
ejecutar el **mismo** A para ver si rompe.

| Fichero | Proyecto | Qué es |
|---|---|---|
| `widget.h` | Widget (B) | la cabecera. **A se compila contra ella y no se recompila.** |
| `widget.cpp` | Widget (B) | la implementación → `widget.dll` + `widget.lib` |
| `app.cpp` | App (A) | el consumidor; imprime cada valor con su "esperado" |
| `variants/*.cpp` | — | versiones de B con **un solo cambio** cada una |
| `AbiDemo.sln` | — | solución con los dos proyectos (x64) |

## Opción 1 — el experimento automático (recomendado)

Abre **"x64 Native Tools Command Prompt for VS"** (menú Inicio → Visual Studio),
ve a esta carpeta y ejecuta:

```bat
run.bat
```

Compila B y A una vez y luego, por cada variante, recompila **solo** `widget.dll` y
reejecuta el mismo `app.exe`. Verás en qué se rompe cada caso.

## Opción 2 — abrir en el IDE

1. Doble clic en `AbiDemo.sln` (Visual Studio 2022, toolset v143).
2. Pon **App** como proyecto de inicio (clic derecho → *Establecer como proyecto de
   inicio*). Plataforma **x64**.
3. F5: compila B, luego A, copia `widget.dll` junto a `app.exe` y arranca → salida
   baseline (todo correcto). Aquí puedes poner breakpoints y entrar en B.

> Para probar una ruptura en el IDE: copia un `variants\*.cpp` sobre `widget.cpp`,
> **compila solo el proyecto Widget** (clic derecho → *Compilar*) y ejecuta App. Nota:
> al ejecutar, VS **vuelve a enlazar A** (eso ya es "recompilar A" en parte); el
> experimento 100% fiel es `run.bat`, que jamás toca A.

## Qué deberías ver

| Variante | Línea afectada | Resultado |
|---|---|---|
| `BASELINE` | — | todo correcto |
| `ok-metodo-nuevo` | — | 🟢 idéntico al baseline |
| `rompe-offset` | `w.b` | 🔴 imprime **99** en vez de 22 |
| `rompe-sizeof` | `canary` | 🔴 el canario sale **0x1234** (B escribió de más) |
| `rompe-vtable` | `w.kind()`, `w.tag()` | 🔴 imprime **999** y **1** (slots desplazados) |
| `rompe-simbolo` | (arranque) | 🔴 cuadro de Windows: *no se encuentra el punto de entrada* |
| `incoherente-constante` | `WIDGET_MAX` vs `libMax()` | 🟡 **10** vs **20** (A grabó el viejo) |

Para ver el nombre decorado a mano: `dumpbin /exports widget.dll`.

> Mangling de MSVC (no Itanium): `sum() const` → `?sum@Widget@@QEBAHXZ`. Mismos
> conceptos que en `../examples/` (g++/clang), distinto formato de símbolo.
