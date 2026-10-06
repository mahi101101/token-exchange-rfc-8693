FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests and install
COPY package*.json ./
RUN npm install

# Copy source files
COPY . .

EXPOSE 5173

# Expose host 0.0.0.0 so Vite accepts connections from outside the container
CMD ["npx", "vite", "--host", "0.0.0.0"]