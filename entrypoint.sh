#!/bin/sh
set -e

# Cloud Run define a variável PORT, use 8080 como padrão se não estiver definida
PORT=${PORT:-8080}

# Validar que PORT é numérico
case "$PORT" in
    ''|*[!0-9]*) echo "ERROR: PORT must be a number, got: $PORT" >&2; exit 1 ;;
esac

if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    echo "ERROR: PORT must be between 1 and 65535, got: $PORT" >&2
    exit 1
fi

# Substituir a porta no nginx.conf
sed -i "s/listen 80;/listen ${PORT};/g" /etc/nginx/conf.d/default.conf

echo "Starting nginx on port ${PORT}"

# Iniciar nginx
exec nginx -g "daemon off;"





