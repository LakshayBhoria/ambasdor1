FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first (better build caching)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy the app
COPY . .

# Render sets PORT automatically; the app reads process.env.PORT
EXPOSE 10000
CMD ["node", "src/index.js"]
