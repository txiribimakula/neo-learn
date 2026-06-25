#!/usr/bin/env bash
# Compila B (baseline) y A UNA vez. Luego, por cada variante, recompila SOLO B
# y vuelve a ejecutar el MISMO binario de A (sin recompilarlo).
set -u
CXX="${CXX:-g++}"
cd "$(dirname "$0")"

$CXX -O0 -shared -fPIC -o libwidget.so widget.cpp
$CXX -O0 app.cpp -L. -lwidget -Wl,-rpath,'$ORIGIN' -Wl,-z,now -o app
echo "== A compilado UNA vez contra widget.h baseline =="

run(){ ./app 2>&1 || echo "   >>> A no se pudo ejecutar (símbolo no resuelto) <<<"; }

echo; echo "===== BASELINE ====="; run
for f in variants/*.cpp; do
  echo; echo "===== $(basename "$f" .cpp) ====="
  $CXX -O0 -shared -fPIC -o libwidget.so "$f"   # solo se recompila B
  run
done
