# API Gateway Dockerfile - Optimized
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

# Copy source code
COPY src ./src

# Copy environment file if needed
COPY .env ./

EXPOSE 8080

# Performance settings
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV CLUSTER_WORKERS=2

CMD ["npm", "run", "start:cluster"]
