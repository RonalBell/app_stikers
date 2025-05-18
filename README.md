# App Stickers - Conversor y Enviador de Stickers para WhatsApp

Esta aplicación permite convertir imágenes a stickers de WhatsApp y enviarlos directamente a un número de teléfono.

## Requisitos Previos

- Node.js (versión 14 o superior)
- Navegador web moderno
- WhatsApp Web instalado en tu teléfono

## Instalación

1. Clona este repositorio
2. En la carpeta `backend`, ejecuta:
   ```bash
   npm install
   ```
3. Inicia el servidor backend:
   ```bash
   node server.js
   ```
4. Abre el archivo `frontend/index.html` en tu navegador

## Estructura del Proyecto

- `frontend/`: Contiene todos los archivos de la interfaz de usuario
- `backend/`: Contiene el servidor Node.js y la lógica de procesamiento

## Tecnologías Utilizadas

- Frontend: HTML5, CSS3, JavaScript Vanilla
- Backend: Node.js, Express
- Procesamiento de imágenes: Sharp
- WhatsApp: whatsapp-web.js 