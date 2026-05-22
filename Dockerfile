# Use Node.js 24 alpine as base image for building
FROM node:24-alpine AS builder

WORKDIR /app

# Enable Corepack to support Yarn v4
RUN corepack enable

# Copy root configuration and dependency definitions
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

# Copy package.json files for all workspace modules to enable layer caching
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY extension/package.json ./extension/
COPY userscript/package.json ./userscript/
COPY shared/package.json ./shared/

# Install dependencies using Yarn v4
RUN yarn install --immutable

# Copy the rest of the application source code
COPY . .

# Build the frontend and other workspaces
RUN yarn run build

# Start a fresh, lightweight production runtime stage
FROM node:24-alpine

WORKDIR /app

# Enable Corepack in the runtime stage
RUN corepack enable

# Copy built code and dependencies from builder stage
COPY --from=builder /app /app

# Expose the frontend preview port (5174) and backend API port (8070)
EXPOSE 5174
EXPOSE 8070

# Default to production environment
ENV NODE_ENV=production

# Start both the frontend and backend servers in parallel via the root-level start script
CMD ["yarn", "run", "start"]
