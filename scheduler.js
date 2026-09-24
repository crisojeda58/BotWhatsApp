const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const LOGS_PATH = path.join(__dirname, 'data', 'logs.json');

// Mapa para almacenar las tareas activas de node-schedule
const activeJobs = {};

/**
 * Carga la configuración desde config.json
 */
function loadConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error leyendo config.json:', err);
    return { schedules: [] };
  }
}

/**
 * Guarda la configuración en config.json
 */
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Error guardando config.json:', err);
  }
}

/**
 * Carga el historial de logs
 */
function loadLogs() {
  try {
    if (!fs.existsSync(LOGS_PATH)) return [];
    const data = fs.readFileSync(LOGS_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

/**
 * Limpia todo el historial de logs
 */
function clearLogs() {
  try {
    fs.writeFileSync(LOGS_PATH, JSON.stringify([], null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error limpiando logs:', err);
    return false;
  }
}

/**
 * Registra una actividad en el historial
 */
function addLog(type, groupName, pollTitle, status, details = '') {
  const logs = loadLogs();
  const logEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    type, // 'AUTOMATIC' | 'MANUAL'
    groupName,
    pollTitle,
    status, // 'SUCCESS' | 'ERROR' | 'GROUP_NOT_FOUND'
    details
  };
  logs.unshift(logEntry);
  // Mantener máximo 100 registros
  if (logs.length > 100) logs.pop();
  try {
    fs.writeFileSync(LOGS_PATH, JSON.stringify(logs, null, 2), 'utf8');
  } catch (err) {
    console.error('Error guardando logs:', err);
  }
  return logEntry;
}

/**
 * Busca el JID de un grupo por su nombre
 */
async function findGroupByName(sock, groupName, cachedGroups = []) {
  const target = groupName.trim().toLowerCase();

  // 1. Intentar desde los grupos en memoria
  if (cachedGroups && cachedGroups.length > 0) {
    const found = cachedGroups.find(g => {
      const name = (g.name || '').trim().toLowerCase();
      return name === target || name.includes(target) || target.includes(name);
    });
    if (found) return found;
  }

  // 2. Consultar directamente a Baileys
  try {
    if (sock && sock.groupFetchAllParticipating) {
      const groupsMap = await sock.groupFetchAllParticipating();
      const groupList = Object.values(groupsMap);
      const found = groupList.find(g => {
        const name = (g.subject || '').trim().toLowerCase();
        return name === target || name.includes(target) || target.includes(name);
      });
      if (found) {
        return {
          id: found.id,
          name: found.subject
        };
      }
    }
  } catch (err) {
    console.warn('[Baileys] Error consultando grupos:', err.message);
  }

  return null;
}

/**
 * Envía una encuesta a un grupo específico usando Baileys
 */
async function sendPoll(sock, groupName, title, options, isManual = false, cachedGroups = []) {
  try {
    const group = await findGroupByName(sock, groupName, cachedGroups);
    if (!group) {
      const errorMsg = `No se encontró el grupo "${groupName}". Asegúrate de que el bot pertenezca a ese grupo.`;
      console.error(`[Poll Error] ${errorMsg}`);
      addLog(isManual ? 'MANUAL' : 'AUTOMATIC', groupName, title, 'GROUP_NOT_FOUND', errorMsg);
      return { success: false, message: errorMsg };
    }

    // Enviar encuesta mediante Baileys
    await sock.sendMessage(group.id, {
      poll: {
        name: title,
        values: options,
        selectableCount: 1 // Solo una respuesta permitida
      }
    });

    console.log(`[Poll Enviada] "${title}" enviada a "${groupName}"`);
    addLog(isManual ? 'MANUAL' : 'AUTOMATIC', groupName, title, 'SUCCESS', 'Encuesta enviada exitosamente');
    return { success: true, message: `Encuesta enviada a "${groupName}"` };
  } catch (err) {
    console.error(`[Poll Exception] Error enviando encuesta a "${groupName}":`, err);
    addLog(isManual ? 'MANUAL' : 'AUTOMATIC', groupName, title, 'ERROR', err.message || 'Error desconocido');
    return { success: false, message: err.message || 'Error al enviar encuesta' };
  }
}

/**
 * Inicializa y programa todas las encuestas en node-schedule
 */
function initScheduler(sock, getCachedGroups) {
  // Cancelar tareas previas
  Object.keys(activeJobs).forEach(jobId => {
    if (activeJobs[jobId]) activeJobs[jobId].cancel();
  });

  const config = loadConfig();

  config.schedules.forEach(item => {
    if (!item.enabled) return;

    const [hourStr, minuteStr] = item.time.split(':');
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    const rule = new schedule.RecurrenceRule();
    rule.dayOfWeek = item.dayOfWeek;
    rule.hour = hour;
    rule.minute = minute;
    rule.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago';

    const job = schedule.scheduleJob(rule, async () => {
      console.log(`[Scheduler] Ejecutando encuesta programada: ${item.title} para ${item.groupName}`);
      const groups = typeof getCachedGroups === 'function' ? getCachedGroups() : [];
      await sendPoll(sock, item.groupName, item.title, item.options, false, groups);
    });

    activeJobs[item.id] = job;
    console.log(`[Scheduler] Programado "${item.title}" para los días ${item.dayName} a las ${item.time}`);
  });
}

module.exports = {
  loadConfig,
  saveConfig,
  loadLogs,
  clearLogs,
  sendPoll,
  initScheduler
};
