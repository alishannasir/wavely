# Production image for the API. Build:  docker build -t wavely-backend ./backend
FROM node:20-alpine AS build
# Prisma's engines need OpenSSL, which Alpine does not ship.
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build
# The seed script (plan limits) is TypeScript: compile it so production does not need ts-node.
RUN npx tsc prisma/seed.ts --outDir dist-seed --module commonjs --target es2021 --esModuleInterop --skipLibCheck

FROM node:20-alpine
RUN apk add --no-cache openssl wget
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-seed ./dist-seed
COPY scripts ./scripts
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# Apply migrations, make sure the plan limits exist, then start the API.
CMD ["sh", "-c", "sh scripts/migrate.sh && node dist-seed/seed.js && node dist/main.js"]
