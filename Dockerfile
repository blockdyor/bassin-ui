FROM alpine:3.22

RUN apk add --no-cache python3 && mkdir -p /ui /opt/bassin

COPY web/ /ui/

COPY scripts/pool-location.py /opt/bassin/pool-location.py
COPY scripts/bassin-server.py /opt/bassin/bassin-server.py

USER 1000:1000

EXPOSE 8080

ENTRYPOINT ["python3", "/opt/bassin/bassin-server.py"]
