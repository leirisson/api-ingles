FROM node:20-alpine

WORKDIR /app

COPY frontend/serve.js ./
COPY frontend/index.html ./

ENV PORT=8080

EXPOSE 8080

CMD ["node", "serve.js"]
