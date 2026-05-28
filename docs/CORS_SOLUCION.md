# 🔧 Solución de Problemas CORS - Sistema de Login

## 🐛 Error Identificado

```
Access to fetch at 'https://script.google.com/...' from origin 'http://192.168.1.36:8080' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

Este error ocurre porque **Google Apps Script** tiene restricciones de CORS cuando se hacen peticiones desde servidores locales.

## ✅ Soluciones (En orden de preferencia)

### Solución 1: Verificar Configuración de Despliegue (RECOMENDADA)

#### Paso 1: Ve a Google Apps Script

1. Abre tu proyecto en [Google Apps Script](https://script.google.com)
2. Asegúrate de haber guardado los cambios recientes

#### Paso 2: Configura el Despliegue Correctamente

1. Haz clic en **"Implementar"** → **"Nueva implementación"** (o "Administrar implementaciones")
2. Si es una nueva implementación:
   - Haz clic en el ícono de engranaje ⚙️ junto a "Seleccionar tipo"
   - Selecciona **"Aplicación web"**
3. Configura los siguientes parámetros:

```
Descripción: API Luciano Cargas (v1, v2, etc.)
Ejecutar como: YO (tu email)
Quién tiene acceso: CUALQUIER PERSONA    ⚠️ MUY IMPORTANTE
```

4. Haz clic en **"Implementar"**
5. **Copia la nueva URL** que te proporciona
6. **Autoriza** la aplicación si te lo pide

#### Paso 3: Actualiza la URL en auth.js

Abre `public/auth.js` y actualiza la `baseUrl` con la nueva URL:

```javascript
const API_CONFIG = {
    baseUrl: 'TU_NUEVA_URL_AQUI',  // ⚠️ Actualizar con la URL del paso 2
    apiKey: 'TMiToken89899'
};
```

También actualiza en `public/app.js` la misma URL.

---

### Solución 2: Usar Extensión CORS para Desarrollo (TEMPORAL)

Si solo necesitas probar en desarrollo local, puedes usar una extensión de navegador:

#### Para Chrome:
1. Instala: [CORS Unblock](https://chrome.google.com/webstore/detail/cors-unblock/lfhmikememgdcahcdlaciloancbhjino)
2. Actívala solo cuando estés probando tu app
3. **⚠️ IMPORTANTE**: Desactívala después de terminar

#### Para Firefox:
1. Instala: [CORS Everywhere](https://addons.mozilla.org/es/firefox/addon/cors-everywhere/)
2. Actívala solo para pruebas

**NOTA**: Esta es solo una solución temporal para desarrollo. NO es para producción.

---

### Solución 3: Usar JSONP (Alternativa sin CORS)

Si el problema persiste, podemos cambiar el método de autenticación para usar JSONP en lugar de fetch. Déjame saber si necesitas implementar esta opción.

---

## 🔍 Verificación del Despliegue

Para verificar que tu script está correctamente desplegado:

### 1. Prueba la URL directamente

Abre en tu navegador:
```
https://script.google.com/macros/s/TU_ID/exec?apiKey=TMiToken89899&endpoint=login&email=kevindurtes792@gmail.com&password=kevinpassword123
```

Deberías ver una respuesta JSON como:
```json
{
  "success": true,
  "token": "...",
  "email": "kevindurtes792@gmail.com",
  "message": "Login exitoso"
}
```

### 2. Revisa los Permisos

Asegúrate de que:
- ✅ El script esté desplegado como **"Aplicación web"**
- ✅ **"Quién tiene acceso"** esté configurado como **"Cualquier persona"**
- ✅ Hayas autorizado todos los permisos que solicita

---

## 📋 Checklist de Solución

Marca cada paso a medida que lo completes:

- [ ] Agregué `doOptions()` en Code.gs
- [ ] Guardé los cambios en Google Apps Script
- [ ] Creé una nueva implementación con acceso "Cualquier persona"
- [ ] Copié la nueva URL de implementación
- [ ] Actualicé `baseUrl` en `public/auth.js`
- [ ] Actualicé `baseUrl` en `public/app.js`
- [ ] Probé la URL directamente en el navegador
- [ ] Recargué la página de login y probé nuevamente

---

## 🚨 Si el Problema Persiste

Si después de seguir todos los pasos el error continúa:

1. **Verifica en la consola de Google Apps Script**:
   - Ve a **Ejecuciones** en el menú lateral
   - Revisa si hay errores en los logs

2. **Limpia caché del navegador**:
   - Presiona `Ctrl + Shift + Delete`
   - Limpia caché y cookies
   - Recarga la página

3. **Prueba en modo incógnito**:
   - Abre una ventana de incógnito
   - Intenta hacer login nuevamente

4. **Avísame** y te ayudo a implementar una solución alternativa con JSONP

---

## 📝 Notas Adicionales

- Google Apps Script puede tardar **1-2 minutos** en propagar una nueva implementación
- Si cambias el código, debes crear una **nueva versión** de la implementación
- El error de `favicon.ico` es solo cosmético y no afecta la funcionalidad

---

## 🔗 URLs que Necesitas Actualizar

Después de desplegar correctamente, actualiza la `baseUrl` en estos archivos:

1. **`public/auth.js`** - Línea 2
2. **`public/app.js`** - Línea 3

Ambas deben tener la misma URL que obtuviste al desplegar.

