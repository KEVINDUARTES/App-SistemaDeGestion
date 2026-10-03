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
    STORAGE_KEY: 'sg_cache_v5',
    CATALOG_STORAGE_KEY: 'sg_catalog_v3',
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
        const clientes = this.peek('clientes');
        const productos = this.peek('productos');
        const proveedores = this.peek('proveedores');
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

        if (now - timestamp > ttl) return null;

        return cached;
    },

    peek(key) {
        if (this.cache[key] == null || !this.timestamps[key]) return null;
        return this.cache[key];
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

    diaSinPedidos(fecha) {
        const info = this.getDiaInfo(fecha || this.workDate || AppState.currentDate);
        if (!info) return false;
        return !(Number(info.pedidos_count) > 0);
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

    refreshSoon() {
        clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(() => {
            this.refresh().catch(() => {});
        }, 1200);
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
            const flowPages = ['pedidos', 'camiones', 'recepcion', 'recepcion-pendientes', 'precios', 'cobros-hoy', 'pagos', 'pagos-pendientes', 'cierre'];
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
        
        newSaveBtn.onclick = () => {
            if (!onSave) {
                closeModal();
                return;
            }

            newSaveBtn.disabled = true;
            newSaveBtn.textContent = 'Guardando...';

            let settled = false;
            let stayOpen = false;
            const finish = (value, failed) => {
                settled = true;
                stayOpen = failed || value === true;
            };

            let result;
            try {
                result = onSave();
            } catch (error) {
                console.error('Error en onSave:', error);
                newSaveBtn.disabled = false;
                newSaveBtn.textContent = saveLabel;
                return;
            }

            if (!result || typeof result.then !== 'function') {
                if (result === true) {
                    newSaveBtn.disabled = false;
                    newSaveBtn.textContent = saveLabel;
                    return;
                }
                closeModal();
                return;
            }

            result.then(
                value => finish(value, false),
                () => finish(undefined, true)
            );

            // Si la validación termina en este turno, el modal sigue abierto.
            // Si el guardado sigue en el servidor, se cierra y la pantalla no espera.
            setTimeout(() => {
                if (!settled) {
                    closeModal();
                    result.catch(() => {});
                    return;
                }
                if (stayOpen) {
                    const btn = document.getElementById('modal-save');
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = saveLabel;
                    }
                    return;
                }
                closeModal();
            }, 0);
        };
        
        newCancelBtn.onclick = closeModal;
        newCloseBtn.onclick = closeModal;
    },
    
    showError: (message) => {
        Utils.showCustomAlert('Error', message, 'error');
    },
    
    showSuccess: (message) => {
        Utils.avisar(message);
        return Promise.resolve();
    },

    avisar: (message) => {
        let aviso = document.getElementById('aviso-rapido');
        if (!aviso) {
            aviso = document.createElement('div');
            aviso.id = 'aviso-rapido';
            aviso.className = 'aviso-rapido';
            aviso.setAttribute('role', 'status');
            document.body.appendChild(aviso);
        }
        aviso.textContent = message;
        aviso.hidden = false;
        clearTimeout(Utils._avisoTimer);
        Utils._avisoTimer = setTimeout(() => {
            aviso.hidden = true;
        }, 2200);
    },

    enSegundoPlano: (tarea, alFallar) => {
        Promise.resolve()
            .then(tarea)
            .catch(error => {
                console.error(error);
                if (alFallar) alFallar(error);
                else Utils.showError(error && error.message ? error.message : 'No se pudo guardar');
            });
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

    async getCamiones(fecha) {
        return await this.request('camiones', 'GET', { fecha });
    },

    async guardarCamiones(fecha, camiones) {
        return await this.request('camiones', 'POST', { fecha, camiones });
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
        if (dash.recepcion) CacheManager.set(`recepcion:${fecha}`, dash.recepcion);
        if (dash.precios) CacheManager.set(`precios:${fecha}`, dash.precios);
        if (dash.pedidos && dash.recepcion && dash.precios) {
            CacheManager.set(`flujo:${fecha}`, {
                fecha: fecha,
                pedidos: dash.pedidos,
                recepcion: dash.recepcion,
                precios: dash.precios
            });
        }
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
        const cacheKey = `cobranzas:totales:${fecha}`;
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;
        const result = await this.request('cobranzas/totales-hoy', 'GET', { fecha });
        CacheManager.set(cacheKey, result);
        return result;
    },

    async cobrarClienteHoy(data) {
        const result = await this.request('cobranzas/cobrar-cliente', 'POST', data);
        CacheManager.invalidatePattern('cobranzas');
        return result;
    },

    async ajustarCobroClienteHoy(data) {
        const result = await this.request('cobranzas/ajustar-cobro', 'POST', data);
        CacheManager.invalidatePattern('cobranzas');
        CacheManager.invalidate('caja');
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

    async repartirEfectivo(data) {
        const result = await this.request('caja/repartir', 'POST', data);
        CacheManager.invalidatePattern('cobranzas');
        CacheManager.invalidate('proveedores');
        CacheManager.invalidate('caja');
        CacheManager.invalidatePattern('dashboard');
        CacheManager.invalidatePattern('bootstrap:');
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
        const screen = requested === 'pagos-pendientes'
            ? 'pagos'
            : (requested === 'recepcion-pendientes' ? 'recepcion' : requested);
        if (requested === 'pagos-pendientes') Pagos.vista = 'pendientes';
        else if (requested === 'pagos') Pagos.vista = 'hoy';
        if (requested === 'recepcion-pendientes') Recepcion.vista = 'pendientes';
        else if (requested === 'recepcion') Recepcion.vista = 'hoy';

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
            camiones: 'Armar camiones',
            recepcion: 'Confirmación de lo que llegó',
            'recepcion-pendientes': 'Confirmar recepción (pendientes)',
            precios: 'Precios al cliente',
            'cobros-hoy': 'Cobranza al cliente',
            cierre: 'Cierre del día',
            cobranzas: 'Cobranzas a clientes (pendientes)',
            pagos: 'Pagar al proveedor',
            'pagos-pendientes': 'Pagos a proveedores (pendientes)',
            stock: 'Stock',
            historial: 'Historial de días',
            reparto: 'Repartir efectivo',
            caja: 'Caja',
            mantenimiento: 'Limpiar datos'
        };
        document.getElementById('page-title').textContent = titles[requested] || 'Dashboard';
        
        // Cargar datos de la página
        this.loadPageData(requested);
    },
    
    async loadPageData(page) {
        try {
            const flowPages = ['pedidos', 'camiones', 'recepcion', 'recepcion-pendientes', 'precios', 'cobros-hoy', 'pagos', 'pagos-pendientes', 'cierre'];
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
                case 'camiones':
                    await Camiones.load();
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
                case 'recepcion-pendientes':
                    await Recepcion.load();
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
                case 'reparto':
                    await Reparto.load();
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
        const cachedDash = CacheManager.peek(`dashboard:${fecha}`);

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
        const stockBajo = Stock._filas(stock).filter(item => item.stock_actual <= item.minimo);
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

        const cached = CacheManager.peek('clientes');
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

        const hasStale = AppState.productos.length > 0 || CacheManager.peek('productos');
        if (hasStale) {
            if (!AppState.productos.length) AppState.productos = CacheManager.peek('productos') || [];
            if (!AppState.proveedores.length) AppState.proveedores = CacheManager.peek('proveedores') || [];
            this.render();
        } else {
            Utils.showTableLoader(tbody);
        }

        try {
            const promises = [];
            if (!CacheManager.get('productos')) {
                promises.push(API.getProductos().then(data => { AppState.productos = data; }));
            }
            if (!CacheManager.get('proveedores')) {
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
        if (!AppState.proveedores?.length) {
            const cache = CacheManager.peek('proveedores');
            if (Array.isArray(cache)) AppState.proveedores = cache;
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

        if (!CacheManager.get('proveedores')) {
            API.getProveedores().then(lista => {
                AppState.proveedores = lista || [];
                const select = document.getElementById('modal-producto-proveedor');
                if (!select) return;
                const elegido = select.value;
                select.innerHTML = '<option value="">Sin proveedor</option>' +
                    AppState.proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
                if (elegido) select.value = elegido;
            }).catch(() => {});
        }
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
        const cached = CacheManager.peek('proveedores');
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

const Camiones = {
    lista: [],
    _guardando: null,
    _avisoScript: false,

    enganchar() {
        const root = document.getElementById('camiones-root');
        if (!root || root.dataset.listo === '1') return;
        root.dataset.listo = '1';
        root.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-accion]');
            if (!btn) return;
            const id = btn.dataset.camion;
            if (btn.dataset.accion === 'quitar-cliente') this.quitarCliente(id, btn.dataset.cliente);
            if (btn.dataset.accion === 'quitar-camion') this.quitar(id);
            if (btn.dataset.accion === 'imprimir') this.imprimir(id);
            if (btn.dataset.accion === 'enviar') this.enviar(id);
        });
        root.addEventListener('change', (event) => {
            const el = event.target;
            if (el.dataset.accion === 'agregar-cliente') this.agregarCliente(el.dataset.camion, el.value);
            if (el.dataset.accion === 'nombre') this.renombrar(el.dataset.camion, el.value);
        });
    },

    async load() {
        const root = document.getElementById('camiones-root');
        if (!root) return;
        const fecha = AppState.currentDate;
        const token = (this._carga = (this._carga || 0) + 1);
        this.lista = this._leerLocal(fecha);
        const pedidosCache = CacheManager.peek(`pedidos:${fecha}`) || CacheManager.peek(`flujo:${fecha}`)?.pedidos;
        if (Array.isArray(pedidosCache)) {
            AppState.pedidos = pedidosCache;
            AppState.fechaCargada = fecha;
        }
        this.render();

        this._asegurarPedidos(fecha).then(() => {
            if (this._carga !== token || AppState.currentDate !== fecha || AppState.currentPage !== 'camiones') return;
            this.render();
        }).catch(error => console.error('Error cargando pedidos del camión:', error));

        API.getCamiones(fecha).then(remotos => {
            if (this._carga !== token || AppState.currentDate !== fecha) return;
            if (Array.isArray(remotos) && remotos.length) {
                this.lista = this._normalizar(remotos);
                this._guardarLocal(fecha, this.lista);
                if (AppState.currentPage === 'camiones') this.render();
            } else if (this.lista.length && Array.isArray(remotos)) {
                this._persistir(false);
            }
        }).catch(() => {});
    },

    async _asegurarPedidos(fecha) {
        if (!AppState.clientes.length) {
            AppState.clientes = CacheManager.get('clientes') || await API.getClientes().catch(() => []);
        }
        if (!AppState.productos.length) {
            AppState.productos = CacheManager.get('productos') || await API.getProductos().catch(() => []);
        }
        if (!AppState.proveedores.length) {
            AppState.proveedores = CacheManager.get('proveedores') || await API.getProveedores().catch(() => []);
        }
        const cached = CacheManager.get(`pedidos:${fecha}`) || CacheManager.get(`flujo:${fecha}`)?.pedidos;
        if (Array.isArray(cached)) {
            AppState.pedidos = cached;
            return;
        }
        if (DiaOperativo.diaSinPedidos(fecha)) {
            AppState.pedidos = [];
            return;
        }
        const flujo = await DataLoader.getFlujo(fecha);
        if (AppState.currentDate !== fecha) return;
        AppState.pedidos = flujo.pedidos || [];
    },

    _pedidos() {
        const fecha = AppState.currentDate;
        return (AppState.pedidos || []).filter(pedido => {
            if (!pedido.fecha) return true;
            return Utils.fechaIso(pedido.fecha) === fecha;
        });
    },

    _clientesDelDia() {
        const map = new Map();
        this._pedidos().forEach(pedido => {
            const id = String(pedido.cliente_id || '');
            if (!id || map.has(id)) return;
            map.set(id, Utils.nombreCatalogo(pedido, 'cliente'));
        });
        return [...map.entries()]
            .map(([id, nombre]) => ({ id, nombre }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    },

    _nombreCliente(clienteId) {
        const hit = this._clientesDelDia().find(c => c.id === String(clienteId));
        if (hit) return hit.nombre;
        const cliente = (AppState.clientes || []).find(c => String(c.id) === String(clienteId));
        return cliente?.nombre || '';
    },

    _clienteConocido(clienteId) {
        return !!this._nombreCliente(clienteId);
    },

    _libres(exceptoCamionId) {
        const enEste = new Set(
            (this.lista.find(c => String(c.id) === String(exceptoCamionId))?.clientes || []).map(String)
        );
        return this._clientesDelDia().filter(c => !enEste.has(c.id)).map(cliente => {
            const otro = this.lista.find(camion =>
                String(camion.id) !== String(exceptoCamionId) &&
                (camion.clientes || []).map(String).includes(cliente.id)
            );
            return { ...cliente, nota: otro ? `sale de ${otro.nombre}` : '' };
        });
    },

    _sinCamion() {
        const ocupados = new Set();
        this.lista.forEach(camion => (camion.clientes || []).forEach(id => ocupados.add(String(id))));
        return this._clientesDelDia().filter(c => !ocupados.has(c.id));
    },

    _filas(camion) {
        const ids = new Set((camion.clientes || []).map(String).filter(id => this._clienteConocido(id)));
        const grupos = new Map();
        this._pedidos().forEach(pedido => {
            const clienteId = String(pedido.cliente_id || '');
            if (!ids.has(clienteId)) return;
            const { nombreProveedor, proveedor } = Pedidos.resolverProveedorPedido(pedido);
            const proveedorId = String(pedido.proveedor_id || proveedor?.id || '');
            const key = [pedido.producto_id, proveedorId, clienteId].join('|');
            if (!grupos.has(key)) {
                grupos.set(key, {
                    producto: pedido.producto_nombre || Utils.nombreCatalogo(pedido, 'producto'),
                    cliente: this._nombreCliente(clienteId),
                    puesto: nombreProveedor,
                    cantidad: 0
                });
            }
            grupos.get(key).cantidad += parseFloat(pedido.cantidad) || 0;
        });
        return [...grupos.values()].filter(fila => fila.cantidad > 0).sort((a, b) => {
            const puesto = a.puesto.localeCompare(b.puesto, 'es');
            if (puesto) return puesto;
            const producto = a.producto.localeCompare(b.producto, 'es');
            if (producto) return producto;
            return a.cliente.localeCompare(b.cliente, 'es');
        });
    },

    _cant(valor) {
        const numero = Math.round((parseFloat(valor) || 0) * 100) / 100;
        if (!numero) return '';
        return Number.isInteger(numero) ? String(numero) : String(numero);
    },

    _esc(valor) {
        return String(valor ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    },

    _tabla(camion) {
        const tieneClientes = (camion.clientes || []).some(id => this._clienteConocido(id));
        const filas = this._filas(camion);
        if (!tieneClientes) return '<p class="camion-vacio">Sumá los clientes que van en este camión.</p>';
        if (!filas.length) return '<p class="camion-vacio">Esos clientes no tienen pedidos en este día.</p>';
        const total = filas.reduce((sum, fila) => sum + fila.cantidad, 0);
        const cuerpo = filas.map(fila => `
            <tr>
                <td>${this._esc(fila.producto)}</td>
                <td>${this._esc(fila.cliente)}</td>
                <td class="num"><strong>${this._cant(fila.cantidad)}</strong></td>
                <td>${this._esc(fila.puesto)}</td>
            </tr>
        `).join('');
        return `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Producto</th>
                            <th>Cliente</th>
                            <th class="num">Cantidad</th>
                            <th>Puesto</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cuerpo}
                        <tr>
                            <td colspan="2"><strong>Total</strong></td>
                            <td class="num"><strong>${this._cant(total)}</strong></td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    },

    render() {
        const root = document.getElementById('camiones-root');
        if (!root) return;
        const clientes = this._clientesDelDia();
        if (!clientes.length && !this.lista.length) {
            root.innerHTML = '<p class="camion-vacio">No hay pedidos cargados para este día. Cargalos en Pedidos del día y volvé acá.</p>';
            return;
        }
        const sueltos = this._sinCamion();
        const aviso = sueltos.length
            ? `<div class="camion-sin"><strong>Sin camión:</strong> ${sueltos.map(c => this._esc(c.nombre)).join(', ')}</div>`
            : '';
        if (!this.lista.length) {
            root.innerHTML = aviso + '<p class="camion-vacio">Agregá un camión y sumale los clientes que van juntos.</p>';
            return;
        }
        const tarjetas = this.lista.map(camion => {
            const libres = this._libres(camion.id);
            const chips = (camion.clientes || []).filter(id => this._clienteConocido(id)).map(id => `
                <span class="camion-chip">${this._esc(this._nombreCliente(id))}
                    <button type="button" data-accion="quitar-cliente" data-camion="${camion.id}" data-cliente="${id}" aria-label="Sacar cliente">×</button>
                </span>
            `).join('');
            const opciones = libres.map(c => `<option value="${c.id}">${this._esc(c.nota ? `${c.nombre} · ${c.nota}` : c.nombre)}</option>`).join('');
            return `
                <article class="camion-card">
                    <div class="camion-card-top">
                        <input class="camion-nombre" data-accion="nombre" data-camion="${camion.id}" value="${this._esc(camion.nombre)}">
                        <button class="btn btn-danger btn-sm" type="button" data-accion="quitar-camion" data-camion="${camion.id}">Quitar camión</button>
                    </div>
                    <div class="camion-clientes">
                        ${chips || '<span>Sin clientes</span>'}
                        <select class="form-control camion-agregar" data-accion="agregar-cliente" data-camion="${camion.id}">
                            <option value="">Sumar cliente</option>
                            ${opciones}
                        </select>
                    </div>
                    ${this._tabla(camion)}
                    <div class="camion-acciones">
                        <button class="btn btn-secondary btn-sm" type="button" data-accion="imprimir" data-camion="${camion.id}">Imprimir</button>
                        <button class="btn btn-whatsapp btn-sm" type="button" data-accion="enviar" data-camion="${camion.id}">WhatsApp</button>
                    </div>
                </article>
            `;
        }).join('');
        root.innerHTML = aviso + `<div class="camion-lista">${tarjetas}</div>`;
    },

    agregar() {
        const numero = this.lista.length + 1;
        this.lista.push({
            id: 'c-' + Date.now(),
            nombre: 'Camión ' + numero,
            orden: numero,
            clientes: []
        });
        this._persistir();
    },

    async quitar(id) {
        const camion = this.lista.find(c => String(c.id) === String(id));
        if (!camion) return;
        const ok = await Utils.showConfirm(`¿Quitar ${camion.nombre}? Los clientes quedan sin camión.`);
        if (!ok) return;
        this.lista = this.lista.filter(c => String(c.id) !== String(id));
        this._persistir();
    },

    renombrar(id, nombre) {
        const camion = this.lista.find(c => String(c.id) === String(id));
        if (!camion) return;
        const limpio = String(nombre || '').trim();
        if (!limpio) return;
        camion.nombre = limpio;
        this._persistir(false);
    },

    agregarCliente(camionId, clienteId) {
        if (!clienteId) return;
        const id = String(clienteId);
        this.lista.forEach(camion => {
            camion.clientes = (camion.clientes || []).map(String).filter(actual => actual !== id);
        });
        const camion = this.lista.find(c => String(c.id) === String(camionId));
        if (!camion) return;
        camion.clientes.push(id);
        this._persistir();
    },

    quitarCliente(camionId, clienteId) {
        const camion = this.lista.find(c => String(c.id) === String(camionId));
        if (!camion) return;
        camion.clientes = (camion.clientes || []).filter(id => String(id) !== String(clienteId));
        this._persistir();
    },

    _normalizar(lista) {
        return (lista || []).map((camion, index) => {
            let clientes = camion.clientes;
            if (typeof clientes === 'string') {
                try { clientes = JSON.parse(clientes); } catch (error) { clientes = []; }
            }
            return {
                id: camion.id || ('c-' + index),
                nombre: camion.nombre || ('Camión ' + (index + 1)),
                orden: Number(camion.orden) || index + 1,
                clientes: Array.isArray(clientes) ? clientes.map(String) : []
            };
        });
    },

    _leerLocal(fecha) {
        try {
            const raw = localStorage.getItem('sg_camiones:' + fecha);
            const data = raw ? JSON.parse(raw) : [];
            return this._normalizar(Array.isArray(data) ? data : []);
        } catch (error) {
            return [];
        }
    },

    _guardarLocal(fecha, lista) {
        localStorage.setItem('sg_camiones:' + fecha, JSON.stringify(lista));
    },

    _persistir(pintar = true) {
        const fecha = AppState.currentDate;
        const payload = this.lista.map((camion, index) => ({
            id: camion.id,
            nombre: camion.nombre,
            orden: index + 1,
            clientes: camion.clientes || []
        }));
        this._guardarLocal(fecha, payload);
        if (pintar) this.render();
        clearTimeout(this._guardando);
        this._guardando = setTimeout(() => {
            Utils.enSegundoPlano(() => API.guardarCamiones(fecha, payload), () => {
                if (this._avisoScript) return;
                this._avisoScript = true;
                Utils.avisar('Quedó en esta compu. Publicá el script para verlo en otro dispositivo.');
            });
        }, 400);
    },

    imprimir(camionId) {
        const lista = camionId
            ? this.lista.filter(c => String(c.id) === String(camionId))
            : this.lista;
        if (!lista.length) {
            Utils.showError('Agregá un camión primero.');
            return;
        }
        Utils.openPrintHtml(this._documento(lista));
    },

    imprimirTodos() {
        this.imprimir(null);
    },

    enviar(camionId) {
        const lista = camionId
            ? this.lista.filter(c => String(c.id) === String(camionId))
            : this.lista;
        if (!lista.length) {
            Utils.showError('Agregá un camión primero.');
            return;
        }
        if (lista.every(camion => !this._filas(camion).length)) {
            Utils.showError('Esos camiones no tienen pedidos para enviar.');
            return;
        }
        const titulo = lista.length === 1 ? lista[0].nombre : 'todos los camiones';
        const content = `
            <p class="modal-hint">Se arma el PDF de ${this._esc(titulo)}, con el mismo formato que el de precios, y se abre WhatsApp con ese archivo listo para enviar.</p>
            <div class="form-group">
                <label for="modal-camion-telefono">Teléfono de quien carga</label>
                <input type="tel" id="modal-camion-telefono" class="form-control" placeholder="261...">
            </div>
        `;
        Utils.showModal('Enviar hoja de carga', content, async () => {
            const telefono = document.getElementById('modal-camion-telefono')?.value.trim();
            if (!telefono) {
                Utils.showError('Poné el teléfono.');
                throw new Error('Falta teléfono');
            }
            await this._enviarPdf(lista, telefono);
        }, 'Enviar PDF');
    },

    enviarTodos() {
        this.enviar(null);
    },

    _fechaHoja() {
        if (!AppState.currentDate) return '';
        return new Date(AppState.currentDate + 'T12:00:00').toLocaleDateString('es-AR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    },

    _documento(lista) {
        const fecha = this._fechaHoja();
        const generado = new Date().toLocaleString('es-AR');
        const bloques = lista.map(camion => {
            const filas = this._filas(camion);
            const total = filas.reduce((sum, fila) => sum + fila.cantidad, 0);
            const cuerpo = filas.map((fila, i) => `
                <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
                    <td class="col-prod">${this._esc(fila.producto)}</td>
                    <td>${this._esc(fila.cliente)}</td>
                    <td class="col-cant">${this._esc(this._cant(fila.cantidad))}</td>
                    <td>${this._esc(fila.puesto)}</td>
                </tr>
            `).join('');
            return `
            <section class="hoja">
              <div class="doc-header">
                <div class="brand">
                  <h1>Luciano Cargas</h1>
                  <p>Hoja de carga</p>
                </div>
                <div class="doc-meta">
                  <strong>Fecha de carga</strong>
                  ${this._esc(fecha)}<br>
                  <span style="font-size:11px;">Generado: ${this._esc(generado)}</span>
                </div>
              </div>
              <div class="cliente-box">
                <div class="label">Camión</div>
                <div class="name">${this._esc(camion.nombre)}</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cliente</th>
                    <th class="col-cant">Cant.</th>
                    <th>Puesto</th>
                  </tr>
                </thead>
                <tbody>${cuerpo}</tbody>
              </table>
              <div class="totals-wrap">
                <table class="totals-table">
                  <tr class="saldo">
                    <td>Total a cargar</td>
                    <td>${this._esc(this._cant(total))}</td>
                  </tr>
                </table>
              </div>
              <div class="footer">Documento generado por el Sistema de Gestión Luciano Cargas</div>
            </section>`;
        }).join('');
        return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Hoja de carga</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; font-size: 13px; color: #1e293b; padding: 32px 40px; background: #fff; }
                .doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 3px solid #1a73e8; }
                .brand h1 { font-size: 26px; font-weight: 700; color: #1a73e8; letter-spacing: -0.5px; }
                .brand p { font-size: 12px; color: #64748b; margin-top: 4px; }
                .doc-meta { text-align: right; font-size: 12px; color: #475569; line-height: 1.6; }
                .doc-meta strong { color: #1e293b; display: block; font-size: 14px; margin-bottom: 4px; }
                .cliente-box { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-left: 4px solid #1a73e8; padding: 16px 20px; border-radius: 8px; margin-bottom: 24px; }
                .cliente-box .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; font-weight: 600; }
                .cliente-box .name { font-size: 22px; font-weight: 700; color: #1e293b; margin-top: 4px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
                thead th { background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%); color: #fff; padding: 12px 14px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
                tbody td { padding: 11px 14px; border-bottom: 1px solid #e2e8f0; }
                .row-even { background: #fff; }
                .row-odd { background: #f8fafc; }
                .col-cant { text-align: center; font-weight: 600; width: 70px; }
                .col-prod { font-weight: 500; }
                .totals-wrap { margin-top: 20px; display: flex; justify-content: flex-end; }
                .totals-table { width: 280px; }
                .totals-table td { padding: 10px 14px; font-size: 16px; font-weight: 700; }
                .totals-table tr.saldo td { background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%); color: #fff; border: none; }
                .totals-table td:last-child { text-align: right; }
                .footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
                .hoja { break-after: page; page-break-after: always; }
                .hoja:last-child { break-after: auto; page-break-after: auto; }
                @media print { body { padding: 20px; } @page { margin: 15mm; } }
            </style></head><body>${bloques}
            <script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 200); });<\/script>
            </body></html>`;
    },

    async _enviarPdf(lista, telefono) {
        const JsPDF = await Precios._cargarJsPdf();
        const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        lista.forEach((camion, indice) => {
            if (indice > 0) doc.addPage();
            this._dibujarPdf(doc, camion);
        });
        const nombre = lista.length === 1
            ? `carga-${String(lista[0].nombre).replace(/[^\w\-]+/g, '-')}.pdf`
            : 'carga-camiones.pdf';
        const blob = doc.output('blob');
        const archivo = new File([blob], nombre, { type: 'application/pdf' });
        const texto = lista.length === 1
            ? `Te mando la carga de ${lista[0].nombre}.`
            : 'Te mando la carga de los camiones.';
        const compartido = await this._compartirPdf(archivo, texto);
        if (compartido === 'ok' || compartido === 'cancelado') return;
        WhatsAppService.openChat(telefono, texto);
        doc.save(nombre);
        Utils.avisar('WhatsApp abierto. En esta computadora el PDF se descarga al lado: arrastralo al chat para enviarlo.');
    },

    async _compartirPdf(archivo, texto) {
        if (!navigator.share) return 'no';
        const datos = { files: [archivo], title: 'Hoja de carga', text: texto };
        if (navigator.canShare && !navigator.canShare(datos)) return 'no';
        try {
            await navigator.share(datos);
            return 'ok';
        } catch (error) {
            if (error && error.name === 'AbortError') return 'cancelado';
            return 'no';
        }
    },

    _dibujarPdf(doc, camion) {
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const m = 14;
        const ancho = pageW - (m * 2);
        const filas = this._filas(camion);
        const fecha = this._fechaHoja();
        const azul = [26, 115, 232];
        const tinta = [30, 41, 59];
        const muted = [100, 116, 139];
        const cols = [
            { titulo: 'PRODUCTO', ancho: 62, align: 'left', campo: 'producto' },
            { titulo: 'CLIENTE', ancho: 58, align: 'left', campo: 'cliente' },
            { titulo: 'CANT.', ancho: 22, align: 'center', campo: 'cantidad' },
            { titulo: 'PUESTO', ancho: 40, align: 'left', campo: 'puesto' }
        ];

        doc.setFillColor(...azul);
        doc.rect(0, 0, pageW, 34, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.text('Luciano Cargas', m, 15);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text('Hoja de carga', m, 23);
        doc.setFontSize(10);
        doc.text(String(fecha || ''), pageW - m, 14, { align: 'right' });
        doc.text(String(camion.nombre || 'Camión'), pageW - m, 21, { align: 'right' });

        doc.setFillColor(239, 246, 255);
        doc.roundedRect(m, 42, ancho, 20, 2, 2, 'F');
        doc.setFillColor(...azul);
        doc.rect(m, 42, 1.6, 20, 'F');
        doc.setTextColor(...muted);
        doc.setFontSize(8);
        doc.text('CAMIÓN', m + 6, 50);
        doc.setTextColor(...tinta);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text(String(camion.nombre || 'Camión'), m + 6, 57);

        let y = 70;
        const pintarCabeza = () => {
            doc.setFillColor(...azul);
            doc.rect(m, y, ancho, 9, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            let x = m;
            cols.forEach(col => {
                const tx = col.align === 'center' ? x + (col.ancho / 2) : x + 3;
                doc.text(col.titulo, tx, y + 6, { align: col.align === 'center' ? 'center' : 'left' });
                x += col.ancho;
            });
            y += 9;
        };
        const valorFila = (fila, campo) => {
            if (campo === 'cantidad') return this._cant(fila.cantidad);
            return String(fila[campo] || '');
        };
        pintarCabeza();
        filas.forEach((fila, indice) => {
            if (y > pageH - 32) {
                doc.addPage();
                y = 16;
                pintarCabeza();
            }
            if (indice % 2 === 1) {
                doc.setFillColor(248, 250, 252);
                doc.rect(m, y, ancho, 8, 'F');
            }
            doc.setDrawColor(226, 232, 240);
            doc.line(m, y + 8, m + ancho, y + 8);
            doc.setTextColor(...tinta);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            let x = m;
            cols.forEach(col => {
                const texto = doc.splitTextToSize(valorFila(fila, col.campo), col.ancho - 6)[0] || '';
                const tx = col.align === 'center' ? x + (col.ancho / 2) : x + 3;
                doc.text(texto, tx, y + 5.4, { align: col.align === 'center' ? 'center' : 'left' });
                x += col.ancho;
            });
            y += 8;
        });

        const total = filas.reduce((sum, fila) => sum + fila.cantidad, 0);
        y += 8;
        doc.setFillColor(...azul);
        doc.roundedRect(pageW - m - 74, y, 74, 12, 1.5, 1.5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Total a cargar', pageW - m - 70, y + 7.6);
        doc.text(this._cant(total), pageW - m - 4, y + 7.6, { align: 'right' });

        doc.setTextColor(...muted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text('Documento generado por el Sistema de Gestión Luciano Cargas', pageW / 2, pageH - 10, { align: 'center' });
    }
};

// Pedidos
const Pedidos = {
    async load() {
        const tbody = document.getElementById('pedidos-tbody');
        if (!tbody) return;

        const fecha = AppState.currentDate;
        const fresco = CacheManager.get(`pedidos:${fecha}`) || CacheManager.get(`flujo:${fecha}`)?.pedidos;
        const cached = Array.isArray(fresco)
            ? fresco
            : (CacheManager.peek(`pedidos:${fecha}`) || CacheManager.peek(`flujo:${fecha}`)?.pedidos);
        if (Array.isArray(cached)) {
            AppState.pedidos = cached;
            AppState.fechaCargada = fecha;
            this.aplicarEnviadosLocales();
            this.render();
            if (Array.isArray(fresco)) return;
        } else if (AppState.fechaCargada === fecha) {
            this.aplicarEnviadosLocales();
            this.render();
            return;
        } else if (DiaOperativo.diaSinPedidos(fecha)) {
            AppState.pedidos = [];
            AppState.fechaCargada = fecha;
            this.render();
            return;
        }

        if (!Array.isArray(cached)) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#666;">Buscando pedidos…</td></tr>';
        }
        this.ensureDatosProveedor().catch(() => {});

        try {
            const flujo = await DataLoader.getFlujo(fecha);
            if (AppState.currentDate !== fecha) return;
            AppState.pedidos = this._conservarPendientes(flujo.pedidos || []);
            AppState.fechaCargada = fecha;
            this.aplicarEnviadosLocales();
            this.render();
        } catch (error) {
            console.error('Error loading pedidos:', error);
            Utils.hideLoader(tbody);
        }
    },

    _conservarPendientes(servidor) {
        const lista = Array.isArray(servidor) ? servidor.slice() : [];
        const ids = new Set(lista.map(pedido => String(pedido.id)));
        (AppState.pedidos || []).forEach(pedido => {
            if (!String(pedido.id).startsWith('local-')) return;
            if (ids.has(String(pedido.id))) return;
            lista.push(pedido);
        });
        return lista;
    },

    encontrarPedido(pedidoId) {
        const id = String(pedidoId);
        return (AppState.pedidos || []).find(pedido =>
            String(pedido.id) === id || String(pedido.idLocal) === id
        ) || null;
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

        if (!AppState.proveedores?.length) {
            const cache = CacheManager.peek('proveedores');
            if (Array.isArray(cache)) AppState.proveedores = cache;
            else promises.push(API.getProveedores().then(data => { AppState.proveedores = data; }));
        }
        
        if (promises.length > 0) {
            await Promise.all(promises);
        }
        
        const clientes = AppState.clientes;
        const productos = AppState.productos;
        const proveedores = this.getProveedoresActivos(AppState.proveedores);
        
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
                <label>Proveedor</label>
                <select id="modal-proveedor" class="form-control">
                    <option value="">Sin proveedor</option>
                    ${proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
                </select>
                <small class="modal-hint">Al elegir el producto se marca su proveedor habitual. Podés cambiarlo para este pedido.</small>
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
                const proveedorId = document.getElementById('modal-proveedor').value;
                const cantidad = parseInt(document.getElementById('modal-cantidad').value);
                
                console.log('🔵 Datos del pedido:', { clienteId, productoId, proveedorId, cantidad });
                
                if (!clienteId || !productoId || !cantidad) {
                    Utils.showError('Complete todos los campos');
                    throw new Error('Campos incompletos');
                }
                
                const producto = productos.find(p => p.id == productoId);
                
                if (!producto) {
                    Utils.showError('Producto no encontrado');
                    return;
                }
                
                const cliente = clientes.find(c => String(c.id) === String(clienteId));
                const tempId = 'local-' + Date.now();
                const nuevoPedido = {
                    id: tempId,
                    idLocal: tempId,
                    fecha: AppState.currentDate,
                    cliente_id: clienteId,
                    producto_id: productoId,
                    cliente_nombre: cliente?.nombre || '',
                    producto_nombre: producto.nombre,
                    tipo: producto.tipo,
                    cantidad,
                    proveedor_id: proveedorId,
                    enviado: false
                };
                Utils.upsertInList(AppState.pedidos, nuevoPedido);
                CacheManager.set(`pedidos:${AppState.currentDate}`, AppState.pedidos);
                this.render();
                Utils.avisar('Pedido agregado');
                DiaOperativo.refreshSoon();

                const seguirCargando = document.getElementById('modal-seguir-cargando')?.checked;
                if (seguirCargando) {
                    setTimeout(() => Pedidos.add(clienteId), 40);
                }

                const payload = {
                    fecha: AppState.currentDate,
                    cliente_id: clienteId,
                    producto_id: productoId,
                    tipo: producto.tipo,
                    cantidad,
                    proveedor_id: proveedorId
                };
                Utils.enSegundoPlano(async () => {
                    const result = await API.createPedido(payload);
                    const guardado = (AppState.pedidos || []).find(p => p.id === tempId);
                    if (!guardado) return;
                    guardado.id = result.id || tempId;
                    guardado.idLocal = tempId;
                    Object.assign(guardado, result, {
                        cliente_nombre: nuevoPedido.cliente_nombre,
                        producto_nombre: nuevoPedido.producto_nombre,
                        tipo: nuevoPedido.tipo,
                        cantidad,
                        proveedor_id: proveedorId,
                        id: result.id || tempId,
                        idLocal: tempId
                    });
                    CacheManager.set(`pedidos:${AppState.currentDate}`, AppState.pedidos);
                    if (AppState.currentPage === 'pedidos') this.render();
                }, () => {
                    Utils.removeFromList(AppState.pedidos, tempId);
                    CacheManager.set(`pedidos:${AppState.currentDate}`, AppState.pedidos);
                    if (AppState.currentPage === 'pedidos') Pedidos.render();
                    Utils.showError('No se pudo guardar el pedido. Se quitó de la lista.');
                });
            } catch (error) {
                console.error('❌ Error en creación de pedido:', error);
                Utils.showError('Error al crear pedido: ' + error.message);
            }
        });

        const productoSelect = document.getElementById('modal-producto');
        const proveedorSelect = document.getElementById('modal-proveedor');
        productoSelect?.addEventListener('change', () => {
            const producto = productos.find(p => String(p.id) === String(productoSelect.value));
            const habitual = producto?.proveedor_default || '';
            if (!proveedorSelect) return;
            proveedorSelect.value = [...proveedorSelect.options].some(opcion => opcion.value === String(habitual))
                ? String(habitual)
                : '';
        });
    },
    
    async edit(id) {
        const pedido = this.encontrarPedido(id);
        if (!pedido) {
            Utils.showError('Pedido no encontrado');
            return;
        }
        
        if (!AppState.clientes?.length) AppState.clientes = await API.getClientes();
        if (!AppState.productos?.length) AppState.productos = await API.getProductos();
        const clientes = AppState.clientes;
        const productos = AppState.productos;
        await this.ensureDatosProveedor();
        const proveedores = this.getProveedoresActivos(AppState.proveedores);
        const productoActual = productos.find(p => String(p.id) === String(pedido.producto_id));
        const proveedorActual = pedido.proveedor_id || productoActual?.proveedor_default || '';
        
        const content = `
            <div class="form-group">
                <label>Cliente</label>
                <select id="modal-cliente" class="form-control">
                    <option value="">Seleccionar...</option>
                    ${clientes.map(c => `<option value="${c.id}" ${String(c.id) === String(pedido.cliente_id) ? 'selected' : ''}>${c.nombre}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Producto</label>
                <select id="modal-producto" class="form-control">
                    <option value="">Seleccionar...</option>
                    ${productos.map(p => `<option value="${p.id}" ${String(p.id) === String(pedido.producto_id) ? 'selected' : ''}>${p.nombre} (${p.tipo})</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Cantidad</label>
                <input type="number" id="modal-cantidad" class="form-control" min="1" value="${pedido.cantidad || 1}">
            </div>
            <div class="form-group">
                <label>Proveedor</label>
                <select id="modal-proveedor" class="form-control">
                    <option value="">Sin proveedor</option>
                    ${proveedores.map(p => `<option value="${p.id}" ${String(p.id) === String(proveedorActual) ? 'selected' : ''}>${p.nombre}</option>`).join('')}
                </select>
                <small class="modal-hint">El mismo producto puede pedirse a distintos proveedores. Este cambio vale solo para este pedido.</small>
            </div>
        `;
        
        Utils.showModal('Editar pedido', content, async () => {
            const clienteId = document.getElementById('modal-cliente').value;
            const productoId = document.getElementById('modal-producto').value;
            const cantidad = parseInt(document.getElementById('modal-cantidad').value);
            const proveedorId = document.getElementById('modal-proveedor').value;
            
            if (!clienteId || !productoId || !cantidad) {
                Utils.showError('Complete todos los campos');
                return;
            }
            
            const producto = productos.find(p => String(p.id) === String(productoId));
            const cliente = clientes.find(c => String(c.id) === String(clienteId));
            const anterior = { ...pedido };
            Object.assign(pedido, {
                cliente_id: clienteId,
                producto_id: productoId,
                tipo: producto?.tipo || pedido.tipo,
                cantidad,
                proveedor_id: proveedorId,
                cliente_nombre: cliente?.nombre || pedido.cliente_nombre,
                producto_nombre: producto?.nombre || pedido.producto_nombre
            });
            CacheManager.set(`pedidos:${pedido.fecha || AppState.currentDate}`, AppState.pedidos);
            this.render();
            Utils.avisar('Pedido actualizado');

            Utils.enSegundoPlano(async () => {
                await API.updatePedido(id, {
                    fecha: pedido.fecha,
                    cliente_id: clienteId,
                    producto_id: productoId,
                    tipo: pedido.tipo,
                    cantidad,
                    proveedor_id: proveedorId
                });
                CacheManager.set(`pedidos:${pedido.fecha || AppState.currentDate}`, AppState.pedidos);
            }, () => {
                Object.assign(pedido, anterior);
                CacheManager.set(`pedidos:${pedido.fecha || AppState.currentDate}`, AppState.pedidos);
                if (AppState.currentPage === 'pedidos') Pedidos.render();
                Utils.showError('No se pudo actualizar el pedido.');
            });
        });
    },
    
    async delete(id) {
        const pedido = this.encontrarPedido(id);
        if (!pedido) return;
        const idReal = pedido.id;
        document.getElementById('modal-overlay')?.classList.remove('active');
        const confirmar = await Utils.showConfirm('¿Está seguro de eliminar este pedido?');
        if (!confirmar) return;
        
        const anterior = { ...pedido };
        Utils.removeFromList(AppState.pedidos, idReal);
        CacheManager.set(`pedidos:${AppState.currentDate}`, AppState.pedidos);
        this.render();
        Utils.avisar('Pedido eliminado');
        DiaOperativo.refreshSoon();

        if (String(idReal).startsWith('local-')) return;

        Utils.enSegundoPlano(() => API.deletePedido(idReal), () => {
            if (anterior) Utils.upsertInList(AppState.pedidos, anterior);
            CacheManager.set(`pedidos:${AppState.currentDate}`, AppState.pedidos);
            if (AppState.currentPage === 'pedidos') Pedidos.render();
            Utils.showError('No se pudo eliminar el pedido.');
        });
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
                const proveedorId = pedido.proveedor_id || producto?.proveedor_default || PedidoProveedorService.SIN_PROVEEDOR_ID;
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
        const proveedorId = pedido?.proveedor_id || producto?.proveedor_default || '';
        const proveedor = (AppState.proveedores || []).find(p => String(p.id) === String(proveedorId));
        return {
            producto,
            proveedor,
            nombreProveedor: proveedor?.nombre || 'Sin proveedor'
        };
    },

    abrirAcciones(pedidoId) {
        const pedido = this.encontrarPedido(pedidoId);
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

            const pedido = this.encontrarPedido(pedidoId);
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

            const pedido = this.encontrarPedido(pedidoId);
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

    async guardarProveedorDelPedido(pedido, proveedorId) {
        await API.updatePedido(pedido.id, {
            fecha: pedido.fecha,
            cliente_id: pedido.cliente_id,
            producto_id: pedido.producto_id,
            tipo: pedido.tipo,
            cantidad: pedido.cantidad,
            proveedor_id: proveedorId
        });
        pedido.proveedor_id = proveedorId;
        const lista = AppState.pedidos || [];
        const local = lista.find(p => String(p.id) === String(pedido.id));
        if (local) local.proveedor_id = proveedorId;
        CacheManager.set(`pedidos:${pedido.fecha || AppState.currentDate}`, lista);
    },

    abrirModalEnviarPedido(pedido, modo = 'seleccionar') {
        const esReSeleccion = modo === 'reSeleccionar';
        const proveedoresActivos = this.getProveedoresActivos(AppState.proveedores);
        if (proveedoresActivos.length === 0) {
            Utils.showError('No hay proveedores activos. Agregá proveedores en Configuración.');
            return;
        }

        const producto = AppState.productos.find(p => String(p.id) === String(pedido.producto_id));

        const proveedorElegido = pedido.proveedor_id || producto?.proveedor_default || '';
        const proveedorDefault = proveedorElegido &&
            proveedoresActivos.some(p => String(p.id) === String(proveedorElegido))
            ? proveedorElegido
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

            await this.guardarProveedorDelPedido(pedido, proveedorId);

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

            await this.guardarProveedorDelPedido(pedido, proveedorId);

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
    vista: 'hoy',
    _actionsBound: false,

    findById(list, id) {
        if (!list || id === null || id === undefined) return null;
        return list.find(item => String(item.id) === String(id)) || null;
    },

    findRecepcionForProducto(recepciones, productoId) {
        return recepciones.find(r => String(r.producto_id) === String(productoId)) || null;
    },

    _prepararDiaPendiente() {
        const heading = document.querySelector('#recepcion .page-header h2');
        const hint = document.querySelector('#recepcion .dia-operativo-hint');
        if (this.vista !== 'pendientes') {
            if (heading) heading.textContent = 'Confirmación de lo que llegó';
            if (hint) {
                hint.innerHTML = 'Confirmá <strong>cada producto</strong> cuando llegue. Al confirmar se arma la lista de precios al cliente con lo que llegó. Los que falten podés confirmarlos otro día (poné 0 en "Llegó" si no vino).';
            }
            return false;
        }

        if (heading) heading.textContent = 'Confirmar recepción (pendientes)';
        if (hint) {
            hint.innerHTML = 'Elegí el día que todavía no recibiste. Sirve para confirmar hoy lo que se pidió ayer.';
        }

        const dias = (DiaOperativo.diasPendientes || []).filter(d => d.estado === 'recepcion_pendiente');
        if (!dias.length || dias.some(d => d.fecha === AppState.currentDate)) return false;

        const fecha = dias[0].fecha;
        DiaOperativo.workDate = fecha;
        AppState.currentDate = fecha;
        sessionStorage.setItem('sg_work_date', fecha);
        DiaOperativo.renderSelectors();
        return true;
    },

    _proveedorDePedidos(pedidos, productoId) {
        const conteo = {};
        (pedidos || []).forEach(pedido => {
            if (String(pedido.producto_id) !== String(productoId) || !pedido.proveedor_id) return;
            const id = String(pedido.proveedor_id);
            conteo[id] = (conteo[id] || 0) + (parseFloat(pedido.cantidad) || 1);
        });
        let mejor = '';
        let max = 0;
        Object.keys(conteo).forEach(id => {
            if (conteo[id] > max) {
                max = conteo[id];
                mejor = id;
            }
        });
        return mejor;
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
        const cambioDia = this._prepararDiaPendiente();
        if (cambioDia) AppState.recepcion = [];
        const fecha = AppState.currentDate;
        const token = DataLoader._flujoToken;
        if (DiaOperativo.diaSinPedidos(fecha)) {
            AppState.recepcion = [];
            AppState.fechaCargada = fecha;
            this.render();
            return;
        }

        const flujoLocal = DataLoader.armarFlujoLocal(fecha);
        const flujoRecordado = flujoLocal || CacheManager.peek(`flujo:${fecha}`);
        if (flujoRecordado && !flujoLocal) {
            AppState.recepcion = flujoRecordado.recepcion || [];
            if (Array.isArray(flujoRecordado.pedidos)) AppState.pedidos = flujoRecordado.pedidos;
            this.render();
        } else if (!flujoLocal && AppState.fechaCargada !== fecha) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#666;">Buscando recepción…</td></tr>';
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
                const proveedorPedidoId = this._proveedorDePedidos(pedidos, productoId);
                const proveedor = producto
                    ? this.findById(proveedores, proveedorPedidoId || producto.proveedor_default)
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
                    proveedor_id: (confirmado && rec?.proveedor_id) || proveedorPedidoId || rec?.proveedor_id || producto?.proveedor_default || local?.proveedor_id || '',
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

        const anteriores = listos.map(entrada => ({ ...entrada.item }));
        listos.forEach(entrada => {
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
        });
        CacheManager.set(`recepcion:${AppState.currentDate}`, AppState.recepcion);
        CacheManager.invalidate(`flujo:${AppState.currentDate}`);
        this.render();
        Utils.avisar(`Se confirmaron ${listos.length} producto(s)`);
        DiaOperativo.refreshSoon();

        Utils.enSegundoPlano(async () => {
            for (const entrada of listos) {
                await API.confirmarRecepcionItem({
                    fecha: AppState.currentDate,
                    producto_id: entrada.item.producto_id,
                    llego: entrada.llego,
                    precio_real: entrada.precio,
                    proveedor_id: entrada.item.proveedor_id,
                    pedido_total: entrada.item.pedido_total
                });
            }
            this._armarListaPrecios();
        }, () => {
            listos.forEach(entrada => {
                this._ajustarSaldoProveedor(entrada.item.proveedor_id, -this._subtotal(entrada.llego, entrada.precio));
            });
            anteriores.forEach(anterior => {
                const idx = AppState.recepcion.findIndex(r => String(r.producto_id) === String(anterior.producto_id));
                if (idx !== -1) AppState.recepcion[idx] = anterior;
            });
            CacheManager.set(`recepcion:${AppState.currentDate}`, AppState.recepcion);
            this.render();
            Utils.showError('No se pudo confirmar la recepción. Volvé a intentarlo.');
        });
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

        const anterior = { ...item };
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
        CacheManager.set(`recepcion:${AppState.currentDate}`, AppState.recepcion);
        CacheManager.invalidate(`flujo:${AppState.currentDate}`);
        this.render();
        Utils.avisar(`"${nombre}" confirmado`);
        DiaOperativo.refreshSoon();

        Utils.enSegundoPlano(async () => {
            await API.confirmarRecepcionItem({
                fecha: AppState.currentDate,
                producto_id: productoId,
                llego,
                precio_real: precio,
                proveedor_id: item.proveedor_id,
                pedido_total: item.pedido_total
            });
            this._armarListaPrecios();
        }, () => {
            const actual = AppState.recepcion.findIndex(r => String(r.producto_id) === String(productoId));
            if (actual !== -1) AppState.recepcion[actual] = anterior;
            this._ajustarSaldoProveedor(item.proveedor_id, -this._subtotal(llego, precio));
            CacheManager.set(`recepcion:${AppState.currentDate}`, AppState.recepcion);
            this.render();
            Utils.showError('No se pudo confirmar "' + nombre + '".');
        });
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

            const yaConfirmado = item.confirmado === true || item.confirmado === 'true';
            const anterior = { llego: item.llego, precio_real: item.precio_real };
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
            CacheManager.set(`recepcion:${AppState.currentDate}`, AppState.recepcion);
            CacheManager.invalidate(`flujo:${AppState.currentDate}`);
            this.render();
            Utils.avisar(`Recepción de "${nombre}" actualizada`);

            Utils.enSegundoPlano(async () => {
                await API.saveRecepcion({
                    fecha: AppState.currentDate,
                    items: [{
                        producto_id: productoId,
                        llego,
                        precio_real: precio,
                        pedido_total: item.pedido_total,
                        proveedor_id: item.proveedor_id
                    }]
                });
                if (yaConfirmado) this._armarListaPrecios();
            }, () => {
                const actual = AppState.recepcion.findIndex(r => String(r.producto_id) === String(productoId));
                if (actual !== -1) {
                    AppState.recepcion[actual] = {
                        ...AppState.recepcion[actual],
                        llego: anterior.llego,
                        precio_real: anterior.precio_real
                    };
                }
                this._ajustarSaldoProveedor(item.proveedor_id, -delta);
                CacheManager.set(`recepcion:${AppState.currentDate}`, AppState.recepcion);
                this.render();
                Utils.showError('No se pudo guardar la recepción.');
            });
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

        const estabaConfirmado = item.confirmado === true || item.confirmado === 'true';
        const anterior = { ...item };
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
        CacheManager.set(`recepcion:${AppState.currentDate}`, AppState.recepcion);
        CacheManager.invalidate(`flujo:${AppState.currentDate}`);
        this.render();
        Utils.avisar(`Recepción de "${nombre}" eliminada`);
        DiaOperativo.refreshSoon();

        Utils.enSegundoPlano(async () => {
            await API.deleteRecepcionItem({
                fecha: AppState.currentDate,
                producto_id: productoId
            });
            if (estabaConfirmado) this._armarListaPrecios();
        }, () => {
            const actual = AppState.recepcion.findIndex(r => String(r.producto_id) === String(productoId));
            if (actual !== -1) AppState.recepcion[actual] = anterior;
            if (estabaConfirmado) {
                this._ajustarSaldoProveedor(anterior.proveedor_id, this._subtotal(anterior.llego, anterior.precio_real));
            }
            CacheManager.set(`recepcion:${AppState.currentDate}`, AppState.recepcion);
            this.render();
            Utils.showError('No se pudo eliminar la recepción.');
        });
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
        if (DiaOperativo.diaSinPedidos(fecha)) {
            AppState.precios = [];
            AppState.fechaCargada = fecha;
            this.recepciones = [];
            this.render();
            return;
        }

        const preciosFrescos = CacheManager.get(`precios:${fecha}`);
        const cachedPrecios = preciosFrescos || CacheManager.peek(`precios:${fecha}`);
        const flujoLocal = DataLoader.armarFlujoLocal(fecha);
        if (flujoLocal) {
            AppState.precios = flujoLocal.precios || [];
            this.recepciones = flujoLocal.recepcion || [];
            AppState.fechaCargada = fecha;
            this.limpiarPrecioClienteAutomatico();
            this.render();
            this.loadClientesFilter();
            return;
        }

        const hasStale = AppState.fechaCargada === fecha || AppState.precios.length > 0 || cachedPrecios;
        if (hasStale) {
            if (!AppState.precios.length && cachedPrecios) AppState.precios = cachedPrecios;
            this.recepciones = CacheManager.peek(`recepcion:${fecha}`) || this.recepciones;
            this.limpiarPrecioClienteAutomatico();
            this.render();
            if (Array.isArray(preciosFrescos) || AppState.fechaCargada === fecha) {
                this.loadClientesFilter();
                return;
            }
        } else {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#666;">Buscando precios…</td></tr>';
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
        CacheManager.set(`precios:${AppState.currentDate}`, AppState.precios);
        Utils.avisar('Precios guardados');

        Utils.enSegundoPlano(async () => {
            await API.savePreciosCliente({
                fecha: AppState.currentDate,
                comision_por_unidad: this.comisionPorUnidad,
                items: items
            });
            CacheManager.set(`precios:${AppState.currentDate}`, AppState.precios);
        }, async () => {
            Utils.showError('No se pudieron guardar los precios.');
            await this.load();
            this.sincronizarCobranza();
        });
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

        const filasPreview = datos.filas.map(f => `
            <tr>
                <td>${f.producto}</td>
                <td>${f.cantidad}</td>
                <td>${Utils.formatCurrency(f.precioUnitario)}</td>
                <td>${Utils.formatCurrency(f.total)}</td>
            </tr>
        `).join('');

        const saveLabel = 'Enviar PDF';

        const content = `
            <div class="form-group">
                <label>Cliente</label>
                <p class="modal-static-value">${datos.clienteNombre || '-'}</p>
                <small id="modal-precio-cliente-hint" class="modal-hint">${sinTelefono
                    ? 'Este cliente no tiene teléfono. Configuralo en Clientes.'
                    : (cliente.telefono || '')}</small>
            </div>
            <div class="form-group">
                <label>PDF que se envía</label>
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
            <p class="modal-hint">Se arma un PDF con esta lista y se abre WhatsApp para enviarlo. En el celular podés compartirlo directo. En la computadora se descarga el archivo para que lo adjuntes en el chat.</p>
        `;

        Utils.showModal('Enviar PDF al cliente', content, async () => {
            await this.ejecutarEnvioPdfWhatsApp(cliente, datos);
        }, saveLabel);

        const saveBtn = document.getElementById('modal-save');
        if (saveBtn) saveBtn.disabled = sinTelefono;
    },

    async _cargarJsPdf() {
        if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('No se pudo cargar el generador de PDF'));
            document.head.appendChild(script);
        });
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('No se pudo cargar el generador de PDF');
        }
        return window.jspdf.jsPDF;
    },

    async _construirPdfPrecios(datos) {
        const JsPDF = await this._cargarJsPdf();
        const doc = new JsPDF({ unit: 'mm', format: 'a4' });
        const extra = Utils.parsePrice(this.comisionPorUnidad) || 0;
        const fecha = DiaOperativo.formatFechaLabel(AppState.currentDate);
        doc.setFontSize(16);
        doc.text('Luciano Cargas', 14, 18);
        doc.setFontSize(12);
        doc.text('Lista de precios', 14, 26);
        doc.setFontSize(11);
        doc.text(String(datos.clienteNombre || ''), 14, 34);
        doc.setFontSize(10);
        doc.text(String(fecha || ''), 14, 40);
        let y = 50;
        doc.text('Cant.', 14, y);
        doc.text('Producto', 32, y);
        doc.text('Precio', 130, y);
        doc.text('Total', 165, y);
        y += 6;
        (datos.filas || []).forEach(fila => {
            if (y > 275) {
                doc.addPage();
                y = 20;
            }
            const unitario = (parseFloat(fila.precioUnitario) || 0) + extra;
            const subtotal = unitario * (parseFloat(fila.cantidad) || 0);
            doc.text(String(fila.cantidad ?? ''), 14, y);
            doc.text(String(fila.producto || '').slice(0, 42), 32, y);
            doc.text(Utils.formatCurrency(unitario), 130, y);
            doc.text(Utils.formatCurrency(subtotal), 165, y);
            y += 7;
        });
        doc.setFontSize(12);
        doc.text('Total a pagar: ' + Utils.formatCurrency(datos.saldoTotal), 14, Math.min(y + 8, 285));
        return doc;
    },

    async ejecutarEnvioPdfWhatsApp(cliente, datos) {
        try {
            PrecioClienteService.validarEnvio(cliente, datos);
            const doc = await this._construirPdfPrecios(datos);
            const nombre = `precios-${String(datos.clienteNombre || 'cliente').replace(/[^\w\-]+/g, '-')}.pdf`;
            const blob = doc.output('blob');
            const archivo = new File([blob], nombre, { type: 'application/pdf' });

            if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
                await navigator.share({
                    files: [archivo],
                    title: 'Lista de precios',
                    text: `Lista de precios de ${datos.clienteNombre || 'cliente'}`
                });
                Utils.showSuccess(`PDF listo para enviar a ${cliente.nombre}. Elegí WhatsApp.`);
                return;
            }

            doc.save(nombre);
            WhatsAppService.openChat(cliente.telefono, 'Te envío la lista de precios en el PDF.');
            Utils.showSuccess(`Se descargó el PDF. Adjuntalo en el chat de ${cliente.nombre}.`);
        } catch (error) {
            if (error && error.name === 'AbortError') return;
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

        const stockBajo = Stock._filas(stock).filter(s => (parseFloat(s.stock_actual) || 0) <= (parseFloat(s.minimo) || 10));
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
                ? `${stockBajo.length} producto${stockBajo.length === 1 ? '' : 's'} debajo del mínimo.`
                : 'Ningún producto está debajo del mínimo.')
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

const MediosPago = {
    deCliente: [
        ['efectivo', 'Efectivo'],
        ['transferencia', 'Transferencia'],
        ['cheque', 'Cheque'],
        ['tarjeta', 'Tarjeta de crédito']
    ],
    deProveedor: [
        ['efectivo', 'Efectivo'],
        ['transferencia', 'Transferencia']
    ],

    vacio() {
        return { efectivo: 0, transferencia: 0, cheque: 0, tarjeta: 0 };
    },

    parse(valor) {
        const medios = this.vacio();
        let raw = valor;
        if (typeof raw === 'string' && raw.trim()) {
            try { raw = JSON.parse(raw); } catch (error) { raw = null; }
        }
        if (!raw || typeof raw !== 'object') return medios;
        Object.keys(medios).forEach(id => {
            medios[id] = Utils.parsePrice(raw[id]) || 0;
        });
        return medios;
    },

    total(medios) {
        return Object.keys(this.vacio()).reduce((sum, id) => sum + (parseFloat(medios?.[id]) || 0), 0);
    },

    sumar(a, b) {
        const base = this.parse(a);
        const extra = this.parse(b);
        Object.keys(base).forEach(id => {
            base[id] = Math.round((base[id] + extra[id]) * 100) / 100;
        });
        return base;
    },

    texto(medios) {
        const datos = this.parse(medios);
        const partes = this.deCliente
            .filter(([id]) => datos[id] > 0)
            .map(([id, label]) => `${label} ${Utils.formatCurrency(datos[id])}`);
        return partes.length ? partes.join(' · ') : '—';
    },

    html(tipos, valores) {
        const datos = this.parse(valores);
        const campos = tipos.map(([id, label]) => `
            <div class="form-group medios-campo">
                <label for="medio-${id}">${label}</label>
                <input type="text" id="medio-${id}" class="form-control medio-monto" data-medio="${id}" data-price-input="true" value="${datos[id] > 0 ? Utils.formatPrice(datos[id]) : ''}" placeholder="0" inputmode="numeric">
            </div>
        `).join('');
        return `
            <div class="medios-pago">
                <div class="medios-grid">${campos}</div>
                <div class="pago-chips">
                    <button type="button" class="pago-chip" id="medios-chip-efectivo">Todo en efectivo</button>
                </div>
                <div class="medios-resumen">
                    <p>Ahora: <strong id="medios-suma">$ 0</strong></p>
                    <p id="medios-resto-linea">Queda adeudado: <strong id="medios-resto">$ 0</strong></p>
                </div>
                <p class="pago-preview" id="medios-aviso" hidden></p>
            </div>
        `;
    },

    leer() {
        const medios = this.vacio();
        document.querySelectorAll('.medio-monto').forEach(input => {
            const id = input.dataset.medio;
            if (Object.prototype.hasOwnProperty.call(medios, id)) {
                medios[id] = Utils.parsePrice(input.value) || 0;
            }
        });
        const lista = Object.keys(medios)
            .filter(id => medios[id] > 0)
            .map(id => ({ metodo: id, monto: medios[id] }));
        return { medios, lista, total: this.total(medios) };
    },

    poner(valores) {
        const datos = this.parse(valores);
        document.querySelectorAll('.medio-monto').forEach(input => {
            const id = input.dataset.medio;
            const monto = datos[id] || 0;
            input.value = monto > 0 ? Utils.formatPrice(monto) : '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    },

    enganchar(saldo, opciones = {}) {
        const tope = opciones.tope !== false;
        const linea = document.getElementById('medios-resto-linea');
        if (linea && opciones.ocultarAdeudado) linea.hidden = true;
        const actualizar = () => {
            const { total } = this.leer();
            const suma = document.getElementById('medios-suma');
            const resto = document.getElementById('medios-resto');
            const aviso = document.getElementById('medios-aviso');
            if (suma) suma.textContent = Utils.formatCurrency(total);
            const queda = Math.max(0, (parseFloat(saldo) || 0) - total);
            if (resto) resto.textContent = Utils.formatCurrency(queda);
            if (!aviso) return;
            if (tope && total > saldo + 0.01) {
                aviso.hidden = false;
                aviso.textContent = 'La suma supera lo adeudado (' + Utils.formatCurrency(saldo) + ').';
                return;
            }
            if (total > 0 && !opciones.ocultarAdeudado && queda > 0.01) {
                aviso.hidden = false;
                aviso.textContent = 'Queda un saldo adeudado de ' + Utils.formatCurrency(queda) + '.';
                return;
            }
            if (total > 0 && !opciones.ocultarAdeudado) {
                aviso.hidden = false;
                aviso.textContent = 'No queda saldo adeudado.';
                return;
            }
            aviso.hidden = true;
            aviso.textContent = '';
        };
        document.querySelectorAll('.medio-monto').forEach(input => {
            input.addEventListener('input', actualizar);
            input.addEventListener('change', actualizar);
        });
        document.getElementById('medios-chip-efectivo')?.addEventListener('click', () => {
            const lleno = this.vacio();
            if (saldo > 0) lleno.efectivo = saldo;
            this.poner(lleno);
            actualizar();
        });
        actualizar();
        return actualizar;
    }
};

// Cobranzas
const SaldoCliente = {
    abrir(clienteId) {
        const cliente = this._cliente(clienteId);
        const filas = this.filas(clienteId);
        if (!filas.length) {
            Utils.showError('Este cliente no tiene saldo pendiente.');
            return;
        }
        const nombre = cliente.nombre || 'Cliente';
        const sinTelefono = !cliente.telefono || !String(cliente.telefono).trim();
        const content = `
            <p class="modal-hint">${this._esc(nombre)}. La fila amarilla es cada carga. Si ya pagó una parte, abajo va el faltante. Al final está el total.</p>
            ${this._tabla(filas)}
            <p class="modal-hint">${sinTelefono
                ? 'Este cliente no tiene teléfono. El PDF se descarga igual.'
                : 'Se arma un PDF y se abre WhatsApp. En la computadora tenés que adjuntar el archivo que se descarga.'}</p>
        `;
        Utils.showModal('Saldo de ' + nombre, content, async () => {
            await this._enviar(cliente, filas);
        }, sinTelefono ? 'Descargar PDF' : 'Enviar PDF');
    },

    filas(clienteId) {
        const cargas = this._cargas(clienteId);
        const filas = [];
        cargas.forEach(carga => {
            filas.push({ tipo: 'carga', texto: this._fecha(carga.fecha), monto: carga.total });
            this._pagos(carga).forEach(pago => {
                filas.push({ tipo: 'pago', texto: pago.texto, monto: pago.monto });
            });
            if (carga.pagado > 0.01) {
                filas.push({ tipo: 'faltante', texto: 'Faltante', monto: carga.saldo });
            }
        });
        if (!filas.length) return [];
        const total = cargas.reduce((sum, carga) => sum + carga.saldo, 0);
        filas.push({ tipo: 'total', texto: 'Total saldo', monto: total });
        return filas;
    },

    _cargas(clienteId) {
        const id = String(clienteId);
        const porFecha = new Map();
        this._cobranzas().forEach(cobranza => {
            if (String(cobranza.cliente_id) !== id) return;
            const saldo = Utils.getCobranzaSaldo(cobranza);
            if (saldo <= 0.01) return;
            const fecha = Utils.fechaIso(cobranza.fecha);
            if (!fecha) return;
            const total = Utils.parsePrice(cobranza.total) || saldo;
            const pagado = Utils.parsePrice(cobranza.pagado) || Math.max(0, total - saldo);
            porFecha.set(fecha, {
                fecha,
                total,
                pagado,
                saldo,
                medios: cobranza.medios
            });
        });
        const hoy = this._cargaDeHoy(id, porFecha);
        if (hoy) porFecha.set(hoy.fecha, hoy);
        return [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
    },

    _cobranzas() {
        const cache = CacheManager.peek('cobranzas:all:all');
        const lista = Array.isArray(cache) ? cache.slice() : [];
        (AppState.cobranzas || []).forEach(cobranza => {
            const index = lista.findIndex(item => String(item.id) === String(cobranza.id));
            if (index >= 0) lista[index] = { ...lista[index], ...cobranza };
            else lista.push(cobranza);
        });
        return lista;
    },

    _cargaDeHoy(clienteId, porFecha) {
        const fecha = AppState.currentDate;
        if (!fecha || porFecha.has(fecha)) return null;
        if (typeof CobranzasHoy === 'undefined' || !CobranzasHoy._desdePrecios) return null;
        const totales = CobranzasHoy._desdePrecios(fecha);
        if (!Array.isArray(totales)) return null;
        const fila = totales.find(item => String(item.cliente_id) === String(clienteId));
        if (!fila) return null;
        const saldo = Utils.parsePrice(fila.saldo) || 0;
        if (saldo <= 0.01) return null;
        const total = Utils.parsePrice(fila.total) || saldo;
        return {
            fecha,
            total,
            pagado: Utils.parsePrice(fila.pagado) || Math.max(0, total - saldo),
            saldo,
            medios: fila.medios
        };
    },

    _pagos(carga) {
        if (carga.pagado <= 0.01) return [];
        const medios = MediosPago.parse(carga.medios);
        const lineas = MediosPago.deCliente
            .filter(([medio]) => medios[medio] > 0.01)
            .map(([medio, etiqueta]) => ({ texto: etiqueta, monto: medios[medio] }));
        const suma = lineas.reduce((sum, linea) => sum + linea.monto, 0);
        if (!lineas.length || Math.abs(suma - carga.pagado) > 1) {
            return [{ texto: 'Cobrado', monto: carga.pagado }];
        }
        return lineas;
    },

    _cliente(clienteId) {
        const cobranza = this._cobranzas().find(item => String(item.cliente_id) === String(clienteId));
        if (typeof Cobranzas !== 'undefined' && Cobranzas._clienteDe) {
            return Cobranzas._clienteDe(cobranza || { cliente_id: clienteId });
        }
        const cliente = (AppState.clientes || []).find(item => String(item.id) === String(clienteId));
        return cliente || { id: clienteId, nombre: 'Cliente', telefono: '' };
    },

    _tabla(filas) {
        return `<table class="saldo-tabla">${filas.map(fila => `
            <tr class="saldo-${fila.tipo}">
                <td>${this._esc(fila.texto)}</td>
                <td>${this._pesos(fila.monto)}</td>
            </tr>
        `).join('')}</table>`;
    },

    _fecha(iso) {
        const fecha = Utils.fechaIso(iso);
        if (!fecha) return '';
        const [anio, mes, dia] = fecha.split('-');
        return `${Number(dia)}/${Number(mes)}/${anio}`;
    },

    _pesos(valor) {
        const monto = Math.round(Utils.parsePrice(valor) || 0);
        const texto = new Intl.NumberFormat('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(monto);
        return `$ ${texto}`;
    },

    _esc(valor) {
        return String(valor ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    },

    async _enviar(cliente, filas) {
        const nombre = cliente.nombre || 'Cliente';
        const doc = await this._pdf(nombre, filas);
        const archivoNombre = `saldo-${nombre.replace(/[^\w\-]+/g, '-')}.pdf`;
        const blob = doc.output('blob');
        const archivo = new File([blob], archivoNombre, { type: 'application/pdf' });
        const texto = `Hola ${nombre}, te paso el saldo por carga y el total. Va en el PDF.`;
        try {
            if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
                await navigator.share({ files: [archivo], title: 'Saldo', text: texto });
                Utils.avisar('PDF listo. Elegí WhatsApp para enviarlo.');
                return;
            }
        } catch (error) {
            if (error && error.name === 'AbortError') return;
        }
        doc.save(archivoNombre);
        if (cliente.telefono && String(cliente.telefono).trim()) {
            WhatsAppService.openChat(cliente.telefono, texto);
            Utils.avisar(`Se descargó el PDF. Adjuntalo en el chat de ${nombre}.`);
            return;
        }
        Utils.avisar('Se descargó el PDF del saldo.');
    },

    async _pdf(nombre, filas) {
        const JsPDF = await Precios._cargarJsPdf();
        const doc = new JsPDF({ unit: 'mm', format: 'a4' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(String(nombre), 14, 16);
        doc.setFontSize(11);
        doc.text('Luciano Cargas', 14, 23);
        let y = 32;
        const x = 14;
        const anchoTexto = 112;
        const anchoMonto = 70;
        const alto = 11;
        filas.forEach(fila => {
            if (y > 275) {
                doc.addPage();
                y = 16;
            }
            if (fila.tipo === 'carga') doc.setFillColor(255, 242, 0);
            else doc.setFillColor(255, 255, 255);
            doc.setDrawColor(0);
            doc.rect(x, y, anchoTexto, alto, 'FD');
            doc.rect(x + anchoTexto, y, anchoMonto, alto, 'FD');
            doc.setTextColor(0);
            doc.setFontSize(fila.tipo === 'pago' ? 12 : 14);
            doc.text(String(fila.texto), x + 3, y + 7.5);
            doc.text(this._pesos(fila.monto), x + anchoTexto + anchoMonto - 3, y + 7.5, { align: 'right' });
            y += alto;
        });
        return doc;
    }
};

const Cobranzas = {
    async load() {
        const tbody = document.getElementById('cobranzas-tbody');
        if (!tbody) return;

        const cached = CacheManager.peek('cobranzas:all:all');
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
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #666;">' +
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
                <td data-label="Cómo pagó" class="medios-texto">${MediosPago.texto(cobranza.medios)}</td>
                <td data-label="Fecha">${Utils.formatDate(cobranza.fecha)}</td>
                <td data-label="Estado"><span class="status-badge status-pendiente">Pendiente</span></td>
                <td data-label="Acciones">
                    <div class="pagos-acciones">
                        <button class="btn btn-primary btn-sm" type="button" onclick="Cobranzas.cobrar('${cobranza.id}')">Cobrar</button>
                        <button class="btn btn-secondary btn-sm" type="button" onclick="SaldoCliente.abrir('${cliente.id}')">Enviar saldo</button>
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

        const inicial = MediosPago.vacio();
        inicial.efectivo = saldo;
        const content = `
            <div class="form-group">
                <label for="modal-cobro-deuda">Te debe</label>
                <input type="text" id="modal-cobro-deuda" class="form-control" value="${Utils.formatCurrency(saldo)}" readonly tabindex="-1">
            </div>
            <p class="modal-hint">Repartí el pago. Lo que no cargues queda adeudado.</p>
            ${MediosPago.html(MediosPago.deCliente, inicial)}
        `;

        Utils.showModal('Cobrar a ' + nombre, content, async () => {
            const leido = MediosPago.leer();
            if (leido.total <= 0) {
                Utils.showError('Poné cuánto te paga.');
                throw new Error('Monto inválido');
            }
            if (leido.total > saldo + 0.01) {
                Utils.showError('La suma supera lo que te debe (' + Utils.formatCurrency(saldo) + ').');
                throw new Error('Monto mayor al saldo');
            }
            const saldoAnterior = cobranza.saldo;
            const pagadoAnterior = cobranza.pagado;
            const estadoAnterior = cobranza.estado;
            const mediosAnteriores = MediosPago.parse(cobranza.medios);
            cobranza.medios = MediosPago.sumar(mediosAnteriores, leido.medios);
            cobranza.pagado = (Utils.parsePrice(cobranza.pagado) || 0) + leido.total;
            cobranza.saldo = Math.max(0, saldo - leido.total);
            cobranza.estado = cobranza.saldo > 0.01 ? 'pendiente' : 'pagado';
            CacheManager.set('cobranzas:all:all', AppState.cobranzas);
            this.render();
            Utils.avisar(leido.total >= saldo
                ? `Cobro de ${Utils.formatCurrency(leido.total)} registrado`
                : `Cobro registrado. Queda ${Utils.formatCurrency(cobranza.saldo)}`);

            this._ultimoCobro = {
                cobranzaId: cobranza.id,
                clienteId: cliente.id,
                monto: leido.total,
                medios: leido.medios,
                saldoRestante: cobranza.saldo,
                fecha: cobranza.fecha
            };
            if (cliente.telefono && String(cliente.telefono).trim()) {
                this.programarAvisoWhatsApp(cliente, this._ultimoCobro, nombre);
            }

            Utils.enSegundoPlano(() => API.registrarCobro({
                cobranza_id: cobranza.id,
                medios: leido.lista,
                fecha: cobranza.fecha || AppState.currentDate
            }), () => {
                cobranza.saldo = saldoAnterior;
                cobranza.pagado = pagadoAnterior;
                cobranza.estado = estadoAnterior;
                cobranza.medios = mediosAnteriores;
                CacheManager.set('cobranzas:all:all', AppState.cobranzas);
                this.render();
                Utils.showError('No se pudo registrar el cobro. Publicá el script si todavía no lo hiciste.');
            });
        }, 'Cobrar');

        MediosPago.enganchar(saldo);
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
            const detalle = cobro.medios ? MediosPago.texto(cobro.medios) : this.metodoLabel(cobro.metodo);
            let mensaje = `Hola ${nombre}, registramos tu pago de ${Utils.formatCurrency(cobro.monto)} (${detalle}) del ${fechaLabel}.\n\n`;
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
        const metodo = cobro?.medios ? MediosPago.texto(cobro.medios) : (cobro?.metodo ? this.metodoLabel(cobro.metodo) : '—');
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
            return { ...item, total, pagado, saldo, estado, medios: MediosPago.parse(item.medios) };
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
        const preciosDia = CacheManager.get(`precios:${AppState.currentDate}`);
        if (DiaOperativo.diaSinPedidos(AppState.currentDate) || (Array.isArray(preciosDia) && preciosDia.length === 0)) {
            this._lastTotales = [];
            this.render([]);
            return;
        }

        const locales = this._desdePrecios(AppState.currentDate);
        if (locales) {
            this._lastTotales = this.normalizarTotales(locales);
            this._pagadoConocido = true;
            this.render(this._lastTotales);
        } else if (this._lastTotales.length && this._pagadoConocido !== false) {
            this.render(this._lastTotales);
        } else {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#666;">Buscando cobros…</td></tr>';
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

    _desdePrecios(fecha) {
        const precios = CacheManager.peek(`precios:${fecha}`)
            || (AppState.fechaCargada === fecha ? AppState.precios : null);
        if (!Array.isArray(precios)) return null;
        const cobranzas = (CacheManager.peek('cobranzas:all:all') || AppState.cobranzas || [])
            .filter(cobranza => Utils.fechaIso(cobranza.fecha) === fecha);
        const grupos = new Map();
        precios.forEach(precio => {
            const id = String(precio.cliente_id || '');
            if (!id) return;
            const cantidad = parseFloat(precio.cantidad) || 0;
            const unit = Utils.parsePrice(precio.precio_cliente);
            const comision = Utils.parsePrice(precio.comision_unitaria);
            const subtotal = Math.round(cantidad * unit) + Math.round(cantidad * comision);
            if (!grupos.has(id)) {
                grupos.set(id, {
                    cliente_id: precio.cliente_id,
                    cliente_nombre: precio.cliente_nombre || Utils.nombreCatalogo(precio, 'cliente'),
                    total: 0,
                    items: []
                });
            }
            const grupo = grupos.get(id);
            grupo.total += subtotal;
            grupo.items.push({
                producto_nombre: precio.producto_nombre || '',
                cantidad,
                precio_cliente: unit,
                subtotal
            });
        });
        return [...grupos.values()].map(grupo => {
            const cobranza = cobranzas.find(item => String(item.cliente_id) === String(grupo.cliente_id));
            const pagado = cobranza ? Utils.parsePrice(cobranza.pagado) : 0;
            const saldo = Math.max(0, grupo.total - pagado);
            let estado = 'sin_cobrar';
            if (pagado > 0 && saldo <= 0) estado = 'pagado';
            else if (pagado > 0) estado = 'parcial';
            return {
                ...grupo,
                pagado,
                saldo,
                estado,
                cobranza_id: cobranza ? cobranza.id : null,
                medios: cobranza ? cobranza.medios : null
            };
        });
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
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#666;">' +
                'Este día está cerrado.<br>' +
                '<small style="color:#999">Lo que quedó sin cobrar está en Cobranzas a clientes (pendientes).</small>' +
                '</td></tr>';
            return;
        }
        if (hint) {
            hint.textContent = 'Cobrás en efectivo, transferencia, cheque o tarjeta. Lo que no pague queda adeudado. Al cerrar, ese saldo pasa a Cobranzas a clientes (pendientes).';
        }

        if (totales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#666;">' +
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

            let estadoBadge;
            if (pagadoTotal) {
                estadoBadge = '<span class="status-badge status-activo">Pagado</span>';
            } else if (pagado > 0) {
                estadoBadge = '<span class="status-badge status-pendiente">Parcial</span>';
            } else {
                estadoBadge = '<span class="status-badge">Sin cobrar</span>';
            }

            tr.innerHTML = `
                <td>${Utils.nombreCatalogo(t, 'cliente')}</td>
                <td>${Utils.formatCurrency(total)}</td>
                <td>${pagado > 0 ? Utils.formatCurrency(pagado) : '—'}</td>
                <td class="medios-texto">${MediosPago.texto(t.medios)}</td>
                <td style="${saldo > 0 ? 'color:#dc3545;font-weight:bold' : 'color:#28a745'}">${Utils.formatCurrency(saldo)}</td>
                <td>${estadoBadge}</td>
                <td>
                    <button class="btn btn-secondary btn-sm" type="button" onclick="CobranzasHoy.abrirAcciones('${t.cliente_id}')">Acciones</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    _fila(clienteId) {
        return (this._lastTotales || []).find(t => String(t.cliente_id) === String(clienteId)) || null;
    },

    _cliente(clienteId) {
        return (AppState.clientes || []).find(c => String(c.id) === String(clienteId)) || null;
    },

    abrirAcciones(clienteId) {
        const fila = this._fila(clienteId);
        if (!fila) {
            Utils.showError('No encontré esa cobranza');
            return;
        }

        const nombre = Utils.nombreCatalogo(fila, 'cliente');
        const total = parseFloat(fila.total) || 0;
        const pagado = parseFloat(fila.pagado) || 0;
        const saldo = parseFloat(fila.saldo) || 0;
        const cliente = this._cliente(clienteId);
        const telefono = cliente?.telefono ? String(cliente.telefono).trim() : '';
        const estado = saldo <= 0
            ? '<span class="status-badge status-activo">Pagado</span>'
            : (pagado > 0
                ? '<span class="status-badge status-pendiente">Parcial</span>'
                : '<span class="status-badge">Sin cobrar</span>');

        const botones = [];
        if (saldo > 0) {
            botones.push(`<button type="button" class="btn btn-primary" onclick="CobranzasHoy.cobrar('${clienteId}', ${total}, ${saldo})">Cobrar</button>`);
        }
        botones.push(`<button type="button" class="btn btn-secondary" onclick="CobranzasHoy.verDetalle('${clienteId}')">Ver detalle</button>`);
        botones.push(`<button type="button" class="btn btn-secondary" onclick="SaldoCliente.abrir('${clienteId}')">Enviar saldo</button>`);
        botones.push(`<button type="button" class="btn btn-whatsapp" onclick="CobranzasHoy.avisarWhatsApp('${clienteId}')">${telefono ? 'Avisar por WhatsApp' : 'WhatsApp (falta teléfono)'}</button>`);
        if (pagado > 0) {
            botones.push(`<button type="button" class="btn btn-secondary" onclick="CobranzasHoy.editarCobro('${clienteId}')">Editar lo cobrado</button>`);
            botones.push(`<button type="button" class="btn btn-danger" onclick="CobranzasHoy.anularCobro('${clienteId}')">Eliminar cobro</button>`);
        }

        const content = `
            <div class="pedido-acciones-resumen">
                <div class="pedido-acciones-resumen-top">
                    <strong>${nombre}</strong>
                    <div class="pedido-acciones-badges">${estado}</div>
                </div>
                <p>Total ${Utils.formatCurrency(total)} · Cobrado ${Utils.formatCurrency(pagado)}</p>
                <p class="pedido-acciones-proveedor">Adeudado: ${Utils.formatCurrency(saldo)}</p>
                <p class="pedido-acciones-proveedor">${MediosPago.texto(fila.medios)}</p>
            </div>
            <div class="pedido-acciones-lista">
                ${botones.join('')}
            </div>
        `;

        Utils.showModal('Acciones del cobro', content, null);
        const cancelBtn = document.getElementById('modal-cancel');
        if (cancelBtn) cancelBtn.textContent = 'Cerrar';
    },

    verDetalle(clienteId) {
        const fila = this._fila(clienteId);
        if (!fila) {
            Utils.showError('No encontré esa cobranza');
            return;
        }
        const nombre = Utils.nombreCatalogo(fila, 'cliente');
        const items = Array.isArray(fila.items) ? fila.items : [];
        const filas = items.length
            ? items.map(item => `
                <tr>
                    <td>${item.producto_nombre || 'Producto'}</td>
                    <td>${item.cantidad ?? ''}</td>
                    <td>${Utils.formatCurrency(item.precio_cliente || 0)}</td>
                    <td>${Utils.formatCurrency(item.subtotal || 0)}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="4">No hay detalle de productos cargado.</td></tr>';
        const content = `
            <p class="modal-hint">${nombre}</p>
            <div class="modal-pedido-preview-box">
                <table class="modal-pedido-detalle-table">
                    <thead>
                        <tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Total</th></tr>
                    </thead>
                    <tbody>${filas}</tbody>
                </table>
            </div>
            <p>Total del día: <strong>${Utils.formatCurrency(fila.total || 0)}</strong></p>
            <p>Cómo cobró: ${MediosPago.texto(fila.medios)}</p>
            <p>Adeudado: <strong>${Utils.formatCurrency(fila.saldo || 0)}</strong></p>
        `;
        Utils.showModal('Detalle del cobro', content, null);
        const cancelBtn = document.getElementById('modal-cancel');
        if (cancelBtn) cancelBtn.textContent = 'Cerrar';
    },

    avisarWhatsApp(clienteId) {
        const fila = this._fila(clienteId);
        const cliente = this._cliente(clienteId);
        if (!fila) {
            Utils.showError('No encontré esa cobranza');
            return;
        }
        const telefono = cliente?.telefono ? String(cliente.telefono).trim() : '';
        if (!telefono) {
            Utils.showError('Este cliente no tiene teléfono. Cargalo en Clientes.');
            return;
        }
        const nombre = Utils.nombreCatalogo(fila, 'cliente');
        const fecha = DiaOperativo.formatFechaLabel(AppState.currentDate);
        const lineas = (fila.items || []).slice(0, 12).map(item =>
            `${item.producto_nombre || 'Producto'} x ${item.cantidad ?? ''} — ${Utils.formatCurrency(item.subtotal || 0)}`
        );
        const mensaje = [
            `Hola ${nombre}, te paso la cuenta del ${fecha}.`,
            lineas.length ? lineas.join('\n') : '',
            `Total: ${Utils.formatCurrency(fila.total || 0)}`,
            `Cobrado: ${Utils.formatCurrency(fila.pagado || 0)}`,
            `Adeudado: ${Utils.formatCurrency(fila.saldo || 0)}`,
            MediosPago.texto(fila.medios) !== '—' ? MediosPago.texto(fila.medios) : ''
        ].filter(Boolean).join('\n');
        document.getElementById('modal-overlay')?.classList.remove('active');
        WhatsAppService.openChat(telefono, mensaje);
        Utils.avisar(`WhatsApp abierto para ${nombre}`);
    },

    editarCobro(clienteId) {
        const fila = this._fila(clienteId);
        if (!fila) {
            Utils.showError('No encontré esa cobranza');
            return;
        }
        const total = parseFloat(fila.total) || 0;
        const pagado = parseFloat(fila.pagado) || 0;
        const mediosAntes = MediosPago.parse(fila.medios);
        const inicial = MediosPago.total(mediosAntes) > 0 ? mediosAntes : Object.assign(MediosPago.vacio(), { efectivo: pagado });
        const content = `
            <p class="modal-hint">Repartí lo que ya te pagó. El máximo es ${Utils.formatCurrency(total)}. Lo que no cargues queda adeudado.</p>
            ${MediosPago.html(MediosPago.deCliente, inicial)}
        `;
        Utils.showModal('Editar lo cobrado', content, async () => {
            const leido = MediosPago.leer();
            if (leido.total > total + 0.01) {
                Utils.showError('La suma supera el total del día (' + Utils.formatCurrency(total) + ').');
                throw new Error('Monto mayor al total');
            }
            const mediosPrevios = MediosPago.parse(fila.medios);
            const pagadoPrevio = parseFloat(fila.pagado) || 0;
            this._aplicarMediosLocal(clienteId, leido.medios);
            Utils.avisar('Cobro actualizado');
            Utils.enSegundoPlano(() => API.ajustarCobroClienteHoy({
                fecha: AppState.currentDate,
                cliente_id: clienteId,
                medios: leido.medios
            }), () => {
                this._aplicarMediosLocal(clienteId, MediosPago.total(mediosPrevios) > 0 ? mediosPrevios : Object.assign(MediosPago.vacio(), { efectivo: pagadoPrevio }));
                Utils.showError('No se pudo editar el cobro. Publicá el script si todavía no lo hiciste.');
            });
        }, 'Guardar');
        MediosPago.enganchar(total);
    },

    async anularCobro(clienteId) {
        const fila = this._fila(clienteId);
        if (!fila) {
            Utils.showError('No encontré esa cobranza');
            return;
        }
        document.getElementById('modal-overlay')?.classList.remove('active');
        const nombre = Utils.nombreCatalogo(fila, 'cliente');
        const ok = await Utils.showConfirm(`¿Eliminar el cobro de ${nombre}? Queda de nuevo el saldo completo. El cliente sigue en la lista.`);
        if (!ok) return;
        const mediosPrevios = MediosPago.parse(fila.medios);
        this._aplicarMediosLocal(clienteId, MediosPago.vacio());
        Utils.avisar('Cobro eliminado');
        Utils.enSegundoPlano(() => API.ajustarCobroClienteHoy({
            fecha: AppState.currentDate,
            cliente_id: clienteId,
            pagado: 0
        }), () => {
            this._aplicarMediosLocal(clienteId, mediosPrevios);
            Utils.showError('No se pudo eliminar el cobro. Publicá el script si todavía no lo hiciste.');
        });
    },

    _aplicarMediosLocal(clienteId, medios) {
        const fila = this._fila(clienteId);
        if (!fila) return;
        const total = parseFloat(fila.total) || 0;
        fila.medios = MediosPago.parse(medios);
        const pagado = MediosPago.total(fila.medios);
        fila.pagado = pagado;
        fila.saldo = Math.max(0, total - pagado);
        fila.estado = pagado <= 0 ? 'sin_cobrar' : (fila.saldo <= 0.01 ? 'pagado' : 'parcial');
        if (fila.saldo <= 0.01) this._cobrados.add(String(clienteId));
        else this._cobrados.delete(String(clienteId));
        this.render(this._lastTotales);
    },

    async cobrar(clienteId, total, saldoActual) {
        const inicial = MediosPago.vacio();
        inicial.efectivo = saldoActual > 0 ? saldoActual : 0;
        const content = `
            <p class="modal-hint">Total del día ${Utils.formatCurrency(total)}. Repartí el cobro. Lo que no cargues queda adeudado.</p>
            ${MediosPago.html(MediosPago.deCliente, inicial)}
        `;

        Utils.showModal('Registrar cobro', content, async () => {
            const leido = MediosPago.leer();
            if (leido.total <= 0) {
                Utils.showError('Poné cuánto te paga.');
                throw new Error('Monto inválido');
            }
            if (leido.total > saldoActual + 0.01) {
                Utils.showError('La suma supera el saldo pendiente (' + Utils.formatCurrency(saldoActual) + ').');
                throw new Error('Monto mayor al saldo');
            }
            const fila = this._fila(clienteId);
            const mediosPrevios = MediosPago.parse(fila?.medios);
            this._aplicarMediosLocal(clienteId, MediosPago.sumar(mediosPrevios, leido.medios));
            Utils.avisar(leido.total >= saldoActual
                ? `Cobro de ${Utils.formatCurrency(leido.total)} registrado`
                : `Cobro registrado. Queda ${Utils.formatCurrency(Math.max(0, saldoActual - leido.total))}`);
            Utils.enSegundoPlano(() => API.cobrarClienteHoy({
                fecha: AppState.currentDate,
                cliente_id: clienteId,
                medios: leido.lista
            }), () => {
                this._aplicarMediosLocal(clienteId, mediosPrevios);
                Utils.showError('No se pudo registrar el cobro. Publicá el script si todavía no lo hiciste.');
            });
        }, 'Cobrar');
        MediosPago.enganchar(saldoActual);
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
        if (!AppState.proveedores.length) {
            const cacheProv = CacheManager.get('proveedores');
            if (Array.isArray(cacheProv)) AppState.proveedores = cacheProv;
        }
        const recepcionCache = CacheManager.get(`recepcion:${AppState.currentDate}`);
        if (Array.isArray(recepcionCache)) this._aplicarRecepcionHoy(recepcionCache);
        else if (AppState.recepcion) this._aplicarRecepcionHoy(AppState.recepcion);

        const sinPedidos = this.vista !== 'pendientes' && DiaOperativo.diaSinPedidos(AppState.currentDate);
        this.render(AppState.proveedores);
        if (sinPedidos) return;
        if (this.vista === 'pendientes' && AppState.proveedores.length) return;
        if (this.vista !== 'pendientes' && Array.isArray(recepcionCache) && AppState.proveedores.length) return;

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
            Utils.hideTableLoader(tbody);
            if (!AppState.proveedores.length && AppState.currentPage === 'pagos') {
                Utils.showError('Error al cargar los proveedores. Intente nuevamente.');
            }
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
                ? 'Acá queda lo que todavía le debés. Podés pagar una parte en efectivo y otra en transferencia, y dejar el resto adeudado.'
                : (diaCerrado
                    ? 'Este día está cerrado. Lo que quedó por pagar está en Pagos a proveedores (pendientes).'
                    : 'Pagá una parte en efectivo y otra en transferencia. Lo que no pagues queda adeudado. Al cerrar, ese saldo pasa a Pagos a proveedores (pendientes).');
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
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#666;">${vacio}</td></tr>`;
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
            const btnPagar = puedePagar
                ? `<button class="btn btn-primary btn-sm" type="button" onclick="Pagos.registrar('${proveedor.id}')">Pagar</button>`
                : '';
            tr.innerHTML = `
                <td data-label="Proveedor">${proveedor.nombre || ''}</td>
                <td data-label="Le debés" style="${saldo > 0 ? 'color:#dc3545;font-weight:700;' : ''}">${Utils.formatCurrency(saldo)}</td>
                <td data-label="Cómo pagaste" class="medios-texto">${MediosPago.texto(proveedor.medios)}</td>
                <td data-label="Mercadería de hoy">${deudaHoy > 0 ? Utils.formatCurrency(deudaHoy) : '<span style="color:#aaa">—</span>'}</td>
                <td data-label="Estado"><span class="status-badge ${pendiente ? 'status-pendiente' : 'status-activo'}">${pendiente ? 'Pendiente' : 'Al día'}</span></td>
                <td data-label="Acciones">
                    <div class="pagos-acciones">
                        ${btnPagar}
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

        const inicial = MediosPago.vacio();
        if (!anticipo && saldoPendiente > 0) inicial.efectivo = saldoPendiente;
        const chipHoy = mercaderiaHoy > 0 && mercaderiaHoy < saldoPendiente
            ? `<button type="button" class="pago-chip" id="pago-chip-hoy">Lo de hoy (${Utils.formatCurrency(mercaderiaHoy)})</button>`
            : '';
        const content = `
            <div class="form-group">
                <label for="modal-pago-deuda">Le debés</label>
                <input type="text" id="modal-pago-deuda" class="form-control" value="${Utils.formatCurrency(dineroAPagar)}" readonly tabindex="-1">
            </div>
            <p class="modal-hint">Repartí el pago en efectivo y transferencia. Lo que no cargues queda adeudado.</p>
            ${MediosPago.html(MediosPago.deProveedor, inicial)}
            <div class="pago-chips">${chipHoy}</div>
        `;

        Utils.showModal('Pagar a ' + proveedorNombre, content, async () => {
            const leido = MediosPago.leer();
            if (leido.total <= 0 || !proveedorId) {
                Utils.showError('Poné cuánto le pagás.');
                throw new Error('Monto inválido');
            }
            if (!anticipo && leido.total > saldoPendiente + 0.01) {
                Utils.showError('La suma supera lo que le debés (' + Utils.formatCurrency(saldoPendiente) + ').');
                throw new Error('Monto mayor al saldo');
            }

            const saldoRestante = Math.max(0, saldoPendiente - leido.total);
            const proveedorLocal = (AppState.proveedores || []).find(p => String(p.id) === String(proveedorId));
            const saldoPrevio = proveedorLocal ? proveedorLocal.saldo : saldoPendiente;
            const mediosPrevios = MediosPago.parse(proveedorLocal?.medios);
            if (proveedorLocal) {
                proveedorLocal.saldo = saldoRestante;
                proveedorLocal.medios = MediosPago.sumar(mediosPrevios, leido.medios);
            }
            if (!anticipo && leido.total >= saldoPendiente) this._pagados.add(proveedorId);
            CacheManager.set('proveedores', AppState.proveedores);
            this.render(AppState.proveedores);
            Utils.avisar(saldoRestante > 0
                ? `Pago de ${Utils.formatCurrency(leido.total)} registrado. Queda ${Utils.formatCurrency(saldoRestante)}`
                : `Pago de ${Utils.formatCurrency(leido.total)} registrado`);

            this._ultimoPago = {
                proveedorId,
                monto: leido.total,
                medios: leido.medios,
                saldoRestante,
                anticipo
            };

            Utils.enSegundoPlano(() => API.registrarPago({
                proveedor_id: proveedorId,
                medios: leido.lista,
                fecha: AppState.currentDate,
                anticipo: anticipo,
                nota: anticipo ? 'Pago al hacer el pedido' : ''
            }), () => {
                if (proveedorLocal) {
                    proveedorLocal.saldo = saldoPrevio;
                    proveedorLocal.medios = mediosPrevios;
                }
                this._pagados.delete(proveedorId);
                CacheManager.set('proveedores', AppState.proveedores);
                this.render(AppState.proveedores);
                Utils.showError('No se pudo registrar el pago. Publicá el script si todavía no lo hiciste.');
            });
        }, 'Pagar');

        const actualizar = MediosPago.enganchar(saldoPendiente, { tope: !anticipo, ocultarAdeudado: anticipo });
        document.getElementById('pago-chip-hoy')?.addEventListener('click', () => {
            const soloHoy = MediosPago.vacio();
            soloHoy.efectivo = mercaderiaHoy;
            MediosPago.poner(soloHoy);
            actualizar();
        });
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
            const detalle = pago.medios ? MediosPago.texto(pago.medios) : this.metodoPagoLabel(pago.metodo);
            let mensaje = `Hola ${nombre}, te confirmamos el pago de ${Utils.formatCurrency(pago.monto)} (${detalle}) del ${fechaLabel}.\n\n`;
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
        const metodo = pago?.medios ? MediosPago.texto(pago.medios) : (pago?.metodo ? this.metodoPagoLabel(pago.metodo) : '—');
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
    _filas(stock) {
        const lista = Array.isArray(stock) ? stock : (AppState.stock || []);
        const porId = new Map(lista.map(item => [String(item.producto_id), item]));
        const productos = AppState.productos || [];
        const filas = productos.length
            ? productos.map(producto => {
                const item = porId.get(String(producto.id)) || {};
                return {
                    producto_id: producto.id,
                    producto_nombre: producto.nombre || item.producto_nombre || '',
                    tipo: producto.tipo || item.tipo || '',
                    unidad: producto.unidad || item.unidad || '',
                    stock_actual: parseFloat(item.stock_actual) || 0,
                    minimo: item.minimo === undefined || item.minimo === '' ? 10 : (parseFloat(item.minimo) || 0)
                };
            })
            : lista.map(item => ({
                producto_id: item.producto_id,
                producto_nombre: item.producto_nombre || '',
                tipo: item.tipo || '',
                unidad: item.unidad || '',
                stock_actual: parseFloat(item.stock_actual) || 0,
                minimo: parseFloat(item.minimo) || 10
            }));
        return filas.sort((a, b) => {
            const tipo = String(a.tipo).localeCompare(String(b.tipo), 'es');
            if (tipo) return tipo;
            return String(a.producto_nombre).localeCompare(String(b.producto_nombre), 'es');
        });
    },

    _tipo(tipo) {
        if (tipo === 'bebida') return 'Bebida';
        if (tipo === 'verdura') return 'Verdura';
        return tipo ? String(tipo) : '';
    },

    _cantidad(valor, unidad) {
        const numero = Math.round((parseFloat(valor) || 0) * 1000) / 1000;
        const texto = Number.isInteger(numero) ? String(numero) : String(numero);
        return unidad ? `${texto} ${unidad}` : texto;
    },

    async _asegurarProductos() {
        if (AppState.productos?.length) return;
        const cache = CacheManager.peek('productos');
        if (Array.isArray(cache) && cache.length) {
            AppState.productos = cache;
            return;
        }
        AppState.productos = await API.getProductos();
    },

    async load() {
        const tbody = document.getElementById('stock-tbody');
        if (!tbody) return;

        const cached = CacheManager.peek('stock');
        const hasStale = AppState.stock.length > 0 || cached;
        if (hasStale) {
            if (!AppState.stock.length && cached) AppState.stock = cached;
            await this._asegurarProductos();
            this.render();
        } else {
            Utils.showTableLoader(tbody);
        }

        try {
            await this._asegurarProductos();
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
        
        Utils.hideTableLoader(tbody);
        tbody.innerHTML = '';

        const filas = this._filas();
        if (filas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay productos cargados</td></tr>';
            return;
        }
        
        filas.forEach(item => {
            const estado = item.stock_actual <= item.minimo ? 'BAJO' : 'OK';
            const nombre = String(item.producto_nombre || '').replace(/'/g, "\\'");
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.producto_nombre || ''}</td>
                <td>${this._tipo(item.tipo)}</td>
                <td>${this._cantidad(item.stock_actual, item.unidad)}</td>
                <td><span class="status-badge ${estado === 'BAJO' ? 'status-bajo' : 'status-activo'}">${estado}</span></td>
                <td>
                    <button class="btn btn-secondary" onclick="Stock.edit('${item.producto_id}', '${nombre}', ${item.stock_actual || 0})">Editar</button>
                    <button class="btn btn-danger" onclick="Stock.delete('${item.producto_id}', '${nombre}')">Eliminar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    
    async ajustar() {
        await this._asegurarProductos();
        const productos = (AppState.productos || []).slice().sort((a, b) =>
            String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')
        );
        
        const content = `
            <div class="form-group">
                <label>Producto</label>
                <select id="modal-stock-producto" class="form-control">
                    <option value="">Seleccionar...</option>
                    ${productos.map(p => `<option value="${p.id}">${p.nombre} · ${this._tipo(p.tipo)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Cantidad</label>
                <input type="number" id="modal-stock-cantidad" class="form-control" min="0" step="0.01">
            </div>
        `;
        
        Utils.showModal('Ajustar stock', content, async () => {
            const productoId = document.getElementById('modal-stock-producto').value;
            const cantidad = parseFloat(document.getElementById('modal-stock-cantidad').value);
            
            if (!productoId || Number.isNaN(cantidad) || cantidad < 0) {
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
                <input type="number" id="modal-stock-edit-cantidad" class="form-control" min="0" step="0.01" value="${stockActual}">
            </div>
        `;

        Utils.showModal('Editar stock', content, async () => {
            const cantidad = parseFloat(document.getElementById('modal-stock-edit-cantidad').value);

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

    async _despuesDeBorrar() {
        this.limpiarDatosLocales();
        CacheManager.clear();
        await DiaOperativo.refresh();
        Utils.showSuccess('Todos los datos fueron eliminados. El sistema quedó limpio.');
        Navigation.navigateTo('dashboard');
    },

    async ejecutarReset() {
        Utils.showLoader();
        try {
            await API.resetAllDatos(this.CONFIRM_PHRASE);
            await this._despuesDeBorrar();
        } catch (error) {
            const mensaje = String(error.message || '');
            const puedeHaberBorrado = mensaje.includes('No se pudo conectar') || mensaje.includes('tardó más de');
            if (puedeHaberBorrado) {
                try {
                    CacheManager.clear();
                    const [clientes, productos] = await Promise.all([
                        API.request('clientes', 'GET'),
                        API.request('productos', 'GET')
                    ]);
                    if ((clientes || []).length === 0 && (productos || []).length === 0) {
                        await this._despuesDeBorrar();
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
        
        const cached = CacheManager.peek('historial');
        if (Array.isArray(cached)) {
            AppState.cierres = cached;
            this.render(cached);
        } else {
            Utils.showTableLoader(tbody);
        }
        
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
        const cached = CacheManager.peek('caja');
        if (Array.isArray(cached)) this.render(cached);
        else Utils.showTableLoader(tbody);
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

const Reparto = {
    clientes: [],
    proveedores: [],
    _listo: false,

    enganchar() {
        const root = document.getElementById('reparto-root');
        if (!root || this._listo) return;
        this._listo = true;
        root.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-reparto]');
            if (!btn) return;
            if (btn.dataset.reparto === 'agregar') this.agregarLinea();
            if (btn.dataset.reparto === 'sacar') this.sacarLinea(btn.dataset.id);
            if (btn.dataset.reparto === 'todo') this.ponerTodo(btn.dataset.id);
            if (btn.dataset.reparto === 'guardar') this.guardar();
        });
        root.addEventListener('input', () => {
            this._editando = true;
            this._refrescarResumen();
        });
        root.addEventListener('change', (event) => {
            this._editando = true;
            if (event.target.id === 'reparto-cliente') {
                const cliente = this.clientes.find(c => c.id === event.target.value);
                const monto = document.getElementById('reparto-monto');
                if (cliente && monto) monto.value = Utils.formatPrice(cliente.deuda);
            }
            this._refrescarResumen();
        });
    },

    async load() {
        const root = document.getElementById('reparto-root');
        if (!root) return;
        this.enganchar();
        this._editando = false;
        const token = (this._carga = (this._carga || 0) + 1);
        const local = this._datosLocales();
        if (local.listo) this._aplicar(local.cobranzas, local.proveedores, local.precios);
        else root.innerHTML = '<p class="camion-vacio">Buscando saldos…</p>';

        Promise.all([
            API.getCobranzas().catch(() => local.cobranzas),
            API.getProveedores().catch(() => local.proveedores)
        ]).then(([cobranzas, proveedores]) => {
            if (this._carga !== token || AppState.currentPage !== 'reparto' || this._editando) return;
            if (proveedores && proveedores.length) AppState.proveedores = proveedores;
            this._aplicar(cobranzas || [], proveedores || [], this._preciosHoy());
        }).catch(error => console.error('Error cargando reparto:', error));
    },

    _preciosHoy() {
        const fecha = AppState.currentDate;
        return CacheManager.peek(`precios:${fecha}`)
            || (AppState.fechaCargada === fecha ? AppState.precios : [])
            || [];
    },

    _datosLocales() {
        const cobranzas = CacheManager.peek('cobranzas:all:all') || AppState.cobranzas || [];
        const proveedores = CacheManager.peek('proveedores') || AppState.proveedores || [];
        const precios = this._preciosHoy();
        return {
            cobranzas: Array.isArray(cobranzas) ? cobranzas : [],
            proveedores: Array.isArray(proveedores) ? proveedores : [],
            precios: Array.isArray(precios) ? precios : [],
            listo: (cobranzas && cobranzas.length) || (proveedores && proveedores.length)
        };
    },

    _totalesHoy(precios, cobranzas) {
        const cubiertos = new Set(
            (cobranzas || [])
                .filter(cobranza => Utils.fechaIso(cobranza.fecha) === AppState.currentDate)
                .map(cobranza => String(cobranza.cliente_id))
        );
        const map = new Map();
        (precios || []).forEach(precio => {
            const id = String(precio.cliente_id || '');
            if (!id || cubiertos.has(id)) return;
            const cantidad = parseFloat(precio.cantidad) || 0;
            const unit = Utils.parsePrice(precio.precio_cliente);
            const comision = Utils.parsePrice(precio.comision_unitaria);
            const subtotal = Math.round(cantidad * unit) + Math.round(cantidad * comision);
            if (subtotal <= 0) return;
            map.set(id, (map.get(id) || 0) + subtotal);
        });
        return [...map.entries()].map(([cliente_id, saldo]) => ({
            cliente_id,
            cliente_nombre: this._nombreCliente(cliente_id),
            saldo
        }));
    },

    _aplicar(cobranzas, proveedores, precios) {
        if (!AppState.clientes.length) {
            AppState.clientes = CacheManager.get('clientes') || [];
        }
        const clientes = this._deudas(cobranzas, this._totalesHoy(precios, cobranzas));
        const listaProv = (proveedores || [])
            .filter(p => Utils.parsePrice(p.saldo) > 0)
            .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
        const firma = clientes.map(c => c.id + ':' + c.deuda).join('|')
            + '#' + listaProv.map(p => String(p.id) + ':' + Utils.parsePrice(p.saldo)).join('|');
        if (firma === this._firma && document.getElementById('reparto-cliente')) return;
        this._firma = firma;
        this.clientes = clientes;
        this.proveedores = listaProv;
        this.render();
    },

    _nombreCliente(id) {
        const cliente = (AppState.clientes || []).find(c => String(c.id) === String(id));
        return cliente?.nombre || 'Cliente';
    },

    _deudas(cobranzas, totalesHoy) {
        const map = new Map();
        (cobranzas || []).forEach(cobranza => {
            const saldo = Utils.parsePrice(cobranza.saldo);
            if (saldo <= 0) return;
            const id = String(cobranza.cliente_id);
            const actual = map.get(id) || {
                id,
                nombre: cobranza.cliente_nombre || this._nombreCliente(id),
                deuda: 0,
                tieneFilaHoy: false
            };
            actual.deuda += saldo;
            if (cobranza.cliente_nombre) actual.nombre = cobranza.cliente_nombre;
            if (Utils.fechaIso(cobranza.fecha) === AppState.currentDate) actual.tieneFilaHoy = true;
            map.set(id, actual);
        });
        (totalesHoy || []).forEach(total => {
            const saldo = Utils.parsePrice(total.saldo);
            if (saldo <= 0) return;
            const id = String(total.cliente_id);
            const actual = map.get(id);
            if (actual?.tieneFilaHoy) return;
            if (actual) {
                actual.deuda += saldo;
                return;
            }
            map.set(id, {
                id,
                nombre: total.cliente_nombre || this._nombreCliente(id),
                deuda: saldo,
                tieneFilaHoy: false
            });
        });
        return [...map.values()]
            .map(cliente => ({ ...cliente, deuda: Math.round(cliente.deuda) }))
            .filter(cliente => cliente.deuda > 0)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    },

    _opcionesProveedor(elegido) {
        return this.proveedores.map(p => {
            const id = String(p.id);
            const selected = id === String(elegido) ? ' selected' : '';
            return `<option value="${id}"${selected}>${this._esc(p.nombre)} · debe ${this._esc(Utils.formatCurrency(p.saldo))}</option>`;
        }).join('');
    },

    _esc(valor) {
        return String(valor ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    },

    render() {
        const root = document.getElementById('reparto-root');
        if (!root) return;
        if (!this.clientes.length) {
            root.innerHTML = '<p class="camion-vacio">Ningún cliente tiene saldo para descontar. El efectivo se anota cuando ya hay un precio o una cobranza pendiente.</p>';
            return;
        }
        const primero = this.clientes[0];
        const opciones = this.clientes.map(c =>
            `<option value="${c.id}">${this._esc(c.nombre)} · debe ${this._esc(Utils.formatCurrency(c.deuda))}</option>`
        ).join('');
        const linea = this._lineaHtml({ id: 'l-' + Date.now(), proveedor_id: '', monto: '' });
        root.innerHTML = `
            <section class="reparto-card">
                <label for="reparto-cliente">Entró de</label>
                <select id="reparto-cliente" class="form-control">${opciones}</select>
                <p class="reparto-deuda" id="reparto-deuda">Le descontás el saldo a ${this._esc(primero.nombre)}.</p>
                <label for="reparto-monto">Efectivo que entró</label>
                <input id="reparto-monto" class="form-control" data-price-input="true" inputmode="numeric" value="${Utils.formatPrice(primero.deuda)}">
            </section>
            <section class="reparto-card">
                <h3>De eso le das</h3>
                <div id="reparto-lineas">${linea}</div>
                <button type="button" class="btn btn-secondary" data-reparto="agregar">Agregar proveedor</button>
            </section>
            <div class="reparto-resumen" id="reparto-resumen"></div>
            <button type="button" class="btn btn-primary reparto-guardar" id="btn-reparto-guardar" data-reparto="guardar">Descontar saldos</button>
        `;
        Utils.enablePriceInputs(root);
        this._refrescarResumen();
    },

    _lineaHtml(linea) {
        return `
            <div class="reparto-linea" data-id="${linea.id}">
                <select class="form-control reparto-prov">
                    <option value="">Proveedor</option>
                    ${this._opcionesProveedor(linea.proveedor_id)}
                </select>
                <input class="form-control reparto-parte" data-price-input="true" inputmode="numeric" placeholder="0" value="${linea.monto ? this._esc(linea.monto) : ''}">
                <button type="button" class="btn btn-secondary btn-sm" data-reparto="todo" data-id="${linea.id}">Todo</button>
                <button type="button" class="btn btn-danger btn-sm" data-reparto="sacar" data-id="${linea.id}" aria-label="Sacar proveedor">×</button>
            </div>
        `;
    },

    _lineasActuales() {
        return [...document.querySelectorAll('#reparto-lineas .reparto-linea')].map(row => ({
            id: row.dataset.id,
            proveedor_id: row.querySelector('select')?.value || '',
            monto: row.querySelector('input')?.value || ''
        }));
    },

    agregarLinea() {
        const cont = document.getElementById('reparto-lineas');
        if (!cont) return;
        cont.insertAdjacentHTML('beforeend', this._lineaHtml({ id: 'l-' + Date.now(), proveedor_id: '', monto: '' }));
        Utils.enablePriceInputs(cont);
        this._refrescarResumen();
    },

    sacarLinea(id) {
        const filas = this._lineasActuales();
        if (filas.length <= 1) {
            const row = document.querySelector(`#reparto-lineas .reparto-linea[data-id="${id}"]`);
            if (!row) return;
            row.querySelector('select').value = '';
            row.querySelector('input').value = '';
            this._refrescarResumen();
            return;
        }
        document.querySelector(`#reparto-lineas .reparto-linea[data-id="${id}"]`)?.remove();
        this._refrescarResumen();
    },

    ponerTodo(id) {
        const row = document.querySelector(`#reparto-lineas .reparto-linea[data-id="${id}"]`);
        if (!row) return;
        const proveedorId = row.querySelector('select')?.value;
        const proveedor = this.proveedores.find(p => String(p.id) === String(proveedorId));
        if (!proveedor) {
            Utils.showError('Elegí el proveedor.');
            return;
        }
        const entro = Utils.parsePrice(document.getElementById('reparto-monto')?.value);
        const otros = this._lineasActuales()
            .filter(linea => linea.id !== id)
            .reduce((suma, linea) => suma + Utils.parsePrice(linea.monto), 0);
        const disponible = Math.max(0, entro - otros);
        const saldo = Utils.parsePrice(proveedor.saldo);
        const monto = Math.min(saldo, disponible || saldo);
        row.querySelector('input').value = Utils.formatPrice(monto);
        this._refrescarResumen();
    },

    _refrescarResumen() {
        const caja = document.getElementById('reparto-resumen');
        const deuda = document.getElementById('reparto-deuda');
        if (!caja) return;
        const clienteId = document.getElementById('reparto-cliente')?.value;
        const cliente = this.clientes.find(c => c.id === clienteId);
        if (deuda && cliente) deuda.textContent = `${cliente.nombre} debe ${Utils.formatCurrency(cliente.deuda)}.`;
        const entro = Utils.parsePrice(document.getElementById('reparto-monto')?.value);
        const sale = this._lineasActuales().reduce((suma, linea) => suma + Utils.parsePrice(linea.monto), 0);
        const queda = entro - sale;
        let aviso = '';
        if (cliente && entro > cliente.deuda) aviso = `Supera lo que debe ${cliente.nombre} (${Utils.formatCurrency(cliente.deuda)}).`;
        else if (sale > entro) aviso = 'Estás repartiendo más de lo que entró.';
        caja.innerHTML = `
            <p>Entró <strong>${Utils.formatCurrency(entro)}</strong></p>
            <p>Repartís <strong>${Utils.formatCurrency(sale)}</strong></p>
            <p>Queda en la caja <strong>${Utils.formatCurrency(queda)}</strong></p>
            ${aviso ? `<p class="reparto-aviso">${this._esc(aviso)}</p>` : ''}
        `;
    },

    async guardar() {
        const btn = document.getElementById('btn-reparto-guardar');
        if (btn?.disabled) return;
        const clienteId = document.getElementById('reparto-cliente')?.value;
        const cliente = this.clientes.find(c => c.id === clienteId);
        const monto = Utils.parsePrice(document.getElementById('reparto-monto')?.value);
        const pagos = this._lineasActuales()
            .filter(linea => linea.proveedor_id && Utils.parsePrice(linea.monto) > 0)
            .map(linea => ({ proveedor_id: linea.proveedor_id, monto: Utils.parsePrice(linea.monto) }));
        if (!cliente) {
            Utils.showError('Elegí el cliente.');
            return;
        }
        if (monto <= 0) {
            Utils.showError('Poné cuánto entró en efectivo.');
            return;
        }
        if (monto > cliente.deuda) {
            Utils.showError(`${cliente.nombre} debe ${Utils.formatCurrency(cliente.deuda)}.`);
            return;
        }
        const sale = pagos.reduce((suma, pago) => suma + pago.monto, 0);
        if (sale > monto) {
            Utils.showError('Estás repartiendo más de lo que entró.');
            return;
        }
        const porProveedor = new Map();
        pagos.forEach(pago => {
            porProveedor.set(pago.proveedor_id, (porProveedor.get(pago.proveedor_id) || 0) + pago.monto);
        });
        for (const [id, total] of porProveedor) {
            const proveedor = this.proveedores.find(p => String(p.id) === String(id));
            const saldo = Utils.parsePrice(proveedor?.saldo);
            if (total > saldo) {
                Utils.showError(`${proveedor?.nombre || 'El proveedor'} tiene saldo ${Utils.formatCurrency(saldo)}.`);
                return;
            }
        }
        if (btn) btn.disabled = true;
        try {
            const resultado = await API.repartirEfectivo({
                fecha: AppState.currentDate,
                cliente_id: clienteId,
                monto,
                pagos
            });
            Utils.avisar(`Listo. ${cliente.nombre} bajó ${Utils.formatCurrency(resultado.cobrado)}. En la caja quedan ${Utils.formatCurrency(resultado.queda)}.`);
            AppState.proveedores = [];
            await this.load();
        } catch (error) {
            const mensaje = error && error.message ? error.message : 'No se pudo repartir';
            if (mensaje.includes('Endpoint no encontrado')) {
                Utils.showError('Publicá el script para que el reparto descuente los saldos.');
            } else {
                Utils.showError(mensaje);
            }
        } finally {
            if (btn) btn.disabled = false;
        }
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
        if (dash.recepcion) AppState.recepcion = dash.recepcion;
        if (dash.precios) AppState.precios = dash.precios;
        if (dash.pedidos || dash.recepcion || dash.precios) AppState.fechaCargada = fecha;
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

    armarFlujoLocal(fecha = AppState.currentDate) {
        const cacheKey = `flujo:${fecha}`;
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;

        const pedidos = CacheManager.get(`pedidos:${fecha}`);
        const recepcion = CacheManager.get(`recepcion:${fecha}`);
        const precios = CacheManager.get(`precios:${fecha}`);
        if (!Array.isArray(pedidos) || !Array.isArray(recepcion) || !Array.isArray(precios)) {
            return null;
        }

        const armado = { fecha, pedidos, recepcion, precios };
        CacheManager.set(cacheKey, armado);
        return armado;
    },

    getFlujo(fecha = AppState.currentDate) {
        const local = this.armarFlujoLocal(fecha);
        if (local) {
            this._hydrateFlujo(local, fecha);
            return Promise.resolve(local);
        }
        if (this._bootstrapPromise && this._bootstrapFecha === fecha) {
            return this._bootstrapPromise.then(() => {
                const despues = this.armarFlujoLocal(fecha);
                if (despues) {
                    this._hydrateFlujo(despues, fecha);
                    return despues;
                }
                return this._pedirFlujo(fecha);
            });
        }
        return this._pedirFlujo(fecha);
    },

    _pedirFlujo(fecha) {
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
        AppState.fechaCargada = fecha;
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
    addButtonListener('btn-seguir-recepcion', () => Navigation.navigateTo('camiones'), 'Abriendo...');
    addButtonListener('btn-camiones-agregar', () => Camiones.agregar(), 'Agregando...', { useButtonLoader: false });
    addButtonListener('btn-camiones-imprimir', () => Camiones.imprimirTodos(), 'Imprimiendo...', { useButtonLoader: false });
    addButtonListener('btn-camiones-enviar', () => Camiones.enviarTodos(), 'Preparando...', { useButtonLoader: false });
    addButtonListener('btn-seguir-desde-camiones', () => Navigation.navigateTo('recepcion'), 'Abriendo...');
    Camiones.enganchar();
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
    addButtonListener('btn-ir-reparto', () => Navigation.navigateTo('reparto'), 'Abriendo...', { useButtonLoader: false });
    addButtonListener('btn-caja-repartir', () => Navigation.navigateTo('reparto'), 'Abriendo...', { useButtonLoader: false });
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

