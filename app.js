const REMEMBER_LOGIN_KEY = 'ads_hisab_remember_login_v72';
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
const DEFAULT_CLOUD_URL = 'https://ads-managerbd-default-rtdb.firebaseio.com/';
let KEY = MASTER_DB_KEY;
let PROFILEKEY = 'ads_hisab_user_profile_v72_legacy-super-admin';
let activeAccount = null;
let realSuperAdmin = null;
let pendingProfilePicData = '';

const $ = id => document.getElementById(id);
const today = () => { const d = new Date(), z = d.getTimezoneOffset(); return new Date(d.getTime() - z * 60000).toISOString().slice(0, 10); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = x => Number(x) || 0;
const money = x => '৳' + num(x).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = x => '$' + num(x).toFixed(2);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isStaff = () => !realSuperAdmin && activeAccount?.role === 'staff';
const isSuperAdmin = () => Boolean(realSuperAdmin) || activeAccount?.id === 'legacy-super-admin' || activeAccount?.role === 'super_admin';

function hashPass(str) {
  const s = String(str || '');
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 0x01000193);
    h2 ^= s.charCodeAt(i) + i; h2 = Math.imul(h2, 0x85ebca6b);
  }
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

window.copyText = function(txt, label) {
  if (!txt) return;
  const done = () => toast((label || 'তথ্য') + ' কপি হয়েছে!');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      ta.remove();
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    ta.remove();
  }
};

window.matchBudgetDollar = function() {
  if ($('wActualDollar') && $('wDollar')) {
    $('wActualDollar').value = $('wDollar').value || 0;
    updateWorkPreview();
  }
};

const DEFAULT_WA_TEMPLATE = 'আসসালামু আলাইকুম {name}, {agency} থেকে জানাচ্ছি—আপনার বিজ্ঞাপনের মোট বিল {bill}, জমা {paid}, এবং বকেয়া রয়েছে {due}। অনুগ্রহ করে বকেয়া পরিশোধ করার জন্য অনুরোধ রইল। {payinfo} ধন্যবাদ!';

const blank = () => ({
  rates: [], customers: [], pages: [], works: [], payments: [],
  cardDeposits: [], cards: [], expenses: [], trash: [], reminderLogs: {}, activityLogs: [],
  agency: { name: 'Ads হিসাব ম্যানেজার', tagline: 'Smart · Secure · Pro v72', phone: '', defaultRate: 125, defaultFeePct: 0, logoUrl: '', signText: '', payInfo: '', waTemplate: DEFAULT_WA_TEMPLATE }
});

let db = blank();
function normalizeDb(raw) {
  const b = blank();
  const parsed = (raw && typeof raw === 'object') ? raw : {};
  return {
    rates: Array.isArray(parsed.rates) ? parsed.rates : [],
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    pages: Array.isArray(parsed.pages) ? parsed.pages : [],
    works: Array.isArray(parsed.works) ? parsed.works : [],
    payments: Array.isArray(parsed.payments) ? parsed.payments : [],
    cardDeposits: Array.isArray(parsed.cardDeposits) ? parsed.cardDeposits : [],
    cards: Array.isArray(parsed.cards) ? parsed.cards : [],
    expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
    trash: Array.isArray(parsed.trash) ? parsed.trash : [],
    reminderLogs: (parsed.reminderLogs && typeof parsed.reminderLogs === 'object') ? parsed.reminderLogs : {},
    activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : [],
    agency: { ...b.agency, ...(parsed.agency && typeof parsed.agency === 'object' ? parsed.agency : {}) }
  };
}

function loadDb() {
  try { db = normalizeDb(JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch (e) { db = blank(); }
}
loadDb();

function toast(msg, type = 'success') {
  const host = $('toastContainer'); if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 260); }, 3200);
}

function closeModal(id) { if ($(id)) $(id).style.display = 'none'; }
document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'); });

function logActivity(text) {
  const time = new Date().toLocaleString('bn-BD');
  const actor = activeAccount?.name ? `[${activeAccount.name}] ` : '';
  db.activityLogs.unshift({ time, text: actor + text });
  if (db.activityLogs.length > 150) db.activityLogs.pop();
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
}

// Calculations
const cname = id => db.customers.find(x => x.id === id)?.name || 'কাস্টমার নেই';
const pname = id => db.pages.find(x => x.id === id)?.name || '';
const pageCustomer = id => db.pages.find(x => x.id === id)?.customerId || '';
const bill = w => num(w.actualDollar) * num(w.rate);
const baseActual = w => num(w.actualDollar) * num(w.actualRate);
const feeCost = w => baseActual(w) * (num(w.feePct) / 100);
const actual = w => baseActual(w) + feeCost(w);
const profit = w => bill(w) - actual(w) - num(w.other);
const paid = id => db.payments.filter(p => p.customerId === id).reduce((s, p) => s + num(p.amount), 0);
const billed = id => db.works.filter(w => w.customerId === id).reduce((s, w) => s + bill(w), 0);
const clientBalance = id => paid(id) - billed(id);

function rateFor(date) {
  const found = db.rates.filter(r => r.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0]?.value;
  return found || num(db.agency?.defaultRate) || 0;
}

function cardAvgRate(cardId) {
  if (!cardId) return 0;
  const deps = db.cardDeposits.filter(d => d.cardId === cardId);
  const totalUsd = deps.reduce((s, d) => s + num(d.amount), 0);
  const totalTk = deps.reduce((s, d) => s + num(d.taka), 0);
  return totalUsd > 0 ? +(totalTk / totalUsd).toFixed(2) : 0;
}

let autoSyncTimer = null;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('ব্রাউজার স্টোরেজ পূর্ণ! দয়া করে ব্যাকআপ নিয়ে পুরোনো ডেটা ক্লিয়ার করুন।', 'error'); }
  const syncCfg = readCloudSync();
  if (syncCfg.autoSync && syncCfg.url) {
    clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => pushToCloud(true), 1200);
  }
  render();
}

function defaultAvatarUrl(name) {
  const initials = String(name || 'U').trim().slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#3157e8"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Arial,sans-serif" font-size="38" font-weight="bold">${initials}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function compressImageFile(file, maxSize = 240, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
        else if (h >= w && h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Trash / Recycle Bin
function moveToTrash(type, label, data) {
  db.trash.unshift({
    id: uid(), type, label, data,
    deletedAt: new Date().toLocaleString('bn-BD'),
    deletedBy: activeAccount?.name || 'Admin'
  });
  if (db.trash.length > 100) db.trash.pop();
}

window.restoreTrash = function(trashId) {
  if (!isSuperAdmin()) return toast('শুধু Super Admin রিস্টোর করতে পারবেন!', 'error');
  const idx = db.trash.findIndex(x => x.id === trashId); if (idx === -1) return;
  const item = db.trash[idx], d = item.data;
  if (item.type === 'customer_bundle' && d?.customer) {
    if (!db.customers.some(x => x.id === d.customer.id)) db.customers.push(d.customer);
    (d.pages || []).forEach(p => { if (!db.pages.some(x => x.id === p.id)) db.pages.push(p); });
    (d.works || []).forEach(w => { if (!db.works.some(x => x.id === w.id)) db.works.push(w); });
    (d.payments || []).forEach(p => { if (!db.payments.some(x => x.id === p.id)) db.payments.push(p); });
  } else if (item.type === 'page' && d) { if (!db.pages.some(x => x.id === d.id)) db.pages.push(d); }
  else if (item.type === 'work' && d) { if (!db.works.some(x => x.id === d.id)) db.works.push(d); }
  else if (item.type === 'payment' && d) { if (!db.payments.some(x => x.id === d.id)) db.payments.push(d); }
  else if (item.type === 'expense' && d) { if (!db.expenses.some(x => x.id === d.id)) db.expenses.push(d); }
  else if (item.type === 'rate' && d) { if (!db.rates.some(x => x.id === d.id)) db.rates.push(d); }
  else if (item.type === 'card' && d) { if (!db.cards.some(x => x.id === d.id)) db.cards.push(d); }
  else if (item.type === 'deposit' && d) { if (!db.cardDeposits.some(x => x.id === d.id)) db.cardDeposits.push(d); }
  db.trash.splice(idx, 1);
  save(); logActivity(`ট্র্যাশ থেকে রিস্টোর: ${item.label}`);
  renderAdminPanel(); toast('ডেটা সফলভাবে পুনরুদ্ধার হয়েছে!');
};

window.permDeleteTrash = function(trashId) {
  if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error');
  if (!confirm('স্থায়ীভাবে মুছে ফেলতে চান? আর ফেরত আনা যাবে না!')) return;
  db.trash = db.trash.filter(x => x.id !== trashId);
  save(); renderAdminPanel(); toast('স্থায়ীভাবে মুছে ফেলা হয়েছে', 'warn');
};

window.emptyTrash = function() {
  if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error');
  if (!db.trash.length || !confirm('রিসাইকেল বিনের সব ডেটা স্থায়ীভাবে মুছে ফেলতে চান?')) return;
  db.trash = []; save(); renderAdminPanel(); toast('ট্র্যাশ খালি করা হয়েছে', 'warn');
};

// Mobile Drawer
function toggleMobileMenu(forceState) {
  const sb = $('appSidebar'), bd = $('sidebarBackdrop');
  if (!sb || !bd) return;
  const open = typeof forceState === 'boolean' ? forceState : !sb.classList.contains('open');
  sb.classList.toggle('open', open);
  bd.classList.toggle('open', open);
}
if ($('mobileMenuBtn')) $('mobileMenuBtn').onclick = () => toggleMobileMenu();
if ($('sidebarBackdrop')) $('sidebarBackdrop').onclick = () => toggleMobileMenu(false);

// Notification Seen / Dismiss State
let currentNotifKeys = [];
function getNotifStateKey() {
  return 'ads_hisab_notif_state_v72_' + (activeAccount?.id || 'legacy-super-admin');
}
function readNotifState() {
  try {
    const raw = JSON.parse(localStorage.getItem(getNotifStateKey()) || '{}');
    if (raw.date === today()) {
      return { date: today(), seen: Array.isArray(raw.seen) ? raw.seen : [], dismissed: Array.isArray(raw.dismissed) ? raw.dismissed : [] };
    }
  } catch (e) {}
  return { date: today(), seen: [], dismissed: [] };
}
function writeNotifState(state) {
  try { localStorage.setItem(getNotifStateKey(), JSON.stringify(state)); } catch (e) {}
}
function markNotifsSeen(keys) {
  if (!keys || !keys.length) return;
  const st = readNotifState();
  keys.forEach(k => { if (!st.seen.includes(k)) st.seen.push(k); });
  writeNotifState(st);
  if ($('notifCount')) $('notifCount').style.display = 'none';
}
window.dismissNotif = function(e, key) {
  e.stopPropagation();
  const st = readNotifState();
  if (!st.seen.includes(key)) st.seen.push(key);
  if (!st.dismissed.includes(key)) st.dismissed.push(key);
  writeNotifState(st);
  updateNotifications();
};

if ($('notifIcon') && $('notifBox')) {
  $('notifIcon').onclick = e => {
    e.stopPropagation();
    const box = $('notifBox');
    const willOpen = box.style.display !== 'block';
    box.style.display = willOpen ? 'block' : 'none';
    if (willOpen) markNotifsSeen(currentNotifKeys);
  };
  document.addEventListener('click', e => {
    if (!$('notifBox').contains(e.target) && !$('notifIcon').contains(e.target)) $('notifBox').style.display = 'none';
  });
}

// Language
const translations = {
  bn: {
    navDash: "📊 ড্যাশবোর্ড", navCust: "👥 কাস্টমার প্রোফাইল", navCards: "💳 ডলার ও কার্ড হিসাব",
    navRates: "📈 দৈনিক ডলার রেট", navWorks: "⚡ কাজের হিসাব", navPixel: "🎯 মেটা পিক্সেল ও ট্র্যাকিং",
    navExp: "💸 অফিস ও অন্যান্য খরচ", navPay: "💰 পেমেন্ট অ্যাড", navDue: "📑 বকেয়া ও অটোমেশন",
    navMonthly: "📅 মাসিক বা নির্দিষ্ট হিসাব", navRep: "📂 ব্যাকআপ ও রিপোর্ট", navSet: "⚙ সেটিংস",
    navLogout: "↪ লগ আউট", navChat: "💬 নোট ও চ্যাট",
    headerSub: "আপনার এজেন্সির বিজ্ঞাপন ও আর্থিক পারফরম্যান্স পরিচালনা করুন",
    loginTitle: "Ads হিসাব ম্যানেজার", loginSub: "আপনার বিজ্ঞাপনের হিসাব ও লাভ-ক্ষতি নিরাপদে পরিচালনা করুন",
    userLabel: "ইউজারনেম / ইমেইল / মোবাইল", passLabel: "পাসওয়ার্ড", rememberText: "পাসওয়ার্ড মনে রাখুন",
    loginBtnText: "লগইন করুন", notifHead: "বিজ্ঞপ্তি ও অটো অ্যালার্ট",
    c1: "আজকের নিট লাভ", c2: "মোট বিলিং / আয়", c3: "প্রকৃত এড খরচ (ভ্যাট সহ)", c4: "নিট প্রফিট (সব খরচ বাদে)"
  },
  en: {
    navDash: "📊 Dashboard", navCust: "👥 Customers & Pages", navCards: "💳 Cards & USD",
    navRates: "📈 Daily USD Rates", navWorks: "⚡ Campaigns / Works", navPixel: "🎯 Meta Pixel Hub",
    navExp: "💸 Office Expenses", navPay: "💰 Payments", navDue: "📑 Dues & WhatsApp",
    navMonthly: "📅 Monthly / Custom Report", navRep: "📂 Reports & Backup", navSet: "⚙ Settings",
    navLogout: "↪ Logout", navChat: "💬 Notes & Chat",
    headerSub: "Manage your agency ad spend, billing, and net profit",
    loginTitle: "Ads Manager Login", loginSub: "Manage your ad accounts and profits securely",
    userLabel: "Username / Email / Mobile", passLabel: "Password", rememberText: "Remember Password",
    loginBtnText: "Login", notifHead: "Notifications & Alerts",
    c1: "Today Net Profit", c2: "Total Billing / Revenue", c3: "Actual Ad Spend (incl. Fee)", c4: "Net Profit (After Expenses)"
  }
};

function applyLanguage(lang) {
  localStorage.setItem(LANG_KEY, lang);
  const t = translations[lang] || translations.bn;
  if ($('languageSelect')) $('languageSelect').value = lang;
  if ($('navDash')) $('navDash').textContent = t.navDash;
  if ($('navCust')) $('navCust').textContent = t.navCust;
  if ($('navCards')) $('navCards').textContent = t.navCards;
  if ($('navRates')) $('navRates').textContent = t.navRates;
  if ($('navWorks')) $('navWorks').textContent = t.navWorks;
  if ($('navPixel')) $('navPixel').textContent = t.navPixel;
  if ($('navExp')) $('navExp').textContent = t.navExp;
  if ($('navPay')) $('navPay').textContent = t.navPay;
  if ($('navDue')) $('navDue').textContent = t.navDue;
  if ($('navMonthly')) $('navMonthly').textContent = t.navMonthly;
  if ($('navRep')) $('navRep').textContent = t.navRep;
  if ($('navSet')) $('navSet').textContent = t.navSet;
  if ($('navChat')) $('navChat').textContent = t.navChat;
  if ($('navLogout')) $('navLogout').textContent = t.navLogout;
  if ($('headerSubText')) $('headerSubText').textContent = t.headerSub;
  if ($('uiLoginTitle')) $('uiLoginTitle').textContent = t.loginTitle;
  if ($('uiLoginSub')) $('uiLoginSub').textContent = t.loginSub;
  if ($('uiUserLabel')) $('uiUserLabel').textContent = t.userLabel;
  if ($('uiPassLabel')) $('uiPassLabel').textContent = t.passLabel;
  if ($('uiRememberText')) $('uiRememberText').textContent = t.rememberText;
  if ($('loginBtn')) $('loginBtn').textContent = t.loginBtnText;
  if ($('uiNotifHeader')) $('uiNotifHeader').textContent = t.notifHead;
  if ($('cardTitleTodayProfit')) $('cardTitleTodayProfit').textContent = t.c1;
  if ($('cardTitleTotalBill')) $('cardTitleTotalBill').textContent = t.c2;
  if ($('cardTitleTotalCost')) $('cardTitleTotalCost').textContent = t.c3;
  if ($('cardTitleNetProfit')) $('cardTitleNetProfit').textContent = t.c4;
}
if ($('applyLanguageBtn')) $('applyLanguageBtn').onclick = () => { applyLanguage($('languageSelect').value); toast('ভাষা পরিবর্তন হয়েছে!'); };
applyLanguage(localStorage.getItem(LANG_KEY) || 'bn');

// Theme
function setTheme(isDark) {
  document.body.classList.toggle('dark', isDark);
  if ($('themeToggleBtn')) $('themeToggleBtn').textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
}
if ($('themeToggleBtn')) $('themeToggleBtn').onclick = () => setTheme(!document.body.classList.contains('dark'));
if (localStorage.getItem(THEME_KEY) === 'dark') setTheme(true);

// Navigation
document.querySelectorAll('.side-menu button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.side-menu button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('main section').forEach(s => s.classList.toggle('active', s.id === b.dataset.tab));
  toggleMobileMenu(false);
  render();
  if (b.dataset.tab === 'adminPanel') switchAdminSubTab(isSuperAdmin() ? 'users' : 'help');
  if (b.dataset.tab === 'monthly') renderMonthlyReport();
  if (b.dataset.tab === 'liveChat') refreshOnlineChat();
});
window.goToSection = function(tabName) {
  const btn = document.querySelector(`.side-menu button[data-tab="${tabName}"]`);
  if (btn) btn.click();
};
document.querySelectorAll('[data-settings-panel]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-settings-panel]').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.settings-panel').forEach(p => p.classList.toggle('active', p.id === b.dataset.settingsPanel));
}));

// Select Helpers
function fillSelect(id, items, placeholder, display = x => x.name) {
  const el = $(id); if (!el) return;
  const old = el.value;
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') + items.map(x => `<option value="${x.id}">${esc(display(x))}</option>`).join('');
  if (items.some(x => x.id === old)) el.value = old;
}

function refresh() {
  fillSelect('wCard', db.cards, 'কার্ড নির্বাচন');
  fillSelect('ewCard', db.cards, 'কার্ড নির্বাচন');
  fillSelect('depositCard', db.cards, db.cards.length ? '' : 'প্রথমে কার্ড যোগ করুন');
  fillSelect('pageCustomer', db.customers, 'কাস্টমার নির্বাচন');
  fillSelect('wCustomer', db.customers, 'কাস্টমার নির্বাচন');
  fillSelect('ewCustomer', db.customers, 'কাস্টমার নির্বাচন');
  fillSelect('pCustomer', db.customers, 'কাস্টমার নির্বাচন');
  fillSelect('epCustomer', db.customers, 'কাস্টমার নির্বাচন');
  fillSelect('workCustomerFilter', db.customers, 'সব কাস্টমার');
  updatePages();
}

