import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
});

const cryptoSymbols: Record<string, string> = {
  BTC: 'BTC-USD',
  ETH: 'ETH-USD',
  SOL: 'SOL-USD',
  BNB: 'BNB-USD',
  XRP: 'XRP-USD',
  DOGE: 'DOGE-USD',
};

export async function getMarketQuote(symbolInput: string) {
  const symbol = symbolInput.trim().toUpperCase();

  if (!symbol) {
    throw new Error('Please provide a symbol.');
  }

  const yahooSymbol = cryptoSymbols[symbol] ?? symbol;
  const quote = await yahooFinance.quote(yahooSymbol);
  const price = quote.regularMarketPrice;

  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    throw new Error(`No valid market price returned for ${yahooSymbol}.`);
  }

  return {
    symbol,
    yahooSymbol,
    price,
    currency: quote.currency ?? 'USD',
  };
}
