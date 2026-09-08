// 新浪期货行情接口：获取国内期货合约 15 分钟 K 线（真实行情数据）

export interface KlineBar {
  d: string; // 时间
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

const cache = new Map<string, { at: number; bars: KlineBar[] }>();
const CACHE_TTL = 30_000; // 30 秒内重复请求直接命中缓存

export async function fetch15MinKlines(contract: string): Promise<KlineBar[]> {
  const symbol = contract.toUpperCase();
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.bars;

  const url =
    "https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20t=/InnerFuturesNewService.getFewMinLine" +
    `?symbol=${encodeURIComponent(symbol)}&type=15`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`行情接口响应异常（HTTP ${res.status}）`);
  const text = await res.text();

  // 剥掉 JSONP 包装：/*...*/var t=([...]);
  const start = text.indexOf("([");
  const end = text.lastIndexOf("])");
  if (start === -1 || end === -1) throw new Error("行情数据解析失败");
  const raw = JSON.parse(text.slice(start + 1, end + 1)) as Array<Record<string, string>>;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`未获取到合约 ${symbol} 的行情，请检查合约代码是否正确（如 RB2601）`);
  }

  const bars: KlineBar[] = raw.map((r) => ({
    d: r.d,
    o: parseFloat(r.o),
    h: parseFloat(r.h),
    l: parseFloat(r.l),
    c: parseFloat(r.c),
    v: parseFloat(r.v),
  }));

  cache.set(symbol, { at: Date.now(), bars });
  return bars;
}
