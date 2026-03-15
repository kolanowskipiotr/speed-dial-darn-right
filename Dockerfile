FROM nginx:1.27-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/speed-dial.conf

# Copy the app
COPY speed-dial.html /usr/share/nginx/html/index.html
COPY favicon.ico icon.png icon.svg /usr/share/nginx/html/
COPY css /usr/share/nginx/html/css/
COPY js /usr/share/nginx/html/js/

# Create directories for future persistent storage.
# These will be overridden by the volumes defined in docker-compose,
# but we create them here so the image works standalone too.
RUN mkdir -p /data /uploads \
    && chown -R nginx:nginx /data /uploads \
    && chmod 755 /data /uploads

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/index.html | grep -q "Speed Dial Darn Right" || exit 1

CMD ["nginx", "-g", "daemon off;"]
