# Luciano Cargas - Sistema de Gestión

Sistema web para gestión de pedidos diarios, proveedores, cobranzas y stock. Reemplaza el uso de Excel con una interfaz web moderna conectada a Google Sheets como base de datos.

## 🚀 Características

- **Gestión de Pedidos**: Carga de pedidos diarios de clientes (verduras y bebidas)
- **Pedidos a Proveedores**: Generación automática de listas agrupadas por proveedor
- **Recepción**: Confirmación de mercadería recibida con precios reales
- **Doble Precio**: Manejo de precio real (proveedor) y precio cliente (separados)
- **Cobranzas por Día**: Sistema de cobranzas organizadas por fecha/carga
- **Pagos a Proveedores**: Registro de pagos con cálculo automático de saldos
- **Stock de Bebidas**: Control de inventario con alertas de stock bajo
- **Caja**: Registro de movimientos de ingresos y egresos
- **Historial**: Consulta de días cerrados y transacciones históricas

## 🛠️ Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Google Apps Script
- **Base de Datos**: Google Sheets
- **Sin dependencias externas**: No requiere Node.js, npm, ni frameworks

## 📋 Requisitos Previos

1. Cuenta de Google (para Google Sheets y Google Apps Script)
2. Navegador web moderno (Chrome, Firefox, Edge, Safari)
3. Editor de texto (opcional, para personalización)

## 📦 Instalación

### Paso 1: Crear Google Sheet

