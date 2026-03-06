FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ src/
RUN yarn build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
ENV PORT=4100
EXPOSE 4100
CMD ["node", "dist/index.js"]
