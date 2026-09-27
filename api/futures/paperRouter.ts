import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { paperAccounts, paperTrades, watchlist } from "../../db/schema";
import { and, desc, eq } from "drizzle-orm";
import { DEFAULT_POOL, varietyOf, type PaperAccount } from "@contracts/futures";
import { computeStats, floatingPnl, marginFor, scanSymbol } from "./paper";
import { fetch15MinKlines } from "./sina";

const cid = z.string().min(8).max(64);

// 数据归属：登录用户 → "u:{id}"；未登录 → 缺省用户 "default"
type Ctx = { user?: { id: number } };
function ownerOf(ctx: Ctx): { owner: string; userId: number | null } {
  return ctx.user ? { owner: `u:${ctx.user.id}`, userId: ctx.user.id } : { owner: "default", userId: null };
}

async function ensureAccount(owner: string, userId: number | null) {
  const db = getDb();
  const rows = await db.select().from(paperAccounts).where(eq(paperAccounts.clientId, owner)).limit(1);
  if (rows.length) return rows[0];
  await db.insert(paperAccounts).values({ clientId: owner, userId, initialCapital: 100000, cash: 100000 });
  const r = await db.select().from(paperAccounts).where(eq(paperAccounts.clientId, owner)).limit(1);
  return r[0];
}

async function currentPrice(symbol: string): Promise<number> {
  const bars = await fetch15MinKlines(symbol);
  return bars[bars.length - 1].c;
}

async function buildAccountView(owner: string, userId: number | null): Promise<PaperAccount> {
  const a = await ensureAccount(owner, userId);
  if (!a.posSymbol) return { initialCapital: a.initialCapital, cash: a.cash, position: null };
  const v = varietyOf(a.posSymbol);
  let lastPrice = a.posPrice ?? 0;
  try { lastPrice = await currentPrice(a.posSymbol); } catch { /* 保留开仓价 */ }
  const mult = v?.multiplier ?? 1;
  const dir = (a.posDirection ?? "long") as "long" | "short";
  return {
    initialCapital: a.initialCapital,
    cash: a.cash,
    position: {
      symbol: a.posSymbol,
      name: v?.name ?? a.posSymbol,
      direction: dir,
      openPrice: a.posPrice ?? 0,
      lots: a.posLots ?? 1,
      stopLoss: a.posStopLoss,
      openTime: a.posOpenTime ? new Date(a.posOpenTime).toISOString() : "",
      margin: marginFor(a.posSymbol, a.posPrice ?? 0, a.posLots ?? 1),
      lastPrice,
      floatingPnl: floatingPnl(dir, a.posPrice ?? 0, lastPrice, mult, a.posLots ?? 1),
    },
  };
}

