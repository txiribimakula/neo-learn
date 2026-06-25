// ROMPE (símbolo): cambiar la firma de un método que A usa re-codifica su nombre.
#define WIDGET_API __declspec(dllexport)
const int WIDGET_MAX = 10;
class WIDGET_API Widget {
public:
    int a;
    int b;
    Widget();
    int  sum(int extra) const;   // <-- antes era sum();  cambia el nombre decorado
    void poke();
    virtual int kind() const;
    virtual int tag()  const;
};
Widget::Widget()              { a = 11; b = 22; }
int  Widget::sum(int extra) const { return a + b + extra; }
void Widget::poke()           { a = 11; b = 22; }
int  Widget::kind() const     { return 1; }
int  Widget::tag()  const     { return 2; }
WIDGET_API int libMax()       { return WIDGET_MAX; }
// A importa ?sum@Widget@@QEBAHXZ (sum()); B ahora exporta ?sum@Widget@@QEBAHH@Z (sum(int)).
// Al arrancar, Windows no encuentra el punto de entrada -> A no se ejecuta.
