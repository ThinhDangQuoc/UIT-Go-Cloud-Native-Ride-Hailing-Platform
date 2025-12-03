# User Service Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

# Copy source code
COPY src ./src

EXPOSE 8081

CMD ["npm", "start"]
