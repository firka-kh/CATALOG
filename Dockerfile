# Use the official Node.js 20 image (Debian based slim)
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy local code to the container image
COPY . .

# Build the project
RUN npm run build

# Set the environment variable for production
ENV NODE_ENV=production

# Expose the API and UI port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
