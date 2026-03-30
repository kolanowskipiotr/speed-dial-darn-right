# ─── STAGE 1: Build & Download Dependencies ───────────────────────
FROM node:20-alpine AS build-deps

WORKDIR /build
COPY scripts/package.json scripts/bundle.mjs ./

# Install dependencies and run the bundling script
RUN npm install \
    && node bundle.mjs

# ─── STAGE 2: Final Nginx Image ──────────────────────────────────
FROM nginx:1.27-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/speed-dial.conf

# Copy the app
WORKDIR /usr/share/nginx/html
COPY index.html ./
COPY favicon.ico icon.png icon.svg ./
COPY domain ./domain/

# Copy the vendored dependencies from the build stage
COPY --from=build-deps /vendor ./vendor/

# Create directories for future persistent storage.
RUN mkdir -p /data /uploads \
    && chown -R nginx:nginx /data /uploads \
    && chmod 755 /data /uploads

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/index.html | grep -q "Speed Dial Darn Right" || exit 1

CMD ["nginx", "-g", "daemon off;"]
