# Base image - Alpine for smaller size
FROM node:20-alpine

# Working directory
WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install dependencies with production flag for smaller image
RUN npm install --production

# Copy source code
COPY src ./src

# Expose port
EXPOSE 8082

# === PERFORMANCE: Set Node.js memory limit ===
ENV NODE_OPTIONS="--max-old-space-size=512"

# === CLUSTER MODE: 2 workers per container ===
ENV CLUSTER_WORKERS=2

# Run app with cluster mode for multi-core usage
CMD ["npm", "run", "start:cluster"]
