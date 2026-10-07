#!/bin/sh
# Export the compiled CKPool version, then replace this shell with the pool process.
# CKPool embeds PACKAGE "/" VERSION in its Stratum implementation.
set -u
binary=${CKPOOL_BINARY:-/app/bin/ckpool}
output=${CKPOOL_VERSION_FILE:-/www/pool/version.json}
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
# Metadata failure must not prevent mining or change CKPool's arguments/signals.
exec "$binary" "$@"