function updatePages() {
  const wc = $('wCustomer'); if (!wc) return;
  const cid = wc.value;
  fillSelect('wPage', db.pages.filter(p => !cid || p.customerId === cid), 'পেজ নির্বাচন', p => `${p.name} — ${cname(p.customerId)}`);
}
function updateEditWorkPages() {
  const wc = $('ewCustomer'); if (!wc) return;
  const cid = wc.value;
  fillSelect('ewPage', db.pages.filter(p => !cid || p.customerId === cid), 'পেজ নির্বাচন', p => `${p.name} — ${cname(p.customerId)}`);
}
if ($('wCustomer')) $('wCustomer').onchange = updatePages;
if ($('ewCustomer')) $('ewCustomer').onchange = updateEditWorkPages;

function updatePaymentCustomerStatus() {
  const el = $('pCustomerStatus'), cid = $('pCustomer')?.value;
  if (!el) return;
  if (!cid) { el.innerHTML = ''; return; }
  const bal = clientBalance(cid);
  if (bal < 0) {
    el.innerHTML = `<span class="bad">বর্তমান বকেয়া: ${money(-bal)}</span> <button type="button" class="secondary sm" onclick="$('pAmount').value='${(-bal).toFixed(2)}'">পুরো বকেয়া বসান</button>`;
  } else if (bal > 0) {
    el.innerHTML = `<span class="good">অ্যাডভান্স জমা আছে: ${money(bal)}</span>`;
  } else {
    el.innerHTML = `<span class="muted">কোনো বকেয়া নেই (৳0.00)</span>`;
  }
}
if ($('pCustomer')) $('pCustomer').onchange = updatePaymentCustomerStatus;

['rateDate','wDate','pDate','expDate','depositDate'].forEach(id => { if ($(id)) $(id).value = today(); });
if ($('wDate')) $('wDate').onchange = () => {
  const r = rateFor($('wDate').value);
  if (r && $('wRate')) { $('wRate').value = r; updateWorkPreview(); }
};
if ($('wCard')) $('wCard').onchange = () => {
  const avg = cardAvgRate($('wCard').value);
  if (avg > 0 && $('wActualRate')) { $('wActualRate').value = avg; updateWorkPreview(); }
};
if ($('ewCard')) $('ewCard').onchange = () => {
  const avg = cardAvgRate($('ewCard').value);
  if (avg > 0 && $('ewActualRate') && !num($('ewActualRate').value)) { $('ewActualRate').value = avg; updateEditWorkPreview(); }
};

function updateWorkPreview() {
  const date = $('wDate')?.value || today();
  const actualDol = num($('wActualDollar')?.value);
  const rate = num($('wRate')?.value) || rateFor(date);
  const actRate = num($('wActualRate')?.value);
  const feePct = num($('wFeePct')?.value);
  const other = num($('wOther')?.value);
  const b = actualDol * rate;
  const base = actualDol * actRate;
  const fee = base * (feePct / 100);
  const act = base + fee;
  const pr = b - act - other;
  if ($('preview')) {
    if (isStaff()) $('preview').textContent = `বিল: ${money(b)}`;
    else $('preview').textContent = `বিল: ${money(b)} · খরচ: ${money(base)} + ফি (${feePct}%): ${money(fee)} = মোট ${money(act)} · লাভ: ${money(pr)}`;
  }
}
['wDate','wActualDollar','wRate','wActualRate','wFeePct','wOther'].forEach(id => { if ($(id)) $(id).oninput = updateWorkPreview; });

function updateEditWorkPreview() {
  const actualDol = num($('ewActualDollar')?.value), rate = num($('ewRate')?.value), actRate = num($('ewActualRate')?.value), feePct = num($('ewFeePct')?.value), other = num($('ewOther')?.value);
  const b = actualDol * rate, base = actualDol * actRate, fee = base * (feePct / 100), act = base + fee, pr = b - act - other;
  if ($('ewPreview')) {
    if (isStaff()) $('ewPreview').textContent = `বিল: ${money(b)}`;
    else $('ewPreview').textContent = `বিল: ${money(b)} · প্রকৃত খরচ (ফি সহ): ${money(act)} · লাভ: ${money(pr)}`;
  }
}
['ewActualDollar','ewRate','ewActualRate','ewFeePct','ewOther'].forEach(id => { if ($(id)) $(id).oninput = updateEditWorkPreview; });

window.togglePasswordVisibility = function(fieldId, btnEl) {
  const f = $(fieldId); if (!f) return;
  f.type = f.type === 'password' ? 'text' : 'password';
  btnEl.textContent = f.type === 'password' ? '👁' : '🙈';
};

// Help Inbox (Sign-in Page Support)
function readHelpRequests() { try { return JSON.parse(localStorage.getItem(HELP_REQUESTS_KEY) || '[]'); } catch (e) { return []; } }
function writeHelpRequests(arr) { try { localStorage.setItem(HELP_REQUESTS_KEY, JSON.stringify(arr)); } catch (e) {} }

if ($('loginHelpBtn')) $('loginHelpBtn').onclick = () => {
  let masterAg = {};
  try { masterAg = JSON.parse(localStorage.getItem(MASTER_DB_KEY) || '{}').agency || {}; } catch (e) {}
  const waNum = normalizeBdPhone(masterAg.phone || '');
  if ($('lhWaWrap') && $('lhWaBtn')) {
    if (waNum) {
      $('lhWaWrap').style.display = 'block';
      $('lhWaBtn').href = `https://wa.me/${waNum}?text=${encodeURIComponent('আসসালামু আলাইকুম, Ads হিসাব ম্যানেজার লগইন সংক্রান্ত সহায়তা প্রয়োজন।')}`;
    } else $('lhWaWrap').style.display = 'none';
  }
  $('loginHelpForm')?.reset();
  $('loginHelpModal').style.display = 'flex';
};

if ($('loginHelpForm')) $('loginHelpForm').onsubmit = e => {
  e.preventDefault();
  const arr = readHelpRequests();
  arr.unshift({
    id: uid(), time: new Date().toLocaleString('bn-BD'),
    target: $('lhTarget').value, name: $('lhName').value.trim(),
    contact: $('lhContact').value.trim(), topic: $('lhTopic').value,
    message: $('lhMessage').value.trim(), status: 'open'
  });
  if (arr.length > 100) arr.pop();
  writeHelpRequests(arr);
  closeModal('loginHelpModal');
  toast('আপনার বার্তাটি Admin / Super Admin-এর ইনবক্সে পাঠানো হয়েছে!');
};

window.resolveHelpReq = function(id) {
  const arr = readHelpRequests(), item = arr.find(x => x.id === id); if (!item) return;
  item.status = item.status === 'resolved' ? 'open' : 'resolved';
  writeHelpRequests(arr); renderAdminPanel(); updateNotifications();
  toast(item.status === 'resolved' ? 'সমাধান হিসেবে চিহ্নিত হয়েছে!' : 'পুনরায় Open করা হয়েছে');
};
window.deleteHelpReq = function(id) {
  writeHelpRequests(readHelpRequests().filter(x => x.id !== id));
  renderAdminPanel(); updateNotifications(); toast('মেসেজ মুছে ফেলা হয়েছে', 'warn');
};
window.clearAllHelpRequests = function() {
  if (!confirm('সব হেল্প মেসেজ মুছে ফেলতে চান?')) return;
  writeHelpRequests([]); renderAdminPanel(); updateNotifications(); toast('হেল্প ইনবক্স পরিষ্কার হয়েছে', 'warn');
};

// Account & Auth System
function readLocalAccounts() { try { return JSON.parse(localStorage.getItem(ACCOUNTSKEY) || '[]'); } catch (e) { return []; } }
function readSuperAdminMeta() { try { return JSON.parse(localStorage.getItem(SUPERADMIN_META_KEY) || '{}'); } catch (e) { return {}; } }

function activateAccountData(account) {
  if (!account.id) account.id = 'legacy-super-admin';
  if (account.id === 'legacy-super-admin' || account.role === 'staff') KEY = MASTER_DB_KEY;
  else KEY = 'ads_hisab_user_data_v72_' + account.id;
  PROFILEKEY = 'ads_hisab_user_profile_v72_' + account.id;
  loadDb();
}

window.performLocalLogout = function() {
  localStorage.removeItem(REMEMBER_LOGIN_KEY);
  activeAccount = null;
  realSuperAdmin = null;
  if ($('impersonateBanner')) $('impersonateBanner').style.display = 'none';
  document.body.classList.remove('role-staff', 'role-superadmin', 'no-perm-del', 'no-perm-edit', 'no-perm-pay', 'no-perm-exp');
  KEY = MASTER_DB_KEY;
  loadDb();
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
  const identity = ($('loginUser')?.value || '').trim().toLowerCase();
  const pass = $('loginPass')?.value || '';
  if (!identity || !pass) { if ($('authMsg')) $('authMsg').textContent = 'ইউজারনেম ও পাসওয়ার্ড দিন।'; return; }
  const accounts = readLocalAccounts();
  let accIdx = accounts.findIndex(a => [a.username, a.email, a.phone].some(v => String(v || '').trim().toLowerCase() === identity) && checkPass(pass, a.password));
  let account = accIdx !== -1 ? accounts[accIdx] : null;
  if (account && !String(account.password).startsWith('h1_')) {
    accounts[accIdx].password = hashPass(pass);
    localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts));
  }

  const superAdminPass = localStorage.getItem(PASSKEY) || '123456789';
  if (!account && identity === 'admin' && checkPass(pass, superAdminPass)) {
    if (!String(superAdminPass).startsWith('h1_')) localStorage.setItem(PASSKEY, hashPass(pass));
    account = { id: 'legacy-super-admin', username: 'admin', name: 'Super Admin', email: 'admin@example.com', phone: '01700000000', role: 'super_admin', userNumber: 1, status: 'active' };
  }
  if (!account) { if ($('authMsg')) $('authMsg').textContent = 'লগইন তথ্য সঠিক নয়। (প্রথমবার হলে: admin / 123456789)'; return; }
  if (account.status === 'suspended') { if ($('authMsg')) $('authMsg').textContent = 'আপনার অ্যাকাউন্টটি ব্লক (Suspended) করা আছে। হেল্প বাটনে যোগাযোগ করুন।'; return; }

  const nowStr = new Date().toLocaleString('bn-BD');
  if (account.id === 'legacy-super-admin') {
    const meta = readSuperAdminMeta();
    meta.lastLogin = nowStr; meta.loginCount = num(meta.loginCount) + 1;
    localStorage.setItem(SUPERADMIN_META_KEY, JSON.stringify(meta));
  } else if (accIdx !== -1) {
    accounts[accIdx].lastLogin = nowStr;
    accounts[accIdx].loginCount = num(accounts[accIdx].loginCount) + 1;
    localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts));
    account = accounts[accIdx];
  }

  if ($('rememberLogin')?.checked) localStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify({ identity, pass }));
  else localStorage.removeItem(REMEMBER_LOGIN_KEY);

  realSuperAdmin = null;
  if ($('impersonateBanner')) $('impersonateBanner').style.display = 'none';
  activeAccount = account;
  applyPermissionClasses();
  activateAccountData(account);
  logActivity(`লগইন করেছেন`);
  if ($('authOverlay')) $('authOverlay').style.display = 'none';

  const canAccessAdmin = (account.role === 'super_admin' || account.role === 'admin' || account.id === 'legacy-super-admin');
  if ($('adminTab')) $('adminTab').style.display = canAccessAdmin ? 'flex' : 'none';

  updateHeaderAndProfile();
  if ($('wRate') && !num($('wRate').value)) $('wRate').value = rateFor(today()) || '';
  if ($('wFeePct')) $('wFeePct').value = num(db.agency?.defaultFeePct) || 0;
  goToSection('dash');
  updateWorkPreview();
  if (typeof refreshOnlineChat === 'function') refreshOnlineChat();
  toast(`স্বাগতম, ${readProfile().name || account.name}!`);
};

['loginUser','loginPass'].forEach(id => {
  if ($(id)) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') window.login(); });
});
if ($('loginBtn')) $('loginBtn').onclick = window.login;

if ($('showRegisterBtn')) $('showRegisterBtn').onclick = () => {
  $('loginFormContainer').style.display = 'none';
  $('registerPanel').style.display = 'block';
  if ($('authMsg')) $('authMsg').textContent = '';
};
if ($('backToLoginBtn')) $('backToLoginBtn').onclick = () => {
  $('registerPanel').style.display = 'none';
  $('loginFormContainer').style.display = 'block';
  if ($('authMsg')) $('authMsg').textContent = '';
};

if ($('registerBtn')) $('registerBtn').onclick = () => {
  const name = $('regName')?.value.trim();
  const username = ($('regUsername')?.value || '').trim().toLowerCase();
  const email = ($('regEmail')?.value || '').trim().toLowerCase();
  const phone = ($('regPhone')?.value || '').trim();
  const pass = $('regPass')?.value || '';
  const pass2 = $('regPass2')?.value || '';

  if (!name || !username || !email || !phone || !pass) { $('authMsg').textContent = 'সবগুলো ঘর পূরণ করুন।'; return; }
  if (username === 'admin') { $('authMsg').textContent = 'admin ইউজারনেম ব্যবহার করা যাবে না।'; return; }
  if (pass.length < 6) { $('authMsg').textContent = 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'; return; }
  if (pass !== pass2) { $('authMsg').textContent = 'পাসওয়ার্ড মিলছে না।'; return; }

  const accounts = readLocalAccounts();
  if (accounts.some(a => a.username === username || a.email === email)) {
    $('authMsg').textContent = 'এই ইউজারনেম বা ইমেইল দিয়ে আগেই অ্যাকাউন্ট খোলা হয়েছে।';
    return;
  }

  const next = Number(localStorage.getItem(NEXTUSERIDKEY) || 2);
  const account = { id: uid(), userNumber: next, name, username, email, phone, password: hashPass(pass), role: 'user', status: 'active', lastLogin: new Date().toLocaleString('bn-BD'), loginCount: 1 };
  accounts.push(account);
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts));
  localStorage.setItem(NEXTUSERIDKEY, String(next + 1));

  activeAccount = account;
  realSuperAdmin = null;
  applyPermissionClasses();
  activateAccountData(account);
  localStorage.setItem(PROFILEKEY, JSON.stringify({ name, email, phone, pic: '' }));
  logActivity(`নতুন ইউজার রেজিস্ট্রেশন: ${name}`);

  $('authOverlay').style.display = 'none';
  if ($('adminTab')) $('adminTab').style.display = 'none';
  updateHeaderAndProfile();
  goToSection('dash');
  if (typeof refreshOnlineChat === 'function') refreshOnlineChat();
  toast('নতুন অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে!');
};

// Recovery Modal
if ($('forgotBtn')) $('forgotBtn').onclick = () => {
  $('recoveryMode').value = 'password'; $('recoveryTitle').textContent = 'পাসওয়ার্ড রিসেট করুন';
  $('recNewPassWrap').style.display = 'block'; $('recNewPass').required = true;
  $('recoveryForm').reset(); $('recoveryModal').style.display = 'flex';
};
if ($('forgotUserBtn')) $('forgotUserBtn').onclick = () => {
  $('recoveryMode').value = 'username'; $('recoveryTitle').textContent = 'ইউজারনেম খুঁজুন';
  $('recNewPassWrap').style.display = 'none'; $('recNewPass').required = false;
  $('recoveryForm').reset(); $('recoveryModal').style.display = 'flex';
};
if ($('recoveryForm')) $('recoveryForm').onsubmit = e => {
  e.preventDefault();
  const mode = $('recoveryMode').value, email = $('recEmail').value.trim().toLowerCase(), phone = $('recPhone').value.trim();
  const accounts = readLocalAccounts();
  const idx = accounts.findIndex(a => String(a.email || '').trim().toLowerCase() === email && String(a.phone || '').trim() === phone);

  if (idx === -1) {
    const saProf = (() => { try { return JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_legacy-super-admin') || '{}'); } catch (err) { return {}; } })();
    const saEmail = String(saProf.email || 'admin@example.com').trim().toLowerCase();
    const saPhone = String(saProf.phone || '01700000000').trim();
    if (email === saEmail && phone === saPhone) {
      if (mode === 'username') { toast('আপনার ইউজারনেম: admin', 'success'); closeModal('recoveryModal'); }
      else {
        const np = $('recNewPass').value;
        if (np.length < 6) { toast('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন', 'error'); return; }
        localStorage.setItem(PASSKEY, hashPass(np));
        toast('সুপার অ্যাডমিন পাসওয়ার্ড রিসেট হয়েছে! এখন লগইন করুন।'); closeModal('recoveryModal');
      }
      return;
    }
    toast('ইমেইল ও মোবাইল নম্বর মিলছে না!', 'error');
    return;
  }

  if (mode === 'username') { toast(`আপনার ইউজারনেম: ${accounts[idx].username}`, 'success'); closeModal('recoveryModal'); }
  else {
    const np = $('recNewPass').value;
    if (np.length < 6) { toast('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন', 'error'); return; }
    accounts[idx].password = hashPass(np);
    localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts));
    toast('পাসওয়ার্ড সফলভাবে রিসেট হয়েছে! এখন লগইন করুন।'); closeModal('recoveryModal');
  }
};

// Profile & Agency Branding
function readProfile() { try { return JSON.parse(localStorage.getItem(PROFILEKEY) || '{}'); } catch (e) { return {}; } }

function applyAgencyBranding() {
  const ag = db.agency || {};
  const title = ag.name || 'Ads হিসাব ম্যানেজার';
  const tagline = ag.tagline || 'Smart · Secure · Pro v72';
  if ($('sideBrandTitle')) $('sideBrandTitle').textContent = title;
  if ($('sideBrandSub')) $('sideBrandSub').textContent = tagline;
  if ($('agName')) $('agName').value = title;
  if ($('agTagline')) $('agTagline').value = tagline;
  if ($('agPhone')) $('agPhone').value = ag.phone || '';
  if ($('agDefaultRate')) $('agDefaultRate').value = ag.defaultRate || 125;
  if ($('agDefaultFee')) $('agDefaultFee').value = ag.defaultFeePct || 0;
  if ($('agLogoUrl')) $('agLogoUrl').value = ag.logoUrl || '';
  if ($('agSignText')) $('agSignText').value = ag.signText || '';
  if ($('agPayInfo')) $('agPayInfo').value = ag.payInfo || '';
  if ($('agWaTemplate')) $('agWaTemplate').value = ag.waTemplate || DEFAULT_WA_TEMPLATE;
}

if ($('agencyForm')) $('agencyForm').onsubmit = e => {
  e.preventDefault();
  db.agency = {
    name: $('agName').value.trim() || 'Ads হিসাব ম্যানেজার',
    tagline: $('agTagline').value.trim() || 'Smart · Secure · Pro v72',
    phone: $('agPhone').value.trim(),
    defaultRate: num($('agDefaultRate').value) || 125,
    defaultFeePct: num($('agDefaultFee').value) || 0,
    logoUrl: $('agLogoUrl')?.value.trim() || '',
    signText: $('agSignText')?.value.trim() || '',
    payInfo: $('agPayInfo')?.value.trim() || '',
    waTemplate: $('agWaTemplate')?.value.trim() || DEFAULT_WA_TEMPLATE
  };
  save(); applyAgencyBranding(); logActivity('এজেন্সি ব্র্যান্ডিং আপডেট হয়েছে');
  if ($('wRate') && !num($('wRate').value)) $('wRate').value = db.agency.defaultRate;
  if ($('wFeePct')) $('wFeePct').value = db.agency.defaultFeePct;
  toast('এজেন্সি সেটিংস সেভ হয়েছে!');
};

function updateHeaderAndProfile() {
  const p = readProfile();
  const currentName = p.name || activeAccount?.name || 'User';
  const roleMap = { super_admin: 'Super Admin', admin: 'Admin', staff: 'Staff', user: 'User' };
  const currentRole = (activeAccount?.id === 'legacy-super-admin') ? 'Super Admin' : (roleMap[activeAccount?.role] || 'User');

  if ($('welcomeTitle')) $('welcomeTitle').textContent = `স্বাগতম, ${currentName}!`;
  if ($('headerProfileName')) $('headerProfileName').textContent = currentName;
  if ($('headerProfileRole')) $('headerProfileRole').textContent = currentRole;
  if ($('sideRoleName')) $('sideRoleName').textContent = currentRole;
  if ($('sideRoleDesc')) $('sideRoleDesc').textContent = isStaff() ? 'স্টাফ ওয়ার্কস্পেস (সীমিত এক্সেস)' : 'সম্পূর্ণ এক্সেস ও কন্ট্রোল';

  if ($('profileDisplayName')) $('profileDisplayName').textContent = currentName;
  if ($('profileUserId')) $('profileUserId').textContent = 'ID: AS-' + String(activeAccount?.userNumber || 1).padStart(5, '0');
  if ($('profileRoleBadge')) {
    $('profileRoleBadge').textContent = currentRole;
    $('profileRoleBadge').className = isStaff() ? 'badge-admin' : 'badge-success';
  }
  if ($('profileName')) $('profileName').value = currentName;
  if ($('profileEmail')) $('profileEmail').value = p.email || activeAccount?.email || '';
  if ($('profilePhone')) $('profilePhone').value = p.phone || activeAccount?.phone || '';

  pendingProfilePicData = p.pic || '';
  if ($('profilePicInput')) {
    if (pendingProfilePicData.startsWith('data:image/')) {
      $('profilePicInput').value = '';
      $('profilePicInput').placeholder = 'আপলোড করা ছবি সেভ আছে (নতুন লিংক দিলে বদলাবে)';
    } else {
      $('profilePicInput').value = pendingProfilePicData;
      $('profilePicInput').placeholder = 'https://... (ঐচ্ছিক)';
    }
  }

  const fallback = defaultAvatarUrl(currentName);
  const picUrl = pendingProfilePicData || fallback;
  [$('profilePreview'), $('headerProfilePic')].forEach(img => {
    if (!img) return;
    img.onerror = () => { img.onerror = null; img.src = fallback; };
    img.src = picUrl;
  });

  applyAgencyBranding();
  if (!isStaff()) renderAdminPanel();
}

if ($('profilePicFile')) $('profilePicFile').onchange = async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    const compressed = await compressImageFile(file, 240, 0.82);
    pendingProfilePicData = compressed;
    if ($('profilePreview')) $('profilePreview').src = compressed;
    if ($('profilePicInput')) $('profilePicInput').value = '';
    toast('ছবি প্রস্তুত! সেভ করতে "প্রোফাইল আপডেট করুন" বাটনে ক্লিক করুন।');
  } catch (err) { toast('ছবি প্রসেস করতে সমস্যা হয়েছে!', 'error'); }
};

