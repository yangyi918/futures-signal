import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { VARIETIES, type SignalResult } from "@contracts/futures";

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

// ---------- 迷你K线图（Canvas） ----------
function MiniKline({ signal }: { signal: SignalResult }) {
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
    // 后端仅传了关键数字，没有完整K线数组——画价格与MA200关系示意
    const pad = 8;
    const all = [signal.ma200, signal.lastPrice, signal.prevClose, signal.lastCandle.open, signal.lastCandle.close];
    const min = Math.min(...all), max = Math.max(...all);
    const span = max - min || 1;
    const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2);
    // MA200 线
    ctx.strokeStyle = "#fbbf24";
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y(signal.ma200)); ctx.lineTo(W, y(signal.ma200)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "10px JetBrains Mono, monospace";
    ctx.fillText(`MA200 ${fmt(signal.ma200)}`, 6, y(signal.ma200) - 4);
    // 最近一根K线
    const cx = W - 46, cw = 14;
    const c = signal.lastCandle;
    const col = c.bullish ? "#fb2c36" : "#00bb7f";
    ctx.strokeStyle = col; ctx.fillStyle = col;
    const bodyTop = y(Math.max(c.open, c.close)), bodyBot = y(Math.min(c.open, c.close));
    ctx.fillRect(cx, bodyTop, cw, Math.max(2, bodyBot - bodyTop));
    ctx.strokeRect(cx - 0.5, bodyTop - 0.5, cw + 1, Math.max(2, bodyBot - bodyTop) + 1);
    // 现价线
    ctx.strokeStyle = "#22d3ee";
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(0, y(signal.lastPrice)); ctx.lineTo(W, y(signal.lastPrice)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#22d3ee";
    ctx.fillText(fmt(signal.lastPrice), 6, y(signal.lastPrice) + 12);
    ctx.fillText(c.bullish ? "阳" : "阴", cx + 2, bodyTop - 6);
  }, [signal]);
  return <canvas ref={ref} className="h-full w-full" />;
}

// ---------- 主页面 ----------
export default function Home() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loaded, setLoaded] = useState(false);
  const clientId = useMemo(getClientId, []);

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
              <span className="mono text-xs text-[var(--muted)]">
                行情时间 <span className="text-[var(--cyan)]">{signal.updatedAt}</span>
              </span>
            )}
            <span className="mono text-xs text-[var(--muted)]">
              {signalQuery.isFetching ? "刷新中…" : `${countdown}s 后刷新`}
            </span>
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
                <label className="mb-1 block text-xs text-[var(--muted)]">计划止损价（选填）</label>
                <input type="number" value={form.stopLoss} onChange={set("stopLoss")} placeholder="0"
                  className="mono w-full border border-[var(--line)] bg-[var(--panel2)] px-3 py-2 text-sm outline-none focus:border-[var(--cyan)]" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--muted)]">账户总资金（元）</label>
              <input type="number" value={form.capital} onChange={set("capital")}
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
              <div className="grid gap-4 border border-[var(--line)] bg-[var(--panel)] p-4 sm:grid-cols-[1fr_220px]">
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
                <div className="hidden h-28 sm:block"><MiniKline signal={signal} /></div>
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
