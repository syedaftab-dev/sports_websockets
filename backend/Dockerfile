FROM node:20-alpine

WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Expose the port the server listens on (default 8000)
EXPOSE 8000

# Start the backend server
CMD ["node", "src/index.js"]
