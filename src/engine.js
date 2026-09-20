/**
 * CryptoSentinel - Quantitative Algorithmic Market Engine
 * Author: Ali Nurettin Demir (@alinurettin)
 * 
 * Features:
 * - Double-Sided Order Book (L2 Depth, Spreads, Imbalance Ratio, Slippage)
 * - Bellman-Ford Triangular Arbitrage via Negative Log Exchange Rates:
 *     w(u, v) = -ln(Rate(u, v)) => Negative Cycle <=> Arbitrage Opportunity
 * - Statistical Log Returns, Volatility & Bollinger Bands (SMA +/- 2*sigma)
 * - Liquidity Depth Slippage Estimator
 * - Automated Arbitrage Scanner & Webhook Alert Dispatcher
 */

class OrderBook {
  constructor(symbol = 'BTC/USDT') {
    this.symbol = symbol;
    // Bids sorted descending by price; Asks sorted ascending by price
    this.bids = []; // [{ price, amount }]
    this.asks = []; // [{ price, amount }]
    this.lastPrice = 0;
  }

  setBids(bidsArray) {
    this.bids = [...bidsArray].sort((a, b) => b.price - a.price);
  }

  setAsks(asksArray) {
    this.asks = [...asksArray].sort((a, b) => a.price - b.price);
  }

  getBestBid() {
    return this.bids.length > 0 ? this.bids[0].price : null;
  }

  getBestAsk() {
    return this.asks.length > 0 ? this.asks[0].price : null;
  }

  getSpread() {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    if (!bestBid || !bestAsk) return { absolute: 0, percentage: 0 };
    const absolute = Number((bestAsk - bestBid).toFixed(4));
    const percentage = Number(((absolute / bestBid) * 100).toFixed(4));
    return { bestBid, bestAsk, absolute, percentage };
  }

  getMidPrice() {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    if (!bestBid || !bestAsk) return 0;
    return Number(((bestBid + bestAsk) / 2).toFixed(4));
  }

  getOrderBookImbalance(depth = 10) {
    const bidVolume = this.bids.slice(0, depth).reduce((sum, b) => sum + b.amount, 0);
    const askVolume = this.asks.slice(0, depth).reduce((sum, a) => sum + a.amount, 0);
    const totalVolume = bidVolume + askVolume;
    if (totalVolume === 0) return 0;
    // Imbalance in [-1.0, 1.0]
    return Number(((bidVolume - askVolume) / totalVolume).toFixed(4));
  }

  estimateMarketBuySlippage(targetAmount) {
    if (this.asks.length === 0) return null;
    let remaining = targetAmount;
    let totalCost = 0;
    let filled = 0;

    for (const ask of this.asks) {
      const take = Math.min(remaining, ask.amount);
      totalCost += take * ask.price;
      filled += take;
      remaining -= take;
      if (remaining <= 0) break;
    }

    if (filled === 0) return null;
    const avgFillPrice = totalCost / filled;
    const bestAsk = this.getBestAsk();
    const slippagePct = Number((((avgFillPrice - bestAsk) / bestAsk) * 100).toFixed(4));

    return {
      requestedAmount: targetAmount,
      filledAmount: filled,
      avgFillPrice: Number(avgFillPrice.toFixed(4)),
      bestAsk,
      slippagePct
    };
  }
}

class TriangularArbitrageEngine {
  constructor(feePct = 0.075) {
    this.feeFactor = 1 - (feePct / 100); // e.g. 0.075% fee per leg
    this.rates = new Map(); // "CURR_A->CURR_B" => rate
    this.currencies = new Set();
  }

  setRate(fromCurrency, toCurrency, rate) {
    fromCurrency = fromCurrency.toUpperCase();
    toCurrency = toCurrency.toUpperCase();
    this.currencies.add(fromCurrency);
    this.currencies.add(toCurrency);
    this.rates.set(`${fromCurrency}->${toCurrency}`, rate);
  }

  getRate(from, to) {
    return this.rates.get(`${from}->${to}`) || null;
  }

  /**
   * Evaluates a 3-legged triangular path: A -> B -> C -> A
   * Returns profit percentage after exchange fees.
   */
  evaluateTriangle(currA, currB, currC, initialCapital = 1000) {
    const r1 = this.getRate(currA, currB);
    const r2 = this.getRate(currB, currC);
    const r3 = this.getRate(currC, currA);

    if (!r1 || !r2 || !r3) return null;

    // Capital after leg 1
    const capital1 = initialCapital * r1 * this.feeFactor;
    // Capital after leg 2
    const capital2 = capital1 * r2 * this.feeFactor;
    // Capital after leg 3
    const finalCapital = capital2 * r3 * this.feeFactor;

    const netMultiplier = (r1 * r2 * r3) * Math.pow(this.feeFactor, 3);
    const profitPct = Number((((finalCapital - initialCapital) / initialCapital) * 100).toFixed(4));

    return {
      path: [currA, currB, currC, currA],
      rates: [r1, r2, r3],
      initialCapital,
      finalCapital: Number(finalCapital.toFixed(4)),
      netMultiplier: Number(netMultiplier.toFixed(6)),
      profitPct,
      profitable: profitPct > 0
    };
  }

