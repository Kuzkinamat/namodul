// prov-twelvedata.js
// Twelve Data API Provider for Forex Data

const TWELVEDATA_API_KEY = 'aa6331f5e6cc4e3491b731e0dda2955f';
const TWELVEDATA_API_URL = 'https://api.twelvedata.com';

// Default forex pairs
const DEFAULT_PAIRS = [
    // Forex majors
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD',
    'EUR/GBP', 'EUR/JPY', 'EUR/CHF', 'GBP/JPY', 'CHF/JPY'
];

window.TwelveDataProvider = {
    apiKey: TWELVEDATA_API_KEY,
    baseUrl: TWELVEDATA_API_URL,
    pairs: DEFAULT_PAIRS,

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
                    
                    // Try to get available symbols
                    await this._loadAvailableSymbols();
                    
                    return true;
                } else if (data.code === 429) {
                    addLog(`⚠ API rate limit reached`);
                    return false;
                } else {
                    addLog(`⚠ API: ${data.message || 'Unexpected response'}`);
                    return false;
                }
            } else {
                addLog(`✗ API Error: ${response.status}`);
                return false;
            }
        } catch(e) {
            addLog(`✗ Connection failed: ${e.message}`);
            return false;
        }
    },

    /**
     * Load available symbols from Twelve Data API
     */
    _loadAvailableSymbols: async function() {
        try {
            addLog("Loading available symbols from Twelve Data API...");
            
            // Use only forex_pairs endpoint
            const url = `${this.baseUrl}/forex_pairs?apikey=${this.apiKey}`;
            
            addLog(`Trying endpoint: ${url}`);
            const response = await fetch(url);
            
            addLog(`Response status: ${response.status} ${response.statusText}`);
            
            if (response.ok) {
                const data = await response.json();
                addLog(`API response: ${JSON.stringify(data).substring(0, 200)}...`);
                
                if (data.status === 'ok' && data.data) {
                    // Filter for forex pairs with currency_group = "Major"
                    const majorForexPairs = data.data
                        .filter(item => item.currency_group === 'Major')
                        .map(item => `${item.currency_base}/${item.currency_quote}`);
                    
                    if (majorForexPairs.length > 0) {
                        this.pairs = [...new Set([...majorForexPairs, ...DEFAULT_PAIRS])];
                        addLog(`✓ Loaded ${this.pairs.length} major forex pairs`);
                    } else {
                        addLog(`⚠ No major forex pairs found, using default pairs`);
                    }
                } else if (data.code) {
                    addLog(`⚠ API error code: ${data.code}, message: ${data.message}`);
                }
            } else if (response.status === 404) {
                addLog(`⚠ Endpoint not found (404): ${url}`);
            } else {
                addLog(`⚠ HTTP error ${response.status} for endpoint: ${url}`);
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
     * Fetch OHLC data from Twelve Data API
     * @param {string} range - Time range (1min, 5min, 15min, 1D, 1W, 1M, 1Y)
     * @param {string} pair - Trading pair (e.g., EUR/USD)
     */
    fetchData: async function(range, pair) {
        try {
            addLog(`Fetching ${pair} data (${range})...`);
            
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
                throw new Error('API rate limit reached');
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
                throw new Error(`No data received for ${pair}`);
            }
            
            addLog(`✓ Loaded ${candles.length} candles for ${pair}`);
            return candles;
            
        } catch(e) {
            addLog(`✗ Fetch error: ${e.message}`);
            throw e;
        }
    }
};