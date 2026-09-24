# 📊 Bot de Encuestas Automáticas para WhatsApp

Aplicación Web y Servicio Automatizado para la creación y programación de **encuestas periódicas en grupos de WhatsApp** (orientado a la organización de entrenamientos de grupos como *TC Varones* y *TC DAMAS*).

---

## 🚀 Características Principales

* 📱 **Vinculación mediante Código QR**: Inicio de sesión rápido y seguro mediante conexión directa por WebSockets (Baileys).
* 🔋 **Ultra Liviano y Multiplataforma**: No requiere navegadores Chrome/Puppeteer; consume menos de 40 MB de RAM y funciona en **Windows**, **Linux**, **Docker** y **Android (Termux)**.
* 🗓️ **Programación Automática de Encuestas**: Envío programado semanalmente en días y horas específicas mediante `node-schedule`.
* ⚡ **Prueba de Envío Manual Inmediato**: Botón para forzar el envío instantáneo de cualquiera de las encuestas para verificación.
* 🖥️ **Panel de Control Web**: Interfaz accesible en `http://localhost:3050` desde cualquier navegador (Chrome, Edge, Brave en PC o Móvil).
* 📝 **Historial de Logs (Persistente)**: Registro completo de envíos exitosos, manuales/automáticos y posibles errores.

---

## 🛠️ Tecnologías Utilizadas

* **Node.js** (v18+)
* **Express.js**: Servidor HTTP y API REST.
* **@whiskeysockets/baileys**: Conexión nativa con WhatsApp Web API mediante WebSockets (sin Chrome).
* **node-schedule**: Motor de tareas programadas recurrentes.
* **pnpm / npm**: Gestión de paquetes.

---

## 📋 Requisitos Previos

* Tener **Node.js** instalado (versión 18 o superior).
* Administrador de paquetes `pnpm` o `npm`.

---

## 📦 Instalación

1. Clona o descarga la carpeta del proyecto.
2. Abre una terminal en el directorio del proyecto y ejecuta:

```bash
pnpm install
```
*(O `npm install` si prefieres utilizar npm)*.

---

## ⚙️ Configuración (`config.json`)

El archivo [config.json](file:///c:/Users/cristian.ojeda/Documents/Prueba%20movil/config.json) define las encuestas programadas. Ejemplo de estructura:

```json
{
  "schedules": [
    {
      "id": "varones-sabado",
      "dayOfWeek": 3,
      "dayName": "Miércoles",
      "time": "11:00",
      "groupName": "TC Varones",
      "title": "Entrenamiento Sabado 19:00hr",
      "options": ["Voy", "No puedo"],
      "enabled": true
    }
  ]
}
```

* `dayOfWeek`: Día de la semana en que se publica la encuesta (0 = Domingo, 3 = Miércoles).
* `groupName`: Nombre del grupo de WhatsApp destino (acepta coincidencia exacta o parcial).
* `options`: Las opciones seleccionables de la encuesta.

---

## 🚀 Ejecución del Proyecto

Para iniciar el servidor en modo desarrollo:

```bash
pnpm run dev
```

Una vez iniciado:
1. Abre tu navegador e ingresa a: **`http://localhost:3050`**
2. Si es la primera vez, escanea el **código QR** que aparece en el panel con tu aplicación móvil de WhatsApp (*Dispositivos vinculados*).
3. Una vez conectado, podrás probar los envíos o dejar el servidor corriendo para que envíe las encuestas en los días y horas configurados.

---

## 🌐 Endpoints de la API REST

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/status` | Obtiene el estado de conexión de WhatsApp, usuario activo y grupos. |
| `GET` | `/api/schedules` | Lista las encuestas configuradas. |
| `PUT` | `/api/schedules/:id` | Modifica la hora o activa/desactiva una programación. |
| `POST` | `/api/trigger/:id` | Dispara el envío manual inmediato de una encuesta. |
| `GET` | `/api/logs` | Obtiene el historial de envíos registrados. |

---

## 📂 Estructura del Proyecto

```text
Prueba movil/
├── public/              # Interfaz Frontend (HTML, CSS, JS)
│   ├── index.html       # Panel de control web
│   ├── style.css        # Estilos visuales
│   └── app.js           # Lógica cliente (fetch API, polling, toasts)
├── data/
│   └── logs.json        # Registro persistente de envíos
├── config.json          # Configuración de encuestas programadas
├── server.js            # Servidor Express y cliente WhatsApp Web
├── scheduler.js         # Motor de programación de encuestas
├── pnpm-workspace.yaml  # Configuración del entorno pnpm
└── README.md            # Documentación del proyecto
```

---
*Desarrollado con Node.js & whatsapp-web.js*
