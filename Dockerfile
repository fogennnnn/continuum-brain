FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
EXPOSE 8082
CMD ["npm", "run", "demo"]
