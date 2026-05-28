/**
 * Luciano Cargas - Google Apps Script API
 * Sistema de gestión de pedidos, proveedores, cobranzas y stock
 */

// Configuración
const CONFIG = {
  SPREADSHEET_ID: '18G5wDNgnsSu4saWGQu4m-B0XF6oJ5oRrSPLl7zMVJVY', // Se debe configurar
  API_KEY: 'TMiToken89899', // Token de seguridad
  SHEETS: {
    CLIENTES: 'Clientes',
    PROVEEDORES: 'Proveedores',
    PRODUCTOS: 'Productos',
    PEDIDOS: 'Pedidos',
    RECEPCION: 'Recepcion',
    PRECIOS_CLIENTE: 'PreciosCliente',
    CIERRE_DIA: 'CierreDia',
    COBRANZAS: 'Cobranzas',
    PAGOS_PROVEEDORES: 'PagosProveedores',
    CAJA_MOVIMIENTOS: 'CajaMovimientos',
    STOCK_BEBIDAS: 'StockBebidas',
    CONFIGURACION: 'Configuracion'
  },
  // Email por defecto para notificaciones (se puede cambiar en la hoja Configuracion)
  DEFAULT_EMAIL: 'admin@lucianocargas.com',
  
  // USUARIOS AUTORIZADOS - Configurar con los emails y passwords reales
  USERS: {
    'kevindurtes792@gmail.com': 'kevinpassword123',  // CAMBIAR: Email y password del usuario 1
    'nicolirina.rosascharny@gmail.com': 'nicolpassword456'   // CAMBIAR: Email y password del usuario 2
  }
};

/**
 * Función principal para manejar peticiones HTTP
 */
function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function doPut(e) {
  return handleRequest(e, 'PUT');
}

function doDelete(e) {
  return handleRequest(e, 'DELETE');
}

/**
 * Maneja peticiones OPTIONS (CORS preflight)
 */
function doOptions(e) {
  // Respuesta vacía para preflight CORS
  // Google Apps Script maneja las cabeceras CORS automáticamente
  // cuando la Web App está configurada como "Cualquiera, incluso anónimos"
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Maneja todas las peticiones HTTP
 */
function handleRequest(e, method) {
  // Declarar fuera del try para que el catch siempre pueda armar JSONP válido
  let callback = null;
  let endpoint = null;
  let actualMethod = method;
  
  try {
    // Manejar caso cuando e es undefined o null
    if (!e) {
      e = { parameter: {}, postData: null };
    }
    if (!e.parameter) {
      e.parameter = {};
    }
    
    // Validar API Key
    let apiKey = e.parameter['apiKey'];
    if (!apiKey && e.postData) {
      try {
        const postData = JSON.parse(e.postData.contents);
        apiKey = postData.apiKey;
      } catch (err) {
        // Ignorar error de parse
      }
    }
    
    // Guardar callback para JSONP antes de validar (si existe)
    callback = e.parameter.callback || null;
    
    if (!apiKey || apiKey !== CONFIG.API_KEY) {
      return createResponse({ success: false, error: 'API Key inválida' }, 401, callback);
    }
    
    // Obtener endpoint
    endpoint = e.parameter.endpoint;
    
    if (!endpoint) {
      return createResponse({ success: false, error: 'Endpoint no especificado' }, 400, callback);
    }
    
    // IMPORTANTE: Para JSONP, el método HTTP real siempre es GET
    // Pero el método lógico viene en el parámetro 'method' de la URL
    // Usar el método del parámetro si existe, sino usar el método HTTP real
    actualMethod = (e.parameter.method && e.parameter.method.toUpperCase()) || method;
    
    // Obtener datos de los parámetros (vienen en la URL para evitar preflight CORS)
    // También verificar postData por si acaso
    let data = e.parameter || {};
    
    // Si hay postData, intentar parsearlo (para compatibilidad)
    if (e.postData && e.postData.contents) {
      try {
        const postDataParsed = JSON.parse(e.postData.contents);
        // Combinar con parámetros, parámetros tienen prioridad
        data = { ...postDataParsed, ...data };
      } catch (err) {
        // Si no es JSON, ignorar y usar solo parámetros
      }
    }
    
    // Parsear valores JSON que vienen como strings en los parámetros
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'string') {
        // Convertir strings booleanos a booleanos reales
        if (data[key] === 'true') {
          data[key] = true;
        } else if (data[key] === 'false') {
          data[key] = false;
        }
        // Intentar parsear si parece ser JSON (empieza con { o [)
        else if (data[key].startsWith('{') || data[key].startsWith('[')) {
          try {
            data[key] = JSON.parse(data[key]);
          } catch (err) {
            // Si falla el parse, dejar el valor como string
          }
        }
      }
    });
    
    // Remover apiKey, endpoint, callback y method de los datos (ya se validaron y guardaron)
    delete data.apiKey;
    delete data.endpoint;
    delete data.callback;
    delete data.method;
    
    // Enrutar según endpoint
    let result;
    switch (endpoint) {
      // Login - Autenticación
      case 'login':
        result = handleLogin(data.email, data.password);
        break;
      
      // Clientes
      case 'clientes':
        if (actualMethod === 'GET') {
          result = getClientes();
        } else if (actualMethod === 'POST') {
          result = createCliente(data);
        }
        break;
      
      case 'clientes/update':
        result = updateCliente(data);
        break;
      
      case 'clientes/delete':
        result = deleteCliente(data.id);
        break;
      
      // Proveedores
      case 'proveedores':
        if (actualMethod === 'GET') {
          result = getProveedores();
        } else if (actualMethod === 'POST') {
          result = createProveedor(data);
        }
        break;
      
      case 'proveedores/update':
        result = updateProveedor(data);
        break;
      
      case 'proveedores/delete':
        result = deleteProveedor(data.id);
        break;
      
      // Productos
      case 'productos':
        if (actualMethod === 'GET') {
          result = getProductos();
        } else if (actualMethod === 'POST') {
          result = createProducto(data);
        }
        break;
      
      case 'productos/update':
        result = updateProducto(data);
        break;
      
      case 'productos/delete':
        result = deleteProducto(data.id);
        break;
      
      // Pedidos
      case 'pedidos':
        if (actualMethod === 'GET') {
          result = getPedidos(data.fecha);
        } else if (actualMethod === 'POST') {
          result = createPedido(data);
        }
        break;
      
      case 'pedidos/delete':
        result = deletePedido(data.id);
        break;
      
      case 'pedidos/marcar-enviados':
        result = marcarPedidosEnviados(data.fecha);
        break;
      
      case 'pedidos/marcar-enviados-por-ids':
        result = marcarPedidosEnviadosPorIds(data.pedidosIds);
        break;
      
      // Recepción
      case 'recepcion':
        if (actualMethod === 'GET') {
          result = getRecepcion(data.fecha);
        } else if (actualMethod === 'POST') {
          result = saveRecepcion(data);
        }
        break;
      
      case 'recepcion/confirmar':
        result = confirmarRecepcion(data.fecha);
        break;
      
      // Precios Cliente
      case 'precios-cliente':
        if (actualMethod === 'GET') {
          result = getPreciosCliente(data.fecha);
        } else if (actualMethod === 'POST') {
          result = savePreciosCliente(data);
        }
        break;
      
      // Cierre
      case 'cierre':
        if (actualMethod === 'GET') {
          result = getCierres();
        } else if (actualMethod === 'POST') {
          // Validar que la fecha esté presente
          Logger.log('🔍 [CIERRE] Datos recibidos:', JSON.stringify(data));
          Logger.log('🔍 [CIERRE] data.fecha:', data.fecha);
          Logger.log('🔍 [CIERRE] Tipo de data.fecha:', typeof data.fecha);
          
          if (!data.fecha || data.fecha === 'undefined' || data.fecha === 'null') {
            Logger.log('❌ [CIERRE] Fecha no proporcionada o inválida');
            throw new Error('Fecha no proporcionada para el cierre del día. Valor recibido: ' + data.fecha);
          }
          
          result = cerrarDia(data.fecha);
        }
        break;
      
      // Cobranzas
      case 'cobranzas':
        if (actualMethod === 'GET') {
          result = getCobranzas(data.fecha, data.cliente_id);
        } else if (actualMethod === 'POST') {
          result = registrarCobro(data);
        }
        break;
      
      // Estadísticas
      case 'estadisticas/productos-mas-vendidos':
        result = getTopProductosVendidos(data.dias || 7, data.limite || 5);
        break;
      
      // Pagos Proveedores
      case 'pagos-proveedores':
        if (actualMethod === 'GET') {
          result = getPagosProveedores();
        } else if (actualMethod === 'POST') {
          result = registrarPago(data);
        }
        break;
      
      // Stock
      case 'stock':
        if (actualMethod === 'GET') {
          result = getStock();
        } else if (actualMethod === 'PUT') {
          result = updateStock(data);
        }
        break;
      
      case 'stock/delete':
        result = deleteStock(data.producto_id);
        break;
      
      // Caja
      case 'caja':
        if (actualMethod === 'GET') {
          result = getCajaMovimientos();
        } else if (actualMethod === 'POST') {
          result = createCajaMovimiento(data);
        }
        break;
      
      // Historial
      case 'historial':
        result = getHistorial();
        break;
      
      case 'historial/delete':
        result = deleteHistorial(data.id);
        break;
      
      // Notificaciones
      case 'notificaciones/verificar-stock':
        result = verificarStockBajo();
        break;
      
      case 'notificaciones/config':
        if (actualMethod === 'GET') {
          result = getConfiguracionNotificaciones();
        } else if (actualMethod === 'POST') {
          result = saveConfiguracionNotificaciones(data);
        }
        break;
      
      default:
        return createResponse({ success: false, error: 'Endpoint no encontrado' }, 404, callback);
    }
    
    return createResponse({ success: true, data: result }, 200, callback);
    
  } catch (error) {
    Logger.log('❌ [ERROR] Error en handleRequest: ' + error.toString());
    Logger.log('❌ [ERROR] Stack trace: ' + (error.stack || 'No disponible'));
    Logger.log('❌ [ERROR] Endpoint: ' + (endpoint || 'no especificado'));
    Logger.log('❌ [ERROR] Método: ' + (actualMethod || method));
    
    // Asegurar que siempre se devuelve una respuesta válida, incluso si hay error
    try {
      const errorResponse = { 
        success: false, 
        error: error.toString(),
        endpoint: endpoint || 'desconocido',
        method: actualMethod || method
      };
      
      // Asegurar que siempre hay un callback para JSONP
      const safeCallback = callback || 'console.log';
      Logger.log('📤 [ERROR] Enviando respuesta de error con callback: ' + safeCallback);
      
      return createResponse(errorResponse, 500, safeCallback);
    } catch (responseError) {
      // Si incluso crear la respuesta falla, intentar respuesta básica
      Logger.log('❌ [ERROR CRÍTICO] Error creando respuesta de error: ' + responseError.toString());
      try {
        return ContentService
          .createTextOutput((callback || 'console.log') + '({success:false,error:"Error crítico en servidor"})')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      } catch (finalError) {
        Logger.log('❌ [ERROR FATAL] No se pudo crear ninguna respuesta');
        throw finalError;
      }
    }
  }
}

