FROM node:6.12.0-alpine

RUN mkdir -p /usr/wikia/parsoid

RUN adduser -SH -g '' -h /nonexistent parsoid
RUN chown -R parsoid /usr/wikia/parsoid

RUN apk add --no-cache git python make g++

# cache dependencies in a separate layer from the main app
COPY package.json /usr/wikia/parsoid
WORKDIR /usr/wikia/parsoid
RUN npm install --production

COPY . /usr/wikia/parsoid

USER parsoid

CMD ["node", "api/server.js"]
