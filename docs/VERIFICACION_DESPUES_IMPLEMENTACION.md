# ✅ Verificación Después de Implementar Google Apps Script

Esta guía te ayuda a verificar que todo funcione correctamente después de crear una nueva implementación en Google Apps Script.

---

## 📋 Checklist de Verificación

### ✅ Paso 1: Verificar que el código esté actualizado en Google Apps Script

1. Ve a [Google Apps Script](https://script.google.com)
2. Abre tu proyecto "Luciano Cargas API"
3. Abre el archivo `Code.gs`
4. Verifica que en la **línea 9** diga:
   ```javascript
   API_KEY: 'TMiToken89899',
   ```
5. Verifica que en la **línea 8** tenga tu SPREADSHEET_ID correcto

---

### ✅ Paso 2: Verificar la URL de implementación

1. En Google Apps Script, ve a **"Implementar"** > **"Administrar implementaciones"**
2. Busca la sección **"Aplicación web"** o **"Web app"**
3. Copia la URL (debe terminar en `/exec`)
4. Verifica que esta URL esté en `public/app.js` línea 4

**Tu URL actual debería ser:**
```
https://script.google.com/macros/s/AKfycbz2WNXTT9I8_ii1QOzmG1YqgxIPwgD7PF2jg-gOE0NgYihriEUtbF8h04lRUPP8JQIgnw/exec
```

---

### ✅ Paso 3: Probar la URL con parámetros

**⚠️ IMPORTANTE:** No pruebes la URL sola en el navegador, siempre incluye los parámetros necesarios.

**URL de prueba para obtener clientes:**
```
https://script.google.com/macros/s/AKfycbz2WNXTT9I8_ii1QOzmG1YqgxIPwgD7PF2jg-gOE0NgYihriEUtbF8h04lRUPP8JQIgnw/exec?endpoint=clientes&apiKey=TMiToken89899
```

**Resultado esperado:**
- Si funciona: Verás un JSON como `{"success":true,"data":[...]}`
- Si no funciona: Verás `{"success":false,"error":"API Key inválida"}` o `{"success":false,"error":"Endpoint no especificado"}`

---

### ✅ Paso 4: Verificar que app.js tenga la URL correcta

1. Abre `public/app.js`
2. Verifica la línea 4 (baseUrl):
   ```javascript
   baseUrl: 'https://script.google.com/macros/s/AKfycbz2WNXTT9I8_ii1QOzmG1YqgxIPwgD7PF2jg-gOE0NgYihriEUtbF8h04lRUPP8JQIgnw/exec',
   ```
3. Verifica la línea 5 (apiKey):
   ```javascript
   apiKey: 'TMiToken89899'
   ```

---

## 🔍 Sobre el "ID de Implementación"

Cuando creas una nueva implementación, Google Apps Script te muestra un **"ID de implementación"**. 

**Este ID NO se usa en ningún lugar del código.** Es solo para referencia interna de Google.

**Lo que SÍ necesitas es:**
- La **URL de la aplicación web** (la que termina en `/exec`)
- Esta URL va en `public/app.js` línea 4

---

## 🐛 Si Sigue Dando Error "API Key inválida"

### Opción 1: Re-publicar el script

1. En Google Apps Script, ve a **"Implementar"** > **"Administrar implementaciones"**
2. Haz clic en los **3 puntos** (⋮) de la implementación actual
3. Selecciona **"Nueva versión"**
4. Configura:
   - **Ejecutar como:** "Yo"
   - **Quién tiene acceso:** "Cualquiera, incluso anónimos"
5. Haz clic en **"Implementar"**
6. Copia la nueva URL si cambió
7. Actualiza `public/app.js` línea 4 con la nueva URL

### Opción 2: Verificar que el código esté guardado

1. En Google Apps Script, asegúrate de haber guardado el código (Ctrl+S o Cmd+S)
2. Verifica que el código tenga la API_KEY correcta
3. Re-publica como en la Opción 1

### Opción 3: Probar con la función de prueba

1. En Google Apps Script, selecciona la función `testAPIKey` en el menú desplegable
2. Haz clic en **▶️ Ejecutar**
3. Ve a **Ver** > **Logs de ejecución**
4. Deberías ver: `✅ API Key válida`

---

## ✅ Verificación Final

Una vez que todo esté configurado:

1. Abre tu aplicación web (`public/index.html`)
2. Abre la consola del navegador (F12)
3. Intenta cargar datos (por ejemplo, ir a la sección "Pedidos")
4. Si funciona, verás los datos cargados
5. Si no funciona, verás errores en la consola

---

## 📝 Resumen de Valores Actuales

| Componente | Valor | Ubicación |
|------------|-------|-----------|
| **API_KEY** | `TMiToken89899` | `Code.gs` línea 9<br>`app.js` línea 5 |
| **SPREADSHEET_ID** | `18G5wDNgnsSu4saWGQu4m-B0XF6oJ5oRrSPLl7zMVJVY` | `Code.gs` línea 8 |
| **baseUrl** | `https://script.google.com/macros/s/AKfycbz2WNXTT9I8_ii1QOzmG1YqgxIPwgD7PF2jg-gOE0NgYihriEUtbF8h04lRUPP8JQIgnw/exec` | `app.js` línea 4 |

---

## 🆘 Si Nada Funciona

1. **Verifica los permisos:**
   - El script debe tener permisos para acceder a la hoja de cálculo
   - Ejecuta `testConexion()` en Google Apps Script para verificar

2. **Verifica que la hoja exista:**
   - Abre tu Google Sheet
   - Verifica que el ID en la URL coincida con `SPREADSHEET_ID`

3. **Revisa los logs:**
   - En Google Apps Script, ve a **Ver** > **Logs de ejecución**
   - Busca errores específicos

4. **Prueba desde cero:**
   - Crea una nueva implementación
   - Copia la nueva URL
   - Actualiza `app.js`
























