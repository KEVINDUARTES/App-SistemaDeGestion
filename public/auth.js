// Configuración de la API (igual que en app.js)
const API_CONFIG = {
    baseUrl: 'https://script.google.com/macros/s/AKfycbw8MRUd3Knlnbexk-sHixUr_P0XIA7NJafNc9qplITfnaBmBVwIY7l7ieQGpE13SN9msw/exec',
    apiKey: 'TMiToken89899'
};

// Sistema de autenticación
// Logs de consola habilitados para debugging
console.log('🔐 auth.js cargado correctamente');

const Auth = {
    // Verificar si el usuario está autenticado
    isAuthenticated() {
        const token = localStorage.getItem('authToken');
        const email = localStorage.getItem('userEmail');
        return !!(token && email);
    },
    
    // Guardar sesión
    saveSession(email, token) {
        localStorage.setItem('authToken', token);
        localStorage.setItem('userEmail', email);
        localStorage.setItem('loginTime', new Date().toISOString());
    },
    
    // Cerrar sesión
    logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('loginTime');
        window.location.href = 'login.html';
    },
    
    // Obtener email del usuario
    getUserEmail() {
        return localStorage.getItem('userEmail');
    },
    
    async _prueba(email, password) {
        if (!window.crypto || !crypto.subtle || !window.TextEncoder) return '';
        const texto = String(email || '').toLowerCase().trim() + '\n' + String(password || '');
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    // Google avisa un corte en el redirect aunque la respuesta siga en camino.
    // No se cancela ese pedido: en el celular, cancelarlo y reintentar deja el botón girando.
    _pedirLogin(email, password) {
        return new Promise((resolve) => {
            let settled = false;
            const callbackName = 'loginCallback_' + Date.now();
            const script = document.createElement('script');

            const finish = (result) => {
                if (settled) return;
                settled = true;
                delete window[callbackName];
                script.onerror = null;
                if (script.parentNode) script.parentNode.removeChild(script);
                resolve(result);
            };

            window[callbackName] = async (data) => {
                const loginResult = data && data.data ? data.data : null;
                const loginOk = !!(data && data.success && loginResult && loginResult.success && loginResult.token);
                if (!loginOk) {
                    finish({
                        success: false,
                        error: (loginResult && loginResult.error) || (data && data.error) || 'Credenciales inválidas'
                    });
                    return;
                }
                const correo = (loginResult.email || email).toLowerCase().trim();
                this.saveSession(correo, loginResult.token);
                try {
                    const prueba = await this._prueba(correo, password);
                    if (prueba) localStorage.setItem('loginProof', correo + ':' + prueba);
                } catch (error) {}
                finish({ success: true });
            };

            script.async = true;
            script.src = `${API_CONFIG.baseUrl}?apiKey=${encodeURIComponent(API_CONFIG.apiKey)}&endpoint=login&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&callback=${callbackName}&_=${Date.now()}`;
            script.onerror = () => {};
            document.body.appendChild(script);

            setTimeout(() => {
                finish({ success: false, error: 'Tiempo de espera agotado. Intenta nuevamente.' });
            }, 20000);
        });
    },

    async login(email, password) {
        const correo = String(email || '').toLowerCase().trim();
        try {
            const prueba = await this._prueba(correo, password);
            const guardada = localStorage.getItem('loginProof');
            if (prueba && guardada === correo + ':' + prueba) {
                this.saveSession(correo, 'local-' + Date.now());
                return { success: true };
            }
        } catch (error) {
            console.error('Error en login:', error);
        }
        return this._pedirLogin(correo, password);
    }
};

// Este archivo ahora solo contiene las funciones de Auth
// El código específico del formulario de login está en login.html

