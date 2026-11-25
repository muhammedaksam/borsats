import { Eurobond, eurobonds, getEurobondProvider } from "~/eurobond";

describe("ZiraatEurobondProvider", () => {
  const provider = getEurobondProvider();

  jest.setTimeout(15000);

  describe("getEurobonds", () => {
    it("should fetch all eurobonds", async () => {
      const bonds = await provider.getEurobonds();

      expect(Array.isArray(bonds)).toBe(true);
      expect(bonds.length).toBeGreaterThan(0);

      // Check structure
      if (bonds.length > 0) {
        const bond = bonds[0];
        expect(bond).toHaveProperty("isin");
        expect(bond).toHaveProperty("currency");
        expect(bond).toHaveProperty("bidPrice");
        expect(bond).toHaveProperty("bidYield");
        expect(typeof bond.isin).toBe("string");
      }
    });

    it("should filter by USD currency", async () => {
      const bonds = await provider.getEurobonds("USD");

      expect(Array.isArray(bonds)).toBe(true);
      bonds.forEach((bond) => {
        expect(bond.currency).toBe("USD");
      });
    });

    it("should filter by EUR currency", async () => {
      const bonds = await provider.getEurobonds("EUR");

      expect(Array.isArray(bonds)).toBe(true);
      bonds.forEach((bond) => {
        expect(bond.currency).toBe("EUR");
      });
    });

    it("should return cached results on subsequent calls", async () => {
      // First call populates cache
      const bonds1 = await provider.getEurobonds();
      // Second call should use cache
      const bonds2 = await provider.getEurobonds();

      expect(bonds1.length).toBe(bonds2.length);
    });
  });

  describe("getEurobond", () => {
    it("should fetch single eurobond by ISIN", async () => {
      // First get all bonds to find a valid ISIN
      const allBonds = await provider.getEurobonds();
      expect(allBonds.length).toBeGreaterThan(0);

      const testIsin = allBonds[0].isin;
      const bond = await provider.getEurobond(testIsin);

      expect(bond).toBeDefined();
      expect(bond?.isin).toBe(testIsin);
    });

    it("should return null for non-existent ISIN", async () => {
      const bond = await provider.getEurobond("NONEXISTENT123");

      expect(bond).toBeNull();
    });

    it("should handle case-insensitive ISIN", async () => {
      const allBonds = await provider.getEurobonds();
      if (allBonds.length > 0) {
        const testIsin = allBonds[0].isin.toLowerCase();
        const bond = await provider.getEurobond(testIsin);
        expect(bond).toBeDefined();
      }
    });
  });
});

describe("Eurobond class", () => {
  jest.setTimeout(15000);

  it("should create instance with ISIN", () => {
    const bond = new Eurobond("US900123DG28");
    expect(bond.isin).toBe("US900123DG28");
  });

  it("should get yield rate", async () => {
    // First get a valid ISIN
    const allBonds = await eurobonds();
    if (allBonds.length > 0) {
      const bond = new Eurobond(allBonds[0].isin);
      const rate = await bond.yieldRate();
      expect(typeof rate).toBe("number");
    }
  });

  it("should return 0 for non-existent bond yield", async () => {
    const bond = new Eurobond("NONEXISTENT123");
    const rate = await bond.yieldRate();
    expect(rate).toBe(0);
  });

  it("should get full bond data", async () => {
    const allBonds = await eurobonds();
    if (allBonds.length > 0) {
      const bond = new Eurobond(allBonds[0].isin);
      const data = await bond.getData();
      expect(data).toBeDefined();
      expect(data?.isin).toBe(allBonds[0].isin);
    }
  });

  it("should return null for non-existent bond data", async () => {
    const bond = new Eurobond("NONEXISTENT123");
    const data = await bond.getData();
    expect(data).toBeNull();
  });
});

describe("eurobonds convenience function", () => {
  jest.setTimeout(15000);

  it("should return all eurobonds", async () => {
    const bonds = await eurobonds();
    expect(Array.isArray(bonds)).toBe(true);
    expect(bonds.length).toBeGreaterThan(0);
  });

  it("should filter by currency", async () => {
    const usdBonds = await eurobonds("USD");
    usdBonds.forEach((bond) => {
      expect(bond.currency).toBe("USD");
    });
  });
});
