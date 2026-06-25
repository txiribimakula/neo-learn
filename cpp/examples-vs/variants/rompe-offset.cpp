// ROMPE (offset): insertar un campo 'x' antes de 'b' mueve el offset de 'b'.
#define WIDGET_API __declspec(dllexport)
const int WIDGET_MAX = 10;
class WIDGET_API Widget {
public:
    int a;
    int x;                       // <-- insertado
    int b;
    Widget();
    int  sum() const;
    void poke();
    virtual int kind() const;
    virtual int tag()  const;
};
Widget::Widget()        { a = 11; x = 99; b = 22; }
int  Widget::sum() const { return a + b; }
void Widget::poke()      { a = 11; x = 99; b = 22; }
int  Widget::kind() const { return 1; }
int  Widget::tag()  const { return 2; }
WIDGET_API int libMax()  { return WIDGET_MAX; }
// A lee w.b en el offset viejo -> obtiene 'x' = 99 en vez de 22.
