require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const multer = require('multer');
const path = require('path');
const { Sticker, createSticker, StickerTypes } = require('wa-sticker-formatter');
const sharp = require('sharp');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Configuración de Express
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Configuración de Multer para subida de archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Configuración de WhatsApp Web
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox']
    }
});

let qrCode = null;
let isAuthenticated = false;

// Eventos de WhatsApp Web
client.on('qr', async (qr) => {
    qrCode = await qrcode.toDataURL(qr);
    io.emit('qr', qrCode);
});

client.on('ready', () => {
    isAuthenticated = true;
    io.emit('ready', 'WhatsApp está conectado!');
});

client.on('authenticated', () => {
    isAuthenticated = true;
    io.emit('authenticated', 'WhatsApp está autenticado!');
});

client.on('auth_failure', () => {
    isAuthenticated = false;
    io.emit('auth_failure', 'Error de autenticación');
});

// Rutas
app.get('/', (req, res) => {
    res.render('index', { qrCode, isAuthenticated });
});

app.post('/upload', upload.array('stickers', 10), async (req, res) => {
    try {
        const files = req.files;
        const results = [];

        for (const file of files) {
            // Procesar imagen con sharp
            const processedImage = await sharp(file.path)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .toBuffer();

            // Crear sticker
            const sticker = await createSticker(processedImage, {
                pack: 'Mi Pack de Stickers',
                author: 'App Stickers',
                type: StickerTypes.FULL,
                categories: ['✨', '🎉'],
                id: Date.now().toString(),
                quality: 50,
            });

            results.push({
                originalName: file.originalname,
                path: file.path,
                stickerBuffer: sticker
            });
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('Error al procesar stickers:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
    client.initialize();
}); 