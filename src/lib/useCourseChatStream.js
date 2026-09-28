import { useEffect } from 'react';

function apiBase() {
  const env = (import.meta.env.VITE_BACKEND_URL || '').trim().replace(/\/$/, '');
  if (env) return env;
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3001';
    }
    return window.location.origin;
  }
  return '';
}

export function useCourseChatStream(path, enabled, onItems) {
  useEffect(() => {
    if (!enabled || !path) return undefined;
    const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('unipilot_token') : '';
    if (!token) return undefined;
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      const res = await fetch(`${apiBase()}/api${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
          'x-no-compression': '1',
        },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop() || '';
        for (const chunk of chunks) {
          const line = chunk.split('\n').find((row) => row.startsWith('data: '));
          if (!line) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (Array.isArray(data.items)) onItems?.(data.items);
          } catch {
            /* ignore a partial frame */
          }
        }
      }
    })().catch(() => {
      /* abort or network drop — caller keeps the last snapshot */
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [path, enabled]);
}
