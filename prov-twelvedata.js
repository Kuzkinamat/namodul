// prov-twelvedata.js
// Twelve Data API Provider for Forex Data

const TWELVEDATA_API_KEY = 'aa6331f5e6cc4e3491b731e0dda2955f';
const TWELVEDATA_API_URL = 'https://api.twelvedata.com';

// Default forex pairs (only major pairs)
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
                    
                    // Don't load additional symbols, use only DEFAULT_PAIRS
                    addLog(`Using ${this.pairs.length} default forex pairs`);
                    
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
     * Get list of available trading pairs
     * Returns only the symbol pairs (e.g., "EUR/USD")
     */
    getPairs: function() {
        return this.pairs;
    },

    /**
     * Get display names for pairs (short format)
     * Returns abbreviated names for display purposes
     */
    getDisplayPairs: function() {
        // Return the same pairs for now (could be customized for display)
        return this.pairs;
    },

    /**
     * Fetch OHLC data from Twelve Data API
     * @param {string} range - Time range (1D, 1W, 1M, 1Y)
     * @param {string} timeframe - Candle timeframe (1min, 5min, 15min, 1H, 4H, 1D, 1W, 1M)
     * @param {string} pair - Trading pair (e.g., EUR/USD)
     */
    fetchData: async function(range, timeframe, pair) {
        // Backward compatibility: if only two arguments provided, treat as old signature (range, pair)
        if (arguments.length === 2) {
            pair = timeframe;
            timeframe = range; // In old signature, range actually combined range/timeframe
            range = '1W'; // default range (should be derived from currentRange but we don't have it)
            addLog('Предупреждение: устаревший вызов fetchData, обновите код для передачи range и timeframe отдельно');
        }
        
        try {
            addLog(`Fetching ${pair} data (Range: ${range}, Timeframe: ${timeframe})...`);
            
            // Use DataUtils for interval mapping and outputsize calculation
            if (!window.DataUtils) {
                throw new Error('DataUtils not loaded');
            }
            
            const interval = window.DataUtils.mapTimeframeToInterval(timeframe);
            const outputsize = window.DataUtils.calculateOutputSize(range, timeframe);
            
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
            
            // Additional error checks
            if (data.code && data.code >= 400) {
                throw new Error(data.message || `API error ${data.code}`);
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