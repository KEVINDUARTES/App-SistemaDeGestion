# 🔍 Análisis Completo: URLs, IDs y API Keys

Documento que explica todas las URLs, IDs y Keys que necesitas y para qué sirve cada una.

---

## 📋 Resumen Rápido

Tu sistema tiene **3 componentes principales** que necesitan estar conectados:

1. **Frontend** (Aplicación Web) → `public/app.js`
2. **Backend** (Google Apps Script) → `google-apps-script/Code.gs`
3. **Base de Datos** (Google Sheets) → Tu hoja de cálculo

---

## 🔑 1. API_KEY (Token de Seguridad)

### ¿Qué es?
Un token secreto que protege tu API. Solo quien tenga este token puede usar tu backend.

### ¿Dónde se usa?
Debe estar **EXACTAMENTE IGUAL** en 2 lugares:

#### ✅ Ubicación 1: Backend (Code.gs)
**Archivo:** `google-apps-script/Code.gs`  
**Línea:** ~9  
```javascript
const CONFIG = {
  SPREADSHEET_ID: '...',
  API_KEY: 'TMiToken89899', // ← AQUÍ
  // ...
};
```

#### ✅ Ubicación 2: Frontend (app.js)
**Archivo:** `public/app.js`  
**Línea:** ~5  
```javascript
const API_CONFIG = {
    baseUrl: '...',
    apiKey: 'TMiToken89899' // ← AQUÍ (debe ser EXACTAMENTE igual)
};
```

### ⚠️ IMPORTANTE:
- Debe ser **EXACTAMENTE IGUAL** en ambos lugares
- Sin espacios al inicio o final
- Es case-sensitive (mayúsculas/minúsculas importan)

### ✅ Tu API_KEY actual:
```
TMiToken89899
```

---

## 📊 2. SPREADSHEET_ID (ID de Google Sheets)

### ¿Qué es?
El identificador único de tu hoja de cálculo de Google Sheets.

### ¿Dónde se usa?
Solo en **1 lugar**: Backend (Code.gs)

#### ✅ Ubicación: Backend (Code.gs)
**Archivo:** `google-apps-script/Code.gs`  
**Línea:** ~8  
```javascript
const CONFIG = {
  SPREADSHEET_ID: '18G5wDNgnsSu4saWGQu4m-B0XF6oJ5oRrSPLl7zMVJVY', // ← AQUÍ
  API_KEY: '...',
  // ...
};
```

### ¿Cómo obtenerlo?
1. Abre tu Google Sheet
2. Mira la URL en el navegador:
   ```
   https://docs.google.com/spreadsheets/d/[ESTE_ES_EL_ID]/edit
   ```
3. El ID es la parte entre `/d/` y `/edit`

### ✅ Tu SPREADSHEET_ID actual:
```
18G5wDNgnsSu4m-B0XF6oJ5oRrSPLl7zMVJVY
```

### ⚠️ IMPORTANTE:
- El script debe tener **permisos** para acceder a esta hoja
- La hoja debe existir
- El ID es case-sensitive

---

## 🌐 3. URL del Backend (Google Apps Script Web App URL)

### ¿Qué es?
La URL pública de tu script publicado como aplicación web.

### ¿Dónde se usa?
Solo en **1 lugar**: Frontend (app.js)

#### ✅ Ubicación: Frontend (app.js)
**Archivo:** `public/app.js`  
**Línea:** ~4  
```javascript
const API_CONFIG = {
    baseUrl: 'https://script.google.com/macros/s/AKfycbzbqV7fnQtdWJ0yYzUAdZ9BtagturnmZ7s97fI__WFoJLx3yW759thyQfCxrPPEgK1NXQ/exec', // ← AQUÍ
    apiKey: '...'
};
```

