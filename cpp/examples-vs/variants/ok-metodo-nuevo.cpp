// NO ROMPE: añadir un método nuevo no virtual. A ni se entera.
#define WIDGET_API __declspec(dllexport)
const int WIDGET_MAX = 10;
class WIDGET_API Widget {
public:
    int a;
    int b;
    Widget();
    int  sum() const;
    void poke();
    int  product() const;        // <-- nuevo: símbolo nuevo, no toca lo viejo
    virtual int kind() const;
    virtual int tag()  const;
};
Widget::Widget()           { a = 11; b = 22; }
int  Widget::sum() const    { return a + b; }
void Widget::poke()         { a = 11; b = 22; }
int  Widget::product() const { return a * b; }
int  Widget::kind() const   { return 1; }
int  Widget::tag()  const   { return 2; }
WIDGET_API int libMax()     { return WIDGET_MAX; }
// Layout, vtable y símbolos que A usa: intactos. Salida idéntica al baseline.
