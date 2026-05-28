// Configuración de la API
// API_CONFIG ya está definido en auth.js (se carga primero)
// No redeclarar para evitar error "already declared"

// Estado de la aplicación
// Logs de consola habilitados para debugging
console.log('🚀 app.js cargado correctamente');

const AppState = {
    currentPage: 'dashboard',
    currentDate: new Date().toISOString().split('T')[0],
    pedidos: [],
    productos: [],
    clientes: [],
    proveedores: [],
    recepcion: [],
    precios: [],
    cobranzas: [],
    pagos: [],
    stock: [],
    cierres: []
};

// Sistema de caché para optimizar llamadas a la API
const CacheManager = {
    cache: {},
    timestamps: {},
    
    // Configuración de tiempo de vida del caché (en milisegundos)
    TTL: {
        clientes: 5 * 60 * 1000,      // 5 minutos - cambian poco
        productos: 5 * 60 * 1000,     // 5 minutos - cambian poco
        proveedores: 5 * 60 * 1000,   // 5 minutos - cambian poco
        pedidos: 1 * 60 * 1000,       // 1 minuto - cambian frecuentemente
        recepcion: 1 * 60 * 1000,     // 1 minuto
        precios: 1 * 60 * 1000,       // 1 minuto
        cobranzas: 2 * 60 * 1000,     // 2 minutos
        stock: 2 * 60 * 1000,         // 2 minutos
        historial: 5 * 60 * 1000      // 5 minutos
    },
    
    get(key) {
        const now = Date.now();
        const cached = this.cache[key];
        const timestamp = this.timestamps[key];
        
        if (!cached || !timestamp) {
            return null;
        }
        
        // Extraer el tipo de dato de la key (ej: "clientes", "pedidos:2024-01-15")
        const dataType = key.split(':')[0];
        const ttl = this.TTL[dataType] || 60000; // Default 1 minuto
        
        // Verificar si el caché expiró
        if (now - timestamp > ttl) {
            console.log(`⏰ Caché expirado para: ${key}`);
            delete this.cache[key];
            delete this.timestamps[key];
            return null;
        }
        
        console.log(`✅ Usando caché para: ${key}`);
        return cached;
    },
    
    set(key, data) {
        console.log(`💾 Guardando en caché: ${key}`);
        this.cache[key] = data;
        this.timestamps[key] = Date.now();
    },
    
    invalidate(key) {
        console.log(`🗑️ Invalidando caché: ${key}`);
        delete this.cache[key];
        delete this.timestamps[key];
    },
    
    invalidatePattern(pattern) {
        console.log(`🗑️ Invalidando patrón: ${pattern}`);
        const keys = Object.keys(this.cache);
        keys.forEach(key => {
            if (key.startsWith(pattern)) {
                delete this.cache[key];
                delete this.timestamps[key];
            }
        });
    },
    
    clear() {
        console.log('🗑️ Limpiando todo el caché');
        this.cache = {};
        this.timestamps = {};
    }
};

// Utilidades
const Utils = {
    formatDate: (date) => {
        if (!date) return '';
        const d = new Date(date);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    },

    parsePrice(value) {
        if (value === null || value === undefined || value === '') return 0;
        if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : 0;

        const raw = String(value).trim();
        if (!raw) return 0;

        const isNegative = raw.startsWith('-');
        const digits = raw.replace(/\D/g, '');
        if (!digits) return 0;

        const parsed = parseInt(digits, 10);
        return isNegative ? -parsed : parsed;
    },

    formatPrice(value) {
        const amount = Utils.parsePrice(value);
        const sign = amount < 0 ? '-' : '';
        const absAmount = Math.abs(amount);
        return `${sign}${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(absAmount)}`;
    },

    formatCurrency(value) {
        return `$ ${Utils.formatPrice(value)}`;
    },

    formatPriceInputValue(input) {
        if (!input) return;
        const currentValue = input.value || '';
        const cursorPosition = input.selectionStart || 0;
        const digitsBeforeCursor = currentValue.slice(0, cursorPosition).replace(/\D/g, '').length;
        const digits = currentValue.replace(/\D/g, '');

        if (!digits) {
            input.value = '';
            return;
        }

        const normalizedDigits = String(parseInt(digits, 10));
        const formatted = normalizedDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        input.value = formatted;

        if (typeof input.setSelectionRange === 'function') {
            let nextCursor = formatted.length;
            if (digitsBeforeCursor === 0) {
                nextCursor = 0;
            } else {
                let digitCount = 0;
                for (let i = 0; i < formatted.length; i++) {
                    if (/\d/.test(formatted[i])) {
                        digitCount++;
                    }
                    if (digitCount === digitsBeforeCursor) {
                        nextCursor = i + 1;
                        break;
                    }
                }
            }
            input.setSelectionRange(nextCursor, nextCursor);
        }
    },

    enablePriceInputs(root = document) {
        if (!root || typeof root.querySelectorAll !== 'function') return;

        root.querySelectorAll('[data-price-input="true"]').forEach(input => {
            if (input.dataset.priceBound === 'true') return;
            input.dataset.priceBound = 'true';
            input.setAttribute('inputmode', 'numeric');

            input.addEventListener('input', () => {
                Utils.formatPriceInputValue(input);
            });

            input.addEventListener('blur', () => {
                if (!input.value) return;
                input.value = Utils.formatPrice(input.value);
            });

            if (input.value) {
                input.value = Utils.formatPrice(input.value);
            }
        });
    },

    getCobranzaSaldo(cobranza) {
        const saldo = Utils.parsePrice(cobranza.saldo);
        if (!isNaN(saldo)) return Math.max(0, saldo);
        const total = Utils.parsePrice(cobranza.total) || 0;
        const pagado = Utils.parsePrice(cobranza.pagado) || 0;
        return Math.max(0, total - pagado);
    },

    isCobranzaPendiente(cobranza) {
        if (String(cobranza.estado || '').toLowerCase() === 'pagado') return false;
        return Utils.getCobranzaSaldo(cobranza) > 0.01;
    },

    /**
     * Abre HTML para imprimir o guardar como PDF.
     * Si el navegador bloquea ventanas emergentes, usa un iframe en la misma pestaña.
     */
    openPrintHtml(html) {
        let ventana = null;
        try {
            ventana = window.open('', '_blank', 'noopener,noreferrer');
        } catch (err) {
            ventana = null;
        }

        if (ventana && ventana.document) {
            ventana.document.open();
            ventana.document.write(html);
            ventana.document.close();
            ventana.focus();
            return { mode: 'window' };
        }

        try {
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const ventanaBlob = window.open(url, '_blank', 'noopener,noreferrer');
            if (ventanaBlob) {
                setTimeout(() => URL.revokeObjectURL(url), 60000);
                return { mode: 'blob' };
            }
            URL.revokeObjectURL(url);
        } catch (err) {
            // Continuar con iframe
        }

        let iframe = document.getElementById('reporte-print-iframe');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'reporte-print-iframe';
            iframe.setAttribute('title', 'Vista de impresión');
            iframe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;border:0;visibility:hidden';
            document.body.appendChild(iframe);
        }

        const win = iframe.contentWindow;
        if (!win || !win.document) {
            throw new Error('No se pudo abrir la vista de impresión. Permite ventanas emergentes para este sitio.');
        }

        win.document.open();
        win.document.write(html);
        win.document.close();

        const lanzarImpresion = () => {
            try {
                win.focus();
                win.print();
            } catch (err) {
                console.error('Error al imprimir:', err);
            }
        };

        setTimeout(lanzarImpresion, 400);
        return { mode: 'iframe' };
    },
    
    showModal: (title, content, onSave = null) => {
        console.log('🔵 Utils.showModal llamado');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        const modalOverlay = document.getElementById('modal-overlay');
        
        if (!modalTitle || !modalBody || !modalOverlay) {
            console.error('❌ Elementos del modal no encontrados');
            alert('Error: No se pudo abrir el modal. Verifica que los elementos existan en el HTML.');
            return;
        }
        
        modalTitle.textContent = title;
        modalBody.innerHTML = content;
        Utils.enablePriceInputs(modalBody);
        modalOverlay.classList.add('active');
        console.log('🟢 Modal mostrado');
        
        const saveBtn = document.getElementById('modal-save');
        const cancelBtn = document.getElementById('modal-cancel');
        const closeBtn = document.getElementById('modal-close');
        
        // SIEMPRE restaurar el estado inicial del botón al abrir el modal
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar';
        
        // Mostrar u ocultar botón Guardar según si hay callback onSave
        if (onSave) {
            saveBtn.style.display = 'inline-block';
        } else {
            saveBtn.style.display = 'none';
        }
        
        const closeModal = () => {
            const overlay = document.getElementById('modal-overlay');
            const btn = document.getElementById('modal-save');
            
            // Restaurar estado del botón al cerrar
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Guardar';
                btn.style.display = 'inline-block';
            }
            
            if (overlay) {
                overlay.classList.remove('active');
            }
        };
        
        // Remover listeners anteriores creando nuevos elementos
        const newSaveBtn = saveBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        const newCloseBtn = closeBtn.cloneNode(true);
        
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        
        newSaveBtn.onclick = async () => {
            if (onSave) {
                try {
                    // Deshabilitar botón mientras procesa
                    newSaveBtn.disabled = true;
                    newSaveBtn.textContent = 'Guardando...';
                    
                    await onSave();
                    
                    // Cerrar solo si todo salió bien
                    closeModal();
                } catch (error) {
                    console.error('Error en onSave:', error);
                    // Re-habilitar botón si hay error
                    newSaveBtn.disabled = false;
                    newSaveBtn.textContent = 'Guardar';
                }
            } else {
                closeModal();
            }
        };
        
        newCancelBtn.onclick = closeModal;
        newCloseBtn.onclick = closeModal;
    },
    
    showError: (message) => {
        Utils.showCustomAlert('Error', message, 'error');
    },
    
    showSuccess: (message) => {
        Utils.showCustomAlert('Éxito', message, 'success');
    },
    
    showWarning: (message) => {
        Utils.showCustomAlert('Advertencia', message, 'warning');
    },
    
    showInfo: (message) => {
        Utils.showCustomAlert('Información', message, 'info');
    },
    
    showCustomAlert: (title, message, type = 'info') => {
        try {
            console.log(`🔵 showCustomAlert llamado: ${title} - ${message} - ${type}`);
            
            const overlay = document.getElementById('custom-alert-overlay');
            const alert = overlay ? overlay.querySelector('.custom-alert') : null;
            const iconEl = document.getElementById('custom-alert-icon');
            const titleEl = document.getElementById('custom-alert-title');
            const messageEl = document.getElementById('custom-alert-message');
            const btnEl = document.getElementById('custom-alert-btn');
            
            // Validar que todos los elementos existan
            if (!overlay || !alert || !iconEl || !titleEl || !messageEl || !btnEl) {
                console.error('❌ Elementos del modal de alerta no encontrados:', {
                    overlay: !!overlay,
                    alert: !!alert,
                    iconEl: !!iconEl,
                    titleEl: !!titleEl,
                    messageEl: !!messageEl,
                    btnEl: !!btnEl
                });
                // Fallback a alert nativo
                window.alert(`${title}: ${message}`);
                return;
            }
            
            // Remover clases de tipo previas
            iconEl.classList.remove('success', 'error', 'warning', 'info');
            iconEl.classList.add(type);
            
            // Iconos según tipo
            const icons = {
                success: '✅',
                error: '❌',
                warning: '⚠️',
                info: 'ℹ️'
            };
            
            iconEl.innerHTML = `<span>${icons[type] || icons.info}</span>`;
            titleEl.textContent = title;
            messageEl.textContent = message;
            
            overlay.classList.add('active');
            console.log('✅ Modal de alerta mostrado');
            
            // Crear nuevo botón para evitar múltiples listeners
            const newBtn = btnEl.cloneNode(true);
            btnEl.parentNode.replaceChild(newBtn, btnEl);
            
            newBtn.onclick = () => {
                overlay.classList.remove('active');
                console.log('🔵 Modal de alerta cerrado');
            };
            
            // Cerrar con Escape
            const escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    overlay.classList.remove('active');
                    document.removeEventListener('keydown', escapeHandler);
                }
            };
            document.addEventListener('keydown', escapeHandler);
        } catch (error) {
            console.error('❌ Error en showCustomAlert:', error);
            console.error('❌ Stack trace:', error.stack);
            // Fallback a alert nativo
            window.alert(`${title}: ${message}`);
        }
    },
    
    showConfirm: (message, onConfirm, onCancel = null) => {
        return new Promise((resolve) => {
            try {
                const overlay = document.getElementById('custom-confirm-overlay');
                const messageEl = document.getElementById('custom-confirm-message');
                const acceptBtn = document.getElementById('custom-confirm-accept');
                const cancelBtn = document.getElementById('custom-confirm-cancel');
                
                // Validar que todos los elementos existan
                if (!overlay || !messageEl || !acceptBtn || !cancelBtn) {
                    console.error('❌ Elementos del modal de confirmación no encontrados');
                    // Fallback a confirm nativo del navegador
                    const result = window.confirm(message);
                    resolve(result);
                    if (result && onConfirm) {
                        onConfirm();
                    } else if (!result && onCancel) {
                        onCancel();
                    }
                    return;
                }
                
                messageEl.textContent = message;
                overlay.classList.add('active');
                
                // Crear nuevos botones para evitar múltiples listeners
                const newAcceptBtn = acceptBtn.cloneNode(true);
                const newCancelBtn = cancelBtn.cloneNode(true);
                acceptBtn.parentNode.replaceChild(newAcceptBtn, acceptBtn);
                cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
                
                const closeConfirm = (result) => {
                    overlay.classList.remove('active');
                    resolve(result);
                    if (result && onConfirm) {
                        onConfirm();
                    } else if (!result && onCancel) {
                        onCancel();
                    }
                };
                
                newAcceptBtn.onclick = () => closeConfirm(true);
                newCancelBtn.onclick = () => closeConfirm(false);
                
                // Cerrar con Escape
                const escapeHandler = (e) => {
                    if (e.key === 'Escape') {
                        closeConfirm(false);
                        document.removeEventListener('keydown', escapeHandler);
                    }
                };
                document.addEventListener('keydown', escapeHandler);
            } catch (error) {
                console.error('❌ Error en showConfirm:', error);
                // Fallback a confirm nativo
                const result = window.confirm(message);
                resolve(result);
                if (result && onConfirm) {
                    onConfirm();
                } else if (!result && onCancel) {
                    onCancel();
                }
            }
        });
    },
    
    showLoader: () => {
        const loader = document.getElementById('global-loader');
        if (loader) {
            loader.style.display = 'flex';
        }
    },
    
    hideLoader: () => {
        const loader = document.getElementById('global-loader');
        if (loader) {
            loader.style.display = 'none';
        }
    },
    
    // Utilidades para botones con loader
    setButtonLoading: (button, isLoading = true, loadingText = 'Cargando...') => {
        if (!button) return;
        
        if (isLoading) {
            // Guardar texto original si no existe
            if (!button.dataset.originalText) {
                button.dataset.originalText = button.innerHTML;
            }
            
            // Deshabilitar y mostrar loading
            button.disabled = true;
            button.classList.add('loading');
            
            // Crear spinner
            const spinner = '<span class="btn-spinner"></span>';
            button.innerHTML = `${spinner} <span class="btn-text">${loadingText}</span>`;
        } else {
            // Restaurar estado original
            button.disabled = false;
            button.classList.remove('loading');
            
            if (button.dataset.originalText) {
                button.innerHTML = button.dataset.originalText;
                delete button.dataset.originalText;
            }
        }
    },
    
    // Wrapper para ejecutar funciones async con loader en botón
    withButtonLoader: async (button, asyncFn, loadingText = 'Cargando...') => {
        try {
            Utils.setButtonLoading(button, true, loadingText);
            const result = await asyncFn();
            return result;
        } catch (error) {
            console.error('Error en withButtonLoader:', error);
            throw error;
        } finally {
            Utils.setButtonLoading(button, false);
        }
    }
};

