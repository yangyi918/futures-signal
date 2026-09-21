// 品种池扫描 + 模拟交易逻辑
import type { PaperStats, PoolScanItem } from "@contracts/futures";
import { MARGIN_RATES, varietyOf } from "@contracts/futures";
import { fetch15MinKlines } from "./sina";

export function marginFor(symbol: string, price: number, lots: number): number {
  const v = varietyOf(symbol);
  if (!v) return 0;
  const rate = MARGIN_RATES[v.code] ?? 0.1;
  return price * v.multiplier * lots * rate;
}

export async function scanSymbol(symbol: string): Promise<PoolScanItem> {
  const sym = symbol.toUpperCase();
  const v = varietyOf(sym);
  if (!v) {
    return {
      symbol: sym, varietyCode: sym, name: "未知品种", multiplier: 0, marginRate: 0,
      lastPrice: 0, changePct: 0, ma200: 0, trend: "down", lastBullish: true,
      longAllowed: false, shortAllowed: false, updatedAt: "",
      error: "未知品种代码",
    };
  }
  try {
    const bars = await fetch15MinKlines(sym);
    if (bars.length < 201) throw new Error("K线不足");
    const last = bars[bars.length - 1];
    const closed = bars[bars.length - 2];
    const prev = bars[bars.length - 3];
    const closes = bars.slice(-201, -1).map((b) => b.c);
    const ma200 = closes.reduce((a, b) => a + b, 0) / closes.length;
    const trend = last.c >= ma200 ? "up" : "down";
    const bullish = closed.c >= closed.o;
    // 规则3+4
    const longAllowed = trend === "up" && bullish;
    const shortAllowed = trend === "down" && !bullish;
    return {
      symbol: sym,
      varietyCode: v.code,
      name: v.name,
      multiplier: v.multiplier,
      marginRate: MARGIN_RATES[v.code] ?? 0.1,
      lastPrice: last.c,
      changePct: ((last.c - prev.c) / prev.c) * 100,
      ma200,
      trend,
      lastBullish: bullish,
      longAllowed,
      shortAllowed,
      updatedAt: last.d,
    };
  } catch (e) {
    return {
      symbol: sym, varietyCode: v.code, name: v.name, multiplier: v.multiplier,
      marginRate: MARGIN_RATES[v.code] ?? 0.1,
      lastPrice: 0, changePct: 0, ma200: 0, trend: "down", lastBullish: true,
      longAllowed: false, shortAllowed: false, updatedAt: "",
      error: e instanceof Error ? e.message : "行情获取失败",
    };
  }
}

export function floatingPnl(direction: "long" | "short", open: number, last: number, multiplier: number, lots: number) {
  return (direction === "long" ? last - open : open - last) * multiplier * lots;
}

// 统计：胜率、总盈亏、最大回撤（按平仓时间顺序的累计权益曲线）
export function computeStats(
  initial: number,
  cash: number,
  floating: number,
  closed: { pnl: number | null; closeTime: Date | null }[],
): PaperStats {
  const sorted = [...closed]
    .filter((t) => t.closeTime != null)
    .sort((a, b) => +new Date(a.closeTime!) - +new Date(b.closeTime!));
  const pnls = sorted.map((t) => t.pnl ?? 0);
  const wins = pnls.filter((p) => p > 0).length;
  const totalPnl = pnls.reduce((a, b) => a + b, 0);
  // 最大回撤
  let peak = initial, maxDd = 0, eq = initial;
  for (const p of pnls) {
    eq += p;
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDd) maxDd = dd;
  }
  const equity = cash + floating;
  return {
    totalTrades: closed.length,
    closedTrades: sorted.length,
    wins,
    winRate: sorted.length ? (wins / sorted.length) * 100 : 0,
    totalPnl,
    maxDrawdown: maxDd,
    equity,
    returnPct: initial ? ((equity - initial) / initial) * 100 : 0,
  };
}
