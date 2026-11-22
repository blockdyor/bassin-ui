export interface PoolSv2Stats {
    clients: number;
    channels: number;
    jdclients: number;
}

export interface PoolSv2JdStats {
    allocate_ok: number;
    allocate_rate_limited: number;
    declare_ok: number;
    declare_error: number;
    declare_rate_limited: number;
    checkblock_busy: number;
    checkblock_fail: number;
    checkblock_inflight: number;
    coalesce_hit: number;
    provide_missing: number;
    push_solution: number;
    tokens: number;
    tx_cache: number;
    tx_cache_bytes: number;
    token_snapshot_bytes: number;
    pending_declares: number;
}

export interface Pool {
    hashrate1m: string;
    hashrate5m: string;
    hashrate1hr: string;
    hashrate1d: string;
    hashrate7d: string;
    lastshare: number;
    shares: number;
    bestshare: number;
    bestever: number;
    runtime: number;
    lastupdate: number;
    accepted: number;
    rejected: number;
    SPS1m: number;
    Users: number;
    Workers: number;
    sv2?: PoolSv2Stats;
    sv2jd?: PoolSv2JdStats;
}
