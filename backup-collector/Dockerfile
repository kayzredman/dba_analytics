FROM ghcr.io/oracle/oraclelinux8-instantclient:21 AS oracle-client

FROM node:20

RUN apt-get update && apt-get install -y --no-install-recommends \
    iputils-ping \
    libaio1 \
    && rm -rf /var/lib/apt/lists/*

# Copy Oracle Instant Client libraries from official Oracle image
COPY --from=oracle-client /usr/lib/oracle/21/client64/lib /opt/oracle/instantclient_21
RUN echo /opt/oracle/instantclient_21 > /etc/ld.so.conf.d/oracle-instantclient.conf && ldconfig

ENV LD_LIBRARY_PATH=/opt/oracle/instantclient_21:$LD_LIBRARY_PATH

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "src/index.js"]