FROM node:20

RUN apt-get update && apt-get install -y --no-install-recommends \
    iputils-ping \
    libaio1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "src/index.js"]