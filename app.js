const REMEMBER_LOGIN_KEY = 'ads_hisab_remember_login_v72';
const SESSION_ACC_KEY = 'ads_hisab_session_v75';
const LANG_KEY = 'ads_hisab_lang_v72';
const MASTER_DB_KEY = 'ads_hisab_user_data_v72_legacy-super-admin';
const ACCOUNTSKEY = 'ads_hisab_local_accounts_v72';
const NEXTUSERIDKEY = 'ads_hisab_next_user_id_v72';
const THEME_KEY = 'ads_hisab_theme_v72';
const PASSKEY = 'ads_hisab_superadmin_password_v72';
const LAST_BACKUP_KEY = 'ads_hisab_last_backup_v72';
const HELP_REQUESTS_KEY = 'ads_hisab_help_requests_v72';
const CLOUD_SYNC_KEY = 'ads_hisab_cloud_sync_v72';
const SUPERADMIN_META_KEY = 'ads_hisab_superadmin_meta_v72';
const LOCAL_DIRTY_KEY = 'ads_hisab_local_dirty_v73';
const LAST_CLOUD_TS_KEY = 'ads_hisab_last_cloud_ts_v73';
const DEFAULT_CLOUD_URL = 'https://ads-managerbd-default-rtdb.firebaseio.com/';
const DEFAULT_WALLETS = ['bKash', 'Nagad', 'Rocket', 'Bank', 'Cash', 'Card'];

let KEY = MASTER_DB_KEY;
let PROFILEKEY = 'ads_hisab_user_profile_v72_legacy-super-admin';
let activeAccount = null;
let realSuperAdmin = null;
let pendingProfilePicData = '';
let pendingAgLogoData = '';
let pendingAgQrData = '';
let deferredInstallPrompt = null;

const PAGE_SIZE = 25;
let custPage = 1, workPage = 1, payPage = 1;
const selectedWorkIds = new Set();

const $ = id => document.getElementById(id);
const today = () => { const d = new Date(), z = d.getTimezoneOffset(); return new Date(d.getTime() - z * 60000).toISOString().slice(0, 10); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = x => Number(x) || 0;
const money = x => '৳' + num(x).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = x => '$' + num(x).toFixed(2);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byDateDesc = (a, b) => String(b?.date || '').localeCompare(String(a?.date || ''));
const isStaff = () => !realSuperAdmin && activeAccount?.role === 'staff';
const isSuperAdmin = () => Boolean(realSuperAdmin) || activeAccount?.id === 'legacy-super-admin' || activeAccount?.role === 'super_admin';

// Global Form Reload Guard
document.addEventListener('submit', e => {
  if (e.target && e.target.tagName === 'FORM') e.preventDefault();
});

function encodeRemember(obj) { try { return 'obf_' + btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); } catch (e) { return ''; } }
function decodeRemember(str) {
  if (!str) return null;
  try { return str.startsWith('obf_') ? JSON.parse(decodeURIComponent(escape(atob(str.slice(4))))) : JSON.parse(str); } catch (e) { return null; }
}
function hashPass(str) {
  const s = String(str || ''); let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) { h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 0x01000193); h2 ^= s.charCodeAt(i) + i; h2 = Math.imul(h2, 0x85ebca6b); }
  return 'h1_' + (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
function checkPass(input, stored) {
  if (!stored) return false;
  return String(stored).startsWith('h1_') ? hashPass(input) === stored : input === stored;
}

function hasPerm(perm) {
  if (realSuperAdmin) return true;
  if (!activeAccount) return false;
  if (activeAccount.role !== 'staff') return true;
  const p = { canDelete: false, canEdit: true, canPayments: true, canExpenses: true, ...(activeAccount.perms || {}) };
  return Boolean(p[perm]);
}
function applyPermissionClasses() {
  document.body.classList.toggle('role-staff', isStaff());
  document.body.classList.toggle('role-superadmin', isSuperAdmin());
  document.body.classList.toggle('no-perm-del', !hasPerm('canDelete'));
  document.body.classList.toggle('no-perm-edit', !hasPerm('canEdit'));
  document.body.classList.toggle('no-perm-pay', !hasPerm('canPayments'));
  document.body.classList.toggle('no-perm-exp', !hasPerm('canExpenses'));
}

async function withBtnLoading(btn, label, fn) {
  if (!btn) return await fn();
  const orig = btn.innerHTML; btn.disabled = true; btn.textContent = label || 'অপেক্ষা করুন...';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = orig; }
}

window.copyText = function(txt, label) {
  if (!txt) return;
  const done = () => toast((label || 'তথ্য') + ' কপি হয়েছে!');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
  else fallbackCopy(txt, done);
};
function fallbackCopy(txt, done) {
  const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) {} ta.remove();
}

window.matchBudgetDollar = function() {
  if ($('wActualDollar') && $('wDollar')) { $('wActualDollar').value = $('wDollar').value || 0; updateWorkPreview(); }
};

const DEFAULT_WA_TEMPLATE = 'আসসালামু আলাইকুম {name}, {agency} থেকে জানাচ্ছি—আপনার বিজ্ঞাপনের মোট বিল {bill}, জমা {paid}, এবং বকেয়া রয়েছে {due}। অনুগ্রহ করে বকেয়া পরিশোধ করার জন্য অনুরোধ রইল। {payinfo} ধন্যবাদ!';

const blank = () => ({
  updatedAt: 0, deletedIds: {}, wallets: [...DEFAULT_WALLETS],
  rates: [], customers: [], pages: [], works: [], payments: [],
  cardDeposits: [], cardTransfers: [], cardRefunds: [],
  adAccounts: [], cashAdjustments: [],
  cards: [], expenses: [], trash: [], reminderLogs: {}, activityLogs: [],
  agency: { name: 'Ads হিসাব ম্যানেজার', tagline: 'Smart · Secure · Pro v75', phone: '', defaultRate: 125, defaultFeePct: 0, monthlyGoal: 100000, logoUrl: '', qrUrl: '', signText: '', termsText: '', payInfo: '', metaToken: '', waTemplate: DEFAULT_WA_TEMPLATE }
});

let db = blank();
function normalizeDb(raw) {
  const b = blank(), parsed = (raw && typeof raw === 'object') ? raw : {};
  const wallets = Array.isArray(parsed.wallets) && parsed.wallets.length ? [...new Set(parsed.wallets.map(x => String(x).trim()).filter(Boolean))] : [...DEFAULT_WALLETS];
  return {
    updatedAt: num(parsed.updatedAt),
    deletedIds: (parsed.deletedIds && typeof parsed.deletedIds === 'object') ? parsed.deletedIds : {},
    wallets,
    rates: Array.isArray(parsed.rates) ? parsed.rates : [],
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    pages: Array.isArray(parsed.pages) ? parsed.pages : [],
    works: Array.isArray(parsed.works) ? parsed.works : [],
    payments: Array.isArray(parsed.payments) ? parsed.payments : [],
    cardDeposits: Array.isArray(parsed.cardDeposits) ? parsed.cardDeposits : [],
    cardTransfers: Array.isArray(parsed.cardTransfers) ? parsed.cardTransfers : [],
    cardRefunds: Array.isArray(parsed.cardRefunds) ? parsed.cardRefunds : [],
    adAccounts: Array.isArray(parsed.adAccounts) ? parsed.adAccounts : [],
    cashAdjustments: Array.isArray(parsed.cashAdjustments) ? parsed.cashAdjustments : [],
    cards: Array.isArray(parsed.cards) ? parsed.cards : [],
    expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
    trash: Array.isArray(parsed.trash) ? parsed.trash : [],
    reminderLogs: (parsed.reminderLogs && typeof parsed.reminderLogs === 'object') ? parsed.reminderLogs : {},
    activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : [],
    agency: { ...b.agency, ...(parsed.agency && typeof parsed.agency === 'object' ? parsed.agency : {}) }
  };
}

function loadDb() { try { db = normalizeDb(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { db = blank(); } }
loadDb();

function markDeleted(id) {
  if (!id) return;
  db.deletedIds[id] = Date.now();
  const cutoff = Date.now() - 45 * 86400000;
  Object.keys(db.deletedIds).forEach(k => { if (db.deletedIds[k] < cutoff) delete db.deletedIds[k]; });
}

function toast(msg, type = 'success') {
  const host = $('toastContainer'); if (!host) return;
  const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 260); }, 3200);
}

function closeModal(id) { if ($(id)) $(id).style.display = 'none'; }
document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; }));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && activeAccount) { e.preventDefault(); openQuickSearch(); }
});

function logActivity(text) {
  const time = new Date().toLocaleString('bn-BD'), actor = activeAccount?.name ? `[${activeAccount.name}] ` : '';
  db.activityLogs.unshift({ time, text: actor + text });
  if (db.activityLogs.length > 150) db.activityLogs.pop();
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
}

// Calculations
const cname = id => db.customers.find(x => x.id === id)?.name || 'কাস্টমার নেই';
const pname = id => db.pages.find(x => x.id === id)?.name || '';
const pageCustomer = id => db.pages.find(x => x.id === id)?.customerId || '';
const baseBill = w => num(w.actualDollar) * num(w.rate);
const workServiceCharge = w => { const f = num(w.serviceFee); return !f ? 0 : (w.serviceFeeType === 'pct' ? baseBill(w) * (f / 100) : f); };
const bill = w => baseBill(w) + workServiceCharge(w);
const baseActual = w => num(w.actualDollar) * num(w.actualRate);
const feeCost = w => baseActual(w) * (num(w.feePct) / 100);
const actual = w => baseActual(w) + feeCost(w);
const profit = w => bill(w) - actual(w) - num(w.other);
const workCommission = w => num(w.commPct) > 0 ? Math.max(0, profit(w)) * (num(w.commPct) / 100) : 0;
const paid = id => db.payments.filter(p => p.customerId === id).reduce((s, p) => s + num(p.amount), 0);
const billed = id => db.works.filter(w => w.customerId === id).reduce((s, w) => s + bill(w), 0);
const clientBalance = id => paid(id) - billed(id);

function rateFor(date) {
  const found = db.rates.filter(r => r.date <= date).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0]?.value;
  return found || num(db.agency?.defaultRate) || 0;
}

function getCardStats(cardId) {
  if (!cardId) return { inUsd: 0, inTk: 0, avgRate: 0, outUsd: 0, balance: 0 };
  const deps = db.cardDeposits.filter(d => d.cardId === cardId), trIn = db.cardTransfers.filter(t => t.toCardId === cardId), trOut = db.cardTransfers.filter(t => t.fromCardId === cardId), refs = db.cardRefunds.filter(r => r.cardId === cardId);
  const worksSpent = db.works.filter(w => (w.cardId || '') === cardId).reduce((s, w) => s + num(w.actualDollar), 0);
  const depUsd = deps.reduce((s, d) => s + num(d.amount), 0), depTk = deps.reduce((s, d) => s + num(d.taka), 0);
  const trInUsd = trIn.reduce((s, t) => s + num(t.amount), 0), trInTk = trIn.reduce((s, t) => s + num(t.takaValue), 0);
  const refUsd = refs.reduce((s, r) => s + num(r.amount), 0), trOutUsd = trOut.reduce((s, t) => s + num(t.amount), 0);
  const inUsd = depUsd + trInUsd + refUsd, inTk = depTk + trInTk, baseUsd = depUsd + trInUsd;
  return { inUsd, inTk, avgRate: baseUsd > 0 ? +(inTk / baseUsd).toFixed(2) : 0, outUsd: worksSpent + trOutUsd, balance: inUsd - (worksSpent + trOutUsd) };
}
function cardAvgRate(cardId) { return getCardStats(cardId).avgRate; }
function cardSpent(cardId) { return getCardStats(cardId).outUsd; }

function getWalletBalances() {
  const bal = {};
  (db.wallets || DEFAULT_WALLETS).forEach(w => { bal[w] = 0; });
  const ensure = k => { const key = k || 'Cash'; if (!Object.prototype.hasOwnProperty.call(bal, key)) bal[key] = 0; return key; };
  db.payments.forEach(p => { bal[ensure(p.method)] += num(p.amount) - num(p.fee); });
  db.expenses.forEach(ex => { bal[ensure(ex.method)] -= num(ex.amount); });
  db.cardDeposits.forEach(d => { bal[ensure(d.method || 'Bank')] -= num(d.taka); });
  db.cashAdjustments.forEach(a => { bal[ensure(a.method)] += a.type === 'out' ? -num(a.amount) : num(a.amount); });
  return bal;
}

// Storage Health Meter (~5MB estimate)
function updateStorageMeter() {
  let bytes = 0;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); bytes += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (e) {}
  const maxBytes = 5 * 1024 * 1024, pct = Math.min(100, Math.round((bytes / maxBytes) * 100));
  const kbStr = bytes > 1048576 ? (bytes / 1048576).toFixed(2) + ' MB' : Math.round(bytes / 1024) + ' KB';
  const col = pct >= 85 ? '#dc2626' : (pct >= 60 ? '#f59e0b' : '#10b981');
  [['setStorageText', 'setStorageBar'], ['storageMeterText', 'storageMeterBar']].forEach(([tId, bId]) => {
    if ($(tId)) $(tId).textContent = `${kbStr} / 5 MB (${pct}%)`;
    if ($(bId)) { $(bId).style.width = `${pct}%`; $(bId).style.background = col; }
  });
}

// Sync Status & Auto Cloud Sync
function setSyncUi(state, label) {
  const el = $('syncStatusBtn'); if (!el) return;
  el.className = 'sync-pill ' + (state || '');
  const icon = state === 'ok' ? '🟢' : (state === 'busy' ? '🟡' : (state === 'err' ? '🔴' : '⚪'));
  el.innerHTML = `${icon} <span class="sync-txt">${esc(label || 'Local')}</span>`;
}

let autoSyncTimer = null;
function triggerAccountCloudSync() {
  const syncCfg = readCloudSync();
  if (syncCfg.autoSync && syncCfg.url) {
    localStorage.setItem(LOCAL_DIRTY_KEY, '1');
    if (!navigator.onLine) setSyncUi('err', 'Offline (Pending)');
    else {
      setSyncUi('busy', 'Syncing...');
      clearTimeout(autoSyncTimer);
      autoSyncTimer = setTimeout(() => pushToCloud(true), 1200);
    }
  } else setSyncUi('', 'Local');
  updateStorageMeter();
}

function save() {
  db.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('ব্রাউজার স্টোরেজ পূর্ণ! দয়া করে ব্যাকআপ নিয়ে পুরোনো ডেটা ক্লিয়ার করুন।', 'error'); }
  triggerAccountCloudSync();
  render();
}

if ($('syncStatusBtn')) $('syncStatusBtn').onclick = () => {
  const cfg = readCloudSync();
  if (!cfg.url) { goToSection('adminPanel'); switchAdminSubTab('cloud'); return toast('ক্লাউড সিঙ্ক সেটআপ করতে Firebase URL দিন', 'warn'); }
  if (!navigator.onLine) return toast('ইন্টারনেট সংযোগ নেই!', 'error');
  pushToCloud(false);
};
window.addEventListener('online', () => {
  const cfg = readCloudSync();
  if (cfg.url && (localStorage.getItem(LOCAL_DIRTY_KEY) === '1' || cfg.autoSync)) { setSyncUi('busy', 'Reconnecting...'); pushToCloud(true); }
});
window.addEventListener('offline', () => { if (readCloudSync().url) setSyncUi('err', 'Offline'); });

function defaultAvatarUrl(name) {
  const initials = String(name || 'U').trim().slice(0, 2).toUpperCase();
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#3157e8"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Arial,sans-serif" font-size="38" font-weight="bold">${initials}</text></svg>`);
}

function compressImageFile(file, maxSize = 240, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = reject;
    reader.onload = e => {
      const img = new Image(); img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas'); let w = img.width, h = img.height;
        if (w > h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
        else if (h >= w && h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
        canvas.width = w; canvas.height = h; canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Trash
function moveToTrash(type, label, data) {
  db.trash.unshift({ id: uid(), updatedAt: Date.now(), type, label, data, deletedAt: new Date().toLocaleString('bn-BD'), deletedBy: activeAccount?.name || 'Admin' });
  if (db.trash.length > 100) db.trash.pop();
}
window.restoreTrash = function(trashId) {
  if (!isSuperAdmin()) return toast('শুধু Super Admin রিস্টোর করতে পারবেন!', 'error');
  const idx = db.trash.findIndex(x => x.id === trashId); if (idx === -1) return;
  const item = db.trash[idx], d = item.data, unmark = obj => { if (obj?.id) delete db.deletedIds[obj.id]; return obj; };
  if (item.type === 'customer_bundle' && d?.customer) {
    if (!db.customers.some(x => x.id === d.customer.id)) db.customers.push(unmark(d.customer));
    (d.pages || []).forEach(p => { if (!db.pages.some(x => x.id === p.id)) db.pages.push(unmark(p)); });
    (d.works || []).forEach(w => { if (!db.works.some(x => x.id === w.id)) db.works.push(unmark(w)); });
    (d.payments || []).forEach(p => { if (!db.payments.some(x => x.id === p.id)) db.payments.push(unmark(p)); });
  } else if (item.type === 'page' && d) { if (!db.pages.some(x => x.id === d.id)) db.pages.push(unmark(d)); }
  else if (item.type === 'work' && d) { if (!db.works.some(x => x.id === d.id)) db.works.push(unmark(d)); }
  else if (item.type === 'payment' && d) { if (!db.payments.some(x => x.id === d.id)) db.payments.push(unmark(d)); }
  else if (item.type === 'expense' && d) { if (!db.expenses.some(x => x.id === d.id)) db.expenses.push(unmark(d)); }
  else if (item.type === 'rate' && d) { if (!db.rates.some(x => x.id === d.id)) db.rates.push(unmark(d)); }
  else if (item.type === 'card' && d) { if (!db.cards.some(x => x.id === d.id)) db.cards.push(unmark(d)); }
  else if (item.type === 'deposit' && d) { if (!db.cardDeposits.some(x => x.id === d.id)) db.cardDeposits.push(unmark(d)); }
  else if (item.type === 'adAccount' && d) { if (!db.adAccounts.some(x => x.id === d.id)) db.adAccounts.push(unmark(d)); }
  markDeleted(trashId); db.trash.splice(idx, 1); save(); logActivity(`ট্র্যাশ থেকে রিস্টোর: ${item.label}`);
  renderAdminPanel(); toast('ডেটা সফলভাবে পুনরুদ্ধার হয়েছে!');
};
window.permDeleteTrash = function(trashId) {
  if (!isSuperAdmin() || !confirm('স্থায়ীভাবে মুছে ফেলতে চান? আর ফেরত আনা যাবে না!')) return;
  markDeleted(trashId); db.trash = db.trash.filter(x => x.id !== trashId); save(); renderAdminPanel(); toast('স্থায়ীভাবে মুছে ফেলা হয়েছে', 'warn');
};
window.emptyTrash = function() {
  if (!isSuperAdmin() || !db.trash.length || !confirm('রিসাইকেল বিন সম্পূর্ণ খালি করতে চান?')) return;
  db.trash.forEach(t => markDeleted(t.id)); db.trash = []; save(); renderAdminPanel(); toast('ট্র্যাশ খালি করা হয়েছে', 'warn');
};

// Mobile Drawer, Quick Search & Lock
function toggleMobileMenu(forceState) {
  const sb = $('appSidebar'), bd = $('sidebarBackdrop'); if (!sb || !bd) return;
  const open = typeof forceState === 'boolean' ? forceState : !sb.classList.contains('open');
  sb.classList.toggle('open', open); bd.classList.toggle('open', open);
}
if ($('mobileMenuBtn')) $('mobileMenuBtn').onclick = () => toggleMobileMenu();
if ($('sidebarBackdrop')) $('sidebarBackdrop').onclick = () => toggleMobileMenu(false);

function openQuickSearch() {
  if (!$('quickSearchModal')) return;
  $('quickSearchModal').style.display = 'flex'; $('quickSearchInput').value = '';
  renderQuickSearch(''); setTimeout(() => $('quickSearchInput')?.focus(), 50);
}
if ($('quickSearchBtn')) $('quickSearchBtn').onclick = openQuickSearch;
function renderQuickSearch(q) {
  const host = $('quickSearchResults'); if (!host) return;
  const s = q.trim().toLowerCase(), res = [];
  db.customers.filter(c => !s || c.name.toLowerCase().includes(s) || (c.phone || '').includes(s)).slice(0, 6).forEach(c => {
    res.push(`<div class="search-item" onclick="closeModal('quickSearchModal');openClientProfile('${c.id}')"><div><strong>👤 ${esc(c.name)}</strong><br><small class="muted">${esc(c.phone || 'ফোন নেই')}</small></div><span class="badge-admin">কাস্টমার</span></div>`);
  });
  db.works.filter(w => !s || w.name.toLowerCase().includes(s) || cname(w.customerId).toLowerCase().includes(s)).slice(0, 6).forEach(w => {
    res.push(`<div class="search-item" onclick="closeModal('quickSearchModal');goToSection('works');$('workSearch').value='${esc(w.name).replace(/'/g, "\\'")}';workPage=1;render()"><div><strong>⚡ ${esc(w.name)}</strong><br><small class="muted">${esc(cname(w.customerId))} · ${esc(w.date)} · ${money(bill(w))}</small></div><span class="badge-status status-running">${esc(w.status)}</span></div>`);
  });
  db.pages.filter(p => !s || p.name.toLowerCase().includes(s) || (p.adId || '').toLowerCase().includes(s) || (p.pixelId || '').includes(s)).slice(0, 5).forEach(p => {
    res.push(`<div class="search-item" onclick="closeModal('quickSearchModal');goToSection('customers')"><div><strong>📄 ${esc(p.name)}</strong><br><small class="muted">${esc(cname(p.customerId))} · Ad: ${esc(p.adId || '—')}</small></div><span class="badge-success">পেজ</span></div>`);
  });
  host.innerHTML = res.join('') || '<div class="muted" style="padding:14px;text-align:center">কোনো মিল পাওয়া যায়নি</div>';
}
if ($('quickSearchInput')) $('quickSearchInput').oninput = e => renderQuickSearch(e.target.value);

if ($('lockScreenBtn')) $('lockScreenBtn').onclick = () => {
  if (!activeAccount) return;
  sessionStorage.removeItem(SESSION_ACC_KEY); activeAccount = null; realSuperAdmin = null;
  if ($('authOverlay')) $('authOverlay').style.display = 'flex';
  if ($('loginPass')) { $('loginPass').value = ''; $('loginPass').focus(); }
  toast('স্ক্রিন লক করা হয়েছে! আনলক করতে পাসওয়ার্ড দিন।', 'warn');
};

// Notifications
let currentNotifKeys = [];
function getNotifStateKey() { return 'ads_hisab_notif_state_v72_' + (activeAccount?.id || 'legacy-super-admin'); }
function readNotifState() {
  try { const raw = JSON.parse(localStorage.getItem(getNotifStateKey()) || '{}'); if (raw.date === today()) return { date: today(), seen: Array.isArray(raw.seen) ? raw.seen : [], dismissed: Array.isArray(raw.dismissed) ? raw.dismissed : [] }; } catch (e) {}
  return { date: today(), seen: [], dismissed: [] };
}
function writeNotifState(state) { try { localStorage.setItem(getNotifStateKey(), JSON.stringify(state)); } catch (e) {} }
function markNotifsSeen(keys) {
  if (!keys || !keys.length) return;
  const st = readNotifState(); keys.forEach(k => { if (!st.seen.includes(k)) st.seen.push(k); });
  writeNotifState(st); if ($('notifCount')) $('notifCount').style.display = 'none';
}
window.dismissNotif = function(e, key) {
  e.stopPropagation(); const st = readNotifState();
  if (!st.seen.includes(key)) st.seen.push(key); if (!st.dismissed.includes(key)) st.dismissed.push(key);
  writeNotifState(st); updateNotifications();
};
if ($('notifIcon') && $('notifBox')) {
  $('notifIcon').onclick = e => { e.stopPropagation(); const box = $('notifBox'), willOpen = box.style.display !== 'block'; box.style.display = willOpen ? 'block' : 'none'; if (willOpen) markNotifsSeen(currentNotifKeys); };
  document.addEventListener('click', e => { if (!$('notifBox').contains(e.target) && !$('notifIcon').contains(e.target)) $('notifBox').style.display = 'none'; });
}

// Language (i18n)
const translations = {
  bn: {
    navDash: "📊 ড্যাশবোর্ড", navCust: "👥 কাস্টমার প্রোফাইল", navCards: "💳 ডলার ও কার্ড হিসাব",
    navRates: "📈 দৈনিক ডলার রেট", navWorks: "⚡ কাজের হিসাব", navPixel: "🎯 মেটা পিক্সেল ও অ্যাড অ্যাকাউন্ট",
    navExp: "💸 অফিস ও অন্যান্য খরচ", navPay: "💰 পেমেন্ট ও মোবাইল ওয়ালেট", navDue: "📑 বকেয়া ও অটোমেশন",
    navMonthly: "📅 মাসিক বা নির্দিষ্ট হিসাব", navRep: "📂 রিপোর্ট, কমিশন ও ব্যাকআপ", navSet: "⚙ সেটিংস",
    navLogout: "↪ লগ আউট", navChat: "💬 নোট ও চ্যাট",
    headerSub: "আপনার এজেন্সির বিজ্ঞাপন ও আর্থিক পারফরম্যান্স পরিচালনা করুন",
    loginTitle: "Ads হিসাব ম্যানেজার", loginSub: "আপনার বিজ্ঞাপনের হিসাব ও লাভ-ক্ষতি নিরাপদে পরিচালনা করুন",
    userLabel: "ইউজারনেম / ইমেইল / মোবাইল", passLabel: "পাসওয়ার্ড", rememberText: "পাসওয়ার্ড মনে রাখুন",
    loginBtnText: "লগইন করুন", notifHead: "বিজ্ঞপ্তি ও অটো অ্যালার্ট",
    btnResetPass: "পাসওয়ার্ড রিসেট", btnFindUser: "ইউজারনেম খুঁজুন", btnNewAcc: "নতুন অ্যাকাউন্ট তৈরি করুন", btnHelpSupport: "🆘 অ্যাডমিন / সুপার অ্যাডমিন হেল্প",
    lblFrom: "শুরুর তারিখ", lblTo: "শেষ তারিখ", btnFilter: "ফিল্টার রিপোর্ট", btnAllDates: "সব তারিখ",
    c1: "আজকের নিট লাভ", c2: "মোট বিলিং / আয়", c3: "প্রকৃত এড খরচ (ভ্যাট সহ)", c4: "নিট প্রফিট (সব খরচ বাদে)",
    cTodayBill: "আজকের মোট বিল", cTodaySpend: "আজকের এড খরচ", cTotalPaid: "মোট আদায়কৃত টাকা", cTotalDue: "মোট বকেয়া পাওনা",
    chartMonthly: "📈 শেষ ৬ মাসের আয়, খরচ ও লাভ", chartTop: "🏆 টপ ক্লায়েন্ট",
    activeAdsTitle: "⚡ চলমান ক্যাম্পেইন ও মেয়াদ মনিটর (Active Ads)",
    secCust: "👥 কাস্টমার ও ফেসবুক পেজ তথ্য", secCards: "💳 ডলার ও ব্যাংক কার্ড আর্থিক হিসাব",
    secRates: "📈 দৈনিক ডলার রেট", secWorks: "⚡ নতুন কাজ / বিজ্ঞাপন ক্যাম্পেইন"
  },
  en: {
    navDash: "📊 Dashboard", navCust: "👥 Customers & Pages", navCards: "💳 Cards & USD",
    navRates: "📈 Daily USD Rates", navWorks: "⚡ Campaigns / Works", navPixel: "🎯 Pixel & Ad Accounts",
    navExp: "💸 Office Expenses", navPay: "💰 Payments & Wallets", navDue: "📑 Dues & WhatsApp",
    navMonthly: "📅 Monthly Report", navRep: "📂 Reports & Commission", navSet: "⚙ Settings",
    navLogout: "↪ Logout", navChat: "💬 Notes & Chat",
    headerSub: "Manage your agency ad spend, billing, and net profit",
    loginTitle: "Ads Manager Login", loginSub: "Manage your ad accounts and profits securely",
    userLabel: "Username / Email / Mobile", passLabel: "Password", rememberText: "Remember Password",
    loginBtnText: "Login", notifHead: "Notifications & Alerts",
    btnResetPass: "Reset Password", btnFindUser: "Find Username", btnNewAcc: "Create New Account", btnHelpSupport: "🆘 Admin / Super Admin Help",
    lblFrom: "From Date", lblTo: "To Date", btnFilter: "Filter Report", btnAllDates: "All Dates",
    c1: "Today Net Profit", c2: "Total Billing / Revenue", c3: "Actual Ad Spend (incl. Fee)", c4: "Net Profit (After Expenses)",
    cTodayBill: "Today's Billing", cTodaySpend: "Today's Ad Cost", cTotalPaid: "Total Collected", cTotalDue: "Total Receivable Due",
    chartMonthly: "📈 Last 6 Months Revenue, Spend & Profit", chartTop: "🏆 Top Clients",
    activeAdsTitle: "⚡ Active Campaigns & Expiry Monitor",
    secCust: "👥 Customers & Facebook Pages", secCards: "💳 Cards & USD Ledger",
    secRates: "📈 Daily USD Billing Rates", secWorks: "⚡ Campaigns & Ad Works"
  }
};

function applyLanguage(lang) {
  localStorage.setItem(LANG_KEY, lang);
  const t = translations[lang] || translations.bn;
  if ($('languageSelect')) $('languageSelect').value = lang;
  const map = {
    navDash: t.navDash, navCust: t.navCust, navCards: t.navCards, navRates: t.navRates,
    navWorks: t.navWorks, navPixel: t.navPixel, navExp: t.navExp, navPay: t.navPay,
    navDue: t.navDue, navMonthly: t.navMonthly, navRep: t.navRep, navSet: t.navSet,
    navChat: t.navChat, navLogout: t.navLogout, headerSubText: t.headerSub,
    uiLoginTitle: t.loginTitle, uiLoginSub: t.loginSub, uiUserLabel: t.userLabel,
    uiPassLabel: t.passLabel, uiRememberText: t.rememberText, loginBtn: t.loginBtnText,
    uiNotifHeader: t.notifHead, cardTitleTodayProfit: t.c1, cardTitleTotalBill: t.c2,
    cardTitleTotalCost: t.c3, cardTitleNetProfit: t.c4, secTitleCust: t.secCust,
    secTitleCards: t.secCards, secTitleRates: t.secRates, secTitleWorks: t.secWorks
  };
  Object.entries(map).forEach(([id, txt]) => { if ($(id) && txt) $(id).textContent = txt; });
  document.querySelectorAll('[data-i18n]').forEach(el => { const k = el.getAttribute('data-i18n'); if (t[k]) el.textContent = t[k]; });
}
if ($('applyLanguageBtn')) $('applyLanguageBtn').onclick = () => { applyLanguage($('languageSelect').value); toast('ভাষা পরিবর্তন হয়েছে!'); };
applyLanguage(localStorage.getItem(LANG_KEY) || 'bn');

// Theme & Navigation
function setTheme(isDark) {
  document.body.classList.toggle('dark', isDark);
  if ($('themeToggleBtn')) $('themeToggleBtn').textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
}
if ($('themeToggleBtn')) $('themeToggleBtn').onclick = () => setTheme(!document.body.classList.contains('dark'));
if (localStorage.getItem(THEME_KEY) === 'dark') setTheme(true);

document.querySelectorAll('.side-menu button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.side-menu button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('main section').forEach(s => s.classList.toggle('active', s.id === b.dataset.tab));
  toggleMobileMenu(false); render();
  if (b.dataset.tab === 'adminPanel') switchAdminSubTab(isSuperAdmin() ? 'users' : 'help');
  if (b.dataset.tab === 'monthly') renderMonthlyReport();
  if (b.dataset.tab === 'liveChat') refreshOnlineChat();
});
window.goToSection = function(tabName) { const btn = document.querySelector(`.side-menu button[data-tab="${tabName}"]`); if (btn) btn.click(); };
document.querySelectorAll('[data-settings-panel]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-settings-panel]').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.settings-panel').forEach(p => p.classList.toggle('active', p.id === b.dataset.settingsPanel));
}));

