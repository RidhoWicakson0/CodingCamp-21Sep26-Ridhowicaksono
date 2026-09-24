/* ==========================================================================
   app.js — Expense & Budget Visualizer
   Sections:
   1.  Constants & Config
   2.  StorageManager       — localStorage read/write
   3.  StateManager         — in-memory state + persistence
   4.  Helpers              — formatting, colour palette
   5.  UIRenderer           — DOM rendering
   6.  ChartManager         — Chart.js integration
   7.  EventHandlers        — user interactions
   8.  App Init             — DOMContentLoaded bootstrap
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. CONSTANTS & CONFIG
   ========================================================================== */
const STORAGE_KEY      = 'expense_app_data';
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];

/** Chart.js colour palette — maps category index → hex colour */
const CHART_COLORS = [
  '#ff6384',
  '#36a2eb',
  '#ffce56',
  '#4bc0c0',
  '#9966ff',
  '#ff9f40',
  '#c9cbcf',
];

/** Category emoji hints for a friendlier list */
const CATEGORY_ICONS = {
  food:      '🍔',
  transport: '🚗',
  fun:       '🎮',
  health:    '💊',
  shopping:  '🛍️',
  education: '📚',
};

function getCategoryIcon(category) {
  return CATEGORY_ICONS[category.toLowerCase()] || '💰';
}


/* ==========================================================================
   2. STORAGE MANAGER
   Sole layer that touches localStorage. All other modules call this.
   ========================================================================== */
const StorageManager = {
  /**
   * Read and parse the full app data object from localStorage.
   * Returns a safe default if nothing is stored yet.
   */
  getData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return this._defaultData();
      return JSON.parse(raw);
    } catch (err) {
      console.error('[StorageManager] Failed to read data:', err);
      return this._defaultData();
    }
  },

  /**
   * Serialise and persist the full data object to localStorage.
   * @param {object} data
   */
  saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('[StorageManager] Failed to save data:', err);
    }
  },

  /** Safe default structure when no data exists yet */
  _defaultData() {
    return {
      transactions: [],
      categories: [...DEFAULT_CATEGORIES],
      settings: {
        theme:     'light',
        sortOrder: 'date-desc',
      },
    };
  },
};


/* ==========================================================================
   3. STATE MANAGER
   Owns the in-memory application state. Every mutation:
     a) updates the state object
     b) persists via StorageManager
     c) triggers a UI re-render
   ========================================================================== */
