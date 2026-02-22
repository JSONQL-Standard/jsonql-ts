FROM node:18-alpine

WORKDIR /app

# Copy root package files and install dependencies to build the library
COPY package.json tsconfig.json ./
RUN npm install

# Copy source code and build the library
COPY src ./src
RUN npm run build:lib

# Setup compliance app
WORKDIR /app/compliance
COPY compliance/package.json ./
RUN npm install

# Copy compliance source code
COPY compliance ./

EXPOSE 8080

CMD ["npm", "start"]