// Selects
function fillSelect(id, items, placeholder, display = x => x.name) {
  const el = $(id); if (!el) return; const old = el.value;
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') + items.map(x => `<option value="${x.id}">${esc(display(x))}</option>`).join('');
  if (items.some(x => x.id === old)) el.value = old;
}

function refreshWalletSelects() {
  const list = db.wallets && db.wallets.length ? db.wallets : DEFAULT_WALLETS;
  ['pMethod', 'epMethod', 'expMethod', 'eeMethod', 'depositMethod', 'edMethod', 'caMethod'].forEach(id => {
    const el = $(id); if (!el) return; const old = el.value;
    const opts = old && !list.includes(old) ? [...list, old] : list;
    el.innerHTML = opts.map(w => `<option value="${esc(w)}">${esc(w)}</option>`).join('');
    if (old && opts.includes(old)) el.value = old;
    else if (id.includes('deposit') && list.includes('Bank')) el.value = 'Bank';
    else if ((id.includes('exp') || id.includes('ca')) && list.includes('Cash')) el.value = 'Cash';
  });
  if ($('payMethodFilter')) {
    const oldF = $('payMethodFilter').value;
    $('payMethodFilter').innerHTML = `<option value="">সব ওয়ালেট</option>` + list.map(w => `<option value="${esc(w)}">${esc(w)}</option>`).join('');
    if (oldF && list.includes(oldF)) $('payMethodFilter').value = oldF;
  }
}

function fillStaffSelect(id) {
  const el = $(id); if (!el) return; const old = el.value;
  const accounts = readLocalAccounts(), saName = (activeAccount?.id === 'legacy-super-admin' ? readProfile().name : '') || 'Admin / Owner';
  const unique = [...new Set([saName, ...accounts.map(a => a.name)].filter(Boolean))];
  if (old && !unique.includes(old)) unique.push(old);
  el.innerHTML = `<option value="">নির্বাচন করুন (ঐচ্ছিক)</option>` + unique.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  if (old) el.value = old;
}

function refresh() {
  fillSelect('wCard', db.cards, 'কার্ড নির্বাচন'); fillSelect('ewCard', db.cards, 'কার্ড নির্বাচন');
  fillSelect('aaCard', db.cards, 'কার্ড নির্বাচন'); fillSelect('eaaCard', db.cards, 'কার্ড নির্বাচন');
  fillSelect('depositCard', db.cards, db.cards.length ? '' : 'প্রথমে কার্ড যোগ করুন');
  fillSelect('trFromCard', db.cards, 'কার্ড নির্বাচন'); fillSelect('trToCard', db.cards, 'কার্ড নির্বাচন'); fillSelect('rfCard', db.cards, 'কার্ড নির্বাচন');
  fillSelect('pageCustomer', db.customers, 'কাস্টমার নির্বাচন'); fillSelect('qpCustomer', db.customers, 'কাস্টমার নির্বাচন');
  fillSelect('wCustomer', db.customers, 'কাস্টমার নির্বাচন'); fillSelect('ewCustomer', db.customers, 'কাস্টমার নির্বাচন');
  fillSelect('pCustomer', db.customers, 'কাস্টমার নির্বাচন'); fillSelect('epCustomer', db.customers, 'কাস্টমার নির্বাচন');
  fillSelect('workCustomerFilter', db.customers, 'সব কাস্টমার');
  refreshWalletSelects(); fillStaffSelect('wStaff'); fillStaffSelect('ewStaff'); updatePages();
}

function updatePages() {
  const wc = $('wCustomer'), wp = $('wPage'); if (!wc || !wp) return;
  const cid = wc.value, filtered = db.pages.filter(p => !cid || p.customerId === cid);
  fillSelect('wPage', filtered, filtered.length ? 'পেজ নির্বাচন (ঐচ্ছিক)' : 'কোনো পেজ নেই (ঐচ্ছিক)', p => `${p.name} — ${cname(p.customerId)}`);
  if (cid && filtered.length === 1 && !wp.value) wp.value = filtered[0].id;
}
function updateEditWorkPages() {
  const wc = $('ewCustomer'); if (!wc) return;
  fillSelect('ewPage', db.pages.filter(p => !wc.value || p.customerId === wc.value), 'পেজ নির্বাচন (ঐচ্ছিক)', p => `${p.name} — ${cname(p.customerId)}`);
}
if ($('wCustomer')) $('wCustomer').onchange = updatePages;
if ($('ewCustomer')) $('ewCustomer').onchange = updateEditWorkPages;

// Quick Inline Customer & Page Modals
window.openQuickCustomerModal = function() { $('quickCustomerForm')?.reset(); $('quickCustomerModal').style.display = 'flex'; setTimeout(() => $('qcName')?.focus(), 50); };
if ($('quickCustomerForm')) $('quickCustomerForm').onsubmit = e => {
  e.preventDefault();
  const id = uid(), name = $('qcName').value.trim();
  db.customers.push({ id, updatedAt: Date.now(), portalToken: uid().slice(-6), name, phone: $('qcPhone').value.trim(), retainer: num($('qcRetainer').value), note: '' });
  save(); logActivity(`কুইক কাস্টমার যুক্ত: ${name}`);
  if ($('wCustomer')) { $('wCustomer').value = id; updatePages(); }
  closeModal('quickCustomerModal'); toast(`${name} যুক্ত ও নির্বাচিত হয়েছে!`);
};

window.openQuickPageModal = function() {
  $('quickPageForm')?.reset(); fillSelect('qpCustomer', db.customers, 'কাস্টমার নির্বাচন');
  if ($('wCustomer')?.value && $('qpCustomer')) $('qpCustomer').value = $('wCustomer').value;
  $('quickPageModal').style.display = 'flex'; setTimeout(() => $('qpName')?.focus(), 50);
};
if ($('quickPageForm')) $('quickPageForm').onsubmit = e => {
  e.preventDefault();
  const id = uid(), custId = $('qpCustomer').value, name = $('qpName').value.trim();
  db.pages.push({ id, updatedAt: Date.now(), customerId: custId, name, link: $('qpLink').value.trim(), adId: $('qpAdId').value.trim(), pixelId: $('qpPixelId').value.trim() });
  save(); logActivity(`কুইক পেজ যুক্ত: ${name}`);
  if ($('wCustomer')) $('wCustomer').value = custId;
  updatePages(); if ($('wPage')) $('wPage').value = id;
  closeModal('quickPageModal'); toast(`${name} পেজ যুক্ত ও নির্বাচিত হয়েছে!`);
};

function updatePaymentCustomerStatus() {
  const el = $('pCustomerStatus'), cid = $('pCustomer')?.value; if (!el) return;
  if (!cid) { el.innerHTML = ''; return; }
  const bal = clientBalance(cid);
  if (bal < 0) el.innerHTML = `<span class="bad">বর্তমান বকেয়া: ${money(-bal)}</span> <button type="button" class="secondary sm" onclick="$('pAmount').value='${(-bal).toFixed(2)}'">পুরো বকেয়া বসান</button>`;
  else if (bal > 0) el.innerHTML = `<span class="good">অ্যাডভান্স জমা আছে: ${money(bal)}</span>`;
  else el.innerHTML = `<span class="muted">কোনো বকেয়া নেই (৳0.00)</span>`;
}
if ($('pCustomer')) $('pCustomer').onchange = updatePaymentCustomerStatus;

['rateDate','wDate','pDate','expDate','depositDate','trDate','rfDate','caDate'].forEach(id => { if ($(id)) $(id).value = today(); });
if ($('wDate')) $('wDate').onchange = () => { const r = rateFor($('wDate').value); if (r && $('wRate')) { $('wRate').value = r; updateWorkPreview(); } };
if ($('wCard')) $('wCard').onchange = () => { const avg = cardAvgRate($('wCard').value); if (avg > 0 && $('wActualRate')) { $('wActualRate').value = avg; updateWorkPreview(); } };
if ($('ewCard')) $('ewCard').onchange = () => { const avg = cardAvgRate($('ewCard').value); if (avg > 0 && $('ewActualRate') && !num($('ewActualRate').value)) { $('ewActualRate').value = avg; updateEditWorkPreview(); } };

function updateWorkPreview() {
  const date = $('wDate')?.value || today(), actualDol = num($('wActualDollar')?.value), rate = num($('wRate')?.value) || rateFor(date);
  const sFee = num($('wServiceFee')?.value), sType = $('wServiceFeeType')?.value || 'fixed', actRate = num($('wActualRate')?.value), feePct = num($('wFeePct')?.value), other = num($('wOther')?.value), cardId = $('wCard')?.value || '';
  const baseB = actualDol * rate, svc = sFee ? (sType === 'pct' ? baseB * (sFee / 100) : sFee) : 0, b = baseB + svc;
  const base = actualDol * actRate, fee = base * (feePct / 100), act = base + fee, pr = b - act - other;
  let warnHtml = '';
  if (!isStaff() && actualDol > 0 && actRate > 0 && pr < 0) warnHtml += ` <span class="badge-danger">⚠️ লস হচ্ছে!</span>`;
  if (cardId && actualDol > 0 && getCardStats(cardId).balance < actualDol) warnHtml += ` <span class="badge-warn">⚠️ কার্ড ব্যালেন্স কম!</span>`;
  if ($('preview')) {
    if (isStaff()) $('preview').innerHTML = `বিল: ${money(b)}${svc ? ` (সার্ভিস চার্জ: ${money(svc)})` : ''}${warnHtml}`;
    else $('preview').innerHTML = `মোট বিল: ${money(b)}${svc ? ` (চার্জ: ${money(svc)})` : ''} · খরচ: ${money(base)} + ফি (${feePct}%): ${money(fee)} = ${money(act)} · লাভ: <strong style="color:${pr >= 0 ? '#059669' : '#dc2626'}">${money(pr)}</strong>${warnHtml}`;
  }
}
['wDate','wActualDollar','wRate','wServiceFee','wServiceFeeType','wActualRate','wFeePct','wOther','wCard'].forEach(id => { if ($(id)) { $(id).oninput = updateWorkPreview; $(id).onchange = updateWorkPreview; } });

function updateEditWorkPreview() {
  const actualDol = num($('ewActualDollar')?.value), rate = num($('ewRate')?.value), sFee = num($('ewServiceFee')?.value), sType = $('ewServiceFeeType')?.value || 'fixed', actRate = num($('ewActualRate')?.value), feePct = num($('ewFeePct')?.value), other = num($('ewOther')?.value);
  const baseB = actualDol * rate, svc = sFee ? (sType === 'pct' ? baseB * (sFee / 100) : sFee) : 0, b = baseB + svc, base = actualDol * actRate, fee = base * (feePct / 100), act = base + fee, pr = b - act - other;
  if ($('ewPreview')) $('ewPreview').textContent = isStaff() ? `মোট বিল: ${money(b)}` : `মোট বিল: ${money(b)} · প্রকৃত খরচ (ফি সহ): ${money(act)} · লাভ: ${money(pr)}`;
}
['ewActualDollar','ewRate','ewServiceFee','ewServiceFeeType','ewActualRate','ewFeePct','ewOther'].forEach(id => { if ($(id)) { $(id).oninput = updateEditWorkPreview; $(id).onchange = updateEditWorkPreview; } });

window.togglePasswordVisibility = function(fieldId, btnEl) { const f = $(fieldId); if (!f) return; f.type = f.type === 'password' ? 'text' : 'password'; btnEl.textContent = f.type === 'password' ? '👁' : '🙈'; };

// Help Inbox
function readHelpRequests() { try { return JSON.parse(localStorage.getItem(HELP_REQUESTS_KEY) || '[]'); } catch (e) { return []; } }
function writeHelpRequests(arr) { try { localStorage.setItem(HELP_REQUESTS_KEY, JSON.stringify(arr)); } catch (e) {} }
if ($('loginHelpBtn')) $('loginHelpBtn').onclick = () => {
  let masterAg = {}; try { masterAg = JSON.parse(localStorage.getItem(MASTER_DB_KEY) || '{}').agency || {}; } catch (e) {}
  const waNum = normalizeBdPhone(masterAg.phone || '');
  if ($('lhWaWrap') && $('lhWaBtn')) { if (waNum) { $('lhWaWrap').style.display = 'block'; $('lhWaBtn').href = `https://wa.me/${waNum}?text=${encodeURIComponent('আসসালামু আলাইকুম, Ads হিসাব ম্যানেজার লগইন সংক্রান্ত সহায়তা প্রয়োজন।')}`; } else $('lhWaWrap').style.display = 'none'; }
  $('loginHelpForm')?.reset(); $('loginHelpModal').style.display = 'flex';
};
if ($('loginHelpForm')) $('loginHelpForm').onsubmit = e => {
  e.preventDefault(); const arr = readHelpRequests();
  arr.unshift({ id: uid(), time: new Date().toLocaleString('bn-BD'), target: $('lhTarget').value, name: $('lhName').value.trim(), contact: $('lhContact').value.trim(), topic: $('lhTopic').value, message: $('lhMessage').value.trim(), status: 'open' });
  if (arr.length > 100) arr.pop(); writeHelpRequests(arr); closeModal('loginHelpModal'); toast('আপনার বার্তাটি Admin ইনবক্সে পাঠানো হয়েছে!');
};
window.resolveHelpReq = function(id) { const arr = readHelpRequests(), item = arr.find(x => x.id === id); if (!item) return; item.status = item.status === 'resolved' ? 'open' : 'resolved'; writeHelpRequests(arr); renderAdminPanel(); updateNotifications(); toast(item.status === 'resolved' ? 'সমাধান হিসেবে চিহ্নিত!' : 'পুনরায় Open করা হয়েছে'); };
window.deleteHelpReq = function(id) { writeHelpRequests(readHelpRequests().filter(x => x.id !== id)); renderAdminPanel(); updateNotifications(); toast('মেসেজ মুছে ফেলা হয়েছে', 'warn'); };
window.clearAllHelpRequests = function() { if (!confirm('সব হেল্প মেসেজ মুছে ফেলতে চান?')) return; writeHelpRequests([]); renderAdminPanel(); updateNotifications(); toast('হেল্প ইনবক্স পরিষ্কার হয়েছে', 'warn'); };

// Auth System
function readLocalAccounts() { try { return JSON.parse(localStorage.getItem(ACCOUNTSKEY) || '[]'); } catch (e) { return []; } }
function readSuperAdminMeta() { try { return JSON.parse(localStorage.getItem(SUPERADMIN_META_KEY) || '{}'); } catch (e) { return {}; } }

function activateAccountData(account) {
  if (!account.id) account.id = 'legacy-super-admin';
  KEY = (account.id === 'legacy-super-admin' || account.role === 'staff') ? MASTER_DB_KEY : ('ads_hisab_user_data_v72_' + account.id);
  PROFILEKEY = 'ads_hisab_user_profile_v72_' + account.id;
  loadDb();
}

function enterLoggedInUI(account, skipLog = false) {
  realSuperAdmin = null; if ($('impersonateBanner')) $('impersonateBanner').style.display = 'none';
  activeAccount = account;
  try { sessionStorage.setItem(SESSION_ACC_KEY, JSON.stringify(account)); } catch (e) {}
  applyPermissionClasses(); activateAccountData(account);
  if (!skipLog) logActivity('লগইন করেছেন');
  if ($('authOverlay')) $('authOverlay').style.display = 'none';
  const canAccessAdmin = (account.role === 'super_admin' || account.role === 'admin' || account.id === 'legacy-super-admin');
  if ($('adminTab')) $('adminTab').style.display = canAccessAdmin ? 'flex' : 'none';
  updateHeaderAndProfile();
  if ($('wRate') && !num($('wRate').value)) $('wRate').value = rateFor(today()) || '';
  if ($('wFeePct')) $('wFeePct').value = num(db.agency?.defaultFeePct) || 0;
  goToSection('dash'); updateWorkPreview();
  if (typeof refreshOnlineChat === 'function') refreshOnlineChat();
  const cfg = readCloudSync();
  if (!cfg.url) setSyncUi('', 'Local');
  else if (localStorage.getItem(LOCAL_DIRTY_KEY) === '1') setSyncUi('err', 'Pending Sync');
  else setSyncUi('ok', 'Synced');
  updateStorageMeter();
}

window.performLocalLogout = function() {
  localStorage.removeItem(REMEMBER_LOGIN_KEY); sessionStorage.removeItem(SESSION_ACC_KEY);
  activeAccount = null; realSuperAdmin = null;
  if ($('impersonateBanner')) $('impersonateBanner').style.display = 'none';
  document.body.classList.remove('role-staff', 'role-superadmin', 'no-perm-del', 'no-perm-edit', 'no-perm-pay', 'no-perm-exp');
  KEY = MASTER_DB_KEY; loadDb();
  document.querySelectorAll('.side-menu button').forEach(b => b.classList.toggle('active', b.dataset.tab === 'dash'));
  document.querySelectorAll('main section').forEach(s => s.classList.toggle('active', s.id === 'dash'));
  if ($('authOverlay')) $('authOverlay').style.display = 'flex';
  if ($('loginFormContainer')) $('loginFormContainer').style.display = 'block';
  if ($('registerPanel')) $('registerPanel').style.display = 'none';
  if ($('authMsg')) $('authMsg').textContent = '';
  if ($('adminTab')) $('adminTab').style.display = 'none';
  if ($('loginPass')) $('loginPass').value = '';
  if ($('rememberLogin')) $('rememberLogin').checked = false;
  toast('সফলভাবে লগ আউট হয়েছে');
};

window.login = function() {
  const identity = ($('loginUser')?.value || '').trim().toLowerCase(), pass = $('loginPass')?.value || '';
  if (!identity || !pass) { if ($('authMsg')) $('authMsg').textContent = 'ইউজারনেম ও পাসওয়ার্ড দিন।'; return; }
  const accounts = readLocalAccounts();
  let accIdx = accounts.findIndex(a => [a.username, a.email, a.phone].some(v => String(v || '').trim().toLowerCase() === identity) && checkPass(pass, a.password));
  let account = accIdx !== -1 ? accounts[accIdx] : null;
  if (account && !String(account.password).startsWith('h1_')) { accounts[accIdx].password = hashPass(pass); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); }
  const superAdminPass = localStorage.getItem(PASSKEY) || '123456789';
  if (!account && identity === 'admin' && checkPass(pass, superAdminPass)) {
    if (!String(superAdminPass).startsWith('h1_')) localStorage.setItem(PASSKEY, hashPass(pass));
    account = { id: 'legacy-super-admin', username: 'admin', name: 'Super Admin', email: 'admin@example.com', phone: '01700000000', role: 'super_admin', userNumber: 1, status: 'active' };
  }
  if (!account) { if ($('authMsg')) $('authMsg').textContent = 'লগইন তথ্য সঠিক নয়। (প্রথমবার হলে: admin / 123456789)'; return; }
  if (account.status === 'suspended') { if ($('authMsg')) $('authMsg').textContent = 'আপনার অ্যাকাউন্টটি ব্লক (Suspended) করা আছে।'; return; }

  const nowStr = new Date().toLocaleString('bn-BD');
  if (account.id === 'legacy-super-admin') {
    const meta = readSuperAdminMeta(); meta.lastLogin = nowStr; meta.loginCount = num(meta.loginCount) + 1;
    localStorage.setItem(SUPERADMIN_META_KEY, JSON.stringify(meta));
  } else if (accIdx !== -1) {
    accounts[accIdx].lastLogin = nowStr; accounts[accIdx].loginCount = num(accounts[accIdx].loginCount) + 1;
    localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); account = accounts[accIdx];
  }
  if ($('rememberLogin')?.checked) localStorage.setItem(REMEMBER_LOGIN_KEY, encodeRemember({ identity, pass }));
  else localStorage.removeItem(REMEMBER_LOGIN_KEY);

  enterLoggedInUI(account, false);
  toast(`স্বাগতম, ${readProfile().name || account.name}!`);
};

