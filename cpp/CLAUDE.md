# C++ — Compatibilidad binaria (ABI) — `abi.html` + `examples/`

Explica qué cambios en una cabecera `.h` rompen (o no) la compatibilidad **binaria**
entre dos proyectos. Hermano de `../layout/widths.html`, `../kafka/kafka.html`, etc.
(single HTML, vanilla, sin build).

## Estado: versión MINIMALISTA (petición del usuario)

Hubo un primer intento con un simulador interactivo (motor de layout/vtable/símbolos):
era **demasiada información**. El usuario pidió empezar minimalista y luego valorar
ampliar. Ahora hay dos piezas pequeñas:

1. **`abi.html`** — una sola página, una columna, sin JS. Intro corta + leyenda de 3
   veredictos + tabla de escenarios agrupados por mecanismo (cambio · veredicto · por
   qué, una línea cada uno). Colores: verde=no rompe (`--ok`), rojo=rompe (`--break`),
   ámbar=enlaza pero incoherente (`--silent`).
2. **`examples/`** (g++/clang, Linux/Mac/WSL) y **`examples-vs/`** (MSVC/Visual
   Studio) — proyectos C++ reales y compilables para **validar** cada afirmación.

No reintroducir el simulador salvo que el usuario lo pida.

## Escenario pedagógico

Proyecto **A** depende de la biblioteca **B**. Cambias un `.h` de B, recompilas
**solo B** y entregas su binario bajo un A **sin recompilar**. A grabó tres cosas de B
→ tres mecanismos de ruptura: **offsets/sizeof**, **índices de vtable**, **símbolos
mangled**. Caso aparte: valores **grabados en compilación** (constantes, args por
defecto, tipo de retorno que no entra en el mangling) → enlazan pero dan bug silencioso.

## `examples/` — el experimento

- B = `widget.h` + `widget.cpp`; A = `app.cpp` (imprime cada valor con su "esperado").
- `variants/*.cpp` = una versión de B con **un único cambio** (offset, sizeof, vtable,
  símbolo, método nuevo, constante).
- `run.sh` / `run.ps1`: compilan A y B **una vez**, luego por cada variante recompilan
  **solo B** y reejecutan el **mismo** binario de A. La salida demuestra el veredicto.
- Detalles que hacen los breaks **deterministas**: `app.cpp` lee `w.b` directo (demo de
  offset), usa un **canario** detrás del objeto (demo de sizeof), llama virtuales (demo
  de vtable) y compara `Widget::MAX` (grabado en A) contra `libMax()` (lo que dice B).
- `examples/` usa mangling Itanium (g++/clang). `examples-vs/` es la versión MSVC:
  macro `WIDGET_API` (`__declspec(dllexport/dllimport)`), `widget.dll`+`widget.lib`,
  `AbiDemo.sln` con dos proyectos (Widget DLL + App exe, x64, v143) y `run.bat` para el
  experimento desde la "x64 Native Tools Command Prompt". Mangling MSVC
  (`?sum@Widget@@QEBAHXZ`); `long`=4 bytes (por eso el campo extra del sizeof es
  `long long`). El break de símbolo en Windows sale como **cuadro de diálogo** "no se
  encuentra el punto de entrada", no como texto.
- ⚠️ En esta máquina no había NINGÚN compilador (ni g++/clang/cl/WSL) → los ejemplos
  (ambos sets) y el `.sln`/`.vcxproj` **no se han compilado ni abierto aquí**; la salida
  esperada está documentada en cada `README.md`.

## Si tocas algo

- HTML: mantenerlo en una columna, sin JS, conciso. Tres colores de veredicto.
- examples: si cambias el baseline (sizeof 16, `a@8`/`b@12`, MAX=10, kind/tag), ajusta
  los "esperado" de `app.cpp` y la tabla del README.
- Proyecto en evolución con revisión del usuario: propón y espera feedback antes de
  ampliar (más variantes, herencia, plantillas, PIMPL como solución…).
