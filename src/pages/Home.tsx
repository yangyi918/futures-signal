import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { VARIETIES, type SignalResult } from "@contracts/futures";
import { useAuth } from "@/hooks/useAuth";
import PoolPanel from "@/components/PoolPanel";
import PaperPanel from "@/components/PaperPanel";
import RecordsPanel from "@/components/RecordsPanel";

// ---------- 客户端ID（用于找回上次输入） ----------
function getClientId() {
  let id = localStorage.getItem("futures_client_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("futures_client_id", id);
  }
  return id;
}

interface FormState {
  variety: string;
  contract: string;
  price: string;
  lots: string;
  capital: string;
  stopLoss: string;
  holding: "none" | "long" | "short";
}

const DEFAULT_FORM: FormState = {
  variety: "RB",
  contract: "",
  price: "",
  lots: "1",
  capital: "100000",
  stopLoss: "",
  holding: "none",
};

const fmt = (n: number, d = 1) =>
  n.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt0 = (n: number) => fmt(n, 0);

// ---------- 15分钟K线图（蜡烛 + MA200 + 现价 + 自动止损价） ----------
function KLineChart({ signal }: { signal: SignalResult }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const { bars, ma } = signal.chart;
    if (!bars.length) return;

    // 布局：左侧价格轴 52px，底部时间轴 18px，下方成交量区
    const axW = 56, axH = 20;
    const plotW = W - axW, plotH = H - axH;
    const volH = Math.round(plotH * 0.16);
    const priceH = plotH - volH;

    // 参与定界的价格：K线 + MA200 + 现价 + 两个建议止损价
    const prices = bars.flatMap((b) => [b.h, b.l])
      .concat(ma.filter((x): x is number => x != null))
      .concat([signal.lastPrice, signal.risk.suggestedLongStop, signal.risk.suggestedShortStop]);
    let min = Math.min(...prices), max = Math.max(...prices);
    const padP = (max - min) * 0.04 || 1;
    min -= padP; max += padP;
    const y = (v: number) => ((max - v) / (max - min)) * priceH;
    const maxVol = Math.max(...bars.map((b) => b.v), 1);
    const yv = (v: number) => plotH - (v / maxVol) * volH;

    const n = bars.length;
    const step = plotW / n;
    const cw = Math.max(1.5, Math.min(7, step * 0.62));
    const x = (i: number) => i * step + step / 2;

    // 网格
    ctx.strokeStyle = "rgba(26,37,64,0.8)";
    ctx.lineWidth = 1;
    ctx.font = "10px 'JetBrains Mono', monospace";
    for (let g = 0; g <= 4; g++) {
      const gy = (priceH / 4) * g;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(plotW, gy); ctx.stroke();
      const pv = max - ((max - min) / 4) * g;
      ctx.fillStyle = "#5d6b87";
      ctx.textAlign = "left";
      ctx.fillText(fmt(pv), plotW + 4, gy + 3);
    }

    // 成交量
    bars.forEach((b, i) => {
      const bull = b.c >= b.o;
      ctx.fillStyle = bull ? "rgba(251,44,54,0.5)" : "rgba(0,187,127,0.5)";
      const top = yv(b.v);
      ctx.fillRect(x(i) - cw / 2, top, cw, plotH - top);
    });

    // 蜡烛
    bars.forEach((b, i) => {
      const bull = b.c >= b.o;
      const col = bull ? "#fb2c36" : "#00bb7f";
      ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(x(i), y(b.h)); ctx.lineTo(x(i), y(b.l)); ctx.stroke();
      const top = y(Math.max(b.o, b.c)), bot = y(Math.min(b.o, b.c));
      if (bull) {
        ctx.fillStyle = "#0c1220";
        ctx.fillRect(x(i) - cw / 2, top, cw, Math.max(1, bot - top));
        ctx.strokeRect(x(i) - cw / 2, top, cw, Math.max(1, bot - top));
      } else {
        ctx.fillStyle = col;
        ctx.fillRect(x(i) - cw / 2, top, cw, Math.max(1, bot - top));
      }
    });

    // MA200
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    let started = false;
    ma.forEach((m, i) => {
      if (m == null) return;
      const px = x(i), py = y(m);
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "left";
    ctx.fillText(`MA200 ${fmt(signal.ma200)}`, 6, y(signal.ma200) - 4);

    // 画价格水平线 + 右侧标签
    const priceLine = (v: number, col: string, label: string, dash: number[]) => {
      const py = y(v);
      ctx.strokeStyle = col;
      ctx.setLineDash(dash);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(plotW, py); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col;
      const tw = ctx.measureText(label).width + 8;
      ctx.fillRect(plotW - tw - 2, py - 7, tw, 14);
      ctx.fillStyle = "#050810";
      ctx.textAlign = "left";
      ctx.fillText(label, plotW - tw + 2, py + 3);
    };

    // 自动止损价：只显示当前规则允许的方向
    if (signal.longVerdict.allowed) {
      priceLine(signal.risk.suggestedLongStop, "#fbbf24", `止损 ${fmt(signal.risk.suggestedLongStop)}`, [6, 4]);
    }
    if (signal.shortVerdict.allowed) {
      priceLine(signal.risk.suggestedShortStop, "#fbbf24", `止损 ${fmt(signal.risk.suggestedShortStop)}`, [6, 4]);
    }

    // 当前价
    priceLine(signal.lastPrice, "#22d3ee", `现价 ${fmt(signal.lastPrice)}`, [2, 3]);

    // 时间轴（起、中、终）
    ctx.fillStyle = "#5d6b87";
    ctx.textAlign = "left";
    ctx.fillText(bars[0].t.slice(5, 16), 4, H - 6);
    ctx.textAlign = "center";
    ctx.fillText(bars[Math.floor(n / 2)].t.slice(5, 16), plotW / 2, H - 6);
    ctx.textAlign = "right";
    ctx.fillText(bars[n - 1].t.slice(5, 16), plotW - 4, H - 6);
  }, [signal]);
  return <canvas ref={ref} className="h-full w-full" />;
}

