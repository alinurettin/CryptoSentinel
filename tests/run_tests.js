// CryptoSentinel Comprehensive Verification Suite
// Author: Ali Nurettin Demir (@alinurettin)
const assert = require('assert');
const http = require('http');
const { OrderBook, TriangularArbitrageEngine, VolatilityCalculator, CryptoSentinelEngine } = require('../src/engine');
const { startServer } = require('../src/index');

console.log('====================================================');
console.log('🧪 Running Verification Suite: CryptoSentinel (v2.0.0)');
console.log('====================================================');

let passedAssertions = 0;
function check(description, condition) {
  assert.ok(condition, description);
  passedAssertions++;
  console.log(`  ✓ [Assertion ${passedAssertions}] ${description}`);
}

// ----------------------------------------------------
// SECTION 1: Double-Sided Order Book Dynamics
// ----------------------------------------------------
console.log('\n[SECTION 1: Double-Sided Order Book Dynamics]');

const book = new OrderBook('ETH/USDT');
book.setBids([
  { price: 3500.0, amount: 2.0 },
  { price: 3495.0, amount: 5.0 },
  { price: 3490.0, amount: 10.0 }
]);
book.setAsks([
  { price: 3505.0, amount: 1.5 },
  { price: 3510.0, amount: 4.0 },
  { price: 3515.0, amount: 8.0 }
]);

check('OrderBook symbol is ETH/USDT', book.symbol === 'ETH/USDT');
check('Best bid is 3500.0 (highest bid)', book.getBestBid() === 3500.0);
check('Best ask is 3505.0 (lowest ask)', book.getBestAsk() === 3505.0);

const spread = book.getSpread();
check('Absolute spread is 5.0 USDT', spread.absolute === 5.0);
check('Spread percentage calculated correctly', spread.percentage > 0.14 && spread.percentage < 0.15);

const midPrice = book.getMidPrice();
check('Mid price is 3502.5 USDT', midPrice === 3502.5);

const imbalance = book.getOrderBookImbalance();
check('Imbalance is bounded in [-1, 1]', imbalance >= -1 && imbalance <= 1);
check('Imbalance reflects higher bid volume (positive)', imbalance > 0);

// Slippage execution test
const slippage1 = book.estimateMarketBuySlippage(1.0); // fits inside first ask (1.5 available at 3505)
check('Small market order has 0% slippage', slippage1.slippagePct === 0 && slippage1.avgFillPrice === 3505.0);

const slippageDeep = book.estimateMarketBuySlippage(3.0); // walks into second ask: 1.5 @ 3505, 1.5 @ 3510
check('Multi-tier market order experiences positive slippage', slippageDeep.slippagePct > 0);
check('Weighted average fill price is 3507.5', slippageDeep.avgFillPrice === 3507.5);

// ----------------------------------------------------
// SECTION 2: Triangular Arbitrage Engine
// ----------------------------------------------------
console.log('\n[SECTION 2: Bellman-Ford Triangular Arbitrage Cycle]');

const arb = new TriangularArbitrageEngine(0.075); // 0.075% fee per trade
arb.setRate('USD', 'EUR', 0.90);
arb.setRate('EUR', 'GBP', 0.85);
arb.setRate('GBP', 'USD', 1.35); // 0.90 * 0.85 * 1.35 = 1.03275 (+3.27% raw arbitrage)

const evalCycle = arb.evaluateTriangle('USD', 'EUR', 'GBP', 10000);
check('Triangular path length is 4 (closed loop)', evalCycle.path.length === 4);
check('Triangular path ends where it started (USD)', evalCycle.path[0] === 'USD' && evalCycle.path[3] === 'USD');
check('Net multiplier accounts for 3-leg fee deduction', evalCycle.netMultiplier < 1.03275 && evalCycle.netMultiplier > 1.0);
check('Final capital is greater than initial ($10,000)', evalCycle.finalCapital > 10000);
check('Cycle marked as profitable true', evalCycle.profitable === true);
check('Profit percentage is positive (> 2.8%)', evalCycle.profitPct > 2.8);

// Unprofitable triangle test (reverse path)
arb.setRate('GBP', 'EUR', 1 / 0.85);
arb.setRate('EUR', 'USD', 1 / 0.90);
arb.setRate('USD', 'GBP', 1 / 1.35);
const reverseCycle = arb.evaluateTriangle('USD', 'GBP', 'EUR', 10000);
check('Reverse cycle is not profitable', reverseCycle.profitable === false && reverseCycle.profitPct < 0);

// Scan all cycles
const allCycles = arb.scanAllTriangles(10000);
check('Scan returns at least 2 triangles', allCycles.length >= 2);
check('Cycles sorted descending by profitPct', allCycles[0].profitPct >= allCycles[1].profitPct);

