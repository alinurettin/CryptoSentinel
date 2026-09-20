class CryptoArbitrageEngine {
  calculateSpread(bidPrice, askPrice) {
    if (bidPrice <= 0 || askPrice <= 0) return 0;
    return parseFloat((((askPrice - bidPrice) / bidPrice) * 100).toFixed(4));
  }
  calculateVolatility(prices) {
    if (!prices || prices.length < 2) return 0;
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((acc, p) => acc + Math.pow(p - mean, 2), 0) / prices.length;
    return parseFloat(Math.sqrt(variance).toFixed(4));
  }
  evaluateArbitrage(exchangeA, priceA, exchangeB, priceB, thresholdPercent = 0.5) {
    const spread = this.calculateSpread(Math.min(priceA, priceB), Math.max(priceA, priceB));
    return {
      profitable: spread >= thresholdPercent,
      spreadPercent: spread,
      buyExchange: priceA < priceB ? exchangeA : exchangeB,
      sellExchange: priceA < priceB ? exchangeB : exchangeA,
      netOpportunity: parseFloat((Math.abs(priceA - priceB)).toFixed(2))
    };
  }
}
module.exports = CryptoArbitrageEngine;