/**
 * Luciano Cargas - Google Apps Script API
 * Sistema de gestión de pedidos, proveedores, cobranzas y stock
 */

// Configuración
const CONFIG = {
  API_KEY: 'TMiToken89899', // Token de seguridad
  SHEETS: {
    CLIENTES: 'Clientes',
    PROVEEDORES: 'Proveedores',
    PRODUCTOS: 'Productos',
    PEDIDOS: 'Pedidos',
    CAMIONES: 'Camiones',
    RECEPCION: 'Recepcion',
    PRECIOS_CLIENTE: 'PreciosCliente',
    CIERRE_DIA: 'CierreDia',
    COBRANZAS: 'Cobranzas',
    PAGOS_PROVEEDORES: 'PagosProveedores',
    DEUDAS_PROVEEDORES: 'DeudasProveedores',
    CAJA_MOVIMIENTOS: 'CajaMovimientos',
    STOCK_BEBIDAS: 'StockBebidas',
    CONFIGURACION: 'Configuracion'
  },
  // Las alertas de stock NO tienen email por defecto: cada usuario pone el suyo en
  // "Configurar notificaciones". Sin email no se envía nada.
  DEFAULT_EMAIL: '',
  
  // USUARIOS AUTORIZADOS. Cada usuario trabaja con SU PROPIA hoja de cálculo:
  // nadie ve los clientes, pedidos ni cobros de otro.
  //  - spreadsheetId: la hoja de ese usuario. Si queda vacío, se crea sola la primera vez que entra.
  //  - Los datos que ya existían (la hoja de siempre) son de Nicol. Kevin arranca con una hoja nueva y vacía.
  USERS: {
    'kevindurtes792@gmail.com': { password: 'kevinpassword123', spreadsheetId: '' },
    'nicolirina.rosascharny@gmail.com': { password: 'nicolpassword456', spreadsheetId: '18G5wDNgnsSu4saWGQu4m-B0XF6oJ5oRrSPLl7zMVJVY' },
    // Equipo de Luciano Cargas: trabajan sobre la misma hoja que Nicol (ven y cargan los mismos datos).
    'lau.alvarez1601@gmail.com': { password: 'Crdkps-8553', spreadsheetId: '18G5wDNgnsSu4saWGQu4m-B0XF6oJ5oRrSPLl7zMVJVY' },
    'deniserosas153@gmail.com': { password: 'Fsjpdb-8346', spreadsheetId: '18G5wDNgnsSu4saWGQu4m-B0XF6oJ5oRrSPLl7zMVJVY' },
    'cargasluciano@gmail.com': { password: 'Nawfrn-8976', spreadsheetId: '18G5wDNgnsSu4saWGQu4m-B0XF6oJ5oRrSPLl7zMVJVY' },
    'sarmientolucasfacundo@gmail.com': { password: 'Nxqxfb-9797', spreadsheetId: '18G5wDNgnsSu4saWGQu4m-B0XF6oJ5oRrSPLl7zMVJVY' }
  }
};

// Cuánto espera una escritura su turno (el cliente corta a los 30 s).
const LOCK_WAIT_MS = 20000;

/**
 * Contador que sube con cada escritura. El navegador lo compara para saber
 * si otra persona cambió algo y así refrescar lo que muestra.
 */
function getDataVersion_() {
  return Number(PropertiesService.getScriptProperties().getProperty('DATA_VERSION_' + tenantClave_())) || 0;
}

function bumpDataVersion_() {
  var props = PropertiesService.getScriptProperties();
  var key = 'DATA_VERSION_' + tenantClave_();
  props.setProperty(key, String((Number(props.getProperty(key)) || 0) + 1));
}

// ========== USUARIOS: cada uno con su hoja y su sesión firmada ==========

const SESION_DURACION_MS = 30 * 24 * 60 * 60 * 1000;

/** Usuario y hoja con los que corre esta ejecución. */
let _tenant = null;

function usuarioConfig_(email) {
  var u = CONFIG.USERS[email];
  if (!u) return null;
  return typeof u === 'string' ? { password: u, spreadsheetId: '' } : u;
}

function tenantClave_() {
  if (!_tenant) throw new Error('No hay un usuario identificado para esta operación');
  return _tenant.clave;
}

/** Hoja de cálculo del usuario; si todavía no tiene, se crea (una sola vez). */
function resolverHojaDeUsuario_(email) {
  var cfg = usuarioConfig_(email);
  if (!cfg) throw new Error('Usuario desconocido');
  if (cfg.spreadsheetId) return cfg.spreadsheetId;

  var props = PropertiesService.getScriptProperties();
  var key = 'SS_ID_' + email;
  var id = props.getProperty(key);
  if (id) return id;

  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);
  try {
    id = props.getProperty(key); // otra ejecución pudo crearla mientras esperábamos
    if (id) return id;
    var ss = SpreadsheetApp.create('Luciano Cargas - ' + email);
    props.setProperty(key, ss.getId());
    return ss.getId();
  } finally {
    lock.releaseLock();
  }
}

/** Deja la ejecución trabajando para un usuario y descarta toda memoria de otro. */
function setTenant_(email) {
  var id = resolverHojaDeUsuario_(email);
  _tenant = { email: email, spreadsheetId: id, clave: String(id).substring(0, 16) };
  // Versión de los datos al empezar: lo que esta ejecución guarde en la caché queda marcado con ella.
  _tenant.ver = getDataVersion_();
  _spreadsheetCache = null;
  _sheetValuesCache = {};
  invalidateCatalogMemo();
  return _tenant;
}

/** Corre algo (por ejemplo un aviso programado) una vez por cada usuario. */
function paraCadaUsuario_(fn) {
  // Varios usuarios pueden compartir la misma hoja: se corre una sola vez por hoja
  // (si no, el aviso de stock bajo llegaría repetido).
  var hojasHechas = {};
  Object.keys(CONFIG.USERS).forEach(function(email) {
    try {
      var hoja = setTenant_(email).spreadsheetId;
      if (hojasHechas[hoja]) return;
      hojasHechas[hoja] = true;
      fn(email);
    } catch (error) {
      Logger.log('❌ Falló para ' + email + ': ' + error.toString());
    }
  });
}

function secretoDeSesion_() {
  var props = PropertiesService.getScriptProperties();
  var secreto = props.getProperty('TOKEN_SECRET');
  if (secreto) return secreto;
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);
  try {
    secreto = props.getProperty('TOKEN_SECRET');
    if (!secreto) {
      secreto = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
      props.setProperty('TOKEN_SECRET', secreto);
    }
    return secreto;
  } finally {
    lock.releaseLock();
  }
}

function firmar_(texto) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(texto, secretoDeSesion_()));
}

/** Token firmado: no se puede inventar ni cambiar el usuario sin conocer el secreto. */
function crearToken_(email) {
  var carga = Utilities.base64EncodeWebSafe(email + '|' + (new Date().getTime() + SESION_DURACION_MS));
  return carga + '.' + firmar_(carga);
}

/** Devuelve el email del token, o null si es falso, está alterado o venció. */
function verificarToken_(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    var partes = token.split('.');
    if (partes.length !== 2) return null;
    if (firmar_(partes[0]) !== partes[1]) return null;
    var bytes = Utilities.base64DecodeWebSafe(partes[0]);
    var texto = Utilities.newBlob(bytes).getDataAsString();
    var corte = texto.lastIndexOf('|');
    var email = texto.substring(0, corte);
    if (Number(texto.substring(corte + 1)) < new Date().getTime()) return null;
    return usuarioConfig_(email) ? email : null;
  } catch (error) {
    return null;
  }
}

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
  let lock = null;
  let versionAvanzada = false;
  
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

    // Todo, salvo el login, es de un usuario identificado: cada uno ve solo su hoja.
    if (endpoint !== 'login') {
      let tokenSesion = e.parameter['token'];
      if (!tokenSesion && e.postData) {
        try { tokenSesion = JSON.parse(e.postData.contents).token; } catch (err) { /* sin token */ }
      }
      const emailSesion = verificarToken_(tokenSesion);
      if (!emailSesion) {
        return createResponse({ success: false, error: 'Tu sesión venció. Volvé a iniciar sesión.', sesion: false }, 401, callback);
      }
      setTenant_(emailSesion);
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
    const rid = data.rid ? String(data.rid) : '';
    delete data.apiKey;
    delete data.token;
    delete data.rid;
    delete data.endpoint;
    delete data.callback;
    delete data.method;

    // Ningún texto que se guarde puede llevar < o >: después se muestra en pantalla.
    if (endpoint !== 'login' && endpoint !== 'whatsapp/enviar' && endpoint !== 'notificaciones/config') {
      Object.keys(data).forEach(key => { data[key] = sanitizarEntrada_(data[key]); });
    }
    
    // Varias personas usan la app a la vez: toda escritura espera su turno.
    // Sin esto, dos pedidos que leen la misma hoja se pisan (cobros dobles, precios perdidos).
    // Las lecturas no esperan.
    if (actualMethod !== 'GET') {
      lock = LockService.getScriptLock();
      try {
        lock.waitLock(LOCK_WAIT_MS);
      } catch (lockError) {
        lock = null;
        return createResponse({
          success: false,
          error: 'Hay mucha actividad en este momento. Esperá unos segundos y volvé a intentar.',
          busy: true
        }, 503, callback);
      }
    }

    // Cada escritura trae un identificador propio (rid). Si el navegador (o la red) repite el mismo
    // pedido —pasa cuando Google tarda y la conexión se corta—, no se ejecuta de nuevo: se devuelve
    // lo que ya se respondió. Sin esto, un pedido o un cobro podían quedar duplicados.
    if (lock && rid) {
      const previa = serverCacheGet('rid:' + rid);
      if (previa) {
        versionAvanzada = true;
        return createResponse({ success: true, data: previa, ver: getDataVersion_(), repetido: true }, 200, callback);
      }
    }

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

      case 'pedidos/update':
        result = updatePedido(data);
        break;

      // Planilla de pedidos (productos en filas, clientes en columnas)
      case 'pedidos/celda':
        result = guardarCeldaPedido(data);
        break;

      case 'pedidos/proveedor-producto':
        result = cambiarProveedorProductoDia(data);
        break;

      case 'pedidos/eliminar-producto':
        result = eliminarPedidosProductoDia(data);
        break;
      
      case 'pedidos/marcar-enviados':
        result = marcarPedidosEnviados(data.fecha);
        break;
      
      case 'pedidos/marcar-enviados-por-ids':
        result = marcarPedidosEnviadosPorIds(data.pedidosIds);
        break;

      case 'camiones':
        if (actualMethod === 'GET') {
          result = getCamiones(data.fecha);
        } else if (actualMethod === 'POST') {
          result = guardarCamiones(data);
        }
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

      case 'recepcion/confirmar-item':
        result = confirmarRecepcionItem(data);
        break;

      case 'recepcion/desconfirmar-item':
        result = desconfirmarRecepcionItem(data);
        break;

      case 'recepcion/eliminar-item':
        result = deleteRecepcionItem(data);
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

      case 'cobranzas/agregar-pendiente':
        result = agregarCobranzaPendiente(data);
        break;

      case 'cobranzas/cobrar-cliente':
        result = cobrarClienteHoy(data);
        break;

      case 'cobranzas/ajustar-cobro':
        result = ajustarCobroClienteHoy(data);
        break;

      case 'cobranzas/totales-hoy':
        result = getTotalesClientesHoy(data.fecha);
        break;
      
      // Estadísticas
      case 'estadisticas/productos-mas-vendidos':
        result = getTopProductosVendidos(data.dias || 7, data.limite || 5);
        break;

      case 'dashboard/resumen':
        result = getDashboardResumen(data.fecha, data.dias || 7, data.limite || 5);
        break;

      case 'app/version':
        result = { ver: getDataVersion_() };
        break;

      case 'app/bootstrap':
        result = getAppBootstrap(data.fecha, data.dias || 7, data.limite || 5);
        break;

      case 'flujo/dias-pendientes':
        result = getDiasPendientes();
        break;

      case 'flujo/dia':
        result = getFlujoDia(data.fecha);
        break;

      case 'admin/reset-datos':
        if (actualMethod !== 'POST') {
          throw new Error('Método no permitido');
        }
        result = resetAllDatos(data.confirmacion);
        break;
      
      // Pagos Proveedores
      case 'pagos-proveedores':
        if (actualMethod === 'GET') {
          result = getPagosProveedores();
        } else if (actualMethod === 'POST') {
          result = registrarPago(data);
        }
        break;
      
      // Deudas a proveedores cargadas a mano (lo que se les debía antes de usar la app)
      case 'deudas-proveedores':
        if (actualMethod === 'GET') {
          result = getDeudasProveedores();
        } else if (actualMethod === 'POST') {
          result = agregarDeudaProveedor(data);
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

      case 'caja/repartir':
        result = repartirEfectivo(data);
        break;
      
      // Historial
      case 'historial':
        result = getHistorial();
        break;

      // Reportes de cierre en Google Drive
      case 'drive/cierre':
        if (actualMethod !== 'POST') throw new Error('Método no permitido');
        result = guardarPdfCierreEnDrive(data);
        break;

      case 'drive/config':
        result = getDriveConfig();
        break;

      case 'drive/compartir':
        if (actualMethod !== 'POST') throw new Error('Método no permitido');
        result = compartirCarpetaCierres(data.email);
        break;

      case 'drive/quitar':
        if (actualMethod !== 'POST') throw new Error('Método no permitido');
        result = quitarAccesoCarpetaCierres(data.email);
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

      case 'whatsapp/status':
        result = getWhatsAppStatus();
        break;

      case 'whatsapp/enviar':
        result = enviarMensajeWhatsApp(data.telefono, data.mensaje);
        break;
      
      default:
        return createResponse({ success: false, error: 'Endpoint no encontrado' }, 404, callback);
    }
    
    if (lock) {
      bumpDataVersion_();
      versionAvanzada = true;
      if (rid) serverCacheSet('rid:' + rid, result === undefined ? null : result, 600);
    }
    return createResponse({ success: true, data: result, ver: _tenant ? getDataVersion_() : undefined }, 200, callback);
    
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
      
      // Con callback va como JSONP; sin callback (el PDF del cierre, que llega por POST) va como JSON.
      return createResponse(errorResponse, 500, callback);
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
  } finally {
    if (lock) {
      // Aunque la escritura haya fallado a medias, el resto tiene que volver a leer.
      if (!versionAvanzada) {
        try { bumpDataVersion_(); } catch (versionError) {}
      }
      lock.releaseLock();
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
    if (!_tenant) throw new Error('No hay un usuario identificado para esta operación');
    _spreadsheetCache = SpreadsheetApp.openById(_tenant.spreadsheetId);
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

/** Caché de valores por hoja dentro de la misma ejecución (evita getDataRange repetidos) */
let _sheetValuesCache = {};

/** Memo de catálogo procesado (rowsToObjects) dentro de la misma ejecución */
let _catalogMemo = {
  clientes: null,
  productos: null,
  proveedoresList: null,
  clientesMap: null,
  productosMap: null
};

function invalidateCatalogMemo() {
  _catalogMemo = {
    clientes: null,
    productos: null,
    proveedoresList: null,
    clientesMap: null,
    productosMap: null
  };
}

function readSheetValues(sheetName) {
  if (!_sheetValuesCache[sheetName]) {
    const sheet = getSheet(sheetName);
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    var values = [];
    if (lastRow > 0 && lastCol > 0) {
      values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    }
    _sheetValuesCache[sheetName] = {
      sheet: sheet,
      headers: values.length ? values[0] : [],
      rows: values.length > 1 ? values.slice(1) : []
    };
  }
  return _sheetValuesCache[sheetName];
}

/** Como readSheetValues, pero si la hoja todavía no existe devuelve vacío en vez de crearla (las lecturas no escriben). */
function readSheetValuesSiExiste_(sheetName) {
  if (!getSpreadsheet().getSheetByName(sheetName)) return { headers: [], rows: [] };
  return readSheetValues(sheetName);
}

function readUsedValues_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [[]];
  return sheet.getRange(1, 1, lastRow, lastCol).getValues();
}

function findRowById_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || id === undefined || id === null || id === '') return -1;
  var finder = sheet.getRange(2, 1, lastRow, 1).createTextFinder(String(id)).matchEntireCell(true);
  var cell = finder.findNext();
  return cell ? cell.getRow() : -1;
}

function invalidateSheetCache(sheetName) {
  if (sheetName) {
    delete _sheetValuesCache[sheetName];
    if (sheetName === CONFIG.SHEETS.CLIENTES ||
        sheetName === CONFIG.SHEETS.PROVEEDORES ||
        sheetName === CONFIG.SHEETS.PRODUCTOS) {
      invalidateCatalogMemo();
    }
  } else {
    _sheetValuesCache = {};
    invalidateCatalogMemo();
  }
}

/** Caché entre ejecuciones (CacheService) — reduce lecturas de Sheets */
var SERVER_CACHE_TTL = {
  catalog: 600,
  saldos: 180,
  fecha: 90,
  flujo: 60,
  dias: 90
};

// Las lecturas no esperan turno: una lectura que leyó la hoja ANTES de una escritura podía guardar
// su copia en la caché DESPUÉS de que la escritura la borrara, y durante 10 minutos todos veían
// datos viejos (por ejemplo, teléfonos recién cargados que "desaparecían").
// Por eso cada copia de datos ('sc:...') lleva la versión con la que empezó la ejecución que la
// leyó, y solo se usa si sigue siendo la versión actual: cualquier escritura posterior la descarta.
function esCopiaDeDatos_(key) {
  return String(key).indexOf('sc:') === 0;
}

function serverCacheGet(key) {
  try {
    var raw = CacheService.getScriptCache().get(tenantClave_() + ':' + key);
    if (!raw) return null;
    var valor = JSON.parse(raw);
    if (!esCopiaDeDatos_(key)) return valor;
    if (!valor || typeof valor !== 'object' || valor.v !== _tenant.ver) return null;
    return valor.d;
  } catch (e) {
    return null;
  }
}

function serverCacheSet(key, value, ttlSeconds) {
  try {
    if (esCopiaDeDatos_(key)) value = { v: _tenant.ver, d: value };
    var json = JSON.stringify(value);
    if (json.length > 95000) return;
    CacheService.getScriptCache().put(tenantClave_() + ':' + key, json, ttlSeconds || SERVER_CACHE_TTL.catalog);
  } catch (e) {
    // Cuota o valor demasiado grande
  }
}

function serverCacheRemove(key) {
  try {
    CacheService.getScriptCache().remove(tenantClave_() + ':' + key);
  } catch (e) {}
}

function serverCacheRemoveMany(keys) {
  keys.forEach(function(k) { serverCacheRemove(k); });
}

function invalidateServerCacheForSheet(sheetName) {
  var keys = [];
  if (sheetName === CONFIG.SHEETS.CLIENTES) keys.push('sc:clientes');
  if (sheetName === CONFIG.SHEETS.PRODUCTOS) keys.push('sc:productos');
  if (sheetName === CONFIG.SHEETS.PROVEEDORES) {
    keys.push('sc:proveedores_list');
    keys.push('sc:saldos');
  }
  if (sheetName === CONFIG.SHEETS.PEDIDOS) keys.push('sc:dias');
  if (sheetName === CONFIG.SHEETS.RECEPCION) keys.push('sc:saldos');
  if (sheetName === CONFIG.SHEETS.PAGOS_PROVEEDORES) {
    keys.push('sc:saldos');
    keys.push('sc:medios_prov');
  }
  if (sheetName === CONFIG.SHEETS.DEUDAS_PROVEEDORES) keys.push('sc:saldos');
  if (sheetName === CONFIG.SHEETS.CIERRE_DIA) keys.push('sc:dias');
  if (sheetName === CONFIG.SHEETS.PRECIOS_CLIENTE) keys.push('sc:dias');
  if (sheetName === CONFIG.SHEETS.COBRANZAS) keys.push('sc:cobranzas');
  if (sheetName === CONFIG.SHEETS.STOCK_BEBIDAS) keys.push('sc:stock');
  keys.push('sc:boot:' + todayArgentina());
  serverCacheRemoveMany(keys);
}

function invalidateServerCacheFecha(fecha) {
  if (!fecha) return;
  var f = normalizeFecha(fecha);
  serverCacheRemoveMany([
    'sc:pedidos:' + f,
    'sc:recepcion:' + f,
    'sc:precios:' + f,
    'sc:flujo:' + f,
    'sc:dias',
    'sc:boot:' + f
  ]);
}

function invalidateAllServerCache() {
  serverCacheRemoveMany([
    'sc:clientes', 'sc:productos', 'sc:proveedores_list', 'sc:saldos',
    'sc:cobranzas', 'sc:stock', 'sc:dias'
  ]);
}

function findInIdMap(map, id) {
  if (!id || !map) return null;
  var hit = map[String(id)];
  if (hit) return hit;
  Object.keys(map).forEach(function(key) {
    if (idsMatch(key, id)) hit = map[key];
  });
  return hit || null;
}

/**
 * Vacía el contenido de una hoja y conserva el encabezado.
 * No borra las filas del fondo: Sheets no deja eliminar todas las que no
 * están inmovilizadas, y sacarlas deja la hoja en dos filas.
 */
function clearSheetDataRows(sheetName) {
  var sheet = getSheet(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  }
  var minimo = 100;
  if (sheet.getMaxRows() < minimo) {
    sheet.insertRowsAfter(sheet.getMaxRows(), minimo - sheet.getMaxRows());
  }
  initializeSheet(sheet, sheetName);
}