// ---------- 主页面 ----------
export default function Home() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loaded, setLoaded] = useState(false);
  const [capitalTouched, setCapitalTouched] = useState(false); // 用户手动改过资金后不再自动同步
  const clientId = useMemo(getClientId, []);
  const { user, isLoading: authLoading, logout } = useAuth();

  // 模拟账户持仓（用于品种池开仓按钮与规则1联动）
  const accQuery = trpc.paper.getAccount.useQuery({ clientId });
  const acc = accQuery.data;
  const hasPosition = !!acc?.position;

  // 登录状态变化后，重新拉取对应归属的数据
  useEffect(() => {
    setLoaded(false);
    setCapitalTouched(false);
  }, [user?.id]);

  // ① 账户资金自动同步：未手动修改时，资金 = 模拟账户实时权益
  useEffect(() => {
    if (!loaded || capitalTouched || !acc) return;
    const equity = acc.cash + (acc.position?.floatingPnl ?? 0);
    setForm((f) => ({ ...f, capital: String(Math.round(equity)) }));
  }, [acc, loaded, capitalTouched]);

  // 读取上次输入
  const lastInput = trpc.futures.getInput.useQuery({ clientId }, { staleTime: Infinity });
  useEffect(() => {
    if (lastInput.data && !loaded) {
      const d = lastInput.data;
      setForm({
        variety: d.variety,
        contract: d.contract,
        price: d.price ? String(d.price) : "",
        lots: String(d.lots),
        capital: String(d.capital),
        stopLoss: d.stopLoss != null ? String(d.stopLoss) : "",
        holding: d.holding,
      });
      setLoaded(true);
    } else if (lastInput.data === null && !loaded) {
      setLoaded(true);
    }
  }, [lastInput.data, loaded]);

  // 自动保存（防抖）
  const saveMut = trpc.futures.saveInput.useMutation();
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      const price = parseFloat(form.price), capital = parseFloat(form.capital);
      if (!form.contract || !(price > 0) || !(capital > 0)) return;
      saveMut.mutate({
        clientId,
        data: {
          variety: form.variety,
          contract: form.contract,
          price,
          lots: parseInt(form.lots) || 1,
          capital,
          stopLoss: form.stopLoss ? parseFloat(form.stopLoss) : null,
          holding: form.holding,
        },
      });
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, loaded]);

  const validInput =
    form.contract.trim().length >= 2 &&
    parseFloat(form.price) > 0 &&
    parseFloat(form.capital) > 0;

  const signalQuery = trpc.futures.signal.useQuery(
    {
      variety: form.variety,
      contract: form.contract.trim(),
      price: parseFloat(form.price) || 0,
      lots: parseInt(form.lots) || 1,
      capital: parseFloat(form.capital) || 0,
      stopLoss: form.stopLoss ? parseFloat(form.stopLoss) : null,
      holding: form.holding,
    },
    {
      enabled: loaded && validInput,
      refetchInterval: 60_000, // 每60秒自动刷新行情
      retry: 1,
    },
  );
  const signal = signalQuery.data;

  // ② 输入开仓价后，自动按5%红线和当前趋势填写止损价
  const trend = signal?.trend;
  useEffect(() => {
    if (!loaded || !trend) return;
    const price = parseFloat(form.price), capital = parseFloat(form.capital);
    const lots = parseInt(form.lots) || 1;
    const v = VARIETIES.find((x) => x.code === form.variety);
    if (!(price > 0) || !(capital > 0) || !v) return;
    const dist = (capital * 0.05) / (lots * v.multiplier);
    if (!(dist > 0)) return;
    const stop = trend === "up" ? price - dist : price + dist;
    setForm((f) => ({ ...f, stopLoss: String(Math.round(stop * 10) / 10) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.price, form.lots, form.capital, form.variety, trend, loaded]);

  // 倒计时
  const [countdown, setCountdown] = useState(60);
  useEffect(() => {
    const t = setInterval(() => {
      const ts = signalQuery.dataUpdatedAt;
      if (!ts) return;
      const left = Math.max(0, 60 - Math.floor((Date.now() - ts) / 1000));
      setCountdown(left);
    }, 1000);
    return () => clearInterval(t);
  }, [signalQuery.dataUpdatedAt]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const variety = VARIETIES.find((v) => v.code === form.variety);
  const errMsg = signalQuery.error?.message;

  return (
    <div className="scanlines min-h-screen bg-[var(--bg)]">
      {/* 顶栏 */}
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[rgba(5,8,16,0.92)] backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="live-dot inline-block h-2.5 w-2.5 rounded-full bg-[var(--cyan)] shadow-[0_0_8px_var(--cyan)]" />
            <h1 className="text-lg font-bold tracking-wide">期货信号助手</h1>
            <span className="mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
              15MIN · MA200 · 铁律纪律
            </span>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {signal && (
              <span className="mono hidden text-xs text-[var(--muted)] sm:inline">
                行情时间 <span className="text-[var(--cyan)]">{signal.updatedAt}</span>
              </span>
            )}
            <span className="mono hidden text-xs text-[var(--muted)] sm:inline">
              {signalQuery.isFetching ? "刷新中…" : `${countdown}s 后刷新`}
            </span>
            {/* 登录状态 */}
            {authLoading ? null : user ? (
              <span className="flex items-center gap-2 text-xs">
                {user.avatar && <img src={user.avatar} alt="" className="h-6 w-6 rounded-full" />}
                <span className="text-[var(--text)]">{user.name ?? "已登录用户"}</span>
                <button onClick={() => logout()}
                  className="mono border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:border-[var(--warn)] hover:text-[var(--warn)]">
                  退出
                </button>
              </span>
            ) : (
              <a href="/login"
                className="mono border border-[var(--cyan)] px-3 py-1 text-xs text-[var(--cyan)] hover:bg-[rgba(34,211,238,0.1)]">
                登录 Kimi
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-4 px-4 py-4 lg:grid-cols-[360px_1fr]">
        {/* ============ 左：输入面板 ============ */}
        <section className="border border-[var(--line)] bg-[var(--panel)]">
          <div className="border-b border-[var(--line)] px-4 py-2.5">
            <span className="mono text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">交易参数 ORDER PARAMS</span>
          </div>
          <div className="space-y-4 p-4">
            {!user && !authLoading && (
              <div className="border border-[var(--warn)] bg-[rgba(251,191,36,0.08)] px-3 py-2 text-[11px] leading-relaxed text-[var(--warn)]">
                当前为缺省用户：数据（模拟账户/品种池/交易记录）所有访客共享。登录 Kimi 后自动切换到个人独立数据。
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-[var(--muted)]">品种</label>
              <select value={form.variety} onChange={set("variety")}
                className="w-full border border-[var(--line)] bg-[var(--panel2)] px-3 py-2 text-sm outline-none focus:border-[var(--cyan)]">
                {VARIETIES.map((v) => (
                  <option key={v.code} value={v.code}>{v.name} {v.code} · {v.exchange}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-[var(--muted)]">合约代码</label>
                <input value={form.contract} onChange={set("contract")} placeholder={variety?.example ?? "RB2601"}
                  className="mono w-full border border-[var(--line)] bg-[var(--panel2)] px-3 py-2 text-sm uppercase outline-none focus:border-[var(--cyan)]" />
                <p className="mono mt-1 text-[10px] text-[var(--muted)]">示例 {variety?.example}</p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--muted)]">手数</label>
                <input type="number" min={1} value={form.lots} onChange={set("lots")}
                  className="mono w-full border border-[var(--line)] bg-[var(--panel2)] px-3 py-2 text-sm outline-none focus:border-[var(--cyan)]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-[var(--muted)]">计划开仓价</label>
                <input type="number" value={form.price} onChange={set("price")} placeholder="0"
                  className="mono w-full border border-[var(--line)] bg-[var(--panel2)] px-3 py-2 text-sm outline-none focus:border-[var(--cyan)]" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--muted)]">
                  计划止损价
                  <span className="mono ml-1 text-[var(--cyan)]">· 按5%红线自动计算</span>
                </label>
                <input type="number" value={form.stopLoss} onChange={set("stopLoss")} placeholder="自动"
                  className="mono w-full border border-[var(--line)] bg-[var(--panel2)] px-3 py-2 text-sm outline-none focus:border-[var(--cyan)]" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--muted)]">
                账户总资金（元）
                {!capitalTouched && <span className="mono ml-1 text-[var(--cyan)]">· 自动同步账户权益</span>}
              </label>
              <input type="number" value={form.capital}
                onChange={(e) => { setCapitalTouched(true); set("capital")(e); }}
                className="mono w-full border border-[var(--line)] bg-[var(--panel2)] px-3 py-2 text-sm outline-none focus:border-[var(--cyan)]" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--muted)]">当前该品种持仓（规则1）</label>
              <div className="grid grid-cols-3 gap-2">
                {([["none", "无持仓"], ["long", "持多单"], ["short", "持空单"]] as const).map(([val, label]) => (
                  <button key={val} type="button"
                    onClick={() => setForm((f) => ({ ...f, holding: val }))}
                    className={`mono border px-2 py-2 text-xs transition-colors ${
                      form.holding === val
                        ? val === "long" ? "border-[var(--up)] bg-[rgba(251,44,54,0.12)] text-[var(--up)]"
                          : val === "short" ? "border-[var(--down)] bg-[rgba(0,187,127,0.12)] text-[var(--down)]"
                          : "border-[var(--cyan)] bg-[rgba(34,211,238,0.1)] text-[var(--cyan)]"
                        : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--muted)]"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {signal && form.contract && (
              <button type="button"
                onClick={() => setForm((f) => ({ ...f, price: String(signal.lastPrice) }))}
                className="mono w-full border border-[var(--cyan)] px-3 py-2 text-xs text-[var(--cyan)] transition-colors hover:bg-[rgba(34,211,238,0.1)]">
                使用现价 {fmt(signal.lastPrice)} 作为开仓价
              </button>
            )}
            <p className="text-[11px] leading-relaxed text-[var(--muted)]">
              输入自动保存，下次打开自动恢复。合约乘数：{variety?.multiplier ?? "-"} 点/手。
            </p>
          </div>
        </section>

        {/* ============ 右：行情与信号 ============ */}
        <section className="space-y-4">
          {errMsg && (
            <div className="border border-[var(--warn)] bg-[rgba(251,191,36,0.08)] px-4 py-3 text-sm text-[var(--warn)]">
              {errMsg.replace(/^\[.*?\]\s*/, "")}
            </div>
          )}
          {!signal && !errMsg && (
            <div className="flex h-64 items-center justify-center border border-dashed border-[var(--line)] text-sm text-[var(--muted)]">
              {signalQuery.isFetching ? "正在获取真实行情…" : "填写合约代码与开仓价后，自动生成规则信号"}
            </div>
          )}

          {signal && (
            <>
              {/* 行情条 */}
              <div className="border border-[var(--line)] bg-[var(--panel)] p-4">
                <div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-base font-bold">{signal.varietyName} {signal.contract}</span>
                    <span className="mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">乘数 {signal.multiplier}</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-4">
                    <span className={`mono text-4xl font-semibold ${signal.change >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
                      {fmt(signal.lastPrice)}
                    </span>
                    <span className={`mono text-sm ${signal.change >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
                      {signal.change >= 0 ? "+" : ""}{fmt(signal.change)}（{signal.changePct >= 0 ? "+" : ""}{fmt(signal.changePct, 2)}%）
                    </span>
                  </div>
                  <div className="mono mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-[var(--muted)] sm:grid-cols-3">
                    <span>MA200 <b className="text-[var(--warn)]">{fmt(signal.ma200)}</b></span>
                    <span>趋势 <b className={signal.trend === "up" ? "text-[var(--up)]" : "text-[var(--down)]"}>
                      {signal.trend === "up" ? "均线上方·只做多" : "均线下方·只做空"}</b></span>
                    <span>最近K线 <b className={signal.lastCandle.bullish ? "text-[var(--up)]" : "text-[var(--down)]"}>
                      {signal.lastCandle.bullish ? "阳线" : "阴线"}</b>（{signal.lastCandle.time.slice(11, 16)}）</span>
                  </div>
                </div>
              </div>

              {/* 15分钟K线图 */}
              <div className="border border-[var(--line)] bg-[var(--panel)]">
                <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
                  <span className="mono text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
                    15分钟K线 · {signal.contract} · 最近{signal.chart.bars.length}根
                  </span>
                  <span className="mono flex items-center gap-3 text-[10px] text-[var(--muted)]">
                    <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-[#fbbf24]" />MA200</span>
                    <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-[#22d3ee]" />现价</span>
                    <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-[#fbbf24] opacity-50" style={{backgroundImage:"repeating-linear-gradient(90deg,#fbbf24 0 3px,transparent 3px 6px)"}} />止损</span>
                  </span>
                </div>
                <div className="h-[340px] p-2 sm:h-[420px]"><KLineChart signal={signal} /></div>
              </div>

              {/* 多空裁决 */}
              <div className="grid gap-4 sm:grid-cols-2">
                {([
                  { title: "开多 LONG", v: signal.longVerdict, col: "var(--up)", sug: signal.risk.suggestedLongStop },
                  { title: "开空 SHORT", v: signal.shortVerdict, col: "var(--down)", sug: signal.risk.suggestedShortStop },
                ] as const).map(({ title, v, col, sug }) => (
                  <div key={title} className="border bg-[var(--panel)]" style={{ borderColor: v.allowed ? col : "var(--line)" }}>
                    <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
                      <span className="mono text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">{title}</span>
                      <span className="mono px-2 py-0.5 text-xs font-bold"
                        style={{
                          color: v.allowed ? col : "var(--warn)",
                          background: v.allowed ? `color-mix(in srgb, ${col} 12%, transparent)` : "rgba(251,191,36,0.1)",
                          border: `1px solid ${v.allowed ? col : "var(--warn)"}`,
                        }}>
                        {v.allowed ? "允许开仓" : "禁止开仓"}
                      </span>
                    </div>
                    <div className="px-4 py-3 text-xs leading-relaxed">
                      {v.allowed ? (
                        <p className="text-[var(--text)]">
                          通过全部规则检查。建议止损价 <b className="mono" style={{ color: col }}>{fmt(sug)}</b>
                          （{fmt(signal.risk.maxStopDistance)}点，亏损≈¥{fmt0(signal.risk.maxLossPerOrder)}）
                        </p>
                      ) : (
                        <ul className="space-y-1 text-[var(--warn)]">
                          {v.reasons.map((r, i) => <li key={i}>✕ {r}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 规则检查清单 */}
              <div className="border border-[var(--line)] bg-[var(--panel)]">
                <div className="border-b border-[var(--line)] px-4 py-2.5">
                  <span className="mono text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">规则纪律检查 RULE CHECKS</span>
                </div>
                <div className="divide-y divide-[var(--line)]">
                  {signal.rules.map((r) => (
                    <div key={r.rule} className="flex gap-3 px-4 py-3 text-sm">
                      <span className={`mono mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center border text-[10px] ${
                        r.pass ? "border-[var(--cyan)] text-[var(--cyan)]" : "border-[var(--warn)] text-[var(--warn)]"}`}>
                        {r.pass ? "✓" : "!"}
                      </span>
                      <div>
                        <div className="font-medium">规则{r.rule} · {r.name}</div>
                        <div className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{r.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 风控数据 */}
              <div className="mono grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-4">
                {[
                  ["5% 最大亏损", `¥${fmt0(signal.risk.maxLossPerOrder)}`],
                  ["最大止损距离", `${fmt(signal.risk.maxStopDistance)} 点`],
                  ["多头止损建议", fmt(signal.risk.suggestedLongStop)],
                  ["空头止损建议", fmt(signal.risk.suggestedShortStop)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-[var(--panel)] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">{k}</div>
                    <div className="mt-1 text-sm text-[var(--text)]">{v}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 品种池 + 模拟交易 + 交易记录 */}
          <PaperPanel clientId={clientId} />
          <PoolPanel clientId={clientId} hasPosition={hasPosition} />
          <RecordsPanel clientId={clientId} />

          {/* 规则原文 */}
          <div className="border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-[11px] leading-relaxed text-[var(--muted)]">
            <p className="mono mb-1 uppercase tracking-[0.2em]">交易铁律 Trading Rules</p>
            <p>规则1 单品种单笔持仓限制：同一品种同时仅允许持有1单，禁止叠加、重仓加仓。</p>
            <p>规则2 单笔资金风控红线：任意单笔订单最大亏损严禁超过账户总资金5%，严格止损。</p>
            <p>规则3 15分钟200均线趋势铁律：均线上方严禁开空，均线下方严禁开多。</p>
            <p>规则4 K线时序开仓禁令：阳线后下一根K线运行阶段禁止开空；阴线后禁止开多。</p>
            <p className="mt-1 text-[10px]">行情数据：新浪财经国内期货15分钟K线（真实行情），每60秒自动刷新。信号仅供参考，不构成投资建议。</p>
          </div>
        </section>
      </main>
    </div>
  );
}