['loginUser','loginPass'].forEach(id => { if ($(id)) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') window.login(); }); });
if ($('loginBtn')) $('loginBtn').onclick = window.login;
if ($('showRegisterBtn')) $('showRegisterBtn').onclick = () => { $('loginFormContainer').style.display = 'none'; $('registerPanel').style.display = 'block'; if ($('authMsg')) $('authMsg').textContent = ''; };
if ($('backToLoginBtn')) $('backToLoginBtn').onclick = () => { $('registerPanel').style.display = 'none'; $('loginFormContainer').style.display = 'block'; if ($('authMsg')) $('authMsg').textContent = ''; };

if ($('registerBtn')) $('registerBtn').onclick = () => {
  const name = $('regName')?.value.trim(), username = ($('regUsername')?.value || '').trim().toLowerCase(), email = ($('regEmail')?.value || '').trim().toLowerCase(), phone = ($('regPhone')?.value || '').trim(), pass = $('regPass')?.value || '', pass2 = $('regPass2')?.value || '';
  if (!name || !username || !email || !phone || !pass) { $('authMsg').textContent = 'সবগুলো ঘর পূরণ করুন।'; return; }
  if (username === 'admin') { $('authMsg').textContent = 'admin ইউজারনেম ব্যবহার করা যাবে না।'; return; }
  if (pass.length < 6) { $('authMsg').textContent = 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'; return; }
  if (pass !== pass2) { $('authMsg').textContent = 'পাসওয়ার্ড মিলছে না।'; return; }
  const accounts = readLocalAccounts();
  if (accounts.some(a => a.username === username || a.email === email)) { $('authMsg').textContent = 'এই ইউজারনেম বা ইমেইল দিয়ে আগেই অ্যাকাউন্ট খোলা হয়েছে।'; return; }
  const next = Number(localStorage.getItem(NEXTUSERIDKEY) || 2);
  const account = { id: uid(), updatedAt: Date.now(), userNumber: next, name, username, email, phone, password: hashPass(pass), role: 'user', status: 'active', lastLogin: new Date().toLocaleString('bn-BD'), loginCount: 1 };
  accounts.push(account); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); localStorage.setItem(NEXTUSERIDKEY, String(next + 1));
  localStorage.setItem('ads_hisab_user_profile_v72_' + account.id, JSON.stringify({ name, email, phone, pic: '' }));
  enterLoggedInUI(account, false); logActivity(`নতুন ইউজার রেজিস্ট্রেশন: ${name}`); triggerAccountCloudSync();
  toast('নতুন অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে!');
};

// Recovery
if ($('forgotBtn')) $('forgotBtn').onclick = () => { $('recoveryMode').value = 'password'; $('recoveryTitle').textContent = 'পাসওয়ার্ড রিসেট করুন'; $('recNewPassWrap').style.display = 'block'; $('recNewPass').required = true; $('recoveryForm').reset(); $('recoveryModal').style.display = 'flex'; };
if ($('forgotUserBtn')) $('forgotUserBtn').onclick = () => { $('recoveryMode').value = 'username'; $('recoveryTitle').textContent = 'ইউজারনেম খুঁজুন'; $('recNewPassWrap').style.display = 'none'; $('recNewPass').required = false; $('recoveryForm').reset(); $('recoveryModal').style.display = 'flex'; };
if ($('recoveryForm')) $('recoveryForm').onsubmit = e => {
  e.preventDefault(); const mode = $('recoveryMode').value, email = $('recEmail').value.trim().toLowerCase(), phone = $('recPhone').value.trim();
  const accounts = readLocalAccounts(), idx = accounts.findIndex(a => String(a.email || '').trim().toLowerCase() === email && String(a.phone || '').trim() === phone);
  if (idx === -1) {
    const saProf = (() => { try { return JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_legacy-super-admin') || '{}'); } catch (err) { return {}; } })();
    if (email === String(saProf.email || 'admin@example.com').trim().toLowerCase() && phone === String(saProf.phone || '01700000000').trim()) {
      if (mode === 'username') { toast('আপনার ইউজারনেম: admin', 'success'); closeModal('recoveryModal'); }
      else { const np = $('recNewPass').value; if (np.length < 6) return toast('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন', 'error'); localStorage.setItem(PASSKEY, hashPass(np)); triggerAccountCloudSync(); toast('সুপার অ্যাডমিন পাসওয়ার্ড রিসেট হয়েছে!'); closeModal('recoveryModal'); }
      return;
    }
    return toast('ইমেইল ও মোবাইল নম্বর মিলছে না!', 'error');
  }
  if (mode === 'username') { toast(`আপনার ইউজারনেম: ${accounts[idx].username}`, 'success'); closeModal('recoveryModal'); }
  else { const np = $('recNewPass').value; if (np.length < 6) return toast('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন', 'error'); accounts[idx].password = hashPass(np); accounts[idx].updatedAt = Date.now(); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); triggerAccountCloudSync(); toast('পাসওয়ার্ড সফলভাবে রিসেট হয়েছে!'); closeModal('recoveryModal'); }
};

// Profile & Agency Branding + Logo/QR Upload
function readProfile() { try { return JSON.parse(localStorage.getItem(PROFILEKEY) || '{}'); } catch (e) { return {}; } }

function updateAgencyThumbs(logoSrc, qrSrc) {
  const lp = $('agLogoPreview'), qp = $('agQrPreview');
  if (lp) { if (logoSrc) { lp.src = logoSrc; lp.style.display = 'block'; } else lp.style.display = 'none'; }
  if (qp) { if (qrSrc) { qp.src = qrSrc; qp.style.display = 'block'; } else qp.style.display = 'none'; }
}

function applyAgencyBranding() {
  const ag = db.agency || {}, title = ag.name || 'Ads হিসাব ম্যানেজার', tagline = ag.tagline || 'Smart · Secure · Pro v75';
  if ($('sideBrandTitle')) $('sideBrandTitle').textContent = title;
  if ($('sideBrandSub')) $('sideBrandSub').textContent = tagline;
  if ($('agName')) $('agName').value = title;
  if ($('agTagline')) $('agTagline').value = tagline;
  if ($('agPhone')) $('agPhone').value = ag.phone || '';
  if ($('agDefaultRate')) $('agDefaultRate').value = ag.defaultRate || 125;
  if ($('agDefaultFee')) $('agDefaultFee').value = ag.defaultFeePct || 0;
  if ($('agMonthlyGoal')) $('agMonthlyGoal').value = num(ag.monthlyGoal) || 100000;
  pendingAgLogoData = ag.logoUrl || ''; pendingAgQrData = ag.qrUrl || '';
  if ($('agLogoUrl')) { $('agLogoUrl').value = pendingAgLogoData.startsWith('data:') ? '' : pendingAgLogoData; $('agLogoUrl').placeholder = pendingAgLogoData.startsWith('data:') ? 'আপলোড করা লোগো সেভ আছে' : 'https://.../logo.png'; }
  if ($('agQrUrl')) { $('agQrUrl').value = pendingAgQrData.startsWith('data:') ? '' : pendingAgQrData; $('agQrUrl').placeholder = pendingAgQrData.startsWith('data:') ? 'আপলোড করা QR সেভ আছে' : 'https://.../qr.png'; }
  updateAgencyThumbs(pendingAgLogoData, pendingAgQrData);
  if ($('agSignText')) $('agSignText').value = ag.signText || '';
  if ($('agTermsText')) $('agTermsText').value = ag.termsText || '';
  if ($('agPayInfo')) $('agPayInfo').value = ag.payInfo || '';
  if ($('agMetaToken')) $('agMetaToken').value = ag.metaToken || '';
  if ($('agWaTemplate')) $('agWaTemplate').value = ag.waTemplate || DEFAULT_WA_TEMPLATE;
}

if ($('agLogoFile')) $('agLogoFile').onchange = async e => {
  const f = e.target.files?.[0]; if (!f) return;
  try { pendingAgLogoData = await compressImageFile(f, 320, 0.85); if ($('agLogoUrl')) $('agLogoUrl').value = ''; updateAgencyThumbs(pendingAgLogoData, pendingAgQrData); toast('লোগো প্রস্তুত! নিচে "এজেন্সি তথ্য সেভ করুন" ক্লিক করুন।'); } catch (err) { toast('ছবি প্রসেস করতে সমস্যা হয়েছে!', 'error'); }
};
if ($('agQrFile')) $('agQrFile').onchange = async e => {
  const f = e.target.files?.[0]; if (!f) return;
  try { pendingAgQrData = await compressImageFile(f, 320, 0.85); if ($('agQrUrl')) $('agQrUrl').value = ''; updateAgencyThumbs(pendingAgLogoData, pendingAgQrData); toast('QR কোড প্রস্তুত! নিচে "এজেন্সি তথ্য সেভ করুন" ক্লিক করুন।'); } catch (err) { toast('ছবি প্রসেস করতে সমস্যা হয়েছে!', 'error'); }
};
if ($('removeAgLogoBtn')) $('removeAgLogoBtn').onclick = () => { pendingAgLogoData = ''; if ($('agLogoUrl')) $('agLogoUrl').value = ''; if ($('agLogoFile')) $('agLogoFile').value = ''; db.agency.logoUrl = ''; save(); applyAgencyBranding(); toast('লোগো সরানো হয়েছে', 'warn'); };
if ($('removeAgQrBtn')) $('removeAgQrBtn').onclick = () => { pendingAgQrData = ''; if ($('agQrUrl')) $('agQrUrl').value = ''; if ($('agQrFile')) $('agQrFile').value = ''; db.agency.qrUrl = ''; save(); applyAgencyBranding(); toast('QR কোড সরানো হয়েছে', 'warn'); };
if ($('agLogoUrl')) $('agLogoUrl').oninput = e => updateAgencyThumbs(e.target.value.trim() || pendingAgLogoData, $('agQrUrl')?.value.trim() || pendingAgQrData);
if ($('agQrUrl')) $('agQrUrl').oninput = e => updateAgencyThumbs($('agLogoUrl')?.value.trim() || pendingAgLogoData, e.target.value.trim() || pendingAgQrData);

if ($('agencyForm')) $('agencyForm').onsubmit = e => {
  e.preventDefault();
  db.agency = {
    name: $('agName').value.trim() || 'Ads হিসাব ম্যানেজার',
    tagline: $('agTagline').value.trim() || 'Smart · Secure · Pro v75',
    phone: $('agPhone').value.trim(),
    defaultRate: num($('agDefaultRate').value) || 125,
    defaultFeePct: num($('agDefaultFee').value) || 0,
    monthlyGoal: num($('agMonthlyGoal')?.value) || 0,
    logoUrl: $('agLogoUrl')?.value.trim() || pendingAgLogoData || '',
    qrUrl: $('agQrUrl')?.value.trim() || pendingAgQrData || '',
    signText: $('agSignText')?.value.trim() || '',
    termsText: $('agTermsText')?.value.trim() || '',
    payInfo: $('agPayInfo')?.value.trim() || '',
    metaToken: $('agMetaToken')?.value.trim() || '',
    waTemplate: $('agWaTemplate')?.value.trim() || DEFAULT_WA_TEMPLATE
  };
  save(); applyAgencyBranding(); logActivity('এজেন্সি ব্র্যান্ডিং আপডেট হয়েছে');
  if ($('agLogoFile')) $('agLogoFile').value = ''; if ($('agQrFile')) $('agQrFile').value = '';
  if ($('wRate') && !num($('wRate').value)) $('wRate').value = db.agency.defaultRate;
  if ($('wFeePct')) $('wFeePct').value = db.agency.defaultFeePct;
  toast('এজেন্সি সেটিংস সেভ হয়েছে!');
};

function updateHeaderAndProfile() {
  const p = readProfile(), currentName = p.name || activeAccount?.name || 'User';
  const roleMap = { super_admin: 'Super Admin', admin: 'Admin', staff: 'Staff', user: 'User' };
  const currentRole = (activeAccount?.id === 'legacy-super-admin') ? 'Super Admin' : (roleMap[activeAccount?.role] || 'User');

  if ($('welcomeTitle')) $('welcomeTitle').textContent = `স্বাগতম, ${currentName}!`;
  if ($('headerProfileName')) $('headerProfileName').textContent = currentName;
  if ($('headerProfileRole')) $('headerProfileRole').textContent = currentRole;
  if ($('sideRoleName')) $('sideRoleName').textContent = currentRole;
  if ($('sideRoleDesc')) $('sideRoleDesc').textContent = isStaff() ? 'স্টাফ ওয়ার্কস্পেস (সীমিত এক্সেস)' : 'সম্পূর্ণ এক্সেস ও কন্ট্রোল';

  if ($('profileDisplayName')) $('profileDisplayName').textContent = currentName;
  if ($('profileUserId')) $('profileUserId').textContent = 'ID: AS-' + String(activeAccount?.userNumber || 1).padStart(5, '0');
  if ($('profileRoleBadge')) { $('profileRoleBadge').textContent = currentRole; $('profileRoleBadge').className = isStaff() ? 'badge-admin' : 'badge-success'; }
  if ($('profileName')) $('profileName').value = currentName;
  if ($('profileEmail')) $('profileEmail').value = p.email || activeAccount?.email || '';
  if ($('profilePhone')) $('profilePhone').value = p.phone || activeAccount?.phone || '';

  pendingProfilePicData = p.pic || '';
  if ($('profilePicInput')) {
    if (pendingProfilePicData.startsWith('data:image/')) { $('profilePicInput').value = ''; $('profilePicInput').placeholder = 'আপলোড করা ছবি সেভ আছে'; }
    else { $('profilePicInput').value = pendingProfilePicData; $('profilePicInput').placeholder = 'https://... (লাইভ প্রিভিউ)'; }
  }
  const fallback = defaultAvatarUrl(currentName), picUrl = pendingProfilePicData || fallback;
  [$('profilePreview'), $('headerProfilePic')].forEach(img => { if (!img) return; img.onerror = () => { img.onerror = null; img.src = fallback; }; img.src = picUrl; });
  applyAgencyBranding(); updateStorageMeter();
  if (!isStaff()) renderAdminPanel();
}

if ($('profilePicInput')) $('profilePicInput').oninput = e => {
  const url = e.target.value.trim();
  if ($('profilePreview')) $('profilePreview').src = url || pendingProfilePicData || defaultAvatarUrl($('profileName')?.value || 'U');
};
if ($('profilePicFile')) $('profilePicFile').onchange = async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    const compressed = await compressImageFile(file, 240, 0.82);
    pendingProfilePicData = compressed; if ($('profilePreview')) $('profilePreview').src = compressed;
    if ($('profilePicInput')) $('profilePicInput').value = '';
    toast('ছবি প্রস্তুত! "প্রোফাইল আপডেট করুন" বাটনে ক্লিক করুন।');
  } catch (err) { toast('ছবি প্রসেস করতে সমস্যা হয়েছে!', 'error'); }
};
if ($('removeProfilePicBtn')) $('removeProfilePicBtn').onclick = () => {
  pendingProfilePicData = ''; if ($('profilePicInput')) $('profilePicInput').value = ''; if ($('profilePicFile')) $('profilePicFile').value = '';
  const p = readProfile(); p.pic = ''; localStorage.setItem(PROFILEKEY, JSON.stringify(p));
  updateHeaderAndProfile(); triggerAccountCloudSync(); toast('প্রোফাইল ছবি সরানো হয়েছে', 'warn');
};
function saveProfileData(name, email, phone, pic) {
  try { localStorage.setItem(PROFILEKEY, JSON.stringify({ name, email, phone, pic })); }
  catch (e) { return toast('ছবিটি অনেক বড় হওয়ায় সেভ করা যায়নি!', 'error'); }
  if (activeAccount) {
    activeAccount.name = name; activeAccount.email = email; activeAccount.phone = phone;
    try { sessionStorage.setItem(SESSION_ACC_KEY, JSON.stringify(activeAccount)); } catch (e) {}
    if (activeAccount.id !== 'legacy-super-admin') {
      const accounts = readLocalAccounts(), idx = accounts.findIndex(a => a.id === activeAccount.id);
      if (idx !== -1) { accounts[idx].name = name; accounts[idx].email = email; accounts[idx].phone = phone; accounts[idx].updatedAt = Date.now(); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); }
    }
  }
  if ($('profilePicFile')) $('profilePicFile').value = '';
  logActivity(`প্রোফাইল আপডেট হয়েছে: ${name}`); updateHeaderAndProfile(); triggerAccountCloudSync(); toast('প্রোফাইল সফলভাবে আপডেট ও সিঙ্ক হয়েছে!');
}
if ($('profileForm')) $('profileForm').onsubmit = e => { e.preventDefault(); saveProfileData($('profileName').value.trim(), $('profileEmail').value.trim(), $('profilePhone').value.trim(), $('profilePicInput').value.trim() || pendingProfilePicData || ''); };

if ($('settingsPasswordForm')) $('settingsPasswordForm').onsubmit = e => {
  e.preventDefault();
  const oldPass = $('settingsOldPass').value, newPass = $('settingsNewPass').value, newPass2 = $('settingsNewPass2').value, msgEl = $('settingsPasswordMsg');
  if (newPass !== newPass2) { msgEl.textContent = 'নতুন পাসওয়ার্ড দুটি মিলছে না!'; return; }
  if (newPass.length < 6) { msgEl.textContent = 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে!'; return; }
  if (activeAccount && activeAccount.id !== 'legacy-super-admin') {
    if (!checkPass(oldPass, activeAccount.password)) { msgEl.textContent = 'বর্তমান পাসওয়ার্ড সঠিক নয়!'; return; }
    activeAccount.password = hashPass(newPass); activeAccount.updatedAt = Date.now();
    const accounts = readLocalAccounts(), idx = accounts.findIndex(a => a.id === activeAccount.id);
    if (idx !== -1) { accounts[idx] = activeAccount; localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); }
    try { sessionStorage.setItem(SESSION_ACC_KEY, JSON.stringify(activeAccount)); } catch (err) {}
  } else {
    if (!checkPass(oldPass, localStorage.getItem(PASSKEY) || '123456789')) { msgEl.textContent = 'বর্তমান পাসওয়ার্ড সঠিক নয়!'; return; }
    localStorage.setItem(PASSKEY, hashPass(newPass));
  }
  const rem = decodeRemember(localStorage.getItem(REMEMBER_LOGIN_KEY));
  if (rem) localStorage.setItem(REMEMBER_LOGIN_KEY, encodeRemember({ ...rem, pass: newPass }));
  msgEl.textContent = 'পাসওয়ার্ড সফলভাবে আপডেট হয়েছে!'; logActivity('পাসওয়ার্ড পরিবর্তন করা হয়েছে');
  triggerAccountCloudSync(); e.target.reset(); toast('পাসওয়ার্ড আপডেট হয়েছে!');
};

if ($('usernameForm')) $('usernameForm').onsubmit = e => {
  e.preventDefault();
  const pass = $('userChangePass').value, newU = $('newUsername').value.trim().toLowerCase(), msgEl = $('usernameMsg');
  if (newU === 'admin') { msgEl.textContent = 'এই ইউজারনেমটি সংরক্ষিত।'; return; }
  if (activeAccount && activeAccount.id !== 'legacy-super-admin') {
    if (!checkPass(pass, activeAccount.password)) { msgEl.textContent = 'পাসওয়ার্ড সঠিক নয়!'; return; }
    const accounts = readLocalAccounts();
    if (accounts.some(a => a.id !== activeAccount.id && a.username === newU)) { msgEl.textContent = 'এই ইউজারনেম আগেই নেওয়া হয়েছে!'; return; }
    activeAccount.username = newU; activeAccount.updatedAt = Date.now();
    const idx = accounts.findIndex(a => a.id === activeAccount.id);
    if (idx !== -1) { accounts[idx] = activeAccount; localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); }
    try { sessionStorage.setItem(SESSION_ACC_KEY, JSON.stringify(activeAccount)); } catch (err) {}
    const rem = decodeRemember(localStorage.getItem(REMEMBER_LOGIN_KEY));
    if (rem) localStorage.setItem(REMEMBER_LOGIN_KEY, encodeRemember({ ...rem, identity: newU }));
    msgEl.textContent = 'ইউজারনেম সফলভাবে আপডেট হয়েছে!'; logActivity(`ইউজারনেম পরিবর্তন: ${newU}`);
    triggerAccountCloudSync(); toast('ইউজারনেম আপডেট হয়েছে!');
  } else msgEl.textContent = 'সুপার অ্যাডমিন ইউজারনেম (admin) পরিবর্তনযোগ্য নয়।';
  e.target.reset();
};

// Pixel Hub & Ad Account Health + Meta Marketing API Sync
function generatePixelCode() {
  const pid = $('genPixelId')?.value.trim() || '1234567890', event = $('genPixelEvent')?.value || 'Purchase', val = num($('genPixelVal')?.value);
  const eventSnippet = ['Purchase','AddToCart','ViewContent','InitiateCheckout'].includes(event) ? `fbq('track', '${event}', {value: ${val}, currency: 'BDT'});` : `fbq('track', '${event}');`;
  if ($('pixelCodeOutput')) $('pixelCodeOutput').textContent = `<!-- Meta Pixel Code -->\n<script>\n  !function(f,b,e,v,n,t,s)\n  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?\n  n.callMethod.apply(n,arguments):n.queue.push(arguments)};\n  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';\n  n.queue=[];t=b.createElement(e);t.async=!0;\n  t.src=v;s=b.getElementsByTagName(e)[0];\n  s.parentNode.insertBefore(t,s)}(window, document,'script',\n  'https://connect.facebook.net/en_US/fbevents.js');\n  fbq('init', '${pid}');\n  fbq('track', 'PageView');\n  ${eventSnippet}\n</` + `script>`;
}
['generatePixelBtn','genPixelId','genPixelEvent','genPixelVal'].forEach(id => { if ($(id)) $(id)[id === 'generatePixelBtn' ? 'onclick' : 'oninput'] = generatePixelCode; });
if ($('genPixelEvent')) $('genPixelEvent').onchange = generatePixelCode;
if ($('simulateCapiBtn')) $('simulateCapiBtn').onclick = () => {
  const pid = $('genPixelId').value.trim() || '1234567890', event = $('genPixelEvent').value, val = num($('genPixelVal').value);
  const capiPayload = { data: [{ event_name: event, event_time: Math.floor(Date.now() / 1000), action_source: "website", user_data: { em: ["f660ab912ec121d1b1e928a0bb4bc61b15f5ad44d5efdc4e1c92a25e99b8e44a"], ph: ["254c3d6360b0e047d3e63a8412e62444655513c1f10bc7537e28b86e00b8e99a"] }, custom_data: { currency: "BDT", value: val } }], test_event_code: "TEST1234" };
  $('pixelCodeOutput').textContent = `// Meta Conversions API (CAPI) JSON Payload\n// POST https://graph.facebook.com/v20.0/${pid}/events\n\n` + JSON.stringify(capiPayload, null, 2);
};
if ($('copyPixelBtn')) $('copyPixelBtn').onclick = () => copyText($('pixelCodeOutput').textContent, 'পিক্সেল কোড');

if ($('adAccountForm')) $('adAccountForm').onsubmit = e => {
  e.preventDefault();
  db.adAccounts.push({ id: uid(), updatedAt: Date.now(), name: $('aaName').value.trim(), adId: $('aaId').value.trim(), bm: $('aaBm').value.trim(), cardId: $('aaCard')?.value || '', threshold: num($('aaThreshold').value), unpaid: num($('aaUnpaid').value), status: $('aaStatus').value });
  save(); logActivity(`Ad Account যুক্ত: ${$('aaName').value.trim()}`); e.target.reset(); toast('Ad Account সেভ হয়েছে!');
};
window.openEditAdAccountModal = function(id) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const a = db.adAccounts.find(x => x.id === id); if (!a) return;
  refresh(); $('eaaId').value = a.id; $('eaaName').value = a.name; $('eaaAdId').value = a.adId || '';
  $('eaaBm').value = a.bm || ''; if ($('eaaCard')) $('eaaCard').value = a.cardId || '';
  $('eaaThreshold').value = num(a.threshold); $('eaaUnpaid').value = num(a.unpaid); $('eaaStatus').value = a.status || 'Active';
  $('editAdAccountModal').style.display = 'flex';
};
if ($('editAdAccountForm')) $('editAdAccountForm').onsubmit = e => {
  e.preventDefault(); if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error');
  const a = db.adAccounts.find(x => x.id === $('eaaId').value); if (!a) return;
  a.name = $('eaaName').value.trim(); a.adId = $('eaaAdId').value.trim(); a.bm = $('eaaBm').value.trim();
  if (!isStaff()) a.cardId = $('eaaCard')?.value || '';
  a.threshold = num($('eaaThreshold').value); a.unpaid = num($('eaaUnpaid').value); a.status = $('eaaStatus').value;
  a.updatedAt = Date.now(); save(); closeModal('editAdAccountModal'); toast('Ad Account আপডেট হয়েছে!');
};
window.cycleAdAccountStatus = function(id) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const a = db.adAccounts.find(x => x.id === id); if (!a) return;
  const order = ['Active', 'Payment Hold', 'Restricted', 'Disabled'];
  a.status = order[(order.indexOf(a.status) + 1) % order.length]; a.updatedAt = Date.now();
  save(); toast(`স্ট্যাটাস আপডেট: ${a.status}`);
};
window.deleteAdAccount = function(id) {
  if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error');
  const a = db.adAccounts.find(x => x.id === id); if (!a || !confirm('অ্যাড অ্যাকাউন্টটি মুছে ফেলবেন?')) return;
  moveToTrash('adAccount', `Ad Account: ${a.name}`, a); markDeleted(id);
  db.adAccounts = db.adAccounts.filter(x => x.id !== id); save(); toast('রিসাইকেল বিনে পাঠানো হয়েছে', 'warn');
};

window.syncMetaAdAccounts = async function(btn) {
  const token = db.agency?.metaToken;
  if (!token) { goToSection('settings'); return toast('সেটিংস → এজেন্সি ও API ট্যাবে গিয়ে Meta Access Token সেভ করুন!', 'warn'); }
  const targets = db.adAccounts.filter(a => a.adId && a.adId.startsWith('act_'));
  if (!targets.length) return toast('act_ দিয়ে শুরু হওয়া কোনো Ad Account ID পাওয়া যায়নি!', 'warn');
  await withBtnLoading(btn, '⏳ সিঙ্ক হচ্ছে...', async () => {
    let updated = 0;
    for (const a of targets) {
      try {
        const res = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(a.adId)}?fields=account_status,balance&access_token=${encodeURIComponent(token)}`);
        if (!res.ok) continue; const d = await res.json();
        if (d.account_status !== undefined) { const stMap = { 1: 'Active', 2: 'Disabled', 3: 'Payment Hold', 7: 'Restricted', 9: 'Restricted' }; a.status = stMap[d.account_status] || a.status; }
        if (d.balance !== undefined) a.unpaid = +(num(d.balance) / 100).toFixed(2);
        a.updatedAt = Date.now(); updated++;
      } catch (e) {}
    }
    if (updated) { save(); toast(`${updated}টি Ad Account Meta API থেকে আপডেট হয়েছে!`); }
    else toast('Meta API থেকে ডাটা পাওয়া যায়নি! টোকেন যাচাই করুন।', 'error');
  });
};

// Customers, Retainers & Pages
if ($('customerForm')) $('customerForm').onsubmit = e => {
  e.preventDefault(); const name = $('custName').value.trim();
  db.customers.push({ id: uid(), updatedAt: Date.now(), portalToken: uid().slice(-6), name, phone: $('custPhone').value.trim(), retainer: num($('custRetainer')?.value), note: $('custNote').value.trim() });
  save(); logActivity(`নতুন কাস্টমার যুক্ত: ${name}`); e.target.reset(); toast('কাস্টমার সেভ হয়েছে!');
};
window.openEditCustomerModal = function(custId) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  $('editCustId').value = c.id; $('editCustName').value = c.name; $('editCustPhone').value = c.phone || '';
  if ($('editCustRetainer')) $('editCustRetainer').value = num(c.retainer);
  $('editCustNote').value = c.note || ''; $('editCustomerModal').style.display = 'flex';
};
if ($('editCustomerForm')) $('editCustomerForm').onsubmit = e => {
  e.preventDefault(); if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error');
  const c = db.customers.find(x => x.id === $('editCustId').value);
  if (c) { c.name = $('editCustName').value.trim(); c.phone = $('editCustPhone').value.trim(); c.retainer = num($('editCustRetainer')?.value); c.note = $('editCustNote').value.trim(); c.updatedAt = Date.now(); save(); logActivity(`কাস্টমার আপডেট: ${c.name}`); closeModal('editCustomerModal'); toast('কাস্টমার আপডেট হয়েছে!'); }
};
window.generateRetainerBills = function() {
  if (!hasPerm('canEdit')) return toast('আপনার অনুমতি নেই!', 'error');
  const ym = today().slice(0, 7);
  const eligible = db.customers.filter(c => num(c.retainer) > 0 && !db.works.some(w => w.customerId === c.id && w.retainerYm === ym));
  if (!eligible.length) return toast(`চলতি মাসের (${ym}) রিটেইনার বিল ইতিমধ্যেই তৈরি হয়েছে বা কোনো রিটেইনার কাস্টমার নেই!`, 'warn');
  if (!confirm(`${eligible.length} জন কাস্টমারের জন্য ${ym} মাসের রিটেইনার বিল তৈরি করবেন?`)) return;
  eligible.forEach(c => {
    const pg = db.pages.find(p => p.customerId === c.id)?.id || '';
    db.works.push({ id: uid(), updatedAt: Date.now(), date: today(), customerId: c.id, pageId: pg, name: `Monthly Retainer (${ym})`, retainerYm: ym, days: 30, dollar: 0, rate: 1, actualDollar: 0, serviceFee: num(c.retainer), serviceFeeType: 'fixed', cardId: '', actualRate: 0, feePct: 0, other: 0, status: 'completed', note: 'Auto Monthly Retainer' });
  });
  save(); logActivity(`মাসিক রিটেইনার বিল তৈরি (${eligible.length} জন)`); toast(`${eligible.length}টি রিটেইনার বিল তৈরি হয়েছে!`);
};
window.deleteCustomer = function(custId) {
  if (!hasPerm('canDelete')) return toast('আপনার ডিলিট করার অনুমতি নেই!', 'error');
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  if (!confirm(`"${c.name}" এবং এর সাথে যুক্ত সকল পেজ, কাজ ও পেমেন্ট রিসাইকেল বিনে পাঠাতে চান?`)) return;
  const relPages = db.pages.filter(x => x.customerId === custId), relWorks = db.works.filter(x => x.customerId === custId), relPays = db.payments.filter(x => x.customerId === custId);
  moveToTrash('customer_bundle', `কাস্টমার: ${c.name}`, { customer: c, pages: relPages, works: relWorks, payments: relPays });
  markDeleted(custId); relPages.forEach(p => markDeleted(p.id)); relWorks.forEach(w => markDeleted(w.id)); relPays.forEach(p => markDeleted(p.id));
  db.customers = db.customers.filter(x => x.id !== custId); db.pages = db.pages.filter(x => x.customerId !== custId);
  db.works = db.works.filter(x => x.customerId !== custId); db.payments = db.payments.filter(x => x.customerId !== custId);
  delete db.reminderLogs[custId]; save(); logActivity(`কাস্টমার ট্র্যাশে: ${c.name}`); toast('কাস্টমার রিসাইকেল বিনে পাঠানো হয়েছে', 'warn');
};

if ($('pageForm')) $('pageForm').onsubmit = e => {
  e.preventDefault(); const name = $('pageName').value.trim();
  db.pages.push({ id: uid(), updatedAt: Date.now(), customerId: $('pageCustomer').value, name, link: $('pageLink').value.trim(), adId: $('pageAdId').value.trim(), pixelId: $('pagePixelId').value.trim() });
  save(); logActivity(`নতুন পেজ যুক্ত: ${name}`); e.target.reset(); toast('পেজ সেভ হয়েছে!');
};
window.openEditPageModal = function(pageId) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const p = db.pages.find(x => x.id === pageId); if (!p) return;
  $('editPageId').value = p.id; $('editPageName').value = p.name; $('editPageLink').value = p.link || ''; $('editPageAdId').value = p.adId || ''; $('editPagePixelId').value = p.pixelId || '';
  $('editPageModal').style.display = 'flex';
};
if ($('editPageForm')) $('editPageForm').onsubmit = e => {
  e.preventDefault(); const p = db.pages.find(x => x.id === $('editPageId').value);
  if (p) { p.name = $('editPageName').value.trim(); p.link = $('editPageLink').value.trim(); p.adId = $('editPageAdId').value.trim(); p.pixelId = $('editPagePixelId').value.trim(); p.updatedAt = Date.now(); save(); closeModal('editPageModal'); toast('পেজ আপডেট হয়েছে!'); }
};
window.deletePage = function(pageId) {
  if (!hasPerm('canDelete')) return toast('আপনার ডিলিট করার অনুমতি নেই!', 'error');
  const p = db.pages.find(x => x.id === pageId); if (!p || !confirm('পেজটি রিসাইকেল বিনে পাঠাবেন?')) return;
  moveToTrash('page', `পেজ: ${p.name}`, p); markDeleted(pageId); db.pages = db.pages.filter(x => x.id !== pageId); save(); toast('পেজ রিসাইকেল বিনে পাঠানো হয়েছে', 'warn');
};

// Client Profile, Portal & Summary
window.copyClientSummaryText = function(custId) {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const b = billed(custId), p = paid(custId), bal = p - b, works = db.works.filter(w => w.customerId === custId), totUsd = works.reduce((s, w) => s + num(w.actualDollar), 0);
  const balLine = bal < 0 ? `🔴 বকেয়া বাকি: ${money(-bal)}` : (bal > 0 ? `🟢 অ্যাডভান্স জমা: ${money(bal)}` : `✅ ব্যালেন্স: ৳0.00 (সমন্বিত)`);
  const recent = [...works].sort(byDateDesc).slice(0, 5).map(w => `• ${w.date}: ${w.name} (${usd(w.actualDollar)}) = ${money(bill(w))}`).join('\n');
  copyText(`📊 *হিসাবের সারাংশ — ${c.name}*\nএজেন্সি: ${db.agency?.name || 'Ads হিসাব ম্যানেজার'}\n\nমোট ব্যয়কৃত ডলার: ${usd(totUsd)}\nমোট বিল: ${money(b)}\nমোট জমা: ${money(p)}\n${balLine}\n\nসাম্প্রতিক কাজ:\n${recent || '—'}\n\n${db.agency?.payInfo ? '💳 পেমেন্ট মাধ্যম: ' + db.agency.payInfo : ''}`, 'ক্লায়েন্ট রিপোর্ট টেক্সট');
};

window.shareClientPortalLink = async function(custId, btn) {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const cfg = readCloudSync();
  if (!cfg.url) return toast('শেয়ারযোগ্য লাইভ পোর্টাল লিংক তৈরি করতে Admin Panel-এ Firebase URL সেভ করুন!', 'warn');
  if (!c.portalToken) { c.portalToken = uid().slice(-6); c.updatedAt = Date.now(); save(); }
  await withBtnLoading(btn, '⏳ তৈরি হচ্ছে...', async () => {
    const portalKey = `${c.id}_${c.portalToken}`;
    const payload = {
      updatedAt: new Date().toLocaleString('bn-BD'), agencyName: db.agency?.name || 'Ads হিসাব ম্যানেজার',
      agencyPhone: db.agency?.phone || '', payInfo: db.agency?.payInfo || '', customerName: c.name,
      totalBill: billed(custId), totalPaid: paid(custId), balance: clientBalance(custId),
      works: db.works.filter(w => w.customerId === custId).sort(byDateDesc).map(w => ({ date: w.date, name: w.name, page: pname(w.pageId), budget: num(w.dollar), spentUsd: num(w.actualDollar), bill: bill(w), status: w.status })),
      payments: db.payments.filter(p => p.customerId === custId).sort(byDateDesc).map(p => ({ date: p.date, amount: num(p.amount), method: p.method, ref: p.ref || '' }))
    };
    const endpoint = `${cfg.url.trim().replace(/\/+$/, '')}/ads_hisab_portals/${portalKey}.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '');
    try {
      const res = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      copyText(`${location.origin}${location.pathname}?portal=${encodeURIComponent(portalKey)}`, 'ক্লায়েন্ট পোর্টাল লিংক');
    } catch (err) { toast('পোর্টাল লিংক আপলোড করতে সমস্যা হয়েছে!', 'error'); }
  });
};

