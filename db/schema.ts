import {
  mysqlTable,
  varchar,
  int,
  double,
  timestamp,
  mysqlEnum,
  serial,
  text,
  bigint,
} from "drizzle-orm/mysql-core";

// 每个浏览器客户端的最近一次输入（clientId 存于前端 localStorage）
export const userInputs = mysqlTable("user_inputs", {
  clientId: varchar("client_id", { length: 64 }).primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }),
  variety: varchar("variety", { length: 16 }).notNull().default("RB"),
  contract: varchar("contract", { length: 32 }).notNull().default(""),
  price: double("price").notNull().default(0),
  lots: int("lots").notNull().default(1),
  capital: double("capital").notNull().default(100000),
  stopLoss: double("stop_loss"),
  holding: varchar("holding", { length: 8 }).notNull().default("none"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// 品种池（监控自选合约，symbol 为主连代码如 RB0）
export const watchlist = mysqlTable("watchlist", {
  id: int("id").primaryKey().autoincrement(),
  clientId: varchar("client_id", { length: 64 }).notNull(),
  userId: bigint("user_id", { mode: "number", unsigned: true }),
  symbol: varchar("symbol", { length: 16 }).notNull(), // 如 RB0
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 模拟账户（每个客户端一个）
export const paperAccounts = mysqlTable("paper_accounts", {
  clientId: varchar("client_id", { length: 64 }).primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }),
  initialCapital: double("initial_capital").notNull().default(100000),
  cash: double("cash").notNull().default(100000),
  // 当前持仓（规则1：最多1个品种、1手）
  posSymbol: varchar("pos_symbol", { length: 16 }),
  posDirection: varchar("pos_direction", { length: 8 }), // long / short
  posPrice: double("pos_price"),
  posLots: int("pos_lots"),
  posStopLoss: double("pos_stop_loss"),
  posOpenTime: timestamp("pos_open_time"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// 交易记录
export const paperTrades = mysqlTable("paper_trades", {
  id: int("id").primaryKey().autoincrement(),
  clientId: varchar("client_id", { length: 64 }).notNull(),
  userId: bigint("user_id", { mode: "number", unsigned: true }),
  symbol: varchar("symbol", { length: 16 }).notNull(),
  direction: varchar("direction", { length: 8 }).notNull(), // long / short
  openPrice: double("open_price").notNull(),
  closePrice: double("close_price"),
  lots: int("lots").notNull().default(1),
  stopLoss: double("stop_loss"),
  pnl: double("pnl"), // 平仓盈亏（元）
  openTime: timestamp("open_time").notNull().defaultNow(),
  closeTime: timestamp("close_time"),
  status: varchar("status", { length: 8 }).notNull().default("open"), // open / closed
});

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
