FROM node:22-alpine

ARG VERSION=latest
RUN npm install -g cesium-mcp-runtime@${VERSION}

ENTRYPOINT ["cesium-mcp-runtime"]
