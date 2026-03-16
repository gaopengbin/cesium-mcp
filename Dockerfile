FROM node:22-alpine

RUN npm install -g cesium-mcp-runtime@1.139.6

ENTRYPOINT ["cesium-mcp-runtime"]
