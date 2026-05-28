# Sistema de Notificaciones de Stock Bajo

## 📧 Descripción

El sistema de notificaciones envía alertas automáticas por email cuando el stock de bebidas está bajo o agotado. Las notificaciones incluyen un reporte detallado con todos los productos que requieren atención.

---

## ⚙️ Configuración Inicial

### 1. Actualizar Google Apps Script

1. Abre tu proyecto en Google Apps Script
2. Reemplaza el contenido de `Code.gs` con el nuevo código
3. Guarda el proyecto (Ctrl + S)
4. **Publicar nueva versión**:
   - Click en "Implementar" → "Administrar implementaciones"
   - Click en el icono de lápiz ✏️ de la implementación activa
   - En "Nueva descripción", escribe: "Agregado sistema de notificaciones"
   - Click en "Implementar"

### 2. Configurar Email(s) de Destino

Puedes configurar **uno o múltiples emails** para recibir las notificaciones:

**Opción A: Desde la aplicación web (Recomendado)**
1. Abre la aplicación web
2. Ve a la sección "Stock de bebidas"
3. Click en "⚙️ Configurar notificaciones"
4. Ingresa uno o más emails:
   - **Un solo email**: `admin@empresa.com`
   - **Múltiples emails**: `admin@empresa.com, gerente@empresa.com, deposito@empresa.com`
5. Activa/desactiva las notificaciones automáticas
6. Guarda

**Opción B: Directamente en Google Sheets**
1. Abre tu hoja de Google Sheets
2. Se creará automáticamente una hoja llamada "Configuracion"
3. En la fila 2, columna B, ingresa uno o más emails separados por comas:
   - Ejemplo: `email1@correo.com, email2@correo.com, email3@correo.com`
4. En la fila 3, columna B, pon `true` para activar o `false` para desactivar

**💡 Nota sobre múltiples destinatarios:**
- Separa los emails con comas (`,`)
- Los espacios antes/después de las comas se limpian automáticamente
- Todos recibirán el mismo email de alerta
- No hay límite de destinatarios (respetando los límites de Gmail)

---

## 🔔 Usar Notificaciones

### Verificación Manual

Para verificar el stock y enviar una notificación inmediatamente:

1. Ve a la sección "Stock de bebidas"
2. Click en "🔔 Verificar stock bajo"
3. Confirma la acción
4. Si hay productos con stock bajo, recibirás un email inmediatamente

### Verificación Automática (Recomendado)

Para configurar verificaciones automáticas diarias:

#### Paso 1: Abrir Triggers
1. En Google Apps Script, click en el icono de reloj ⏰ en el menú izquierdo (Triggers)
2. Click en "+ Agregar activador" (esquina inferior derecha)

#### Paso 2: Configurar el Trigger
- **Función a ejecutar**: `verificarStockBajoProgramado`
- **Origen del evento**: Basado en tiempo
- **Tipo de activador de tiempo**: Activador de día
- **Hora del día**: Selecciona la hora deseada (ej: 8 a 9 a.m.)
- Click en "Guardar"

#### Paso 3: Autorizar Permisos
La primera vez que configures el trigger, Google te pedirá permisos:
1. Click en "Revisar permisos"
2. Selecciona tu cuenta de Google
3. Click en "Avanzado"
4. Click en "Ir a [nombre del proyecto] (no seguro)"
5. Click en "Permitir"

**Nota**: Google marca el script como "no seguro" porque es un proyecto personal. Esto es normal y seguro si eres tú quien creó el script.

---

## 📨 Formato del Email

El email de notificación incluye:

- **Asunto**: ⚠️ Alerta: X producto(s) con stock bajo - [Fecha]
- **Contenido**:
  - Fecha de la verificación
  - Cantidad total de productos con stock bajo
  - Tabla detallada con:
    - Nombre del producto
    - Stock actual (en rojo)
    - Stock mínimo configurado
    - Estado (BAJO o AGOTADO)

---

## 🛠️ Pruebas

### Probar el Sistema de Notificaciones

En Google Apps Script:

1. Ve a la función `testNotificaciones`
2. Click en "Ejecutar" (▶️)
3. Revisa el log de ejecución
4. Si hay productos con stock bajo, recibirás un email

### Probar Trigger Automático

Después de configurar el trigger:

1. Cambia temporalmente la hora del trigger a unos minutos en el futuro
2. Espera a que se ejecute
3. Verifica tu email
4. Regresa el trigger a la hora deseada

### Verificar Logs

Para ver el historial de ejecuciones:

1. En Google Apps Script, click en "Ejecuciones" (menú izquierdo)
2. Verás todas las ejecuciones del trigger
3. Click en cualquier ejecución para ver detalles y logs

---

## 🔧 Personalización

### Cambiar Stock Mínimo

Para cambiar el umbral de stock bajo de un producto:

1. Ve a la sección "Stock de bebidas"
2. Abre Google Sheets directamente
3. En la hoja "StockBebidas", columna C ("minimo")
4. Cambia el valor del stock mínimo deseado
5. Las alertas se activarán cuando el stock actual sea menor o igual a este valor