/**
 * Crea respuesta HTTP con formato JSON o JSONP
 * @param {Object} data - Datos a devolver
 * @param {Number} statusCode - Código HTTP (no usado en Apps Script)
 * @param {String} callback - Nombre del callback para JSONP (opcional)
 */
function createResponse(data, statusCode = 200, callback = null) {
  let output;
  
  if (callback) {
    // Respuesta JSONP - evita problemas de CORS
    const jsonpResponse = callback + '(' + JSON.stringify(data) + ')';
    output = ContentService
      .createTextOutput(jsonpResponse)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    // Respuesta JSON normal
    // Nota: Google Apps Script maneja CORS automáticamente cuando la Web App
    // está configurada correctamente como "Cualquiera, incluso anónimos"
    output = ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return output;
}

/** Caché de spreadsheet por ejecución (reduce llamadas repetidas a openById) */
let _spreadsheetCache = null;

/**
 * Obtiene la hoja de cálculo
 */
function getSpreadsheet() {
  if (!_spreadsheetCache) {
    _spreadsheetCache = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  return _spreadsheetCache;
}

/**
 * Obtiene una hoja específica
 */
function getSheet(sheetName) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    // Crear hoja si no existe
    sheet = ss.insertSheet(sheetName);
    // Agregar headers según la hoja
    initializeSheet(sheet, sheetName);
  }
  
  return sheet;
}

/**
 * Inicializa headers de una hoja
 */
function initializeSheet(sheet, sheetName) {
  const headers = {
    'Clientes': ['id', 'nombre', 'telefono', 'activo'],
    'Proveedores': ['id', 'nombre', 'rubro', 'activo'],
    'Productos': ['id', 'nombre', 'tipo', 'unidad', 'proveedor_default'],
    'Pedidos': ['id', 'fecha', 'cliente_id', 'producto_id', 'tipo', 'cantidad', 'enviado'],
    'Recepcion': ['id', 'fecha', 'producto_id', 'proveedor_id', 'pedido_total', 'llego', 'precio_real', 'confirmado'],
    'PreciosCliente': ['id', 'fecha', 'cliente_id', 'producto_id', 'cantidad', 'precio_cliente'],
    'CierreDia': ['id', 'fecha', 'estado', 'notas'],
    'Cobranzas': ['id', 'fecha', 'cliente_id', 'total', 'pagado', 'saldo', 'estado'],
    'PagosProveedores': ['id', 'fecha', 'proveedor_id', 'monto', 'metodo', 'nota'],
    'CajaMovimientos': ['id', 'fecha', 'tipo', 'monto', 'nota', 'referencia'],
    'StockBebidas': ['producto_id', 'stock_actual', 'minimo'],
    'Configuracion': ['clave', 'valor']
  };
  
  if (headers[sheetName]) {
    sheet.getRange(1, 1, 1, headers[sheetName].length).setValues([headers[sheetName]]);
    sheet.getRange(1, 1, 1, headers[sheetName].length).setFontWeight('bold');
    
    // Inicializar configuración por defecto si es la hoja de Configuracion
    if (sheetName === 'Configuracion') {
      sheet.appendRow(['email_notificaciones', CONFIG.DEFAULT_EMAIL]);
      sheet.appendRow(['notificaciones_activas', 'true']);
      sheet.appendRow(['hora_verificacion', '09:00']);
    }
  }
}

/**
 * Convierte fila a objeto
 */
function rowToObject(sheet, rowIndex) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
  const obj = {};
  
  headers.forEach((header, index) => {
    obj[header] = row[index];
  });
  
  return obj;
}

/**
 * Convierte objeto a fila
 */
function objectToRow(headers, obj) {
  return headers.map(header => obj[header] || '');
}

/**
 * Genera ID único
 */
function generateId() {
  return Utilities.getUuid();
}

/**
 * Normaliza una fecha a formato YYYY-MM-DD
 * Acepta Date objects, strings, o cualquier formato válido
 */
function normalizeFecha(fecha) {
  if (!fecha) return null;
  
  // Si ya es un string en formato correcto, devolverlo
  if (typeof fecha === 'string') {
    // Si ya está en formato YYYY-MM-DD, devolverlo tal cual
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return fecha;
    }
  }
  
  // Si es un Date object o string parseable, convertirlo
  try {
    const dateObj = new Date(fecha);
    if (isNaN(dateObj.getTime())) {
      return null;
    }
    
    // Formatear a YYYY-MM-DD
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  } catch (error) {
    Logger.log('Error normalizando fecha: ' + error.toString());
    return null;
  }
}

/**
 * Normaliza importes/precios a entero sin separadores de miles.
 * Ejemplos:
 * - "5.000" => 5000
 * - "$ 1.500.000" => 1500000
 * - 2500 => 2500
 */
function normalizeAmount(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : Math.round(value);
  }

  const raw = String(value).trim();
  if (!raw) return 0;

  const isNegative = raw.charAt(0) === '-';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return 0;

  const parsed = parseInt(digits, 10);
  return isNegative ? -parsed : parsed;
}

// ========== CLIENTES ==========