if ($('removeProfilePicBtn')) $('removeProfilePicBtn').onclick = () => {
  pendingProfilePicData = '';
  if ($('profilePicInput')) $('profilePicInput').value = '';
  if ($('profilePicFile')) $('profilePicFile').value = '';
  const p = readProfile(); p.pic = '';
  localStorage.setItem(PROFILEKEY, JSON.stringify(p));
  updateHeaderAndProfile(); toast('প্রোফাইল ছবি সরানো হয়েছে', 'warn');
};

function saveProfileData(name, email, phone, pic) {
  try { localStorage.setItem(PROFILEKEY, JSON.stringify({ name, email, phone, pic })); }
  catch (e) { toast('ছবিটি অনেক বড় হওয়ায় সেভ করা যায়নি!', 'error'); return; }
  if (activeAccount) {
    activeAccount.name = name; activeAccount.email = email; activeAccount.phone = phone;
    if (activeAccount.id !== 'legacy-super-admin') {
      const accounts = readLocalAccounts(), idx = accounts.findIndex(a => a.id === activeAccount.id);
      if (idx !== -1) { accounts[idx].name = name; accounts[idx].email = email; accounts[idx].phone = phone; localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); }
    }
  }
  if ($('profilePicFile')) $('profilePicFile').value = '';
  logActivity(`প্রোফাইল আপডেট হয়েছে: ${name}`); updateHeaderAndProfile(); toast('প্রোফাইল সফলভাবে আপডেট হয়েছে!');
}

if ($('profileForm')) $('profileForm').onsubmit = e => {
  e.preventDefault();
  saveProfileData($('profileName').value.trim(), $('profileEmail').value.trim(), $('profilePhone').value.trim(), $('profilePicInput').value.trim() || pendingProfilePicData || '');
};

if ($('settingsPasswordForm')) $('settingsPasswordForm').onsubmit = e => {
  e.preventDefault();
  const oldPass = $('settingsOldPass').value, newPass = $('settingsNewPass').value, newPass2 = $('settingsNewPass2').value, msgEl = $('settingsPasswordMsg');
  if (newPass !== newPass2) { msgEl.textContent = 'নতুন পাসওয়ার্ড দুটি মিলছে না!'; return; }
  if (newPass.length < 6) { msgEl.textContent = 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে!'; return; }

  if (activeAccount && activeAccount.id !== 'legacy-super-admin') {
    if (!checkPass(oldPass, activeAccount.password)) { msgEl.textContent = 'বর্তমান পাসওয়ার্ড সঠিক নয়!'; return; }
    activeAccount.password = hashPass(newPass);
    const accounts = readLocalAccounts(), idx = accounts.findIndex(a => a.id === activeAccount.id);
    if (idx !== -1) { accounts[idx] = activeAccount; localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); }
  } else {
    const currentSuperPass = localStorage.getItem(PASSKEY) || '123456789';
    if (!checkPass(oldPass, currentSuperPass)) { msgEl.textContent = 'বর্তমান পাসওয়ার্ড সঠিক নয়!'; return; }
    localStorage.setItem(PASSKEY, hashPass(newPass));
  }
  const rem = localStorage.getItem(REMEMBER_LOGIN_KEY);
  if (rem) { try { const parsed = JSON.parse(rem); parsed.pass = newPass; localStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify(parsed)); } catch (err) {} }
  msgEl.textContent = 'পাসওয়ার্ড সফলভাবে আপডেট হয়েছে!';
  logActivity('পাসওয়ার্ড পরিবর্তন করা হয়েছে'); e.target.reset(); toast('পাসওয়ার্ড আপডেট হয়েছে!');
};

if ($('usernameForm')) $('usernameForm').onsubmit = e => {
  e.preventDefault();
  const pass = $('userChangePass').value, newU = $('newUsername').value.trim().toLowerCase(), msgEl = $('usernameMsg');
  if (newU === 'admin') { msgEl.textContent = 'এই ইউজারনেমটি সংরক্ষিত।'; return; }
  if (activeAccount && activeAccount.id !== 'legacy-super-admin') {
    if (!checkPass(pass, activeAccount.password)) { msgEl.textContent = 'পাসওয়ার্ড সঠিক নয়!'; return; }
    const accounts = readLocalAccounts();
    if (accounts.some(a => a.id !== activeAccount.id && a.username === newU)) { msgEl.textContent = 'এই ইউজারনেম আগেই নেওয়া হয়েছে!'; return; }
    activeAccount.username = newU;
    const idx = accounts.findIndex(a => a.id === activeAccount.id);
    if (idx !== -1) { accounts[idx] = activeAccount; localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); }
    const rem = localStorage.getItem(REMEMBER_LOGIN_KEY);
    if (rem) { try { const parsed = JSON.parse(rem); parsed.identity = newU; localStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify(parsed)); } catch (err) {} }
    msgEl.textContent = 'ইউজারনেম সফলভাবে আপডেট হয়েছে!';
    logActivity(`ইউজারনেম পরিবর্তন হয়েছে: ${newU}`); toast('ইউজারনেম আপডেট হয়েছে!');
  } else {
    msgEl.textContent = 'সুপার অ্যাডমিন ইউজারনেম (admin) পরিবর্তনযোগ্য নয়।';
  }
  e.target.reset();
};

// Pixel Generator
function generatePixelCode() {
  const pid = $('genPixelId').value.trim() || '1234567890';
  const event = $('genPixelEvent').value, val = num($('genPixelVal').value);
  const eventSnippet = ['Purchase','AddToCart','ViewContent','InitiateCheckout'].includes(event)
    ? `fbq('track', '${event}', {value: ${val}, currency: 'BDT'});` : `fbq('track', '${event}');`;
  $('pixelCodeOutput').textContent = `<!-- Meta Pixel Code -->
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '${pid}');
  fbq('track', 'PageView');
  ${eventSnippet}
</` + `script>`;
}
['generatePixelBtn','genPixelId','genPixelEvent','genPixelVal'].forEach(id => {
  if ($(id)) $(id)[id === 'generatePixelBtn' ? 'onclick' : 'oninput'] = generatePixelCode;
});
if ($('genPixelEvent')) $('genPixelEvent').onchange = generatePixelCode;
if ($('simulateCapiBtn')) $('simulateCapiBtn').onclick = () => {
  const pid = $('genPixelId').value.trim() || '1234567890', event = $('genPixelEvent').value, val = num($('genPixelVal').value);
  const capiPayload = {
    data: [{ event_name: event, event_time: Math.floor(Date.now() / 1000), action_source: "website",
      user_data: { em: ["f660ab912ec121d1b1e928a0bb4bc61b15f5ad44d5efdc4e1c92a25e99b8e44a"], ph: ["254c3d6360b0e047d3e63a8412e62444655513c1f10bc7537e28b86e00b8e99a"] },
      custom_data: { currency: "BDT", value: val } }],
    test_event_code: "TEST1234"
  };
  $('pixelCodeOutput').textContent = `// Meta Conversions API (CAPI) JSON Payload\n// POST https://graph.facebook.com/v20.0/${pid}/events\n\n` + JSON.stringify(capiPayload, null, 2);
};
if ($('copyPixelBtn')) $('copyPixelBtn').onclick = () => copyText($('pixelCodeOutput').textContent, 'পিক্সেল কোড');

// CRUD: Customers & Pages
if ($('customerForm')) $('customerForm').onsubmit = e => {
  e.preventDefault();
  const name = $('custName').value.trim();
  db.customers.push({ id: uid(), name, phone: $('custPhone').value.trim(), note: $('custNote').value.trim() });
  save(); logActivity(`নতুন কাস্টমার যুক্ত হয়েছে: ${name}`); e.target.reset(); toast('কাস্টমার সেভ হয়েছে!');
};
window.openEditCustomerModal = function(custId) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  $('editCustId').value = c.id; $('editCustName').value = c.name; $('editCustPhone').value = c.phone || ''; $('editCustNote').value = c.note || '';
  $('editCustomerModal').style.display = 'flex';
};
if ($('editCustomerForm')) $('editCustomerForm').onsubmit = e => {
  e.preventDefault();
  if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error');
  const c = db.customers.find(x => x.id === $('editCustId').value);
  if (c) { c.name = $('editCustName').value.trim(); c.phone = $('editCustPhone').value.trim(); c.note = $('editCustNote').value.trim(); save(); logActivity(`কাস্টমার আপডেট: ${c.name}`); closeModal('editCustomerModal'); toast('কাস্টমার আপডেট হয়েছে!'); }
};
window.deleteCustomer = function(custId) {
  if (!hasPerm('canDelete')) return toast('আপনার ডিলিট করার অনুমতি নেই!', 'error');
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  if (!confirm(`"${c.name}" এবং এর সাথে যুক্ত সকল পেজ, কাজ ও পেমেন্ট রিসাইকেল বিনে পাঠাতে চান?`)) return;
  moveToTrash('customer_bundle', `কাস্টমার: ${c.name}`, {
    customer: c,
    pages: db.pages.filter(x => x.customerId === custId),
    works: db.works.filter(x => x.customerId === custId),
    payments: db.payments.filter(x => x.customerId === custId)
  });
  db.customers = db.customers.filter(x => x.id !== custId);
  db.pages = db.pages.filter(x => x.customerId !== custId);
  db.works = db.works.filter(x => x.customerId !== custId);
  db.payments = db.payments.filter(x => x.customerId !== custId);
  delete db.reminderLogs[custId];
  save(); logActivity(`কাস্টমার ট্র্যাশে পাঠানো হয়েছে: ${c.name}`); toast('কাস্টমার রিসাইকেল বিনে পাঠানো হয়েছে', 'warn');
};

if ($('pageForm')) $('pageForm').onsubmit = e => {
  e.preventDefault();
  const name = $('pageName').value.trim();
  db.pages.push({ id: uid(), customerId: $('pageCustomer').value, name, link: $('pageLink').value.trim(), adId: $('pageAdId').value.trim(), pixelId: $('pagePixelId').value.trim() });
  save(); logActivity(`নতুন পেজ যুক্ত: ${name}`); e.target.reset(); toast('পেজ সেভ হয়েছে!');
};
window.openEditPageModal = function(pageId) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const p = db.pages.find(x => x.id === pageId); if (!p) return;
  $('editPageId').value = p.id; $('editPageName').value = p.name; $('editPageLink').value = p.link || ''; $('editPageAdId').value = p.adId || ''; $('editPagePixelId').value = p.pixelId || '';
  $('editPageModal').style.display = 'flex';
};
if ($('editPageForm')) $('editPageForm').onsubmit = e => {
  e.preventDefault();
  const p = db.pages.find(x => x.id === $('editPageId').value);
  if (p) { p.name = $('editPageName').value.trim(); p.link = $('editPageLink').value.trim(); p.adId = $('editPageAdId').value.trim(); p.pixelId = $('editPagePixelId').value.trim(); save(); closeModal('editPageModal'); toast('পেজ আপডেট হয়েছে!'); }
};
window.deletePage = function(pageId) {
  if (!hasPerm('canDelete')) return toast('আপনার ডিলিট করার অনুমতি নেই!', 'error');
  const p = db.pages.find(x => x.id === pageId); if (!p || !confirm('পেজটি রিসাইকেল বিনে পাঠাবেন?')) return;
  moveToTrash('page', `পেজ: ${p.name}`, p);
  db.pages = db.pages.filter(x => x.id !== pageId); save(); toast('পেজ রিসাইকেল বিনে পাঠানো হয়েছে', 'warn');
};

