// Pantalla de pedido para clientes: se abre con el link propio de cada cliente (sin usuario ni contraseña).
// Solo habla con los endpoints "pedido-link/*": ve los productos y el pedido de ese cliente, nada más.

// Son los mismos datos públicos que usa la app (auth.js).
const API_BASE = 'https://script.google.com/macros/s/AKfycbw8MRUd3Knlnbexk-sHixUr_P0XIA7NJafNc9qplITfnaBmBVwIY7l7ieQGpE13SN9msw/exec';
const API_KEY = 'TMiToken89899';
const TANDA = 25;
const ESPERAS_OCUPADO_MS = [1500, 3000, 6000];

const $ = id => document.getElementById(id);

function linkDeLaDireccion() {
    const params = new URLSearchParams(location.search);
    return (params.get('l') || '').trim();
}
const LINK = linkDeLaDireccion();

function llamar(endpoint, method, datos, intento = 0) {
    return new Promise((resolve, reject) => {
        const nombre = 'pedirCb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        let url = `${API_BASE}?endpoint=${encodeURIComponent(endpoint)}&method=${method}&apiKey=${encodeURIComponent(API_KEY)}`
            + `&link=${encodeURIComponent(LINK)}&callback=${nombre}${method !== 'GET' ? `&rid=${nombre}` : ''}`;
        Object.keys(datos || {}).forEach(k => {
            const v = typeof datos[k] === 'object' ? JSON.stringify(datos[k]) : datos[k];
            url += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
        });
        const script = document.createElement('script');
        const limpiar = () => { clearTimeout(timer); delete window[nombre]; script.remove(); };
        const timer = setTimeout(() => { limpiar(); reject(new Error('No hay conexión. Revisá tu internet e intentá de nuevo.')); }, 30000);
        window[nombre] = respuesta => {
            limpiar();
            if (respuesta && respuesta.success) return resolve(respuesta.data);
            if (respuesta && respuesta.busy && intento < ESPERAS_OCUPADO_MS.length) {
                return setTimeout(() => llamar(endpoint, method, datos, intento + 1).then(resolve, reject), ESPERAS_OCUPADO_MS[intento]);
            }
            const texto = String((respuesta && respuesta.error) || 'No se pudo completar.').replace(/^Error:\s*/, '');
            reject(new Error(texto));
        };
        script.onerror = () => { limpiar(); reject(new Error('No hay conexión. Revisá tu internet e intentá de nuevo.')); };
        script.src = url;
        document.head.appendChild(script);
    });
}

const estado = { info: null, inicial: {}, actual: {}, busqueda: '' };

const fmt = n => String(Math.round((Number(n) || 0) * 100) / 100).replace('.', ',');
function leer(texto, porKilo) {
    const n = Number(String(texto).trim().replace(',', '.'));
    if (!isFinite(n) || n < 0) return 0;
    return porKilo ? Math.round(n * 100) / 100 : Math.round(n);
}