function getClientes() {
  const sheet = getSheet(CONFIG.SHEETS.CLIENTES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const clientes = [];
  
  for (let i = 1; i < data.length; i++) {
    const cliente = {};
    headers.forEach((header, index) => {
      cliente[header] = data[i][index];
    });
    // Mostrar todos los clientes (activos e inactivos)
    clientes.push(cliente);
  }
  
  return clientes;
}

function createCliente(data) {
  const sheet = getSheet(CONFIG.SHEETS.CLIENTES);
  const id = generateId();
  
  const newRow = [
    id,
    data.nombre,
    data.telefono || '',
    true
  ];
  
  sheet.appendRow(newRow);
  return { id: id, ...data };
}

function updateCliente(data) {
  const sheet = getSheet(CONFIG.SHEETS.CLIENTES);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  // Log para debug
  Logger.log('updateCliente - data recibido:', JSON.stringify(data));
  Logger.log('updateCliente - data.activo tipo:', typeof data.activo);
  Logger.log('updateCliente - data.activo valor:', data.activo);
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.id) {
      sheet.getRange(i + 1, 2).setValue(data.nombre);
      sheet.getRange(i + 1, 3).setValue(data.telefono || '');
      
      // Convertir explícitamente a booleano
      // Manejar strings 'true', 'false', booleanos, y otros valores
      let activoValue;
      if (data.activo === 'false' || data.activo === false || data.activo === 0 || data.activo === '0') {
        activoValue = false;
      } else if (data.activo === 'true' || data.activo === true || data.activo === 1 || data.activo === '1') {
        activoValue = true;
      } else {
        // Por defecto, si no se especifica, mantener como true
        activoValue = true;
      }
      
      Logger.log('updateCliente - guardando activo como:', activoValue);
      sheet.getRange(i + 1, 4).setValue(activoValue);
      return { success: true };
    }
  }
  
  throw new Error('Cliente no encontrado');
}

function deleteCliente(id) {
  const sheet = getSheet(CONFIG.SHEETS.CLIENTES);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  
  throw new Error('Cliente no encontrado');
}

// ========== PROVEEDORES ==========

function getProveedores() {
  const sheet = getSheet(CONFIG.SHEETS.PROVEEDORES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const proveedores = [];
  
  // OPTIMIZACIÓN: Calcular todos los saldos de una vez
  const saldos = calcularTodosSaldosProveedores();
  
  for (let i = 1; i < data.length; i++) {
    const proveedor = {};
    headers.forEach((header, index) => {
      proveedor[header] = data[i][index];
    });
    
    // Usar saldo pre-calculado
    proveedor.saldo = saldos[proveedor.id] || 0;
    
    // Mostrar todos los proveedores (activos e inactivos)
    proveedores.push(proveedor);
  }
  
  return proveedores;
}

function createProveedor(data) {
  const sheet = getSheet(CONFIG.SHEETS.PROVEEDORES);
  const id = generateId();
  
  const newRow = [
    id,
    data.nombre,
    data.rubro || '',
    true
  ];
  
  sheet.appendRow(newRow);
  return { id: id, ...data };
}

function updateProveedor(data) {
  const sheet = getSheet(CONFIG.SHEETS.PROVEEDORES);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  // Log para debug
  Logger.log('updateProveedor - data recibido:', JSON.stringify(data));
  Logger.log('updateProveedor - data.activo tipo:', typeof data.activo);
  Logger.log('updateProveedor - data.activo valor:', data.activo);
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.id) {
      sheet.getRange(i + 1, 2).setValue(data.nombre);
      sheet.getRange(i + 1, 3).setValue(data.rubro || '');
      
      // Convertir explícitamente a booleano (igual que en clientes)
      let activoValue;
      if (data.activo === 'false' || data.activo === false || data.activo === 0 || data.activo === '0') {
        activoValue = false;
      } else if (data.activo === 'true' || data.activo === true || data.activo === 1 || data.activo === '1') {
        activoValue = true;
      } else {
        // Por defecto, si no se especifica, mantener como true
        activoValue = true;
      }
      
      Logger.log('updateProveedor - guardando activo como:', activoValue);
      sheet.getRange(i + 1, 4).setValue(activoValue);
      return { success: true };
    }
  }
  
  throw new Error('Proveedor no encontrado');
}

function deleteProveedor(id) {
  const sheet = getSheet(CONFIG.SHEETS.PROVEEDORES);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  
  throw new Error('Proveedor no encontrado');
}

// OPTIMIZACIÓN: Calcular todos los saldos de una vez
function calcularTodosSaldosProveedores() {
  const saldos = {};
  
  // Leer recepciones UNA SOLA VEZ
  const recepcionSheet = getSheet(CONFIG.SHEETS.RECEPCION);
  const recepciones = recepcionSheet.getDataRange().getValues();
  
  // Calcular deudas por proveedor
  for (let i = 1; i < recepciones.length; i++) {
    const proveedorId = recepciones[i][3]; // columna proveedor_id
    const confirmado = recepciones[i][7];  // columna confirmado
    
    if (confirmado === true) {
      const llego = recepciones[i][5] || 0;
      const precio = normalizeAmount(recepciones[i][6]);
      const total = llego * precio;
      
      if (!saldos[proveedorId]) {
        saldos[proveedorId] = 0;
      }
      saldos[proveedorId] += total;
    }
  }
  
  // Leer pagos UNA SOLA VEZ
  const pagosSheet = getSheet(CONFIG.SHEETS.PAGOS_PROVEEDORES);
  const pagos = pagosSheet.getDataRange().getValues();
  
  // Restar pagos por proveedor
  for (let i = 1; i < pagos.length; i++) {
    const proveedorId = pagos[i][2]; // columna proveedor_id
    const monto = normalizeAmount(pagos[i][3]); // columna monto
    
    if (!saldos[proveedorId]) {
      saldos[proveedorId] = 0;
    }
    saldos[proveedorId] -= monto;
  }
  
  return saldos;
}

// Función legacy - mantener por compatibilidad
function calcularSaldoProveedor(proveedorId) {
  const saldos = calcularTodosSaldosProveedores();
  return saldos[proveedorId] || 0;
}

// ========== PRODUCTOS ==========

function getProductos() {
  const sheet = getSheet(CONFIG.SHEETS.PRODUCTOS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const productos = [];
  
  for (let i = 1; i < data.length; i++) {
    const producto = {};
    headers.forEach((header, index) => {
      producto[header] = data[i][index];
    });
    productos.push(producto);
  }
  
  return productos;
}

function createProducto(data) {
  const sheet = getSheet(CONFIG.SHEETS.PRODUCTOS);
  const id = generateId();
  
  const newRow = [
    id,
    data.nombre,
    data.tipo,
    data.unidad || '',
    data.proveedor_default || ''
  ];
  
  sheet.appendRow(newRow);
  
  // Si es bebida, crear registro de stock
  if (data.tipo === 'bebida') {
    const stockSheet = getSheet(CONFIG.SHEETS.STOCK_BEBIDAS);
    stockSheet.appendRow([id, 0, data.minimo || 10]);
  }
  
  return { id: id, ...data };
}

/**
 * Actualiza un producto existente
 * @param {Object} data - Debe contener: id, nombre, tipo, unidad, proveedor_default (opcional)
 */
function updateProducto(data) {
  const sheet = getSheet(CONFIG.SHEETS.PRODUCTOS);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.id) {
      // Columnas: 1=id, 2=nombre, 3=tipo, 4=unidad, 5=proveedor_default
      sheet.getRange(i + 1, 2).setValue(data.nombre);
      sheet.getRange(i + 1, 3).setValue(data.tipo);
      sheet.getRange(i + 1, 4).setValue(data.unidad || '');
      sheet.getRange(i + 1, 5).setValue(data.proveedor_default || '');
      return { success: true };
    }
  }
  
  throw new Error('Producto no encontrado');
}

function deleteProducto(id) {
  const sheet = getSheet(CONFIG.SHEETS.PRODUCTOS);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  
  throw new Error('Producto no encontrado');
}

// ========== PEDIDOS ==========

