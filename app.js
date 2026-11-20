const REMEMBER_LOGIN_KEY = 'ads_hisab_remember_login_v72';
const SESSION_ACC_KEY = 'ads_hisab_session_v77';
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

let KEY = MASTER_DB_KEY, PROFILEKEY = 'ads_hisab_user_profile_v72_legacy-super-admin';
let activeAccount = null, realSuperAdmin = null, deferredInstallPrompt = null;
let pendingProfilePicData = '', pendingAgLogoData = '', pendingAgQrData = '';
let pendingWorkProof = '', pendingEditWorkProof = '', pendingChatAttach = null;
let portalOrders = [];
let custPage = 1, workPage = 1, payPage = 1;
const PAGE_SIZE = 25, selectedWorkIds = new Set();

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
const isAccountExpired = acc => Boolean(acc?.expiryDate && acc.expiryDate < today());

document.addEventListener('submit', e => { if (e.target?.tagName === 'FORM') e.preventDefault(); });

function encodeRemember(obj) { try { return 'obf_' + btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); } catch (e) { return ''; } }
function decodeRemember(str) { if (!str) return null; try { return str.startsWith('obf_') ? JSON.parse(decodeURIComponent(escape(atob(str.slice(4))))) : JSON.parse(str); } catch (e) { return null; } }
function hashPass(str) {
  const s = String(str || ''); let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) { h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 0x01000193); h2 ^= s.charCodeAt(i) + i; h2 = Math.imul(h2, 0x85ebca6b); }
  return 'h1_' + (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
function checkPass(input, stored) { return stored ? (String(stored).startsWith('h1_') ? hashPass(input) === stored : input === stored) : false; }

function readSuperAdminMeta() { try { return JSON.parse(localStorage.getItem(SUPERADMIN_META_KEY) || '{}'); } catch (e) { return {}; } }
function writeSuperAdminMeta(m) { try { localStorage.setItem(SUPERADMIN_META_KEY, JSON.stringify(m)); } catch (e) {} }
function getRules() { return { enable24hLock: false, minBillRate: 0, blockLoss: false, defaultDueLimit: 0, requireApproval: false, masterPin: '', ...(readSuperAdminMeta().conditions || {}) }; }
function requireMasterPin(label) {
  const pin = String(getRules().masterPin || '').trim(); if (!pin) return true;
  if (prompt(`সিকিউরিটি PIN দিন (${label}):`) !== pin) { toast('মাস্টার PIN সঠিক নয়!', 'error'); return false; }
  return true;
}
function isLocked24h(item) {
  if (!isStaff() || !getRules().enable24hLock || !item) return false;
  const ts = num(item.createdAt || item.updatedAt);
  if (ts > 0 && (Date.now() - ts) > 86400000) return true;
  return !ts && Boolean(item.date && item.date < today());
}
function applyGlobalNotice() {
  const msg = String(readSuperAdminMeta().globalNotice || '').trim(), b = $('globalNoticeBanner'), t = $('globalNoticeText');
  if (!b || !t) return; if (msg) { t.textContent = '📢 ' + msg; b.style.display = 'flex'; } else b.style.display = 'none';
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
  if (!txt) return; const done = () => toast((label || 'তথ্য') + ' কপি হয়েছে!');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
  else fallbackCopy(txt, done);
};
function fallbackCopy(txt, done) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} ta.remove(); }
window.matchBudgetDollar = () => { if ($('wActualDollar') && $('wDollar')) { $('wActualDollar').value = $('wDollar').value || 0; updateWorkPreview(); } };
window.openLightbox = src => { if (!src || !$('imageLightboxModal')) return; $('lightboxImg').src = src; $('imageLightboxModal').style.display = 'flex'; };

const DEFAULT_WA_TEMPLATE = 'আসসালামু আলাইকুম {name}, {agency} থেকে জানাচ্ছি—আপনার বিজ্ঞাপনের মোট বিল {bill}, জমা {paid}, এবং বকেয়া রয়েছে {due}। অনুগ্রহ করে বকেয়া পরিশোধ করার জন্য অনুরোধ রইল। {payinfo} ধন্যবাদ!';
const DEFAULT_CHECKLIST = () => ({ pageAccess: false, bmLinked: false, pixelReady: false, creativeReady: false, advancePaid: false });
const blank = () => ({
  updatedAt: 0, deletedIds: {}, wallets: [...DEFAULT_WALLETS],
  rates: [], customers: [], pages: [], works: [], payments: [], trades: [], quotations: [],
  cardDeposits: [], cardTransfers: [], cardRefunds: [], adAccounts: [], cashAdjustments: [],
  cards: [], expenses: [], trash: [], reminderLogs: {}, activityLogs: [],
  agency: { name: 'Ads হিসাব ম্যানেজার', tagline: 'Agency OS · Pro v77', phone: '', email: '', address: '', defaultRate: 125, defaultFeePct: 0, monthlyGoal: 100000, logoUrl: '', qrUrl: '', signText: '', termsText: '', payInfo: '', metaToken: '', waTemplate: DEFAULT_WA_TEMPLATE }
});
let db = blank();
function normalizeDb(raw) {
  const b = blank(), parsed = (raw && typeof raw === 'object') ? raw : {};
  const wallets = Array.isArray(parsed.wallets) && parsed.wallets.length ? [...new Set(parsed.wallets.map(x => String(x).trim()).filter(Boolean))] : [...DEFAULT_WALLETS];
  return {
    updatedAt: num(parsed.updatedAt), deletedIds: (parsed.deletedIds && typeof parsed.deletedIds === 'object') ? parsed.deletedIds : {}, wallets,
    rates: Array.isArray(parsed.rates) ? parsed.rates : [], customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    pages: Array.isArray(parsed.pages) ? parsed.pages : [], works: Array.isArray(parsed.works) ? parsed.works : [],
    payments: Array.isArray(parsed.payments) ? parsed.payments : [], trades: Array.isArray(parsed.trades) ? parsed.trades : [],
    quotations: Array.isArray(parsed.quotations) ? parsed.quotations : [],
    cardDeposits: Array.isArray(parsed.cardDeposits) ? parsed.cardDeposits : [], cardTransfers: Array.isArray(parsed.cardTransfers) ? parsed.cardTransfers : [],
    cardRefunds: Array.isArray(parsed.cardRefunds) ? parsed.cardRefunds : [], adAccounts: Array.isArray(parsed.adAccounts) ? parsed.adAccounts : [],
    cashAdjustments: Array.isArray(parsed.cashAdjustments) ? parsed.cashAdjustments : [], cards: Array.isArray(parsed.cards) ? parsed.cards : [],
    expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [], trash: Array.isArray(parsed.trash) ? parsed.trash : [],
    reminderLogs: (parsed.reminderLogs && typeof parsed.reminderLogs === 'object') ? parsed.reminderLogs : {},
    activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : [],
    agency: { ...b.agency, ...(parsed.agency && typeof parsed.agency === 'object' ? parsed.agency : {}) }
  };
}
function loadDb() { try { db = normalizeDb(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { db = blank(); } }
loadDb();

function markDeleted(id) { if (!id) return; db.deletedIds[id] = Date.now(); const c = Date.now() - 45 * 86400000; Object.keys(db.deletedIds).forEach(k => { if (db.deletedIds[k] < c) delete db.deletedIds[k]; }); }
function toast(msg, type = 'success') { const h = $('toastContainer'); if (!h) return; const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = msg; h.appendChild(el); setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 260); }, 3200); }
function closeModal(id) { if ($(id)) $(id).style.display = 'none'; }
document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; }));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && activeAccount) { e.preventDefault(); openQuickSearch(); }
});
function logActivity(text) { db.activityLogs.unshift({ time: new Date().toLocaleString('bn-BD'), text: (activeAccount?.name ? `[${activeAccount.name}] ` : '') + text }); if (db.activityLogs.length > 150) db.activityLogs.pop(); try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

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
const paid = id => db.payments.filter(p => p.customerId === id && p.approvalStatus !== 'pending').reduce((s, p) => s + num(p.amount), 0);
const billed = id => db.works.filter(w => w.customerId === id).reduce((s, w) => s + bill(w), 0);
const clientBalance = id => paid(id) - billed(id);
const tradeProfit = t => t.type === 'sell' ? (num(t.sellRate) - num(t.buyRate)) * num(t.usd) : 0;
const quoteTotal = q => { const b = num(q.dollar) * num(q.rate), f = num(q.serviceFee); return b + (!f ? 0 : (q.serviceFeeType === 'pct' ? b * (f / 100) : f)); };
const agencyContactLine = (ag = db.agency || {}) => [ag.phone ? `মোবাইল: ${ag.phone}` : '', ag.email ? `ইমেইল: ${ag.email}` : '', ag.address ? `ঠিকানা: ${ag.address}` : ''].filter(Boolean).join(' · ') || 'প্রফেশনাল ইনভয়েস ও ক্যাশ মেমো';

function rateFor(date) { return db.rates.filter(r => r.date <= date).sort(byDateDesc)[0]?.value || num(db.agency?.defaultRate) || 0; }
function getCardStats(cardId) {
  if (!cardId) return { inUsd: 0, inTk: 0, avgRate: 0, outUsd: 0, balance: 0 };
  const deps = db.cardDeposits.filter(d => d.cardId === cardId), trIn = db.cardTransfers.filter(t => t.toCardId === cardId), trOut = db.cardTransfers.filter(t => t.fromCardId === cardId), refs = db.cardRefunds.filter(r => r.cardId === cardId);
  const worksSpent = db.works.filter(w => (w.cardId || '') === cardId).reduce((s, w) => s + num(w.actualDollar), 0);
  const trdBuy = db.trades.filter(t => t.cardId === cardId && t.type === 'buy'), trdSell = db.trades.filter(t => t.cardId === cardId && t.type === 'sell');
  const depUsd = deps.reduce((s, d) => s + num(d.amount), 0), depTk = deps.reduce((s, d) => s + num(d.taka), 0);
  const trInUsd = trIn.reduce((s, t) => s + num(t.amount), 0), trInTk = trIn.reduce((s, t) => s + num(t.takaValue), 0);
  const buyUsd = trdBuy.reduce((s, t) => s + num(t.usd), 0), buyTk = trdBuy.reduce((s, t) => s + num(t.usd) * num(t.buyRate), 0);
  const refUsd = refs.reduce((s, r) => s + num(r.amount), 0), trOutUsd = trOut.reduce((s, t) => s + num(t.amount), 0) + trdSell.reduce((s, t) => s + num(t.usd), 0);
  const inUsd = depUsd + trInUsd + buyUsd + refUsd, inTk = depTk + trInTk + buyTk, baseUsd = depUsd + trInUsd + buyUsd;
  return { inUsd, inTk, avgRate: baseUsd > 0 ? +(inTk / baseUsd).toFixed(2) : 0, outUsd: worksSpent + trOutUsd, balance: inUsd - (worksSpent + trOutUsd) };
}
const cardAvgRate = cardId => getCardStats(cardId).avgRate;
const cardSpent = cardId => getCardStats(cardId).outUsd;

function getWalletBalances() {
  const bal = {}; (db.wallets || DEFAULT_WALLETS).forEach(w => { bal[w] = 0; });
  const ensure = k => { const key = k || 'Cash'; if (!Object.prototype.hasOwnProperty.call(bal, key)) bal[key] = 0; return key; };
  db.payments.filter(p => p.approvalStatus !== 'pending').forEach(p => { bal[ensure(p.method)] += num(p.amount) - num(p.fee); });
  db.expenses.filter(ex => ex.approvalStatus !== 'pending').forEach(ex => { bal[ensure(ex.method)] -= num(ex.amount); });
  db.cardDeposits.forEach(d => { bal[ensure(d.method || 'Bank')] -= num(d.taka); });
  db.cashAdjustments.forEach(a => { bal[ensure(a.method)] += a.type === 'out' ? -num(a.amount) : num(a.amount); });
  db.trades.forEach(t => { bal[ensure(t.method || 'Cash')] += t.type === 'sell' ? num(t.paidTk) : -num(t.paidTk); });
  return bal;
}

function updateStorageMeter() {
  let bytes = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); bytes += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (e) {}
  const pct = Math.min(100, Math.round((bytes / (5 * 1024 * 1024)) * 100)), kbStr = bytes > 1048576 ? (bytes / 1048576).toFixed(2) + ' MB' : Math.round(bytes / 1024) + ' KB';
  const col = pct >= 85 ? '#dc2626' : (pct >= 60 ? '#f59e0b' : '#10b981');
  [['setStorageText', 'setStorageBar'], ['storageMeterText', 'storageMeterBar']].forEach(([tId, bId]) => { if ($(tId)) $(tId).textContent = `${kbStr} / 5 MB (${pct}%)`; if ($(bId)) { $(bId).style.width = `${pct}%`; $(bId).style.background = col; } });
}

function setSyncUi(state, label) {
  const el = $('syncStatusBtn'); if (!el) return; el.className = 'sync-pill ' + (state || '');
  el.innerHTML = `${state === 'ok' ? '🟢' : (state === 'busy' ? '🟡' : (state === 'err' ? '🔴' : '⚪'))} <span class="sync-txt">${esc(label || 'Local')}</span>`;
}
let autoSyncTimer = null;
function triggerAccountCloudSync() {
  const syncCfg = readCloudSync();
  if (syncCfg.autoSync && syncCfg.url) {
    localStorage.setItem(LOCAL_DIRTY_KEY, '1');
    if (!navigator.onLine) setSyncUi('err', 'Offline (Pending)');
    else { setSyncUi('busy', 'Syncing...'); clearTimeout(autoSyncTimer); autoSyncTimer = setTimeout(() => pushToCloud(true), 1200); }
  } else setSyncUi('', 'Local');
  updateStorageMeter();
}
function save() {
  db.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('ব্রাউজার স্টোরেজ পূর্ণ!', 'error'); }
  triggerAccountCloudSync(); render();
}
if ($('syncStatusBtn')) $('syncStatusBtn').onclick = () => { const cfg = readCloudSync(); if (!cfg.url) { goToSection('adminPanel'); switchAdminSubTab('cloud'); return toast('Firebase URL দিন', 'warn'); } if (!navigator.onLine) return toast('ইন্টারনেট নেই!', 'error'); pushToCloud(false); };
window.addEventListener('online', () => { const cfg = readCloudSync(); if (cfg.url && (localStorage.getItem(LOCAL_DIRTY_KEY) === '1' || cfg.autoSync)) { setSyncUi('busy', 'Reconnecting...'); pushToCloud(true); } });
window.addEventListener('offline', () => { if (readCloudSync().url) setSyncUi('err', 'Offline'); });

const defaultAvatarUrl = name => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#3157e8"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Arial,sans-serif" font-size="38" font-weight="bold">${String(name || 'U').trim().slice(0, 2).toUpperCase()}</text></svg>`);
function compressImageFile(file, maxSize = 240, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = reject;
    reader.onload = e => {
      const img = new Image(); img.onerror = reject;
      img.onload = () => {
        const c = document.createElement('canvas'); let w = img.width, h = img.height;
        if (w > h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; } else if (h >= w && h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
        c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); resolve(c.toDataURL('image/jpeg', quality));
      }; img.src = e.target.result;
    }; reader.readAsDataURL(file);
  });
}

// Trash
function moveToTrash(type, label, data) { db.trash.unshift({ id: uid(), updatedAt: Date.now(), type, label, data, deletedAt: new Date().toLocaleString('bn-BD'), deletedBy: activeAccount?.name || 'Admin' }); if (db.trash.length > 100) db.trash.pop(); }
window.restoreTrash = trashId => {
  if (!isSuperAdmin()) return toast('শুধু Super Admin রিস্টোর করতে পারবেন!', 'error');
  const idx = db.trash.findIndex(x => x.id === trashId); if (idx === -1) return;
  const item = db.trash[idx], d = item.data, unmark = obj => { if (obj?.id) delete db.deletedIds[obj.id]; return obj; };
  if (item.type === 'customer_bundle' && d?.customer) {
    if (!db.customers.some(x => x.id === d.customer.id)) db.customers.push(unmark(d.customer));
    (d.pages || []).forEach(p => { if (!db.pages.some(x => x.id === p.id)) db.pages.push(unmark(p)); });
    (d.works || []).forEach(w => { if (!db.works.some(x => x.id === w.id)) db.works.push(unmark(w)); });
    (d.payments || []).forEach(p => { if (!db.payments.some(x => x.id === p.id)) db.payments.push(unmark(p)); });
  } else if (d) {
    const col = { page: 'pages', work: 'works', payment: 'payments', expense: 'expenses', rate: 'rates', card: 'cards', deposit: 'cardDeposits', adAccount: 'adAccounts', trade: 'trades', quotation: 'quotations' }[item.type];
    if (col && !db[col].some(x => x.id === d.id)) db[col].push(unmark(d));
  }
  markDeleted(trashId); db.trash.splice(idx, 1); save(); logActivity(`রিস্টোর: ${item.label}`); renderAdminPanel(); toast('ডেটা পুনরুদ্ধার হয়েছে!');
};
window.permDeleteTrash = trashId => { if (!isSuperAdmin() || !confirm('স্থায়ীভাবে মুছবেন?')) return; markDeleted(trashId); db.trash = db.trash.filter(x => x.id !== trashId); save(); renderAdminPanel(); toast('স্থায়ীভাবে মুছে ফেলা হয়েছে', 'warn'); };
window.emptyTrash = () => { if (!isSuperAdmin() || !db.trash.length || !requireMasterPin('ট্র্যাশ খালি') || !confirm('ট্র্যাশ খালি করবেন?')) return; db.trash.forEach(t => markDeleted(t.id)); db.trash = []; save(); renderAdminPanel(); toast('ট্র্যাশ খালি হয়েছে', 'warn'); };

// Drawer, Search, Lock, Notifications
function toggleMobileMenu(force) { const sb = $('appSidebar'), bd = $('sidebarBackdrop'); if (!sb || !bd) return; const open = typeof force === 'boolean' ? force : !sb.classList.contains('open'); sb.classList.toggle('open', open); bd.classList.toggle('open', open); }
if ($('mobileMenuBtn')) $('mobileMenuBtn').onclick = () => toggleMobileMenu();
if ($('sidebarBackdrop')) $('sidebarBackdrop').onclick = () => toggleMobileMenu(false);

function openQuickSearch() { if (!$('quickSearchModal')) return; $('quickSearchModal').style.display = 'flex'; $('quickSearchInput').value = ''; renderQuickSearch(''); setTimeout(() => $('quickSearchInput')?.focus(), 50); }
if ($('quickSearchBtn')) $('quickSearchBtn').onclick = openQuickSearch;
function renderQuickSearch(q) {
  const host = $('quickSearchResults'); if (!host) return; const s = q.trim().toLowerCase(), res = [];
  db.customers.filter(c => !s || c.name.toLowerCase().includes(s) || (c.phone || '').includes(s)).slice(0, 6).forEach(c => res.push(`<div class="search-item" onclick="closeModal('quickSearchModal');openClientProfile('${c.id}')"><div><strong>👤 ${esc(c.name)}</strong><br><small class="muted">${esc(c.phone || 'ফোন নেই')}</small></div><span class="badge-admin">কাস্টমার</span></div>`));
  db.works.filter(w => !s || w.name.toLowerCase().includes(s) || cname(w.customerId).toLowerCase().includes(s)).slice(0, 6).forEach(w => res.push(`<div class="search-item" onclick="closeModal('quickSearchModal');goToSection('works');$('workSearch').value='${esc(w.name).replace(/'/g, "\\'")}';workPage=1;render()"><div><strong>⚡ ${esc(w.name)}</strong><br><small class="muted">${esc(cname(w.customerId))} · ${esc(w.date)} · ${money(bill(w))}</small></div><span class="badge-status status-running">${esc(w.status)}</span></div>`));
  db.pages.filter(p => !s || p.name.toLowerCase().includes(s) || (p.adId || '').toLowerCase().includes(s) || (p.pixelId || '').includes(s)).slice(0, 5).forEach(p => res.push(`<div class="search-item" onclick="closeModal('quickSearchModal');goToSection('customers')"><div><strong>📄 ${esc(p.name)}</strong><br><small class="muted">${esc(cname(p.customerId))} · Ad: ${esc(p.adId || '—')}</small></div><span class="badge-success">পেজ</span></div>`));
  host.innerHTML = res.join('') || '<div class="muted" style="padding:14px;text-align:center">কোনো মিল পাওয়া যায়নি</div>';
}
if ($('quickSearchInput')) $('quickSearchInput').oninput = e => renderQuickSearch(e.target.value);
if ($('lockScreenBtn')) $('lockScreenBtn').onclick = () => { if (!activeAccount) return; sessionStorage.removeItem(SESSION_ACC_KEY); activeAccount = null; realSuperAdmin = null; if ($('authOverlay')) $('authOverlay').style.display = 'flex'; if ($('loginPass')) { $('loginPass').value = ''; $('loginPass').focus(); } toast('স্ক্রিন লক করা হয়েছে!', 'warn'); };

let currentNotifKeys = [];
const getNotifStateKey = () => 'ads_hisab_notif_state_v72_' + (activeAccount?.id || 'legacy-super-admin');
function readNotifState() { try { const r = JSON.parse(localStorage.getItem(getNotifStateKey()) || '{}'); if (r.date === today()) return { date: today(), seen: Array.isArray(r.seen) ? r.seen : [], dismissed: Array.isArray(r.dismissed) ? r.dismissed : [] }; } catch (e) {} return { date: today(), seen: [], dismissed: [] }; }
function writeNotifState(s) { try { localStorage.setItem(getNotifStateKey(), JSON.stringify(s)); } catch (e) {} }
function markNotifsSeen(keys) { if (!keys?.length) return; const st = readNotifState(); keys.forEach(k => { if (!st.seen.includes(k)) st.seen.push(k); }); writeNotifState(st); if ($('notifCount')) $('notifCount').style.display = 'none'; }
window.dismissNotif = (e, key) => { e.stopPropagation(); const st = readNotifState(); if (!st.seen.includes(key)) st.seen.push(key); if (!st.dismissed.includes(key)) st.dismissed.push(key); writeNotifState(st); updateNotifications(); };
if ($('notifIcon') && $('notifBox')) {
  $('notifIcon').onclick = e => { e.stopPropagation(); const box = $('notifBox'), open = box.style.display !== 'block'; box.style.display = open ? 'block' : 'none'; if (open) markNotifsSeen(currentNotifKeys); };
  document.addEventListener('click', e => { if (!$('notifBox').contains(e.target) && !$('notifIcon').contains(e.target)) $('notifBox').style.display = 'none'; });
}

// Language (i18n)
const translations = {
  bn: {
    navDash: "📊 ড্যাশবোর্ড", navCust: "👥 কাস্টমার ও CRM", navQuotes: "📝 কোটেশন / প্রোপোজাল", navCards: "💳 ডলার ও কার্ড হিসাব", navTrading: "💱 ডলার ট্রেডিং (Buy/Sell)",
    navRates: "📈 দৈনিক ডলার রেট", navWorks: "⚡ কাজের হিসাব ও ব্রিফ", navPixel: "🎯 পিক্সেল ও অ্যাড অ্যাকাউন্ট", navExp: "💸 অফিস ও অন্যান্য খরচ", navPay: "💰 পেমেন্ট ও মোবাইল ওয়ালেট",
    navDue: "📑 বকেয়া ও অটোমেশন", navMonthly: "📅 মাসিক হিসাব", navRep: "📂 রিপোর্ট, কমিশন ও ব্যাকআপ", navSet: "⚙ সেটিংস", navLogout: "↪ লগ আউট", navChat: "💬 টিম চ্যাট (ছবি/ফাইল)", navTraining: "🎓 ব্যবহার নির্দেশিকা",
    headerSub: "আপনার এজেন্সির ক্লায়েন্ট, বিজ্ঞাপন ও লাভ পরিচালনা করুন", loginTitle: "Ads হিসাব ম্যানেজার", loginSub: "আপনার বিজ্ঞাপনের হিসাব ও লাভ-ক্ষতি নিরাপদে পরিচালনা করুন",
    userLabel: "ইউজারনেম / ইমেইল / মোবাইল", passLabel: "পাসওয়ার্ড", rememberText: "পাসওয়ার্ড মনে রাখুন", loginBtnText: "লগইন করুন", notifHead: "বিজ্ঞপ্তি ও অটো অ্যালার্ট",
    btnResetPass: "পাসওয়ার্ড রিসেট", btnFindUser: "ইউজারনেম খুঁজুন", btnNewAcc: "নতুন অ্যাকাউন্ট তৈরি করুন", btnHelpSupport: "🆘 অ্যাডমিন / সুপার অ্যাডমিন হেল্প",
    lblFrom: "শুরুর তারিখ", lblTo: "শেষ তারিখ", btnFilter: "ফিল্টার", btnAllDates: "সব তারিখ",
    c1: "আজকের নিট লাভ", c2: "মোট বিলিং / আয়", c3: "প্রকৃত এড খরচ", c4: "নিট প্রফিট", cTodayBill: "আজকের বিল", cTodaySpend: "আজকের খরচ", cTotalPaid: "মোট আদায়", cTotalDue: "মোট বকেয়া",
    chartMonthly: "📈 শেষ ৬ মাসের আয়, খরচ ও লাভ", chartTop: "🏆 টপ ক্লায়েন্ট", activeAdsTitle: "⚡ চলমান ক্যাম্পেইন মনিটর (Active Ads)",
    secCust: "👥 কাস্টমার, অনবোর্ডিং, CRM ও ফেসবুক পেজ", secCards: "💳 ডলার ও ব্যাংক কার্ড হিসাব", secRates: "📈 দৈনিক ডলার রেট", secWorks: "⚡ নতুন কাজ / বিজ্ঞাপন ক্যাম্পেইন (Unlimited)"
  },
  en: {
    navDash: "📊 Dashboard", navCust: "👥 Customers & CRM", navQuotes: "📝 Quotations", navCards: "💳 Cards & USD", navTrading: "💱 USD Trading",
    navRates: "📈 Daily USD Rates", navWorks: "⚡ Campaigns & Brief", navPixel: "🎯 Pixel & Ad Accounts", navExp: "💸 Office Expenses", navPay: "💰 Payments & Wallets",
    navDue: "📑 Dues & WhatsApp", navMonthly: "📅 Monthly Report", navRep: "📂 Reports & Backup", navSet: "⚙ Settings", navLogout: "↪ Logout", navChat: "💬 Team Chat (Media)", navTraining: "🎓 Training Hub",
    headerSub: "Manage agency clients, campaigns, and profit", loginTitle: "Ads Manager Login", loginSub: "Manage ad accounts & clients securely",
    userLabel: "Username / Email / Mobile", passLabel: "Password", rememberText: "Remember Password", loginBtnText: "Login", notifHead: "Notifications & Alerts",
    btnResetPass: "Reset Password", btnFindUser: "Find Username", btnNewAcc: "Create Account", btnHelpSupport: "🆘 Admin Support",
    lblFrom: "From Date", lblTo: "To Date", btnFilter: "Filter", btnAllDates: "All Dates",
    c1: "Today Net Profit", c2: "Total Billing", c3: "Actual Ad Cost", c4: "Net Profit", cTodayBill: "Today Bill", cTodaySpend: "Today Cost", cTotalPaid: "Total Paid", cTotalDue: "Total Due",
    chartMonthly: "📈 6-Month Revenue, Spend & Profit", chartTop: "🏆 Top Clients", activeAdsTitle: "⚡ Active Campaigns Monitor",
    secCust: "👥 Customers, Onboarding & CRM", secCards: "💳 Cards & USD Ledger", secRates: "📈 Daily USD Rates", secWorks: "⚡ Campaigns & Briefs (Unlimited)"
  }
};
function applyLanguage(lang) {
  localStorage.setItem(LANG_KEY, lang); const t = translations[lang] || translations.bn; if ($('languageSelect')) $('languageSelect').value = lang;
  const map = { navDash: t.navDash, navCust: t.navCust, navQuotes: t.navQuotes, navCards: t.navCards, navTrading: t.navTrading, navRates: t.navRates, navWorks: t.navWorks, navPixel: t.navPixel, navExp: t.navExp, navPay: t.navPay, navDue: t.navDue, navMonthly: t.navMonthly, navRep: t.navRep, navSet: t.navSet, navChat: t.navChat, navTraining: t.navTraining, navLogout: t.navLogout, headerSubText: t.headerSub, uiLoginTitle: t.loginTitle, uiLoginSub: t.loginSub, uiUserLabel: t.userLabel, uiPassLabel: t.passLabel, uiRememberText: t.rememberText, loginBtn: t.loginBtnText, uiNotifHeader: t.notifHead, cardTitleTodayProfit: t.c1, cardTitleTotalBill: t.c2, cardTitleTotalCost: t.c3, cardTitleNetProfit: t.c4, secTitleCust: t.secCust, secTitleCards: t.secCards, secTitleRates: t.secRates, secTitleWorks: t.secWorks };
  Object.entries(map).forEach(([id, txt]) => { if ($(id) && txt) $(id).textContent = txt; });
  document.querySelectorAll('[data-i18n]').forEach(el => { const k = el.getAttribute('data-i18n'); if (t[k]) el.textContent = t[k]; });
}
if ($('applyLanguageBtn')) $('applyLanguageBtn').onclick = () => { applyLanguage($('languageSelect').value); toast('ভাষা পরিবর্তন হয়েছে!'); };
applyLanguage(localStorage.getItem(LANG_KEY) || 'bn');

// Theme & Navigation
function setTheme(isDark) { document.body.classList.toggle('dark', isDark); if ($('themeToggleBtn')) $('themeToggleBtn').textContent = isDark ? '☀️' : '🌙'; localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light'); }
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
window.goToSection = tabName => { const btn = document.querySelector(`.side-menu button[data-tab="${tabName}"]`); if (btn) btn.click(); };
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
  const list = db.wallets?.length ? db.wallets : DEFAULT_WALLETS;
  ['pMethod','epMethod','expMethod','eeMethod','depositMethod','edMethod','caMethod','trdMethod'].forEach(id => {
    const el = $(id); if (!el) return; const old = el.value, opts = old && !list.includes(old) ? [...list, old] : list;
    el.innerHTML = opts.map(w => `<option value="${esc(w)}">${esc(w)}</option>`).join('');
    if (old && opts.includes(old)) el.value = old; else if (id.includes('deposit') && list.includes('Bank')) el.value = 'Bank'; else if ((id.includes('exp') || id.includes('ca') || id === 'trdMethod') && list.includes('Cash')) el.value = 'Cash';
  });
  if ($('payMethodFilter')) { const oldF = $('payMethodFilter').value; $('payMethodFilter').innerHTML = `<option value="">সব ওয়ালেট</option>` + list.map(w => `<option value="${esc(w)}">${esc(w)}</option>`).join(''); if (oldF && list.includes(oldF)) $('payMethodFilter').value = oldF; }
}
function fillStaffSelect(id) {
  const el = $(id); if (!el) return; const old = el.value;
  const saName = (activeAccount?.id === 'legacy-super-admin' ? readProfile().name : '') || 'Admin / Owner';
  const unique = [...new Set([saName, ...readLocalAccounts().map(a => a.name)].filter(Boolean))];
  if (old && !unique.includes(old)) unique.push(old);
  el.innerHTML = `<option value="">নির্বাচন করুন (ঐচ্ছিক)</option>` + unique.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  if (old) el.value = old;
}
function refresh() {
  ['wCard','ewCard','aaCard','eaaCard','trFromCard','trToCard','rfCard'].forEach(id => fillSelect(id, db.cards, 'কার্ড নির্বাচন'));
  fillSelect('trdCard', db.cards, 'কার্ড নেই (বাইরের উৎস)');
  fillSelect('depositCard', db.cards, db.cards.length ? '' : 'প্রথমে কার্ড যোগ করুন');
  ['pageCustomer','qpCustomer','wCustomer','ewCustomer','pCustomer','epCustomer'].forEach(id => fillSelect(id, db.customers, 'কাস্টমার নির্বাচন'));
  fillSelect('qtCustomer', db.customers, 'নতুন ইনকোয়ারি / নিচে নাম লিখুন');
  fillSelect('workCustomerFilter', db.customers, 'সব কাস্টমার');
  refreshWalletSelects(); fillStaffSelect('wStaff'); fillStaffSelect('ewStaff'); updatePages();
}
function updatePages() {
  const wc = $('wCustomer'), wp = $('wPage'); if (!wc || !wp) return;
  const cid = wc.value, filtered = db.pages.filter(p => !cid || p.customerId === cid);
  fillSelect('wPage', filtered, filtered.length ? 'পেজ নির্বাচন (ঐচ্ছিক)' : 'কোনো পেজ নেই (ঐচ্ছিক)', p => `${p.name} — ${cname(p.customerId)}`);
  if (cid && filtered.length === 1 && !wp.value) wp.value = filtered[0].id;
}
function updateEditWorkPages() { const wc = $('ewCustomer'); if (!wc) return; fillSelect('ewPage', db.pages.filter(p => !wc.value || p.customerId === wc.value), 'পেজ নির্বাচন (ঐচ্ছিক)', p => `${p.name} — ${cname(p.customerId)}`); }
if ($('wCustomer')) $('wCustomer').onchange = updatePages;
if ($('ewCustomer')) $('ewCustomer').onchange = updateEditWorkPages;

window.openQuickCustomerModal = () => { $('quickCustomerForm')?.reset(); $('quickCustomerModal').style.display = 'flex'; setTimeout(() => $('qcName')?.focus(), 50); };
if ($('quickCustomerForm')) $('quickCustomerForm').onsubmit = e => {
  e.preventDefault(); const id = uid(), name = $('qcName').value.trim();
  db.customers.push({ id, createdAt: Date.now(), updatedAt: Date.now(), portalToken: uid().slice(-6), name, phone: $('qcPhone').value.trim(), retainer: num($('qcRetainer').value), dueLimit: 0, stage: 'Active Client', followUpDate: '', checklist: DEFAULT_CHECKLIST(), note: '' });
  save(); logActivity(`কুইক কাস্টমার: ${name}`); if ($('wCustomer')) { $('wCustomer').value = id; updatePages(); }
  closeModal('quickCustomerModal'); toast(`${name} যুক্ত ও নির্বাচিত হয়েছে!`);
};
window.openQuickPageModal = () => {
  $('quickPageForm')?.reset(); fillSelect('qpCustomer', db.customers, 'কাস্টমার নির্বাচন');
  if ($('wCustomer')?.value && $('qpCustomer')) $('qpCustomer').value = $('wCustomer').value;
  $('quickPageModal').style.display = 'flex'; setTimeout(() => $('qpName')?.focus(), 50);
};
if ($('quickPageForm')) $('quickPageForm').onsubmit = e => {
  e.preventDefault(); const id = uid(), custId = $('qpCustomer').value, name = $('qpName').value.trim();
  db.pages.push({ id, updatedAt: Date.now(), customerId: custId, name, link: $('qpLink').value.trim(), adId: $('qpAdId').value.trim(), pixelId: $('qpPixelId').value.trim() });
  save(); logActivity(`কুইক পেজ: ${name}`); if ($('wCustomer')) $('wCustomer').value = custId; updatePages(); if ($('wPage')) $('wPage').value = id;
  closeModal('quickPageModal'); toast(`${name} পেজ যুক্ত ও নির্বাচিত হয়েছে!`);
};

