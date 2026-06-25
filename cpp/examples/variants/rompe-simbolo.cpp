// ROMPE (símbolo): cambiar la firma de un método que A usa re-codifica su nombre.
class Widget {
public:
    int a;
    int b;
    Widget();
    int  sum(int extra) const;   // <-- antes era sum();  cambia el símbolo mangled
    void poke();
    virtual int kind() const;
    virtual int tag()  const;
    static const int MAX = 10;
};
Widget::Widget()              { a = 11; b = 22; }
int  Widget::sum(int extra) const { return a + b + extra; }
void Widget::poke()           { a = 11; b = 22; }
int  Widget::kind() const     { return 1; }
int  Widget::tag()  const     { return 2; }
int  libMax()                 { return Widget::MAX; }
// A pide _ZNK6Widget3sumEv (sum()); B ahora exporta _ZNK6Widget3sumEi (sum(int)).
// El símbolo que A necesita no existe -> A no carga.
