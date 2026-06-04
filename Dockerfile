FROM node:18-slim

# Set working directory inside container
WORKDIR /app

# Copy root dependency configuration
COPY package*.json ./

# Install backend dependencies
RUN npm install

# Copy backend server code
COPY server.js ./

# Copy the frontend folder (src, public, config, etc.)
COPY frontend ./frontend

# Install frontend dependencies and compile static React assets to frontend/dist
RUN cd frontend && npm install && npm run build

# Expose port 3001
EXPOSE 3001

# Run the Express server in production
CMD ["node", "server.js"]
