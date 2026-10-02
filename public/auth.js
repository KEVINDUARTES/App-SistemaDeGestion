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
    
    // Intentar login usando JSONP (evita problemas de CORS).
    // Google dispara onerror en el redirect aunque la respuesta siga en camino:
    // no se muestra el error hasta agotar un reintento silencioso.
    async login(email, password) {
        return new Promise((resolve) => {
            let settled = false;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                resolve(result);
            };

            const interpretar = (data) => {
                const loginResult = data && data.data ? data.data : null;
                const loginOk = !!(data && data.success && loginResult && loginResult.success && loginResult.token);
                if (loginOk) {
                    this.saveSession((loginResult.email || email).toLowerCase().trim(), loginResult.token);
                    return { success: true };
                }
                return {
                    success: false,
                    error: (loginResult && loginResult.error) || (data && data.error) || 'Credenciales inválidas'
                };
            };

            const start = (attempt) => {
                if (settled) return;
                const callbackName = 'loginCallback_' + Date.now() + '_' + attempt;
                const script = document.createElement('script');
                let gotResponse = false;

                const limpiar = () => {
                    delete window[callbackName];
                    script.onerror = null;
                    if (script.parentNode) script.parentNode.removeChild(script);
                };

                window[callbackName] = (data) => {
                    if (settled) {
                        limpiar();
                        return;
                    }
                    gotResponse = true;
                    limpiar();
                    finish(interpretar(data));
                };

                script.async = true;
                script.src = `${API_CONFIG.baseUrl}?apiKey=${encodeURIComponent(API_CONFIG.apiKey)}&endpoint=login&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&callback=${callbackName}`;
                script.onerror = () => {
                    setTimeout(() => {
                        if (gotResponse || settled) return;
                        limpiar();
                        if (attempt < 2) {
                            start(attempt + 1);
                            return;
                        }
                        finish({ success: false, error: 'Error de conexión. Intenta nuevamente.' });
                    }, 4000);
                };
                document.body.appendChild(script);
            };

            try {
                start(1);
                setTimeout(() => {
                    finish({ success: false, error: 'Tiempo de espera agotado. Intenta nuevamente.' });
                }, 45000);
            } catch (error) {
                console.error('Error en login:', error);
                finish({ success: false, error: 'Error inesperado. Intenta nuevamente.' });
            }
        });
    }
};

// Este archivo ahora solo contiene las funciones de Auth
// El código específico del formulario de login está en login.html