function fechasDeHoja_(sheetName) {
  var sheet = getSheet(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = headers.indexOf('fecha');
  if (idx < 0) return [];
  var values = sheet.getRange(2, idx + 1, lastRow - 1, 1).getValues();
  var seen = {};
  values.forEach(function(row) {
    var fecha = normalizeFecha(row[0]);
    if (fecha) seen[fecha] = true;
  });
  return Object.keys(seen);
}

function invalidateServerCacheTrasReset_(fechas) {
  var keys = [
    'sc:clientes', 'sc:productos', 'sc:proveedores_list', 'sc:saldos',
    'sc:cobranzas', 'sc:stock', 'sc:dias', 'sc:medios_prov'
  ];
  var todas = {};
  todas[todayArgentina()] = true;
  (fechas || []).forEach(function(fecha) {
    if (fecha) todas[fecha] = true;
  });
  Object.keys(todas).forEach(function(fecha) {
    keys.push('sc:boot:' + fecha);
    keys.push('sc:flujo:' + fecha);
    keys.push('sc:pedidos:' + fecha);
    keys.push('sc:recepcion:' + fecha);
    keys.push('sc:precios:' + fecha);
  });
  serverCacheRemoveMany(keys);
}

/**
 * Borra todos los datos operativos del spreadsheet (clientes, pedidos, etc.).
 * Requiere confirmación explícita por seguridad.
 */
function resetAllDatos(confirmacion) {
  if (confirmacion !== 'BORRAR TODO') {
    throw new Error('Confirmación inválida. Debe enviar confirmacion: BORRAR TODO');
  }

  // Antes de vaciar nada se guarda una copia completa de la planilla en el Drive del dueño del
  // script. Si la copia falla, no se borra nada.
  var original = getSpreadsheet();
  var nombreRespaldo = 'Respaldo ' + original.getName() + ' ' +
    Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'dd-MM-yyyy HH.mm');
  var respaldo = original.copy(nombreRespaldo);

  var hojasOperativas = [
    CONFIG.SHEETS.CLIENTES,
    CONFIG.SHEETS.PROVEEDORES,
    CONFIG.SHEETS.PRODUCTOS,
    CONFIG.SHEETS.PEDIDOS,
    CONFIG.SHEETS.CAMIONES,
    CONFIG.SHEETS.RECEPCION,
    CONFIG.SHEETS.PRECIOS_CLIENTE,
    CONFIG.SHEETS.CIERRE_DIA,
    CONFIG.SHEETS.COBRANZAS,
    CONFIG.SHEETS.PAGOS_PROVEEDORES,
    CONFIG.SHEETS.DEUDAS_PROVEEDORES,
    CONFIG.SHEETS.CAJA_MOVIMIENTOS,
    CONFIG.SHEETS.STOCK_BEBIDAS
  ];

  var fechas = [];
  [
    CONFIG.SHEETS.PEDIDOS,
    CONFIG.SHEETS.RECEPCION,
    CONFIG.SHEETS.PRECIOS_CLIENTE,
    CONFIG.SHEETS.CIERRE_DIA,
    CONFIG.SHEETS.COBRANZAS,
    CONFIG.SHEETS.PAGOS_PROVEEDORES,
    CONFIG.SHEETS.CAJA_MOVIMIENTOS
  ].forEach(function(sheetName) {
    fechas = fechas.concat(fechasDeHoja_(sheetName));
  });

  hojasOperativas.forEach(function(sheetName) {
    clearSheetDataRows(sheetName);
  });

  var configSheet = getSheet(CONFIG.SHEETS.CONFIGURACION);
  configSheet.clear();
  initializeSheet(configSheet, CONFIG.SHEETS.CONFIGURACION);

  invalidateSheetCache();
  invalidateServerCacheTrasReset_(fechas);

  return {
    success: true,
    hojasLimpiadas: hojasOperativas.length + 1,
    respaldo: { nombre: nombreRespaldo, url: respaldo.getUrl() },
    mensaje: 'Todos los datos fueron eliminados. Antes se guardó una copia: ' + nombreRespaldo
  };
}

var SHEET_ERROR_STRINGS = ['#ERROR!', '#REF!', '#VALUE!', '#N/A', '#DIV/0!', '#NULL!', '#NAME?', '#NUM!'];

function sanitizeCellValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object' && val instanceof Error) return '';
  if (typeof val === 'string' && SHEET_ERROR_STRINGS.indexOf(val) !== -1) return '';
  return val;
}

function rowsToObjects(headers, rows) {
  return rows.map(function(row) {
    var obj = {};
    headers.forEach(function(header, index) {
      obj[header] = sanitizeCellValue(row[index]);
    });
    return obj;
  });
}

/**
 * Inicializa headers de una hoja
 */
function initializeSheet(sheet, sheetName) {
  const headers = {
    'Clientes': ['id', 'nombre', 'telefono', 'activo'],
    'Proveedores': ['id', 'nombre', 'rubro', 'telefono', 'activo'],
    'Productos': ['id', 'nombre', 'tipo', 'unidad', 'proveedor_default', 'comision_tipo', 'comision_valor', 'por_kilo'],
    'Pedidos': ['id', 'fecha', 'cliente_id', 'producto_id', 'tipo', 'cantidad', 'enviado', 'proveedor_id'],
    'Camiones': ['id', 'fecha', 'nombre', 'orden', 'clientes'],
    'Recepcion': ['id', 'fecha', 'producto_id', 'proveedor_id', 'pedido_total', 'llego', 'precio_real', 'confirmado'],
    'PreciosCliente': ['id', 'fecha', 'cliente_id', 'producto_id', 'cantidad', 'precio_cliente', 'comision_unitaria', 'precio_real', 'comision_pct'],
    'CierreDia': ['id', 'fecha', 'estado', 'notas'],
    'Cobranzas': ['id', 'fecha', 'cliente_id', 'total', 'pagado', 'saldo', 'estado', 'medios', 'depositos', 'origen', 'nota'],
    'PagosProveedores': ['id', 'fecha', 'proveedor_id', 'monto', 'metodo', 'nota'],
    'DeudasProveedores': ['id', 'fecha', 'proveedor_id', 'monto', 'nota'],
    'CajaMovimientos': ['id', 'fecha', 'tipo', 'monto', 'nota', 'referencia'],
    'StockBebidas': ['producto_id', 'stock_actual', 'minimo'],
    'Configuracion': ['clave', 'valor']
  };
  
  if (headers[sheetName]) {
    sheet.getRange(1, 1, 1, headers[sheetName].length).setValues([headers[sheetName]]);
    sheet.getRange(1, 1, 1, headers[sheetName].length).setFontWeight('bold');
    
    // Inicializar configuración por defecto si es la hoja de Configuracion
    if (sheetName === 'Configuracion') {
      sheet.appendRow(['email_notificaciones', '']);
      sheet.appendRow(['notificaciones_activas', 'false']);
      sheet.appendRow(['hora_verificacion', '09:00']);
      sheet.appendRow(['whatsapp_auto_envio', 'false']);
      sheet.appendRow(['whatsapp_modo', 'manual']);
      sheet.appendRow(['whatsapp_phone_id', '']);
      sheet.appendRow(['whatsapp_token', '']);
      sheet.appendRow(['whatsapp_bridge_url', '']);
      sheet.appendRow(['whatsapp_bridge_key', '']);
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
    
    return year + '-' + month + '-' + day;
  } catch (error) {
    Logger.log('Error normalizando fecha: ' + error.toString());
    return null;
  }
}

/** Fecha calendario de Argentina, independiente de la zona del servidor. */
function todayArgentina() {
  return Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
}

function ensureColumn(sheet, columnName) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf(columnName) === -1) {
    var col = headers.length + 1;
    sheet.getRange(1, col).setValue(columnName);
    sheet.getRange(1, col).setFontWeight('bold');
  }
}

function totalPrecioClienteLinea(precio) {
  var cantidad = parseFloat(precio.cantidad) || 0;
  var unit = normalizeAmount(precio.precio_cliente);
  var comision = normalizeComision_(precio.comision_unitaria);
  return Math.round(cantidad * unit) + Math.round(cantidad * comision);
}

/**
 * Comisión por unidad: puede tener centavos (la de porcentaje: 5 % de $350 = $17,50 por kilo).
 * Se redondea recién el total de la línea; si se redondeara por unidad, en 500 kg se cobraría de más.
 */
function normalizeComision_(value) {
  if (typeof value === 'number') return isFinite(value) ? Math.round(value * 100) / 100 : 0;
  var raw = String(value === undefined || value === null ? '' : value).trim();
  if (/^\d+([.,]\d{1,2})?$/.test(raw)) return Math.round(parseFloat(raw.replace(',', '.')) * 100) / 100;
  return normalizeAmount(value);
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

  // Con 1 o 2 decimales ("10,5", "1.500,50", "10.5") el separador es decimal.
  // Con 3 dígitos ("5.000") es separador de miles.
  const limpio = raw.replace(/[^\d.,]/g, '');
  let decimal = null;
  if (/^[\d.]*\d,\d{1,2}$/.test(limpio)) {
    decimal = parseFloat(limpio.replace(/\./g, '').replace(',', '.'));
  } else if (/^\d+\.\d{1,2}$/.test(limpio)) {
    decimal = parseFloat(limpio);
  }
  if (decimal !== null && !isNaN(decimal)) {
    const redondeado = Math.round(decimal);
    return isNegative ? -redondeado : redondeado;
  }

  const digits = raw.replace(/\D/g, '');
  if (!digits) return 0;

  const parsed = parseInt(digits, 10);
  return isNegative ? -parsed : parsed;
}

function sanitizarEntrada_(valor) {
  if (typeof valor === 'string') return valor.replace(/[<>]/g, '');
  if (Array.isArray(valor)) return valor.map(sanitizarEntrada_);
  if (valor && typeof valor === 'object') {
    var limpio = {};
    Object.keys(valor).forEach(function(k) { limpio[k] = sanitizarEntrada_(valor[k]); });
    return limpio;
  }
  return valor;
}

/** Saca < y > de los textos que se guardan: después se muestran en pantalla. */
function limpiarTexto_(valor) {
  return String(valor === undefined || valor === null ? '' : valor).replace(/[<>]/g, '').trim();
}

/** La cantidad de un pedido tiene que ser un número mayor a cero. */
function validarCantidad_(valor) {
  var n = Number(String(valor === undefined || valor === null ? '' : valor).replace(',', '.'));
  if (valor === '' || valor === null || valor === undefined || !isFinite(n) || n <= 0) {
    throw new Error('La cantidad tiene que ser un número mayor a cero');
  }
  return n;
}

/** Un día cerrado ya generó cobranzas y stock: no se le cambian pedidos, recepción ni precios. */
function assertDiaAbierto_(fecha) {
  var f = normalizeFecha(fecha);
  if (!f) return;
  var cierre = findCierreRow(f);
  if (cierre.row && cierre.estado === 'cerrado') {
    throw new Error('El día ' + f + ' ya está cerrado: no se pueden cambiar sus pedidos, recepción ni precios.');
  }
}

/**
 * Nombre y teléfono se guardan como texto: Sheets si no convierte "011..." en número
 * (pierde el 0) y "+54..." o "=..." en fórmula. Se hace una sola vez por hoja.
 */
function ensureTextColumns_(sheet, sheetName, columnas) {
  // Antes se hacía una sola vez y las filas agregadas después quedaban sin formato de texto:
  // un teléfono "+54 9 ..." se convertía en una fórmula rota (#ERROR!) y el número no se veía.
  // Ahora se aplica a toda la columna cada vez, y se reparan las celdas que ya quedaron rotas.
  repararTextos_(sheet, columnas);
}

/** Celdas que Sheets tomó como fórmula ("+54 9 ..." → #ERROR!): se recupera lo escrito como texto. */
function repararTextos_(sheet, columnas) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var lastRow = sheet.getLastRow();
  var reparadas = 0;
  columnas.forEach(function(nombre) {
    var i = headers.indexOf(nombre);
    if (i === -1) return;
    var columna = sheet.getRange(2, i + 1, Math.max(sheet.getMaxRows() - 1, 1), 1);
    if (lastRow >= 2) {
      var rango = sheet.getRange(2, i + 1, lastRow - 1, 1);
      var formulas = rango.getFormulas();
      if (formulas.some(function(f) { return f[0]; })) {
        var valores = rango.getValues();
        var arreglados = formulas.map(function(f, k) {
          if (!f[0]) return [valores[k][0]];
          reparadas++;
          return [String(f[0]).replace(/^=/, '')];
        });
        columna.setNumberFormat('@');
        rango.setValues(arreglados);
        return;
      }
    }
    columna.setNumberFormat('@');
  });
  return reparadas;
}

/** Escribe una fila dejando antes como texto las celdas indicadas (las filas nuevas no traen formato). */
function escribirFilaTexto_(sheet, fila, valores, columnasTexto) {
  if (fila > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), fila - sheet.getMaxRows());
  var headers = sheet.getRange(1, 1, 1, valores.length).getValues()[0];
  (columnasTexto || []).forEach(function(nombre) {
    var i = headers.indexOf(nombre);
    if (i !== -1) sheet.getRange(fila, i + 1).setNumberFormat('@');
  });
  sheet.getRange(fila, 1, 1, valores.length).setValues([valores]);
}

/**
 * Ejecutar UNA vez desde el editor de Apps Script (Ejecutar → repararTelefonos) para recuperar
 * los teléfonos que quedaron como #ERROR! en Clientes y Proveedores de todas las hojas.
 */
function repararTelefonos() {
  paraCadaUsuario_(function(email) {
    var c = repararTextos_(getSheet(CONFIG.SHEETS.CLIENTES), ['nombre', 'telefono']);
    var p = repararTextos_(getSheet(CONFIG.SHEETS.PROVEEDORES), ['nombre', 'rubro', 'telefono']);
    invalidateSheetCache();
    invalidateServerCacheForSheet(CONFIG.SHEETS.CLIENTES);
    invalidateServerCacheForSheet(CONFIG.SHEETS.PROVEEDORES);
    bumpDataVersion_();
    Logger.log('✅ ' + email + ': ' + c + ' celda(s) de clientes y ' + p + ' de proveedores reparadas');
  });
}

/** Cuántas filas de otra hoja apuntan a este registro. */
function contarReferencias_(sheetName, columna, id) {
  var hoja = readSheetValues(sheetName);
  var idx = hoja.headers.indexOf(columna);
  if (idx === -1) return 0;
  var n = 0;
  hoja.rows.forEach(function(fila) {
    if (fila[idx] !== '' && fila[idx] !== null && idsMatch(fila[idx], id)) n++;
  });
  return n;
}

function bloquearBorradoSiHayHistorial_(tipo, referencias) {
  var partes = referencias.filter(function(r) { return r.cantidad > 0; }).map(function(r) {
    return r.cantidad + ' ' + r.etiqueta;
  });
  if (!partes.length) return;
  throw new Error('No se puede eliminar ' + tipo + ': tiene ' + partes.join(', ') + '. ' +
    (tipo.indexOf('producto') !== -1 ? 'Borrá primero esos registros.' : 'Desactivalo para que no aparezca más y se conserve el historial.'));
}

// ========== CLIENTES ==========

function getClientes() {
  if (_catalogMemo.clientes) return _catalogMemo.clientes;
  var sc = serverCacheGet('sc:clientes');
  if (sc) {
    _catalogMemo.clientes = sc;
    return sc;
  }
  var cached = readSheetValues(CONFIG.SHEETS.CLIENTES);
  _catalogMemo.clientes = rowsToObjects(cached.headers, cached.rows);
  serverCacheSet('sc:clientes', _catalogMemo.clientes, SERVER_CACHE_TTL.catalog);
  return _catalogMemo.clientes;
}

function getClientesMap() {
  if (_catalogMemo.clientesMap) return _catalogMemo.clientesMap;
  var clientes = getClientes();
  var map = {};
  clientes.forEach(function(c) { map[String(c.id)] = c; });
  _catalogMemo.clientesMap = map;
  return map;
}

function ensureClientesSchema(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (headers.indexOf('telefono') === -1) {
    const activoIndex = headers.indexOf('activo');
    if (activoIndex !== -1) {
      sheet.insertColumnBefore(activoIndex + 1);
      sheet.getRange(1, activoIndex + 1).setValue('telefono');
    } else {
      sheet.getRange(1, headers.length + 1).setValue('telefono');
    }
  }

  if (headers.indexOf('activo') === -1) {
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue('activo');
  }

  ensureTextColumns_(sheet, CONFIG.SHEETS.CLIENTES, ['nombre', 'telefono']);
}

function createCliente(data) {
  var nombre = limpiarTexto_(data.nombre);
  if (!nombre) throw new Error('El nombre del cliente es requerido');

  var existente = getClientes().find(function(cliente) {
    return String(cliente.nombre || '').trim().toLowerCase() === nombre.toLowerCase();
  });
  if (existente) {
    return {
      id: existente.id,
      nombre: existente.nombre,
      telefono: existente.telefono || data.telefono || '',
      activo: existente.activo,
      existente: true
    };
  }

  const sheet = getSheet(CONFIG.SHEETS.CLIENTES);
  ensureClientesSchema(sheet);
  const id = generateId();
  
  const newRow = [
    id,
    nombre,
    limpiarTexto_(data.telefono),
    true
  ];
  
  escribirFilaTexto_(sheet, sheet.getLastRow() + 1, newRow, ['nombre', 'telefono']);
  invalidateSheetCache(CONFIG.SHEETS.CLIENTES);
  invalidateServerCacheForSheet(CONFIG.SHEETS.CLIENTES);
  return { id: id, nombre: nombre, telefono: limpiarTexto_(data.telefono), activo: true };
}

function updateCliente(data) {
  if (!data || !data.id) {
    throw new Error('ID de cliente no proporcionado');
  }

  const sheet = getSheet(CONFIG.SHEETS.CLIENTES);
  ensureClientesSchema(sheet);
  const values = readUsedValues_(sheet);
  const headers = values.length ? values[0] : [];
  const idIdx = headers.indexOf('id') !== -1 ? headers.indexOf('id') : 0;
  const nombreIdx = headers.indexOf('nombre');
  const telIdx = headers.indexOf('telefono');
  const activoIdx = headers.indexOf('activo');
  // Solo se cambia lo que llega: desactivar no debe pisar un nombre editado por otra persona.
  const traeActivo = data.activo !== undefined && data.activo !== null && data.activo !== '';
  const activoValue = traeActivo ? parseActivoValue(data.activo) : undefined;

  for (let i = 1; i < values.length; i++) {
    if (!idsMatch(values[i][idIdx], data.id)) continue;

    const row = values[i].slice();
    if (nombreIdx !== -1 && data.nombre !== undefined) {
      const nombreLimpio = limpiarTexto_(data.nombre);
      if (!nombreLimpio) throw new Error('El nombre es obligatorio');
      row[nombreIdx] = nombreLimpio;
    }
    if (telIdx !== -1 && data.telefono !== undefined) row[telIdx] = limpiarTexto_(data.telefono);
    if (activoIdx !== -1 && traeActivo) row[activoIdx] = activoValue;
    escribirFilaTexto_(sheet, i + 1, row, ['nombre', 'telefono']);

    invalidateSheetCache(CONFIG.SHEETS.CLIENTES);
    invalidateServerCacheForSheet(CONFIG.SHEETS.CLIENTES);
    return { success: true, id: data.id, activo: activoIdx !== -1 ? parseActivoValue(row[activoIdx]) : activoValue };
  }

  throw new Error('Cliente no encontrado');
}

function deleteCliente(id) {
  bloquearBorradoSiHayHistorial_('al cliente', [
    { cantidad: contarReferencias_(CONFIG.SHEETS.PEDIDOS, 'cliente_id', id), etiqueta: 'pedido(s)' },
    { cantidad: contarReferencias_(CONFIG.SHEETS.PRECIOS_CLIENTE, 'cliente_id', id), etiqueta: 'precio(s) cargado(s)' },
    { cantidad: contarReferencias_(CONFIG.SHEETS.COBRANZAS, 'cliente_id', id), etiqueta: 'cobranza(s)' }
  ]);
  const sheet = getSheet(CONFIG.SHEETS.CLIENTES);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (idsMatch(values[i][0], id)) {
      sheet.deleteRow(i + 1);
      invalidateSheetCache(CONFIG.SHEETS.CLIENTES);
      invalidateServerCacheForSheet(CONFIG.SHEETS.CLIENTES);
      return { success: true };
    }
  }
  
  throw new Error('Cliente no encontrado');
}

// ========== PROVEEDORES ==========

function idsMatch(a, b) {
  return String(a) === String(b);
}

/**
 * Asegura que la hoja Proveedores tenga las columnas esperadas (incl. telefono).
 * Migra hojas antiguas con formato id, nombre, rubro, activo.
 */
function ensureProveedoresSchema(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  let headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (headers.indexOf('telefono') === -1) {
    const activoIndex = headers.indexOf('activo');
    if (activoIndex !== -1) {
      sheet.insertColumnBefore(activoIndex + 1);
      sheet.getRange(1, activoIndex + 1).setValue('telefono');
    } else {
      sheet.getRange(1, headers.length + 1).setValue('telefono');
    }
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  }

  if (headers.indexOf('activo') === -1) {
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue('activo');
  }

  ensureTextColumns_(sheet, CONFIG.SHEETS.PROVEEDORES, ['nombre', 'rubro', 'telefono']);
}

function getProveedorHeaderIndexes(headers) {
  return {
    id: headers.indexOf('id'),
    nombre: headers.indexOf('nombre'),
    rubro: headers.indexOf('rubro'),
    telefono: headers.indexOf('telefono'),
    activo: headers.indexOf('activo')
  };
}

