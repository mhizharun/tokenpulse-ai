import { Bot } from 'node-telegram-bot-api';
import { getMarketQuote } from './market-data.js';
import { getCryptoSignal } from './crypto-signals.js';
import {
  demoBalance,
  demoBuy,
  demoSell,
  demoPortfolio,
  demoHistory,
} from './demo-trading.js';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token || token === 'YOUR_ACTUAL_BOT_TOKEN') {
  throw new Error('TELEGRAM_BOT_TOKEN is missing. Configure it in your local .env file.');
}

const bot = new Bot(token);

bot.command('start', async (ctx) => {
  await ctx.reply(
    '🚀 Welcome to TokenPulse Trading Demo!\n\n' +
    '💵 Starting demo balance: $10,000\n\n' +
    'Commands:\n' +
    '/balance - View demo cash\n' +
    '/buy SYMBOL AMOUNT PRICE - Simulate a buy\n' +
    '/sell SYMBOL QUANTITY PRICE - Simulate a sell\n' +
    '/portfolio - View holdings\n' +
    '/history - View trade history\n' +
    '/signals - View signal status\n' +
    '/help - Show commands\n\n' +
    '⚠️ Practice mode only. No real trades are executed.\n' +
    'Prices are supplied manually for simulation.'
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    '📘 TokenPulse Demo Commands\n\n' +
    '/balance\n' +
    '/buy BTC 100 50000\n' +
    '/sell BTC 0.002 50000\n' +
    '/portfolio\n' +
    '/history\n' +
    '/signals\n\n' +
    'BUY format: /buy SYMBOL USD_AMOUNT DEMO_PRICE\n' +
    'SELL format: /sell SYMBOL QUANTITY DEMO_PRICE\n\n' +
    'All trades use simulated funds only.'
  );
});

bot.command('balance', async (ctx) => {
  try {
    await ctx.reply(await demoBalance());
  } catch (error) {
    console.error('Demo balance error:', error);
    await ctx.reply('Could not read the demo ledger. Please check the ledger file.');
  }
});

bot.command('price', async (ctx) => {
  const messageText = (ctx.message as { text?: string } | undefined)?.text ?? '';
  const parts = messageText.trim().split(/\s+/);
  const symbol = parts[1];

  if (!symbol) {
    await ctx.reply('Usage: /price SYMBOL\nExample: /price BTC');
    return;
  }

  try {
    const quote = await getMarketQuote(symbol);
    await ctx.reply(
      `📈 ${quote.symbol} Market Quote\n\n` +
      `💵 Price: ${quote.currency} ${quote.price.toLocaleString('en-US', { maximumFractionDigits: 8 })}\n` +
      `🔎 Source: Yahoo Finance\n\n` +
      `Quotes may be delayed. This is market information, not a trade.`
    );
  } catch (error) {
    console.error('Market quote error:', error);
    await ctx.reply(`Could not fetch a quote for ${symbol.toUpperCase()}. Check the symbol and try again.`);
  }
});

bot.command('buy', async (ctx) => {
  const messageText = (ctx.message as { text?: string } | undefined)?.text ?? '';
  const parts = messageText.trim().split(/\s+/);

  if (parts.length !== 3 && parts.length !== 4) {
    await ctx.reply(
      'Usage: /buy SYMBOL USD_AMOUNT [DEMO_PRICE]\n' +
      'Examples:\n/buy BTC 100\n/buy BTC 100 50000'
    );
    return;
  }

  const symbol = parts[1];
  const amount = Number(parts[2]);
  const manualPrice = parts.length === 4 ? Number(parts[3]) : undefined;

  if (!symbol || !Number.isFinite(amount) || amount <= 0 ||
      (manualPrice !== undefined && (!Number.isFinite(manualPrice) || manualPrice <= 0))) {
    await ctx.reply('Invalid amount or price. Amount and price must be greater than zero.');
    return;
  }

  try {
    const quote = manualPrice === undefined ? await getMarketQuote(symbol) : null;
    const price = manualPrice ?? quote!.price;
    const result = await demoBuy(symbol, amount, price);
    await ctx.reply(
      result +
      (quote ? `\n\n📈 Reference price: ${quote.currency} ${price.toLocaleString('en-US', { maximumFractionDigits: 8 })} (Yahoo Finance; may be delayed).` : '\n\nPrice entered manually for simulation.') +
      '\n\n⚠️ Demo only. No real order was placed.'
    );
  } catch (error) {
    console.error('Demo buy error:', error);
    await ctx.reply('Could not complete the demo buy. Check your balance, symbol, and ledger file.');
  }
});

