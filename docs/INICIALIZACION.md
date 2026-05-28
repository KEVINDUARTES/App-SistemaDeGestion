# Guía de Inicialización - Luciano Cargas

Esta guía te ayudará a inicializar el sistema con datos de ejemplo.

## Paso 1: Crear la Hoja de Cálculo

1. Ve a [Google Sheets](https://sheets.google.com)
2. Crea una nueva hoja de cálculo
3. Nómbrala "Luciano Cargas - Base de Datos"
4. Copia el ID de la URL (la parte entre `/d/` y `/edit`)

## Paso 2: Crear las Pestañas

Crea las siguientes pestañas con estos nombres exactos:

- Clientes
- Proveedores
- Productos
- Pedidos
- Recepcion
- PreciosCliente
- CierreDia
- Cobranzas
- PagosProveedores
- CajaMovimientos
- StockBebidas

## Paso 3: Agregar Headers

En cada pestaña, agrega los headers en la primera fila:

### Clientes
```
id | nombre | telefono | activo
```

### Proveedores
```
id | nombre | rubro | activo
```

### Productos
```
id | nombre | tipo | unidad | proveedor_default
```

### Pedidos
```
id | fecha | cliente_id | producto_id | tipo | cantidad
```

### Recepcion
```
id | fecha | producto_id | proveedor_id | pedido_total | llego | precio_real | confirmado
```

### PreciosCliente
```
id | fecha | cliente_id | producto_id | cantidad | precio_cliente
```

### CierreDia
```
id | fecha | estado | notas
```

### Cobranzas
```
id | fecha | cliente_id | total | pagado | saldo | estado
```

### PagosProveedores
```
id | fecha | proveedor_id | monto | metodo | nota
```

### CajaMovimientos
```
id | fecha | tipo | monto | nota | referencia
```

### StockBebidas
```
producto_id | stock_actual | minimo
```

## Paso 4: Datos de Ejemplo (Opcional)

Puedes agregar algunos datos de ejemplo para probar:

### Clientes
```
abc-123 | Richi | 1234567890 | TRUE
```

### Proveedores
```
def-456 | Verdulería Juan | Verdura | TRUE
ghi-789 | Bebidas SRL | Bebida | TRUE
```

### Productos
```
jkl-012 | Apio | verdura | kg | def-456
mno-345 | Coca 1.5L | bebida | unidad | ghi-789
```

**Nota**: Los IDs deben ser únicos. El sistema genera UUIDs automáticamente, pero para datos de ejemplo puedes usar IDs simples.

## Paso 5: Configurar el Script

1. Abre `google-apps-script/Code.gs`
2. Busca `CONFIG` y actualiza:
   - `SPREADSHEET_ID`: Pega el ID de tu hoja
   - `API_KEY`: Genera un token seguro (ej: "miTokenSeguro123456")

## Paso 6: Publicar el Script

1. En Google Apps Script, ve a **Publicar** > **Implementar como aplicación web**
2. Configura:
   - Ejecutar como: "Yo"
   - Quién tiene acceso: "Cualquiera, incluso anónimos"
3. Copia la URL de la aplicación web

## Paso 7: Configurar la Web App

1. Abre `public/app.js`
2. Busca `API_CONFIG` y actualiza:
   - `baseUrl`: Pega la URL del paso 6
   - `apiKey`: El mismo token del paso 5

## Paso 8: Probar el Sistema

1. Abre `public/index.html` en un servidor local
2. Verifica que puedas:
   - Ver el dashboard
   - Navegar entre pantallas
   - Agregar un pedido de prueba
   - Ver los datos en Google Sheets

## Solución de Problemas

### El script no encuentra la hoja
- Verifica que el `SPREADSHEET_ID` sea correcto
- Asegúrate de que el script tenga permisos para acceder a la hoja

### Error de API Key
- Verifica que el mismo token esté en `Code.gs` y `app.js`
- No debe haber espacios extra

### Los datos no se guardan
- Revisa la consola del navegador (F12)
- Verifica los logs de Google Apps Script
- Asegúrate de que las pestañas tengan los nombres correctos

## Próximos Pasos

Una vez inicializado:

1. Agrega tus clientes reales
2. Agrega tus proveedores reales
3. Agrega tus productos
4. Comienza a usar el sistema para cargar pedidos diarios