function parseActivoValue(value) {
  if (value === 'false' || value === false || value === 0 || value === '0') {
    return false;
  }
  if (value === 'true' || value === true || value === 1 || value === '1') {
    return true;
  }
  return true;
}

function getProveedoresList() {
  if (_catalogMemo.proveedoresList) return _catalogMemo.proveedoresList;
  var sc = serverCacheGet('sc:proveedores_list');
  if (sc) {
    _catalogMemo.proveedoresList = sc;
    return sc;
  }
  var cached = readSheetValues(CONFIG.SHEETS.PROVEEDORES);
  _catalogMemo.proveedoresList = rowsToObjects(cached.headers, cached.rows);
  serverCacheSet('sc:proveedores_list', _catalogMemo.proveedoresList, SERVER_CACHE_TTL.catalog);
  return _catalogMemo.proveedoresList;
}

function getProveedores() {
  var list = getProveedoresList();
  var saldos = calcularTodosSaldosProveedores();
  var medios = resumirMediosProveedores();
  return list.map(function(proveedor) {
    return Object.assign({}, proveedor, {
      saldo: saldos[proveedor.id] || 0,
      medios: medios[proveedor.id] || null
    });
  });
}

function createProveedor(data) {
  const nombreProveedor = limpiarTexto_(data.nombre);
  if (!nombreProveedor) throw new Error('El nombre del proveedor es requerido');
  const rubroProveedor = limpiarTexto_(data.rubro);
  const telefonoProveedor = limpiarTexto_(data.telefono);
  const sheet = getSheet(CONFIG.SHEETS.PROVEEDORES);
  ensureProveedoresSchema(sheet);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const cols = getProveedorHeaderIndexes(headers);
  const id = generateId();

  const row = new Array(headers.length).fill('');
  row[cols.id] = id;
  row[cols.nombre] = nombreProveedor;
  row[cols.rubro] = rubroProveedor;
  if (cols.telefono !== -1) {
    row[cols.telefono] = telefonoProveedor;
  }
  if (cols.activo !== -1) {
    row[cols.activo] = true;
  }

  escribirFilaTexto_(sheet, sheet.getLastRow() + 1, row, ['nombre', 'rubro', 'telefono']);
  invalidateSheetCache(CONFIG.SHEETS.PROVEEDORES);
  invalidateServerCacheForSheet(CONFIG.SHEETS.PROVEEDORES);
  return { id: id, nombre: nombreProveedor, rubro: rubroProveedor, telefono: telefonoProveedor, activo: true };
}

function updateProveedor(data) {
  if (!data || !data.id) {
    throw new Error('ID de proveedor no proporcionado');
  }

  const sheet = getSheet(CONFIG.SHEETS.PROVEEDORES);
  ensureProveedoresSchema(sheet);
  const values = readUsedValues_(sheet);
  const headers = values.length ? values[0] : [];
  const cols = getProveedorHeaderIndexes(headers);
  const traeActivo = data.activo !== undefined && data.activo !== null && data.activo !== '';
  const activoValue = traeActivo ? parseActivoValue(data.activo) : undefined;

  for (let i = 1; i < values.length; i++) {
    if (!idsMatch(values[i][cols.id], data.id)) continue;

    const row = values[i].slice();
    if (cols.nombre !== -1 && data.nombre !== undefined) {
      const nombreLimpio = limpiarTexto_(data.nombre);
      if (!nombreLimpio) throw new Error('El nombre es obligatorio');
      row[cols.nombre] = nombreLimpio;
    }
    if (cols.rubro !== -1 && data.rubro !== undefined) row[cols.rubro] = limpiarTexto_(data.rubro);
    if (cols.telefono !== -1 && data.telefono !== undefined) row[cols.telefono] = limpiarTexto_(data.telefono);
    if (cols.activo !== -1 && traeActivo) row[cols.activo] = activoValue;
    escribirFilaTexto_(sheet, i + 1, row, ['nombre', 'rubro', 'telefono']);

    invalidateSheetCache(CONFIG.SHEETS.PROVEEDORES);
    invalidateServerCacheForSheet(CONFIG.SHEETS.PROVEEDORES);
    return { success: true, id: data.id, activo: cols.activo !== -1 ? parseActivoValue(row[cols.activo]) : activoValue };
  }

  throw new Error('Proveedor no encontrado');
}

function deleteProveedor(id) {
  bloquearBorradoSiHayHistorial_('al proveedor', [
    { cantidad: contarReferencias_(CONFIG.SHEETS.PEDIDOS, 'proveedor_id', id), etiqueta: 'pedido(s)' },
    { cantidad: contarReferencias_(CONFIG.SHEETS.RECEPCION, 'proveedor_id', id), etiqueta: 'recepción(es)' },
    { cantidad: contarReferencias_(CONFIG.SHEETS.PAGOS_PROVEEDORES, 'proveedor_id', id), etiqueta: 'pago(s)' },
    { cantidad: contarReferencias_(CONFIG.SHEETS.DEUDAS_PROVEEDORES, 'proveedor_id', id), etiqueta: 'deuda(s) cargada(s)' },
    { cantidad: contarReferencias_(CONFIG.SHEETS.PRODUCTOS, 'proveedor_default', id), etiqueta: 'producto(s) que lo usan como habitual' }
  ]);
  const sheet = getSheet(CONFIG.SHEETS.PROVEEDORES);
  ensureProveedoresSchema(sheet);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idIndex = headers.indexOf('id');
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (idsMatch(values[i][idIndex], id)) {
      sheet.deleteRow(i + 1);
      invalidateSheetCache(CONFIG.SHEETS.PROVEEDORES);
      invalidateServerCacheForSheet(CONFIG.SHEETS.PROVEEDORES);
      return { success: true };
    }
  }

  throw new Error('Proveedor no encontrado');
}

// OPTIMIZACIÓN: Calcular todos los saldos de una vez (usa caché de hojas)
function calcularTodosSaldosProveedores() {
  var sc = serverCacheGet('sc:saldos');
  if (sc) return sc;

  var saldos = {};

  var recepcion = readSheetValues(CONFIG.SHEETS.RECEPCION);
  var headersR = recepcion.headers;
  var idxProv = headersR.indexOf('proveedor_id');
  var idxLlego = headersR.indexOf('llego');
  var idxPrecio = headersR.indexOf('precio_real');
  var idxConfirmado = headersR.indexOf('confirmado');
  if (idxProv === -1) idxProv = 3;
  if (idxLlego === -1) idxLlego = 5;
  if (idxPrecio === -1) idxPrecio = 6;
  if (idxConfirmado === -1) idxConfirmado = 7;

  recepcion.rows.forEach(function(row) {
    if (row[idxConfirmado] === true) {
      var proveedorId = row[idxProv];
      var total = (row[idxLlego] || 0) * normalizeAmount(row[idxPrecio]);
      if (!saldos[proveedorId]) saldos[proveedorId] = 0;
      saldos[proveedorId] += total;
    }
  });

  // Lo que se les debía antes de usar la app y se cargó a mano.
  var deudas = readSheetValuesSiExiste_(CONFIG.SHEETS.DEUDAS_PROVEEDORES);
  var idxProvD = deudas.headers.indexOf('proveedor_id');
  var idxMontoD = deudas.headers.indexOf('monto');
  if (idxProvD !== -1 && idxMontoD !== -1) {
    deudas.rows.forEach(function(row) {
      var proveedorId = row[idxProvD];
      if (!proveedorId) return;
      if (!saldos[proveedorId]) saldos[proveedorId] = 0;
      saldos[proveedorId] += normalizeAmount(row[idxMontoD]);
    });
  }

  var pagos = readSheetValues(CONFIG.SHEETS.PAGOS_PROVEEDORES);
  var headersP = pagos.headers;
  var idxProvP = headersP.indexOf('proveedor_id');
  var idxMonto = headersP.indexOf('monto');
  if (idxProvP === -1) idxProvP = 2;
  if (idxMonto === -1) idxMonto = 3;

  pagos.rows.forEach(function(row) {
    var proveedorId = row[idxProvP];
    var monto = normalizeAmount(row[idxMonto]);
    if (!saldos[proveedorId]) saldos[proveedorId] = 0;
    saldos[proveedorId] -= monto;
  });

  serverCacheSet('sc:saldos', saldos, SERVER_CACHE_TTL.saldos);
  return saldos;
}

// Función legacy - mantener por compatibilidad
function calcularSaldoProveedor(proveedorId) {
  const saldos = calcularTodosSaldosProveedores();
  return saldos[proveedorId] || 0;
}

var METODOS_CLIENTE_ = ['efectivo', 'transferencia', 'cheque', 'tarjeta'];
var METODOS_PROVEEDOR_ = ['efectivo', 'transferencia'];

function mediosVacios_() {
  return { efectivo: 0, transferencia: 0, cheque: 0, tarjeta: 0 };
}

function parseMedios_(valor) {
  var medios = mediosVacios_();
  var raw = valor;
  if (raw && typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (e) { raw = null; }
  }
  if (!raw || typeof raw !== 'object') return medios;
  METODOS_CLIENTE_.forEach(function(m) {
    medios[m] = normalizeAmount(raw[m]);
  });
  return medios;
}

function sumaMedios_(medios) {
  var total = 0;
  METODOS_CLIENTE_.forEach(function(m) { total += normalizeAmount(medios[m]); });
  return Math.round(total * 100) / 100;
}

function etiquetaMedio_(metodo) {
  var labels = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    cheque: 'Cheque',
    tarjeta: 'Tarjeta'
  };
  return labels[metodo] || metodo;
}

function normalizarMedios_(data, permitidos) {
  var medios = mediosVacios_();
  var raw = data && data.medios;
  if (raw && typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (e) { raw = null; }
  }
  if (Array.isArray(raw)) {
    raw.forEach(function(item) {
      if (!item) return;
      var metodo = String(item.metodo || '');
      if (permitidos.indexOf(metodo) === -1) return;
      medios[metodo] += normalizeAmount(item.monto);
    });
  } else if (raw && typeof raw === 'object') {
    permitidos.forEach(function(m) { medios[m] = normalizeAmount(raw[m]); });
  } else if (data && normalizeAmount(data.monto) > 0) {
    var metodoUnico = permitidos.indexOf(data.metodo) !== -1 ? data.metodo : 'efectivo';
    medios[metodoUnico] = normalizeAmount(data.monto);
  }
  METODOS_CLIENTE_.forEach(function(m) {
    medios[m] = Math.round(medios[m] * 100) / 100;
  });
  return { medios: medios, total: sumaMedios_(medios) };
}

function registrarCajaMedios_(fecha, tipo, medios, notaBase, referencia) {
  var caja = getSheet(CONFIG.SHEETS.CAJA_MOVIMIENTOS);
  var wrote = false;
  METODOS_CLIENTE_.forEach(function(m) {
    var monto = normalizeAmount(medios[m]);
    if (monto <= 0.009) return;
    caja.appendRow([
      generateId(),
      fecha,
      tipo,
      monto,
      notaBase + ' · ' + etiquetaMedio_(m),
      referencia
    ]);
    wrote = true;
  });
  if (wrote) invalidateSheetCache(CONFIG.SHEETS.CAJA_MOVIMIENTOS);
}

function resumirMediosProveedores() {
  var sc = serverCacheGet('sc:medios_prov');
  if (sc) return sc;
  var pagos = readSheetValues(CONFIG.SHEETS.PAGOS_PROVEEDORES);
  var headers = pagos.headers;
  var idxProv = headers.indexOf('proveedor_id');
  var idxMonto = headers.indexOf('monto');
  var idxMetodo = headers.indexOf('metodo');
  if (idxProv === -1) idxProv = 2;
  if (idxMonto === -1) idxMonto = 3;
  if (idxMetodo === -1) idxMetodo = 4;
  var map = {};
  pagos.rows.forEach(function(row) {
    var proveedorId = String(row[idxProv] || '');
    if (!proveedorId) return;
    if (!map[proveedorId]) map[proveedorId] = mediosVacios_();
    var metodo = String(row[idxMetodo] || 'efectivo');
    if (METODOS_CLIENTE_.indexOf(metodo) === -1) metodo = 'efectivo';
    map[proveedorId][metodo] += normalizeAmount(row[idxMonto]);
  });
  Object.keys(map).forEach(function(id) {
    METODOS_CLIENTE_.forEach(function(m) {
      map[id][m] = Math.round(map[id][m] * 100) / 100;
    });
  });
  serverCacheSet('sc:medios_prov', map, SERVER_CACHE_TTL.saldos);
  return map;
}

function ensureCobranzasMediosColumn_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf('medios') !== -1) return;
  sheet.getRange(1, lastCol + 1).setValue('medios').setFontWeight('bold');
}

function ensureCobranzasColumna_(sheet, nombre) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = headers.indexOf(nombre);
  if (idx !== -1) return idx;
  sheet.getRange(1, lastCol + 1).setValue(nombre).setFontWeight('bold');
  return lastCol;
}

function parseDepositos_(raw) {
  if (!raw) return [];
  var data = raw;
  if (typeof raw === 'string') {
    var texto = raw.trim();
    if (!texto) return [];
    try { data = JSON.parse(texto); } catch (error) { return []; }
  }
  if (!Array.isArray(data)) return [];
  return data.map(function(item) {
    return {
      cuenta: String(item && item.cuenta || '').trim(),
      proveedor_id: String(item && item.proveedor_id || '').trim(),
      monto: normalizeAmount(item && item.monto)
    };
  }).filter(function(item) {
    return item.monto > 0 && item.cuenta && item.proveedor_id;
  });
}

function validarDepositos_(depositos, montoTransferencia) {
  var monto = Math.round(normalizeAmount(montoTransferencia) * 100) / 100;
  if (monto <= 0.009) return [];
  var lista = parseDepositos_(depositos);
  if (!lista.length) {
    throw new Error('En la transferencia poné el nombre de la cuenta y a qué proveedor va');
  }
  var suma = 0;
  lista.forEach(function(item) { suma += item.monto; });
  suma = Math.round(suma * 100) / 100;
  if (Math.abs(suma - monto) > 0.05) {
    throw new Error('Los depósitos suman ' + formatPesos_(suma) + ' y la transferencia es ' + formatPesos_(monto));
  }
  return lista;
}

// ========== PRODUCTOS ==========

function getProductos() {
  if (_catalogMemo.productos) return _catalogMemo.productos;
  var sc = serverCacheGet('sc:productos');
  if (sc) {
    _catalogMemo.productos = sc;
    return sc;
  }
  var cached = readSheetValues(CONFIG.SHEETS.PRODUCTOS);
  _catalogMemo.productos = rowsToObjects(cached.headers, cached.rows);
  serverCacheSet('sc:productos', _catalogMemo.productos, SERVER_CACHE_TTL.catalog);
  return _catalogMemo.productos;
}

function getProductosMap() {
  if (_catalogMemo.productosMap) return _catalogMemo.productosMap;
  var productos = getProductos();
  var map = {};
  productos.forEach(function(p) { map[String(p.id)] = p; });
  _catalogMemo.productosMap = map;
  return map;
}

function createProducto(data) {
  var nombre = limpiarTexto_(data.nombre);
  if (!nombre) throw new Error('El nombre del producto es requerido');

  var existente = getProductos().find(function(producto) {
    return String(producto.nombre || '').trim().toLowerCase() === nombre.toLowerCase();
  });
  if (existente) {
    return {
      id: existente.id,
      nombre: existente.nombre,
      tipo: existente.tipo,
      unidad: existente.unidad,
      proveedor_default: existente.proveedor_default || '',
      existente: true
    };
  }

  const sheet = getSheet(CONFIG.SHEETS.PRODUCTOS);
  ensureColumn(sheet, 'comision_tipo');
  ensureColumn(sheet, 'comision_valor');
  ensureColumn(sheet, 'por_kilo');
  const id = generateId();
  const porKilo = data.por_kilo === true || data.por_kilo === 'true';
  const comision = comisionProducto_(data);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const valores = {
    id: id,
    nombre: nombre,
    tipo: data.tipo,
    unidad: limpiarTexto_(data.unidad),
    proveedor_default: data.proveedor_default || '',
    comision_tipo: comision.tipo,
    comision_valor: comision.valor,
    por_kilo: porKilo
  };
  const newRow = headers.map(function(h) { return valores[h] !== undefined ? valores[h] : ''; });
  
  sheet.appendRow(newRow);
  invalidateSheetCache(CONFIG.SHEETS.PRODUCTOS);
  invalidateServerCacheForSheet(CONFIG.SHEETS.PRODUCTOS);
  
  const stockSheet = getSheet(CONFIG.SHEETS.STOCK_BEBIDAS);
  stockSheet.appendRow([id, 0, data.minimo || 10]);
  invalidateSheetCache(CONFIG.SHEETS.STOCK_BEBIDAS);
  invalidateServerCacheForSheet(CONFIG.SHEETS.STOCK_BEBIDAS);
  
  return { id: id, nombre: nombre, tipo: data.tipo, unidad: data.unidad || '', proveedor_default: data.proveedor_default || '',
    comision_tipo: comision.tipo, comision_valor: comision.valor, por_kilo: porKilo };
}

// Comisión de reparto de cada producto:
//   ''/'general' → la comisión general del día (la de la pantalla de precios)
//   'ninguna'    → no lleva
//   'monto'      → monto fijo por unidad
//   'porcentaje' → porcentaje de la cantidad, con la comisión general del día (la sandía va por kilo:
//                  de 500 kg al 10 % se cobra comisión por 50 bultos)
var TIPOS_COMISION_ = ['', 'general', 'ninguna', 'monto', 'porcentaje'];

function porcentajeComision_(valor) {
  var n = parseFloat(String(valor === undefined || valor === null ? '' : valor).replace(',', '.'));
  if (!isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n * 100) / 100, 100);
}

function comisionProducto_(data) {
  var tipo = String(data.comision_tipo === undefined || data.comision_tipo === null ? '' : data.comision_tipo).trim().toLowerCase();
  if (TIPOS_COMISION_.indexOf(tipo) === -1) throw new Error('Tipo de comisión inválido: ' + tipo);
  if (tipo === 'general') tipo = '';
  var valor = '';
  if (tipo === 'monto') valor = normalizeAmount(data.comision_valor);
  if (tipo === 'porcentaje') valor = porcentajeComision_(data.comision_valor);
  if ((tipo === 'monto' || tipo === 'porcentaje') && !(valor > 0)) {
    throw new Error('Poné cuánto es la comisión del producto (un número mayor a cero)');
  }
  return { tipo: tipo, valor: valor };
}

/**
 * Actualiza un producto existente
 * @param {Object} data - Debe contener: id, nombre, tipo, unidad, proveedor_default (opcional)
 */
function updateProducto(data) {
  const sheet = getSheet(CONFIG.SHEETS.PRODUCTOS);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const idIdx = values[0] ? values[0].indexOf('id') : 0;
  const colId = idIdx === -1 ? 0 : idIdx;
  
  // Solo se escriben los campos que vienen: cambiar la comisión no tiene que pisar el nombre o el
  // proveedor que otra persona acaba de cambiar.
  var traeComision = data.comision_tipo !== undefined;
  if (traeComision) {
    ensureColumn(sheet, 'comision_tipo');
    ensureColumn(sheet, 'comision_valor');
  }
  var traePorKilo = data.por_kilo !== undefined && data.por_kilo !== null && data.por_kilo !== '';
  if (traePorKilo) ensureColumn(sheet, 'por_kilo');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = function(nombre, porDefecto) {
    var idx = headers.indexOf(nombre);
    return (idx === -1 ? porDefecto : idx) + 1;
  };

  for (let i = 1; i < values.length; i++) {
    if (idsMatch(values[i][colId], data.id)) {
      if (data.nombre !== undefined) {
        var nombreProducto = limpiarTexto_(data.nombre);
        if (!nombreProducto) throw new Error('El nombre del producto es requerido');
        sheet.getRange(i + 1, col('nombre', 1)).setValue(nombreProducto);
      }
      if (data.tipo !== undefined) sheet.getRange(i + 1, col('tipo', 2)).setValue(data.tipo);
      if (data.unidad !== undefined) sheet.getRange(i + 1, col('unidad', 3)).setValue(limpiarTexto_(data.unidad));
      if (data.proveedor_default !== undefined) sheet.getRange(i + 1, col('proveedor_default', 4)).setValue(data.proveedor_default || '');
      if (traeComision) {
        var comision = comisionProducto_(data);
        sheet.getRange(i + 1, col('comision_tipo', 5)).setValue(comision.tipo);
        sheet.getRange(i + 1, col('comision_valor', 6)).setValue(comision.valor);
      }
      if (traePorKilo) sheet.getRange(i + 1, col('por_kilo', 7)).setValue(data.por_kilo === true || data.por_kilo === 'true');
      invalidateSheetCache(CONFIG.SHEETS.PRODUCTOS);
      invalidateServerCacheForSheet(CONFIG.SHEETS.PRODUCTOS);
      return { success: true };
    }
  }
  
  throw new Error('Producto no encontrado');
}

function deleteProducto(id) {
  bloquearBorradoSiHayHistorial_('el producto', [
    { cantidad: contarReferencias_(CONFIG.SHEETS.PEDIDOS, 'producto_id', id), etiqueta: 'pedido(s)' },
    { cantidad: contarReferencias_(CONFIG.SHEETS.RECEPCION, 'producto_id', id), etiqueta: 'recepción(es)' },
    { cantidad: contarReferencias_(CONFIG.SHEETS.PRECIOS_CLIENTE, 'producto_id', id), etiqueta: 'precio(s) al cliente' }
  ]);
  const sheet = getSheet(CONFIG.SHEETS.PRODUCTOS);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const idIdx = values[0] ? values[0].indexOf('id') : 0;
  const colId = idIdx === -1 ? 0 : idIdx;
  
  for (let i = 1; i < values.length; i++) {
    if (idsMatch(values[i][colId], id)) {
      sheet.deleteRow(i + 1);
      invalidateSheetCache(CONFIG.SHEETS.PRODUCTOS);
      invalidateServerCacheForSheet(CONFIG.SHEETS.PRODUCTOS);
      try {
        deleteStock(id);
      } catch (e) {}
      return { success: true };
    }
  }
  
  throw new Error('Producto no encontrado');
}

