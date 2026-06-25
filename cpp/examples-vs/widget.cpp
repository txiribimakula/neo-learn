#include "widget.h"
// Implementación de B (baseline) -> widget.dll + widget.lib (import lib).
Widget::Widget()        { a = 11; b = 22; }
int  Widget::sum() const { return a + b; }
void Widget::poke()      { a = 11; b = 22; }
int  Widget::kind() const { return 1; }
int  Widget::tag()  const { return 2; }
int  libMax()           { return WIDGET_MAX; }
