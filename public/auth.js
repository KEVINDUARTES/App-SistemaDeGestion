// Configuración de la API (igual que en app.js)
const API_CONFIG = {
    baseUrl: 'https://script.google.com/macros/s/AKfycbwBCiu3eRl6RJXE5ZetRVgWfWp0el0pN50BysXcekPTXMnjApWS0EX-sx4K3QZVO_u2jg/exec',
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
    
    // Intentar login usando JSONP (evita problemas de CORS)
    async login(email, password) {
        return new Promise((resolve) => {
            try {
                // Crear un nombre único para el callback
                const callbackName = 'loginCallback_' + Date.now();
                
                // Crear la función callback global
                window[callbackName] = (data) => {
                    // Limpiar
                    delete window[callbackName];
                    document.body.removeChild(script);

                    /**
                     * La API responde con el formato:
                     * { success: true, data: { success: true|false, token?, error? } }
                     * "success" de primer nivel indica que la petición fue procesada (apiKey ok),
                     * NO que el login fue exitoso.
                     */
                    const loginResult = data && data.data ? data.data : null;
                    const loginOk = !!(data && data.success && loginResult && loginResult.success && loginResult.token);

                    if (loginOk) {
                        // Guardar sesión
                        this.saveSession((loginResult.email || email).toLowerCase().trim(), loginResult.token);
                        resolve({ success: true });
                        return;
                    }

                    // Error de login o de API
                    const errorMessage =
                        (loginResult && loginResult.error) ||
                        (data && data.error) ||
                        'Credenciales inválidas';
                    resolve({ success: false, error: errorMessage });
                };
                
                // Crear script tag para hacer la petición
                const script = document.createElement('script');
                const url = `${API_CONFIG.baseUrl}?apiKey=${encodeURIComponent(API_CONFIG.apiKey)}&endpoint=login&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&callback=${callbackName}`;
                
                script.src = url;
                
                // Manejar errores
                script.onerror = () => {
                    delete window[callbackName];
                    document.body.removeChild(script);
                    resolve({ success: false, error: 'Error de conexión. Intenta nuevamente.' });
                };
                
                // Timeout de 10 segundos
                setTimeout(() => {
                    if (window[callbackName]) {
                        delete window[callbackName];
                        if (script.parentNode) {
                            document.body.removeChild(script);
                        }
                        resolve({ success: false, error: 'Tiempo de espera agotado. Intenta nuevamente.' });
                    }
                }, 10000);
                
                document.body.appendChild(script);
                
            } catch (error) {
                console.error('Error en login:', error);
                resolve({ success: false, error: 'Error inesperado. Intenta nuevamente.' });
            }
        });
    }
};

// Este archivo ahora solo contiene las funciones de Auth
// El código específico del formulario de login está en login.html

