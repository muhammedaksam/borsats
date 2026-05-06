import { EVDS, EVDSSeries, evdsSearch } from "~/evds";
import { EVDSProvider, getEVDSProvider } from "~/providers/evds";

jest.mock("~/providers/evds", () => {
  const actual = jest.requireActual("~/providers/evds");
  return {
    ...actual,
    getEVDSProvider: jest.fn(),
  };
});

describe("EVDS Module", () => {
  let mockProvider: Partial<EVDSProvider>;

  beforeEach(() => {
    mockProvider = {
      getCategories: jest.fn().mockResolvedValue([
        { 
          CATEGORY_ID: 1, 
          TOPIC_TITLE_TR: "Test Kategori", 
          TOPIC_TITLE_ENG: "Test Category",
          DATAGROUPS: [
            { DATAGROUP_CODE: "test_dg", DATAGROUP_TYPE: "Test DG", FREQUENCY_STR: "AYLIK" }
          ]
        }
      ]),
      getSeriesList: jest.fn().mockResolvedValue([
        { SERIE_CODE: "TP_TEST_1", SERIE_NAME: "Test Serisi 1", FREQUENCY_STR: "AYLIK" }
      ]),
      getSeriesData: jest.fn().mockResolvedValue({
        items: [
          { Tarih: "01-01-2024", TP_TEST_1: "100.5" },
          { Tarih: "01-02-2024", TP_TEST_1: "102.5" }
        ]
      }),
      findSeries: jest.fn().mockResolvedValue({
        SERIE_CODE: "TP_TEST_1",
        SERIE_NAME: "Test",
        FREQUENCY: 5,
        _datagroup: { DATAGROUP_CODE: "test_dg" },
        _category: { CATEGORY_ID: 1 }
      }),
      resolveFrequency: jest.fn().mockReturnValue(5)
    };
    
    (getEVDSProvider as jest.Mock).mockReturnValue(mockProvider);
  });

  describe("EVDS Catalogue", () => {
    it("should fetch and map categories", async () => {
      const evds = new EVDS();
      const cats = await evds.categories();
      
      expect(cats).toHaveLength(1);
      expect(cats[0].CATEGORY_ID).toBe(1);
      expect(cats[0].DATAGROUP_COUNT).toBe(1);
    });

    it("should fetch datagroups", async () => {
      const evds = new EVDS();
      const dgs = await evds.datagroups();
      
      expect(dgs).toHaveLength(1);
      expect(dgs[0].DATAGROUP_CODE).toBe("test_dg");
    });

    it("should search across catalogue", async () => {
      const results = await evdsSearch("Test");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].NAME_TR).toContain("Test");
    });
  });

  describe("EVDSSeries", () => {
    it("should return formatted history", async () => {
      const series = new EVDSSeries("TP.TEST.1");
      const history = await series.history({ period: "1y" });
      
      expect(history).toHaveLength(2);
      expect(history[0].Date).toBeInstanceOf(Date);
      expect(history[0].Value).toBe(100.5); // single series resolves to Value
    });

    it("should retrieve info", async () => {
      const series = new EVDSSeries("TP.TEST.1");
      const info = await series.info();
      
      expect(info.SERIE_CODE).toBe("TP.TEST.1");
      expect(info.DATAGROUP_CODE).toBe("test_dg");
    });

    it("should natively determine frequency", async () => {
      const series = new EVDSSeries("TP.TEST.1");
      const freq = await series.nativeFrequency();
      expect(freq).toBe("monthly");
    });
  });

  describe("Other endpoints", () => {
    it("should fetch dashboard", async () => {
      const evds = new EVDS();
      mockProvider.getDashboard = jest.fn().mockResolvedValue({ id: 1 });
      const result = await evds.dashboard();
      expect(result.id).toBe(1);
    });

    it("should fetch announcements", async () => {
      const evds = new EVDS();
      mockProvider.getAnnouncements = jest.fn().mockResolvedValue([{ title: "test" }]);
      const result = await evds.announcements();
      expect(result).toHaveLength(1);
    });

    it("should fetch home page dashboards", async () => {
      const evds = new EVDS();
      mockProvider.getHomePageDashboards = jest.fn().mockResolvedValue([
        { dashboardName: "Test", encodedId: "abc", screen_order: 1 }
      ]);
      const result = await evds.homePageDashboards();
      expect(result[0].name).toBe("Test");
      expect(result[0].encoded_id).toBe("abc");
    });

    it("should fetch dashboard by encoded id", async () => {
      const evds = new EVDS();
      mockProvider.getDashboardByEncodedId = jest.fn().mockResolvedValue({ portlet: "test" });
      const result = await evds.dashboardById("abc");
      expect(result.portlet).toBe("test");
    });

    it("should fetch server search", async () => {
      const evds = new EVDS();
      mockProvider.searchServer = jest.fn().mockResolvedValue({ veriGruplari: [], seriler: [] });
      const result = await evds.searchServer("test");
      expect(result.datagroups).toBeDefined();
      expect(result.series).toBeDefined();
    });

    it("should get series in group", async () => {
      const evds = new EVDS();
      mockProvider.getSeriesList = jest.fn().mockResolvedValue([{ SERIE_CODE: "TP_A", SERIE_NAME: "A" }]);
      const result = await evds.seriesInGroup("group_a");
      expect(result).toHaveLength(1);
      expect(result[0].SERIE_CODE).toBe("TP.A");
    });
  });

  describe("Module level functions", () => {
    it("should download multiple series", async () => {
      const { evdsDownload } = await import("~/evds");
      const result = await evdsDownload(["TP.TEST.1"], { period: "1y" });
      expect(result).toHaveLength(2);
    });

    it("should fetch series history directly", async () => {
      const { evdsSeries } = await import("~/evds");
      const result = await evdsSeries("TP.TEST.1", { start: "01-01-2024", end: "31-01-2024" });
      expect(result).toHaveLength(2);
    });
  });
});