const StateManager = {
  state: {
    transactions: [],
    categories:   [],
    settings: {
      theme:     'light',
      sortOrder: 'date-desc',
    },
  },

  /** Bootstrap: load persisted data into state */
  init() {
    const data = StorageManager.getData();
    this.state.transactions = data.transactions || [];
    this.state.categories   = data.categories   || [...DEFAULT_CATEGORIES];
    this.state.settings     = Object.assign(
      { theme: 'light', sortOrder: 'date-desc' },
      data.settings || {}
    );
  },

  /** Persist current state to localStorage */
  _save() {
    StorageManager.saveData({
      transactions: this.state.transactions,
      categories:   this.state.categories,
      settings:     this.state.settings,
    });
  },

  /* ── Transactions ──────────────────────────────────────────────────── */

  /**
   * Add a new transaction.
   * @param {{ name: string, amount: number, category: string }} txnData
   */
  addTransaction(txnData) {
    const txn = {
      id:       'txn_' + Date.now(),
      name:     txnData.name.trim(),
      amount:   Number(txnData.amount),
      category: txnData.category,
      date:     new Date().toISOString(),
    };
    this.state.transactions.push(txn);
    this._save();
    return txn;
  },

  /**
   * Remove a transaction by id.
   * @param {string} id
   */
  deleteTransaction(id) {
    this.state.transactions = this.state.transactions.filter(t => t.id !== id);
    this._save();
  },

  /* ── Categories (OC-1) ─────────────────────────────────────────────── */

  /**
   * Add a custom category if it doesn't already exist.
   * @param {string} name
   * @returns {boolean} true if added, false if duplicate
   */
  addCategory(name) {
    const trimmed = name.trim();
    const exists = this.state.categories.some(
      c => c.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) return false;
    this.state.categories.push(trimmed);
    this._save();
    return true;
  },

  /* ── Sort (OC-2) ───────────────────────────────────────────────────── */

  /**
   * Update the sort order preference.
   * @param {string} order
   */
  setSortOrder(order) {
    this.state.settings.sortOrder = order;
    this._save();
  },

  /* ── Theme (OC-3) ──────────────────────────────────────────────────── */

  /**
   * Switch between 'light' and 'dark'.
   * @param {string} theme
   */
  setTheme(theme) {
    this.state.settings.theme = theme;
    this._save();
  },

  /* ── Helpers ───────────────────────────────────────────────────────── */

  /** Return total sum of all transaction amounts */
  getTotal() {
    return this.state.transactions.reduce((sum, t) => sum + t.amount, 0);
  },

  /**
   * Return transactions sorted according to current sortOrder.
   * Does NOT mutate the source array.
   */
  getSortedTransactions() {
    const order = this.state.settings.sortOrder;
    const copy  = [...this.state.transactions];

    switch (order) {
      case 'date-asc':
        return copy.sort((a, b) => new Date(a.date) - new Date(b.date));
      case 'amount-desc':
        return copy.sort((a, b) => b.amount - a.amount);
      case 'amount-asc':
        return copy.sort((a, b) => a.amount - b.amount);
      case 'category-asc':
        return copy.sort((a, b) => a.category.localeCompare(b.category));
      case 'date-desc':
      default:
        return copy.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
  },

  /**
   * Aggregate amounts per category.
   * @returns {{ labels: string[], data: number[], colors: string[] }}
   */
  getCategoryTotals() {
    const map = {};
    this.state.transactions.forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    const labels = Object.keys(map);
    const data   = Object.values(map);
    const colors = labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
    return { labels, data, colors };
  },
};


/* ==========================================================================
   4. HELPERS
   ========================================================================== */

/**
 * Format a number as Rupiah currency string.
 * e.g. 25000 → "Rp 25.000"
 * @param {number} amount
 * @returns {string}
 */
function formatRupiah(amount) {
  return 'Rp ' + amount.toLocaleString('id-ID');
}

/**
 * Format an ISO date string to a short readable form.
 * e.g. "2024-09-21T08:30:00.000Z" → "21 Sep"
 * @param {string} isoString
 * @returns {string}
 */
function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/**
 * Return the chart colour for a category by index in the categories array.
 * @param {string} category
 * @returns {string} hex colour
 */
function getColorForCategory(category) {
  const idx = StateManager.state.categories.findIndex(
    c => c.toLowerCase() === category.toLowerCase()
  );
  return CHART_COLORS[(idx >= 0 ? idx : 0) % CHART_COLORS.length];
}

/**
 * Return the CSS badge class index for a category.
 * @param {string} category
 * @returns {number}
 */
function getBadgeColorIndex(category) {
  const idx = StateManager.state.categories.findIndex(
    c => c.toLowerCase() === category.toLowerCase()
  );
  return (idx >= 0 ? idx : 0) % CHART_COLORS.length;
}


/* ==========================================================================
   5. UI RENDERER
   All DOM mutations live here. Pure functions — receive data, write DOM.
   ========================================================================== */
const UIRenderer = {

  /** Run every renderer in the correct order */
  renderAll() {
    this.renderBalance();
    this.renderCategoryDropdown();
    this.renderTransactionList();
    this.renderThemeToggle();
  },

  /* ── Balance Card ──────────────────────────────────────────────────── */

  renderBalance() {
    const total     = StateManager.getTotal();
    const count     = StateManager.state.transactions.length;
    const elAmount  = document.getElementById('total-balance');
    const elCount   = document.getElementById('transaction-count');

    if (!elAmount || !elCount) return;

    // Brief pulse animation to signal the value changed
    elAmount.classList.remove('pulse');
    void elAmount.offsetWidth; // force reflow
    elAmount.classList.add('pulse');

    elAmount.textContent = formatRupiah(total);
    elCount.textContent  = count === 1 ? '1 transaction' : count + ' transactions';
  },

  /* ── Category Dropdown ─────────────────────────────────────────────── */

  renderCategoryDropdown() {
    const select = document.getElementById('item-category');
    if (!select) return;

    const current = select.value; // preserve selection if re-rendering

    // Default placeholder option
    select.innerHTML = '<option value="">Select category…</option>';

    StateManager.state.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value       = cat;
      opt.textContent = cat;
      if (cat === current) opt.selected = true;
      select.appendChild(opt);
    });
  },

  /* ── Transaction List ──────────────────────────────────────────────── */

  renderTransactionList() {
    const list       = document.getElementById('transaction-list');
    const emptyState = document.getElementById('empty-state');
    const badge      = document.getElementById('list-count-badge');
    const sortSel    = document.getElementById('sort-select');

    if (!list || !emptyState) return;

    const transactions = StateManager.getSortedTransactions();
    const isEmpty      = transactions.length === 0;

    // Sync sort-select value with stored state
    if (sortSel) sortSel.value = StateManager.state.settings.sortOrder;

    // Update count badge
    if (badge) badge.textContent = transactions.length;

    // Show / hide empty state
    emptyState.classList.toggle('visible', isEmpty);

    // Clear and re-render the list
    list.innerHTML = '';

    if (isEmpty) return;

    transactions.forEach(txn => {
      const li = this._buildTransactionItem(txn);
      list.appendChild(li);
    });
  },

  /**
   * Build a single <li> element for a transaction.
   * @param {object} txn
   * @returns {HTMLLIElement}
   */
  _buildTransactionItem(txn) {
    const colorIndex = getBadgeColorIndex(txn.category);
    const color      = CHART_COLORS[colorIndex];
    const icon       = getCategoryIcon(txn.category);
    const dateStr    = formatDate(txn.date);

    const li = document.createElement('li');
    li.className   = 'transaction-item';
    li.dataset.id  = txn.id;

    li.innerHTML = `
      <span class="tx-dot" style="background-color: ${color};" aria-hidden="true"></span>
      <div class="tx-info">
        <span class="tx-name">${this._escapeHtml(txn.name)}</span>
        <div class="tx-meta">
          <span class="tx-category-badge badge-color-${colorIndex}" aria-label="Category: ${this._escapeHtml(txn.category)}">
            ${icon} ${this._escapeHtml(txn.category)}
          </span>
          <span class="tx-date">${dateStr}</span>
        </div>
      </div>
      <div class="tx-right">
        <span class="tx-amount">${formatRupiah(txn.amount)}</span>
        <button
          class="btn-delete"
          data-id="${txn.id}"
          aria-label="Delete transaction: ${this._escapeHtml(txn.name)}"
          title="Delete this transaction"
        >🗑️</button>
      </div>
    `;
    return li;
  },

  /* ── Theme Toggle Icon ─────────────────────────────────────────────── */

  renderThemeToggle() {
    const icon  = document.getElementById('theme-icon');
    const btn   = document.getElementById('theme-toggle');
    if (!icon || !btn) return;

    const isDark = StateManager.state.settings.theme === 'dark';
    icon.textContent = isDark ? '☀️' : '🌙';
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  },

  /* ── Chart Empty State ─────────────────────────────────────────────── */

  renderChartEmptyState() {
    const wrapper = document.querySelector('.chart-wrapper');
    const empty   = document.getElementById('chart-empty');
    const isEmpty = StateManager.state.transactions.length === 0;

    if (wrapper) wrapper.classList.toggle('hidden', isEmpty);
    if (empty)   empty.classList.toggle('visible', isEmpty);
  },

  /* ── Utility ───────────────────────────────────────────────────────── */

  /** Safely escape user-supplied strings for innerHTML */
  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
};


