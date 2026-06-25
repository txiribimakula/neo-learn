# Igual que run.sh pero en Windows con MinGW-w64 (g++). Genera .dll en vez de .so.
$CXX = if ($env:CXX) { $env:CXX } else { 'g++' }
Set-Location $PSScriptRoot

& $CXX -O0 -shared -fPIC -o libwidget.dll widget.cpp
& $CXX -O0 app.cpp -L. -lwidget -o app.exe
"== A compilado UNA vez contra widget.h baseline =="

function Run {
  & .\app.exe 2>&1
  if ($LASTEXITCODE -ne 0) { "   >>> A no se pudo ejecutar (simbolo no resuelto) <<<" }
}

""; "===== BASELINE ====="; Run
foreach ($f in Get-ChildItem variants\*.cpp) {
  ""; "===== $($f.BaseName) ====="
  & $CXX -O0 -shared -fPIC -o libwidget.dll $f.FullName   # solo se recompila B
  Run
}