function getPedidos(fecha = null) {
  const sheet = getSheet(CONFIG.SHEETS.PEDIDOS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const pedidos = [];
  
  // Normalizar la fecha de búsqueda
  const fechaBusqueda = fecha ? normalizeFecha(fecha) : null;
  
  // OPTIMIZACIÓN: Leer clientes y productos UNA SOLA VEZ
  const clientes = getClientes();
  const productos = getProductos();
  
  // Crear mapas para búsqueda O(1) en lugar de O(n)
  const clientesMap = {};
  clientes.forEach(c => { clientesMap[c.id] = c; });
  
  const productosMap = {};
  productos.forEach(p => { productosMap[p.id] = p; });
  
  for (let i = 1; i < data.length; i++) {
    // Si filtramos por fecha y no coincide, saltar
    if (fechaBusqueda) {
      const fechaPedido = normalizeFecha(data[i][1]);
      if (fechaPedido !== fechaBusqueda) {
        continue;
      }
    }
    
    const pedido = {};
    headers.forEach((header, index) => {
      pedido[header] = data[i][index];
    });
    
    // Normalizar la fecha en el pedido para consistencia
    if (pedido.fecha) {
      pedido.fecha = normalizeFecha(pedido.fecha);
    }
    
    // Búsqueda O(1) con mapa en lugar de O(n) con find()
    const cliente = clientesMap[pedido.cliente_id];
    pedido.cliente_nombre = cliente ? cliente.nombre : '';
    
    const producto = productosMap[pedido.producto_id];
    pedido.producto_nombre = producto ? producto.nombre : '';
    
    pedidos.push(pedido);
  }
  
  return pedidos;
}

function createPedido(data) {
  const sheet = getSheet(CONFIG.SHEETS.PEDIDOS);
  const id = generateId();
  
  const newRow = [
    id,
    data.fecha || new Date().toISOString().split('T')[0],
    data.cliente_id,
    data.producto_id,
    data.tipo,
    data.cantidad,
    false // enviado = false por defecto
  ];
  
  sheet.appendRow(newRow);
  return { id: id, ...data };
}

function deletePedido(id) {
  const sheet = getSheet(CONFIG.SHEETS.PEDIDOS);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  
  throw new Error('Pedido no encontrado');
}

/**
 * Marca todos los pedidos de una fecha como enviados
 * @param {string} fecha - Fecha en formato YYYY-MM-DD
 * @return {Object} Resultado de la operación
 */
function marcarPedidosEnviados(fecha) {
  const sheet = getSheet(CONFIG.SHEETS.PEDIDOS);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const headers = values[0];
  
  // Buscar índice de las columnas necesarias
  const fechaIndex = headers.indexOf('fecha');
  const enviadoIndex = headers.indexOf('enviado');
  
  // Si no existe la columna enviado, agregarla
  if (enviadoIndex === -1) {
    // Agregar columna enviado al final
    const lastCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, lastCol).setValue('enviado');
    // Actualizar índice
    const newEnviadoIndex = lastCol - 1;
    
    // Marcar todos los pedidos de la fecha
    const fechaNormalizada = normalizeFecha(fecha);
    let marcados = 0;
    
    for (let i = 1; i < values.length; i++) {
      const fechaPedido = normalizeFecha(values[i][fechaIndex]);
      if (fechaPedido === fechaNormalizada) {
        sheet.getRange(i + 1, lastCol).setValue(true);
        marcados++;
      }
    }
    
    return { success: true, marcados: marcados, mensaje: `Se marcaron ${marcados} pedido(s) como enviados` };
  }
  
  // Si la columna ya existe, actualizar
  const fechaNormalizada = normalizeFecha(fecha);
  let marcados = 0;
  
  for (let i = 1; i < values.length; i++) {
    const fechaPedido = normalizeFecha(values[i][fechaIndex]);
    if (fechaPedido === fechaNormalizada) {
      // Solo marcar si no está ya marcado
      if (values[i][enviadoIndex] !== true) {
        sheet.getRange(i + 1, enviadoIndex + 1).setValue(true);
        marcados++;
      }
    }
  }
  
  return { success: true, marcados: marcados, mensaje: `Se marcaron ${marcados} pedido(s) como enviados` };
}

/**
 * Marca pedidos específicos como enviados por sus IDs
 * @param {Array} pedidosIds - Array de IDs de pedidos a marcar
 * @return {Object} Resultado de la operación
 */
function marcarPedidosEnviadosPorIds(pedidosIds) {
  if (!pedidosIds || !Array.isArray(pedidosIds) || pedidosIds.length === 0) {
    throw new Error('Se requiere un array de IDs de pedidos');
  }
  
  const sheet = getSheet(CONFIG.SHEETS.PEDIDOS);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const headers = values[0];
  
  // Buscar índice de las columnas necesarias
  const idIndex = headers.indexOf('id');
  const enviadoIndex = headers.indexOf('enviado');
  
  // Si no existe la columna enviado, agregarla
  if (enviadoIndex === -1) {
    const lastCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, lastCol).setValue('enviado');
    // Crear un mapa de IDs para búsqueda rápida
    const idsMap = {};
    pedidosIds.forEach(id => { idsMap[id] = true; });
    
    let marcados = 0;
    for (let i = 1; i < values.length; i++) {
      if (idsMap[values[i][idIndex]]) {
        sheet.getRange(i + 1, lastCol).setValue(true);
        marcados++;
      }
    }
    
    return { success: true, marcados: marcados, mensaje: `Se marcaron ${marcados} pedido(s) como enviados` };
  }
  
  // Si la columna ya existe, actualizar
  // Crear un mapa de IDs para búsqueda rápida
  const idsMap = {};
  pedidosIds.forEach(id => { idsMap[id] = true; });
  
  let marcados = 0;
  for (let i = 1; i < values.length; i++) {
    if (idsMap[values[i][idIndex]]) {
      // Solo marcar si no está ya marcado
      if (values[i][enviadoIndex] !== true) {
        sheet.getRange(i + 1, enviadoIndex + 1).setValue(true);
        marcados++;
      }
    }
  }
  
  return { success: true, marcados: marcados, mensaje: `Se marcaron ${marcados} pedido(s) como enviados` };
}

// ========== RECEPCIÓN ==========

function getRecepcion(fecha = null) {
  const sheet = getSheet(CONFIG.SHEETS.RECEPCION);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const recepciones = [];
  
  // Normalizar la fecha de búsqueda
  const fechaBusqueda = fecha ? normalizeFecha(fecha) : null;
  
  // OPTIMIZACIÓN: Leer una vez y crear mapas
  const productos = getProductos();
  const proveedores = getProveedores();
  
  const productosMap = {};
  productos.forEach(p => { productosMap[p.id] = p; });
  
  const proveedoresMap = {};
  proveedores.forEach(p => { proveedoresMap[p.id] = p; });
  
  for (let i = 1; i < data.length; i++) {
    // Filtrar por fecha temprano
    if (fechaBusqueda) {
      const fechaRecepcion = normalizeFecha(data[i][1]);
      if (fechaRecepcion !== fechaBusqueda) {
        continue;
      }
    }
    
    const recepcion = {};
    headers.forEach((header, index) => {
      recepcion[header] = data[i][index];
    });
    
    // Normalizar la fecha en la recepción para consistencia
    if (recepcion.fecha) {
      recepcion.fecha = normalizeFecha(recepcion.fecha);
    }
    recepcion.precio_real = normalizeAmount(recepcion.precio_real);
    
    // Búsqueda O(1)
    const producto = productosMap[recepcion.producto_id];
    recepcion.producto_nombre = producto ? producto.nombre : '';
    
    const proveedor = proveedoresMap[recepcion.proveedor_id];
    recepcion.proveedor_nombre = proveedor ? proveedor.nombre : '';
    
    recepciones.push(recepcion);
  }
  
  return recepciones;
}

function saveRecepcion(data) {
  const sheet = getSheet(CONFIG.SHEETS.RECEPCION);
  
  // Primero, obtener pedidos del día para crear recepciones si no existen
  const pedidos = getPedidos(data.fecha);
  const productos = getProductos();
  
  // Agrupar pedidos por producto (una sola pasada)
  const pedidosPorProducto = {};
  pedidos.forEach(pedido => {
    if (!pedidosPorProducto[pedido.producto_id]) {
      pedidosPorProducto[pedido.producto_id] = 0;
    }
    pedidosPorProducto[pedido.producto_id] += pedido.cantidad || 0;
  });
  
  // Leer todas las recepciones UNA sola vez y construir un índice por (fecha, producto_id)
  const fechaNormalizada = normalizeFecha(data.fecha);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const recepcionIndex = {};
  
  for (let i = 1; i < values.length; i++) {
    const fechaRecepcion = normalizeFecha(values[i][1]);
    const productoId = values[i][2];
    if (fechaRecepcion === fechaNormalizada) {
      const key = fechaNormalizada + '|' + productoId;
      // Guardar el índice de fila real en la hoja (i + 1)
      recepcionIndex[key] = i + 1;
    }
  }
  
  // Actualizar o crear recepciones en una sola pasada por los ítems
  if (data.items && data.items.length > 0) {
    data.items.forEach(item => {
      const producto = productos.find(p => p.id === item.producto_id);
      if (!producto) return;
      
      const key = fechaNormalizada + '|' + item.producto_id;
      const rowIndex = recepcionIndex[key] || null;
      
      if (rowIndex) {
        // Actualizar fila existente
        sheet.getRange(rowIndex, 6).setValue(item.llego || 0);
        sheet.getRange(rowIndex, 7).setValue(normalizeAmount(item.precio_real));
      } else {
        // Crear nueva fila
        const id = generateId();
        const newRow = [
          id,
          data.fecha,
          item.producto_id,
          producto.proveedor_default || '',
          pedidosPorProducto[item.producto_id] || 0,
          item.llego || 0,
          normalizeAmount(item.precio_real),
          false
        ];
        sheet.appendRow(newRow);
      }
    });
  }
  
  return { success: true };
}

