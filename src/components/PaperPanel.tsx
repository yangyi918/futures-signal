import { useState } from "react";
import { trpc } from "@/providers/trpc";

const fmt = (n: number, d = 1) =>
  n.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });

// 模拟交易区：账户概览 + 当前持仓 + 平仓
export default function PaperPanel({ clientId }: { clientId: string }) {
  const utils = trpc.useUtils();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const accQ = trpc.paper.getAccount.useQuery({ clientId }, { refetchInterval: 60_000 });
  const acc = accQ.data;
  const pos = acc?.position ?? null;

  const closeMut = trpc.paper.close.useMutation({
    onSuccess: (r) => {
      setMsg({
        text: `平仓 @ ${fmt(r.closePrice)}，本笔盈亏 ${r.pnl >= 0 ? "+" : ""}¥${fmt(r.pnl, 0)}`,
        ok: true,
      });
      accQ.refetch();
      utils.paper.records.invalidate({ clientId });
    },
    onError: (e) => setMsg({ text: e.message.replace(/^\[.*?\]\s*/, ""), ok: false }),
  });

  const equity = acc ? acc.cash + (pos?.floatingPnl ?? 0) : 0;

  return (
    <section className="border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-2.5">
        <span className="mono text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
          模拟交易 PAPER TRADING · 本金 ¥100,000 · 每次1手 · 单品种持仓
        </span>
        <span className="mono ml-auto text-[10px] text-[var(--muted)]">
          {accQ.isFetching ? "更新中…" : "60s 自动刷新"}
        </span>
      </div>

      {msg && (
        <div className={`border-b px-4 py-2 text-xs ${msg.ok ? "border-[var(--line)] text-[var(--cyan)]" : "border-[var(--warn)] bg-[rgba(251,191,36,0.08)] text-[var(--warn)]"}`}>
          {msg.text}
        </div>
      )}

      {acc && (
        <div className="grid gap-px bg-[var(--line)] sm:grid-cols-[repeat(4,1fr)]">
          {[
            ["可用资金", `¥${fmt(acc.cash, 0)}`, "text-[var(--text)]"],
            ["账户权益", `¥${fmt(equity, 0)}`, equity >= acc.initialCapital ? "text-[var(--up)]" : "text-[var(--down)]"],
            ["浮动盈亏", `${pos ? (pos.floatingPnl >= 0 ? "+" : "") + "¥" + fmt(pos.floatingPnl, 0) : "—"}`,
              !pos ? "text-[var(--muted)]" : pos.floatingPnl >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"],
            ["保证金占用", pos ? `¥${fmt(pos.margin, 0)}` : "—", "text-[var(--text)]"],
          ].map(([k, v, c]) => (
            <div key={k} className="bg-[var(--panel)] px-4 py-3">
              <div className="mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">{k}</div>
              <div className={`mono mt-1 text-lg ${c}`}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* 当前持仓 */}
      <div className="border-t border-[var(--line)] px-4 py-3">
        {pos ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <span className="font-semibold">{pos.name} {pos.symbol}</span>
              <span className={`mono ml-2 border px-1.5 py-0.5 text-[11px] ${
                pos.direction === "long"
                  ? "border-[var(--up)] text-[var(--up)]"
                  : "border-[var(--down)] text-[var(--down)]"}`}>
                {pos.direction === "long" ? "多单" : "空单"} {pos.lots}手
              </span>
            </div>
            <span className="mono text-xs text-[var(--muted)]">
              开仓 <b className="text-[var(--text)]">{fmt(pos.openPrice)}</b>
            </span>
            <span className="mono text-xs text-[var(--muted)]">
              现价 <b className="text-[var(--cyan)]">{fmt(pos.lastPrice)}</b>
            </span>
            {pos.stopLoss != null && (
              <span className="mono text-xs text-[var(--muted)]">
                止损 <b className="text-[var(--warn)]">{fmt(pos.stopLoss)}</b>
                {((pos.direction === "long" && pos.lastPrice <= pos.stopLoss) ||
                  (pos.direction === "short" && pos.lastPrice >= pos.stopLoss)) && (
                  <b className="ml-1 text-[var(--warn)]">⚠ 已触及，建议立即平仓</b>
                )}
              </span>
            )}
            <span className={`mono text-sm font-semibold ${pos.floatingPnl >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
              {pos.floatingPnl >= 0 ? "+" : ""}¥{fmt(pos.floatingPnl, 0)}
            </span>
            <button
              onClick={() => closeMut.mutate({ clientId })}
              disabled={closeMut.isPending}
              className="mono ml-auto border border-[var(--warn)] px-4 py-1.5 text-xs text-[var(--warn)] transition-colors hover:bg-[rgba(251,191,36,0.12)] disabled:opacity-40"
            >
              {closeMut.isPending ? "平仓中…" : "市价平仓"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-[var(--muted)]">
            当前无持仓。在上方品种池中，信号「允许」时点击开多/开空即可下单（每次1手，同时只持1单 —— 规则1）。
          </p>
        )}
      </div>
    </section>
  );
}
