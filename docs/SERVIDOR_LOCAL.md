# 🌐 Cómo Ejecutar la Aplicación con un Servidor Local

**⚠️ IMPORTANTE:** No puedes abrir `index.html` directamente desde el explorador de archivos. Debes usar un servidor web local para evitar errores de CORS.

---

## 🚀 Opción 1: Python (Recomendado - Más Simple)

### Si tienes Python instalado:

1. Abre una terminal/PowerShell en la carpeta del proyecto
2. Navega a la carpeta `public`:
   ```bash
   cd public
   ```
3. Ejecuta el servidor:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # O si tienes Python 2
   python -m SimpleHTTPServer 8000
   ```
4. Abre tu navegador en:
   ```
   http://localhost:8000
   ```

### Para detener el servidor:
Presiona `Ctrl + C` en la terminal

---

## 🚀 Opción 2: Node.js (http-server)

### Si tienes Node.js instalado:

1. Abre una terminal/PowerShell en la carpeta del proyecto
2. Navega a la carpeta `public`:
   ```bash
   cd public
   ```
3. Ejecuta el servidor:
   ```bash
   npx http-server -p 8000
   ```
4. Abre tu navegador en:
   ```
   http://localhost:8000
   ```

---

## 🚀 Opción 3: Visual Studio Code (Live Server)

### Si usas VS Code:

1. Instala la extensión "Live Server" desde el marketplace
2. Haz clic derecho en `public/index.html`
3. Selecciona "Open with Live Server"
4. Se abrirá automáticamente en tu navegador

---

## 🚀 Opción 4: PowerShell (Windows)

### Si estás en Windows y no tienes Python/Node:

1. Abre PowerShell en la carpeta `public`
2. Ejecuta:
   ```powershell
   python -m http.server 8000
   ```
   (Si no tienes Python, instálalo desde [python.org](https://www.python.org/downloads/))

---

## ✅ Verificación

Una vez que el servidor esté corriendo:

1. Abre `http://localhost:8000` en tu navegador
2. Deberías ver la aplicación funcionando
3. Abre la consola del navegador (F12) y verifica que no haya errores de CORS
4. Intenta navegar entre las secciones de la aplicación

---

## 🐛 Si Sigue Dando Error de CORS

1. **Verifica que estés usando `http://localhost:8000`** y no `file:///...`
2. **Verifica que el servidor esté corriendo** (deberías ver mensajes en la terminal)
3. **Limpia la caché del navegador** (Ctrl + Shift + Delete)
4. **Prueba en modo incógnito** para descartar extensiones del navegador

---

## 📝 Nota sobre Google Apps Script

Google Apps Script permite peticiones desde cualquier origen cuando está configurado como "Aplicación web" con acceso "Cualquiera, incluso anónimos". El problema de CORS solo ocurre cuando abres el archivo HTML directamente desde el sistema de archivos.

---

## 🔧 Solución Rápida (Windows)

Si estás en Windows y quieres una solución rápida, crea un archivo `servidor.bat` en la carpeta `public`:

```batch
@echo off
echo Iniciando servidor en http://localhost:8000
python -m http.server 8000
pause
```

Luego haz doble clic en `servidor.bat` para iniciar el servidor.






