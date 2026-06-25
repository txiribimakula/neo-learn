#include "widget.h"
#include <cstdio>
// Proyecto A (consumidor). Se compila UNA vez contra widget.h baseline.

// El canario va justo detrás del Widget: si B crece, B escribirá encima.
struct Probe { Widget w; unsigned long canary; };

int main() {
    Probe p;
    p.canary = 0xABCDEF;
    p.w.poke();              // B reescribe sus campos; si creció, pisa el canario

    printf("sizeof(Widget) en A = %zu  (B baseline = 16)\n", sizeof(Widget));
    printf("w.a         = %d     (esperado 11)\n", p.w.a);
    printf("w.b         = %d     (esperado 22)\n", p.w.b);
    printf("w.sum()     = %d     (esperado 33)\n", p.w.sum());
    printf("w.kind()    = %d     (esperado 1)  [virtual]\n", p.w.kind());
    printf("w.tag()     = %d     (esperado 2)  [virtual]\n", p.w.tag());
    printf("Widget::MAX = %d     (A grabó 10)\n", Widget::MAX);
    printf("libMax()    = %d     (lo que dice B)\n", libMax());
    printf("canary      = 0x%lX (esperado 0xABCDEF)\n", p.canary);
    return 0;
}
