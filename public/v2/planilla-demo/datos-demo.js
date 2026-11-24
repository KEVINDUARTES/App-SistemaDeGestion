/**
 * Datos de prueba INVENTADOS para la planilla única (v2).
 * No hay nada real acá. Se guardan solo en este navegador (localStorage); no se manda nada al servidor.
 *
 * V2Datos es la única puerta de entrada a los datos: cuando la planilla se conecte al sistema real,
 * solo se cambia este archivo por otro con los mismos métodos.
 */
(function () {
    'use strict';

    const CLAVE = 'v2-demo-pedidos';

    // "hoja" = en qué hoja impresa va el producto (verduras y frutas, bebidas 1, bebidas 2).
    const PRODUCTOS = [
        { id: 'p01', nombre: 'Acelga', tipo: 'verdura', hoja: 'verduras', por_kilo: false },
        { id: 'p02', nombre: 'Ajo', tipo: 'verdura', hoja: 'verduras', por_kilo: true },
        { id: 'p03', nombre: 'Cebolla blanca', tipo: 'verdura', hoja: 'verduras', por_kilo: false },
        { id: 'p04', nombre: 'Lechuga criolla', tipo: 'verdura', hoja: 'verduras', por_kilo: false },
        { id: 'p05', nombre: 'Papa lisa', tipo: 'verdura', hoja: 'verduras', por_kilo: false },
        { id: 'p06', nombre: 'Tomate perita', tipo: 'verdura', hoja: 'verduras', por_kilo: false },
        { id: 'p07', nombre: 'Zanahoria', tipo: 'verdura', hoja: 'verduras', por_kilo: false },
        { id: 'p08', nombre: 'Banana', tipo: 'fruta', hoja: 'verduras', por_kilo: false },
        { id: 'p09', nombre: 'Frutilla', tipo: 'fruta', hoja: 'verduras', por_kilo: true },
        { id: 'p10', nombre: 'Manzana roja', tipo: 'fruta', hoja: 'verduras', por_kilo: false },
        { id: 'p11', nombre: 'Naranja', tipo: 'fruta', hoja: 'verduras', por_kilo: false },
        { id: 'p12', nombre: 'Uva blanca', tipo: 'fruta', hoja: 'verduras', por_kilo: false },
        { id: 'b01', nombre: 'Agua mineral 2L', tipo: 'bebida', hoja: 'bebidas1', por_kilo: false },
        { id: 'b02', nombre: 'Cerveza lata 473', tipo: 'bebida', hoja: 'bebidas1', por_kilo: false },
        { id: 'b03', nombre: 'Gaseosa cola 2,25L', tipo: 'bebida', hoja: 'bebidas1', por_kilo: false },
        { id: 'b04', nombre: 'Jugo en caja 1L', tipo: 'bebida', hoja: 'bebidas1', por_kilo: false },
        { id: 'b05', nombre: 'Fernet 750cc', tipo: 'bebida', hoja: 'bebidas2', por_kilo: false },
        { id: 'b06', nombre: 'Vino tinto 750cc', tipo: 'bebida', hoja: 'bebidas2', por_kilo: false },
        { id: 'b07', nombre: 'Whisky 750cc', tipo: 'bebida', hoja: 'bebidas2', por_kilo: false }
    ];

    const CLIENTES = [
        { id: 'c1', nombre: 'Almacén Norte' },
        { id: 'c2', nombre: 'Bar La Esquina' },
        { id: 'c3', nombre: 'Dietética Sol' },
        { id: 'c4', nombre: 'Kiosco Central' },
        { id: 'c5', nombre: 'Mercado Sur' },
        { id: 'c6', nombre: 'Restaurante Olmos' },
        { id: 'c7', nombre: 'Verdulería Ana' },
        { id: 'c8', nombre: 'Supermercado Plaza' }
    ];

    let memoria = {}; // si el navegador no deja guardar, se trabaja en memoria

    function leerTodo() {
        try {
            const crudo = localStorage.getItem(CLAVE);
            return crudo ? JSON.parse(crudo) : memoria;
        } catch (e) {
            return memoria;
        }
    }

    function escribirTodo(todo) {
        memoria = todo;
        try { localStorage.setItem(CLAVE, JSON.stringify(todo)); } catch (e) { /* sin almacenamiento */ }
    }

    window.V2Datos = {
        modo: 'prueba',

        async catalogo() {
            return { productos: PRODUCTOS.slice(), clientes: CLIENTES.slice() };
        },

        // { "productoId|clienteId": cantidad } del día.
        async pedidosDelDia(fecha) {
            const todo = leerTodo();
            return Object.assign({}, todo[fecha] || {});
        },

        async guardarCelda(fecha, productoId, clienteId, cantidad) {
            const todo = leerTodo();
            const dia = Object.assign({}, todo[fecha] || {});
            const clave = productoId + '|' + clienteId;
            if (cantidad > 0) dia[clave] = cantidad; else delete dia[clave];
            todo[fecha] = dia;
            escribirTodo(todo);
        },

        async borrarDia(fecha) {
            const todo = leerTodo();
            delete todo[fecha];
            escribirTodo(todo);
        }
    };
})();