// API Client
const API = {
    async request(endpoint, method = 'GET', data = null) {
        // Usar JSONP para evitar completamente problemas de CORS con Google Apps Script
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, value) => {
                if (settled) return;
                settled = true;
                fn(value);
            };
            
            // Crear un nombre único para el callback
            const callbackName = 'apiCallback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            console.log(`🚀 Enviando petición: ${method} ${endpoint}`, data);
            
            // Construir URL con todos los parámetros
            let url = `${API_CONFIG.baseUrl}?endpoint=${encodeURIComponent(endpoint)}&method=${encodeURIComponent(method)}&apiKey=${encodeURIComponent(API_CONFIG.apiKey)}&callback=${callbackName}`;
            
            // Timeout configurable (por defecto 30 segundos, pero puede ser sobrescrito)
            // Extraer timeout antes de agregar parámetros a la URL
            const timeoutMs = data?.__timeout || 30000;
            
            // Agregar todos los parámetros a la URL (excluyendo __timeout que es solo para configuración)
            if (data) {
                console.log('📦 Datos a enviar en URL:', data);
                Object.keys(data).forEach(key => {
                    // Ignorar __timeout ya que es solo para configuración interna
                    if (key === '__timeout') {
                        console.log('⏱️ Ignorando __timeout (configuración interna)');
                        return;
                    }
                    
                    if (data[key] !== null && data[key] !== undefined) {
                        // Si el valor es un objeto, convertirlo a JSON string
                        const value = typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key];
                        console.log(`📤 Agregando parámetro a URL: ${key} = ${value} (tipo: ${typeof value})`);
                        url += `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
                    } else {
                        console.warn(`⚠️ Parámetro ${key} es null o undefined, no se agregará a la URL`);
                    }
                });
            }
            
            console.log(`📡 URL completa: ${url.substring(0, 200)}...`);
            console.log(`⏱️ Timeout configurado: ${timeoutMs}ms`);
            
            // Crear la función callback global
            window[callbackName] = (response) => {
                console.log('📥 Respuesta de API recibida:', response);
                
                // Limpiar el callback
                delete window[callbackName];
                
                // Remover el script tag
                if (scriptTag && scriptTag.parentNode) {
                    scriptTag.parentNode.removeChild(scriptTag);
                }
                
                // Limpiar timeout
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                
                // Procesar respuesta
                if (!response) {
                    console.error('❌ Respuesta vacía o undefined');
                    finish(reject, new Error('No se recibió respuesta del servidor'));
                    return;
                }
                
                if (response.success === true || response.success === 'true') {
                    console.log('✅ Respuesta exitosa, datos:', response.data);
                    // Si es un POST/PUT/DELETE y data es un array vacío, puede ser un problema
                    if (Array.isArray(response.data) && response.data.length === 0 && response.method && response.method !== 'GET') {
                        console.warn('⚠️ Advertencia: Respuesta exitosa pero sin datos en operación', response.method);
                    }
                    finish(resolve, response.data || response);
                } else {
                    const errorMsg = response?.error || response?.message || 'Error en la petición';
                    console.error('❌ Error en respuesta:', errorMsg, response);
                    finish(reject, new Error(errorMsg));
                }
            };
            
            // Crear script tag para JSONP
            const scriptTag = document.createElement('script');
            scriptTag.src = url;
            scriptTag.async = true;
            
            // Manejar errores de carga del script
            scriptTag.onerror = () => {
                delete window[callbackName];
                if (scriptTag.parentNode) {
                    scriptTag.parentNode.removeChild(scriptTag);
                }
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                const hint = endpoint === 'cierre'
                    ? ' El cierre puede tardar hasta 2 minutos. Si falla al instante, revisá la URL de la Web App en auth.js y volvé a publicar Code.gs.'
                    : '';
                finish(reject, new Error(
                    'No se pudo conectar con el servidor (respuesta inválida o URL incorrecta).' + hint +
                    ' Verificá internet y que la Web App esté publicada como "Cualquiera".'
                ));
            };
            
            // Configurar timeout
            const timeoutId = setTimeout(() => {
                delete window[callbackName];
                if (scriptTag.parentNode) {
                    scriptTag.parentNode.removeChild(scriptTag);
                }
                finish(reject, new Error(
                    `La operación tardó más de ${timeoutMs / 1000} segundos. ` +
                    (endpoint === 'cierre'
                        ? 'El cierre del día es pesado: esperá y probá de nuevo, o revisá los logs en Google Apps Script.'
                        : 'Intentá nuevamente.')
                ));
            }, timeoutMs);
            
            // Agregar script al documento
            document.head.appendChild(scriptTag);
        });
    },
    
    // Clientes
    async getClientes() {
        const cacheKey = 'clientes';
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;
        
        const data = await this.request('clientes', 'GET');
        CacheManager.set(cacheKey, data);
        return data;
    },
    
    async createCliente(data) {
        const result = await this.request('clientes', 'POST', data);
        CacheManager.invalidate('clientes');
        return result;
    },
    
    async updateCliente(id, data) {
        data.id = id;
        const result = await this.request('clientes/update', 'POST', data);
        CacheManager.invalidate('clientes');
        return result;
    },
    
    async deleteCliente(id) {
        const result = await this.request('clientes/delete', 'POST', { id });
        CacheManager.invalidate('clientes');
        return result;
    },
    
    // Proveedores
    async getProveedores() {
        const cacheKey = 'proveedores';
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;
        
        const data = await this.request('proveedores', 'GET');
        CacheManager.set(cacheKey, data);
        return data;
    },
    
    async createProveedor(data) {
        const result = await this.request('proveedores', 'POST', data);
        CacheManager.invalidate('proveedores');
        return result;
    },
    
    async updateProveedor(id, data) {
        data.id = id;
        const result = await this.request('proveedores/update', 'POST', data);
        CacheManager.invalidate('proveedores');
        return result;
    },
    
    async deleteProveedor(id) {
        const result = await this.request('proveedores/delete', 'POST', { id });
        CacheManager.invalidate('proveedores');
        return result;
    },
    
    // Productos
    async getProductos() {
        const cacheKey = 'productos';
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;
        
        const data = await this.request('productos', 'GET');
        CacheManager.set(cacheKey, data);
        return data;
    },
    
    async createProducto(data) {
        const result = await this.request('productos', 'POST', data);
        CacheManager.invalidate('productos');
        return result;
    },
    
    async updateProducto(id, data) {
        data.id = id;
        const result = await this.request('productos/update', 'POST', data);
        CacheManager.invalidate('productos');
        return result;
    },
    
    async deleteProducto(id) {
        const result = await this.request('productos/delete', 'POST', { id });
        CacheManager.invalidate('productos');
        return result;
    },
    
    // Pedidos
    async getPedidos(fecha = null) {
        const cacheKey = fecha ? `pedidos:${fecha}` : 'pedidos';
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;
        
        const data = fecha ? { fecha } : null;
        const result = await this.request('pedidos', 'GET', data);
        CacheManager.set(cacheKey, result);
        return result;
    },
    
    async createPedido(data) {
        const result = await this.request('pedidos', 'POST', data);
        CacheManager.invalidatePattern('pedidos');
        CacheManager.invalidatePattern('estadisticas');
        return result;
    },
    
    async deletePedido(id) {
        const result = await this.request('pedidos/delete', 'POST', { id });
        CacheManager.invalidatePattern('pedidos');
        return result;
    },

    async getTopProductosVendidos(dias = 7, limite = 5) {
        const cacheKey = `estadisticas:top-productos:${dias}:${limite}`;
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;

        const result = await this.request('estadisticas/productos-mas-vendidos', 'GET', { dias, limite });
        CacheManager.set(cacheKey, result);
        return result;
    },
    
    async marcarPedidosEnviados(fecha) {
        const result = await this.request('pedidos/marcar-enviados', 'POST', { fecha });
        CacheManager.invalidatePattern('pedidos');
        return result;
    },
    
    async marcarPedidosEnviadosPorIds(pedidosIds) {
        const result = await this.request('pedidos/marcar-enviados-por-ids', 'POST', { pedidosIds });
        CacheManager.invalidatePattern('pedidos');
        return result;
    },
    
    // Recepción
    async getRecepcion(fecha = null) {
        const cacheKey = fecha ? `recepcion:${fecha}` : 'recepcion';
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;
        
        const data = fecha ? { fecha } : null;
        const result = await this.request('recepcion', 'GET', data);
        CacheManager.set(cacheKey, result);
        return result;
    },
    
    async saveRecepcion(data) {
        const result = await this.request('recepcion', 'POST', data);
        CacheManager.invalidatePattern('recepcion');
        return result;
    },
    
    async confirmarRecepcion(fecha) {
        const result = await this.request('recepcion/confirmar', 'POST', { fecha });
        CacheManager.invalidatePattern('recepcion');
        return result;
    },
    
    // Precios
    async getPreciosCliente(fecha = null) {
        const cacheKey = fecha ? `precios:${fecha}` : 'precios';
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;
        
        const data = fecha ? { fecha } : null;
        const result = await this.request('precios-cliente', 'GET', data);
        CacheManager.set(cacheKey, result);
        return result;
    },
    
    async savePreciosCliente(data) {
        const result = await this.request('precios-cliente', 'POST', data);
        CacheManager.invalidatePattern('precios');
        return result;
    },
    
    // Cierre
    async cerrarDia(fecha) {
        // Validar que la fecha esté presente
        if (!fecha) {
            throw new Error('La fecha es requerida para cerrar el día');
        }
        
        // Validar formato de fecha (debe ser YYYY-MM-DD)
        if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            console.error('❌ Fecha inválida:', fecha);
            throw new Error('Formato de fecha inválido. Debe ser YYYY-MM-DD');
        }
        
        console.log('📅 API.cerrarDia - Fecha a enviar:', fecha);
        console.log('📅 API.cerrarDia - Tipo de fecha:', typeof fecha);
        console.log('📅 API.cerrarDia - AppState.currentDate:', AppState.currentDate);
        
        // El cierre del día puede tardar más tiempo, usar un timeout de 60 segundos
        // Pasamos el timeout como un campo especial que se removerá antes de enviar
        const dataWithTimeout = { fecha, __timeout: 120000 };
        const result = await this.request('cierre', 'POST', dataWithTimeout);
        // Invalidar todo el caché porque el cierre afecta múltiples datos
        CacheManager.clear();
        return result;
    },
    
    async getCierres() {
        const cacheKey = 'historial';
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;
        
        const result = await this.request('cierre', 'GET');
        CacheManager.set(cacheKey, result);
        return result;
    },
    
    // Cobranzas
    async getCobranzas(fecha = null, clienteId = null) {
        const cacheKey = `cobranzas:${fecha || 'all'}:${clienteId || 'all'}`;
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;
        
        const data = {};
        if (fecha) data.fecha = fecha;
        if (clienteId) data.cliente_id = clienteId;
        const result = await this.request('cobranzas', 'GET', Object.keys(data).length > 0 ? data : null);
        CacheManager.set(cacheKey, result);
        return result;
    },
    
    async registrarCobro(data) {
        const result = await this.request('cobranzas', 'POST', data);
        CacheManager.invalidatePattern('cobranzas');
        return result;
    },
    
    // Pagos
    async getPagosProveedores() {
        const cacheKey = 'pagos-proveedores';
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;
        
        const result = await this.request('pagos-proveedores', 'GET');
        CacheManager.set(cacheKey, result);
        return result;
    },
    
    async registrarPago(data) {
        const result = await this.request('pagos-proveedores', 'POST', data);
        CacheManager.invalidatePattern('pagos-proveedores');
        CacheManager.invalidate('proveedores'); // Los saldos cambian
        return result;
    },
    
    // Stock
    async getStock() {
        const cacheKey = 'stock';
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;
        
        const result = await this.request('stock', 'GET');
        CacheManager.set(cacheKey, result);
        return result;
    },
    
    async updateStock(productoId, cantidad) {
        const result = await this.request('stock', 'PUT', { producto_id: productoId, cantidad });
        CacheManager.invalidate('stock');
        return result;
    },

    async deleteStock(productoId) {
        const result = await this.request('stock/delete', 'POST', { producto_id: productoId });
        CacheManager.invalidate('stock');
        return result;
    },
    
    // Notificaciones
    async verificarStockBajo() {
        const result = await this.request('notificaciones/verificar-stock', 'POST');
        return result;
    },
    
    async getConfiguracionNotificaciones() {
        const result = await this.request('notificaciones/config', 'GET');
        return result;
    },
    
    async saveConfiguracionNotificaciones(data) {
        const result = await this.request('notificaciones/config', 'POST', data);
        return result;
    },
    
    // Caja
    async getCajaMovimientos() {
        const cacheKey = 'caja';
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;
        
        const result = await this.request('caja', 'GET');
        CacheManager.set(cacheKey, result);
        return result;
    },
    
    async createCajaMovimiento(data) {
        const result = await this.request('caja', 'POST', data);
        CacheManager.invalidate('caja');
        return result;
    },
    
    // Historial
    async getHistorial() {
        const cacheKey = 'historial';
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;
        
        const result = await this.request('historial', 'GET');
        CacheManager.set(cacheKey, result);
        return result;
    },

    async deleteHistorial(id) {
        const result = await this.request('historial/delete', 'POST', { id });
        CacheManager.invalidate('historial');
        return result;
    }
};

// Navegación
const Navigation = {
    init() {
        // Inicializar categorías desplegables
        document.querySelectorAll('.nav-category-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                const category = toggle.parentElement;
                
                // Cerrar otras categorías
                document.querySelectorAll('.nav-category').forEach(cat => {
                    if (cat !== category) {
                        cat.classList.remove('active');
                    }
                });
                
                // Toggle categoría actual
                category.classList.toggle('active');
            });
        });
        
        // Inicializar links de navegación
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                // currentTarget = el <a>; e.target puede ser badge/label sin data-page
                const linkEl = e.currentTarget;
                const page = linkEl.getAttribute('data-page');
                if (page) {
                    this.navigateTo(page);
                }
            });
        });
    },
    
    navigateTo(page) {
        if (!page) return;

        // Actualizar navegación
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        const activeLink = document.querySelector(`.nav-link[data-page="${page}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
            // Mantener abierta la categoría del flujo (o config/historial)
            const category = activeLink.closest('.nav-category');
            if (category) {
                category.classList.add('active');
            }
        }
        
        // Ocultar todas las páginas
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });
        
        // Mostrar página seleccionada
        const pageEl = document.getElementById(page);
        if (!pageEl) {
            console.error('Página no encontrada:', page);
            Utils.showError('No se encontró la pantalla solicitada.');
            return;
        }
        pageEl.classList.add('active');
        
        // Actualizar título
        const titles = {
            dashboard: 'Dashboard',
            clientes: 'Clientes',
            productos: 'Productos',
            proveedores: 'Proveedores',
            pedidos: 'Pedidos del día',
            'proveedores-pedido': 'Pedido a proveedores',
            recepcion: 'Confirmación de lo que llegó',
            precios: 'Precios al cliente',
            cierre: 'Cierre del día',
            cobranzas: 'Cobranzas pendientes',
            pagos: 'Proveedores (saldos)',
            stock: 'Stock de bebidas',
            historial: 'Historial de días'
        };
        document.getElementById('page-title').textContent = titles[page] || 'Dashboard';
        
        // Cargar datos de la página
        this.loadPageData(page);
    },
    
    async loadPageData(page) {
        try {
            switch(page) {
                case 'dashboard':
                    await Dashboard.load();
                    break;
                case 'clientes':
                    await Clientes.load();
                    break;
                case 'productos':
                    await Productos.load();
                    break;
                case 'proveedores':
                    await ProveedoresGestion.load();
                    break;
                case 'pedidos':
                    await Pedidos.load();
                    break;
                case 'proveedores-pedido':
                    await ProveedoresPedido.load();
                    break;
                case 'recepcion':
                    await Recepcion.load();
                    break;
                case 'precios':
                    await Precios.load();
                    break;
                case 'cierre':
                    await Cierre.load();
                    break;
                case 'cobranzas':
                    await Cobranzas.load();
                    break;
                case 'pagos':
                    await Pagos.load();
                    break;
                case 'stock':
                    await Stock.load();
                    break;
                case 'historial':
                    await Historial.load();
                    break;
            }
        } catch (error) {
            console.error('Error loading page:', error);
        }
    }
};

// Dashboard
const Dashboard = {
    chart: null,
    
    async load() {
        try {
            // Cargar datos en paralelo
            const [pedidos, cobranzas, stock] = await Promise.all([
                API.getPedidos(AppState.currentDate).catch(() => []),
                API.getCobranzas().catch(() => []),
                API.getStock().catch(() => [])
            ]);
            
            // Actualizar contadores
            this.updateCounters(pedidos, cobranzas, stock);
            
            // Cargar gráfico de productos más vendidos
            await this.loadTopProductsChart();
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    },
    
    updateCounters(pedidos, cobranzas, stock) {
        // Pedidos del día
        const pedidosCount = pedidos.length || 0;
        document.getElementById('dashboard-pedidos-count').textContent = pedidosCount;
        
        // Cobranzas pendientes (saldo real por cobrar, todas las fechas)
        const cobranzasPendientes = cobranzas.filter(c => Utils.isCobranzaPendiente(c));
        const totalCobranzas = cobranzasPendientes.reduce((sum, c) => sum + Utils.getCobranzaSaldo(c), 0);
        document.getElementById('dashboard-cobranzas-count').textContent = Utils.formatCurrency(totalCobranzas);
        
        // Proveedores a pagar
        const proveedores = AppState.proveedores || [];
        const totalPagos = proveedores.reduce((sum, p) => sum + Utils.parsePrice(p.saldo), 0);
        document.getElementById('dashboard-pagos-count').textContent = Utils.formatCurrency(totalPagos);
        
        // Stock bajo
        const stockBajo = stock.filter(item => item.stock_actual <= item.minimo);
        document.getElementById('dashboard-stock-count').textContent = stockBajo.length || 0;
    },
    
    async loadTopProductsChart() {
        this.showChartLoader();

        try {
            let top5 = await API.getTopProductosVendidos(7, 5).catch(() => null);
            if (!top5 || !Array.isArray(top5)) {
                top5 = await this.aggregateTopProductosLocal(7, 5);
            }

            const labels = top5.map(p => p.nombre);
            const data = top5.map(p => p.cantidad);

            this.hideChartLoader();
            this.renderChart(labels, data);
        } catch (error) {
            console.error('Error loading chart:', error);
            this.hideChartLoader();
            this.renderChart([], []);
        }
    },

    async aggregateTopProductosLocal(dias, limite) {
        const fechaLimite = new Date();
        fechaLimite.setHours(0, 0, 0, 0);
        fechaLimite.setDate(fechaLimite.getDate() - dias);

        const productos = AppState.productos && AppState.productos.length > 0
            ? AppState.productos
            : await API.getProductos().catch(() => []);
        const productosMap = {};
        productos.forEach(p => { productosMap[p.id] = p; });

        const pedidos = await API.getPedidos().catch(() => []);
        const contador = {};

        pedidos.forEach(pedido => {
            const producto = productosMap[pedido.producto_id];
            if (!producto) return;

            const fechaPedido = new Date(pedido.fecha);
            if (isNaN(fechaPedido.getTime()) || fechaPedido < fechaLimite) return;

            contador[producto.id] = (contador[producto.id] || 0) + (parseFloat(pedido.cantidad) || 0);
        });

        return Object.entries(contador)
            .map(([id, cantidad]) => ({
                nombre: productosMap[id].nombre,
                cantidad
            }))
            .sort((a, b) => b.cantidad - a.cantidad)
            .slice(0, limite);
    },
    
    showChartLoader() {
        const chartContainer = document.querySelector('.chart-container');
        if (!chartContainer) return;
        
        // Crear overlay de loader
        let overlay = chartContainer.querySelector('.local-loader-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'local-loader-overlay';
            overlay.innerHTML = `
                <div class="local-loader-spinner"></div>
            `;
            chartContainer.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },
    
    hideChartLoader() {
        const chartContainer = document.querySelector('.chart-container');
        if (!chartContainer) return;
        
        const overlay = chartContainer.querySelector('.local-loader-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },
    
    renderChart(labels, data) {
        const ctx = document.getElementById('topProductsChart');
        if (!ctx) return;

        if (this.chart) {
            this.chart.destroy();
        }

        const sinDatos = !labels || labels.length === 0;
        const chartLabels = sinDatos ? ['Sin ventas en la última semana'] : labels;
        const chartData = sinDatos ? [0] : data;

        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: 'Unidades vendidas',
                    data: chartData,
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(96, 165, 250, 0.8)',
                        'rgba(147, 197, 253, 0.8)',
                        'rgba(191, 219, 254, 0.8)',
                        'rgba(219, 234, 254, 0.8)'
                    ],
                    borderColor: [
                        'rgb(59, 130, 246)',
                        'rgb(96, 165, 250)',
                        'rgb(147, 197, 253)',
                        'rgb(191, 219, 254)',
                        'rgb(219, 234, 254)'
                    ],
                    borderWidth: 2,
                    borderRadius: 6,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: 'rgba(59, 130, 246, 0.5)',
                        borderWidth: 1,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return context.parsed.x + ' unidades';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#6b7280',
                            font: {
                                size: 12,
                                weight: '500'
                            }
                        }
                    },
                    y: {
                        grid: {
                            display: false,
                            drawBorder: false
                        },
                        ticks: {
                            color: '#374151',
                            font: {
                                size: 13,
                                weight: '600'
                            }
                        }
                    }
                }
            }
        });
    }
};