export const paperRouter = createRouter({
  // ---------- 品种池 ----------
  getWatchlist: publicQuery.input(z.object({ clientId: cid })).query(async ({ ctx }) => {
    const db = getDb();
    const { owner, userId } = ownerOf(ctx);
    const rows = await db.select().from(watchlist).where(eq(watchlist.clientId, owner));
    if (rows.length === 0) {
      // 首次：写入默认池
      await db.insert(watchlist).values(DEFAULT_POOL.map((s) => ({ clientId: owner, userId, symbol: s })));
      return DEFAULT_POOL;
    }
    return rows.map((r) => r.symbol);
  }),

  addSymbol: publicQuery
    .input(z.object({ clientId: cid, symbol: z.string().min(2).max(16) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { owner, userId } = ownerOf(ctx);
      const sym = input.symbol.toUpperCase();
      if (!varietyOf(sym)) throw new Error(`未知品种代码：${sym}`);
      const rows = await db.select().from(watchlist).where(eq(watchlist.clientId, owner));
      if (rows.length === 0) {
        await db.insert(watchlist).values(DEFAULT_POOL.map((s) => ({ clientId: owner, userId, symbol: s })));
      } else if (rows.some((r) => r.symbol === sym)) {
        throw new Error("该合约已在品种池中");
      }
      await db.insert(watchlist).values({ clientId: owner, userId, symbol: sym });
      return { ok: true };
    }),

  removeSymbol: publicQuery
    .input(z.object({ clientId: cid, symbol: z.string().min(2).max(16) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { owner } = ownerOf(ctx);
      await db.delete(watchlist).where(
        and(eq(watchlist.clientId, owner), eq(watchlist.symbol, input.symbol.toUpperCase())),
      );
      return { ok: true };
    }),

  // 扫描品种池信号（逐个合约拉取真实15分钟K线）
  scan: publicQuery
    .input(z.object({ clientId: cid, symbols: z.array(z.string()).max(40) }))
    .query(async ({ input }) => {
      const results = [];
      // 顺序执行，避免对行情源并发过高
      for (const s of input.symbols) results.push(await scanSymbol(s));
      return results;
    }),

  // ---------- 模拟账户 ----------
  getAccount: publicQuery.input(z.object({ clientId: cid })).query(({ ctx }) => {
    const { owner, userId } = ownerOf(ctx);
    return buildAccountView(owner, userId);
  }),

  resetAccount: publicQuery.input(z.object({ clientId: cid })).mutation(async ({ ctx }) => {
    const db = getDb();
    const { owner, userId } = ownerOf(ctx);
    await ensureAccount(owner, userId);
    await db.update(paperAccounts).set({
      initialCapital: 100000, cash: 100000,
      posSymbol: null, posDirection: null, posPrice: null, posLots: null,
      posStopLoss: null, posOpenTime: null,
    }).where(eq(paperAccounts.clientId, owner));
    await db.delete(paperTrades).where(eq(paperTrades.clientId, owner));
    return { ok: true };
  }),

  // 开仓：规则1（最多1单）、每次1手、信号方向校验
  open: publicQuery
    .input(z.object({
      clientId: cid,
      symbol: z.string().min(2).max(16),
      direction: z.enum(["long", "short"]),
      stopLoss: z.number().positive().nullish(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { owner, userId } = ownerOf(ctx);
      const sym = input.symbol.toUpperCase();
      const a = await ensureAccount(owner, userId);
      if (a.posSymbol) throw new Error("规则1：当前已有持仓，请先平仓");
      const v = varietyOf(sym);
      if (!v) throw new Error(`未知品种：${sym}`);

      // 信号校验：规则3+4
      const scan = await scanSymbol(sym);
      if (scan.error || !scan.lastPrice) throw new Error(`行情不可用：${scan.error ?? "无数据"}`);
      if (input.direction === "long" && !scan.longAllowed) {
        throw new Error(`信号禁止开多（${scan.trend === "down" ? "价格在200均线下方" : "阴线运行阶段"}）`);
      }
      if (input.direction === "short" && !scan.shortAllowed) {
        throw new Error(`信号禁止开空（${scan.trend === "up" ? "价格在200均线上方" : "阳线运行阶段"}）`);
      }

      const price = scan.lastPrice;
      const lots = 1;
      const margin = marginFor(sym, price, lots);
      if (margin > a.cash) throw new Error(`可用资金不足：需保证金 ¥${margin.toFixed(0)}，当前 ¥${a.cash.toFixed(0)}`);

      await db.update(paperAccounts).set({
        cash: a.cash - margin,
        posSymbol: sym, posDirection: input.direction, posPrice: price,
        posLots: lots, posStopLoss: input.stopLoss ?? null, posOpenTime: new Date(),
      }).where(eq(paperAccounts.clientId, owner));

      await db.insert(paperTrades).values({
        clientId: owner, userId, symbol: sym, direction: input.direction,
        openPrice: price, lots, stopLoss: input.stopLoss ?? null, status: "open",
      });
      return { ok: true, price, margin };
    }),

  // 平仓：释放保证金 + 结算盈亏
  close: publicQuery.input(z.object({ clientId: cid })).mutation(async ({ ctx }) => {
    const db = getDb();
    const { owner, userId } = ownerOf(ctx);
    const a = await ensureAccount(owner, userId);
    if (!a.posSymbol) throw new Error("当前无持仓");
    const v = varietyOf(a.posSymbol);
    const mult = v?.multiplier ?? 1;
    const dir = (a.posDirection ?? "long") as "long" | "short";
    const lastPrice = await currentPrice(a.posSymbol);
    const lots = a.posLots ?? 1;
    const pnl = floatingPnl(dir, a.posPrice ?? 0, lastPrice, mult, lots);
    const margin = marginFor(a.posSymbol, a.posPrice ?? 0, lots);

    await db.update(paperAccounts).set({
      cash: a.cash + margin + pnl,
      posSymbol: null, posDirection: null, posPrice: null, posLots: null,
      posStopLoss: null, posOpenTime: null,
    }).where(eq(paperAccounts.clientId, owner));

    await db.update(paperTrades).set({
      closePrice: lastPrice, pnl, closeTime: new Date(), status: "closed",
    }).where(and(
      eq(paperTrades.clientId, owner),
      eq(paperTrades.symbol, a.posSymbol),
      eq(paperTrades.status, "open"),
    ));
    return { ok: true, closePrice: lastPrice, pnl };
  }),

  // 交易记录 + 统计
  records: publicQuery.input(z.object({ clientId: cid })).query(async ({ ctx }) => {
    const db = getDb();
    const { owner, userId } = ownerOf(ctx);
    const a = await ensureAccount(owner, userId);
    const trades = await db.select().from(paperTrades)
      .where(eq(paperTrades.clientId, owner))
      .orderBy(desc(paperTrades.id));
    const view = await buildAccountView(owner, userId);
    const floating = view.position?.floatingPnl ?? 0;
    const stats = computeStats(a.initialCapital, a.cash, floating, trades);
    return {
      trades: trades.map((t) => {
        const v = varietyOf(t.symbol);
        return {
          id: t.id, symbol: t.symbol, name: v?.name ?? t.symbol,
          direction: t.direction as "long" | "short",
          openPrice: t.openPrice, closePrice: t.closePrice, lots: t.lots,
          stopLoss: t.stopLoss, pnl: t.pnl,
          openTime: t.openTime ? new Date(t.openTime).toISOString() : "",
          closeTime: t.closeTime ? new Date(t.closeTime).toISOString() : null,
          status: t.status as "open" | "closed",
        };
      }),
      stats,
    };
  }),
});
