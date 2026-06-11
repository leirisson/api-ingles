FROM node:20-alpine

WORKDIR /app

COPY serve.js ./
COPY index.html ./

ENV PORT=8080

EXPOSE 8080

CMD ["node", "serve.js"]
