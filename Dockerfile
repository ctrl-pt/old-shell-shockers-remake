FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY archive ./archive
COPY server ./server
COPY shared ./shared
COPY public ./public
ENV PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server/index.mjs"]