function updatePaymentCustomerStatus() {
  const el = $('pCustomerStatus'), cid = $('pCustomer')?.value; if (!el) return;
  if (!cid) { el.innerHTML = ''; return; }
  const bal = clientBalance(cid);
  el.innerHTML = bal < 0 ? `<span class="bad">বর্তমান বকেয়া: ${money(-bal)}</span> <button type="button" class="secondary sm" onclick="$('pAmount').value='${(-bal).toFixed(2)}'">পুরো বকেয়া বসান</button>` : (bal > 0 ? `<span class="good">অ্যাডভান্স জমা: ${money(bal)}</span>` : `<span class="muted">কোনো বকেয়া নেই (৳0.00)</span>`);
}
if ($('pCustomer')) $('pCustomer').onchange = updatePaymentCustomerStatus;

['rateDate','wDate','pDate','expDate','depositDate','trDate','rfDate','caDate','trdDate','qtDate'].forEach(id => { if ($(id)) $(id).value = today(); });
if ($('wDate')) $('wDate').onchange = () => { const r = rateFor($('wDate').value); if (r && $('wRate')) { $('wRate').value = r; updateWorkPreview(); } };
if ($('wCard')) $('wCard').onchange = () => { const avg = cardAvgRate($('wCard').value); if (avg > 0 && $('wActualRate')) { $('wActualRate').value = avg; updateWorkPreview(); } };
if ($('ewCard')) $('ewCard').onchange = () => { const avg = cardAvgRate($('ewCard').value); if (avg > 0 && $('ewActualRate') && !num($('ewActualRate').value)) { $('ewActualRate').value = avg; updateEditWorkPreview(); } };

function updateWorkPreview() {
  const date = $('wDate')?.value || today(), actualDol = num($('wActualDollar')?.value), rate = num($('wRate')?.value) || rateFor(date);
  const sFee = num($('wServiceFee')?.value), sType = $('wServiceFeeType')?.value || 'fixed', actRate = num($('wActualRate')?.value), feePct = num($('wFeePct')?.value), other = num($('wOther')?.value), cardId = $('wCard')?.value || '';
  const baseB = actualDol * rate, svc = sFee ? (sType === 'pct' ? baseB * (sFee / 100) : sFee) : 0, b = baseB + svc, base = actualDol * actRate, fee = base * (feePct / 100), act = base + fee, pr = b - act - other;
  let warnHtml = '';
  if (!isStaff() && actualDol > 0 && actRate > 0 && pr < 0) warnHtml += ` <span class="badge-danger">⚠️ লস হচ্ছে!</span>`;
  if (cardId && actualDol > 0 && getCardStats(cardId).balance < actualDol) warnHtml += ` <span class="badge-warn">⚠️ কার্ড ব্যালেন্স কম!</span>`;
  if ($('preview')) $('preview').innerHTML = isStaff() ? `বিল: ${money(b)}${svc ? ` (চার্জ: ${money(svc)})` : ''}${warnHtml}` : `মোট বিল: ${money(b)}${svc ? ` (চার্জ: ${money(svc)})` : ''} · খরচ: ${money(base)} + ফি (${feePct}%): ${money(fee)} = ${money(act)} · লাভ: <strong style="color:${pr >= 0 ? '#059669' : '#dc2626'}">${money(pr)}</strong>${warnHtml}`;
}
['wDate','wActualDollar','wRate','wServiceFee','wServiceFeeType','wActualRate','wFeePct','wOther','wCard'].forEach(id => { if ($(id)) { $(id).oninput = updateWorkPreview; $(id).onchange = updateWorkPreview; } });
function updateEditWorkPreview() {
  const actualDol = num($('ewActualDollar')?.value), rate = num($('ewRate')?.value), sFee = num($('ewServiceFee')?.value), sType = $('ewServiceFeeType')?.value || 'fixed', actRate = num($('ewActualRate')?.value), feePct = num($('ewFeePct')?.value), other = num($('ewOther')?.value);
  const baseB = actualDol * rate, svc = sFee ? (sType === 'pct' ? baseB * (sFee / 100) : sFee) : 0, b = baseB + svc, base = actualDol * actRate, fee = base * (feePct / 100), act = base + fee, pr = b - act - other;
  if ($('ewPreview')) $('ewPreview').textContent = isStaff() ? `মোট বিল: ${money(b)}` : `মোট বিল: ${money(b)} · প্রকৃত খরচ (ফি সহ): ${money(act)} · লাভ: ${money(pr)}`;
}
['ewActualDollar','ewRate','ewServiceFee','ewServiceFeeType','ewActualRate','ewFeePct','ewOther'].forEach(id => { if ($(id)) { $(id).oninput = updateEditWorkPreview; $(id).onchange = updateEditWorkPreview; } });
window.togglePasswordVisibility = (fieldId, btnEl) => { const f = $(fieldId); if (!f) return; f.type = f.type === 'password' ? 'text' : 'password'; btnEl.textContent = f.type === 'password' ? '👁' : '🙈'; };

