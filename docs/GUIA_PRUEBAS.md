# 🧪 Guía Paso a Paso para Probar la Aplicación

## ✅ Pre-requisitos

Antes de empezar, verifica que:
- [x] El servidor local está corriendo (`http://127.0.0.1:8000`)
- [x] La aplicación se carga sin errores
- [x] La consola del navegador no muestra errores de CORS

---

## 📋 Paso 1: Preparar Datos Iniciales

### 1.1 Agregar Clientes

1. En la aplicación, haz clic en **"Clientes"** (si existe en el menú) o ve directamente a agregar un cliente
2. Haz clic en **"Agregar Cliente"** o botón similar
3. Completa:
   - **Nombre:** "Cliente Prueba 1"
   - **Teléfono:** "1234567890"
4. Haz clic en **"Guardar"**
5. Verifica que aparezca en la lista

**✅ Verificación:** Deberías ver el cliente en la lista

---

### 1.2 Agregar Proveedores

1. Busca la sección de **"Proveedores"** o **"Proveedores Pedido"**
2. Haz clic en **"Agregar Proveedor"**
3. Completa:
   - **Nombre:** "Proveedor Prueba 1"
   - **Rubro:** "Bebidas" (o el que corresponda)
4. Haz clic en **"Guardar"**

**✅ Verificación:** Deberías ver el proveedor en la lista

---

### 1.3 Agregar Productos

1. Busca la sección de **"Productos"** o **"Stock"**
2. Haz clic en **"Agregar Producto"**
3. Completa:
   - **Nombre:** "Coca Cola 1.5L"
   - **Tipo:** "bebida"
   - **Unidad:** "unidad"
   - **Proveedor:** Selecciona el proveedor que creaste
4. Haz clic en **"Guardar"**

**Repite** para agregar 2-3 productos más (ej: "Agua 500ml", "Cerveza 1L")

**✅ Verificación:** Deberías ver los productos en la lista

---

## 📦 Paso 2: Probar Pedidos del Día

### 2.1 Agregar un Pedido

1. Ve a la sección **"Pedidos del día"** o **"Pedidos"**
2. Haz clic en **"Agregar Pedido"** o botón similar
3. Completa:
   - **Cliente:** Selecciona "Cliente Prueba 1"
   - **Producto:** Selecciona "Coca Cola 1.5L"
   - **Cantidad:** 10
4. Haz clic en **"Guardar"** o **"Agregar"**

**✅ Verificación:** Deberías ver el pedido en la tabla

---

### 2.2 Agregar Más Pedidos

Repite el paso anterior para agregar:
- 2 pedidos más del mismo cliente con diferentes productos
- 1 pedido de otro cliente (si tienes más clientes)

**✅ Verificación:** Deberías ver múltiples pedidos en la lista

---

### 2.3 Ver Pedidos Agrupados por Proveedor

1. Ve a la sección **"Pedido a proveedores"** o **"Proveedores Pedido"**
2. **✅ Verificación:** Deberías ver los pedidos agrupados por proveedor

---

## 📥 Paso 3: Probar Recepción

### 3.1 Ver Recepción del Día

1. Ve a la sección **"Confirmación de lo que llegó"** o **"Recepción"**
2. **✅ Verificación:** Deberías ver una lista con los productos pedidos

---

### 3.2 Completar Recepción

1. En la tabla de recepción, completa:
   - **Llegó:** Cantidad que realmente llegó (puede ser diferente al pedido)
   - **Precio real:** Precio que pagaste (ej: 500)
2. Haz clic en **"Guardar Recepción"**

**✅ Verificación:** Los datos se guardan sin errores

---

### 3.3 Confirmar Recepción

1. Haz clic en **"Confirmar Recepción"**
2. Confirma la acción
3. **✅ Verificación:** La recepción queda confirmada (puede cambiar el estado visual)

---

## 💰 Paso 4: Probar Precios al Cliente

### 4.1 Generar Lista de Precios

1. Ve a la sección **"Precios al cliente"** o **"Precios"**
2. Haz clic en **"Generar Lista"** o botón similar
3. **✅ Verificación:** Deberías ver una lista con los productos y clientes

---

### 4.2 Asignar Precios

1. En la tabla de precios, completa:
   - **Precio Cliente:** Precio que cobrarás (ej: 800)
2. Haz clic en **"Guardar Precios"**

**✅ Verificación:** Los precios se guardan

---

## 🧾 Paso 5: Probar Cierre del Día

### 5.1 Verificar Cierre

1. Ve a la sección **"Cierre del día"** o **"Cierre"**
2. Revisa el resumen que aparece
3. **✅ Verificación:** Deberías ver información del día