### Cambiar Frecuencia de Notificaciones

Puedes configurar múltiples triggers:

- **Diario**: Para verificación cada día
- **Semanal**: Para verificación cada semana
- **Mensual**: Para verificación mensual

Solo asegúrate de dar nombres diferentes a cada función trigger (ej: `verificarStockBajoSemanal`)

### Personalizar Email

Para personalizar el contenido del email:

1. Abre `Code.gs`
2. Busca la función `enviarEmailStockBajo`
3. Modifica el HTML según tus necesidades
4. Guarda y vuelve a publicar

---

## ❓ Preguntas Frecuentes

**P: ¿Por qué no recibo emails?**

R: Verifica:
- Que el email esté configurado correctamente
- Que las notificaciones estén activas (true)
- Que haya productos con stock bajo
- Tu carpeta de spam/correo no deseado
- Los logs de ejecución en Google Apps Script

**P: ¿Puedo enviar a múltiples emails?**

R: **¡Sí!** Puedes configurar múltiples destinatarios:

**Desde la aplicación web:**
1. Ve a "⚙️ Configurar notificaciones"
2. En el campo de email, escribe los correos separados por comas:
   ```
   email1@ejemplo.com, email2@ejemplo.com, email3@ejemplo.com
   ```
3. Guarda la configuración

**Desde Google Sheets:**
En la hoja "Configuracion", columna B, fila 2, escribe:
```
email1@ejemplo.com, email2@ejemplo.com, email3@ejemplo.com
```

Todos los destinatarios recibirán el mismo email de alerta.

**P: ¿Cuántas notificaciones puedo enviar por día?**

R: Google Apps Script tiene límites:
- **Gmail gratuito**: 100 emails/día
- **Google Workspace**: 1,500 emails/día

**P: ¿El sistema verifica todos los productos?**

R: El sistema solo verifica productos de tipo "bebida" que tengan configurado un stock. Las verduras no se incluyen en las notificaciones de stock.

**P: ¿Puedo desactivar temporalmente las notificaciones?**

R: Sí, de dos formas:
1. En la configuración de la app, desmarca "Activar notificaciones automáticas"
2. En Google Apps Script, desactiva el trigger (no lo elimines, solo desactívalo)

---

## 🚨 Solución de Problemas

### Error: "No se pudo enviar el email"

**Solución**: Verifica que el email de destino sea válido y que tu proyecto tenga permisos para enviar emails.

### Error: "Service using too much computer time"

**Solución**: Si tienes muchos productos en stock, aumenta el timeout o divide la verificación en partes más pequeñas.

### No se ejecuta el trigger automático

**Solución**:
1. Verifica que el trigger esté activo
2. Revisa los logs de ejecución para ver errores
3. Asegúrate de que la función se llame `verificarStockBajoProgramado`

### Email va a spam

**Solución**:
1. Marca el email como "No es spam"
2. Agrega el remitente a tus contactos
3. Configura un filtro en Gmail para que siempre vaya a la bandeja principal

---

## 📊 Ejemplo de Notificación

```
Asunto: ⚠️ Alerta: 3 producto(s) con stock bajo - 15/01/2026

[Email con formato HTML]

⚠️ Alerta de Stock Bajo
Luciano Cargas - Sistema de Gestión

Atención: Se detectaron 3 producto(s) con stock bajo o crítico.

Fecha: 15/01/2026

┌─────────────────────┬──────────────┬──────────────┬─────────┐
│ Producto            │ Stock Actual │ Stock Mínimo │ Estado  │
├─────────────────────┼──────────────┼──────────────┼─────────┤
│ Coca Cola 1.5L      │      5       │      10      │  BAJO   │
│ Sprite 2L           │      3       │      10      │  BAJO   │
│ Fanta 1.5L          │      0       │      10      │ AGOTADO │
└─────────────────────┴──────────────┴──────────────┴─────────┘

Este es un mensaje automático del Sistema de Gestión de Luciano Cargas.
Por favor, no responder a este email.
```

---

## 📝 Notas Importantes

1. **Privacidad**: Los emails se envían desde tu cuenta de Google, por lo que son privados y seguros.

2. **Límites de Google**: Respeta los límites de envío de emails de Google para evitar suspensiones.

3. **Mantenimiento**: Revisa periódicamente los logs de ejecución para asegurarte de que todo funciona correctamente.

4. **Backup**: Si modificas el código de notificaciones, haz un backup antes para poder revertir cambios.

5. **Testing**: Siempre prueba las notificaciones antes de activar los triggers automáticos.

---

## 🔗 Enlaces Útiles

- [Documentación de Google Apps Script - MailApp](https://developers.google.com/apps-script/reference/mail/mail-app)
- [Límites de envío de Gmail](https://support.google.com/a/answer/166852)
- [Triggers en Google Apps Script](https://developers.google.com/apps-script/guides/triggers)

---

**Última actualización**: Enero 2026

