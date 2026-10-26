FROM nginx:1.27-alpine

# Release id (the workflow passes the short commit SHA). Every code URL gets "?v=<VERSION>" so a
# new release always has new URLs: CDNs and browsers can't hand out an older app.js/styles.css
# alongside a newer index.html. Images already have content-hashed names.
ARG VERSION=dev

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html favicon.svg manifest.webmanifest sw.js /usr/share/nginx/html/
COPY icons /usr/share/nginx/html/icons
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js
COPY images /usr/share/nginx/html/images

COPY docker/stamp-release.sh /tmp/stamp-release.sh
RUN sh /tmp/stamp-release.sh /usr/share/nginx/html "${VERSION}" && rm /tmp/stamp-release.sh

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
