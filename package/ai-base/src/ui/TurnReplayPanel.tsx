import { useEffect, useState } from 'react';
import {
  getToolMetrics,
  subscribeToolMetrics,
  type ToolMetric,
} from '../observability/toolMetrics';
import {
  listRecentTurnTraces,
  subscribeTurnTraces,
  type TurnTraceRecord,
} from '../observability/turnTrace';

function formatTermination(turn: TurnTraceRecord): string {
  const t = turn.lastTermination;
  if (!t) return turn.endedAt ? 'ended' : 'running';
  return t.reason ? `${t.action}（${t.reason}）` : t.action;
}

/**
 * 设置面板内嵌的 Turn 回放 / Tool 指标摘要（MS6）。
 */
export default function TurnReplayPanel() {
  const [turns, setTurns] = useState<TurnTraceRecord[]>(() => listRecentTurnTraces(8));
  const [metrics, setMetrics] = useState<ToolMetric[]>(() => getToolMetrics().slice(0, 8));
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const syncTurns = () => setTurns(listRecentTurnTraces(8));
    const syncMetrics = () => setMetrics(getToolMetrics().slice(0, 8));
    syncTurns();
    syncMetrics();
    const u1 = subscribeTurnTraces(syncTurns);
    const u2 = subscribeToolMetrics(syncMetrics);
    return () => {
      u1();
      u2();
    };
  }, []);

  return (
    <div className="aibase-turn-replay">
      <div className="aibase-chat-settings-info">
        <span className="aibase-chat-settings-label">Turn 回放</span>
        <span className="aibase-chat-settings-desc">
          最近回合的工具、终止原因（内存保留，刷新后清空）。
        </span>
      </div>
      {!turns.length ? (
        <p className="aibase-turn-replay-empty">尚无回合记录</p>
      ) : (
        <ul className="aibase-turn-replay-list">
          {turns.map((turn) => {
            const open = expandedId === turn.turnId;
            const tools = turn.events.filter((e) => e.kind === 'tool');
            return (
              <li key={turn.turnId} className="aibase-turn-replay-item">
                <button
                  type="button"
                  className="aibase-turn-replay-summary"
                  onClick={() => setExpandedId(open ? null : turn.turnId)}
                >
                  <span className="aibase-turn-replay-id">{turn.turnId}</span>
                  <span className="aibase-turn-replay-meta">
                    {tools.length} tools · {formatTermination(turn)}
                  </span>
                </button>
                {open ? (
                  <div className="aibase-turn-replay-detail">
                    {turn.parentTurnId ? (
                      <div className="aibase-turn-replay-line">parent: {turn.parentTurnId}</div>
                    ) : null}
                    {turn.events
                      .filter((e) => e.kind === 'tool' || e.kind === 'termination' || e.kind === 'subagent')
                      .map((e, idx) => (
                        <div key={`${turn.turnId}-${idx}`} className="aibase-turn-replay-line">
                          {e.kind === 'tool' && e.tool
                            ? `${e.tool.ok ? '✓' : '✗'} ${e.tool.name}` +
                              (e.tool.durationMs != null ? ` ${e.tool.durationMs}ms` : '') +
                              (e.tool.errorMessage ? ` — ${e.tool.errorMessage}` : '')
                            : e.kind === 'termination'
                              ? `stop: ${e.action}${e.reason ? ` (${e.reason})` : ''}`
                              : `subagent: ${JSON.stringify(e.meta || {})}`}
                        </div>
                      ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {metrics.length > 0 ? (
        <>
          <div className="aibase-chat-settings-info" style={{ marginTop: 12 }}>
            <span className="aibase-chat-settings-label">Tool 指标</span>
            <span className="aibase-chat-settings-desc">成功率 / p95 耗时（本会话）</span>
          </div>
          <ul className="aibase-turn-replay-metrics">
            {metrics.map((m) => (
              <li key={m.name}>
                <code>{m.name}</code> · {m.calls}次 · {(m.successRate * 100).toFixed(0)}% · p95{' '}
                {m.p95Ms}ms
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
