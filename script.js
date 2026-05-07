// OctaneLab — Mix E85 calculator

const FUEL_ETHANOL = {
    SP95:    { pct: 0.00, label: 'SP95' },
    SP95E10: { pct: 0.10, label: 'SP95-E10' },
    SP98E5:  { pct: 0.05, label: 'SP98-E5' },
};

// EN 15293 — France. Winter grade : 1 nov → 31 mars (~65% ethanol).
// Summer grade : 1 avril → 31 oct (~85% ethanol).
const E85 = {
    summer: { pct: 0.85, label: 'Été' },
    winter: { pct: 0.65, label: 'Hiver' },
};

const DEFAULT_PRESETS = [
    {
        id: 'bmw-z4',
        name: 'BMW Z4',
        capacity: 55,
        bars: 20,
        fuel: 'SP98E5',
    },
    {
        id: 'alfa-giulietta',
        name: 'Alfa Romeo Giulietta',
        capacity: 60,
        bars: 8,
        fuel: 'SP98E5',
    },
    {
        id: 'mini-cooper',
        name: 'Mini Cooper',
        capacity: 40,
        bars: 8,
        fuel: 'SP95E10',
    },
];

const STORAGE_KEY = 'octanelab.presets.v1';
const ACTIVE_KEY  = 'octanelab.activePreset.v1';

// --- State ---
const state = {
    presets: loadPresets(),
    activePresetId: localStorage.getItem(ACTIVE_KEY) || 'bmw-z4',
    targetEthanol: 50,
    capacity: 55,
    totalBars: 20,
    remainingBars: 5,
    fuel: 'SP98E5',
    remainingIsPure: false,
    season: getSeason(new Date()),
};

// --- DOM ---
const $ = (id) => document.getElementById(id);
const presetList    = $('presetList');
const targetEthanol = $('targetEthanol');
const targetEthanolOut = $('targetEthanolOut');
const tankCapacity  = $('tankCapacity');
const totalBars     = $('totalBars');
const remainingBars = $('remainingBars');
const barMinus      = $('barMinus');
const barPlus       = $('barPlus');
const barVisual     = $('barVisual');
const fuelSeg       = $('fuelSeg');
const remainingPure = $('remainingPure');
const e85Value      = $('e85Value');
const gasValue      = $('gasValue');
const gasLabel      = $('gasLabel');
const resultMeta    = $('resultMeta');
const resultDetail  = $('resultDetail');
const resultWarn    = $('resultWarn');
const seasonPill    = $('seasonPill');
const seasonLabel   = $('seasonLabel');

// Modal
const dialog        = $('presetDialog');
const presetForm    = $('presetForm');
const presetDialogTitle = $('presetDialogTitle');
const newPresetBtn  = $('newPresetBtn');
const pName         = $('pName');
const pCapacity     = $('pCapacity');
const pBars         = $('pBars');
const pFuel         = $('pFuel');
const presetCancel  = $('presetCancel');
const presetDelete  = $('presetDelete');
let editingId       = null;

// --- Init ---
function init() {
    renderSeason();
    renderPresets();

    // Apply active preset to inputs (without losing user-set targetEthanol default)
    const active = state.presets.find(p => p.id === state.activePresetId);
    if (active) applyPreset(active, { silent: true });

    syncInputsFromState();
    bind();
    compute();
}

function bind() {
    targetEthanol.addEventListener('input', () => {
        state.targetEthanol = clamp(parseInt(targetEthanol.value, 10) || 0, 0, 85);
        targetEthanolOut.textContent = state.targetEthanol + '%';
        updateRangeFill(targetEthanol);
        compute();
    });

    tankCapacity.addEventListener('input', () => {
        state.capacity = Math.max(0, parseFloat(tankCapacity.value) || 0);
        compute();
    });

    totalBars.addEventListener('input', () => {
        state.totalBars = Math.max(1, parseInt(totalBars.value, 10) || 1);
        state.remainingBars = clamp(state.remainingBars, 0, state.totalBars);
        remainingBars.value = state.remainingBars;
        renderBarVisual();
        compute();
    });

    remainingBars.addEventListener('input', () => {
        state.remainingBars = clamp(parseInt(remainingBars.value, 10) || 0, 0, state.totalBars);
        renderBarVisual();
        compute();
    });

    remainingBars.addEventListener('blur', () => {
        remainingBars.value = state.remainingBars;
    });

    barMinus.addEventListener('click', () => stepBars(-1));
    barPlus.addEventListener('click', () => stepBars(1));

    fuelSeg.addEventListener('click', (e) => {
        const btn = e.target.closest('.seg-opt');
        if (!btn) return;
        state.fuel = btn.dataset.fuel;
        updateFuelSeg();
        compute();
    });

    remainingPure.addEventListener('change', () => {
        state.remainingIsPure = remainingPure.checked;
        compute();
    });

    newPresetBtn.addEventListener('click', () => openPresetDialog(null));
    presetCancel.addEventListener('click', () => dialog.close());
    presetDelete.addEventListener('click', () => {
        if (!editingId) return;
        if (!confirm('Supprimer ce preset ?')) return;
        state.presets = state.presets.filter(p => p.id !== editingId);
        if (state.activePresetId === editingId) state.activePresetId = state.presets[0]?.id || null;
        savePresets();
        renderPresets();
        dialog.close();
    });

    presetForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = {
            name: pName.value.trim(),
            capacity: parseFloat(pCapacity.value),
            bars: parseInt(pBars.value, 10),
            fuel: pFuel.value,
        };
        if (!data.name || !data.capacity || !data.bars) return;

        if (editingId) {
            const p = state.presets.find(pp => pp.id === editingId);
            Object.assign(p, data);
        } else {
            const id = slugify(data.name) + '-' + Math.random().toString(36).slice(2, 6);
            state.presets.push({ id, ...data });
            state.activePresetId = id;
            applyPreset({ id, ...data }, { silent: false });
        }
        savePresets();
        renderPresets();
        syncInputsFromState();
        compute();
        dialog.close();
    });
}

