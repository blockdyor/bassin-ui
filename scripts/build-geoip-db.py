#!/usr/bin/env python3
"""Compile a MaxMind/DB-IP City MMDB into a compact BGEO v1 lat/lon binary lookup table."""
import ipaddress
import math
from pathlib import Path
import struct

MAGIC = b'BGEO'
VERSION = 1
HEADER_STRUCT = struct.Struct('>4sIII')
V4_STRUCT = struct.Struct('>IIhh')
V6_STRUCT = struct.Struct('>16s16shh')
DEFAULT_INPUT = Path('/tmp/geoip.mmdb')
DEFAULT_OUTPUT = Path('/geoip.bin')


def extract_quantized_coords(record):
    if not isinstance(record, dict):
        return None
    location = record.get('location')
    if not isinstance(location, dict):
        return None
    lat, lon = location.get('latitude'), location.get('longitude')
    if any(type(v) not in (int, float) or not math.isfinite(v) for v in (lat, lon)):
        return None
    if abs(lat) > 90 or abs(lon) > 180:
        return None
    lat_e2 = max(-9000, min(9000, round(lat * 100)))
    lon_e2 = max(-18000, min(18000, round(lon * 100)))
    return lat_e2, lon_e2


def coalesce_ranges(ranges):
    if not ranges:
        return []
    ranges.sort(key=lambda item: (item[0], item[1]))
    merged = []
    cur_start, cur_end, cur_lat, cur_lon = ranges[0]
    for start, end, lat_e2, lon_e2 in ranges[1:]:
        if start <= cur_end:
            if end <= cur_end:
                continue
            start = cur_end + 1
        if start == cur_end + 1 and lat_e2 == cur_lat and lon_e2 == cur_lon:
            cur_end = end
        else:
            merged.append((cur_start, cur_end, cur_lat, cur_lon))
            cur_start, cur_end, cur_lat, cur_lon = start, end, lat_e2, lon_e2
    merged.append((cur_start, cur_end, cur_lat, cur_lon))
    return merged


def write_bgeo(output_path, v4_ranges, v6_ranges):
    v4 = coalesce_ranges(list(v4_ranges))
    v6 = coalesce_ranges(list(v6_ranges))
    with Path(output_path).open('wb') as out:
        out.write(HEADER_STRUCT.pack(MAGIC, VERSION, len(v4), len(v6)))
        for start, end, lat_e2, lon_e2 in v4:
            out.write(V4_STRUCT.pack(start, end, lat_e2, lon_e2))
        for start, end, lat_e2, lon_e2 in v6:
            out.write(V6_STRUCT.pack(start.to_bytes(16, 'big'), end.to_bytes(16, 'big'), lat_e2, lon_e2))
    return len(v4), len(v6)


def compile_mmdb(input_path, output_path):
    import maxminddb

    v4_ranges = []
    v6_ranges = []
    with maxminddb.open_database(str(input_path)) as reader:
        for network, record in reader:
            coords = extract_quantized_coords(record)
            if coords is None:
                continue
            lat_e2, lon_e2 = coords
            if network.version == 4:
                v4_ranges.append((int(network.network_address), int(network.broadcast_address), lat_e2, lon_e2))
                continue
            mapped = network.network_address.ipv4_mapped
            if mapped is not None and network.prefixlen >= 96:
                v4_net = ipaddress.IPv4Network((mapped, network.prefixlen - 96), strict=False)
                v4_ranges.append((int(v4_net.network_address), int(v4_net.broadcast_address), lat_e2, lon_e2))
            else:
                v6_ranges.append((int(network.network_address), int(network.broadcast_address), lat_e2, lon_e2))
    return write_bgeo(output_path, v4_ranges, v6_ranges)


def main():
    v4_count, v6_count = compile_mmdb(DEFAULT_INPUT, DEFAULT_OUTPUT)
    size_mb = DEFAULT_OUTPUT.stat().st_size / (1024 * 1024)
    print(f'Compiled BGEO v1: {v4_count} IPv4 + {v6_count} IPv6 ranges ({size_mb:.2f} MiB)')


if __name__ == '__main__':
    main()
