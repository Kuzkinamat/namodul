// provider-massive.js
// Massive API Integration for OHLC Candle Data

const MASSIVE_API_KEY = '5EiWzpPBCXUye50zN988CNLq6Z3J5CJk';
const MASSIVE_API_URL = 'https://api.massive.com';

// Mock pairs for demo (will be updated with real API pairs)
const MOCK_PAIRS = ['BTCUSD', 'ETHUSD', '', 'GOOGL', 'MSFT'];

window.MassiveProvider = {
    apiKey: MASSIVE_API_KEY,
    baseUrl: MASSIVE_API_URL,
    pairs: MOCK_PAIRS,

    /**
     * Request access and initialize Massive API connection
     */
    requestAccess: async function() {
        try {
            addLog("Connecting to Massive API...");
            // Test API connection
            const testUrl = `${this.baseUrl}/v1/markets`;
            addLog(`Testing URL: ${testUrl}`);
            
            const response = await fetch(testUrl, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` }
            });
            
            addLog(`Response status: ${response.status} ${response.statusText}`);
            
            if (response.ok) {
                const data = await response.json();
                if (data.results && data.results.length) {
                    this.pairs = data.results.map(m => m.symbol || m.name).slice(0, 20);
                }
                addLog(`✓ Massive API connected. Found ${this.pairs.length} pairs`);
                return true;
            } else {
                // Try to get error details
                let errorDetails = '';
                try {
                    const errorData = await response.text();
                    errorDetails = errorData ? ` - ${errorData.substring(0, 100)}` : '';
                } catch (e) {
                    // Ignore error reading response body
                }
                addLog(`✗ API Error: ${response.status}${errorDetails}`);
                return false;
            }
        } catch(e) {
            addLog(`✗ Connection failed: ${e.message}`);
            return false;
        }
    },

    /**
     * Get list of available trading pairs
     */
    getPairs: function() {
        return this.pairs;
    },

    /**
     * Fetch OHLC candle data from Massive API
     * @param {string} range - Time range (1D, 1W, 1M, 1Y)
     * @param {string} pair - Trading pair (e.g., BTCUSD)
     */
    fetchData: async function(range, pair) {
        try {
            addLog(`Fetching ${pair} data (${range})...`);
            
            // Convert range to interval and duration
            const rangeConfig = {
                '1D': { interval: '1h', days: 1 },
                '1W': { interval: '4h', days: 7 },
                '1M': { interval: '1d', days: 30 },
                '1Y': { interval: '1w', days: 365 }
            };
            
            const config = rangeConfig[range] || rangeConfig['1D'];
            const now = Math.floor(Date.now() / 1000);
            const startTime = now - (config.days * 86400);
            
            const url = `${this.baseUrl}/v1/candles?symbol=${pair}&interval=${config.interval}&start=${startTime}&end=${now}`;
            
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const rawData = await response.json();
            
            // Transform API response to LightweightCharts format
            let candles = [];
            if (rawData.results && Array.isArray(rawData.results)) {
                candles = rawData.results.map(c => ({
                    time: Math.floor(c.timestamp / 1000),
                    open: parseFloat(c.open),
                    high: parseFloat(c.high),
                    low: parseFloat(c.low),
                    close: parseFloat(c.close),
                    volume: parseInt(c.volume || 0)
                })).sort((a, b) => a.time - b.time);
            }
            
            if (candles.length === 0) {
                addLog(`⚠ No data received for ${pair}`);
                return [];
            }
            
            addLog(`✓ Loaded ${candles.length} candles for ${pair}`);
            return candles;
            
        } catch(e) {
            addLog(`✗ Fetch error: ${e.message}`);
            return [];
        }
    }
};