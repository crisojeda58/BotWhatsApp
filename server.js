const express = require('express');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { loadConfig, saveConfig, loadLogs, clearLogs, sendPoll, initScheduler } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3050;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Estado global de WhatsApp Baileys
let clientStatus = 'INITIALIZING'; // 'INITIALIZING' | 'QR_READY' | 'AUTHENTICATED' | 'READY' | 'DISCONNECTED'
let currentQrCodeUrl = null;
let connectedUser = null;
let availableGroups = [];
let sock = null;

const logger = pino({ level: 'silent' });

async function refreshGroups() {
  if (!sock) return [];
  try {
    const groupsMap = await sock.groupFetchAllParticipating();
    const groups = Object.values(groupsMap).map(g => ({
      id: g.id,
      name: g.subject || 'Grupo sin nombre',
      participantsCount: g.participants ? g.participants.length : 0
    }));

    availableGroups = groups;
    console.log(`[WhatsApp] ${availableGroups.length} grupos detectados exitosamente.`);
    return availableGroups;
  } catch (err) {
    console.warn('[WhatsApp] Error actualizando lista de grupos:', err.message);
    return availableGroups;
  }
}

async function connectToWhatsApp() {
  console.log('Iniciando cliente de WhatsApp (Baileys)...');
  clientStatus = 'INITIALIZING';

  const authDir = path.join(__dirname, '.baileys_auth');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true,
    browser: ['Prueba Movil', 'Chrome', '1.0.0']
  });

  // Guardar credenciales al actualizarse
  sock.ev.on('creds.update', saveCreds);

  // Manejador de eventos de conexión y QR
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[WhatsApp] Nuevo Código QR generado.');
      clientStatus = 'QR_READY';
      try {
        currentQrCodeUrl = await QRCode.toDataURL(qr);
      } catch (err) {
        console.error('Error convirtiendo QR a imagen:', err);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`[WhatsApp] Conexión cerrada. Razón: ${statusCode}. Reconectando: ${shouldReconnect}`);
      clientStatus = 'DISCONNECTED';
      currentQrCodeUrl = null;
      connectedUser = null;

      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000);
      } else {
        console.log('[WhatsApp] Sesión cerrada permanentemente. Se requiere escanear QR nuevamente.');
      }
    } else if (connection === 'open') {
      console.log('[WhatsApp] Cliente listo y conectado exitosamente.');
      clientStatus = 'READY';
      currentQrCodeUrl = null;

      if (sock.user) {
        connectedUser = {
          name: sock.user.name || sock.user.notify || sock.user.id.split(':')[0],
          phone: sock.user.id.split(':')[0]
        };
      }

      // Cargar grupos iniciales
      await refreshGroups();

      // Inicializar el programador de tareas
      initScheduler(sock, () => availableGroups);
    }
  });

  // Escuchar actualizaciones de grupos
  sock.ev.on('groups.update', async () => {
    await refreshGroups();
  });
}

// Rutas de API REST

// Solicitar código de vinculación por número de teléfono (Pairing Code)
app.post('/api/pair-code', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Debes proporcionar un número de teléfono con código de país (ej: 56912345678).' });
  }

  if (!sock || clientStatus === 'READY') {
    return res.status(400).json({ error: 'El cliente ya está conectado o no está listo para vincular.' });
  }

  try {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    const code = await sock.requestPairingCode(cleanNumber);
    // Formatear código estilo 1234-5678
    const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
    console.log(`[WhatsApp] Pairing Code generado para +${cleanNumber}: ${formattedCode}`);
    res.json({ success: true, code: formattedCode });
  } catch (err) {
    console.error('[WhatsApp] Error solicitando pairing code:', err);
    res.status(500).json({ error: 'Error al generar código: ' + (err.message || 'Intenta nuevamente') });
  }
});

// Obtener estado general
app.get('/api/status', async (req, res) => {
  if (clientStatus === 'READY' && availableGroups.length === 0) {
    refreshGroups().catch(() => {});
  }

  res.json({
    status: clientStatus,
    qrCodeUrl: currentQrCodeUrl,
    connectedUser,
    availableGroups
  });
});

// Forzar refresco de grupos
app.get('/api/groups', async (req, res) => {
  if (clientStatus !== 'READY') {
    return res.status(400).json({ error: 'Cliente no conectado aún' });
  }
  const groups = await refreshGroups();
  res.json({ success: true, groups });
});

// Obtener lista de encuestas programadas
app.get('/api/schedules', (req, res) => {
  const config = loadConfig();
  res.json(config.schedules);
});

// Actualizar horario o estado de una encuesta
app.put('/api/schedules/:id', (req, res) => {
  const { id } = req.params;
  const { time, enabled } = req.body;

  const config = loadConfig();
  const scheduleIndex = config.schedules.findIndex(s => s.id === id);

  if (scheduleIndex === -1) {
    return res.status(404).json({ error: 'Programación no encontrada' });
  }

  if (time !== undefined) config.schedules[scheduleIndex].time = time;
  if (enabled !== undefined) config.schedules[scheduleIndex].enabled = enabled;

  saveConfig(config);

  if (clientStatus === 'READY' && sock) {
    initScheduler(sock, () => availableGroups);
  }

  res.json({ success: true, schedule: config.schedules[scheduleIndex] });
});

// Forzar envío manual inmediato
app.post('/api/trigger/:id', async (req, res) => {
  const { id } = req.params;
  const config = loadConfig();
  const item = config.schedules.find(s => s.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Encuesta no encontrada en la configuración' });
  }

  if (clientStatus !== 'READY' || !sock) {
    return res.status(400).json({ error: 'WhatsApp no está conectado todavía. Por favor escanea el código QR primero.' });
  }

  const result = await sendPoll(sock, item.groupName, item.title, item.options, true, availableGroups);
  res.json(result);
});

// Historial de logs
app.get('/api/logs', (req, res) => {
  const logs = loadLogs();
  res.json(logs);
});

// Limpiar historial de logs
app.delete('/api/logs', (req, res) => {
  const success = clearLogs();
  res.json({ success, message: success ? 'Historial limpiado correctamente' : 'Error al limpiar historial' });
});

// Iniciar conexión Baileys
connectToWhatsApp().catch(err => {
  console.error('Error al inicializar cliente de WhatsApp:', err);
});

// Arrancar servidor Express
app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(` Panel de Control disponible en: http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
