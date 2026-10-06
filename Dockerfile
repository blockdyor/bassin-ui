FROM alpine:3.22

RUN apk add --no-cache python3 && mkdir -p /ui /opt/bassin

COPY web/ /ui/

COPY scripts/pool-location.py /opt/bassin/pool-location.py