// --- Compute ---
function compute() {
    const cap = state.capacity;
    const total = state.totalBars;
    const rem = state.remainingBars;
    const targetPct = state.targetEthanol / 100;
    const gasPct = FUEL_ETHANOL[state.fuel].pct;
    const e85Pct = E85[state.season].pct;

    if (!cap || !total) {
        renderResult({ invalid: 'Renseigne la capacité et le nombre de barres.' });
        return;
    }

    const currentVol = cap * (rem / total);
    const addVol = Math.max(0, cap - currentVol);
    const remainingEthanolPct = state.remainingIsPure ? gasPct : targetPct;
    const currentEthanolL = currentVol * remainingEthanolPct;
    const targetEthanolL = cap * targetPct;
    const addEthanolNeeded = targetEthanolL - currentEthanolL;

    // V_e85 * (e85Pct - gasPct) = addEthanolNeeded - addVol * gasPct
    const denom = e85Pct - gasPct;

    if (addVol < 0.01) {
        renderResult({
            invalid: 'Ton réservoir est déjà plein.',
            currentVol, addVol, currentEthanolL, targetEthanolL, e85Pct, gasPct,
        });
        return;
    }

    if (denom <= 0) {
        renderResult({ invalid: 'Configuration invalide (E85 doit avoir plus d\'éthanol que l\'essence).' });
        return;
    }

    let vE85 = (addEthanolNeeded - addVol * gasPct) / denom;
    let vGas = addVol - vE85;

    let warn = null;

    if (vE85 < -0.01) {
        // Already too much ethanol — can't lower it without draining
        const reachableEthanolL = currentEthanolL + addVol * gasPct;
        const reachablePctNow = reachableEthanolL / cap;
        warn = {
            type: 'danger',
            text: `Cible ${(targetPct*100).toFixed(0)}% inatteignable : avec le restant + ${FUEL_ETHANOL[state.fuel].label} pur, tu seras à ${(reachablePctNow*100).toFixed(1)}% minimum.`,
        };
        vE85 = 0;
        vGas = addVol;
    } else if (vGas < -0.01) {
        // Need more ethanol than pure E85 can provide
        const reachableMaxL = (currentEthanolL + addVol * e85Pct);
        const reachableMaxPct = reachableMaxL / cap;
        warn = {
            type: 'danger',
            text: `Cible ${(targetPct*100).toFixed(0)}% inatteignable : avec E85 ${(e85Pct*100).toFixed(0)}% pur en complément, tu plafonnes à ${(reachableMaxPct*100).toFixed(1)}%.`,
        };
        vE85 = addVol;
        vGas = 0;
    }

    vE85 = Math.max(0, vE85);
    vGas = Math.max(0, vGas);

    renderResult({
        vE85, vGas,
        currentVol, addVol, currentEthanolL, targetEthanolL,
        e85Pct, gasPct,
        warn,
    });
}

function renderResult(r) {
    if (r.invalid) {
        e85Value.textContent = '—';
        gasValue.textContent = '—';
        resultMeta.textContent = '—';
        resultDetail.innerHTML = `<div style="color:var(--text-mute);">${r.invalid}</div>`;
        resultWarn.hidden = true;
        return;
    }

    e85Value.textContent = fmt(r.vE85);
    gasValue.textContent = fmt(r.vGas);
    gasLabel.textContent = FUEL_ETHANOL[state.fuel].label;
    resultMeta.textContent = `cible ${state.targetEthanol}% · E85 ${(r.e85Pct*100).toFixed(0)}%`;

    resultDetail.innerHTML = `
        <div class="row"><span>Restant dans le réservoir</span><span class="v">${fmt(r.currentVol)} L</span></div>
        <div class="row"><span>À ajouter</span><span class="v">${fmt(r.addVol)} L</span></div>
        <div class="row"><span>Éthanol final</span><span class="v">${fmt(r.targetEthanolL)} L (${state.targetEthanol}%)</span></div>
    `;

    if (r.warn) {
        resultWarn.hidden = false;
        resultWarn.textContent = r.warn.text;
        resultWarn.classList.toggle('danger', r.warn.type === 'danger');
    } else {
        resultWarn.hidden = true;
    }
}