/* ==========================================================================
   6. CHART MANAGER
   Manages the single Chart.js instance. Never re-creates; only updates.
   ========================================================================== */
const ChartManager = {
  _instance: null,

  /**
   * Create the Chart.js pie chart for the first time.
   * Must be called after DOMContentLoaded.
   */
  initChart() {
    const canvas = document.getElementById('expense-chart');
    if (!canvas) return;

    const { labels, data, colors } = StateManager.getCategoryTotals();

    this._instance = new Chart(canvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor:  colors,
          borderColor:      colors.map(() => 'transparent'),
          borderWidth:      2,
          hoverBorderColor: colors,
          hoverBorderWidth: 2,
          hoverOffset:      8,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation: {
          animateRotate: true,
          duration:      500,
        },
        plugins: {
          legend: {
            position:  'bottom',
            labels: {
              padding:    16,
              boxWidth:   12,
              boxHeight:  12,
              font:       { size: 12, family: "'Segoe UI', system-ui, sans-serif" },
              color:      this._getLegendColor(),
              usePointStyle: true,
            },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const val   = ctx.parsed;
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                return ` ${formatRupiah(val)}  (${pct}%)`;
              },
            },
          },
        },
      },
    });

    UIRenderer.renderChartEmptyState();
  },

  /**
   * Update the existing chart instance with fresh data.
   * Called after every state change.
   */
  updateChart() {
    UIRenderer.renderChartEmptyState();

    if (!this._instance) {
      this.initChart();
      return;
    }

    const { labels, data, colors } = StateManager.getCategoryTotals();

    this._instance.data.labels                         = labels;
    this._instance.data.datasets[0].data               = data;
    this._instance.data.datasets[0].backgroundColor    = colors;
    this._instance.data.datasets[0].hoverBorderColor   = colors;

    // Keep legend text colour in sync with current theme
    this._instance.options.plugins.legend.labels.color = this._getLegendColor();

    this._instance.update();
  },

  /** Read the correct legend text colour from the active CSS theme */
  _getLegendColor() {
    return getComputedStyle(document.documentElement)
      .getPropertyValue('--color-text')
      .trim() || '#1a202c';
  },
};


