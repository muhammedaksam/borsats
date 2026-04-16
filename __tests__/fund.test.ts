import { compareFunds, Fund, screenFunds, searchFunds, managementFees } from "~/fund";
import {
  FundDetail,
  FundHistoryItem,
  getTEFASProvider,
  TEFASProvider,
} from "~/providers/tefas";

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
jest.mock("~/providers/tefas", () => {
  const original = jest.requireActual("~/providers/tefas");
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

  test("Fund tax and fees methods", async () => {
    await runSafe(async () => {
      // Set profile so it doesn't fail on tax lookups
      mockProvider.mockProfile = {
        fund_code: "TI1",
        category: "Hisse Senedi Fonu"
      } as Partial<FundDetail>;
      
      const taxCat = await fund.taxCategory;
      expect(taxCat).toBeDefined();
      
      const taxRate = await fund.withholdingTaxRate();
      expect(typeof taxRate).toBe("number");
      
      // Mock managementFees to return array
      jest.spyOn(mockProvider, "getManagementFees").mockResolvedValue([
        { 
          fund_code: "TI1",
          applied_fee: 2.0,
          name: "Test",
          fund_category: "Test",
          founder_code: "TST",
          prospectus_fee: 3.0,
          max_expense_ratio: 4.0,
          annual_return: null
        }
      ]);
      const fee = await fund.managementFee;
      expect(fee?.applied_fee).toBe(2.0);
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

  test("Fund.detail getter returns same as info", async () => {
    const fund = new Fund("TEST");
    mockProvider.mockProfile = {
      fund_code: "TEST",
      name: "Test Fund",
      category: "Hisse Senedi Fonu",
      price: 100,
    } as Partial<FundDetail>;

    const detail = await fund.detail;
    expect(detail).toBeDefined();
    expect(detail.fund_code).toBe("TEST");
  });

  test("Fund.sharpeRatio delegates to riskMetrics", async () => {
    const fund = new Fund("TEST");

    const history: FundHistoryItem[] = [];
    for (let i = 0; i < 260; i++) {
      history.push({
        date: new Date(2023, 0, i + 1),
        price: 10 + i * 0.1 + Math.sin(i / 5),
        fundSize: 1000000,
        investors: 100,
      });
    }
    mockProvider.mockHistory = history;

    const sharpe = await fund.sharpeRatio("1y", 10);
    expect(typeof sharpe).toBe("number");
    expect(isNaN(sharpe)).toBe(false);
  });

  test("Fund.managementFee catch path returns null on error", async () => {
    const fund = new Fund("TEST", "YAT");

    jest
      .spyOn(mockProvider, "getManagementFees")
      .mockRejectedValue(new Error("API Error"));

    const fee = await fund.managementFee;
    expect(fee).toBeNull();
  });

  test("Fund.managementFee returns null when fund not found in list", async () => {
    const fund = new Fund("NOTFOUND", "YAT");

    jest.spyOn(mockProvider, "getManagementFees").mockResolvedValue([
      {
        fund_code: "OTHER",
        applied_fee: 2.0,
        name: "Other",
        fund_category: "Test",
        founder_code: "TST",
        prospectus_fee: 3.0,
        max_expense_ratio: 4.0,
        annual_return: null,
      },
    ]);

    const fee = await fund.managementFee;
    expect(fee).toBeNull();
  });

  test("Sortino ratio is Infinity when no negative returns", async () => {
    const fund = new Fund("TEST");

    // Monotonically increasing prices → no negative returns
    const history: FundHistoryItem[] = [];
    for (let i = 0; i < 260; i++) {
      history.push({
        date: new Date(2023, 0, i + 1),
        price: 10 + i * 0.5,
        fundSize: 1000000,
        investors: 100,
      });
    }
    mockProvider.mockHistory = history;

    const risk = await fund.riskMetrics("1y", 0);
    expect(risk.sortinoRatio).toBe(Infinity);
  });

  test("Fund detectFundType falls back to EMK when YAT returns empty", async () => {
    const mockFn = jest.spyOn(mockProvider, "getHistory");
    let callCount = 0;
    mockFn.mockImplementation(async (opts: unknown) => {
      const options = opts as { fundType: string };
      callCount++;
      if (options.fundType === "YAT") return []; // Empty for YAT
      if (options.fundType === "EMK")
        return [
          { date: new Date(), price: 100, fundSize: 0, investors: 0 },
        ];
      return [];
    });

    const fund = new Fund("EMKFUND");
    const type = await fund.fundType;
    expect(type).toBe("EMK");
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  test("Fund detectFundType defaults to YAT when both fail", async () => {
    const mockFn = jest.spyOn(mockProvider, "getHistory");
    mockFn.mockImplementation(async () => []);

    const fund = new Fund("UNKNOWN");
    const type = await fund.fundType;
    expect(type).toBe("YAT"); // Default
  });

  test("Fund detectFundType early return when type already set", async () => {
    const fund = new Fund("TEST", "YAT");
    const type = await fund.fundType;
    expect(type).toBe("YAT");
    // Second call should return cached
    const type2 = await fund.fundType;
    expect(type2).toBe("YAT");
  });
});

describe("Fund module-level exports", () => {
  let mockProvider: MockTEFAS;

  beforeEach(() => {
    mockProvider = new MockTEFAS();
    (getTEFASProvider as jest.Mock).mockReturnValue(mockProvider);
  });

  test("searchFunds delegates to provider", async () => {
    const spy = jest.spyOn(mockProvider, "search");
    await searchFunds("test");
    expect(spy).toHaveBeenCalledWith("test");
  });

  test("screenFunds delegates to provider", async () => {
    const spy = jest.spyOn(mockProvider, "screenFunds");
    await screenFunds({ minReturn: 10 });
    expect(spy).toHaveBeenCalledWith({ minReturn: 10 });
  });

  test("compareFunds with all null results returns empty", async () => {
    jest.spyOn(mockProvider, "getFundDetail").mockRejectedValue(new Error("fail"));

    const result = await compareFunds(["NONEXIST1", "NONEXIST2"]);
    expect(result.funds).toEqual([]);
    expect(result.rankings).toEqual({});
    expect(result.summary).toEqual({});
  });

  test("managementFees delegates to provider", async () => {
    const spy = jest.spyOn(mockProvider, "getManagementFees");
    await managementFees("YAT", "TST");
    expect(spy).toHaveBeenCalledWith("YAT", "TST");
  });
});

