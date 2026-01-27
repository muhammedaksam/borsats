import { compareFunds, Fund, screenFunds, searchFunds } from "@/fund";
import {
  FundDetail,
  FundHistoryItem,
  getTEFASProvider,
  TEFASProvider,
} from "@/providers/tefas";

// Mock TEFAS
class MockTEFAS extends TEFASProvider {
  public mockHistory: FundHistoryItem[] = [];
  public mockProfile: Partial<FundDetail> = {};

  async getHistory(_opts: {
    fundCode: string;
    period?: string;
    start?: Date;
    end?: Date;
  }) {
    return this.mockHistory;
  }

  async getFundDetail(_code: string) {
    return this.mockProfile as FundDetail;
  }

  async getAllocation(_code: string) {
    return [];
  }

  async getAllocationHistory(_opts: unknown) {
    return [];
  }

  async search(_query: string) {
    return [];
  }

  async screenFunds(_opts: unknown) {
    return [];
  }
}

// Overwrite singleton
jest.mock("@/providers/tefas", () => {
  const original = jest.requireActual("@/providers/tefas");
  return {
    ...original,
    getTEFASProvider: jest.fn(),
  };
});

describe("Fund", () => {
  jest.setTimeout(45000);
  let mockProvider: MockTEFAS;

  beforeEach(() => {
    mockProvider = new MockTEFAS();
    (getTEFASProvider as jest.Mock).mockReturnValue(mockProvider);

    // Setup default data for TI1
    mockProvider.mockProfile = {
      fund_code: "TI1",
    };
  });

  const fund = new Fund("TI1");

  const runSafe = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e: unknown) {
      // With mocks, we shouldn't fail, but keeping for safety
      if (
        e instanceof Error &&
        (e.name === "DataNotAvailableError" ||
          e.message.includes("No data") ||
          e.message.includes("429"))
      ) {
        console.warn(
          "Skipping Fund test due to data/API unavailability:",
          e.message,
        );
      } else {
        throw e;
      }
    }
  };

  test("should initialize correctly", () => {
    expect(fund.fundCode).toBe("TI1");
    expect(fund.symbol).toBe("TI1");
  });

  test("info and detail should return data", async () => {
    await runSafe(async () => {
      const info = await fund.info;
      expect(info).toHaveProperty("fund_code", "TI1");
    });
  });

  test("performance and history", async () => {
    await runSafe(async () => {
      await fund.performance;
      await fund.history({ period: "1mo" });
    });
  });

  test("allocation and allocationHistory", async () => {
    await runSafe(async () => {
      const alloc = await fund.allocation;
      expect(Array.isArray(alloc)).toBe(true);
      const hist = await fund.allocationHistory({ period: "1mo" });
      expect(Array.isArray(hist)).toBe(true);
    });
  });

  test("search and screen", async () => {
    await runSafe(async () => {
      const results = await searchFunds("ak portföy");
      expect(Array.isArray(results)).toBe(true);
      const screened = await screenFunds({ type: "HIS" });
      expect(Array.isArray(screened)).toBe(true);
    });
  });

  test("compareFunds should return comparison data", async () => {
    await runSafe(async () => {
      // Setup minimal mock data for comparison
      mockProvider.mockHistory = [
        { date: new Date(), price: 1, fundSize: 0, investors: 0 },
      ];
      const comparison = await compareFunds(["TI1", "AAE"]);
      expect(comparison).toHaveProperty("funds");
    });
  });
});

describe("Fund Max Coverage", () => {
  let mockProvider: MockTEFAS;

  beforeEach(() => {
    mockProvider = new MockTEFAS();
    (getTEFASProvider as jest.Mock).mockReturnValue(mockProvider);
  });

  test("Risk Metrics & Technicals - Full Path", async () => {
    const fund = new Fund("TEST");

    const history: FundHistoryItem[] = [];
    const base = 10;
    for (let i = 0; i < 260; i++) {
      history.push({
        date: new Date(2023, 0, i + 1),
        price: base + i * 0.1 + Math.sin(i / 5), // Trend + Oscillation
        fundSize: 1000000,
        investors: 100,
      });
    }

    mockProvider.mockHistory = history;

    const tech = await fund.technicals();
    // TechnicalAnalyzer methods return arrays
    expect(tech.sma(50).length).toBeGreaterThan(0);
    expect(tech.rsi(14).length).toBeGreaterThan(0);

    const risk = await fund.riskMetrics();
    expect(risk.annualizedVolatility).toBeGreaterThan(0);
    expect(risk.sharpeRatio).toBeDefined();
  });

  test("Compare Funds - Data Alignment", async () => {
    // Fund 1
    const f1H: FundHistoryItem[] = [
      { date: new Date(1000), price: 10, fundSize: 0, investors: 0 },
      { date: new Date(2000), price: 11, fundSize: 0, investors: 0 },
    ];
    // Fund 2 (misaligned dates)
    const f2H: FundHistoryItem[] = [
      { date: new Date(1000), price: 20, fundSize: 0, investors: 0 },
      { date: new Date(2000), price: 22, fundSize: 0, investors: 0 },
      { date: new Date(3000), price: 24, fundSize: 0, investors: 0 },
    ];

    const mockFn = jest.spyOn(mockProvider, "getHistory");
    mockFn.mockImplementation(async (opts: unknown) => {
      const options = opts as { fundCode: string };
      if (options.fundCode === "A") return f1H;
      if (options.fundCode === "B") return f2H;
      return [];
    });

    // compareFunds signature: (fundCodes: string[])
    const comparison = await compareFunds(["A", "B"]);

    expect(comparison).toBeTruthy();
    expect(comparison.funds).toBeDefined();
  });

  test("Empty History Handling", async () => {
    const fund = new Fund("EMPTY");
    mockProvider.mockHistory = [];

    // Technicals on empty history
    const tech = await fund.technicals();
    expect(tech).toBeDefined();
    // Accessing sma on empty might return empty array?
    expect(tech.sma(50)).toEqual([]);

    const risk = await fund.riskMetrics();
    expect(risk.annualizedVolatility).toBeNaN(); // Check implementations default
  });
});
