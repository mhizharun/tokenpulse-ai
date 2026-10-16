import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import YahooFinance from "yahoo-finance2";

const PROTOCOL_VERSION = "2026-07-28";

const SYMBOLS = [
  "BTC", "ETH", "BNB", "SOL", "XRP", "DOGE",
  "ADA", "AVAX", "LINK", "TON", "TRX", "SUI",
] as const;

type SymbolCode = typeof SYMBOLS[number];

const TOKENS: Record<SymbolCode, { id: string; name: string }> = {
  BTC: { id: "bitcoin", name: "Bitcoin" },
  ETH: { id: "ethereum", name: "Ethereum" },
  BNB: { id: "binancecoin", name: "BNB" },
  SOL: { id: "solana", name: "Solana" },
  XRP: { id: "ripple", name: "XRP" },
  DOGE: { id: "dogecoin", name: "Dogecoin" },
  ADA: { id: "cardano", name: "Cardano" },
  AVAX: { id: "avalanche-2", name: "Avalanche" },
  LINK: { id: "chainlink", name: "Chainlink" },
  TON: { id: "the-open-network", name: "Toncoin" },
  TRX: { id: "tron", name: "TRON" },
  SUI: { id: "sui", name: "Sui" },
};

const marketFields = {
  symbol: z.string(),
  name: z.string(),
  priceUsd: z.number(),
  change24hPercent: z.number().nullable(),
  marketCapUsd: z.number(),
  volume24hUsd: z.number(),
  volumeToMarketCapPercent: z.number().nullable(),
  high24hUsd: z.number(),
  low24hUsd: z.number(),
  rangePositionPercent: z.number().nullable(),
  dailyRangePercent: z.number().nullable(),
};

const outputSchema = z.object({
  ...marketFields,
  momentum: z.enum([
    "STRONG_POSITIVE", "POSITIVE", "NEUTRAL",
    "NEGATIVE", "STRONG_NEGATIVE", "UNAVAILABLE",
  ]),
  bullishFactors: z.array(z.string()),
  bearishFactors: z.array(z.string()),
  riskFlags: z.array(z.string()),
  analysis: z.string(),
  source: z.string(),
});

type MarketData = {
  symbol: SymbolCode;
  name: string;
  priceUsd: number;
  change24hPercent: number | null;
  marketCapUsd: number;
  volume24hUsd: number;
  volumeToMarketCapPercent: number | null;
  high24hUsd: number;
  low24hUsd: number;
  rangePositionPercent: number | null;
  dailyRangePercent: number | null;
};

async function fetchMarkets(symbols: SymbolCode[]): Promise<MarketData[]> {
  const ids = [...new Set(symbols)].map((symbol) => TOKENS[symbol].id);

  const url = new URL("https://api.coingecko.com/api/v3/coins/markets");
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("price_change_percentage", "24h");

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(9000),
  });

  if (!response.ok) {
    throw new Error(
      `CoinGecko returned HTTP ${response.status}. Try again later.`,
    );
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("CoinGecko returned an unexpected market-data response.");
  }

  const byId = new Map<string, Record<string, unknown>>();

  for (const item of data) {
    if (
      item !== null &&
      typeof item === "object" &&
      !Array.isArray(item)
    ) {
      const coin = item as Record<string, unknown>;
      if (typeof coin.id === "string") byId.set(coin.id, coin);
    }
  }

  return symbols.map((symbol) => {
    const token = TOKENS[symbol];
    const coin = byId.get(token.id);

    if (!coin || typeof coin.current_price !== "number") {
      throw new Error(`Market data is unavailable for ${symbol}.`);
    }

    const price = coin.current_price;
    const high = typeof coin.high_24h === "number"
      ? coin.high_24h : price;
    const low = typeof coin.low_24h === "number"
      ? coin.low_24h : price;
    const marketCap = typeof coin.market_cap === "number"
      ? coin.market_cap : 0;
    const volume = typeof coin.total_volume === "number"
      ? coin.total_volume : 0;
    const change = typeof coin.price_change_percentage_24h === "number"
      ? coin.price_change_percentage_24h : null;

    return {
      symbol,
      name: typeof coin.name === "string" ? coin.name : token.name,
      priceUsd: price,
      change24hPercent: change,
      marketCapUsd: marketCap,
      volume24hUsd: volume,
      volumeToMarketCapPercent: marketCap > 0
        ? (volume / marketCap) * 100 : null,
      high24hUsd: high,
      low24hUsd: low,
      rangePositionPercent: high > low
        ? Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100))
        : null,
      dailyRangePercent: price > 0
        ? ((high - low) / price) * 100 : null,
    };
  });
}