// Help Inbox + Portal Orders
const readHelpRequests = () => { try { return JSON.parse(localStorage.getItem(HELP_REQUESTS_KEY) || '[]'); } catch (e) { return []; } };
const writeHelpRequests = arr => { try { localStorage.setItem(HELP_REQUESTS_KEY, JSON.stringify(arr)); } catch (e) {} };
if ($('loginHelpBtn')) $('loginHelpBtn').onclick = () => {
  let masterAg = {}; try { masterAg = JSON.parse(localStorage.getItem(MASTER_DB_KEY) || '{}').agency || {}; } catch (e) {}
  const waNum = normalizeBdPhone(masterAg.phone || '');
  if ($('lhWaWrap') && $('lhWaBtn')) { if (waNum) { $('lhWaWrap').style.display = 'block'; $('lhWaBtn').href = `https://wa.me/${waNum}?text=${encodeURIComponent('আসসালামু আলাইকুম, Ads হিসাব ম্যানেজার সংক্রান্ত সহায়তা প্রয়োজন।')}`; } else $('lhWaWrap').style.display = 'none'; }
  $('loginHelpForm')?.reset(); $('loginHelpModal').style.display = 'flex';
};
if ($('loginHelpForm')) $('loginHelpForm').onsubmit = e => {
  e.preventDefault(); const arr = readHelpRequests();
  arr.unshift({ id: uid(), time: new Date().toLocaleString('bn-BD'), target: $('lhTarget').value, name: $('lhName').value.trim(), contact: $('lhContact').value.trim(), topic: $('lhTopic').value, message: $('lhMessage').value.trim(), status: 'open' });
  if (arr.length > 100) arr.pop(); writeHelpRequests(arr); closeModal('loginHelpModal'); toast('আপনার বার্তাটি Admin ইনবক্সে পাঠানো হয়েছে!');
};
window.resolveHelpReq = id => { const arr = readHelpRequests(), item = arr.find(x => x.id === id); if (!item) return; item.status = item.status === 'resolved' ? 'open' : 'resolved'; writeHelpRequests(arr); renderAdminPanel(); updateNotifications(); toast('আপডেট হয়েছে'); };
window.deleteHelpReq = id => { writeHelpRequests(readHelpRequests().filter(x => x.id !== id)); renderAdminPanel(); updateNotifications(); toast('মুছে ফেলা হয়েছে', 'warn'); };
window.clearAllHelpRequests = () => { if (!confirm('সব হেল্প মেসেজ মুছবেন?')) return; writeHelpRequests([]); renderAdminPanel(); updateNotifications(); toast('ইনবক্স পরিষ্কার হয়েছে', 'warn'); };
window.quickTempResetFromHelp = reqId => {
  if (!isSuperAdmin()) return; const arr = readHelpRequests(), h = arr.find(x => x.id === reqId); if (!h) return;
  const q = String(h.contact || '').replace(/^@/, '').trim().toLowerCase(), accounts = readLocalAccounts();
  let acc = accounts.find(a => [a.username, a.phone, a.email].some(v => String(v || '').toLowerCase() === q));
  if (!acc) { const u = prompt(`ইউজারনেম দিন (প্রেরক: ${h.name})`, q); if (!u) return; acc = accounts.find(a => a.username === u.trim().toLowerCase()); }
  if (!acc) return toast('ইউজার পাওয়া যায়নি!', 'error');
  const tmpPass = String(Math.floor(100000 + Math.random() * 900000));
  acc.password = hashPass(tmpPass); acc.status = 'active'; acc.updatedAt = Date.now(); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts));
  h.status = 'resolved'; writeHelpRequests(arr); triggerAccountCloudSync(); renderAdminPanel();
  copyText(`ইউজারনেম: ${acc.username} | অস্থায়ী পাসওয়ার্ড: ${tmpPass}`, 'টেম্প পাসওয়ার্ড');
  const wa = normalizeBdPhone(acc.phone || h.contact);
  if (wa.length >= 11 && confirm(`নতুন পাসওয়ার্ড (${tmpPass}) কপি হয়েছে! WhatsApp-এ পাঠাবেন?`)) window.open(`https://wa.me/${wa}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${acc.name}, আপনার পাসওয়ার্ড রিসেট করা হয়েছে।\nইউজারনেম: ${acc.username}\nঅস্থায়ী পাসওয়ার্ড: ${tmpPass}`)}`, '_blank');
};

window.loadPortalOrders = async (manual = false) => {
  const cfg = readCloudSync(), clean = String(cfg.url || '').trim().replace(/\/+$/, '');
  if (!clean || !navigator.onLine) return;
  const ep = `${clean}/ads_hisab_portal_orders.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '');
  try {
    const res = await fetch(ep); if (!res.ok) return; const data = await res.json();
    portalOrders = data && typeof data === 'object' ? Object.entries(data).map(([k, v]) => ({ key: k, ...v })).reverse() : [];
    renderPortalOrders(); if (manual) toast('পোর্টাল অর্ডার রিফ্রেশ হয়েছে!');
  } catch (e) {}
};
function renderPortalOrders() {
  if (!$('portalOrderRows')) return;
  $('portalOrderRows').innerHTML = portalOrders.map(o => `<tr><td><small>${esc(o.time || '')}</small></td><td><strong>${esc(o.customerName)}</strong><br><small class="muted">${esc(o.phone || '')}</small></td><td><strong>${esc(o.campName)}</strong><br><small>${usd(o.budget)} · ${num(o.days)} দিন</small></td><td style="max-width:220px;white-space:normal">${esc(o.note || '—')}</td><td><button type="button" class="sm" style="background:#059669" onclick="convertPortalOrderToWork('${esc(o.key)}')">⚡ কাজে রূপান্তর</button><button type="button" class="danger sm" onclick="deletePortalOrder('${esc(o.key)}')">মুছুন</button></td></tr>`).join('') || '<tr><td colspan="5">পোর্টাল থেকে কোনো অর্ডার আসেনি</td></tr>';
}
window.convertPortalOrderToWork = key => {
  const o = portalOrders.find(x => x.key === key); if (!o) return;
  goToSection('works');
  $('wCustomer').value = o.customerId || ''; updatePages();
  $('wName').value = o.campName || 'Client Portal Order'; $('wDays').value = num(o.days) || 7;
  $('wDollar').value = num(o.budget) || 0; $('wRate').value = rateFor(today()) || num(db.agency?.defaultRate) || 125;
  $('wNote').value = o.note || 'From Client Portal'; updateWorkPreview();
  toast('পোর্টাল অর্ডার কাজের ফর্মে বসানো হয়েছে — যাচাই করে সেভ করুন!');
};
window.deletePortalOrder = async key => {
  if (!confirm('এই অর্ডার রিকোয়েস্ট মুছে ফেলবেন?')) return;
  const cfg = readCloudSync(), clean = String(cfg.url || '').trim().replace(/\/+$/, '');
  if (clean) { try { await fetch(`${clean}/ads_hisab_portal_orders/${encodeURIComponent(key)}.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : ''), { method: 'DELETE' }); } catch (e) {} }
  portalOrders = portalOrders.filter(x => x.key !== key); renderPortalOrders(); toast('অর্ডার মুছে ফেলা হয়েছে', 'warn');
};

// Auth System
const readLocalAccounts = () => { try { return JSON.parse(localStorage.getItem(ACCOUNTSKEY) || '[]'); } catch (e) { return []; } };
function activateAccountData(account) { if (!account.id) account.id = 'legacy-super-admin'; KEY = (account.id === 'legacy-super-admin' || account.role === 'staff') ? MASTER_DB_KEY : ('ads_hisab_user_data_v72_' + account.id); PROFILEKEY = 'ads_hisab_user_profile_v72_' + account.id; loadDb(); }
function enterLoggedInUI(account, skipLog = false) {
  realSuperAdmin = null; if ($('impersonateBanner')) $('impersonateBanner').style.display = 'none';
  activeAccount = account; try { sessionStorage.setItem(SESSION_ACC_KEY, JSON.stringify(account)); } catch (e) {}
  applyPermissionClasses(); activateAccountData(account); if (!skipLog) logActivity('লগইন করেছেন');
  if ($('authOverlay')) $('authOverlay').style.display = 'none';
  if ($('adminTab')) $('adminTab').style.display = (account.role === 'super_admin' || account.role === 'admin' || account.id === 'legacy-super-admin') ? 'flex' : 'none';
  updateHeaderAndProfile(); applyGlobalNotice();
  if ($('wRate') && !num($('wRate').value)) $('wRate').value = rateFor(today()) || '';
  if ($('qtRate') && !num($('qtRate').value)) $('qtRate').value = rateFor(today()) || '';
  if ($('wFeePct')) $('wFeePct').value = num(db.agency?.defaultFeePct) || 0;
  goToSection('dash'); updateWorkPreview(); updateQuotePreview(); if (typeof refreshOnlineChat === 'function') refreshOnlineChat();
  const cfg = readCloudSync();
  setSyncUi(!cfg.url ? '' : (localStorage.getItem(LOCAL_DIRTY_KEY) === '1' ? 'err' : 'ok'), !cfg.url ? 'Local' : (localStorage.getItem(LOCAL_DIRTY_KEY) === '1' ? 'Pending Sync' : 'Synced'));
  updateStorageMeter(); loadPortalOrders(false);
}
window.performLocalLogout = reasonMsg => {
  localStorage.removeItem(REMEMBER_LOGIN_KEY); sessionStorage.removeItem(SESSION_ACC_KEY); activeAccount = null; realSuperAdmin = null;
  if ($('impersonateBanner')) $('impersonateBanner').style.display = 'none';
  document.body.classList.remove('role-staff', 'role-superadmin', 'no-perm-del', 'no-perm-edit', 'no-perm-pay', 'no-perm-exp');
  KEY = MASTER_DB_KEY; loadDb();
  document.querySelectorAll('.side-menu button').forEach(b => b.classList.toggle('active', b.dataset.tab === 'dash'));
  document.querySelectorAll('main section').forEach(s => s.classList.toggle('active', s.id === 'dash'));
  if ($('authOverlay')) $('authOverlay').style.display = 'flex'; if ($('loginFormContainer')) $('loginFormContainer').style.display = 'block'; if ($('registerPanel')) $('registerPanel').style.display = 'none';
  if ($('authMsg')) $('authMsg').textContent = reasonMsg || ''; if ($('adminTab')) $('adminTab').style.display = 'none';
  if ($('loginPass')) $('loginPass').value = ''; if ($('rememberLogin')) $('rememberLogin').checked = false;
  toast(reasonMsg || 'সফলভাবে লগ আউট হয়েছে', reasonMsg ? 'error' : 'success');
};
window.login = () => {
  const identity = ($('loginUser')?.value || '').trim().toLowerCase(), pass = $('loginPass')?.value || '';
  if (!identity || !pass) return ($('authMsg') && ($('authMsg').textContent = 'ইউজারনেম ও পাসওয়ার্ড দিন।'));
  const accounts = readLocalAccounts();
  let accIdx = accounts.findIndex(a => [a.username, a.email, a.phone].some(v => String(v || '').trim().toLowerCase() === identity) && checkPass(pass, a.password));
  let account = accIdx !== -1 ? accounts[accIdx] : null;
  if (account && !String(account.password).startsWith('h1_')) { accounts[accIdx].password = hashPass(pass); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); }
  const saPass = localStorage.getItem(PASSKEY) || '123456789';
  if (!account && identity === 'admin' && checkPass(pass, saPass)) {
    if (!String(saPass).startsWith('h1_')) localStorage.setItem(PASSKEY, hashPass(pass));
    account = { id: 'legacy-super-admin', username: 'admin', name: 'Super Admin', email: 'admin@example.com', phone: '01700000000', role: 'super_admin', userNumber: 1, status: 'active' };
  }
  if (!account) return ($('authMsg') && ($('authMsg').textContent = 'লগইন তথ্য সঠিক নয়। (প্রথমবার: admin / 123456789)'));
  if (account.status === 'suspended') return ($('authMsg') && ($('authMsg').textContent = 'অ্যাকাউন্ট ব্লক (Suspended) করা আছে।'));
  if (isAccountExpired(account)) return ($('authMsg') && ($('authMsg').textContent = `সাবস্ক্রিপশন মেয়াদ (${account.expiryDate}) শেষ হয়েছে!`));
  const nowStr = new Date().toLocaleString('bn-BD');
  if (account.id === 'legacy-super-admin') { const m = readSuperAdminMeta(); m.lastLogin = nowStr; m.loginCount = num(m.loginCount) + 1; writeSuperAdminMeta(m); }
  else if (accIdx !== -1) { accounts[accIdx].lastLogin = nowStr; accounts[accIdx].loginCount = num(accounts[accIdx].loginCount) + 1; localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); account = accounts[accIdx]; }
  if ($('rememberLogin')?.checked) localStorage.setItem(REMEMBER_LOGIN_KEY, encodeRemember({ identity, pass })); else localStorage.removeItem(REMEMBER_LOGIN_KEY);
  enterLoggedInUI(account, false); toast(`স্বাগতম, ${readProfile().name || account.name}!`);
};
['loginUser','loginPass'].forEach(id => { if ($(id)) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') window.login(); }); });
if ($('loginBtn')) $('loginBtn').onclick = window.login;
if ($('showRegisterBtn')) $('showRegisterBtn').onclick = () => { $('loginFormContainer').style.display = 'none'; $('registerPanel').style.display = 'block'; if ($('authMsg')) $('authMsg').textContent = ''; };
if ($('backToLoginBtn')) $('backToLoginBtn').onclick = () => { $('registerPanel').style.display = 'none'; $('loginFormContainer').style.display = 'block'; if ($('authMsg')) $('authMsg').textContent = ''; };
if ($('registerBtn')) $('registerBtn').onclick = () => {
  const name = $('regName')?.value.trim(), username = ($('regUsername')?.value || '').trim().toLowerCase(), email = ($('regEmail')?.value || '').trim().toLowerCase(), phone = ($('regPhone')?.value || '').trim(), pass = $('regPass')?.value || '', pass2 = $('regPass2')?.value || '';
  if (!name || !username || !email || !phone || !pass) return ($('authMsg').textContent = 'সবগুলো ঘর পূরণ করুন।');
  if (username === 'admin') return ($('authMsg').textContent = 'admin ইউজারনেম সংরক্ষিত।');
  if (pass.length < 6) return ($('authMsg').textContent = 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
  if (pass !== pass2) return ($('authMsg').textContent = 'পাসওয়ার্ড মিলছে না।');
  const accounts = readLocalAccounts(); if (accounts.some(a => a.username === username || a.email === email)) return ($('authMsg').textContent = 'ইউজারনেম বা ইমেইল আগেই আছে।');
  const next = Number(localStorage.getItem(NEXTUSERIDKEY) || 2), account = { id: uid(), updatedAt: Date.now(), userNumber: next, name, username, email, phone, password: hashPass(pass), role: 'user', plan: 'Lifetime', expiryDate: '', status: 'active', lastLogin: new Date().toLocaleString('bn-BD'), loginCount: 1 };
  accounts.push(account); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); localStorage.setItem(NEXTUSERIDKEY, String(next + 1));
  localStorage.setItem('ads_hisab_user_profile_v72_' + account.id, JSON.stringify({ name, email, phone, pic: '' }));
  enterLoggedInUI(account, false); logActivity(`নতুন ইউজার রেজিস্ট্রেশন: ${name}`); triggerAccountCloudSync(); toast('নতুন অ্যাকাউন্ট তৈরি হয়েছে!');
};

// Recovery
if ($('forgotBtn')) $('forgotBtn').onclick = () => { $('recoveryMode').value = 'password'; $('recoveryTitle').textContent = 'পাসওয়ার্ড রিসেট'; $('recNewPassWrap').style.display = 'block'; $('recNewPass').required = true; $('recoveryForm').reset(); $('recoveryModal').style.display = 'flex'; };
if ($('forgotUserBtn')) $('forgotUserBtn').onclick = () => { $('recoveryMode').value = 'username'; $('recoveryTitle').textContent = 'ইউজারনেম খুঁজুন'; $('recNewPassWrap').style.display = 'none'; $('recNewPass').required = false; $('recoveryForm').reset(); $('recoveryModal').style.display = 'flex'; };
if ($('recoveryForm')) $('recoveryForm').onsubmit = e => {
  e.preventDefault(); const mode = $('recoveryMode').value, email = $('recEmail').value.trim().toLowerCase(), phone = $('recPhone').value.trim(), accounts = readLocalAccounts();
  const idx = accounts.findIndex(a => String(a.email || '').trim().toLowerCase() === email && String(a.phone || '').trim() === phone);
  if (idx === -1) {
    const saProf = (() => { try { return JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_legacy-super-admin') || '{}'); } catch (err) { return {}; } })();
    if (email === String(saProf.email || 'admin@example.com').trim().toLowerCase() && phone === String(saProf.phone || '01700000000').trim()) {
      if (mode === 'username') { toast('আপনার ইউজারনেম: admin'); closeModal('recoveryModal'); }
      else { const np = $('recNewPass').value; if (np.length < 6) return toast('৬+ অক্ষর দিন', 'error'); localStorage.setItem(PASSKEY, hashPass(np)); triggerAccountCloudSync(); toast('সুপার অ্যাডমিন পাসওয়ার্ড রিসেট হয়েছে!'); closeModal('recoveryModal'); }
      return;
    }
    return toast('ইমেইল ও মোবাইল মিলছে না!', 'error');
  }
  if (mode === 'username') { toast(`আপনার ইউজারনেম: ${accounts[idx].username}`); closeModal('recoveryModal'); }
  else { const np = $('recNewPass').value; if (np.length < 6) return toast('৬+ অক্ষর দিন', 'error'); accounts[idx].password = hashPass(np); accounts[idx].updatedAt = Date.now(); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); triggerAccountCloudSync(); toast('পাসওয়ার্ড রিসেট হয়েছে!'); closeModal('recoveryModal'); }
};

// Profile & Agency Branding
const readProfile = () => { try { return JSON.parse(localStorage.getItem(PROFILEKEY) || '{}'); } catch (e) { return {}; } };
function updateAgencyThumbs(l, q) { if ($('agLogoPreview')) { $('agLogoPreview').style.display = l ? 'block' : 'none'; if (l) $('agLogoPreview').src = l; } if ($('agQrPreview')) { $('agQrPreview').style.display = q ? 'block' : 'none'; if (q) $('agQrPreview').src = q; } }
function applyAgencyBranding() {
  const ag = db.agency || {}, title = ag.name || 'Ads হিসাব ম্যানেজার', tagline = ag.tagline || 'Agency OS · Pro v77';
  if ($('sideBrandTitle')) $('sideBrandTitle').textContent = title; if ($('sideBrandSub')) $('sideBrandSub').textContent = tagline;
  if ($('agName')) $('agName').value = title; if ($('agTagline')) $('agTagline').value = tagline;
  if ($('agPhone')) $('agPhone').value = ag.phone || ''; if ($('agEmail')) $('agEmail').value = ag.email || ''; if ($('agAddress')) $('agAddress').value = ag.address || '';
  if ($('agDefaultRate')) $('agDefaultRate').value = ag.defaultRate || 125; if ($('agDefaultFee')) $('agDefaultFee').value = ag.defaultFeePct || 0; if ($('agMonthlyGoal')) $('agMonthlyGoal').value = num(ag.monthlyGoal) || 100000;
  pendingAgLogoData = ag.logoUrl || ''; pendingAgQrData = ag.qrUrl || '';
  if ($('agLogoUrl')) { $('agLogoUrl').value = pendingAgLogoData.startsWith('data:') ? '' : pendingAgLogoData; $('agLogoUrl').placeholder = pendingAgLogoData.startsWith('data:') ? 'আপলোড করা লোগো সেভ আছে' : 'https://...'; }
  if ($('agQrUrl')) { $('agQrUrl').value = pendingAgQrData.startsWith('data:') ? '' : pendingAgQrData; $('agQrUrl').placeholder = pendingAgQrData.startsWith('data:') ? 'আপলোড করা QR সেভ আছে' : 'https://...'; }
  updateAgencyThumbs(pendingAgLogoData, pendingAgQrData);
  if ($('agSignText')) $('agSignText').value = ag.signText || ''; if ($('agTermsText')) $('agTermsText').value = ag.termsText || ''; if ($('agPayInfo')) $('agPayInfo').value = ag.payInfo || '';
  if ($('agMetaToken')) $('agMetaToken').value = ag.metaToken || ''; if ($('agWaTemplate')) $('agWaTemplate').value = ag.waTemplate || DEFAULT_WA_TEMPLATE;
}
if ($('agLogoFile')) $('agLogoFile').onchange = async e => { const f = e.target.files?.[0]; if (!f) return; try { pendingAgLogoData = await compressImageFile(f, 320, 0.85); if ($('agLogoUrl')) $('agLogoUrl').value = ''; updateAgencyThumbs(pendingAgLogoData, pendingAgQrData); toast('লোগো প্রস্তুত! সেভ করুন।'); } catch (err) {} };
if ($('agQrFile')) $('agQrFile').onchange = async e => { const f = e.target.files?.[0]; if (!f) return; try { pendingAgQrData = await compressImageFile(f, 320, 0.85); if ($('agQrUrl')) $('agQrUrl').value = ''; updateAgencyThumbs(pendingAgLogoData, pendingAgQrData); toast('QR প্রস্তুত! সেভ করুন।'); } catch (err) {} };
if ($('removeAgLogoBtn')) $('removeAgLogoBtn').onclick = () => { pendingAgLogoData = ''; if ($('agLogoUrl')) $('agLogoUrl').value = ''; db.agency.logoUrl = ''; save(); applyAgencyBranding(); toast('লোগো সরানো হয়েছে', 'warn'); };
if ($('removeAgQrBtn')) $('removeAgQrBtn').onclick = () => { pendingAgQrData = ''; if ($('agQrUrl')) $('agQrUrl').value = ''; db.agency.qrUrl = ''; save(); applyAgencyBranding(); toast('QR সরানো হয়েছে', 'warn'); };
if ($('agLogoUrl')) $('agLogoUrl').oninput = e => updateAgencyThumbs(e.target.value.trim() || pendingAgLogoData, $('agQrUrl')?.value.trim() || pendingAgQrData);
if ($('agQrUrl')) $('agQrUrl').oninput = e => updateAgencyThumbs($('agLogoUrl')?.value.trim() || pendingAgLogoData, e.target.value.trim() || pendingAgQrData);
if ($('agencyForm')) $('agencyForm').onsubmit = e => {
  e.preventDefault();
  db.agency = { name: $('agName').value.trim() || 'Ads হিসাব ম্যানেজার', tagline: $('agTagline').value.trim() || 'Agency OS · Pro v77', phone: $('agPhone').value.trim(), email: $('agEmail')?.value.trim() || '', address: $('agAddress')?.value.trim() || '', defaultRate: num($('agDefaultRate').value) || 125, defaultFeePct: num($('agDefaultFee').value) || 0, monthlyGoal: num($('agMonthlyGoal')?.value) || 0, logoUrl: $('agLogoUrl')?.value.trim() || pendingAgLogoData || '', qrUrl: $('agQrUrl')?.value.trim() || pendingAgQrData || '', signText: $('agSignText')?.value.trim() || '', termsText: $('agTermsText')?.value.trim() || '', payInfo: $('agPayInfo')?.value.trim() || '', metaToken: $('agMetaToken')?.value.trim() || '', waTemplate: $('agWaTemplate')?.value.trim() || DEFAULT_WA_TEMPLATE };
  save(); applyAgencyBranding(); logActivity('এজেন্সি তথ্য আপডেট'); if ($('agLogoFile')) $('agLogoFile').value = ''; if ($('agQrFile')) $('agQrFile').value = ''; toast('এজেন্সি সেটিংস সেভ হয়েছে!');
};

function updateHeaderAndProfile() {
  const p = readProfile(), currentName = p.name || activeAccount?.name || 'User', roleMap = { super_admin: 'Super Admin', admin: 'Admin', staff: 'Staff', user: 'User' }, currentRole = (activeAccount?.id === 'legacy-super-admin') ? 'Super Admin' : (roleMap[activeAccount?.role] || 'User');
  if ($('welcomeTitle')) $('welcomeTitle').textContent = `স্বাগতম, ${currentName}!`;
  if ($('headerProfileName')) $('headerProfileName').textContent = currentName; if ($('headerProfileRole')) $('headerProfileRole').textContent = currentRole;
  if ($('sideRoleName')) $('sideRoleName').textContent = currentRole; if ($('sideRoleDesc')) $('sideRoleDesc').textContent = isStaff() ? 'স্টাফ ওয়ার্কস্পেস' : 'সম্পূর্ণ এক্সেস ও কন্ট্রোল';
  if ($('profileDisplayName')) $('profileDisplayName').textContent = currentName; if ($('profileUserId')) $('profileUserId').textContent = 'ID: AS-' + String(activeAccount?.userNumber || 1).padStart(5, '0');
  if ($('profileRoleBadge')) { $('profileRoleBadge').textContent = currentRole; $('profileRoleBadge').className = isStaff() ? 'badge-admin' : 'badge-success'; }
  if ($('profileName')) $('profileName').value = currentName; if ($('profileEmail')) $('profileEmail').value = p.email || activeAccount?.email || ''; if ($('profilePhone')) $('profilePhone').value = p.phone || activeAccount?.phone || '';
  pendingProfilePicData = p.pic || '';
  if ($('profilePicInput')) { $('profilePicInput').value = pendingProfilePicData.startsWith('data:image/') ? '' : pendingProfilePicData; $('profilePicInput').placeholder = pendingProfilePicData.startsWith('data:image/') ? 'আপলোড করা ছবি সেভ আছে' : 'https://...'; }
  const fb = defaultAvatarUrl(currentName), picUrl = pendingProfilePicData || fb;
  [$('profilePreview'), $('headerProfilePic')].forEach(img => { if (!img) return; img.onerror = () => { img.onerror = null; img.src = fb; }; img.src = picUrl; });
  applyAgencyBranding(); applyGlobalNotice(); updateStorageMeter(); if (!isStaff()) renderAdminPanel();
}
if ($('profilePicInput')) $('profilePicInput').oninput = e => { if ($('profilePreview')) $('profilePreview').src = e.target.value.trim() || pendingProfilePicData || defaultAvatarUrl($('profileName')?.value || 'U'); };
if ($('profilePicFile')) $('profilePicFile').onchange = async e => { const f = e.target.files?.[0]; if (!f) return; try { pendingProfilePicData = await compressImageFile(f, 240, 0.82); if ($('profilePreview')) $('profilePreview').src = pendingProfilePicData; if ($('profilePicInput')) $('profilePicInput').value = ''; toast('ছবি প্রস্তুত! আপডেট করুন।'); } catch (err) {} };
if ($('removeProfilePicBtn')) $('removeProfilePicBtn').onclick = () => { pendingProfilePicData = ''; if ($('profilePicInput')) $('profilePicInput').value = ''; const p = readProfile(); p.pic = ''; localStorage.setItem(PROFILEKEY, JSON.stringify(p)); updateHeaderAndProfile(); triggerAccountCloudSync(); toast('ছবি সরানো হয়েছে', 'warn'); };
function saveProfileData(name, email, phone, pic) {
  try { localStorage.setItem(PROFILEKEY, JSON.stringify({ name, email, phone, pic })); } catch (e) { return toast('ছবি বড় হওয়ায় সেভ হয়নি!', 'error'); }
  if (activeAccount) { activeAccount.name = name; activeAccount.email = email; activeAccount.phone = phone; try { sessionStorage.setItem(SESSION_ACC_KEY, JSON.stringify(activeAccount)); } catch (e) {} if (activeAccount.id !== 'legacy-super-admin') { const accs = readLocalAccounts(), idx = accs.findIndex(a => a.id === activeAccount.id); if (idx !== -1) { accs[idx].name = name; accs[idx].email = email; accs[idx].phone = phone; accs[idx].updatedAt = Date.now(); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs)); } } }
  logActivity(`প্রোফাইল আপডেট: ${name}`); updateHeaderAndProfile(); triggerAccountCloudSync(); toast('প্রোফাইল আপডেট ও সিঙ্ক হয়েছে!');
}
if ($('profileForm')) $('profileForm').onsubmit = e => { e.preventDefault(); saveProfileData($('profileName').value.trim(), $('profileEmail').value.trim(), $('profilePhone').value.trim(), $('profilePicInput').value.trim() || pendingProfilePicData || ''); };
if ($('settingsPasswordForm')) $('settingsPasswordForm').onsubmit = e => {
  e.preventDefault(); const oldP = $('settingsOldPass').value, newP = $('settingsNewPass').value, m = $('settingsPasswordMsg');
  if (newP !== $('settingsNewPass2').value) return (m.textContent = 'পাসওয়ার্ড দুটি মিলছে না!'); if (newP.length < 6) return (m.textContent = 'কমপক্ষে ৬ অক্ষর দিন!');
  if (activeAccount && activeAccount.id !== 'legacy-super-admin') { if (!checkPass(oldP, activeAccount.password)) return (m.textContent = 'বর্তমান পাসওয়ার্ড ভুল!'); activeAccount.password = hashPass(newP); activeAccount.updatedAt = Date.now(); const accs = readLocalAccounts(), idx = accs.findIndex(a => a.id === activeAccount.id); if (idx !== -1) { accs[idx] = activeAccount; localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs)); } try { sessionStorage.setItem(SESSION_ACC_KEY, JSON.stringify(activeAccount)); } catch (err) {} }
  else { if (!checkPass(oldP, localStorage.getItem(PASSKEY) || '123456789')) return (m.textContent = 'বর্তমান পাসওয়ার্ড ভুল!'); localStorage.setItem(PASSKEY, hashPass(newP)); }
  const rem = decodeRemember(localStorage.getItem(REMEMBER_LOGIN_KEY)); if (rem) localStorage.setItem(REMEMBER_LOGIN_KEY, encodeRemember({ ...rem, pass: newP }));
  m.textContent = 'পাসওয়ার্ড আপডেট হয়েছে!'; triggerAccountCloudSync(); e.target.reset(); toast('পাসওয়ার্ড আপডেট হয়েছে!');
};
if ($('usernameForm')) $('usernameForm').onsubmit = e => {
  e.preventDefault(); const pass = $('userChangePass').value, newU = $('newUsername').value.trim().toLowerCase(), m = $('usernameMsg');
  if (newU === 'admin') return (m.textContent = 'admin সংরক্ষিত।');
  if (activeAccount && activeAccount.id !== 'legacy-super-admin') {
    if (!checkPass(pass, activeAccount.password)) return (m.textContent = 'পাসওয়ার্ড ভুল!');
    const accs = readLocalAccounts(); if (accs.some(a => a.id !== activeAccount.id && a.username === newU)) return (m.textContent = 'ইউজারনেম আগেই নেওয়া!');
    activeAccount.username = newU; activeAccount.updatedAt = Date.now(); const idx = accs.findIndex(a => a.id === activeAccount.id); if (idx !== -1) { accs[idx] = activeAccount; localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs)); }
    try { sessionStorage.setItem(SESSION_ACC_KEY, JSON.stringify(activeAccount)); } catch (err) {}
    const rem = decodeRemember(localStorage.getItem(REMEMBER_LOGIN_KEY)); if (rem) localStorage.setItem(REMEMBER_LOGIN_KEY, encodeRemember({ ...rem, identity: newU }));
    m.textContent = 'ইউজারনেম আপডেট হয়েছে!'; triggerAccountCloudSync(); toast('ইউজারনেম আপডেট হয়েছে!');
  } else m.textContent = 'admin পরিবর্তনযোগ্য নয়।'; e.target.reset();
};

// Client Message Templates Hub (Module 6)
window.openMsgTemplates = (custId, workId = '') => {
  const c = db.customers.find(x => x.id === custId) || { name: 'ক্লায়েন্ট', phone: '' };
  const w = workId ? db.works.find(x => x.id === workId) : null;
  const ag = db.agency || {}, agName = ag.name || 'Ads হিসাব ম্যানেজার';
  const b = billed(custId), p = paid(custId), due = Math.max(0, b - p), payInf = ag.payInfo ? `পেমেন্ট মাধ্যম: ${ag.payInfo}` : '';
  const camp = w ? w.name : 'আপনার ফেসবুক বিজ্ঞাপন', pg = w ? (pname(w.pageId) || 'আপনার পেজ') : 'আপনার পেজ';
  const templates = [
    { title: '✅ অ্যাড লাইভ / চালু হয়েছে (Live Notice)', msg: `আসসালামু আলাইকুম ${c.name}, ${agName} থেকে জানাচ্ছি—${pg}-এর "${camp}" ক্যাম্পেইনটি সফলভাবে অনুমোদিত হয়ে চালু (Active) হয়েছে! কোনো প্রশ্ন থাকলে জানাবেন। ধন্যবাদ!` },
    { title: '🔑 ফেসবুক পেজ ও BM এক্সেস দেওয়ার নিয়ম', msg: `আসসালামু আলাইকুম ${c.name}, আপনার পেজে অ্যাড চালানোর জন্য অনুগ্রহ করে পেজ এক্সেস দিন:\n১) আপনার Facebook Page-এ যান → Settings / Professional Dashboard → Page Access।\n২) "Add New" বা "Assign a New Page Role"-এ ক্লিক করে আমাদের নাম/ইমেইল (${ag.email || ag.phone || agName}) সিলেক্ট করে Full/Ads Control দিন।\nএক্সেস দিয়ে জানালে আমরা সেটআপ শুরু করব। ধন্যবাদ!` },
    { title: '⚠️ অ্যাড রিজেক্ট / পলিসি ইস্যু আপডেট', msg: `আসসালামু আলাইকুম ${c.name}, ${agName} থেকে জানাচ্ছি—ফেসবুকের বিজ্ঞাপন পলিসির কারণে "${camp}" অ্যাডটি সাময়িকভাবে রিজেক্ট/পজ হয়েছে। অনুগ্রহ করে বিকল্প পোস্ট/ছবি বা ক্যাপশন পরিবর্তন করে দিলে আমরা আবার চালু করে দিচ্ছি। ধন্যবাদ!` },
    { title: '🔄 ক্যাম্পেইন সম্পন্ন + রিনিউ অফার', msg: `আসসালামু আলাইকুম ${c.name}, আপনার "${camp}" ক্যাম্পেইনের মেয়াদ সম্পন্ন হয়েছে! ভালো রেজাল্ট ধরে রাখতে চাইলে এটি আরও ৭ দিন রিনিউ করতে পারেন। রিনিউ করতে চাইলে বাজেট কনফার্ম করুন। ধন্যবাদ - ${agName}` },
    { title: '💰 পেমেন্ট / অ্যাডভান্স রিচার্জ অনুরোধ', msg: `আসসালামু আলাইকুম ${c.name}, ${agName} থেকে জানাচ্ছি—আপনার মোট বিল ${money(b)}, জমা ${money(p)}, বকেয়া ${money(due)}। অ্যাড নিরবচ্ছিন্ন রাখতে অনুগ্রহ করে পেমেন্ট সম্পন্ন করুন। ${payInf} ধন্যবাদ!` }
  ];
  const wa = normalizeBdPhone(c.phone);
  $('msgTplCustInfo').innerHTML = `ক্লায়েন্ট: <strong>${esc(c.name)}</strong> (${esc(c.phone || 'ফোন নেই')})${w ? ` · ক্যাম্পেইন: <strong>${esc(w.name)}</strong>` : ''}`;
  $('msgTplList').innerHTML = templates.map((t, i) => `
    <div class="template-card">
      <h4>${t.title}</h4>
      <textarea id="tplTxt_${i}" rows="3" style="font-size:12px;margin-bottom:6px">${esc(t.msg)}</textarea>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="secondary sm" onclick="copyText($('tplTxt_${i}').value,'মেসেজ')">📋 কপি</button>
        ${wa ? `<button type="button" class="sm" style="background:#059669" onclick="window.open('https://wa.me/${wa}?text='+encodeURIComponent($('tplTxt_${i}').value),'_blank')">📲 WhatsApp পাঠান</button>` : ''}
      </div>
    </div>`).join('');
  $('msgTemplatesModal').style.display = 'flex';
};

// Quotation / Estimate Maker (Module 3)
function updateQuotePreview() {
  const b = num($('qtDollar')?.value) * num($('qtRate')?.value), f = num($('qtServiceFee')?.value), t = $('qtServiceFeeType')?.value || 'fixed';
  const svc = f ? (t === 'pct' ? b * (f / 100) : f) : 0;
  if ($('qtPreview')) $('qtPreview').innerHTML = `আনুমানিক মোট কোটেশন বিল: <strong>${money(b + svc)}</strong>${svc ? ` (সার্ভিস চার্জ: ${money(svc)})` : ''}`;
}
['qtDollar','qtRate','qtServiceFee','qtServiceFeeType'].forEach(id => { if ($(id)) { $(id).oninput = updateQuotePreview; $(id).onchange = updateQuotePreview; } });
if ($('qtCustomer')) $('qtCustomer').onchange = () => { const c = db.customers.find(x => x.id === $('qtCustomer').value); if (c) { $('qtCustName').value = c.name; $('qtPhone').value = c.phone || ''; } };
if ($('quoteForm')) $('quoteForm').onsubmit = e => {
  e.preventDefault();
  db.quotations.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), date: $('qtDate').value || today(), customerId: $('qtCustomer').value || '', custName: $('qtCustName').value.trim(), phone: $('qtPhone').value.trim(), title: $('qtTitle').value.trim(), days: num($('qtDays').value) || 7, dollar: num($('qtDollar').value), rate: num($('qtRate').value), serviceFee: num($('qtServiceFee').value), serviceFeeType: $('qtServiceFeeType').value || 'fixed', validUntil: $('qtValidUntil').value || '', note: $('qtNote').value.trim(), status: 'sent' });
  save(); logActivity(`নতুন কোটেশন: ${$('qtCustName').value.trim()}`); e.target.reset(); $('qtDate').value = today(); $('qtRate').value = rateFor(today()) || 125; $('qtDays').value = 7; $('qtDollar').value = 50; updateQuotePreview(); toast('কোটেশন সেভ হয়েছে!');
};
let currentQuoteId = null;
window.openQuoteModal = id => {
  const q = db.quotations.find(x => x.id === id); if (!q) return; currentQuoteId = id; const ag = db.agency || {}, tot = quoteTotal(q);
  if ($('qtModLogo')) { $('qtModLogo').style.display = ag.logoUrl ? 'block' : 'none'; if (ag.logoUrl) $('qtModLogo').src = ag.logoUrl; }
  $('qtModAgName').textContent = ag.name || 'Ads হিসাব ম্যানেজার'; $('qtModAgContact').textContent = agencyContactLine(ag);
  $('qtModNo').textContent = '#QT-' + id.slice(-5).toUpperCase(); $('qtModDate').textContent = 'তারিখ: ' + q.date + (q.validUntil ? ` | মেয়াদ: ${q.validUntil}` : '');
  $('qtModCust').innerHTML = `<strong>প্রাপক:</strong> ${esc(q.custName)} (${esc(q.phone || '—')})`;
  const baseTk = num(q.dollar) * num(q.rate), svc = tot - baseTk;
  $('qtModBody').innerHTML = `<div class="tablewrap" style="margin-top:0"><table><thead><tr><th>বিবরণ</th><th>সময়কাল</th><th>বাজেট ও রেট</th><th>মোট (৳)</th></tr></thead><tbody><tr><td><strong>${esc(q.title)}</strong>${q.note ? `<br><small class="muted">${esc(q.note)}</small>` : ''}</td><td>${q.days} দিন</td><td>${usd(q.dollar)} × ${money(q.rate)}${svc ? `<br><small>+ চার্জ ${money(svc)}</small>` : ''}</td><td><strong>${money(tot)}</strong></td></tr></tbody></table></div>`;
  if ($('qtModPayInfo')) { $('qtModPayInfo').style.display = ag.payInfo ? 'block' : 'none'; if (ag.payInfo) $('qtModPayInfo').innerHTML = `<strong>💳 পেমেন্ট মাধ্যম:</strong> ${esc(ag.payInfo)}`; }
  $('quoteModal').style.display = 'flex';
};
window.printQuote = () => { document.body.classList.add('printing-quote'); window.print(); setTimeout(() => document.body.classList.remove('printing-quote'), 400); };
window.downloadQuotePng = async () => {
  const q = db.quotations.find(x => x.id === currentQuoteId); if (!q) return;
  const ag = db.agency || {}, tot = quoteTotal(q), logoImg = await loadImgCors(ag.logoUrl);
  const W = 720, H = 370, canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#7046e8'; ctx.fillRect(0, 0, W, 10);
  let tx = 36; if (logoImg) { try { ctx.drawImage(logoImg, 36, 22, 44, 44); tx = 90; } catch (e) {} }
  ctx.fillStyle = '#7046e8'; ctx.font = 'bold 22px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(ag.name || 'Ads হিসাব ম্যানেজার', tx, 48);
  ctx.fillStyle = '#64748b'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(agencyContactLine(ag).slice(0, 68), tx, 68);
  ctx.textAlign = 'right'; ctx.fillStyle = '#0f172a'; ctx.font = 'bold 14px Arial, sans-serif'; ctx.fillText(`QUOTATION #QT-${q.id.slice(-5).toUpperCase()}`, W - 36, 46);
  ctx.fillStyle = '#64748b'; ctx.font = '12px Arial, sans-serif'; ctx.fillText(`তারিখ: ${q.date}${q.validUntil ? ' | মেয়াদ: ' + q.validUntil : ''}`, W - 36, 66);
  ctx.textAlign = 'left'; ctx.strokeStyle = '#e2e8f0'; ctx.beginPath(); ctx.moveTo(36, 88); ctx.lineTo(W - 36, 88); ctx.stroke();
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 16px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`প্রাপক: ${q.custName} (${q.phone || '—'})`, 36, 120);
  ctx.fillStyle = '#f1f5f9'; ctx.fillRect(36, 140, W - 72, 32); ctx.fillStyle = '#334155'; ctx.font = 'bold 13px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText('ক্যাম্পেইন / প্যাকেজ বিবরণ', 48, 161); ctx.fillText('সময়কাল', 360, 161); ctx.textAlign = 'right'; ctx.fillText('আনুমানিক বিল (৳)', W - 48, 161); ctx.textAlign = 'left';
  ctx.fillStyle = '#1e293b'; ctx.font = '13.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(String(q.title).slice(0, 38), 48, 198); ctx.fillText(`${q.days} দিন (${usd(q.dollar)} × ${num(q.rate)})`, 360, 198);
  ctx.textAlign = 'right'; ctx.font = 'bold 15px Arial, sans-serif'; ctx.fillStyle = '#7046e8'; ctx.fillText(money(tot), W - 48, 198); ctx.textAlign = 'left';
  if (q.note) { ctx.fillStyle = '#64748b'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`নোট: ${String(q.note).slice(0, 75)}`, 48, 226); }
  ctx.fillStyle = '#f5f3ff'; ctx.fillRect(36, 252, W - 72, 48); ctx.fillStyle = '#5b21b6'; ctx.font = 'bold 16px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`সর্বমোট প্রাক্কলিত মূল্য: ${money(tot)}`, 52, 282);
  if (ag.payInfo) { ctx.fillStyle = '#1e3a8a'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`পেমেন্ট মাধ্যম: ${String(ag.payInfo).slice(0, 82)}`, 36, 326); }
  ctx.textAlign = 'center'; ctx.fillStyle = '#64748b'; ctx.font = '11.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText('অনুমোদনের পর অর্ডার কনফার্ম করা হবে। ধন্যবাদ!', W / 2, H - 14);
  canvas.toBlob(blob => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `quotation_${q.custName.replace(/\s+/g, '_')}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('কোটেশন PNG ডাউনলোড হয়েছে!'); }, 'image/png');
};
window.sendQuoteWhatsApp = id => {
  const q = db.quotations.find(x => x.id === id); if (!q) return; const wa = normalizeBdPhone(q.phone); if (!wa) return toast('মোবাইল নম্বর নেই!', 'error');
  window.open(`https://wa.me/${wa}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${q.custName}, ${db.agency?.name || 'Ads হিসাব ম্যানেজার'} থেকে আপনার "${q.title}" (${q.days} দিন, ${usd(q.dollar)}) কাজের কোটেশন: মোট আনুমানিক বিল ${money(quoteTotal(q))}। ${q.note ? 'নোট: ' + q.note + ' ' : ''}কনফার্ম করলে কাজ শুরু করা যাবে। ধন্যবাদ!`)}`, '_blank');
};
window.convertQuoteToWork = id => {
  const q = db.quotations.find(x => x.id === id); if (!q) return;
  let cid = q.customerId;
  if (!cid || !db.customers.some(c => c.id === cid)) {
    const existing = db.customers.find(c => c.name.toLowerCase() === q.custName.toLowerCase());
    if (existing) cid = existing.id;
    else { cid = uid(); db.customers.push({ id: cid, createdAt: Date.now(), updatedAt: Date.now(), portalToken: uid().slice(-6), name: q.custName, phone: q.phone || '', stage: 'Active Client', followUpDate: '', retainer: 0, dueLimit: 0, checklist: DEFAULT_CHECKLIST(), note: 'Converted from Quotation' }); }
  }
  q.status = 'accepted'; q.updatedAt = Date.now(); save();
  goToSection('works'); $('wCustomer').value = cid; updatePages(); $('wName').value = q.title; $('wDays').value = q.days; $('wDollar').value = q.dollar; $('wRate').value = q.rate; $('wActualDollar').value = 0;
  if ($('wServiceFee')) $('wServiceFee').value = q.serviceFee || 0; if ($('wServiceFeeType')) $('wServiceFeeType').value = q.serviceFeeType || 'fixed';
  $('wNote').value = q.note || ''; updateWorkPreview(); toast('কোটেশন অর্ডারে রূপান্তর হয়ে কাজের ফর্মে বসেছে!');
};
window.deleteQuote = id => { if (!hasPerm('canDelete') || !confirm('কোটেশন মুছবেন?')) return; const q = db.quotations.find(x => x.id === id); if (q) { moveToTrash('quotation', `কোটেশন: ${q.custName}`, q); markDeleted(id); db.quotations = db.quotations.filter(x => x.id !== id); save(); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn'); } };
function renderQuotations() {
  const q = ($('quoteSearch')?.value || '').toLowerCase(), list = [...db.quotations].sort(byDateDesc).filter(x => !q || (x.custName || '').toLowerCase().includes(q) || (x.title || '').toLowerCase().includes(q));
  if ($('quoteRows')) $('quoteRows').innerHTML = list.map(x => `<tr><td>${esc(x.date)}</td><td><strong>${esc(x.custName)}</strong><br><small class="muted">${esc(x.phone || '—')}</small></td><td>${esc(x.title)} (${x.days} দিন)</td><td>${usd(x.dollar)} × ${money(x.rate)}</td><td><strong>${money(quoteTotal(x))}</strong></td><td><span class="${x.status === 'accepted' ? 'badge-success' : 'badge-admin'}">${x.status === 'accepted' ? 'Accepted' : 'Sent'}</span></td><td><button type="button" class="secondary sm" onclick="openQuoteModal('${x.id}')">👁️ প্রিভিউ</button><button type="button" class="secondary sm" onclick="sendQuoteWhatsApp('${x.id}')">📲</button><button type="button" class="sm" style="background:#059669" onclick="convertQuoteToWork('${x.id}')">⚡ কাজ বানান</button><button type="button" class="danger sm perm-del" onclick="deleteQuote('${x.id}')">মুছুন</button></td></tr>`).join('') || '<tr><td colspan="7">কোনো কোটেশন নেই</td></tr>';
}
if ($('quoteSearch')) $('quoteSearch').oninput = renderQuotations;

// Performance Report Modal + PNG (Module 2)
let currentPerfWorkId = null;
window.openWorkPerfReport = workId => {
  const w = db.works.find(x => x.id === workId); if (!w) return; currentPerfWorkId = workId; const ag = db.agency || {};
  if ($('prfLogoImg')) { $('prfLogoImg').style.display = ag.logoUrl ? 'block' : 'none'; if (ag.logoUrl) $('prfLogoImg').src = ag.logoUrl; }
  $('prfAgencyName').textContent = ag.name || 'Ads হিসাব ম্যানেজার'; $('prfAgencyContact').textContent = agencyContactLine(ag);
  $('prfDate').textContent = 'তারিখ: ' + (w.date || today()); $('prfCustName').textContent = cname(w.customerId);
  $('prfCampName').textContent = w.name; $('prfObjPage').textContent = `${w.objective || 'Ad Campaign'} · ${pname(w.pageId) || 'Facebook Page'} (${w.days || 1} দিন)`;
  const resCount = num(w.conversions), spentUsd = num(w.actualDollar), cprUsd = resCount > 0 ? usd(spentUsd / resCount) : '—', cprTk = resCount > 0 ? money(bill(w) / resCount) : '—';
  $('prfStatsGrid').innerHTML = `
    <div class="perf-stat"><small>ব্যবহৃত বাজেট ($)</small><strong>${usd(spentUsd)} / ${usd(w.dollar)}</strong></div>
    <div class="perf-stat"><small>মোট বিল (৳)</small><strong>${money(bill(w))}</strong></div>
    <div class="perf-stat"><small>Reach / Impressions</small><strong>${num(w.reach).toLocaleString()}</strong></div>
    <div class="perf-stat"><small>Link Clicks</small><strong>${num(w.clicks).toLocaleString()}</strong></div>
    <div class="perf-stat"><small>Results (Msg/Lead/Sale)</small><strong>${resCount.toLocaleString()}</strong></div>
    <div class="perf-stat"><small>Cost Per Result ($)</small><strong>${cprUsd}</strong></div>
    <div class="perf-stat"><small>Cost Per Result (৳)</small><strong>${cprTk}</strong></div>
    <div class="perf-stat"><small>স্ট্যাটাস</small><strong>${esc(w.status)}</strong></div>`;
  const briefParts = [w.targetLoc ? `📍 লোকেশন: ${w.targetLoc}` : '', w.targetAge ? `👥 বয়স/জেন্ডার: ${w.targetAge}` : '', w.audience ? `🎯 অডিয়েন্স: ${w.audience}` : '', w.postUrl ? `🔗 পোস্ট: ${w.postUrl}` : '', (w.policyIssue && w.policyIssue !== 'None') ? `⚠️ পলিসি নোট: ${w.policyIssue}` : ''].filter(Boolean);
  $('prfBriefBox').innerHTML = briefParts.length ? briefParts.join('<br>') : 'টার্গেটিং ও ডেলিভারি স্বাভাবিক রয়েছে।';
  if ($('prfProofWrap') && $('prfProofImg')) { if (w.proofImg) { $('prfProofWrap').style.display = 'block'; $('prfProofImg').src = w.proofImg; } else $('prfProofWrap').style.display = 'none'; }
  $('perfReportModal').style.display = 'flex';
};
window.printPerfReport = () => { document.body.classList.add('printing-perf'); window.print(); setTimeout(() => document.body.classList.remove('printing-perf'), 400); };
window.sendPerfReportWhatsApp = () => {
  const w = db.works.find(x => x.id === currentPerfWorkId); if (!w) return;
  const c = db.customers.find(x => x.id === w.customerId), wa = normalizeBdPhone(c?.phone); if (!wa) return toast('মোবাইল নম্বর নেই!', 'error');
  const resCount = num(w.conversions), cpr = resCount > 0 ? usd(num(w.actualDollar) / resCount) : '—';
  window.open(`https://wa.me/${wa}?text=${encodeURIComponent(`📊 *ক্যাম্পেইন পারফরম্যান্স রিপোর্ট*\nএজেন্সি: ${db.agency?.name || 'Ads হিসাব ম্যানেজার'}\nক্যাম্পেইন: ${w.name}\nতারিখ: ${w.date} (${w.days} দিন)\n\n💵 ব্যবহৃত বাজেট: ${usd(w.actualDollar)} / ${usd(w.dollar)}\n💰 মোট বিল: ${money(bill(w))}\n👁️ Reach: ${num(w.reach).toLocaleString()}\n🖱️ Clicks: ${num(w.clicks).toLocaleString()}\n🎯 Results: ${resCount}\n📉 Cost/Result: ${cpr}\nস্ট্যাটাস: ${w.status}`)}`, '_blank');
};
window.downloadPerfReportPng = async () => {
  const w = db.works.find(x => x.id === currentPerfWorkId); if (!w) return;
  const ag = db.agency || {}, [logoImg, proofImg] = await Promise.all([loadImgCors(ag.logoUrl), loadImgCors(w.proofImg)]);
  const W = 740, proofH = proofImg ? Math.min(260, Math.round(proofImg.height * ((W - 80) / proofImg.width))) + 34 : 0, H = 410 + proofH;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#2563eb'; ctx.fillRect(0, 0, W, 10);
  let tx = 36; if (logoImg) { try { ctx.drawImage(logoImg, 36, 22, 44, 44); tx = 90; } catch (e) {} }
  ctx.fillStyle = '#2563eb'; ctx.font = 'bold 22px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(ag.name || 'Ads হিসাব ম্যানেজার', tx, 46);
  ctx.fillStyle = '#64748b'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(agencyContactLine(ag).slice(0, 65), tx, 66);
  ctx.textAlign = 'right'; ctx.fillStyle = '#0f172a'; ctx.font = 'bold 13px Arial, sans-serif'; ctx.fillText('CAMPAIGN REPORT', W - 36, 44);
  ctx.fillStyle = '#64748b'; ctx.font = '12px Arial, sans-serif'; ctx.fillText(`তারিখ: ${w.date}`, W - 36, 64);
  ctx.textAlign = 'left'; ctx.strokeStyle = '#e2e8f0'; ctx.beginPath(); ctx.moveTo(36, 84); ctx.lineTo(W - 36, 84); ctx.stroke();
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 16px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`ক্লায়েন্ট: ${cname(w.customerId)}`, 36, 114);
  ctx.fillStyle = '#2563eb'; ctx.font = 'bold 15px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`ক্যাম্পেইন: ${w.name} (${w.objective || 'Ad'})`, 36, 138);
  const resCount = num(w.conversions), cpr = resCount > 0 ? usd(num(w.actualDollar) / resCount) : '—';
  const cards = [['ব্যবহৃত বাজেট', `${usd(w.actualDollar)} / ${usd(w.dollar)}`], ['মোট বিল', money(bill(w))], ['Reach', num(w.reach).toLocaleString()], ['Clicks', num(w.clicks).toLocaleString()], ['Results', String(resCount)], ['Cost / Result', cpr], ['মেয়াদ', `${w.days} দিন`], ['স্ট্যাটাস', String(w.status).toUpperCase()]];
  cards.forEach(([lbl, val], i) => {
    const col = i % 4, row = Math.floor(i / 4), bx = 36 + col * 168, by = 160 + row * 74;
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(bx, by, 158, 64); ctx.strokeStyle = '#e2e8f0'; ctx.strokeRect(bx, by, 158, 64);
    ctx.fillStyle = '#64748b'; ctx.font = '11.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(lbl, bx + 10, by + 22);
    ctx.fillStyle = '#2563eb'; ctx.font = 'bold 14.5px Inter, Arial, sans-serif'; ctx.fillText(val, bx + 10, by + 46);
  });
  let y = 320;
  if (w.targetLoc || w.targetAge) { ctx.fillStyle = '#475569'; ctx.font = '12.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`টার্গেটিং: ${w.targetLoc || '—'} | বয়স: ${w.targetAge || '—'}`, 36, y); y += 26; }
  if (proofImg) { const ph = proofH - 34; ctx.fillStyle = '#64748b'; ctx.font = 'bold 12px Inter, Arial, sans-serif'; ctx.fillText('Ads Manager Proof:', 36, y + 10); try { ctx.drawImage(proofImg, 36, y + 20, W - 72, ph); } catch (e) {} }
  ctx.textAlign = 'center'; ctx.fillStyle = '#64748b'; ctx.font = '11.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`Generated by ${ag.name || 'Ads হিসাব ম্যানেজার'}`, W / 2, H - 14);
  canvas.toBlob(blob => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `report_${w.name.replace(/\s+/g, '_')}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('রিপোর্ট PNG ডাউনলোড হয়েছে!'); }, 'image/png');
};
window.copyWorkBrief = workId => {
  const w = db.works.find(x => x.id === workId); if (!w) return;
  copyText(`📋 *ক্যাম্পেইন ব্রিফ: ${w.name}*\nক্লায়েন্ট: ${cname(w.customerId)} (${pname(w.pageId)})\nObjective: ${w.objective || '—'}\nবাজেট: ${usd(w.dollar)} (${w.days} দিন)\nলোকেশন: ${w.targetLoc || '—'} | বয়স/জেন্ডার: ${w.targetAge || '—'}\nঅডিয়েন্স: ${w.audience || '—'}\nপোস্ট লিংক: ${w.postUrl || w.creativeLink || '—'}\nক্যাপশন: ${w.adCopy || '—'}`, 'অ্যাড ব্রিফ');
};
// === PART 2 ===
// Pixel & Ad Account Health + Meta API Sync
function generatePixelCode() {
  const pid = $('genPixelId')?.value.trim() || '1234567890', event = $('genPixelEvent')?.value || 'Purchase', val = num($('genPixelVal')?.value);
  const sn = ['Purchase','AddToCart','ViewContent','InitiateCheckout'].includes(event) ? `fbq('track', '${event}', {value: ${val}, currency: 'BDT'});` : `fbq('track', '${event}');`;
  if ($('pixelCodeOutput')) $('pixelCodeOutput').textContent = `<!-- Meta Pixel Code -->\n<script>\n  !function(f,b,e,v,n,t,s)\n  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?\n  n.callMethod.apply(n,arguments):n.queue.push(arguments)};\n  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';\n  n.queue=[];t=b.createElement(e);t.async=!0;\n  t.src=v;s=b.getElementsByTagName(e)[0];\n  s.parentNode.insertBefore(t,s)}(window, document,'script',\n  'https://connect.facebook.net/en_US/fbevents.js');\n  fbq('init', '${pid}');\n  fbq('track', 'PageView');\n  ${sn}\n</` + `script>`;
}
['generatePixelBtn','genPixelId','genPixelEvent','genPixelVal'].forEach(id => { if ($(id)) $(id)[id === 'generatePixelBtn' ? 'onclick' : 'oninput'] = generatePixelCode; });
if ($('genPixelEvent')) $('genPixelEvent').onchange = generatePixelCode;
if ($('simulateCapiBtn')) $('simulateCapiBtn').onclick = () => {
  const pid = $('genPixelId').value.trim() || '1234567890', event = $('genPixelEvent').value, val = num($('genPixelVal').value);
  $('pixelCodeOutput').textContent = `// Meta Conversions API (CAPI) JSON\n` + JSON.stringify({ data: [{ event_name: event, event_time: Math.floor(Date.now() / 1000), action_source: "website", user_data: { em: ["f660ab912ec121d1b1e928a0bb4bc61b15f5ad44d5efdc4e1c92a25e99b8e44a"], ph: ["254c3d6360b0e047d3e63a8412e62444655513c1f10bc7537e28b86e00b8e99a"] }, custom_data: { currency: "BDT", value: val } }], test_event_code: "TEST1234" }, null, 2);
};
if ($('copyPixelBtn')) $('copyPixelBtn').onclick = () => copyText($('pixelCodeOutput').textContent, 'পিক্সেল কোড');
if ($('adAccountForm')) $('adAccountForm').onsubmit = e => {
  e.preventDefault(); db.adAccounts.push({ id: uid(), updatedAt: Date.now(), name: $('aaName').value.trim(), adId: $('aaId').value.trim(), bm: $('aaBm').value.trim(), cardId: $('aaCard')?.value || '', threshold: num($('aaThreshold').value), unpaid: num($('aaUnpaid').value), status: $('aaStatus').value });
  save(); logActivity(`Ad Account: ${$('aaName').value.trim()}`); e.target.reset(); toast('Ad Account সেভ হয়েছে!');
};
window.openEditAdAccountModal = id => {
  if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const a = db.adAccounts.find(x => x.id === id); if (!a) return; refresh();
  $('eaaId').value = a.id; $('eaaName').value = a.name; $('eaaAdId').value = a.adId || ''; $('eaaBm').value = a.bm || '';
  if ($('eaaCard')) $('eaaCard').value = a.cardId || ''; $('eaaThreshold').value = num(a.threshold); $('eaaUnpaid').value = num(a.unpaid); $('eaaStatus').value = a.status || 'Active';
  $('editAdAccountModal').style.display = 'flex';
};
if ($('editAdAccountForm')) $('editAdAccountForm').onsubmit = e => {
  e.preventDefault(); const a = db.adAccounts.find(x => x.id === $('eaaId').value); if (!a) return;
  a.name = $('eaaName').value.trim(); a.adId = $('eaaAdId').value.trim(); a.bm = $('eaaBm').value.trim();
  if (!isStaff()) a.cardId = $('eaaCard')?.value || ''; a.threshold = num($('eaaThreshold').value); a.unpaid = num($('eaaUnpaid').value); a.status = $('eaaStatus').value;
  a.updatedAt = Date.now(); save(); closeModal('editAdAccountModal'); toast('আপডেট হয়েছে!');
};
window.cycleAdAccountStatus = id => { if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const a = db.adAccounts.find(x => x.id === id); if (!a) return; const ord = ['Active', 'Payment Hold', 'Restricted', 'Disabled']; a.status = ord[(ord.indexOf(a.status) + 1) % ord.length]; a.updatedAt = Date.now(); save(); toast(`স্ট্যাটাস: ${a.status}`); };
window.deleteAdAccount = id => { if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); const a = db.adAccounts.find(x => x.id === id); if (!a || !confirm('অ্যাড অ্যাকাউন্টটি মুছবেন?')) return; moveToTrash('adAccount', `Ad Account: ${a.name}`, a); markDeleted(id); db.adAccounts = db.adAccounts.filter(x => x.id !== id); save(); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn'); };
window.syncMetaAdAccounts = async btn => {
  const token = db.agency?.metaToken; if (!token) { goToSection('settings'); return toast('সেটিংসে Meta Access Token দিন!', 'warn'); }
  const targets = db.adAccounts.filter(a => a.adId?.startsWith('act_')); if (!targets.length) return toast('act_ যুক্ত Ad Account ID পাওয়া যায়নি!', 'warn');
  await withBtnLoading(btn, '⏳ সিঙ্ক হচ্ছে...', async () => {
    let updated = 0;
    for (const a of targets) {
      try {
        const res = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(a.adId)}?fields=account_status,balance&access_token=${encodeURIComponent(token)}`);
        if (!res.ok) continue; const d = await res.json();
        if (d.account_status !== undefined) a.status = { 1: 'Active', 2: 'Disabled', 3: 'Payment Hold', 7: 'Restricted', 9: 'Restricted' }[d.account_status] || a.status;
        if (d.balance !== undefined) a.unpaid = +(num(d.balance) / 100).toFixed(2);
        a.updatedAt = Date.now(); updated++;
      } catch (e) {}
    }
    if (updated) { save(); toast(`${updated}টি Ad Account আপডেট হয়েছে!`); } else toast('Meta API থেকে ডাটা পাওয়া যায়নি!', 'error');
  });
};

// Customers, Onboarding Checklist, CRM Pipeline & Pages
if ($('customerForm')) $('customerForm').onsubmit = e => {
  e.preventDefault(); const name = $('custName').value.trim();
  db.customers.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), portalToken: uid().slice(-6), name, phone: $('custPhone').value.trim(), stage: $('custStage')?.value || 'Active Client', followUpDate: $('custFollowUp')?.value || '', retainer: num($('custRetainer')?.value), dueLimit: num($('custDueLimit')?.value), checklist: DEFAULT_CHECKLIST(), note: $('custNote').value.trim() });
  save(); logActivity(`নতুন কাস্টমার: ${name}`); e.target.reset(); toast('কাস্টমার সেভ হয়েছে!');
};
window.openEditCustomerModal = custId => {
  if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const c = db.customers.find(x => x.id === custId); if (!c) return;
  const chk = { ...DEFAULT_CHECKLIST(), ...(c.checklist || {}) };
  $('editCustId').value = c.id; $('editCustName').value = c.name; $('editCustPhone').value = c.phone || '';
  if ($('editCustStage')) $('editCustStage').value = c.stage || 'Active Client';
  if ($('editCustFollowUp')) $('editCustFollowUp').value = c.followUpDate || '';
  if ($('editCustRetainer')) $('editCustRetainer').value = num(c.retainer);
  if ($('editCustDueLimit')) $('editCustDueLimit').value = num(c.dueLimit);
  $('editCustNote').value = c.note || '';
  if ($('ecChkPage')) $('ecChkPage').checked = Boolean(chk.pageAccess);
  if ($('ecChkBm')) $('ecChkBm').checked = Boolean(chk.bmLinked);
  if ($('ecChkPixel')) $('ecChkPixel').checked = Boolean(chk.pixelReady);
  if ($('ecChkCreative')) $('ecChkCreative').checked = Boolean(chk.creativeReady);
  if ($('ecChkAdvance')) $('ecChkAdvance').checked = Boolean(chk.advancePaid);
  $('editCustomerModal').style.display = 'flex';
};
if ($('editCustomerForm')) $('editCustomerForm').onsubmit = e => {
  e.preventDefault(); const c = db.customers.find(x => x.id === $('editCustId').value);
  if (c) {
    c.name = $('editCustName').value.trim(); c.phone = $('editCustPhone').value.trim();
    c.stage = $('editCustStage')?.value || 'Active Client'; c.followUpDate = $('editCustFollowUp')?.value || '';
    c.retainer = num($('editCustRetainer')?.value); c.dueLimit = num($('editCustDueLimit')?.value); c.note = $('editCustNote').value.trim();
    c.checklist = { pageAccess: Boolean($('ecChkPage')?.checked), bmLinked: Boolean($('ecChkBm')?.checked), pixelReady: Boolean($('ecChkPixel')?.checked), creativeReady: Boolean($('ecChkCreative')?.checked), advancePaid: Boolean($('ecChkAdvance')?.checked) };
    c.updatedAt = Date.now(); save(); closeModal('editCustomerModal'); toast('কাস্টমার আপডেট হয়েছে!');
  }
};
window.toggleCustChecklist = (custId, key) => {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  c.checklist = { ...DEFAULT_CHECKLIST(), ...(c.checklist || {}) }; c.checklist[key] = !c.checklist[key]; c.updatedAt = Date.now();
  save(); openClientProfile(custId);
};
window.clearFollowUp = custId => {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  c.followUpDate = ''; c.updatedAt = Date.now(); save(); toast('ফলোআপ সম্পন্ন হিসেবে চিহ্নিত হয়েছে!');
};
window.generateRetainerBills = () => {
  if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error');
  const ym = today().slice(0, 7), eligible = db.customers.filter(c => num(c.retainer) > 0 && !db.works.some(w => w.customerId === c.id && w.retainerYm === ym));
  if (!eligible.length) return toast(`চলতি মাসের (${ym}) রিটেইনার বিল ইতিমধ্যেই তৈরি হয়েছে বা রিটেইনার নেই!`, 'warn');
  if (!confirm(`${eligible.length} জন কাস্টমারের জন্য ${ym} মাসের রিটেইনার বিল তৈরি করবেন?`)) return;
  eligible.forEach(c => db.works.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), date: today(), customerId: c.id, pageId: db.pages.find(p => p.customerId === c.id)?.id || '', name: `Monthly Retainer (${ym})`, retainerYm: ym, days: 30, dollar: 0, rate: 1, actualDollar: 0, serviceFee: num(c.retainer), serviceFeeType: 'fixed', cardId: '', actualRate: 0, feePct: 0, other: 0, status: 'completed', note: 'Auto Monthly Retainer' }));
  save(); logActivity(`রিটেইনার বিল (${eligible.length} জন)`); toast(`${eligible.length}টি রিটেইনার বিল তৈরি হয়েছে!`);
};
window.deleteCustomer = custId => {
  if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error');
  const c = db.customers.find(x => x.id === custId); if (!c || !requireMasterPin(`কাস্টমার "${c.name}" ডিলিট`) || !confirm(`"${c.name}" ও এর সকল পেজ/কাজ/পেমেন্ট রিসাইকেল বিনে পাঠাবেন?`)) return;
  const relP = db.pages.filter(x => x.customerId === custId), relW = db.works.filter(x => x.customerId === custId), relPay = db.payments.filter(x => x.customerId === custId);
  moveToTrash('customer_bundle', `কাস্টমার: ${c.name}`, { customer: c, pages: relP, works: relW, payments: relPay });
  markDeleted(custId); relP.forEach(p => markDeleted(p.id)); relW.forEach(w => markDeleted(w.id)); relPay.forEach(p => markDeleted(p.id));
  db.customers = db.customers.filter(x => x.id !== custId); db.pages = db.pages.filter(x => x.customerId !== custId); db.works = db.works.filter(x => x.customerId !== custId); db.payments = db.payments.filter(x => x.customerId !== custId);
  delete db.reminderLogs[custId]; save(); logActivity(`কাস্টমার ট্র্যাশে: ${c.name}`); toast('রিসাইকেল বিনে পাঠানো হয়েছে', 'warn');
};
if ($('pageForm')) $('pageForm').onsubmit = e => { e.preventDefault(); const n = $('pageName').value.trim(); db.pages.push({ id: uid(), updatedAt: Date.now(), customerId: $('pageCustomer').value, name: n, link: $('pageLink').value.trim(), adId: $('pageAdId').value.trim(), pixelId: $('pagePixelId').value.trim() }); save(); e.target.reset(); toast('পেজ সেভ হয়েছে!'); };
window.openEditPageModal = pageId => { if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const p = db.pages.find(x => x.id === pageId); if (!p) return; $('editPageId').value = p.id; $('editPageName').value = p.name; $('editPageLink').value = p.link || ''; $('editPageAdId').value = p.adId || ''; $('editPagePixelId').value = p.pixelId || ''; $('editPageModal').style.display = 'flex'; };
if ($('editPageForm')) $('editPageForm').onsubmit = e => { e.preventDefault(); const p = db.pages.find(x => x.id === $('editPageId').value); if (p) { p.name = $('editPageName').value.trim(); p.link = $('editPageLink').value.trim(); p.adId = $('editPageAdId').value.trim(); p.pixelId = $('editPagePixelId').value.trim(); p.updatedAt = Date.now(); save(); closeModal('editPageModal'); toast('পেজ আপডেট হয়েছে!'); } };
window.deletePage = pageId => { if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); const p = db.pages.find(x => x.id === pageId); if (!p || !confirm('পেজটি রিসাইকেল বিনে পাঠাবেন?')) return; moveToTrash('page', `পেজ: ${p.name}`, p); markDeleted(pageId); db.pages = db.pages.filter(x => x.id !== pageId); save(); toast('রিসাইকেল বিনে পাঠানো হয়েছে', 'warn'); };

// Client Profile, Portal Link & CSV
window.copyClientSummaryText = custId => {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const b = billed(custId), p = paid(custId), bal = p - b, works = db.works.filter(w => w.customerId === custId), tu = works.reduce((s, w) => s + num(w.actualDollar), 0);
  const bl = bal < 0 ? `🔴 বকেয়া বাকি: ${money(-bal)}` : (bal > 0 ? `🟢 অ্যাডভান্স জমা: ${money(bal)}` : `✅ ব্যালেন্স: ৳0.00`);
  const rec = [...works].sort(byDateDesc).slice(0, 5).map(w => `• ${w.date}: ${w.name} (${usd(w.actualDollar)}) = ${money(bill(w))}`).join('\n');
  copyText(`📊 *হিসাবের সারাংশ — ${c.name}*\nএজেন্সি: ${db.agency?.name || 'Ads হিসাব ম্যানেজার'}\n\nমোট ডলার: ${usd(tu)}\nমোট বিল: ${money(b)}\nমোট জমা: ${money(p)}\n${bl}\n\nসাম্প্রতিক কাজ:\n${rec || '—'}\n\n${db.agency?.payInfo ? '💳 পেমেন্ট: ' + db.agency.payInfo : ''}`, 'রিপোর্ট টেক্সট');
};
window.shareClientPortalLink = async (custId, btn) => {
  const c = db.customers.find(x => x.id === custId); if (!c) return; const cfg = readCloudSync();
  if (!cfg.url) return toast('Admin Panel-এ Firebase URL সেভ করুন!', 'warn');
  if (!c.portalToken) { c.portalToken = uid().slice(-6); c.updatedAt = Date.now(); save(); }
  await withBtnLoading(btn, '⏳ তৈরি হচ্ছে...', async () => {
    const pk = `${c.id}_${c.portalToken}`, ag = db.agency || {};
    const payload = {
      updatedAt: new Date().toLocaleString('bn-BD'), customerId: c.id, agencyName: ag.name || 'Ads হিসাব ম্যানেজার', agencyContact: agencyContactLine(ag),
      payInfo: ag.payInfo || '', customerName: c.name, customerPhone: c.phone || '', totalBill: billed(custId), totalPaid: paid(custId), balance: clientBalance(custId),
      works: db.works.filter(w => w.customerId === custId).sort(byDateDesc).map(w => ({ date: w.date, name: w.name, page: pname(w.pageId), objective: w.objective || '', budget: num(w.dollar), spentUsd: num(w.actualDollar), bill: bill(w), reach: num(w.reach), clicks: num(w.clicks), results: num(w.conversions), status: w.status })),
      payments: db.payments.filter(p => p.customerId === custId && p.approvalStatus !== 'pending').sort(byDateDesc).map(p => ({ date: p.date, amount: num(p.amount), method: p.method, ref: p.ref || '' }))
    };
    const ep = `${cfg.url.trim().replace(/\/+$/, '')}/ads_hisab_portals/${pk}.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '');
    try { const res = await fetch(ep, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!res.ok) throw new Error('HTTP ' + res.status); copyText(`${location.origin}${location.pathname}?portal=${encodeURIComponent(pk)}`, 'ক্লায়েন্ট পোর্টাল লিংক'); }
    catch (err) { toast('পোর্টাল লিংক আপলোডে সমস্যা!', 'error'); }
  });
};
window.exportClientLedgerCsv = custId => {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const entries = [...db.works.filter(w => w.customerId === custId).map(w => ({ date: w.date, desc: `কাজ: ${w.name}`, debit: bill(w), credit: 0 })), ...db.payments.filter(p => p.customerId === custId && p.approvalStatus !== 'pending').map(p => ({ date: p.date, desc: `পেমেন্ট (${p.method})`, debit: 0, credit: num(p.amount) }))].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let bal = 0; const rows = [['Date', 'Description', 'Bill', 'Paid', 'Balance']];
  entries.forEach(en => { bal += en.credit - en.debit; rows.push([en.date, en.desc, en.debit.toFixed(2), en.credit.toFixed(2), bal.toFixed(2)]); });
  downloadBlob('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), `ledger_${c.name.replace(/\s+/g, '_')}_${today()}.csv`, 'text/csv;charset=utf-8;'); toast('লেজার CSV ডাউনলোড হয়েছে!');
};
window.openClientProfile = custId => {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const cP = db.pages.filter(p => p.customerId === custId), cW = db.works.filter(w => w.customerId === custId), cPay = db.payments.filter(p => p.customerId === custId && p.approvalStatus !== 'pending');
  const tB = billed(custId), tP = paid(custId), bal = clientBalance(custId), tU = cW.reduce((s, w) => s + num(w.actualDollar), 0), tPr = cW.reduce((s, w) => s + profit(w), 0);
  const balB = bal < 0 ? `<span class="badge-danger">বকেয়া: ${money(-bal)}</span>` : (bal > 0 ? `<span class="badge-success">অ্যাডভান্স: ${money(bal)}</span>` : `<span class="badge-success">সমন্বিত</span>`);
  const chk = { ...DEFAULT_CHECKLIST(), ...(c.checklist || {}) };
  const chkLabels = [['pageAccess','Page Access'],['bmLinked','BM/Ad Acc'],['pixelReady','Pixel Ready'],['creativeReady','Creative'],['advancePaid','Advance Paid']];
  const chkHtml = chkLabels.map(([k, lbl]) => `<span class="check-pill ${chk[k] ? 'done' : ''}" onclick="toggleCustChecklist('${c.id}','${k}')">${chk[k] ? '✓' : '○'} ${lbl}</span>`).join('');
  const ledger = [...cW.map(w => ({ date: w.date, desc: `ক্যাম্পেইন: ${w.name} (${usd(w.actualDollar)})`, debit: bill(w), credit: 0 })), ...cPay.map(p => ({ date: p.date, desc: `পেমেন্ট (${p.method})`, debit: 0, credit: num(p.amount) }))].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let runB = 0; const ledgerHtml = ledger.map(r => { runB += r.credit - r.debit; return `<tr><td>${esc(r.date)}</td><td>${esc(r.desc)}</td><td class="bad">${r.debit ? money(r.debit) : '—'}</td><td class="good">${r.credit ? money(r.credit) : '—'}</td><td>${runB < 0 ? `<span class="bad">বকেয়া ${money(-runB)}</span>` : (runB > 0 ? `<span class="good">অ্যাড ${money(runB)}</span>` : '৳0')}</td></tr>`; }).join('') || '<tr><td colspan="5">কোনো লেনদেন নেই</td></tr>';

  $('cpTitle').textContent = `👤 ${c.name} — প্রোফাইল ও অনবোর্ডিং`;
  $('cpBody').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding:12px;background:var(--soft);border-radius:12px;border:1px solid var(--line)">
      <div style="font-size:13px;line-height:1.7"><strong>মোবাইল:</strong> ${esc(c.phone || '—')} · <strong>স্টেজ:</strong> <span class="badge-admin">${esc(c.stage || 'Active Client')}</span>${c.followUpDate ? ` · <strong>ফলোআপ:</strong> ${esc(c.followUpDate)}` : ''}<br><strong>নোট:</strong> ${esc(c.note || '—')} · <strong>ডলার:</strong> ${usd(tU)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="secondary sm" onclick="closeModal('clientProfileModal');openInvoice('${c.id}')">📄 ইনভয়েস</button>
        <button type="button" class="secondary sm" onclick="openMsgTemplates('${c.id}')">💬 মেসেজ টেমপ্লেট</button>
        <button type="button" class="secondary sm" onclick="shareClientPortalLink('${c.id}', this)">🔗 পোর্টাল</button>
        <button type="button" class="secondary sm" onclick="copyClientSummaryText('${c.id}')">📋 সামারি</button>
        <button type="button" class="secondary sm" onclick="exportClientLedgerCsv('${c.id}')">📥 CSV</button>
        <button type="button" class="secondary sm perm-edit" onclick="closeModal('clientProfileModal');openEditCustomerModal('${c.id}')">✏️ এডিট</button>
      </div>
    </div>
    <div style="margin-bottom:12px"><small class="muted" style="font-weight:700">🚀 অনবোর্ডিং চেকলিস্ট (ক্লিক করে টিক দিন):</small><div class="check-grid">${chkHtml}</div></div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap"><span class="badge-admin">বিল: ${money(tB)}</span><span class="badge-success">আদায়: ${money(tP)}</span>${balB} ${isStaff() ? '' : `<span class="badge-status status-running">নিট প্রফিট: ${money(tPr)}</span>`}</div>
    <h4>📄 ফেসবুক পেজসমূহ (${cP.length})</h4><ul style="font-size:13px;padding-left:20px;margin-bottom:14px;line-height:1.8">${cP.map(p => `<li><strong>${esc(p.name)}</strong> ${p.link ? `(<a href="${esc(p.link)}" target="_blank">লিংক ↗</a>)` : ''} — Ad: <code>${esc(p.adId || 'N/A')}</code>, Pixel: <code>${esc(p.pixelId || 'N/A')}</code></li>`).join('') || '<li>কোনো পেজ নেই</li>'}</ul>
    <h4>📑 লেজার স্টেটমেন্ট</h4><div class="tablewrap" style="max-height:200px;margin-bottom:14px"><table><thead><tr><th>তারিখ</th><th>বিবরণ</th><th>ডেবিট</th><th>ক্রেডিট</th><th>ব্যালেন্স</th></tr></thead><tbody>${ledgerHtml}</tbody></table></div>
    <h4>⚡ ক্যাম্পেইনসমূহ (${cW.length})</h4><div class="tablewrap" style="max-height:150px"><table><thead><tr><th>তারিখ</th><th>কাজ</th><th>বাজেট / ব্যবহৃত $</th><th>বিল</th><th>অ্যাকশন</th></tr></thead><tbody>${cW.map(w => `<tr><td>${esc(w.date)}</td><td>${esc(w.name)}</td><td>${usd(w.dollar)} / <strong>${usd(w.actualDollar)}</strong></td><td>${money(bill(w))}</td><td><button type="button" class="secondary sm" onclick="closeModal('clientProfileModal');openWorkPerfReport('${w.id}')">📊 রিপোর্ট</button></td></tr>`).join('') || '<tr><td colspan="5">কোনো কাজ নেই</td></tr>'}</tbody></table></div>`;
  $('clientProfileModal').style.display = 'flex';
};

// Money Receipt & Invoice
let currentReceiptPayId = null, currentInvoiceCustId = null;
function loadImgCors(src) { return new Promise(resolve => { if (!src) return resolve(null); const img = new Image(); if (!src.startsWith('data:')) img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; }); }
function wrapTextLines(ctx, text, maxWidth) { const words = String(text || '').split(/\s+/), lines = []; let cur = ''; for (const w of words) { const test = cur ? cur + ' ' + w : w; if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = test; } if (cur) lines.push(cur); return lines.length ? lines : ['']; }

window.openPaymentReceipt = payId => {
  const p = db.payments.find(x => x.id === payId); if (!p) return; const c = db.customers.find(x => x.id === p.customerId) || { name: 'কাস্টমার', phone: '' }, ag = db.agency || {}, bal = clientBalance(p.customerId);
  currentReceiptPayId = payId;
  if ($('rcpLogoImg')) { $('rcpLogoImg').style.display = ag.logoUrl ? 'block' : 'none'; if (ag.logoUrl) $('rcpLogoImg').src = ag.logoUrl; }
  $('rcpAgencyName').textContent = ag.name || 'Ads হিসাব ম্যানেজার'; $('rcpAgencyContact').textContent = agencyContactLine(ag);
  $('rcpNo').textContent = '#RCP-' + payId.slice(-5).toUpperCase(); $('rcpDate').textContent = 'তারিখ: ' + (p.date || today());
  $('rcpCustName').textContent = c.name; $('rcpCustPhone').textContent = c.phone || '—'; $('rcpAmount').textContent = money(p.amount); $('rcpMethod').textContent = p.method || 'Cash';
  $('rcpRef').textContent = p.ref || '—'; $('rcpNote').textContent = p.note || '—'; $('rcpCustBill').textContent = money(billed(p.customerId)); $('rcpCustPaid').textContent = money(paid(p.customerId));
  $('rcpCustBal').innerHTML = bal < 0 ? `বকেয়া: <strong class="bad">${money(-bal)}</strong>` : (bal > 0 ? `অ্যাডভান্স: <strong class="good">${money(bal)}</strong>` : `ব্যালেন্স: <strong class="good">৳0.00</strong>`);
  if ($('rcpSignWrap') && $('rcpSignText')) { $('rcpSignWrap').style.display = ag.signText ? 'flex' : 'none'; $('rcpSignText').textContent = ag.signText || 'Authorized'; }
  $('receiptModal').style.display = 'flex';
};
window.printReceipt = (isPos = false) => { document.body.classList.add('printing-receipt'); if (isPos) document.body.classList.add('printing-pos'); window.print(); setTimeout(() => document.body.classList.remove('printing-receipt', 'printing-pos'), 400); };
window.sendReceiptWhatsApp = () => {
  const p = db.payments.find(x => x.id === currentReceiptPayId); if (!p) return; const c = db.customers.find(x => x.id === p.customerId), wa = normalizeBdPhone(c?.phone); if (!wa) return toast('মোবাইল নম্বর নেই!', 'error');
  const bal = clientBalance(p.customerId), bt = bal < 0 ? `বর্তমান বকেয়া: ${money(-bal)}` : (bal > 0 ? `অ্যাডভান্স জমা: ${money(bal)}` : `হিসাব সমন্বিত`);
  window.open(`https://wa.me/${wa}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${c.name}, ${db.agency?.name || 'Ads হিসাব ম্যানেজার'} থেকে জানাচ্ছি—${p.date}-এ আপনার ${money(p.amount)} (${p.method}) পেমেন্ট গৃহীত হয়েছে। ${bt}। ধন্যবাদ!`)}`, '_blank');
};
window.downloadReceiptPng = async () => {
  const p = db.payments.find(x => x.id === currentReceiptPayId); if (!p) return;
  const c = db.customers.find(x => x.id === p.customerId) || { name: 'কাস্টমার', phone: '' }, ag = db.agency || {}, logoImg = await loadImgCors(ag.logoUrl), bal = clientBalance(p.customerId);
  const W = 560, H = 380, canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#059669'; ctx.fillRect(0, 0, W, 10);
  let tx = 30; if (logoImg) { try { ctx.drawImage(logoImg, 30, 22, 42, 42); tx = 82; } catch (e) {} }
  ctx.fillStyle = '#059669'; ctx.font = 'bold 20px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(ag.name || 'Ads হিসাব ম্যানেজার', tx, 44);
  ctx.fillStyle = '#64748b'; ctx.font = '11.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(agencyContactLine(ag).slice(0, 62), tx, 64);
  ctx.textAlign = 'right'; ctx.fillStyle = '#0f172a'; ctx.font = 'bold 13px Arial, sans-serif'; ctx.fillText(`#RCP-${p.id.slice(-5).toUpperCase()}`, W - 30, 42);
  ctx.fillStyle = '#64748b'; ctx.font = '12px Arial, sans-serif'; ctx.fillText(`তারিখ: ${p.date}`, W - 30, 62);
  ctx.textAlign = 'left'; ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(30, 82); ctx.lineTo(W - 30, 82); ctx.stroke();
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 15px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`কাস্টমার: ${c.name}`, 30, 114);
  ctx.fillStyle = '#475569'; ctx.font = '13px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`মোবাইল: ${c.phone || '—'}`, 30, 136);
  ctx.fillStyle = '#ecfdf5'; ctx.fillRect(30, 154, W - 60, 54); ctx.fillStyle = '#065f46'; ctx.font = 'bold 18px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`গ্রহণকৃত টাকা: ${money(p.amount)}`, 46, 187);
  ctx.fillStyle = '#1e293b'; ctx.font = '13px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`মাধ্যম: ${p.method || 'Cash'}   |   রেফারেন্স: ${p.ref || '—'}`, 30, 234);
  if (p.note) ctx.fillText(`নোট: ${String(p.note).slice(0, 56)}`, 30, 256);
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(30, 276, W - 60, 44); ctx.strokeStyle = '#cbd5e1'; ctx.strokeRect(30, 276, W - 60, 44);
  ctx.font = 'bold 13px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillStyle = '#0f172a'; ctx.fillText(`মোট বিল: ${money(billed(p.customerId))}`, 42, 303);
  ctx.textAlign = 'right'; ctx.fillStyle = bal < 0 ? '#dc2626' : '#059669'; ctx.fillText(bal < 0 ? `বকেয়া: ${money(-bal)}` : (bal > 0 ? `অ্যাডভান্স: ${money(bal)}` : `ব্যালেন্স: ৳0.00`), W - 42, 303);
  ctx.textAlign = 'center'; ctx.fillStyle = '#64748b'; ctx.font = '11.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText('পেমেন্ট করার জন্য ধন্যবাদ!', W / 2, H - 18);
  canvas.toBlob(blob => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `receipt_${c.name.replace(/\s+/g, '_')}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('রিসিপ্ট PNG ডাউনলোড হয়েছে!'); }, 'image/png');
};

function getInvoiceFilteredData(custId) {
  const from = $('invFrom')?.value || '', to = $('invTo')?.value || '';
  const allW = db.works.filter(w => w.customerId === custId), allP = db.payments.filter(p => p.customerId === custId && p.approvalStatus !== 'pending');
  const prevB = from ? allW.filter(w => String(w.date || '') < from).reduce((s, w) => s + bill(w), 0) : 0;
  const prevP = from ? allP.filter(p => String(p.date || '') < from).reduce((s, p) => s + num(p.amount), 0) : 0;
  const openingBal = prevP - prevB, custWorks = allW.filter(w => inDateRange(w.date, from, to)), custPays = allP.filter(p => inDateRange(p.date, from, to)).sort(byDateDesc);
  const b = custWorks.reduce((s, w) => s + bill(w), 0), p = custPays.reduce((s, pay) => s + num(pay.amount), 0);
  return { from, to, openingBal, custWorks, custPays, b, p, bal: openingBal + p - b };
}
window.openInvoice = (custId, keepDates = false) => {
  const customer = db.customers.find(c => c.id === custId); if (!customer) return;
  currentInvoiceCustId = custId; if (!keepDates) { if ($('invFrom')) $('invFrom').value = ''; if ($('invTo')) $('invTo').value = ''; }
  const ag = db.agency || {};
  if ($('invLogoImg')) { $('invLogoImg').style.display = ag.logoUrl ? 'block' : 'none'; if (ag.logoUrl) $('invLogoImg').src = ag.logoUrl; }
  if ($('invQrImg')) { $('invQrImg').style.display = ag.qrUrl ? 'block' : 'none'; if (ag.qrUrl) $('invQrImg').src = ag.qrUrl; }
  $('invAgencyName').textContent = ag.name || 'Ads হিসাব ম্যানেজার'; $('invAgencyContact').textContent = agencyContactLine(ag);
  $('invDate').textContent = 'তারিখ: ' + today(); $('invId').textContent = 'ইনভয়েস নং: #INV-' + custId.slice(-5).toUpperCase();
  $('invCustName').textContent = customer.name; $('invCustPhone').textContent = 'ফোন: ' + (customer.phone || '—');
  const { from, to, openingBal, custWorks, custPays, b, p, bal } = getInvoiceFilteredData(custId);
  if ($('invPeriodLabel')) $('invPeriodLabel').textContent = (from || to) ? `সময়কাল: ${from || 'শুরু'} থেকে ${to || 'আজ'}` : '';
  if ($('invOpeningRow')) { if (from && openingBal !== 0) { $('invOpeningRow').style.display = 'block'; $('invOpeningRow').innerHTML = openingBal < 0 ? `📌 <strong>পূর্বের বকেয়া জের (${esc(from)}-এর আগে):</strong> <span class="bad">${money(-openingBal)}</span>` : `📌 <strong>পূর্বের অ্যাডভান্স (${esc(from)}-এর আগে):</strong> <span class="good">${money(openingBal)}</span>`; } else $('invOpeningRow').style.display = 'none'; }
  const stamp = $('invStatusStamp');
  stamp.textContent = bal > 0 ? 'ADVANCE PAID' : ((b > 0 || openingBal < 0) && bal === 0 ? 'PAID' : (p > 0 && bal < 0 ? 'PARTIAL' : 'DUE'));
  stamp.className = bal >= 0 && (b > 0 || openingBal < 0) ? 'badge-success' : (p > 0 && bal < 0 ? 'badge-status status-running' : 'badge-danger');
  $('invRows').innerHTML = custWorks.map(w => { const svc = workServiceCharge(w); return `<tr><td>${esc(w.date)}</td><td>${esc(w.name)} (${esc(pname(w.pageId) || 'Page')})</td><td>${usd(w.actualDollar)} × ${money(w.rate)}${svc ? ` + চার্জ ${money(svc)}` : ''}</td><td>${money(bill(w))}</td></tr>`; }).join('') || `<tr><td colspan="4">কোনো কাজের রেকর্ড নেই</td></tr>`;
  $('invTotalBill').textContent = money(b); $('invTotalPaid').textContent = money(p);
  if ($('invPayWrap') && $('invPayRows')) { $('invPayWrap').style.display = custPays.length ? 'block' : 'none'; $('invPayRows').innerHTML = custPays.slice(0, 12).map(pay => `<tr><td>${esc(pay.date)}</td><td>${esc(pay.method)}</td><td>${esc(pay.ref || pay.note || '—')}</td><td class="good">${money(pay.amount)}</td></tr>`).join(''); }
  $('invBalanceBox').innerHTML = bal > 0 ? `সর্বমোট অ্যাডভান্স: <strong style="color:#059669">${money(bal)}</strong>` : `সর্বমোট বকেয়া: <strong id="invTotalDue" style="color:#dc2626">${money(Math.max(0, -bal))}</strong>`;
  if ($('invPayInfoBox')) { $('invPayInfoBox').style.display = ag.payInfo ? 'block' : 'none'; if (ag.payInfo) $('invPayInfoBox').innerHTML = `<strong>💳 পেমেন্ট:</strong> ${esc(ag.payInfo)}`; }
  if ($('invTermsBox')) { $('invTermsBox').style.display = ag.termsText ? 'block' : 'none'; if (ag.termsText) $('invTermsBox').innerHTML = `<strong>📝 শর্তাবলি:</strong> ${esc(ag.termsText)}`; }
  if ($('invSignWrap') && $('invSignText')) { $('invSignWrap').style.display = ag.signText ? 'flex' : 'none'; $('invSignText').textContent = ag.signText || 'Authorized'; }
  $('invoiceModal').style.display = 'flex';
};
if ($('invApplyBtn')) $('invApplyBtn').onclick = () => { if (currentInvoiceCustId) openInvoice(currentInvoiceCustId, true); };
if ($('invResetBtn')) $('invResetBtn').onclick = () => { if (currentInvoiceCustId) openInvoice(currentInvoiceCustId, false); };
window.printInvoice = (isPos = false) => { document.body.classList.add('printing-invoice'); if (isPos) document.body.classList.add('printing-pos'); window.print(); setTimeout(() => document.body.classList.remove('printing-invoice', 'printing-pos'), 400); };

window.downloadInvoicePng = async () => {
  const customer = db.customers.find(c => c.id === currentInvoiceCustId); if (!customer) return;
  const { from, to, openingBal, custWorks, custPays, b, p, bal } = getInvoiceFilteredData(customer.id);
  const ag = db.agency || {}, shownPays = custPays.slice(0, 6), [logoImg, qrImg] = await Promise.all([loadImgCors(ag.logoUrl), loadImgCors(ag.qrUrl)]);
  const W = 820, mC = document.createElement('canvas').getContext('2d'); mC.font = '13px Inter, "Noto Sans Bengali", Arial, sans-serif';
  const contactLines = wrapTextLines(mC, agencyContactLine(ag), 420), workWrapped = custWorks.map(w => ({ w, lines: wrapTextLines(mC, w.name || '', 280) }));
  const worksTotalH = custWorks.length ? workWrapped.reduce((s, x) => s + Math.max(32, 14 + x.lines.length * 18), 0) : 32;
  const payInfoLines = ag.payInfo ? wrapTextLines(mC, ag.payInfo, qrImg ? W - 210 : W - 110) : [], termsLines = ag.termsText ? wrapTextLines(mC, 'শর্তাবলি: ' + ag.termsText, W - 100) : [];
  const headExtra = Math.max(0, (contactLines.length - 1) * 16), openH = (from && openingBal !== 0) ? 34 : 0, paySectionH = shownPays.length ? (56 + shownPays.length * 28) : 0;
  const payInfoH = (payInfoLines.length || qrImg) ? Math.max(82, 42 + payInfoLines.length * 18) : 0, termsH = termsLines.length ? (18 + termsLines.length * 16) : 0, signH = ag.signText ? 36 : 0;
  const H = 370 + headExtra + openH + worksTotalH + paySectionH + payInfoH + termsH + signH;

  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#2563eb'; ctx.fillRect(0, 0, W, 10);
  let titleX = 40; if (logoImg) { try { ctx.drawImage(logoImg, 40, 24, 46, 46); titleX = 96; } catch (e) {} }
  ctx.fillStyle = '#2563eb'; ctx.font = 'bold 24px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(ag.name || 'Ads হিসাব ম্যানেজার', titleX, 48);
  ctx.fillStyle = '#64748b'; ctx.font = '12.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; contactLines.forEach((ln, i) => ctx.fillText(ln, titleX, 70 + i * 16));
  ctx.textAlign = 'right'; ctx.fillStyle = '#0f172a'; ctx.font = 'bold 15px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`তারিখ: ${today()}`, W - 40, 48);
  ctx.fillStyle = '#64748b'; ctx.font = '13px Inter, Arial, sans-serif'; ctx.fillText(`ইনভয়েস: #INV-${customer.id.slice(-5).toUpperCase()}`, W - 40, 70);
  const stTxt = bal > 0 ? 'ADVANCE' : ((b > 0 || openingBal < 0) && bal === 0 ? 'PAID' : (p > 0 ? 'PARTIAL' : 'DUE'));
  ctx.fillStyle = bal >= 0 && (b > 0 || p > 0) ? '#059669' : '#dc2626'; ctx.font = 'bold 14px Arial, sans-serif'; ctx.fillText(`[ ${stTxt} ]`, W - 40, 92);
  let y = 108 + headExtra; ctx.textAlign = 'left'; ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 40, y); ctx.stroke();
  ctx.fillStyle = '#475569'; ctx.font = 'bold 13px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText('কাস্টমার বিবরণ:', 40, y + 26);
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 18px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(customer.name, 40, y + 51);
  ctx.fillStyle = '#475569'; ctx.font = '13px Inter, Arial, sans-serif'; ctx.fillText(`ফোন: ${customer.phone || '—'}`, 40, y + 72);
  if (from || to) { ctx.textAlign = 'right'; ctx.fillStyle = '#64748b'; ctx.fillText(`সময়কাল: ${from || 'শুরু'} - ${to || 'আজ'}`, W - 40, y + 72); ctx.textAlign = 'left'; }
  y += 92;
  if (openH) { ctx.fillStyle = '#f8fafc'; ctx.fillRect(40, y, W - 80, 28); ctx.fillStyle = openingBal < 0 ? '#dc2626' : '#059669'; ctx.font = 'bold 13px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(openingBal < 0 ? `পূর্বের বকেয়া জের (${from}-এর আগে): ${money(-openingBal)}` : `পূর্বের অ্যাডভান্স (${from}-এর আগে): ${money(openingBal)}`, 52, y + 19); y += 34; }
  ctx.fillStyle = '#f1f5f9'; ctx.fillRect(40, y, W - 80, 32); ctx.fillStyle = '#334155'; ctx.font = 'bold 13px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText('তারিখ', 52, y + 21); ctx.fillText('কাজের বিবরণ', 155, y + 21); ctx.fillText('ডলার × রেট', 455, y + 21); ctx.textAlign = 'right'; ctx.fillText('বিল (৳)', W - 52, y + 21); ctx.textAlign = 'left'; y += 32;
  if (!custWorks.length) { ctx.fillStyle = '#64748b'; ctx.font = '13px Inter, Arial, sans-serif'; ctx.fillText('কোনো কাজের রেকর্ড নেই', 52, y + 21); y += 32; }
  else workWrapped.forEach(({ w, lines }, idx) => { const rh = Math.max(32, 14 + lines.length * 18); if (idx % 2 === 1) { ctx.fillStyle = '#f8fafc'; ctx.fillRect(40, y, W - 80, rh); } ctx.fillStyle = '#1e293b'; ctx.font = '13px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(w.date || '', 52, y + 21); lines.forEach((ln, li) => ctx.fillText(ln, 155, y + 21 + li * 18)); const svc = workServiceCharge(w); ctx.fillText(`${usd(w.actualDollar)} × ${num(w.rate)}${svc ? ` + ${money(svc)}` : ''}`, 455, y + 21); ctx.textAlign = 'right'; ctx.fillText(money(bill(w)), W - 52, y + 21); ctx.textAlign = 'left'; y += rh; });
  if (shownPays.length) { y += 14; ctx.fillStyle = '#334155'; ctx.font = 'bold 13px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText('আদায়কৃত পেমেন্ট বিবরণ:', 40, y + 12); y += 22; ctx.fillStyle = '#ecfdf5'; ctx.fillRect(40, y, W - 80, 26); ctx.fillStyle = '#065f46'; ctx.font = 'bold 12px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText('তারিখ', 52, y + 17); ctx.fillText('মাধ্যম', 175, y + 17); ctx.fillText('রেফারেন্স', 310, y + 17); ctx.textAlign = 'right'; ctx.fillText('জমা (৳)', W - 52, y + 17); ctx.textAlign = 'left'; y += 26; shownPays.forEach(pay => { ctx.fillStyle = '#1e293b'; ctx.font = '12.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(pay.date || '', 52, y + 19); ctx.fillText(pay.method || '', 175, y + 19); ctx.fillText(String(pay.ref || pay.note || '—').slice(0, 28), 310, y + 19); ctx.textAlign = 'right'; ctx.fillStyle = '#059669'; ctx.fillText(money(pay.amount), W - 52, y + 19); ctx.textAlign = 'left'; y += 28; }); }
  y += 16; ctx.fillStyle = '#f8fafc'; ctx.fillRect(40, y, W - 80, 50); ctx.strokeStyle = '#cbd5e1'; ctx.strokeRect(40, y, W - 80, 50);
  ctx.font = 'bold 14px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillStyle = '#0f172a'; ctx.fillText(`নির্বাচিত বিল: ${money(b)}`, 56, y + 30); ctx.fillStyle = '#059669'; ctx.fillText(`নির্বাচিত আদায়: ${money(p)}`, 315, y + 30); ctx.textAlign = 'right';
  ctx.fillStyle = bal > 0 ? '#059669' : '#dc2626'; ctx.fillText(bal > 0 ? `মোট অ্যাডভান্স: ${money(bal)}` : `সর্বমোট বকেয়া: ${money(Math.max(0, -bal))}`, W - 56, y + 30); y += 50;
  if (payInfoLines.length || qrImg) { y += 12; if (payInfoLines.length) { const boxH = Math.max(54, 34 + payInfoLines.length * 18); ctx.fillStyle = '#eff6ff'; ctx.fillRect(40, y, qrImg ? W - 170 : W - 80, boxH); ctx.textAlign = 'left'; ctx.fillStyle = '#1e3a8a'; ctx.font = 'bold 12.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText('পেমেন্ট মাধ্যম:', 52, y + 20); ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif'; payInfoLines.forEach((ln, li) => ctx.fillText(ln, 52, y + 38 + li * 18)); } if (qrImg) { try { ctx.drawImage(qrImg, W - 116, y - 2, 74, 74); } catch (e) {} } y += payInfoH; }
  if (termsLines.length) { ctx.textAlign = 'left'; ctx.fillStyle = '#475569'; ctx.font = '11.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; termsLines.forEach((ln, li) => ctx.fillText(ln, 44, y + 14 + li * 16)); }
  if (ag.signText) { ctx.textAlign = 'right'; ctx.fillStyle = '#334155'; ctx.font = 'bold 12px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`স্বাক্ষর: ${ag.signText}`, W - 44, H - 38); }
  ctx.textAlign = 'center'; ctx.fillStyle = '#64748b'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText('ধন্যবাদ! আপনার ব্যবসার সফলতা কামনা করছি।', W / 2, H - 14);
  canvas.toBlob(blob => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `invoice_${customer.name.replace(/\s+/g, '_')}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('ইনভয়েস PNG ডাউনলোড হয়েছে!'); }, 'image/png');
};

// Cards, Deposits, Transfers, Refunds & Trading
if ($('addCardForm')) $('addCardForm').onsubmit = e => { e.preventDefault(); const n = $('newCardInput').value.trim(); if (!n) return; db.cards.push({ id: uid(), updatedAt: Date.now(), name: n }); save(); $('newCardInput').value = ''; toast('নতুন কার্ড যুক্ত হয়েছে!'); };
if ($('depositForm')) $('depositForm').onsubmit = e => { e.preventDefault(); if (!$('depositCard').value) return toast('কার্ড যোগ করুন!', 'error'); db.cardDeposits.push({ id: uid(), updatedAt: Date.now(), cardId: $('depositCard').value, date: $('depositDate').value, amount: num($('depositAmount').value), taka: num($('depositTaka').value), method: $('depositMethod')?.value || 'Bank', note: $('depositNote').value.trim() }); save(); e.target.reset(); $('depositDate').value = today(); if ($('depositMethod') && db.wallets.includes('Bank')) $('depositMethod').value = 'Bank'; toast('ডিপোজিট সেভ হয়েছে!'); };
if ($('cardTransferForm')) $('cardTransferForm').onsubmit = e => { e.preventDefault(); const fId = $('trFromCard').value, tId = $('trToCard').value, amt = num($('trAmount').value); if (!fId || !tId || fId === tId) return toast('দুটি ভিন্ন কার্ড দিন!', 'error'); const st = getCardStats(fId); if (st.balance < amt && !confirm(`ব্যালেন্স আছে ${usd(st.balance)}। ট্রান্সফার করবেন?`)) return; db.cardTransfers.push({ id: uid(), updatedAt: Date.now(), fromCardId: fId, toCardId: tId, date: $('trDate').value, amount: amt, takaValue: +(amt * (st.avgRate || num(db.agency?.defaultRate) || 120)).toFixed(2), note: $('trNote').value.trim() }); save(); e.target.reset(); $('trDate').value = today(); toast('ট্রান্সফার সম্পন্ন!'); };
if ($('cardRefundForm')) $('cardRefundForm').onsubmit = e => { e.preventDefault(); const cid = $('rfCard').value, amt = num($('rfAmount').value); if (!cid || amt <= 0) return toast('সঠিক তথ্য দিন!', 'error'); db.cardRefunds.push({ id: uid(), updatedAt: Date.now(), cardId: cid, date: $('rfDate').value, amount: amt, note: $('rfNote').value.trim() }); save(); e.target.reset(); $('rfDate').value = today(); toast('রিফান্ড যোগ হয়েছে!'); };
window.editCardName = cid => { const c = db.cards.find(x => x.id === cid); if (!c) return; const n = prompt('নতুন নাম:', c.name); if (n && n.trim()) { c.name = n.trim(); c.updatedAt = Date.now(); save(); toast('আপডেট হয়েছে!'); } };
window.deleteCard = cid => { if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); const c = db.cards.find(x => x.id === cid); if (!c) return; const bal = getCardStats(cid).balance; if (!confirm(Math.abs(bal) > 0.01 ? `"${c.name}" কার্ডে ${usd(bal)} ব্যালেন্স আছে! ট্র্যাশে পাঠাবেন?` : `"${c.name}" ট্র্যাশে পাঠাবেন?`)) return; moveToTrash('card', `কার্ড: ${c.name}`, c); markDeleted(cid); db.cards = db.cards.filter(x => x.id !== cid); save(); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn'); };
window.deleteDeposit = id => { if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); const d = db.cardDeposits.find(x => x.id === id); if (!d || !confirm('মুছবেন?')) return; moveToTrash('deposit', `ডিপোজিট: $${d.amount}`, d); markDeleted(id); db.cardDeposits = db.cardDeposits.filter(x => x.id !== id); save(); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn'); };
window.deleteTransfer = id => { if (!hasPerm('canDelete') || !confirm('মুছবেন?')) return; markDeleted(id); db.cardTransfers = db.cardTransfers.filter(x => x.id !== id); save(); toast('মুছে ফেলা হয়েছে', 'warn'); };
window.deleteRefund = id => { if (!hasPerm('canDelete') || !confirm('মুছবেন?')) return; markDeleted(id); db.cardRefunds = db.cardRefunds.filter(x => x.id !== id); save(); toast('মুছে ফেলা হয়েছে', 'warn'); };
window.openCardStatement = cardId => {
  const c = db.cards.find(x => x.id === cardId); if (!c) return; const cnameCard = id => db.cards.find(x => x.id === id)?.name || 'Card';
  const all = [...db.cardDeposits.filter(d => d.cardId === cardId).map(d => ({ date: d.date, type: 'ডিপোজিট', desc: `${money(d.taka)} (${d.method || 'Bank'})`, plus: num(d.amount), minus: 0 })), ...db.cardTransfers.filter(t => t.toCardId === cardId).map(t => ({ date: t.date, type: 'ট্রান্সফার (+)', desc: cnameCard(t.fromCardId), plus: num(t.amount), minus: 0 })), ...db.cardRefunds.filter(r => r.cardId === cardId).map(r => ({ date: r.date, type: 'রিফান্ড', desc: r.note || 'Refund', plus: num(r.amount), minus: 0 })), ...db.trades.filter(t => t.cardId === cardId && t.type === 'buy').map(t => ({ date: t.date, type: 'ট্রেড (+)', desc: t.party, plus: num(t.usd), minus: 0 })), ...db.cardTransfers.filter(t => t.fromCardId === cardId).map(t => ({ date: t.date, type: 'ট্রান্সফার (-)', desc: cnameCard(t.toCardId), plus: 0, minus: num(t.amount) })), ...db.trades.filter(t => t.cardId === cardId && t.type === 'sell').map(t => ({ date: t.date, type: 'ট্রেড (-)', desc: t.party, plus: 0, minus: num(t.usd) })), ...db.works.filter(w => w.cardId === cardId).map(w => ({ date: w.date, type: 'FB খরচ', desc: `${cname(w.customerId)} — ${w.name}`, plus: 0, minus: num(w.actualDollar) }))].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let bal = 0; const st = getCardStats(cardId);
  $('csTitle').textContent = `💳 ${c.name} — কার্ড স্টেটমেন্ট`; $('csSummary').innerHTML = `<span class="badge-success">জমা: ${usd(st.inUsd)}</span><span class="badge-danger">খরচ: ${usd(st.outUsd)}</span><span class="badge-admin">ব্যালেন্স: ${usd(st.balance)}</span>`;
  $('csRows').innerHTML = all.map(r => { bal += r.plus - r.minus; return `<tr><td>${esc(r.date)}</td><td>${esc(r.type)}</td><td>${esc(r.desc)}</td><td class="good">${r.plus ? '+' + usd(r.plus) : '—'}</td><td class="bad">${r.minus ? '-' + usd(r.minus) : '—'}</td><td class="${bal < 0 ? 'bad' : 'good'}">${usd(bal)}</td></tr>`; }).join('') || '<tr><td colspan="6">কোনো লেনদেন নেই</td></tr>';
  $('cardStatementModal').style.display = 'flex';
};
function renderCards() {
  if (isStaff()) return; const totals = db.cards.map(c => ({ ...c, ...getCardStats(c.id) })), cnameCard = id => db.cards.find(x => x.id === id)?.name || '—';
  if ($('cardMetrics')) $('cardMetrics').innerHTML = totals.map(c => `<div class="metric-card m1" style="padding:15px"><small>${esc(c.name)}</small><strong>${usd(c.balance)}</strong><span class="trend">গড় রেট: ${c.avgRate ? money(c.avgRate) : '—'}</span></div>`).join('') || `<div class="muted">কোনো কার্ড নেই</div>`;
  if ($('dashCardSummary')) $('dashCardSummary').innerHTML = totals.map(c => `<div style="padding:6px 10px;border-radius:9px;background:var(--soft);border:1px solid var(--line);font-size:12px"><strong>${esc(c.name)}:</strong> <span class="${c.balance < 20 ? 'bad' : 'good'}">${usd(c.balance)}</span></div>`).join('') || `<span class="muted">কোনো কার্ড নেই</span>`;
  if ($('cardBalanceRows')) $('cardBalanceRows').innerHTML = totals.map(c => `<tr><td><strong>${esc(c.name)}</strong></td><td>${usd(c.inUsd)}</td><td>${money(c.inTk)}</td><td>${c.avgRate ? money(c.avgRate) : '—'}</td><td>${usd(c.outUsd)}</td><td class="${c.balance < 0 ? 'bad' : 'good'}">${usd(c.balance)}</td><td><button type="button" class="secondary sm" onclick="openCardStatement('${c.id}')">📄 স্টেটমেন্ট</button><button type="button" class="secondary sm" onclick="editCardName('${c.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deleteCard('${c.id}')">মুছুন</button></td></tr>`).join('') || `<tr><td colspan="7">কোনো কার্ড নেই</td></tr>`;
  if ($('depositHistoryRows')) $('depositHistoryRows').innerHTML = [...db.cardDeposits].sort(byDateDesc).map(d => { const r = num(d.amount) > 0 ? num(d.taka) / num(d.amount) : 0; return `<tr><td>${esc(d.date)}</td><td><strong>${esc(cnameCard(d.cardId))}</strong></td><td>${usd(d.amount)}</td><td>${money(d.taka)}</td><td>${r ? money(r) : '—'}</td><td><span class="badge-admin">${esc(d.method || 'Bank')}</span> ${esc(d.note || '')}</td><td><button type="button" class="secondary sm" onclick="openEditDepositModal('${d.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deleteDeposit('${d.id}')">মুছুন</button></td></tr>`; }).join('') || `<tr><td colspan="7">কোনো ডিপোজিট নেই</td></tr>`;
  if ($('cardTransferRows')) $('cardTransferRows').innerHTML = [...db.cardTransfers].sort(byDateDesc).map(t => `<tr><td>${esc(t.date)}</td><td>${esc(cnameCard(t.fromCardId))} → ${esc(cnameCard(t.toCardId))}</td><td><strong>${usd(t.amount)}</strong></td><td><button type="button" class="danger sm perm-del" onclick="deleteTransfer('${t.id}')">মুছুন</button></td></tr>`).join('') || `<tr><td colspan="4">কোনো ট্রান্সফার নেই</td></tr>`;
  if ($('cardRefundRows')) $('cardRefundRows').innerHTML = [...db.cardRefunds].sort(byDateDesc).map(r => `<tr><td>${esc(r.date)}</td><td>${esc(cnameCard(r.cardId))}</td><td class="good">+${usd(r.amount)}</td><td>${esc(r.note || '—')}</td><td><button type="button" class="danger sm perm-del" onclick="deleteRefund('${r.id}')">মুছুন</button></td></tr>`).join('') || `<tr><td colspan="5">কোনো রিফান্ড নেই</td></tr>`;
}
window.openEditDepositModal = id => { const d = db.cardDeposits.find(x => x.id === id); if (!d) return; fillSelect('edCard', db.cards, ''); refreshWalletSelects(); $('edId').value = d.id; $('edCard').value = d.cardId; $('edDate').value = d.date; $('edAmount').value = d.amount; $('edTaka').value = d.taka; if ($('edMethod')) $('edMethod').value = d.method || 'Bank'; $('edNote').value = d.note || ''; $('editDepositModal').style.display = 'flex'; };
if ($('editDepositForm')) $('editDepositForm').onsubmit = e => { e.preventDefault(); const d = db.cardDeposits.find(x => x.id === $('edId').value); if (d) { d.cardId = $('edCard').value; d.date = $('edDate').value; d.amount = num($('edAmount').value); d.taka = num($('edTaka').value); d.method = $('edMethod')?.value || 'Bank'; d.note = $('edNote').value.trim(); d.updatedAt = Date.now(); save(); closeModal('editDepositModal'); toast('আপডেট হয়েছে!'); } };

function updateTradePreview() { const type = $('trdType')?.value || 'sell', u = num($('trdUsd')?.value), br = num($('trdBuyRate')?.value), sr = num($('trdSellRate')?.value), p = num($('trdPaidTk')?.value), tot = type === 'sell' ? u * sr : u * br, due = Math.max(0, tot - p), pr = type === 'sell' ? (sr - br) * u : 0; if ($('trdPreview')) $('trdPreview').innerHTML = type === 'sell' ? `বিক্রি বিল: <strong>${money(tot)}</strong> · বাকি: <strong class="bad">${money(due)}</strong> · লাভ: <strong class="${pr >= 0 ? 'good' : 'bad'}">${money(pr)}</strong>` : `কেনা খরচ: <strong>${money(tot)}</strong> · বাকি: <strong class="bad">${money(due)}</strong>`; }
['trdType','trdUsd','trdBuyRate','trdSellRate','trdPaidTk'].forEach(id => { if ($(id)) { $(id).oninput = updateTradePreview; $(id).onchange = updateTradePreview; } });
if ($('trdCard')) $('trdCard').onchange = () => { const avg = cardAvgRate($('trdCard').value); if (avg > 0 && $('trdBuyRate')) { $('trdBuyRate').value = avg; updateTradePreview(); } };
if ($('tradeForm')) $('tradeForm').onsubmit = e => { e.preventDefault(); const type = $('trdType').value, u = num($('trdUsd').value); db.trades.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), date: $('trdDate').value || today(), type, party: $('trdParty').value.trim(), phone: $('trdPhone').value.trim(), cardId: $('trdCard').value || '', usd: u, buyRate: num($('trdBuyRate').value), sellRate: num($('trdSellRate').value), paidTk: num($('trdPaidTk').value), method: $('trdMethod')?.value || 'Cash', note: $('trdNote').value.trim() }); save(); e.target.reset(); $('trdDate').value = today(); if ($('trdMethod') && db.wallets.includes('Cash')) $('trdMethod').value = 'Cash'; updateTradePreview(); toast('ডলার ট্রেড সেভ হয়েছে!'); };
window.payTradeDue = id => { const t = db.trades.find(x => x.id === id); if (!t) return; const tot = t.type === 'sell' ? num(t.usd) * num(t.sellRate) : num(t.usd) * num(t.buyRate), rem = Math.max(0, tot - num(t.paidTk)), add = prompt(`বাকি ${money(rem)}। কত যোগ করবেন?`, rem.toFixed(2)); if (add === null) return; const v = num(add); if (v <= 0) return toast('সঠিক সংখ্যা দিন!', 'error'); t.paidTk = +(num(t.paidTk) + v).toFixed(2); t.updatedAt = Date.now(); save(); toast('আপডেট হয়েছে!'); };
window.sendTradeWhatsApp = id => { const t = db.trades.find(x => x.id === id); if (!t) return; const wa = normalizeBdPhone(t.phone); if (!wa) return toast('মোবাইল নম্বর নেই!', 'error'); const tot = t.type === 'sell' ? num(t.usd) * num(t.sellRate) : num(t.usd) * num(t.buyRate); window.open(`https://wa.me/${wa}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${t.party}, $${num(t.usd).toFixed(2)} ট্রেডের মোট ${money(tot)}, জমা ${money(t.paidTk)}, বাকি ${money(Math.max(0, tot - num(t.paidTk)))}।`)}`, '_blank'); };
window.deleteTrade = id => { if (!hasPerm('canDelete') || !confirm('মুছবেন?')) return; const t = db.trades.find(x => x.id === id); if (t) { moveToTrash('trade', `ট্রেড: ${t.party} $${t.usd}`, t); markDeleted(id); db.trades = db.trades.filter(x => x.id !== id); save(); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn'); } };
function renderTrades() {
  if (isStaff()) return; const q = ($('tradeSearch')?.value || '').toLowerCase(), cc = id => db.cards.find(x => x.id === id)?.name || 'বাইরের উৎস', list = [...db.trades].sort(byDateDesc).filter(t => !q || (t.party || '').toLowerCase().includes(q) || (t.phone || '').includes(q));
  if ($('tradeMetrics')) $('tradeMetrics').innerHTML = `<div class="metric-card m1"><small>কেনা ডলার</small><strong>${usd(db.trades.filter(t=>t.type==='buy').reduce((s,t)=>s+num(t.usd),0))}</strong></div><div class="metric-card m2"><small>বিক্রি ডলার</small><strong>${usd(db.trades.filter(t=>t.type==='sell').reduce((s,t)=>s+num(t.usd),0))}</strong></div><div class="metric-card m3"><small>ট্রেড প্রফিট</small><strong>${money(db.trades.reduce((s,t)=>s+tradeProfit(t),0))}</strong></div><div class="metric-card m4"><small>বকেয়া</small><strong>${money(db.trades.filter(t=>t.type==='sell').reduce((s,t)=>s+Math.max(0,num(t.usd)*num(t.sellRate)-num(t.paidTk)),0))}</strong></div>`;
  if ($('tradeRows')) $('tradeRows').innerHTML = list.map(t => { const tot = t.type === 'sell' ? num(t.usd) * num(t.sellRate) : num(t.usd) * num(t.buyRate), due = Math.max(0, tot - num(t.paidTk)), pr = tradeProfit(t); return `<tr><td>${esc(t.date)}</td><td>${t.type === 'sell' ? '<span class="badge-success">বিক্রি</span>' : '<span class="badge-admin">কেনা</span>'}</td><td><strong>${esc(t.party)}</strong><br><small class="muted">${esc(t.phone || '')} · ${esc(cc(t.cardId))}</small></td><td><strong>${usd(t.usd)}</strong></td><td>${money(t.buyRate)} / ${money(t.sellRate)}</td><td>মোট: ${money(tot)}<br>জমা: <span class="good">${money(t.paidTk)}</span><br>${due > 0 ? `<span class="bad">বাকি: ${money(due)}</span>` : '<span class="good">Paid</span>'}</td><td class="${pr >= 0 ? 'good' : 'bad'}">${t.type === 'sell' ? money(pr) : '—'}</td><td>${due > 0 ? `<button type="button" class="secondary sm" onclick="payTradeDue('${t.id}')">+ টাকা</button>` : ''}<button type="button" class="secondary sm" onclick="sendTradeWhatsApp('${t.id}')">📲</button><button type="button" class="danger sm perm-del" onclick="deleteTrade('${t.id}')">মুছুন</button></td></tr>`; }).join('') || '<tr><td colspan="8">কোনো ট্রেডিং নেই</td></tr>';
}
if ($('tradeSearch')) $('tradeSearch').oninput = renderTrades;

// Rates
if ($('rateForm')) $('rateForm').onsubmit = e => { e.preventDefault(); db.rates.push({ id: uid(), updatedAt: Date.now(), date: $('rateDate').value, value: num($('rateValue').value), note: $('rateNote').value.trim() }); save(); e.target.reset(); $('rateDate').value = today(); toast('রেট সেভ হয়েছে!'); };
window.openEditRateModal = id => { if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const r = db.rates.find(x => x.id === id); if (!r) return; $('erId').value = r.id; $('erDate').value = r.date; $('erValue').value = r.value; $('erNote').value = r.note || ''; $('editRateModal').style.display = 'flex'; };
if ($('editRateForm')) $('editRateForm').onsubmit = e => { e.preventDefault(); const r = db.rates.find(x => x.id === $('erId').value); if (r) { r.date = $('erDate').value; r.value = num($('erValue').value); r.note = $('erNote').value.trim(); r.updatedAt = Date.now(); save(); closeModal('editRateModal'); toast('আপডেট হয়েছে!'); } };
window.deleteRate = id => { if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); const r = db.rates.find(x => x.id === id); if (!r) return; moveToTrash('rate', `রেট: ${money(r.value)}`, r); markDeleted(id); db.rates = db.rates.filter(x => x.id !== id); save(); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn'); };

// Works + Brief + Results + Proof Screenshot (UNLIMITED CAMPAIGNS!)
if ($('wProofFile')) $('wProofFile').onchange = async e => { const f = e.target.files?.[0]; if (!f) return; try { pendingWorkProof = await compressImageFile(f, 700, 0.80); toast('প্রুফ স্ক্রিনশট প্রস্তুত!'); } catch (err) { toast('ছবি ত্রুটি!', 'error'); } };
if ($('ewProofFile')) $('ewProofFile').onchange = async e => { const f = e.target.files?.[0]; if (!f) return; try { pendingEditWorkProof = await compressImageFile(f, 700, 0.80); if ($('ewProofPreview')) { $('ewProofPreview').src = pendingEditWorkProof; $('ewProofPreview').style.display = 'block'; } toast('নতুন প্রুফ স্ক্রিনশট প্রস্তুত!'); } catch (err) {} };

window.quickAddSpend = workId => {
  if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const w = db.works.find(x => x.id === workId); if (!w) return;
  if (isLocked24h(w)) return toast('২৪ ঘণ্টার বেশি পুরোনো কাজ স্টাফ এডিট করতে পারবেন না!', 'error');
  const add = prompt(`"${w.name}"-এ কত ডলার ($) যোগ করবেন?`, '10'); if (add === null) return; const v = num(add); if (v <= 0) return toast('সঠিক সংখ্যা দিন', 'error');
  w.actualDollar = +(num(w.actualDollar) + v).toFixed(2); w.updatedAt = Date.now(); save(); toast(`+$${v} যোগ হয়েছে!`);
};
window.openDailySpendModal = () => {
  if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const host = $('dailySpendList'); if (!host) return;
  const running = db.works.filter(w => (w.status || 'running') === 'running' && num(w.dollar) > 0);
  if (!running.length) return toast('কোনো চলমান বাজেটযুক্ত ক্যাম্পেইন নেই!', 'warn');
  host.innerHTML = running.map(w => `<label style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;background:var(--soft);border:1px solid var(--line);border-radius:9px;margin:0;cursor:pointer"><span style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink)"><input type="checkbox" class="ds-chk row-chk" data-id="${w.id}" ${num(w.actualDollar) < num(w.dollar) ? 'checked' : ''}> <span><strong>${esc(w.name)}</strong> <small class="muted">(${esc(cname(w.customerId))})</small></span></span><span style="display:flex;align-items:center;gap:6px"><small class="muted">${usd(w.actualDollar)}/${usd(w.dollar)}</small><input type="number" step=".01" min="0" value="${+(num(w.dollar) / Math.max(1, num(w.days))).toFixed(2)}" class="ds-amt" data-id="${w.id}" style="width:76px;min-height:30px;padding:4px 6px"></span></label>`).join('');
  $('dailySpendModal').style.display = 'flex';
};
if ($('applyDailySpendConfirmBtn')) $('applyDailySpendConfirmBtn').onclick = () => {
  if (!hasPerm('canEdit')) return; const chks = [...document.querySelectorAll('.ds-chk:checked')]; if (!chks.length) return toast('কমপক্ষে একটি নির্বাচন করুন!', 'warn');
  let c = 0; chks.forEach(ch => { const id = ch.dataset.id, w = db.works.find(x => x.id === id), amt = num(document.querySelector(`.ds-amt[data-id="${id}"]`)?.value); if (w && amt > 0 && !isLocked24h(w)) { w.actualDollar = +(num(w.actualDollar) + amt).toFixed(2); w.updatedAt = Date.now(); c++; } });
  if (c) { save(); closeModal('dailySpendModal'); toast(`${c}টি ক্যাম্পেইনে খরচ যোগ হয়েছে!`); }
};
window.renewWork = workId => {
  if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const w = db.works.find(x => x.id === workId); if (!w) return;
  goToSection('works'); $('wDate').value = today(); $('wCustomer').value = w.customerId || ''; updatePages(); $('wPage').value = w.pageId || '';
  $('wName').value = w.name.replace(/ \(Renew\)$/i, '') + ' (Renew)'; $('wDays').value = w.days || 7; $('wDollar').value = w.dollar || 0; $('wRate').value = w.rate || rateFor(today()); $('wActualDollar').value = 0;
  if ($('wServiceFee')) $('wServiceFee').value = w.serviceFee || 0; if ($('wServiceFeeType')) $('wServiceFeeType').value = w.serviceFeeType || 'fixed';
  if ($('wStaff')) $('wStaff').value = w.staffName || ''; if ($('wCommPct')) $('wCommPct').value = num(w.commPct);
  if ($('wObjective')) $('wObjective').value = w.objective || 'Messages'; if ($('wTargetLoc')) $('wTargetLoc').value = w.targetLoc || ''; if ($('wTargetAge')) $('wTargetAge').value = w.targetAge || '';
  if ($('wPostUrl')) $('wPostUrl').value = w.postUrl || ''; if ($('wAudience')) $('wAudience').value = w.audience || ''; if ($('wAdCopy')) $('wAdCopy').value = w.adCopy || '';
  if (!isStaff()) { $('wCard').value = w.cardId || ''; $('wActualRate').value = w.actualRate || cardAvgRate(w.cardId) || 0; $('wFeePct').value = w.feePct || 0; $('wOther').value = 0; }
  $('wStatus').value = 'running'; updateWorkPreview(); document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' }); toast('রিনিউ তথ্য ফর্মে বসানো হয়েছে!');
};
const progressBarHtml = (s, b) => !b || b <= 0 ? '' : `<div class="prog-wrap"><div class="prog-bar" style="width:${Math.min(100, Math.round((s/b)*100))}%;background:${s > b ? '#dc2626' : (s/b >= 0.85 ? '#d97706' : '#10b981')}"></div></div>`;

if ($('workForm')) $('workForm').onsubmit = e => {
  e.preventDefault(); const date = $('wDate').value, rate = num($('wRate').value) || rateFor(date); if (!rate) return toast('ডলারের বিলিং রেট দিন!', 'error');
  const pageId = $('wPage').value || '', custId = $('wCustomer').value || pageCustomer(pageId), rules = getRules();
  const actualDol = num($('wActualDollar').value), sFee = num($('wServiceFee')?.value), sType = $('wServiceFeeType')?.value || 'fixed', actRate = num($('wActualRate').value), feePct = num($('wFeePct').value), other = num($('wOther').value);
  const testW = { actualDollar: actualDol, rate, serviceFee: sFee, serviceFeeType: sType, actualRate: actRate, feePct, other };
  if (isStaff() && rules.minBillRate > 0 && rate < rules.minBillRate) return toast(`শর্ত ভঙ্গ: মিনিমাম রেট ${money(rules.minBillRate)} হতে হবে!`, 'error');
  if (isStaff() && rules.blockLoss && actRate > 0 && profit(testW) < 0) return toast('শর্ত ভঙ্গ: লসে কাজ সেভ করা যাবে না!', 'error');
  const cust = db.customers.find(c => c.id === custId), dueLim = num(cust?.dueLimit) || num(rules.defaultDueLimit);
  if (dueLim > 0 && (-clientBalance(custId)) >= dueLim) {
    if (isStaff()) return toast(`বকেয়া লিমিট পূর্ণ! (${money(-clientBalance(custId))})`, 'error');
    else if (!confirm(`সতর্কতা: কাস্টমারের বকেয়া ${money(-clientBalance(custId))} যা লিমিটের (${money(dueLim)}) বেশি! সেভ করবেন?`)) return;
  }
  db.works.push({
    id: uid(), createdAt: Date.now(), updatedAt: Date.now(), date, customerId: custId, pageId,
    name: $('wName').value.trim(), days: num($('wDays').value), dollar: num($('wDollar').value), rate, actualDollar: actualDol,
    serviceFee: sFee, serviceFeeType: sType, cardId: $('wCard').value, actualRate: actRate, feePct, other,
    staffName: $('wStaff')?.value || '', commPct: num($('wCommPct')?.value),
    reach: num($('wReach')?.value), clicks: num($('wClicks')?.value), conversions: num($('wConversions').value), revenue: num($('wRevenue').value),
    creativeLink: $('wCreativeLink').value.trim(), status: $('wStatus').value, note: $('wNote').value.trim(), proofImg: pendingWorkProof || '',
    objective: $('wObjective')?.value || 'Messages', targetLoc: $('wTargetLoc')?.value.trim() || '', targetAge: $('wTargetAge')?.value.trim() || '',
    postUrl: $('wPostUrl')?.value.trim() || '', policyIssue: $('wPolicyIssue')?.value || 'None', audience: $('wAudience')?.value.trim() || '', adCopy: $('wAdCopy')?.value.trim() || ''
  });
  pendingWorkProof = ''; save(); logActivity(`নতুন কাজ: ${$('wName').value.trim()}`);
  e.target.reset(); $('wDate').value = today(); $('wDays').value = 7; $('wRate').value = rateFor(today()) || ''; $('wFeePct').value = num(db.agency?.defaultFeePct) || 0;
  updateWorkPreview(); toast('কাজ সেভ হয়েছে!');
};

window.openEditWorkModal = workId => {
  if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const w = db.works.find(x => x.id === workId); if (!w) return;
  if (isLocked24h(w)) return toast('২৪ ঘণ্টার পুরোনো কাজ স্টাফ এডিট করতে পারবেন না!', 'error');
  refresh(); $('ewId').value = w.id; $('ewDate').value = w.date; $('ewCustomer').value = w.customerId || ''; updateEditWorkPages(); $('ewPage').value = w.pageId || '';
  $('ewName').value = w.name; $('ewDays').value = w.days || 1; $('ewDollar').value = w.dollar || 0; $('ewRate').value = w.rate || 0; $('ewActualDollar').value = w.actualDollar || 0;
  if ($('ewServiceFee')) $('ewServiceFee').value = w.serviceFee || 0; if ($('ewServiceFeeType')) $('ewServiceFeeType').value = w.serviceFeeType || 'fixed';
  if ($('ewStaff')) { if (w.staffName && ![...$('ewStaff').options].some(o => o.value === w.staffName)) $('ewStaff').add(new Option(w.staffName, w.staffName)); $('ewStaff').value = w.staffName || ''; }
  if ($('ewCommPct')) $('ewCommPct').value = num(w.commPct);
  $('ewCard').value = w.cardId || ''; $('ewActualRate').value = w.actualRate || 0; $('ewFeePct').value = w.feePct || 0; $('ewOther').value = w.other || 0;
  if ($('ewReach')) $('ewReach').value = num(w.reach); if ($('ewClicks')) $('ewClicks').value = num(w.clicks);
  $('ewRevenue').value = w.revenue || 0; $('ewConversions').value = w.conversions || 0; $('ewCreativeLink').value = w.creativeLink || ''; $('ewStatus').value = w.status || 'running'; $('ewNote').value = w.note || '';
  if ($('ewObjective')) $('ewObjective').value = w.objective || 'Messages'; if ($('ewTargetLoc')) $('ewTargetLoc').value = w.targetLoc || ''; if ($('ewTargetAge')) $('ewTargetAge').value = w.targetAge || '';
  if ($('ewPostUrl')) $('ewPostUrl').value = w.postUrl || ''; if ($('ewPolicyIssue')) $('ewPolicyIssue').value = w.policyIssue || 'None'; if ($('ewAudience')) $('ewAudience').value = w.audience || ''; if ($('ewAdCopy')) $('ewAdCopy').value = w.adCopy || '';
  pendingEditWorkProof = w.proofImg || ''; if ($('ewProofFile')) $('ewProofFile').value = '';
  if ($('ewProofPreview')) { $('ewProofPreview').style.display = pendingEditWorkProof ? 'block' : 'none'; if (pendingEditWorkProof) $('ewProofPreview').src = pendingEditWorkProof; }
  updateEditWorkPreview(); $('editWorkModal').style.display = 'flex';
};
if ($('editWorkForm')) $('editWorkForm').onsubmit = e => {
  e.preventDefault(); const w = db.works.find(x => x.id === $('ewId').value); if (!w) return;
  w.date = $('ewDate').value; w.customerId = $('ewCustomer').value || pageCustomer($('ewPage').value); w.pageId = $('ewPage').value || '';
  w.name = $('ewName').value.trim(); w.days = num($('ewDays').value); w.dollar = num($('ewDollar').value); w.rate = num($('ewRate').value); w.actualDollar = num($('ewActualDollar').value);
  w.serviceFee = num($('ewServiceFee')?.value); w.serviceFeeType = $('ewServiceFeeType')?.value || 'fixed'; w.staffName = $('ewStaff')?.value || '';
  if (!isStaff()) { w.cardId = $('ewCard').value; w.actualRate = num($('ewActualRate').value); w.feePct = num($('ewFeePct').value); w.other = num($('ewOther').value); w.commPct = num($('ewCommPct')?.value); }
  w.reach = num($('ewReach')?.value); w.clicks = num($('ewClicks')?.value); w.revenue = num($('ewRevenue').value); w.conversions = num($('ewConversions').value);
  w.creativeLink = $('ewCreativeLink').value.trim(); w.status = $('ewStatus').value; w.note = $('ewNote').value.trim(); w.proofImg = pendingEditWorkProof || '';
  w.objective = $('ewObjective')?.value || 'Messages'; w.targetLoc = $('ewTargetLoc')?.value.trim() || ''; w.targetAge = $('ewTargetAge')?.value.trim() || '';
  w.postUrl = $('ewPostUrl')?.value.trim() || ''; w.policyIssue = $('ewPolicyIssue')?.value || 'None'; w.audience = $('ewAudience')?.value.trim() || ''; w.adCopy = $('ewAdCopy')?.value.trim() || '';
  w.updatedAt = Date.now(); save(); closeModal('editWorkModal'); toast('কাজের হিসাব আপডেট হয়েছে!');
};
window.cloneWork = workId => { if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const w = db.works.find(x => x.id === workId); if (!w) return; db.works.push({ ...w, id: uid(), createdAt: Date.now(), updatedAt: Date.now(), date: today(), name: w.name + ' (Copy)' }); save(); toast('ক্লোন হয়েছে!'); };
window.deleteWork = workId => {
  if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); const w = db.works.find(x => x.id === workId); if (!w) return;
  if (isLocked24h(w)) return toast('২৪ ঘণ্টার পুরোনো কাজ স্টাফ ডিলিট করতে পারবেন না!', 'error');
  if (!requireMasterPin('কাজ ডিলিট') || !confirm('কাজটি রিসাইকেল বিনে পাঠাবেন?')) return;
  moveToTrash('work', `কাজ: ${w.name}`, w); markDeleted(workId); selectedWorkIds.delete(workId); db.works = db.works.filter(x => x.id !== workId); save(); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn');
};
window.toggleWorkSelect = (id, ch) => { if (ch) selectedWorkIds.add(id); else selectedWorkIds.delete(id); updateWorkBulkBar(); };
function updateWorkBulkBar() { const b = $('workBulkBar'), c = $('workSelectedCount'); if (!b || !c) return; c.textContent = selectedWorkIds.size; b.style.display = selectedWorkIds.size > 0 ? 'flex' : 'none'; }
if ($('workSelectAll')) $('workSelectAll').onchange = e => { const ch = e.target.checked; document.querySelectorAll('.work-row-chk').forEach(x => { x.checked = ch; if (ch) selectedWorkIds.add(x.dataset.id); else selectedWorkIds.delete(x.dataset.id); }); updateWorkBulkBar(); };
window.bulkWorkStatus = st => { if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); if (!selectedWorkIds.size) return; db.works.forEach(w => { if (selectedWorkIds.has(w.id) && !isLocked24h(w)) { w.status = st; w.updatedAt = Date.now(); } }); const c = selectedWorkIds.size; selectedWorkIds.clear(); if ($('workSelectAll')) $('workSelectAll').checked = false; save(); updateWorkBulkBar(); toast(`${c}টি আপডেট হয়েছে!`); };
window.bulkDeleteWorks = () => { if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); if (!selectedWorkIds.size || !requireMasterPin('বাল্ক ডিলিট') || !confirm(`${selectedWorkIds.size}টি কাজ রিসাইকেল বিনে পাঠাবেন?`)) return; db.works.filter(w => selectedWorkIds.has(w.id)).forEach(w => { moveToTrash('work', `কাজ: ${w.name}`, w); markDeleted(w.id); }); db.works = db.works.filter(w => !selectedWorkIds.has(w.id)); selectedWorkIds.clear(); if ($('workSelectAll')) $('workSelectAll').checked = false; save(); updateWorkBulkBar(); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn'); };

// Expenses, Wallets, Cashbook, Payments & Approval
if ($('addWalletForm')) $('addWalletForm').onsubmit = e => { e.preventDefault(); const n = $('newWalletInput').value.trim(); if (!n) return; if (!Array.isArray(db.wallets)) db.wallets = [...DEFAULT_WALLETS]; if (!db.wallets.some(w => w.toLowerCase() === n.toLowerCase())) { db.wallets.push(n); save(); toast(`${n} যুক্ত হয়েছে!`); } else toast('আগেই আছে!', 'warn'); $('newWalletInput').value = ''; };
if ($('walletListChips')) $('walletListChips').addEventListener('click', e => { const btn = e.target.closest('button[data-wallet]'); if (!btn) return; const n = btn.getAttribute('data-wallet'); if (['Cash','Bank'].includes(n)) return toast('Cash ও Bank মুছা যাবে না', 'warn'); if (!confirm(`"${n}" সরাতে চান?`)) return; db.wallets = db.wallets.filter(w => w !== n); save(); toast(`${n} সরানো হয়েছে`, 'warn'); });
if ($('expenseForm')) $('expenseForm').onsubmit = e => { e.preventDefault(); if (!hasPerm('canExpenses')) return toast('অনুমতি নেই!', 'error'); const pend = isStaff() && getRules().requireApproval; db.expenses.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), approvalStatus: pend ? 'pending' : 'approved', date: $('expDate').value, title: $('expTitle').value.trim(), category: $('expCategory').value, method: $('expMethod')?.value || 'Cash', amount: num($('expAmount').value), note: $('expNote').value.trim() }); save(); e.target.reset(); $('expDate').value = today(); if ($('expMethod') && db.wallets.includes('Cash')) $('expMethod').value = 'Cash'; toast(pend ? 'খরচ অ্যাপ্রুভালের জন্য পাঠানো হয়েছে!' : 'খরচ সেভ হয়েছে!'); };
window.openEditExpenseModal = id => { if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const ex = db.expenses.find(x => x.id === id); if (!ex || isLocked24h(ex)) return toast('২৪ ঘণ্টার বেশি পুরোনো খরচ এডিট করা যাবে না!', 'error'); refreshWalletSelects(); $('eeId').value = ex.id; $('eeDate').value = ex.date; $('eeTitle').value = ex.title; $('eeCategory').value = ex.category; if ($('eeMethod')) { if (ex.method && ![...$('eeMethod').options].some(o => o.value === ex.method)) $('eeMethod').add(new Option(ex.method, ex.method)); $('eeMethod').value = ex.method || 'Cash'; } $('eeAmount').value = ex.amount; $('eeNote').value = ex.note || ''; $('editExpenseModal').style.display = 'flex'; };
if ($('editExpenseForm')) $('editExpenseForm').onsubmit = e => { e.preventDefault(); const ex = db.expenses.find(x => x.id === $('eeId').value); if (ex) { ex.date = $('eeDate').value; ex.title = $('eeTitle').value.trim(); ex.category = $('eeCategory').value; ex.method = $('eeMethod')?.value || 'Cash'; ex.amount = num($('eeAmount').value); ex.note = $('eeNote').value.trim(); ex.updatedAt = Date.now(); save(); closeModal('editExpenseModal'); toast('আপডেট হয়েছে!'); } };
window.deleteExpense = id => { if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); const ex = db.expenses.find(x => x.id === id); if (!ex || isLocked24h(ex)) return toast('অনুমতি নেই বা ২৪ ঘণ্টার পুরোনো!', 'error'); if (!confirm('মুছবেন?')) return; moveToTrash('expense', `খরচ: ${ex.title}`, ex); markDeleted(id); db.expenses = db.expenses.filter(x => x.id !== id); save(); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn'); };
if ($('cashAdjustForm')) $('cashAdjustForm').onsubmit = e => { e.preventDefault(); const m = $('caMethod')?.value || 'Cash', a = num($('caAmount')?.value); if (a <= 0) return toast('সঠিক পরিমাণ দিন!', 'error'); db.cashAdjustments.push({ id: uid(), updatedAt: Date.now(), date: $('caDate').value || today(), method: m, type: $('caType').value, amount: a, note: $('caNote').value.trim() }); save(); e.target.reset(); $('caDate').value = today(); if ($('caMethod') && db.wallets.includes('Cash')) $('caMethod').value = 'Cash'; toast('ক্যাশবুক আপডেট হয়েছে!'); };
window.deleteCashAdjust = id => { if (!hasPerm('canDelete') || !confirm('মুছবেন?')) return; markDeleted(id); db.cashAdjustments = db.cashAdjustments.filter(x => x.id !== id); save(); toast('মুছে ফেলা হয়েছে', 'warn'); };
if ($('paymentForm')) $('paymentForm').onsubmit = e => { e.preventDefault(); if (!hasPerm('canPayments')) return toast('অনুমতি নেই!', 'error'); const cid = $('pCustomer')?.value; if (!cid) return toast('কাস্টমার নির্বাচন করুন!', 'error'); const amt = num($('pAmount')?.value); if (amt <= 0) return toast('সঠিক পরিমাণ দিন!', 'error'); const pend = isStaff() && getRules().requireApproval; db.payments.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), approvalStatus: pend ? 'pending' : 'approved', date: $('pDate').value || today(), customerId: cid, amount: amt, method: $('pMethod')?.value || 'Cash', fee: num($('pFee')?.value), ref: $('pRef').value.trim(), note: $('pNote').value.trim() }); save(); e.target.reset(); $('pDate').value = today(); if ($('pFee')) $('pFee').value = 0; updatePaymentCustomerStatus(); toast(pend ? 'পেমেন্ট অ্যাপ্রুভালের জন্য পাঠানো হয়েছে!' : 'পেমেন্ট জমা হয়েছে!'); };
window.openEditPaymentModal = id => { if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const p = db.payments.find(x => x.id === id); if (!p || isLocked24h(p)) return toast('২৪ ঘণ্টার পুরোনো পেমেন্ট এডিট করা যাবে না!', 'error'); refresh(); $('epId').value = p.id; $('epDate').value = p.date; $('epCustomer').value = p.customerId; $('epAmount').value = p.amount; if ($('epMethod')) { if (p.method && ![...$('epMethod').options].some(o => o.value === p.method)) $('epMethod').add(new Option(p.method, p.method)); $('epMethod').value = p.method; } if ($('epFee')) $('epFee').value = p.fee || 0; $('epRef').value = p.ref || ''; $('epNote').value = p.note || ''; $('editPaymentModal').style.display = 'flex'; };
if ($('editPaymentForm')) $('editPaymentForm').onsubmit = e => { e.preventDefault(); const p = db.payments.find(x => x.id === $('epId').value); if (p) { p.date = $('epDate').value; p.customerId = $('epCustomer').value; p.amount = num($('epAmount').value); p.method = $('epMethod').value; p.fee = num($('epFee')?.value); p.ref = $('epRef').value.trim(); p.note = $('epNote').value.trim(); p.updatedAt = Date.now(); save(); closeModal('editPaymentModal'); toast('আপডেট হয়েছে!'); } };
window.deletePayment = id => { if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); const p = db.payments.find(x => x.id === id); if (!p || isLocked24h(p)) return toast('অনুমতি নেই বা ২৪ ঘণ্টার পুরোনো!', 'error'); if (!requireMasterPin('পেমেন্ট ডিলিট') || !confirm('ট্র্যাশে পাঠাবেন?')) return; moveToTrash('payment', `পেমেন্ট: ${cname(p.customerId)} (${money(p.amount)})`, p); markDeleted(id); db.payments = db.payments.filter(x => x.id !== id); save(); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn'); };
window.approvePending = (type, id) => { const arr = type === 'payment' ? db.payments : db.expenses, item = arr.find(x => x.id === id); if (!item) return; item.approvalStatus = 'approved'; item.updatedAt = Date.now(); save(); renderAdminPanel(); toast('অনুমোদিত হয়েছে!'); };
window.rejectPending = (type, id) => { if (!confirm('বাতিল করবেন?')) return; markDeleted(id); if (type === 'payment') db.payments = db.payments.filter(x => x.id !== id); else db.expenses = db.expenses.filter(x => x.id !== id); save(); renderAdminPanel(); toast('বাতিল করা হয়েছে', 'warn'); };

// WhatsApp & Dues
function normalizeBdPhone(raw) { let d = String(raw || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('8801')) return d; if (d.startsWith('01')) return '88' + d; if (d.startsWith('1') && d.length === 10) return '880' + d; return d; }
window.sendWhatsAppReminder = custId => {
  const c = db.customers.find(x => x.id === custId); if (!c) return; const wa = normalizeBdPhone(c.phone); if (!wa) return toast('মোবাইল নম্বর নেই!', 'error');
  const b = billed(custId), p = paid(custId), dueAmt = money(Math.max(0, b - p)), agName = db.agency?.name || 'Ads হিসাব ম্যানেজার', payInfo = db.agency?.payInfo ? `পেমেন্ট: ${db.agency.payInfo}` : '';
  const msg = (db.agency?.waTemplate || DEFAULT_WA_TEMPLATE).replace(/\{name\}/g, c.name).replace(/\{agency\}/g, agName).replace(/\{bill\}/g, money(b)).replace(/\{paid\}/g, money(p)).replace(/\{due\}/g, dueAmt).replace(/\{payinfo\}/g, payInfo);
  db.reminderLogs[custId] = new Date().toLocaleString('bn-BD'); save(); window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank');
};
window.sendLowPrepaidWhatsApp = custId => { const c = db.customers.find(x => x.id === custId); if (!c) return; const wa = normalizeBdPhone(c.phone); if (!wa) return toast('মোবাইল নম্বর নেই!', 'error'); window.open(`https://wa.me/${wa}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${c.name}, আপনার অ্যাডভান্স ব্যালেন্স কমে ${money(clientBalance(custId))} হয়েছে। অনুগ্রহ করে রিচার্জ করুন।`)}`, '_blank'); };
window.sendCampaignWhatsApp = workId => { const w = db.works.find(x => x.id === workId); if (!w) return; const c = db.customers.find(x => x.id === w.customerId), wa = normalizeBdPhone(c?.phone); if (!wa) return toast('মোবাইল নম্বর নেই!', 'error'); window.open(`https://wa.me/${wa}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${c.name}, আপনার '${w.name}' ক্যাম্পেইনের ব্যবহৃত ডলার ${usd(w.actualDollar)}, বিল ${money(bill(w))}, স্ট্যাটাস: ${w.status}। ধন্যবাদ!`)}`, '_blank'); };
window.sendRenewOfferWhatsApp = workId => { const w = db.works.find(x => x.id === workId); if (!w) return; const c = db.customers.find(x => x.id === w.customerId), wa = normalizeBdPhone(c?.phone); if (!wa) return toast('মোবাইল নম্বর নেই!', 'error'); window.open(`https://wa.me/${wa}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${c.name}, আপনার '${w.name}' ক্যাম্পেইনটির মেয়াদ শেষ হয়েছে। ভালো রেজাল্ট ধরে রাখতে চাইলে আরও ৭ দিন রিনিউ করতে পারেন—কত ডলার বাজেট দেবো জানাবেন? ধন্যবাদ - ${db.agency?.name || 'Ads হিসাব ম্যানেজার'}`)}`, '_blank'); };

function renderDues() {
  const dq = ($('dueSearch')?.value || '').toLowerCase(), dueRows = db.customers.map(c => ({ customer: c, bill: billed(c.id), paid: paid(c.id), bal: paid(c.id) - billed(c.id) }));
  const onlyDuesAll = dueRows.filter(x => x.bal < 0), onlyDues = onlyDuesAll.filter(x => !dq || x.customer.name.toLowerCase().includes(dq) || (x.customer.phone || '').includes(dq)), lowP = dueRows.filter(x => x.bal > 0 && x.bal < 1000);
  if ($('dueMetrics')) $('dueMetrics').innerHTML = `<div class="metric-card m4"><small>মোট বকেয়া</small><strong>${money(onlyDuesAll.reduce((s, x) => s + (-x.bal), 0))}</strong></div><div class="metric-card m3"><small>অ্যাডভান্স জমা</small><strong>${money(dueRows.filter(x => x.bal > 0).reduce((s, x) => s + x.bal, 0))}</strong></div><div class="metric-card m1"><small>বকেয়া কাস্টমার</small><strong>${onlyDuesAll.length} জন</strong></div>`;
  if ($('dueRows')) $('dueRows').innerHTML = onlyDues.map(x => { const cid = x.customer.id, due = -x.bal; return `<tr><td><strong>${esc(x.customer.name)}</strong>${due > 5000 ? `<span class="badge-danger" style="margin-left:5px">High</span>` : ''}</td><td>${esc(x.customer.phone || '—')}</td><td>${money(x.bill)}</td><td>${money(x.paid)}</td><td class="bad">${money(due)}</td><td>${db.reminderLogs[cid] ? `<span class="good" style="font-size:11px">${esc(db.reminderLogs[cid])}</span>` : '<span class="muted">নেই</span>'}</td><td><button type="button" class="secondary sm" onclick="sendWhatsAppReminder('${cid}')">📲 WhatsApp</button><button type="button" class="secondary sm" onclick="openInvoice('${cid}')">📄 ইনভয়েস</button></td></tr>`; }).join('') || '<tr><td colspan="7">কোনো বকেয়া নেই 🎉</td></tr>';
  if ($('lowPrepaidRows')) $('lowPrepaidRows').innerHTML = lowP.map(x => `<tr><td><strong>${esc(x.customer.name)}</strong></td><td>${esc(x.customer.phone || '—')}</td><td class="bad">${money(x.bal)}</td><td><button type="button" class="warn sm" onclick="sendLowPrepaidWhatsApp('${x.customer.id}')">📲 রিচার্জ</button></td></tr>`).join('') || '<tr><td colspan="4">নেই ✅</td></tr>';
  if ($('dashLowPrepaidWrap') && $('dashLowPrepaidList')) { $('dashLowPrepaidWrap').style.display = lowP.length ? 'block' : 'none'; $('dashLowPrepaidList').innerHTML = lowP.slice(0, 4).map(x => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:6px 9px;background:var(--soft);border-radius:8px;border:1px solid var(--line)"><span><strong>${esc(x.customer.name)}</strong>: <span class="bad">${money(x.bal)}</span></span><button type="button" class="warn sm" style="margin:0" onclick="sendLowPrepaidWhatsApp('${x.customer.id}')">📲 রিচার্জ</button></div>`).join(''); }
}

// Notifications, Active/Expired Ads & CRM Follow-up
function updateNotifications() {
  const nl = $('notifList'), nc = $('notifCount'); if (!nl || !nc) return;
  const items = [], tD = new Date(); tD.setHours(0,0,0,0);
  db.works.forEach(w => { if (w.status === 'running' && w.days) { const sD = new Date(w.date), exp = new Date(sD); exp.setDate(sD.getDate() + Number(w.days)); exp.setHours(0,0,0,0); const d = Math.ceil((exp - tD) / 86400000); if (d <= 1 && d >= 0) items.push({ key: `work_${w.id}_soon`, text: `⏰ '${w.name}' মেয়াদ শেষ হচ্ছে!`, tab: 'works' }); else if (d < 0) items.push({ key: `work_${w.id}_exp`, text: `⚠️ '${w.name}' মেয়াদ শেষ।`, tab: 'works' }); } });
  const dueFollow = db.customers.filter(c => c.followUpDate && c.followUpDate <= today()).length;
  if (dueFollow > 0) items.push({ key: `fup_${dueFollow}`, text: `📞 আজ ${dueFollow} জন ক্লায়েন্টকে ফলোআপ করতে হবে!`, tab: 'dash' });
  if (hasPerm('canPayments')) { const dc = db.customers.filter(c => clientBalance(c.id) < 0).length; if (dc > 0) items.push({ key: `due_${dc}`, text: `📌 ${dc} জনের কাছে বকেয়া রয়েছে।`, tab: 'dues' }); }
  if (!isStaff()) {
    db.cards.forEach(c => { const st = getCardStats(c.id); if (st.inUsd > 0 && st.balance < 20) items.push({ key: `card_${c.id}`, text: `💳 '${c.name}' ব্যালেন্স কম (${usd(st.balance)})!`, tab: 'cards' }); });
    const oh = readHelpRequests().filter(h => h.status === 'open' && (isSuperAdmin() || h.target !== 'Super Admin')).length;
    if (oh > 0) items.push({ key: `help_${oh}`, text: `📩 ${oh} টি নতুন হেল্প মেসেজ!`, tab: 'adminPanel', subTab: 'help' });
    if (portalOrders.length > 0) items.push({ key: `po_${portalOrders.length}`, text: `🛒 পোর্টাল থেকে ${portalOrders.length}টি নতুন অর্ডার এসেছে!`, tab: 'adminPanel', subTab: 'help' });
  }
  const st = readNotifState(), vis = items.filter(i => !st.dismissed.includes(i.key)); currentNotifKeys = vis.map(i => i.key);
  const unread = vis.filter(i => !st.seen.includes(i.key)).length; nc.style.display = unread > 0 ? 'flex' : 'none'; if (unread > 0) nc.textContent = unread;
  nl.innerHTML = vis.length ? vis.map(i => `<div class="notif-item" style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px" onclick="goToSection('${i.tab}');${i.subTab ? `switchAdminSubTab('${i.subTab}');` : ''}$('notifBox').style.display='none'"><span>${esc(i.text)}</span><button type="button" class="secondary sm" style="padding:1px 6px;margin:0;flex-shrink:0" onclick="dismissNotif(event,'${esc(i.key)}')">✕</button></div>`).join('') : `<div class="notif-item">কোনো নতুন বিজ্ঞপ্তি নেই</div>`;
}

function renderActiveCampaignsMonitor() {
  const host = $('dashActiveWorksRows'), expHost = $('dashExpiredWorksRows'), fupHost = $('dashFollowUpRows'), tD = new Date(); tD.setHours(0,0,0,0);
  if (host) host.innerHTML = db.works.filter(w => (w.status || 'running') === 'running').map(w => {
    const sD = new Date(w.date), exp = new Date(sD); exp.setDate(sD.getDate() + Math.max(1, num(w.days))); exp.setHours(0,0,0,0);
    const diff = Math.ceil((exp - tD) / 86400000), daily = num(w.days) > 0 ? (num(w.dollar) / num(w.days)) : num(w.dollar);
    const badge = diff < 0 ? `<span class="badge-danger">মেয়াদ শেষ (${Math.abs(diff)} দিন আগে)</span>` : (diff <= 1 ? `<span class="badge-status status-running">আজ/কাল শেষ</span>` : `<span class="badge-success">${diff} দিন বাকি</span>`);
    return `<tr><td><strong>${esc(cname(w.customerId))}</strong><br><small class="muted">${esc(pname(w.pageId))}</small></td><td>${esc(w.name)}</td><td>${usd(w.dollar)} / <strong>${usd(w.actualDollar)}</strong>${progressBarHtml(num(w.actualDollar), num(w.dollar))}</td><td>${usd(daily)}/দিন</td><td>${badge}</td><td><button type="button" class="secondary sm perm-edit" onclick="quickAddSpend('${w.id}')">+$</button><button type="button" class="secondary sm perm-edit" onclick="renewWork('${w.id}')">🔄</button><button type="button" class="secondary sm" onclick="openMsgTemplates('${w.customerId}','${w.id}')">💬</button></td></tr>`;
  }).join('') || `<tr><td colspan="6">কোনো চলমান ক্যাম্পেইন নেই</td></tr>`;

  if (expHost) {
    const expired = db.works.filter(w => {
      if (!w.date || !w.days) return false;
      const sD = new Date(w.date), exp = new Date(sD); exp.setDate(sD.getDate() + num(w.days)); exp.setHours(0,0,0,0);
      const diff = Math.ceil((exp - tD) / 86400000);
      return diff <= 0 && diff >= -14;
    }).sort(byDateDesc).slice(0, 8);
    expHost.innerHTML = expired.map(w => {
      const sD = new Date(w.date), exp = new Date(sD); exp.setDate(sD.getDate() + num(w.days));
      return `<tr><td><strong>${esc(cname(w.customerId))}</strong><br><small class="muted">${esc(w.name)}</small></td><td><span class="badge-warn">${exp.toISOString().slice(0,10)}</span></td><td><button type="button" class="secondary sm" onclick="sendRenewOfferWhatsApp('${w.id}')">📲 রিনিউ অফার</button><button type="button" class="secondary sm perm-edit" onclick="renewWork('${w.id}')">🔄 Renew</button></td></tr>`;
    }).join('') || '<tr><td colspan="3">সম্প্রতি মেয়াদ শেষ হওয়া কাজ নেই</td></tr>';
  }

  if (fupHost) {
    const todayS = today(), fups = db.customers.filter(c => c.followUpDate && c.followUpDate <= todayS).sort((a,b) => String(a.followUpDate).localeCompare(String(b.followUpDate)));
    fupHost.innerHTML = fups.map(c => `<tr><td><strong>${esc(c.name)}</strong><br><small class="muted">${esc(c.phone || '')}</small></td><td><span class="badge-admin">${esc(c.stage || 'Inquiry')}</span><br><small class="${c.followUpDate < todayS ? 'bad' : 'good'}">${esc(c.followUpDate)}</small></td><td><button type="button" class="secondary sm" onclick="openMsgTemplates('${c.id}')">💬</button><button type="button" class="sm" style="background:#059669" onclick="clearFollowUp('${c.id}')">✓ Done</button></td></tr>`).join('') || '<tr><td colspan="3">আজ কোনো ফলোআপ বাকি নেই 🎉</td></tr>';
  }
}

function renderMonthlyChart() {
  if (isStaff()) return; const host = $('monthlyChart'), labelsHost = $('monthlyChartLabels'); if (!host || !labelsHost) return;
  const bnM = ['জানু','ফেব্রু','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টে','অক্টো','নভে','ডিসে'], now = new Date(), buckets = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); buckets.push({ ym: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: bnM[d.getMonth()] + "'" + String(d.getFullYear()).slice(-2), bill: 0, spend: 0, profit: 0 }); }
  db.works.forEach(w => { const b = buckets.find(x => x.ym === String(w.date || '').slice(0, 7)); if (b) { b.bill += bill(w); b.spend += actual(w) + num(w.other); } });
  db.expenses.filter(e => e.approvalStatus !== 'pending').forEach(e => { const b = buckets.find(x => x.ym === String(e.date || '').slice(0, 7)); if (b) b.spend += num(e.amount); });
  db.payments.filter(p => p.approvalStatus !== 'pending').forEach(p => { const b = buckets.find(x => x.ym === String(p.date || '').slice(0, 7)); if (b) b.spend += num(p.fee); });
  buckets.forEach(b => { b.profit = Math.max(0, b.bill - b.spend); }); const max = Math.max(1, ...buckets.flatMap(b => [b.bill, b.spend, b.profit]));
  host.innerHTML = buckets.map(b => `<div style="flex:1;display:flex;align-items:flex-end;justify-content:center;gap:3px;height:100%" title="${b.label}: বিল ${money(b.bill)} | লাভ ${money(b.bill - b.spend)}"><div style="width:26%;height:${Math.max(4, b.bill/max*100)}%;background:#2563eb;border-radius:4px 4px 0 0"></div><div style="width:26%;height:${Math.max(4, b.spend/max*100)}%;background:#7c3aed;border-radius:4px 4px 0 0"></div><div style="width:26%;height:${Math.max(4, b.profit/max*100)}%;background:#10b981;border-radius:4px 4px 0 0"></div></div>`).join('');
  labelsHost.innerHTML = buckets.map(b => `<span style="flex:1;text-align:center">${b.label}</span>`).join('');
}
function renderTopClients() {
  const host = $('topClientsList'); if (!host) return; const mode = (!isStaff() && $('topClientMode')?.value === 'profit') ? 'profit' : 'bill';
  const list = db.customers.map(c => ({ name: c.name, total: mode === 'profit' ? db.works.filter(w => w.customerId === c.id).reduce((s, w) => s + profit(w), 0) : billed(c.id) })).filter(x => x.total > 0).sort((a,b) => b.total - a.total).slice(0, 5);
  const topMax = Math.max(1, list[0]?.total || 1);
  host.innerHTML = list.map((c, i) => `<div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px"><span><strong>#${i+1} ${esc(c.name)}</strong></span><strong style="color:${mode === 'profit' ? '#059669' : 'var(--brand)'}">${money(c.total)}</strong></div><div style="height:6px;background:var(--soft);border-radius:99px;overflow:hidden"><div style="height:100%;width:${(c.total/topMax*100).toFixed(0)}%;background:${mode === 'profit' ? '#10b981' : 'linear-gradient(90deg,#3157e8,#7046e8)'};border-radius:99px"></div></div></div>`).join('') || '<div class="muted">কোনো ডেটা নেই</div>';
}
if ($('topClientMode')) $('topClientMode').onchange = renderTopClients;

