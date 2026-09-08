// 国内期货品种元数据（合约乘数，单位：每手多少"点"的价值倍数）
// multiplier = 合约乘数，如 螺纹钢 10吨/手 即价格每变动1点，每手盈亏变动10元
export interface Variety {
  code: string;        // 品种代码（大写）
  name: string;        // 中文名
  exchange: string;    // 交易所
  multiplier: number;  // 合约乘数
  example: string;     // 示例合约
}

export const VARIETIES: Variety[] = [
  // 上期所 SHFE
  { code: "CU", name: "沪铜", exchange: "上期所", multiplier: 5, example: "CU2511" },
  { code: "AL", name: "沪铝", exchange: "上期所", multiplier: 5, example: "AL2511" },
  { code: "ZN", name: "沪锌", exchange: "上期所", multiplier: 5, example: "ZN2511" },
  { code: "PB", name: "沪铅", exchange: "上期所", multiplier: 5, example: "PB2511" },
  { code: "NI", name: "沪镍", exchange: "上期所", multiplier: 1, example: "NI2511" },
  { code: "SN", name: "沪锡", exchange: "上期所", multiplier: 1, example: "SN2511" },
  { code: "AU", name: "黄金", exchange: "上期所", multiplier: 1000, example: "AU2512" },
  { code: "AG", name: "白银", exchange: "上期所", multiplier: 15, example: "AG2512" },
  { code: "RB", name: "螺纹钢", exchange: "上期所", multiplier: 10, example: "RB2601" },
  { code: "HC", name: "热卷", exchange: "上期所", multiplier: 10, example: "HC2601" },
  { code: "SS", name: "不锈钢", exchange: "上期所", multiplier: 5, example: "SS2511" },
  { code: "BU", name: "沥青", exchange: "上期所", multiplier: 10, example: "BU2512" },
  { code: "RU", name: "橡胶", exchange: "上期所", multiplier: 10, example: "RU2601" },
  { code: "FU", name: "燃油", exchange: "上期所", multiplier: 10, example: "FU2601" },
  { code: "SP", name: "纸浆", exchange: "上期所", multiplier: 10, example: "SP2601" },
  { code: "WR", name: "线材", exchange: "上期所", multiplier: 10, example: "WR2601" },
  // 能源中心 INE
  { code: "SC", name: "原油", exchange: "能源中心", multiplier: 1000, example: "SC2511" },
  { code: "LU", name: "低硫燃油", exchange: "能源中心", multiplier: 10, example: "LU2512" },
  { code: "NR", name: "20号胶", exchange: "能源中心", multiplier: 10, example: "NR2512" },
  { code: "BC", name: "国际铜", exchange: "能源中心", multiplier: 5, example: "BC2511" },
  // 大商所 DCE
  { code: "M", name: "豆粕", exchange: "大商所", multiplier: 10, example: "M2601" },
  { code: "Y", name: "豆油", exchange: "大商所", multiplier: 10, example: "Y2601" },
  { code: "P", name: "棕榈油", exchange: "大商所", multiplier: 10, example: "P2601" },
  { code: "A", name: "豆一", exchange: "大商所", multiplier: 10, example: "A2601" },
  { code: "B", name: "豆二", exchange: "大商所", multiplier: 10, example: "B2511" },
  { code: "C", name: "玉米", exchange: "大商所", multiplier: 10, example: "C2601" },
  { code: "CS", name: "玉米淀粉", exchange: "大商所", multiplier: 10, example: "CS2601" },
  { code: "J", name: "焦炭", exchange: "大商所", multiplier: 100, example: "J2601" },
  { code: "JM", name: "焦煤", exchange: "大商所", multiplier: 60, example: "JM2601" },
  { code: "I", name: "铁矿石", exchange: "大商所", multiplier: 100, example: "I2601" },
  { code: "PP", name: "聚丙烯", exchange: "大商所", multiplier: 5, example: "PP2601" },
  { code: "L", name: "塑料", exchange: "大商所", multiplier: 5, example: "L2601" },
  { code: "V", name: "PVC", exchange: "大商所", multiplier: 5, example: "V2601" },
  { code: "EG", name: "乙二醇", exchange: "大商所", multiplier: 10, example: "EG2601" },
  { code: "EB", name: "苯乙烯", exchange: "大商所", multiplier: 5, example: "EB2511" },
  { code: "PG", name: "液化石油气", exchange: "大商所", multiplier: 20, example: "PG2511" },
  { code: "LH", name: "生猪", exchange: "大商所", multiplier: 16, example: "LH2601" },
  { code: "RR", name: "粳米", exchange: "大商所", multiplier: 10, example: "RR2512" },
  { code: "JD", name: "鸡蛋", exchange: "大商所", multiplier: 10, example: "JD2511" },
  // 郑商所 CZCE
  { code: "SR", name: "白糖", exchange: "郑商所", multiplier: 10, example: "SR601" },
  { code: "CF", name: "棉花", exchange: "郑商所", multiplier: 5, example: "CF601" },
  { code: "TA", name: "PTA", exchange: "郑商所", multiplier: 5, example: "TA601" },
  { code: "MA", name: "甲醇", exchange: "郑商所", multiplier: 10, example: "MA601" },
  { code: "FG", name: "玻璃", exchange: "郑商所", multiplier: 20, example: "FG601" },
  { code: "OI", name: "菜油", exchange: "郑商所", multiplier: 10, example: "OI601" },
  { code: "RM", name: "菜粕", exchange: "郑商所", multiplier: 10, example: "RM601" },
  { code: "AP", name: "苹果", exchange: "郑商所", multiplier: 10, example: "AP601" },
  { code: "CJ", name: "红枣", exchange: "郑商所", multiplier: 5, example: "CJ601" },
  { code: "UR", name: "尿素", exchange: "郑商所", multiplier: 20, example: "UR601" },
  { code: "SA", name: "纯碱", exchange: "郑商所", multiplier: 20, example: "SA601" },
  { code: "PF", name: "短纤", exchange: "郑商所", multiplier: 5, example: "PF512" },
  { code: "PK", name: "花生", exchange: "郑商所", multiplier: 5, example: "PK511" },
  { code: "SM", name: "锰硅", exchange: "郑商所", multiplier: 5, example: "SM601" },
  { code: "SF", name: "硅铁", exchange: "郑商所", multiplier: 5, example: "SF601" },
  // 广期所 GFEX
  { code: "SI", name: "工业硅", exchange: "广期所", multiplier: 5, example: "SI2511" },
  { code: "LC", name: "碳酸锂", exchange: "广期所", multiplier: 1, example: "LC2511" },
  { code: "PS", name: "多晶硅", exchange: "广期所", multiplier: 3, example: "PS2511" },
];

