import { auth, signOut, onAuthStateChanged } from './firebase-config.js';

// Auth Guard & UI Update
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        const welcomeMsg = document.querySelector('.user-info p');
        if (welcomeMsg) {
            welcomeMsg.innerHTML = `Welcome,<br>${user.email}`;
        }
    }
});

// --- Configuration & Constants ---
const CONFIG = {
    app_id: 1089,
    ws_url: 'wss://ws.binaryws.com/websockets/v3',
    candleCount: 30, // For non-tick markets
    maxTicks: 50,    // For chart history
    reconnect: {
        initial: 1000,
        max: 30000,
        multiplier: 1.5
    }
};

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

// --- State Management ---
const State = {
    wsClient: null,
    isAnalyzing: false,
    startTime: null,
    ticks: [],       // Stores { price, digit }
    transitions: Array.from({ length: 10 }, () => Array(10).fill(0)),
    totalDigits: 0,
    currentSymbol: '1HZ10V',
    engineType: 'volatility',
    chart: null,
    timerInterval: null,
    engineMeta: {},
    engineInstance: null
};

// --- DOM Elements ---
const DOM = {
    btn: {
        start: document.getElementById('start-btn'),
        stop: document.getElementById('stop-btn'),
        predict: document.getElementById('predict-btn'),
        logout: document.getElementById('logout-btn')
    },
    select: {
        asset: document.getElementById('asset-select'),
        strategy: document.getElementById('strategy-select')
    },
    display: {
        digit: document.getElementById('last-digit-display'),
        feedStatus: document.getElementById('feed-status-text'),
        feedSub: document.getElementById('feed-subtext'),
        connectionDot: document.getElementById('connection-dot'),
        connectionText: document.getElementById('connection-text'),
        digitGrid: document.getElementById('digit-grid'),
        chartTitle: document.getElementById('chart-asset-name'),
        chartTime: document.getElementById('chart-time'),
        chartPrice: document.getElementById('chart-price'),
        predictionCard: document.getElementById('prediction-card'),
        aiText: document.getElementById('ai-analysis-text')
    },
    stats: {
        totalDigits: document.getElementById('total-digits-count'),
        duration: document.getElementById('analysis-duration'),
        dataPoints: document.getElementById('data-points-count'),
        high: document.getElementById('stat-high'),
        low: document.getElementById('stat-low'),
        current: document.getElementById('stat-current'),
        trend: document.getElementById('stat-trend')
    }
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initMarketSelectors();
    initChart();
    setupEventListeners();
    initDigitGrid();

    // Initial connection
    setSymbol(State.currentSymbol);
    startWSConnection();
});

// --- Logic Helpers ---
function detectType(symbol) {
    if (symbol.startsWith('R_') || symbol.startsWith('1HZ')) return 'volatility';
    if (symbol.startsWith('BOOM') || symbol.startsWith('CRASH')) return 'boom_crash';
    if (symbol.startsWith('STEP')) return 'step';
    if (symbol.startsWith('JUMP')) return 'jump';
    return 'volatility'; // fallback
}

const extractDigit = (price) => parseInt(price.toString().slice(-1));

function statsFromArray(arr) {
    if (!arr.length) return { mean: 0, std: 0 };
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
    return { mean, std: Math.sqrt(variance) };
}

// --- Engines ---
class BaseEngine {
    constructor(type) { this.type = type; }
    onTick(tick) { /* override */ }
    onCandles(candles) { /* override */ }
}

class VolatilityEngine extends BaseEngine {
    constructor() { super('volatility'); }
    onTick(tick) {
        const price = Number(tick.quote);
        // Use pip_size from tick if available (Standard Deriv API field)
        const pipSize = tick.pip_size;
        const digit = extractDigit(price, pipSize);
        handleNewData(price, digit);
    }
}

class BoomCrashEngine extends BaseEngine {
    constructor() { super('boom_crash'); }
    onCandles(candles) {
        const last = candles.at(-1);
        const price = Number(last.close);
        const digit = extractDigit(price);

        // Spike detection
        const closes = candles.map(c => Number(c.close));
        const spike = this.detectSpike(closes);
        State.engineMeta.lastSpike = spike;

        handleNewData(price, digit);
    }

