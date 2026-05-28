# Estructura de Google Sheets - Luciano Cargas

Este documento describe la estructura de pestañas y columnas que debe tener la hoja de cálculo de Google Sheets.

## Configuración Inicial

1. Crear una nueva hoja de cálculo en Google Sheets
2. Nombrar el archivo como "Luciano Cargas - Base de Datos"
3. Crear las siguientes pestañas con los nombres exactos indicados

## Pestañas y Columnas

### 1. Clientes

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | Texto | ID único del cliente (UUID) |
| nombre | Texto | Nombre del cliente |
| telefono | Texto | Teléfono de contacto |
| activo | Boolean | Si el cliente está activo (TRUE/FALSE) |

**Ejemplo de datos:**
```
id | nombre | telefono | activo
abc-123 | Richi | 1234567890 | TRUE
```

### 2. Proveedores

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | Texto | ID único del proveedor (UUID) |
| nombre | Texto | Nombre del proveedor |
| rubro | Texto | Rubro (ej: "Verdura", "Bebida") |
| activo | Boolean | Si el proveedor está activo (TRUE/FALSE) |

**Ejemplo de datos:**
```
id | nombre | rubro | activo
def-456 | Verdulería Juan | Verdura | TRUE
ghi-789 | Bebidas SRL | Bebida | TRUE
```

### 3. Productos

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | Texto | ID único del producto (UUID) |
| nombre | Texto | Nombre del producto |
| tipo | Texto | Tipo: "verdura" o "bebida" |
| unidad | Texto | Unidad de medida (ej: "kg", "unidad", "L") |
| proveedor_default | Texto | ID del proveedor por defecto (opcional) |

**Ejemplo de datos:**
```
id | nombre | tipo | unidad | proveedor_default
jkl-012 | Apio | verdura | kg | def-456
mno-345 | Coca 1.5L | bebida | unidad | ghi-789
```

### 4. Pedidos

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | Texto | ID único del pedido (UUID) |
| fecha | Texto | Fecha en formato YYYY-MM-DD |
| cliente_id | Texto | ID del cliente |
| producto_id | Texto | ID del producto |
| tipo | Texto | Tipo del producto (verdura/bebida) |
| cantidad | Número | Cantidad pedida |

**Ejemplo de datos:**
```
id | fecha | cliente_id | producto_id | tipo | cantidad
pqr-678 | 2024-12-25 | abc-123 | jkl-012 | verdura | 10
```

### 5. Recepcion

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | Texto | ID único de la recepción (UUID) |
| fecha | Texto | Fecha en formato YYYY-MM-DD |
| producto_id | Texto | ID del producto |
| proveedor_id | Texto | ID del proveedor |
| pedido_total | Número | Cantidad total pedida |
| llego | Número | Cantidad que realmente llegó |
| precio_real | Número | Precio real del proveedor |
| confirmado | Boolean | Si la recepción está confirmada (TRUE/FALSE) |

**Ejemplo de datos:**
```
id | fecha | producto_id | proveedor_id | pedido_total | llego | precio_real | confirmado
stu-901 | 2024-12-25 | jkl-012 | def-456 | 10 | 8 | 500 | TRUE
```

### 6. PreciosCliente

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | Texto | ID único del precio (UUID) |
| fecha | Texto | Fecha en formato YYYY-MM-DD |
| cliente_id | Texto | ID del cliente |
| producto_id | Texto | ID del producto |
| cantidad | Número | Cantidad |
| precio_cliente | Número | Precio que se cobra al cliente |

**Ejemplo de datos:**
```
id | fecha | cliente_id | producto_id | cantidad | precio_cliente
vwx-234 | 2024-12-25 | abc-123 | jkl-012 | 8 | 700
```

### 7. CierreDia

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | Texto | ID único del cierre (UUID) |
| fecha | Texto | Fecha en formato YYYY-MM-DD |
| estado | Texto | Estado: "cerrado" |
| notas | Texto | Notas adicionales (opcional) |

**Ejemplo de datos:**
```
id | fecha | estado | notas
yza-567 | 2024-12-25 | cerrado | 
```

### 8. Cobranzas

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | Texto | ID único de la cobranza (UUID) |
| fecha | Texto | Fecha en formato YYYY-MM-DD |
| cliente_id | Texto | ID del cliente |
| total | Número | Total a cobrar |
| pagado | Número | Monto pagado |
| saldo | Número | Saldo pendiente (total - pagado) |
| estado | Texto | Estado: "pendiente" o "pagado" |

**Ejemplo de datos:**
```
id | fecha | cliente_id | total | pagado | saldo | estado
bcd-890 | 2024-12-25 | abc-123 | 5600 | 0 | 5600 | pendiente
```

### 9. PagosProveedores

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | Texto | ID único del pago (UUID) |
| fecha | Texto | Fecha en formato YYYY-MM-DD |
| proveedor_id | Texto | ID del proveedor |
| monto | Número | Monto pagado |
| metodo | Texto | Método: "efectivo", "transferencia", "cheque" |
| nota | Texto | Nota adicional (opcional) |

**Ejemplo de datos:**
```
id | fecha | proveedor_id | monto | metodo | nota
efg-123 | 2024-12-25 | def-456 | 4000 | efectivo | 
```

### 10. CajaMovimientos

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | Texto | ID único del movimiento (UUID) |
| fecha | Texto | Fecha en formato YYYY-MM-DD |
| tipo | Texto | Tipo: "ingreso" o "egreso" |
| monto | Número | Monto del movimiento |
| nota | Texto | Descripción del movimiento |
| referencia | Texto | Referencia (ID de cobranza, pago, etc.) |

**Ejemplo de datos:**
```
id | fecha | tipo | monto | nota | referencia
hij-456 | 2024-12-25 | ingreso | 12000 | Cobranza | bcd-890
```

### 11. StockBebidas

| Columna | Tipo | Descripción |
|---------|------|-------------|
| producto_id | Texto | ID del producto (debe ser tipo "bebida") |
| stock_actual | Número | Stock actual |
| minimo | Número | Stock mínimo (para alertas) |

**Ejemplo de datos:**
```
producto_id | stock_actual | minimo
mno-345 | 20 | 10
```

## Notas Importantes

1. **Headers**: La primera fila de cada pestaña debe contener los nombres de las columnas exactamente como se muestran arriba.

2. **IDs**: Los IDs deben ser UUIDs únicos. El script genera estos automáticamente.

3. **Fechas**: Todas las fechas deben estar en formato YYYY-MM-DD (ej: 2024-12-25).

4. **Booleanos**: Los valores booleanos deben ser TRUE o FALSE (en mayúsculas).

5. **Números**: Los números pueden ser enteros o decimales. Para precios, usar punto como separador decimal.

6. **Creación Automática**: El script de Google Apps Script puede crear las pestañas y headers automáticamente si no existen, pero es recomendable crearlas manualmente para mayor control.

## Permisos

Asegúrate de que el script de Google Apps Script tenga permisos para:
- Leer y escribir en la hoja de cálculo
- Ejecutar como usuario que creó el script