function findRecepcion(fecha, productoId) {
  const sheet = getSheet(CONFIG.SHEETS.RECEPCION);
  const data = sheet.getDataRange().getValues();
  
  // Normalizar la fecha de búsqueda
  const fechaBusqueda = normalizeFecha(fecha);
  
  for (let i = 1; i < data.length; i++) {
    const fechaRecepcion = normalizeFecha(data[i][1]);
    if (fechaRecepcion === fechaBusqueda && data[i][2] === productoId) {
      return { rowIndex: i + 1, data: data[i] };
    }
  }
  
  return null;
}

function confirmarRecepcion(fecha) {
  const sheet = getSheet(CONFIG.SHEETS.RECEPCION);
  const data = sheet.getDataRange().getValues();
  
  // Normalizar la fecha de búsqueda
  const fechaBusqueda = normalizeFecha(fecha);
  
  for (let i = 1; i < data.length; i++) {
    const fechaRecepcion = normalizeFecha(data[i][1]);
    if (fechaRecepcion === fechaBusqueda) {
      sheet.getRange(i + 1, 8).setValue(true);
    }
  }
  
  return { success: true };
}

// ========== PRECIOS CLIENTE ==========

function getPreciosCliente(fecha = null) {
  const sheet = getSheet(CONFIG.SHEETS.PRECIOS_CLIENTE);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const precios = [];
  
  // Normalizar la fecha de búsqueda
  const fechaBusqueda = fecha ? normalizeFecha(fecha) : null;
  
  // OPTIMIZACIÓN: Crear mapas
  const clientes = getClientes();
  const productos = getProductos();
  
  const clientesMap = {};
  clientes.forEach(c => { clientesMap[c.id] = c; });
  
  const productosMap = {};
  productos.forEach(p => { productosMap[p.id] = p; });
  
  for (let i = 1; i < data.length; i++) {
    // Filtrar por fecha temprano
    if (fechaBusqueda) {
      const fechaPrecio = normalizeFecha(data[i][1]);
      if (fechaPrecio !== fechaBusqueda) {
        continue;
      }
    }
    
    const precio = {};
    headers.forEach((header, index) => {
      precio[header] = data[i][index];
    });
    
    // Normalizar la fecha en el precio para consistencia
    if (precio.fecha) {
      precio.fecha = normalizeFecha(precio.fecha);
    }
    precio.precio_cliente = normalizeAmount(precio.precio_cliente);
    
    // Búsqueda O(1)
    const cliente = clientesMap[precio.cliente_id];
    precio.cliente_nombre = cliente ? cliente.nombre : '';
    
    const producto = productosMap[precio.producto_id];
    precio.producto_nombre = producto ? producto.nombre : '';
    
    precios.push(precio);
  }
  
  return precios;
}

function savePreciosCliente(data) {
  const sheet = getSheet(CONFIG.SHEETS.PRECIOS_CLIENTE);
  
  // Normalizar fecha una sola vez
  const fechaNormalizada = normalizeFecha(data.fecha);
  
  // Leer todos los precios existentes y construir un índice por (fecha, cliente_id, producto_id)
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const preciosIndex = {};
  
  for (let i = 1; i < values.length; i++) {
    const fechaPrecio = normalizeFecha(values[i][1]);
    const clienteId = values[i][2];
    const productoId = values[i][3];
    
    const key = fechaPrecio + '|' + clienteId + '|' + productoId;
    preciosIndex[key] = i + 1; // índice de fila real
  }
  
  // Procesar todos los items en una sola pasada
  data.items.forEach(item => {
    const key = fechaNormalizada + '|' + item.cliente_id + '|' + item.producto_id;
    const rowIndex = preciosIndex[key] || null;
    const precioCliente = normalizeAmount(item.precio_cliente);
    
    if (rowIndex) {
      // Actualizar precio existente
      sheet.getRange(rowIndex, 6).setValue(precioCliente);
    } else {
      // Crear nuevo registro
      const id = generateId();
      const newRow = [
        id,
        data.fecha,
        item.cliente_id,
        item.producto_id,
        item.cantidad || 0,
        precioCliente
      ];
      sheet.appendRow(newRow);
    }
  });
  
  return { success: true };
}

function findPrecioCliente(fecha, clienteId, productoId) {
  const sheet = getSheet(CONFIG.SHEETS.PRECIOS_CLIENTE);
  const data = sheet.getDataRange().getValues();
  
  // Normalizar la fecha de búsqueda
  const fechaBusqueda = normalizeFecha(fecha);
  
  for (let i = 1; i < data.length; i++) {
    const fechaPrecio = normalizeFecha(data[i][1]);
    if (fechaPrecio === fechaBusqueda && data[i][2] === clienteId && data[i][3] === productoId) {
      return { rowIndex: i + 1, data: data[i] };
    }
  }
  
  return null;
}

// ========== CIERRE DÍA ==========

function cerrarDia(fecha) {
  const startTime = new Date().getTime();
  try {
    // Validar que la fecha esté presente
    if (!fecha || fecha === 'undefined' || fecha === 'null') {
      throw new Error('Fecha inválida o no proporcionada para el cierre del día');
    }
    
    Logger.log('🔄 [CIERRE] Iniciando cierre del día para fecha: ' + fecha);
    Logger.log('🔄 [CIERRE] Timestamp inicio: ' + new Date().toISOString());
    
    // Validar que todo esté completo
    Logger.log('📋 [CIERRE] Obteniendo recepciones...');
    const recepciones = getRecepcion(fecha);
    Logger.log('✅ [CIERRE] Recepciones obtenidas: ' + recepciones.length);
    
    Logger.log('💰 [CIERRE] Obteniendo precios cliente...');
    const precios = getPreciosCliente(fecha);
    Logger.log('✅ [CIERRE] Precios obtenidos: ' + precios.length);
    
    // Validar recepciones
    Logger.log('🔍 [CIERRE] Validando recepciones...');
    const recepcionesIncompletas = recepciones.filter(r => 
      !r.confirmado || !r.precio_real || r.llego === null
    );
    
    if (recepcionesIncompletas.length > 0) {
      Logger.log('❌ [CIERRE] Recepciones incompletas encontradas: ' + recepcionesIncompletas.length);
      throw new Error('Hay recepciones sin confirmar o incompletas');
    }
    Logger.log('✅ [CIERRE] Todas las recepciones están completas');
    
    // Validar precios cliente
    Logger.log('🔍 [CIERRE] Validando precios cliente...');
    const pedidos = getPedidos(fecha);
    const preciosFaltantes = pedidos.filter(p => {
      const precio = precios.find(pr => 
        pr.cliente_id === p.cliente_id && pr.producto_id === p.producto_id
      );
      return !precio || !precio.precio_cliente;
    });
    
    if (preciosFaltantes.length > 0) {
      Logger.log('❌ [CIERRE] Precios faltantes encontrados: ' + preciosFaltantes.length);
      throw new Error('Faltan precios cliente para algunos productos');
    }
    Logger.log('✅ [CIERRE] Todos los precios están completos');
    
    // Generar cobranzas por cliente
    Logger.log('💵 [CIERRE] Generando cobranzas...');
    try {
      generarCobranzas(fecha);
      Logger.log('✅ [CIERRE] Cobranzas generadas');
    } catch (cobranzasError) {
      Logger.log('❌ [CIERRE] Error generando cobranzas: ' + cobranzasError.toString());
      throw new Error('Error al generar cobranzas: ' + cobranzasError.toString());
    }
    
    // Actualizar stock de bebidas
    Logger.log('📦 [CIERRE] Actualizando stock de bebidas...');
    try {
      actualizarStockBebidas(fecha);
      Logger.log('✅ [CIERRE] Stock actualizado');
    } catch (stockError) {
      Logger.log('❌ [CIERRE] Error actualizando stock: ' + stockError.toString());
      throw new Error('Error al actualizar stock: ' + stockError.toString());
    }
    
    // Registrar cierre
    Logger.log('📝 [CIERRE] Registrando cierre...');
    try {
      const sheet = getSheet(CONFIG.SHEETS.CIERRE_DIA);
      const id = generateId();
      sheet.appendRow([id, fecha, 'cerrado', '']);
      Logger.log('✅ [CIERRE] Cierre registrado con ID: ' + id);
    } catch (cierreError) {
      Logger.log('❌ [CIERRE] Error registrando cierre: ' + cierreError.toString());
      throw new Error('Error al registrar cierre: ' + cierreError.toString());
    }
    
    // Registrar movimientos de caja
    Logger.log('💰 [CIERRE] Registrando movimientos de caja...');
    try {
      registrarMovimientosCaja(fecha);
      Logger.log('✅ [CIERRE] Movimientos de caja registrados');
    } catch (cajaError) {
      Logger.log('❌ [CIERRE] Error registrando movimientos de caja: ' + cajaError.toString());
      // No lanzar error aquí, es opcional
    }
    
    const elapsed = ((new Date().getTime() - startTime) / 1000).toFixed(2);
    Logger.log('🎉 [CIERRE] Cierre del día completado exitosamente en ' + elapsed + ' segundos');
    return { success: true, message: 'Día cerrado correctamente', tiempo: elapsed + 's' };
    
  } catch (error) {
    const elapsed = ((new Date().getTime() - startTime) / 1000).toFixed(2);
    Logger.log('❌ [CIERRE] Error en cerrarDia después de ' + elapsed + ' segundos');
    Logger.log('❌ [CIERRE] Error: ' + error.toString());
    Logger.log('❌ [CIERRE] Stack trace: ' + (error.stack || 'No disponible'));
    throw error; // Re-lanzar el error para que se maneje en handleRequest
  }
}