let dashFilterFrom = '', dashFilterTo = '';
if ($('applyDashDates')) $('applyDashDates').onclick = () => { dashFilterFrom = $('dashFrom').value; dashFilterTo = $('dashTo').value; render(); };
if ($('clearDashDates')) $('clearDashDates').onclick = () => { dashFilterFrom = ''; dashFilterTo = ''; $('dashFrom').value = ''; $('dashTo').value = ''; render(); };
if ($('repFrom')) $('repFrom').value = today().slice(0, 8) + '01';
if ($('repTo')) $('repTo').value = today();
const inDateRange = (d, from, to) => { const s = String(d || ''); return (!from || s >= from) && (!to || s <= to); };

function renderMonthlyReport() {
  const from = $('repFrom')?.value || '', to = $('repTo')?.value || '';
  const fW = db.works.filter(w => inDateRange(w.date, from, to)), fP = db.payments.filter(p => p.approvalStatus !== 'pending' && inDateRange(p.date, from, to)), fE = db.expenses.filter(e => e.approvalStatus !== 'pending' && inDateRange(e.date, from, to));
  const b = fW.reduce((s, w) => s + bill(w), 0), ts = fW.reduce((s, w) => s + actual(w) + num(w.other), 0) + fE.reduce((s, e) => s + num(e.amount), 0) + fP.reduce((s, p) => s + num(p.fee), 0), pa = fP.reduce((s, p) => s + num(p.amount), 0);
  if ($('repBill')) $('repBill').textContent = money(b); if ($('repPaid')) $('repPaid').textContent = money(pa);
  if (!isStaff()) { if ($('repSpend')) $('repSpend').textContent = money(ts); if ($('repProfit')) $('repProfit').textContent = money(b - ts); }
  if ($('repWorkRows')) $('repWorkRows').innerHTML = fW.map(w => `<tr><td>${esc(w.date)}</td><td><strong>${esc(cname(w.customerId))}</strong><br><small class="muted">${esc(pname(w.pageId))}</small></td><td>${esc(w.name)}</td><td>${money(bill(w))}</td>${isStaff() ? '' : `<td>${money(actual(w))}</td><td class="${profit(w) >= 0 ? 'good' : 'bad'}">${money(profit(w))}</td>`}</tr>`).join('') || `<tr><td colspan="${isStaff() ? 4 : 6}">এই সময়ে কোনো কাজ নেই</td></tr>`;
}
if ($('applyRepDates')) $('applyRepDates').onclick = renderMonthlyReport;
if ($('clearRepDates')) $('clearRepDates').onclick = () => { $('repFrom').value = today().slice(0, 8) + '01'; $('repTo').value = today(); renderMonthlyReport(); };
function checkBackupReminder() { const bar = $('backupReminderBar'); if (!bar) return; if (isStaff() || (!db.customers.length && !db.works.length)) { bar.style.display = 'none'; return; } const last = localStorage.getItem(LAST_BACKUP_KEY), diff = last ? Math.floor((new Date(today()) - new Date(last)) / 86400000) : 99; bar.style.display = (diff >= 7 && !sessionStorage.getItem('backup_dismissed_v72')) ? 'flex' : 'none'; }
function renderPager(hId, cur, tot, fn) { const h = $(hId); if (!h) return; const tp = Math.max(1, Math.ceil(tot / PAGE_SIZE)); if (tot <= PAGE_SIZE) { h.innerHTML = ''; return; } h.innerHTML = `<span>মোট ${tot}টি · পৃষ্ঠা ${cur} / ${tp}</span><div><button type="button" class="secondary sm" ${cur <= 1 ? 'disabled' : ''} onclick="${fn}(${cur - 1})">◀ আগের</button><button type="button" class="secondary sm" ${cur >= tp ? 'disabled' : ''} onclick="${fn}(${cur + 1})">পরের ▶</button></div>`; }
window.setCustPage = p => { custPage = p; render(); }; window.setWorkPage = p => { workPage = p; render(); }; window.setPayPage = p => { payPage = p; render(); };

