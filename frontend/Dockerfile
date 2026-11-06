# Production image for the website: Vite build served by Caddy, which also proxies /api and /socket.io
# to the backend (same origin, so no CORS) and handles HTTPS certificates.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Relative URLs: the browser talks to the same host that served the page.
ARG VITE_API_URL=/api
ARG VITE_WS_URL=
ENV VITE_API_URL=$VITE_API_URL VITE_WS_URL=$VITE_WS_URL
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
