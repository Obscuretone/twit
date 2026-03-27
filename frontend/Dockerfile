FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Usually NextJS uses `npm run build` and `npm run start` for production
# For scaffolding, we can just run `npm run dev`
# We'll switch to a production build once scaffolding is solid.
CMD ["npm", "run", "dev"]
