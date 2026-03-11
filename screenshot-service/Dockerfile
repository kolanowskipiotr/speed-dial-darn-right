FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

# Skip browser download — the base image already has them
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json ./
RUN npm install

COPY index.js ./

EXPOSE 3000
CMD ["node", "index.js"]
