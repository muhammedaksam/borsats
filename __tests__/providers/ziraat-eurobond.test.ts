import {
  Eurobond,
  getEurobondProvider,
  ZiraatEurobondProvider,
} from "~/providers/ziraat-eurobond";

// Helper type for accessing private methods
type ProviderInternals = {
  parseTurkishNumber: (s: string) => number | null;
  parseDate: (s: string) => Date | null;
  hasValidYields: (bonds: Eurobond[]) => boolean;
};

describe("ZiraatEurobondProvider", () => {
  let provider: ZiraatEurobondProvider;

  beforeEach(() => {
    provider = new ZiraatEurobondProvider();
  });

  describe("parseTurkishNumber", () => {
    const getParseFn = (p: ZiraatEurobondProvider) =>
      (p as unknown as ProviderInternals).parseTurkishNumber.bind(p);

    test("parses comma decimal format", () => {
      const parse = getParseFn(provider);
      expect(parse("95,50")).toBe(95.5);
    });

    test("parses integer format", () => {
      const parse = getParseFn(provider);
      expect(parse("100")).toBe(100);
    });

    test("parses decimal format", () => {
      const parse = getParseFn(provider);
      expect(parse("100,00")).toBe(100);
    });

    test("returns null for dash", () => {
      const parse = getParseFn(provider);
      expect(parse("-")).toBeNull();
    });

    test("returns null for empty string", () => {
      const parse = getParseFn(provider);
      expect(parse("")).toBeNull();
    });

    test("returns null for whitespace", () => {
      const parse = getParseFn(provider);
      expect(parse("   ")).toBeNull();
    });

    test("handles whitespace around numbers", () => {
      const parse = getParseFn(provider);
      expect(parse("  95,50  ")).toBe(95.5);
    });

    test("handles negative numbers", () => {
      const parse = getParseFn(provider);
      expect(parse("-5,25")).toBe(-5.25);
    });
  });

  describe("parseDate", () => {
    const getParseFn = (p: ZiraatEurobondProvider) =>
      (p as unknown as ProviderInternals).parseDate.bind(p);

    test("parses DD.MM.YYYY format", () => {
      const parse = getParseFn(provider);
      const date = parse("15.01.2030");
      expect(date).toBeInstanceOf(Date);
      expect(date!.getFullYear()).toBe(2030);
      expect(date!.getMonth()).toBe(0); // January
      expect(date!.getDate()).toBe(15);
    });

    test("parses end of month dates", () => {
      const parse = getParseFn(provider);
      const date = parse("28.02.2025");
      expect(date!.getFullYear()).toBe(2025);
      expect(date!.getMonth()).toBe(1); // February
      expect(date!.getDate()).toBe(28);
    });

    test("returns null for empty string", () => {
      const parse = getParseFn(provider);
      expect(parse("")).toBeNull();
    });

    test("returns null for whitespace", () => {
      const parse = getParseFn(provider);
      expect(parse("   ")).toBeNull();
    });

    test("returns null for invalid format", () => {
      const parse = getParseFn(provider);
      expect(parse("2030-01-15")).toBeNull();
    });

    test("returns null for incomplete date", () => {
      const parse = getParseFn(provider);
      expect(parse("15.01")).toBeNull();
    });
  });

  describe("hasValidYields", () => {
    const getCheckFn = (p: ZiraatEurobondProvider) =>
      (p as unknown as ProviderInternals).hasValidYields.bind(p);

    test("returns true when bonds have valid yields", () => {
      const check = getCheckFn(provider);
      const bonds: Eurobond[] = [
        {
          isin: "US900123AL40",
          maturity: new Date(),
          daysToMaturity: 100,
          currency: "USD",
          bidPrice: 95,
          bidYield: 5.5,
          askPrice: 96,
          askYield: 5.4,
        },
      ];
      expect(check(bonds)).toBe(true);
    });

    test("returns true when only bidYield is valid", () => {
      const check = getCheckFn(provider);
      const bonds: Eurobond[] = [
        {
          isin: "US900123AL40",
          maturity: new Date(),
          daysToMaturity: 100,
          currency: "USD",
          bidPrice: 95,
          bidYield: 5.5,
          askPrice: null,
          askYield: null,
        },
      ];
      expect(check(bonds)).toBe(true);
    });

    test("returns true when only askYield is valid", () => {
      const check = getCheckFn(provider);
      const bonds: Eurobond[] = [
        {
          isin: "US900123AL40",
          maturity: new Date(),
          daysToMaturity: 100,
          currency: "USD",
          bidPrice: null,
          bidYield: null,
          askPrice: 96,
          askYield: 5.4,
        },
      ];
      expect(check(bonds)).toBe(true);
    });

    test("returns false when no yields", () => {
      const check = getCheckFn(provider);
      const bonds: Eurobond[] = [
        {
          isin: "US900123AL40",
          maturity: new Date(),
          daysToMaturity: 100,
          currency: "USD",
          bidPrice: 95,
          bidYield: null,
          askPrice: 96,
          askYield: null,
        },
      ];
      expect(check(bonds)).toBe(false);
    });

    test("returns false for empty array", () => {
      const check = getCheckFn(provider);
      expect(check([])).toBe(false);
    });

    test("returns false when yields are 0", () => {
      const check = getCheckFn(provider);
      const bonds: Eurobond[] = [
        {
          isin: "US900123AL40",
          maturity: new Date(),
          daysToMaturity: 100,
          currency: "USD",
          bidPrice: 95,
          bidYield: 0,
          askPrice: 96,
          askYield: 0,
        },
      ];
      expect(check(bonds)).toBe(false);
    });
  });
});

