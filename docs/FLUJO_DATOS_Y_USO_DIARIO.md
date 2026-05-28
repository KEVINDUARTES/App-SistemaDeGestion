# 📊 Flujo de Datos y Uso Diario - Luciano Cargas

Esta guía explica cómo fluyen los datos en el sistema y cómo se usa la aplicación en un día típico.

---

## 🔄 Flujo de Datos: Cómo se Guarda la Información

### Diagrama del Flujo

```
┌─────────────────────────────────────────────────────────────────┐
│                        USUARIO EN EL FRONTEND                   │
│                      (Aplicación Web - app.js)                  │
│                                                                 │
│  El usuario:                                                    │
│  • Hace clic en "Agregar Pedido"                               │
│  • Completa un formulario                                       │
│  • Guarda los datos                                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ JavaScript hace:
                             │ fetch(url, {method: 'POST', data: {...}})
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Google Apps Script)               │
│                            (Code.gs)                            │
│                                                                 │
│  El backend:                                                    │
│  1. Recibe la petición HTTP                                     │
│  2. Valida el API_KEY                                          │
│  3. Procesa los datos                                           │
│  4. Conecta con Google Sheets                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ API de Google Sheets
                             │ (leer/escribir datos)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BASE DE DATOS (Google Sheets)                │
│                                                                 │
│  Se guarda en la pestaña correspondiente:                       │
│  • "Pedidos" → Nuevo pedido                                    │
│  • "Clientes" → Nuevo cliente                                  │
│  • "Productos" → Nuevo producto                                │
│  • etc.                                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 Ejemplo Paso a Paso: Guardar un Pedido

### 1. Usuario en el Frontend
```
Usuario hace clic en "Agregar Pedido"
  ↓
Formulario: Cliente: "Juan", Producto: "Apio", Cantidad: "5 kg"
  ↓
Usuario hace clic en "Guardar"
```

### 2. JavaScript en app.js
```javascript
// El código en app.js hace esto automáticamente:
const datos = {
  fecha: "2024-01-15",
  cliente_id: "abc-123",
  producto_id: "jkl-012",
  tipo: "verdura",
  cantidad: 5
};

// Hace una petición HTTP al backend
fetch('https://script.google.com/macros/s/.../exec', {
  method: 'POST',
  body: JSON.stringify({
    endpoint: 'pedidos',
    apiKey: 'TMiToken89899',
    ...datos
  })
});
```

### 3. Backend (Google Apps Script)
```javascript
// Code.gs recibe la petición:
function handleRequest(e, method) {
  // Valida el API_KEY
  if (apiKey !== CONFIG.API_KEY) return error;
  
  // Llama a createPedido()
  createPedido(datos);
}

function createPedido(data) {
  // Abre la hoja de Google Sheets
  const sheet = getSheet('Pedidos');
  
  // Agrega una nueva fila
  sheet.appendRow([
    generateId(),
    data.fecha,
    data.cliente_id,
    data.producto_id,
    data.tipo,
    data.cantidad
  ]);
  
  return { success: true, data: {...} };
}
```

### 4. Google Sheets (Base de Datos)
```
Pestaña "Pedidos":
┌──────┬────────────┬─────────────┬──────────────┬─────────┬──────────┐
│ id   │ fecha      │ cliente_id  │ producto_id  │ tipo    │ cantidad │
├──────┼────────────┼─────────────┼──────────────┼─────────┼──────────┤
│ uuid1│ 2024-01-15 │ abc-123     │ jkl-012      │ verdura │ 5        │ ← NUEVO
└──────┴────────────┴─────────────┴──────────────┴─────────┴──────────┘
```

---

## 📅 Un Día Típico de Uso

### Mañana (8:00 AM - 12:00 PM)

#### 📋 **Paso 1: Cargar Pedidos del Día**

**¿Qué hace el usuario?**
- Abre la aplicación web
- Va a la sección **"Pedidos del día"**
- Agrega los pedidos que recibió de los clientes (por teléfono, WhatsApp, etc.)

**Ejemplo:**
- Cliente: "Richi" → Producto: "Apio" → Cantidad: "10 kg"
- Cliente: "Richi" → Producto: "Coca 1.5L" → Cantidad: "6 unidades"
- Cliente: "María" → Producto: "Lechuga" → Cantidad: "5 kg"

**¿Dónde se guarda?**
```
Google Sheets → Pestaña "Pedidos"
Cada pedido se guarda como una fila nueva
```

**Flujo de datos:**
```
Frontend → Backend → Google Sheets (pestaña "Pedidos")
```

---

#### 📦 **Paso 2: Ver Pedidos Agrupados por Proveedor**

**¿Qué hace el usuario?**
- Va a **"Pedido a proveedores"**
- El sistema automáticamente agrupa los pedidos por proveedor
- Ve cuánto debe pedir a cada proveedor

**Ejemplo:**
```
Verdulería Juan:
- Apio: 15 kg (10 de Richi + 5 de María)
- Lechuga: 5 kg

