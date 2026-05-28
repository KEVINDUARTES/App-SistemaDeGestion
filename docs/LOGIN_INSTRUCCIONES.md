# 🔐 Sistema de Login - Luciano Cargas

## Descripción

Se ha implementado un sistema de login sencillo para proteger el acceso a la aplicación. Solo los usuarios autorizados pueden acceder.

## Archivos Creados

1. **public/login.html** - Página de inicio de sesión
2. **public/login.css** - Estilos de la página de login
3. **public/auth.js** - Lógica de autenticación
4. **docs/LOGIN_INSTRUCCIONES.md** - Este archivo

## Archivos Modificados

1. **google-apps-script/Code.gs** - Endpoint de autenticación
2. **public/index.html** - Verificación de sesión y botón de logout
3. **public/styles.css** - Estilos para el header con logout

## ⚙️ Configuración de Usuarios

### Paso 1: Configurar Usuarios en Google Apps Script

Abre el archivo `google-apps-script/Code.gs` y busca la sección de configuración (líneas 6-31):

```javascript
const CONFIG = {
  // ... otras configuraciones ...
  
  // USUARIOS AUTORIZADOS - Configurar con los emails y passwords reales
  USERS: {
    'usuario1@gmail.com': 'password123',  // CAMBIAR: Email y password del usuario 1
    'usuario2@gmail.com': 'password456'   // CAMBIAR: Email y password del usuario 2
  }
};
```

**Reemplaza los emails y contraseñas de ejemplo con los reales:**

```javascript
USERS: {
  'juan.perez@gmail.com': 'MiPassword123!',
  'maria.garcia@gmail.com': 'OtraPassword456!'
}
```

### Paso 2: Desplegar el Script

Después de modificar los usuarios:

1. Guarda los cambios en Google Apps Script
2. Haz clic en **Implementar** → **Nueva implementación**
3. O actualiza la implementación existente

## 🚀 Uso del Sistema

### Página de Login

- Los usuarios deben acceder primero a `login.html`
- Ingresar su email y contraseña configurados
- Si las credenciales son correctas, serán redirigidos a `index.html`

### Página Principal (index.html)

- Verifica automáticamente si el usuario está autenticado
- Si no está autenticado, redirige a `login.html`
- Muestra el email del usuario en el header
- Botón "Salir" para cerrar sesión

### Cerrar Sesión

- Clic en el botón rojo "🚪 Salir" en el header
- Confirmar el cierre de sesión
- Será redirigido a la página de login

## 🔒 Seguridad

**IMPORTANTE:** Este es un sistema de autenticación básico para uso interno. 

### Recomendaciones:

1. **No uses contraseñas débiles** - Utiliza contraseñas fuertes y únicas
2. **No compartas las credenciales** - Cada usuario debe tener sus propias credenciales
3. **Cambia las contraseñas periódicamente** - Actualiza las contraseñas cada cierto tiempo
4. **Contraseñas en el código** - Las contraseñas están en texto plano en Code.gs. Solo tú y las personas con acceso al script pueden verlas.

### Limitaciones:

- Las contraseñas se almacenan en texto plano en el script (solo accesible por el propietario del script)
- No hay recuperación de contraseña (debes actualizar manualmente en Code.gs)
- No hay expiración de sesión automática (permanece hasta que el usuario cierre sesión o limpie localStorage)

## 📱 Diseño

El diseño del login es consistente con el resto de la aplicación:

- ✅ Mismo esquema de colores (azules)
- ✅ Glassmorphism y efectos modernos
- ✅ Fondo animado con gradiente
- ✅ Responsive para móviles
- ✅ Transiciones suaves

## 🧪 Prueba del Sistema

1. Abre `login.html` en tu navegador
2. Intenta ingresar con credenciales incorrectas → Debe mostrar error
3. Ingresa con credenciales correctas → Debe redirigir a index.html
4. Verifica que aparezca tu email en el header
5. Haz clic en "Salir" → Debe redirigir a login.html
6. Intenta acceder directamente a index.html sin login → Debe redirigir a login.html

## 🛠️ Solución de Problemas

### Error: "API Key inválida"
- Verifica que el `API_KEY` en `auth.js` coincida con el de `Code.gs`

### Error: "Credenciales inválidas"
- Verifica que el email esté en minúsculas en CONFIG.USERS
- Verifica que la contraseña sea exactamente igual (case-sensitive)

### No redirecciona después del login
- Verifica que ambos archivos (login.html e index.html) estén en la carpeta `public`
- Abre la consola del navegador (F12) para ver errores

### Loop infinito entre login e index
- Limpia el localStorage del navegador
- Verifica que auth.js esté cargando correctamente en ambas páginas

## 📝 Notas Adicionales

- El token de sesión se guarda en `localStorage` del navegador
- La sesión persiste hasta que el usuario cierre sesión o limpie el localStorage
- Los emails se convierten automáticamente a minúsculas para evitar errores de tipeo