window.exportClientLedgerCsv = function(custId) {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const entries = [
    ...db.works.filter(w => w.customerId === custId).map(w => ({ date: w.date, desc: `কাজ: ${w.name}`, debit: bill(w), credit: 0 })),
    ...db.payments.filter(p => p.customerId === custId).map(p => ({ date: p.date, desc: `পেমেন্ট (${p.method}) ${p.ref || ''}`, debit: 0, credit: num(p.amount) }))
  ].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let bal = 0; const rows = [['Date', 'Description', 'Bill / Debit (BDT)', 'Paid / Credit (BDT)', 'Running Balance (BDT)']];
  entries.forEach(en => { bal += en.credit - en.debit; rows.push([en.date, en.desc, en.debit.toFixed(2), en.credit.toFixed(2), bal.toFixed(2)]); });
  downloadBlob('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), `ledger_${c.name.replace(/\s+/g, '_')}_${today()}.csv`, 'text/csv;charset=utf-8;');
  toast('লেজার স্টেটমেন্ট CSV ডাউনলোড হয়েছে!');
};

window.openClientProfile = function(custId) {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const cPages = db.pages.filter(p => p.customerId === custId), cWorks = db.works.filter(w => w.customerId === custId), cPays = db.payments.filter(p => p.customerId === custId);
  const totalB = billed(custId), totalP = paid(custId), bal = clientBalance(custId);
  const totalUsd = cWorks.reduce((s, w) => s + num(w.actualDollar), 0), totalProf = cWorks.reduce((s, w) => s + profit(w), 0);
  let balBadge = `<span class="badge-success">সমন্বিত (৳0.00)</span>`;
  if (bal < 0) balBadge = `<span class="badge-danger">বকেয়া বাকি: ${money(-bal)}</span>`;
  else if (bal > 0) balBadge = `<span class="badge-success">অ্যাডভান্স জমা: ${money(bal)}</span>`;
  const ledger = [
    ...cWorks.map(w => ({ date: w.date, desc: `ক্যাম্পেইন: ${w.name} (${usd(w.actualDollar)})`, debit: bill(w), credit: 0 })),
    ...cPays.map(p => ({ date: p.date, desc: `পেমেন্ট (${p.method})${p.ref ? ' · ' + p.ref : ''}`, debit: 0, credit: num(p.amount) }))
  ].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let runBal = 0;
  const ledgerHtml = ledger.map(row => { runBal += row.credit - row.debit; const bTxt = runBal < 0 ? `<span class="bad">বকেয়া ${money(-runBal)}</span>` : (runBal > 0 ? `<span class="good">অ্যাড ${money(runBal)}</span>` : `৳0.00`); return `<tr><td>${esc(row.date)}</td><td>${esc(row.desc)}</td><td class="bad">${row.debit ? money(row.debit) : '—'}</td><td class="good">${row.credit ? money(row.credit) : '—'}</td><td>${bTxt}</td></tr>`; }).join('') || '<tr><td colspan="5">কোনো লেনদেন নেই</td></tr>';

  $('cpTitle').textContent = `👤 ${c.name} — প্রোফাইল ও লেজার`;
  $('cpBody').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px;padding:12px;background:var(--soft);border-radius:12px;border:1px solid var(--line)">
      <div style="font-size:13px;line-height:1.7"><strong>মোবাইল:</strong> ${esc(c.phone || '—')} · <strong>মাসিক রিটেইনার:</strong> ${num(c.retainer) ? money(c.retainer) : 'নেই'}<br><strong>নোট:</strong> ${esc(c.note || '—')} · <strong>মোট ব্যয়কৃত ডলার:</strong> ${usd(totalUsd)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="secondary sm" onclick="closeModal('clientProfileModal');openInvoice('${c.id}')">📄 ইনভয়েস</button>
        <button type="button" class="secondary sm" onclick="shareClientPortalLink('${c.id}', this)">🔗 পোর্টাল লিংক</button>
        <button type="button" class="secondary sm" onclick="copyClientSummaryText('${c.id}')">📋 টেক্সট সামারি</button>
        <button type="button" class="secondary sm" onclick="exportClientLedgerCsv('${c.id}')">📥 লেজার CSV</button>
        <button type="button" class="secondary sm" onclick="sendWhatsAppReminder('${c.id}')">📲 WhatsApp</button>
        <button type="button" class="secondary sm perm-edit" onclick="closeModal('clientProfileModal');openEditCustomerModal('${c.id}')">✏️ এডিট</button>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap"><span class="badge-admin">মোট বিল: ${money(totalB)}</span><span class="badge-success">মোট আদায়: ${money(totalP)}</span>${balBadge} ${isStaff() ? '' : `<span class="badge-status status-running">নিট প্রফিট: ${money(totalProf)}</span>`}</div>
    <h4>📄 যুক্ত থাকা ফেসবুক পেজ ও পিক্সেল (${cPages.length})</h4>
    <ul style="font-size:13px;padding-left:20px;margin-bottom:16px;line-height:1.8">${cPages.map(p => `<li><strong>${esc(p.name)}</strong> ${p.link ? `(<a href="${esc(p.link)}" target="_blank">লিংক ↗</a>)` : ''} — Ad ID: <code>${esc(p.adId || 'N/A')}</code>, Pixel: <code>${esc(p.pixelId || 'N/A')}</code></li>`).join('') || '<li>কোনো পেজ যুক্ত নেই</li>'}</ul>
    <h4>📑 তারিখ অনুযায়ী লেজার স্টেটমেন্ট</h4>
    <div class="tablewrap" style="max-height:240px;margin-bottom:16px"><table><thead><tr><th>তারিখ</th><th>বিবরণ</th><th>বিল (ডেবিট)</th><th>জমা (ক্রেডিট)</th><th>ব্যালেন্স</th></tr></thead><tbody>${ledgerHtml}</tbody></table></div>
    <h4>⚡ ক্যাম্পেইনসমূহ (${cWorks.length})</h4>
    <div class="tablewrap" style="max-height:170px"><table><thead><tr><th>তারিখ</th><th>কাজ</th><th>বাজেট / ব্যবহৃত $</th><th>মোট বিল</th><th>স্ট্যাটাস</th></tr></thead><tbody>${cWorks.map(w => `<tr><td>${esc(w.date)}</td><td>${esc(w.name)}</td><td>${usd(w.dollar)} / <strong>${usd(w.actualDollar)}</strong></td><td>${money(bill(w))}</td><td>${esc(w.status)}</td></tr>`).join('') || '<tr><td colspan="5">কোনো কাজ নেই</td></tr>'}</tbody></table></div>`;
  $('clientProfileModal').style.display = 'flex';
};

// Money Receipt Modal (Print / POS / PNG / WhatsApp)
let currentReceiptPayId = null;
window.openPaymentReceipt = function(payId) {
  const p = db.payments.find(x => x.id === payId); if (!p) return;
  const c = db.customers.find(x => x.id === p.customerId) || { name: 'কাস্টমার', phone: '' };
  currentReceiptPayId = payId;
  const ag = db.agency || {}, bal = clientBalance(p.customerId);
  if ($('rcpLogoImg')) { if (ag.logoUrl) { $('rcpLogoImg').src = ag.logoUrl; $('rcpLogoImg').style.display = 'block'; } else $('rcpLogoImg').style.display = 'none'; }
  $('rcpAgencyName').textContent = ag.name || 'Ads হিসাব ম্যানেজার';
  $('rcpAgencyContact').textContent = ag.phone ? `যোগাযোগ: ${ag.phone}` : 'মানি রিসিপ্ট / পেমেন্ট রসিদ';
  $('rcpNo').textContent = '#RCP-' + payId.slice(-5).toUpperCase();
  $('rcpDate').textContent = 'তারিখ: ' + (p.date || today());
  $('rcpCustName').textContent = c.name; $('rcpCustPhone').textContent = c.phone || '—';
  $('rcpAmount').textContent = money(p.amount); $('rcpMethod').textContent = p.method || 'Cash';
  $('rcpRef').textContent = p.ref || '—'; $('rcpNote').textContent = p.note || '—';
  $('rcpCustBill').textContent = money(billed(p.customerId));
  $('rcpCustPaid').textContent = money(paid(p.customerId));
  $('rcpCustBal').innerHTML = bal < 0 ? `বকেয়া: <strong class="bad">${money(-bal)}</strong>` : (bal > 0 ? `অ্যাডভান্স: <strong class="good">${money(bal)}</strong>` : `ব্যালেন্স: <strong class="good">৳0.00</strong>`);
  if ($('rcpSignWrap') && $('rcpSignText')) { $('rcpSignWrap').style.display = ag.signText ? 'flex' : 'none'; $('rcpSignText').textContent = ag.signText || 'Authorized'; }
  $('receiptModal').style.display = 'flex';
};
window.printReceipt = function(isPos = false) {
  document.body.classList.add('printing-receipt'); if (isPos) document.body.classList.add('printing-pos');
  window.print(); setTimeout(() => { document.body.classList.remove('printing-receipt', 'printing-pos'); }, 400);
};
window.sendReceiptWhatsApp = function() {
  const p = db.payments.find(x => x.id === currentReceiptPayId); if (!p) return;
  const c = db.customers.find(x => x.id === p.customerId); const wa = normalizeBdPhone(c?.phone);
  if (!wa) return toast('কাস্টমারের সঠিক মোবাইল নম্বর নেই!', 'error');
  const bal = clientBalance(p.customerId), balTxt = bal < 0 ? `বর্তমান বকেয়া: ${money(-bal)}` : (bal > 0 ? `অ্যাডভান্স জমা: ${money(bal)}` : `হিসাব সম্পূর্ণ সমন্বিত (৳0.00)`);
  const msg = `আসসালামু আলাইকুম ${c.name}, ${db.agency?.name || 'Ads হিসাব ম্যানেজার'} থেকে জানাচ্ছি—তারিখ ${p.date}-এ আপনার ${money(p.amount)} (${p.method}${p.ref ? ', Ref: ' + p.ref : ''}) পেমেন্ট সফলভাবে গ্রহণ করা হয়েছে। ${balTxt}। ধন্যবাদ!`;
  window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank');
};
window.downloadReceiptPng = async function() {
  const p = db.payments.find(x => x.id === currentReceiptPayId); if (!p) return;
  const c = db.customers.find(x => x.id === p.customerId) || { name: 'কাস্টমার', phone: '' }, ag = db.agency || {};
  const logoImg = await loadImgCors(ag.logoUrl), bal = clientBalance(p.customerId);
  const W = 560, H = 370, canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#059669'; ctx.fillRect(0, 0, W, 10);
  let tx = 30; if (logoImg) { try { ctx.drawImage(logoImg, 30, 22, 42, 42); tx = 82; } catch (e) {} }
  ctx.fillStyle = '#059669'; ctx.font = 'bold 20px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(ag.name || 'Ads হিসাব ম্যানেজার', tx, 44);
  ctx.fillStyle = '#64748b'; ctx.font = '12.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText('মানি রিসিপ্ট / পেমেন্ট রসিদ', tx, 64);
  ctx.textAlign = 'right'; ctx.fillStyle = '#0f172a'; ctx.font = 'bold 13px Arial, sans-serif'; ctx.fillText(`#RCP-${p.id.slice(-5).toUpperCase()}`, W - 30, 42);
  ctx.fillStyle = '#64748b'; ctx.font = '12px Arial, sans-serif'; ctx.fillText(`তারিখ: ${p.date}`, W - 30, 62);
  ctx.textAlign = 'left'; ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(30, 82); ctx.lineTo(W - 30, 82); ctx.stroke();

  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 15px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`কাস্টমার: ${c.name}`, 30, 114);
  ctx.fillStyle = '#475569'; ctx.font = '13px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`মোবাইল: ${c.phone || '—'}`, 30, 136);
  ctx.fillStyle = '#ecfdf5'; ctx.fillRect(30, 154, W - 60, 54);
  ctx.fillStyle = '#065f46'; ctx.font = 'bold 18px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`গ্রহণকৃত টাকা: ${money(p.amount)}`, 46, 187);
  ctx.fillStyle = '#1e293b'; ctx.font = '13px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText(`মাধ্যম: ${p.method || 'Cash'}   |   রেফারেন্স: ${p.ref || '—'}`, 30, 234);
  if (p.note) ctx.fillText(`নোট: ${String(p.note).slice(0, 56)}`, 30, 256);

  ctx.fillStyle = '#f8fafc'; ctx.fillRect(30, 274, W - 60, 44); ctx.strokeStyle = '#cbd5e1'; ctx.strokeRect(30, 274, W - 60, 44);
  ctx.font = 'bold 13px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillStyle = '#0f172a'; ctx.fillText(`মোট বিল: ${money(billed(p.customerId))}`, 42, 301);
  ctx.textAlign = 'right'; ctx.fillStyle = bal < 0 ? '#dc2626' : '#059669'; ctx.fillText(bal < 0 ? `বকেয়া: ${money(-bal)}` : (bal > 0 ? `অ্যাডভান্স: ${money(bal)}` : `ব্যালেন্স: ৳0.00`), W - 42, 301);
  ctx.textAlign = 'center'; ctx.fillStyle = '#64748b'; ctx.font = '11.5px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText('পেমেন্ট করার জন্য ধন্যবাদ!', W / 2, H - 18);
  canvas.toBlob(blob => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `receipt_${c.name.replace(/\s+/g, '_')}_${p.date}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('মানি রিসিপ্ট PNG ডাউনলোড হয়েছে!'); }, 'image/png');
};

// Invoice Modal + PNG Word Wrap + POS 80mm Print + Terms
let currentInvoiceCustId = null;
function getInvoiceFilteredData(custId) {
  const from = $('invFrom')?.value || '', to = $('invTo')?.value || '';
  const allWorks = db.works.filter(w => w.customerId === custId), allPays = db.payments.filter(p => p.customerId === custId);
  const prevBill = from ? allWorks.filter(w => String(w.date || '') < from).reduce((s, w) => s + bill(w), 0) : 0;
  const prevPaid = from ? allPays.filter(p => String(p.date || '') < from).reduce((s, p) => s + num(p.amount), 0) : 0;
  const openingBal = prevPaid - prevBill;
  const custWorks = allWorks.filter(w => inDateRange(w.date, from, to));
  const custPays = allPays.filter(p => inDateRange(p.date, from, to)).sort(byDateDesc);
  const b = custWorks.reduce((s, w) => s + bill(w), 0), p = custPays.reduce((s, pay) => s + num(pay.amount), 0);
  return { from, to, openingBal, custWorks, custPays, b, p, bal: openingBal + p - b };
}

window.openInvoice = function(custId, keepDates = false) {
  const customer = db.customers.find(c => c.id === custId); if (!customer) return;
  currentInvoiceCustId = custId;
  if (!keepDates) { if ($('invFrom')) $('invFrom').value = ''; if ($('invTo')) $('invTo').value = ''; }
  const ag = db.agency || {};
  if ($('invLogoImg')) { if (ag.logoUrl) { $('invLogoImg').src = ag.logoUrl; $('invLogoImg').style.display = 'block'; } else $('invLogoImg').style.display = 'none'; }
  if ($('invQrImg')) { if (ag.qrUrl) { $('invQrImg').src = ag.qrUrl; $('invQrImg').style.display = 'block'; } else $('invQrImg').style.display = 'none'; }
  $('invAgencyName').textContent = ag.name || 'Ads হিসাব ম্যানেজার';
  $('invAgencyContact').textContent = ag.phone ? `যোগাযোগ: ${ag.phone}` : 'প্রফেশনাল ইনভয়েস ও ক্যাশ মেমো';
  $('invDate').textContent = 'তারিখ: ' + today();
  $('invId').textContent = 'ইনভয়েস নং: #INV-' + custId.slice(-5).toUpperCase();
  $('invCustName').textContent = customer.name; $('invCustPhone').textContent = 'ফোন: ' + (customer.phone || '—');

  const { from, to, openingBal, custWorks, custPays, b, p, bal } = getInvoiceFilteredData(custId);
  if ($('invPeriodLabel')) $('invPeriodLabel').textContent = (from || to) ? `সময়কাল: ${from || 'শুরু'} থেকে ${to || 'আজ'}` : '';
  if ($('invOpeningRow')) {
    if (from && openingBal !== 0) {
      $('invOpeningRow').style.display = 'block';
      $('invOpeningRow').innerHTML = openingBal < 0 ? `📌 <strong>পূর্বের বকেয়া জের (${esc(from)}-এর আগে):</strong> <span class="bad">${money(-openingBal)}</span>` : `📌 <strong>পূর্বের অ্যাডভান্স জের (${esc(from)}-এর আগে):</strong> <span class="good">${money(openingBal)}</span>`;
    } else $('invOpeningRow').style.display = 'none';
  }
  const stamp = $('invStatusStamp');
  if (bal > 0) { stamp.textContent = 'ADVANCE PAID'; stamp.className = 'badge-success'; }
  else if ((b > 0 || openingBal < 0) && bal === 0) { stamp.textContent = 'PAID'; stamp.className = 'badge-success'; }
  else if (p > 0 && bal < 0) { stamp.textContent = 'PARTIAL'; stamp.className = 'badge-status status-running'; }
  else { stamp.textContent = 'DUE'; stamp.className = 'badge-danger'; }

  $('invRows').innerHTML = custWorks.map(w => { const svc = workServiceCharge(w); return `<tr><td>${esc(w.date)}</td><td>${esc(w.name)} (${esc(pname(w.pageId) || 'Page')})</td><td>${usd(w.actualDollar)} × ${money(w.rate)}${svc ? ` + চার্জ ${money(svc)}` : ''}</td><td>${money(bill(w))}</td></tr>`; }).join('') || `<tr><td colspan="4">নির্বাচিত সময়ে কোনো কাজের রেকর্ড নেই</td></tr>`;
  $('invTotalBill').textContent = money(b); $('invTotalPaid').textContent = money(p);
  if ($('invPayWrap') && $('invPayRows')) { $('invPayWrap').style.display = custPays.length ? 'block' : 'none'; $('invPayRows').innerHTML = custPays.slice(0, 12).map(pay => `<tr><td>${esc(pay.date)}</td><td>${esc(pay.method)}</td><td>${esc(pay.ref || pay.note || '—')}</td><td class="good">${money(pay.amount)}</td></tr>`).join(''); }
  if (bal > 0) $('invBalanceBox').innerHTML = `সর্বমোট অ্যাডভান্স: <strong style="color:#059669">${money(bal)}</strong>`;
  else $('invBalanceBox').innerHTML = `সর্বমোট বকেয়া: <strong id="invTotalDue" style="color:#dc2626">${money(Math.max(0, -bal))}</strong>`;
  if ($('invPayInfoBox')) { if (ag.payInfo) { $('invPayInfoBox').style.display = 'block'; $('invPayInfoBox').innerHTML = `<strong>💳 পেমেন্ট মাধ্যম:</strong> ${esc(ag.payInfo)}`; } else $('invPayInfoBox').style.display = 'none'; }
  if ($('invTermsBox')) { if (ag.termsText) { $('invTermsBox').style.display = 'block'; $('invTermsBox').innerHTML = `<strong>📝 শর্তাবলি:</strong> ${esc(ag.termsText)}`; } else $('invTermsBox').style.display = 'none'; }
  if ($('invSignWrap') && $('invSignText')) { $('invSignWrap').style.display = ag.signText ? 'flex' : 'none'; $('invSignText').textContent = ag.signText || 'Authorized Signature'; }
  $('invoiceModal').style.display = 'flex';
};
if ($('invApplyBtn')) $('invApplyBtn').onclick = () => { if (currentInvoiceCustId) openInvoice(currentInvoiceCustId, true); };
if ($('invResetBtn')) $('invResetBtn').onclick = () => { if (currentInvoiceCustId) openInvoice(currentInvoiceCustId, false); };

window.printInvoice = function(isPos = false) {
  document.body.classList.add('printing-invoice'); if (isPos) document.body.classList.add('printing-pos');
  window.print(); setTimeout(() => { document.body.classList.remove('printing-invoice', 'printing-pos'); }, 400);
};
function loadImgCors(src) {
  return new Promise(resolve => { if (!src) return resolve(null); const img = new Image(); if (!src.startsWith('data:')) img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; });
}
function wrapTextLines(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/), lines = []; let cur = '';
  for (const w of words) { const test = cur ? cur + ' ' + w : w; if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = test; }
  if (cur) lines.push(cur); return lines.length ? lines : [''];
}

window.downloadInvoicePng = async function() {
  const customer = db.customers.find(c => c.id === currentInvoiceCustId); if (!customer) return;
  const { from, to, openingBal, custWorks, custPays, b, p, bal } = getInvoiceFilteredData(customer.id);
  const ag = db.agency || {}, shownPays = custPays.slice(0, 6);
  const [logoImg, qrImg] = await Promise.all([loadImgCors(ag.logoUrl), loadImgCors(ag.qrUrl)]);

  const W = 820, mCanvas = document.createElement('canvas'), mCtx = mCanvas.getContext('2d');
  mCtx.font = '13px Inter, "Noto Sans Bengali", Arial, sans-serif';
  const workWrapped = custWorks.map(w => ({ w, lines: wrapTextLines(mCtx, w.name || '', 280) }));
  const worksTotalH = custWorks.length ? workWrapped.reduce((s, x) => s + Math.max(32, 14 + x.lines.length * 18), 0) : 32;
  const payInfoLines = ag.payInfo ? wrapTextLines(mCtx, ag.payInfo, qrImg ? W - 210 : W - 110) : [];
  const termsLines = ag.termsText ? wrapTextLines(mCtx, 'শর্তাবলি: ' + ag.termsText, W - 100) : [];
  const openH = (from && openingBal !== 0) ? 34 : 0, paySectionH = shownPays.length ? (56 + shownPays.length * 28) : 0;
  const payInfoH = (payInfoLines.length || qrImg) ? Math.max(82, 42 + payInfoLines.length * 18) : 0;
  const termsH = termsLines.length ? (18 + termsLines.length * 16) : 0, signH = ag.signText ? 36 : 0;
  const H = 370 + openH + worksTotalH + paySectionH + payInfoH + termsH + signH;

  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2563eb'; ctx.fillRect(0, 0, W, 10);

  let titleX = 40; if (logoImg) { try { ctx.drawImage(logoImg, 40, 24, 46, 46); titleX = 96; } catch (e) {} }
  ctx.fillStyle = '#2563eb'; ctx.font = 'bold 24px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(ag.name || 'Ads হিসাব ম্যানেজার', titleX, 50);
  ctx.fillStyle = '#64748b'; ctx.font = '13.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(ag.phone ? `যোগাযোগ: ${ag.phone}` : 'প্রফেশনাল ইনভয়েস ও ক্যাশ মেমো', titleX, 74);

  ctx.textAlign = 'right'; ctx.fillStyle = '#0f172a'; ctx.font = 'bold 15px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`তারিখ: ${today()}`, W - 40, 48);
  ctx.fillStyle = '#64748b'; ctx.font = '13px Inter, Arial, sans-serif'; ctx.fillText(`ইনভয়েস: #INV-${customer.id.slice(-5).toUpperCase()}`, W - 40, 70);
  const statusText = bal > 0 ? 'ADVANCE' : ((b > 0 || openingBal < 0) && bal === 0 ? 'PAID' : (p > 0 ? 'PARTIAL' : 'DUE'));
  ctx.fillStyle = bal >= 0 && (b > 0 || p > 0) ? '#059669' : '#dc2626'; ctx.font = 'bold 14px Arial, sans-serif'; ctx.fillText(`[ ${statusText} ]`, W - 40, 92);

  ctx.textAlign = 'left'; ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(40, 108); ctx.lineTo(W - 40, 108); ctx.stroke();
  ctx.fillStyle = '#475569'; ctx.font = 'bold 13px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText('কাস্টমার বিবরণ:', 40, 134);
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 18px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(customer.name, 40, 159);
  ctx.fillStyle = '#475569'; ctx.font = '13px Inter, Arial, sans-serif'; ctx.fillText(`ফোন: ${customer.phone || '—'}`, 40, 180);
  if (from || to) { ctx.textAlign = 'right'; ctx.fillStyle = '#64748b'; ctx.fillText(`সময়কাল: ${from || 'শুরু'} - ${to || 'আজ'}`, W - 40, 180); ctx.textAlign = 'left'; }

  let y = 200;
  if (openH) { ctx.fillStyle = '#f8fafc'; ctx.fillRect(40, y, W - 80, 28); ctx.fillStyle = openingBal < 0 ? '#dc2626' : '#059669'; ctx.font = 'bold 13px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(openingBal < 0 ? `পূর্বের বকেয়া জের (${from}-এর আগে): ${money(-openingBal)}` : `পূর্বের অ্যাডভান্স (${from}-এর আগে): ${money(openingBal)}`, 52, y + 19); y += 34; }
  ctx.fillStyle = '#f1f5f9'; ctx.fillRect(40, y, W - 80, 32); ctx.fillStyle = '#334155'; ctx.font = 'bold 13px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText('তারিখ', 52, y + 21); ctx.fillText('কাজের বিবরণ', 155, y + 21); ctx.fillText('ডলার × রেট', 455, y + 21); ctx.textAlign = 'right'; ctx.fillText('বিল (৳)', W - 52, y + 21); ctx.textAlign = 'left'; y += 32;

  if (!custWorks.length) { ctx.fillStyle = '#64748b'; ctx.font = '13px Inter, Arial, sans-serif'; ctx.fillText('কোনো কাজের রেকর্ড নেই', 52, y + 21); y += 32; }
  else {
    workWrapped.forEach(({ w, lines }, idx) => {
      const rh = Math.max(32, 14 + lines.length * 18);
      if (idx % 2 === 1) { ctx.fillStyle = '#f8fafc'; ctx.fillRect(40, y, W - 80, rh); }
      ctx.fillStyle = '#1e293b'; ctx.font = '13px Inter, "Noto Sans Bengali", Arial, sans-serif';
      ctx.fillText(w.date || '', 52, y + 21); lines.forEach((ln, li) => ctx.fillText(ln, 155, y + 21 + li * 18));
      const svc = workServiceCharge(w);
      ctx.fillText(`${usd(w.actualDollar)} × ${num(w.rate)}${svc ? ` + ${money(svc)}` : ''}`, 455, y + 21);
      ctx.textAlign = 'right'; ctx.fillText(money(bill(w)), W - 52, y + 21); ctx.textAlign = 'left'; y += rh;
    });
  }

  if (shownPays.length) {
    y += 14; ctx.fillStyle = '#334155'; ctx.font = 'bold 13px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText('আদায়কৃত পেমেন্ট বিবরণ:', 40, y + 12); y += 22;
    ctx.fillStyle = '#ecfdf5'; ctx.fillRect(40, y, W - 80, 26); ctx.fillStyle = '#065f46'; ctx.font = 'bold 12px Inter, "Noto Sans Bengali", Arial, sans-serif';
    ctx.fillText('তারিখ', 52, y + 17); ctx.fillText('মাধ্যম', 175, y + 17); ctx.fillText('রেফারেন্স', 310, y + 17); ctx.textAlign = 'right'; ctx.fillText('জমা (৳)', W - 52, y + 17); ctx.textAlign = 'left'; y += 26;
    shownPays.forEach(pay => { ctx.fillStyle = '#1e293b'; ctx.font = '12.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(pay.date || '', 52, y + 19); ctx.fillText(pay.method || '', 175, y + 19); ctx.fillText(String(pay.ref || pay.note || '—').slice(0, 28), 310, y + 19); ctx.textAlign = 'right'; ctx.fillStyle = '#059669'; ctx.fillText(money(pay.amount), W - 52, y + 19); ctx.textAlign = 'left'; y += 28; });
  }

  y += 16; ctx.fillStyle = '#f8fafc'; ctx.fillRect(40, y, W - 80, 50); ctx.strokeStyle = '#cbd5e1'; ctx.strokeRect(40, y, W - 80, 50);
  ctx.font = 'bold 14px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillStyle = '#0f172a'; ctx.fillText(`নির্বাচিত বিল: ${money(b)}`, 56, y + 30);
  ctx.fillStyle = '#059669'; ctx.fillText(`নির্বাচিত আদায়: ${money(p)}`, 315, y + 30); ctx.textAlign = 'right';
  if (bal > 0) { ctx.fillStyle = '#059669'; ctx.fillText(`মোট অ্যাডভান্স: ${money(bal)}`, W - 56, y + 30); }
  else { ctx.fillStyle = '#dc2626'; ctx.fillText(`সর্বমোট বকেয়া: ${money(Math.max(0, -bal))}`, W - 56, y + 30); }
  y += 50;

  if (payInfoLines.length || qrImg) {
    y += 12;
    if (payInfoLines.length) { const boxH = Math.max(54, 34 + payInfoLines.length * 18); ctx.fillStyle = '#eff6ff'; ctx.fillRect(40, y, qrImg ? W - 170 : W - 80, boxH); ctx.textAlign = 'left'; ctx.fillStyle = '#1e3a8a'; ctx.font = 'bold 12.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText('পেমেন্ট মাধ্যম:', 52, y + 20); ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif'; payInfoLines.forEach((ln, li) => ctx.fillText(ln, 52, y + 38 + li * 18)); }
    if (qrImg) { try { ctx.drawImage(qrImg, W - 116, y - 2, 74, 74); } catch (e) {} }
    y += payInfoH;
  }
  if (termsLines.length) {
    ctx.textAlign = 'left'; ctx.fillStyle = '#475569'; ctx.font = '11.5px Inter, "Noto Sans Bengali", Arial, sans-serif';
    termsLines.forEach((ln, li) => ctx.fillText(ln, 44, y + 14 + li * 16));
  }
  if (ag.signText) { ctx.textAlign = 'right'; ctx.fillStyle = '#334155'; ctx.font = 'bold 12px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`স্বাক্ষর: ${ag.signText}`, W - 44, H - 38); }
  ctx.textAlign = 'center'; ctx.fillStyle = '#64748b'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText('ধন্যবাদ! আপনার ব্যবসার সফলতা কামনা করছি।', W / 2, H - 14);

  canvas.toBlob(blob => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `invoice_${customer.name.replace(/\s+/g, '_')}_${today()}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('ইনভয়েস ছবি (PNG) ডাউনলোড হয়েছে!'); }, 'image/png');
};

// Cards, Deposits, Transfers & Refunds
if ($('addCardForm')) $('addCardForm').onsubmit = e => {
  e.preventDefault(); const name = $('newCardInput').value.trim(); if (!name) return;
  db.cards.push({ id: uid(), updatedAt: Date.now(), name }); save(); logActivity(`নতুন কার্ড যুক্ত: ${name}`); $('newCardInput').value = ''; toast('নতুন কার্ড যুক্ত হয়েছে!');
};
if ($('depositForm')) $('depositForm').onsubmit = e => {
  e.preventDefault(); if (!$('depositCard').value) return toast('প্রথমে একটি কার্ড যোগ করুন!', 'error');
  db.cardDeposits.push({ id: uid(), updatedAt: Date.now(), cardId: $('depositCard').value, date: $('depositDate').value, amount: num($('depositAmount').value), taka: num($('depositTaka').value), method: $('depositMethod')?.value || 'Bank', note: $('depositNote').value.trim() });
  save(); logActivity(`কার্ডে ডিপোজিট: $${$('depositAmount').value}`); e.target.reset(); $('depositDate').value = today();
  if ($('depositMethod') && db.wallets.includes('Bank')) $('depositMethod').value = 'Bank';
  toast('ডলার ডিপোজিট সেভ হয়েছে!');
};
if ($('cardTransferForm')) $('cardTransferForm').onsubmit = e => {
  e.preventDefault(); const fromId = $('trFromCard').value, toId = $('trToCard').value, amt = num($('trAmount').value);
  if (!fromId || !toId || fromId === toId) return toast('দুটি ভিন্ন কার্ড নির্বাচন করুন!', 'error');
  const fromStats = getCardStats(fromId);
  if (fromStats.balance < amt && !confirm(`সোর্স কার্ডে ব্যালেন্স আছে ${usd(fromStats.balance)}। তবুও ট্রান্সফার করবেন?`)) return;
  db.cardTransfers.push({ id: uid(), updatedAt: Date.now(), fromCardId: fromId, toCardId: toId, date: $('trDate').value, amount: amt, takaValue: +(amt * (fromStats.avgRate || num(db.agency?.defaultRate) || 120)).toFixed(2), note: $('trNote').value.trim() });
  save(); logActivity(`কার্ড ট্রান্সফার: $${amt}`); e.target.reset(); $('trDate').value = today(); toast('কার্ড ট্রান্সফার সম্পন্ন হয়েছে!');
};
if ($('cardRefundForm')) $('cardRefundForm').onsubmit = e => {
  e.preventDefault(); const cid = $('rfCard').value, amt = num($('rfAmount').value);
  if (!cid || amt <= 0) return toast('সঠিক কার্ড ও ডলার দিন!', 'error');
  db.cardRefunds.push({ id: uid(), updatedAt: Date.now(), cardId: cid, date: $('rfDate').value, amount: amt, note: $('rfNote').value.trim() });
  save(); logActivity(`ডলার রিফান্ড: $${amt}`); e.target.reset(); $('rfDate').value = today(); toast('রিফান্ড কার্ডে যোগ হয়েছে!');
};
window.editCardName = function(cardId) { const c = db.cards.find(x => x.id === cardId); if (!c) return; const n = prompt('কার্ডের নতুন নাম লিখুন:', c.name); if (n && n.trim()) { c.name = n.trim(); c.updatedAt = Date.now(); save(); toast('কার্ডের নাম আপডেট হয়েছে!'); } };
window.deleteCard = function(cardId) {
  if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error');
  const c = db.cards.find(x => x.id === cardId); if (!c) return;
  const bal = getCardStats(cardId).balance;
  const msg = Math.abs(bal) > 0.01 ? `সতর্কতা: "${c.name}" কার্ডে এখনো ${usd(bal)} ব্যালেন্স রয়েছে! তবুও রিসাইকেল বিনে পাঠাবেন?` : `"${c.name}" কার্ডটি রিসাইকেল বিনে পাঠাবেন?`;
  if (!confirm(msg)) return;
  moveToTrash('card', `কার্ড: ${c.name}`, c); markDeleted(cardId); db.cards = db.cards.filter(x => x.id !== cardId); save(); toast('কার্ড রিসাইকেল বিনে পাঠানো হয়েছে', 'warn');
};
window.deleteDeposit = function(depId) { if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); const d = db.cardDeposits.find(x => x.id === depId); if (!d || !confirm('ডিপোজিটটি রিসাইকেল বিনে পাঠাবেন?')) return; moveToTrash('deposit', `ডিপোজিট: $${d.amount}`, d); markDeleted(depId); db.cardDeposits = db.cardDeposits.filter(x => x.id !== depId); save(); toast('ডিপোজিট রিসাইকেল বিনে পাঠানো হয়েছে', 'warn'); };
window.deleteTransfer = function(id) { if (!hasPerm('canDelete') || !confirm('ট্রান্সফার রেকর্ড মুছে ফেলবেন?')) return; markDeleted(id); db.cardTransfers = db.cardTransfers.filter(x => x.id !== id); save(); toast('ট্রান্সফার মুছে ফেলা হয়েছে', 'warn'); };
window.deleteRefund = function(id) { if (!hasPerm('canDelete') || !confirm('রিফান্ড রেকর্ড মুছে ফেলবেন?')) return; markDeleted(id); db.cardRefunds = db.cardRefunds.filter(x => x.id !== id); save(); toast('রিফান্ড মুছে ফেলা হয়েছে', 'warn'); };

window.openCardStatement = function(cardId) {
  const c = db.cards.find(x => x.id === cardId); if (!c) return;
  const cnameCard = id => db.cards.find(x => x.id === id)?.name || 'Card';
  const deps = db.cardDeposits.filter(d => d.cardId === cardId).map(d => ({ date: d.date, type: 'ডিপোজিট', desc: `${money(d.taka)} (${d.method || 'Bank'}) ${d.note ? '· ' + d.note : ''}`, plus: num(d.amount), minus: 0 }));
  const trIn = db.cardTransfers.filter(t => t.toCardId === cardId).map(t => ({ date: t.date, type: 'ট্রান্সফার (+)', desc: `${cnameCard(t.fromCardId)} থেকে ${t.note || ''}`, plus: num(t.amount), minus: 0 }));
  const refs = db.cardRefunds.filter(r => r.cardId === cardId).map(r => ({ date: r.date, type: 'রিফান্ড', desc: r.note || 'Meta Refund', plus: num(r.amount), minus: 0 }));
  const trOut = db.cardTransfers.filter(t => t.fromCardId === cardId).map(t => ({ date: t.date, type: 'ট্রান্সফার (-)', desc: `${cnameCard(t.toCardId)}-এ ${t.note || ''}`, plus: 0, minus: num(t.amount) }));
  const spds = db.works.filter(w => w.cardId === cardId).map(w => ({ date: w.date, type: 'FB খরচ', desc: `${cname(w.customerId)} — ${w.name}`, plus: 0, minus: num(w.actualDollar) }));
  const all = [...deps, ...trIn, ...refs, ...trOut, ...spds].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let bal = 0; const st = getCardStats(cardId);
  $('csTitle').textContent = `💳 ${c.name} — কার্ড স্টেটমেন্ট`;
  $('csSummary').innerHTML = `<span class="badge-success">মোট জমা: ${usd(st.inUsd)}</span><span class="badge-danger">মোট খরচ/আউট: ${usd(st.outUsd)}</span><span class="badge-admin">বর্তমান ব্যালেন্স: ${usd(st.balance)}</span>`;
  $('csRows').innerHTML = all.map(r => { bal += r.plus - r.minus; return `<tr><td>${esc(r.date)}</td><td>${esc(r.type)}</td><td>${esc(r.desc)}</td><td class="good">${r.plus ? '+' + usd(r.plus) : '—'}</td><td class="bad">${r.minus ? '-' + usd(r.minus) : '—'}</td><td class="${bal < 0 ? 'bad' : 'good'}">${usd(bal)}</td></tr>`; }).join('') || '<tr><td colspan="6">কোনো লেনদেন নেই</td></tr>';
  $('cardStatementModal').style.display = 'flex';
};

function renderCards() {
  if (isStaff()) return;
  const totals = db.cards.map(c => ({ ...c, ...getCardStats(c.id) }));
  if ($('cardMetrics')) $('cardMetrics').innerHTML = totals.map(c => `<div class="metric-card m1" style="padding:15px"><small>${esc(c.name)}</small><strong>${usd(c.balance)}</strong><span class="trend">গড় রেট: ${c.avgRate ? money(c.avgRate) : '—'}</span></div>`).join('') || `<div class="muted">কোনো কার্ড যোগ করা হয়নি</div>`;
  if ($('dashCardSummary')) $('dashCardSummary').innerHTML = totals.map(c => `<div style="padding:6px 10px;border-radius:9px;background:var(--soft);border:1px solid var(--line);font-size:12px"><strong>${esc(c.name)}:</strong> <span class="${c.balance < 20 ? 'bad' : 'good'}">${usd(c.balance)}</span></div>`).join('') || `<span class="muted">কোনো কার্ড নেই</span>`;
  if ($('cardBalanceRows')) $('cardBalanceRows').innerHTML = totals.map(c => `<tr><td><strong>${esc(c.name)}</strong></td><td>${usd(c.inUsd)}</td><td>${money(c.inTk)}</td><td>${c.avgRate ? money(c.avgRate) : '—'}</td><td>${usd(c.outUsd)}</td><td class="${c.balance < 0 ? 'bad' : 'good'}">${usd(c.balance)}</td><td><button type="button" class="secondary sm" onclick="openCardStatement('${c.id}')">📄 স্টেটমেন্ট</button><button type="button" class="secondary sm" onclick="editCardName('${c.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deleteCard('${c.id}')">মুছুন</button></td></tr>`).join('') || `<tr><td colspan="7">কোনো কার্ড নেই</td></tr>`;
  const cnameCard = id => db.cards.find(x => x.id === id)?.name || 'মুছে ফেলা কার্ড';
  if ($('depositHistoryRows')) $('depositHistoryRows').innerHTML = [...db.cardDeposits].sort(byDateDesc).map(d => { const r = num(d.amount) > 0 ? num(d.taka) / num(d.amount) : 0; return `<tr><td>${esc(d.date)}</td><td><strong>${esc(cnameCard(d.cardId))}</strong></td><td>${usd(d.amount)}</td><td>${money(d.taka)}</td><td>${r ? money(r) : '—'}</td><td><span class="badge-admin">${esc(d.method || 'Bank')}</span> ${esc(d.note || '')}</td><td><button type="button" class="secondary sm" onclick="openEditDepositModal('${d.id}')">✏️ এডিট</button><button type="button" class="danger sm perm-del" onclick="deleteDeposit('${d.id}')">মুছুন</button></td></tr>`; }).join('') || `<tr><td colspan="7">কোনো ডিপোজিট হিস্ট্রি নেই</td></tr>`;
  if ($('cardTransferRows')) $('cardTransferRows').innerHTML = [...db.cardTransfers].sort(byDateDesc).map(t => `<tr><td>${esc(t.date)}</td><td>${esc(cnameCard(t.fromCardId))} → ${esc(cnameCard(t.toCardId))}</td><td><strong>${usd(t.amount)}</strong></td><td><button type="button" class="danger sm perm-del" onclick="deleteTransfer('${t.id}')">মুছুন</button></td></tr>`).join('') || `<tr><td colspan="4">কোনো ট্রান্সফার নেই</td></tr>`;
  if ($('cardRefundRows')) $('cardRefundRows').innerHTML = [...db.cardRefunds].sort(byDateDesc).map(r => `<tr><td>${esc(r.date)}</td><td>${esc(cnameCard(r.cardId))}</td><td class="good">+${usd(r.amount)}</td><td>${esc(r.note || '—')}</td><td><button type="button" class="danger sm perm-del" onclick="deleteRefund('${r.id}')">মুছুন</button></td></tr>`).join('') || `<tr><td colspan="5">কোনো রিফান্ড নেই</td></tr>`;
}

window.openEditDepositModal = function(depId) {
  const d = db.cardDeposits.find(x => x.id === depId); if (!d) return;
  fillSelect('edCard', db.cards, ''); refreshWalletSelects();
  $('edId').value = d.id; $('edCard').value = d.cardId; $('edDate').value = d.date; $('edAmount').value = d.amount; $('edTaka').value = d.taka;
  if ($('edMethod')) $('edMethod').value = d.method || 'Bank';
  $('edNote').value = d.note || ''; $('editDepositModal').style.display = 'flex';
};
if ($('editDepositForm')) $('editDepositForm').onsubmit = e => {
  e.preventDefault(); const d = db.cardDeposits.find(x => x.id === $('edId').value);
  if (d) { d.cardId = $('edCard').value; d.date = $('edDate').value; d.amount = num($('edAmount').value); d.taka = num($('edTaka').value); d.method = $('edMethod')?.value || 'Bank'; d.note = $('edNote').value.trim(); d.updatedAt = Date.now(); save(); logActivity(`ডিপোজিট এডিট: $${d.amount}`); closeModal('editDepositModal'); toast('ডিপোজিট আপডেট হয়েছে!'); }
};

// Daily Rates
if ($('rateForm')) $('rateForm').onsubmit = e => { e.preventDefault(); db.rates.push({ id: uid(), updatedAt: Date.now(), date: $('rateDate').value, value: num($('rateValue').value), note: $('rateNote').value.trim() }); save(); e.target.reset(); $('rateDate').value = today(); toast('দৈনিক রেট সেভ হয়েছে!'); };
window.openEditRateModal = function(id) { if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error'); const r = db.rates.find(x => x.id === id); if (!r) return; $('erId').value = r.id; $('erDate').value = r.date; $('erValue').value = r.value; $('erNote').value = r.note || ''; $('editRateModal').style.display = 'flex'; };
if ($('editRateForm')) $('editRateForm').onsubmit = e => { e.preventDefault(); const r = db.rates.find(x => x.id === $('erId').value); if (r) { r.date = $('erDate').value; r.value = num($('erValue').value); r.note = $('erNote').value.trim(); r.updatedAt = Date.now(); save(); closeModal('editRateModal'); toast('রেট আপডেট হয়েছে!'); } };
window.deleteRate = function(id) { if (!hasPerm('canDelete')) return toast('আপনার ডিলিট করার অনুমতি নেই!', 'error'); const r = db.rates.find(x => x.id === id); if (!r) return; moveToTrash('rate', `ডলার রেট: ${money(r.value)} (${r.date})`, r); markDeleted(id); db.rates = db.rates.filter(x => x.id !== id); save(); toast('রেট রিসাইকেল বিনে পাঠানো হয়েছে', 'warn'); };

// Works + Daily Spend + Renew + Bulk
window.quickAddSpend = function(workId) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const w = db.works.find(x => x.id === workId); if (!w) return;
  const add = prompt(`"${w.name}"-এ নতুন কত ডলার ($) খরচ যোগ করবেন?`, '10');
  if (add === null) return; const v = num(add); if (v <= 0) return toast('সঠিক ডলার সংখ্যা দিন', 'error');
  w.actualDollar = +(num(w.actualDollar) + v).toFixed(2); w.updatedAt = Date.now();
  save(); logActivity(`খরচ যোগ (+$${v}): ${w.name}`); toast(`+$${v} যোগ হয়েছে!`);
};

window.openDailySpendModal = function() {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const host = $('dailySpendList'); if (!host) return;
  const running = db.works.filter(w => (w.status || 'running') === 'running' && num(w.dollar) > 0);
  if (!running.length) return toast('কোনো চলমান বাজেটযুক্ত ক্যাম্পেইন পাওয়া যায়নি!', 'warn');
  host.innerHTML = running.map(w => {
    const daily = +(num(w.dollar) / Math.max(1, num(w.days))).toFixed(2), checked = num(w.actualDollar) < num(w.dollar) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;background:var(--soft);border:1px solid var(--line);border-radius:9px;margin:0;cursor:pointer">
      <span style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink)"><input type="checkbox" class="ds-chk row-chk" data-id="${w.id}" ${checked}> <span><strong>${esc(w.name)}</strong> <small class="muted">(${esc(cname(w.customerId))})</small></span></span>
      <span style="display:flex;align-items:center;gap:6px"><small class="muted">ব্যবহৃত: ${usd(w.actualDollar)}/${usd(w.dollar)}</small><input type="number" step=".01" min="0" value="${daily}" class="ds-amt" data-id="${w.id}" style="width:76px;min-height:30px;padding:4px 6px"></span>
    </label>`;
  }).join('');
  $('dailySpendModal').style.display = 'flex';
};
if ($('applyDailySpendConfirmBtn')) $('applyDailySpendConfirmBtn').onclick = () => {
  if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error');
  const chks = [...document.querySelectorAll('.ds-chk:checked')]; if (!chks.length) return toast('কমপক্ষে একটি ক্যাম্পেইন নির্বাচন করুন!', 'warn');
  let count = 0;
  chks.forEach(ch => { const id = ch.dataset.id, w = db.works.find(x => x.id === id), amt = num(document.querySelector(`.ds-amt[data-id="${id}"]`)?.value); if (w && amt > 0) { w.actualDollar = +(num(w.actualDollar) + amt).toFixed(2); w.updatedAt = Date.now(); count++; } });
  if (count) { save(); logActivity(`দৈনিক বাজেট যোগ (${count}টি কাজ)`); closeModal('dailySpendModal'); toast(`${count}টি ক্যাম্পেইনে আজকের খরচ যোগ হয়েছে!`); }
};

window.renewWork = function(workId) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const w = db.works.find(x => x.id === workId); if (!w) return;
  goToSection('works'); $('wDate').value = today(); $('wCustomer').value = w.customerId || ''; updatePages();
  $('wPage').value = w.pageId || ''; $('wName').value = w.name.replace(/ \(Renew\)$/i, '') + ' (Renew)';
  $('wDays').value = w.days || 7; $('wDollar').value = w.dollar || 0; $('wRate').value = w.rate || rateFor(today()); $('wActualDollar').value = 0;
  if ($('wServiceFee')) $('wServiceFee').value = w.serviceFee || 0; if ($('wServiceFeeType')) $('wServiceFeeType').value = w.serviceFeeType || 'fixed';
  if ($('wStaff')) $('wStaff').value = w.staffName || ''; if ($('wCommPct')) $('wCommPct').value = num(w.commPct);
  if (!isStaff()) { $('wCard').value = w.cardId || ''; $('wActualRate').value = w.actualRate || cardAvgRate(w.cardId) || 0; $('wFeePct').value = w.feePct || 0; $('wOther').value = 0; }
  $('wStatus').value = 'running'; updateWorkPreview(); document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  toast('রিনিউ তথ্য ফর্মে বসানো হয়েছে — যাচাই করে সেভ করুন!');
};
function progressBarHtml(spent, budget) {
  if (!budget || budget <= 0) return '';
  const pct = Math.round((spent / budget) * 100), color = pct > 100 ? '#dc2626' : (pct >= 85 ? '#d97706' : '#10b981');
  return `<div class="prog-wrap" title="${pct}% বাজেট ব্যবহৃত"><div class="prog-bar" style="width:${Math.min(100, pct)}%;background:${color}"></div></div>`;
}

if ($('workForm')) $('workForm').onsubmit = e => {
  e.preventDefault(); const date = $('wDate').value, rate = num($('wRate').value) || rateFor(date);
  if (!rate) return toast('ডলারের বিলিং রেট দিন!', 'error');
  const pageId = $('wPage').value || '', custId = $('wCustomer').value || pageCustomer(pageId);
  db.works.push({
    id: uid(), updatedAt: Date.now(), date, customerId: custId, pageId,
    name: $('wName').value.trim(), days: num($('wDays').value), dollar: num($('wDollar').value), rate, actualDollar: num($('wActualDollar').value),
    serviceFee: num($('wServiceFee')?.value), serviceFeeType: $('wServiceFeeType')?.value || 'fixed',
    cardId: $('wCard').value, actualRate: num($('wActualRate').value), feePct: num($('wFeePct').value), other: num($('wOther').value),
    staffName: $('wStaff')?.value || '', commPct: num($('wCommPct')?.value),
    revenue: num($('wRevenue').value), conversions: num($('wConversions').value),
    creativeLink: $('wCreativeLink').value.trim(), status: $('wStatus').value, note: $('wNote').value.trim()
  });
  save(); logActivity(`নতুন কাজ যুক্ত: ${$('wName').value.trim()}`);
  e.target.reset(); $('wDate').value = today(); $('wDays').value = 7; $('wRate').value = rateFor(today()) || ''; $('wFeePct').value = num(db.agency?.defaultFeePct) || 0;
  updateWorkPreview(); toast('কাজ সফলভাবে সেভ হয়েছে!');
};

window.openEditWorkModal = function(workId) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const w = db.works.find(x => x.id === workId); if (!w) return; refresh();
  $('ewId').value = w.id; $('ewDate').value = w.date; $('ewCustomer').value = w.customerId || ''; updateEditWorkPages(); $('ewPage').value = w.pageId || '';
  $('ewName').value = w.name; $('ewDays').value = w.days || 1; $('ewDollar').value = w.dollar || 0; $('ewRate').value = w.rate || 0; $('ewActualDollar').value = w.actualDollar || 0;
  if ($('ewServiceFee')) $('ewServiceFee').value = w.serviceFee || 0; if ($('ewServiceFeeType')) $('ewServiceFeeType').value = w.serviceFeeType || 'fixed';
  if ($('ewStaff')) { if (w.staffName && ![...$('ewStaff').options].some(o => o.value === w.staffName)) $('ewStaff').add(new Option(w.staffName, w.staffName)); $('ewStaff').value = w.staffName || ''; }
  if ($('ewCommPct')) $('ewCommPct').value = num(w.commPct);
  $('ewCard').value = w.cardId || ''; $('ewActualRate').value = w.actualRate || 0; $('ewFeePct').value = w.feePct || 0; $('ewOther').value = w.other || 0;
  $('ewRevenue').value = w.revenue || 0; $('ewConversions').value = w.conversions || 0; $('ewCreativeLink').value = w.creativeLink || ''; $('ewStatus').value = w.status || 'running'; $('ewNote').value = w.note || '';
  updateEditWorkPreview(); $('editWorkModal').style.display = 'flex';
};
if ($('editWorkForm')) $('editWorkForm').onsubmit = e => {
  e.preventDefault(); const w = db.works.find(x => x.id === $('ewId').value); if (!w) return;
  w.date = $('ewDate').value; w.customerId = $('ewCustomer').value || pageCustomer($('ewPage').value); w.pageId = $('ewPage').value || '';
  w.name = $('ewName').value.trim(); w.days = num($('ewDays').value); w.dollar = num($('ewDollar').value); w.rate = num($('ewRate').value); w.actualDollar = num($('ewActualDollar').value);
  w.serviceFee = num($('ewServiceFee')?.value); w.serviceFeeType = $('ewServiceFeeType')?.value || 'fixed'; w.staffName = $('ewStaff')?.value || '';
  if (!isStaff()) { w.cardId = $('ewCard').value; w.actualRate = num($('ewActualRate').value); w.feePct = num($('ewFeePct').value); w.other = num($('ewOther').value); w.commPct = num($('ewCommPct')?.value); }
  w.revenue = num($('ewRevenue').value); w.conversions = num($('ewConversions').value); w.creativeLink = $('ewCreativeLink').value.trim(); w.status = $('ewStatus').value; w.note = $('ewNote').value.trim(); w.updatedAt = Date.now();
  save(); logActivity(`কাজ এডিট: ${w.name}`); closeModal('editWorkModal'); toast('কাজের হিসাব আপডেট হয়েছে!');
};
window.cloneWork = function(workId) {
  if (!hasPerm('canEdit')) return toast('আপনার অনুমতি নেই!', 'error');
  const w = db.works.find(x => x.id === workId); if (!w) return;
  db.works.push({ ...w, id: uid(), updatedAt: Date.now(), date: today(), name: w.name + ' (Copy)' });
  save(); logActivity(`কাজ ক্লোন: ${w.name}`); toast('ক্যাম্পেইন ক্লোন হয়েছে!');
};
window.deleteWork = function(workId) {
  if (!hasPerm('canDelete')) return toast('আপনার ডিলিট করার অনুমতি নেই!', 'error');
  const w = db.works.find(x => x.id === workId); if (!w || !confirm('কাজটি রিসাইকেল বিনে পাঠাতে চান?')) return;
  moveToTrash('work', `কাজ: ${w.name} (${cname(w.customerId)})`, w); markDeleted(workId); selectedWorkIds.delete(workId);
  db.works = db.works.filter(x => x.id !== workId); save(); logActivity(`কাজ ট্র্যাশে: ${w.name}`); toast('কাজ রিসাইকেল বিনে পাঠানো হয়েছে', 'warn');
};

window.toggleWorkSelect = function(id, checked) { if (checked) selectedWorkIds.add(id); else selectedWorkIds.delete(id); updateWorkBulkBar(); };
function updateWorkBulkBar() { const bar = $('workBulkBar'), cnt = $('workSelectedCount'); if (!bar || !cnt) return; cnt.textContent = selectedWorkIds.size; bar.style.display = selectedWorkIds.size > 0 ? 'flex' : 'none'; }
if ($('workSelectAll')) $('workSelectAll').onchange = e => {
  const checked = e.target.checked;
  document.querySelectorAll('.work-row-chk').forEach(ch => { ch.checked = checked; if (checked) selectedWorkIds.add(ch.dataset.id); else selectedWorkIds.delete(ch.dataset.id); });
  updateWorkBulkBar();
};
window.bulkWorkStatus = function(status) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  if (!selectedWorkIds.size) return;
  db.works.forEach(w => { if (selectedWorkIds.has(w.id)) { w.status = status; w.updatedAt = Date.now(); } });
  const c = selectedWorkIds.size; selectedWorkIds.clear(); if ($('workSelectAll')) $('workSelectAll').checked = false;
  save(); updateWorkBulkBar(); toast(`${c}টি কাজের স্ট্যাটাস আপডেট হয়েছে!`);
};
window.bulkDeleteWorks = function() {
  if (!hasPerm('canDelete')) return toast('আপনার ডিলিট করার অনুমতি নেই!', 'error');
  if (!selectedWorkIds.size || !confirm(`${selectedWorkIds.size}টি কাজ রিসাইকেল বিনে পাঠাতে চান?`)) return;
  db.works.filter(w => selectedWorkIds.has(w.id)).forEach(w => { moveToTrash('work', `কাজ: ${w.name}`, w); markDeleted(w.id); });
  db.works = db.works.filter(w => !selectedWorkIds.has(w.id)); selectedWorkIds.clear(); if ($('workSelectAll')) $('workSelectAll').checked = false;
  save(); updateWorkBulkBar(); toast('নির্বাচিত কাজগুলো ট্র্যাশে পাঠানো হয়েছে', 'warn');
};

// Expenses, Custom Wallets, Cashbook & Payments
if ($('addWalletForm')) $('addWalletForm').onsubmit = e => {
  e.preventDefault();
  try {
    const name = $('newWalletInput').value.trim(); if (!name) return;
    if (!Array.isArray(db.wallets)) db.wallets = [...DEFAULT_WALLETS];
    if (!db.wallets.some(w => w.toLowerCase() === name.toLowerCase())) { db.wallets.push(name); save(); logActivity(`নতুন ওয়ালেট যুক্ত: ${name}`); toast(`${name} ওয়ালেট যুক্ত হয়েছে!`); }
    else toast('এই ওয়ালেট আগেই আছে!', 'warn');
    $('newWalletInput').value = '';
  } catch (err) { toast('ওয়ালেট ত্রুটি: ' + err.message, 'error'); }
};
if ($('walletListChips')) $('walletListChips').addEventListener('click', e => {
  const btn = e.target.closest('button[data-wallet]'); if (!btn) return;
  const name = btn.getAttribute('data-wallet');
  if (['Cash', 'Bank'].includes(name)) return toast('Cash ও Bank ডিফল্ট ওয়ালেট মুছা যাবে না', 'warn');
  if (!confirm(`"${name}" ওয়ালেট তালিকা থেকে সরাতে চান?`)) return;
  db.wallets = db.wallets.filter(w => w !== name); save(); toast(`${name} সরানো হয়েছে`, 'warn');
});

if ($('expenseForm')) $('expenseForm').onsubmit = e => {
  e.preventDefault(); if (!hasPerm('canExpenses')) return toast('অনুমতি নেই!', 'error');
  db.expenses.push({ id: uid(), updatedAt: Date.now(), date: $('expDate').value, title: $('expTitle').value.trim(), category: $('expCategory').value, method: $('expMethod')?.value || 'Cash', amount: num($('expAmount').value), note: $('expNote').value.trim() });
  save(); logActivity(`অফিস খরচ: ${$('expTitle').value.trim()}`); e.target.reset(); $('expDate').value = today();
  if ($('expMethod') && db.wallets.includes('Cash')) $('expMethod').value = 'Cash';
  toast('অফিস খরচ সেভ হয়েছে!');
};
window.openEditExpenseModal = function(id) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const ex = db.expenses.find(x => x.id === id); if (!ex) return; refreshWalletSelects();
  $('eeId').value = ex.id; $('eeDate').value = ex.date; $('eeTitle').value = ex.title; $('eeCategory').value = ex.category;
  if ($('eeMethod')) { if (ex.method && ![...$('eeMethod').options].some(o => o.value === ex.method)) $('eeMethod').add(new Option(ex.method, ex.method)); $('eeMethod').value = ex.method || 'Cash'; }
  $('eeAmount').value = ex.amount; $('eeNote').value = ex.note || ''; $('editExpenseModal').style.display = 'flex';
};
if ($('editExpenseForm')) $('editExpenseForm').onsubmit = e => {
  e.preventDefault(); const ex = db.expenses.find(x => x.id === $('eeId').value);
  if (ex) { ex.date = $('eeDate').value; ex.title = $('eeTitle').value.trim(); ex.category = $('eeCategory').value; ex.method = $('eeMethod')?.value || 'Cash'; ex.amount = num($('eeAmount').value); ex.note = $('eeNote').value.trim(); ex.updatedAt = Date.now(); save(); closeModal('editExpenseModal'); toast('খরচ আপডেট হয়েছে!'); }
};
window.deleteExpense = function(id) { if (!hasPerm('canDelete')) return toast('আপনার ডিলিট করার অনুমতি নেই!', 'error'); const ex = db.expenses.find(x => x.id === id); if (!ex || !confirm('খরচটি রিসাইকেল বিনে পাঠাবেন?')) return; moveToTrash('expense', `খরচ: ${ex.title} (${money(ex.amount)})`, ex); markDeleted(id); db.expenses = db.expenses.filter(x => x.id !== id); save(); toast('খরচ রিসাইকেল বিনে পাঠানো হয়েছে', 'warn'); };

if ($('cashAdjustForm')) $('cashAdjustForm').onsubmit = e => {
  e.preventDefault();
  try {
    const method = $('caMethod')?.value || 'Cash', amt = num($('caAmount')?.value);
    if (amt <= 0) return toast('সঠিক টাকার পরিমাণ দিন!', 'error');
    if (!Array.isArray(db.cashAdjustments)) db.cashAdjustments = [];
    db.cashAdjustments.push({ id: uid(), updatedAt: Date.now(), date: $('caDate').value || today(), method, type: $('caType').value, amount: amt, note: $('caNote').value.trim() });
    save(); logActivity(`ক্যাশবুক অ্যাডজাস্ট (${method}): ৳${amt}`); e.target.reset(); $('caDate').value = today();
    if ($('caMethod') && db.wallets.includes('Cash')) $('caMethod').value = 'Cash';
    toast('ওয়ালেট ব্যালেন্স আপডেট হয়েছে!');
  } catch (err) { toast('ক্যাশবুক ত্রুটি: ' + err.message, 'error'); }
};
window.deleteCashAdjust = function(id) { if (!hasPerm('canDelete') || !confirm('ক্যাশবুক এন্ট্রিটি মুছতে চান?')) return; markDeleted(id); db.cashAdjustments = db.cashAdjustments.filter(x => x.id !== id); save(); toast('ক্যাশবুক এন্ট্রি মুছে ফেলা হয়েছে', 'warn'); };

if ($('paymentForm')) $('paymentForm').onsubmit = e => {
  e.preventDefault();
  try {
    if (!hasPerm('canPayments')) return toast('অনুমতি নেই!', 'error');
    const cid = $('pCustomer')?.value; if (!cid) return toast('প্রথমে কাস্টমার নির্বাচন করুন!', 'error');
    const amt = num($('pAmount')?.value); if (amt <= 0) return toast('সঠিক টাকার পরিমাণ দিন!', 'error');
    db.payments.push({ id: uid(), updatedAt: Date.now(), date: $('pDate').value || today(), customerId: cid, amount: amt, method: $('pMethod')?.value || 'Cash', fee: num($('pFee')?.value), ref: $('pRef').value.trim(), note: $('pNote').value.trim() });
    save(); logActivity(`পেমেন্ট জমা: ৳${amt}`); e.target.reset(); $('pDate').value = today(); if ($('pFee')) $('pFee').value = 0; updatePaymentCustomerStatus(); toast('পেমেন্ট সফলভাবে জমা হয়েছে!');
  } catch (err) { toast('পেমেন্ট ত্রুটি: ' + err.message, 'error'); }
};
window.openEditPaymentModal = function(id) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const p = db.payments.find(x => x.id === id); if (!p) return; refresh();
  $('epId').value = p.id; $('epDate').value = p.date; $('epCustomer').value = p.customerId; $('epAmount').value = p.amount;
  if ($('epMethod')) { if (p.method && ![...$('epMethod').options].some(o => o.value === p.method)) $('epMethod').add(new Option(p.method, p.method)); $('epMethod').value = p.method; }
  if ($('epFee')) $('epFee').value = p.fee || 0; $('epRef').value = p.ref || ''; $('epNote').value = p.note || ''; $('editPaymentModal').style.display = 'flex';
};
if ($('editPaymentForm')) $('editPaymentForm').onsubmit = e => {
  e.preventDefault(); const p = db.payments.find(x => x.id === $('epId').value);
  if (p) { p.date = $('epDate').value; p.customerId = $('epCustomer').value; p.amount = num($('epAmount').value); p.method = $('epMethod').value; p.fee = num($('epFee')?.value); p.ref = $('epRef').value.trim(); p.note = $('epNote').value.trim(); p.updatedAt = Date.now(); save(); closeModal('editPaymentModal'); toast('পেমেন্ট আপডেট হয়েছে!'); }
};
window.deletePayment = function(id) { if (!hasPerm('canDelete')) return toast('আপনার ডিলিট করার অনুমতি নেই!', 'error'); const p = db.payments.find(x => x.id === id); if (!p || !confirm('পেমেন্টটি রিসাইকেল বিনে পাঠাবেন?')) return; moveToTrash('payment', `পেমেন্ট: ${cname(p.customerId)} (${money(p.amount)})`, p); markDeleted(id); db.payments = db.payments.filter(x => x.id !== id); save(); toast('পেমেন্ট রিসাইকেল বিনে পাঠানো হয়েছে', 'warn'); };

