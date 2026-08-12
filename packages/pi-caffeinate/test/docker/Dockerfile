FROM node:26-bookworm-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends dbus \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /smoke
COPY test/docker/package.json test/docker/package-lock.json ./
RUN npm ci --ignore-scripts

COPY . ./pi-caffeinate
RUN ./node_modules/.bin/tsc -p /smoke/pi-caffeinate/test/docker/tsconfig.json

ENTRYPOINT ["dbus-run-session", "--", "node", "/smoke/pi-caffeinate/test/docker/run-smoke.mjs"]
