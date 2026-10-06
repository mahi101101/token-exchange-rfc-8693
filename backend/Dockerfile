FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests and install
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

EXPOSE 3001

CMD ["npm", "start"]