function fmt(x) {
    if (!isFinite(x)) return '—';
    return (Math.round(x * 10) / 10).toFixed(1);
}

// --- Presets ---
function loadPresets() {
    let stored = [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) stored = parsed;
        }
    } catch {}

    // Additive merge : ensure every default preset id is present, without
    // overwriting user-customised entries or removing user-added ones.
    const ids = new Set(stored.map(p => p.id));
    let mutated = false;
    for (const def of DEFAULT_PRESETS) {
        if (!ids.has(def.id)) {
            stored.push({ ...def });
            mutated = true;
        }
    }
    if (mutated || !localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    }
    return stored;
}

function savePresets() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.presets));
    if (state.activePresetId) localStorage.setItem(ACTIVE_KEY, state.activePresetId);
}

function renderPresets() {
    presetList.innerHTML = '';
    if (!state.presets.length) {
        presetList.innerHTML = '<span class="preset-empty">Aucun preset — clique sur Nouveau pour en créer un</span>';
        return;
    }
    for (const p of state.presets) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'preset-chip' + (p.id === state.activePresetId ? ' active' : '');
        chip.innerHTML = `
            <span>${escapeHtml(p.name)}</span>
            <svg class="edit-pencil" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" data-edit="1">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
            </svg>
        `;
        chip.addEventListener('click', (e) => {
            const isEdit = e.target.closest('[data-edit]');
            if (isEdit) {
                openPresetDialog(p);
            } else {
                state.activePresetId = p.id;
                applyPreset(p, { silent: false });
                savePresets();
                renderPresets();
                syncInputsFromState();
                compute();
            }
        });
        presetList.appendChild(chip);
    }
}

function applyPreset(p, { silent }) {
    state.capacity = p.capacity;
    state.totalBars = p.bars;
    state.fuel = p.fuel;
    if (!silent) {
        // keep targetEthanol & remainingBars as-is — user usually wants to re-set bars per session
    }
    state.remainingBars = clamp(state.remainingBars, 0, state.totalBars);
}

function openPresetDialog(preset) {
    editingId = preset?.id || null;
    presetDialogTitle.textContent = preset ? 'Modifier le preset' : 'Nouveau preset';
    pName.value     = preset?.name || '';
    pCapacity.value = preset?.capacity || '';
    pBars.value     = preset?.bars || '';
    pFuel.value     = preset?.fuel || 'SP98E5';
    presetDelete.hidden = !preset;
    if (typeof dialog.showModal === 'function') {
        dialog.showModal();
    } else {
        dialog.setAttribute('open', '');
    }
    setTimeout(() => pName.focus(), 50);
}

// --- UI sync ---
function syncInputsFromState() {
    targetEthanol.value = state.targetEthanol;
    targetEthanolOut.textContent = state.targetEthanol + '%';
    updateRangeFill(targetEthanol);
    tankCapacity.value = state.capacity;
    totalBars.value = state.totalBars;
    remainingBars.value = state.remainingBars;
    remainingBars.max = state.totalBars;
    renderBarVisual();
    updateFuelSeg();
    remainingPure.checked = state.remainingIsPure;
}

function updateFuelSeg() {
    fuelSeg.querySelectorAll('.seg-opt').forEach(b => {
        b.classList.toggle('active', b.dataset.fuel === state.fuel);
    });
}

function updateRangeFill(input) {
    const pct = ((parseFloat(input.value) - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--val', pct + '%');
}

function renderBarVisual() {
    barVisual.innerHTML = '';
    const total = state.totalBars;
    const filled = state.remainingBars;
    const isLow = filled / total <= 0.25;
    for (let i = 0; i < total; i++) {
        const cell = document.createElement('div');
        cell.className = 'bar-cell' + (i < filled ? ' full' : '') + (isLow ? ' low' : '');
        barVisual.appendChild(cell);
    }
}

function stepBars(delta) {
    state.remainingBars = clamp(state.remainingBars + delta, 0, state.totalBars);
    remainingBars.value = state.remainingBars;
    renderBarVisual();
    compute();
}

// --- Season ---
function getSeason(date) {
    const m = date.getMonth(); // 0-11
    // Winter grade (E85) : Nov, Dec, Jan, Feb, Mar
    if (m >= 10 || m <= 2) return 'winter';
    return 'summer';
}

function renderSeason() {
    const isWinter = state.season === 'winter';
    seasonLabel.textContent = `${E85[state.season].label} · E85 ${(E85[state.season].pct*100).toFixed(0)}%`;
    seasonPill.classList.toggle('winter', isWinter);
}

// --- Utils ---
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function slugify(s) {
    return s.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30);
}

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

init();