function analyzeMarket(market: MarketData) {
  const change = market.change24hPercent;
  const bullishFactors: string[] = [];
  const bearishFactors: string[] = [];
  const riskFlags: string[] = [];

  let momentum:
    | "STRONG_POSITIVE"
    | "POSITIVE"
    | "NEUTRAL"
    | "NEGATIVE"
    | "STRONG_NEGATIVE"
    | "UNAVAILABLE";

  if (change === null) {
    momentum = "UNAVAILABLE";
    riskFlags.push("24-hour price-change data is unavailable.");
  } else if (change >= 5) {
    momentum = "STRONG_POSITIVE";
    bullishFactors.push("Price has risen at least 5% over 24 hours.");
  } else if (change > 0) {
    momentum = "POSITIVE";
    bullishFactors.push("Price is higher over the last 24 hours.");
  } else if (change <= -5) {
    momentum = "STRONG_NEGATIVE";
    bearishFactors.push("Price has fallen at least 5% over 24 hours.");
  } else if (change < 0) {
    momentum = "NEGATIVE";
    bearishFactors.push("Price is lower over the last 24 hours.");
  } else {
    momentum = "NEUTRAL";
    riskFlags.push("The 24-hour price change is approximately zero.");
  }

  if (
    market.rangePositionPercent !== null &&
    market.rangePositionPercent >= 80
  ) {
    bullishFactors.push("Price is near the top of its 24-hour range.");
    riskFlags.push("Price is near the daily high; a pullback is possible.");
  }

  if (
    market.rangePositionPercent !== null &&
    market.rangePositionPercent <= 20
  ) {
    bearishFactors.push("Price is near the bottom of its 24-hour range.");
    riskFlags.push("Price is near the daily low; downside may continue.");
  }

  if (
    market.volumeToMarketCapPercent !== null &&
    market.volumeToMarketCapPercent >= 10
  ) {
    bullishFactors.push(
      "24-hour trading volume is high relative to market capitalization.",
    );
  } else if (
    market.volumeToMarketCapPercent !== null &&
    market.volumeToMarketCapPercent < 1
  ) {
    riskFlags.push(
      "Trading volume is low relative to market capitalization.",
    );
  }

  if (
    market.dailyRangePercent !== null &&
    market.dailyRangePercent >= 10
  ) {
    riskFlags.push(
      "The 24-hour high-low range is wide, indicating elevated price movement.",
    );
  }

  if (bullishFactors.length === 0) {
    bullishFactors.push("No strong bullish factor was identified by these rules.");
  }

  if (bearishFactors.length === 0) {
    bearishFactors.push("No strong bearish factor was identified by these rules.");
  }

  const analysis =
    `${market.name} (${market.symbol}) is classified as ${momentum}. ` +
    `The 24-hour price change is ${
      change === null ? "unavailable" : `${change.toFixed(2)}%`
    }. ` +
    `Price is ${
      market.rangePositionPercent === null
        ? "at an undetermined position"
        : `${market.rangePositionPercent.toFixed(1)}% of the way from its 24-hour low to high`
    }. ` +
    "These are rule-based observations, not a price prediction.";

  return {
    ...market,
    momentum,
    bullishFactors,
    bearishFactors,
    riskFlags,
    analysis,
    source: "CoinGecko",
  };
}


const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

const STOCK_SYMBOLS = [
  "AAPL", "TSLA", "NVDA", "MSFT", "AMZN",
] as const;

type StockSymbol = typeof STOCK_SYMBOLS[number];

type StockData = {
  symbol: string;
  name: string;
  priceUsd: number;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  marketCap: number | null;
  currency: string;
  marketState: string;
};

