# Multi-stage build para otimizar tamanho
FROM node:20-alpine AS builder
WORKDIR /app

# GEMINI_API_KEY is injected at build time so Vite can inline it into the bundle.
# Prefer passing it via --build-arg from a CI secret rather than baking it into
# the image layer cache. The key is also set at runtime on Cloud Run via
# Secret Manager for any server-side use.
ARG GEMINI_API_KEY=""
ENV GEMINI_API_KEY=$GEMINI_API_KEY

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]

