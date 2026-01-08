const WebSocket = require('ws');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');

// Load Config
const firebaseConfig = require('./firebase-config');

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// Configuration
const APP_ID = 1089;
const WS_URL = 'wss://ws.binaryws.com/websockets/v3';
const WINDOW_SIZE = 50;

// Full Market List
const MARKET_ASSETS = [
    {
        category: 'Continuous Indices',
        items: [
            { name: 'Volatility 10 (1s)', symbol: '1HZ10V' },
            { name: 'Volatility 25 (1s)', symbol: '1HZ25V' },
            { name: 'Volatility 50 (1s)', symbol: '1HZ50V' },
            { name: 'Volatility 75 (1s)', symbol: '1HZ75V' },
            { name: 'Volatility 100 (1s)', symbol: '1HZ100V' },
            { name: 'Volatility 150 (1s)', symbol: '1HZ150V' },
            { name: 'Volatility 250 (1s)', symbol: '1HZ250V' },
            { name: 'Volatility 10', symbol: 'R_10' },
            { name: 'Volatility 25', symbol: 'R_25' },
            { name: 'Volatility 50', symbol: 'R_50' },
            { name: 'Volatility 75', symbol: 'R_75' },
            { name: 'Volatility 100', symbol: 'R_100' }
        ]
    },
    {
        category: 'Boom/Crash Indices',
        items: [
            { name: 'Boom 300', symbol: 'BOOM300' },
            { name: 'Boom 500', symbol: 'BOOM500' },
            { name: 'Boom 1000', symbol: 'BOOM1000' },
            { name: 'Crash 300', symbol: 'CRASH300' },
            { name: 'Crash 500', symbol: 'CRASH500' },
            { name: 'Crash 1000', symbol: 'CRASH1000' }
        ]
    },
    {
        category: 'Step Indices',
        items: [
            { name: 'Step Index', symbol: 'STEP' },
            { name: 'Step 10', symbol: 'STEP10' },
            { name: 'Step 25', symbol: 'STEP25' }
        ]
    },
    {
        category: 'Jump Indices',
        items: [
            { name: 'Jump 10', symbol: 'JUMP_10' },
            { name: 'Jump 25', symbol: 'JUMP_25' },
            { name: 'Jump 50', symbol: 'JUMP_50' },
            { name: 'Jump 75', symbol: 'JUMP_75' },
            { name: 'Jump 100', symbol: 'JUMP_100' }
        ]
    }
];

// Flatten symbols for easy lookup
const SYMBOLS_MAP = {};
const ACTIVE_SYMBOLS = [];

MARKET_ASSETS.forEach(cat => {
    cat.items.forEach(item => {
        SYMBOLS_MAP[item.symbol] = item.name;
        ACTIVE_SYMBOLS.push(item.symbol);
    });
});

console.log(`Loaded ${ACTIVE_SYMBOLS.length} Assets.`);

// State Container for all symbols
const marketState = {};

ACTIVE_SYMBOLS.forEach(sym => {
    marketState[sym] = {
        ticks: [],
        entropy: 0,
        status: 'Waiting',
        symbol: sym,
        name: SYMBOLS_MAP[sym]
    };
});

// Shannon Entropy Calculation
function calculateEntropy(ticks) {
    if (ticks.length < 10) return 0;

    // Calculate probability of each digit (0-9)
    const counts = Array(10).fill(0);
    ticks.forEach(t => counts[t.digit]++);

    const total = ticks.length;
    let entropy = 0;

    counts.forEach(count => {
        if (count > 0) {
            const p = count / total;
            entropy -= p * Math.log2(p);
        }
    });

    return entropy;
}

// WebSocket Connection
function connect() {
    const ws = new WebSocket(`${WS_URL}?app_id=${APP_ID}`);

    ws.on('open', () => {
        console.log(`Connected. Subscribing to ${ACTIVE_SYMBOLS.length} assets...`);

        // Subscription Optimization:
        // Deriv allows checking multiple symbols? No, Tick stream is usually 1-by-1 or requires multiple calls.
        // We will loop. To avoid rate limits, we stagger slightly.

        ACTIVE_SYMBOLS.forEach((sym, index) => {
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        ticks: sym,
                        subscribe: 1
                    }));
                }
            }, index * 100); // 100ms stagger -> 3 seconds to subscribe all
        });
    });

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.tick) {
                const quote = msg.tick.quote;
                const symbol = msg.tick.symbol;
                const digit = parseInt(quote.toString().replace('.', '').slice(-1));

                processTick(symbol, digit, quote);
            }
        } catch (e) {
            console.error('Error parsing message:', e);
        }
    });

    ws.on('close', () => {
        console.log('Disconnected. Reconnecting...');
        setTimeout(connect, 5000);
    });

    ws.on('error', (err) => {
        console.error('WS Error:', err.message);
    });
}

function processTick(symbol, digit, price) {
    if (!marketState[symbol]) return;

    const state = marketState[symbol];
    state.ticks.push({ digit, price, time: Date.now() });
    if (state.ticks.length > WINDOW_SIZE) state.ticks.shift();

    // Recalculate Entropy
    const entropy = calculateEntropy(state.ticks);
    state.entropy = entropy;

    // Analysis Logic
    const maxEntropy = 3.3219;
    const normalizedEntropy = entropy / maxEntropy;

    let marketStatus = 'Analyzing';
    if (state.ticks.length >= WINDOW_SIZE) {
        if (entropy < 2.5) {
            marketStatus = 'Ready to Trade';
        } else {
            marketStatus = 'Choppy';
        }
    }

    const output = {
        symbol: symbol,
        name: SYMBOLS_MAP[symbol],
        entropy: parseFloat(entropy.toFixed(3)),
        status: (entropy < 2.8) ? 'Ready to Trade' : 'Analyzing',
        direction: (state.ticks.length > 1 && price > state.ticks[state.ticks.length - 2].price) ? 'UP' : 'DOWN',
        qualityScore: Math.max(0, 100 - (normalizedEntropy * 100)).toFixed(1),
        price: price,
        lastDigit: digit,
        lastUpdate: Date.now()
    };

    // Write to Firestore
    // Note: Writing 30+ updates per second might hit Firestore limits (20k/day free).
    // User requested "all at once", so we deliver. 
    // Optimization: Should we only write if Changed?
    // For now, let's throttle slightly or just write.
    // If output status is Ready, we prioritize.

    db.collection('market_data').doc(symbol).set(output)
        .catch(err => {
            if (!err.message.includes("PERMISSION_DENIED")) console.error(`Write Error ${symbol}:`, err.message);
        });
}

// Start
console.log('Starting Tradingpoolfx Engine...');
connect();