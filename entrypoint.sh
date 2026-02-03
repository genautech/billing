#!/bin/sh

# Cloud Run define a variável PORT, use 8080 como padrão se não estiver definida
PORT=${PORT:-8080}

# Substituir a porta no nginx.conf
sed -i "s/listen 80;/listen ${PORT};/g" /etc/nginx/conf.d/default.conf

# Iniciar nginx
exec nginx -g "daemon off;"





