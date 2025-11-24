# Base image
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

# Copy source
COPY src ./src
COPY .env ./

EXPOSE 8083

CMD ["npm", "start"]