Bebidas SRL:
- Coca 1.5L: 6 unidades
```

**¿Dónde se lee?**
```
Google Sheets → Pestaña "Pedidos" (lee los pedidos del día)
Google Sheets → Pestaña "Productos" (para saber el proveedor de cada producto)
```

**¿Dónde se guarda?**
- **NO se guarda** - Solo es una vista/consulta
- El usuario puede imprimir esta lista para llamar a los proveedores

---

### Mediodía (12:00 PM - 2:00 PM)

#### ✅ **Paso 3: Confirmar lo que Llegó (Recepción)**

**¿Qué hace el usuario?**
- Los proveedores entregaron la mercadería
- Va a **"Confirmación de lo que llegó"**
- Para cada producto, indica:
  - Cuánto llegó realmente (puede ser diferente al pedido)
  - Precio real que pagó al proveedor

**Ejemplo:**
```
Pedido: Apio 15 kg
Llegó: 14 kg (faltó 1 kg)
Precio real: $500 por kg
```

**¿Dónde se guarda?**
```
Google Sheets → Pestaña "Recepcion"
Se guarda: producto_id, llegó, precio_real, fecha
```

**Flujo de datos:**
```
Frontend → Backend → Google Sheets (pestaña "Recepcion")
```

---

#### 💰 **Paso 4: Asignar Precios al Cliente**

**¿Qué hace el usuario?**
- Ahora que sabe cuánto pagó, decide cuánto cobrar a cada cliente
- Va a **"Precios al cliente"**
- Asigna el precio que le cobrará a cada cliente

**Ejemplo:**
```
Cliente: Richi
- Apio: 10 kg × $700/kg = $7,000
- Coca 1.5L: 6 unidades × $1,500/unidad = $9,000
Total: $16,000
```

**Nota importante:** El cliente NO ve el precio real ($500), solo ve el precio cliente ($700)

**¿Dónde se guarda?**
```
Google Sheets → Pestaña "PreciosCliente"
Se guarda: fecha, cliente_id, producto_id, cantidad, precio_cliente
```

**Flujo de datos:**
```
Frontend → Backend → Google Sheets (pestaña "PreciosCliente")
```

---

### Tarde (2:00 PM - 6:00 PM)

#### 🔒 **Paso 5: Cerrar el Día**

**¿Qué hace el usuario?**
- Una vez que todo está completo, cierra el día
- Va a **"Cierre del día"**
- El sistema valida que todo esté completo
- Al cerrar, automáticamente:
  - Genera las cobranzas (lo que debe cobrar a cada cliente)
  - Actualiza el stock de bebidas
  - Registra movimientos de caja

**¿Dónde se guarda?**
```
Google Sheets → Pestaña "CierreDia" (registro del cierre)
Google Sheets → Pestaña "Cobranzas" (generadas automáticamente)
Google Sheets → Pestaña "StockBebidas" (actualizado automáticamente)
Google Sheets → Pestaña "CajaMovimientos" (movimientos registrados)
```

**Flujo de datos:**
```
Frontend → Backend → Google Sheets (múltiples pestañas)
```

---

### Fin del Día (6:00 PM en adelante)

#### 💵 **Paso 6: Registrar Cobranzas (cuando el cliente paga)**

**¿Qué hace el usuario?**
- Los clientes van pagando
- Va a **"Cobranzas pendientes"**
- Registra cuánto pagó cada cliente

**Ejemplo:**
```
Cliente: Richi
Debe: $16,000
Pagó: $16,000
Saldo: $0 (pagado)
```

**¿Dónde se guarda?**
```
Google Sheets → Pestaña "Cobranzas"
Se actualiza: pagado, saldo, estado
```

**Flujo de datos:**
```
Frontend → Backend → Google Sheets (pestaña "Cobranzas" - actualización)
```

---

#### 💸 **Paso 7: Registrar Pagos a Proveedores**

**¿Qué hace el usuario?**
- Cuando paga a los proveedores
- Va a **"Proveedores (saldos)"**
- Ve cuánto debe a cada proveedor
- Registra los pagos realizados

**Ejemplo:**
```
Verdulería Juan:
Debe: $7,000 (14 kg × $500/kg)
Pagó: $5,000
Saldo pendiente: $2,000
```

**¿Dónde se guarda?**
```
Google Sheets → Pestaña "PagosProveedores" (nuevo registro de pago)
Se guarda: fecha, proveedor_id, monto, metodo (efectivo/transferencia), nota
```

**Flujo de datos:**
```
Frontend → Backend → Google Sheets (pestaña "PagosProveedores")
```

---

## 📊 Resumen: Dónde se Guarda Cada Dato

| Acción del Usuario | Pestaña en Google Sheets | Tipo de Operación |
|-------------------|-------------------------|-------------------|
| Agregar pedido | **Pedidos** | Escritura (POST) |
| Ver pedidos por proveedor | **Pedidos** + **Productos** | Lectura (GET) |
| Confirmar recepción | **Recepcion** | Escritura (POST) |
| Asignar precios cliente | **PreciosCliente** | Escritura (POST) |
| Cerrar el día | **CierreDia**, **Cobranzas**, **StockBebidas**, **CajaMovimientos** | Escritura múltiple (POST) |
| Registrar cobro | **Cobranzas** | Escritura/Actualización (POST) |
| Registrar pago proveedor | **PagosProveedores** | Escritura (POST) |
| Ver historial | **CierreDia** | Lectura (GET) |

---

## 🔍 Consultas (Solo Lectura)

Estas acciones **NO modifican** los datos, solo los leen:

- **Dashboard**: Lee múltiples pestañas para mostrar resumen
- **Historial**: Lee pestaña "CierreDia"
- **Stock**: Lee pestaña "StockBebidas"
- **Proveedores (saldos)**: Lee "PagosProveedores" y calcula saldos

---

## ⚡ Flujo Completo en un Solo Día

```
MAÑANA:
1. Pedidos → Guarda en "Pedidos"
2. Ver por proveedor → Lee "Pedidos" + "Productos"

