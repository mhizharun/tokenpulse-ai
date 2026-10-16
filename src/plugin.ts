import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const PROTOCOL_VERSION = "2026-07-28";

const TOKENS = {
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
} as const;

const outputSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  priceUsd: z.number(),
  change24hPercent: z.number().nullable(),
  marketCapUsd: z.number(),
  volume24hUsd: z.number(),
  high24hUsd: z.number(),
  low24hUsd: z.number(),
  momentum: z.enum([
    "STRONG_POSITIVE",
    "POSITIVE",
    "NEUTRAL",
    "NEGATIVE",
    "STRONG_NEGATIVE",
    "UNAVAILABLE",
  ]),
  analysis: z.string(),
  source: z.string(),
});

function createServer() {
  const server = new McpServer(
    { name: "tokenpulse-ai", version: "1.0.0" },
    { supportedProtocolVersions: [PROTOCOL_VERSION] },
  );

  server.registerTool(
    "analyze_token",
    {
      title: "Analyze Cryptocurrency Token",
      description:
        "Fetch live market data for a supported cryptocurrency and analyze its 24-hour price momentum. This is research, not financial advice.",
      inputSchema: z.object({
        symbol: z.enum([
          "BTC", "ETH", "BNB", "SOL", "XRP", "DOGE",
          "ADA", "AVAX", "LINK", "TON", "TRX", "SUI",
        ]),
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
      const token = TOKENS[symbol];

      const url = new URL(
        "https://api.coingecko.com/api/v3/coins/markets",
      );
      url.searchParams.set("vs_currency", "usd");
      url.searchParams.set("ids", token.id);
      url.searchParams.set("price_change_percentage", "24h");

      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(7000),
      });

      if (!response.ok) {
        throw new Error(
          `Market data provider returned HTTP ${response.status}. Try again later.`,
        );
      }

      const data: any = await response.json();
      const coin = data[0];

      if (!coin || typeof coin.current_price !== "number") {
        throw new Error("Market data is unavailable for this token.");
      }

      const change: number | null =
        typeof coin.price_change_percentage_24h === "number"
          ? coin.price_change_percentage_24h
          : null;

      let momentum:
        | "STRONG_POSITIVE"
        | "POSITIVE"
        | "NEUTRAL"
        | "NEGATIVE"
        | "STRONG_NEGATIVE"
        | "UNAVAILABLE";

      if (change === null) momentum = "UNAVAILABLE";
      else if (change >= 5) momentum = "STRONG_POSITIVE";
      else if (change > 0) momentum = "POSITIVE";
      else if (change <= -5) momentum = "STRONG_NEGATIVE";
      else if (change < 0) momentum = "NEGATIVE";
      else momentum = "NEUTRAL";

      const analysis =
        change === null
          ? "24-hour price change is unavailable, so momentum cannot be assessed."
          : `The token changed ${change.toFixed(2)}% over 24 hours. Momentum classification: ${momentum}. This describes recent performance, not a prediction of future prices.`;

      const result = {
        symbol,
        name: String(coin.name ?? token.name),
        priceUsd: coin.current_price,
        change24hPercent: change,
        marketCapUsd: Number(coin.market_cap ?? 0),
        volume24hUsd: Number(coin.total_volume ?? 0),
        high24hUsd: Number(coin.high_24h ?? 0),
        low24hUsd: Number(coin.low_24h ?? 0),
        momentum,
        analysis,
        source: "CoinGecko",
      };

      return {
        content: [
          {
            type: "text" as const,
            text:
              `${result.name} (${symbol})\n` +
              `Price: $${result.priceUsd}\n` +
              `24h change: ${change === null ? "Unavailable" : `${change.toFixed(2)}%`}\n` +
              `Momentum: ${momentum}\n` +
              `${analysis}`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  return server;
}

serveStdio(createServer, { legacy: "reject" });