    detectSpike(series) {
        if (series.length < 3) return { isSpike: false };
        const changes = [];
        for (let i = 1; i < series.length; i++) changes.push(Math.abs(series[i] - series[i - 1]));
        const { mean, std } = statsFromArray(changes);
        const last = changes.at(-1);
        const threshold = Math.max(mean + 3 * std, mean * 3, 1e-8);
        return { isSpike: last > threshold, magnitude: last };
    }
}

class StepEngine extends BaseEngine {
    constructor() { super('step'); }
    onCandles(candles) {
        const last = candles.at(-1);
        const price = Number(last.close);
        const digit = extractDigit(price);
        handleNewData(price, digit);
    }
}

class JumpEngine extends BaseEngine {
    constructor() { super('jump'); }
    onCandles(candles) {
        const last = candles.at(-1);
        const price = Number(last.close);
        const digit = extractDigit(price);
        handleNewData(price, digit);
    }
}

// --- Websocket Client ---
class WSClient {
    constructor(url, appId) {
        this.url = url;
        this.appId = appId;
        this.ws = null;
        this.reconnectTimer = null;
    }

    connect() {
        if (this.ws) this.ws.close();

        updateConnectionStatus('Connecting...', 'disconnected');
        this.ws = new WebSocket(`${this.url}?app_id=${this.appId}`);

        this.ws.onopen = () => {
            updateConnectionStatus('Connected', 'connected');
            this.subscribe();
        };

        this.ws.onmessage = (msg) => {
            try {
                const data = JSON.parse(msg.data);
                if (data.tick && State.engineType === 'volatility') {
                    State.engineInstance.onTick(data.tick);
                } else if (data.candles || (data.history && data.history.candles)) {
                    const candles = data.candles || data.history.candles;
                    State.engineInstance.onCandles(candles);
                } else if (data.error) {
                    console.error("WS Error:", data.error.message);
                }
            } catch (e) {
                console.error("Parse error", e);
            }
        };

        this.ws.onclose = () => {
            updateConnectionStatus('Disconnected', 'disconnected');
            // Auto reconnect logic could go here
        };
    }

    subscribe() {
        if (State.engineType === 'volatility') {
            this.ws.send(JSON.stringify({
                ticks: State.currentSymbol,
                subscribe: 1
            }));
        } else {
            this.ws.send(JSON.stringify({
                ticks_history: State.currentSymbol,
                style: 'candles',
                granularity: 60, // 1 minute candles for boom/crash etc as default
                count: CONFIG.candleCount,
                subscribe: 1
            }));
        }
    }
}

// --- Data Handling & UI Updates ---
// --- Data Handling & UI Updates ---
function handleNewData(price, digit) {
    // Basic UI
    DOM.display.digit.innerText = digit;
    updateChart(price);

    // Immediate Analysis (No Gate)
    State.ticks.push({ price, digit });
    if (State.ticks.length > 1000) State.ticks.shift(); // Buffer cap
    State.totalDigits++;

    // Update Transitions
    if (State.ticks.length > 1) {
        const prev = State.ticks[State.ticks.length - 2].digit;
        State.transitions[prev][digit]++;
    }

    // Stats
    DOM.stats.totalDigits.innerText = State.totalDigits;
    DOM.stats.dataPoints.innerText = State.ticks.length;

    updateFrequency();
    updateOverUnder(digit); // New Function
}

function updateOverUnder(digit) {
    // Logic: 0-4 Under, 5-9 Over
    // We can add a simple visual if needed, for now we ensure logic runs
    // Could update a specific UI element if requested
}

function resetStats() {
    State.ticks = [];
    State.transitions = Array.from({ length: 10 }, () => Array(10).fill(0));
    State.totalDigits = 0;
    DOM.stats.totalDigits.innerText = '0';
    DOM.stats.dataPoints.innerText = '0';
    updateFrequency(); // Clear UI
}

function updateConnectionStatus(text, statusClass) {
    DOM.display.connectionText.innerText = text;
    DOM.display.connectionDot.className = `status-dot ${statusClass}`;

    if (statusClass === 'connected') {
        const type = detectType(State.currentSymbol);
        DOM.display.feedSub.innerText = `Live • ${State.currentSymbol} • ${type.toUpperCase()}`;
    } else {
        DOM.display.feedSub.innerText = 'Offline';
    }
}