// Main Render
function render() {
  refresh(); renderCards(); renderTrades(); renderQuotations(); updateNotifications(); renderMonthlyChart(); renderTopClients(); renderActiveCampaignsMonitor(); updateStorageMeter();

  const todayS = today(), tW = db.works.filter(w => w.date === todayS), tE = db.expenses.filter(e => e.approvalStatus !== 'pending' && e.date === todayS).reduce((s, e) => s + num(e.amount), 0), tPF = db.payments.filter(p => p.approvalStatus !== 'pending' && p.date === todayS).reduce((s, p) => s + num(p.fee), 0);
  const tB = tW.reduce((s, w) => s + bill(w), 0), tS = tW.reduce((s, w) => s + actual(w) + num(w.other), 0);
  if ($('mTodayBill')) $('mTodayBill').textContent = money(tB);
  if (!isStaff()) { if ($('mTodaySpend')) $('mTodaySpend').textContent = money(tS); if ($('mTodayProfit')) $('mTodayProfit').textContent = money(tB - tS - tE - tPF); }

  const fW = db.works.filter(w => inDateRange(w.date, dashFilterFrom, dashFilterTo)), fP = db.payments.filter(p => p.approvalStatus !== 'pending' && inDateRange(p.date, dashFilterFrom, dashFilterTo)), fE = db.expenses.filter(e => e.approvalStatus !== 'pending' && inDateRange(e.date, dashFilterFrom, dashFilterTo));
  const totalBill = fW.reduce((s, w) => s + bill(w), 0), totalPaid = fP.reduce((s, p) => s + num(p.amount), 0), isF = Boolean(dashFilterFrom || dashFilterTo);
  const allDue = isF ? Math.max(0, totalBill - totalPaid) : db.customers.reduce((s, c) => s + Math.max(0, -clientBalance(c.id)), 0), allAdv = isF ? Math.max(0, totalPaid - totalBill) : db.customers.reduce((s, c) => s + Math.max(0, clientBalance(c.id)), 0);
  if ($('mBill')) $('mBill').textContent = money(totalBill); if ($('mTotalPaid')) $('mTotalPaid').textContent = money(totalPaid);
  if ($('mAdvanceNote')) $('mAdvanceNote').textContent = allAdv > 0 ? `অ্যাডভান্স: ${money(allAdv)}` : ''; if ($('mDue')) $('mDue').textContent = money(allDue);

  if (!isStaff()) {
    const ad = fW.reduce((s, w) => s + actual(w), 0), oc = fW.reduce((s, w) => s + num(w.other), 0), oe = fE.reduce((s, e) => s + num(e.amount), 0), pf = fP.reduce((s, p) => s + num(p.fee), 0), tp = db.trades.filter(t => inDateRange(t.date, dashFilterFrom, dashFilterTo)).reduce((s, t) => s + tradeProfit(t), 0), netP = totalBill - ad - oc - oe - pf + tp;
    if ($('mActual')) $('mActual').textContent = money(ad); if ($('mProfit')) $('mProfit').textContent = money(netP);
    const ym = todayS.slice(0, 7), mW = db.works.filter(w => String(w.date || '').startsWith(ym)), mB = mW.reduce((s, w) => s + bill(w), 0);
    const mP = mB - mW.reduce((s, w) => s + actual(w) + num(w.other), 0) - db.expenses.filter(e => e.approvalStatus !== 'pending' && String(e.date || '').startsWith(ym)).reduce((s, e) => s + num(e.amount), 0) - db.payments.filter(p => p.approvalStatus !== 'pending' && String(p.date || '').startsWith(ym)).reduce((s, p) => s + num(p.fee), 0) + db.trades.filter(t => String(t.date || '').startsWith(ym)).reduce((s, t) => s + tradeProfit(t), 0);
    const goal = num(db.agency?.monthlyGoal) || 100000, pct = goal > 0 ? Math.max(0, Math.min(100, Math.round((mP / goal) * 100))) : 0, margin = totalBill > 0 ? ((netP / totalBill) * 100).toFixed(1) : '0.0';
    if ($('dashGoalText')) $('dashGoalText').innerHTML = `🎯 চলতি মাসের (${ym}) প্রফিট টার্গেট: <strong>${money(mP)} / ${money(goal)}</strong> (${pct}%)`;
    if ($('dashMarginText')) $('dashMarginText').textContent = `গড় মার্জিন: ${margin}%`;
    if ($('dashGoalBar')) { $('dashGoalBar').style.width = `${pct}%`; $('dashGoalBar').style.background = pct >= 100 ? '#10b981' : (pct >= 50 ? '#3157e8' : '#f59e0b'); }
    if ($('walletListChips')) $('walletListChips').innerHTML = (db.wallets || []).map(w => `<span class="wallet-chip">${esc(w)}${['Cash','Bank'].includes(w) ? '' : `<button type="button" data-wallet="${esc(w)}">✕</button>`}</span>`).join('');
    const wBals = getWalletBalances();
    if ($('walletMetrics')) $('walletMetrics').innerHTML = Object.entries(wBals).map(([k, v]) => `<div class="wallet-card"><small>${esc(k)}</small><strong class="${v < 0 ? 'bad' : 'good'}">${money(v)}</strong></div>`).join('');
    if ($('dashWalletSummary')) $('dashWalletSummary').innerHTML = Object.entries(wBals).filter(([k,v]) => k !== 'Card' || v !== 0).map(([k, v]) => `<div style="padding:5px 9px;border-radius:8px;background:var(--soft);border:1px solid var(--line);font-size:11.5px"><strong>${esc(k)}:</strong> <span class="${v < 0 ? 'bad' : 'good'}">${money(v)}</span></div>`).join('');
    if ($('cashAdjustRows')) $('cashAdjustRows').innerHTML = [...db.cashAdjustments].sort(byDateDesc).map(a => `<tr><td>${esc(a.date)}</td><td><strong>${esc(a.method)}</strong></td><td>${a.type === 'out' ? '<span class="bad">উত্তোলন</span>' : '<span class="good">জমা</span>'}</td><td>${money(a.amount)}</td><td>${esc(a.note || '—')}</td><td><button type="button" class="danger sm perm-del" onclick="deleteCashAdjust('${a.id}')">মুছুন</button></td></tr>`).join('') || '<tr><td colspan="6">নেই</td></tr>';
  }

  const cQ = ($('customerSearch')?.value || '').toLowerCase(), cSF = $('custStageFilter')?.value || '';
  const fCust = db.customers.filter(c => (!cSF || (c.stage || 'Active Client') === cSF) && (c.name.toLowerCase().includes(cQ) || (c.phone || '').includes(cQ)));
  const tCP = Math.max(1, Math.ceil(fCust.length / PAGE_SIZE)); if (custPage > tCP) custPage = tCP;
  if ($('customerRows')) $('customerRows').innerHTML = fCust.slice((custPage - 1) * PAGE_SIZE, custPage * PAGE_SIZE).map((c, idx) => {
    const b = billed(c.id), p = paid(c.id), bal = p - b, chk = { ...DEFAULT_CHECKLIST(), ...(c.checklist || {}) }, doneC = Object.values(chk).filter(Boolean).length;
    const balH = bal < 0 ? `<span class="bad">বকেয়া: ${money(-bal)}</span>` : (bal > 0 ? `<span class="good">অ্যাডভান্স: ${money(bal)}</span>` : `<span class="muted">৳0</span>`);
    return `<tr><td>#${(custPage - 1) * PAGE_SIZE + idx + 1}</td><td><strong>${esc(c.name)}</strong><br><span class="badge-admin" style="font-size:10px">${esc(c.stage || 'Active Client')}</span></td><td>${esc(c.phone || '—')}<br><small class="muted">Setup: ${doneC}/5 ✓</small></td><td>${db.pages.filter(pg => pg.customerId === c.id).length}</td><td>${money(b)}</td><td>${money(p)}</td><td>${balH}</td><td><button type="button" class="secondary sm" onclick="openClientProfile('${c.id}')">👤 প্রোফাইল</button><button type="button" class="secondary sm" onclick="openInvoice('${c.id}')">📄 ইনভয়েস</button><button type="button" class="secondary sm" onclick="openMsgTemplates('${c.id}')">💬</button><button type="button" class="secondary sm perm-edit" onclick="openEditCustomerModal('${c.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deleteCustomer('${c.id}')">মুছুন</button></td></tr>`;
  }).join('') || `<tr><td colspan="8">কোনো কাস্টমার নেই</td></tr>`;
  renderPager('custPager', custPage, fCust.length, 'setCustPage');

  if ($('pageRows')) $('pageRows').innerHTML = db.pages.map((p, i) => `<tr><td>#${i+1}</td><td>${esc(cname(p.customerId))}</td><td><strong>${esc(p.name)}</strong></td><td>${p.link ? `<a href="${esc(p.link)}" target="_blank">লিংক ↗</a>` : '—'}</td><td>${p.adId ? `<code>${esc(p.adId)}</code> <button type="button" class="secondary sm" onclick="copyText('${esc(p.adId).replace(/'/g, "\\'")}','Ad ID')">📋</button>` : '—'}</td><td>${p.pixelId ? `<code>${esc(p.pixelId)}</code> <button type="button" class="secondary sm" onclick="copyText('${esc(p.pixelId).replace(/'/g, "\\'")}','Pixel ID')">📋</button>` : '—'}</td><td><button type="button" class="secondary sm perm-edit" onclick="openEditPageModal('${p.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deletePage('${p.id}')">মুছুন</button></td></tr>`).join('') || `<tr><td colspan="7">নেই</td></tr>`;
  const cc = id => db.cards.find(x => x.id === id)?.name || '—';
  if ($('adAccountRows')) $('adAccountRows').innerHTML = db.adAccounts.map(a => `<tr><td><strong>${esc(a.name)}</strong><br><small class="muted">${esc(a.bm || '')}</small></td><td>${a.adId ? `<code>${esc(a.adId)}</code>` : '—'}</td><td>${esc(cc(a.cardId))}</td><td>${usd(a.threshold)} / <span class="${num(a.unpaid) > 0 ? 'bad' : ''}">${usd(a.unpaid)}</span></td><td><span class="${a.status === 'Active' ? 'badge-success' : (a.status === 'Disabled' ? 'badge-danger' : 'badge-warn')}" style="cursor:pointer" onclick="cycleAdAccountStatus('${a.id}')">${esc(a.status)}</span></td><td><button type="button" class="secondary sm perm-edit" onclick="openEditAdAccountModal('${a.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deleteAdAccount('${a.id}')">মুছুন</button></td></tr>`).join('') || `<tr><td colspan="6">নেই</td></tr>`;
  if ($('rateRows')) $('rateRows').innerHTML = [...db.rates].sort(byDateDesc).map(r => `<tr><td>${esc(r.date)}</td><td><strong>${money(r.value)}</strong></td><td>${esc(r.note || '—')}</td><td><button type="button" class="secondary sm perm-edit" onclick="openEditRateModal('${r.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deleteRate('${r.id}')">মুছুন</button></td></tr>`).join('') || `<tr><td colspan="4">নেই</td></tr>`;

  const wQ = ($('workSearch')?.value || '').toLowerCase(), sF = $('workStatusFilter')?.value || '', cF = $('workCustomerFilter')?.value || '';
  const fWL = [...db.works].sort(byDateDesc).filter(w => (w.name.toLowerCase().includes(wQ) || cname(w.customerId).toLowerCase().includes(wQ) || pname(w.pageId).toLowerCase().includes(wQ)) && (!sF || (w.status || 'running') === sF) && (!cF || w.customerId === cF));
  const tWP = Math.max(1, Math.ceil(fWL.length / PAGE_SIZE)); if (workPage > tWP) workPage = tWP;
  if ($('workRows')) $('workRows').innerHTML = fWL.slice((workPage - 1) * PAGE_SIZE, workPage * PAGE_SIZE).map((w, idx) => {
    const st = w.status || 'running', stT = st === 'completed' ? 'সম্পন্ন' : (st === 'paused' ? 'পজ' : 'চলমান'), stC = st === 'completed' ? 'status-completed' : (st === 'paused' ? 'status-paused' : 'status-running');
    const resCnt = num(w.conversions), cpr = resCnt > 0 ? usd(num(w.actualDollar) / resCnt) : '—', svc = workServiceCharge(w);
    const polB = (w.policyIssue && w.policyIssue !== 'None') ? `<br><span class="badge-danger" style="font-size:10px">⚠️ ${esc(w.policyIssue)}</span>` : '';
    return `<tr><td><input type="checkbox" class="work-row-chk row-chk" data-id="${w.id}" ${selectedWorkIds.has(w.id) ? 'checked' : ''} onchange="toggleWorkSelect('${w.id}',this.checked)"></td><td>#${(workPage - 1) * PAGE_SIZE + idx + 1}</td><td>${esc(w.date)}</td><td><strong>${esc(cname(w.customerId))}</strong><br><small class="muted">${esc(pname(w.pageId))}</small></td><td>${esc(w.name)}${w.objective ? ` <small class="badge-admin" style="font-size:10px">${esc(w.objective)}</small>` : ''}${polB}${w.staffName ? `<br><small class="muted">👤 ${esc(w.staffName)}</small>` : ''}</td><td>${usd(w.actualDollar)} <small class="muted">/ ${usd(w.dollar)}</small>${progressBarHtml(num(w.actualDollar), num(w.dollar))}</td><td>${money(bill(w))}${svc > 0 ? `<br><small class="muted">+চার্জ ${money(svc)}</small>` : ''}</td>${isStaff() ? '' : `<td>${money(actual(w))}</td><td class="${profit(w) >= 0 ? 'good' : 'bad'}">${money(profit(w))}</td>`}<td><small>Res: <strong>${resCnt}</strong><br>CPR: <strong>${cpr}</strong></small></td><td><span class="badge-status ${stC}">${stT}</span></td><td><button type="button" class="secondary sm" onclick="openWorkPerfReport('${w.id}')" title="ক্লায়েন্ট রিপোর্ট">📊</button><button type="button" class="secondary sm" onclick="copyWorkBrief('${w.id}')" title="ব্রিফ কপি">📋</button><button type="button" class="secondary sm" onclick="openMsgTemplates('${w.customerId}','${w.id}')" title="মেসেজ">💬</button><button type="button" class="secondary sm perm-edit" onclick="quickAddSpend('${w.id}')">+$</button><button type="button" class="secondary sm perm-edit" onclick="openEditWorkModal('${w.id}')">✏️</button><button type="button" class="secondary sm perm-edit" onclick="renewWork('${w.id}')">🔄</button><button type="button" class="danger sm perm-del" onclick="deleteWork('${w.id}')">✕</button></td></tr>`;
  }).join('') || `<tr><td colspan="${isStaff() ? 10 : 12}">কোনো কাজ নেই</td></tr>`;
  renderPager('workPager', workPage, fWL.length, 'setWorkPage'); updateWorkBulkBar();

  if ($('pixelListRows')) $('pixelListRows').innerHTML = db.pages.filter(p => p.pixelId).map(p => `<tr><td>${esc(cname(p.customerId))}</td><td>${esc(p.name)}</td><td><code>${esc(p.pixelId)}</code></td><td><span class="badge-success">Active</span></td><td><button type="button" class="secondary sm" onclick="$('genPixelId').value='${esc(p.pixelId).replace(/'/g, "\\'")}';generatePixelCode()">কোড</button></td></tr>`).join('') || `<tr><td colspan="5">নেই</td></tr>`;

  const expQ = ($('expSearch')?.value || '').toLowerCase(), expCat = $('expCatFilter')?.value || '';
  const fExpsL = [...db.expenses].sort(byDateDesc).filter(e => (!expCat || e.category === expCat) && (!expQ || e.title.toLowerCase().includes(expQ) || (e.note || '').toLowerCase().includes(expQ)));
  if ($('expenseRows')) $('expenseRows').innerHTML = fExpsL.map(e => `<tr><td>${esc(e.date)}</td><td><strong>${esc(e.title)}</strong>${e.approvalStatus === 'pending' ? ' <span class="badge-warn">Pending</span>' : ''}</td><td><span class="badge-admin">${esc(e.category)}</span> <small class="muted">${esc(e.method || 'Cash')}</small></td><td class="bad">${money(e.amount)}</td><td>${esc(e.note || '—')}</td><td><button type="button" class="secondary sm perm-edit" onclick="openEditExpenseModal('${e.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deleteExpense('${e.id}')">মুছুন</button></td></tr>`).join('') || `<tr><td colspan="6">নেই</td></tr>`;
  if ($('totalExpenseSummary')) $('totalExpenseSummary').textContent = `মোট খরচ: ${money(fExpsL.reduce((s, e) => s + num(e.amount), 0))}`;
  if ($('expenseCategorySummary')) { const ct = {}, as = db.expenses.reduce((s, x) => s + num(x.amount), 0); db.expenses.forEach(ex => { ct[ex.category] = (ct[ex.category] || 0) + num(ex.amount); }); $('expenseCategorySummary').innerHTML = Object.entries(ct).sort((a,b) => b[1] - a[1]).map(([c, a]) => `<span class="badge-admin" style="padding:6px 11px;font-size:12px">${esc(c)}: <strong>${money(a)}</strong> (${as > 0 ? ((a/as)*100).toFixed(0) : 0}%)</span>`).join(''); }
  updatePaymentCustomerStatus(); checkBackupReminder();

  const payQ = ($('paySearch')?.value || '').toLowerCase(), payM = $('payMethodFilter')?.value || '';
  const sPays = [...db.payments].sort(byDateDesc).filter(p => (!payM || p.method === payM) && (!payQ || cname(p.customerId).toLowerCase().includes(payQ) || (p.ref || '').toLowerCase().includes(payQ) || (p.note || '').toLowerCase().includes(payQ)));
  const tPP = Math.max(1, Math.ceil(sPays.length / PAGE_SIZE)); if (payPage > tPP) payPage = tPP;
  if ($('paymentRows')) $('paymentRows').innerHTML = sPays.slice((payPage - 1) * PAGE_SIZE, payPage * PAGE_SIZE).map(p => `<tr><td>${esc(p.date)}</td><td><strong>${esc(cname(p.customerId))}</strong>${p.approvalStatus === 'pending' ? ' <span class="badge-warn">Pending</span>' : ''}</td><td class="good">${money(p.amount)}${num(p.fee) > 0 ? `<br><small class="bad">-${money(p.fee)}</small>` : ''}</td><td>${esc(p.method)}</td><td>${esc(p.ref || p.note || '—')}</td><td><button type="button" class="secondary sm" onclick="openPaymentReceipt('${p.id}')">🧾 রিসিপ্ট</button><button type="button" class="secondary sm perm-edit" onclick="openEditPaymentModal('${p.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deletePayment('${p.id}')">মুছুন</button></td></tr>`).join('') || `<tr><td colspan="6">নেই</td></tr>`;
  renderPager('payPager', payPage, sPays.length, 'setPayPage');

  if (!isStaff()) {
    if ($('staffCommRows')) { const sMap = {}; db.works.forEach(w => { const k = w.staffName || 'অ্যাসাইন নেই'; if (!sMap[k]) sMap[k] = { name: k, count: 0, usd: 0, bill: 0, profit: 0, comm: 0 }; sMap[k].count++; sMap[k].usd += num(w.actualDollar); sMap[k].bill += bill(w); sMap[k].profit += profit(w); sMap[k].comm += workCommission(w); }); $('staffCommRows').innerHTML = Object.values(sMap).sort((a,b) => b.profit - a.profit).map(s => `<tr><td><strong>${esc(s.name)}</strong></td><td>${s.count} টি</td><td>${usd(s.usd)}</td><td>${money(s.bill)}</td><td class="${s.profit >= 0 ? 'good' : 'bad'}">${money(s.profit)}</td><td style="color:var(--brand);font-weight:700">${money(s.comm)}</td></tr>`).join('') || `<tr><td colspan="6">নেই</td></tr>`; }
    if ($('reportRows')) $('reportRows').innerHTML = db.customers.map(c => { const b = billed(c.id), p = paid(c.id), bal = p - b, cw = db.works.filter(w => w.customerId === c.id), tu = cw.reduce((s, w) => s + num(w.actualDollar), 0), pr = cw.reduce((s, w) => s + profit(w), 0); return `<tr><td><strong>${esc(c.name)}</strong></td><td>${usd(tu)}</td><td>${money(b)}</td><td>${money(p)}</td><td>${bal < 0 ? `<span class="bad">বকেয়া: ${money(-bal)}</span>` : (bal > 0 ? `<span class="good">অ্যাড: ${money(bal)}</span>` : '৳0')}</td><td class="${pr >= 0 ? 'good' : 'bad'}">${money(pr)}</td></tr>`; }).join('') || `<tr><td colspan="6">নেই</td></tr>`;
  }
  renderDues();
}