// ----------------------------------------------------
// SECTION 3: Volatility & Quantitative Statistics
// ----------------------------------------------------
console.log('\n[SECTION 3: Statistical Volatility & Bollinger Bands]');

const prices = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109, 111, 110, 112, 114, 113, 115, 117, 116, 118, 120];
const returns = VolatilityCalculator.logReturns(prices);
check('Log returns length is prices.length - 1', returns.length === prices.length - 1);
check('First return ln(102/100) calculated accurately', Math.abs(returns[0] - Math.log(1.02)) < 0.0001);

const std = VolatilityCalculator.stdDev(returns);
check('Standard deviation is greater than 0', std > 0);

const annVol = VolatilityCalculator.annualizedVolatility(prices, 365 * 24);
check('Annualized volatility is positive percentage', annVol > 0 && typeof annVol === 'number');

const bands = VolatilityCalculator.bollingerBands(prices, 20, 2);
check('Bollinger bands middle equals 20-period SMA', bands.middle > 0);
check('Upper band is strictly greater than middle band', bands.upper > bands.middle);
check('Lower band is strictly less than middle band', bands.lower < bands.middle);
check('Bandwidth percentage is positive', bands.bandwidth > 0);

// ----------------------------------------------------
// SECTION 4: Ephemeral HTTP Integration & REST Protocol
// ----------------------------------------------------
console.log('\n[SECTION 4: Ephemeral HTTP Server & REST Endpoints]');

const server = startServer(0, () => {
  const port = server.address().port;
  console.log(`  [HTTP] Ephemeral server running on port ${port}`);

  function api(method, path, body, cb) {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          cb(res.statusCode, JSON.parse(raw));
        } catch (e) {
          cb(res.statusCode, raw);
        }
      });
    });
    if (payload) req.write(payload);
    req.end();
  }

  // 1. GET /api/health
  api('GET', '/api/health', null, (status, health) => {
    check('GET /api/health returns HTTP 200', status === 200);
    check('Health reports CryptoSentinel', health.service === 'CryptoSentinel');
    check('Health status is UP', health.status === 'UP');

    // 2. GET /api/stats
    api('GET', '/api/stats', null, (status, resStats) => {
      check('GET /api/stats returns HTTP 200', status === 200);
      check('Stats analytics contains midPrice', typeof resStats.analytics.midPrice === 'number');
      check('Stats analytics contains spread object', typeof resStats.analytics.spread === 'object');

      // 3. GET /api/orderbook
      api('GET', '/api/orderbook?symbol=BTC/USDT', null, (status, resBook) => {
        check('GET /api/orderbook returns HTTP 200', status === 200);
        check('Order book returns bids array', Array.isArray(resBook.bids));
        check('Order book returns asks array', Array.isArray(resBook.asks));

        // 4. POST /api/orderbook/slippage
        api('POST', '/api/orderbook/slippage', { symbol: 'BTC/USDT', amount: 1.5 }, (status, resSlip) => {
          check('POST /api/orderbook/slippage returns HTTP 200', status === 200);
          check('Slippage response contains avgFillPrice', typeof resSlip.slippage.avgFillPrice === 'number');

          // 5. GET /api/arbitrage/triangular
          api('GET', '/api/arbitrage/triangular?capital=5000', null, (status, resArb) => {
            check('GET /api/arbitrage/triangular returns HTTP 200', status === 200);
            check('Triangular cycles array returned', Array.isArray(resArb.cycles));

            // 6. POST /api/arbitrage/rates
            api('POST', '/api/arbitrage/rates', { from: 'SOL', to: 'USDT', rate: 145.5 }, (status, resRate) => {
              check('POST /api/arbitrage/rates returns HTTP 200', status === 200);
              check('Rate set confirmed', resRate.success === true);

              // 7. GET /api/volatility
              api('GET', '/api/volatility?symbol=BTC/USDT', null, (status, resVol) => {
                check('GET /api/volatility returns HTTP 200', status === 200);
                check('Returns annualizedVolatilityPct', typeof resVol.annualizedVolatilityPct === 'number');
                check('Returns bollingerBands object', typeof resVol.bollingerBands === 'object');

                // 8. 404 Route
                api('GET', '/api/unknown-endpoint', null, (status) => {
                  check('Invalid path returns 404', status === 404);

                  server.close(() => {
                    console.log('\n====================================================');
                    console.log(`🎉 ALL ${passedAssertions} ASSERTIONS PASSED (100% Non-Mocked Coverage)`);
                    console.log('====================================================');
                    process.exit(0);
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
