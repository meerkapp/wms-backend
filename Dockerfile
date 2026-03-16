# Stage 1: Download frontend from GitHub Releases
FROM alpine:3.19 AS frontend
WORKDIR /opt/frontend

ARG FRONTEND_URL=https://github.com/meerkapp/wms-frontend/releases/latest/download/meerk-wms-frontend.zip

RUN apk add --no-cache curl unzip ca-certificates \
    && curl -fSL ${FRONTEND_URL} -o frontend.zip \
    && unzip frontend.zip -d dist \
    && rm frontend.zip

# Stage 2: Build NestJS
FROM node:22-alpine AS builder
WORKDIR /opt/app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm prisma generate
RUN pnpm build
RUN pnpm prune --prod

# Stage 3: Production runner
FROM node:22-alpine AS runner
WORKDIR /opt/app

RUN apk add --no-cache curl

COPY --from=builder /opt/app/dist ./dist
COPY --from=builder /opt/app/node_modules ./node_modules
COPY --from=builder /opt/app/package.json ./package.json
COPY --from=builder /opt/app/prisma ./prisma
COPY --from=frontend /opt/frontend/dist ./frontend

EXPOSE 3000

# Run migrations and start the server
CMD ["sh", "-c", "pnpm run start:migrate:prod"]
