// NO ROMPE: añadir un método nuevo no virtual. A ni se entera.
class Widget {
public:
    int a;
    int b;
    Widget();
    int  sum() const;
    void poke();
    int  product() const;        // <-- nuevo: símbolo nuevo, no toca lo viejo
    virtual int kind() const;
    virtual int tag()  const;
    static const int MAX = 10;
};
Widget::Widget()           { a = 11; b = 22; }
int  Widget::sum() const    { return a + b; }
void Widget::poke()         { a = 11; b = 22; }
int  Widget::product() const { return a * b; }
int  Widget::kind() const   { return 1; }
int  Widget::tag()  const   { return 2; }
int  libMax()              { return Widget::MAX; }
// Layout, vtable y símbolos que A usa: intactos. Salida idéntica al baseline.