describe("getEurobondProvider singleton", () => {
  test("returns same instance", () => {
    const p1 = getEurobondProvider();
    const p2 = getEurobondProvider();
    expect(p1).toBe(p2);
  });

  test("is ZiraatEurobondProvider instance", () => {
    const p = getEurobondProvider();
    expect(p).toBeInstanceOf(ZiraatEurobondProvider);
  });
});

describe("Eurobond interface", () => {
  test("has correct structure", () => {
    const bond: Eurobond = {
      isin: "US900123AL40",
      maturity: new Date("2030-01-15"),
      daysToMaturity: 1825,
      currency: "USD",
      bidPrice: 95.5,
      bidYield: 6.25,
      askPrice: 96.0,
      askYield: 6.15,
    };

    expect(bond.isin).toBe("US900123AL40");
    expect(bond.maturity).toBeInstanceOf(Date);
    expect(typeof bond.daysToMaturity).toBe("number");
    expect(bond.currency).toBe("USD");
    expect(typeof bond.bidPrice).toBe("number");
    expect(typeof bond.bidYield).toBe("number");
  });

  test("allows null values", () => {
    const bond: Eurobond = {
      isin: "US900123AL40",
      maturity: null,
      daysToMaturity: 0,
      currency: "USD",
      bidPrice: null,
      bidYield: null,
      askPrice: null,
      askYield: null,
    };

    expect(bond.maturity).toBeNull();
    expect(bond.bidPrice).toBeNull();
  });
});

// Integration tests - these hit the real API
describe("ZiraatEurobondProvider Integration", () => {
  let provider: ZiraatEurobondProvider;

  beforeEach(() => {
    provider = new ZiraatEurobondProvider();
  });

  test("getEurobonds fetches real data", async () => {
    const bonds = await provider.getEurobonds();
    // API may return empty on weekends but shouldn't throw
    expect(Array.isArray(bonds)).toBe(true);

    if (bonds.length > 0) {
      const bond = bonds[0];
      expect(bond).toHaveProperty("isin");
      expect(bond).toHaveProperty("maturity");
      expect(bond).toHaveProperty("daysToMaturity");
      expect(bond).toHaveProperty("currency");
      expect(bond).toHaveProperty("bidPrice");
      expect(bond).toHaveProperty("bidYield");
      expect(bond).toHaveProperty("askPrice");
      expect(bond).toHaveProperty("askYield");

      // Validate types
      expect(typeof bond.isin).toBe("string");
      expect(typeof bond.currency).toBe("string");
      expect(typeof bond.daysToMaturity).toBe("number");
    }
  }, 30000);

  test("getEurobonds filters by USD currency", async () => {
    const bonds = await provider.getEurobonds("USD");
    expect(Array.isArray(bonds)).toBe(true);
    bonds.forEach((bond) => {
      expect(bond.currency).toBe("USD");
    });
  }, 30000);

  test("getEurobonds filters by EUR currency", async () => {
    const bonds = await provider.getEurobonds("EUR");
    expect(Array.isArray(bonds)).toBe(true);
    bonds.forEach((bond) => {
      expect(bond.currency).toBe("EUR");
    });
  }, 15000);

  test("getEurobonds uses cache on second call", async () => {
    // First call fetches
    const bonds1 = await provider.getEurobonds();
    // Second call should use cache (faster)
    const start = Date.now();
    const bonds2 = await provider.getEurobonds();
    const elapsed = Date.now() - start;

    expect(bonds2).toEqual(bonds1);
    // Cache should return in <100ms
    expect(elapsed).toBeLessThan(100);
  }, 20000);

  test("getEurobond returns specific bond by ISIN", async () => {
    const bonds = await provider.getEurobonds();

    if (bonds.length > 0) {
      const targetIsin = bonds[0].isin;
      const bond = await provider.getEurobond(targetIsin);
      expect(bond).not.toBeNull();
      expect(bond!.isin).toBe(targetIsin);
    }
  }, 15000);

  test("getEurobond returns null for unknown ISIN", async () => {
    const bond = await provider.getEurobond("NONEXISTENT123");
    expect(bond).toBeNull();
  }, 15000);

  test("getEurobond handles case-insensitive ISIN", async () => {
    const bonds = await provider.getEurobonds();

    if (bonds.length > 0) {
      const targetIsin = bonds[0].isin.toLowerCase();
      const bond = await provider.getEurobond(targetIsin);
      expect(bond).not.toBeNull();
    }
  }, 15000);
});
