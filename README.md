# App Stickers

Una aplicación minimalista para enviar stickers de WhatsApp automáticamente.

## Características

- Escaneo de código QR de WhatsApp Web
- Envío automático de stickers
- Interfaz web simple e intuitiva
- Soporte para arrastrar y soltar imágenes
- Conversión automática a stickers de WhatsApp
- Barra de progreso en tiempo real

## Requisitos

- Node.js 14.x o superior
- NPM 6.x o superior

## Instalación

1. Clona el repositorio:
```bash
git clone https://github.com/tu-usuario/app-stickers.git
cd app-stickers
```

2. Instala las dependencias:
```bash
npm install
```

3. Crea un archivo `.env` en la raíz del proyecto con el siguiente contenido:
```
PORT=3000
NODE_ENV=development
```

4. Crea el directorio para las subidas:
```bash
mkdir uploads
```

## Uso

1. Inicia la aplicación:
```bash
npm start
```

2. Abre tu navegador en `http://localhost:3000`

3. Escanea el código QR con WhatsApp en tu teléfono

4. Una vez conectado, puedes:
   - Arrastrar y soltar imágenes en la zona designada
   - Hacer clic para seleccionar imágenes
   - Ver el progreso de la conversión y envío

## Despliegue en Railway

1. Crea una cuenta en [Railway.app](https://railway.app)
2. Conecta tu repositorio de GitHub
3. Configura las variables de entorno en Railway
4. ¡Listo! La aplicación se desplegará automáticamente

## Notas importantes

- La sesión de WhatsApp se mantiene entre reinicios gracias a la autenticación local
- Los stickers se envían automáticamente al número que escaneó el código QR
- Se recomienda un delay de 2-3 segundos entre envíos para evitar baneos

## Licencia

MIT 