---

### 5.2 Cerrar el Día

1. Haz clic en **"Cerrar Día"**
2. Confirma la acción
3. **✅ Verificación:** 
   - El día se cierra
   - Se generan cobranzas automáticamente
   - Puede aparecer un mensaje de éxito

---

## 💵 Paso 6: Probar Cobranzas

### 6.1 Ver Cobranzas Pendientes

1. Ve a la sección **"Cobranzas pendientes"** o **"Cobranzas"**
2. **✅ Verificación:** Deberías ver las cobranzas generadas del cierre

---

### 6.2 Registrar un Cobro

1. Haz clic en **"Registrar Cobro"** o botón similar
2. Completa:
   - **Cliente:** Selecciona un cliente
   - **Monto:** Monto recibido (ej: 5000)
3. Haz clic en **"Guardar"**

**✅ Verificación:** El cobro se registra y actualiza el saldo

---

## 💳 Paso 7: Probar Pagos a Proveedores

### 7.1 Ver Saldos de Proveedores

1. Ve a la sección **"Proveedores (saldos)"** o **"Pagos"**
2. **✅ Verificación:** Deberías ver los proveedores con sus saldos

---

### 7.2 Registrar un Pago

1. Haz clic en **"Registrar Pago"** en un proveedor
2. Completa:
   - **Monto:** Monto pagado (ej: 3000)
   - **Método:** Selecciona (Efectivo, Transferencia, Cheque)
3. Haz clic en **"Guardar"**

**✅ Verificación:** El pago se registra y actualiza el saldo del proveedor

---

## 📊 Paso 8: Probar Stock

### 8.1 Ver Stock Actual

1. Ve a la sección **"Stock de bebidas"** o **"Stock"**
2. **✅ Verificación:** Deberías ver los productos con su stock actual

---

### 8.2 Ajustar Stock

1. Haz clic en **"Ajustar Stock"** o botón similar
2. Completa:
   - **Producto:** Selecciona un producto
   - **Cantidad:** Nueva cantidad (ej: 50)
3. Haz clic en **"Guardar"**

**✅ Verificación:** El stock se actualiza

---

## 📜 Paso 9: Probar Historial

### 9.1 Ver Historial

1. Ve a la sección **"Historial de días"** o **"Historial"**
2. **✅ Verificación:** Deberías ver los días cerrados

---

## 🔍 Verificaciones Adicionales

### Verificar en Google Sheets

1. Abre tu Google Sheet
2. Verifica que los datos se hayan guardado en las pestañas correspondientes:
   - **Clientes:** Deberías ver los clientes agregados
   - **Productos:** Deberías ver los productos agregados
   - **Pedidos:** Deberías ver los pedidos del día
   - **Recepcion:** Deberías ver las recepciones
   - **PreciosCliente:** Deberías ver los precios
   - **CierreDia:** Deberías ver el cierre del día
   - **Cobranzas:** Deberías ver las cobranzas
   - **PagosProveedores:** Deberías ver los pagos

---

## 🐛 Si Algo No Funciona

### Verificar Consola del Navegador

1. Abre la consola (F12)
2. Busca errores (mensajes en rojo)
3. Si hay errores, anota el mensaje exacto

### Verificar Logs de Google Apps Script

1. Ve a [Google Apps Script](https://script.google.com)
2. Abre tu proyecto
3. Ve a **Ver** > **Logs de ejecución**
4. Busca errores

### Verificar Datos en Google Sheets

1. Abre tu Google Sheet
2. Verifica que las pestañas existan
3. Verifica que tengan los headers correctos

---

## ✅ Checklist Final

Marca cada funcionalidad que probaste:

- [ ] Agregar clientes
- [ ] Agregar proveedores
- [ ] Agregar productos
- [ ] Agregar pedidos
- [ ] Ver pedidos agrupados por proveedor
- [ ] Completar recepción
- [ ] Confirmar recepción
- [ ] Generar lista de precios
- [ ] Asignar precios cliente
- [ ] Cerrar el día
- [ ] Ver cobranzas
- [ ] Registrar cobro
- [ ] Ver saldos de proveedores
- [ ] Registrar pago a proveedor
- [ ] Ver stock
- [ ] Ajustar stock
- [ ] Ver historial
- [ ] Verificar datos en Google Sheets

---

## 🎉 ¡Listo!

Si todas las funcionalidades funcionan, tu aplicación está completamente operativa. 

**Próximos pasos:**
- Agregar tus datos reales
- Configurar tus clientes, proveedores y productos
- Comenzar a usar el sistema en producción
