// ========== PEDIDOS ==========

function getPedidos(fecha = null) {
  var fechaBusqueda = fecha ? normalizeFecha(fecha) : null;
  if (fechaBusqueda) {
    var scPed = serverCacheGet('sc:pedidos:' + fechaBusqueda);
    if (scPed) return scPed;
  }

  var cached = readSheetValues(CONFIG.SHEETS.PEDIDOS);
  var headers = cached.headers;
  var clientesMap = getClientesMap();
  var productosMap = getProductosMap();
  var pedidos = [];

  cached.rows.forEach(function(row) {
    if (fechaBusqueda) {
      var fechaPedido = normalizeFecha(row[1]);
      if (fechaPedido !== fechaBusqueda) {
        return;
      }
    }

    var pedido = {};
    headers.forEach(function(header, index) {
      pedido[header] = row[index];
    });

    if (pedido.fecha) {
      pedido.fecha = normalizeFecha(pedido.fecha);
    }

    var cliente = findInIdMap(clientesMap, pedido.cliente_id);
    pedido.cliente_nombre = cliente ? cliente.nombre : '';

    var producto = findInIdMap(productosMap, pedido.producto_id);
    pedido.producto_nombre = producto ? producto.nombre : '';

    pedidos.push(pedido);
  });

  if (fechaBusqueda) {
    serverCacheSet('sc:pedidos:' + fechaBusqueda, pedidos, SERVER_CACHE_TTL.fecha);
  }
  return pedidos;
}

function ensurePedidosProveedorColumn_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf('proveedor_id') !== -1) return;
  sheet.getRange(1, lastCol + 1).setValue('proveedor_id').setFontWeight('bold');
}

function createPedido(data) {
  if (!data || !data.cliente_id || !data.producto_id) {
    throw new Error('Cliente y producto son requeridos');
  }
  if (!findInIdMap(getClientesMap(), data.cliente_id)) {
    throw new Error('Ese cliente no está en el sistema. Actualizá la página y volvé a elegirlo.');
  }
  if (!findInIdMap(getProductosMap(), data.producto_id)) {
    throw new Error('Ese producto no está en el sistema. Actualizá la página y volvé a elegirlo.');
  }

  const cantidadPedido = validarCantidad_(data.cantidad);
  assertDiaAbierto_(data.fecha || todayArgentina());

  const sheet = getSheet(CONFIG.SHEETS.PEDIDOS);
  ensurePedidosProveedorColumn_(sheet);
  const id = generateId();
  const fecha = data.fecha || todayArgentina();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const newRow = headers.map(function() { return ''; });

  function setCol(name, value) {
    var idx = headers.indexOf(name);
    if (idx !== -1) newRow[idx] = value;
  }

  setCol('id', id);
  setCol('fecha', fecha);
  setCol('cliente_id', data.cliente_id);
  setCol('producto_id', data.producto_id);
  setCol('tipo', data.tipo);
  setCol('cantidad', cantidadPedido);
  setCol('enviado', false);
  setCol('proveedor_id', data.proveedor_id || '');

  sheet.appendRow(newRow);
  invalidateSheetCache(CONFIG.SHEETS.PEDIDOS);
  invalidateServerCacheForSheet(CONFIG.SHEETS.PEDIDOS);
  invalidateServerCacheFecha(fecha);
  return { id: id, ...data, cantidad: cantidadPedido, fecha: fecha, enviado: false };
}

function updatePedido(data) {
  if (!data || !data.id) {
    throw new Error('ID de pedido requerido');
  }

  var sheet = getSheet(CONFIG.SHEETS.PEDIDOS);
  ensurePedidosProveedorColumn_(sheet);
  var row = findRowById_(sheet, data.id);
  if (row < 0) throw new Error('Pedido no encontrado');

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(row, 1, 1, lastCol).getValues()[0];

  function setCol(name, value) {
    var idx = headers.indexOf(name);
    if (idx !== -1 && value !== undefined) values[idx] = value;
  }

  setCol('cliente_id', data.cliente_id);
  setCol('producto_id', data.producto_id);
  setCol('tipo', data.tipo);
  if (data.cantidad !== undefined && data.cantidad !== null) setCol('cantidad', validarCantidad_(data.cantidad));
  if (data.proveedor_id !== undefined) setCol('proveedor_id', data.proveedor_id || '');

  var fechaFilaIdx = headers.indexOf('fecha');
  assertDiaAbierto_(values[fechaFilaIdx !== -1 ? fechaFilaIdx : 1]);
  sheet.getRange(row, 1, 1, lastCol).setValues([values]);

  var fechaIdx = headers.indexOf('fecha');
  var fecha = normalizeFecha(values[fechaIdx !== -1 ? fechaIdx : 1]);
  invalidateSheetCache(CONFIG.SHEETS.PEDIDOS);
  invalidateServerCacheForSheet(CONFIG.SHEETS.PEDIDOS);
  if (fecha) invalidateServerCacheFecha(fecha);

  var enviadoIdx = headers.indexOf('enviado');
  var proveedorIdx = headers.indexOf('proveedor_id');
  return {
    success: true,
    id: data.id,
    fecha: fecha,
    cliente_id: data.cliente_id,
    producto_id: data.producto_id,
    tipo: data.tipo,
    cantidad: data.cantidad,
    proveedor_id: proveedorIdx !== -1 ? values[proveedorIdx] : (data.proveedor_id || ''),
    enviado: enviadoIdx !== -1 ? values[enviadoIdx] : false
  };
}

function deletePedido(id) {
  const sheet = getSheet(CONFIG.SHEETS.PEDIDOS);
  const row = findRowById_(sheet, id);
  if (row < 0) throw new Error('Pedido no encontrado');

  var fecha = normalizeFecha(sheet.getRange(row, 2).getValue());
  assertDiaAbierto_(fecha);
  sheet.deleteRow(row);
  invalidateSheetCache(CONFIG.SHEETS.PEDIDOS);
  invalidateServerCacheForSheet(CONFIG.SHEETS.PEDIDOS);
  if (fecha) invalidateServerCacheFecha(fecha);
  return { success: true };
}

// ========== PLANILLA DE PEDIDOS ==========
// En la planilla cada celda es "cuánto pide este cliente de este producto este día". Por detrás
// siguen siendo pedidos comunes (una fila por cliente y producto), así el resto del flujo no cambia.

/** Filas del día de un producto (y de un cliente, si se indica), de abajo hacia arriba para poder borrar. */
function filasPedidosDia_(values, headers, fecha, productoId, clienteId) {
  var fechaIdx = headers.indexOf('fecha'); if (fechaIdx < 0) fechaIdx = 1;
  var productoIdx = headers.indexOf('producto_id'); if (productoIdx < 0) productoIdx = 3;
  var clienteIdx = headers.indexOf('cliente_id'); if (clienteIdx < 0) clienteIdx = 2;
  var filas = [];
  for (var i = 1; i < values.length; i++) {
    if (normalizeFecha(values[i][fechaIdx]) !== fecha) continue;
    if (!idsMatch(values[i][productoIdx], productoId)) continue;
    if (clienteId !== undefined && !idsMatch(values[i][clienteIdx], clienteId)) continue;
    filas.push(i);
  }
  return filas;
}

function invalidarPedidosDia_(fecha) {
  invalidateSheetCache(CONFIG.SHEETS.PEDIDOS);
  invalidateServerCacheForSheet(CONFIG.SHEETS.PEDIDOS);
  invalidateServerCacheFecha(fecha);
}

/**
 * Deja la cantidad de un cliente para un producto en el día: crea el pedido, le cambia la
 * cantidad o lo borra (cantidad vacía o 0). Si había más de un pedido del mismo cliente y
 * producto, queda uno solo con la cantidad nueva. Si la cantidad cambia, el pedido vuelve a
 * quedar pendiente de enviar al proveedor.
 * data: { fecha, cliente_id, producto_id, cantidad, proveedor_id?, tipo? }
 */
function guardarCeldaPedido(data) {
  if (!data || !data.fecha || !data.cliente_id || !data.producto_id) {
    throw new Error('Faltan datos de la celda (día, cliente y producto)');
  }
  var fecha = normalizeFecha(data.fecha);
  assertDiaAbierto_(fecha);
  var texto = String(data.cantidad === undefined || data.cantidad === null ? '' : data.cantidad).trim().replace(',', '.');
  var cantidad = texto === '' ? 0 : Number(texto);
  if (!isFinite(cantidad) || cantidad < 0) throw new Error('La cantidad tiene que ser un número');
  cantidad = Math.round(cantidad * 100) / 100;

  var sheet = getSheet(CONFIG.SHEETS.PEDIDOS);
  ensurePedidosProveedorColumn_(sheet);
  var values = readUsedValues_(sheet);
  var headers = values[0] || [];
  var filas = filasPedidosDia_(values, headers, fecha, data.producto_id, data.cliente_id);
  var cantIdx = headers.indexOf('cantidad');
  var enviadoIdx = headers.indexOf('enviado');
  var provIdx = headers.indexOf('proveedor_id');
  var idIdx = Math.max(headers.indexOf('id'), 0);
  var eliminados = [];

  if (cantidad <= 0) {
    filas.slice().reverse().forEach(function(i) {
      eliminados.push(values[i][idIdx]);
      sheet.deleteRow(i + 1);
    });
    invalidarPedidosDia_(fecha);
    return { pedido: null, eliminados: eliminados };
  }

  if (!filas.length) {
    var creado = createPedido({
      fecha: fecha,
      cliente_id: data.cliente_id,
      producto_id: data.producto_id,
      cantidad: cantidad,
      tipo: data.tipo || '',
      proveedor_id: data.proveedor_id || ''
    });
    return { pedido: creado, eliminados: [] };
  }

  var principal = filas[0];
  var fila = values[principal].slice();
  var cambio = Number(fila[cantIdx]) !== cantidad || filas.length > 1;
  fila[cantIdx] = cantidad;
  if (cambio && enviadoIdx !== -1) fila[enviadoIdx] = false;
  if (provIdx !== -1 && data.proveedor_id !== undefined && data.proveedor_id !== null) fila[provIdx] = data.proveedor_id;
  sheet.getRange(principal + 1, 1, 1, fila.length).setValues([fila]);
  filas.slice(1).reverse().forEach(function(i) {
    eliminados.push(values[i][idIdx]);
    sheet.deleteRow(i + 1);
  });
  invalidarPedidosDia_(fecha);

  var pedido = {};
  headers.forEach(function(h, k) { pedido[h] = fila[k]; });
  pedido.fecha = fecha;
  return { pedido: pedido, eliminados: eliminados };
}

/** Cambia el proveedor de todos los pedidos del día de un producto (vuelven a quedar pendientes). */
function cambiarProveedorProductoDia(data) {
  if (!data || !data.fecha || !data.producto_id) throw new Error('Faltan el día y el producto');
  var fecha = normalizeFecha(data.fecha);
  assertDiaAbierto_(fecha);
  var proveedorId = String(data.proveedor_id || '');
  var sheet = getSheet(CONFIG.SHEETS.PEDIDOS);
  ensurePedidosProveedorColumn_(sheet);
  var values = readUsedValues_(sheet);
  var headers = values[0] || [];
  var provIdx = headers.indexOf('proveedor_id');
  var enviadoIdx = headers.indexOf('enviado');
  var idIdx = Math.max(headers.indexOf('id'), 0);
  var cambiados = [];
  filasPedidosDia_(values, headers, fecha, data.producto_id).forEach(function(i) {
    if (String(values[i][provIdx] || '') === proveedorId) return;
    values[i][provIdx] = proveedorId;
    if (enviadoIdx !== -1) values[i][enviadoIdx] = false;
    sheet.getRange(i + 1, 1, 1, values[i].length).setValues([values[i]]);
    cambiados.push(values[i][idIdx]);
  });
  if (cambiados.length) invalidarPedidosDia_(fecha);
  return { cambiados: cambiados, proveedor_id: proveedorId };
}

/** Borra todos los pedidos del día de un producto (la acción "Eliminar" de la fila). */
function eliminarPedidosProductoDia(data) {
  if (!data || !data.fecha || !data.producto_id) throw new Error('Faltan el día y el producto');
  var fecha = normalizeFecha(data.fecha);
  assertDiaAbierto_(fecha);
  var sheet = getSheet(CONFIG.SHEETS.PEDIDOS);
  var values = readUsedValues_(sheet);
  var headers = values[0] || [];
  var idIdx = Math.max(headers.indexOf('id'), 0);
  var eliminados = [];
  filasPedidosDia_(values, headers, fecha, data.producto_id).reverse().forEach(function(i) {
    eliminados.push(values[i][idIdx]);
    sheet.deleteRow(i + 1);
  });
  if (eliminados.length) invalidarPedidosDia_(fecha);
  return { eliminados: eliminados };
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
  
  var fechaNormalizada = normalizeFecha(fecha);
  var marcados = 0;

  for (var j = 1; j < values.length; j++) {
    var fechaPedido = normalizeFecha(values[j][fechaIndex]);
    if (fechaPedido === fechaNormalizada && values[j][enviadoIndex] !== true) {
      values[j][enviadoIndex] = true;
      marcados++;
    }
  }

  if (marcados > 0) {
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    invalidateSheetCache(CONFIG.SHEETS.PEDIDOS);
    invalidateServerCacheForSheet(CONFIG.SHEETS.PEDIDOS);
    invalidateServerCacheFecha(fechaNormalizada);
  }

  return { success: true, marcados: marcados, mensaje: 'Se marcaron ' + marcados + ' pedido(s) como enviados' };
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
  
  const idIndex = headers.indexOf('id');
  const fechaIndex = headers.indexOf('fecha');
  var enviadoIndex = headers.indexOf('enviado');
  
  var idsMap = {};
  pedidosIds.forEach(function(id) { idsMap[String(id)] = true; });
  var fechas = {};
  
  if (enviadoIndex === -1) {
    const lastCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, lastCol).setValue('enviado');
    enviadoIndex = lastCol - 1;
    
    let marcados = 0;
    for (let i = 1; i < values.length; i++) {
      if (idsMap[String(values[i][idIndex])]) {
        sheet.getRange(i + 1, lastCol).setValue(true);
        marcados++;
        if (fechaIndex !== -1) {
          var fechaNueva = normalizeFecha(values[i][fechaIndex]);
          if (fechaNueva) fechas[fechaNueva] = true;
        }
      }
    }
    Object.keys(fechas).forEach(function(f) { invalidateServerCacheFecha(f); });
    invalidateSheetCache(CONFIG.SHEETS.PEDIDOS);
    invalidateServerCacheForSheet(CONFIG.SHEETS.PEDIDOS);
    return { success: true, marcados: marcados, mensaje: `Se marcaron ${marcados} pedido(s) como enviados` };
  }

  var marcados = 0;
  for (var k = 1; k < values.length; k++) {
    if (idsMap[String(values[k][idIndex])]) {
      if (values[k][enviadoIndex] !== true) {
        values[k][enviadoIndex] = true;
        marcados++;
      }
      if (fechaIndex !== -1) {
        var fechaMarcada = normalizeFecha(values[k][fechaIndex]);
        if (fechaMarcada) fechas[fechaMarcada] = true;
      }
    }
  }

  if (marcados > 0) {
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    invalidateSheetCache(CONFIG.SHEETS.PEDIDOS);
    invalidateServerCacheForSheet(CONFIG.SHEETS.PEDIDOS);
  }
  Object.keys(fechas).forEach(function(f) { invalidateServerCacheFecha(f); });

  return { success: true, marcados: marcados, mensaje: 'Se marcaron ' + marcados + ' pedido(s) como enviados' };
}

// ========== CAMIONES ==========

function getCamiones(fecha) {
  var fechaNorm = normalizeFecha(fecha);
  if (!fechaNorm) return [];
  var cached = readSheetValues(CONFIG.SHEETS.CAMIONES);
  var headers = cached.headers || [];
  var idIdx = Math.max(headers.indexOf('id'), 0);
  var fechaIdx = headers.indexOf('fecha'); if (fechaIdx < 0) fechaIdx = 1;
  var nombreIdx = headers.indexOf('nombre'); if (nombreIdx < 0) nombreIdx = 2;
  var ordenIdx = headers.indexOf('orden'); if (ordenIdx < 0) ordenIdx = 3;
  var clientesIdx = headers.indexOf('clientes'); if (clientesIdx < 0) clientesIdx = 4;

  return cached.rows.filter(function(row) {
    return normalizeFecha(row[fechaIdx]) === fechaNorm;
  }).map(function(row) {
    var clientes = [];
    try { clientes = JSON.parse(row[clientesIdx] || '[]'); } catch (e) { clientes = []; }
    if (!Array.isArray(clientes)) clientes = [];
    return {
      id: row[idIdx],
      fecha: fechaNorm,
      nombre: row[nombreIdx] || '',
      orden: Number(row[ordenIdx]) || 0,
      clientes: clientes
    };
  }).sort(function(a, b) { return a.orden - b.orden; });
}

/** Cómo están los camiones de un día: [[id, nombre, [clientes]], ...] en orden. */
function firmaCamiones_(camiones) {
  return (camiones || []).map(function(c) {
    return [String(c.id || ''), String(c.nombre || ''), (Array.isArray(c.clientes) ? c.clientes : []).map(String)];
  });
}

function guardarCamiones(data) {
  if (!data || !data.fecha) throw new Error('La fecha es requerida');
  var fechaNorm = normalizeFecha(data.fecha);
  // Al guardar se reemplazan todos los camiones del día. Si otra persona los cambió desde que esta
  // pantalla los leyó, no se pisa su trabajo: se avisa y la pantalla vuelve a leerlos.
  if (data.previo !== undefined && data.previo !== null && data.previo !== '') {
    var previo = typeof data.previo === 'string' ? JSON.parse(data.previo) : data.previo;
    if (JSON.stringify(firmaCamiones_(getCamiones(fechaNorm))) !== JSON.stringify(previo)) {
      throw new Error('CAMIONES_CAMBIADOS: Otra persona cambió los camiones de este día.');
    }
  }
  var sheet = getSheet(CONFIG.SHEETS.CAMIONES);
  var values = readUsedValues_(sheet);
  var headers = values.length ? values[0] : [];
  var fechaIdx = headers.indexOf('fecha'); if (fechaIdx < 0) fechaIdx = 1;
  var ancho = Math.max(headers.length, 5);

  // Se arma la hoja completa en memoria y se escribe de una sola vez:
  // borrar y agregar fila por fila tardaba varios segundos por camión.
  var completar = function(fila) {
    var copia = fila.slice(0, ancho);
    while (copia.length < ancho) copia.push('');
    return copia;
  };
  var filasAnteriores = values.length - 1;
  var filas = values.slice(1).filter(function(fila) {
    return normalizeFecha(fila[fechaIdx]) !== fechaNorm;
  }).map(completar);

  (data.camiones || []).forEach(function(camion, index) {
    var clientes = Array.isArray(camion.clientes) ? camion.clientes : [];
    filas.push(completar([
      camion.id || generateId(),
      fechaNorm,
      camion.nombre || ('Camión ' + (index + 1)),
      index + 1,
      JSON.stringify(clientes)
    ]));
  });

  if (filas.length > 0) {
    sheet.getRange(2, 1, filas.length, ancho).setValues(filas);
  }
  if (filasAnteriores > filas.length) {
    sheet.getRange(2 + filas.length, 1, filasAnteriores - filas.length, Math.max(sheet.getLastColumn(), ancho)).clearContent();
  }

  invalidateSheetCache(CONFIG.SHEETS.CAMIONES);
  return { success: true, fecha: fechaNorm, firma: firmaCamiones_(getCamiones(fechaNorm)) };
}

// ========== RECEPCIÓN ==========

function getRecepcion(fecha = null) {
  var fechaBusqueda = fecha ? normalizeFecha(fecha) : null;
  if (fechaBusqueda) {
    var scRec = serverCacheGet('sc:recepcion:' + fechaBusqueda);
    if (scRec) return scRec;
  }

  var cached = readSheetValues(CONFIG.SHEETS.RECEPCION);
  var headers = cached.headers;
  var productosMap = getProductosMap();
  var proveedoresList = getProveedoresList();
  var proveedoresMap = {};
  proveedoresList.forEach(function(p) { proveedoresMap[String(p.id)] = p; });
  var fechaIdx = headers.indexOf('fecha');
  if (fechaIdx === -1) fechaIdx = 1;
  var recepciones = [];

  cached.rows.forEach(function(row) {
    if (fechaBusqueda) {
      var fechaRecepcion = normalizeFecha(row[fechaIdx]);
      if (fechaRecepcion !== fechaBusqueda) return;
    }

    var recepcion = {};
    headers.forEach(function(header, index) {
      recepcion[header] = row[index];
    });

    if (recepcion.fecha) {
      recepcion.fecha = normalizeFecha(recepcion.fecha);
    }
    recepcion.precio_real = normalizeAmount(recepcion.precio_real);

    var producto = findInIdMap(productosMap, recepcion.producto_id);
    recepcion.producto_nombre = producto ? producto.nombre : (recepcion.producto_nombre || '');

    var proveedor = findInIdMap(proveedoresMap, recepcion.proveedor_id);
    if (!proveedor && producto && producto.proveedor_default) {
      proveedor = findInIdMap(proveedoresMap, producto.proveedor_default);
    }
    recepcion.proveedor_nombre = proveedor ? proveedor.nombre : (recepcion.proveedor_nombre || '');

    recepciones.push(recepcion);
  });

  if (fechaBusqueda) {
    serverCacheSet('sc:recepcion:' + fechaBusqueda, recepciones, SERVER_CACHE_TTL.fecha);
  }
  return recepciones;
}

