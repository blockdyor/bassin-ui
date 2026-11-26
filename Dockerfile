FROM alpine:3.22 AS geoip

ARG GEOIP_DB_URL="https://raw.githubusercontent.com/wp-statistics/DbIP-City-lite/91f10c9d0e7e521d4adb36f24f3142c6ded64e5c/dbip-city-lite.mmdb.gz"
ARG GEOIP_DB_SHA256="b69c625515f636ac92112b71df26bb92a5748f648c79bad124ecd9ba1c97bf4a"

RUN apk add --no-cache curl \
    && curl --proto '=https' --tlsv1.2 -fsSL "${GEOIP_DB_URL}" -o /geoip.mmdb.gz \
    && echo "${GEOIP_DB_SHA256}  /geoip.mmdb.gz" | sha256sum -c - \
    && gunzip -c /geoip.mmdb.gz > /geoip.mmdb \
    && rm -f /geoip.mmdb.gz \
    && chmod 644 /geoip.mmdb

FROM alpine:3.22

RUN apk add --no-cache python3 py3-maxminddb && mkdir -p /ui /opt/bassin

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONOPTIMIZE=1 \
    BASSIN_GEOIP_DB=/opt/bassin/geoip.mmdb

COPY web/ /ui/
COPY --from=geoip /geoip.mmdb /opt/bassin/geoip.mmdb

COPY scripts/pool-location.py /opt/bassin/pool-location.py
COPY scripts/bassin-server.py /opt/bassin/bassin-server.py

RUN python3 -c "import importlib.util; s = importlib.util.spec_from_file_location('pl', '/opt/bassin/pool-location.py'); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); r4 = m.lookup('8.8.8.8'); r6 = m.lookup('2606:4700:4700::1111'); assert r4 and r6 and -90 <= r4['latitude'] <= 90 and -180 <= r4['longitude'] <= 180 and m.lookup('127.0.0.1') is None, (r4, r6)"

USER 1000:1000

EXPOSE 8080

ENTRYPOINT ["python3", "-O", "-B", "/opt/bassin/bassin-server.py"]
