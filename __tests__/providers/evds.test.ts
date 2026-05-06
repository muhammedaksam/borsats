import axios from "axios";
import { EVDSProvider, getEVDSProvider, setEVDSKey, clearEVDSKey, estimateObservations, splitWindow, periodToDates } from "~/providers/evds";
import * as evdsModule from "~/providers/evds";
import { APIError } from "~/exceptions";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("EVDSProvider", () => {
  let provider: EVDSProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    clearEVDSKey();
    
    // Mock create to return the mocked instance
    mockedAxios.create.mockReturnValue(mockedAxios as unknown as ReturnType<typeof axios.create>);
    
    // @ts-ignore
    mockedAxios.defaults = { headers: {} };
    
    provider = getEVDSProvider();
  });

  afterEach(() => {
    clearEVDSKey();
  });

  describe("API Key Management", () => {
    it("should set and retrieve the API key", () => {
      setEVDSKey("test-key-123");
      // @ts-ignore
      const newProvider = getEVDSProvider();
      expect(newProvider.hasApiKey).toBe(true);
    });

    it("should clear the API key", () => {
      setEVDSKey("test-key-123");
      clearEVDSKey();
      const newProvider = getEVDSProvider();
      expect(newProvider.hasApiKey).toBe(false);
    });
  });

  describe("Anonymous endpoints", () => {
    it("should fetch categories", async () => {
      const mockData = [{ CATEGORY_ID: 1, TOPIC_TITLE_TR: "Test", DATAGROUPS: [] }];
      mockedAxios.request.mockResolvedValueOnce({ data: mockData });
      
      const result = await provider.getCategories();
      
      expect(result).toEqual(mockData);
      expect(mockedAxios.request).toHaveBeenCalledWith(expect.objectContaining({
        url: "/igmevdsms-dis/categories/withDatagroups/type=json"
      }));
    });

    it("should handle HTTP errors gracefully", async () => {
      mockedAxios.request.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 500, data: "Server Error" }
      });
      
      await expect(provider.getCategories()).rejects.toThrow(APIError);
    });
  });

  describe("Time-series fetch", () => {
    it("should throw if no API key is provided for datagroup fetch", async () => {
      await expect(provider.getDatagroupData("test_dg", new Date(), new Date())).rejects.toThrow(/requires an API key/);
    });

    it("should execute datagroup fetch when key is present", async () => {
      setEVDSKey("valid-key");
      const testProvider = getEVDSProvider();
      
      mockedAxios.get.mockResolvedValueOnce({ data: { items: [{ TARIH: "01-01-2024", TP_DK_USD_A: "30.00" }] } });
      
      const res = await testProvider.getDatagroupData("test_dg", "2024-01-01", "2024-01-31");
      expect(res.items[0].TP_DK_USD_A).toBe("30.00");
    });

    it("should estimate observations correctly", () => {
      const est = estimateObservations("01-01-2024", "10-01-2024", 1);
      expect(est).toBeGreaterThan(0);
    });

    it("should split window correctly", () => {
      const windows = splitWindow("01-01-2024", "10-01-2024", 1, 5);
      expect(windows.length).toBeGreaterThan(1);
    });

    it("should fetch series data", async () => {
      setEVDSKey("valid-key");
      const testProvider = getEVDSProvider();
      
      mockedAxios.get.mockResolvedValueOnce({ data: { items: [{ TARIH: "01-01-2024", TP_DK_USD_A: "30.00" }] } });
      const res = await testProvider.getSeriesData(["TP.DK.USD.A"], "2024-01-01", "2024-01-31");
      expect(res.items).toBeDefined();
    });

    it("should fetch series data using split chunks if > max obs", async () => {
      setEVDSKey("valid-key");
      const testProvider = getEVDSProvider();
      
      // Request 10 years of daily data which will trigger chunking
      mockedAxios.get.mockResolvedValue({ data: { items: [{ TARIH: "01-01-2015", TP_DK_USD_A: "3.00" }] } });
      const res = await testProvider.getSeriesData(["TP.DK.USD.A"], "01-01-2015", "01-01-2025", "daily");
      expect(res.items).toBeDefined();
    });
  });

  describe("Other REST endpoints", () => {
    it("should fetch settings", async () => {
      mockedAxios.request.mockResolvedValueOnce({ data: [{ key: "TEST", value: "VALUE" }] });
      const res = await provider.getSettings("TEST");
      expect(res["TEST"]).toBe("VALUE");
    });

    it("should search server", async () => {
      mockedAxios.request.mockResolvedValueOnce({ data: { result: "ok" } });
      const res = await provider.searchServer("test");
      expect(res.result).toBe("ok");
    });

    it("should fetch datagroups with rest endpoint", async () => {
      setEVDSKey("valid-key");
      const testProvider = getEVDSProvider();
      mockedAxios.request.mockResolvedValueOnce({ data: [{ DATAGROUP_CODE: "test" }] });
      const res = await testProvider.getDatagroupsRest();
      expect(res[0].DATAGROUP_CODE).toBe("test");
    });
  });

  describe("Helper methods", () => {
    it("should resolve frequency correctly", () => {
      expect(provider.resolveFrequency("monthly")).toBe(5);
      expect(provider.resolveFrequency("daily")).toBe(1);
      expect(provider.resolveFrequency(1)).toBe(1);
      expect(provider.resolveFrequency(" 5 ")).toBe(5);
      expect(() => provider.resolveFrequency("invalid")).toThrow(/Invalid frequency/);
    });

    it("should resolve formula correctly", () => {
      expect(provider.resolveFormula("level")[0]).toBe("0");
      expect(provider.resolveFormula("pct_change")[0]).toBe("1");
      expect(provider.resolveFormula(1)[0]).toBe("1");
      expect(provider.resolveFormula("2")[0]).toBe("2");
      expect(() => provider.resolveFormula("invalid")).toThrow(/Invalid formula/);
    });

    it("should process periodToDates logic", () => {
      expect(periodToDates("1y").length).toBe(2);
      expect(periodToDates("2y").length).toBe(2);
      expect(periodToDates("3y").length).toBe(2);
      expect(periodToDates("max").length).toBe(2);
      expect(() => periodToDates("invalid")).toThrow(/Invalid period/);
    });

    it("should catch errors in postJson retry", async () => {
      setEVDSKey("valid-key");
      const testProvider = getEVDSProvider();
      // findSeries calls getCategories which calls request
      mockedAxios.request.mockResolvedValue({ data: [] });
      mockedAxios.post.mockRejectedValueOnce(new Error("Network Error"))
                      .mockResolvedValueOnce({ data: { items: [{ TARIH: "test" }] } });
      const res = await testProvider.getSeriesRange(["TP.TEST"]);
      expect(res).toBeDefined();
    });

    it("should throw custom errors for 401/403", async () => {
      setEVDSKey("valid-key");
      const testProvider = getEVDSProvider();
      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 401 }
      });
      await expect(testProvider.getSeriesData(["TP.TEST"], "01-01-2024", "01-01-2024")).rejects.toThrow(/HTTP 401\/403/);
    });

    it("should require datagroupCode in getDatagroupData", async () => {
      setEVDSKey("valid-key");
      const testProvider = getEVDSProvider();
      await expect(testProvider.getDatagroupData("", new Date(), new Date())).rejects.toThrow(/datagroupCode is required/);
    });

    it("should fallback on estimateObservations error", async () => {
      setEVDSKey("valid-key");
      const testProvider = getEVDSProvider();
      mockedAxios.get.mockResolvedValue({ data: { items: [] } });
      
      const spy = jest.spyOn(evdsModule, "estimateObservations").mockImplementationOnce(() => {
        throw new Error("mock error");
      });
      
      const res = await testProvider.getSeriesData(["TP.TEST"], "01-01-2024", "31-01-2024");
      expect(res).toBeDefined();
      spy.mockRestore();
    });

    it("should cache and find series", async () => {
      mockedAxios.request.mockResolvedValueOnce({ data: [{ DATAGROUPS: [{ DATAGROUP_CODE: "dg1" }] }] });
      mockedAxios.request.mockResolvedValueOnce({ data: [{ SERIE_CODE: "TP_TEST" }] });
      
      const serie = await provider.findSeries("TP.TEST");
      expect(serie).toBeDefined();
      expect(serie?.SERIE_CODE).toBe("TP_TEST");
    });

    it("should handle getSeriesData validation errors", async () => {
      setEVDSKey("key");
      const testProvider = getEVDSProvider();
      await expect(testProvider.getSeriesData([], "01-01-2024", "01-01-2024")).rejects.toThrow(/at least one series code/);
      await expect(testProvider.getSeriesData(Array(401).fill("A"), "01-01-2024", "01-01-2024")).rejects.toThrow(/max 400 series/);
      await expect(testProvider.getSeriesData(["A", "B"], "01-01-2024", "01-01-2024", "monthly", ["avg"])).rejects.toThrow(/aggregation list length/);
      await expect(testProvider.getSeriesData(["A"], "01-01-2024", "01-01-2024", "monthly", "invalid")).rejects.toThrow(/Invalid aggregation/);
      await expect(testProvider.getSeriesData(["A", "B"], "01-01-2024", "01-01-2024", "monthly", "avg", ["level"])).rejects.toThrow(/formula list length/);
    });

    it("should handle getSeriesData non-json output", async () => {
      setEVDSKey("key");
      const testProvider = getEVDSProvider();
      mockedAxios.get.mockResolvedValueOnce({ data: "CSV DATA" });
      const res = await testProvider.getSeriesData(["TP.TEST"], "01-01-2024", "01-01-2024", "monthly", "avg", "level", 2, 0, "csv");
      expect(res).toBe("CSV DATA");
    });

    it("should handle generic REST errors in restDataGet", async () => {
      setEVDSKey("key");
      const testProvider = getEVDSProvider();
      mockedAxios.get.mockRejectedValueOnce({ message: "Network Error" });
      await expect(testProvider.getSeriesData(["TP.TEST"], "01-01-2024", "01-01-2024")).rejects.toThrow(/EVDS REST request failed/);
    });

    it("should handle malformed entries in getSeriesRange", async () => {
      setEVDSKey("key");
      mockedAxios.post.mockResolvedValueOnce({ 
        data: { 
          items: [null, {}, { SERIE_CODE: "TP_TEST", BASLANGIC_TARIHI: "01-01-2020", BITIS_TARIHI: "01-01-2024" }] 
        } 
      });
      const res = await provider.getSeriesRange(["TP.TEST"]);
      expect(res["TP_TEST"]).toBeDefined();
    });

    it("should handle ARRAY response in getSeriesRange", async () => {
      setEVDSKey("key");
      mockedAxios.post.mockResolvedValueOnce({ 
        data: [
          { SERIE_CODE: "TP_ARRAY", START_DATE: "01-01-2020", END_DATE: "01-01-2024" },
          { serieCode: "tp_lowercase", startDate: "01-01-2021", endDate: "01-01-2025" },
          { serieCode: null } // coverage for missing code
        ] 
      });
      const res = await provider.getSeriesRange(["TP.ARRAY", "tp.lowercase"]);
      expect(res["TP_ARRAY"]).toBeDefined();
      expect(res["TP_LOWERCASE"]).toBeDefined();
    });

    it("should handle top-level dates in getSeriesRange", async () => {
      setEVDSKey("key");
      const testProvider = getEVDSProvider();
      mockedAxios.post.mockResolvedValueOnce({ 
        data: { 
          startDate: "01-01-2020",
          endDate: "01-01-2024"
        } 
      });
      const res = await testProvider.getSeriesRange(["TP.TEST"]);
      expect(res["TP_TEST"]).toEqual({ start: "01-01-2020", end: "01-01-2024" });
    });

    it("should handle getSeriesRange failure", async () => {
      setEVDSKey("key");
      mockedAxios.post.mockRejectedValueOnce(new Error("Fail"));
      const res = await provider.getSeriesRange(["TP.TEST"]);
      expect(res).toEqual({});
    });

    it("should resolve numeric frequency normalization", () => {
      // @ts-ignore
      expect(provider.resolveFrequency(9)).toBe(5);
      // @ts-ignore
      expect(provider.resolveFrequency(13)).toBe(6);
      // @ts-ignore
      expect(provider.resolveFrequency(16)).toBe(7);
      // @ts-ignore
      expect(provider.resolveFrequency(18)).toBe(8);
    });

    it("should throw APIError if key is missing in getSeriesData", async () => {
      clearEVDSKey();
      const testProvider = getEVDSProvider();
      await expect(testProvider.getSeriesData(["S1"], "d", "d")).rejects.toThrow(/requires an API key/);
    });

    it("should handle postJson retry successfully", async () => {
      setEVDSKey("key");
      const testProvider = getEVDSProvider();
      // Reset mocks for clear count
      mockedAxios.post.mockReset();
      mockedAxios.post
        .mockRejectedValueOnce(new Error("Transient"))
        .mockResolvedValueOnce({ data: { items: [] } });
      
      await testProvider.getSeriesRange(["TP.TEST"]);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });
  });
});
