# API container (Back4app, Railway, Fly, any Docker host). The React app deploys separately to Vercel.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci -w server --include=dev
COPY server server
RUN npm run build -w server && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist
USER node
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
