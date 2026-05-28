# 🔍 Verificar Conexión Frontend - Backend - Base de Datos

Guía paso a paso para verificar que todo el sistema esté funcionando correctamente.

## ✅ Checklist de Verificación

### 1. Backend (Google Apps Script) ✅
- [ ] Script publicado como Web App
- [ ] URL de la aplicación web obtenida
- [ ] API_KEY configurada
- [ ] Permisos autorizados

### 2. Frontend (app.js) ✅
- [ ] `baseUrl` configurado con la URL correcta
- [ ] `apiKey` configurado (igual que en el backend)
- [ ] Archivos HTML/CSS/JS en la carpeta `public/`

### 3. Base de Datos (Google Sheets) ✅
- [ ] Hoja de cálculo creada
- [ ] `SPREADSHEET_ID` configurado en `Code.gs`
- [ ] Pestañas creadas (o se crearán automáticamente)

---

## 🧪 Pruebas Paso a Paso

### Prueba 1: Verificar Backend desde el Navegador

**Objetivo:** Verificar que el backend responde correctamente.

1. Abre tu navegador
2. Pega esta URL (reemplaza con tu URL y API_KEY):

```
TU_URL?endpoint=clientes&apiKey=TMiToken89899
```

**Resultado esperado:**
```json
{"success": true, "data": []}
```

**Si ves esto:** ✅ Backend funcionando correctamente

**Si ves error:**
- `{"success":false,"error":"API Key inválida"}` → Verifica que el `apiKey` sea correcto
- `{"success":false,"error":"Endpoint no encontrado"}` → Verifica que la URL sea correcta
- Error de página no encontrada → Verifica que la URL termine en `/exec`

---

### Prueba 2: Abrir la Aplicación Web Local

**Objetivo:** Verificar que el frontend se carga correctamente.

#### Opción A: Usar Python (si está instalado)
```bash
cd public
python -m http.server 8000
```
Luego abre: `http://localhost:8000`

#### Opción B: Usar Node.js (si está instalado)
```bash
cd public
npx http-server -p 8000
```
Luego abre: `http://localhost:8000`

#### Opción C: Abrir directamente (puede tener limitaciones)
Abre `public/index.html` directamente en el navegador (doble clic)

**Resultado esperado:**
- La página se carga
- Ves el menú de navegación
- No hay errores visibles en la pantalla

**Si ves esto:** ✅ Frontend se carga correctamente

---

### Prueba 3: Verificar Consola del Navegador

**Objetivo:** Detectar errores de conexión entre frontend y backend.

1. Abre la aplicación web en el navegador
2. Presiona `F12` para abrir las herramientas de desarrollador
3. Ve a la pestaña **"Console"** (Consola)
4. Busca mensajes de error en rojo

**Qué buscar:**

✅ **Buenos mensajes:**
- No hay errores en rojo
- Puede haber mensajes informativos en azul o gris

❌ **Malos mensajes:**
- `Failed to fetch` → Problema de conexión con el backend
- `CORS error` → Problema de permisos (debe estar configurado "Cualquiera")
- `API Key inválida` → El `apiKey` no coincide
- `404 Not Found` → La URL del backend está incorrecta

---

### Prueba 4: Probar Cargar Datos

**Objetivo:** Verificar que el frontend puede obtener datos del backend.

1. Abre la aplicación web
2. Abre la consola del navegador (F12)
3. Ve a la pestaña "Console"
4. Navega a diferentes secciones (Dashboard, Pedidos, Clientes, etc.)
5. Observa la consola para ver si hay errores

**Resultado esperado:**
- No hay errores
- Las páginas se cargan (aunque estén vacías)

**Si ves errores en la consola:**
- Copia el mensaje de error
- Verifica la URL y API_KEY en `app.js`

---

### Prueba 5: Crear un Cliente de Prueba (POST)

**Objetivo:** Verificar que puedes escribir datos en la base de datos.

