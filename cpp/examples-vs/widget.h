#pragma once
// Proyecto B (DLL). A se compila contra ESTA cabecera y NO se recompila.
// El proyecto Widget define WIDGET_EXPORTS -> exporta. A no lo define -> importa.
#ifdef WIDGET_EXPORTS
  #define WIDGET_API __declspec(dllexport)
#else
  #define WIDGET_API __declspec(dllimport)
#endif

const int WIDGET_MAX = 10;       // A incrusta este valor en su binario

class WIDGET_API Widget {
public:
    int a;                       // A lee este campo directamente (offset)
    int b;
    Widget();                    // a = 11, b = 22
    int  sum() const;            // a + b   (cuerpo en el .cpp)
    void poke();                 // reescribe los campos (sirve para el canario)
    virtual int kind() const;    // vtable[0] -> 1
    virtual int tag()  const;    // vtable[1] -> 2
};

WIDGET_API int libMax();         // WIDGET_MAX visto por B en tiempo de ejecución
