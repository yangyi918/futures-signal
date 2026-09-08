// 规则信号引擎：按图片中的规则 1-4 评估买卖信号
import type { RuleCheck, SignalResult, TradeInput, Variety } from "@contracts/futures";
import { fetch15MinKlines, type KlineBar } from "./sina";

const CHART_BARS = 120; // 图表展示的最近K线根数

function buildChart(bars: KlineBar[]): SignalResult["chart"] {
  const slice = bars.slice(-CHART_BARS);
  // 计算全序列MA200，再对齐截取
  const closesAll = bars.map((b) => b.c);
  const maAll: (number | null)[] = closesAll.map((_, i) => {
    if (i < 199) return null;
    let s = 0;
    for (let j = i - 199; j <= i; j++) s += closesAll[j];
    return s / 200;
  });
  return {
    bars: slice.map((b) => ({ t: b.d, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })),
    ma: maAll.slice(-CHART_BARS),
  };
}

export async function evaluateSignal(input: TradeInput, variety: Variety): Promise<SignalResult> {
  const bars = await fetch15MinKlines(input.contract);
  if (bars.length < 201) {
    throw new Error(`合约 ${input.contract.toUpperCase()} 15分钟K线不足（当前 ${bars.length} 根），无法计算200均线`);
  }

  // 最后一根可能是正在运行的K线；倒数第二根为最近已收盘K线
  const last = bars[bars.length - 1];
  const closed = bars[bars.length - 2];
  const prevClosed = bars[bars.length - 3];
  const closesForMa = bars.slice(-201, -1).map((b) => b.c); // 最近200根已收盘K线
  const ma200 = closesForMa.reduce((a, b) => a + b, 0) / closesForMa.length;

  const lastPrice = last.c;
  const trend: "up" | "down" = lastPrice >= ma200 ? "up" : "down";
  const bullish = closed.c >= closed.o;

  const rules: RuleCheck[] = [];

  // 规则1：单品种单笔持仓限制
  const hasHolding = input.holding !== "none";
  rules.push({
    rule: 1,
    name: "单品种单笔持仓限制",
    pass: !hasHolding,
    blocking: hasHolding,
    detail: hasHolding
      ? `当前已持有该品种${input.holding === "long" ? "多单" : "空单"}，禁止叠加多单、重仓加仓`
      : "当前该品种无持仓，允许新开1单",
  });

  // 规则2：单笔资金风控红线（5%）
  const maxLossPerOrder = input.capital * 0.05;
  const maxStopDistance = maxLossPerOrder / (input.lots * variety.multiplier);
  const plannedLoss =
    input.stopLoss != null && input.stopLoss > 0
      ? Math.abs(input.price - input.stopLoss) * input.lots * variety.multiplier
      : null;
  const plannedLossPct =
    plannedLoss != null && input.capital > 0 ? (plannedLoss / input.capital) * 100 : null;
  const rule2pass = plannedLoss == null || plannedLoss <= maxLossPerOrder + 1e-9;
  rules.push({
    rule: 2,
    name: "单笔资金风控红线",
    pass: rule2pass,
    blocking: !rule2pass,
    detail:
      plannedLoss == null
        ? `单笔最大允许亏损 ¥${maxLossPerOrder.toFixed(0)}（5%），对应最大止损距离 ${maxStopDistance.toFixed(1)} 点；未填止损价，请务必设置止损`
        : `按计划止损价预计亏损 ¥${plannedLoss.toFixed(0)}（占资金 ${plannedLossPct!.toFixed(2)}%），${
            rule2pass ? "未超过5%红线" : "已超过5%红线，必须收紧止损或减小手数"
          }`,
  });

  // 规则3：15分钟200均线趋势铁律
  rules.push({
    rule: 3,
    name: "200均线趋势铁律",
    pass: true,
    blocking: false,
    detail:
      trend === "up"
        ? `现价 ${lastPrice.toFixed(1)} 位于200均线（${ma200.toFixed(1)}）上方 → 严禁开空单`
        : `现价 ${lastPrice.toFixed(1)} 位于200均线（${ma200.toFixed(1)}）下方 → 严禁开多单`,
  });

  // 规则4：K线时序开仓禁令
  rules.push({
    rule: 4,
    name: "K线时序开仓禁令",
    pass: true,
    blocking: false,
    detail: bullish
      ? `最近一根15分钟已收盘K线为阳线（${closed.d}）→ 下一根K线运行阶段禁止开空`
      : `最近一根15分钟已收盘K线为阴线（${closed.d}）→ 下一根K线运行阶段禁止开多`,
  });

  // 方向裁决
  const longReasons: string[] = [];
  const shortReasons: string[] = [];
  if (hasHolding) {
    longReasons.push("规则1：已有持仓，禁止加仓");
    shortReasons.push("规则1：已有持仓，禁止加仓");
  }
  if (!rule2pass) {
    longReasons.push("规则2：计划亏损超过5%红线");
    shortReasons.push("规则2：计划亏损超过5%红线");
  }
  if (trend === "down") longReasons.push("规则3：价格在200均线下方，严禁开多");
  if (trend === "up") shortReasons.push("规则3：价格在200均线上方，严禁开空");
  if (!bullish) longReasons.push("规则4：阴线后下一根K线运行阶段禁止开多");
  if (bullish) shortReasons.push("规则4：阳线后下一根K线运行阶段禁止开空");

  const change = lastPrice - prevClosed.c;
  return {
    contract: input.contract.toUpperCase(),
    varietyName: variety.name,
    multiplier: variety.multiplier,
    lastPrice,
    prevClose: prevClosed.c,
    change,
    changePct: (change / prevClosed.c) * 100,
    ma200,
    trend,
    lastCandle: { time: closed.d, open: closed.o, close: closed.c, bullish },
    candleCount: bars.length,
    rules,
    longVerdict: { allowed: longReasons.length === 0, reasons: longReasons },
    shortVerdict: { allowed: shortReasons.length === 0, reasons: shortReasons },
    risk: {
      maxLossPerOrder,
      maxStopDistance,
      suggestedLongStop: input.price - maxStopDistance,
      suggestedShortStop: input.price + maxStopDistance,
      plannedLossPct,
      plannedLoss,
    },
    updatedAt: last.d,
    serverTime: new Date().toISOString(),
    chart: buildChart(bars),
  };
}