// Clientes
const Clientes = {
    async load() {
        const tbody = document.getElementById('clientes-tbody');
        if (!tbody) return;
        
        // Mostrar loader local
        this.showLocalLoader(tbody);
        
        try {
            AppState.clientes = await API.getClientes();
            console.log('🔵 Clientes cargados:', AppState.clientes.length);
            // Debug: mostrar tipos de datos de 'activo' para cada cliente
            AppState.clientes.forEach((c, i) => {
                if (i < 3) { // Solo los primeros 3 para no saturar la consola
                    console.log(`Cliente ${i}: ${c.nombre}, activo tipo: ${typeof c.activo}, valor: ${c.activo}`);
                }
            });
            this.render();
        } catch (error) {
            console.error('Error loading clientes:', error);
            this.hideLocalLoader(tbody);
        }
    },
    
    showLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        // Crear overlay de loader
        let overlay = parent.querySelector('.local-loader-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'local-loader-overlay';
            overlay.innerHTML = `
                <div class="local-loader-spinner"></div>
            `;
            parent.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },
    
    hideLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        const overlay = parent.querySelector('.local-loader-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },
    
    render() {
        const tbody = document.getElementById('clientes-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        this.hideLocalLoader(tbody);
        
        if (AppState.clientes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No hay clientes registrados</td></tr>';
            return;
        }
        
        // Construir todo el HTML de una sola vez para minimizar operaciones DOM
        let rowsHtml = '';
        
        AppState.clientes.forEach(cliente => {
            const esActivo = cliente.activo === true || cliente.activo === 'true' || cliente.activo === 1;
            const inactiveStyle = !esActivo ? ' style="opacity:0.6;background-color:#f8f9fa;"' : '';
            
            rowsHtml += `
                <tr${inactiveStyle}>
                    <td>${cliente.nombre || ''}</td>
                    <td>${cliente.telefono || ''}</td>
                    <td><span class="status-badge ${esActivo ? 'status-activo' : 'status-inactivo'}">${esActivo ? 'Activo' : 'Inactivo'}</span></td>
                    <td>
                        <button class="btn btn-secondary" onclick="Clientes.edit('${cliente.id}')">Editar</button>
                        <button class="btn ${esActivo ? 'btn-secondary' : 'btn-primary'}" onclick="Clientes.toggleActivo('${cliente.id}', ${esActivo})">${esActivo ? 'Desactivar' : 'Activar'}</button>
                        <button class="btn btn-danger" onclick="Clientes.delete('${cliente.id}')">Eliminar</button>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = rowsHtml;
    },
    
    async add() {
        console.log('🔵 Clientes.add() llamado');
        const content = `
            <div class="form-group">
                <label>Nombre</label>
                <input type="text" id="modal-cliente-nombre" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Teléfono</label>
                <input type="text" id="modal-cliente-telefono" class="form-control">
            </div>
        `;
        
        console.log('🔵 Mostrando modal...');
        Utils.showModal('Agregar cliente', content, async () => {
            const nombre = document.getElementById('modal-cliente-nombre').value.trim();
            const telefono = document.getElementById('modal-cliente-telefono').value.trim();
            
            if (!nombre) {
                Utils.showError('El nombre es obligatorio');
                return;
            }
            
            Utils.showLoader();
            try {
                const result = await API.createCliente({
                    nombre: nombre,
                    telefono: telefono
                });
                
                console.log('✅ Cliente creado, resultado:', result);
                
                if (result && (result.success !== false)) {
                    Utils.showSuccess('Cliente agregado correctamente');
                    await Clientes.load();
                } else {
                    throw new Error(result?.error || 'No se pudo crear el cliente');
                }
            } catch (error) {
                console.error('❌ Error creating cliente:', error);
                Utils.showError('Error al crear cliente: ' + error.message);
            } finally {
                Utils.hideLoader();
            }
        });
    },
    
    async edit(id) {
        const cliente = AppState.clientes.find(c => c.id === id);
        if (!cliente) {
            Utils.showError('Cliente no encontrado');
            return;
        }
        
        const content = `
            <div class="form-group">
                <label>Nombre</label>
                <input type="text" id="modal-cliente-nombre" class="form-control" value="${cliente.nombre || ''}" required>
            </div>
            <div class="form-group">
                <label>Teléfono</label>
                <input type="text" id="modal-cliente-telefono" class="form-control" value="${cliente.telefono || ''}">
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="modal-cliente-activo" ${cliente.activo ? 'checked' : ''}>
                    Activo
                </label>
            </div>
        `;
        
        Utils.showModal('Editar cliente', content, async () => {
            const nombre = document.getElementById('modal-cliente-nombre').value.trim();
            const telefono = document.getElementById('modal-cliente-telefono').value.trim();
            const activo = document.getElementById('modal-cliente-activo').checked;
            
            if (!nombre) {
                Utils.showError('El nombre es obligatorio');
                return;
            }
            
            Utils.showLoader();
            try {
                await API.updateCliente(id, {
                    nombre: nombre,
                    telefono: telefono,
                    activo: activo
                });
                
                Utils.showSuccess('Cliente actualizado correctamente');
                await Clientes.load();
            } catch (error) {
                console.error('Error updating cliente:', error);
                Utils.showError('Error al actualizar cliente: ' + error.message);
            } finally {
                Utils.hideLoader();
            }
        });
    },
    
    async toggleActivo(id, activoActual) {
        const cliente = AppState.clientes.find(c => c.id === id);
        if (!cliente) {
            Utils.showError('Cliente no encontrado');
            return;
        }
        
        // Debug logs
        console.log('🔵 toggleActivo - ID:', id);
        console.log('🔵 toggleActivo - activoActual tipo:', typeof activoActual, 'valor:', activoActual);
        console.log('🔵 toggleActivo - cliente.activo tipo:', typeof cliente.activo, 'valor:', cliente.activo);
        
        // Convertir activoActual a booleano explícitamente
        const activoBoolean = activoActual === true || activoActual === 'true';
        const nuevoEstado = !activoBoolean;
        
        console.log('🔵 toggleActivo - nuevo estado:', nuevoEstado);
        
        const accion = activoBoolean ? 'desactivar' : 'activar';
        const confirmar = await Utils.showConfirm(`¿Está seguro de ${accion} este cliente?`);
        if (!confirmar) return;
        
        Utils.showLoader();
        try {
            const dataToSend = {
                nombre: cliente.nombre,
                telefono: cliente.telefono,
                activo: nuevoEstado
            };
            
            console.log('🔵 toggleActivo - enviando datos:', dataToSend);
            
            await API.updateCliente(id, dataToSend);
            
            Utils.showSuccess(`Cliente ${activoBoolean ? 'desactivado' : 'activado'} correctamente`);
            await this.load();
        } catch (error) {
            console.error('❌ Error toggling cliente activo:', error);
            Utils.showError('Error al cambiar estado del cliente: ' + error.message);
        } finally {
            Utils.hideLoader();
        }
    },
    
    async delete(id) {
        const cliente = AppState.clientes.find(c => c.id === id);
        if (!cliente) {
            Utils.showError('Cliente no encontrado');
            return;
        }
        
        const confirmMsg = `⚠️ ADVERTENCIA: ¿Está seguro de ELIMINAR permanentemente a "${cliente.nombre}"?\n\nEsta acción NO se puede deshacer y se eliminarán:\n- Todos los pedidos de este cliente\n- Todas las cobranzas asociadas\n- Todo el historial\n\n¿Desea continuar?`;
        
        const confirmar = await Utils.showConfirm(confirmMsg);
        if (!confirmar) return;
        
        Utils.showLoader();
        try {
            await API.deleteCliente(id);
            Utils.showSuccess('Cliente eliminado correctamente');
            await this.load();
        } catch (error) {
            console.error('Error deleting cliente:', error);
            Utils.showError('Error al eliminar cliente: ' + error.message);
        } finally {
            Utils.hideLoader();
        }
    }
};

// Productos
const Productos = {
    async load() {
        const tbody = document.getElementById('productos-tbody');
        if (!tbody) return;
        
        // Mostrar loader local
        this.showLocalLoader(tbody);
        
        try {
            // Cargar datos en paralelo si es necesario
            const promises = [];
            
            if (!AppState.productos || AppState.productos.length === 0) {
                promises.push(API.getProductos().then(data => { AppState.productos = data; }));
            }
            
            if (!AppState.proveedores || AppState.proveedores.length === 0) {
                promises.push(API.getProveedores().then(data => { AppState.proveedores = data; }));
            }
            
            // Esperar solo si hay datos que cargar
            if (promises.length > 0) {
                await Promise.all(promises);
            }
            
            this.render();
        } catch (error) {
            console.error('Error loading productos:', error);
            this.hideLocalLoader(tbody);
            Utils.showError('Error al cargar productos');
        }
    },
    
    showLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        // Crear overlay de loader
        let overlay = parent.querySelector('.local-loader-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'local-loader-overlay';
            overlay.innerHTML = `
                <div class="local-loader-spinner"></div>
            `;
            parent.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },
    
    hideLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        const overlay = parent.querySelector('.local-loader-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },
    
    render() {
        const tbody = document.getElementById('productos-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        this.hideLocalLoader(tbody);
        
        if (AppState.productos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay productos registrados. Agregue productos para poder crear pedidos.</td></tr>';
            return;
        }
        
        let rowsHtml = '';
        
        AppState.productos.forEach(producto => {
            const proveedor = AppState.proveedores.find(p => p.id === producto.proveedor_default);
            const tipoBadgeClass = producto.tipo === 'verdura' ? 'status-activo' : 'status-pendiente';
            
            rowsHtml += `
                <tr>
                    <td>${producto.nombre || ''}</td>
                    <td><span class="status-badge ${tipoBadgeClass}">${producto.tipo || ''}</span></td>
                    <td>${producto.unidad || ''}</td>
                    <td>${proveedor ? proveedor.nombre : 'Sin proveedor'}</td>
                    <td>
                        <button class="btn btn-secondary" onclick="Productos.edit('${producto.id}')">Editar</button>
                        <button class="btn btn-danger" onclick="Productos.delete('${producto.id}')">Eliminar</button>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = rowsHtml;
    },
    
    async add() {
        // Cargar proveedores si es necesario
        if (!AppState.proveedores || AppState.proveedores.length === 0) {
            AppState.proveedores = await API.getProveedores();
        }
        
        const proveedores = AppState.proveedores || [];
        
        const content = `
            <div class="form-group">
                <label>Nombre del producto</label>
                <input type="text" id="modal-producto-nombre" class="form-control" placeholder="Ej: Tomate, Coca Cola 1.5L" required>
            </div>
            <div class="form-group">
                <label>Tipo</label>
                <select id="modal-producto-tipo" class="form-control" required>
                    <option value="">Seleccionar...</option>
                    <option value="verdura">Verdura</option>
                    <option value="bebida">Bebida</option>
                </select>
            </div>
            <div class="form-group">
                <label>Unidad de medida</label>
                <select id="modal-producto-unidad" class="form-control" required>
                    <option value="">Seleccionar...</option>
                    <option value="kg">Kilogramo (kg)</option>
                    <option value="unidad">Unidad</option>
                    <option value="caja">Caja</option>
                    <option value="docena">Docena</option>
                    <option value="litro">Litro</option>
                </select>
            </div>
            <div class="form-group">
                <label>Proveedor predeterminado</label>
                <select id="modal-producto-proveedor" class="form-control">
                    <option value="">Sin proveedor</option>
                    ${proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
                </select>
                <small>Si no tienes proveedores, puedes agregarlo después</small>
            </div>
        `;
        
        Utils.showModal('Agregar producto', content, async () => {
            const nombre = document.getElementById('modal-producto-nombre').value.trim();
            const tipo = document.getElementById('modal-producto-tipo').value;
            const unidad = document.getElementById('modal-producto-unidad').value;
            const proveedorId = document.getElementById('modal-producto-proveedor').value;
            
            if (!nombre || !tipo || !unidad) {
                Utils.showError('Complete todos los campos obligatorios');
                return;
            }
            
            try {
                const result = await API.createProducto({
                    nombre: nombre,
                    tipo: tipo,
                    unidad: unidad,
                    proveedor_default: proveedorId || ''
                });
                
                console.log('✅ Producto creado, resultado:', result);
                
                if (result && (result.success !== false)) {
                    Utils.showSuccess('Producto agregado correctamente');
                    // Forzar recarga de la lista de productos para reflejar el nuevo registro
                    // (Productos.load solo vuelve a pedir a la API si la lista está vacía)
                    CacheManager.invalidate('productos');
                    AppState.productos = await API.getProductos();
                    Productos.render();
                } else {
                    throw new Error(result?.error || 'No se pudo crear el producto');
                }
            } catch (error) {
                console.error('❌ Error creating producto:', error);
                Utils.showError('Error al crear producto: ' + error.message);
            }
        });
    },
    
    async edit(id) {
        const producto = AppState.productos.find(p => p.id === id);
        if (!producto) {
            Utils.showError('Producto no encontrado');
            return;
        }
        
        const proveedores = AppState.proveedores || [];
        
        const content = `
            <div class="form-group">
                <label>Nombre del producto</label>
                <input type="text" id="modal-producto-nombre" class="form-control" value="${producto.nombre || ''}" required>
            </div>
            <div class="form-group">
                <label>Tipo</label>
                <select id="modal-producto-tipo" class="form-control" required>
                    <option value="verdura" ${producto.tipo === 'verdura' ? 'selected' : ''}>Verdura</option>
                    <option value="bebida" ${producto.tipo === 'bebida' ? 'selected' : ''}>Bebida</option>
                </select>
            </div>
            <div class="form-group">
                <label>Unidad de medida</label>
                <select id="modal-producto-unidad" class="form-control" required>
                    <option value="kg" ${producto.unidad === 'kg' ? 'selected' : ''}>Kilogramo (kg)</option>
                    <option value="unidad" ${producto.unidad === 'unidad' ? 'selected' : ''}>Unidad</option>
                    <option value="caja" ${producto.unidad === 'caja' ? 'selected' : ''}>Caja</option>
                    <option value="docena" ${producto.unidad === 'docena' ? 'selected' : ''}>Docena</option>
                    <option value="litro" ${producto.unidad === 'litro' ? 'selected' : ''}>Litro</option>
                </select>
            </div>
            <div class="form-group">
                <label>Proveedor predeterminado</label>
                <select id="modal-producto-proveedor" class="form-control">
                    <option value="">Sin proveedor</option>
                    ${proveedores.map(p => `<option value="${p.id}" ${p.id === producto.proveedor_default ? 'selected' : ''}>${p.nombre}</option>`).join('')}
                </select>
            </div>
        `;
        
        Utils.showModal('Editar producto', content, async () => {
            const nombre = document.getElementById('modal-producto-nombre').value.trim();
            const tipo = document.getElementById('modal-producto-tipo').value;
            const unidad = document.getElementById('modal-producto-unidad').value;
            const proveedorId = document.getElementById('modal-producto-proveedor').value;
            
            if (!nombre || !tipo || !unidad) {
                Utils.showError('Complete todos los campos obligatorios');
                return;
            }
            
            try {
                await API.updateProducto(id, {
                    nombre: nombre,
                    tipo: tipo,
                    unidad: unidad,
                    proveedor_default: proveedorId || ''
                });
                
                Utils.showSuccess('Producto actualizado correctamente');
                // Limpiar caché de productos y recargar lista
                CacheManager.invalidate('productos');
                AppState.productos = await API.getProductos();
                Productos.render();
            } catch (error) {
                console.error('Error updating producto:', error);
                Utils.showError('Error al actualizar producto');
            }
        });
    },

    async delete(id) {
        const producto = AppState.productos.find(p => p.id === id);
        if (!producto) {
            Utils.showError('Producto no encontrado');
            return;
        }

        const confirmMsg = `⚠️ ADVERTENCIA: ¿Está seguro de ELIMINAR permanentemente "${producto.nombre}"?\n\nEsta acción NO se puede deshacer.\n\n¿Desea continuar?`;

        const confirmar = await Utils.showConfirm(confirmMsg);
        if (!confirmar) return;

        Utils.showLoader();
        try {
            await API.deleteProducto(id);
            Utils.showSuccess('Producto eliminado correctamente');
            CacheManager.invalidate('productos');
            AppState.productos = await API.getProductos();
            Productos.render();
        } catch (error) {
            console.error('Error deleting producto:', error);
            Utils.showError('Error al eliminar producto: ' + error.message);
        } finally {
            Utils.hideLoader();
        }
    }
};

// Proveedores (Gestión)
const ProveedoresGestion = {
    async load() {
        const tbody = document.getElementById('proveedores-tbody');
        if (!tbody) return;
        
        // Mostrar loader local
        this.showLocalLoader(tbody);
        
        try {
            AppState.proveedores = await API.getProveedores();
            this.render();
        } catch (error) {
            console.error('Error loading proveedores:', error);
            this.hideLocalLoader(tbody);
            Utils.showError('Error al cargar proveedores');
        }
    },
    
    showLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        // Crear overlay de loader
        let overlay = parent.querySelector('.local-loader-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'local-loader-overlay';
            overlay.innerHTML = `
                <div class="local-loader-spinner"></div>
            `;
            parent.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },
    
    hideLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        const overlay = parent.querySelector('.local-loader-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },
    
    render() {
        const tbody = document.getElementById('proveedores-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        this.hideLocalLoader(tbody);
        
        if (AppState.proveedores.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No hay proveedores registrados</td></tr>';
            return;
        }
        
        let rowsHtml = '';
        
        AppState.proveedores.forEach(proveedor => {
            const esActivo = proveedor.activo === true || proveedor.activo === 'true' || proveedor.activo === 1;
            const inactiveStyle = !esActivo ? ' style="opacity:0.6;background-color:#f8f9fa;"' : '';
            
            rowsHtml += `
                <tr${inactiveStyle}>
                    <td>${proveedor.nombre || ''}</td>
                    <td>${proveedor.rubro || ''}</td>
                    <td><span class="status-badge ${esActivo ? 'status-activo' : 'status-inactivo'}">${esActivo ? 'Activo' : 'Inactivo'}</span></td>
                    <td>
                        <button class="btn btn-secondary" onclick="ProveedoresGestion.edit('${proveedor.id}')">Editar</button>
                        <button class="btn ${esActivo ? 'btn-secondary' : 'btn-primary'}" onclick="ProveedoresGestion.toggleActivo('${proveedor.id}', ${esActivo})">${esActivo ? 'Desactivar' : 'Activar'}</button>
                        <button class="btn btn-danger" onclick="ProveedoresGestion.delete('${proveedor.id}')">Eliminar</button>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = rowsHtml;
    },
    
    async add() {
        const content = `
            <div class="form-group">
                <label>Nombre del proveedor</label>
                <input type="text" id="modal-proveedor-nombre" class="form-control" placeholder="Ej: Verdulería Central" required>
            </div>
            <div class="form-group">
                <label>Rubro</label>
                <select id="modal-proveedor-rubro" class="form-control" required>
                    <option value="">Seleccionar...</option>
                    <option value="Verdura">Verdura</option>
                    <option value="Bebida">Bebida</option>
                    <option value="Mixto">Mixto</option>
                    <option value="Otro">Otro</option>
                </select>
            </div>
        `;
        
        Utils.showModal('Agregar proveedor', content, async () => {
            const nombre = document.getElementById('modal-proveedor-nombre').value.trim();
            const rubro = document.getElementById('modal-proveedor-rubro').value;
            
            if (!nombre || !rubro) {
                Utils.showError('Complete todos los campos');
                return;
            }
            
            try {
                await API.createProveedor({
                    nombre: nombre,
                    rubro: rubro
                });
                
                Utils.showSuccess('Proveedor agregado correctamente');
                await ProveedoresGestion.load();
                // Recargar productos si están cargados para actualizar la lista
                if (AppState.productos && AppState.productos.length > 0) {
                    await Productos.load();
                }
            } catch (error) {
                console.error('Error creating proveedor:', error);
                Utils.showError('Error al crear proveedor: ' + error.message);
            }
        });
    },
    
    async edit(id) {
        const proveedor = AppState.proveedores.find(p => p.id === id);
        if (!proveedor) {
            Utils.showError('Proveedor no encontrado');
            return;
        }
        
        const content = `
            <div class="form-group">
                <label>Nombre del proveedor</label>
                <input type="text" id="modal-proveedor-nombre" class="form-control" value="${proveedor.nombre || ''}" required>
            </div>
            <div class="form-group">
                <label>Rubro</label>
                <select id="modal-proveedor-rubro" class="form-control" required>
                    <option value="Verdura" ${proveedor.rubro === 'Verdura' ? 'selected' : ''}>Verdura</option>
                    <option value="Bebida" ${proveedor.rubro === 'Bebida' ? 'selected' : ''}>Bebida</option>
                    <option value="Mixto" ${proveedor.rubro === 'Mixto' ? 'selected' : ''}>Mixto</option>
                    <option value="Otro" ${proveedor.rubro === 'Otro' ? 'selected' : ''}>Otro</option>
                </select>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="modal-proveedor-activo" ${proveedor.activo ? 'checked' : ''}>
                    Activo
                </label>
            </div>
        `;
        
        Utils.showModal('Editar proveedor', content, async () => {
            const nombre = document.getElementById('modal-proveedor-nombre').value.trim();
            const rubro = document.getElementById('modal-proveedor-rubro').value;
            const activo = document.getElementById('modal-proveedor-activo').checked;
            
            if (!nombre || !rubro) {
                Utils.showError('Complete todos los campos');
                return;
            }
            
            try {
                await API.updateProveedor(id, {
                    nombre: nombre,
                    rubro: rubro,
                    activo: activo
                });
                
                Utils.showSuccess('Proveedor actualizado correctamente');
                await ProveedoresGestion.load();
            } catch (error) {
                console.error('Error updating proveedor:', error);
                Utils.showError('Error al actualizar proveedor: ' + error.message);
            }
        });
    },
    
    async toggleActivo(id, activoActual) {
        const proveedor = AppState.proveedores.find(p => p.id === id);
        if (!proveedor) {
            Utils.showError('Proveedor no encontrado');
            return;
        }
        
        // Debug logs
        console.log('🔵 toggleActivo - ID:', id);
        console.log('🔵 toggleActivo - activoActual tipo:', typeof activoActual, 'valor:', activoActual);
        console.log('🔵 toggleActivo - proveedor.activo tipo:', typeof proveedor.activo, 'valor:', proveedor.activo);
        
        // Convertir activoActual a booleano explícitamente
        const activoBoolean = activoActual === true || activoActual === 'true';
        const nuevoEstado = !activoBoolean;
        
        console.log('🔵 toggleActivo - nuevo estado:', nuevoEstado);
        
        const accion = activoBoolean ? 'desactivar' : 'activar';
        const confirmar = await Utils.showConfirm(`¿Está seguro de ${accion} este proveedor?`);
        if (!confirmar) return;
        
        Utils.showLoader();
        try {
            const dataToSend = {
                nombre: proveedor.nombre,
                rubro: proveedor.rubro,
                activo: nuevoEstado
            };
            
            console.log('🔵 toggleActivo - enviando datos:', dataToSend);
            
            await API.updateProveedor(id, dataToSend);
            
            Utils.showSuccess(`Proveedor ${activoBoolean ? 'desactivado' : 'activado'} correctamente`);
            await this.load();
        } catch (error) {
            console.error('❌ Error toggling proveedor activo:', error);
            Utils.showError('Error al cambiar estado del proveedor: ' + error.message);
        } finally {
            Utils.hideLoader();
        }
    },
    
    async delete(id) {
        const proveedor = AppState.proveedores.find(p => p.id === id);
        if (!proveedor) {
            Utils.showError('Proveedor no encontrado');
            return;
        }
        
        const confirmMsg = `⚠️ ADVERTENCIA: ¿Está seguro de ELIMINAR permanentemente a "${proveedor.nombre}"?\n\nEsta acción NO se puede deshacer y se eliminarán:\n- Todos los registros relacionados con este proveedor\n- Todo el historial\n\n¿Desea continuar?`;
        
        const confirmar = await Utils.showConfirm(confirmMsg);
        if (!confirmar) return;
        
        Utils.showLoader();
        try {
            await API.deleteProveedor(id);
            Utils.showSuccess('Proveedor eliminado correctamente');
            await this.load();
        } catch (error) {
            console.error('Error deleting proveedor:', error);
            Utils.showError('Error al eliminar proveedor: ' + error.message);
        } finally {
            Utils.hideLoader();
        }
    }
};

// Pedidos
const Pedidos = {
    async load() {
        const tbody = document.getElementById('pedidos-tbody');
        if (!tbody) return;
        
        // Mostrar loader local
        this.showLocalLoader(tbody);
        
        try {
            console.log('🔵 Pedidos.load() - Cargando pedidos para fecha:', AppState.currentDate);
            AppState.pedidos = await API.getPedidos(AppState.currentDate);
            console.log('🔵 Pedidos cargados:', AppState.pedidos.length, 'pedidos');
            this.render();
        } catch (error) {
            console.error('❌ Error loading pedidos:', error);
            this.hideLocalLoader(tbody);
            Utils.showError('Error al cargar pedidos');
        }
    },
    
    showLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        // Crear overlay de loader
        let overlay = parent.querySelector('.local-loader-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'local-loader-overlay';
            overlay.innerHTML = `
                <div class="local-loader-spinner"></div>
            `;
            parent.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },
    
    hideLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        const overlay = parent.querySelector('.local-loader-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },
    
    render() {
        const tbody = document.getElementById('pedidos-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        this.hideLocalLoader(tbody);
        
        if (AppState.pedidos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay pedidos para el día de hoy</td></tr>';
            return;
        }
        
        let rowsHtml = '';
        
        AppState.pedidos.forEach(pedido => {
            rowsHtml += `
                <tr>
                    <td>${pedido.cliente_nombre || ''}</td>
                    <td>${pedido.producto_nombre || ''}</td>
                    <td>${pedido.tipo || ''}</td>
                    <td>${pedido.cantidad || 0}</td>
                    <td>
                        <button class="btn btn-secondary" onclick="Pedidos.edit('${pedido.id}')">Editar</button>
                        <button class="btn btn-danger" onclick="Pedidos.delete('${pedido.id}')">Eliminar</button>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = rowsHtml;
    },
    
    async add() {
        // Cargar datos en paralelo solo si es necesario
        const promises = [];
        
        if (!AppState.clientes || AppState.clientes.length === 0) {
            promises.push(API.getClientes().then(data => { AppState.clientes = data; }));
        }
        
        if (!AppState.productos || AppState.productos.length === 0) {
            promises.push(API.getProductos().then(data => { AppState.productos = data; }));
        }
        
        if (promises.length > 0) {
            await Promise.all(promises);
        }
        
        const clientes = AppState.clientes;
        const productos = AppState.productos;
        
        const content = `
            <div class="form-group">
                <label>Cliente</label>
                <select id="modal-cliente" class="form-control">
                    <option value="">Seleccionar...</option>
                    ${clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Producto</label>
                <select id="modal-producto" class="form-control">
                    <option value="">Seleccionar...</option>
                    ${productos.map(p => `<option value="${p.id}">${p.nombre} (${p.tipo})</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Cantidad</label>
                <input type="number" id="modal-cantidad" class="form-control" min="1" value="1">
            </div>
        `;
        
        Utils.showModal('Agregar pedido', content, async () => {
            try {
                console.log('🔵 Iniciando creación de pedido...');
                
                const clienteId = document.getElementById('modal-cliente').value;
                const productoId = document.getElementById('modal-producto').value;
                const cantidad = parseInt(document.getElementById('modal-cantidad').value);
                
                console.log('🔵 Datos del pedido:', { clienteId, productoId, cantidad });
                
                if (!clienteId || !productoId || !cantidad) {
                    Utils.showError('Complete todos los campos');
                    return;
                }
                
                const producto = productos.find(p => p.id == productoId);
                
                if (!producto) {
                    Utils.showError('Producto no encontrado');
                    return;
                }
                
                console.log('🔵 Llamando a API.createPedido...');
                
                // Crear el pedido
                const result = await API.createPedido({
                    fecha: AppState.currentDate,
                    cliente_id: clienteId,
                    producto_id: productoId,
                    tipo: producto.tipo,
                    cantidad: cantidad
                });
                
                console.log('✅ Pedido creado, resultado:', result);
                console.log('🔍 Tipo de resultado:', typeof result, Array.isArray(result) ? '(array)' : '(no array)');
                
                // Verificar que el resultado sea válido
                // Si result es un array vacío, puede ser que no se guardó correctamente
                if (Array.isArray(result) && result.length === 0) {
                    console.error('❌ El servidor devolvió un array vacío. El pedido no se guardó.');
                    Utils.showError('Error: El pedido no se guardó correctamente. El servidor devolvió una respuesta vacía.');
                    return;
                }
                
                // Si result es un objeto con id, se guardó correctamente
                if (result && typeof result === 'object' && !Array.isArray(result) && result.id) {
                    console.log('✅ Pedido guardado con ID:', result.id);
                } else if (result && typeof result === 'object' && !Array.isArray(result)) {
                    console.log('✅ Pedido guardado, datos:', result);
                } else {
                    console.warn('⚠️ Resultado inesperado:', result);
                }
                
                // Limpiar todo el caché para forzar recarga completa
                CacheManager.clear();
                
                // Esperar más tiempo para que Google Sheets procese el cambio
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Recargar los pedidos
                await this.load();
                
                // Verificar si realmente se guardó buscando el pedido en la lista
                const pedidosActualizados = AppState.pedidos || [];
                const pedidoGuardado = pedidosActualizados.find(p => 
                    p.cliente_id === clienteId && 
                    p.producto_id === productoId && 
                    p.cantidad === cantidad &&
                    p.fecha === AppState.currentDate
                );
                
                if (pedidoGuardado) {
                    console.log('✅ Pedido verificado en la lista:', pedidoGuardado);
                    Utils.showSuccess('Pedido agregado correctamente');
                } else {
                    console.error('❌ El pedido no aparece después de recargar');
                    console.log('🔍 Pedidos actuales:', pedidosActualizados);
                    console.log('🔍 Buscando:', { clienteId, productoId, cantidad, fecha: AppState.currentDate });
                    Utils.showError('El pedido se envió pero no aparece en la lista. Por favor, verifica en el servidor o intenta nuevamente.');
                }
            } catch (error) {
                console.error('❌ Error en creación de pedido:', error);
                Utils.showError('Error al crear pedido: ' + error.message);
            }
        });
    },
    
    async edit(id) {
        const pedido = AppState.pedidos.find(p => p.id === id);
        if (!pedido) {
            Utils.showError('Pedido no encontrado');
            return;
        }
        
        const clientes = await API.getClientes();
        const productos = await API.getProductos();
        
        const content = `
            <div class="form-group">
                <label>Cliente</label>
                <select id="modal-cliente" class="form-control">
                    <option value="">Seleccionar...</option>
                    ${clientes.map(c => `<option value="${c.id}" ${c.id === pedido.cliente_id ? 'selected' : ''}>${c.nombre}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Producto</label>
                <select id="modal-producto" class="form-control">
                    <option value="">Seleccionar...</option>
                    ${productos.map(p => `<option value="${p.id}" ${p.id === pedido.producto_id ? 'selected' : ''}>${p.nombre} (${p.tipo})</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Cantidad</label>
                <input type="number" id="modal-cantidad" class="form-control" min="1" value="${pedido.cantidad || 1}">
            </div>
        `;
        
        Utils.showModal('Editar pedido', content, async () => {
            const clienteId = document.getElementById('modal-cliente').value;
            const productoId = document.getElementById('modal-producto').value;
            const cantidad = parseInt(document.getElementById('modal-cantidad').value);
            
            if (!clienteId || !productoId || !cantidad) {
                Utils.showError('Complete todos los campos');
                return;
            }
            
            const producto = productos.find(p => p.id == productoId);
            
            try {
                // Eliminar pedido anterior y crear uno nuevo
                await API.deletePedido(id);
                await API.createPedido({
                    fecha: pedido.fecha,
                    cliente_id: clienteId,
                    producto_id: productoId,
                    tipo: producto.tipo,
                    cantidad: cantidad
                });
                
                // Limpiar todo el caché para forzar recarga completa
                CacheManager.clear();
                
                // Pequeña espera para que Google Sheets procese el cambio
                await new Promise(resolve => setTimeout(resolve, 500));
                
                Utils.showSuccess('Pedido actualizado correctamente');
                await Pedidos.load(); // Cambio: usar Pedidos.load() en lugar de this.load()
            } catch (error) {
                console.error('Error updating pedido:', error);
                Utils.showError('Error al actualizar el pedido');
            }
        });
    },
    
    async delete(id) {
        const confirmar = await Utils.showConfirm('¿Está seguro de eliminar este pedido?');
        if (!confirmar) return;
        
        Utils.showLoader();
        try {
            await API.deletePedido(id);
            
            // Limpiar todo el caché para forzar recarga completa
            CacheManager.clear();
            
            // Pequeña espera para que Google Sheets procese el cambio
            await new Promise(resolve => setTimeout(resolve, 500));
            
            Utils.showSuccess('Pedido eliminado');
            await this.load();
        } catch (error) {
            console.error('Error deleting pedido:', error);
            Utils.showError('Error al eliminar pedido: ' + error.message);
        } finally {
            Utils.hideLoader();
        }
    },
    
    async save() {
        try {
            // Guardar todos los pedidos del día
            Utils.showSuccess('Pedidos guardados correctamente');
            await this.load();
        } catch (error) {
            console.error('Error saving pedidos:', error);
        }
    }
};

// Proveedores Pedido
const ProveedoresPedido = {
    async load() {
        const container = document.getElementById('proveedores-pedido-container');
        if (!container) return;
        
        // Mostrar loader local
        this.showLocalLoader(container);
        
        try {
            // Cargar datos en paralelo solo si son necesarios
            const promises = [];
            
            promises.push(API.getPedidos(AppState.currentDate).then(data => { AppState.pedidos = data; return data; }));
            
            if (!AppState.productos || AppState.productos.length === 0) {
                promises.push(API.getProductos().then(data => { AppState.productos = data; return data; }));
            } else {
                promises.push(Promise.resolve(AppState.productos));
            }
            
            if (!AppState.proveedores || AppState.proveedores.length === 0) {
                promises.push(API.getProveedores().then(data => { AppState.proveedores = data; return data; }));
            } else {
                promises.push(Promise.resolve(AppState.proveedores));
            }
            
            const [pedidos, productos, proveedores] = await Promise.all(promises);
            
            // Agrupar pedidos por proveedor
            const pedidosPorProveedor = {};
            
            pedidos.forEach(pedido => {
                const producto = productos.find(prod => prod.id === pedido.producto_id);
                if (!producto) return;
                
                const proveedorId = producto.proveedor_default || 'sin-proveedor';
                if (!pedidosPorProveedor[proveedorId]) {
                    pedidosPorProveedor[proveedorId] = [];
                }
                
                pedidosPorProveedor[proveedorId].push({
                    producto: producto.nombre,
                    cantidad: pedido.cantidad
                });
            });
            
            this.render(pedidosPorProveedor, proveedores);
        } catch (error) {
            console.error('Error loading proveedores pedido:', error);
            this.hideLocalLoader(container);
        }
    },
    
    showLocalLoader(container) {
        if (!container) return;
        
        // Crear overlay de loader directamente sobre el contenedor
        let overlay = container.querySelector('.local-loader-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'local-loader-overlay';
            overlay.innerHTML = `
                <div class="local-loader-spinner"></div>
            `;
            container.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },
    
    hideLocalLoader(container) {
        if (!container) return;
        
        const overlay = container.querySelector('.local-loader-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },
    
    render(pedidosPorProveedor, proveedores) {
        const container = document.getElementById('proveedores-pedido-container');
        if (!container) return;
        
        // Ocultar loader local
        this.hideLocalLoader(container);
        
        container.innerHTML = '';
        
        Object.keys(pedidosPorProveedor).forEach(proveedorId => {
            const proveedor = proveedores.find(p => p.id == proveedorId) || { nombre: 'Sin proveedor asignado' };
            const items = pedidosPorProveedor[proveedorId];
            
            const box = document.createElement('div');
            box.className = 'proveedor-box';
            box.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0;">${proveedor.nombre}</h3>
                    <button class="btn btn-primary btn-sm" onclick="ProveedoresPedido.marcarPorProveedor('${proveedorId}')" style="white-space: nowrap;">
                        Marcar pedido
                    </button>
                </div>
                <ul>
                    ${items.map(item => `<li>${item.producto} ${item.cantidad}</li>`).join('')}
                </ul>
            `;
            container.appendChild(box);
        });
    },
    
    async imprimir() {
        window.print();
    },
    
    async marcar(proveedorId = null) {
        try {
            console.log('🔵 ProveedoresPedido.marcar() llamado', proveedorId ? `para proveedor: ${proveedorId}` : 'para todos los proveedores');
            
            // Verificar que hay pedidos
            if (!AppState.pedidos || AppState.pedidos.length === 0) {
                console.log('⚠️ No hay pedidos para marcar');
                Utils.showError('No hay pedidos para marcar');
                return;
            }
            
            // Cargar productos si no están cargados
            if (!AppState.productos || AppState.productos.length === 0) {
                AppState.productos = await API.getProductos();
            }
            
            // Filtrar pedidos según el proveedor seleccionado
            let pedidosFiltrados = AppState.pedidos;
            if (proveedorId && proveedorId !== 'sin-proveedor') {
                // Filtrar pedidos que pertenecen al proveedor seleccionado
                pedidosFiltrados = AppState.pedidos.filter(pedido => {
                    const producto = AppState.productos.find(prod => prod.id === pedido.producto_id);
                    return producto && producto.proveedor_default === proveedorId;
                });
            } else if (proveedorId === 'sin-proveedor') {
                // Filtrar pedidos sin proveedor asignado
                pedidosFiltrados = AppState.pedidos.filter(pedido => {
                    const producto = AppState.productos.find(prod => prod.id === pedido.producto_id);
                    return !producto || !producto.proveedor_default;
                });
            }
            
            // Verificar si ya están marcados
            const pedidosNoEnviados = pedidosFiltrados.filter(p => !p.enviado);
            if (pedidosNoEnviados.length === 0) {
                const mensaje = proveedorId 
                    ? 'Todos los pedidos de este proveedor ya están marcados como enviados'
                    : 'Todos los pedidos del día ya están marcados como enviados';
                Utils.showWarning(mensaje);
                return;
            }
            
            // Obtener nombre del proveedor para el mensaje
            let nombreProveedor = 'todos los proveedores';
            if (proveedorId && proveedorId !== 'sin-proveedor') {
                if (!AppState.proveedores || AppState.proveedores.length === 0) {
                    AppState.proveedores = await API.getProveedores();
                }
                const proveedor = AppState.proveedores.find(p => p.id === proveedorId);
                nombreProveedor = proveedor ? proveedor.nombre : 'este proveedor';
            } else if (proveedorId === 'sin-proveedor') {
                nombreProveedor = 'productos sin proveedor';
            }
            
            console.log('🔵 Mostrando confirmación...');
            const confirmar = await Utils.showConfirm(`¿Marcar ${pedidosNoEnviados.length} pedido(s) como enviados a ${nombreProveedor}?`);
            console.log('🔵 Confirmación recibida:', confirmar);
            
            if (!confirmar) {
                console.log('🔵 Usuario canceló la acción');
                return;
            }
            
            console.log('🔵 Mostrando loader...');
            Utils.showLoader();
            
            // Si hay un proveedor específico, necesitamos marcar solo esos pedidos
            // Para esto, necesitamos obtener los IDs de los pedidos a marcar
            const pedidosIds = pedidosNoEnviados.map(p => p.id);
            
            // Marcar pedidos como enviados en la base de datos
            console.log('🔵 Marcando pedidos en la base de datos...');
            // Si hay un proveedor específico, marcamos solo esos pedidos
            if (proveedorId) {
                // Marcar los pedidos del proveedor por sus IDs
                const resultado = await API.marcarPedidosEnviadosPorIds(pedidosIds);
                console.log('🔵 Resultado:', resultado);
                
                // Invalidar caché de pedidos para forzar recarga
                CacheManager.invalidatePattern('pedidos');
                
                // Recargar pedidos para actualizar el estado
                AppState.pedidos = await API.getPedidos(AppState.currentDate);
                
                console.log('🔵 Ocultando loader...');
                Utils.hideLoader();
                
                console.log('🔵 Mostrando mensaje de éxito...');
                Utils.showSuccess(resultado.mensaje || `Se marcaron ${resultado.marcados || pedidosIds.length} pedido(s) como enviados a ${nombreProveedor} correctamente`);
            } else {
                // Marcar todos los pedidos (comportamiento original)
                const resultado = await API.marcarPedidosEnviados(AppState.currentDate);
                console.log('🔵 Resultado:', resultado);
                
                // Invalidar caché de pedidos para forzar recarga
                CacheManager.invalidatePattern('pedidos');
                
                // Recargar pedidos para actualizar el estado
                AppState.pedidos = await API.getPedidos(AppState.currentDate);
                
                console.log('🔵 Ocultando loader...');
                Utils.hideLoader();
                
                console.log('🔵 Mostrando mensaje de éxito...');
                Utils.showSuccess(resultado.mensaje || `Se marcaron ${resultado.marcados || pedidosNoEnviados.length} pedido(s) como enviados correctamente`);
            }
            
            // Recargar la vista
            await this.load();
            
        } catch (error) {
            console.error('❌ Error en ProveedoresPedido.marcar():', error);
            console.error('❌ Stack trace:', error.stack);
            Utils.hideLoader();
            Utils.showError('Error al marcar pedido: ' + error.message);
        }
    },
    
    async marcarPorProveedor(proveedorId) {
        await this.marcar(proveedorId);
    }
};

// Recepción
const Recepcion = {
    async load() {
        const tbody = document.getElementById('recepcion-tbody');
        if (!tbody) return;
        
        // Mostrar loader local
        this.showLocalLoader(tbody);
        
        try {
            // Cargar recepciones y pedidos en paralelo
            const promises = [
                API.getRecepcion(AppState.currentDate),
                API.getPedidos(AppState.currentDate)
            ];
            
            if (!AppState.productos || AppState.productos.length === 0) {
                promises.push(API.getProductos());
            } else {
                promises.push(Promise.resolve(AppState.productos));
            }
            
            const [recepciones, pedidos, productos] = await Promise.all(promises);
            AppState.productos = productos;
            
            // Agrupar pedidos por producto para obtener el total pedido
            const pedidosPorProducto = {};
            pedidos.forEach(pedido => {
                if (!pedidosPorProducto[pedido.producto_id]) {
                    pedidosPorProducto[pedido.producto_id] = {
                        producto_id: pedido.producto_id,
                        pedido_total: 0,
                        producto_nombre: productos.find(p => p.id === pedido.producto_id)?.nombre || ''
                    };
                }
                pedidosPorProducto[pedido.producto_id].pedido_total += parseFloat(pedido.cantidad) || 0;
            });
            
            // Crear un mapa de recepciones existentes por producto_id
            const recepcionesMap = {};
            recepciones.forEach(rec => {
                recepcionesMap[rec.producto_id] = rec;
            });
            
            // Sincronizar: crear recepciones para productos que tienen pedidos pero no tienen recepción
            const recepcionesFinales = [];
            
            // Primero agregar las recepciones existentes
            recepciones.forEach(rec => {
                // Actualizar el pedido_total desde los pedidos actuales
                const pedidoInfo = pedidosPorProducto[rec.producto_id];
                if (pedidoInfo) {
                    rec.pedido_total = pedidoInfo.pedido_total;
                }
                recepcionesFinales.push(rec);
            });
            
            // Luego agregar recepciones nuevas para productos que tienen pedidos pero no recepción
            Object.keys(pedidosPorProducto).forEach(productoId => {
                if (!recepcionesMap[productoId]) {
                    const pedidoInfo = pedidosPorProducto[productoId];
                    recepcionesFinales.push({
                        id: 'temp-' + productoId,
                        producto_id: productoId,
                        producto_nombre: pedidoInfo.producto_nombre,
                        pedido_total: pedidoInfo.pedido_total,
                        llego: 0,
                        precio_real: 0,
                        proveedor_nombre: '',
                        confirmado: false
                    });
                }
            });
            
            AppState.recepcion = recepcionesFinales;
            
            console.log('🔵 Recepción cargada:', {
                recepcionesExistentes: recepciones.length,
                pedidos: pedidos.length,
                productosConPedidos: Object.keys(pedidosPorProducto).length,
                recepcionesFinales: recepcionesFinales.length
            });
            
            this.render();
        } catch (error) {
            console.error('Error loading recepcion:', error);
            this.hideLocalLoader(tbody);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: #d32f2f;">Error al cargar recepción. Por favor, intenta nuevamente.</td></tr>';
        }
    },
    
    showLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        // Crear overlay de loader
        let overlay = parent.querySelector('.local-loader-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'local-loader-overlay';
            overlay.innerHTML = `
                <div class="local-loader-spinner"></div>
            `;
            parent.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },
    
    hideLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        const overlay = parent.querySelector('.local-loader-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },
    
    render() {
        const tbody = document.getElementById('recepcion-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        this.hideLocalLoader(tbody);
        
        if (AppState.recepcion.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay recepciones para el día de hoy</td></tr>';
            return;
        }
        
        let rowsHtml = '';
        
        AppState.recepcion.forEach(item => {
            rowsHtml += `
                <tr>
                    <td>${item.producto_nombre || ''}</td>
                    <td>${item.pedido_total || 0}</td>
                    <td><input type="number" class="recepcion-llego" data-id="${item.id}" data-producto-id="${item.producto_id}" value="${item.llego || 0}" min="0"></td>
                    <td><input type="text" class="recepcion-precio" data-id="${item.id}" data-price-input="true" value="${Utils.formatPrice(item.precio_real || 0)}" placeholder="0"></td>
                    <td>${item.proveedor_nombre || ''}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = rowsHtml;
        Utils.enablePriceInputs(tbody);
    },
    
    async save() {
        const items = [];
        const productos = await API.getProductos();
        
        document.querySelectorAll('.recepcion-llego').forEach(input => {
            const productoId = input.getAttribute('data-producto-id');
            const llego = parseInt(input.value) || 0;
            const id = input.getAttribute('data-id');
            const precioInput = document.querySelector(`.recepcion-precio[data-id="${id}"]`);
            const precio = Utils.parsePrice(precioInput ? precioInput.value : 0);
            
            items.push({
                producto_id: productoId,
                llego: llego,
                precio_real: precio
            });
        });
        
        if (items.length === 0) {
            Utils.showError('No hay datos para guardar');
            return;
        }
        
        Utils.showLoader();
        try {
            await API.saveRecepcion({
                fecha: AppState.currentDate,
                items: items
            });
            
            Utils.showSuccess('Recepción guardada correctamente');
            await this.load();
        } catch (error) {
            console.error('Error saving recepcion:', error);
            Utils.showError('Error al guardar recepción: ' + error.message);
        } finally {
            Utils.hideLoader();
        }
    },
    
    async confirmar() {
        const confirmar = await Utils.showConfirm('¿Confirmar recepción? Esto cerrará la edición de este día.');
        if (!confirmar) return;
        
        Utils.showLoader();
        try {
            await API.confirmarRecepcion(AppState.currentDate);
            Utils.showSuccess('Recepción confirmada correctamente');
            await this.load();
        } catch (error) {
            console.error('Error confirming recepcion:', error);
            Utils.showError('Error al confirmar recepción: ' + error.message);
        } finally {
            Utils.hideLoader();
        }
    }
};

// Precios
const Precios = {
    selectedClienteId: null,
    comisionPorUnidad: 350,
    recepciones: [], // Para obtener precio_real
    
    async load() {
        const tbody = document.getElementById('precios-tbody');
        if (!tbody) return;
        
        // Mostrar loader local
        this.showLocalLoader(tbody);
        
        try {
            AppState.precios = await API.getPreciosCliente(AppState.currentDate);
            
            // Cargar recepciones para obtener precio_real
            this.recepciones = await API.getRecepcion(AppState.currentDate);
            
            // Cargar clientes para el filtro
            await this.loadClientesFilter();
            
            // Restaurar filtro si existe (solo si el elemento existe en el DOM)
            const filtroCliente = document.getElementById('precios-filtro-cliente');
            const savedClienteId = localStorage.getItem('precios-selected-cliente');
            if (savedClienteId && filtroCliente) {
                this.selectedClienteId = savedClienteId;
                filtroCliente.value = savedClienteId;
            }
            
            // Restaurar comisión si existe (solo si el elemento existe en el DOM)
            const comisionInput = document.getElementById('precios-comision');
            const savedComision = localStorage.getItem('precios-comision');
            if (savedComision && comisionInput) {
                this.comisionPorUnidad = Utils.parsePrice(savedComision) || 350;
                comisionInput.value = Utils.formatPrice(this.comisionPorUnidad);
            }
            
            this.render();
        } catch (error) {
            console.error('Error loading precios:', error);
            this.hideLocalLoader(tbody);
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: #d32f2f;">Error al cargar precios. Por favor, intenta nuevamente.</td></tr>';
        }
    },
    
    async loadClientesFilter() {
        const select = document.getElementById('precios-filtro-cliente');
        if (!select) return;
        
        try {
            const clientes = await API.getClientes();
            const activeClientes = clientes.filter(c => c.activo !== false);
            
            // Mantener la opción "Todos los clientes"
            const currentValue = select.value;
            select.innerHTML = '<option value="">Todos los clientes</option>';
            
            activeClientes.forEach(cliente => {
                const option = document.createElement('option');
                option.value = cliente.id;
                option.textContent = cliente.nombre;
                select.appendChild(option);
            });
            
            // Restaurar valor seleccionado
            if (currentValue) {
                select.value = currentValue;
            }
        } catch (error) {
            console.error('Error loading clientes for filter:', error);
        }
    },
    
    filterByCliente(clienteId) {
        this.selectedClienteId = clienteId;
        localStorage.setItem('precios-selected-cliente', clienteId || '');
        this.render();
    },
    
    updateComision() {
        const comisionInput = document.getElementById('precios-comision');
        if (comisionInput) {
            this.comisionPorUnidad = Utils.parsePrice(comisionInput.value) || 0;
            comisionInput.value = this.comisionPorUnidad > 0 ? Utils.formatPrice(this.comisionPorUnidad) : '';
            localStorage.setItem('precios-comision', this.comisionPorUnidad.toString());
            this.render();
        }
    },
    
    showLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        // Crear overlay de loader
        let overlay = parent.querySelector('.local-loader-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'local-loader-overlay';
            overlay.innerHTML = `
                <div class="local-loader-spinner"></div>
            `;
            parent.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },
    
    hideLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        const overlay = parent.querySelector('.local-loader-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },
    
    render() {
        const tbody = document.getElementById('precios-tbody');
        const tfoot = document.getElementById('precios-tfoot');
        const resumenDiv = document.getElementById('precios-resumen-cliente');
        if (!tbody) return;
        
        // Ocultar loader local
        this.hideLocalLoader(tbody);
        
        // GUARDAR VALORES ACTUALES DE LOS INPUTS ANTES DE RENDERIZAR
        const preciosInputs = {};
        document.querySelectorAll('.precio-cliente').forEach(input => {
            const id = input.getAttribute('data-id');
            const value = Utils.parsePrice(input.value) || 0;
            if (id && !isNaN(value)) {
                preciosInputs[id] = value;
            }
        });
        
        // Filtrar precios por cliente si hay filtro activo
        let preciosFiltrados = AppState.precios || [];
        if (this.selectedClienteId) {
            preciosFiltrados = preciosFiltrados.filter(p => p.cliente_id === this.selectedClienteId);
        }
        
        if (preciosFiltrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: #666;">' +
                '<div style="margin-bottom: 10px;">📋 No hay precios para el día de hoy' + 
                (this.selectedClienteId ? ' para este cliente' : '') + '</div>' +
                '<div style="font-size: 12px; color: #999;">Haz clic en "Generar lista" después de confirmar la recepción de productos</div>' +
                '</td></tr>';
            
            // Ocultar resumen y footer si no hay datos
            if (tfoot) tfoot.style.display = 'none';
            if (resumenDiv) resumenDiv.style.display = 'none';
            return;
        }
        
        // Calcular totales
        let totalProductos = 0;
        let totalCantidad = 0;
        let totalGanancia = 0;
        let clienteNombre = '';
        
        let rowsHtml = '';
        
        preciosFiltrados.forEach(precio => {
            const cantidad = parseFloat(precio.cantidad || 0);
            
            // Usar valor guardado si existe, sino usar el valor del precio
            const precioUnitario = preciosInputs[precio.id] !== undefined 
                ? preciosInputs[precio.id] 
                : Utils.parsePrice(precio.precio_cliente || 0);
            
            // Obtener precio_real de la recepción
            const recepcion = this.recepciones.find(r => r.producto_id === precio.producto_id && r.confirmado === true);
            const precioReal = recepcion ? Utils.parsePrice(recepcion.precio_real || 0) : 0;
            
            // Calcular ganancia por unidad
            const gananciaPorUnidad = precioUnitario - precioReal;
            const gananciaTotal = gananciaPorUnidad * cantidad;
            const total = cantidad * precioUnitario;
            
            totalProductos += total;
            totalCantidad += cantidad;
            totalGanancia += gananciaTotal;
            
            if (!clienteNombre && precio.cliente_nombre) {
                clienteNombre = precio.cliente_nombre;
            }
            
            rowsHtml += `
                <tr>
                    <td>${precio.cliente_nombre || ''}</td>
                    <td>${precio.producto_nombre || ''}</td>
                    <td>${cantidad}</td>
                    <td>${precioReal > 0 ? Utils.formatCurrency(precioReal) : '-'}</td>
                    <td><input type="text" class="precio-cliente" data-id="${precio.id}" data-price-input="true" value="${Utils.formatPrice(precioUnitario)}" onchange="Precios.onPrecioChange()" style="width: 100px;" placeholder="0"></td>
                    <td style="color: ${gananciaTotal >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}; font-weight: 600;">${gananciaTotal > 0 ? '+' : ''}${Utils.formatCurrency(gananciaTotal)}</td>
                    <td>${Utils.formatCurrency(total)}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = rowsHtml;
        Utils.enablePriceInputs(tbody);
        
        // Calcular comisión y saldo total
        const comision = totalCantidad * this.comisionPorUnidad;
        const saldoTotal = totalProductos + comision;
        
        // Mostrar resumen si hay filtro por cliente
        if (this.selectedClienteId && resumenDiv) {
            document.getElementById('resumen-cliente-nombre').textContent = clienteNombre || '-';
            document.getElementById('resumen-total-productos').textContent = Utils.formatCurrency(totalProductos);
            document.getElementById('resumen-comision').textContent = Utils.formatCurrency(comision);
            document.getElementById('resumen-saldo-total').textContent = Utils.formatCurrency(saldoTotal);
            resumenDiv.style.display = 'block';
        } else if (resumenDiv) {
            resumenDiv.style.display = 'none';
        }
        
        // Mostrar footer con totales si hay filtro
        if (this.selectedClienteId && tfoot) {
            tfoot.innerHTML = `
                <tr style="background-color: #f8f9fa; font-weight: bold;">
                    <td colspan="3" style="text-align: right;">TOTAL PRODUCTOS:</td>
                    <td></td>
                    <td></td>
                    <td style="color: ${totalGanancia >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}; font-weight: 600;">${totalGanancia > 0 ? '+' : ''}${Utils.formatCurrency(totalGanancia)}</td>
                    <td>${Utils.formatCurrency(totalProductos)}</td>
                </tr>
                <tr style="background-color: #fff3cd; font-weight: bold;">
                    <td colspan="3" style="text-align: right;">COMISIÓN (${totalCantidad} × ${Utils.formatCurrency(this.comisionPorUnidad)}):</td>
                    <td></td>
                    <td>${Utils.formatCurrency(this.comisionPorUnidad)}</td>
                    <td></td>
                    <td>${Utils.formatCurrency(comision)}</td>
                </tr>
                <tr style="background-color: #d4edda; font-weight: bold; font-size: 16px;">
                    <td colspan="3" style="text-align: right;">SALDO TOTAL:</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td>${Utils.formatCurrency(saldoTotal)}</td>
                </tr>
            `;
            tfoot.style.display = 'table-footer-group';
        } else if (tfoot) {
            tfoot.style.display = 'none';
        }
    },
    
    onPrecioChange() {
        // Actualizar el precio en AppState.precios antes de renderizar
        document.querySelectorAll('.precio-cliente').forEach(input => {
            const id = input.getAttribute('data-id');
            const value = Utils.parsePrice(input.value) || 0;
            if (id) {
                const precio = AppState.precios.find(p => p.id === id);
                if (precio) {
                    precio.precio_cliente = value;
                }
            }
        });
        
        // Re-renderizar para actualizar totales
        this.render();
    },
    
    async generarLista() {
        Utils.showLoader();
        try {
            // Obtener recepciones confirmadas del día
            const recepciones = await API.getRecepcion(AppState.currentDate);
            const pedidos = await API.getPedidos(AppState.currentDate);
            const clientes = await API.getClientes();
            
            // Validar que existan pedidos
            if (!pedidos || pedidos.length === 0) {
                Utils.showError('No hay pedidos para el día de hoy. Primero debe crear pedidos.');
                return;
            }
            
            // Validar que existan recepciones confirmadas
            const recepcionesConfirmadas = recepciones.filter(r => r.confirmado === true);
            if (recepcionesConfirmadas.length === 0) {
                Utils.showError('No hay recepciones confirmadas para el día de hoy. Primero debe confirmar la recepción de productos.');
                return;
            }
            
            // Crear precios basados en pedidos y recepciones
            // Agrupar por cliente_id y producto_id para evitar duplicados
            const preciosMap = {};
            
            pedidos.forEach(pedido => {
                const recepcion = recepcionesConfirmadas.find(r => r.producto_id === pedido.producto_id);
                if (recepcion) {
                    const key = `${pedido.cliente_id}_${pedido.producto_id}`;
                    if (!preciosMap[key]) {
                        preciosMap[key] = {
                            cliente_id: pedido.cliente_id,
                            producto_id: pedido.producto_id,
                            cantidad: 0,
                            precio_cliente: 0 // Se debe completar manualmente
                        };
                    }
                    // Sumar cantidades si hay múltiples pedidos del mismo cliente/producto
                    preciosMap[key].cantidad += parseFloat(pedido.cantidad) || 0;
                }
            });
            
            // Convertir mapa a array
            const preciosItems = Object.values(preciosMap);
            
            // Guardar precios iniciales
            if (preciosItems.length > 0) {
                await API.savePreciosCliente({
                    fecha: AppState.currentDate,
                    items: preciosItems
                });
                Utils.showSuccess(`Lista de precios generada con ${preciosItems.length} item(s). Complete los precios cliente.`);
                await this.load();
            } else {
                Utils.showWarning('No se encontraron productos con recepción confirmada que coincidan con los pedidos.');
            }
        } catch (error) {
            console.error('Error generating precios:', error);
            Utils.showError('Error al generar lista: ' + error.message);
        } finally {
            Utils.hideLoader();
        }
    },
    
    async save() {
        const items = [];
        const precios = AppState.precios;
        
        document.querySelectorAll('.precio-cliente').forEach(input => {
            const id = input.getAttribute('data-id');
            const precio = Utils.parsePrice(input.value) || 0;
            
            const precioData = precios.find(p => p.id === id);
            if (precioData) {
                items.push({
                    cliente_id: precioData.cliente_id,
                    producto_id: precioData.producto_id,
                    cantidad: precioData.cantidad || 0,
                    precio_cliente: precio
                });
            }
        });
        
        if (items.length === 0) {
            Utils.showError('No hay precios para guardar');
            return;
        }
        
        Utils.showLoader();
        try {
            await API.savePreciosCliente({
                fecha: AppState.currentDate,
                items: items
            });
            
            Utils.showSuccess('Precios guardados correctamente');
            await this.load();
        } catch (error) {
            console.error('Error saving precios:', error);
            Utils.showError('Error al guardar precios: ' + error.message);
        } finally {
            Utils.hideLoader();
        }
    },
    
    limpiarFiltro() {
        this.selectedClienteId = null;
        localStorage.removeItem('precios-selected-cliente');
        const select = document.getElementById('precios-filtro-cliente');
        if (select) select.value = '';
        this.render();
    },
    
    /** Lee precios actuales de la tabla (inputs + filtro cliente) para exportar */
    _obtenerDatosClienteParaExportar() {
        if (!this.selectedClienteId) return null;

        const preciosFiltrados = (AppState.precios || []).filter(
            p => p.cliente_id === this.selectedClienteId
        );
        if (preciosFiltrados.length === 0) return null;

        const preciosInputs = {};
        document.querySelectorAll('.precio-cliente').forEach(input => {
            const id = input.getAttribute('data-id');
            if (id) preciosInputs[id] = Utils.parsePrice(input.value) || 0;
        });

        const filas = [];
        let totalProductos = 0;
        let totalCantidad = 0;
        let totalGanancia = 0;
        let clienteNombre = '';

        preciosFiltrados.forEach(precio => {
            const cantidad = parseFloat(precio.cantidad || 0);
            const precioUnitario = preciosInputs[precio.id] !== undefined
                ? preciosInputs[precio.id]
                : Utils.parsePrice(precio.precio_cliente || 0);
            const recepcion = this.recepciones.find(
                r => r.producto_id === precio.producto_id && r.confirmado === true
            );
            const precioReal = recepcion ? Utils.parsePrice(recepcion.precio_real || 0) : 0;
            const gananciaTotal = (precioUnitario - precioReal) * cantidad;
            const total = cantidad * precioUnitario;

            totalProductos += total;
            totalCantidad += cantidad;
            totalGanancia += gananciaTotal;
            if (!clienteNombre && precio.cliente_nombre) {
                clienteNombre = precio.cliente_nombre;
            }

            filas.push({
                producto: precio.producto_nombre || '',
                cantidad,
                precioUnitario,
                total,
                precioReal,
                gananciaTotal
            });
        });

        const comision = totalCantidad * this.comisionPorUnidad;
        const saldoTotal = totalProductos + comision;

        return {
            clienteNombre,
            filas,
            totalProductos,
            totalCantidad,
            totalGanancia,
            comision,
            saldoTotal
        };
    },

    async exportarPDF() {
        if (!this.selectedClienteId) {
            Utils.showError('Por favor, selecciona un cliente para exportar');
            return;
        }

        const datos = this._obtenerDatosClienteParaExportar();
        if (!datos) {
            Utils.showError('No hay datos para exportar');
            return;
        }

        try {
            const fechaFormateada = AppState.currentDate
                ? new Date(AppState.currentDate + 'T12:00:00').toLocaleDateString('es-AR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                })
                : new Date().toLocaleDateString('es-AR');

            const fechaCorta = AppState.currentDate
                ? new Date(AppState.currentDate + 'T12:00:00').toLocaleDateString('es-AR')
                : '';

            const filasHtml = datos.filas.map((f, i) => `
                <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
                    <td class="col-cant">${f.cantidad}</td>
                    <td class="col-prod">${f.producto}</td>
                    <td class="col-money">${Utils.formatCurrency(f.precioUnitario)}</td>
                    <td class="col-money col-total">${Utils.formatCurrency(f.total)}</td>
                </tr>
            `).join('');

            const html = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Lista de precios - ${datos.clienteNombre}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 13px;
    color: #1e293b;
    padding: 32px 40px;
    background: #fff;
  }
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 28px;
    padding-bottom: 20px;
    border-bottom: 3px solid #1a73e8;
  }
  .brand h1 {
    font-size: 26px;
    font-weight: 700;
    color: #1a73e8;
    letter-spacing: -0.5px;
  }
  .brand p {
    font-size: 12px;
    color: #64748b;
    margin-top: 4px;
  }
  .doc-meta {
    text-align: right;
    font-size: 12px;
    color: #475569;
    line-height: 1.6;
  }
  .doc-meta strong { color: #1e293b; display: block; font-size: 14px; margin-bottom: 4px; }
  .cliente-box {
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
    border-left: 4px solid #1a73e8;
    padding: 16px 20px;
    border-radius: 8px;
    margin-bottom: 24px;
  }
  .cliente-box .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; font-weight: 600; }
  .cliente-box .name { font-size: 22px; font-weight: 700; color: #1e293b; margin-top: 4px; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
  thead th {
    background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%);
    color: #fff;
    padding: 12px 14px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  thead th.col-money { text-align: right; }
  tbody td {
    padding: 11px 14px;
    border-bottom: 1px solid #e2e8f0;
  }
  .row-even { background: #fff; }
  .row-odd { background: #f8fafc; }
  .col-cant { text-align: center; font-weight: 600; width: 70px; }
  .col-prod { font-weight: 500; }
  .col-money { text-align: right; white-space: nowrap; }
  .col-total { font-weight: 600; color: #1a73e8; }
  .totals-wrap {
    margin-top: 20px;
    display: flex;
    justify-content: flex-end;
  }
  .totals-table {
    width: 340px;
    border-collapse: collapse;
    box-shadow: none;
  }
  .totals-table td {
    padding: 10px 14px;
    border-bottom: 1px solid #e2e8f0;
    font-size: 13px;
  }
  .totals-table td:first-child { color: #64748b; font-weight: 500; }
  .totals-table td:last-child { text-align: right; font-weight: 600; }
  .totals-table tr.comision td { background: #fffbeb; }
  .totals-table tr.saldo td {
    background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%);
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    border: none;
  }
  .totals-table tr.saldo td:first-child { color: rgba(255,255,255,0.9); }
  .footer {
    margin-top: 36px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
    text-align: center;
    font-size: 11px;
    color: #94a3b8;
  }
  @media print {
    body { padding: 20px; }
    @page { margin: 15mm; }
  }
</style>
</head>
<body>
  <div class="doc-header">
    <div class="brand">
      <h1>Luciano Cargas</h1>
      <p>Lista de precios al cliente</p>
    </div>
    <div class="doc-meta">
      <strong>Fecha de carga</strong>
      ${fechaFormateada}<br>
      <span style="font-size:11px;">Generado: ${new Date().toLocaleString('es-AR')}</span>
    </div>
  </div>

  <div class="cliente-box">
    <div class="label">Cliente</div>
    <div class="name">${datos.clienteNombre}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="col-cant">Cant.</th>
        <th>Producto</th>
        <th class="col-money">Precio unit.</th>
        <th class="col-money">Subtotal</th>
      </tr>
    </thead>
    <tbody>${filasHtml}</tbody>
  </table>

  <div class="totals-wrap">
    <table class="totals-table">
      <tr>
        <td>Total productos</td>
        <td>${Utils.formatCurrency(datos.totalProductos)}</td>
      </tr>
      <tr class="comision">
        <td>Comisión (${datos.totalCantidad} u. × ${Utils.formatCurrency(this.comisionPorUnidad)})</td>
        <td>${Utils.formatCurrency(datos.comision)}</td>
      </tr>
      <tr class="saldo">
        <td>Saldo total</td>
        <td>${Utils.formatCurrency(datos.saldoTotal)}</td>
      </tr>
    </table>
  </div>

  <div class="footer">
    Documento generado por el Sistema de Gestión Luciano Cargas · ${fechaCorta}
  </div>

  <script>window.onload = () => window.print();<\/script>
</body>
</html>`;

            const printResult = Utils.openPrintHtml(html);
            if (printResult.mode === 'iframe') {
                Utils.showInfo('Diálogo de impresión abierto en esta pestaña. Elegí "Guardar como PDF".');
            } else {
                Utils.showSuccess('Reporte abierto. Usá "Guardar como PDF" en la impresión.');
            }
        } catch (error) {
            console.error('Error exporting PDF:', error);
            Utils.showError('Error al exportar PDF: ' + error.message);
        }
    }
};

// Cierre
const Cierre = {
    async load() {
        // Cargar resumen del cierre con datos reales
        const resumen = document.getElementById('cierre-resumen');
        if (!resumen) return;
        
        // Mostrar estado de carga
        resumen.innerHTML = `
            <li>Cobranzas: <span class="cierre-loading">Cargando...</span></li>
            <li>Proveedores: <span class="cierre-loading">Cargando...</span></li>
            <li>Stock: <span class="cierre-loading">Cargando...</span></li>
        `;
        
        try {
            // Consultar estado real de cada sección
            const [cobranzas, proveedores, stock] = await Promise.all([
                API.getCobranzas(AppState.currentDate).catch(() => []),
                API.getProveedores().catch(() => []),
                API.getStock().catch(() => [])
            ]);
            
            // Determinar estado de cobranzas
            const cobranzasPendientes = cobranzas.filter(c => c.estado === 'pendiente' && (c.saldo || 0) > 0);
            const estadoCobranzas = cobranzasPendientes.length > 0 
                ? `<span class="cierre-pendiente">Pendientes (${cobranzasPendientes.length})</span>`
                : '<span class="cierre-ok">Sin pendientes</span>';
            
            // Determinar estado de proveedores (proveedores con saldo pendiente)
            const proveedoresPendientes = proveedores.filter(p => (p.saldo || 0) > 0);
            const estadoProveedores = proveedoresPendientes.length > 0
                ? `<span class="cierre-pendiente">Pendientes (${proveedoresPendientes.length})</span>`
                : '<span class="cierre-ok">Sin pendientes</span>';
            
            // Determinar estado del stock (si hay productos con stock bajo)
            const stockBajo = stock.filter(s => s.cantidad <= (s.minimo || 10));
            const estadoStock = stockBajo.length > 0
                ? `<span class="cierre-alerta">Stock bajo (${stockBajo.length} productos)</span>`
                : '<span class="cierre-ok">Actualizado</span>';
            
            // Actualizar resumen con estados reales
            resumen.innerHTML = `
                <li>Cobranzas: ${estadoCobranzas}</li>
                <li>Proveedores: ${estadoProveedores}</li>
                <li>Stock: ${estadoStock}</li>
            `;
        } catch (error) {
            console.error('Error loading cierre resumen:', error);
            resumen.innerHTML = `
                <li>Cobranzas: <span class="cierre-error">Error al cargar</span></li>
                <li>Proveedores: <span class="cierre-error">Error al cargar</span></li>
                <li>Stock: <span class="cierre-error">Error al cargar</span></li>
            `;
        }
    },
    
    async cerrar() {
        const confirmar = await Utils.showConfirm('¿Está seguro de cerrar el día? Esta acción no se puede deshacer.');
        if (!confirmar) return;
        
        Utils.showLoader();
        try {
            // Validar que la fecha esté disponible
            let fecha = AppState.currentDate;
            
            // Si no hay fecha en AppState, usar la fecha actual
            if (!fecha) {
                fecha = new Date().toISOString().split('T')[0];
                console.warn('⚠️ AppState.currentDate no está definida, usando fecha actual:', fecha);
                // Actualizar AppState para futuras operaciones
                AppState.currentDate = fecha;
            }
            
            console.log('📅 Cierre.cerrar() - Fecha para cierre:', fecha);
            console.log('📅 Cierre.cerrar() - AppState.currentDate:', AppState.currentDate);
            console.log('📅 Cierre.cerrar() - Tipo de fecha:', typeof fecha);
            
            if (!fecha || fecha === 'undefined' || fecha === 'null') {
                throw new Error('No se pudo determinar la fecha para cerrar el día');
            }
            
            // Validar formato de fecha
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
                throw new Error(`Formato de fecha inválido: "${fecha}". Debe ser YYYY-MM-DD`);
            }
            
            // Validar que todo esté completo
            await API.cerrarDia(fecha);
            Utils.showSuccess('Día cerrado correctamente');
            
            // Recargar datos después del cierre
            CacheManager.clear();
            
            // Navegar al dashboard después de un breve delay
            setTimeout(() => {
                Navigation.navigateTo('dashboard');
            }, 1500);
        } catch (error) {
            console.error('❌ Error closing day:', error);
            console.error('❌ Stack trace:', error.stack);
            
            // Mensaje de error más descriptivo
            let errorMessage = 'Error al cerrar el día: ' + error.message;
            
            // Si el error menciona precios faltantes, dar más contexto
            if (error.message.includes('precios cliente') || error.message.includes('precios faltantes')) {
                errorMessage += '\n\nPor favor, asegúrate de haber guardado todos los precios al cliente antes de cerrar el día.';
            }
            
            // Si el error menciona recepciones, dar más contexto
            if (error.message.includes('recepciones')) {
                errorMessage += '\n\nPor favor, asegúrate de haber confirmado todas las recepciones antes de cerrar el día.';
            }
            
            Utils.showError(errorMessage);
        } finally {
            Utils.hideLoader();
        }
    }
};

// Cobranzas
const Cobranzas = {
    async load() {
        const tbody = document.getElementById('cobranzas-tbody');
        if (!tbody) return;
        
        // Mostrar loader local
        this.showLocalLoader(tbody);
        
        try {
            const todas = await API.getCobranzas();
            AppState.cobranzas = todas.filter(c => Utils.isCobranzaPendiente(c));
            this.render();
        } catch (error) {
            console.error('Error loading cobranzas:', error);
            this.hideLocalLoader(tbody);
        }
    },
    
    showLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        // Crear overlay de loader
        let overlay = parent.querySelector('.local-loader-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'local-loader-overlay';
            overlay.innerHTML = `
                <div class="local-loader-spinner"></div>
            `;
            parent.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },
    
    hideLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        const overlay = parent.querySelector('.local-loader-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },
    
    render() {
        const tbody = document.getElementById('cobranzas-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        this.hideLocalLoader(tbody);
        
        tbody.innerHTML = '';
        
        if (AppState.cobranzas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: #666;">' +
                '<div style="margin-bottom: 10px;">💰 No hay cobranzas pendientes</div>' +
                '<div style="font-size: 12px; color: #999;">Las cobranzas se generan al cerrar el día</div>' +
                '</td></tr>';
            return;
        }
        
        AppState.cobranzas.forEach(cobranza => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${Utils.formatDate(cobranza.fecha)}</td>
                <td>${cobranza.cliente_nombre || ''}</td>
                <td>${Utils.formatCurrency(Utils.getCobranzaSaldo(cobranza))}</td>
                <td><span class="status-badge status-pendiente">Pendiente</span></td>
                <td>
                    <button class="btn btn-secondary" onclick="Cobranzas.ver('${cobranza.id}')">Ver</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    
    async registrar() {
        const cobranzas = AppState.cobranzas.filter(c => Utils.isCobranzaPendiente(c));
        
        if (cobranzas.length === 0) {
            Utils.showError('No hay cobranzas pendientes');
            return;
        }
        
        const content = `
            <div class="form-group">
                <label>Cliente</label>
                <select id="modal-cobranza-cliente" class="form-control">
                    <option value="">Seleccionar...</option>
                    ${cobranzas.map(c => `<option value="${c.id}">${c.cliente_nombre} - ${Utils.formatCurrency(Utils.getCobranzaSaldo(c))}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Monto</label>
                <input type="text" id="modal-cobranza-monto" class="form-control" data-price-input="true" placeholder="0">
            </div>
        `;
        
        Utils.showModal('Registrar cobro', content, async () => {
            const cobranzaId = document.getElementById('modal-cobranza-cliente').value;
            const monto = Utils.parsePrice(document.getElementById('modal-cobranza-monto').value);
            
            if (!cobranzaId || !monto) {
                Utils.showError('Complete todos los campos');
                return;
            }
            
            try {
                await API.registrarCobro({
                    cobranza_id: cobranzaId,
                    monto: monto,
                    fecha: AppState.currentDate
                });
                
                Utils.showSuccess('Cobro registrado correctamente');
                await Cobranzas.load();
            } catch (error) {
                console.error('Error registering cobro:', error);
                Utils.showError('Error al registrar cobro: ' + error.message);
            }
        });
    },
    
    async ver(id) {
        const cobranza = AppState.cobranzas.find(c => c.id === id);
        if (!cobranza) {
            Utils.showError('Cobranza no encontrada');
            return;
        }
        
        const content = `
            <div class="form-group">
                <label>Cliente</label>
                <input type="text" class="form-control" value="${cobranza.cliente_nombre || ''}" readonly>
            </div>
            <div class="form-group">
                <label>Fecha</label>
                <input type="text" class="form-control" value="${Utils.formatDate(cobranza.fecha)}" readonly>
            </div>
            <div class="form-group">
                <label>Total</label>
                <input type="text" class="form-control" value="${Utils.formatCurrency(cobranza.total || 0)}" readonly>
            </div>
            <div class="form-group">
                <label>Pagado</label>
                <input type="text" class="form-control" value="${Utils.formatCurrency(cobranza.pagado || 0)}" readonly>
            </div>
            <div class="form-group">
                <label>Saldo</label>
                <input type="text" class="form-control" value="${Utils.formatCurrency(cobranza.saldo || 0)}" readonly>
            </div>
            <div class="form-group">
                <label>Estado</label>
                <input type="text" class="form-control" value="${cobranza.estado || 'Pendiente'}" readonly>
            </div>
        `;
        
        // Modal de solo lectura (sin callback onSave)
        Utils.showModal('Detalle de cobranza', content, null);
    }
};

// Pagos
const Pagos = {
    async load() {
        const tbody = document.getElementById('pagos-tbody');
        if (!tbody) return;
        
        // Mostrar loader local
        this.showLocalLoader(tbody);
        
        try {
            // Siempre recargar proveedores para obtener saldos actualizados
            // No usar caché aquí porque los saldos cambian frecuentemente
            AppState.proveedores = await API.getProveedores();
            // Calcular saldos
            this.render(AppState.proveedores);
        } catch (error) {
            console.error('Error loading pagos:', error);
            this.hideLocalLoader(tbody);
            Utils.showError('Error al cargar los proveedores. Intente nuevamente.');
        }
    },
    
    showLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        // Crear overlay de loader
        let overlay = parent.querySelector('.local-loader-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'local-loader-overlay';
            overlay.innerHTML = `
                <div class="local-loader-spinner"></div>
            `;
            parent.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },
    
    hideLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        const overlay = parent.querySelector('.local-loader-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },
    
    render(proveedores) {
        const tbody = document.getElementById('pagos-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        this.hideLocalLoader(tbody);
        
        tbody.innerHTML = '';
        
        proveedores.forEach(proveedor => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${proveedor.nombre || ''}</td>
                <td>${Utils.formatCurrency(proveedor.saldo || 0)}</td>
                <td><span class="status-badge ${proveedor.saldo > 0 ? 'status-pendiente' : ''}">${proveedor.saldo > 0 ? 'Pendiente' : 'Al día'}</span></td>
                <td>
                    <button class="btn btn-primary" onclick="Pagos.registrar('${proveedor.id}')">Registrar pago</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    
    async registrar(proveedorId = null) {
        // Si se proporciona proveedorId, buscar el proveedor
        let proveedorNombre = '';
        let proveedorSaldo = 0;
        if (proveedorId) {
            // Forzar recarga de proveedores para obtener saldo actualizado
            const proveedores = await API.getProveedores();
            const proveedor = proveedores.find(p => p.id === proveedorId);
            if (proveedor) {
                proveedorNombre = proveedor.nombre;
                proveedorSaldo = proveedor.saldo || 0;
            }
        }
        
        const content = `
            <div class="form-group">
                <label>Proveedor</label>
                <input type="text" id="modal-pago-proveedor" class="form-control" value="${proveedorNombre}" readonly>
            </div>
            <div class="form-group">
                <label>Saldo actual</label>
                <input type="text" id="modal-pago-saldo" class="form-control" value="${Utils.formatCurrency(proveedorSaldo)}" readonly style="font-weight: bold; ${proveedorSaldo > 0 ? 'color: #dc3545;' : 'color: #28a745;'}">
            </div>
            <div class="form-group">
                <label>Monto</label>
                <input type="text" id="modal-pago-monto" class="form-control" data-price-input="true" placeholder="0">
            </div>
            <div class="form-group">
                <label>Método</label>
                <select id="modal-pago-metodo" class="form-control">
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="cheque">Cheque</option>
                </select>
            </div>
        `;
        
        Utils.showModal('Registrar pago a proveedor', content, async () => {
            const monto = Utils.parsePrice(document.getElementById('modal-pago-monto').value);
            const metodo = document.getElementById('modal-pago-metodo').value;
            
            if (!monto || monto <= 0 || !proveedorId) {
                Utils.showError('Complete todos los campos con valores válidos');
                return;
            }
            
            try {
                await API.registrarPago({
                    proveedor_id: proveedorId,
                    monto: monto,
                    metodo: metodo,
                    fecha: AppState.currentDate
                });
                
                Utils.showSuccess('Pago registrado correctamente');
                
                // Limpiar caché y estado para forzar recarga
                CacheManager.invalidate('proveedores');
                AppState.proveedores = [];
                
                // Recargar la vista
                await this.load();
            } catch (error) {
                console.error('Error registering pago:', error);
                Utils.showError('Error al registrar el pago. Intente nuevamente.');
            }
        });
    }
};

// Stock
const Stock = {
    async load() {
        const tbody = document.getElementById('stock-tbody');
        if (!tbody) return;
        
        // Mostrar loader local
        this.showLocalLoader(tbody);
        
        try {
            AppState.stock = await API.getStock();
            this.render();
        } catch (error) {
            console.error('Error loading stock:', error);
            this.hideLocalLoader(tbody);
        }
    },
    
    showLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        // Crear overlay de loader
        let overlay = parent.querySelector('.local-loader-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'local-loader-overlay';
            overlay.innerHTML = `
                <div class="local-loader-spinner"></div>
            `;
            parent.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },
    
    hideLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        const overlay = parent.querySelector('.local-loader-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },
    
    render() {
        const tbody = document.getElementById('stock-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        this.hideLocalLoader(tbody);
        
        tbody.innerHTML = '';
        
        if (AppState.stock.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No hay productos en stock</td></tr>';
            return;
        }
        
        AppState.stock.forEach(item => {
            const estado = item.stock_actual <= item.minimo ? 'BAJO' : 'OK';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.producto_nombre || ''}</td>
                <td>${item.stock_actual || 0}</td>
                <td><span class="status-badge ${estado === 'BAJO' ? 'status-bajo' : 'status-activo'}">${estado}</span></td>
                <td>
                    <button class="btn btn-secondary" onclick="Stock.edit('${item.producto_id}', '${(item.producto_nombre || '').replace(/'/g, "\\'")}', ${item.stock_actual || 0})">Editar</button>
                    <button class="btn btn-danger" onclick="Stock.delete('${item.producto_id}', '${(item.producto_nombre || '').replace(/'/g, "\\'")}')">Eliminar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    
    async ajustar() {
        const productos = await API.getProductos();
        const bebidas = productos.filter(p => p.tipo === 'bebida');
        
        const content = `
            <div class="form-group">
                <label>Producto</label>
                <select id="modal-stock-producto" class="form-control">
                    <option value="">Seleccionar...</option>
                    ${bebidas.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Cantidad</label>
                <input type="number" id="modal-stock-cantidad" class="form-control" min="0">
            </div>
        `;
        
        Utils.showModal('Ajustar stock', content, async () => {
            const productoId = document.getElementById('modal-stock-producto').value;
            const cantidad = parseInt(document.getElementById('modal-stock-cantidad').value);
            
            if (!productoId || cantidad === null) {
                Utils.showError('Complete todos los campos');
                return;
            }
            
            try {
                await API.updateStock(productoId, cantidad);
                Utils.showSuccess('Stock actualizado correctamente');
                await this.load();
            } catch (error) {
                console.error('Error updating stock:', error);
            }
        });
    },
    
    async edit(productoId, productoNombre, stockActual) {
        const content = `
            <div class="form-group">
                <label>Producto</label>
                <input type="text" class="form-control" value="${productoNombre}" disabled>
            </div>
            <div class="form-group">
                <label>Cantidad en stock</label>
                <input type="number" id="modal-stock-edit-cantidad" class="form-control" min="0" value="${stockActual}">
            </div>
        `;

        Utils.showModal('Editar stock', content, async () => {
            const cantidad = parseInt(document.getElementById('modal-stock-edit-cantidad').value);

            if (isNaN(cantidad) || cantidad < 0) {
                Utils.showError('Ingrese una cantidad válida');
                return;
            }

            try {
                await API.updateStock(productoId, cantidad);
                Utils.showSuccess('Stock actualizado correctamente');
                CacheManager.invalidate('stock');
                AppState.stock = await API.getStock();
                this.render();
            } catch (error) {
                console.error('Error updating stock:', error);
                Utils.showError('Error al actualizar stock: ' + error.message);
            }
        });
    },

    async delete(productoId, productoNombre) {
        const confirmMsg = `⚠️ ADVERTENCIA: ¿Está seguro de ELIMINAR el registro de stock de "${productoNombre}"?\n\nEsta acción NO se puede deshacer.\n\n¿Desea continuar?`;

        const confirmar = await Utils.showConfirm(confirmMsg);
        if (!confirmar) return;

        Utils.showLoader();
        try {
            await API.deleteStock(productoId);
            Utils.showSuccess('Registro de stock eliminado correctamente');
            CacheManager.invalidate('stock');
            AppState.stock = await API.getStock();
            this.render();
        } catch (error) {
            console.error('Error deleting stock:', error);
            Utils.showError('Error al eliminar stock: ' + error.message);
        } finally {
            Utils.hideLoader();
        }
    },

    async verificarStockBajo() {
        const confirmar = await Utils.showConfirm('¿Desea verificar el stock bajo y enviar notificación por email?');
        if (!confirmar) {
            return;
        }
        
        try {
            Utils.showLoader();
            const resultado = await API.verificarStockBajo();
            Utils.hideLoader();
            
            if (resultado.productos && resultado.productos.length > 0) {
                Utils.showSuccess(`Se encontraron ${resultado.productos.length} producto(s) con stock bajo. Se ha enviado una notificación por email.`);
            } else {
                Utils.showSuccess('No hay productos con stock bajo. ¡Todo está OK!');
            }
        } catch (error) {
            Utils.hideLoader();
            console.error('Error verificando stock:', error);
            Utils.showError('Error al verificar stock: ' + error.message);
        }
    },
    
    async configurarNotificaciones() {
        try {
            Utils.showLoader();
            const config = await API.getConfiguracionNotificaciones();
            Utils.hideLoader();
            
            const content = `
                <div class="form-group">
                    <label>Email(s) para notificaciones</label>
                    <input type="text" id="modal-email-notif" class="form-control" value="${config.email_notificaciones || ''}" placeholder="email1@correo.com, email2@correo.com" required>
                    <small>Se enviarán alertas de stock bajo a estos correos. Separa múltiples emails con comas.</small>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="modal-notif-activas" ${config.notificaciones_activas ? 'checked' : ''}>
                        Activar notificaciones automáticas
                    </label>
                    <small style="display: block; margin-top: 5px;">Las notificaciones se enviarán automáticamente cada día según el trigger configurado</small>
                </div>
            `;
            
            Utils.showModal('Configurar notificaciones', content, async () => {
                const emailsInput = document.getElementById('modal-email-notif').value.trim();
                const activas = document.getElementById('modal-notif-activas').checked;
                
                if (!emailsInput) {
                    Utils.showError('El email es obligatorio');
                    throw new Error('Email requerido');
                }
                
                // Separar emails por comas y validar cada uno
                const emails = emailsInput.split(',').map(e => e.trim()).filter(e => e.length > 0);
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                
                // Validar que todos los emails sean válidos
                const emailsInvalidos = emails.filter(email => !emailRegex.test(email));
                if (emailsInvalidos.length > 0) {
                    Utils.showError(`Email(s) con formato inválido: ${emailsInvalidos.join(', ')}`);
                    throw new Error('Email(s) inválido(s)');
                }
                
                try {
                    // Guardar emails limpios (sin espacios extra)
                    const emailsLimpios = emails.join(', ');
                    
                    await API.saveConfiguracionNotificaciones({
                        email_notificaciones: emailsLimpios,
                        notificaciones_activas: activas
                    });
                    
                    const cantidadEmails = emails.length;
                    const mensaje = cantidadEmails === 1 
                        ? 'Configuración guardada correctamente'
                        : `Configuración guardada. Se enviarán notificaciones a ${cantidadEmails} destinatarios`;
                    Utils.showSuccess(mensaje);
                } catch (error) {
                    console.error('Error guardando configuración:', error);
                    Utils.showError('Error al guardar configuración: ' + error.message);
                    throw error;
                }
            });
        } catch (error) {
            Utils.hideLoader();
            console.error('Error cargando configuración:', error);
            Utils.showError('Error al cargar configuración: ' + error.message);
        }
    }
};

// Historial
const Historial = {
    async load() {
        const tbody = document.getElementById('historial-tbody');
        if (!tbody) return;
        
        // Mostrar loader local
        this.showLocalLoader(tbody);
        
        try {
            const cierres = await API.getHistorial();
            AppState.cierres = cierres; // Guardar en AppState
            this.render(cierres);
        } catch (error) {
            console.error('Error loading historial:', error);
            this.hideLocalLoader(tbody);
        }
    },
    
    showLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        // Crear overlay de loader
        let overlay = parent.querySelector('.local-loader-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'local-loader-overlay';
            overlay.innerHTML = `
                <div class="local-loader-spinner"></div>
            `;
            parent.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },
    
    hideLocalLoader(container) {
        if (!container) return;
        const parent = container.closest('.table-container');
        if (!parent) return;
        
        const overlay = parent.querySelector('.local-loader-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },
    
    render(cierres) {
        const tbody = document.getElementById('historial-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        this.hideLocalLoader(tbody);
        
        tbody.innerHTML = '';
        
        if (cierres.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No hay historial disponible</td></tr>';
            return;
        }
        
        cierres.forEach(cierre => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${Utils.formatDate(cierre.fecha)}</td>
                <td><span class="status-badge status-${cierre.estado || 'cerrado'}">${cierre.estado || 'Cerrado'}</span></td>
                <td>
                    <button class="btn btn-primary btn-table-action" onclick="Historial.verDia('${cierre.fecha}')">Ver día</button>
                    <button class="btn btn-secondary btn-table-action" onclick="Historial.generarReportePDF('${cierre.fecha}')">Reporte</button>
                    <button class="btn btn-danger btn-table-action" onclick="Historial.delete('${cierre.id}', '${cierre.fecha}')">Eliminar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    
    verDia(fecha) {
        AppState.currentDate = fecha;
        Navigation.navigateTo('dashboard');
    },

    async generarReportePDF(fecha) {
        Utils.showLoader();
        try {
            // Cargar todos los datos del día en paralelo
            const [pedidos, recepciones, precios, cobranzas] = await Promise.all([
                API.getPedidos(fecha).catch(() => []),
                API.getRecepcion(fecha).catch(() => []),
                API.getPreciosCliente(fecha).catch(() => []),
                API.getCobranzas(fecha).catch(() => [])
            ]);

            Utils.hideLoader();

            const fechaFormateada = fecha
                ? new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '';

            // Agrupar pedidos por cliente
            const pedidosPorCliente = {};
            pedidos.forEach(p => {
                if (!pedidosPorCliente[p.cliente_nombre]) pedidosPorCliente[p.cliente_nombre] = [];
                pedidosPorCliente[p.cliente_nombre].push(p);
            });

            // Calcular total del día
            const totalDia = cobranzas.reduce((sum, c) => sum + Utils.parsePrice(c.total), 0);
            const totalCobrado = cobranzas.reduce((sum, c) => sum + Utils.parsePrice(c.pagado), 0);
            const totalPendiente = cobranzas.reduce((sum, c) => sum + Utils.parsePrice(c.saldo), 0);

            const formatPeso = (n) => Utils.formatCurrency(n || 0);

            // Sección pedidos por cliente
            let seccionPedidos = '';
            Object.entries(pedidosPorCliente).forEach(([cliente, items]) => {
                const preciosCliente = precios.filter(pr => pr.cliente_nombre === cliente);
                seccionPedidos += `
                    <tr style="background:#f0f4ff;">
                        <td colspan="4" style="font-weight:bold;padding:6px 8px;">👤 ${cliente}</td>
                    </tr>`;
                items.forEach(item => {
                    const precioReg = preciosCliente.find(pr => pr.producto_id === item.producto_id);
                    const precioUnit = precioReg ? Utils.parsePrice(precioReg.precio_cliente) || 0 : 0;
                    const subtotal = item.cantidad * precioUnit;
                    seccionPedidos += `
                    <tr>
                        <td style="padding:4px 8px 4px 20px;">${item.producto_nombre || ''}</td>
                        <td style="padding:4px 8px;text-align:center;">${item.cantidad} ${item.tipo === 'bebida' ? 'u.' : 'kg'}</td>
                        <td style="padding:4px 8px;text-align:right;">${formatPeso(precioUnit)}</td>
                        <td style="padding:4px 8px;text-align:right;">${formatPeso(subtotal)}</td>
                    </tr>`;
                });
            });

            // Sección recepción
            let seccionRecepcion = recepciones.map(r => `
                <tr>
                    <td style="padding:4px 8px;">${r.producto_nombre || ''}</td>
                    <td style="padding:4px 8px;text-align:center;">${r.llego || 0}</td>
                    <td style="padding:4px 8px;text-align:right;">${formatPeso(r.precio_real)}</td>
                    <td style="padding:4px 8px;text-align:right;">${formatPeso((r.llego || 0) * (r.precio_real || 0))}</td>
                </tr>`).join('');

            // Sección cobranzas
            let seccionCobranzas = cobranzas.map(c => `
                <tr>
                    <td style="padding:4px 8px;">${c.cliente_nombre || ''}</td>
                    <td style="padding:4px 8px;text-align:right;">${formatPeso(c.total)}</td>
                    <td style="padding:4px 8px;text-align:right;">${formatPeso(c.pagado)}</td>
                    <td style="padding:4px 8px;text-align:right;color:${Utils.parsePrice(c.saldo) > 0 ? '#dc3545' : '#28a745'};">${formatPeso(c.saldo)}</td>
                </tr>`).join('');

            const html = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte - ${fechaFormateada}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #222; padding: 30px; }
  h1 { font-size: 22px; color: #1a73e8; margin-bottom: 4px; }
  .subtitle { color: #555; margin-bottom: 24px; font-size: 13px; }
  h2 { font-size: 15px; margin: 20px 0 8px; color: #333; border-bottom: 2px solid #1a73e8; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { background: #1a73e8; color: white; padding: 6px 8px; text-align: left; font-size: 12px; }
  tr:nth-child(even) { background: #f8f9fa; }
  .resumen { display: flex; gap: 20px; margin-top: 20px; }
  .resumen-card { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 12px; text-align: center; }
  .resumen-card .valor { font-size: 20px; font-weight: bold; margin-top: 4px; }
  .verde { color: #28a745; }
  .rojo { color: #dc3545; }
  .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
  @media print {
    body { padding: 15px; }
    button { display: none; }
  }
</style>
</head>
<body>
  <h1>📦 Luciano Cargas — Reporte del Día</h1>
  <p class="subtitle">Fecha: <strong>${fechaFormateada}</strong> &nbsp;|&nbsp; Generado: ${new Date().toLocaleString('es-AR')}</p>

  <h2>🛒 Pedidos por Cliente</h2>
  <table>
    <thead><tr><th>Producto</th><th style="text-align:center;">Cantidad</th><th style="text-align:right;">Precio Unit.</th><th style="text-align:right;">Subtotal</th></tr></thead>
    <tbody>${seccionPedidos || '<tr><td colspan="4" style="padding:8px;text-align:center;color:#999;">Sin pedidos</td></tr>'}</tbody>
  </table>

  <h2>📥 Recepción de Mercadería</h2>
  <table>
    <thead><tr><th>Producto</th><th style="text-align:center;">Cantidad recibida</th><th style="text-align:right;">Precio proveedor</th><th style="text-align:right;">Total costo</th></tr></thead>
    <tbody>${seccionRecepcion || '<tr><td colspan="4" style="padding:8px;text-align:center;color:#999;">Sin recepciones</td></tr>'}</tbody>
  </table>

  <h2>💵 Cobranzas del Día</h2>
  <table>
    <thead><tr><th>Cliente</th><th style="text-align:right;">Total</th><th style="text-align:right;">Cobrado</th><th style="text-align:right;">Saldo</th></tr></thead>
    <tbody>${seccionCobranzas || '<tr><td colspan="4" style="padding:8px;text-align:center;color:#999;">Sin cobranzas</td></tr>'}</tbody>
  </table>

  <div class="resumen">
    <div class="resumen-card">
      <div style="font-size:12px;color:#555;">TOTAL FACTURADO</div>
      <div class="valor">${formatPeso(totalDia)}</div>
    </div>
    <div class="resumen-card">
      <div style="font-size:12px;color:#555;">TOTAL COBRADO</div>
      <div class="valor verde">${formatPeso(totalCobrado)}</div>
    </div>
    <div class="resumen-card">
      <div style="font-size:12px;color:#555;">SALDO PENDIENTE</div>
      <div class="valor ${totalPendiente > 0 ? 'rojo' : 'verde'}">${formatPeso(totalPendiente)}</div>
    </div>
  </div>

  <div class="footer">Sistema de Gestión Luciano Cargas — Documento generado automáticamente</div>

  <script>window.onload = () => window.print();<\/script>
</body>
</html>`;

            const printResult = Utils.openPrintHtml(html);
            if (printResult.mode === 'iframe') {
                Utils.showInfo('Diálogo de impresión abierto en esta pestaña. Elegí "Guardar como PDF".');
            } else {
                Utils.showSuccess('Reporte generado. Usá "Guardar como PDF" en la impresión.');
            }

        } catch (error) {
            console.error('Error generando reporte:', error);
            Utils.showError('Error al generar el reporte: ' + error.message);
        } finally {
            Utils.hideLoader();
        }
    },

    async delete(id, fecha) {
        const fechaFormateada = fecha
            ? new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : fecha;

        const confirmMsg = `⚠️ ADVERTENCIA: ¿Está seguro de ELIMINAR el historial del día ${fechaFormateada}?\n\nEsta acción NO se puede deshacer. Se eliminará el registro del cierre.\n\n¿Desea continuar?`;

        const confirmar = await Utils.showConfirm(confirmMsg);
        if (!confirmar) return;

        Utils.showLoader();
        try {
            await API.deleteHistorial(id);
            Utils.showSuccess('Historial eliminado correctamente');
            CacheManager.invalidate('historial');
            await this.load();
        } catch (error) {
            console.error('Error deleting historial:', error);
            Utils.showError('Error al eliminar historial: ' + error.message);
        } finally {
            Utils.hideLoader();
        }
    }
};

// Pre-carga de datos de catálogo
const DataLoader = {
    async preloadCatalogData() {
        console.log('🚀 Pre-cargando datos de catálogo...');
        
        try {
            // Cargar datos de catálogo en paralelo (estos cambian poco)
            const [clientes, productos, proveedores] = await Promise.all([
                API.getClientes(),
                API.getProductos(),
                API.getProveedores()
            ]);
            
            AppState.clientes = clientes;
            AppState.productos = productos;
            AppState.proveedores = proveedores;
            
            console.log(`✅ Datos pre-cargados:
                - Clientes: ${clientes.length}
                - Productos: ${productos.length}
                - Proveedores: ${proveedores.length}`);
        } catch (error) {
            console.error('❌ Error pre-cargando datos:', error);
            Utils.showError('Error al cargar datos iniciales. Por favor, recargue la página.');
        }
    }
};

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📋 DOM cargado, iniciando aplicación...');
    
    // Pre-cargar datos de catálogo
    await DataLoader.preloadCatalogData();
    
    Navigation.init();
    
    // Helper para agregar event listeners con manejo de errores y loader
    const addButtonListener = (buttonId, handler, loadingText = 'Cargando...') => {
        const btn = document.getElementById(buttonId);
        if (btn) {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                
                // Evitar múltiples clicks mientras está cargando
                if (btn.disabled || btn.classList.contains('loading')) {
                    return;
                }
                
                try {
                    await Utils.withButtonLoader(btn, handler, loadingText);
                } catch (error) {
                    console.error(`Error en ${buttonId}:`, error);
                    Utils.showError('Ocurrió un error: ' + error.message);
                }
            });
        } else {
            console.warn(`⚠️ Botón ${buttonId} no encontrado`);
        }
    };
    
    // Registrar todos los event listeners con textos de loading personalizados
    addButtonListener('btn-agregar-cliente', () => Clientes.add(), 'Cargando...');
    addButtonListener('btn-agregar-producto', () => Productos.add(), 'Cargando...');
    addButtonListener('btn-agregar-proveedor', () => ProveedoresGestion.add(), 'Cargando...');
    addButtonListener('btn-agregar-pedido', () => Pedidos.add(), 'Cargando...');
    addButtonListener('btn-guardar-pedidos', () => Pedidos.save(), 'Guardando...');
    addButtonListener('btn-imprimir-pedido', () => ProveedoresPedido.imprimir(), 'Generando...');
    addButtonListener('btn-marcar-pedido', () => ProveedoresPedido.marcar(), 'Marcando...');
    addButtonListener('btn-guardar-recepcion', () => Recepcion.save(), 'Guardando...');
    addButtonListener('btn-confirmar-recepcion', () => Recepcion.confirmar(), 'Confirmando...');
    addButtonListener('btn-generar-lista-precios', () => Precios.generarLista(), 'Generando...');
    addButtonListener('btn-guardar-precios', () => Precios.save(), 'Guardando...');
    addButtonListener('btn-limpiar-filtro', () => Precios.limpiarFiltro(), 'Limpiando...');
    addButtonListener('btn-exportar-pdf-precios', () => Precios.exportarPDF(), 'Generando PDF...');
    
    // Event listeners para filtros de precios
    const preciosFiltroCliente = document.getElementById('precios-filtro-cliente');
    if (preciosFiltroCliente) {
        preciosFiltroCliente.addEventListener('change', (e) => {
            Precios.filterByCliente(e.target.value || null);
        });
    }
    
    const preciosComision = document.getElementById('precios-comision');
    if (preciosComision) {
        preciosComision.addEventListener('change', () => {
            Precios.updateComision();
        });
        preciosComision.addEventListener('input', () => {
            Precios.updateComision();
        });
    }
    Utils.enablePriceInputs(document);
    addButtonListener('btn-volver-cierre', () => Navigation.navigateTo('dashboard'), 'Volviendo...');
    addButtonListener('btn-cerrar-dia', () => Cierre.cerrar(), 'Cerrando día...');
    addButtonListener('btn-ver-cobranza', () => {
        // Ver la primera cobranza seleccionada (se puede mejorar con selección)
        if (AppState.cobranzas.length > 0) {
            Cobranzas.ver(AppState.cobranzas[0].id);
        } else {
            Utils.showError('No hay cobranzas para ver');
        }
    });
    addButtonListener('btn-registrar-cobro', () => Cobranzas.registrar(), 'Registrando...');
    addButtonListener('btn-registrar-pago', () => {
        // Mostrar modal para seleccionar proveedor
        const proveedores = AppState.proveedores || [];
        if (proveedores.length === 0) {
            Utils.showError('No hay proveedores disponibles');
            return;
        }
        
        const content = `
            <div class="form-group">
                <label>Proveedor</label>
                <select id="modal-pago-proveedor-select" class="form-control">
                    <option value="">Seleccionar...</option>
                    ${proveedores.map(p => `<option value="${p.id}">${p.nombre} - Saldo: ${Utils.formatCurrency(p.saldo || 0)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Monto</label>
                <input type="text" id="modal-pago-monto" class="form-control" data-price-input="true" placeholder="0">
            </div>
            <div class="form-group">
                <label>Método</label>
                <select id="modal-pago-metodo" class="form-control">
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="cheque">Cheque</option>
                </select>
            </div>
        `;
        
        Utils.showModal('Registrar pago a proveedor', content, async () => {
            const proveedorId = document.getElementById('modal-pago-proveedor-select').value;
            const monto = Utils.parsePrice(document.getElementById('modal-pago-monto').value);
            const metodo = document.getElementById('modal-pago-metodo').value;
            
            if (!proveedorId || !monto) {
                Utils.showError('Complete todos los campos');
                return;
            }
            
            try {
                await API.registrarPago({
                    proveedor_id: proveedorId,
                    monto: monto,
                    metodo: metodo,
                    fecha: AppState.currentDate
                });
                
                Utils.showSuccess('Pago registrado correctamente');
                await Pagos.load();
            } catch (error) {
                console.error('Error registering pago:', error);
                throw error;
            }
        });
    });
    addButtonListener('btn-ajustar-stock', () => Stock.ajustar(), 'Ajustando...');
    addButtonListener('btn-verificar-stock', () => Stock.verificarStockBajo(), 'Verificando...');
    addButtonListener('btn-config-notificaciones', () => Stock.configurarNotificaciones(), 'Cargando...');
    addButtonListener('btn-ver-dia', () => {
        // Ver el primer día del historial (se puede mejorar con selección)
        if (AppState.cierres.length > 0) {
            Historial.verDia(AppState.cierres[0].fecha);
        } else {
            Utils.showError('No hay días para ver');
        }
    });
    
    // Cargar página inicial
    Navigation.navigateTo('dashboard');
});