### ¿Cómo obtenerla?
1. Ve a [Google Apps Script](https://script.google.com)
2. Abre tu proyecto
3. Haz clic en **"Implementar"** > **"Administrar implementaciones"**
4. Busca la sección **"Aplicación web"** o **"Web app"**
5. Copia la URL (debe terminar en `/exec`)

### ✅ Tu URL actual:
```
https://script.google.com/macros/s/AKfycbzbqV7fnQtdWJ0yYzUAdZ9BtagturnmZ7s97fI__WFoJLx3yW759thyQfCxrPPEgK1NXQ/exec
```

### ⚠️ IMPORTANTE:
- Debe terminar en `/exec`
- No debe tener espacios
- Debe estar publicado con acceso **"Cualquiera"**
- Si cambias el código del script, debes crear una **nueva versión** del deployment

---

## 🔗 Cómo se Conectan

```
┌─────────────────┐
│   FRONTEND      │
│  (app.js)       │
│                 │
│  baseUrl: URL   │──────────┐
│  apiKey: KEY    │          │
└─────────────────┘          │
                             │ HTTP Request
                             │ con apiKey
                             ▼
┌─────────────────────────────────┐
│        BACKEND                  │
│  (Google Apps Script)           │
│                                 │
│  SPREADSHEET_ID: ID            │
│  API_KEY: KEY (verifica)       │
└─────────────────────────────────┘
          │
          │ API de Google Sheets
          ▼
┌─────────────────┐
│  BASE DE DATOS  │
│  (Google Sheets)│
│                 │
│  ID: SPREADSHEET_ID
└─────────────────┘
```

---

## ✅ Checklist de Verificación

Marca cada uno cuando lo verifiques:

- [ ] **API_KEY** en `Code.gs` = `TMiToken89899`
- [ ] **API_KEY** en `app.js` = `TMiToken89899`
- [ ] Ambos API_KEY son **EXACTAMENTE IGUALES**
- [ ] **SPREADSHEET_ID** en `Code.gs` = `18G5wDNgnsSu4saWGQu4m-B0XF6oJ5oRrSPLl7zMVJVY`
- [ ] El **SPREADSHEET_ID** corresponde a tu hoja de Google Sheets
- [ ] **baseUrl** en `app.js` = Tu URL de Google Apps Script
- [ ] La **baseUrl** termina en `/exec`
- [ ] El script está publicado como **"Aplicación web"**
- [ ] El script tiene acceso **"Cualquiera"**
- [ ] El script tiene permisos para acceder a la hoja

---

## 🐛 Problemas Comunes y Soluciones

### Error: "API Key inválida"

**Causa:** Los API_KEY no coinciden o tienen espacios

**Solución:**
1. Verifica que ambos sean exactamente iguales
2. Copia y pega desde un lugar al otro
3. No agregues espacios

---

### Error: "Failed to fetch"

**Causas posibles:**
1. URL incorrecta
2. Script no publicado
3. Acceso no configurado como "Cualquiera"
4. Problema de CORS (debe estar permitido)

**Solución:**
1. Verifica la URL en Google Apps Script
2. Asegúrate de que esté publicado
3. Verifica que el acceso sea "Cualquiera"
4. Prueba la URL directamente en el navegador con parámetros

---

### Error: "Spreadsheet no encontrado"

**Causa:** SPREADSHEET_ID incorrecto o sin permisos

**Solución:**
1. Verifica el ID en la URL de tu Google Sheet
2. Asegúrate de que el script tenga permisos
3. Verifica que la hoja exista

---

## 📝 Valores Actuales (Resumen)

| Componente | Valor Actual | Ubicación |
|------------|--------------|-----------|
| **API_KEY** | `TMiToken89899` | `Code.gs` línea 9<br>`app.js` línea 5 |
| **SPREADSHEET_ID** | `18G5wDNgnsSu4saWGQu4m-B0XF6oJ5oRrSPLl7zMVJVY` | `Code.gs` línea 8 |
| **baseUrl** | `https://script.google.com/macros/s/AKfycbzbqV7fnQtdWJ0yYzUAdZ9BtagturnmZ7s97fI__WFoJLx3yW759thyQfCxrPPEgK1NXQ/exec` | `app.js` línea 4 |

---

## 🔍 Verificación Paso a Paso

### Paso 1: Verificar API_KEY
```bash
# En Code.gs línea 9 debe decir:
API_KEY: 'TMiToken89899'

# En app.js línea 5 debe decir:
apiKey: 'TMiToken89899'
```

### Paso 2: Verificar SPREADSHEET_ID
1. Abre tu Google Sheet
2. Copia el ID de la URL
3. Compara con `Code.gs` línea 8

### Paso 3: Verificar baseUrl
1. Ve a Google Apps Script
2. Haz clic en "Implementar"
3. Copia la URL de "Aplicación web"
4. Compara con `app.js` línea 4

---

## 🆘 Si Nada Funciona

1. **Re-publica el script:**
   - Ve a Google Apps Script
   - Haz clic en "Implementar"
   - Crea una "Nueva implementación"
   - Configura acceso "Cualquiera"
   - Copia la nueva URL

2. **Verifica permisos:**
   - El script debe tener permisos para acceder a la hoja
   - Ejecuta `testConexion()` para verificar

3. **Prueba desde el navegador:**
   ```
   TU_URL?endpoint=clientes&apiKey=TMiToken89899
   ```
   Si esto funciona, el problema es en el frontend
   Si no funciona, el problema es en el backend

