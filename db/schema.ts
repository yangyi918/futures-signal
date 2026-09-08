import { mysqlTable, varchar, int, double, timestamp } from "drizzle-orm/mysql-core";

// 每个浏览器客户端的最近一次输入（clientId 存于前端 localStorage）
export const userInputs = mysqlTable("user_inputs", {
  clientId: varchar("client_id", { length: 64 }).primaryKey(),
  variety: varchar("variety", { length: 16 }).notNull().default("RB"),
  contract: varchar("contract", { length: 32 }).notNull().default(""),
  price: double("price").notNull().default(0),
  lots: int("lots").notNull().default(1),
  capital: double("capital").notNull().default(100000),
  stopLoss: double("stop_loss"),
  holding: varchar("holding", { length: 8 }).notNull().default("none"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
