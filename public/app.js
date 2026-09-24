// Estado local de la app
let schedules = [];

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  fetchStatus();
  fetchSchedules();
  fetchLogs();

  // Polling de estado cada 3 segundos
  setInterval(fetchStatus, 3000);

  // Escuchar botones de logs
  document.getElementById('btn-refresh-logs').addEventListener('click', fetchLogs);
  document.getElementById('btn-clear-logs').addEventListener('click', handleClearLogs);

  // Escuchar botón de Pairing Code
  const btnPair = document.getElementById('btn-get-pair-code');
  if (btnPair) {
    btnPair.addEventListener('click', handleRequestPairCode);
  }

  // Escuchar botón de Desvincular / Logout
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', handleLogout);
  }
}

/**
 * Cierra sesión y reinicia el cliente de WhatsApp
 */
async function handleLogout() {
  if (!confirm('¿Estás seguro de que deseas cerrar sesión y desvincular este dispositivo?')) {
    return;
  }

  try {
    const res = await fetch('/api/logout', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast('Sesión desvinculada. Generando nuevo código de acceso...', 'info');
      fetchStatus();
    } else {
      showToast(data.error || 'Error al desvincular', 'error');
    }
  } catch (err) {
    console.error('Error cerrando sesión:', err);
    showToast('Error de conexión al cerrar sesión', 'error');
  }
}

/**
 * Solicita el código de 8 dígitos para vincular sin QR
 */
async function handleRequestPairCode() {
  const input = document.getElementById('pair-phone-input');
  const btn = document.getElementById('btn-get-pair-code');
  const resultDiv = document.getElementById('pair-code-result');
  const displayCode = document.getElementById('display-pair-code');

  const phoneNumber = input.value.trim();
  if (!phoneNumber) {
    alert('Por favor ingresa tu número con código de país (ejemplo: 56912345678)');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Generando...';

  try {
    const res = await fetch('/api/pair-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      displayCode.textContent = data.code;
      resultDiv.style.display = 'block';
    } else {
      alert(data.error || 'No se pudo generar el código. Intenta de nuevo.');
    }
  } catch (err) {
    console.error('Error solicitando código de emparejamiento:', err);
    alert('Error de conexión con el servidor.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Obtener Código';
  }
}

/**
 * Consulta el estado de WhatsApp al backend
 */
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    updateStatusUI(data);
  } catch (err) {
    console.error('Error obteniendo estado de WhatsApp:', err);
    setConnectionPill('status-disconnected', 'Desconectado / Servidor apagado');
  }
}

/**
 * Actualiza los elementos del DOM según el estado de WhatsApp
 */
function updateStatusUI(data) {
  const { status, qrCodeUrl, connectedUser, availableGroups } = data;

  const stateInitializing = document.getElementById('state-initializing');
  const stateQr = document.getElementById('state-qr');
  const stateReady = document.getElementById('state-ready');
  const qrImage = document.getElementById('qr-image');
  const userInfo = document.getElementById('user-info');
  const groupsList = document.getElementById('groups-list');

  // Ocultar todas las vistas
  stateInitializing.classList.add('hidden');
  stateQr.classList.add('hidden');
  stateReady.classList.add('hidden');

  if (status === 'INITIALIZING') {
    setConnectionPill('status-initializing', 'Inicializando WhatsApp...');
    stateInitializing.classList.remove('hidden');
  } else if (status === 'QR_READY') {
    setConnectionPill('status-qr', 'Código QR listo para escanear');
    stateQr.classList.remove('hidden');
    if (qrCodeUrl) qrImage.src = qrCodeUrl;
  } else if (status === 'READY' || status === 'AUTHENTICATED') {
    setConnectionPill('status-ready', 'WhatsApp Conectado');
    stateReady.classList.remove('hidden');

    if (connectedUser) {
      userInfo.textContent = `Sesión activa como: ${connectedUser.name || connectedUser.phone}`;
    }

    // Renderizar chips de grupos detectados
    if (availableGroups && availableGroups.length > 0) {
      const targetGroups = ['TC Varones', 'TC DAMAS'];
      groupsList.innerHTML = availableGroups.map(g => {
        const isMatched = targetGroups.some(tg => tg.toLowerCase() === g.name.toLowerCase());
        return `<span class="group-chip ${isMatched ? 'matched' : ''}">
          ${isMatched ? '✓ ' : ''}${escapeHtml(g.name)} (${g.participantsCount} participantes)
        </span>`;
      }).join('');
    } else {
      groupsList.innerHTML = '<span class="group-chip">Buscando grupos en la cuenta...</span>';
    }
  } else {
    setConnectionPill('status-disconnected', 'Desconectado');
  }
}

function setConnectionPill(className, text) {
  const pill = document.getElementById('status-pill');
  const statusText = document.getElementById('status-text');
  pill.className = `status-badge ${className}`;
  statusText.textContent = text;
}

/**
 * Carga las encuestas programadas desde el servidor
 */
async function fetchSchedules() {
  try {
    const res = await fetch('/api/schedules');
    schedules = await res.json();
    renderSchedules();
  } catch (err) {
    console.error('Error cargando encuestas programadas:', err);
  }
}

