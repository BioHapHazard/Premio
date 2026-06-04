FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install packages with clean production flag
RUN npm ci --only=production

# Bundle app source code
COPY server.js ./

# Expose server port
EXPOSE 3001

# Command to run server
CMD [ "node", "server.js" ]
