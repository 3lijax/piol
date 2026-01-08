// --- Configuration ---
const CONFIG = {
    chartMaxPoints: 50
};

// --- State ---
const State = {
    selectedSymbol: null,
    charts: {
        main: null
    },
    dataHistory: [], // For the chart
    marketCache: {} // Store latest data for all symbols
};

// --- DOM Elements ---
const DOM = {
    marketList: document.getElementById('market-list'),

    // Display Stats
    assetName: document.getElementById('selected-asset-name'),
    price: document.getElementById('live-price'),
    entropy: document.getElementById('disp-entropy'),
    logic: document.getElementById('disp-logic'),
    quality: document.getElementById('disp-quality'),
    dir: document.getElementById('disp-dir'),
    digit: document.getElementById('disp-digit'),

    // Chart
    chartCanvas: document.getElementById('mainChart'),

    // System
    logout: document.getElementById('logout-btn'),
    connText: document.getElementById('connection-text')
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    initChart();
    setupEventListeners();
});

function initFirebase() {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const db = firebase.firestore();
    listenToMarket(db);
}

function initChart() {
    const ctx = DOM.chartCanvas.getContext('2d');

    // Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');

    State.charts.main = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(CONFIG.chartMaxPoints).fill(''),
            datasets: [{
                label: 'Price',
                data: Array(CONFIG.chartMaxPoints).fill(null),
                borderColor: '#10b981',
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: {
                    display: true,
                    position: 'right',
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#64748b' }
                }
            },
            animation: { duration: 0 }
        }
    });
}

function listenToMarket(db) {
    if (DOM.connText) DOM.connText.innerText = "Scanning...";

    db.collection('market_data')
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const data = change.doc.data();

                // Update Cache
                State.marketCache[data.symbol] = data;

                // If it's the selected symbol, update Main View
                if (State.selectedSymbol === data.symbol) {
                    updateMainView(data);
                }

                // Update Scanner List (Grid)
                updateScannerItem(data);

                // Auto-select first asset if none selected
                if (!State.selectedSymbol && data.status === 'Ready to Trade') {
                    selectAsset(data.symbol);
                }
            });

            if (!State.selectedSymbol && Object.keys(State.marketCache).length > 0) {
                selectAsset(Object.keys(State.marketCache)[0]);
            }

            if (DOM.connText) DOM.connText.innerText = `Active (${Object.keys(State.marketCache).length})`;
        });
}

// --- View Logic ---

function selectAsset(symbol) {
    State.selectedSymbol = symbol;
    State.dataHistory = []; // Reset chart history
    const data = State.marketCache[symbol];
    if (data) {
        updateMainView(data);

        // Highlight in list
        document.querySelectorAll('.market-item').forEach(el => el.classList.remove('active'));
        const el = document.getElementById(`item-${symbol}`);
        if (el) el.classList.add('active');
    }
}

function updateMainView(data) {
    // Text Updates
    DOM.assetName.innerText = data.name || data.symbol;
    DOM.price.innerText = data.price || '--';
    DOM.entropy.innerText = data.entropy;
    DOM.logic.innerText = data.status;
    DOM.quality.innerText = data.qualityScore + '%';
    DOM.dir.innerText = data.direction;
    DOM.digit.innerText = data.direction === 'UP' ? 'CALL' : 'PUT'; // Prediction Mode

    // Confidence (Mocking reasonable confidence based on Quality)
    const conf = Math.min(99, Math.floor(parseFloat(data.qualityScore) + 10));
    document.getElementById('disp-conf').innerText = conf + '%';

    // Logic Color
    const isReady = data.status === 'Ready to Trade';
    DOM.logic.style.color = isReady ? '#10b981' : '#f59e0b';
    DOM.dir.className = data.direction === 'UP' ? 'stat-sub text-green' : 'stat-sub text-red';
    DOM.digit.style.color = data.direction === 'UP' ? '#10b981' : '#ef4444';

    // Show/Hide Prediction Box
    const predBox = document.getElementById('prediction-box');
    const predVal = document.getElementById('pred-val');
    const predSub = document.getElementById('pred-sub');

    if (isReady && predBox) {
        predBox.style.display = 'block';
        predVal.innerText = data.direction === 'UP' ? 'CALL' : 'PUT';
        predVal.style.color = data.direction === 'UP' ? '#10b981' : '#ef4444';
        predSub.innerText = `Reliability: ${conf}%`;

        // Log to History (Debounce: Only log if not logged recently)
        logSignal(data);
    } else if (predBox) {
        predBox.style.display = 'none';
    }

    // Chart Update
    if (data.price) {
        const chart = State.charts.main;
        const labels = chart.data.labels;
        const prices = chart.data.datasets[0].data;

        prices.push(data.price);
        labels.push('');

        if (prices.length > CONFIG.chartMaxPoints) {
            prices.shift();
            labels.shift();
        }

        chart.update();
    }
}

// History State
let lastLogTime = 0;

function logSignal(data) {
    // Prevent spamming history for the same signal (wait 10s)
    const now = Date.now();
    if (now - lastLogTime < 10000) return;
    lastLogTime = now;

    // Add to table
    const tbody = document.getElementById('history-body');
    if (!tbody) return;

    const row = document.createElement('tr');
    row.className = 'history-row';
    const time = new Date().toLocaleTimeString();

    row.innerHTML = `
        <td>${time}</td>
        <td>${data.name || data.symbol}</td>
        <td class="${data.direction === 'UP' ? 'hist-win' : 'hist-loss'}">${data.direction}</td>
        <td>${data.qualityScore}%</td>
        <td>${data.price}</td>
        <td>-</td>
    `;

    tbody.insertBefore(row, tbody.firstChild);

    // Limit rows
    if (tbody.children.length > 50) tbody.removeChild(tbody.lastChild);
}

function clearHistory() {
    const tbody = document.getElementById('history-body');
    if (tbody) tbody.innerHTML = '';
}

function updateScannerItem(data) {
    if (!DOM.marketList) return;

    // Sanitize ID
    const safeId = data.symbol.replace(/[^a-zA-Z0-9]/g, '_');
    let item = document.getElementById(`item-${safeId}`);

    const isReady = data.status === 'Ready to Trade';

    if (!item) {
        item = document.createElement('div');
        item.id = `item-${safeId}`;
        item.className = 'market-item';
        item.onclick = () => selectAsset(data.symbol);
        DOM.marketList.appendChild(item);
    }

    // Keep selection highlight
    if (State.selectedSymbol === data.symbol) item.classList.add('active');

    item.innerHTML = `
        <div class="m-header">
            <span class="m-name">${data.name || data.symbol}</span>
            <span class="m-badge ${isReady ? 'badge-ready' : 'badge-wait'}">${isReady ? 'READY' : 'WAIT'}</span>
        </div>
        <div class="m-bar-bg">
            <div class="m-bar-fill" style="width: ${data.qualityScore}%"></div>
        </div>
        <div class="m-info">
            <span>Vol: ${data.entropy}</span>
            <span>${data.direction}</span>
        </div>
    `;

    // Sort: Ready items to top
    item.style.order = isReady ? "-1" : "0";
}

// --- Events ---
function setupEventListeners() {
    if (DOM.logout) {
        DOM.logout.addEventListener('click', () => {
            firebase.auth().signOut().then(() => {
                window.location.href = 'index.html';
            });
        });
    }
}
