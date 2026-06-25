@echo off
REM Experimento "recompilar solo B". Ejecuta esto desde:
REM   "x64 Native Tools Command Prompt for VS 2022"  (para tener cl.exe en el PATH)
setlocal enabledelayedexpansion
cd /d "%~dp0"

where cl >nul 2>nul || (
  echo [!] No encuentro cl.exe. Abre "x64 Native Tools Command Prompt for VS" y reintenta.
  exit /b 1
)

REM 1) B baseline -> widget.dll + widget.lib
cl /nologo /EHsc /std:c++17 /LD /DWIDGET_EXPORTS widget.cpp /Fewidget.dll /link /IMPLIB:widget.lib >nul
REM 2) A enlazado UNA vez contra el widget.lib baseline (no se recompila mas)
cl /nologo /EHsc /std:c++17 app.cpp widget.lib /Feapp.exe >nul
echo == A compilado UNA vez contra widget.h baseline ==

echo.
echo ===== BASELINE =====
app.exe

for %%f in (variants\*.cpp) do (
  echo.
  echo ===== %%~nf =====
  cl /nologo /EHsc /std:c++17 /LD "%%f" /Fewidget.dll /link /IMPLIB:widget.lib >nul
  REM OJO: app.exe NO se recompila; solo cambiamos widget.dll
  app.exe
)

echo.
echo Nota: la variante "rompe-simbolo" abre un cuadro de Windows
echo       ("No se encuentra el punto de entrada"). Ese cuadro ES el fallo.
endlocal