if ($('customerSearch')) $('customerSearch').oninput = () => { custPage = 1; render(); };
if ($('custStageFilter')) $('custStageFilter').onchange = () => { custPage = 1; render(); };
if ($('workSearch')) $('workSearch').oninput = () => { workPage = 1; render(); };
if ($('workStatusFilter')) $('workStatusFilter').onchange = () => { workPage = 1; render(); };
if ($('workCustomerFilter')) $('workCustomerFilter').onchange = () => { workPage = 1; render(); };
if ($('expSearch')) $('expSearch').oninput = render; if ($('expCatFilter')) $('expCatFilter').onchange = render;
if ($('paySearch')) $('paySearch').oninput = () => { payPage = 1; render(); }; if ($('payMethodFilter')) $('payMethodFilter').onchange = () => { payPage = 1; render(); };
if ($('dueSearch')) $('dueSearch').oninput = renderDues;
if ($('trainingSearch')) $('trainingSearch').oninput = e => { const q = e.target.value.toLowerCase(); document.querySelectorAll('#trainingCards .guide-card').forEach(c => { c.style.display = (!q || c.textContent.toLowerCase().includes(q)) ? 'block' : 'none'; }); };

// Admin Panel
if ($('auRole')) $('auRole').onchange = () => { if ($('auPermsWrap')) $('auPermsWrap').style.display = $('auRole').value === 'staff' ? 'block' : 'none'; };
if ($('euRole')) $('euRole').onchange = () => { if ($('euPermsWrap')) $('euPermsWrap').style.display = $('euRole').value === 'staff' ? 'block' : 'none'; };
if ($('adminCreateUserForm')) $('adminCreateUserForm').onsubmit = e => {
  e.preventDefault(); if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error');
  const n = $('auName').value.trim(), u = $('auUsername').value.trim().toLowerCase(), ct = $('auContact').value.trim(), ps = $('auPass').value, r = $('auRole').value;
  if (!n || !u || ps.length < 6 || u === 'admin') return toast('সঠিক তথ্য দিন!', 'error');
  const accs = readLocalAccounts(); if (accs.some(a => a.username === u)) return toast('ইউজারনেম আগেই আছে!', 'error');
  const perms = r === 'staff' ? { canDelete: Boolean($('auPermDel')?.checked), canEdit: Boolean($('auPermEdit')?.checked), canPayments: Boolean($('auPermPay')?.checked), canExpenses: Boolean($('auPermExp')?.checked) } : null;
  const isE = ct.includes('@'), next = Number(localStorage.getItem(NEXTUSERIDKEY) || 2), na = { id: uid(), updatedAt: Date.now(), userNumber: next, name: n, username: u, email: isE ? ct.toLowerCase() : '', phone: isE ? '' : ct, password: hashPass(ps), role: r, plan: $('auPlan')?.value || 'Lifetime', expiryDate: $('auExpiry')?.value || '', perms, status: 'active', lastLogin: 'কখনো না', loginCount: 0 };
  accs.push(na); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs)); localStorage.setItem(NEXTUSERIDKEY, String(next + 1));
  localStorage.setItem('ads_hisab_user_profile_v72_' + na.id, JSON.stringify({ name: n, email: na.email, phone: na.phone, pic: '' }));
  e.target.reset(); if ($('auPermEdit')) $('auPermEdit').checked = true; if ($('auPermPay')) $('auPermPay').checked = true; if ($('auPermExp')) $('auPermExp').checked = true; if ($('auPermsWrap')) $('auPermsWrap').style.display = 'block';
  renderAdminPanel(); triggerAccountCloudSync(); toast(`${n} তৈরি ও সিঙ্ক হয়েছে!`);
};
window.openEditUserModal = id => {
  if (!isSuperAdmin()) return; const a = readLocalAccounts().find(x => x.id === id); if (!a) return;
  $('euId').value = a.id; $('euName').value = a.name; $('euUsername').value = a.username; $('euEmail').value = a.email || ''; $('euPhone').value = a.phone || '';
  $('euRole').value = a.role || 'user'; $('euStatus').value = a.status || 'active'; if ($('euPlan')) $('euPlan').value = a.plan || 'Lifetime'; if ($('euExpiry')) $('euExpiry').value = a.expiryDate || ''; $('euNewPass').value = '';
  const p = { canDelete: false, canEdit: true, canPayments: true, canExpenses: true, ...(a.perms || {}) };
  $('euPermDel').checked = Boolean(p.canDelete); $('euPermEdit').checked = Boolean(p.canEdit); $('euPermPay').checked = Boolean(p.canPayments); $('euPermExp').checked = Boolean(p.canExpenses);
  $('euPermsWrap').style.display = $('euRole').value === 'staff' ? 'block' : 'none'; $('editUserModal').style.display = 'flex';
};
if ($('editUserForm')) $('editUserForm').onsubmit = e => {
  e.preventDefault(); if (!isSuperAdmin()) return; const id = $('euId').value, accs = readLocalAccounts(), idx = accs.findIndex(a => a.id === id); if (idx === -1) return;
  const nu = $('euUsername').value.trim().toLowerCase(); if (nu === 'admin' || accs.some(a => a.id !== id && a.username === nu)) return toast('ইউজারনেম ভুল বা আগেই নেওয়া!', 'error');
  const np = $('euNewPass').value.trim(); if (np && np.length < 6) return toast('৬+ অক্ষর দিন!', 'error');
  accs[idx].name = $('euName').value.trim(); accs[idx].username = nu; accs[idx].email = $('euEmail').value.trim().toLowerCase(); accs[idx].phone = $('euPhone').value.trim();
  accs[idx].role = $('euRole').value; accs[idx].status = $('euStatus').value; accs[idx].plan = $('euPlan')?.value || 'Lifetime'; accs[idx].expiryDate = $('euExpiry')?.value || ''; accs[idx].updatedAt = Date.now();
  if (np) accs[idx].password = hashPass(np);
  if (accs[idx].role === 'staff') accs[idx].perms = { canDelete: $('euPermDel').checked, canEdit: $('euPermEdit').checked, canPayments: $('euPermPay').checked, canExpenses: $('euPermExp').checked };
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs)); closeModal('editUserModal'); renderAdminPanel(); triggerAccountCloudSync(); toast('আপডেট হয়েছে!');
};
if ($('saveRulesForm')) $('saveRulesForm').onsubmit = e => {
  e.preventDefault(); if (!isSuperAdmin()) return; const meta = readSuperAdminMeta(); meta.globalNotice = $('saGlobalNotice')?.value.trim() || '';
  meta.conditions = { enable24hLock: Boolean($('cond24hLock')?.checked), minBillRate: num($('condMinRate')?.value), blockLoss: Boolean($('condBlockLoss')?.checked), defaultDueLimit: num($('condDueLimit')?.value), requireApproval: Boolean($('condRequireApproval')?.checked), masterPin: $('condMasterPin')?.value.trim() || '' };
  writeSuperAdminMeta(meta); applyGlobalNotice(); triggerAccountCloudSync(); toast('শর্তাবলি ও নোটিশ সেভ হয়েছে!');
};
window.impersonateUser = id => { if (!isSuperAdmin()) return; const a = readLocalAccounts().find(x => x.id === id); if (!a) return; if (!realSuperAdmin) realSuperAdmin = activeAccount; activeAccount = a; applyPermissionClasses(); activateAccountData(a); if ($('impersonateBanner')) $('impersonateBanner').style.display = 'flex'; if ($('impersonateName')) $('impersonateName').textContent = `${a.name} (@${a.username})`; updateHeaderAndProfile(); goToSection('dash'); };
if ($('exitImpersonateBtn')) $('exitImpersonateBtn').onclick = () => { if (!realSuperAdmin) return; activeAccount = realSuperAdmin; realSuperAdmin = null; if ($('impersonateBanner')) $('impersonateBanner').style.display = 'none'; applyPermissionClasses(); activateAccountData(activeAccount); updateHeaderAndProfile(); goToSection('adminPanel'); };
window.switchAdminSubTab = tabName => {
  if (!isSuperAdmin() && ['users','rules','approvals','trash','cloud'].includes(tabName)) tabName = 'help';
  const map = { users: ['adminTabUsersBtn','adminUsersSubPanel'], rules: ['adminTabRulesBtn','adminRulesSubPanel'], approvals: ['adminTabApprovalsBtn','adminApprovalsSubPanel'], help: ['adminTabHelpBtn','adminHelpSubPanel'], trash: ['adminTabTrashBtn','adminTrashSubPanel'], cloud: ['adminTabCloudBtn','adminCloudSubPanel'], logs: ['adminTabLogsBtn','adminLogsSubPanel'] };
  Object.entries(map).forEach(([k, [b, p]]) => { if ($(b)) $(b).classList.toggle('active', k === tabName); if ($(p)) $(p).style.display = k === tabName ? 'block' : 'none'; });
  renderAdminPanel();
};
window.toggleUserStatus = id => { if (!isSuperAdmin()) return; const accs = readLocalAccounts(), a = accs.find(x => x.id === id); if (!a) return; a.status = a.status === 'suspended' ? 'active' : 'suspended'; a.updatedAt = Date.now(); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs)); triggerAccountCloudSync(); renderAdminPanel(); toast('স্ট্যাটাস আপডেট!'); };
window.deleteAccount = id => { if (!isSuperAdmin() || !confirm('অ্যাকাউন্ট ডিলিট করবেন?')) return; localStorage.setItem(ACCOUNTSKEY, JSON.stringify(readLocalAccounts().filter(a => a.id !== id))); localStorage.removeItem('ads_hisab_user_data_v72_' + id); localStorage.removeItem('ads_hisab_user_profile_v72_' + id); triggerAccountCloudSync(); renderAdminPanel(); toast('ডিলিট হয়েছে!', 'warn'); };