export interface TradeInput {
  variety: string;      // 品种代码
  contract: string;     // 合约，如 RB2601
  price: number;        // 计划开仓价
  lots: number;         // 手数
  capital: number;      // 账户总资金（元）
  stopLoss?: number | null; // 计划止损价（可选）
  holding: "none" | "long" | "short"; // 当前该品种持仓方向
}

export interface RuleCheck {
  rule: number;
  name: string;
  pass: boolean;
  blocking: boolean; // 是否构成硬性禁止
  detail: string;
}

export interface SignalResult {
  contract: string;
  varietyName: string;
  multiplier: number;
  lastPrice: number;
  prevClose: number;
  change: number;
  changePct: number;
  ma200: number;
  trend: "up" | "down";
  lastCandle: { time: string; open: number; close: number; bullish: boolean };
  candleCount: number;
  rules: RuleCheck[];
  longVerdict: { allowed: boolean; reasons: string[] };
  shortVerdict: { allowed: boolean; reasons: string[] };
  risk: {
    maxLossPerOrder: number;     // 账户5%资金
    maxStopDistance: number;     // 每点可承受最大止损距离
    suggestedLongStop: number;   // 建议多头止损价
    suggestedShortStop: number;  // 建议空头止损价
    plannedLoss: number | null;  // 按计划止损价的亏损金额
    plannedLossPct: number | null;
  };
  updatedAt: string; // 行情时间
  serverTime: string;
  // 图表数据：最近N根15分钟K线与对应MA200
  chart: {
    bars: { t: string; o: number; h: number; l: number; c: number; v: number }[];
    ma: (number | null)[]; // 与 bars 等长
  };
}
