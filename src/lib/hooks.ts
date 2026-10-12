import { useCallback, useEffect, useRef, useState } from "react";
import { messageOf } from "./api";
export function useResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  key: string,
  interval = 0,
) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [updated, setUpdated] = useState<Date | null>(null);
  const latest = useRef(loader);
  latest.current = loader;
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((v) => v + 1), []);
  const lastKey = useRef(key);
  useEffect(() => {
    let active = true,
      busy = false;
    const controller = new AbortController();
    if (lastKey.current !== key) {
      setData(null);
      setError("");
      setUpdated(null);
      lastKey.current = key;
    }
    async function load() {
      if (busy || !active) return;
      busy = true;
      setLoading(true);
      try {
        const result = await latest.current(controller.signal);
        if (active) {
          setData(result);
          setError("");
          setUpdated(new Date());
        }
      } catch (err) {
        if (active && !controller.signal.aborted) setError(messageOf(err));
      } finally {
        busy = false;
        if (active) setLoading(false);
      }
    }
    load();
    const timer = interval
      ? setInterval(() => {
          if (!document.hidden) load();
        }, interval)
      : undefined;
    const visibility = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [key, tick, interval]);
  return { data, error, loading, updated, refresh, setData };
}
export function useDebounce<T>(value: T, delay = 300) {
  const [result, setResult] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setResult(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return result;
}
export function useVisible() {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const cb = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", cb);
    return () => document.removeEventListener("visibilitychange", cb);
  }, []);
  return visible;
}
