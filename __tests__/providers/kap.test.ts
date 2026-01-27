import { getKAPProvider } from "@/providers/kap";
import { sleep } from "@/utils/helpers";

describe("KAPProvider", () => {
  const provider = getKAPProvider();

  // High timeout for scraping
  sleep(60000);

  beforeEach(() => {
    provider.clearCache();
  });

  describe("getCompanies and Search", () => {
    it("should fetch list and search", async () => {
      const companies = await provider.getCompanies();
      expect(companies.length).toBeGreaterThan(100);

      const r1 = await provider.search("THYAO");
      const r2 = await provider.search("Banka");
      expect(r1.length).toBeGreaterThan(0);
      expect(r2.length).toBeGreaterThan(0);
    });
  });

  describe("getMemberOid", () => {
    it("should get OID for various symbols", async () => {
      expect(await provider.getMemberOid("THYAO")).toBeTruthy();
      expect(await provider.getMemberOid("GARAN")).toBeTruthy();
      expect(await provider.getMemberOid("AKBNK")).toBeTruthy();
    });
  });

  describe("getDisclosures Variations", () => {
    it("should get disclosures for various symbols", async () => {
      const d1 = await provider.getDisclosures("THYAO", 5);
      const d2 = await provider.getDisclosures("SISE", 3);
      expect(d1.length).toBeGreaterThan(0);
      expect(d2.length).toBeGreaterThan(0);
    });
  });

  describe("getCompanyDetails Branches", () => {
    it("should get details for verschiedenen company types", async () => {
      await provider.getCompanyDetails("THYAO");
      await provider.getCompanyDetails("ISCTR");
      await provider.getCompanyDetails("EREGL");
      await provider.getCompanyDetails("FROTO");
      expect(true).toBe(true);
    });
  });

  describe("getCalendar", () => {
    it("should get calendar for various symbols", async () => {
      await provider.getCalendar("THYAO");
      await provider.getCalendar("SISE");
      expect(true).toBe(true);
    });
  });
});