function renderAdminPanel() {
  updateStorageMeter(); renderPortalOrders();
  if (isSuperAdmin()) {
    const accs = readLocalAccounts(), meta = readSuperAdminMeta(), rules = getRules();
    if ($('saTotal')) $('saTotal').textContent = accs.length + 1; if ($('saAdmins')) $('saAdmins').textContent = 1 + accs.filter(a => a.role === 'admin' || a.role === 'staff').length; if ($('saUsers')) $('saUsers').textContent = accs.filter(a => a.role === 'user').length; if ($('saSuspended')) $('saSuspended').textContent = accs.filter(a => a.status === 'suspended' || isAccountExpired(a)).length;
    if ($('saGlobalNotice') && document.activeElement !== $('saGlobalNotice')) $('saGlobalNotice').value = meta.globalNotice || '';
    if ($('condMinRate') && document.activeElement !== $('condMinRate')) $('condMinRate').value = num(rules.minBillRate);
    if ($('condDueLimit') && document.activeElement !== $('condDueLimit')) $('condDueLimit').value = num(rules.defaultDueLimit);
    if ($('condMasterPin') && document.activeElement !== $('condMasterPin')) $('condMasterPin').value = rules.masterPin || '';
    if ($('cond24hLock')) $('cond24hLock').checked = Boolean(rules.enable24hLock); if ($('condBlockLoss')) $('condBlockLoss').checked = Boolean(rules.blockLoss); if ($('condRequireApproval')) $('condRequireApproval').checked = Boolean(rules.requireApproval);
    if ($('saUserRows')) {
      const ap = readProfile();
      $('saUserRows').innerHTML = `<tr><td>AS-00001</td><td><strong>${esc(ap.name || 'Super Admin')}</strong> <small class="muted">(@admin)</small></td><td>${esc(ap.email || '')}<br><small>${esc(ap.phone || '')}</small></td><td><span class="badge-success">Super Admin</span></td><td><small>${esc(meta.lastLogin || '')}<br>লগইন: ${num(meta.loginCount)}</small></td><td><span class="badge-success">Active</span></td><td>—</td></tr>` +
        accs.map(a => { const exp = isAccountExpired(a), rB = a.role === 'admin' ? '<span class="badge-admin">Admin</span>' : (a.role === 'staff' ? '<span class="badge-status status-running">Staff</span>' : '<span class="badge-success">User</span>'); return `<tr><td>AS-${String(a.userNumber || 2).padStart(5, '0')}</td><td><strong>${esc(a.name)}</strong><br><small>@${esc(a.username)}</small></td><td>${esc(a.email || '—')}<br><small>${esc(a.phone || '—')}</small></td><td>${rB}<br><small class="${exp ? 'bad' : 'muted'}">${esc(a.plan || 'Lifetime')} ${a.expiryDate || ''}</small></td><td><small>${esc(a.lastLogin || '—')}<br>মোট: ${num(a.loginCount)}</small></td><td>${a.status === 'suspended' ? '<span class="badge-danger">Suspended</span>' : (exp ? '<span class="badge-danger">Expired</span>' : '<span class="badge-success">Active</span>')}</td><td>${a.role !== 'staff' ? `<button type="button" class="secondary sm" onclick="impersonateUser('${a.id}')">👁️</button>` : ''}<button type="button" class="secondary sm" onclick="openEditUserModal('${a.id}')">✏️</button><button type="button" class="warn sm" onclick="toggleUserStatus('${a.id}')">${a.status === 'suspended' ? 'আনব্লক' : 'ব্লক'}</button><button type="button" class="danger sm" onclick="deleteAccount('${a.id}')">✕</button></td></tr>`; }).join('');
    }
    const pP = db.payments.filter(p => p.approvalStatus === 'pending'), pE = db.expenses.filter(e => e.approvalStatus === 'pending'), tP = pP.length + pE.length;
    if ($('approvalBadge')) { $('approvalBadge').style.display = tP ? 'inline-block' : 'none'; $('approvalBadge').textContent = tP; }
    if ($('approvalRows')) $('approvalRows').innerHTML = [...pP.map(p => `<tr><td><span class="badge-success">পেমেন্ট</span></td><td>${esc(p.date)}</td><td><strong>${esc(cname(p.customerId))}</strong></td><td class="good">${money(p.amount)}</td><td>${esc(p.method)}</td><td><button type="button" class="sm" style="background:#059669" onclick="approvePending('payment','${p.id}')">✓</button><button type="button" class="danger sm" onclick="rejectPending('payment','${p.id}')">✕</button></td></tr>`), ...pE.map(e => `<tr><td><span class="badge-danger">খরচ</span></td><td>${esc(e.date)}</td><td><strong>${esc(e.title)}</strong></td><td class="bad">${money(e.amount)}</td><td>${esc(e.method || 'Cash')}</td><td><button type="button" class="sm" style="background:#059669" onclick="approvePending('expense','${e.id}')">✓</button><button type="button" class="danger sm" onclick="rejectPending('expense','${e.id}')">✕</button></td></tr>`)].join('') || '<tr><td colspan="6">কোনো পেন্ডিং এন্ট্রি নেই ✅</td></tr>';
    if ($('trashRows')) $('trashRows').innerHTML = (db.trash || []).map(t => `<tr><td><span class="badge-status status-running">${esc(t.type)}</span></td><td><strong>${esc(t.label)}</strong></td><td><small>${esc(t.deletedAt)}<br>${esc(t.deletedBy)}</small></td><td><button type="button" class="secondary sm" onclick="restoreTrash('${t.id}')">♻️</button><button type="button" class="danger sm" onclick="permDeleteTrash('${t.id}')">✕</button></td></tr>`).join('') || '<tr><td colspan="4">খালি 🎉</td></tr>';
    const sc = readCloudSync(); if ($('csUrl') && document.activeElement !== $('csUrl')) $('csUrl').value = sc.url || ''; if ($('csSecret') && document.activeElement !== $('csSecret')) $('csSecret').value = sc.secret || ''; if ($('csAutoSync')) $('csAutoSync').checked = Boolean(sc.autoSync); if ($('csLastSyncText')) $('csLastSyncText').textContent = sc.lastSync ? `সর্বশেষ সিঙ্ক: ${sc.lastSync}` : '';
  }
  const helps = readHelpRequests().filter(h => isSuperAdmin() || h.target !== 'Super Admin'), oc = helps.filter(h => h.status === 'open').length;
  if ($('helpOpenBadge')) { $('helpOpenBadge').style.display = (oc + portalOrders.length) ? 'inline-block' : 'none'; $('helpOpenBadge').textContent = oc + portalOrders.length; }
  if ($('helpReqRows')) $('helpReqRows').innerHTML = helps.map(h => { const wa = normalizeBdPhone(h.contact); return `<tr><td><small>${esc(h.time)}</small></td><td><span class="badge-admin">${esc(h.target)}</span><br><strong>${esc(h.topic)}</strong></td><td><strong>${esc(h.name)}</strong><br><small>${esc(h.contact)}</small></td><td style="max-width:250px;white-space:normal">${esc(h.message)}</td><td>${h.status === 'resolved' ? '<span class="badge-success">সমাধান</span>' : '<span class="badge-danger">অপেক্ষমাণ</span>'}</td><td>${wa.length >= 11 ? `<a href="https://wa.me/${wa}" target="_blank" style="text-decoration:none"><button type="button" class="secondary sm">📲</button></a>` : ''}${isSuperAdmin() ? `<button type="button" class="warn sm" onclick="quickTempResetFromHelp('${h.id}')">🔑</button>` : ''}<button type="button" class="secondary sm" onclick="resolveHelpReq('${h.id}')">✓</button><button type="button" class="danger sm" onclick="deleteHelpReq('${h.id}')">✕</button></td></tr>`; }).join('') || '<tr><td colspan="6">কোনো মেসেজ নেই</td></tr>';
  if ($('activityLogRows')) $('activityLogRows').innerHTML = db.activityLogs.map(l => `<tr><td>${esc(l.time)}</td><td>${esc(l.text)}</td></tr>`).join('') || '<tr><td colspan="2">লগ নেই</td></tr>';
}

