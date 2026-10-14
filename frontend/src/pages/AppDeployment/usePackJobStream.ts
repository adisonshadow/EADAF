import { resolveStreamApiUrl } from '@/constants/env';
import type {
  PackJob,
  PackLogLine,
  PackStreamEvent,
} from '@/services/UAC/api/appDeployment';
import { useCallback, useEffect, useRef, useState } from 'react';

/** 前端保留的最大日志行数（与服务端上限一致，超出丢头部） */
const MAX_LINES = 5000;
const JOB_BASE = '/api/v1/admin/app-deployment/jobs';

export interface PackJobStream {
  job: PackJob | null;
  lines: PackLogLine[];
  /** 正在建立 / 保持 SSE 连接 */
  streaming: boolean;
  streamError: string | null;
  setJob: React.Dispatch<React.SetStateAction<PackJob | null>>;
  /** 订阅某个任务的实时日志（先补发已有日志，再持续推送）；可顺带切换当前任务 */
  connect: (jobId: string, nextJob?: PackJob | null) => Promise<void>;
  disconnect: () => void;
  /** 清空当前任务与日志（开始新任务前调用） */
  reset: () => void;
}

/**
 * 打包任务日志流：用 fetch + ReadableStream 消费 SSE。
 *
 * 为什么不用 EventSource：后端认证只认 Authorization 头，EventSource 无法带自定义头。
 * 事件负载统一为 `data: {"type":"snapshot"|"log"|"job"|"end", ...}`；
 * snapshot 里带 nextSeq，据此 O(1) 去重（重连 / 补发时不重复显示同一行）。
 */
export function usePackJobStream(): PackJobStream {
  const [job, setJob] = useState<PackJob | null>(null);
  const [lines, setLines] = useState<PackLogLine[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const nextSeqRef = useRef(0);

  const disconnect = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStreaming(false);
  }, []);

  const reset = useCallback(() => {
    disconnect();
    setJob(null);
    setLines([]);
    setStreamError(null);
    nextSeqRef.current = 0;
  }, [disconnect]);

  const appendLine = useCallback((line: PackLogLine) => {
    if (line.seq < nextSeqRef.current) return; // snapshot 里已经有了
    nextSeqRef.current = line.seq + 1;
    setLines((prev) => {
      const next = [...prev, line];
      return next.length > MAX_LINES
        ? next.slice(next.length - MAX_LINES)
        : next;
    });
  }, []);

  const connect = useCallback(
    async (jobId: string, nextJob?: PackJob | null) => {
      disconnect();
      setStreamError(null);
      nextSeqRef.current = 0;
      setLines([]);
      // 立刻切到新任务，避免连接期间控制台还显示上一次的任务
      if (nextJob !== undefined) setJob(nextJob);

      const controller = new AbortController();
      controllerRef.current = controller;
      setStreaming(true);

      const token = localStorage.getItem('token');
      let response: Response;
      try {
        response = await fetch(
          resolveStreamApiUrl(`${JOB_BASE}/${jobId}/stream?fromSeq=0`),
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
          },
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setStreamError((error as Error)?.message || '日志连接失败');
          setStreaming(false);
        }
        return;
      }

      if (!response.ok || !response.body) {
        let detail = `HTTP ${response.status}`;
        try {
          const text = await response.text();
          const parsed = JSON.parse(text);
          detail = parsed?.message || detail;
        } catch {
          /* 保留状态码 */
        }
        setStreamError(`日志连接失败：${detail}`);
        setStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let gotEvent = false;

      // 兜底：连上了但一直没有任何事件（例如后端流式写入被中间层吞掉），别让界面静默空着
      const idleTimer = setTimeout(() => {
        if (!gotEvent) {
          setStreamError(
            '日志流 10 秒内没有收到任何数据：请确认后端已用最新代码重启（nodemon 未重载时重跑 pnpm dev），或查看后端日志。',
          );
        }
      }, 10000);

      const handleEvent = (payload: PackStreamEvent) => {
        if (!payload || typeof payload !== 'object') return;
        gotEvent = true;
        clearTimeout(idleTimer);
        if (payload.type === 'snapshot') {
          nextSeqRef.current = payload.job?.nextSeq ?? 0;
          setLines(payload.lines || []);
          setJob(payload.job || null);
          return;
        }
        if (payload.type === 'log') {
          appendLine(payload.line);
          return;
        }
        if (payload.type === 'job' || payload.type === 'end') {
          setJob(payload.job);
          if (payload.type === 'end') {
            controller.abort();
            setStreaming(false);
          }
        }
      };

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n');
          buffer = parts.pop() || '';
          for (const raw of parts) {
            const line = raw.trim();
            if (!line || line.startsWith(':') || !line.startsWith('data:'))
              continue;
            try {
              handleEvent(JSON.parse(line.slice(5).trim()));
            } catch {
              /* 单行解析失败不影响整条流 */
            }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setStreamError((error as Error)?.message || '日志流中断');
        }
      } finally {
        clearTimeout(idleTimer);
        if (!controller.signal.aborted) setStreaming(false);
      }
    },
    [appendLine, disconnect],
  );

  useEffect(() => () => controllerRef.current?.abort(), []);

  return {
    job,
    lines,
    streaming,
    streamError,
    setJob,
    connect,
    disconnect,
    reset,
  };
}
