/**
 * Planilla del día (v2), etapa 1: la grilla.
 * Productos en filas, clientes en columnas, siempre en el mismo orden, una hoja por vez
 * (verduras y frutas, bebidas 1, bebidas 2), como las hojas impresas.
 */
(function () {
    'use strict';

    const HOJAS = [
        { id: 'verduras', nombre: 'Verduras y frutas' },
        { id: 'bebidas1', nombre: 'Bebidas 1' },
        { id: 'bebidas2', nombre: 'Bebidas 2' }
    ];

    // Mismo orden que la versión actual: verdura, fruta, bebida, mercadería y otros; dentro de cada grupo, de la A a la Z.
    const GRUPOS = [
        { tipo: 'verdura', nombre: 'Verdura' },
        { tipo: 'fruta', nombre: 'Fruta' },
        { tipo: 'bebida', nombre: 'Bebida' },
        { tipo: 'mercaderia', nombre: 'Mercadería' },
        { tipo: 'otros', nombre: 'Otros' }
    ];

    const estado = {
        fecha: hoy(),
        hoja: 'verduras',
        ocultarVacias: leerPreferencia('v2-ocultar-vacias') === '1',
        productos: [],
        clientes: [],
        pedidos: {} // "productoId|clienteId" -> cantidad
    };

    const el = {
        fecha: document.getElementById('fecha'),
        ocultar: document.getElementById('ocultar-vacias'),
        hojas: document.getElementById('hojas'),
        tabla: document.getElementById('planilla'),
        estado: document.getElementById('estado'),
        avisoPrueba: document.getElementById('aviso-prueba'),
        limpiar: document.getElementById('btn-limpiar')
    };

    // ---------- utilidades ----------

    function hoy() {
        const d = new Date();
        const dos = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
    }

    function leerPreferencia(clave) {
        try { return localStorage.getItem(clave); } catch (e) { return null; }
    }

    function guardarPreferencia(clave, valor) {
        try { localStorage.setItem(clave, valor); } catch (e) { /* sin almacenamiento */ }
    }

    function crear(tag, atributos, texto) {
        const nodo = document.createElement(tag);
        Object.keys(atributos || {}).forEach(k => nodo.setAttribute(k, atributos[k]));
        if (texto !== undefined) nodo.textContent = texto;
        return nodo;
    }

    function formatear(n) {
        if (!n) return '';
        return String(Math.round(n * 100) / 100).replace('.', ',');
    }

    // Texto escrito -> número, o null si no vale. Vacío vale 0. Solo los productos por kilo llevan decimales.
    function leerCantidad(texto, porKilo) {
        const limpio = String(texto).trim().replace(',', '.');
        if (limpio === '') return 0;
        if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
        const n = Number(limpio);
        if (!porKilo && !Number.isInteger(n)) return null;
        return n;
    }

    function clave(productoId, clienteId) {
        return productoId + '|' + clienteId;
    }

    function cantidad(productoId, clienteId) {
        return estado.pedidos[clave(productoId, clienteId)] || 0;
    }

    function totalProducto(productoId) {
        return estado.clientes.reduce((s, c) => s + cantidad(productoId, c.id), 0);
    }

    function productosDeLaHoja() {
        return estado.productos.filter(p => p.hoja === estado.hoja);
    }

    function ordenados(lista) {
        return lista.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }

    function tipoDe(producto) {
        return GRUPOS.some(g => g.tipo === producto.tipo) ? producto.tipo : 'otros';
    }

    // ---------- guardado ----------

    let cola = Promise.resolve();
    let pendientes = 0;

    function mostrarEstado(texto, esError) {
        el.estado.textContent = texto;
        el.estado.classList.toggle('error', !!esError);
    }

    // Las escrituras van de a una, en orden, para que dos celdas seguidas no compitan.
    function guardar(productoId, clienteId, valor) {
        pendientes += 1;
        mostrarEstado('Guardando…');
        const fecha = estado.fecha;
        cola = cola.then(() => V2Datos.guardarCelda(fecha, productoId, clienteId, valor))
            .then(() => {
                pendientes -= 1;
                if (!pendientes) mostrarEstado('Guardado');
            })
            .catch(error => {
                pendientes -= 1;
                mostrarEstado('No se pudo guardar: ' + (error && error.message || 'error'), true);
            });
    }

    // ---------- dibujo ----------

    function dibujarHojas() {
        el.hojas.textContent = '';
        HOJAS.forEach(h => {
            const cuantos = estado.productos.filter(p => p.hoja === h.id).length;
            const tab = crear('button', {
                type: 'button', role: 'tab', class: 'hoja-tab', 'data-hoja': h.id,
                'aria-selected': String(h.id === estado.hoja)
            }, `${h.nombre} (${cuantos})`);
            el.hojas.appendChild(tab);
        });
    }

    function dibujarTabla() {
        const tabla = el.tabla;
        tabla.textContent = '';
        const productos = productosDeLaHoja();

        const thead = crear('thead');
        const filaCab = crear('tr');
        filaCab.appendChild(crear('th', { class: 'col-producto', scope: 'col' }, 'Producto'));
        estado.clientes.forEach(c => filaCab.appendChild(crear('th', { scope: 'col' }, c.nombre)));
        filaCab.appendChild(crear('th', { class: 'col-total', scope: 'col' }, 'Total'));
        thead.appendChild(filaCab);
        tabla.appendChild(thead);

        const tbody = crear('tbody');
        const columnas = estado.clientes.length + 2;
        let filasVisibles = 0;

        GRUPOS.forEach(grupo => {
            let lista = ordenados(productos.filter(p => tipoDe(p) === grupo.tipo));
            if (estado.ocultarVacias) lista = lista.filter(p => totalProducto(p.id) > 0);
            if (!lista.length) return;

            const filaGrupo = crear('tr', { class: 'fila-grupo' });
            filaGrupo.appendChild(crear('th', { colspan: String(columnas), scope: 'rowgroup' }, grupo.nombre));
            tbody.appendChild(filaGrupo);

            lista.forEach(p => {
                filasVisibles += 1;
                const fila = crear('tr', { 'data-producto': p.id });
                fila.appendChild(crear('th', { class: 'col-producto', scope: 'row' }, p.nombre + (p.por_kilo ? ' (kg)' : '')));
                estado.clientes.forEach(c => {
                    const celda = crear('td');
                    const valor = cantidad(p.id, c.id);
                    const input = crear('input', {
                        type: 'text', class: 'celda' + (valor > 0 ? ' con-valor' : ''), autocomplete: 'off',
                        inputmode: p.por_kilo ? 'decimal' : 'numeric',
                        'data-producto': p.id, 'data-cliente': c.id,
                        'aria-label': `${p.nombre} para ${c.nombre}`
                    });
                    input.value = formatear(valor);
                    celda.appendChild(input);
                    fila.appendChild(celda);
                });
                fila.appendChild(crear('td', { class: 'col-total', 'data-total-producto': p.id }, formatear(totalProducto(p.id))));
                tbody.appendChild(fila);
            });
        });

        if (!filasVisibles) {
            const fila = crear('tr');
            fila.appendChild(crear('td', { colspan: String(columnas), class: 'ayuda' }, 'No hay productos para mostrar en esta hoja.'));
            tbody.appendChild(fila);
        }
        tabla.appendChild(tbody);

        const tfoot = crear('tfoot');
        const filaTotales = crear('tr');
        filaTotales.appendChild(crear('td', { class: 'col-producto' }, 'Total de la hoja'));
        estado.clientes.forEach(c => filaTotales.appendChild(crear('td', { 'data-total-cliente': c.id }, '')));
        filaTotales.appendChild(crear('td', { 'data-total-hoja': '1' }, ''));
        tfoot.appendChild(filaTotales);
        tabla.appendChild(tfoot);

        actualizarTotales();
    }

    function actualizarTotales() {
        const ids = productosDeLaHoja().map(p => p.id);
        let granTotal = 0;
        estado.clientes.forEach(c => {
            const suma = ids.reduce((s, id) => s + cantidad(id, c.id), 0);
            granTotal += suma;
            const celda = el.tabla.querySelector(`[data-total-cliente="${c.id}"]`);
            if (celda) celda.textContent = formatear(suma);
        });
        const hoja = el.tabla.querySelector('[data-total-hoja]');
        if (hoja) hoja.textContent = formatear(granTotal);
        ids.forEach(id => {
            const celda = el.tabla.querySelector(`[data-total-producto="${id}"]`);
            if (celda) celda.textContent = formatear(totalProducto(id));
        });
    }

    // ---------- edición ----------

    function mover(input, dFila, dCol) {
        const celdas = Array.from(el.tabla.querySelectorAll('.celda'));
        const columnas = estado.clientes.length;
        const i = celdas.indexOf(input);
        if (i < 0 || !columnas) return;
        const destino = celdas[i + dFila * columnas + dCol];
        if (destino) {
            destino.focus();
            destino.select();
        }
    }

    function alCambiar(input) {
        const productoId = input.getAttribute('data-producto');
        const clienteId = input.getAttribute('data-cliente');
        const producto = estado.productos.find(p => p.id === productoId);
        const valor = leerCantidad(input.value, producto && producto.por_kilo);
        if (valor === null) {
            input.classList.add('invalida');
            mostrarEstado(producto && producto.por_kilo
                ? 'Escribí un número (hasta 2 decimales).'
                : 'Esta cantidad va en bultos enteros.', true);
            return;
        }
        input.classList.remove('invalida');
        input.classList.toggle('con-valor', valor > 0);
        input.value = formatear(valor);
        if (valor === cantidad(productoId, clienteId)) return;
        if (valor > 0) estado.pedidos[clave(productoId, clienteId)] = valor;
        else delete estado.pedidos[clave(productoId, clienteId)];
        actualizarTotales();
        guardar(productoId, clienteId, valor);
    }

    el.tabla.addEventListener('change', e => {
        if (e.target.classList.contains('celda')) alCambiar(e.target);
    });

    el.tabla.addEventListener('focusin', e => {
        if (e.target.classList.contains('celda')) e.target.select();
    });

    el.tabla.addEventListener('keydown', e => {
        const input = e.target;
        if (!input.classList.contains('celda')) return;
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            alCambiar(input);
            mover(input, 1, 0);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            alCambiar(input);
            mover(input, -1, 0);
        } else if (e.key === 'ArrowRight' && input.selectionStart === input.value.length) {
            e.preventDefault();
            alCambiar(input);
            mover(input, 0, 1);
        } else if (e.key === 'ArrowLeft' && input.selectionEnd === 0) {
            e.preventDefault();
            alCambiar(input);
            mover(input, 0, -1);
        }
    });

    // ---------- controles ----------

    el.hojas.addEventListener('click', e => {
        const tab = e.target.closest('[data-hoja]');
        if (!tab || tab.getAttribute('data-hoja') === estado.hoja) return;
        estado.hoja = tab.getAttribute('data-hoja');
        dibujarHojas();
        dibujarTabla();
    });

    el.ocultar.addEventListener('change', () => {
        estado.ocultarVacias = el.ocultar.checked;
        guardarPreferencia('v2-ocultar-vacias', estado.ocultarVacias ? '1' : '0');
        dibujarTabla();
    });

    el.fecha.addEventListener('change', () => {
        if (!el.fecha.value) return;
        cargarDia(el.fecha.value);
    });

    el.limpiar.addEventListener('click', async () => {
        if (!window.confirm('Se borran los pedidos de prueba de este día. ¿Seguís?')) return;
        await V2Datos.borrarDia(estado.fecha);
        await cargarDia(estado.fecha);
    });

    async function cargarDia(fecha) {
        // Lo que todavía se está guardando es del día anterior: se espera antes de cambiar.
        await cola;
        estado.fecha = fecha;
        el.fecha.value = fecha;
        estado.pedidos = await V2Datos.pedidosDelDia(fecha);
        mostrarEstado('');
        dibujarTabla();
    }

    async function iniciar() {
        el.ocultar.checked = estado.ocultarVacias;
        if (V2Datos.modo === 'prueba') el.avisoPrueba.hidden = false;
        try {
            const catalogo = await V2Datos.catalogo();
            estado.productos = catalogo.productos;
            // Las columnas siempre en el mismo orden: de la A a la Z.
            estado.clientes = catalogo.clientes.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
            dibujarHojas();
            await cargarDia(estado.fecha);
        } catch (error) {
            mostrarEstado('No se pudo cargar la planilla: ' + (error && error.message || 'error'), true);
        }
    }

    iniciar();
})();