function updateFrequency() {
    const counts = Array(10).fill(0);
    State.ticks.forEach(t => counts[t.digit]++);

    const total = State.ticks.length;
    counts.forEach((count, i) => {
        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        const elPct = document.getElementById(`d-pct-${i}`);
        if (elPct) elPct.innerText = `${pct}%`;

        const card = document.getElementById(`d-card-${i}`);
        if (card) {
            card.style.borderColor = 'transparent';
            if (total > 10) {
                const max = Math.max(...counts);
                if (count === max) card.style.borderColor = 'var(--primary)';
            }
        }
    });
}

function updateChart(price) {
    if (!State.chart) return;

    const now = new Date();
    DOM.display.chartTime.innerText = now.toLocaleTimeString();
    DOM.display.chartPrice.innerText = price.toFixed(4);

    const data = State.chart.data.datasets[0].data;
    data.push(price);
    if (data.length > CONFIG.maxTicks) data.shift();

    State.chart.update('none');

    // Stats updates (High/Low)
    const validData = data.filter(d => d !== null);
    if (validData.length > 0) {
        const current = validData[validData.length - 1];
        const prev = validData.length > 1 ? validData[validData.length - 2] : current;

        // Digits from stored price is tricky because chart stores numbers, we need original precision
        // We'll rely on State.ticks if analyzing, otherwise just standard calculation

        DOM.stats.current.innerText = extractDigit(current);
        DOM.stats.high.innerText = Math.max(...validData.map(v => extractDigit(v)));
        DOM.stats.low.innerText = Math.min(...validData.map(v => extractDigit(v)));

        // Trend
        if (current > prev) {
            DOM.stats.trend.innerHTML = '<i class="fa-solid fa-arrow-trend-up"></i>';
            DOM.stats.trend.style.color = 'var(--primary)';
        } else if (current < prev) {
            DOM.stats.trend.innerHTML = '<i class="fa-solid fa-arrow-trend-down"></i>';
            DOM.stats.trend.style.color = '#ff6b6b';
        } else {
            DOM.stats.trend.innerText = '--';
        }
    }
}

// --- AI Prediction ---
function generatePrediction() {
    if (State.ticks.length < 5) {
        alert("Need more data for analysis...");
        return;
    }

    DOM.display.predictionCard.style.display = 'block';

    // Logic from app.js AI
    const freq = Array(10).fill(0);
    State.ticks.forEach(t => freq[t.digit]++);
    const total = State.ticks.length;

    // Entropy
    let entropy = 0;
    freq.forEach(c => {
        if (c > 0) {
            const p = c / total;
            entropy -= p * Math.log2(p);
        }
    });

    // Odd/Even bias
    const recent = State.ticks.slice(-20);
    let evens = 0, odds = 0;
    recent.forEach(t => t.digit % 2 === 0 ? evens++ : odds++);
    const type = evens > odds ? 'Even' : 'Odd';

    // Confidence score
    const entropyScore = 1 - Math.min(entropy / 3.3, 1);
    const biasScore = Math.abs(evens - odds) / recent.length; // 0 to 1

    let score = (0.5 * entropyScore) + (0.5 * biasScore);
    if (State.engineMeta.lastSpike && State.engineMeta.lastSpike.isSpike) score += 0.2;

    const confidence = Math.min(99, Math.round(score * 100));

    // UI Update
    document.getElementById('p-value').innerText = type;
    document.getElementById('p-value').className = `p-value ${type === 'Odd' ? 'green' : 'red'}`; // Green for odd just as example

    document.getElementById('c-percent').innerText = `${confidence}%`;
    const fill = document.getElementById('c-bar-fill');
    fill.style.width = `${confidence}%`;

    const analysisMsg = `AI analysis: Entropy ${entropy.toFixed(3)}. ${recent.length} tick sample shows ${type} bias. Market mode: ${State.engineType.toUpperCase()}.`;
    DOM.display.aiText.innerText = analysisMsg;

    DOM.display.predictionCard.scrollIntoView({ behavior: 'smooth' });
}

