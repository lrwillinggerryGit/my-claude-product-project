/* ===================================================================
   随手记 · 应用逻辑
   纯前端 + localStorage，无任何外部依赖（图表用 canvas 手绘）
   对齐 PRD V1.0：快速记账 / 收支分类 / 账单流水 / 月度统计 / 预算 / 习惯激励 / 备份导出
   =================================================================== */
(function () {
  'use strict';

  /* ---------- 分类预置 ---------- */
  const CATS = {
    expense: [
      { name: '餐饮', icon: '🍜' }, { name: '交通', icon: '🚌' }, { name: '购物', icon: '🛍️' },
      { name: '居住', icon: '🏠' }, { name: '娱乐', icon: '🎮' }, { name: '医疗', icon: '💊' },
      { name: '教育', icon: '📚' }, { name: '人情', icon: '🎁' }, { name: '通讯', icon: '📱' },
      { name: '其他', icon: '📦' },
    ],
    income: [
      { name: '工资', icon: '💰' }, { name: '奖金', icon: '🏆' }, { name: '理财', icon: '📈' },
      { name: '兼职', icon: '💼' }, { name: '红包', icon: '🧧' }, { name: '其他', icon: '✨' },
    ],
  };
  const PIE_COLORS = ['#FF9EC4', '#FFC8A2', '#A8E6CF', '#FFB3C6', '#C8B6FF', '#FFD6A5',
    '#9BE7DD', '#FDA4BA', '#F8C8DC', '#B5EAD7', '#FFDAC1', '#E2A9F3'];
  const EMOJI_POOL = ['🍰', '☕', '🍔', '🚗', '✈️', '🏥', '🎵', '🎬', '🐶', '🌷', '💄', '👗',
    '⚽', '📖', '💡', '🧧', '💼', '🏦', '🎮', '🍜', '🛍️', '🏠', '💊', '📚'];

  const STORE_KEY_BASE = 'suishouji_v1';
  const ACCOUNTS_KEY   = 'suishouji_accounts';
  const SESSION_KEY    = 'suishouji_session';
  let STORE_KEY = STORE_KEY_BASE;
  const MAX_AMOUNT = 1000000;

  /* ---------- 状态 ---------- */
  let state;
  let addState = { type: 'expense', cat: null, amountStr: '0', date: todayStr(), note: '', editingId: null };
  let billMonth = monthKey(new Date());     // 'YYYY-MM'
  let billRange = 'day';                     // day | week | month
  let billFilter = null;                     // {kw,min,max}
  let statPeriod = 'month';                  // month | last | year
  let pieFocus = null;                       // 下钻分类名

  /* ---------- DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const screen = $('screen');
  const toastEl = $('toast');
  const mask = $('sheetMask');
  const sheet = $('sheet');

  /* ===================================================================
     工具函数
     =================================================================== */
  // 归一化：兼容旧数据（单账本/customCats）→ 新结构（多账本 + categories）
  function normalize(s) {
    s = s || {};
    if (!Array.isArray(s.ledgers)) {
      s.ledgers = [{
        id: 'default', name: '默认账本', icon: '💕',
        records: Array.isArray(s.records) ? s.records : [],
        budgets: (s.budgets && typeof s.budgets === 'object') ? s.budgets : { total: null, cats: {} },
      }];
      s.currentLedgerId = 'default';
    }
    s.ledgers.forEach((l) => {
      l.id = l.id || uid();
      l.name = l.name || '账本';
      l.icon = l.icon || '📒';
      l.records = Array.isArray(l.records) ? l.records : [];
      l.budgets = l.budgets || { total: null, cats: {} };
      l.budgets.cats = l.budgets.cats || {};
    });
    if (!s.currentLedgerId || !s.ledgers.some((l) => l.id === s.currentLedgerId)) s.currentLedgerId = s.ledgers[0].id;
    delete s.records; delete s.budgets;

    if (!s.categories || !s.categories.expense || !s.categories.income) {
      s.categories = {
        expense: CATS.expense.map((c) => ({ name: c.name, icon: c.icon, preset: true })),
        income: CATS.income.map((c) => ({ name: c.name, icon: c.icon, preset: true })),
      };
      const cc = s.customCats || { expense: [], income: [] };
      ['expense', 'income'].forEach((t) => (cc[t] || []).forEach((c) => {
        if (!s.categories[t].some((x) => x.name === c.name)) s.categories[t].push({ name: c.name, icon: c.icon });
      }));
    }
    delete s.customCats;

    s.settings = s.settings || {};
    s.settings.lastCat = s.settings.lastCat || {};
    s.settings.lock = s.settings.lock || { enabled: false, hash: '' };
    s.settings.reminder = s.settings.reminder || { enabled: false, time: '21:00' };
    return s;
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { console.warn('读取本地数据失败', e); }
    return normalize({});
  }
  // 当前账本 + 别名绑定：state.records / state.budgets 始终指向当前账本
  function curLedger() { return state.ledgers.find((l) => l.id === state.currentLedgerId) || state.ledgers[0]; }
  function bindLedger() { const L = curLedger(); state.records = L.records; state.budgets = L.budgets; }
  function serialize() {
    delete state.records; delete state.budgets;   // 别名不持久化（避免与 ledgers 重复）
    const json = JSON.stringify(state);
    bindLedger();
    return json;
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, serialize()); }
    catch (e) { toast('保存失败：本地空间不足'); }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr() { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function monthKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }

  function fmt(n) {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtShort(n) { // 大数字简写
    n = Number(n);
    if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '万';
    return fmt(n);
  }

  function catList(type) { return (state.categories && state.categories[type]) || []; }
  function getAllCats(type) { return catList(type).filter((c) => !c.hidden); }   // 可选分类（隐藏的不显示）
  function getIcon(type, name) {
    const c = catList(type).find((x) => x.name === name);
    return c ? c.icon : (type === 'income' ? '✨' : '📦');
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('show'), 1900);
  }

  function openSheet(html) { sheet.innerHTML = html; mask.hidden = false; }
  function closeSheet() { mask.hidden = true; sheet.innerHTML = ''; }
  mask.addEventListener('click', (e) => { if (e.target === mask) closeSheet(); });

  /* 友好日期 */
  function friendlyDate(ds) {
    const t = todayStr();
    if (ds === t) return '今天';
    const d = parseDate(ds); const y = new Date(); y.setDate(y.getDate() - 1);
    if (ds === monthKey(y) + '-' + pad2(y.getDate())) return '昨天';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function weekdayCn(ds) { return '日一二三四五六'[parseDate(ds).getDay()]; }

  /* ===================================================================
     导航
     =================================================================== */
  const TOP = {
    add: ['记一笔', '打开即记 · 记完即走'],
    bills: ['账单流水', '看清每一笔去向'],
    stats: ['统计分析', '钱都花哪儿了'],
    budget: ['预算管理', '把钱花在刀刃上'],
    me: ['我的', '坚持记账，遇见更好的自己'],
  };
  function switchView(name) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    $('view-' + name).classList.add('active');
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    $('topbarTitle').textContent = TOP[name][0];
    $('topbarSub').textContent = TOP[name][1];
    screen.scrollTop = 0;
    if (name === 'add') renderCatGrid();
    if (name === 'bills') renderBills();
    if (name === 'stats') renderStats();
    if (name === 'budget') renderBudget();
    if (name === 'me') renderMe();
  }
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  /* ===================================================================
     记账页
     =================================================================== */
  const segThumb = $('segThumb');
  const seg = document.querySelector('.seg');
  const amountDisplay = $('amountDisplay');
  const amountSign = $('amountSign');
  const amountBar = document.querySelector('.amount-bar');

  function setType(type) {
    addState.type = type;
    seg.classList.toggle('income', type === 'income');
    $('segExpense').classList.toggle('active', type === 'expense');
    $('segIncome').classList.toggle('active', type === 'income');
    amountSign.textContent = type === 'income' ? '+' : '-';
    amountBar.classList.toggle('income', type === 'income');
    // 选中上次使用的分类，否则不选
    addState.cat = state.settings.lastCat[type] || null;
    renderCatGrid();
  }
  $('segExpense').addEventListener('click', () => setType('expense'));
  $('segIncome').addEventListener('click', () => setType('income'));

  function renderCatGrid() {
    const grid = $('catGrid');
    const cats = getAllCats(addState.type);
    grid.innerHTML = cats.map((c) =>
      `<button class="cat${addState.cat === c.name ? ' sel' : ''}" data-cat="${esc(c.name)}">
         <span class="cat-ic">${c.icon}</span><span class="cat-name">${esc(c.name)}</span>
       </button>`).join('') +
      `<button class="cat add" id="addCatBtn"><span class="cat-ic">＋</span><span class="cat-name">自定义</span></button>`;
    grid.querySelectorAll('.cat[data-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        addState.cat = btn.dataset.cat;
        renderCatGrid();
      });
    });
    $('addCatBtn').addEventListener('click', openAddCategory);
  }

  function updateAmount() {
    amountDisplay.textContent = formatAmountStr(addState.amountStr);
    const val = parseFloat(addState.amountStr) || 0;
    $('saveBtn').disabled = !(val > 0);
  }
  function formatAmountStr(s) {
    let [int, dec] = s.split('.');
    int = int.replace(/^0+(?=\d)/, '');
    if (int === '') int = '0';
    const intF = Number(int).toLocaleString('en-US');
    return s.indexOf('.') >= 0 ? intF + '.' + (dec || '') : intF;
  }

  function keyPress(k) {
    let s = addState.amountStr;
    if (k === 'back') {
      s = s.length > 1 ? s.slice(0, -1) : '0';
    } else if (k === 'clear') {
      s = '0';
    } else if (k === '.') {
      if (s.indexOf('.') < 0) s += '.';
    } else { // 数字
      if (s.indexOf('.') >= 0 && s.split('.')[1].length >= 2) return; // 最多两位小数
      const next = (s === '0') ? k : s + k;
      if (parseFloat(next) > MAX_AMOUNT) { toast('单笔金额上限 ' + fmt(MAX_AMOUNT)); return; }
      s = next;
    }
    addState.amountStr = s;
    updateAmount();
  }
  $('keypad').addEventListener('click', (e) => {
    const btn = e.target.closest('.key'); if (!btn) return;
    if (btn.id === 'saveBtn') { saveRecord(); return; }
    if (btn.dataset.k) keyPress(btn.dataset.k);
  });
  // PC 端物理键盘
  window.addEventListener('keydown', (e) => {
    if (!$('view-add').classList.contains('active')) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (/[0-9]/.test(e.key)) keyPress(e.key);
    else if (e.key === '.') keyPress('.');
    else if (e.key === 'Backspace') keyPress('back');
    else if (e.key === 'Enter') saveRecord();
  });

  $('noteInput').addEventListener('input', (e) => { addState.note = e.target.value; });

  // 日期
  const dateInput = $('dateInput');
  dateInput.value = addState.date;
  $('dateBtn').addEventListener('click', () => { dateInput.showPicker ? dateInput.showPicker() : dateInput.click(); });
  dateInput.addEventListener('change', () => {
    addState.date = dateInput.value || todayStr();
    $('dateLabel').textContent = friendlyDate(addState.date);
  });

  function saveRecord() {
    const amount = parseFloat(addState.amountStr) || 0;
    if (!(amount > 0)) { toast('请输入金额~'); return; }
    if (!addState.cat) { toast('先选一个分类吧 🌷'); return; }

    if (addState.editingId) {
      const r = state.records.find((x) => x.id === addState.editingId);
      if (r) { r.type = addState.type; r.amount = amount; r.cat = addState.cat; r.date = addState.date; r.note = addState.note; }
      addState.editingId = null;
      $('saveBtn').textContent = '保存';
      save();
      toast('已更新 ✨');
      resetAddForm();
      switchView('bills');
      return;
    }

    const rec = { id: uid(), type: addState.type, amount, cat: addState.cat, date: addState.date, note: addState.note.trim(), ts: Date.now() };
    state.records.push(rec);
    state.settings.lastCat[addState.type] = addState.cat;
    save();

    flyCoins(addState.type === 'income' ? '💰' : '💸');
    toast('记好啦！第 ' + state.records.length + ' 笔 🎉');
    checkBudgetAlert(rec);
    resetAddForm();
  }

  function resetAddForm() {
    addState.amountStr = '0';
    addState.note = '';
    addState.date = todayStr();
    $('noteInput').value = '';
    dateInput.value = addState.date;
    $('dateLabel').textContent = '今天';
    updateAmount();
  }

  function flyCoins(emoji) {
    const layer = $('fxLayer');
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight - 140;
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('span');
      c.className = 'coin'; c.textContent = emoji;
      c.style.left = (cx + (Math.random() * 120 - 60)) + 'px';
      c.style.top = cy + 'px';
      c.style.animationDelay = (i * 50) + 'ms';
      layer.appendChild(c);
      setTimeout(() => c.remove(), 1000 + i * 50);
    }
  }

  function openAddCategory() {
    let pickedEmoji = EMOJI_POOL[0];
    const emojiBtns = EMOJI_POOL.map((e, i) =>
      `<button type="button" class="cat emo${i === 0 ? ' sel' : ''}" data-emo="${e}"><span class="cat-ic">${e}</span></button>`).join('');
    openSheet(`
      <div class="sheet-title">新增${addState.type === 'income' ? '收入' : '支出'}分类</div>
      <div class="sheet-field">
        <label>分类名称</label>
        <input type="text" id="newCatName" maxlength="6" placeholder="如：宠物、健身…" />
      </div>
      <div class="sheet-field"><label>选择图标</label>
        <div class="sheet-cat-grid" id="emojiGrid">${emojiBtns}</div>
      </div>
      <div class="sheet-actions">
        <button class="sheet-btn edit" id="catCancel">取消</button>
        <button class="sheet-btn primary" id="catSave">保存分类</button>
      </div>`);
    sheet.querySelectorAll('.emo').forEach((b) => b.addEventListener('click', () => {
      sheet.querySelectorAll('.emo').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel'); pickedEmoji = b.dataset.emo;
    }));
    $('catCancel').addEventListener('click', closeSheet);
    $('catSave').addEventListener('click', () => {
      const name = $('newCatName').value.trim();
      if (!name) { toast('给分类起个名字吧'); return; }
      if (catList(addState.type).some((c) => c.name === name)) { toast('已有同名分类'); return; }
      state.categories[addState.type].push({ name, icon: pickedEmoji });
      addState.cat = name;
      save(); renderCatGrid(); closeSheet(); toast('分类已添加 🌸');
    });
  }

  /* ===================================================================
     账单页
     =================================================================== */
  function shiftMonth(delta) {
    const [y, m] = billMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    billMonth = monthKey(d);
    renderBills();
  }
  $('billPrev').addEventListener('click', () => shiftMonth(-1));
  $('billNext').addEventListener('click', () => shiftMonth(1));
  $('billMonthLabel').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'month'; inp.value = billMonth;
    inp.style.position = 'fixed'; inp.style.opacity = '0'; document.body.appendChild(inp);
    inp.addEventListener('change', () => { if (inp.value) { billMonth = inp.value; renderBills(); } inp.remove(); });
    (inp.showPicker ? inp.showPicker() : inp.click());
  });
  document.querySelectorAll('#rangeSeg .vseg-btn').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#rangeSeg .vseg-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); billRange = b.dataset.range; renderBills();
  }));
  $('searchToggle').addEventListener('click', () => { $('searchPanel').hidden = !$('searchPanel').hidden; });
  $('searchApply').addEventListener('click', () => {
    billFilter = {
      kw: $('searchKw').value.trim(),
      min: parseFloat($('searchMin').value) || null,
      max: parseFloat($('searchMax').value) || null,
    };
    renderBills(); toast('已应用筛选');
  });
  $('searchClear').addEventListener('click', () => {
    $('searchKw').value = ''; $('searchMin').value = ''; $('searchMax').value = '';
    billFilter = null; renderBills();
  });

  function monthRecords(mk) {
    return state.records.filter((r) => r.date.slice(0, 7) === mk);
  }

  function renderBills() {
    const [y, m] = billMonth.split('-').map(Number);
    $('billMonthLabel').textContent = y + '年' + m + '月';

    let recs = monthRecords(billMonth);
    // 头部统计（整月，不受筛选影响）
    const inc = recs.filter((r) => r.type === 'income').reduce((a, r) => a + r.amount, 0);
    const exp = recs.filter((r) => r.type === 'expense').reduce((a, r) => a + r.amount, 0);
    $('billIncome').textContent = '+' + fmt(inc);
    $('billExpense').textContent = '-' + fmt(exp);
    const bal = inc - exp;
    $('billBalance').textContent = (bal >= 0 ? '' : '-') + fmt(Math.abs(bal));

    // 筛选
    if (billFilter) {
      recs = recs.filter((r) => {
        if (billFilter.kw && !(r.note.includes(billFilter.kw) || r.cat.includes(billFilter.kw))) return false;
        if (billFilter.min != null && r.amount < billFilter.min) return false;
        if (billFilter.max != null && r.amount > billFilter.max) return false;
        return true;
      });
    }
    recs.sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);

    const list = $('billList');
    if (!recs.length) {
      list.innerHTML = emptyState('🌱', '这个月还没有记录', '切到「记账」页，随手记一笔吧');
      return;
    }

    // 分组
    const groups = {};
    const order = [];
    recs.forEach((r) => {
      const key = groupKey(r.date);
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(r);
    });

    list.innerHTML = order.map((key) => {
      const items = groups[key];
      const gInc = items.filter((r) => r.type === 'income').reduce((a, r) => a + r.amount, 0);
      const gExp = items.filter((r) => r.type === 'expense').reduce((a, r) => a + r.amount, 0);
      return `<div class="day-group">
        <div class="day-head">
          <span class="day-date">${key}</span>
          <span class="day-sum">${gExp ? '支 <b>' + fmt(gExp) + '</b>' : ''}${gExp && gInc ? ' · ' : ''}${gInc ? '收 <b>' + fmt(gInc) + '</b>' : ''}</span>
        </div>
        <div class="bill-card">
          ${items.map(billItemHtml).join('')}
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('.bill-item').forEach((el) => {
      el.addEventListener('click', () => openDetail(el.dataset.id));
    });
  }

  function groupKey(ds) {
    if (billRange === 'month') return parseDate(ds).getMonth() + 1 + '月汇总';
    if (billRange === 'week') {
      const d = parseDate(ds); const day = (d.getDay() + 6) % 7; // 周一=0
      const mon = new Date(d); mon.setDate(d.getDate() - day);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return `${mon.getMonth() + 1}/${mon.getDate()} - ${sun.getMonth() + 1}/${sun.getDate()}`;
    }
    return friendlyDate(ds) + ' 周' + weekdayCn(ds);
  }

  function billItemHtml(r) {
    const sign = r.type === 'income' ? '+' : '-';
    return `<div class="bill-item" data-id="${r.id}">
      <span class="bi-ic">${getIcon(r.type, r.cat)}</span>
      <span class="bi-mid">
        <span class="bi-cat">${esc(r.cat)}</span>
        <span class="bi-note">${r.note ? esc(r.note) : friendlyDate(r.date)}</span>
      </span>
      <span class="bi-amt ${r.type}">${sign}${fmt(r.amount)}</span>
    </div>`;
  }

  function openDetail(id) {
    const r = state.records.find((x) => x.id === id); if (!r) return;
    openSheet(`
      <div class="sheet-detail">
        <div class="sd-ic">${getIcon(r.type, r.cat)}</div>
        <div class="sd-amt ${r.type}">${r.type === 'income' ? '+' : '-'}${fmt(r.amount)}</div>
        <div class="sd-meta">${esc(r.cat)} · ${(r.date)}${r.note ? ' · ' + esc(r.note) : ''}</div>
      </div>
      <div class="sheet-actions">
        <button class="sheet-btn edit" id="editRec">✏️ 编辑</button>
        <button class="sheet-btn del" id="delRec">🗑️ 删除</button>
      </div>`);
    $('editRec').addEventListener('click', () => { closeSheet(); loadForEdit(r); });
    $('delRec').addEventListener('click', () => {
      const i = state.records.findIndex((x) => x.id === id);
      if (i >= 0) state.records.splice(i, 1);
      save(); closeSheet(); renderBills(); toast('已删除');
    });
  }

  function loadForEdit(r) {
    addState.editingId = r.id;
    addState.amountStr = String(r.amount);
    addState.note = r.note;
    addState.date = r.date;
    $('noteInput').value = r.note;
    dateInput.value = r.date;
    $('dateLabel').textContent = friendlyDate(r.date);
    setType(r.type);
    addState.cat = r.cat;
    renderCatGrid();
    updateAmount();
    $('saveBtn').textContent = '更新';
    switchView('add');
    toast('编辑中…改完点「更新」');
  }

  /* ===================================================================
     统计页
     =================================================================== */
  document.querySelectorAll('#statSeg .vseg-btn').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#statSeg .vseg-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); statPeriod = b.dataset.period; pieFocus = null; renderStats();
  }));

  function periodRange(period) {
    const now = new Date();
    let start, end, label;
    if (period === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    } else if (period === 'last') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 1);
    } else { // year
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear() + 1, 0, 1);
    }
    return { start, end };
  }
  function prevPeriodRange(period) {
    const now = new Date();
    if (period === 'month') return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1) };
    if (period === 'last') return { start: new Date(now.getFullYear(), now.getMonth() - 2, 1), end: new Date(now.getFullYear(), now.getMonth() - 1, 1) };
    return { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear(), 0, 1) };
  }
  function inRange(r, range) { const d = parseDate(r.date); return d >= range.start && d < range.end; }
  function sumBy(records, type) { return records.filter((r) => r.type === type).reduce((a, r) => a + r.amount, 0); }

  function renderStats() {
    const range = periodRange(statPeriod);
    const recs = state.records.filter((r) => inRange(r, range));
    const exp = sumBy(recs, 'expense');
    const inc = sumBy(recs, 'income');
    $('statExpense').textContent = fmtShort(exp);
    $('statIncome').textContent = fmtShort(inc);
    const bal = inc - exp;
    $('statBalance').textContent = (bal < 0 ? '-' : '') + fmtShort(Math.abs(bal));

    // 环比
    const prange = prevPeriodRange(statPeriod);
    const precs = state.records.filter((r) => inRange(r, prange));
    setMom($('statExpenseMom'), exp, sumBy(precs, 'expense'), true);
    setMom($('statIncomeMom'), inc, sumBy(precs, 'income'), false);

    renderPie(recs, exp);
    renderTrend();
  }

  function setMom(el, cur, prev, expenseSemantic) {
    if (!prev) { el.textContent = '—'; el.className = 'sc-mom'; return; }
    const pct = ((cur - prev) / prev) * 100;
    const up = pct >= 0;
    el.textContent = (up ? '↑' : '↓') + Math.abs(pct).toFixed(0) + '% 环比';
    // 支出涨=红(坏)，收入涨=绿(好)
    el.className = 'sc-mom ' + (expenseSemantic ? (up ? 'up' : 'down') : (up ? 'down' : 'up'));
  }

  function renderPie(recs, totalExp) {
    const byCat = {};
    recs.filter((r) => r.type === 'expense').forEach((r) => { byCat[r.cat] = (byCat[r.cat] || 0) + r.amount; });
    const data = Object.keys(byCat).map((name) => ({ name, value: byCat[name] }))
      .sort((a, b) => b.value - a.value)
      .map((d, i) => ({ ...d, color: PIE_COLORS[i % PIE_COLORS.length] }));

    const canvas = $('pieChart');
    const legend = $('pieLegend');
    const center = $('pieCenter');

    if (!data.length) {
      clearCanvas(canvas);
      center.innerHTML = '<span>暂无支出</span>';
      legend.innerHTML = emptyState('🍃', '本期还没有支出记录', '');
      return;
    }

    drawPie(canvas, data, totalExp);
    center.innerHTML = '<b>¥' + fmtShort(totalExp) + '</b><span>总支出</span>';

    legend.innerHTML = data.map((d) => {
      const pct = (d.value / totalExp * 100).toFixed(1);
      const focused = pieFocus === d.name;
      return `<div class="legend-item" data-cat="${esc(d.name)}" style="${focused ? 'background:#fff6fa' : ''}">
        <span class="lg-dot" style="background:${d.color}"></span>
        <span class="lg-name">${getIcon('expense', d.name)} ${esc(d.name)}</span>
        <span class="lg-pct">${pct}%</span>
        <span class="lg-amt">¥${fmt(d.value)}</span>
      </div>`;
    }).join('');

    legend.querySelectorAll('.legend-item').forEach((el) => el.addEventListener('click', () => {
      pieFocus = el.dataset.cat;
      drillCategory(recs, el.dataset.cat);
    }));
  }

  function drillCategory(recs, cat) {
    const items = recs.filter((r) => r.type === 'expense' && r.cat === cat).sort((a, b) => b.date.localeCompare(a.date));
    const total = items.reduce((a, r) => a + r.amount, 0);
    openSheet(`
      <div class="sheet-title">${getIcon('expense', cat)} ${esc(cat)} · ¥${fmt(total)}</div>
      <div class="bill-card" style="box-shadow:none">
        ${items.map(billItemHtml).join('')}
      </div>
      <div class="sheet-actions"><button class="sheet-btn primary" id="drillClose">关闭</button></div>`);
    $('drillClose').addEventListener('click', () => { pieFocus = null; closeSheet(); renderStats(); });
  }

  function renderTrend() {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = monthKey(d);
      const recs = monthRecords(mk);
      months.push({ label: (d.getMonth() + 1) + '月', expense: sumBy(recs, 'expense'), income: sumBy(recs, 'income') });
    }
    drawTrend($('trendChart'), months);
  }

  /* ===================================================================
     Canvas 图表（手绘，无依赖）
     =================================================================== */
  function setupCanvas(canvas, cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    return ctx;
  }
  function clearCanvas(canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); }

  function drawPie(canvas, data, total) {
    const size = 220;
    const ctx = setupCanvas(canvas, size, size);
    const cx = size / 2, cy = size / 2, R = 100, r = 62;
    let a0 = -Math.PI / 2;
    const gap = data.length > 1 ? 0.03 : 0;
    data.forEach((d) => {
      const frac = d.value / total;
      const a1 = a0 + frac * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0 + gap / 2, a1 - gap / 2);
      ctx.arc(cx, cy, r, a1 - gap / 2, a0 + gap / 2, true);
      ctx.closePath();
      ctx.fillStyle = d.color;
      ctx.fill();
      a0 = a1;
    });
  }

  function drawTrend(canvas, months) {
    const W = canvas.clientWidth || canvas.parentElement.clientWidth || 320;
    const H = 180;
    const ctx = setupCanvas(canvas, W, H);
    const padL = 8, padR = 8, padT = 14, padB = 24;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const max = Math.max(1, ...months.map((m) => Math.max(m.expense, m.income)));
    const n = months.length;
    const slot = plotW / n;
    const barW = Math.min(13, slot / 3);

    months.forEach((m, i) => {
      const cx = padL + slot * i + slot / 2;
      const eH = (m.expense / max) * plotH;
      const iH = (m.income / max) * plotH;
      // 支出
      roundRectBar(ctx, cx - barW - 2, padT + plotH - eH, barW, eH, '#FF6F91');
      // 收入
      roundRectBar(ctx, cx + 2, padT + plotH - iH, barW, iH, '#3DBE8B');
      // 月份标签
      ctx.fillStyle = '#9a8f97';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.label, cx, H - 8);
    });
  }
  function roundRectBar(ctx, x, y, w, h, color) {
    if (h < 1) h = 1;
    const r = Math.min(w / 2, 5);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  /* ===================================================================
     预算页
     =================================================================== */
  function curMonthExpenseByCat() {
    const mk = monthKey(new Date());
    const out = {};
    monthRecords(mk).filter((r) => r.type === 'expense').forEach((r) => { out[r.cat] = (out[r.cat] || 0) + r.amount; });
    return out;
  }
  function curMonthExpenseTotal() {
    const mk = monthKey(new Date());
    return sumBy(monthRecords(mk), 'expense');
  }

  function renderBudget() {
    const total = state.budgets.total;
    const used = curMonthExpenseTotal();
    const ring = $('bhRing');
    if (total) {
      const pct = Math.min(100, Math.round(used / total * 100));
      const realPct = Math.round(used / total * 100);
      const color = realPct >= 100 ? '#FF6F91' : realPct >= 80 ? '#FFB347' : '#FF9EC4';
      ring.style.background = `conic-gradient(${color} ${pct * 3.6}deg, #f1dce6 ${pct * 3.6}deg)`;
      $('bhPct').textContent = realPct + '%';
      $('bhUsed').textContent = '¥' + fmtShort(used);
      $('bhTotal').textContent = '¥' + fmtShort(total);
      $('setTotalBudget').textContent = '修改总预算';
    } else {
      ring.style.background = 'conic-gradient(#f1dce6 0deg, #f1dce6 360deg)';
      $('bhPct').textContent = '—';
      $('bhUsed').textContent = '¥' + fmtShort(used);
      $('bhTotal').textContent = '未设置';
      $('setTotalBudget').textContent = '设置总预算';
    }

    const cats = state.budgets.cats;
    const usedByCat = curMonthExpenseByCat();
    const names = Object.keys(cats);
    const list = $('budgetList');
    if (!names.length) {
      list.innerHTML = emptyState('🎯', '还没有分类预算', '点右上角「+ 添加」给某类花费设上限');
      return;
    }
    list.innerHTML = names.map((name) => {
      const budget = cats[name];
      const u = usedByCat[name] || 0;
      const pct = budget ? u / budget * 100 : 0;
      const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
      const tag = pct >= 100 ? '<span class="bg-tag over">超支</span>' : pct >= 80 ? '<span class="bg-tag warn">接近</span>' : '';
      return `<div class="bg-item">
        <div class="bg-top">
          <span class="bg-name">${getIcon('expense', name)} ${esc(name)}${tag}<span class="x" data-del="${esc(name)}">✕</span></span>
          <span class="bg-val">¥${fmt(u)} / ${fmt(budget)}</span>
        </div>
        <div class="bg-bar"><div class="bg-fill ${cls}" style="width:${Math.min(100, pct)}%"></div></div>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-del]').forEach((x) => x.addEventListener('click', () => {
      delete state.budgets.cats[x.dataset.del]; save(); renderBudget();
    }));
  }

  $('setTotalBudget').addEventListener('click', () => {
    openSheet(`
      <div class="sheet-title">设置本月总预算</div>
      <div class="sheet-field"><label>预算金额（¥）</label>
        <input type="number" id="totalBudgetInput" inputmode="decimal" placeholder="如 5000" value="${state.budgets.total || ''}" />
      </div>
      <div class="sheet-actions">
        <button class="sheet-btn edit" id="tbCancel">取消</button>
        <button class="sheet-btn primary" id="tbSave">保存</button>
      </div>`);
    $('tbCancel').addEventListener('click', closeSheet);
    $('tbSave').addEventListener('click', () => {
      const v = parseFloat($('totalBudgetInput').value);
      state.budgets.total = v > 0 ? v : null;
      save(); closeSheet(); renderBudget(); toast('预算已更新 🎯');
    });
  });

  $('addCatBudget').addEventListener('click', () => {
    const opts = getAllCats('expense').map((c) => `<option value="${esc(c.name)}">${c.icon} ${esc(c.name)}</option>`).join('');
    openSheet(`
      <div class="sheet-title">添加分类预算</div>
      <div class="sheet-field"><label>分类</label><select id="bcCat">${opts}</select></div>
      <div class="sheet-field"><label>预算金额（¥）</label><input type="number" id="bcAmt" inputmode="decimal" placeholder="如 1500" /></div>
      <div class="sheet-actions">
        <button class="sheet-btn edit" id="bcCancel">取消</button>
        <button class="sheet-btn primary" id="bcSave">保存</button>
      </div>`);
    $('bcCancel').addEventListener('click', closeSheet);
    $('bcSave').addEventListener('click', () => {
      const cat = $('bcCat').value; const amt = parseFloat($('bcAmt').value);
      if (!(amt > 0)) { toast('请输入预算金额'); return; }
      state.budgets.cats[cat] = amt; save(); closeSheet(); renderBudget(); toast('已添加预算');
    });
  });

  // 记账后预算提醒（PRD §5.2）
  function checkBudgetAlert(rec) {
    if (rec.type !== 'expense') return;
    if (rec.date.slice(0, 7) !== monthKey(new Date())) return;
    // 分类预算
    const cb = state.budgets.cats[rec.cat];
    if (cb) {
      const used = (curMonthExpenseByCat()[rec.cat] || 0);
      alertByRatio(used / cb, rec.cat);
    }
    // 总预算
    if (state.budgets.total) {
      const used = curMonthExpenseTotal();
      alertByRatio(used / state.budgets.total, '本月总预算');
    }
  }
  function alertByRatio(ratio, label) {
    if (ratio >= 1) setTimeout(() => toast('⚠️ ' + label + ' 已超支！'), 600);
    else if (ratio >= 0.8) setTimeout(() => toast('🟡 ' + label + ' 已用 ' + Math.round(ratio * 100) + '%'), 600);
  }

  /* ===================================================================
     我的页
     =================================================================== */
  function computeStreak() {
    const days = new Set(state.records.map((r) => r.date));
    let streak = 0;
    const d = new Date();
    // 今天没记则从昨天算起
    if (!days.has(todayStr())) d.setDate(d.getDate() - 1);
    while (true) {
      const ds = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      if (days.has(ds)) { streak++; d.setDate(d.getDate() - 1); } else break;
    }
    return streak;
  }

  function renderMe() {
    const session = getSession ? getSession() : null;
    $('meName').textContent = session ? session.username : '记账小主人';
    const count = state.records.length;
    const days = new Set(state.records.map((r) => r.date)).size;
    const streak = computeStreak();
    $('meStreak').textContent = '🔥 连续记账 ' + streak + ' 天';
    $('meCount').textContent = count;
    $('meDays').textContent = days;
    $('meAvg').textContent = days ? (count / days).toFixed(1) : '0';

    const totalBal = sumBy(state.records, 'income') - sumBy(state.records, 'expense');
    const hasBudget = state.budgets.total || Object.keys(state.budgets.cats).length;
    const badges = [
      { ic: '🌱', tx: '初次记账', got: count >= 1 },
      { ic: '📅', tx: '记账7天', got: days >= 7 },
      { ic: '🔥', tx: '连续7天', got: streak >= 7 },
      { ic: '⭐', tx: '满30笔', got: count >= 30 },
      { ic: '💯', tx: '满百笔', got: count >= 100 },
      { ic: '🎯', tx: '设预算', got: !!hasBudget },
      { ic: '🐷', tx: '有结余', got: totalBal > 0 },
      { ic: '🌸', tx: '坚持30天', got: days >= 30 },
    ];
    $('badges').innerHTML = badges.map((b) =>
      `<div class="badge${b.got ? ' got' : ''}"><div class="badge-ic">${b.ic}</div><div class="badge-tx">${b.tx}</div></div>`).join('');

    // 设置项状态
    $('ledgerStatus').textContent = curLedger().icon + ' ' + curLedger().name + ' ›';
    const rem = state.settings.reminder;
    $('reminderStatus').textContent = (rem && rem.enabled ? '每天 ' + rem.time : '未开启') + ' ›';
    $('lockStatus').textContent = (getLock().enabled ? '已开启' : '未开启') + ' ›';
    $('fontSwitch').classList.toggle('on', !!state.settings.largeFont);
  }

  // 导出 CSV
  $('exportCsv').addEventListener('click', () => {
    if (!state.records.length) { toast('还没有数据可导出'); return; }
    const rows = [['日期', '类型', '分类', '金额', '备注']];
    state.records.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((r) => {
      rows.push([r.date, r.type === 'income' ? '收入' : '支出', r.cat, r.amount, (r.note || '').replace(/"/g, '""')]);
    });
    const csv = '﻿' + rows.map((row) => row.map((c) => `"${c}"`).join(',')).join('\r\n');
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), '随手记_' + todayStr() + '.csv');
    toast('已导出 CSV 📤');
  });

  // 备份 JSON
  $('backupJson').addEventListener('click', () => {
    download(new Blob([serialize()], { type: 'application/json' }), '随手记备份_' + todayStr() + '.json');
    toast('已备份 💾');
  });

  // 恢复
  $('restoreJson').addEventListener('click', () => $('restoreFile').click());
  $('restoreFile').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || (!Array.isArray(data.records) && !Array.isArray(data.ledgers))) throw new Error('格式不对');
        state = normalize(data);
        bindLedger();
        document.body.classList.toggle('large-font', !!state.settings.largeFont);
        scheduleReminder();
        save(); renderMe(); toast('恢复成功 ✅ 共 ' + state.records.length + ' 笔');
      } catch (err) { toast('恢复失败：文件无法解析'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // 示例数据
  $('seedDemo').addEventListener('click', () => {
    openSheet(`
      <div class="sheet-title">填充示例数据</div>
      <p style="text-align:center;color:var(--ink-soft);font-size:13px;margin:0 0 18px">将生成近 3 个月约 40 笔随机收支，方便预览各页面效果。</p>
      <div class="sheet-actions">
        <button class="sheet-btn edit" id="seedCancel">取消</button>
        <button class="sheet-btn primary" id="seedOk">生成</button>
      </div>`);
    $('seedCancel').addEventListener('click', closeSheet);
    $('seedOk').addEventListener('click', () => { seedDemo(); closeSheet(); renderMe(); toast('已生成示例数据 🎁'); });
  });

  function seedDemo() {
    const now = new Date();
    const expCats = CATS.expense;
    const notes = ['午饭', '打车', '超市', '奶茶', '电影票', '买衣服', '水电费', '聚餐', '话费', '看病', '', '', ''];
    for (let i = 0; i < 42; i++) {
      const back = Math.floor(Math.random() * 88);
      const d = new Date(now); d.setDate(now.getDate() - back);
      const ds = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      const isInc = Math.random() < 0.12;
      if (isInc) {
        const c = CATS.income[Math.floor(Math.random() * CATS.income.length)];
        state.records.push({ id: uid(), type: 'income', amount: [8000, 8000, 500, 200, 1500][Math.floor(Math.random() * 5)], cat: c.name, date: ds, note: '', ts: d.getTime() });
      } else {
        const c = expCats[Math.floor(Math.random() * expCats.length)];
        const amt = Math.round((Math.random() * 200 + 8) * 100) / 100;
        state.records.push({ id: uid(), type: 'expense', amount: amt, cat: c.name, date: ds, note: notes[Math.floor(Math.random() * notes.length)], ts: d.getTime() });
      }
    }
    if (!state.budgets.total) state.budgets.total = 6000;
    if (!Object.keys(state.budgets.cats).length) { state.budgets.cats = { 餐饮: 1500, 购物: 1000 }; }
    save();
  }

  // 清空
  $('clearAll').addEventListener('click', () => {
    openSheet(`
      <div class="sheet-title">清空所有数据？</div>
      <p style="text-align:center;color:var(--ink-soft);font-size:13px;margin:0 0 18px">此操作不可恢复，建议先「备份数据」。</p>
      <div class="sheet-actions">
        <button class="sheet-btn edit" id="clrCancel">取消</button>
        <button class="sheet-btn del" id="clrOk">确认清空</button>
      </div>`);
    $('clrCancel').addEventListener('click', closeSheet);
    $('clrOk').addEventListener('click', () => {
      state = normalize({}); bindLedger();
      document.body.classList.remove('large-font'); scheduleReminder();
      save(); closeSheet(); renderMe(); toast('已清空');
    });
  });

  /* ---------- 通用 ---------- */
  function emptyState(emoji, tx, sub) {
    return `<div class="empty"><span class="empty-emoji">${emoji}</span><div class="empty-tx">${tx}</div>${sub ? `<div class="empty-sub">${sub}</div>` : ''}</div>`;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
  }

  // 重新计算趋势图尺寸
  window.addEventListener('resize', () => { if ($('view-stats').classList.contains('active')) renderTrend(); });

  /* ===================================================================
     安全锁（PIN）+ 大字体（PRD §4.2.7 / §4.3）
     =================================================================== */
  function getLock() { return (state.settings && state.settings.lock) || { enabled: false, hash: '' }; }
  // 轻量加盐哈希：不以明文存储 PIN（本地隐私门，非强加密）
  function pinHash(pin) {
    let h = 5381; const s = 'sshj☆' + pin + '☆salt';
    for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  const lockEl = $('lockScreen');
  const lockDots = $('lockDots');
  let lockMode = 'verify';   // verify | set | confirm
  let lockBuffer = '';
  let lockFirst = '';
  let lockForced = false;    // true=启动/立即锁定，不可取消

  function showLock(mode, forced) {
    lockMode = mode; lockBuffer = ''; lockFirst = ''; lockForced = !!forced;
    updateLockUI();
    lockEl.hidden = false;
  }
  function hideLock() { lockEl.hidden = true; lockBuffer = ''; lockFirst = ''; }

  function updateLockUI() {
    const titles = {
      verify: ['输入密码', '解锁你的随手记'],
      set: ['设置密码', '输入 4 位数字密码'],
      confirm: ['确认密码', '请再次输入'],
    };
    $('lockTitle').textContent = titles[lockMode][0];
    $('lockSub').textContent = titles[lockMode][1];
    Array.from(lockDots.children).forEach((d, i) => d.classList.toggle('filled', i < lockBuffer.length));
    $('lockForgot').style.display = lockMode === 'verify' ? 'block' : 'none';
    $('lockCancel').style.visibility = (lockMode === 'verify' && lockForced) ? 'hidden' : 'visible';
  }
  function lockShake() { lockDots.classList.add('shake'); setTimeout(() => lockDots.classList.remove('shake'), 420); }

  $('lockKeypad').addEventListener('click', (e) => {
    const btn = e.target.closest('.lk'); if (!btn) return;
    if (btn.id === 'lockCancel') { hideLock(); return; }
    const d = btn.dataset.d;
    if (d === 'back') { lockBuffer = lockBuffer.slice(0, -1); updateLockUI(); return; }
    if (d == null || lockBuffer.length >= 4) return;
    lockBuffer += d; updateLockUI();
    if (lockBuffer.length === 4) setTimeout(lockComplete, 130);
  });

  function lockComplete() {
    if (lockMode === 'verify') {
      if (pinHash(lockBuffer) === getLock().hash) { hideLock(); }
      else { lockShake(); setTimeout(() => { lockBuffer = ''; updateLockUI(); }, 420); }
    } else if (lockMode === 'set') {
      lockFirst = lockBuffer; lockBuffer = ''; lockMode = 'confirm'; updateLockUI();
    } else { // confirm
      if (lockBuffer === lockFirst) {
        state.settings.lock = { enabled: true, hash: pinHash(lockBuffer) };
        save(); hideLock(); renderMe(); toast('安全锁已开启 🔒');
      } else {
        lockMode = 'set'; lockFirst = ''; lockBuffer = ''; updateLockUI(); lockShake(); toast('两次不一致，请重设');
      }
    }
  }

  $('lockForgot').addEventListener('click', () => {
    openSheet(`
      <div class="sheet-title">忘记密码？</div>
      <p style="text-align:center;color:var(--ink-soft);font-size:13px;line-height:1.7;margin:0 0 18px">只能<b>清空所有数据</b>来重置安全锁。<br>若此前备份过，可在恢复后重新设置。</p>
      <div class="sheet-actions">
        <button class="sheet-btn edit" id="fgCancel">取消</button>
        <button class="sheet-btn del" id="fgOk">清空并重置</button>
      </div>`);
    $('fgCancel').addEventListener('click', closeSheet);
    $('fgOk').addEventListener('click', () => {
      state = normalize({}); bindLedger(); scheduleReminder();
      save(); closeSheet(); hideLock(); document.body.classList.remove('large-font'); renderMe(); switchView('add'); toast('已重置');
    });
  });

  // 「我的」设置项
  $('lockSetting').addEventListener('click', () => {
    if (getLock().enabled) {
      openSheet(`
        <div class="sheet-title">🔒 安全锁</div>
        <div class="sheet-actions" style="flex-direction:column;gap:10px">
          <button class="sheet-btn edit" id="lkChange">修改密码</button>
          <button class="sheet-btn edit" id="lkNow">立即锁定</button>
          <button class="sheet-btn del" id="lkOff">关闭安全锁</button>
        </div>`);
      $('lkChange').addEventListener('click', () => { closeSheet(); showLock('set', false); });
      $('lkNow').addEventListener('click', () => { closeSheet(); showLock('verify', true); });
      $('lkOff').addEventListener('click', () => { state.settings.lock = { enabled: false, hash: '' }; save(); closeSheet(); renderMe(); toast('安全锁已关闭'); });
    } else {
      showLock('set', false);
    }
  });

  $('fontSetting').addEventListener('click', () => {
    state.settings.largeFont = !state.settings.largeFont;
    document.body.classList.toggle('large-font', state.settings.largeFont);
    $('fontSwitch').classList.toggle('on', state.settings.largeFont);
    save();
  });

  /* ===================================================================
     多账本（V2.0，纯前端）
     =================================================================== */
  const LEDGER_ICONS = ['💕', '💼', '✈️', '🏠', '🐷', '🎓', '🍼', '🎁', '🌷', '⭐'];

  function openLedgerManager() { renderLedgerSheet(); }
  function renderLedgerSheet() {
    const rows = state.ledgers.map((l) => {
      const cur = l.id === state.currentLedgerId;
      return `<div class="lg-row${cur ? ' cur' : ''}">
        <span class="lg-ic">${l.icon}</span>
        <span class="lg-info"><b>${esc(l.name)}</b><span>${l.records.length} 笔${cur ? ' · 使用中' : ''}</span></span>
        <span class="lg-ops">
          ${cur ? '<span class="lg-flag">✓</span>' : '<button class="lg-op" data-act="switch" data-id="' + l.id + '">切换</button>'}
          <button class="lg-op" data-act="rename" data-id="${l.id}">✏️</button>
          ${state.ledgers.length > 1 ? '<button class="lg-op del" data-act="del" data-id="' + l.id + '">🗑️</button>' : ''}
        </span>
      </div>`;
    }).join('');
    openSheet(`
      <div class="sheet-title">📚 账本管理</div>
      <div class="ledger-list">${rows}</div>
      <div class="sheet-actions"><button class="sheet-btn primary" id="ledgerAdd">＋ 新建账本</button></div>`);
    sheet.querySelectorAll('.lg-op').forEach((b) => b.addEventListener('click', () => ledgerAction(b.dataset.act, b.dataset.id)));
    $('ledgerAdd').addEventListener('click', () => editLedger(null));
  }
  function ledgerAction(act, id) {
    if (act === 'switch') {
      state.currentLedgerId = id; bindLedger(); save();
      billMonth = monthKey(new Date()); billFilter = null;
      closeSheet(); renderMe(); toast('已切换到「' + curLedger().name + '」');
    } else if (act === 'rename') {
      editLedger(state.ledgers.find((l) => l.id === id));
    } else if (act === 'del') {
      const l = state.ledgers.find((x) => x.id === id);
      openSheet(`<div class="sheet-title">删除「${esc(l.name)}」？</div>
        <p style="text-align:center;color:var(--ink-soft);font-size:13px;margin:0 0 18px">该账本的 ${l.records.length} 笔记录会一并删除，不可恢复。</p>
        <div class="sheet-actions"><button class="sheet-btn edit" id="dlCancel">取消</button><button class="sheet-btn del" id="dlOk">删除</button></div>`);
      $('dlCancel').addEventListener('click', renderLedgerSheet);
      $('dlOk').addEventListener('click', () => {
        state.ledgers = state.ledgers.filter((x) => x.id !== id);
        if (state.currentLedgerId === id) state.currentLedgerId = state.ledgers[0].id;
        bindLedger(); save(); renderLedgerSheet(); renderMe(); toast('已删除账本');
      });
    }
  }
  function editLedger(ledger) {
    const editing = !!ledger;
    let icon = editing ? ledger.icon : LEDGER_ICONS[0];
    const icons = LEDGER_ICONS.map((e) => `<button type="button" class="cat emo${(editing ? ledger.icon === e : e === LEDGER_ICONS[0]) ? ' sel' : ''}" data-emo="${e}"><span class="cat-ic">${e}</span></button>`).join('');
    openSheet(`
      <div class="sheet-title">${editing ? '重命名账本' : '新建账本'}</div>
      <div class="sheet-field"><label>账本名称</label><input type="text" id="lgName" maxlength="8" placeholder="如：生活 / 工作 / 旅行" value="${editing ? esc(ledger.name) : ''}" /></div>
      <div class="sheet-field"><label>选择图标</label><div class="sheet-cat-grid">${icons}</div></div>
      <div class="sheet-actions"><button class="sheet-btn edit" id="lgCancel">取消</button><button class="sheet-btn primary" id="lgSave">保存</button></div>`);
    sheet.querySelectorAll('.emo').forEach((b) => b.addEventListener('click', () => { sheet.querySelectorAll('.emo').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); icon = b.dataset.emo; }));
    $('lgCancel').addEventListener('click', renderLedgerSheet);
    $('lgSave').addEventListener('click', () => {
      const name = $('lgName').value.trim();
      if (!name) { toast('给账本起个名字吧'); return; }
      if (editing) { ledger.name = name; ledger.icon = icon; }
      else { const nl = { id: uid(), name, icon, records: [], budgets: { total: null, cats: {} } }; state.ledgers.push(nl); state.currentLedgerId = nl.id; bindLedger(); }
      save(); renderLedgerSheet(); renderMe(); toast(editing ? '已保存' : '已新建并切换 🎉');
    });
  }
  $('ledgerSetting').addEventListener('click', openLedgerManager);

  /* ===================================================================
     分类管理（PRD §4.2.2 完整版）
     =================================================================== */
  let catMgrType = 'expense';
  function openCatManager() { catMgrType = 'expense'; renderCatManager(); }
  function renderCatManager() {
    const list = catList(catMgrType);
    const rows = list.map((c, i) => `
      <div class="cm-row${c.hidden ? ' off' : ''}">
        <span class="cm-ic">${c.icon}</span>
        <span class="cm-name">${esc(c.name)}${c.preset ? '' : '<em>自定义</em>'}</span>
        <span class="cm-ops">
          <button class="cm-op" data-act="up" data-i="${i}"${i === 0 ? ' disabled' : ''}>↑</button>
          <button class="cm-op" data-act="down" data-i="${i}"${i === list.length - 1 ? ' disabled' : ''}>↓</button>
          <button class="cm-op" data-act="hide" data-i="${i}">${c.hidden ? '🙈' : '👁️'}</button>
          <button class="cm-op" data-act="edit" data-i="${i}">✏️</button>
          ${c.preset ? '' : '<button class="cm-op del" data-act="del" data-i="' + i + '">🗑️</button>'}
        </span>
      </div>`).join('');
    openSheet(`
      <div class="sheet-title">🗂️ 分类管理</div>
      <div class="view-seg wide" id="cmSeg" style="margin-bottom:14px">
        <button class="vseg-btn${catMgrType === 'expense' ? ' active' : ''}" data-t="expense">支出</button>
        <button class="vseg-btn${catMgrType === 'income' ? ' active' : ''}" data-t="income">收入</button>
      </div>
      <div class="cm-list">${rows}</div>
      <div class="sheet-actions"><button class="sheet-btn primary" id="cmAdd">＋ 新增分类</button></div>`);
    sheet.querySelectorAll('#cmSeg .vseg-btn').forEach((b) => b.addEventListener('click', () => { catMgrType = b.dataset.t; renderCatManager(); }));
    sheet.querySelectorAll('.cm-op').forEach((b) => { if (!b.disabled) b.addEventListener('click', () => catAction(b.dataset.act, +b.dataset.i)); });
    $('cmAdd').addEventListener('click', () => editCategory(-1));
  }
  function afterCatChange() { save(); renderCatManager(); if ($('view-add').classList.contains('active')) renderCatGrid(); }
  function catAction(act, i) {
    const list = state.categories[catMgrType];
    const c = list[i];
    if (act === 'up' && i > 0) { list.splice(i - 1, 0, list.splice(i, 1)[0]); afterCatChange(); }
    else if (act === 'down' && i < list.length - 1) { list.splice(i + 1, 0, list.splice(i, 1)[0]); afterCatChange(); }
    else if (act === 'hide') { c.hidden = !c.hidden; afterCatChange(); }
    else if (act === 'edit') { editCategory(i); }
    else if (act === 'del') {
      openSheet(`<div class="sheet-title">删除「${esc(c.name)}」？</div>
        <p style="text-align:center;color:var(--ink-soft);font-size:13px;margin:0 0 18px">该分类下的历史记录将归入「其他」。</p>
        <div class="sheet-actions"><button class="sheet-btn edit" id="cdCancel">取消</button><button class="sheet-btn del" id="cdOk">删除</button></div>`);
      $('cdCancel').addEventListener('click', renderCatManager);
      $('cdOk').addEventListener('click', () => {
        reassignCat(catMgrType, c.name, '其他');
        state.categories[catMgrType] = list.filter((x) => x !== c);
        afterCatChange(); toast('已删除，历史归入「其他」');
      });
    }
  }
  function editCategory(i) {
    const adding = i < 0;
    const c = adding ? null : state.categories[catMgrType][i];
    let icon = adding ? EMOJI_POOL[0] : c.icon;
    const icons = EMOJI_POOL.map((e) => `<button type="button" class="cat emo${(adding ? e === EMOJI_POOL[0] : c.icon === e) ? ' sel' : ''}" data-emo="${e}"><span class="cat-ic">${e}</span></button>`).join('');
    openSheet(`
      <div class="sheet-title">${adding ? '新增' : '编辑'}${catMgrType === 'income' ? '收入' : '支出'}分类</div>
      <div class="sheet-field"><label>名称</label><input type="text" id="cmName" maxlength="6" value="${adding ? '' : esc(c.name)}" placeholder="如：宠物、健身…" /></div>
      <div class="sheet-field"><label>图标</label><div class="sheet-cat-grid">${icons}</div></div>
      <div class="sheet-actions"><button class="sheet-btn edit" id="cmCancel">取消</button><button class="sheet-btn primary" id="cmSave">保存</button></div>`);
    sheet.querySelectorAll('.emo').forEach((b) => b.addEventListener('click', () => { sheet.querySelectorAll('.emo').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); icon = b.dataset.emo; }));
    $('cmCancel').addEventListener('click', renderCatManager);
    $('cmSave').addEventListener('click', () => {
      const name = $('cmName').value.trim();
      if (!name) { toast('请输入名称'); return; }
      if (state.categories[catMgrType].some((x, idx) => x.name === name && idx !== i)) { toast('已有同名分类'); return; }
      if (adding) { state.categories[catMgrType].push({ name, icon }); }
      else { if (c.name !== name) reassignCat(catMgrType, c.name, name); c.name = name; c.icon = icon; }
      afterCatChange(); toast('已保存 🌸');
    });
  }
  // 跨所有账本把某分类的记录/预算迁移到新分类（删除时 newName='其他'）
  function reassignCat(type, oldName, newName) {
    state.ledgers.forEach((l) => {
      l.records.forEach((r) => { if (r.type === type && r.cat === oldName) r.cat = newName; });
      if (type === 'expense' && l.budgets.cats[oldName] != null) {
        l.budgets.cats[newName] = (l.budgets.cats[newName] || 0) + l.budgets.cats[oldName];
        delete l.budgets.cats[oldName];
      }
    });
  }
  $('catSetting').addEventListener('click', openCatManager);

  /* ===================================================================
     每日记账提醒（PRD §4.2.6，Web Notification）
     =================================================================== */
  let reminderTimer = null;
  function scheduleReminder() {
    if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
    const rem = state.settings.reminder;
    if (!rem || !rem.enabled) return;
    const [hh, mm] = (rem.time || '21:00').split(':').map(Number);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    reminderTimer = setTimeout(() => { fireReminder(); scheduleReminder(); }, Math.min(next - now, 2147483647));
  }
  function fireReminder() {
    const today = todayStr();
    if (state.ledgers.some((l) => l.records.some((r) => r.date === today))) return; // 今天记过了就不打扰
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('随手记 · 记账提醒', { body: '今天还没记账哦，花 10 秒记一笔吧 🌷', icon: 'icon-192.png' }); }
      catch (e) { toast('⏰ 该记账啦，花 10 秒记一笔吧 🌷'); }
    } else { toast('⏰ 该记账啦，花 10 秒记一笔吧 🌷'); }
  }
  $('reminderSetting').addEventListener('click', () => {
    const rem = state.settings.reminder || { enabled: false, time: '21:00' };
    const supported = 'Notification' in window;
    openSheet(`
      <div class="sheet-title">⏰ 每日记账提醒</div>
      <div class="sheet-field"><label>提醒时间</label><input type="time" id="remTime" value="${rem.time || '21:00'}" /></div>
      ${supported ? '' : '<p style="color:var(--ink-soft);font-size:12px;margin:-6px 0 12px">当前浏览器不支持系统通知，将以应用内提示代替。</p>'}
      <p style="color:var(--ink-faint);font-size:11.5px;line-height:1.6;margin:0 0 14px">提醒在应用打开或后台运行时触发；网页完全关闭时，Web 端无法像原生 App 那样后台推送。</p>
      <div class="sheet-actions">
        ${rem.enabled ? '<button class="sheet-btn del" id="remOff">关闭提醒</button>' : ''}
        <button class="sheet-btn primary" id="remOn">${rem.enabled ? '保存' : '开启提醒'}</button>
      </div>`);
    $('remOn').addEventListener('click', async () => {
      const time = $('remTime').value || '21:00';
      if (supported && Notification.permission !== 'granted') { try { await Notification.requestPermission(); } catch (e) { /* ignore */ } }
      state.settings.reminder = { enabled: true, time };
      save(); scheduleReminder(); closeSheet(); renderMe(); toast('已开启每日提醒 ⏰');
    });
    const off = $('remOff');
    if (off) off.addEventListener('click', () => {
      state.settings.reminder = { enabled: false, time: rem.time || '21:00' };
      save(); scheduleReminder(); closeSheet(); renderMe(); toast('已关闭提醒');
    });
  });

  /* ===================================================================
     导出 Excel（.xlsx）—— 浏览器端零依赖 ZIP + 最小 OOXML
     =================================================================== */
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function concatBytes(arrs) { let len = 0; arrs.forEach((a) => (len += a.length)); const out = new Uint8Array(len); let o = 0; arrs.forEach((a) => { out.set(a, o); o += a.length; }); return out; }
  function u16(n) { return new Uint8Array([n & 255, (n >> 8) & 255]); }
  function u32(n) { return new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]); }
  function zipStore(files) { // 仅用「存储」方式（无压缩），数据量小足够
    const enc = new TextEncoder();
    const local = []; const central = []; let offset = 0;
    files.forEach((f) => {
      const nameB = enc.encode(f.name); const data = f.data; const crc = crc32(data);
      const h = concatBytes([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameB.length), u16(0)]);
      local.push(h, nameB, data);
      central.push({ nameB, crc, size: data.length, offset });
      offset += h.length + nameB.length + data.length;
    });
    const cdStart = offset; const cd = [];
    central.forEach((c) => {
      const h = concatBytes([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(c.crc), u32(c.size), u32(c.size), u16(c.nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset)]);
      cd.push(h, c.nameB); offset += h.length + c.nameB.length;
    });
    const eocd = concatBytes([u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(offset - cdStart), u32(cdStart), u16(0)]);
    return new Blob(local.concat(cd, [eocd]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function xmlEsc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function colLetter(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function sheetXml(rows) {
    let body = '';
    rows.forEach((row, ri) => {
      let cells = '';
      row.forEach((val, ci) => {
        const ref = colLetter(ci) + (ri + 1);
        if (typeof val === 'number' && isFinite(val)) cells += `<c r="${ref}"><v>${val}</v></c>`;
        else cells += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;
      });
      body += `<row r="${ri + 1}">${cells}</row>`;
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
  }
  function makeXlsx(sheets) {
    const enc = new TextEncoder(); const files = [];
    const overrides = sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    files.push({ name: '[Content_Types].xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`) });
    files.push({ name: '_rels/.rels', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) });
    const sheetTags = sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
    files.push({ name: 'xl/workbook.xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`) });
    const rels = sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`) });
    sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s.rows)) }));
    return zipStore(files);
  }
  function exportExcel() {
    const recs = state.records;
    if (!recs.length) { toast('还没有数据可导出'); return; }
    const detail = [['日期', '类型', '分类', '金额', '备注']];
    recs.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((r) => detail.push([r.date, r.type === 'income' ? '收入' : '支出', r.cat, r.amount, r.note || '']));
    const byCat = {}; recs.filter((r) => r.type === 'expense').forEach((r) => { byCat[r.cat] = (byCat[r.cat] || 0) + r.amount; });
    const summary = [['分类', '支出合计']];
    Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).forEach((k) => summary.push([k, Math.round(byCat[k] * 100) / 100]));
    download(makeXlsx([{ name: '明细', rows: detail }, { name: '分类汇总', rows: summary }]), '随手记_' + curLedger().name + '_' + todayStr() + '.xlsx');
    toast('已导出 Excel 📊');
  }
  $('exportExcel').addEventListener('click', exportExcel);

  /* ===================================================================
     账号体系（PRD §4.2.8 / V1.0.1）
     纯前端模拟：用户表存 localStorage[ACCOUNTS_KEY]，
     会话凭证存 localStorage[SESSION_KEY]（记住我=30天，否则 sessionStorage）
     数据按账号隔离：STORE_KEY = STORE_KEY_BASE + '_user_' + userId
     =================================================================== */

  function getAccounts() {
    try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveAccounts(acc) { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(acc)); }

  function getSession() {
    try {
      const s = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      if (!s) return null;
      const obj = JSON.parse(s);
      if (obj.expires && Date.now() > obj.expires) {
        localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return obj;
    } catch (e) { return null; }
  }
  function saveSession(username, userId, remember) {
    const obj = { username, userId, expires: remember ? Date.now() + 30 * 86400 * 1000 : null };
    const s = JSON.stringify(obj);
    if (remember) { localStorage.setItem(SESSION_KEY, s); sessionStorage.removeItem(SESSION_KEY); }
    else { sessionStorage.setItem(SESSION_KEY, s); localStorage.removeItem(SESSION_KEY); }
  }
  function clearSession() {
    localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY);
  }

  // 轻量密码哈希（加盐，仅用于本地隐私保护）
  function pwHash(username, password) {
    let h = 5381; const s = 'sshj♡' + username.toLowerCase() + '|' + password + '♡pw';
    for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  // 用户名规则：4-20位 字母/数字/下划线，以字母或数字开头
  function validUsername(u) { return /^[A-Za-z0-9][A-Za-z0-9_]{3,19}$/.test(u); }
  // 密码规则：6-20位，含字母与数字，无空格
  function validPassword(p) { return p.length >= 6 && p.length <= 20 && /[A-Za-z]/.test(p) && /[0-9]/.test(p) && !/\s/.test(p); }

  /* ---------- 认证 UI ---------- */
  const authScreen = $('authScreen');

  function showAuth() { authScreen.hidden = false; }
  function hideAuth() { authScreen.hidden = true; }

  // Tab 切换
  $('authTabLogin').addEventListener('click', () => {
    $('authTabLogin').classList.add('active'); $('authTabRegister').classList.remove('active');
    $('loginForm').hidden = false; $('registerForm').hidden = true;
  });
  $('authTabRegister').addEventListener('click', () => {
    $('authTabRegister').classList.add('active'); $('authTabLogin').classList.remove('active');
    $('registerForm').hidden = false; $('loginForm').hidden = true;
  });

  // 密码可见切换
  function togglePw(inputId, btn) {
    const inp = $(inputId);
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    btn.textContent = show ? '🙈' : '👁️';
  }
  $('loginEye').addEventListener('click', () => togglePw('loginPass', $('loginEye')));
  $('regEye').addEventListener('click', () => togglePw('regPass', $('regEye')));

  // 登录提交
  $('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = $('loginUser').value.trim();
    const password = $('loginPass').value;
    const remember = $('loginRemember').checked;
    let ok = true;
    $('loginUserErr').textContent = '';
    $('loginPassErr').textContent = '';
    if (!username) { $('loginUserErr').textContent = '请输入用户名'; $('loginUser').classList.add('invalid'); ok = false; }
    else $('loginUser').classList.remove('invalid');
    if (!password) { $('loginPassErr').textContent = '请输入密码'; $('loginPass').classList.add('invalid'); ok = false; }
    else $('loginPass').classList.remove('invalid');
    if (!ok) return;

    const accounts = getAccounts();
    const key = username.toLowerCase();
    const acct = accounts[key];
    if (!acct || acct.hash !== pwHash(username, password)) {
      $('loginPassErr').textContent = '用户名或密码错误';
      $('loginPass').classList.add('invalid');
      return;
    }
    $('loginPass').classList.remove('invalid');
    saveSession(acct.username, acct.userId, remember);
    hideAuth();
    appInit();
  });

  // 注册提交
  $('registerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = $('regUser').value.trim();
    const password = $('regPass').value;
    const confirm  = $('regPassConfirm').value;
    let ok = true;
    $('regUserErr').textContent = '';
    $('regPassErr').textContent = '';
    $('regConfirmErr').textContent = '';
    [$('regUser'), $('regPass'), $('regPassConfirm')].forEach((el) => el.classList.remove('invalid'));

    if (!validUsername(username)) {
      $('regUserErr').textContent = '用户名格式不符（4–20 位字母/数字/下划线，以字母或数字开头）';
      $('regUser').classList.add('invalid'); ok = false;
    } else {
      const accounts = getAccounts();
      if (accounts[username.toLowerCase()]) {
        $('regUserErr').textContent = '该用户名已被注册';
        $('regUser').classList.add('invalid'); ok = false;
      }
    }
    if (!validPassword(password)) {
      $('regPassErr').textContent = '密码需 6–20 位，且同时包含字母与数字';
      $('regPass').classList.add('invalid'); ok = false;
    }
    if (password !== confirm) {
      $('regConfirmErr').textContent = '两次输入的密码不一致';
      $('regPassConfirm').classList.add('invalid'); ok = false;
    }
    if (!ok) return;

    const userId = 'u_' + Date.now().toString(36);
    const accounts = getAccounts();
    accounts[username.toLowerCase()] = { username, userId, hash: pwHash(username, password) };
    saveAccounts(accounts);
    saveSession(username, userId, true);
    hideAuth();
    appInit();
  });

  /* ---------- 退出登录 ---------- */
  $('logoutItem').addEventListener('click', () => {
    openSheet(`
      <div class="sheet-title">退出登录？</div>
      <p style="text-align:center;color:var(--ink-soft);font-size:13px;margin:0 0 18px">退出后本地数据仍保留，再次登录即可看到。</p>
      <div class="sheet-actions">
        <button class="sheet-btn edit" id="logoutCancel">取消</button>
        <button class="sheet-btn del" id="logoutOk">确认退出</button>
      </div>`);
    $('logoutCancel').addEventListener('click', closeSheet);
    $('logoutOk').addEventListener('click', () => {
      clearSession();
      closeSheet();
      // 重置运行时状态
      state = null; STORE_KEY = STORE_KEY_BASE;
      showAuth();
    });
  });

  /* ===================================================================
     初始化（在账号确认后调用）
     =================================================================== */
  function appInit() {
    const session = getSession();
    STORE_KEY = session ? STORE_KEY_BASE + '_user_' + session.userId : STORE_KEY_BASE;
    state = loadState();
    bindLedger();

    // 重置视图状态（多次 appInit 时清干净）
    addState.type = 'expense'; addState.cat = null; addState.amountStr = '0';
    addState.date = todayStr(); addState.note = ''; addState.editingId = null;
    billMonth = monthKey(new Date()); billRange = 'day'; billFilter = null;
    statPeriod = 'month'; pieFocus = null;
    $('noteInput').value = ''; $('dateInput').value = addState.date;

    setType('expense');
    updateAmount();
    $('dateLabel').textContent = '今天';
    if (state.settings.largeFont) document.body.classList.add('large-font');
    switchView('add');

    if (getLock().enabled) showLock('verify', true);
    scheduleReminder();
  }

  /* ===================================================================
     入口：检查会话，有则直接进应用，否则显示认证屏
     =================================================================== */
  function initAuth() {
    if (getSession()) {
      hideAuth();
      appInit();
    } else {
      showAuth();
    }
  }
  initAuth();

  /* ===================================================================
     PWA：Service Worker 离线缓存 + 「添加到主屏」
     =================================================================== */
  // 注册 Service Worker（需 https 或 localhost；file:// 下自动跳过）
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW 注册失败', e));
    });
  }

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const installItem = $('installApp');
  let deferredPrompt = null;

  // 非独立运行时，展示「添加到主屏」入口
  if (installItem && !isStandalone) installItem.hidden = false;

  // Android / 桌面 Chrome：拦截系统安装提示
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installItem) installItem.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (installItem) installItem.hidden = true;
    toast('已添加到主屏 🎉');
  });

  if (installItem) installItem.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') toast('正在添加… 🎉');
      deferredPrompt = null;
      return;
    }
    // iOS Safari / 其它浏览器：给出手动添加指引
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    openSheet(`
      <div class="sheet-title">📲 添加到主屏</div>
      <p style="color:var(--ink-soft);font-size:13.5px;line-height:1.9;margin:0 0 16px">
        ${ios
        ? '1. 点击 Safari 底部的 <b>分享</b> 按钮 <span style="font-size:16px">⬆️</span><br>2. 在列表中选择 <b>「添加到主屏幕」</b><br>3. 点右上角 <b>「添加」</b>，即可像 App 一样从桌面打开 🌸'
        : '在浏览器菜单中选择 <b>「安装应用 / 添加到主屏幕」</b>，即可获得近似 App 的启动体验 🌸'}
      </p>
      <div class="sheet-actions"><button class="sheet-btn primary" id="installClose">知道啦</button></div>`);
    $('installClose').addEventListener('click', closeSheet);
  });
})();
