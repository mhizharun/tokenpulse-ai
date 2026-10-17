import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ledgerPath = '/tmp/tokenpulse-ai-demo-ledger.json';

type Trade = {
  type: 'BUY' | 'SELL';
  symbol: string;
  amount: number;
  quantity: number;
  price: number;
  time: string;
};

type Ledger = {
  startingBalance: number;
  cash: number;
  holdings: Record<string, number>;
  history: Trade[];
};

export async function loadLedger(): Promise<Ledger> {
  try {
    return JSON.parse(await readFile(ledgerPath, 'utf8')) as Ledger;
  } catch {
    const initialLedger: Ledger = {
      startingBalance: 10000,
      cash: 10000,
      holdings: {},
      history: [],
    };

    await saveLedger(initialLedger);
    return initialLedger;
  }
}

async function saveLedger(ledger: Ledger): Promise<void> {
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
}

export async function demoBuy(
  symbolInput: string,
  amount: number,
  price: number,
): Promise<string> {
  const symbol = symbolInput.trim().toUpperCase();

  if (!/^[A-Z0-9]{2,15}$/.test(symbol)) {
    return 'Invalid symbol. Use a symbol such as BTC or ETH.';
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Amount must be a positive number.';
  }
  if (!Number.isFinite(price) || price <= 0) {
    return 'A valid demo price is required. No trade was recorded.';
  }

  const ledger = await loadLedger();

  if (amount > ledger.cash) {
    return `Insufficient demo cash. Available: $${ledger.cash.toFixed(2)}.`;
  }

  const quantity = amount / price;
  ledger.cash -= amount;
  ledger.holdings[symbol] = (ledger.holdings[symbol] ?? 0) + quantity;
  ledger.history.push({
    type: 'BUY',
    symbol,
    amount,
    quantity,
    price,
    time: new Date().toISOString(),
  });

  await saveLedger(ledger);

  return `🟢 DEMO BUY RECORDED\nSymbol: ${symbol}\nSpent: $${amount.toFixed(2)}\nDemo price: $${price.toFixed(4)}\nQuantity: ${quantity.toFixed(8)}\nCash remaining: $${ledger.cash.toFixed(2)}\n\nNo real trade was executed.`;
}

export async function demoSell(
  symbolInput: string,
  quantity: number,
  price: number,
): Promise<string> {
  const symbol = symbolInput.trim().toUpperCase();

  if (!/^[A-Z0-9]{2,15}$/.test(symbol)) {
    return 'Invalid symbol. Use a symbol such as BTC or ETH.';
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 'Quantity must be a positive number.';
  }
  if (!Number.isFinite(price) || price <= 0) {
    return 'A valid demo price is required. No trade was recorded.';
  }

  const ledger = await loadLedger();
  const owned = ledger.holdings[symbol] ?? 0;

  if (quantity > owned + 1e-10) {
    return `Insufficient demo holdings. You have ${owned.toFixed(8)} ${symbol}.`;
  }

  const soldQuantity = Math.min(quantity, owned);
  const proceeds = soldQuantity * price;
  const remaining = Math.max(0, owned - soldQuantity);

  if (remaining < 1e-10) {
    delete ledger.holdings[symbol];
  } else {
    ledger.holdings[symbol] = remaining;
  }

  ledger.cash += proceeds;
  ledger.history.push({
    type: 'SELL',
    symbol,
    amount: proceeds,
    quantity: soldQuantity,
    price,
    time: new Date().toISOString(),
  });

  await saveLedger(ledger);

  return `🔴 DEMO SELL RECORDED\nSymbol: ${symbol}\nQuantity: ${soldQuantity.toFixed(8)}\nDemo price: $${price.toFixed(4)}\nProceeds: $${proceeds.toFixed(2)}\nCash available: $${ledger.cash.toFixed(2)}\n\nNo real trade was executed.`;
}

export async function demoBalance(): Promise<string> {
  const ledger = await loadLedger();
  return `💵 Demo cash: $${ledger.cash.toFixed(2)}\nStarting balance: $${ledger.startingBalance.toFixed(2)}\nHoldings: ${Object.keys(ledger.holdings).length} symbols\n\nPrices and portfolio value are not live or marked to market.`;
}

export async function demoPortfolio(): Promise<string> {
  const ledger = await loadLedger();
  const entries = Object.entries(ledger.holdings);

  if (entries.length === 0) {
    return `📁 Your demo portfolio is empty.\nDemo cash: $${ledger.cash.toFixed(2)}`;
  }

  return `📁 DEMO PORTFOLIO\nCash: $${ledger.cash.toFixed(2)}\n\n` +
    entries.map(([symbol, quantity]) =>
      `${symbol}: ${quantity.toFixed(8)} units`,
    ).join('\n') +
    '\n\nHoldings are quantities only; live values are not calculated.';
}

export async function demoHistory(): Promise<string> {
  const ledger = await loadLedger();
  const recent = ledger.history.slice(-10).reverse();

  if (recent.length === 0) {
    return '🧾 No demo trades recorded yet.';
  }

  return '🧾 RECENT DEMO TRADES\n\n' +
    recent.map((trade) =>
      `${trade.type} ${trade.symbol}\n` +
      `Quantity: ${trade.quantity.toFixed(8)}\n` +
      `Price: $${trade.price.toFixed(4)}\n` +
      `Amount: $${trade.amount.toFixed(2)}\n` +
      `${trade.time}`,
    ).join('\n\n');
}