// WhatsApp & Dues
function normalizeBdPhone(raw) { let d = String(raw || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('8801')) return d; if (d.startsWith('01')) return '88' + d; if (d.startsWith('1') && d.length === 10) return '880' + d; return d; }
window.sendWhatsAppReminder = function(custId) {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const waNum = normalizeBdPhone(c.phone); if (!waNum) return toast('এই কাস্টমারের সঠিক মোবাইল নম্বর নেই!', 'error');
  const b = billed(custId), p = paid(custId), dueAmt = money(Math.max(0, b - p)), agName = db.agency?.name || 'Ads হিসাব ম্যানেজার';
  const payInfo = db.agency?.payInfo ? `পেমেন্ট মাধ্যম: ${db.agency.payInfo}` : '', tpl = db.agency?.waTemplate || DEFAULT_WA_TEMPLATE;
  const msg = tpl.replace(/\{name\}/g, c.name).replace(/\{agency\}/g, agName).replace(/\{bill\}/g, money(b)).replace(/\{paid\}/g, money(p)).replace(/\{due\}/g, dueAmt).replace(/\{payinfo\}/g, payInfo);
  db.reminderLogs[custId] = new Date().toLocaleString('bn-BD'); save();
  window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`, '_blank'); toast('WhatsApp রিমাইন্ডার খোলা হয়েছে!');
};
window.sendLowPrepaidWhatsApp = function(custId) {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const waNum = normalizeBdPhone(c.phone); if (!waNum) return toast('কাস্টমারের সঠিক মোবাইল নম্বর নেই!', 'error');
  const msg = `আসসালামু আলাইকুম ${c.name}, ${db.agency?.name || 'Ads হিসাব ম্যানেজার'} থেকে জানাচ্ছি—আপনার অ্যাডভান্স অ্যাড ফান্ড ব্যালেন্স কমে মাত্র ${money(clientBalance(custId))} রয়েছে। অনুগ্রহ করে নতুন ফান্ড রিচার্জ করুন। ${db.agency?.payInfo || ''} ধন্যবাদ!`;
  window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`, '_blank');
};
window.sendCampaignWhatsApp = function(workId) {
  const w = db.works.find(x => x.id === workId); if (!w) return; const c = db.customers.find(x => x.id === w.customerId); if (!c) return;
  const waNum = normalizeBdPhone(c.phone); if (!waNum) return toast('কাস্টমারের সঠিক মোবাইল নম্বর নেই!', 'error');
  const msg = `আসসালামু আলাইকুম ${c.name}, আপনার '${w.name}' ক্যাম্পেইনের আপডেট: ব্যবহৃত ডলার ${usd(w.actualDollar)}, মোট বিল ${money(bill(w))}, স্ট্যাটাস: ${w.status}। ধন্যবাদ - ${db.agency?.name || 'Ads হিসাব ম্যানেজার'}`;
  window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`, '_blank');
};

function renderDues() {
  const dueQ = ($('dueSearch')?.value || '').toLowerCase();
  const dueRows = db.customers.map(c => { const b = billed(c.id), p = paid(c.id); return { customer: c, bill: b, paid: p, bal: p - b }; });
  const onlyDuesAll = dueRows.filter(x => x.bal < 0), onlyDues = onlyDuesAll.filter(x => !dueQ || x.customer.name.toLowerCase().includes(dueQ) || (x.customer.phone || '').includes(dueQ));
  const lowPrepaids = dueRows.filter(x => x.bal > 0 && x.bal < 1000);
  const totalDueSum = onlyDuesAll.reduce((s, x) => s + (-x.bal), 0), totalAdvSum = dueRows.filter(x => x.bal > 0).reduce((s, x) => s + x.bal, 0);

  if ($('dueMetrics')) $('dueMetrics').innerHTML = `<div class="metric-card m4"><small>মোট বকেয়া পাওনা</small><strong>${money(totalDueSum)}</strong></div><div class="metric-card m3"><small>ক্লায়েন্টদের অ্যাডভান্স জমা</small><strong>${money(totalAdvSum)}</strong></div><div class="metric-card m1"><small>বকেয়া থাকা কাস্টমার</small><strong>${onlyDuesAll.length} জন</strong></div>`;
  if ($('dueRows')) $('dueRows').innerHTML = onlyDues.map(x => {
    const cid = x.customer.id, due = -x.bal, lastLog = db.reminderLogs[cid] ? `<span class="good" style="font-size:11px">পাঠানো: ${esc(db.reminderLogs[cid])}</span>` : `<span class="muted">পাঠানো হয়নি</span>`;
    return `<tr><td><strong>${esc(x.customer.name)}</strong>${due > 5000 ? `<span class="badge-danger" style="margin-left:5px">High Due</span>` : ''}</td><td>${esc(x.customer.phone || '—')}</td><td>${money(x.bill)}</td><td>${money(x.paid)}</td><td class="bad">${money(due)}</td><td>${lastLog}</td><td><button type="button" class="secondary sm" onclick="sendWhatsAppReminder('${cid}')">📲 WhatsApp</button><button type="button" class="secondary sm" onclick="openInvoice('${cid}')">📄 ইনভয়েস</button></td></tr>`;
  }).join('') || `<tr><td colspan="7">কোনো কাস্টমারের বকেয়া নেই 🎉</td></tr>`;

  if ($('lowPrepaidRows')) $('lowPrepaidRows').innerHTML = lowPrepaids.map(x => `<tr><td><strong>${esc(x.customer.name)}</strong></td><td>${esc(x.customer.phone || '—')}</td><td class="bad">${money(x.bal)}</td><td><button type="button" class="warn sm" onclick="sendLowPrepaidWhatsApp('${x.customer.id}')">📲 রিচার্জ রিমাইন্ডার</button></td></tr>`).join('') || `<tr><td colspan="4">লো-অ্যাডভান্স কাস্টমার নেই ✅</td></tr>`;
  if ($('dashLowPrepaidWrap') && $('dashLowPrepaidList')) {
    $('dashLowPrepaidWrap').style.display = lowPrepaids.length ? 'block' : 'none';
    $('dashLowPrepaidList').innerHTML = lowPrepaids.slice(0, 4).map(x => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:6px 9px;background:var(--soft);border-radius:8px;border:1px solid var(--line)"><span><strong>${esc(x.customer.name)}</strong>: <span class="bad">${money(x.bal)}</span></span><button type="button" class="warn sm" style="margin:0" onclick="sendLowPrepaidWhatsApp('${x.customer.id}')">📲 রিচার্জ</button></div>`).join('');
  }
}

