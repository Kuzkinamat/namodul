// provider-forex.js
// Forex Data Provider using Alpha Vantage API

const ALPHA_VANTAGE_API_KEY = 'demo'; // Use 'demo' for testing or get your own key from https://www.alphavantage.co/support/#api-key
const ALPHA_VANTAGE_URL = 'https://www.alphavantage.co/query';

// Common forex pairs
const FOREX_PAIRS = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
    'EURGBP', 'EURJPY', 'EURCHF', 'GBPJPY', 'CHFJPY', 'AUDJPY', 'CADJPY'
];

window.ForexProvider = {
    apiKey: ALPHA_VANTAGE_API_KEY,
    baseUrl: ALPHA_VANTAGE_URL,
    pairs: FOREX_PAIRS,
    useMockData: false,

    /**
     * Request access and initialize Forex API connection
     */
    requestAccess: async function() {
        try {
            addLog("Connecting to Forex API (Alpha Vantage)...");
            
            // Test API connection with a simple request
            const testUrl = `${this.baseUrl}?function=CURRENCY_EXCHANGE_RATE&from_currency=EUR&to_currency=USD&apikey=${this.apiKey}`;
            addLog(`Testing API connection...`);
            
            const response = await fetch(testUrl);
            
            addLog(`Response status: ${response.status} ${response.statusText}`);
            
            if (response.ok) {
                const data = await response.json();
                // Check if we got valid response (not error message)
                if (data['Realtime Currency Exchange Rate']) {
                    addLog(`✓ Forex API connected successfully`);
                    this.useMockData = false;
                    return true;
                } else if (data['Note'] && data['Note'].includes('API call frequency')) {
                    addLog(`⚠ API rate limit reached, using mock data`);
                    this.useMockData = true;
                    return true;
                } else {
                    addLog(`⚠ API returned unexpected response, using mock data`);
                    this.useMockData = true;
                    return true;
                }
            } else {
                addLog(`✗ API Error: ${response.status}, using mock data`);
                this.useMockData = true;
                return true; // Return true to allow using mock data
            }
        } catch(e) {
            addLog(`✗ Connection failed: ${e.message}, using mock data`);
            this.useMockData = true;
            return true; // Return true allow mock data
        }
    },

    /**
     * Get list of available forex pairs
     */
    getPairs: function() {
        return this.pairs;
    },

    /**
     * Fetch OHLC forex data from Alpha Vantage API or generate mock data
     * @param {string} range - Time range (1D, 1W, 1M, 1Y)
     * @param {string} pair - Forex pair (e.g., EURUSD)
     */
    fetchData: async function(range, pair) {
        try {
            addLog(`Fetching ${pair} forex data (${range})...`);
            
            if (this.useMockData) {
                return this._generateForexMockData(range, pair);
            }
            
            // Extract base and quote currencies from pair (e.g., EURUSD -> EUR and USD)
            const fromCurrency = pair.substring(0, 3);
            const toCurrency = pair.substring(3, 6);
            
            // Map range to Alpha Vantage function and interval
            const rangeConfig = {
                '1D': { function: 'FX_INTRADAY', interval: '60min', outputsize: 'compact' },
                '1W': { function: 'FX_DAILY', interval: null, outputsize: 'compact' },
                '1M': { function: 'FX_DAILY', interval: null, outputsize: 'full' },
                '1Y': { function: 'FX_DAILY', interval: null, outputsize: 'full' }
            };
            
            const config = rangeConfig[range] || rangeConfig['1D'];
            
            // Build API URL
            let url = `${this.baseUrl}?function=${config.function}&from_symbol=${fromCurrency}&to_symbol=${toCurrency}&apikey=${this.apiKey}`;
            
            if (config.interval) {
                url += `&interval=${config.interval}`;
            }
            if (config.outputsize) {
                url += `&outputsize=${config.outputsize}`;
            }
            
            addLog(`Requesting data from Alpha Vantage...`);
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            // Check for API errors or rate limits
            if (data['Error Message'] || data['Note']) {
                addLog(`⚠ API limit reached or error: ${data['Error Message'] || data['Note']}`);
                return this._generateForexMockData(range, pair);
            }
            
            // Parse response based on function type
            let candles = [];
            if (config.function === 'FX_INTRADAY' && data['Time Series FX (60min)']) {
                const timeSeries = data['Time Series FX (60min)'];
                candles = Object.entries(timeSeries).map(([timestamp, values]) => ({
                    time: Math.floor(new Date(timestamp).getTime() / 1000),
                    open: parseFloat(values['1. open']),
                    high: parseFloat(values['2. high']),
                    low: parseFloat(values['3. low']),
                    close: parseFloat(values['4. close']),
                    volume: 0 // Forex doesn't have volume in traditional sense
                })).sort((a, b) => a.time - b.time);
            } else if (config.function === 'FX_DAILY' && data['Time Series FX (Daily)']) {
                const timeSeries = data['Time Series FX (Daily)'];
                candles = Object.entries(timeSeries).map(([timestamp, values]) => ({
                    time: Math.floor(new Date(timestamp).getTime() / 1000),
                    open: parseFloat(values['1. open']),
                    high: parseFloat(values['2. high']),
                    low: parseFloat(values['3. low']),
                    close: parseFloat(values['4. close']),
                    volume: 0
                })).sort((a, b) => a.time - b.time);
            }
            
            // Filter based on range if needed
            if (range === '1D' && candles.length > 24) {
                candles = candles.slice(-24); // Last 24 hours
            } else if (range === '1W' && candles.length > 7) {
                candles = candles.slice(-7); // Last 7 days
            } else if (range === '1M' && candles.length > 30) {
                candles = candles.slice(-30); // Last 30 days
            } else if (range === '1Y' && candles.length > 365) {
                candles = candles.slice(-365); // Last 365 days
            }
            
            if (candles.length === 0) {
                addLog(`⚠ No forex data received for ${pair}, using mock data`);
                return this._generateForexMockData(range, pair);
            }
            
            addLog(`✓ Loaded ${candles.length} forex candles for ${pair}`);
            return candles;
            
        } catch(e) {
            addLog(`✗ Forex fetch error: ${e.message}, using mock data`);
            return this._generateForexMockData(range, pair);
        }
    },

    /**
     * Generate realistic mock forex data
     * @param {string} range - Time range (1D, 1W, 1M, 1Y)
     * @param {string} pair - Forex pair
     */
    _generateForexMockData: function(range, pair) {
        addLog(`Generating realistic mock forex data for ${pair} (${range})...`);
        
        // Typical exchange rates for common pairs
        const baseRates = {
            'EURUSD': 1.08, 'GBPUSD': 1.26, 'USDJPY': 150.5, 'USDCHF': 0.88,
            'AUDUSD': 0.65, 'USDCAD': 1.36, 'NZDUSD': 0.61, 'EURGBP': 0.86,
            'EURJPY': 162.5, 'EURCHF': 0.95, 'GBPJPY': 189.6, 'CHFJPY': 171.0,
            'AUDJPY': 97.8, 'CADJPY': 110.7
        };
        
        const rangeConfig = {
            '1D': { interval: 3600, count: 24 },      // 1 hour intervals, 24 candles
            '1W': { interval: 14400, count: 42 },     // 4 hour intervals, 42 candles
            '1M': { interval: 86400, count: 30 },     // 1 day intervals, 30 candles
            '1Y': { interval: 604800, count: 52 }     // 1 week intervals, 52 candles
        };
        
        const config = rangeConfig[range] || rangeConfig['1D'];
        const now = Math.floor(Date.now() / 1000);
        
        let candles = [];
        let baseRate = baseRates[pair] || 1.0;
        
        // Add some pair-specific volatility
        const volatility = {
            'EURUSD': 0.002, 'GBPUSD': 0.003, 'USDJPY': 0.015, 'USDCHF': 0.002,
            'AUDUSD': 0.004, 'USDCAD': 0.003, 'NZDUSD': 0.005, 'EURGBP': 0.002,
            'EURJPY': 0.018, 'EURCHF': 0.002, 'GBPJPY': 0.020, 'CHFJPY': 0.018,
            'AUDJPY': 0.022, 'CADJPY': 0.020
        }[pair] || 0.005;
        
        // Generate trend (slight upward or downward bias)
        const trend = (Math.random() - 0.5) * 0.001;
        
        for (let i = config.count - 1; i >= 0; i--) {
            const time = now - (i * config.interval);
            
            // Simulate realistic forex movements
            const change = (Math.random() - 0.5) * 2 * volatility + trend;
            const close = baseRate * (1 + change);
            const open = baseRate;
            const high = Math.max(open, close) + Math.random() * volatility * baseRate;
            const low = Math.min(open, close) - Math.random() * volatility * baseRate;
            
            candles.push({
                time: time,
                open: parseFloat(open.toFixed(5)),
                high: parseFloat(high.toFixed(5)),
                low: parseFloat(low.toFixed(5)),
                close: parseFloat(close.toFixed(5)),
                volume: 0
            });
            
            // Update base rate for next candle (carry over close price)
            baseRate = close;
        }
        
        addLog(`✓ Generated ${candles.length} realistic forex candles for ${pair}`);
        return candles;
    }
};