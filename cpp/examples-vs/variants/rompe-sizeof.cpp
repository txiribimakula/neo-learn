// ROMPE (sizeof): añadir un campo al final no mueve a/b, pero el objeto crece.
#define WIDGET_API __declspec(dllexport)
const int WIDGET_MAX = 10;
class WIDGET_API Widget {
public:
    int       a;
    int       b;
    long long tail;              // <-- nuevo, al final (sizeof 16 -> 24)
    Widget();
    int  sum() const;
    void poke();
    virtual int kind() const;
    virtual int tag()  const;
};
Widget::Widget()        { a = 11; b = 22; tail = 0; }
int  Widget::sum() const { return a + b; }
void Widget::poke()      { a = 11; b = 22; tail = 0x1234; }  // escribe en el offset 16
int  Widget::kind() const { return 1; }
int  Widget::tag()  const { return 2; }
WIDGET_API int libMax()  { return WIDGET_MAX; }
// A reservó 16 bytes; el offset 16 es su canario -> poke() lo pisa con 0x1234.