// Client Profile + Debit/Credit Ledger Statement
window.exportClientLedgerCsv = function(custId) {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const entries = [
    ...db.works.filter(w => w.customerId === custId).map(w => ({ date: w.date, desc: `কাজ: ${w.name}`, debit: bill(w), credit: 0 })),
    ...db.payments.filter(p => p.customerId === custId).map(p => ({ date: p.date, desc: `পেমেন্ট (${p.method}) ${p.ref || ''}`, debit: 0, credit: num(p.amount) }))
  ].sort((a, b) => a.date.localeCompare(b.date));
  let bal = 0;
  const rows = [['Date', 'Description', 'Bill / Debit (BDT)', 'Paid / Credit (BDT)', 'Running Balance (BDT)']];
  entries.forEach(en => { bal += en.credit - en.debit; rows.push([en.date, en.desc, en.debit.toFixed(2), en.credit.toFixed(2), bal.toFixed(2)]); });
  downloadBlob('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), `ledger_${c.name.replace(/\s+/g, '_')}_${today()}.csv`, 'text/csv;charset=utf-8;');
  toast('লেজার স্টেটমেন্ট CSV ডাউনলোড হয়েছে!');
};

window.openClientProfile = function(custId) {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const cPages = db.pages.filter(p => p.customerId === custId);
  const cWorks = db.works.filter(w => w.customerId === custId);
  const cPays = db.payments.filter(p => p.customerId === custId);
  const totalB = billed(custId), totalP = paid(custId), bal = clientBalance(custId);
  const totalUsd = cWorks.reduce((s, w) => s + num(w.actualDollar), 0);
  const totalProf = cWorks.reduce((s, w) => s + profit(w), 0);

  let balBadge = `<span class="badge-success">সমন্বিত (৳0.00)</span>`;
  if (bal < 0) balBadge = `<span class="badge-danger">বকেয়া বাকি: ${money(-bal)}</span>`;
  else if (bal > 0) balBadge = `<span class="badge-success">অ্যাডভান্স জমা: ${money(bal)}</span>`;

  const ledger = [
    ...cWorks.map(w => ({ date: w.date, desc: `ক্যাম্পেইন: ${w.name} (${usd(w.actualDollar)})`, debit: bill(w), credit: 0 })),
    ...cPays.map(p => ({ date: p.date, desc: `পেমেন্ট (${p.method})${p.ref ? ' · ' + p.ref : ''}`, debit: 0, credit: num(p.amount) }))
  ].sort((a, b) => a.date.localeCompare(b.date));
  let runBal = 0;
  const ledgerHtml = ledger.map(row => {
    runBal += row.credit - row.debit;
    const bTxt = runBal < 0 ? `<span class="bad">বকেয়া ${money(-runBal)}</span>` : (runBal > 0 ? `<span class="good">অ্যাড ${money(runBal)}</span>` : `৳0.00`);
    return `<tr><td>${esc(row.date)}</td><td>${esc(row.desc)}</td><td class="bad">${row.debit ? money(row.debit) : '—'}</td><td class="good">${row.credit ? money(row.credit) : '—'}</td><td>${bTxt}</td></tr>`;
  }).join('') || '<tr><td colspan="5">কোনো লেনদেন নেই</td></tr>';

  $('cpTitle').textContent = `👤 ${c.name} — প্রোফাইল ও লেজার`;
  $('cpBody').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px;padding:12px;background:var(--soft);border-radius:12px;border:1px solid var(--line)">
      <div style="font-size:13px;line-height:1.7">
        <strong>মোবাইল:</strong> ${esc(c.phone || '—')}<br>
        <strong>নোট:</strong> ${esc(c.note || '—')}<br>
        <strong>মোট ব্যয়কৃত ডলার:</strong> ${usd(totalUsd)}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="secondary sm" onclick="closeModal('clientProfileModal');openInvoice('${c.id}')">📄 ইনভয়েস</button>
        <button type="button" class="secondary sm" onclick="exportClientLedgerCsv('${c.id}')">📥 লেজার CSV</button>
        <button type="button" class="secondary sm" onclick="sendWhatsAppReminder('${c.id}')">📲 WhatsApp</button>
        <button type="button" class="secondary sm perm-edit" onclick="closeModal('clientProfileModal');openEditCustomerModal('${c.id}')">✏️ এডিট</button>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <span class="badge-admin">মোট বিল: ${money(totalB)}</span>
      <span class="badge-success">মোট আদায়: ${money(totalP)}</span>
      ${balBadge}
      ${isStaff() ? '' : `<span class="badge-status status-running">নিট প্রফিট: ${money(totalProf)}</span>`}
    </div>
    <h4>📄 যুক্ত থাকা ফেসবুক পেজ ও পিক্সেল (${cPages.length})</h4>
    <ul style="font-size:13px;padding-left:20px;margin-bottom:16px;line-height:1.8">
      ${cPages.map(p => `<li><strong>${esc(p.name)}</strong> ${p.link ? `(<a href="${esc(p.link)}" target="_blank">লিংক ↗</a>)` : ''} — Ad ID: <code>${esc(p.adId || 'N/A')}</code>, Pixel: <code>${esc(p.pixelId || 'N/A')}</code></li>`).join('') || '<li>কোনো পেজ যুক্ত নেই</li>'}
    </ul>
    <h4>📑 তারিখ অনুযায়ী লেজার স্টেটমেন্ট (Debit / Credit)</h4>
    <div class="tablewrap" style="max-height:240px;margin-bottom:16px">
      <table><thead><tr><th>তারিখ</th><th>বিবরণ</th><th>বিল (ডেবিট)</th><th>জমা (ক্রেডিট)</th><th>ব্যালেন্স</th></tr></thead>
      <tbody>${ledgerHtml}</tbody></table>
    </div>
    <h4>⚡ ক্যাম্পেইনসমূহ (${cWorks.length})</h4>
    <div class="tablewrap" style="max-height:170px">
      <table><thead><tr><th>তারিখ</th><th>কাজ</th><th>বাজেট / ব্যবহৃত $</th><th>বিল</th><th>স্ট্যাটাস</th></tr></thead>
      <tbody>${cWorks.map(w => `<tr><td>${esc(w.date)}</td><td>${esc(w.name)}</td><td>${usd(w.dollar)} / <strong>${usd(w.actualDollar)}</strong></td><td>${money(bill(w))}</td><td>${esc(w.status)}</td></tr>`).join('') || '<tr><td colspan="5">কোনো কাজ নেই</td></tr>'}</tbody></table>
    </div>`;
  $('clientProfileModal').style.display = 'flex';
};

// Invoice Modal (Date Range + Logo + Signature + Payment History + Pay Info + PNG)
let currentInvoiceCustId = null;
function getInvoiceFilteredData(custId) {
  const from = $('invFrom')?.value || '', to = $('invTo')?.value || '';
  const custWorks = db.works.filter(w => w.customerId === custId && inDateRange(w.date, from, to));
  const custPays = db.payments.filter(p => p.customerId === custId && inDateRange(p.date, from, to)).sort((a, b) => b.date.localeCompare(a.date));
  const b = custWorks.reduce((s, w) => s + bill(w), 0);
  const p = custPays.reduce((s, pay) => s + num(pay.amount), 0);
  return { from, to, custWorks, custPays, b, p, bal: p - b };
}

window.openInvoice = function(custId, keepDates = false) {
  const customer = db.customers.find(c => c.id === custId); if (!customer) return;
  currentInvoiceCustId = custId;
  if (!keepDates) {
    if ($('invFrom')) $('invFrom').value = '';
    if ($('invTo')) $('invTo').value = '';
  }
  const ag = db.agency || {};
  if ($('invLogoImg')) {
    if (ag.logoUrl) { $('invLogoImg').src = ag.logoUrl; $('invLogoImg').style.display = 'block'; }
    else $('invLogoImg').style.display = 'none';
  }
  $('invAgencyName').textContent = ag.name || 'Ads হিসাব ম্যানেজার';
  $('invAgencyContact').textContent = ag.phone ? `যোগাযোগ: ${ag.phone}` : 'প্রফেশনাল ইনভয়েস ও ক্যাশ মেমো';
  $('invDate').textContent = 'তারিখ: ' + today();
  $('invId').textContent = 'ইনভয়েস নং: #INV-' + custId.slice(-5).toUpperCase();
  $('invCustName').textContent = customer.name;
  $('invCustPhone').textContent = 'ফোন: ' + (customer.phone || '—');

  const { from, to, custWorks, custPays, b, p, bal } = getInvoiceFilteredData(custId);
  if ($('invPeriodLabel')) $('invPeriodLabel').textContent = (from || to) ? `সময়কাল: ${from || 'শুরু'} থেকে ${to || 'আজ'}` : '';

  const stamp = $('invStatusStamp');
  if (bal > 0) { stamp.textContent = 'ADVANCE PAID'; stamp.className = 'badge-success'; }
  else if (b > 0 && bal === 0) { stamp.textContent = 'PAID'; stamp.className = 'badge-success'; }
  else if (p > 0 && bal < 0) { stamp.textContent = 'PARTIAL'; stamp.className = 'badge-status status-running'; }
  else { stamp.textContent = 'DUE'; stamp.className = 'badge-danger'; }

  $('invRows').innerHTML = custWorks.map(w => `<tr><td>${esc(w.date)}</td><td>${esc(w.name)} (${esc(pname(w.pageId) || 'Page')})</td><td>${usd(w.actualDollar)} × ${money(w.rate)}</td><td>${money(bill(w))}</td></tr>`).join('') || `<tr><td colspan="4">নির্বাচিত সময়ে কোনো কাজের রেকর্ড নেই</td></tr>`;
  $('invTotalBill').textContent = money(b);
  $('invTotalPaid').textContent = money(p);

  if ($('invPayWrap') && $('invPayRows')) {
    $('invPayWrap').style.display = custPays.length ? 'block' : 'none';
    $('invPayRows').innerHTML = custPays.slice(0, 10).map(pay =>
      `<tr><td>${esc(pay.date)}</td><td>${esc(pay.method)}</td><td>${esc(pay.ref || pay.note || '—')}</td><td class="good">${money(pay.amount)}</td></tr>`
    ).join('');
  }

  if (bal > 0) $('invBalanceBox').innerHTML = `অ্যাডভান্স জমা: <strong style="color:#059669">${money(bal)}</strong>`;
  else $('invBalanceBox').innerHTML = `বকেয়া বাকি: <strong id="invTotalDue" style="color:#dc2626">${money(Math.max(0, -bal))}</strong>`;

  if ($('invPayInfoBox')) {
    if (ag.payInfo) { $('invPayInfoBox').style.display = 'block'; $('invPayInfoBox').innerHTML = `<strong>💳 পেমেন্ট পাঠানোর মাধ্যম:</strong> ${esc(ag.payInfo)}`; }
    else $('invPayInfoBox').style.display = 'none';
  }
  if ($('invSignWrap') && $('invSignText')) {
    $('invSignWrap').style.display = ag.signText ? 'flex' : 'none';
    $('invSignText').textContent = ag.signText || 'Authorized Signature';
  }
  $('invoiceModal').style.display = 'flex';
};

if ($('invApplyBtn')) $('invApplyBtn').onclick = () => { if (currentInvoiceCustId) openInvoice(currentInvoiceCustId, true); };
if ($('invResetBtn')) $('invResetBtn').onclick = () => { if (currentInvoiceCustId) openInvoice(currentInvoiceCustId, false); };

window.printInvoice = function() {
  document.body.classList.add('printing-invoice');
  window.print();
  setTimeout(() => document.body.classList.remove('printing-invoice'), 400);
};

window.downloadInvoicePng = function() {
  const customer = db.customers.find(c => c.id === currentInvoiceCustId);
  if (!customer) return;
  const { from, to, custWorks, custPays, b, p, bal } = getInvoiceFilteredData(customer.id);
  const ag = db.agency || {};
  const shownPays = custPays.slice(0, 6);

  const rowH = 32;
  const paySectionH = shownPays.length ? (56 + shownPays.length * 28) : 0;
  const payInfoH = ag.payInfo ? 44 : 0;
  const signH = ag.signText ? 34 : 0;
  const W = 820;
  const H = 370 + Math.max(1, custWorks.length) * rowH + paySectionH + payInfoH + signH;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2563eb'; ctx.fillRect(0, 0, W, 10);

  ctx.fillStyle = '#2563eb'; ctx.font = 'bold 26px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText(ag.name || 'Ads হিসাব ম্যানেজার', 40, 56);
  ctx.fillStyle = '#64748b'; ctx.font = '14px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText(ag.phone ? `যোগাযোগ: ${ag.phone}` : 'প্রফেশনাল ইনভয়েস ও ক্যাশ মেমো', 40, 80);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 15px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText(`তারিখ: ${today()}`, W - 40, 52);
  ctx.fillStyle = '#64748b'; ctx.font = '13px Inter, Arial, sans-serif';
  ctx.fillText(`ইনভয়েস: #INV-${customer.id.slice(-5).toUpperCase()}`, W - 40, 74);

  const statusText = bal > 0 ? 'ADVANCE' : (b > 0 && bal === 0 ? 'PAID' : (p > 0 ? 'PARTIAL' : 'DUE'));
  ctx.fillStyle = bal >= 0 && (b > 0 || p > 0) ? '#059669' : '#dc2626';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText(`[ ${statusText} ]`, W - 40, 96);

  ctx.textAlign = 'left';
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(40, 112); ctx.lineTo(W - 40, 112); ctx.stroke();

  ctx.fillStyle = '#475569'; ctx.font = 'bold 13px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText('কাস্টমার বিবরণ:', 40, 140);
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 18px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText(customer.name, 40, 165);
  ctx.fillStyle = '#475569'; ctx.font = '13px Inter, Arial, sans-serif';
  ctx.fillText(`ফোন: ${customer.phone || '—'}`, 40, 186);
  if (from || to) {
    ctx.textAlign = 'right'; ctx.fillStyle = '#64748b';
    ctx.fillText(`সময়কাল: ${from || 'শুরু'} - ${to || 'আজ'}`, W - 40, 186);
    ctx.textAlign = 'left';
  }

  let y = 210;
  ctx.fillStyle = '#f1f5f9'; ctx.fillRect(40, y, W - 80, 32);
  ctx.fillStyle = '#334155'; ctx.font = 'bold 13px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText('তারিখ', 52, y + 21);
  ctx.fillText('কাজের বিবরণ', 165, y + 21);
  ctx.fillText('ডলার × রেট', 475, y + 21);
  ctx.textAlign = 'right'; ctx.fillText('বিল (৳)', W - 52, y + 21);
  ctx.textAlign = 'left';
  y += 32;

  if (!custWorks.length) {
    ctx.fillStyle = '#64748b'; ctx.font = '13px Inter, Arial, sans-serif';
    ctx.fillText('কোনো কাজের রেকর্ড নেই', 52, y + 21);
    y += rowH;
  } else {
    custWorks.forEach((w, idx) => {
      if (idx % 2 === 1) { ctx.fillStyle = '#f8fafc'; ctx.fillRect(40, y, W - 80, rowH); }
      ctx.fillStyle = '#1e293b'; ctx.font = '13px Inter, "Noto Sans Bengali", Arial, sans-serif';
      ctx.fillText(w.date || '', 52, y + 21);
      ctx.fillText(String(w.name).slice(0, 34), 165, y + 21);
      ctx.fillText(`${usd(w.actualDollar)} × ${num(w.rate)}`, 475, y + 21);
      ctx.textAlign = 'right'; ctx.fillText(money(bill(w)), W - 52, y + 21);
      ctx.textAlign = 'left';
      y += rowH;
    });
  }

  if (shownPays.length) {
    y += 14;
    ctx.fillStyle = '#334155'; ctx.font = 'bold 13px Inter, "Noto Sans Bengali", Arial, sans-serif';
    ctx.fillText('আদায়কৃত পেমেন্ট বিবরণ:', 40, y + 12);
    y += 22;
    ctx.fillStyle = '#ecfdf5'; ctx.fillRect(40, y, W - 80, 26);
    ctx.fillStyle = '#065f46'; ctx.font = 'bold 12px Inter, "Noto Sans Bengali", Arial, sans-serif';
    ctx.fillText('তারিখ', 52, y + 17);
    ctx.fillText('মাধ্যম', 175, y + 17);
    ctx.fillText('রেফারেন্স', 310, y + 17);
    ctx.textAlign = 'right'; ctx.fillText('জমা (৳)', W - 52, y + 17);
    ctx.textAlign = 'left';
    y += 26;
    shownPays.forEach(pay => {
      ctx.fillStyle = '#1e293b'; ctx.font = '12.5px Inter, "Noto Sans Bengali", Arial, sans-serif';
      ctx.fillText(pay.date || '', 52, y + 19);
      ctx.fillText(pay.method || '', 175, y + 19);
      ctx.fillText(String(pay.ref || pay.note || '—').slice(0, 28), 310, y + 19);
      ctx.textAlign = 'right'; ctx.fillStyle = '#059669'; ctx.fillText(money(pay.amount), W - 52, y + 19);
      ctx.textAlign = 'left';
      y += 28;
    });
  }

  y += 16;
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(40, y, W - 80, 50);
  ctx.strokeStyle = '#cbd5e1'; ctx.strokeRect(40, y, W - 80, 50);
  ctx.font = 'bold 14px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillStyle = '#0f172a'; ctx.fillText(`মোট বিল: ${money(b)}`, 60, y + 30);
  ctx.fillStyle = '#059669'; ctx.fillText(`মোট আদায়: ${money(p)}`, 320, y + 30);
  ctx.textAlign = 'right';
  if (bal > 0) { ctx.fillStyle = '#059669'; ctx.fillText(`অ্যাডভান্স: ${money(bal)}`, W - 60, y + 30); }
  else { ctx.fillStyle = '#dc2626'; ctx.fillText(`বকেয়া: ${money(Math.max(0, -bal))}`, W - 60, y + 30); }
  y += 50;

  if (ag.payInfo) {
    y += 12;
    ctx.fillStyle = '#eff6ff'; ctx.fillRect(40, y, W - 80, 32);
    ctx.textAlign = 'left'; ctx.fillStyle = '#1e3a8a'; ctx.font = '12.5px Inter, "Noto Sans Bengali", Arial, sans-serif';
    ctx.fillText(`পেমেন্ট মাধ্যম: ${String(ag.payInfo).slice(0, 88)}`, 52, y + 20);
  }
  if (ag.signText) {
    ctx.textAlign = 'right'; ctx.fillStyle = '#334155'; ctx.font = 'bold 12px Inter, "Noto Sans Bengali", Arial, sans-serif';
    ctx.fillText(`স্বাক্ষর: ${ag.signText}`, W - 44, H - 38);
  }

  ctx.textAlign = 'center'; ctx.fillStyle = '#64748b'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText('ধন্যবাদ! আপনার ব্যবসার সফলতা কামনা করছি।', W / 2, H - 16);

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `invoice_${customer.name.replace(/\s+/g, '_')}_${today()}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('ইনভয়েস ছবি (PNG) ডাউনলোড হয়েছে!');
  }, 'image/png');
};

// Cards & Deposits + Card Statement + Edit Card
if ($('addCardForm')) $('addCardForm').onsubmit = e => {
  e.preventDefault();
  const name = $('newCardInput').value.trim(); if (!name) return;
  db.cards.push({ id: uid(), name }); save(); logActivity(`নতুন কার্ড যুক্ত: ${name}`);
  $('newCardInput').value = ''; toast('নতুন কার্ড যুক্ত হয়েছে!');
};
if ($('depositForm')) $('depositForm').onsubmit = e => {
  e.preventDefault();
  if (!$('depositCard').value) { toast('প্রথমে একটি কার্ড যোগ করুন!', 'error'); return; }
  db.cardDeposits.push({ id: uid(), cardId: $('depositCard').value, date: $('depositDate').value, amount: num($('depositAmount').value), taka: num($('depositTaka').value), note: $('depositNote').value.trim() });
  save(); logActivity(`কার্ডে ডিপোজিট: $${$('depositAmount').value}`); e.target.reset(); $('depositDate').value = today(); toast('ডলার ডিপোজিট সেভ হয়েছে!');
};
function cardSpent(cardId) { return db.works.filter(w => (w.cardId || '') === cardId).reduce((s, w) => s + num(w.actualDollar), 0); }

window.editCardName = function(cardId) {
  const c = db.cards.find(x => x.id === cardId); if (!c) return;
  const n = prompt('কার্ডের নতুন নাম লিখুন:', c.name);
  if (n && n.trim()) { c.name = n.trim(); save(); toast('কার্ডের নাম আপডেট হয়েছে!'); }
};
window.deleteCard = function(cardId) {
  if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error');
  const c = db.cards.find(x => x.id === cardId); if (!c || !confirm('কার্ডটি রিসাইকেল বিনে পাঠাবেন?')) return;
  moveToTrash('card', `কার্ড: ${c.name}`, c);
  db.cards = db.cards.filter(x => x.id !== cardId); save(); toast('কার্ড রিসাইকেল বিনে পাঠানো হয়েছে', 'warn');
};
window.deleteDeposit = function(depId) {
  if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error');
  const d = db.cardDeposits.find(x => x.id === depId); if (!d || !confirm('ডিপোজিটটি রিসাইকেল বিনে পাঠাবেন?')) return;
  moveToTrash('deposit', `ডিপোজিট: $${d.amount}`, d);
  db.cardDeposits = db.cardDeposits.filter(x => x.id !== depId); save(); toast('ডিপোজিট রিসাইকেল বিনে পাঠানো হয়েছে', 'warn');
};

window.openCardStatement = function(cardId) {
  const c = db.cards.find(x => x.id === cardId); if (!c) return;
  const deps = db.cardDeposits.filter(d => d.cardId === cardId).map(d => ({ date: d.date, type: 'ডিপোজিট', desc: `${money(d.taka)} ${d.note ? '· ' + d.note : ''}`, plus: num(d.amount), minus: 0 }));
  const spds = db.works.filter(w => w.cardId === cardId).map(w => ({ date: w.date, type: 'FB খরচ', desc: `${cname(w.customerId)} — ${w.name}`, plus: 0, minus: num(w.actualDollar) }));
  const all = [...deps, ...spds].sort((a, b) => a.date.localeCompare(b.date));
  let bal = 0;
  $('csTitle').textContent = `💳 ${c.name} — কার্ড স্টেটমেন্ট`;
  const totIn = deps.reduce((s, x) => s + x.plus, 0), totOut = spds.reduce((s, x) => s + x.minus, 0);
  $('csSummary').innerHTML = `
    <span class="badge-success">মোট ডিপোজিট: ${usd(totIn)}</span>
    <span class="badge-danger">মোট খরচ: ${usd(totOut)}</span>
    <span class="badge-admin">বর্তমান ব্যালেন্স: ${usd(totIn - totOut)}</span>`;
  $('csRows').innerHTML = all.map(r => {
    bal += r.plus - r.minus;
    return `<tr><td>${esc(r.date)}</td><td>${esc(r.type)}</td><td>${esc(r.desc)}</td>
      <td class="good">${r.plus ? '+' + usd(r.plus) : '—'}</td><td class="bad">${r.minus ? '-' + usd(r.minus) : '—'}</td>
      <td class="${bal < 0 ? 'bad' : 'good'}">${usd(bal)}</td></tr>`;
  }).join('') || '<tr><td colspan="6">কোনো লেনদেন নেই</td></tr>';
  $('cardStatementModal').style.display = 'flex';
};

function renderCards() {
  if (isStaff()) return;
  const totals = db.cards.map(c => {
    const deps = db.cardDeposits.filter(d => d.cardId === c.id);
    const deposited = deps.reduce((s, d) => s + num(d.amount), 0);
    const takaSpent = deps.reduce((s, d) => s + num(d.taka), 0);
    const avgRate = deposited > 0 ? (takaSpent / deposited) : 0;
    const spent = cardSpent(c.id);
    return { ...c, deposited, takaSpent, avgRate, spent, balance: deposited - spent };
  });
  if ($('cardMetrics')) $('cardMetrics').innerHTML = totals.map(c => `
    <div class="metric-card m1" style="padding:15px">
      <small>${esc(c.name)}</small><strong>${usd(c.balance)}</strong>
      <span class="trend">গড় রেট: ${c.avgRate ? money(c.avgRate) : '—'}</span>
    </div>`).join('') || `<div class="muted">কোনো কার্ড যোগ করা হয়নি</div>`;
  if ($('dashCardSummary')) $('dashCardSummary').innerHTML = totals.map(c => `
    <div style="padding:6px 10px;border-radius:9px;background:var(--soft);border:1px solid var(--line);font-size:12px">
      <strong>${esc(c.name)}:</strong> <span class="${c.balance < 20 ? 'bad' : 'good'}">${usd(c.balance)}</span>
    </div>`).join('') || `<span class="muted">কোনো কার্ড নেই</span>`;
  if ($('cardBalanceRows')) $('cardBalanceRows').innerHTML = totals.map(c => `
    <tr><td><strong>${esc(c.name)}</strong></td><td>${usd(c.deposited)}</td><td>${money(c.takaSpent)}</td>
      <td>${c.avgRate ? money(c.avgRate) : '—'}</td><td>${usd(c.spent)}</td>
      <td class="${c.balance < 0 ? 'bad' : 'good'}">${usd(c.balance)}</td>
      <td>
        <button type="button" class="secondary sm" onclick="openCardStatement('${c.id}')">📄 স্টেটমেন্ট</button>
        <button type="button" class="secondary sm" onclick="editCardName('${c.id}')">✏️</button>
        <button type="button" class="danger sm perm-del" onclick="deleteCard('${c.id}')">মুছুন</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="7">কোনো কার্ড নেই</td></tr>`;
  const cnameCard = id => db.cards.find(x => x.id === id)?.name || 'মুছে ফেলা কার্ড';
  if ($('depositHistoryRows')) $('depositHistoryRows').innerHTML = [...db.cardDeposits].sort((a,b) => b.date.localeCompare(a.date)).map(d => {
    const r = num(d.amount) > 0 ? num(d.taka) / num(d.amount) : 0;
    return `<tr><td>${esc(d.date)}</td><td><strong>${esc(cnameCard(d.cardId))}</strong></td><td>${usd(d.amount)}</td><td>${money(d.taka)}</td><td>${r ? money(r) : '—'}</td><td>${esc(d.note || '—')}</td>
      <td>
        <button type="button" class="secondary sm" onclick="openEditDepositModal('${d.id}')">✏️ এডিট</button>
        <button type="button" class="danger sm perm-del" onclick="deleteDeposit('${d.id}')">মুছুন</button>
      </td></tr>`;
  }).join('') || `<tr><td colspan="7">কোনো ডিপোজিট হিস্ট্রি নেই</td></tr>`;
}

window.openEditDepositModal = function(depId) {
  const d = db.cardDeposits.find(x => x.id === depId); if (!d) return;
  fillSelect('edCard', db.cards, '');
  $('edId').value = d.id; $('edCard').value = d.cardId; $('edDate').value = d.date;
  $('edAmount').value = d.amount; $('edTaka').value = d.taka; $('edNote').value = d.note || '';
  $('editDepositModal').style.display = 'flex';
};
if ($('editDepositForm')) $('editDepositForm').onsubmit = e => {
  e.preventDefault();
  const d = db.cardDeposits.find(x => x.id === $('edId').value);
  if (d) {
    d.cardId = $('edCard').value; d.date = $('edDate').value;
    d.amount = num($('edAmount').value); d.taka = num($('edTaka').value); d.note = $('edNote').value.trim();
    save(); logActivity(`ডিপোজিট এডিট: $${d.amount}`); closeModal('editDepositModal'); toast('ডিপোজিট আপডেট হয়েছে!');
  }
};

// Daily Rates
if ($('rateForm')) $('rateForm').onsubmit = e => {
  e.preventDefault();
  db.rates.push({ id: uid(), date: $('rateDate').value, value: num($('rateValue').value), note: $('rateNote').value.trim() });
  save(); e.target.reset(); $('rateDate').value = today(); toast('দৈনিক রেট সেভ হয়েছে!');
};
window.openEditRateModal = function(id) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const r = db.rates.find(x => x.id === id); if (!r) return;
  $('erId').value = r.id; $('erDate').value = r.date; $('erValue').value = r.value; $('erNote').value = r.note || '';
  $('editRateModal').style.display = 'flex';
};
if ($('editRateForm')) $('editRateForm').onsubmit = e => {
  e.preventDefault();
  const r = db.rates.find(x => x.id === $('erId').value);
  if (r) { r.date = $('erDate').value; r.value = num($('erValue').value); r.note = $('erNote').value.trim(); save(); closeModal('editRateModal'); toast('রেট আপডেট হয়েছে!'); }
};
window.deleteRate = function(id) {
  if (!hasPerm('canDelete')) return toast('আপনার ডিলিট করার অনুমতি নেই!', 'error');
  const r = db.rates.find(x => x.id === id); if (!r) return;
  moveToTrash('rate', `ডলার রেট: ${money(r.value)} (${r.date})`, r);
  db.rates = db.rates.filter(x => x.id !== id); save(); toast('রেট রিসাইকেল বিনে পাঠানো হয়েছে', 'warn');
};

// Works + Progress Bar + Quick Spend
window.quickAddSpend = function(workId) {
  const w = db.works.find(x => x.id === workId); if (!w) return;
  const add = prompt(`"${w.name}"-এ নতুন কত ডলার ($) খরচ যোগ করবেন?`, '10');
  if (add === null) return;
  const v = num(add);
  if (v <= 0) { toast('সঠিক ডলার সংখ্যা দিন', 'error'); return; }
  w.actualDollar = +(num(w.actualDollar) + v).toFixed(2);
  save(); logActivity(`খরচ যোগ (+$${v}): ${w.name}`); toast(`+$${v} যোগ হয়েছে!`);
};
function progressBarHtml(spent, budget) {
  if (!budget || budget <= 0) return '';
  const pct = Math.round((spent / budget) * 100);
  const color = pct > 100 ? '#dc2626' : (pct >= 85 ? '#d97706' : '#10b981');
  return `<div class="prog-wrap" title="${pct}% বাজেট ব্যবহৃত"><div class="prog-bar" style="width:${Math.min(100, pct)}%;background:${color}"></div></div>`;
}

if ($('workForm')) $('workForm').onsubmit = e => {
  e.preventDefault();
  const date = $('wDate').value, rate = num($('wRate').value) || rateFor(date);
  if (!rate) { toast('ডলারের বিলিং রেট দিন!', 'error'); return; }
  const pageId = $('wPage').value, custId = $('wCustomer').value || pageCustomer(pageId);
  db.works.push({
    id: uid(), date, customerId: custId, pageId,
    name: $('wName').value.trim(), days: num($('wDays').value), dollar: num($('wDollar').value),
    rate, actualDollar: num($('wActualDollar').value), cardId: $('wCard').value,
    actualRate: num($('wActualRate').value), feePct: num($('wFeePct').value), other: num($('wOther').value),
    revenue: num($('wRevenue').value), conversions: num($('wConversions').value),
    creativeLink: $('wCreativeLink').value.trim(), status: $('wStatus').value, note: $('wNote').value.trim()
  });
  save(); logActivity(`নতুন কাজ যুক্ত: ${$('wName').value.trim()}`);
  e.target.reset(); $('wDate').value = today(); $('wDays').value = 7;
  $('wRate').value = rateFor(today()) || ''; $('wFeePct').value = num(db.agency?.defaultFeePct) || 0;
  updateWorkPreview(); toast('কাজ সফলভাবে সেভ হয়েছে!');
};

window.openEditWorkModal = function(workId) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const w = db.works.find(x => x.id === workId); if (!w) return;
  refresh();
  $('ewId').value = w.id; $('ewDate').value = w.date; $('ewCustomer').value = w.customerId || '';
  updateEditWorkPages(); $('ewPage').value = w.pageId || '';
  $('ewName').value = w.name; $('ewDays').value = w.days || 1; $('ewDollar').value = w.dollar || 0;
  $('ewRate').value = w.rate || 0; $('ewActualDollar').value = w.actualDollar || 0;
  $('ewCard').value = w.cardId || ''; $('ewActualRate').value = w.actualRate || 0;
  $('ewFeePct').value = w.feePct || 0; $('ewOther').value = w.other || 0;
  $('ewRevenue').value = w.revenue || 0; $('ewConversions').value = w.conversions || 0;
  $('ewCreativeLink').value = w.creativeLink || ''; $('ewStatus').value = w.status || 'running'; $('ewNote').value = w.note || '';
  updateEditWorkPreview(); $('editWorkModal').style.display = 'flex';
};
if ($('editWorkForm')) $('editWorkForm').onsubmit = e => {
  e.preventDefault();
  const w = db.works.find(x => x.id === $('ewId').value); if (!w) return;
  w.date = $('ewDate').value; w.customerId = $('ewCustomer').value || pageCustomer($('ewPage').value);
  w.pageId = $('ewPage').value; w.name = $('ewName').value.trim(); w.days = num($('ewDays').value);
  w.dollar = num($('ewDollar').value); w.rate = num($('ewRate').value); w.actualDollar = num($('ewActualDollar').value);
  if (!isStaff()) {
    w.cardId = $('ewCard').value; w.actualRate = num($('ewActualRate').value);
    w.feePct = num($('ewFeePct').value); w.other = num($('ewOther').value);
  }
  w.revenue = num($('ewRevenue').value); w.conversions = num($('ewConversions').value);
  w.creativeLink = $('ewCreativeLink').value.trim(); w.status = $('ewStatus').value; w.note = $('ewNote').value.trim();
  save(); logActivity(`কাজ এডিট: ${w.name}`); closeModal('editWorkModal'); toast('কাজের হিসাব আপডেট হয়েছে!');
};
window.cloneWork = function(workId) {
  const w = db.works.find(x => x.id === workId); if (!w) return;
  const cloned = { ...w, id: uid(), date: today(), name: w.name + ' (Copy)' };
  db.works.push(cloned); save(); logActivity(`কাজ ক্লোন: ${cloned.name}`); toast('ক্যাম্পেইন ক্লোন হয়েছে!');
};
window.deleteWork = function(workId) {
  if (!hasPerm('canDelete')) return toast('আপনার ডিলিট করার অনুমতি নেই!', 'error');
  const w = db.works.find(x => x.id === workId); if (!w || !confirm('কাজটি রিসাইকেল বিনে পাঠাতে চান?')) return;
  moveToTrash('work', `কাজ: ${w.name} (${cname(w.customerId)})`, w);
  db.works = db.works.filter(x => x.id !== workId); save(); logActivity(`কাজ ট্র্যাশে: ${w.name}`); toast('কাজ রিসাইকেল বিনে পাঠানো হয়েছে', 'warn');
};

// Expenses & Payments
if ($('expenseForm')) $('expenseForm').onsubmit = e => {
  e.preventDefault();
  if (!hasPerm('canExpenses')) return toast('অনুমতি নেই!', 'error');
  db.expenses.push({ id: uid(), date: $('expDate').value, title: $('expTitle').value.trim(), category: $('expCategory').value, amount: num($('expAmount').value), note: $('expNote').value.trim() });
  save(); logActivity(`অফিস খরচ: ${$('expTitle').value.trim()}`); e.target.reset(); $('expDate').value = today(); toast('অফিস খরচ সেভ হয়েছে!');
};
window.openEditExpenseModal = function(id) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const ex = db.expenses.find(x => x.id === id); if (!ex) return;
  $('eeId').value = ex.id; $('eeDate').value = ex.date; $('eeTitle').value = ex.title; $('eeCategory').value = ex.category; $('eeAmount').value = ex.amount; $('eeNote').value = ex.note || '';
  $('editExpenseModal').style.display = 'flex';
};
if ($('editExpenseForm')) $('editExpenseForm').onsubmit = e => {
  e.preventDefault();
  const ex = db.expenses.find(x => x.id === $('eeId').value);
  if (ex) { ex.date = $('eeDate').value; ex.title = $('eeTitle').value.trim(); ex.category = $('eeCategory').value; ex.amount = num($('eeAmount').value); ex.note = $('eeNote').value.trim(); save(); closeModal('editExpenseModal'); toast('খরচ আপডেট হয়েছে!'); }
};
window.deleteExpense = function(id) {
  if (!hasPerm('canDelete')) return toast('আপনার ডিলিট করার অনুমতি নেই!', 'error');
  const ex = db.expenses.find(x => x.id === id); if (!ex || !confirm('খরচটি রিসাইকেল বিনে পাঠাবেন?')) return;
  moveToTrash('expense', `খরচ: ${ex.title} (${money(ex.amount)})`, ex);
  db.expenses = db.expenses.filter(x => x.id !== id); save(); toast('খরচ রিসাইকেল বিনে পাঠানো হয়েছে', 'warn');
};

if ($('paymentForm')) $('paymentForm').onsubmit = e => {
  e.preventDefault();
  if (!hasPerm('canPayments')) return toast('অনুমতি নেই!', 'error');
  db.payments.push({ id: uid(), date: $('pDate').value, customerId: $('pCustomer').value, amount: num($('pAmount').value), method: $('pMethod').value, fee: num($('pFee')?.value), ref: $('pRef').value.trim(), note: $('pNote').value.trim() });
  save(); logActivity(`পেমেন্ট জমা: ৳${$('pAmount').value}`); e.target.reset(); $('pDate').value = today(); if ($('pFee')) $('pFee').value = 0; updatePaymentCustomerStatus(); toast('পেমেন্ট সফলভাবে জমা হয়েছে!');
};
window.openEditPaymentModal = function(id) {
  if (!hasPerm('canEdit')) return toast('আপনার এডিট করার অনুমতি নেই!', 'error');
  const p = db.payments.find(x => x.id === id); if (!p) return;
  refresh(); $('epId').value = p.id; $('epDate').value = p.date; $('epCustomer').value = p.customerId;
  $('epAmount').value = p.amount; $('epMethod').value = p.method; $('epRef').value = p.ref || ''; $('epNote').value = p.note || '';
  $('editPaymentModal').style.display = 'flex';
};
if ($('editPaymentForm')) $('editPaymentForm').onsubmit = e => {
  e.preventDefault();
  const p = db.payments.find(x => x.id === $('epId').value);
  if (p) { p.date = $('epDate').value; p.customerId = $('epCustomer').value; p.amount = num($('epAmount').value); p.method = $('epMethod').value; p.ref = $('epRef').value.trim(); p.note = $('epNote').value.trim(); save(); closeModal('editPaymentModal'); toast('পেমেন্ট আপডেট হয়েছে!'); }
};
window.deletePayment = function(id) {
  if (!hasPerm('canDelete')) return toast('আপনার ডিলিট করার অনুমতি নেই!', 'error');
  const p = db.payments.find(x => x.id === id); if (!p || !confirm('পেমেন্টটি রিসাইকেল বিনে পাঠাবেন?')) return;
  moveToTrash('payment', `পেমেন্ট: ${cname(p.customerId)} (${money(p.amount)})`, p);
  db.payments = db.payments.filter(x => x.id !== id); save(); toast('পেমেন্ট রিসাইকেল বিনে পাঠানো হয়েছে', 'warn');
};

// WhatsApp & Dues
function normalizeBdPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('8801')) return d;
  if (d.startsWith('01')) return '88' + d;
  if (d.startsWith('1') && d.length === 10) return '880' + d;
  return d;
}
window.sendWhatsAppReminder = function(custId) {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const waNum = normalizeBdPhone(c.phone);
  if (!waNum) { toast('এই কাস্টমারের সঠিক মোবাইল নম্বর নেই!', 'error'); return; }
  const b = billed(custId), p = paid(custId), dueAmt = money(Math.max(0, b - p));
  const agName = db.agency?.name || 'Ads হিসাব ম্যানেজার';
  const payInfo = db.agency?.payInfo ? `পেমেন্ট মাধ্যম: ${db.agency.payInfo}` : '';
  const tpl = db.agency?.waTemplate || DEFAULT_WA_TEMPLATE;
  const msg = tpl
    .replace(/\{name\}/g, c.name)
    .replace(/\{agency\}/g, agName)
    .replace(/\{bill\}/g, money(b))
    .replace(/\{paid\}/g, money(p))
    .replace(/\{due\}/g, dueAmt)
    .replace(/\{payinfo\}/g, payInfo);
  db.reminderLogs[custId] = new Date().toLocaleString('bn-BD');
  save();
  window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`, '_blank');
  toast('WhatsApp রিমাইন্ডার খোলা হয়েছে!');
};