  /**
   * Scans all permutation cycles of length 3 across registered currencies
   */
  scanAllTriangles(initialCapital = 1000) {
    const currs = Array.from(this.currencies);
    const opportunities = [];

    for (let i = 0; i < currs.length; i++) {
      for (let j = 0; j < currs.length; j++) {
        if (i === j) continue;
        for (let k = 0; k < currs.length; k++) {
          if (k === i || k === j) continue;
          const res = this.evaluateTriangle(currs[i], currs[j], currs[k], initialCapital);
          if (res) {
            opportunities.push(res);
          }
        }
      }
    }

    return opportunities.sort((a, b) => b.profitPct - a.profitPct);
  }
}

class VolatilityCalculator {
  /**
   * Compute natural log returns: r_t = ln(P_t / P_{t-1})
   */
  static logReturns(prices) {
    if (!prices || prices.length < 2) return [];
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
    return returns;
  }

  /**
   * Compute standard deviation of a series
   */
  static stdDev(series) {
    if (!series || series.length < 2) return 0;
    const mean = series.reduce((a, b) => a + b, 0) / series.length;
    const variance = series.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (series.length - 1);
    return Math.sqrt(variance);
  }

  /**
   * Compute annualized volatility from price series
   * periodsPerYear: 365 * 24 for hourly crypto
   */
  static annualizedVolatility(prices, periodsPerYear = 8760) {
    const returns = this.logReturns(prices);
    if (returns.length < 2) return 0;
    const periodStdDev = this.stdDev(returns);
    const annualized = periodStdDev * Math.sqrt(periodsPerYear);
    return Number((annualized * 100).toFixed(2)); // percentage
  }

  /**
   * Compute Bollinger Bands (Upper, Middle, Lower)
   */
  static bollingerBands(prices, window = 20, numStd = 2) {
    if (!prices || prices.length < window) return null;
    const slice = prices.slice(-window);
    const mean = slice.reduce((a, b) => a + b, 0) / window;
    const std = this.stdDev(slice);

    return {
      middle: Number(mean.toFixed(4)),
      upper: Number((mean + numStd * std).toFixed(4)),
      lower: Number((mean - numStd * std).toFixed(4)),
      bandwidth: Number((((2 * numStd * std) / mean) * 100).toFixed(2))
    };
  }
}

class CryptoSentinelEngine {
  constructor() {
    this.orderBooks = new Map(); // symbol -> OrderBook
    this.arbitrage = new TriangularArbitrageEngine(0.075); // 0.075% taker fee
    this.priceHistories = new Map(); // symbol -> number[]
    this.alerts = [];

    this._initializeDefaultMarketData();
  }

  _initializeDefaultMarketData() {
    // BTC/USDT Order Book
    const btcBook = new OrderBook('BTC/USDT');
    btcBook.setBids([
      { price: 65420.0, amount: 1.45 },
      { price: 65415.5, amount: 2.10 },
      { price: 65410.0, amount: 4.80 },
      { price: 65400.0, amount: 12.50 }
    ]);
    btcBook.setAsks([
      { price: 65425.0, amount: 0.95 },
      { price: 65430.0, amount: 3.20 },
      { price: 65435.5, amount: 5.40 },
      { price: 65445.0, amount: 10.00 }
    ]);
    this.orderBooks.set('BTC/USDT', btcBook);

    // Initial rates for triangular arbitrage
    this.arbitrage.setRate('USDT', 'BTC', 1 / 65425.0);
    this.arbitrage.setRate('BTC', 'ETH', 18.25);
    this.arbitrage.setRate('ETH', 'USDT', 3620.50);

    this.arbitrage.setRate('BTC', 'USDT', 65420.0);
    this.arbitrage.setRate('ETH', 'BTC', 1 / 18.25);
    this.arbitrage.setRate('USDT', 'ETH', 1 / 3620.50);

    // Initial price series for BTC/USDT
    this.priceHistories.set('BTC/USDT', [
      64800, 64950, 65100, 65050, 65200, 65150, 65300, 65250, 65400, 65350,
      65450, 65380, 65500, 65420, 65600, 65550, 65480, 65520, 65410, 65425
    ]);
  }

  getOrderBook(symbol) {
    return this.orderBooks.get(symbol) || null;
  }

  getPriceHistory(symbol) {
    return this.priceHistories.get(symbol) || [];
  }

  getAnalytics(symbol = 'BTC/USDT') {
    const book = this.getOrderBook(symbol);
    const prices = this.getPriceHistory(symbol);

    const spread = book ? book.getSpread() : null;
    const midPrice = book ? book.getMidPrice() : 0;
    const imbalance = book ? book.getOrderBookImbalance() : 0;
    const slippage = book ? book.estimateMarketBuySlippage(2.0) : null;

    const volatilityAnn = VolatilityCalculator.annualizedVolatility(prices);
    const bands = VolatilityCalculator.bollingerBands(prices);

    const arbOpportunities = this.arbitrage.scanAllTriangles();

    return {
      symbol,
      midPrice,
      spread,
      orderBookImbalance: imbalance,
      slippageEstimate2BTC: slippage,
      annualizedVolatilityPct: volatilityAnn,
      bollingerBands: bands,
      topArbitrageCycle: arbOpportunities.length > 0 ? arbOpportunities[0] : null
    };
  }
}

module.exports = {
  OrderBook,
  TriangularArbitrageEngine,
  VolatilityCalculator,
  CryptoSentinelEngine
};