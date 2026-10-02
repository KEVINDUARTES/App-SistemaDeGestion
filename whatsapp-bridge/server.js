import express from 'express';
import dotenv from 'dotenv';
import QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
    Browsers,
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState
} from '@whiskeysockets/baileys';

dotenv.config();

const PORT = Number(process.env.PORT || 3001);
const API_KEY = process.env.API_KEY || '';
const AUTH_FOLDER = process.env.AUTH_FOLDER || './auth_info';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const app = express();
app.use(express.json({ limit: '32kb' }));

app.use((req, res, next) => {
    const origin = req.headers.origin || '';
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

let sock = null;
let isConnected = false;
let currentQr = null;
let isStarting = false;

function isLocalApp(req) {
    const origin = req.headers.origin || '';
    const referer = req.headers.referer || '';
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)/.test(referer);
}

function requireApiKey(req, res, next) {
    if (isLocalApp(req)) {
        return next();
    }

    if (!API_KEY) {
        return res.status(500).json({
            success: false,
            error: 'API_KEY no configurada en el servidor (.env)'
        });
    }

    const key = req.header('X-API-Key') || req.header('x-api-key');
    if (key !== API_KEY) {
        return res.status(401).json({ success: false, error: 'API Key inválida' });
    }

    next();
}

function normalizePhone(phone) {
    let digits = String(phone || '').replace(/\D/g, '');

    if (digits.startsWith('0')) {
        digits = digits.slice(1);
    }

    if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith('54')) {
        digits = '54' + digits;
    }

    if (digits.length < 10 || digits.length > 15) {
        throw new Error('Teléfono inválido: ' + phone);
    }

    return digits;
}

async function startWhatsApp() {
    if (isStarting) return;
    isStarting = true;

    try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: Browsers.macOS('Chrome'),
            markOnlineOnConnect: false
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                currentQr = qr;
                isConnected = false;
                logger.info('QR generado — escaneá con WhatsApp → Dispositivos vinculados');
            }

            if (connection === 'open') {
                isConnected = true;
                currentQr = null;
                logger.info('WhatsApp conectado');
            }

            if (connection === 'close') {
                isConnected = false;

                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const loggedOut = statusCode === DisconnectReason.loggedOut;
                if (loggedOut) currentQr = null;

                logger.warn({ statusCode }, 'Conexión cerrada');

                if (!loggedOut) {
                    setTimeout(() => {
                        isStarting = false;
                        startWhatsApp();
                    }, 4000);
                } else {
                    logger.error('Sesión cerrada. Borrá auth_info/ y reiniciá para escanear QR de nuevo.');
                }
            }
        });
    } catch (error) {
        logger.error({ err: error }, 'Error iniciando WhatsApp');
    } finally {
        isStarting = false;
    }
}

app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'whatsapp-bridge' });
});

app.get('/api/status', requireApiKey, (_req, res) => {
    res.json({
        connected: isConnected,
        waitingForQr: !!currentQr && !isConnected
    });
});

app.get('/api/qr', requireApiKey, async (_req, res) => {
    if (isConnected) {
        return res.json({ connected: true, qr: null, qrImage: null });
    }

    if (!currentQr) {
        return res.json({
            connected: false,
            qr: null,
            qrImage: null,
            message: 'QR no disponible aún. Reintentá en unos segundos.'
        });
    }

    const qrImage = await QRCode.toDataURL(currentQr, { margin: 1, width: 280 });

    res.json({
        connected: false,
        qr: currentQr,
        qrImage
    });
});

app.post('/api/send', requireApiKey, async (req, res) => {
    try {
        if (!isConnected || !sock) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp no conectado. Escaneá el QR en /admin'
            });
        }

        const { phone, message } = req.body || {};

        if (!message || !String(message).trim()) {
            return res.status(400).json({ success: false, error: 'Mensaje vacío' });
        }

        const normalizedPhone = normalizePhone(phone);
        const jid = normalizedPhone + '@s.whatsapp.net';

        const result = await sock.sendMessage(jid, { text: String(message) });

        res.json({
            success: true,
            messageId: result?.key?.id || null,
            to: normalizedPhone
        });
    } catch (error) {
        logger.error({ err: error }, 'Error enviando mensaje');
        res.status(500).json({
            success: false,
            error: error.message || 'Error al enviar mensaje'
        });
    }
});

app.get('/admin', async (_req, res) => {
    const statusText = isConnected
        ? 'Conectado'
        : (currentQr ? 'Esperando escaneo de QR' : 'Iniciando...');

    let qrBlock = '<p>Generando QR...</p>';

    if (isConnected) {
        qrBlock = '<p style="color:green;font-weight:bold;">WhatsApp conectado. Podés enviar pedidos desde la app.</p>';
    } else if (currentQr) {
        const qrImage = await QRCode.toDataURL(currentQr, { margin: 1, width: 280 });
        qrBlock = `
            <p>En el celular: WhatsApp → ⋮ → Dispositivos vinculados → Vincular dispositivo</p>
            <img src="${qrImage}" alt="QR WhatsApp" style="border:1px solid #ddd;border-radius:8px;" />
        `;
    }

    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="refresh" content="5" />
  <title>WhatsApp Bridge — Luciano Cargas</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 420px; margin: 40px auto; padding: 0 16px; }
    h1 { font-size: 1.25rem; }
    .status { padding: 12px; background: #f3f4f6; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>WhatsApp Bridge</h1>
  <div class="status">Estado: <strong>${statusText}</strong></div>
  <div style="margin-top:20px;text-align:center;">${qrBlock}</div>
  <p style="margin-top:24px;font-size:0.85rem;color:#666;">Esta página se actualiza sola cada 5 segundos.</p>
</body>
</html>`);
});

app.listen(PORT, () => {
    logger.info(`WhatsApp Bridge escuchando en http://localhost:${PORT}`);
    logger.info(`Panel QR: http://localhost:${PORT}/admin`);
    startWhatsApp();
});