#### Desde la Consola del Navegador:

1. Abre la aplicación web
2. Abre la consola (F12)
3. Pega este código y presiona Enter:

```javascript
fetch('https://script.google.com/macros/s/AKfycbzbqV7fnQtdWJ0yYzUAdZ9BtagturnmZ7s97fl__WFoJLx3yW759thyQfCxrPPEgK1NXQ/exec', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    endpoint: 'clientes',
    apiKey: 'TMiToken89899',
    nombre: 'Cliente de Prueba',
    telefono: '123456789',
    direccion: 'Calle Test 123'
  })
})
.then(response => response.json())
.then(data => {
  console.log('✅ Cliente creado:', data);
  alert('✅ Cliente creado correctamente!');
})
.catch(error => {
  console.error('❌ Error:', error);
  alert('❌ Error al crear cliente');
});
```

**Resultado esperado:**
- Ves un alert que dice "✅ Cliente creado correctamente!"
- En la consola ves: `{success: true, data: {...}}`

**Luego verifica en Google Sheets:**
1. Abre tu Google Sheet "Base de Datos - LC"
2. Ve a la pestaña "Clientes"
3. Deberías ver el cliente "Cliente de Prueba" en una nueva fila

**Si ves el cliente en la hoja:** ✅ Backend y Base de Datos conectados correctamente

---

### Prueba 6: Leer el Cliente Creado (GET)

**Objetivo:** Verificar que puedes leer datos de la base de datos.

1. Abre la consola del navegador (F12)
2. Pega este código:

```javascript
fetch('https://script.google.com/macros/s/AKfycbzbqV7fnQtdWJ0yYzUAdZ9BtagturnmZ7s97fl__WFoJLx3yW759thyQfCxrPPEgK1NXQ/exec?endpoint=clientes&apiKey=TMiToken89899')
  .then(response => response.json())
  .then(data => {
    console.log('✅ Clientes obtenidos:', data);
    if (data.success && data.data.length > 0) {
      alert('✅ Clientes encontrados: ' + data.data.length);
      console.table(data.data);
    } else {
      alert('⚠️ No hay clientes aún');
    }
  })
  .catch(error => {
    console.error('❌ Error:', error);
    alert('❌ Error al obtener clientes');
  });
```

**Resultado esperado:**
- Ves el cliente que creaste en la Prueba 5
- La consola muestra la tabla con los datos

**Si ves los datos:** ✅ Lectura funcionando correctamente

---

### Prueba 7: Probar desde la Interfaz Web

**Objetivo:** Verificar que la aplicación completa funciona.

1. Abre la aplicación web
2. Intenta agregar un cliente desde la interfaz (si tienes esa opción)
3. Navega entre diferentes secciones
4. Verifica que no haya errores

**Si todo funciona sin errores:** ✅ Sistema completo funcionando

---

## 🔍 Diagnóstico de Problemas

### Problema: "Failed to fetch" en la consola

**Causas posibles:**
1. URL incorrecta en `app.js`
2. Backend no publicado correctamente
3. Problema de CORS

**Soluciones:**
- Verifica que la URL en `app.js` termine en `/exec`
- Verifica que el backend esté publicado con acceso "Cualquiera"
- Prueba la URL directamente en el navegador

---

### Problema: "API Key inválida"

**Causas posibles:**
1. El `apiKey` en `app.js` no coincide con el de `Code.gs`
2. Hay espacios extra en el `apiKey`

**Soluciones:**
- Verifica que ambos `apiKey` sean exactamente iguales
- No debe haber espacios al inicio o final
- Copia y pega el mismo valor en ambos lugares

---

### Problema: Los datos no se guardan en Google Sheets

**Causas posibles:**
1. `SPREADSHEET_ID` incorrecto en `Code.gs`
2. El script no tiene permisos para escribir
3. Las pestañas no existen