// Notifications & Active Ads
function updateNotifications() {
  const notifList = $('notifList'), notifCount = $('notifCount'); if (!notifList || !notifCount) return;
  const items = [], todayDate = new Date(); todayDate.setHours(0,0,0,0);
  db.works.forEach(w => {
    if (w.status === 'running' && w.days) {
      const startDate = new Date(w.date), expiryDate = new Date(startDate); expiryDate.setDate(startDate.getDate() + Number(w.days)); expiryDate.setHours(0,0,0,0);
      const diffDays = Math.ceil((expiryDate - todayDate) / 86400000);
      if (diffDays <= 1 && diffDays >= 0) items.push({ key: `work_${w.id}_soon`, text: `⏰ '${w.name}' ক্যাম্পেইনের মেয়াদ শেষ হতে চলেছে!`, tab: 'works' });
      else if (diffDays < 0) items.push({ key: `work_${w.id}_exp`, text: `⚠️ '${w.name}' ক্যাম্পেইনের মেয়াদ শেষ হয়েছে।`, tab: 'works' });
    }
  });
  if (hasPerm('canPayments')) {
    const dueCount = db.customers.filter(c => clientBalance(c.id) < 0).length;
    if (dueCount > 0) items.push({ key: `due_${dueCount}`, text: `📌 ${dueCount} জন কাস্টমারের কাছে বকেয়া পাওনা রয়েছে।`, tab: 'dues' });
    const lowCount = db.customers.filter(c => { const b = clientBalance(c.id); return b > 0 && b < 1000; }).length;
    if (lowCount > 0) items.push({ key: `low_${lowCount}`, text: `⚠️ ${lowCount} জন ক্লায়েন্টের অ্যাডভান্স ফান্ড শেষের দিকে।`, tab: 'dues' });
  }
  if (!isStaff()) {
    db.cards.forEach(c => { const st = getCardStats(c.id); if (st.inUsd > 0 && st.balance < 20) items.push({ key: `card_${c.id}`, text: `💳 '${c.name}' কার্ডের ব্যালেন্স কম (${usd(st.balance)})!`, tab: 'cards' }); });
    const openHelps = readHelpRequests().filter(h => h.status === 'open' && (isSuperAdmin() || h.target !== 'Super Admin'));
    if (openHelps.length > 0) items.push({ key: `help_${openHelps.length}`, text: `📩 ${openHelps.length} টি নতুন হেল্প মেসেজ এসেছে!`, tab: 'adminPanel', subTab: 'help' });
  }
  const st = readNotifState(), visibleItems = items.filter(i => !st.dismissed.includes(i.key));
  currentNotifKeys = visibleItems.map(i => i.key);
  const unreadCount = visibleItems.filter(i => !st.seen.includes(i.key)).length;
  if (unreadCount > 0) { notifCount.style.display = 'flex'; notifCount.textContent = unreadCount; } else notifCount.style.display = 'none';
  notifList.innerHTML = visibleItems.length ? visibleItems.map(i => `<div class="notif-item" style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px" onclick="goToSection('${i.tab}');${i.subTab ? `switchAdminSubTab('${i.subTab}');` : ''}$('notifBox').style.display='none'"><span>${esc(i.text)}</span><button type="button" class="secondary sm" style="padding:1px 6px;margin:0;flex-shrink:0" onclick="dismissNotif(event,'${esc(i.key)}')">✕</button></div>`).join('') : `<div class="notif-item">কোনো নতুন বিজ্ঞপ্তি নেই</div>`;
}

function renderActiveCampaignsMonitor() {
  const host = $('dashActiveWorksRows'); if (!host) return;
  const todayDate = new Date(); todayDate.setHours(0,0,0,0);
  const running = db.works.filter(w => (w.status || 'running') === 'running');
  host.innerHTML = running.map(w => {
    const startDate = new Date(w.date), expiryDate = new Date(startDate); expiryDate.setDate(startDate.getDate() + Math.max(1, num(w.days))); expiryDate.setHours(0,0,0,0);
    const diffDays = Math.ceil((expiryDate - todayDate) / 86400000), daily = num(w.days) > 0 ? (num(w.dollar) / num(w.days)) : num(w.dollar);
    const badge = diffDays < 0 ? `<span class="badge-danger">মেয়াদ শেষ (${Math.abs(diffDays)} দিন আগে)</span>` : (diffDays <= 1 ? `<span class="badge-status status-running">আজ/কাল শেষ</span>` : `<span class="badge-success">${diffDays} দিন বাকি</span>`);
    return `<tr><td><strong>${esc(cname(w.customerId))}</strong><br><small class="muted">${esc(pname(w.pageId))}</small></td><td>${esc(w.name)}</td><td>${usd(w.dollar)} / <strong>${usd(w.actualDollar)}</strong>${progressBarHtml(num(w.actualDollar), num(w.dollar))}</td><td>${usd(daily)}/দিন</td><td>${badge}</td><td><button type="button" class="secondary sm perm-edit" onclick="quickAddSpend('${w.id}')">+$</button><button type="button" class="secondary sm perm-edit" onclick="renewWork('${w.id}')">🔄 Renew</button><button type="button" class="secondary sm perm-edit" onclick="openEditWorkModal('${w.id}')">✏️</button><button type="button" class="secondary sm" onclick="sendCampaignWhatsApp('${w.id}')">📲</button></td></tr>`;
  }).join('') || `<tr><td colspan="6">বর্তমানে কোনো চলমান (Running) ক্যাম্পেইন নেই</td></tr>`;
}

// Charts & Top Clients (Billing vs Profit Switcher)
function renderMonthlyChart() {
  if (isStaff()) return;
  const host = $('monthlyChart'), labelsHost = $('monthlyChartLabels'); if (!host || !labelsHost) return;
  const bnMonths = ['জানু','ফেব্রু','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টে','অক্টো','নভে','ডিসে'], now = new Date(), buckets = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); buckets.push({ ym: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: bnMonths[d.getMonth()] + "'" + String(d.getFullYear()).slice(-2), bill: 0, spend: 0, profit: 0 }); }
  db.works.forEach(w => { const b = buckets.find(x => x.ym === String(w.date || '').slice(0, 7)); if (b) { b.bill += bill(w); b.spend += actual(w) + num(w.other); } });
  db.expenses.forEach(e => { const b = buckets.find(x => x.ym === String(e.date || '').slice(0, 7)); if (b) b.spend += num(e.amount); });
  db.payments.forEach(p => { const b = buckets.find(x => x.ym === String(p.date || '').slice(0, 7)); if (b) b.spend += num(p.fee); });
  buckets.forEach(b => { b.profit = Math.max(0, b.bill - b.spend); });
  const max = Math.max(1, ...buckets.flatMap(b => [b.bill, b.spend, b.profit]));
  host.innerHTML = buckets.map(b => `<div style="flex:1;display:flex;align-items:flex-end;justify-content:center;gap:3px;height:100%" title="${b.label}: বিল ${money(b.bill)} | খরচ ${money(b.spend)} | লাভ ${money(b.bill - b.spend)}"><div style="width:26%;height:${Math.max(4, b.bill / max * 100)}%;background:#2563eb;border-radius:4px 4px 0 0"></div><div style="width:26%;height:${Math.max(4, b.spend / max * 100)}%;background:#7c3aed;border-radius:4px 4px 0 0"></div><div style="width:26%;height:${Math.max(4, b.profit / max * 100)}%;background:#10b981;border-radius:4px 4px 0 0"></div></div>`).join('');
  labelsHost.innerHTML = buckets.map(b => `<span style="flex:1;text-align:center">${b.label}</span>`).join('');
}
function renderTopClients() {
  const host = $('topClientsList'); if (!host) return;
  const mode = (!isStaff() && $('topClientMode')?.value === 'profit') ? 'profit' : 'bill';
  const list = db.customers.map(c => ({
    name: c.name,
    total: mode === 'profit' ? db.works.filter(w => w.customerId === c.id).reduce((s, w) => s + profit(w), 0) : billed(c.id)
  })).filter(x => x.total > 0).sort((a,b) => b.total - a.total).slice(0, 5);
  const topMax = Math.max(1, list[0]?.total || 1);
  host.innerHTML = list.map((c, i) => `<div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px"><span><strong>#${i+1} ${esc(c.name)}</strong></span><strong style="color:${mode === 'profit' ? '#059669' : 'var(--brand)'}">${money(c.total)}</strong></div><div style="height:6px;background:var(--soft);border-radius:99px;overflow:hidden"><div style="height:100%;width:${(c.total / topMax * 100).toFixed(0)}%;background:${mode === 'profit' ? '#10b981' : 'linear-gradient(90deg,#3157e8,#7046e8)'};border-radius:99px"></div></div></div>`).join('') || '<div class="muted">এখনো কোনো ডেটা নেই</div>';
}
if ($('topClientMode')) $('topClientMode').onchange = renderTopClients;

// Monthly Report & Filters
let dashFilterFrom = '', dashFilterTo = '';
if ($('applyDashDates')) $('applyDashDates').onclick = () => { dashFilterFrom = $('dashFrom').value; dashFilterTo = $('dashTo').value; render(); };
if ($('clearDashDates')) $('clearDashDates').onclick = () => { dashFilterFrom = ''; dashFilterTo = ''; $('dashFrom').value = ''; $('dashTo').value = ''; render(); };
if ($('repFrom')) $('repFrom').value = today().slice(0, 8) + '01';
if ($('repTo')) $('repTo').value = today();
function inDateRange(d, from, to) { const s = String(d || ''); return (!from || s >= from) && (!to || s <= to); }

function renderMonthlyReport() {
  const from = $('repFrom')?.value || '', to = $('repTo')?.value || '';
  const fWorks = db.works.filter(w => inDateRange(w.date, from, to)), fPays = db.payments.filter(p => inDateRange(p.date, from, to)), fExps = db.expenses.filter(e => inDateRange(e.date, from, to));
  const b = fWorks.reduce((s, w) => s + bill(w), 0);
  const totalSpend = fWorks.reduce((s, w) => s + actual(w) + num(w.other), 0) + fExps.reduce((s, e) => s + num(e.amount), 0) + fPays.reduce((s, p) => s + num(p.fee), 0);
  const paidAmt = fPays.reduce((s, p) => s + num(p.amount), 0);
  if ($('repBill')) $('repBill').textContent = money(b); if ($('repPaid')) $('repPaid').textContent = money(paidAmt);
  if (!isStaff()) { if ($('repSpend')) $('repSpend').textContent = money(totalSpend); if ($('repProfit')) $('repProfit').textContent = money(b - totalSpend); }
  if ($('repWorkRows')) $('repWorkRows').innerHTML = fWorks.map(w => `<tr><td>${esc(w.date)}</td><td><strong>${esc(cname(w.customerId))}</strong><br><small class="muted">${esc(pname(w.pageId))}</small></td><td>${esc(w.name)}</td><td>${money(bill(w))}</td>${isStaff() ? '' : `<td>${money(actual(w))}</td><td class="${profit(w) >= 0 ? 'good' : 'bad'}">${money(profit(w))}</td>`}</tr>`).join('') || `<tr><td colspan="${isStaff() ? 4 : 6}">এই সময়ে কোনো কাজ নেই</td></tr>`;
}
if ($('applyRepDates')) $('applyRepDates').onclick = renderMonthlyReport;
if ($('clearRepDates')) $('clearRepDates').onclick = () => { $('repFrom').value = today().slice(0, 8) + '01'; $('repTo').value = today(); renderMonthlyReport(); };

function checkBackupReminder() {
  const bar = $('backupReminderBar'); if (!bar) return;
  if (isStaff() || (!db.customers.length && !db.works.length)) { bar.style.display = 'none'; return; }
  const last = localStorage.getItem(LAST_BACKUP_KEY), diffDays = last ? Math.floor((new Date(today()) - new Date(last)) / 86400000) : 99;
  bar.style.display = (diffDays >= 7 && !sessionStorage.getItem('backup_dismissed_v72')) ? 'flex' : 'none';
}

function renderPager(hostId, currentPage, totalItems, onPageFnName) {
  const host = $(hostId); if (!host) return;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  if (totalItems <= PAGE_SIZE) { host.innerHTML = ''; return; }
  host.innerHTML = `<span>মোট ${totalItems}টি · পৃষ্ঠা ${currentPage} / ${totalPages}</span><div><button type="button" class="secondary sm" ${currentPage <= 1 ? 'disabled' : ''} onclick="${onPageFnName}(${currentPage - 1})">◀ আগের</button><button type="button" class="secondary sm" ${currentPage >= totalPages ? 'disabled' : ''} onclick="${onPageFnName}(${currentPage + 1})">পরের ▶</button></div>`;
}
window.setCustPage = p => { custPage = p; render(); };
window.setWorkPage = p => { workPage = p; render(); };
window.setPayPage = p => { payPage = p; render(); };

