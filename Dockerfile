# syntax=docker/dockerfile:1

# --- Bauen ---
# Typprüfung und Tests laufen mit: ein Abbild entsteht nur aus einem grünen Stand.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm test && npm run build

# --- Laufzeit ---
# Reine Browser-App ohne Serverseite: Caddy liefert nur die gebauten Dateien aus.
FROM caddy:2-alpine AS runtime
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 8080
