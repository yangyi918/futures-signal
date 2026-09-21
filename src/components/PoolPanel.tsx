import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";

const fmt = (n: number, d = 1) =>
  n.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });

// 品种池区：监控自选合约，每15分钟自动扫描信号
export default function PoolPanel({ clientId, hasPosition }: { clientId: string; hasPosition: boolean }) {
  const utils = trpc.useUtils();
  const [newSymbol, setNewSymbol] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const listQ = trpc.paper.getWatchlist.useQuery({ clientId }, { staleTime: Infinity });
  const symbols = useMemo(() => listQ.data ?? [], [listQ.data]);

  const scanQ = trpc.paper.scan.useQuery(
    { clientId, symbols },
    { enabled: symbols.length > 0, refetchInterval: 15 * 60_000, placeholderData: (p) => p },
  );

  const openMut = trpc.paper.open.useMutation({
    onSuccess: (r) => {
      setMsg({ text: `开仓成功 @ ${fmt(r.price)}，占用保证金 ¥${fmt(r.margin, 0)}`, ok: true });
      utils.paper.getAccount.invalidate({ clientId });
      utils.paper.records.invalidate({ clientId });
    },
    onError: (e) => setMsg({ text: e.message.replace(/^\[.*?\]\s*/, ""), ok: false }),
  });

  const addMut = trpc.paper.addSymbol.useMutation({
    onSuccess: () => { setNewSymbol(""); listQ.refetch(); },
    onError: (e) => setMsg({ text: e.message.replace(/^\[.*?\]\s*/, ""), ok: false }),
  });
  const delMut = trpc.paper.removeSymbol.useMutation({ onSuccess: () => listQ.refetch() });

  return (
    <section className="border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-2.5">
        <span className="mono text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
          品种池扫描 WATCHLIST · 每15分钟自动刷新
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            placeholder="如 RB0 / CU2505"
            className="mono w-32 border border-[var(--line)] bg-[var(--panel2)] px-2 py-1 text-xs uppercase outline-none focus:border-[var(--cyan)]"
          />
          <button
            onClick={() => newSymbol.trim() && addMut.mutate({ clientId, symbol: newSymbol.trim() })}
            className="mono border border-[var(--cyan)] px-2 py-1 text-xs text-[var(--cyan)] hover:bg-[rgba(34,211,238,0.1)]"
          >+ 添加</button>
          <button
            onClick={() => scanQ.refetch()}
            className="mono border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)] hover:border-[var(--cyan)] hover:text-[var(--cyan)]"
          >{scanQ.isFetching ? "扫描中…" : "立即扫描"}</button>
        </div>
      </div>

      {msg && (
        <div className={`border-b px-4 py-2 text-xs ${msg.ok ? "border-[var(--line)] text-[var(--cyan)]" : "border-[var(--warn)] bg-[rgba(251,191,36,0.08)] text-[var(--warn)]"}`}>
          {msg.text}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="mono w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">
              <th className="px-3 py-2">合约</th><th className="px-2 py-2">品种</th>
              <th className="px-2 py-2 text-right">最新价</th><th className="px-2 py-2 text-right">涨跌%</th>
              <th className="px-2 py-2 text-right">MA200</th><th className="px-2 py-2">趋势</th>
              <th className="px-2 py-2">K线</th><th className="px-2 py-2">开多</th><th className="px-2 py-2">开空</th>
              <th className="px-2 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {(scanQ.data ?? []).map((s) => (
              <tr key={s.symbol} className="hover:bg-[rgba(255,255,255,0.02)]">
                <td className="px-3 py-2 font-semibold text-[var(--text)]">{s.symbol}</td>
                <td className="px-2 py-2 text-[var(--muted)]">{s.name}</td>
                {s.error ? (
                  <td colSpan={7} className="px-2 py-2 text-[var(--warn)]">{s.error}</td>
                ) : (
                  <>
                    <td className={`px-2 py-2 text-right ${s.changePct >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"}`}>{fmt(s.lastPrice)}</td>
                    <td className={`px-2 py-2 text-right ${s.changePct >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
                      {s.changePct >= 0 ? "+" : ""}{fmt(s.changePct, 2)}</td>
                    <td className="px-2 py-2 text-right text-[var(--warn)]">{fmt(s.ma200)}</td>
                    <td className={`px-2 py-2 ${s.trend === "up" ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
                      {s.trend === "up" ? "↑ 上方" : "↓ 下方"}</td>
                    <td className={`px-2 py-2 ${s.lastBullish ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
                      {s.lastBullish ? "阳" : "阴"}</td>
                    <td className="px-2 py-2">
                      {s.longAllowed
                        ? <span className="text-[var(--up)]">允许</span>
                        : <span className="text-[var(--muted)]">禁止</span>}</td>
                    <td className="px-2 py-2">
                      {s.shortAllowed
                        ? <span className="text-[var(--down)]">允许</span>
                        : <span className="text-[var(--muted)]">禁止</span>}</td>
                  </>
                )}
                <td className="px-2 py-2 text-right">
                  <div className="inline-flex gap-1">
                    {!hasPosition && !s.error && (
                      <>
                        <button
                          disabled={!s.longAllowed || openMut.isPending}
                          onClick={() => openMut.mutate({ clientId, symbol: s.symbol, direction: "long" })}
                          className="border px-1.5 py-0.5 disabled:cursor-not-allowed disabled:opacity-30 border-[var(--up)] text-[var(--up)] hover:bg-[rgba(251,44,54,0.12)]"
                        >开多</button>
                        <button
                          disabled={!s.shortAllowed || openMut.isPending}
                          onClick={() => openMut.mutate({ clientId, symbol: s.symbol, direction: "short" })}
                          className="border px-1.5 py-0.5 disabled:cursor-not-allowed disabled:opacity-30 border-[var(--down)] text-[var(--down)] hover:bg-[rgba(0,187,127,0.12)]"
                        >开空</button>
                      </>
                    )}
                    <button
                      onClick={() => delMut.mutate({ clientId, symbol: s.symbol })}
                      className="border border-[var(--line)] px-1.5 py-0.5 text-[var(--muted)] hover:border-[var(--warn)] hover:text-[var(--warn)]"
                    >删</button>
                  </div>
                </td>
              </tr>
            ))}
            {scanQ.data?.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-[var(--muted)]">品种池为空，请在上方添加合约</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mono border-t border-[var(--line)] px-4 py-2 text-[10px] text-[var(--muted)]">
        行情时间 {scanQ.data?.find((s) => s.updatedAt)?.updatedAt ?? "—"} · 合约代码用主连代码（RB0）或具体合约（RB2605）
      </div>
    </section>
  );
}
