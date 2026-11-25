import fs from "fs";
import os from "os";
import path from "path";
import { AxiosError } from "axios";

import { Crypto } from "~/crypto";
import { AuthenticationError, RateLimitError } from "~/exceptions";
import { Fund } from "~/fund";
import { FX } from "~/fx";
import { getKAPProvider } from "~/providers/kap";
import { getTEFASProvider } from "~/providers/tefas";
import {
  clearTwitterAuth,
  getTwitterAuth,
  getTwitterProvider,
  normalizeTweet,
  parseTwitterDate,
  setTwitterAuth,
  TWEET_COLUMNS,
} from "~/providers/twitter";
import { Ticker } from "~/ticker";
import {
  buildCryptoQuery,
  buildFundQuery,
  buildFxQuery,
  buildStockQuery,
  CRYPTO_QUERY_MAP,
  FX_QUERY_MAP,
  searchTweets,
} from "~/twitter";

describe("Twitter/X Search Module", () => {
  afterEach(() => {
    clearTwitterAuth();
    getTwitterProvider().clearCache();
    jest.restoreAllMocks();
  });

  describe("Authentication helpers", () => {
    test("setTwitterAuth supports authToken/ct0, cookies object, and cookiesFile", () => {
      expect(() => setTwitterAuth({})).toThrow();
      expect(() => setTwitterAuth({ cookies: {} })).toThrow(/auth_token/);

      setTwitterAuth({ authToken: "tok123", ct0: "csrf456" });
      expect(getTwitterAuth()).toEqual({
        cookies: { auth_token: "tok123", ct0: "csrf456" },
      });

      setTwitterAuth({ cookies: { auth_token: "tok2", ct0: "ct02" } });
      expect(getTwitterAuth()?.cookies?.auth_token).toBe("tok2");

      setTwitterAuth({ cookiesFile: "/tmp/cookies.json" });
      expect(getTwitterAuth()).toEqual({ cookiesFile: "/tmp/cookies.json" });

      clearTwitterAuth();
      expect(getTwitterAuth()).toBeNull();
    });
  });

  describe("Query builders", () => {
    test("FX_QUERY_MAP and buildFxQuery", () => {
      expect(FX_QUERY_MAP.USD).toContain("$USDTRY");
      expect(buildFxQuery("USD")).toBe(FX_QUERY_MAP.USD);
      expect(buildFxQuery("gram-altin")).toBe(FX_QUERY_MAP["gram-altin"]);
      expect(buildFxQuery("NOK")).toBe("$NOKTRY OR NOK kur");
    });

    test("CRYPTO_QUERY_MAP and buildCryptoQuery", () => {
      expect(CRYPTO_QUERY_MAP.BTC).toContain("#Bitcoin");
      expect(buildCryptoQuery("BTCTRY")).toBe("$BTC OR #Bitcoin");
      expect(buildCryptoQuery("ETHUSDT")).toBe("$ETH OR #Ethereum");
      expect(buildCryptoQuery("PEPETRY")).toBe("$PEPE OR #PEPE");
    });

    test("buildFundQuery", () => {
      expect(buildFundQuery("aak", "AK PORTFOY FONU")).toBe(
        '#AAK OR AAK OR "AK PORTFOY FONU"',
      );
      expect(buildFundQuery("AAK")).toBe("#AAK OR AAK");
    });

    test("buildStockQuery enriches with KAP company name and handles errors", async () => {
      const kap = getKAPProvider();
      const searchSpy = jest
        .spyOn(kap, "search")
        .mockResolvedValueOnce([
          { ticker: "THYAO", name: "TÜRK HAVA YOLLARI A.O.", city: "İSTANBUL" },
        ]);
      expect(await buildStockQuery("thyao")).toBe(
        '$THYAO OR #THYAO OR THYAO OR "TÜRK HAVA YOLLARI"',
      );
      searchSpy.mockRejectedValueOnce(new Error("KAP down"));
      expect(await buildStockQuery("GARAN")).toBe("$GARAN OR #GARAN OR GARAN");
    });
  });

  describe("Normalization & Date parsing", () => {
    test("TWEET_COLUMNS has 15 expected fields", () => {
      expect(TWEET_COLUMNS).toHaveLength(15);
      expect(TWEET_COLUMNS).toContain("tweet_id");
      expect(TWEET_COLUMNS).toContain("author_verified");
    });

    test("parseTwitterDate handles RFC, ISO, empty, and invalid dates", () => {
      expect(parseTwitterDate("Wed Oct 10 20:19:24 +0000 2024")).toBeInstanceOf(
        Date,
      );
      expect(parseTwitterDate("2025-01-15T10:00:00Z")).toBeInstanceOf(Date);
      expect(parseTwitterDate(null)).toBeNull();
      expect(parseTwitterDate("not-a-date")).toBeNull();
    });

    test("normalizeTweet handles direct GraphQL, wrapped GraphQL, and TweetRecord", () => {
      const gql = normalizeTweet({
        tweet: {
          rest_id: "12345",
          views: { count: "9001" },
          core: {
            user_results: {
              result: {
                is_blue_verified: true,
                core: { screen_name: "bist_user", name: "BIST User" },
                legacy: { followers_count: 5000 },
              },
            },
          },
          legacy: {
            created_at: "Wed Oct 10 20:19:24 +0000 2024",
            full_text: "$THYAO bullish!",
            favorite_count: 42,
            retweet_count: 7,
            reply_count: 3,
            quote_count: 1,
            bookmark_count: 5,
            lang: "tr",
          },
        },
      });
      expect(gql.tweet_id).toBe("12345");
      expect(gql.author_handle).toBe("bist_user");
      expect(gql.author_verified).toBe(true);
      expect(gql.views).toBe(9001);
      expect(gql.likes).toBe(42);
      expect(gql.url).toBe("https://x.com/bist_user/status/12345");

      const rec = normalizeTweet({
        tweet_id: "999",
        text: "Hello X",
        timestamp: "2025-02-01T12:00:00Z",
        likes: 10,
        retweets: 2,
        comments: 1,
        user: { screen_name: "alice", name: "Alice", verified: false },
      });
      expect(rec.tweet_id).toBe("999");
      expect(rec.author_handle).toBe("alice");
      expect(rec.replies).toBe(1);
      expect(rec.url).toBe("https://x.com/alice/status/999");
    });
  });

  describe("TwitterProvider.searchTweets", () => {
    test("throws AuthenticationError when unauthenticated", async () => {
      await expect(searchTweets("$THYAO")).rejects.toThrow(AuthenticationError);
    });

    test("searches with pagination, deduplicates, sorts newest-first, and caches", async () => {
      setTwitterAuth({ authToken: "my_auth", ct0: "my_ct0" });
      const provider = getTwitterProvider();
      const client = (provider as unknown as { client: { get: jest.Mock } })
        .client;
      const getSpy = jest
        .spyOn(client, "get")
        .mockResolvedValueOnce({
          data: {
            data: {
              search_by_raw_query: {
                search_timeline: {
                  timeline: {
                    instructions: [
                      {
                        entries: [
                          {
                            content: {
                              itemContent: {
                                tweet_results: {
                                  result: {
                                    rest_id: "1",
                                    legacy: {
                                      created_at:
                                        "Mon Jan 01 10:00:00 +0000 2025",
                                      full_text: "Older tweet",
                                      favorite_count: 5,
                                    },
                                    core: {
                                      user_results: {
                                        result: {
                                          legacy: {
                                            screen_name: "u1",
                                            name: "U1",
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                          {
                            content: {
                              entryType: "TimelineTimelineCursor",
                              cursorType: "Bottom",
                              value: "CURSOR_2",
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            data: {
              search_by_raw_query: {
                search_timeline: {
                  timeline: {
                    instructions: [
                      {
                        entries: [
                          {
                            content: {
                              itemContent: {
                                tweet_results: {
                                  result: {
                                    rest_id: "2",
                                    legacy: {
                                      created_at:
                                        "Tue Jan 02 12:00:00 +0000 2025",
                                      full_text: "Newer tweet",
                                      favorite_count: 99,
                                    },
                                    core: {
                                      user_results: {
                                        result: {
                                          legacy: {
                                            screen_name: "u2",
                                            name: "U2",
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        });

      const tweets = await searchTweets("$THYAO", {
        since: "2025-01-01",
        until: "2025-01-03",
        lang: "tr",
        limit: 5,
      });

      expect(tweets).toHaveLength(2);
      expect(tweets[0].tweet_id).toBe("2");
      expect(tweets[1].tweet_id).toBe("1");
      expect(getSpy).toHaveBeenCalledTimes(2);

      // Second identical call hits cache
      const cached = await searchTweets("$THYAO", {
        since: "2025-01-01",
        until: "2025-01-03",
        lang: "tr",
        limit: 5,
      });
      expect(cached).toHaveLength(2);
      expect(getSpy).toHaveBeenCalledTimes(2);
    });

    test("supports cookiesFile JSON array format", async () => {
      const tmpPath = path.join(os.tmpdir(), `borsats_tw_${Date.now()}.json`);
      fs.writeFileSync(
        tmpPath,
        JSON.stringify([
          { name: "auth_token", value: "file_tok" },
          { name: "ct0", value: "file_ct0" },
        ]),
      );
      try {
        setTwitterAuth({ cookiesFile: tmpPath });
        const provider = getTwitterProvider();
        const client = (provider as unknown as { client: { get: jest.Mock } })
          .client;
        jest.spyOn(client, "get").mockResolvedValueOnce({ data: {} });
        const res = await searchTweets("$GARAN", { period: "1d", limit: 5 });
        expect(res).toEqual([]);
      } finally {
        fs.unlinkSync(tmpPath);
      }
    });

    test("maps HTTP 401/403 to AuthenticationError and 429 to RateLimitError", async () => {
      setTwitterAuth({ authToken: "bad", ct0: "ct0" });
      const provider = getTwitterProvider();
      const client = (provider as unknown as { client: { get: jest.Mock } })
        .client;

      const err401 = new AxiosError("Unauthorized", "ERR_BAD_REQUEST");
      err401.response = { status: 401 } as AxiosError["response"];
      jest.spyOn(client, "get").mockRejectedValueOnce(err401);
      await expect(searchTweets("q1")).rejects.toThrow(AuthenticationError);

      const err429 = new AxiosError("Too Many Requests", "ERR_BAD_REQUEST");
      err429.response = { status: 429 } as AxiosError["response"];
      jest.spyOn(client, "get").mockRejectedValueOnce(err429);
      await expect(searchTweets("q2")).rejects.toThrow(RateLimitError);
    });
  });

  describe("Asset .tweets() integration", () => {
    test("Ticker, Fund, FX, and Crypto delegate to TwitterProvider", async () => {
      const provider = getTwitterProvider();
      const spy = jest.spyOn(provider, "searchTweets").mockResolvedValue([]);
      jest.spyOn(getKAPProvider(), "search").mockResolvedValue([]);
      jest.spyOn(getTEFASProvider(), "getFundDetail").mockResolvedValue({
        fund_code: "AAK",
        name: "AK PORTFOY FONU",
      } as Awaited<ReturnType<ReturnType<typeof getTEFASProvider>["getFundDetail"]>>);

      await new Ticker("THYAO").tweets({ period: "1d", limit: 5 });
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining("$THYAO"),
        expect.objectContaining({ period: "1d", limit: 5 }),
      );

      await new Fund("AAK").tweets({ period: "3d" });
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining("#AAK"),
        expect.objectContaining({ period: "3d" }),
      );

      await new FX("USD").tweets({ lang: "tr" });
      expect(spy).toHaveBeenCalledWith(
        FX_QUERY_MAP.USD,
        expect.objectContaining({ lang: "tr" }),
      );

      await new Crypto("BTCTRY").tweets({ query: "custom btc query" });
      expect(spy).toHaveBeenCalledWith("custom btc query", expect.any(Object));
    });
  });
});
