import { EVDSSeries, evdsDownload } from "~/evds";
import { getEVDSProvider, setEVDSKey, clearEVDSKey } from "~/providers/evds";
import axios from "axios";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("EVDS Comprehensive Coverage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearEVDSKey();
    // @ts-ignore
    mockedAxios.create.mockReturnValue(mockedAxios);
    const provider = getEVDSProvider();
    // @ts-ignore
    if (provider.clearCache) provider.clearCache();
    
    // Default mocks
    mockedAxios.get.mockResolvedValue({ data: { items: [] } });
    mockedAxios.request.mockResolvedValue({ data: [] });
  });

  describe("Branch Coverage", () => {
    it("should cover parseEVDSDate and frameFromPayload branches", async () => {
      setEVDSKey("key");
      const provider = getEVDSProvider();
      
      jest.spyOn(provider, 'findSeries').mockResolvedValue({
        SERIE_CODE: "TP.TEST",
        START_DATE: "01-01-2020",
        FREQUENCY: 1
      });

      const series = new EVDSSeries("TP.TEST");
      
      const mockPayload = [
        { TARIH: "2024-01-01", TP_TEST: 1 },
        { TARIH: "2024-1", TP_TEST: 2 },
        { TARIH: "2024", TP_TEST: 3 },
        { TARIH: "2024Q1", TP_TEST: 4 },
        { TARIH: "2024-Q2", TP_TEST: 5 },
        { TARIH: "01-01-2024", TP_TEST: 6 },
        { TARIH: "Invalid", TP_TEST: 7 },
        { OBS_DATE: "2024-01-01", TP_TEST: 8 },
        { UNIXTIME: 1704067200, TP_TEST: 9 },
        { UNIXTIME: { $numberLong: "1704067200" }, TP_TEST: 10 },
      ];

      mockedAxios.get.mockResolvedValue({ data: { items: mockPayload } });
      const res = await series.history();
      expect(res.length).toBeGreaterThan(0);
      
      // Test normalization branches in frameFromPayload
      // Match via normalizedUs (TP_TEST)
      mockedAxios.get.mockResolvedValue({ data: { items: [
        { TARIH: "01-01-2024", "TP_TEST": 10 }
      ]}});
      const resUs = await series.history();
      expect(resUs[0]).toBeDefined();

      // Match via hyphenated base (TP_TEST-AVG)
      mockedAxios.get.mockResolvedValue({ data: { items: [
        { TARIH: "01-01-2024", "TP_TEST-AVG": 20 }
      ]}});
      const resHyphen = await series.history();
      expect(resHyphen[0]).toBeDefined();
    });

    it("should cover evdsDownload wrapper", async () => {
      setEVDSKey("key");
      mockedAxios.get.mockResolvedValue({ data: { items: [{ TARIH: "01-01-2024", Value: 100 }] } });
      
      const res = await evdsDownload(["TP.TEST"]);
      expect(res).toHaveLength(1);
    });

    it("should cover EVDSSeries code getter", () => {
      const series = new EVDSSeries("TP.TEST");
      expect(series.code).toBe("TP.TEST");
    });

    it("should cover EVDSSeries error cases", async () => {
      // @ts-ignore
      expect(() => new EVDSSeries(null)).toThrow();
      
      const series = new EVDSSeries("NONE");
      jest.spyOn(getEVDSProvider(), 'findSeries').mockResolvedValue(null);
      await expect(series.info()).rejects.toThrow(/not found/);
    });

    it("should cover EVDSProvider error cases", async () => {
      const provider = getEVDSProvider();
      await expect(provider.getDashboardByEncodedId("")).rejects.toThrow();
      await expect(provider.searchServer("")).rejects.toThrow();
      await expect(provider.getSeriesRange([])).rejects.toThrow();
      // getSettings error
      await expect(provider.getSettings()).rejects.toThrow(/at least one settings key/);
      // getDashboard error
      await expect(provider.getDashboard("")).rejects.toThrow(/dashboard slug is required/);
    });

    it("should cover getAnnouncements branches", async () => {
      const provider = getEVDSProvider();
      
      mockedAxios.request.mockResolvedValueOnce({ data: [{ title: "A1" }] });
      expect(await provider.getAnnouncements()).toHaveLength(1);

      // @ts-ignore
      provider.clearCache();
      mockedAxios.request.mockResolvedValueOnce({ data: { data: [{ title: "A2" }] } });
      expect(await provider.getAnnouncements()).toHaveLength(1);
    });

    it("should cover findDatagroup branches", async () => {
      const provider = getEVDSProvider();
      mockedAxios.request.mockResolvedValue({ 
        data: [{ DATAGROUPS: [{ DATAGROUP_CODE: "DG1", NAME: "Name" }] }] 
      });
      expect(await provider.findDatagroup("DG1")).toBeDefined();

      // @ts-ignore
      provider.clearCache();
      mockedAxios.request.mockResolvedValue({ data: [] });
      expect(await provider.findDatagroup("NONE")).toBeNull();
    });

    it("should cover getSeriesRange branches", async () => {
      const provider = getEVDSProvider();
      jest.spyOn(provider, 'findSeries').mockResolvedValueOnce({ _datagroup: { DATAGROUP_CODE: "DG1" } });
      jest.spyOn(provider, 'findSeries').mockResolvedValueOnce(null);
      
      mockedAxios.request.mockResolvedValue({ data: [{ series: "S1", startDate: "01-01-2020", endDate: "01-01-2024" }] });
      const range = await provider.getSeriesRange(["S1", "S2"]);
      expect(range).toBeDefined();
    });

    it("should cover getSeriesData split window branch", async () => {
      setEVDSKey("key");
      const provider = getEVDSProvider();
      mockedAxios.get.mockResolvedValue({ data: { items: [] } });
      
      await provider.getSeriesData(["S1"], "01-01-2010", "01-01-2024", "daily");
      expect(mockedAxios.get).toHaveBeenCalled();
    });
    
    it("should cover getHomePageDashboards, getDashboardByEncodedId and getDashboard", async () => {
      const provider = getEVDSProvider();
      mockedAxios.request.mockResolvedValue({ data: [{ id: 1 }] });
      expect(await provider.getHomePageDashboards()).toHaveLength(1);
      
      mockedAxios.request.mockResolvedValue({ data: { id: 1 } });
      expect(await provider.getDashboardByEncodedId("abc")).toBeDefined();
      expect(await provider.getDashboard("slug")).toBeDefined();
    });

    it("should cover singleton and helper errors", async () => {
      const provider = getEVDSProvider();
      
      // setEVDSKey error
      // @ts-ignore
      expect(() => setEVDSKey(null)).toThrow(/non-empty string/);
      
      // resolveFrequency error
      expect(() => provider.resolveFrequency("unknown")).toThrow(/Invalid frequency/);
      
      // resolveFormula error
      expect(() => provider.resolveFormula("unknown")).toThrow(/Invalid formula/);

      // periodToDates YTD
      // @ts-ignore - It is exported as a function, not a method
      const { periodToDates } = require("~/providers/evds");
      expect(periodToDates("ytd")).toBeDefined();
    });

    it("should cover environment API key reading", () => {
      const oldKey = process.env.EVDS_API_KEY;
      process.env.EVDS_API_KEY = "env-key";
      clearEVDSKey(); // Clears instance and globalApiKey, forcing re-read from env
      const provider = getEVDSProvider();
      expect(provider.hasApiKey).toBe(true);
      if (oldKey) process.env.EVDS_API_KEY = oldKey;
      else delete process.env.EVDS_API_KEY;
      clearEVDSKey();
    });

    it("should cover invalid date format error", async () => {
      setEVDSKey("key");
      const provider = getEVDSProvider();
      await expect(provider.getSeriesData(["S1"], "INVALID", "DATE")).rejects.toThrow(/Could not parse date/);
      // @ts-ignore
      await expect(provider.getSeriesData(["S1"], 123, 456)).rejects.toThrow(/Unsupported date value/);
    });

    it("should cover getSettings single object payload", async () => {
      const provider = getEVDSProvider();
      mockedAxios.request.mockResolvedValue({ data: { key: "K1", value: "V1" } });
      const settings = await provider.getSettings("K1");
      expect(settings.K1).toBe("V1");
    });

    it("should cover REST catalogue and error branches", async () => {
      const provider = getEVDSProvider();
      
      // Force hasApiKey to be false for error testing
      const hasKeySpy = jest.spyOn(provider, 'hasApiKey', 'get').mockReturnValue(false);
      
      await expect(provider.getCategoriesRest()).rejects.toThrow(/requires an API key/);
      await expect(provider.getDatagroupsRest()).rejects.toThrow(/requires an API key/);
      await expect(provider.getSeriesListRest("S1")).rejects.toThrow(/requires an API key/);

      // Restore and set key
      hasKeySpy.mockReturnValue(true);
      setEVDSKey("key");
      
      mockedAxios.request.mockResolvedValue({ data: [] });
      expect(await provider.getCategoriesRest()).toHaveLength(0);
      expect(await provider.getDatagroupsRest()).toHaveLength(0);
      expect(await provider.getDatagroupsRest("DG1")).toHaveLength(0);
      expect(await provider.getSeriesListRest("S1")).toHaveLength(0);

      mockedAxios.request.mockResolvedValueOnce({ data: {} });
      await expect(provider.getCategories()).rejects.toThrow(/Unexpected EVDS categories/);

      mockedAxios.request.mockResolvedValueOnce({ data: {} });
      await expect(provider.getSeriesList("DG1")).rejects.toThrow(/Unexpected serieList/);
      
      hasKeySpy.mockRestore();
    });

    it("should cover single series 'Value' mapping in frameFromPayload", async () => {
      setEVDSKey("key");
      const provider = getEVDSProvider();
      jest.spyOn(provider, 'findSeries').mockResolvedValue({
        SERIE_CODE: "TP.SINGLE",
        START_DATE: "01-01-2020",
        FREQUENCY: 1
      });
      const series = new EVDSSeries("TP.SINGLE");
      mockedAxios.get.mockResolvedValue({ 
        data: { 
          items: [{ TARIH: "01-01-2024", TP_SINGLE: 123 }] 
        } 
      });
      const res = await series.history();
      expect(res[0].Value).toBe(123);
    });
  });
});
