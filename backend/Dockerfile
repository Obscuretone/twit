FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Run dev mode to allow hot reloading during development (in real world, this would be a multi-stage build for prod)
# We will use ts-node-dev or nodemon for hot-reloading in dev. 
# But let's set it up to compile and run for now.
RUN npm run build || true 
# Add a build script in package.json later. For now just start via ts-node

EXPOSE 4000
CMD ["npx", "ts-node", "src/index.ts"]
