import fs from "fs";
import axios from "axios";

import { APIError, AuthenticationError, RateLimitError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";
import { TTL } from "~/utils/helpers";

export interface TwitterAuthOptions {
  authToken?: string;
  ct0?: string;
  cookies?: Record<string, string>;
  cookiesFile?: string;
}

export interface TwitterCredentials {
  cookies?: Record<string, string>;
  cookiesFile?: string;
}

export interface TwitterSearchOptions {
  period?: string;
  since?: string;
  until?: string;
  lang?: string;
  limit?: number;
  product?: "Latest" | "Top";
  queryId?: string;
}

export interface Tweet {
  tweet_id: string;
  created_at: Date | null;
  text: string;
  author_handle: string;
  author_name: string;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  quotes: number;
  bookmarks: number;
  author_followers: number;
  author_verified: boolean;
  lang: string;
  url: string;
}

export const TWEET_COLUMNS = [
  "tweet_id",
  "created_at",
  "text",
  "author_handle",
  "author_name",
  "likes",
  "retweets",
  "replies",
  "views",
  "quotes",
  "bookmarks",
  "author_followers",
  "author_verified",
  "lang",
  "url",
] as const;

export const TWITTER_PERIOD_DAYS: Record<string, number> = {
  "1d": 1,
  "3d": 3,
  "5d": 5,
  "7d": 7,
  "1w": 7,
  "2w": 14,
  "1mo": 30,
  "3mo": 90,
};

// Public Twitter/X web client Bearer token used for cookie-authenticated GraphQL calls
const TWITTER_WEB_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

// Default SearchTimeline GraphQL query ID (can be overridden via options.queryId)
const DEFAULT_SEARCH_QUERY_ID = "M1jEez78PEfVfbQLvlWMvQ";

const SEARCH_FEATURES: Record<string, boolean> = {
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

let _twitterCredentials: TwitterCredentials | null = null;

/**
 * Set Twitter/X authentication credentials for tweet search.
 * Provide `authToken`/`ct0`, a `cookies` map containing `auth_token`, or a `cookiesFile` JSON path.
 */
export function setTwitterAuth(options: TwitterAuthOptions): void {
  if (options.cookiesFile) {
    _twitterCredentials = { cookiesFile: options.cookiesFile };
  } else if (options.cookies) {
    if (!options.cookies.auth_token) {
      throw new Error("cookies object must contain 'auth_token' key");
    }
    _twitterCredentials = { cookies: { ...options.cookies } };
  } else if (options.authToken) {
    _twitterCredentials = {
      cookies: {
        auth_token: options.authToken,
        ct0: options.ct0 || "",
      },
    };
  } else {
    throw new Error(
      "Provide authToken/ct0, cookies object, or cookiesFile. " +
        "Get auth_token and ct0 from browser DevTools > Application > Cookies > x.com",
    );
  }
}

/**
 * Clear Twitter/X authentication credentials.
 */
export function clearTwitterAuth(): void {
  _twitterCredentials = null;
}

/**
 * Get current Twitter/X authentication credentials.
 */
export function getTwitterAuth(): TwitterCredentials | null {
  return _twitterCredentials;
}

function safeInt(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

/**
 * Parse Twitter's date string into a Date (supports Twitter RFC format & ISO strings).
 */
export function parseTwitterDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Normalize a raw Twitter GraphQL or flat tweet object into a `Tweet`.
 */
export function normalizeTweet(raw: Record<string, unknown>): Tweet {
  const unwrapped =
    raw.tweet && typeof raw.tweet === "object" && !Array.isArray(raw.tweet)
      ? (raw.tweet as Record<string, unknown>)
      : raw;

  const userObj = unwrapped.user;
  if (
    userObj &&
    typeof userObj === "object" &&
    "screen_name" in (userObj as Record<string, unknown>)
  ) {
    const u = userObj as Record<string, unknown>;
    const tweetId = String(unwrapped.tweet_id ?? "");
    const authorHandle = String(u.screen_name ?? "");
    return {
      tweet_id: tweetId,
      created_at: parseTwitterDate(unwrapped.timestamp as string | undefined),
      text: String(unwrapped.text ?? ""),
      author_handle: authorHandle,
      author_name: String(u.name ?? ""),
      likes: safeInt(unwrapped.likes),
      retweets: safeInt(unwrapped.retweets),
      replies: safeInt(unwrapped.comments ?? unwrapped.replies),
      views: safeInt(unwrapped.views),
      quotes: safeInt(unwrapped.quotes),
      bookmarks: safeInt(unwrapped.bookmarks),
      author_followers: safeInt(u.followers_count),
      author_verified: Boolean(u.verified),
      lang: String(unwrapped.lang ?? ""),
      url:
        String(unwrapped.tweet_url ?? "") ||
        (tweetId ? `https://x.com/${authorHandle}/status/${tweetId}` : ""),
    };
  }

  const legacy =
    unwrapped.legacy && typeof unwrapped.legacy === "object"
      ? (unwrapped.legacy as Record<string, unknown>)
      : unwrapped;

  const core = unwrapped.core as Record<string, unknown> | undefined;
  const userResults = core?.user_results as Record<string, unknown> | undefined;
  const userResult =
    userResults?.result && typeof userResults.result === "object"
      ? (userResults.result as Record<string, unknown>)
      : {};
  const userCore =
    userResult.core && typeof userResult.core === "object"
      ? (userResult.core as Record<string, unknown>)
      : {};
  const userLegacy =
    userResult.legacy && typeof userResult.legacy === "object"
      ? (userResult.legacy as Record<string, unknown>)
      : {};

  const tweetId = String(unwrapped.rest_id ?? legacy.id_str ?? "");
  const authorHandle = String(
    userCore.screen_name ?? userLegacy.screen_name ?? legacy.screen_name ?? "",
  );
  const authorName = String(userCore.name ?? userLegacy.name ?? "");

  let views = 0;
  const viewsData = unwrapped.views;
  if (viewsData && typeof viewsData === "object") {
    views = safeInt((viewsData as Record<string, unknown>).count);
  } else if (typeof viewsData === "number" || typeof viewsData === "string") {
    views = safeInt(viewsData);
  }

  return {
    tweet_id: tweetId,
    created_at: parseTwitterDate(legacy.created_at as string | undefined),
    text: String(legacy.full_text ?? legacy.text ?? ""),
    author_handle: authorHandle,
    author_name: authorName,
    likes: safeInt(legacy.favorite_count),
    retweets: safeInt(legacy.retweet_count),
    replies: safeInt(legacy.reply_count),
    views,
    quotes: safeInt(legacy.quote_count),
    bookmarks: safeInt(legacy.bookmark_count),
    author_followers: safeInt(userLegacy.followers_count),
    author_verified: Boolean(
      userResult.is_blue_verified || userLegacy.verified,
    ),
    lang: String(legacy.lang ?? ""),
    url: tweetId ? `https://x.com/${authorHandle}/status/${tweetId}` : "",
  };
}

function loadCookies(creds: TwitterCredentials): Record<string, string> {
  if (creds.cookies) {
    return creds.cookies;
  }
  if (creds.cookiesFile) {
    const raw = fs.readFileSync(creds.cookiesFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const map: Record<string, string> = {};
      for (const item of parsed) {
        if (
          item &&
          typeof item === "object" &&
          typeof (item as Record<string, unknown>).name === "string" &&
          typeof (item as Record<string, unknown>).value === "string"
        ) {
          map[(item as Record<string, string>).name] = (
            item as Record<string, string>
          ).value;
        }
      }
      return map;
    }
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, string>;
    }
  }
  return {};
}

function extractTimelineTweetsAndCursor(payload: unknown): {
  tweets: Record<string, unknown>[];
  nextCursor: string | null;
} {
  const tweets: Record<string, unknown>[] = [];
  let nextCursor: string | null = null;

  const data = (payload as Record<string, unknown>)?.data as
    Record<string, unknown> | undefined;
  const searchByRaw = data?.search_by_raw_query as
    Record<string, unknown> | undefined;
  const timelineWrap = searchByRaw?.search_timeline as
    Record<string, unknown> | undefined;
  const timeline = timelineWrap?.timeline as
    Record<string, unknown> | undefined;
  const instructions = (timeline?.instructions as unknown[]) || [];

  for (const instr of instructions) {
    if (!instr || typeof instr !== "object") continue;
    const obj = instr as Record<string, unknown>;
    const entries = (obj.entries as unknown[]) || [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const content = e.content as Record<string, unknown> | undefined;
      if (!content) continue;

      if (
        content.entryType === "TimelineTimelineCursor" &&
        content.cursorType === "Bottom" &&
        typeof content.value === "string"
      ) {
        nextCursor = content.value;
        continue;
      }

      const itemContent = content.itemContent as
        Record<string, unknown> | undefined;
      const tweetResults = itemContent?.tweet_results as
        Record<string, unknown> | undefined;
      const result = tweetResults?.result as
        Record<string, unknown> | undefined;
      if (result && typeof result === "object") {
        tweets.push(result);
      }
    }
  }

  return { tweets, nextCursor };
}

/**
 * Provider for cookie-authenticated Twitter/X tweet search via X's GraphQL SearchTimeline API.
 */
export class TwitterProvider extends BaseProvider {
  constructor() {
    super({
      baseUrl: "https://x.com",
      timeout: 30000,
    });
  }

  async searchTweets(
    query: string,
    options: TwitterSearchOptions = {},
  ): Promise<Tweet[]> {
    const {
      period = "7d",
      since,
      until,
      lang,
      limit = 100,
      product = "Latest",
      queryId = DEFAULT_SEARCH_QUERY_ID,
    } = options;

    let sinceStr: string;
    let untilStr: string;
    if (since && until) {
      sinceStr = since;
      untilStr = until;
    } else {
      const days = TWITTER_PERIOD_DAYS[period || "7d"] ?? 7;
      const untilDt = new Date();
      const sinceDt = new Date(untilDt.getTime() - days * 24 * 60 * 60 * 1000);
      sinceStr = since || sinceDt.toISOString().slice(0, 10);
      untilStr = until || untilDt.toISOString().slice(0, 10);
    }

    const cacheKey = `twitter:${query}:${sinceStr}:${untilStr}:${lang || ""}:${limit}:${product}`;
    const cached = this.cache.get(cacheKey) as Tweet[] | undefined;
    if (cached) return cached;

    const creds = getTwitterAuth();
    if (!creds) {
      throw new AuthenticationError(
        "Twitter authentication required. Call setTwitterAuth() first. " +
          "Get auth_token and ct0 from browser DevTools > Application > Cookies > x.com",
      );
    }

    const cookies = loadCookies(creds);
    if (!cookies.auth_token) {
      throw new AuthenticationError(
        "Twitter auth_token cookie is missing. Call setTwitterAuth() with valid cookies.",
      );
    }

    const cookieHeader = Object.entries(cookies)
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    let rawQuery = query.trim();
    if (lang) rawQuery = `${rawQuery} lang:${lang}`;
    if (sinceStr) rawQuery = `${rawQuery} since:${sinceStr}`;
    if (untilStr) rawQuery = `${rawQuery} until:${untilStr}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${TWITTER_WEB_BEARER}`,
      Cookie: cookieHeader,
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes",
      "x-twitter-client-language": lang || "en",
      Origin: "https://x.com",
      Referer: "https://x.com/search",
    };
    if (cookies.ct0) {
      headers["x-csrf-token"] = cookies.ct0;
    }

    const collected: Tweet[] = [];
    const seenIds = new Set<string>();
    let cursor: string | null = null;
    const maxPages = Math.max(1, Math.ceil(limit / 20) + 1);

    for (let page = 0; page < maxPages && collected.length < limit; page++) {
      const variables: Record<string, unknown> = {
        rawQuery,
        count: Math.min(20, limit - collected.length),
        querySource: "typed_query",
        product,
      };
      if (cursor) {
        variables.cursor = cursor;
      }

      const url = `https://x.com/i/api/graphql/${queryId}/SearchTimeline`;

      let payload: unknown;
      try {
        const response = await this.client.get(url, {
          headers,
          params: {
            variables: JSON.stringify(variables),
            features: JSON.stringify(SEARCH_FEATURES),
          },
        });
        payload = response.data;
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const status = err.response?.status;
          if (status === 401 || status === 403) {
            throw new AuthenticationError(
              "Twitter/X rejected authentication cookies (HTTP " +
                status +
                "). Refresh auth_token and ct0.",
            );
          }
          if (status === 429) {
            throw new RateLimitError("Twitter/X search rate limit exceeded");
          }
        }
        throw new APIError(
          `Twitter/X search failed: ${(err as Error).message}`,
        );
      }

      const { tweets, nextCursor } = extractTimelineTweetsAndCursor(payload);
      if (tweets.length === 0) break;

      let added = 0;
      for (const raw of tweets) {
        const normalized = normalizeTweet(raw);
        if (normalized.tweet_id && seenIds.has(normalized.tweet_id)) continue;
        if (normalized.tweet_id) seenIds.add(normalized.tweet_id);
        collected.push(normalized);
        added++;
        if (collected.length >= limit) break;
      }

      if (!nextCursor || nextCursor === cursor || added === 0) break;
      cursor = nextCursor;
    }

    // Sort newest first
    collected.sort((a, b) => {
      const ta = a.created_at ? a.created_at.getTime() : 0;
      const tb = b.created_at ? b.created_at.getTime() : 0;
      return tb - ta;
    });

    this.cache.set(cacheKey, collected, TTL.SOCIAL_DATA);
    return collected;
  }
}

let _twitterProvider: TwitterProvider | null = null;

export function getTwitterProvider(): TwitterProvider {
  if (!_twitterProvider) {
    _twitterProvider = new TwitterProvider();
  }
  return _twitterProvider;
}