1. Ve a [Google Sheets](https://sheets.google.com)
2. Crea una nueva hoja de cálculo
3. Nómbrala "Luciano Cargas - Base de Datos"
4. Copia el ID de la hoja desde la URL:
   ```
   https://docs.google.com/spreadsheets/d/[ESTE_ES_EL_ID]/edit
   ```
5. Crea las pestañas según la documentación en `docs/ESTRUCTURA_SHEETS.md`
   - O déjalas vacías, el script las creará automáticamente

### Paso 2: Crear Google Apps Script

1. Ve a [Google Apps Script](https://script.google.com)
2. Crea un nuevo proyecto
3. Nómbralo "Luciano Cargas API"
4. Abre el archivo `Code.gs` (se crea automáticamente)
5. Reemplaza todo el contenido con el código de `google-apps-script/Code.gs`
6. **IMPORTANTE**: Edita las siguientes líneas en el código:

```javascript
const CONFIG = {
  SPREADSHEET_ID: 'TU_SPREADSHEET_ID_AQUI', // Pega aquí el ID de tu Sheet
  API_KEY: 'TU_API_KEY_AQUI', // Genera un token de seguridad (ej: "miToken123456")
  // ...
};
```

7. Guarda el proyecto (Ctrl+S o Cmd+S)

8. **Opcional - Probar el código:**
   - Selecciona la función `testConexion` en el menú desplegable
   - Haz clic en **▶️ Ejecutar**
   - Autoriza los permisos cuando se soliciten
   - Ve a **Ver** > **Logs de ejecución** para ver los resultados
   - 📖 Para más detalles, consulta `docs/COMO_PROBAR_SCRIPT.md`

### Paso 3: Publicar como Web App

1. En Google Apps Script, ve a **Publicar** > **Implementar como aplicación web**
2. Configura:
   - **Descripción**: "API Luciano Cargas"
   - **Ejecutar como**: "Yo"
   - **Quién tiene acceso**: "Cualquiera, incluso anónimos"
3. Haz clic en **Implementar**
4. **Copia la URL de la aplicación web** (algo como: `https://script.google.com/macros/s/...`)
5. Autoriza los permisos cuando se solicite:
   - Acepta los permisos necesarios
   - Selecciona tu cuenta de Google
   - Haz clic en "Avanzado" > "Ir a [nombre del proyecto] (no es seguro)" si aparece

### Paso 4: Configurar la Web App

1. Abre el archivo `public/app.js`
2. Busca la sección `API_CONFIG` al inicio del archivo:

```javascript
const API_CONFIG = {
    baseUrl: 'TU_URL_DE_GOOGLE_APPS_SCRIPT_AQUI',
    apiKey: 'TU_API_KEY_AQUI'
};
```

3. Reemplaza:
   - `baseUrl`: Con la URL que copiaste en el Paso 3
   - `apiKey`: Con el mismo token que usaste en el Paso 2

### Paso 5: Servir la Aplicación Web

Tienes varias opciones para servir los archivos HTML/CSS/JS:

#### Opción A: Servidor Local Simple (Recomendado para desarrollo)

1. Si tienes Python instalado:
   ```bash
   cd public
     
   ```
   Luego abre: `http://localhost:8000`

2. Si tienes Node.js instalado:
   ```bash
   npx http-server public -p 8000
   ```
   Luego abre: `http://localhost:8000`

#### Opción B: Google Sites o GitHub Pages

1. Sube los archivos de `public/` a un servicio de hosting estático
2. Asegúrate de que `index.html` esté en la raíz

#### Opción C: Abrir directamente (Limitado)

1. Abre `public/index.html` directamente en el navegador
2. **Nota**: Esto puede tener limitaciones de CORS, mejor usar un servidor

## 🔐 Seguridad

El sistema utiliza un **API Key** simple para proteger los endpoints. Asegúrate de:

1. Usar un token fuerte y único (no compartirlo públicamente)
2. Mantener el mismo token en:
   - `Code.gs` (CONFIG.API_KEY)
   - `app.js` (API_CONFIG.apiKey)

## 📖 Uso del Sistema

### Flujo de Trabajo Diario

1. **Pedidos del día**: Cargar todos los pedidos de clientes
2. **Pedido a proveedores**: Revisar y marcar el pedido realizado
3. **Recepción**: Confirmar lo que llegó, ajustar cantidades y cargar precios reales
4. **Precios al cliente**: Asignar precios que se cobrarán a cada cliente
5. **Cierre del día**: Validar y cerrar el día (genera cobranzas automáticamente)
6. **Cobranzas**: Registrar pagos recibidos de clientes
7. **Pagos**: Registrar pagos realizados a proveedores

### Pantallas Principales

- **Dashboard**: Resumen del día actual
- **Pedidos**: Gestión de pedidos del día
- **Proveedores**: Vista de pedidos agrupados por proveedor
- **Recepción**: Confirmación de mercadería recibida
- **Precios**: Asignación de precios a clientes
- **Cierre**: Cierre del día con validaciones
- **Cobranzas**: Lista de cobranzas pendientes y registro de pagos
- **Pagos**: Saldos de proveedores y registro de pagos
- **Stock**: Control de stock de bebidas
- **Historial**: Consulta de días cerrados

## 🐛 Solución de Problemas

📖 **Para una guía completa de pruebas y solución de problemas, consulta:** `docs/COMO_PROBAR_SCRIPT.md`

### Error: "API Key inválida"
- Verifica que el `apiKey` sea el mismo en `Code.gs` y `app.js`
- Asegúrate de que no haya espacios extra

### Error: "Endpoint no encontrado"
- Verifica que la URL de la Web App sea correcta
- Asegúrate de que el script esté publicado correctamente

### Error: "Spreadsheet no encontrado"
- Verifica que el `SPREADSHEET_ID` sea correcto en `Code.gs`
- Asegúrate de que el script tenga permisos para acceder a la hoja

### Error de CORS
- Asegúrate de usar un servidor local o hosting (no abrir HTML directamente)
- Verifica que la Web App esté publicada con acceso "Cualquiera"

### Los datos no se guardan
- Verifica los permisos del script en Google Apps Script
- Revisa la consola del navegador (F12) para ver errores
- Verifica que las pestañas existan en la hoja de cálculo

### ¿Cómo verificar que el script funciona?
1. Ejecuta la función `testConexion()` desde el editor de Google Apps Script
2. Prueba un endpoint GET desde el navegador (ver guía completa)
3. Revisa los logs de ejecución en Google Apps Script
4. Consulta `docs/COMO_PROBAR_SCRIPT.md` para más detalles

### ¿Cómo verificar que todo está conectado (Frontend, Backend, Base de Datos)?
1. **Opción rápida:** Abre `public/test-connection.html` en tu navegador (herramienta visual de pruebas)
2. **Opción detallada:** Consulta la guía completa en `docs/VERIFICAR_CONEXION.md`
3. Ejecuta las pruebas paso a paso para verificar cada conexión

## 📁 Estructura del Proyecto

```
AppWeb-LucianoCargas/
├── public/
│   ├── index.html          # Página principal
│   ├── styles.css          # Estilos (tema celeste y blanco)
│   ├── app.js              # Lógica de la aplicación
│   └── test-connection.html # Herramienta de prueba de conexión
├── google-apps-script/
│   └── Code.gs             # Script de Google Apps Script (API)
├── docs/
│   ├── ESTRUCTURA_SHEETS.md # Documentación de estructura de Sheets
│   ├── COMO_PROBAR_SCRIPT.md # Cómo probar el script
│   └── VERIFICAR_CONEXION.md # Verificar conexión completa
└── README.md                # Este archivo
```

## 🔄 Actualizaciones

Para actualizar el sistema:

1. **Actualizar Web App**: Edita `Code.gs` en Google Apps Script y vuelve a publicar
2. **Actualizar Frontend**: Reemplaza los archivos en `public/` y recarga la página

## 📝 Notas Importantes

- **Los clientes NO ven el precio real**: Solo ven el precio cliente
- **Cobranzas por fecha**: Cada día genera cobranzas independientes
- **Validaciones**: No se puede cerrar el día si faltan datos (precios, recepciones, etc.)
- **Stock automático**: El stock de bebidas se actualiza automáticamente al cerrar el día
- **Historial**: Todos los días cerrados quedan registrados para consulta

## 🆘 Soporte

Si encuentras problemas:

1. Revisa la consola del navegador (F12 > Console)
2. Verifica los logs de Google Apps Script (Ver > Logs de ejecución)
3. Asegúrate de seguir todos los pasos de instalación
4. Verifica que los permisos estén configurados correctamente

## 📄 Licencia

Este proyecto es de uso interno para Luciano Cargas.

---

**Desarrollado para reemplazar el sistema Excel actual con una solución web moderna y eficiente.**





AKfycbzbqV7fnQtdWJ0yYzUAdZ9BtagturnmZ7s97fI__WFoJLx3yW759thyQfCxrPPEgK1NXQ

https://script.google.com/macros/s/AKfycbzbqV7fnQtdWJ0yYzUAdZ9BtagturnmZ7s97fI__WFoJLx3yW759thyQfCxrPPEgK1NXQ/exec# App-SistemaDeGestion
