FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY templates ./templates

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/comissionamento.db

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
