// Configuración de la API (igual que en app.js)
const API_CONFIG = {
    baseUrl: 'https://script.google.com/macros/s/AKfycbw8MRUd3Knlnbexk-sHixUr_P0XIA7NJafNc9qplITfnaBmBVwIY7l7ieQGpE13SN9msw/exec',
    apiKey: 'TMiToken89899'
};

// Sistema de autenticación
// Logs de consola habilitados para debugging
console.log('🔐 auth.js cargado correctamente');

const Auth = {
    // Todo lo que el navegador recuerda (listas, borradores, caché) es del usuario que lo cargó.
    // Se borra al entrar, al salir y si cambia el usuario: nadie ve datos de otro.
    limpiarDatosLocales() {
        try { localStorage.clear(); } catch (error) {}
        try { sessionStorage.clear(); } catch (error) {}
    },

    // Verificar si el usuario está autenticado.
    // El token real es "datos.firma": los viejos (sin firma) ya no sirven y obligan a entrar de nuevo.
    isAuthenticated() {
        const token = localStorage.getItem('authToken');
        const email = localStorage.getItem('userEmail');
        return !!(token && email && token.indexOf('.') > 0);
    },
    
    // Guardar sesión (siempre sobre un navegador limpio)
    saveSession(email, token, hoja) {
        this.limpiarDatosLocales();
        localStorage.setItem('authToken', token);
        localStorage.setItem('userEmail', email);
        localStorage.setItem('sg_owner', email);
        localStorage.setItem('sg_hoja', hoja || '');
        localStorage.setItem('loginTime', new Date().toISOString());
        try { sessionStorage.setItem('sg_session_owner', email); } catch (error) {}
    },
    
    // Cerrar sesión
    logout() {
        this.limpiarDatosLocales();
        this.navegar('login.html');
    },

    // Todas las redirecciones pasan por acá: si la página está en un bucle de recargas, se frena y se explica.
    navegar(destino) {
        if (window.__bucle) {
            this.mostrarAvisoDeBucle(destino);
            return;
        }
        window.location.replace(destino);
    },

    mostrarAvisoDeBucle(destino) {
        if (document.getElementById('aviso-bucle')) return;
        let token = '', email = '', dueno = '';
        try {
            token = localStorage.getItem('authToken') || '';
            email = localStorage.getItem('userEmail') || '';
            dueno = localStorage.getItem('sg_owner') || '';
        } catch (error) {}
        const caja = document.createElement('div');
        caja.id = 'aviso-bucle';
        caja.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;color:#111;font:15px system-ui,sans-serif;padding:32px;overflow:auto';
        caja.innerHTML = '<h2>La página se estaba recargando sin parar</h2>'
            + '<p>Se frenó para que no parpadee. Intentaba ir a <b>' + destino + '</b>.</p>'
            + '<p style="font-family:monospace;font-size:13px;background:#f3f4f6;padding:12px;border-radius:8px">'
            + 'usuario guardado: ' + (email || '(ninguno)') + '<br>'
            + 'sesión con firma: ' + (token.indexOf('.') > 0 ? 'sí' : 'no') + '<br>'
            + 'dueño de los datos: ' + (dueno || '(ninguno)') + '<br>'
            + 'página: ' + location.pathname + '</p>'
            + '<button id="aviso-bucle-limpiar" style="font-size:16px;padding:12px 20px;border:0;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer">Borrar datos locales y empezar de nuevo</button>';
        document.body.appendChild(caja);
        document.getElementById('aviso-bucle-limpiar').addEventListener('click', () => {
            try { localStorage.clear(); sessionStorage.clear(); } catch (error) {}
            window.location.href = 'login.html';
        });
    },

    getToken() {
        return localStorage.getItem('authToken') || '';
    },

    // Si lo guardado en el navegador no es de este usuario, se descarta antes de mostrar nada.
    // Son dos lugares: localStorage (compartido por todas las pestañas) y sessionStorage
    // (propio de cada pestaña: una pestaña vieja puede conservar la caché del usuario anterior).
    verificarDuenioDeDatos() {
        try {
            const email = localStorage.getItem('userEmail');
            if (!email) return;
            if (localStorage.getItem('sg_owner') !== email) {
                const token = localStorage.getItem('authToken');
                const loginTime = localStorage.getItem('loginTime');
                const hoja = localStorage.getItem('sg_hoja');
                try { localStorage.clear(); } catch (error) {}
                if (token) localStorage.setItem('authToken', token);
                localStorage.setItem('userEmail', email);
                localStorage.setItem('sg_owner', email);
                if (loginTime) localStorage.setItem('loginTime', loginTime);
                if (hoja) localStorage.setItem('sg_hoja', hoja);
            }
            if (sessionStorage.getItem('sg_session_owner') !== email) {
                try { sessionStorage.clear(); } catch (error) {}
                sessionStorage.setItem('sg_session_owner', email);
            }
        } catch (error) {}
    },
    
    // Obtener email del usuario
    getHoja() {
        return localStorage.getItem('sg_hoja') || '';
    },

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
                if (String(loginResult.token).indexOf('.') < 0) {
                    // Un servidor con el Code.gs viejo entrega tokens sin firma: con ellos la app rebotaría
                    // entre el ingreso y la pantalla principal. Mejor decirlo claro.
                    finish({
                        success: false,
                        error: 'El servidor todavía tiene una versión vieja de Code.gs. En Apps Script: Implementar → Administrar implementaciones → editar → Versión: Nueva versión → Implementar. Después volvé a intentar.'
                    });
                    return;
                }
                const correo = (loginResult.email || email).toLowerCase().trim();
                this.saveSession(correo, loginResult.token, loginResult.hoja);
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

    // Siempre se valida en el servidor: sin eso no habría sesión firmada ni hoja propia.
    async login(email, password) {
        const correo = String(email || '').toLowerCase().trim();
        return this._pedirLogin(correo, password);
    }
};

Auth.verificarDuenioDeDatos();

// Si en otra pestaña se entra o se sale con otro usuario, esta pestaña no puede seguir
// mostrando datos del anterior: se recarga y cada una queda con lo suyo.
let recargaPorOtraPestana = null;
window.addEventListener('storage', (evento) => {
    if (evento.key === null || evento.key === 'authToken' || evento.key === 'userEmail') {
        // Se espera a que la otra pestaña termine de guardar la sesión antes de mirar el resultado.
        clearTimeout(recargaPorOtraPestana);
        recargaPorOtraPestana = setTimeout(() => { if (!window.__bucle) window.location.reload(); }, 600);
    }
});

// Este archivo ahora solo contiene las funciones de Auth
// El código específico del formulario de login está en login.html

