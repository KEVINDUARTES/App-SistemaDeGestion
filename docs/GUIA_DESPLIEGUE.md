# 🚀 Guía de Despliegue y Entrega al Cliente

## 📊 Estado Actual de tu Aplicación

Tu aplicación tiene la siguiente arquitectura:

| Componente | Estado | Ubicación |
|------------|--------|-----------|
| **Frontend** | ❌ Sin desplegar | Archivos locales en `public/` |
| **Backend** | ✅ Desplegado | Google Apps Script (Web App) |
| **Base de Datos** | ✅ En la nube | Google Sheets |

## ✅ Lo que YA está listo

1. **Backend (Google Apps Script)**
   - ✅ Ya está desplegado como Web App
   - ✅ Tiene URL pública: `https://script.google.com/macros/s/AKfycbztZ7QdXvw8QWTUWBNLqEXgY9KmUmtCjTKh7w1ocaQZ8jQpUFkc3jCTANXQQRgHUC7SAw/exec`
   - ✅ No necesitas hacer nada más aquí

2. **Base de Datos (Google Sheets)**
   - ✅ Ya está en la nube (Google Drive)
   - ✅ Accesible desde cualquier lugar
   - ✅ No necesitas hacer nada más aquí

## 📦 Lo que FALTA: Desplegar el Frontend

Solo necesitas subir los archivos de la carpeta `public/` a internet. Aquí tienes las mejores opciones:

---

## 🎯 OPCIÓN 1: Netlify (Recomendado - MUY FÁCIL)

### ✨ Ventajas:
- 🆓 **100% Gratis**
- ⚡ **Súper rápido** (5 minutos)
- 🔄 Actualizaciones fáciles con "drag and drop"
- 🌐 URL personalizable
- 🔒 HTTPS automático

### 📝 Pasos:

1. **Crear cuenta en Netlify**
   - Ve a https://www.netlify.com/
   - Crea cuenta gratis (puedes usar tu email o GitHub)

2. **Desplegar tu aplicación**
   - Inicia sesión en Netlify
   - Haz clic en **"Add new site"** > **"Deploy manually"**
   - Arrastra la carpeta `public/` completa a la zona de arrastre
   - Espera 1-2 minutos

3. **¡Listo!** 🎉
   - Netlify te dará una URL como: `https://luciano-cargas.netlify.app`
   - Puedes personalizarla en **Site settings** > **Change site name**

4. **Entregar al cliente**
   - Dale la URL de Netlify
   - Dale acceso al Google Sheet (compartir con permisos de edición)
   - **Importante**: No necesita acceso al Google Apps Script

### 🔄 Para actualizar la app:
- Simplemente arrastra la carpeta `public/` actualizada otra vez

---

## 🎯 OPCIÓN 2: GitHub Pages (Gratis y Profesional)

### ✨ Ventajas:
- 🆓 100% Gratis
- 🏢 Profesional (usa Git/GitHub)
- 🔄 Actualizaciones con Git
- 🌐 URL: `https://tu-usuario.github.io/luciano-cargas`

### 📝 Pasos:

1. **Crear repositorio en GitHub**
   - Ve a https://github.com/
   - Crea cuenta si no tienes
   - Clic en **"New repository"**
   - Nombre: `luciano-cargas`
   - Marca como **Public**
   - Crea el repositorio

2. **Subir archivos**
   - Instala GitHub Desktop (más fácil) o usa Git
   - Clona el repositorio
   - Copia los archivos de `public/` a la raíz del repositorio
   - Commit y Push

3. **Activar GitHub Pages**
   - Ve a Settings del repositorio
   - Busca **Pages** en el menú lateral
   - En **Source**, selecciona **main branch**
   - Guarda

4. **¡Listo!** 🎉
   - Tu app estará en: `https://tu-usuario.github.io/luciano-cargas`

---

## 🎯 OPCIÓN 3: Vercel (Profesional y Rápido)

### ✨ Ventajas:
- 🆓 100% Gratis
- ⚡ Muy rápido
- 🔄 Despliegue automático desde Git
- 🌐 URL personalizable

### 📝 Pasos:

1. Ve a https://vercel.com/
2. Crea cuenta (con GitHub es más fácil)
3. Importa tu proyecto o arrastra la carpeta `public/`
4. ¡Listo en 2 minutos!

---

## 🎯 OPCIÓN 4: Servidor Propio del Cliente

Si tu cliente tiene su propio servidor web:

### 📝 Pasos:

1. **Preparar los archivos**
   - Copia toda la carpeta `public/`
   - Asegúrate de que `index.html` esté en la raíz

