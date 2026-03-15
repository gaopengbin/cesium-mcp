FROM node:22-alpine

RUN npm install -g cesium-mcp-runtime@1.139.4

ENTRYPOINT ["cesium-mcp-runtime"]
