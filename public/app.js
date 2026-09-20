// CryptoSentinel Client Application
document.addEventListener('DOMContentLoaded', () => {
  const statMidPrice = document.getElementById('statMidPrice');
  const statSpread = document.getElementById('statSpread');
  const statSpreadPct = document.getElementById('statSpreadPct');
  const statImbalance = document.getElementById('statImbalance');
  const statImbalanceLabel = document.getElementById('statImbalanceLabel');
  const statVolatility = document.getElementById('statVolatility');

  const capitalInput = document.getElementById('capitalInput');
  const scanArbBtn = document.getElementById('scanArbBtn');
  const arbCardsGrid = document.getElementById('arbCardsGrid');

  const bidsList = document.getElementById('bidsList');
  const asksList = document.getElementById('asksList');

  const slippageForm = document.getElementById('slippageForm');
  const tradeSizeInput = document.getElementById('tradeSizeInput');
  const slipBestAsk = document.getElementById('slipBestAsk');
  const slipAvgPrice = document.getElementById('slipAvgPrice');
  const slipPct = document.getElementById('slipPct');

  const bandUpper = document.getElementById('bandUpper');
  const bandMiddle = document.getElementById('bandMiddle');
  const bandLower = document.getElementById('bandLower');
  const bandWidth = document.getElementById('bandWidth');

  const refreshBtn = document.getElementById('refreshBtn');

  // Load telemetry stats & analytics
  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success && data.analytics) {
        const a = data.analytics;
        statMidPrice.textContent = `$${a.midPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        if (a.spread) {
          statSpread.textContent = `$${a.spread.absolute.toFixed(2)}`;
          statSpreadPct.textContent = `${a.spread.percentage.toFixed(4)}% spread`;
        }

        statImbalance.textContent = a.orderBookImbalance.toFixed(4);
        statImbalanceLabel.textContent = a.orderBookImbalance > 0 ? '🟢 Buy Depth Dominant' : '🔴 Sell Depth Dominant';
        statVolatility.textContent = `${a.annualizedVolatilityPct.toFixed(2)}%`;
      }
    } catch (e) {
      console.error('Failed to load stats', e);
    }
  }

  // Load Order Book Depth
  async function loadOrderBook() {
    try {
      const res = await fetch('/api/orderbook?symbol=BTC/USDT');
      const data = await res.json();
      if (data.success) {
        renderOrderBook(data.bids, data.asks);
      }
    } catch (e) {
      console.error('Failed to load order book', e);
    }
  }

  function renderOrderBook(bids, asks) {
    bidsList.innerHTML = '';
    bids.forEach(b => {
      const row = document.createElement('div');
      row.className = 'book-row bid';
      row.innerHTML = `
        <span>$${b.price.toFixed(2)}</span>
        <span>${b.amount.toFixed(4)} BTC</span>
      `;
      bidsList.appendChild(row);
    });

    asksList.innerHTML = '';
    asks.forEach(a => {
      const row = document.createElement('div');
      row.className = 'book-row ask';
      row.innerHTML = `
        <span>$${a.price.toFixed(2)}</span>
        <span>${a.amount.toFixed(4)} BTC</span>
      `;
      asksList.appendChild(row);
    });
  }

  // Load Triangular Arbitrage
  async function loadArbitrage(capital = 10000) {
    try {
      const res = await fetch(`/api/arbitrage/triangular?capital=${capital}`);
      const data = await res.json();
      if (data.success && data.cycles) {
        renderArbitrage(data.cycles);
      }
    } catch (e) {
      console.error('Failed to load arbitrage', e);
    }
  }

  function renderArbitrage(cycles) {
    if (cycles.length === 0) {
      arbCardsGrid.innerHTML = '<div class="empty-state">No triangular loops registered.</div>';
      return;
    }

    arbCardsGrid.innerHTML = '';
    cycles.forEach(c => {
      const card = document.createElement('div');
      card.className = `arb-card ${c.profitable ? 'profitable' : ''}`;
      const pathStr = c.path.join(' ➔ ');
      const profitColor = c.profitable ? '#10b981' : '#94a3b8';

      card.innerHTML = `
        <div class="arb-path">${pathStr}</div>
        <div class="arb-stats">
          <span>Initial: $${c.initialCapital.toLocaleString()}</span>
          <span>Final: $${c.finalCapital.toLocaleString()}</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
          <span style="font-size:0.75rem; color:#94a3b8;">Multiplier: ${c.netMultiplier}x</span>
          <span class="arb-profit" style="color:${profitColor}">
            ${c.profitable ? '+' : ''}${c.profitPct.toFixed(3)}%
          </span>
        </div>
      `;
      arbCardsGrid.appendChild(card);
    });
  }

  // Load Volatility & Bollinger Bands
  async function loadVolatility() {
    try {
      const res = await fetch('/api/volatility?symbol=BTC/USDT');
      const data = await res.json();
      if (data.success && data.bollingerBands) {
        const b = data.bollingerBands;
        bandUpper.textContent = `$${b.upper.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        bandMiddle.textContent = `$${b.middle.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        bandLower.textContent = `$${b.lower.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        bandWidth.textContent = `${b.bandwidth.toFixed(2)}%`;
      }
    } catch (e) {
      console.error('Failed to load volatility', e);
    }
  }

  // Handle Slippage Simulation
  slippageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(tradeSizeInput.value);
    if (!amount || amount <= 0) return;

    try {
      const res = await fetch('/api/orderbook/slippage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'BTC/USDT', amount })
      });
      const data = await res.json();
      if (data.success && data.slippage) {
        const s = data.slippage;
        slipBestAsk.textContent = `$${s.bestAsk.toFixed(2)}`;
        slipAvgPrice.textContent = `$${s.avgFillPrice.toFixed(2)}`;
        slipPct.textContent = `+${s.slippagePct.toFixed(4)}%`;
      } else {
        alert('Slippage calculation error: ' + (data.error || 'insufficient depth'));
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    }
  });

  scanArbBtn.addEventListener('click', () => {
    const cap = parseFloat(capitalInput.value) || 10000;
    loadArbitrage(cap);
  });

  refreshBtn.addEventListener('click', () => {
    loadStats();
    loadOrderBook();
    loadArbitrage(parseFloat(capitalInput.value) || 10000);
    loadVolatility();
  });

  // Init
  loadStats();
  loadOrderBook();
  loadArbitrage(10000);
  loadVolatility();
  // Trigger initial slippage estimate
  slippageForm.dispatchEvent(new Event('submit'));
  setInterval(loadStats, 5000);
});
