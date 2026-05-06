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
    
    it("should cover getHomePageDashboards and getDashboardByEncodedId", async () => {
      const provider = getEVDSProvider();
      mockedAxios.request.mockResolvedValue({ data: [{ id: 1 }] });
      expect(await provider.getHomePageDashboards()).toHaveLength(1);
      
      mockedAxios.request.mockResolvedValue({ data: { id: 1 } });
      expect(await provider.getDashboardByEncodedId("abc")).toBeDefined();
    });
  });
});
