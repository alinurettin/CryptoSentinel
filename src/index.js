// CryptoSentinel - Production Quantitative Trading & Market Arbitrage Server
const http = require('http');
const fs = require('fs');
const path = require('path');
const { OrderBook, TriangularArbitrageEngine, VolatilityCalculator, CryptoSentinelEngine } = require('./engine');

const engine = new CryptoSentinelEngine();
const PORT = parseInt(process.env.PORT, 10) || 6004;
const publicDir = path.join(__dirname, '..', 'public');
const startTime = Date.now();

function requestHandler(req, res) {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    // 1. Health
    if (pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        status: 'UP',
        service: 'CryptoSentinel',
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString()
      }));
    }

    // 2. Comprehensive Market Analytics
    if (pathname === '/api/stats') {
      const analytics = engine.getAnalytics('BTC/USDT');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        success: true,
        service: 'CryptoSentinel',
        analytics,
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000)
      }));
    }

    // 3. Order Book Depth
    if (req.method === 'GET' && pathname === '/api/orderbook') {
      const symbol = parsed.searchParams.get('symbol') || 'BTC/USDT';
      const book = engine.getOrderBook(symbol);
      if (!book) {
        res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: false, error: 'Symbol not found' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        success: true,
        symbol: book.symbol,
        bids: book.bids,
        asks: book.asks,
        spread: book.getSpread(),
        imbalance: book.getOrderBookImbalance()
      }));
    }

    // 4. Slippage Estimation
    if (req.method === 'POST' && pathname === '/api/orderbook/slippage') {
      try {
        const payload = JSON.parse(body || '{}');
        const symbol = payload.symbol || 'BTC/USDT';
        const amount = parseFloat(payload.amount || 1.0);
        const book = engine.getOrderBook(symbol);
        if (!book) {
          res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({ success: false, error: 'Symbol not found' }));
        }
        const slippage = book.estimateMarketBuySlippage(amount);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: true, symbol, slippage }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }

    // 5. Triangular Arbitrage Scanner
    if (req.method === 'GET' && pathname === '/api/arbitrage/triangular') {
      const initialCapital = parseFloat(parsed.searchParams.get('capital') || '1000');
      const cycles = engine.arbitrage.scanAllTriangles(initialCapital);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        success: true,
        initialCapital,
        takerFeePct: 0.075,
        opportunitiesCount: cycles.length,
        cycles
      }));
    }

    // 6. Set Conversion Rate for Arbitrage
    if (req.method === 'POST' && pathname === '/api/arbitrage/rates') {
      try {
        const payload = JSON.parse(body || '{}');
        const { from, to, rate } = payload;
        if (!from || !to || !rate || rate <= 0) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({ success: false, error: 'Invalid from, to, or rate' }));
        }
        engine.arbitrage.setRate(from, to, parseFloat(rate));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: true, rateSet: `${from}->${to} = ${rate}` }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }

    // 7. Volatility & Bollinger Bands
    if (req.method === 'GET' && pathname === '/api/volatility') {
      const symbol = parsed.searchParams.get('symbol') || 'BTC/USDT';
      const prices = engine.getPriceHistory(symbol);
      const annVol = VolatilityCalculator.annualizedVolatility(prices);
      const bands = VolatilityCalculator.bollingerBands(prices);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        success: true,
        symbol,
        pricesCount: prices.length,
        annualizedVolatilityPct: annVol,
        bollingerBands: bands
      }));
    }

    // 8. Static Web UI Files
    let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      return res.end(fs.readFileSync(filePath));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint Not Found', path: pathname }));
  });
}

function startServer(portToUse = PORT, callback) {
  const server = http.createServer(requestHandler);
  server.listen(portToUse, () => {
    if (callback) callback(server);
  });
  return server;
}

if (require.main === module) {
  startServer(PORT, () => {
    console.log('⚡ CryptoSentinel live on port ' + PORT);
  });
}

module.exports = { startServer, requestHandler, engine };
