FROM node:20-alpine

WORKDIR /app

COPY api/package*.json ./
RUN npm ci --omit=dev

COPY api/src/ ./src/

ENV NODE_ENV=production \
    PORT=3334

EXPOSE 3334

CMD ["node", "src/server.js"]