/**
 * Renderiza las tarjetas de encuestas programadas
 */
function renderSchedules() {
  const container = document.getElementById('schedules-grid');

  if (!schedules || schedules.length === 0) {
    container.innerHTML = '<p class="empty-state">No hay encuestas configuradas.</p>';
    return;
  }

  container.innerHTML = schedules.map(s => {
    return `
      <div class="schedule-card" id="card-${s.id}">
        <div class="schedule-top">
          <span class="day-badge">${escapeHtml(s.dayName)}</span>
          <span class="group-badge">${escapeHtml(s.groupName)}</span>
        </div>
        
        <div>
          <h3 class="poll-title">${escapeHtml(s.title)}</h3>
        </div>

        <div class="poll-options">
          ${s.options.map(opt => `<span class="option-pill">${escapeHtml(opt)}</span>`).join('')}
        </div>

        <div class="time-config">
          <label for="time-${s.id}">Hora de Envío:</label>
          <input type="time" id="time-${s.id}" class="time-input" value="${s.time}" 
            onchange="updateScheduleTime('${s.id}', this.value)">
        </div>

        <div class="schedule-actions">
          <label class="switch" title="Activar/Desactivar envío automático">
            <input type="checkbox" ${s.enabled ? 'checked' : ''} onchange="toggleSchedule('${s.id}', this.checked)">
            <span class="slider"></span>
          </label>
          <button class="btn btn-primary btn-block" onclick="triggerImmediatePoll('${s.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Probar Envío Ahora
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Actualiza la hora de envío de una encuesta
 */
async function updateScheduleTime(id, newTime) {
  try {
    const res = await fetch(`/api/schedules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time: newTime })
    });
    if (res.ok) {
      showToast(`Hora de envío actualizada a las ${newTime}`);
      fetchSchedules();
    }
  } catch (err) {
    showToast('Error al actualizar la hora');
  }
}

/**
 * Activa o desactiva una encuesta programada
 */
async function toggleSchedule(id, isEnabled) {
  try {
    const res = await fetch(`/api/schedules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: isEnabled })
    });
    if (res.ok) {
      showToast(isEnabled ? 'Encuesta activada' : 'Encuesta pausada');
      fetchSchedules();
    }
  } catch (err) {
    showToast('Error al cambiar estado');
  }
}

/**
 * Dispara el envío manual inmediato de una encuesta para prueba
 */
async function triggerImmediatePoll(id) {
  const cardBtn = document.querySelector(`#card-${id} button`);
  const originalText = cardBtn.innerHTML;
  cardBtn.disabled = true;
  cardBtn.innerHTML = 'Enviando...';

  try {
    const res = await fetch(`/api/trigger/${id}`, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      showToast('✓ Encuesta enviada exitosamente a WhatsApp');
      fetchLogs();
    } else {
      const errorText = data.message || (typeof data.error === 'string' ? data.error : '') || 'No se pudo enviar la encuesta';
      showToast(`⚠️ ${errorText}`);
    }
  } catch (err) {
    showToast('❌ Error de conexión al intentar enviar');
  } finally {
    cardBtn.disabled = false;
    cardBtn.innerHTML = originalText;
  }
}

/**
 * Carga el historial de logs de envíos
 */
async function fetchLogs() {
  try {
    const res = await fetch('/api/logs');
    const logs = await res.json();
    renderLogs(logs);
  } catch (err) {
    console.error('Error cargando logs:', err);
  }
}

/**
 * Limpia el historial de logs
 */
async function handleClearLogs() {
  if (!confirm('¿Estás seguro de que deseas borrar todo el historial de logs?')) {
    return;
  }

  try {
    const res = await fetch('/api/logs', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('✓ Historial de logs limpiado');
      renderLogs([]);
    } else {
      showToast('⚠️ No se pudo limpiar el historial');
    }
  } catch (err) {
    console.error('Error al limpiar logs:', err);
    showToast('❌ Error de conexión al limpiar logs');
  }
}

/**
 * Renderiza la tabla de logs
 */
function renderLogs(logs) {
  const tbody = document.getElementById('logs-tbody');

  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No hay envíos registrados aún.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(log => {
    const dateStr = new Date(log.timestamp).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    let statusText = 'ÉXITO';
    if (log.status === 'GROUP_NOT_FOUND') statusText = 'GRUPO NO ENCONTRADO';
    if (log.status === 'ERROR') statusText = 'ERROR';

    return `
      <tr>
        <td>${dateStr}</td>
        <td><span class="badge ${log.type === 'MANUAL' ? 'info-badge' : ''}">${log.type === 'MANUAL' ? 'MANUAL' : 'AUTO'}</span></td>
        <td><strong>${escapeHtml(log.groupName)}</strong></td>
        <td>${escapeHtml(log.pollTitle)}</td>
        <td><span class="status-tag ${log.status}">${statusText}</span></td>
      </tr>
    `;
  }).join('');
}

/**
 * Muestra una notificación Toast temporal en pantalla
 */
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
