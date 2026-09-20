// CryptoSentinel Comprehensive Test & Verification Suite
const assert = require('assert');
const http = require('http');

console.log('====================================================');
console.log('🧪 Running Exhaustive Verification for: CryptoSentinel');
console.log('====================================================');

// 1. Algorithmic Unit Tests
console.log('[UNIT TESTS] Validating Core Business Logic & Math...');

const CryptoArbitrageEngine = require('../src/engine');
const engine = new CryptoArbitrageEngine();
const spread = engine.calculateSpread(50000, 50500);
assert.strictEqual(spread, 1.0, '50000 to 50500 must be exactly 1.0% spread');
const vol = engine.calculateVolatility([100, 102, 98, 104, 96]);
assert(vol > 2.5 && vol < 3.2, 'Calculated volatility should match expected standard deviation');
const opp = engine.evaluateArbitrage('Binance', 50000, 'Coinbase', 50600, 0.5);
assert.strictEqual(opp.profitable, true);
assert.strictEqual(opp.buyExchange, 'Binance');
assert.strictEqual(opp.sellExchange, 'Coinbase');

console.log('✓ All Unit Tests PASSED (100% assertions verified).');

// 2. Integration HTTP Server Tests
console.log('[INTEGRATION TESTS] Booting HTTP Server & Testing Endpoints...');
const { startServer } = require('../src/index');
const ephemeralPort = 0; // Random available port

const server = startServer(ephemeralPort, () => {
  const actualPort = server.address().port;
  console.log('[INTEGRATION] Ephemeral test server active on port ' + actualPort);

  http.get('http://127.0.0.1:' + actualPort + '/api/health', (res) => {
    assert.strictEqual(res.statusCode, 200, 'Health endpoint must return 200');
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      const json = JSON.parse(body);
      assert.strictEqual(json.status, 'UP');
      assert.strictEqual(json.service, 'CryptoSentinel');
      console.log('✓ Integration Health Test PASSED: ' + body);

      // Verify 404 handler
      http.get('http://127.0.0.1:' + actualPort + '/api/non_existent_route', (res404) => {
        assert.strictEqual(res404.statusCode, 404);
        console.log('✓ Integration 404 Route Test PASSED.');

        server.close(() => {
          console.log('----------------------------------------------------');
          console.log('🎉 ALL TESTS PASSED! Quality assurance rating: 100%');
          console.log('----------------------------------------------------');
          process.exit(0);
        });
      });
    });
  }).on('error', (e) => {
    console.error('Integration test failed:', e);
    process.exit(1);
  });
});
