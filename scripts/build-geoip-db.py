#!/usr/bin/env python3
"""Compile a MaxMind/DB-IP City MMDB into a compact BGEO v2 lat/lon binary lookup table."""
import math
from pathlib import Path
import struct

MAGIC = b'BGEO'
VERSION = 2
HEADER_STRUCT = struct.Struct('>4sIIII')
COORD_STRUCT = struct.Struct('>hh')
V4_STRUCT = struct.Struct('>IH')
V6_STRUCT = struct.Struct('>QH')
MAX_V4 = 0xFFFFFFFF
MAX_V6_HI = 0xFFFFFFFFFFFFFFFF
MAX_PALETTE = 0xFFFF
DEFAULT_INPUT = Path('/geoip-build/geoip.mmdb')
DEFAULT_OUTPUT = Path('/geoip-build/geoip.bin')


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
    lat_e1 = max(-900, min(900, round(lat * 10)))
    lon_e1 = max(-1800, min(1800, round(lon * 10)))
    return lat_e1, lon_e1


def _build_palette(v4_ranges, v6_ranges):
    coords = set()
    for _, _, lat_e1, lon_e1 in v4_ranges:
        coords.add((lat_e1, lon_e1))
    for _, _, lat_e1, lon_e1 in v6_ranges:
        coords.add((lat_e1, lon_e1))
    coarsen = len(coords) > MAX_PALETTE
    if coarsen:
        coords = {(round(lat / 2) * 2, round(lon / 2) * 2) for lat, lon in coords}
    palette = sorted(coords)
    index = {coord: idx + 1 for idx, coord in enumerate(palette)}
    return palette, index, coarsen


def _map_ranges(ranges, index, coarsen):
    if coarsen:
        return [(s, e, index[(round(lat / 2) * 2, round(lon / 2) * 2)]) for s, e, lat, lon in ranges]
    return [(s, e, index[(lat, lon)]) for s, e, lat, lon in ranges]


def coalesce_ranges(ranges):
    if not ranges:
        return []
    ranges.sort(key=lambda item: (item[0], item[1]))
    merged = []
    cur_start, cur_end, cur_id = ranges[0]
    for start, end, coord_id in ranges[1:]:
        if start <= cur_end:
            if end <= cur_end:
                continue
            start = cur_end + 1
        if start == cur_end + 1 and coord_id == cur_id:
            cur_end = end
        else:
            merged.append((cur_start, cur_end, cur_id))
            cur_start, cur_end, cur_id = start, end, coord_id
    merged.append((cur_start, cur_end, cur_id))
    return merged


def encode_start_only(ranges, max_addr):
    merged = coalesce_ranges(ranges)
    entries = []
    prev_end = -1
    for start, end, coord_id in merged:
        if prev_end >= 0 and start > prev_end + 1:
            entries.append((prev_end + 1, 0))
        entries.append((start, coord_id))
        prev_end = end
    if prev_end >= 0 and prev_end < max_addr:
        entries.append((prev_end + 1, 0))
    return entries


def write_bgeo(output_path, v4_ranges, v6_ranges):
    palette, index, coarsen = _build_palette(v4_ranges, v6_ranges)
    v4 = encode_start_only(_map_ranges(v4_ranges, index, coarsen), MAX_V4)
    v6 = encode_start_only(_map_ranges(v6_ranges, index, coarsen), MAX_V6_HI)
    with Path(output_path).open('wb') as out:
        out.write(HEADER_STRUCT.pack(MAGIC, VERSION, len(palette), len(v4), len(v6)))
        for lat_e1, lon_e1 in palette:
            out.write(COORD_STRUCT.pack(lat_e1, lon_e1))
        for start, coord_id in v4:
            out.write(V4_STRUCT.pack(start, coord_id))
        for start_hi, coord_id in v6:
            out.write(V6_STRUCT.pack(start_hi, coord_id))
    return len(palette), len(v4), len(v6)


def compile_mmdb(input_path, output_path):
    import maxminddb

    v4_ranges = []
    v6_ranges = []
    with maxminddb.open_database(str(input_path)) as reader:
        for network, record in reader:
            coords = extract_quantized_coords(record)
            if coords is None:
                continue
            lat_e1, lon_e1 = coords
            start = int(network.network_address)
            prefixlen = network.prefixlen
            if network.version == 4:
                v4_ranges.append((start, start + (1 << (32 - prefixlen)) - 1, lat_e1, lon_e1))
            elif 0xFFFF00000000 <= start <= 0xFFFFFFFFFFFF and prefixlen >= 96:
                v4_start = start & 0xFFFFFFFF
                v4_ranges.append((v4_start, v4_start + (1 << (128 - prefixlen)) - 1, lat_e1, lon_e1))
            else:
                hi_start = start >> 64
                hi_end = hi_start + (1 << (64 - prefixlen)) - 1 if prefixlen <= 64 else hi_start
                v6_ranges.append((hi_start, hi_end, lat_e1, lon_e1))
    return write_bgeo(output_path, v4_ranges, v6_ranges)


def main():
    palette_cnt, v4_count, v6_count = compile_mmdb(DEFAULT_INPUT, DEFAULT_OUTPUT)
    size_mb = DEFAULT_OUTPUT.stat().st_size / (1024 * 1024)
    print(f'Compiled BGEO v2: {palette_cnt} coords, {v4_count} IPv4 + {v6_count} IPv6 entries ({size_mb:.2f} MiB)')


if __name__ == '__main__':
    main()