// Main Render
function render() {
  refresh(); renderCards(); updateNotifications(); renderMonthlyChart(); renderTopClients(); renderActiveCampaignsMonitor(); updateStorageMeter();

  const todayStr = today(), todayWorks = db.works.filter(w => w.date === todayStr);
  const todayExp = db.expenses.filter(e => e.date === todayStr).reduce((s, e) => s + num(e.amount), 0);
  const todayPayFees = db.payments.filter(p => p.date === todayStr).reduce((s, p) => s + num(p.fee), 0);
  const todayBill = todayWorks.reduce((s, w) => s + bill(w), 0), todaySpend = todayWorks.reduce((s, w) => s + actual(w) + num(w.other), 0);
  if ($('mTodayBill')) $('mTodayBill').textContent = money(todayBill);
  if (!isStaff()) {
    if ($('mTodaySpend')) $('mTodaySpend').textContent = money(todaySpend);
    if ($('mTodayProfit')) $('mTodayProfit').textContent = money(todayBill - todaySpend - todayExp - todayPayFees);
  }

  const fWorks = db.works.filter(w => inDateRange(w.date, dashFilterFrom, dashFilterTo));
  const fPays = db.payments.filter(p => inDateRange(p.date, dashFilterFrom, dashFilterTo));
  const fExps = db.expenses.filter(e => inDateRange(e.date, dashFilterFrom, dashFilterTo));
  const totalBill = fWorks.reduce((s, w) => s + bill(w), 0), totalPaid = fPays.reduce((s, p) => s + num(p.amount), 0);
  const isFiltered = Boolean(dashFilterFrom || dashFilterTo);
  const allCustDue = isFiltered ? Math.max(0, totalBill - totalPaid) : db.customers.reduce((s, c) => s + Math.max(0, -clientBalance(c.id)), 0);
  const allCustAdv = isFiltered ? Math.max(0, totalPaid - totalBill) : db.customers.reduce((s, c) => s + Math.max(0, clientBalance(c.id)), 0);

  if ($('mBill')) $('mBill').textContent = money(totalBill);
  if ($('mTotalPaid')) $('mTotalPaid').textContent = money(totalPaid);
  if ($('mAdvanceNote')) $('mAdvanceNote').textContent = allCustAdv > 0 ? `অ্যাডভান্স জমা: ${money(allCustAdv)}` : '';
  if ($('mDue')) $('mDue').textContent = money(allCustDue);

  if (!isStaff()) {
    const ad = fWorks.reduce((s, w) => s + actual(w), 0), otherCost = fWorks.reduce((s, w) => s + num(w.other), 0);
    const periodOfficeExp = fExps.reduce((s, e) => s + num(e.amount), 0), periodPayFees = fPays.reduce((s, p) => s + num(p.fee), 0);
    const netP = totalBill - ad - otherCost - periodOfficeExp - periodPayFees;
    if ($('mActual')) $('mActual').textContent = money(ad);
    if ($('mProfit')) $('mProfit').textContent = money(netP);

    const ym = todayStr.slice(0, 7), mWorks = db.works.filter(w => String(w.date || '').startsWith(ym)), mBill = mWorks.reduce((s, w) => s + bill(w), 0);
    const mCost = mWorks.reduce((s, w) => s + actual(w) + num(w.other), 0) + db.expenses.filter(e => String(e.date || '').startsWith(ym)).reduce((s, e) => s + num(e.amount), 0) + db.payments.filter(p => String(p.date || '').startsWith(ym)).reduce((s, p) => s + num(p.fee), 0);
    const mProfit = mBill - mCost, goal = num(db.agency?.monthlyGoal) || 100000, pct = goal > 0 ? Math.max(0, Math.min(100, Math.round((mProfit / goal) * 100))) : 0;
    const margin = totalBill > 0 ? ((netP / totalBill) * 100).toFixed(1) : '0.0';
    if ($('dashGoalText')) $('dashGoalText').innerHTML = `🎯 চলতি মাসের (${ym}) নিট প্রফিট টার্গেট: <strong>${money(mProfit)} / ${money(goal)}</strong> (${pct}%)`;
    if ($('dashMarginText')) $('dashMarginText').textContent = `গড় প্রফিট মার্জিন: ${margin}%`;
    if ($('dashGoalBar')) { $('dashGoalBar').style.width = `${pct}%`; $('dashGoalBar').style.background = pct >= 100 ? '#10b981' : (pct >= 50 ? '#3157e8' : '#f59e0b'); }

    if ($('walletListChips')) $('walletListChips').innerHTML = (db.wallets || []).map(w => `<span class="wallet-chip">${esc(w)}${['Cash','Bank'].includes(w) ? '' : `<button type="button" data-wallet="${esc(w)}" title="সরান">✕</button>`}</span>`).join('');
    const wBals = getWalletBalances();
    if ($('walletMetrics')) $('walletMetrics').innerHTML = Object.entries(wBals).map(([k, v]) => `<div class="wallet-card"><small>${esc(k)} ব্যালেন্স</small><strong class="${v < 0 ? 'bad' : 'good'}">${money(v)}</strong></div>`).join('');
    if ($('dashWalletSummary')) $('dashWalletSummary').innerHTML = Object.entries(wBals).filter(([k,v]) => k !== 'Card' || v !== 0).map(([k, v]) => `<div style="padding:5px 9px;border-radius:8px;background:var(--soft);border:1px solid var(--line);font-size:11.5px"><strong>${esc(k)}:</strong> <span class="${v < 0 ? 'bad' : 'good'}">${money(v)}</span></div>`).join('');
    if ($('cashAdjustRows')) $('cashAdjustRows').innerHTML = [...db.cashAdjustments].sort(byDateDesc).map(a => `<tr><td>${esc(a.date)}</td><td><strong>${esc(a.method)}</strong></td><td>${a.type === 'out' ? '<span class="bad">উত্তোলন (-)</span>' : '<span class="good">জমা (+)</span>'}</td><td>${money(a.amount)}</td><td>${esc(a.note || '—')}</td><td><button type="button" class="danger sm perm-del" onclick="deleteCashAdjust('${a.id}')">মুছুন</button></td></tr>`).join('') || '<tr><td colspan="6">কোনো অ্যাডজাস্টমেন্ট নেই</td></tr>';
  }

  // Customers (Paginated)
  const custQuery = ($('customerSearch')?.value || '').toLowerCase();
  const filteredCustomers = db.customers.filter(c => c.name.toLowerCase().includes(custQuery) || (c.phone || '').includes(custQuery));
  const totalCustPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE)); if (custPage > totalCustPages) custPage = totalCustPages;
  const pagedCustomers = filteredCustomers.slice((custPage - 1) * PAGE_SIZE, custPage * PAGE_SIZE);
  if ($('customerRows')) $('customerRows').innerHTML = pagedCustomers.map((c, idx) => {
    const b = billed(c.id), p = paid(c.id), bal = p - b;
    const balHtml = bal < 0 ? `<span class="bad">বকেয়া: ${money(-bal)}</span>` : (bal > 0 ? `<span class="good">অ্যাডভান্স: ${money(bal)}</span>` : `<span class="muted">৳0.00</span>`);
    const retBadge = num(c.retainer) > 0 ? `<br><small class="muted">রিটেইনার: ${money(c.retainer)}/মাস</small>` : '';
    return `<tr><td>#${(custPage - 1) * PAGE_SIZE + idx + 1}</td><td><strong>${esc(c.name)}</strong>${retBadge}</td><td>${esc(c.phone || '—')}</td><td>${db.pages.filter(pg => pg.customerId === c.id).length}</td><td>${money(b)}</td><td>${money(p)}</td><td>${balHtml}</td><td><button type="button" class="secondary sm" onclick="openClientProfile('${c.id}')">👤 প্রোফাইল</button><button type="button" class="secondary sm" onclick="openInvoice('${c.id}')">📄 ইনভয়েস</button><button type="button" class="secondary sm perm-edit" onclick="openEditCustomerModal('${c.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deleteCustomer('${c.id}')">মুছুন</button></td></tr>`;
  }).join('') || `<tr><td colspan="8">কোনো কাস্টমার পাওয়া যায়নি</td></tr>`;
  renderPager('custPager', custPage, filteredCustomers.length, 'setCustPage');

  // Pages
  if ($('pageRows')) $('pageRows').innerHTML = db.pages.map((p, idx) => `<tr><td>#${idx + 1}</td><td>${esc(cname(p.customerId))}</td><td><strong>${esc(p.name)}</strong></td><td>${p.link ? `<a href="${esc(p.link)}" target="_blank">লিংক ↗</a>` : '—'}</td><td>${p.adId ? `<code>${esc(p.adId)}</code> <button type="button" class="secondary sm" onclick="copyText('${esc(p.adId).replace(/'/g, "\\'")}','Ad ID')">📋</button>` : '—'}</td><td>${p.pixelId ? `<code>${esc(p.pixelId)}</code> <button type="button" class="secondary sm" onclick="copyText('${esc(p.pixelId).replace(/'/g, "\\'")}','Pixel ID')">📋</button>` : '—'}</td><td><button type="button" class="secondary sm perm-edit" onclick="openEditPageModal('${p.id}')">✏️ এডিট</button><button type="button" class="danger sm perm-del" onclick="deletePage('${p.id}')">মুছুন</button></td></tr>`).join('') || `<tr><td colspan="7">কোনো পেজ যুক্ত নেই</td></tr>`;

  // Ad Accounts
  const cnameCard = id => db.cards.find(x => x.id === id)?.name || '—';
  if ($('adAccountRows')) $('adAccountRows').innerHTML = db.adAccounts.map(a => {
    const stCls = a.status === 'Active' ? 'badge-success' : (a.status === 'Disabled' ? 'badge-danger' : 'badge-warn');
    return `<tr><td><strong>${esc(a.name)}</strong><br><small class="muted">${esc(a.bm || 'BM নেই')}</small></td><td>${a.adId ? `<code>${esc(a.adId)}</code> <button type="button" class="secondary sm" onclick="copyText('${esc(a.adId).replace(/'/g, "\\'")}','Ad ID')">📋</button>` : '—'}</td><td>${esc(cnameCard(a.cardId))}</td><td>${usd(a.threshold)} / <span class="${num(a.unpaid) > 0 ? 'bad' : ''}">${usd(a.unpaid)}</span></td><td><span class="${stCls}" style="cursor:pointer" onclick="cycleAdAccountStatus('${a.id}')">${esc(a.status)}</span></td><td><button type="button" class="secondary sm perm-edit" onclick="openEditAdAccountModal('${a.id}')">✏️ এডিট</button><button type="button" class="danger sm perm-del" onclick="deleteAdAccount('${a.id}')">মুছুন</button></td></tr>`;
  }).join('') || `<tr><td colspan="6">কোনো অ্যাড অ্যাকাউন্ট যুক্ত নেই</td></tr>`;

  // Rates
  if ($('rateRows')) $('rateRows').innerHTML = [...db.rates].sort(byDateDesc).map(r => `<tr><td>${esc(r.date)}</td><td><strong>${money(r.value)}</strong></td><td>${esc(r.note || '—')}</td><td><button type="button" class="secondary sm perm-edit" onclick="openEditRateModal('${r.id}')">✏️ এডিট</button><button type="button" class="danger sm perm-del" onclick="deleteRate('${r.id}')">মুছুন</button></td></tr>`).join('') || `<tr><td colspan="4">কোনো দৈনিক রেট সেভ করা নেই</td></tr>`;

  // Works (Paginated + Bulk + Staff + Audit)
  const workQuery = ($('workSearch')?.value || '').toLowerCase(), statusFilter = $('workStatusFilter')?.value || '', custFilter = $('workCustomerFilter')?.value || '';
  const filteredWorksList = [...db.works].sort(byDateDesc).filter(w => (w.name.toLowerCase().includes(workQuery) || cname(w.customerId).toLowerCase().includes(workQuery) || pname(w.pageId).toLowerCase().includes(workQuery)) && (!statusFilter || (w.status || 'running') === statusFilter) && (!custFilter || w.customerId === custFilter));
  const totalWorkPages = Math.max(1, Math.ceil(filteredWorksList.length / PAGE_SIZE)); if (workPage > totalWorkPages) workPage = totalWorkPages;
  const pagedWorks = filteredWorksList.slice((workPage - 1) * PAGE_SIZE, workPage * PAGE_SIZE);

  if ($('workRows')) $('workRows').innerHTML = pagedWorks.map((w, idx) => {
    const st = w.status || 'running', stText = st === 'completed' ? 'সম্পন্ন' : (st === 'paused' ? 'পজ' : 'চলমান'), stClass = st === 'completed' ? 'status-completed' : (st === 'paused' ? 'status-paused' : 'status-running');
    const rev = num(w.revenue), totalCost = actual(w) + num(w.other), roasVal = totalCost > 0 ? (rev / totalCost).toFixed(2) : '0.00', convs = num(w.conversions), cpaVal = convs > 0 ? money(totalCost / convs) : '—';
    const creativeHtml = w.creativeLink ? `<br><a href="${esc(w.creativeLink)}" target="_blank" style="font-size:11px;color:var(--brand)">🎨 Creative</a>` : '';
    const staffTxt = w.staffName ? `<br><small class="muted">👤 ${esc(w.staffName)}</small>` : '', feeTxt = num(w.feePct) > 0 ? `<br><small class="muted">ফি ${w.feePct}%</small>` : '';
    const svcAmt = workServiceCharge(w), svcTxt = svcAmt > 0 ? `<br><small class="muted">+চার্জ ${money(svcAmt)}</small>` : '';
    const overBadge = (num(w.dollar) > 0 && num(w.actualDollar) > num(w.dollar)) ? `<span class="badge-warn" style="margin-left:4px">Over Budget</span>` : '';
    const lossBadge = (!isStaff() && profit(w) < 0) ? `<span class="badge-danger" style="margin-left:4px">Loss</span>` : '';
    return `<tr>
      <td><input type="checkbox" class="work-row-chk row-chk" data-id="${w.id}" ${selectedWorkIds.has(w.id) ? 'checked' : ''} onchange="toggleWorkSelect('${w.id}',this.checked)"></td>
      <td>#${(workPage - 1) * PAGE_SIZE + idx + 1}</td><td>${esc(w.date)}</td>
      <td><strong>${esc(cname(w.customerId))}</strong><br><small class="muted">${esc(pname(w.pageId))}</small></td>
      <td>${esc(w.name)}${overBadge}${staffTxt}${creativeHtml}</td>
      <td>${usd(w.actualDollar)} <small class="muted">/ ${usd(w.dollar)}</small>${progressBarHtml(num(w.actualDollar), num(w.dollar))}</td>
      <td>${money(bill(w))}${svcTxt}</td>
      ${isStaff() ? '' : `<td>${money(actual(w))}${feeTxt}</td><td class="${profit(w) >= 0 ? 'good' : 'bad'}">${money(profit(w))}${lossBadge}</td>`}
      <td><small>ROAS: <strong>${roasVal}x</strong><br>CPA: <strong>${cpaVal}</strong></small></td>
      <td><span class="badge-status ${stClass}">${stText}</span></td>
      <td><button type="button" class="secondary sm perm-edit" onclick="quickAddSpend('${w.id}')">+$</button><button type="button" class="secondary sm perm-edit" onclick="openEditWorkModal('${w.id}')">✏️</button><button type="button" class="secondary sm perm-edit" onclick="renewWork('${w.id}')">🔄</button><button type="button" class="secondary sm perm-edit" onclick="cloneWork('${w.id}')">কপি</button><button type="button" class="secondary sm" onclick="sendCampaignWhatsApp('${w.id}')">📲</button><button type="button" class="danger sm perm-del" onclick="deleteWork('${w.id}')">মুছুন</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="${isStaff() ? 10 : 12}">কোনো কাজ পাওয়া যায়নি</td></tr>`;
  renderPager('workPager', workPage, filteredWorksList.length, 'setWorkPage');
  updateWorkBulkBar();

  // Pixels
  if ($('pixelListRows')) $('pixelListRows').innerHTML = db.pages.filter(p => p.pixelId).map(p => `<tr><td>${esc(cname(p.customerId))}</td><td>${esc(p.name)}</td><td><code>${esc(p.pixelId)}</code></td><td><span class="badge-success">Active</span></td><td><button type="button" class="secondary sm" onclick="$('genPixelId').value='${esc(p.pixelId).replace(/'/g, "\\'")}';generatePixelCode();toast('পিক্সেল কোড জেনারেট হয়েছে')">কোড জেনারেট</button></td></tr>`).join('') || `<tr><td colspan="5">কোনো সেভ থাকা পিক্সেল আইডি নেই</td></tr>`;

  // Expenses (with Search + Category Filter)
  const expQ = ($('expSearch')?.value || '').toLowerCase(), expCat = $('expCatFilter')?.value || '';
  const filteredExps = [...db.expenses].sort(byDateDesc).filter(e => (!expCat || e.category === expCat) && (!expQ || e.title.toLowerCase().includes(expQ) || (e.note || '').toLowerCase().includes(expQ)));
  const totalAllOfficeExp = filteredExps.reduce((s, e) => s + num(e.amount), 0);
  if ($('expenseRows')) $('expenseRows').innerHTML = filteredExps.map(e => `<tr><td>${esc(e.date)}</td><td><strong>${esc(e.title)}</strong></td><td><span class="badge-admin">${esc(e.category)}</span> <small class="muted">${esc(e.method || 'Cash')}</small></td><td class="bad">${money(e.amount)}</td><td>${esc(e.note || '—')}</td><td><button type="button" class="secondary sm perm-edit" onclick="openEditExpenseModal('${e.id}')">✏️ এডিট</button><button type="button" class="danger sm perm-del" onclick="deleteExpense('${e.id}')">মুছুন</button></td></tr>`).join('') || `<tr><td colspan="6">কোনো খরচ রেকর্ড নেই</td></tr>`;
  if ($('totalExpenseSummary')) $('totalExpenseSummary').textContent = `মোট খরচ: ${money(totalAllOfficeExp)}`;
  if ($('expenseCategorySummary')) {
    const catTotals = {}; db.expenses.forEach(ex => { catTotals[ex.category] = (catTotals[ex.category] || 0) + num(ex.amount); });
    const allSum = db.expenses.reduce((s, x) => s + num(x.amount), 0);
    $('expenseCategorySummary').innerHTML = Object.entries(catTotals).sort((a,b) => b[1] - a[1]).map(([cat, amt]) => `<span class="badge-admin" style="padding:6px 11px;font-size:12px">${esc(cat)}: <strong>${money(amt)}</strong> (${allSum > 0 ? ((amt / allSum) * 100).toFixed(0) : 0}%)</span>`).join('');
  }
  updatePaymentCustomerStatus(); checkBackupReminder();

  // Payments (Search + Wallet Filter + Pagination + Receipt)
  const payQ = ($('paySearch')?.value || '').toLowerCase(), payM = $('payMethodFilter')?.value || '';
  const sortedPays = [...db.payments].sort(byDateDesc).filter(p => (!payM || p.method === payM) && (!payQ || cname(p.customerId).toLowerCase().includes(payQ) || (p.ref || '').toLowerCase().includes(payQ) || (p.note || '').toLowerCase().includes(payQ)));
  const totalPayPages = Math.max(1, Math.ceil(sortedPays.length / PAGE_SIZE)); if (payPage > totalPayPages) payPage = totalPayPages;
  const pagedPays = sortedPays.slice((payPage - 1) * PAGE_SIZE, payPage * PAGE_SIZE);
  if ($('paymentRows')) $('paymentRows').innerHTML = pagedPays.map(p => `<tr><td>${esc(p.date)}</td><td><strong>${esc(cname(p.customerId))}</strong></td><td class="good">${money(p.amount)}${num(p.fee) > 0 ? `<br><small class="bad">চার্জ: -${money(p.fee)}</small>` : ''}</td><td>${esc(p.method)}</td><td>${esc(p.ref || p.note || '—')}</td><td><button type="button" class="secondary sm" onclick="openPaymentReceipt('${p.id}')">🧾 রিসিপ্ট</button><button type="button" class="secondary sm perm-edit" onclick="openEditPaymentModal('${p.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deletePayment('${p.id}')">মুছুন</button></td></tr>`).join('') || `<tr><td colspan="6">কোনো পেমেন্ট রেকর্ড নেই</td></tr>`;
  renderPager('payPager', payPage, sortedPays.length, 'setPayPage');

  // Staff Commission & Summary Report
  if (!isStaff()) {
    if ($('staffCommRows')) {
      const sMap = {};
      db.works.forEach(w => { const key = w.staffName || 'অ্যাসাইন করা হয়নি'; if (!sMap[key]) sMap[key] = { name: key, count: 0, usd: 0, bill: 0, profit: 0, comm: 0 }; sMap[key].count++; sMap[key].usd += num(w.actualDollar); sMap[key].bill += bill(w); sMap[key].profit += profit(w); sMap[key].comm += workCommission(w); });
      $('staffCommRows').innerHTML = Object.values(sMap).sort((a,b) => b.profit - a.profit).map(s => `<tr><td><strong>${esc(s.name)}</strong></td><td>${s.count} টি</td><td>${usd(s.usd)}</td><td>${money(s.bill)}</td><td class="${s.profit >= 0 ? 'good' : 'bad'}">${money(s.profit)}</td><td style="color:var(--brand);font-weight:700">${money(s.comm)}</td></tr>`).join('') || `<tr><td colspan="6">কোনো কাজের ডেটা নেই</td></tr>`;
    }
    if ($('reportRows')) $('reportRows').innerHTML = db.customers.map(c => {
      const b = billed(c.id), p = paid(c.id), bal = p - b, cw = db.works.filter(w => w.customerId === c.id), totalUSD = cw.reduce((s, w) => s + num(w.actualDollar), 0), prCust = cw.reduce((s, w) => s + profit(w), 0);
      const balHtml = bal < 0 ? `<span class="bad">বকেয়া: ${money(-bal)}</span>` : (bal > 0 ? `<span class="good">অ্যাডভান্স: ${money(bal)}</span>` : `৳0.00`);
      return `<tr><td><strong>${esc(c.name)}</strong></td><td>${usd(totalUSD)}</td><td>${money(b)}</td><td>${money(p)}</td><td>${balHtml}</td><td class="${prCust >= 0 ? 'good' : 'bad'}">${money(prCust)}</td></tr>`;
    }).join('') || `<tr><td colspan="6">কোনো রিপোর্ট ডেটা নেই</td></tr>`;
  }
  renderDues();
}

if ($('customerSearch')) $('customerSearch').oninput = () => { custPage = 1; render(); };
if ($('workSearch')) $('workSearch').oninput = () => { workPage = 1; render(); };
if ($('workStatusFilter')) $('workStatusFilter').onchange = () => { workPage = 1; render(); };
if ($('workCustomerFilter')) $('workCustomerFilter').onchange = () => { workPage = 1; render(); };
if ($('expSearch')) $('expSearch').oninput = render;
if ($('expCatFilter')) $('expCatFilter').onchange = render;
if ($('paySearch')) $('paySearch').oninput = () => { payPage = 1; render(); };
if ($('payMethodFilter')) $('payMethodFilter').onchange = () => { payPage = 1; render(); };
if ($('dueSearch')) $('dueSearch').oninput = renderDues;

// Admin Panel
if ($('auRole')) $('auRole').onchange = () => { if ($('auPermsWrap')) $('auPermsWrap').style.display = $('auRole').value === 'staff' ? 'block' : 'none'; };
if ($('euRole')) $('euRole').onchange = () => { if ($('euPermsWrap')) $('euPermsWrap').style.display = $('euRole').value === 'staff' ? 'block' : 'none'; };

if ($('adminCreateUserForm')) $('adminCreateUserForm').onsubmit = e => {
  e.preventDefault(); if (!isSuperAdmin()) return toast('শুধু Super Admin ইউজার তৈরি করতে পারবেন!', 'error');
  const name = $('auName').value.trim(), username = $('auUsername').value.trim().toLowerCase(), contact = $('auContact').value.trim(), pass = $('auPass').value, role = $('auRole').value;
  if (!name || !username || pass.length < 6) return toast('সঠিক নাম, ইউজারনেম ও কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন!', 'error');
  if (username === 'admin') return toast('admin ইউজারনেম ব্যবহার করা যাবে না', 'error');
  const accounts = readLocalAccounts(); if (accounts.some(a => a.username === username)) return toast('এই ইউজারনেম আগেই আছে!', 'error');
  const perms = role === 'staff' ? { canDelete: Boolean($('auPermDel')?.checked), canEdit: Boolean($('auPermEdit')?.checked), canPayments: Boolean($('auPermPay')?.checked), canExpenses: Boolean($('auPermExp')?.checked) } : null;
  const isEmail = contact.includes('@'), next = Number(localStorage.getItem(NEXTUSERIDKEY) || 2);
  const newAcc = { id: uid(), updatedAt: Date.now(), userNumber: next, name, username, email: isEmail ? contact.toLowerCase() : '', phone: isEmail ? '' : contact, password: hashPass(pass), role, perms, status: 'active', lastLogin: 'এখনো লগইন করেনি', loginCount: 0 };
  accounts.push(newAcc); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); localStorage.setItem(NEXTUSERIDKEY, String(next + 1));
  localStorage.setItem('ads_hisab_user_profile_v72_' + newAcc.id, JSON.stringify({ name, email: newAcc.email, phone: newAcc.phone, pic: '' }));
  logActivity(`নতুন ${role} অ্যাকাউন্ট তৈরি: ${name}`); e.target.reset();
  if ($('auPermEdit')) $('auPermEdit').checked = true; if ($('auPermPay')) $('auPermPay').checked = true;
  if ($('auPermExp')) $('auPermExp').checked = true; if ($('auPermsWrap')) $('auPermsWrap').style.display = 'block';
  renderAdminPanel(); triggerAccountCloudSync(); toast(`${name} (${role}) অ্যাকাউন্ট তৈরি ও সিঙ্ক হয়েছে!`);
};

window.openEditUserModal = function(userId) {
  if (!isSuperAdmin()) return toast('শুধু Super Admin এটি করতে পারবেন!', 'error');
  const acc = readLocalAccounts().find(a => a.id === userId); if (!acc) return;
  $('euId').value = acc.id; $('euName').value = acc.name; $('euUsername').value = acc.username;
  $('euEmail').value = acc.email || ''; $('euPhone').value = acc.phone || '';
  $('euRole').value = acc.role || 'user'; $('euStatus').value = acc.status || 'active'; $('euNewPass').value = '';
  const p = { canDelete: false, canEdit: true, canPayments: true, canExpenses: true, ...(acc.perms || {}) };
  $('euPermDel').checked = Boolean(p.canDelete); $('euPermEdit').checked = Boolean(p.canEdit); $('euPermPay').checked = Boolean(p.canPayments); $('euPermExp').checked = Boolean(p.canExpenses);
  $('euPermsWrap').style.display = $('euRole').value === 'staff' ? 'block' : 'none'; $('editUserModal').style.display = 'flex';
};
if ($('editUserForm')) $('editUserForm').onsubmit = e => {
  e.preventDefault(); if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error');
  const id = $('euId').value, accounts = readLocalAccounts(), idx = accounts.findIndex(a => a.id === id); if (idx === -1) return;
  const newU = $('euUsername').value.trim().toLowerCase();
  if (newU === 'admin' || accounts.some(a => a.id !== id && a.username === newU)) return toast('এই ইউজারনেম ব্যবহার করা যাবে না!', 'error');
  const np = $('euNewPass').value.trim(); if (np && np.length < 6) return toast('নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে!', 'error');
  const role = $('euRole').value;
  accounts[idx].name = $('euName').value.trim(); accounts[idx].username = newU;
  accounts[idx].email = $('euEmail').value.trim().toLowerCase(); accounts[idx].phone = $('euPhone').value.trim();
  accounts[idx].role = role; accounts[idx].status = $('euStatus').value; accounts[idx].updatedAt = Date.now();
  if (np) accounts[idx].password = hashPass(np);
  if (role === 'staff') accounts[idx].perms = { canDelete: $('euPermDel').checked, canEdit: $('euPermEdit').checked, canPayments: $('euPermPay').checked, canExpenses: $('euPermExp').checked };
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); logActivity(`ইউজার আপডেট: ${accounts[idx].name}`);
  closeModal('editUserModal'); renderAdminPanel(); triggerAccountCloudSync(); toast('ইউজারের তথ্য আপডেট ও সিঙ্ক হয়েছে!');
};

window.impersonateUser = function(userId) {
  if (!isSuperAdmin()) return toast('শুধুমাত্র সুপার অ্যাডমিন এটি ব্যবহার করতে পারবেন!', 'error');
  const acc = readLocalAccounts().find(a => a.id === userId); if (!acc) return;
  if (!realSuperAdmin) realSuperAdmin = activeAccount;
  activeAccount = acc; applyPermissionClasses(); activateAccountData(acc);
  if ($('impersonateBanner')) $('impersonateBanner').style.display = 'flex';
  if ($('impersonateName')) $('impersonateName').textContent = `${acc.name} (@${acc.username})`;
  updateHeaderAndProfile(); goToSection('dash'); toast(`এখন ${acc.name}-এর ওয়ার্কস্পেস প্রিভিউ হচ্ছে`);
};
if ($('exitImpersonateBtn')) $('exitImpersonateBtn').onclick = () => {
  if (!realSuperAdmin) return; activeAccount = realSuperAdmin; realSuperAdmin = null;
  if ($('impersonateBanner')) $('impersonateBanner').style.display = 'none';
  applyPermissionClasses(); activateAccountData(activeAccount); updateHeaderAndProfile(); goToSection('adminPanel'); toast('সুপার অ্যাডমিন ওয়ার্কস্পেসে ফিরে এসেছেন!');
};

window.switchAdminSubTab = function(tabName) {
  if (!isSuperAdmin() && ['users', 'trash', 'cloud'].includes(tabName)) tabName = 'help';
  const map = { users: ['adminTabUsersBtn','adminUsersSubPanel'], help: ['adminTabHelpBtn','adminHelpSubPanel'], trash: ['adminTabTrashBtn','adminTrashSubPanel'], cloud: ['adminTabCloudBtn','adminCloudSubPanel'], logs: ['adminTabLogsBtn','adminLogsSubPanel'] };
  Object.entries(map).forEach(([k, [btnId, panelId]]) => { if ($(btnId)) $(btnId).classList.toggle('active', k === tabName); if ($(panelId)) $(panelId).style.display = k === tabName ? 'block' : 'none'; });
  renderAdminPanel();
};
window.toggleUserStatus = function(userId) {
  if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error');
  const accounts = readLocalAccounts(), acc = accounts.find(a => a.id === userId); if (!acc) return;
  acc.status = acc.status === 'suspended' ? 'active' : 'suspended'; acc.updatedAt = Date.now();
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); logActivity(`স্ট্যাটাস পরিবর্তন: ${acc.name} -> ${acc.status}`);
  triggerAccountCloudSync(); toast(`${acc.name} এখন ${acc.status === 'suspended' ? 'ব্লকড' : 'সচল'}`); renderAdminPanel();
};
window.deleteAccount = function(userId) {
  if (!isSuperAdmin() || !confirm('এই ইউজারের অ্যাকাউন্ট ও সমস্ত ডেটা স্থায়ীভাবে ডিলিট করতে চান?')) return;
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(readLocalAccounts().filter(a => a.id !== userId)));
  localStorage.removeItem('ads_hisab_user_data_v72_' + userId); localStorage.removeItem('ads_hisab_user_profile_v72_' + userId);
  logActivity(`অ্যাকাউন্ট ডিলিট: ${userId}`); triggerAccountCloudSync(); toast('অ্যাকাউন্ট ডিলিট হয়েছে!', 'warn'); renderAdminPanel();
};

function renderAdminPanel() {
  updateStorageMeter();
  if (isSuperAdmin()) {
    const accounts = readLocalAccounts();
    if ($('saTotal')) $('saTotal').textContent = accounts.length + 1;
    if ($('saAdmins')) $('saAdmins').textContent = 1 + accounts.filter(a => a.role === 'admin' || a.role === 'staff').length;
    if ($('saUsers')) $('saUsers').textContent = accounts.filter(a => a.role === 'user').length;
    if ($('saSuspended')) $('saSuspended').textContent = accounts.filter(a => a.status === 'suspended').length;
    if ($('saUserRows')) {
      const adminP = readProfile(), saMeta = readSuperAdminMeta();
      $('saUserRows').innerHTML = `<tr><td>AS-00001</td><td><strong>${esc(adminP.name || 'Super Admin')}</strong> <small class="muted">(@admin)</small></td><td>${esc(adminP.email || 'admin@example.com')}<br><small class="muted">${esc(adminP.phone || '01700000000')}</small></td><td><span class="badge-success">Super Admin</span></td><td><small>${esc(saMeta.lastLogin || 'সক্রিয়')}<br>লগইন: ${num(saMeta.loginCount)} বার</small></td><td><span class="badge-success">Active</span></td><td>—</td></tr>` +
        accounts.map(a => {
          const rBadge = a.role === 'admin' ? '<span class="badge-admin">Admin</span>' : (a.role === 'staff' ? '<span class="badge-status status-running">Staff</span>' : '<span class="badge-success">User</span>');
          let wsStats = '<small class="muted">শেয়ার্ড ওয়ার্কস্পেস</small>';
          if (a.role !== 'staff') { try { const udb = normalizeDb(JSON.parse(localStorage.getItem('ads_hisab_user_data_v72_' + a.id) || '{}')); wsStats = `<small class="muted">কাস্টমার: ${udb.customers.length} · কাজ: ${udb.works.length}</small>`; } catch (e) {} }
          else { const p = { canDelete: false, canEdit: true, canPayments: true, canExpenses: true, ...(a.perms || {}) }; wsStats = `<small class="muted">${p.canDelete ? 'Del✓' : 'Del✕'} ${p.canEdit ? 'Edit✓' : 'Edit✕'} ${p.canPayments ? 'Pay✓' : 'Pay✕'}</small>`; }
          const previewBtn = (a.role !== 'staff') ? `<button type="button" class="secondary sm" onclick="impersonateUser('${a.id}')">👁️</button>` : '';
          return `<tr><td>AS-${String(a.userNumber || 2).padStart(5, '0')}</td><td><strong>${esc(a.name)}</strong><br><small class="muted">@${esc(a.username)}</small></td><td>${esc(a.email || '—')}<br><small class="muted">${esc(a.phone || '—')}</small></td><td>${rBadge}<br>${wsStats}</td><td><small>${esc(a.lastLogin || 'কখনো না')}<br>মোট: ${num(a.loginCount)} বার</small></td><td>${a.status === 'suspended' ? '<span class="badge-danger">Suspended</span>' : '<span class="badge-success">Active</span>'}</td><td>${previewBtn}<button type="button" class="secondary sm" onclick="openEditUserModal('${a.id}')">✏️ এডিট</button><button type="button" class="warn sm" onclick="toggleUserStatus('${a.id}')">${a.status === 'suspended' ? 'আনব্লক' : 'ব্লক'}</button><button type="button" class="danger sm" onclick="deleteAccount('${a.id}')">ডিলিট</button></td></tr>`;
        }).join('');
    }
    if ($('trashRows')) $('trashRows').innerHTML = (db.trash || []).map(t => `<tr><td><span class="badge-status status-running">${esc(t.type)}</span></td><td><strong>${esc(t.label)}</strong></td><td><small>${esc(t.deletedAt)}<br>ডিলিটকারী: ${esc(t.deletedBy)}</small></td><td><button type="button" class="secondary sm" onclick="restoreTrash('${t.id}')">♻️ রিস্টোর</button><button type="button" class="danger sm" onclick="permDeleteTrash('${t.id}')">স্থায়ী ডিলিট</button></td></tr>`).join('') || `<tr><td colspan="4">রিসাইকেল বিন খালি 🎉</td></tr>`;
    const sc = readCloudSync();
    if ($('csUrl') && document.activeElement !== $('csUrl')) $('csUrl').value = sc.url || '';
    if ($('csSecret') && document.activeElement !== $('csSecret')) $('csSecret').value = sc.secret || '';
    if ($('csAutoSync')) $('csAutoSync').checked = Boolean(sc.autoSync);
    if ($('csLastSyncText')) $('csLastSyncText').textContent = sc.lastSync ? `সর্বশেষ সিঙ্ক: ${sc.lastSync}` : '';
  }
  const helps = readHelpRequests().filter(h => isSuperAdmin() || h.target !== 'Super Admin'), openCount = helps.filter(h => h.status === 'open').length;
  if ($('helpOpenBadge')) { $('helpOpenBadge').style.display = openCount ? 'inline-block' : 'none'; $('helpOpenBadge').textContent = openCount; }
  if ($('helpReqRows')) $('helpReqRows').innerHTML = helps.map(h => {
    const wa = normalizeBdPhone(h.contact), waBtn = wa.length >= 11 ? `<a href="https://wa.me/${wa}" target="_blank" style="text-decoration:none"><button type="button" class="secondary sm">📲</button></a>` : '';
    return `<tr><td><small>${esc(h.time)}</small></td><td><span class="badge-admin">${esc(h.target)}</span><br><strong>${esc(h.topic)}</strong></td><td><strong>${esc(h.name)}</strong><br><small class="muted">${esc(h.contact)}</small></td><td style="max-width:260px;white-space:normal">${esc(h.message)}</td><td>${h.status === 'resolved' ? '<span class="badge-success">সমাধান</span>' : '<span class="badge-danger">অপেক্ষমাণ</span>'}</td><td>${waBtn}<button type="button" class="secondary sm" onclick="resolveHelpReq('${h.id}')">${h.status === 'resolved' ? 'Reopen' : '✓ সমাধান'}</button><button type="button" class="danger sm" onclick="deleteHelpReq('${h.id}')">মুছুন</button></td></tr>`;
  }).join('') || `<tr><td colspan="6">কোনো হেল্প মেসেজ আসেনি</td></tr>`;
  if ($('activityLogRows')) $('activityLogRows').innerHTML = db.activityLogs.map(l => `<tr><td>${esc(l.time)}</td><td>${esc(l.text)}</td></tr>`).join('') || `<tr><td colspan="2">কোনো লগ নেই</td></tr>`;
}