// --- Event Setup & Helpers ---
function setupEventListeners() {
    DOM.btn.start.addEventListener('click', () => {
        if (!State.isAnalyzing) {
            State.isAnalyzing = true;
            State.startTime = Date.now();
            State.totalDigits = 0;
            DOM.btn.start.style.opacity = '0.5';
            DOM.btn.stop.style.opacity = '1';
            DOM.display.feedStatus.innerText = 'Analyzing...';
            DOM.display.feedStatus.style.color = 'var(--primary)';
            if (State.timerInterval) clearInterval(State.timerInterval);
            State.timerInterval = setInterval(() => {
                const diff = Math.floor((Date.now() - State.startTime) / 1000);
                const m = Math.floor(diff / 60).toString().padStart(2, '0');
                const s = (diff % 60).toString().padStart(2, '0');
                DOM.stats.duration.innerText = `${m}:${s}`;
            }, 1000);
        }
    });

    DOM.btn.stop.addEventListener('click', () => {
        State.isAnalyzing = false;
        DOM.btn.start.style.opacity = '1';
        DOM.btn.stop.style.opacity = '0.5';
        DOM.display.feedStatus.innerText = 'Stopped';
        DOM.display.feedStatus.style.color = 'var(--text-muted)';
        if (State.timerInterval) clearInterval(State.timerInterval);
    });

    DOM.btn.logout.addEventListener('click', () => {
        if (confirm("Sign out?")) {
            signOut(auth).then(() => {
                window.location.href = 'index.html';
            }).catch((error) => {
                console.error('Sign Out Error', error);
            });
        }
    });

    DOM.btn.predict.addEventListener('click', generatePrediction);

    DOM.select.asset.addEventListener('change', (e) => {
        State.currentSymbol = e.target.value;
        setSymbol(State.currentSymbol);
        startWSConnection();
    });
}

function setSymbol(symbol) {
    // Unsubscribe previous
    if (State.wsClient && State.wsClient.ws && State.wsClient.ws.readyState === WebSocket.OPEN) {
        State.wsClient.ws.send(JSON.stringify({ forget_all: 'ticks' }));
        State.wsClient.ws.send(JSON.stringify({ forget_all: 'candles' }));
    }

    resetStats(); // Clear previous data

    State.currentSymbol = symbol;
    State.engineType = detectType(symbol);
    DOM.display.chartTitle.innerText = `${symbol} (${State.engineType})`;

    switch (State.engineType) {
        case 'volatility': State.engineInstance = new VolatilityEngine(); break;
        case 'boom_crash': State.engineInstance = new BoomCrashEngine(); break;
        case 'step': State.engineInstance = new StepEngine(); break;
        case 'jump': State.engineInstance = new JumpEngine(); break;
        default: State.engineInstance = new VolatilityEngine();
    }

    // Reset Chart Data
    if (State.chart) {
        State.chart.data.datasets[0].data = Array(CONFIG.maxTicks).fill(null);
        State.chart.update();
    }
}

function startWSConnection() {
    if (!State.wsClient) {
        State.wsClient = new WSClient(CONFIG.ws_url, CONFIG.app_id);
    }
    State.wsClient.connect();
}

function initMarketSelectors() {
    DOM.select.asset.innerHTML = '';
    MARKET_ASSETS.forEach(group => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.category;
        group.items.forEach(asset => {
            const opt = document.createElement('option');
            opt.value = asset.symbol;
            opt.textContent = asset.name;
            if (asset.symbol === State.currentSymbol) opt.selected = true;
            optgroup.appendChild(opt);
        });
        DOM.select.asset.appendChild(optgroup);
    });
}

function initChart() {
    const ctx = document.getElementById('tickChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    State.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(CONFIG.maxTicks).fill(''),
            datasets: [{
                data: Array(CONFIG.maxTicks).fill(null),
                borderColor: '#3b82f6',
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 4,
                pointBackgroundColor: '#0b1120',
                pointBorderColor: '#3b82f6',
                pointBorderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { display: false, grace: '10%' } },
            animation: false
        }
    });
}

function initDigitGrid() {
    DOM.display.digitGrid.innerHTML = '';
    for (let i = 0; i < 10; i++) {
        const card = document.createElement('div');
        card.className = 'digit-card';
        card.id = `d-card-${i}`;
        card.innerHTML = `<span class="num">${i}</span><span class="pct" id="d-pct-${i}">0%</span>`;
        DOM.display.digitGrid.appendChild(card);
    }
}