function saveRecepcion(data) {
  const sheet = getSheet(CONFIG.SHEETS.RECEPCION);

  const fechaNormalizada = normalizeFecha(data.fecha);
  assertDiaAbierto_(fechaNormalizada);
  const values = readUsedValues_(sheet);

  // Leer headers para no depender de índices hardcodeados
  const headers = values.length > 0 ? values[0] : [];
  const fechaCol     = headers.indexOf('fecha')      !== -1 ? headers.indexOf('fecha')      : 1;
  const productoCol  = headers.indexOf('producto_id') !== -1 ? headers.indexOf('producto_id') : 2;
  const llegoCol     = headers.indexOf('llego')       !== -1 ? headers.indexOf('llego')       : 5;
  const precioCol    = headers.indexOf('precio_real') !== -1 ? headers.indexOf('precio_real') : 6;

  const recepcionIndex = {};
  for (let i = 1; i < values.length; i++) {
    const fechaRecepcion = normalizeFecha(values[i][fechaCol]);
    const productoId = values[i][productoCol];
    if (fechaRecepcion === fechaNormalizada) {
      recepcionIndex[fechaNormalizada + '|' + String(productoId)] = i;
    }
  }

  var rowsToAppend = [];
  if (data.items && data.items.length > 0) {
    var productosMap = getProductosMap();
    var faltantes = data.items.filter(function(item) {
      return !findInIdMap(productosMap, item.producto_id);
    });
    if (faltantes.length > 0) {
      throw new Error('Hay productos del pedido que ya no están en el catálogo. Actualizá la página antes de guardar la recepción.');
    }

    data.items.forEach(function(item) {
      var producto = findInIdMap(productosMap, item.producto_id);
      if (!producto) return;

      var key = fechaNormalizada + '|' + item.producto_id;
      var rowIdx = recepcionIndex[key];
      if (rowIdx !== undefined) {
        values[rowIdx][llegoCol]  = item.llego || 0;
        values[rowIdx][precioCol] = normalizeAmount(item.precio_real);
      } else {
        rowsToAppend.push([
          generateId(),
          data.fecha,
          item.producto_id,
          item.proveedor_id || producto.proveedor_default || '',
          item.pedido_total || 0,
          item.llego || 0,
          normalizeAmount(item.precio_real),
          false
        ]);
      }
    });

    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    if (rowsToAppend.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
    }
  }

  invalidateSheetCache(CONFIG.SHEETS.RECEPCION);
  invalidateServerCacheForSheet(CONFIG.SHEETS.RECEPCION);
  invalidateServerCacheFecha(fechaNormalizada);
  return { success: true };
}

function findRecepcion(fecha, productoId) {
  const sheet = getSheet(CONFIG.SHEETS.RECEPCION);
  const data = readUsedValues_(sheet);
  if (data.length < 2) return null;

  const headers = data[0];
  const fechaCol    = headers.indexOf('fecha')      !== -1 ? headers.indexOf('fecha')      : 1;
  const productoCol = headers.indexOf('producto_id') !== -1 ? headers.indexOf('producto_id') : 2;
  const confirmadoCol = headers.indexOf('confirmado') !== -1 ? headers.indexOf('confirmado') : headers.length - 1;

  const fechaBusqueda = normalizeFecha(fecha);

  for (let i = 1; i < data.length; i++) {
    const fechaRecepcion = normalizeFecha(data[i][fechaCol]);
    if (fechaRecepcion === fechaBusqueda && idsMatch(data[i][productoCol], productoId)) {
      return { rowIndex: i + 1, data: data[i], confirmadoCol: confirmadoCol };
    }
  }

  return null;
}

function recepcionProductoConfirmada(rec) {
  if (!rec) return false;
  var confirmado = rec.confirmado === true || rec.confirmado === 'true' ||
    rec.confirmado === 1 || rec.confirmado === '1';
  if (!confirmado) return false;
  if (rec.llego === null || rec.llego === '') return false;
  var llego = Number(rec.llego) || 0;
  if (llego > 0 && !normalizeAmount(rec.precio_real)) return false;
  return true;
}

/** Lo que no llegó no se cobra: no hace falta precio al cliente. */
function productoNoLlego(rec) {
  return recepcionProductoConfirmada(rec) && (Number(rec.llego) || 0) <= 0;
}

function recepcionDeProducto(recepcionMap, productoId) {
  if (!recepcionMap) return null;
  var directo = recepcionMap[String(productoId)];
  if (directo) return directo;
  var found = null;
  Object.keys(recepcionMap).forEach(function(k) {
    if (idsMatch(k, productoId)) found = recepcionMap[k];
  });
  return found;
}

function pedidoTienePrecioCliente(pedido, precios, rec) {
  if (productoNoLlego(rec)) return true;
  return (precios || []).some(function(pr) {
    return idsMatch(pr.cliente_id, pedido.cliente_id) &&
      idsMatch(pr.producto_id, pedido.producto_id) &&
      normalizeAmount(pr.precio_cliente) > 0;
  });
}

/**
 * Confirma la recepción de un solo producto (guarda cantidad/precio y marca confirmado).
 */
function confirmarRecepcionItem(data) {
  if (!data || !data.fecha || !data.producto_id) {
    throw new Error('fecha y producto_id son requeridos');
  }

  // Los productos por kilo llegan con decimales (12,5 kg de sandía).
  var llego = Math.round(parseFloat(String(data.llego === undefined || data.llego === null ? '' : data.llego).replace(',', '.')) * 100) / 100;
  if (isNaN(llego) || llego < 0) {
    throw new Error('Cantidad recibida inválida');
  }

  var precioReal = normalizeAmount(data.precio_real);
  if (llego > 0 && !precioReal) {
    throw new Error('Ingresá el precio real cuando llegó mercadería');
  }
  assertDiaAbierto_(data.fecha);

  var sheet = getSheet(CONFIG.SHEETS.RECEPCION);
  var values = readUsedValues_(sheet);
  var headers = values.length ? values[0] : [];
  var fechaCol = headers.indexOf('fecha');
  var productoCol = headers.indexOf('producto_id');
  var llegoCol = headers.indexOf('llego');
  var precioCol = headers.indexOf('precio_real');
  var confirmadoCol = headers.indexOf('confirmado');
  if (fechaCol < 0) fechaCol = 1;
  if (productoCol < 0) productoCol = 2;
  if (llegoCol < 0) llegoCol = 5;
  if (precioCol < 0) precioCol = 6;
  if (confirmadoCol < 0) confirmadoCol = Math.max(headers.length - 1, 0);

  var fechaNormalizada = normalizeFecha(data.fecha);
  var rowIdx = -1;
  for (var i = 1; i < values.length; i++) {
    if (normalizeFecha(values[i][fechaCol]) === fechaNormalizada && idsMatch(values[i][productoCol], data.producto_id)) {
      rowIdx = i;
      break;
    }
  }

  if (rowIdx === -1) {
    var producto = findInIdMap(getProductosMap(), data.producto_id);
    if (!producto) {
      throw new Error('Ese producto no está en el sistema. Actualizá la página y volvé a confirmar.');
    }
    var nueva = [];
    nueva[0] = generateId();
    nueva[fechaCol] = data.fecha;
    nueva[productoCol] = data.producto_id;
    var provCol = headers.indexOf('proveedor_id');
    if (provCol !== -1) nueva[provCol] = data.proveedor_id || producto.proveedor_default || '';
    var totalCol = headers.indexOf('pedido_total');
    if (totalCol !== -1) nueva[totalCol] = data.pedido_total || 0;
    nueva[llegoCol] = llego;
    nueva[precioCol] = precioReal;
    nueva[confirmadoCol] = true;
    for (var c = 0; c < nueva.length; c++) {
      if (nueva[c] === undefined) nueva[c] = '';
    }
    sheet.appendRow(nueva);
  } else {
    values[rowIdx][llegoCol] = llego;
    values[rowIdx][precioCol] = precioReal;
    values[rowIdx][confirmadoCol] = true;
    sheet.getRange(rowIdx + 1, 1, 1, values[rowIdx].length).setValues([values[rowIdx]]);
  }

  invalidateSheetCache(CONFIG.SHEETS.RECEPCION);
  invalidateServerCacheForSheet(CONFIG.SHEETS.RECEPCION);
  invalidateServerCacheFecha(fechaNormalizada);
  return { success: true, producto_id: data.producto_id };
}

function desconfirmarRecepcionItem(data) {
  if (!data || !data.fecha || !data.producto_id) {
    throw new Error('fecha y producto_id son requeridos');
  }

  assertDiaAbierto_(data.fecha);
  var found = findRecepcion(data.fecha, data.producto_id);
  if (!found) {
    throw new Error('No se encontró la recepción del producto');
  }

  var sheet = getSheet(CONFIG.SHEETS.RECEPCION);
  sheet.getRange(found.rowIndex, found.confirmadoCol + 1).setValue(false);
  invalidateSheetCache(CONFIG.SHEETS.RECEPCION);
  invalidateServerCacheForSheet(CONFIG.SHEETS.RECEPCION);
  invalidateServerCacheFecha(normalizeFecha(data.fecha));

  return { success: true, producto_id: data.producto_id };
}

function deleteRecepcionItem(data) {
  if (!data || !data.fecha || !data.producto_id) {
    throw new Error('fecha y producto_id son requeridos');
  }

  assertDiaAbierto_(data.fecha);
  var found = findRecepcion(data.fecha, data.producto_id);
  if (!found) {
    throw new Error('No se encontró la recepción del producto');
  }

  var sheet = getSheet(CONFIG.SHEETS.RECEPCION);
  sheet.deleteRow(found.rowIndex);
  invalidateSheetCache(CONFIG.SHEETS.RECEPCION);
  invalidateServerCacheForSheet(CONFIG.SHEETS.RECEPCION);
  invalidateServerCacheFecha(normalizeFecha(data.fecha));

  return { success: true, producto_id: data.producto_id };
}

function confirmarRecepcion(fecha) {
  assertDiaAbierto_(fecha);
  const sheet = getSheet(CONFIG.SHEETS.RECEPCION);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true };

  const headers = data[0];
  const fechaCol = headers.indexOf('fecha') !== -1 ? headers.indexOf('fecha') : 1;
  const confirmadoCol = headers.indexOf('confirmado') !== -1 ? headers.indexOf('confirmado') : headers.length - 1;

  const fechaBusqueda = normalizeFecha(fecha);

  for (let i = 1; i < data.length; i++) {
    const fechaRecepcion = normalizeFecha(data[i][fechaCol]);
    if (fechaRecepcion === fechaBusqueda) {
      sheet.getRange(i + 1, confirmadoCol + 1).setValue(true);
    }
  }

  return { success: true };
}

// ========== PRECIOS CLIENTE ==========

function getPreciosCliente(fecha = null) {
  var fechaBusqueda = fecha ? normalizeFecha(fecha) : null;
  if (fechaBusqueda) {
    var scPrec = serverCacheGet('sc:precios:' + fechaBusqueda);
    if (scPrec) return scPrec;
  }

  var cached = readSheetValues(CONFIG.SHEETS.PRECIOS_CLIENTE);
  var headers = cached.headers;
  var clientesMap = getClientesMap();
  var productosMap = getProductosMap();
  var precios = [];
  var fechaIdx = headers.indexOf('fecha');
  if (fechaIdx === -1) fechaIdx = 1;

  cached.rows.forEach(function(row) {
    if (fechaBusqueda) {
      var fechaPrecio = normalizeFecha(row[fechaIdx]);
      if (fechaPrecio !== fechaBusqueda) return;
    }

    var precio = {};
    headers.forEach(function(header, index) {
      precio[header] = row[index];
    });

    if (precio.fecha) precio.fecha = normalizeFecha(precio.fecha);
    precio.precio_cliente = normalizeAmount(precio.precio_cliente);
    precio.comision_unitaria = normalizeComision_(precio.comision_unitaria);
    // Si la comisión de la línea es un porcentaje de la cantidad (0 = no).
    precio.comision_pct = porcentajeComision_(precio.comision_pct);
    // Precio real cambiado a mano en esa línea (solo para la ganancia). 0 = el de la recepción.
    precio.precio_real = normalizeAmount(precio.precio_real);

    var cliente = findInIdMap(clientesMap, precio.cliente_id);
    precio.cliente_nombre = cliente ? cliente.nombre : '';

    var producto = findInIdMap(productosMap, precio.producto_id);
    precio.producto_nombre = producto ? producto.nombre : '';

    precios.push(precio);
  });

  if (fechaBusqueda) {
    serverCacheSet('sc:precios:' + fechaBusqueda, precios, SERVER_CACHE_TTL.fecha);
  }
  return precios;
}

