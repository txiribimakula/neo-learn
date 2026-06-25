// ROMPE (offset): insertar un campo 'x' antes de 'b' mueve el offset de 'b'.
class Widget {
public:
    int a;
    int x;                       // <-- insertado
    int b;
    Widget();
    int  sum() const;
    void poke();
    virtual int kind() const;
    virtual int tag()  const;
    static const int MAX = 10;
};
Widget::Widget()        { a = 11; x = 99; b = 22; }
int  Widget::sum() const { return a + b; }
void Widget::poke()      { a = 11; x = 99; b = 22; }
int  Widget::kind() const { return 1; }
int  Widget::tag()  const { return 2; }
int  libMax()           { return Widget::MAX; }
// A lee w.b en el offset viejo -> obtiene 'x' = 99 en vez de 22.
