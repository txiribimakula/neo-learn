// INCOHERENTE: cambiar una constante. Enlaza, pero A grabó el valor viejo.
class Widget {
public:
    int a;
    int b;
    Widget();
    int  sum() const;
    void poke();
    virtual int kind() const;
    virtual int tag()  const;
    static const int MAX = 20;   // <-- antes 10
};
Widget::Widget()        { a = 11; b = 22; }
int  Widget::sum() const { return a + b; }
void Widget::poke()      { a = 11; b = 22; }
int  Widget::kind() const { return 1; }
int  Widget::tag()  const { return 2; }
int  libMax()           { return Widget::MAX; }
// A imprime Widget::MAX = 10 (incrustado al compilar); libMax() = 20 (lo nuevo de B).