**Soluciones:**
- Verifica el `SPREADSHEET_ID` en `Code.gs`
- Asegúrate de que el script tenga permisos
- Las pestañas se crearán automáticamente la primera vez

---

### Problema: La página no carga datos

**Causas posibles:**
1. URL o API_KEY incorrectos
2. Problema de CORS
3. El backend no está respondiendo

**Soluciones:**
- Abre la consola (F12) y revisa los errores
- Prueba el endpoint directamente desde el navegador
- Verifica que el backend esté publicado

---

## ✅ Verificación Rápida (2 minutos)

Ejecuta esto en la consola del navegador (F12) cuando tengas la aplicación abierta:

```javascript
// Reemplaza con tu URL y API_KEY
const URL = 'https://script.google.com/macros/s/AKfycbzbqV7fnQtdWJ0yYzUAdZ9BtagturnmZ7s97fl__WFoJLx3yW759thyQfCxrPPEgK1NXQ/exec';
const API_KEY = 'TMiToken89899';

console.log('🧪 Iniciando pruebas de conexión...');

// Prueba 1: GET Clientes
fetch(`${URL}?endpoint=clientes&apiKey=${API_KEY}`)
  .then(r => r.json())
  .then(d => {
    console.log('✅ GET Clientes:', d.success ? 'OK' : 'ERROR', d);
    if (d.success) {
      console.log(`   Registros encontrados: ${d.data.length}`);
    }
  })
  .catch(e => console.error('❌ GET Clientes ERROR:', e));

// Prueba 2: GET Productos
fetch(`${URL}?endpoint=productos&apiKey=${API_KEY}`)
  .then(r => r.json())
  .then(d => {
    console.log('✅ GET Productos:', d.success ? 'OK' : 'ERROR', d);
    if (d.success) {
      console.log(`   Registros encontrados: ${d.data.length}`);
    }
  })
  .catch(e => console.error('❌ GET Productos ERROR:', e));

// Prueba 3: POST Crear Cliente
fetch(URL, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    endpoint: 'clientes',
    apiKey: API_KEY,
    nombre: 'Test ' + Date.now(),
    telefono: '999999999',
    direccion: 'Test Address'
  })
})
  .then(r => r.json())
  .then(d => {
    console.log('✅ POST Crear Cliente:', d.success ? 'OK' : 'ERROR', d);
    if (d.success) {
      console.log('   Cliente ID:', d.data.id);
    }
  })
  .catch(e => console.error('❌ POST Crear Cliente ERROR:', e));

console.log('⏳ Espera unos segundos y revisa los resultados arriba...');
```

**Resultado esperado:**
- Todos los tests muestran `✅ OK`
- No hay errores en rojo
- Los datos se crean y leen correctamente

---

## 📊 Resumen de Conexiones

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│  Frontend   │ ──────> │    Backend   │ ──────> │ Base de      │
│  (app.js)   │  HTTP   │ (Google Apps │  API    │ Datos        │
│             │  Fetch  │    Script)   │         │ (Sheets)     │
└─────────────┘         └──────────────┘         └──────────────┘
```

**Verificación:**
- ✅ Frontend → Backend: Prueba desde el navegador con fetch
- ✅ Backend → Base de Datos: Verifica en Google Sheets
- ✅ Base de Datos → Backend: Lee datos desde el navegador

---

## 🎯 Próximos Pasos

Una vez que todo esté funcionando:

1. **Agrega datos reales:**
   - Clientes
   - Proveedores
   - Productos

2. **Prueba el flujo completo:**
   - Crear un pedido
   - Confirmar recepción
   - Asignar precios
   - Cerrar el día

3. **Personaliza según tus necesidades**

---

## 🆘 ¿Necesitas Ayuda?

Si encuentras problemas:

1. Revisa la consola del navegador (F12)
2. Verifica los logs de Google Apps Script
3. Confirma que todos los IDs y keys sean correctos
4. Consulta `docs/COMO_PROBAR_SCRIPT.md` para más detalles

