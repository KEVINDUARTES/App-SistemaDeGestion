# WhatsApp Bridge — envío automático sin cuenta Business

Este servicio usa **Baileys** (protocolo de WhatsApp Web) para enviar mensajes desde tu propio número, sin Meta Business API.

> **Aviso:** Es una integración no oficial. WhatsApp puede limitar o bloquear números con uso automatizado. Usalo con moderación (pedidos a proveedores, bajo volumen).

## Arquitectura

```
App web → Google Apps Script → WhatsApp Bridge (Node) → WhatsApp
```

Google Apps Script **no puede** hablar con `localhost`. El bridge debe estar en una URL pública (servidor, Railway, ngrok, etc.).

---

## Paso 1 — Instalar y arrancar el bridge

```bash
cd whatsapp-bridge
cp .env.example .env
# Editá .env: API_KEY=una-clave-larga-segura
npm install
npm start
```

Abrí en el navegador: **http://localhost:3001/admin**

Escaneá el QR con el celular:

**WhatsApp → ⋮ → Dispositivos vinculados → Vincular dispositivo**

La carpeta `auth_info/` guarda la sesión. No la borres salvo que quieras re-vincular.

---

## Paso 2 — Exponer el bridge a internet

Google Apps Script corre en la nube y necesita alcanzar tu bridge.

### Opción A — Desarrollo con ngrok

```bash
ngrok http 3001
```

Copiá la URL HTTPS (ej: `https://abc123.ngrok-free.app`).

### Opción B — Producción (Railway / Render / VPS)

Desplegá la carpeta `whatsapp-bridge` con:

- **Build:** `npm install`
- **Start:** `npm start`
- **Variables de entorno:** `PORT`, `API_KEY`

---

## Paso 3 — Configurar Google Sheet

En la hoja **Configuracion**:

| clave | valor |
|-------|-------|
| `whatsapp_auto_envio` | `true` |
| `whatsapp_modo` | `bridge` |
| `whatsapp_bridge_url` | `https://tu-url-publica` (sin `/` final) |
| `whatsapp_bridge_key` | La misma `API_KEY` del `.env` |

---

## Paso 4 — Republicar Code.gs

Apps Script → **Implementar** → nueva implementación Web App.

---

## Paso 5 — Probar

1. Hard refresh en la app (`Cmd + Shift + R`)
2. Entrá a **Pedido a proveedores**
3. Click **Marcar pedido**
4. El mensaje se envía solo; el botón pasa a verde **Pedido realizado**

---

## Endpoints del bridge

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/admin` | No | Panel QR (solo local/admin) |
| GET | `/api/status` | `X-API-Key` | `{ connected, waitingForQr }` |
| GET | `/api/qr` | `X-API-Key` | QR en JSON (opcional) |
| POST | `/api/send` | `X-API-Key` | `{ phone, message }` |

Ejemplo:

```bash
curl -X POST https://tu-url/api/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: tu-clave" \
  -d '{"phone":"5491123456789","message":"Hola, pedido de prueba"}'
```

---

## Modos disponibles

| whatsapp_modo | Requiere | Uso |
|---------------|----------|-----|
| `manual` | Nada | Abre WhatsApp Web (actual) |
| `bridge` | Este servicio | Automático sin Business |
| `meta` | Cuenta Meta Business | Automático oficial |

---

## Problemas frecuentes

**"Bridge no alcanzable"** — La URL en Configuracion no es accesible desde internet. Verificá ngrok/servidor.

**"WhatsApp no conectado"** — Abrí `/admin`, escaneá QR de nuevo.

**Sesión cerrada** — Borrá `auth_info/`, reiniciá `npm start`, escaneá QR otra vez.

**Google bloquea la URL** — Usá HTTPS; en ngrok la URL cambia en plan free (actualizala en la Sheet).