function fechaLarga(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    const texto = new Date(a, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function mostrar(cual) {
    ['cargando', 'error', 'pedido', 'hecho'].forEach(id => { $(id).hidden = id !== cual; });
}

function cambios() {
    const lista = [];
    estado.info.productos.forEach(p => {
        const antes = estado.inicial[p.id] || 0;
        const ahora = estado.actual[p.id] || 0;
        if (antes !== ahora) lista.push({ producto_id: p.id, cantidad: ahora });
    });
    return lista;
}

function resumenBoton() {
    const info = estado.info;
    const boton = $('enviar');
    const pedidos = info.productos.filter(p => (estado.actual[p.id] || 0) > 0).length;
    const hayCambios = cambios().length > 0;
    boton.disabled = !info.abierto || !hayCambios;
    if (!info.abierto) boton.textContent = 'Pedidos cerrados';
    else if (!hayCambios) boton.textContent = pedidos ? 'Sin cambios' : 'Elegí lo que necesitás';
    else boton.textContent = `Enviar pedido · ${pedidos} ${pedidos === 1 ? 'producto' : 'productos'}`;
}

function pintarLista() {
    const info = estado.info;
    const q = estado.busqueda.toLowerCase();
    const cont = $('lista');
    cont.textContent = '';
    let grupo = null;
    const visibles = info.productos.filter(p => !q || p.nombre.toLowerCase().includes(q));
    visibles.forEach(p => {
        if (p.tipo !== grupo) {
            grupo = p.tipo;
            const g = document.createElement('div');
            g.className = 'grupo';
            g.textContent = grupo || 'Otros';
            cont.appendChild(g);
        }
        const fila = document.createElement('div');
        fila.className = 'fila';

        const nombre = document.createElement('div');
        nombre.className = 'nombre';
        const b = document.createElement('b');
        b.textContent = p.nombre;
        nombre.appendChild(b);
        if (p.unidad) {
            const u = document.createElement('span');
            u.textContent = (p.por_kilo ? 'por kilo' : 'por ' + p.unidad);
            nombre.appendChild(u);
        }

        const cant = document.createElement('div');
        cant.className = 'cant' + ((estado.actual[p.id] || 0) > 0 ? ' tiene' : '');
        const menos = document.createElement('button');
        menos.type = 'button'; menos.textContent = '−'; menos.setAttribute('aria-label', 'Menos ' + p.nombre);
        const campo = document.createElement('input');
        campo.type = 'text'; campo.inputMode = p.por_kilo ? 'decimal' : 'numeric'; campo.autocomplete = 'off';
        campo.value = (estado.actual[p.id] || 0) > 0 ? fmt(estado.actual[p.id]) : '';
        campo.placeholder = '0';
        campo.setAttribute('aria-label', 'Cantidad de ' + p.nombre);
        const mas = document.createElement('button');
        mas.type = 'button'; mas.textContent = '+'; mas.setAttribute('aria-label', 'Más ' + p.nombre);
        if (!info.abierto) { menos.disabled = mas.disabled = campo.disabled = true; }
        // Sin stock: no se puede sumar; si ya lo había pedido, solo bajarlo o sacarlo.
        if (p.sin_stock) {
            const tope = estado.inicial[p.id] || 0;
            fila.classList.add('sin-stock');
            const aviso = document.createElement('span');
            aviso.className = 'sin-stock-txt';
            aviso.textContent = 'Sin stock por ahora';
            nombre.appendChild(aviso);
            if (!tope) { menos.disabled = mas.disabled = campo.disabled = true; }
        }

        const poner = valor => {
            estado.actual[p.id] = Math.max(0, p.sin_stock ? Math.min(valor, estado.inicial[p.id] || 0) : valor);
            campo.value = estado.actual[p.id] > 0 ? fmt(estado.actual[p.id]) : '';
            cant.classList.toggle('tiene', estado.actual[p.id] > 0);
            resumenBoton();
        };
        const paso = p.por_kilo ? 0.5 : 1;
        menos.addEventListener('click', () => poner(Math.round(((estado.actual[p.id] || 0) - paso) * 100) / 100));
        mas.addEventListener('click', () => poner(Math.round(((estado.actual[p.id] || 0) + paso) * 100) / 100));
        campo.addEventListener('input', () => {
            campo.value = p.por_kilo ? campo.value.replace(/[^\d,.]/g, '') : campo.value.replace(/\D/g, '');
        });
        campo.addEventListener('change', () => poner(leer(campo.value, p.por_kilo)));
        campo.addEventListener('focus', () => campo.select());

        cant.append(menos, campo, mas);
        fila.append(nombre, cant);
        cont.appendChild(fila);
    });
    if (!visibles.length) {
        const vacio = document.createElement('p');
        vacio.style.color = 'var(--muted)';
        vacio.textContent = 'No hay productos con ese nombre.';
        cont.appendChild(vacio);
    }
    resumenBoton();
}

function armar(info) {
    estado.info = info;
    estado.inicial = {};
    estado.actual = {};
    info.productos.forEach(p => {
        const n = Number(info.cantidades[p.id]) || 0;
        if (n > 0) { estado.inicial[p.id] = n; estado.actual[p.id] = n; }
    });
    // Mismo orden que la planilla: verdura, fruta, bebida y mercadería; después lo demás, y cada tipo por nombre.
    const ORDEN = ['verdura', 'fruta', 'bebida', 'mercaderia', 'mercadería'];
    const lugar = p => { const i = ORDEN.indexOf(String(p.tipo || '').trim().toLowerCase()); return i === -1 ? ORDEN.length : i; };
    info.productos.sort((a, b) => lugar(a) - lugar(b) || String(a.tipo || '~').localeCompare(String(b.tipo || '~'), 'es') || a.nombre.localeCompare(b.nombre, 'es'));

    $('titulo').textContent = 'Pedido de ' + info.cliente.nombre;
    $('fecha').textContent = fechaLarga(info.fecha);
    $('corte').hidden = true;
    $('aviso').hidden = info.abierto;
    $('aviso').textContent = info.mensaje || '';
    $('pie').textContent = info.abierto ? 'Podés cambiarlo cuando quieras' : 'Lo que pediste queda como está';
    $('buscar').value = '';
    estado.busqueda = '';
    mostrar('pedido');
    pintarLista();
}

async function cargar() {
    if (!LINK) {
        $('error-texto').textContent = 'Este link no es válido. Pedile uno nuevo al equipo.';
        $('reintentar').hidden = true;
        return mostrar('error');
    }
    mostrar('cargando');
    try {
        armar(await llamar('pedido-link/info', 'GET'));
    } catch (error) {
        $('error-texto').textContent = error.message;
        // Un link inválido no se arregla reintentando.
        $('reintentar').hidden = /link/i.test(error.message);
        mostrar('error');
    }
}

async function enviar() {
    const lista = cambios();
    if (!lista.length) return;
    const boton = $('enviar');
    boton.disabled = true;
    boton.textContent = 'Enviando…';
    try {
        for (let i = 0; i < lista.length; i += TANDA) {
            await llamar('pedido-link/guardar', 'POST', { items: lista.slice(i, i + TANDA) });
            // Lo que ya llegó al servidor no se vuelve a mandar si falla una tanda posterior.
            lista.slice(i, i + TANDA).forEach(c => { estado.inicial[c.producto_id] = c.cantidad; });
        }
    } catch (error) {
        alert('No se pudo enviar el pedido: ' + error.message + '\nLo que cargaste sigue acá. Probá de nuevo.');
        resumenBoton();
        return;
    }
    const pedidos = estado.info.productos.filter(p => (estado.actual[p.id] || 0) > 0).length;
    $('hecho-texto').textContent = pedidos
        ? `Recibimos ${pedidos} ${pedidos === 1 ? 'producto' : 'productos'} para el ${fechaLarga(estado.info.fecha).toLowerCase()}. Podés cambiarlo cuando quieras.`
        : 'Tu pedido quedó vacío.';
    mostrar('hecho');
}

$('enviar').addEventListener('click', enviar);
$('modificar').addEventListener('click', () => cargar());
$('reintentar').addEventListener('click', cargar);
$('buscar').addEventListener('input', e => { estado.busqueda = e.target.value.trim(); pintarLista(); });
cargar();