window.sendCampaignWhatsApp = function(workId) {
  const w = db.works.find(x => x.id === workId); if (!w) return;
  const c = db.customers.find(x => x.id === w.customerId); if (!c) return;
  const waNum = normalizeBdPhone(c.phone);
  if (!waNum) { toast('কাস্টমারের সঠিক মোবাইল নম্বর নেই!', 'error'); return; }
  const msg = `আসসালামু আলাইকুম ${c.name}, আপনার '${w.name}' ক্যাম্পেইনের আপডেট: ব্যবহৃত ডলার ${usd(w.actualDollar)}, মোট বিল ${money(bill(w))}, স্ট্যাটাস: ${w.status}। ধন্যবাদ - ${db.agency?.name || 'Ads হিসাব ম্যানেজার'}`;
  window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`, '_blank');
};

function renderDues() {
  const dueRows = db.customers.map(c => { const b = billed(c.id), p = paid(c.id); return { customer: c, bill: b, paid: p, bal: p - b }; });
  const onlyDues = dueRows.filter(x => x.bal < 0);
  const totalDueSum = onlyDues.reduce((s, x) => s + (-x.bal), 0);
  const totalAdvSum = dueRows.filter(x => x.bal > 0).reduce((s, x) => s + x.bal, 0);

  if ($('dueMetrics')) $('dueMetrics').innerHTML = `
    <div class="metric-card m4"><small>মোট বকেয়া পাওনা</small><strong>${money(totalDueSum)}</strong></div>
    <div class="metric-card m3"><small>ক্লায়েন্টদের অ্যাডভান্স জমা</small><strong>${money(totalAdvSum)}</strong></div>
    <div class="metric-card m1"><small>বকেয়া থাকা কাস্টমার</small><strong>${onlyDues.length} জন</strong></div>`;

  if ($('dueRows')) $('dueRows').innerHTML = onlyDues.map(x => {
    const cid = x.customer.id, due = -x.bal;
    const lastLog = db.reminderLogs[cid] ? `<span class="good" style="font-size:11px">পাঠানো: ${esc(db.reminderLogs[cid])}</span>` : `<span class="muted">পাঠানো হয়নি</span>`;
    const isOverdue = due > 5000 ? `<span class="badge-danger" style="margin-left:5px">High Due</span>` : '';
    return `<tr>
      <td><strong>${esc(x.customer.name)}</strong>${isOverdue}</td>
      <td>${esc(x.customer.phone || '—')}</td>
      <td>${money(x.bill)}</td><td>${money(x.paid)}</td><td class="bad">${money(due)}</td><td>${lastLog}</td>
      <td>
        <button type="button" class="secondary sm" onclick="sendWhatsAppReminder('${cid}')">📲 WhatsApp</button>
        <button type="button" class="secondary sm" onclick="openInvoice('${cid}')">📄 ইনভয়েস</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="7">কোনো কাস্টমারের বকেয়া নেই 🎉</td></tr>`;
}

// Notifications & Active Campaigns Monitor
function updateNotifications() {
  const notifList = $('notifList'), notifCount = $('notifCount');
  if (!notifList || !notifCount) return;
  const items = [];
  const todayDate = new Date(); todayDate.setHours(0,0,0,0);

  db.works.forEach(w => {
    if (w.status === 'running' && w.days) {
      const startDate = new Date(w.date), expiryDate = new Date(startDate);
      expiryDate.setDate(startDate.getDate() + Number(w.days)); expiryDate.setHours(0,0,0,0);
      const diffDays = Math.ceil((expiryDate - todayDate) / 86400000);
      if (diffDays <= 1 && diffDays >= 0) items.push({ key: `work_${w.id}_soon`, text: `⏰ '${w.name}' ক্যাম্পেইনের মেয়াদ শেষ হতে চলেছে!`, tab: 'works' });
      else if (diffDays < 0) items.push({ key: `work_${w.id}_exp`, text: `⚠️ '${w.name}' ক্যাম্পেইনের মেয়াদ শেষ হয়েছে।`, tab: 'works' });
    }
  });

  if (hasPerm('canPayments')) {
    const dueCount = db.customers.filter(c => clientBalance(c.id) < 0).length;
    if (dueCount > 0) items.push({ key: `due_${dueCount}`, text: `📌 ${dueCount} জন কাস্টমারের কাছে বকেয়া পাওনা রয়েছে।`, tab: 'dues' });
  }

  if (!isStaff()) {
    db.cards.forEach(c => {
      const dep = db.cardDeposits.filter(d => d.cardId === c.id).reduce((s, d) => s + num(d.amount), 0);
      const bal = dep - cardSpent(c.id);
      if (dep > 0 && bal < 20) items.push({ key: `card_${c.id}`, text: `💳 '${c.name}' কার্ডের ব্যালেন্স কম (${usd(bal)})!`, tab: 'cards' });
    });
    const openHelps = readHelpRequests().filter(h => h.status === 'open' && (isSuperAdmin() || h.target !== 'Super Admin'));
    if (openHelps.length > 0) {
      items.push({ key: `help_${openHelps.length}`, text: `📩 ${openHelps.length} টি নতুন হেল্প মেসেজ এসেছে!`, tab: 'adminPanel', subTab: 'help' });
    }
  }

  const st = readNotifState();
  const visibleItems = items.filter(i => !st.dismissed.includes(i.key));
  currentNotifKeys = visibleItems.map(i => i.key);
  const unreadCount = visibleItems.filter(i => !st.seen.includes(i.key)).length;

  if (unreadCount > 0) { notifCount.style.display = 'flex'; notifCount.textContent = unreadCount; }
  else { notifCount.style.display = 'none'; }

  if (visibleItems.length > 0) {
    notifList.innerHTML = visibleItems.map(i => `
      <div class="notif-item" style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px" onclick="goToSection('${i.tab}');${i.subTab ? `switchAdminSubTab('${i.subTab}');` : ''}$('notifBox').style.display='none'">
        <span>${esc(i.text)}</span>
        <button type="button" class="secondary sm" style="padding:1px 6px;margin:0;flex-shrink:0" onclick="dismissNotif(event,'${esc(i.key)}')" title="সরিয়ে দিন">✕</button>
      </div>`).join('');
  } else {
    notifList.innerHTML = `<div class="notif-item">কোনো নতুন বিজ্ঞপ্তি নেই</div>`;
  }
}

function renderActiveCampaignsMonitor() {
  const host = $('dashActiveWorksRows'); if (!host) return;
  const todayDate = new Date(); todayDate.setHours(0,0,0,0);
  const running = db.works.filter(w => (w.status || 'running') === 'running');
  host.innerHTML = running.map(w => {
    const startDate = new Date(w.date), expiryDate = new Date(startDate);
    expiryDate.setDate(startDate.getDate() + Math.max(1, num(w.days))); expiryDate.setHours(0,0,0,0);
    const diffDays = Math.ceil((expiryDate - todayDate) / 86400000);
    const daily = num(w.days) > 0 ? (num(w.dollar) / num(w.days)) : num(w.dollar);
    const badge = diffDays < 0 ? `<span class="badge-danger">মেয়াদ শেষ (${Math.abs(diffDays)} দিন আগে)</span>`
      : (diffDays <= 1 ? `<span class="badge-status status-running">আজ/কাল শেষ</span>` : `<span class="badge-success">${diffDays} দিন বাকি</span>`);
    return `<tr>
      <td><strong>${esc(cname(w.customerId))}</strong><br><small class="muted">${esc(pname(w.pageId))}</small></td>
      <td>${esc(w.name)}</td>
      <td>${usd(w.dollar)} / <strong>${usd(w.actualDollar)}</strong>${progressBarHtml(num(w.actualDollar), num(w.dollar))}</td>
      <td>${usd(daily)}/দিন</td>
      <td>${badge}</td>
      <td>
        <button type="button" class="secondary sm" onclick="quickAddSpend('${w.id}')" title="দ্রুত খরচ যোগ">+$</button>
        <button type="button" class="secondary sm perm-edit" onclick="openEditWorkModal('${w.id}')">✏️ আপডেট</button>
        <button type="button" class="secondary sm" onclick="sendCampaignWhatsApp('${w.id}')" title="ক্লায়েন্টকে WhatsApp আপডেট দিন">📲</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="6">বর্তমানে কোনো চলমান (Running) ক্যাম্পেইন নেই</td></tr>`;
}

// Monthly Chart
function renderMonthlyChart() {
  if (isStaff()) return;
  const host = $('monthlyChart'), labelsHost = $('monthlyChartLabels');
  if (!host || !labelsHost) return;
  const bnMonths = ['জানু','ফেব্রু','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টে','অক্টো','নভে','ডিসে'];
  const now = new Date(), buckets = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    buckets.push({ ym, label: bnMonths[d.getMonth()] + "'" + String(d.getFullYear()).slice(-2), bill: 0, spend: 0, profit: 0 });
  }
  db.works.forEach(w => {
    const b = buckets.find(x => x.ym === String(w.date || '').slice(0, 7));
    if (b) { b.bill += bill(w); b.spend += actual(w) + num(w.other); }
  });
  db.expenses.forEach(e => {
    const b = buckets.find(x => x.ym === String(e.date || '').slice(0, 7));
    if (b) b.spend += num(e.amount);
  });
  db.payments.forEach(p => {
    const b = buckets.find(x => x.ym === String(p.date || '').slice(0, 7));
    if (b) b.spend += num(p.fee);
  });
  buckets.forEach(b => { b.profit = Math.max(0, b.bill - b.spend); });
  const max = Math.max(1, ...buckets.flatMap(b => [b.bill, b.spend, b.profit]));
  host.innerHTML = buckets.map(b => `
    <div style="flex:1;display:flex;align-items:flex-end;justify-content:center;gap:3px;height:100%" title="${b.label}: বিল ${money(b.bill)} | খরচ ${money(b.spend)} | লাভ ${money(b.bill - b.spend)}">
      <div style="width:26%;height:${Math.max(4, b.bill / max * 100)}%;background:#2563eb;border-radius:4px 4px 0 0"></div>
      <div style="width:26%;height:${Math.max(4, b.spend / max * 100)}%;background:#7c3aed;border-radius:4px 4px 0 0"></div>
      <div style="width:26%;height:${Math.max(4, b.profit / max * 100)}%;background:#10b981;border-radius:4px 4px 0 0"></div>
    </div>`).join('');
  labelsHost.innerHTML = buckets.map(b => `<span style="flex:1;text-align:center">${b.label}</span>`).join('');
}

function renderTopClients() {
  const host = $('topClientsList'); if (!host) return;
  const list = db.customers.map(c => ({ name: c.name, total: billed(c.id) })).filter(x => x.total > 0).sort((a,b) => b.total - a.total).slice(0, 5);
  const topMax = Math.max(1, list[0]?.total || 1);
  host.innerHTML = list.map((c, i) => `
    <div>
      <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px">
        <span><strong>#${i+1} ${esc(c.name)}</strong></span><strong style="color:var(--brand)">${money(c.total)}</strong>
      </div>
      <div style="height:6px;background:var(--soft);border-radius:99px;overflow:hidden">
        <div style="height:100%;width:${(c.total / topMax * 100).toFixed(0)}%;background:linear-gradient(90deg,#3157e8,#7046e8);border-radius:99px"></div>
      </div>
    </div>`).join('') || '<div class="muted">এখনো কোনো বিলিং ডেটা নেই</div>';
}

// Date Filters
let dashFilterFrom = '', dashFilterTo = '';
if ($('applyDashDates')) $('applyDashDates').onclick = () => { dashFilterFrom = $('dashFrom').value; dashFilterTo = $('dashTo').value; render(); };
if ($('clearDashDates')) $('clearDashDates').onclick = () => { dashFilterFrom = ''; dashFilterTo = ''; $('dashFrom').value = ''; $('dashTo').value = ''; render(); };
if ($('repFrom')) $('repFrom').value = today().slice(0, 8) + '01';
if ($('repTo')) $('repTo').value = today();

function inDateRange(d, from, to) { return (!from || d >= from) && (!to || d <= to); }

function renderMonthlyReport() {
  const from = $('repFrom')?.value || '', to = $('repTo')?.value || '';
  const fWorks = db.works.filter(w => inDateRange(w.date, from, to));
  const fPays = db.payments.filter(p => inDateRange(p.date, from, to));
  const fExps = db.expenses.filter(e => inDateRange(e.date, from, to));

  const b = fWorks.reduce((s, w) => s + bill(w), 0);
  const adSpend = fWorks.reduce((s, w) => s + actual(w) + num(w.other), 0);
  const payFees = fPays.reduce((s, p) => s + num(p.fee), 0);
  const totalSpend = adSpend + fExps.reduce((s, e) => s + num(e.amount), 0) + payFees;
  const paidAmt = fPays.reduce((s, p) => s + num(p.amount), 0);

  if ($('repBill')) $('repBill').textContent = money(b);
  if ($('repPaid')) $('repPaid').textContent = money(paidAmt);
  if (!isStaff()) {
    if ($('repSpend')) $('repSpend').textContent = money(totalSpend);
    if ($('repProfit')) $('repProfit').textContent = money(b - totalSpend);
  }
  if ($('repWorkRows')) $('repWorkRows').innerHTML = fWorks.map(w => `
    <tr>
      <td>${esc(w.date)}</td>
      <td><strong>${esc(cname(w.customerId))}</strong><br><small class="muted">${esc(pname(w.pageId))}</small></td>
      <td>${esc(w.name)}</td>
      <td>${money(bill(w))}</td>
      ${isStaff() ? '' : `<td>${money(actual(w))}</td><td class="${profit(w) >= 0 ? 'good' : 'bad'}">${money(profit(w))}</td>`}
    </tr>`).join('') || `<tr><td colspan="${isStaff() ? 4 : 6}">এই সময়ে কোনো কাজ নেই</td></tr>`;
}
if ($('applyRepDates')) $('applyRepDates').onclick = renderMonthlyReport;
if ($('clearRepDates')) $('clearRepDates').onclick = () => { $('repFrom').value = today().slice(0, 8) + '01'; $('repTo').value = today(); renderMonthlyReport(); };

// Backup Reminder
function checkBackupReminder() {
  const bar = $('backupReminderBar'); if (!bar) return;
  if (isStaff() || (!db.customers.length && !db.works.length)) { bar.style.display = 'none'; return; }
  const last = localStorage.getItem(LAST_BACKUP_KEY);
  const diffDays = last ? Math.floor((new Date(today()) - new Date(last)) / 86400000) : 99;
  if (diffDays >= 7 && !sessionStorage.getItem('backup_dismissed_v72')) bar.style.display = 'flex';
  else bar.style.display = 'none';
}

// Main Render
function render() {
  refresh(); renderCards(); updateNotifications(); renderMonthlyChart(); renderTopClients(); renderActiveCampaignsMonitor();

  const todayStr = today();
  const todayWorks = db.works.filter(w => w.date === todayStr);
  const todayExp = db.expenses.filter(e => e.date === todayStr).reduce((s, e) => s + num(e.amount), 0);
  const todayPayFees = db.payments.filter(p => p.date === todayStr).reduce((s, p) => s + num(p.fee), 0);
  const todayBill = todayWorks.reduce((s, w) => s + bill(w), 0);
  const todaySpend = todayWorks.reduce((s, w) => s + actual(w) + num(w.other), 0);
  const todayProfit = todayBill - todaySpend - todayExp - todayPayFees;

  if ($('mTodayBill')) $('mTodayBill').textContent = money(todayBill);
  if (!isStaff()) {
    if ($('mTodaySpend')) $('mTodaySpend').textContent = money(todaySpend);
    if ($('mTodayProfit')) $('mTodayProfit').textContent = money(todayProfit);
  }

  const fWorks = db.works.filter(w => inDateRange(w.date, dashFilterFrom, dashFilterTo));
  const fPays = db.payments.filter(p => inDateRange(p.date, dashFilterFrom, dashFilterTo));
  const fExps = db.expenses.filter(e => inDateRange(e.date, dashFilterFrom, dashFilterTo));

  const totalBill = fWorks.reduce((s, w) => s + bill(w), 0);
  const totalPaid = fPays.reduce((s, p) => s + num(p.amount), 0);
  const isFiltered = Boolean(dashFilterFrom || dashFilterTo);
  const allCustDue = isFiltered ? Math.max(0, totalBill - totalPaid) : db.customers.reduce((s, c) => s + Math.max(0, -clientBalance(c.id)), 0);
  const allCustAdv = isFiltered ? Math.max(0, totalPaid - totalBill) : db.customers.reduce((s, c) => s + Math.max(0, clientBalance(c.id)), 0);

  if ($('mBill')) $('mBill').textContent = money(totalBill);
  if ($('mTotalPaid')) $('mTotalPaid').textContent = money(totalPaid);
  if ($('mAdvanceNote')) $('mAdvanceNote').textContent = allCustAdv > 0 ? `অ্যাডভান্স জমা: ${money(allCustAdv)}` : '';
  if ($('mDue')) $('mDue').textContent = money(allCustDue);

  if (!isStaff()) {
    const ad = fWorks.reduce((s, w) => s + actual(w), 0);
    const otherCost = fWorks.reduce((s, w) => s + num(w.other), 0);
    const periodOfficeExp = fExps.reduce((s, e) => s + num(e.amount), 0);
    const periodPayFees = fPays.reduce((s, p) => s + num(p.fee), 0);
    if ($('mActual')) $('mActual').textContent = money(ad);
    if ($('mProfit')) $('mProfit').textContent = money(totalBill - ad - otherCost - periodOfficeExp - periodPayFees);
  }

  // Customers Table
  const custQuery = ($('customerSearch')?.value || '').toLowerCase();
  const filteredCustomers = db.customers.filter(c => c.name.toLowerCase().includes(custQuery) || (c.phone || '').includes(custQuery));
  if ($('customerRows')) $('customerRows').innerHTML = filteredCustomers.map((c, idx) => {
    const b = billed(c.id), p = paid(c.id), bal = p - b;
    const balHtml = bal < 0 ? `<span class="bad">বকেয়া: ${money(-bal)}</span>`
      : (bal > 0 ? `<span class="good">অ্যাডভান্স: ${money(bal)}</span>` : `<span class="muted">৳0.00</span>`);
    return `<tr>
      <td>#${idx + 1}</td>
      <td><strong>${esc(c.name)}</strong></td>
      <td>${esc(c.phone || '—')}</td>
      <td>${db.pages.filter(pg => pg.customerId === c.id).length}</td>
      <td>${money(b)}</td><td>${money(p)}</td><td>${balHtml}</td>
      <td>
        <button type="button" class="secondary sm" onclick="openClientProfile('${c.id}')">👤 প্রোফাইল</button>
        <button type="button" class="secondary sm" onclick="openInvoice('${c.id}')">📄 ইনভয়েস</button>
        <button type="button" class="secondary sm perm-edit" onclick="openEditCustomerModal('${c.id}')">✏️</button>
        <button type="button" class="danger sm perm-del" onclick="deleteCustomer('${c.id}')">মুছুন</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="8">কোনো কাস্টমার পাওয়া যায়নি</td></tr>`;

  // Pages
  if ($('pageRows')) $('pageRows').innerHTML = db.pages.map((p, idx) => `
    <tr><td>#${idx + 1}</td><td>${esc(cname(p.customerId))}</td><td><strong>${esc(p.name)}</strong></td>
      <td>${p.link ? `<a href="${esc(p.link)}" target="_blank">লিংক ↗</a>` : '—'}</td>
      <td>${p.adId ? `<code>${esc(p.adId)}</code> <button type="button" class="secondary sm" onclick="copyText('${esc(p.adId)}','Ad ID')">📋</button>` : '—'}</td>
      <td>${p.pixelId ? `<code>${esc(p.pixelId)}</code> <button type="button" class="secondary sm" onclick="copyText('${esc(p.pixelId)}','Pixel ID')">📋</button>` : '—'}</td>
      <td>
        <button type="button" class="secondary sm perm-edit" onclick="openEditPageModal('${p.id}')">✏️ এডিট</button>
        <button type="button" class="danger sm perm-del" onclick="deletePage('${p.id}')">মুছুন</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="7">কোনো পেজ যুক্ত নেই</td></tr>`;

  // Rates
  if ($('rateRows')) $('rateRows').innerHTML = [...db.rates].sort((a,b) => b.date.localeCompare(a.date)).map(r => `
    <tr><td>${esc(r.date)}</td><td><strong>${money(r.value)}</strong></td><td>${esc(r.note || '—')}</td>
      <td>
        <button type="button" class="secondary sm perm-edit" onclick="openEditRateModal('${r.id}')">✏️ এডিট</button>
        <button type="button" class="danger sm perm-del" onclick="deleteRate('${r.id}')">মুছুন</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="4">কোনো দৈনিক রেট সেভ করা নেই</td></tr>`;

  // Works
  const workQuery = ($('workSearch')?.value || '').toLowerCase(), statusFilter = $('workStatusFilter')?.value || '', custFilter = $('workCustomerFilter')?.value || '';
  const filteredWorksList = [...db.works].sort((a,b) => b.date.localeCompare(a.date)).filter(w => {
    const matchText = w.name.toLowerCase().includes(workQuery) || cname(w.customerId).toLowerCase().includes(workQuery) || pname(w.pageId).toLowerCase().includes(workQuery);
    return matchText && (!statusFilter || (w.status || 'running') === statusFilter) && (!custFilter || w.customerId === custFilter);
  });

  if ($('workRows')) $('workRows').innerHTML = filteredWorksList.map((w, idx) => {
    const st = w.status || 'running';
    const stText = st === 'completed' ? 'সম্পন্ন' : (st === 'paused' ? 'পজ' : 'চলমান');
    const stClass = st === 'completed' ? 'status-completed' : (st === 'paused' ? 'status-paused' : 'status-running');
    const rev = num(w.revenue), totalCost = actual(w) + num(w.other);
    const roasVal = totalCost > 0 ? (rev / totalCost).toFixed(2) : '0.00';
    const convs = num(w.conversions), cpaVal = convs > 0 ? money(totalCost / convs) : '—';
    const creativeHtml = w.creativeLink ? `<br><a href="${esc(w.creativeLink)}" target="_blank" style="font-size:11px;color:var(--brand)">🎨 Creative</a>` : '';
    const feeTxt = num(w.feePct) > 0 ? `<br><small class="muted">ফি ${w.feePct}%</small>` : '';
    return `<tr>
      <td>#${idx + 1}</td><td>${esc(w.date)}</td>
      <td><strong>${esc(cname(w.customerId))}</strong><br><small class="muted">${esc(pname(w.pageId))}</small></td>
      <td>${esc(w.name)}${creativeHtml}</td>
      <td>${usd(w.actualDollar)} <small class="muted">/ ${usd(w.dollar)}</small>${progressBarHtml(num(w.actualDollar), num(w.dollar))}</td>
      <td>${money(bill(w))}</td>
      ${isStaff() ? '' : `<td>${money(actual(w))}${feeTxt}</td><td class="${profit(w) >= 0 ? 'good' : 'bad'}">${money(profit(w))}</td>`}
      <td><small>ROAS: <strong>${roasVal}x</strong><br>CPA: <strong>${cpaVal}</strong></small></td>
      <td><span class="badge-status ${stClass}">${stText}</span></td>
      <td>
        <button type="button" class="secondary sm" onclick="quickAddSpend('${w.id}')" title="দ্রুত খরচ যোগ">+$</button>
        <button type="button" class="secondary sm perm-edit" onclick="openEditWorkModal('${w.id}')">✏️ এডিট</button>
        <button type="button" class="secondary sm" onclick="cloneWork('${w.id}')">কপি</button>
        <button type="button" class="secondary sm" onclick="sendCampaignWhatsApp('${w.id}')" title="ক্লায়েন্টকে WhatsApp আপডেট">📲</button>
        <button type="button" class="danger sm perm-del" onclick="deleteWork('${w.id}')">মুছুন</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="${isStaff() ? 9 : 11}">কোনো কাজ পাওয়া যায়নি</td></tr>`;

  // Pixels
  if ($('pixelListRows')) $('pixelListRows').innerHTML = db.pages.filter(p => p.pixelId).map(p => `
    <tr><td>${esc(cname(p.customerId))}</td><td>${esc(p.name)}</td><td><code>${esc(p.pixelId)}</code></td>
      <td><span class="badge-success">Active / Ready</span></td>
      <td><button type="button" class="secondary sm" onclick="$('genPixelId').value='${esc(p.pixelId)}';generatePixelCode();toast('পিক্সেল কোড জেনারেট হয়েছে')">কোড জেনারেট</button></td>
    </tr>`).join('') || `<tr><td colspan="5">কোনো সেভ থাকা পিক্সেল আইডি নেই</td></tr>`;

  // Expenses
  const totalAllOfficeExp = db.expenses.reduce((s, e) => s + num(e.amount), 0);
  if ($('expenseRows')) $('expenseRows').innerHTML = [...db.expenses].sort((a,b) => b.date.localeCompare(a.date)).map(e => `
    <tr><td>${esc(e.date)}</td><td><strong>${esc(e.title)}</strong></td><td><span class="badge-admin">${esc(e.category)}</span></td>
      <td class="bad">${money(e.amount)}</td><td>${esc(e.note || '—')}</td>
      <td>
        <button type="button" class="secondary sm perm-edit" onclick="openEditExpenseModal('${e.id}')">✏️ এডিট</button>
        <button type="button" class="danger sm perm-del" onclick="deleteExpense('${e.id}')">মুছুন</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="6">কোনো খরচ রেকর্ড নেই</td></tr>`;
  if ($('totalExpenseSummary')) $('totalExpenseSummary').textContent = `মোট অফিস খরচ: ${money(totalAllOfficeExp)}`;
  if ($('expenseCategorySummary')) {
    const catTotals = {};
    db.expenses.forEach(ex => { catTotals[ex.category] = (catTotals[ex.category] || 0) + num(ex.amount); });
    const entries = Object.entries(catTotals).sort((a,b) => b[1] - a[1]);
    $('expenseCategorySummary').innerHTML = entries.map(([cat, amt]) => {
      const pct = totalAllOfficeExp > 0 ? ((amt / totalAllOfficeExp) * 100).toFixed(0) : 0;
      return `<span class="badge-admin" style="padding:6px 11px;font-size:12px">${esc(cat)}: <strong>${money(amt)}</strong> (${pct}%)</span>`;
    }).join('');
  }
  updatePaymentCustomerStatus();
  checkBackupReminder();

  // Payments
  if ($('paymentRows')) $('paymentRows').innerHTML = [...db.payments].sort((a,b) => b.date.localeCompare(a.date)).map(p => `
    <tr><td>${esc(p.date)}</td><td><strong>${esc(cname(p.customerId))}</strong></td>
      <td class="good">${money(p.amount)}${num(p.fee) > 0 ? `<br><small class="bad">চার্জ: -${money(p.fee)}</small>` : ''}</td>
      <td>${esc(p.method)}</td><td>${esc(p.ref || p.note || '—')}</td>
      <td>
        <button type="button" class="secondary sm perm-edit" onclick="openEditPaymentModal('${p.id}')">✏️ এডিট</button>
        <button type="button" class="danger sm perm-del" onclick="deletePayment('${p.id}')">মুছুন</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="6">কোনো পেমেন্ট রেকর্ড নেই</td></tr>`;

  // Summary Report
  if (!isStaff() && $('reportRows')) $('reportRows').innerHTML = db.customers.map(c => {
    const b = billed(c.id), p = paid(c.id), bal = p - b;
    const cw = db.works.filter(w => w.customerId === c.id);
    const totalUSD = cw.reduce((s, w) => s + num(w.actualDollar), 0);
    const prCust = cw.reduce((s, w) => s + profit(w), 0);
    const balHtml = bal < 0 ? `<span class="bad">বকেয়া: ${money(-bal)}</span>` : (bal > 0 ? `<span class="good">অ্যাডভান্স: ${money(bal)}</span>` : `৳0.00`);
    return `<tr><td><strong>${esc(c.name)}</strong></td><td>${usd(totalUSD)}</td><td>${money(b)}</td><td>${money(p)}</td><td>${balHtml}</td><td class="${prCust >= 0 ? 'good' : 'bad'}">${money(prCust)}</td></tr>`;
  }).join('') || `<tr><td colspan="6">কোনো রিপোর্ট ডেটা নেই</td></tr>`;

  renderDues();
}

if ($('customerSearch')) $('customerSearch').oninput = render;
if ($('workSearch')) $('workSearch').oninput = render;
if ($('workStatusFilter')) $('workStatusFilter').onchange = render;
if ($('workCustomerFilter')) $('workCustomerFilter').onchange = render;

// Admin Panel: Super Admin Locks, Permissions, Impersonate, Help Inbox, Trash, Master Backup & Cloud Sync
if ($('auRole')) $('auRole').onchange = () => { if ($('auPermsWrap')) $('auPermsWrap').style.display = $('auRole').value === 'staff' ? 'block' : 'none'; };
if ($('euRole')) $('euRole').onchange = () => { if ($('euPermsWrap')) $('euPermsWrap').style.display = $('euRole').value === 'staff' ? 'block' : 'none'; };

if ($('adminCreateUserForm')) $('adminCreateUserForm').onsubmit = e => {
  e.preventDefault();
  if (!isSuperAdmin()) return toast('শুধু Super Admin ইউজার তৈরি করতে পারবেন!', 'error');
  const name = $('auName').value.trim(), username = $('auUsername').value.trim().toLowerCase();
  const contact = $('auContact').value.trim(), pass = $('auPass').value, role = $('auRole').value;
  if (!name || !username || pass.length < 6) { toast('সঠিক নাম, ইউজারনেম ও কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন!', 'error'); return; }
  if (username === 'admin') { toast('admin ইউজারনেম ব্যবহার করা যাবে না', 'error'); return; }

  const accounts = readLocalAccounts();
  if (accounts.some(a => a.username === username)) { toast('এই ইউজারনেম আগেই আছে!', 'error'); return; }

  const perms = role === 'staff' ? {
    canDelete: Boolean($('auPermDel')?.checked),
    canEdit: Boolean($('auPermEdit')?.checked),
    canPayments: Boolean($('auPermPay')?.checked),
    canExpenses: Boolean($('auPermExp')?.checked)
  } : null;

  const isEmail = contact.includes('@');
  const next = Number(localStorage.getItem(NEXTUSERIDKEY) || 2);
  const newAcc = { id: uid(), userNumber: next, name, username, email: isEmail ? contact.toLowerCase() : '', phone: isEmail ? '' : contact, password: hashPass(pass), role, perms, status: 'active', lastLogin: 'এখনো লগইন করেনি', loginCount: 0 };
  accounts.push(newAcc);
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts));
  localStorage.setItem(NEXTUSERIDKEY, String(next + 1));
  localStorage.setItem('ads_hisab_user_profile_v72_' + newAcc.id, JSON.stringify({ name, email: newAcc.email, phone: newAcc.phone, pic: '' }));
  logActivity(`নতুন ${role} অ্যাকাউন্ট তৈরি: ${name} (@${username})`);
  e.target.reset();
  if ($('auPermEdit')) $('auPermEdit').checked = true;
  if ($('auPermPay')) $('auPermPay').checked = true;
  if ($('auPermExp')) $('auPermExp').checked = true;
  if ($('auPermsWrap')) $('auPermsWrap').style.display = 'block';
  renderAdminPanel();
  toast(`${name} (${role}) অ্যাকাউন্ট তৈরি হয়েছে!`);
};

window.openEditUserModal = function(userId) {
  if (!isSuperAdmin()) return toast('শুধু Super Admin এটি করতে পারবেন!', 'error');
  const acc = readLocalAccounts().find(a => a.id === userId); if (!acc) return;
  $('euId').value = acc.id;
  $('euName').value = acc.name;
  $('euUsername').value = acc.username;
  $('euEmail').value = acc.email || '';
  $('euPhone').value = acc.phone || '';
  $('euRole').value = acc.role || 'user';
  $('euStatus').value = acc.status || 'active';
  $('euNewPass').value = '';
  const p = { canDelete: false, canEdit: true, canPayments: true, canExpenses: true, ...(acc.perms || {}) };
  $('euPermDel').checked = Boolean(p.canDelete);
  $('euPermEdit').checked = Boolean(p.canEdit);
  $('euPermPay').checked = Boolean(p.canPayments);
  $('euPermExp').checked = Boolean(p.canExpenses);
  $('euPermsWrap').style.display = $('euRole').value === 'staff' ? 'block' : 'none';
  $('editUserModal').style.display = 'flex';
};

if ($('editUserForm')) $('editUserForm').onsubmit = e => {
  e.preventDefault();
  if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error');
  const id = $('euId').value;
  const accounts = readLocalAccounts();
  const idx = accounts.findIndex(a => a.id === id); if (idx === -1) return;
  const newU = $('euUsername').value.trim().toLowerCase();
  if (newU === 'admin' || accounts.some(a => a.id !== id && a.username === newU)) {
    toast('এই ইউজারনেম ব্যবহার করা যাবে না বা আগেই নেওয়া হয়েছে!', 'error'); return;
  }
  const np = $('euNewPass').value.trim();
  if (np && np.length < 6) { toast('নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে!', 'error'); return; }

  const role = $('euRole').value;
  accounts[idx].name = $('euName').value.trim();
  accounts[idx].username = newU;
  accounts[idx].email = $('euEmail').value.trim().toLowerCase();
  accounts[idx].phone = $('euPhone').value.trim();
  accounts[idx].role = role;
  accounts[idx].status = $('euStatus').value;
  if (np) accounts[idx].password = hashPass(np);
  if (role === 'staff') {
    accounts[idx].perms = {
      canDelete: $('euPermDel').checked, canEdit: $('euPermEdit').checked,
      canPayments: $('euPermPay').checked, canExpenses: $('euPermExp').checked
    };
  }
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts));
  logActivity(`ইউজার আপডেট: ${accounts[idx].name} (@${newU})`);
  closeModal('editUserModal');
  renderAdminPanel();
  toast('ইউজারের তথ্য ও পারমিশন আপডেট হয়েছে!');
};

window.impersonateUser = function(userId) {
  if (!isSuperAdmin()) return toast('শুধুমাত্র সুপার অ্যাডমিন এটি ব্যবহার করতে পারবেন!', 'error');
  const acc = readLocalAccounts().find(a => a.id === userId); if (!acc) return;
  if (!realSuperAdmin) realSuperAdmin = activeAccount;
  activeAccount = acc;
  applyPermissionClasses();
  activateAccountData(acc);
  if ($('impersonateBanner')) $('impersonateBanner').style.display = 'flex';
  if ($('impersonateName')) $('impersonateName').textContent = `${acc.name} (@${acc.username})`;
  updateHeaderAndProfile();
  goToSection('dash');
  toast(`এখন ${acc.name}-এর ওয়ার্কস্পেস প্রিভিউ হচ্ছে`);
};

if ($('exitImpersonateBtn')) $('exitImpersonateBtn').onclick = () => {
  if (!realSuperAdmin) return;
  activeAccount = realSuperAdmin;
  realSuperAdmin = null;
  if ($('impersonateBanner')) $('impersonateBanner').style.display = 'none';
  applyPermissionClasses();
  activateAccountData(activeAccount);
  updateHeaderAndProfile();
  goToSection('adminPanel');
  toast('সুপার অ্যাডমিন ওয়ার্কস্পেসে ফিরে এসেছেন!');
};

window.switchAdminSubTab = function(tabName) {
  if (!isSuperAdmin() && ['users', 'trash', 'cloud'].includes(tabName)) tabName = 'help';
  const map = { users: ['adminTabUsersBtn','adminUsersSubPanel'], help: ['adminTabHelpBtn','adminHelpSubPanel'], trash: ['adminTabTrashBtn','adminTrashSubPanel'], cloud: ['adminTabCloudBtn','adminCloudSubPanel'], logs: ['adminTabLogsBtn','adminLogsSubPanel'] };
  Object.entries(map).forEach(([k, [btnId, panelId]]) => {
    if ($(btnId)) $(btnId).classList.toggle('active', k === tabName);
    if ($(panelId)) $(panelId).style.display = k === tabName ? 'block' : 'none';
  });
  renderAdminPanel();
};

window.toggleUserStatus = function(userId) {
  if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error');
  const accounts = readLocalAccounts(), acc = accounts.find(a => a.id === userId); if (!acc) return;
  acc.status = acc.status === 'suspended' ? 'active' : 'suspended';
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts));
  logActivity(`স্ট্যাটাস পরিবর্তন: ${acc.name} -> ${acc.status}`);
  toast(`${acc.name} এখন ${acc.status === 'suspended' ? 'ব্লকড' : 'সচল'}`); renderAdminPanel();
};
window.deleteAccount = function(userId) {
  if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error');
  if (!confirm('এই ইউজারের অ্যাকাউন্ট ও সমস্ত ডেটা স্থায়ীভাবে ডিলিট করতে চান?')) return;
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(readLocalAccounts().filter(a => a.id !== userId)));
  localStorage.removeItem('ads_hisab_user_data_v72_' + userId);
  localStorage.removeItem('ads_hisab_user_profile_v72_' + userId);
  logActivity(`অ্যাকাউন্ট ডিলিট: ${userId}`); toast('অ্যাকাউন্ট ডিলিট হয়েছে!', 'warn'); renderAdminPanel();
};

function renderAdminPanel() {
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
          if (a.role !== 'staff') {
            try {
              const udb = normalizeDb(JSON.parse(localStorage.getItem('ads_hisab_user_data_v72_' + a.id) || '{}'));
              wsStats = `<small class="muted">কাস্টমার: ${udb.customers.length} · কাজ: ${udb.works.length}</small>`;
            } catch (e) {}
          } else {
            const p = { canDelete: false, canEdit: true, canPayments: true, canExpenses: true, ...(a.perms || {}) };
            wsStats = `<small class="muted">${p.canDelete ? 'Del✓' : 'Del✕'} ${p.canEdit ? 'Edit✓' : 'Edit✕'} ${p.canPayments ? 'Pay✓' : 'Pay✕'}</small>`;
          }
          const previewBtn = (a.role !== 'staff') ? `<button type="button" class="secondary sm" onclick="impersonateUser('${a.id}')" title="এই ইউজারের ড্যাশবোর্ড দেখুন">👁️</button>` : '';
          return `<tr>
            <td>AS-${String(a.userNumber || 2).padStart(5, '0')}</td>
            <td><strong>${esc(a.name)}</strong><br><small class="muted">@${esc(a.username)}</small></td>
            <td>${esc(a.email || '—')}<br><small class="muted">${esc(a.phone || '—')}</small></td>
            <td>${rBadge}<br>${wsStats}</td>
            <td><small>${esc(a.lastLogin || 'কখনো না')}<br>মোট: ${num(a.loginCount)} বার</small></td>
            <td>${a.status === 'suspended' ? '<span class="badge-danger">Suspended</span>' : '<span class="badge-success">Active</span>'}</td>
            <td>
              ${previewBtn}
              <button type="button" class="secondary sm" onclick="openEditUserModal('${a.id}')">✏️ এডিট</button>
              <button type="button" class="warn sm" onclick="toggleUserStatus('${a.id}')">${a.status === 'suspended' ? 'আনব্লক' : 'ব্লক'}</button>
              <button type="button" class="danger sm" onclick="deleteAccount('${a.id}')">ডিলিট</button>
            </td>
          </tr>`;
        }).join('');
    }

    if ($('trashRows')) $('trashRows').innerHTML = (db.trash || []).map(t => `
      <tr>
        <td><span class="badge-status status-running">${esc(t.type)}</span></td>
        <td><strong>${esc(t.label)}</strong></td>
        <td><small>${esc(t.deletedAt)}<br>ডিলিটকারী: ${esc(t.deletedBy)}</small></td>
        <td>
          <button type="button" class="secondary sm" onclick="restoreTrash('${t.id}')">♻️ রিস্টোর</button>
          <button type="button" class="danger sm" onclick="permDeleteTrash('${t.id}')">স্থায়ী ডিলিট</button>
        </td>
      </tr>`).join('') || `<tr><td colspan="4">রিসাইকেল বিন খালি 🎉</td></tr>`;

    const sc = readCloudSync();
    if ($('csUrl') && document.activeElement !== $('csUrl')) $('csUrl').value = sc.url || '';
    if ($('csSecret') && document.activeElement !== $('csSecret')) $('csSecret').value = sc.secret || '';
    if ($('csAutoSync')) $('csAutoSync').checked = Boolean(sc.autoSync);
    if ($('csLastSyncText')) $('csLastSyncText').textContent = sc.lastSync ? `সর্বশেষ সিঙ্ক: ${sc.lastSync}` : '';
  }

  // Help Inbox
  const helps = readHelpRequests().filter(h => isSuperAdmin() || h.target !== 'Super Admin');
  const openCount = helps.filter(h => h.status === 'open').length;
  if ($('helpOpenBadge')) {
    $('helpOpenBadge').style.display = openCount ? 'inline-block' : 'none';
    $('helpOpenBadge').textContent = openCount;
  }
  if ($('helpReqRows')) $('helpReqRows').innerHTML = helps.map(h => {
    const wa = normalizeBdPhone(h.contact);
    const waBtn = wa.length >= 11 ? `<a href="https://wa.me/${wa}" target="_blank" style="text-decoration:none"><button type="button" class="secondary sm">📲</button></a>` : '';
    return `<tr>
      <td><small>${esc(h.time)}</small></td>
      <td><span class="badge-admin">${esc(h.target)}</span><br><strong>${esc(h.topic)}</strong></td>
      <td><strong>${esc(h.name)}</strong><br><small class="muted">${esc(h.contact)}</small></td>
      <td style="max-width:260px;white-space:normal">${esc(h.message)}</td>
      <td>${h.status === 'resolved' ? '<span class="badge-success">সমাধান</span>' : '<span class="badge-danger">অপেক্ষমাণ</span>'}</td>
      <td>
        ${waBtn}
        <button type="button" class="secondary sm" onclick="resolveHelpReq('${h.id}')">${h.status === 'resolved' ? 'Reopen' : '✓ সমাধান'}</button>
        <button type="button" class="danger sm" onclick="deleteHelpReq('${h.id}')">মুছুন</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="6">কোনো হেল্প মেসেজ আসেনি</td></tr>`;

  if ($('activityLogRows')) $('activityLogRows').innerHTML = db.activityLogs.map(l => `<tr><td>${esc(l.time)}</td><td>${esc(l.text)}</td></tr>`).join('') || `<tr><td colspan="2">কোনো লগ নেই</td></tr>`;
}

// Master Full Backup & Firebase Cloud Sync
function buildMasterSnapshot() {
  const accounts = readLocalAccounts();
  const userDbs = {}, userProfiles = {};
  accounts.forEach(a => {
    try { const rawD = localStorage.getItem('ads_hisab_user_data_v72_' + a.id); if (rawD) userDbs[a.id] = JSON.parse(rawD); } catch (e) {}
    try { const rawP = localStorage.getItem('ads_hisab_user_profile_v72_' + a.id); if (rawP) userProfiles[a.id] = JSON.parse(rawP); } catch (e) {}
  });
  return {
    type: 'ads_hisab_master_backup_v72',
    exportedAt: new Date().toISOString(),
    accounts,
    nextUserId: localStorage.getItem(NEXTUSERIDKEY) || '2',
    superAdminPass: localStorage.getItem(PASSKEY) || hashPass('123456789'),
    superAdminMeta: readSuperAdminMeta(),
    masterDb: normalizeDb(JSON.parse(localStorage.getItem(MASTER_DB_KEY) || '{}')),
    masterProfile: (() => { try { return JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_legacy-super-admin') || '{}'); } catch (e) { return {}; } })(),
    userDbs, userProfiles,
    helpRequests: readHelpRequests()
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
  localStorage.setItem(LAST_BACKUP_KEY, today());
  loadDb(); applyAgencyBranding(); render(); renderAdminPanel();
}

if ($('masterBackupBtn')) $('masterBackupBtn').onclick = () => {
  if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error');
  downloadBlob(JSON.stringify(buildMasterSnapshot(), null, 2), `ads_hisab_MASTER_backup_${today()}.json`, 'application/json');
  localStorage.setItem(LAST_BACKUP_KEY, today());
  checkBackupReminder();
  toast('মাস্টার ফুল ব্যাকআপ ডাউনলোড হয়েছে!');
};
if ($('masterRestoreFile')) $('masterRestoreFile').onchange = e => {
  if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error');
  const file = e.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try { applyMasterSnapshot(JSON.parse(evt.target.result)); toast('মাস্টার ব্যাকআপ সফলভাবে রিস্টোর হয়েছে!'); }
    catch (err) { toast('সঠিক মাস্টার ব্যাকআপ ফাইল নয়!', 'error'); }
    e.target.value = '';
  };
  reader.readAsText(file);
};

function readCloudSync() {
  try {
    const saved = JSON.parse(localStorage.getItem(CLOUD_SYNC_KEY) || '{}');
    if (!saved.url && DEFAULT_CLOUD_URL) saved.url = DEFAULT_CLOUD_URL;
    if (DEFAULT_CLOUD_URL && saved.autoSync === undefined) saved.autoSync = true;
    return saved;
  } catch (e) {
    return DEFAULT_CLOUD_URL ? { url: DEFAULT_CLOUD_URL, autoSync: true } : {};
  }
}
function writeCloudSync(cfg) { try { localStorage.setItem(CLOUD_SYNC_KEY, JSON.stringify(cfg)); } catch (e) {} }
function buildCloudEndpoint(url, secret) {
  const clean = String(url || '').trim().replace(/\/+$/, '');
  if (!clean) return '';
  return `${clean}/ads_hisab_master_v72.json` + (secret ? `?auth=${encodeURIComponent(secret)}` : '');
}

async function pushToCloud(silent = false) {
  const cfg = readCloudSync();
  const endpoint = buildCloudEndpoint(cfg.url, cfg.secret);
  if (!endpoint) { if (!silent) toast('প্রথমে Firebase Database URL সেভ করুন!', 'error'); return; }
  try {
    const res = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildMasterSnapshot()) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    cfg.lastSync = new Date().toLocaleString('bn-BD');
    writeCloudSync(cfg);
    if ($('csLastSyncText')) $('csLastSyncText').textContent = `সর্বশেষ সিঙ্ক: ${cfg.lastSync}`;
    if (!silent) toast('ক্লাউডে ডেটা সফলভাবে সেভ হয়েছে!');
  } catch (err) {
    if (!silent) toast('ক্লাউডে পাঠাতে সমস্যা হয়েছে! URL ও Firebase Rules যাচাই করুন।', 'error');
  }
}

async function pullFromCloud(silent = false, customUrl = '', customSecret = '') {
  const cfg = readCloudSync();
  const url = customUrl || cfg.url, secret = customSecret !== '' ? customSecret : cfg.secret;
  const endpoint = buildCloudEndpoint(url, secret);
  if (!endpoint) { if (!silent) toast('Firebase Database URL দিন!', 'error'); return false; }
  try {
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || data.type !== 'ads_hisab_master_backup_v72') {
      if (!silent) toast('ক্লাউডে এখনো কোনো ভ্যালিড ব্যাকআপ ডেটা পাওয়া যায়নি!', 'warn');
      return false;
    }
    applyMasterSnapshot(data);
    writeCloudSync({ ...cfg, url, secret, lastSync: new Date().toLocaleString('bn-BD') });
    if (!silent) toast('ক্লাউড থেকে সব ডেটা সফলভাবে সিঙ্ক হয়েছে!');
    return true;
  } catch (err) {
    if (!silent) toast('ক্লাউড থেকে আনতে সমস্যা হয়েছে! ইন্টারনেট ও URL যাচাই করুন।', 'error');
    return false;
  }
}

if ($('cloudSyncForm')) $('cloudSyncForm').onsubmit = e => {
  e.preventDefault();
  if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error');
  const cfg = readCloudSync();
  writeCloudSync({ ...cfg, url: $('csUrl').value.trim(), secret: $('csSecret').value.trim(), autoSync: $('csAutoSync').checked });
  toast('ক্লাউড সিঙ্ক সেটিংস সেভ হয়েছে!');
};
if ($('csPushBtn')) $('csPushBtn').onclick = () => { if (isSuperAdmin()) pushToCloud(false); };
if ($('csPullBtn')) $('csPullBtn').onclick = () => { if (isSuperAdmin() && confirm('ক্লাউডের ডেটা দিয়ে এই ডিভাইসের বর্তমান ডেটা আপডেট করতে চান?')) pullFromCloud(false); };

// Export CSV (UTF-8 BOM) & Workspace Backup
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime }), url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

if ($('exportCsvBtn')) $('exportCsvBtn').onclick = () => {
  const rows = [['Customer','Phone','USD Spent','Bill (BDT)','Paid (BDT)','Due (BDT)','Advance (BDT)','Net Profit (BDT)']];
  db.customers.forEach(c => {
    const b = billed(c.id), p = paid(c.id), bal = p - b;
    const cw = db.works.filter(w => w.customerId === c.id);
    rows.push([c.name, c.phone || '', cw.reduce((s,w)=>s+num(w.actualDollar),0).toFixed(2), b.toFixed(2), p.toFixed(2), Math.max(0,-bal).toFixed(2), Math.max(0,bal).toFixed(2), cw.reduce((s,w)=>s+profit(w),0).toFixed(2)]);
  });
  downloadBlob('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), `ads_hisab_customers_${today()}.csv`, 'text/csv;charset=utf-8;');
  toast('কাস্টমার সামারি CSV ডাউনলোড হয়েছে!');
};
if ($('exportWorksCsvBtn')) $('exportWorksCsvBtn').onclick = () => {
  const rows = [['Date','Customer','Page','Campaign','Budget USD','Actual USD','Bill Rate','Bill BDT','Buy Rate','Fee %','Total Cost BDT','Profit BDT','Status']];
  db.works.forEach(w => {
    rows.push([w.date, cname(w.customerId), pname(w.pageId), w.name, num(w.dollar), num(w.actualDollar), num(w.rate), bill(w).toFixed(2), num(w.actualRate), num(w.feePct), actual(w).toFixed(2), profit(w).toFixed(2), w.status]);
  });
  downloadBlob('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), `ads_hisab_works_${today()}.csv`, 'text/csv;charset=utf-8;');
  toast('কাজের বিস্তারিত CSV ডাউনলোড হয়েছে!');
};
if ($('backupBtn')) $('backupBtn').onclick = () => {
  downloadBlob(JSON.stringify(db, null, 2), `ads_hisab_backup_${today()}.json`, 'application/json');
  localStorage.setItem(LAST_BACKUP_KEY, today());
  checkBackupReminder();
  toast('JSON ব্যাকআপ ডাউনলোড হয়েছে!');
};
if ($('restoreFile')) $('restoreFile').onchange = e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (parsed && parsed.type === 'ads_hisab_master_backup_v72') {
        if (!isSuperAdmin()) return toast('মাস্টার ব্যাকআপ শুধু Super Admin রিস্টোর করতে পারবেন!', 'error');
        applyMasterSnapshot(parsed);
        toast('মাস্টার ব্যাকআপ রিস্টোর হয়েছে!');
      } else {
        db = normalizeDb(parsed); save(); applyAgencyBranding();
        toast('ব্যাকআপ সফলভাবে রিস্টোর হয়েছে!');
      }
    } catch (err) { toast('ফাইল ফরম্যাট সঠিক নয়!', 'error'); }
    e.target.value = '';
  };
  reader.readAsText(file);
};
if ($('wipeBtn')) $('wipeBtn').onclick = () => {
  if (confirm('সতর্কতা: বর্তমান অ্যাকাউন্টের সকল ডেটা মুছে ফেলা হবে! আপনি কি নিশ্চিত?')) { db = blank(); save(); applyAgencyBranding(); toast('সকল ডেটা মুছে ফেলা হয়েছে', 'warn'); }
};
if ($('printBtn')) $('printBtn').onclick = () => window.print();

// Online + Local Live Team Chat
let refreshOnlineChat = () => {};
(function initOnlineChat() {
  const key = 'ads_manager_local_chat_v72';
  const list = $('chatMessages'), form = $('chatForm'), input = $('chatInput'), clearBtn = $('clearChatBtn');
  if (!list || !form || !input) return;

  const getChatEndpoint = () => {
    const cfg = readCloudSync();
    const clean = String(cfg.url || '').trim().replace(/\/+$/, '');
    if (!clean) return '';
    return `${clean}/ads_hisab_chat_v72.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '');
  };

  let messages = [];
  try { messages = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { messages = []; }

  const draw = () => {
    const ep = getChatEndpoint();
    if ($('chatModeBadge')) {
      $('chatModeBadge').textContent = ep ? '🟢 Online Live' : '🟡 Local Mode';
      $('chatModeBadge').className = ep ? 'badge-success' : 'badge-status status-running';
    }
    const me = activeAccount?.username || '';
    list.innerHTML = '<div class="chat-msg">আসসালামু আলাইকুম! টিমের জরুরি নোট বা মেসেজ এখানে পাঠাতে পারেন।<small>System · প্রস্তুত</small></div>' +
      messages.map(m => {
        const isMine = !m.username || m.username === me;
        const senderLabel = m.sender ? `${esc(m.sender)} (${esc(m.role || 'user')}) · ` : '';
        return `<div class="chat-msg ${isMine ? 'mine' : ''}">${esc(m.text)}<small>${senderLabel}${esc(m.time)}</small></div>`;
      }).join('');
    list.scrollTop = list.scrollHeight;
  };

  refreshOnlineChat = async () => {
    const ep = getChatEndpoint();
    if (!ep) { draw(); return; }
    try {
      const res = await fetch(ep);
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data === 'object') {
        messages = Object.values(data).filter(x => x && x.text).sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(-120);
        try { localStorage.setItem(key, JSON.stringify(messages)); } catch (e) {}
      } else if (data === null) {
        messages = [];
        localStorage.setItem(key, '[]');
      }
      draw();
    } catch (e) { draw(); }
  };

  draw();
  if ($('chatRefreshBtn')) $('chatRefreshBtn').onclick = () => { refreshOnlineChat(); toast('চ্যাট রিফ্রেশ হয়েছে!'); };
  setInterval(() => { if (activeAccount && $('liveChat')?.classList.contains('active')) refreshOnlineChat(); }, 5000);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const value = input.value.trim(); if (!value) return;
    const msgObj = {
      id: uid(),
      sender: activeAccount?.name || 'User',
      role: activeAccount?.role || 'user',
      username: activeAccount?.username || '',
      text: value,
      time: new Date().toLocaleString('bn-BD'),
      ts: Date.now()
    };
    messages.push(msgObj);
    try { localStorage.setItem(key, JSON.stringify(messages)); } catch (err) {}
    input.value = '';
    draw();
    const ep = getChatEndpoint();
    if (ep) {
      try { await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msgObj) }); } catch (err) {}
    }
  });

  if (clearBtn) clearBtn.onclick = async () => {
    if (!isSuperAdmin()) return toast('শুধু Super Admin চ্যাট মুছতে পারবেন!', 'error');
    if (!confirm('সব চ্যাট/নোট মুছে ফেলতে চান?')) return;
    messages = []; localStorage.setItem(key, '[]');
    const ep = getChatEndpoint();
    if (ep) { try { await fetch(ep, { method: 'DELETE' }); } catch (err) {} }
    draw(); toast('চ্যাট পরিষ্কার হয়েছে', 'warn');
  };
})();

