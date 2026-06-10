FROM node:20-alpine

# Install Chromium + required system libs for headless browser (page monitor feature)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell puppeteer-core to use the system Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app
COPY package.json .
RUN npm install --production
COPY . .
CMD ["node", "server.js"]
