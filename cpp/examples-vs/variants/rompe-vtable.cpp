// ROMPE (vtable): añadir una virtual ANTES desplaza los índices de las demás.
#define WIDGET_API __declspec(dllexport)
const int WIDGET_MAX = 10;
class WIDGET_API Widget {
public:
    int a;
    int b;
    Widget();
    int  sum() const;
    void poke();
    virtual int extra() const;   // <-- nueva, ahora vtable[0]
    virtual int kind()  const;   // pasa a vtable[1]
    virtual int tag()   const;   // pasa a vtable[2]
};
Widget::Widget()         { a = 11; b = 22; }
int  Widget::sum() const  { return a + b; }
void Widget::poke()       { a = 11; b = 22; }
int  Widget::extra() const { return 999; }
int  Widget::kind()  const { return 1; }
int  Widget::tag()   const { return 2; }
WIDGET_API int libMax()   { return WIDGET_MAX; }
// A llama kind() por vtable[0] -> ejecuta extra() = 999;  tag() por vtable[1] -> kind() = 1.