function savePreciosCliente(data) {
  const sheet = getSheet(CONFIG.SHEETS.PRECIOS_CLIENTE);
  ensureColumn(sheet, 'comision_unitaria');
  ensureColumn(sheet, 'precio_real');
  ensureColumn(sheet, 'comision_pct');
  
  // Normalizar fecha una sola vez
  const fechaNormalizada = normalizeFecha(data.fecha);
  assertDiaAbierto_(fechaNormalizada);
  
  // Leer todos los precios existentes y construir un índice por (fecha, cliente_id, producto_id)
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const headers = values[0] || [];
  const fechaIdx = headers.indexOf('fecha') !== -1 ? headers.indexOf('fecha') : 1;
  const clienteIdx = headers.indexOf('cliente_id') !== -1 ? headers.indexOf('cliente_id') : 2;
  const productoIdx = headers.indexOf('producto_id') !== -1 ? headers.indexOf('producto_id') : 3;
  const cantidadIdx = headers.indexOf('cantidad') !== -1 ? headers.indexOf('cantidad') : 4;
  const precioIdx = headers.indexOf('precio_cliente') !== -1 ? headers.indexOf('precio_cliente') : 5;
  const comisionIdx = headers.indexOf('comision_unitaria');
  const precioRealIdx = headers.indexOf('precio_real');
  const pctIdx = headers.indexOf('comision_pct');
  const preciosIndex = {};
  
  for (let i = 1; i < values.length; i++) {
    const fechaPrecio = normalizeFecha(values[i][fechaIdx]);
    const clienteId = values[i][clienteIdx];
    const productoId = values[i][productoIdx];
    preciosIndex[fechaPrecio + '|' + clienteId + '|' + productoId] = i;
  }
  
  var comisionDia = normalizeAmount(data.comision_por_unidad);
  var rowsToAppend = [];
  data.items.forEach(function(item) {
    var key = fechaNormalizada + '|' + item.cliente_id + '|' + item.producto_id;
    var rowIdx = preciosIndex[key];
    // Cuando solo cambió la comisión del día, el precio de esa línea no se toca: puede haberlo
    // cargado otra persona después de que esta pantalla lo leyó.
    var soloComision = item.solo_comision === true || item.solo_comision === 'true';
    var precioCliente = normalizeAmount(item.precio_cliente);
    var traeComision = item.comision_unitaria !== undefined && item.comision_unitaria !== null && item.comision_unitaria !== '';
    var comision = traeComision ? normalizeComision_(item.comision_unitaria) : comisionDia;

    // El precio real de la línea solo se toca si viene: armar la lista no lo manda y no lo borra.
    var traePrecioReal = item.precio_real !== undefined && item.precio_real !== null;
    var precioRealLinea = traePrecioReal && normalizeAmount(item.precio_real) > 0 ? normalizeAmount(item.precio_real) : '';

    // Comisión en porcentaje de la cantidad (por ejemplo la sandía: de 500 kg se cobra comisión por
    // 50 bultos): cada unidad paga ese porcentaje de la comisión general del día.
    var traePct = item.comision_pct !== undefined && item.comision_pct !== null;
    var pct = traePct ? porcentajeComision_(item.comision_pct) : 0;
    if (pct > 0 && !traeComision) comision = Math.round(comisionDia * pct) / 100;

    if (rowIdx !== undefined) {
      if (!soloComision) values[rowIdx][precioIdx] = precioCliente;
      if (cantidadIdx !== -1 && item.cantidad !== undefined && !soloComision) values[rowIdx][cantidadIdx] = item.cantidad || 0;
      if (comisionIdx !== -1) values[rowIdx][comisionIdx] = comision;
      if (pctIdx !== -1 && traePct) values[rowIdx][pctIdx] = pct || '';
      if (precioRealIdx !== -1 && traePrecioReal) values[rowIdx][precioRealIdx] = precioRealLinea;
    } else {
      var newRow = [];
      for (var c = 0; c < headers.length; c++) newRow.push('');
      var idIdx = headers.indexOf('id');
      if (idIdx === -1) idIdx = 0;
      newRow[idIdx] = generateId();
      newRow[fechaIdx] = data.fecha;
      newRow[clienteIdx] = item.cliente_id;
      newRow[productoIdx] = item.producto_id;
      newRow[cantidadIdx] = item.cantidad || 0;
      newRow[precioIdx] = precioCliente;
      if (comisionIdx !== -1) newRow[comisionIdx] = comision;
      if (pctIdx !== -1) newRow[pctIdx] = pct || '';
      if (precioRealIdx !== -1 && traePrecioReal) newRow[precioRealIdx] = precioRealLinea;
      rowsToAppend.push(newRow);
    }
  });

  if (data.items.length > 0) {
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    if (rowsToAppend.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
    }
  }

  invalidateSheetCache(CONFIG.SHEETS.PRECIOS_CLIENTE);
  invalidateServerCacheForSheet(CONFIG.SHEETS.PRECIOS_CLIENTE);
  invalidateServerCacheFecha(fechaNormalizada);
  sincronizarCobranzasConPrecios(fechaNormalizada);
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
    
    if (normalizeFecha(fecha) > todayArgentina()) {
      throw new Error('No se puede cerrar un día que todavía no llegó.');
    }
    if (getPedidos(fecha).length === 0) {
      throw new Error('No hay pedidos en ese día para cerrar.');
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
    
    // Validar recepciones (todos los productos del pedido deben estar confirmados)
    Logger.log('🔍 [CIERRE] Validando recepciones...');
    var pedidosParaRecepcion = getPedidos(fecha);
    var productosPedidosIds = {};
    pedidosParaRecepcion.forEach(function(p) {
      productosPedidosIds[p.producto_id] = true;
    });

    var recepcionMapCierre = {};
    recepciones.forEach(function(r) {
      recepcionMapCierre[r.producto_id] = r;
    });

    var productosSinConfirmar = Object.keys(productosPedidosIds).filter(function(productoId) {
      return !recepcionProductoConfirmada(recepcionMapCierre[productoId]);
    });

    if (productosSinConfirmar.length > 0) {
      Logger.log('❌ [CIERRE] Productos sin recepción confirmada: ' + productosSinConfirmar.length);
      throw new Error('Hay productos sin recepción confirmada. Confirmá cada producto en Recepción.');
    }
    Logger.log('✅ [CIERRE] Todas las recepciones están completas');
    
    // Validar precios cliente
    Logger.log('🔍 [CIERRE] Validando precios cliente...');
    const pedidos = getPedidos(fecha);
    var recepcionMapCierrePrecio = {};
    recepciones.forEach(function(r) {
      recepcionMapCierrePrecio[String(r.producto_id)] = r;
    });
    const preciosFaltantes = pedidos.filter(function(p) {
      var rec = recepcionDeProducto(recepcionMapCierrePrecio, p.producto_id);
      return !pedidoTienePrecioCliente(p, precios, rec);
    });
    
    if (preciosFaltantes.length > 0) {
      Logger.log('❌ [CIERRE] Precios faltantes encontrados: ' + preciosFaltantes.length);
      throw new Error('Faltan precios cliente para algunos productos');
    }
    Logger.log('✅ [CIERRE] Todos los precios están completos');

    // Nada se escribe antes de esta validación. Si el cierre quedó a medias, se retoma.
    var cierreInfo = findCierreRow(fecha);
    if (cierreInfo.row && cierreInfo.estado === 'cerrado') {
      return { success: true, alreadyClosed: true, message: 'Día cerrado correctamente' };
    }

    if (!cierreInfo.row) {
      var cierreId = generateId();
      cierreInfo.sheet.appendRow([cierreId, fecha, 'cerrando', '']);
      cierreInfo.row = cierreInfo.sheet.getLastRow();
      cierreInfo.estadoIdx = 2;
      cierreInfo.notasIdx = 3;
      cierreInfo.notas = '';
      cierreInfo.estado = 'cerrando';
    }

    Logger.log('📦 [CIERRE] Actualizando stock de bebidas (entra lo recibido, sale lo vendido)...');
    var faltantesCierre = aplicarStockCierre(fecha, cierreInfo) || [];
    Logger.log('✅ [CIERRE] Stock actualizado');

    Logger.log('💵 [CIERRE] Generando cobranzas...');
    generarCobranzas(fecha);
    Logger.log('✅ [CIERRE] Cobranzas generadas');

    cierreInfo.sheet.getRange(cierreInfo.row, cierreInfo.estadoIdx + 1).setValue('cerrado');
    cierreInfo.sheet.getRange(cierreInfo.row, cierreInfo.notasIdx + 1).setValue('stock_ok');
    invalidateSheetCache(CONFIG.SHEETS.CIERRE_DIA);
    invalidateSheetCache(CONFIG.SHEETS.COBRANZAS);
    invalidateSheetCache(CONFIG.SHEETS.STOCK_BEBIDAS);
    invalidateServerCacheForSheet(CONFIG.SHEETS.CIERRE_DIA);
    invalidateServerCacheForSheet(CONFIG.SHEETS.COBRANZAS);
    invalidateServerCacheForSheet(CONFIG.SHEETS.STOCK_BEBIDAS);
    invalidateServerCacheFecha(normalizeFecha(fecha));
    
    const elapsed = ((new Date().getTime() - startTime) / 1000).toFixed(2);
    Logger.log('🎉 [CIERRE] Cierre del día completado exitosamente en ' + elapsed + ' segundos');
    var productosCierre = getProductosMap();
    var faltantesStock = faltantesCierre.map(function(item) {
      var prod = findInIdMap(productosCierre, item.producto_id);
      return { producto_id: item.producto_id, producto_nombre: prod ? prod.nombre : '', faltante: item.faltante };
    });
    return { success: true, message: 'Día cerrado correctamente', tiempo: elapsed + 's', faltantes_stock: faltantesStock };
    
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

  // Verificar cuáles clientes ya tienen cobranza para esta fecha (creadas desde el paso previo)
  const existentes = getCobranzas(fecha);
  const existentesMap = {};
  existentes.forEach(function(c) { existentesMap[String(c.cliente_id)] = true; });
  
  // Agrupar por cliente
  const cobranzasPorCliente = {};
  
  precios.forEach(precio => {
    if (!cobranzasPorCliente[precio.cliente_id]) {
      cobranzasPorCliente[precio.cliente_id] = {
        cliente_id: precio.cliente_id,
        total: 0
      };
    }
    cobranzasPorCliente[precio.cliente_id].total += totalPrecioClienteLinea(precio);
  });
  
  // Crear cobranzas solo para clientes que no tienen una aún
  Object.keys(cobranzasPorCliente).forEach(clienteId => {
    if (existentesMap[String(clienteId)]) return; // ya existe, no duplicar
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

function findCierreRow(fecha) {
  var sheet = getSheet(CONFIG.SHEETS.CIERRE_DIA);
  var data = sheet.getDataRange().getValues();
  var headers = data.length ? data[0] : [];
  var fechaIdx = headers.indexOf('fecha');
  var estadoIdx = headers.indexOf('estado');
  var notasIdx = headers.indexOf('notas');
  if (fechaIdx === -1) fechaIdx = 1;
  if (estadoIdx === -1) estadoIdx = 2;
  if (notasIdx === -1) notasIdx = 3;
  var fechaNorm = normalizeFecha(fecha);

  for (var i = 1; i < data.length; i++) {
    if (normalizeFecha(data[i][fechaIdx]) === fechaNorm) {
      return {
        sheet: sheet,
        row: i + 1,
        estado: String(data[i][estadoIdx] || ''),
        notas: String(data[i][notasIdx] || ''),
        estadoIdx: estadoIdx,
        notasIdx: notasIdx
      };
    }
  }

  return { sheet: sheet, row: null, estado: '', notas: '', estadoIdx: estadoIdx, notasIdx: notasIdx };
}

function calcularDeltaStockBebidas(fecha) {
  var recepciones = getRecepcion(fecha);
  var precios = getPreciosCliente(fecha);
  var productosMap = getProductosMap();
  var delta = {};

  function add(id, qty) {
    var key = String(id);
    delta[key] = (delta[key] || 0) + qty;
  }

  recepciones.forEach(function(recepcion) {
    var producto = findInIdMap(productosMap, recepcion.producto_id);
    var confirmado = recepcion.confirmado === true || recepcion.confirmado === 'true' || recepcion.confirmado === 1;
    if (producto && confirmado) {
      add(recepcion.producto_id, parseFloat(recepcion.llego) || 0);
    }
  });

  precios.forEach(function(precio) {
    var producto = findInIdMap(productosMap, precio.producto_id);
    if (producto) {
      add(precio.producto_id, -(parseFloat(precio.cantidad) || 0));
    }
  });

  return delta;
}

function leerStockMap(sheet) {
  var data = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    map[String(data[i][0])] = {
      rowIndex: i + 1,
      stock: parseFloat(data[i][1]) || 0,
      minimo: data[i][2] || 10
    };
  }
  return map;
}

function escribirStockDesdeBase(sheet, base, delta) {
  var map = leerStockMap(sheet);
  var faltantes = [];
  Object.keys(delta).forEach(function(productoId) {
    var baseQty = base && base[productoId] !== undefined ? Number(base[productoId]) : 0;
    var bruto = Math.round((baseQty + Number(delta[productoId] || 0)) * 1000) / 1000;
    // El stock no baja de 0, pero se avisa cuánto se vendió de más (no estaba cargado).
    if (bruto < 0) faltantes.push({ producto_id: productoId, faltante: -bruto });
    var nuevo = Math.max(0, bruto);
    if (map[productoId]) {
      sheet.getRange(map[productoId].rowIndex, 2).setValue(nuevo);
    } else {
      sheet.appendRow([productoId, nuevo, 10]);
    }
  });
  return faltantes;
}

function aplicarStockCierre(fecha, cierreInfo) {
  var notas = String(cierreInfo.notas || '');
  if (notas === 'stock_ok') return;

  var stockSheet = getSheet(CONFIG.SHEETS.STOCK_BEBIDAS);
  var delta = calcularDeltaStockBebidas(fecha);
  var base = null;

  if (notas.indexOf('stock_before:') === 0) {
    try {
      base = JSON.parse(notas.substring('stock_before:'.length));
    } catch (error) {
      base = null;
    }
  }

  if (!base) {
    var actual = leerStockMap(stockSheet);
    base = {};
    Object.keys(actual).forEach(function(key) { base[key] = actual[key].stock; });
    Object.keys(delta).forEach(function(key) {
      if (base[key] === undefined) base[key] = 0;
    });
    cierreInfo.sheet.getRange(cierreInfo.row, cierreInfo.notasIdx + 1).setValue('stock_before:' + JSON.stringify(base));
    cierreInfo.notas = 'stock_before:' + JSON.stringify(base);
  }

  var faltantes = escribirStockDesdeBase(stockSheet, base, delta);
  cierreInfo.sheet.getRange(cierreInfo.row, cierreInfo.notasIdx + 1).setValue('stock_ok');
  cierreInfo.notas = 'stock_ok';
  return faltantes;
}

function actualizarStockBebidas(fecha) {
  var cierreInfo = findCierreRow(fecha);
  if (!cierreInfo.row) {
    throw new Error('No hay un cierre en curso para aplicar stock');
  }
  aplicarStockCierre(fecha, cierreInfo);
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
  var cached = readSheetValues(CONFIG.SHEETS.COBRANZAS);
  var headers = cached.headers;
  var fechaBusqueda = fecha ? normalizeFecha(fecha) : null;

  var clientes = getClientes();
  var clientesMap = {};
  clientes.forEach(function(c) { clientesMap[c.id] = c; });

  var cobranzas = [];
  var origenIdx = headers.indexOf('origen');

  cached.rows.forEach(function(row) {
    if (fechaBusqueda && normalizeFecha(row[1]) !== fechaBusqueda) {
      return;
    }
    // Una deuda cargada a mano es de antes de la app: no es la cobranza que se arma con los precios
    // de un día, así que las consultas "de un día" no la incluyen.
    if (fechaBusqueda && origenIdx !== -1 && String(row[origenIdx] || '') === 'manual') {
      return;
    }
    if (clienteId && row[2] !== clienteId) {
      return;
    }

    var cobranza = {};
    headers.forEach(function(header, index) {
      cobranza[header] = row[index];
    });

    if (cobranza.fecha) {
      cobranza.fecha = normalizeFecha(cobranza.fecha);
    }
    cobranza.total = normalizeAmount(cobranza.total);
    cobranza.pagado = normalizeAmount(cobranza.pagado);
    cobranza.saldo = normalizeAmount(cobranza.saldo);

    var cliente = clientesMap[cobranza.cliente_id];
    cobranza.cliente_nombre = cliente ? cliente.nombre : '';
    cobranza.medios = parseMedios_(cobranza.medios);
    cobranza.depositos = parseDepositos_(cobranza.depositos);

    cobranzas.push(cobranza);
  });

  return cobranzas;
}

function registrarCobro(data) {
  var parsed = normalizarMedios_(data, METODOS_CLIENTE_);
  var monto = parsed.total;
  if (monto <= 0) throw new Error('Poné cuánto te paga');

  var sheet = getSheet(CONFIG.SHEETS.COBRANZAS);
  ensureCobranzasMediosColumn_(sheet);
  var values = readUsedValues_(sheet);
  var headers = values.length ? values[0] : [];
  var idIdx = Math.max(headers.indexOf('id'), 0);
  var totalIdx = headers.indexOf('total'); if (totalIdx < 0) totalIdx = 3;
  var pagadoIdx = headers.indexOf('pagado'); if (pagadoIdx < 0) pagadoIdx = 4;
  var saldoIdx = headers.indexOf('saldo'); if (saldoIdx < 0) saldoIdx = 5;
  var estadoIdx = headers.indexOf('estado'); if (estadoIdx < 0) estadoIdx = 6;
  var mediosIdx = headers.indexOf('medios');

  for (var i = 1; i < values.length; i++) {
    if (!idsMatch(values[i][idIdx], data.cobranza_id)) continue;
    var pagado = normalizeAmount(values[i][pagadoIdx]);
    var total = normalizeAmount(values[i][totalIdx]);
    var saldoActual = Math.max(0, total - pagado);
    if (monto > saldoActual + 0.01) throw new Error('El monto supera el saldo pendiente');

    var nuevoPagado = Math.round((pagado + monto) * 100) / 100;
    var nuevoSaldo = Math.max(0, Math.round((total - nuevoPagado) * 100) / 100);
    var estado = nuevoSaldo <= 0.01 ? 'pagado' : 'parcial';
    var previos = parseMedios_(mediosIdx >= 0 ? values[i][mediosIdx] : '');
    METODOS_CLIENTE_.forEach(function(m) {
      previos[m] = Math.round((previos[m] + parsed.medios[m]) * 100) / 100;
    });

    sheet.getRange(i + 1, pagadoIdx + 1).setValue(nuevoPagado);
    sheet.getRange(i + 1, saldoIdx + 1).setValue(nuevoSaldo);
    sheet.getRange(i + 1, estadoIdx + 1).setValue(estado);
    if (mediosIdx >= 0) sheet.getRange(i + 1, mediosIdx + 1).setValue(JSON.stringify(previos));

    var depNuevos = validarDepositos_(data.depositos, parsed.medios.transferencia);
    if (depNuevos.length) {
      var depIdx = ensureCobranzasColumna_(sheet, 'depositos');
      var depPrevios = values[i].length > depIdx ? parseDepositos_(values[i][depIdx]) : [];
      sheet.getRange(i + 1, depIdx + 1).setValue(JSON.stringify(depPrevios.concat(depNuevos)));
    }

    registrarCajaMedios_(data.fecha, 'ingreso', parsed.medios, 'Cobranza', data.cobranza_id);
    invalidateSheetCache(CONFIG.SHEETS.COBRANZAS);
    invalidateServerCacheForSheet(CONFIG.SHEETS.COBRANZAS);
    return { success: true, pagado: nuevoPagado, saldo: nuevoSaldo, medios: previos };
  }

  throw new Error('Cobranza no encontrada');
}

/**
 * Devuelve el total a cobrar por cliente para una fecha, calculado desde PreciosCliente.
 * Incluye si ya existe cobranza (y cuánto se cobró).
 */
function getTotalesClientesHoy(fecha) {
  var fechaNorm = normalizeFecha(fecha);
  if (!fechaNorm) throw new Error('Fecha inválida');

  var precios = getPreciosCliente(fechaNorm);
  var cobranzas = getCobranzas(fechaNorm);

  // Agrupar precios por cliente
  var totalesPorCliente = {};
  precios.forEach(function(p) {
    var cid = String(p.cliente_id);
    if (!totalesPorCliente[cid]) {
      totalesPorCliente[cid] = {
        cliente_id: p.cliente_id,
        cliente_nombre: p.cliente_nombre || '',
        total: 0,
        items: []
      };
    }
    var subtotal = totalPrecioClienteLinea(p);
    totalesPorCliente[cid].total += subtotal;
    totalesPorCliente[cid].items.push({
      producto_nombre: p.producto_nombre || '',
      cantidad: p.cantidad,
      precio_cliente: normalizeAmount(p.precio_cliente),
      subtotal: subtotal
    });
  });

  // Enriquecer con datos de cobranza existente
  var cobranzasMap = {};
  cobranzas.forEach(function(c) { cobranzasMap[String(c.cliente_id)] = c; });

  return Object.values(totalesPorCliente).map(function(t) {
    var cob = cobranzasMap[String(t.cliente_id)];
    var pagado = cob ? normalizeAmount(cob.pagado) : 0;
    var saldo = Math.max(0, t.total - pagado);
    var estado = 'sin_cobrar';
    if (pagado > 0 && saldo <= 0) estado = 'pagado';
    else if (pagado > 0) estado = 'parcial';
    return {
      cliente_id: t.cliente_id,
      cliente_nombre: t.cliente_nombre,
      total: t.total,
      items: t.items,
      cobranza_id: cob ? cob.id : null,
      pagado: pagado,
      saldo: saldo,
      estado: estado,
      medios: cob ? parseMedios_(cob.medios) : mediosVacios_(),
      depositos: cob ? parseDepositos_(cob.depositos) : []
    };
  });
}

function sincronizarCobranzasConPrecios(fecha) {
  var fechaNorm = normalizeFecha(fecha);
  var precios = getPreciosCliente(fechaNorm);
  var totales = {};
  precios.forEach(function(p) {
    var cid = String(p.cliente_id);
    if (!totales[cid]) totales[cid] = 0;
    totales[cid] += totalPrecioClienteLinea(p);
  });

  var sheet = getSheet(CONFIG.SHEETS.COBRANZAS);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;

  var headers = data[0];
  var fechaCol = headers.indexOf('fecha') !== -1 ? headers.indexOf('fecha') : 1;
  var clienteCol = headers.indexOf('cliente_id') !== -1 ? headers.indexOf('cliente_id') : 2;
  var totalCol = headers.indexOf('total') !== -1 ? headers.indexOf('total') : 3;
  var pagadoCol = headers.indexOf('pagado') !== -1 ? headers.indexOf('pagado') : 4;
  var saldoCol = headers.indexOf('saldo') !== -1 ? headers.indexOf('saldo') : 5;
  var estadoCol = headers.indexOf('estado') !== -1 ? headers.indexOf('estado') : 6;
  var origenCol = headers.indexOf('origen');
  var changed = false;

  for (var i = 1; i < data.length; i++) {
    if (normalizeFecha(data[i][fechaCol]) !== fechaNorm) continue;
    if (origenCol !== -1 && String(data[i][origenCol] || '') === 'manual') continue;
    var cid = String(data[i][clienteCol]);
    if (totales[cid] === undefined) continue;
    var total = totales[cid];
    var pagado = normalizeAmount(data[i][pagadoCol]);
    var saldo = Math.max(0, total - pagado);
    var estado = pagado <= 0 ? 'pendiente' : (saldo <= 0 ? 'pagado' : 'parcial');
    if (normalizeAmount(data[i][totalCol]) !== total || normalizeAmount(data[i][saldoCol]) !== saldo) {
      sheet.getRange(i + 1, totalCol + 1).setValue(total);
      sheet.getRange(i + 1, saldoCol + 1).setValue(saldo);
      sheet.getRange(i + 1, estadoCol + 1).setValue(estado);
      changed = true;
    }
  }

  if (changed) {
    invalidateSheetCache(CONFIG.SHEETS.COBRANZAS);
    invalidateServerCacheForSheet(CONFIG.SHEETS.COBRANZAS);
  }
}

/**
 * Crea la cobranza del día para un cliente (si no existe) y registra el cobro.
 * data: { fecha, cliente_id, medios } — medios reparte efectivo, transferencia, cheque y tarjeta.
 * Lo que no se carga queda como saldo adeudado.
 */
function cobrarClienteHoy(data) {
  if (!data.fecha || !data.cliente_id) throw new Error('fecha y cliente_id son requeridos');
  var fechaNorm = normalizeFecha(data.fecha);
  var parsed = normalizarMedios_(data, METODOS_CLIENTE_);
  var monto = parsed.total;
  if (monto <= 0) throw new Error('El monto debe ser mayor a cero');

  // Calcular total del cliente para el día
  var precios = getPreciosCliente(fechaNorm);
  var total = 0;
  precios.forEach(function(p) {
    if (String(p.cliente_id) === String(data.cliente_id)) {
      total += totalPrecioClienteLinea(p);
    }
  });
  if (total <= 0) throw new Error('No hay precios registrados para este cliente en la fecha indicada');

  // Verificar si ya existe cobranza para esta fecha/cliente
  var cobranzasExistentes = getCobranzas(fechaNorm, data.cliente_id);
  var sheet = getSheet(CONFIG.SHEETS.COBRANZAS);
  var cobranzaId;
  var saldoDisponible = total;

  if (cobranzasExistentes.length === 0) {
    // Crear cobranza
    cobranzaId = generateId();
    sheet.appendRow([cobranzaId, fechaNorm, data.cliente_id, total, 0, total, 'pendiente']);
    invalidateSheetCache(CONFIG.SHEETS.COBRANZAS);
    invalidateServerCacheForSheet(CONFIG.SHEETS.COBRANZAS);
  } else {
    cobranzaId = cobranzasExistentes[0].id;
    var pagadoPrevio = normalizeAmount(cobranzasExistentes[0].pagado);
    saldoDisponible = Math.max(0, total - pagadoPrevio);
    if (normalizeAmount(cobranzasExistentes[0].total) !== total) {
      var cobSheet = getSheet(CONFIG.SHEETS.COBRANZAS);
      var cobValues = cobSheet.getDataRange().getValues();
      for (var r = 1; r < cobValues.length; r++) {
        if (cobValues[r][0] === cobranzaId) {
          cobSheet.getRange(r + 1, 4).setValue(total);
          cobSheet.getRange(r + 1, 6).setValue(saldoDisponible);
          invalidateSheetCache(CONFIG.SHEETS.COBRANZAS);
          invalidateServerCacheForSheet(CONFIG.SHEETS.COBRANZAS);
          break;
        }
      }
    }
  }

  if (monto > saldoDisponible) {
    throw new Error('El monto supera el saldo pendiente');
  }

  // Registrar el cobro
  var resultado = registrarCobro({
    cobranza_id: cobranzaId,
    medios: parsed.medios,
    fecha: fechaNorm,
    depositos: data.depositos
  });

  return { success: true, cobranza_id: cobranzaId, total: total, monto: monto, medios: resultado.medios, saldo: resultado.saldo };
}

/**
 * Agrega a mano lo que un cliente ya debía antes de usar la app (o una deuda vieja). Queda como una
 * cobranza pendiente más (se cobra con "Cobrar", aparece en la cuenta corriente y en los saldos),
 * marcada como "manual" para que no se confunda con la cobranza que se arma con los precios del día.
 * data: { cliente_id, fecha (anterior a hoy), total, nota? }
 */
function agregarCobranzaPendiente(data) {
  if (!data || !data.cliente_id) throw new Error('Elegí el cliente');
  var cliente = findInIdMap(getClientesMap(), data.cliente_id);
  if (!cliente) throw new Error('Ese cliente no está en el sistema. Actualizá la página y volvé a elegirlo.');
  var total = normalizeAmount(data.total);
  if (total <= 0) throw new Error('Poné cuánto te debe (un monto mayor a cero)');
  var fecha = normalizeFecha(data.fecha);
  if (!fecha) throw new Error('Poné desde qué fecha te debe');
  if (fecha >= todayArgentina()) {
    throw new Error('La fecha tiene que ser anterior a hoy. Lo de hoy se carga con los pedidos y los precios.');
  }
  var nota = limpiarTexto_(data.nota);

  var sheet = getSheet(CONFIG.SHEETS.COBRANZAS);
  ensureCobranzasMediosColumn_(sheet);
  ensureCobranzasColumna_(sheet, 'depositos');
  ensureCobranzasColumna_(sheet, 'origen');
  ensureCobranzasColumna_(sheet, 'nota');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var id = generateId();
  var valores = {
    id: id, fecha: fecha, cliente_id: data.cliente_id, total: total, pagado: 0, saldo: total,
    estado: 'pendiente', origen: 'manual', nota: nota
  };
  var fila = headers.map(function(h) { return valores[h] !== undefined ? valores[h] : ''; });
  sheet.appendRow(fila);
  invalidateSheetCache(CONFIG.SHEETS.COBRANZAS);
  invalidateServerCacheForSheet(CONFIG.SHEETS.COBRANZAS);

  return {
    id: id, fecha: fecha, cliente_id: data.cliente_id, cliente_nombre: cliente.nombre,
    total: total, pagado: 0, saldo: total, estado: 'pendiente',
    medios: mediosVacios_(), depositos: [], origen: 'manual', nota: nota
  };
}

/**
 * Deja el cobro del cliente en un monto exacto (no suma).
 * data: { fecha, cliente_id, pagado }
 */
function ajustarCobroClienteHoy(data) {
  if (!data || !data.fecha || !data.cliente_id) {
    throw new Error('fecha y cliente_id son requeridos');
  }

  var fechaNorm = normalizeFecha(data.fecha);
  var parsedMedios = data.medios != null ? normalizarMedios_(data, METODOS_CLIENTE_) : null;
  var nuevoPagado = parsedMedios ? parsedMedios.total : normalizeAmount(data.pagado);
  if (nuevoPagado < 0) throw new Error('El monto cobrado no puede ser negativo');

  var total = 0;
  getPreciosCliente(fechaNorm).forEach(function(p) {
    if (idsMatch(p.cliente_id, data.cliente_id)) total += totalPrecioClienteLinea(p);
  });
  if (total <= 0) throw new Error('No hay precios para este cliente en ese día');
  if (nuevoPagado > total + 0.01) throw new Error('El monto supera el total del día');

  var sheet = getSheet(CONFIG.SHEETS.COBRANZAS);
  var values = readUsedValues_(sheet);
  var headers = values.length ? values[0] : [];
  var idIdx = Math.max(headers.indexOf('id'), 0);
  var fechaIdx = headers.indexOf('fecha'); if (fechaIdx < 0) fechaIdx = 1;
  var clienteIdx = headers.indexOf('cliente_id'); if (clienteIdx < 0) clienteIdx = 2;
  var totalIdx = headers.indexOf('total'); if (totalIdx < 0) totalIdx = 3;
  var pagadoIdx = headers.indexOf('pagado'); if (pagadoIdx < 0) pagadoIdx = 4;
  var saldoIdx = headers.indexOf('saldo'); if (saldoIdx < 0) saldoIdx = 5;
  var estadoIdx = headers.indexOf('estado'); if (estadoIdx < 0) estadoIdx = 6;

  var origenIdxAjuste = headers.indexOf('origen');
  var rowIdx = -1;
  for (var i = 1; i < values.length; i++) {
    if (origenIdxAjuste !== -1 && String(values[i][origenIdxAjuste] || '') === 'manual') continue;
    if (normalizeFecha(values[i][fechaIdx]) === fechaNorm && idsMatch(values[i][clienteIdx], data.cliente_id)) {
      rowIdx = i;
      break;
    }
  }

  if (rowIdx === -1) {
    if (nuevoPagado <= 0) return { success: true, pagado: 0, saldo: total };
    throw new Error('Todavía no hay un cobro cargado para editar');
  }

  var pagadoActual = normalizeAmount(values[rowIdx][pagadoIdx]);
  var saldo = Math.max(0, Math.round((total - nuevoPagado) * 100) / 100);
  var estado = nuevoPagado <= 0 ? 'pendiente' : (saldo <= 0.01 ? 'pagado' : 'parcial');
  var mediosIdx = headers.indexOf('medios');
  ensureCobranzasMediosColumn_(sheet);
  if (mediosIdx < 0) {
    values = readUsedValues_(sheet);
    headers = values.length ? values[0] : [];
    mediosIdx = headers.indexOf('medios');
  }
  var viejos = parseMedios_(mediosIdx >= 0 ? values[rowIdx][mediosIdx] : '');
  if (sumaMedios_(viejos) <= 0 && pagadoActual > 0) viejos.efectivo = pagadoActual;
  var nuevos = parsedMedios ? parsedMedios.medios : mediosVacios_();
  if (!parsedMedios && nuevoPagado > 0) nuevos.efectivo = nuevoPagado;

  values[rowIdx][totalIdx] = total;
  values[rowIdx][pagadoIdx] = nuevoPagado;
  values[rowIdx][saldoIdx] = saldo;
  values[rowIdx][estadoIdx] = estado;
  if (mediosIdx >= 0) values[rowIdx][mediosIdx] = JSON.stringify(nuevos);
  sheet.getRange(rowIdx + 1, 1, 1, values[rowIdx].length).setValues([values[rowIdx]]);

  var deltas = mediosVacios_();
  METODOS_CLIENTE_.forEach(function(m) {
    deltas[m] = Math.round((normalizeAmount(nuevos[m]) - normalizeAmount(viejos[m])) * 100) / 100;
  });
  var ingresos = mediosVacios_();
  var egresos = mediosVacios_();
  METODOS_CLIENTE_.forEach(function(m) {
    if (deltas[m] > 0.009) ingresos[m] = deltas[m];
    if (deltas[m] < -0.009) egresos[m] = Math.abs(deltas[m]);
  });
  if (data.depositos != null) {
    var depAjustados = validarDepositos_(data.depositos, nuevos.transferencia);
    var depIdxAjuste = ensureCobranzasColumna_(sheet, 'depositos');
    sheet.getRange(rowIdx + 1, depIdxAjuste + 1).setValue(JSON.stringify(depAjustados));
  }

  registrarCajaMedios_(fechaNorm, 'ingreso', ingresos, 'Cobranza', values[rowIdx][idIdx]);
  registrarCajaMedios_(fechaNorm, 'egreso', egresos, 'Ajuste de cobranza', values[rowIdx][idIdx]);

  invalidateSheetCache(CONFIG.SHEETS.COBRANZAS);
  invalidateServerCacheForSheet(CONFIG.SHEETS.COBRANZAS);
  invalidateServerCacheFecha(fechaNorm);
  return { success: true, pagado: nuevoPagado, saldo: saldo, estado: estado };
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

/** Deudas a proveedores cargadas a mano (lo que se les debía antes de usar la app). */
function getDeudasProveedores() {
  var cached = readSheetValuesSiExiste_(CONFIG.SHEETS.DEUDAS_PROVEEDORES);
  return rowsToObjects(cached.headers, cached.rows).map(function(deuda) {
    deuda.fecha = normalizeFecha(deuda.fecha) || deuda.fecha;
    deuda.monto = normalizeAmount(deuda.monto);
    return deuda;
  });
}

/**
 * Suma al saldo de un proveedor lo que ya se le debía. Después se paga con "Pagar", como cualquier saldo.
 * data: { proveedor_id, fecha (hoy o antes), monto, nota? }
 */
function agregarDeudaProveedor(data) {
  if (!data || !data.proveedor_id) throw new Error('Elegí el proveedor');
  var proveedor = getProveedoresList().filter(function(p) { return idsMatch(p.id, data.proveedor_id); })[0];
  if (!proveedor) throw new Error('Ese proveedor no está en el sistema. Actualizá la página y volvé a elegirlo.');
  var monto = normalizeAmount(data.monto);
  if (monto <= 0) throw new Error('Poné cuánto le debés (un monto mayor a cero)');
  var fecha = normalizeFecha(data.fecha);
  if (!fecha) throw new Error('Poné desde qué fecha le debés');
  if (fecha > todayArgentina()) throw new Error('La fecha no puede ser futura');
  var nota = limpiarTexto_(data.nota);

  var sheet = getSheet(CONFIG.SHEETS.DEUDAS_PROVEEDORES);
  var id = generateId();
  sheet.appendRow([id, fecha, data.proveedor_id, monto, nota]);
  invalidateSheetCache(CONFIG.SHEETS.DEUDAS_PROVEEDORES);
  invalidateServerCacheForSheet(CONFIG.SHEETS.DEUDAS_PROVEEDORES);

  return { id: id, fecha: fecha, proveedor_id: data.proveedor_id, proveedor_nombre: proveedor.nombre, monto: monto, nota: nota };
}

function registrarPago(data) {
  var parsed = normalizarMedios_(data, METODOS_PROVEEDOR_);
  var monto = parsed.total;
  if (monto <= 0) throw new Error('Poné cuánto le pagás');
  var saldoPendiente = calcularSaldoProveedor(data.proveedor_id);
  var anticipo = data.anticipo === true || data.anticipo === 'true';
  if (!anticipo && monto > saldoPendiente + 0.01) {
    throw new Error('El monto supera el saldo pendiente');
  }

  var sheet = getSheet(CONFIG.SHEETS.PAGOS_PROVEEDORES);
  var fecha = data.fecha || todayArgentina();
  var nota = data.nota || (anticipo ? 'Pago al hacer el pedido' : '');
  var primerId = null;
  METODOS_PROVEEDOR_.forEach(function(metodo) {
    var parte = normalizeAmount(parsed.medios[metodo]);
    if (parte <= 0.009) return;
    var id = generateId();
    if (!primerId) primerId = id;
    sheet.appendRow([id, fecha, data.proveedor_id, parte, metodo, nota]);
  });
  invalidateSheetCache(CONFIG.SHEETS.PAGOS_PROVEEDORES);
  invalidateServerCacheForSheet(CONFIG.SHEETS.PAGOS_PROVEEDORES);

  registrarCajaMedios_(fecha, 'egreso', parsed.medios, 'Pago a proveedor', data.proveedor_id);

  return { id: primerId, monto: monto, medios: parsed.medios, proveedor_id: data.proveedor_id };
}

// ========== STOCK ==========

function getStock() {
  var cached = readSheetValues(CONFIG.SHEETS.STOCK_BEBIDAS);
  var stockPorId = {};
  cached.rows.forEach(function(row) {
    if (!row[0]) return;
    stockPorId[String(row[0])] = {
      stock_actual: row[1] || 0,
      minimo: row[2] || 10
    };
  });

  return getProductos().map(function(producto) {
    var item = stockPorId[String(producto.id)] || { stock_actual: 0, minimo: 10 };
    return {
      producto_id: producto.id,
      producto_nombre: producto.nombre,
      tipo: producto.tipo || '',
      unidad: producto.unidad || '',
      stock_actual: item.stock_actual,
      minimo: item.minimo
    };
  });
}

function updateStock(data) {
  const sheet = getSheet(CONFIG.SHEETS.STOCK_BEBIDAS);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (idsMatch(values[i][0], data.producto_id)) {
      sheet.getRange(i + 1, 2).setValue(data.cantidad);
      invalidateSheetCache(CONFIG.SHEETS.STOCK_BEBIDAS);
      invalidateServerCacheForSheet(CONFIG.SHEETS.STOCK_BEBIDAS);
      return { success: true };
    }
  }
  
  sheet.appendRow([data.producto_id, data.cantidad, 10]);
  invalidateSheetCache(CONFIG.SHEETS.STOCK_BEBIDAS);
  invalidateServerCacheForSheet(CONFIG.SHEETS.STOCK_BEBIDAS);
  return { success: true };
}

function deleteStock(productoId) {
  const sheet = getSheet(CONFIG.SHEETS.STOCK_BEBIDAS);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (idsMatch(values[i][0], productoId)) {
      sheet.deleteRow(i + 1);
      invalidateSheetCache(CONFIG.SHEETS.STOCK_BEBIDAS);
      invalidateServerCacheForSheet(CONFIG.SHEETS.STOCK_BEBIDAS);
      return { success: true };
    }
  }
  
  throw new Error('Registro de stock no encontrado');
}

// ========== CAJA ==========

function formatPesos_(n) {
  var entero = Math.round(Math.abs(normalizeAmount(n)));
  var texto = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (normalizeAmount(n) < 0 ? '-$ ' : '$ ') + texto;
}

/**
 * El efectivo que entra de un cliente se anota a su saldo y, de ese mismo
 * dinero, se le puede dar a uno o más proveedores. Cada saldo baja.
 * Lo que no se reparte queda en la caja.
 * data: { fecha, cliente_id, monto, pagos: [{ proveedor_id, monto }] }
 */
function repartirEfectivo(data) {
  if (!data || !data.cliente_id) throw new Error('Elegí el cliente');
  var fecha = normalizeFecha(data.fecha) || todayArgentina();
  var monto = normalizeAmount(data.monto);
  if (monto <= 0) throw new Error('Poné cuánto entró en efectivo');

  var pagosMap = {};
  (data.pagos || []).forEach(function(pago) {
    if (!pago || !pago.proveedor_id) return;
    var parte = normalizeAmount(pago.monto);
    if (parte <= 0) return;
    var id = String(pago.proveedor_id);
    pagosMap[id] = Math.round(((pagosMap[id] || 0) + parte) * 100) / 100;
  });
  var pagos = Object.keys(pagosMap).map(function(id) {
    return { proveedor_id: id, monto: pagosMap[id] };
  });
  var totalPagos = pagos.reduce(function(suma, pago) { return suma + pago.monto; }, 0);
  totalPagos = Math.round(totalPagos * 100) / 100;
  if (totalPagos > monto + 0.01) {
    throw new Error('Estás repartiendo ' + formatPesos_(totalPagos) + ' y solo entraron ' + formatPesos_(monto));
  }

  pagos.forEach(function(pago) {
    var saldo = calcularSaldoProveedor(pago.proveedor_id);
    if (pago.monto > saldo + 0.01) {
      throw new Error('Le querés dar ' + formatPesos_(pago.monto) + ' a un proveedor y le debés ' + formatPesos_(saldo));
    }
  });

  var plan = planCobroCliente_(data.cliente_id, fecha, monto);
  plan.partes.forEach(function(parte) {
    if (parte.cobranza_id) {
      registrarCobro({
        cobranza_id: parte.cobranza_id,
        fecha: fecha,
        medios: { efectivo: parte.monto }
      });
    } else {
      cobrarClienteHoy({
        fecha: parte.fecha,
        cliente_id: data.cliente_id,
        medios: { efectivo: parte.monto }
      });
    }
  });

  pagos.forEach(function(pago) {
    registrarPago({
      fecha: fecha,
      proveedor_id: pago.proveedor_id,
      medios: { efectivo: pago.monto },
      nota: 'Reparto de caja'
    });
  });

  return {
    success: true,
    cobrado: monto,
    repartido: totalPagos,
    queda: Math.round((monto - totalPagos) * 100) / 100
  };
}

function planCobroCliente_(clienteId, fechaCaja, monto) {
  var cobranzas = getCobranzas().filter(function(c) {
    return idsMatch(c.cliente_id, clienteId) && normalizeAmount(c.saldo) > 0.01;
  }).sort(function(a, b) {
    return String(a.fecha || '').localeCompare(String(b.fecha || ''));
  });

  var cubiertaHoy = cobranzas.some(function(c) { return c.fecha === fechaCaja && c.origen !== 'manual'; });
  var hoyExtra = 0;
  if (!cubiertaHoy) {
    getPreciosCliente(fechaCaja).forEach(function(p) {
      if (idsMatch(p.cliente_id, clienteId)) hoyExtra += totalPrecioClienteLinea(p);
    });
    hoyExtra = Math.round(hoyExtra * 100) / 100;
  }

  var deuda = cobranzas.reduce(function(suma, c) { return suma + normalizeAmount(c.saldo); }, 0) + hoyExtra;
  deuda = Math.round(deuda * 100) / 100;
  if (deuda <= 0.01) throw new Error('Ese cliente no tiene saldo para descontar');
  if (monto > deuda + 0.01) {
    throw new Error('El cliente debe ' + formatPesos_(deuda) + '. No podés anotar ' + formatPesos_(monto));
  }

  var restante = monto;
  var partes = [];
  cobranzas.forEach(function(c) {
    if (restante <= 0.01) return;
    var parte = Math.min(restante, normalizeAmount(c.saldo));
    parte = Math.round(parte * 100) / 100;
    if (parte <= 0) return;
    partes.push({ cobranza_id: c.id, monto: parte });
    restante = Math.round((restante - parte) * 100) / 100;
  });
  if (restante > 0.01 && hoyExtra > 0.01) {
    partes.push({ fecha: fechaCaja, monto: Math.round(Math.min(restante, hoyExtra) * 100) / 100 });
  }
  return { partes: partes, deuda: deuda };
}

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
  const tipoMovimiento = String(data.tipo || '').toLowerCase();
  if (tipoMovimiento !== 'ingreso' && tipoMovimiento !== 'egreso') {
    throw new Error('El tipo de movimiento tiene que ser ingreso o egreso');
  }
  if (monto <= 0) throw new Error('El monto tiene que ser mayor a cero');
  
  sheet.appendRow([
    id,
    data.fecha || todayArgentina(),
    tipoMovimiento,
    monto,
    data.nota || '',
    data.referencia || ''
  ]);
  
  return { id: id, ...data, tipo: tipoMovimiento, monto: monto };
}

// ========== FLUJO — DÍAS PENDIENTES ==========

/**
 * Días con pedidos que aún no fueron cerrados (pueden tener recepción al día siguiente).
 * Optimizado: un solo scan de hojas, sin getPedidos() por cada fecha.
 */
function getDiasPendientes() {
  var scDias = serverCacheGet('sc:dias');
  if (scDias) return scDias;

  var pedidosCached = readSheetValues(CONFIG.SHEETS.PEDIDOS);
  var cierresCached = readSheetValues(CONFIG.SHEETS.CIERRE_DIA);
  var recepcionCached = readSheetValues(CONFIG.SHEETS.RECEPCION);
  var preciosCached = readSheetValues(CONFIG.SHEETS.PRECIOS_CLIENTE);

  var headersP = pedidosCached.headers;
  var fechaIdx = headersP.indexOf('fecha');
  if (fechaIdx === -1) fechaIdx = 1;
  var clienteIdx = headersP.indexOf('cliente_id');
  var productoIdx = headersP.indexOf('producto_id');
  if (clienteIdx === -1) clienteIdx = 2;
  if (productoIdx === -1) productoIdx = 3;

  var pedidosPorFecha = {};
  pedidosCached.rows.forEach(function(row) {
    var f = normalizeFecha(row[fechaIdx]);
    if (!f) return;
    if (!pedidosPorFecha[f]) pedidosPorFecha[f] = [];
    pedidosPorFecha[f].push({
      cliente_id: row[clienteIdx],
      producto_id: row[productoIdx]
    });
  });

  var cierreFechaIdx = cierresCached.headers.indexOf('fecha');
  if (cierreFechaIdx === -1) cierreFechaIdx = 1;
  var cierreEstadoIdx = cierresCached.headers.indexOf('estado');
  var fechasCerradas = {};
  cierresCached.rows.forEach(function(row) {
    var f = normalizeFecha(row[cierreFechaIdx]);
    var estado = cierreEstadoIdx !== -1 ? String(row[cierreEstadoIdx] || '') : 'cerrado';
    if (f && estado !== 'cerrando') fechasCerradas[f] = true;
  });

  var recHeaders = recepcionCached.headers;
  var recFechaIdx = recHeaders.indexOf('fecha');
  if (recFechaIdx === -1) recFechaIdx = 1;
  var recProdIdx = recHeaders.indexOf('producto_id');
  var recLlegoIdx = recHeaders.indexOf('llego');
  var recPrecioIdx = recHeaders.indexOf('precio_real');
  var recConfirmIdx = recHeaders.indexOf('confirmado');
  if (recProdIdx === -1) recProdIdx = 2;

  var recepcionPorFecha = {};
  recepcionCached.rows.forEach(function(row) {
    var f = normalizeFecha(row[recFechaIdx]);
    if (!f) return;
    if (!recepcionPorFecha[f]) recepcionPorFecha[f] = {};
    recepcionPorFecha[f][String(row[recProdIdx])] = {
      producto_id: row[recProdIdx],
      llego: recLlegoIdx !== -1 ? row[recLlegoIdx] : null,
      precio_real: recPrecioIdx !== -1 ? row[recPrecioIdx] : 0,
      confirmado: recConfirmIdx !== -1 ? row[recConfirmIdx] : false
    };
  });

  var precHeaders = preciosCached.headers;
  var prFechaIdx = precHeaders.indexOf('fecha');
  var prClienteIdx = precHeaders.indexOf('cliente_id');
  var prProductoIdx = precHeaders.indexOf('producto_id');
  var prPrecioIdx = precHeaders.indexOf('precio_cliente');
  if (prFechaIdx === -1) prFechaIdx = 1;

  var preciosPorFecha = {};
  preciosCached.rows.forEach(function(row) {
    var f = normalizeFecha(row[prFechaIdx]);
    if (!f) return;
    if (!preciosPorFecha[f]) preciosPorFecha[f] = [];
    preciosPorFecha[f].push({
      cliente_id: prClienteIdx !== -1 ? row[prClienteIdx] : null,
      producto_id: prProductoIdx !== -1 ? row[prProductoIdx] : null,
      precio_cliente: prPrecioIdx !== -1 ? row[prPrecioIdx] : null
    });
  });

  var hoy = todayArgentina();
  var fechasAProcesar = Object.keys(pedidosPorFecha);
  if (!fechasCerradas[hoy] && fechasAProcesar.indexOf(hoy) === -1) {
    fechasAProcesar.push(hoy);
    pedidosPorFecha[hoy] = [];
  }

  var resultado = [];

  fechasAProcesar.forEach(function(fecha) {
    var pedidos = pedidosPorFecha[fecha] || [];
    var pedidosCount = pedidos.length;

    if (fechasCerradas[fecha]) {
      if (fecha === hoy) {
        resultado.push({
          fecha: fecha,
          pedidos_count: pedidosCount,
          recepcion_confirmada: true,
          precios_completos: true,
          recepcion_confirmados: 0,
          recepcion_total: 0,
          estado: 'cerrado'
        });
      }
      return;
    }

    if (pedidosCount === 0 && fecha !== hoy) return;

    var estadoDia = calcularEstadoDiaDesdeCache(
      pedidos,
      recepcionPorFecha[fecha] || {},
      preciosPorFecha[fecha] || []
    );

    resultado.push({
      fecha: fecha,
      pedidos_count: pedidosCount,
      recepcion_confirmada: estadoDia.recepcionOk,
      precios_completos: estadoDia.preciosOk,
      recepcion_confirmados: estadoDia.recepcion_confirmados || 0,
      recepcion_total: estadoDia.recepcion_total || 0,
      estado: estadoDia.estado
    });
  });

  resultado.sort(function(a, b) {
    return a.fecha.localeCompare(b.fecha);
  });

  serverCacheSet('sc:dias', resultado, SERVER_CACHE_TTL.dias);
  return resultado;
}

/**
 * Pedidos + recepción + precios del día en una sola ejecución (flujo operativo).
 */
function getFlujoDia(fecha) {
  var fechaNorm = fecha ? normalizeFecha(fecha) : todayArgentina();
  var scKey = 'sc:flujo:' + fechaNorm;
  var sc = serverCacheGet(scKey);
  if (sc) return sc;

  var result = {
    fecha: fechaNorm,
    pedidos: getPedidos(fechaNorm),
    recepcion: getRecepcion(fechaNorm),
    precios: getPreciosCliente(fechaNorm)
  };
  serverCacheSet(scKey, result, SERVER_CACHE_TTL.flujo);
  return result;
}

function calcularEstadoDiaDesdeCache(pedidos, recepcionMap, preciosList) {
  if (!pedidos || pedidos.length === 0) {
    return {
      recepcionOk: false,
      preciosOk: false,
      estado: 'nuevo',
      recepcion_confirmados: 0,
      recepcion_total: 0
    };
  }

  var productosPedidos = {};
  pedidos.forEach(function(p) {
    productosPedidos[String(p.producto_id)] = true;
  });

  var totalProductos = Object.keys(productosPedidos).length;
  var confirmados = 0;
  var recepcionOk = true;

  Object.keys(productosPedidos).forEach(function(productoId) {
    var rec = recepcionMap[productoId];
    if (!rec) {
      Object.keys(recepcionMap).forEach(function(k) {
        if (idsMatch(k, productoId)) rec = recepcionMap[k];
      });
    }
    if (recepcionProductoConfirmada(rec)) {
      confirmados++;
    } else {
      recepcionOk = false;
    }
  });

  var preciosOk = pedidos.every(function(p) {
    return pedidoTienePrecioCliente(p, preciosList, recepcionDeProducto(recepcionMap, p.producto_id));
  });

  var estado = 'recepcion_pendiente';
  if (recepcionOk && !preciosOk) estado = 'precios_pendiente';
  if (recepcionOk && preciosOk) estado = 'listo_cierre';

  return {
    recepcionOk: recepcionOk,
    preciosOk: preciosOk,
    estado: estado,
    recepcion_confirmados: confirmados,
    recepcion_total: totalProductos
  };
}

function calcularEstadoDia(fecha, pedidos) {
  if (!pedidos || pedidos.length === 0) {
    return {
      recepcionOk: false,
      preciosOk: false,
      estado: 'nuevo',
      recepcion_confirmados: 0,
      recepcion_total: 0
    };
  }

  var recepciones = getRecepcion(fecha);
  var recepcionMap = {};
  recepciones.forEach(function(r) {
    recepcionMap[r.producto_id] = r;
  });

  var productosPedidos = {};
  pedidos.forEach(function(p) {
    productosPedidos[p.producto_id] = true;
  });

  var totalProductos = Object.keys(productosPedidos).length;
  var confirmados = 0;
  var recepcionOk = true;

  Object.keys(productosPedidos).forEach(function(productoId) {
    var rec = recepcionMap[productoId];
    if (recepcionProductoConfirmada(rec)) {
      confirmados++;
    } else {
      recepcionOk = false;
    }
  });

  var precios = getPreciosCliente(fecha);
  var preciosOk = pedidos.every(function(p) {
    return pedidoTienePrecioCliente(p, precios, recepcionDeProducto(recepcionMap, p.producto_id));
  });

  var estado = 'recepcion_pendiente';
  if (recepcionOk && !preciosOk) estado = 'precios_pendiente';
  if (recepcionOk && preciosOk) estado = 'listo_cierre';

  return {
    recepcionOk: recepcionOk,
    preciosOk: preciosOk,
    estado: estado,
    recepcion_confirmados: confirmados,
    recepcion_total: totalProductos
  };
}

// ========== HISTORIAL ==========

function getHistorial() {
  return getCierres();
}

// ========== REPORTES DE CIERRE EN GOOGLE DRIVE ==========
// Al cerrar el día, la app arma el PDF del cierre y lo manda acá. Se guarda en el Drive de la cuenta
// dueña del script, en una carpeta por planilla (los usuarios que comparten planilla comparten carpeta):
//   Cierres - <nombre de la planilla> / 2026 / 10 - Octubre / Cierre 2026-10-23.pdf
// La carpeta se comparte desde la app (Historial) con los emails que tengan que verla.

var MESES_DRIVE_ = ['01 - Enero', '02 - Febrero', '03 - Marzo', '04 - Abril', '05 - Mayo', '06 - Junio',
  '07 - Julio', '08 - Agosto', '09 - Septiembre', '10 - Octubre', '11 - Noviembre', '12 - Diciembre'];

/** Corre algo de Drive y, si Google todavía no dio permiso, lo dice claro. */
function conDrive_(fn) {
  try {
    return fn();
  } catch (error) {
    if (/permission|permiso|autoriz|authoriz/i.test(String(error && error.message))) {
      throw new Error('Google Drive todavía no está autorizado. En el editor del script hay que ejecutar una vez la función "autorizarDrive". (Detalle de Google: ' + error.message + ')');
    }
    throw error;
  }
}

/** Carpeta de cierres de la planilla actual. Sin "crear" devuelve null si todavía no existe. */
function carpetaCierres_(crear) {
  var props = PropertiesService.getScriptProperties();
  var key = 'DRIVE_CIERRES_' + tenantClave_();
  var id = props.getProperty(key);
  if (id) {
    try {
      var carpeta = DriveApp.getFolderById(id);
      if (!carpeta.isTrashed()) return carpeta;
    } catch (error) {
      // La borraron: se crea otra.
    }
  }
  if (!crear) return null;
  var nueva = DriveApp.createFolder('Cierres - ' + getSpreadsheet().getName());
  props.setProperty(key, nueva.getId());
  return nueva;
}

function subcarpeta_(padre, nombre) {
  var existentes = padre.getFoldersByName(nombre);
  return existentes.hasNext() ? existentes.next() : padre.createFolder(nombre);
}

/** Guarda el PDF de un día cerrado. Si ya había uno de ese día, lo reemplaza. */
function guardarPdfCierreEnDrive(data) {
  var fecha = normalizeFecha(data.fecha);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Fecha inválida para el reporte del cierre');
  var cierre = findCierreRow(fecha);
  if (!cierre.row || cierre.estado !== 'cerrado') throw new Error('El día ' + fecha + ' todavía no está cerrado');

  var contenido = String(data.pdf || '');
  if (contenido.indexOf(',') !== -1) contenido = contenido.substring(contenido.indexOf(',') + 1);
  var bytes = contenido ? Utilities.base64Decode(contenido) : [];
  // Todo PDF empieza con "%PDF".
  if (bytes.length < 5 || bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 70) {
    throw new Error('El reporte que llegó no es un PDF');
  }

  return conDrive_(function() {
    var partes = fecha.split('-');
    var raiz = carpetaCierres_(true);
    var carpeta = subcarpeta_(subcarpeta_(raiz, partes[0]), MESES_DRIVE_[Number(partes[1]) - 1]);
    var nombre = 'Cierre ' + fecha + '.pdf';

    var anteriores = [];
    var mismos = carpeta.getFilesByName(nombre);
    while (mismos.hasNext()) anteriores.push(mismos.next());
    var archivo = carpeta.createFile(Utilities.newBlob(bytes, 'application/pdf', nombre));
    anteriores.forEach(function(viejo) { viejo.setTrashed(true); });

    ensureColumn(cierre.sheet, 'pdf_drive');
    var headers = cierre.sheet.getRange(1, 1, 1, cierre.sheet.getLastColumn()).getValues()[0];
    cierre.sheet.getRange(cierre.row, headers.indexOf('pdf_drive') + 1).setValue(archivo.getUrl());

    return { fecha: fecha, nombre: nombre, url: archivo.getUrl(), carpeta_url: raiz.getUrl() };
  });
}

function emailsConAcceso_(carpeta) {
  var dueno = '';
  try { dueno = String(carpeta.getOwner().getEmail() || '').toLowerCase(); } catch (error) { /* sin dueño visible */ }
  return carpeta.getEditors()
    .map(function(u) { return String(u.getEmail() || '').toLowerCase(); })
    .filter(function(email) { return email && email !== dueno; });
}

/** Link de la carpeta y con quién está compartida (no crea nada). */
function getDriveConfig() {
  return conDrive_(function() {
    var carpeta = carpetaCierres_(false);
    if (!carpeta) return { carpeta_url: '', compartida_con: [] };
    return { carpeta_url: carpeta.getUrl(), compartida_con: emailsConAcceso_(carpeta) };
  });
}

function validarEmailDrive_(email) {
  var limpio = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) throw new Error('El email no es válido');
  return limpio;
}

