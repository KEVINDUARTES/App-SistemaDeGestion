/**
 * Lógica de negocio para enviar precios al cliente por WhatsApp.
 */
class PrecioClienteError extends Error {
    constructor(message, code = 'PRECIO_CLIENTE_ERROR') {
        super(message);
        this.name = 'PrecioClienteError';
        this.code = code;
    }
}

const PrecioClienteService = {
    formatCurrency(value) {
        const amount = Math.round(parseFloat(value) || 0);
        const sign = amount < 0 ? '-' : '';
        const absAmount = Math.abs(amount);
        return `$ ${absAmount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
    },

    /**
     * Construye el mensaje de WhatsApp con el detalle de precios del pedido.
     * @param {Object} datos
     * @param {string} datos.clienteNombre
     * @param {Array} datos.filas - { producto, cantidad, precioUnitario, total }
     * @param {number} datos.totalProductos
     * @param {number} datos.totalCantidad
     * @param {number} datos.comision
     * @param {number} datos.saldoTotal
     * @param {number} comisionPorUnidad
     * @param {string} [fechaLabel]
     * @returns {string}
     */
    construirMensaje(datos, comisionPorUnidad, fechaLabel) {
        const {
            clienteNombre,
            filas = [],
            totalProductos = 0,
            totalCantidad = 0,
            comision = 0,
            saldoTotal = 0
        } = datos;

        const extra = Math.round(parseFloat(comisionPorUnidad) || 0);
        const lineasProductos = filas
            .map(f => {
                const cantidad = parseFloat(f.cantidad) || 0;
                const unitarioConComision = (parseFloat(f.precioUnitario) || 0) + extra;
                const subtotal = unitarioConComision * cantidad;
                return `• ${f.producto} x${cantidad} — ${this.formatCurrency(unitarioConComision)}/u = ${this.formatCurrency(subtotal)}`;
            })
            .join('\n');

        let mensaje = `Hola ${clienteNombre || 'cliente'}, te enviamos el detalle de tu pedido`;
        if (fechaLabel) {
            mensaje += ` del ${fechaLabel}`;
        }
        mensaje += `:\n\n${lineasProductos}\n\n`;
        mensaje += `*Total a pagar: ${this.formatCurrency(saldoTotal)}*\n\nMuchas gracias.`;

        return mensaje;
    },

    /**
     * Valida teléfono y datos antes de enviar.
     * @param {Object} cliente
     * @param {Object} datos
     */
    validarEnvio(cliente, datos) {
        if (!cliente) {
            throw new PrecioClienteError('Cliente no encontrado.', 'NO_CLIENTE');
        }

        if (!cliente.telefono || !String(cliente.telefono).trim()) {
            throw new PrecioClienteError(
                `El cliente "${cliente.nombre}" no tiene teléfono configurado. Agregá el número en la sección Clientes.`,
                'NO_PHONE'
            );
        }

        if (!datos || !datos.filas || datos.filas.length === 0) {
            throw new PrecioClienteError('No hay productos para enviar.', 'NO_DATOS');
        }

        const sinPrecio = datos.filas.some(f => !f.precioUnitario || f.precioUnitario <= 0);
        if (sinPrecio) {
            throw new PrecioClienteError(
                'Completá los precios al cliente antes de enviar el mensaje.',
                'SIN_PRECIO'
            );
        }
    }
};
