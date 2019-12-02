FROM node:6.14.1-alpine

RUN mkdir -p /usr/wikia/parsoid

RUN apk add --no-cache git python make g++

# cache dependencies in a separate layer from the main app
COPY package.json /usr/wikia/parsoid
WORKDIR /usr/wikia/parsoid
RUN npm install --production

COPY . /usr/wikia/parsoid

RUN chown -R 65534:65534 /usr/wikia/parsoid

USER 65534

CMD ["node", "api/server.js"]