// Auto-Lock after 20 minutes of inactivity
(function initInactivityLock() {
  let idleTimer = null;
  const resetIdle = () => {
    clearTimeout(idleTimer);
    if (!activeAccount) return;
    idleTimer = setTimeout(() => {
      if (!activeAccount) return;
      activeAccount = null; realSuperAdmin = null;
      if ($('authOverlay')) $('authOverlay').style.display = 'flex';
      if ($('loginPass')) $('loginPass').value = '';
      toast('নিরাপত্তার জন্য ২০ মিনিট নিষ্ক্রিয় থাকায় স্ক্রিন লক হয়েছে!', 'warn');
    }, 20 * 60 * 1000);
  };
  ['mousemove','keydown','click','touchstart'].forEach(ev => document.addEventListener(ev, resetIdle, { passive: true }));
})();

// Startup: Auto Cloud Pull (if DEFAULT_CLOUD_URL is set) & Auto-Login
(async function bootApp() {
  if (DEFAULT_CLOUD_URL && navigator.onLine) {
    await pullFromCloud(true, DEFAULT_CLOUD_URL, '');
  }
  const savedLogin = (() => { try { return JSON.parse(localStorage.getItem(REMEMBER_LOGIN_KEY) || 'null'); } catch (e) { return null; } })();
  if (savedLogin && savedLogin.identity && savedLogin.pass) {
    if ($('loginUser')) $('loginUser').value = savedLogin.identity;
    if ($('loginPass')) $('loginPass').value = savedLogin.pass;
    if ($('rememberLogin')) $('rememberLogin').checked = true;
    window.login();
  } else {
    updateHeaderAndProfile(); render(); updateWorkPreview(); generatePixelCode(); renderMonthlyReport();
  }
})();