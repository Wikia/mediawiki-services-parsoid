FROM node:6.12.0

RUN mkdir -p /usr/wikia/parsoid

RUN useradd --no-create-home --home-dir /nonexistent --shell /bin/false parsoid
RUN chown -R parsoid /usr/wikia/parsoid

# cache dependencies in a separate layer from the main app
COPY package.json /usr/wikia/parsoid
WORKDIR /usr/wikia/parsoid
RUN npm install --production

COPY . /usr/wikia/parsoid

USER parsoid

CMD ["node", "api/server.js"]