async function fetchStock(symbol: StockSymbol): Promise<StockData> {
  const quote = await yahooFinance.quote(symbol);

  if (
    typeof quote.regularMarketPrice !== "number" ||
    !Number.isFinite(quote.regularMarketPrice) ||
    quote.regularMarketPrice <= 0
  ) {
    throw new Error(`A valid quote is unavailable for ${symbol}.`);
  }

  return {
    symbol,
    name: quote.shortName || quote.longName || symbol,
    priceUsd: quote.regularMarketPrice,
    changePercent:
      typeof quote.regularMarketChangePercent === "number"
        ? quote.regularMarketChangePercent
        : null,
    dayHigh:
      typeof quote.regularMarketDayHigh === "number"
        ? quote.regularMarketDayHigh
        : null,
    dayLow:
      typeof quote.regularMarketDayLow === "number"
        ? quote.regularMarketDayLow
        : null,
    volume:
      typeof quote.regularMarketVolume === "number"
        ? quote.regularMarketVolume
        : null,
    marketCap:
      typeof quote.marketCap === "number"
        ? quote.marketCap
        : null,
    currency: quote.currency || "USD",
    marketState: quote.marketState || "UNKNOWN",
  };
}

function analyzeStock(stock: StockData) {
  const bullishFactors: string[] = [];
  const bearishFactors: string[] = [];
  const riskFlags: string[] = [];

  if (stock.changePercent === null) {
    riskFlags.push("Daily percentage change is unavailable.");
  } else if (stock.changePercent > 0) {
    bullishFactors.push("The stock is up for the reported trading session.");
  } else if (stock.changePercent < 0) {
    bearishFactors.push("The stock is down for the reported trading session.");
  } else {
    riskFlags.push("The reported daily percentage change is zero.");
  }

  if (
    stock.dayHigh !== null &&
    stock.dayLow !== null &&
    stock.dayHigh > stock.dayLow
  ) {
    const rangePosition =
      ((stock.priceUsd - stock.dayLow) /
        (stock.dayHigh - stock.dayLow)) * 100;

    if (rangePosition >= 80) {
      bullishFactors.push("Price is in the upper part of its reported daily range.");
      riskFlags.push("Price is near the daily high; a pullback is possible.");
    } else if (rangePosition <= 20) {
      bearishFactors.push("Price is in the lower part of its reported daily range.");
      riskFlags.push("Price is near the daily low; weakness may continue.");
    }
  }

  if (stock.marketState !== "REGULAR") {
    riskFlags.push(
      `Market state is ${stock.marketState}; confirm quote timing and trading hours.`,
    );
  }

  if (bullishFactors.length === 0) {
    bullishFactors.push("No strong bullish factor was identified by these rules.");
  }

  if (bearishFactors.length === 0) {
    bearishFactors.push("No strong bearish factor was identified by these rules.");
  }

  return {
    ...stock,
    bullishFactors,
    bearishFactors,
    riskFlags,
    analysis:
      `${stock.name} (${stock.symbol}) is trading at ` +
      `${stock.currency} ${stock.priceUsd.toFixed(2)}. ` +
      `Reported session change: ${
        stock.changePercent === null
          ? "unavailable"
          : `${stock.changePercent.toFixed(2)}%`
      }. These are limited rule-based observations, not a prediction.`,
    source: "Yahoo Finance",
    disclaimer:
      "Quotes may be delayed, incomplete, or rate-limited. This is not financial advice.",
  };
}

