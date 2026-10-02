// Configuración de la API
// API_CONFIG ya está definido en auth.js (se carga primero)
// No redeclarar para evitar error "already declared"

function fechaHoyAR() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

// Estado de la aplicación
const AppState = {
    currentPage: 'dashboard',
    currentDate: fechaHoyAR(),
    pedidos: [],
    productos: [],
    clientes: [],
    proveedores: [],
    recepcion: [],
    precios: [],
    cobranzas: [],
    pagos: [],
    stock: [],
    cierres: [],
    whatsappAutoEnvio: false,
    whatsappModo: 'manual'
};

// Sistema de caché (memoria + sessionStorage para recargas instantáneas)
const CacheManager = {
    cache: {},
    timestamps: {},
    DEBUG: false,
    STORAGE_KEY: 'sg_cache_v4',
    CATALOG_STORAGE_KEY: 'sg_catalog_v2',
    _persistTimer: null,

    TTL: {
        clientes: 60 * 60 * 1000,
        productos: 60 * 60 * 1000,
        proveedores: 45 * 60 * 1000,
        bootstrap: 5 * 60 * 1000,
        pedidos: 5 * 60 * 1000,
        recepcion: 5 * 60 * 1000,
        precios: 5 * 60 * 1000,
        cobranzas: 10 * 60 * 1000,
        stock: 10 * 60 * 1000,
        historial: 15 * 60 * 1000,
        cierres: 15 * 60 * 1000,
        dashboard: 5 * 60 * 1000,
        flujo: 5 * 60 * 1000,
        whatsapp: 5 * 60 * 1000
    },

    CATALOG_KEYS: ['clientes', 'productos', 'proveedores'],

    log(...args) {
        if (this.DEBUG) console.log(...args);
    },

    _initFromStorage() {
        try {
            const raw = sessionStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.cache && parsed.timestamps) {
                    this.cache = parsed.cache;
                    this.timestamps = parsed.timestamps;
                }
            }
            const catalogRaw = localStorage.getItem(this.CATALOG_STORAGE_KEY);
            if (catalogRaw) {
                const catalog = JSON.parse(catalogRaw);
                this.CATALOG_KEYS.forEach(key => {
                    if (catalog[key] && catalog.timestamps?.[key] && !this.cache[key]) {
                        this.cache[key] = catalog[key];
                        this.timestamps[key] = catalog.timestamps[key];
                    }
                });
            }
        } catch (e) {
            // storage no disponible o datos corruptos
        }
    },

    hydrateAppStateFromCache() {
        const clientes = this.get('clientes');
        const productos = this.get('productos');
        const proveedores = this.get('proveedores');
        if (clientes) AppState.clientes = clientes;
        if (productos) AppState.productos = productos;
        if (proveedores) AppState.proveedores = proveedores;
    },

    _schedulePersist() {
        if (this._persistTimer) return;
        this._persistTimer = setTimeout(() => {
            this._persistTimer = null;
            this._persist();
        }, 250);
    },

    _persist() {
        try {
            sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify({
                cache: this.cache,
                timestamps: this.timestamps
            }));
        } catch (e) {
            // Cuota excedida: ignorar persistencia
        }
    },

    get(key) {
        const now = Date.now();
        const cached = this.cache[key];
        const timestamp = this.timestamps[key];

        if (!cached || !timestamp) {
            return null;
        }

        const dataType = key.split(':')[0];
        const ttl = this.TTL[dataType] || 60000;

        if (now - timestamp > ttl) {
            delete this.cache[key];
            delete this.timestamps[key];
            this._schedulePersist();
            return null;
        }

        return cached;
    },

    set(key, data) {
        this.cache[key] = data;
        this.timestamps[key] = Date.now();
        this._schedulePersist();
        if (this.CATALOG_KEYS.includes(key)) {
            this._persistCatalog();
        }
    },

    _persistCatalog() {
        try {
            const payload = { timestamps: {}, cache: {} };
            this.CATALOG_KEYS.forEach(key => {
                if (this.cache[key]) {
                    payload.cache[key] = this.cache[key];
                    payload.timestamps[key] = this.timestamps[key];
                }
            });
            localStorage.setItem(this.CATALOG_STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            // cuota excedida
        }
    },

    invalidate(key) {
        delete this.cache[key];
        delete this.timestamps[key];
        this._schedulePersist();
    },

    invalidatePattern(pattern) {
        Object.keys(this.cache).forEach(key => {
            if (key.startsWith(pattern)) {
                delete this.cache[key];
                delete this.timestamps[key];
            }
        });
        this._schedulePersist();
    },

    invalidateAllExcept(keepPrefixes = []) {
        Object.keys(this.cache).forEach(key => {
            const keep = keepPrefixes.some(prefix => key.startsWith(prefix));
            if (!keep) {
                delete this.cache[key];
                delete this.timestamps[key];
            }
        });
        this._schedulePersist();
    },

    clear() {
        this.cache = {};
        this.timestamps = {};
        try {
            sessionStorage.removeItem(this.STORAGE_KEY);
            localStorage.removeItem(this.CATALOG_STORAGE_KEY);
        } catch (e) {
            // ignore
        }
    }
};

CacheManager._initFromStorage();
CacheManager.hydrateAppStateFromCache();

