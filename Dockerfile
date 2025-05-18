FROM node:18-slim

# Instalar dependencias necesarias para Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    libgconf-2-4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Establecer la variable de entorno para Chrome
ENV CHROME_BIN=/usr/bin/chromium

# Crear directorio de la aplicación
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Crear directorio de uploads
RUN mkdir -p uploads

# Exponer el puerto
EXPOSE 8080

# Iniciar la aplicación
CMD ["npm", "start"] 