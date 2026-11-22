FROM alpine:3.22

RUN apk add --no-cache python3 && mkdir -p /ui /opt/bassin

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONOPTIMIZE=1

COPY web/ /ui/

COPY scripts/pool-location.py /opt/bassin/pool-location.py
COPY scripts/bassin-server.py /opt/bassin/bassin-server.py

USER 1000:1000

EXPOSE 8080

ENTRYPOINT ["python3", "-O", "-B", "/opt/bassin/bassin-server.py"]