function generarCobranzas(fecha) {
  const precios = getPreciosCliente(fecha);
  const clientes = getClientes();
  const sheet = getSheet(CONFIG.SHEETS.COBRANZAS);
  
  // Agrupar por cliente
  const cobranzasPorCliente = {};
  
  precios.forEach(precio => {
    if (!cobranzasPorCliente[precio.cliente_id]) {
      cobranzasPorCliente[precio.cliente_id] = {
        cliente_id: precio.cliente_id,
        total: 0
      };
    }
    const cantidad = parseFloat(precio.cantidad) || 0;
    const precioCliente = normalizeAmount(precio.precio_cliente);
    cobranzasPorCliente[precio.cliente_id].total += Math.round(cantidad * precioCliente);
  });
  
  // Crear cobranzas
  Object.keys(cobranzasPorCliente).forEach(clienteId => {
    const cobranza = cobranzasPorCliente[clienteId];
    const id = generateId();
    sheet.appendRow([
      id,
      fecha,
      clienteId,
      cobranza.total,
      0,
      cobranza.total,
      'pendiente'
    ]);
  });
}

function actualizarStockBebidas(fecha) {
  const recepciones = getRecepcion(fecha);
  const productos = getProductos();
  const stockSheet = getSheet(CONFIG.SHEETS.STOCK_BEBIDAS);
  
  // Leer stock actual UNA sola vez y construir un índice por producto_id
  const stockData = stockSheet.getDataRange().getValues();
  const stockIndex = {};
  
  for (let i = 1; i < stockData.length; i++) {
    const productoId = stockData[i][0];
    stockIndex[productoId] = {
      rowIndex: i + 1,
      stockActual: stockData[i][1] || 0,
      minimo: stockData[i][2] || 10
    };
  }
  
  recepciones.forEach(recepcion => {
    const producto = productos.find(p => p.id === recepcion.producto_id);
    if (producto && producto.tipo === 'bebida' && recepcion.confirmado) {
      const productoId = recepcion.producto_id;
      const cantidadLlego = recepcion.llego || 0;
      
      if (stockIndex[productoId]) {
        // Actualizar stock existente sin volver a leer toda la hoja
        const info = stockIndex[productoId];
        const nuevoStock = info.stockActual + cantidadLlego;
        stockSheet.getRange(info.rowIndex, 2).setValue(nuevoStock);
        // Actualizar cache local por si hay varias recepciones del mismo producto
        info.stockActual = nuevoStock;
      } else {
        // Crear registro nuevo para este producto
        stockSheet.appendRow([productoId, cantidadLlego, 10]);
        // También actualizar índice local
        const lastRow = stockSheet.getLastRow();
        stockIndex[productoId] = {
          rowIndex: lastRow,
          stockActual: cantidadLlego,
          minimo: 10
        };
      }
    }
  });
}

function registrarMovimientosCaja(fecha) {
  // Esto se puede expandir según necesidades
}

function getCierres() {
  const sheet = getSheet(CONFIG.SHEETS.CIERRE_DIA);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const cierres = [];
  
  for (let i = 1; i < data.length; i++) {
    const cierre = {};
    headers.forEach((header, index) => {
      cierre[header] = data[i][index];
    });
    cierres.push(cierre);
  }
  
  return cierres.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

// ========== COBRANZAS ==========

function getCobranzas(fecha = null, clienteId = null) {
  const sheet = getSheet(CONFIG.SHEETS.COBRANZAS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const cobranzas = [];
  
  // Normalizar la fecha de búsqueda
  const fechaBusqueda = fecha ? normalizeFecha(fecha) : null;
  
  // OPTIMIZACIÓN: Crear mapa
  const clientes = getClientes();
  const clientesMap = {};
  clientes.forEach(c => { clientesMap[c.id] = c; });
  
  for (let i = 1; i < data.length; i++) {
    // Filtrar temprano
    let cumpleFiltros = true;
    
    if (fechaBusqueda) {
      const fechaCobranza = normalizeFecha(data[i][1]);
      if (fechaCobranza !== fechaBusqueda) {
        cumpleFiltros = false;
      }
    }
    
    if (clienteId && data[i][2] !== clienteId) {
      cumpleFiltros = false;
    }
    
    if (!cumpleFiltros) {
      continue;
    }
    
    const cobranza = {};
    headers.forEach((header, index) => {
      cobranza[header] = data[i][index];
    });
    
    // Normalizar la fecha en la cobranza para consistencia
    if (cobranza.fecha) {
      cobranza.fecha = normalizeFecha(cobranza.fecha);
    }
    cobranza.total = normalizeAmount(cobranza.total);
    cobranza.pagado = normalizeAmount(cobranza.pagado);
    cobranza.saldo = normalizeAmount(cobranza.saldo);
    
    // Búsqueda O(1)
    const cliente = clientesMap[cobranza.cliente_id];
    cobranza.cliente_nombre = cliente ? cliente.nombre : '';
    
    cobranzas.push(cobranza);
  }
  
  return cobranzas;
}

function registrarCobro(data) {
  const sheet = getSheet(CONFIG.SHEETS.COBRANZAS);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const monto = normalizeAmount(data.monto);
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.cobranza_id) {
      const pagado = normalizeAmount(values[i][4]);
      const total = normalizeAmount(values[i][3]);
      const nuevoPagado = pagado + monto;
      const nuevoSaldo = total - nuevoPagado;
      
      sheet.getRange(i + 1, 5).setValue(nuevoPagado);
      sheet.getRange(i + 1, 6).setValue(nuevoSaldo);
      
      if (nuevoSaldo <= 0) {
        sheet.getRange(i + 1, 7).setValue('pagado');
      }
      
      // Registrar en caja
      const cajaSheet = getSheet(CONFIG.SHEETS.CAJA_MOVIMIENTOS);
      const id = generateId();
      cajaSheet.appendRow([
        id,
        data.fecha,
        'ingreso',
        monto,
        'Cobranza',
        data.cobranza_id
      ]);
      
      return { success: true };
    }
  }
  
  throw new Error('Cobranza no encontrada');
}

// ========== PAGOS PROVEEDORES ==========

function getPagosProveedores() {
  const sheet = getSheet(CONFIG.SHEETS.PAGOS_PROVEEDORES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const pagos = [];
  
  for (let i = 1; i < data.length; i++) {
    const pago = {};
    headers.forEach((header, index) => {
      pago[header] = data[i][index];
    });
    pago.monto = normalizeAmount(pago.monto);
    pagos.push(pago);
  }
  
  return pagos;
}

function registrarPago(data) {
  const sheet = getSheet(CONFIG.SHEETS.PAGOS_PROVEEDORES);
  const id = generateId();
  const monto = normalizeAmount(data.monto);
  
  sheet.appendRow([
    id,
    data.fecha || new Date().toISOString().split('T')[0],
    data.proveedor_id,
    monto,
    data.metodo || 'efectivo',
    data.nota || ''
  ]);
  
  // Registrar en caja
  const cajaSheet = getSheet(CONFIG.SHEETS.CAJA_MOVIMIENTOS);
  const cajaId = generateId();
  cajaSheet.appendRow([
    cajaId,
    data.fecha,
    'egreso',
    monto,
    'Pago a proveedor',
    data.proveedor_id
  ]);
  
  return { id: id, ...data, monto: monto };
}

// ========== STOCK ==========

function getStock() {
  const sheet = getSheet(CONFIG.SHEETS.STOCK_BEBIDAS);
  const data = sheet.getDataRange().getValues();
  const productosPorId = {};
  getProductos().forEach(p => { productosPorId[p.id] = p; });
  const stock = [];
  
  for (let i = 1; i < data.length; i++) {
    const producto = productosPorId[data[i][0]];
    if (producto) {
      stock.push({
        producto_id: data[i][0],
        producto_nombre: producto.nombre,
        stock_actual: data[i][1] || 0,
        minimo: data[i][2] || 10
      });
    }
  }
  
  return stock;
}

function updateStock(data) {
  const sheet = getSheet(CONFIG.SHEETS.STOCK_BEBIDAS);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.producto_id) {
      sheet.getRange(i + 1, 2).setValue(data.cantidad);
      return { success: true };
    }
  }
  
  // Si no existe, crear
  sheet.appendRow([data.producto_id, data.cantidad, 10]);
  return { success: true };
}