MEDIODÍA:
3. Recepción → Guarda en "Recepcion"
4. Precios → Guarda en "PreciosCliente"
5. Cierre → Guarda en "CierreDia", "Cobranzas", "StockBebidas", "CajaMovimientos"

TARDE/NOCHE:
6. Cobranzas → Actualiza "Cobranzas"
7. Pagos → Guarda en "PagosProveedores"

TODO EL DÍA:
- Dashboard → Lee múltiples pestañas
- Historial → Lee "CierreDia"
- Stock → Lee "StockBebidas"
```

---

## 🎯 Puntos Clave

1. **Los datos SIEMPRE se guardan en Google Sheets**
   - No se guardan solo en memoria
   - Persisten aunque cierres el navegador

2. **El backend (Google Apps Script) es el intermediario**
   - El frontend NO puede escribir directamente en Google Sheets
   - El backend tiene los permisos para hacerlo

3. **Cada acción tiene su pestaña específica**
   - Pedidos → "Pedidos"
   - Recepción → "Recepcion"
   - Precios → "PreciosCliente"
   - etc.

4. **Algunas acciones generan datos automáticamente**
   - Al cerrar el día → se generan cobranzas automáticamente
   - No necesitas crear las cobranzas manualmente

---

## 💡 Ejemplo Real Completo

**8:00 AM** - Cliente "Richi" llama y pide:
- 10 kg de Apio
- 6 unidades de Coca 1.5L

**Acción:** Usuario agrega pedido en la app
**Datos guardados:** Google Sheets → "Pedidos" (2 filas nuevas)

---

**12:00 PM** - Llega el proveedor:
- Apio: 10 kg a $500/kg
- Coca: 6 unidades a $1,200/unidad

**Acción:** Usuario confirma recepción
**Datos guardados:** Google Sheets → "Recepcion" (2 filas nuevas)

---

**1:00 PM** - Usuario decide precios:
- Apio: $700/kg al cliente
- Coca: $1,500/unidad al cliente

**Acción:** Usuario asigna precios
**Datos guardados:** Google Sheets → "PreciosCliente" (2 filas nuevas)

---

**2:00 PM** - Usuario cierra el día

**Acción:** Usuario hace clic en "Cerrar día"
**Datos guardados:**
- Google Sheets → "CierreDia" (1 fila nueva: día cerrado)
- Google Sheets → "Cobranzas" (1 fila nueva: Richi debe $16,000)
- Google Sheets → "StockBebidas" (Coca actualizado: -6 unidades)
- Google Sheets → "CajaMovimientos" (movimientos registrados)

---

**6:00 PM** - Cliente "Richi" paga

**Acción:** Usuario registra el pago
**Datos guardados:** Google Sheets → "Cobranzas" (actualización: estado = "pagado")

---

**7:00 PM** - Usuario paga al proveedor

**Acción:** Usuario registra pago a proveedor
**Datos guardados:** Google Sheets → "PagosProveedores" (1 fila nueva)

---

## ✅ Conclusión

- **Todo se guarda en Google Sheets** (como si fuera Excel, pero en la nube)
- **El backend es necesario** para poder escribir en Google Sheets desde el navegador
- **Cada acción tiene su lugar** en una pestaña específica
- **Los datos persisten** - no se pierden al cerrar el navegador

