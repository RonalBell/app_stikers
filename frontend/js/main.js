// Elementos del DOM
const imageInput = document.getElementById('imageInput');
const previewContainer = document.getElementById('previewContainer');
const phoneNumberInput = document.getElementById('phoneNumber');
const sendButton = document.getElementById('sendButton');
const contactsSection = document.getElementById('contactsSection');

// Elementos del DOM para WhatsApp
const qrContainer = document.createElement('div');
qrContainer.id = 'qrContainer';
qrContainer.style = 'margin: 20px 0; text-align: center;';

const statusText = document.createElement('div');
statusText.id = 'waStatusText';
statusText.style = 'margin-bottom: 10px; text-align: center; font-weight: bold;';

// Función para inicializar los elementos de WhatsApp
function initializeWhatsAppElements() {
    const rightPanel = document.querySelector('.right-panel');
    if (!rightPanel) return;

    // Buscar la sección de WhatsApp
    const whatsappSection = Array.from(rightPanel.querySelectorAll('.section-label'))
        .find(section => section.textContent.includes('Estado de WhatsApp'));

    if (whatsappSection) {
        // Insertar los elementos después de la sección de WhatsApp
        whatsappSection.insertAdjacentElement('afterend', statusText);
        statusText.insertAdjacentElement('afterend', qrContainer);
    }
}

// Inicializar elementos cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initializeWhatsAppElements);

// Estado de la aplicación
let selectedImages = [];

// Función para validar el número de teléfono colombiano
function validatePhoneNumber(phone) {
    // Solo 10 dígitos, debe empezar en 3 (móviles en Colombia)
    const phoneRegex = /^3\d{9}$/;
    return phoneRegex.test(phone);
}

// Función para crear la previsualización de una imagen
function createImagePreview(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            
            const img = document.createElement('img');
            img.src = e.target.result;
            
            const fileName = document.createElement('span');
            fileName.textContent = file.name;
            fileName.style.marginLeft = '12px';
            fileName.style.color = '#0f172a';
            fileName.style.fontSize = '0.95em';
            
            div.appendChild(img);
            div.appendChild(fileName);
            resolve(div);
        };
        reader.readAsDataURL(file);
    });
}

// Manejador para la selección de imágenes
imageInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    selectedImages = files;
    
    // Limpiar contenedor de previsualizaciones
    previewContainer.innerHTML = '';
    
    // Crear previsualizaciones
    for (const file of files) {
        const preview = await createImagePreview(file);
        previewContainer.appendChild(preview);
    }
    
    // Actualizar estado del botón
    updateSendButtonState();
});

// Mostrar advertencia si el número es inválido
phoneNumberInput.addEventListener('input', () => {
    const small = phoneNumberInput.parentElement.parentElement.querySelector('small');
    if (phoneNumberInput.value && !validatePhoneNumber(phoneNumberInput.value)) {
        small.textContent = 'El número debe tener 10 dígitos y empezar en 3 (ej: 3001234567)';
        small.style.color = 'red';
    } else {
        small.textContent = 'Ingresa solo los 10 dígitos del número colombiano, sin el +57';
        small.style.color = '';
    }
    updateSendButtonState();
});

// Función para actualizar el estado del botón de envío
function updateSendButtonState() {
    const hasImages = selectedImages.length > 0;
    const hasValidPhone = validatePhoneNumber(phoneNumberInput.value);
    sendButton.disabled = !(hasImages && hasValidPhone);
}

// Manejador para el envío de stickers
sendButton.addEventListener('click', async () => {
    if (sendButton.disabled) return;
    
    const formData = new FormData();
    selectedImages.forEach((image, index) => {
        formData.append('images', image);
    });
    formData.append('phoneNumber', phoneNumberInput.value);
    
    try {
        sendButton.disabled = true;
        sendButton.textContent = 'Enviando...';
        
        const response = await fetch('http://localhost:3000/api/send-stickers', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al enviar los stickers');
        }
        
        const result = await response.json();
        alert('¡Stickers enviados con éxito!');
        
        // Limpiar el formulario
        imageInput.value = '';
        phoneNumberInput.value = '';
        previewContainer.innerHTML = '';
        selectedImages = [];
        updateSendButtonState();
        
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        sendButton.disabled = false;
        sendButton.textContent = 'Enviar Stickers';
    }
});

// Función para mostrar el QR y el estado de WhatsApp
async function fetchWhatsAppStatus() {
    try {
        const res = await fetch('http://localhost:3000/api/whatsapp-status');
        const data = await res.json();
        if (data.ready) {
            qrContainer.innerHTML = '';
            statusText.textContent = 'WhatsApp conectado ✅';
            loadContacts();
        } else if (data.qr) {
            statusText.textContent = 'Escanea el QR con WhatsApp para conectar:';
            qrContainer.innerHTML = `<img src='https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(data.qr)}&size=200x200' alt='QR WhatsApp'>`;
            contactsSection.innerHTML = '';
        } else {
            statusText.textContent = 'Esperando QR de WhatsApp...';
            qrContainer.innerHTML = '';
            contactsSection.innerHTML = '';
        }
    } catch (e) {
        statusText.textContent = 'No se pudo conectar con el backend.';
        qrContainer.innerHTML = '';
        contactsSection.innerHTML = '';
    }
}

// Función para cargar y mostrar contactos no archivados
async function loadContacts() {
    try {
        const res = await fetch('http://localhost:3000/api/contacts');
        const data = await res.json();
        if (data.contacts && data.contacts.length > 0) {
            contactsSection.innerHTML = '<h3>Contactos no archivados:</h3>' +
                '<ul>' +
                data.contacts.map(c => `<li data-id='${c.id}'>${c.name} <button onclick=\"selectContact('${c.id}','${c.name.replace(/'/g, '')}')\">Seleccionar</button></li>`).join('') +
                '</ul>';
        } else {
            contactsSection.innerHTML = '<h3>No hay contactos no archivados.</h3>';
        }
    } catch (e) {
        contactsSection.innerHTML = '<h3>Error al cargar contactos.</h3>';
    }
}

// Permitir seleccionar contacto para autollenar el input
window.selectContact = function(id, name) {
    // Extraer solo el número del id (ej: 573001234567@c.us)
    const match = id.match(/^57(3\d{9})@c\.us$/);
    if (match) {
        phoneNumberInput.value = match[1];
        updateSendButtonState();
    }
};

// Refrescar QR y estado cada 3 segundos
setInterval(fetchWhatsAppStatus, 3000);
fetchWhatsAppStatus();