function deleteStock(productoId) {
  const sheet = getSheet(CONFIG.SHEETS.STOCK_BEBIDAS);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === productoId) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  
  throw new Error('Registro de stock no encontrado');
}

// ========== CAJA ==========

function getCajaMovimientos() {
  const sheet = getSheet(CONFIG.SHEETS.CAJA_MOVIMIENTOS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const movimientos = [];
  
  for (let i = 1; i < data.length; i++) {
    const movimiento = {};
    headers.forEach((header, index) => {
      movimiento[header] = data[i][index];
    });
    movimiento.monto = normalizeAmount(movimiento.monto);
    movimientos.push(movimiento);
  }
  
  return movimientos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

function createCajaMovimiento(data) {
  const sheet = getSheet(CONFIG.SHEETS.CAJA_MOVIMIENTOS);
  const id = generateId();
  const monto = normalizeAmount(data.monto);
  
  sheet.appendRow([
    id,
    data.fecha || new Date().toISOString().split('T')[0],
    data.tipo,
    monto,
    data.nota || '',
    data.referencia || ''
  ]);
  
  return { id: id, ...data, monto: monto };
}

// ========== HISTORIAL ==========

function getHistorial() {
  return getCierres();
}

function deleteHistorial(id) {
  const sheet = getSheet(CONFIG.SHEETS.CIERRE_DIA);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  
  throw new Error('Registro de historial no encontrado');
}

// ========== FUNCIONES DE PRUEBA ==========

/**
 * Función de prueba - verifica que el script puede acceder a la hoja y funciones básicas
 * Para usar: Selecciona esta función en el menú y haz clic en "Ejecutar"
 */
function testConexion() {
  try {
    Logger.log('🧪 Iniciando prueba de conexión...');
    
    // Probar obtener la hoja de cálculo
    const ss = getSpreadsheet();
    Logger.log('✅ Conexión exitosa! Spreadsheet: ' + ss.getName());
    
    // Probar obtener una hoja
    const sheet = getSheet('Clientes');
    Logger.log('✅ Hoja "Clientes" encontrada');
    
    // Probar leer datos (puede estar vacío, eso está bien)
    const clientes = getClientes();
    Logger.log('✅ Clientes obtenidos: ' + clientes.length + ' registros');
    
    // Probar obtener productos
    const productos = getProductos();
    Logger.log('✅ Productos obtenidos: ' + productos.length + ' registros');
    
    // Probar obtener proveedores
    const proveedores = getProveedores();
    Logger.log('✅ Proveedores obtenidos: ' + proveedores.length + ' registros');
    
    Logger.log('🎉 ¡Todas las pruebas pasaron correctamente!');
    return '✅ Todo funcionando correctamente!';
  } catch (error) {
    Logger.log('❌ Error en la prueba: ' + error.toString());
    Logger.log('Stack trace: ' + error.stack);
    return '❌ Error: ' + error.toString();
  }
}

/**
 * Función de prueba - verifica que la API responde correctamente
 * Simula una petición GET simple
 */
function testAPIKey() {
  try {
    const testRequest = {
      parameter: {
        endpoint: 'clientes',
        apiKey: CONFIG.API_KEY
      },
      postData: null
    };
    
    const response = handleRequest(testRequest, 'GET');
    Logger.log('✅ API Key válida');
    Logger.log('Respuesta: ' + response.getContent());
    return '✅ API Key funciona correctamente';
  } catch (error) {
    Logger.log('❌ Error probando API Key: ' + error.toString());
    Logger.log('Stack trace: ' + error.stack);
    return '❌ Error: ' + error.toString();
  }
}

// ========== NOTIFICACIONES ==========

/**
 * Ejecuta una función con reintentos ante fallos transitorios de Google
 * (ej: "a server error occurred")
 */
function ejecutarConReintentos(fn, maxIntentos, pausaMs) {
  maxIntentos = maxIntentos || 3;
  pausaMs = pausaMs || 3000;
  let ultimoError = null;
  
  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      return fn();
    } catch (error) {
      ultimoError = error;
      const msg = error.toString();
      const esTransitorio = /server error|timed out|timeout|rate limit|too many|service unavailable|try again/i.test(msg);
      Logger.log(`⚠️ Intento ${intento}/${maxIntentos} falló: ${msg}`);
      if (!esTransitorio || intento === maxIntentos) {
        throw error;
      }
      Utilities.sleep(pausaMs * intento);
    }
  }
  
  throw ultimoError;
}

/**
 * Obtiene la configuración de notificaciones
 */
function getConfiguracionNotificaciones() {
  const sheet = getSheet(CONFIG.SHEETS.CONFIGURACION);
  const data = sheet.getDataRange().getValues();
  const config = {};
  
  // Convertir datos a objeto
  for (let i = 1; i < data.length; i++) {
    const clave = data[i][0];
    let valor = data[i][1];
    
    // Convertir strings booleanos a booleanos
    if (valor === 'true') valor = true;
    if (valor === 'false') valor = false;
    
    config[clave] = valor;
  }
  
  // Valores por defecto si no existen
  if (!config.email_notificaciones) {
    config.email_notificaciones = CONFIG.DEFAULT_EMAIL;
  }
  if (config.notificaciones_activas === undefined) {
    config.notificaciones_activas = true;
  }
  if (!config.hora_verificacion) {
    config.hora_verificacion = '09:00';
  }
  
  return config;
}

/**
 * Guarda la configuración de notificaciones
 */
function saveConfiguracionNotificaciones(data) {
  const sheet = getSheet(CONFIG.SHEETS.CONFIGURACION);
  const existingData = sheet.getDataRange().getValues();
  
  // Actualizar valores existentes
  Object.keys(data).forEach(clave => {
    let found = false;
    
    for (let i = 1; i < existingData.length; i++) {
      if (existingData[i][0] === clave) {
        sheet.getRange(i + 1, 2).setValue(data[clave]);
        found = true;
        break;
      }
    }
    
    // Si no existe, agregarlo
    if (!found) {
      sheet.appendRow([clave, data[clave]]);
    }
  });
  
  return { success: true };
}

/**
 * Verifica el stock bajo y envía notificaciones por email
 */
function verificarStockBajo() {
  try {
    // Obtener configuración
    const config = getConfiguracionNotificaciones();
    
    if (!config.notificaciones_activas) {
      Logger.log('⚠️ Notificaciones desactivadas');
      return { success: false, message: 'Notificaciones desactivadas' };
    }
    
    // Obtener stock
    const stock = getStock();
    
    // Filtrar productos con stock bajo
    const stockBajo = stock.filter(item => item.stock_actual <= item.minimo);
    
    if (stockBajo.length === 0) {
      Logger.log('✅ No hay productos con stock bajo');
      return { success: true, message: 'No hay productos con stock bajo', productos: [] };
    }
    
    // Enviar email de notificación
    enviarEmailStockBajo(stockBajo, config.email_notificaciones);
    
    Logger.log(`📧 Email enviado a ${config.email_notificaciones} con ${stockBajo.length} producto(s) con stock bajo`);
    
    return { 
      success: true, 
      message: `Se encontraron ${stockBajo.length} producto(s) con stock bajo`,
      productos: stockBajo
    };
  } catch (error) {
    Logger.log('❌ Error verificando stock: ' + error.toString());
    throw error;
  }
}

/**
 * Envía un email con la lista de productos con stock bajo
 * @param {Array} productos - Lista de productos con stock bajo (requerido)
 * @param {string} destinatario - Email(s) destino, separados por coma
 */
