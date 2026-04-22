/**
 * Tests for TEFAS provider error handling (v0.8.5).
 *
 * _safeJson: descriptive APIError for non-JSON bodies
 * _postJson: WAF retry with exponential backoff
 */

import { AxiosResponse } from "axios";

import { APIError } from "~/exceptions";
import { TEFASProvider } from "~/providers/tefas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(
  data: unknown,
  contentType: string,
  status: number = 200,
): AxiosResponse {
  return {
    data,
    status,
    statusText: "OK",
    headers: { "content-type": contentType },
    config: {} as AxiosResponse["config"],
  } as AxiosResponse;
}

// ---------------------------------------------------------------------------
// _safeJson
// ---------------------------------------------------------------------------

describe("TEFASProvider._safeJson", () => {
  it("raises descriptive error for empty string body", () => {
    const resp = mockResponse("", "application/json");
    expect(() => TEFASProvider._safeJson(resp, "GetAllFundAnalyzeData")).toThrow(
      APIError,
    );
    try {
      TEFASProvider._safeJson(resp, "GetAllFundAnalyzeData");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("GetAllFundAnalyzeData");
      expect(msg).toContain("empty response");
      expect(msg).toContain("HTTP 200");
    }
  });

  it("raises descriptive error for null data", () => {
    const resp = mockResponse(null, "application/json");
    expect(() => TEFASProvider._safeJson(resp, "X")).toThrow(APIError);
    try {
      TEFASProvider._safeJson(resp, "X");
    } catch (e) {
      expect((e as Error).message).toContain("empty response");
    }
  });

  it("raises error with preview for HTML body", () => {
    const body = "<html><body>Under maintenance</body></html>";
    const resp = mockResponse(body, "text/html; charset=utf-8");
    expect(() => TEFASProvider._safeJson(resp, "GetAllFundAnalyzeData")).toThrow(
      APIError,
    );
    try {
      TEFASProvider._safeJson(resp, "GetAllFundAnalyzeData");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("non-JSON");
      expect(msg).toContain("text/html");
      expect(msg).toContain("Under maintenance");
    }
  });

  it("raises error for malformed JSON string body", () => {
    const resp = mockResponse("{not valid json", "application/json");
    expect(() => TEFASProvider._safeJson(resp, "BindHistoryInfo")).toThrow(
      APIError,
    );
    try {
      TEFASProvider._safeJson(resp, "BindHistoryInfo");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("malformed JSON");
      expect(msg).toContain("BindHistoryInfo");
    }
  });

  it("returns parsed object for valid JSON object data", () => {
    const resp = mockResponse(
      { fundInfo: [{ FONKODU: "AFV" }] },
      "application/json; charset=utf-8",
    );
    const result = TEFASProvider._safeJson(resp, "GetAllFundAnalyzeData");
    expect(result).toEqual({ fundInfo: [{ FONKODU: "AFV" }] });
  });

  it("handles uppercase content-type", () => {
    const resp = mockResponse({ ok: true }, "Application/JSON");
    const result = TEFASProvider._safeJson(resp, "X");
    expect(result).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// _postJson
// ---------------------------------------------------------------------------

describe("TEFASProvider._postJson", () => {
  let provider: TEFASProvider;

  beforeEach(() => {
    provider = new TEFASProvider();
  });

  afterEach(() => {
    provider.clearCache();
  });

  it("recovers after transient empty body", async () => {
    const emptyResp = mockResponse("", "text/html");
    const goodResp = mockResponse(
      { fundInfo: [{ FONKODU: "AFV" }] },
      "application/json",
    );

    let callCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (provider as any).client.post = jest.fn().mockImplementation(() => {
      callCount++;
      return callCount === 1
        ? Promise.resolve(emptyResp)
        : Promise.resolve(goodResp);
    });

    const result = await provider._postJson(
      "http://x",
      "",
      "GetAllFundAnalyzeData",
    );
    expect(result).toEqual({ fundInfo: [{ FONKODU: "AFV" }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((provider as any).client.post).toHaveBeenCalledTimes(2);
  });

  it("raises after max retries", async () => {
    const emptyResp = mockResponse("", "text/html");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (provider as any).client.post = jest
      .fn()
      .mockResolvedValue(emptyResp);

    await expect(
      provider._postJson("http://x", "", "GetAllFundAnalyzeData"),
    ).rejects.toThrow(APIError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((provider as any).client.post).toHaveBeenCalledTimes(3);
  });

  it("does not retry on success", async () => {
    const goodResp = mockResponse({ ok: true }, "application/json");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (provider as any).client.post = jest.fn().mockResolvedValue(goodResp);

    const result = await provider._postJson("http://x", "", "X");
    expect(result).toEqual({ ok: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((provider as any).client.post).toHaveBeenCalledTimes(1);
  });
});
