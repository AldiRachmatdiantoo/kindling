# syntax=docker/dockerfile:1
# Placeholder static web + NGINX image for Modul 1.
# In Modul 5, a Node/Vite build stage will compile React TS assets into /usr/share/nginx/html.

FROM nginx:1.27-alpine
COPY deploy/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/index.html /usr/share/nginx/html/index.html
EXPOSE 80
