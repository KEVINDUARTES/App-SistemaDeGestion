/**
 * Servicio de integración con WhatsApp.
 * - Modo automático: WhatsApp Business Cloud API (backend).
 * - Modo manual: abre WhatsApp Web / app con mensaje precargado (wa.me).
 */
class WhatsAppError extends Error {
    constructor(message, code = 'WHATSAPP_ERROR') {
        super(message);
        this.name = 'WhatsAppError';
        this.code = code;
    }
}

const WhatsAppService = {
    DEFAULT_COUNTRY_CODE: '54',
    WINDOW_NAME: 'whatsapp_window',

    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    normalizePhone(telefono) {
        if (telefono === null || telefono === undefined || telefono === '') {
            return null;
        }

        let digits = String(telefono).trim();

        if (digits.startsWith('+')) {
            digits = digits.slice(1).replace(/\D/g, '');
        } else {
            digits = digits.replace(/\D/g, '');
            if (digits.startsWith('00')) {
                digits = digits.slice(2);
            } else if (digits.startsWith('0')) {
                digits = digits.slice(1);
            }

            if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith(this.DEFAULT_COUNTRY_CODE)) {
                digits = this.DEFAULT_COUNTRY_CODE + digits;
            }
        }

        if (digits.length < 10 || digits.length > 15) {
            return null;
        }

        return digits;
    },

    buildUrl(telefono, mensaje) {
        const phone = this.normalizePhone(telefono);

        if (!phone) {
            throw new WhatsAppError(
                'El contacto no tiene un teléfono válido configurado.',
                'INVALID_PHONE'
            );
        }

        const encodedMessage = encodeURIComponent(mensaje);

        if (this.isMobile()) {
            return `whatsapp://send?phone=${phone}&text=${encodedMessage}`;
        }

        return `https://wa.me/${phone}?text=${encodedMessage}`;
    },

    openChat(telefono, mensaje) {
        const url = this.buildUrl(telefono, mensaje);

        // Usar un nombre de ventana fijo para reutilizar la misma pestaña
        // en vez de abrir una nueva cada vez que se envía un mensaje
        if (this.isMobile()) {
            window.location.href = url;
        } else {
            this._wspWindow = window.open(url, this.WINDOW_NAME);
        }
    },

    /**
     * Envía el mensaje automáticamente vía WhatsApp Business API (backend).
     * @param {string} telefono
     * @param {string} mensaje
     * @param {Object} api
     */
    async sendMessage(telefono, mensaje, api) {
        const phone = this.normalizePhone(telefono);

        if (!phone) {
            throw new WhatsAppError(
                'El contacto no tiene un teléfono válido configurado.',
                'INVALID_PHONE'
            );
        }

        await api.enviarWhatsApp(phone, mensaje);
    },

    /**
     * Envía automáticamente si la API está configurada; si no, abre WhatsApp manualmente.
     * @returns {Promise<'auto'|'manual'>}
     */
    async sendOrOpen(telefono, mensaje, api, autoEnvioActivo) {
        if (autoEnvioActivo) {
            await this.sendMessage(telefono, mensaje, api);
            return 'auto';
        }

        this.openChat(telefono, mensaje);
        return 'manual';
    }
};