2. **Subir al servidor**
   - Usa FTP (FileZilla, WinSCP, etc.)
   - Sube los archivos a la carpeta del dominio (ej: `public_html/`)

3. **Configurar servidor**
   - Asegúrate de que el servidor acepte peticiones CORS
   - La app estará en: `https://dominio-del-cliente.com`

---

## 📋 Checklist de Entrega al Cliente

Cuando entregues la aplicación, asegúrate de dar:

### ✅ Accesos y URLs

- [ ] **URL de la aplicación web** (Netlify, GitHub Pages, etc.)
- [ ] **Acceso al Google Sheet** (compartir con email del cliente)
- [ ] **Credenciales si aplica** (usuario/contraseña si agregaste autenticación)

### ✅ Documentación

- [ ] **Manual de usuario** (cómo usar la app)
- [ ] **Flujo de trabajo diario** (ver `docs/FLUJO_DATOS_Y_USO_DIARIO.md`)
- [ ] **Cómo hacer backup** (descargar el Google Sheet)

### ✅ Información Técnica (para soporte)

- [ ] **URL del Google Apps Script** (solo si necesitan cambiar algo)
- [ ] **ID del Google Sheet** (para migración o backup)
- [ ] **API Key** (guardarlo en lugar seguro)

---

## 🔐 Seguridad Importante

### ⚠️ ANTES de entregar:

1. **Cambiar el API Key**
   - En `Code.gs` línea 9: Cambia `API_KEY`
   - En `public/app.js` línea 5: Usa el mismo API Key
   - Usa algo seguro como: `LucianoCargas2026!SecretKey789`

2. **Configurar permisos del Google Sheet**
   - El cliente debe ser **propietario** o **editor** del Sheet
   - Puedes compartirlo desde Google Drive

3. **NO compartir el código del Google Apps Script**
   - El cliente solo necesita usar la app
   - Solo tú necesitas acceso al script

---

## 🔄 Cómo Actualizar la App en el Futuro

### Si usaste Netlify:
1. Edita los archivos en `public/`
2. Arrastra la carpeta actualizada a Netlify
3. ¡Listo!

### Si usaste GitHub Pages:
1. Edita los archivos
2. Haz commit y push
3. GitHub Pages se actualiza automáticamente

### Backend (Google Apps Script):
1. Edita `Code.gs` en Google Apps Script
2. Guarda (Ctrl+S)
3. Ve a **Publicar** > **Implementar como aplicación web**
4. Clic en **Actualizar**
5. Copia la **nueva URL** si cambió
6. Actualiza `app.js` con la nueva URL si es necesario

---

## 🎉 Resumen: ¿Qué necesitas desplegar?

| Componente | ¿Necesitas desplegarlo? | Recomendación |
|------------|-------------------------|---------------|
| **Frontend** (HTML/CSS/JS) | ✅ SÍ | Netlify (5 minutos) |
| **Backend** (Google Apps Script) | ❌ NO | Ya está desplegado |
| **Base de datos** (Google Sheets) | ❌ NO | Ya está en la nube |

---

## 💡 Mi Recomendación Final

Para entregar al cliente de forma **rápida y profesional**:

1. **Usa Netlify** para el frontend (5 minutos, gratis, fácil)
2. **Comparte el Google Sheet** con el cliente
3. **Entrega la URL de Netlify** y un manual de uso
4. **Guarda el API Key** en un lugar seguro

**Tiempo total de despliegue: 10 minutos máximo** ⚡

---

## 🆘 Preguntas Frecuentes

### ¿El cliente necesita pagar por algo?
**No.** Todo es gratis (Netlify/GitHub Pages + Google Sheets + Google Apps Script)

### ¿El cliente necesita conocimientos técnicos?
**No.** Solo necesita abrir la URL en un navegador como cualquier página web.

### ¿Puedo usar mi propio dominio?
**Sí.** Netlify, Vercel y GitHub Pages permiten dominios personalizados (ej: `gestion.lucianocargas.com`)

### ¿Qué pasa si el cliente quiere cambiar de servidor?
Solo necesitas mover los archivos de `public/` al nuevo servidor. El backend y la base de datos siguen funcionando igual.

### ¿Cuántos usuarios pueden usar la app simultáneamente?
Google Apps Script soporta hasta **30 peticiones simultáneas por segundo**. Para un negocio pequeño/mediano es más que suficiente.

---

## 📞 Contacto y Soporte

Si tienes dudas sobre el despliegue:
1. Revisa esta guía paso a paso
2. Prueba primero con Netlify (es la más fácil)
3. Verifica que el backend siga funcionando con `test-connection.html`

¡Éxito con tu despliegue! 🚀



















