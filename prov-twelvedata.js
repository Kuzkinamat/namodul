// prov-twelvedata.js
// Twelve Data API Provider for Forex and Crypto Data

const TWELVEDATA_API_KEY = 'aa6331f5e6cc4e3491b731e0dda2955f';
const TWELVEDATA_API_URL = 'https://api.twelvedata.com';

// Common forex and crypto pairs
const DEFAULT_PAIRS = [
    // Forex majors
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD',
    'EUR/GBP', 'EUR/JPY', 'EUR/CHF', 'GBP/JPY', 'CHF/JPY',
    
    // Crypto majors
    'BTC/USD', 'ETH/USD', 'BNB/USD', 'XRP/USD', 'ADA/USD',
    
    // Indices
    'SPX', 'DJI', 'IXIC', 'RUT',
    
    // Commodities
    'XAU/USD', 'XAG/USD', 'CL/USD'
];

window.TwelveDataProvider = {
    apiKey: TWELVEDATA_API_KEY,
    baseUrl: TWELVEDATA_API_URL,
    pairs: DEFAULT_PAIRS,
    useMockData: false,

    /**
     * Request access and initialize Twelve Data API connection
     */
    requestAccess: async function() {
        try {
            addLog("Connecting to Twelve Data API...");
            
            // Test API connection with a simple request
            const testUrl = `${this.baseUrl}/time_series?symbol=EUR/USD&interval=1day&apikey=${this.apiKey}&outputsize=1`;
            addLog(`Testing API connection to: ${testUrl}`);
            
            const response = await fetch(testUrl);
            
            addLog(`Response status: ${response.status} ${response.statusText}`);
            
            if (response.ok) {
                const data = await response.json();
                
                // Check if we got valid response
                if (data.status === 'ok' && data.values) {
                    addLog(`✓ Twelve Data API connected successfully`);
                    this.useMockData = false;
                    
                    // Try to get available symbols
                    await this._loadAvailableSymbols();
                    
                    return true;
                } else if (data.code === 429) {
                    addLog(`⚠ API rate limit reached, using mock data`);
                    this.useMockData = true;
                    return true;
                } else {
                    addLog(`⚠ API: ${data.message || 'Unexpected response'}, using mock data`);
                    this.useMockData = true;
                    return true;
                }
            } else {
                addLog(`✗ API Error: ${response.status}, using mock data`);
                this.useMockData = true;
                return true;
            }
        } catch(e) {
            addLog(`✗ Connection failed: ${e.message}, using mock data`);
            this.useMockData = true;
            return true;
        }
    },

    /**
     * Load available symbols from Twelve Data API
     */
    _loadAvailableSymbols: async function() {
        try {
            addLog("Loading available symbols from Twelve Data API...");
            
            // Try different endpoints for symbols
            const endpoints = [
                `${this.baseUrl}/symbols?apikey=${this.apiKey}`,
                `${this.baseUrl}/stocks?apikey=${this.apiKey}`,
                `${this.baseUrl}/forex_pairs?apikey=${this.apiKey}`,
                `${this.baseUrl}/cryptocurrencies?apikey=${this.apiKey}`
            ];
            
            let symbolsLoaded = false;
            
            for (const url of endpoints) {
                try {
                    addLog(`Trying endpoint: ${url}`);
                    const response = await fetch(url);
                    
                    addLog(`Response status for ${url}: ${response.status} ${response.statusText}`);
                    
                    if (response.ok) {
                        const data = await response.json();
                        addLog(`API response for ${url}: ${JSON.stringify(data).substring(0, 200)}...`);
                        
                        if (data.status === 'ok' && data.data) {
                            // Filter for forex and crypto symbols
                            const forexCryptoSymbols = data.data
                                .filter(item => item.currency_base && item.currency_quote)
                                .map(item => `${item.symbol}`)
                                .slice(0, 50); // Limit to 50 symbols
                            
                            if (forexCryptoSymbols.length > 0) {
                                this.pairs = [...new Set([...forexCryptoSymbols, ...DEFAULT_PAIRS])];
                                addLog(`✓ Loaded ${this.pairs.length} available symbols from ${url}`);
                                symbolsLoaded = true;
                                break;
                            }
                        } else if (data.code) {
                            addLog(`⚠ API error code: ${data.code}, message: ${data.message}`);
                        }
                    } else if (response.status === 404) {
                        addLog(`⚠ Endpoint not found (404): ${url}`);
                    } else {
                        addLog(`⚠ HTTP error ${response.status} for endpoint: ${url}`);
                    }
                } catch(endpointError) {
                    addLog(`⚠ Error fetching from ${url}: ${endpointError.message}`);
                }
            }
            
            if (!symbolsLoaded) {
                addLog(`⚠ Could not load symbols from any endpoint, using default pairs`);
                // Try a fallback - use time_series endpoint to test individual symbols
                addLog("Testing individual symbol availability...");
                const testSymbols = ['EUR/USD', 'BTC/USD', 'SPX'];
                const availableSymbols = [];
                
                for (const symbol of testSymbols) {
                    try {
                        const testUrl = `${this.baseUrl}/time_series?symbol=${symbol}&interval=1day&apikey=${this.apiKey}&outputsize=1`;
                        const response = await fetch(testUrl);
                        if (response.ok) {
                            const data = await response.json();
                            if (data.status === 'ok') {
                                availableSymbols.push(symbol);
                                addLog(`✓ Symbol ${symbol} is available`);
                            }
                        }
                    } catch(symbolError) {
                        addLog(`⚠ Symbol ${symbol} test failed: ${symbolError.message}`);
                    }
                }
                
                if (availableSymbols.length > 0) {
                    this.pairs = [...new Set([...availableSymbols, ...DEFAULT_PAIRS])];
                    addLog(`✓ Using ${this.pairs.length} tested symbols`);
                }
            }
            
        } catch(e) {
            addLog(`✗ Error in symbol loading: ${e.message}, using default pairs`);
        }
    },

    /**
     * Get list of available trading pairs
     */
    getPairs: function() {
        return this.pairs;
    },

    /**
     * Fetch OHLC data from Twelve Data API or generate mock data
     * @param {string} range - Time range (1min, 5min, 15min, 1D, 1W, 1M, 1Y)
     * @param {string} pair - Trading pair (e.g., EUR/USD)
     */
    fetchData: async function(range, pair) {
        try {
            addLog(`Fetching ${pair} data (${range})...`);
            
            if (this.useMockData) {
                addLog(`Using mock data for ${pair} (${range})`);
                return this._generateMockData(range, pair);
            }
            
            // Map range to Twelve Data interval
            const intervalMap = {
                '1min': '1min',
                '5min': '5min',
                '15min': '15min',
                '1D': '1day',
                '1W': '1week',
                '1M': '1month',
                '1Y': '1year'
            };
            
            const interval = intervalMap[range] || '1day';
            
            // Calculate outputsize based on range
            let outputsize = 100; // Default
            if (range === '1min') outputsize = 1440; // 24 hours * 60 minutes
            if (range === '5min') outputsize = 288;  // 24 hours * 12 (5-min candles)
            if (range === '15min') outputsize = 96;  // 24 hours * 4 (15-min candles)
            if (range === '1D') outputsize = 365;    // 1 year daily
            if (range === '1W') outputsize = 104;    // 2 years weekly
            if (range === '1M') outputsize = 60;     // 5 years monthly
            if (range === '1Y') outputsize = 20;     // 20 years yearly
            
            // Build API URL
            const url = `${this.baseUrl}/time_series?symbol=${encodeURIComponent(pair)}&interval=${interval}&apikey=${this.apiKey}&outputsize=${outputsize}&format=JSON`;
            
            addLog(`Requesting data from: ${url}`);
            const response = await fetch(url);
            
            addLog(`Response status: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            addLog(`API response: ${JSON.stringify(data).substring(0, 200)}...`);
            
            // Check for API errors
            if (data.status === 'error') {
                throw new Error(data.message || 'API error');
            }
            
            if (data.code === 429) {
                addLog(`⚠ API rate limit reached, using mock data`);
                return this._generateMockData(range, pair);
            }
            
            // Parse response
            let candles = [];
            if (data.values && Array.isArray(data.values)) {
                candles = data.values.map(item => ({
                    time: Math.floor(new Date(item.datetime).getTime() / 1000),
                    open: parseFloat(item.open),
                    high: parseFloat(item.high),
                    low: parseFloat(item.low),
                    close: parseFloat(item.close),
                    volume: parseFloat(item.volume) || 0
                })).sort((a, b) => a.time - b.time);
            }
            
            if (candles.length === 0) {
                addLog(`⚠ No data received for ${pair}, using mock data`);
                return this._generateMockData(range, pair);
            }
            
            addLog(`✓ Loaded ${candles.length} candles for ${pair}`);
            return candles;
            
        } catch(e) {
            addLog(`✗ Fetch error: ${e.message}, using mock data`);
            return this._generateMockData(range, pair);
        }
    },

    /**
     * Generate realistic mock data
     * @param {string} range - Time range
     * @param {string} pair - Trading pair
     */
    _generateMockData: function(range, pair) {
        addLog(`Generating realistic mock data for ${pair} (${range})...`);
        
        // Base prices for different asset types
        let basePrice = 100;
        let volatility = 0.02;
        
        // Adjust for different pairs
        if (pair.includes('/USD')) {
            const base = pair.split('/')[0];
            if (base === 'EUR') basePrice = 1.08;
            if (base === 'GBP') basePrice = 1.26;
            if (base === 'USD') {
                const quote = pair.split('/')[1];
                if (quote === 'JPY') basePrice = 150.5;
                if (quote === 'CHF') basePrice = 0.88;
                if (quote === 'CAD') basePrice = 1.36;
            }
            if (base === 'AUD') basePrice = 0.65;
            if (base === 'NZD') basePrice = 0.61;
            volatility = 0.005;
        }
        
        if (pair === 'BTC/USD') { basePrice = 50000; volatility = 0.03; }
        if (pair === 'ETH/USD') { basePrice = 3000; volatility = 0.04; }
        if (pair === 'XAU/USD') { basePrice = 2000; volatility = 0.01; }
        if (pair === 'SPX') { basePrice = 5000; volatility = 0.015; }
        
        // Interval and count based on range
        const rangeConfig = {
            '1min': { interval: 60, count: 1440 },       // 24 hours
            '5min': { interval: 300, count: 288 },       // 24 hours
            '15min': { interval: 900, count: 96 },       // 24 hours
            '1D': { interval: 86400, count: 365 },       // 1 year
            '1W': { interval: 604800, count: 104 },      // 2 years
            '1M': { interval: 2592000, count: 60 },      // 5 years
            '1Y': { interval: 31536000, count: 20 }      // 20 years
        };
        
        const config = rangeConfig[range] || rangeConfig['1D'];
        const now = Math.floor(Date.now() / 1000);
        
        let candles = [];
        
        for (let i = config.count - 1; i >= 0; i--) {
            const time = now - (i * config.interval);
            
            // Simulate realistic price movements with trend
            const trend = (Math.random() - 0.5) * 0.001 * config.interval / 86400;
            const randomWalk = (Math.random() - 0.5) * 2 * volatility;
            const change = trend + randomWalk;
            
            const close = basePrice * (1 + change);
            const open = basePrice;
            const high = Math.max(open, close) + Math.random() * volatility * basePrice * 0.5;
            const low = Math.min(open, close) - Math.random() * volatility * basePrice * 0.5;
            const volume = Math.floor(Math.random() * 1000000) + 100000;
            
            candles.push({
                time: time,
                open: parseFloat(open.toFixed(5)),
                high: parseFloat(high.toFixed(5)),
                low: parseFloat(low.toFixed(5)),
                close: parseFloat(close.toFixed(5)),
                volume: volume
            });
            
            // Update base price for next candle
            basePrice = close;
        }
        
        addLog(`✓ Generated ${candles.length} realistic candles for ${pair}`);
        return candles;
    }
};