// Merge & Cloud Sync
function mergeArrayById(arrA, arrB, delM) { const map = new Map(), put = it => { if (!it?.id) return; const dt = num(delM[it.id]), itT = num(it.updatedAt); if (dt > 0 && dt >= itT) return; const pv = map.get(it.id); if (!pv || itT >= num(pv.updatedAt)) map.set(it.id, it); }; (arrA || []).forEach(put); (arrB || []).forEach(put); return Array.from(map.values()); }
function mergeDbObjects(lR, rR) {
  const L = normalizeDb(lR), R = normalizeDb(rR), del = { ...L.deletedIds }; Object.entries(R.deletedIds).forEach(([k, v]) => { del[k] = Math.max(num(del[k]), num(v)); });
  const cols = ['rates','customers','pages','works','payments','trades','quotations','cardDeposits','cardTransfers','cardRefunds','adAccounts','cashAdjustments','cards','expenses','trash'];
  const m = blank(); m.updatedAt = Math.max(L.updatedAt, R.updatedAt); m.deletedIds = del; m.wallets = [...new Set([...(L.wallets || []), ...(R.wallets || [])])];
  cols.forEach(c => { m[c] = mergeArrayById(L[c], R[c], del); }); m.reminderLogs = { ...R.reminderLogs, ...L.reminderLogs }; m.agency = L.updatedAt >= R.updatedAt ? L.agency : R.agency;
  const ls = new Set(); m.activityLogs = [...L.activityLogs, ...R.activityLogs].filter(l => { const k = `${l.time}|${l.text}`; if (ls.has(k)) return false; ls.add(k); return true; }).slice(0, 150); return m;
}
function mergeMasterSnapshots(lS, rS) {
  if (!rS || rS.type !== 'ads_hisab_master_backup_v72') return lS;
  const am = new Map(); [...(rS.accounts || []), ...(lS.accounts || [])].forEach(a => { if (!a?.id) return; const pv = am.get(a.id); if (!pv || num(a.updatedAt) >= num(pv.updatedAt)) am.set(a.id, a); });
  const uDbs = {}, ids = new Set([...Object.keys(lS.userDbs || {}), ...Object.keys(rS.userDbs || {})]);
  ids.forEach(id => { uDbs[id] = (lS.userDbs?.[id] && rS.userDbs?.[id]) ? mergeDbObjects(lS.userDbs[id], rS.userDbs[id]) : normalizeDb(lS.userDbs?.[id] || rS.userDbs?.[id]); });
  const hm = new Map(); [...(rS.helpRequests || []), ...(lS.helpRequests || [])].forEach(h => { if (h?.id) hm.set(h.id, h); });
  return { type: 'ads_hisab_master_backup_v72', snapshotTs: Date.now(), exportedAt: new Date().toISOString(), accounts: Array.from(am.values()), nextUserId: String(Math.max(num(lS.nextUserId), num(rS.nextUserId)) || 2), superAdminPass: num(rS.snapshotTs) > num(lS.snapshotTs) ? (rS.superAdminPass || lS.superAdminPass) : lS.superAdminPass, superAdminMeta: num(rS.snapshotTs) > num(lS.snapshotTs) ? (rS.superAdminMeta || lS.superAdminMeta) : lS.superAdminMeta, masterDb: mergeDbObjects(lS.masterDb, rS.masterDb), masterProfile: (lS.masterProfile && Object.keys(lS.masterProfile).length) ? lS.masterProfile : (rS.masterProfile || {}), userDbs: uDbs, userProfiles: { ...(rS.userProfiles || {}), ...(lS.userProfiles || {}) }, helpRequests: Array.from(hm.values()).slice(0, 100) };
}
function buildMasterSnapshot() {
  const accs = readLocalAccounts(), uDbs = {}, uPr = {};
  accs.forEach(a => { try { const d = localStorage.getItem('ads_hisab_user_data_v72_' + a.id); if (d) uDbs[a.id] = JSON.parse(d); } catch (e) {} try { const p = localStorage.getItem('ads_hisab_user_profile_v72_' + a.id); if (p) uPr[a.id] = JSON.parse(p); } catch (e) {} });
  return { type: 'ads_hisab_master_backup_v72', snapshotTs: Date.now(), exportedAt: new Date().toISOString(), accounts: accs, nextUserId: localStorage.getItem(NEXTUSERIDKEY) || '2', superAdminPass: localStorage.getItem(PASSKEY) || hashPass('123456789'), superAdminMeta: readSuperAdminMeta(), masterDb: normalizeDb(JSON.parse(localStorage.getItem(MASTER_DB_KEY) || '{}')), masterProfile: (() => { try { return JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_legacy-super-admin') || '{}'); } catch (e) { return {}; } })(), userDbs: uDbs, userProfiles: uPr, helpRequests: readHelpRequests() };
}
function applyMasterSnapshot(snap) {
  if (!snap || snap.type !== 'ads_hisab_master_backup_v72') throw new Error('Invalid');
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(Array.isArray(snap.accounts) ? snap.accounts : []));
  if (snap.nextUserId) localStorage.setItem(NEXTUSERIDKEY, String(snap.nextUserId)); if (snap.superAdminPass) localStorage.setItem(PASSKEY, snap.superAdminPass);
  if (snap.superAdminMeta) writeSuperAdminMeta(snap.superAdminMeta); if (snap.masterDb) localStorage.setItem(MASTER_DB_KEY, JSON.stringify(normalizeDb(snap.masterDb)));
  if (snap.masterProfile) localStorage.setItem('ads_hisab_user_profile_v72_legacy-super-admin', JSON.stringify(snap.masterProfile));
  Object.entries(snap.userDbs || {}).forEach(([id, data]) => localStorage.setItem('ads_hisab_user_data_v72_' + id, JSON.stringify(normalizeDb(data))));
  Object.entries(snap.userProfiles || {}).forEach(([id, prof]) => localStorage.setItem('ads_hisab_user_profile_v72_' + id, JSON.stringify(prof)));
  if (Array.isArray(snap.helpRequests)) writeHelpRequests(snap.helpRequests);
  localStorage.setItem(LAST_BACKUP_KEY, today()); if (snap.snapshotTs) localStorage.setItem(LAST_CLOUD_TS_KEY, String(snap.snapshotTs));
  loadDb(); applyAgencyBranding(); applyGlobalNotice(); render(); renderAdminPanel();
  if (activeAccount && activeAccount.id !== 'legacy-super-admin' && !realSuperAdmin) {
    const fr = readLocalAccounts().find(a => a.id === activeAccount.id);
    if (!fr || fr.status === 'suspended' || isAccountExpired(fr)) performLocalLogout(fr?.status === 'suspended' ? 'অ্যাকাউন্ট ব্লক করা হয়েছে!' : 'সাবস্ক্রিপশন মেয়াদ শেষ!');
    else { activeAccount = fr; try { sessionStorage.setItem(SESSION_ACC_KEY, JSON.stringify(fr)); } catch (e) {} applyPermissionClasses(); }
  }
}

if ($('masterBackupBtn')) $('masterBackupBtn').onclick = () => { if (isSuperAdmin()) { downloadBlob(JSON.stringify(buildMasterSnapshot(), null, 2), `ads_hisab_MASTER_backup_${today()}.json`, 'application/json'); localStorage.setItem(LAST_BACKUP_KEY, today()); checkBackupReminder(); toast('মাস্টার ব্যাকআপ ডাউনলোড হয়েছে!'); } };
if ($('masterRestoreFile')) $('masterRestoreFile').onchange = e => { if (!isSuperAdmin()) return; const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { try { applyMasterSnapshot(JSON.parse(ev.target.result)); toast('রিস্টোর হয়েছে!'); } catch (err) { toast('সঠিক ফাইল নয়!', 'error'); } e.target.value = ''; }; r.readAsText(f); };
function readCloudSync() { try { const s = JSON.parse(localStorage.getItem(CLOUD_SYNC_KEY) || '{}'); if (!s.url && DEFAULT_CLOUD_URL) s.url = DEFAULT_CLOUD_URL; if (DEFAULT_CLOUD_URL && s.autoSync === undefined) s.autoSync = true; return s; } catch (e) { return DEFAULT_CLOUD_URL ? { url: DEFAULT_CLOUD_URL, autoSync: true } : {}; } }
function writeCloudSync(c) { try { localStorage.setItem(CLOUD_SYNC_KEY, JSON.stringify(c)); } catch (e) {} }
function buildCloudEndpoint(u, s) { const cl = String(u || '').trim().replace(/\/+$/, ''); return cl ? `${cl}/ads_hisab_master_v72.json` + (s ? `?auth=${encodeURIComponent(s)}` : '') : ''; }

async function pushToCloud(silent = false) {
  const cfg = readCloudSync(), ep = buildCloudEndpoint(cfg.url, cfg.secret); if (!ep) return !silent && toast('Firebase URL দিন!', 'error');
  setSyncUi('busy', 'Syncing...');
  try {
    let snap = buildMasterSnapshot(); const lts = num(localStorage.getItem(LAST_CLOUD_TS_KEY));
    try { const cr = await fetch(ep); if (cr.ok) { const rm = await cr.json(); if (rm?.type === 'ads_hisab_master_backup_v72' && num(rm.snapshotTs) > lts) { snap = mergeMasterSnapshots(snap, rm); applyMasterSnapshot(snap); } } } catch (e) {}
    const res = await fetch(ep, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snap) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    localStorage.setItem(LAST_CLOUD_TS_KEY, String(snap.snapshotTs)); localStorage.removeItem(LOCAL_DIRTY_KEY);
    cfg.lastSync = new Date().toLocaleString('bn-BD'); writeCloudSync(cfg); if ($('csLastSyncText')) $('csLastSyncText').textContent = `সিঙ্ক: ${cfg.lastSync}`;
    setSyncUi('ok', 'Synced'); if (!silent) toast('ক্লাউডে মার্জ ও সেভ হয়েছে!');
  } catch (err) { setSyncUi('err', 'Sync Failed'); if (!silent) toast('সিঙ্ক সমস্যা!', 'error'); }
}
async function pullFromCloud(silent = false, cu = '', cs = '') {
  const cfg = readCloudSync(), url = cu || cfg.url, sec = cs !== '' ? cs : cfg.secret, ep = buildCloudEndpoint(url, sec);
  if (!ep) return false; if (!silent) setSyncUi('busy', 'Pulling...');
  try {
    const res = await fetch(ep); if (!res.ok) throw new Error('HTTP ' + res.status); const data = await res.json();
    if (!data || data.type !== 'ads_hisab_master_backup_v72') { setSyncUi('ok', 'Connected'); return false; }
    const lts = num(localStorage.getItem(LAST_CLOUD_TS_KEY)); if (silent && num(data.snapshotTs) <= lts) { setSyncUi('ok', 'Synced'); return false; }
    const dirty = localStorage.getItem(LOCAL_DIRTY_KEY) === '1', fin = dirty ? mergeMasterSnapshots(buildMasterSnapshot(), data) : data;
    applyMasterSnapshot(fin); writeCloudSync({ ...cfg, url, secret: sec, lastSync: new Date().toLocaleString('bn-BD') });
    if (dirty) { await fetch(ep, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fin) }); localStorage.removeItem(LOCAL_DIRTY_KEY); }
    setSyncUi('ok', 'Synced'); if (!silent) toast('ক্লাউড থেকে সিঙ্ক হয়েছে!'); return true;
  } catch (err) { setSyncUi('err', 'Offline'); if (!silent) toast('ক্লাউড এরর!', 'error'); return false; }
}
setInterval(() => { if (!activeAccount || !navigator.onLine) return; const cfg = readCloudSync(); if (cfg.autoSync && cfg.url && localStorage.getItem(LOCAL_DIRTY_KEY) !== '1') pullFromCloud(true, cfg.url, cfg.secret || ''); loadPortalOrders(false); }, 30000);
if ($('cloudSyncForm')) $('cloudSyncForm').onsubmit = e => { e.preventDefault(); if (!isSuperAdmin()) return; const cfg = readCloudSync(); writeCloudSync({ ...cfg, url: $('csUrl').value.trim(), secret: $('csSecret').value.trim(), autoSync: $('csAutoSync').checked }); toast('সেভ হয়েছে!'); };
if ($('csPushBtn')) $('csPushBtn').onclick = () => { if (isSuperAdmin()) withBtnLoading($('csPushBtn'), '⏳...', () => pushToCloud(false)); };
if ($('csPullBtn')) $('csPullBtn').onclick = () => { if (isSuperAdmin() && confirm('ক্লাউড থেকে আনবেন?')) withBtnLoading($('csPullBtn'), '⏳...', () => pullFromCloud(false)); };

// Export CSV & Backup
function downloadBlob(c, f, m) { const b = new Blob([c], { type: m }), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = f; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
if ($('exportCsvBtn')) $('exportCsvBtn').onclick = () => { const rows = [['Customer','Phone','USD','Bill','Paid','Due','Advance','Profit']]; db.customers.forEach(c => { const b = billed(c.id), p = paid(c.id), bal = p - b, cw = db.works.filter(w => w.customerId === c.id); rows.push([c.name, c.phone || '', cw.reduce((s,w)=>s+num(w.actualDollar),0).toFixed(2), b.toFixed(2), p.toFixed(2), Math.max(0,-bal).toFixed(2), Math.max(0,bal).toFixed(2), cw.reduce((s,w)=>s+profit(w),0).toFixed(2)]); }); downloadBlob('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), `customers_${today()}.csv`, 'text/csv;charset=utf-8;'); };
if ($('exportWorksCsvBtn')) $('exportWorksCsvBtn').onclick = () => { const rows = [['Date','Customer','Page','Campaign','Staff','Budget','Spent','Rate','ServiceFee','Bill','Cost','Profit','Results','Status']]; db.works.forEach(w => rows.push([w.date, cname(w.customerId), pname(w.pageId), w.name, w.staffName || '', num(w.dollar), num(w.actualDollar), num(w.rate), workServiceCharge(w).toFixed(2), bill(w).toFixed(2), actual(w).toFixed(2), profit(w).toFixed(2), num(w.conversions), w.status])); downloadBlob('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), `works_${today()}.csv`, 'text/csv;charset=utf-8;'); };
if ($('backupBtn')) $('backupBtn').onclick = () => { downloadBlob(JSON.stringify(db, null, 2), `ads_hisab_backup_${today()}.json`, 'application/json'); localStorage.setItem(LAST_BACKUP_KEY, today()); checkBackupReminder(); toast('ব্যাকআপ ডাউনলোড হয়েছে!'); };
if ($('restoreFile')) $('restoreFile').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { try { const p = JSON.parse(ev.target.result); if (p?.type === 'ads_hisab_master_backup_v72') { if (!isSuperAdmin()) return toast('শুধু Super Admin!', 'error'); applyMasterSnapshot(p); } else { db = normalizeDb(p); save(); applyAgencyBranding(); } toast('রিস্টোর হয়েছে!'); } catch (err) { toast('ভুল ফাইল!', 'error'); } e.target.value = ''; }; r.readAsText(f); };
if ($('wipeBtn')) $('wipeBtn').onclick = () => { if (requireMasterPin('সব ডেটা মুছুন') && confirm('সব ডেটা মুছে ফেলবেন?')) { db = blank(); save(); applyAgencyBranding(); toast('মুছে ফেলা হয়েছে', 'warn'); } };
if ($('printBtn')) $('printBtn').onclick = () => window.print();

// Online + Local Team Chat WITH IMAGE & FILE ATTACHMENTS (Module 1)
let refreshOnlineChat = () => {};
(function initOnlineChat() {
  const key = 'ads_manager_local_chat_v72', list = $('chatMessages'), form = $('chatForm'), input = $('chatInput'), clearBtn = $('clearChatBtn'), fileIn = $('chatFile'), attBtn = $('chatAttachBtn'), attPrev = $('chatAttachPreview');
  if (!list || !form || !input) return;
  const getChatEp = () => { const cfg = readCloudSync(), cl = String(cfg.url || '').trim().replace(/\/+$/, ''); return cl ? `${cl}/ads_hisab_chat_v72.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '') : ''; };
  let messages = []; try { messages = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { messages = []; }

  const clearAttach = () => { pendingChatAttach = null; if (fileIn) fileIn.value = ''; if (attPrev) { attPrev.style.display = 'none'; attPrev.innerHTML = ''; } };
  if (attBtn && fileIn) attBtn.onclick = () => fileIn.click();
  if (fileIn) fileIn.onchange = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      if (f.type.startsWith('image/')) {
        const data = await compressImageFile(f, 720, 0.80);
        pendingChatAttach = { fileData: data, fileName: f.name, fileType: 'image/jpeg' };
      } else {
        if (f.size > 450 * 1024) { clearAttach(); return toast('ফাইল ৪৫০ KB-এর কম হতে হবে (বড় ফাইলের জন্য Drive লিংক দিন)!', 'error'); }
        const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
        pendingChatAttach = { fileData: data, fileName: f.name, fileType: f.type || 'application/octet-stream' };
      }
      if (attPrev) { attPrev.style.display = 'flex'; attPrev.innerHTML = `<span>📎 প্রস্তুত: <strong>${esc(pendingChatAttach.fileName)}</strong></span><button type="button" class="danger sm" style="margin:0" onclick="document.getElementById('chatFile').value='';this.parentElement.style.display='none';pendingChatAttach=null">✕</button>`; }
    } catch (err) { toast('ফাইল লোড ত্রুটি!', 'error'); }
  };

  const draw = () => {
    const ep = getChatEp(); if ($('chatModeBadge')) { $('chatModeBadge').textContent = ep ? '🟢 Online Live' : '🟡 Local Mode'; $('chatModeBadge').className = ep ? 'badge-success' : 'badge-status status-running'; }
    const me = activeAccount?.username || '';
    list.innerHTML = '<div class="chat-msg">টিমের জরুরি নোট, স্ক্রিনশট বা ফাইল এখানে পাঠান।<small>System · প্রস্তুত</small></div>' +
      messages.map(m => {
        let mediaHtml = '';
        if (m.fileData) {
          if (String(m.fileType || '').startsWith('image/')) mediaHtml = `<img src="${m.fileData}" class="chat-img" onclick="openLightbox(this.src)" alt="Image"><a href="${m.fileData}" download="${esc(m.fileName || 'image.jpg')}" style="font-size:11px;color:inherit;display:inline-block;margin-top:3px">⬇ ডাউনলোড</a>`;
          else mediaHtml = `<a href="${m.fileData}" download="${esc(m.fileName || 'file')}" class="chat-file-pill">📄 ${esc(m.fileName || 'File')} ⬇</a>`;
        }
        return `<div class="chat-msg ${(!m.username || m.username === me) ? 'mine' : ''}">${m.text ? `<div>${esc(m.text)}</div>` : ''}${mediaHtml}<small>${m.sender ? `${esc(m.sender)} (${esc(m.role || 'user')}) · ` : ''}${esc(m.time)}</small></div>`;
      }).join('');
    list.scrollTop = list.scrollHeight;
  };
  refreshOnlineChat = async () => {
    const ep = getChatEp(); if (!ep) { draw(); return; }
    try { const res = await fetch(ep); if (!res.ok) return; const d = await res.json(); if (d && typeof d === 'object') { messages = Object.values(d).filter(x => x && (x.text || x.fileData)).sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(-100); try { localStorage.setItem(key, JSON.stringify(messages)); } catch (e) {} } else if (d === null) { messages = []; localStorage.setItem(key, '[]'); } draw(); } catch (e) { draw(); }
  };
  draw(); if ($('chatRefreshBtn')) $('chatRefreshBtn').onclick = () => { refreshOnlineChat(); toast('চ্যাট রিফ্রেশ হয়েছে!'); };
  setInterval(() => { if (activeAccount && $('liveChat')?.classList.contains('active')) refreshOnlineChat(); }, 5000);
  form.addEventListener('submit', async e => {
    e.preventDefault(); const value = input.value.trim();
    if (!value && !pendingChatAttach) return;
    const msgObj = { id: uid(), sender: activeAccount?.name || 'User', role: activeAccount?.role || 'user', username: activeAccount?.username || '', text: value, time: new Date().toLocaleString('bn-BD'), ts: Date.now(), ...(pendingChatAttach || {}) };
    messages.push(msgObj); try { localStorage.setItem(key, JSON.stringify(messages)); } catch (err) { messages.shift(); }
    input.value = ''; clearAttach(); draw();
    const ep = getChatEp(); if (ep) { try { await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msgObj) }); } catch (err) {} }
  });
  if (clearBtn) clearBtn.onclick = async () => { if (!isSuperAdmin() || !confirm('সব চ্যাট মুছবেন?')) return; messages = []; localStorage.setItem(key, '[]'); const ep = getChatEp(); if (ep) { try { await fetch(ep, { method: 'DELETE' }); } catch (err) {} } draw(); toast('পরিষ্কার হয়েছে', 'warn'); };
})();

// Upgraded Interactive Client Portal (?portal=ID_TOKEN)
async function checkAndRenderPortal() {
  const portalKey = new URLSearchParams(location.search).get('portal'); if (!portalKey) return false;
  if ($('authOverlay')) $('authOverlay').style.display = 'none'; if ($('clientPortalOverlay')) $('clientPortalOverlay').style.display = 'flex';
  const cfg = readCloudSync(), clean = String(cfg.url || DEFAULT_CLOUD_URL || '').trim().replace(/\/+$/, '');
  const endpoint = `${clean}/ads_hisab_portals/${encodeURIComponent(portalKey)}.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '');
  try {
    const res = await fetch(endpoint); if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json(); if (!d?.customerName) throw new Error('Not found');
    const bal = num(d.balance), balTxt = bal < 0 ? `<span class="bad">বকেয়া বাকি: ${money(-bal)}</span>` : (bal > 0 ? `<span class="good">অ্যাডভান্স জমা: ${money(bal)}</span>` : `<span class="good">৳0.00 (সমন্বিত)</span>`);
    $('portalBody').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--brand);padding-bottom:12px;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <div><h2 style="margin:0;color:var(--brand)">${esc(d.agencyName)}</h2><small class="muted">${esc(d.agencyContact || '')}<br>ক্লায়েন্ট লাইভ পোর্টাল · আপডেট: ${esc(d.updatedAt || '')}</small></div>
        <div style="text-align:right"><strong>👤 ${esc(d.customerName)}</strong></div>
      </div>
      <div class="metrics-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        <div class="metric-card m2"><small>মোট বিল</small><strong>${money(d.totalBill)}</strong></div>
        <div class="metric-card m3"><small>মোট জমা</small><strong>${money(d.totalPaid)}</strong></div>
        <div class="metric-card ${bal < 0 ? 'm4' : 'm1'}"><small>ব্যালেন্স</small><strong>${bal < 0 ? money(-bal) : money(bal)}</strong><span class="trend">${bal < 0 ? 'বকেয়া' : (bal > 0 ? 'অ্যাডভান্স' : 'সমন্বিত')}</span></div>
      </div>
      <div style="margin-bottom:14px">${balTxt}</div>
      ${d.payInfo ? `<div style="padding:10px 12px;background:var(--soft);border:1px solid var(--line);border-radius:10px;font-size:13px;margin-bottom:16px"><strong>💳 পেমেন্ট মাধ্যম:</strong> ${esc(d.payInfo)}</div>` : ''}
      <h3>⚡ ক্যাম্পেইন ও রেজাল্টসমূহ (${(d.works || []).length})</h3>
      <div class="tablewrap" style="margin-bottom:18px"><table><thead><tr><th>তারিখ</th><th>ক্যাম্পেইন</th><th>ব্যবহৃত $</th><th>মোট বিল</th><th>Reach / Clicks / Results</th><th>স্ট্যাটাস</th></tr></thead><tbody>${(d.works || []).map(w => `<tr><td>${esc(w.date)}</td><td><strong>${esc(w.name)}</strong><br><small class="muted">${esc(w.page || '')}</small></td><td>${usd(w.spentUsd)}</td><td>${money(w.bill)}</td><td><small>R: ${num(w.reach).toLocaleString()} · C: ${num(w.clicks).toLocaleString()} · <strong>Res: ${num(w.results)}</strong></small></td><td>${esc(w.status)}</td></tr>`).join('') || '<tr><td colspan="6">কোনো কাজ নেই</td></tr>'}</tbody></table></div>
      <h3>💰 পেমেন্ট হিস্ট্রি (${(d.payments || []).length})</h3>
      <div class="tablewrap" style="margin-bottom:20px"><table><thead><tr><th>তারিখ</th><th>পরিমাণ</th><th>মাধ্যম</th><th>রেফারেন্স</th></tr></thead><tbody>${(d.payments || []).map(p => `<tr><td>${esc(p.date)}</td><td class="good">${money(p.amount)}</td><td>${esc(p.method)}</td><td>${esc(p.ref || '—')}</td></tr>`).join('') || '<tr><td colspan="4">কোনো পেমেন্ট নেই</td></tr>'}</tbody></table></div>
      <div class="card-add-box" style="margin:0">
        <h3 style="margin:0 0 10px">🔄 নতুন ক্যাম্পেইন অর্ডার / রিনিউ রিকোয়েস্ট পাঠান</h3>
        <form id="portalOrderForm">
          <div class="grid"><div class="field"><label>ক্যাম্পেইনের নাম / পোস্ট *</label><input id="poCampName" required placeholder="যেমন: নতুন অফার বুস্টিং"></div><div class="field"><label>বাজেট ($) *</label><input id="poBudget" type="number" min="1" step=".01" required value="20"></div><div class="field"><label>কত দিন? *</label><input id="poDays" type="number" min="1" required value="7"></div></div>
          <div class="field"><label>টার্গেটিং / বিশেষ নির্দেশনা</label><input id="poNote" placeholder="লোকেশন, বয়স বা পোস্ট লিংক দিন"></div>
          <button type="submit">📩 অর্ডার রিকোয়েস্ট পাঠান</button>
        </form>
      </div>`;
    if ($('portalOrderForm')) $('portalOrderForm').onsubmit = async e => {
      e.preventDefault();
      const ordEp = `${clean}/ads_hisab_portal_orders.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '');
      try {
        const r = await fetch(ordEp, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId: d.customerId || '', customerName: d.customerName, phone: d.customerPhone || '', campName: $('poCampName').value.trim(), budget: num($('poBudget').value), days: num($('poDays').value), note: $('poNote').value.trim(), time: new Date().toLocaleString('bn-BD') }) });
        if (!r.ok) throw new Error('Failed');
        e.target.reset(); toast('আপনার অর্ডার রিকোয়েস্টটি এজেন্সির কাছে পাঠানো হয়েছে!');
      } catch (err) { toast('রিকোয়েস্ট পাঠাতে সমস্যা হয়েছে!', 'error'); }
    };
  } catch (err) { $('portalBody').innerHTML = `<h3 style="color:var(--danger)">দুঃখিত, এই ক্লায়েন্ট পোর্টাল লিংকটি পাওয়া যায়নি বা মেয়াদ শেষ হয়েছে।</h3>`; }
  return true;
}

// PWA & Auto-Lock & Boot
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstallPrompt = e; if ($('pwaInstallBtn')) $('pwaInstallBtn').style.display = 'inline-flex'; });
if ($('pwaInstallBtn')) $('pwaInstallBtn').onclick = async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('pwaInstallBtn').style.display = 'none'; };

(function initInactivityLock() {
  let idle = null;
  const reset = () => { clearTimeout(idle); if (!activeAccount) return; idle = setTimeout(() => { if (!activeAccount) return; sessionStorage.removeItem(SESSION_ACC_KEY); activeAccount = null; realSuperAdmin = null; if ($('authOverlay')) $('authOverlay').style.display = 'flex'; if ($('loginPass')) $('loginPass').value = ''; toast('২০ মিনিট নিষ্ক্রিয় থাকায় স্ক্রিন লক হয়েছে!', 'warn'); }, 20 * 60 * 1000); };
  ['mousemove','keydown','click','touchstart'].forEach(ev => document.addEventListener(ev, reset, { passive: true }));
})();

(async function bootApp() {
  if (await checkAndRenderPortal()) return;
  const savedSess = (() => { try { return JSON.parse(sessionStorage.getItem(SESSION_ACC_KEY) || 'null'); } catch (e) { return null; } })();
  if (savedSess) {
    const fresh = savedSess.id === 'legacy-super-admin' ? savedSess : (readLocalAccounts().find(a => a.id === savedSess.id) || savedSess);
    if (fresh.status !== 'suspended' && !isAccountExpired(fresh)) enterLoggedInUI(fresh, true);
  }
  const cfg = readCloudSync();
  if (cfg.url && navigator.onLine) await pullFromCloud(true, cfg.url, cfg.secret || '');
  if (!activeAccount) {
    const savedLogin = decodeRemember(localStorage.getItem(REMEMBER_LOGIN_KEY));
    if (savedLogin?.identity && savedLogin?.pass) {
      if ($('loginUser')) $('loginUser').value = savedLogin.identity; if ($('loginPass')) $('loginPass').value = savedLogin.pass;
      if ($('rememberLogin')) $('rememberLogin').checked = true; window.login(); return;
    }
    updateHeaderAndProfile(); render(); updateWorkPreview(); updateQuotePreview(); generatePixelCode(); renderMonthlyReport();
  }
})();
