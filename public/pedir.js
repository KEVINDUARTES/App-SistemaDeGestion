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

const estado = { info: null, inicial: {}, actual: {}, busqueda: '', quitado: null };

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
    ['cargando', 'error', 'pedido', 'revision', 'hecho'].forEach(id => { $(id).hidden = id !== cual; });
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
    const boton = $('revisar');
    const pedidos = info.productos.filter(p => (estado.actual[p.id] || 0) > 0).length;
    const hayCambios = cambios().length > 0;
    boton.disabled = !info.abierto || !hayCambios;
    if (!info.abierto) boton.textContent = 'Pedidos cerrados';
    else if (!hayCambios) boton.textContent = pedidos ? 'Sin cambios' : 'Elegí lo que necesitás';
    else boton.textContent = `Revisar pedido · ${pedidos} ${pedidos === 1 ? 'producto' : 'productos'}`;
}

// Cantidad con − / campo / +, igual en la lista y en la revisión. "alCambiar" repinta lo que haga falta.
function crearCant(p, nombre, alCambiar) {
    const info = estado.info;
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
        if (nombre) {
            const aviso = document.createElement('span');
            aviso.className = 'sin-stock-txt';
            aviso.textContent = 'Sin stock por ahora';
            nombre.appendChild(aviso);
        }
        if (!tope) { menos.disabled = mas.disabled = campo.disabled = true; }
    }
    const poner = valor => {
        const antes = estado.actual[p.id] || 0;
        estado.actual[p.id] = Math.max(0, p.sin_stock ? Math.min(valor, estado.inicial[p.id] || 0) : valor);
        campo.value = estado.actual[p.id] > 0 ? fmt(estado.actual[p.id]) : '';
        cant.classList.toggle('tiene', estado.actual[p.id] > 0);
        alCambiar(p, antes);
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
    return cant;
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

        if (p.sin_stock) fila.classList.add('sin-stock');
        const cant = crearCant(p, nombre, () => resumenBoton());
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

function textoCantidad(p) {
    const n = estado.actual[p.id] || 0;
    return fmt(n) + (p.por_kilo ? ' kg' : (p.unidad ? ' ' + p.unidad : ''));
}

// Pantalla de revisión: solo lo que está pedido, para cambiarlo o quitarlo antes de enviar.
function pintarRevision() {
    const info = estado.info;
    const cont = $('lista-revision');
    cont.textContent = '';
    const pedidos = info.productos.filter(p => (estado.actual[p.id] || 0) > 0);
    $('resumen').textContent = '';
    const r1 = document.createElement('span');
    r1.textContent = `${pedidos.length} ${pedidos.length === 1 ? 'producto' : 'productos'}`;
    $('resumen').appendChild(r1);

    if (estado.quitado) {
        const barra = document.createElement('div');
        barra.className = 'deshacer';
        const txt = document.createElement('span');
        txt.textContent = 'Quitaste ' + estado.quitado.nombre;
        const des = document.createElement('button');
        des.type = 'button'; des.className = 'link'; des.textContent = 'Deshacer';
        des.addEventListener('click', () => {
            estado.actual[estado.quitado.id] = estado.quitado.cantidad;
            estado.quitado = null;
            pintarRevision();
        });
        barra.append(txt, des);
        cont.appendChild(barra);
    }
    if (!pedidos.length) {
        const vacio = document.createElement('div');
        vacio.className = 'vacio';
        const b = document.createElement('b');
        b.textContent = 'No quedó ningún producto';
        vacio.append(b, document.createTextNode(Object.keys(estado.inicial).length
            ? 'Si enviás así, se saca todo lo que habías pedido. También podés agregar productos.'
            : 'Agregá productos para poder enviar el pedido.'));
        cont.appendChild(vacio);
    }
    let grupo = null;
    pedidos.forEach(p => {
        if (p.tipo !== grupo) {
            grupo = p.tipo;
            const g = document.createElement('div');
            g.className = 'grupo';
            g.textContent = grupo || 'Otros';
            cont.appendChild(g);
        }
        const fila = document.createElement('div');
        fila.className = 'fila revision';
        const nombre = document.createElement('div');
        nombre.className = 'nombre';
        const b = document.createElement('b');
        b.textContent = p.nombre;
        const u = document.createElement('span');
        u.textContent = textoCantidad(p);
        nombre.append(b, u);
        const cant = crearCant(p, null, (prod, antes) => {
            if ((estado.actual[prod.id] || 0) === 0) estado.quitado = { id: prod.id, nombre: prod.nombre, cantidad: antes };
            pintarRevision();
        });
        const borrar = document.createElement('button');
        borrar.type = 'button'; borrar.className = 'borrar'; borrar.textContent = '✕';
        borrar.setAttribute('aria-label', 'Quitar ' + p.nombre);
        borrar.addEventListener('click', () => {
            estado.quitado = { id: p.id, nombre: p.nombre, cantidad: estado.actual[p.id] };
            estado.actual[p.id] = 0;
            pintarRevision();
        });
        fila.append(nombre, cant, borrar);
        cont.appendChild(fila);
    });
    const hayCambios = cambios().length > 0;
    $('enviar').disabled = !info.abierto || !hayCambios;
    $('enviar').textContent = pedidos.length || !hayCambios ? 'Enviar pedido' : 'Enviar sin productos';
}

function irRevision() {
    estado.quitado = null;
    mostrar('revision');
    pintarRevision();
    window.scrollTo(0, 0);
}

function irLista() {
    estado.quitado = null;
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
    $('agregar').disabled = true;
    try {
        for (let i = 0; i < lista.length; i += TANDA) {
            await llamar('pedido-link/guardar', 'POST', { items: lista.slice(i, i + TANDA) });
            // Lo que ya llegó al servidor no se vuelve a mandar si falla una tanda posterior.
            lista.slice(i, i + TANDA).forEach(c => { estado.inicial[c.producto_id] = c.cantidad; });
        }
    } catch (error) {
        alert('No se pudo enviar el pedido: ' + error.message + '\nLo que cargaste sigue acá. Probá de nuevo.');
        $('agregar').disabled = false;
        pintarRevision();
        return;
    }
    $('agregar').disabled = false;
    const pedidos = estado.info.productos.filter(p => (estado.actual[p.id] || 0) > 0).length;
    $('hecho-texto').textContent = pedidos
        ? `Recibimos ${pedidos} ${pedidos === 1 ? 'producto' : 'productos'} para el ${fechaLarga(estado.info.fecha).toLowerCase()}. Podés cambiarlo cuando quieras.`
        : 'Tu pedido quedó vacío.';
    mostrar('hecho');
}

$('revisar').addEventListener('click', irRevision);
$('agregar').addEventListener('click', irLista);
$('enviar').addEventListener('click', enviar);
// "Modificar pedido": se vuelve a leer lo guardado y se abre directo la revisión para cambiarlo.
$('modificar').addEventListener('click', async () => {
    await cargar();
    if (estado.info && estado.info.abierto && Object.keys(estado.inicial).length) irRevision();
});
$('reintentar').addEventListener('click', cargar);
$('buscar').addEventListener('input', e => { estado.busqueda = e.target.value.trim(); pintarLista(); });
cargar();
