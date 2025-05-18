const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const app = express();
const port = process.env.PORT || 3000;

// Configuración de CORS
app.use(cors());

// Ruta de prueba para health check
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Servidor funcionando' });
});

// Configuración de multer para manejar archivos
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // límite de 5MB
    }
});

// Crear directorio temporal si no existe
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// Inicializar cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox'],
        executablePath: puppeteer.executablePath() 
    }
});

// Variables para almacenar el último QR y el estado de conexión
let lastQr = null;
let isClientReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Evento cuando el cliente está listo
client.on('ready', () => {
    isClientReady = true;
    lastQr = null;
    reconnectAttempts = 0;
    console.log('Cliente WhatsApp está listo!');
});

// Evento para mostrar el código QR
client.on('qr', (qr) => {
    lastQr = qr;
    isClientReady = false;
    console.log('QR RECIBIDO, escanea con WhatsApp:');
    qrcode.generate(qr, { small: true });
});

// Evento de desconexión
client.on('disconnected', async (reason) => {
    console.log('Cliente desconectado:', reason);
    isClientReady = false;
    lastQr = null;

    // Intentar reconectar automáticamente
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`Intento de reconexión ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        try {
            await client.initialize();
        } catch (error) {
            console.error('Error al intentar reconectar:', error);
        }
    } else {
        console.log('Máximo número de intentos de reconexión alcanzado');
    }
});

// Evento de autenticación fallida
client.on('auth_failure', (error) => {
    console.log('Error de autenticación:', error);
    isClientReady = false;
    lastQr = null;
    // Reiniciar el cliente para generar nuevo QR
    client.initialize();
});

// Log de mensajes salientes y entrantes para depuración
client.on('message_create', (msg) => {
    console.log('[WhatsApp] Mensaje creado:', msg.body, 'para', msg.to);
});
client.on('message', (msg) => {
    console.log('[WhatsApp] Mensaje recibido:', msg.body, 'de', msg.from);
});

// Iniciar el cliente
client.initialize();

// Función para convertir imagen a WebP
async function convertToWebP(imageBuffer) {
    return sharp(imageBuffer)
        .resize(512, 512, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp()
        .toBuffer();
}

// Ruta para enviar stickers
app.post('/api/send-stickers', upload.array('images'), async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        const files = req.files;

        console.log('--- NUEVO ENVÍO DE STICKERS ---');
        console.log('Número recibido:', phoneNumber);
        console.log('Cantidad de imágenes:', files ? files.length : 0);

        if (!files || files.length === 0) {
            console.log('No se proporcionaron imágenes');
            return res.status(400).json({ error: 'No se proporcionaron imágenes' });
        }

        if (!phoneNumber) {
            console.log('No se proporcionó número de teléfono');
            return res.status(400).json({ error: 'No se proporcionó número de teléfono' });
        }

        // Validar y formatear el número de teléfono SOLO para Colombia
        let cleanNumber = phoneNumber.replace(/\D/g, ''); // Solo dígitos
        // Solo acepta números de 10 dígitos que empiecen en 3
        if (!/^3\d{9}$/.test(cleanNumber)) {
            console.log('Número de teléfono colombiano inválido:', cleanNumber);
            return res.status(400).json({ error: 'Número de teléfono inválido. Debe ser un celular colombiano (10 dígitos, empieza en 3).' });
        }
        // Formato internacional para WhatsApp Colombia
        const waNumber = `57${cleanNumber}`;
        console.log('Número limpio y formateado para WhatsApp:', waNumber);

        // Verificar que el cliente de WhatsApp esté listo
        if (!client.info) {
            console.log('Cliente de WhatsApp no está listo');
            return res.status(503).json({ error: 'Cliente de WhatsApp no está listo. Por favor, escanea el código QR.' });
        }

        // Convertir cada imagen a WebP
        let convertedImages = [];
        try {
            convertedImages = await Promise.all(
                files.map(file => convertToWebP(file.buffer))
            );
            console.log('Imágenes convertidas a WebP:', convertedImages.length);
        } catch (err) {
            console.error('Error al convertir imágenes a WebP:', err);
            return res.status(500).json({ error: 'Error al convertir imágenes a WebP' });
        }

        // Guardar imágenes temporalmente
        let tempFiles = [];
        try {
            tempFiles = await Promise.all(
                convertedImages.map(async (imageBuffer, index) => {
                    const tempPath = path.join(tempDir, `sticker_${index}.webp`);
                    await fs.promises.writeFile(tempPath, imageBuffer);
                    return tempPath;
                })
            );
            console.log('Archivos temporales creados:', tempFiles);
        } catch (err) {
            console.error('Error al guardar archivos temporales:', err);
            return res.status(500).json({ error: 'Error al guardar archivos temporales' });
        }

        // Verificar si el número está registrado en WhatsApp
        let isRegistered = false;
        try {
            isRegistered = await client.isRegisteredUser(`${waNumber}@c.us`);
            console.log('¿Número registrado en WhatsApp?:', isRegistered);
        } catch (err) {
            console.error('Error al verificar número en WhatsApp:', err);
            await Promise.all(tempFiles.map(filePath => fs.promises.unlink(filePath)));
            return res.status(500).json({ error: 'Error al verificar número en WhatsApp' });
        }
        if (!isRegistered) {
            await Promise.all(tempFiles.map(filePath => fs.promises.unlink(filePath)));
            console.log('El número no está registrado en WhatsApp');
            return res.status(400).json({ error: 'El número no está registrado en WhatsApp.' });
        }

        // Enviar cada sticker por WhatsApp
        let enviados = 0;
        let errores = [];
        for (const filePath of tempFiles) {
            try {
                console.log(`Enviando sticker a ${waNumber}@c.us:`, filePath);
                // Cargar el archivo WebP como MessageMedia
                const stickerMedia = await MessageMedia.fromFilePath(filePath);
                // Enviar como sticker
                const result = await client.sendMessage(
                    `${waNumber}@c.us`,
                    stickerMedia,
                    { sendMediaAsSticker: true }
                );
                enviados++;
                console.log('Sticker enviado correctamente:', result.id ? result.id._serialized : result);
            } catch (error) {
                console.error('Error al enviar sticker:', error);
                errores.push(error.message || 'Error desconocido');
            }
        }

        // Limpiar archivos temporales
        try {
            await Promise.all(
                tempFiles.map(filePath => fs.promises.unlink(filePath))
            );
            console.log('Archivos temporales eliminados');
        } catch (err) {
            console.error('Error al eliminar archivos temporales:', err);
        }

        if (enviados > 0 && errores.length === 0) {
            console.log(`¡${enviados} sticker(s) enviados correctamente!`);
            res.json({ success: true, message: `¡${enviados} sticker(s) enviados correctamente!` });
        } else if (enviados > 0 && errores.length > 0) {
            console.log(`Se enviaron ${enviados} sticker(s), pero hubo errores:`, errores);
            res.json({ success: true, message: `Se enviaron ${enviados} sticker(s), pero hubo errores en algunos envíos.`, errores });
        } else {
            console.log('No se pudo enviar ningún sticker:', errores);
            res.status(500).json({ error: 'No se pudo enviar ningún sticker.', errores });
        }
    } catch (error) {
        console.error('Error general en el endpoint /api/send-stickers:', error);
        res.status(500).json({ error: error.message || 'Error al procesar los stickers' });
    }
});

// Endpoint de prueba para enviar mensaje de texto
app.post('/api/test-text', express.json(), async (req, res) => {
    try {
        const { phoneNumber, text } = req.body;
        let cleanNumber = phoneNumber.replace(/\D/g, '');
        if (!/^3\d{9}$/.test(cleanNumber)) {
            return res.status(400).json({ error: 'Número de teléfono inválido. Debe ser un celular colombiano (10 dígitos, empieza en 3).' });
        }
        const waNumber = `57${cleanNumber}`;
        if (!client.info) {
            return res.status(503).json({ error: 'Cliente de WhatsApp no está listo.' });
        }
        const isRegistered = await client.isRegisteredUser(`${waNumber}@c.us`);
        if (!isRegistered) {
            return res.status(400).json({ error: 'El número no está registrado en WhatsApp.' });
        }
        const result = await client.sendMessage(`${waNumber}@c.us`, text || 'Mensaje de prueba desde backend');
        console.log('Mensaje de texto enviado:', result.id ? result.id._serialized : result);
        res.json({ success: true, message: 'Mensaje de texto enviado', result });
    } catch (error) {
        console.error('Error al enviar mensaje de texto:', error);
        res.status(500).json({ error: error.message || 'Error al enviar mensaje de texto' });
    }
});

// Endpoint para obtener el QR actual y el estado de conexión
app.get('/api/whatsapp-status', (req, res) => {
    res.json({
        qr: lastQr,
        ready: isClientReady
    });
});

// Endpoint para obtener los contactos no archivados
app.get('/api/contacts', async (req, res) => {
    try {
        if (!isClientReady) {
            return res.status(503).json({ error: 'Cliente de WhatsApp no está listo.' });
        }
        const chats = await client.getChats();
        // Filtrar solo chats de usuario (no grupos, no archivados)
        const contacts = chats
            .filter(chat => chat.isGroup === false && chat.archived === false)
            .map(chat => ({
                id: chat.id._serialized,
                name: chat.name || chat.formattedTitle || chat.id.user
            }));
        res.json({ contacts });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Error al obtener contactos' });
    }
});

// Función para limpiar archivos de sesión
async function cleanupSessionFiles() {
    const sessionDir = path.join(__dirname, '.wwebjs_auth', 'session');
    
    // Esperar un momento antes de intentar limpiar
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Intentar eliminar todo el directorio de sesión
    try {
        if (fs.existsSync(sessionDir)) {
            // Primero intentar renombrar el directorio
            const tempDir = `${sessionDir}_${Date.now()}`;
            fs.renameSync(sessionDir, tempDir);
            // Luego intentar eliminar el directorio renombrado
            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log('Directorio de sesión eliminado completamente');
            return;
        }
    } catch (error) {
        console.log('Error al eliminar directorio de sesión:', error.message);
    }

    // Si no se pudo eliminar el directorio completo, intentar archivo por archivo
    const filesToClean = [
        'lockfile',
        'first_party_sets.db',
        'first_party_sets.db-journal',
        'Cookies',
        'Cookies-journal',
        'Local Storage',
        'Session Storage',
        'IndexedDB',
        'Service Worker',
        'Cache',
        'Code Cache'
    ];

    for (const file of filesToClean) {
        const filePath = path.join(sessionDir, file);
        try {
            if (fs.existsSync(filePath)) {
                if (fs.lstatSync(filePath).isDirectory()) {
                    // Intentar renombrar el directorio antes de eliminar
                    const tempPath = `${filePath}_${Date.now()}`;
                    fs.renameSync(filePath, tempPath);
                    fs.rmSync(tempPath, { recursive: true, force: true });
                } else {
                    // Intentar renombrar el archivo antes de eliminar
                    const tempPath = `${filePath}_${Date.now()}`;
                    fs.renameSync(filePath, tempPath);
                    fs.unlinkSync(tempPath);
                }
                console.log(`Archivo eliminado: ${file}`);
            }
        } catch (error) {
            console.log(`Error al eliminar ${file}:`, error.message);
        }
    }
}

// Función para crear un nuevo cliente
function createNewClient() {
    return new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-software-rasterizer',
                '--disable-features=site-per-process',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-site-isolation-trials',
                '--window-size=1280,720',
                '--window-position=0,0',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-default-browser-check',
                '--no-experiments',
                '--disable-popup-blocking',
                '--disable-prompt-on-repost',
                '--disable-domain-reliability',
                '--disable-component-update',
                '--disable-client-side-phishing-detection',
                '--disable-component-extensions-with-background-pages',
                '--disable-breakpad',
                '--disable-session-crashed-bubble',
                '--disable-ipc-flooding-protection',
                '--disable-hang-monitor',
                '--disable-prompt-on-repost',
                '--disable-domain-reliability',
                '--disable-component-update',
                '--disable-client-side-phishing-detection',
                '--disable-component-extensions-with-background-pages',
                '--disable-breakpad',
                '--disable-session-crashed-bubble',
                '--disable-ipc-flooding-protection',
                '--disable-hang-monitor'
            ],
            headless: false,
            executablePath: puppeteer.executablePath(),
            ignoreHTTPSErrors: true,
            timeout: 60000,
            defaultViewport: {
                width: 1280,
                height: 720
            }
        }
    });
}

// Endpoint para cerrar sesión
app.post('/api/logout', async (req, res) => {
    try {
        // Intentar cerrar la sesión actual
        try {
            await client.logout();
        } catch (logoutError) {
            console.log('Error al cerrar sesión, intentando continuar:', logoutError.message);
        }

        // Destruir el cliente actual
        try {
            await client.destroy();
        } catch (destroyError) {
            console.log('Error al destruir cliente:', destroyError.message);
        }

        // Esperar un momento antes de limpiar
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Limpiar archivos de sesión
        await cleanupSessionFiles();

        // Esperar un momento después de limpiar
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Crear un nuevo cliente
        const newClient = createNewClient();

        // Configurar eventos del nuevo cliente
        newClient.on('ready', () => {
            isClientReady = true;
            lastQr = null;
            reconnectAttempts = 0;
            console.log('Nuevo cliente WhatsApp está listo!');
        });

        newClient.on('qr', (qr) => {
            lastQr = qr;
            isClientReady = false;
            console.log('QR RECIBIDO, escanea con WhatsApp:');
            qrcode.generate(qr, { small: true });
        });

        newClient.on('disconnected', async (reason) => {
            console.log('Cliente desconectado:', reason);
            isClientReady = false;
            lastQr = null;

            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`Intento de reconexión ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
                try {
                    // Esperar antes de intentar reconectar
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    // Limpiar archivos antes de intentar reconectar
                    await cleanupSessionFiles();
                    // Esperar después de limpiar
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await newClient.initialize();
                } catch (error) {
                    console.error('Error al intentar reconectar:', error);
                }
            } else {
                console.log('Máximo número de intentos de reconexión alcanzado');
            }
        });

        newClient.on('auth_failure', async (error) => {
            console.log('Error de autenticación:', error);
            isClientReady = false;
            lastQr = null;
            await cleanupSessionFiles();
            await new Promise(resolve => setTimeout(resolve, 2000));
            await newClient.initialize();
        });

        // Inicializar el nuevo cliente
        await newClient.initialize();

        // Reemplazar el cliente anterior con el nuevo
        client = newClient;
        
        res.json({ success: true, message: 'Sesión cerrada correctamente' });
    } catch (error) {
        console.error('Error en el proceso de cierre de sesión:', error);
        res.status(500).json({ success: false, message: 'Error al cerrar sesión' });
    }
});

// Iniciar servidor
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor corriendo en el puerto ${port}`);
});

// Manejo de errores del servidor
server.on('error', (error) => {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
});

// Manejo de señales de terminación
process.on('SIGTERM', () => {
    console.log('Recibida señal SIGTERM. Cerrando servidor...');
    server.close(() => {
        console.log('Servidor cerrado');
        process.exit(0);
    });
});