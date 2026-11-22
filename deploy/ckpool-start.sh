#!/bin/sh
# Export the compiled CKPool version, then supervise CKPool and reload cleanly on config changes.
# CKPool embeds PACKAGE "/" VERSION in its Stratum implementation.
set -u
binary=${CKPOOL_BINARY:-/app/bin/ckpool}
output=${CKPOOL_VERSION_FILE:-/www/pool/version.json}
poll_seconds=${CKPOOL_RELOAD_INTERVAL:-2}
version=$(LC_ALL=C grep -aoE 'ckpool/[0-9]+(\.[0-9]+){1,3}([+-][0-9A-Za-z.-]+)?' "$binary" 2>/dev/null | head -n 1)
version=${version#ckpool/}

# Publish null if the binary no longer provides this identifier; never retain an old version.
metadata=null
if [ -n "$version" ] && [ "${#version}" -le 64 ]; then
    metadata=$(printf '{"software":"ckpool","version":"%s"}' "$version")
fi
if mkdir -p "$(dirname "$output")" && temporary=$(mktemp "${output}.XXXXXX"); then
    if printf '%s\n' "$metadata" > "$temporary" && chmod 644 "$temporary"; then
        mv -f "$temporary" "$output" || rm -f "$temporary"
    else
        rm -f "$temporary"
    fi
fi

# Find -c/--config path. If no config file is present (e.g. --help or stub tests), exec directly.
config_file=""
prev=""
for arg in "$@"; do
    if [ "$prev" = "-c" ] || [ "$prev" = "--config" ]; then
        config_file=$arg
        break
    fi
    prev=$arg
done

if [ -z "$config_file" ] || [ ! -f "$config_file" ]; then
    exec "$binary" "$@"
fi

config_hash() {
    sha256sum "$config_file" 2>/dev/null | cut -d' ' -f1
}

stop_requested=0
child_pid=""
sleep_pid=""
on_stop() {
    stop_requested=1
    if [ -n "$sleep_pid" ]; then
        kill -TERM "$sleep_pid" 2>/dev/null || true
    fi
    if [ -n "$child_pid" ]; then
        kill -TERM "$child_pid" 2>/dev/null || true
    fi
}
trap on_stop TERM INT

while true; do
    current_hash=$(config_hash)
    "$binary" "$@" &
    child_pid=$!
    reload=0
    while kill -0 "$child_pid" 2>/dev/null; do
        sleep "$poll_seconds" &
        sleep_pid=$!
        wait "$sleep_pid" 2>/dev/null || true
        sleep_pid=""
        if [ "$stop_requested" -eq 1 ]; then
            break
        fi
        next_hash=$(config_hash)
        if [ -n "$next_hash" ] && [ "$next_hash" != "$current_hash" ]; then
            reload=1
            kill -TERM "$child_pid" 2>/dev/null || true
            break
        fi
    done
    wait "$child_pid" 2>/dev/null
    status=$?
    if [ "$stop_requested" -eq 1 ]; then
        wait "$child_pid" 2>/dev/null || true
        exit 0
    fi
    child_pid=""
    if [ "$reload" -eq 1 ]; then
        continue
    fi
    exit "$status"
done