function createServer() {
  const server = new McpServer(
    { name: "tokenpulse-ai", version: "2.0.0" },
    { supportedProtocolVersions: [PROTOCOL_VERSION] },
  );

  server.registerTool(
    "analyze_token",
    {
      title: "TokenPulse Advanced Token Research",
      description:
        "Analyze a supported cryptocurrency's 24-hour momentum, price range, " +
        "volume relative to market capitalization, bullish factors, bearish factors, " +
        "and risk flags. Uses CoinGecko public market data. Not financial advice.",
      inputSchema: z.object({
        symbol: z.enum(SYMBOLS),
      }).strict(),
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ symbol }) => {
      const market = (await fetchMarkets([symbol]))[0];
      if (!market) throw new Error("Market data is unavailable.");

      const result = analyzeMarket(market);

      return {
        content: [{
          type: "text" as const,
          text:
            `${result.name} (${result.symbol})\n` +
            `Price: $${result.priceUsd}\n` +
            `24h change: ${result.change24hPercent === null ? "Unavailable" : `${result.change24hPercent.toFixed(2)}%`}\n` +
            `Momentum: ${result.momentum}\n\n` +
            `Bullish factors: ${result.bullishFactors.join("; ")}\n` +
            `Bearish factors: ${result.bearishFactors.join("; ")}\n` +
            `Risk flags: ${result.riskFlags.join("; ")}\n\n` +
            result.analysis,
        }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "compare_tokens",
    {
      title: "Compare Cryptocurrencies",
      description:
        "Compare two supported cryptocurrencies using price change, trading volume, " +
        "volume-to-market-cap ratio, daily range, and rule-based market observations.",
      inputSchema: z.object({
        symbolA: z.enum(SYMBOLS),
        symbolB: z.enum(SYMBOLS),
      }).strict(),
      outputSchema: z.object({
        tokenA: outputSchema,
        tokenB: outputSchema,
        comparison: z.string(),
        stronger24hPerformer: z.string().nullable(),
        source: z.string(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ symbolA, symbolB }) => {
      if (symbolA === symbolB) {
        throw new Error("Choose two different symbols to compare.");
      }

      const markets = await fetchMarkets([symbolA, symbolB]);
      const firstMarket = markets[0];
      const secondMarket = markets[1];

      if (!firstMarket || !secondMarket) {
        throw new Error("Market data for both tokens is required.");
      }

      const tokenA = analyzeMarket(firstMarket);
      const tokenB = analyzeMarket(secondMarket);

      let stronger24hPerformer: string | null = null;
      if (
        tokenA.change24hPercent !== null &&
        tokenB.change24hPercent !== null
      ) {
        stronger24hPerformer =
          tokenA.change24hPercent === tokenB.change24hPercent
            ? "TIE"
            : tokenA.change24hPercent > tokenB.change24hPercent
              ? tokenA.symbol : tokenB.symbol;
      }

      const comparison =
        stronger24hPerformer === null
          ? "A reliable 24-hour performance comparison is unavailable."
          : stronger24hPerformer === "TIE"
            ? "Both tokens have the same reported 24-hour price change."
            : `${stronger24hPerformer} has the stronger reported 24-hour price change. ` +
              "This does not establish which token is safer or more likely to rise.";

      const result = {
        tokenA,
        tokenB,
        comparison,
        stronger24hPerformer,
        source: "CoinGecko",
      };

      return {
        content: [{
          type: "text" as const,
          text:
            `${tokenA.name} vs ${tokenB.name}\n` +
            `${tokenA.symbol}: ${tokenA.change24hPercent === null ? "change unavailable" : `${tokenA.change24hPercent.toFixed(2)}%`}\n` +
            `${tokenB.symbol}: ${tokenB.change24hPercent === null ? "change unavailable" : `${tokenB.change24hPercent.toFixed(2)}%`}\n` +
            comparison,
        }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "scan_opportunities",
    {
      title: "Scan Crypto Market Opportunities",
      description:
        "Rank supported cryptocurrencies using a transparent heuristic based on " +
        "24-hour price change, volume relative to market capitalization, and position " +
        "within the daily range. This is a research shortlist, not a buy recommendation.",
      inputSchema: z.object({
        limit: z.number().int().min(3).max(12).optional(),
      }).strict(),
      outputSchema: z.object({
        methodology: z.string(),
        results: z.array(z.object({
          rank: z.number().int(),
          ...outputSchema.shape,
          researchScore: z.number(),
        })),
        warning: z.string(),
        source: z.string(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ limit }) => {
      const markets = await fetchMarkets([...SYMBOLS]);

      const ranked = markets.map((market) => {
        const analysis = analyzeMarket(market);
        const change = market.change24hPercent ?? 0;
        const volumeRatio = market.volumeToMarketCapPercent ?? 0;
        const rangePosition = market.rangePositionPercent ?? 50;

        const score = Math.max(0, Math.min(
          100,
          50 +
            Math.max(-30, Math.min(30, change * 3)) +
            Math.max(-10, Math.min(15, (volumeRatio - 5) * 1.5)) +
            (rangePosition - 50) * 0.15,
        ));

        return {
          ...analysis,
          researchScore: Math.round(score * 10) / 10,
        };
      }).sort((a, b) => b.researchScore - a.researchScore)
        .slice(0, limit ?? 8)
        .map((item, index) => ({ rank: index + 1, ...item }));

      const result = {
        methodology:
          "Heuristic score from 0 to 100: 24-hour price change, volume-to-market-cap " +
          "ratio, and position within the 24-hour range. It is not a probability of profit.",
        results: ranked,
        warning:
          "Rankings use limited 24-hour data. They do not establish future returns, " +
          "support/resistance, unusual volume, or a safe entry. Verify market conditions independently.",
        source: "CoinGecko",
      };

      return {
        content: [{
          type: "text" as const,
          text:
            "TokenPulse Market Scan\n" +
            result.methodology + "\n\n" +
            ranked.map((item) =>
              `${item.rank}. ${item.symbol}: score ${item.researchScore}/100, ` +
              `24h change ${item.change24hPercent === null ? "unavailable" : `${item.change24hPercent.toFixed(2)}%`}, ` +
              `momentum ${item.momentum}`,
            ).join("\n") +
            "\n\n" + result.warning,
        }],
        structuredContent: result,
      };
    },
  );


  server.registerTool(
    "analyze_stock",
    {
      title: "Analyze US Stock",
      description:
        "Analyze a supported US stock using Yahoo Finance quotes, session change, " +
        "daily range, bullish and bearish observations, and risk flags.",
      inputSchema: z.object({
        symbol: z.enum(STOCK_SYMBOLS),
      }).strict(),
      outputSchema: z.object({
        symbol: z.string(),
        name: z.string(),
        priceUsd: z.number(),
        changePercent: z.number().nullable(),
        dayHigh: z.number().nullable(),
        dayLow: z.number().nullable(),
        volume: z.number().nullable(),
        marketCap: z.number().nullable(),
        currency: z.string(),
        marketState: z.string(),
        bullishFactors: z.array(z.string()),
        bearishFactors: z.array(z.string()),
        riskFlags: z.array(z.string()),
        analysis: z.string(),
        source: z.string(),
        disclaimer: z.string(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ symbol }) => {
      const result = analyzeStock(await fetchStock(symbol));
      return {
        content: [{
          type: "text" as const,
          text:
            `${result.name} (${result.symbol})\n` +
            `Price: ${result.currency} ${result.priceUsd.toFixed(2)}\n` +
            `Session change: ${result.changePercent === null ? "Unavailable" : `${result.changePercent.toFixed(2)}%`}\n` +
            `Market state: ${result.marketState}\n` +
            `Bullish observations: ${result.bullishFactors.join("; ")}\n` +
            `Bearish observations: ${result.bearishFactors.join("; ")}\n` +
            `Risk flags: ${result.riskFlags.join("; ")}\n\n` +
            result.disclaimer,
        }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "get_market_news",
    {
      title: "Market News Intelligence",
      description:
        "Retrieve Yahoo Finance headlines and apply a basic bullish, bearish, mixed, " +
        "or uncertain keyword classification. This is not a price prediction.",
      inputSchema: z.object({
        query: z.string().min(1).max(120).optional(),
        limit: z.number().int().min(1).max(10).optional(),
      }).strict(),
      outputSchema: z.object({
        query: z.string(),
        count: z.number(),
        articles: z.array(z.object({
          title: z.string(),
          publisher: z.string(),
          link: z.string(),
          publishedAt: z.string().nullable(),
          sentiment: z.enum(["BULLISH", "BEARISH", "MIXED", "UNCERTAIN"]),
          sentimentReason: z.string(),
        })),
        source: z.string(),
        disclaimer: z.string(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, limit }) => {
      const searchQuery = query?.trim() || "stock market economy Federal Reserve";
      const count = limit ?? 8;
      const result = await yahooFinance.search(searchQuery, {
        newsCount: count,
        quotesCount: 0,
      });

      const positiveWords = [
        "surge", "rally", "gain", "growth", "beats", "upgrade",
        "jumps", "rises", "rate cut", "cooling inflation",
      ];
      const negativeWords = [
        "crash", "plunge", "falls", "drops", "selloff", "sell-off",
        "downgrade", "misses", "recession", "war", "rate hike",
        "layoffs", "slumps",
      ];

      const articles = (result.news ?? []).slice(0, count).map((item) => {
        const title = item.title || "Untitled market report";
        const text = title.toLowerCase();
        const positive = positiveWords.some((word) => text.includes(word));
        const negative = negativeWords.some((word) => text.includes(word));

        const sentiment =
          positive && negative ? "MIXED" as const :
          positive ? "BULLISH" as const :
          negative ? "BEARISH" as const : "UNCERTAIN" as const;

        const timestamp = item.providerPublishTime;
        const publishedAt =
          typeof timestamp === "number" && Number.isFinite(timestamp)
            ? new Date(timestamp * 1000).toISOString()
            : null;

        return {
          title,
          publisher: item.publisher || "Unknown publisher",
          link: item.link || "",
          publishedAt,
          sentiment,
          sentimentReason:
            sentiment === "UNCERTAIN"
              ? "Headline keywords alone do not establish market direction."
              : "Classification is based on headline keywords only.",
        };
      });

      const output = {
        query: searchQuery,
        count: articles.length,
        articles,
        source: "Yahoo Finance",
        disclaimer:
          "This is headline-only keyword classification, not full article analysis " +
          "or a reliable prediction of price movement.",
      };

      return {
        content: [{
          type: "text" as const,
          text:
            `Market news: ${searchQuery}\n\n` +
            (articles.length
              ? articles.map((a, i) =>
                  `${i + 1}. ${a.title}\nPublisher: ${a.publisher}\n` +
                  `Published: ${a.publishedAt ?? "Unknown"}\n` +
                  `Sentiment: ${a.sentiment}\n${a.link}`
                ).join("\n\n")
              : "No news articles were returned.") +
            `\n\n${output.disclaimer}`,
        }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "get_economic_calendar",
    {
      title: "High-Impact Economic Calendar",
      description:
        "Retrieve scheduled and released economic events including CPI, PPI, PCE, " +
        "GDP, employment data, retail sales, jobless claims, and FOMC decisions.",
      inputSchema: z.object({
        importance: z.enum(["high", "medium", "all"]).optional(),
      }).strict(),
      outputSchema: z.object({
        count: z.number(),
        events: z.array(z.object({
          eventName: z.string(),
          importance: z.string(),
          scheduledAt: z.string(),
          status: z.enum(["UPCOMING", "RELEASED", "AWAITING_UPDATE"]),
          periodLabel: z.string().nullable(),
          previous: z.string().nullable(),
          forecast: z.string().nullable(),
          actual: z.string().nullable(),
          unit: z.string().nullable(),
          canonicalUrl: z.string().nullable(),
        })),
        source: z.string(),
        attribution: z.string(),
        disclaimer: z.string(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ importance }) => {
      const level = importance ?? "high";
      const url = new URL("https://xoomar.com/api/markets/calendar");
      if (level !== "all") url.searchParams.set("importance", level);

      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        throw new Error(`Economic calendar returned HTTP ${response.status}.`);
      }

      const payload: unknown = await response.json();
      if (
        payload === null ||
        typeof payload !== "object" ||
        !("data" in payload) ||
        !Array.isArray(payload.data)
      ) {
        throw new Error("Economic calendar returned an unexpected response.");
      }

      const now = Date.now();
      const events = payload.data
        .filter((item: unknown) =>
          item !== null && typeof item === "object" && !Array.isArray(item)
        )
        .map((item: Record<string, unknown>) => {
          const scheduledAt =
            typeof item.scheduledAt === "string" ? item.scheduledAt : "";
          const actual =
            item.actual === null || item.actual === undefined || item.actual === ""
              ? null : String(item.actual);
          const scheduledTime = Date.parse(scheduledAt);
          const status =
            actual !== null ? "RELEASED" as const :
            Number.isFinite(scheduledTime) && scheduledTime > now
              ? "UPCOMING" as const : "AWAITING_UPDATE" as const;

          const nullable = (value: unknown): string | null =>
            value === null || value === undefined || value === ""
              ? null : String(value);

          return {
            eventName: typeof item.eventName === "string" ? item.eventName : "Unknown event",
            importance: typeof item.importance === "string" ? item.importance : "unknown",
            scheduledAt,
            status,
            periodLabel: nullable(item.periodLabel),
            previous: nullable(item.previous),
            forecast: nullable(item.forecast),
            actual,
            unit: nullable(item.unit),
            canonicalUrl: nullable(item.canonicalUrl),
          };
        })
        .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));

      const output = {
        count: events.length,
        events,
        source: "XOOMAR economic calendar",
        attribution: "Calendar data provided by XOOMAR: https://xoomar.com",
        disclaimer:
          "Calendar values may be revised. Market reactions depend on expectations " +
          "and other conditions; an event listing alone is not a trading signal.",
      };

      return {
        content: [{
          type: "text" as const,
          text:
            `Economic calendar (${level} importance): ${events.length} events\n\n` +
            (events.length
              ? events.map((e, i) =>
                  `${i + 1}. ${e.eventName}\nScheduled: ${e.scheduledAt}\n` +
                  `Status: ${e.status}\nPeriod: ${e.periodLabel ?? "Not specified"}\n` +
                  `Previous: ${e.previous ?? "Unavailable"} | ` +
                  `Forecast: ${e.forecast ?? "Unavailable"} | ` +
                  `Actual: ${e.actual ?? "Not reported"}\n` +
                  `Details: ${e.canonicalUrl ?? "Unavailable"}`
                ).join("\n\n")
              : "No events were returned.") +
            `\n\n${output.attribution}\n${output.disclaimer}`,
        }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "calculate_risk",
    {
      title: "Trade Risk Calculator",
      description:
        "Calculate theoretical position size, risk amount, target profit, and risk-to-reward " +
        "from user-provided account size, risk percentage, entry, stop, target, and trade side. " +
        "No market data, wallet, or trade execution is used.",
      inputSchema: z.object({
        accountUsd: z.number().positive().max(1_000_000_000),
        riskPercent: z.number().positive().max(10),
        entryPrice: z.number().positive(),
        stopPrice: z.number().positive(),
        targetPrice: z.number().positive(),
        side: z.enum(["LONG", "SHORT"]),
      }).strict(),
      outputSchema: z.object({
        side: z.enum(["LONG", "SHORT"]),
        riskBudgetUsd: z.number(),
        priceRiskPerUnitUsd: z.number(),
        positionSizeUnits: z.number(),
        positionValueUsd: z.number(),
        potentialLossUsd: z.number(),
        potentialProfitUsd: z.number(),
        riskRewardRatio: z.number(),
        exceedsAccountValue: z.boolean(),
        warnings: z.array(z.string()),
        disclaimer: z.string(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ accountUsd, riskPercent, entryPrice, stopPrice, targetPrice, side }) => {
      if (
        (side === "LONG" && !(stopPrice < entryPrice && targetPrice > entryPrice)) ||
        (side === "SHORT" && !(stopPrice > entryPrice && targetPrice < entryPrice))
      ) {
        throw new Error(
          side === "LONG"
            ? "For LONG: stop price must be below entry, and target must be above entry."
            : "For SHORT: stop price must be above entry, and target must be below entry.",
        );
      }

      const riskBudgetUsd = accountUsd * riskPercent / 100;
      const priceRiskPerUnitUsd = Math.abs(entryPrice - stopPrice);
      const targetDistance = Math.abs(targetPrice - entryPrice);
      const positionSizeUnits = riskBudgetUsd / priceRiskPerUnitUsd;
      const positionValueUsd = positionSizeUnits * entryPrice;
      const potentialLossUsd = positionSizeUnits * priceRiskPerUnitUsd;
      const potentialProfitUsd = positionSizeUnits * targetDistance;
      const riskRewardRatio = potentialProfitUsd / potentialLossUsd;
      const exceedsAccountValue = positionValueUsd > accountUsd;
      const warnings: string[] = [
        "Calculations exclude fees, slippage, funding, and gaps.",
        "A stop-loss does not guarantee execution at the stop price.",
      ];

      if (exceedsAccountValue) {
        warnings.push(
          "The calculated position value exceeds the account size. Leverage or a smaller risk budget may be required.",
        );
      }

      if (riskRewardRatio < 1) {
        warnings.push("Potential reward is lower than the planned risk.");
      }

      const result = {
        side,
        riskBudgetUsd,
        priceRiskPerUnitUsd,
        positionSizeUnits,
        positionValueUsd,
        potentialLossUsd,
        potentialProfitUsd,
        riskRewardRatio,
        exceedsAccountValue,
        warnings,
        disclaimer:
          "Mathematical estimate only. This tool does not place orders or provide personalized financial advice.",
      };

      return {
        content: [{
          type: "text" as const,
          text:
            `Trade Risk Calculation (${side})\n` +
            `Risk budget: $${riskBudgetUsd.toFixed(2)}\n` +
            `Position size: ${positionSizeUnits.toFixed(8)} units\n` +
            `Position value: $${positionValueUsd.toFixed(2)}\n` +
            `Potential loss: $${potentialLossUsd.toFixed(2)}\n` +
            `Potential profit: $${potentialProfitUsd.toFixed(2)}\n` +
            `Risk-to-reward: 1:${riskRewardRatio.toFixed(2)}\n` +
            `Warnings: ${warnings.join(" ")}`,
        }],
        structuredContent: result,
      };
    },
  );

  return server;
}

serveStdio(createServer, { legacy: "reject" });
