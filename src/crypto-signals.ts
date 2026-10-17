const tokens: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  DOGE: "dogecoin",
  ADA: "cardano",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  TON: "the-open-network",
  TRX: "tron",
  SUI: "sui",
};

type Coin = {
  current_price?: number;
  price_change_percentage_24h?: number | null;
  high_24h?: number;
  low_24h?: number;
  total_volume?: number;
  market_cap?: number;
};

export async function getCryptoSignal(
  input: string,
  timeframe: "24h" | "3d" | "7d" = "24h",
  riskProfile: "conservative" | "balanced" | "aggressive" = "balanced",
) {
  const symbol = input.trim().toUpperCase();
  const id = tokens[symbol];
  if (!id) {
    throw new Error("Unsupported token. Try BTC, ETH, BNB, SOL, XRP, DOGE, ADA, AVAX, LINK, TON, TRX, or SUI.");
  }

  const url = new URL("https://api.coingecko.com/api/v3/coins/markets");
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("ids", id);
  url.searchParams.set("price_change_percentage", "24h");

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) {
    throw new Error(`CoinGecko returned HTTP ${response.status}. Try again later.`);
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data) || !data[0] || typeof data[0] !== "object") {
    throw new Error(`Market data is unavailable for ${symbol}.`);
  }

  const coin = data[0] as Coin;
  const price = coin.current_price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw new Error(`No valid market price returned for ${symbol}.`);
  }

  const change = typeof coin.price_change_percentage_24h === "number"
    ? coin.price_change_percentage_24h
    : null;
  const high = typeof coin.high_24h === "number" ? coin.high_24h : price;
  const low = typeof coin.low_24h === "number" ? coin.low_24h : price;
  const range = high > low ? Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100)) : null;
  const marketCap = typeof coin.market_cap === "number" ? coin.market_cap : 0;
  const volume = typeof coin.total_volume === "number" ? coin.total_volume : 0;
  const volumeRatio = marketCap > 0 ? volume / marketCap * 100 : null;

  let score = 50;
  if (change !== null) score += Math.max(-20, Math.min(20, change * 2));
  if (range !== null) {
    if (range >= 70) score += 5;
    else if (range <= 30) score -= 5;
  }
  if (volumeRatio !== null && volumeRatio >= 5 && change !== null) {
    score += change > 0 ? 5 : change < 0 ? -5 : 0;
  }
  score = Math.max(0, Math.min(100, score));

  const direction = score >= 58 ? "BULLISH" : score <= 42 ? "BEARISH" : "NEUTRAL";
  const confidence = Math.round(Math.min(75, 50 + Math.abs(score - 50)));
  const volatility = Math.max(2, Math.min(15, high > low ? (high - low) / price * 100 : 3));
  const timeMultiplier = timeframe === "24h" ? 1 : timeframe === "3d" ? 1.8 : 2.5;
  const profileMultiplier = riskProfile === "conservative" ? 0.7 : riskProfile === "aggressive" ? 1.3 : 1;
  const move = volatility * timeMultiplier * profileMultiplier;
  const entryWidth = price * Math.min(0.01, volatility / 100 * 0.15);
  const entryLow = Math.max(0, price - entryWidth);
  const entryHigh = price + entryWidth;
  const directional = direction !== "NEUTRAL" && change !== null;
  const target = directional ? price * (1 + (direction === "BULLISH" ? 1 : -1) * move / 100) : null;
  const stop = directional ? price * (1 - (direction === "BULLISH" ? 1 : -1) * move * 0.6 / 100) : null;

  const risks: string[] = [];
  if (change === null) risks.push("24-hour change unavailable.");
  if (high === low) risks.push("Intraday range unavailable.");
  if (volume === 0 || marketCap === 0) risks.push("Volume or market-cap data unavailable.");

  const action = !directional || confidence < 58 || risks.length >= 3
    ? "MONITOR"
    : "PREPARE ENTRY";

  return [
    `📊 TOKENPULSE AI SIGNAL — ${symbol}`,
    "",
    `Market price: $${price.toLocaleString("en-US", { maximumFractionDigits: 8 })}`,
    `24h change: ${change === null ? "Unavailable" : `${change.toFixed(2)}%`}`,
    `Direction: ${direction}`,
    `Heuristic confidence: ${confidence}%`,
    `Timeframe: ${timeframe}`,
    "",
    `Potential entry zone: $${entryLow.toFixed(8)} – $${entryHigh.toFixed(8)}`,
    `Target estimate: ${target === null ? "Unavailable — neutral/insufficient signal" : `$${target.toFixed(8)}`}`,
    `Stop-loss reference: ${stop === null ? "Unavailable — neutral/insufficient signal" : `$${stop.toFixed(8)}`}`,
    `Action plan: ${action}`,
    "",
    `Range position: ${range === null ? "Unavailable" : `${range.toFixed(1)}%`}`,
    `Volume / market cap: ${volumeRatio === null ? "Unavailable" : `${volumeRatio.toFixed(2)}%`}`,
    ...(risks.length ? [`Risk flags: ${risks.join(" ")}`] : []),
    "",
    "⚠️ Rule-based estimates, not calibrated probabilities or financial advice. Levels are not guarantees.",
    "Analysis only. No trade has been placed.",
    "Source: CoinGecko",
  ].join("\n");
}
