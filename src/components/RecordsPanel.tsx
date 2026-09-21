import { trpc } from "@/providers/trpc";

const fmt = (n: number, d = 1) =>
  n.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtT = (iso: string) => {
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// 交易记录区：完整记录 + 统计 + CSV导出
export default function RecordsPanel({ clientId }: { clientId: string }) {
  const utils = trpc.useUtils();
  const recQ = trpc.paper.records.useQuery({ clientId }, { refetchInterval: 60_000 });
  const data = recQ.data;

  const resetMut = trpc.paper.resetAccount.useMutation({
    onSuccess: () => {
      utils.paper.getAccount.invalidate({ clientId });
      recQ.refetch();
    },
  });

  const exportCSV = () => {
    if (!data) return;
    const header = "合约,品种,方向,手数,开仓价,平仓价,止损价,盈亏(元),开仓时间,平仓时间,状态";
    const rows = data.trades.map((t) =>
      [
        t.symbol, t.name, t.direction === "long" ? "多" : "空", t.lots,
        t.openPrice, t.closePrice ?? "", t.stopLoss ?? "", t.pnl ?? "",
        t.openTime ? fmtT(t.openTime) : "", t.closeTime ? fmtT(t.closeTime) : "",
        t.status === "open" ? "持仓中" : "已平仓",
      ].join(","),
    );
    const csv = "﻿" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `模拟交易记录_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const s = data?.stats;

  return (
    <section className="border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-2.5">
        <span className="mono text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
          交易记录 TRADE LOG
        </span>
        <div className="ml-auto flex gap-2">
          <button onClick={exportCSV} disabled={!data?.trades.length}
            className="mono border border-[var(--cyan)] px-2 py-1 text-xs text-[var(--cyan)] hover:bg-[rgba(34,211,238,0.1)] disabled:opacity-40">
            导出 CSV
          </button>
          <button
            onClick={() => {
              if (confirm("确认重置？将恢复10万本金并清空全部交易记录。")) resetMut.mutate({ clientId });
            }}
            className="mono border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)] hover:border-[var(--warn)] hover:text-[var(--warn)]">
            重置账户
          </button>
        </div>
      </div>

      {s && (
        <div className="mono grid grid-cols-2 gap-px bg-[var(--line)] sm:grid-cols-6">
          {[
            ["已平仓", `${s.closedTrades} 笔`],
            ["胜率", `${fmt(s.winRate, 1)}%`],
            ["累计盈亏", `${s.totalPnl >= 0 ? "+" : ""}¥${fmt(s.totalPnl, 0)}`],
            ["最大回撤", `¥${fmt(s.maxDrawdown, 0)}`],
            ["当前权益", `¥${fmt(s.equity, 0)}`],
            ["收益率", `${s.returnPct >= 0 ? "+" : ""}${fmt(s.returnPct, 2)}%`],
          ].map(([k, v]) => (
            <div key={k} className="bg-[var(--panel)] px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">{k}</div>
              <div className={`mt-0.5 text-sm ${
                k === "累计盈亏" || k === "收益率" || k === "当前权益"
                  ? String(v).startsWith("-") ? "text-[var(--down)]" : s.totalPnl > 0 || s.returnPct > 0 ? "text-[var(--up)]" : "text-[var(--text)]"
                  : "text-[var(--text)]"}`}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <div className="max-h-[360px] overflow-x-auto overflow-y-auto border-t border-[var(--line)]">
        <table className="mono w-full text-xs">
          <thead className="sticky top-0 bg-[var(--panel2)]">
            <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">
              <th className="px-3 py-2">合约</th><th className="px-2 py-2">方向</th>
              <th className="px-2 py-2 text-right">开仓价</th><th className="px-2 py-2 text-right">平仓价</th>
              <th className="px-2 py-2 text-right">止损</th><th className="px-2 py-2 text-right">盈亏</th>
              <th className="px-2 py-2">开仓时间</th><th className="px-2 py-2">平仓时间</th>
              <th className="px-2 py-2">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {(data?.trades ?? []).map((t) => (
              <tr key={t.id} className="hover:bg-[rgba(255,255,255,0.02)]">
                <td className="px-3 py-2">{t.name} <span className="text-[var(--muted)]">{t.symbol}</span></td>
                <td className={`px-2 py-2 ${t.direction === "long" ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
                  {t.direction === "long" ? "多" : "空"} ×{t.lots}</td>
                <td className="px-2 py-2 text-right">{fmt(t.openPrice)}</td>
                <td className="px-2 py-2 text-right">{t.closePrice != null ? fmt(t.closePrice) : "—"}</td>
                <td className="px-2 py-2 text-right text-[var(--muted)]">{t.stopLoss != null ? fmt(t.stopLoss) : "—"}</td>
                <td className={`px-2 py-2 text-right ${t.pnl == null ? "text-[var(--muted)]" : t.pnl >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
                  {t.pnl == null ? "—" : `${t.pnl >= 0 ? "+" : ""}${fmt(t.pnl, 0)}`}</td>
                <td className="px-2 py-2 text-[var(--muted)]">{t.openTime ? fmtT(t.openTime) : ""}</td>
                <td className="px-2 py-2 text-[var(--muted)]">{t.closeTime ? fmtT(t.closeTime) : "—"}</td>
                <td className="px-2 py-2">
                  {t.status === "open"
                    ? <span className="text-[var(--cyan)]">持仓中</span>
                    : <span className="text-[var(--muted)]">已平仓</span>}
                </td>
              </tr>
            ))}
            {data?.trades.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-[var(--muted)]">暂无交易记录</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