bot.command('sell', async (ctx) => {
  const messageText = (ctx.message as { text?: string } | undefined)?.text ?? '';
  const parts = messageText.trim().split(/\s+/);

  if (parts.length !== 3 && parts.length !== 4) {
    await ctx.reply(
      'Usage: /sell SYMBOL QUANTITY [DEMO_PRICE]\n' +
      'Examples:\n/sell BTC 0.001\n/sell BTC 0.001 50000'
    );
    return;
  }

  const symbol = parts[1];
  const quantity = Number(parts[2]);
  const manualPrice = parts.length === 4 ? Number(parts[3]) : undefined;

  if (!symbol || !Number.isFinite(quantity) || quantity <= 0 ||
      (manualPrice !== undefined && (!Number.isFinite(manualPrice) || manualPrice <= 0))) {
    await ctx.reply('Invalid quantity or price. Both must be greater than zero.');
    return;
  }

  try {
    const quote = manualPrice === undefined ? await getMarketQuote(symbol) : null;
    const price = manualPrice ?? quote!.price;
    const result = await demoSell(symbol, quantity, price);
    await ctx.reply(
      result +
      (quote ? `\n\n📈 Reference price: ${quote.currency} ${price.toLocaleString('en-US', { maximumFractionDigits: 8 })} (Yahoo Finance; may be delayed).` : '\n\nPrice entered manually for simulation.') +
      '\n\n⚠️ Demo only. No real order was placed.'
    );
  } catch (error) {
    console.error('Demo sell error:', error);
    await ctx.reply('Could not complete the demo sell. Check your holdings, quantity, and ledger file.');
  }
});

bot.command('portfolio', async (ctx) => {
  try {
    await ctx.reply(await demoPortfolio());
  } catch (error) {
    console.error('Demo portfolio error:', error);
    await ctx.reply('Could not read your demo portfolio.');
  }
});

bot.command('history', async (ctx) => {
  try {
    await ctx.reply(await demoHistory());
  } catch (error) {
    console.error('Demo history error:', error);
    await ctx.reply('Could not read your demo trade history.');
  }
});

bot.command('signals', async (ctx) => {
  const messageText = (ctx.message as { text?: string } | undefined)?.text ?? '';
  const parts = messageText.trim().split(/\s+/);
  const symbol = parts[1] ?? 'BTC';
  const timeframeInput = parts[2] ?? '24h';

  if (!['24h', '3d', '7d'].includes(timeframeInput)) {
    await ctx.reply('Usage: /signals SYMBOL [24h|3d|7d]\nExample: /signals BTC 24h');
    return;
  }

  try {
    await ctx.reply('🔎 Fetching market data and calculating a rule-based signal...');
    const result = await getCryptoSignal(
      symbol,
      timeframeInput as '24h' | '3d' | '7d',
    );
    await ctx.reply(result);
  } catch (error) {
    console.error('Crypto signal error:', error);
    await ctx.reply(error instanceof Error ? error.message : 'Could not calculate the signal. Please try again.');
  }
});

bot.catch((error) => {
  console.error('Telegram bot error:', error);
});

await bot.startPolling();
console.log('TokenPulse Trading Demo is running in practice mode.');
