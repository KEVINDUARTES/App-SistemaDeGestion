/**
 * Lógica de negocio para pedidos a proveedores.
 * Agrupa pedidos, construye mensajes y persiste el estado "enviado".
 */
class PedidoProveedorError extends Error {
    constructor(message, code = 'PEDIDO_PROVEEDOR_ERROR') {
        super(message);
        this.name = 'PedidoProveedorError';
        this.code = code;
    }
}

const PedidoProveedorService = {
    SIN_PROVEEDOR_ID: 'sin-proveedor',

    isEnviado(pedido) {
        const valor = pedido?.enviado;
        return valor === true || valor === 1 || String(valor).toLowerCase() === 'true';
    },

    /**
     * Agrupa pedidos del día por proveedor (según proveedor_default del producto).
     * @param {Array} pedidos
     * @param {Array} productos
     * @returns {Object<string, Array>}
     */
    agruparPorProveedor(pedidos, productos) {
        const productosMap = {};
        (productos || []).forEach(producto => {
            productosMap[producto.id] = producto;
        });

        const pedidosPorProveedor = {};

        (pedidos || []).forEach(pedido => {
            const producto = productosMap[pedido.producto_id];
            if (!producto) {
                return;
            }

            const proveedorId = pedido.proveedor_id || producto.proveedor_default || this.SIN_PROVEEDOR_ID;

            if (!pedidosPorProveedor[proveedorId]) {
                pedidosPorProveedor[proveedorId] = [];
            }

            pedidosPorProveedor[proveedorId].push({
                pedidoId: pedido.id,
                producto: producto.nombre,
                producto_id: pedido.producto_id,
                cantidad: pedido.cantidad,
                enviado: this.isEnviado(pedido)
            });
        });

        return pedidosPorProveedor;
    },

    /**
     * Totales del pedido del día agrupados por producto.
     */
    resumirPorProducto(pedidos, productos) {
        const productosMap = {};
        (productos || []).forEach(producto => {
            productosMap[producto.id] = producto;
        });

        const resumen = {};

        (pedidos || []).forEach(pedido => {
            const producto = productosMap[pedido.producto_id];
            if (!producto) {
                return;
            }

            if (!resumen[pedido.producto_id]) {
                resumen[pedido.producto_id] = {
                    producto_id: pedido.producto_id,
                    producto: producto.nombre,
                    tipo: pedido.tipo || producto.tipo || '',
                    cantidad: 0,
                    proveedor_id: pedido.proveedor_id || producto.proveedor_default || '',
                    totalLineas: 0,
                    lineasEnviadas: 0
                };
            }

            const cantidad = parseFloat(pedido.cantidad) || 0;
            resumen[pedido.producto_id].cantidad += cantidad;
            resumen[pedido.producto_id].totalLineas += 1;

            if (this.isEnviado(pedido)) {
                resumen[pedido.producto_id].lineasEnviadas += 1;
            }
        });

        return Object.values(resumen).map(item => ({
            ...item,
            enviadoCompleto: item.totalLineas > 0 && item.lineasEnviadas === item.totalLineas
        })).sort((a, b) =>
            (a.producto || '').localeCompare(b.producto || '')
        );
    },

    /**
     * Lista de todos los proveedores con sus ítems asignados para la vista.
     */
    buildVistaPorProveedor(pedidosPorProveedor, proveedores) {
        const lista = (proveedores || []).map(proveedor => {
            const items = pedidosPorProveedor[proveedor.id] || [];
            const esActivo = proveedor.activo === true || proveedor.activo === 'true' || proveedor.activo === 1;

            return {
                proveedorId: proveedor.id,
                proveedor,
                items,
                marcado: items.length > 0 && this.estaMarcado(items),
                esActivo,
                esSinProveedor: false
            };
        });

        const sinItems = pedidosPorProveedor[this.SIN_PROVEEDOR_ID] || [];
        if (sinItems.length > 0) {
            lista.unshift({
                proveedorId: this.SIN_PROVEEDOR_ID,
                proveedor: { id: this.SIN_PROVEEDOR_ID, nombre: 'Sin proveedor asignado', telefono: '' },
                items: sinItems,
                marcado: this.estaMarcado(sinItems),
                esActivo: true,
                esSinProveedor: true
            });
        }

        lista.sort((a, b) => {
            if (a.esSinProveedor) return -1;
            if (b.esSinProveedor) return 1;
            const aTiene = a.items.length > 0;
            const bTiene = b.items.length > 0;
            if (aTiene !== bTiene) return bTiene - aTiene;
            return (a.proveedor.nombre || '').localeCompare(b.proveedor.nombre || '');
        });

        return lista;
    },

    /**
     * Agrupa cantidades por producto dentro de los ítems de un proveedor.
     */
    consolidarItems(items) {
        const porProducto = {};

        (items || []).forEach(item => {
            const nombre = item.producto || 'Producto';
            if (!porProducto[nombre]) {
                porProducto[nombre] = { producto: nombre, cantidad: 0, enviado: true };
            }
            porProducto[nombre].cantidad += parseFloat(item.cantidad) || 0;
            if (!item.enviado) {
                porProducto[nombre].enviado = false;
            }
        });

        return Object.values(porProducto);
    },

    /**
     * @param {Array} items
     * @returns {boolean}
     */
    estaMarcado(items) {
        if (!items || items.length === 0) {
            return false;
        }

        return items.every(item => item.enviado);
    },

    /**
     * Obtiene los ítems pendientes de un proveedor.
     * @param {string} proveedorId
     * @param {Array} pedidos
     * @param {Array} productos
     * @returns {Array}
     */
    getItemsPendientes(proveedorId, pedidos, productos) {
        const pedidosPorProveedor = this.agruparPorProveedor(pedidos, productos);
        const items = pedidosPorProveedor[proveedorId] || [];
        return items.filter(item => !item.enviado);
    },

    /**
     * Construye el mensaje de WhatsApp con el detalle del pedido.
     * @param {string} nombreProveedor
     * @param {Array} items
     * @returns {string}
     */
    construirMensaje(nombreProveedor, items) {
        const cantidadesPorProducto = {};

        items.forEach(item => {
            const nombre = item.producto || 'Producto';
            const cantidad = parseFloat(item.cantidad) || 0;
            cantidadesPorProducto[nombre] = (cantidadesPorProducto[nombre] || 0) + cantidad;
        });

        const lineasProductos = Object.entries(cantidadesPorProducto)
            .map(([nombre, cantidad]) => `• ${nombre} x${cantidad}`)
            .join('\n');

        return (
            `Hola ${nombreProveedor}, queremos realizar el siguiente pedido:\n\n` +
            `${lineasProductos}\n\n` +
            'Muchas gracias.'
        );
    },

    /**
     * Valida datos y prepara el pedido antes de abrir WhatsApp.
     * @param {string} proveedorId
     * @param {Object} context
     * @returns {{ proveedor: Object, items: Array, pedidosIds: Array, mensaje: string }}
     */
    prepararMarcarPedido(proveedorId, context) {
        const { pedidos, productos, proveedores } = context;

        if (proveedorId === this.SIN_PROVEEDOR_ID) {
            throw new PedidoProveedorError(
                'Hay productos sin proveedor asignado. Configure el proveedor en la sección Productos.',
                'NO_PROVEEDOR'
            );
        }

        const proveedor = (proveedores || []).find(p => p.id == proveedorId);

        if (!proveedor) {
            throw new PedidoProveedorError('Proveedor no encontrado.', 'NO_PROVEEDOR');
        }

        const pedidosPorProveedor = this.agruparPorProveedor(pedidos, productos);
        const items = pedidosPorProveedor[proveedorId] || [];

        if (items.length === 0) {
            throw new PedidoProveedorError(
                'No hay pedidos pendientes para este proveedor.',
                'NO_PEDIDOS'
            );
        }

        if (this.estaMarcado(items)) {
            throw new PedidoProveedorError(
                'Todos los pedidos de este proveedor ya están marcados como enviados.',
                'ALREADY_MARKED'
            );
        }

        const itemsPendientes = items.filter(item => !item.enviado);
        const pedidosIds = itemsPendientes.map(item => item.pedidoId);

        if (!proveedor.telefono || !proveedor.telefono.trim()) {
            throw new PedidoProveedorError(
                `El proveedor "${proveedor.nombre}" no tiene teléfono configurado. Agregue el número en la sección Proveedores.`,
                'NO_PHONE'
            );
        }

        const mensaje = this.construirMensaje(proveedor.nombre, itemsPendientes);

        return {
            proveedor,
            items: itemsPendientes,
            pedidosIds,
            mensaje
        };
    },

    /**
     * Persiste el estado "enviado" en backend y actualiza el estado local.
     * @param {Array} pedidosIds
     * @param {Object} context
     * @returns {Promise<Object>}
     */
    async persistirMarcado(pedidosIds, context) {
        const { api, cacheManager, appState } = context;

        const resultado = await api.marcarPedidosEnviadosPorIds(pedidosIds);

        if (cacheManager) {
            cacheManager.invalidatePattern('pedidos');
        }

        if (appState && Array.isArray(appState.pedidos)) {
            const ids = new Set((pedidosIds || []).map(id => String(id)));
            appState.pedidos.forEach(pedido => {
                if (ids.has(String(pedido.id))) {
                    pedido.enviado = true;
                }
            });
        }

        return resultado;
    },

    /**
     * Marca un pedido por proveedor: abre WhatsApp y persiste el estado.
     * WhatsApp se abre antes de la llamada al backend para conservar el gesto del usuario.
     * @param {string} proveedorId
     * @param {Object} context
     * @returns {Promise<Object>}
     */
    async marcarPedido(proveedorId, context) {
        const preparacion = this.prepararMarcarPedido(proveedorId, context);

        WhatsAppService.openChat(preparacion.proveedor.telefono, preparacion.mensaje);

        const resultado = await this.persistirMarcado(preparacion.pedidosIds, context);

        return {
            proveedor: preparacion.proveedor,
            marcados: resultado.marcados ?? preparacion.pedidosIds.length,
            mensaje: resultado.mensaje ||
                `Pedido enviado a ${preparacion.proveedor.nombre}. Se marcaron ${preparacion.pedidosIds.length} ítem(s).`
        };
    }
};
