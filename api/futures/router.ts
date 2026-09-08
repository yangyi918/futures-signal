import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { VARIETIES, type TradeInput } from "@contracts/futures";
import { evaluateSignal } from "./signal";
import { getDb } from "../queries/connection";
import { userInputs } from "../../db/schema";
import { eq } from "drizzle-orm";

const tradeInputSchema = z.object({
  variety: z.string().min(1).max(16),
  contract: z.string().min(2).max(32),
  price: z.number().positive(),
  lots: z.number().int().positive().max(100000),
  capital: z.number().positive(),
  stopLoss: z.number().positive().nullish(),
  holding: z.enum(["none", "long", "short"]),
});

export const futuresRouter = createRouter({
  // 品种列表（含合约乘数）
  varieties: publicQuery.query(() => VARIETIES),

  // 实时评估信号：拉取真实15分钟K线，计算200均线并按规则1-4裁决
  signal: publicQuery.input(tradeInputSchema).query(async ({ input }) => {
    const variety = VARIETIES.find(
      (v) => v.code === input.variety.toUpperCase(),
    );
    if (!variety) throw new Error(`不支持的品种代码：${input.variety}`);
    return evaluateSignal(input as TradeInput, variety);
  }),

  // 保存最近一次输入（按浏览器 clientId）
  saveInput: publicQuery
    .input(z.object({ clientId: z.string().min(8).max(64), data: tradeInputSchema }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const row = {
        clientId: input.clientId,
        variety: input.data.variety.toUpperCase(),
        contract: input.data.contract.toUpperCase(),
        price: input.data.price,
        lots: input.data.lots,
        capital: input.data.capital,
        stopLoss: input.data.stopLoss ?? null,
        holding: input.data.holding,
      };
      const existing = await db
        .select({ clientId: userInputs.clientId })
        .from(userInputs)
        .where(eq(userInputs.clientId, input.clientId))
        .limit(1);
      if (existing.length > 0) {
        await db.update(userInputs).set(row).where(eq(userInputs.clientId, input.clientId));
      } else {
        await db.insert(userInputs).values(row);
      }
      return { ok: true };
    }),

  // 读取上次输入
  getInput: publicQuery
    .input(z.object({ clientId: z.string().min(8).max(64) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(userInputs)
        .where(eq(userInputs.clientId, input.clientId))
        .limit(1);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        variety: r.variety,
        contract: r.contract,
        price: r.price,
        lots: r.lots,
        capital: r.capital,
        stopLoss: r.stopLoss,
        holding: r.holding as "none" | "long" | "short",
      };
    }),
});
