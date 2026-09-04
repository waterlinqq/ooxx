FROM node:22-alpine
WORKDIR /app
COPY server/package.json ./
RUN npm install --omit=dev
COPY server/src ./src
COPY shared /shared
COPY apps/web/js /js
ENV SHARED_PATH=/shared
EXPOSE 3001
CMD ["node", "src/index.js"]
