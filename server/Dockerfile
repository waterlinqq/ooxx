FROM node:22-alpine
WORKDIR /ooxx

COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev

COPY shared ./shared
COPY server/src ./server/src
COPY apps/web/js ./apps/web/js

WORKDIR /ooxx/server
ENV SHARED_PATH=/ooxx/shared
EXPOSE 3001
CMD ["node", "src/index.js"]
