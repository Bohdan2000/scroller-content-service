# ─── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Prisma engine requires OpenSSL on Alpine (musl-based)
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma/schema.prisma ./prisma/

# Install all deps (including devDeps needed for prisma generate)
RUN npm ci

# Use the locally installed prisma binary — never npx (which may pull a newer version)
RUN ./node_modules/.bin/prisma generate

# ─── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

COPY . .

RUN npm run build

# ─── Stage 3: production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Prisma engine requires OpenSSL on Alpine (musl-based)
RUN apk add --no-cache openssl

# prisma is in dependencies (not devDependencies) so it's available here for
# both `prisma generate` and `prisma migrate deploy` at runtime
COPY package*.json ./
COPY prisma ./prisma

RUN npm ci --omit=dev && ./node_modules/.bin/prisma generate

# Copy compiled output
COPY --from=build /app/dist ./dist

# Create non-root user and hand over ownership of the entire workdir
# (node_modules is installed as root above — chown before switching user so
#  prisma migrate deploy can write engine cache files at runtime)
RUN addgroup -S appgroup \
    && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3003

# Run migrations then start — uses local binary, not npx
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main"]