/** Da acceso de edición a la carpeta de cierres (Google le avisa por email a esa persona). */
function compartirCarpetaCierres(email) {
  var limpio = validarEmailDrive_(email);
  return conDrive_(function() {
    var carpeta = carpetaCierres_(true);
    carpeta.addEditor(limpio);
    return { carpeta_url: carpeta.getUrl(), compartida_con: emailsConAcceso_(carpeta) };
  });
}

function quitarAccesoCarpetaCierres(email) {
  var limpio = validarEmailDrive_(email);
  return conDrive_(function() {
    var carpeta = carpetaCierres_(false);
    if (!carpeta) return { carpeta_url: '', compartida_con: [] };
    carpeta.removeEditor(limpio);
    return { carpeta_url: carpeta.getUrl(), compartida_con: emailsConAcceso_(carpeta) };
  });
}

/**
 * EJECUTAR UNA VEZ desde el editor después de pegar esta versión: Google pide permiso para usar
 * Drive (donde se guardan los PDF de los cierres). Sin esto la app no puede guardar los reportes.
 */
function autorizarDrive() {
  // Crea y borra una carpeta de prueba: así Google pide el permiso completo de Drive (el mismo que
  // se usa para guardar los PDF), no solo el de lectura.
  var prueba = DriveApp.createFolder('Prueba de permisos - se borra sola');
  prueba.setTrashed(true);
  Logger.log('✅ Drive autorizado. Los reportes de cierre se guardan en tu Drive, en la carpeta "Cierres - …".');
}

