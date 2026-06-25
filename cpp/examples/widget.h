#pragma once
// Proyecto B (biblioteca). A se compila contra ESTA cabecera y NO se recompila.
class Widget {
public:
    int a;                       // A lee este campo directamente (offset)
    int b;
    Widget();                    // a = 11, b = 22
    int  sum() const;            // a + b   (cuerpo en el .cpp)
    void poke();                 // reescribe los campos (sirve para el canario)
    virtual int kind() const;    // vtable[0] -> 1
    virtual int tag()  const;    // vtable[1] -> 2
    static const int MAX = 10;   // A incrusta este valor en su binario
};
int libMax();                    // MAX visto por B en tiempo de ejecución