// Gestión del día del pedido (recepción puede ser al día siguiente)
const DiaOperativo = {
    diasPendientes: [],
    workDate: null,
    _initialized: false,

    today() {
        return fechaHoyAR();
    },

    formatFechaLabel(fecha) {
        const d = new Date(fecha + 'T12:00:00');
        const corta = d.toLocaleDateString('es-AR', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        if (fecha === this.today()) return `Hoy — ${corta}`;
        return corta;
    },

    getEstadoLabel(estado) {
        const labels = {
            recepcion_pendiente: 'Recepción pendiente',
            precios_pendiente: 'Falta cargar precios',
            listo_cierre: 'Listo para cerrar',
            cerrado: 'Día cerrado',
            nuevo: 'Sin pedidos aún'
        };
        return labels[estado] || estado;
    },

    getEstadoClass(estado) {
        const classes = {
            recepcion_pendiente: 'estado-recepcion',
            precios_pendiente: 'estado-precios',
            listo_cierre: 'estado-listo',
            cerrado: 'estado-listo',
            nuevo: 'estado-nuevo'
        };
        return classes[estado] || 'estado-nuevo';
    },

    getDiaInfo(fecha) {
        return this.diasPendientes.find(d => d.fecha === fecha) || null;
    },

    diaCerrado(fecha) {
        const info = this.getDiaInfo(fecha || this.workDate || AppState.currentDate);
        return !!(info && info.estado === 'cerrado');
    },

    init() {
        if (this._initialized) return;
        document.querySelectorAll('.dia-operativo-select').forEach(select => {
            if (select.dataset.bound === 'true') return;
            select.dataset.bound = 'true';
            select.addEventListener('change', async (e) => {
                if (this._ignoreSelectChange) return;
                await this.setWorkDate(e.target.value);
            });
        });
        this._initialized = true;
    },

    async refresh(options = {}) {
        try {
            this.diasPendientes = await API.getDiasPendientes();
            await this.marcarHoyCerrado();
        } catch (error) {
            console.warn('No se pudieron cargar días pendientes:', error.message);
            const hoy = this.today();
            this.diasPendientes = [{
                fecha: hoy,
                pedidos_count: 0,
                recepcion_confirmada: false,
                precios_completos: false,
                estado: 'nuevo'
            }];
        }

        if (!options.skipRender) {
            this.renderSelectors();
            this.renderEstadoPanels();
            this.renderDashboardBanner();
            this.renderNavBadge();
        }
    },

    async resolveWorkDate(options = {}) {
        if (!options.skipRefresh) {
            await this.refresh({ skipRender: true });
        }
        const hoy = this.today();
        const openFechas = this.diasPendientes.map(d => d.fecha);
        const stored = sessionStorage.getItem('sg_work_date');

        if (stored && openFechas.includes(stored)) {
            this.workDate = stored;
        } else {
            const conPedidos = this.diasPendientes.filter(d => d.pedidos_count > 0);
            const necesitaTrabajo = conPedidos.filter(d =>
                d.estado === 'recepcion_pendiente' || d.estado === 'precios_pendiente'
            );

            if (necesitaTrabajo.length > 0) {
                this.workDate = necesitaTrabajo[0].fecha;
            } else if (openFechas.includes(hoy)) {
                this.workDate = hoy;
            } else if (conPedidos.length > 0) {
                this.workDate = conPedidos[conPedidos.length - 1].fecha;
            } else {
                this.workDate = hoy;
            }
        }

        AppState.currentDate = this.workDate;
        sessionStorage.setItem('sg_work_date', this.workDate);
        this.renderSelectors();
        this.renderEstadoPanels();
        this.renderDashboardBanner();
        this.renderNavBadge();
    },

    async setWorkDate(fecha, options = {}) {
        if (!fecha || fecha === this.workDate) return;
        this.workDate = fecha;
        AppState.currentDate = fecha;
        sessionStorage.setItem('sg_work_date', fecha);
        this.renderSelectors();
        this.renderEstadoPanels();

        if (!options.skipReload && AppState.currentPage) {
            const flowPages = ['pedidos', 'recepcion', 'precios', 'cobros-hoy', 'pagos', 'pagos-pendientes', 'cierre'];
            if (flowPages.includes(AppState.currentPage)) {
                await Navigation.loadPageData(AppState.currentPage);
            }
        }
    },

    renderSelectors() {
        const fechas = this.diasPendientes.map(d => d.fecha);
        if (this.workDate && !fechas.includes(this.workDate)) {
            fechas.push(this.workDate);
            fechas.sort();
        }

        this._ignoreSelectChange = true;
        document.querySelectorAll('.dia-operativo-select').forEach(select => {
            const current = this.workDate || this.today();
            select.innerHTML = '';

            fechas.forEach(fecha => {
                const info = this.getDiaInfo(fecha);
                const option = document.createElement('option');
                option.value = fecha;
                let text = this.formatFechaLabel(fecha);
                if (info && info.pedidos_count > 0) {
                    text += ` (${info.pedidos_count} pedidos)`;
                }
                option.textContent = text;
                select.appendChild(option);
            });

            select.value = current;
        });
        setTimeout(() => { this._ignoreSelectChange = false; }, 0);
    },

    renderEstadoPanels() {
        const info = this.getDiaInfo(this.workDate);
        const estado = info ? info.estado : 'nuevo';
        const label = this.getEstadoLabel(estado);
        const cssClass = this.getEstadoClass(estado);

        ['pedidos', 'recepcion', 'precios', 'cierre'].forEach(page => {
            const el = document.getElementById(`${page}-estado-dia`);
            if (!el) return;
            let label = this.getEstadoLabel(estado);
            if (info && info.estado === 'recepcion_pendiente' && info.recepcion_total > 0) {
                label = `Recepción ${info.recepcion_confirmados || 0}/${info.recepcion_total}`;
            }
            el.textContent = label;
            el.className = `dia-operativo-estado ${cssClass}`;
        });
    },

    async marcarHoyCerrado() {
        const hoy = this.workDate || this.today();
        const info = this.getDiaInfo(hoy);
        if (info) return;

        try {
            const cierres = await API.getCierres();
            const cerrado = (cierres || []).find(cierre => {
                return Utils.fechaIso(cierre.fecha) === hoy && String(cierre.estado || '') !== 'cerrando';
            });
            if (!cerrado) return;

            this.diasPendientes = (this.diasPendientes || []).filter(dia => dia.fecha !== hoy);
            this.diasPendientes.push({
                fecha: hoy,
                pedidos_count: info?.pedidos_count || 0,
                recepcion_confirmada: true,
                precios_completos: true,
                estado: 'cerrado'
            });
            this.diasPendientes.sort((a, b) => a.fecha.localeCompare(b.fecha));
        } catch (error) {
            console.warn('No se pudo verificar si el día está cerrado:', error.message);
        }
    },

    siguientePaso(info) {
        const estado = info ? info.estado : 'nuevo';
        if (estado === 'cerrado') {
            return { pagina: 'historial', texto: 'Ver historial', detalle: 'Este día ya está cerrado.' };
        }
        if (estado === 'recepcion_pendiente') {
            return { pagina: 'recepcion', texto: 'Confirmar recepción', detalle: 'Falta confirmar lo que llegó.' };
        }
        if (estado === 'precios_pendiente') {
            return { pagina: 'precios', texto: 'Cargar precios', detalle: 'La recepción está lista. Falta el precio al cliente.' };
        }
        if (estado === 'listo_cierre') {
            return { pagina: 'cobros-hoy', texto: 'Cobrar a los clientes', detalle: 'Recepción y precios listos. Siguen cobro, deudas, pagos y al final el cierre.' };
        }
        return { pagina: 'pedidos', texto: 'Cargar pedidos', detalle: 'Todavía no hay pedidos para este día.' };
    },

    renderDashboardBanner() {
        const banner = document.getElementById('dashboard-pendientes-banner');
        if (!banner) return;

        const pendientes = this.diasPendientes.filter(d =>
            d.pedidos_count > 0 &&
            d.estado !== 'listo_cierre' &&
            d.estado !== 'nuevo' &&
            d.estado !== 'cerrado'
        );
        const foco = pendientes[0] || this.getDiaInfo(this.workDate) || { fecha: this.today(), estado: 'nuevo', pedidos_count: 0 };
        const paso = this.siguientePaso(foco);
        const items = pendientes.map(d => {
            return `<li><strong>${this.formatFechaLabel(d.fecha)}</strong> — ${this.getEstadoLabel(d.estado)} (${d.pedidos_count} pedidos)</li>`;
        }).join('');

        banner.hidden = false;
        banner.innerHTML = `
            <div class="pendientes-banner-text">
                <strong>${paso.detalle}</strong>
                <span class="pendientes-banner-fecha">${this.formatFechaLabel(foco.fecha)}</span>
                ${items ? `<ul>${items}</ul>` : ''}
            </div>
            <div class="pendientes-banner-actions">
                <button type="button" class="btn btn-primary" id="btn-banner-siguiente">${paso.texto}</button>
            </div>
        `;

        const btn = document.getElementById('btn-banner-siguiente');
        if (btn) {
            btn.onclick = async () => {
                await this.setWorkDate(foco.fecha, { skipReload: true });
                Navigation.navigateTo(paso.pagina);
            };
        }
    },

    renderNavBadge() {
        const badge = document.getElementById('nav-badge-recepcion');
        if (!badge) return;

        const count = this.diasPendientes.filter(d =>
            d.pedidos_count > 0 &&
            (d.estado === 'recepcion_pendiente' ||
                (d.recepcion_total > 0 && (d.recepcion_confirmados || 0) < d.recepcion_total))
        ).length;

        if (count > 0) {
            badge.textContent = String(count);
            badge.hidden = false;
        } else {
            badge.hidden = true;
        }
    },

    invalidate() {
        CacheManager.invalidate('flujo:dias-pendientes');
    }
};

// Utilidades
const Utils = {
    formatDate: (date) => {
        const iso = Utils.fechaIso(date);
        if (!iso) return '';
        const [year, month, day] = iso.split('-');
        return `${day}/${month}`;
    },

    fechaIso(value) {
        if (!value) return '';
        const raw = String(value).trim();
        const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
        if (match) return match[1];
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return '';
        return parsed.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
    },

    nombreCatalogo(registro, tipo) {
        const esProducto = tipo === 'producto';
        const directo = registro?.[esProducto ? 'producto_nombre' : 'cliente_nombre'];
        if (directo) return directo;
        const id = registro?.[esProducto ? 'producto_id' : 'cliente_id'];
        const lista = esProducto ? AppState.productos : AppState.clientes;
        const hit = (lista || []).find(item => String(item.id) === String(id));
        if (hit?.nombre) return hit.nombre;
        return esProducto ? 'Producto sin ficha' : 'Cliente sin ficha';
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
    
    showModal: (title, content, onSave = null, saveLabel = 'Guardar') => {
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
        saveBtn.textContent = saveLabel;
        cancelBtn.textContent = 'Cancelar';
        
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
            const cancel = document.getElementById('modal-cancel');
            if (cancel) cancel.textContent = 'Cancelar';
            
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
                    
                    const stayOpen = await onSave();
                    if (stayOpen === true) {
                        newSaveBtn.disabled = false;
                        newSaveBtn.textContent = saveLabel;
                        return;
                    }
                    
                    // Cerrar solo si todo salió bien
                    closeModal();
                } catch (error) {
                    console.error('Error en onSave:', error);
                    // Re-habilitar botón si hay error
                    newSaveBtn.disabled = false;
                    newSaveBtn.textContent = saveLabel;
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
        return new Promise((resolve) => {
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
                resolve();
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
            
            const closeAlert = () => {
                overlay.classList.remove('active');
                document.removeEventListener('keydown', escapeHandler);
                resolve();
            };

            newBtn.onclick = closeAlert;
            
            // Cerrar con Escape
            const escapeHandler = (e) => {
                if (e.key === 'Escape') closeAlert();
            };
            document.addEventListener('keydown', escapeHandler);
        } catch (error) {
            console.error('❌ Error en showCustomAlert:', error);
            console.error('❌ Stack trace:', error.stack);
            // Fallback a alert nativo
            window.alert(`${title}: ${message}`);
            resolve();
        }
        });
    },
    
    showConfirm: (message, onConfirm, onCancel = null, labels = null) => {
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

                const titleEl = document.getElementById('custom-confirm-title');
                if (titleEl) titleEl.textContent = labels?.title || 'Confirmar acción';
                
                // Crear nuevos botones para evitar múltiples listeners
                const newAcceptBtn = acceptBtn.cloneNode(true);
                const newCancelBtn = cancelBtn.cloneNode(true);
                newAcceptBtn.textContent = labels?.accept || 'Aceptar';
                newCancelBtn.textContent = labels?.cancel || 'Cancelar';
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
    
    LOADER_SPINNER_HTML: '<div class="app-loader-spinner" aria-hidden="true"></div>',

    _getLoaderParent(container) {
        if (!container) return null;
        const el = typeof container === 'string' ? document.querySelector(container) : container;
        if (!el) return null;
        const parent = el.closest('.table-container') ||
            el.closest('.chart-container') ||
            el.closest('.cierre-resumen-wrap') ||
            el.parentElement;
        if (!parent) return null;
        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }
        return parent;
    },

    _showContainerLoader(container) {
        const parent = this._getLoaderParent(container);
        if (!parent) return;
        let overlay = parent.querySelector('.app-loader-overlay, .local-loader-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'app-loader-overlay';
            overlay.setAttribute('aria-busy', 'true');
            overlay.innerHTML = this.LOADER_SPINNER_HTML;
            parent.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },

    _hideContainerLoader(container) {
        const parent = this._getLoaderParent(container);
        if (!parent) return;
        const overlay = parent.querySelector('.app-loader-overlay, .local-loader-overlay');
        if (overlay) overlay.style.display = 'none';
    },

    showLoader(container) {
        if (!container) {
            const loader = document.getElementById('global-loader');
            if (loader) loader.style.display = 'flex';
            return;
        }
        this._showContainerLoader(container);
    },

    hideLoader(container) {
        if (!container) {
            const loader = document.getElementById('global-loader');
            if (loader) loader.style.display = 'none';
            return;
        }
        this._hideContainerLoader(container);
    },

    showTableLoader(container) {
        this.showLoader(container);
    },

    hideTableLoader(container) {
        this.hideLoader(container);
    },

    upsertInList(list, item, idField = 'id') {
        const idx = list.findIndex(x => String(x[idField]) === String(item[idField]));
        if (idx >= 0) {
            list[idx] = { ...list[idx], ...item };
        } else {
            list.push(item);
        }
        return list;
    },

    removeFromList(list, id, idField = 'id') {
        const idx = list.findIndex(x => String(x[idField]) === String(id));
        if (idx >= 0) list.splice(idx, 1);
        return list;
    },

    setButtonLoading(button, isLoading = true) {
        if (!button) return;
        if (isLoading) {
            if (!button.dataset.originalHtml) {
                button.dataset.originalHtml = button.innerHTML;
            }
            button.disabled = true;
            button.classList.add('loading');
            button.innerHTML = '<span class="app-loader-spinner app-loader-spinner--btn" aria-hidden="true"></span>';
        } else {
            button.disabled = false;
            button.classList.remove('loading');
            if (button.dataset.originalHtml) {
                button.innerHTML = button.dataset.originalHtml;
                delete button.dataset.originalHtml;
            }
        }
    },

    withButtonLoader: async (button, asyncFn) => {
        try {
            Utils.setButtonLoading(button, true);
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
    _pending: {},
    _bootstrapPromise: null,

    _buildDedupKey(endpoint, method, data) {
        const payload = { ...(data || {}) };
        delete payload.__timeout;
        return `${method}:${endpoint}:${JSON.stringify(payload)}`;
    },

    async request(endpoint, method = 'GET', data = null, retryCount = 0) {
        const dedupKey = this._buildDedupKey(endpoint, method, data);
        if (this._pending[dedupKey]) {
            return this._pending[dedupKey];
        }

        const promise = this._executeRequest(endpoint, method, data, retryCount)
            .finally(() => {
                delete this._pending[dedupKey];
            });

        this._pending[dedupKey] = promise;
        return promise;
    },

    _executeRequest(endpoint, method, data, retryCount) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, value) => {
                if (settled) return;
                settled = true;
                fn(value);
            };

            const callbackName = 'apiCallback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const timeoutMs = data?.__timeout || 30000;

            let url = `${API_CONFIG.baseUrl}?endpoint=${encodeURIComponent(endpoint)}&method=${encodeURIComponent(method)}&apiKey=${encodeURIComponent(API_CONFIG.apiKey)}&callback=${callbackName}`;

            if (data) {
                Object.keys(data).forEach(key => {
                    if (key === '__timeout') return;
                    if (data[key] !== null && data[key] !== undefined) {
                        const value = typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key];
                        url += `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
                    }
                });
            }

            let scriptTag = null;
            let timeoutId = null;
            let settledRequest = false;

            const cleanup = (keepCallback = false) => {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = null;
                if (keepCallback) return;
                delete window[callbackName];
                if (scriptTag) {
                    scriptTag.onerror = null;
                    if (scriptTag.parentNode) scriptTag.parentNode.removeChild(scriptTag);
                }
            };

            const guardarTarde = (response) => {
                const ok = response && (response.success === true || response.success === 'true');
                const payload = ok ? (response.data || response) : null;
                if (!payload || endpoint !== 'flujo/dia' || !data || !data.fecha) return;
                const fechaResp = data.fecha;
                CacheManager.set(`flujo:${fechaResp}`, payload);
                if (payload.pedidos) CacheManager.set(`pedidos:${fechaResp}`, payload.pedidos);
                if (payload.recepcion) CacheManager.set(`recepcion:${fechaResp}`, payload.recepcion);
                if (payload.precios) CacheManager.set(`precios:${fechaResp}`, payload.precios);
                if (AppState.currentPage === 'pedidos' && AppState.currentDate === fechaResp) {
                    AppState.pedidos = payload.pedidos || [];
                    Pedidos.aplicarEnviadosLocales();
                    Pedidos.render();
                    Utils.hideLoader(document.getElementById('pedidos-tbody'));
                }
            };

            const fail = (error, allowRetry) => {
                if (settledRequest) return;
                settledRequest = true;
                const esTimeout = String(error && error.message || '').includes('tardó más de');
                cleanup(esTimeout);
                if (esTimeout) {
                    window[callbackName] = (response) => {
                        delete window[callbackName];
                        if (scriptTag && scriptTag.parentNode) scriptTag.parentNode.removeChild(scriptTag);
                        guardarTarde(response);
                    };
                }
                if (allowRetry && !esTimeout && method === 'GET' && retryCount < 1) {
                    setTimeout(() => {
                        this._executeRequest(endpoint, method, data, retryCount + 1)
                            .then(resolve)
                            .catch(reject);
                    }, 800);
                    return;
                }
                finish(reject, error);
            };

            window[callbackName] = (response) => {
                if (settledRequest) return;
                settledRequest = true;
                cleanup();
                if (!response) {
                    finish(reject, new Error('No se recibió respuesta del servidor'));
                    return;
                }
                if (response.success === true || response.success === 'true') {
                    finish(resolve, response.data || response);
                } else {
                    finish(reject, new Error(response?.error || response?.message || 'Error en la petición'));
                }
            };

            scriptTag = document.createElement('script');
            scriptTag.src = url;
            scriptTag.async = true;
            scriptTag.onerror = () => {
                console.error('❌ JSONP onerror - endpoint:', endpoint, '- URL:', url.substring(0, 120) + '...');
                const hint = endpoint === 'cierre'
                    ? ' El cierre puede tardar. Revisá la URL en auth.js y volvé a publicar Code.gs.'
                    : ' Verificá que el Apps Script esté publicado (Deploy → Manage Deployments) y que la URL en auth.js sea correcta.';
                // El redirect de Google suele disparar onerror antes de que llegue el callback.
                setTimeout(() => {
                    if (settledRequest) return;
                    fail(new Error('No se pudo conectar con el servidor.' + hint), true);
                }, 4000);
            };

            timeoutId = setTimeout(() => {
                fail(new Error(
                    `La operación tardó más de ${timeoutMs / 1000} segundos.`
                ), false);
            }, timeoutMs);

            document.head.appendChild(scriptTag);
        });
    },
    
    _esCorteDeConexion(error) {
        const msg = String(error && error.message || '');
        return msg.includes('No se pudo conectar')
            || msg.includes('tardó más de')
            || msg.includes('No se recibió respuesta');
    },

    async _listaFresca(cacheKey, endpoint, params) {
        CacheManager.invalidate(cacheKey);
        const data = await this.request(endpoint, 'GET', params || null);
        const lista = Array.isArray(data) ? data : [];
        CacheManager.set(cacheKey, lista);
        return lista;
    },

    async _encontrarTrasCorte(buscar) {
        for (let i = 0; i < 3; i++) {
            try {
                const hallado = await buscar();
                if (hallado) return hallado;
            } catch (error) {
                if (!this._esCorteDeConexion(error) && i === 2) throw error;
            }
            if (i < 2) await new Promise(resolve => setTimeout(resolve, 2000));
        }
        return null;
    },

    _porNombre(lista, nombre) {
        const buscado = String(nombre || '').trim().toLocaleLowerCase('es');
        const coinciden = (lista || []).filter(item =>
            String(item.nombre || '').trim().toLocaleLowerCase('es') === buscado
        );
        return coinciden.length ? coinciden[coinciden.length - 1] : null;
    },

    // Clientes
    async getClientes() {
        const cacheKey = 'clientes';
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;

        if (this._bootstrapPromise) {
            try {
                await this._bootstrapPromise;
                const fromBootstrap = CacheManager.get(cacheKey);
                if (fromBootstrap) return fromBootstrap;
            } catch (e) { /* bootstrap falló */ }
        }

        const data = await this.request('clientes', 'GET');
        CacheManager.set(cacheKey, data);
        return data;
    },
    
    async createCliente(data) {
        try {
            const result = await this.request('clientes', 'POST', data);
            CacheManager.invalidate('clientes');
            return result;
        } catch (error) {
            if (!this._esCorteDeConexion(error)) throw error;
            const hallado = await this._encontrarTrasCorte(async () => {
                const lista = await this._listaFresca('clientes', 'clientes');
                AppState.clientes = lista;
                return this._porNombre(lista, data.nombre);
            });
            if (!hallado) throw error;
            return hallado;
        }
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

        if (this._bootstrapPromise) {
            try {
                await this._bootstrapPromise;
                const fromBootstrap = CacheManager.get(cacheKey);
                if (fromBootstrap) return fromBootstrap;
            } catch (e) { /* bootstrap falló */ }
        }

        const data = await this.request('proveedores', 'GET');
        CacheManager.set(cacheKey, data);
        return data;
    },
    
    async createProveedor(data) {
        try {
            const result = await this.request('proveedores', 'POST', data);
            CacheManager.invalidate('proveedores');
            return result;
        } catch (error) {
            if (!this._esCorteDeConexion(error)) throw error;
            const hallado = await this._encontrarTrasCorte(async () => {
                const lista = await this._listaFresca('proveedores', 'proveedores');
                AppState.proveedores = lista;
                return this._porNombre(lista, data.nombre);
            });
            if (!hallado) throw error;
            return hallado;
        }
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

        if (this._bootstrapPromise) {
            try {
                await this._bootstrapPromise;
                const fromBootstrap = CacheManager.get(cacheKey);
                if (fromBootstrap) return fromBootstrap;
            } catch (e) { /* bootstrap falló */ }
        }

        const data = await this.request('productos', 'GET');
        CacheManager.set(cacheKey, data);
        return data;
    },
    
    async createProducto(data) {
        try {
            const result = await this.request('productos', 'POST', data);
            CacheManager.invalidate('productos');
            return result;
        } catch (error) {
            if (!this._esCorteDeConexion(error)) throw error;
            const hallado = await this._encontrarTrasCorte(async () => {
                const lista = await this._listaFresca('productos', 'productos');
                AppState.productos = lista;
                return this._porNombre(lista, data.nombre);
            });
            if (!hallado) throw error;
            return hallado;
        }
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

        if (this._bootstrapPromise && fecha === AppState.currentDate) {
            try {
                await this._bootstrapPromise;
                const fromBootstrap = CacheManager.get(cacheKey);
                if (fromBootstrap) return fromBootstrap;
            } catch (e) { /* bootstrap falló */ }
        }

        const data = fecha ? { fecha } : null;
        const result = await this.request('pedidos', 'GET', data);
        CacheManager.set(cacheKey, result);
        return result;
    },
    
    async createPedido(data) {
        const fecha = data.fecha || AppState.currentDate;
        const previos = [
            ...(Array.isArray(AppState.pedidos) ? AppState.pedidos : []),
            ...(CacheManager.get(`pedidos:${fecha}`) || [])
        ];
        const idsAntes = new Set(previos.map(pedido => String(pedido.id)));
        const limpiarCaches = () => {
            CacheManager.invalidate(`pedidos:${fecha}`);
            CacheManager.invalidate(`flujo:${fecha}`);
            CacheManager.invalidatePattern('estadisticas');
            CacheManager.invalidatePattern('dashboard');
            CacheManager.invalidatePattern('bootstrap:');
            DataLoader.invalidateFlujo(fecha);
            this._invalidateFlujo();
        };

        try {
            const result = await this.request('pedidos', 'POST', data);
            limpiarCaches();
            return result;
        } catch (error) {
            if (!this._esCorteDeConexion(error)) throw error;
            const hallado = await this._encontrarTrasCorte(async () => {
                const lista = await this._listaFresca(`pedidos:${fecha}`, 'pedidos', { fecha });
                return lista.find(pedido =>
                    !idsAntes.has(String(pedido.id)) &&
                    String(pedido.cliente_id) === String(data.cliente_id) &&
                    String(pedido.producto_id) === String(data.producto_id) &&
                    Number(pedido.cantidad) === Number(data.cantidad)
                ) || null;
            });
            if (!hallado) throw error;
            limpiarCaches();
            return hallado;
        }
    },
    
    async updatePedido(id, data) {
        data.id = id;
        const result = await this.request('pedidos/update', 'POST', data);
        const fecha = data.fecha || AppState.currentDate;
        CacheManager.invalidate(`pedidos:${fecha}`);
        CacheManager.invalidate(`flujo:${fecha}`);
        CacheManager.invalidatePattern('dashboard');
        CacheManager.invalidatePattern('bootstrap:');
        DataLoader.invalidateFlujo(fecha);
        this._invalidateFlujo();
        return result;
    },

    async deletePedido(id) {
        const result = await this.request('pedidos/delete', 'POST', { id });
        CacheManager.invalidatePattern('pedidos');
        CacheManager.invalidatePattern('dashboard');
        CacheManager.invalidatePattern('bootstrap:');
        this._invalidateFlujo();
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

    _hydrateFromBootstrap(result, fecha) {
        if (result.clientes) CacheManager.set('clientes', result.clientes);
        if (result.productos) CacheManager.set('productos', result.productos);
        if (result.proveedores) CacheManager.set('proveedores', result.proveedores);
        if (result.diasPendientes) CacheManager.set('flujo:dias-pendientes', result.diasPendientes);

        const dash = result.dashboard || result;
        if (dash.pedidos) CacheManager.set(`pedidos:${fecha}`, dash.pedidos);
        if (dash.cobranzas) CacheManager.set('cobranzas:all:all', dash.cobranzas);
        if (dash.stock) CacheManager.set('stock', dash.stock);
        if (dash.topProductos) CacheManager.set('estadisticas:top-productos:7:5', dash.topProductos);
        if (dash.pedidos || dash.cobranzas) CacheManager.set(`dashboard:${fecha}`, dash);
    },

    async getBootstrap(fecha = AppState.currentDate, force = false) {
        const cacheKey = `bootstrap:${fecha}`;
        if (!force) {
            const cached = CacheManager.get(cacheKey);
            if (cached) {
                this._hydrateFromBootstrap(cached, fecha);
                return cached;
            }
        }

        const result = await this.request('app/bootstrap', 'GET', {
            fecha,
            dias: 7,
            limite: 5,
            __timeout: 60000
        });
        CacheManager.set(cacheKey, result);
        this._hydrateFromBootstrap(result, fecha);
        return result;
    },

    async getDashboardResumen(fecha) {
        const cacheKey = `dashboard:${fecha || 'today'}`;
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;

        const result = await this.request('dashboard/resumen', 'GET', { fecha, dias: 7, limite: 5 });
        CacheManager.set(cacheKey, result);

        if (result.pedidos) CacheManager.set(`pedidos:${fecha}`, result.pedidos);
        if (result.cobranzas) CacheManager.set('cobranzas:all:all', result.cobranzas);
        if (result.stock) CacheManager.set('stock', result.stock);
        if (result.topProductos) CacheManager.set('estadisticas:top-productos:7:5', result.topProductos);

        return result;
    },
    
    async marcarPedidosEnviados(fecha) {
        const result = await this.request('pedidos/marcar-enviados', 'POST', { fecha });
        CacheManager.invalidatePattern('pedidos');
        CacheManager.invalidatePattern('dashboard');
        CacheManager.invalidatePattern('bootstrap:');
        this._invalidateFlujo();
        return result;
    },
    
    async marcarPedidosEnviadosPorIds(pedidosIds) {
        const result = await this.request('pedidos/marcar-enviados-por-ids', 'POST', { pedidosIds });
        CacheManager.invalidatePattern('pedidos');
        CacheManager.invalidatePattern('dashboard');
        CacheManager.invalidatePattern('bootstrap:');
        DataLoader.invalidateFlujo(AppState.currentDate);
        this._invalidateFlujo();
        return result;
    },

    async getDiasPendientes() {
        const cacheKey = 'flujo:dias-pendientes';
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;

        const result = await this.request('flujo/dias-pendientes', 'GET');
        CacheManager.set(cacheKey, result);
        return result;
    },

    async getFlujoDia(fecha = AppState.currentDate) {
        const cacheKey = `flujo:${fecha}`;
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;

        const result = await this.request('flujo/dia', 'GET', { fecha, __timeout: 90000 });
        CacheManager.set(cacheKey, result);
        if (result.pedidos) CacheManager.set(`pedidos:${fecha}`, result.pedidos);
        if (result.recepcion) CacheManager.set(`recepcion:${fecha}`, result.recepcion);
        if (result.precios) CacheManager.set(`precios:${fecha}`, result.precios);
        return result;
    },

    async resetAllDatos(confirmacion = 'BORRAR TODO') {
        const result = await this.request('admin/reset-datos', 'POST', {
            confirmacion,
            __timeout: 120000
        });
        CacheManager.clear();
        this._invalidateFlujo();
        return result;
    },

    _invalidateFlujo() {
        DiaOperativo.invalidate();
    },

    async getWhatsAppStatus() {
        const cacheKey = 'whatsapp:status';
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;

        const result = await this.request('whatsapp/status', 'GET');
        CacheManager.set(cacheKey, result);
        return result;
    },

    async enviarWhatsApp(telefono, mensaje) {
        const result = await this.request('whatsapp/enviar', 'POST', { telefono, mensaje });
        CacheManager.invalidate('whatsapp:status');
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
        DataLoader.invalidateFlujo(data.fecha || AppState.currentDate);
        this._invalidateFlujo();
        return result;
    },
    
    async confirmarRecepcion(fecha) {
        const result = await this.request('recepcion/confirmar', 'POST', { fecha });
        DataLoader.invalidateFlujo(fecha || AppState.currentDate);
        this._invalidateFlujo();
        return result;
    },

    async confirmarRecepcionItem(data) {
        const result = await this.request('recepcion/confirmar-item', 'POST', data);
        DataLoader.invalidateFlujo(data.fecha || AppState.currentDate);
        this._invalidateFlujo();
        return result;
    },

    async desconfirmarRecepcionItem(data) {
        const result = await this.request('recepcion/desconfirmar-item', 'POST', data);
        DataLoader.invalidateFlujo(data.fecha || AppState.currentDate);
        this._invalidateFlujo();
        return result;
    },

    async deleteRecepcionItem(data) {
        const result = await this.request('recepcion/eliminar-item', 'POST', data);
        DataLoader.invalidateFlujo(data.fecha || AppState.currentDate);
        this._invalidateFlujo();
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
        DataLoader.invalidateFlujo(data.fecha || AppState.currentDate);
        this._invalidateFlujo();
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
        CacheManager.invalidateAllExcept(['clientes', 'productos', 'proveedores']);
        this._invalidateFlujo();
        return result;
    },
    
    async getCierres() {
        const cacheKey = 'cierres';
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

    async getTotalesClientesHoy(fecha) {
        const result = await this.request('cobranzas/totales-hoy', 'GET', { fecha });
        return result;
    },

    async cobrarClienteHoy(data) {
        const result = await this.request('cobranzas/cobrar-cliente', 'POST', data);
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
        
        const prefetchPage = (page) => {
            const fecha = AppState.currentDate;
            const flowPages = ['pedidos', 'recepcion', 'precios', 'cierre'];
            if (flowPages.includes(page)) {
                DataLoader.prefetchFlujo(fecha);
            } else if (page === 'clientes' && !AppState.clientes.length) {
                API.getClientes().then(d => { AppState.clientes = d; }).catch(() => {});
            } else if (page === 'productos' && !AppState.productos.length) {
                API.getProductos().then(d => { AppState.productos = d; }).catch(() => {});
            } else if ((page === 'pagos' || page === 'pagos-pendientes') && !AppState.proveedores.length) {
                API.getProveedores().then(d => { AppState.proveedores = d; }).catch(() => {});
            }
        };

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('mouseenter', () => {
                const page = link.getAttribute('data-page');
                if (page) prefetchPage(page);
            }, { passive: true });
            link.addEventListener('click', (e) => {
                e.preventDefault();
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
        const requested = page;
        const screen = page === 'pagos-pendientes' ? 'pagos' : page;
        if (requested === 'pagos-pendientes') Pagos.vista = 'pendientes';
        else if (requested === 'pagos') Pagos.vista = 'hoy';

        AppState.currentPage = requested;

        // Actualizar navegación
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelectorAll(`[data-page="${requested}"]`).forEach(link => {
            link.classList.add('active');
            const category = link.closest('.nav-category');
            if (category) category.classList.add('active');
        });
        document.body.classList.remove('sidebar-open');
        
        // Ocultar todas las páginas
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });
        
        // Mostrar página seleccionada
        const pageEl = document.getElementById(screen);
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
            recepcion: 'Confirmación de lo que llegó',
            precios: 'Precios al cliente',
            'cobros-hoy': 'Cobranza al cliente',
            cierre: 'Cierre del día',
            cobranzas: 'Cobranzas a clientes (pendientes)',
            pagos: 'Pagar al proveedor',
            'pagos-pendientes': 'Pagos a proveedores (pendientes)',
            stock: 'Stock de bebidas',
            historial: 'Historial de días',
            caja: 'Caja',
            mantenimiento: 'Limpiar datos'
        };
        document.getElementById('page-title').textContent = titles[requested] || 'Dashboard';
        
        // Cargar datos de la página
        this.loadPageData(requested);
    },
    
    async loadPageData(page) {
        try {
            const flowPages = ['pedidos', 'recepcion', 'precios', 'cobros-hoy', 'pagos', 'pagos-pendientes', 'cierre'];
            if (flowPages.includes(page)) {
                DiaOperativo.renderSelectors();
                DiaOperativo.renderEstadoPanels();
            }

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
                case 'recepcion':
                    await Recepcion.load();
                    break;
                case 'precios':
                    await Precios.load();
                    break;
                case 'cobros-hoy':
                    await CobranzasHoy.load();
                    break;
                case 'cierre':
                    await Cierre.load();
                    break;
                case 'cobranzas':
                    await Cobranzas.load();
                    break;
                case 'pagos':
                case 'pagos-pendientes':
                    await Pagos.load();
                    break;
                case 'stock':
                    await Stock.load();
                    break;
                case 'historial':
                    await Historial.load();
                    break;
                case 'caja':
                    await Caja.load();
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
        const chartContainer = document.querySelector('.chart-container');
        const fecha = AppState.currentDate;
        const cachedDash = CacheManager.get(`dashboard:${fecha}`);

        if (cachedDash) {
            this.applyResumen(cachedDash);
        } else if (chartContainer) {
            Utils.showTableLoader(chartContainer);
        }

        try {
            let data = await DataLoader.bootstrap(fecha);
            if (data && data.diasPendientes) {
                DiaOperativo.diasPendientes = data.diasPendientes;
                const antes = AppState.currentDate;
                await DiaOperativo.resolveWorkDate({ skipRefresh: true });
                if (AppState.currentDate !== antes) {
                    data = await DataLoader.bootstrap(AppState.currentDate);
                }
            }
            this.applyResumen((data && data.dashboard) || data || {});
            DiaOperativo.renderSelectors();
            DiaOperativo.renderEstadoPanels();
            DiaOperativo.renderDashboardBanner();
            DiaOperativo.renderNavBadge();
        } catch (error) {
            console.error('Error loading dashboard:', error);
            if (!cachedDash) {
                this.renderChart([], []);
                Utils.showError('Google no respondió a tiempo. Esperá un minuto y recargá la página una sola vez.');
            }
        } finally {
            if (chartContainer) Utils.hideTableLoader(chartContainer);
        }
    },

    applyResumen(resumen) {
        const pedidos = resumen.pedidos || [];
        const cobranzas = resumen.cobranzas || [];
        const stock = resumen.stock || [];
        const top5 = resumen.topProductos || [];

        AppState.pedidos = pedidos;
        this.updateCounters(pedidos, cobranzas, stock);
        this.renderChart(top5.map(p => p.nombre), top5.map(p => p.cantidad));
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

        const cached = CacheManager.get('clientes');
        const hasStale = AppState.clientes.length > 0 || cached;
        if (hasStale) {
            if (!AppState.clientes.length && cached) AppState.clientes = cached;
            this.render();
        } else {
            Utils.showTableLoader(tbody);
        }

        try {
            AppState.clientes = await API.getClientes();
            this.render();
        } catch (error) {
            console.error('Error loading clientes:', error);
            if (!hasStale) Utils.hideTableLoader(tbody);
        }
    },
    
    render() {
        const tbody = document.getElementById('clientes-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        Utils.hideTableLoader(tbody);
        
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
                <label>Teléfono (WhatsApp)</label>
                <input type="text" id="modal-cliente-telefono" class="form-control">
                <small>Necesario para enviar precios por WhatsApp</small>
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
            
            try {
                const result = await API.createCliente({
                    nombre: nombre,
                    telefono: telefono
                });
                
                if (result && (result.success !== false)) {
                    const nuevo = {
                        id: result.id,
                        nombre,
                        telefono,
                        activo: true,
                        ...result
                    };
                    Utils.upsertInList(AppState.clientes, nuevo);
                    CacheManager.set('clientes', AppState.clientes);
                    Clientes.render();
                    Utils.showSuccess('Cliente agregado correctamente');
                } else {
                    throw new Error(result?.error || 'No se pudo crear el cliente');
                }
            } catch (error) {
                console.error('❌ Error creating cliente:', error);
                Utils.showError('Error al crear cliente: ' + error.message);
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
                <label>Teléfono (WhatsApp)</label>
                <input type="text" id="modal-cliente-telefono" class="form-control" value="${cliente.telefono || ''}">
                <small>Necesario para enviar precios por WhatsApp</small>
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
            
            try {
                await API.updateCliente(id, {
                    nombre: nombre,
                    telefono: telefono,
                    activo: activo
                });
                Utils.upsertInList(AppState.clientes, {
                    id,
                    nombre,
                    telefono,
                    activo
                });
                CacheManager.set('clientes', AppState.clientes);
                Clientes.render();
                Utils.showSuccess('Cliente actualizado correctamente');
            } catch (error) {
                console.error('Error updating cliente:', error);
                Utils.showError('Error al actualizar cliente: ' + error.message);
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
        
        try {
            await API.updateCliente(id, {
                nombre: cliente.nombre,
                telefono: cliente.telefono || '',
                activo: nuevoEstado
            });
            Utils.upsertInList(AppState.clientes, { id, activo: nuevoEstado });
            CacheManager.set('clientes', AppState.clientes);
            Clientes.render();
            Utils.showSuccess(`Cliente ${activoBoolean ? 'desactivado' : 'activado'} correctamente`);
        } catch (error) {
            console.error('❌ Error toggling cliente activo:', error);
            Utils.showError('Error al cambiar estado del cliente: ' + error.message);
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
        
        try {
            await API.deleteCliente(id);
            Utils.removeFromList(AppState.clientes, id);
            CacheManager.set('clientes', AppState.clientes);
            Clientes.render();
            Utils.showSuccess('Cliente eliminado correctamente');
        } catch (error) {
            console.error('Error deleting cliente:', error);
            Utils.showError('Error al eliminar cliente: ' + error.message);
        }
    }
};

// Productos
const Productos = {
    async load() {
        const tbody = document.getElementById('productos-tbody');
        if (!tbody) return;

        const hasStale = AppState.productos.length > 0 || CacheManager.get('productos');
        if (hasStale) {
            if (!AppState.productos.length) AppState.productos = CacheManager.get('productos') || [];
            if (!AppState.proveedores.length) AppState.proveedores = CacheManager.get('proveedores') || [];
            this.render();
        } else {
            Utils.showTableLoader(tbody);
        }

        try {
            const promises = [];
            if (!AppState.productos.length) {
                promises.push(API.getProductos().then(data => { AppState.productos = data; }));
            }
            if (!AppState.proveedores.length) {
                promises.push(API.getProveedores().then(data => { AppState.proveedores = data; }));
            }
            if (promises.length > 0) await Promise.all(promises);
            this.render();
        } catch (error) {
            console.error('Error loading productos:', error);
            if (!hasStale) Utils.hideTableLoader(tbody);
            Utils.showError('Error al cargar productos');
        }
    },
    
    render() {
        const tbody = document.getElementById('productos-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        Utils.hideTableLoader(tbody);
        
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
        try {
            AppState.proveedores = await API._listaFresca('proveedores', 'proveedores');
        } catch (error) {
            if (!AppState.proveedores) AppState.proveedores = [];
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
                    const nuevo = {
                        id: result.id,
                        nombre,
                        tipo,
                        unidad,
                        proveedor_default: proveedorId || '',
                        ...result
                    };
                    Utils.upsertInList(AppState.productos, nuevo);
                    CacheManager.set('productos', AppState.productos);
                    Productos.render();
                    Utils.showSuccess('Producto agregado correctamente');
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
                
                Utils.upsertInList(AppState.productos, {
                    id,
                    nombre,
                    tipo,
                    unidad,
                    proveedor_default: proveedorId || ''
                });
                CacheManager.set('productos', AppState.productos);
                Productos.render();
                Utils.showSuccess('Producto actualizado correctamente');
            } catch (error) {
                console.error('Error updating producto:', error);
                Utils.showError('Error al actualizar producto');
            }
        });
    },

    async delete(id) {
        let producto = AppState.productos.find(p => String(p.id) === String(id));
        if (!producto) {
            CacheManager.invalidate('productos');
            AppState.productos = await API.getProductos();
            producto = AppState.productos.find(p => String(p.id) === String(id));
            Productos.render();
        }
        if (!producto) {
            Utils.showError('Ese producto ya no está en el catálogo. La lista se actualizó.');
            return;
        }

        const confirmMsg = `⚠️ ADVERTENCIA: ¿Está seguro de ELIMINAR permanentemente "${producto.nombre}"?\n\nEsta acción NO se puede deshacer.\n\n¿Desea continuar?`;

        const confirmar = await Utils.showConfirm(confirmMsg);
        if (!confirmar) return;

        try {
            await API.deleteProducto(producto.id);
            Utils.removeFromList(AppState.productos, producto.id);
            CacheManager.set('productos', AppState.productos);
            Productos.render();
            Utils.showSuccess('Producto eliminado correctamente');
        } catch (error) {
            console.error('Error deleting producto:', error);
            const mensaje = String(error.message || '');
            if (mensaje.includes('no encontrado')) {
                CacheManager.invalidate('productos');
                AppState.productos = await API.getProductos();
                Productos.render();
                Utils.showError('Ese producto ya no está en el servidor. La lista se actualizó.');
                return;
            }
            Utils.showError('Error al eliminar producto: ' + error.message);
        }
    }
};

// Proveedores (Gestión)
const ProveedoresGestion = {
    findById(id) {
        return AppState.proveedores.find(p => String(p.id) === String(id));
    },

    initActions() {
        const tbody = document.getElementById('proveedores-tbody');
        if (!tbody || tbody.dataset.actionsBound === 'true') return;

        tbody.dataset.actionsBound = 'true';
        tbody.addEventListener('click', (event) => {
            const button = event.target.closest('[data-proveedor-action]');
            if (!button || button.disabled) return;

            const action = button.dataset.proveedorAction;
            const id = button.dataset.proveedorId;

            if (action === 'edit') {
                this.edit(id);
            } else if (action === 'toggle') {
                this.toggleActivo(id, button.dataset.activo === 'true');
            } else if (action === 'delete') {
                this.delete(id);
            }
        });
    },

    async load() {
        const tbody = document.getElementById('proveedores-tbody');
        if (!tbody) return;

        this.initActions();
        const cached = CacheManager.get('proveedores');
        const hasStale = AppState.proveedores.length > 0 || cached;
        if (hasStale) {
            if (!AppState.proveedores.length && cached) AppState.proveedores = cached;
            this.render();
        } else {
            Utils.showTableLoader(tbody);
        }

        try {
            AppState.proveedores = await API.getProveedores();
            this.render();
        } catch (error) {
            console.error('Error loading proveedores:', error);
            if (!hasStale) Utils.hideTableLoader(tbody);
            Utils.showError('Error al cargar proveedores');
        }
    },
    
    render() {
        const tbody = document.getElementById('proveedores-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        Utils.hideTableLoader(tbody);
        
        if (AppState.proveedores.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay proveedores registrados</td></tr>';
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
                    <td>${(proveedor.telefono && !String(proveedor.telefono).startsWith('#')) ? proveedor.telefono : '-'}</td>
                    <td><span class="status-badge ${esActivo ? 'status-activo' : 'status-inactivo'}">${esActivo ? 'Activo' : 'Inactivo'}</span></td>
                    <td>
                        <button type="button" class="btn btn-secondary" data-proveedor-action="edit" data-proveedor-id="${proveedor.id}">Editar</button>
                        <button type="button" class="btn ${esActivo ? 'btn-secondary' : 'btn-primary'}" data-proveedor-action="toggle" data-proveedor-id="${proveedor.id}" data-activo="${esActivo}">${esActivo ? 'Desactivar' : 'Activar'}</button>
                        <button type="button" class="btn btn-danger" data-proveedor-action="delete" data-proveedor-id="${proveedor.id}">Eliminar</button>
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
            <div class="form-group">
                <label>Teléfono (WhatsApp)</label>
                <input type="tel" id="modal-proveedor-telefono" class="form-control" placeholder="Ej: 11 2345-6789">
                <small>Necesario para enviar pedidos por WhatsApp</small>
            </div>
        `;
        
        Utils.showModal('Agregar proveedor', content, async () => {
            const nombre = document.getElementById('modal-proveedor-nombre').value.trim();
            const rubro = document.getElementById('modal-proveedor-rubro').value;
            const telefono = document.getElementById('modal-proveedor-telefono').value.trim();
            
            if (!nombre || !rubro) {
                Utils.showError('Complete todos los campos obligatorios');
                return;
            }
            
            try {
                const result = await API.createProveedor({
                    nombre: nombre,
                    rubro: rubro,
                    telefono: telefono
                });
                const nuevo = {
                    id: result.id,
                    nombre,
                    rubro,
                    telefono,
                    activo: true,
                    saldo: 0,
                    ...result
                };
                Utils.upsertInList(AppState.proveedores, nuevo);
                CacheManager.set('proveedores', AppState.proveedores);
                ProveedoresGestion.render();
                Utils.showSuccess('Proveedor agregado correctamente');
            } catch (error) {
                console.error('Error creating proveedor:', error);
                Utils.showError('Error al crear proveedor: ' + error.message);
            }
        });
    },
    
    async edit(id) {
        const proveedor = this.findById(id);
        if (!proveedor) {
            Utils.showError('Proveedor no encontrado');
            return;
        }
        
        const esActivo = proveedor.activo === true || proveedor.activo === 'true' || proveedor.activo === 1;

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
                <label>Teléfono (WhatsApp)</label>
                <input type="tel" id="modal-proveedor-telefono" class="form-control" value="${proveedor.telefono || ''}" placeholder="Ej: 11 2345-6789">
                <small>Necesario para enviar pedidos por WhatsApp</small>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="modal-proveedor-activo" ${esActivo ? 'checked' : ''}>
                    Activo
                </label>
            </div>
        `;
        
        Utils.showModal('Editar proveedor', content, async () => {
            const nombre = document.getElementById('modal-proveedor-nombre').value.trim();
            const rubro = document.getElementById('modal-proveedor-rubro').value;
            const telefono = document.getElementById('modal-proveedor-telefono').value.trim();
            const activo = document.getElementById('modal-proveedor-activo').checked;
            
            if (!nombre || !rubro) {
                Utils.showError('Complete todos los campos obligatorios');
                return;
            }
            
            try {
                await API.updateProveedor(id, {
                    id: id,
                    nombre: nombre,
                    rubro: rubro,
                    telefono: telefono,
                    activo: activo
                });
                
                Utils.upsertInList(AppState.proveedores, {
                    id,
                    nombre,
                    rubro,
                    telefono,
                    activo
                });
                CacheManager.set('proveedores', AppState.proveedores);
                ProveedoresGestion.render();
                Utils.showSuccess('Proveedor actualizado correctamente');
            } catch (error) {
                console.error('Error updating proveedor:', error);
                Utils.showError('Error al actualizar proveedor: ' + error.message);
            }
        });
    },
    
    async toggleActivo(id, activoActual) {
        const proveedor = this.findById(id);
        if (!proveedor) {
            Utils.showError('Proveedor no encontrado');
            return;
        }

        const activoBoolean = activoActual === true || activoActual === 'true';
        const nuevoEstado = !activoBoolean;
        const accion = activoBoolean ? 'desactivar' : 'activar';
        const confirmar = await Utils.showConfirm(`¿Está seguro de ${accion} este proveedor?`);
        if (!confirmar) return;
        
        try {
            await API.updateProveedor(proveedor.id, {
                id: proveedor.id,
                nombre: proveedor.nombre,
                rubro: proveedor.rubro,
                telefono: proveedor.telefono || '',
                activo: nuevoEstado
            });
            Utils.upsertInList(AppState.proveedores, { id, activo: nuevoEstado });
            CacheManager.set('proveedores', AppState.proveedores);
            this.render();
            Utils.showSuccess(`Proveedor ${activoBoolean ? 'desactivado' : 'activado'} correctamente`);
        } catch (error) {
            console.error('❌ Error toggling proveedor activo:', error);
            Utils.showError('Error al cambiar estado del proveedor: ' + error.message);
        }
    },
    
    async delete(id) {
        const proveedor = this.findById(id);
        if (!proveedor) {
            Utils.showError('Proveedor no encontrado');
            return;
        }
        
        const confirmMsg = `⚠️ ADVERTENCIA: ¿Está seguro de ELIMINAR permanentemente a "${proveedor.nombre}"?\n\nEsta acción NO se puede deshacer y se eliminarán:\n- Todos los registros relacionados con este proveedor\n- Todo el historial\n\n¿Desea continuar?`;
        
        const confirmar = await Utils.showConfirm(confirmMsg);
        if (!confirmar) return;
        
        try {
            await API.deleteProveedor(id);
            Utils.removeFromList(AppState.proveedores, id);
            CacheManager.set('proveedores', AppState.proveedores);
            this.render();
            Utils.showSuccess('Proveedor eliminado correctamente');
        } catch (error) {
            console.error('Error deleting proveedor:', error);
            Utils.showError('Error al eliminar proveedor: ' + error.message);
        }
    }
};

// Pedidos
const Pedidos = {
    async load() {
        const tbody = document.getElementById('pedidos-tbody');
        if (!tbody) return;

        const fecha = AppState.currentDate;
        const cached = CacheManager.get(`pedidos:${fecha}`) || CacheManager.get(`flujo:${fecha}`)?.pedidos;
        if (Array.isArray(cached)) {
            AppState.pedidos = cached;
            this.aplicarEnviadosLocales();
            this.render();
        } else {
            AppState.pedidos = [];
            Utils.showLoader(tbody);
        }

        try {
            const flujoPromise = DataLoader.getFlujo(fecha);
            await this.ensureDatosProveedor();
            const flujo = await flujoPromise;
            if (AppState.currentDate !== fecha) return;
            AppState.pedidos = flujo.pedidos || [];
            this.aplicarEnviadosLocales();
            this.render();
        } catch (error) {
            console.error('Error loading pedidos:', error);
            Utils.hideLoader(tbody);
            if (AppState.currentPage === 'pedidos' && AppState.currentDate === fecha && !Array.isArray(cached)) {
                Utils.showError('Error al cargar pedidos');
            }
        }
    },
    
    render() {
        const tbody = document.getElementById('pedidos-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        Utils.hideTableLoader(tbody);
        
        if (AppState.pedidos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No hay pedidos para el día de hoy</td></tr>';
            this.renderEnvioResumen();
            return;
        }
        
        let rowsHtml = '';
        
        AppState.pedidos.forEach(pedido => {
            const enviado = PedidoProveedorService.isEnviado(pedido);
            const { proveedor, nombreProveedor } = this.resolverProveedorPedido(pedido);
            const badgeEnvio = enviado
                ? '<span class="status-badge status-activo">Enviado</span>'
                : '<span class="status-badge status-pendiente">Pendiente</span>';
            const celdaProveedor = proveedor
                ? nombreProveedor
                : '<span class="pedido-proveedor-vacio">Sin proveedor</span>';
            rowsHtml += `
                <tr>
                    <td data-label="Cliente">${Utils.nombreCatalogo(pedido, 'cliente')}</td>
                    <td data-label="Producto">${pedido.producto_nombre || ''}</td>
                    <td data-label="Tipo">${pedido.tipo || ''}</td>
                    <td data-label="Cantidad" class="money">${pedido.cantidad || 0}</td>
                    <td data-label="Proveedor seleccionado">${celdaProveedor}</td>
                    <td data-label="Pedido a proveedor">${badgeEnvio}</td>
                    <td data-label="Acciones" class="pedidos-acciones">
                        <button class="btn btn-secondary btn-sm" type="button" onclick="Pedidos.abrirAcciones('${pedido.id}')">Acciones</button>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = rowsHtml;
        this.renderEnvioResumen();
    },

    renderEnvioResumen() {
        const box = document.getElementById('pedidos-envio-resumen');
        const btn = document.getElementById('btn-guardar-pedidos');
        const pedidos = AppState.pedidos || [];
        if (!box) return;

        if (pedidos.length === 0) {
            box.hidden = true;
            if (btn) {
                btn.hidden = false;
                btn.disabled = false;
                btn.textContent = 'Enviar pendientes a proveedores';
            }
            return;
        }

        const grupos = {};
        pedidos.forEach(pedido => {
            const producto = (AppState.productos || []).find(p => String(p.id) === String(pedido.producto_id));
            const proveedor = (AppState.proveedores || []).find(p => String(p.id) === String(producto?.proveedor_default || ''));
            const nombre = proveedor?.nombre || 'Sin proveedor';
            if (!grupos[nombre]) grupos[nombre] = { enviados: 0, total: 0 };
            grupos[nombre].total += 1;
            if (PedidoProveedorService.isEnviado(pedido)) grupos[nombre].enviados += 1;
        });

        const enviados = Object.entries(grupos).filter(([, g]) => g.enviados > 0);
        const pendientes = Object.entries(grupos).filter(([, g]) => g.enviados < g.total);
        const nPendientes = pedidos.filter(p => !PedidoProveedorService.isEnviado(p)).length;

        const partesEnviados = enviados.map(([nombre, g]) =>
            `${nombre} (${g.enviados} pedido${g.enviados === 1 ? '' : 's'})`
        );
        const partesPendientes = pendientes.map(([nombre, g]) =>
            `${nombre} (${g.total - g.enviados})`
        );

        let html = '';
        if (enviados.length) {
            html += `<div class="pedidos-envio-ok">WhatsApp enviado a ${partesEnviados.join(', ')}.</div>`;
        }
        if (pendientes.length) {
            html += `<div class="pedidos-envio-pendiente">Todavía falta enviar: ${partesPendientes.join(', ')}.</div>`;
        } else {
            html += '<div class="pedidos-envio-ok">Todos los pedidos del día ya se enviaron a los proveedores.</div>';
        }
        if (this._ultimosEnvios?.length) {
            const ultimo = this._ultimosEnvios[0];
            html += `<div class="pedidos-envio-ultimo">Último envío: ${ultimo.texto}</div>`;
        }

        box.innerHTML = html;
        box.hidden = false;
        box.className = 'pedidos-envio-resumen' + (nPendientes === 0 ? ' is-completo' : '');

        if (btn) {
            btn.hidden = nPendientes === 0;
            btn.disabled = false;
            btn.textContent = `Enviar pendientes a proveedores (${nPendientes})`;
        }
    },

    registrarEnvio(nombreProveedor, cantidad, modo) {
        this._ultimosEnvios = this._ultimosEnvios || [];
        const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const verbo = modo === 'auto' ? 'se envió WhatsApp' : 'se abrió WhatsApp';
        this._ultimosEnvios.unshift({
            texto: `${verbo} a ${nombreProveedor} con ${cantidad} pedido${cantidad === 1 ? '' : 's'} (${hora})`
        });
        this._ultimosEnvios = this._ultimosEnvios.slice(0, 3);
    },

    recordarEnviados(pedidosIds) {
        this._enviadosLocales = this._enviadosLocales || new Set();
        (pedidosIds || []).forEach(id => this._enviadosLocales.add(String(id)));
    },

    aplicarEnviadosLocales() {
        if (!this._enviadosLocales?.size) return;
        (AppState.pedidos || []).forEach(pedido => {
            if (this._enviadosLocales.has(String(pedido.id))) {
                pedido.enviado = true;
            }
        });
    },
    
    async add(clienteIdPrevio = '') {
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
                    ${clientes.map(c => `<option value="${c.id}" ${String(c.id) === String(clienteIdPrevio) ? 'selected' : ''}>${c.nombre}</option>`).join('')}
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
            <label class="check-seguir">
                <input type="checkbox" id="modal-seguir-cargando">
                Cargar otro pedido después de guardar
            </label>
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
                    throw new Error('Campos incompletos');
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
                
                const cliente = clientes.find(c => String(c.id) === String(clienteId));
                const nuevoPedido = {
                    ...result,
                    id: result.id,
                    fecha: AppState.currentDate,
                    cliente_id: clienteId,
                    producto_id: productoId,
                    cliente_nombre: cliente?.nombre || '',
                    producto_nombre: producto.nombre,
                    tipo: producto.tipo,
                    cantidad,
                };
                Utils.upsertInList(AppState.pedidos, nuevoPedido);
                CacheManager.set(`pedidos:${AppState.currentDate}`, AppState.pedidos);
                DataLoader.invalidateFlujo(AppState.currentDate);
                this.render();
                DiaOperativo.refresh().catch(() => {});
                
                // Verificar si realmente se guardó buscando el pedido en la lista
                const pedidosActualizados = AppState.pedidos || [];
                const pedidoGuardado = pedidosActualizados.find(p => 
                    String(p.cliente_id) === String(clienteId) && 
                    String(p.producto_id) === String(productoId) && 
                    String(p.cantidad) === String(cantidad) &&
                    p.fecha === AppState.currentDate
                );
                
                const seguirCargando = document.getElementById('modal-seguir-cargando')?.checked;
                if (pedidoGuardado) {
                    console.log('✅ Pedido verificado en la lista:', pedidoGuardado);
                    await Utils.showSuccess('Pedido agregado correctamente');
                } else {
                    console.error('❌ El pedido no aparece después de recargar');
                    console.log('🔍 Pedidos actuales:', pedidosActualizados);
                    console.log('🔍 Buscando:', { clienteId, productoId, cantidad, fecha: AppState.currentDate });
                    await Utils.showError('El pedido se envió pero no aparece en la lista. Por favor, verifica en el servidor o intenta nuevamente.');
                }

                if (seguirCargando && pedidoGuardado) {
                    setTimeout(() => Pedidos.add(clienteId), 0);
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
                await API.updatePedido(id, {
                    fecha: pedido.fecha,
                    cliente_id: clienteId,
                    producto_id: productoId,
                    tipo: producto.tipo,
                    cantidad: cantidad
                });
                
                CacheManager.invalidatePattern('pedidos');
                
                Utils.showSuccess('Pedido actualizado correctamente');
                await Pedidos.load();
            } catch (error) {
                console.error('Error updating pedido:', error);
                Utils.showError('Error al actualizar el pedido');
            }
        });
    },
    
    async delete(id) {
        document.getElementById('modal-overlay')?.classList.remove('active');
        const confirmar = await Utils.showConfirm('¿Está seguro de eliminar este pedido?');
        if (!confirmar) return;
        
        const tbody = document.getElementById('pedidos-tbody');
        Utils.showLoader(tbody);
        try {
            await API.deletePedido(id);
            Utils.removeFromList(AppState.pedidos, id);
            CacheManager.invalidate(`pedidos:${AppState.currentDate}`);
            CacheManager.set(`pedidos:${AppState.currentDate}`, AppState.pedidos);
            this.render();
            Utils.showSuccess('Pedido eliminado');
        } catch (error) {
            console.error('Error deleting pedido:', error);
            Utils.showError('Error al eliminar pedido: ' + error.message);
        } finally {
            Utils.hideLoader(tbody);
        }
    },
    
    async save() {
        await this.enviarPendientes();
    },

    async enviarPendientes() {
        try {
            await this.ensureDatosProveedor();
            const pendientes = (AppState.pedidos || []).filter(p => !PedidoProveedorService.isEnviado(p));
            if (pendientes.length === 0) {
                Utils.showInfo('No hay pedidos pendientes de enviar a proveedores.');
                return;
            }

            const grupos = {};
            pendientes.forEach(pedido => {
                const producto = (AppState.productos || []).find(p => String(p.id) === String(pedido.producto_id));
                const proveedorId = producto?.proveedor_default || PedidoProveedorService.SIN_PROVEEDOR_ID;
                if (!grupos[proveedorId]) grupos[proveedorId] = [];
                grupos[proveedorId].push(pedido);
            });

            const bloques = Object.keys(grupos).map(proveedorId => {
                const proveedor = (AppState.proveedores || []).find(p => String(p.id) === String(proveedorId));
                const nombre = proveedor?.nombre || 'Sin proveedor asignado';
                const items = grupos[proveedorId].map(pedido => {
                    const producto = (AppState.productos || []).find(p => String(p.id) === String(pedido.producto_id));
                    return `<li>${pedido.cliente_nombre || 'Cliente'} — ${pedido.producto_nombre || producto?.nombre || 'Producto'} × ${pedido.cantidad}</li>`;
                }).join('');
                const sinTelefono = !proveedor || !proveedor.telefono;
                return `
                    <div class="proveedor-pendiente">
                        <strong>${nombre}</strong>
                        <ul>${items}</ul>
                        <button type="button" class="btn btn-primary btn-sm" data-enviar-proveedor="${proveedorId}" ${sinTelefono ? 'disabled' : ''}>
                            ${sinTelefono ? 'Falta teléfono' : 'Enviar WhatsApp'}
                        </button>
                    </div>
                `;
            }).join('');

            Utils.showModal('Enviar pedidos pendientes', `<div class="proveedores-pendientes">${bloques}</div><p class="modal-hint">El pago al proveedor se registra después, en Pagar al proveedor.</p>`, null);

            document.querySelectorAll('[data-enviar-proveedor]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const proveedorId = btn.getAttribute('data-enviar-proveedor');
                    await Utils.withButtonLoader(btn, () => this.enviarGrupoProveedor(proveedorId, grupos[proveedorId]), 'Enviando...');
                });
            });
        } catch (error) {
            this.handleProveedorError(error);
        }
    },

    async enviarGrupoProveedor(proveedorId, pedidosGrupo) {
        const proveedor = (AppState.proveedores || []).find(p => String(p.id) === String(proveedorId));
        if (!proveedor || !proveedor.telefono) {
            Utils.showError('Ese proveedor no tiene teléfono.');
            return;
        }

        const items = (pedidosGrupo || []).map(pedido => ({
            producto: pedido.producto_nombre || 'Producto',
            cantidad: pedido.cantidad
        }));
        const mensaje = PedidoProveedorService.construirMensaje(proveedor.nombre, items);
        const modo = await WhatsAppService.sendOrOpen(proveedor.telefono, mensaje, API, AppState.whatsappAutoEnvio);
        const ids = pedidosGrupo.map(p => p.id);
        this.recordarEnviados(ids);
        this.registrarEnvio(proveedor.nombre, pedidosGrupo.length, modo);
        await PedidoProveedorService.persistirMarcado(ids, {
            pedidos: AppState.pedidos,
            productos: AppState.productos,
            proveedores: AppState.proveedores,
            api: API,
            cacheManager: CacheManager,
            appState: AppState
        });
        DataLoader.invalidateFlujo(AppState.currentDate);
        await this.load();
        document.getElementById('modal-overlay')?.classList.remove('active');
    },

    getProveedoresActivos(proveedores) {
        return (proveedores || []).filter(p =>
            p.activo === true || p.activo === 'true' || p.activo === 1
        );
    },

    resolverProveedorPedido(pedido) {
        const producto = (AppState.productos || []).find(p => String(p.id) === String(pedido?.producto_id));
        const proveedor = (AppState.proveedores || []).find(p => String(p.id) === String(producto?.proveedor_default || ''));
        return {
            producto,
            proveedor,
            nombreProveedor: proveedor?.nombre || 'Sin proveedor'
        };
    },

    abrirAcciones(pedidoId) {
        const pedido = (AppState.pedidos || []).find(p => String(p.id) === String(pedidoId));
        if (!pedido) {
            Utils.showError('Pedido no encontrado');
            return;
        }

        const enviado = PedidoProveedorService.isEnviado(pedido);
        const { nombreProveedor } = this.resolverProveedorPedido(pedido);
        const cliente = Utils.nombreCatalogo(pedido, 'cliente');
        const producto = pedido.producto_nombre || 'Producto';
        const cantidad = pedido.cantidad || 0;
        const estadoHtml = enviado
            ? '<span class="status-badge status-activo">Pedido realizado</span>'
            : '<span class="status-badge status-pendiente">Pendiente de enviar</span>';

        const botones = [];
        if (!enviado) {
            botones.push(`<button type="button" class="btn btn-primary" onclick="Pedidos.seleccionarProveedor('${pedido.id}')">Seleccionar proveedor</button>`);
        } else {
            botones.push(`<button type="button" class="btn btn-secondary" onclick="Pedidos.reSeleccionarProveedor('${pedido.id}')">Reenviar WhatsApp</button>`);
        }
        botones.push(`<button type="button" class="btn btn-secondary" onclick="Pedidos.edit('${pedido.id}')">Editar pedido</button>`);
        botones.push(`<button type="button" class="btn btn-danger" onclick="Pedidos.delete('${pedido.id}')">Eliminar pedido</button>`);

        const content = `
            <div class="pedido-acciones-resumen">
                <div class="pedido-acciones-resumen-top">
                    <strong>${cliente}</strong>
                    <div class="pedido-acciones-badges">${estadoHtml}</div>
                </div>
                <p>${producto} × ${cantidad}</p>
                <p class="pedido-acciones-proveedor">Proveedor: ${nombreProveedor}</p>
            </div>
            <div class="pedido-acciones-lista">
                ${botones.join('')}
            </div>
        `;

        Utils.showModal('Acciones del pedido', content, null);
        const cancelBtn = document.getElementById('modal-cancel');
        if (cancelBtn) cancelBtn.textContent = 'Cerrar';
    },

    handleProveedorError(error) {
        if (error instanceof PedidoProveedorError) {
            if (error.code === 'ALREADY_MARKED') {
                Utils.showWarning(error.message);
            } else {
                Utils.showError(error.message);
            }
            return;
        }

        if (error instanceof WhatsAppError) {
            Utils.showError(error.message);
            return;
        }

        Utils.showError('Error al enviar pedido: ' + error.message);
    },

    async ensureDatosProveedor() {
        const promises = [];

        if (!AppState.productos?.length) {
            promises.push(API.getProductos().then(data => { AppState.productos = data; }));
        }
        if (!AppState.proveedores?.length) {
            promises.push(API.getProveedores().then(data => { AppState.proveedores = data; }));
        }
        if (AppState.whatsappAutoEnvio === undefined) {
            promises.push(
                API.getWhatsAppStatus()
                    .catch(() => ({ autoEnvioActivo: false }))
                    .then(status => {
                        AppState.whatsappAutoEnvio = !!status.autoEnvioActivo;
                        AppState.whatsappModo = status.modo || 'manual';
                    })
            );
        }

        if (promises.length > 0) {
            await Promise.all(promises);
        }
    },

    async seleccionarProveedor(pedidoId) {
        try {
            await this.ensureDatosProveedor();

            const pedido = AppState.pedidos.find(p => String(p.id) === String(pedidoId));
            if (!pedido) {
                Utils.showError('Pedido no encontrado');
                return;
            }

            if (PedidoProveedorService.isEnviado(pedido)) {
                Utils.showWarning('Este pedido ya fue enviado al proveedor');
                return;
            }

            this.abrirModalEnviarPedido(pedido, 'seleccionar');
        } catch (error) {
            console.error('Error en Pedidos.seleccionarProveedor():', error);
            this.handleProveedorError(error);
        }
    },

    async reSeleccionarProveedor(pedidoId) {
        try {
            await this.ensureDatosProveedor();

            const pedido = AppState.pedidos.find(p => String(p.id) === String(pedidoId));
            if (!pedido) {
                Utils.showError('Pedido no encontrado');
                return;
            }

            if (!PedidoProveedorService.isEnviado(pedido)) {
                Utils.showWarning('Primero tenés que marcar el pedido como realizado');
                return;
            }

            this.abrirModalEnviarPedido(pedido, 'reSeleccionar');
        } catch (error) {
            console.error('Error en Pedidos.reSeleccionarProveedor():', error);
            this.handleProveedorError(error);
        }
    },

    actualizarPreviewModalProveedor(proveedorId, pedido) {
        const previewItems = document.getElementById('modal-pedido-preview-items');
        const previewMensaje = document.getElementById('modal-pedido-preview-mensaje');
        const hint = document.getElementById('modal-pedido-proveedor-hint');
        const saveBtn = document.getElementById('modal-save');
        if (!previewItems || !previewMensaje || !pedido) return;

        const proveedor = (AppState.proveedores || []).find(p => String(p.id) === String(proveedorId));
        const producto = AppState.productos.find(p => String(p.id) === String(pedido.producto_id));
        const productoNombre = pedido.producto_nombre || producto?.nombre || '-';

        if (!proveedorId || !proveedor) {
            previewItems.innerHTML = '<p class="modal-hint">Seleccioná un proveedor.</p>';
            previewMensaje.value = '';
            if (hint) hint.textContent = '';
            if (saveBtn) saveBtn.disabled = true;
            return;
        }

        const sinTelefono = !proveedor.telefono || !String(proveedor.telefono).trim();
        if (hint) {
            hint.textContent = sinTelefono
                ? 'Este proveedor no tiene teléfono. Configuralo en Proveedores.'
                : proveedor.telefono;
        }

        if (saveBtn) saveBtn.disabled = sinTelefono;

        previewItems.innerHTML = `
            <table class="modal-pedido-detalle-table">
                <thead>
                    <tr>
                        <th>Cliente</th>
                        <th>Producto</th>
                        <th>Cantidad</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>${pedido.cliente_nombre || '-'}</td>
                        <td>${productoNombre}</td>
                        <td>${pedido.cantidad || 0}</td>
                    </tr>
                </tbody>
            </table>
        `;

        previewMensaje.value = PedidoProveedorService.construirMensaje(proveedor.nombre, [{
            producto: productoNombre,
            cantidad: pedido.cantidad
        }]);
    },

    bindModalProveedorEvents(proveedorDefault, pedido) {
        const select = document.getElementById('modal-pedido-proveedor');
        if (select) {
            select.value = proveedorDefault;
            select.addEventListener('change', () => this.actualizarPreviewModalProveedor(select.value, pedido));
        }

        this.actualizarPreviewModalProveedor(proveedorDefault, pedido);
    },

    async asignarProductoAlProveedor(proveedorId, productoId) {
        const producto = AppState.productos.find(p => String(p.id) === String(productoId));
        if (!producto) return;

        await API.updateProducto(productoId, {
            id: productoId,
            nombre: producto.nombre,
            tipo: producto.tipo,
            unidad: producto.unidad,
            proveedor_default: proveedorId
        });

        producto.proveedor_default = proveedorId;
        CacheManager.invalidate('productos');
    },

    abrirModalEnviarPedido(pedido, modo = 'seleccionar') {
        const esReSeleccion = modo === 'reSeleccionar';
        const proveedoresActivos = this.getProveedoresActivos(AppState.proveedores);
        if (proveedoresActivos.length === 0) {
            Utils.showError('No hay proveedores activos. Agregá proveedores en Configuración.');
            return;
        }

        const producto = AppState.productos.find(p => String(p.id) === String(pedido.producto_id));

        const proveedorDefault = producto?.proveedor_default &&
            proveedoresActivos.some(p => String(p.id) === String(producto.proveedor_default))
            ? producto.proveedor_default
            : proveedoresActivos[0].id;

        const saveLabel = esReSeleccion
            ? (AppState.whatsappAutoEnvio ? 'Enviar WhatsApp' : 'Abrir WhatsApp')
            : (AppState.whatsappAutoEnvio ? 'Enviar WhatsApp y marcar' : 'Abrir WhatsApp y marcar');

        const modalTitle = esReSeleccion ? 'Re seleccionar proveedor' : 'Enviar pedido a proveedor';

        const content = `
            <div class="form-group">
                <label>Proveedor</label>
                <select id="modal-pedido-proveedor" class="form-control">
                    ${proveedoresActivos.map(p =>
                        `<option value="${p.id}">${p.nombre}${p.telefono ? ` (${p.telefono})` : ''}</option>`
                    ).join('')}
                </select>
                <small id="modal-pedido-proveedor-hint" class="modal-hint"></small>
            </div>
            <div class="form-group">
                <label>Detalle del pedido</label>
                <div id="modal-pedido-preview-items" class="modal-pedido-preview-box"></div>
            </div>
            <div class="form-group">
                <label>Mensaje de WhatsApp</label>
                <textarea id="modal-pedido-preview-mensaje" class="whatsapp-preview form-control" rows="6"></textarea>
            </div>
        `;

        Utils.showModal(modalTitle, content, async () => {
            const proveedorId = document.getElementById('modal-pedido-proveedor').value;
            const mensaje = document.getElementById('modal-pedido-preview-mensaje').value.trim();

            if (!proveedorId) {
                Utils.showError('Seleccioná un proveedor');
                throw new Error('Proveedor requerido');
            }

            if (!mensaje) {
                Utils.showError('Escribí un mensaje para WhatsApp');
                throw new Error('Mensaje requerido');
            }

            if (esReSeleccion) {
                await this.ejecutarReSeleccionProveedor(proveedorId, pedido, mensaje);
            } else {
                await this.ejecutarEnvioProveedor(proveedorId, pedido, mensaje);
            }
        }, saveLabel);

        this.bindModalProveedorEvents(proveedorDefault, pedido);
    },

    async ejecutarReSeleccionProveedor(proveedorId, pedido, mensaje) {
        try {
            const proveedor = (AppState.proveedores || []).find(p => String(p.id) === String(proveedorId));

            if (!proveedor) {
                throw new PedidoProveedorError('Proveedor no encontrado.', 'NO_PROVEEDOR');
            }

            if (!proveedor.telefono || !String(proveedor.telefono).trim()) {
                throw new PedidoProveedorError(
                    `El proveedor "${proveedor.nombre}" no tiene teléfono configurado.`,
                    'NO_PHONE'
                );
            }

            await this.asignarProductoAlProveedor(proveedorId, pedido.producto_id);

            const modoEnvio = await WhatsAppService.sendOrOpen(
                proveedor.telefono,
                mensaje,
                API,
                AppState.whatsappAutoEnvio
            );

            this.recordarEnviados([pedido.id]);
            this.registrarEnvio(proveedor.nombre, 1, modoEnvio);
            DataLoader.invalidateFlujo(AppState.currentDate);
            await this.load();

            const mensajeExito = modoEnvio === 'auto'
                ? `WhatsApp reenviado a ${proveedor.nombre}.`
                : `WhatsApp abierto para ${proveedor.nombre}. Proveedor actualizado.`;

            Utils.showSuccess(mensajeExito);
        } catch (error) {
            this.handleProveedorError(error);
            throw error;
        }
    },

    async ejecutarEnvioProveedor(proveedorId, pedido, mensaje) {
        try {
            const proveedor = (AppState.proveedores || []).find(p => String(p.id) === String(proveedorId));

            if (!proveedor) {
                throw new PedidoProveedorError('Proveedor no encontrado.', 'NO_PROVEEDOR');
            }

            if (!proveedor.telefono || !String(proveedor.telefono).trim()) {
                throw new PedidoProveedorError(
                    `El proveedor "${proveedor.nombre}" no tiene teléfono configurado.`,
                    'NO_PHONE'
                );
            }

            await this.asignarProductoAlProveedor(proveedorId, pedido.producto_id);

            const context = {
                pedidos: AppState.pedidos,
                productos: AppState.productos,
                proveedores: AppState.proveedores,
                api: API,
                cacheManager: CacheManager,
                appState: AppState
            };

            const modoEnvio = await WhatsAppService.sendOrOpen(
                proveedor.telefono,
                mensaje,
                API,
                AppState.whatsappAutoEnvio
            );

            this.recordarEnviados([pedido.id]);
            this.registrarEnvio(proveedor.nombre, 1, modoEnvio);
            await PedidoProveedorService.persistirMarcado([pedido.id], context);
            DataLoader.invalidateFlujo(AppState.currentDate);
            await this.load();
        } catch (error) {
            this.handleProveedorError(error);
            throw error;
        }
    }
};