// ========== FUNCIONES DE PRUEBA ==========

/**
 * Función de prueba - verifica que el script puede acceder a la hoja y funciones básicas
 * Para usar: Selecciona esta función en el menú y haz clic en "Ejecutar"
 */
function testConexion() {
  try {
    Logger.log('🧪 Iniciando prueba de conexión...');
    setTenant_(Object.keys(CONFIG.USERS)[0]);
    
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

// ========== WHATSAPP (META API + BRIDGE) ==========

function getWhatsAppConfig() {
  const config = getConfiguracionNotificaciones();
  const autoEnvio = config.whatsapp_auto_envio === true || config.whatsapp_auto_envio === 'true';
  const modo = String(config.whatsapp_modo || 'manual').trim().toLowerCase();

  return {
    autoEnvio: autoEnvio,
    modo: modo,
    token: String(config.whatsapp_token || '').trim(),
    phoneId: String(config.whatsapp_phone_id || '').trim(),
    bridgeUrl: String(config.whatsapp_bridge_url || '').trim().replace(/\/$/, ''),
    bridgeKey: String(config.whatsapp_bridge_key || '').trim()
  };
}

function normalizeWhatsAppPhone(telefono) {
  if (!telefono) {
    throw new Error('Teléfono no proporcionado');
  }

  let digits = String(telefono).trim();

  if (digits.indexOf('+') === 0) {
    digits = digits.slice(1).replace(/\D/g, '');
  } else {
    digits = digits.replace(/\D/g, '');
    if (digits.indexOf('00') === 0) {
      digits = digits.slice(2);
    } else if (digits.indexOf('0') === 0) {
      digits = digits.slice(1);
    }

    if (digits.length >= 10 && digits.length <= 11 && digits.indexOf('54') !== 0) {
      digits = '54' + digits;
    }
  }

  if (digits.length < 10 || digits.length > 15) {
    throw new Error('Teléfono inválido para WhatsApp: ' + telefono);
  }

  return digits;
}

function getWhatsAppStatus() {
  const waConfig = getWhatsAppConfig();

  if (!waConfig.autoEnvio) {
    return { autoEnvioActivo: false, modo: waConfig.modo };
  }

  if (waConfig.modo === 'meta' && waConfig.token && waConfig.phoneId) {
    return { autoEnvioActivo: true, modo: 'meta' };
  }

  if (waConfig.modo === 'bridge' && waConfig.bridgeUrl && waConfig.bridgeKey) {
    try {
      const response = UrlFetchApp.fetch(waConfig.bridgeUrl + '/api/status', {
        method: 'get',
        headers: { 'X-API-Key': waConfig.bridgeKey },
        muteHttpExceptions: true
      });

      const body = JSON.parse(response.getContentText() || '{}');
      const connected = body.connected === true;

      return {
        autoEnvioActivo: connected,
        modo: 'bridge',
        bridgeConectado: connected,
        bridgeEsperandoQr: body.waitingForQr === true
      };
    } catch (error) {
      Logger.log('Error consultando WhatsApp Bridge: ' + error.toString());
      return {
        autoEnvioActivo: false,
        modo: 'bridge',
        bridgeConectado: false,
        error: 'No se pudo conectar al WhatsApp Bridge'
      };
    }
  }

  return { autoEnvioActivo: false, modo: waConfig.modo };
}

function enviarMensajeWhatsAppBridge(telefono, mensaje, waConfig) {
  if (!waConfig.bridgeUrl || !waConfig.bridgeKey) {
    throw new Error(
      'WhatsApp Bridge no configurado. Agregue whatsapp_bridge_url y whatsapp_bridge_key en Configuracion.'
    );
  }

  const response = UrlFetchApp.fetch(waConfig.bridgeUrl + '/api/send', {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': waConfig.bridgeKey
    },
    payload: JSON.stringify({
      phone: telefono,
      message: String(mensaje)
    }),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();
  let body = {};

  try {
    body = JSON.parse(responseText);
  } catch (err) {
    throw new Error('Respuesta inválida del WhatsApp Bridge');
  }

  if (statusCode >= 400 || body.success === false) {
    throw new Error(body.error || ('WhatsApp Bridge error HTTP ' + statusCode));
  }

  return {
    success: true,
    messageId: body.messageId || null,
    provider: 'bridge'
  };
}

/**
 * Envía un mensaje de texto vía WhatsApp Business Cloud API (Meta).
 */
function enviarMensajeWhatsAppMeta(telefono, mensaje, waConfig) {
  if (!waConfig.token || !waConfig.phoneId) {
    throw new Error(
      'WhatsApp Meta API no configurada. Agregue whatsapp_token y whatsapp_phone_id en Configuracion.'
    );
  }

  const url = 'https://graph.facebook.com/v21.0/' + waConfig.phoneId + '/messages';
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefono,
    type: 'text',
    text: {
      preview_url: false,
      body: String(mensaje)
    }
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + waConfig.token,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();
  let body = {};

  try {
    body = JSON.parse(responseText);
  } catch (err) {
    throw new Error('Respuesta inválida de WhatsApp API');
  }

  if (statusCode >= 400) {
    const apiMessage = body.error && body.error.message ? body.error.message : responseText;
    throw new Error('WhatsApp API: ' + apiMessage);
  }

  return {
    success: true,
    messageId: body.messages && body.messages[0] ? body.messages[0].id : null,
    provider: 'meta'
  };
}

/**
 * Envía un mensaje según el modo configurado (bridge | meta).
 */
function enviarMensajeWhatsApp(telefono, mensaje) {
  if (!mensaje || !String(mensaje).trim()) {
    throw new Error('Mensaje vacío');
  }

  const waConfig = getWhatsAppConfig();
  const phone = normalizeWhatsAppPhone(telefono);

  if (waConfig.modo === 'bridge') {
    return enviarMensajeWhatsAppBridge(phone, mensaje, waConfig);
  }

  if (waConfig.modo === 'meta') {
    return enviarMensajeWhatsAppMeta(phone, mensaje, waConfig);
  }

  throw new Error(
    'Envío automático desactivado. Configure whatsapp_modo=bridge o whatsapp_modo=meta en Configuracion.'
  );
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
  
  // Las hojas creadas antes de este cambio guardaron como "email" una dirección ajena
  // (admin@lucianocargas.com) con las alertas activadas: se la trata como no configurada.
  if (String(config.email_notificaciones || '').trim().toLowerCase() === 'admin@lucianocargas.com') {
    config.email_notificaciones = '';
  }
  if (!config.email_notificaciones) {
    config.email_notificaciones = '';
  }
  if (config.notificaciones_activas === undefined || !config.email_notificaciones) {
    config.notificaciones_activas = false;
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
    
    if (!config.email_notificaciones) {
      Logger.log('⚠️ No hay email configurado: no se envía nada');
      return { success: false, message: 'Todavía no configuraste un email para las alertas. Entrá a "Configurar notificaciones", poné tu email y activalas.', productos: [] };
    }
    if (!config.notificaciones_activas) {
      Logger.log('⚠️ Notificaciones desactivadas');
      return { success: false, message: 'Las notificaciones están desactivadas. Activalas en "Configurar notificaciones".', productos: [] };
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
      throw new Error('No hay email de destino: configurá uno en "Configurar notificaciones".');
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
    paraCadaUsuario_(function(email) {
      const resultado = ejecutarConReintentos(function() {
        return verificarStockBajo();
      }, 3, 4000);
      Logger.log('✅ Verificación programada OK para ' + email + ': ' + JSON.stringify(resultado));
    });
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
    setTenant_(Object.keys(CONFIG.USERS)[0]);
    
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
 * Resumen del dashboard en una sola llamada (pedidos, cobranzas, stock, top productos).
 */
function getDashboardResumen(fecha, dias, limite) {
  var fechaNorm = fecha ? normalizeFecha(fecha) : todayArgentina();
  return {
    fecha: fechaNorm,
    pedidos: getPedidos(fechaNorm),
    cobranzas: getCobranzas(),
    stock: getStock(),
    topProductos: getTopProductosVendidos(dias || 7, limite || 5)
  };
}

/**
 * Bootstrap: catálogo + dashboard en una sola ejecución GAS (comparte caché de hojas).
 */
function getAppBootstrap(fecha, dias, limite) {
  var fechaNorm = fecha ? normalizeFecha(fecha) : todayArgentina();
  var cacheKey = 'sc:boot:' + fechaNorm;
  var cached = serverCacheGet(cacheKey);
  if (cached) return cached;

  var cobranzas = getCobranzas().filter(function(c) {
    return normalizeAmount(c.saldo) > 0;
  });
  var result = {
    clientes: getClientes(),
    productos: getProductos(),
    proveedores: getProveedores(),
    diasPendientes: getDiasPendientes(),
    dashboard: {
      fecha: fechaNorm,
      pedidos: getPedidos(fechaNorm),
      recepcion: getRecepcion(fechaNorm),
      precios: getPreciosCliente(fechaNorm),
      cobranzas: cobranzas,
      stock: getStock(),
      topProductos: getTopProductosVendidos(dias || 7, limite || 5)
    }
  };
  serverCacheSet(cacheKey, result, 90);
  return result;
}

/**
 * Obtiene los productos más vendidos en los últimos X días
 * @param {number} dias - Número de días a analizar (por defecto 7)
 * @param {number} limite - Cantidad de productos a retornar (por defecto 5)
 * @return {Array} Array de productos con su cantidad vendida
 */
function getTopProductosVendidos(dias = 7, limite = 5) {
  try {
    var cached = readSheetValues(CONFIG.SHEETS.PEDIDOS);
    var headers = cached.headers;

    var fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - dias);

    var productos = getProductos();
    var productosMap = {};
    productos.forEach(function(p) { productosMap[p.id] = p; });

    var productoIdIndex = headers.indexOf('producto_id');
    var cantidadIndex = headers.indexOf('cantidad');
    var fechaIndex = headers.indexOf('fecha');

    var contadorProductos = {};

    cached.rows.forEach(function(row) {
      var fechaPedido = row[fechaIndex];
      var fechaPedidoDate;
      if (typeof fechaPedido === 'string') {
        var partes = fechaPedido.split('-');
        fechaPedidoDate = new Date(partes[0], partes[1] - 1, partes[2]);
      } else {
        fechaPedidoDate = new Date(fechaPedido);
      }

      if (fechaPedidoDate >= fechaLimite) {
        var productoId = row[productoIdIndex];
        if (!productoId || !productosMap[productoId]) return;

        var cantidad = parseFloat(row[cantidadIndex]) || 0;
        contadorProductos[productoId] = (contadorProductos[productoId] || 0) + cantidad;
      }
    });

    var productosArray = [];
    for (var productoId in contadorProductos) {
      var producto = productosMap[productoId];
      if (producto) {
        productosArray.push({
          id: productoId,
          nombre: producto.nombre,
          cantidad: contadorProductos[productoId]
        });
      }
    }

    productosArray.sort(function(a, b) { return b.cantidad - a.cantidad; });
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
    if (!usuarioConfig_(email)) {
      Logger.log('❌ Usuario no encontrado: ' + email);
      return {
        success: false,
        error: 'Credenciales inválidas'
      };
    }
    
    // Verificar contraseña
    if (usuarioConfig_(email).password !== password) {
      Logger.log('❌ Contraseña incorrecta para: ' + email);
      return {
        success: false,
        error: 'Credenciales inválidas'
      };
    }
    
    // Login exitoso - generar token simple
    setTenant_(email); // si es su primera vez, se crea su hoja ahora
    const token = crearToken_(email);
    
    Logger.log('✅ Login exitoso para: ' + email);
    
    return {
      success: true,
      token: token,
      email: email,
      // Primeros caracteres del ID de la hoja de este usuario: la pantalla lo muestra para poder
      // comprobar a simple vista que cada usuario trabaja con una hoja distinta.
      hoja: String(_tenant.spreadsheetId).substring(0, 6),
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