function enviarEmailStockBajo(productos, destinatario) {
  try {
    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      throw new Error(
        'Sin productos para notificar. No ejecutes enviarEmailStockBajo() sola: ' +
        'usá testNotificaciones() o verificarStockBajo() desde el editor.'
      );
    }
    
    // Validar que hay un email de destinatario
    if (!destinatario || destinatario === '') {
      destinatario = CONFIG.DEFAULT_EMAIL;
    }
    
    // Limpiar y procesar múltiples emails
    // Si hay múltiples emails separados por comas, limpiar espacios extra
    const destinatarioStr = String(destinatario);
    const emailsLimpios = destinatarioStr.split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0)
      .join(', ');
    
    if (!emailsLimpios) {
      throw new Error('No hay email de destino configurado en la hoja Configuracion.');
    }
    
    // Construir mensaje HTML
    const fecha = new Date().toLocaleDateString('es-AR');
    
    let html = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; }
            .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .alert { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #343a40; color: white; padding: 12px; text-align: left; }
            td { padding: 10px; border-bottom: 1px solid #ddd; }
            tr:hover { background-color: #f5f5f5; }
            .bajo { color: #dc3545; font-weight: bold; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>⚠️ Alerta de Stock Bajo</h1>
            <p>Luciano Cargas - Sistema de Gestión</p>
          </div>
          <div class="content">
            <div class="alert">
              <strong>Atención:</strong> Se detectaron ${productos.length} producto(s) con stock bajo o crítico.
            </div>
            <p><strong>Fecha:</strong> ${fecha}</p>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Stock Actual</th>
                  <th>Stock Mínimo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
    `;
    
    productos.forEach(producto => {
      const estado = producto.stock_actual === 0 ? 'AGOTADO' : 'BAJO';
      html += `
        <tr>
          <td>${producto.producto_nombre}</td>
          <td class="bajo">${producto.stock_actual}</td>
          <td>${producto.minimo}</td>
          <td class="bajo">${estado}</td>
        </tr>
      `;
    });
    
    html += `
              </tbody>
            </table>
            <div class="footer">
              <p>Este es un mensaje automático del Sistema de Gestión de Luciano Cargas.</p>
              <p>Por favor, no responder a este email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
    
    // Enviar email
    const asunto = `⚠️ Alerta: ${productos.length} producto(s) con stock bajo - ${fecha}`;
    
    MailApp.sendEmail({
      to: emailsLimpios,
      subject: asunto,
      htmlBody: html
    });
    
    // Contar cuántos destinatarios hay
    const cantidadDestinatarios = emailsLimpios.split(',').length;
    Logger.log(`✅ Email enviado exitosamente a ${cantidadDestinatarios} destinatario(s): ${emailsLimpios}`);
    
  } catch (error) {
    Logger.log('❌ Error enviando email: ' + error.toString());
    throw new Error('Error enviando email: ' + error.toString());
  }
}

/**
 * Función que debe ser configurada como Trigger para verificación automática
 * Se ejecuta automáticamente según la configuración del trigger
 * 
 * Para configurar:
 * 1. En el editor de Google Apps Script, ve a Triggers (ícono de reloj en el menú izquierdo)
 * 2. Click en "+ Agregar Trigger"
 * 3. Selecciona: verificarStockBajoProgramado
 * 4. Tipo de evento: Basado en tiempo
 * 5. Tipo de activador de tiempo: Activador de día
 * 6. Hora del día: Selecciona la hora deseada (ej: 8 a 9 a.m.)
 * 7. Guarda el trigger
 */
function verificarStockBajoProgramado() {
  Logger.log('🔔 Ejecutando verificación programada de stock...');
  try {
    const resultado = ejecutarConReintentos(function() {
      return verificarStockBajo();
    }, 3, 4000);
    Logger.log('✅ Verificación programada OK: ' + JSON.stringify(resultado));
  } catch (error) {
    Logger.log('❌ Verificación programada falló tras reintentos: ' + error.toString());
    Logger.log(error.stack || '');
    // No relanzar: evita emails de error de Google por fallos transitorios puntuales
  }
}

/**
 * Función de prueba para el sistema de notificaciones
 * Para probar: Ejecuta esta función desde el editor de Google Apps Script
 */
function testNotificaciones() {
  try {
    Logger.log('🧪 Probando sistema de notificaciones...');
    
    const config = getConfiguracionNotificaciones();
    Logger.log('📧 Email configurado: ' + config.email_notificaciones);
    Logger.log('✅ Notificaciones activas: ' + config.notificaciones_activas);
    
    const resultado = verificarStockBajo();
    Logger.log('Resultado: ' + JSON.stringify(resultado));
    
    return '✅ Prueba completada. Revisa el log para más detalles.';
  } catch (error) {
    Logger.log('❌ Error en prueba: ' + error.toString());
    return '❌ Error: ' + error.toString();
  }
}

// ========== ESTADÍSTICAS ==========

/**
 * Obtiene los productos más vendidos en los últimos X días
 * @param {number} dias - Número de días a analizar (por defecto 7)
 * @param {number} limite - Cantidad de productos a retornar (por defecto 5)
 * @return {Array} Array de productos con su cantidad vendida
 */
function getTopProductosVendidos(dias = 7, limite = 5) {
  try {
    const sheet = getSheet(CONFIG.SHEETS.PEDIDOS);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Calcular fecha límite (hace X días)
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - dias);
    
    // Obtener productos para los nombres
    const productos = getProductos();
    const productosMap = {};
    productos.forEach(p => { productosMap[p.id] = p; });
    
    // Encontrar índices de las columnas necesarias
    const productoIdIndex = headers.indexOf('producto_id');
    const cantidadIndex = headers.indexOf('cantidad');
    const fechaIndex = headers.indexOf('fecha');
    
    // Contador de productos vendidos
    const contadorProductos = {};
    
    // Recorrer todos los pedidos
    for (let i = 1; i < data.length; i++) {
      const fechaPedido = data[i][fechaIndex];
      
      // Verificar si el pedido está dentro del rango de fechas
      let fechaPedidoDate;
      if (typeof fechaPedido === 'string') {
        // Formato 'YYYY-MM-DD'
        const partes = fechaPedido.split('-');
        fechaPedidoDate = new Date(partes[0], partes[1] - 1, partes[2]);
      } else {
        fechaPedidoDate = new Date(fechaPedido);
      }
      
      if (fechaPedidoDate >= fechaLimite) {
        const productoId = data[i][productoIdIndex];
        if (!productoId || !productosMap[productoId]) continue;

        const cantidad = parseFloat(data[i][cantidadIndex]) || 0;
        if (!contadorProductos[productoId]) {
          contadorProductos[productoId] = 0;
        }
        contadorProductos[productoId] += cantidad;
      }
    }
    
    // Convertir a array y ordenar por cantidad
    const productosArray = [];
    for (let productoId in contadorProductos) {
      const producto = productosMap[productoId];
      if (producto) {
        productosArray.push({
          id: productoId,
          nombre: producto.nombre,
          cantidad: contadorProductos[productoId]
        });
      }
    }
    
    // Ordenar descendente por cantidad y tomar los primeros 'limite'
    productosArray.sort((a, b) => b.cantidad - a.cantidad);
    
    return productosArray.slice(0, limite);
    
  } catch (error) {
    Logger.log('❌ Error en getTopProductosVendidos: ' + error.toString());
    throw error;
  }
}

/**
 * ============================================
 * AUTENTICACIÓN
 * ============================================
 */

/**
 * Maneja el login de usuarios
 * @param {string} email - Email del usuario
 * @param {string} password - Contraseña del usuario
 * @return {Object} Resultado del login con token si es exitoso
 */
function handleLogin(email, password) {
  try {
    Logger.log('🔐 Intento de login para: ' + email);
    
    // Validar que email y password existan
    if (!email || !password) {
      return {
        success: false,
        error: 'Email y contraseña son requeridos'
      };
    }
    
    // Normalizar email (lowercase y trim)
    email = email.toLowerCase().trim();
    
    // Verificar si el usuario existe en CONFIG.USERS
    if (!CONFIG.USERS[email]) {
      Logger.log('❌ Usuario no encontrado: ' + email);
      return {
        success: false,
        error: 'Credenciales inválidas'
      };
    }
    
    // Verificar contraseña
    if (CONFIG.USERS[email] !== password) {
      Logger.log('❌ Contraseña incorrecta para: ' + email);
      return {
        success: false,
        error: 'Credenciales inválidas'
      };
    }
    
    // Login exitoso - generar token simple
    const token = Utilities.base64Encode(email + ':' + new Date().getTime());
    
    Logger.log('✅ Login exitoso para: ' + email);
    
    return {
      success: true,
      token: token,
      email: email,
      message: 'Login exitoso'
    };
    
  } catch (error) {
    Logger.log('❌ Error en handleLogin: ' + error.toString());
    return {
      success: false,
      error: 'Error en el servidor. Intenta nuevamente.'
    };
  }
}