// Conflict-Free Master Merge Engine & Cloud Sync
function mergeArrayById(arrA, arrB, deletedMap) {
  const map = new Map();
  const put = item => {
    if (!item || !item.id) return;
    const delTs = num(deletedMap[item.id]), itemTs = num(item.updatedAt);
    if (delTs > 0 && delTs >= itemTs) return;
    const prev = map.get(item.id); if (!prev || itemTs >= num(prev.updatedAt)) map.set(item.id, item);
  };
  (arrA || []).forEach(put); (arrB || []).forEach(put); return Array.from(map.values());
}

function mergeDbObjects(localRaw, remoteRaw) {
  const L = normalizeDb(localRaw), R = normalizeDb(remoteRaw), deletedIds = { ...L.deletedIds };
  Object.entries(R.deletedIds).forEach(([k, v]) => { deletedIds[k] = Math.max(num(deletedIds[k]), num(v)); });
  const collections = ['rates','customers','pages','works','payments','cardDeposits','cardTransfers','cardRefunds','adAccounts','cashAdjustments','cards','expenses','trash'];
  const merged = blank();
  merged.updatedAt = Math.max(L.updatedAt, R.updatedAt); merged.deletedIds = deletedIds;
  merged.wallets = [...new Set([...(L.wallets || []), ...(R.wallets || [])])];
  collections.forEach(c => { merged[c] = mergeArrayById(L[c], R[c], deletedIds); });
  merged.reminderLogs = { ...R.reminderLogs, ...L.reminderLogs };
  merged.agency = L.updatedAt >= R.updatedAt ? L.agency : R.agency;
  const logSeen = new Set();
  merged.activityLogs = [...L.activityLogs, ...R.activityLogs].filter(l => { const k = `${l.time}|${l.text}`; if (logSeen.has(k)) return false; logSeen.add(k); return true; }).slice(0, 150);
  return merged;
}

function mergeMasterSnapshots(localSnap, remoteSnap) {
  if (!remoteSnap || remoteSnap.type !== 'ads_hisab_master_backup_v72') return localSnap;
  const accMap = new Map();
  [...(remoteSnap.accounts || []), ...(localSnap.accounts || [])].forEach(a => { if (!a || !a.id) return; const prev = accMap.get(a.id); if (!prev || num(a.updatedAt) >= num(prev.updatedAt)) accMap.set(a.id, a); });
  const mergedUserDbs = {}, allUserIds = new Set([...Object.keys(localSnap.userDbs || {}), ...Object.keys(remoteSnap.userDbs || {})]);
  allUserIds.forEach(id => { mergedUserDbs[id] = (localSnap.userDbs?.[id] && remoteSnap.userDbs?.[id]) ? mergeDbObjects(localSnap.userDbs[id], remoteSnap.userDbs[id]) : normalizeDb(localSnap.userDbs?.[id] || remoteSnap.userDbs?.[id]); });
  const helpMap = new Map(); [...(remoteSnap.helpRequests || []), ...(localSnap.helpRequests || [])].forEach(h => { if (h?.id) helpMap.set(h.id, h); });
  return {
    type: 'ads_hisab_master_backup_v72', snapshotTs: Date.now(), exportedAt: new Date().toISOString(),
    accounts: Array.from(accMap.values()), nextUserId: String(Math.max(num(localSnap.nextUserId), num(remoteSnap.nextUserId)) || 2),
    superAdminPass: num(remoteSnap.snapshotTs) > num(localSnap.snapshotTs) ? (remoteSnap.superAdminPass || localSnap.superAdminPass) : localSnap.superAdminPass,
    superAdminMeta: num(remoteSnap.snapshotTs) > num(localSnap.snapshotTs) ? (remoteSnap.superAdminMeta || localSnap.superAdminMeta) : localSnap.superAdminMeta,
    masterDb: mergeDbObjects(localSnap.masterDb, remoteSnap.masterDb),
    masterProfile: (localSnap.masterProfile && Object.keys(localSnap.masterProfile).length) ? localSnap.masterProfile : (remoteSnap.masterProfile || {}),
    userDbs: mergedUserDbs, userProfiles: { ...(remoteSnap.userProfiles || {}), ...(localSnap.userProfiles || {}) },
    helpRequests: Array.from(helpMap.values()).slice(0, 100)
  };
}

function buildMasterSnapshot() {
  const accounts = readLocalAccounts(), userDbs = {}, userProfiles = {};
  accounts.forEach(a => { try { const rawD = localStorage.getItem('ads_hisab_user_data_v72_' + a.id); if (rawD) userDbs[a.id] = JSON.parse(rawD); } catch (e) {} try { const rawP = localStorage.getItem('ads_hisab_user_profile_v72_' + a.id); if (rawP) userProfiles[a.id] = JSON.parse(rawP); } catch (e) {} });
  return {
    type: 'ads_hisab_master_backup_v72', snapshotTs: Date.now(), exportedAt: new Date().toISOString(),
    accounts, nextUserId: localStorage.getItem(NEXTUSERIDKEY) || '2', superAdminPass: localStorage.getItem(PASSKEY) || hashPass('123456789'),
    superAdminMeta: readSuperAdminMeta(), masterDb: normalizeDb(JSON.parse(localStorage.getItem(MASTER_DB_KEY) || '{}')),
    masterProfile: (() => { try { return JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_legacy-super-admin') || '{}'); } catch (e) { return {}; } })(),
    userDbs, userProfiles, helpRequests: readHelpRequests()
  };
}

function applyMasterSnapshot(snap) {
  if (!snap || snap.type !== 'ads_hisab_master_backup_v72') throw new Error('Invalid Master Backup');
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(Array.isArray(snap.accounts) ? snap.accounts : []));
  if (snap.nextUserId) localStorage.setItem(NEXTUSERIDKEY, String(snap.nextUserId));
  if (snap.superAdminPass) localStorage.setItem(PASSKEY, snap.superAdminPass);
  if (snap.superAdminMeta) localStorage.setItem(SUPERADMIN_META_KEY, JSON.stringify(snap.superAdminMeta));
  if (snap.masterDb) localStorage.setItem(MASTER_DB_KEY, JSON.stringify(normalizeDb(snap.masterDb)));
  if (snap.masterProfile) localStorage.setItem('ads_hisab_user_profile_v72_legacy-super-admin', JSON.stringify(snap.masterProfile));
  Object.entries(snap.userDbs || {}).forEach(([id, data]) => localStorage.setItem('ads_hisab_user_data_v72_' + id, JSON.stringify(normalizeDb(data))));
  Object.entries(snap.userProfiles || {}).forEach(([id, prof]) => localStorage.setItem('ads_hisab_user_profile_v72_' + id, JSON.stringify(prof)));
  if (Array.isArray(snap.helpRequests)) writeHelpRequests(snap.helpRequests);
  localStorage.setItem(LAST_BACKUP_KEY, today()); if (snap.snapshotTs) localStorage.setItem(LAST_CLOUD_TS_KEY, String(snap.snapshotTs));
  loadDb(); applyAgencyBranding(); render(); renderAdminPanel();
}

if ($('masterBackupBtn')) $('masterBackupBtn').onclick = () => { if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error'); downloadBlob(JSON.stringify(buildMasterSnapshot(), null, 2), `ads_hisab_MASTER_backup_${today()}.json`, 'application/json'); localStorage.setItem(LAST_BACKUP_KEY, today()); checkBackupReminder(); toast('মাস্টার ফুল ব্যাকআপ ডাউনলোড হয়েছে!'); };
if ($('masterRestoreFile')) $('masterRestoreFile').onchange = e => {
  if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error'); const file = e.target.files?.[0]; if (!file) return;
  const reader = new FileReader(); reader.onload = evt => { try { applyMasterSnapshot(JSON.parse(evt.target.result)); toast('মাস্টার ব্যাকআপ রিস্টোর হয়েছে!'); } catch (err) { toast('সঠিক মাস্টার ব্যাকআপ ফাইল নয়!', 'error'); } e.target.value = ''; }; reader.readAsText(file);
};

function readCloudSync() {
  try { const saved = JSON.parse(localStorage.getItem(CLOUD_SYNC_KEY) || '{}'); if (!saved.url && DEFAULT_CLOUD_URL) saved.url = DEFAULT_CLOUD_URL; if (DEFAULT_CLOUD_URL && saved.autoSync === undefined) saved.autoSync = true; return saved; }
  catch (e) { return DEFAULT_CLOUD_URL ? { url: DEFAULT_CLOUD_URL, autoSync: true } : {}; }
}
function writeCloudSync(cfg) { try { localStorage.setItem(CLOUD_SYNC_KEY, JSON.stringify(cfg)); } catch (e) {} }
function buildCloudEndpoint(url, secret) { const clean = String(url || '').trim().replace(/\/+$/, ''); return clean ? `${clean}/ads_hisab_master_v72.json` + (secret ? `?auth=${encodeURIComponent(secret)}` : '') : ''; }

async function pushToCloud(silent = false) {
  const cfg = readCloudSync(), endpoint = buildCloudEndpoint(cfg.url, cfg.secret);
  if (!endpoint) { if (!silent) toast('প্রথমে Firebase Database URL সেভ করুন!', 'error'); return; }
  setSyncUi('busy', 'Syncing...');
  try {
    let snapToPush = buildMasterSnapshot(); const lastKnownTs = num(localStorage.getItem(LAST_CLOUD_TS_KEY));
    try { const checkRes = await fetch(endpoint); if (checkRes.ok) { const remote = await checkRes.json(); if (remote && remote.type === 'ads_hisab_master_backup_v72' && num(remote.snapshotTs) > lastKnownTs) { snapToPush = mergeMasterSnapshots(snapToPush, remote); applyMasterSnapshot(snapToPush); } } } catch (e) {}
    const res = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapToPush) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    localStorage.setItem(LAST_CLOUD_TS_KEY, String(snapToPush.snapshotTs)); localStorage.removeItem(LOCAL_DIRTY_KEY);
    cfg.lastSync = new Date().toLocaleString('bn-BD'); writeCloudSync(cfg);
    if ($('csLastSyncText')) $('csLastSyncText').textContent = `সর্বশেষ সিঙ্ক: ${cfg.lastSync}`;
    setSyncUi('ok', 'Synced'); if (!silent) toast('ক্লাউডে স্মার্ট মার্জ ও সেভ হয়েছে!');
  } catch (err) { setSyncUi('err', 'Sync Failed'); if (!silent) toast('ক্লাউডে পাঠাতে সমস্যা হয়েছে!', 'error'); }
}
async function pullFromCloud(silent = false, customUrl = '', customSecret = '') {
  const cfg = readCloudSync(), url = customUrl || cfg.url, secret = customSecret !== '' ? customSecret : cfg.secret, endpoint = buildCloudEndpoint(url, secret);
  if (!endpoint) { if (!silent) toast('Firebase Database URL দিন!', 'error'); return false; }
  if (!silent) setSyncUi('busy', 'Pulling...');
  try {
    const res = await fetch(endpoint); if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || data.type !== 'ads_hisab_master_backup_v72') { setSyncUi('ok', 'Connected'); if (!silent) toast('ক্লাউডে কোনো ভ্যালিড ব্যাকআপ ডেটা নেই!', 'warn'); return false; }
    const lastKnownTs = num(localStorage.getItem(LAST_CLOUD_TS_KEY));
    if (silent && num(data.snapshotTs) <= lastKnownTs) { setSyncUi('ok', 'Synced'); return false; }
    const isDirty = localStorage.getItem(LOCAL_DIRTY_KEY) === '1', finalSnap = isDirty ? mergeMasterSnapshots(buildMasterSnapshot(), data) : data;
    applyMasterSnapshot(finalSnap);
    writeCloudSync({ ...cfg, url, secret, lastSync: new Date().toLocaleString('bn-BD') });
    if (isDirty) {
      await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(finalSnap) });
      localStorage.removeItem(LOCAL_DIRTY_KEY);
    }
    setSyncUi('ok', 'Synced');
    if (!silent) toast('ক্লাউড থেকে সব ডেটা সফলভাবে মার্জ ও সিঙ্ক হয়েছে!');
    return true;
  } catch (err) {
    setSyncUi('err', 'Offline');
    if (!silent) toast('ক্লাউড থেকে আনতে সমস্যা হয়েছে!', 'error');
    return false;
  }
}

// 30-second real-time background sync
setInterval(() => {
  if (!activeAccount || !navigator.onLine) return;
  const cfg = readCloudSync();
  if (cfg.autoSync && cfg.url && localStorage.getItem(LOCAL_DIRTY_KEY) !== '1') {
    pullFromCloud(true, cfg.url, cfg.secret || '');
  }
}, 30000);

if ($('cloudSyncForm')) $('cloudSyncForm').onsubmit = e => {
  e.preventDefault(); if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error');
  const cfg = readCloudSync();
  writeCloudSync({ ...cfg, url: $('csUrl').value.trim(), secret: $('csSecret').value.trim(), autoSync: $('csAutoSync').checked });
  toast('ক্লাউড সিঙ্ক সেটিংস সেভ হয়েছে!');
};
if ($('csPushBtn')) $('csPushBtn').onclick = () => { if (isSuperAdmin()) withBtnLoading($('csPushBtn'), '⏳ Push হচ্ছে...', () => pushToCloud(false)); };
if ($('csPullBtn')) $('csPullBtn').onclick = () => { if (isSuperAdmin() && confirm('ক্লাউডের ডেটা দিয়ে এই ডিভাইসের ডেটা মার্জ ও আপডেট করতে চান?')) withBtnLoading($('csPullBtn'), '⏳ Pull হচ্ছে...', () => pullFromCloud(false)); };

// Export CSV & Backup
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

if ($('exportCsvBtn')) $('exportCsvBtn').onclick = () => {
  const rows = [['Customer','Phone','USD Spent','Bill (BDT)','Paid (BDT)','Due (BDT)','Advance (BDT)','Net Profit (BDT)']];
  db.customers.forEach(c => { const b = billed(c.id), p = paid(c.id), bal = p - b, cw = db.works.filter(w => w.customerId === c.id); rows.push([c.name, c.phone || '', cw.reduce((s,w)=>s+num(w.actualDollar),0).toFixed(2), b.toFixed(2), p.toFixed(2), Math.max(0,-bal).toFixed(2), Math.max(0,bal).toFixed(2), cw.reduce((s,w)=>s+profit(w),0).toFixed(2)]); });
  downloadBlob('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), `ads_hisab_customers_${today()}.csv`, 'text/csv;charset=utf-8;');
  toast('কাস্টমার সামারি CSV ডাউনলোড হয়েছে!');
};
if ($('exportWorksCsvBtn')) $('exportWorksCsvBtn').onclick = () => {
  const rows = [['Date','Customer','Page','Campaign','Staff','Budget USD','Actual USD','Bill Rate','Service Fee','Bill BDT','Buy Rate','Fee %','Total Cost BDT','Profit BDT','Commission','Status']];
  db.works.forEach(w => { rows.push([w.date, cname(w.customerId), pname(w.pageId), w.name, w.staffName || '', num(w.dollar), num(w.actualDollar), num(w.rate), workServiceCharge(w).toFixed(2), bill(w).toFixed(2), num(w.actualRate), num(w.feePct), actual(w).toFixed(2), profit(w).toFixed(2), workCommission(w).toFixed(2), w.status]); });
  downloadBlob('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), `ads_hisab_works_${today()}.csv`, 'text/csv;charset=utf-8;');
  toast('কাজের বিস্তারিত CSV ডাউনলোড হয়েছে!');
};
if ($('backupBtn')) $('backupBtn').onclick = () => { downloadBlob(JSON.stringify(db, null, 2), `ads_hisab_backup_${today()}.json`, 'application/json'); localStorage.setItem(LAST_BACKUP_KEY, today()); checkBackupReminder(); toast('JSON ব্যাকআপ ডাউনলোড হয়েছে!'); };
if ($('restoreFile')) $('restoreFile').onchange = e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (parsed && parsed.type === 'ads_hisab_master_backup_v72') { if (!isSuperAdmin()) return toast('মাস্টার ব্যাকআপ শুধু Super Admin রিস্টোর করতে পারবেন!', 'error'); applyMasterSnapshot(parsed); toast('মাস্টার ব্যাকআপ রিস্টোর হয়েছে!'); }
      else { db = normalizeDb(parsed); save(); applyAgencyBranding(); toast('ব্যাকআপ সফলভাবে রিস্টোর হয়েছে!'); }
    } catch (err) { toast('ফাইল ফরম্যাট সঠিক নয়!', 'error'); }
    e.target.value = '';
  };
  reader.readAsText(file);
};
if ($('wipeBtn')) $('wipeBtn').onclick = () => { if (confirm('সতর্কতা: বর্তমান অ্যাকাউন্টের সকল ডেটা মুছে ফেলা হবে!')) { db = blank(); save(); applyAgencyBranding(); toast('সকল ডেটা মুছে ফেলা হয়েছে', 'warn'); } };
if ($('printBtn')) $('printBtn').onclick = () => window.print();

// Online + Local Team Chat
let refreshOnlineChat = () => {};
(function initOnlineChat() {
  const key = 'ads_manager_local_chat_v72', list = $('chatMessages'), form = $('chatForm'), input = $('chatInput'), clearBtn = $('clearChatBtn');
  if (!list || !form || !input) return;
  const getChatEndpoint = () => { const cfg = readCloudSync(), clean = String(cfg.url || '').trim().replace(/\/+$/, ''); return clean ? `${clean}/ads_hisab_chat_v72.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '') : ''; };
  let messages = []; try { messages = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { messages = []; }

  const draw = () => {
    const ep = getChatEndpoint();
    if ($('chatModeBadge')) { $('chatModeBadge').textContent = ep ? '🟢 Online Live' : '🟡 Local Mode'; $('chatModeBadge').className = ep ? 'badge-success' : 'badge-status status-running'; }
    const me = activeAccount?.username || '';
    list.innerHTML = '<div class="chat-msg">আসসালামু আলাইকুম! টিমের জরুরি নোট বা মেসেজ এখানে পাঠাতে পারেন।<small>System · প্রস্তুত</small></div>' +
      messages.map(m => `<div class="chat-msg ${(!m.username || m.username === me) ? 'mine' : ''}">${esc(m.text)}<small>${m.sender ? `${esc(m.sender)} (${esc(m.role || 'user')}) · ` : ''}${esc(m.time)}</small></div>`).join('');
    list.scrollTop = list.scrollHeight;
  };
  refreshOnlineChat = async () => {
    const ep = getChatEndpoint(); if (!ep) { draw(); return; }
    try {
      const res = await fetch(ep); if (!res.ok) return; const data = await res.json();
      if (data && typeof data === 'object') { messages = Object.values(data).filter(x => x && x.text).sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(-120); try { localStorage.setItem(key, JSON.stringify(messages)); } catch (e) {} }
      else if (data === null) { messages = []; localStorage.setItem(key, '[]'); }
      draw();
    } catch (e) { draw(); }
  };
  draw();
  if ($('chatRefreshBtn')) $('chatRefreshBtn').onclick = () => { refreshOnlineChat(); toast('চ্যাট রিফ্রেশ হয়েছে!'); };
  setInterval(() => { if (activeAccount && $('liveChat')?.classList.contains('active')) refreshOnlineChat(); }, 5000);
  form.addEventListener('submit', async e => {
    e.preventDefault(); const value = input.value.trim(); if (!value) return;
    const msgObj = { id: uid(), sender: activeAccount?.name || 'User', role: activeAccount?.role || 'user', username: activeAccount?.username || '', text: value, time: new Date().toLocaleString('bn-BD'), ts: Date.now() };
    messages.push(msgObj); try { localStorage.setItem(key, JSON.stringify(messages)); } catch (err) {}
    input.value = ''; draw(); const ep = getChatEndpoint();
    if (ep) { try { await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msgObj) }); } catch (err) {} }
  });
  if (clearBtn) clearBtn.onclick = async () => {
    if (!isSuperAdmin() || !confirm('সব চ্যাট/নোট মুছে ফেলতে চান?')) return;
    messages = []; localStorage.setItem(key, '[]'); const ep = getChatEndpoint();
    if (ep) { try { await fetch(ep, { method: 'DELETE' }); } catch (err) {} }
    draw(); toast('চ্যাট পরিষ্কার হয়েছে', 'warn');
  };
})();

// Read-Only Client Portal (?portal=ID_TOKEN)
async function checkAndRenderPortal() {
  const portalKey = new URLSearchParams(location.search).get('portal');
  if (!portalKey) return false;
  if ($('authOverlay')) $('authOverlay').style.display = 'none';
  if ($('clientPortalOverlay')) $('clientPortalOverlay').style.display = 'flex';
  const cfg = readCloudSync(), clean = String(cfg.url || DEFAULT_CLOUD_URL || '').trim().replace(/\/+$/, '');
  const endpoint = `${clean}/ads_hisab_portals/${encodeURIComponent(portalKey)}.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '');
  try {
    const res = await fetch(endpoint); if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json(); if (!d || !d.customerName) throw new Error('Not found');
    const bal = num(d.balance), balTxt = bal < 0 ? `<span class="bad">বকেয়া বাকি: ${money(-bal)}</span>` : (bal > 0 ? `<span class="good">অ্যাডভান্স জমা: ${money(bal)}</span>` : `<span class="good">৳0.00 (সমন্বিত)</span>`);
    $('portalBody').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--brand);padding-bottom:12px;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <div><h2 style="margin:0;color:var(--brand)">${esc(d.agencyName)}</h2><small class="muted">ক্লায়েন্ট লাইভ হিসাব পোর্টাল · আপডেট: ${esc(d.updatedAt || '')}</small></div>
        <div style="text-align:right"><strong>👤 ${esc(d.customerName)}</strong><br><small class="muted">${d.agencyPhone ? 'যোগাযোগ: ' + esc(d.agencyPhone) : ''}</small></div>
      </div>
      <div class="metrics-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        <div class="metric-card m2"><small>মোট বিল</small><strong>${money(d.totalBill)}</strong></div>
        <div class="metric-card m3"><small>মোট জমা</small><strong>${money(d.totalPaid)}</strong></div>
        <div class="metric-card ${bal < 0 ? 'm4' : 'm1'}"><small>বর্তমান ব্যালেন্স</small><strong>${bal < 0 ? money(-bal) : money(bal)}</strong><span class="trend">${bal < 0 ? 'বকেয়া' : (bal > 0 ? 'অ্যাডভান্স' : 'সমন্বিত')}</span></div>
      </div>
      <div style="margin-bottom:14px">${balTxt}</div>
      ${d.payInfo ? `<div style="padding:10px 12px;background:var(--soft);border:1px solid var(--line);border-radius:10px;font-size:13px;margin-bottom:16px"><strong>💳 পেমেন্ট মাধ্যম:</strong> ${esc(d.payInfo)}</div>` : ''}
      <h3>⚡ ক্যাম্পেইনসমূহ (${(d.works || []).length})</h3>
      <div class="tablewrap" style="margin-bottom:18px"><table><thead><tr><th>তারিখ</th><th>ক্যাম্পেইন</th><th>ব্যবহৃত $</th><th>মোট বিল</th><th>স্ট্যাটাস</th></tr></thead><tbody>${(d.works || []).map(w => `<tr><td>${esc(w.date)}</td><td><strong>${esc(w.name)}</strong><br><small class="muted">${esc(w.page || '')}</small></td><td>${usd(w.spentUsd)}</td><td>${money(w.bill)}</td><td>${esc(w.status)}</td></tr>`).join('') || '<tr><td colspan="5">কোনো কাজ নেই</td></tr>'}</tbody></table></div>
      <h3>💰 পেমেন্ট হিস্ট্রি (${(d.payments || []).length})</h3>
      <div class="tablewrap"><table><thead><tr><th>তারিখ</th><th>পরিমাণ</th><th>মাধ্যম</th><th>রেফারেন্স</th></tr></thead><tbody>${(d.payments || []).map(p => `<tr><td>${esc(p.date)}</td><td class="good">${money(p.amount)}</td><td>${esc(p.method)}</td><td>${esc(p.ref || '—')}</td></tr>`).join('') || '<tr><td colspan="4">কোনো পেমেন্ট নেই</td></tr>'}</tbody></table></div>`;
  } catch (err) {
    $('portalBody').innerHTML = `<h3 style="color:var(--danger)">দুঃখিত, এই ক্লায়েন্ট পোর্টাল লিংকটি পাওয়া যায়নি বা মেয়াদ শেষ হয়েছে।</h3>`;
  }
  return true;
}

// PWA Service Worker & Install Prompt
if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); }); }
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstallPrompt = e; if ($('pwaInstallBtn')) $('pwaInstallBtn').style.display = 'inline-flex'; });
if ($('pwaInstallBtn')) $('pwaInstallBtn').onclick = async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('pwaInstallBtn').style.display = 'none'; };

// Auto-Lock after 20 minutes of inactivity
(function initInactivityLock() {
  let idleTimer = null;
  const resetIdle = () => {
    clearTimeout(idleTimer);
    if (!activeAccount) return;
    idleTimer = setTimeout(() => {
      if (!activeAccount) return;
      sessionStorage.removeItem(SESSION_ACC_KEY); activeAccount = null; realSuperAdmin = null;
      if ($('authOverlay')) $('authOverlay').style.display = 'flex';
      if ($('loginPass')) $('loginPass').value = '';
      toast('নিরাপত্তার জন্য ২০ মিনিট নিষ্ক্রিয় থাকায় স্ক্রিন লক হয়েছে!', 'warn');
    }, 20 * 60 * 1000);
  };
  ['mousemove','keydown','click','touchstart'].forEach(ev => document.addEventListener(ev, resetIdle, { passive: true }));
})();

// Startup (Session Restore -> Cloud Pull -> Remember Login)
(async function bootApp() {
  if (await checkAndRenderPortal()) return;
  const savedSess = (() => { try { return JSON.parse(sessionStorage.getItem(SESSION_ACC_KEY) || 'null'); } catch (e) { return null; } })();
  if (savedSess) {
    const fresh = savedSess.id === 'legacy-super-admin' ? savedSess : (readLocalAccounts().find(a => a.id === savedSess.id) || savedSess);
    if (fresh.status !== 'suspended') enterLoggedInUI(fresh, true);
  }
  const cfg = readCloudSync();
  if (cfg.url && navigator.onLine) await pullFromCloud(true, cfg.url, cfg.secret || '');
  if (!activeAccount) {
    const savedLogin = decodeRemember(localStorage.getItem(REMEMBER_LOGIN_KEY));
    if (savedLogin && savedLogin.identity && savedLogin.pass) {
      if ($('loginUser')) $('loginUser').value = savedLogin.identity;
      if ($('loginPass')) $('loginPass').value = savedLogin.pass;
      if ($('rememberLogin')) $('rememberLogin').checked = true;
      window.login();
      return;
    }
    updateHeaderAndProfile(); render(); updateWorkPreview(); generatePixelCode(); renderMonthlyReport();
  }
})();
