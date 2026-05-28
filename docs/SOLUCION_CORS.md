# 🔧 Solución al Error de CORS con Google Apps Script

## 🐛 Problema

Cuando intentas usar la aplicación desde `http://localhost:8000` o `http://127.0.0.1:8000`, obtienes este error:

```
Access to fetch at 'https://script.google.com/macros/s/...' from origin 'http://127.0.0.1:8000' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## ✅ Solución

### Paso 1: Verificar Configuración de la Web App

1. Ve a [Google Apps Script](https://script.google.com)
2. Abre tu proyecto
3. Haz clic en **"Implementar"** > **"Administrar implementaciones"**
4. Haz clic en los **3 puntos (⋮)** de tu implementación actual
5. Selecciona **"Editar"**
6. **VERIFICA** que esté configurado así:
   - **Ejecutar como:** "Yo"
   - **Quién tiene acceso:** **"Cualquiera, incluso anónimos"** ⚠️ ESTO ES CRÍTICO
7. Haz clic en **"Implementar"**
8. Si te pide crear una nueva versión, hazlo

### Paso 2: Actualizar el Código en Google Apps Script

Asegúrate de que el código en Google Apps Script esté actualizado. El archivo `google-apps-script/Code.gs` debe estar copiado completamente en tu proyecto de Google Apps Script.

### Paso 3: Probar la URL Directamente

Prueba esta URL en tu navegador (reemplaza con tu URL actual):

```
https://script.google.com/macros/s/TU_URL_AQUI/exec?endpoint=clientes&apiKey=TMiToken89899
```

Si funciona en el navegador pero no desde tu aplicación, el problema es de CORS.

### Paso 4: Solución Alternativa - Usar un Proxy (Si CORS persiste)

Si después de verificar todo lo anterior el problema persiste, puedes usar un proxy CORS. Hay varias opciones:

#### Opción A: Usar un Proxy Público

Puedes usar servicios como:
- `https://cors-anywhere.herokuapp.com/` (puede requerir activación)
- `https://api.allorigins.win/raw?url=`

#### Opción B: Crear tu Propio Proxy Simple

Si tienes acceso a un servidor, puedes crear un proxy simple.

## 🔍 Verificación

Después de seguir los pasos:

1. **Recarga la aplicación** (Ctrl+F5 o Cmd+Shift+R)
2. **Abre la consola del navegador** (F12)
3. **Intenta usar la aplicación**
4. **Verifica los logs** - deberías ver:
   - 🔵 Making request to: [URL]
   - 🟢 Response status: 200 OK
   - 🟢 Response data: [datos]

## ⚠️ Notas Importantes

1. **Google Apps Script Web Apps** tienen limitaciones conocidas con CORS cuando se accede desde `localhost` o `127.0.0.1`
2. **La configuración "Cualquiera, incluso anónimos"** es **OBLIGATORIA** para que funcione CORS
3. Si cambias el código en Google Apps Script, **debes crear una nueva versión** de la implementación
4. A veces Google Apps Script tarda unos minutos en aplicar los cambios de configuración

## 🆘 Si Nada Funciona

1. **Prueba desde un dominio diferente:**
   - Sube tu aplicación a GitHub Pages, Netlify, o similar
   - Prueba desde ahí para verificar si es un problema específico de localhost

2. **Verifica los logs de Google Apps Script:**
   - Ve a **Ver** > **Logs de ejecución** en Google Apps Script
   - Busca errores relacionados con CORS o permisos

3. **Prueba con una herramienta como Postman:**
   - Si funciona en Postman pero no en el navegador, confirma que es un problema de CORS

## 📝 URL Actual

Asegúrate de que la URL en `public/app.js` línea 4 coincida con la URL de tu implementación actual en Google Apps Script.

**Tu URL actual debería ser:**
```
https://script.google.com/macros/s/AKfycbyrySpMGE3oHkfhExhQaR8BVII_W1aLkChiY_-vfjSCKxmx3lscbIoPM8LEqTM2ncFwRw/exec
```
























