// prov-csv.js
// Local CSV File Provider for Backtesting Terminal

window.CsvProvider = {
    // List of available CSV files (simulated for demo)
    availableFiles: [
        'EURUSD_1min.csv',
        'GBPUSD_1min.csv', 
        'USDJPY_1min.csv',
        'EURUSD_5min.csv',
        'GBPUSD_5min.csv',
        'BTCUSD_daily.csv'
    ],
    
    // Mock data for demonstration
    mockData: {
        'EURUSD_1min': Array.from({length: 1000}, (_, i) => ({
            time: Math.floor(Date.now() / 1000) - (1000 - i) * 60,
            open: 1.08 + Math.random() * 0.01,
            high: 1.08 + Math.random() * 0.02,
            low: 1.08 - Math.random() * 0.01,
            close: 1.08 + Math.random() * 0.005,
            volume: 1000 + Math.random() * 500
        })),
        'GBPUSD_1min': Array.from({length: 1000}, (_, i) => ({
            time: Math.floor(Date.now() / 1000) - (1000 - i) * 60,
            open: 1.26 + Math.random() * 0.01,
            high: 1.26 + Math.random() * 0.02,
            low: 1.26 - Math.random() * 0.01,
            close: 1.26 + Math.random() * 0.005,
            volume: 800 + Math.random() * 400
        })),
        'USDJPY_1min': Array.from({length: 1000}, (_, i) => ({
            time: Math.floor(Date.now() / 1000) - (1000 - i) * 60,
            open: 150.5 + Math.random() * 0.5,
            high: 150.5 + Math.random() * 1,
            low: 150.5 - Math.random() * 0.5,
            close: 150.5 + Math.random() * 0.25,
            volume: 1200 + Math.random() * 600
        }))
    },

    /**
     * Request access to local CSV files
     * In a real implementation, this would use the File System Access API
     */
    requestAccess: async function() {
        try {
            addLog("Initializing CSV file provider...");
            
            // Check if browser supports File System Access API
            if ('showOpenFilePicker' in window) {
                addLog("✓ Browser supports File System Access API");
            } else {
                addLog("⚠ File System Access API not supported, using demo mode");
            }
            
            addLog("✓ CSV provider initialized (demo mode)");
            return true;
        } catch(e) {
            addLog(`✗ CSV provider error: ${e.message}`);
            return false;
        }
    },

    /**
     * Scan for available CSV files
     * Returns list of file names/pairs
     */
    scanFiles: async function() {
        try {
            addLog("Scanning for CSV files...");
            
            // In demo mode, return simulated file list
            // Extract pair names from file names
            const pairs = this.availableFiles.map(file => {
                // Extract pair name from filename (e.g., EURUSD_1min.csv -> EUR/USD)
                const match = file.match(/^([A-Z]{3})([A-Z]{3})_/);
                if (match) {
                    return `${match[1]}/${match[2]}`;
                }
                return file.replace('.csv', '');
            }).filter(pair => pair);
            
            addLog(`Found ${pairs.length} CSV files in demo mode`);
            return pairs;
        } catch(e) {
            addLog(`✗ Scan error: ${e.message}`);
            return [];
        }
    },

    /**
     * Fetch data from CSV file
     * @param {string} range - Time range (not used for CSV, but kept for API consistency)
     * @param {string} pair - Trading pair (e.g., EUR/USD)
     */
    fetchData: async function(range, pair) {
        try {
            addLog(`Loading CSV data for ${pair}...`);
            
            // Convert pair to filename format (EUR/USD -> EURUSD)
            const fileKey = pair.replace('/', '') + '_1min';
            
            // Check if we have mock data for this pair
            if (this.mockData[fileKey]) {
                addLog(`✓ Using mock data for ${pair} (${this.mockData[fileKey].length} candles)`);
                
                // Apply range filtering (simplified)
                let data = [...this.mockData[fileKey]];
                
                // Simple range filtering for demo
                if (range === '1D') {
                    data = data.slice(-1440); // Last 24 hours (1-min candles)
                } else if (range === '1W') {
                    data = data.slice(-10080); // Last 7 days
                } else if (range === '1M') {
                    data = data.slice(-43200); // Last 30 days
                } else if (range === '1Y') {
                    data = data.slice(-525600); // Last 365 days
                }
                
                // For minute timeframes, just return appropriate slice
                if (range === '1min') {
                    data = data.slice(-1440); // Last 24 hours
                } else if (range === '5min') {
                    // Resample to 5-min candles
                    data = this.resampleData(data, 5);
                } else if (range === '15min') {
                    // Resample to 15-min candles
                    data = this.resampleData(data, 15);
                }
                
                return data;
            } else {
                // Generate mock data if not available
                addLog(`⚠ No mock data for ${pair}, generating sample data`);
                
                const sampleCount = range === '1min' ? 1440 : 
                                  range === '5min' ? 288 : 
                                  range === '15min' ? 96 : 
                                  range === '1D' ? 1440 : 
                                  range === '1W' ? 10080 : 
                                  range === '1M' ? 43200 : 1000;
                
                const basePrice = pair.includes('EUR/USD') ? 1.08 : 
                                pair.includes('GBP/USD') ? 1.26 : 
                                pair.includes('USD/JPY') ? 150.5 : 1.0;
                
                const data = Array.from({length: sampleCount}, (_, i) => ({
                    time: Math.floor(Date.now() / 1000) - (sampleCount - i) * 60,
                    open: basePrice + Math.random() * 0.01,
                    high: basePrice + Math.random() * 0.02,
                    low: basePrice - Math.random() * 0.01,
                    close: basePrice + Math.random() * 0.005,
                    volume: 1000 + Math.random() * 500
                }));
                
                addLog(`✓ Generated ${data.length} sample candles for ${pair}`);
                return data;
            }
        } catch(e) {
            addLog(`✗ CSV load error: ${e.message}`);
            throw e;
        }
    },

    /**
     * Resample 1-min data to higher timeframes
     * @param {Array} data - 1-minute candle data
     * @param {number} minutes - Target timeframe in minutes (5, 15, etc.)
     */
    resampleData: function(data, minutes) {
        if (!data || !data.length) return [];
        
        const resampled = [];
        let currentGroup = [];
        
        for (let i = 0; i < data.length; i++) {
            currentGroup.push(data[i]);
            
            // When we have enough candles for the target timeframe
            if (currentGroup.length === minutes) {
                const group = currentGroup;
                const first = group[0];
                const last = group[group.length - 1];
                
                const high = Math.max(...group.map(c => c.high));
                const low = Math.min(...group.map(c => c.low));
                const volume = group.reduce((sum, c) => sum + c.volume, 0);
                
                resampled.push({
                    time: first.time,
                    open: first.open,
                    high: high,
                    low: low,
                    close: last.close,
                    volume: volume
                });
                
                currentGroup = [];
            }
        }
        
        // Add any remaining candles (incomplete group)
        if (currentGroup.length > 0) {
            const group = currentGroup;
            const first = group[0];
            const last = group[group.length - 1];
            
            const high = Math.max(...group.map(c => c.high));
            const low = Math.min(...group.map(c => c.low));
            const volume = group.reduce((sum, c) => sum + c.volume, 0);
            
            resampled.push({
                time: first.time,
                open: first.open,
                high: high,
                low: low,
                close: last.close,
                volume: volume
            });
        }
        
        return resampled;
    },

    /**
     * Get list of available trading pairs from CSV files
     */
    getPairs: function() {
        return this.availableFiles.map(file => {
            const match = file.match(/^([A-Z]{3})([A-Z]{3})_/);
            return match ? `${match[1]}/${match[2]}` : file.replace('.csv', '');
        }).filter(pair => pair);
    }
};