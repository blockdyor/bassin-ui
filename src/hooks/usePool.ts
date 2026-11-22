import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPool, fetchUsers } from '../helpers/fetch';
import { Pool } from '../interfaces/pool';
import { User } from '../interfaces/users';
import { parseHashrate } from '../helpers/convert';
import { CHART_HISTORY_LENGTH, POLL_INTERVAL_SECONDS } from '../helpers/constants';
export interface Sample { time: number; value: number }
export function usePool() {
  const [pool, setPool] = useState<Pool | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [chart, setChart] = useState<Sample[]>([]);
  const [error, setError] = useState(false);
  const [usersError, setUsersError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [updated, setUpdated] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const refresh = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    const id = ++generation.current;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      const [poolResult, userResult] = await Promise.allSettled([fetchPool(controller.signal), fetchUsers(controller.signal)]);
      if (id !== generation.current || controller.signal.aborted) return;
      setError(poolResult.status === 'rejected');
      setUsersError(userResult.status === 'rejected');
      if (poolResult.status === 'fulfilled') {
        const next = poolResult.value;
        setPool(next);
        setUpdated(Date.now());
        setChart(previous => {
          if (previous[previous.length - 1]?.time === next.lastupdate) return previous;
          const value = parseHashrate(next.hashrate5m);
          if (!Number.isFinite(value)) return previous;
          const history = previous.length && next.lastupdate < previous[previous.length - 1].time ? [] : previous;
          return [...history, { time: next.lastupdate, value }].slice(-CHART_HISTORY_LENGTH);
        });
      }
      if (userResult.status === 'fulfilled') setUsers(userResult.value);
      setLoading(false);
      timer = setTimeout(poll, POLL_INTERVAL_SECONDS * 1000);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [attempt]);
  useEffect(() => {
    if (!pool) {
      setStale(false);
      return;
    }
    const remaining = (pool.lastupdate + POLL_INTERVAL_SECONDS * 3) * 1000 - Date.now();
    if (remaining <= 0) {
      setStale(true);
      return;
    }
    setStale(false);
    const timer = setTimeout(() => setStale(true), remaining);
    return () => clearTimeout(timer);
  }, [pool]);
  return useMemo(
    () => ({ pool, users, chart, error, usersError, loading, updated, refresh, stale }),
    [pool, users, chart, error, usersError, loading, updated, refresh, stale],
  );
}
