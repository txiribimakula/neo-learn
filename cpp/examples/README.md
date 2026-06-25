# Ejemplos reales — compatibilidad binaria (ABI)

Dos proyectos: **B** (biblioteca) y **A** (consumidor que la usa).

| Fichero | Proyecto | Qué es |
|---|---|---|
| `widget.h` | B | la cabecera. **A se compila contra ella y no se recompila más.** |
| `widget.cpp` | B | la implementación → `libwidget.so` / `libwidget.dll` |
| `app.cpp` | A | el consumidor. Imprime valores con su "esperado" al lado. |
| `variants/*.cpp` | B | una versión de B con **un solo cambio** cada una. |

## El experimento

1. Se compila B y A **una vez**.
2. Por cada variante se recompila **solo B** (la `.so`/`.dll`) y se vuelve a ejecutar
   el **mismo** binario de A. A nunca se recompila.
3. Se mira si A sigue dando los valores correctos, da basura, o ni arranca.

```bash
./run.sh        # Linux / macOS / WSL  (necesita g++ o clang++)
```
```powershell
.\run.ps1       # Windows con MinGW-w64 (g++ en el PATH)
```

> Necesita **g++ o clang++** (mangling Itanium, igual que el `abi.html`). Con MSVC
> los conceptos son idénticos pero el mangling y los flags cambian.

## Qué deberías ver

| Variante | Línea afectada | Resultado |
|---|---|---|
| `BASELINE` | — | todo correcto |
| `ok-metodo-nuevo` | — | 🟢 idéntico al baseline |
| `rompe-offset` | `w.b` | 🔴 imprime **99** en vez de 22 |
| `rompe-sizeof` | `canary` | 🔴 el canario sale **0x1234** (B escribió de más) |
| `rompe-vtable` | `w.kind()`, `w.tag()` | 🔴 imprime **999** y **1** (slots desplazados) |
| `rompe-simbolo` | (carga) | 🔴 A no arranca: *undefined symbol `_ZNK6Widget3sumEv`* |
| `incoherente-constante` | `Widget::MAX` vs `libMax()` | 🟡 **10** vs **20** (A grabó el viejo) |

Para ver el cambio de símbolo a mano: `nm -DC libwidget.so | grep -i widget`.