/* ==========================================================================
   7. EVENT HANDLERS
   Binds all user interactions. Calls StateManager then re-renders.
   ========================================================================== */
const EventHandlers = {

  bindAll() {
    this.bindFormSubmit();
    this.bindDeleteButtons();
    this.bindSortControls();
    this.bindThemeToggle();
    this.bindAddCategory();
    this.bindCategoryToggle();
  },

  /* ── Form Submit ───────────────────────────────────────────────────── */

  bindFormSubmit() {
    const form = document.getElementById('transaction-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const nameInput  = document.getElementById('item-name');
      const amountInput = document.getElementById('item-amount');
      const catSelect  = document.getElementById('item-category');

      const name     = nameInput.value.trim();
      const amount   = amountInput.value.trim();
      const category = catSelect.value;

      // — Validation —
      let hasError = false;

      if (!name) {
        this._showError('item-name-error', nameInput, 'Item name is required.');
        hasError = true;
      } else {
        this._clearError('item-name-error', nameInput);
      }

      if (!amount || isNaN(amount) || Number(amount) <= 0) {
        this._showError('item-amount-error', amountInput, 'Enter a valid amount greater than 0.');
        hasError = true;
      } else {
        this._clearError('item-amount-error', amountInput);
      }

      if (!category) {
        this._showError('item-category-error', catSelect, 'Please select a category.');
        hasError = true;
      } else {
        this._clearError('item-category-error', catSelect);
      }

      if (hasError) return;

      // — Commit —
      StateManager.addTransaction({ name, amount, category });

      // — Re-render —
      UIRenderer.renderBalance();
      UIRenderer.renderTransactionList();
      ChartManager.updateChart();

      // — Reset form —
      form.reset();
      // Reset select back to placeholder
      catSelect.value = '';
    });
  },

  /* ── Delete Buttons (event delegation) ────────────────────────────── */

  bindDeleteButtons() {
    const list = document.getElementById('transaction-list');
    if (!list) return;

    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-delete');
      if (!btn) return;

      const id   = btn.dataset.id;
      const item = btn.closest('.transaction-item');

      // Animate out, then delete
      if (item) {
        item.classList.add('removing');
        item.addEventListener('animationend', () => {
          StateManager.deleteTransaction(id);
          UIRenderer.renderBalance();
          UIRenderer.renderTransactionList();
          ChartManager.updateChart();
        }, { once: true });
      } else {
        StateManager.deleteTransaction(id);
        UIRenderer.renderBalance();
        UIRenderer.renderTransactionList();
        ChartManager.updateChart();
      }
    });
  },

  /* ── Sort Controls (OC-2) ──────────────────────────────────────────── */

  bindSortControls() {
    const sortSelect = document.getElementById('sort-select');
    if (!sortSelect) return;

    sortSelect.addEventListener('change', () => {
      StateManager.setSortOrder(sortSelect.value);
      UIRenderer.renderTransactionList();
    });
  },

  /* ── Theme Toggle (OC-3) ───────────────────────────────────────────── */

  bindThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const current = StateManager.state.settings.theme;
      const next    = current === 'light' ? 'dark' : 'light';

      StateManager.setTheme(next);

      // Apply to <html data-theme="...">
      document.documentElement.setAttribute('data-theme', next);

      UIRenderer.renderThemeToggle();
      ChartManager.updateChart(); // refresh legend text colour
    });
  },

  /* ── Add Custom Category (OC-1) ────────────────────────────────────── */

  bindAddCategory() {
    const addBtn = document.getElementById('add-category-btn');
    const input  = document.getElementById('new-category-input');
    const errEl  = document.getElementById('category-error');
    if (!addBtn || !input) return;

    addBtn.addEventListener('click', () => {
      const name = input.value.trim();

      if (!name) {
        this._showError('category-error', input, 'Category name cannot be empty.');
        return;
      }

      if (name.length < 2) {
        this._showError('category-error', input, 'Category name must be at least 2 characters.');
        return;
      }

      const added = StateManager.addCategory(name);

      if (!added) {
        this._showError('category-error', input, `"${name}" already exists.`);
        return;
      }

      // Success
      if (errEl) errEl.textContent = '';
      input.classList.remove('error');
      input.value = '';
      UIRenderer.renderCategoryDropdown();
      ChartManager.updateChart();

      // Brief success feedback
      addBtn.textContent = '✓ Added';
      addBtn.style.background = 'var(--color-success)';
      addBtn.style.color = 'white';
      addBtn.style.borderColor = 'var(--color-success)';
      setTimeout(() => {
        addBtn.textContent = 'Add';
        addBtn.style.background = '';
        addBtn.style.color = '';
        addBtn.style.borderColor = '';
      }, 1500);
    });

    // Allow Enter key in the category input
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addBtn.click();
      }
    });
  },

  /* ── Add Category Collapsible toggle ──────────────────────────────── */

  bindCategoryToggle() {
    const toggleBtn  = document.getElementById('category-toggle');
    const collapseEl = document.getElementById('category-form');
    if (!toggleBtn || !collapseEl) return;

    toggleBtn.addEventListener('click', () => {
      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      const next       = !isExpanded;

      toggleBtn.setAttribute('aria-expanded', String(next));

      if (next) {
        collapseEl.removeAttribute('hidden');
      } else {
        collapseEl.setAttribute('hidden', '');
      }
    });
  },

  /* ── Inline Validation Helpers ─────────────────────────────────────── */

  _showError(errorId, inputEl, message) {
    const errEl = document.getElementById(errorId);
    if (errEl) errEl.textContent = message;
    if (inputEl) inputEl.classList.add('error');
  },

  _clearError(errorId, inputEl) {
    const errEl = document.getElementById(errorId);
    if (errEl) errEl.textContent = '';
    if (inputEl) inputEl.classList.remove('error');
  },
};


/* ==========================================================================
   8. APP INIT
   Entry point — runs once after the DOM is ready.
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {

  // 1. Load persisted data into state
  StateManager.init();

  // 2. Apply stored theme to <html> BEFORE first render (prevents flash)
  document.documentElement.setAttribute(
    'data-theme',
    StateManager.state.settings.theme
  );

  // 3. Render the full UI from state
  UIRenderer.renderAll();

  // 4. Initialise Chart.js
  ChartManager.initChart();

  // 5. Bind all event listeners
  EventHandlers.bindAll();

});