// Recepción
const Recepcion = {
    _actionsBound: false,

    findById(list, id) {
        if (!list || id === null || id === undefined) return null;
        return list.find(item => String(item.id) === String(id)) || null;
    },

    findRecepcionForProducto(recepciones, productoId) {
        return recepciones.find(r => String(r.producto_id) === String(productoId)) || null;
    },

    initActions() {
        if (this._actionsBound) return;
        const tbody = document.getElementById('recepcion-tbody');
        if (!tbody) return;

        tbody.addEventListener('click', async (e) => {
            const btnConfirmar = e.target.closest('.btn-confirmar-recepcion-item');
            if (btnConfirmar && !btnConfirmar.disabled) {
                e.preventDefault();
                const productoId = btnConfirmar.getAttribute('data-producto-id');
                if (productoId) {
                    await Utils.withButtonLoader(btnConfirmar, () => this.confirmarProducto(productoId), 'Confirmando...');
                }
                return;
            }

            const btnEditar = e.target.closest('.btn-editar-recepcion-item');
            if (btnEditar && !btnEditar.disabled) {
                e.preventDefault();
                const productoId = btnEditar.getAttribute('data-producto-id');
                if (productoId) {
                    this.editarProducto(productoId);
                }
                return;
            }

            const btnEliminar = e.target.closest('.btn-eliminar-recepcion-item');
            if (btnEliminar && !btnEliminar.disabled) {
                e.preventDefault();
                const productoId = btnEliminar.getAttribute('data-producto-id');
                if (productoId) {
                    await Utils.withButtonLoader(btnEliminar, () => this.eliminarProducto(productoId), 'Eliminando...');
                }
            }
        });
        this._actionsBound = true;
    },

    _subtotal(llego, precio) {
        return (parseFloat(llego) || 0) * (Utils.parsePrice(precio) || 0);
    },

    _capturarEdiciones() {
        const map = {};
        document.querySelectorAll('#recepcion-tbody .recepcion-llego').forEach(input => {
            const productoId = input.getAttribute('data-producto-id');
            if (!productoId) return;
            const precioInput = document.querySelector(`#recepcion-tbody .recepcion-precio[data-producto-id="${productoId}"]`);
            map[String(productoId)] = {
                llego: parseInt(input.value, 10) || 0,
                precio: Utils.parsePrice(precioInput?.value || 0)
            };
        });
        return map;
    },

    _ajustarSaldoProveedor(proveedorId, delta) {
        if (!proveedorId || !delta) return;
        const id = String(proveedorId);
        const prov = (AppState.proveedores || []).find(p => String(p.id) === id);
        if (prov) {
            prov.saldo = (Utils.parsePrice(prov.saldo) || 0) + delta;
        }
        Pagos._montosHoy = Pagos._montosHoy || {};
        Pagos._montosHoy[id] = Math.max(0, (Pagos._montosHoy[id] || 0) + delta);
        CacheManager.invalidate('proveedores');
        CacheManager.invalidatePattern('bootstrap:');
        CacheManager.invalidatePattern('dashboard');
        if (AppState.currentPage === 'pagos' || AppState.currentPage === 'pagos-pendientes') {
            Pagos.render(AppState.proveedores);
        }
    },

    async load() {
        const tbody = document.getElementById('recepcion-tbody');
        if (!tbody) return;

        this.initActions();
        const fecha = AppState.currentDate;
        const token = DataLoader._flujoToken;
        const cachedRec = CacheManager.get(`recepcion:${fecha}`);
        const hasStale = AppState.recepcion.length > 0 || cachedRec;
        const editando = tbody.contains(document.activeElement);
        if (hasStale && !editando) {
            if (!AppState.recepcion.length && cachedRec) AppState.recepcion = cachedRec;
            if (AppState.recepcion.length) this.render();
        } else if (!hasStale) {
            Utils.showLoader(tbody);
        }

        try {
            if (!AppState.productos?.length || !AppState.proveedores?.length) {
                CacheManager.hydrateAppStateFromCache();
            }

            const flujo = await DataLoader.getFlujo(fecha);
            if (token !== DataLoader._flujoToken) return;
            const ediciones = this._capturarEdiciones();
            const recepciones = flujo.recepcion || [];
            const pedidos = flujo.pedidos || [];
            const productos = AppState.productos?.length
                ? AppState.productos
                : await API.getProductos();
            const proveedores = AppState.proveedores?.length
                ? AppState.proveedores
                : await API.getProveedores();
            AppState.productos = productos;
            AppState.proveedores = proveedores;

            const pedidosPorProducto = {};
            pedidos.forEach(pedido => {
                const producto = this.findById(productos, pedido.producto_id);
                if (!pedidosPorProducto[pedido.producto_id]) {
                    pedidosPorProducto[pedido.producto_id] = {
                        producto_id: pedido.producto_id,
                        pedido_total: 0,
                        producto_nombre: producto?.nombre || pedido.producto_nombre || ''
                    };
                }
                pedidosPorProducto[pedido.producto_id].pedido_total += parseFloat(pedido.cantidad) || 0;
                if (!pedidosPorProducto[pedido.producto_id].producto_nombre && producto) {
                    pedidosPorProducto[pedido.producto_id].producto_nombre = producto.nombre;
                }
            });

            const recepcionesFinales = [];

            Object.keys(pedidosPorProducto).forEach(productoId => {
                const pedidoInfo = pedidosPorProducto[productoId];
                const producto = this.findById(productos, productoId);
                const rec = this.findRecepcionForProducto(recepciones, productoId);
                const proveedor = producto
                    ? this.findById(proveedores, producto.proveedor_default)
                    : null;
                const local = (AppState.recepcion || []).find(r => String(r.producto_id) === String(productoId));
                const confirmado = rec?.confirmado === true || rec?.confirmado === 'true';
                const edicion = ediciones[String(productoId)];
                const conservarLocal = local && (local.confirmado === true || local.confirmado === 'true') && !confirmado;
                let llego = rec?.llego ?? 0;
                let precioReal = rec?.precio_real ?? 0;
                if (conservarLocal) {
                    llego = local.llego ?? llego;
                    precioReal = local.precio_real ?? precioReal;
                } else if (!confirmado && edicion) {
                    llego = edicion.llego;
                    precioReal = edicion.precio;
                }

                recepcionesFinales.push({
                    id: rec?.id || local?.id || ('temp-' + productoId),
                    producto_id: productoId,
                    producto_nombre: producto?.nombre || pedidoInfo.producto_nombre || 'Sin nombre',
                    pedido_total: pedidoInfo.pedido_total,
                    llego,
                    precio_real: precioReal,
                    proveedor_nombre: rec?.proveedor_nombre || proveedor?.nombre || local?.proveedor_nombre || '',
                    proveedor_id: rec?.proveedor_id || producto?.proveedor_default || local?.proveedor_id || '',
                    confirmado: confirmado || conservarLocal
                });
            });

            AppState.recepcion = recepcionesFinales;
            
            this.render();
        } catch (error) {
            console.error('Error loading recepcion:', error);
            Utils.hideTableLoader(tbody);
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #d32f2f;">Error al cargar recepción. Por favor, intenta nuevamente.</td></tr>';
        }
    },
    
    render() {
        const tbody = document.getElementById('recepcion-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        Utils.hideTableLoader(tbody);
        
        if (AppState.recepcion.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No hay recepciones para el día seleccionado</td></tr>';
            return;
        }
        
        let rowsHtml = '';
        
        AppState.recepcion.forEach(item => {
            const confirmada = item.confirmado === true || item.confirmado === 'true';
            const rowClass = confirmada ? ' class="recepcion-row-confirmada"' : '';
            const disabled = confirmada ? ' disabled' : '';
            const accionCell = confirmada
                ? `<div class="recepcion-acciones-group">
                    <span class="status-badge status-activo">Confirmado</span>
                    <button type="button" class="btn btn-secondary btn-sm btn-editar-recepcion-item" data-producto-id="${item.producto_id}">Editar</button>
                    <button type="button" class="btn btn-danger btn-sm btn-eliminar-recepcion-item" data-producto-id="${item.producto_id}">Eliminar</button>
                   </div>`
                : `<button type="button" class="btn btn-primary btn-sm btn-confirmar-recepcion-item" data-producto-id="${item.producto_id}">Confirmar</button>`;

            rowsHtml += `
                <tr${rowClass}>
                    <td>${item.producto_nombre || ''}</td>
                    <td>${item.pedido_total || 0}</td>
                    <td><input type="number" class="recepcion-llego" data-id="${item.id}" data-producto-id="${item.producto_id}" value="${item.llego || 0}" min="0"${disabled}></td>
                    <td><input type="text" class="recepcion-precio" data-id="${item.id}" data-producto-id="${item.producto_id}" data-price-input="true" value="${Utils.formatPrice(item.precio_real || 0)}" placeholder="Costo del proveedor"${disabled} title="Lo que te cobró el proveedor por unidad"></td>
                    <td>${item.proveedor_nombre || ''}</td>
                    <td class="recepcion-acciones">${accionCell}</td>
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
        
        try {
            await API.saveRecepcion({
                fecha: AppState.currentDate,
                items: items
            });
            
            Utils.showSuccess('Borrador guardado (sin confirmar)');
            await DiaOperativo.refresh();
            await this.load();
        } catch (error) {
            console.error('Error saving recepcion:', error);
            Utils.showError('Error al guardar recepción: ' + error.message);
        }
    },

    async confirmarCompletos() {
        const pendientes = (AppState.recepcion || []).filter(item => item.confirmado !== true && item.confirmado !== 'true');
        if (pendientes.length === 0) {
            Utils.showInfo('No hay productos pendientes de confirmar.');
            return;
        }

        const listos = [];
        const incompletos = [];
        pendientes.forEach(item => {
            const { llego, precio } = this.getValoresProducto(item.producto_id);
            if (llego > 0 && precio <= 0) incompletos.push(item.producto_nombre || 'producto');
            else listos.push({ item, llego, precio });
        });

        if (listos.length === 0) {
            Utils.showError('Completá el precio real de los productos que llegaron antes de confirmar.');
            return;
        }

        const aviso = incompletos.length
            ? `\n\nQuedan sin confirmar (falta precio): ${incompletos.join(', ')}`
            : '';
        const ok = await Utils.showConfirm(`¿Confirmar ${listos.length} producto(s) con datos completos?${aviso}`);
        if (!ok) return;

        Utils.showLoader();
        try {
            for (const entrada of listos) {
                await API.confirmarRecepcionItem({
                    fecha: AppState.currentDate,
                    producto_id: entrada.item.producto_id,
                    llego: entrada.llego,
                    precio_real: entrada.precio
                });
                const idx = AppState.recepcion.findIndex(r => String(r.producto_id) === String(entrada.item.producto_id));
                if (idx !== -1) {
                    AppState.recepcion[idx] = {
                        ...AppState.recepcion[idx],
                        llego: entrada.llego,
                        precio_real: entrada.precio,
                        confirmado: true
                    };
                }
                this._ajustarSaldoProveedor(entrada.item.proveedor_id, this._subtotal(entrada.llego, entrada.precio));
            }
            this.render();
            CacheManager.invalidate(`recepcion:${AppState.currentDate}`);
            CacheManager.invalidate(`flujo:${AppState.currentDate}`);
            await DiaOperativo.refresh();
            await this.load();
            const lista = await this._armarListaPrecios();
            const extra = this._textoListaPrecios(lista);
            Utils.showSuccess(`Se confirmaron ${listos.length} producto(s).${extra}`);
        } catch (error) {
            Utils.showError('Error al confirmar: ' + error.message);
        } finally {
            Utils.hideLoader();
        }
    },

    getValoresProducto(productoId) {
        const llegoInput = document.querySelector(`.recepcion-llego[data-producto-id="${productoId}"]`);
        const precioInput = document.querySelector(`.recepcion-precio[data-producto-id="${productoId}"]`);
        const llego = parseInt(llegoInput?.value, 10);
        const precio = Utils.parsePrice(precioInput?.value || 0);
        return { llego: isNaN(llego) ? 0 : Math.max(0, llego), precio };
    },

    async confirmarProducto(productoId) {
        const item = AppState.recepcion.find(r => String(r.producto_id) === String(productoId));
        if (!item) {
            Utils.showError('Producto no encontrado');
            return;
        }
        if (item.confirmado === true || item.confirmado === 'true') {
            Utils.showInfo('Este producto ya está confirmado');
            return;
        }

        const { llego, precio } = this.getValoresProducto(productoId);
        if (llego > 0 && precio <= 0) {
            Utils.showError('Ingresá el precio real antes de confirmar');
            return;
        }

        const nombre = item.producto_nombre || 'producto';
        const fechaLabel = DiaOperativo.formatFechaLabel(AppState.currentDate);
        const msgLlego = llego === 0
            ? 'No llegó mercadería (0 unidades).'
            : `Llegó: ${llego} · Precio real: ${Utils.formatCurrency(precio)}`;

        const confirmar = await Utils.showConfirm(
            `¿Confirmar recepción de "${nombre}"?\nPedido del ${fechaLabel}\n${msgLlego}\n\nPodrás corregirlo después con "Editar".`
        );
        if (!confirmar) return;

        const btnConfirmar = document.querySelector(`.btn-confirmar-recepcion-item[data-producto-id="${productoId}"]`);
        try {
            if (btnConfirmar) Utils.setButtonLoading(btnConfirmar, true);

            await API.confirmarRecepcionItem({
                fecha: AppState.currentDate,
                producto_id: productoId,
                llego,
                precio_real: precio
            });

            // Actualizar estado local sin recargar del servidor
            const idx = AppState.recepcion.findIndex(r => String(r.producto_id) === String(productoId));
            if (idx !== -1) {
                AppState.recepcion[idx] = {
                    ...AppState.recepcion[idx],
                    llego,
                    precio_real: precio,
                    confirmado: true
                };
            }
            this._ajustarSaldoProveedor(item.proveedor_id, this._subtotal(llego, precio));
            CacheManager.invalidate(`recepcion:${AppState.currentDate}`);
            CacheManager.invalidate(`flujo:${AppState.currentDate}`);
            this.render();
            const lista = await this._armarListaPrecios();
            Utils.showSuccess(`"${nombre}" confirmado.${this._textoListaPrecios(lista)}`);
            DiaOperativo.refresh().catch(() => {});
        } catch (error) {
            console.error('Error confirming recepcion item:', error);
            Utils.showError('Error al confirmar: ' + error.message);
        } finally {
            if (btnConfirmar) Utils.setButtonLoading(btnConfirmar, false);
        }
    },

    async editarProducto(productoId) {
        const item = AppState.recepcion.find(r => String(r.producto_id) === String(productoId));
        if (!item) {
            Utils.showError('Producto no encontrado');
            return;
        }

        const nombre = item.producto_nombre || 'producto';
        const nombreSafe = nombre.replace(/"/g, '&quot;');
        const content = `
            <div class="form-group">
                <label>Producto</label>
                <input type="text" class="form-control" value="${nombreSafe}" disabled>
            </div>
            <div class="form-group">
                <label>Pedido</label>
                <input type="text" class="form-control" value="${item.pedido_total || 0}" disabled>
            </div>
            <div class="form-group">
                <label>Llegó</label>
                <input type="number" id="modal-recepcion-llego" class="form-control" min="0" value="${item.llego || 0}">
            </div>
            <div class="form-group">
                <label>Precio real (costo por unidad)</label>
                <input type="text" id="modal-recepcion-precio" class="form-control" data-price-input="true" value="${Utils.formatPrice(item.precio_real || 0)}" placeholder="Costo del proveedor" title="Lo que te cobró el proveedor por unidad">
                <small class="modal-hint">Lo que te cobró el proveedor por unidad. No es el precio al cliente.</small>
            </div>
        `;

        Utils.showModal('Editar recepción', content, async () => {
            const llego = parseInt(document.getElementById('modal-recepcion-llego').value, 10);
            const precio = Utils.parsePrice(document.getElementById('modal-recepcion-precio').value);

            if (isNaN(llego) || llego < 0) {
                Utils.showError('Ingresá una cantidad válida en "Llegó"');
                throw new Error('Cantidad inválida');
            }
            if (llego > 0 && precio <= 0) {
                Utils.showError('Ingresá el precio real cuando llegó mercadería');
                throw new Error('Precio real requerido');
            }

            try {
                await API.saveRecepcion({
                    fecha: AppState.currentDate,
                    items: [{
                        producto_id: productoId,
                        llego,
                        precio_real: precio
                    }]
                });

                const yaConfirmado = item.confirmado === true || item.confirmado === 'true';
                const delta = (yaConfirmado ? this._subtotal(llego, precio) : 0) - (yaConfirmado ? this._subtotal(item.llego, item.precio_real) : 0);
                const idx = AppState.recepcion.findIndex(r => String(r.producto_id) === String(productoId));
                if (idx !== -1) {
                    AppState.recepcion[idx] = {
                        ...AppState.recepcion[idx],
                        llego,
                        precio_real: precio
                    };
                }
                this._ajustarSaldoProveedor(item.proveedor_id, delta);
                this.render();
                CacheManager.invalidate(`recepcion:${AppState.currentDate}`);
                CacheManager.invalidate(`flujo:${AppState.currentDate}`);
                const lista = yaConfirmado ? await this._armarListaPrecios() : null;
                DiaOperativo.refresh().catch(() => {});
                queueMicrotask(() => Utils.showSuccess(`Recepción de "${nombre}" actualizada.${yaConfirmado ? this._textoListaPrecios(lista) : ''}`));
            } catch (error) {
                console.error('Error updating recepcion item:', error);
                if (error.message !== 'Cantidad inválida' && error.message !== 'Precio real requerido') {
                    Utils.showError('Error al guardar: ' + error.message);
                }
                throw error;
            }
        });
    },

    async eliminarProducto(productoId) {
        const item = AppState.recepcion.find(r => String(r.producto_id) === String(productoId));
        if (!item) {
            Utils.showError('Producto no encontrado');
            return;
        }

        const nombre = item.producto_nombre || 'producto';

        // Pedir confirmación ANTES de mostrar el loader
        const confirmar = await Utils.showConfirm(
            `¿Eliminar la recepción de "${nombre}"?\n\nSe borrarán los datos cargados (llegó y precio). El producto seguirá en el pedido del día.`
        );
        if (!confirmar) return;

        const btnEliminar = document.querySelector(`.btn-eliminar-recepcion-item[data-producto-id="${productoId}"]`);
        try {
            if (btnEliminar) Utils.setButtonLoading(btnEliminar, true);

            await API.deleteRecepcionItem({
                fecha: AppState.currentDate,
                producto_id: productoId
            });

            const estabaConfirmado = item.confirmado === true || item.confirmado === 'true';
            if (estabaConfirmado) {
                this._ajustarSaldoProveedor(item.proveedor_id, -this._subtotal(item.llego, item.precio_real));
            }
            const idx = AppState.recepcion.findIndex(r => String(r.producto_id) === String(productoId));
            if (idx !== -1) {
                AppState.recepcion[idx] = {
                    ...AppState.recepcion[idx],
                    id: 'temp-' + productoId,
                    llego: 0,
                    precio_real: 0,
                    confirmado: false
                };
            }
            CacheManager.invalidate(`recepcion:${AppState.currentDate}`);
            CacheManager.invalidate(`flujo:${AppState.currentDate}`);
            this.render();
            const lista = estabaConfirmado ? await this._armarListaPrecios() : null;
            Utils.showSuccess(`Recepción de "${nombre}" eliminada.${estabaConfirmado ? this._textoListaPrecios(lista) : ''}`);
            DiaOperativo.refresh().catch(() => {});
        } catch (error) {
            console.error('Error deleting recepcion item:', error);
            Utils.showError('Error al eliminar: ' + error.message);
        } finally {
            if (btnEliminar) Utils.setButtonLoading(btnEliminar, false);
        }
    },

    async _armarListaPrecios() {
        try {
            return await Precios.armarLista({ silencioso: true, ajustarNoConfirmados: true });
        } catch (error) {
            console.error('Error armando lista de precios:', error);
            Utils.showWarning('La recepción quedó guardada, pero no se pudo armar la lista de precios. Podés usar Armar lista en Precios al cliente.');
            return null;
        }
    },

    _textoListaPrecios(lista) {
        if (!lista) return '';
        const aviso = lista.aviso ? ` ${lista.aviso}` : '';
        return ` La lista de precios quedó armada.${aviso}`;
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

        const fecha = AppState.currentDate;
        tbody.innerHTML = '';
        const cachedPrecios = CacheManager.get(`precios:${fecha}`);
        const hasStale = AppState.precios.length > 0 || cachedPrecios;
        if (hasStale) {
            if (!AppState.precios.length && cachedPrecios) AppState.precios = cachedPrecios;
            if (AppState.precios.length) {
                this.recepciones = CacheManager.get(`recepcion:${fecha}`) || this.recepciones;
                this.limpiarPrecioClienteAutomatico();
                this.render();
            }
        } else {
            Utils.showLoader(tbody);
        }

        try {
            const flujo = await DataLoader.getFlujo(fecha);
            AppState.precios = flujo.precios || [];
            this.recepciones = flujo.recepcion || [];
            
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
            const comisionGuardada = (AppState.precios || []).find(p => Utils.parsePrice(p.comision_unitaria) > 0);
            if (comisionGuardada) {
                this.comisionPorUnidad = Utils.parsePrice(comisionGuardada.comision_unitaria);
            } else if (savedComision) {
                this.comisionPorUnidad = Utils.parsePrice(savedComision) || 350;
            }
            if (comisionInput) {
                comisionInput.value = this.comisionPorUnidad > 0 ? Utils.formatPrice(this.comisionPorUnidad) : '';
            }

            this.limpiarPrecioClienteAutomatico();
            this.render();
        } catch (error) {
            console.error('Error loading precios:', error);
            Utils.hideTableLoader(tbody);
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: #d32f2f;">Error al cargar precios. Por favor, intenta nuevamente.</td></tr>';
        }
    },
    
    async loadClientesFilter() {
        const select = document.getElementById('precios-filtro-cliente');
        if (!select) return;
        
        try {
            const clientes = AppState.clientes?.length
                ? AppState.clientes
                : await API.getClientes();
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

    // El precio al cliente lo carga el usuario. Si quedó precio real + comisión
    // (del botón que sacamos), lo dejamos vacío.
    limpiarPrecioClienteAutomatico() {
        const extra = Utils.parsePrice(this.comisionPorUnidad) || 0;
        (AppState.precios || []).forEach(precio => {
            const recepcion = (this.recepciones || []).find(r => String(r.producto_id) === String(precio.producto_id));
            const precioReal = Utils.parsePrice(recepcion?.precio_real) || 0;
            const precioCliente = Utils.parsePrice(precio.precio_cliente) || 0;
            if (precioReal > 0 && extra > 0 && precioCliente === precioReal + extra) {
                precio.precio_cliente = 0;
            }
        });
    },
    
    render() {
        const tbody = document.getElementById('precios-tbody');
        const tfoot = document.getElementById('precios-tfoot');
        const resumenDiv = document.getElementById('precios-resumen-cliente');
        if (!tbody) return;
        
        // Ocultar loader local
        Utils.hideTableLoader(tbody);
        
        // GUARDAR VALORES ACTUALES DE LOS INPUTS ANTES DE RENDERIZAR
        const preciosInputs = {};
        document.querySelectorAll('.precio-cliente').forEach(input => {
            const id = input.getAttribute('data-id');
            const raw = (input.value || '').trim();
            if (!id || !raw) return;
            const value = Utils.parsePrice(raw) || 0;
            if (!isNaN(value) && value > 0) {
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
            
            // Precio al cliente: solo lo que escribió el usuario, nunca el precio real.
            const precioUnitario = preciosInputs[precio.id] !== undefined 
                ? preciosInputs[precio.id] 
                : Utils.parsePrice(precio.precio_cliente || 0);
            
            // Obtener precio_real de la recepción
            const recepcion = this.recepciones.find(r => String(r.producto_id) === String(precio.producto_id));
            const confirmada = recepcion && (recepcion.confirmado === true || recepcion.confirmado === 'true' || recepcion.confirmado === 1);
            const precioReal = confirmada ? Utils.parsePrice(recepcion.precio_real || 0) : 0;
            
            const extra = Utils.parsePrice(this.comisionPorUnidad) || 0;
            const pareceAutomatico = precioReal > 0 && extra > 0 && precioUnitario === precioReal + extra;
            const precioManual = pareceAutomatico ? 0 : precioUnitario;
            if (pareceAutomatico) {
                precio.precio_cliente = 0;
            }

            const gananciaPorUnidad = precioManual > 0 ? precioManual - precioReal : 0;
            const gananciaTotal = gananciaPorUnidad * cantidad;
            const total = cantidad * precioManual;
            
            totalProductos += total;
            totalCantidad += cantidad;
            totalGanancia += gananciaTotal;
            
            if (!clienteNombre && precio.cliente_nombre) {
                clienteNombre = precio.cliente_nombre;
            }
            
            rowsHtml += `
                <tr>
                    <td>${Utils.nombreCatalogo(precio, 'cliente')}</td>
                    <td>${Utils.nombreCatalogo(precio, 'producto')}</td>
                    <td>${cantidad}</td>
                    <td>${precioReal > 0 ? Utils.formatCurrency(precioReal) : '-'}</td>
                    <td><input type="text" class="precio-cliente" data-id="${precio.id}" data-price-input="true" value="${precioManual > 0 ? Utils.formatPrice(precioManual) : ''}" onchange="Precios.onPrecioChange()" style="width: 100px;" placeholder="Precio al cliente" title="Lo que le cobrás al cliente por unidad. La comisión se suma aparte."></td>
                    <td style="color: ${gananciaTotal >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}; font-weight: 600;">${precioManual > 0 ? `${gananciaTotal > 0 ? '+' : ''}${Utils.formatCurrency(gananciaTotal)}` : '—'}</td>
                    <td>${precioManual > 0 ? Utils.formatCurrency(total) : '—'}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = rowsHtml;
        Utils.enablePriceInputs(tbody);
        
        // Calcular comisión y saldo total
        const comision = totalCantidad * this.comisionPorUnidad;
        const saldoTotal = totalProductos + comision;
        
        if (resumenDiv) {
            const nombreResumen = this.selectedClienteId ? (clienteNombre || '-') : 'Todos los clientes';
            const nombreEl = document.getElementById('resumen-cliente-nombre');
            if (nombreEl) nombreEl.textContent = nombreResumen;
            document.getElementById('resumen-total-productos').textContent = Utils.formatCurrency(totalProductos);
            const gananciaEl = document.getElementById('resumen-ganancia');
            if (gananciaEl) {
                gananciaEl.textContent = `${totalGanancia > 0 ? '+' : ''}${Utils.formatCurrency(totalGanancia)}`;
                gananciaEl.classList.toggle('resumen-ganancia-positiva', totalGanancia > 0);
                gananciaEl.classList.toggle('resumen-ganancia-negativa', totalGanancia < 0);
            }
            document.getElementById('resumen-comision').textContent = Utils.formatCurrency(comision);
            document.getElementById('resumen-saldo-total').textContent = Utils.formatCurrency(saldoTotal);
            resumenDiv.style.display = 'block';
        }
        
        // Totales siempre visibles: productos, comisión de reparto y saldo a cobrar
        if (tfoot) {
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
        }
    },

    repartirRecibido(lineas, llego) {
        const total = lineas.reduce((sum, linea) => sum + linea.cantidadPedida, 0);
        if (total <= 0) return lineas.map(linea => ({ ...linea, cantidad: 0 }));
        if (llego >= total) return lineas.map(linea => ({ ...linea, cantidad: linea.cantidadPedida }));

        let usada = 0;
        return lineas.map((linea, index) => {
            if (index === lineas.length - 1) {
                const cantidad = Math.max(0, Math.round((llego - usada) * 100) / 100);
                return { ...linea, cantidad };
            }
            const cantidad = Math.round((linea.cantidadPedida / total) * llego * 100) / 100;
            usada += cantidad;
            return { ...linea, cantidad };
        });
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
    
    async armarLista(opciones = {}) {
        const silencioso = !!opciones.silencioso;
        const guardada = (AppState.precios || []).find(p => Utils.parsePrice(p.comision_unitaria) > 0);
        if (guardada) {
            this.comisionPorUnidad = Utils.parsePrice(guardada.comision_unitaria);
        } else {
            const savedComision = localStorage.getItem('precios-comision');
            if (savedComision) this.comisionPorUnidad = Utils.parsePrice(savedComision) || this.comisionPorUnidad;
        }

        const [recepciones, pedidos] = await Promise.all([
            API.getRecepcion(AppState.currentDate),
            API.getPedidos(AppState.currentDate)
        ]);
        if (!pedidos || pedidos.length === 0) {
            throw new Error('No hay pedidos para armar la lista de precios.');
        }

        const confirmada = (recepcion) => recepcion.confirmado === true || recepcion.confirmado === 'true';
        const recepcionesConfirmadas = (recepciones || []).filter(confirmada);
        if (recepcionesConfirmadas.length === 0) {
            throw new Error('No hay recepciones confirmadas para armar la lista de precios.');
        }

        const porProducto = {};
        pedidos.forEach(pedido => {
            if (!porProducto[pedido.producto_id]) porProducto[pedido.producto_id] = [];
            porProducto[pedido.producto_id].push(pedido);
        });

        const preciosItems = [];
        const avisosFaltante = [];
        const confirmadosIds = new Set(recepcionesConfirmadas.map(r => String(r.producto_id)));

        Object.keys(porProducto).forEach(productoId => {
            const recepcion = recepcionesConfirmadas.find(r => String(r.producto_id) === String(productoId));
            if (!recepcion) return;

            const porCliente = {};
            porProducto[productoId].forEach(pedido => {
                const key = String(pedido.cliente_id);
                if (!porCliente[key]) {
                    porCliente[key] = {
                        cliente_id: pedido.cliente_id,
                        producto_id: productoId,
                        producto_nombre: pedido.producto_nombre || '',
                        cantidadPedida: 0
                    };
                }
                porCliente[key].cantidadPedida += parseFloat(pedido.cantidad) || 0;
            });

            const lineas = Object.values(porCliente);
            const pedidoTotal = lineas.reduce((sum, linea) => sum + linea.cantidadPedida, 0);
            const llego = parseFloat(recepcion.llego) || 0;
            if (llego < pedidoTotal) {
                const nombre = lineas[0].producto_nombre || 'Producto';
                avisosFaltante.push(`${nombre}: pedido ${pedidoTotal}, llegó ${llego}`);
            }

            this.repartirRecibido(lineas, llego).forEach(linea => {
                const existentes = (AppState.precios || []).filter(p =>
                    String(p.cliente_id) === String(linea.cliente_id) &&
                    String(p.producto_id) === String(linea.producto_id)
                );
                const existente = existentes.find(p => Utils.parsePrice(p.precio_cliente) > 0) || existentes[0];
                if (linea.cantidad <= 0 && !existente) return;
                const precioReal = Utils.parsePrice(recepcion.precio_real) || 0;
                const extra = Utils.parsePrice(this.comisionPorUnidad) || 0;
                let precioCliente = Utils.parsePrice(existente?.precio_cliente) || 0;
                if (precioReal > 0 && extra > 0 && precioCliente === precioReal + extra) {
                    precioCliente = 0;
                }
                preciosItems.push({
                    cliente_id: linea.cliente_id,
                    producto_id: linea.producto_id,
                    cantidad: linea.cantidad,
                    precio_cliente: precioCliente,
                    comision_unitaria: this.comisionPorUnidad
                });
            });
        });

        if (opciones.ajustarNoConfirmados) {
            const ya = new Set(preciosItems.map(item => `${item.cliente_id}|${item.producto_id}`));
            (AppState.precios || []).forEach(precio => {
                const key = `${precio.cliente_id}|${precio.producto_id}`;
                if (ya.has(key) || confirmadosIds.has(String(precio.producto_id))) return;
                preciosItems.push({
                    cliente_id: precio.cliente_id,
                    producto_id: precio.producto_id,
                    cantidad: 0,
                    precio_cliente: Utils.parsePrice(precio.precio_cliente) || 0,
                    comision_unitaria: this.comisionPorUnidad
                });
            });
        }

        if (preciosItems.length === 0) {
            throw new Error('No se encontraron productos con recepción confirmada que coincidan con los pedidos.');
        }

        await API.savePreciosCliente({
            fecha: AppState.currentDate,
            comision_por_unidad: this.comisionPorUnidad,
            items: preciosItems
        });
        await this.load();
        this.sincronizarCobranza();

        const aviso = avisosFaltante.length
            ? 'Se repartió lo recibido: ' + avisosFaltante.join(' · ')
            : '';
        if (!silencioso) {
            Utils.showSuccess(`Lista de precios generada con ${preciosItems.length} item(s).${aviso ? ' ' + aviso : ''}`);
        }
        return { aviso, items: preciosItems.length };
    },

    async generarLista() {
        try {
            await this.armarLista({ ajustarNoConfirmados: true });
        } catch (error) {
            console.error('Error generating precios:', error);
            Utils.showError('Error al generar lista: ' + error.message);
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
                precioData.precio_cliente = precio;
                items.push({
                    cliente_id: precioData.cliente_id,
                    producto_id: precioData.producto_id,
                    cantidad: precioData.cantidad || 0,
                    precio_cliente: precio,
                    comision_unitaria: this.comisionPorUnidad
                });
            }
        });
        
        if (items.length === 0) {
            Utils.showError('No hay precios para guardar');
            return;
        }

        this.sincronizarCobranza();
        
        try {
            await API.savePreciosCliente({
                fecha: AppState.currentDate,
                comision_por_unidad: this.comisionPorUnidad,
                items: items
            });
            
            Utils.showSuccess('Precios guardados correctamente');
            await this.load();
            this.sincronizarCobranza();
        } catch (error) {
            console.error('Error saving precios:', error);
            Utils.showError('Error al guardar precios: ' + error.message);
            await this.load();
            this.sincronizarCobranza();
        }
    },
    
    sincronizarCobranza() {
        const precios = AppState.precios || [];
        const comisionDefault = Utils.parsePrice(this.comisionPorUnidad) || 0;
        const porCliente = {};

        precios.forEach(precio => {
            const cid = String(precio.cliente_id || '');
            if (!cid) return;
            if (!porCliente[cid]) {
                porCliente[cid] = {
                    cliente_id: precio.cliente_id,
                    cliente_nombre: precio.cliente_nombre || Utils.nombreCatalogo(precio, 'cliente'),
                    total: 0
                };
            }
            const cantidad = parseFloat(precio.cantidad) || 0;
            const unit = Utils.parsePrice(precio.precio_cliente) || 0;
            const comision = precio.comision_unitaria !== undefined && precio.comision_unitaria !== null && precio.comision_unitaria !== ''
                ? Utils.parsePrice(precio.comision_unitaria)
                : comisionDefault;
            porCliente[cid].total += Math.round(cantidad * unit) + Math.round(cantidad * comision);
        });

        const previos = {};
        (CobranzasHoy._lastTotales || []).forEach(item => {
            previos[String(item.cliente_id)] = item;
        });

        const fecha = Utils.fechaIso(AppState.currentDate);
        const cobranzasGuardadas = []
            .concat(CacheManager.get(`cobranzas:${fecha}:all`) || [])
            .concat(CacheManager.get('cobranzas:all:all') || [])
            .concat(AppState.cobranzas || []);

        let pagadoConocido = true;
        CobranzasHoy._revision = (CobranzasHoy._revision || 0) + 1;
        CobranzasHoy._lastTotales = Object.values(porCliente).map(item => {
            const cid = String(item.cliente_id);
            const prev = previos[cid];
            let pagado = null;
            if (prev && CobranzasHoy._pagadoConocido !== false) {
                pagado = parseFloat(prev.pagado) || 0;
            } else {
                const cob = cobranzasGuardadas.find(c =>
                    String(c.cliente_id) === cid && Utils.fechaIso(c.fecha) === fecha
                );
                if (cob) pagado = parseFloat(cob.pagado) || 0;
                else if (prev) pagado = parseFloat(prev.pagado) || 0;
            }
            if (pagado === null) {
                pagadoConocido = false;
                pagado = 0;
            }
            const saldo = Math.max(0, item.total - pagado);
            let estado = 'sin_cobrar';
            if (pagado > 0 && saldo <= 0) estado = 'pagado';
            else if (pagado > 0) estado = 'parcial';
            return {
                ...item,
                pagado,
                saldo,
                estado,
                cobranza_id: prev?.cobranza_id || null
            };
        });
        CobranzasHoy._pagadoConocido = pagadoConocido;

        if (AppState.currentPage === 'cobros-hoy' && pagadoConocido) {
            CobranzasHoy.render(CobranzasHoy._lastTotales);
        }
        CobranzasHoy.load().catch(() => {});
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
        let clienteNombre = '';

        preciosFiltrados.forEach(precio => {
            const cantidad = parseFloat(precio.cantidad || 0);
            const precioUnitario = preciosInputs[precio.id] !== undefined
                ? preciosInputs[precio.id]
                : Utils.parsePrice(precio.precio_cliente || 0);
            const total = cantidad * precioUnitario;

            totalProductos += total;
            totalCantidad += cantidad;
            if (!clienteNombre && precio.cliente_nombre) {
                clienteNombre = precio.cliente_nombre;
            }

            filas.push({
                producto: precio.producto_nombre || '',
                cantidad,
                precioUnitario,
                total
            });
        });

        const comision = totalCantidad * this.comisionPorUnidad;
        const saldoTotal = totalProductos + comision;

        return {
            clienteNombre,
            clienteId: this.selectedClienteId,
            filas,
            totalProductos,
            totalCantidad,
            comision,
            saldoTotal
        };
    },

    handleWhatsAppError(error) {
        if (error instanceof PrecioClienteError) {
            if (error.code === 'SIN_PRECIO') {
                Utils.showWarning(error.message);
            } else {
                Utils.showError(error.message);
            }
            return;
        }

        if (error instanceof WhatsAppError) {
            Utils.showError(error.message);
            return;
        }

        Utils.showError('Error al enviar WhatsApp: ' + error.message);
    },

    async ensureDatosWhatsApp() {
        const promises = [];

        if (!AppState.clientes?.length) {
            promises.push(API.getClientes().then(data => { AppState.clientes = data; }));
        }
        if (AppState.whatsappAutoEnvio === undefined) {
            promises.push(
                API.getWhatsAppStatus()
                    .catch(() => ({ autoEnvioActivo: false }))
                    .then(status => {
                        AppState.whatsappAutoEnvio = !!status.autoEnvioActivo;
                        AppState.whatsappModo = status.modo || 'manual';
                    })
            );
        }

        if (promises.length > 0) {
            await Promise.all(promises);
        }
    },

    async enviarWhatsApp() {
        if (!this.selectedClienteId) {
            Utils.showError('Seleccioná un cliente en el filtro para enviar el mensaje');
            return;
        }

        const datos = this._obtenerDatosClienteParaExportar();
        if (!datos) {
            Utils.showError('No hay datos para enviar');
            return;
        }

        try {
            await this.ensureDatosWhatsApp();

            const cliente = (AppState.clientes || []).find(
                c => String(c.id) === String(this.selectedClienteId)
            );
            PrecioClienteService.validarEnvio(cliente, datos);
            this.abrirModalEnviarWhatsApp(datos);
        } catch (error) {
            console.error('Error preparando WhatsApp:', error);
            this.handleWhatsAppError(error);
        }
    },

    abrirModalEnviarWhatsApp(datos) {
        const cliente = (AppState.clientes || []).find(
            c => String(c.id) === String(this.selectedClienteId)
        );
        const sinTelefono = !cliente?.telefono || !String(cliente.telefono).trim();
        const fechaLabel = DiaOperativo.formatFechaLabel(AppState.currentDate);
        const mensajeDefault = PrecioClienteService.construirMensaje(
            datos,
            this.comisionPorUnidad,
            fechaLabel
        );

        const filasPreview = datos.filas.map(f => `
            <tr>
                <td>${f.producto}</td>
                <td>${f.cantidad}</td>
                <td>${Utils.formatCurrency(f.precioUnitario)}</td>
                <td>${Utils.formatCurrency(f.total)}</td>
            </tr>
        `).join('');

        const saveLabel = AppState.whatsappAutoEnvio ? 'Enviar WhatsApp' : 'Abrir WhatsApp';

        const content = `
            <div class="form-group">
                <label>Cliente</label>
                <p class="modal-static-value">${datos.clienteNombre || '-'}</p>
                <small id="modal-precio-cliente-hint" class="modal-hint">${sinTelefono
                    ? 'Este cliente no tiene teléfono. Configuralo en Clientes.'
                    : (cliente.telefono || '')}</small>
            </div>
            <div class="form-group">
                <label>Detalle del pedido</label>
                <div class="modal-pedido-preview-box">
                    <table class="modal-pedido-detalle-table">
                        <thead>
                            <tr>
                                <th>Producto</th>
                                <th>Cant.</th>
                                <th>Precio</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>${filasPreview}</tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" style="text-align:right;font-weight:600;">Total a pagar</td>
                                <td style="font-weight:700;">${Utils.formatCurrency(datos.saldoTotal)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
            <div class="form-group">
                <label>Mensaje de WhatsApp</label>
                <textarea id="modal-precio-preview-mensaje" class="whatsapp-preview form-control" rows="10"></textarea>
            </div>
        `;

        Utils.showModal('Enviar precios al cliente', content, async () => {
            const mensaje = document.getElementById('modal-precio-preview-mensaje').value.trim();

            if (!mensaje) {
                Utils.showError('Escribí un mensaje para WhatsApp');
                throw new Error('Mensaje requerido');
            }

            await this.ejecutarEnvioWhatsApp(cliente, mensaje);
        }, saveLabel);

        const previewMensaje = document.getElementById('modal-precio-preview-mensaje');
        if (previewMensaje) previewMensaje.value = mensajeDefault;

        const saveBtn = document.getElementById('modal-save');
        if (saveBtn) saveBtn.disabled = sinTelefono;
    },

    async ejecutarEnvioWhatsApp(cliente, mensaje) {
        try {
            PrecioClienteService.validarEnvio(cliente, this._obtenerDatosClienteParaExportar());

            const modoEnvio = await WhatsAppService.sendOrOpen(
                cliente.telefono,
                mensaje,
                API,
                AppState.whatsappAutoEnvio
            );

            const mensajeExito = modoEnvio === 'auto'
                ? `WhatsApp enviado a ${cliente.nombre}.`
                : `WhatsApp abierto para ${cliente.nombre}.`;

            Utils.showSuccess(mensajeExito);
        } catch (error) {
            this.handleWhatsAppError(error);
            throw error;
        }
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

            const extra = Utils.parsePrice(this.comisionPorUnidad) || 0;
            const filasHtml = datos.filas.map((f, i) => {
                const unitario = (parseFloat(f.precioUnitario) || 0) + extra;
                const subtotal = unitario * (parseFloat(f.cantidad) || 0);
                return `
                <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
                    <td class="col-cant">${f.cantidad}</td>
                    <td class="col-prod">${f.producto}</td>
                    <td class="col-money">${Utils.formatCurrency(unitario)}</td>
                    <td class="col-money col-total">${Utils.formatCurrency(subtotal)}</td>
                </tr>`;
            }).join('');

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
      <p>Resumen del pedido</p>
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
      <tr class="saldo">
        <td>Total a pagar</td>
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
    _cerrando: false,

    _cobranzasCache(fecha) {
        return CacheManager.get(`cobranzas:${fecha}:all`)
            || CacheManager.get('cobranzas:all:all')
            || [];
    },

    _itemResumen(label, estadoHtml, hint) {
        const hintHtml = hint
            ? `<p class="cierre-resumen-hint">${hint}</p>`
            : '';
        return `<li>
            <div class="cierre-resumen-main"><span>${label}</span>${estadoHtml}</div>
            ${hintHtml}
        </li>`;
    },

    _hintPrecios(info, precios) {
        if (info && info.precios_completos) {
            return 'Cada producto pedido ya tiene precio al cliente.';
        }

        const pedidos = AppState.pedidos || [];
        const conPrecio = (precios || []).filter(p => Utils.parsePrice(p.precio_cliente) > 0);
        const faltantes = pedidos.filter(pedido => {
            const rec = (AppState.recepcion || []).find(r => String(r.producto_id) === String(pedido.producto_id));
            const confirmado = rec && (rec.confirmado === true || rec.confirmado === 'true' || rec.confirmado === 1);
            if (confirmado && (Number(rec.llego) || 0) <= 0) return false;
            return !conPrecio.some(pr =>
                String(pr.cliente_id) === String(pedido.cliente_id) &&
                String(pr.producto_id) === String(pedido.producto_id)
            );
        });

        const partes = [];
        if (info && !info.recepcion_confirmada) {
            partes.push('Todavía falta confirmar la recepción: el precio se carga después de confirmar lo que llegó.');
        }
        if (faltantes.length > 0) {
            const porCliente = [];
            faltantes.forEach(pedido => {
                const cliente = Utils.nombreCatalogo(pedido, 'cliente');
                const producto = pedido.producto_nombre || Utils.nombreCatalogo(pedido, 'producto');
                let grupo = porCliente.find(item => item.cliente === cliente);
                if (!grupo) {
                    grupo = { cliente, productos: [] };
                    porCliente.push(grupo);
                }
                if (!grupo.productos.includes(producto)) grupo.productos.push(producto);
            });
            const detalles = porCliente.map(grupo => {
                const productos = grupo.productos.length === 1
                    ? grupo.productos[0]
                    : this._unirLista(grupo.productos);
                return `${grupo.cliente} (${productos})`;
            });
            partes.push(`Falta el precio al cliente de ${this._unirLista(detalles)}.`);
        } else {
            partes.push('Falta el precio al cliente en los productos del pedido.');
        }
        partes.push('Queda completo cuando cada producto pedido tiene precio.');
        return partes.join(' ');
    },

    _unirLista(items) {
        const lista = (items || []).map(item => this._textoPlano(item)).filter(Boolean);
        if (lista.length <= 1) return lista[0] || '';
        if (lista.length === 2) return `${lista[0]} y ${lista[1]}`;
        return `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;
    },

    _textoPlano(valor) {
        return String(valor || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    pintarResumen({ info, precios = [], cobranzas = [], proveedores = [], stock = [] } = {}) {
        const resumen = document.getElementById('cierre-resumen');
        if (!resumen) return;

        const recepcionConfirmada = !!(info && info.recepcion_confirmada);
        const preciosCompletos = !!(info && info.precios_completos);
        const confirmados = info?.recepcion_confirmados || 0;
        const totalRecepcion = info?.recepcion_total || 0;

        const estadoRecepcion = recepcionConfirmada
            ? '<span class="cierre-ok">Confirmada</span>'
            : '<span class="cierre-pendiente">Pendiente</span>';
        const hintRecepcion = recepcionConfirmada
            ? 'Todos los productos del pedido están confirmados.'
            : (totalRecepcion > 0
                ? `Confirmaste ${confirmados} de ${totalRecepcion} productos. Falta el resto en Confirmación de lo que llegó.`
                : 'Falta confirmar lo que llegó en Confirmación de lo que llegó.');

        const estadoPrecios = preciosCompletos
            ? '<span class="cierre-ok">Completos</span>'
            : '<span class="cierre-pendiente">Pendientes</span>';
        const hintPrecios = this._hintPrecios(info, precios);

        const clientesIds = [...new Set(
            (precios || [])
                .filter(p => Utils.parsePrice(p.precio_cliente) > 0)
                .map(p => String(p.cliente_id))
        )];
        const totalClientesHoy = clientesIds.length;
        const cobranzasDia = (cobranzas || []).filter(c => {
            if (!AppState.currentDate) return true;
            const fechaCob = Utils.fechaIso(c.fecha);
            return !fechaCob || fechaCob === AppState.currentDate;
        });
        const cobradosHoy = clientesIds.filter(id => {
            const cob = cobranzasDia.find(c => String(c.cliente_id) === id);
            return cob && (String(cob.estado || '').toLowerCase() === 'pagado' || (parseFloat(cob.saldo) || 0) <= 0);
        }).length;
        const parcialHoy = clientesIds.filter(id => {
            const cob = cobranzasDia.find(c => String(c.cliente_id) === id);
            return cob && (parseFloat(cob.pagado) || 0) > 0 && (parseFloat(cob.saldo) || 0) > 0;
        }).length;

        let estadoCobranzasHoy;
        if (totalClientesHoy === 0) {
            estadoCobranzasHoy = '<span class="cierre-pendiente">Sin precios cargados</span>';
        } else if (cobradosHoy === totalClientesHoy) {
            estadoCobranzasHoy = `<span class="cierre-ok">Cobrado (${cobradosHoy}/${totalClientesHoy})</span>`;
        } else {
            estadoCobranzasHoy = `<span class="cierre-pendiente">${cobradosHoy} cobrados, ${parcialHoy} parciales, ${totalClientesHoy - cobradosHoy - parcialHoy} sin cobrar (de ${totalClientesHoy})</span>`;
        }

        const cobranzasPendientes = (cobranzas || []).filter(c => Utils.isCobranzaPendiente(c));
        const estadoCobranzasPendientes = cobranzasPendientes.length > 0
            ? `<span class="cierre-pendiente">Pendientes (${cobranzasPendientes.length})</span>`
            : '<span class="cierre-ok">Sin pendientes</span>';

        const proveedoresPendientes = (proveedores || []).filter(p => (parseFloat(p.saldo) || 0) > 0);
        const estadoProveedores = proveedoresPendientes.length > 0
            ? `<span class="cierre-pendiente">Pendientes (${proveedoresPendientes.length})</span>`
            : '<span class="cierre-ok">Sin pendientes</span>';

        const stockBajo = (stock || []).filter(s => (parseFloat(s.stock_actual ?? s.cantidad) || 0) <= (parseFloat(s.minimo) || 10));
        const estadoStock = stockBajo.length > 0
            ? `<span class="cierre-alerta">Stock bajo (${stockBajo.length} productos)</span>`
            : '<span class="cierre-ok">Actualizado</span>';

        resumen.innerHTML = [
            this._itemResumen('Recepción', estadoRecepcion, hintRecepcion),
            this._itemResumen('Precios al cliente', estadoPrecios, hintPrecios),
            this._itemResumen('Cobranzas del día', estadoCobranzasHoy, totalClientesHoy === 0
                ? 'Se habilita cuando hay precios al cliente cargados.'
                : ''),
            this._itemResumen('Cobranzas pendientes', estadoCobranzasPendientes, cobranzasPendientes.length
                ? 'Paso anterior: clientes con saldo de días anteriores todavía sin cobrar.'
                : 'Paso anterior: no hay deudas viejas de clientes.'),
            this._itemResumen('Proveedores', estadoProveedores, proveedoresPendientes.length
                ? `Paso anterior: ${proveedoresPendientes.length} proveedor${proveedoresPendientes.length === 1 ? '' : 'es'} con saldo a pagar.`
                : 'Paso anterior: ningún proveedor tiene saldo pendiente.'),
            this._itemResumen('Stock', estadoStock, stockBajo.length
                ? `${stockBajo.length} bebida${stockBajo.length === 1 ? '' : 's'} debajo del mínimo.`
                : 'Ningún producto de bebidas está debajo del mínimo.')
        ].join('');
        resumen.dataset.loaded = 'true';

        const btnCerrar = document.getElementById('btn-cerrar-dia');
        if (btnCerrar) {
            const diaCerrado = info && info.estado === 'cerrado';
            btnCerrar.disabled = diaCerrado;
            btnCerrar.textContent = diaCerrado ? 'Día cerrado' : 'Cerrar día';
        }
    },

    async load() {
        const resumen = document.getElementById('cierre-resumen');
        if (!resumen) return;

        const fecha = AppState.currentDate;
        DiaOperativo.renderEstadoPanels();

        this.pintarResumen({
            info: DiaOperativo.getDiaInfo(fecha),
            precios: AppState.precios || [],
            cobranzas: this._cobranzasCache(fecha),
            proveedores: AppState.proveedores || [],
            stock: AppState.stock || []
        });

        try {
            const flujo = await DataLoader.getFlujo(fecha).catch(() => null);
            if (flujo?.precios) AppState.precios = flujo.precios;
            if (flujo?.pedidos) AppState.pedidos = flujo.pedidos;

            const [proveedores, stock, cobranzas] = await Promise.all([
                AppState.proveedores?.length
                    ? Promise.resolve(AppState.proveedores)
                    : API.getProveedores().catch(() => []),
                AppState.stock?.length
                    ? Promise.resolve(AppState.stock)
                    : API.getStock().catch(() => []),
                this._cobranzasCache(fecha).length
                    ? Promise.resolve(this._cobranzasCache(fecha))
                    : API.getCobranzas(fecha).catch(() => [])
            ]);

            if (proveedores.length) AppState.proveedores = proveedores;
            if (stock.length) AppState.stock = stock;

            this.pintarResumen({
                info: DiaOperativo.getDiaInfo(fecha),
                precios: AppState.precios || [],
                cobranzas,
                proveedores,
                stock
            });
        } catch (error) {
            console.error('Error loading cierre resumen:', error);
            if (resumen.dataset.loaded !== 'true') {
                resumen.innerHTML = `
                    <li>Recepción: <span class="cierre-error">Error al cargar</span></li>
                    <li>Precios: <span class="cierre-error">Error al cargar</span></li>
                    <li>Cobranzas del día: <span class="cierre-error">Error al cargar</span></li>
                    <li>Cobranzas pendientes: <span class="cierre-error">Error al cargar</span></li>
                    <li>Proveedores: <span class="cierre-error">Error al cargar</span></li>
                    <li>Stock: <span class="cierre-error">Error al cargar</span></li>
                `;
            }
        } finally {
            Utils.hideLoader(resumen);
        }
    },
    
    async cerrar() {
        if (this._cerrando) return;
        const info = this && DiaOperativo.getDiaInfo(AppState.currentDate);
        if (info && info.estado === 'cerrado') {
            Utils.showInfo('Este día ya está cerrado.');
            return;
        }

        const confirmar = await Utils.showConfirm('¿Está seguro de cerrar el día? Esta acción no se puede deshacer.');
        if (!confirmar) return;

        this._cerrando = true;
        Utils.showLoader();
        try {
            // Validar que la fecha esté disponible
            let fecha = AppState.currentDate;
            
            // Si no hay fecha en AppState, usar la fecha actual
            if (!fecha) {
                fecha = fechaHoyAR();
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
            
            CacheManager.invalidateAllExcept(['clientes', 'productos', 'proveedores']);
            DataLoader.invalidate();
            await DiaOperativo.resolveWorkDate();
            Navigation.navigateTo('dashboard');
        } catch (error) {
            if (String(error.message || '').includes('ya está cerrado')) {
                Utils.showSuccess('Día cerrado correctamente');
                CacheManager.invalidateAllExcept(['clientes', 'productos', 'proveedores']);
                await DiaOperativo.resolveWorkDate();
                Navigation.navigateTo('dashboard');
                return;
            }

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
            this._cerrando = false;
            Utils.hideLoader();
        }
    }
};

// Cobranzas
const Cobranzas = {
    async load() {
        const tbody = document.getElementById('cobranzas-tbody');
        if (!tbody) return;

        const cached = CacheManager.get('cobranzas:all:all');
        const hasStale = AppState.cobranzas.length > 0 || cached;
        if (hasStale) {
            const todas = cached || AppState.cobranzas;
            AppState.cobranzas = (Array.isArray(todas) ? todas : []).filter(c => Utils.isCobranzaPendiente(c));
            this.render();
        } else {
            Utils.showTableLoader(tbody);
        }

        try {
            if (!AppState.clientes.length) {
                AppState.clientes = await API.getClientes().catch(() => []);
            }
            const todas = await API.getCobranzas();
            AppState.cobranzas = todas.filter(c => Utils.isCobranzaPendiente(c));
            this.render();
        } catch (error) {
            console.error('Error loading cobranzas:', error);
            if (!hasStale) Utils.hideTableLoader(tbody);
        }
    },
    
    render() {
        const tbody = document.getElementById('cobranzas-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        Utils.hideTableLoader(tbody);
        
        tbody.innerHTML = '';
        
        if (AppState.cobranzas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: #666;">' +
                'No hay cobranzas pendientes.' +
                '</td></tr>';
            return;
        }
        
        AppState.cobranzas.forEach(cobranza => {
            const tr = document.createElement('tr');
            const saldo = Utils.getCobranzaSaldo(cobranza);
            const cliente = this._clienteDe(cobranza);
            const sinTelefono = !cliente.telefono || !String(cliente.telefono).trim();
            const btnWhatsApp = sinTelefono
                ? '<button class="btn btn-whatsapp btn-sm" type="button" disabled title="Falta teléfono">WhatsApp</button>'
                : `<button class="btn btn-whatsapp btn-sm" type="button" onclick="Cobranzas.enviarWhatsApp('${cobranza.id}')">WhatsApp</button>`;
            tr.innerHTML = `
                <td data-label="Cliente">${cliente.nombre || ''}</td>
                <td data-label="Te debe" style="color:#dc3545;font-weight:700;">${Utils.formatCurrency(saldo)}</td>
                <td data-label="Fecha">${Utils.formatDate(cobranza.fecha)}</td>
                <td data-label="Estado"><span class="status-badge status-pendiente">Pendiente</span></td>
                <td data-label="Acciones">
                    <div class="pagos-acciones">
                        <button class="btn btn-primary btn-sm" type="button" onclick="Cobranzas.cobrar('${cobranza.id}')">Cobrar</button>
                        ${btnWhatsApp}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    _clienteDe(cobranza) {
        const id = String(cobranza?.cliente_id || '');
        const cliente = (AppState.clientes || []).find(c => String(c.id) === id);
        return cliente || {
            id,
            nombre: cobranza?.cliente_nombre || Utils.nombreCatalogo(cobranza, 'cliente'),
            telefono: ''
        };
    },

    _setMontoCobro(valor) {
        const input = document.getElementById('modal-cobro-monto');
        if (!input) return;
        input.value = valor > 0 ? Utils.formatPrice(valor) : '';
        this._actualizarPreviewCobro();
    },

    _actualizarPreviewCobro() {
        const preview = document.getElementById('modal-cobro-preview');
        const saldo = Utils.parsePrice(preview?.dataset.saldo || 0);
        const monto = Utils.parsePrice(document.getElementById('modal-cobro-monto')?.value || 0);
        if (!preview) return;
        if (!monto || monto <= 0) {
            preview.hidden = true;
            preview.innerHTML = '';
            return;
        }
        preview.hidden = false;
        if (monto > saldo) {
            preview.innerHTML = `Ese monto supera lo que te debe (${Utils.formatCurrency(saldo)}).`;
            return;
        }
        const resto = saldo - monto;
        preview.innerHTML = resto > 0
            ? `Vas a cobrar <strong>${Utils.formatCurrency(monto)}</strong>. Queda ${Utils.formatCurrency(resto)}.`
            : `Vas a cobrar todo (${Utils.formatCurrency(monto)}).`;
    },

    async cobrar(cobranzaId) {
        const cobranza = (AppState.cobranzas || []).find(c => String(c.id) === String(cobranzaId));
        if (!cobranza) {
            Utils.showError('Cobranza no encontrada');
            return;
        }
        const cliente = this._clienteDe(cobranza);
        const saldo = Utils.getCobranzaSaldo(cobranza);
        const nombre = cliente.nombre || 'este cliente';
        if (saldo <= 0) {
            Utils.showInfo(`"${nombre}" está al día. No hay nada para cobrar.`);
            return;
        }

        const content = `
            <div class="form-group">
                <label for="modal-cobro-deuda">Dinero a cobrar</label>
                <input type="text" id="modal-cobro-deuda" class="form-control" value="${Utils.formatCurrency(saldo)}" readonly tabindex="-1">
            </div>
            <div class="form-group">
                <label for="modal-cobro-monto">Monto</label>
                <input type="text" id="modal-cobro-monto" class="form-control" data-price-input="true" value="${Utils.formatPrice(saldo)}" placeholder="0" inputmode="numeric">
                <div class="pago-chips">
                    <button type="button" class="pago-chip" id="cobro-chip-todo">Cobrar todo (${Utils.formatCurrency(saldo)})</button>
                </div>
            </div>
            <div class="form-group">
                <label for="modal-cobro-metodo">Cómo te paga</label>
                <select id="modal-cobro-metodo" class="form-control">
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="cheque">Cheque</option>
                </select>
            </div>
            <p class="pago-preview" id="modal-cobro-preview" data-saldo="${saldo}" hidden></p>
        `;

        Utils.showModal('Cobrar a ' + nombre, content, async () => {
            const monto = Utils.parsePrice(document.getElementById('modal-cobro-monto').value);
            const metodo = document.getElementById('modal-cobro-metodo').value;
            if (!monto || monto <= 0) {
                Utils.showError('Poné cuánto te paga.');
                throw new Error('Monto inválido');
            }
            if (monto > saldo) {
                Utils.showError('El monto supera lo que te debe (' + Utils.formatCurrency(saldo) + ').');
                throw new Error('Monto mayor al saldo');
            }
            try {
                await API.registrarCobro({
                    cobranza_id: cobranza.id,
                    monto: monto,
                    fecha: cobranza.fecha || AppState.currentDate
                });
                this._ultimoCobro = {
                    cobranzaId: cobranza.id,
                    clienteId: cliente.id,
                    monto,
                    metodo,
                    saldoRestante: Math.max(0, saldo - monto),
                    fecha: cobranza.fecha
                };
                CacheManager.invalidatePattern('cobranzas');
                await this.load();
                if (cliente.telefono && String(cliente.telefono).trim()) {
                    this.programarAvisoWhatsApp(cliente, this._ultimoCobro, nombre);
                } else {
                    Utils.showSuccess(monto >= saldo
                        ? `Cobro de ${Utils.formatCurrency(monto)} registrado a ${nombre}.`
                        : `Cobro de ${Utils.formatCurrency(monto)} registrado. Queda ${Utils.formatCurrency(saldo - monto)}.`);
                }
            } catch (error) {
                console.error('Error registrando cobro:', error);
                Utils.showError('No se pudo registrar el cobro: ' + (error.message || 'intentá de nuevo.'));
                throw error;
            }
        }, 'Cobrar');

        this._actualizarPreviewCobro();
        document.getElementById('cobro-chip-todo')?.addEventListener('click', () => this._setMontoCobro(saldo));
        document.getElementById('modal-cobro-monto')?.addEventListener('input', () => this._actualizarPreviewCobro());
        document.getElementById('modal-cobro-monto')?.addEventListener('change', () => this._actualizarPreviewCobro());
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
                throw new Error('Campos incompletos');
            }

            const cobranza = cobranzas.find(c => String(c.id) === String(cobranzaId));
            const saldo = cobranza ? Utils.getCobranzaSaldo(cobranza) : 0;
            if (monto > saldo) {
                Utils.showError('El monto supera el saldo pendiente (' + Utils.formatCurrency(saldo) + ').');
                throw new Error('Monto mayor al saldo');
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
    
    metodoLabel(metodo) {
        const labels = { efectivo: 'efectivo', transferencia: 'transferencia', cheque: 'cheque' };
        return labels[metodo] || metodo || 'efectivo';
    },

    construirMensajeWhatsApp(cliente, cobro) {
        const nombre = cliente?.nombre || 'cliente';
        const fecha = cobro?.fecha || AppState.currentDate;
        const fechaLabel = DiaOperativo.formatFechaLabel(fecha);
        if (cobro && cobro.monto > 0) {
            const metodo = this.metodoLabel(cobro.metodo);
            let mensaje = `Hola ${nombre}, registramos tu pago de ${Utils.formatCurrency(cobro.monto)} por ${metodo} del ${fechaLabel}.\n\n`;
            if (cobro.saldoRestante > 0) {
                mensaje += `Saldo pendiente: ${Utils.formatCurrency(cobro.saldoRestante)}.\n\n`;
            } else {
                mensaje += 'Quedamos al día.\n\n';
            }
            mensaje += 'Muchas gracias.';
            return mensaje;
        }
        const saldo = Utils.parsePrice(cliente?.saldo) || 0;
        if (saldo > 0) {
            return `Hola ${nombre}, te recordamos que queda un saldo de ${Utils.formatCurrency(saldo)} del ${fechaLabel}.\n\nMuchas gracias.`;
        }
        return `Hola ${nombre}, te confirmamos que no queda saldo pendiente. Quedamos al día.\n\nMuchas gracias.`;
    },

    programarAvisoWhatsApp(cliente, cobro, nombre) {
        if (!cliente) return;
        setTimeout(() => this.abrirModalWhatsApp(cliente, cobro, nombre), 350);
    },

    async enviarWhatsApp(cobranzaId) {
        try {
            await Pagos.ensureDatosWhatsApp();
            const cobranza = (AppState.cobranzas || []).find(c => String(c.id) === String(cobranzaId));
            if (!cobranza) {
                Utils.showError('Cobranza no encontrada');
                return;
            }
            const cliente = this._clienteDe(cobranza);
            cliente.saldo = Utils.getCobranzaSaldo(cobranza);
            const ultimo = this._ultimoCobro && String(this._ultimoCobro.cobranzaId) === String(cobranzaId)
                ? this._ultimoCobro
                : { fecha: cobranza.fecha };
            this.abrirModalWhatsApp(cliente, ultimo, cliente.nombre);
        } catch (error) {
            console.error('Error preparando WhatsApp de cobro:', error);
            Utils.showError('No se pudo preparar el WhatsApp: ' + (error.message || 'intentá de nuevo.'));
        }
    },

    abrirModalWhatsApp(cliente, cobro = null, nombreCliente = '') {
        if (!cliente) return;
        const nombre = nombreCliente || cliente.nombre || 'cliente';
        const sinTelefono = !cliente.telefono || !String(cliente.telefono).trim();
        const mensajeDefault = this.construirMensajeWhatsApp({ ...cliente, nombre }, cobro);
        const saveLabel = AppState.whatsappAutoEnvio ? 'Enviar WhatsApp' : 'Abrir WhatsApp';
        const saldo = Utils.parsePrice(cliente.saldo) || 0;
        const monto = cobro?.monto > 0 ? cobro.monto : (saldo > 0 ? saldo : 0);
        const metodo = cobro?.metodo ? this.metodoLabel(cobro.metodo) : '—';
        const saldoDespues = cobro && cobro.monto > 0 ? (cobro.saldoRestante || 0) : saldo;

        const content = `
            <div class="form-group">
                <label>Cliente</label>
                <p class="modal-static-value">${nombre}</p>
                <small class="modal-hint">${sinTelefono
                    ? 'Este cliente no tiene teléfono. Configuralo en Clientes.'
                    : (cliente.telefono || '')}</small>
            </div>
            <div class="form-group">
                <label>Detalle del aviso</label>
                <div class="modal-pedido-preview-box">
                    <table class="modal-pedido-detalle-table">
                        <thead><tr><th>Concepto</th><th>Valor</th></tr></thead>
                        <tbody>
                            <tr><td>Cobro</td><td>${monto > 0 ? Utils.formatCurrency(monto) : '—'}</td></tr>
                            <tr><td>Método</td><td>${metodo}</td></tr>
                            <tr><td>Saldo después</td><td>${Utils.formatCurrency(saldoDespues)}</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="form-group">
                <label>Mensaje de WhatsApp</label>
                <textarea id="modal-cobro-preview-mensaje" class="whatsapp-preview form-control" rows="8"></textarea>
            </div>
        `;

        Utils.showModal('Avisar cobro por WhatsApp', content, async () => {
            const mensaje = document.getElementById('modal-cobro-preview-mensaje')?.value.trim();
            if (!mensaje) {
                Utils.showError('Escribí un mensaje para WhatsApp');
                throw new Error('Mensaje requerido');
            }
            await Pagos.ejecutarEnvioWhatsApp({ ...cliente, nombre }, mensaje);
        }, saveLabel);

        const previewMensaje = document.getElementById('modal-cobro-preview-mensaje');
        if (previewMensaje) previewMensaje.value = mensajeDefault;
        const saveBtn = document.getElementById('modal-save');
        if (saveBtn) saveBtn.disabled = sinTelefono;
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

// CobranzasHoy
const CobranzasHoy = {
    _cobrados: new Set(), // cliente_ids ya cobrados en la sesión
    _lastTotales: [],
    _revision: 0,
    _pagadoConocido: true,

    normalizarTotales(totales) {
        return (totales || []).map(item => {
            const total = parseFloat(item.total) || 0;
            const pagado = parseFloat(item.pagado) || 0;
            const saldo = Math.max(0, total - pagado);
            let estado = 'sin_cobrar';
            if (pagado > 0 && saldo <= 0) estado = 'pagado';
            else if (pagado > 0) estado = 'parcial';
            return { ...item, total, pagado, saldo, estado };
        });
    },

    async load() {
        const tbody = document.getElementById('cobros-hoy-tbody');
        if (!tbody) return;

        if (!DiaOperativo.diasPendientes.length) {
            const cachedDias = CacheManager.get('flujo:dias-pendientes');
            if (Array.isArray(cachedDias)) DiaOperativo.diasPendientes = cachedDias;
        }

        const revision = this._revision;
        if (DiaOperativo.diaCerrado(AppState.currentDate)) {
            this.render([]);
            return;
        }
        if (this._lastTotales.length && this._pagadoConocido !== false) {
            this.render(this._lastTotales);
        } else {
            Utils.showTableLoader(tbody);
        }

        try {
            const totales = await API.getTotalesClientesHoy(AppState.currentDate);
            if (revision !== this._revision) return;
            this._pagadoConocido = true;
            this._lastTotales = this.normalizarTotales(Array.isArray(totales) ? totales : []);
            this.render(this._lastTotales);
        } catch (error) {
            console.error('Error loading cobros-hoy:', error);
            if (revision !== this._revision) return;
            if (this._lastTotales.length) {
                this.render(this._lastTotales);
                return;
            }
            Utils.hideTableLoader(tbody);
            if (AppState.currentPage === 'cobros-hoy') {
                Utils.showError('Error al cargar los datos de cobranza. Intente nuevamente.');
            }
        }
    },

    render(totales) {
        const tbody = document.getElementById('cobros-hoy-tbody');
        if (!tbody) return;
        Utils.hideTableLoader(tbody);
        tbody.innerHTML = '';

        const hint = document.getElementById('cobros-hoy-hint');
        if (DiaOperativo.diaCerrado(AppState.currentDate)) {
            if (hint) {
                hint.textContent = 'Este día está cerrado. Lo que quedó sin cobrar está en Cobranzas a clientes (pendientes).';
            }
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#666;">' +
                'Este día está cerrado.<br>' +
                '<small style="color:#999">Lo que quedó sin cobrar está en Cobranzas a clientes (pendientes).</small>' +
                '</td></tr>';
            return;
        }
        if (hint) {
            hint.textContent = 'Cobrás a los clientes de este día. Al cerrar, lo que quede sin cobrar pasa a Cobranzas a clientes (pendientes).';
        }

        if (totales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#666;">' +
                'No hay precios al cliente cargados para el día de hoy.<br>' +
                '<small style="color:#999">Completá el paso "Precios al cliente" primero.</small>' +
                '</td></tr>';
            return;
        }

        totales.forEach(t => {
            const tr = document.createElement('tr');
            const pagado = parseFloat(t.pagado) || 0;
            const saldo = parseFloat(t.saldo) || 0;
            const total = parseFloat(t.total) || 0;
            const pagadoTotal = saldo <= 0 || t.estado === 'pagado';
            const yaCobradoSesion = this._cobrados.has(String(t.cliente_id));

            let estadoBadge;
            if (pagadoTotal) {
                estadoBadge = '<span class="status-badge status-activo">Pagado</span>';
            } else if (pagado > 0) {
                estadoBadge = '<span class="status-badge status-pendiente">Parcial</span>';
            } else {
                estadoBadge = '<span class="status-badge">Sin cobrar</span>';
            }

            const btnDisabled = (yaCobradoSesion && pagadoTotal) || pagadoTotal
                ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '';

            tr.innerHTML = `
                <td>${Utils.nombreCatalogo(t, 'cliente')}</td>
                <td>${Utils.formatCurrency(total)}</td>
                <td>${pagado > 0 ? Utils.formatCurrency(pagado) : '—'}</td>
                <td style="${saldo > 0 ? 'color:#dc3545;font-weight:bold' : 'color:#28a745'}">${Utils.formatCurrency(saldo)}</td>
                <td>${estadoBadge}</td>
                <td>
                    <button class="btn btn-primary" onclick="CobranzasHoy.cobrar('${t.cliente_id}', ${total}, ${saldo})" ${btnDisabled}>
                        ${pagado > 0 && saldo > 0 ? 'Cobrar más' : 'Cobrar'}
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    async cobrar(clienteId, total, saldoActual) {
        const montoSugerido = saldoActual > 0 ? saldoActual : total;
        const content = `
            <div class="form-group">
                <label>Monto a cobrar</label>
                <input type="text" id="modal-cobro-monto" class="form-control" data-price-input="true"
                    value="${montoSugerido > 0 ? montoSugerido : ''}" placeholder="0">
                <small style="color:#666">Total del día: ${Utils.formatCurrency(total)} · Saldo pendiente: ${Utils.formatCurrency(saldoActual)}</small>
            </div>
            <div class="form-group">
                <label>Método</label>
                <select id="modal-cobro-metodo" class="form-control">
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="cheque">Cheque</option>
                </select>
            </div>
        `;

        Utils.showModal('Registrar cobro', content, async () => {
            const monto = Utils.parsePrice(document.getElementById('modal-cobro-monto').value);
            if (!monto || monto <= 0) {
                Utils.showError('Ingresá un monto válido');
                throw new Error('Monto inválido');
            }
            if (monto > saldoActual) {
                Utils.showError('El monto supera el saldo pendiente (' + Utils.formatCurrency(saldoActual) + ').');
                throw new Error('Monto mayor al saldo');
            }

            try {
                await API.cobrarClienteHoy({
                    fecha: AppState.currentDate,
                    cliente_id: clienteId,
                    monto: monto
                });

                Utils.showSuccess('Cobro registrado correctamente');

                if (monto >= saldoActual) {
                    this._cobrados.add(String(clienteId));
                }

                await this.load();
            } catch (error) {
                console.error('Error registrando cobro:', error);
                Utils.showError('Error al registrar el cobro: ' + error.message);
                throw error;
            }
        });
    }
};

// Pagos
const Pagos = {
    _pagados: new Set(),
    _montosHoy: {},
    _ultimoPago: null,
    vista: 'hoy',

    async load() {
        const tbody = document.getElementById('pagos-tbody');
        if (!tbody) return;

        if (!DiaOperativo.diasPendientes.length) {
            const cachedDias = CacheManager.get('flujo:dias-pendientes');
            if (Array.isArray(cachedDias)) DiaOperativo.diasPendientes = cachedDias;
        }
        if (AppState.recepcion) this._aplicarRecepcionHoy(AppState.recepcion);
        const diaListo = this.vista === 'pendientes' || DiaOperativo.diaCerrado(AppState.currentDate);
        const hasStale = AppState.proveedores.length > 0 && (diaListo || Object.keys(this._montosHoy).length > 0);
        if (hasStale) {
            this.render(AppState.proveedores);
        } else {
            Utils.showTableLoader(tbody);
        }

        try {
            const [proveedores, recepcion] = await Promise.all([
                API.getProveedores(),
                API.getRecepcion(AppState.currentDate)
            ]);

            AppState.recepcion = recepcion || [];
            this._aplicarRecepcionHoy(recepcion);
            AppState.proveedores = proveedores;
            this.render(proveedores);
        } catch (error) {
            console.error('Error loading pagos:', error);
            if (!hasStale) Utils.hideTableLoader(tbody);
            Utils.showError('Error al cargar los proveedores. Intente nuevamente.');
        }
    },
    
    render(proveedores) {
        const tbody = document.getElementById('pagos-tbody');
        if (!tbody) return;

        Utils.hideTableLoader(tbody);
        tbody.innerHTML = '';

        const soloPendientes = this.vista === 'pendientes';
        const diaCerrado = DiaOperativo.diaCerrado(AppState.currentDate);
        const titulo = document.getElementById('pagos-titulo');
        const hint = document.getElementById('pagos-hint');
        const diaBar = document.getElementById('pagos-dia-bar');
        if (diaBar) diaBar.hidden = soloPendientes;
        if (titulo) titulo.textContent = soloPendientes ? 'Pagos a proveedores (pendientes)' : 'Pagar al proveedor';
        if (hint) {
            hint.textContent = soloPendientes
                ? 'Acá queda lo que todavía le debés a cada proveedor, de hoy o de días anteriores.'
                : (diaCerrado
                    ? 'Este día está cerrado. Lo que quedó por pagar está en Pagos a proveedores (pendientes).'
                    : 'Pagá la mercadería de este día. Al cerrar, lo que quede por pagar pasa a Pagos a proveedores (pendientes).');
        }

        const lista = [...(proveedores || [])]
            .filter(p => {
                const saldo = Utils.parsePrice(p.saldo) || 0;
                if (soloPendientes) return saldo > 0;
                if (diaCerrado) return false;
                return (this._montosHoy[String(p.id)] || 0) > 0;
            })
            .sort((a, b) => {
            const saldoA = Utils.parsePrice(a.saldo) || 0;
            const saldoB = Utils.parsePrice(b.saldo) || 0;
            const hoyA = this._montosHoy[String(a.id)] || 0;
            const hoyB = this._montosHoy[String(b.id)] || 0;
            const pendA = saldoA > 0 || hoyA > 0;
            const pendB = saldoB > 0 || hoyB > 0;
            if (pendA !== pendB) return pendA ? -1 : 1;
            return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
        });

        let totalDeuda = 0;
        let pendientes = 0;
        lista.forEach(p => {
            const saldo = Utils.parsePrice(p.saldo) || 0;
            if (saldo > 0) {
                totalDeuda += saldo;
                pendientes++;
            }
        });

        const resumen = document.getElementById('pagos-resumen');
        if (resumen) {
            resumen.hidden = lista.length === 0;
            resumen.innerHTML = `
                <div class="pagos-resumen-card is-deuda">
                    <span>Total a pagar</span>
                    <strong>${Utils.formatCurrency(totalDeuda)}</strong>
                </div>
                <div class="pagos-resumen-card">
                    <span>Con saldo pendiente</span>
                    <strong>${pendientes}</strong>
                </div>
                ${soloPendientes ? '' : `<div class="pagos-resumen-card">
                    <span>Al día</span>
                    <strong>${Math.max(0, lista.length - pendientes)}</strong>
                </div>`}
            `;
        }

        if (lista.length === 0) {
            const vacio = soloPendientes
                ? 'No hay pagos pendientes a proveedores.'
                : (diaCerrado
                    ? 'Este día está cerrado. Lo que quedó por pagar está en Pagos a proveedores (pendientes).'
                    : 'No hay mercadería confirmada para pagar en este día.');
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:#666;">${vacio}</td></tr>`;
            if (resumen) resumen.hidden = true;
            return;
        }

        lista.forEach(proveedor => {
            const tr = document.createElement('tr');
            const pagado = this._pagados.has(proveedor.id);
            const deudaHoy = this._montosHoy[String(proveedor.id)] || 0;
            const saldo = Utils.parsePrice(proveedor.saldo) || 0;
            const pendiente = saldo > 0;
            const puedePagar = pendiente && !pagado;
            const sinTelefono = !proveedor.telefono || !String(proveedor.telefono).trim();
            const btnPagar = puedePagar
                ? `<button class="btn btn-primary btn-sm" type="button" onclick="Pagos.registrar('${proveedor.id}')">Pagar</button>`
                : '';
            const btnWhatsApp = sinTelefono
                ? '<button class="btn btn-whatsapp btn-sm" type="button" disabled title="Falta teléfono">WhatsApp</button>'
                : `<button class="btn btn-whatsapp btn-sm" type="button" onclick="Pagos.enviarWhatsApp('${proveedor.id}')">WhatsApp</button>`;
            tr.innerHTML = `
                <td data-label="Proveedor">${proveedor.nombre || ''}</td>
                <td data-label="Le debés" style="${saldo > 0 ? 'color:#dc3545;font-weight:700;' : ''}">${Utils.formatCurrency(saldo)}</td>
                <td data-label="Mercadería de hoy">${deudaHoy > 0 ? Utils.formatCurrency(deudaHoy) : '<span style="color:#aaa">—</span>'}</td>
                <td data-label="Estado"><span class="status-badge ${pendiente ? 'status-pendiente' : 'status-activo'}">${pendiente ? 'Pendiente' : 'Al día'}</span></td>
                <td data-label="Acciones">
                    <div class="pagos-acciones">
                        ${btnPagar}${btnWhatsApp}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    _aplicarRecepcionHoy(recepcion) {
        this._montosHoy = {};
        const fecha = AppState.currentDate;
        (recepcion || []).forEach(item => {
            if (fecha && item.fecha && Utils.fechaIso(item.fecha) !== fecha) return;
            if (item.confirmado === true || item.confirmado === 'true') {
                const provId = String(item.proveedor_id || '');
                if (!provId) return;
                const subtotal = (parseFloat(item.llego) || 0) * (Utils.parsePrice(item.precio_real) || 0);
                this._montosHoy[provId] = (this._montosHoy[provId] || 0) + subtotal;
            }
        });
    },

    async _asegurarRecepcionHoy() {
        if (AppState.recepcion?.length || Object.keys(this._montosHoy || {}).length) {
            if (!Object.keys(this._montosHoy || {}).length) this._aplicarRecepcionHoy(AppState.recepcion);
            return;
        }
        try {
            const recepcion = await API.getRecepcion(AppState.currentDate);
            AppState.recepcion = recepcion || [];
            this._aplicarRecepcionHoy(recepcion);
        } catch (error) {
            console.error('Error cargando recepción para el pago:', error);
        }
    },

    _estimadoPedidosProveedor(proveedorId) {
        const id = String(proveedorId || '');
        if (!id) return 0;
        const precios = {};
        (AppState.recepcion || []).forEach(item => {
            const precio = Utils.parsePrice(item.precio_real) || 0;
            if (precio > 0) precios[String(item.producto_id)] = precio;
        });
        let total = 0;
        (AppState.pedidos || []).forEach(pedido => {
            const { proveedor } = Pedidos.resolverProveedorPedido(pedido);
            if (String(proveedor?.id) !== id) return;
            const precio = precios[String(pedido.producto_id)] || 0;
            total += (parseFloat(pedido.cantidad) || 0) * precio;
        });
        return total;
    },

    _dineroAPagar(proveedorId, saldoPendiente) {
        if (saldoPendiente > 0) return saldoPendiente;
        const mercaderiaHoy = this._montosHoy[String(proveedorId)] || 0;
        if (mercaderiaHoy > 0) return mercaderiaHoy;
        return this._estimadoPedidosProveedor(proveedorId);
    },

    _setMontoPago(valor) {
        const input = document.getElementById('modal-pago-monto');
        if (!input) return;
        input.value = valor > 0 ? Utils.formatPrice(valor) : '';
        this._actualizarPreviewPago();
    },

    _actualizarPreviewPago() {
        const preview = document.getElementById('modal-pago-preview');
        const saldo = Utils.parsePrice(preview?.dataset.saldo || 0);
        const anticipo = preview?.dataset.anticipo === '1';
        const monto = Utils.parsePrice(document.getElementById('modal-pago-monto')?.value || 0);
        if (!preview) return;
        if (!monto || monto <= 0) {
            preview.hidden = true;
            preview.innerHTML = '';
            return;
        }
        preview.hidden = false;
        if (!anticipo && monto > saldo) {
            preview.innerHTML = `Ese monto supera lo que le debés (${Utils.formatCurrency(saldo)}).`;
            return;
        }
        if (anticipo || saldo <= 0) {
            preview.innerHTML = `Vas a pagar <strong>${Utils.formatCurrency(monto)}</strong>.`;
            return;
        }
        const resto = saldo - monto;
        preview.innerHTML = resto > 0
            ? `Vas a pagar <strong>${Utils.formatCurrency(monto)}</strong>. Queda ${Utils.formatCurrency(resto)}.`
            : `Vas a pagar todo (${Utils.formatCurrency(monto)}).`;
    },

    async registrar(proveedorId = null, opciones = {}) {
        const desdePedido = !!opciones.desdePedido;
        if (!proveedorId) return;
        if (this._pagados.has(proveedorId)) {
            Utils.showInfo('En esta sesión ya registraste un pago a este proveedor. Si falta algo, usá Pagos a proveedores.');
            return;
        }

        let proveedorNombre = '';
        let proveedorSaldo = 0;
        let proveedorCompleto = null;
        if (proveedorId) {
            const proveedores = await API.getProveedores();
            const proveedor = proveedores.find(p => String(p.id) === String(proveedorId));
            if (proveedor) {
                proveedorCompleto = proveedor;
                proveedorNombre = proveedor.nombre;
                proveedorSaldo = Utils.parsePrice(proveedor.saldo) || 0;
            }
        }

        const saldoPendiente = Utils.parsePrice(proveedorSaldo) || 0;
        if (saldoPendiente <= 0 && !desdePedido) {
            Utils.showInfo(`"${proveedorNombre || 'Este proveedor'}" está al día. No hay nada para pagar.`);
            return;
        }

        await this._asegurarRecepcionHoy();

        const anticipo = desdePedido && saldoPendiente <= 0;
        const mercaderiaHoy = this._montosHoy[String(proveedorId)] || 0;
        const dineroAPagar = this._dineroAPagar(proveedorId, saldoPendiente);
        const montoSugerido = anticipo ? '' : saldoPendiente;

        const chips = [];
        if (saldoPendiente > 0) {
            chips.push(`<button type="button" class="pago-chip" id="pago-chip-todo">Pagar todo (${Utils.formatCurrency(saldoPendiente)})</button>`);
        }
        if (mercaderiaHoy > 0 && mercaderiaHoy < saldoPendiente) {
            chips.push(`<button type="button" class="pago-chip" id="pago-chip-hoy">Pagar lo de hoy (${Utils.formatCurrency(mercaderiaHoy)})</button>`);
        }

        const content = `
            <div class="form-group">
                <label for="modal-pago-deuda">Dinero a pagar</label>
                <input type="text" id="modal-pago-deuda" class="form-control" value="${Utils.formatCurrency(dineroAPagar)}" readonly tabindex="-1">
            </div>
            <div class="form-group">
                <label for="modal-pago-monto">Monto</label>
                <input type="text" id="modal-pago-monto" class="form-control" data-price-input="true" value="${anticipo ? '' : Utils.formatPrice(montoSugerido)}" placeholder="0" inputmode="numeric">
                <div class="pago-chips">${chips.join('')}</div>
            </div>
            <div class="form-group">
                <label for="modal-pago-metodo">Cómo le pagás</label>
                <select id="modal-pago-metodo" class="form-control">
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="cheque">Cheque</option>
                </select>
            </div>
            <p class="pago-preview" id="modal-pago-preview" data-saldo="${saldoPendiente}" data-anticipo="${anticipo ? '1' : '0'}" hidden></p>
        `;

        Utils.showModal('Pagar a ' + proveedorNombre, content, async () => {
            const monto = Utils.parsePrice(document.getElementById('modal-pago-monto').value);
            const metodo = document.getElementById('modal-pago-metodo').value;

            if (!monto || monto <= 0 || !proveedorId) {
                Utils.showError('Poné cuánto le pagás.');
                throw new Error('Monto inválido');
            }
            if (!anticipo && monto > saldoPendiente) {
                Utils.showError('El monto supera lo que le debés (' + Utils.formatCurrency(saldoPendiente) + ').');
                throw new Error('Monto mayor al saldo');
            }

            try {
                await API.registrarPago({
                    proveedor_id: proveedorId,
                    monto: monto,
                    metodo: metodo,
                    fecha: AppState.currentDate,
                    anticipo: anticipo,
                    nota: anticipo ? 'Pago al hacer el pedido' : ''
                });

                const saldoRestante = anticipo ? Math.max(0, saldoPendiente - monto) : Math.max(0, saldoPendiente - monto);
                this._ultimoPago = {
                    proveedorId,
                    monto,
                    metodo,
                    saldoRestante,
                    anticipo
                };

                if (!anticipo && monto >= saldoPendiente) {
                    this._pagados.add(proveedorId);
                }

                CacheManager.invalidate('proveedores');
                AppState.proveedores = [];
                await this.load();

                const proveedorActual = (AppState.proveedores || []).find(p => String(p.id) === String(proveedorId))
                    || proveedorCompleto
                    || { id: proveedorId, nombre: proveedorNombre, telefono: '', saldo: saldoRestante };

                if (proveedorActual.telefono && String(proveedorActual.telefono).trim()) {
                    this.programarAvisoWhatsApp(proveedorActual, this._ultimoPago);
                } else {
                    Utils.showSuccess(anticipo || monto >= saldoPendiente
                        ? `Pago de ${Utils.formatCurrency(monto)} registrado a ${proveedorNombre}.`
                        : `Pago de ${Utils.formatCurrency(monto)} registrado. Queda ${Utils.formatCurrency(saldoPendiente - monto)}.`);
                }
            } catch (error) {
                console.error('Error registering pago:', error);
                const msg = String(error.message || '');
                if (anticipo && /saldo pendiente/i.test(msg)) {
                    Utils.showError('Todavía no hay saldo de recepción para este proveedor. Pagalo después en Pagos a proveedores, cuando confirmes lo que llegó.');
                } else {
                    Utils.showError('No se pudo registrar el pago: ' + (error.message || 'intentá de nuevo.'));
                }
                throw error;
            }
        }, 'Pagar');

        this._actualizarPreviewPago();
        document.getElementById('pago-chip-todo')?.addEventListener('click', () => this._setMontoPago(saldoPendiente));
        document.getElementById('pago-chip-hoy')?.addEventListener('click', () => this._setMontoPago(mercaderiaHoy));
        document.getElementById('modal-pago-monto')?.addEventListener('input', () => this._actualizarPreviewPago());
        document.getElementById('modal-pago-monto')?.addEventListener('change', () => this._actualizarPreviewPago());
    },

    metodoPagoLabel(metodo) {
        const labels = {
            efectivo: 'efectivo',
            transferencia: 'transferencia',
            cheque: 'cheque'
        };
        return labels[metodo] || metodo || 'efectivo';
    },

    construirMensajeWhatsApp(proveedor, pago) {
        const nombre = proveedor?.nombre || 'proveedor';
        const fechaLabel = DiaOperativo.formatFechaLabel(AppState.currentDate);

        if (pago && pago.monto > 0) {
            const metodo = this.metodoPagoLabel(pago.metodo);
            let mensaje = `Hola ${nombre}, te confirmamos el pago de ${Utils.formatCurrency(pago.monto)} por ${metodo} del ${fechaLabel}.\n\n`;
            if (pago.anticipo && !(pago.saldoRestante > 0)) {
                mensaje += 'Queda registrado como anticipo.\n\n';
            } else if (pago.saldoRestante > 0) {
                mensaje += `Saldo pendiente: ${Utils.formatCurrency(pago.saldoRestante)}.\n\n`;
            } else {
                mensaje += 'Quedamos al día.\n\n';
            }
            mensaje += 'Muchas gracias.';
            return mensaje;
        }

        const saldo = Utils.parsePrice(proveedor?.saldo) || 0;
        if (saldo > 0) {
            return (
                `Hola ${nombre}, te confirmamos el pago de ${Utils.formatCurrency(saldo)} del ${fechaLabel}.\n\n` +
                'Quedamos al día.\n\nMuchas gracias.'
            );
        }

        return `Hola ${nombre}, te confirmamos que no tenemos saldo pendiente. Quedamos al día.\n\nMuchas gracias.`;
    },

    async ensureDatosWhatsApp() {
        if (AppState.whatsappAutoEnvio !== undefined) return;
        try {
            const status = await API.getWhatsAppStatus();
            AppState.whatsappAutoEnvio = !!status.autoEnvioActivo;
            AppState.whatsappModo = status.modo || 'manual';
        } catch (error) {
            AppState.whatsappAutoEnvio = false;
            AppState.whatsappModo = 'manual';
        }
    },

    programarAvisoWhatsApp(proveedor, pago) {
        if (!proveedor?.id) return;
        setTimeout(() => this.abrirModalWhatsApp(proveedor, pago), 350);
    },

    async enviarWhatsApp(proveedorId) {
        try {
            await this.ensureDatosWhatsApp();
            const proveedor = (AppState.proveedores || []).find(p => String(p.id) === String(proveedorId));
            if (!proveedor) {
                Utils.showError('Proveedor no encontrado');
                return;
            }
            const ultimo = this._ultimoPago && String(this._ultimoPago.proveedorId) === String(proveedorId)
                ? this._ultimoPago
                : null;
            this.abrirModalWhatsApp(proveedor, ultimo);
        } catch (error) {
            console.error('Error preparando WhatsApp de pago:', error);
            if (error instanceof WhatsAppError) {
                Utils.showError(error.message);
                return;
            }
            Utils.showError('No se pudo preparar el WhatsApp: ' + (error.message || 'intentá de nuevo.'));
        }
    },

    abrirModalWhatsApp(proveedor, pago = null) {
        if (!proveedor) return;

        const sinTelefono = !proveedor.telefono || !String(proveedor.telefono).trim();
        const mensajeDefault = this.construirMensajeWhatsApp(proveedor, pago);
        const saveLabel = AppState.whatsappAutoEnvio ? 'Enviar WhatsApp' : 'Abrir WhatsApp';
        const saldo = Utils.parsePrice(proveedor.saldo) || 0;
        const monto = pago?.monto > 0 ? pago.monto : (saldo > 0 ? saldo : 0);
        const metodo = pago?.metodo ? this.metodoPagoLabel(pago.metodo) : '—';
        const saldoDespues = pago ? (pago.saldoRestante || 0) : Math.max(0, saldo - monto);

        const content = `
            <div class="form-group">
                <label>Proveedor</label>
                <p class="modal-static-value">${proveedor.nombre || '-'}</p>
                <small class="modal-hint">${sinTelefono
                    ? 'Este proveedor no tiene teléfono. Configuralo en Proveedores.'
                    : (proveedor.telefono || '')}</small>
            </div>
            <div class="form-group">
                <label>Detalle del aviso</label>
                <div class="modal-pedido-preview-box">
                    <table class="modal-pedido-detalle-table">
                        <thead>
                            <tr>
                                <th>Concepto</th>
                                <th>Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Pago</td>
                                <td>${monto > 0 ? Utils.formatCurrency(monto) : '—'}</td>
                            </tr>
                            <tr>
                                <td>Método</td>
                                <td>${metodo}</td>
                            </tr>
                            <tr>
                                <td>Saldo después</td>
                                <td>${pago || monto > 0 ? Utils.formatCurrency(saldoDespues) : Utils.formatCurrency(saldo)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="form-group">
                <label>Mensaje de WhatsApp</label>
                <textarea id="modal-pago-preview-mensaje" class="whatsapp-preview form-control" rows="8"></textarea>
            </div>
        `;

        Utils.showModal('Avisar pago por WhatsApp', content, async () => {
            const mensaje = document.getElementById('modal-pago-preview-mensaje')?.value.trim();
            if (!mensaje) {
                Utils.showError('Escribí un mensaje para WhatsApp');
                throw new Error('Mensaje requerido');
            }
            await this.ejecutarEnvioWhatsApp(proveedor, mensaje);
        }, saveLabel);

        const previewMensaje = document.getElementById('modal-pago-preview-mensaje');
        if (previewMensaje) previewMensaje.value = mensajeDefault;

        const saveBtn = document.getElementById('modal-save');
        if (saveBtn) saveBtn.disabled = sinTelefono;
    },

    async ejecutarEnvioWhatsApp(proveedor, mensaje) {
        try {
            if (!proveedor?.telefono || !String(proveedor.telefono).trim()) {
                throw new WhatsAppError(
                    `El proveedor "${proveedor?.nombre || ''}" no tiene teléfono configurado.`
                );
            }

            const modoEnvio = await WhatsAppService.sendOrOpen(
                proveedor.telefono,
                mensaje,
                API,
                AppState.whatsappAutoEnvio
            );

            Utils.showSuccess(modoEnvio === 'auto'
                ? `WhatsApp enviado a ${proveedor.nombre}.`
                : `WhatsApp abierto para ${proveedor.nombre}.`);
        } catch (error) {
            if (error instanceof WhatsAppError) {
                Utils.showError(error.message);
            } else {
                Utils.showError('Error al enviar WhatsApp: ' + error.message);
            }
            throw error;
        }
    }
};

// Stock
const Stock = {
    async load() {
        const tbody = document.getElementById('stock-tbody');
        if (!tbody) return;

        const cached = CacheManager.get('stock');
        const hasStale = AppState.stock.length > 0 || cached;
        if (hasStale) {
            if (!AppState.stock.length && cached) AppState.stock = cached;
            this.render();
        } else {
            Utils.showTableLoader(tbody);
        }

        try {
            AppState.stock = await API.getStock();
            this.render();
        } catch (error) {
            console.error('Error loading stock:', error);
            if (!hasStale) Utils.hideTableLoader(tbody);
        }
    },
    
    render() {
        const tbody = document.getElementById('stock-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        Utils.hideTableLoader(tbody);
        
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
            const resultado = await API.verificarStockBajo();
            
            if (resultado.productos && resultado.productos.length > 0) {
                Utils.showSuccess(`Se encontraron ${resultado.productos.length} producto(s) con stock bajo. Se ha enviado una notificación por email.`);
            } else {
                Utils.showSuccess('No hay productos con stock bajo. ¡Todo está OK!');
            }
        } catch (error) {
            console.error('Error verificando stock:', error);
            Utils.showError('Error al verificar stock: ' + error.message);
        }
    },
    
    async configurarNotificaciones() {
        try {
            const config = await API.getConfiguracionNotificaciones();
            
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
            console.error('Error cargando configuración:', error);
            Utils.showError('Error al cargar configuración: ' + error.message);
        }
    }
};

// Historial
// Mantenimiento — reset completo de datos
const Mantenimiento = {
    CONFIRM_PHRASE: 'BORRAR TODO',

    limpiarDatosLocales() {
        CacheManager.clear();
        sessionStorage.removeItem('sg_work_date');
        localStorage.removeItem('precios-selected-cliente');
        localStorage.removeItem('precios-comision');

        AppState.currentDate = fechaHoyAR();
        AppState.pedidos = [];
        AppState.productos = [];
        AppState.clientes = [];
        AppState.proveedores = [];
        AppState.recepcion = [];
        AppState.precios = [];
        AppState.cobranzas = [];
        AppState.pagos = [];
        AppState.stock = [];
        AppState.cierres = [];

        // Limpiar requests pendientes y bootstraps en vuelo
        API._bootstrapPromise = null;
        API._pending = {};
        DataLoader.invalidate();
        DiaOperativo.diasPendientes = [];
        DiaOperativo.workDate = AppState.currentDate;
        sessionStorage.setItem('sg_work_date', AppState.currentDate);
    },

    solicitarReset() {
        const content = `
            <p style="margin-bottom:12px;color:#991b1b;line-height:1.5;">
                Vas a borrar <strong>todos</strong> los datos de la app y del Google Sheet.
                Esta acción <strong>no se puede deshacer</strong>.
            </p>
            <div class="form-group">
                <label for="reset-confirm-input">Escribí <strong>${this.CONFIRM_PHRASE}</strong> para confirmar:</label>
                <input type="text" id="reset-confirm-input" class="form-control" autocomplete="off" placeholder="${this.CONFIRM_PHRASE}">
            </div>
        `;

        Utils.showModal('Eliminar todos los datos', content, async () => {
            const input = document.getElementById('reset-confirm-input');
            const valor = (input?.value || '').trim();
            if (valor !== this.CONFIRM_PHRASE) {
                Utils.showError(`Debes escribir exactamente: ${this.CONFIRM_PHRASE}`);
                throw new Error('Confirmación incorrecta');
            }
            await this.ejecutarReset();
        }, 'Eliminar todo');
    },

    async ejecutarReset() {
        Utils.showLoader();
        try {
            await API.resetAllDatos(this.CONFIRM_PHRASE);
            this.limpiarDatosLocales();
            await DiaOperativo.refresh();
            Utils.showSuccess('Todos los datos fueron eliminados. El sistema quedó limpio.');
            Navigation.navigateTo('dashboard');
        } catch (error) {
            const mensaje = String(error.message || '');
            if (mensaje.includes('No se pudo conectar')) {
                try {
                    const [clientes, productos] = await Promise.all([
                        API.request('clientes', 'GET'),
                        API.request('productos', 'GET')
                    ]);
                    if ((clientes || []).length === 0 && (productos || []).length === 0) {
                        this.limpiarDatosLocales();
                        await DiaOperativo.refresh();
                        Utils.showSuccess('Todos los datos fueron eliminados. El sistema quedó limpio.');
                        Navigation.navigateTo('dashboard');
                        return;
                    }
                } catch (verifyError) {
                    console.warn('No se pudo verificar el borrado:', verifyError.message);
                }
            }
            console.error('Error en reset de datos:', error);
            Utils.showError('Error al eliminar datos: ' + error.message);
            throw error;
        } finally {
            Utils.hideLoader();
        }
    }
};

const Historial = {
    async load() {
        const tbody = document.getElementById('historial-tbody');
        if (!tbody) return;
        
        // Mostrar loader local
        Utils.showTableLoader(tbody);
        
        try {
            const cierres = await API.getHistorial();
            AppState.cierres = cierres; // Guardar en AppState
            this.render(cierres);
        } catch (error) {
            console.error('Error loading historial:', error);
            Utils.hideTableLoader(tbody);
        }
    },
    
    render(cierres) {
        const tbody = document.getElementById('historial-tbody');
        if (!tbody) return;
        
        // Ocultar loader local
        Utils.hideTableLoader(tbody);
        
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
    
    async verDia(fecha) {
        const panel = document.getElementById('historial-detalle');
        if (!panel) return;
        panel.hidden = false;
        panel.innerHTML = '<p class="historial-detalle-loading">Cargando el día...</p>';

        try {
            const [pedidos, recepciones, precios, cobranzas] = await Promise.all([
                API.getPedidos(fecha).catch(() => []),
                API.getRecepcion(fecha).catch(() => []),
                API.getPreciosCliente(fecha).catch(() => []),
                API.getCobranzas(fecha).catch(() => [])
            ]);

            const filasPedidos = (pedidos || []).map(p =>
                `<tr><td>${p.cliente_nombre || ''}</td><td>${p.producto_nombre || ''}</td><td class="money">${p.cantidad || 0}</td></tr>`
            ).join('') || '<tr><td colspan="3">Sin pedidos</td></tr>';

            const filasRecepcion = (recepciones || []).map(r =>
                `<tr><td>${r.producto_nombre || ''}</td><td class="money">${r.llego || 0}</td><td class="money">${Utils.formatCurrency(r.precio_real || 0)}</td><td>${r.confirmado ? 'Confirmado' : 'Pendiente'}</td></tr>`
            ).join('') || '<tr><td colspan="4">Sin recepción</td></tr>';

            const filasPrecios = (precios || []).map(p => {
                const cantidad = parseFloat(p.cantidad) || 0;
                const unit = Utils.parsePrice(p.precio_cliente) || 0;
                const comision = Utils.parsePrice(p.comision_unitaria) || 0;
                const total = Math.round(cantidad * unit) + Math.round(cantidad * comision);
                return `<tr><td>${p.cliente_nombre || ''}</td><td>${p.producto_nombre || ''}</td><td class="money">${cantidad}</td><td class="money">${Utils.formatCurrency(unit)}</td><td class="money">${Utils.formatCurrency(total)}</td></tr>`;
            }).join('') || '<tr><td colspan="5">Sin precios</td></tr>';

            const filasCobranzas = (cobranzas || []).map(c =>
                `<tr><td>${c.cliente_nombre || ''}</td><td class="money">${Utils.formatCurrency(c.total || 0)}</td><td class="money">${Utils.formatCurrency(c.pagado || 0)}</td><td class="money ${Utils.parsePrice(c.saldo) > 0 ? 'money-alert' : ''}">${Utils.formatCurrency(c.saldo || 0)}</td></tr>`
            ).join('') || '<tr><td colspan="4">Sin cobranzas</td></tr>';

            panel.innerHTML = `
                <div class="historial-detalle-head">
                    <h3>Día ${Utils.formatDate(fecha)}</h3>
                    <button type="button" class="btn btn-secondary btn-sm" id="btn-cerrar-detalle-dia">Cerrar detalle</button>
                </div>
                <h4>Pedidos</h4>
                <table class="data-table"><thead><tr><th>Cliente</th><th>Producto</th><th>Cantidad</th></tr></thead><tbody>${filasPedidos}</tbody></table>
                <h4>Recepción</h4>
                <table class="data-table"><thead><tr><th>Producto</th><th>Llegó</th><th>Precio real</th><th>Estado</th></tr></thead><tbody>${filasRecepcion}</tbody></table>
                <h4>Precios al cliente</h4>
                <table class="data-table"><thead><tr><th>Cliente</th><th>Producto</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead><tbody>${filasPrecios}</tbody></table>
                <h4>Cobranzas</h4>
                <table class="data-table"><thead><tr><th>Cliente</th><th>Total</th><th>Cobrado</th><th>Saldo</th></tr></thead><tbody>${filasCobranzas}</tbody></table>
            `;
            document.getElementById('btn-cerrar-detalle-dia')?.addEventListener('click', () => {
                panel.hidden = true;
                panel.innerHTML = '';
            });
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
            panel.innerHTML = `<p class="money-alert">No se pudo cargar el día: ${error.message}</p>`;
        }
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

const Caja = {
    async load() {
        const tbody = document.getElementById('caja-tbody');
        if (!tbody) return;
        Utils.showTableLoader(tbody);
        try {
            const movimientos = await API.getCajaMovimientos();
            this.render(Array.isArray(movimientos) ? movimientos : []);
        } catch (error) {
            Utils.hideTableLoader(tbody);
            Utils.showError('Error al cargar la caja: ' + error.message);
        }
    },

    render(movimientos) {
        const tbody = document.getElementById('caja-tbody');
        const fecha = document.getElementById('caja-fecha')?.value || AppState.currentDate;
        Utils.hideTableLoader(tbody);

        const delDia = movimientos.filter(m => String(m.fecha || '').slice(0, 10) === fecha);
        const ingresosDia = delDia.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Utils.parsePrice(m.monto), 0);
        const egresosDia = delDia.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Utils.parsePrice(m.monto), 0);
        const ingresosAll = movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Utils.parsePrice(m.monto), 0);
        const egresosAll = movimientos.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Utils.parsePrice(m.monto), 0);

        const set = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = Utils.formatCurrency(value);
        };
        set('caja-ingresos', ingresosDia);
        set('caja-egresos', egresosDia);
        set('caja-saldo-dia', ingresosDia - egresosDia);
        set('caja-saldo-total', ingresosAll - egresosAll);

        if (delDia.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">No hay movimientos de caja para esta fecha.</td></tr>';
            return;
        }

        tbody.innerHTML = delDia.map(m => `
            <tr>
                <td data-label="Tipo">${m.tipo === 'egreso' ? 'Egreso' : 'Ingreso'}</td>
                <td data-label="Detalle">${m.nota || ''}</td>
                <td data-label="Monto" class="money ${m.tipo === 'egreso' ? 'money-alert' : ''}">${Utils.formatCurrency(m.monto || 0)}</td>
                <td data-label="Referencia">${m.referencia || ''}</td>
            </tr>
        `).join('');
    }
};

// Carga inicial unificada (1 sola llamada JSONP al backend)
const DataLoader = {
    _bootstrapPromise: null,
    _bootstrapFecha: null,

    bootstrap(fecha = AppState.currentDate) {
        const cacheKey = `bootstrap:${fecha}`;
        const cached = CacheManager.get(cacheKey);
        if (cached) {
            this._hydrate(cached, fecha);
            return Promise.resolve(cached);
        }

        if (this._bootstrapPromise && this._bootstrapFecha === fecha) {
            return this._bootstrapPromise;
        }

        this._bootstrapFecha = fecha;
        this._bootstrapPromise = API.getBootstrap(fecha, true)
            .then(data => {
                this._hydrate(data, fecha);
                return data;
            })
            .finally(() => {
                this._bootstrapPromise = null;
                this._bootstrapFecha = null;
                API._bootstrapPromise = null;
            });
        API._bootstrapPromise = this._bootstrapPromise;
        return this._bootstrapPromise;
    },

    _hydrate(data, fecha) {
        if (data.clientes) AppState.clientes = data.clientes;
        if (data.productos) AppState.productos = data.productos;
        if (data.proveedores) AppState.proveedores = data.proveedores;
        if (data.diasPendientes) DiaOperativo.diasPendientes = data.diasPendientes;

        const dash = data.dashboard || data;
        if (dash.pedidos) AppState.pedidos = dash.pedidos;
        if (dash.cobranzas) AppState.cobranzas = dash.cobranzas;
        if (dash.stock) AppState.stock = dash.stock;
    },

    invalidate() {
        this._bootstrapPromise = null;
        this._bootstrapFecha = null;
        API._bootstrapPromise = null;
        CacheManager.invalidatePattern('bootstrap:');
    },

    _flujoPromise: null,
    _flujoFecha: null,
    _flujoToken: 0,

    getFlujo(fecha = AppState.currentDate) {
        const cacheKey = `flujo:${fecha}`;
        const cached = CacheManager.get(cacheKey);
        if (cached) {
            this._hydrateFlujo(cached, fecha);
            return Promise.resolve(cached);
        }
        if (this._flujoPromise && this._flujoFecha === fecha) {
            return this._flujoPromise;
        }
        const token = this._flujoToken;
        this._flujoFecha = fecha;
        this._flujoPromise = API.getFlujoDia(fecha)
            .then(data => {
                if (token !== this._flujoToken) return data;
                this._hydrateFlujo(data, fecha);
                return data;
            })
            .catch(err => {
                this._flujoPromise = null;
                this._flujoFecha = null;
                throw err;
            });
        return this._flujoPromise;
    },

    prefetchFlujo(fecha = AppState.currentDate) {
        if (CacheManager.get(`flujo:${fecha}`)) return;
        this.getFlujo(fecha).catch(() => {});
    },

    _hydrateFlujo(data, fecha) {
        if (data.pedidos) {
            AppState.pedidos = data.pedidos;
            CacheManager.set(`pedidos:${fecha}`, data.pedidos);
        }
        if (data.recepcion) {
            AppState.recepcion = data.recepcion;
            CacheManager.set(`recepcion:${fecha}`, data.recepcion);
        }
        if (data.precios) {
            AppState.precios = data.precios;
            CacheManager.set(`precios:${fecha}`, data.precios);
        }
        CacheManager.set(`flujo:${fecha}`, data);
    },

    invalidateFlujo(fecha = AppState.currentDate) {
        CacheManager.invalidate(`flujo:${fecha}`);
        CacheManager.invalidate(`pedidos:${fecha}`);
        CacheManager.invalidate(`recepcion:${fecha}`);
        CacheManager.invalidate(`precios:${fecha}`);
        this._flujoToken += 1;
        this._flujoPromise = null;
        this._flujoFecha = null;
    }
};

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    Navigation.init();
    DiaOperativo.init();

    const cachedDias = CacheManager.get('flujo:dias-pendientes');
    if (Array.isArray(cachedDias) && cachedDias.length) {
        DiaOperativo.diasPendientes = cachedDias;
    }
    try {
        await DiaOperativo.resolveWorkDate({ skipRefresh: true });
    } catch (error) {
        AppState.currentDate = DiaOperativo.today();
    }
    
    const addButtonListener = (buttonId, handler, loadingText = 'Cargando...', options = {}) => {
        const useButtonLoader = options.useButtonLoader !== false;
        const btn = document.getElementById(buttonId);
        if (btn) {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                
                if (btn.disabled || btn.classList.contains('loading')) {
                    return;
                }
                
                try {
                    if (useButtonLoader) {
                        await Utils.withButtonLoader(btn, handler, loadingText);
                    } else {
                        await handler();
                    }
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
    ProveedoresGestion.initActions();
    addButtonListener('btn-agregar-pedido', () => Pedidos.add(), 'Cargando...');
    addButtonListener('btn-guardar-pedidos', () => Pedidos.enviarPendientes(), 'Preparando...');
    addButtonListener('btn-guardar-recepcion', () => Recepcion.save(), 'Guardando...');
    addButtonListener('btn-confirmar-recepcion-todo', () => Recepcion.confirmarCompletos(), 'Confirmando...', { useButtonLoader: false });
    addButtonListener('btn-generar-lista-precios', () => Precios.generarLista(), 'Generando...');
    addButtonListener('btn-guardar-precios', () => Precios.save(), 'Guardando...');
    addButtonListener('btn-limpiar-filtro', () => Precios.limpiarFiltro(), 'Limpiando...');
    addButtonListener('btn-exportar-pdf-precios', () => Precios.exportarPDF(), 'Generando PDF...');
    addButtonListener('btn-enviar-whatsapp-precios', () => Precios.enviarWhatsApp(), 'Preparando...');
    addButtonListener('btn-reset-todos-datos', () => Mantenimiento.solicitarReset(), 'Eliminando...', { useButtonLoader: false });
    
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
    addButtonListener('btn-seguir-recepcion', () => Navigation.navigateTo('recepcion'), 'Abriendo...');
    addButtonListener('btn-seguir-precios', () => Navigation.navigateTo('precios'), 'Abriendo...');
    addButtonListener('btn-seguir-cobros', () => Navigation.navigateTo('cobros-hoy'), 'Abriendo...');
    addButtonListener('btn-seguir-cobranzas', () => Navigation.navigateTo('pagos'), 'Abriendo...');
    addButtonListener('btn-seguir-pagos', () => Navigation.navigateTo('pagos-pendientes'), 'Abriendo...');
    addButtonListener('btn-seguir-cierre', () => Navigation.navigateTo('cierre'), 'Abriendo...');
    addButtonListener('btn-volver-cierre', () => Navigation.navigateTo('pagos'), 'Volviendo...');
    addButtonListener('btn-cerrar-dia', () => Cierre.cerrar(), 'Cerrando día...', { useButtonLoader: false });
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
    document.getElementById('btn-menu')?.addEventListener('click', () => {
        document.body.classList.toggle('sidebar-open');
    });
    document.getElementById('sidebar-backdrop')?.addEventListener('click', () => {
        document.body.classList.remove('sidebar-open');
    });
    const cajaFecha = document.getElementById('caja-fecha');
    if (cajaFecha) {
        cajaFecha.value = AppState.currentDate;
        cajaFecha.addEventListener('change', () => Caja.load());
    }

    Navigation.navigateTo('dashboard');
});

