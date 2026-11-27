const REMEMBER_LOGIN_KEY = 'ads_hisab_remember_login_v72';
const SESSION_ACC_KEY = 'ads_hisab_session_v77';
const LANG_KEY = 'ads_hisab_lang_v72';
const isEn = () => (localStorage.getItem(LANG_KEY) || 'bn') === 'en';
const L = (bn, en) => isEn() ? en : bn;
const MASTER_DB_KEY = 'ads_hisab_user_data_v72_legacy-super-admin';
const ACCOUNTSKEY = 'ads_hisab_local_accounts_v72';
const NEXTUSERIDKEY = 'ads_hisab_next_user_id_v72';
const THEME_KEY = 'ads_hisab_theme_v72';
const PASSKEY = 'ads_hisab_superadmin_password_v72';
const LAST_BACKUP_KEY = 'ads_hisab_last_backup_v72';
const HELP_REQUESTS_KEY = 'ads_hisab_help_requests_v72';
const CLOUD_SYNC_KEY = 'ads_hisab_cloud_sync_v72';
const SUPERADMIN_META_KEY = 'ads_hisab_superadmin_meta_v72';
const SUB_CFG_KEY = 'ads_hisab_sub_config_v82';
const SUB_REQS_KEY = 'ads_hisab_sub_reqs_v82';
const LOCAL_DIRTY_KEY = 'ads_hisab_local_dirty_v73';
const LAST_CLOUD_TS_KEY = 'ads_hisab_last_cloud_ts_v73';
const DEFAULT_CLOUD_URL = 'https://ads-managerbd-default-rtdb.firebaseio.com/';
const DEFAULT_WALLETS = ['bKash', 'Nagad', 'Rocket', 'Bank', 'Cash', 'Card'];
const AD_PLATFORMS = ['Meta', 'Google', 'YouTube', 'TikTok'];

let KEY = MASTER_DB_KEY, PROFILEKEY = 'ads_hisab_user_profile_v72_legacy-super-admin';
let activeAccount = null, realSuperAdmin = null, deferredInstallPrompt = null;
let pendingProfilePicData = '', pendingAgLogoData = '', pendingAgQrData = '';
let pendingWorkProof = '', pendingEditWorkProof = '', pendingChatAttach = null, pendingCreativeThumb = '';
let portalOrders = [], portalPayments = [], pendingCsvRows = [], trackingPlatform = 'Meta';
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
const isStaff = () => activeAccount?.role === 'staff';
const isRealSuperAdmin = () => Boolean(realSuperAdmin) || activeAccount?.id === 'legacy-super-admin' || activeAccount?.role === 'super_admin';
const isSuperAdmin = () => !realSuperAdmin && (activeAccount?.id === 'legacy-super-admin' || activeAccount?.role === 'super_admin');
const isAdminOrSuper = () => Boolean(activeAccount && (activeAccount.id === 'legacy-super-admin' || activeAccount.role === 'super_admin' || activeAccount.role === 'admin'));
const isAccountExpired = acc => {
  if (!acc || acc.id === 'legacy-super-admin' || acc.role === 'super_admin' || acc.subscriptionBypass) return false;
  if (String(acc.plan || '').trim().toLowerCase() === 'lifetime' && !acc.expiryDate) return false;
  return Boolean(acc.expiryDate && acc.expiryDate < today());
};

const SUB_PLAN_KEYS = ['daily', 'weekly', 'monthly', 'yearly', 'lifetime'];
const defaultSubscriptionConfig = () => ({
  trialDays: 7,
  payInfo: '',
  autoActivateOnPaid: true,
  plans: {
    daily: { key: 'daily', label: 'Daily', days: 1, price: 20, enabled: true },
    weekly: { key: 'weekly', label: 'Weekly', days: 7, price: 100, enabled: true },
    monthly: { key: 'monthly', label: 'Monthly', days: 30, price: 350, enabled: true },
    yearly: { key: 'yearly', label: 'Yearly', days: 365, price: 3000, enabled: true },
    lifetime: { key: 'lifetime', label: 'Lifetime', days: 0, price: 8000, enabled: true }
  }
});
function normalizeSubscriptionConfig(raw) {
  const def = defaultSubscriptionConfig(), src = (raw && typeof raw === 'object') ? raw : {}, sp = (src.plans && typeof src.plans === 'object') ? src.plans : {};
  const plans = {};
  SUB_PLAN_KEYS.forEach(k => {
    const d = def.plans[k], p = sp[k] || {};
    plans[k] = { key: k, label: String(p.label || d.label), days: k === 'lifetime' ? 0 : Math.max(1, Math.round(num(p.days) || d.days)), price: Math.max(0, num(p.price !== undefined ? p.price : d.price)), enabled: p.enabled !== false };
  });
  return { trialDays: Math.max(1, Math.min(90, Math.round(num(src.trialDays) || def.trialDays))), payInfo: String(src.payInfo || ''), autoActivateOnPaid: src.autoActivateOnPaid !== false, plans };
}
const readSubscriptionConfig = () => { try { return normalizeSubscriptionConfig(JSON.parse(localStorage.getItem(SUB_CFG_KEY) || '{}')); } catch (e) { return defaultSubscriptionConfig(); } };
const writeSubscriptionConfig = cfg => { try { localStorage.setItem(SUB_CFG_KEY, JSON.stringify(normalizeSubscriptionConfig(cfg))); } catch (e) {} };
const readSubscriptionRequests = () => { try { const a = JSON.parse(localStorage.getItem(SUB_REQS_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const writeSubscriptionRequests = arr => { try { localStorage.setItem(SUB_REQS_KEY, JSON.stringify(Array.isArray(arr) ? arr : [])); } catch (e) {} };
function addDaysToDateStr(baseDate, days) {
  const d = new Date((baseDate || today()) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(num(days))));
  return d.toISOString().slice(0, 10);
}
window.autoFillPlanExpiry = (planElId, expiryElId) => {
  const pEl = $(planElId), eEl = $(expiryElId);
  if (!pEl || !eEl) return;
  const p = String(pEl.value || '').trim().toLowerCase();
  if (p === 'lifetime') { eEl.value = ''; return; }
  const cfg = readSubscriptionConfig();
  const days = p === 'trial' ? (cfg.trialDays || 7) : (cfg.plans[p]?.days || 30);
  eEl.value = addDaysToDateStr(today(), days);
};

function platformMeta(p) {
  const key = AD_PLATFORMS.includes(p) ? p : 'Meta';
  return {
    Meta: { label: 'Meta Ads', short: '📘 Meta', cls: 'plat-meta' },
    Google: { label: 'Google Ads', short: '🔍 Google', cls: 'plat-google' },
    YouTube: { label: 'YouTube Ads', short: '▶️ YouTube', cls: 'plat-youtube' },
    TikTok: { label: 'TikTok Ads', short: '🎵 TikTok', cls: 'plat-tiktok' }
  }[key];
}
const platformBadge = p => { const m = platformMeta(p); return `<span class="plat-badge ${m.cls}">${m.short}</span>`; };

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
function getRules() { return { enable24hLock: false, minBillRate: 0, blockLoss: false, defaultDueLimit: 0, requireApproval: false, makerChecker: false, hiddenTabsByRole: {}, blockStaffExport: false, maintenanceMode: false, idleLockMinutes: 0, masterPin: '', signupPolicy: 'trial7', ...(readSuperAdminMeta().conditions || {}) }; }
function askConfirm(message, title = 'নিশ্চিত করুন') {
  return new Promise(resolve => {
    const modal = $('appConfirmModal'), msgEl = $('appConfirmMessage'), titleEl = $('appConfirmTitle');
    const okBtn = $('appConfirmOkBtn'), cancelBtn = $('appConfirmCancelBtn'), closeX = $('appConfirmCloseX');
    if (!modal || !msgEl || !okBtn || !cancelBtn) {
      try { return resolve(window.confirm(message)); } catch (e) { return resolve(true); }
    }
    if (titleEl) titleEl.textContent = `⚠️ ${title}`;
    msgEl.textContent = message;
    modal.style.display = 'flex';
    const done = res => {
      modal.style.display = 'none';
      document.removeEventListener('keydown', onKey);
      okBtn.onclick = null; cancelBtn.onclick = null; if (closeX) closeX.onclick = null; modal.onclick = null;
      resolve(res);
    };
    const onKey = e => { if (e.key === 'Escape') done(false); else if (e.key === 'Enter') { e.preventDefault(); done(true); } };
    okBtn.onclick = () => done(true);
    cancelBtn.onclick = () => done(false);
    if (closeX) closeX.onclick = () => done(false);
    modal.onclick = e => { if (e.target === modal) done(false); };
    document.addEventListener('keydown', onKey);
    setTimeout(() => okBtn.focus(), 30);
  });
}
function askPrompt(message, defaultValue = '', title = 'তথ্য দিন', opts = {}) {
  return new Promise(resolve => {
    const modal = $('appPromptModal'), msgEl = $('appPromptMessage'), titleEl = $('appPromptTitle');
    const inp = $('appPromptInput'), okBtn = $('appPromptOkBtn'), cancelBtn = $('appPromptCancelBtn'), closeX = $('appPromptCloseX');
    if (!modal || !inp || !okBtn || !cancelBtn) {
      try { return resolve(window.prompt(message, defaultValue)); } catch (e) { return resolve(null); }
    }
    if (titleEl) titleEl.textContent = `✏️ ${title}`;
    if (msgEl) msgEl.textContent = message;
    inp.type = opts.type || 'text';
    inp.placeholder = opts.placeholder || '';
    inp.value = defaultValue === undefined || defaultValue === null ? '' : String(defaultValue);
    modal.style.display = 'flex';
    const done = val => {
      modal.style.display = 'none';
      document.removeEventListener('keydown', onKey);
      okBtn.onclick = null; cancelBtn.onclick = null; if (closeX) closeX.onclick = null; modal.onclick = null;
      resolve(val);
    };
    const onKey = e => { if (e.key === 'Escape') done(null); else if (e.key === 'Enter') { e.preventDefault(); done(inp.value); } };
    okBtn.onclick = () => done(inp.value);
    cancelBtn.onclick = () => done(null);
    if (closeX) closeX.onclick = () => done(null);
    modal.onclick = e => { if (e.target === modal) done(null); };
    document.addEventListener('keydown', onKey);
    setTimeout(() => { inp.focus(); inp.select(); }, 40);
  });
}
function openExternalUrl(url) {
  if (!url) return false;
  try {
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (w) return true;
  } catch (_) {}
  try {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    document.body.appendChild(a); a.click(); a.remove();
    return true;
  } catch (_) { return false; }
}
function requireMasterPin(label) {
  const pin = String(getRules().masterPin || '').trim();
  if (!pin) return Promise.resolve(true);
  const modal = $('masterPinModal'), input = $('masterPinModalInput'), errBox = $('masterPinModalErr');
  const lblEl = $('masterPinModalLabel'), confirmBtn = $('masterPinConfirmBtn'), cancelBtn = $('masterPinCancelBtn');
  const cancelX = $('masterPinCancelX'), eyeBtn = $('masterPinToggleEye'), adminHelp = $('masterPinAdminHelper'), goRulesBtn = $('masterPinGoRulesBtn');
  if (!modal || !input || !confirmBtn) {
    try {
      if (window.prompt(`সিকিউরিটি PIN দিন (${label}):`) !== pin) { toast('মাস্টার PIN সঠিক নয়!', 'error'); return Promise.resolve(false); }
      return Promise.resolve(true);
    } catch (e) { toast('মাস্টার PIN সঠিক নয়!', 'error'); return Promise.resolve(false); }
  }
  return new Promise(resolve => {
    if (lblEl) lblEl.textContent = `অ্যাকশন: ${label} — সম্পন্ন করতে অ্যাডমিন নির্ধারিত মাস্টার সিকিউরিটি PIN দিন।`;
    input.value = '';
    input.type = 'password';
    if (eyeBtn) eyeBtn.textContent = '👁️';
    if (errBox) { errBox.style.display = 'none'; errBox.textContent = ''; }
    if (adminHelp) adminHelp.style.display = isSuperAdmin() ? 'block' : 'none';
    modal.style.display = 'flex';
    const done = ok => {
      modal.style.display = 'none';
      document.removeEventListener('keydown', onKey);
      confirmBtn.onclick = null; cancelBtn.onclick = null;
      if (cancelX) cancelX.onclick = null;
      if (eyeBtn) eyeBtn.onclick = null;
      if (goRulesBtn) goRulesBtn.onclick = null;
      modal.onclick = null;
      resolve(ok);
    };
    const submit = () => {
      const entered = String(input.value || '').trim();
      if (entered === pin) return done(true);
      if (errBox) { errBox.textContent = '❌ মাস্টার PIN সঠিক নয়! সঠিক PIN দিন বা অ্যাডমিন রুলস থেকে পরিবর্তন করুন।'; errBox.style.display = 'block'; }
      toast('মাস্টার PIN সঠিক নয়!', 'error');
      input.select();
      input.focus();
    };
    const onKey = e => {
      if (e.key === 'Escape') done(false);
      else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    };
    confirmBtn.onclick = submit;
    cancelBtn.onclick = () => done(false);
    if (cancelX) cancelX.onclick = () => done(false);
    if (eyeBtn) eyeBtn.onclick = () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      eyeBtn.textContent = show ? '🙈' : '👁️';
      input.focus();
    };
    if (goRulesBtn) goRulesBtn.onclick = () => {
      done(false);
      if (typeof goToSection === 'function') goToSection('adminPanel');
      if (typeof switchAdminSubTab === 'function') switchAdminSubTab('rules');
      setTimeout(() => { $('condMasterPin')?.focus(); $('condMasterPin')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
    };
    modal.onclick = e => { if (e.target === modal) done(false); };
    document.addEventListener('keydown', onKey);
    setTimeout(() => input.focus(), 40);
  });
}
function isLocked24h(item) {
  if (!isStaff() || !getRules().enable24hLock || !item) return false;
  const ts = num(item.createdAt || item.updatedAt);
  if (ts > 0 && (Date.now() - ts) > 86400000) return true;
  return !ts && Boolean(item.date && item.date < today());
}
function applyGlobalNotice() {
  const meta = readSuperAdminMeta(), msg = String(meta.globalNotice || '').trim(), nType = meta.globalNoticeType || 'info';
  const speedMode = meta.globalNoticeSpeed || 'slow';
  const b = $('globalNoticeBanner'), t = $('globalNoticeText'), tr = $('globalNoticeTrack'), badge = $('globalNoticeBadge');
  if (b && t) {
    b.classList.remove('notice-warn', 'notice-danger');
    if (nType === 'warn') b.classList.add('notice-warn');
    else if (nType === 'danger') b.classList.add('notice-danger');
    if (badge) badge.textContent = nType === 'danger' ? L('🚨 জরুরি', '🚨 Urgent') : (nType === 'warn' ? L('⚠️ সতর্কতা', '⚠️ Alert') : L('📢 নোটিশ', '📢 Notice'));
    if (msg) {
      t.textContent = msg;
      b.style.display = 'flex';
      t.classList.remove('scrolling');
      requestAnimationFrame(() => {
        if (!tr || !t || speedMode === 'static') return;
        const overflow = t.scrollWidth > tr.clientWidth + 4 || msg.length > 52;
        if (overflow) {
          const pxPerSec = speedMode === 'very_slow' ? 24 : (speedMode === 'slow' ? 38 : (speedMode === 'normal' ? 62 : 95));
          const distPx = Math.max(600, tr.clientWidth + t.scrollWidth);
          const dur = Math.max(16, Math.min(140, Math.round(distPx / pxPerSec)));
          t.style.setProperty('--marquee-dur', dur + 's');
          t.classList.add('scrolling');
        }
      });
    } else {
      t.classList.remove('scrolling');
      b.style.display = 'none';
    }
  }
  const lb = $('authLoginBanner'), lbTxt = String(meta.loginBanner || '').trim();
  if (lb) { lb.textContent = lbTxt; lb.style.display = lbTxt ? 'block' : 'none'; }
  const rtb = $('regTrialBadge');
  if (rtb) {
    const pol = getRules().signupPolicy || 'trial7', tDays = readSubscriptionConfig().trialDays || 7;
    if (pol === 'trial7') {
      rtb.style.display = 'block';
      rtb.textContent = `⏳ নতুন অ্যাকাউন্টে ${tDays} দিনের ফ্রি ট্রায়াল পাবেন — মেয়াদ শেষে পছন্দমতো প্ল্যান নিতে পারবেন বা অ্যাডমিনের ফ্রি অনুমতিতে চলবে।`;
    } else if (pol === 'pending') {
      rtb.style.display = 'block';
      rtb.textContent = '🛡️ নতুন অ্যাকাউন্ট তৈরি করলে অ্যাডমিনের অনুমোদনের পর চালু হবে।';
    } else if (pol === 'closed') {
      rtb.style.display = 'block';
      rtb.textContent = '🔒 নতুন সেলফ-সাইনআপ বর্তমানে বন্ধ আছে — অ্যাডমিনের সাথে যোগাযোগ করুন।';
    } else {
      rtb.style.display = 'none';
    }
  }
  const mb = $('maintenanceBanner');
  if (mb) mb.style.display = (activeAccount && !isSuperAdmin() && getRules().maintenanceMode) ? 'flex' : 'none';
}
window.addEventListener('resize', () => { if (activeAccount) applyGlobalNotice(); });

function hasPerm(perm) {
  if (!activeAccount) return false;
  if (activeAccount.role !== 'staff') return true;
  const p = { canDelete: false, canEdit: true, canPayments: true, canExpenses: true, ...(activeAccount.perms || {}) };
  return Boolean(p[perm]);
}
const SA_CONFIGURABLE_TABS = [
  { key: 'customers', label: '👥 কাস্টমার ও CRM' },
  { key: 'quotations', label: '📝 কোটেশন / প্রোপোজাল' },
  { key: 'cards', label: '💳 ডলার ও কার্ড হিসাব' },
  { key: 'trading', label: '💱 ডলার ট্রেডিং' },
  { key: 'rates', label: '📈 দৈনিক ডলার রেট' },
  { key: 'works', label: '⚡ কাজের হিসাব ও ব্রিফ' },
  { key: 'graphicsHub', label: '🎨 গ্রাফিক্স ও পোস্টার স্টুডিও' },
  { key: 'pixelGen', label: '🎯 পিক্সেল ও অ্যাড অ্যাকাউন্ট' },
  { key: 'expenses', label: '💸 অফিস ও অন্যান্য খরচ' },
  { key: 'payments', label: '💰 পেমেন্ট ও ওয়ালেট' },
  { key: 'dues', label: '📑 বকেয়া ও WhatsApp' },
  { key: 'monthly', label: '📅 মাসিক হিসাব' },
  { key: 'reports', label: '📂 রিপোর্ট ও ব্যাকআপ' },
  { key: 'newsFeed', label: '📰 নিউজ ফিড ও পোস্ট' },
  { key: 'liveChat', label: '💬 টিম চ্যাট ও ভয়েস' }
];
function isTabHiddenForCurrentUser(tabKey) {
  if (!activeAccount || isSuperAdmin()) return false;
  const role = activeAccount.role || 'user';
  const hiddenMap = getRules().hiddenTabsByRole || {};
  const list = Array.isArray(hiddenMap[role]) ? hiddenMap[role] : [];
  return list.includes(tabKey);
}
function applyPermissionClasses() {
  document.body.classList.toggle('role-staff', isStaff());
  document.body.classList.toggle('role-superadmin', isSuperAdmin());
  document.body.classList.toggle('no-perm-del', !hasPerm('canDelete'));
  document.body.classList.toggle('no-perm-edit', !hasPerm('canEdit'));
  document.body.classList.toggle('no-perm-pay', !hasPerm('canPayments'));
  document.body.classList.toggle('no-perm-exp', !hasPerm('canExpenses'));
  document.querySelectorAll('.side-menu button[data-tab]').forEach(btn => {
    const t = btn.dataset.tab;
    if (!t || t === 'adminPanel') return;
    btn.style.display = isTabHiddenForCurrentUser(t) ? 'none' : '';
  });
  document.querySelectorAll('.side-menu .nav-folder').forEach(folder => {
    const btns = [...folder.querySelectorAll('.nav-folder-body button')];
    const visCount = btns.filter(b => b.style.display !== 'none' && !(isStaff() && b.classList.contains('staff-hide'))).length;
    folder.style.display = visCount > 0 ? '' : 'none';
    const cntEl = folder.querySelector('.hub-count');
    if (cntEl) cntEl.textContent = visCount;
  });
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
window.matchBudgetDollar = () => { if ($('wActualDollar') && $('wDollar')) { $('wActualDollar').value = $('wDollar').value || 0; if (typeof applyAutoWorkRate === 'function') applyAutoWorkRate(); updateWorkPreview(); } };
window.openLightbox = src => { if (!src || !$('imageLightboxModal')) return; $('lightboxImg').src = src; $('imageLightboxModal').style.display = 'flex'; };

const PRIVACY_KEY = 'ads_hisab_privacy_v81';
const DEFAULT_WA_TEMPLATE = 'আসসালামু আলাইকুম {name}, {agency} থেকে জানাচ্ছি—আপনার বিজ্ঞাপনের মোট বিল {bill}, জমা {paid}, এবং বকেয়া রয়েছে {due}। অনুগ্রহ করে বকেয়া পরিশোধ করার জন্য অনুরোধ রইল। {payinfo} ধন্যবাদ!';
const DEFAULT_CHECKLIST = () => ({ pageAccess: false, bmLinked: false, pixelReady: false, creativeReady: false, advancePaid: false });
const DEFAULT_BC_TEMPLATES = () => ({ rate: '', platforms: '', due: '', offer: '' });
const blank = () => ({
  updatedAt: 0, deletedIds: {}, wallets: [...DEFAULT_WALLETS], bankAccounts: [],
  rates: [], rateSlabs: [], customers: [], pages: [], works: [], payments: [], trades: [], quotations: [], packages: [],
  cardDeposits: [], cardTransfers: [], cardRefunds: [],  cardRentals: [], walletTransfers: [], recurringBills: [], tasks: [],
  adAccounts: [], cashAdjustments: [], cards: [], expenses: [], expenseBudgets: {}, riskLogs: [], dailyClosings: [], creatives: [], graphicsOrders: [],
  leads: [], contentCalendar: [], staffAttendance: [], brandKits: [], makerRequests: [],
  trash: [], broadcastLogs: [], reminderLogs: {}, reminderDates: {}, activityLogs: [],
  agency: { name: 'Ads হিসাব ম্যানেজার', tagline: 'Agency OS · Pro v81', phone: '', email: '', address: '', defaultRate: 125, defaultFeePct: 0, monthlyGoal: 100000, staffProfitTarget: 50000, staffBonusPct: 5, backupFreqDays: 1, logoUrl: '', qrUrl: '', signText: '', termsText: '', payInfo: '', metaToken: '', waApiUrl: '', waApiToken: '', waTemplate: DEFAULT_WA_TEMPLATE, bcTemplates: DEFAULT_BC_TEMPLATES() }
});
let db = blank();
const cardWalletKey = c => {
  const n = String(typeof c === 'string' ? c : (c?.name || '')).trim();
  return n ? `🏦 ${n}` : '';
};
const linkedCardWalletKeys = () => [...new Set((db.cards || []).map(c => cardWalletKey(c)).filter(Boolean))];
const linkedBankChoices = () => {
  const cardItems = (db.cards || []).map(c => ({ walletKey: cardWalletKey(c), label: `💳 ${c.name}`, cardId: c.id })).filter(x => x.walletKey);
  const seen = new Set(cardItems.map(x => x.walletKey.toLowerCase()));
  const legacyItems = (db.bankAccounts || []).filter(b => b?.walletKey && !seen.has(b.walletKey.toLowerCase())).map(b => ({ walletKey: b.walletKey, label: b.walletKey, legacyId: b.id }));
  return [...cardItems, ...legacyItems];
};
const isBankWallet = w => linkedCardWalletKeys().includes(w) || (db.bankAccounts || []).some(b => b.walletKey === w) || /^(?:🏦|bank\b)/i.test(String(w || '').trim());
function normalizeDb(raw) {
  const b = blank(), parsed = (raw && typeof raw === 'object') ? raw : {};
  const bankAccounts = Array.isArray(parsed.bankAccounts) ? parsed.bankAccounts.filter(x => x && x.walletKey) : [];
  const rawWallets = Array.isArray(parsed.wallets) && parsed.wallets.length ? parsed.wallets : DEFAULT_WALLETS;
  const wallets = [...new Set([...rawWallets, ...bankAccounts.map(x => x.walletKey)].map(x => String(x).trim()).filter(Boolean))];
  const rawAg = (parsed.agency && typeof parsed.agency === 'object') ? parsed.agency : {};
  return {
    updatedAt: num(parsed.updatedAt), deletedIds: (parsed.deletedIds && typeof parsed.deletedIds === 'object') ? parsed.deletedIds : {}, wallets, bankAccounts,
    rates: Array.isArray(parsed.rates) ? parsed.rates : [],
    rateSlabs: Array.isArray(parsed.rateSlabs) ? parsed.rateSlabs : [],
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    pages: Array.isArray(parsed.pages) ? parsed.pages : [], works: Array.isArray(parsed.works) ? parsed.works : [],
    payments: Array.isArray(parsed.payments) ? parsed.payments : [], trades: Array.isArray(parsed.trades) ? parsed.trades : [],
    quotations: Array.isArray(parsed.quotations) ? parsed.quotations : [],
    packages: Array.isArray(parsed.packages) ? parsed.packages : [],
    cardDeposits: Array.isArray(parsed.cardDeposits) ? parsed.cardDeposits : [], cardTransfers: Array.isArray(parsed.cardTransfers) ? parsed.cardTransfers : [],
    cardRefunds: Array.isArray(parsed.cardRefunds) ? parsed.cardRefunds : [],
    cardRentals: Array.isArray(parsed.cardRentals) ? parsed.cardRentals : [],
    walletTransfers: Array.isArray(parsed.walletTransfers) ? parsed.walletTransfers : [],
    recurringBills: Array.isArray(parsed.recurringBills) ? parsed.recurringBills : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    adAccounts: Array.isArray(parsed.adAccounts) ? parsed.adAccounts : [],
    cashAdjustments: Array.isArray(parsed.cashAdjustments) ? parsed.cashAdjustments : [], cards: Array.isArray(parsed.cards) ? parsed.cards : [],
    expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
    expenseBudgets: (parsed.expenseBudgets && typeof parsed.expenseBudgets === 'object' && !Array.isArray(parsed.expenseBudgets)) ? parsed.expenseBudgets : {},
    riskLogs: Array.isArray(parsed.riskLogs) ? parsed.riskLogs : [],
    dailyClosings: Array.isArray(parsed.dailyClosings) ? parsed.dailyClosings : [],
    creatives: Array.isArray(parsed.creatives) ? parsed.creatives : [],
    graphicsOrders: Array.isArray(parsed.graphicsOrders) ? parsed.graphicsOrders : [],
    leads: Array.isArray(parsed.leads) ? parsed.leads : [],
    contentCalendar: Array.isArray(parsed.contentCalendar) ? parsed.contentCalendar : [],
    staffAttendance: Array.isArray(parsed.staffAttendance) ? parsed.staffAttendance : [],
    brandKits: Array.isArray(parsed.brandKits) ? parsed.brandKits : [],
    makerRequests: Array.isArray(parsed.makerRequests) ? parsed.makerRequests : [],
    trash: Array.isArray(parsed.trash) ? parsed.trash : [],
    broadcastLogs: Array.isArray(parsed.broadcastLogs) ? parsed.broadcastLogs : [],
    reminderLogs: (parsed.reminderLogs && typeof parsed.reminderLogs === 'object') ? parsed.reminderLogs : {},
    reminderDates: (parsed.reminderDates && typeof parsed.reminderDates === 'object') ? parsed.reminderDates : {},
    activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : [],
    agency: { ...b.agency, ...rawAg, bcTemplates: { ...DEFAULT_BC_TEMPLATES(), ...(rawAg.bcTemplates && typeof rawAg.bcTemplates === 'object' ? rawAg.bcTemplates : {}) } }
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
const aaname = id => { const a = (db.adAccounts || []).find(x => x.id === id); return a ? `${a.name}${a.adId ? ` (${a.adId})` : ''}` : ''; };
const pageCustomer = id => db.pages.find(x => x.id === id)?.customerId || '';
const baseBill = w => num(w.actualDollar) * num(w.rate);
const workServiceCharge = w => { const f = num(w.serviceFee); return !f ? 0 : (w.serviceFeeType === 'pct' ? baseBill(w) * (f / 100) : f); };
const workSubBill = w => Math.max(0, baseBill(w) + workServiceCharge(w) - num(w.discount));
const workTaxAmount = w => workSubBill(w) * (num(w.taxPct) / 100);
const bill = w => workSubBill(w) + workTaxAmount(w);
const baseActual = w => num(w.actualDollar) * num(w.actualRate);
const feeCost = w => baseActual(w) * (num(w.feePct) / 100);
const actual = w => baseActual(w) + feeCost(w);
const profit = w => bill(w) - actual(w) - num(w.other);
const workCommission = w => num(w.commPct) > 0 ? Math.max(0, profit(w)) * (num(w.commPct) / 100) : 0;
const paid = id => db.payments.filter(p => p.customerId === id && p.approvalStatus !== 'pending').reduce((s, p) => s + num(p.amount), 0);
const billed = id => db.works.filter(w => w.customerId === id).reduce((s, w) => s + bill(w), 0);
const clientBalance = id => paid(id) - billed(id);
const tradeProfit = t => t.type === 'sell' ? (num(t.sellRate) - num(t.buyRate)) * num(t.usd) : 0;
const cardRentalRemainingUsd = r => +(num(r?.allocatedUsd) - num(r?.spentUsd)).toFixed(2);
const cardRentalBillUsd = r => (r?.billingBasis === 'allocated' ? num(r?.allocatedUsd) : num(r?.spentUsd));
const cardRentalTotalBill = r => +(cardRentalBillUsd(r) * num(r?.rate)).toFixed(2);
const cardRentalDueTk = r => +(cardRentalTotalBill(r) - num(r?.paidTk)).toFixed(2);
const cardRentalCostRate = r => num(r?.costRate) > 0 ? num(r.costRate) : (cardAvgRate(r?.cardId) || num(db.agency?.defaultRate) || 120);
const cardRentalProfit = r => +(cardRentalBillUsd(r) * (num(r?.rate) - cardRentalCostRate(r))).toFixed(2);
const quoteTotal = q => { const b = num(q.dollar) * num(q.rate), f = num(q.serviceFee); return b + (!f ? 0 : (q.serviceFeeType === 'pct' ? b * (f / 100) : f)); };
const agencyContactLine = (ag = db.agency || {}) => [ag.phone ? `মোবাইল: ${ag.phone}` : '', ag.email ? `ইমেইল: ${ag.email}` : '', ag.address ? `ঠিকানা: ${ag.address}` : ''].filter(Boolean).join(' · ') || 'প্রফেশনাল ইনভয়েস ও ক্যাশ মেমো';

function rateFor(date) { return db.rates.filter(r => r.date <= date).sort(byDateDesc)[0]?.value || num(db.agency?.defaultRate) || 0; }
function effectiveRateFor(custId, date, usdAmt = 0) {
  const c = custId ? db.customers.find(x => x.id === custId) : null;
  if (c && num(c.customRate) > 0) return num(c.customRate);
  const amt = num(usdAmt);
  if (amt > 0 && Array.isArray(db.rateSlabs) && db.rateSlabs.length) {
    const matches = db.rateSlabs.filter(s => amt >= num(s.minUsd) && (num(s.maxUsd) <= 0 || amt <= num(s.maxUsd))).sort((a, b) => num(b.minUsd) - num(a.minUsd));
    if (matches.length && num(matches[0].rate) > 0) return num(matches[0].rate);
  }
  return rateFor(date || today());
}
function getCardStats(cardId) {
  if (!cardId) return { inUsd: 0, depUsd: 0, depBankFee: 0, inTk: 0, avgRate: 0, outUsd: 0, balance: 0, rentalSpent: 0, rentalReserved: 0, freeBalance: 0 };
  const deps = db.cardDeposits.filter(d => d.cardId === cardId), trIn = db.cardTransfers.filter(t => t.toCardId === cardId), trOut = db.cardTransfers.filter(t => t.fromCardId === cardId), refs = db.cardRefunds.filter(r => r.cardId === cardId);
  const worksSpent = db.works.filter(w => (w.cardId || '') === cardId).reduce((s, w) => s + num(w.actualDollar), 0);
  const rentals = (db.cardRentals || []).filter(r => (r.cardId || '') === cardId);
  const rentalSpent = rentals.reduce((s, r) => s + num(r.spentUsd), 0);
  const rentalReserved = rentals.reduce((s, r) => s + Math.max(0, num(r.allocatedUsd) - num(r.spentUsd)), 0);
  const trdBuy = db.trades.filter(t => t.cardId === cardId && t.type === 'buy'), trdSell = db.trades.filter(t => t.cardId === cardId && t.type === 'sell');
  const depUsd = deps.reduce((s, d) => s + num(d.amount), 0), depTk = deps.reduce((s, d) => s + num(d.taka), 0), depBankFee = deps.reduce((s, d) => s + num(d.bankFeeTk), 0);
  const trInUsd = trIn.reduce((s, t) => s + num(t.amount), 0), trInTk = trIn.reduce((s, t) => s + num(t.takaValue), 0);
  const buyUsd = trdBuy.reduce((s, t) => s + num(t.usd), 0), buyTk = trdBuy.reduce((s, t) => s + num(t.usd) * num(t.buyRate), 0);
  const refUsd = refs.reduce((s, r) => s + num(r.amount), 0), trOutUsd = trOut.reduce((s, t) => s + num(t.amount), 0) + trdSell.reduce((s, t) => s + num(t.usd), 0);
  const inUsd = depUsd + trInUsd + buyUsd + refUsd, inTk = depTk + depBankFee + trInTk + buyTk, baseUsd = depUsd + trInUsd + buyUsd;
  const outUsd = worksSpent + trOutUsd + rentalSpent, balance = inUsd - outUsd;
  return { inUsd, depUsd, depBankFee, inTk, avgRate: baseUsd > 0 ? +(inTk / baseUsd).toFixed(2) : 0, outUsd, balance, rentalSpent, rentalReserved, freeBalance: balance - rentalReserved };
}
const cardAvgRate = cardId => getCardStats(cardId).avgRate;
const cardSpent = cardId => getCardStats(cardId).outUsd;

function getWalletBalances() {
  const bal = {}; [...(db.wallets || DEFAULT_WALLETS), ...linkedCardWalletKeys()].forEach(w => { if (w) bal[w] = 0; });
  const ensure = k => { const key = k || 'Cash'; if (!Object.prototype.hasOwnProperty.call(bal, key)) bal[key] = 0; return key; };
  db.payments.filter(p => p.approvalStatus !== 'pending').forEach(p => { bal[ensure(p.method)] += num(p.amount) - num(p.fee); });
  db.expenses.filter(ex => ex.approvalStatus !== 'pending').forEach(ex => { bal[ensure(ex.method)] -= num(ex.amount); });
  db.cardDeposits.forEach(d => { bal[ensure(d.method || 'Bank')] -= (num(d.taka) + num(d.bankFeeTk)); });
  db.cashAdjustments.forEach(a => { bal[ensure(a.method)] += a.type === 'out' ? -num(a.amount) : num(a.amount); });
  db.trades.forEach(t => { bal[ensure(t.method || 'Cash')] += t.type === 'sell' ? num(t.paidTk) : -num(t.paidTk); });
  (db.cardRentals || []).forEach(r => { bal[ensure(r.method || 'Cash')] += num(r.paidTk); });
  (db.walletTransfers || []).forEach(wt => { bal[ensure(wt.from)] -= (num(wt.amount) + num(wt.fee)); bal[ensure(wt.to)] += num(wt.amount); });
  return bal;
}

function updateStorageMeter() {
  let bytes = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); bytes += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (e) {}
  const pct = Math.min(100, Math.round((bytes / (5 * 1024 * 1024)) * 100)), kbStr = bytes > 1048576 ? (bytes / 1048576).toFixed(2) + ' MB' : Math.round(bytes / 1024) + ' KB';
  const col = pct >= 85 ? '#dc2626' : (pct >= 60 ? '#f59e0b' : '#10b981');
  [['setStorageText', 'setStorageBar'], ['storageMeterText', 'storageMeterBar']].forEach(([tId, bId]) => { if ($(tId)) $(tId).textContent = `${kbStr} / 5 MB (${pct}%)`; if ($(bId)) { $(bId).style.width = `${pct}%`; $(bId).style.background = col; } });
}

let serverAuthToken = '';
let serverWorkspaceSyncTimer = null;
async function refreshServerSessionToken() {
  try {
    const sessRes = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin'
    });
    if (!sessRes.ok) return false;
    const sessData = await sessRes.json().catch(() => null);
    if (sessData?.ok && sessData.token) {
      serverAuthToken = sessData.token;
      return true;
    }
  } catch (_) {}
  return false;
}
async function serverFetch(url, opts = {}) {
  const skipRefresh = Boolean(opts._skipSessionRefresh);
  if (!serverAuthToken && !skipRefresh && activeAccount && navigator.onLine) {
    await refreshServerSessionToken();
  }
  const makeReq = () => {
    const headers = { ...(opts.headers || {}) };
    if (serverAuthToken) headers.Authorization = `Bearer ${serverAuthToken}`;
    const cleanOpts = { ...opts };
    delete cleanOpts._skipSessionRefresh;
    return fetch(url, { credentials: 'same-origin', ...cleanOpts, headers });
  };
  let res = await makeReq();
  if ((res.status === 401 || res.status === 403) && !skipRefresh && activeAccount && navigator.onLine) {
    const refreshed = await refreshServerSessionToken();
    if (refreshed) res = await makeReq();
  }
  return res;
}
async function pushServerWorkspace() {
  if (!serverAuthToken || !activeAccount || !navigator.onLine) return false;
  try {
    const res = await serverFetch('/api/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        db,
        globalRules: isSuperAdmin() ? getRules() : undefined,
        superAdminMeta: isSuperAdmin() ? readSuperAdminMeta() : undefined
      })
    });
    if (res.ok) {
      const cfg = readCloudSync();
      if (!cfg.url) setSyncUi('ok', 'Server Synced');
      return true;
    }
  } catch (e) {}
  return false;
}
function scheduleServerWorkspacePush() {
  if (!serverAuthToken || !activeAccount) return;
  clearTimeout(serverWorkspaceSyncTimer);
  serverWorkspaceSyncTimer = setTimeout(() => { pushServerWorkspace(); }, 750);
}
async function pullServerWorkspace() {
  if (!serverAuthToken || !activeAccount || !navigator.onLine) return false;
  try {
    const res = await serverFetch('/api/workspace');
    if (!res.ok) {
      let errData = null;
      try { errData = await res.json(); } catch (_) {}
      if (errData?.subscriptionConfig) writeSubscriptionConfig(errData.subscriptionConfig);
      if (res.status === 401 || res.status === 403) {
        const msg = errData?.error || 'আপনার সেশন বা সাবস্ক্রিপশন মেয়াদ শেষ হয়েছে।';
        performLocalLogout(msg);
        if (errData?.subscriptionExpired) openSubscriptionModal({ expiredLock: true, lockMessage: msg, lockedAccount: errData.account, previewOnly: true });
      }
      return false;
    }
    const data = await res.json();
    if (data.subscriptionConfig) writeSubscriptionConfig(data.subscriptionConfig);
    if (Array.isArray(data.subscriptionRequests)) writeSubscriptionRequests(data.subscriptionRequests);
    if (data.globalRules && typeof data.globalRules === 'object') {
      const meta = readSuperAdminMeta();
      meta.conditions = { ...(meta.conditions || {}), ...data.globalRules };
      writeSuperAdminMeta(meta);
      applyGlobalNotice();
    }
    if (Array.isArray(data.accounts) && data.accounts.length && isAdminOrSuper()) {
      const localAccs = readLocalAccounts();
      const byId = new Map();
      localAccs.forEach(a => { if (a?.id) byId.set(a.id, a); });
      data.accounts.forEach(sa => {
        if (!sa?.id) return;
        const prev = byId.get(sa.id);
        if (!prev || num(sa.updatedAt) >= num(prev.updatedAt)) byId.set(sa.id, { ...(prev || {}), ...sa });
      });
      localStorage.setItem(ACCOUNTSKEY, JSON.stringify(Array.from(byId.values())));
    }
    if (data.selfAccount && activeAccount && activeAccount.id !== 'legacy-super-admin') {
      activeAccount = { ...activeAccount, ...data.selfAccount };
      try { sessionStorage.setItem(SESSION_ACC_KEY, JSON.stringify(activeAccount)); } catch (e) {}
      const accs = readLocalAccounts(), idx = accs.findIndex(a => a.id === activeAccount.id);
      if (idx !== -1) { accs[idx] = { ...accs[idx], ...data.selfAccount }; localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs)); }
      if (!isRealSuperAdmin() && isAccountExpired(activeAccount)) {
        const expiredAcc = { ...activeAccount };
        const msg = `আপনার ফ্রি ট্রায়াল / সাবস্ক্রিপশন মেয়াদ (${expiredAcc.expiryDate}) শেষ হওয়ায় অ্যাকাউন্ট অটো-লক হয়েছে 🔒`;
        performLocalLogout(msg);
        openSubscriptionModal({ expiredLock: true, lockMessage: msg, lockedAccount: expiredAcc, previewOnly: true });
        return false;
      }
    }
    if (data.db && typeof data.db === 'object') {
      const merged = mergeDbObjects(db, data.db);
      db = merged;
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
      applyAgencyBranding();
      render();
    }
    updateHeaderAndProfile();
    updateNotifications();
    setSyncUi('ok', 'Server Synced');
    return true;
  } catch (e) {}
  return false;
}

function setSyncUi(state, label) {
  const el = $('syncStatusBtn'); if (!el) return; el.className = 'sync-pill ' + (state || '');
  el.innerHTML = `${state === 'ok' ? '🟢' : (state === 'busy' ? '🟡' : (state === 'err' ? '🔴' : '⚪'))} <span class="sync-txt">${esc(label || 'Local')}</span>`;
}
let autoSyncTimer = null;
function triggerAccountCloudSync() {
  scheduleServerWorkspacePush();
  const syncCfg = readCloudSync();
  if (syncCfg.autoSync && syncCfg.url) {
    localStorage.setItem(LOCAL_DIRTY_KEY, '1');
    if (!navigator.onLine) setSyncUi('err', 'Offline (Pending)');
    else { setSyncUi('busy', 'Syncing...'); clearTimeout(autoSyncTimer); autoSyncTimer = setTimeout(() => pushToCloud(true), 1200); }
  } else setSyncUi(serverAuthToken ? 'ok' : '', serverAuthToken ? 'Server Synced' : 'Local');
  updateStorageMeter();
}
function save() {
  if (activeAccount && !isSuperAdmin() && getRules().maintenanceMode) {
    loadDb(); render();
    return toast(L('🛠️ সিস্টেম মেইনটেন্যান্স (Read-Only) মোডে আছে — পরিবর্তন অনুমোদিত নয়!', '🛠️ Maintenance mode active — edits blocked!'), 'warn');
  }
  db.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('ব্রাউজার স্টোরেজ পূর্ণ!', 'error'); }
  if (typeof maybeCaptureDailySnapshot === 'function') maybeCaptureDailySnapshot();
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
    const col = { page: 'pages', work: 'works', payment: 'payments', expense: 'expenses', rate: 'rates', rateSlab: 'rateSlabs', walletTransfer: 'walletTransfers', recurringBill: 'recurringBills', task: 'tasks', card: 'cards', deposit: 'cardDeposits', cardRental: 'cardRentals', adAccount: 'adAccounts', trade: 'trades', quotation: 'quotations', package: 'packages', riskLog: 'riskLogs', creative: 'creatives', graphicsOrder: 'graphicsOrders' }[item.type];
    if (col && !db[col].some(x => x.id === d.id)) db[col].push(unmark(d));
  }
  markDeleted(trashId); db.trash.splice(idx, 1); save(); logActivity(`রিস্টোর: ${item.label}`); renderAdminPanel(); toast('ডেটা পুনরুদ্ধার হয়েছে!');
};
window.permDeleteTrash = async trashId => { if (!isSuperAdmin() || !(await askConfirm('স্থায়ীভাবে মুছবেন?'))) return; markDeleted(trashId); db.trash = db.trash.filter(x => x.id !== trashId); save(); renderAdminPanel(); toast('স্থায়ীভাবে মুছে ফেলা হয়েছে', 'warn'); };
window.emptyTrash = async () => { if (!isSuperAdmin() || !db.trash.length) return; if (!(await requireMasterPin('ট্র্যাশ খালি'))) return; if (!(await askConfirm('ট্র্যাশ খালি করবেন?'))) return; db.trash.forEach(t => markDeleted(t.id)); db.trash = []; save(); renderAdminPanel(); toast('ট্র্যাশ খালি হয়েছে', 'warn'); };

// Drawer, Search, Lock, Notifications
function toggleMobileMenu(force) { const sb = $('appSidebar'), bd = $('sidebarBackdrop'); if (!sb || !bd) return; const open = typeof force === 'boolean' ? force : !sb.classList.contains('open'); sb.classList.toggle('open', open); bd.classList.toggle('open', open); }
if ($('mobileMenuBtn')) $('mobileMenuBtn').onclick = () => toggleMobileMenu();
if ($('sidebarBackdrop')) $('sidebarBackdrop').onclick = () => toggleMobileMenu(false);

function openQuickSearch() { if (!$('quickSearchModal')) return; $('quickSearchModal').style.display = 'flex'; $('quickSearchInput').value = ''; renderQuickSearch(''); setTimeout(() => $('quickSearchInput')?.focus(), 50); }
if ($('quickSearchBtn')) $('quickSearchBtn').onclick = openQuickSearch;
function renderQuickSearch(q) {
  const host = $('quickSearchResults'); if (!host) return; const s = q.trim().toLowerCase(), res = [];
  db.customers.filter(c => !s || String(c.name || '').toLowerCase().includes(s) || (c.phone || '').includes(s)).slice(0, 6).forEach(c => res.push(`<div class="search-item" onclick="closeModal('quickSearchModal');openClientProfile('${c.id}')"><div><strong>👤 ${esc(c.name)}</strong><br><small class="muted">${esc(c.phone || 'ফোন নেই')}</small></div><span class="badge-admin">কাস্টমার</span></div>`));
  db.works.filter(w => !s || String(w.name || '').toLowerCase().includes(s) || (w.platform || 'Meta').toLowerCase().includes(s) || cname(w.customerId).toLowerCase().includes(s)).slice(0, 6).forEach(w => res.push(`<div class="search-item" onclick="closeModal('quickSearchModal');goToSection('works');$('workSearch').value='${esc(w.name).replace(/'/g, "\\'")}';workPage=1;render()"><div><strong>⚡ ${esc(w.name)}</strong> ${platformBadge(w.platform)}<br><small class="muted">${esc(cname(w.customerId))} · ${esc(w.date)} · ${money(bill(w))}</small></div><span class="badge-status status-running">${esc(w.status)}</span></div>`));
  db.pages.filter(p => !s || String(p.name || '').toLowerCase().includes(s) || (p.platform || 'Meta').toLowerCase().includes(s) || (p.adId || '').toLowerCase().includes(s) || (p.pixelId || '').includes(s)).slice(0, 5).forEach(p => res.push(`<div class="search-item" onclick="closeModal('quickSearchModal');goToSection('customers')"><div><strong>📄 ${esc(p.name)}</strong> ${platformBadge(p.platform)}<br><small class="muted">${esc(cname(p.customerId))} · Ad: ${esc(p.adId || '—')}</small></div><span class="badge-success">অ্যাসেট</span></div>`));
  (db.graphicsOrders || []).filter(g => !s || String(g.title || '').toLowerCase().includes(s) || cname(g.customerId).toLowerCase().includes(s) || (g.designer || '').toLowerCase().includes(s)).slice(0, 4).forEach(g => res.push(`<div class="search-item" onclick="closeModal('quickSearchModal');goToSection('graphicsHub')"><div><strong>🎨 ${esc(g.title)}</strong> <span class="badge-admin">${esc(g.type || 'Design')}</span><br><small class="muted">${esc(cname(g.customerId))} · ${esc(g.status || 'Pending')}</small></div><span class="badge-warn">${money(g.charge)}</span></div>`));
  host.innerHTML = res.join('') || '<div class="muted" style="padding:14px;text-align:center">কোনো মিল পাওয়া যায়নি</div>';
}
if ($('quickSearchInput')) {
  $('quickSearchInput').oninput = e => renderQuickSearch(e.target.value);
  $('quickSearchInput').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const first = $('quickSearchResults')?.querySelector('.search-item'); if (first) first.click(); } };
}
if ($('lockScreenBtn')) $('lockScreenBtn').onclick = () => {
  if (!activeAccount) return;
  serverAuthToken = '';
  fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' }).catch(() => {});
  sessionStorage.removeItem(SESSION_ACC_KEY);
  localStorage.removeItem(REMEMBER_LOGIN_KEY);
  activeAccount = null; realSuperAdmin = null;
  if ($('impersonateBanner')) $('impersonateBanner').style.display = 'none';
  if ($('adminTab')) $('adminTab').style.display = 'none';
  document.body.classList.remove('role-staff', 'role-superadmin', 'no-perm-del', 'no-perm-edit', 'no-perm-pay', 'no-perm-exp');
  KEY = MASTER_DB_KEY; loadDb(); applyGlobalNotice();
  resetAllTransientForms(); clearAuthForms();
  if ($('authOverlay')) $('authOverlay').style.display = 'flex';
  if ($('loginFormContainer')) $('loginFormContainer').style.display = 'block';
  if ($('registerPanel')) $('registerPanel').style.display = 'none';
  toast('স্ক্রিন লক করা হয়েছে!', 'warn');
};

let currentNotifKeys = [];
const getNotifStateKey = () => 'ads_hisab_notif_state_v72_' + (activeAccount?.id || 'legacy-super-admin');
function readNotifState() { try { const r = JSON.parse(localStorage.getItem(getNotifStateKey()) || '{}'); if (r.date === today()) return { date: today(), seen: Array.isArray(r.seen) ? r.seen : [], dismissed: Array.isArray(r.dismissed) ? r.dismissed : [] }; } catch (e) {} return { date: today(), seen: [], dismissed: [] }; }
function writeNotifState(s) { try { localStorage.setItem(getNotifStateKey(), JSON.stringify(s)); } catch (e) {} }
function markNotifsSeen(keys) { if (!keys?.length) return; const st = readNotifState(); keys.forEach(k => { if (!st.seen.includes(k)) st.seen.push(k); }); writeNotifState(st); if ($('notifCount')) $('notifCount').style.display = 'none'; }
window.dismissNotif = (e, key) => { e.stopPropagation(); const st = readNotifState(); if (!st.seen.includes(key)) st.seen.push(key); if (!st.dismissed.includes(key)) st.dismissed.push(key); writeNotifState(st); updateNotifications(); };
if ($('notifIcon') && $('notifBox')) {
  $('notifIcon').onclick = e => {
    e.stopPropagation();
    const box = $('notifBox'), open = box.style.display !== 'block';
    box.style.display = open ? 'block' : 'none';
    if (open) {
      if (isSuperAdmin()) loadSubscriptionRequests(false);
      markNotifsSeen(currentNotifKeys);
      const me = typeof getCurrentActor === 'function' ? getCurrentActor().username : '';
      const hasUnreadFeed = (communityState.notifications || []).some(n => !n.read && n.toUsername === me);
      if (hasUnreadFeed) {
        (communityState.notifications || []).forEach(n => { if (n.toUsername === me) n.read = true; });
        if (typeof persistCommunityCache === 'function') persistCommunityCache();
        if (typeof postCommunityAction === 'function') postCommunityAction({ action: 'mark_feed_notifs_read' });
      }
    }
  };
  document.addEventListener('click', e => { if (!$('notifBox').contains(e.target) && !$('notifIcon').contains(e.target)) $('notifBox').style.display = 'none'; });
}

// Language (i18n — Full 100% BN <-> EN)
const translations = {
  bn: {
    navDash: "ড্যাশবোর্ড", navCust: "👥 কাস্টমার ও CRM", navQuotes: "📝 কোটেশন / প্রোপোজাল", navCards: "💳 ডলার ও কার্ড হিসাব", navTrading: "💱 ডলার ট্রেডিং (Buy/Sell)",
    navRates: "📈 দৈনিক ডলার রেট", navWorks: "কাজের হিসাব", navGfx: "🎨 গ্রাফিক্স ও পোস্টার স্টুডিও", navPixel: "🎯 পিক্সেল, ট্যাগ ও অ্যাড অ্যাকাউন্ট", navExp: "💸 অফিস ও অন্যান্য খরচ", navPay: "💰 পেমেন্ট ও মোবাইল ওয়ালেট",
    navDue: "📑 বকেয়া ও ১-ক্লিক WhatsApp", navMonthly: "📅 মাসিক হিসাব", navRep: "📂 রিপোর্ট, কমিশন ও ব্যাকআপ", navSet: "⚙ সেটিংস", navChat: "💬 টিম চ্যাট (ছবি/ফাইল)", navTraining: "🎓 ব্যবহার নির্দেশিকা",
    nfClientLbl: "ক্লায়েন্ট ও সেলস", nfFinanceLbl: "কার্ড ও ফাইন্যান্স", nfStudioLbl: "অ্যাডস ও ক্রিয়েটিভ AI", nfTeamLbl: "এনালিটিক্স ও টিম", nfSystemLbl: "সিস্টেম ও কন্ট্রোল",
    headerSub: "Meta, Google, YouTube ও TikTok বিজ্ঞাপন এবং লাভ পরিচালনা করুন", loginTitle: "Ads হিসাব ম্যানেজার", loginSub: "আপনার বিজ্ঞাপনের হিসাব ও লাভ-ক্ষতি নিরাপদে পরিচালনা করুন",
    userLabel: "ইউজারনেম / ইমেইল / মোবাইল", passLabel: "পাসওয়ার্ড", rememberText: "Remember me", loginBtnText: "লগইন করুন", notifHead: "বিজ্ঞপ্তি ও অটো অ্যালার্ট",
    btnResetPass: "পাসওয়ার্ড রিসেট", btnFindUser: "ইউজারনেম খুঁজুন", btnNewAcc: "নতুন অ্যাকাউন্ট তৈরি করুন", btnHelpSupport: "🆘 অ্যাডমিন / সুপার অ্যাডমিন হেল্প",
    lblFrom: "শুরুর তারিখ", lblTo: "শেষ তারিখ", btnFilter: "ফিল্টার", btnAllDates: "সব তারিখ",
    c1: "আজকের নিট লাভ", c2: "মোট বিলিং / আয়", c3: "প্রকৃত এড খরচ", c4: "নিট প্রফিট", cTodayBill: "আজকের বিল", cTodaySpend: "আজকের খরচ", cTotalPaid: "মোট আদায়", cTotalDue: "মোট বকেয়া",
    chartMonthly: "📈 শেষ ৬ মাসের আয়, খরচ ও লাভ", chartTop: "🏆 টপ ক্লায়েন্ট", activeAdsTitle: "⚡ চলমান ক্যাম্পেইন মনিটর (Active Ads)",
    secCust: "👥 কাস্টমার, অনবোর্ডিং, CRM ও অ্যাড অ্যাসেট", secCards: "💳 ডলার ও ব্যাংক কার্ড হিসাব", secRates: "📈 দৈনিক ডলার রেট", secWorks: "⚡ নতুন কাজ / বিজ্ঞাপন ক্যাম্পেইন (Meta, Google, YouTube, TikTok)",
    secGfx: "🎨 গ্রাফিক্স, অ্যাড পোস্টার স্টুডিও ও ডিজাইন অর্ডার হাব"
  },
  en: {
    navDash: "Dashboard", navCust: "👥 Customers & CRM", navQuotes: "📝 Quotations", navCards: "💳 Cards & USD", navTrading: "💱 USD Trading (Buy/Sell)",
    navRates: "📈 Daily USD Rates", navWorks: "Campaigns", navGfx: "🎨 Graphics & Poster Studio", navPixel: "🎯 Pixels, Tags & Ad Accounts", navExp: "💸 Office Expenses", navPay: "💰 Payments & Wallets",
    navDue: "📑 Dues & WhatsApp Broadcast", navMonthly: "📅 Monthly Report", navRep: "📂 Reports, Comm & Backup", navSet: "⚙ Settings", navChat: "💬 Team Chat (Media)", navTraining: "🎓 Training Hub",
    nfClientLbl: "Clients & Sales", nfFinanceLbl: "Cards & Finance", nfStudioLbl: "Ads & Creative AI", nfTeamLbl: "Analytics & Team", nfSystemLbl: "System & Control",
    headerSub: "Manage Meta, Google, YouTube & TikTok ad accounts and profit", loginTitle: "Ads Manager Login", loginSub: "Manage ad accounts & clients securely",
    userLabel: "Username / Email / Mobile", passLabel: "Password", rememberText: "Remember me", loginBtnText: "Login", notifHead: "Notifications & Auto Alerts",
    btnResetPass: "Reset Password", btnFindUser: "Find Username", btnNewAcc: "Create Account", btnHelpSupport: "🆘 Admin / Super Admin Help",
    lblFrom: "From Date", lblTo: "To Date", btnFilter: "Filter", btnAllDates: "All Dates",
    c1: "Today Net Profit", c2: "Total Billing / Income", c3: "Actual Ad Cost", c4: "Net Profit", cTodayBill: "Today Bill", cTodaySpend: "Today Cost", cTotalPaid: "Total Paid", cTotalDue: "Total Due",
    chartMonthly: "📈 6-Month Revenue, Spend & Profit", chartTop: "🏆 Top Clients", activeAdsTitle: "⚡ Active Campaigns Monitor",
    secCust: "👥 Customers, Onboarding, CRM & Ad Assets", secCards: "💳 Cards & USD Ledger", secRates: "📈 Daily USD Rates", secWorks: "⚡ Multi-Platform Campaigns (Meta, Google, YouTube, TikTok)",
    secGfx: "🎨 Graphics, Ad Poster Studio & Design Order Hub"
  }
};

const DYNAMIC_I18N_SKIP_IDS = new Set([
  'workRows','customerRows','pageRows','adAccountRows','rateRows','expenseRows','paymentRows',
  'dueRows','lowPrepaidRows','waBcHistoryRows','cardBalanceRows','depositHistoryRows',
  'cardTransferRows','cardRefundRows','tradeRows','quoteRows','pixelListRows','repWorkRows',
  'platformReportRows','staffCommRows','reportRows','saUserRows','approvalRows','portalOrderRows',
  'helpReqRows','trashRows','activityLogRows','chatMessages','notifList','topClientsList',
  'dashActiveWorksRows','dashFollowUpRows','dashExpiredWorksRows','dashTimelineRows',
  'platformComparisonChart','waBcRows','waBcPreview','dashPlatformGrid','cardMetrics',
  'walletMetrics','tradeMetrics','dueMetrics','dashCardSummary','dashWalletSummary',
  'dashLowPrepaidList','expenseCategorySummary','cpBody','prfStatsGrid','qtModBody',
  'invRows','invPayRows','csRows','msgTplList','quickSearchResults',
  'portalPaymentRows','riskLogRows','dayClosingHistoryRows','csvImpRows','dcStatsGrid','dcWalletRows',
  'stmtRows','stmtSummaryGrid','creativeGrid','cardPartnerRows','supplierSummaryRows',
  'rateSlabRows','recurringBillRows','walletTransferRows','taskBoardRows','winBackRows',
  'pnlSummaryGrid','trdStmtSummary','trdStmtRows','roasCalcOutput','usdCalcOutput','agreeBodyContent',
  'saSystemPulse','saStorageBreakdown','chatTeamList','chatPinnedText','chatReplyBar','globalNoticeText',
  'cardRentMetrics','cardRentRows','cardRentPreview','cardRentActionMeta',
  'adAccountHealthMetrics','adAccountCalendarGrid','staffLeaderboardCards','autoSnapshotRows',
  'lastBackupStatusBadge','backupReminderText','workPrepaidAlertText',
  'dueAgingStrip','clientProfitMetrics','expenseBudgetGrid','todayCashflowMetrics','ucProfitOutput','promiseCustName',
  'gfxOrderMetrics','gfxOrderRows','gfxDimBadge','adminRoleMatrixGrid','adminTeamSummaryBox','profilePlanCard','saSelectedCount','authLoginBanner','packageCardsGrid','funnelPlanOutput','liveVoiceTranscript','liveVoiceStatusText',
  'newsFeedList','feedMembersList','feedModerationSummary','feedStoriesBar','upModalBody','upModalTitle','modReportRows','saWarnedUsersList','saModKpiGrid','saPostManageRows','tvPeersList','tvRoomStatus','tvRoomSub','chatTypingBar','userWarningBannerText','feedUnreadBadge',
  'dmPeerList','dmMessages','dmUnreadBadge','dmActivePeerTitle','dmRecStatus','leadKanbanBoard','leadOpenBadge','contentCalendarList','hrTodayStatus','hrAttendanceRows','hrPayslipPreview','hrStaffAttStats','aiCopyHooksList','aiCopyCaptionBox','aiCopyTagsBox','aiCopyScriptBox','csrBody',
  'saSessionRows','saLoginAuditRows','makerApprovalRows','saTabMatrixGrid','saRiskAuditBox','saExecReportBody','saPowerGuideGrid'
]);

const UI_BN_TO_EN = {
  // Header, Sidebar, Auth, Common Buttons
  "🛡 অ্যাডমিন প্যানেল": "🛡 Admin Panel",
  "সম্পূর্ণ এক্সেস ও কন্ট্রোল": "Full Access & Control",
  "স্টাফ ওয়ার্কস্পেস": "Staff Workspace",
  "📢 WhatsApp ব্রডকাস্ট": "📢 WhatsApp Broadcast",
  "সব কাস্টমারকে ১ ক্লিকে WhatsApp মেসেজ পাঠান": "Send 1-click WhatsApp broadcast to all customers",
  "ভাষা পরিবর্তন (বাংলা / English)": "Switch Language (Bangla / English)",
  "দ্রুত খুঁজুন (Ctrl + K)": "Quick Search (Ctrl + K)",
  "স্ক্রিন লক": "Lock Screen",
  "থিম": "Theme",
  "বিজ্ঞপ্তি": "Notifications",
  "নতুন কাজ": "New Campaign",
  "নতুন অ্যাকাউন্ট তৈরি করুন": "Create New Account",
  "আপনার নাম *": "Your Name *",
  "ইউজারনেম *": "Username *",
  "ইমেইল *": "Email *",
  "মোবাইল নম্বর *": "Mobile Number *",
  "পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর) *": "Password (min 6 chars) *",
  "পাসওয়ার্ড আবার *": "Confirm Password *",
  "অ্যাকাউন্ট তৈরি করুন": "Create Account",
  "ইতিমধ্যে অ্যাকাউন্ট আছে? লগইন করুন": "Already have an account? Login",
  "✕ বন্ধ করুন": "✕ Close",
  "✕ বন্ধ": "✕ Close",
  "বন্ধ": "Close",
  "আপডেট করুন": "Update",
  "সেভ করুন": "Save",
  "পরিবর্তন সেভ করুন": "Save Changes",
  "তৈরি করুন": "Create",
  "মুছুন": "Delete",
  "দেখুন": "View",
  "ফিল্টার": "Filter",
  "সব তারিখ": "All Dates",
  "চলতি মাস": "This Month",
  "🖨️ প্রিন্ট": "🖨️ Print",
  "🖨️ প্রিন্ট / PDF": "🖨️ Print / PDF",
  "পরে": "Later",
  "💾 ব্যাকআপ": "💾 Backup",
  "ডেটা সুরক্ষা:": "Data Safety:",
  "গত ৭ দিনের মধ্যে ব্যাকআপ নেওয়া হয়নি।": "No backup taken in the last 7 days.",
  "🔙 সুপার অ্যাডমিনে ফিরুন": "🔙 Back to Super Admin",
  "👁️ প্রিভিউ মোড:": "👁️ Preview Mode:",

  // WhatsApp Broadcast Modal
  "📢 ১-ক্লিক WhatsApp বাল্ক ব্রডকাস্ট (সব কাস্টমার)": "📢 1-Click WhatsApp Bulk Broadcast (All Clients)",
  "ডলার রেট বৃদ্ধি, নতুন সার্ভিস (Google/YouTube/TikTok) বা যেকোনো জরুরি নোটিশ একসাথে সবাইকে পাঠান": "Broadcast USD rate updates, Google/YouTube/TikTok services, or notices to all clients",
  "💵 ডলার রেট পরিবর্তন / বৃদ্ধি": "💵 USD Rate Change / Hike",
  "🚀 Google / YouTube / TikTok চালু": "🚀 Google / YouTube / TikTok Live",
  "💰 বকেয়া পরিশোধ রিমাইন্ডার": "💰 Due Payment Reminder",
  "🎉 রিনিউ / বিশেষ অফার": "🎉 Renew / Special Offer",
  "কাস্টমার ফিল্টার": "Customer Filter",
  "সব কাস্টমার (ফোন নম্বর আছে)": "All Customers (with phone)",
  "শুধু Active Client": "Active Clients Only",
  "শুধু বকেয়া থাকা কাস্টমার": "Customers with Dues Only",
  "উল্লেখিত ডলার রেট (৳/$)": "Broadcast USD Rate (৳/$)",
  "ব্রডকাস্ট মেসেজ (সবার নাম/বকেয়া অটো বসবে):": "Broadcast Message (auto-fills name/due/rate):",
  "✅ পাঠানো হয়েছে → পরের জন": "✅ Sent → Next Client",
  "⏭️ স্কিপ": "⏭️ Skip",
  "⏹ থামান": "⏹ Stop",
  "🚀 ১-ক্লিকে সবাইকে পাঠানো শুরু করুন (Auto Queue)": "🚀 Start 1-Click Auto Queue",
  "⚡ একসাথে ট্যাব ওপেন (Batch)": "⚡ Batch Open Tabs",
  "🌐 API দিয়ে অটো পাঠান": "🌐 Auto-Send via API",
  "📋 সব মেসেজ কপি": "📋 Copy All Messages",
  "💾 টেমপ্লেট সেভ": "💾 Save Preset",
  "🖼️ রেট কার্ড PNG": "🖼️ Rate Card PNG",
  "কাস্টমার": "Customer",
  "মোবাইল": "Mobile",
  "বকেয়া": "Due",
  "অবস্থা": "Status",
  "১-ক্লিক": "1-Click",

  // Dashboard
  "📢 রেট / নোটিশ ব্রডকাস্ট": "📢 Rate / Notice Broadcast",
  "📊 প্ল্যাটফর্ম তুলনা ও ROAS (Meta / Google / YouTube / TikTok)": "📊 Platform Comparison & ROAS (Meta / Google / YouTube / TikTok)",
  "বিল": "Bill",
  "লাভ": "Profit",
  "খরচ": "Spend",
  "🗓️ আজকের করণীয়, রিনিউ ও রিটেইনার টাইমলাইন": "🗓️ Daily Action, Expiry & Retainer Timeline",
  "সর্বোচ্চ বিল": "Highest Bill",
  "সর্বোচ্চ লাভ": "Highest Profit",
  "💳 কার্ড ও ওয়ালেট সংক্ষেপ": "💳 Cards & Wallets Summary",
  "⚠️ লো-অ্যাডভান্স ক্লায়েন্ট": "⚠️ Low-Advance Clients",
  "⚡ আজকের দৈনিক বাজেট": "⚡ Add Daily Budget",
  "+ নতুন কাজ": "+ New Campaign",
  "ক্লায়েন্ট ও প্ল্যাটফর্ম": "Client & Platform",
  "ক্যাম্পেইন": "Campaign",
  "বাজেট / ব্যবহৃত $": "Budget / Spent $",
  "দৈনিক বাজেট": "Daily Budget",
  "সময় বাকি": "Remaining",
  "অ্যাকশন": "Action",
  "📞 আজকের ক্লায়েন্ট ফলোআপ (CRM)": "📞 Today's CRM Follow-ups",
  "সব দেখুন": "View All",
  "ক্লায়েন্ট": "Client",
  "স্টেজ / তারিখ": "Stage / Date",
  "🔔 মেয়াদ শেষ — রিনিউ ফলোআপ": "🔔 Expired — Renew Follow-up",
  "ক্লায়েন্ট ও কাজ": "Client & Campaign",
  "মেয়াদ শেষ": "Expired On",

  // Customers & CRM
  "📢 সব কাস্টমারকে WhatsApp মেসেজ": "📢 WhatsApp All Customers",
  "কাস্টমারের নাম *": "Customer Name *",
  "ফোন নম্বর": "Phone Number",
  "পাইপলাইন স্টেজ (CRM)": "Pipeline Stage (CRM)",
  "ফলোআপ তারিখ": "Follow-up Date",
  "মাসিক রিটেইনার ফি (৳)": "Monthly Retainer Fee (৳)",
  "বকেয়া লিমিট (৳) [০ = ডিফল্ট]": "Due Limit (৳) [0 = Default]",
  "কাস্টম ডলার রেট (৳/$) [০ = ডিফল্ট]": "Custom USD Rate (৳/$) [0 = Default]",
  "কাস্টম ডলার রেট (৳/$)": "Custom USD Rate (৳/$)",
  "নোট / রিমার্কস": "Note / Remarks",
  "+ কাস্টমার যুক্ত করুন": "+ Add Customer",
  "📅 রিটেইনার বিল জেনারেট": "📅 Generate Retainer Bills",
  "কাস্টমার *": "Customer *",
  "প্ল্যাটফর্ম *": "Platform *",
  "পেজ / চ্যানেল / ওয়েবসাইট নাম *": "Page / Channel / Website Name *",
  "লিংক / URL": "Link / URL",
  "+ পেজ / চ্যানেল যুক্ত করুন": "+ Add Page / Channel",
  "কাস্টমার তালিকা": "Customer List",
  "সব স্টেজ": "All Stages",
  "কাস্টমার ও স্টেজ": "Customer & Stage",
  "ফোন ও চেকলিস্ট": "Phone & Checklist",
  "অ্যাসেট": "Assets",
  "মোট বিল": "Total Bill",
  "আদায়": "Paid",
  "বকেয়া / অ্যাডভান্স": "Due / Advance",
  "ক্লায়েন্ট পেজ, চ্যানেল ও ট্র্যাকিং তালিকা": "Client Pages, Channels & Tracking Assets",
  "প্ল্যাটফর্ম": "Platform",
  "পেজ / চ্যানেল": "Page / Channel",
  "লিংক": "Link",

  // Quotations
  "📝 কোটেশন / বাজেট প্রোপোজাল মেকার (Quotation)": "📝 Quotation / Budget Proposal Maker",
  "তারিখ": "Date",
  "অ্যাড প্ল্যাটফর্ম *": "Ad Platform *",
  "পুরোনো কাস্টমার (ঐচ্ছিক)": "Existing Customer (Optional)",
  "নতুন ইনকোয়ারি / নিচে নাম লিখুন": "New Inquiry / Type Below",
  "ক্লায়েন্টের নাম *": "Client Name *",
  "মোবাইল নম্বর": "Mobile Number",
  "প্রজেক্ট / ক্যাম্পেইনের বিবরণ *": "Project / Campaign Details *",
  "মেয়াদ (দিন)": "Duration (Days)",
  "আনুমানিক বাজেট ($)": "Estimated Budget ($)",
  "ডলার রেট (৳/$)": "USD Rate (৳/$)",
  "সার্ভিস চার্জ": "Service Charge",
  "কোটেশন মেয়াদ (Valid Until)": "Valid Until Date",
  "নোট / শর্ত": "Notes / Terms",
  "কোটেশন সেভ করুন": "Save Quotation",
  "কোটেশন তালিকা": "Quotations List",
  "প্ল্যাটফর্ম ও কাজ": "Platform & Campaign",
  "বাজেট $ / রেট": "Budget $ / Rate",
  "মোট কোটেশন (৳)": "Total Quote (৳)",
  "স্ট্যাটাস": "Status",

  // Cards & USD
  "💳 নতুন ব্যাংকিং কার্ড যোগ করুন": "💳 Add New Bank Card",
  "+ কার্ড যোগ করুন": "+ Add Card",
  "ডলার ডিপোজিট / কেনা": "USD Deposit / Top-up",
  "কার্ড *": "Card *",
  "জমা ডলার ($)": "Deposit USD ($)",
  "মোট টাকা (৳)": "Total BDT (৳)",
  "মাধ্যম": "Method",
  "নোট": "Note",
  "ডিপোজিট সেভ": "Save Deposit",
  "🔄 কার্ড ট্রান্সফার": "🔄 Card Transfer",
  "থেকে *": "From *",
  "প্রতি *": "To *",
  "ডলার ($)": "USD ($)",
  "ট্রান্সফার": "Transfer",
  "↩️ Meta/Google/TikTok ডলার রিফান্ড": "↩️ Ad Platform USD Refund",
  "রিফান্ড ($)": "Refund ($)",
  "রিফান্ড যোগ": "Add Refund",
  "কার্ড ব্যালেন্স ও গড় রেট": "Card Balances & Avg Rate",
  "কার্ড": "Card",
  "মোট জমা ($)": "Total In ($)",
  "গড় রেট": "Avg Rate",
  "খরচ / আউট ($)": "Spent / Out ($)",
  "অবশিষ্ট ($)": "Remaining ($)",
  "ডিপোজিট হিস্ট্রি": "Deposit History",
  "টাকা (৳)": "Amount (৳)",
  "রেট": "Rate",
  "মাধ্যম ও নোট": "Method & Note",
  "থেকে → প্রতি": "From → To",
  "ডলার": "USD",
  "রিফান্ড": "Refund",

  // Dollar Trading
  "💱 ডলার ট্রেডিং (USD Buy/Sell ও রিসেলার লেজার)": "💱 USD Trading (Buy/Sell & Reseller Ledger)",
  "ধরণ *": "Type *",
  "📤 ডলার বিক্রি (Sell)": "📤 Sell USD",
  "📥 ডলার কেনা (Buy)": "📥 Buy USD",
  "ক্রেতা / সেলার *": "Buyer / Seller *",
  "যুক্ত কার্ড (ঐচ্ছিক)": "Linked Card (Optional)",
  "বাইরের উৎস": "External Source",
  "ডলার ($) *": "USD ($) *",
  "কেনা রেট (৳/$)": "Buy Rate (৳/$)",
  "বিক্রি রেট (৳/$)": "Sell Rate (৳/$)",
  "নগদ গ্রহণ / পরিশোধ (৳)": "Cash Paid / Received (৳)",
  "ওয়ালেট মাধ্যম": "Wallet Method",
  "ট্রেড সেভ করুন": "Save Trade",
  "ট্রেডিং হিস্ট্রি": "Trading History",
  "ধরণ": "Type",
  "পার্টি ও কার্ড": "Party & Card",
  "কেনা/বিক্রি রেট": "Buy/Sell Rate",
  "মোট / নগদ / বাকি": "Total / Paid / Due",

  // Daily Rates
  "📢 নতুন রেট সব কাস্টমারকে জানান (WhatsApp)": "📢 Broadcast New Rate (WhatsApp)",
  "🚀 ১-ক্লিক WhatsApp পাঠান": "🚀 Send 1-Click WhatsApp",
  "বিলিং রেট (৳/$) *": "Billing Rate (৳/$) *",
  "রেট সেভ ও আপডেট": "Save & Update Rate",
  "রেট (৳)": "Rate (৳)",

  // Works / Campaigns
  "পেজ / চ্যানেল / অ্যাসেট (ঐচ্ছিক)": "Page / Channel / Asset (Optional)",
  "ক্যাম্পেইনের নাম *": "Campaign Name *",
  "ক্যাম্পেইন বাজেট ($)": "Campaign Budget ($)",
  "ক্লায়েন্ট বিল রেট (৳/$) *": "Client Bill Rate (৳/$) *",
  "ব্যবহৃত ডলার ($)": "Spent USD ($)",
  "= বাজেট": "= Budget",
  "ক্লায়েন্ট সার্ভিস চার্জ": "Client Service Charge",
  "ব্যাংক কার্ড": "Bank Card",
  "কার্ড নির্বাচন": "Select Card",
  "কেনা রেট (৳/$)": "Cost Rate (৳/$)",
  "VAT / ট্যাক্স / ফি (%)": "VAT / Tax / Fee (%)",
  "অন্যান্য খরচ (৳)": "Other Cost (৳)",
  "দায়িত্বপ্রাপ্ত স্টাফ": "Assigned Staff",
  "স্টাফ কমিশন (%)": "Staff Commission (%)",
  "ক্লায়েন্ট আয় (৳) [ROAS]": "Client Revenue (৳) [ROAS]",
  "ক্রিয়েটিভ / ভিডিও লিংক": "Creative / Video Link",
  "চলমান (Running)": "Running",
  "সম্পন্ন (Completed)": "Completed",
  "পজ (Paused)": "Paused",
  "প্রুফ স্ক্রিনশট (ঐচ্ছিক)": "Proof Screenshot (Optional)",
  "📋 অ্যাড অর্ডার ব্রিফ, কীওয়ার্ড/টার্গেটিং ও পলিসি স্ট্যাটাস (ঐচ্ছিক — ক্লিক করে খুলুন)": "📋 Ad Brief, Keywords/Targeting & Policy Status (Optional — Click to expand)",
  "টার্গেট লোকেশন": "Target Location",
  "বয়স ও জেন্ডার": "Age & Gender",
  "পলিসি / রিজেক্ট স্ট্যাটাস": "Policy / Rejection Status",
  "✅ কোনো সমস্যা নেই": "✅ No Policy Issue",
  "অডিয়েন্স / Keywords / Placements": "Audience / Keywords / Placements",
  "অ্যাড কপি / ক্যাপশন / হেডলাইন": "Ad Copy / Caption / Headline",
  "কাজ সেভ করুন": "Save Campaign",
  "কাজের ইতিহাস ও বিস্তারিত": "Campaign History & Ledger",
  "সব প্ল্যাটফর্ম": "All Platforms",
  "সব কাস্টমার": "All Customers",
  "সব স্ট্যাটাস": "All Status",
  "চলমান": "Running",
  "সম্পন্ন": "Completed",
  "পজ": "Paused",
  "✓ সম্পন্ন": "✓ Completed",
  "⏸ পজ": "⏸ Paused",
  "▶ চলমান": "▶ Running",
  "🗑️ ডিলিট": "🗑️ Delete",
  "কাস্টমার ও পেজ": "Customer & Asset",
  "প্ল্যাটফর্ম, কাজ ও ব্রিফ": "Platform, Campaign & Brief",
  "ব্যবহৃত $": "Spent $",
  "রেজাল্ট / CPR": "Results / CPR",

  // Pixel & Ad Accounts
  "🎯 মাল্টি-প্ল্যাটফর্ম পিক্সেল, ট্যাগ ও অ্যাড অ্যাকাউন্ট হেলথ": "🎯 Multi-Platform Pixel, Tag & Ad Account Health",
  "মান (BDT)": "Value (BDT)",
  "📋 কপি করুন": "📋 Copy Code",
  "🔄 Meta API সিঙ্ক": "🔄 Meta API Sync",
  "নাম *": "Name *",
  "BM / MCC / Center নাম": "BM / MCC / Center Name",
  "থ্রেশহোল্ড ($)": "Threshold ($)",
  "+ অ্যাড অ্যাকাউন্ট যোগ": "+ Add Ad Account",
  "নাম ও BM/MCC": "Name & BM/MCC",
  "থ্রেশহোল্ড / Unpaid": "Threshold / Unpaid",
  "📡 সেভ থাকা সব Pixel ও Tag আইডি": "📡 Saved Client Pixels & Tags",

  // Expenses & Payments
  "💸 অফিস ও অন্যান্য দৈনন্দিন খরচ": "💸 Office & Daily Expenses",
  "বিবরণ *": "Title / Description *",
  "ক্যাটাগরি": "Category",
  "অফিস ভাড়া": "Office Rent",
  "ইউটিলিটি ও ইন্টারনেট": "Utility & Internet",
  "স্টাফ স্যালারি": "Staff Salary",
  "আপ্যায়ন": "Entertainment",
  "সফটওয়্যার": "Software & Tools",
  "অন্যান্য": "Others",
  "ওয়ালেট": "Wallet",
  "পরিমাণ (৳) *": "Amount (৳) *",
  "খরচ সেভ": "Save Expense",
  "খরচের তালিকা": "Expense List",
  "সব ক্যাটাগরি": "All Categories",
  "টাইটেল": "Title",
  "ক্যাটাগরি ও মাধ্যম": "Category & Wallet",
  "পরিমাণ": "Amount",
  "💰 পেমেন্ট গ্রহণ ও মোবাইল ওয়ালেট ক্যাশবুক": "💰 Payments & Mobile Wallet Cashbook",
  "📱 মোবাইল ওয়ালেট যোগ করুন (Rocket, Upay, Mcash...)": "📱 Add Mobile Wallet (Rocket, Upay, Mcash...)",
  "+ ওয়ালেট যোগ": "+ Add Wallet",
  "🏦 ওয়ালেট ব্যালেন্স অ্যাডজাস্ট / উত্তোলন": "🏦 Wallet Balance Adjust / Withdraw",
  "জমা (+)": "Deposit (+)",
  "উত্তোলন (-)": "Withdraw (-)",
  "নোট *": "Note *",
  "ক্যাশবুক আপডেট": "Update Cashbook",
  "কাস্টমার পেমেন্ট যোগ": "Add Customer Payment",
  "প্রাপ্ত টাকা (৳) *": "Received Amount (৳) *",
  "চার্জ (৳)": "Fee / Charge (৳)",
  "পেমেন্ট জমা করুন": "Save Payment",
  "সাম্প্রতিক পেমেন্ট": "Recent Payments",
  "সব ওয়ালেট": "All Wallets",
  "রেফারেন্স / নোট": "Ref / Note",

  // Dues & Broadcast
  "📢 সব কাস্টমারকে ১-ক্লিকে WhatsApp ব্রডকাস্ট": "📢 1-Click WhatsApp Broadcast to All Clients",
  "ডলার রেট বেড়েছে বা নতুন সার্ভিস চালু হয়েছে? এক ক্লিকে সব কাস্টমারের কাছে মেসেজ পাঠান!": "USD rate changed or new services added? Notify all clients in 1 click!",
  "💵 ডলার রেট নোটিশ পাঠান": "💵 Send USD Rate Notice",
  "💰 সবাইকে বকেয়া রিমাইন্ডার": "💰 Send Due Reminder",
  "📑 বকেয়া, লো-অ্যাডভান্স ও WhatsApp রিমাইন্ডার": "📑 Dues, Low-Advance & WhatsApp Reminders",
  "বকেয়া থাকা কাস্টমার": "Customers with Dues",
  "ফোন": "Phone",
  "শেষ রিমাইন্ডার": "Last Reminder",
  "⚠️ লো-অ্যাডভান্স (৳১,০০০-এর কম)": "⚠️ Low-Advance (< ৳1,000)",
  "অবশিষ্ট অ্যাডভান্স": "Remaining Advance",
  "🕒 সাম্প্রতিক ব্রডকাস্ট হিস্ট্রি": "🕒 Recent Broadcast History",
  "সময়": "Time",
  "বিষয় / রেট": "Subject / Rate",
  "প্রাপক": "Recipients",

  // Monthly & Reports
  "📅 মাসিক বা নির্দিষ্ট সময়ের হিসাব": "📅 Monthly / Custom Period Report",
  "এড ও অফিস খরচ": "Ad & Office Cost",
  "নিট লাভ": "Net Profit",
  "মোট আদায়": "Total Paid",
  "প্ল্যাটফর্ম ও ক্যাম্পেইন": "Platform & Campaign",
  "বিল (৳)": "Bill (৳)",
  "প্রকৃত খরচ (৳)": "Actual Cost (৳)",
  "লাভ (৳)": "Profit (৳)",
  "📂 সার্বিক রিপোর্ট, প্ল্যাটফর্ম অ্যানালিটিক্স, কমিশন ও ব্যাকআপ": "📂 Full Reports, Platform Analytics, Commission & Backup",
  "📥 কাস্টমার CSV": "📥 Customers CSV",
  "📥 কাজ CSV": "📥 Campaigns CSV",
  "💾 JSON ব্যাকআপ": "💾 JSON Backup",
  "📂 রিস্টোর": "📂 Restore",
  "⚠️ সব মুছুন": "⚠️ Wipe All",
  "🌐 প্ল্যাটফর্মভিত্তিক রিপোর্ট (Meta, Google, YouTube, TikTok)": "🌐 Platform-wise Report (Meta, Google, YouTube, TikTok)",
  "মোট ডলার ($)": "Total USD ($)",
  "গড় ROAS": "Avg ROAS",
  "👥 স্টাফ / মিডিয়া বায়ার কমিশন রিপোর্ট": "👥 Staff / Media Buyer Commission Report",
  "স্টাফ": "Staff",
  "কাজ": "Campaigns",
  "কমিশন (৳)": "Commission (৳)",
  "📊 কাস্টমারভিত্তিক সামারি": "📊 Customer-wise Summary",
  "নিট প্রফিট (৳)": "Net Profit (৳)",

  // Settings
  "⚙ সেটিংস, এজেন্সি ঠিকানা ও প্রোফাইল": "⚙ Settings, Agency Branding & Profile",
  "👤 প্রোফাইল": "👤 Profile",
  "🏢 এজেন্সি, ঠিকানা, QR ও API": "🏢 Agency, Address, QR & API",
  "🔐 ইউজারনেম": "🔐 Username",
  "🔑 পাসওয়ার্ড": "🔑 Password",
  "🌐 ভাষা": "🌐 Language",
  "↪ লগ আউট": "↪ Logout",
  "প্রোফাইল সেটিংস": "Profile Settings",
  "🗑️ ছবি সরান": "🗑️ Remove Photo",
  "নাম": "Name",
  "ইমেইল": "Email",
  "ছবির লিংক (URL)": "Photo URL",
  "গ্যালারি থেকে আপলোড": "Upload from Device",
  "প্রোফাইল আপডেট": "Update Profile",
  "💾 ব্রাউজার ডেটা স্টোরেজ": "💾 Browser Data Storage",
  "🔒 সেশন ও সিকিউরিটি": "🔒 Session & Security",
  "আপনার অ্যাকাউন্ট থেকে নিরাপদে বের হতে লগ আউট বা স্ক্রিন লক ব্যবহার করুন।": "Use Logout or Screen Lock to safely exit your account.",
  "🔒 স্ক্রিন লক করুন": "🔒 Lock Screen",
  "↪ লগ আউট করুন": "↪ Logout",
  "🏢 এজেন্সি পরিচিতি (নাম, ঠিকানা, QR, Meta ও WhatsApp API)": "🏢 Agency Identity (Name, Address, QR, Meta & WhatsApp API)",
  "এজেন্সির নাম *": "Agency Name *",
  "ট্যাগলাইন": "Tagline",
  "মোবাইল / WhatsApp": "Mobile / WhatsApp",
  "অফিস ইমেইল": "Office Email",
  "অফিসের ঠিকানা (Address)": "Office Address",
  "ডিফল্ট বিল রেট (৳/$)": "Default Billing Rate (৳/$)",
  "ডিফল্ট Meta/Tax VAT (%)": "Default VAT / Tax (%)",
  "মাসিক প্রফিট টার্গেট (৳)": "Monthly Profit Target (৳)",
  "🖼️ এজেন্সি লোগো": "🖼️ Agency Logo",
  "📱 পেমেন্ট QR": "📱 Payment QR",
  "সরান": "Remove",
  "অথবা লিংক": "Or Image URL",
  "ইনভয়েস স্বাক্ষর": "Invoice Signature",
  "ইনভয়েস শর্তাবলি": "Invoice Terms",
  "পেমেন্ট গ্রহণের বিবরণ": "Payment Details (bKash/Bank)",
  "Meta API Access Token (ঐচ্ছিক)": "Meta API Access Token (Optional)",
  "WhatsApp Gateway API URL (ঐচ্ছিক অটো-সেন্ড)": "WhatsApp Gateway API URL (Optional)",
  "WhatsApp বকেয়া রিমাইন্ডার টেমপ্লেট": "WhatsApp Due Reminder Template",
  "📢 সেভ করা কাস্টম WhatsApp ব্রডকাস্ট টেমপ্লেট (ঐচ্ছিক — খালি রাখলে ডিফল্ট)": "📢 Saved Custom WhatsApp Broadcast Presets (Optional — blank = default)",
  "💵 ডলার রেট পরিবর্তন টেমপ্লেট": "💵 USD Rate Change Template",
  "🚀 Google / YouTube / TikTok চালু টেমপ্লেট": "🚀 Google / YouTube / TikTok Launch Template",
  "💰 বকেয়া রিমাইন্ডার ব্রডকাস্ট টেমপ্লেট": "💰 Due Broadcast Template",
  "🎉 রিনিউ / বিশেষ অফার টেমপ্লেট": "🎉 Renew / Special Offer Template",
  "এজেন্সি তথ্য সেভ": "Save Agency Settings",
  "ইউজারনেম পরিবর্তন": "Change Username",
  "বর্তমান পাসওয়ার্ড": "Current Password",
  "নতুন ইউজারনেম": "New Username",
  "সেভ": "Save",
  "পাসওয়ার্ড পরিবর্তন": "Change Password",
  "নতুন পাসওয়ার্ড": "New Password",
  "আবার লিখুন": "Confirm Password",
  "আপডেট": "Update",
  "ভাষা সেটিংস": "Language Settings",
  "ভাষা": "Language",
  "পরিবর্তন করুন": "Apply Language",

  // Admin Panel, Chat, Training
  "🛡 অ্যাডমিন সিকিউরিটি, শর্তাবলি, অর্ডার ইনবক্স ও ইউজার": "🛡 Admin Security, Rules, Orders & Users",
  "👥 ইউজার ও প্ল্যান": "👥 Users & Plans",
  "🛡️ শর্তাবলি ও নোটিশ": "🛡️ Rules & Global Notice",
  "📩 অর্ডার ও হেল্প ইনবক্স": "📩 Orders & Help Inbox",
  "🗑️ রিসাইকেল বিন": "🗑️ Recycle Bin",
  "☁️ মাস্টার ব্যাকআপ ও সিঙ্ক": "☁️ Master Backup & Sync",
  "📋 লগ": "📋 Logs",
  "➕ নতুন স্টাফ / অ্যাডমিন / ইউজার (ক্যাম্পেইন আনলিমিটেড)": "➕ Create Staff / Admin / User (Unlimited Campaigns)",
  "মোবাইল / ইমেইল": "Mobile / Email",
  "পাসওয়ার্ড (৬+) *": "Password (6+) *",
  "রোল": "Role",
  "প্ল্যান": "Plan",
  "মেয়াদ শেষ": "Expiry Date",
  "স্টাফের অনুমতি:": "Staff Permissions:",
  "ডিলিট": "Delete",
  "এডিট": "Edit",
  "পেমেন্ট ও বকেয়া": "Payments & Dues",
  "অফিস খরচ": "Office Expenses",
  "মোট ইউজার": "Total Users",
  "অ্যাডমিন / স্টাফ": "Admin / Staff",
  "সাধারণ ইউজার": "Standard Users",
  "ব্লকড / মেয়াদোত্তীর্ণ": "Suspended / Expired",
  "📢 গ্লোবাল নোটিশ ও সিকিউরিটি কন্ডিশন": "📢 Global Notice & Security Rules",
  "📢 গ্লোবাল নোটিশ (খালি রাখলে বন্ধ)": "📢 Global Notice Banner (blank = hidden)",
  "মিনিমাম বিলিং রেট (৳/$)": "Min Billing Rate (৳/$)",
  "ডিফল্ট বকেয়া লিমিট (৳)": "Default Due Limit (৳)",
  "মাস্টার সিকিউরিটি PIN": "Master Security PIN",
  "২৪ ঘণ্টার পর Staff পুরোনো কাজ/পেমেন্ট এডিট করতে পারবে না": "Lock Staff from editing work/payments older than 24h",
  "লসে Staff কাজ সেভ করতে পারবে না": "Block Staff from saving campaigns at a loss",
  "Staff পেমেন্ট/খরচ দিলে Admin অ্যাপ্রুভাল লাগবে": "Require Admin approval for Staff payments/expenses",
  "✓ শর্তাবলি ও নোটিশ সেভ করুন": "✓ Save Rules & Notice",
  "✅ স্টাফদের পেন্ডিং পেমেন্ট ও খরচ অ্যাপ্রুভাল কিউ": "✅ Staff Pending Approval Queue",
  "🛒 ক্লায়েন্ট পোর্টাল থেকে আসা নতুন অর্ডার / রিনিউ রিকোয়েস্ট": "🛒 Client Portal Orders & Renew Requests",
  "🔄 অর্ডার রিফ্রেশ": "🔄 Refresh Orders",
  "📩 সাইন-ইন পেজ হেল্প ইনবক্স": "📩 Login Page Help Inbox",
  "সব মেসেজ মুছুন": "Clear All Messages",
  "খালি করুন": "Empty Trash",
  "💾 সিস্টেম স্টোরেজ": "💾 System Storage",
  "👑 মাস্টার ফুল ব্যাকআপ": "👑 Master Full Backup",
  "👑 ডাউনলোড": "👑 Download Master",
  "📥 রিস্টোর": "📥 Restore",
  "☁️ ক্লাউড সিঙ্ক (Firebase RTDB)": "☁️ Cloud Sync (Firebase RTDB)",
  "Secret (ঐচ্ছিক)": "Secret (Optional)",
  "প্রতি ৩০ সেকেন্ডে ও সেভে অটো মার্জ সিঙ্ক": "Auto merge-sync every 30s & on save",
  "💾 সেভ": "💾 Save",
  "📋 অ্যাক্টিভিটি লগ": "📋 Activity Logs",
  "পরিষ্কার করুন": "Clear Logs",
  "💬 অনলাইন টিম চ্যাট (ছবি, স্ক্রিনশট ও ফাইল শেয়ারিং)": "💬 Live Team Chat (Photos, Screenshots & Files)",
  "টিম চ্যাট ইনবক্স": "Team Chat Inbox",
  "ক্লায়েন্টের পেমেন্ট স্ক্রিনশট, অ্যাড ক্রিয়েটিভ বা PDF ফাইল টিমের সাথে শেয়ার করুন।": "Share payment proofs, ad creatives or PDF files with your team.",
  "অটো আপডেট চালু": "Live Sync Enabled",
  "সব চ্যাট পরিষ্কার করুন": "Clear All Chat",
  "ছবি অটো কমপ্রেস হয়ে যাবে": "Images auto-compress cleanly",
  "পাঠান ➤": "Send ➤",
  "🎓 ব্যবহার নির্দেশিকা (Training Hub)": "🎓 User Guide (Training Hub)",
  "১. এজেন্সি ও প্রথম সেটআপ": "1. Agency & Initial Setup",
  "২. মাল্টি-প্ল্যাটফর্ম অ্যাডস (Meta, Google, YouTube, TikTok)": "2. Multi-Platform Ads (Meta, Google, YouTube, TikTok)",
  "৩. ১-ক্লিক WhatsApp ব্রডকাস্ট (ডলার রেট আপডেট)": "3. 1-Click WhatsApp Broadcast (Rate Updates)",
  "৪. অ্যাড ব্রিফ, রেজাল্ট ও রিপোর্ট PNG": "4. Ad Brief, Results & PNG Reports",
  "৫. কার্ড, ওয়ালেট ও ডলার ট্রেডিং": "5. Cards, Wallets & USD Trading",
  "৬. টিম চ্যাট (ছবি/ফাইল) ও শর্তাবলি": "6. Team Chat & Security Rules",

  // Other Modals
  "🔍 দ্রুত খুঁজুন": "🔍 Quick Search",
  "⚡ দ্রুত নতুন কাস্টমার যোগ": "⚡ Quick Add Customer",
  "+ সেভ ও নির্বাচন করুন": "+ Save & Select",
  "⚡ দ্রুত পেজ / চ্যানেল / অ্যাড অ্যাসেট যোগ": "⚡ Quick Add Page / Channel / Asset",
  "🖼 রিপোর্ট PNG": "🖼️ Report PNG",
  "🖼️ রিপোর্ট PNG": "🖼️ Report PNG",
  "🖼️ রিসিপ্ট PNG": "🖼️ Receipt PNG",
  "🖼️ ছবি (PNG)": "🖼️ Image (PNG)",
  "💬 ১-ক্লিক ক্লায়েন্ট মেসেজ টেমপ্লেট হাব": "💬 1-Click Client Message Templates",
  "⚡ চলমান ক্যাম্পেইনে আজকের দৈনিক বাজেট যোগ": "⚡ Add Today's Daily Budget to Running Ads",
  "✓ নির্বাচিতগুলোতে আজকের খরচ যোগ করুন": "✓ Apply Daily Spend to Selected",
  "🆘 অ্যাডমিন / সুপার অ্যাডমিন সহায়তা": "🆘 Admin / Super Admin Support",
  "📩 মেসেজ পাঠান": "📩 Send Message",
  "যাচাই ও সাবমিট করুন": "Verify & Submit",
  "ক্লায়েন্ট প্রোফাইল": "Client Profile",
  "💳 কার্ড স্টেটমেন্ট": "💳 Card Statement",
  "✏️ ইউজার / স্টাফ এডিট ও প্ল্যান": "✏️ Edit User / Staff & Plan",
  "✏️ কাস্টমার ও অনবোর্ডিং এডিট": "✏️ Edit Customer & Onboarding",
  "✏️ পেজ / চ্যানেল / অ্যাড অ্যাসেট এডিট": "✏️ Edit Page / Channel / Asset",
  "✏️ Ad Account এডিট": "✏️ Edit Ad Account",
  "✏️ ক্যাম্পেইন, প্ল্যাটফর্ম, ব্রিফ ও প্রুফ এডিট": "✏️ Edit Campaign, Platform & Brief",
  "✏️ পেমেন্ট এডিট": "✏️ Edit Payment",
  "✏️ অফিস খরচ এডিট": "✏️ Edit Expense",
  "✏️ ডলার ডিপোজিট এডিট": "✏️ Edit Deposit",
  "✏️ দৈনিক ডলার রেট এডিট": "✏️ Edit Daily USD Rate",

  // Placeholders & Tooltips
  "ইউজারনেম, ইমেইল বা মোবাইল নম্বর": "Username, email or mobile",
  "পাসওয়ার্ড লিখুন": "Enter password",
  "নাম লিখুন": "Enter name",
  "পূর্ণ নাম": "Full name",
  "🔍 নাম বা মোবাইল...": "🔍 Name or mobile...",
  "🔍 নাম বা ফোন...": "🔍 Name or phone...",
  "🔍 নাম বা প্রজেক্ট খুঁজুন...": "🔍 Search client or project...",
  "🔍 কাজ বা ক্লায়েন্ট...": "🔍 Campaign or client...",
  "🔍 খরচ খুঁজুন...": "🔍 Search expense...",
  "🔍 নাম বা TrxID...": "🔍 Name or TrxID...",
  "🔍 সাহায্য খুঁজুন...": "🔍 Search help...",
  "নাম, মোবাইল, প্ল্যাটফর্ম, ক্যাম্পেইন বা Ad ID লিখুন...": "Type name, phone, platform, campaign or Ad ID...",
  "কার্ডের নাম (যেমন: EBL Visa)": "Card Name (e.g. EBL Visa)",
  "কার্ড লিমিট ($) [ঐচ্ছিক]": "Card Limit ($) [Optional]",
  "VIP কাস্টমারের জন্য": "Optional VIP rate",
  "০ = ডিফল্ট": "0 = Default",
  "যেমন: Rocket / Upay / Mcash": "e.g. Rocket / Upay / Mcash",
  "যেমন: ব্যাংক চার্জ বৃদ্ধির কারণে": "e.g. Bank rate hike",
  "যেমন: Eid Search & TikTok Ad": "e.g. Eid Search & TikTok Ad",
  "যেমন: ঢাকা, চট্টগ্রাম, সারা দেশ": "e.g. Dhaka, Nationwide",
  "মেসেজ বা ছবির ক্যাপশন লিখুন...": "Type message or image caption...",

  // v80 Upgrades (Discount/Tax, Passport, Bank Fee, CSV Import, Day-End Closing, Risk Log, Payroll, Portal TrxID)
  "লো-অ্যাডভান্স অ্যালার্ট সীমা (৳)": "Low-Advance Alert Limit (৳)",
  "ডিফল্ট ১০০০৳": "Default 1000৳",
  "💳 নতুন ব্যাংকিং কার্ড ও পাসপোর্ট এনডোর্সমেন্ট যোগ": "💳 Add Bank Card & Passport Endorsement",
  "মাসিক লিমিট ($) [ঐচ্ছিক]": "Monthly Limit ($) [Optional]",
  "পাসপোর্ট হোল্ডার / নং (ঐচ্ছিক)": "Passport Holder / No (Optional)",
  "পাসপোর্ট কোটা ($)": "Passport Quota ($)",
  "ব্যাংক চার্জ / মার্কআপ ফি (৳)": "Bank FX / Markup Fee (৳)",
  "ক্লায়েন্ট ডিসকাউন্ট (৳)": "Client Discount (৳)",
  "ডিসকাউন্ট (৳)": "Discount (৳)",
  "ক্লায়েন্ট VAT / ট্যাক্স (%)": "Client VAT / Tax (%)",
  "📥 Ads Manager CSV ইমপোর্ট": "📥 Import Ads Manager CSV",
  "📥 Ads Manager CSV অটো-ইমপোর্ট (Meta / Google / TikTok)": "📥 Ads Manager CSV Auto-Import (Meta / Google / TikTok)",
  "Meta বা Google Ads Manager থেকে এক্সপোর্ট করা CSV ফাইল আপলোড করে এক ক্লিকে কাজ যোগ করুন": "Upload exported CSV from Meta or Google Ads Manager to bulk-import campaigns",
  "ডিফল্ট কাস্টমার (ম্যাচ না পেলে)": "Default Customer (if unmatched)",
  "বিল রেট (৳/$)": "Billing Rate (৳/$)",
  "ব্যাংক কার্ড (ঐচ্ছিক)": "Bank Card (Optional)",
  "ডিফল্ট তারিখ": "Default Date",
  "✓ নির্বাচিত ক্যাম্পেইন ইমপোর্ট করুন": "✓ Import Selected Campaigns",
  "🧾 আজকের ডে-এন্ড ক্লোজিং": "🧾 Today's Day-End Closing",
  "🧾 দৈনিক ক্যাশ ও ডে-এন্ড ক্লোজিং (Day-End Closing)": "🧾 Daily Cash & Day-End Closing",
  "নির্বাচিত দিনের মোট বিল, এড খরচ, অফিস খরচ, ওয়ালেট জমা ও নিট লাভের পূর্ণাঙ্গ হিসাব": "Full daily summary of billing, ad cost, office expenses, wallet flow & net profit",
  "তারিখ নির্বাচন": "Select Date",
  "ক্লোজিং নোট (ঐচ্ছিক)": "Closing Note (Optional)",
  "যেমন: আজকের ক্যাশ ও বিকাশ মিলিয়ে নেওয়া হয়েছে": "e.g. Cash & bKash reconciled",
  "💾 ক্লোজিং সেভ করুন": "💾 Save Closing",
  "📲 WhatsApp সামারি": "📲 WhatsApp Summary",
  "ওয়ালেট / মাধ্যম": "Wallet / Method",
  "পেমেন্ট জমা (+)": "Payments In (+)",
  "খরচ ও ডিপোজিট (-)": "Expenses & Deposits (-)",
  "দিন শেষে নিট প্রবাহ": "Net Daily Flow",
  "👥 স্টাফ / মিডিয়া বায়ার কমিশন ও পেরোল রিপোর্ট": "👥 Staff Commission & Payroll Settlement Report",
  "অর্জিত কমিশন": "Earned Commission",
  "পেইড স্যালারি/কমিশন": "Paid Salary/Comm",
  "প্রদেয় ব্যালেন্স": "Payable Balance",
  "🧾 সংরক্ষিত ডে-এন্ড ক্লোজিং ইতিহাস": "🧾 Saved Day-End Closing History",
  "মোট খরচ (৳)": "Total Cost (৳)",
  "আদায় (৳)": "Paid (৳)",
  "🛡️ অ্যাকাউন্ট / পেজ রেস্ট্রিকশন, কার্ড ডিক্লাইন ও আপিল রিস্ক লগ": "🛡️ Account / Page Restriction, Card Decline & Appeal Risk Log",
  "অ্যাকাউন্ট / পেজ / কার্ড নাম *": "Account / Page / Card Name *",
  "যেমন: ABC Page / EBL Visa": "e.g. ABC Page / EBL Visa",
  "ইস্যুর ধরণ": "Issue Type",
  "আপিল স্ট্যাটাস": "Appeal Status",
  "নোট ও সমাধানের পদক্ষেপ": "Notes & Resolution Steps",
  "বিস্তারিত বিবরণ বা আপিল নম্বর": "Details or Appeal Reference",
  "+ রিস্ক লগ যোগ করুন": "+ Add Risk Log",
  "প্ল্যাটফর্ম ও কাস্টমার": "Platform & Customer",
  "অ্যাসেট / কার্ড": "Asset / Card",
  "ইস্যু ও নোট": "Issue & Note",
  "💳 ক্লায়েন্ট পোর্টাল পেমেন্ট ও TrxID যাচাই": "💳 Client Portal Payments & TrxID Verification",
  "🔄 রিফ্রেশ": "🔄 Refresh",
  "পরিমাণ ও মাধ্যম": "Amount & Method",
  "TrxID ও নোট": "TrxID & Note",

  // v80.1 Upgrades (Monthly Statement, Supplier Ledger, Package Renewal, Creative Vault, Card Partner Profit Share)
  "📑 মান্থলি ক্লায়েন্ট স্টেটমেন্ট (Monthly Statement)": "📑 Monthly Client Statement",
  "আপডেট": "Update",
  "ধরণ": "Type",
  "বিবরণ / ক্যাম্পেইন": "Description / Campaign",
  "বিল (+)": "Bill (+)",
  "জমা (-)": "Paid (-)",
  "ব্যালেন্স (৳)": "Balance (৳)",
  "📲 WhatsApp-এ পাঠান": "📲 Send via WhatsApp",
  "🖼️ PNG ডাউনলোড": "🖼️ Download PNG",
  "🎨 ক্রিয়েটিভ ও মিডিয়া লাইব্রেরি (Creative Vault)": "🎨 Creative & Media Library Vault",
  "কাস্টমারের অনুমোদিত ব্যানার, ভিডিও লিংক ও অ্যাড কপি সেভ করুন এবং ১ ক্লিকে ক্যাম্পেইনে বসান": "Save approved client banners, media links & ad copy and pre-fill campaigns in 1 click",
  "ক্রিয়েটিভ টাইটেল *": "Creative Title *",
  "যেমন: Eid Offer Reel V2": "e.g. Eid Offer Reel V2",
  "ভিডিও / পোস্ট / ড্রাইভ লিংক": "Video / Post / Drive Link",
  "প্রিভিউ থাম্বনেইল (ঐচ্ছিক)": "Preview Thumbnail (Optional)",
  "সাইজ, ফরম্যাট বা নির্দেশনা": "Size, format or notes",
  "ক্যাম্পেইনের জন্য প্রস্তুত অ্যাড ক্যাপশন...": "Ready-to-run ad caption or headline...",
  "+ লাইব্রেরিতে সেভ করুন": "+ Save to Vault",
  "সব কাস্টমার": "All Customers",
  "🔍 টাইটেল বা ক্যাপশন...": "🔍 Title or caption...",
  "🎨 ক্রিয়েটিভ ও মিডিয়া ভল্ট": "🎨 Creative & Media Vault",
  "প্যাকেজের নাম (ঐচ্ছিক)": "Package Name (Optional)",
  "যেমন: Monthly $200 Package": "e.g. Monthly $200 Package",
  "প্যাকেজ রিনিউয়াল তারিখ": "Package Renewal Date",
  "📄 ক্লায়েন্ট মান্থলি স্টেটমেন্ট": "📄 Monthly Client Statement",
  "💳 নতুন ব্যাংকিং কার্ড, পাসপোর্ট ও পার্টনার শেয়ারিং যোগ": "💳 Add Bank Card, Passport & Partner Sharing",
  "পার্টনার / কার্ড ওনার (ঐচ্ছিক)": "Partner / Card Owner (Optional)",
  "পার্টনার শেয়ার (%)": "Partner Share (%)",
  "🤝 কার্ড ওনার / পার্টনার প্রফিট শেয়ারিং": "🤝 Card Owner / Partner Profit Sharing",
  "কার্ড ও পার্টনার": "Card & Partner",
  "কার্ড স্পেন্ড ($)": "Card Spend ($)",
  "কার্ড নিট লাভ (৳)": "Card Net Profit (৳)",
  "শেয়ার হার (%)": "Share Rate (%)",
  "পার্টনার শেয়ার (৳)": "Partner Share (৳)",
  "পেইড (৳)": "Paid (৳)",
  "প্রদেয় (৳)": "Payable (৳)",
  "🤝 সাপ্লায়ার ও রিসেলার লেজার সামারি (Supplier / Party Ledger)": "🤝 Supplier & Reseller Ledger Summary",
  "সাপ্লায়ার / পার্টি": "Supplier / Party",
  "মোট কেনা ($)": "Total Bought ($)",
  "মোট বিক্রি ($)": "Total Sold ($)",
  "পরিশোধ / আদায় (৳)": "Paid / Collected (৳)",
  "বকেয়া (দেনা / পাওনা)": "Balance (Payable / Receivable)",
  "কার্ড পার্টনার শেয়ার": "Card Partner Share",

  // v81 Upgrades (21 Features)
  "প্রাইভেসি ব্লার মোড (লাভ/খরচ লুকান)": "Privacy Blur Mode (Hide Profit/Cost)",
  "দ্রুত USD ↔ BDT ও VAT ক্যালকুলেটর": "Quick USD ↔ BDT & VAT Converter",
  "মিডিয়া বায়ার টাস্ক বোর্ড": "Media Buyer Task Board",
  "🌙 ওনার ব্রিফ": "🌙 Owner Brief",
  "🌙 ওনার নাইটলি ব্রিফ": "🌙 Owner Nightly Brief",
  "✅ টাস্ক": "✅ Tasks",
  "✅ টাস্ক বোর্ড": "✅ Task Board",
  "📜 সার্ভিস এগ্রিমেন্ট": "📜 Service Agreement",
  "💤 ইন-অ্যাক্টিভ / Win-Back ক্লায়েন্ট তালিকা (৩০+ দিন কোনো অ্যাড নেই)": "💤 Inactive / Win-Back Clients (30+ Days No Ads)",
  "শেষ ক্যাম্পেইন": "Last Campaign",
  "নিষ্ক্রিয় সময়": "Inactive Duration",
  "🧮 Break-Even ROAS ক্যালকুলেটর": "🧮 Break-Even ROAS Calculator",
  "🧮 ROAS ক্যালকুলেটর": "🧮 ROAS Calculator",
  "🎚️ টায়ার্ড / ভলিউম ভিত্তিক ডলার রেট স্ল্যাব (Tiered USD Rate Slabs)": "🎚️ Tiered / Volume-Based USD Rate Slabs",
  "বাজেট বা ডলারের পরিমাণ অনুযায়ী অটো রেট বসবে (ক্লায়েন্টের কাস্টম VIP রেট না থাকলে প্রযোজ্য)": "Auto-applies slab rate by USD budget unless client has VIP custom rate",
  "সর্বনিম্ন ডলার ($)": "Min USD ($)",
  "সর্বোচ্চ ডলার ($) [০=সীমাহীন]": "Max USD ($) [0 = Unlimited]",
  "স্ল্যাব রেট (৳/$) *": "Slab Rate (৳/$) *",
  "+ স্ল্যাব যোগ": "+ Add Slab",
  "ডলার সীমা ($)": "USD Range ($)",
  "স্ল্যাব রেট (৳/$)": "Slab Rate (৳/$)",
  "💳 নতুন ব্যাংকিং কার্ড, পাসপোর্ট, বিল ডেট ও পার্টনার শেয়ারিং": "💳 Add Bank Card, Passport, Billing Date & Partner Sharing",
  "বিল ডেট (১-৩১)": "Due Day (1-31)",
  "১৫% BD VAT": "15% BD VAT",
  "১৫% BD VAT যোগ/বাদ দিন": "Toggle 15% BD VAT",
  "আজ যাদের রিমাইন্ডার পাঠানো হয়েছে তাদের বাদ দিন (Duplicate Guard)": "Skip clients already reminded today (Duplicate Guard)",
  "🔁 মাসিক রিকারিং অফিস খরচ (Auto Bill Reminder)": "🔁 Monthly Recurring Office Bills (Auto Reminder)",
  "বিলের নাম *": "Bill Name *",
  "টাকা (৳) *": "Amount (৳) *",
  "মাসের তারিখ (১-৩১)": "Day of Month (1-31)",
  "+ রিকারিং বিল যোগ": "+ Add Recurring Bill",
  "বিলের নাম": "Bill Name",
  "ক্যাটাগরি ও ওয়ালেট": "Category & Wallet",
  "মাসের তারিখ": "Due Day",
  "চলতি মাস": "This Month",
  "🔄 ইন্টারনাল ওয়ালেট-টু-ওয়ালেট ট্রান্সফার": "🔄 Internal Wallet-to-Wallet Transfer",
  "কোন ওয়ালেট থেকে *": "From Wallet *",
  "কোন ওয়ালেটে *": "To Wallet *",
  "ক্যাশআউট/ট্রান্সফার ফি (৳)": "Cashout / Transfer Fee (৳)",
  "🔄 ট্রান্সফার করুন": "🔄 Transfer Now",
  "থেকে → প্রতি": "From → To",
  "টাকা (ফি)": "Amount (Fee)",
  "📂 সার্বিক রিপোর্ট, লাভ-ক্ষতি (P&L), কমিশন ও ব্যাকআপ": "📂 Reports, P&L Accounting Pack, Commission & Backup",
  "📥 P&L CSV": "📥 P&L CSV",
  "📊 পূর্ণাঙ্গ লাভ-ক্ষতি বিবরণী (P&L Accounting Pack)": "📊 Full Profit & Loss Statement (P&L Accounting Pack)",
  "গ্রস বিলিং, ভ্যাট, এড খরচ, ব্যাংক FX চার্জ, অফিস খরচ, কমিশন ও নিট লাভের পূর্ণাঙ্গ হিসাব": "Complete accounting summary of Gross Billing, VAT, Ad Spend, Bank FX Fees, Expenses, Commissions & Net Profit",
  "শুরু": "From",
  "শেষ": "To",
  "সব সময়": "All Time",
  "📜 ক্লায়েন্ট সার্ভিস এগ্রিমেন্ট ও চুক্তি জেনারেটর": "📜 Client Service Agreement & Contract Generator",
  "কাস্টমার নির্বাচন *": "Select Customer *",
  "মাসিক রিটেইনার / ফি (৳)": "Monthly Retainer / Fee (৳)",
  "সম্মত ডলার রেট (৳/$)": "Agreed USD Rate (৳/$)",
  "চুক্তির মেয়াদ": "Contract Duration",
  "শর্তাবলি (এডিট করতে পারেন)": "Terms & Conditions (Editable)",
  "📲 WhatsApp শেয়ার": "📲 Share on WhatsApp",
  "🤝 সাপ্লায়ার / পার্টি ট্রেডিং স্টেটমেন্ট": "🤝 Supplier / Party Trading Statement",
  "জমা/পরিশোধ (৳)": "Paid / Settled (৳)",
  "বাকি (৳)": "Balance Due (৳)",
  "🧮 Break-Even ROAS ও অ্যাড বাজেট ক্যালকুলেটর": "🧮 Break-Even ROAS & Ad Budget Calculator",
  "ই-কমার্স ও এফ-কমার্স ক্লায়েন্টদের জন্য লাভজনক ROAS, সর্বোচ্চ CPA ও দৈনিক বাজেট হিসাব করুন": "Calculate Break-Even ROAS, Max CPA & daily ad budget for e-commerce clients",
  "পণ্যের বিক্রয়মূল্য (৳)": "Selling Price (৳)",
  "কেনা / উৎপাদন খরচ (৳)": "Product / COGS Cost (৳)",
  "ডেলিভারি, প্যাকিং ও রিটার্ন চার্জ (৳)": "Delivery, Packaging & Return Cost (৳)",
  "দৈনিক নিট লাভের লক্ষ্য (Target Profit ৳)": "Daily Target Net Profit (৳)",
  "📋 সামারি কপি": "📋 Copy Summary",
  "⚡ কোটেশনে বাজেট নিন": "⚡ Apply Budget to Quote",
  "💱 দ্রুত USD ↔ BDT ও VAT/ফি কনভার্টার": "💱 Quick USD ↔ BDT & VAT/Fee Converter",
  "ডলার ($ USD)": "USD ($)",
  "টাকা (৳ BDT Total)": "BDT Total (৳)",
  "BD VAT / ব্যাংক ফি (%)": "BD VAT / Bank Fee (%)",
  "অতিরিক্ত সার্ভিস চার্জ (৳)": "Extra Service Fee (৳)",
  "📋 কপি": "📋 Copy",
  "✅ মিডিয়া বায়ার ডেইলি টাস্ক ও রিমাইন্ডার বোর্ড": "✅ Media Buyer Daily Task & Reminder Board",
  "Pixel সেটআপ, ক্রিয়েটিভ আপলোড, অ্যাড চেক বা ক্লায়েন্ট কলের তালিকা ম্যানেজ করুন": "Manage Pixel setups, creative uploads, campaign audits & client calls",
  "টাস্কের বিবরণ *": "Task Description *",
  "কাস্টমার (ঐচ্ছিক)": "Customer (Optional)",
  "দায়িত্বপ্রাপ্ত": "Assignee",
  "অগ্রাধিকার (Priority)": "Priority",
  "+ টাস্ক যোগ করুন": "+ Add Task",
  "অসম্পূর্ণ টাস্ক": "Pending Tasks",
  "সব টাস্ক": "All Tasks",
  "সম্পন্ন টাস্ক": "Completed Tasks",
  "↪ লগ আউট করুন": "↪ Logout",
  "🔒 স্ক্রিন লক করুন": "🔒 Lock Screen",
  "🔒 সেশন ও সিকিউরিটি": "🔒 Session & Security",

  // Complete UI Coverage (Forms, Modals & Placeholders)
  "ক্লায়েন্ট পোর্টাল লোড হচ্ছে...": "Loading Client Portal...",
  "কাস্টমার: --": "Customer: --",
  "📸 Ads Manager প্রুফ স্ক্রিনশট:": "📸 Ads Manager Proof Screenshot:",
  "⚡ দ্রুত পেজ / চ্যানেল / অ্যাসেট যোগ": "⚡ Quick Add Page / Channel / Asset",
  "পেজ / চ্যানেল / ওয়েবসাইটের নাম *": "Page / Channel / Website Name *",
  "মানি রিসিপ্ট": "Money Receipt",
  "ব্যালেন্স: ৳0": "Balance: ৳0",
  "যেসব চলমান ক্যাম্পেইনে আজকের দৈনিক বাজেট ($) যোগ করতে চান সেগুলো টিক দিয়ে নিশ্চিত করুন:": "Select active campaigns to log today's daily budget ($):",
  "সরাসরি WhatsApp করুন:": "Direct WhatsApp:",
  "কাকে মেসেজ পাঠাবেন?": "Send Message To?",
  "উভয়কেই": "Both",
  "ইউজারনেম বা মোবাইল *": "Username or Mobile *",
  "বিষয়": "Topic",
  "পাসওয়ার্ড ভুলে গেছি": "Forgot Password",
  "অ্যাকাউন্ট আনব্লক": "Unblock Account",
  "নতুন অ্যাক্সেস চাই": "Request New Access",
  "বিস্তারিত বার্তা *": "Message Details *",
  "রেজিস্টার্ড ইমেইল": "Registered Email",
  "রেজিস্টার্ড মোবাইল": "Registered Mobile",
  "নতুন পাসওয়ার্ড (৬+ অক্ষর)": "New Password (6+ chars)",
  "প্রফেশনাল ইনভয়েস": "Professional Invoice",
  "ইনভয়েস নং: #INV-001": "Invoice No: #INV-001",
  "ফোন: --": "Phone: --",
  "কাজের বিবরণ": "Campaign Details",
  "ডলার / রেট ও চার্জ": "USD / Rate & Fees",
  "জমা (৳)": "Paid (৳)",
  "ধন্যবাদ! আপনার ব্যবসার সফলতা কামনা করছি।": "Thank you! Wishing your business great success.",
  "খরচ (-)": "Spend (-)",
  "ব্যালেন্স ($)": "Balance ($)",
  "মেয়াদ শেষের তারিখ": "Expiry Date",
  "নতুন পাসওয়ার্ড (খালি রাখলে বদলাবে না)": "New Password (leave blank to keep)",
  "স্টাফ পারমিশন:": "Staff Permissions:",
  "পাইপলাইন স্টেজ": "Pipeline Stage",
  "রিটেইনার ফি (৳)": "Retainer Fee (৳)",
  "বকেয়া লিমিট (৳)": "Due Limit (৳)",
  "অনবোর্ডিং চেকলিস্ট:": "Onboarding Checklist:",
  "BM / MCC নাম": "BM / MCC Name",
  "যুক্ত কার্ড": "Linked Card",
  "পেজ / চ্যানেল / অ্যাসেট": "Page / Channel / Asset",
  "বাজেট ($)": "Budget ($)",
  "বিলিং রেট (৳/$)": "Billing Rate (৳/$)",
  "ভ্যাট / ফি (%)": "VAT / Fee (%)",
  "কমিশন (%)": "Commission (%)",
  "ক্রিয়েটিভ লিংক": "Creative Link",
  "প্রুফ স্ক্রিনশট আপলোড": "Upload Proof Screenshot",
  "অডিয়েন্স / কীওয়ার্ড / চ্যানেল": "Audience / Keywords / Channels",
  "পরিমাণ (৳)": "Amount (৳)",
  "খরচ ($)": "Cost ($)",
  "মোট (৳)": "Total (৳)",
  "স্বাগতম!": "Welcome!",
  "💵 আজকের রেট: ৳125": "💵 Today's Rate: ৳125",
  "🧾 ডে-এন্ড ক্লোজিং": "🧾 Day-End Closing",
  "গড় প্রফিট মার্জিন: 0%": "Avg Profit Margin: 0%",
  "আনুমানিক মোট বিল: ৳0.00": "Estimated Total Bill: ৳0.00",
  "💳 ডলার ও ব্যাংক কার্ড আর্থিক হিসাব": "💳 USD & Bank Card Financials",
  "কার্ড ব্যালেন্স, গড় রেট ও পাসপোর্ট কোটা": "Card Balance, Avg Rate & Passport Quota",
  "কার্ড ও পাসপোর্ট": "Card & Passport",
  "মোট টাকা ও ব্যাংক ফি": "Total BDT & Bank Fee",
  "ট্রেড হিসাব: ৳0.00": "Trade Total: ৳0.00",
  "💵 ডলার রেট আপডেট হয়েছে! সব কাস্টমারকে ১ ক্লিকে WhatsApp-এ জানাবেন?": "💵 USD rate updated! Notify all customers in 1-click on WhatsApp?",
  "বিল: ৳0.00": "Bill: ৳0.00",
  "🚨 রেস্ট্রিকশন, রিজেক্ট ও আপিল রিস্ক লগ (Risk & Appeal Log)": "🚨 Restriction, Rejection & Appeal Risk Log",
  "+ রিস্ক লগ সেভ করুন": "+ Save Risk Log",
  "TrxID / রেফারেন্স": "TrxID / Reference",
  "মোট বিল (৳)": "Total Bill (৳)",
  "নিট লাভ (৳)": "Net Profit (৳)",
  "বাংলা": "Bangla",
  "যোগাযোগ": "Contact",
  "Role ও প্ল্যান": "Role & Plan",
  "শেষ লগইন": "Last Login",
  "ক্যাম্পেইন ও বাজেট": "Campaign & Budget",
  "প্রাপক ও বিষয়": "Recipient & Topic",
  "প্রেরক": "Sender",
  "বার্তা": "Message",
  "সময় ও ব্যক্তি": "Time & User",
  "ইউজারনেম (ছোট হাতের ইংরেজি)": "Username (lowercase)",
  "পুনরায় পাসওয়ার্ড": "Confirm Password",
  "Pixel বা G-/AW- ID": "Pixel or G-/AW- ID",
  "01XXXXXXXXX বা @username": "01XXXXXXXXX or @username",
  "কমপক্ষে ৬ অক্ষর": "At least 6 characters",
  "যেমন: ABC Fashion-এর Pixel ও CAPI চেক করা": "e.g. Check Pixel & CAPI for ABC Fashion",
  "প্রয়োজনীয় তথ্য": "Required info",
  "পেজ, চ্যানেল বা সাইটের নাম": "Page, Channel or Website name",
  "ক্লায়েন্ট বা বিজনেস নাম": "Client or Business name",
  "যেমন: Google Search + YouTube Promo": "e.g. Google Search + YouTube Promo",
  "বিজ্ঞাপনের লক্ষ্য ও শর্তাবলি": "Campaign goals & terms",
  "মাসিক লিমিট ($)": "Monthly Limit ($)",
  "পাসপোর্ট হোল্ডার / নং": "Passport Holder / No",
  "পার্টনার / ওনার (ঐচ্ছিক)": "Partner / Owner (Optional)",
  "শেয়ার (%)": "Share (%)",
  "যেমন: 100": "e.g. 100",
  "যেমন: 500": "e.g. 500",
  "যেমন: 123": "e.g. 123",
  "অতিরিক্ত বিস্তারিত": "Additional details",
  "যেমন: 18-45, All": "e.g. 18-45, All",
  "যেমন: Online Shoppers, Keywords, YouTube Channels": "e.g. Online Shoppers, Keywords, YouTube Channels",
  "ক্লায়েন্টের দেওয়া পোস্ট ক্যাপশন বা গুগল অ্যাড হেডলাইন...": "Client post caption or Google Ad headline...",
  "যেমন: Agency Google MCC-1": "e.g. Agency Google MCC-1",
  "যেমন: অফিস ভাড়া": "e.g. Office Rent",
  "যেমন: bKash থেকে Bank জমা": "e.g. Cashout from bKash to Bank",
  "যেমন: https://api.ultramsg.com/.../messages/chat": "e.g. https://api.ultramsg.com/.../messages/chat",
  "খালি রাখলে ডিফল্ট ব্যবহার হবে ({name}, {rate}, {date})": "Leave blank for default ({name}, {rate}, {date})",
  "খালি রাখলে ডিফল্ট ব্যবহার হবে ({name}, {rate})": "Leave blank for default ({name}, {rate})",
  "খালি রাখলে ডিফল্ট ব্যবহার হবে ({name}, {due}, {payinfo})": "Leave blank for default ({name}, {due}, {payinfo})",
  "যেমন: 1234": "e.g. 1234",
  "Ads হিসাব ম্যানেজার": "Ads Hisab Manager",
  "আপনার বিজ্ঞাপনের হিসাব ও লাভ-ক্ষতি নিরাপদে পরিচালনা করুন": "Manage your ad accounts & profit/loss securely",
  "ইউজারনেম / ইমেইল / মোবাইল": "Username / Email / Mobile",
  "পাসওয়ার্ড": "Password",
  "পাসওয়ার্ড মনে রাখুন": "Remember Password",
  "লগইন করুন": "Sign In",
  "পাসওয়ার্ড রিসেট": "Reset Password",
  "ইউজারনেম খুঁজুন": "Find Username",
  "🆘 অ্যাডমিন / সুপার অ্যাডমিন হেল্প": "🆘 Admin / Super Admin Help",
  "চলমান কিউ: 1 / 10": "Queue: 1 / 10",
  "ক্লায়েন্ট:": "Client:",
  "ক্যাম্পেইন:": "Campaign:",
  "কাস্টমার:": "Customer:",
  "গ্রহণকৃত টাকা:": "Received Amount:",
  "পেমেন্ট মাধ্যম:": "Payment Method:",
  "রেফারেন্স:": "Reference:",
  "নোট:": "Note:",
  "মোট বিল:": "Total Bill:",
  "মোট আদায়:": "Total Paid:",
  "উভয়কে": "Both",
  "শুরুর তারিখ": "Start Date",
  "শেষ তারিখ": "End Date",
  "তারিখ: --": "Date: --",
  "কাস্টমার বিবরণ:": "Customer Details:",
  "💰 আদায়কৃত পেমেন্ট:": "💰 Payments Received:",
  "রেফারেন্স": "Reference",
  "নির্বাচিত বিল:": "Selected Bill:",
  "নির্বাচিত আদায়:": "Selected Paid:",
  "সর্বমোট বকেয়া:": "Total Due:",
  "বিবরণ": "Description",
  "ডেটা ডিলিট": "Delete Data",
  "🎯 অ্যাড ব্রিফ, টার্গেটিং ও পলিসি ইস্যু (ক্লিক করে দেখুন)": "🎯 Ad Brief, Targeting & Policy Issues (Click to view)",
  "কলাম সাপোর্ট: Campaign name, Amount spent / Cost, Reach / Impressions, Clicks, Results / Conversions, Purchase value": "Supported columns: Campaign name, Amount spent / Cost, Reach / Impressions, Clicks, Results / Conversions, Purchase value",
  "কোনো নতুন বিজ্ঞপ্তি নেই": "No new notifications",
  "আজকের বিল": "Today's Bill",
  "আজকের খরচ": "Today's Cost",
  "মোট বকেয়া": "Total Due",
  "🎯 চলতি মাসের প্রফিট টার্গেট:": "🎯 Monthly Profit Target:",
  "📈 শেষ ৬ মাসের আয়, খরচ ও লাভ": "📈 Last 6 Months Revenue, Cost & Profit",
  "🏆 টপ ক্লায়েন্ট": "🏆 Top Clients",
  "⚡ চলমান ক্যাম্পেইন মনিটর (Active Ads)": "⚡ Active Ads Monitor",
  "টি কাজ নির্বাচিত": "campaigns selected",
  "টাকা": "BDT",
  "✅ অ্যাপ্রুভাল": "✅ Approvals",
  "আপনার অ্যাকাউন্ট সুরক্ষিত রাখতে স্ক্রিন লক ব্যবহার করুন।": "Use Screen Lock to keep your account secure.",
  "🎯 মিডিয়া বায়ার": "🎯 Media Buyer",
  "💰 অ্যাকাউন্টস": "💰 Accounts",
  "👁️ ভিউ-অনলি": "👁️ View-Only",
  "সব রোল": "All Roles",
  "সব স্ট্যাটাস": "All Status",
  "📥 ইউজার CSV": "📥 Users CSV",
  "🔍 ইউজার নাম, @username বা ফোন...": "🔍 Name, @username or phone...",
  "📢 গ্লোবাল নোটিশ (বড় হলে উপরে এক লাইনে স্ক্রল করবে)": "📢 Global Notice (scrolls in 1 line if long)",
  "যেমন: আজ ডলার রেট ৳১২৬ — নতুন কাজ সেভের আগে রেট যাচাই করুন...": "e.g. Today USD Rate ৳126 — verify before saving...",
  "নোটিশ ধরন": "Notice Style",
  "🔵 সাধারণ তথ্য": "🔵 Info",
  "🟠 সতর্কতা": "🟠 Warning",
  "🔴 জরুরি অ্যালার্ট": "🔴 Urgent Alert",
  "✕ মুছুন": "✕ Clear",
  "অটো আইডল লক (মিনিট)": "Auto Idle Lock (Min)",
  "বন্ধ (Off)": "Off",
  "৫ মিনিট": "5 Minutes",
  "১৫ মিনিট": "15 Minutes",
  "৩০ মিনিট": "30 Minutes",
  "৬০ মিনিট": "60 Minutes",
  "Staff CSV/JSON ডেটা এক্সপোর্ট করতে পারবে না": "Block Staff from exporting CSV/JSON data",
  "🛠️ মেইনটেন্যান্স / রিড-অনলি মোড (শুধু Super Admin এডিট)": "🛠️ Maintenance / Read-Only Mode (Super Admin edits only)",
  "💾 সিস্টেম স্টোরেজ ও ডেটা ব্রেকডাউন": "💾 System Storage & Data Breakdown",
  "🧪 Test": "🧪 Test",
  "🔍 লগ খুঁজুন...": "🔍 Search logs...",
  "📥 লগ CSV": "📥 Logs CSV",
  "💬 অনলাইন টিম চ্যাট (ছবি, স্ক্রিনশট, রিপ্লাই ও ফাইল)": "💬 Live Team Chat (Media, Replies & Files)",
  "টিম চ্যাট হাব": "Team Chat Hub",
  "🔍 মেসেজ বা ফাইল খুঁজুন...": "🔍 Search messages or files...",
  "💬 সব মেসেজ": "💬 All Messages",
  "📌 পিন করা মেসেজ": "📌 Pinned Messages",
  "🖼️ ছবি ও ফাইল": "🖼️ Photos & Files",
  "🚨 জরুরি / 💰 পেমেন্ট": "🚨 Urgent / 💰 Payment",
  "অটো সিঙ্ক চালু": "Auto Sync On",
  "Ctrl+V দিয়ে সরাসরি স্ক্রিনশট পেস্ট করুন · ছবি অটো কমপ্রেস হবে": "Paste screenshot (Ctrl+V) · Images auto-compress",
  "✅ পেমেন্ট চেক করছি": "✅ Checking payment",
  "🚀 অ্যাড লাইভ হয়েছে": "🚀 Ad is live",
  "⚠️ কার্ড ও বাজেট চেক করুন": "⚠️ Check card/budget",
  "⚠️ কার্ড/বাজেট চেক": "⚠️ Card/Budget check",
  "👍 ওকে ডান": "👍 Okay done",
  "সাধারণ": "General",
  "💰 পেমেন্ট": "💰 Payment",
  "⚡ ক্যাম্পেইন": "⚡ Campaign",
  "🚨 জরুরি": "🚨 Urgent",
  "মেসেজ লিখুন বা স্ক্রিনশট পেস্ট (Ctrl+V) করুন...": "Type message or paste screenshot (Ctrl+V)...",
  "🛠️ মেইনটেন্যান্স": "🛠️ Maintenance",
  "সিস্টেম রিড-অনলি মোডে আছে — শুধুমাত্র Super Admin তথ্য পরিবর্তন করতে পারবেন।": "System is in Read-Only mode — only Super Admin can edit.",
  "সব": "All",
  "🎬 ভিডিও মেকার স্টুডিও": "🎬 Video Maker Studio",
  "স্ক্রল গতি (Speed)": "Scroll Speed",
  "🐢 খুব ধীর (সহজ পঠন)": "🐢 Very Slow (Easy Read)",
  "🚶 ধীর (Slow · ডিফল্ট)": "🚶 Slow (Default)",
  "▶️ স্বাভাবিক (Normal)": "▶️ Normal",
  "⚡ দ্রুত (Fast)": "⚡ Fast",
  "📌 স্থির (স্ক্রল বন্ধ)": "📌 Static (No Scroll)",
  "🤝 কার্ড দিয়ে অন্যকে অ্যাড চালানোর হিসাব (Card Lending / Dollar Allocation)": "🤝 Card Lending & Sub-User Dollar Allocation",
  "➕ নতুন কার্ড ডলার বরাদ্দ / লেন্ডিং এন্ট্রি": "➕ New Card Dollar Allocation / Lending",
  "ব্যবহারকারীর নাম *": "User Name *",
  "মোবাইল (WhatsApp)": "Mobile (WhatsApp)",
  "Ad Account / পেজ নোট": "Ad Account / Page Note",
  "কত ডলার দিলাম / বরাদ্দ ($) *": "Allocated USD ($) *",
  "এখন পর্যন্ত খরচ ($)": "Spent So Far ($)",
  "বিল হিসাবের নিয়ম": "Billing Rule",
  "শুধু খরচ হওয়া ডলার ($) অনুযায়ী": "Based on Actual Spend ($)",
  "পুরো বরাদ্দকৃত ডলার ($) অনুযায়ী": "Based on Total Allocated ($)",
  "বিক্রি / চার্জ রেট (৳/$) *": "Charge Rate (৳/$) *",
  "জমা / অ্যাডভান্স (৳)": "Paid / Advance (৳)",
  "ওয়ালেট মাধ্যম": "Wallet Method",
  "নোট / শর্ত": "Note / Terms",
  "+ কার্ড বরাদ্দ সেভ করুন": "+ Save Allocation",
  "📋 কার্ড ব্যবহারকারী ও বাকি ডলারের তালিকা": "📋 Card Users & Remaining Dollar Ledger",
  "সব লেন্ডিং": "All Allocations",
  "ডলার বাকি আছে": "USD Remaining",
  "টাকা বকেয়া আছে": "Payment Due",
  "সম্পন্ন (Paid & Used)": "Settled (Paid & Used)",
  "🔍 নাম, কার্ড বা Ad ID...": "🔍 Name, Card or Ad ID...",
  "তারিখ ও কার্ড": "Date & Card",
  "ব্যবহারকারী ও Ad Account": "User & Ad Account",
  "বরাদ্দ ($)": "Allocated ($)",
  "খরচ ($)": "Spent ($)",
  "অবশিষ্ট ($)": "Remaining ($)",
  "বিল, জমা ও বাকি (৳)": "Bill, Paid & Due (৳)",
  "কার্ড লাভ": "Card Profit",
  "💳 কার্ড লেন্ডিং আপডেট": "💳 Update Card Lending",
  "✓ আপডেট সেভ করুন": "✓ Save Update",
  "💼 প্রিপেইড ওয়ালেট ও লো-অ্যাডভান্স অ্যালার্ট": "💼 Prepaid Wallet & Low-Advance Alerts",
  "⚠️ শুধু লো-অ্যাডভান্স (< সীমা)": "⚠️ Low-Advance Only (< Limit)",
  "💼 সব প্রিপেইড ওয়ালেট ক্লায়েন্ট": "💼 All Prepaid Wallet Clients",
  "ওয়ালেট ব্যালেন্স / সীমা": "Wallet Balance / Limit",
  "ডেইলি স্পেন্ড লিমিট ($)": "Daily Spend Limit ($)",
  "বিলিং তারিখ (১-৩১)": "Billing Day (1-31)",
  "থ্রেশহোল্ড / Unpaid / লিমিট": "Threshold / Unpaid / Limit",
  "📅 কার্ড ও অ্যাড অ্যাকাউন্ট বিলিং ক্যালেন্ডার + লিমিট মনিটর": "📅 Card & Ad Account Billing Calendar + Limit Monitor",
  "আসন্ন বিলিং তারিখ, থ্রেশহোল্ড রিস্ক ও কার্ড ম্যাপিং": "Upcoming billing dates, threshold risk & card mapping",
  "🛡️ স্মার্ট দৈনিক ব্যাকআপ রিমাইন্ডার ও অটো-স্ন্যাপশট": "🛡️ Smart Daily Backup Reminder & Auto-Snapshots",
  "প্রতিদিন অটো লোকাল রিকভারি স্ন্যাপশট ও নির্ধারিত সময়ে JSON ব্যাকআপ সতর্কতা": "Daily auto local recovery snapshots & scheduled JSON backup alerts",
  "🔔 প্রতিদিন রিমাইন্ডার": "🔔 Daily Reminder",
  "🔔 প্রতি ৩ দিন পর": "🔔 Every 3 Days",
  "🔔 প্রতি ৭ দিন পর": "🔔 Every 7 Days",
  "📸 এখনই স্ন্যাপশট": "📸 Save Snapshot Now",
  "স্ন্যাপশট তারিখ ও সময়": "Snapshot Date & Time",
  "কাস্টমার / কাজ / কার্ড": "Clients / Works / Cards",
  "সাইজ": "Size",
  "🏆 মাসিক লক্ষ্যমাত্রা ও স্টাফ পারফরম্যান্স লিডারবোর্ড": "🏆 Monthly Targets & Staff Performance Leaderboard",
  "মাসিক লাভ টার্গেট, গড় ROAS, র‍্যাংকিং ও পারফরম্যান্স বোনাস": "Monthly profit target, avg ROAS, ranking & performance bonus",
  "মাস": "Month",
  "মাসিক লাভ টার্গেট (৳)": "Monthly Profit Target (৳)",
  "টার্গেট বোনাস (%)": "Target Bonus (%)",
  "গড় ROAS": "Avg ROAS",
  "টার্গেট ও বোনাস": "Target & Bonus",
  "কমিশন + বোনাস": "Comm + Bonus",
  "💱 দ্রুত USD ↔ BDT ও প্রফিট-টার্গেট ক্যালকুলেটর": "💱 Quick USD ↔ BDT & Profit-Target Calculator",
  "🎯 প্রফিট-টার্গেট রেট": "🎯 Target Profit Rate",
  "কার্ড কেনা রেট (৳/$)": "Card Cost Rate (৳/$)",
  "ব্যাংক / BD VAT (%)": "Bank / BD VAT (%)",
  "বাজেট ($ USD)": "Budget ($ USD)",
  "লাভের ধরন": "Profit Type",
  "প্রতি ডলারে নিট লাভ (৳)": "Net Profit Per USD (৳)",
  "নিট প্রফিট মার্জিন (%)": "Net Profit Margin (%)",
  "কাঙ্ক্ষিত লাভের মান (৳ বা %)": "Target Profit Value (৳ or %)",
  "📝 কোটেশনে নিন": "📝 Apply to Quote",
  "⚡ কাজে ব্যবহার": "⚡ Use in Work",
  "🤝 পেমেন্ট প্রতিশ্রুতি তারিখ সেট করুন": "🤝 Set Payment Promise Date",
  "টাকা পরিশোধের প্রতিশ্রুতি তারিখ *": "Promised Payment Date *",
  "🎯 মাসিক খরচ বাজেট সীমা (Monthly Expense Budget Control)": "🎯 Monthly Expense Budget Control",
  "ক্যাটাগরি অনুযায়ী মাসিক খরচের লিমিট সেট করুন — বাজেট অতিক্রম করলে সতর্কবার্তা পাবেন": "Set monthly spending caps per category — get alerts if exceeded",
  "মাসিক বাজেট (৳)": "Monthly Budget (৳)",
  "✓ সেট করুন": "✓ Set Cap",
  "সব বকেয়া কাস্টমার": "All Due Clients",
  "🤝 প্রতিশ্রুতি / আজকের তারিখ": "🤝 Promise / Due Today",
  "🔴 ৩০+ দিন পুরোনো বকেয়া": "🔴 30+ Days Overdue",
  "🟡 ৮-৩০ দিন পুরোনো": "🟡 8-30 Days Old",
  "কাস্টমার ও বয়স": "Client & Age",
  "প্রতিশ্রুতি ও রিমাইন্ডার": "Promise & Reminder",
  "💎 ক্লায়েন্ট লাভজনকতা ও মার্জিন অডিট স্কোরকার্ড": "💎 Client Profitability & Margin Audit Scorecard",
  "প্রতি ক্লায়েন্টের গড় ডলার রেট, এড খরচ, নিট প্রফিট ও মার্জিন %": "Client-wise avg USD rate, ad cost, net profit & margin %",
  "💎 হাই মার্জিন (>= ১৫%)": "💎 High Margin (>= 15%)",
  "⚠️ লো মার্জিন (< ৮%)": "⚠️ Low Margin (< 8%)",
  "🔴 লস / নেগেটিভ প্রফিট": "🔴 Loss / Negative Profit",
  "গড় রেট": "Avg Rate",
  "মার্জিন ও অবস্থা": "Margin & Status",
  "🎨 গ্রাফিক্স, অ্যাড পোস্টার স্টুডিও ও ডিজাইন অর্ডার হাব": "🎨 Graphics, Ad Poster Studio & Design Order Hub",
  "ক্যানভাস পোস্টার/থাম্বনেইল বানান, PNG ডাউনলোড করুন, Creative Vault-এ সেভ করুন ও ডিজাইন অর্ডার ট্র্যাক করুন": "Create canvas posters/thumbnails, download PNG, save to Creative Vault & track design orders",
  "🗂️ ক্রিয়েটিভ ভল্ট": "🗂️ Creative Vault",
  "🎬 প্রো ভিডিও স্টুডিও": "🎬 Pro Video Studio",
  "🖼️ ১-ক্লিক অ্যাড পোস্টার, ব্যানার ও থাম্বনেইল মেকার": "🖼️ 1-Click Ad Poster, Banner & Thumbnail Maker",
  "1:1 পোস্টার": "1:1 Poster",
  "4:5 ফিড": "4:5 Feed",
  "16:9 থাম্বনেইল": "16:9 Thumbnail",
  "9:16 স্টোরি/রিলস": "9:16 Story/Reels",
  "লিঙ্ক ব্যানার": "Link Banner",
  "🔵 রয়্যাল এজেন্সি": "🔵 Royal Agency",
  "🔥 ফ্ল্যাশ সেল রেড": "🔥 Flash Sale Red",
  "🌙 ইমারেল্ড গোল্ড": "🌙 Emerald Gold",
  "⚡ ডার্ক প্রিমিয়াম": "⚡ Dark Premium",
  "☀️ মিনিমাল হোয়াইট": "☀️ Minimal White",
  "কাস্টমার (ঐচ্ছিক)": "Customer (Optional)",
  "অফার / টপ ব্যাজ": "Offer / Top Badge",
  "সাব-হেডলাইন / প্রাইস / বিবরণ": "Subheadline / Price / Details",
  "বাটন / CTA টেক্সট": "Button / CTA Text",
  "ফুটার ব্র্যান্ড / মোবাইল": "Footer Brand / Phone",
  "প্রোডাক্ট / থাম্ব ছবি আপলোড": "Upload Product / Thumb Photo",
  "ব্যাকগ্রাউন্ড ছবি (ঐচ্ছিক)": "Background Photo (Optional)",
  "BG রঙ ১": "BG Color 1",
  "BG রঙ ২": "BG Color 2",
  "অ্যাক্সেন্ট / CTA রঙ": "Accent / CTA Color",
  "হেডলাইন সাইজ": "Headline Size",
  "এজেন্সি লোগো দেখান": "Show Agency Logo",
  "🧹 ছবি রিসেট": "🧹 Reset Photos",
  "📥 PNG ডাউনলোড": "📥 Download PNG",
  "💾 ক্রিয়েটিভ ভল্টে সেভ করুন": "💾 Save to Creative Vault",
  "🖼️ লাইভ প্রিভিউ": "🖼️ Live Preview",
  "🖌️ গ্রাফিক্স ডিজাইন অর্ডার, রিভিশন ও ডেলিভারি ট্র্যাকার": "🖌️ Graphics Design Order, Revision & Delivery Tracker",
  "ডিজাইনের ধরন *": "Design Type *",
  "প্রজেক্ট / ডিজাইন টাইটেল *": "Project / Design Title *",
  "ডিজাইনার / দায়িত্বপ্রাপ্ত": "Designer / Assignee",
  "ডেলিভারি ডেডলাইন": "Delivery Deadline",
  "ক্লায়েন্ট চার্জ (৳)": "Client Charge (৳)",
  "ডিজাইনার খরচ (৳)": "Designer Cost (৳)",
  "ড্রাইভ / ফাইল লিংক": "Drive / File Link",
  "নোট / সাইজ ও নির্দেশনা": "Note / Size & Instructions",
  "+ গ্রাফিক্স অর্ডার যোগ করুন": "+ Add Graphics Order",
  "📋 ডিজাইন কাজের তালিকা": "📋 Design Orders List",
  "সব স্ট্যাটাস": "All Status",
  "তারিখ ও ডেডলাইন": "Date & Deadline",
  "কাস্টমার ও ধরন": "Customer & Type",
  "টাইটেল ও ডিজাইনার": "Title & Designer",
  "রিভিশন": "Revisions",
  "চার্জ / লাভ": "Charge / Profit",
  "🎭 রোল ও ক্ষমতা ম্যাট্রিক্স": "🎭 Roles & Capabilities Matrix",
  "🎭 সিস্টেম রোল ও অ্যাক্সেস ক্যাপাবিলিটি ম্যাট্রিক্স (Super Admin · Admin · Staff · User)": "🎭 System Roles & Capability Matrix (Super Admin · Admin · Staff · User)",
  "🔐 লগইন স্ক্রিন ঘোষণা / কাস্টমার অফার ব্যানার (ঐচ্ছিক)": "🔐 Login Screen Banner / Offer Notice (Optional)",
  "নতুন ইউজার সাইন-আপ পলিসি": "New User Sign-up Policy",
  "+৩০ দিন মেয়াদ": "+30 Days Expiry",
  "✓ Active / অনুমোদন": "✓ Active / Approve",
  "⛔ ব্লক (Suspend)": "⛔ Block (Suspend)",
  "জন ইউজার নির্বাচিত": "users selected",
  "🎯 অ্যাড বাজেট ও সেলস ফানেল প্ল্যানার": "🎯 Ad Budget & Sales Funnel Planner",
  "টার্গেট অর্ডার বা লিড অনুযায়ী দৈনিক ও মোট ডলার বাজেট এবং ক্লায়েন্ট কোটেশন হিসাব করুন": "Calculate daily/total USD budget and client quote from target orders or leads",
  "টার্গেট সেল / অর্ডার সংখ্যা": "Target Sales / Orders",
  "কনভার্সন রেট (% মেসেজ → অর্ডার)": "Conversion Rate (% Msg → Order)",
  "গড় Cost Per Message/Lead ($)": "Avg Cost Per Message/Lead ($)",
  "ক্যাম্পেইন মেয়াদ (দিন)": "Campaign Duration (Days)",
  "গড় প্রোডাক্ট দাম (৳)": "Avg Product Price (৳)",
  "এজেন্সি সার্ভিস চার্জ (%)": "Agency Service Charge (%)",
  "📋 প্ল্যান কপি": "📋 Copy Plan",
  "⚡ কাজে বসান": "⚡ Load into Work",
  "📋 ডেইলি ব্রিফ": "📋 Daily Brief",
  "🎯 ফানেল ও বাজেট প্ল্যানার": "🎯 Funnel & Budget Planner",
  "🎯 বাজেট প্ল্যানার": "🎯 Budget Planner",
  "📦 এজেন্সি সার্ভিস প্যাকেজ ও প্রাইস ক্যাটালগ (১-ক্লিকে কোটেশন, কাজ ও WhatsApp অফার)": "📦 Service Packages & Price Catalog (1-Click Quote, Work & WhatsApp Offer)",
  "প্যাকেজের নাম *": "Package Name *",
  "ক্যাটাগরি": "Category",
  "ডলার বাজেট ($)": "Dollar Budget ($)",
  "সার্ভিস চার্জ / প্যাকেজ ফি": "Service Charge / Package Fee",
  "প্যাকেজ বিবরণ / যা যা থাকবে": "Package Details / Deliverables",
  "+ প্যাকেজ সেভ করুন": "+ Save Package",
  "✨ স্টার্টার প্যাকেজ লোড করুন": "✨ Load Starter Packages",
  "পোস্টার লেআউট": "Poster Layout",
  "ব্যাকগ্রাউন্ড প্যাটার্ন": "Background Pattern",
  "📋 ক্যাপশন কপি": "📋 Copy Caption",
  "🎙️ লাইভ ভয়েস (কথা বলুন)": "🎙️ Live Voice (Speak)",
  "🎙️ লাইভ ভয়েস কল (সরাসরি কথা বলুন)": "🎙️ Live Voice Call (Speak Directly)",
  "মাইক্রোফোনে বাংলা বা ইংরেজিতে সরাসরি কথা বলুন — সাথে সাথে ভয়েস রিপ্লাই ও লাইভ ট্রান্সক্রিপ্ট পাবেন": "Speak directly in Bengali or English — get instant voice replies and live transcripts",
  "ভয়েস (Voice)": "Voice",
  "কথোপকথন মোড": "Conversation Mode",
  "হিসাব ও রেট কনটেক্সট যুক্ত করুন": "Include Agency Rate & Stats Context",
  "🎙️ কথা বলা শুরু করুন": "🎙️ Start Talking",
  "🎤 মিউট": "🎤 Mute",
  "⏹ কল শেষ করুন": "⏹ End Call",
  "💡 অ্যাডস স্ট্র্যাটেজি": "💡 Ads Strategy",
  "🤝 ক্লায়েন্ট পিচ": "🤝 Client Pitch",
  "📊 আজকের হিসাব": "📊 Today Summary",
  "🎬 ভিডিও স্ক্রিপ্ট": "🎬 Video Script",
  "📝 লাইভ কথোপকথন (Transcript)": "📝 Live Transcript",
  "🗑️ ক্লিয়ার": "🗑️ Clear",
  "📰 নিউজ ফিড ও পোস্ট": "📰 News Feed & Posts",
  "📰 এজেন্সি নিউজ ফিড ও কাজের অভিজ্ঞতা শেয়ার": "📰 Agency News Feed & Work Updates",
  "💬 টিম চ্যাট ও ভয়েস": "💬 Team Chat & Voice",
  "🚀 পোস্ট করুন": "🚀 Publish Post",
  "🖼️ ছবি / স্ক্রিনশট": "🖼️ Image / Screenshot",
  "📊 পোল": "📊 Poll",
  "📰 সব পোস্ট": "📰 All Posts",
  "🔥 জনপ্রিয়": "🔥 Popular",
  "📌 পিন করা": "📌 Pinned",
  "🆘 সাহায্য / ইস্যু": "🆘 Help / Issues",
  "🔖 সেভ করা": "🔖 Saved",
  "👤 আমার পোস্ট": "👤 My Posts",
  "🚨 মডারেশন ও সতর্কতা": "🚨 Moderation & Warnings",
  "📞 কথা বলুন (Join)": "📞 Join Voice",
  "📵 বের হন": "📵 Leave",
  "🤖 AI ভয়েস": "🤖 AI Voice",
  "💬 সব মেসেজ": "💬 All Messages",
  "🎙️ ভয়েস মেসেজ": "🎙️ Voice Notes",
  "✓ বুঝেছি": "✓ Got It",
  "পাবলিক বায়ো / স্পেশালিটি": "Public Bio / Specialty",
  "কমিউনিটি মেম্বার ও অনলাইন": "Community Members & Online",
  "কমিউনিটি নীতিমালা ও স্ট্যাটাস": "Community Rules & Status",
  "✉️ প্রাইভেট DM": "✉️ Private DM",
  "📊 লিড CRM পাইপলাইন": "📊 Lead CRM Pipeline",
  "📈 ক্লায়েন্ট রিপোর্ট কার্ড": "📈 Client Report Card",
  "📊 ক্লায়েন্ট রিপোর্ট কার্ড": "📊 Client Report Card",
  "📅 কনটেন্ট ক্যালেন্ডার": "📅 Content Calendar",
  "✨ AI ক্যাপশন ও হুক": "✨ AI Caption & Hooks",
  "🧑‍💼 এটেনডেন্স ও পেস্লিপ": "🧑‍💼 Attendance & Payslip",
  "💾 কিট সেভ": "💾 Save Kit"
};

const BN_PHRASES_EN = [
  ["বিজ্ঞাপনের হিসাব", "Ad accounts"],
  ["কাস্টমার", "Customer"],
  ["ক্লায়েন্ট", "Client"],
  ["ক্যাম্পেইন", "Campaign"],
  ["প্ল্যাটফর্ম", "Platform"],
  ["ডলার রেট", "USD Rate"],
  ["পেমেন্ট", "Payment"],
  ["ইনভয়েস", "Invoice"],
  ["প্রোফাইল", "Profile"],
  ["অ্যাকাউন্ট", "Account"],
  ["পাসওয়ার্ড", "Password"],
  ["ইউজারনেম", "Username"],
  ["তারিখ", "Date"],
  ["পরিমাণ", "Amount"],
  ["বকেয়া", "Due"],
  ["অ্যাডভান্স", "Advance"],
  ["খরচ", "Cost"],
  ["মোট", "Total"],
  ["বিবরণ", "Details"],
  ["নোট", "Note"],
  ["মাধ্যম", "Method"],
  ["রেফারেন্স", "Ref"],
  ["সার্ভিস চার্জ", "Service Fee"],
  ["মেয়াদ", "Duration"],
  ["প্রিন্ট", "Print"],
  ["ডাউনলোড", "Download"],
  ["রিস্টোর", "Restore"],
  ["ব্যাকআপ", "Backup"],
  ["সেটিংস", "Settings"],
  ["এজেন্সি", "Agency"],
  ["স্টাফ", "Staff"],
  ["অ্যাডমিন", "Admin"],
  ["ঐচ্ছিক", "Optional"],
  ["দিন", "Days"],
  ["টাকা", "BDT"],
  ["ডলার", "USD"]
];

function translateBnStringToEn(str) {
  const s = String(str || '');
  const norm = s.replace(/\s+/g, ' ').trim();
  if (!norm) return s;
  if (UI_BN_TO_EN[norm]) return s.replace(s.trim(), UI_BN_TO_EN[norm]);
  if (!/[\u0980-\u09FF]/.test(norm)) return s;
  let out = s;
  for (const [bn, en] of BN_PHRASES_EN) {
    if (out.includes(bn)) out = out.split(bn).join(en);
  }
  return out;
}

function isInsideDynamicContainer(node) {
  let cur = node.parentElement;
  while (cur && cur !== document.body) {
    if (cur.tagName === 'SCRIPT' || cur.tagName === 'STYLE') return true;
    if (cur.id && DYNAMIC_I18N_SKIP_IDS.has(cur.id)) return true;
    cur = cur.parentElement;
  }
  return false;
}

function translateStaticDom(lang) {
  if (!document.body) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue || !node.nodeValue.trim()) continue;
    if (isInsideDynamicContainer(node)) continue;
    if (node._origBn === undefined) node._origBn = node.nodeValue;
    if (lang === 'en') node.nodeValue = translateBnStringToEn(node._origBn);
    else node.nodeValue = node._origBn;
  }
  document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(el => {
    if (el.dataset.origPh === undefined) el.dataset.origPh = el.getAttribute('placeholder') || '';
    el.setAttribute('placeholder', lang === 'en' ? translateBnStringToEn(el.dataset.origPh) : el.dataset.origPh);
  });
  document.querySelectorAll('[title]').forEach(el => {
    if (el.dataset.origTitle === undefined) el.dataset.origTitle = el.getAttribute('title') || '';
    el.setAttribute('title', lang === 'en' ? translateBnStringToEn(el.dataset.origTitle) : el.dataset.origTitle);
  });
}

function applyLanguage(lang) {
  const safeLang = lang === 'en' ? 'en' : 'bn';
  localStorage.setItem(LANG_KEY, safeLang);
  document.documentElement.lang = safeLang;
  const t = translations[safeLang] || translations.bn;
  if ($('languageSelect')) $('languageSelect').value = safeLang;
  if ($('headerLangBtn')) $('headerLangBtn').textContent = safeLang === 'en' ? '🌐 EN | বাংলা' : '🌐 BN | EN';
  translateStaticDom(safeLang);
  const map = { navDashLabel: t.navDash, navCust: t.navCust, navQuotes: t.navQuotes, navCards: t.navCards, navTrading: t.navTrading, navRates: t.navRates, navWorksLabel: t.navWorks, navGfx: t.navGfx, navPixel: t.navPixel, navExp: t.navExp, navPay: t.navPay, navDue: t.navDue, navMonthly: t.navMonthly, navRep: t.navRep, navSet: t.navSet, navChatLabel: t.navChat, navTraining: t.navTraining, nfClientLbl: t.nfClientLbl, nfFinanceLbl: t.nfFinanceLbl, nfStudioLbl: t.nfStudioLbl, nfTeamLbl: t.nfTeamLbl, nfSystemLbl: t.nfSystemLbl, headerSubText: t.headerSub, uiLoginTitle: t.loginTitle, uiLoginSub: t.loginSub, uiUserLabel: t.userLabel, uiPassLabel: t.passLabel, uiRememberText: t.rememberText, loginBtn: t.loginBtnText, uiNotifHeader: t.notifHead, cardTitleTodayProfit: t.c1, cardTitleTotalBill: t.c2, cardTitleTotalCost: t.c3, cardTitleNetProfit: t.c4, secTitleCust: t.secCust, secTitleCards: t.secCards, secTitleRates: t.secRates, secTitleWorks: t.secWorks, secTitleGfx: t.secGfx };
  Object.entries(map).forEach(([id, txt]) => { if ($(id) && txt) $(id).textContent = txt; });
  document.querySelectorAll('[data-i18n]').forEach(el => { const k = el.getAttribute('data-i18n'); if (t[k]) el.textContent = t[k]; });
  if (typeof render === 'function' && activeAccount) {
    updateHeaderAndProfile(); render(); renderMonthlyReport(); updateWorkPreview(); updateQuotePreview(); updateTradePreview();
  }
}
window.toggleLanguage = () => {
  const next = isEn() ? 'bn' : 'en';
  applyLanguage(next);
  toast(next === 'en' ? 'Language switched to English!' : 'ভাষা বাংলা করা হয়েছে!');
};
if ($('applyLanguageBtn')) $('applyLanguageBtn').onclick = () => { applyLanguage($('languageSelect').value); toast(L('ভাষা পরিবর্তন হয়েছে!', 'Language updated!')); };
applyLanguage(localStorage.getItem(LANG_KEY) || 'bn');

function applyPrivacyMode(on) {
  const active = Boolean(on);
  document.body.classList.toggle('privacy-blur', active);
  const btn = $('privacyModeBtn');
  if (btn) { btn.classList.toggle('priv-active', active); btn.textContent = active ? '🙈' : '👁️'; }
  try { localStorage.setItem(PRIVACY_KEY, active ? '1' : '0'); } catch (e) {}
}
window.togglePrivacyMode = () => {
  const next = !document.body.classList.contains('privacy-blur');
  applyPrivacyMode(next);
  toast(next ? L('প্রাইভেসি ব্লার মোড চালু (টাকা ও লাভ ব্লার)', 'Privacy Blur ON (Amounts Hidden)') : L('প্রাইভেসি ব্লার মোড বন্ধ', 'Privacy Blur OFF'));
};
applyPrivacyMode(localStorage.getItem(PRIVACY_KEY) === '1');

// Theme & Navigation
function setTheme(isDark) { document.body.classList.toggle('dark', isDark); if ($('themeToggleBtn')) $('themeToggleBtn').textContent = isDark ? '☀️' : '🌙'; localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light'); }
if ($('themeToggleBtn')) $('themeToggleBtn').onclick = () => setTheme(!document.body.classList.contains('dark'));
if (localStorage.getItem(THEME_KEY) === 'dark') setTheme(true);
window.openVideoStudio = async () => {
  if (location.protocol === 'file:') {
    const inPublic = Boolean(window.__appFb || document.querySelector('script[src*="./public/app.js"]'));
    window.location.assign(inPublic ? './public/ads-park-video.html' : './ads-park-video.html');
    return;
  }
  if (window.__appFb) {
    window.location.assign('./public/ads-park-video.html');
    return;
  }
  try {
    const r = await fetch('./ads-park-video.html', { method: 'HEAD', cache: 'no-store' });
    if (r.ok) { window.location.assign('./ads-park-video.html'); return; }
  } catch (_) {}
  window.location.assign('./public/ads-park-video.html');
};
function syncNavFolderActive() {
  document.querySelectorAll('.side-menu .nav-folder').forEach(folder => {
    const hasAct = Boolean(folder.querySelector('button[data-tab].active'));
    folder.classList.toggle('has-active', hasAct);
    if (hasAct) folder.classList.add('open');
  });
}
window.toggleNavFolder = key => {
  const target = document.querySelector(`.side-menu .nav-folder[data-folder="${key}"]`);
  if (!target) return;
  const willOpen = !target.classList.contains('open');
  document.querySelectorAll('.side-menu .nav-folder').forEach(f => f.classList.toggle('open', f === target && willOpen));
};
if ($('sideMenuFilter')) {
  const filterSideMenu = () => {
    const q = ($('sideMenuFilter')?.value || '').trim().toLowerCase();
    document.querySelectorAll('.side-menu .nav-folder').forEach(folder => {
      const btns = [...folder.querySelectorAll('.nav-folder-body button')];
      let matchedAny = false;
      btns.forEach(b => {
        const permitted = !isTabHiddenForCurrentUser(b.dataset.tab || '') && !(isStaff() && b.classList.contains('staff-hide')) && !(b.id === 'adminTab' && !isSuperAdmin() && activeAccount?.role !== 'admin');
        const hit = permitted && (!q || b.textContent.toLowerCase().includes(q));
        b.style.display = hit ? '' : 'none';
        if (hit) matchedAny = true;
      });
      if (!q) {
        applyPermissionClasses();
        folder.classList.toggle('open', Boolean(folder.querySelector('button[data-tab].active')));
      } else {
        folder.style.display = matchedAny ? '' : 'none';
        folder.classList.toggle('open', matchedAny);
      }
    });
  };
  $('sideMenuFilter').addEventListener('input', filterSideMenu);
  $('sideMenuFilter').addEventListener('keydown', e => {
    if (e.key === 'Escape') { $('sideMenuFilter').value = ''; filterSideMenu(); $('sideMenuFilter').blur(); }
  });
}
const NO_AUTOFILL_CRED_IDS = ['loginUser', 'loginPass', 'claimAdminEmail', 'claimAdminPass', 'claimAdminPass2', 'regUsername', 'regPass', 'regPass2', 'recNewPass', 'euNewPass', 'userChangePass', 'newUsername', 'settingsOldPass', 'settingsNewPass', 'settingsNewPass2', 'auUsername', 'auPass', 'condMasterPin', 'csSecret'];
function rearmNoAutofill(el) {
  if (!el) return;
  if (NO_AUTOFILL_CRED_IDS.includes(el.id) && document.activeElement !== el) el.setAttribute('readonly', 'readonly');
}
function clearAuthForms() {
  if ($('rememberMeChk')) $('rememberMeChk').checked = false;
  ['loginUser', 'loginPass', 'regName', 'regUsername', 'regEmail', 'regPhone', 'regPass', 'regPass2', 'claimAdminEmail', 'claimAdminPass', 'claimAdminPass2', 'recEmail', 'recPhone', 'recNewPass'].forEach(id => {
    const el = $(id);
    if (el) {
      el.value = '';
      if (el.id === 'loginPass' || el.id === 'regPass' || el.id === 'regPass2' || el.id === 'claimAdminPass' || el.id === 'claimAdminPass2' || el.id === 'recNewPass') el.type = 'password';
      rearmNoAutofill(el);
    }
  });
  if ($('authMsg')) $('authMsg').textContent = '';
}
function resetSectionForms(secId) {
  const sec = $(secId);
  if (!sec) return;
  sec.querySelectorAll('form').forEach(f => {
    if ((f.id === 'profileForm' || f.id === 'agencyForm') && activeAccount) return;
    if ((f.id === 'saveRulesForm' || f.id === 'cloudSyncForm' || f.id === 'subConfigForm') && activeAccount && isSuperAdmin()) return;
    f.reset();
  });
  sec.querySelectorAll('input, textarea, select').forEach(el => {
    if (el.closest('#profileForm') || el.closest('#agencyForm')) {
      if (activeAccount) return;
    }
    if (el.closest('#saveRulesForm') || el.closest('#cloudSyncForm') || el.closest('#subConfigForm')) {
      if (activeAccount && isSuperAdmin() && el.id !== 'condMasterPin' && el.id !== 'condClearMasterPin' && el.id !== 'csSecret') return;
    }
    if (el.tagName === 'SELECT') {
      if (el.options.length > 0 && !el.closest('form')) el.selectedIndex = 0;
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      if (!el.closest('form')) el.checked = false;
    } else if (!el.closest('form') && el.type !== 'hidden' && el.type !== 'button' && el.type !== 'submit') {
      el.value = '';
    }
    if (NO_AUTOFILL_CRED_IDS.includes(el.id)) {
      el.value = '';
      rearmNoAutofill(el);
    }
  });
  if (secId === 'settings') {
    if ($('usernameMsg')) $('usernameMsg').textContent = '';
    if ($('settingsPasswordMsg')) $('settingsPasswordMsg').textContent = '';
    if (activeAccount) {
      if ($('profileForm')) updateHeaderAndProfile();
    }
  }
  if (secId === 'adminPanel') {
    if ($('condMasterPin')) { $('condMasterPin').value = ''; rearmNoAutofill($('condMasterPin')); }
    if ($('condClearMasterPin')) $('condClearMasterPin').checked = false;
    if ($('csSecret')) { $('csSecret').value = ''; rearmNoAutofill($('csSecret')); }
    if ($('auPermsWrap')) $('auPermsWrap').style.display = ($('auRole')?.value === 'staff') ? 'block' : 'none';
  }
  const tStr = today();
  ['rateDate', 'wDate', 'pDate', 'expDate', 'depositDate', 'trDate', 'rfDate', 'caDate', 'trdDate', 'cardRentDate', 'qtDate', 'rlDate', 'csvImpDate', 'dcDate', 'wtDate', 'tkDueDate', 'goDate', 'goDeadline'].forEach(id => {
    const el = $(id);
    if (el && sec.contains(el)) el.value = tStr;
  });
  if (secId === 'works') {
    pendingWorkProof = '';
    if ($('wRate')) { delete $('wRate').dataset.manualEdit; $('wRate').value = activeAccount ? (rateFor(tStr) || '') : ''; }
    if ($('wFeePct')) $('wFeePct').value = activeAccount ? (num(db.agency?.defaultFeePct) || 0) : 0;
    if ($('preview')) $('preview').innerHTML = '';
    if ($('workCsvPreview')) $('workCsvPreview').innerHTML = '';
    if (typeof syncVatBtnState === 'function') syncVatBtnState();
  }
  if (secId === 'quotations') {
    if ($('qtDays')) $('qtDays').value = 7;
    if ($('qtDollar')) $('qtDollar').value = 50;
    if ($('qtRate')) { delete $('qtRate').dataset.manualEdit; $('qtRate').value = activeAccount ? (rateFor(tStr) || '') : ''; }
    if ($('qtPreview')) $('qtPreview').innerHTML = '';
  }
  if (secId === 'cards') {
    if ($('depositBankFee')) $('depositBankFee').value = 0;
    if ($('cardRentSpentUsd')) $('cardRentSpentUsd').value = '0';
    if ($('cardRentPaidTk')) $('cardRentPaidTk').value = '0';
    if ($('cardRentRate')) $('cardRentRate').value = activeAccount ? (rateFor(tStr) || num(db.agency?.defaultRate) || 125) : '';
    if ($('cardRentPreview')) $('cardRentPreview').innerHTML = '';
    if ($('depositBankQuickWrap')) { $('depositBankQuickWrap').innerHTML = ''; $('depositBankQuickWrap').style.display = 'none'; }
  }
  if (secId === 'trading' && $('trdPreview')) $('trdPreview').innerHTML = '';
  if (secId === 'expenses') {
    if ($('expBankQuickWrap')) { $('expBankQuickWrap').innerHTML = ''; $('expBankQuickWrap').style.display = 'none'; }
  }
  if (secId === 'payments') {
    if ($('pFee')) $('pFee').value = 0;
    if ($('wtFee')) $('wtFee').value = 0;
    if ($('pCustomerStatus')) $('pCustomerStatus').innerHTML = '';
    ['pBankQuickWrap', 'caBankQuickWrap'].forEach(wId => { if ($(wId)) { $(wId).innerHTML = ''; $(wId).style.display = 'none'; } });
  }
  if (secId === 'creatives') pendingCreativeThumb = '';
}
function resetAllTransientForms() {
  document.querySelectorAll('main section').forEach(s => { if (s.id) resetSectionForms(s.id); });
  if ($('sideMenuFilter')) $('sideMenuFilter').value = '';
}
window.syncBankQuickPicker = (selId, wrapId) => {
  const sel = $(selId), wrap = $(wrapId);
  if (!sel || !wrap) return;
  if (sel.value !== 'Bank') { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  const choices = linkedBankChoices();
  wrap.style.display = 'block';
  if (!choices.length) {
    wrap.innerHTML = `<div style="padding:7px 9px;border-radius:8px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.35);font-size:11.5px;display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap"><span>🏦 এখনো কোনো ব্যাংক কার্ড তৈরি করা হয়নি — <strong>কার্ড সেকশন</strong> থেকে ব্যাংক কার্ড যোগ করুন।</span><button type="button" class="secondary sm" style="margin:0;padding:2px 8px;font-size:11px" onclick="goToSection('cards')">+ নতুন কার্ড যোগ</button></div>`;
    return;
  }
  wrap.innerHTML = `<div style="padding:7px 9px;border-radius:8px;background:var(--soft);border:1px solid var(--line);font-size:11.5px"><span class="muted" style="display:block;margin-bottom:5px;font-weight:600">🏦 কোন ব্যাংক কার্ডে রাখবেন / ব্যবহার করবেন নির্বাচন করুন:</span><div style="display:flex;flex-wrap:wrap;gap:5px">${choices.map(c => `<button type="button" class="secondary sm" style="margin:0;padding:3px 9px;font-size:11.5px" data-pick-bank="${esc(c.walletKey)}">${esc(c.label)}</button>`).join('')}</div></div>`;
  wrap.querySelectorAll('button[data-pick-bank]').forEach(btn => {
    btn.onclick = () => {
      const val = btn.getAttribute('data-pick-bank');
      if (val && [...sel.options].some(o => o.value === val)) sel.value = val;
      wrap.style.display = 'none';
      wrap.innerHTML = '';
    };
  });
};

document.querySelectorAll('.side-menu button[data-tab]').forEach(b => b.onclick = () => {
  if (isTabHiddenForCurrentUser(b.dataset.tab)) {
    return toast('🔒 সুপার অ্যাডমিন আপনার রোলের জন্য এই মেনুটি বন্ধ রেখেছেন।', 'warn');
  }
  const prevSec = document.querySelector('main section.active')?.id;
  if (prevSec && prevSec !== b.dataset.tab) resetSectionForms(prevSec);
  resetSectionForms(b.dataset.tab);
  document.querySelectorAll('.side-menu button[data-tab]').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('main section').forEach(s => s.classList.toggle('active', s.id === b.dataset.tab));
  const parentFolder = b.closest('.nav-folder');
  document.querySelectorAll('.side-menu .nav-folder').forEach(f => {
    f.classList.toggle('open', parentFolder ? f === parentFolder : false);
  });
  syncNavFolderActive();
  toggleMobileMenu(false); render();
  if (b.dataset.tab === 'adminPanel') switchAdminSubTab(isSuperAdmin() ? 'users' : 'help');
  if (b.dataset.tab === 'graphicsHub') { if (typeof renderGfxPoster === 'function') renderGfxPoster(); renderGraphicsOrders(); }
  if (b.dataset.tab === 'monthly') renderMonthlyReport();
  if (b.dataset.tab === 'newsFeed') { if (typeof renderNewsFeed === 'function') renderNewsFeed(); if (typeof loadCommunityState === 'function') loadCommunityState(false); }
  if (b.dataset.tab === 'liveChat') { refreshOnlineChat(); if (typeof renderTeamVoicePeers === 'function') renderTeamVoicePeers(); }
});
window.goToSection = tabName => {
  if (isTabHiddenForCurrentUser(tabName)) return toast('🔒 এই সেকশনটির অ্যাক্সেস সীমিত করা আছে।', 'warn');
  const btn = document.querySelector(`.side-menu button[data-tab="${tabName}"]`); if (btn) btn.click();
};
document.querySelectorAll('[data-settings-panel]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-settings-panel]').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.settings-panel').forEach(p => p.classList.toggle('active', p.id === b.dataset.settingsPanel));
  if ($('usernameForm')) $('usernameForm').reset();
  if ($('settingsPasswordForm')) $('settingsPasswordForm').reset();
  if ($('usernameMsg')) $('usernameMsg').textContent = '';
  if ($('settingsPasswordMsg')) $('settingsPasswordMsg').textContent = '';
  ['userChangePass', 'newUsername', 'settingsOldPass', 'settingsNewPass', 'settingsNewPass2'].forEach(id => {
    if ($(id)) { $(id).value = ''; rearmNoAutofill($(id)); }
  });
  if (activeAccount && (b.dataset.settingsPanel === 'profilePanel' || b.dataset.settingsPanel === 'agencyPanel')) {
    updateHeaderAndProfile();
  }
}));

// Selects
function fillSelect(id, items, placeholder, display = x => x.name) {
  const el = $(id); if (!el) return; const old = el.value;
  el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') + items.map(x => `<option value="${x.id}">${esc(display(x))}</option>`).join('');
  if (items.some(x => x.id === old)) el.value = old;
}
function refreshWalletSelects() {
  const baseList = db.wallets?.length ? db.wallets : DEFAULT_WALLETS;
  const bankChoiceKeys = linkedBankChoices().map(x => x.walletKey);
  const list = [...new Set([...baseList, ...bankChoiceKeys])];
  const bankSet = new Set(bankChoiceKeys);
  const buildOptsHtml = opts => {
    const reg = opts.filter(w => !bankSet.has(w));
    const banks = opts.filter(w => bankSet.has(w));
    const regHtml = reg.map(w => `<option value="${esc(w)}">${esc(w)}</option>`).join('');
    const bankHtml = banks.length ? `<optgroup label="🏦 ব্যাংক কার্ড (Cards থেকে লিংকড)">${banks.map(w => `<option value="${esc(w)}">${esc(w)}</option>`).join('')}</optgroup>` : '';
    return regHtml + bankHtml;
  };
  ['pMethod','epMethod','expMethod','eeMethod','depositMethod','edMethod','caMethod','trdMethod','cardRentMethod','cardRentActMethod','rbMethod','wtFrom','wtTo'].forEach(id => {
    const el = $(id); if (!el) return; const old = el.value, opts = old && !list.includes(old) ? [...list, old] : list;
    el.innerHTML = buildOptsHtml(opts);
    if (old && opts.includes(old)) el.value = old;
    else if ((id.includes('deposit') || id === 'wtTo') && opts.includes('Bank')) el.value = 'Bank';
    else if ((id.includes('exp') || id.includes('ca') || id === 'trdMethod' || id === 'cardRentMethod' || id === 'cardRentActMethod' || id === 'rbMethod' || id === 'wtFrom') && list.includes('Cash')) el.value = 'Cash';
  });
  if ($('payMethodFilter')) { const oldF = $('payMethodFilter').value; $('payMethodFilter').innerHTML = `<option value="">সব ওয়ালেট ও ব্যাংক কার্ড</option>` + buildOptsHtml(list); if (oldF && list.includes(oldF)) $('payMethodFilter').value = oldF; }
  [['pMethod', 'pBankQuickWrap'], ['depositMethod', 'depositBankQuickWrap'], ['expMethod', 'expBankQuickWrap'], ['caMethod', 'caBankQuickWrap']].forEach(([s, w]) => syncBankQuickPicker(s, w));
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
  ['wCard','ewCard','aaCard','eaaCard','trFromCard','trToCard','rfCard','csvImpCard','cardRentCard'].forEach(id => fillSelect(id, db.cards, 'কার্ড নির্বাচন'));
  const activeAdAccounts = (db.adAccounts || []).filter(a => (a.status || 'Active') === 'Active');
  ['wAdAccount', 'ewAdAccount', 'csvImpAdAccount'].forEach(id => fillSelect(id, activeAdAccounts, L('অ্যাড অ্যাকাউন্ট নির্বাচন (ঐচ্ছিক)', 'Select Ad Account (Optional)'), a => `[${a.platform || 'Meta'}] ${a.name}${a.adId ? ` (${a.adId})` : ''}`));
  fillSelect('workAdAccountFilter', db.adAccounts, L('সব অ্যাড অ্যাকাউন্ট', 'All Ad Accounts'), a => `[${a.platform || 'Meta'}] ${a.name}${a.adId ? ` (${a.adId})` : ''}${(a.status || 'Active') !== 'Active' ? ` [${a.status}]` : ''}`);
  fillSelect('trdCard', db.cards, 'কার্ড নেই (বাইরের উৎস)');
  fillSelect('depositCard', db.cards, db.cards.length ? '' : 'প্রথমে কার্ড যোগ করুন');
  ['pageCustomer','qpCustomer','wCustomer','ewCustomer','pCustomer','epCustomer','rlCustomer','csvImpCustomer','stmtCustomer','crCustomer','agreeCustomer','goCustomer','csrCustomer'].forEach(id => fillSelect(id, db.customers, L('কাস্টমার নির্বাচন', 'Select Customer')));
  fillSelect('calCustomer', db.customers, L('সর্বসাধারণ / এজেন্সি', 'General / Agency'));
  fillSelect('gfxPosterCust', db.customers, L('জেনারেল / এজেন্সি নিজের পোস্টার', 'Agency / General Poster'));
  fillSelect('qtCustomer', db.customers, 'নতুন ইনকোয়ারি / নিচে নাম লিখুন');
  fillSelect('tkCustomer', db.customers, L('সাধারণ / কোনো কাস্টমার নয়', 'General / No Customer'));
  fillSelect('workCustomerFilter', db.customers, L('সব কাস্টমার', 'All Customers'));
  fillSelect('crFilterCust', db.customers, L('সব কাস্টমার', 'All Customers'));
  refreshWalletSelects(); fillStaffSelect('wStaff'); fillStaffSelect('ewStaff'); fillStaffSelect('tkAssignee'); fillStaffSelect('goDesigner'); fillStaffSelect('hrStaffSelect'); updatePages();
  if (typeof renderBrandKitsSelect === 'function') renderBrandKitsSelect();
  if ($('leadOpenBadge')) {
    const openLeads = (db.leads || []).filter(l => !['won', 'lost'].includes(l.stage)).length;
    $('leadOpenBadge').style.display = openLeads > 0 ? 'inline-block' : 'none';
    $('leadOpenBadge').textContent = openLeads;
  }
}
function updatePages() {
  const wc = $('wCustomer'), wp = $('wPage'); if (!wc || !wp) return;
  const cid = wc.value, filtered = db.pages.filter(p => !cid || p.customerId === cid);
  fillSelect('wPage', filtered, filtered.length ? L('পেজ / চ্যানেল নির্বাচন (ঐচ্ছিক)', 'Select Page / Channel (Optional)') : L('কোনো অ্যাসেট নেই (ঐচ্ছিক)', 'No Assets (Optional)'), p => `[${p.platform || 'Meta'}] ${p.name} — ${cname(p.customerId)}`);
  if (cid && filtered.length === 1 && !wp.value) wp.value = filtered[0].id;
}
function updateEditWorkPages() { const wc = $('ewCustomer'); if (!wc) return; fillSelect('ewPage', db.pages.filter(p => !wc.value || p.customerId === wc.value), L('পেজ / চ্যানেল নির্বাচন (ঐচ্ছিক)', 'Select Page / Channel (Optional)'), p => `[${p.platform || 'Meta'}] ${p.name} — ${cname(p.customerId)}`); }
function syncVatBtnState() {
  const btn = $('wVat15Btn'), fEl = $('wFeePct'); if (!btn || !fEl) return;
  const is15 = Math.abs(num(fEl.value) - 15) < 0.01;
  btn.classList.toggle('btn-active', is15);
  btn.style.background = is15 ? '#059669' : '';
  btn.style.color = is15 ? '#fff' : '';
  btn.textContent = is15 ? '✓ 15% VAT' : '15% VAT';
}
window.toggleWorkVat15 = () => {
  const fEl = $('wFeePct'); if (!fEl) return;
  const cur = num(fEl.value), def = num(db.agency?.defaultFeePct) || 0;
  fEl.value = Math.abs(cur - 15) < 0.01 ? (Math.abs(def - 15) < 0.01 ? 0 : def) : 15;
  syncVatBtnState(); updateWorkPreview();
};
function applyAutoWorkRate() {
  const wRateEl = $('wRate'); if (!wRateEl || wRateEl.dataset.manualEdit === '1') return;
  const usdHint = num($('wActualDollar')?.value) || num($('wDollar')?.value);
  const r = effectiveRateFor($('wCustomer')?.value || '', $('wDate')?.value || today(), usdHint);
  if (r) wRateEl.value = r;
}
if ($('wRate')) $('wRate').addEventListener('input', () => { $('wRate').dataset.manualEdit = '1'; });
if ($('wCustomer')) $('wCustomer').onchange = () => {
  updatePages();
  if ($('wRate')) delete $('wRate').dataset.manualEdit;
  applyAutoWorkRate();
  updateWorkPreview();
};
if ($('ewCustomer')) $('ewCustomer').onchange = updateEditWorkPages;
if ($('wPage')) $('wPage').onchange = () => { const pg = db.pages.find(p => p.id === $('wPage').value); if (pg?.platform && $('wPlatform')) $('wPlatform').value = pg.platform; };

window.openQuickCustomerModal = () => { $('quickCustomerForm')?.reset(); $('quickCustomerModal').style.display = 'flex'; setTimeout(() => $('qcName')?.focus(), 50); };
if ($('quickCustomerForm')) $('quickCustomerForm').onsubmit = e => {
  e.preventDefault(); const id = uid(), name = $('qcName').value.trim(), customRate = num($('qcCustomRate')?.value);
  db.customers.push({ id, createdAt: Date.now(), updatedAt: Date.now(), portalToken: uid().slice(-6), name, phone: $('qcPhone').value.trim(), retainer: num($('qcRetainer').value), customRate, dueLimit: 0, stage: 'Active Client', followUpDate: '', checklist: DEFAULT_CHECKLIST(), note: '' });
  save(); logActivity(`কুইক কাস্টমার: ${name}`); if ($('wCustomer')) { $('wCustomer').value = id; updatePages(); }
  if (customRate > 0 && $('wRate')) { $('wRate').value = customRate; delete $('wRate').dataset.manualEdit; updateWorkPreview(); }
  closeModal('quickCustomerModal'); toast(`${name} ` + L('যুক্ত ও নির্বাচিত হয়েছে!', 'added & selected!'));
};
window.openQuickPageModal = () => {
  $('quickPageForm')?.reset(); fillSelect('qpCustomer', db.customers, L('কাস্টমার নির্বাচন', 'Select Customer'));
  if ($('wCustomer')?.value && $('qpCustomer')) $('qpCustomer').value = $('wCustomer').value;
  if ($('wPlatform')?.value && $('qpPlatform')) $('qpPlatform').value = $('wPlatform').value;
  $('quickPageModal').style.display = 'flex'; setTimeout(() => $('qpName')?.focus(), 50);
};
if ($('quickPageForm')) $('quickPageForm').onsubmit = e => {
  e.preventDefault(); const id = uid(), custId = $('qpCustomer').value, name = $('qpName').value.trim(), platform = $('qpPlatform')?.value || 'Meta';
  db.pages.push({ id, updatedAt: Date.now(), customerId: custId, platform, name, link: $('qpLink').value.trim(), adId: $('qpAdId').value.trim(), pixelId: $('qpPixelId').value.trim() });
  save(); logActivity(`কুইক অ্যাসেট (${platform}): ${name}`); if ($('wCustomer')) $('wCustomer').value = custId; updatePages(); if ($('wPage')) $('wPage').value = id;
  closeModal('quickPageModal'); toast(`${name} ` + L('যুক্ত ও নির্বাচিত হয়েছে!', 'added & selected!'));
};

function updatePaymentCustomerStatus() {
  const el = $('pCustomerStatus'), cid = $('pCustomer')?.value; if (!el) return;
  if (!cid) { el.innerHTML = ''; return; }
  const bal = clientBalance(cid);
  el.innerHTML = bal < 0 ? `<span class="bad">${L('বর্তমান বকেয়া', 'Current Due')}: ${money(-bal)}</span> <button type="button" class="secondary sm" onclick="$('pAmount').value='${(-bal).toFixed(2)}'">${L('পুরো বকেয়া বসান', 'Fill Full Due')}</button>` : (bal > 0 ? `<span class="good">${L('অ্যাডভান্স জমা', 'Advance Balance')}: ${money(bal)}</span>` : `<span class="muted">${L('কোনো বকেয়া নেই (৳0.00)', 'No Dues (৳0.00)')}</span>`);
}
if ($('pCustomer')) $('pCustomer').onchange = updatePaymentCustomerStatus;

['rateDate','wDate','pDate','expDate','depositDate','trDate','rfDate','caDate','trdDate','cardRentDate','qtDate','rlDate','csvImpDate','dcDate','wtDate','tkDueDate','goDate','goDeadline'].forEach(id => { if ($(id)) $(id).value = today(); });
if ($('cardRentRate') && !$('cardRentRate').value) $('cardRentRate').value = rateFor(today()) || num(db.agency?.defaultRate) || 125;
if ($('wDate')) $('wDate').onchange = () => { applyAutoWorkRate(); updateWorkPreview(); };
if ($('wDollar')) $('wDollar').addEventListener('input', () => { applyAutoWorkRate(); updateWorkPreview(); });
if ($('wActualDollar')) $('wActualDollar').addEventListener('input', () => { applyAutoWorkRate(); updateWorkPreview(); });
if ($('wCard')) $('wCard').onchange = () => {
  const cid = $('wCard').value, avg = cardAvgRate(cid), cardObj = db.cards.find(x => x.id === cid);
  if (avg > 0 && $('wActualRate')) $('wActualRate').value = avg;
  if ($('wFeePct')) $('wFeePct').value = cardObj?.vat15 ? 15 : (num(db.agency?.defaultFeePct) || 0);
  syncVatBtnState(); updateWorkPreview();
};
if ($('ewCard')) $('ewCard').onchange = () => {
  const cid = $('ewCard').value, avg = cardAvgRate(cid), cardObj = db.cards.find(x => x.id === cid);
  if (avg > 0 && $('ewActualRate')) $('ewActualRate').value = avg;
  if ($('ewFeePct')) $('ewFeePct').value = cardObj?.vat15 ? 15 : (num(db.agency?.defaultFeePct) || 0);
  updateEditWorkPreview();
};
if ($('wAdAccount')) $('wAdAccount').onchange = () => {
  const a = (db.adAccounts || []).find(x => x.id === $('wAdAccount').value); if (!a) return;
  if (a.platform && $('wPlatform') && AD_PLATFORMS.includes(a.platform)) $('wPlatform').value = a.platform;
  if (!isStaff() && a.cardId && $('wCard')) { $('wCard').value = a.cardId; $('wCard').onchange(); }
};
if ($('ewAdAccount')) $('ewAdAccount').onchange = () => {
  const a = (db.adAccounts || []).find(x => x.id === $('ewAdAccount').value); if (!a) return;
  if (a.platform && $('ewPlatform') && AD_PLATFORMS.includes(a.platform)) $('ewPlatform').value = a.platform;
  if (!isStaff() && a.cardId && $('ewCard')) { $('ewCard').value = a.cardId; $('ewCard').onchange(); }
};
if ($('csvImpAdAccount')) $('csvImpAdAccount').onchange = () => {
  const a = (db.adAccounts || []).find(x => x.id === $('csvImpAdAccount').value); if (!a) return;
  if (a.platform && $('csvImpPlatform') && AD_PLATFORMS.includes(a.platform)) $('csvImpPlatform').value = a.platform;
  if (!isStaff() && a.cardId && $('csvImpCard')) $('csvImpCard').value = a.cardId;
};

function updateWorkPreview() {
  const date = $('wDate')?.value || today(), cid = $('wCustomer')?.value || '', actualDol = num($('wActualDollar')?.value), rate = num($('wRate')?.value) || effectiveRateFor(cid, date, actualDol || num($('wDollar')?.value));
  const cust = cid ? db.customers.find(x => x.id === cid) : null;
  const sFee = num($('wServiceFee')?.value), sType = $('wServiceFeeType')?.value || 'fixed', disc = num($('wDiscount')?.value), taxPct = num($('wTaxPct')?.value);
  const actRate = num($('wActualRate')?.value), feePct = num($('wFeePct')?.value), other = num($('wOther')?.value), cardId = $('wCard')?.value || '';
  const baseB = actualDol * rate, svc = sFee ? (sType === 'pct' ? baseB * (sFee / 100) : sFee) : 0;
  const sub = Math.max(0, baseB + svc - disc), taxAmt = sub * (taxPct / 100), b = sub + taxAmt;
  const base = actualDol * actRate, fee = base * (feePct / 100), act = base + fee, pr = b - act - other;
  let warnHtml = '';
  if (cust) {
    const cBal = clientBalance(cust.id), lowLim = cust.lowAdvLimit === undefined ? 1000 : num(cust.lowAdvLimit);
    if (cBal > 0) {
      const remAfter = cBal - b;
      const postCls = remAfter < 0 ? 'badge-danger' : (lowLim > 0 && remAfter < lowLim ? 'badge-warn' : 'badge-success');
      const postTxt = b > 0 ? (remAfter >= 0 ? `${L('অটো-ডিডাক্টের পর বাকি', 'After Deduct')}: ${money(remAfter)}` : `${L('ওয়ালেট ঘাটতি / বকেয়া', 'Wallet Deficit / Due')}: ${money(-remAfter)}`) : `${L('প্রিপেইড ওয়ালেট', 'Prepaid Wallet')}: ${money(cBal)}`;
      warnHtml += ` <span class="${postCls}">💼 ${postTxt}</span>`;
    } else if (cBal < 0) {
      warnHtml += ` <span class="badge-danger">${L('বকেয়া', 'Due')}: ${money(-cBal)}</span>`;
    }
    if (num(cust.customRate) > 0) warnHtml += ` <span class="badge-admin">⭐ ${L('কাস্টম রেট', 'Custom Rate')}: ${money(cust.customRate)}</span>`;
  }
  if (!isStaff() && actualDol > 0 && actRate > 0 && pr < 0) warnHtml += ` <span class="badge-danger">⚠️ ${L('লস হচ্ছে!', 'Loss Alert!')}</span>`;
  if (!isStaff() && cardId) {
    const cBalUsd = getCardStats(cardId).balance;
    if (actualDol > 0 && cBalUsd < actualDol) warnHtml += ` <span class="badge-warn">⚠️ ${L('কার্ড ব্যালেন্স কম', 'Low Card Bal')}: ${usd(cBalUsd)}</span>`;
    else warnHtml += ` <span class="badge-admin">💳 ${usd(cBalUsd)}</span>`;
  }
  const extraParts = [svc ? `${L('চার্জ', 'Fee')}: +${money(svc)}` : '', disc ? `${L('ডিসকাউন্ট', 'Disc')}: -${money(disc)}` : '', taxAmt ? `VAT(${taxPct}%): +${money(taxAmt)}` : ''].filter(Boolean).join(', ');
  if ($('preview')) $('preview').innerHTML = isStaff() ? `${L('বিল', 'Bill')}: ${money(b)}${extraParts ? ` (${extraParts})` : ''}${warnHtml}` : `${L('মোট বিল', 'Total Bill')}: ${money(b)}${extraParts ? ` (${extraParts})` : ''} · ${L('খরচ', 'Cost')}: ${money(base)} + ${L('ফি', 'Fee')} (${feePct}%): ${money(fee)} = ${money(act)} · ${L('লাভ', 'Profit')}: <strong style="color:${pr >= 0 ? '#059669' : '#dc2626'}">${money(pr)}</strong>${warnHtml}`;
  syncVatBtnState();
}
['wDate','wActualDollar','wRate','wServiceFee','wServiceFeeType','wDiscount','wTaxPct','wActualRate','wFeePct','wOther'].forEach(id => { if ($(id)) { $(id).addEventListener('input', updateWorkPreview); $(id).addEventListener('change', updateWorkPreview); } });
function updateEditWorkPreview() {
  const actualDol = num($('ewActualDollar')?.value), rate = num($('ewRate')?.value), sFee = num($('ewServiceFee')?.value), sType = $('ewServiceFeeType')?.value || 'fixed', disc = num($('ewDiscount')?.value), taxPct = num($('ewTaxPct')?.value), actRate = num($('ewActualRate')?.value), feePct = num($('ewFeePct')?.value), other = num($('ewOther')?.value);
  const baseB = actualDol * rate, svc = sFee ? (sType === 'pct' ? baseB * (sFee / 100) : sFee) : 0, sub = Math.max(0, baseB + svc - disc), b = sub + sub * (taxPct / 100), base = actualDol * actRate, fee = base * (feePct / 100), act = base + fee, pr = b - act - other;
  const warn = (!isStaff() && actualDol > 0 && actRate > 0 && pr < 0) ? ` <span class="badge-danger">⚠️ ${L('লস হচ্ছে!', 'Loss!')}</span>` : '';
  if ($('ewPreview')) $('ewPreview').innerHTML = isStaff() ? `${L('মোট বিল', 'Total Bill')}: <strong>${money(b)}</strong>` : `${L('মোট বিল', 'Total Bill')}: <strong>${money(b)}</strong> · ${L('প্রকৃত খরচ', 'Actual Cost')}: ${money(act)} · ${L('লাভ', 'Profit')}: <strong style="color:${pr >= 0 ? '#059669' : '#dc2626'}">${money(pr)}</strong>${warn}`;
}
['ewActualDollar','ewRate','ewServiceFee','ewServiceFeeType','ewDiscount','ewTaxPct','ewActualRate','ewFeePct','ewOther'].forEach(id => { if ($(id)) { $(id).oninput = updateEditWorkPreview; $(id).onchange = updateEditWorkPreview; } });
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
window.clearAllHelpRequests = async () => { if (!(await askConfirm('সব হেল্প মেসেজ মুছবেন?'))) return; writeHelpRequests([]); renderAdminPanel(); updateNotifications(); toast('ইনবক্স পরিষ্কার হয়েছে', 'warn'); };
window.quickTempResetFromHelp = async reqId => {
  if (!isSuperAdmin()) return; const arr = readHelpRequests(), h = arr.find(x => x.id === reqId); if (!h) return;
  const q = String(h.contact || '').replace(/^@/, '').trim().toLowerCase(), accounts = readLocalAccounts();
  let acc = accounts.find(a => [a.username, a.phone, a.email].some(v => String(v || '').toLowerCase() === q));
  if (!acc) { const u = await askPrompt(`ইউজারনেম দিন (প্রেরক: ${h.name})`, q, 'ইউজার খুঁজুন'); if (!u) return; acc = accounts.find(a => a.username === u.trim().toLowerCase()); }
  if (!acc) return toast('ইউজার পাওয়া যায়নি!', 'error');
  const tmpPass = String(Math.floor(100000 + Math.random() * 900000));
  acc.password = hashPass(tmpPass); acc.status = 'active'; acc.updatedAt = Date.now(); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts));
  h.status = 'resolved'; writeHelpRequests(arr); triggerAccountCloudSync(); renderAdminPanel();
  copyText(`ইউজারনেম: ${acc.username} | অস্থায়ী পাসওয়ার্ড: ${tmpPass}`, 'টেম্প পাসওয়ার্ড');
  const wa = normalizeBdPhone(acc.phone || h.contact);
  if (wa.length >= 11 && await askConfirm(`নতুন পাসওয়ার্ড (${tmpPass}) কপি হয়েছে! WhatsApp-এ পাঠাবেন?`, 'WhatsApp শেয়ার')) openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${acc.name}, আপনার পাসওয়ার্ড রিসেট করা হয়েছে।\nইউজারনেম: ${acc.username}\nঅস্থায়ী পাসওয়ার্ড: ${tmpPass}`)}`);
};

window.loadPortalOrders = async (manual = false) => {
  const cfg = readCloudSync(), clean = String(cfg.url || '').trim().replace(/\/+$/, '');
  if (!clean || !navigator.onLine) return;
  const authQ = cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '';
  try {
    const [rOrd, rPay] = await Promise.all([
      fetch(`${clean}/ads_hisab_portal_orders.json${authQ}`).catch(() => null),
      fetch(`${clean}/ads_hisab_portal_payments.json${authQ}`).catch(() => null)
    ]);
    if (rOrd?.ok) { const dO = await rOrd.json(); portalOrders = dO && typeof dO === 'object' ? Object.entries(dO).map(([k, v]) => ({ key: k, ...v })).reverse() : []; }
    if (rPay?.ok) { const dP = await rPay.json(); portalPayments = dP && typeof dP === 'object' ? Object.entries(dP).map(([k, v]) => ({ key: k, ...v })).reverse() : []; }
    renderPortalOrders(); renderPortalPayments(); updateNotifications();
    if (manual) toast(L('পোর্টাল অর্ডার ও পেমেন্ট রিফ্রেশ হয়েছে!', 'Portal orders & payments refreshed!'));
  } catch (e) {}
};
function renderPortalOrders() {
  if (!$('portalOrderRows')) return;
  $('portalOrderRows').innerHTML = portalOrders.map(o => `<tr><td><small>${esc(o.time || '')}</small></td><td><strong>${esc(o.customerName)}</strong><br><small class="muted">${esc(o.phone || '')}</small></td><td>${platformBadge(o.platform)} <strong>${esc(o.campName)}</strong><br><small>${usd(o.budget)} · ${num(o.days)} ${L('দিন', 'days')}</small></td><td style="max-width:220px;white-space:normal">${esc(o.note || '—')}</td><td><button type="button" class="sm" style="background:#059669" onclick="convertPortalOrderToWork('${esc(o.key)}')">⚡ ${L('কাজে রূপান্তর', 'To Campaign')}</button><button type="button" class="danger sm" onclick="deletePortalOrder('${esc(o.key)}')">${L('মুছুন', 'Del')}</button></td></tr>`).join('') || `<tr><td colspan="5">${L('পোর্টাল থেকে কোনো অর্ডার আসেনি', 'No portal orders')}</td></tr>`;
}
function renderPortalPayments() {
  if (!$('portalPaymentRows')) return;
  $('portalPaymentRows').innerHTML = portalPayments.map(p => `<tr><td><small>${esc(p.time || '')}</small></td><td><strong>${esc(p.customerName || cname(p.customerId))}</strong><br><small class="muted">${esc(p.phone || '')}</small></td><td><strong class="good">${money(p.amount)}</strong><br><span class="badge-admin">${esc(p.method || 'bKash')}</span></td><td><code>${esc(p.trxId || '—')}</code>${p.note ? `<br><small class="muted">${esc(p.note)}</small>` : ''}${p.screenshotData ? `<br><img src="${esc(p.screenshotData)}" alt="Slip" style="width:68px;height:44px;object-fit:cover;border-radius:6px;border:1px solid var(--line);margin-top:4px;cursor:pointer" onclick="openLightbox('${esc(p.screenshotData).replace(/'/g, "\\'")}')"> <span class="badge-success" style="font-size:10px">🖼️ প্রুফ</span>` : ''}</td><td><button type="button" class="sm perm-pay" style="background:#059669" onclick="approvePortalPayment('${esc(p.key)}')">✓ ${L('গ্রহণ ও জমা', 'Approve')}</button><button type="button" class="danger sm" onclick="deletePortalPayment('${esc(p.key)}')">✕</button></td></tr>`).join('') || `<tr><td colspan="5">${L('পোর্টাল থেকে কোনো পেমেন্ট ক্লেইম আসেনি', 'No portal payment claims')}</td></tr>`;
}
window.approvePortalPayment = async key => {
  if (!hasPerm('canPayments')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  const p = portalPayments.find(x => x.key === key); if (!p) return;
  let cid = p.customerId;
  if (!cid || !db.customers.some(c => c.id === cid)) {
    const match = db.customers.find(c => c.name.toLowerCase() === String(p.customerName || '').trim().toLowerCase());
    cid = match?.id || '';
  }
  if (!cid) return toast(L('কাস্টমার পাওয়া যায়নি—পেমেন্ট সেকশন থেকে ম্যানুয়ালি যোগ করুন', 'Customer not found — add manually in Payments'), 'error');
  db.payments.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), approvalStatus: 'approved', date: today(), customerId: cid, amount: num(p.amount), method: p.method || 'bKash', fee: 0, ref: p.trxId || 'Portal TrxID', note: p.note || 'Client Portal TrxID Verified' });
  const cfg = readCloudSync(), clean = String(cfg.url || '').trim().replace(/\/+$/, '');
  if (clean) {
    try { await fetch(`${clean}/ads_hisab_portal_payments/${encodeURIComponent(key)}.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : ''), { method: 'DELETE' }); } catch (e) {}
  }
  portalPayments = portalPayments.filter(x => x.key !== key);
  save(); logActivity(`পোর্টাল পেমেন্ট অনুমোদন: ${p.customerName} (${money(p.amount)})`); renderPortalPayments(); renderAdminPanel();
  const cust = db.customers.find(x => x.id === cid);
  if (clean && cust?.portalToken) {
    const pk = `${cust.id}_${cust.portalToken}`;
    const ep = `${clean}/ads_hisab_portals/${encodeURIComponent(pk)}.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '');
    try { await fetch(ep, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildClientPortalPayload(cust)) }); } catch (e) {}
  }
  toast(L('পেমেন্ট অনুমোদিত, কাস্টমারের হিসাবে জমা ও পোর্টাল ব্যালেন্স আপডেট হয়েছে!', 'Payment approved & portal balance refreshed!'));
  const wa = normalizeBdPhone(cust?.phone || p.phone);
  if (wa.length >= 11 && await askConfirm(L(`${cust?.name || p.customerName}-কে WhatsApp-এ পেমেন্ট প্রাপ্তির ধন্যবাদ মেসেজ পাঠাবেন?`, `Send WhatsApp payment thank-you to ${cust?.name || p.customerName}?`))) {
    const bal = clientBalance(cid);
    const balLine = bal < 0 ? `বর্তমান বকেয়া: ${money(-bal)}` : (bal > 0 ? `অ্যাডভান্স ব্যালেন্স: ${money(bal)}` : `হিসাব সম্পূর্ণ সমন্বিত (৳0)`);
    const msg = `আসসালামু আলাইকুম ${cust?.name || p.customerName},\nআপনার ${money(p.amount)} (${p.method || 'bKash'}${p.trxId ? `, TrxID: ${p.trxId}` : ''}) পেমেন্টটি সফলভাবে গ্রহণ ও হিসাবে জমা করা হয়েছে ✅\n${balLine}\n\nধন্যবাদ!\n— ${db.agency?.name || 'Ads হিসাব ম্যানেজার'}`;
    openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`);
  }
};
window.deletePortalPayment = async key => {
  if (!(await askConfirm(L('এই পোর্টাল পেমেন্ট ক্লেইমটি মুছে ফেলবেন?', 'Delete this portal payment claim?')))) return;
  const cfg = readCloudSync(), clean = String(cfg.url || '').trim().replace(/\/+$/, '');
  if (clean) { try { await fetch(`${clean}/ads_hisab_portal_payments/${encodeURIComponent(key)}.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : ''), { method: 'DELETE' }); } catch (e) {} }
  portalPayments = portalPayments.filter(x => x.key !== key); renderPortalPayments(); updateNotifications(); toast(L('মুছে ফেলা হয়েছে', 'Deleted'), 'warn');
};
window.convertPortalOrderToWork = key => {
  const o = portalOrders.find(x => x.key === key); if (!o) return;
  goToSection('works');
  if ($('wPlatform')) $('wPlatform').value = AD_PLATFORMS.includes(o.platform) ? o.platform : 'Meta';
  $('wCustomer').value = o.customerId || ''; updatePages();
  $('wName').value = o.campName || 'Client Portal Order'; $('wDays').value = num(o.days) || 7;
  $('wDollar').value = num(o.budget) || 0; $('wRate').value = effectiveRateFor(o.customerId, today()) || num(db.agency?.defaultRate) || 125;
  $('wNote').value = o.note || 'From Client Portal'; updateWorkPreview();
  toast(L('পোর্টাল অর্ডার কাজের ফর্মে বসানো হয়েছে — যাচাই করে সেভ করুন!', 'Portal order loaded into form — review and save!'));
};
window.deletePortalOrder = async key => {
  if (!(await askConfirm('এই অর্ডার রিকোয়েস্ট মুছে ফেলবেন?'))) return;
  const cfg = readCloudSync(), clean = String(cfg.url || '').trim().replace(/\/+$/, '');
  if (clean) { try { await fetch(`${clean}/ads_hisab_portal_orders/${encodeURIComponent(key)}.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : ''), { method: 'DELETE' }); } catch (e) {} }
  portalOrders = portalOrders.filter(x => x.key !== key); renderPortalOrders(); updateNotifications(); toast('অর্ডার মুছে ফেলা হয়েছে', 'warn');
};

// Auth System
const readLocalAccounts = () => { try { return JSON.parse(localStorage.getItem(ACCOUNTSKEY) || '[]'); } catch (e) { return []; } };
function activateAccountData(account) { if (!account.id) account.id = 'legacy-super-admin'; KEY = (account.id === 'legacy-super-admin' || account.role === 'staff') ? MASTER_DB_KEY : ('ads_hisab_user_data_v72_' + account.id); PROFILEKEY = 'ads_hisab_user_profile_v72_' + account.id; loadDb(); }
let sessionLoginTs = Date.now();
function enterLoggedInUI(account, skipLog = false) {
  sessionLoginTs = Date.now();
  realSuperAdmin = null; if ($('impersonateBanner')) $('impersonateBanner').style.display = 'none';
  activeAccount = account; try { sessionStorage.setItem(SESSION_ACC_KEY, JSON.stringify(account)); } catch (e) {}
  applyPermissionClasses(); activateAccountData(account); if (!skipLog) logActivity('লগইন করেছেন');
  clearAuthForms(); resetAllTransientForms();
  if ($('authOverlay')) $('authOverlay').style.display = 'none';
  if ($('adminTab')) $('adminTab').style.display = (account.role === 'super_admin' || account.role === 'admin' || account.id === 'legacy-super-admin') ? 'flex' : 'none';
  updateHeaderAndProfile(); applyGlobalNotice();
  if ($('wRate')) { delete $('wRate').dataset.manualEdit; $('wRate').value = rateFor(today()) || ''; }
  if ($('qtRate')) { delete $('qtRate').dataset.manualEdit; $('qtRate').value = rateFor(today()) || ''; }
  if ($('wFeePct')) $('wFeePct').value = num(db.agency?.defaultFeePct) || 0;
  goToSection('dash'); updateWorkPreview(); updateQuotePreview(); if (typeof refreshOnlineChat === 'function') refreshOnlineChat();
  if (typeof renderGfxPoster === 'function') renderGfxPoster();
  const cfg = readCloudSync();
  setSyncUi(!cfg.url ? '' : (localStorage.getItem(LOCAL_DIRTY_KEY) === '1' ? 'err' : 'ok'), !cfg.url ? 'Local' : (localStorage.getItem(LOCAL_DIRTY_KEY) === '1' ? 'Pending Sync' : 'Synced'));
  updateStorageMeter(); loadPortalOrders(false);
  if (serverAuthToken) pullServerWorkspace();
  if (typeof connectTeamRoomSocket === 'function') connectTeamRoomSocket();
  if (typeof loadCommunityState === 'function') loadCommunityState(false);
  if (typeof checkMyWarnings === 'function') checkMyWarnings();
}
window.performLocalLogout = reasonMsg => {
  serverAuthToken = '';
  pendingExpiredSubCreds = null;
  fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' }).catch(() => {});
  if (typeof disconnectTeamRoomSocket === 'function') disconnectTeamRoomSocket();
  if ($('userWarningBanner')) $('userWarningBanner').style.display = 'none';
  if ($('headerPlanBtn')) $('headerPlanBtn').style.display = 'none';
  localStorage.removeItem(REMEMBER_LOGIN_KEY); sessionStorage.removeItem(SESSION_ACC_KEY); activeAccount = null; realSuperAdmin = null;
  if ($('impersonateBanner')) $('impersonateBanner').style.display = 'none';
  document.body.classList.remove('role-staff', 'role-superadmin', 'no-perm-del', 'no-perm-edit', 'no-perm-pay', 'no-perm-exp');
  KEY = MASTER_DB_KEY; loadDb();
  document.querySelectorAll('.side-menu button[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === 'dash'));
  document.querySelectorAll('main section').forEach(s => s.classList.toggle('active', s.id === 'dash'));
  resetAllTransientForms(); clearAuthForms();
  if ($('authOverlay')) $('authOverlay').style.display = 'flex'; if ($('loginFormContainer')) $('loginFormContainer').style.display = 'block'; if ($('registerPanel')) $('registerPanel').style.display = 'none';
  if ($('authMsg')) $('authMsg').textContent = reasonMsg || ''; if ($('adminTab')) $('adminTab').style.display = 'none';
  toast(reasonMsg || 'সফলভাবে লগ আউট হয়েছে', reasonMsg ? 'error' : 'success');
};
let lastActivityTs = Date.now();
const bumpIdleTs = () => { lastActivityTs = Date.now(); };
['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev => document.addEventListener(ev, bumpIdleTs, { passive: true }));
setInterval(() => {
  if (!activeAccount) return;
  if (!isRealSuperAdmin() && isAccountExpired(activeAccount)) {
    const expiredAcc = { ...activeAccount };
    const msg = `আপনার ফ্রি ট্রায়াল / সাবস্ক্রিপশন মেয়াদ (${expiredAcc.expiryDate}) শেষ হওয়ায় অ্যাকাউন্ট অটো-লক হয়েছে 🔒`;
    performLocalLogout(msg);
    openSubscriptionModal({ expiredLock: true, lockMessage: msg, lockedAccount: expiredAcc, previewOnly: true });
    return;
  }
  if (serverAuthToken && isSuperAdmin() && navigator.onLine && typeof loadSubscriptionRequests === 'function') {
    loadSubscriptionRequests(false);
  }
  const mins = num(getRules().idleLockMinutes);
  if (mins > 0 && (Date.now() - lastActivityTs) >= mins * 60000) {
    lastActivityTs = Date.now();
    $('lockScreenBtn')?.click();
    toast(L(`নিষ্ক্রিয় থাকায় ${mins} মিনিট পর অটো স্ক্রিন লক হয়েছে 🔒`, `Auto-locked after ${mins}m inactivity 🔒`), 'warn');
  }
}, 20000);

window.login = async () => {
  const identity = ($('loginUser')?.value || '').trim().toLowerCase(), pass = $('loginPass')?.value || '';
  const rememberMe = Boolean($('rememberMeChk')?.checked);
  if (!identity || !pass) return ($('authMsg') && ($('authMsg').textContent = 'ইউজারনেম ও পাসওয়ার্ড দিন।'));

  // 1) Try central server authentication first
  let serverReachable = false;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ identity, password: pass, rememberMe })
    });
    const cType = res.headers.get('content-type') || '';
    if (cType.includes('application/json')) {
      serverReachable = true;
      const data = await res.json();
      if (data.subscriptionConfig) writeSubscriptionConfig(data.subscriptionConfig);
      if (res.ok && data.ok && data.account && data.token) {
        pendingExpiredSubCreds = null;
        serverAuthToken = data.token;
        if ($('claimAdminPanel')) $('claimAdminPanel').style.display = 'none';
        localStorage.removeItem(REMEMBER_LOGIN_KEY);
        lastActivityTs = Date.now();
        enterLoggedInUI(data.account, false);
        toast(`স্বাগতম, ${readProfile().name || data.account.name}!` + (rememberMe ? ' (লগইন মনে রাখা হয়েছে)' : ''));
        return;
      }
      if (res.status === 403 && data.subscriptionExpired) {
        pendingExpiredSubCreds = { identity, password: pass };
        if ($('loginPass')) { $('loginPass').value = ''; rearmNoAutofill($('loginPass')); }
        if ($('authMsg')) $('authMsg').textContent = data.error || 'সাবস্ক্রিপশন মেয়াদ শেষ — অ্যাকাউন্ট লক!';
        openSubscriptionModal({ expiredLock: true, lockMessage: data.error, lockedAccount: data.account });
        return;
      }
      if (res.status === 409 && data.needsAdminClaim) {
        if ($('claimAdminPanel')) $('claimAdminPanel').style.display = 'block';
        if ($('authMsg')) $('authMsg').textContent = data.error || 'প্রথমবার সুপার অ্যাডমিন পাসওয়ার্ড সেট করুন।';
        return;
      }
      if ($('authMsg')) $('authMsg').textContent = data.error || 'লগইন তথ্য সঠিক নয়।';
      return;
    }
  } catch (_) {}

  // 2) Offline/Static Fallback or legacy local account check (only if central server unreachable)
  const accounts = readLocalAccounts();
  let accIdx = accounts.findIndex(a => [a.username, a.email, a.phone].some(v => String(v || '').trim().toLowerCase() === identity) && checkPass(pass, a.password));
  let account = accIdx !== -1 ? accounts[accIdx] : null;
  if (account && !String(account.password).startsWith('h1_')) { accounts[accIdx].password = hashPass(pass); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); }
  const saPass = localStorage.getItem(PASSKEY);
  if (!serverReachable && !account && identity === 'admin' && saPass && checkPass(pass, saPass)) {
    account = { id: 'legacy-super-admin', username: 'admin', name: 'Super Admin', email: 'admin@example.com', phone: '01700000000', role: 'super_admin', userNumber: 1, status: 'active' };
  }
  if (!account) {
    try {
      const mLogs = JSON.parse(localStorage.getItem(MASTER_DB_KEY) || '{}');
      mLogs.activityLogs = Array.isArray(mLogs.activityLogs) ? mLogs.activityLogs : [];
      mLogs.activityLogs.unshift({ time: new Date().toLocaleString('bn-BD'), text: `⚠️ ব্যর্থ লগইন চেষ্টা (${identity})` });
      mLogs.activityLogs = mLogs.activityLogs.slice(0, 150);
      localStorage.setItem(MASTER_DB_KEY, JSON.stringify(mLogs));
    } catch (e) {}
    return ($('authMsg') && ($('authMsg').textContent = 'লগইন তথ্য সঠিক নয়।'));
  }
  if (account.status === 'suspended') return ($('authMsg') && ($('authMsg').textContent = 'অ্যাকাউন্ট ব্লক (Suspended) করা আছে।'));
  if (account.status === 'pending') return ($('authMsg') && ($('authMsg').textContent = 'আপনার অ্যাকাউন্টটি অ্যাডমিন অনুমোদনের অপেক্ষায় আছে ⏳'));
  if (isAccountExpired(account)) {
    const lockMsg = `আপনার ফ্রি ট্রায়াল / সাবস্ক্রিপশন মেয়াদ (${account.expiryDate}) শেষ হওয়ায় অ্যাকাউন্ট অটো-লক হয়েছে 🔒`;
    pendingExpiredSubCreds = { identity, password: pass };
    if ($('loginPass')) { $('loginPass').value = ''; rearmNoAutofill($('loginPass')); }
    if ($('authMsg')) $('authMsg').textContent = lockMsg;
    openSubscriptionModal({ expiredLock: true, lockMessage: lockMsg, lockedAccount: account });
    return;
  }
  const nowStr = new Date().toLocaleString('bn-BD');
  if (account.id === 'legacy-super-admin') { const m = readSuperAdminMeta(); m.lastLogin = nowStr; m.loginCount = num(m.loginCount) + 1; writeSuperAdminMeta(m); }
  else if (accIdx !== -1) { accounts[accIdx].lastLogin = nowStr; accounts[accIdx].loginCount = num(accounts[accIdx].loginCount) + 1; localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); account = accounts[accIdx]; }
  pendingExpiredSubCreds = null;
  if (rememberMe && !serverReachable) {
    try { localStorage.setItem(REMEMBER_LOGIN_KEY, encodeRemember({ offlineOnly: true, accountId: account.id, ts: Date.now() })); } catch (e) {}
  } else {
    localStorage.removeItem(REMEMBER_LOGIN_KEY);
  }
  lastActivityTs = Date.now();
  enterLoggedInUI(account, false); toast(`স্বাগতম, ${readProfile().name || account.name}!`);
};
if ($('claimAdminBtn')) $('claimAdminBtn').onclick = async () => {
  const email = ($('claimAdminEmail')?.value || '').trim().toLowerCase() || 'admin@example.com';
  const pass = $('claimAdminPass')?.value || '', pass2 = $('claimAdminPass2')?.value || '';
  const rememberMe = Boolean($('rememberMeChk')?.checked);
  if (pass.length < 6) return ($('authMsg') && ($('authMsg').textContent = 'কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন।'));
  if (pass !== pass2) return ($('authMsg') && ($('authMsg').textContent = 'পাসওয়ার্ড দুটি মিলছে না।'));
  try {
    const res = await fetch('/api/auth/claim-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password: pass, email, rememberMe })
    });
    const data = await res.json();
    if (!res.ok) return ($('authMsg') && ($('authMsg').textContent = data.error || 'সেটআপ ব্যর্থ হয়েছে।'));
    serverAuthToken = data.token;
    if ($('claimAdminPanel')) $('claimAdminPanel').style.display = 'none';
    enterLoggedInUI(data.account, false);
    toast('🛡️ সুপার অ্যাডমিন পাসওয়ার্ড সুরক্ষিতভাবে সেট ও লগইন হয়েছে!');
  } catch (e) {
    if ($('authMsg')) $('authMsg').textContent = 'সার্ভার সংযোগ পাওয়া যায়নি।';
  }
};
['loginUser','loginPass'].forEach(id => { if ($(id)) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') window.login(); }); });
if ($('loginBtn')) $('loginBtn').onclick = window.login;
if ($('showRegisterBtn')) $('showRegisterBtn').onclick = () => {
  $('loginFormContainer').style.display = 'none'; $('registerPanel').style.display = 'block';
  clearAuthForms();
  setTimeout(clearAuthForms, 60);
};
if ($('backToLoginBtn')) $('backToLoginBtn').onclick = () => {
  $('registerPanel').style.display = 'none'; $('loginFormContainer').style.display = 'block';
  clearAuthForms();
  setTimeout(clearAuthForms, 60);
};
if ($('registerBtn')) $('registerBtn').onclick = async () => {
  const policy = getRules().signupPolicy || 'trial7';
  if (policy === 'closed') return ($('authMsg').textContent = 'নতুন সেলফ-সাইনআপ বর্তমানে বন্ধ আছে — অ্যাডমিনের সাথে যোগাযোগ করুন।');
  const name = $('regName')?.value.trim(), username = ($('regUsername')?.value || '').trim().toLowerCase(), email = ($('regEmail')?.value || '').trim().toLowerCase(), phone = ($('regPhone')?.value || '').trim(), pass = $('regPass')?.value || '', pass2 = $('regPass2')?.value || '';
  if (!name || !username || !email || !phone || !pass) return ($('authMsg').textContent = 'সবগুলো ঘর পূরণ করুন।');
  if (username === 'admin') return ($('authMsg').textContent = 'admin ইউজারনেম সংরক্ষিত।');
  if (pass.length < 6) return ($('authMsg').textContent = 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
  if (pass !== pass2) return ($('authMsg').textContent = 'পাসওয়ার্ড মিলছে না।');
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, email, phone, password: pass })
    });
    const cType = res.headers.get('content-type') || '';
    if (cType.includes('application/json')) {
      const data = await res.json();
      if (!res.ok) return ($('authMsg').textContent = data.error || 'রেজিস্ট্রেশন ব্যর্থ হয়েছে।');
      if (data.subscriptionConfig) writeSubscriptionConfig(data.subscriptionConfig);
      if (data.pending) {
        clearAuthForms();
        $('registerPanel').style.display = 'none'; $('loginFormContainer').style.display = 'block';
        if ($('authMsg')) $('authMsg').textContent = 'অ্যাকাউন্ট তৈরি হয়েছে! অ্যাডমিন অনুমোদন করলে লগইন করতে পারবেন ⏳';
        toast('রেজিস্ট্রেশন সম্পন্ন — অ্যাডমিন অনুমোদনের অপেক্ষায়!'); return;
      }
      serverAuthToken = data.token;
      const accounts = readLocalAccounts(); accounts.push(data.account); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts));
      localStorage.setItem('ads_hisab_user_profile_v72_' + data.account.id, JSON.stringify({ name, email, phone, pic: '' }));
      enterLoggedInUI(data.account, false); logActivity(`নতুন ইউজার রেজিস্ট্রেশন: ${name} (${data.account.plan})`);
      toast(data.account.plan === 'Trial' ? `৭ দিনের ফ্রি ট্রায়াল অ্যাকাউন্ট তৈরি হয়েছে (${data.account.expiryDate} পর্যন্ত)!` : 'নতুন অ্যাকাউন্ট তৈরি হয়েছে!');
      return;
    }
  } catch (_) {}
  const accounts = readLocalAccounts(); if (accounts.some(a => a.username === username || a.email === email)) return ($('authMsg').textContent = 'ইউজারনেম বা ইমেইল আগেই আছে।');
  const trialDays = readSubscriptionConfig().trialDays || 7;
  let plan = 'Lifetime', expiryDate = '', status = 'active';
  if (policy === 'trial7' || policy === 'pending') {
    plan = 'Trial';
    expiryDate = addDaysToDateStr(today(), trialDays);
    if (policy === 'pending') status = 'pending';
  }
  const next = Number(localStorage.getItem(NEXTUSERIDKEY) || 2), account = { id: uid(), updatedAt: Date.now(), userNumber: next, name, username, email, phone, password: hashPass(pass), role: 'user', plan, expiryDate, subscriptionBypass: false, status, lastLogin: status === 'pending' ? 'অনুমোদনের অপেক্ষায়' : new Date().toLocaleString('bn-BD'), loginCount: status === 'pending' ? 0 : 1 };
  accounts.push(account); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); localStorage.setItem(NEXTUSERIDKEY, String(next + 1));
  localStorage.setItem('ads_hisab_user_profile_v72_' + account.id, JSON.stringify({ name, email, phone, pic: '' }));
  if (status === 'pending') {
    clearAuthForms();
    $('registerPanel').style.display = 'none'; $('loginFormContainer').style.display = 'block';
    if ($('authMsg')) $('authMsg').textContent = 'অ্যাকাউন্ট তৈরি হয়েছে! অ্যাডমিন অনুমোদন করলে লগইন করতে পারবেন ⏳';
    triggerAccountCloudSync(); toast('রেজিস্ট্রেশন সম্পন্ন — অ্যাডমিন অনুমোদনের অপেক্ষায়!'); return;
  }
  enterLoggedInUI(account, false); logActivity(`নতুন ইউজার রেজিস্ট্রেশন: ${name} (${plan})`); triggerAccountCloudSync(); toast(plan === 'Trial' ? `${trialDays} দিনের ফ্রি ট্রায়াল অ্যাকাউন্ট তৈরি হয়েছে (${expiryDate} পর্যন্ত)!` : 'নতুন অ্যাকাউন্ট তৈরি হয়েছে!');
};

// Recovery
if ($('forgotBtn')) $('forgotBtn').onclick = () => { $('recoveryMode').value = 'password'; $('recoveryTitle').textContent = 'পাসওয়ার্ড রিসেট'; $('recNewPassWrap').style.display = 'block'; $('recNewPass').required = true; $('recoveryForm').reset(); ['recEmail','recPhone','recNewPass'].forEach(id => { if ($(id)) { $(id).value = ''; rearmNoAutofill($(id)); } }); $('recoveryModal').style.display = 'flex'; };
if ($('forgotUserBtn')) $('forgotUserBtn').onclick = () => { $('recoveryMode').value = 'username'; $('recoveryTitle').textContent = 'ইউজারনেম খুঁজুন'; $('recNewPassWrap').style.display = 'none'; $('recNewPass').required = false; $('recoveryForm').reset(); ['recEmail','recPhone','recNewPass'].forEach(id => { if ($(id)) { $(id).value = ''; rearmNoAutofill($(id)); } }); $('recoveryModal').style.display = 'flex'; };
if ($('recoveryForm')) $('recoveryForm').onsubmit = e => {
  e.preventDefault(); const mode = $('recoveryMode').value, email = $('recEmail').value.trim().toLowerCase(), phone = $('recPhone').value.trim(), accounts = readLocalAccounts();
  const idx = accounts.findIndex(a => String(a.email || '').trim().toLowerCase() === email && String(a.phone || '').trim() === phone);
  if (idx === -1) {
    const saProf = (() => { try { return JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_legacy-super-admin') || '{}'); } catch (err) { return {}; } })();
    if (email === String(saProf.email || 'admin@example.com').trim().toLowerCase() && phone === String(saProf.phone || '01700000000').trim()) {
      if (mode === 'username') { toast('আপনার ইউজারনেম: admin'); $('recoveryForm').reset(); closeModal('recoveryModal'); }
      else { const np = $('recNewPass').value; if (np.length < 6) return toast('৬+ অক্ষর দিন', 'error'); localStorage.setItem(PASSKEY, hashPass(np)); triggerAccountCloudSync(); toast('সুপার অ্যাডমিন পাসওয়ার্ড রিসেট হয়েছে!'); $('recoveryForm').reset(); closeModal('recoveryModal'); }
      return;
    }
    return toast('ইমেইল ও মোবাইল মিলছে না!', 'error');
  }
  if (mode === 'username') { toast(`আপনার ইউজারনেম: ${accounts[idx].username}`); $('recoveryForm').reset(); closeModal('recoveryModal'); }
  else { const np = $('recNewPass').value; if (np.length < 6) return toast('৬+ অক্ষর দিন', 'error'); accounts[idx].password = hashPass(np); accounts[idx].updatedAt = Date.now(); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accounts)); triggerAccountCloudSync(); toast('পাসওয়ার্ড রিসেট হয়েছে!'); $('recoveryForm').reset(); closeModal('recoveryModal'); }
};

// Profile & Agency Branding
const readProfile = () => { try { return JSON.parse(localStorage.getItem(PROFILEKEY) || '{}'); } catch (e) { return {}; } };
function updateAgencyThumbs(l, q) { if ($('agLogoPreview')) { $('agLogoPreview').style.display = l ? 'block' : 'none'; if (l) $('agLogoPreview').src = l; } if ($('agQrPreview')) { $('agQrPreview').style.display = q ? 'block' : 'none'; if (q) $('agQrPreview').src = q; } }
function applyAgencyBranding() {
  const ag = activeAccount ? (db.agency || {}) : {}, title = ag.name || 'Ads হিসাব ম্যানেজার', tagline = ag.tagline || 'Agency OS · Pro v81';
  const bc = { ...DEFAULT_BC_TEMPLATES(), ...(ag.bcTemplates || {}) };
  if ($('sideBrandTitle')) $('sideBrandTitle').textContent = title; if ($('sideBrandSub')) $('sideBrandSub').textContent = tagline;
  if ($('agName')) $('agName').value = activeAccount ? title : ''; if ($('agTagline')) $('agTagline').value = activeAccount ? tagline : '';
  if ($('agPhone')) $('agPhone').value = ag.phone || ''; if ($('agEmail')) $('agEmail').value = ag.email || ''; if ($('agAddress')) $('agAddress').value = ag.address || '';
  if ($('agDefaultRate')) $('agDefaultRate').value = activeAccount ? (ag.defaultRate || 125) : ''; if ($('agDefaultFee')) $('agDefaultFee').value = activeAccount ? (ag.defaultFeePct || 0) : ''; if ($('agMonthlyGoal')) $('agMonthlyGoal').value = activeAccount ? (num(ag.monthlyGoal) || 100000) : '';
  pendingAgLogoData = ag.logoUrl || ''; pendingAgQrData = ag.qrUrl || '';
  if ($('agLogoUrl')) { $('agLogoUrl').value = pendingAgLogoData.startsWith('data:') ? '' : pendingAgLogoData; $('agLogoUrl').placeholder = pendingAgLogoData.startsWith('data:') ? 'আপলোড করা লোগো সেভ আছে' : 'https://...'; }
  if ($('agQrUrl')) { $('agQrUrl').value = pendingAgQrData.startsWith('data:') ? '' : pendingAgQrData; $('agQrUrl').placeholder = pendingAgQrData.startsWith('data:') ? 'আপলোড করা QR সেভ আছে' : 'https://...'; }
  updateAgencyThumbs(pendingAgLogoData, pendingAgQrData);
  if ($('agSignText')) $('agSignText').value = ag.signText || ''; if ($('agTermsText')) $('agTermsText').value = ag.termsText || ''; if ($('agPayInfo')) $('agPayInfo').value = ag.payInfo || '';
  if ($('agMetaToken')) $('agMetaToken').value = activeAccount ? (ag.metaToken || '') : '';
  if ($('agWaApiUrl')) $('agWaApiUrl').value = activeAccount ? (ag.waApiUrl || '') : '';
  if ($('agWaApiToken')) $('agWaApiToken').value = activeAccount ? (ag.waApiToken || '') : '';
  if ($('agWaTemplate')) $('agWaTemplate').value = activeAccount ? (ag.waTemplate || DEFAULT_WA_TEMPLATE) : '';
  if ($('agBcRateTpl')) $('agBcRateTpl').value = bc.rate || '';
  if ($('agBcPlatTpl')) $('agBcPlatTpl').value = bc.platforms || '';
  if ($('agBcDueTpl')) $('agBcDueTpl').value = bc.due || '';
  if ($('agBcOfferTpl')) $('agBcOfferTpl').value = bc.offer || '';
  if (typeof renderGfxPoster === 'function') renderGfxPoster();
}
if ($('agLogoFile')) $('agLogoFile').onchange = async e => { const f = e.target.files?.[0]; if (!f) return; try { pendingAgLogoData = await compressImageFile(f, 320, 0.85); if ($('agLogoUrl')) $('agLogoUrl').value = ''; updateAgencyThumbs(pendingAgLogoData, pendingAgQrData); toast('লোগো প্রস্তুত! সেভ করুন।'); } catch (err) {} };
if ($('agQrFile')) $('agQrFile').onchange = async e => { const f = e.target.files?.[0]; if (!f) return; try { pendingAgQrData = await compressImageFile(f, 320, 0.85); if ($('agQrUrl')) $('agQrUrl').value = ''; updateAgencyThumbs(pendingAgLogoData, pendingAgQrData); toast('QR প্রস্তুত! সেভ করুন।'); } catch (err) {} };
if ($('removeAgLogoBtn')) $('removeAgLogoBtn').onclick = () => { pendingAgLogoData = ''; if ($('agLogoUrl')) $('agLogoUrl').value = ''; db.agency.logoUrl = ''; save(); applyAgencyBranding(); toast('লোগো সরানো হয়েছে', 'warn'); };
if ($('removeAgQrBtn')) $('removeAgQrBtn').onclick = () => { pendingAgQrData = ''; if ($('agQrUrl')) $('agQrUrl').value = ''; db.agency.qrUrl = ''; save(); applyAgencyBranding(); toast('QR সরানো হয়েছে', 'warn'); };
if ($('agLogoUrl')) $('agLogoUrl').oninput = e => updateAgencyThumbs(e.target.value.trim() || pendingAgLogoData, $('agQrUrl')?.value.trim() || pendingAgQrData);
if ($('agQrUrl')) $('agQrUrl').oninput = e => updateAgencyThumbs($('agLogoUrl')?.value.trim() || pendingAgLogoData, e.target.value.trim() || pendingAgQrData);
if ($('agencyForm')) $('agencyForm').onsubmit = e => {
  e.preventDefault();
  db.agency = {
    ...db.agency,
    name: $('agName').value.trim() || 'Ads হিসাব ম্যানেজার', tagline: $('agTagline').value.trim() || 'Agency OS · Pro v81', phone: $('agPhone').value.trim(), email: $('agEmail')?.value.trim() || '', address: $('agAddress')?.value.trim() || '',
    defaultRate: num($('agDefaultRate').value) || 125, defaultFeePct: num($('agDefaultFee').value) || 0, monthlyGoal: num($('agMonthlyGoal')?.value) || 0,
    logoUrl: $('agLogoUrl')?.value.trim() || pendingAgLogoData || '', qrUrl: $('agQrUrl')?.value.trim() || pendingAgQrData || '',
    signText: $('agSignText')?.value.trim() || '', termsText: $('agTermsText')?.value.trim() || '', payInfo: $('agPayInfo')?.value.trim() || '',
    metaToken: $('agMetaToken')?.value.trim() || '', waApiUrl: $('agWaApiUrl')?.value.trim() || '', waApiToken: $('agWaApiToken')?.value.trim() || '', waTemplate: $('agWaTemplate')?.value.trim() || DEFAULT_WA_TEMPLATE,
    bcTemplates: { rate: $('agBcRateTpl')?.value.trim() || '', platforms: $('agBcPlatTpl')?.value.trim() || '', due: $('agBcDueTpl')?.value.trim() || '', offer: $('agBcOfferTpl')?.value.trim() || '' }
  };
  save(); applyAgencyBranding(); logActivity('এজেন্সি তথ্য আপডেট'); if ($('agLogoFile')) $('agLogoFile').value = ''; if ($('agQrFile')) $('agQrFile').value = ''; toast(L('এজেন্সি সেটিংস সেভ হয়েছে!', 'Agency settings saved!'));
};

function updateHeaderAndProfile() {
  const p = activeAccount ? readProfile() : {}, currentName = activeAccount ? (p.name || activeAccount?.name || 'User') : 'User', roleMap = { super_admin: 'Super Admin', admin: 'Admin', staff: 'Staff', user: 'User' }, currentRole = (activeAccount?.id === 'legacy-super-admin') ? 'Super Admin' : (roleMap[activeAccount?.role] || 'User');
  if ($('welcomeTitle')) $('welcomeTitle').textContent = `${L('স্বাগতম', 'Welcome')}, ${currentName}!`;
  if ($('headerProfileName')) $('headerProfileName').textContent = currentName; if ($('headerProfileRole')) $('headerProfileRole').textContent = currentRole;
  if ($('sideRoleName')) $('sideRoleName').textContent = currentRole; if ($('sideRoleDesc')) $('sideRoleDesc').textContent = isStaff() ? L('স্টাফ ওয়ার্কস্পেস', 'Staff Workspace') : (isSuperAdmin() ? L('সুপার অ্যাডমিন পূর্ণ কন্ট্রোল', 'Super Admin Full Control') : (activeAccount?.role === 'admin' ? L('অ্যাডমিন ওয়ার্কস্পেস', 'Admin Workspace') : L('ব্যক্তিগত ইউজার ওয়ার্কস্পেস', 'User Workspace')));
  if ($('profileDisplayName')) $('profileDisplayName').textContent = currentName; if ($('profileUserId')) $('profileUserId').textContent = 'ID: AS-' + String(activeAccount?.userNumber || 1).padStart(5, '0');
  if ($('profileRoleBadge')) { $('profileRoleBadge').textContent = currentRole; $('profileRoleBadge').className = isStaff() ? 'badge-admin' : (isSuperAdmin() ? 'badge-success' : 'badge-status status-running'); }
  if ($('headerPlanBtn')) {
    const hBtn = $('headerPlanBtn');
    if (!activeAccount || activeAccount.id === 'legacy-super-admin' || activeAccount.role === 'super_admin') {
      hBtn.style.display = 'none';
    } else {
      hBtn.style.display = 'inline-flex';
      const exp = activeAccount.expiryDate || '';
      const dLeft = exp ? Math.ceil((new Date(exp + 'T00:00:00Z') - new Date(today() + 'T00:00:00Z')) / 86400000) : null;
      if (activeAccount.subscriptionBypass) {
        hBtn.className = 'secondary sm';
        hBtn.textContent = '🆓 ফ্রি অনুমতি';
      } else if (String(activeAccount.plan || '') === 'Trial') {
        hBtn.className = (dLeft !== null && dLeft <= 2) ? 'warn sm' : 'secondary sm';
        hBtn.textContent = `⏳ ট্রায়াল (${dLeft !== null ? Math.max(0, dLeft) : 0}দি)`;
      } else {
        hBtn.className = (dLeft !== null && dLeft <= 3) ? 'warn sm' : 'secondary sm';
        hBtn.textContent = `💎 ${activeAccount.plan || 'Plan'}${dLeft !== null ? ` (${Math.max(0, dLeft)}দি)` : ''}`;
      }
    }
  }
  if ($('profilePlanCard') && activeAccount) {
    const isOwner = activeAccount.id === 'legacy-super-admin' || activeAccount.role === 'super_admin';
    const plan = isOwner ? 'Owner · Lifetime' : (activeAccount.plan || 'Trial');
    const exp = activeAccount.expiryDate || '';
    const daysLeft = exp ? Math.ceil((new Date(exp + 'T00:00:00Z') - new Date(today() + 'T00:00:00Z')) / 86400000) : null;
    const permPills = [
      hasPerm('canEdit') ? '<span class="badge-success">✓ এডিট</span>' : '<span class="badge-danger">✕ ভিউ-অনলি</span>',
      hasPerm('canDelete') ? '<span class="badge-success">✓ ডিলিট</span>' : '<span class="badge-warn">✕ ডিলিট বন্ধ</span>',
      hasPerm('canPayments') ? '<span class="badge-success">✓ পেমেন্ট</span>' : '<span class="badge-warn">✕ পেমেন্ট বন্ধ</span>',
      hasPerm('canExpenses') ? '<span class="badge-success">✓ খরচ</span>' : '<span class="badge-warn">✕ খরচ বন্ধ</span>'
    ].join(' ');
    const statusLine = activeAccount.subscriptionBypass
      ? '🆓 সুপার অ্যাডমিন ফ্রি অনুমতি — কোনো সাবস্ক্রিপশন ছাড়াই আনলিমিটেড চলবে ✅'
      : (exp ? `মেয়াদ: ${esc(exp)} (${daysLeft >= 0 ? `${daysLeft} দিন বাকি` : 'মেয়াদোত্তীর্ণ'})` : 'আনলিমিটেড লাইফটাইম অ্যাক্সেস · ক্যাম্পেইন ও গ্রাফিক্স আনলিমিটেড');
    const reqBtn = isRealSuperAdmin() && activeAccount.id === 'legacy-super-admin' ? '' : `<button type="button" class="secondary sm" style="margin:0" onclick="openSubscriptionModal()">💎 ${L('সাবস্ক্রিপশন / প্ল্যান রিনিউ', 'Subscription / Renew')}</button>`;
    $('profilePlanCard').innerHTML = `<div><strong style="font-size:13.5px;display:block">🎖️ রোল: ${esc(currentRole)} · প্ল্যান: ${esc(plan)}${activeAccount.subscriptionBypass ? ' · <span style="color:#059669">🆓 ফ্রি পারমিটেড</span>' : ''}</strong><small class="muted">${statusLine}</small></div><div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">${permPills}${reqBtn}</div>`;
  }
  if ($('profileName')) $('profileName').value = activeAccount ? currentName : ''; if ($('profileEmail')) $('profileEmail').value = activeAccount ? (p.email || activeAccount?.email || '') : ''; if ($('profilePhone')) $('profilePhone').value = activeAccount ? (p.phone || activeAccount?.phone || '') : '';
  if ($('profileBio')) $('profileBio').value = activeAccount ? (p.bio || '') : '';
  pendingProfilePicData = activeAccount ? (p.pic || '') : '';
  if ($('profilePicInput')) { $('profilePicInput').value = pendingProfilePicData.startsWith('data:image/') ? '' : pendingProfilePicData; $('profilePicInput').placeholder = pendingProfilePicData.startsWith('data:image/') ? 'আপলোড করা ছবি সেভ আছে' : 'https://...'; }
  const fb = defaultAvatarUrl(currentName), picUrl = pendingProfilePicData || fb;
  [$('profilePreview'), $('headerProfilePic')].forEach(img => { if (!img) return; img.onerror = () => { img.onerror = null; img.src = fb; }; img.src = picUrl; });
  applyAgencyBranding(); applyGlobalNotice(); updateStorageMeter(); if (isAdminOrSuper()) renderAdminPanel();
}
if ($('profilePicInput')) $('profilePicInput').oninput = e => { if ($('profilePreview')) $('profilePreview').src = e.target.value.trim() || pendingProfilePicData || defaultAvatarUrl($('profileName')?.value || 'U'); };
if ($('profilePicFile')) $('profilePicFile').onchange = async e => { const f = e.target.files?.[0]; if (!f) return; try { pendingProfilePicData = await compressImageFile(f, 240, 0.82); if ($('profilePreview')) $('profilePreview').src = pendingProfilePicData; if ($('profilePicInput')) $('profilePicInput').value = ''; toast('ছবি প্রস্তুত! আপডেট করুন।'); } catch (err) {} };
if ($('removeProfilePicBtn')) $('removeProfilePicBtn').onclick = () => { pendingProfilePicData = ''; if ($('profilePicInput')) $('profilePicInput').value = ''; const p = readProfile(); p.pic = ''; localStorage.setItem(PROFILEKEY, JSON.stringify(p)); updateHeaderAndProfile(); triggerAccountCloudSync(); toast('ছবি সরানো হয়েছে', 'warn'); };
function saveProfileData(name, email, phone, pic, bio) {
  const prev = readProfile();
  const nextBio = typeof bio === 'string' ? bio : (prev.bio || '');
  try { localStorage.setItem(PROFILEKEY, JSON.stringify({ name, email, phone, pic, bio: nextBio })); } catch (e) { return toast('ছবি বড় হওয়ায় সেভ হয়নি!', 'error'); }
  if (activeAccount) { activeAccount.name = name; activeAccount.email = email; activeAccount.phone = phone; activeAccount.bio = nextBio; try { sessionStorage.setItem(SESSION_ACC_KEY, JSON.stringify(activeAccount)); } catch (e) {} if (activeAccount.id !== 'legacy-super-admin') { const accs = readLocalAccounts(), idx = accs.findIndex(a => a.id === activeAccount.id); if (idx !== -1) { accs[idx].name = name; accs[idx].email = email; accs[idx].phone = phone; accs[idx].bio = nextBio; accs[idx].updatedAt = Date.now(); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs)); } } }
  logActivity(`প্রোফাইল আপডেট: ${name}`); updateHeaderAndProfile(); triggerAccountCloudSync(); if (typeof syncTeamRoomHello === 'function') syncTeamRoomHello(); toast('প্রোফাইল আপডেট ও সিঙ্ক হয়েছে!');
}
if ($('profileForm')) $('profileForm').onsubmit = e => { e.preventDefault(); saveProfileData($('profileName').value.trim(), $('profileEmail').value.trim(), $('profilePhone').value.trim(), $('profilePicInput').value.trim() || pendingProfilePicData || '', $('profileBio')?.value.trim() || ''); };
if ($('settingsPasswordForm')) $('settingsPasswordForm').onsubmit = async e => {
  e.preventDefault(); const oldP = $('settingsOldPass').value, newP = $('settingsNewPass').value, m = $('settingsPasswordMsg');
  if (newP !== $('settingsNewPass2').value) return (m.textContent = 'পাসওয়ার্ড দুটি মিলছে না!'); if (newP.length < 6) return (m.textContent = 'কমপক্ষে ৬ অক্ষর দিন!');
  if (serverAuthToken) {
    try {
      const res = await serverFetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPassword: oldP, newPassword: newP }) });
      const data = await res.json();
      if (!res.ok) return (m.textContent = data.error || 'বর্তমান পাসওয়ার্ড ভুল!');
    } catch (_) {
      return (m.textContent = 'সার্ভার সংযোগ পাওয়া যায়নি—পাসওয়ার্ড আপডেট হয়নি!');
    }
  } else {
    if (activeAccount && activeAccount.id !== 'legacy-super-admin') { if (!checkPass(oldP, activeAccount.password)) return (m.textContent = 'বর্তমান পাসওয়ার্ড ভুল!'); activeAccount.password = hashPass(newP); activeAccount.updatedAt = Date.now(); const accs = readLocalAccounts(), idx = accs.findIndex(a => a.id === activeAccount.id); if (idx !== -1) { accs[idx] = activeAccount; localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs)); } try { sessionStorage.setItem(SESSION_ACC_KEY, JSON.stringify(activeAccount)); } catch (err) {} }
    else { const storedSa = localStorage.getItem(PASSKEY); if (!storedSa || !checkPass(oldP, storedSa)) return (m.textContent = 'বর্তমান পাসওয়ার্ড ভুল!'); localStorage.setItem(PASSKEY, hashPass(newP)); }
  }
  m.textContent = 'পাসওয়ার্ড আপডেট হয়েছে!'; triggerAccountCloudSync(); e.target.reset();
  ['settingsOldPass', 'settingsNewPass', 'settingsNewPass2'].forEach(id => { if ($(id)) { $(id).value = ''; rearmNoAutofill($(id)); } });
  toast('পাসওয়ার্ড আপডেট হয়েছে!');
};
if ($('usernameForm')) $('usernameForm').onsubmit = async e => {
  e.preventDefault(); const pass = $('userChangePass').value, newU = $('newUsername').value.trim().toLowerCase(), m = $('usernameMsg');
  if (!pass) return (m.textContent = 'বর্তমান পাসওয়ার্ড দিন!');
  if (newU === 'admin') return (m.textContent = 'admin সংরক্ষিত।');
  if (!/^[a-z0-9._-]{3,40}$/.test(newU)) return (m.textContent = 'ইউজারনেম কমপক্ষে ৩ অক্ষরের (ইংরেজি ছোট হাতের অক্ষর/সংখ্যা/./_/-) হতে হবে।');
  if (!activeAccount || activeAccount.id === 'legacy-super-admin') {
    m.textContent = 'admin পরিবর্তনযোগ্য নয়।';
    e.target.reset();
    ['userChangePass', 'newUsername'].forEach(id => { if ($(id)) { $(id).value = ''; rearmNoAutofill($(id)); } });
    return;
  }
  if (serverAuthToken) {
    try {
      const res = await serverFetch('/api/auth/change-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pass, newUsername: newU })
      });
      const data = await res.json();
      if (!res.ok) return (m.textContent = data.error || 'পাসওয়ার্ড ভুল বা ইউজারনেম পরিবর্তন করা যায়নি!');
      if (data.token) serverAuthToken = data.token;
      if (data.account) {
        activeAccount = { ...activeAccount, ...data.account };
        try { sessionStorage.setItem(SESSION_ACC_KEY, JSON.stringify(activeAccount)); } catch (err) {}
        const accs = readLocalAccounts(), idx = accs.findIndex(a => a.id === activeAccount.id);
        if (idx !== -1) { accs[idx] = { ...accs[idx], ...data.account }; localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs)); }
      }
      localStorage.removeItem(REMEMBER_LOGIN_KEY);
      m.textContent = `ইউজারনেম আপডেট হয়েছে (@${newU})!`;
      e.target.reset();
      ['userChangePass', 'newUsername'].forEach(id => { if ($(id)) { $(id).value = ''; rearmNoAutofill($(id)); } });
      updateHeaderAndProfile();
      toast('ইউজারনেম আপডেট হয়েছে!');
      return;
    } catch (_) {
      return (m.textContent = 'সার্ভার সংযোগ পাওয়া যায়নি—ইউজারনেম আপডেট হয়নি!');
    }
  }
  if (!checkPass(pass, activeAccount.password)) return (m.textContent = 'বর্তমান পাসওয়ার্ড ভুল!');
  const accs = readLocalAccounts(); if (accs.some(a => a.id !== activeAccount.id && a.username === newU)) return (m.textContent = 'ইউজারনেম আগেই নেওয়া!');
  activeAccount.username = newU; activeAccount.updatedAt = Date.now();
  const idx = accs.findIndex(a => a.id === activeAccount.id);
  if (idx !== -1) { accs[idx] = activeAccount; localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs)); }
  try { sessionStorage.setItem(SESSION_ACC_KEY, JSON.stringify(activeAccount)); } catch (err) {}
  localStorage.removeItem(REMEMBER_LOGIN_KEY);
  m.textContent = `ইউজারনেম আপডেট হয়েছে (@${newU})!`;
  triggerAccountCloudSync();
  e.target.reset();
  ['userChangePass', 'newUsername'].forEach(id => { if ($(id)) { $(id).value = ''; rearmNoAutofill($(id)); } });
  updateHeaderAndProfile();
  toast('ইউজারনেম আপডেট হয়েছে!');
};

// Client Message Templates Hub
window.openMsgTemplates = (custId, workId = '') => {
  const c = db.customers.find(x => x.id === custId) || { name: 'ক্লায়েন্ট', phone: '' };
  const w = workId ? db.works.find(x => x.id === workId) : null;
  const ag = db.agency || {}, agName = ag.name || 'Ads হিসাব ম্যানেজার';
  const b = billed(custId), p = paid(custId), due = Math.max(0, b - p), payInf = ag.payInfo ? `পেমেন্ট মাধ্যম: ${ag.payInfo}` : '';
  const plat = w ? platformMeta(w.platform).label : 'বিজ্ঞাপন';
  const camp = w ? w.name : 'আপনার বিজ্ঞাপন', pg = w ? (pname(w.pageId) || 'আপনার অ্যাসেট') : 'আপনার পেজ/চ্যানেল';
  const templates = [
    { title: `✅ ${plat} লাইভ / চালু হয়েছে`, msg: `আসসালামু আলাইকুম ${c.name}, ${agName} থেকে জানাচ্ছি—${pg}-এর "${camp}" (${plat}) ক্যাম্পেইনটি সফলভাবে অনুমোদিত হয়ে চালু (Active) হয়েছে! কোনো প্রশ্ন থাকলে জানাবেন। ধন্যবাদ!` },
    { title: '🔑 পেজ / Google / YouTube / TikTok এক্সেস নিয়ম', msg: `আসসালামু আলাইকুম ${c.name}, আপনার ${plat} ক্যাম্পেইন চালানোর জন্য অনুগ্রহ করে অ্যাকাউন্ট/পেজ এক্সেস (${ag.email || ag.phone || agName}) দিন। এক্সেস দিয়ে জানালে আমরা সেটআপ শুরু করব। ধন্যবাদ!` },
    { title: '⚠️ অ্যাড রিজেক্ট / পলিসি ইস্যু আপডেট', msg: `আসসালামু আলাইকুম ${c.name}, ${agName} থেকে জানাচ্ছি—পলিসির কারণে "${camp}" (${plat}) অ্যাডটি সাময়িকভাবে রিজেক্ট/পজ হয়েছে। অনুগ্রহ করে বিকল্প ক্রিয়েটিভ/লিংক দিলে আমরা আবার চালু করে দিচ্ছি। ধন্যবাদ!` },
    { title: '🔄 ক্যাম্পেইন সম্পন্ন + রিনিউ অফার', msg: `আসসালামু আলাইকুম ${c.name}, আপনার "${camp}" (${plat}) ক্যাম্পেইনের মেয়াদ সম্পন্ন হয়েছে! ভালো রেজাল্ট ধরে রাখতে আরও ৭ দিন রিনিউ করতে পারেন। বাজেট কনফার্ম করলে চালু করে দেবো। ধন্যবাদ - ${agName}` },
    { title: '💰 পেমেন্ট / অ্যাডভান্স রিচার্জ অনুরোধ', msg: `আসসালামু আলাইকুম ${c.name}, ${agName} থেকে জানাচ্ছি—আপনার মোট বিল ${money(b)}, জমা ${money(p)}, বকেয়া ${money(due)}। অ্যাড নিরবচ্ছিন্ন রাখতে অনুগ্রহ করে পেমেন্ট সম্পন্ন করুন। ${payInf} ধন্যবাদ!` }
  ];
  const wa = normalizeBdPhone(c.phone);
  $('msgTplCustInfo').innerHTML = `ক্লায়েন্ট: <strong>${esc(c.name)}</strong> (${esc(c.phone || 'ফোন নেই')})${w ? ` · ${platformBadge(w.platform)} <strong>${esc(w.name)}</strong>` : ''}`;
  $('msgTplList').innerHTML = templates.map((t, i) => `
    <div class="template-card">
      <h4>${t.title}</h4>
      <textarea id="tplTxt_${i}" rows="3" style="font-size:12px;margin-bottom:6px">${esc(t.msg)}</textarea>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="secondary sm" onclick="copyText($('tplTxt_${i}').value,'মেসেজ')">📋 কপি</button>
        ${wa ? `<button type="button" class="sm" style="background:#059669" onclick="openExternalUrl('https://wa.me/${wa}?text='+encodeURIComponent($('tplTxt_${i}').value))">📲 WhatsApp পাঠান</button>` : ''}
      </div>
    </div>`).join('');
  $('msgTemplatesModal').style.display = 'flex';
};

// Quotation / Estimate Maker
function updateQuotePreview() {
  const b = num($('qtDollar')?.value) * num($('qtRate')?.value), f = num($('qtServiceFee')?.value), t = $('qtServiceFeeType')?.value || 'fixed';
  const svc = f ? (t === 'pct' ? b * (f / 100) : f) : 0;
  if ($('qtPreview')) $('qtPreview').innerHTML = `${L('আনুমানিক মোট কোটেশন বিল', 'Estimated Total Quote')}: <strong>${money(b + svc)}</strong>${svc ? ` (${L('সার্ভিস চার্জ', 'Service Fee')}: ${money(svc)})` : ''}`;
}
function applyAutoQuoteRate() {
  const rEl = $('qtRate'); if (!rEl || rEl.dataset.manualEdit === '1') return;
  const r = effectiveRateFor($('qtCustomer')?.value || '', $('qtDate')?.value || today(), num($('qtDollar')?.value));
  if (r) rEl.value = r;
}
if ($('qtRate')) $('qtRate').addEventListener('input', () => { $('qtRate').dataset.manualEdit = '1'; });
if ($('qtDollar')) $('qtDollar').addEventListener('input', () => { applyAutoQuoteRate(); updateQuotePreview(); });
if ($('qtDate')) $('qtDate').addEventListener('change', () => { applyAutoQuoteRate(); updateQuotePreview(); });
['qtDollar','qtRate','qtServiceFee','qtServiceFeeType'].forEach(id => { if ($(id)) { $(id).addEventListener('input', updateQuotePreview); $(id).addEventListener('change', updateQuotePreview); } });
if ($('qtCustomer')) $('qtCustomer').onchange = () => {
  const c = db.customers.find(x => x.id === $('qtCustomer').value);
  if (c) { $('qtCustName').value = c.name; $('qtPhone').value = c.phone || ''; }
  if ($('qtRate')) delete $('qtRate').dataset.manualEdit;
  applyAutoQuoteRate(); updateQuotePreview();
};
if ($('quoteForm')) $('quoteForm').onsubmit = e => {
  e.preventDefault();
  db.quotations.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), date: $('qtDate').value || today(), platform: $('qtPlatform')?.value || 'Meta', customerId: $('qtCustomer').value || '', custName: $('qtCustName').value.trim(), phone: $('qtPhone').value.trim(), title: $('qtTitle').value.trim(), days: num($('qtDays').value) || 7, dollar: num($('qtDollar').value), rate: num($('qtRate').value), serviceFee: num($('qtServiceFee').value), serviceFeeType: $('qtServiceFeeType').value || 'fixed', validUntil: $('qtValidUntil').value || '', note: $('qtNote').value.trim(), status: 'sent' });
  save(); logActivity(`নতুন কোটেশন: ${$('qtCustName').value.trim()}`); e.target.reset(); $('qtDate').value = today(); $('qtDays').value = 7; $('qtDollar').value = 50; if ($('qtRate')) { delete $('qtRate').dataset.manualEdit; $('qtRate').value = effectiveRateFor('', today(), 50) || 125; } updateQuotePreview(); toast('কোটেশন সেভ হয়েছে!');
};
let currentQuoteId = null;
window.openQuoteModal = id => {
  const q = db.quotations.find(x => x.id === id); if (!q) return; currentQuoteId = id; const ag = db.agency || {}, tot = quoteTotal(q);
  if ($('qtModLogo')) { $('qtModLogo').style.display = ag.logoUrl ? 'block' : 'none'; if (ag.logoUrl) $('qtModLogo').src = ag.logoUrl; }
  $('qtModAgName').textContent = ag.name || 'Ads হিসাব ম্যানেজার'; $('qtModAgContact').textContent = agencyContactLine(ag);
  $('qtModNo').textContent = '#QT-' + id.slice(-5).toUpperCase(); $('qtModDate').textContent = 'তারিখ: ' + q.date + (q.validUntil ? ` | মেয়াদ: ${q.validUntil}` : '');
  $('qtModCust').innerHTML = `<strong>প্রাপক:</strong> ${esc(q.custName)} (${esc(q.phone || '—')}) · ${platformBadge(q.platform)}`;
  const baseTk = num(q.dollar) * num(q.rate), svc = tot - baseTk;
  $('qtModBody').innerHTML = `<div class="tablewrap" style="margin-top:0"><table><thead><tr><th>বিবরণ</th><th>সময়কাল</th><th>বাজেট ও রেট</th><th>মোট (৳)</th></tr></thead><tbody><tr><td><strong>${esc(q.title)}</strong> (${esc(platformMeta(q.platform).label)})${q.note ? `<br><small class="muted">${esc(q.note)}</small>` : ''}</td><td>${q.days} দিন</td><td>${usd(q.dollar)} × ${money(q.rate)}${svc ? `<br><small>+ চার্জ ${money(svc)}</small>` : ''}</td><td><strong>${money(tot)}</strong></td></tr></tbody></table></div>`;
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
  ctx.fillText('ক্যাম্পেইন / প্ল্যাটফর্ম', 48, 161); ctx.fillText('সময়কাল', 360, 161); ctx.textAlign = 'right'; ctx.fillText('আনুমানিক বিল (৳)', W - 48, 161); ctx.textAlign = 'left';
  ctx.fillStyle = '#1e293b'; ctx.font = '13.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`[${platformMeta(q.platform).label}] ${String(q.title).slice(0, 28)}`, 48, 198); ctx.fillText(`${q.days} দিন (${usd(q.dollar)} × ${num(q.rate)})`, 360, 198);
  ctx.textAlign = 'right'; ctx.font = 'bold 15px Arial, sans-serif'; ctx.fillStyle = '#7046e8'; ctx.fillText(money(tot), W - 48, 198); ctx.textAlign = 'left';
  if (q.note) { ctx.fillStyle = '#64748b'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`নোট: ${String(q.note).slice(0, 75)}`, 48, 226); }
  ctx.fillStyle = '#f5f3ff'; ctx.fillRect(36, 252, W - 72, 48); ctx.fillStyle = '#5b21b6'; ctx.font = 'bold 16px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`সর্বমোট প্রাক্কলিত মূল্য: ${money(tot)}`, 52, 282);
  if (ag.payInfo) { ctx.fillStyle = '#1e3a8a'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`পেমেন্ট মাধ্যম: ${String(ag.payInfo).slice(0, 82)}`, 36, 326); }
  ctx.textAlign = 'center'; ctx.fillStyle = '#64748b'; ctx.font = '11.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText('অনুমোদনের পর অর্ডার কনফার্ম করা হবে। ধন্যবাদ!', W / 2, H - 14);
  canvas.toBlob(blob => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `quotation_${q.custName.replace(/\s+/g, '_')}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('কোটেশন PNG ডাউনলোড হয়েছে!'); }, 'image/png');
};
window.sendQuoteWhatsApp = id => {
  const q = db.quotations.find(x => x.id === id); if (!q) return; const wa = normalizeBdPhone(q.phone); if (!wa) return toast('মোবাইল নম্বর নেই!', 'error');
  openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${q.custName}, ${db.agency?.name || 'Ads হিসাব ম্যানেজার'} থেকে আপনার ${platformMeta(q.platform).label} "${q.title}" (${q.days} দিন, ${usd(q.dollar)}) কাজের কোটেশন: মোট আনুমানিক বিল ${money(quoteTotal(q))}। ${q.note ? 'নোট: ' + q.note + ' ' : ''}কনফার্ম করলে কাজ শুরু করা যাবে। ধন্যবাদ!`)}`);
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
  goToSection('works'); if ($('wPlatform')) $('wPlatform').value = AD_PLATFORMS.includes(q.platform) ? q.platform : 'Meta';
  $('wCustomer').value = cid; updatePages(); $('wName').value = q.title; $('wDays').value = q.days; $('wDollar').value = q.dollar; $('wRate').value = q.rate; if ($('wRate')) delete $('wRate').dataset.manualEdit; $('wActualDollar').value = 0;
  if ($('wServiceFee')) $('wServiceFee').value = q.serviceFee || 0; if ($('wServiceFeeType')) $('wServiceFeeType').value = q.serviceFeeType || 'fixed';
  $('wNote').value = q.note || ''; updateWorkPreview(); toast('কোটেশন অর্ডারে রূপান্তর হয়ে কাজের ফর্মে বসেছে!');
};
window.deleteQuote = async id => { if (!hasPerm('canDelete') || !(await askConfirm('কোটেশন মুছবেন?'))) return; const q = db.quotations.find(x => x.id === id); if (q) { moveToTrash('quotation', `কোটেশন: ${q.custName}`, q); markDeleted(id); db.quotations = db.quotations.filter(x => x.id !== id); save(); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn'); } };
function renderQuotations() {
  const q = ($('quoteSearch')?.value || '').toLowerCase(), list = [...db.quotations].sort(byDateDesc).filter(x => !q || (x.custName || '').toLowerCase().includes(q) || (x.title || '').toLowerCase().includes(q) || (x.platform || 'Meta').toLowerCase().includes(q));
  if ($('quoteRows')) $('quoteRows').innerHTML = list.map(x => `<tr><td>${esc(x.date)}</td><td><strong>${esc(x.custName)}</strong><br><small class="muted">${esc(x.phone || '—')}</small></td><td>${platformBadge(x.platform)} <strong>${esc(x.title)}</strong> (${x.days} দিন)</td><td>${usd(x.dollar)} × ${money(x.rate)}</td><td><strong>${money(quoteTotal(x))}</strong></td><td><span class="${x.status === 'accepted' ? 'badge-success' : 'badge-admin'}">${x.status === 'accepted' ? 'Accepted' : 'Sent'}</span></td><td><button type="button" class="secondary sm" onclick="openQuoteModal('${x.id}')">👁️ প্রিভিউ</button><button type="button" class="secondary sm" onclick="sendQuoteWhatsApp('${x.id}')">📲</button><button type="button" class="sm" style="background:#059669" onclick="convertQuoteToWork('${x.id}')">⚡ কাজ বানান</button><button type="button" class="danger sm perm-del" onclick="deleteQuote('${x.id}')">মুছুন</button></td></tr>`).join('') || '<tr><td colspan="7">কোনো কোটেশন নেই</td></tr>';
}
if ($('quoteSearch')) $('quoteSearch').oninput = renderQuotations;

// Performance Report Modal + PNG
let currentPerfWorkId = null;
window.openWorkPerfReport = workId => {
  const w = db.works.find(x => x.id === workId); if (!w) return; currentPerfWorkId = workId; const ag = db.agency || {};
  if ($('prfLogoImg')) { $('prfLogoImg').style.display = ag.logoUrl ? 'block' : 'none'; if (ag.logoUrl) $('prfLogoImg').src = ag.logoUrl; }
  $('prfAgencyName').textContent = ag.name || 'Ads হিসাব ম্যানেজার'; $('prfAgencyContact').textContent = agencyContactLine(ag);
  $('prfDate').textContent = 'তারিখ: ' + (w.date || today()); $('prfCustName').textContent = cname(w.customerId);
  $('prfCampName').textContent = w.name; $('prfObjPage').textContent = `${platformMeta(w.platform).label} · ${w.objective || 'Ad Campaign'} · ${pname(w.pageId) || 'Asset'} (${w.days || 1} দিন)`;
  const resCount = num(w.conversions), spentUsd = num(w.actualDollar), cprUsd = resCount > 0 ? usd(spentUsd / resCount) : '—', cprTk = resCount > 0 ? money(bill(w) / resCount) : '—';
  $('prfStatsGrid').innerHTML = `
    <div class="perf-stat"><small>প্ল্যাটফর্ম</small><strong>${esc(platformMeta(w.platform).label)}</strong></div>
    <div class="perf-stat"><small>ব্যবহৃত বাজেট ($)</small><strong>${usd(spentUsd)} / ${usd(w.dollar)}</strong></div>
    <div class="perf-stat"><small>মোট বিল (৳)</small><strong>${money(bill(w))}</strong></div>
    <div class="perf-stat"><small>Reach / Impressions</small><strong>${num(w.reach).toLocaleString()}</strong></div>
    <div class="perf-stat"><small>Clicks / Views</small><strong>${num(w.clicks).toLocaleString()}</strong></div>
    <div class="perf-stat"><small>Results (Msg/Lead/Sale)</small><strong>${resCount.toLocaleString()}</strong></div>
    <div class="perf-stat"><small>Cost Per Result ($)</small><strong>${cprUsd}</strong></div>
    <div class="perf-stat"><small>Cost Per Result (৳)</small><strong>${cprTk}</strong></div>`;
  const briefParts = [w.targetLoc ? `📍 লোকেশন: ${w.targetLoc}` : '', w.targetAge ? `👥 বয়স/জেন্ডার: ${w.targetAge}` : '', w.audience ? `🎯 অডিয়েন্স/কীওয়ার্ড: ${w.audience}` : '', w.postUrl ? `🔗 লিংক: ${w.postUrl}` : '', (w.policyIssue && w.policyIssue !== 'None') ? `⚠️ পলিসি নোট: ${w.policyIssue}` : ''].filter(Boolean);
  $('prfBriefBox').innerHTML = briefParts.length ? briefParts.join('<br>') : 'টার্গেটিং ও ডেলিভারি স্বাভাবিক রয়েছে।';
  if ($('prfProofWrap') && $('prfProofImg')) { if (w.proofImg) { $('prfProofWrap').style.display = 'block'; $('prfProofImg').src = w.proofImg; } else $('prfProofWrap').style.display = 'none'; }
  $('perfReportModal').style.display = 'flex';
};
window.printPerfReport = () => { document.body.classList.add('printing-perf'); window.print(); setTimeout(() => document.body.classList.remove('printing-perf'), 400); };
window.sendPerfReportWhatsApp = () => {
  const w = db.works.find(x => x.id === currentPerfWorkId); if (!w) return;
  const c = db.customers.find(x => x.id === w.customerId), wa = normalizeBdPhone(c?.phone); if (!wa) return toast('মোবাইল নম্বর নেই!', 'error');
  const resCount = num(w.conversions), cpr = resCount > 0 ? usd(num(w.actualDollar) / resCount) : '—';
  openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(`📊 *ক্যাম্পেইন পারফরম্যান্স রিপোর্ট*\nএজেন্সি: ${db.agency?.name || 'Ads হিসাব ম্যানেজার'}\nপ্ল্যাটফর্ম: ${platformMeta(w.platform).label}\nক্যাম্পেইন: ${w.name}\nতারিখ: ${w.date} (${w.days} দিন)\n\n💵 ব্যবহৃত বাজেট: ${usd(w.actualDollar)} / ${usd(w.dollar)}\n💰 মোট বিল: ${money(bill(w))}\n👁️ Reach: ${num(w.reach).toLocaleString()}\n🖱️ Clicks/Views: ${num(w.clicks).toLocaleString()}\n🎯 Results: ${resCount}\n📉 Cost/Result: ${cpr}\nস্ট্যাটাস: ${w.status}`)}`);
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
  ctx.textAlign = 'right'; ctx.fillStyle = '#0f172a'; ctx.font = 'bold 13px Arial, sans-serif'; ctx.fillText(`${platformMeta(w.platform).label.toUpperCase()} REPORT`, W - 36, 44);
  ctx.fillStyle = '#64748b'; ctx.font = '12px Arial, sans-serif'; ctx.fillText(`তারিখ: ${w.date}`, W - 36, 64);
  ctx.textAlign = 'left'; ctx.strokeStyle = '#e2e8f0'; ctx.beginPath(); ctx.moveTo(36, 84); ctx.lineTo(W - 36, 84); ctx.stroke();
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 16px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`ক্লায়েন্ট: ${cname(w.customerId)}`, 36, 114);
  ctx.fillStyle = '#2563eb'; ctx.font = 'bold 15px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`[${platformMeta(w.platform).label}] ${w.name} (${w.objective || 'Ad'})`, 36, 138);
  const resCount = num(w.conversions), cpr = resCount > 0 ? usd(num(w.actualDollar) / resCount) : '—';
  const cards = [['ব্যবহৃত বাজেট', `${usd(w.actualDollar)} / ${usd(w.dollar)}`], ['মোট বিল', money(bill(w))], ['Reach', num(w.reach).toLocaleString()], ['Clicks/Views', num(w.clicks).toLocaleString()], ['Results', String(resCount)], ['Cost / Result', cpr], ['মেয়াদ', `${w.days} দিন`], ['স্ট্যাটাস', String(w.status).toUpperCase()]];
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
  copyText(`📋 *ক্যাম্পেইন ব্রিফ (${platformMeta(w.platform).label}): ${w.name}*\nক্লায়েন্ট: ${cname(w.customerId)} (${pname(w.pageId)})${w.adAccountId ? `\nঅ্যাড অ্যাকাউন্ট: ${aaname(w.adAccountId)}` : ''}\nObjective: ${w.objective || '—'}\nবাজেট: ${usd(w.dollar)} (${w.days} দিন)\nলোকেশন: ${w.targetLoc || '—'} | বয়স/জেন্ডার: ${w.targetAge || '—'}\nঅডিয়েন্স/কীওয়ার্ড: ${w.audience || '—'}\nলিংক: ${w.postUrl || w.creativeLink || '—'}\nক্যাপশন/হেডলাইন: ${w.adCopy || '—'}`, 'অ্যাড ব্রিফ');
};

// === PART 2: MULTI-PLATFORM TRACKING, CRM, INVOICE, CARDS, RATES, WORKS, EXPENSES & PAYMENTS ===
window.setTrackingPlatform = (plat, btn) => {
  trackingPlatform = AD_PLATFORMS.includes(plat) ? plat : 'Meta';
  document.querySelectorAll('#trackingPlatTabs button').forEach(b => b.classList.toggle('active', b === btn || b.dataset.plat === trackingPlatform));
  const lbl = $('lblTrackId'), pid = $('genPixelId');
  if (lbl && pid) {
    if (trackingPlatform === 'Meta') { lbl.textContent = 'Meta Pixel ID'; if (!pid.value || pid.value.startsWith('G-') || pid.value.startsWith('AW-') || pid.value.startsWith('C')) pid.value = '1234567890'; }
    else if (trackingPlatform === 'Google') { lbl.textContent = 'Google Ads / GA4 Tag ID (G-... / AW-...)'; if (/^\d+$/.test(pid.value) || pid.value.startsWith('C')) pid.value = 'AW-123456789'; }
    else if (trackingPlatform === 'YouTube') { lbl.textContent = 'YouTube / Google Ads Conversion ID (AW-...)'; if (/^\d+$/.test(pid.value) || pid.value.startsWith('C')) pid.value = 'AW-987654321'; }
    else if (trackingPlatform === 'TikTok') { lbl.textContent = 'TikTok Pixel ID'; if (pid.value.startsWith('G-') || pid.value.startsWith('AW-') || pid.value === '1234567890') pid.value = 'CABCDEF1234567890'; }
  }
  generatePixelCode();
};

function generatePixelCode() {
  const pid = $('genPixelId')?.value.trim() || (trackingPlatform === 'Meta' ? '1234567890' : trackingPlatform === 'TikTok' ? 'CABCDEF1234567890' : 'AW-123456789');
  const event = $('genPixelEvent')?.value || 'Purchase', val = num($('genPixelVal')?.value);
  const out = $('pixelCodeOutput'); if (!out) return;
  if (trackingPlatform === 'Meta') {
    const sn = ['Purchase', 'AddToCart', 'ViewContent', 'InitiateCheckout'].includes(event) ? `fbq('track', '${event}', {value: ${val}, currency: 'BDT'});` : `fbq('track', '${event}');`;
    out.textContent = `<!-- Meta Pixel Code -->\n<script>\n  !function(f,b,e,v,n,t,s)\n  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?\n  n.callMethod.apply(n,arguments):n.queue.push(arguments)};\n  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';\n  n.queue=[];t=b.createElement(e);t.async=!0;\n  t.src=v;s=b.getElementsByTagName(e)[0];\n  s.parentNode.insertBefore(t,s)}(window, document,'script',\n  'https://connect.facebook.net/en_US/fbevents.js');\n  fbq('init', '${pid}');\n  fbq('track', 'PageView');\n  ${sn}\n</` + `script>`;
  } else if (trackingPlatform === 'Google') {
    const gMap = { PageView: 'page_view', ViewContent: 'view_item', Lead: 'generate_lead', Contact: 'contact', AddToCart: 'add_to_cart', InitiateCheckout: 'begin_checkout', Purchase: 'purchase' };
    const gEv = gMap[event] || 'conversion';
    out.textContent = `<!-- Google Ads / GA4 Global Site Tag (gtag.js) -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=${pid}"></` + `script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('js', new Date());\n  gtag('config', '${pid}');\n  gtag('event', '${gEv}', {\n    send_to: '${pid}',\n    value: ${val},\n    currency: 'BDT'\n  });\n</` + `script>`;
  } else if (trackingPlatform === 'YouTube') {
    out.textContent = `<!-- YouTube Video Campaign Conversion & Remarketing Tag -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=${pid}"></` + `script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('js', new Date());\n  gtag('config', '${pid}');\n  // YouTube Engaged-View & Conversion Event\n  gtag('event', 'conversion', {\n    send_to: '${pid}/${event}',\n    value: ${val},\n    currency: 'BDT',\n    transaction_id: ''\n  });\n</` + `script>`;
  } else {
    const ttMap = { PageView: 'PageView', ViewContent: 'ViewContent', Lead: 'SubmitForm', Contact: 'Contact', AddToCart: 'AddToCart', InitiateCheckout: 'InitiateCheckout', Purchase: 'CompletePayment' };
    const ttEv = ttMap[event] || event;
    out.textContent = `<!-- TikTok Pixel Code -->\n<script>\n!function (w, d, t) {\n  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date;var o=d.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};\n  ttq.load('${pid}');\n  ttq.page();\n  ttq.track('${ttEv}', { value: ${val}, currency: 'BDT' });\n}(window, document, 'ttq');\n</` + `script>`;
  }
}
['generatePixelBtn', 'genPixelId', 'genPixelEvent', 'genPixelVal'].forEach(id => { if ($(id)) $(id)[id === 'generatePixelBtn' ? 'onclick' : 'oninput'] = generatePixelCode; });
if ($('genPixelEvent')) $('genPixelEvent').onchange = generatePixelCode;
if ($('simulateCapiBtn')) $('simulateCapiBtn').onclick = () => {
  const pid = $('genPixelId').value.trim() || '1234567890', event = $('genPixelEvent').value, val = num($('genPixelVal').value), out = $('pixelCodeOutput');
  if (!out) return;
  if (trackingPlatform === 'TikTok') {
    out.textContent = `// TikTok Events API Payload\n` + JSON.stringify({ pixel_code: pid, event, timestamp: new Date().toISOString(), context: { user: { external_id: 'hashed_user_id' } }, properties: { currency: 'BDT', value: val } }, null, 2);
  } else if (trackingPlatform === 'Google' || trackingPlatform === 'YouTube') {
    out.textContent = `// Google / YouTube Enhanced Conversions API Payload\n` + JSON.stringify({ conversion_action: `${pid}/${event}`, conversion_date_time: new Date().toISOString(), conversion_value: val, currency_code: 'BDT', user_identifiers: [{ hashed_phone_number: '254c3d6360b0e047d3e63a8412e62444655513c1f10bc7537e28b86e00b8e99a' }] }, null, 2);
  } else {
    out.textContent = `// Meta Conversions API (CAPI) JSON\n` + JSON.stringify({ data: [{ event_name: event, event_time: Math.floor(Date.now() / 1000), action_source: 'website', user_data: { em: ['f660ab912ec121d1b1e928a0bb4bc61b15f5ad44d5efdc4e1c92a25e99b8e44a'], ph: ['254c3d6360b0e047d3e63a8412e62444655513c1f10bc7537e28b86e00b8e99a'] }, custom_data: { currency: 'BDT', value: val } }], test_event_code: 'TEST1234' }, null, 2);
  }
};
if ($('copyPixelBtn')) $('copyPixelBtn').onclick = () => copyText($('pixelCodeOutput').textContent, 'ট্র্যাকিং কোড');

if ($('adAccountForm')) $('adAccountForm').onsubmit = e => {
  e.preventDefault();
  db.adAccounts.push({ id: uid(), updatedAt: Date.now(), platform: $('aaPlatform')?.value || 'Meta', name: $('aaName').value.trim(), adId: $('aaId').value.trim(), bm: $('aaBm').value.trim(), cardId: $('aaCard')?.value || '', threshold: num($('aaThreshold').value), unpaid: num($('aaUnpaid').value), dailyLimit: num($('aaDailyLimit')?.value), billingDay: Math.max(0, Math.min(31, Math.round(num($('aaBillingDay')?.value)))), status: $('aaStatus').value });
  save(); logActivity(`Ad Account (${$('aaPlatform')?.value || 'Meta'}): ${$('aaName').value.trim()}`); e.target.reset(); toast('Ad Account সেভ হয়েছে!');
};
window.openEditAdAccountModal = id => {
  if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const a = db.adAccounts.find(x => x.id === id); if (!a) return; refresh();
  $('eaaId').value = a.id; if ($('eaaPlatform')) $('eaaPlatform').value = AD_PLATFORMS.includes(a.platform) ? a.platform : 'Meta';
  $('eaaName').value = a.name; $('eaaAdId').value = a.adId || ''; $('eaaBm').value = a.bm || '';
  if ($('eaaCard')) $('eaaCard').value = a.cardId || ''; $('eaaThreshold').value = num(a.threshold); $('eaaUnpaid').value = num(a.unpaid);
  if ($('eaaDailyLimit')) $('eaaDailyLimit').value = num(a.dailyLimit);
  if ($('eaaBillingDay')) $('eaaBillingDay').value = num(a.billingDay);
  $('eaaStatus').value = a.status || 'Active';
  $('editAdAccountModal').style.display = 'flex';
};
if ($('editAdAccountForm')) $('editAdAccountForm').onsubmit = e => {
  e.preventDefault(); const a = db.adAccounts.find(x => x.id === $('eaaId').value); if (!a) return;
  a.platform = $('eaaPlatform')?.value || 'Meta'; a.name = $('eaaName').value.trim(); a.adId = $('eaaAdId').value.trim(); a.bm = $('eaaBm').value.trim();
  if (!isStaff()) a.cardId = $('eaaCard')?.value || ''; a.threshold = num($('eaaThreshold').value); a.unpaid = num($('eaaUnpaid').value);
  if ($('eaaDailyLimit')) a.dailyLimit = num($('eaaDailyLimit').value);
  if ($('eaaBillingDay')) a.billingDay = Math.max(0, Math.min(31, Math.round(num($('eaaBillingDay').value))));
  a.status = $('eaaStatus').value;
  a.updatedAt = Date.now(); save(); closeModal('editAdAccountModal'); toast('আপডেট হয়েছে!');
};
window.cycleAdAccountStatus = id => { if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const a = db.adAccounts.find(x => x.id === id); if (!a) return; const ord = ['Active', 'Payment Hold', 'Restricted', 'Disabled']; a.status = ord[(ord.indexOf(a.status) + 1) % ord.length]; a.updatedAt = Date.now(); save(); toast(`স্ট্যাটাস: ${a.status}`); };
window.deleteAdAccount = async id => { if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); const a = db.adAccounts.find(x => x.id === id); if (!a || !(await askConfirm('অ্যাড অ্যাকাউন্টটি মুছবেন?'))) return; moveToTrash('adAccount', `Ad Account: ${a.name}`, a); markDeleted(id); db.adAccounts = db.adAccounts.filter(x => x.id !== id); save(); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn'); };
window.syncMetaAdAccounts = async btn => {
  const token = String(db.agency?.metaToken || '').trim(); if (!token) { goToSection('settings'); return toast(L('সেটিংসে Meta Access Token দিন!', 'Add Meta Access Token in Settings!'), 'warn'); }
  const targets = db.adAccounts.filter(a => (a.platform || 'Meta') === 'Meta' && String(a.adId || '').trim());
  if (!targets.length) return toast(L('Meta Ad Account ID পাওয়া যায়নি!', 'No Meta Ad Account IDs found!'), 'warn');
  await withBtnLoading(btn, L('⏳ সিঙ্ক হচ্ছে...', '⏳ Syncing...'), async () => {
    let updated = 0, lastErr = '';
    for (const a of targets) {
      const rawId = String(a.adId || '').trim(), graphId = rawId.startsWith('act_') ? rawId : (/^\d+$/.test(rawId) ? 'act_' + rawId : rawId);
      try {
        const res = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(graphId)}?fields=account_status,balance,amount_spent&access_token=${encodeURIComponent(token)}`);
        const d = await res.json().catch(() => ({}));
        if (!res.ok || d.error) { lastErr = d.error?.message || `HTTP ${res.status}`; continue; }
        if (d.account_status !== undefined) a.status = { 1: 'Active', 2: 'Disabled', 3: 'Payment Hold', 7: 'Restricted', 9: 'Restricted' }[d.account_status] || a.status;
        if (d.balance !== undefined) a.unpaid = +(num(d.balance) / 100).toFixed(2);
        a.updatedAt = Date.now(); updated++;
      } catch (e) { lastErr = e.message || 'Network error'; }
    }
    if (updated) { save(); toast(L(`${updated}টি Meta Ad Account আপডেট হয়েছে!`, `Updated ${updated} Meta Ad Account(s)!`)); }
    else toast(lastErr ? `Meta API: ${lastErr}` : L('Meta API থেকে ডাটা পাওয়া যায়নি!', 'No data returned from Meta API!'), 'error');
  });
};

// Customers, Onboarding Checklist, CRM Pipeline & Pages/Channels
if ($('customerForm')) $('customerForm').onsubmit = e => {
  e.preventDefault(); const name = $('custName').value.trim();
  const lowAdvRaw = $('custLowAdvLimit')?.value;
  const lowAdvLimit = lowAdvRaw === '' ? 1000 : Math.max(0, num(lowAdvRaw));
  db.customers.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), portalToken: uid().slice(-6), name, phone: $('custPhone').value.trim(), stage: $('custStage')?.value || 'Active Client', followUpDate: $('custFollowUp')?.value || '', retainer: num($('custRetainer')?.value), dueLimit: num($('custDueLimit')?.value), customRate: num($('custCustomRate')?.value), lowAdvLimit, pkgName: $('custPkgName')?.value.trim() || '', pkgEnd: $('custPkgEnd')?.value || '', checklist: DEFAULT_CHECKLIST(), note: $('custNote').value.trim() });
  save(); logActivity(`নতুন কাস্টমার: ${name}`); e.target.reset(); if ($('custLowAdvLimit')) $('custLowAdvLimit').value = 1000; toast(L('কাস্টমার সেভ হয়েছে!', 'Customer saved!'));
};
window.openEditCustomerModal = custId => {
  if (!hasPerm('canEdit')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error'); const c = db.customers.find(x => x.id === custId); if (!c) return;
  const chk = { ...DEFAULT_CHECKLIST(), ...(c.checklist || {}) };
  $('editCustId').value = c.id; $('editCustName').value = c.name; $('editCustPhone').value = c.phone || '';
  if ($('editCustStage')) $('editCustStage').value = c.stage || 'Active Client';
  if ($('editCustFollowUp')) $('editCustFollowUp').value = c.followUpDate || '';
  if ($('editCustRetainer')) $('editCustRetainer').value = num(c.retainer);
  if ($('editCustDueLimit')) $('editCustDueLimit').value = num(c.dueLimit);
  if ($('editCustCustomRate')) $('editCustCustomRate').value = num(c.customRate);
  if ($('editCustLowAdvLimit')) $('editCustLowAdvLimit').value = c.lowAdvLimit === undefined ? 1000 : num(c.lowAdvLimit);
  if ($('editCustPkgName')) $('editCustPkgName').value = c.pkgName || '';
  if ($('editCustPkgEnd')) $('editCustPkgEnd').value = c.pkgEnd || '';
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
    c.retainer = num($('editCustRetainer')?.value); c.dueLimit = num($('editCustDueLimit')?.value);
    c.customRate = num($('editCustCustomRate')?.value);
    c.lowAdvLimit = $('editCustLowAdvLimit')?.value === '' ? 1000 : Math.max(0, num($('editCustLowAdvLimit')?.value));
    c.pkgName = $('editCustPkgName')?.value.trim() || '';
    c.pkgEnd = $('editCustPkgEnd')?.value || '';
    c.note = $('editCustNote').value.trim();
    c.checklist = { pageAccess: Boolean($('ecChkPage')?.checked), bmLinked: Boolean($('ecChkBm')?.checked), pixelReady: Boolean($('ecChkPixel')?.checked), creativeReady: Boolean($('ecChkCreative')?.checked), advancePaid: Boolean($('ecChkAdvance')?.checked) };
    c.updatedAt = Date.now(); save(); closeModal('editCustomerModal'); toast(L('কাস্টমার আপডেট হয়েছে!', 'Customer updated!'));
  }
};
window.renewCustomerPackage = async custId => {
  if (!hasPerm('canEdit')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const baseDateStr = (c.pkgEnd && c.pkgEnd > today()) ? c.pkgEnd : today();
  const baseD = new Date(baseDateStr + 'T00:00:00');
  baseD.setDate(baseD.getDate() + 30);
  const nextEnd = baseD.toISOString().slice(0, 10);
  c.pkgEnd = nextEnd; c.updatedAt = Date.now();
  if (num(c.retainer) > 0 && (await askConfirm(L(`${c.name}-এর প্যাকেজ মেয়াদ ${nextEnd} পর্যন্ত বাড়ানো হলো। ${money(c.retainer)} রিটেইনার বিলও যোগ করবেন?`, `Extend package to ${nextEnd}. Also create a ${money(c.retainer)} retainer bill?`)))) {
    db.works.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), date: today(), platform: 'Meta', customerId: c.id, pageId: db.pages.find(p => p.customerId === c.id)?.id || '', name: `${c.pkgName || 'Monthly Package'} (Renew)`, retainerYm: nextEnd.slice(0, 7), days: 30, dollar: 0, rate: 1, actualDollar: 0, serviceFee: num(c.retainer), serviceFeeType: 'fixed', cardId: '', actualRate: 0, feePct: 0, other: 0, status: 'completed', note: `Package Renewal till ${nextEnd}` });
  }
  save(); logActivity(`প্যাকেজ রিনিউ: ${c.name} (${nextEnd})`); toast(L(`প্যাকেজ রিনিউ হয়ে ${nextEnd} পর্যন্ত বাড়ানো হয়েছে!`, `Package renewed until ${nextEnd}!`));
};
window.sendPkgRenewWhatsApp = custId => {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const wa = normalizeBdPhone(c.phone); if (!wa) return toast(L('মোবাইল নম্বর নেই!', 'No mobile number!'), 'error');
  const agName = db.agency?.name || 'Ads হিসাব ম্যানেজার';
  const txt = `আসসালামু আলাইকুম ${c.name}, ${agName} থেকে জানাচ্ছি—আপনার ${c.pkgName || 'মান্থলি অ্যাডস প্যাকেজ'}-এর মেয়াদ (${c.pkgEnd || today()}) রিনিউ করার সময় হয়েছে। সার্ভিস চলমান রাখতে অনুগ্রহ করে রিনিউ নিশ্চিত করুন।${db.agency?.payInfo ? '\n💳 পেমেন্ট: ' + db.agency.payInfo : ''}\nধন্যবাদ!`;
  if (!db.reminderDates) db.reminderDates = {};
  db.reminderDates[custId] = today(); db.reminderLogs[custId] = new Date().toLocaleString('bn-BD'); save();
  openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(txt)}`);
};
window.toggleCustChecklist = (custId, key) => {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  c.checklist = { ...DEFAULT_CHECKLIST(), ...(c.checklist || {}) }; c.checklist[key] = !c.checklist[key]; c.updatedAt = Date.now();
  save(); openClientProfile(custId);
};
window.clearFollowUp = custId => {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  c.followUpDate = ''; c.updatedAt = Date.now(); save(); toast(L('ফলোআপ সম্পন্ন হিসেবে চিহ্নিত হয়েছে!', 'Follow-up marked done!'));
};
window.generateRetainerBills = async () => {
  if (!hasPerm('canEdit')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  const ym = today().slice(0, 7), eligible = db.customers.filter(c => num(c.retainer) > 0 && !db.works.some(w => w.customerId === c.id && w.retainerYm === ym));
  if (!eligible.length) return toast(L(`চলতি মাসের (${ym}) রিটেইনার বিল ইতিমধ্যেই তৈরি হয়েছে বা রিটেইনার নেই!`, `All retainer bills for ${ym} are already generated or none configured!`), 'warn');
  if (!(await askConfirm(L(`${eligible.length} জন কাস্টমারের জন্য ${ym} মাসের রিটেইনার বিল তৈরি করবেন?`, `Generate ${ym} monthly retainer bills for ${eligible.length} customers?`)))) return;
  eligible.forEach(c => db.works.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), date: today(), platform: 'Meta', customerId: c.id, pageId: db.pages.find(p => p.customerId === c.id)?.id || '', name: `Monthly Retainer (${ym})`, retainerYm: ym, days: 30, dollar: 0, rate: 1, actualDollar: 0, serviceFee: num(c.retainer), serviceFeeType: 'fixed', cardId: '', actualRate: 0, feePct: 0, other: 0, status: 'completed', note: 'Auto Monthly Retainer' }));
  save(); logActivity(`রিটেইনার বিল (${eligible.length} জন)`); toast(L(`${eligible.length}টি রিটেইনার বিল তৈরি হয়েছে!`, `${eligible.length} retainer bills generated!`));
};
window.generateSingleRetainer = custId => {
  if (!hasPerm('canEdit')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  const c = db.customers.find(x => x.id === custId); if (!c || num(c.retainer) <= 0) return;
  const ym = today().slice(0, 7);
  if (db.works.some(w => w.customerId === c.id && w.retainerYm === ym)) return toast(L('চলতি মাসের রিটেইনার ইতিমধ্যে তৈরি হয়েছে!', 'Retainer already billed this month!'), 'warn');
  db.works.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), date: today(), platform: 'Meta', customerId: c.id, pageId: db.pages.find(p => p.customerId === c.id)?.id || '', name: `Monthly Retainer (${ym})`, retainerYm: ym, days: 30, dollar: 0, rate: 1, actualDollar: 0, serviceFee: num(c.retainer), serviceFeeType: 'fixed', cardId: '', actualRate: 0, feePct: 0, other: 0, status: 'completed', note: 'Auto Monthly Retainer' });
  save(); logActivity(`রিটেইনার বিল: ${c.name} (${ym})`); toast(L(`${c.name}-এর রিটেইনার বিল (${money(c.retainer)}) তৈরি হয়েছে!`, `Retainer bill (${money(c.retainer)}) created for ${c.name}!`));
};
window.deleteCustomer = async custId => {
  if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error');
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  if (!(await requireMasterPin(`কাস্টমার "${c.name}" ডিলিট`))) return;
  if (!(await askConfirm(`"${c.name}" ও এর সকল অ্যাসেট/কাজ/পেমেন্ট রিসাইকেল বিনে পাঠাবেন?`))) return;
  const relP = db.pages.filter(x => x.customerId === custId), relW = db.works.filter(x => x.customerId === custId), relPay = db.payments.filter(x => x.customerId === custId);
  moveToTrash('customer_bundle', `কাস্টমার: ${c.name}`, { customer: c, pages: relP, works: relW, payments: relPay });
  markDeleted(custId); relP.forEach(p => markDeleted(p.id)); relW.forEach(w => markDeleted(w.id)); relPay.forEach(p => markDeleted(p.id));
  db.customers = db.customers.filter(x => x.id !== custId); db.pages = db.pages.filter(x => x.customerId !== custId); db.works = db.works.filter(x => x.customerId !== custId); db.payments = db.payments.filter(x => x.customerId !== custId);
  delete db.reminderLogs[custId]; if (db.reminderDates) delete db.reminderDates[custId]; save(); logActivity(`কাস্টমার ট্র্যাশে: ${c.name}`); toast('রিসাইকেল বিনে পাঠানো হয়েছে', 'warn');
};

if ($('pageForm')) $('pageForm').onsubmit = e => {
  e.preventDefault(); const n = $('pageName').value.trim(), plat = $('pagePlatform')?.value || 'Meta';
  db.pages.push({ id: uid(), updatedAt: Date.now(), customerId: $('pageCustomer').value, platform: plat, name: n, link: $('pageLink').value.trim(), adId: $('pageAdId').value.trim(), pixelId: $('pagePixelId').value.trim() });
  save(); e.target.reset(); toast('পেজ / চ্যানেল সেভ হয়েছে!');
};
window.openEditPageModal = pageId => {
  if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const p = db.pages.find(x => x.id === pageId); if (!p) return;
  $('editPageId').value = p.id; if ($('editPagePlatform')) $('editPagePlatform').value = AD_PLATFORMS.includes(p.platform) ? p.platform : 'Meta';
  $('editPageName').value = p.name; $('editPageLink').value = p.link || ''; $('editPageAdId').value = p.adId || ''; $('editPagePixelId').value = p.pixelId || '';
  $('editPageModal').style.display = 'flex';
};
if ($('editPageForm')) $('editPageForm').onsubmit = e => {
  e.preventDefault(); const p = db.pages.find(x => x.id === $('editPageId').value);
  if (p) { p.platform = $('editPagePlatform')?.value || 'Meta'; p.name = $('editPageName').value.trim(); p.link = $('editPageLink').value.trim(); p.adId = $('editPageAdId').value.trim(); p.pixelId = $('editPagePixelId').value.trim(); p.updatedAt = Date.now(); save(); closeModal('editPageModal'); toast('অ্যাসেট আপডেট হয়েছে!'); }
};
window.deletePage = async pageId => { if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); const p = db.pages.find(x => x.id === pageId); if (!p || !(await askConfirm('অ্যাসেটটি রিসাইকেল বিনে পাঠাবেন?'))) return; moveToTrash('page', `অ্যাসেট: ${p.name}`, p); markDeleted(pageId); db.pages = db.pages.filter(x => x.id !== pageId); save(); toast('রিসাইকেল বিনে পাঠানো হয়েছে', 'warn'); };

// Client Profile, Portal Link & CSV
window.copyClientSummaryText = custId => {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const b = billed(custId), p = paid(custId), bal = p - b, works = db.works.filter(w => w.customerId === custId), tu = works.reduce((s, w) => s + num(w.actualDollar), 0);
  const bl = bal < 0 ? `🔴 বকেয়া বাকি: ${money(-bal)}` : (bal > 0 ? `🟢 অ্যাডভান্স জমা: ${money(bal)}` : `✅ ব্যালেন্স: ৳0.00`);
  const rec = [...works].sort(byDateDesc).slice(0, 5).map(w => `• ${w.date} [${platformMeta(w.platform).label}]: ${w.name} (${usd(w.actualDollar)}) = ${money(bill(w))}`).join('\n');
  copyText(`📊 *হিসাবের সারাংশ — ${c.name}*\nএজেন্সি: ${db.agency?.name || 'Ads হিসাব ম্যানেজার'}\n\nমোট ডলার: ${usd(tu)}\nমোট বিল: ${money(b)}\nমোট জমা: ${money(p)}\n${bl}\n\nসাম্প্রতিক কাজ:\n${rec || '—'}\n\n${db.agency?.payInfo ? '💳 পেমেন্ট: ' + db.agency.payInfo : ''}`, 'রিপোর্ট টেক্সট');
};
function buildClientPortalPayload(c) {
  const ag = db.agency || {}, cW = db.works.filter(w => w.customerId === c.id);
  const totalReach = cW.reduce((s, w) => s + num(w.reach), 0), totalClicks = cW.reduce((s, w) => s + num(w.clicks), 0), totalResults = cW.reduce((s, w) => s + num(w.conversions), 0), totalRevenue = cW.reduce((s, w) => s + num(w.revenue), 0);
  return {
    updatedAt: new Date().toLocaleString('bn-BD'), customerId: c.id, agencyName: ag.name || 'Ads হিসাব ম্যানেজার', agencyContact: agencyContactLine(ag),
    payInfo: ag.payInfo || '', qrUrl: ag.qrUrl || '', customerName: c.name, customerPhone: c.phone || '', totalBill: billed(c.id), totalPaid: paid(c.id), balance: clientBalance(c.id),
    bankAccounts: linkedBankChoices().map(x => x.walletKey),
    totalReach, totalClicks, totalResults, totalRevenue,
    works: cW.sort(byDateDesc).map(w => ({ date: w.date, platform: w.platform || 'Meta', name: w.name, page: pname(w.pageId), objective: w.objective || '', budget: num(w.dollar), spentUsd: num(w.actualDollar), refundedUsd: num(w.refundedUsd), bill: bill(w), reach: num(w.reach), clicks: num(w.clicks), results: num(w.conversions), revenue: num(w.revenue), status: w.status })),
    payments: db.payments.filter(p => p.customerId === c.id && p.approvalStatus !== 'pending').sort(byDateDesc).map(p => ({ date: p.date, amount: num(p.amount), method: p.method, ref: p.ref || '', verified: true }))
  };
}
function syncCustomerPortalIfLinked(custId) {
  if (!custId || !navigator.onLine) return;
  const c = db.customers.find(x => x.id === custId); if (!c?.portalToken) return;
  const cfg = readCloudSync(), clean = String(cfg.url || '').trim().replace(/\/+$/, ''); if (!clean) return;
  const pk = `${c.id}_${c.portalToken}`, ep = `${clean}/ads_hisab_portals/${encodeURIComponent(pk)}.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '');
  fetch(ep, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildClientPortalPayload(c)) }).catch(() => {});
}
window.quickCollectPayment = custId => {
  if (!hasPerm('canPayments')) return toast(L('পেমেন্ট এন্ট্রির অনুমতি নেই!', 'No payment permission!'), 'error');
  goToSection('payments');
  if ($('pCustomer')) $('pCustomer').value = custId;
  updatePaymentCustomerStatus();
  const due = Math.max(0, -clientBalance(custId));
  if ($('pAmount') && due > 0) $('pAmount').value = due.toFixed(2);
  setTimeout(() => $('pAmount')?.focus(), 60);
  toast(L('পেমেন্ট ফর্মে কাস্টমার ও বকেয়া বসানো হয়েছে!', 'Customer & due pre-filled in payment form!'));
};
window.shareClientPortalLink = async (custId, btn) => {
  const c = db.customers.find(x => x.id === custId); if (!c) return; const cfg = readCloudSync();
  if (!cfg.url) return toast('Admin Panel-এ Firebase URL সেভ করুন!', 'warn');
  if (!c.portalToken) { c.portalToken = uid().slice(-6); c.updatedAt = Date.now(); save(); }
  await withBtnLoading(btn, '⏳ তৈরি হচ্ছে...', async () => {
    const pk = `${c.id}_${c.portalToken}`, payload = buildClientPortalPayload(c);
    const ep = `${cfg.url.trim().replace(/\/+$/, '')}/ads_hisab_portals/${pk}.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '');
    try { const res = await fetch(ep, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!res.ok) throw new Error('HTTP ' + res.status); copyText(`${location.origin}${location.pathname}?portal=${encodeURIComponent(pk)}`, 'ক্লায়েন্ট পোর্টাল লিংক'); }
    catch (err) { toast('পোর্টাল লিংক আপলোডে সমস্যা!', 'error'); }
  });
};
window.exportClientLedgerCsv = custId => {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const entries = [...db.works.filter(w => w.customerId === custId).map(w => ({ date: w.date, desc: `[${platformMeta(w.platform).label}] ${w.name}`, debit: bill(w), credit: 0 })), ...db.payments.filter(p => p.customerId === custId && p.approvalStatus !== 'pending').map(p => ({ date: p.date, desc: `পেমেন্ট (${p.method})`, debit: 0, credit: num(p.amount) }))].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let bal = 0; const rows = [['Date', 'Description', 'Bill', 'Paid', 'Balance']];
  entries.forEach(en => { bal += en.credit - en.debit; rows.push([en.date, en.desc, en.debit.toFixed(2), en.credit.toFixed(2), bal.toFixed(2)]); });
  downloadBlob('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), `ledger_${c.name.replace(/\s+/g, '_')}_${today()}.csv`, 'text/csv;charset=utf-8;'); toast('লেজার CSV ডাউনলোড হয়েছে!');
};
function getClientTrustBadge(custId) {
  const b = billed(custId), p = paid(custId), bal = p - b, due = Math.max(0, -bal);
  if (b <= 0 && p <= 0) return `<span class="badge-admin" style="font-size:10px">🆕 ${L('নতুন', 'New')}</span>`;
  if (bal >= 0) return `<span class="badge-success" style="font-size:10px">⭐ ${L('ট্রাস্টেড', 'Trusted')}</span>`;
  const ratio = b > 0 ? p / b : 0;
  if (ratio >= 0.75 && due < 5000) return `<span class="badge-admin" style="font-size:10px">👍 ${L('ভালো', 'Good')} (${Math.round(ratio * 100)}%)</span>`;
  if (ratio >= 0.4) return `<span class="badge-warn" style="font-size:10px">⚠️ ${L('বকেয়া প্রবণ', 'Slow Pay')}</span>`;
  return `<span class="badge-danger" style="font-size:10px">🔴 ${L('ঝুঁকিপূর্ণ', 'High Risk')}</span>`;
}
window.downloadPayCardPng = async custId => {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const ag = db.agency || {}, b = billed(custId), p = paid(custId), bal = p - b, due = Math.max(0, -bal);
  const [logoImg, qrImg] = await Promise.all([loadImgCors(ag.logoUrl), loadImgCors(ag.qrUrl)]);
  const W = 580, H = 370, canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#059669'); grad.addColorStop(1, '#2563eb');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 82);
  let tx = 28; if (logoImg) { try { ctx.fillStyle = '#fff'; ctx.fillRect(26, 17, 48, 48); ctx.drawImage(logoImg, 28, 19, 44, 44); tx = 86; } catch (e) {} }
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 20px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText(ag.name || 'Ads হিসাব ম্যানেজার', tx, 42);
  ctx.font = '11.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(agencyContactLine(ag).slice(0, 56), tx, 62);
  ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px Arial, sans-serif';
  ctx.fillText('PAYMENT REQUEST', W - 28, 39);
  ctx.font = '11.5px Arial, sans-serif'; ctx.fillText(today(), W - 28, 59);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 17px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText(c.name, 28, 114);
  ctx.fillStyle = '#64748b'; ctx.font = '12.5px Arial, sans-serif';
  ctx.fillText(`${L('মোবাইল', 'Mobile')}: ${c.phone || '—'}`, 28, 134);
  const cards = [
    [L('মোট বিল', 'Total Bill'), money(b), '#1e293b', '#f8fafc'],
    [L('মোট জমা', 'Total Paid'), money(p), '#059669', '#ecfdf5'],
    [bal < 0 ? L('বর্তমান বকেয়া', 'Current Due') : L('অ্যাডভান্স ব্যালেন্স', 'Advance'), bal < 0 ? money(due) : money(bal), bal < 0 ? '#dc2626' : '#059669', bal < 0 ? '#fef2f2' : '#f0fdf4']
  ];
  cards.forEach(([lbl, val, col, bg], i) => {
    const bx = 28 + i * 178, by = 152, bw = 168, bh = 66;
    ctx.fillStyle = bg; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#e2e8f0'; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#64748b'; ctx.font = '11.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(lbl, bx + 12, by + 23);
    ctx.fillStyle = col; ctx.font = 'bold 16px Inter, Arial, sans-serif'; ctx.fillText(val, bx + 12, by + 48);
  });
  const payY = 236, payW = qrImg ? W - 156 : W - 56;
  ctx.fillStyle = '#eff6ff'; ctx.fillRect(28, payY, payW, 88);
  ctx.fillStyle = '#1e3a8a'; ctx.font = 'bold 12.5px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText(`💳 ${L('পেমেন্ট মাধ্যম', 'Payment Details')}:`, 40, payY + 22);
  ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif';
  wrapTextLines(ctx, ag.payInfo || L('অফিস নম্বরে bKash/Nagad বা ব্যাংক পেমেন্ট করুন', 'Pay via bKash/Nagad/Bank'), payW - 24).slice(0, 3).forEach((ln, li) => ctx.fillText(ln, 40, payY + 42 + li * 17));
  if (qrImg) { try { ctx.drawImage(qrImg, W - 116, payY, 88, 88); } catch (e) {} }
  ctx.textAlign = 'center'; ctx.fillStyle = '#64748b'; ctx.font = '11.5px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText(L('অ্যাড নিরবচ্ছিন্ন রাখতে অনুগ্রহ করে দ্রুত পেমেন্ট সম্পন্ন করুন। ধন্যবাদ!', 'Please complete payment to keep campaigns running seamlessly. Thank you!'), W / 2, H - 16);
  canvas.toBlob(blob => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `pay_card_${c.name.replace(/\s+/g, '_')}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast(L('পেমেন্ট কার্ড PNG ডাউনলোড হয়েছে!', 'Pay Card PNG downloaded!')); }, 'image/png');
};

window.sendWinBackWhatsApp = custId => {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const wa = normalizeBdPhone(c.phone); if (!wa) return toast(L('মোবাইল নম্বর নেই!', 'No mobile number!'), 'error');
  const agName = db.agency?.name || 'Ads হিসাব ম্যানেজার';
  const rate = effectiveRateFor(custId, today()) || rateFor(today()) || 125;
  const txt = L(
    `আসসালামু আলাইকুম ${c.name}, অনেক দিন পর ${agName} থেকে যোগাযোগ করছি! আপনার ব্যবসার নতুন অফার বা প্রোডাক্টের সেলস বাড়াতে Meta, Google ও TikTok অ্যাডস আবার শুরু করতে পারেন। আজকের স্পেশাল ডলার রেট: ${money(rate)}। আগ্রহী হলে রিপ্লাই দিন—ধন্যবাদ!`,
    `Hello ${c.name}, checking in from ${agName}! Ready to relaunch your Meta, Google, or TikTok ads for fresh leads and sales? Current USD billing rate is ${money(rate)}. Reply to restart your campaigns anytime!`
  );
  if (!db.reminderDates) db.reminderDates = {};
  db.reminderDates[custId] = today(); db.reminderLogs[custId] = new Date().toLocaleString('bn-BD'); save();
  openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(txt)}`);
};
function renderWinBackRows() {
  const host = $('winBackRows'); if (!host) return;
  const todayMs = new Date(today() + 'T00:00:00').getTime();
  const dormant = db.customers.map(c => {
    const cw = db.works.filter(w => w.customerId === c.id).sort(byDateDesc);
    if (!cw.length || !cw[0].date) return null;
    const lastMs = new Date(cw[0].date + 'T00:00:00').getTime();
    const daysAgo = Math.floor((todayMs - lastMs) / 86400000);
    return daysAgo >= 30 ? { c, lastWork: cw[0], daysAgo } : null;
  }).filter(Boolean).sort((a, b) => b.daysAgo - a.daysAgo);
  host.innerHTML = dormant.map(d => `<tr><td><strong>${esc(d.c.name)}</strong><br>${getClientTrustBadge(d.c.id)}</td><td>${esc(d.c.phone || '—')}</td><td>${esc(d.lastWork.date)}<br><small class="muted">${esc(d.lastWork.name)}</small></td><td><span class="badge-warn">${d.daysAgo} ${L('দিন', 'days')}</span></td><td><button type="button" class="wa-btn sm" style="margin:0" onclick="sendWinBackWhatsApp('${d.c.id}')">📲 Win-Back</button><button type="button" class="secondary sm" onclick="openClientProfile('${d.c.id}')">👤</button></td></tr>`).join('') || `<tr><td colspan="5">${L('৩০+ দিন নিষ্ক্রিয় কোনো ক্লায়েন্ট নেই 🎉', 'No dormant clients (30+ days) 🎉')}</td></tr>`;
}

// Client Service Agreement / Contract Generator (#agreementModal)
window.openAgreementModal = custId => {
  refresh();
  const sel = $('agreeCustomer');
  if (sel) {
    if (custId && db.customers.some(c => c.id === custId)) sel.value = custId;
    else if (!sel.value && db.customers.length) sel.value = db.customers[0].id;
  }
  const c = db.customers.find(x => x.id === sel?.value);
  if ($('agreeRetainer')) $('agreeRetainer').value = num(c?.retainer);
  if ($('agreeRate')) $('agreeRate').value = num(c?.customRate) || rateFor(today()) || num(db.agency?.defaultRate) || 125;
  if ($('agreeDuration') && !$('agreeDuration').value) $('agreeDuration').value = L('৬ মাস (নবায়নযোগ্য)', '6 Months (Renewable)');
  if ($('agreeTerms') && !$('agreeTerms').value.trim()) {
    $('agreeTerms').value = L(
      '১. প্রতিটি ক্যাম্পেইন চালুর পূর্বে নির্ধারিত অ্যাড বাজেটের ৫০%-১০০% অগ্রিম পরিশোধ করতে হবে।\n২. আন্তর্জাতিক ব্যাংক ও কার্ড চার্জ পরিবর্তন হলে উভয় পক্ষের আলোচনায় ডলার রেট সমন্বয় করা হবে।\n৩. Facebook/Google/TikTok পলিসি মেনে বৈধ পণ্য বা সার্ভিসের বিজ্ঞাপন প্রদান ক্লায়েন্টের দায়িত্ব।\n৪. মাসিক বা সাপ্তাহিক পারফরম্যান্স রিপোর্ট ও লাইভ পোর্টাল অ্যাক্সেস প্রদান করা হবে।',
      '1. 50%-100% advance budget payment is required before launching paid ad campaigns.\n2. USD billing rate may adjust with prior notice upon bank FX or government VAT changes.\n3. Client guarantees products/services comply with Meta, Google & TikTok ad policies.\n4. Regular performance metrics and live Client Portal ledger updates will be provided.'
    );
  }
  renderAgreementPreview();
  if ($('agreementModal')) $('agreementModal').style.display = 'flex';
};
window.renderAgreementPreview = () => {
  const cid = $('agreeCustomer')?.value, c = db.customers.find(x => x.id === cid), ag = db.agency || {};
  if ($('agreeLogoImg')) { $('agreeLogoImg').style.display = ag.logoUrl ? 'block' : 'none'; if (ag.logoUrl) $('agreeLogoImg').src = ag.logoUrl; }
  if ($('agreeAgencyName')) $('agreeAgencyName').textContent = ag.name || 'Ads হিসাব ম্যানেজার';
  if ($('agreeAgencyContact')) $('agreeAgencyContact').textContent = agencyContactLine(ag);
  if ($('agreeDate')) $('agreeDate').textContent = `${L('তারিখ', 'Date')}: ${today()}`;
  if ($('agreeRefNo')) $('agreeRefNo').textContent = '#AGR-' + (c ? c.id.slice(-5).toUpperCase() : '00001');
  const ret = num($('agreeRetainer')?.value), rate = num($('agreeRate')?.value) || 125, dur = $('agreeDuration')?.value || L('৬ মাস', '6 Months'), terms = $('agreeTerms')?.value || '';
  const body = L(
    `ডিজিটাল মার্কেটিং ও পেইড অ্যাডস ম্যানেজমেন্ট চুক্তিপত্র\n\nপ্রথম পক্ষ (এজেন্সি): ${ag.name || 'Ads হিসাব ম্যানেজার'} (${ag.phone || '—'})\nদ্বিতীয় পক্ষ (ক্লায়েন্ট): ${c ? `${c.name} (${c.phone || '—'})` : '—'}\n\nসার্ভিসের আওতা: Meta / Facebook, Google, YouTube এবং TikTok পেইড বিজ্ঞাপন সেটআপ, পিক্সেল/ট্যাগ ট্র্যাকিং ও ক্যাম্পেইন পরিচালনা।\n• সম্মত ডলার বিলিং রেট: ${money(rate)} / USD\n• মাসিক রিটেইনার / সার্ভিস চার্জ: ${ret > 0 ? money(ret) : 'প্রজেক্ট অনুযায়ী'}\n• চুক্তির মেয়াদ: ${dur}\n\nশর্তাবলি:\n${terms}\n${ag.payInfo ? `\n💳 নির্ধারিত পেমেন্ট মাধ্যম: ${ag.payInfo}` : ''}`,
    `DIGITAL ADVERTISING & CAMPAIGN MANAGEMENT AGREEMENT\n\nFirst Party (Agency): ${ag.name || 'Ads Hisab Manager'} (${ag.phone || '—'})\nSecond Party (Client): ${c ? `${c.name} (${c.phone || '—'})` : '—'}\n\nScope of Services: Meta/Facebook, Google, YouTube & TikTok campaign setup, tracking & ongoing optimization.\n• Agreed USD Billing Rate: ${money(rate)} / USD\n• Monthly Retainer Fee: ${ret > 0 ? money(ret) : 'As per campaign'}\n• Agreement Duration: ${dur}\n\nTerms & Conditions:\n${terms}\n${ag.payInfo ? `\n💳 Payment Method: ${ag.payInfo}` : ''}`
  );
  if ($('agreeBodyContent')) $('agreeBodyContent').textContent = body;
  if ($('agreeClientSign')) $('agreeClientSign').textContent = `${c ? c.name : 'Client'} — ${L('ক্লায়েন্ট স্বাক্ষর', 'Client Signature')}`;
  if ($('agreeAgencySign')) $('agreeAgencySign').textContent = `${ag.signText || ag.name || 'Agency'} — ${L('কর্তৃপক্ষের স্বাক্ষর', 'Agency Authorized')}`;
};
window.printAgreement = () => { document.body.classList.add('printing-agree'); window.print(); setTimeout(() => document.body.classList.remove('printing-agree'), 400); };
window.shareAgreementWhatsApp = () => {
  const cid = $('agreeCustomer')?.value, c = db.customers.find(x => x.id === cid);
  const txt = $('agreeBodyContent')?.textContent || '';
  if (!txt) return;
  copyText(txt, L('চুক্তিপত্র', 'Service Agreement'));
  const wa = normalizeBdPhone(c?.phone || '');
  openExternalUrl(wa ? `https://wa.me/${wa}?text=${encodeURIComponent(txt)}` : `https://wa.me/?text=${encodeURIComponent(txt)}`);
};
window.downloadAgreementPng = async () => {
  const cid = $('agreeCustomer')?.value, c = db.customers.find(x => x.id === cid), ag = db.agency || {};
  const logoImg = await loadImgCors(ag.logoUrl), bodyTxt = $('agreeBodyContent')?.textContent || '';
  const W = 760, canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  ctx.font = '13px Inter, "Noto Sans Bengali", Arial, sans-serif';
  const lines = []; bodyTxt.split('\n').forEach(p => wrapTextLines(ctx, p || ' ', W - 80).forEach(l => lines.push(l)));
  const H = Math.max(460, 210 + lines.length * 20); canvas.width = W; canvas.height = H;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#3157e8'; ctx.fillRect(0, 0, W, 10);
  let tx = 36; if (logoImg) { try { ctx.drawImage(logoImg, 36, 22, 44, 44); tx = 90; } catch (e) {} }
  ctx.fillStyle = '#3157e8'; ctx.font = 'bold 21px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(ag.name || 'Ads হিসাব ম্যানেজার', tx, 44);
  ctx.fillStyle = '#64748b'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(agencyContactLine(ag).slice(0, 62), tx, 64);
  ctx.textAlign = 'right'; ctx.fillStyle = '#0f172a'; ctx.font = 'bold 13px Arial, sans-serif'; ctx.fillText('SERVICE AGREEMENT', W - 36, 42);
  ctx.fillStyle = '#475569'; ctx.font = '12px Arial, sans-serif'; ctx.fillText(`${$('agreeRefNo')?.textContent || ''} · ${today()}`, W - 36, 62);
  ctx.textAlign = 'left'; ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(36, 82); ctx.lineTo(W - 36, 82); ctx.stroke();
  let y = 112; ctx.fillStyle = '#1e293b'; ctx.font = '13px Inter, "Noto Sans Bengali", Arial, sans-serif';
  lines.forEach(l => { ctx.fillText(l, 40, y); y += 20; });
  ctx.strokeStyle = '#64748b';
  ctx.beginPath(); ctx.moveTo(48, H - 52); ctx.lineTo(250, H - 52); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W - 250, H - 52); ctx.lineTo(W - 48, H - 52); ctx.stroke();
  ctx.fillStyle = '#475569'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText($('agreeClientSign')?.textContent || 'Client Signature', 48, H - 32);
  ctx.textAlign = 'right'; ctx.fillText($('agreeAgencySign')?.textContent || 'Agency Authorized', W - 48, H - 32);
  canvas.toBlob(blob => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `agreement_${(c?.name || 'client').replace(/\s+/g, '_')}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast(L('এগ্রিমেন্ট PNG ডাউনলোড হয়েছে!', 'Agreement PNG downloaded!')); }, 'image/png');
};

window.openClientProfile = custId => {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const cP = db.pages.filter(p => p.customerId === custId), cW = db.works.filter(w => w.customerId === custId), cPay = db.payments.filter(p => p.customerId === custId && p.approvalStatus !== 'pending');
  const tB = billed(custId), tP = paid(custId), bal = clientBalance(custId), tU = cW.reduce((s, w) => s + num(w.actualDollar), 0), tPr = cW.reduce((s, w) => s + profit(w), 0);
  const balB = bal < 0 ? `<span class="badge-danger">${L('বকেয়া', 'Due')}: ${money(-bal)}</span>` : (bal > 0 ? `<span class="badge-success">${L('অ্যাডভান্স', 'Advance')}: ${money(bal)}</span>` : `<span class="badge-success">${L('সমন্বিত', 'Settled')}</span>`);
  const chk = { ...DEFAULT_CHECKLIST(), ...(c.checklist || {}) };
  const chkLabels = [['pageAccess', 'Page/Channel Access'], ['bmLinked', 'BM/MCC/Ad Acc'], ['pixelReady', 'Pixel/Tag Ready'], ['creativeReady', 'Creative'], ['advancePaid', 'Advance Paid']];
  const chkHtml = chkLabels.map(([k, lbl]) => `<span class="check-pill ${chk[k] ? 'done' : ''}" onclick="toggleCustChecklist('${c.id}','${k}')">${chk[k] ? '✓' : '○'} ${lbl}</span>`).join('');
  const ledger = [...cW.map(w => ({ date: w.date, desc: `[${platformMeta(w.platform).label}] ${w.name} (${usd(w.actualDollar)})`, debit: bill(w), credit: 0 })), ...cPay.map(p => ({ date: p.date, desc: `${L('পেমেন্ট', 'Payment')} (${p.method})`, debit: 0, credit: num(p.amount) }))].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let runB = 0; const ledgerHtml = ledger.map(r => { runB += r.credit - r.debit; return `<tr><td>${esc(r.date)}</td><td>${esc(r.desc)}</td><td class="bad">${r.debit ? money(r.debit) : '—'}</td><td class="good">${r.credit ? money(r.credit) : '—'}</td><td>${runB < 0 ? `<span class="bad">${L('বকেয়া', 'Due')} ${money(-runB)}</span>` : (runB > 0 ? `<span class="good">${L('অ্যাড', 'Adv')} ${money(runB)}</span>` : '৳0')}</td></tr>`; }).join('') || `<tr><td colspan="5">${L('কোনো লেনদেন নেই', 'No transactions')}</td></tr>`;

  $('cpTitle').textContent = `👤 ${c.name} — ${L('প্রোফাইল ও অনবোর্ডিং', 'Profile & Onboarding')}`;
  $('cpBody').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding:12px;background:var(--soft);border-radius:12px;border:1px solid var(--line)">
      <div style="font-size:13px;line-height:1.7"><strong>${L('মোবাইল', 'Mobile')}:</strong> ${esc(c.phone || '—')} · <strong>${L('স্টেজ', 'Stage')}:</strong> <span class="badge-admin">${esc(c.stage || 'Active Client')}</span> ${getClientTrustBadge(c.id)}${num(c.customRate) > 0 ? ` · <span class="badge-success">⭐ ${L('কাস্টম রেট', 'Custom Rate')}: ${money(c.customRate)}</span>` : ''}${(c.pkgName || c.pkgEnd) ? ` · <span class="badge-status status-running">📦 ${esc(c.pkgName || L('প্যাকেজ', 'Package'))}${c.pkgEnd ? ` (${esc(c.pkgEnd)})` : ''}</span>` : ''}${c.followUpDate ? ` · <strong>${L('ফলোআপ', 'Follow-up')}:</strong> ${esc(c.followUpDate)}` : ''}<br><strong>${L('নোট', 'Note')}:</strong> ${esc(c.note || '—')} · <strong>${L('ডলার', 'USD')}:</strong> ${usd(tU)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${bal < 0 ? `<button type="button" class="sm perm-pay" style="background:#059669" onclick="closeModal('clientProfileModal');quickCollectPayment('${c.id}')">💳 ${L('পেমেন্ট নিন', 'Collect Due')}</button>` : ''}
        <button type="button" class="secondary sm" onclick="closeModal('clientProfileModal');openStatementModal('${c.id}')">📑 ${L('স্টেটমেন্ট', 'Statement')}</button>
        <button type="button" class="secondary sm" onclick="closeModal('clientProfileModal');openInvoice('${c.id}')">📄 ${L('ইনভয়েস', 'Invoice')}</button>
        <button type="button" class="secondary sm" onclick="downloadPayCardPng('${c.id}')">📲 ${L('পেমেন্ট কার্ড', 'Pay Card')}</button>
        <button type="button" class="secondary sm" onclick="closeModal('clientProfileModal');openAgreementModal('${c.id}')">📜 ${L('চুক্তি', 'Agreement')}</button>
        ${(c.pkgName || c.pkgEnd) ? `<button type="button" class="secondary sm perm-edit" onclick="renewCustomerPackage('${c.id}');openClientProfile('${c.id}')">🔄 ${L('প্যাকেজ রিনিউ', 'Renew Pkg')}</button>` : ''}
        <button type="button" class="secondary sm" onclick="openMsgTemplates('${c.id}')">💬 ${L('মেসেজ টেমপ্লেট', 'Templates')}</button>
        <button type="button" class="secondary sm" onclick="shareClientPortalLink('${c.id}', this)">🔗 ${L('পোর্টাল', 'Portal')}</button>
        <button type="button" class="secondary sm" onclick="copyClientSummaryText('${c.id}')">📋 ${L('সামারি', 'Summary')}</button>
        <button type="button" class="secondary sm" onclick="exportClientLedgerCsv('${c.id}')">📥 CSV</button>
        <button type="button" class="secondary sm perm-edit" onclick="closeModal('clientProfileModal');openEditCustomerModal('${c.id}')">✏️ ${L('এডিট', 'Edit')}</button>
      </div>
    </div>
    <div style="margin-bottom:12px"><small class="muted" style="font-weight:700">🚀 ${L('অনবোর্ডিং চেকলিস্ট (ক্লিক করে টিক দিন):', 'Onboarding Checklist (Click to toggle):')}</small><div class="check-grid">${chkHtml}</div></div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap"><span class="badge-admin">${L('বিল', 'Bill')}: ${money(tB)}</span><span class="badge-success">${L('আদায়', 'Paid')}: ${money(tP)}</span>${balB} ${isStaff() ? '' : `<span class="badge-status status-running">${L('নিট প্রফিট', 'Net Profit')}: ${money(tPr)}</span>`}</div>
    <h4>📄 ${L('পেজ / চ্যানেল / ওয়েবসাইট', 'Pages / Channels / Assets')} (${cP.length})</h4><ul style="font-size:13px;padding-left:20px;margin-bottom:14px;line-height:1.8">${cP.map(p => `<li>${platformBadge(p.platform)} <strong>${esc(p.name)}</strong> ${p.link ? `(<a href="${esc(p.link)}" target="_blank">${L('লিংক', 'Link')} ↗</a>)` : ''} — Ad: <code>${esc(p.adId || 'N/A')}</code>, Tag/Pixel: <code>${esc(p.pixelId || 'N/A')}</code></li>`).join('') || `<li>${L('কোনো অ্যাসেট নেই', 'No assets')}</li>`}</ul>
    <h4>📑 ${L('লেজার স্টেটমেন্ট', 'Ledger Statement')}</h4><div class="tablewrap" style="max-height:200px;margin-bottom:14px"><table><thead><tr><th>${L('তারিখ', 'Date')}</th><th>${L('বিবরণ', 'Description')}</th><th>${L('ডেবিট', 'Debit')}</th><th>${L('ক্রেডিট', 'Credit')}</th><th>${L('ব্যালেন্স', 'Balance')}</th></tr></thead><tbody>${ledgerHtml}</tbody></table></div>
    <h4>⚡ ${L('ক্যাম্পেইনসমূহ', 'Campaigns')} (${cW.length})</h4><div class="tablewrap" style="max-height:150px"><table><thead><tr><th>${L('তারিখ', 'Date')}</th><th>${L('প্ল্যাটফর্ম ও কাজ', 'Platform & Campaign')}</th><th>${L('বাজেট / ব্যবহৃত $', 'Budget / Spent $')}</th><th>${L('বিল', 'Bill')}</th><th>${L('অ্যাকশন', 'Action')}</th></tr></thead><tbody>${cW.map(w => `<tr><td>${esc(w.date)}</td><td>${platformBadge(w.platform)} ${esc(w.name)}</td><td>${usd(w.dollar)} / <strong>${usd(w.actualDollar)}</strong></td><td>${money(bill(w))}</td><td><button type="button" class="secondary sm" onclick="closeModal('clientProfileModal');openWorkPerfReport('${w.id}')">📊 ${L('রিপোর্ট', 'Report')}</button></td></tr>`).join('') || `<tr><td colspan="5">${L('কোনো কাজ নেই', 'No campaigns')}</td></tr>`}</tbody></table></div>`;
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
  openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${c.name}, ${db.agency?.name || 'Ads হিসাব ম্যানেজার'} থেকে জানাচ্ছি—${p.date}-এ আপনার ${money(p.amount)} (${p.method}) পেমেন্ট গৃহীত হয়েছে। ${bt}। ধন্যবাদ!`)}`);
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
  $('invRows').innerHTML = custWorks.map(w => { const svc = workServiceCharge(w), disc = num(w.discount), tax = workTaxAmount(w); const extras = [svc ? `+ চার্জ ${money(svc)}` : '', disc ? `- ছাড় ${money(disc)}` : '', tax ? `+ VAT ${money(tax)}` : ''].filter(Boolean).join(' '); return `<tr><td>${esc(w.date)}</td><td>${platformBadge(w.platform)} ${esc(w.name)} (${esc(pname(w.pageId) || 'Asset')})</td><td>${usd(w.actualDollar)} × ${money(w.rate)}${extras ? ` (${extras})` : ''}</td><td>${money(bill(w))}</td></tr>`; }).join('') || `<tr><td colspan="4">কোনো কাজের রেকর্ড নেই</td></tr>`;
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
  const contactLines = wrapTextLines(mC, agencyContactLine(ag), 420), workWrapped = custWorks.map(w => ({ w, lines: wrapTextLines(mC, `[${platformMeta(w.platform).label}] ${w.name || ''}`, 280) }));
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
  else workWrapped.forEach(({ w, lines }, idx) => { const rh = Math.max(32, 14 + lines.length * 18); if (idx % 2 === 1) { ctx.fillStyle = '#f8fafc'; ctx.fillRect(40, y, W - 80, rh); } ctx.fillStyle = '#1e293b'; ctx.font = '13px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(w.date || '', 52, y + 21); lines.forEach((ln, li) => ctx.fillText(ln, 155, y + 21 + li * 18)); const svc = workServiceCharge(w), disc = num(w.discount), tax = workTaxAmount(w); const exStr = [svc ? `+${money(svc)}` : '', disc ? `-${money(disc)}` : '', tax ? `+VAT ${money(tax)}` : ''].filter(Boolean).join(' '); ctx.fillText(`${usd(w.actualDollar)} × ${num(w.rate)}${exStr ? ` (${exStr})` : ''}`, 455, y + 21); ctx.textAlign = 'right'; ctx.fillText(money(bill(w)), W - 52, y + 21); ctx.textAlign = 'left'; y += rh; });
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

// Cards, Deposits, Transfers, Refunds, Partner Sharing & Trading
if ($('addCardForm')) $('addCardForm').onsubmit = e => {
  e.preventDefault(); const n = $('newCardInput').value.trim(), lim = num($('newCardLimitInput')?.value); if (!n) return;
  const dueDay = Math.max(0, Math.min(31, Math.round(num($('newCardDueDay')?.value))));
  const vat15 = Boolean($('newCardVat15')?.checked);
  const passportHolder = $('newCardPassportHolder')?.value.trim() || '', passportQuota = $('newCardPassportQuota')?.value === '' ? 12000 : Math.max(0, num($('newCardPassportQuota')?.value));
  const ownerName = $('newCardOwner')?.value.trim() || '', ownerSharePct = Math.max(0, Math.min(100, num($('newCardOwnerSharePct')?.value)));
  db.cards.push({ id: uid(), updatedAt: Date.now(), name: n, limitUsd: lim, dueDay, vat15, passportHolder, passportQuota, ownerName, ownerSharePct }); save();
  $('newCardInput').value = ''; if ($('newCardLimitInput')) $('newCardLimitInput').value = ''; if ($('newCardDueDay')) $('newCardDueDay').value = ''; if ($('newCardVat15')) $('newCardVat15').checked = false; if ($('newCardPassportHolder')) $('newCardPassportHolder').value = ''; if ($('newCardPassportQuota')) $('newCardPassportQuota').value = 12000; if ($('newCardOwner')) $('newCardOwner').value = ''; if ($('newCardOwnerSharePct')) $('newCardOwnerSharePct').value = 0;
  toast(L('নতুন কার্ড যুক্ত হয়েছে!', 'New card added!'));
};
function shouldUseMakerChecker() {
  return Boolean(activeAccount && !isSuperAdmin() && getRules().makerChecker);
}
function queueMakerRequest(kind, summary, amountLabel, payload) {
  if (!Array.isArray(db.makerRequests)) db.makerRequests = [];
  db.makerRequests.unshift({
    id: uid(),
    updatedAt: Date.now(),
    createdAt: Date.now(),
    date: today(),
    kind,
    summary,
    amountLabel,
    payload,
    byName: activeAccount?.name || 'Staff',
    byUsername: activeAccount?.username || '',
    byRole: activeAccount?.role || 'staff',
    status: 'pending'
  });
  save();
  logActivity(`মেকার-চেকার রিকোয়েস্ট: ${summary} (${amountLabel})`);
  toast(L('⏳ মেকার-চেকার লক চালু — সুপার অ্যাডমিন অনুমোদনের পর হিসাব আপডেট হবে!', '⏳ Maker-Checker lock active — sent to Super Admin for approval!'), 'warn');
}
if ($('depositForm')) $('depositForm').onsubmit = e => {
  e.preventDefault();
  if (!$('depositCard').value) return toast(L('কার্ড যোগ করুন!', 'Add a card first!'), 'error');
  const payload = { id: uid(), updatedAt: Date.now(), cardId: $('depositCard').value, date: $('depositDate').value, amount: num($('depositAmount').value), taka: num($('depositTaka').value), bankFeeTk: num($('depositBankFee')?.value), method: $('depositMethod')?.value || 'Bank', note: $('depositNote').value.trim() };
  const cName = db.cards.find(x => x.id === payload.cardId)?.name || 'Card';
  if (shouldUseMakerChecker()) {
    queueMakerRequest('deposit', `কার্ড ডিপোজিট: ${cName} (${payload.method})`, `${usd(payload.amount)} · ${money(payload.taka)}`, payload);
    e.target.reset(); $('depositDate').value = today(); if ($('depositBankFee')) $('depositBankFee').value = 0;
    return;
  }
  db.cardDeposits.push(payload); save(); e.target.reset(); $('depositDate').value = today(); if ($('depositBankFee')) $('depositBankFee').value = 0; if ($('depositMethod') && db.wallets.includes('Bank')) $('depositMethod').value = 'Bank'; syncBankQuickPicker('depositMethod', 'depositBankQuickWrap'); toast(L('ডিপোজিট সেভ হয়েছে!', 'Deposit saved!'));
};
if ($('cardTransferForm')) $('cardTransferForm').onsubmit = async e => {
  e.preventDefault();
  const fId = $('trFromCard').value, tId = $('trToCard').value, amt = num($('trAmount').value);
  if (!fId || !tId || fId === tId) return toast(L('দুটি ভিন্ন কার্ড দিন!', 'Select two different cards!'), 'error');
  const st = getCardStats(fId);
  if (st.balance < amt && !(await askConfirm(L(`ব্যালেন্স আছে ${usd(st.balance)}। ট্রান্সফার করবেন?`, `Balance is ${usd(st.balance)}. Proceed with transfer?`)))) return;
  const payload = { id: uid(), updatedAt: Date.now(), fromCardId: fId, toCardId: tId, date: $('trDate').value, amount: amt, takaValue: +(amt * (st.avgRate || num(db.agency?.defaultRate) || 120)).toFixed(2), note: $('trNote').value.trim() };
  if (shouldUseMakerChecker()) {
    const fName = db.cards.find(x => x.id === fId)?.name || 'Card', tName = db.cards.find(x => x.id === tId)?.name || 'Card';
    queueMakerRequest('cardTransfer', `কার্ড ট্রান্সফার: ${fName} → ${tName}`, usd(amt), payload);
    e.target.reset(); $('trDate').value = today();
    return;
  }
  db.cardTransfers.push(payload); save(); e.target.reset(); $('trDate').value = today(); toast(L('ট্রান্সফার সম্পন্ন!', 'Transfer completed!'));
};
if ($('cardRefundForm')) $('cardRefundForm').onsubmit = e => {
  e.preventDefault();
  const cid = $('rfCard').value, amt = num($('rfAmount').value);
  if (!cid || amt <= 0) return toast(L('সঠিক তথ্য দিন!', 'Enter valid details!'), 'error');
  const payload = { id: uid(), updatedAt: Date.now(), cardId: cid, date: $('rfDate').value, amount: amt, note: $('rfNote').value.trim() };
  if (shouldUseMakerChecker()) {
    const cName = db.cards.find(x => x.id === cid)?.name || 'Card';
    queueMakerRequest('cardRefund', `কার্ড রিফান্ড: ${cName}`, usd(amt), payload);
    e.target.reset(); $('rfDate').value = today();
    return;
  }
  db.cardRefunds.push(payload); save(); e.target.reset(); $('rfDate').value = today(); toast(L('রিফান্ড যোগ হয়েছে!', 'Refund added!'));
};
window.editCardName = cid => {
  const c = db.cards.find(x => x.id === cid); if (!c) return;
  if (!$('editCardModal') || !$('ecId')) return;
  $('ecId').value = c.id;
  $('ecName').value = c.name || '';
  $('ecLimitUsd').value = num(c.limitUsd);
  $('ecDueDay').value = num(c.dueDay);
  $('ecPassportHolder').value = c.passportHolder || '';
  $('ecPassportQuota').value = c.passportQuota === undefined ? 12000 : num(c.passportQuota);
  $('ecOwnerName').value = c.ownerName || '';
  $('ecOwnerSharePct').value = num(c.ownerSharePct);
  if ($('ecVat15')) $('ecVat15').checked = Boolean(c.vat15);
  $('editCardModal').style.display = 'flex';
  setTimeout(() => $('ecName')?.focus(), 40);
};
if ($('editCardForm')) $('editCardForm').onsubmit = e => {
  e.preventDefault();
  const c = db.cards.find(x => x.id === $('ecId')?.value); if (!c) return;
  const oldKey = cardWalletKey(c.name);
  const n = $('ecName')?.value.trim(); if (n) c.name = n;
  const newKey = cardWalletKey(c.name);
  if (oldKey && newKey && oldKey !== newKey) {
    if (Array.isArray(db.wallets)) db.wallets = db.wallets.map(w => w === oldKey ? newKey : w);
    db.payments.forEach(p => { if (p.method === oldKey) p.method = newKey; });
    db.expenses.forEach(ex => { if (ex.method === oldKey) ex.method = newKey; });
    db.cardDeposits.forEach(d => { if (d.method === oldKey) d.method = newKey; });
    db.cashAdjustments.forEach(a => { if (a.method === oldKey) a.method = newKey; });
    db.trades.forEach(t => { if (t.method === oldKey) t.method = newKey; });
    (db.cardRentals || []).forEach(r => { if (r.method === oldKey) r.method = newKey; });
    (db.recurringBills || []).forEach(rb => { if (rb.method === oldKey) rb.method = newKey; });
    (db.walletTransfers || []).forEach(wt => { if (wt.from === oldKey) wt.from = newKey; if (wt.to === oldKey) wt.to = newKey; });
  }
  c.limitUsd = Math.max(0, num($('ecLimitUsd')?.value));
  c.dueDay = Math.max(0, Math.min(31, Math.round(num($('ecDueDay')?.value))));
  c.passportHolder = $('ecPassportHolder')?.value.trim() || '';
  c.passportQuota = Math.max(0, num($('ecPassportQuota')?.value));
  c.ownerName = $('ecOwnerName')?.value.trim() || '';
  c.ownerSharePct = Math.max(0, Math.min(100, num($('ecOwnerSharePct')?.value)));
  c.vat15 = Boolean($('ecVat15')?.checked);
  c.updatedAt = Date.now();
  save(); closeModal('editCardModal');
  toast(L('কার্ড আপডেট হয়েছে!', 'Card updated!'));
};
window.deleteCard = async cid => { if (!hasPerm('canDelete')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error'); const c = db.cards.find(x => x.id === cid); if (!c) return; const bal = getCardStats(cid).balance; if (!(await askConfirm(Math.abs(bal) > 0.01 ? L(`"${c.name}" কার্ডে ${usd(bal)} ব্যালেন্স আছে! ট্র্যাশে পাঠাবেন?`, `"${c.name}" has ${usd(bal)} balance! Move to trash?`) : L(`"${c.name}" ট্র্যাশে পাঠাবেন?`, `Move "${c.name}" to trash?`)))) return; const wk = cardWalletKey(c.name); if (wk && Array.isArray(db.wallets)) db.wallets = db.wallets.filter(w => w !== wk); moveToTrash('card', `কার্ড: ${c.name}`, c); markDeleted(cid); db.cards = db.cards.filter(x => x.id !== cid); save(); toast(L('ট্র্যাশে পাঠানো হয়েছে', 'Moved to trash'), 'warn'); };
window.deleteDeposit = async id => { if (!hasPerm('canDelete')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error'); const d = db.cardDeposits.find(x => x.id === id); if (!d || !(await askConfirm(L('মুছবেন?', 'Delete this entry?')))) return; moveToTrash('deposit', `ডিপোজিট: $${d.amount}`, d); markDeleted(id); db.cardDeposits = db.cardDeposits.filter(x => x.id !== id); save(); toast(L('ট্র্যাশে পাঠানো হয়েছে', 'Moved to trash'), 'warn'); };
window.deleteTransfer = async id => { if (!hasPerm('canDelete') || !(await askConfirm(L('মুছবেন?', 'Delete?')))) return; markDeleted(id); db.cardTransfers = db.cardTransfers.filter(x => x.id !== id); save(); toast(L('মুছে ফেলা হয়েছে', 'Deleted'), 'warn'); };
window.deleteRefund = async id => { if (!hasPerm('canDelete') || !(await askConfirm(L('মুছবেন?', 'Delete?')))) return; markDeleted(id); db.cardRefunds = db.cardRefunds.filter(x => x.id !== id); save(); toast(L('মুছে ফেলা হয়েছে', 'Deleted'), 'warn'); };
window.openCardStatement = cardId => {
  const c = db.cards.find(x => x.id === cardId); if (!c) return; const cnameCard = id => db.cards.find(x => x.id === id)?.name || 'Card';
  const all = [
    ...db.cardDeposits.filter(d => d.cardId === cardId).map(d => ({ date: d.date, type: L('ডিপোজিট', 'Deposit'), desc: `${money(d.taka)} (${d.method || 'Bank'})`, plus: num(d.amount), minus: 0 })),
    ...db.cardTransfers.filter(t => t.toCardId === cardId).map(t => ({ date: t.date, type: L('ট্রান্সফার (+)', 'Transfer (+)'), desc: cnameCard(t.fromCardId), plus: num(t.amount), minus: 0 })),
    ...db.cardRefunds.filter(r => r.cardId === cardId).map(r => ({ date: r.date, type: L('রিফান্ড', 'Refund'), desc: r.note || 'Refund', plus: num(r.amount), minus: 0 })),
    ...db.trades.filter(t => t.cardId === cardId && t.type === 'buy').map(t => ({ date: t.date, type: L('ট্রেড (+)', 'Trade (+)'), desc: t.party, plus: num(t.usd), minus: 0 })),
    ...db.cardTransfers.filter(t => t.fromCardId === cardId).map(t => ({ date: t.date, type: L('ট্রান্সফার (-)', 'Transfer (-)'), desc: cnameCard(t.toCardId), plus: 0, minus: num(t.amount) })),
    ...db.trades.filter(t => t.cardId === cardId && t.type === 'sell').map(t => ({ date: t.date, type: L('ট্রেড (-)', 'Trade (-)'), desc: t.party, plus: 0, minus: num(t.usd) })),
    ...db.works.filter(w => w.cardId === cardId).map(w => ({ date: w.date, type: `${platformMeta(w.platform).label} ${L('খরচ', 'Spend')}`, desc: `${cname(w.customerId)} — ${w.name}`, plus: 0, minus: num(w.actualDollar) })),
    ...(db.cardRentals || []).filter(r => r.cardId === cardId && num(r.spentUsd) > 0).map(r => ({ date: r.date, type: L('কার্ড লেন্ডিং (-)', 'Card Lending (-)'), desc: `${r.userName}${r.adAccount ? ' — ' + r.adAccount : ''} (${L('বরাদ্দ', 'Alloc')}: ${usd(r.allocatedUsd)})`, plus: 0, minus: num(r.spentUsd) }))
  ].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let bal = 0; const st = getCardStats(cardId);
  $('csTitle').textContent = `💳 ${c.name} — ${L('কার্ড স্টেটমেন্ট', 'Card Statement')}`;
  $('csSummary').innerHTML = `<span class="badge-success">${L('জমা', 'In')}: ${usd(st.inUsd)}</span><span class="badge-danger">${L('খরচ', 'Out')}: ${usd(st.outUsd)}</span><span class="badge-admin">${L('ব্যালেন্স', 'Balance')}: ${usd(st.balance)}</span>${st.rentalReserved > 0 ? `<span class="badge-warn">${L('অন্যকে বরাদ্দ বাকি', 'Reserved')}: ${usd(st.rentalReserved)}</span><span class="badge-success">${L('ফ্রি', 'Free')}: ${usd(st.freeBalance)}</span>` : ''}${num(c.limitUsd) > 0 ? `<span class="badge-warn">${L('লিমিট', 'Limit')}: ${usd(c.limitUsd)}</span>` : ''}`;
  $('csRows').innerHTML = all.map(r => { bal += r.plus - r.minus; return `<tr><td>${esc(r.date)}</td><td>${esc(r.type)}</td><td>${esc(r.desc)}</td><td class="good">${r.plus ? '+' + usd(r.plus) : '—'}</td><td class="bad">${r.minus ? '-' + usd(r.minus) : '—'}</td><td class="${bal < 0 ? 'bad' : 'good'}">${usd(bal)}</td></tr>`; }).join('') || `<tr><td colspan="6">${L('কোনো লেনদেন নেই', 'No transactions')}</td></tr>`;
  $('cardStatementModal').style.display = 'flex';
};
function cardLimitBarHtml(spent, limit) {
  const lim = num(limit); if (lim <= 0) return '';
  const pct = Math.min(100, Math.round((num(spent) / lim) * 100));
  const col = pct >= 95 ? '#dc2626' : (pct >= 80 ? '#f59e0b' : '#10b981');
  return `<div class="card-limit-wrap"><div style="display:flex;justify-content:space-between;font-size:10.5px;opacity:.92"><span>${L('লিমিট', 'Limit')}: ${usd(lim)}</span><strong>${pct}%</strong></div><div class="card-limit-bar"><div class="card-limit-fill" style="width:${pct}%;background:${col}"></div></div></div>`;
}
function passportBarHtml(depUsd, quota, holder) {
  const q = num(quota); if (q <= 0) return '';
  const pct = Math.min(100, Math.round((num(depUsd) / q) * 100));
  const col = pct >= 90 ? '#dc2626' : (pct >= 75 ? '#f59e0b' : '#38bdf8');
  return `<div class="card-limit-wrap"><div style="display:flex;justify-content:space-between;font-size:10px;opacity:.9"><span>🛂 ${esc(holder || L('পাসপোর্ট', 'Passport'))}: ${usd(depUsd)}/${usd(q)}</span><strong>${pct}%</strong></div><div class="card-limit-bar"><div class="card-limit-fill" style="width:${pct}%;background:${col}"></div></div></div>`;
}
function cardRentalSummaryMsg(r) {
  const cardName = db.cards.find(x => x.id === r.cardId)?.name || 'Bank Card';
  const rem = cardRentalRemainingUsd(r), tot = cardRentalTotalBill(r), due = cardRentalDueTk(r);
  const dueLine = due > 0 ? `বাকি (Due): ${money(due)}` : (due < 0 ? `অ্যাডভান্স জমা: ${money(-due)}` : `সম্পূর্ণ পরিশোধিত ✅`);
  return `আসসালামু আলাইকুম ${r.userName}, আপনার কার্ড অ্যাড হিসাব (${cardName}${r.adAccount ? ' · ' + r.adAccount : ''}):\n• মোট বরাদ্দ দিয়েছি: ${usd(r.allocatedUsd)}\n• এ পর্যন্ত খরচ হয়েছে: ${usd(r.spentUsd)}\n• অবশিষ্ট ডলার: ${usd(rem)}\n• রেট: ৳${num(r.rate).toFixed(2)}/${L('ডলার', 'USD')} (${r.billingBasis === 'allocated' ? 'বরাদ্দ ভিত্তিক' : 'খরচ ভিত্তিক'})\n• মোট বিল: ${money(tot)}\n• জমা দিয়েছেন: ${money(r.paidTk)}\n• ${dueLine}\nধন্যবাদ — ${db.agency?.name || 'Ads Manager'}`;
}
window.copyCardRentalSummary = id => {
  const r = (db.cardRentals || []).find(x => x.id === id); if (!r) return;
  copyText(cardRentalSummaryMsg(r), L(`${r.userName}-এর কার্ড হিসাব`, `${r.userName} Card Ledger`));
};
window.openCardRentalAction = (id, mode) => {
  const r = (db.cardRentals || []).find(x => x.id === id); if (!r) return;
  const cName = db.cards.find(x => x.id === r.cardId)?.name || 'Card', cSt = getCardStats(r.cardId);
  const rem = cardRentalRemainingUsd(r), tot = cardRentalTotalBill(r), due = cardRentalDueTk(r);
  if ($('cardRentActId')) $('cardRentActId').value = id;
  if ($('cardRentActMode')) $('cardRentActMode').value = mode;
  if ($('cardRentActNote')) $('cardRentActNote').value = '';
  refreshWalletSelects();
  if ($('cardRentActMethod') && r.method) $('cardRentActMethod').value = r.method;
  const titleEl = $('cardRentActionTitle'), metaEl = $('cardRentActionMeta'), lblEl = $('cardRentActAmtLabel'), amtEl = $('cardRentActAmt'), mWrap = $('cardRentActMethodWrap');
  if (metaEl) metaEl.innerHTML = `<strong>👤 ${esc(r.userName)}</strong> · 💳 ${esc(cName)}<br>${L('বর্তমান বরাদ্দ', 'Allocated')}: <strong>${usd(r.allocatedUsd)}</strong> · ${L('খরচ', 'Spent')}: <strong>${usd(r.spentUsd)}</strong> · ${L('বাকি ডলার', 'Remaining')}: <strong class="${rem < 0 ? 'bad' : 'good'}">${usd(rem)}</strong><br>${L('বিল', 'Bill')}: <strong>${money(tot)}</strong> · ${L('জমা', 'Paid')}: <strong class="good">${money(r.paidTk)}</strong> · ${due >= 0 ? `${L('বকেয়া', 'Due')}: <strong class="bad">${money(due)}</strong>` : `${L('অ্যাডভান্স', 'Advance')}: <strong class="good">${money(-due)}</strong>`}`;
  if (mode === 'topup') {
    if (titleEl) titleEl.textContent = `➕ ${L('আরও ডলার বরাদ্দ দিন', 'Add USD Allocation')}`;
    if (lblEl) lblEl.textContent = `${L('নতুন কত ডলার যোগ করবেন ($)?', 'Additional USD to Allocate ($)')} (${L('কার্ডে ফ্রি', 'Card Free')}: ${usd(cSt.freeBalance)})`;
    if (amtEl) { amtEl.value = ''; amtEl.min = '0.01'; amtEl.placeholder = '50'; }
    if (mWrap) mWrap.style.display = 'none';
  } else if (mode === 'spend') {
    if (titleEl) titleEl.textContent = `✏️ ${L('অ্যাড খরচ ($) আপডেট', 'Update Ad Spend ($)')}`;
    if (lblEl) lblEl.textContent = L('তার মোট খরচ হওয়া ডলার ($)', 'Total Spent USD So Far ($)');
    if (amtEl) { amtEl.value = num(r.spentUsd).toFixed(2); amtEl.min = '0'; amtEl.placeholder = '45.50'; }
    if (mWrap) mWrap.style.display = 'none';
  } else {
    if (titleEl) titleEl.textContent = `💰 ${L('টাকা জমা নিন', 'Collect Payment (৳)')}`;
    if (lblEl) lblEl.textContent = L('জমা টাকার পরিমাণ (৳)', 'Payment Amount (৳)');
    if (amtEl) { amtEl.value = due > 0 ? due.toFixed(2) : ''; amtEl.min = '0.01'; amtEl.placeholder = '5000'; }
    if (mWrap) mWrap.style.display = 'block';
  }
  if ($('cardRentActionModal')) $('cardRentActionModal').style.display = 'flex';
  setTimeout(() => amtEl?.focus(), 50);
};
if ($('cardRentActionForm')) $('cardRentActionForm').onsubmit = async e => {
  e.preventDefault();
  const id = $('cardRentActId')?.value, mode = $('cardRentActMode')?.value, amt = num($('cardRentActAmt')?.value), extraNote = $('cardRentActNote')?.value.trim() || '';
  const r = (db.cardRentals || []).find(x => x.id === id); if (!r) return;
  if (mode === 'topup') {
    if (amt <= 0) return toast(L('সঠিক ডলার সংখ্যা দিন!', 'Enter a valid USD amount!'), 'error');
    const cSt = getCardStats(r.cardId);
    if (amt > cSt.freeBalance && !(await askConfirm(L(`এই কার্ডে ফ্রি ডলার আছে ${usd(cSt.freeBalance)}। তবুও আরও ${usd(amt)} বরাদ্দ দিবেন?`, `Card free balance is ${usd(cSt.freeBalance)}. Still allocate ${usd(amt)}?`)))) return;
    r.allocatedUsd = +(num(r.allocatedUsd) + amt).toFixed(2);
    if (extraNote) r.note = [r.note, `+${usd(amt)} (${extraNote})`].filter(Boolean).join(' · ');
    r.updatedAt = Date.now(); save(); closeModal('cardRentActionModal');
    logActivity(`কার্ড লেন্ডিং টপ-আপ: ${r.userName} +${usd(amt)}`);
    toast(L(`${r.userName}-কে আরও ${usd(amt)} বরাদ্দ দেওয়া হয়েছে!`, `Allocated +${usd(amt)} to ${r.userName}!`));
  } else if (mode === 'spend') {
    if (amt < 0) return toast(L('খরচ ০ বা তার বেশি হতে হবে!', 'Spend cannot be negative!'), 'error');
    if (amt > num(r.allocatedUsd) && !(await askConfirm(L(`বরাদ্দ (${usd(r.allocatedUsd)}) থেকে খরচ (${usd(amt)}) বেশি হচ্ছে! সেভ করবেন?`, `Spend (${usd(amt)}) exceeds allocated (${usd(r.allocatedUsd)}). Save anyway?`)))) return;
    r.spentUsd = +amt.toFixed(2);
    if (extraNote) r.note = [r.note, `Spend ${usd(amt)} (${extraNote})`].filter(Boolean).join(' · ');
    r.updatedAt = Date.now(); save(); closeModal('cardRentActionModal');
    logActivity(`কার্ড লেন্ডিং খরচ আপডেট: ${r.userName} = ${usd(amt)}`);
    toast(L(`খরচ আপডেট হয়েছে! তার বাকি আছে ${usd(cardRentalRemainingUsd(r))}`, `Spend updated! Remaining: ${usd(cardRentalRemainingUsd(r))}`));
  } else {
    if (amt <= 0) return toast(L('সঠিক টাকার পরিমাণ দিন!', 'Enter a valid payment amount!'), 'error');
    const method = $('cardRentActMethod')?.value || r.method || 'Cash';
    r.paidTk = +(num(r.paidTk) + amt).toFixed(2);
    r.method = method;
    if (extraNote) r.note = [r.note, `${money(amt)} (${method}: ${extraNote})`].filter(Boolean).join(' · ');
    r.updatedAt = Date.now(); save(); closeModal('cardRentActionModal');
    logActivity(`কার্ড লেন্ডিং পেমেন্ট: ${r.userName} +${money(amt)} (${method})`);
    toast(L(`${money(amt)} জমা সেভ হয়েছে (${method})!`, `Collected ${money(amt)} (${method})!`));
  }
};
window.deleteCardRental = async id => {
  if (!hasPerm('canDelete')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  const r = (db.cardRentals || []).find(x => x.id === id); if (!r) return;
  if (!(await askConfirm(L(`"${r.userName}"-এর ${usd(r.allocatedUsd)} কার্ড বরাদ্দ ট্র্যাশে পাঠাবেন?`, `Move "${r.userName}" (${usd(r.allocatedUsd)}) allocation to trash?`)))) return;
  moveToTrash('cardRental', `কার্ড লেন্ডিং: ${r.userName} (${usd(r.allocatedUsd)})`, r);
  markDeleted(id);
  db.cardRentals = (db.cardRentals || []).filter(x => x.id !== id);
  save(); toast(L('ট্র্যাশে পাঠানো হয়েছে', 'Moved to trash'), 'warn');
};
function updateCardRentPreview() {
  const box = $('cardRentPreview'); if (!box) return;
  const cid = $('cardRentCard')?.value || '', cSt = getCardStats(cid);
  const alloc = num($('cardRentAllocUsd')?.value), spent = num($('cardRentSpentUsd')?.value), rate = num($('cardRentRate')?.value), paidTk = num($('cardRentPaidTk')?.value), basis = $('cardRentBasis')?.value || 'spent';
  const billUsd = basis === 'allocated' ? alloc : spent, totBill = billUsd * rate, dueTk = totBill - paidTk, remUsd = alloc - spent;
  const avgR = cSt.avgRate || num(db.agency?.defaultRate) || 120, estProf = billUsd * (rate - avgR);
  const dueText = dueTk > 0 ? `<strong class="bad">${money(dueTk)}</strong>` : (dueTk < 0 ? `<strong class="good">+${money(-dueTk)} (${L('অ্যাডভান্স', 'Adv')})</strong>` : `<strong class="good">৳0</strong>`);
  box.innerHTML = `${cid ? `${L('কার্ড ফ্রি ব্যালেন্স', 'Card Free')}: <strong class="${cSt.freeBalance < alloc ? 'bad' : 'good'}">${usd(cSt.freeBalance)}</strong> (${L('গড় খরচ রেট', 'Cost Rate')}: ${money(avgR)}) · ` : ''}${L('তার বাকি ডলার', 'Remaining USD')}: <strong class="${remUsd < 0 ? 'bad' : 'good'}">${usd(remUsd)}</strong> · ${L('হিসাব বিল', 'Bill')}: <strong>${money(totBill)}</strong> · ${L('বকেয়া', 'Due')}: ${dueText} · ${L('লাভ', 'Profit')}: <strong class="${estProf >= 0 ? 'good' : 'bad'}">${money(estProf)}</strong>`;
}
['cardRentCard', 'cardRentAllocUsd', 'cardRentSpentUsd', 'cardRentBasis', 'cardRentRate', 'cardRentPaidTk'].forEach(id => {
  if ($(id)) { $(id).addEventListener('input', updateCardRentPreview); $(id).addEventListener('change', updateCardRentPreview); }
});
if ($('cardRentForm')) $('cardRentForm').onsubmit = async e => {
  e.preventDefault();
  const cardId = $('cardRentCard')?.value || '', userName = $('cardRentUser')?.value.trim() || '';
  const allocUsd = num($('cardRentAllocUsd')?.value), spentUsd = num($('cardRentSpentUsd')?.value), rate = num($('cardRentRate')?.value), paidTk = num($('cardRentPaidTk')?.value);
  if (!cardId) return toast(L('প্রথমে একটি কার্ড নির্বাচন করুন!', 'Select a card first!'), 'error');
  if (!userName || allocUsd <= 0 || rate <= 0) return toast(L('ব্যক্তির নাম, বরাদ্দ ডলার ও রেট সঠিকভাবে দিন!', 'Enter valid user, USD allocation, and rate!'), 'error');
  const cSt = getCardStats(cardId);
  if (allocUsd > cSt.freeBalance && !(await askConfirm(L(`এই কার্ডে ফ্রি ডলার আছে ${usd(cSt.freeBalance)}। তবুও ${usd(allocUsd)} বরাদ্দ দিবেন?`, `Card free balance is ${usd(cSt.freeBalance)}. Allocate ${usd(allocUsd)} anyway?`)))) return;
  if (!Array.isArray(db.cardRentals)) db.cardRentals = [];
  const costRate = cSt.avgRate || num(db.agency?.defaultRate) || 120;
  db.cardRentals.push({
    id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
    date: $('cardRentDate')?.value || today(), cardId, userName,
    phone: $('cardRentPhone')?.value.trim() || '', adAccount: $('cardRentAdAcc')?.value.trim() || '',
    allocatedUsd: +allocUsd.toFixed(2), spentUsd: +Math.max(0, spentUsd).toFixed(2),
    billingBasis: $('cardRentBasis')?.value === 'allocated' ? 'allocated' : 'spent',
    rate: +rate.toFixed(2), costRate: +costRate.toFixed(2),
    paidTk: +Math.max(0, paidTk).toFixed(2), method: $('cardRentMethod')?.value || 'Cash',
    note: $('cardRentNote')?.value.trim() || ''
  });
  save(); logActivity(`কার্ড লেন্ডিং: ${userName} (${usd(allocUsd)})`);
  e.target.reset();
  if ($('cardRentDate')) $('cardRentDate').value = today();
  if ($('cardRentSpentUsd')) $('cardRentSpentUsd').value = '0';
  if ($('cardRentPaidTk')) $('cardRentPaidTk').value = '0';
  if ($('cardRentRate')) $('cardRentRate').value = rateFor(today()) || num(db.agency?.defaultRate) || 125;
  if ($('cardRentMethod') && db.wallets.includes('Cash')) $('cardRentMethod').value = 'Cash';
  updateCardRentPreview();
  toast(L('কার্ড ডলার বরাদ্দ সেভ হয়েছে!', 'Card allocation saved!'));
};
function renderCards() {
  if (isStaff()) return; const totals = db.cards.map(c => ({ ...c, ...getCardStats(c.id) })), cnameCard = id => db.cards.find(x => x.id === id)?.name || '—';
  if ($('cardMetrics')) $('cardMetrics').innerHTML = totals.map(c => `<div class="metric-card m1" style="padding:15px"><small>${esc(c.name)}${c.vat15 ? ' · 15% VAT' : ''}${num(c.dueDay) > 0 ? ` · 📅 ${c.dueDay}` : ''}</small><strong>${usd(c.balance)}</strong><span class="trend">${L('গড় রেট', 'Avg Rate')}: ${c.avgRate ? money(c.avgRate) : '—'}${c.depBankFee ? ` (+${money(c.depBankFee)} ফি)` : ''}${c.rentalReserved > 0 ? ` · 🔒 ${L('বরাদ্দ বাকি', 'Reserved')}: ${usd(c.rentalReserved)}` : ''}</span>${cardLimitBarHtml(c.outUsd, c.limitUsd)}${passportBarHtml(c.depUsd, c.passportQuota, c.passportHolder)}</div>`).join('') || `<div class="muted">${L('কোনো কার্ড নেই', 'No cards yet')}</div>`;
  if ($('dashCardSummary')) $('dashCardSummary').innerHTML = totals.map(c => `<div style="padding:6px 10px;border-radius:9px;background:var(--soft);border:1px solid var(--line);font-size:12px"><strong>${esc(c.name)}:</strong> <span class="${c.balance < 20 ? 'bad' : 'good'}">${usd(c.balance)}</span></div>`).join('') || `<span class="muted">${L('কোনো কার্ড নেই', 'No cards')}</span>`;
  if ($('cardBalanceRows')) $('cardBalanceRows').innerHTML = totals.map(c => {
    const pq = num(c.passportQuota), pp = pq > 0 ? Math.min(100, Math.round((c.depUsd / pq) * 100)) : 0;
    const resSub = c.rentalReserved > 0 ? `<br><small class="muted">🔒 ${L('অন্যকে বরাদ্দ বাকি', 'Reserved')}: ${usd(c.rentalReserved)} · ${L('ফ্রি', 'Free')}: <strong class="${c.freeBalance < 0 ? 'bad' : 'good'}">${usd(c.freeBalance)}</strong></small>` : '';
    return `<tr><td><strong>${esc(c.name)}</strong>${c.vat15 ? ' <span class="badge-warn" style="font-size:10px">15% VAT</span>' : ''}${num(c.dueDay) > 0 ? ` <span class="badge-admin" style="font-size:10px">📅 ${L('বিল', 'Bill')}: ${c.dueDay}</span>` : ''}${c.ownerName ? ` <span class="badge-admin" style="font-size:10px">🤝 ${esc(c.ownerName)} (${num(c.ownerSharePct)}%)</span>` : ''}${num(c.limitUsd) > 0 ? `<br><small class="muted">${L('লিমিট', 'Limit')}: ${usd(c.limitUsd)}</small>` : ''}${pq > 0 ? `<br><small class="muted">🛂 ${esc(c.passportHolder || 'Passport')}: ${usd(c.depUsd)} / ${usd(pq)} (${pp}%)</small>` : ''}</td><td>${usd(c.inUsd)}</td><td>${money(c.inTk)}${c.depBankFee ? `<br><small class="muted">+${L('ব্যাংক ফি', 'Fee')} ${money(c.depBankFee)}</small>` : ''}</td><td>${c.avgRate ? money(c.avgRate) : '—'}</td><td>${usd(c.outUsd)}${num(c.limitUsd) > 0 ? `<div class="prog-wrap" style="margin-top:4px"><div class="prog-bar" style="width:${Math.min(100, Math.round((c.outUsd / num(c.limitUsd)) * 100))}%;background:${(c.outUsd / num(c.limitUsd)) >= 0.95 ? '#dc2626' : ((c.outUsd / num(c.limitUsd)) >= 0.8 ? '#f59e0b' : '#10b981')}"></div></div>` : ''}</td><td class="${c.balance < 0 ? 'bad' : 'good'}"><strong>${usd(c.balance)}</strong>${resSub}</td><td><button type="button" class="secondary sm" onclick="openCardStatement('${c.id}')">📄 ${L('স্টেটমেন্ট', 'Statement')}</button><button type="button" class="secondary sm" onclick="editCardName('${c.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deleteCard('${c.id}')">${L('মুছুন', 'Del')}</button></td></tr>`;
  }).join('') || `<tr><td colspan="7">${L('কোনো কার্ড নেই', 'No cards yet')}</td></tr>`;
  if ($('cardPartnerRows')) {
    const partnered = totals.filter(c => c.ownerName || num(c.ownerSharePct) > 0);
    $('cardPartnerRows').innerHTML = partnered.map(c => {
      const cWorks = db.works.filter(w => w.cardId === c.id);
      const cardSpend = cWorks.reduce((s, w) => s + num(w.actualDollar), 0);
      const cardNetProf = cWorks.reduce((s, w) => s + profit(w), 0);
      const pct = Math.max(0, Math.min(100, num(c.ownerSharePct)));
      const shareAmt = Math.max(0, cardNetProf) * (pct / 100);
      const cnLow = c.name.toLowerCase(), owLow = (c.ownerName || '').toLowerCase();
      const paidAmt = db.expenses.filter(e => e.approvalStatus !== 'pending' && e.category === 'Partner Share' && ((e.title || '').toLowerCase().includes(cnLow) || (owLow && (e.title || '').toLowerCase().includes(owLow)) || (e.note || '').toLowerCase().includes(cnLow))).reduce((s, e) => s + num(e.amount), 0);
      const payable = Math.max(0, shareAmt - paidAmt);
      return `<tr><td><strong>${esc(c.name)}</strong><br><small class="muted">🤝 ${esc(c.ownerName || L('পার্টনার', 'Partner'))}</small></td><td>${usd(cardSpend)}</td><td class="${cardNetProf >= 0 ? 'good' : 'bad'}"><strong>${money(cardNetProf)}</strong></td><td>${pct}%</td><td style="color:var(--brand);font-weight:700">${money(shareAmt)}</td><td class="good">${money(paidAmt)}</td><td class="${payable > 0 ? 'bad' : 'muted'}"><strong>${money(payable)}</strong></td><td>${payable > 0 ? `<button type="button" class="sm" style="background:#059669" onclick="payPartnerShare('${c.id}',${payable.toFixed(2)})">💸 ${L('পে করুন', 'Pay')}</button>` : `<span class="badge-success">✓ ${L('পেইড', 'Settled')}</span>`}</td></tr>`;
    }).join('') || `<tr><td colspan="8">${L('পার্টনার শেয়ারিং যুক্ত কোনো কার্ড নেই — কার্ড যোগ/এডিট করার সময় পার্টনারের নাম ও % দিন', 'No cards configured with partner profit share yet')}</td></tr>`;
  }
  const allRentals = [...(db.cardRentals || [])].sort(byDateDesc);
  const totAlloc = allRentals.reduce((s, r) => s + num(r.allocatedUsd), 0);
  const totSpent = allRentals.reduce((s, r) => s + num(r.spentUsd), 0);
  const totRemUsd = allRentals.reduce((s, r) => s + Math.max(0, cardRentalRemainingUsd(r)), 0);
  const totDueTk = allRentals.reduce((s, r) => s + Math.max(0, cardRentalDueTk(r)), 0);
  const totRentProf = allRentals.reduce((s, r) => s + cardRentalProfit(r), 0);
  const activeUsersCount = allRentals.filter(r => cardRentalRemainingUsd(r) > 0.01).length;
  if ($('cardRentMetrics')) $('cardRentMetrics').innerHTML = `
    <div class="metric-card m1" style="padding:15px"><small>${L('মোট ডলার দিলাম / বরাদ্দ', 'Total USD Allocated')}</small><strong>${usd(totAlloc)}</strong><span class="trend">${activeUsersCount} ${L('জনের হাতে বাজেট সচল', 'active allocations')}</span></div>
    <div class="metric-card m2" style="padding:15px"><small>${L('অ্যাডে মোট খরচ হয়েছে', 'Total Ad Spend')}</small><strong>${usd(totSpent)}</strong><span class="trend">${totAlloc > 0 ? Math.round((totSpent / totAlloc) * 100) : 0}% ${L('ব্যবহৃত', 'used')}</span></div>
    <div class="metric-card m3" style="padding:15px"><small>${L('তাদের কাছে বাকি আছে', 'Remaining Quota')}</small><strong>${usd(totRemUsd)}</strong><span class="trend">${L('কার্ডে বরাদ্দকৃত ব্যালেন্স', 'Reserved on cards')}</span></div>
    <div class="metric-card m4" style="padding:15px"><small>${L('বকেয়া পাওনা / কার্ড লাভ', 'Receivable / Profit')}</small><strong style="font-size:18px">${money(totDueTk)}</strong><span class="trend">${L('কার্ড লাভ', 'Profit')}: ${money(totRentProf)}</span></div>
  `;
  updateCardRentPreview();
  const rQ = ($('cardRentSearch')?.value || '').trim().toLowerCase(), rF = $('cardRentFilter')?.value || 'all';
  const filteredRentals = allRentals.filter(r => {
    const rem = cardRentalRemainingUsd(r), due = cardRentalDueTk(r), cName = cnameCard(r.cardId);
    if (rF === 'active' && rem <= 0.01) return false;
    if (rF === 'due' && due <= 0.5) return false;
    if (rF === 'settled' && (rem > 0.01 || due > 0.5)) return false;
    if (rQ && !`${r.userName} ${r.phone || ''} ${r.adAccount || ''} ${cName} ${r.note || ''}`.toLowerCase().includes(rQ)) return false;
    return true;
  });
  if ($('cardRentRows')) $('cardRentRows').innerHTML = filteredRentals.map(r => {
    const rem = cardRentalRemainingUsd(r), totBill = cardRentalTotalBill(r), due = cardRentalDueTk(r), prof = cardRentalProfit(r);
    const pct = num(r.allocatedUsd) > 0 ? Math.min(100, Math.max(0, Math.round((num(r.spentUsd) / num(r.allocatedUsd)) * 100))) : 0;
    const barCol = rem < 0 ? '#dc2626' : (pct >= 85 ? '#f59e0b' : '#10b981');
    const remBadge = rem < 0 ? `<span class="badge-danger" style="font-size:10px">${L('ওভারস্পেন্ড!', 'Overspent!')}</span>` : (rem <= 10 && rem > 0 ? `<span class="badge-warn" style="font-size:10px">${L('শেষ পর্যায়ে', 'Low Quota')}</span>` : (rem === 0 ? `<span class="badge-admin" style="font-size:10px">${L('শেষ', 'Used Up')}</span>` : `<span class="badge-success" style="font-size:10px">${L('চালানো যাবে', 'Active')}</span>`));
    const wa = normalizeBdPhone(r.phone), waMsg = encodeURIComponent(cardRentalSummaryMsg(r));
    const waBtn = wa.length >= 11 ? `<a href="https://wa.me/${wa}?text=${waMsg}" target="_blank" rel="noopener noreferrer" style="text-decoration:none"><button type="button" class="secondary sm" title="${L('WhatsApp-এ হিসাব পাঠান', 'Send on WhatsApp')}">📲</button></a>` : '';
    const moneyCol = `${L('বিল', 'Bill')}: <strong>${money(totBill)}</strong> <small class="muted">(${r.billingBasis === 'allocated' ? L('বরাদ্দ', 'Alloc') : L('খরচ', 'Spent')} × ৳${num(r.rate)})</small><br>${L('জমা', 'Paid')}: <span class="good">${money(r.paidTk)}</span> <small class="badge-admin" style="font-size:10px">${esc(r.method || 'Cash')}</small><br>${due > 0.5 ? `<span class="bad"><strong>${L('বাকি', 'Due')}: ${money(due)}</strong></span>` : (due < -0.5 ? `<span class="good"><strong>${L('অ্যাডভান্স', 'Adv')}: ${money(-due)}</strong></span>` : `<span class="badge-success">✓ ${L('পেইড', 'Paid')}</span>`)}`;
    return `<tr><td>${esc(r.date)}<br><strong>${esc(cnameCard(r.cardId))}</strong></td><td><strong>${esc(r.userName)}</strong>${r.phone ? `<br><small class="muted">📞 ${esc(r.phone)}</small>` : ''}${r.adAccount ? `<br><small class="muted">🎯 ${esc(r.adAccount)}</small>` : ''}${r.note ? `<br><small class="muted">${esc(r.note)}</small>` : ''}</td><td><strong>${usd(r.allocatedUsd)}</strong></td><td><strong>${usd(r.spentUsd)}</strong><div class="prog-wrap" style="margin-top:4px"><div class="prog-bar" style="width:${pct}%;background:${barCol}"></div></div><small class="muted">${pct}%</small></td><td class="${rem < 0 ? 'bad' : 'good'}"><strong>${usd(rem)}</strong><br>${remBadge}</td><td>${moneyCol}</td><td class="${prof >= 0 ? 'good' : 'bad'} priv-blur"><strong>${money(prof)}</strong><br><small class="muted">${L('কস্ট', 'Cost')}: ৳${cardRentalCostRate(r).toFixed(1)}</small></td><td><button type="button" class="secondary sm" onclick="openCardRentalAction('${r.id}','topup')" title="${L('আরও ডলার দিন', 'Top-up USD')}">+$</button><button type="button" class="secondary sm" onclick="openCardRentalAction('${r.id}','spend')" title="${L('খরচ আপডেট', 'Update Spend')}">✏️ ${L('খরচ', 'Spend')}</button><button type="button" class="sm" style="background:#059669" onclick="openCardRentalAction('${r.id}','pay')" title="${L('টাকা জমা নিন', 'Collect Payment')}">💰</button>${waBtn}<button type="button" class="secondary sm" onclick="copyCardRentalSummary('${r.id}')" title="${L('হিসাব কপি', 'Copy Summary')}">📋</button><button type="button" class="danger sm perm-del" onclick="deleteCardRental('${r.id}')">✕</button></td></tr>`;
  }).join('') || `<tr><td colspan="8">${L('কার্ড দিয়ে অন্যকে অ্যাড চালানোর কোনো এন্ট্রি নেই — উপরের ফর্ম থেকে যোগ করুন', 'No card lending allocations yet — add one above')}</td></tr>`;
  if ($('depositHistoryRows')) $('depositHistoryRows').innerHTML = [...db.cardDeposits].sort(byDateDesc).map(d => { const totTk = num(d.taka) + num(d.bankFeeTk), r = num(d.amount) > 0 ? totTk / num(d.amount) : 0; return `<tr><td>${esc(d.date)}</td><td><strong>${esc(cnameCard(d.cardId))}</strong></td><td>${usd(d.amount)}</td><td>${money(d.taka)}${num(d.bankFeeTk) > 0 ? `<br><small class="bad">+${L('ফি', 'Fee')} ${money(d.bankFeeTk)}</small>` : ''}</td><td>${r ? money(r) : '—'}</td><td><span class="badge-admin">${esc(d.method || 'Bank')}</span> ${esc(d.note || '')}</td><td><button type="button" class="secondary sm" onclick="openEditDepositModal('${d.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deleteDeposit('${d.id}')">${L('মুছুন', 'Del')}</button></td></tr>`; }).join('') || `<tr><td colspan="7">${L('কোনো ডিপোজিট নেই', 'No deposits')}</td></tr>`;
  if ($('cardTransferRows')) $('cardTransferRows').innerHTML = [...db.cardTransfers].sort(byDateDesc).map(t => `<tr><td>${esc(t.date)}</td><td>${esc(cnameCard(t.fromCardId))} → ${esc(cnameCard(t.toCardId))}</td><td><strong>${usd(t.amount)}</strong></td><td><button type="button" class="danger sm perm-del" onclick="deleteTransfer('${t.id}')">${L('মুছুন', 'Del')}</button></td></tr>`).join('') || `<tr><td colspan="4">${L('কোনো ট্রান্সফার নেই', 'No transfers')}</td></tr>`;
  if ($('cardRefundRows')) $('cardRefundRows').innerHTML = [...db.cardRefunds].sort(byDateDesc).map(r => `<tr><td>${esc(r.date)}</td><td>${esc(cnameCard(r.cardId))}</td><td class="good">+${usd(r.amount)}</td><td>${esc(r.note || '—')}</td><td><button type="button" class="danger sm perm-del" onclick="deleteRefund('${r.id}')">${L('মুছুন', 'Del')}</button></td></tr>`).join('') || `<tr><td colspan="5">${L('কোনো রিফান্ড নেই', 'No refunds')}</td></tr>`;
}
window.payPartnerShare = (cardId, payableAmt) => {
  if (!hasPerm('canExpenses')) return toast(L('খরচ যোগ করার অনুমতি নেই!', 'No expense permission!'), 'error');
  const c = db.cards.find(x => x.id === cardId); if (!c) return;
  goToSection('expenses');
  if ($('expDate')) $('expDate').value = today();
  if ($('expCategory')) $('expCategory').value = 'Partner Share';
  if ($('expTitle')) $('expTitle').value = `Partner Share — ${c.ownerName || 'Partner'} (${c.name})`;
  if ($('expAmount')) $('expAmount').value = Math.max(0, num(payableAmt)).toFixed(2);
  if ($('expNote')) $('expNote').value = `${c.name} কার্ড প্রফিট শেয়ার (${num(c.ownerSharePct)}%)`;
  $('expAmount')?.focus();
  toast(L('পার্টনার শেয়ার পেমেন্ট ফর্মে বসানো হয়েছে — যাচাই করে সেভ করুন!', 'Partner share pre-filled in expense form!'));
};
window.openEditDepositModal = id => { const d = db.cardDeposits.find(x => x.id === id); if (!d) return; fillSelect('edCard', db.cards, ''); refreshWalletSelects(); $('edId').value = d.id; $('edCard').value = d.cardId; $('edDate').value = d.date; $('edAmount').value = d.amount; $('edTaka').value = d.taka; if ($('edBankFee')) $('edBankFee').value = num(d.bankFeeTk); if ($('edMethod')) $('edMethod').value = d.method || 'Bank'; $('edNote').value = d.note || ''; $('editDepositModal').style.display = 'flex'; };
if ($('editDepositForm')) $('editDepositForm').onsubmit = e => { e.preventDefault(); const d = db.cardDeposits.find(x => x.id === $('edId').value); if (d) { d.cardId = $('edCard').value; d.date = $('edDate').value; d.amount = num($('edAmount').value); d.taka = num($('edTaka').value); d.bankFeeTk = num($('edBankFee')?.value); d.method = $('edMethod')?.value || 'Bank'; d.note = $('edNote').value.trim(); d.updatedAt = Date.now(); save(); closeModal('editDepositModal'); toast(L('আপডেট হয়েছে!', 'Updated!')); } };

function updateTradePreview() { const type = $('trdType')?.value || 'sell', u = num($('trdUsd')?.value), br = num($('trdBuyRate')?.value), sr = num($('trdSellRate')?.value), p = num($('trdPaidTk')?.value), tot = type === 'sell' ? u * sr : u * br, due = Math.max(0, tot - p), pr = type === 'sell' ? (sr - br) * u : 0; if ($('trdPreview')) $('trdPreview').innerHTML = type === 'sell' ? `${L('বিক্রি বিল', 'Sale Total')}: <strong>${money(tot)}</strong> · ${L('বাকি', 'Due')}: <strong class="bad">${money(due)}</strong> · ${L('লাভ', 'Profit')}: <strong class="${pr >= 0 ? 'good' : 'bad'}">${money(pr)}</strong>` : `${L('কেনা খরচ', 'Buy Cost')}: <strong>${money(tot)}</strong> · ${L('বাকি', 'Due')}: <strong class="bad">${money(due)}</strong>`; }
['trdType', 'trdUsd', 'trdBuyRate', 'trdSellRate', 'trdPaidTk'].forEach(id => { if ($(id)) { $(id).oninput = updateTradePreview; $(id).onchange = updateTradePreview; } });
if ($('trdCard')) $('trdCard').onchange = () => { const avg = cardAvgRate($('trdCard').value); if (avg > 0 && $('trdBuyRate')) { $('trdBuyRate').value = avg; updateTradePreview(); } };
if ($('tradeForm')) $('tradeForm').onsubmit = e => { e.preventDefault(); const type = $('trdType').value, u = num($('trdUsd').value); db.trades.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), date: $('trdDate').value || today(), type, party: $('trdParty').value.trim(), phone: $('trdPhone').value.trim(), cardId: $('trdCard').value || '', usd: u, buyRate: num($('trdBuyRate').value), sellRate: num($('trdSellRate').value), paidTk: num($('trdPaidTk').value), method: $('trdMethod')?.value || 'Cash', note: $('trdNote').value.trim() }); save(); e.target.reset(); $('trdDate').value = today(); if ($('trdMethod') && db.wallets.includes('Cash')) $('trdMethod').value = 'Cash'; updateTradePreview(); toast(L('ডলার ট্রেড সেভ হয়েছে!', 'Dollar trade saved!')); };
window.payTradeDue = async id => { const t = db.trades.find(x => x.id === id); if (!t) return; const tot = t.type === 'sell' ? num(t.usd) * num(t.sellRate) : num(t.usd) * num(t.buyRate), rem = Math.max(0, tot - num(t.paidTk)), add = await askPrompt(L(`বাকি ${money(rem)}। কত যোগ করবেন?`, `Due ${money(rem)}. Add payment:`), rem.toFixed(2), 'ট্রেড বকেয়া পরিশোধ', { type: 'number' }); if (add === null) return; const v = num(add); if (v <= 0) return toast(L('সঠিক সংখ্যা দিন!', 'Enter a valid amount!'), 'error'); t.paidTk = +(num(t.paidTk) + v).toFixed(2); t.updatedAt = Date.now(); save(); toast(L('আপডেট হয়েছে!', 'Updated!')); };
window.sendTradeWhatsApp = id => { const t = db.trades.find(x => x.id === id); if (!t) return; const wa = normalizeBdPhone(t.phone); if (!wa) return toast(L('মোবাইল নম্বর নেই!', 'No mobile number!'), 'error'); const tot = t.type === 'sell' ? num(t.usd) * num(t.sellRate) : num(t.usd) * num(t.buyRate); openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${t.party}, $${num(t.usd).toFixed(2)} ট্রেডের মোট ${money(tot)}, জমা ${money(t.paidTk)}, বাকি ${money(Math.max(0, tot - num(t.paidTk)))}।`)}`); };
window.deleteTrade = async id => { if (!hasPerm('canDelete') || !(await askConfirm(L('মুছবেন?', 'Delete?')))) return; const t = db.trades.find(x => x.id === id); if (t) { moveToTrash('trade', `ট্রেড: ${t.party} $${t.usd}`, t); markDeleted(id); db.trades = db.trades.filter(x => x.id !== id); save(); toast(L('ট্র্যাশে পাঠানো হয়েছে', 'Moved to trash'), 'warn'); } };
function buildSupplierLedger() {
  const map = new Map();
  db.trades.forEach(t => {
    const rawName = String(t.party || '').trim() || 'Unknown', key = rawName.toLowerCase();
    if (!map.has(key)) map.set(key, { name: rawName, phone: '', buyUsd: 0, sellUsd: 0, buyCost: 0, buyPaid: 0, sellTotal: 0, sellPaid: 0, trades: [] });
    const g = map.get(key);
    if (!g.phone && t.phone) g.phone = t.phone;
    g.trades.push(t);
    if (t.type === 'buy') { g.buyUsd += num(t.usd); g.buyCost += num(t.usd) * num(t.buyRate); g.buyPaid += num(t.paidTk); }
    else { g.sellUsd += num(t.usd); g.sellTotal += num(t.usd) * num(t.sellRate); g.sellPaid += num(t.paidTk); }
  });
  return Array.from(map.values()).map(g => {
    const weOwe = Math.max(0, g.buyCost - g.buyPaid), theyOwe = Math.max(0, g.sellTotal - g.sellPaid);
    return { ...g, weOwe, theyOwe, netBal: theyOwe - weOwe };
  });
}
window.settlePartyTradeDue = async partyKey => {
  const list = buildSupplierLedger(), p = list.find(x => x.name.toLowerCase() === String(partyKey || '').toLowerCase());
  if (!p) return;
  const targetTrades = p.trades.filter(t => {
    const tot = t.type === 'sell' ? num(t.usd) * num(t.sellRate) : num(t.usd) * num(t.buyRate);
    return tot - num(t.paidTk) > 0.01;
  }).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!targetTrades.length) return toast(L('এই পার্টির কোনো বকেয়া নেই!', 'No pending balance for this party!'), 'warn');
  const maxRem = targetTrades.reduce((s, t) => s + Math.max(0, (t.type === 'sell' ? num(t.usd) * num(t.sellRate) : num(t.usd) * num(t.buyRate)) - num(t.paidTk)), 0);
  const inAmt = await askPrompt(L(`${p.name}-এর সাথে মোট অপরিশোধিত ব্যালেন্স ${money(maxRem)}। কত টাকা সেটেল করবেন?`, `Total open balance with ${p.name} is ${money(maxRem)}. Amount to settle:`), maxRem.toFixed(2), 'পার্টি লেজার সেটেল', { type: 'number' });
  if (inAmt === null) return;
  let rem = num(inAmt); if (rem <= 0) return toast(L('সঠিক সংখ্যা দিন!', 'Enter a valid amount!'), 'error');
  targetTrades.forEach(t => {
    if (rem <= 0) return;
    const tot = t.type === 'sell' ? num(t.usd) * num(t.sellRate) : num(t.usd) * num(t.buyRate), due = Math.max(0, tot - num(t.paidTk)), pay = Math.min(due, rem);
    t.paidTk = +(num(t.paidTk) + pay).toFixed(2); t.updatedAt = Date.now(); rem -= pay;
  });
  save(); logActivity(`ট্রেড সেটেল: ${p.name} (${money(num(inAmt) - rem)})`); toast(L('পার্টি লেজার আপডেট হয়েছে!', 'Party ledger settled!'));
};
window.sendSupplierWhatsApp = partyKey => {
  const p = buildSupplierLedger().find(x => x.name.toLowerCase() === String(partyKey || '').toLowerCase());
  if (!p) return;
  const wa = normalizeBdPhone(p.phone); if (!wa) return toast(L('মোবাইল নম্বর নেই!', 'No mobile number!'), 'error');
  const agName = db.agency?.name || 'Ads হিসাব ম্যানেজার';
  const balTxt = p.netBal > 0 ? `পাওনা বকেয়া: ${money(p.netBal)}` : (p.netBal < 0 ? `আমাদের দেনা: ${money(-p.netBal)}` : `হিসাব সম্পূর্ণ সমন্বিত (৳0)`);
  const txt = `আসসালামু আলাইকুম ${p.name}, ${agName} থেকে USD ট্রেডিং লেজার সামারি:\n• মোট কেনা: ${usd(p.buyUsd)}\n• মোট বিক্রি: ${usd(p.sellUsd)}\n• ${balTxt}\nধন্যবাদ!`;
  openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(txt)}`);
};
function renderTrades() {
  if (isStaff()) return; const q = ($('tradeSearch')?.value || '').toLowerCase(), cc = id => db.cards.find(x => x.id === id)?.name || L('বাইরের উৎস', 'External'), list = [...db.trades].sort(byDateDesc).filter(t => !q || (t.party || '').toLowerCase().includes(q) || (t.phone || '').includes(q));
  const sellDue = db.trades.filter(t => t.type === 'sell').reduce((s, t) => s + Math.max(0, num(t.usd) * num(t.sellRate) - num(t.paidTk)), 0);
  const buyPayable = db.trades.filter(t => t.type === 'buy').reduce((s, t) => s + Math.max(0, num(t.usd) * num(t.buyRate) - num(t.paidTk)), 0);
  if ($('tradeMetrics')) $('tradeMetrics').innerHTML = `<div class="metric-card m1"><small>${L('কেনা ডলার', 'USD Bought')}</small><strong>${usd(db.trades.filter(t => t.type === 'buy').reduce((s, t) => s + num(t.usd), 0))}</strong></div><div class="metric-card m2"><small>${L('বিক্রি ডলার', 'USD Sold')}</small><strong>${usd(db.trades.filter(t => t.type === 'sell').reduce((s, t) => s + num(t.usd), 0))}</strong></div><div class="metric-card m3"><small>${L('ট্রেড প্রফিট', 'Trade Profit')}</small><strong>${money(db.trades.reduce((s, t) => s + tradeProfit(t), 0))}</strong></div><div class="metric-card m4"><small>${L('বিক্রি বকেয়া / কেনা দেনা', 'Receivable / Payable')}</small><strong style="font-size:17px">${money(sellDue)} <small style="font-size:12px;opacity:.85">/ -${money(buyPayable)}</small></strong></div>`;
  if ($('tradeRows')) $('tradeRows').innerHTML = list.map(t => { const tot = t.type === 'sell' ? num(t.usd) * num(t.sellRate) : num(t.usd) * num(t.buyRate), due = Math.max(0, tot - num(t.paidTk)), pr = tradeProfit(t); return `<tr><td>${esc(t.date)}</td><td>${t.type === 'sell' ? `<span class="badge-success">${L('বিক্রি', 'Sell')}</span>` : `<span class="badge-admin">${L('কেনা', 'Buy')}</span>`}</td><td><strong>${esc(t.party)}</strong><br><small class="muted">${esc(t.phone || '')} · ${esc(cc(t.cardId))}</small></td><td><strong>${usd(t.usd)}</strong></td><td>${money(t.buyRate)} / ${money(t.sellRate)}</td><td>${L('মোট', 'Total')}: ${money(tot)}<br>${L('জমা', 'Paid')}: <span class="good">${money(t.paidTk)}</span><br>${due > 0 ? `<span class="bad">${L('বাকি', 'Due')}: ${money(due)}</span>` : '<span class="good">Paid</span>'}</td><td class="${pr >= 0 ? 'good' : 'bad'}">${t.type === 'sell' ? money(pr) : '—'}</td><td>${due > 0 ? `<button type="button" class="secondary sm" onclick="payTradeDue('${t.id}')">+ ${L('টাকা', 'Pay')}</button>` : ''}<button type="button" class="secondary sm" onclick="sendTradeWhatsApp('${t.id}')">📲</button><button type="button" class="danger sm perm-del" onclick="deleteTrade('${t.id}')">${L('মুছুন', 'Del')}</button></td></tr>`; }).join('') || `<tr><td colspan="8">${L('কোনো ট্রেডিং নেই', 'No dollar trades yet')}</td></tr>`;
  if ($('supplierSummaryRows')) {
    const sup = buildSupplierLedger().filter(g => !q || g.name.toLowerCase().includes(q) || (g.phone || '').includes(q));
    $('supplierSummaryRows').innerHTML = sup.map(g => {
      const kEsc = esc(g.name).replace(/'/g, "\\'");
      const balHtml = g.theyOwe > 0.01 && g.weOwe > 0.01
        ? `<span class="good">${L('পাওনা', 'Recv')}: ${money(g.theyOwe)}</span><br><span class="bad">${L('দেনা', 'Pay')}: ${money(g.weOwe)}</span>`
        : (g.theyOwe > 0.01 ? `<span class="good">${L('পাওনা', 'Receivable')}: ${money(g.theyOwe)}</span>` : (g.weOwe > 0.01 ? `<span class="bad">${L('আমাদের দেনা', 'Payable')}: ${money(g.weOwe)}</span>` : `<span class="badge-success">✓ ${L('সমন্বিত', 'Settled')}</span>`));
      const hasOpen = g.theyOwe > 0.01 || g.weOwe > 0.01;
      return `<tr><td><strong>${esc(g.name)}</strong><br><small class="muted">${esc(g.phone || '—')} (${g.trades.length} ${L('লেনদেন', 'tx')})</small></td><td>${usd(g.buyUsd)}<br><small class="muted">${money(g.buyCost)}</small></td><td>${usd(g.sellUsd)}<br><small class="muted">${money(g.sellTotal)}</small></td><td><small>${L('দেনা পরিশোধ', 'Paid Out')}: ${money(g.buyPaid)}<br>${L('আদায়', 'Collected')}: ${money(g.sellPaid)}</small></td><td>${balHtml}</td><td><button type="button" class="secondary sm" onclick="openTradeStatementModal('${kEsc}')" title="${L('স্টেটমেন্ট', 'Statement')}">📄</button>${hasOpen ? `<button type="button" class="sm" style="background:#059669" onclick="settlePartyTradeDue('${kEsc}')">💸 ${L('সেটেল', 'Settle')}</button>` : ''}<button type="button" class="secondary sm" onclick="sendSupplierWhatsApp('${kEsc}')">📲 WhatsApp</button></td></tr>`;
    }).join('') || `<tr><td colspan="6">${L('কোনো সাপ্লায়ার বা পার্টি লেজার নেই', 'No supplier or party ledger yet')}</td></tr>`;
  }
}
let currentTradePartyKey = '';
window.openTradeStatementModal = partyKey => {
  const p = buildSupplierLedger().find(x => x.name.toLowerCase() === String(partyKey || '').toLowerCase());
  if (!p) return toast(L('পার্টি পাওয়া যায়নি!', 'Party not found!'), 'error');
  currentTradePartyKey = p.name;
  const ag = db.agency || {};
  if ($('trdStmtAgName')) $('trdStmtAgName').textContent = ag.name || 'Ads হিসাব ম্যানেজার';
  if ($('trdStmtAgContact')) $('trdStmtAgContact').textContent = agencyContactLine(ag);
  if ($('trdStmtParty')) $('trdStmtParty').textContent = p.name;
  if ($('trdStmtPhone')) $('trdStmtPhone').textContent = p.phone || '—';
  if ($('trdStmtSummary')) $('trdStmtSummary').innerHTML = `
    <div class="closing-box"><small>${L('মোট কেনা ($)', 'Bought ($)')}</small><strong>${usd(p.buyUsd)}</strong></div>
    <div class="closing-box"><small>${L('মোট বিক্রি ($)', 'Sold ($)')}</small><strong>${usd(p.sellUsd)}</strong></div>
    <div class="closing-box"><small>${L('পাওনা বকেয়া (Receivable)', 'They Owe')}</small><strong class="good">${money(p.theyOwe)}</strong></div>
    <div class="closing-box"><small>${L('আমাদের দেনা (Payable)', 'We Owe')}</small><strong class="bad">${money(p.weOwe)}</strong></div>`;
  const rows = [...p.trades].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if ($('trdStmtRows')) $('trdStmtRows').innerHTML = rows.map(t => {
    const rate = t.type === 'sell' ? num(t.sellRate) : num(t.buyRate);
    const tot = num(t.usd) * rate, paidAmt = num(t.paidTk), rem = Math.max(0, tot - paidAmt);
    return `<tr><td>${esc(t.date)}</td><td>${t.type === 'sell' ? `<span class="badge-success">${L('বিক্রি', 'Sell')}</span>` : `<span class="badge-admin">${L('কেনা', 'Buy')}</span>`}</td><td><strong>${usd(t.usd)}</strong></td><td>${money(rate)}</td><td>${money(tot)}</td><td class="good">${money(paidAmt)}</td><td class="${rem > 0 ? 'bad' : 'muted'}">${money(rem)}</td></tr>`;
  }).join('') || `<tr><td colspan="7">${L('কোনো লেনদেন নেই', 'No transactions')}</td></tr>`;
  if ($('tradeStatementModal')) $('tradeStatementModal').style.display = 'flex';
};
window.printTradeStatement = () => { document.body.classList.add('printing-trdstmt'); window.print(); setTimeout(() => document.body.classList.remove('printing-trdstmt'), 400); };
window.shareTradeStatementWhatsApp = () => { if (currentTradePartyKey) sendSupplierWhatsApp(currentTradePartyKey); };
window.downloadTradeStatementPng = async () => {
  const p = buildSupplierLedger().find(x => x.name.toLowerCase() === String(currentTradePartyKey || '').toLowerCase());
  if (!p) return;
  const ag = db.agency || {}, logoImg = await loadImgCors(ag.logoUrl);
  const rows = [...p.trades].sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).slice(0, 20);
  const W = 780, H = 290 + Math.max(1, rows.length) * 28, canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#059669'; ctx.fillRect(0, 0, W, 10);
  let tx = 34; if (logoImg) { try { ctx.drawImage(logoImg, 34, 22, 42, 42); tx = 86; } catch (e) {} }
  ctx.fillStyle = '#059669'; ctx.font = 'bold 20px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(ag.name || 'Ads হিসাব ম্যানেজার', tx, 44);
  ctx.fillStyle = '#64748b'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(agencyContactLine(ag).slice(0, 58), tx, 64);
  ctx.textAlign = 'right'; ctx.fillStyle = '#0f172a'; ctx.font = 'bold 13px Arial, sans-serif'; ctx.fillText('USD TRADING STATEMENT', W - 34, 42);
  ctx.fillStyle = '#475569'; ctx.font = '12.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`${p.name} (${p.phone || '—'})`, W - 34, 62);
  ctx.textAlign = 'left';
  let y = 96;
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(34, y, W - 68, 44); ctx.strokeStyle = '#cbd5e1'; ctx.strokeRect(34, y, W - 68, 44);
  ctx.font = 'bold 12px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillStyle = '#334155'; ctx.fillText(`কেনা: ${usd(p.buyUsd)}`, 46, y + 27); ctx.fillText(`বিক্রি: ${usd(p.sellUsd)}`, 210, y + 27);
  ctx.fillStyle = '#059669'; ctx.fillText(`পাওনা: ${money(p.theyOwe)}`, 390, y + 27);
  ctx.textAlign = 'right'; ctx.fillStyle = '#dc2626'; ctx.fillText(`আমাদের দেনা: ${money(p.weOwe)}`, W - 46, y + 27);
  ctx.textAlign = 'left'; y += 60;
  ctx.fillStyle = '#ecfdf5'; ctx.fillRect(34, y, W - 68, 28); ctx.fillStyle = '#065f46'; ctx.font = 'bold 12px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText('তারিখ', 44, y + 19); ctx.fillText('ধরণ', 140, y + 19); ctx.fillText('ডলার', 230, y + 19); ctx.fillText('রেট', 330, y + 19); ctx.fillText('মোট (৳)', 430, y + 19); ctx.fillText('জমা (৳)', 555, y + 19); ctx.textAlign = 'right'; ctx.fillText('বাকি (৳)', W - 44, y + 19); ctx.textAlign = 'left'; y += 28;
  rows.forEach((t, i) => {
    if (i % 2 === 1) { ctx.fillStyle = '#f8fafc'; ctx.fillRect(34, y, W - 68, 28); }
    const rate = t.type === 'sell' ? num(t.sellRate) : num(t.buyRate), tot = num(t.usd) * rate, rem = Math.max(0, tot - num(t.paidTk));
    ctx.fillStyle = '#1e293b'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif';
    ctx.fillText(t.date || '', 44, y + 19); ctx.fillText(t.type === 'sell' ? 'বিক্রি' : 'কেনা', 140, y + 19);
    ctx.fillText(usd(t.usd), 230, y + 19); ctx.fillText(money(rate), 330, y + 19); ctx.fillText(money(tot), 430, y + 19);
    ctx.fillStyle = '#059669'; ctx.fillText(money(t.paidTk), 555, y + 19);
    ctx.textAlign = 'right'; ctx.fillStyle = rem > 0 ? '#dc2626' : '#64748b'; ctx.fillText(money(rem), W - 44, y + 19); ctx.textAlign = 'left'; y += 28;
  });
  canvas.toBlob(blob => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `trade_statement_${p.name.replace(/\s+/g, '_')}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast(L('ট্রেডিং স্টেটমেন্ট PNG ডাউনলোড হয়েছে!', 'Trading Statement PNG downloaded!')); }, 'image/png');
};
if ($('tradeSearch')) $('tradeSearch').oninput = renderTrades;

// Rates (with 1-Click Broadcast Alert!)
if ($('rateForm')) $('rateForm').onsubmit = e => {
  e.preventDefault();
  const val = num($('rateValue').value), d = $('rateDate').value || today(), note = $('rateNote').value.trim();
  const payload = { id: uid(), updatedAt: Date.now(), date: d, value: val, note };
  if (typeof shouldUseMakerChecker === 'function' && shouldUseMakerChecker()) {
    queueMakerRequest('rate', `নতুন দৈনিক ডলার রেট (${d})`, `৳${val}/$`, payload);
    e.target.reset(); $('rateDate').value = today();
    return;
  }
  db.rates.push(payload);
  save(); logActivity(`নতুন ডলার রেট: ৳${val}`); e.target.reset(); $('rateDate').value = today();
  if ($('rateAlertBar') && $('rateAlertText')) {
    $('rateAlertText').textContent = L(`💵 নতুন ডলার রেট ৳${val} সেভ হয়েছে! সব কাস্টমারকে ১ ক্লিকে WhatsApp-এ জানাবেন?`, `💵 New USD Rate ৳${val} saved! Broadcast to all customers via WhatsApp?`);
    $('rateAlertBar').style.display = 'flex';
  }
  toast(L('রেট সেভ হয়েছে! চাইলে ১ ক্লিকে সবাইকে WhatsApp-এ জানাতে পারেন।', 'Rate saved! You can broadcast to all clients in 1 click.'));
};
window.openEditRateModal = id => { if (!hasPerm('canEdit')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error'); const r = db.rates.find(x => x.id === id); if (!r) return; $('erId').value = r.id; $('erDate').value = r.date; $('erValue').value = r.value; $('erNote').value = r.note || ''; $('editRateModal').style.display = 'flex'; };
if ($('editRateForm')) $('editRateForm').onsubmit = e => { e.preventDefault(); const r = db.rates.find(x => x.id === $('erId').value); if (r) { r.date = $('erDate').value; r.value = num($('erValue').value); r.note = $('erNote').value.trim(); r.updatedAt = Date.now(); save(); closeModal('editRateModal'); toast(L('আপডেট হয়েছে!', 'Updated!')); } };
window.deleteRate = id => { if (!hasPerm('canDelete')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error'); const r = db.rates.find(x => x.id === id); if (!r) return; moveToTrash('rate', `রেট: ${money(r.value)}`, r); markDeleted(id); db.rates = db.rates.filter(x => x.id !== id); save(); toast(L('ট্র্যাশে পাঠানো হয়েছে', 'Moved to trash'), 'warn'); };

if ($('rateSlabForm')) $('rateSlabForm').onsubmit = e => {
  e.preventDefault();
  const minUsd = Math.max(0, num($('rsMinUsd')?.value)), maxUsd = Math.max(0, num($('rsMaxUsd')?.value)), rate = num($('rsRate')?.value);
  if (rate <= 0) return toast(L('সঠিক স্ল্যাব রেট দিন!', 'Enter valid slab rate!'), 'error');
  if (maxUsd > 0 && maxUsd < minUsd) return toast(L('সর্বোচ্চ ডলার সর্বনিম্ন ডলারের চেয়ে বড় হতে হবে!', 'Max USD must be >= Min USD!'), 'error');
  if (!Array.isArray(db.rateSlabs)) db.rateSlabs = [];
  db.rateSlabs.push({ id: uid(), updatedAt: Date.now(), minUsd, maxUsd, rate });
  save(); logActivity(`রেট স্ল্যাব: $${minUsd}-${maxUsd || '∞'} = ৳${rate}`);
  e.target.reset(); if ($('rsMaxUsd')) $('rsMaxUsd').value = 0;
  toast(L('রেট স্ল্যাব যুক্ত হয়েছে!', 'Rate slab added!'));
};
window.deleteRateSlab = async id => {
  if (!hasPerm('canDelete') || !(await askConfirm(L('রেট স্ল্যাবটি মুছবেন?', 'Delete rate slab?')))) return;
  markDeleted(id); db.rateSlabs = (db.rateSlabs || []).filter(s => s.id !== id); save(); toast(L('মুছে ফেলা হয়েছে', 'Deleted'), 'warn');
};
function renderRateSlabs() {
  if (!$('rateSlabRows')) return;
  const list = [...(db.rateSlabs || [])].sort((a, b) => num(a.minUsd) - num(b.minUsd));
  $('rateSlabRows').innerHTML = list.map(s => `<tr><td><strong>${usd(s.minUsd)}</strong> — ${num(s.maxUsd) > 0 ? usd(s.maxUsd) : L('সীমাহীন ($∞)', 'Unlimited')}</td><td><strong class="good">${money(s.rate)}</strong></td><td><button type="button" class="danger sm perm-del" onclick="deleteRateSlab('${s.id}')">${L('মুছুন', 'Del')}</button></td></tr>`).join('') || `<tr><td colspan="3">${L('কোনো টায়ার্ড রেট স্ল্যাব সেট করা নেই', 'No tiered rate slabs configured')}</td></tr>`;
}

// Works + Multi-Platform Brief + Results + Proof
if ($('wProofFile')) $('wProofFile').onchange = async e => { const f = e.target.files?.[0]; if (!f) return; try { pendingWorkProof = await compressImageFile(f, 700, 0.80); toast('প্রুফ স্ক্রিনশট প্রস্তুত!'); } catch (err) { toast('ছবি ত্রুটি!', 'error'); } };
if ($('ewProofFile')) $('ewProofFile').onchange = async e => { const f = e.target.files?.[0]; if (!f) return; try { pendingEditWorkProof = await compressImageFile(f, 700, 0.80); if ($('ewProofPreview')) { $('ewProofPreview').src = pendingEditWorkProof; $('ewProofPreview').style.display = 'block'; } toast('নতুন প্রুফ স্ক্রিনশট প্রস্তুত!'); } catch (err) {} };

window.quickAddSpend = async workId => {
  if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const w = db.works.find(x => x.id === workId); if (!w) return;
  if (isLocked24h(w)) return toast('২৪ ঘণ্টার বেশি পুরোনো কাজ স্টাফ এডিট করতে পারবেন না!', 'error');
  const add = await askPrompt(`"${w.name}"-এ কত ডলার ($) যোগ করবেন?`, '10', 'ডলার খরচ যোগ', { type: 'number' }); if (add === null) return; const v = num(add); if (v <= 0) return toast('সঠিক সংখ্যা দিন', 'error');
  w.actualDollar = +(num(w.actualDollar) + v).toFixed(2); w.updatedAt = Date.now(); save(); syncCustomerPortalIfLinked(w.customerId); toast(`+$${v} যোগ হয়েছে!`);
};
window.refundWork = async workId => {
  if (!hasPerm('canEdit')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  const w = db.works.find(x => x.id === workId); if (!w) return;
  if (isLocked24h(w)) return toast(L('২৪ ঘণ্টার বেশি পুরোনো কাজ স্টাফ এডিট করতে পারবেন না!', 'Staff cannot edit entries older than 24h!'), 'error');
  const curSpent = num(w.actualDollar);
  if (curSpent <= 0) return toast(L('এই কাজে ব্যবহৃত ডলার $0 — রিফান্ড করার মতো খরচ নেই!', 'Spent USD is $0 — nothing to refund!'), 'warn');
  const inp = await askPrompt(L(`"${w.name}" (ব্যবহৃত: ${usd(curSpent)}) থেকে কত ডলার ($) আংশিক রিফান্ড/ক্রেডিট নোট করবেন?`, `Partial refund USD for "${w.name}" (Spent: ${usd(curSpent)}):`), Math.min(5, curSpent).toFixed(2), 'ডলার রিফান্ড / ক্রেডিট', { type: 'number' });
  if (inp === null) return;
  const v = num(inp);
  if (v <= 0 || v > curSpent) return toast(L(`সঠিক ডলার দিন (০ থেকে ${curSpent} এর মধ্যে)!`, `Enter valid amount (0 < x <= ${curSpent})!`), 'error');
  w.actualDollar = +(Math.max(0, curSpent - v)).toFixed(2);
  w.refundedUsd = +(num(w.refundedUsd) + v).toFixed(2);
  w.note = [w.note || '', `Refund -$${v.toFixed(2)} (${today()})`].filter(Boolean).join(' | ');
  w.updatedAt = Date.now();
  save(); syncCustomerPortalIfLinked(w.customerId); logActivity(`ক্যাম্পেইন রিফান্ড: ${w.name} (-$${v.toFixed(2)})`);
  toast(L(`↩️ $${v.toFixed(2)} আংশিক রিফান্ড সমন্বয় হয়েছে!`, `↩️ Credited -$${v.toFixed(2)} refund!`));
};
window.openDailySpendModal = () => {
  if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const host = $('dailySpendList'); if (!host) return;
  const running = db.works.filter(w => (w.status || 'running') === 'running' && num(w.dollar) > 0);
  if (!running.length) return toast('কোনো চলমান বাজেটযুক্ত ক্যাম্পেইন নেই!', 'warn');
  host.innerHTML = running.map(w => `<label style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;background:var(--soft);border:1px solid var(--line);border-radius:9px;margin:0;cursor:pointer"><span style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink)"><input type="checkbox" class="ds-chk row-chk" data-id="${w.id}" ${num(w.actualDollar) < num(w.dollar) ? 'checked' : ''}> <span>${platformBadge(w.platform)} <strong>${esc(w.name)}</strong> <small class="muted">(${esc(cname(w.customerId))})</small></span></span><span style="display:flex;align-items:center;gap:6px"><small class="muted">${usd(w.actualDollar)}/${usd(w.dollar)}</small><input type="number" step=".01" min="0" value="${+(num(w.dollar) / Math.max(1, num(w.days))).toFixed(2)}" class="ds-amt" data-id="${w.id}" style="width:76px;min-height:30px;padding:4px 6px"></span></label>`).join('');
  $('dailySpendModal').style.display = 'flex';
};
if ($('applyDailySpendConfirmBtn')) $('applyDailySpendConfirmBtn').onclick = () => {
  if (!hasPerm('canEdit')) return; const chks = [...document.querySelectorAll('.ds-chk:checked')]; if (!chks.length) return toast('কমপক্ষে একটি নির্বাচন করুন!', 'warn');
  let c = 0; const touchedCusts = new Set(); chks.forEach(ch => { const id = ch.dataset.id, w = db.works.find(x => x.id === id), amt = num(document.querySelector(`.ds-amt[data-id="${id}"]`)?.value); if (w && amt > 0 && !isLocked24h(w)) { w.actualDollar = +(num(w.actualDollar) + amt).toFixed(2); w.updatedAt = Date.now(); touchedCusts.add(w.customerId); c++; } });
  if (c) { save(); touchedCusts.forEach(syncCustomerPortalIfLinked); closeModal('dailySpendModal'); toast(`${c}টি ক্যাম্পেইনে খরচ যোগ হয়েছে!`); }
};
window.renewWork = workId => {
  if (!hasPerm('canEdit')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error'); const w = db.works.find(x => x.id === workId); if (!w) return;
  goToSection('works'); if ($('wPlatform')) $('wPlatform').value = AD_PLATFORMS.includes(w.platform) ? w.platform : 'Meta';
  $('wDate').value = today(); $('wCustomer').value = w.customerId || ''; updatePages(); $('wPage').value = w.pageId || '';
  const custCustom = num(db.customers.find(x => x.id === w.customerId)?.customRate);
  $('wName').value = w.name.replace(/ \(Renew\)$/i, '') + ' (Renew)'; $('wDays').value = w.days || 7; $('wDollar').value = w.dollar || 0;
  $('wRate').value = custCustom > 0 ? custCustom : (effectiveRateFor(w.customerId, today(), num(w.dollar)) || w.rate || rateFor(today()));
  if ($('wRate')) delete $('wRate').dataset.manualEdit;
  $('wActualDollar').value = 0;
  if ($('wServiceFee')) $('wServiceFee').value = w.serviceFee || 0; if ($('wServiceFeeType')) $('wServiceFeeType').value = w.serviceFeeType || 'fixed';
  if ($('wDiscount')) $('wDiscount').value = num(w.discount); if ($('wTaxPct')) $('wTaxPct').value = num(w.taxPct);
  if ($('wStaff')) $('wStaff').value = w.staffName || ''; if ($('wCommPct')) $('wCommPct').value = num(w.commPct);
  if ($('wObjective')) $('wObjective').value = w.objective || 'Messages'; if ($('wTargetLoc')) $('wTargetLoc').value = w.targetLoc || ''; if ($('wTargetAge')) $('wTargetAge').value = w.targetAge || '';
  if ($('wPostUrl')) $('wPostUrl').value = w.postUrl || ''; if ($('wAudience')) $('wAudience').value = w.audience || ''; if ($('wAdCopy')) $('wAdCopy').value = w.adCopy || '';
  if ($('wAdAccount')) { const aaObj = (db.adAccounts || []).find(a => a.id === w.adAccountId); $('wAdAccount').value = (aaObj && (aaObj.status || 'Active') === 'Active') ? aaObj.id : ''; }
  if (!isStaff()) { $('wCard').value = w.cardId || ''; $('wActualRate').value = w.actualRate || cardAvgRate(w.cardId) || 0; $('wFeePct').value = w.feePct || 0; $('wOther').value = 0; }
  $('wStatus').value = 'running'; syncVatBtnState(); updateWorkPreview(); document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' }); toast(L('রিনিউ তথ্য ফর্মে বসানো হয়েছে!', 'Renewal details loaded into form!'));
};
const progressBarHtml = (s, b) => !b || b <= 0 ? '' : `<div class="prog-wrap"><div class="prog-bar" style="width:${Math.min(100, Math.round((s / b) * 100))}%;background:${s > b ? '#dc2626' : (s / b >= 0.85 ? '#d97706' : '#10b981')}"></div></div>`;

if ($('workForm')) $('workForm').onsubmit = async e => {
  e.preventDefault(); const date = $('wDate').value, rate = num($('wRate').value) || effectiveRateFor($('wCustomer').value, date, num($('wActualDollar').value) || num($('wDollar').value)); if (!rate) return toast('ডলারের বিলিং রেট দিন!', 'error');
  const pageId = $('wPage').value || '', custId = $('wCustomer').value || pageCustomer(pageId), rules = getRules();
  const plat = $('wPlatform')?.value || 'Meta', campName = $('wName').value.trim(), budDol = num($('wDollar').value);
  const actualDol = num($('wActualDollar').value), sFee = num($('wServiceFee')?.value), sType = $('wServiceFeeType')?.value || 'fixed', discount = num($('wDiscount')?.value), taxPct = num($('wTaxPct')?.value), actRate = num($('wActualRate').value), feePct = num($('wFeePct').value), other = num($('wOther').value);
  const testW = { actualDollar: actualDol, rate, serviceFee: sFee, serviceFeeType: sType, discount, taxPct, actualRate: actRate, feePct, other };
  if (isStaff() && rules.minBillRate > 0 && rate < rules.minBillRate) return toast(`শর্ত ভঙ্গ: মিনিমাম রেট ${money(rules.minBillRate)} হতে হবে!`, 'error');
  if (isStaff() && rules.blockLoss && actRate > 0 && profit(testW) < 0) return toast('শর্ত ভঙ্গ: লসে কাজ সেভ করা যাবে না!', 'error');
  const dupWork = db.works.find(w => w.date === date && w.customerId === custId && w.name.trim().toLowerCase() === campName.toLowerCase());
  if (dupWork && !(await askConfirm(L(`সতর্কতা: আজকের তারিখে (${date}) এই ক্লায়েন্টের "${campName}" নামে একটি ক্যাম্পেইন ইতিমধ্যেই আছে! ডুপ্লিকেট হিসেবে সেভ করবেন?`, `Warning: A campaign named "${campName}" for this client on ${date} already exists! Save duplicate?`)))) return;
  if (budDol > 0 && actualDol > budDol * 1.15 && !(await askConfirm(L(`ওভারস্পেন্ড সতর্কতা: ব্যবহৃত ডলার (${usd(actualDol)}) নির্ধারিত বাজেটের (${usd(budDol)}) ১৫% বেশি! নিশ্চিতভাবে সেভ করবেন?`, `Overspend Warning: Spent (${usd(actualDol)}) exceeds budget (${usd(budDol)}) by >15%! Save anyway?`)))) return;
  if (!isStaff() && actualDol > 0 && actRate > 0 && profit(testW) < 0 && !(await askConfirm(L(`লস গার্ড সতর্কতা: এই ক্যাম্পেইনে নিট লস ${money(profit(testW))} হচ্ছে! তবুও সেভ করবেন?`, `Loss Guard Alert: This campaign results in ${money(profit(testW))} net loss! Save anyway?`)))) return;
  const selCard = $('wCard')?.value || '', selAdAcc = $('wAdAccount')?.value || '';
  if (!isStaff() && selCard && actualDol > 0) {
    const cSt = getCardStats(selCard);
    if (cSt.balance < actualDol && !(await askConfirm(L(`কার্ড ব্যালেন্স সতর্কতা: নির্বাচিত কার্ডে বর্তমানে ${usd(cSt.balance)} আছে, কিন্তু খরচ ${usd(actualDol)}! তবুও সেভ করবেন?`, `Card Balance Alert: Selected card has ${usd(cSt.balance)}, but spend is ${usd(actualDol)}! Save anyway?`)))) return;
  }
  const cust = db.customers.find(c => c.id === custId), dueLim = num(cust?.dueLimit) || num(rules.defaultDueLimit);
  const prepaidBefore = cust ? clientBalance(cust.id) : 0;
  if (dueLim > 0 && (-prepaidBefore) >= dueLim) {
    if (isStaff()) return toast(`বকেয়া লিমিট পূর্ণ! (${money(-prepaidBefore)})`, 'error');
    else if (!(await askConfirm(`সতর্কতা: কাস্টমারের বকেয়া ${money(-prepaidBefore)} যা লিমিটের (${money(dueLim)}) বেশি! সেভ করবেন?`))) return;
  }
  db.works.push({
    id: uid(), createdAt: Date.now(), updatedAt: Date.now(), date, platform: plat, customerId: custId, pageId, adAccountId: selAdAcc,
    name: campName, days: num($('wDays').value), dollar: budDol, rate, actualDollar: actualDol, refundedUsd: 0,
    serviceFee: sFee, serviceFeeType: sType, discount, taxPct, cardId: selCard, actualRate: actRate, feePct, other,
    staffName: $('wStaff')?.value || '', commPct: num($('wCommPct')?.value),
    reach: num($('wReach')?.value), clicks: num($('wClicks')?.value), conversions: num($('wConversions')?.value), revenue: num($('wRevenue').value),
    creativeLink: $('wCreativeLink').value.trim(), status: $('wStatus').value, note: $('wNote').value.trim(), proofImg: pendingWorkProof || '',
    objective: $('wObjective')?.value || 'Messages', targetLoc: $('wTargetLoc')?.value.trim() || '', targetAge: $('wTargetAge')?.value.trim() || '',
    postUrl: $('wPostUrl')?.value.trim() || '', policyIssue: $('wPolicyIssue')?.value || 'None', audience: $('wAudience')?.value.trim() || '', adCopy: $('wAdCopy')?.value.trim() || ''
  });
  pendingWorkProof = ''; save(); syncCustomerPortalIfLinked(custId); logActivity(`নতুন কাজ (${plat}): ${campName}`);
  const alertBanner = $('workPrepaidAlertBanner'), alertTxt = $('workPrepaidAlertText'), alertWa = $('workPrepaidAlertWaLink');
  if (alertBanner) alertBanner.style.display = 'none';
  if (cust && prepaidBefore > 0) {
    const remAdv = clientBalance(cust.id), lowLim = cust.lowAdvLimit === undefined ? 1000 : num(cust.lowAdvLimit);
    if (remAdv <= 0 || (lowLim > 0 && remAdv < lowLim)) {
      const msgStatus = remAdv <= 0
        ? L(`⚠️ অটো-ডিডাক্ট অ্যালার্ট: ${cust.name}-এর প্রিপেইড ওয়ালেট শেষ হয়ে ${remAdv < 0 ? `বকেয়া ${money(-remAdv)}` : '৳0'} হয়েছে!`, `⚠️ Auto-Deduct Alert: ${cust.name}'s prepaid wallet depleted (${remAdv < 0 ? `Due ${money(-remAdv)}` : '৳0'})!`)
        : L(`⚠️ অটো-ডিডাক্ট অ্যালার্ট: ${cust.name}-এর প্রিপেইড ওয়ালেট কমে ${money(remAdv)} হয়েছে (সীমা: ${money(lowLim)})!`, `⚠️ Auto-Deduct Alert: ${cust.name} low prepaid balance ${money(remAdv)} (limit ${money(lowLim)})!`);
      toast(msgStatus, 'warn');
      if (alertBanner && alertTxt) {
        alertTxt.textContent = msgStatus;
        alertBanner.style.display = 'flex';
        const wa = normalizeBdPhone(cust.phone);
        if (alertWa) {
          if (wa.length >= 11) {
            const waText = encodeURIComponent(`আসসালামু আলাইকুম ${cust.name}, আপনার প্রিপেইড অ্যাড ওয়ালেট থেকে '${campName}' ক্যাম্পেইনের বিল কেটে বর্তমান ব্যালেন্স ${money(remAdv)} রয়েছে। অ্যাড চালু রাখতে অনুগ্রহ করে রিচার্জ করুন। ধন্যবাদ — ${db.agency?.name || 'Ads হিসাব ম্যানেজার'}`);
            alertWa.href = `https://wa.me/${wa}?text=${waText}`;
            alertWa.style.display = 'inline-block';
          } else {
            alertWa.style.display = 'none';
          }
        }
      }
    }
  }
  e.target.reset(); $('wDate').value = today(); $('wDays').value = 7;
  if ($('wRate')) { delete $('wRate').dataset.manualEdit; $('wRate').value = rateFor(today()) || ''; }
  $('wFeePct').value = num(db.agency?.defaultFeePct) || 0;
  if ($('wDiscount')) $('wDiscount').value = 0; if ($('wTaxPct')) $('wTaxPct').value = 0;
  syncVatBtnState(); updateWorkPreview(); toast('কাজ সেভ হয়েছে!');
};

window.openEditWorkModal = workId => {
  if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const w = db.works.find(x => x.id === workId); if (!w) return;
  if (isLocked24h(w)) return toast('২৪ ঘণ্টার পুরোনো কাজ স্টাফ এডিট করতে পারবেন না!', 'error');
  refresh(); $('ewId').value = w.id; $('ewDate').value = w.date;
  if ($('ewPlatform')) $('ewPlatform').value = AD_PLATFORMS.includes(w.platform) ? w.platform : 'Meta';
  $('ewCustomer').value = w.customerId || ''; updateEditWorkPages(); $('ewPage').value = w.pageId || '';
  $('ewName').value = w.name; $('ewDays').value = w.days || 1; $('ewDollar').value = w.dollar || 0; $('ewRate').value = w.rate || 0; $('ewActualDollar').value = w.actualDollar || 0;
  if ($('ewServiceFee')) $('ewServiceFee').value = w.serviceFee || 0; if ($('ewServiceFeeType')) $('ewServiceFeeType').value = w.serviceFeeType || 'fixed';
  if ($('ewDiscount')) $('ewDiscount').value = num(w.discount); if ($('ewTaxPct')) $('ewTaxPct').value = num(w.taxPct);
  if ($('ewStaff')) { if (w.staffName && ![...$('ewStaff').options].some(o => o.value === w.staffName)) $('ewStaff').add(new Option(w.staffName, w.staffName)); $('ewStaff').value = w.staffName || ''; }
  if ($('ewCommPct')) $('ewCommPct').value = num(w.commPct);
  if ($('ewAdAccount')) {
    const ewAa = $('ewAdAccount');
    if (w.adAccountId && ![...ewAa.options].some(o => o.value === w.adAccountId)) {
      const oldAa = (db.adAccounts || []).find(a => a.id === w.adAccountId);
      if (oldAa) ewAa.add(new Option(`⚠️ [${oldAa.status || 'Inactive'}] ${oldAa.name}${oldAa.adId ? ` (${oldAa.adId})` : ''}`, oldAa.id));
    }
    ewAa.value = w.adAccountId || '';
  }
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
  w.date = $('ewDate').value; w.platform = $('ewPlatform')?.value || 'Meta'; w.customerId = $('ewCustomer').value || pageCustomer($('ewPage').value); w.pageId = $('ewPage').value || ''; w.adAccountId = $('ewAdAccount')?.value || '';
  w.name = $('ewName').value.trim(); w.days = num($('ewDays').value); w.dollar = num($('ewDollar').value); w.rate = num($('ewRate').value); w.actualDollar = num($('ewActualDollar').value);
  w.serviceFee = num($('ewServiceFee')?.value); w.serviceFeeType = $('ewServiceFeeType')?.value || 'fixed';
  w.discount = num($('ewDiscount')?.value); w.taxPct = num($('ewTaxPct')?.value);
  w.staffName = $('ewStaff')?.value || '';
  if (!isStaff()) { w.cardId = $('ewCard').value; w.actualRate = num($('ewActualRate').value); w.feePct = num($('ewFeePct').value); w.other = num($('ewOther').value); w.commPct = num($('ewCommPct')?.value); }
  w.reach = num($('ewReach')?.value); w.clicks = num($('ewClicks')?.value); w.revenue = num($('ewRevenue').value); w.conversions = num($('ewConversions').value);
  w.creativeLink = $('ewCreativeLink').value.trim(); w.status = $('ewStatus').value; w.note = $('ewNote').value.trim(); w.proofImg = pendingEditWorkProof || '';
  w.objective = $('ewObjective')?.value || 'Messages'; w.targetLoc = $('ewTargetLoc')?.value.trim() || ''; w.targetAge = $('ewTargetAge')?.value.trim() || '';
  w.postUrl = $('ewPostUrl')?.value.trim() || ''; w.policyIssue = $('ewPolicyIssue')?.value || 'None'; w.audience = $('ewAudience')?.value.trim() || ''; w.adCopy = $('ewAdCopy')?.value.trim() || '';
  w.updatedAt = Date.now(); save(); syncCustomerPortalIfLinked(w.customerId); closeModal('editWorkModal'); toast('কাজের হিসাব আপডেট হয়েছে!');
};
window.cloneWork = workId => { if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const w = db.works.find(x => x.id === workId); if (!w) return; db.works.push({ ...w, id: uid(), createdAt: Date.now(), updatedAt: Date.now(), date: today(), name: w.name + ' (Copy)' }); save(); syncCustomerPortalIfLinked(w.customerId); toast('ক্লোন হয়েছে!'); };
window.deleteWork = async workId => {
  if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); const w = db.works.find(x => x.id === workId); if (!w) return;
  if (isLocked24h(w)) return toast('২৪ ঘণ্টার পুরোনো কাজ স্টাফ ডিলিট করতে পারবেন না!', 'error');
  if (!(await requireMasterPin('কাজ ডিলিট'))) return;
  if (!(await askConfirm('কাজটি রিসাইকেল বিনে পাঠাবেন?'))) return;
  const cid = w.customerId;
  moveToTrash('work', `কাজ: ${w.name}`, w); markDeleted(workId); selectedWorkIds.delete(workId); db.works = db.works.filter(x => x.id !== workId); save(); syncCustomerPortalIfLinked(cid); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn');
};
window.toggleWorkSelect = (id, ch) => { if (ch) selectedWorkIds.add(id); else selectedWorkIds.delete(id); updateWorkBulkBar(); };
function updateWorkBulkBar() { const b = $('workBulkBar'), c = $('workSelectedCount'); if (!b || !c) return; c.textContent = selectedWorkIds.size; b.style.display = selectedWorkIds.size > 0 ? 'flex' : 'none'; }
if ($('workSelectAll')) $('workSelectAll').onchange = e => { const ch = e.target.checked; document.querySelectorAll('.work-row-chk').forEach(x => { x.checked = ch; if (ch) selectedWorkIds.add(x.dataset.id); else selectedWorkIds.delete(x.dataset.id); }); updateWorkBulkBar(); };
window.bulkWorkStatus = st => { if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); if (!selectedWorkIds.size) return; db.works.forEach(w => { if (selectedWorkIds.has(w.id) && !isLocked24h(w)) { w.status = st; w.updatedAt = Date.now(); } }); const c = selectedWorkIds.size; selectedWorkIds.clear(); if ($('workSelectAll')) $('workSelectAll').checked = false; save(); updateWorkBulkBar(); toast(`${c}টি আপডেট হয়েছে!`); };
window.bulkDeleteWorks = async () => { if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); if (!selectedWorkIds.size) return; if (!(await requireMasterPin('বাল্ক ডিলিট'))) return; if (!(await askConfirm(`${selectedWorkIds.size}টি কাজ রিসাইকেল বিনে পাঠাবেন?`))) return; db.works.filter(w => selectedWorkIds.has(w.id)).forEach(w => { moveToTrash('work', `কাজ: ${w.name}`, w); markDeleted(w.id); }); db.works = db.works.filter(w => !selectedWorkIds.has(w.id)); selectedWorkIds.clear(); if ($('workSelectAll')) $('workSelectAll').checked = false; save(); updateWorkBulkBar(); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn'); };

// Risk Log (Account / Page Restriction & Appeal Tracker)
if ($('riskLogForm')) $('riskLogForm').onsubmit = e => {
  e.preventDefault();
  if (!Array.isArray(db.riskLogs)) db.riskLogs = [];
  db.riskLogs.unshift({
    id: uid(), updatedAt: Date.now(), date: $('rlDate')?.value || today(),
    platform: $('rlPlatform')?.value || 'Meta', customerId: $('rlCustomer')?.value || '',
    asset: $('rlAsset').value.trim(), issue: $('rlIssue')?.value || 'Policy Violation',
    status: $('rlStatus')?.value || 'Pending Appeal', note: $('rlNote')?.value.trim() || ''
  });
  save(); logActivity(`রিস্ক লগ: ${$('rlAsset').value.trim()}`); e.target.reset(); if ($('rlDate')) $('rlDate').value = today();
  toast(L('রিস্ক লগ সেভ হয়েছে!', 'Risk log saved!'));
};
window.cycleRiskStatus = id => {
  if (!hasPerm('canEdit')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  const r = (db.riskLogs || []).find(x => x.id === id); if (!r) return;
  const ord = ['Pending Appeal', 'Under Review', 'Recovered', 'Permanent Disabled'];
  r.status = ord[(ord.indexOf(r.status) + 1) % ord.length]; r.updatedAt = Date.now();
  save(); toast(`${L('স্ট্যাটাস', 'Status')}: ${r.status}`);
};
window.deleteRiskLog = async id => {
  if (!hasPerm('canDelete') || !(await askConfirm(L('রিস্ক লগটি রিসাইকেল বিনে পাঠাবেন?', 'Move risk log to trash?')))) return;
  const r = (db.riskLogs || []).find(x => x.id === id); if (!r) return;
  moveToTrash('riskLog', `রিস্ক: ${r.asset}`, r); markDeleted(id);
  db.riskLogs = db.riskLogs.filter(x => x.id !== id); save(); toast(L('ট্র্যাশে পাঠানো হয়েছে', 'Moved to trash'), 'warn');
};

// Ads Manager CSV Auto-Import
function parseCsvText(txt) {
  const rows = []; let row = [], cell = '', inQ = false;
  const s = String(txt || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], nx = s[i + 1];
    if (inQ) {
      if (ch === '"' && nx === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && nx === '\n') i++;
        row.push(cell.trim());
        if (row.some(x => x !== '')) rows.push(row);
        row = []; cell = '';
      } else cell += ch;
    }
  }
  if (cell !== '' || row.length) { row.push(cell.trim()); if (row.some(x => x !== '')) rows.push(row); }
  return rows;
}
window.openCsvImportModal = () => {
  refresh(); pendingCsvRows = [];
  if ($('csvImpDate')) $('csvImpDate').value = today();
  if ($('csvImpRate')) $('csvImpRate').value = rateFor(today()) || num(db.agency?.defaultRate) || 125;
  if ($('csvImpFile')) $('csvImpFile').value = '';
  if ($('csvImpPreviewWrap')) $('csvImpPreviewWrap').style.display = 'none';
  if ($('csvImportModal')) $('csvImportModal').style.display = 'flex';
};
function renderCsvImportRows() {
  if (!$('csvImpRows')) return;
  $('csvImpRows').innerHTML = pendingCsvRows.map((r, i) => `<tr><td><input type="checkbox" class="row-chk" ${r.selected ? 'checked' : ''} onchange="toggleSingleCsvRow(${i}, this.checked)"></td><td>${esc(r.date)}</td><td><strong>${esc(r.name)}</strong></td><td>${esc(r.customerId ? cname(r.customerId) : L('ডিফল্ট/নেই', 'Default/None'))}</td><td><strong>${usd(r.spent)}</strong></td><td><small>R:${num(r.reach)} · C:${num(r.clicks)} · Res:${num(r.conversions)}</small></td></tr>`).join('');
  const sel = pendingCsvRows.filter(x => x.selected).length;
  if ($('csvImpCountText')) $('csvImpCountText').textContent = L(`মোট ${pendingCsvRows.length}টি রো পাওয়া গেছে · নির্বাচিত: ${sel}টি`, `Found ${pendingCsvRows.length} rows · Selected: ${sel}`);
}
window.toggleSingleCsvRow = (i, ch) => { if (pendingCsvRows[i]) { pendingCsvRows[i].selected = ch; renderCsvImportRows(); } };
window.toggleAllCsvRows = ch => { pendingCsvRows.forEach(r => { r.selected = ch; }); renderCsvImportRows(); };
if ($('csvImpFile')) $('csvImpFile').onchange = e => {
  const f = e.target.files?.[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const grid = parseCsvText(ev.target.result);
    let hIdx = grid.findIndex(r => r.some(c => /campaign|ad set|spent|cost|amount/i.test(c)));
    if (hIdx === -1) hIdx = 0;
    const headers = (grid[hIdx] || []).map(h => h.toLowerCase());
    const findCol = pats => headers.findIndex(h => pats.some(p => h.includes(p)));
    const iName = findCol(['campaign name', 'campaign', 'ad set name', 'ad name']), iSpent = findCol(['amount spent', 'cost', 'spend']), iReach = findCol(['reach', 'impressions', 'impr']), iClicks = findCol(['link clicks', 'clicks', 'views']), iRes = findCol(['results', 'conversions', 'messaging conversations']), iRev = findCol(['purchase conversion value', 'conversion value', 'revenue']), iDate = findCol(['reporting starts', 'date', 'day', 'start']);
    if (iName === -1 || iSpent === -1) return toast(L('CSV কলাম মেলেনি (Campaign ও Cost/Spent কলাম প্রয়োজন)', 'CSV headers unrecognized (need Campaign & Cost/Spent)'), 'error');
    const defCust = $('csvImpCustomer')?.value || '', defDate = $('csvImpDate')?.value || today();
    pendingCsvRows = grid.slice(hIdx + 1).map(r => {
      const name = r[iName] || '', spent = num(String(r[iSpent] || '0').replace(/[^0-9.-]/g, ''));
      if (!name || /total|all/i.test(name) && spent === 0) return null;
      const rawDate = iDate >= 0 ? String(r[iDate] || '').slice(0, 10) : '';
      const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : defDate;
      const lowN = name.toLowerCase();
      const matchedC = db.customers.find(c => lowN.includes(c.name.toLowerCase()))?.id || defCust;
      const matchedP = db.pages.find(p => p.customerId === matchedC)?.id || '';
      return {
        selected: spent > 0, date, name, customerId: matchedC, pageId: matchedP, spent,
        reach: iReach >= 0 ? num(String(r[iReach]).replace(/[^0-9.-]/g, '')) : 0,
        clicks: iClicks >= 0 ? num(String(r[iClicks]).replace(/[^0-9.-]/g, '')) : 0,
        conversions: iRes >= 0 ? num(String(r[iRes]).replace(/[^0-9.-]/g, '')) : 0,
        revenue: iRev >= 0 ? num(String(r[iRev]).replace(/[^0-9.-]/g, '')) : 0
      };
    }).filter(x => x && x.name && (x.spent > 0 || x.conversions > 0));
    if (!pendingCsvRows.length) return toast(L('কোনো বৈধ ক্যাম্পেইন রো পাওয়া যায়নি', 'No valid campaign rows found'), 'warn');
    if ($('csvImpPreviewWrap')) $('csvImpPreviewWrap').style.display = 'block';
    if ($('csvImpChkAll')) $('csvImpChkAll').checked = true;
    renderCsvImportRows();
    toast(L(`${pendingCsvRows.length}টি ক্যাম্পেইন প্রিভিউতে লোড হয়েছে!`, `Loaded ${pendingCsvRows.length} campaigns for preview!`));
  };
  reader.readAsText(f);
};
window.confirmCsvImport = () => {
  if (!hasPerm('canEdit')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  const chosen = pendingCsvRows.filter(r => r.selected);
  if (!chosen.length) return toast(L('কমপক্ষে একটি সারি নির্বাচন করুন!', 'Select at least one row!'), 'warn');
  const plat = $('csvImpPlatform')?.value || 'Meta', defRate = num($('csvImpRate')?.value) || rateFor(today()) || 125;
  const adAccountId = $('csvImpAdAccount')?.value || '', matchedAa = (db.adAccounts || []).find(x => x.id === adAccountId);
  const cardId = isStaff() ? '' : ($('csvImpCard')?.value || matchedAa?.cardId || ''), actRate = cardId ? (cardAvgRate(cardId) || 0) : 0, st = $('csvImpStatus')?.value || 'running';
  chosen.forEach(r => {
    const cid = r.customerId || $('csvImpCustomer')?.value || '';
    const rate = effectiveRateFor(cid, r.date) || defRate;
    db.works.push({
      id: uid(), createdAt: Date.now(), updatedAt: Date.now(), date: r.date, platform: plat, customerId: cid, pageId: r.pageId || '', adAccountId,
      name: r.name, days: 7, dollar: r.spent, rate, actualDollar: r.spent, serviceFee: 0, serviceFeeType: 'fixed', discount: 0, taxPct: 0,
      cardId, actualRate: actRate, feePct: num(db.agency?.defaultFeePct) || 0, other: 0, staffName: '', commPct: 0,
      reach: r.reach, clicks: r.clicks, conversions: r.conversions, revenue: r.revenue,
      creativeLink: '', status: st, note: 'CSV Auto-Import', proofImg: '', objective: 'Sales', targetLoc: '', targetAge: '', postUrl: '', policyIssue: 'None', audience: '', adCopy: ''
    });
  });
  save(); logActivity(`CSV ইমপোর্ট (${plat}): ${chosen.length}টি কাজ`); closeModal('csvImportModal');
  toast(L(`✅ ${chosen.length}টি ক্যাম্পেইন সফলভাবে ইমপোর্ট হয়েছে!`, `✅ Imported ${chosen.length} campaigns!`));
};

// Day-End Cash & Ledger Closing + Staff Commission Payroll
function computeDayClosing(dateStr) {
  const d = dateStr || today();
  const dW = db.works.filter(w => w.date === d);
  const dP = db.payments.filter(p => p.approvalStatus !== 'pending' && p.date === d);
  const dE = db.expenses.filter(e => e.approvalStatus !== 'pending' && e.date === d);
  const dDep = db.cardDeposits.filter(x => x.date === d);
  const dAdj = db.cashAdjustments.filter(x => x.date === d);
  const dWt = (db.walletTransfers || []).filter(x => x.date === d);
  const dTrd = db.trades.filter(t => t.date === d);
  const billTot = dW.reduce((s, w) => s + bill(w), 0), adCost = dW.reduce((s, w) => s + actual(w) + num(w.other), 0);
  const expTot = dE.reduce((s, e) => s + num(e.amount), 0), payIn = dP.reduce((s, p) => s + num(p.amount), 0), payFee = dP.reduce((s, p) => s + num(p.fee), 0), wtFeeTot = dWt.reduce((s, x) => s + num(x.fee), 0);
  const depTkTot = dDep.reduce((s, x) => s + num(x.taka) + num(x.bankFeeTk), 0), tradeProf = dTrd.reduce((s, t) => s + tradeProfit(t), 0);
  const totalCost = adCost + expTot + payFee + wtFeeTot, netProfit = billTot - totalCost + tradeProf;
  const walletFlows = {};
  (db.wallets || DEFAULT_WALLETS).forEach(w => { walletFlows[w] = { in: 0, out: 0 }; });
  const ensureW = k => { const key = k || 'Cash'; if (!walletFlows[key]) walletFlows[key] = { in: 0, out: 0 }; return walletFlows[key]; };
  dP.forEach(p => { ensureW(p.method).in += num(p.amount) - num(p.fee); });
  dE.forEach(ex => { ensureW(ex.method).out += num(ex.amount); });
  dDep.forEach(dep => { ensureW(dep.method || 'Bank').out += num(dep.taka) + num(dep.bankFeeTk); });
  dAdj.forEach(a => { if (a.type === 'out') ensureW(a.method).out += num(a.amount); else ensureW(a.method).in += num(a.amount); });
  dWt.forEach(wt => { ensureW(wt.from).out += num(wt.amount) + num(wt.fee); ensureW(wt.to).in += num(wt.amount); });
  dTrd.forEach(t => { if (t.type === 'sell') ensureW(t.method || 'Cash').in += num(t.paidTk); else ensureW(t.method || 'Cash').out += num(t.paidTk); });
  return { date: d, billTot, adCost, expTot, payIn, payFee, depTkTot, tradeProf, totalCost, netProfit, walletFlows };
}
window.openDayClosingModal = (dateStr = null) => {
  if (!$('dayClosingModal')) return;
  if ($('dcDate')) $('dcDate').value = dateStr || today();
  if ($('dcNote')) $('dcNote').value = '';
  renderDayClosingModal();
  $('dayClosingModal').style.display = 'flex';
};
window.renderDayClosingModal = () => {
  const dc = computeDayClosing($('dcDate')?.value || today());
  if ($('dcStatsGrid')) $('dcStatsGrid').innerHTML = `
    <div class="closing-box"><small>${L('মোট বিল', 'Total Bill')}</small><strong>${money(dc.billTot)}</strong></div>
    <div class="closing-box"><small>${L('মোট আদায়', 'Collections')}</small><strong class="good">${money(dc.payIn)}</strong></div>
    <div class="closing-box"><small>${L('এড ও অফিস খরচ', 'Ad + Office Cost')}</small><strong class="bad">${money(dc.totalCost)}</strong></div>
    <div class="closing-box"><small>${L('কার্ড ডিপোজিট', 'Card Deposits')}</small><strong>${money(dc.depTkTot)}</strong></div>
    <div class="closing-box"><small>${L('নিট লাভ', 'Net Profit')}</small><strong class="${dc.netProfit >= 0 ? 'good' : 'bad'}">${money(dc.netProfit)}</strong></div>
  `;
  if ($('dcWalletRows')) $('dcWalletRows').innerHTML = Object.entries(dc.walletFlows).map(([w, f]) => {
    const net = f.in - f.out;
    return `<tr><td><strong>${esc(w)}</strong></td><td class="good">+${money(f.in)}</td><td class="bad">-${money(f.out)}</td><td class="${net >= 0 ? 'good' : 'bad'}"><strong>${net >= 0 ? '+' : ''}${money(net)}</strong></td></tr>`;
  }).join('');
};
window.saveDayClosingRecord = () => {
  const dc = computeDayClosing($('dcDate')?.value || today()), note = $('dcNote')?.value.trim() || '';
  if (!Array.isArray(db.dailyClosings)) db.dailyClosings = [];
  const existing = db.dailyClosings.find(x => x.date === dc.date);
  const rec = { id: existing?.id || uid(), updatedAt: Date.now(), date: dc.date, bill: dc.billTot, paid: dc.payIn, cost: dc.totalCost, profit: dc.netProfit, depTk: dc.depTkTot, note };
  if (existing) Object.assign(existing, rec); else db.dailyClosings.unshift(rec);
  save(); logActivity(`ডে-এন্ড ক্লোজিং সেভ: ${dc.date}`); toast(L('ডে-এন্ড ক্লোজিং সেভ হয়েছে!', 'Day-End Closing saved!'));
};
window.deleteDayClosing = async id => {
  if (!hasPerm('canDelete') || !(await askConfirm(L('ক্লোজিং রেকর্ড মুছবেন?', 'Delete closing record?')))) return;
  markDeleted(id); db.dailyClosings = (db.dailyClosings || []).filter(x => x.id !== id); save(); toast(L('মুছে ফেলা হয়েছে', 'Deleted'), 'warn');
};
window.shareDayClosingWhatsApp = () => {
  const dc = computeDayClosing($('dcDate')?.value || today()), agName = db.agency?.name || 'Ads হিসাব ম্যানেজার';
  const wLines = Object.entries(dc.walletFlows).filter(([, f]) => f.in > 0 || f.out > 0).map(([w, f]) => `• ${w}: +${money(f.in)} / -${money(f.out)} (Net: ${money(f.in - f.out)})`).join('\n');
  const txt = `🧾 *ডে-এন্ড ক্লোজিং (${dc.date}) — ${agName}*\n\nমোট বিল: ${money(dc.billTot)}\nমোট আদায়: ${money(dc.payIn)}\nএড+অফিস খরচ: ${money(dc.totalCost)}\nকার্ড ডিপোজিট: ${money(dc.depTkTot)}\n*নিট লাভ: ${money(dc.netProfit)}*\n${wLines ? `\nওয়ালেট প্রবাহ:\n${wLines}` : ''}${($('dcNote')?.value.trim()) ? `\nনোট: ${$('dcNote').value.trim()}` : ''}`;
  copyText(txt, L('ডে-এন্ড সামারি', 'Day-End Summary'));
  openExternalUrl(`https://wa.me/?text=${encodeURIComponent(txt)}`);
};
window.payStaffCommission = (staffName, payableAmt) => {
  if (!hasPerm('canExpenses')) return toast(L('খরচ যোগ করার অনুমতি নেই!', 'No expense permission!'), 'error');
  goToSection('expenses');
  if ($('expDate')) $('expDate').value = today();
  if ($('expCategory')) $('expCategory').value = 'Salary';
  if ($('expTitle')) $('expTitle').value = `Commission Payout — ${staffName}`;
  if ($('expAmount')) $('expAmount').value = Math.max(0, num(payableAmt)).toFixed(2);
  if ($('expNote')) $('expNote').value = `${staffName} কমিশন / স্যালারি সেটেলমেন্ট`;
  $('expAmount')?.focus();
  toast(L(`${staffName}-এর কমিশন পেমেন্ট ফর্মে বসানো হয়েছে — যাচাই করে সেভ করুন!`, `Commission payout pre-filled for ${staffName}!`));
};

// Monthly Client Statement (#statementModal)
function getStatementData(custId, from, to) {
  const allW = db.works.filter(w => w.customerId === custId);
  const allP = db.payments.filter(p => p.customerId === custId && p.approvalStatus !== 'pending');
  const prevB = from ? allW.filter(w => String(w.date || '') < from).reduce((s, w) => s + bill(w), 0) : 0;
  const prevP = from ? allP.filter(p => String(p.date || '') < from).reduce((s, p) => s + num(p.amount), 0) : 0;
  const openingBal = prevP - prevB;
  const periodW = allW.filter(w => inDateRange(w.date, from, to));
  const periodP = allP.filter(p => inDateRange(p.date, from, to));
  const entries = [
    ...periodW.map(w => ({ date: w.date || '', type: L('ক্যাম্পেইন', 'Campaign'), desc: `[${platformMeta(w.platform).label}] ${w.name} (${usd(w.actualDollar)})`, debit: bill(w), credit: 0 })),
    ...periodP.map(p => ({ date: p.date || '', type: L('পেমেন্ট', 'Payment'), desc: `${p.method || 'Cash'}${p.ref ? ` (${p.ref})` : ''}`, debit: 0, credit: num(p.amount) }))
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const periodBill = periodW.reduce((s, w) => s + bill(w), 0);
  const periodPaid = periodP.reduce((s, p) => s + num(p.amount), 0);
  return { from, to, openingBal, entries, periodBill, periodPaid, closingBal: openingBal + periodPaid - periodBill };
}
window.openStatementModal = custId => {
  refresh();
  const sel = $('stmtCustomer');
  if (sel) {
    if (custId && db.customers.some(c => c.id === custId)) sel.value = custId;
    else if (!sel.value && db.customers.length) sel.value = db.customers[0].id;
  }
  if ($('stmtFrom') && !$('stmtFrom').value) $('stmtFrom').value = today().slice(0, 8) + '01';
  if ($('stmtTo') && !$('stmtTo').value) $('stmtTo').value = today();
  renderClientStatement();
  if ($('statementModal')) $('statementModal').style.display = 'flex';
};
window.renderClientStatement = () => {
  const custId = $('stmtCustomer')?.value, c = db.customers.find(x => x.id === custId), ag = db.agency || {};
  if ($('stmtLogoImg')) { $('stmtLogoImg').style.display = ag.logoUrl ? 'block' : 'none'; if (ag.logoUrl) $('stmtLogoImg').src = ag.logoUrl; }
  if ($('stmtAgencyName')) $('stmtAgencyName').textContent = ag.name || 'Ads হিসাব ম্যানেজার';
  if ($('stmtAgencyContact')) $('stmtAgencyContact').textContent = agencyContactLine(ag);
  if (!c) {
    if ($('stmtCustName')) $('stmtCustName').textContent = L('কাস্টমার নির্বাচন করুন', 'Select a customer');
    if ($('stmtCustPhone')) $('stmtCustPhone').textContent = '—';
    if ($('stmtSummaryGrid')) $('stmtSummaryGrid').innerHTML = '';
    if ($('stmtRows')) $('stmtRows').innerHTML = `<tr><td colspan="6">${L('কাস্টমার পাওয়া যায়নি', 'No customer selected')}</td></tr>`;
    return;
  }
  const from = $('stmtFrom')?.value || '', to = $('stmtTo')?.value || '';
  const st = getStatementData(c.id, from, to);
  if ($('stmtPeriodText')) $('stmtPeriodText').textContent = `${L('সময়কাল', 'Period')}: ${from || L('শুরু', 'Start')} → ${to || L('আজ', 'Today')}`;
  if ($('stmtCustName')) $('stmtCustName').textContent = c.name;
  if ($('stmtCustPhone')) $('stmtCustPhone').textContent = c.phone || '—';
  if ($('stmtSummaryGrid')) $('stmtSummaryGrid').innerHTML = `
    <div class="closing-stat"><small>${L('পূর্বের জের (Opening)', 'Opening Balance')}</small><strong class="${st.openingBal < 0 ? 'bad' : 'good'}">${st.openingBal < 0 ? L('বকেয়া', 'Due') + ' ' + money(-st.openingBal) : money(st.openingBal)}</strong></div>
    <div class="closing-stat"><small>${L('এই সময়ের বিল (+)', 'Period Billed (+)')}</small><strong>${money(st.periodBill)}</strong></div>
    <div class="closing-stat"><small>${L('এই সময়ের জমা (-)', 'Period Paid (-)')}</small><strong class="good">${money(st.periodPaid)}</strong></div>
    <div class="closing-stat"><small>${L('সর্বশেষ ব্যালেন্স (Closing)', 'Closing Balance')}</small><strong class="${st.closingBal < 0 ? 'bad' : 'good'}">${st.closingBal < 0 ? L('বকেয়া', 'Due') + ' ' + money(-st.closingBal) : (st.closingBal > 0 ? L('অ্যাডভান্স', 'Adv') + ' ' + money(st.closingBal) : '৳0.00')}</strong></div>`;
  let runB = st.openingBal;
  const openRow = from && st.openingBal !== 0 ? `<tr style="background:rgba(49,87,232,0.06)"><td>${esc(from)}</td><td><span class="badge-admin">${L('জের', 'Opening')}</span></td><td><strong>${L('পূর্বের সমন্বিত ব্যালেন্স', 'Opening Balance Brought Forward')}</strong></td><td>—</td><td>—</td><td class="${runB < 0 ? 'bad' : 'good'}"><strong>${runB < 0 ? L('বকেয়া', 'Due') + ' ' + money(-runB) : money(runB)}</strong></td></tr>` : '';
  const bodyRows = st.entries.map(r => {
    runB += r.credit - r.debit;
    const bCls = runB < 0 ? 'bad' : (runB > 0 ? 'good' : 'muted');
    return `<tr><td>${esc(r.date)}</td><td>${esc(r.type)}</td><td>${esc(r.desc)}</td><td class="bad">${r.debit ? money(r.debit) : '—'}</td><td class="good">${r.credit ? money(r.credit) : '—'}</td><td class="${bCls}">${runB < 0 ? L('বকেয়া', 'Due') + ' ' + money(-runB) : (runB > 0 ? L('অ্যাড', 'Adv') + ' ' + money(runB) : '৳0.00')}</td></tr>`;
  }).join('');
  if ($('stmtRows')) $('stmtRows').innerHTML = (openRow + bodyRows) || `<tr><td colspan="6">${L('এই সময়ে কোনো লেনদেন নেই', 'No transactions in this period')}</td></tr>`;
};
window.printStatement = () => { document.body.classList.add('printing-stmt'); window.print(); setTimeout(() => document.body.classList.remove('printing-stmt'), 400); };
window.shareStatementWhatsApp = () => {
  const custId = $('stmtCustomer')?.value, c = db.customers.find(x => x.id === custId);
  if (!c) return toast(L('কাস্টমার নির্বাচন করুন!', 'Select a customer!'), 'warn');
  const from = $('stmtFrom')?.value || '', to = $('stmtTo')?.value || '', st = getStatementData(c.id, from, to);
  const agName = db.agency?.name || 'Ads হিসাব ম্যানেজার';
  const closeTxt = st.closingBal < 0 ? `🔴 মোট বকেয়া: ${money(-st.closingBal)}` : (st.closingBal > 0 ? `🟢 অ্যাডভান্স জমা: ${money(st.closingBal)}` : `✅ হিসাব সমন্বিত: ৳0.00`);
  const txt = `📑 *মান্থলি স্টেটমেন্ট — ${c.name}*\nএজেন্সি: ${agName}\nসময়কাল: ${from || 'শুরু'} থেকে ${to || 'আজ'}\n\n• পূর্বের ব্যালেন্স: ${st.openingBal < 0 ? 'বকেয়া ' + money(-st.openingBal) : money(st.openingBal)}\n• এই সময়ের মোট বিল: ${money(st.periodBill)}\n• এই সময়ের মোট জমা: ${money(st.periodPaid)}\n• *${closeTxt}*${db.agency?.payInfo ? '\n\n💳 পেমেন্ট: ' + db.agency.payInfo : ''}`;
  copyText(txt, L('স্টেটমেন্ট সামারি', 'Statement Summary'));
  const wa = normalizeBdPhone(c.phone);
  openExternalUrl(wa ? `https://wa.me/${wa}?text=${encodeURIComponent(txt)}` : `https://wa.me/?text=${encodeURIComponent(txt)}`);
};
window.downloadStatementPng = async () => {
  const custId = $('stmtCustomer')?.value, c = db.customers.find(x => x.id === custId);
  if (!c) return toast(L('কাস্টমার নির্বাচন করুন!', 'Select a customer!'), 'warn');
  const from = $('stmtFrom')?.value || '', to = $('stmtTo')?.value || '', st = getStatementData(c.id, from, to), ag = db.agency || {};
  const logoImg = await loadImgCors(ag.logoUrl), shown = st.entries.slice(0, 22);
  const W = 820, H = 310 + Math.max(1, shown.length) * 28, canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#2563eb'; ctx.fillRect(0, 0, W, 10);
  let tx = 36; if (logoImg) { try { ctx.drawImage(logoImg, 36, 22, 44, 44); tx = 90; } catch (e) {} }
  ctx.fillStyle = '#2563eb'; ctx.font = 'bold 21px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(ag.name || 'Ads হিসাব ম্যানেজার', tx, 44);
  ctx.fillStyle = '#64748b'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(agencyContactLine(ag).slice(0, 62), tx, 64);
  ctx.textAlign = 'right'; ctx.fillStyle = '#0f172a'; ctx.font = 'bold 14px Arial, sans-serif'; ctx.fillText('MONTHLY STATEMENT', W - 36, 42);
  ctx.fillStyle = '#475569'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`${from || 'Start'} → ${to || today()}`, W - 36, 62);
  ctx.textAlign = 'left'; ctx.fillStyle = '#0f172a'; ctx.font = 'bold 16px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`${c.name} (${c.phone || '—'})`, 36, 98);
  let y = 114;
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(36, y, W - 72, 48); ctx.strokeStyle = '#cbd5e1'; ctx.strokeRect(36, y, W - 72, 48);
  ctx.font = 'bold 12.5px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillStyle = '#334155'; ctx.fillText(`পূর্বের জের: ${st.openingBal < 0 ? '-' + money(-st.openingBal) : money(st.openingBal)}`, 48, y + 29);
  ctx.fillText(`মোট বিল: ${money(st.periodBill)}`, 245, y + 29);
  ctx.fillStyle = '#059669'; ctx.fillText(`মোট জমা: ${money(st.periodPaid)}`, 430, y + 29);
  ctx.textAlign = 'right'; ctx.fillStyle = st.closingBal < 0 ? '#dc2626' : '#059669';
  ctx.fillText(`ক্লোজিং: ${st.closingBal < 0 ? 'বকেয়া ' + money(-st.closingBal) : money(st.closingBal)}`, W - 48, y + 29);
  ctx.textAlign = 'left'; y += 64;
  ctx.fillStyle = '#eff6ff'; ctx.fillRect(36, y, W - 72, 28); ctx.fillStyle = '#1e3a8a'; ctx.font = 'bold 12px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText('তারিখ', 46, y + 19); ctx.fillText('ধরণ / বিবরণ', 135, y + 19); ctx.fillText('বিল (+)', 490, y + 19); ctx.fillText('জমা (-)', 590, y + 19); ctx.textAlign = 'right'; ctx.fillText('ব্যালেন্স', W - 46, y + 19); ctx.textAlign = 'left'; y += 28;
  let rb = st.openingBal;
  if (!shown.length) { ctx.fillStyle = '#64748b'; ctx.font = '12.5px Arial, sans-serif'; ctx.fillText('কোনো লেনদেন নেই', 46, y + 19); }
  shown.forEach((r, i) => {
    rb += r.credit - r.debit;
    if (i % 2 === 1) { ctx.fillStyle = '#f8fafc'; ctx.fillRect(36, y, W - 72, 28); }
    ctx.fillStyle = '#1e293b'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif';
    ctx.fillText(r.date || '', 46, y + 19);
    ctx.fillText(`[${r.type}] ${String(r.desc || '').slice(0, 44)}`, 135, y + 19);
    ctx.fillStyle = '#dc2626'; ctx.fillText(r.debit ? money(r.debit) : '—', 490, y + 19);
    ctx.fillStyle = '#059669'; ctx.fillText(r.credit ? money(r.credit) : '—', 590, y + 19);
    ctx.textAlign = 'right'; ctx.fillStyle = rb < 0 ? '#dc2626' : '#059669'; ctx.fillText(rb < 0 ? '-' + money(-rb) : money(rb), W - 46, y + 19); ctx.textAlign = 'left';
    y += 28;
  });
  canvas.toBlob(blob => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `statement_${c.name.replace(/\s+/g, '_')}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast(L('স্টেটমেন্ট PNG ডাউনলোড হয়েছে!', 'Statement PNG downloaded!')); }, 'image/png');
};

// Creative & Media Vault (#creativeVaultModal)
if ($('crThumbFile')) $('crThumbFile').onchange = async e => { const f = e.target.files?.[0]; if (!f) return; try { pendingCreativeThumb = await compressImageFile(f, 480, 0.78); toast(L('থাম্বনেইল প্রস্তুত!', 'Thumbnail ready!')); } catch (err) { toast(L('ছবি ত্রুটি!', 'Image error!'), 'error'); } };
window.openCreativeVaultModal = () => { refresh(); pendingCreativeThumb = ''; renderCreativeVault(); if ($('creativeVaultModal')) $('creativeVaultModal').style.display = 'flex'; };
if ($('creativeForm')) $('creativeForm').onsubmit = e => {
  e.preventDefault(); const title = $('crTitle')?.value.trim(); if (!title) return;
  if (!Array.isArray(db.creatives)) db.creatives = [];
  db.creatives.unshift({ id: uid(), updatedAt: Date.now(), date: today(), customerId: $('crCustomer')?.value || '', platform: $('crPlatform')?.value || 'Meta', title, mediaUrl: $('crMediaUrl')?.value.trim() || '', thumbImg: pendingCreativeThumb || '', note: $('crNote')?.value.trim() || '', adCopy: $('crAdCopy')?.value.trim() || '' });
  pendingCreativeThumb = ''; save(); e.target.reset(); renderCreativeVault(); toast(L('ক্রিয়েটিভ লাইব্রেরিতে সেভ হয়েছে!', 'Creative saved to vault!'));
};
window.renderCreativeVault = () => {
  const host = $('creativeGrid'); if (!host) return;
  const cf = $('crFilterCust')?.value || '', q = ($('crSearch')?.value || '').trim().toLowerCase();
  const list = (db.creatives || []).filter(c => (!cf || c.customerId === cf) && (!q || (c.title || '').toLowerCase().includes(q) || (c.adCopy || '').toLowerCase().includes(q) || (c.note || '').toLowerCase().includes(q)));
  host.innerHTML = list.map(cr => `
    <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px;justify-content:space-between">
      <div>
        ${cr.thumbImg ? `<img src="${cr.thumbImg}" alt="Thumb" style="width:100%;height:110px;object-fit:cover;border-radius:8px;margin-bottom:6px;cursor:zoom-in" onclick="openLightbox(this.src)">` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">${platformBadge(cr.platform)}<small class="muted">${esc(cr.date || '')}</small></div>
        <strong style="display:block;margin-top:4px;font-size:13.5px">${esc(cr.title)}</strong>
        <small class="muted">${cr.customerId ? esc(cname(cr.customerId)) : L('সাধারণ / সব ক্লায়েন্ট', 'General')}${cr.note ? ' · ' + esc(cr.note) : ''}</small>
        ${cr.adCopy ? `<div style="margin-top:6px;padding:6px 8px;background:var(--soft);border-radius:7px;font-size:11.5px;max-height:54px;overflow:hidden">${esc(cr.adCopy)}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <button type="button" class="sm" style="flex:1;margin:0" onclick="useCreativeInWork('${cr.id}')">⚡ ${L('ক্যাম্পেইনে নিন', 'Use in Campaign')}</button>
        ${cr.mediaUrl ? `<a href="${esc(cr.mediaUrl)}" target="_blank" style="text-decoration:none"><button type="button" class="secondary sm" style="margin:0">🔗</button></a>` : ''}
        <button type="button" class="danger sm perm-del" style="margin:0" onclick="deleteCreative('${cr.id}')">✕</button>
      </div>
    </div>`).join('') || `<div class="muted" style="grid-column:1 / -1;text-align:center;padding:24px">${L('লাইব্রেরিতে কোনো ক্রিয়েটিভ নেই', 'No creatives in vault yet')}</div>`;
};
window.useCreativeInWork = crId => {
  const cr = (db.creatives || []).find(x => x.id === crId); if (!cr) return;
  closeModal('creativeVaultModal'); goToSection('works');
  if ($('wPlatform')) $('wPlatform').value = AD_PLATFORMS.includes(cr.platform) ? cr.platform : 'Meta';
  if (cr.customerId && $('wCustomer')) { $('wCustomer').value = cr.customerId; updatePages(); const r = effectiveRateFor(cr.customerId, $('wDate')?.value || today()); if (r && $('wRate')) $('wRate').value = r; }
  if ($('wName')) $('wName').value = cr.title || '';
  if ($('wCreativeLink')) $('wCreativeLink').value = cr.mediaUrl || '';
  if ($('wPostUrl')) $('wPostUrl').value = cr.mediaUrl || '';
  if ($('wAdCopy')) $('wAdCopy').value = cr.adCopy || '';
  const briefBox = document.querySelector('#workForm details.brief-box'); if (briefBox && cr.adCopy) briefBox.open = true;
  updateWorkPreview(); document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  toast(L('ক্রিয়েটিভ তথ্য ক্যাম্পেইন ফর্মে বসানো হয়েছে!', 'Creative loaded into campaign form!'));
};
window.deleteCreative = async crId => {
  if (!hasPerm('canDelete') || !(await askConfirm(L('ক্রিয়েটিভটি মুছবেন?', 'Delete this creative?')))) return;
  const cr = (db.creatives || []).find(x => x.id === crId);
  if (cr) { moveToTrash('creative', `ক্রিয়েটিভ: ${cr.title}`, cr); markDeleted(crId); db.creatives = db.creatives.filter(x => x.id !== crId); save(); renderCreativeVault(); toast(L('ট্র্যাশে পাঠানো হয়েছে', 'Moved to trash'), 'warn'); }
};

// Expenses, Wallets, Cashbook, Payments & Approval
if ($('addWalletForm')) $('addWalletForm').onsubmit = e => { e.preventDefault(); const n = $('newWalletInput').value.trim(); if (!n) return; if (!Array.isArray(db.wallets)) db.wallets = [...DEFAULT_WALLETS]; if (!db.wallets.some(w => w.toLowerCase() === n.toLowerCase())) { db.wallets.push(n); save(); toast(`${n} যুক্ত হয়েছে!`); } else toast('আগেই আছে!', 'warn'); $('newWalletInput').value = ''; };
if ($('walletListChips')) $('walletListChips').addEventListener('click', async e => { const btn = e.target.closest('button[data-wallet]'); if (!btn) return; const n = btn.getAttribute('data-wallet'); if (['Cash', 'Bank'].includes(n)) return toast('Cash ও Bank মুছা যাবে না', 'warn'); if (!(await askConfirm(`"${n}" সরাতে চান?`))) return; db.wallets = db.wallets.filter(w => w !== n); save(); toast(`${n} সরানো হয়েছে`, 'warn'); });
if ($('bankAccountChips')) $('bankAccountChips').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-bank-id]');
  if (!btn) return;
  const id = btn.getAttribute('data-bank-id');
  const b = (db.bankAccounts || []).find(x => x.id === id);
  if (!b) return;
  if (!(await askConfirm(`"${b.walletKey}" সরাতে চান?`))) return;
  markDeleted(id);
  db.bankAccounts = (db.bankAccounts || []).filter(x => x.id !== id);
  db.wallets = (db.wallets || []).filter(w => w !== b.walletKey);
  save();
  toast(`${b.walletKey} সরানো হয়েছে`, 'warn');
});
if ($('expenseForm')) $('expenseForm').onsubmit = e => { e.preventDefault(); if (!hasPerm('canExpenses')) return toast('অনুমতি নেই!', 'error'); const pend = isStaff() && getRules().requireApproval; db.expenses.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), approvalStatus: pend ? 'pending' : 'approved', date: $('expDate').value, title: $('expTitle').value.trim(), category: $('expCategory').value, method: $('expMethod')?.value || 'Cash', amount: num($('expAmount').value), note: $('expNote').value.trim() }); save(); e.target.reset(); $('expDate').value = today(); if ($('expMethod') && db.wallets.includes('Cash')) $('expMethod').value = 'Cash'; syncBankQuickPicker('expMethod', 'expBankQuickWrap'); toast(pend ? 'খরচ অ্যাপ্রুভালের জন্য পাঠানো হয়েছে!' : 'খরচ সেভ হয়েছে!'); };
if ($('recurringBillForm')) $('recurringBillForm').onsubmit = e => {
  e.preventDefault(); if (!hasPerm('canExpenses')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  const title = $('rbTitle')?.value.trim(), amt = num($('rbAmount')?.value), day = Math.max(1, Math.min(31, Math.round(num($('rbDay')?.value))));
  if (!title || amt <= 0) return toast(L('সঠিক বিলের নাম ও পরিমাণ দিন!', 'Enter valid bill title & amount!'), 'error');
  if (!Array.isArray(db.recurringBills)) db.recurringBills = [];
  db.recurringBills.push({ id: uid(), updatedAt: Date.now(), title, category: $('rbCategory')?.value || 'Office Rent', method: $('rbMethod')?.value || 'Cash', amount: amt, day, lastPaidYm: '' });
  save(); logActivity(`রিকারিং বিল: ${title} (${money(amt)})`);
  e.target.reset(); if ($('rbDay')) $('rbDay').value = 5; refreshWalletSelects();
  toast(L('মাসিক রিকারিং বিল সেভ হয়েছে!', 'Monthly recurring bill added!'));
};
window.payRecurringBill = async id => {
  if (!hasPerm('canExpenses')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  const b = (db.recurringBills || []).find(x => x.id === id); if (!b) return;
  const ym = today().slice(0, 7);
  if (b.lastPaidYm === ym && !(await askConfirm(L(`"${b.title}" এই মাসে ইতিমধ্যেই পরিশোধিত! আবার যোগ করবেন?`, `"${b.title}" is already paid this month! Pay again?`)))) return;
  const pend = isStaff() && getRules().requireApproval;
  db.expenses.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), approvalStatus: pend ? 'pending' : 'approved', recurringId: b.id, date: today(), title: b.title, category: b.category || 'Office Rent', method: b.method || 'Cash', amount: num(b.amount), note: `Recurring Bill (${ym})` });
  b.lastPaidYm = ym; b.updatedAt = Date.now();
  save(); logActivity(`রিকারিং বিল পরিশোধ: ${b.title} (${money(b.amount)})`);
  toast(pend ? L('খরচ অ্যাপ্রুভালের জন্য পাঠানো হয়েছে!', 'Expense sent for approval!') : L(`✅ ${b.title} পরিশোধ হয়ে খরচে যুক্ত হয়েছে!`, `✅ Paid ${b.title} and recorded in expenses!`));
};
window.deleteRecurringBill = async id => {
  if (!hasPerm('canDelete') || !(await askConfirm(L('রিকারিং বিলটি মুছবেন?', 'Delete recurring bill?')))) return;
  markDeleted(id); db.recurringBills = (db.recurringBills || []).filter(x => x.id !== id); save(); toast(L('মুছে ফেলা হয়েছে', 'Deleted'), 'warn');
};
function renderRecurringBills() {
  if (!$('recurringBillRows')) return;
  const ym = today().slice(0, 7);
  $('recurringBillRows').innerHTML = (db.recurringBills || []).map(b => {
    const isPaid = b.lastPaidYm === ym || db.expenses.some(e => e.approvalStatus !== 'pending' && String(e.date || '').startsWith(ym) && e.recurringId === b.id);
    return `<tr><td><strong>${esc(b.title)}</strong></td><td><span class="badge-admin">${esc(b.category)}</span> <small class="muted">${esc(b.method || 'Cash')}</small></td><td class="bad"><strong>${money(b.amount)}</strong></td><td>${L('প্রতি মাসের', 'Day')} ${num(b.day) || 1} ${L('তারিখ', '')}</td><td>${isPaid ? `<span class="badge-success">✓ ${L('পেইড', 'Paid')}</span>` : `<span class="badge-warn">${L('বাকি', 'Due')}</span>`}</td><td>${isPaid ? '' : `<button type="button" class="sm perm-exp" style="background:#059669" onclick="payRecurringBill('${b.id}')">💸 ${L('পে ও সেভ', 'Pay')}</button>`}<button type="button" class="danger sm perm-del" onclick="deleteRecurringBill('${b.id}')">✕</button></td></tr>`;
  }).join('') || `<tr><td colspan="6">${L('কোনো মাসিক রিকারিং বিল সেট করা নেই', 'No recurring office bills configured')}</td></tr>`;
}
if ($('expBudgetForm')) $('expBudgetForm').onsubmit = e => {
  e.preventDefault();
  if (!hasPerm('canExpenses')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  const cat = $('ebCat')?.value, lim = Math.max(0, num($('ebLimit')?.value));
  if (!cat) return;
  if (!db.expenseBudgets || typeof db.expenseBudgets !== 'object') db.expenseBudgets = {};
  if (lim <= 0) delete db.expenseBudgets[cat];
  else db.expenseBudgets[cat] = lim;
  save();
  if ($('ebLimit')) $('ebLimit').value = '';
  toast(lim > 0 ? L(`${cat}-এর মাসিক বাজেট ${money(lim)} সেট হয়েছে!`, `Monthly budget ${money(lim)} set for ${cat}!`) : L(`${cat} বাজেট সরানো হয়েছে`, `Budget removed for ${cat}`));
};
window.deleteExpenseBudget = cat => {
  if (!hasPerm('canExpenses')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  if (db.expenseBudgets && Object.prototype.hasOwnProperty.call(db.expenseBudgets, cat)) {
    delete db.expenseBudgets[cat];
    save();
    toast(L('বাজেট লিমিট সরানো হয়েছে', 'Budget cap removed'), 'warn');
  }
};
function renderExpenseBudgets() {
  const host = $('expenseBudgetGrid'); if (!host) return;
  const budgets = db.expenseBudgets && typeof db.expenseBudgets === 'object' ? db.expenseBudgets : {};
  const ym = today().slice(0, 7);
  const spentByCat = {};
  db.expenses.filter(e => e.approvalStatus !== 'pending' && String(e.date || '').startsWith(ym)).forEach(e => {
    spentByCat[e.category] = (spentByCat[e.category] || 0) + num(e.amount);
  });
  const entries = Object.entries(budgets).filter(([, lim]) => num(lim) > 0);
  host.innerHTML = entries.map(([cat, lim]) => {
    const spent = num(spentByCat[cat]), pct = Math.min(100, Math.round((spent / num(lim)) * 100));
    const over = spent > num(lim), warn = !over && spent >= num(lim) * 0.8;
    const badgeCls = over ? 'badge-danger' : (warn ? 'badge-warn' : 'badge-success');
    const barCol = over ? '#dc2626' : (warn ? '#f59e0b' : '#10b981');
    const stTxt = over ? L('বাজেট অতিক্রম!', 'Over Budget!') : (warn ? L('৮০%+ ব্যবহৃত', '80%+ Used') : L('নিরাপদ', 'Safe'));
    const escCat = esc(cat).replace(/'/g, "\\'");
    return `<div class="closing-box"><div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:5px"><strong style="font-size:12.5px">${esc(cat)}</strong><div style="display:flex;align-items:center;gap:4px"><span class="${badgeCls}" style="font-size:10px">${stTxt}</span><button type="button" class="secondary sm perm-exp" style="padding:1px 6px;margin:0" onclick="deleteExpenseBudget('${escCat}')">✕</button></div></div><div style="font-size:12px"><strong>${money(spent)}</strong> / ${money(lim)} (${pct}%)</div><div class="prog-wrap" style="margin-top:6px"><div class="prog-bar" style="width:${pct}%;background:${barCol}"></div></div></div>`;
  }).join('') || `<div class="muted" style="grid-column:1 / -1">${L('এখনো কোনো ক্যাটাগরিতে মাসিক বাজেট লিমিট সেট করা হয়নি — ডান পাশের ফর্ম থেকে সেট করুন।', 'No monthly category budgets set yet — add a cap above.')}</div>`;
}
if ($('walletTransferForm')) $('walletTransferForm').onsubmit = e => {
  e.preventDefault();
  const from = $('wtFrom')?.value || 'Cash', to = $('wtTo')?.value || 'Bank', amt = num($('wtAmount')?.value), fee = Math.max(0, num($('wtFee')?.value));
  if (from === to) return toast(L('উৎস ও গন্তব্য ওয়ালেট ভিন্ন হতে হবে!', 'From and To wallets must be different!'), 'error');
  if (amt <= 0) return toast(L('সঠিক টাকা দিন!', 'Enter a valid amount!'), 'error');
  const payload = { id: uid(), updatedAt: Date.now(), date: $('wtDate')?.value || today(), from, to, amount: amt, fee, note: $('wtNote')?.value.trim() || '' };
  if (typeof shouldUseMakerChecker === 'function' && shouldUseMakerChecker()) {
    queueMakerRequest('walletTransfer', `ওয়ালেট ট্রান্সফার: ${from} → ${to}`, `${money(amt)}${fee ? ` (ফি ${money(fee)})` : ''}`, payload);
    e.target.reset(); if ($('wtDate')) $('wtDate').value = today(); if ($('wtFee')) $('wtFee').value = 0; refreshWalletSelects();
    return;
  }
  if (!Array.isArray(db.walletTransfers)) db.walletTransfers = [];
  db.walletTransfers.push(payload);
  save(); logActivity(`ওয়ালেট ট্রান্সফার: ${from} → ${to} (${money(amt)})`);
  e.target.reset(); if ($('wtDate')) $('wtDate').value = today(); if ($('wtFee')) $('wtFee').value = 0; refreshWalletSelects();
  toast(L('ওয়ালেট ট্রান্সফার সম্পন্ন হয়েছে!', 'Wallet transfer completed!'));
};
window.deleteWalletTransfer = async id => {
  if (!hasPerm('canDelete') || !(await askConfirm(L('ওয়ালেট ট্রান্সফারটি মুছবেন?', 'Delete wallet transfer?')))) return;
  markDeleted(id); db.walletTransfers = (db.walletTransfers || []).filter(x => x.id !== id); save(); toast(L('মুছে ফেলা হয়েছে', 'Deleted'), 'warn');
};
function renderWalletTransfers() {
  if (!$('walletTransferRows')) return;
  $('walletTransferRows').innerHTML = [...(db.walletTransfers || [])].sort(byDateDesc).map(wt => `<tr><td>${esc(wt.date)}</td><td><strong>${esc(wt.from)}</strong> → <strong>${esc(wt.to)}</strong></td><td>${money(wt.amount)}${num(wt.fee) > 0 ? `<br><small class="bad">${L('ফি', 'Fee')}: ${money(wt.fee)}</small>` : ''}</td><td>${esc(wt.note || '—')}</td><td><button type="button" class="danger sm perm-del" onclick="deleteWalletTransfer('${wt.id}')">✕</button></td></tr>`).join('') || `<tr><td colspan="5">${L('কোনো ওয়ালেট ট্রান্সফার নেই', 'No wallet transfers yet')}</td></tr>`;
}
window.openEditExpenseModal = id => { if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const ex = db.expenses.find(x => x.id === id); if (!ex || isLocked24h(ex)) return toast('২৪ ঘণ্টার বেশি পুরোনো খরচ এডিট করা যাবে না!', 'error'); refreshWalletSelects(); $('eeId').value = ex.id; $('eeDate').value = ex.date; $('eeTitle').value = ex.title; $('eeCategory').value = ex.category; if ($('eeMethod')) { if (ex.method && ![...$('eeMethod').options].some(o => o.value === ex.method)) $('eeMethod').add(new Option(ex.method, ex.method)); $('eeMethod').value = ex.method || 'Cash'; } $('eeAmount').value = ex.amount; $('eeNote').value = ex.note || ''; $('editExpenseModal').style.display = 'flex'; };
if ($('editExpenseForm')) $('editExpenseForm').onsubmit = e => { e.preventDefault(); const ex = db.expenses.find(x => x.id === $('eeId').value); if (ex) { ex.date = $('eeDate').value; ex.title = $('eeTitle').value.trim(); ex.category = $('eeCategory').value; ex.method = $('eeMethod')?.value || 'Cash'; ex.amount = num($('eeAmount').value); ex.note = $('eeNote').value.trim(); ex.updatedAt = Date.now(); save(); closeModal('editExpenseModal'); toast('আপডেট হয়েছে!'); } };
window.deleteExpense = async id => { if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); const ex = db.expenses.find(x => x.id === id); if (!ex || isLocked24h(ex)) return toast('অনুমতি নেই বা ২৪ ঘণ্টার পুরোনো!', 'error'); if (!(await askConfirm('মুছবেন?'))) return; moveToTrash('expense', `খরচ: ${ex.title}`, ex); markDeleted(id); db.expenses = db.expenses.filter(x => x.id !== id); save(); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn'); };
if ($('cashAdjustForm')) $('cashAdjustForm').onsubmit = e => { e.preventDefault(); const m = $('caMethod')?.value || 'Cash', a = num($('caAmount')?.value); if (a <= 0) return toast('সঠিক পরিমাণ দিন!', 'error'); db.cashAdjustments.push({ id: uid(), updatedAt: Date.now(), date: $('caDate').value || today(), method: m, type: $('caType').value, amount: a, note: $('caNote').value.trim() }); save(); e.target.reset(); $('caDate').value = today(); if ($('caMethod') && db.wallets.includes('Cash')) $('caMethod').value = 'Cash'; syncBankQuickPicker('caMethod', 'caBankQuickWrap'); toast('ক্যাশবুক আপডেট হয়েছে!'); };
window.deleteCashAdjust = async id => { if (!hasPerm('canDelete') || !(await askConfirm('মুছবেন?'))) return; markDeleted(id); db.cashAdjustments = db.cashAdjustments.filter(x => x.id !== id); save(); toast('মুছে ফেলা হয়েছে', 'warn'); };
if ($('paymentForm')) $('paymentForm').onsubmit = e => { e.preventDefault(); if (!hasPerm('canPayments')) return toast('অনুমতি নেই!', 'error'); const cid = $('pCustomer')?.value; if (!cid) return toast('কাস্টমার নির্বাচন করুন!', 'error'); const amt = num($('pAmount')?.value); if (amt <= 0) return toast('সঠিক পরিমাণ দিন!', 'error'); const pend = isStaff() && getRules().requireApproval; db.payments.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), approvalStatus: pend ? 'pending' : 'approved', date: $('pDate').value || today(), customerId: cid, amount: amt, method: $('pMethod')?.value || 'Cash', fee: num($('pFee')?.value), ref: $('pRef').value.trim(), note: $('pNote').value.trim() }); save(); if (!pend) syncCustomerPortalIfLinked(cid); e.target.reset(); $('pDate').value = today(); if ($('pFee')) $('pFee').value = 0; syncBankQuickPicker('pMethod', 'pBankQuickWrap'); updatePaymentCustomerStatus(); toast(pend ? 'পেমেন্ট অ্যাপ্রুভালের জন্য পাঠানো হয়েছে!' : 'পেমেন্ট জমা হয়েছে!'); };
window.openEditPaymentModal = id => { if (!hasPerm('canEdit')) return toast('অনুমতি নেই!', 'error'); const p = db.payments.find(x => x.id === id); if (!p || isLocked24h(p)) return toast('২৪ ঘণ্টার পুরোনো পেমেন্ট এডিট করা যাবে না!', 'error'); refresh(); $('epId').value = p.id; $('epDate').value = p.date; $('epCustomer').value = p.customerId; $('epAmount').value = p.amount; if ($('epMethod')) { if (p.method && ![...$('epMethod').options].some(o => o.value === p.method)) $('epMethod').add(new Option(p.method, p.method)); $('epMethod').value = p.method; } if ($('epFee')) $('epFee').value = p.fee || 0; $('epRef').value = p.ref || ''; $('epNote').value = p.note || ''; $('editPaymentModal').style.display = 'flex'; };
if ($('editPaymentForm')) $('editPaymentForm').onsubmit = e => { e.preventDefault(); const p = db.payments.find(x => x.id === $('epId').value); if (p) { p.date = $('epDate').value; p.customerId = $('epCustomer').value; p.amount = num($('epAmount').value); p.method = $('epMethod').value; p.fee = num($('epFee')?.value); p.ref = $('epRef').value.trim(); p.note = $('epNote').value.trim(); p.updatedAt = Date.now(); save(); syncCustomerPortalIfLinked(p.customerId); closeModal('editPaymentModal'); toast('আপডেট হয়েছে!'); } };
window.deletePayment = async id => { if (!hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error'); const p = db.payments.find(x => x.id === id); if (!p || isLocked24h(p)) return toast('অনুমতি নেই বা ২৪ ঘণ্টার পুরোনো!', 'error'); if (!(await requireMasterPin('পেমেন্ট ডিলিট'))) return; if (!(await askConfirm(`${cname(p.customerId)}-এর ${money(p.amount)} (${p.method || 'Cash'}) পেমেন্টটি ট্র্যাশে পাঠাবেন?`))) return; const cid = p.customerId; moveToTrash('payment', `পেমেন্ট: ${cname(p.customerId)} (${money(p.amount)})`, p); markDeleted(id); db.payments = db.payments.filter(x => x.id !== id); save(); syncCustomerPortalIfLinked(cid); toast('ট্র্যাশে পাঠানো হয়েছে', 'warn'); };
window.approvePending = (type, id) => { const arr = type === 'payment' ? db.payments : db.expenses, item = arr.find(x => x.id === id); if (!item) return; item.approvalStatus = 'approved'; item.updatedAt = Date.now(); save(); if (type === 'payment') syncCustomerPortalIfLinked(item.customerId); renderAdminPanel(); toast('অনুমোদিত হয়েছে!'); };
window.rejectPending = async (type, id) => { if (!(await askConfirm('বাতিল করবেন?'))) return; markDeleted(id); if (type === 'payment') db.payments = db.payments.filter(x => x.id !== id); else db.expenses = db.expenses.filter(x => x.id !== id); save(); renderAdminPanel(); toast('বাতিল করা হয়েছে', 'warn'); };

// === PART 3: 1-CLICK WHATSAPP BROADCAST, DUES, RENDER, ADMIN, CLOUD SYNC, CHAT, PORTAL & BOOT ===
function normalizeBdPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('8801')) return d;
  if (d.startsWith('01')) return '88' + d;
  if (d.startsWith('1') && d.length === 10) return '880' + d;
  return d;
}

// 1-Click WhatsApp Broadcast System + Custom Presets + Rate Notice PNG Card
let bcSelectedIds = new Set(), bcSentIds = new Set(), bcQueueList = [], bcQueueIdx = -1, currentBcPreset = 'rate';
function broadcastTemplateFor(preset) {
  const savedCustom = String(db.agency?.bcTemplates?.[preset] || '').trim();
  if (savedCustom) return savedCustom;
  const agName = db.agency?.name || 'Ads হিসাব ম্যানেজার';
  if (preset === 'rate') {
    return L(
      `আসসালামু আলাইকুম {name}, ${agName} থেকে জরুরি নোটিশ:\nআন্তর্জাতিক কার্ড ও ব্যাংক চার্জ পরিবর্তনের কারণে আজ ({date}) থেকে বিজ্ঞাপনের নতুন ডলার রেট *{rate} টাকা* নির্ধারণ করা হয়েছে।\n\nনতুন ক্যাম্পেইন বা চলমান অ্যাডের হিসাব এই রেটে সমন্বয় করা হবে। কোনো প্রশ্ন থাকলে বা নতুন অ্যাড চালু করতে চাইলে রিপ্লাই দিন।\nধন্যবাদ — ${agName}`,
      `Hello {name}, important update from ${agName}:\nDue to bank & card fee adjustments, our new USD ad rate effective today ({date}) is *{rate} BDT/$*.\n\nNew and renewed campaigns will be billed at this rate. Reply to confirm or launch a new campaign.\nThank you — ${agName}`
    );
  }
  if (preset === 'platforms') {
    return L(
      `আসসালামু আলাইকুম {name}! 🎉\n${agName}-এ এখন Meta/Facebook-এর পাশাপাশি *Google Ads*, *YouTube Video Ads* এবং *TikTok Ads* সার্ভিসও চালু রয়েছে!\n\nআপনার ব্যবসার সেলস ও ব্র্যান্ডিং বাড়াতে আজকের রেট {rate} টাকায় মাল্টি-প্ল্যাটফর্ম ক্যাম্পেইন শুরু করতে চাইলে রিপ্লাই দিন। ধন্যবাদ!`,
      `Hello {name}! 🎉\nAlongside Meta/Facebook, ${agName} now offers *Google Ads*, *YouTube Video Ads*, and *TikTok Ads*!\n\nLaunch your multi-platform campaign today at {rate} BDT/$. Reply to get started!`
    );
  }
  if (preset === 'due') {
    return L(
      `আসসালামু আলাইকুম {name}, ${agName} থেকে জানাচ্ছি—আপনার বর্তমান বকেয়া রয়েছে *{due}*। বিজ্ঞাপন নিরবচ্ছিন্ন রাখতে অনুগ্রহ করে বকেয়া পরিশোধ করুন।\n{payinfo}\nধন্যবাদ!`,
      `Hello {name}, friendly reminder from ${agName}: your current due balance is *{due}*. Please clear the balance to keep ads running.\n{payinfo}\nThank you!`
    );
  }
  return L(
    `আসসালামু আলাইকুম {name}, ${agName} থেকে বিশেষ অফার!\nচলমান বা নতুন ক্যাম্পেইন (Meta / Google / YouTube / TikTok) আজ রিনিউ করলে পাচ্ছেন ফ্রি অডিয়েন্স অপ্টিমাইজেশন! আজকের রেট: {rate} টাকা। অর্ডার করতে রিপ্লাই দিন। ধন্যবাদ!`,
    `Hello {name}, special offer from ${agName}!\nRenew or launch any Meta / Google / YouTube / TikTok campaign today to get free audience optimization! Today's rate: {rate} BDT/$. Reply to book!`
  );
}
window.saveCurrentBroadcastPreset = () => {
  const txt = $('waBcMessage')?.value.trim() || '';
  if (!db.agency.bcTemplates || typeof db.agency.bcTemplates !== 'object') db.agency.bcTemplates = DEFAULT_BC_TEMPLATES();
  db.agency.bcTemplates[currentBcPreset] = txt;
  save(); applyAgencyBranding();
  toast(L(`"${currentBcPreset}" টেমপ্লেট সেভ হয়েছে!`, `Saved preset template "${currentBcPreset}"!`));
};
window.downloadRateCardPng = async (customRate = null) => {
  const ag = db.agency || {}, rateVal = num(customRate) || num($('waBcRateInput')?.value) || rateFor(today()) || num(ag.defaultRate) || 125;
  const logoImg = await loadImgCors(ag.logoUrl);
  const W = 760, H = 430, canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#059669'); grad.addColorStop(1, '#3157e8');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 94);
  let tx = 36; if (logoImg) { try { ctx.fillStyle = '#ffffff'; ctx.fillRect(34, 21, 52, 52); ctx.drawImage(logoImg, 36, 23, 48, 48); tx = 100; } catch (e) {} }
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 23px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(ag.name || 'Ads হিসাব ম্যানেজার', tx, 48);
  ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.font = '12.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(agencyContactLine(ag).slice(0, 62), tx, 70);
  ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px Arial, sans-serif'; ctx.fillText('OFFICIAL RATE NOTICE', W - 36, 44);
  ctx.font = '12.5px Inter, "Noto Sans Bengali", Arial, sans-serif'; ctx.fillText(`${L('কার্যকর তারিখ', 'Effective')}: ${today()}`, W - 36, 66);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff'; ctx.fillRect(36, 118, W - 72, 146);
  ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5; ctx.strokeRect(36, 118, W - 72, 146);
  ctx.fillStyle = '#059669'; ctx.font = 'bold 14px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText(L('💵 বিজ্ঞাপনের নতুন ডলার বিলিং রেট', '💵 UPDATED AD BILLING DOLLAR RATE'), W / 2, 150);
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 46px Inter, Arial, sans-serif';
  ctx.fillText(`1 USD = ৳${rateVal.toFixed(2)}`, W / 2, 208);
  ctx.fillStyle = '#64748b'; ctx.font = '13px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText(L('নতুন ও চলমান সব ক্যাম্পেইন এই রেটে সমন্বয় করা হবে', 'Applied to all new and active campaign billings'), W / 2, 242);

  const plats = [['📘 Meta Ads', '#1d4ed8'], ['🔍 Google Ads', '#15803d'], ['▶️ YouTube Ads', '#dc2626'], ['🎵 TikTok Ads', '#0f172a']];
  plats.forEach(([lbl, col], i) => {
    const px = 36 + i * 174, py = 282;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(px, py, 164, 42);
    ctx.strokeStyle = '#e2e8f0'; ctx.strokeRect(px, py, 164, 42);
    ctx.fillStyle = col; ctx.font = 'bold 13px Inter, Arial, sans-serif'; ctx.fillText(lbl, px + 82, py + 26);
  });

  ctx.textAlign = 'left';
  if (ag.payInfo) {
    ctx.fillStyle = '#eff6ff'; ctx.fillRect(36, 340, W - 72, 44);
    ctx.fillStyle = '#1e3a8a'; ctx.font = 'bold 12.5px Inter, "Noto Sans Bengali", Arial, sans-serif';
    ctx.fillText(`💳 ${L('পেমেন্ট মাধ্যম', 'Payment')}: ${String(ag.payInfo).slice(0, 74)}`, 50, 367);
  }
  ctx.textAlign = 'center'; ctx.fillStyle = '#64748b'; ctx.font = '12px Inter, "Noto Sans Bengali", Arial, sans-serif';
  ctx.fillText(`${L('ধন্যবাদ!', 'Thank you!')} — ${ag.name || 'Ads হিসাব ম্যানেজার'}`, W / 2, H - 16);
  canvas.toBlob(blob => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `rate_notice_${today()}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast(L('রেট নোটিশ PNG ডাউনলোড হয়েছে!', 'Rate Notice Card PNG downloaded!')); }, 'image/png');
};
function formatBroadcastMsg(cust, tpl) {
  const ag = db.agency || {}, rateVal = num($('waBcRateInput')?.value) || rateFor(today()) || num(ag.defaultRate) || 125;
  const b = billed(cust.id), p = paid(cust.id), dueAmt = money(Math.max(0, b - p));
  const payInf = ag.payInfo ? `${L('পেমেন্ট', 'Payment')}: ${ag.payInfo}` : '';
  return String(tpl || '').replace(/\{name\}/g, cust.name || L('ক্লায়েন্ট', 'Client')).replace(/\{agency\}/g, ag.name || 'Ads হিসাব ম্যানেজার').replace(/\{rate\}/g, rateVal.toFixed(2)).replace(/\{due\}/g, dueAmt).replace(/\{bill\}/g, money(b)).replace(/\{paid\}/g, money(p)).replace(/\{date\}/g, today()).replace(/\{payinfo\}/g, payInf);
}
function getBroadcastAudienceList() {
  const mode = $('waBcAudience')?.value || 'all', skipToday = Boolean($('waBcSkipToday')?.checked), td = today();
  return db.customers.filter(c => {
    const wa = normalizeBdPhone(c.phone); if (wa.length < 10) return false;
    if (skipToday && db.reminderDates?.[c.id] === td) return false;
    if (mode === 'active') return (c.stage || 'Active Client') === 'Active Client';
    if (mode === 'due') return clientBalance(c.id) < 0;
    return true;
  });
}
function recordBroadcastLog(subject, count, mode) {
  if (!Array.isArray(db.broadcastLogs)) db.broadcastLogs = [];
  db.broadcastLogs.unshift({ id: uid(), updatedAt: Date.now(), time: new Date().toLocaleString('bn-BD'), subject, count, mode });
  if (db.broadcastLogs.length > 50) db.broadcastLogs.pop();
  save();
}
window.openBroadcastModal = (preset = 'rate', customRate = null) => {
  if (!$('waBroadcastModal')) return;
  const rVal = customRate || rateFor(today()) || num(db.agency?.defaultRate) || 125;
  if ($('waBcRateInput')) $('waBcRateInput').value = rVal;
  bcSentIds.clear(); bcQueueList = []; bcQueueIdx = -1;
  if ($('waQueueBar')) $('waQueueBar').style.display = 'none';
  if ($('waBcApiBtn')) $('waBcApiBtn').style.display = db.agency?.waApiUrl ? 'inline-flex' : 'none';
  const btn = document.querySelector(`#waBcPresetPills button[data-preset="${preset}"]`);
  applyBroadcastPreset(preset, btn);
  refreshBroadcastRecipients();
  $('waBroadcastModal').style.display = 'flex';
};
window.applyBroadcastPreset = (preset, btn) => {
  currentBcPreset = preset || 'rate';
  document.querySelectorAll('#waBcPresetPills button').forEach(b => b.classList.toggle('active', b === btn || b.dataset.preset === currentBcPreset));
  if (preset === 'due' && $('waBcAudience')) $('waBcAudience').value = 'due';
  else if ($('waBcAudience') && $('waBcAudience').value === 'due' && preset !== 'due') $('waBcAudience').value = 'all';
  if ($('waBcMessage')) $('waBcMessage').value = broadcastTemplateFor(currentBcPreset);
  refreshBroadcastRecipients();
};
window.insertBcTag = tag => {
  const ta = $('waBcMessage'); if (!ta) return;
  const s = ta.selectionStart || 0, e = ta.selectionEnd || 0;
  ta.value = ta.value.slice(0, s) + tag + ta.value.slice(e);
  ta.focus(); updateBroadcastPreview();
};
window.refreshBroadcastRecipients = () => {
  const list = getBroadcastAudienceList();
  bcSelectedIds = new Set(list.map(c => c.id));
  if ($('waBcSelectAll')) $('waBcSelectAll').checked = list.length > 0;
  renderBroadcastRecipients();
  updateBroadcastPreview();
};
function renderBroadcastRecipients() {
  const host = $('waBcRows'); if (!host) return;
  const list = getBroadcastAudienceList();
  host.innerHTML = list.map(c => {
    const due = Math.max(0, billed(c.id) - paid(c.id)), sent = bcSentIds.has(c.id), sentTd = db.reminderDates?.[c.id] === today(), isCur = bcQueueIdx >= 0 && bcQueueList[bcQueueIdx]?.id === c.id;
    return `<tr style="${isCur ? 'background:rgba(16,185,129,.12)' : ''}"><td><input type="checkbox" class="row-chk" ${bcSelectedIds.has(c.id) ? 'checked' : ''} onchange="toggleSingleBcCust('${c.id}', this.checked)"></td><td><strong>${esc(c.name)}</strong><br><small class="muted">${esc(c.stage || 'Active')}</small></td><td><code>${esc(c.phone)}</code></td><td class="${due > 0 ? 'bad' : 'muted'}">${due > 0 ? money(due) : '৳0'}</td><td>${sent ? `<span class="badge-success">✓ ${L('পাঠানো', 'Sent')}</span>` : (isCur ? `<span class="badge-warn">▶ ${L('কিউতে', 'Active')}</span>` : (sentTd ? `<span class="badge-success">✓ ${L('আজ পাঠানো', 'Sent Today')}</span>` : `<span class="badge-admin">${L('প্রস্তুত', 'Ready')}</span>`))}</td><td><button type="button" class="wa-btn sm" style="margin:0" onclick="sendSingleBroadcast('${c.id}')">📲 ${L('পাঠান', 'Send')}</button></td></tr>`;
  }).join('') || `<tr><td colspan="6">${L('ফোন নম্বরসহ কোনো কাস্টমার পাওয়া যায়নি', 'No customers with valid phone found')}</td></tr>`;
  if ($('waBcStatsText')) $('waBcStatsText').textContent = L(`নির্বাচিত: ${bcSelectedIds.size} জন · মোট প্রাপ্য: ${list.length} জন · পাঠানো হয়েছে: ${bcSentIds.size} জন`, `Selected: ${bcSelectedIds.size} · Eligible: ${list.length} · Sent: ${bcSentIds.size}`);
}
window.toggleSingleBcCust = (id, checked) => {
  if (checked) bcSelectedIds.add(id); else bcSelectedIds.delete(id);
  if ($('waBcSelectAll')) $('waBcSelectAll').checked = bcSelectedIds.size === getBroadcastAudienceList().length && bcSelectedIds.size > 0;
  renderBroadcastRecipients();
};
window.toggleAllBroadcastRecipients = checked => {
  const list = getBroadcastAudienceList();
  bcSelectedIds = checked ? new Set(list.map(c => c.id)) : new Set();
  renderBroadcastRecipients();
};
window.updateBroadcastPreview = () => {
  const box = $('waBcPreview'), tpl = $('waBcMessage')?.value || ''; if (!box) return;
  const sample = getBroadcastAudienceList()[0] || db.customers[0] || { id: '', name: L('নমুনা কাস্টমার', 'Sample Client'), phone: '01700000000' };
  box.innerHTML = `<strong style="color:#059669;display:block;margin-bottom:4px">👁️ ${L('মেসেজ প্রিভিউ', 'Message Preview')} (${esc(sample.name)}):</strong>${esc(formatBroadcastMsg(sample, tpl))}`;
};
window.sendSingleBroadcast = custId => {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  const wa = normalizeBdPhone(c.phone); if (!wa) return toast(L('সঠিক মোবাইল নম্বর নেই!', 'Invalid mobile number!'), 'error');
  const msg = formatBroadcastMsg(c, $('waBcMessage')?.value || '');
  bcSentIds.add(custId);
  if (!db.reminderDates) db.reminderDates = {};
  db.reminderDates[custId] = today();
  db.reminderLogs[custId] = new Date().toLocaleString('bn-BD');
  save(); renderBroadcastRecipients();
  openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`);
};
function openQueueStep() {
  if (bcQueueIdx < 0 || bcQueueIdx >= bcQueueList.length) {
    const sentCount = bcQueueList.length, r = $('waBcRateInput')?.value || rateFor(today());
    if ($('waQueueBar')) $('waQueueBar').style.display = 'none';
    bcQueueIdx = -1;
    recordBroadcastLog(`${currentBcPreset.toUpperCase()} (Rate: ৳${r})`, sentCount, 'Auto Queue');
    renderBroadcastRecipients();
    return toast(L(`🎉 সব ${sentCount} জন কাস্টমারকে WhatsApp কিউ সম্পন্ন হয়েছে!`, `🎉 Completed queue for ${sentCount} customers!`));
  }
  const c = bcQueueList[bcQueueIdx], wa = normalizeBdPhone(c.phone), msg = formatBroadcastMsg(c, $('waBcMessage')?.value || '');
  if ($('waQueueBar')) $('waQueueBar').style.display = 'block';
  if ($('waQueueStatus')) $('waQueueStatus').textContent = `${L('চলমান কিউ', 'Active Queue')}: ${bcQueueIdx + 1} / ${bcQueueList.length}`;
  if ($('waQueueCurrentName')) $('waQueueCurrentName').textContent = `${L('কাস্টমার', 'Customer')}: ${c.name} (${c.phone})`;
  if ($('waQueueProgBar')) $('waQueueProgBar').style.width = `${Math.round(((bcQueueIdx + 1) / bcQueueList.length) * 100)}%`;
  renderBroadcastRecipients();
  openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`);
}
window.startBroadcastQueue = () => {
  const list = getBroadcastAudienceList().filter(c => bcSelectedIds.has(c.id));
  if (!list.length) return toast(L('কমপক্ষে একজন ফোন নম্বরসহ কাস্টমার নির্বাচন করুন!', 'Select at least one customer with a phone number!'), 'warn');
  bcQueueList = list; bcQueueIdx = 0; openQueueStep();
};
window.broadcastNextInQueue = (markSent = true) => {
  if (bcQueueIdx < 0 || bcQueueIdx >= bcQueueList.length) return;
  if (markSent) { const cur = bcQueueList[bcQueueIdx]; bcSentIds.add(cur.id); if (!db.reminderDates) db.reminderDates = {}; db.reminderDates[cur.id] = today(); db.reminderLogs[cur.id] = new Date().toLocaleString('bn-BD'); }
  bcQueueIdx++; openQueueStep();
};
window.stopBroadcastQueue = () => {
  if (bcQueueIdx >= 0 && bcSentIds.size > 0) recordBroadcastLog(`${currentBcPreset.toUpperCase()} (Partial)`, bcSentIds.size, 'Queue Stopped');
  bcQueueIdx = -1; bcQueueList = [];
  if ($('waQueueBar')) $('waQueueBar').style.display = 'none';
  renderBroadcastRecipients(); toast(L('ব্রডকাস্ট কিউ থামানো হয়েছে', 'Broadcast queue stopped'), 'warn');
};
window.batchOpenBroadcastTabs = async () => {
  const list = getBroadcastAudienceList().filter(c => bcSelectedIds.has(c.id));
  if (!list.length) return toast(L('কোনো কাস্টমার নির্বাচিত নেই!', 'No customer selected!'), 'warn');
  const limit = Math.min(list.length, 6);
  if (list.length > 6 && !(await askConfirm(L(`ব্রাউজার পপআপ ব্লক এড়াতে একসাথে প্রথম ${limit} জন কাস্টমারের WhatsApp ট্যাব খোলা হবে (বাকিদের Auto Queue দিয়ে পাঠাতে পারবেন)। এগোবেন?`, `To avoid popup blocking, the first ${limit} WhatsApp tabs will open (use Auto Queue for the rest). Continue?`)))) return;
  const tpl = $('waBcMessage')?.value || '';
  list.slice(0, limit).forEach((c, idx) => {
    setTimeout(() => {
      const wa = normalizeBdPhone(c.phone);
      bcSentIds.add(c.id); if (!db.reminderDates) db.reminderDates = {}; db.reminderDates[c.id] = today(); db.reminderLogs[c.id] = new Date().toLocaleString('bn-BD');
      openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(formatBroadcastMsg(c, tpl))}`);
      if (idx === limit - 1) { recordBroadcastLog(`${currentBcPreset.toUpperCase()} Batch`, limit, 'Batch Tabs'); renderBroadcastRecipients(); }
    }, idx * 250);
  });
};
window.sendBroadcastViaApi = async btn => {
  const apiUrl = String(db.agency?.waApiUrl || '').trim(), token = String(db.agency?.waApiToken || '').trim();
  if (!apiUrl) return toast(L('সেটিংস → এজেন্সি ও API থেকে WhatsApp Gateway URL দিন!', 'Add WhatsApp Gateway URL in Settings → Agency & API!'), 'warn');
  const list = getBroadcastAudienceList().filter(c => bcSelectedIds.has(c.id));
  if (!list.length) return toast(L('কোনো কাস্টমার নির্বাচিত নেই!', 'No customer selected!'), 'warn');
  if (!(await askConfirm(L(`${list.length} জন কাস্টমারকে WhatsApp API দিয়ে সরাসরি মেসেজ পাঠাবেন?`, `Send WhatsApp API broadcast to ${list.length} customers?`)))) return;
  const tpl = $('waBcMessage')?.value || '';
  await withBtnLoading(btn, L('⏳ পাঠানো হচ্ছে...', '⏳ Sending...'), async () => {
    let ok = 0, fail = 0;
    for (const c of list) {
      const wa = normalizeBdPhone(c.phone), msg = formatBroadcastMsg(c, tpl);
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify({ to: wa, phone: wa, message: msg, body: msg, token }) });
        if (res.ok) { ok++; bcSentIds.add(c.id); if (!db.reminderDates) db.reminderDates = {}; db.reminderDates[c.id] = today(); db.reminderLogs[c.id] = new Date().toLocaleString('bn-BD'); }
        else fail++;
      } catch (e) { fail++; }
    }
    recordBroadcastLog(`${currentBcPreset.toUpperCase()} API`, ok, 'WhatsApp API');
    renderBroadcastRecipients();
    toast(ok ? L(`✅ ${ok} জনকে API দিয়ে পাঠানো হয়েছে!${fail ? ` (${fail} ব্যর্থ)` : ''}`, `✅ Sent to ${ok} via API!${fail ? ` (${fail} failed)` : ''}`) : L('API কল সফল হয়নি! CORS বা Token যাচাই করুন।', 'API call failed! Check CORS or Token.'), ok ? 'success' : 'error');
  });
};
window.copyAllBroadcastMessages = () => {
  const list = getBroadcastAudienceList().filter(c => bcSelectedIds.has(c.id));
  if (!list.length) return toast(L('কোনো কাস্টমার নির্বাচিত নেই!', 'No customer selected!'), 'warn');
  const tpl = $('waBcMessage')?.value || '';
  const txt = list.map(c => `👤 ${c.name} (${c.phone}):\n${formatBroadcastMsg(c, tpl)}`).join('\n\n---\n\n');
  copyText(txt, L(`${list.length} জনের WhatsApp মেসেজ`, `${list.length} WhatsApp messages`));
};

// Individual WhatsApp & Dues
window.sendWhatsAppReminder = custId => {
  const c = db.customers.find(x => x.id === custId); if (!c) return; const wa = normalizeBdPhone(c.phone); if (!wa) return toast(L('মোবাইল নম্বর নেই!', 'No phone number!'), 'error');
  const b = billed(custId), p = paid(custId), dueAmt = money(Math.max(0, b - p)), agName = db.agency?.name || 'Ads হিসাব ম্যানেজার', payInfo = db.agency?.payInfo ? `পেমেন্ট: ${db.agency.payInfo}` : '';
  const msg = (db.agency?.waTemplate || DEFAULT_WA_TEMPLATE).replace(/\{name\}/g, c.name).replace(/\{agency\}/g, agName).replace(/\{bill\}/g, money(b)).replace(/\{paid\}/g, money(p)).replace(/\{due\}/g, dueAmt).replace(/\{payinfo\}/g, payInfo);
  if (!db.reminderDates) db.reminderDates = {};
  db.reminderDates[custId] = today(); db.reminderLogs[custId] = new Date().toLocaleString('bn-BD'); save(); openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`);
};
window.sendLowPrepaidWhatsApp = custId => { const c = db.customers.find(x => x.id === custId); if (!c) return; const wa = normalizeBdPhone(c.phone); if (!wa) return toast(L('মোবাইল নম্বর নেই!', 'No phone number!'), 'error'); openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${c.name}, আপনার অ্যাডভান্স ব্যালেন্স কমে ${money(clientBalance(custId))} হয়েছে। অনুগ্রহ করে রিচার্জ করুন।`)}`); };
window.sendCampaignWhatsApp = workId => { const w = db.works.find(x => x.id === workId); if (!w) return; const c = db.customers.find(x => x.id === w.customerId), wa = normalizeBdPhone(c?.phone); if (!wa) return toast(L('মোবাইল নম্বর নেই!', 'No phone number!'), 'error'); openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${c.name}, আপনার '${w.name}' (${platformMeta(w.platform).label}) ক্যাম্পেইনের ব্যবহৃত ডলার ${usd(w.actualDollar)}, বিল ${money(bill(w))}, স্ট্যাটাস: ${w.status}। ধন্যবাদ!`)}`); };
window.sendRenewOfferWhatsApp = workId => { const w = db.works.find(x => x.id === workId); if (!w) return; const c = db.customers.find(x => x.id === w.customerId), wa = normalizeBdPhone(c?.phone); if (!wa) return toast(L('মোবাইল নম্বর নেই!', 'No phone number!'), 'error'); openExternalUrl(`https://wa.me/${wa}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${c.name}, আপনার '${w.name}' (${platformMeta(w.platform).label}) ক্যাম্পেইনটির মেয়াদ শেষ হয়েছে। ভালো রেজাল্ট ধরে রাখতে চাইলে আরও ৭ দিন রিনিউ করতে পারেন—কত ডলার বাজেট দেবো জানাবেন? ধন্যবাদ - ${db.agency?.name || 'Ads হিসাব ম্যানেজার'}`)}`); };

function getClientDueAging(custId) {
  const cw = db.works.filter(w => w.customerId === custId && bill(w) > 0).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let remPaid = paid(custId), oldestDate = '';
  for (const w of cw) {
    const wb = bill(w);
    if (remPaid >= wb) remPaid -= wb;
    else { oldestDate = w.date || today(); break; }
  }
  if (!oldestDate) oldestDate = cw[0]?.date || today();
  const todayMs = new Date(today() + 'T00:00:00').getTime();
  const oldMs = new Date(oldestDate + 'T00:00:00').getTime();
  const days = Math.max(0, Math.floor((todayMs - oldMs) / 86400000));
  const bucket = days >= 30 ? '30plus' : (days >= 8 ? '8to30' : '0to7');
  return { days, bucket, oldestDate };
}
window.openPromiseModal = custId => {
  const c = db.customers.find(x => x.id === custId); if (!c) return;
  if ($('promiseCustId')) $('promiseCustId').value = custId;
  if ($('promiseCustName')) $('promiseCustName').textContent = `${c.name} — ${L('বকেয়া', 'Due')}: ${money(Math.max(0, -clientBalance(custId)))}`;
  if ($('promiseDateInput')) $('promiseDateInput').value = c.promiseDate || today();
  if ($('promiseNoteInput')) $('promiseNoteInput').value = c.promiseNote || '';
  if ($('promiseModal')) $('promiseModal').style.display = 'flex';
};
window.clearCustomerPromise = () => {
  const cid = $('promiseCustId')?.value, c = db.customers.find(x => x.id === cid);
  if (c) { c.promiseDate = ''; c.promiseNote = ''; c.updatedAt = Date.now(); save(); toast(L('প্রতিশ্রুতি তারিখ মুছে ফেলা হয়েছে', 'Promise date cleared'), 'warn'); }
  closeModal('promiseModal');
};
if ($('promiseForm')) $('promiseForm').onsubmit = e => {
  e.preventDefault();
  const cid = $('promiseCustId')?.value, c = db.customers.find(x => x.id === cid); if (!c) return;
  c.promiseDate = $('promiseDateInput')?.value || '';
  c.promiseNote = $('promiseNoteInput')?.value.trim() || '';
  c.updatedAt = Date.now();
  save(); logActivity(`পেমেন্ট প্রতিশ্রুতি: ${c.name} (${c.promiseDate})`);
  closeModal('promiseModal');
  toast(L(`${c.name}-এর পেমেন্ট প্রতিশ্রুতি ${c.promiseDate} সেভ হয়েছে!`, `Promise date saved for ${c.name}!`));
};

function renderDues() {
  const dq = ($('dueSearch')?.value || '').toLowerCase(), pf = $('prepaidWalletFilter')?.value || 'low', af = $('dueAgingFilter')?.value || 'all', todayS = today();
  const dueRows = db.customers.map(c => ({ customer: c, bill: billed(c.id), paid: paid(c.id), bal: paid(c.id) - billed(c.id), lowLim: c.lowAdvLimit === undefined ? 1000 : num(c.lowAdvLimit) }));
  const onlyDuesAll = dueRows.filter(x => x.bal < 0).map(x => ({ ...x, aging: getClientDueAging(x.customer.id) }));
  const b0 = onlyDuesAll.filter(x => x.aging.bucket === '0to7'), b8 = onlyDuesAll.filter(x => x.aging.bucket === '8to30'), b30 = onlyDuesAll.filter(x => x.aging.bucket === '30plus');
  const pDue = onlyDuesAll.filter(x => x.customer.promiseDate && x.customer.promiseDate <= todayS);
  if ($('dueAgingStrip')) $('dueAgingStrip').innerHTML = `
    <span class="badge-success" style="padding:6px 11px;cursor:pointer" onclick="if($('dueAgingFilter')){$('dueAgingFilter').value='all';renderDues()}">🟢 ${L('০-৭ দিন', '0-7d')}: ${b0.length} (${money(b0.reduce((s, x) => s + (-x.bal), 0))})</span>
    <span class="badge-warn" style="padding:6px 11px;cursor:pointer" onclick="if($('dueAgingFilter')){$('dueAgingFilter').value='8to30';renderDues()}">🟡 ${L('৮-৩০ দিন', '8-30d')}: ${b8.length} (${money(b8.reduce((s, x) => s + (-x.bal), 0))})</span>
    <span class="badge-danger" style="padding:6px 11px;cursor:pointer" onclick="if($('dueAgingFilter')){$('dueAgingFilter').value='30plus';renderDues()}">🔴 ${L('৩০+ দিন ঝুঁকিপূর্ণ', '30+ Days Overdue')}: ${b30.length} (${money(b30.reduce((s, x) => s + (-x.bal), 0))})</span>
    ${pDue.length ? `<span class="badge-admin" style="padding:6px 11px;cursor:pointer" onclick="if($('dueAgingFilter')){$('dueAgingFilter').value='promise';renderDues()}">🤝 ${L('আজ প্রতিশ্রুতি', 'Promise Due')}: ${pDue.length}</span>` : ''}
  `;
  const onlyDues = onlyDuesAll.filter(x => {
    if (dq && !x.customer.name.toLowerCase().includes(dq) && !(x.customer.phone || '').includes(dq)) return false;
    if (af === '30plus') return x.aging.bucket === '30plus';
    if (af === '8to30') return x.aging.bucket === '8to30';
    if (af === 'promise') return Boolean(x.customer.promiseDate);
    return true;
  });
  const lowP = dueRows.filter(x => x.bal > 0 && x.lowLim > 0 && x.bal < x.lowLim);
  const prepaidList = pf === 'all_adv' ? dueRows.filter(x => x.bal > 0).sort((a, b) => a.bal - b.bal) : lowP;
  if ($('dueMetrics')) $('dueMetrics').innerHTML = `<div class="metric-card m4"><small>${L('মোট বকেয়া', 'Total Dues')}</small><strong>${money(onlyDuesAll.reduce((s, x) => s + (-x.bal), 0))}</strong></div><div class="metric-card m3"><small>${L('অ্যাডভান্স জমা', 'Total Advance')}</small><strong>${money(dueRows.filter(x => x.bal > 0).reduce((s, x) => s + x.bal, 0))}</strong></div><div class="metric-card m1"><small>${L('বকেয়া কাস্টমার', 'Due Customers')}</small><strong>${onlyDuesAll.length} ${L('জন', '')}</strong></div>`;
  if ($('dueRows')) $('dueRows').innerHTML = onlyDues.map(x => {
    const cid = x.customer.id, due = -x.bal, sentToday = db.reminderDates?.[cid] === todayS;
    const ageCls = x.aging.bucket === '30plus' ? 'badge-danger' : (x.aging.bucket === '8to30' ? 'badge-warn' : 'badge-success');
    const prD = x.customer.promiseDate || '', prOver = prD && prD <= todayS;
    const prBadge = prD ? `<span class="${prOver ? 'badge-danger' : 'badge-admin'}" style="font-size:10px;display:inline-block;margin-bottom:3px">🤝 ${esc(prD)}${x.customer.promiseNote ? ` (${esc(x.customer.promiseNote)})` : ''}</span><br>` : '';
    return `<tr><td><strong>${esc(x.customer.name)}</strong> ${getClientTrustBadge(cid)}${due > 5000 ? `<span class="badge-danger" style="margin-left:5px">High</span>` : ''}<br><span class="${ageCls}" style="font-size:10px;margin-top:3px">⏳ ${x.aging.days} ${L('দিন', 'd')}</span></td><td>${esc(x.customer.phone || '—')}</td><td>${money(x.bill)}</td><td>${money(x.paid)}</td><td class="bad">${money(due)}</td><td>${prBadge}${sentToday ? `<span class="badge-success">✓ ${L('আজ পাঠানো', 'Sent Today')}</span><br>` : ''}${db.reminderLogs[cid] ? `<span class="good" style="font-size:11px">${esc(db.reminderLogs[cid])}</span>` : (!prD ? `<span class="muted">${L('নেই', 'None')}</span>` : '')}</td><td><button type="button" class="sm perm-pay" style="background:#059669" onclick="quickCollectPayment('${cid}')" title="${L('দ্রুত পেমেন্ট জমা নিন', 'Quick Collect Payment')}">💰 ${L('জমা', 'Pay')}</button><button type="button" class="secondary sm perm-edit" onclick="openPromiseModal('${cid}')" title="${L('প্রতিশ্রুতি তারিখ সেট', 'Set Promise Date')}">🤝</button><button type="button" class="secondary sm" onclick="sendWhatsAppReminder('${cid}')">📲 WhatsApp</button><button type="button" class="secondary sm" onclick="downloadPayCardPng('${cid}')" title="${L('পেমেন্ট কার্ড PNG', 'Pay Card PNG')}">💳</button><button type="button" class="secondary sm" onclick="openInvoice('${cid}')">📄 ${L('ইনভয়েস', 'Invoice')}</button></td></tr>`;
  }).join('') || `<tr><td colspan="7">${L('কোনো বকেয়া নেই 🎉', 'No dues 🎉')}</td></tr>`;
  if ($('lowPrepaidRows')) $('lowPrepaidRows').innerHTML = prepaidList.map(x => {
    const isLow = x.lowLim > 0 && x.bal < x.lowLim;
    return `<tr><td><strong>${esc(x.customer.name)}</strong><br><small class="muted">${L('সতর্কতা সীমা', 'Alert Limit')}: ${money(x.lowLim)}</small></td><td>${esc(x.customer.phone || '—')}</td><td class="${isLow ? 'bad' : 'good'}"><strong>${money(x.bal)}</strong> ${isLow ? `<span class="badge-warn" style="font-size:10px">${L('লো', 'Low')}</span>` : `<span class="badge-success" style="font-size:10px">${L('সচল', 'OK')}</span>`}</td><td><button type="button" class="sm perm-pay" style="background:#059669" onclick="quickCollectPayment('${x.customer.id}')" title="${L('ওয়ালেট টপ-আপ', 'Top-up Wallet')}">💰 ${L('টপ-আপ', 'Top-up')}</button><button type="button" class="warn sm" onclick="sendLowPrepaidWhatsApp('${x.customer.id}')">📲 ${L('রিচার্জ', 'Remind')}</button></td></tr>`;
  }).join('') || `<tr><td colspan="4">${L('নেই ✅', 'None ✅')}</td></tr>`;
  if ($('dashLowPrepaidWrap') && $('dashLowPrepaidList')) { $('dashLowPrepaidWrap').style.display = lowP.length ? 'block' : 'none'; $('dashLowPrepaidList').innerHTML = lowP.slice(0, 4).map(x => `<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:12px;padding:6px 9px;background:var(--soft);border-radius:8px;border:1px solid var(--line)"><span><strong>${esc(x.customer.name)}</strong>: <span class="bad">${money(x.bal)}</span> <small class="muted">(&lt;${money(x.lowLim)})</small></span><span style="display:flex;gap:4px"><button type="button" class="sm perm-pay" style="background:#059669;margin:0" onclick="quickCollectPayment('${x.customer.id}')">💰</button><button type="button" class="warn sm" style="margin:0" onclick="sendLowPrepaidWhatsApp('${x.customer.id}')">📲</button></span></div>`).join(''); }
  if ($('waBcHistoryRows')) $('waBcHistoryRows').innerHTML = (db.broadcastLogs || []).slice(0, 15).map(l => `<tr><td><small>${esc(l.time)}</small></td><td><strong>${esc(l.subject)}</strong></td><td>${num(l.count)} ${L('জন', 'clients')}</td><td><span class="badge-admin">${esc(l.mode)}</span></td></tr>`).join('') || `<tr><td colspan="4">${L('এখনো কোনো ব্রডকাস্ট পাঠানো হয়নি', 'No broadcasts sent yet')}</td></tr>`;
}

// Notifications, Timeline Hub, Platform ROAS Chart & Active Ads
function getNextCardDueInfo(dueDay, refDate) {
  const dd = Math.round(num(dueDay));
  if (dd < 1 || dd > 31) return null;
  const y = refDate.getFullYear(), m = refDate.getMonth();
  const curLast = new Date(y, m + 1, 0).getDate();
  let cand = new Date(y, m, Math.min(dd, curLast)); cand.setHours(0, 0, 0, 0);
  if (cand < refDate) {
    const nxtLast = new Date(y, m + 2, 0).getDate();
    cand = new Date(y, m + 1, Math.min(dd, nxtLast)); cand.setHours(0, 0, 0, 0);
  }
  const diff = Math.ceil((cand - refDate) / 86400000);
  return { diff, dateStr: cand.toISOString().slice(0, 10) };
}
function updateNotifications() {
  const nl = $('notifList'), nc = $('notifCount'); if (!nl || !nc) return;
  const items = [], tD = new Date(); tD.setHours(0, 0, 0, 0);
  const todayS = today(), ym = todayS.slice(0, 7), curLastDay = new Date(tD.getFullYear(), tD.getMonth() + 1, 0).getDate();
  db.works.forEach(w => { if (w.status === 'running' && w.days) { const sD = new Date(w.date), exp = new Date(sD); exp.setDate(sD.getDate() + Number(w.days)); exp.setHours(0, 0, 0, 0); const d = Math.ceil((exp - tD) / 86400000); if (d <= 1 && d >= 0) items.push({ key: `work_${w.id}_soon`, text: L(`⏰ '${w.name}' মেয়াদ শেষ হচ্ছে!`, `⏰ '${w.name}' expires soon!`), tab: 'works' }); else if (d < 0) items.push({ key: `work_${w.id}_exp`, text: L(`⚠️ '${w.name}' মেয়াদ শেষ।`, `⚠️ '${w.name}' expired.`), tab: 'works' }); } });
  db.customers.forEach(c => {
    if (!c.pkgEnd) return;
    const pD = new Date(c.pkgEnd + 'T00:00:00');
    const diff = Math.ceil((pD - tD) / 86400000);
    if (diff <= 3 && diff >= -14) items.push({ key: `pkg_${c.id}_${c.pkgEnd}`, text: diff < 0 ? L(`📦 '${c.name}' প্যাকেজ মেয়াদ (${c.pkgName || 'Package'}) ${Math.abs(diff)} দিন আগে শেষ!`, `📦 '${c.name}' package expired ${Math.abs(diff)}d ago!`) : L(`📦 '${c.name}' প্যাকেজ রিনিউ (${c.pkgEnd}) বাকি ${diff} দিন!`, `📦 '${c.name}' package renewal due in ${diff}d!`), tab: 'customers' });
  });
  const dueFollow = db.customers.filter(c => c.followUpDate && c.followUpDate <= todayS).length;
  if (dueFollow > 0) items.push({ key: `fup_${dueFollow}`, text: L(`📞 আজ ${dueFollow} জন ক্লায়েন্টকে ফলোআপ করতে হবে!`, `📞 ${dueFollow} client follow-ups due today!`), tab: 'dash' });
  const dueTasks = (db.tasks || []).filter(t => !t.done && (!t.dueDate || t.dueDate <= todayS));
  if (dueTasks.length > 0) items.push({ key: `tasks_${dueTasks.length}_${todayS}`, text: L(`✅ আজ ${dueTasks.length}টি মিডিয়া বায়ার টাস্ক বাকি রয়েছে!`, `✅ ${dueTasks.length} media buyer tasks due!`), onClick: 'openTaskBoardModal()' });
  if (hasPerm('canPayments')) {
    const dc = db.customers.filter(c => clientBalance(c.id) < 0).length;
    if (dc > 0) items.push({ key: `due_${dc}`, text: L(`📌 ${dc} জনের কাছে বকেয়া রয়েছে।`, `📌 ${dc} clients have pending dues.`), tab: 'dues' });
    db.customers.filter(c => c.promiseDate && c.promiseDate <= todayS && clientBalance(c.id) < 0).forEach(c => {
      items.push({ key: `prom_${c.id}_${c.promiseDate}`, text: L(`🤝 '${c.name}'-এর পেমেন্ট প্রতিশ্রুতি (${c.promiseDate}) — বকেয়া ${money(-clientBalance(c.id))}`, `🤝 Payment promise due for '${c.name}' (${c.promiseDate}) — ${money(-clientBalance(c.id))}`), tab: 'dues' });
    });
    const lowAdvCount = db.customers.filter(c => { const b = clientBalance(c.id), lim = c.lowAdvLimit === undefined ? 1000 : num(c.lowAdvLimit); return b > 0 && lim > 0 && b < lim; }).length;
    if (lowAdvCount > 0) items.push({ key: `lowadv_${lowAdvCount}`, text: L(`⚠️ ${lowAdvCount} জন ক্লায়েন্টের অ্যাডভান্স ব্যালেন্স সীমার নিচে!`, `⚠️ ${lowAdvCount} clients have low prepaid advance!`), tab: 'dues' });
  }
  if (hasPerm('canExpenses')) {
    (db.recurringBills || []).forEach(b => {
      const isPaid = b.lastPaidYm === ym || db.expenses.some(e => e.approvalStatus !== 'pending' && String(e.date || '').startsWith(ym) && e.recurringId === b.id);
      if (isPaid) return;
      const dueD = Math.min(Math.max(1, num(b.day) || 1), curLastDay), diff = dueD - tD.getDate();
      if (diff <= 3) items.push({ key: `rb_${b.id}_${ym}`, text: diff < 0 ? L(`🧾 '${b.title}' মাসিক বিল ${Math.abs(diff)} দিন ওভারডিউ (${money(b.amount)})!`, `🧾 '${b.title}' bill overdue by ${Math.abs(diff)}d (${money(b.amount)})!`) : (diff === 0 ? L(`🧾 আজ '${b.title}' মাসিক বিল পরিশোধের তারিখ (${money(b.amount)})!`, `🧾 '${b.title}' monthly bill due today (${money(b.amount)})!`) : L(`🧾 '${b.title}' মাসিক বিল আর ${diff} দিন পর (${money(b.amount)})`, `🧾 '${b.title}' bill due in ${diff}d (${money(b.amount)})`)), tab: 'expenses' });
    });
    const eBudgets = db.expenseBudgets && typeof db.expenseBudgets === 'object' ? db.expenseBudgets : {};
    Object.entries(eBudgets).forEach(([cat, lim]) => {
      if (num(lim) <= 0) return;
      const spent = db.expenses.filter(e => e.approvalStatus !== 'pending' && String(e.date || '').startsWith(ym) && e.category === cat).reduce((s, e) => s + num(e.amount), 0);
      if (spent >= num(lim)) items.push({ key: `eb_over_${cat}_${ym}`, text: L(`🚨 '${cat}' মাসিক খরচ বাজেট অতিক্রম করেছে (${money(spent)} / ${money(lim)})!`, `🚨 '${cat}' monthly expense budget exceeded (${money(spent)} / ${money(lim)})!`), tab: 'expenses' });
    });
  }
  if (!isStaff()) {
    db.cards.forEach(c => {
      const st = getCardStats(c.id);
      if (st.inUsd > 0 && st.balance < 20) items.push({ key: `card_${c.id}`, text: L(`💳 '${c.name}' ব্যালেন্স কম (${usd(st.balance)})!`, `💳 '${c.name}' balance low (${usd(st.balance)})!`), tab: 'cards' });
      if (num(c.limitUsd) > 0 && st.outUsd >= num(c.limitUsd) * 0.85) {
        const pct = Math.round((st.outUsd / num(c.limitUsd)) * 100);
        items.push({ key: `card_lim_${c.id}`, text: L(`🚨 '${c.name}' কার্ড লিমিট ${pct}% ব্যবহৃত!`, `🚨 '${c.name}' spend limit ${pct}% used!`), tab: 'cards' });
      }
      if (num(c.passportQuota) > 0 && st.depUsd >= num(c.passportQuota) * 0.85) {
        const pPct = Math.round((st.depUsd / num(c.passportQuota)) * 100);
        items.push({ key: `card_pass_${c.id}`, text: L(`🛂 '${c.name}' পাসপোর্ট কোটা ${pPct}% ব্যবহৃত!`, `🛂 '${c.name}' passport quota ${pPct}% used!`), tab: 'cards' });
      }
      const dInfo = getNextCardDueInfo(c.dueDay, tD);
      if (dInfo && dInfo.diff >= 0 && dInfo.diff <= 3) {
        items.push({ key: `card_due_${c.id}_${dInfo.dateStr}`, text: dInfo.diff === 0 ? L(`📅 '${c.name}' কার্ডের আজ বিলিং তারিখ!`, `📅 '${c.name}' card billing due today!`) : L(`📅 '${c.name}' কার্ডের বিলিং তারিখ আর ${dInfo.diff} দিন পর (${dInfo.dateStr})`, `📅 '${c.name}' billing due in ${dInfo.diff}d (${dInfo.dateStr})`), tab: 'cards' });
      }
    });
    (db.cardRentals || []).forEach(r => {
      const rem = cardRentalRemainingUsd(r);
      if (rem < 0) items.push({ key: `crent_over_${r.id}`, text: L(`🚨 '${r.userName}' কার্ড বরাদ্দের চেয়ে ${usd(-rem)} বেশি খরচ করেছে!`, `🚨 '${r.userName}' overspent card allocation by ${usd(-rem)}!`), tab: 'cards' });
      else if (rem > 0 && rem <= 10 && num(r.spentUsd) > 0) items.push({ key: `crent_low_${r.id}`, text: L(`⏳ '${r.userName}'-এর কার্ড কোটায় আর মাত্র ${usd(rem)} বাকি আছে!`, `⏳ '${r.userName}' only has ${usd(rem)} left on card allocation!`), tab: 'cards' });
    });
    (db.adAccounts || []).forEach(a => {
      if (a.status && a.status !== 'Active') items.push({ key: `aa_stat_${a.id}_${a.status}`, text: L(`🛡️ অ্যাড অ্যাকাউন্ট '${a.name}' (${a.platform || 'Meta'}): ${a.status}`, `🛡️ Ad Account '${a.name}' (${a.platform || 'Meta'}): ${a.status}`), tab: 'pixelGen' });
      const bInfo = getNextCardDueInfo(a.billingDay, tD);
      if (bInfo && bInfo.diff >= 0 && bInfo.diff <= 3) items.push({ key: `aa_bill_${a.id}_${bInfo.dateStr}`, text: bInfo.diff === 0 ? L(`📅 আজ '${a.name}' অ্যাড অ্যাকাউন্টের বিলিং তারিখ!`, `📅 Today is '${a.name}' billing day!`) : L(`📅 '${a.name}' অ্যাড অ্যাকাউন্ট বিলিং আর ${bInfo.diff} দিন পর`, `📅 '${a.name}' billing in ${bInfo.diff}d`), tab: 'pixelGen' });
    });
    const lastBkp = localStorage.getItem(LAST_BACKUP_KEY), bkpFreq = Math.max(1, num(db.agency?.backupFreqDays) || 1), bkpDiff = lastBkp ? Math.floor((new Date(todayS) - new Date(lastBkp)) / 86400000) : 99;
    if ((db.customers.length || db.works.length) && bkpDiff >= bkpFreq) {
      items.push({ key: `bkp_due_${todayS}`, text: L(`💾 ${lastBkp ? `${bkpDiff} দিন ধরে ব্যাকআপ নেওয়া হয়নি` : 'এখনো ব্যাকআপ নেওয়া হয়নি'} — আজ ব্যাকআপ নিন!`, `💾 Backup overdue (${bkpDiff}d) — export JSON backup today!`), tab: 'reports' });
    }
    (db.graphicsOrders || []).forEach(g => {
      if (g.status === 'Delivered') return;
      if (g.deadline && g.deadline <= todayS) items.push({ key: `gfx_due_${g.id}_${g.deadline}`, text: L(`🎨 '${g.title}' গ্রাফিক্স ডেলিভারি ডেডলাইন (${g.deadline})!`, `🎨 Graphics '${g.title}' due (${g.deadline})!`), tab: 'graphicsHub' });
      else if (g.status === 'Revision') items.push({ key: `gfx_rev_${g.id}`, text: L(`🟠 '${g.title}' গ্রাফিক্স রিভিশন পেন্ডিং রয়েছে!`, `🟠 Graphics '${g.title}' awaits revision!`), tab: 'graphicsHub' });
    });
    if (isAdminOrSuper()) {
      if (isSuperAdmin()) {
        const pSubs = readSubscriptionRequests().filter(r => r.status === 'pending');
        if ($('subReqPendingBadge')) { $('subReqPendingBadge').style.display = pSubs.length ? 'inline-block' : 'none'; $('subReqPendingBadge').textContent = pSubs.length; }
        pSubs.slice(0, 8).forEach(r => {
          items.push({
            key: `subreq_${r.id}`,
            text: L(
              `💎 সাবস্ক্রিপশন রিকোয়েস্ট: ${r.name} (@${r.username}) — ${r.planLabel || r.planKey} (৳${num(r.price)})${r.trxId ? ` · Trx: ${r.trxId}` : ''}`,
              `💎 Subscription Request: ${r.name} (@${r.username}) — ${r.planLabel || r.planKey} (৳${num(r.price)})`
            ),
            tab: 'adminPanel',
            subTab: 'users'
          });
        });
      }
      const oh = readHelpRequests().filter(h => h.status === 'open' && (isSuperAdmin() || h.target !== 'Super Admin')).length;
      if (oh > 0) items.push({ key: `help_${oh}`, text: L(`📩 ${oh} টি নতুন হেল্প মেসেজ!`, `📩 ${oh} new help requests!`), tab: 'adminPanel', subTab: 'help' });
      if (portalOrders.length > 0) items.push({ key: `po_${portalOrders.length}`, text: L(`🛒 পোর্টাল থেকে ${portalOrders.length}টি নতুন অর্ডার এসেছে!`, `🛒 ${portalOrders.length} new orders from Client Portal!`), tab: 'adminPanel', subTab: 'help' });
      if (portalPayments.length > 0) items.push({ key: `pp_${portalPayments.length}`, text: L(`💳 পোর্টাল থেকে ${portalPayments.length}টি পেমেন্ট ক্লেইম এসেছে!`, `💳 ${portalPayments.length} new payment claims from Client Portal!`), tab: 'adminPanel', subTab: 'help' });
    }
  }
  const todayCal = (db.contentCalendar || []).filter(c => c.date === todayS && c.status !== 'published');
  if (todayCal.length > 0) {
    items.push({ key: `cal_due_${todayS}_${todayCal.length}`, text: L(`📅 আজ ${todayCal.length}টি কনটেন্ট/পোস্ট শিডিউল রয়েছে!`, `📅 ${todayCal.length} content items scheduled today!`), onClick: 'openContentCalendarModal()' });
  }
  const me = typeof getCurrentActor === 'function' ? getCurrentActor().username : '';
  if (me && Array.isArray(communityState?.notifications)) {
    const existingSubIds = new Set(items.filter(x => x.key.startsWith('subreq_')).map(x => x.key.slice(7)));
    communityState.notifications.filter(n => n.toUsername === me && !n.read).slice(0, 8).forEach(n => {
      if (n.kind === 'subscription_request' && existingSubIds.has(n.postId)) return;
      const fn = esc(n.fromUsername || '').replace(/'/g, "\\'"), fnm = esc(n.fromName || '').replace(/'/g, "\\'");
      items.push({
        key: `comm_${n.id}`,
        text: n.text || '🔔 কমিউনিটি আপডেট',
        onClick: n.kind === 'subscription_request'
          ? `goToSection('adminPanel');switchAdminSubTab('users')`
          : (n.kind === 'dm' ? `openDmModal('${fn}','${fnm}')` : `goToSection('newsFeed')`)
      });
    });
  }
  const st = readNotifState(), vis = items.filter(i => !st.dismissed.includes(i.key)); currentNotifKeys = vis.map(i => i.key);
  const unread = vis.filter(i => !st.seen.includes(i.key)).length; nc.style.display = unread > 0 ? 'flex' : 'none'; if (unread > 0) nc.textContent = unread;
  nl.innerHTML = vis.length ? vis.map(i => `<div class="notif-item" style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px" onclick="${i.onClick ? i.onClick : `goToSection('${i.tab}');${i.subTab ? `switchAdminSubTab('${i.subTab}');` : ''}`};$('notifBox').style.display='none'"><span>${esc(i.text)}</span><button type="button" class="secondary sm" style="padding:1px 6px;margin:0;flex-shrink:0" onclick="dismissNotif(event,'${esc(i.key)}')">✕</button></div>`).join('') : `<div class="notif-item">${L('কোনো নতুন বিজ্ঞপ্তি নেই', 'No new notifications')}</div>`;
}

function renderActionTimeline() {
  const host = $('dashTimelineRows'), badge = $('dashTimelineBadge'); if (!host) return;
  const tD = new Date(); tD.setHours(0, 0, 0, 0);
  const todayS = today(), ym = todayS.slice(0, 7), curLastDay = new Date(tD.getFullYear(), tD.getMonth() + 1, 0).getDate(), items = [];
  db.works.filter(w => (w.status || 'running') === 'running' && w.days).forEach(w => {
    const sD = new Date(w.date), exp = new Date(sD); exp.setDate(sD.getDate() + num(w.days)); exp.setHours(0, 0, 0, 0);
    const diff = Math.ceil((exp - tD) / 86400000);
    if (diff <= 3 && diff >= -7) {
      items.push({
        prio: diff <= 0 ? 1 : 2, cls: diff <= 0 ? 'urg-high' : 'urg-med',
        title: `${platformBadge(w.platform)} <strong>${esc(w.name)}</strong>`,
        sub: `${esc(cname(w.customerId))} · ${diff < 0 ? L(`${Math.abs(diff)} দিন আগে শেষ`, `Expired ${Math.abs(diff)}d ago`) : (diff === 0 ? L('আজই মেয়াদ শেষ', 'Expires today') : L(`${diff} দিন বাকি`, `${diff}d remaining`))}`,
        actions: `<button type="button" class="secondary sm perm-edit" onclick="renewWork('${w.id}')">🔄</button><button type="button" class="secondary sm" onclick="sendRenewOfferWhatsApp('${w.id}')">📲</button>`
      });
    }
  });
  (db.tasks || []).filter(t => !t.done && (!t.dueDate || t.dueDate <= todayS)).forEach(t => {
    const over = t.dueDate && t.dueDate < todayS;
    items.push({
      prio: (t.priority === 'High' || over) ? 1 : 2, cls: (t.priority === 'High' || over) ? 'urg-high' : 'urg-med',
      title: `✅ ${L('টাস্ক', 'Task')}: <strong>${esc(t.title)}</strong>`,
      sub: `${t.customerId ? esc(cname(t.customerId)) + ' · ' : ''}${t.assignee ? esc(t.assignee) + ' · ' : ''}${esc(t.dueDate || todayS)}${over ? ` (${L('ওভারডিউ', 'Overdue')})` : ''}`,
      actions: `<button type="button" class="sm" style="background:#059669" onclick="toggleTaskDone('${t.id}')">✓</button><button type="button" class="secondary sm" onclick="openTaskBoardModal()">📋</button>`
    });
  });
  if (!isStaff()) {
    db.cards.forEach(c => {
      const dInfo = getNextCardDueInfo(c.dueDay, tD);
      if (dInfo && dInfo.diff >= 0 && dInfo.diff <= 3) {
        items.push({
          prio: dInfo.diff === 0 ? 1 : 2, cls: dInfo.diff === 0 ? 'urg-high' : 'urg-med',
          title: `💳 ${L('কার্ড বিলিং', 'Card Billing')}: <strong>${esc(c.name)}</strong>`,
          sub: `${dInfo.diff === 0 ? L('আজই বিলিং তারিখ', 'Billing due today') : L(`${dInfo.diff} দিন পর`, `In ${dInfo.diff}d`)} (${dInfo.dateStr})`,
          actions: `<button type="button" class="secondary sm" onclick="goToSection('cards')">💳</button>`
        });
      }
    });
  }
  if (hasPerm('canExpenses')) {
    (db.recurringBills || []).forEach(b => {
      const isPaid = b.lastPaidYm === ym || db.expenses.some(e => e.approvalStatus !== 'pending' && String(e.date || '').startsWith(ym) && e.recurringId === b.id);
      if (isPaid) return;
      const dueD = Math.min(Math.max(1, num(b.day) || 1), curLastDay), diff = dueD - tD.getDate();
      if (diff <= 3) {
        items.push({
          prio: diff <= 0 ? 1 : 2, cls: diff <= 0 ? 'urg-high' : 'urg-med',
          title: `🧾 ${L('মাসিক বিল', 'Monthly Bill')}: <strong>${esc(b.title)}</strong>`,
          sub: `${money(b.amount)} · ${diff < 0 ? L(`${Math.abs(diff)} দিন ওভারডিউ`, `${Math.abs(diff)}d overdue`) : (diff === 0 ? L('আজই তারিখ', 'Due today') : L(`${diff} দিন পর`, `In ${diff}d`))}`,
          actions: `<button type="button" class="sm perm-exp" style="background:#059669" onclick="payRecurringBill('${b.id}')">💸 ${L('পে', 'Pay')}</button>`
        });
      }
    });
  }
  db.customers.filter(c => c.pkgEnd).forEach(c => {
    const pD = new Date(c.pkgEnd + 'T00:00:00'), diff = Math.ceil((pD - tD) / 86400000);
    if (diff <= 3 && diff >= -14) {
      items.push({
        prio: diff <= 0 ? 1 : 2, cls: diff <= 0 ? 'urg-high' : 'urg-med',
        title: `📦 ${L('প্যাকেজ রিনিউ', 'Pkg Renewal')}: <strong>${esc(c.name)}</strong>`,
        sub: `${esc(c.pkgName || L('মাসিক প্যাকেজ', 'Monthly Package'))} · ${diff < 0 ? L(`${Math.abs(diff)} দিন আগে শেষ`, `Expired ${Math.abs(diff)}d ago`) : (diff === 0 ? L('আজই মেয়াদ শেষ', 'Expires today') : L(`${diff} দিন বাকি`, `${diff}d left`))}`,
        actions: `<button type="button" class="secondary sm perm-edit" onclick="renewCustomerPackage('${c.id}')">🔄 Renew</button><button type="button" class="secondary sm" onclick="sendPkgRenewWhatsApp('${c.id}')">📲</button>`
      });
    }
  });
  db.customers.filter(c => c.promiseDate && c.promiseDate <= todayS && clientBalance(c.id) < 0).forEach(c => {
    items.push({
      prio: 1, cls: 'urg-high',
      title: `🤝 ${L('পেমেন্ট প্রতিশ্রুতি', 'Payment Promise')}: <strong>${esc(c.name)}</strong>`,
      sub: `${L('বকেয়া', 'Due')}: ${money(-clientBalance(c.id))} · ${esc(c.promiseDate)}`,
      actions: `<button type="button" class="sm perm-pay" style="background:#059669" onclick="quickCollectPayment('${c.id}')">💰</button><button type="button" class="secondary sm" onclick="sendWhatsAppReminder('${c.id}')">📲</button>`
    });
  });
  db.customers.filter(c => c.followUpDate && c.followUpDate <= todayS).forEach(c => {
    items.push({
      prio: c.followUpDate < todayS ? 1 : 2, cls: c.followUpDate < todayS ? 'urg-high' : 'urg-med',
      title: `📞 ${L('ফলোআপ', 'Follow-up')}: <strong>${esc(c.name)}</strong>`,
      sub: `${esc(c.stage || 'Inquiry')} · ${esc(c.followUpDate)}`,
      actions: `<button type="button" class="secondary sm" onclick="openMsgTemplates('${c.id}')">💬</button><button type="button" class="sm" style="background:#059669" onclick="clearFollowUp('${c.id}')">✓</button>`
    });
  });
  db.customers.filter(c => num(c.retainer) > 0 && !db.works.some(w => w.customerId === c.id && w.retainerYm === ym)).forEach(c => {
    items.push({
      prio: 3, cls: 'urg-ret',
      title: `📅 ${L('মাসিক রিটেইনার', 'Monthly Retainer')}: <strong>${esc(c.name)}</strong>`,
      sub: `${ym} · ${money(c.retainer)}`,
      actions: `<button type="button" class="sm perm-edit" onclick="generateSingleRetainer('${c.id}')">+ ${L('বিল', 'Bill')}</button>`
    });
  });
  items.sort((a, b) => a.prio - b.prio);
  if (badge) { badge.textContent = items.length ? `${items.length} ${L('টি বাকি', 'due')}` : '✓ 0'; badge.className = items.length ? 'badge-warn' : 'badge-success'; }
  host.innerHTML = items.slice(0, 14).map(it => `<div class="timeline-item ${it.cls}"><div class="tl-info"><div>${it.title}</div><small class="muted">${it.sub}</small></div><div style="display:flex;gap:4px;flex-shrink:0">${it.actions}</div></div>`).join('') || `<div class="muted" style="padding:14px;text-align:center">${L('আজ কোনো জরুরি করণীয় বাকি নেই 🎉', 'All caught up for today 🎉')}</div>`;
}

function renderPlatformComparisonChart(fW) {
  const host = $('platformComparisonChart'); if (!host || isStaff()) return;
  const rows = AD_PLATFORMS.map(plat => {
    const list = (fW || []).filter(w => (AD_PLATFORMS.includes(w.platform) ? w.platform : 'Meta') === plat);
    const pUsd = list.reduce((s, w) => s + num(w.actualDollar), 0), pBill = list.reduce((s, w) => s + bill(w), 0), pProf = list.reduce((s, w) => s + profit(w), 0), pRev = list.reduce((s, w) => s + num(w.revenue), 0);
    const roas = (pRev > 0 && pBill > 0) ? (pRev / pBill).toFixed(2) + 'x' : '—';
    return { plat, count: list.length, usd: pUsd, bill: pBill, prof: pProf, roas };
  });
  const maxVal = Math.max(1, ...rows.flatMap(r => [r.bill, Math.max(0, r.prof)]));
  host.innerHTML = rows.map(r => {
    const bPct = r.bill > 0 ? Math.max(4, Math.round((r.bill / maxVal) * 100)) : 0;
    const pPct = r.prof > 0 ? Math.max(4, Math.round((r.prof / maxVal) * 100)) : 0;
    return `<div class="plat-comp-row"><div class="plat-comp-top"><span>${platformBadge(r.plat)} <small class="muted">(${r.count} · ${usd(r.usd)})</small></span><span><small class="muted">${L('বিল', 'Bill')}: ${money(r.bill)} · ${L('লাভ', 'Profit')}: <strong class="${r.prof >= 0 ? 'good' : 'bad'}">${money(r.prof)}</strong></small> <span class="badge-admin" style="margin-left:4px">ROAS: ${r.roas}</span></span></div><div class="plat-comp-bars"><div class="plat-comp-track" title="${L('বিল', 'Bill')}: ${money(r.bill)}"><div class="plat-comp-fill" style="width:${bPct}%;background:#3157e8"></div></div><div class="plat-comp-track" title="${L('লাভ', 'Profit')}: ${money(r.prof)}"><div class="plat-comp-fill" style="width:${pPct}%;background:${r.prof >= 0 ? '#10b981' : '#dc2626'}"></div></div></div></div>`;
  }).join('');
}

function renderActiveCampaignsMonitor() {
  const host = $('dashActiveWorksRows'), expHost = $('dashExpiredWorksRows'), fupHost = $('dashFollowUpRows'), tD = new Date(); tD.setHours(0, 0, 0, 0);
  if (host) host.innerHTML = db.works.filter(w => (w.status || 'running') === 'running').map(w => {
    const sD = new Date(w.date), exp = new Date(sD); exp.setDate(sD.getDate() + Math.max(1, num(w.days))); exp.setHours(0, 0, 0, 0);
    const diff = Math.ceil((exp - tD) / 86400000), daily = num(w.days) > 0 ? (num(w.dollar) / num(w.days)) : num(w.dollar);
    const badge = diff < 0 ? `<span class="badge-danger">${L(`মেয়াদ শেষ (${Math.abs(diff)} দিন আগে)`, `Expired (${Math.abs(diff)}d ago)`)}</span>` : (diff <= 1 ? `<span class="badge-status status-running">${L('আজ/কাল শেষ', 'Ends Today/Tmrw')}</span>` : `<span class="badge-success">${diff} ${L('দিন বাকি', 'days left')}</span>`);
    return `<tr><td><strong>${esc(cname(w.customerId))}</strong> ${platformBadge(w.platform)}<br><small class="muted">${esc(pname(w.pageId))}</small></td><td>${esc(w.name)}</td><td>${usd(w.dollar)} / <strong>${usd(w.actualDollar)}</strong>${progressBarHtml(num(w.actualDollar), num(w.dollar))}</td><td>${usd(daily)}/${L('দিন', 'day')}</td><td>${badge}</td><td><button type="button" class="secondary sm perm-edit" onclick="quickAddSpend('${w.id}')">+$</button><button type="button" class="secondary sm perm-edit" onclick="renewWork('${w.id}')">🔄</button><button type="button" class="secondary sm" onclick="openMsgTemplates('${w.customerId}','${w.id}')">💬</button></td></tr>`;
  }).join('') || `<tr><td colspan="6">${L('কোনো চলমান ক্যাম্পেইন নেই', 'No active campaigns')}</td></tr>`;

  if (expHost) {
    const expired = db.works.filter(w => {
      if (!w.date || !w.days) return false;
      const sD = new Date(w.date), exp = new Date(sD); exp.setDate(sD.getDate() + num(w.days)); exp.setHours(0, 0, 0, 0);
      const diff = Math.ceil((exp - tD) / 86400000);
      return diff <= 0 && diff >= -14;
    }).sort(byDateDesc).slice(0, 8);
    expHost.innerHTML = expired.map(w => {
      const sD = new Date(w.date), exp = new Date(sD); exp.setDate(sD.getDate() + num(w.days));
      return `<tr><td><strong>${esc(cname(w.customerId))}</strong> ${platformBadge(w.platform)}<br><small class="muted">${esc(w.name)}</small></td><td><span class="badge-warn">${exp.toISOString().slice(0, 10)}</span></td><td><button type="button" class="secondary sm" onclick="sendRenewOfferWhatsApp('${w.id}')">📲 ${L('রিনিউ অফার', 'Offer')}</button><button type="button" class="secondary sm perm-edit" onclick="renewWork('${w.id}')">🔄 Renew</button></td></tr>`;
    }).join('') || `<tr><td colspan="3">${L('সম্প্রতি মেয়াদ শেষ হওয়া কাজ নেই', 'No recently expired campaigns')}</td></tr>`;
  }

  if (fupHost) {
    const todayS = today(), fups = db.customers.filter(c => c.followUpDate && c.followUpDate <= todayS).sort((a, b) => String(a.followUpDate).localeCompare(String(b.followUpDate)));
    fupHost.innerHTML = fups.map(c => `<tr><td><strong>${esc(c.name)}</strong><br><small class="muted">${esc(c.phone || '')}</small></td><td><span class="badge-admin">${esc(c.stage || 'Inquiry')}</span><br><small class="${c.followUpDate < todayS ? 'bad' : 'good'}">${esc(c.followUpDate)}</small></td><td><button type="button" class="secondary sm" onclick="openMsgTemplates('${c.id}')">💬</button><button type="button" class="sm" style="background:#059669" onclick="clearFollowUp('${c.id}')">✓ Done</button></td></tr>`).join('') || `<tr><td colspan="3">${L('আজ কোনো ফলোআপ বাকি নেই 🎉', 'No follow-ups due today 🎉')}</td></tr>`;
  }
}

function renderMonthlyChart() {
  if (isStaff()) return; const host = $('monthlyChart'), labelsHost = $('monthlyChartLabels'); if (!host || !labelsHost) return;
  const bnM = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
  const enM = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mArr = isEn() ? enM : bnM, now = new Date(), buckets = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); buckets.push({ ym: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: mArr[d.getMonth()] + "'" + String(d.getFullYear()).slice(-2), bill: 0, spend: 0, profit: 0 }); }
  db.works.forEach(w => { const b = buckets.find(x => x.ym === String(w.date || '').slice(0, 7)); if (b) { b.bill += bill(w); b.spend += actual(w) + num(w.other); } });
  db.expenses.filter(e => e.approvalStatus !== 'pending').forEach(e => { const b = buckets.find(x => x.ym === String(e.date || '').slice(0, 7)); if (b) b.spend += num(e.amount); });
  db.payments.filter(p => p.approvalStatus !== 'pending').forEach(p => { const b = buckets.find(x => x.ym === String(p.date || '').slice(0, 7)); if (b) b.spend += num(p.fee); });
  buckets.forEach(b => { b.profit = Math.max(0, b.bill - b.spend); }); const max = Math.max(1, ...buckets.flatMap(b => [b.bill, b.spend, b.profit]));
  host.innerHTML = buckets.map(b => `<div style="flex:1;display:flex;align-items:flex-end;justify-content:center;gap:3px;height:100%" title="${b.label}: ${L('বিল', 'Bill')} ${money(b.bill)} | ${L('লাভ', 'Profit')} ${money(b.bill - b.spend)}"><div style="width:26%;height:${Math.max(4, b.bill / max * 100)}%;background:#2563eb;border-radius:4px 4px 0 0"></div><div style="width:26%;height:${Math.max(4, b.spend / max * 100)}%;background:#7c3aed;border-radius:4px 4px 0 0"></div><div style="width:26%;height:${Math.max(4, b.profit / max * 100)}%;background:#10b981;border-radius:4px 4px 0 0"></div></div>`).join('');
  labelsHost.innerHTML = buckets.map(b => `<span style="flex:1;text-align:center">${b.label}</span>`).join('');
}
function renderTopClients() {
  const host = $('topClientsList'); if (!host) return; const mode = (!isStaff() && $('topClientMode')?.value === 'profit') ? 'profit' : 'bill';
  const list = db.customers.map(c => ({ name: c.name, total: mode === 'profit' ? db.works.filter(w => w.customerId === c.id).reduce((s, w) => s + profit(w), 0) : billed(c.id) })).filter(x => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 5);
  const topMax = Math.max(1, list[0]?.total || 1);
  host.innerHTML = list.map((c, i) => `<div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px"><span><strong>#${i + 1} ${esc(c.name)}</strong></span><strong style="color:${mode === 'profit' ? '#059669' : 'var(--brand)'}">${money(c.total)}</strong></div><div style="height:6px;background:var(--soft);border-radius:99px;overflow:hidden"><div style="height:100%;width:${(c.total / topMax * 100).toFixed(0)}%;background:${mode === 'profit' ? '#10b981' : 'linear-gradient(90deg,#3157e8,#7046e8)'};border-radius:99px"></div></div></div>`).join('') || `<div class="muted">${L('কোনো ডেটা নেই', 'No client data yet')}</div>`;
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
  if ($('repWorkRows')) $('repWorkRows').innerHTML = fW.map(w => `<tr><td>${esc(w.date)}</td><td><strong>${esc(cname(w.customerId))}</strong><br><small class="muted">${esc(pname(w.pageId))}</small></td><td>${platformBadge(w.platform)} ${esc(w.name)}</td><td>${money(bill(w))}</td>${isStaff() ? '' : `<td>${money(actual(w))}</td><td class="${profit(w) >= 0 ? 'good' : 'bad'}">${money(profit(w))}</td>`}</tr>`).join('') || `<tr><td colspan="${isStaff() ? 4 : 6}">${L('এই সময়ে কোনো কাজ নেই', 'No campaigns in this period')}</td></tr>`;
}
if ($('applyRepDates')) $('applyRepDates').onclick = renderMonthlyReport;
if ($('clearRepDates')) $('clearRepDates').onclick = () => { $('repFrom').value = today().slice(0, 8) + '01'; $('repTo').value = today(); renderMonthlyReport(); };
const AUTO_SNAP_KEY = 'ads_hisab_auto_snaps_v81';
function readAutoSnapshots() { try { const r = JSON.parse(localStorage.getItem(AUTO_SNAP_KEY) || '[]'); return Array.isArray(r) ? r : []; } catch (e) { return []; } }
function writeAutoSnapshots(list) { try { localStorage.setItem(AUTO_SNAP_KEY, JSON.stringify(list)); } catch (e) { if (list.length > 1) { try { localStorage.setItem(AUTO_SNAP_KEY, JSON.stringify(list.slice(0, 1))); } catch (e2) {} } } }
window.captureAutoLocalSnapshot = (manual = false) => {
  if (!db.customers.length && !db.works.length && !db.cards.length) {
    if (manual) toast(L('সেভ করার মতো কোনো ডেটা নেই!', 'No data to snapshot yet!'), 'warn');
    return;
  }
  const todayS = today(), list = readAutoSnapshots();
  if (!manual && list[0]?.date === todayS) return;
  const payloadStr = JSON.stringify(db);
  const snap = {
    id: uid(), date: todayS, time: new Date().toLocaleString('bn-BD'),
    counts: `${db.customers.length}c · ${db.works.length}w · ${db.cards.length}card`,
    sizeKb: Math.max(1, Math.round(payloadStr.length / 1024)),
    data: db
  };
  const next = manual ? [snap, ...list].slice(0, 4) : [snap, ...list.filter(s => s.date !== todayS)].slice(0, 4);
  writeAutoSnapshots(next);
  if (manual) { renderBackupHub(); toast(L('লোকাল রিকভারি স্ন্যাপশট সেভ হয়েছে!', 'Recovery snapshot saved!')); }
};
function maybeCaptureDailySnapshot() { try { captureAutoLocalSnapshot(false); } catch (e) {} }
window.downloadAutoSnapshot = idx => {
  const s = readAutoSnapshots()[idx]; if (!s?.data) return;
  downloadBlob(JSON.stringify(s.data, null, 2), `ads_hisab_snapshot_${s.date}.json`, 'application/json');
  localStorage.setItem(LAST_BACKUP_KEY, today()); checkBackupReminder(); toast(L('স্ন্যাপশট ডাউনলোড হয়েছে!', 'Snapshot downloaded!'));
};
window.restoreAutoSnapshot = async idx => {
  const s = readAutoSnapshots()[idx]; if (!s?.data) return;
  if (!(await askConfirm(L(`${s.time}-এর স্ন্যাপশট থেকে ডেটা রিস্টোর করবেন?`, `Restore data from snapshot (${s.time})?`)))) return;
  db = normalizeDb(s.data); save(); applyAgencyBranding(); toast(L('স্ন্যাপশট থেকে রিস্টোর হয়েছে!', 'Restored from snapshot!'));
};
window.saveBackupSettings = () => {
  const freq = Math.max(1, num($('backupFreqSelect')?.value) || 1);
  if (!db.agency) db.agency = blank().agency;
  db.agency.backupFreqDays = freq;
  save(); toast(L(`ব্যাকআপ রিমাইন্ডার প্রতি ${freq} দিন পর সেট হয়েছে!`, `Backup reminder set to every ${freq} day(s)!`));
};
function renderBackupHub() {
  const freq = Math.max(1, num(db.agency?.backupFreqDays) || 1);
  if ($('backupFreqSelect')) $('backupFreqSelect').value = String([1, 3, 7].includes(freq) ? freq : 1);
  const last = localStorage.getItem(LAST_BACKUP_KEY), diff = last ? Math.floor((new Date(today()) - new Date(last)) / 86400000) : 99;
  if ($('lastBackupStatusBadge')) {
    $('lastBackupStatusBadge').className = diff >= freq ? 'badge-danger' : 'badge-success';
    $('lastBackupStatusBadge').textContent = last ? (diff === 0 ? L('✓ আজ ব্যাকআপ নেওয়া হয়েছে', '✓ Backed up today') : L(`শেষ ব্যাকআপ: ${diff} দিন আগে (${last})`, `Last: ${diff}d ago (${last})`)) : L('⚠️ কখনো JSON ব্যাকআপ নেওয়া হয়নি', '⚠️ Never backed up');
  }
  const snaps = readAutoSnapshots();
  if ($('autoSnapshotRows')) $('autoSnapshotRows').innerHTML = snaps.map((s, i) => `<tr><td><strong>${esc(s.date)}</strong><br><small class="muted">${esc(s.time)}</small></td><td>${esc(s.counts)}</td><td>${num(s.sizeKb)} KB</td><td><button type="button" class="secondary sm" onclick="downloadAutoSnapshot(${i})">📥 JSON</button><button type="button" class="warn sm" onclick="restoreAutoSnapshot(${i})">♻️ ${L('রিস্টোর', 'Restore')}</button></td></tr>`).join('') || `<tr><td colspan="4">${L('প্রথম কাজ/কাস্টমার সেভ করলে অটো স্ন্যাপশট তৈরি হবে', 'Auto snapshots appear after your first save')}</td></tr>`;
}
function checkBackupReminder() {
  const bar = $('backupReminderBar'); if (!bar) return;
  if (isStaff() || (!db.customers.length && !db.works.length)) { bar.style.display = 'none'; return; }
  const freq = Math.max(1, num(db.agency?.backupFreqDays) || 1);
  const last = localStorage.getItem(LAST_BACKUP_KEY), diff = last ? Math.floor((new Date(today()) - new Date(last)) / 86400000) : 99;
  if ($('backupReminderText')) {
    $('backupReminderText').innerHTML = last
      ? `⚠️ <strong>${L('ডেটা সুরক্ষা', 'Data Safety')}:</strong> ${L(`শেষ ব্যাকআপ নেওয়া হয়েছিল ${diff} দিন আগে (${last})।`, `Last backup was ${diff} day(s) ago (${last}).`)}`
      : `⚠️ <strong>${L('ডেটা সুরক্ষা', 'Data Safety')}:</strong> ${L('এখনো JSON ব্যাকআপ নেওয়া হয়নি — এখনই ফোনে/পিসিতে সেভ রাখুন!', 'No JSON backup exported yet — save a copy now!')}`;
  }
  bar.style.display = (diff >= freq && !sessionStorage.getItem('backup_dismissed_v72')) ? 'flex' : 'none';
}
window.saveStaffTargetSettings = () => {
  if (!db.agency) db.agency = blank().agency;
  db.agency.staffProfitTarget = Math.max(0, num($('staffProfitTargetInput')?.value));
  db.agency.staffBonusPct = Math.max(0, Math.min(50, num($('staffBonusPctInput')?.value)));
  save(); toast(L('স্টাফ লক্ষ্যমাত্রা ও বোনাস হার সেভ হয়েছে!', 'Staff target & bonus saved!'));
};
function renderAdAccountHealthAndCalendar() {
  const accs = db.adAccounts || [], cards = db.cards || [], cc = id => cards.find(x => x.id === id)?.name || '—';
  const activeCnt = accs.filter(a => (a.status || 'Active') === 'Active').length;
  const issueCnt = accs.filter(a => ['Payment Hold', 'Restricted', 'Disabled'].includes(a.status)).length;
  const totUnpaid = accs.reduce((s, a) => s + num(a.unpaid), 0), totDaily = accs.reduce((s, a) => s + num(a.dailyLimit), 0);
  if ($('adAccountHealthMetrics')) $('adAccountHealthMetrics').innerHTML = `
    <div class="metric-card m3" style="padding:13px"><small>${L('সচল অ্যাড অ্যাকাউন্ট', 'Active Ad Accounts')}</small><strong>${activeCnt} / ${accs.length}</strong></div>
    <div class="metric-card m4" style="padding:13px"><small>${L('হোল্ড / রিস্ট্রিক্টেড / ডিজেবল', 'Hold / Restricted / Disabled')}</small><strong>${issueCnt}</strong></div>
    <div class="metric-card m2" style="padding:13px"><small>${L('মোট Unpaid ব্যালেন্স', 'Total Unpaid Balance')}</small><strong>${usd(totUnpaid)}</strong></div>
    <div class="metric-card m1" style="padding:13px"><small>${L('মোট ডেইলি স্পেন্ড লিমিট', 'Combined Daily Limit')}</small><strong>${usd(totDaily)}</strong></div>
  `;
  const host = $('adAccountCalendarGrid'); if (!host) return;
  const tD = new Date(); tD.setHours(0, 0, 0, 0);
  const events = [];
  cards.forEach(c => {
    const dInfo = getNextCardDueInfo(c.dueDay, tD);
    if (dInfo) events.push({ sortDiff: dInfo.diff, title: `💳 ${c.name}`, sub: `${L('কার্ড বিল ডেট', 'Card Billing')}: ${dInfo.dateStr}`, badge: dInfo.diff === 0 ? L('আজ বিল!', 'Due Today!') : `${dInfo.diff} ${L('দিন বাকি', 'd left')}`, cls: dInfo.diff <= 3 ? 'badge-danger' : 'badge-admin' });
  });
  accs.forEach(a => {
    const bInfo = getNextCardDueInfo(a.billingDay, tD);
    if (bInfo) events.push({ sortDiff: bInfo.diff, title: `${platformMeta(a.platform).icon} ${a.name}`, sub: `${L('কার্ড', 'Card')}: ${cc(a.cardId)} · ${L('বিলিং', 'Bill')}: ${bInfo.dateStr}`, badge: bInfo.diff === 0 ? L('আজ চেক!', 'Due Today!') : `${bInfo.diff} ${L('দিন বাকি', 'd left')}`, cls: bInfo.diff <= 3 ? 'badge-warn' : 'badge-admin' });
    if (num(a.threshold) > 0 && num(a.unpaid) >= num(a.threshold) * 0.8) {
      events.push({ sortDiff: 0, title: `⚡ ${a.name}`, sub: `Unpaid ${usd(a.unpaid)} / ${usd(a.threshold)} (${cc(a.cardId)})`, badge: L('থ্রেশহোল্ড সতর্কতা', 'Near Threshold'), cls: 'badge-danger' });
    }
    if (a.status && a.status !== 'Active') {
      events.push({ sortDiff: -1, title: `🚨 ${a.name}`, sub: `${a.platform || 'Meta'} · ${cc(a.cardId)}`, badge: a.status, cls: 'badge-danger' });
    }
  });
  events.sort((a, b) => a.sortDiff - b.sortDiff);
  host.innerHTML = events.slice(0, 12).map(ev => `<div class="closing-box"><div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px"><strong style="font-size:12.5px">${esc(ev.title)}</strong><span class="${ev.cls}" style="font-size:10px">${esc(ev.badge)}</span></div><small class="muted">${esc(ev.sub)}</small></div>`).join('') || `<div class="muted" style="grid-column:1 / -1">${L('ক্যালেন্ডারে দেখানোর মতো কোনো বিল ডেট বা অ্যালার্ট নেই — কার্ড বা অ্যাড অ্যাকাউন্টে বিলিং তারিখ (১-৩১) যোগ করুন।', 'No billing dates or alerts scheduled — add billing days (1-31) to cards or ad accounts.')}</div>`;
}
function renderPager(hId, cur, tot, fn) { const h = $(hId); if (!h) return; const tp = Math.max(1, Math.ceil(tot / PAGE_SIZE)); if (tot <= PAGE_SIZE) { h.innerHTML = ''; return; } h.innerHTML = `<span>${L('মোট', 'Total')} ${tot} · ${L('পৃষ্ঠা', 'Page')} ${cur} / ${tp}</span><div><button type="button" class="secondary sm" ${cur <= 1 ? 'disabled' : ''} onclick="${fn}(${cur - 1})">◀ ${L('আগের', 'Prev')}</button><button type="button" class="secondary sm" ${cur >= tp ? 'disabled' : ''} onclick="${fn}(${cur + 1})">${L('পরের', 'Next')} ▶</button></div>`; }
window.setCustPage = p => { custPage = p; render(); }; window.setWorkPage = p => { workPage = p; render(); }; window.setPayPage = p => { payPage = p; render(); };

// P&L Accounting Pack, Calculators, Task Board & Nightly Owner Brief
function computePnlStats(from = '', to = '') {
  const fW = db.works.filter(w => inDateRange(w.date, from, to));
  const fP = db.payments.filter(p => p.approvalStatus !== 'pending' && inDateRange(p.date, from, to));
  const fE = db.expenses.filter(e => e.approvalStatus !== 'pending' && inDateRange(e.date, from, to));
  const fD = db.cardDeposits.filter(d => inDateRange(d.date, from, to));
  const fT = db.trades.filter(t => inDateRange(t.date, from, to));
  const fWT = (db.walletTransfers || []).filter(wt => inDateRange(wt.date, from, to));
  const grossDollarBill = fW.reduce((s, w) => s + baseBill(w), 0);
  const serviceFees = fW.reduce((s, w) => s + workServiceCharge(w), 0);
  const discounts = fW.reduce((s, w) => s + num(w.discount), 0);
  const clientTax = fW.reduce((s, w) => s + workTaxAmount(w), 0);
  const totalBill = fW.reduce((s, w) => s + bill(w), 0);
  const collected = fP.reduce((s, p) => s + num(p.amount), 0);
  const adBaseCost = fW.reduce((s, w) => s + baseActual(w), 0);
  const cardFeeCost = fW.reduce((s, w) => s + feeCost(w), 0);
  const otherWorkCost = fW.reduce((s, w) => s + num(w.other), 0);
  const bankFxFees = fD.reduce((s, d) => s + num(d.bankFeeTk), 0);
  const officeExp = fE.reduce((s, e) => s + num(e.amount), 0);
  const gatewayFees = fP.reduce((s, p) => s + num(p.fee), 0);
  const transferFees = fWT.reduce((s, wt) => s + num(wt.fee), 0);
  const tradeProf = fT.reduce((s, t) => s + tradeProfit(t), 0);
  const cardRentProf = (db.cardRentals || []).filter(r => inDateRange(r.date, from, to)).reduce((s, r) => s + cardRentalProfit(r), 0);
  const staffComm = fW.reduce((s, w) => s + workCommission(w), 0);
  const totalExpense = adBaseCost + cardFeeCost + otherWorkCost + officeExp + gatewayFees + transferFees;
  const netProfit = totalBill + tradeProf + cardRentProf - totalExpense;
  const margin = totalBill > 0 ? (netProfit / totalBill) * 100 : 0;
  const spentUsd = fW.reduce((s, w) => s + num(w.actualDollar), 0);
  const refundedUsd = fW.reduce((s, w) => s + num(w.refundedUsd), 0);
  return {
    campaigns: fW.length, spentUsd, refundedUsd, grossDollarBill, serviceFees, discounts, clientTax, totalBill, collected,
    adBaseCost, cardFeeCost, otherWorkCost, bankFxFees, officeExp, gatewayFees, transferFees, tradeProf, cardRentProf, staffComm,
    totalExpense, netProfit, margin
  };
}
window.renderPnlSummary = () => {
  if (isStaff() || !$('pnlSummaryGrid')) return;
  const s = computePnlStats($('pnlFrom')?.value || '', $('pnlTo')?.value || '');
  $('pnlSummaryGrid').innerHTML = `
    <div class="closing-box"><small>${L('গ্রস ডলার বিলিং', 'Gross Ad Billing')} (${usd(s.spentUsd)})</small><strong>${money(s.grossDollarBill)}</strong></div>
    <div class="closing-box"><small>${L('সার্ভিস চার্জ / ছাড়', 'Service Fees / Disc')}</small><strong>+${money(s.serviceFees)} <span class="bad">-${money(s.discounts)}</span></strong></div>
    <div class="closing-box"><small>${L('ক্লায়েন্ট ভ্যাট/ট্যাক্স', 'Client VAT/Tax')}</small><strong>${money(s.clientTax)}</strong></div>
    <div class="closing-box"><small>${L('সর্বমোট বিলিং', 'Total Billing')}</small><strong style="color:var(--brand)">${money(s.totalBill)}</strong></div>
    <div class="closing-box"><small>${L('প্রকৃত এড + কার্ড ভ্যাট খরচ', 'Ad + Card VAT Cost')}</small><strong class="bad">${money(s.adBaseCost + s.cardFeeCost)}</strong></div>
    <div class="closing-box"><small>${L('অফিস, গেটওয়ে ও ওয়ালেট ফি', 'Office + Gateway + Tx Fee')}</small><strong class="bad">${money(s.officeExp + s.gatewayFees + s.transferFees + s.otherWorkCost)}</strong></div>
    <div class="closing-box"><small>${L('ব্যাংক FX চার্জ (ডিপোজিট)', 'Bank FX Fees (Deposit)')}</small><strong>${money(s.bankFxFees)}</strong></div>
    <div class="closing-box"><small>${L('ট্রেডিং ও কার্ড লেন্ডিং লাভ / কমিশন', 'Trade & Lending Profit / Comm')}</small><strong>+${money(s.tradeProf + s.cardRentProf)} <small class="muted">/ ${money(s.staffComm)}</small></strong></div>
    <div class="closing-box"><small>${L('নিট লাভ', 'Net Profit')} (${s.margin.toFixed(1)}%)</small><strong class="${s.netProfit >= 0 ? 'good' : 'bad'}">${money(s.netProfit)}</strong></div>
  `;
};
window.exportPnlCsv = () => {
  if (isStaff()) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  const from = $('pnlFrom')?.value || '', to = $('pnlTo')?.value || '', s = computePnlStats(from, to);
  const rows = [
    ['P&L Accounting Statement', from || 'Start', to || today()],
    ['Metric', 'Amount (BDT / USD)'],
    ['Campaigns Count', s.campaigns],
    ['Total Ad Spend (USD)', s.spentUsd.toFixed(2)],
    ['Campaign Refunds Credited (USD)', s.refundedUsd.toFixed(2)],
    ['Gross Dollar Billing (BDT)', s.grossDollarBill.toFixed(2)],
    ['Service Charges (BDT)', s.serviceFees.toFixed(2)],
    ['Discounts Given (BDT)', s.discounts.toFixed(2)],
    ['Client VAT / Tax (BDT)', s.clientTax.toFixed(2)],
    ['Total Net Billing (BDT)', s.totalBill.toFixed(2)],
    ['Total Payments Collected (BDT)', s.collected.toFixed(2)],
    ['Ad Media Base Cost (BDT)', s.adBaseCost.toFixed(2)],
    ['Card VAT / Fee Cost (BDT)', s.cardFeeCost.toFixed(2)],
    ['Other Campaign Cost (BDT)', s.otherWorkCost.toFixed(2)],
    ['Bank Deposit FX Fees (Info, BDT)', s.bankFxFees.toFixed(2)],
    ['Office Expenses (BDT)', s.officeExp.toFixed(2)],
    ['Payment Gateway Fees (BDT)', s.gatewayFees.toFixed(2)],
    ['Wallet Transfer Fees (BDT)', s.transferFees.toFixed(2)],
    ['USD Trading Profit (BDT)', s.tradeProf.toFixed(2)],
    ['Staff Commissions Earned (BDT)', s.staffComm.toFixed(2)],
    ['Total Operating Expense (BDT)', s.totalExpense.toFixed(2)],
    ['Final Net Profit (BDT)', s.netProfit.toFixed(2)],
    ['Profit Margin (%)', s.margin.toFixed(2) + '%']
  ];
  downloadBlob('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), `pnl_statement_${from || 'all'}_${to || today()}.csv`, 'text/csv;charset=utf-8;');
  toast(L('P&L স্টেটমেন্ট CSV ডাউনলোড হয়েছে!', 'P&L statement CSV downloaded!'));
};
window.sendOwnerNightlyBrief = async () => {
  if (isStaff()) return toast(L('শুধু এডমিন/ওনার ব্যবহার করতে পারবেন!', 'Admin/Owner only!'), 'error');
  const todayS = today(), s = computePnlStats(todayS, todayS);
  const allDue = db.customers.reduce((sum, c) => sum + Math.max(0, -clientBalance(c.id)), 0);
  const openTasks = (db.tasks || []).filter(t => !t.done && (!t.dueDate || t.dueDate <= todayS)).length;
  const brief = `🌙 *${db.agency?.name || 'Ads হিসাব ম্যানেজার'} — নাইটলি ওনার ব্রিফ (${todayS})*\n\n` +
    `⚡ আজকের কাজ: ${s.campaigns}টি (${usd(s.spentUsd)})\n` +
    `🧾 আজকের বিল: ${money(s.totalBill)}\n` +
    `💰 আজকের আদায়: ${money(s.collected)}\n` +
    `💳 এড খরচ: ${money(s.adBaseCost + s.cardFeeCost + s.otherWorkCost)}\n` +
    `💸 অফিস ও ফি খরচ: ${money(s.officeExp + s.gatewayFees + s.transferFees)}\n` +
    `📈 *আজকের নিট লাভ: ${money(s.netProfit)}*\n\n` +
    `📌 মোট ক্লায়েন্ট বকেয়া: ${money(allDue)}\n` +
    `✅ পেন্ডিং টাস্ক: ${openTasks}টি | 🛒 পোর্টাল অর্ডার: ${portalOrders.length}টি | 💳 পোর্টাল পেমেন্ট: ${portalPayments.length}টি`;
  copyText(brief, L('নাইটলি ওনার ব্রিফ', 'Owner Nightly Brief'));
  const wa = normalizeBdPhone(db.agency?.phone);
  if (await askConfirm(L('ব্রিফটি কপি হয়েছে! WhatsApp-এ শেয়ার করবেন?', 'Brief copied! Open WhatsApp to send?'), 'WhatsApp শেয়ার')) {
    openExternalUrl(wa.length >= 11 ? `https://wa.me/${wa}?text=${encodeURIComponent(brief)}` : `https://wa.me/?text=${encodeURIComponent(brief)}`);
  }
};

// Break-Even ROAS & Ad Budget Calculator (Feature 10)
let lastRoasCalc = null;
window.openRoasCalcModal = () => {
  if (!$('roasCalcModal')) return;
  if ($('rcUsdRate') && !num($('rcUsdRate').value)) $('rcUsdRate').value = rateFor(today()) || num(db.agency?.defaultRate) || 125;
  calcBreakEvenRoas();
  $('roasCalcModal').style.display = 'flex';
};
window.calcBreakEvenRoas = () => {
  const host = $('roasCalcOutput'); if (!host) return;
  const sell = num($('rcSellPrice')?.value), prod = num($('rcProdCost')?.value), deliv = num($('rcDelivCost')?.value);
  const rate = Math.max(1, num($('rcUsdRate')?.value) || 125), targetP = Math.max(0, num($('rcTargetProfit')?.value));
  const margin = sell - prod - deliv;
  if (sell <= 0 || margin <= 0) {
    lastRoasCalc = null;
    host.innerHTML = `<div class="closing-box" style="grid-column:1/-1"><small>${L('সতর্কতা', 'Warning')}</small><strong class="bad">${L('বিক্রয়মূল্য (৳) উৎপাদন ও ডেলিভারি খরচের চেয়ে বেশি হতে হবে!', 'Selling price must exceed product + delivery cost!')}</strong></div>`;
    return;
  }
  const beRoas = sell / margin, targetRoas = beRoas * 1.5, maxCpaTk = margin, maxCpaUsd = margin / rate;
  const estCpaTk = margin * 0.5, reqOrders = targetP > 0 ? Math.ceil(targetP / estCpaTk) : 0;
  const dailyBudgetTk = reqOrders * estCpaTk, dailyBudgetUsd = dailyBudgetTk / rate;
  lastRoasCalc = { sell, prod, deliv, margin, beRoas, targetRoas, maxCpaTk, maxCpaUsd, reqOrders, dailyBudgetTk, dailyBudgetUsd, rate, targetP };
  host.innerHTML = `
    <div class="closing-box"><small>${L('ইউনিট গ্রস প্রফিট', 'Profit / Order')}</small><strong class="good">${money(margin)}</strong></div>
    <div class="closing-box"><small>Break-Even ROAS</small><strong style="color:var(--brand)">${beRoas.toFixed(2)}x</strong></div>
    <div class="closing-box"><small>${L('টার্গেট ROAS (সেফ)', 'Target ROAS (1.5x)')}</small><strong class="good">${targetRoas.toFixed(2)}x</strong></div>
    <div class="closing-box"><small>${L('সর্বোচ্চ CPA লিমিট', 'Max Break-Even CPA')}</small><strong>${money(maxCpaTk)} (${usd(maxCpaUsd)})</strong></div>
    <div class="closing-box" style="grid-column:1/-1"><small>${L(`দৈনিক ${money(targetP)} নিট লাভে আনুমানিক বাজেট (CPA ~${money(estCpaTk)})`, `Est. Daily Budget for ${money(targetP)} Profit`)}</small><strong>${reqOrders} ${L('অর্ডার', 'orders')} · ${usd(dailyBudgetUsd)} (${money(dailyBudgetTk)}) / ${L('দিন', 'day')}</strong></div>
  `;
};
window.copyRoasSummary = () => {
  if (!lastRoasCalc) return toast(L('প্রথমে সঠিক হিসাব করুন!', 'Calculate valid ROAS first!'), 'warn');
  const r = lastRoasCalc;
  copyText(`🧮 *ROAS & Ad Budget Plan*\nবিক্রয়মূল্য: ${money(r.sell)} | মার্জিন: ${money(r.margin)}/অর্ডার\nBreak-Even ROAS: ${r.beRoas.toFixed(2)}x\nTarget Profitable ROAS: ${r.targetRoas.toFixed(2)}x\nসর্বোচ্চ CPA: ${money(r.maxCpaTk)} (${usd(r.maxCpaUsd)})\nদৈনিক ${money(r.targetP)} নিট লাভের জন্য প্রস্তাবিত বাজেট: ${usd(r.dailyBudgetUsd)}/দিন (${r.reqOrders} অর্ডার)`, 'ROAS সামারি');
};
window.applyRoasBudgetToQuote = () => {
  if (!lastRoasCalc || lastRoasCalc.dailyBudgetUsd <= 0) return toast(L('প্রথমে প্রফিট লক্ষ্য দিয়ে বাজেট হিসাব করুন!', 'Calculate a valid budget first!'), 'warn');
  const r = lastRoasCalc;
  closeModal('roasCalcModal'); goToSection('quotations');
  if ($('qtTitle')) $('qtTitle').value = `ROAS Ad Campaign (Break-Even ${r.beRoas.toFixed(2)}x, Target ${r.targetRoas.toFixed(2)}x)`;
  if ($('qtDollar')) $('qtDollar').value = Math.max(1, +(r.dailyBudgetUsd * 7).toFixed(2));
  if ($('qtRate')) { delete $('qtRate').dataset.manualEdit; $('qtRate').value = r.rate; }
  if ($('qtDays')) $('qtDays').value = 7;
  updateQuotePreview();
  toast(L('৭ দিনের প্রস্তাবিত বাজেট কোটেশন ফর্মে বসানো হয়েছে!', '7-day recommended budget loaded into Quotation!'));
};

// Quick USD <-> BDT + Profit-Target Rate Calculator (Feature 11)
let lastCalcSellRate = 125, lastCalcUsd = 100;
window.switchUsdCalcMode = mode => {
  const isProf = mode === 'profit';
  if ($('ucConvPanel')) $('ucConvPanel').style.display = isProf ? 'none' : 'block';
  if ($('ucProfitPanel')) $('ucProfitPanel').style.display = isProf ? 'block' : 'none';
  if ($('ucModeConvBtn')) $('ucModeConvBtn').className = isProf ? 'secondary sm' : 'sm';
  if ($('ucModeProfitBtn')) $('ucModeProfitBtn').className = isProf ? 'sm' : 'secondary sm';
  if (isProf) calcTargetSellRate(); else calcUsdFromDollar();
};
window.calcTargetSellRate = () => {
  const buyR = Math.max(1, num($('ucBuyRate')?.value) || 121);
  const vatP = Math.max(0, num($('ucBuyVat')?.value));
  const usdAmt = Math.max(1, num($('ucProfitUsd')?.value) || 100);
  const mode = $('ucTargetMode')?.value || 'per_usd';
  const tVal = Math.max(0, num($('ucTargetVal')?.value));
  const landed = buyR * (1 + vatP / 100);
  const sellRate = mode === 'margin_pct'
    ? (tVal >= 95 ? landed * 2 : landed / Math.max(0.05, 1 - tVal / 100))
    : (landed + tVal);
  const totalCost = landed * usdAmt, totalBill = sellRate * usdAmt, netP = totalBill - totalCost;
  const marginPct = totalBill > 0 ? ((netP / totalBill) * 100).toFixed(1) : '0.0';
  lastCalcSellRate = Number(sellRate.toFixed(2)); lastCalcUsd = usdAmt;
  if ($('ucProfitOutput')) $('ucProfitOutput').innerHTML = `
    ${L('VAT সহ প্রকৃত খরচ (প্রতি $)', 'Landed Cost ($)')}: <strong>৳${landed.toFixed(2)}</strong><br>
    ${L('প্রস্তাবিত ক্লায়েন্ট রেট', 'Suggested Sell Rate')}: <strong style="color:var(--brand);font-size:15px">৳${sellRate.toFixed(2)} / $</strong><br>
    ${L('মোট বিল', 'Total Quote')}: <strong>${money(totalBill)}</strong> · ${L('খরচ', 'Cost')}: ${money(totalCost)}<br>
    <div style="border-top:1px solid var(--line);margin-top:6px;padding-top:6px">
      ${L('প্রত্যাশিত নিট লাভ', 'Expected Net Profit')}: <strong class="good">${money(netP)}</strong> (${marginPct}% ${L('মার্জিন', 'margin')})
    </div>
  `;
};
window.applyTargetRateTo = target => {
  calcTargetSellRate();
  closeModal('usdCalcModal');
  if (target === 'quote') {
    goToSection('quotations');
    if ($('qtDollar')) $('qtDollar').value = lastCalcUsd;
    if ($('qtRate')) $('qtRate').value = lastCalcSellRate;
    updateQuotePreview();
    toast(L(`৳${lastCalcSellRate} রেটে কোটেশন ফর্মে বসানো হয়েছে!`, `Applied rate ৳${lastCalcSellRate} to Quotation!`));
  } else {
    goToSection('works');
    if ($('wDollar')) $('wDollar').value = lastCalcUsd;
    if ($('wRate')) { $('wRate').value = lastCalcSellRate; $('wRate').dataset.manualEdit = '1'; }
    updateWorkPreview();
    toast(L(`৳${lastCalcSellRate} রেটে কাজের ফর্মে বসানো হয়েছে!`, `Applied rate ৳${lastCalcSellRate} to Work Form!`));
  }
};
window.openUsdCalcModal = () => {
  if (!$('usdCalcModal')) return;
  if ($('ucRate')) $('ucRate').value = rateFor(today()) || num(db.agency?.defaultRate) || 125;
  if ($('ucBuyVat')) $('ucBuyVat').value = num(db.agency?.defaultFeePct) || 0;
  switchUsdCalcMode('conv');
  $('usdCalcModal').style.display = 'flex';
};
window.calcUsdFromDollar = () => {
  const u = num($('ucUsd')?.value), r = Math.max(0, num($('ucRate')?.value)), fp = Math.max(0, num($('ucFeePct')?.value)), svc = Math.max(0, num($('ucSvc')?.value));
  const base = u * r, vat = base * (fp / 100), tot = base + vat + svc;
  if ($('ucBdt')) $('ucBdt').value = tot ? tot.toFixed(2) : '0';
  if ($('usdCalcOutput')) $('usdCalcOutput').innerHTML = `<strong>${usd(u)}</strong> × ৳${r.toFixed(2)} = <strong>${money(base)}</strong><br>${fp > 0 ? `+ VAT/ফি (${fp}%): <strong class="bad">${money(vat)}</strong><br>` : ''}${svc > 0 ? `+ সার্ভিস চার্জ: <strong>${money(svc)}</strong><br>` : ''}<div style="border-top:1px solid var(--line);margin-top:6px;padding-top:6px;font-size:15px">সর্বমোট: <strong style="color:var(--brand)">${money(tot)}</strong></div>`;
};
window.calcUsdFromBdt = () => {
  const tot = Math.max(0, num($('ucBdt')?.value)), r = Math.max(0.01, num($('ucRate')?.value) || 125), fp = Math.max(0, num($('ucFeePct')?.value)), svc = Math.max(0, num($('ucSvc')?.value));
  const netAfterSvc = Math.max(0, tot - svc), base = netAfterSvc / (1 + fp / 100), u = base / r, vat = netAfterSvc - base;
  if ($('ucUsd')) $('ucUsd').value = u.toFixed(2);
  if ($('usdCalcOutput')) $('usdCalcOutput').innerHTML = `মোট টাকা: <strong>${money(tot)}</strong> ${svc > 0 ? `(সার্ভিস -${money(svc)})` : ''}<br>${fp > 0 ? `VAT (${fp}%): <strong>${money(vat)}</strong> · মূল: <strong>${money(base)}</strong><br>` : ''}<div style="border-top:1px solid var(--line);margin-top:6px;padding-top:6px;font-size:15px">ডলার পরিমাণ: <strong style="color:var(--brand)">${usd(u)}</strong> (@ ৳${r.toFixed(2)})</div>`;
};

// Media Buyer Daily Task Board (Feature 12)
let taskPriorityFilter = 'all';
window.setTaskPriorityFilter = p => {
  taskPriorityFilter = ['all', 'High', 'Medium', 'Low'].includes(p) ? p : 'all';
  renderTaskBoard();
};
window.cycleTaskPriority = id => {
  const t = (db.tasks || []).find(x => x.id === id); if (!t) return;
  const order = ['Low', 'Medium', 'High'];
  const cur = order.indexOf(t.priority || 'Medium');
  t.priority = order[(cur + 1) % order.length];
  t.updatedAt = Date.now();
  save(); renderTaskBoard();
  toast(L(`অগ্রাধিকার আপডেট: ${t.priority}`, `Priority updated: ${t.priority}`));
};
window.openTaskBoardModal = () => {
  if (!$('taskBoardModal')) return;
  refresh();
  if ($('tkDueDate') && !$('tkDueDate').value) $('tkDueDate').value = today();
  renderTaskBoard();
  $('taskBoardModal').style.display = 'flex';
};
window.renderTaskBoard = () => {
  const host = $('taskBoardRows'), badge = $('tkStatsBadge'); if (!host) return;
  const f = $('tkFilter')?.value || 'pending', todayS = today(), pRank = { High: 1, Medium: 2, Low: 3 };
  const all = db.tasks || [], pendCnt = all.filter(t => !t.done).length;
  if (badge) badge.textContent = `${pendCnt} ${L('টি বাকি', 'pending')} / ${all.length} ${L('মোট', 'total')}`;

  const statusFiltered = all.filter(t => f === 'all' ? true : (f === 'done' ? Boolean(t.done) : !t.done));
  const counts = { all: statusFiltered.length, High: 0, Medium: 0, Low: 0 };
  statusFiltered.forEach(t => {
    const p = t.priority === 'High' || t.priority === 'Low' ? t.priority : 'Medium';
    counts[p]++;
  });
  if ($('tkCntAll')) $('tkCntAll').textContent = counts.all;
  if ($('tkCntHigh')) $('tkCntHigh').textContent = counts.High;
  if ($('tkCntMed')) $('tkCntMed').textContent = counts.Medium;
  if ($('tkCntLow')) $('tkCntLow').textContent = counts.Low;
  document.querySelectorAll('#tkPriorityFilterGroup button[data-prio]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.prio === taskPriorityFilter);
  });

  const filtered = statusFiltered.filter(t => {
    if (taskPriorityFilter === 'all') return true;
    const p = t.priority === 'High' || t.priority === 'Low' ? t.priority : 'Medium';
    return p === taskPriorityFilter;
  }).sort((a, b) => {
    if (Boolean(a.done) !== Boolean(b.done)) return a.done ? 1 : -1;
    const pr = (pRank[a.priority] || 2) - (pRank[b.priority] || 2);
    return pr !== 0 ? pr : String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'));
  });
  host.innerHTML = filtered.map(t => {
    const over = !t.done && t.dueDate && t.dueDate < todayS;
    const prio = t.priority === 'High' || t.priority === 'Low' ? t.priority : 'Medium';
    const prioCls = prio === 'High' ? 'prio-high' : (prio === 'Low' ? 'prio-low' : 'prio-medium');
    const pTitle = L('ক্লিক করে Priority পরিবর্তন করুন', 'Click to cycle priority');
    const pBadge = prio === 'High'
      ? `<span class="badge-danger prio-toggle-badge" title="${esc(pTitle)}" onclick="cycleTaskPriority('${t.id}')">🔴 High</span>`
      : (prio === 'Low'
        ? `<span class="badge-success prio-toggle-badge" title="${esc(pTitle)}" onclick="cycleTaskPriority('${t.id}')">🟢 Low</span>`
        : `<span class="badge-warn prio-toggle-badge" title="${esc(pTitle)}" onclick="cycleTaskPriority('${t.id}')">🟡 Medium</span>`);
    return `<div class="task-card ${prioCls} ${t.done ? 'done' : ''}">
      <div style="display:flex;align-items:flex-start;gap:10px;min-width:0">
        <input type="checkbox" class="row-chk" ${t.done ? 'checked' : ''} onchange="toggleTaskDone('${t.id}')" style="margin-top:3px">
        <div style="min-width:0">
          <div style="font-weight:700;font-size:13px;${t.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(t.title)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;font-size:11px;align-items:center">${pBadge}${t.customerId ? `<span class="badge-admin">👤 ${esc(cname(t.customerId))}</span>` : ''}${t.assignee ? `<span class="muted">🧑‍💻 ${esc(t.assignee)}</span>` : ''}${t.dueDate ? `<span class="${over ? 'bad' : 'muted'}">📅 ${esc(t.dueDate)}${over ? ` (${L('ওভারডিউ', 'Overdue')})` : ''}</span>` : ''}</div>
        </div>
      </div>
      <button type="button" class="danger sm perm-del" style="margin:0;flex-shrink:0" onclick="deleteTask('${t.id}')">✕</button>
    </div>`;
  }).join('') || `<div class="muted" style="padding:18px;text-align:center">${L('কোনো টাস্ক নেই 🎉', 'No tasks in this view 🎉')}</div>`;
};
window.toggleTaskDone = id => {
  const t = (db.tasks || []).find(x => x.id === id); if (!t) return;
  t.done = !t.done; t.updatedAt = Date.now();
  save(); renderTaskBoard();
  toast(t.done ? L('✅ টাস্ক সম্পন্ন হয়েছে!', '✅ Task marked done!') : L('টাস্ক আবার পেন্ডিং করা হয়েছে', 'Task reopened'));
};
window.deleteTask = async id => {
  if (!hasPerm('canDelete') || !(await askConfirm(L('টাস্কটি মুছবেন?', 'Delete this task?')))) return;
  markDeleted(id); db.tasks = (db.tasks || []).filter(x => x.id !== id);
  save(); renderTaskBoard(); toast(L('মুছে ফেলা হয়েছে', 'Deleted'), 'warn');
};
if ($('taskForm')) $('taskForm').onsubmit = e => {
  e.preventDefault();
  const title = $('tkTitle')?.value.trim(); if (!title) return;
  if (!Array.isArray(db.tasks)) db.tasks = [];
  db.tasks.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), title, customerId: $('tkCustomer')?.value || '', assignee: $('tkAssignee')?.value || '', dueDate: $('tkDueDate')?.value || today(), priority: $('tkPriority')?.value || 'Medium', done: false });
  save(); logActivity(`নতুন টাস্ক: ${title}`);
  e.target.reset(); if ($('tkDueDate')) $('tkDueDate').value = today(); if ($('tkPriority')) $('tkPriority').value = 'Medium';
  renderTaskBoard(); toast(L('টাস্ক যোগ হয়েছে!', 'Task added!'));
};

// Main Render
function render() {
  refresh(); renderCards(); renderTrades(); renderQuotations(); renderPackages(); renderRateSlabs(); renderRecurringBills(); renderWalletTransfers(); renderWinBackRows(); updateNotifications(); renderMonthlyChart(); renderTopClients(); renderActiveCampaignsMonitor(); renderGraphicsOrders(); updateStorageMeter();

  const todayS = today(), tW = db.works.filter(w => w.date === todayS), tE = db.expenses.filter(e => e.approvalStatus !== 'pending' && e.date === todayS).reduce((s, e) => s + num(e.amount), 0), tPF = db.payments.filter(p => p.approvalStatus !== 'pending' && p.date === todayS).reduce((s, p) => s + num(p.fee), 0), tWtF = (db.walletTransfers || []).filter(wt => wt.date === todayS).reduce((s, wt) => s + num(wt.fee), 0);
  const tB = tW.reduce((s, w) => s + bill(w), 0), tS = tW.reduce((s, w) => s + actual(w) + num(w.other), 0);
  if ($('mTodayBill')) $('mTodayBill').textContent = money(tB);
  if (!isStaff()) { if ($('mTodaySpend')) $('mTodaySpend').textContent = money(tS); if ($('mTodayProfit')) $('mTodayProfit').textContent = money(tB - tS - tE - tPF - tWtF); }
  if ($('dashCurrentRatePill')) $('dashCurrentRatePill').textContent = `💵 ${L('আজকের রেট', "Today's Rate")}: ৳${rateFor(todayS) || num(db.agency?.defaultRate) || 125}`;

  const fW = db.works.filter(w => inDateRange(w.date, dashFilterFrom, dashFilterTo)), fP = db.payments.filter(p => p.approvalStatus !== 'pending' && inDateRange(p.date, dashFilterFrom, dashFilterTo)), fE = db.expenses.filter(e => e.approvalStatus !== 'pending' && inDateRange(e.date, dashFilterFrom, dashFilterTo)), fWT = (db.walletTransfers || []).filter(wt => inDateRange(wt.date, dashFilterFrom, dashFilterTo));
  const totalBill = fW.reduce((s, w) => s + bill(w), 0), totalPaid = fP.reduce((s, p) => s + num(p.amount), 0), isF = Boolean(dashFilterFrom || dashFilterTo);
  const allDue = isF ? Math.max(0, totalBill - totalPaid) : db.customers.reduce((s, c) => s + Math.max(0, -clientBalance(c.id)), 0), allAdv = isF ? Math.max(0, totalPaid - totalBill) : db.customers.reduce((s, c) => s + Math.max(0, clientBalance(c.id)), 0);
  if ($('mBill')) $('mBill').textContent = money(totalBill); if ($('mTotalPaid')) $('mTotalPaid').textContent = money(totalPaid);
  if ($('mAdvanceNote')) $('mAdvanceNote').textContent = allAdv > 0 ? `${L('অ্যাডভান্স', 'Advance')}: ${money(allAdv)}` : ''; if ($('mDue')) $('mDue').textContent = money(allDue);

  // Multi-Platform Dashboard Cards
  if ($('dashPlatformGrid')) {
    $('dashPlatformGrid').innerHTML = AD_PLATFORMS.map(plat => {
      const pW = fW.filter(w => (AD_PLATFORMS.includes(w.platform) ? w.platform : 'Meta') === plat);
      const pUsd = pW.reduce((s, w) => s + num(w.actualDollar), 0), pBill = pW.reduce((s, w) => s + bill(w), 0), pProf = pW.reduce((s, w) => s + profit(w), 0);
      return `<div class="plat-card" onclick="goToSection('works');if($('workPlatformFilter')){$('workPlatformFilter').value='${plat}';workPage=1;render()}"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">${platformBadge(plat)}<small class="muted">${pW.length} ${L('ক্যাম্পেইন', 'campaigns')}</small></div><strong>${usd(pUsd)}</strong><div class="plat-meta">${L('বিল', 'Bill')}: ${money(pBill)}${isStaff() ? '' : `<br>${L('লাভ', 'Profit')}: <span class="${pProf >= 0 ? 'good' : 'bad'} priv-blur">${money(pProf)}</span>`}</div></div>`;
    }).join('');
  }
  renderPlatformComparisonChart(fW);
  renderActionTimeline();

  if (!isStaff()) {
    const ad = fW.reduce((s, w) => s + actual(w), 0), oc = fW.reduce((s, w) => s + num(w.other), 0), oe = fE.reduce((s, e) => s + num(e.amount), 0), pf = fP.reduce((s, p) => s + num(p.fee), 0), wtf = fWT.reduce((s, wt) => s + num(wt.fee), 0), tp = db.trades.filter(t => inDateRange(t.date, dashFilterFrom, dashFilterTo)).reduce((s, t) => s + tradeProfit(t), 0), netP = totalBill - ad - oc - oe - pf - wtf + tp;
    if ($('mActual')) $('mActual').textContent = money(ad); if ($('mProfit')) $('mProfit').textContent = money(netP);
    const ym = todayS.slice(0, 7), mW = db.works.filter(w => String(w.date || '').startsWith(ym)), mB = mW.reduce((s, w) => s + bill(w), 0);
    const mP = mB - mW.reduce((s, w) => s + actual(w) + num(w.other), 0) - db.expenses.filter(e => e.approvalStatus !== 'pending' && String(e.date || '').startsWith(ym)).reduce((s, e) => s + num(e.amount), 0) - db.payments.filter(p => p.approvalStatus !== 'pending' && String(p.date || '').startsWith(ym)).reduce((s, p) => s + num(p.fee), 0) - (db.walletTransfers || []).filter(wt => String(wt.date || '').startsWith(ym)).reduce((s, wt) => s + num(wt.fee), 0) + db.trades.filter(t => String(t.date || '').startsWith(ym)).reduce((s, t) => s + tradeProfit(t), 0);
    const goal = num(db.agency?.monthlyGoal) || 100000, pct = goal > 0 ? Math.max(0, Math.min(100, Math.round((mP / goal) * 100))) : 0, margin = totalBill > 0 ? ((netP / totalBill) * 100).toFixed(1) : '0.0';
    if ($('dashGoalText')) $('dashGoalText').innerHTML = `🎯 ${L(`চলতি মাসের (${ym}) প্রফিট টার্গেট`, `Monthly (${ym}) Profit Target`)}: <strong>${money(mP)} / ${money(goal)}</strong> (${pct}%)`;
    if ($('dashMarginText')) $('dashMarginText').textContent = `${L('গড় মার্জিন', 'Avg Margin')}: ${margin}%`;
    if ($('dashGoalBar')) { $('dashGoalBar').style.width = `${pct}%`; $('dashGoalBar').style.background = pct >= 100 ? '#10b981' : (pct >= 50 ? '#3157e8' : '#f59e0b'); }
    const bankKeySet = new Set(linkedBankChoices().map(x => x.walletKey));
    const wBals = getWalletBalances();
    if ($('walletListChips')) $('walletListChips').innerHTML = (db.wallets || []).filter(w => !bankKeySet.has(w)).map(w => `<span class="wallet-chip">${esc(w)}${['Cash', 'Bank'].includes(w) ? '' : `<button type="button" data-wallet="${esc(w)}">✕</button>`}</span>`).join('');
    if ($('bankAccountChips')) {
      const choices = linkedBankChoices();
      $('bankAccountChips').innerHTML = choices.length ? choices.map(c => `<span class="wallet-chip" style="border-color:rgba(49,87,232,.3);background:rgba(49,87,232,.08);cursor:pointer" ${c.cardId ? `onclick="openCardStatement('${esc(c.cardId)}')"` : ''}>${esc(c.walletKey)} · <strong>${money(num(wBals[c.walletKey]))}</strong>${c.legacyId ? `<button type="button" data-bank-id="${esc(c.legacyId)}">✕</button>` : ''}</span>`).join('') : `<small class="muted">এখনো কোনো ব্যাংক কার্ড নেই — উপরের "+ নতুন কার্ড যোগ" বাটনে গিয়ে আপনার ব্যাংক কার্ড তৈরি করুন।</small>`;
    }
    if ($('walletMetrics')) $('walletMetrics').innerHTML = Object.entries(wBals).map(([k, v]) => `<div class="wallet-card"><small>${esc(k)}${(isBankWallet(k) && k !== 'Bank') ? ' <span class="badge-admin" style="font-size:9px;padding:1px 5px">ব্যাংক কার্ড</span>' : ''}</small><strong class="${v < 0 ? 'bad' : 'good'}">${money(v)}</strong></div>`).join('');
    if ($('todayCashflowMetrics')) {
      const cInToday = db.payments.filter(p => p.approvalStatus !== 'pending' && p.date === todayS).reduce((s, p) => s + Math.max(0, num(p.amount) - num(p.fee)), 0)
        + db.trades.filter(t => t.type === 'sell' && t.date === todayS).reduce((s, t) => s + num(t.paidTk), 0)
        + (db.cardRentals || []).filter(r => r.date === todayS).reduce((s, r) => s + num(r.paidTk), 0)
        + db.cashAdjustments.filter(a => a.date === todayS && a.type === 'in').reduce((s, a) => s + num(a.amount), 0);
      const cOutToday = db.expenses.filter(ex => ex.approvalStatus !== 'pending' && ex.date === todayS).reduce((s, ex) => s + num(ex.amount), 0)
        + db.cardDeposits.filter(d => d.date === todayS).reduce((s, d) => s + num(d.taka) + num(d.bankFeeTk), 0)
        + db.trades.filter(t => t.type === 'buy' && t.date === todayS).reduce((s, t) => s + num(t.paidTk), 0)
        + db.cashAdjustments.filter(a => a.date === todayS && a.type === 'out').reduce((s, a) => s + num(a.amount), 0)
        + (db.walletTransfers || []).filter(wt => wt.date === todayS).reduce((s, wt) => s + num(wt.fee), 0);
      const netFlow = cInToday - cOutToday, totalLiquid = Object.values(wBals).reduce((s, v) => s + num(v), 0);
      const totalBankBal = Object.entries(wBals).filter(([k]) => isBankWallet(k)).reduce((s, [, v]) => s + num(v), 0);
      $('todayCashflowMetrics').innerHTML = `
        <div class="metric-card m3" style="padding:13px"><small>${L('আজকের ক্যাশ ইন (+)', "Today's Cash In (+)")}</small><strong>${money(cInToday)}</strong></div>
        <div class="metric-card m4" style="padding:13px"><small>${L('আজকের ক্যাশ আউট (-)', "Today's Cash Out (-)")}</small><strong>${money(cOutToday)}</strong></div>
        <div class="metric-card m1" style="padding:13px"><small>${L('আজকের নিট ক্যাশ ফ্লো', "Today's Net Flow")}</small><strong>${netFlow >= 0 ? '+' : ''}${money(netFlow)}</strong></div>
        <div class="metric-card m2" style="padding:13px"><small>${L('মোট ব্যাংক ব্যালেন্স', 'Total Bank Balance')}</small><strong>${money(totalBankBal)}</strong></div>
        <div class="metric-card m2" style="padding:13px"><small>${L('মোট ওয়ালেট ব্যালেন্স', 'Total Wallet Liquidity')}</small><strong>${money(totalLiquid)}</strong></div>
      `;
    }
    if ($('dashWalletSummary')) $('dashWalletSummary').innerHTML = Object.entries(wBals).filter(([k, v]) => k !== 'Card' || v !== 0).map(([k, v]) => `<div style="padding:5px 9px;border-radius:8px;background:var(--soft);border:1px solid var(--line);font-size:11.5px"><strong>${esc(k)}:</strong> <span class="${v < 0 ? 'bad' : 'good'}">${money(v)}</span></div>`).join('');
    if ($('cashAdjustRows')) $('cashAdjustRows').innerHTML = [...db.cashAdjustments].sort(byDateDesc).map(a => `<tr><td>${esc(a.date)}</td><td><strong>${esc(a.method)}</strong></td><td>${a.type === 'out' ? `<span class="bad">${L('উত্তোলন', 'Withdraw')}</span>` : `<span class="good">${L('জমা', 'Deposit')}</span>`}</td><td>${money(a.amount)}</td><td>${esc(a.note || '—')}</td><td><button type="button" class="danger sm perm-del" onclick="deleteCashAdjust('${a.id}')">${L('মুছুন', 'Del')}</button></td></tr>`).join('') || `<tr><td colspan="6">${L('নেই', 'None')}</td></tr>`;
  }

  const cQ = ($('customerSearch')?.value || '').toLowerCase(), cSF = $('custStageFilter')?.value || '';
  const fCust = db.customers.filter(c => (!cSF || (c.stage || 'Active Client') === cSF) && (c.name.toLowerCase().includes(cQ) || (c.phone || '').includes(cQ)));
  const tCP = Math.max(1, Math.ceil(fCust.length / PAGE_SIZE)); if (custPage > tCP) custPage = tCP;
  if ($('customerRows')) $('customerRows').innerHTML = fCust.slice((custPage - 1) * PAGE_SIZE, custPage * PAGE_SIZE).map((c, idx) => {
    const b = billed(c.id), p = paid(c.id), bal = p - b, chk = { ...DEFAULT_CHECKLIST(), ...(c.checklist || {}) }, doneC = Object.values(chk).filter(Boolean).length;
    const balH = bal < 0 ? `<span class="bad">${L('বকেয়া', 'Due')}: ${money(-bal)}</span>` : (bal > 0 ? `<span class="good">${L('অ্যাডভান্স', 'Adv')}: ${money(bal)}</span>` : `<span class="muted">৳0</span>`);
    const rateTag = num(c.customRate) > 0 ? ` <span class="badge-success" style="font-size:10px">⭐ ৳${num(c.customRate)}</span>` : '';
    const pkgTag = (c.pkgName || c.pkgEnd) ? `<br><span class="badge-status ${c.pkgEnd && c.pkgEnd <= today() ? 'status-paused' : 'status-running'}" style="font-size:10px;margin-top:3px">📦 ${esc(c.pkgName || 'Pkg')}${c.pkgEnd ? ` (${esc(c.pkgEnd)})` : ''}</span>` : '';
    return `<tr><td>#${(custPage - 1) * PAGE_SIZE + idx + 1}</td><td><strong>${esc(c.name)}</strong> ${getClientTrustBadge(c.id)}${rateTag}<br><span class="badge-admin" style="font-size:10px">${esc(c.stage || 'Active Client')}</span>${pkgTag}</td><td>${esc(c.phone || '—')}<br><small class="muted">Setup: ${doneC}/5 ✓</small></td><td>${db.pages.filter(pg => pg.customerId === c.id).length}</td><td>${money(b)}</td><td>${money(p)}</td><td>${balH}</td><td><button type="button" class="secondary sm" onclick="openClientProfile('${c.id}')">👤 ${L('প্রোফাইল', 'Profile')}</button><button type="button" class="secondary sm" onclick="openStatementModal('${c.id}')" title="${L('মান্থলি স্টেটমেন্ট', 'Monthly Statement')}">📑</button><button type="button" class="secondary sm" onclick="openInvoice('${c.id}')">📄 ${L('ইনভয়েস', 'Invoice')}</button><button type="button" class="secondary sm" onclick="openMsgTemplates('${c.id}')">💬</button><button type="button" class="secondary sm perm-edit" onclick="openEditCustomerModal('${c.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deleteCustomer('${c.id}')">${L('মুছুন', 'Del')}</button></td></tr>`;
  }).join('') || `<tr><td colspan="8">${L('কোনো কাস্টমার নেই', 'No customers yet')}</td></tr>`;
  renderPager('custPager', custPage, fCust.length, 'setCustPage');

  if ($('pageRows')) $('pageRows').innerHTML = db.pages.map((p, i) => `<tr><td>#${i + 1}</td><td>${esc(cname(p.customerId))}</td><td>${platformBadge(p.platform)}</td><td><strong>${esc(p.name)}</strong></td><td>${p.link ? `<a href="${esc(p.link)}" target="_blank">${L('লিংক', 'Link')} ↗</a>` : '—'}</td><td>${p.adId ? `<code>${esc(p.adId)}</code> <button type="button" class="secondary sm" onclick="copyText('${esc(p.adId).replace(/'/g, "\\'")}','Ad ID')">📋</button>` : '—'}</td><td>${p.pixelId ? `<code>${esc(p.pixelId)}</code> <button type="button" class="secondary sm" onclick="copyText('${esc(p.pixelId).replace(/'/g, "\\'")}','Pixel/Tag ID')">📋</button>` : '—'}</td><td><button type="button" class="secondary sm perm-edit" onclick="openEditPageModal('${p.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deletePage('${p.id}')">${L('মুছুন', 'Del')}</button></td></tr>`).join('') || `<tr><td colspan="8">${L('নেই', 'None')}</td></tr>`;
  const cc = id => db.cards.find(x => x.id === id)?.name || '—';
  if ($('adAccountRows')) $('adAccountRows').innerHTML = db.adAccounts.map(a => {
    const aaWorks = db.works.filter(w => w.adAccountId === a.id);
    const aaSpend = aaWorks.reduce((s, w) => s + num(w.actualDollar), 0);
    return `<tr><td>${platformBadge(a.platform)}</td><td><strong>${esc(a.name)}</strong><br><small class="muted">${esc(a.bm || '')}${num(a.billingDay) > 0 ? ` · 📅 ${L('বিল', 'Bill')}: ${a.billingDay}` : ''}</small></td><td>${a.adId ? `<code>${esc(a.adId)}</code>` : '—'}</td><td>${esc(cc(a.cardId))}</td><td><button type="button" class="secondary sm" style="margin:0" onclick="filterWorksByAdAccount('${a.id}')" title="${L('এই অ্যাড অ্যাকাউন্টের সব কাজ দেখুন', 'View all ads on this account')}">📢 ${aaWorks.length}টি · ${usd(aaSpend)}</button></td><td>${usd(a.threshold)} / <span class="${num(a.unpaid) > 0 ? 'bad' : ''}">${usd(a.unpaid)}</span>${num(a.dailyLimit) > 0 ? `<br><small class="muted">${L('ডেইলি লিমিট', 'Daily')}: ${usd(a.dailyLimit)}/day</small>` : ''}</td><td><span class="${a.status === 'Active' ? 'badge-success' : (a.status === 'Disabled' ? 'badge-danger' : 'badge-warn')}" style="cursor:pointer" onclick="cycleAdAccountStatus('${a.id}')">${esc(a.status)}</span></td><td><button type="button" class="secondary sm perm-edit" onclick="openEditAdAccountModal('${a.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deleteAdAccount('${a.id}')">${L('মুছুন', 'Del')}</button></td></tr>`;
  }).join('') || `<tr><td colspan="8">${L('নেই', 'None')}</td></tr>`;
  renderAdAccountHealthAndCalendar();
  if ($('rateRows')) $('rateRows').innerHTML = [...db.rates].sort(byDateDesc).map(r => `<tr><td>${esc(r.date)}</td><td><strong>${money(r.value)}</strong></td><td>${esc(r.note || '—')}</td><td><button type="button" class="secondary sm perm-edit" onclick="openEditRateModal('${r.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deleteRate('${r.id}')">${L('মুছুন', 'Del')}</button></td></tr>`).join('') || `<tr><td colspan="4">${L('নেই', 'None')}</td></tr>`;

  const wQ = ($('workSearch')?.value || '').toLowerCase(), sF = $('workStatusFilter')?.value || '', cF = $('workCustomerFilter')?.value || '', pF = $('workPlatformFilter')?.value || '', aaF = $('workAdAccountFilter')?.value || '';
  const fWL = [...db.works].sort(byDateDesc).filter(w => {
    const plat = AD_PLATFORMS.includes(w.platform) ? w.platform : 'Meta';
    const aaTxt = aaname(w.adAccountId).toLowerCase();
    return (w.name.toLowerCase().includes(wQ) || cname(w.customerId).toLowerCase().includes(wQ) || pname(w.pageId).toLowerCase().includes(wQ) || plat.toLowerCase().includes(wQ) || aaTxt.includes(wQ)) && (!sF || (w.status || 'running') === sF) && (!cF || w.customerId === cF) && (!pF || plat === pF) && (!aaF || (w.adAccountId || '') === aaF);
  });
  const tWP = Math.max(1, Math.ceil(fWL.length / PAGE_SIZE)); if (workPage > tWP) workPage = tWP;
  if ($('workRows')) $('workRows').innerHTML = fWL.slice((workPage - 1) * PAGE_SIZE, workPage * PAGE_SIZE).map((w, idx) => {
    const st = w.status || 'running', stT = st === 'completed' ? L('সম্পন্ন', 'Completed') : (st === 'paused' ? L('পজ', 'Paused') : L('চলমান', 'Running')), stC = st === 'completed' ? 'status-completed' : (st === 'paused' ? 'status-paused' : 'status-running');
    const resCnt = num(w.conversions), cpr = resCnt > 0 ? usd(num(w.actualDollar) / resCnt) : '—', svc = workServiceCharge(w), disc = num(w.discount), taxAmt = workTaxAmount(w);
    const polB = (w.policyIssue && w.policyIssue !== 'None') ? `<br><span class="badge-danger" style="font-size:10px">⚠️ ${esc(w.policyIssue)}</span>` : '';
    const refBadge = num(w.refundedUsd) > 0 ? `<br><span class="badge-warn" style="font-size:10px">↩️ -${usd(w.refundedUsd)}</span>` : '';
    const aaStr = aaname(w.adAccountId), cardStr = !isStaff() && w.cardId ? cc(w.cardId) : '';
    const aaLine = (aaStr || (cardStr && cardStr !== '—')) ? `<br><small class="muted">${aaStr ? `📢 ${esc(aaStr)}` : ''}${aaStr && cardStr && cardStr !== '—' ? ' · ' : ''}${cardStr && cardStr !== '—' ? `💳 ${esc(cardStr)}` : ''}</small>` : '';
    const billMeta = [svc > 0 ? `+${L('চার্জ', 'Fee')} ${money(svc)}` : '', disc > 0 ? `-${L('ছাড়', 'Disc')} ${money(disc)}` : '', taxAmt > 0 ? `+VAT ${money(taxAmt)}` : ''].filter(Boolean).join(' · ');
    return `<tr><td><input type="checkbox" class="work-row-chk row-chk" data-id="${w.id}" ${selectedWorkIds.has(w.id) ? 'checked' : ''} onchange="toggleWorkSelect('${w.id}',this.checked)"></td><td>#${(workPage - 1) * PAGE_SIZE + idx + 1}</td><td>${esc(w.date)}</td><td><strong>${esc(cname(w.customerId))}</strong><br><small class="muted">${esc(pname(w.pageId))}</small></td><td>${platformBadge(w.platform)} <strong>${esc(w.name)}</strong>${w.objective ? ` <small class="badge-admin" style="font-size:10px">${esc(w.objective)}</small>` : ''}${aaLine}${polB}${w.staffName ? `<br><small class="muted">👤 ${esc(w.staffName)}</small>` : ''}</td><td>${usd(w.actualDollar)} <small class="muted">/ ${usd(w.dollar)}</small>${refBadge}${progressBarHtml(num(w.actualDollar), num(w.dollar))}</td><td><strong>${money(bill(w))}</strong>${billMeta ? `<br><small class="muted">${billMeta}</small>` : ''}</td>${isStaff() ? '' : `<td class="priv-blur">${money(actual(w))}</td><td class="priv-blur ${profit(w) >= 0 ? 'good' : 'bad'}">${money(profit(w))}</td>`}<td><small>Res: <strong>${resCnt}</strong><br>CPR: <strong>${cpr}</strong></small></td><td><span class="badge-status ${stC}">${stT}</span></td><td><button type="button" class="secondary sm" onclick="openWorkPerfReport('${w.id}')" title="${L('ক্লায়েন্ট রিপোর্ট', 'Client Report')}">📊</button><button type="button" class="secondary sm" onclick="copyWorkBrief('${w.id}')" title="${L('ব্রিফ কপি', 'Copy Brief')}">📋</button><button type="button" class="secondary sm" onclick="openMsgTemplates('${w.customerId}','${w.id}')" title="${L('মেসেজ', 'Message')}">💬</button><button type="button" class="secondary sm perm-edit" onclick="quickAddSpend('${w.id}')" title="${L('খরচ যোগ', 'Add Spend')}">+$</button><button type="button" class="secondary sm perm-edit" onclick="refundWork('${w.id}')" title="${L('আংশিক রিফান্ড / ক্রেডিট', 'Partial Refund / Credit')}">↩️</button><button type="button" class="secondary sm perm-edit" onclick="openEditWorkModal('${w.id}')">✏️</button><button type="button" class="secondary sm perm-edit" onclick="renewWork('${w.id}')">🔄</button><button type="button" class="danger sm perm-del" onclick="deleteWork('${w.id}')">✕</button></td></tr>`;
  }).join('') || `<tr><td colspan="${isStaff() ? 10 : 12}">${L('কোনো কাজ নেই', 'No campaigns yet')}</td></tr>`;
  renderPager('workPager', workPage, fWL.length, 'setWorkPage'); updateWorkBulkBar();

  if ($('riskLogRows')) $('riskLogRows').innerHTML = [...(db.riskLogs || [])].sort(byDateDesc).map(r => {
    const stCls = r.status === 'Recovered' ? 'badge-success' : (r.status === 'Permanent Disabled' ? 'badge-danger' : 'badge-warn');
    return `<tr><td>${esc(r.date)}</td><td>${platformBadge(r.platform)}<br><small class="muted">${esc(r.customerId ? cname(r.customerId) : L('এজেন্সি নিজস্ব', 'Agency Asset'))}</small></td><td><strong>${esc(r.asset)}</strong></td><td><span class="badge-danger" style="font-size:10.5px">${esc(r.issue)}</span>${r.note ? `<br><small class="muted">${esc(r.note)}</small>` : ''}</td><td><span class="${stCls}" style="cursor:pointer" onclick="cycleRiskStatus('${r.id}')" title="${L('স্ট্যাটাস বদলাতে ক্লিক করুন', 'Click to cycle status')}">${esc(r.status)}</span></td><td><button type="button" class="danger sm perm-del" onclick="deleteRiskLog('${r.id}')">${L('মুছুন', 'Del')}</button></td></tr>`;
  }).join('') || `<tr><td colspan="6">${L('কোনো রেস্ট্রিকশন বা রিস্ক লগ নেই 🎉', 'No restriction or risk logs 🎉')}</td></tr>`;

  if ($('pixelListRows')) $('pixelListRows').innerHTML = db.pages.filter(p => p.pixelId).map(p => { const pl = AD_PLATFORMS.includes(p.platform) ? p.platform : 'Meta'; return `<tr><td>${esc(cname(p.customerId))}</td><td>${platformBadge(pl)}</td><td>${esc(p.name)}</td><td><code>${esc(p.pixelId)}</code></td><td><span class="badge-success">Active</span></td><td><button type="button" class="secondary sm" onclick="setTrackingPlatform('${pl}');$('genPixelId').value='${esc(p.pixelId).replace(/'/g, "\\'")}';generatePixelCode()">${L('কোড', 'Code')}</button></td></tr>`; }).join('') || `<tr><td colspan="6">${L('নেই', 'None')}</td></tr>`;

  const expQ = ($('expSearch')?.value || '').toLowerCase(), expCat = $('expCatFilter')?.value || '';
  const fExpsL = [...db.expenses].sort(byDateDesc).filter(e => (!expCat || e.category === expCat) && (!expQ || e.title.toLowerCase().includes(expQ) || (e.note || '').toLowerCase().includes(expQ)));
  if ($('expenseRows')) $('expenseRows').innerHTML = fExpsL.map(e => `<tr><td>${esc(e.date)}</td><td><strong>${esc(e.title)}</strong>${e.approvalStatus === 'pending' ? ' <span class="badge-warn">Pending</span>' : ''}</td><td><span class="badge-admin">${esc(e.category)}</span> <small class="muted">${esc(e.method || 'Cash')}</small></td><td class="bad">${money(e.amount)}</td><td>${esc(e.note || '—')}</td><td><button type="button" class="secondary sm perm-edit" onclick="openEditExpenseModal('${e.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deleteExpense('${e.id}')">${L('মুছুন', 'Del')}</button></td></tr>`).join('') || `<tr><td colspan="6">${L('নেই', 'None')}</td></tr>`;
  if ($('totalExpenseSummary')) $('totalExpenseSummary').textContent = `${L('মোট খরচ', 'Total Expense')}: ${money(fExpsL.reduce((s, e) => s + num(e.amount), 0))}`;
  if ($('expenseCategorySummary')) { const ct = {}, as = db.expenses.reduce((s, x) => s + num(x.amount), 0); db.expenses.forEach(ex => { ct[ex.category] = (ct[ex.category] || 0) + num(ex.amount); }); $('expenseCategorySummary').innerHTML = Object.entries(ct).sort((a, b) => b[1] - a[1]).map(([c, a]) => `<span class="badge-admin" style="padding:6px 11px;font-size:12px">${esc(c)}: <strong>${money(a)}</strong> (${as > 0 ? ((a / as) * 100).toFixed(0) : 0}%)</span>`).join(''); }
  renderExpenseBudgets();
  updatePaymentCustomerStatus(); checkBackupReminder();

  const payQ = ($('paySearch')?.value || '').toLowerCase(), payM = $('payMethodFilter')?.value || '';
  const sPays = [...db.payments].sort(byDateDesc).filter(p => (!payM || p.method === payM) && (!payQ || cname(p.customerId).toLowerCase().includes(payQ) || (p.ref || '').toLowerCase().includes(payQ) || (p.note || '').toLowerCase().includes(payQ)));
  const tPP = Math.max(1, Math.ceil(sPays.length / PAGE_SIZE)); if (payPage > tPP) payPage = tPP;
  if ($('paymentRows')) $('paymentRows').innerHTML = sPays.slice((payPage - 1) * PAGE_SIZE, payPage * PAGE_SIZE).map(p => `<tr><td>${esc(p.date)}</td><td><strong>${esc(cname(p.customerId))}</strong>${p.approvalStatus === 'pending' ? ' <span class="badge-warn">Pending</span>' : ''}</td><td class="good">${money(p.amount)}${num(p.fee) > 0 ? `<br><small class="bad">-${money(p.fee)}</small>` : ''}</td><td>${esc(p.method)}</td><td>${esc(p.ref || p.note || '—')}</td><td><button type="button" class="secondary sm" onclick="openPaymentReceipt('${p.id}')">🧾 ${L('রিসিপ্ট', 'Receipt')}</button><button type="button" class="secondary sm perm-edit" onclick="openEditPaymentModal('${p.id}')">✏️</button><button type="button" class="danger sm perm-del" onclick="deletePayment('${p.id}')">${L('মুছুন', 'Del')}</button></td></tr>`).join('') || `<tr><td colspan="6">${L('নেই', 'None')}</td></tr>`;
  renderPager('payPager', payPage, sPays.length, 'setPayPage');

  if (!isStaff()) {
    renderPnlSummary();
    if ($('platformReportRows')) {
      $('platformReportRows').innerHTML = AD_PLATFORMS.map(plat => {
        const list = db.works.filter(w => (AD_PLATFORMS.includes(w.platform) ? w.platform : 'Meta') === plat);
        const u = list.reduce((s, w) => s + num(w.actualDollar), 0), b = list.reduce((s, w) => s + bill(w), 0), c = list.reduce((s, w) => s + actual(w) + num(w.other), 0), pr = b - c;
        const resCnt = list.reduce((s, w) => s + num(w.conversions), 0), rev = list.reduce((s, w) => s + num(w.revenue), 0);
        const cpr = resCnt > 0 ? usd(u / resCnt) : '—', roas = (rev > 0 && b > 0) ? (rev / b).toFixed(2) + 'x' : '—';
        return `<tr><td>${platformBadge(plat)}</td><td>${list.length} ${L('টি', '')}</td><td><strong>${usd(u)}</strong></td><td>${money(b)}</td><td>${money(c)}</td><td class="${pr >= 0 ? 'good' : 'bad'}"><strong>${money(pr)}</strong></td><td><small>Res: <strong>${resCnt}</strong><br>CPR: <strong>${cpr}</strong></small></td><td><span class="badge-admin">${roas}</span></td></tr>`;
      }).join('');
    }
    renderBackupHub();
    if ($('staffLbMonth') && !$('staffLbMonth').value) $('staffLbMonth').value = today().slice(0, 7);
    const lbYm = $('staffLbMonth')?.value || '', sTarget = db.agency?.staffProfitTarget === undefined ? 50000 : num(db.agency.staffProfitTarget), sBonusPct = db.agency?.staffBonusPct === undefined ? 5 : num(db.agency.staffBonusPct);
    if ($('staffProfitTargetInput') && document.activeElement !== $('staffProfitTargetInput')) $('staffProfitTargetInput').value = sTarget;
    if ($('staffBonusPctInput') && document.activeElement !== $('staffBonusPctInput')) $('staffBonusPctInput').value = sBonusPct;
    const lbWorks = lbYm ? db.works.filter(w => String(w.date || '').startsWith(lbYm)) : db.works;
    if ($('staffLeaderboardCards')) {
      const lbMap = {};
      lbWorks.forEach(w => {
        const k = w.staffName || '';
        if (!k) return;
        if (!lbMap[k]) lbMap[k] = { name: k, count: 0, usd: 0, bill: 0, rev: 0, profit: 0 };
        lbMap[k].count++; lbMap[k].usd += num(w.actualDollar); lbMap[k].bill += bill(w); lbMap[k].rev += num(w.revenue); lbMap[k].profit += profit(w);
      });
      const ranked = Object.values(lbMap).sort((a, b) => b.profit - a.profit);
      const medals = ['🥇 #1', '🥈 #2', '🥉 #3'];
      $('staffLeaderboardCards').innerHTML = ranked.map((s, idx) => {
        const roas = (s.rev > 0 && s.bill > 0) ? (s.rev / s.bill).toFixed(2) + 'x' : '—';
        const pct = sTarget > 0 ? Math.min(100, Math.max(0, Math.round((s.profit / sTarget) * 100))) : 0;
        const hit = sTarget > 0 && s.profit >= sTarget;
        const bonus = hit && sBonusPct > 0 ? s.profit * (sBonusPct / 100) : 0;
        return `<div class="closing-box"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><strong>${medals[idx] || `#${idx + 1}`} ${esc(s.name)}</strong><span class="${hit ? 'badge-success' : 'badge-admin'}" style="font-size:10px">${hit ? `🎉 ${L('টার্গেট পূর্ণ', 'Target Hit')}` : `${pct}%`}</span></div><div style="font-size:12px;line-height:1.55">${L('লাভ', 'Profit')}: <strong class="${s.profit >= 0 ? 'good' : 'bad'}">${money(s.profit)}</strong> · ROAS: <strong>${roas}</strong><br>${L('স্পেন্ড', 'Spend')}: ${usd(s.usd)} (${s.count} ${L('কাজ', 'ads')})${bonus > 0 ? ` · <span class="good">${L('বোনাস', 'Bonus')}: +${money(bonus)}</span>` : ''}</div>${sTarget > 0 ? `<div class="prog-wrap" style="margin-top:6px"><div class="prog-bar" style="width:${pct}%;background:${hit ? '#10b981' : '#3157e8'}"></div></div>` : ''}</div>`;
      }).join('') || `<div class="muted" style="grid-column:1 / -1">${L('এই মাসে কোনো স্টাফ অ্যাসাইন করা ক্যাম্পেইন নেই — কাজ যোগ করার সময় স্টাফ সিলেক্ট করুন।', 'No staff-assigned campaigns in this month yet.')}</div>`;
    }
    if ($('staffCommRows')) {
      const sMap = {};
      db.works.forEach(w => {
        const k = w.staffName || L('অ্যাসাইন নেই', 'Unassigned');
        if (!sMap[k]) sMap[k] = { name: k, count: 0, usd: 0, bill: 0, rev: 0, profit: 0, comm: 0, paid: 0, mProfit: 0 };
        sMap[k].count++; sMap[k].usd += num(w.actualDollar); sMap[k].bill += bill(w); sMap[k].rev += num(w.revenue); sMap[k].profit += profit(w); sMap[k].comm += workCommission(w);
        if (!lbYm || String(w.date || '').startsWith(lbYm)) sMap[k].mProfit += profit(w);
      });
      Object.values(sMap).forEach(s => {
        const kl = s.name.toLowerCase();
        s.paid = db.expenses.filter(e => e.approvalStatus !== 'pending' && e.category === 'Salary' && ((e.title || '').toLowerCase().includes(kl) || (e.note || '').toLowerCase().includes(kl))).reduce((sum, e) => sum + num(e.amount), 0);
      });
      $('staffCommRows').innerHTML = Object.values(sMap).sort((a, b) => b.profit - a.profit).map(s => {
        const roas = (s.rev > 0 && s.bill > 0) ? (s.rev / s.bill).toFixed(2) + 'x' : '—';
        const isAssigned = s.name !== L('অ্যাসাইন নেই', 'Unassigned');
        const hit = isAssigned && sTarget > 0 && s.mProfit >= sTarget;
        const bonusAmt = hit && sBonusPct > 0 ? s.mProfit * (sBonusPct / 100) : 0;
        const totalEarn = s.comm + bonusAmt, payable = Math.max(0, totalEarn - s.paid);
        const pct = sTarget > 0 ? Math.min(100, Math.max(0, Math.round((s.mProfit / sTarget) * 100))) : 0;
        const escName = esc(s.name).replace(/'/g, "\\'");
        return `<tr><td><strong>${esc(s.name)}</strong></td><td>${s.count} ${L('টি', '')}</td><td>${usd(s.usd)}</td><td>${money(s.bill)}</td><td class="${s.profit >= 0 ? 'good' : 'bad'}">${money(s.profit)}</td><td><span class="badge-admin">${roas}</span></td><td>${isAssigned && sTarget > 0 ? `<small>${pct}%</small>${bonusAmt > 0 ? `<br><span class="good">+${money(bonusAmt)}</span>` : ''}` : '—'}</td><td style="color:var(--brand);font-weight:700">${money(totalEarn)}</td><td class="good">${money(s.paid)}</td><td class="${payable > 0 ? 'bad' : 'muted'}"><strong>${money(payable)}</strong></td><td style="white-space:nowrap">${payable > 0 ? `<button type="button" class="sm" style="background:#059669" onclick="payStaffCommission('${escName}',${payable.toFixed(2)})">💸 ${L('পে করুন', 'Pay')}</button> ` : `<span class="badge-success">✓ ${L('পেইড', 'Settled')}</span> `}<button type="button" class="secondary sm" onclick="openStaffHrModal('${escName}')">🧾</button></td></tr>`;
      }).join('') || `<tr><td colspan="11">${L('নেই', 'None')}</td></tr>`;
    }
    if ($('dayClosingHistoryRows')) {
      $('dayClosingHistoryRows').innerHTML = [...(db.dailyClosings || [])].sort(byDateDesc).map(dc => `<tr><td><strong>${esc(dc.date)}</strong></td><td>${money(dc.bill)}</td><td class="good">${money(dc.paid)}</td><td class="bad">${money(dc.cost)}</td><td class="${num(dc.profit) >= 0 ? 'good' : 'bad'}"><strong>${money(dc.profit)}</strong></td><td>${esc(dc.note || '—')}</td><td><button type="button" class="secondary sm" onclick="openDayClosingModal('${esc(dc.date)}')">👁️ ${L('দেখুন', 'View')}</button><button type="button" class="danger sm perm-del" onclick="deleteDayClosing('${dc.id}')">✕</button></td></tr>`).join('') || `<tr><td colspan="7">${L('এখনো কোনো ডে-এন্ড ক্লোজিং সেভ হয়নি', 'No day-end closings saved yet')}</td></tr>`;
    }
    if ($('reportRows') || $('clientProfitMetrics')) {
      const cStats = db.customers.map(c => {
        const b = billed(c.id), p = paid(c.id), bal = p - b, cw = db.works.filter(w => w.customerId === c.id);
        const tu = cw.reduce((s, w) => s + num(w.actualDollar), 0), cost = cw.reduce((s, w) => s + actual(w) + num(w.other), 0), pr = b - cost;
        const margin = b > 0 ? (pr / b) * 100 : 0, avgRate = tu > 0 ? (b / tu) : 0;
        return { c, count: cw.length, tu, avgRate, b, cost, p, bal, pr, margin };
      });
      const activeC = cStats.filter(x => x.b > 0);
      const topProfitC = [...activeC].sort((a, b) => b.pr - a.pr)[0];
      const topMarginC = [...activeC].sort((a, b) => b.margin - a.margin)[0];
      const lowMarginCnt = activeC.filter(x => x.margin < 8).length;
      const totBAll = activeC.reduce((s, x) => s + x.b, 0), totPrAll = activeC.reduce((s, x) => s + x.pr, 0);
      const avgPortMargin = totBAll > 0 ? ((totPrAll / totBAll) * 100).toFixed(1) : '0.0';
      if ($('clientProfitMetrics')) $('clientProfitMetrics').innerHTML = `
        <div class="metric-card m3" style="padding:13px"><small>${L('টপ প্রফিট ক্লায়েন্ট', 'Top Profit Client')}</small><strong>${topProfitC ? `${esc(topProfitC.c.name)}` : '—'}</strong><span class="trend">${topProfitC ? money(topProfitC.pr) : ''}</span></div>
        <div class="metric-card m2" style="padding:13px"><small>${L('সর্বোচ্চ মার্জিন', 'Best Margin')}</small><strong>${topMarginC ? `${topMarginC.margin.toFixed(1)}%` : '0%'}</strong><span class="trend">${topMarginC ? esc(topMarginC.c.name) : ''}</span></div>
        <div class="metric-card m4" style="padding:13px"><small>${L('লো-মার্জিন / লস ক্লায়েন্ট', 'Low-Margin / Loss')}</small><strong>${lowMarginCnt} ${L('জন', '')}</strong></div>
        <div class="metric-card m1" style="padding:13px"><small>${L('গড় পোর্টফোলিও মার্জিন', 'Avg Portfolio Margin')}</small><strong>${avgPortMargin}%</strong></div>
      `;
      const rpFilter = $('repProfitFilter')?.value || 'all', rpSearch = ($('repCustSearch')?.value || '').toLowerCase();
      const filteredC = cStats.filter(x => {
        if (rpSearch && !x.c.name.toLowerCase().includes(rpSearch) && !(x.c.phone || '').includes(rpSearch)) return false;
        if (rpFilter === 'high') return x.b > 0 && x.margin >= 15;
        if (rpFilter === 'low') return x.b > 0 && x.margin > 0 && x.margin < 8;
        if (rpFilter === 'loss') return x.count > 0 && x.pr <= 0;
        return true;
      }).sort((a, b) => rpFilter === 'loss' ? a.pr - b.pr : b.pr - a.pr);
      if ($('reportRows')) $('reportRows').innerHTML = filteredC.map(x => {
        const mCls = x.b <= 0 ? 'badge-admin' : (x.pr < 0 ? 'badge-danger' : (x.margin < 8 ? 'badge-warn' : (x.margin >= 15 ? 'badge-success' : 'badge-admin')));
        const mLbl = x.b <= 0 ? '—' : (x.pr < 0 ? `🔴 ${L('লস', 'Loss')}` : (x.margin < 8 ? `⚠️ ${L('লো', 'Low')}` : (x.margin >= 15 ? `💎 High` : `✅ OK`)));
        return `<tr><td><strong>${esc(x.c.name)}</strong></td><td>${x.count}</td><td>${usd(x.tu)}</td><td>${x.avgRate > 0 ? `৳${x.avgRate.toFixed(1)}` : '—'}</td><td>${money(x.b)}</td><td>${money(x.cost)}</td><td>${x.bal < 0 ? `<span class="bad">${L('বকেয়া', 'Due')}: ${money(-x.bal)}</span>` : (x.bal > 0 ? `<span class="good">${L('অ্যাড', 'Adv')}: ${money(x.bal)}</span>` : '৳0')}</td><td class="${x.pr >= 0 ? 'good' : 'bad'}"><strong>${money(x.pr)}</strong></td><td><span class="${mCls}" style="font-size:11px">${x.b > 0 ? `${x.margin.toFixed(1)}% ` : ''}${mLbl}</span></td></tr>`;
      }).join('') || `<tr><td colspan="9">${L('নেই', 'None')}</td></tr>`;
    }
  }
  renderDues();
}

if ($('customerSearch')) $('customerSearch').oninput = () => { custPage = 1; render(); };
if ($('custStageFilter')) $('custStageFilter').onchange = () => { custPage = 1; render(); };
if ($('workSearch')) $('workSearch').oninput = () => { workPage = 1; render(); };
if ($('workStatusFilter')) $('workStatusFilter').onchange = () => { workPage = 1; render(); };
if ($('workCustomerFilter')) $('workCustomerFilter').onchange = () => { workPage = 1; render(); };
if ($('workPlatformFilter')) $('workPlatformFilter').onchange = () => { workPage = 1; render(); };
if ($('workAdAccountFilter')) $('workAdAccountFilter').onchange = () => { workPage = 1; render(); };
window.filterWorksByAdAccount = id => { goToSection('works'); if ($('workAdAccountFilter')) $('workAdAccountFilter').value = id || ''; workPage = 1; render(); };
if ($('expSearch')) $('expSearch').oninput = render; if ($('expCatFilter')) $('expCatFilter').onchange = render;
if ($('paySearch')) $('paySearch').oninput = () => { payPage = 1; render(); }; if ($('payMethodFilter')) $('payMethodFilter').onchange = () => { payPage = 1; render(); };
if ($('dueSearch')) $('dueSearch').oninput = renderDues;
if ($('trainingSearch')) $('trainingSearch').oninput = e => { const q = e.target.value.toLowerCase(); document.querySelectorAll('#trainingCards .guide-card').forEach(c => { c.style.display = (!q || c.textContent.toLowerCase().includes(q)) ? 'block' : 'none'; }); };

// Admin Panel (Upgraded Super Admin Command & Controls)
window.applyStaffPreset = preset => {
  const map = {
    media: { del: false, edit: true, pay: false, exp: false },
    accounts: { del: false, edit: true, pay: true, exp: true },
    readonly: { del: false, edit: false, pay: false, exp: false }
  }[preset];
  if (!map) return;
  if ($('auRole')) $('auRole').value = 'staff';
  if ($('auPermsWrap')) $('auPermsWrap').style.display = 'block';
  if ($('auPermDel')) $('auPermDel').checked = map.del;
  if ($('auPermEdit')) $('auPermEdit').checked = map.edit;
  if ($('auPermPay')) $('auPermPay').checked = map.pay;
  if ($('auPermExp')) $('auPermExp').checked = map.exp;
  toast(L(`প্রিসেট প্রয়োগ হয়েছে: ${preset}`, `Applied preset: ${preset}`));
};
window.quickExtendUser = (id, days = 30) => {
  if (!isSuperAdmin()) return;
  const accs = readLocalAccounts(), idx = accs.findIndex(a => a.id === id); if (idx === -1) return;
  const baseStr = accs[idx].expiryDate && accs[idx].expiryDate >= today() ? accs[idx].expiryDate : today();
  const base = new Date(baseStr + 'T00:00:00Z');
  base.setUTCDate(base.getUTCDate() + days);
  accs[idx].expiryDate = base.toISOString().slice(0, 10);
  if (accs[idx].plan === 'Lifetime' || !accs[idx].plan) accs[idx].plan = 'Monthly';
  accs[idx].updatedAt = Date.now();
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs));
  if (serverAuthToken) serverFetch('/api/accounts/upsert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: accs[idx] }) }).catch(() => {});
  logActivity(`মেয়াদ বৃদ্ধি (+${days} দিন): ${accs[idx].name}`);
  triggerAccountCloudSync(); renderAdminPanel();
  toast(L(`${accs[idx].name}-এর মেয়াদ +${days} দিন বাড়ানো হয়েছে (${accs[idx].expiryDate})`, `Extended ${accs[idx].name} by +${days} days`));
};
const selectedUserIds = new Set();
function updateUserBulkBar() {
  const bar = $('saUserBulkBar'), cnt = $('saSelectedCount');
  if (cnt) cnt.textContent = selectedUserIds.size;
  if (bar) bar.style.display = selectedUserIds.size > 0 ? 'flex' : 'none';
}
window.toggleUserSelect = (id, chk) => { if (chk) selectedUserIds.add(id); else selectedUserIds.delete(id); updateUserBulkBar(); };
window.toggleSelectAllUsers = chk => {
  document.querySelectorAll('.sa-user-chk').forEach(el => { el.checked = chk; if (chk) selectedUserIds.add(el.dataset.id); else selectedUserIds.delete(el.dataset.id); });
  updateUserBulkBar();
};
window.bulkExtendUsers = (days = 30) => {
  if (!isSuperAdmin() || !selectedUserIds.size) return;
  const accs = readLocalAccounts(); let changed = 0;
  accs.forEach(a => {
    if (!selectedUserIds.has(a.id)) return;
    const baseStr = a.expiryDate && a.expiryDate >= today() ? a.expiryDate : today();
    const d = new Date(baseStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days);
    a.expiryDate = d.toISOString().slice(0, 10);
    if (a.plan === 'Lifetime' || !a.plan) a.plan = 'Monthly';
    a.updatedAt = Date.now(); changed++;
    if (serverAuthToken) serverFetch('/api/accounts/upsert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: a }) }).catch(() => {});
  });
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs));
  selectedUserIds.clear(); logActivity(`বাল্ক মেয়াদ বৃদ্ধি (+${days} দিন): ${changed} ইউজার`);
  triggerAccountCloudSync(); renderAdminPanel(); toast(`${changed} জন ইউজারের মেয়াদ +${days} দিন বাড়ানো হয়েছে!`);
};
window.bulkSetUserStatus = status => {
  if (!isSuperAdmin() || !selectedUserIds.size) return;
  const accs = readLocalAccounts(); let changed = 0;
  accs.forEach(a => {
    if (selectedUserIds.has(a.id)) {
      a.status = status; a.updatedAt = Date.now(); changed++;
      if (serverAuthToken) serverFetch('/api/accounts/upsert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: a }) }).catch(() => {});
    }
  });
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs));
  selectedUserIds.clear(); logActivity(`বাল্ক স্ট্যাটাস (${status}): ${changed} ইউজার`);
  triggerAccountCloudSync(); renderAdminPanel(); toast(`${changed} জন ইউজারের স্ট্যাটাস ${status} করা হয়েছে!`);
};
window.toggleUserBypass = id => {
  if (!isSuperAdmin()) return;
  const accs = readLocalAccounts(), idx = accs.findIndex(a => a.id === id); if (idx === -1) return;
  accs[idx].subscriptionBypass = !Boolean(accs[idx].subscriptionBypass);
  if (accs[idx].subscriptionBypass && accs[idx].status === 'pending') accs[idx].status = 'active';
  accs[idx].updatedAt = Date.now();
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs));
  if (serverAuthToken) serverFetch('/api/accounts/upsert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: accs[idx] }) }).catch(() => {});
  logActivity(`${accs[idx].subscriptionBypass ? '🆓 ফ্রি পারমিশন চালু' : '🔒 ফ্রি পারমিশন বন্ধ'}: ${accs[idx].name}`);
  triggerAccountCloudSync(); renderAdminPanel();
  toast(accs[idx].subscriptionBypass ? `🆓 ${accs[idx].name}-কে ফ্রি অনুমতি দেওয়া হয়েছে (সাবস্ক্রিপশন লাগবে না)!` : `🔒 ${accs[idx].name}-এর ফ্রি অনুমতি বাতিল করা হয়েছে`, accs[idx].subscriptionBypass ? 'success' : 'warn');
};
window.bulkSetBypass = allow => {
  if (!isSuperAdmin() || !selectedUserIds.size) return;
  const accs = readLocalAccounts(); let changed = 0;
  accs.forEach(a => {
    if (!selectedUserIds.has(a.id)) return;
    a.subscriptionBypass = Boolean(allow);
    if (allow && a.status === 'pending') a.status = 'active';
    a.updatedAt = Date.now(); changed++;
    if (serverAuthToken) serverFetch('/api/accounts/upsert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: a }) }).catch(() => {});
  });
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs));
  selectedUserIds.clear(); logActivity(`বাল্ক ফ্রি অনুমতি (${allow ? 'চালু' : 'বন্ধ'}): ${changed} ইউজার`);
  triggerAccountCloudSync(); renderAdminPanel();
  toast(allow ? `🆓 ${changed} জনকে ফ্রি অনুমতি দেওয়া হয়েছে!` : `🔒 ${changed} জনের ফ্রি অনুমতি বাতিল করা হয়েছে!`, allow ? 'success' : 'warn');
};
window.quickResetUserPass = async id => {
  if (!isSuperAdmin()) return;
  const accs = readLocalAccounts(), idx = accs.findIndex(a => a.id === id); if (idx === -1) return;
  const np = await askPrompt(L(`${accs[idx].name} (@${accs[idx].username})-এর নতুন পাসওয়ার্ড লিখুন (কমপক্ষে ৬ অক্ষর):`, `Enter new password for ${accs[idx].name} (min 6 chars):`), '', 'পাসওয়ার্ড রিসেট', { type: 'password', placeholder: 'কমপক্ষে ৬ অক্ষর' });
  if (np === null) return;
  if (np.trim().length < 6) return toast(L('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে!', 'Password must be at least 6 chars!'), 'error');
  accs[idx].password = hashPass(np.trim()); accs[idx].updatedAt = Date.now();
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs));
  if (serverAuthToken) serverFetch('/api/accounts/upsert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: { ...accs[idx], plainPassword: np.trim() } }) }).catch(() => {});
  logActivity(`পাসওয়ার্ড রিসেট: ${accs[idx].name}`);
  triggerAccountCloudSync(); renderAdminPanel();
  toast(L(`${accs[idx].name}-এর পাসওয়ার্ড রিসেট হয়েছে 🔑`, `Password reset for ${accs[idx].name} 🔑`));
};
let cachedSaGatewayInfo = null;
window.loadSaGatewayInfo = async () => {
  if (!isSuperAdmin() || !serverAuthToken || !navigator.onLine) return;
  try {
    const r = await serverFetch('/api/subscription/gateway-info');
    if (r.ok) {
      cachedSaGatewayInfo = await r.json();
      const st = $('saSubGwStatus');
      if (st) {
        if (cachedSaGatewayInfo.sslcommerzConfigured) {
          st.className = 'badge-success';
          st.textContent = cachedSaGatewayInfo.sslcommerzLive ? '🟢 SSLCommerz Live + Webhook অ্যাক্টিভ' : '🟢 SSLCommerz Sandbox + Webhook অ্যাক্টিভ';
        } else {
          st.className = 'badge-admin';
          st.textContent = '⚡ Webhook অটো-ভেরিফাই অ্যাক্টিভ (SSLCommerz ঐচ্ছিক)';
        }
      }
    }
  } catch (_) {}
};
window.copySaWebhookSecret = async () => {
  if (!isSuperAdmin() || !serverAuthToken) return toast('সুপার অ্যাডমিন সার্ভার লগইন প্রয়োজন', 'error');
  if (!cachedSaGatewayInfo?.webhookSecret) await loadSaGatewayInfo();
  if (!cachedSaGatewayInfo?.webhookSecret) return toast('ওয়েবহুক সিক্রেট লোড করা যায়নি', 'error');
  copyText(cachedSaGatewayInfo.webhookSecret, 'Payment Webhook Secret');
};
window.rotateSaWebhookSecret = async () => {
  if (!isSuperAdmin() || !serverAuthToken) return;
  if (!(await askConfirm('নতুন Webhook Secret তৈরি করলে পুরোনো সিক্রেট আর কাজ করবে না। নিশ্চিত?'))) return;
  try {
    const r = await serverFetch('/api/subscription/gateway-rotate-secret', { method: 'POST' });
    const d = await r.json();
    if (!r.ok) return toast(d.error || 'পরিবর্তন ব্যর্থ', 'error');
    if (cachedSaGatewayInfo) cachedSaGatewayInfo.webhookSecret = d.webhookSecret;
    toast('🔑 নতুন Webhook Secret তৈরি হয়েছে — কপি করে আপনার SMS Forwarder-এ দিন!');
  } catch (err) {
    toast(err.message || 'ত্রুটি', 'error');
  }
};
window.simulateAutoSubPurchase = async reqId => {
  if (!isSuperAdmin() || !serverAuthToken) return;
  const req = readSubscriptionRequests().find(x => x.id === reqId);
  if (!req) return;
  if (!(await askConfirm(`${req.name}-এর ${req.planLabel} (৳${req.price}) পেমেন্টটি গেটওয়ে ওয়েবহুক দিয়ে অটো-অ্যাক্টিভ টেস্ট করবেন?`))) return;
  try {
    const r = await serverFetch('/api/webhooks/payment/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: req.method || 'bKash',
        amount: req.price || 100,
        customerName: req.name,
        senderPhone: req.senderPhone || req.phone || '01700000000',
        trxId: req.trxId || '',
        subscriptionRequestId: req.id,
      })
    });
    const d = await r.json();
    if (!r.ok) return toast(d.error || 'টেস্ট ব্যর্থ', 'error');
    await loadSubscriptionRequests(false);
    renderAdminPanel();
    toast(d.autoActivatedSubscription ? '⚡ অটো পেমেন্ট ভেরিফাইড হয়ে ইউজারের প্ল্যান চালু হয়েছে!' : 'ওয়েবহুক পেমেন্ট যুক্ত হয়েছে!');
  } catch (err) {
    toast(err.message || 'ত্রুটি', 'error');
  }
};

if ($('subConfigForm')) $('subConfigForm').onsubmit = async e => {
  e.preventDefault(); if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error');
  const nextCfg = normalizeSubscriptionConfig({
    trialDays: num($('subTrialDays')?.value) || 7,
    payInfo: $('subPayInfo')?.value.trim() || '',
    autoActivateOnPaid: $('subAutoActivate')?.checked !== false,
    plans: {
      daily: { key: 'daily', label: 'Daily', days: 1, price: Math.max(0, num($('subPriceDaily')?.value)), enabled: $('subEnDaily')?.checked !== false },
      weekly: { key: 'weekly', label: 'Weekly', days: 7, price: Math.max(0, num($('subPriceWeekly')?.value)), enabled: $('subEnWeekly')?.checked !== false },
      monthly: { key: 'monthly', label: 'Monthly', days: 30, price: Math.max(0, num($('subPriceMonthly')?.value)), enabled: $('subEnMonthly')?.checked !== false },
      yearly: { key: 'yearly', label: 'Yearly', days: 365, price: Math.max(0, num($('subPriceYearly')?.value)), enabled: $('subEnYearly')?.checked !== false },
      lifetime: { key: 'lifetime', label: 'Lifetime', days: 0, price: Math.max(0, num($('subPriceLifetime')?.value)), enabled: $('subEnLifetime')?.checked !== false }
    }
  });
  writeSubscriptionConfig(nextCfg);
  if (serverAuthToken) {
    try {
      const r = await serverFetch('/api/subscription/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionConfig: nextCfg })
      });
      const d = await r.json();
      if (!r.ok) return toast(d.error || 'সার্ভারে প্ল্যান সেভ ব্যর্থ', 'error');
      if (d.subscriptionConfig) writeSubscriptionConfig(d.subscriptionConfig);
    } catch (_) {}
  }
  logActivity('সাবস্ক্রিপশন প্ল্যান প্রাইস ও ট্রায়াল সেটিংস আপডেট');
  applyGlobalNotice(); renderAdminPanel();
  toast('💎 সব প্ল্যান প্রাইস ও অটো-সাবস্ক্রিপশন সেটিংস সেভ হয়েছে ✅');
};
window.loadSubscriptionRequests = async (manual = false) => {
  if (!isSuperAdmin() || !serverAuthToken || !navigator.onLine) {
    renderSubscriptionRequests();
    if (manual) toast('লোকাল তালিকা রিফ্রেশ হয়েছে');
    return;
  }
  try {
    const r = await serverFetch('/api/subscription/requests');
    const d = await r.json();
    if (r.ok && Array.isArray(d.subscriptionRequests)) {
      writeSubscriptionRequests(d.subscriptionRequests);
      renderSubscriptionRequests();
      updateNotifications();
      if (manual) toast('📬 সাবস্ক্রিপশন রিকোয়েস্ট রিফ্রেশ হয়েছে ✅');
    }
  } catch (_) {}
};
function renderSubscriptionRequests() {
  const rowsEl = $('subRequestRows'), badgeEl = $('subReqPendingBadge');
  if (!rowsEl) return;
  const reqs = readSubscriptionRequests();
  const accs = readLocalAccounts();
  const pendingCount = reqs.filter(r => r.status === 'pending').length;
  if (badgeEl) { badgeEl.style.display = pendingCount ? 'inline-block' : 'none'; badgeEl.textContent = pendingCount; }
  rowsEl.innerHTML = reqs.map(r => {
    const acc = accs.find(a => a.id === r.userId || a.username === r.username);
    const curRole = acc?.role || 'user';
    const roleTag = curRole === 'admin' ? '<span class="badge-admin" style="font-size:10px">Admin</span>' : (curRole === 'staff' ? '<span class="badge-status status-running" style="font-size:10px">Staff</span>' : '<span class="badge-success" style="font-size:10px">User</span>');
    const stB = r.status === 'approved' ? '<span class="badge-success">✓ Approved</span>' : (r.status === 'rejected' ? '<span class="badge-danger">✕ Rejected</span>' : '<span class="badge-warn">⏳ Pending</span>');
    const acts = r.status === 'pending'
      ? `<button type="button" class="sm" style="background:#059669" title="সাধারণ User হিসেবে প্ল্যান অ্যাক্টিভ করুন" onclick="decideSubscriptionRequest('${esc(r.id)}','approve',false)">✓ অ্যাপ্রুভ</button><button type="button" class="sm" style="background:#4f46e5" title="পেমেন্ট ওয়েবহুক দিয়ে অটো-অ্যাক্টিভ টেস্ট" onclick="simulateAutoSubPurchase('${esc(r.id)}')">⚡ অটো টেস্ট</button><button type="button" class="sm" style="background:#0284c7" title="প্ল্যান + ফ্রি পারমিশন (User)" onclick="decideSubscriptionRequest('${esc(r.id)}','approve',true)">🆓 ফ্রি</button><button type="button" class="danger sm" onclick="decideSubscriptionRequest('${esc(r.id)}','reject',false)">✕</button>`
      : `<small class="muted">${esc(r.decidedBy === 'auto_payment_gateway' ? '⚡ Auto Paid' : (r.decidedBy === 'sslcommerz_auto' ? '💳 Online Paid' : (r.decidedBy || '')))}</small>`;
    return `<tr><td><small>${esc(r.time || '')}</small></td><td><strong>${esc(r.name)}</strong> ${roleTag}<br><small class="muted">@${esc(r.username)} · ${esc(r.senderPhone || r.phone || '—')}</small></td><td><span class="badge-admin">${esc(r.planLabel || r.planKey)}</span><br><strong>${money(r.price)}</strong></td><td><strong>${esc(r.method || '—')}</strong>${r.trxId ? `<br><code>${esc(r.trxId)}</code>` : ''}${r.note ? `<br><small class="muted">${esc(r.note)}</small>` : ''}</td><td>${stB}</td><td>${acts}</td></tr>`;
  }).join('') || `<tr><td colspan="6">কোনো সাবস্ক্রিপশন রিকোয়েস্ট নেই।</td></tr>`;
}
window.decideSubscriptionRequest = async (requestId, action = 'approve', grantBypass = false) => {
  if (!isSuperAdmin()) return;
  const label = action === 'reject' ? 'এই সাবস্ক্রিপশন রিকোয়েস্টটি বাতিল করবেন?' : (grantBypass ? 'এই ইউজারকে সাধারণ User হিসেবে ফ্রি অনুমতি সহ অ্যাক্টিভ করবেন?' : 'পেমেন্ট যাচাই করে সাধারণ User হিসেবে এই প্ল্যানটি অ্যাক্টিভ করবেন?');
  if (!(await askConfirm(label))) return;
  if (serverAuthToken && navigator.onLine) {
    try {
      const r = await serverFetch('/api/subscription/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action, grantBypass })
      });
      const d = await r.json();
      if (!r.ok) return toast(d.error || 'সিদ্ধান্ত সেভ ব্যর্থ', 'error');
      if (Array.isArray(d.subscriptionRequests)) writeSubscriptionRequests(d.subscriptionRequests);
      if (d.account?.id) {
        const accs = readLocalAccounts(), idx = accs.findIndex(a => a.id === d.account.id);
        if (idx !== -1) accs[idx] = { ...accs[idx], ...d.account };
        else accs.push(d.account);
        localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs));
      }
      logActivity(`সাবস্ক্রিপশন ${action === 'approve' ? 'অনুমোদন' : 'বাতিল'}: ${d.request?.name || requestId}`);
      triggerAccountCloudSync(); renderAdminPanel(); updateNotifications();
      toast(action === 'approve' ? '✅ প্ল্যান অ্যাক্টিভ হয়েছে (রোল: User)!' : '❌ রিকোয়েস্ট বাতিল হয়েছে', action === 'approve' ? 'success' : 'warn');
      return;
    } catch (_) {}
  }
  const reqs = readSubscriptionRequests(), rItem = reqs.find(x => x.id === requestId);
  if (!rItem) return;
  rItem.status = action === 'reject' ? 'rejected' : 'approved';
  rItem.decidedBy = activeAccount?.username || 'admin';
  rItem.decidedAt = Date.now();
  writeSubscriptionRequests(reqs);
  if (action === 'approve') {
    const accs = readLocalAccounts(), idx = accs.findIndex(a => a.id === rItem.userId);
    if (idx !== -1) {
      const planMap = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly', lifetime: 'Lifetime' };
      accs[idx].status = 'active';
      if (accs[idx].role !== 'super_admin' && accs[idx].role !== 'staff' && !accs[idx].explicitAdminRole) {
        accs[idx].role = 'user';
      }
      accs[idx].plan = planMap[rItem.planKey] || 'Monthly';
      if (rItem.planKey === 'lifetime') accs[idx].expiryDate = '';
      else {
        const base = accs[idx].expiryDate && accs[idx].expiryDate >= today() ? accs[idx].expiryDate : today();
        accs[idx].expiryDate = addDaysToDateStr(base, Math.max(1, num(rItem.days) || 30));
      }
      if (grantBypass) accs[idx].subscriptionBypass = true;
      accs[idx].updatedAt = Date.now();
      localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs));
    }
  }
  triggerAccountCloudSync(); renderAdminPanel(); updateNotifications();
  toast(action === 'approve' ? '✅ প্ল্যান অ্যাক্টিভ হয়েছে (রোল: User)!' : '❌ রিকোয়েস্ট বাতিল হয়েছে', action === 'approve' ? 'success' : 'warn');
};
if ($('saUserSearch')) $('saUserSearch').oninput = () => renderAdminPanel();
if ($('saRoleFilter')) $('saRoleFilter').onchange = () => renderAdminPanel();
if ($('saStatusFilter')) $('saStatusFilter').onchange = () => renderAdminPanel();
if ($('logSearch')) $('logSearch').oninput = () => renderAdminPanel();
if ($('saExportUsersBtn')) $('saExportUsersBtn').onclick = () => {
  if (!isSuperAdmin()) return;
  const accs = readLocalAccounts();
  const rows = [['ID', 'Name', 'Username', 'Role', 'Plan', 'Expiry', 'FreeBypass', 'Email', 'Phone', 'Status', 'LastLogin', 'Logins']];
  accs.forEach(a => rows.push(['AS-' + String(a.userNumber || 2).padStart(5, '0'), a.name, a.username, a.role, a.plan || 'Lifetime', a.expiryDate || '', a.subscriptionBypass ? 'YES' : 'NO', a.email || '', a.phone || '', isAccountExpired(a) ? 'Expired' : (a.status || 'active'), a.lastLogin || '', num(a.loginCount)]));
  downloadBlob('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), `users_${today()}.csv`, 'text/csv;charset=utf-8;');
};
if ($('exportLogsCsvBtn')) $('exportLogsCsvBtn').onclick = () => {
  if (isStaff() && getRules().blockStaffExport) return toast(L('স্টাফ এক্সপোর্ট বন্ধ আছে!', 'Staff export is disabled!'), 'error');
  const rows = [['Time', 'Activity']];
  (db.activityLogs || []).forEach(l => rows.push([l.time, l.text]));
  downloadBlob('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), `activity_logs_${today()}.csv`, 'text/csv;charset=utf-8;');
};

if ($('auRole')) $('auRole').onchange = () => { if ($('auPermsWrap')) $('auPermsWrap').style.display = $('auRole').value === 'staff' ? 'block' : 'none'; };
if ($('euRole')) $('euRole').onchange = () => { if ($('euPermsWrap')) $('euPermsWrap').style.display = $('euRole').value === 'staff' ? 'block' : 'none'; };
if ($('adminCreateUserForm')) $('adminCreateUserForm').onsubmit = e => {
  e.preventDefault(); if (!isSuperAdmin()) return toast('অনুমতি নেই!', 'error');
  const n = $('auName').value.trim(), u = $('auUsername').value.trim().toLowerCase(), ct = $('auContact').value.trim(), ps = $('auPass').value, r = $('auRole').value;
  if (!n || !u || ps.length < 6 || u === 'admin') return toast('সঠিক তথ্য দিন!', 'error');
  const accs = readLocalAccounts(); if (accs.some(a => a.username === u)) return toast('ইউজারনেম আগেই আছে!', 'error');
  const perms = r === 'staff' ? { canDelete: Boolean($('auPermDel')?.checked), canEdit: Boolean($('auPermEdit')?.checked), canPayments: Boolean($('auPermPay')?.checked), canExpenses: Boolean($('auPermExp')?.checked) } : null;
  const selPlan = $('auPlan')?.value || 'Trial';
  let selExp = $('auExpiry')?.value || '';
  if (!selExp && selPlan !== 'Lifetime') {
    const cfg = readSubscriptionConfig();
    const days = selPlan.toLowerCase() === 'trial' ? (cfg.trialDays || 7) : (cfg.plans[selPlan.toLowerCase()]?.days || 30);
    selExp = addDaysToDateStr(today(), days);
  }
  const isE = ct.includes('@'), next = Number(localStorage.getItem(NEXTUSERIDKEY) || 2), na = { id: uid(), updatedAt: Date.now(), userNumber: next, name: n, username: u, email: isE ? ct.toLowerCase() : '', phone: isE ? '' : ct, password: hashPass(ps), role: r, explicitAdminRole: r === 'admin', plan: selPlan, expiryDate: selExp, subscriptionBypass: Boolean($('auFreeBypass')?.checked), perms, status: 'active', lastLogin: 'কখনো না', loginCount: 0 };
  accs.push(na); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs)); localStorage.setItem(NEXTUSERIDKEY, String(next + 1));
  localStorage.setItem('ads_hisab_user_profile_v72_' + na.id, JSON.stringify({ name: n, email: na.email, phone: na.phone, pic: '' }));
  if (serverAuthToken) serverFetch('/api/accounts/upsert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: { ...na, plainPassword: ps } }) }).catch(() => {});
  e.target.reset(); if ($('auFreeBypass')) $('auFreeBypass').checked = false; if ($('auPermEdit')) $('auPermEdit').checked = true; if ($('auPermPay')) $('auPermPay').checked = true; if ($('auPermExp')) $('auPermExp').checked = true; if ($('auPermsWrap')) $('auPermsWrap').style.display = ($('auRole')?.value === 'staff') ? 'block' : 'none';
  ['auUsername', 'auPass'].forEach(id => { if ($(id)) { $(id).value = ''; rearmNoAutofill($(id)); } });
  logActivity(`নতুন ইউজার তৈরি: ${n} (${r} · ${selPlan}${na.subscriptionBypass ? ' · Free' : ''})`); renderAdminPanel(); triggerAccountCloudSync(); toast(`${n} তৈরি ও সিঙ্ক হয়েছে!`);
};
window.openEditUserModal = id => {
  if (!isSuperAdmin()) return; const a = readLocalAccounts().find(x => x.id === id); if (!a) return;
  $('euId').value = a.id; $('euName').value = a.name; $('euUsername').value = a.username; $('euEmail').value = a.email || ''; $('euPhone').value = a.phone || '';
  $('euRole').value = (a.role === 'staff' || a.role === 'admin' || a.role === 'user') ? a.role : 'user'; $('euStatus').value = a.status || 'active'; if ($('euPlan')) $('euPlan').value = a.plan || 'Lifetime'; if ($('euExpiry')) $('euExpiry').value = a.expiryDate || '';
  if ($('euFreeBypass')) $('euFreeBypass').checked = Boolean(a.subscriptionBypass);
  if ($('euNewPass')) { $('euNewPass').value = ''; $('euNewPass').type = 'password'; rearmNoAutofill($('euNewPass')); }
  const p = { canDelete: false, canEdit: true, canPayments: true, canExpenses: true, ...(a.perms || {}) };
  $('euPermDel').checked = Boolean(p.canDelete); $('euPermEdit').checked = Boolean(p.canEdit); $('euPermPay').checked = Boolean(p.canPayments); $('euPermExp').checked = Boolean(p.canExpenses);
  $('euPermsWrap').style.display = $('euRole').value === 'staff' ? 'block' : 'none'; $('editUserModal').style.display = 'flex';
};
if ($('editUserForm')) $('editUserForm').onsubmit = e => {
  e.preventDefault(); if (!isSuperAdmin()) return; const id = $('euId').value, accs = readLocalAccounts(), idx = accs.findIndex(a => a.id === id); if (idx === -1) return;
  const nu = $('euUsername').value.trim().toLowerCase(); if (nu === 'admin' || accs.some(a => a.id !== id && a.username === nu)) return toast('ইউজারনেম ভুল বা আগেই নেওয়া!', 'error');
  const np = $('euNewPass').value.trim(); if (np && np.length < 6) return toast('৬+ অক্ষর দিন!', 'error');
  accs[idx].name = $('euName').value.trim(); accs[idx].username = nu; accs[idx].email = $('euEmail').value.trim().toLowerCase(); accs[idx].phone = $('euPhone').value.trim();
  accs[idx].role = $('euRole').value; accs[idx].explicitAdminRole = accs[idx].role === 'admin'; accs[idx].status = $('euStatus').value; accs[idx].plan = $('euPlan')?.value || 'Lifetime'; accs[idx].expiryDate = $('euExpiry')?.value || ''; accs[idx].subscriptionBypass = Boolean($('euFreeBypass')?.checked); accs[idx].updatedAt = Date.now();
  if (np) accs[idx].password = hashPass(np);
  if (accs[idx].role === 'staff') accs[idx].perms = { canDelete: $('euPermDel').checked, canEdit: $('euPermEdit').checked, canPayments: $('euPermPay').checked, canExpenses: $('euPermExp').checked };
  else accs[idx].perms = null;
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs));
  if (serverAuthToken) serverFetch('/api/accounts/upsert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: { ...accs[idx], ...(np ? { plainPassword: np } : {}) } }) }).catch(() => {});
  if ($('euNewPass')) { $('euNewPass').value = ''; rearmNoAutofill($('euNewPass')); }
  closeModal('editUserModal'); logActivity(`ইউজার এডিট: ${accs[idx].name}`); renderAdminPanel(); triggerAccountCloudSync(); toast('আপডেট হয়েছে!');
};
if ($('clearNoticeBtn')) $('clearNoticeBtn').onclick = () => {
  if (!isSuperAdmin()) return;
  if ($('saGlobalNotice')) $('saGlobalNotice').value = '';
  const meta = readSuperAdminMeta(); meta.globalNotice = ''; writeSuperAdminMeta(meta);
  applyGlobalNotice(); triggerAccountCloudSync(); toast(L('গ্লোবাল নোটিশ মুছে ফেলা হয়েছে', 'Global notice cleared'), 'warn');
};
if ($('saveRulesForm')) $('saveRulesForm').onsubmit = e => {
  e.preventDefault(); if (!isSuperAdmin()) return;
  const meta = readSuperAdminMeta();
  const prevHidden = meta.conditions?.hiddenTabsByRole || {};
  const clearPin = Boolean($('condClearMasterPin')?.checked);
  const newPin = $('condMasterPin')?.value.trim() || '';
  const resolvedPin = clearPin ? '' : (newPin || meta.conditions?.masterPin || '');
  meta.globalNotice = $('saGlobalNotice')?.value.trim() || '';
  meta.globalNoticeType = $('saGlobalNoticeType')?.value || 'info';
  meta.globalNoticeSpeed = $('saGlobalNoticeSpeed')?.value || 'slow';
  meta.loginBanner = $('saLoginBanner')?.value.trim() || '';
  meta.conditions = {
    enable24hLock: Boolean($('cond24hLock')?.checked),
    minBillRate: num($('condMinRate')?.value),
    blockLoss: Boolean($('condBlockLoss')?.checked),
    defaultDueLimit: num($('condDueLimit')?.value),
    requireApproval: Boolean($('condRequireApproval')?.checked),
    makerChecker: Boolean($('condMakerChecker')?.checked),
    hiddenTabsByRole: prevHidden,
    blockStaffExport: Boolean($('condBlockStaffExport')?.checked),
    maintenanceMode: Boolean($('condMaintenanceMode')?.checked),
    idleLockMinutes: num($('condIdleMinutes')?.value),
    masterPin: resolvedPin,
    signupPolicy: $('condSignupPolicy')?.value || 'open'
  };
  writeSuperAdminMeta(meta);
  if ($('condMasterPin')) { $('condMasterPin').value = ''; rearmNoAutofill($('condMasterPin')); }
  if ($('condClearMasterPin')) $('condClearMasterPin').checked = false;
  applyPermissionClasses(); applyGlobalNotice(); logActivity('সুপার অ্যাডমিন রুলস ও নোটিশ আপডেট'); triggerAccountCloudSync(); renderAdminPanel(); toast('শর্তাবলি ও নোটিশ সেভ হয়েছে!');
};
window.impersonateUser = id => {
  if (!isRealSuperAdmin()) return;
  const a = readLocalAccounts().find(x => x.id === id); if (!a) return;
  if (!realSuperAdmin) realSuperAdmin = activeAccount;
  activeAccount = a;
  if ($('adminTab')) $('adminTab').style.display = (a.role === 'super_admin' || a.role === 'admin') ? 'flex' : 'none';
  applyPermissionClasses(); activateAccountData(a);
  if ($('impersonateBanner')) $('impersonateBanner').style.display = 'flex';
  if ($('impersonateName')) $('impersonateName').textContent = `${a.name} (@${a.username} · ${a.role})`;
  updateHeaderAndProfile(); goToSection('dash');
  if (typeof syncTeamRoomHello === 'function') syncTeamRoomHello();
  if (typeof checkMyWarnings === 'function') checkMyWarnings();
};
if ($('exitImpersonateBtn')) $('exitImpersonateBtn').onclick = () => {
  if (!realSuperAdmin) return;
  activeAccount = realSuperAdmin; realSuperAdmin = null;
  if ($('impersonateBanner')) $('impersonateBanner').style.display = 'none';
  if ($('adminTab')) $('adminTab').style.display = 'flex';
  applyPermissionClasses(); activateAccountData(activeAccount);
  updateHeaderAndProfile(); goToSection('adminPanel'); switchAdminSubTab('users');
  if (typeof syncTeamRoomHello === 'function') syncTeamRoomHello();
  if (typeof checkMyWarnings === 'function') checkMyWarnings();
};
window.switchAdminSubTab = tabName => {
  if (!isSuperAdmin() && ['users', 'sessions', 'rules', 'approvals', 'trash', 'cloud', 'moderation', 'guide'].includes(tabName)) tabName = 'help';
  const map = { users: ['adminTabUsersBtn', 'adminUsersSubPanel'], sessions: ['adminTabSessionsBtn', 'adminSessionsSubPanel'], rules: ['adminTabRulesBtn', 'adminRulesSubPanel'], approvals: ['adminTabApprovalsBtn', 'adminApprovalsSubPanel'], help: ['adminTabHelpBtn', 'adminHelpSubPanel'], roles: ['adminTabRolesBtn', 'adminRolesSubPanel'], trash: ['adminTabTrashBtn', 'adminTrashSubPanel'], cloud: ['adminTabCloudBtn', 'adminCloudSubPanel'], moderation: ['adminTabModBtn', 'adminModSubPanel'], logs: ['adminTabLogsBtn', 'adminLogsSubPanel'], guide: ['adminTabGuideBtn', 'adminGuideSubPanel'] };
  Object.entries(map).forEach(([k, [b, p]]) => { if ($(b)) $(b).classList.toggle('active', k === tabName); if ($(p)) $(p).style.display = k === tabName ? 'block' : 'none'; });
  if ($('adminCreateUserForm')) $('adminCreateUserForm').reset();
  if ($('auPermsWrap')) $('auPermsWrap').style.display = ($('auRole')?.value === 'staff') ? 'block' : 'none';
  ['auUsername', 'auPass', 'condMasterPin', 'csSecret'].forEach(id => { if ($(id)) { $(id).value = ''; rearmNoAutofill($(id)); } });
  if ($('condClearMasterPin')) $('condClearMasterPin').checked = false;
  if ($('saUserSearch')) $('saUserSearch').value = '';
  if ($('logSearch')) $('logSearch').value = '';
  if (tabName === 'users') loadSubscriptionRequests(false);
  if (tabName === 'sessions' && typeof loadLiveSessions === 'function') loadLiveSessions(false);
  if (tabName === 'help' && typeof loadWebhookPayments === 'function') loadWebhookPayments(false);
  if (tabName === 'cloud' && typeof refreshProdReadiness === 'function') refreshProdReadiness();
  if (tabName === 'guide' && typeof renderSuperAdminPowerGuide === 'function') renderSuperAdminPowerGuide();
  renderAdminPanel();
};
window.toggleUserAdminRole = async id => {
  if (!isSuperAdmin()) return;
  const accs = readLocalAccounts(), a = accs.find(x => x.id === id);
  if (!a || a.role === 'super_admin') return;
  const makeAdmin = a.role !== 'admin';
  const ok = await askConfirm(makeAdmin ? `${a.name} (@${a.username})-কে Admin রোল দিতে চান?` : `${a.name} (@${a.username})-কে সাধারণ User রোলে ফেরত নিতে চান?`);
  if (!ok) return;
  a.role = makeAdmin ? 'admin' : 'user';
  a.explicitAdminRole = makeAdmin;
  if (!makeAdmin) a.perms = null;
  a.updatedAt = Date.now();
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs));
  if (serverAuthToken) serverFetch('/api/accounts/upsert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: a }) }).catch(() => {});
  logActivity(`রোল পরিবর্তন: ${a.name} -> ${a.role}`);
  triggerAccountCloudSync(); renderAdminPanel();
  toast(makeAdmin ? `🛡️ ${a.name}-কে Admin করা হয়েছে!` : `👤 ${a.name} এখন সাধারণ User!`);
};
window.toggleUserStatus = id => {
  if (!isSuperAdmin()) return;
  const accs = readLocalAccounts(), a = accs.find(x => x.id === id); if (!a) return;
  const wasPending = a.status === 'pending';
  a.status = a.status === 'active' ? 'suspended' : 'active';
  if (wasPending && a.role !== 'super_admin' && a.role !== 'staff' && !a.explicitAdminRole) a.role = 'user';
  a.updatedAt = Date.now();
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs));
  if (serverAuthToken) serverFetch('/api/accounts/upsert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: a }) }).catch(() => {});
  logActivity(`${a.name} স্ট্যাটাস: ${a.status}`); triggerAccountCloudSync(); renderAdminPanel(); toast('স্ট্যাটাস আপডেট!');
};
window.deleteAccount = async id => { if (!isSuperAdmin() || !(await askConfirm('অ্যাকাউন্ট ডিলিট করবেন?'))) return; const target = readLocalAccounts().find(a => a.id === id); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(readLocalAccounts().filter(a => a.id !== id))); localStorage.removeItem('ads_hisab_user_data_v72_' + id); localStorage.removeItem('ads_hisab_user_profile_v72_' + id); if (serverAuthToken) serverFetch('/api/accounts/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {}); if (target) logActivity(`অ্যাকাউন্ট ডিলিট: ${target.name}`); triggerAccountCloudSync(); renderAdminPanel(); toast('ডিলিট হয়েছে!', 'warn'); };

function renderRoleMatrixAndTeam() {
  const mat = $('adminRoleMatrixGrid'), teamBox = $('adminTeamSummaryBox');
  if (mat) {
    const curRole = activeAccount?.id === 'legacy-super-admin' ? 'super_admin' : (activeAccount?.role || 'user');
    const roles = [
      { key: 'super_admin', badge: '<span class="badge-success">Super Admin</span>', title: 'সিস্টেম ওনার', items: ['ইউজার, প্ল্যান ও মেয়াদ + পারমিশন টেমপ্লেট ক্লোন', '🌐 লাইভ সেশন IP/ডিভাইস ট্র্যাকার ও ফোর্স লগআউট', '📱 রোল-ভিত্তিক মেনু লক + 🔐 মেকার-চেকার অ্যাপ্রুভাল', '📊 এক্সিকিউটিভ প্রফিট PDF + 🕵️ ডিপ রিস্ক অডিট', '🚨 কমিউনিটি মডারেশন, ভেরিফাইড ব্যাজ ও গ্লোবাল লকডাউন'] },
      { key: 'admin', badge: '<span class="badge-admin">Admin</span>', title: 'এজেন্সি ম্যানেজার', items: ['নিজস্ব আইসোলেটেড এজেন্সি ওয়ার্কস্পেস', 'কার্ড, ট্রেডিং, প্রফিট ও রিপোর্ট পূর্ণ অ্যাক্সেস', 'হেল্প ইনবক্স, পোর্টাল অর্ডার ও অ্যাক্টিভিটি লগ', 'গ্রাফিক্স ও পোস্টার স্টুডিও + টিম চ্যাট'] },
      { key: 'staff', badge: '<span class="badge-status status-running">Staff</span>', title: 'মিডিয়া বায়ার / টিম', items: ['শেয়ার্ড এজেন্সি ওয়ার্কস্পেসে কাজ করে', 'কার্ড খরচ ও নিট প্রফিট গোপন (.staff-hide)', 'ডিলিট / এডিট / পেমেন্ট / খরচ রোল-ভিত্তিক নিয়ন্ত্রণ', '২৪-ঘণ্টা এডিট লক, মেকার-চেকার ও লস-প্রটেকশন প্রযোজ্য'] },
      { key: 'user', badge: '<span class="badge-admin">User</span>', title: 'ইনডিপেন্ডেন্ট ইউজার', items: ['নিজস্ব আলাদা ডেটা ওয়ার্কস্পেস ও ক্লায়েন্ট লিস্ট', 'কোটেশন, ক্যাম্পেইন, পেমেন্ট, কার্ড ও রিপোর্ট', 'গ্রাফিক্স পোস্টার স্টুডিও ও ভিডিও মেকার', 'ব্যক্তিগত JSON ব্যাকআপ ও টিম চ্যাট'] }
    ];
    mat.innerHTML = roles.map(r => `<div class="role-cap-card" style="${curRole === r.key ? 'border:2px solid var(--brand);' : ''}"><h4><span>${r.title} ${curRole === r.key ? '⭐' : ''}</span>${r.badge}</h4><ul>${r.items.map(x => `<li>${x}</li>`).join('')}</ul></div>`).join('');
  }
  if (teamBox) {
    const accs = readLocalAccounts();
    const staffList = accs.filter(a => a.role === 'staff');
    teamBox.innerHTML = `<h4 style="margin:0 0 8px">👥 অ্যাক্টিভ টিম ও স্টাফ অনুমতি সারাংশ (${staffList.length} জন স্টাফ · মোট ${accs.length + 1} অ্যাকাউন্ট)</h4>` +
      (staffList.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${staffList.map(s => { const p = s.perms || {}; return `<div style="padding:8px 11px;border-radius:9px;background:var(--surface);border:1px solid var(--line);font-size:12px"><strong>${esc(s.name)}</strong> <small class="muted">(@${esc(s.username)})</small><br><small>${p.canEdit !== false ? '✏️ Edit' : '👁️ View'} · ${p.canDelete ? '🗑️ Del' : '🔒 No-Del'} · ${p.canPayments !== false ? '💰 Pay' : '🚫 Pay'} · ${p.canExpenses !== false ? '💸 Exp' : '🚫 Exp'}</small></div>`; }).join('')}</div>` : `<small class="muted">কোনো Staff অ্যাকাউন্ট এখনো যোগ করা হয়নি।</small>`);
  }
}

function renderAdminPanel() {
  updateStorageMeter(); renderPortalOrders(); renderPortalPayments(); renderRoleMatrixAndTeam();
  const pP = db.payments.filter(p => p.approvalStatus === 'pending'), pE = db.expenses.filter(e => e.approvalStatus === 'pending'), pM = (db.makerRequests || []).filter(m => m.status === 'pending'), tP = pP.length + pE.length + pM.length;
  const helps = readHelpRequests().filter(h => isSuperAdmin() || h.target !== 'Super Admin'), oc = helps.filter(h => h.status === 'open').length;
  const helpTot = oc + portalOrders.length + portalPayments.length;
  if (isSuperAdmin()) {
    const accs = readLocalAccounts(), meta = readSuperAdminMeta(), rules = getRules();
    if ($('saTotal')) $('saTotal').textContent = accs.length + 1; if ($('saAdmins')) $('saAdmins').textContent = 1 + accs.filter(a => a.role === 'admin' || a.role === 'staff' || a.role === 'super_admin').length; if ($('saUsers')) $('saUsers').textContent = accs.filter(a => a.role === 'user').length; if ($('saSuspended')) $('saSuspended').textContent = accs.filter(a => a.status === 'suspended' || a.status === 'pending' || isAccountExpired(a)).length;
    const expSoonCount = accs.filter(a => { if (!a.expiryDate || isAccountExpired(a)) return false; const d = Math.ceil((new Date(a.expiryDate) - new Date(today())) / 86400000); return d >= 0 && d <= 7; }).length;
    const totalBilledAll = db.customers.reduce((s, c) => s + billed(c.id), 0), totalDueAll = db.customers.reduce((s, c) => s + Math.max(0, billed(c.id) - paid(c.id)), 0);
    if ($('saSystemPulse')) {
      $('saSystemPulse').innerHTML = `
        <div class="sa-pulse-card" onclick="goToSection('customers')"><small>👥 মোট কাস্টমার / ক্যাম্পেইন</small><strong>${db.customers.length} / ${db.works.length}</strong></div>
        <div class="sa-pulse-card" onclick="goToSection('dues')"><small>💰 মোট বিল / বকেয়া</small><strong>${money(totalBilledAll)} <span class="bad" style="font-size:11px">(${money(totalDueAll)})</span></strong></div>
        <div class="sa-pulse-card" onclick="switchAdminSubTab('approvals')"><small>⏳ পেন্ডিং অ্যাপ্রুভাল ও অর্ডার</small><strong>${tP} অ্যাপ্রুভাল · ${helpTot} ইনবক্স</strong></div>
        <div class="sa-pulse-card" onclick="if($('saStatusFilter')){$('saStatusFilter').value='expiring';renderAdminPanel();}"><small>⏰ ৭ দিনে মেয়াদোত্তীর্ণ ও লগ</small><strong>${expSoonCount} ইউজার · ${(db.trash || []).length} ট্র্যাশ</strong></div>
      `;
    }
    if ($('saStorageBreakdown')) {
      $('saStorageBreakdown').innerHTML = `<span>👥 কাস্টমার: <strong>${db.customers.length}</strong></span><span>⚡ কাজ: <strong>${db.works.length}</strong></span><span>🎨 গ্রাফিক্স: <strong>${(db.graphicsOrders || []).length}</strong></span><span>💰 পেমেন্ট: <strong>${db.payments.length}</strong></span><span>💳 কার্ড: <strong>${db.cards.length}</strong></span><span>🗑️ ট্র্যাশ: <strong>${(db.trash || []).length}</strong></span><span>📋 লগ: <strong>${(db.activityLogs || []).length}</strong></span>`;
    }
    if ($('auCloneFrom')) {
      const prevClone = $('auCloneFrom').value;
      const cloneList = accs.filter(a => a.role === 'staff' || a.role === 'admin' || a.role === 'user');
      $('auCloneFrom').innerHTML = `<option value="">🧬 পুরোনো স্টাফ থেকে পারমিশন কপি...</option>` + cloneList.map(a => `<option value="${esc(a.id)}">${esc(a.name)} (@${esc(a.username)} · ${esc(a.role)})</option>`).join('');
      if (cloneList.some(a => a.id === prevClone)) $('auCloneFrom').value = prevClone;
    }
    if ($('saEmergencyLockdownBtn')) {
      const locked = Boolean(rules.maintenanceMode && communityState?.moderation?.feedFrozen);
      $('saEmergencyLockdownBtn').textContent = locked ? '🔓 গ্লোবাল লকডাউন খুলুন' : '🔒 জরুরি গ্লোবাল লকডাউন';
      $('saEmergencyLockdownBtn').className = locked ? 'sm' : 'warn sm';
    }
    if ($('saGlobalNotice') && document.activeElement !== $('saGlobalNotice')) $('saGlobalNotice').value = meta.globalNotice || '';
    if ($('saGlobalNoticeType') && document.activeElement !== $('saGlobalNoticeType')) $('saGlobalNoticeType').value = meta.globalNoticeType || 'info';
    if ($('saGlobalNoticeSpeed') && document.activeElement !== $('saGlobalNoticeSpeed')) $('saGlobalNoticeSpeed').value = meta.globalNoticeSpeed || 'slow';
    if ($('saLoginBanner') && document.activeElement !== $('saLoginBanner')) $('saLoginBanner').value = meta.loginBanner || '';
    if (typeof renderSaLiveUpdateAdminStatus === 'function') renderSaLiveUpdateAdminStatus();
    const subCfg = readSubscriptionConfig();
    if ($('subPriceDaily') && document.activeElement !== $('subPriceDaily')) $('subPriceDaily').value = num(subCfg.plans.daily.price);
    if ($('subPriceWeekly') && document.activeElement !== $('subPriceWeekly')) $('subPriceWeekly').value = num(subCfg.plans.weekly.price);
    if ($('subPriceMonthly') && document.activeElement !== $('subPriceMonthly')) $('subPriceMonthly').value = num(subCfg.plans.monthly.price);
    if ($('subPriceYearly') && document.activeElement !== $('subPriceYearly')) $('subPriceYearly').value = num(subCfg.plans.yearly.price);
    if ($('subPriceLifetime') && document.activeElement !== $('subPriceLifetime')) $('subPriceLifetime').value = num(subCfg.plans.lifetime.price);
    if ($('subEnDaily') && document.activeElement !== $('subEnDaily')) $('subEnDaily').checked = subCfg.plans.daily.enabled !== false;
    if ($('subEnWeekly') && document.activeElement !== $('subEnWeekly')) $('subEnWeekly').checked = subCfg.plans.weekly.enabled !== false;
    if ($('subEnMonthly') && document.activeElement !== $('subEnMonthly')) $('subEnMonthly').checked = subCfg.plans.monthly.enabled !== false;
    if ($('subEnYearly') && document.activeElement !== $('subEnYearly')) $('subEnYearly').checked = subCfg.plans.yearly.enabled !== false;
    if ($('subEnLifetime') && document.activeElement !== $('subEnLifetime')) $('subEnLifetime').checked = subCfg.plans.lifetime.enabled !== false;
    if ($('subTrialDays') && document.activeElement !== $('subTrialDays')) $('subTrialDays').value = subCfg.trialDays || 7;
    if ($('subPayInfo') && document.activeElement !== $('subPayInfo')) $('subPayInfo').value = subCfg.payInfo || '';
    if ($('subAutoActivate')) $('subAutoActivate').checked = subCfg.autoActivateOnPaid !== false;
    loadSaGatewayInfo();
    renderSubscriptionRequests();
    if ($('condSignupPolicy') && document.activeElement !== $('condSignupPolicy')) $('condSignupPolicy').value = rules.signupPolicy || 'trial7';
    if ($('condMinRate') && document.activeElement !== $('condMinRate')) $('condMinRate').value = num(rules.minBillRate);
    if ($('condDueLimit') && document.activeElement !== $('condDueLimit')) $('condDueLimit').value = num(rules.defaultDueLimit);
    if ($('condIdleMinutes') && document.activeElement !== $('condIdleMinutes')) $('condIdleMinutes').value = String(num(rules.idleLockMinutes));
    if ($('condMasterPin') && document.activeElement !== $('condMasterPin')) { $('condMasterPin').value = ''; rearmNoAutofill($('condMasterPin')); }
    if ($('condMasterPinStatus')) $('condMasterPinStatus').textContent = rules.masterPin ? '🔒 মাস্টার PIN বর্তমানে চালু আছে (সুরক্ষার জন্য গোপন রাখা হয়েছে)' : '🔓 মাস্টার PIN বর্তমানে বন্ধ আছে';
    if ($('cond24hLock')) $('cond24hLock').checked = Boolean(rules.enable24hLock);
    if ($('condBlockLoss')) $('condBlockLoss').checked = Boolean(rules.blockLoss);
    if ($('condRequireApproval')) $('condRequireApproval').checked = Boolean(rules.requireApproval);
    if ($('condMakerChecker')) $('condMakerChecker').checked = Boolean(rules.makerChecker);
    if ($('condBlockStaffExport')) $('condBlockStaffExport').checked = Boolean(rules.blockStaffExport);
    if ($('condMaintenanceMode')) $('condMaintenanceMode').checked = Boolean(rules.maintenanceMode);
    if (typeof renderRoleTabVisibilityMatrix === 'function') renderRoleTabVisibilityMatrix();
    if ($('saUserRows')) {
      const ap = readProfile(), uq = ($('saUserSearch')?.value || '').trim().toLowerCase(), rf = $('saRoleFilter')?.value || 'all', sf = $('saStatusFilter')?.value || 'all';
      const showSa = (!uq || (ap.name || 'super admin').toLowerCase().includes(uq) || 'admin'.includes(uq) || (ap.phone || '').toLowerCase().includes(uq)) && (rf === 'all' || rf === 'super_admin') && (sf === 'all' || sf === 'active');
      const saRowHtml = showSa ? `<tr><td>—</td><td>AS-00001</td><td><strong>${esc(ap.name || 'Super Admin')}</strong> <small class="muted">(@admin)</small></td><td>${esc(ap.email || '')}<br><small>${esc(ap.phone || '')}</small></td><td><span class="badge-success">Super Admin</span></td><td><small>${esc(meta.lastLogin || '')}<br>লগইন: ${num(meta.loginCount)}</small></td><td><span class="badge-success">Active</span></td><td>—</td></tr>` : '';
      const filteredAccs = accs.filter(a => {
        const exp = isAccountExpired(a), expSoon = Boolean(a.expiryDate && !a.subscriptionBypass && !exp && Math.ceil((new Date(a.expiryDate) - new Date(today())) / 86400000) <= 7);
        const stKey = a.status === 'suspended' ? 'suspended' : (a.status === 'pending' ? 'pending' : (exp ? 'expired' : 'active'));
        if (rf !== 'all' && a.role !== rf) return false;
        if (sf === 'bypass') { if (!a.subscriptionBypass) return false; }
        else if (sf === 'expiring') { if (!expSoon) return false; }
        else if (sf !== 'all' && stKey !== sf) return false;
        if (uq && !`${a.name} ${a.username} ${a.email || ''} ${a.phone || ''}`.toLowerCase().includes(uq)) return false;
        return true;
      });
      $('saUserRows').innerHTML = saRowHtml +
        filteredAccs.map(a => {
          const exp = isAccountExpired(a);
          const rB = a.role === 'super_admin' ? '<span class="badge-success">Super Admin</span>' : (a.role === 'admin' ? '<span class="badge-admin">Admin</span>' : (a.role === 'staff' ? '<span class="badge-status status-running">Staff</span>' : '<span class="badge-success">User</span>'));
          const bypassB = a.subscriptionBypass ? ' <span class="badge-success">🆓 ফ্রি অনুমতি</span>' : '';
          const roleBtn = a.role !== 'super_admin'
            ? `<button type="button" class="secondary sm" title="${a.role === 'admin' ? 'সাধারণ User করুন' : 'Admin করুন'}" onclick="toggleUserAdminRole('${a.id}')">${a.role === 'admin' ? '👤 User করুন' : '🛡️ Admin করুন'}</button>`
            : '';
          const stB = a.status === 'suspended' ? '<span class="badge-danger">Suspended</span>' : (a.status === 'pending' ? '<span class="badge-warn">Pending</span>' : (exp ? '<span class="badge-danger">🔒 মেয়াদ শেষ</span>' : (a.subscriptionBypass ? '<span class="badge-success">🆓 Free Active</span>' : '<span class="badge-success">Active</span>')));
          return `<tr><td><input type="checkbox" class="sa-user-chk row-chk" data-id="${a.id}" ${selectedUserIds.has(a.id) ? 'checked' : ''} onchange="toggleUserSelect('${a.id}',this.checked)"></td><td>AS-${String(a.userNumber || 2).padStart(5, '0')}</td><td><strong>${esc(a.name)}</strong><br><small>@${esc(a.username)}</small></td><td>${esc(a.email || '—')}<br><small>${esc(a.phone || '—')}</small></td><td>${rB}${bypassB}<br><small class="${exp ? 'bad' : 'muted'}">${esc(a.plan || 'Lifetime')} ${a.expiryDate ? `(${esc(a.expiryDate)})` : ''}</small></td><td><small>${esc(a.lastLogin || '—')}<br>মোট: ${num(a.loginCount)}</small></td><td>${stB}</td><td>${roleBtn}<button type="button" class="secondary sm" title="${a.subscriptionBypass ? 'ফ্রি অনুমতি বন্ধ করুন' : 'ফ্রি অনুমতি দিন (সাবস্ক্রিপশন ছাড়াই চলবে)'}" onclick="toggleUserBypass('${a.id}')">${a.subscriptionBypass ? '🔓' : '🆓'}</button><button type="button" class="secondary sm" title="প্রিভিউ" onclick="impersonateUser('${a.id}')">👁️</button><button type="button" class="secondary sm" title="+৩০ দিন মেয়াদ" onclick="quickExtendUser('${a.id}',30)">+৩০দি</button><button type="button" class="secondary sm" title="পাসওয়ার্ড রিসেট" onclick="quickResetUserPass('${a.id}')">🔑</button><button type="button" class="secondary sm" title="রিমোট লগআউট" onclick="forceLogoutSession('','${esc(a.username)}','${esc(a.name)}')">📤</button><button type="button" class="secondary sm" title="এডিট" onclick="openEditUserModal('${a.id}')">✏️</button><button type="button" class="warn sm" onclick="toggleUserStatus('${a.id}')">${a.status === 'active' ? 'ব্লক' : (a.status === 'pending' ? '✓ অ্যাপ্রুভ' : 'আনব্লক')}</button><button type="button" class="danger sm" onclick="deleteAccount('${a.id}')">✕</button></td></tr>`;
        }).join('') || (saRowHtml ? '' : `<tr><td colspan="8">${L('কোনো ইউজার মেলেনি', 'No matching users')}</td></tr>`);
      updateUserBulkBar();
    }
    if ($('approvalBadge')) { $('approvalBadge').style.display = tP ? 'inline-block' : 'none'; $('approvalBadge').textContent = tP; }
    if ($('makerApprovalRows')) {
      const kLabel = { rate: '📈 ডলার রেট', deposit: '💳 কার্ড ডিপোজিট', cardTransfer: '🔁 কার্ড ট্রান্সফার', cardRefund: '↩️ কার্ড রিফান্ড', walletTransfer: '💸 ওয়ালেট ট্রান্সফার' };
      $('makerApprovalRows').innerHTML = pM.map(m => `<tr><td><span class="badge-admin">${kLabel[m.kind] || m.kind}</span></td><td><small>${esc(m.date)}</small><br><strong>${esc(m.byName)}</strong> <small class="muted">(@${esc(m.byUsername)})</small></td><td>${esc(m.summary)}</td><td><strong>${esc(m.amountLabel)}</strong></td><td><button type="button" class="sm" style="background:#059669" onclick="approveMakerRequest('${m.id}')">✓ অনুমোদন</button><button type="button" class="danger sm" onclick="rejectMakerRequest('${m.id}')">✕ বাতিল</button></td></tr>`).join('') || `<tr><td colspan="5">${L('কোনো মেকার-চেকার রিকোয়েস্ট অপেক্ষমাণ নেই ✅', 'No pending maker-checker requests ✅')}</td></tr>`;
    }
    if ($('approvalRows')) $('approvalRows').innerHTML = [...pP.map(p => `<tr><td><span class="badge-success">${L('পেমেন্ট', 'Payment')}</span></td><td>${esc(p.date)}</td><td><strong>${esc(cname(p.customerId))}</strong></td><td class="good">${money(p.amount)}</td><td>${esc(p.method)}</td><td><button type="button" class="sm" style="background:#059669" onclick="approvePending('payment','${p.id}')">✓</button><button type="button" class="danger sm" onclick="rejectPending('payment','${p.id}')">✕</button></td></tr>`), ...pE.map(e => `<tr><td><span class="badge-danger">${L('খরচ', 'Expense')}</span></td><td>${esc(e.date)}</td><td><strong>${esc(e.title)}</strong></td><td class="bad">${money(e.amount)}</td><td>${esc(e.method || 'Cash')}</td><td><button type="button" class="sm" style="background:#059669" onclick="approvePending('expense','${e.id}')">✓</button><button type="button" class="danger sm" onclick="rejectPending('expense','${e.id}')">✕</button></td></tr>`)].join('') || `<tr><td colspan="6">${L('কোনো পেন্ডিং এন্ট্রি নেই ✅', 'No pending approvals ✅')}</td></tr>`;
    if ($('trashRows')) $('trashRows').innerHTML = (db.trash || []).map(t => `<tr><td><span class="badge-status status-running">${esc(t.type)}</span></td><td><strong>${esc(t.label)}</strong></td><td><small>${esc(t.deletedAt)}<br>${esc(t.deletedBy)}</small></td><td><button type="button" class="secondary sm" onclick="restoreTrash('${t.id}')">♻️</button><button type="button" class="danger sm" onclick="permDeleteTrash('${t.id}')">✕</button></td></tr>`).join('') || `<tr><td colspan="4">${L('খালি 🎉', 'Trash is empty 🎉')}</td></tr>`;
    const sc = readCloudSync(); if ($('csUrl') && document.activeElement !== $('csUrl')) $('csUrl').value = sc.url || ''; if ($('csSecret') && document.activeElement !== $('csSecret')) { $('csSecret').value = ''; $('csSecret').placeholder = sc.secret ? '🔒 গোপন সিক্রেট সেট আছে (বদলাতে নতুন লিখুন)' : 'Firebase Auth Secret (ঐচ্ছিক)'; rearmNoAutofill($('csSecret')); } if ($('csAutoSync')) $('csAutoSync').checked = Boolean(sc.autoSync); if ($('csLastSyncText')) $('csLastSyncText').textContent = sc.lastSync ? `${L('সর্বশেষ সিঙ্ক', 'Last Sync')}: ${sc.lastSync}` : '';
  }
  if ($('helpOpenBadge')) { $('helpOpenBadge').style.display = helpTot ? 'inline-block' : 'none'; $('helpOpenBadge').textContent = helpTot; }
  if ($('helpReqRows')) $('helpReqRows').innerHTML = helps.map(h => { const wa = normalizeBdPhone(h.contact); return `<tr><td><small>${esc(h.time)}</small></td><td><span class="badge-admin">${esc(h.target)}</span><br><strong>${esc(h.topic)}</strong></td><td><strong>${esc(h.name)}</strong><br><small>${esc(h.contact)}</small></td><td style="max-width:250px;white-space:normal">${esc(h.message)}</td><td>${h.status === 'resolved' ? `<span class="badge-success">${L('সমাধান', 'Resolved')}</span>` : `<span class="badge-danger">${L('অপেক্ষমাণ', 'Open')}</span>`}</td><td>${wa.length >= 11 ? `<a href="https://wa.me/${wa}" target="_blank" style="text-decoration:none"><button type="button" class="secondary sm">📲</button></a>` : ''}${isSuperAdmin() ? `<button type="button" class="warn sm" onclick="quickTempResetFromHelp('${h.id}')">🔑</button>` : ''}<button type="button" class="secondary sm" onclick="resolveHelpReq('${h.id}')">✓</button><button type="button" class="danger sm" onclick="deleteHelpReq('${h.id}')">✕</button></td></tr>`; }).join('') || `<tr><td colspan="6">${L('কোনো মেসেজ নেই', 'No messages')}</td></tr>`;
  const lq = ($('logSearch')?.value || '').trim().toLowerCase();
  const filteredLogs = (db.activityLogs || []).filter(l => !lq || `${l.time} ${l.text}`.toLowerCase().includes(lq));
  if ($('activityLogRows')) $('activityLogRows').innerHTML = filteredLogs.map(l => `<tr><td>${esc(l.time)}</td><td>${esc(l.text)}</td></tr>`).join('') || `<tr><td colspan="2">${L('লগ নেই', 'No logs')}</td></tr>`;
  if (typeof renderAdminModerationPanel === 'function') renderAdminModerationPanel();
}

// Merge & Cloud Sync
function mergeArrayById(arrA, arrB, delM) { const map = new Map(), put = it => { if (!it?.id) return; const dt = num(delM[it.id]), itT = num(it.updatedAt); if (dt > 0 && dt >= itT) return; const pv = map.get(it.id); if (!pv || itT >= num(pv.updatedAt)) map.set(it.id, it); }; (arrA || []).forEach(put); (arrB || []).forEach(put); return Array.from(map.values()); }
function mergeDbObjects(lR, rR) {
  const L = normalizeDb(lR), R = normalizeDb(rR), del = { ...L.deletedIds }; Object.entries(R.deletedIds).forEach(([k, v]) => { del[k] = Math.max(num(del[k]), num(v)); });
  const cols = ['bankAccounts', 'rates', 'rateSlabs', 'customers', 'pages', 'works', 'payments', 'trades', 'quotations', 'packages', 'cardDeposits', 'cardTransfers', 'cardRefunds', 'cardRentals', 'walletTransfers', 'recurringBills', 'tasks', 'adAccounts', 'cashAdjustments', 'cards', 'expenses', 'riskLogs', 'dailyClosings', 'creatives', 'graphicsOrders', 'leads', 'contentCalendar', 'staffAttendance', 'brandKits', 'makerRequests', 'trash', 'broadcastLogs'];
  const m = blank(); m.updatedAt = Math.max(L.updatedAt, R.updatedAt); m.deletedIds = del; m.wallets = [...new Set([...(L.wallets || []), ...(R.wallets || [])])];
  cols.forEach(c => { m[c] = mergeArrayById(L[c], R[c], del); }); m.reminderLogs = { ...R.reminderLogs, ...L.reminderLogs }; m.reminderDates = { ...R.reminderDates, ...L.reminderDates }; m.expenseBudgets = L.updatedAt >= R.updatedAt ? { ...R.expenseBudgets, ...L.expenseBudgets } : { ...L.expenseBudgets, ...R.expenseBudgets }; m.agency = L.updatedAt >= R.updatedAt ? L.agency : R.agency;
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
  return { type: 'ads_hisab_master_backup_v72', snapshotTs: Date.now(), exportedAt: new Date().toISOString(), accounts: accs, nextUserId: localStorage.getItem(NEXTUSERIDKEY) || '2', superAdminPass: localStorage.getItem(PASSKEY) || '', superAdminMeta: readSuperAdminMeta(), masterDb: normalizeDb(JSON.parse(localStorage.getItem(MASTER_DB_KEY) || '{}')), masterProfile: (() => { try { return JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_legacy-super-admin') || '{}'); } catch (e) { return {}; } })(), userDbs: uDbs, userProfiles: uPr, helpRequests: readHelpRequests() };
}
function applyMasterSnapshot(snap, preserveServerAuth = false) {
  if (!snap || snap.type !== 'ads_hisab_master_backup_v72') throw new Error('Invalid');
  if (!preserveServerAuth) {
    localStorage.setItem(ACCOUNTSKEY, JSON.stringify(Array.isArray(snap.accounts) ? snap.accounts : []));
  }
  if (snap.nextUserId) localStorage.setItem(NEXTUSERIDKEY, String(snap.nextUserId)); if (snap.superAdminPass) localStorage.setItem(PASSKEY, snap.superAdminPass);
  if (snap.superAdminMeta) writeSuperAdminMeta(snap.superAdminMeta); if (snap.masterDb) localStorage.setItem(MASTER_DB_KEY, JSON.stringify(normalizeDb(snap.masterDb)));
  if (snap.masterProfile) localStorage.setItem('ads_hisab_user_profile_v72_legacy-super-admin', JSON.stringify(snap.masterProfile));
  Object.entries(snap.userDbs || {}).forEach(([id, data]) => localStorage.setItem('ads_hisab_user_data_v72_' + id, JSON.stringify(normalizeDb(data))));
  Object.entries(snap.userProfiles || {}).forEach(([id, prof]) => localStorage.setItem('ads_hisab_user_profile_v72_' + id, JSON.stringify(prof)));
  if (Array.isArray(snap.helpRequests)) writeHelpRequests(snap.helpRequests);
  localStorage.setItem(LAST_BACKUP_KEY, today()); if (snap.snapshotTs) localStorage.setItem(LAST_CLOUD_TS_KEY, String(snap.snapshotTs));
  loadDb(); applyAgencyBranding(); applyGlobalNotice(); render(); renderAdminPanel();
  if (!preserveServerAuth && activeAccount && activeAccount.id !== 'legacy-super-admin' && !realSuperAdmin) {
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
    applyMasterSnapshot(fin, silent && Boolean(serverAuthToken)); writeCloudSync({ ...cfg, url, secret: sec, lastSync: new Date().toLocaleString('bn-BD') });
    if (dirty) { await fetch(ep, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fin) }); localStorage.removeItem(LOCAL_DIRTY_KEY); }
    setSyncUi('ok', 'Synced'); if (!silent) toast('ক্লাউড থেকে সিঙ্ক হয়েছে!'); return true;
  } catch (err) { setSyncUi('err', 'Offline'); if (!silent) toast('ক্লাউড এরর!', 'error'); return false; }
}
setInterval(() => { if (!activeAccount || !navigator.onLine) return; const cfg = readCloudSync(); if (cfg.autoSync && cfg.url && localStorage.getItem(LOCAL_DIRTY_KEY) !== '1') pullFromCloud(true, cfg.url, cfg.secret || ''); loadPortalOrders(false); }, 30000);
if ($('cloudSyncForm')) $('cloudSyncForm').onsubmit = e => { e.preventDefault(); if (!isSuperAdmin()) return; const cfg = readCloudSync(); const nextSec = $('csSecret')?.value.trim() || cfg.secret || ''; writeCloudSync({ ...cfg, url: $('csUrl').value.trim(), secret: nextSec, autoSync: $('csAutoSync').checked }); if ($('csSecret')) { $('csSecret').value = ''; $('csSecret').placeholder = nextSec ? '🔒 গোপন সিক্রেট সেট আছে (বদলাতে নতুন লিখুন)' : 'Firebase Auth Secret (ঐচ্ছিক)'; rearmNoAutofill($('csSecret')); } toast('সেভ হয়েছে!'); };
if ($('csPushBtn')) $('csPushBtn').onclick = () => { if (isSuperAdmin()) withBtnLoading($('csPushBtn'), '⏳...', () => pushToCloud(false)); };
if ($('csPullBtn')) $('csPullBtn').onclick = async () => { if (isSuperAdmin() && (await askConfirm('ক্লাউড থেকে আনবেন?'))) withBtnLoading($('csPullBtn'), '⏳...', () => pullFromCloud(false)); };
if ($('csTestBtn')) $('csTestBtn').onclick = () => {
  if (!isSuperAdmin()) return;
  const u = $('csUrl')?.value.trim() || readCloudSync().url, s = $('csSecret')?.value.trim() || readCloudSync().secret || '';
  const ep = buildCloudEndpoint(u, s); if (!ep) return toast('Firebase URL দিন!', 'error');
  withBtnLoading($('csTestBtn'), '⏳...', async () => {
    const t0 = performance.now();
    try {
      const r = await fetch(ep); if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json(), ms = Math.round(performance.now() - t0);
      toast(L(`সংযোগ সফল (${ms}ms) · ইউজার: ${(d?.accounts || []).length + 1}`, `Connected (${ms}ms) · Users: ${(d?.accounts || []).length + 1}`));
    } catch (err) { toast(`সংযোগ ব্যর্থ: ${err.message || 'Error'}`, 'error'); }
  });
};

// Export CSV & Backup
function downloadBlob(c, f, m) { const b = new Blob([c], { type: m }), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = f; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
if ($('exportCsvBtn')) $('exportCsvBtn').onclick = () => { if (isStaff() && getRules().blockStaffExport) return toast('স্টাফ এক্সপোর্ট বন্ধ আছে!', 'error'); const rows = [['Customer', 'Phone', 'USD', 'Bill', 'Paid', 'Due', 'Advance', 'Profit']]; db.customers.forEach(c => { const b = billed(c.id), p = paid(c.id), bal = p - b, cw = db.works.filter(w => w.customerId === c.id); rows.push([c.name, c.phone || '', cw.reduce((s, w) => s + num(w.actualDollar), 0).toFixed(2), b.toFixed(2), p.toFixed(2), Math.max(0, -bal).toFixed(2), Math.max(0, bal).toFixed(2), cw.reduce((s, w) => s + profit(w), 0).toFixed(2)]); }); downloadBlob('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), `customers_${today()}.csv`, 'text/csv;charset=utf-8;'); };
if ($('exportWorksCsvBtn')) $('exportWorksCsvBtn').onclick = () => { if (isStaff() && getRules().blockStaffExport) return toast('স্টাফ এক্সপোর্ট বন্ধ আছে!', 'error'); const rows = [['Date', 'Platform', 'Customer', 'Page/Asset', 'Ad Account', 'Campaign', 'Staff', 'Budget', 'Spent', 'Rate', 'ServiceFee', 'Discount', 'VAT/Tax', 'Bill', 'Cost', 'Profit', 'Results', 'Status']]; db.works.forEach(w => rows.push([w.date, w.platform || 'Meta', cname(w.customerId), pname(w.pageId), aaname(w.adAccountId), w.name, w.staffName || '', num(w.dollar), num(w.actualDollar), num(w.rate), workServiceCharge(w).toFixed(2), num(w.discount).toFixed(2), workTaxAmount(w).toFixed(2), bill(w).toFixed(2), actual(w).toFixed(2), profit(w).toFixed(2), num(w.conversions), w.status])); downloadBlob('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), `works_${today()}.csv`, 'text/csv;charset=utf-8;'); };
if ($('backupBtn')) $('backupBtn').onclick = () => { if (isStaff() && getRules().blockStaffExport) return toast('স্টাফ ব্যাকআপ এক্সপোর্ট বন্ধ আছে!', 'error'); downloadBlob(JSON.stringify(db, null, 2), `ads_hisab_backup_${today()}.json`, 'application/json'); localStorage.setItem(LAST_BACKUP_KEY, today()); checkBackupReminder(); toast('ব্যাকআপ ডাউনলোড হয়েছে!'); };
if ($('restoreFile')) $('restoreFile').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { try { const p = JSON.parse(ev.target.result); if (p?.type === 'ads_hisab_master_backup_v72') { if (!isSuperAdmin()) return toast('শুধু Super Admin!', 'error'); applyMasterSnapshot(p); } else { db = normalizeDb(p); save(); applyAgencyBranding(); } toast('রিস্টোর হয়েছে!'); } catch (err) { toast('ভুল ফাইল!', 'error'); } e.target.value = ''; }; r.readAsText(f); };
if ($('wipeBtn')) $('wipeBtn').onclick = async () => { if (!(await requireMasterPin('সব ডেটা মুছুন'))) return; if (await askConfirm('সব ডেটা মুছে ফেলবেন?')) { db = blank(); save(); applyAgencyBranding(); toast('মুছে ফেলা হয়েছে', 'warn'); } };
if ($('printBtn')) $('printBtn').onclick = () => window.print();

// Upgraded Online + Local Team Chat (Live Voice Room, Voice Notes, Moderation, Profile Links, Replies, Pins, Reactions & Media)
let refreshOnlineChat = () => {};
(function initOnlineChat() {
  const key = 'ads_manager_local_chat_v72', seenKey = 'ads_hisab_chat_seen_ts_v81';
  const list = $('chatMessages'), form = $('chatForm'), input = $('chatInput'), clearBtn = $('clearChatBtn');
  const fileIn = $('chatFile'), attBtn = $('chatAttachBtn'), attPrev = $('chatAttachPreview');
  const replyBar = $('chatReplyBar'), pinBar = $('chatPinnedBar'), pinTxt = $('chatPinnedText'), unpinBtn = $('chatUnpinBtn');
  const searchIn = $('chatSearchInput'), tagSel = $('chatTagSelect'), teamList = $('chatTeamList');
  if (!list || !form || !input) return;

  const getBaseEp = () => { const cfg = readCloudSync(), cl = String(cfg.url || '').trim().replace(/\/+$/, ''); return cl ? { cl, auth: cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '' } : null; };
  const getChatEp = (id = '') => { const b = getBaseEp(); return b ? `${b.cl}/ads_hisab_chat_v72${id ? `/${encodeURIComponent(id)}` : ''}.json${b.auth}` : ''; };

  let messages = []; try { messages = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { messages = []; }
  let activeFilter = 'all', replyTarget = null;
  let lastTypingSent = 0;

  const persistLocal = () => { try { localStorage.setItem(key, JSON.stringify(messages.slice(-150))); } catch (e) { if (messages.length > 10) { messages = messages.slice(-60); try { localStorage.setItem(key, JSON.stringify(messages)); } catch (e2) {} } } };
  const syncMsgRecord = async msg => { const ep = getChatEp(msg.id); if (ep) { try { await fetch(ep, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) }); } catch (e) {} } };
  const clearAttach = () => { pendingChatAttach = null; if (fileIn) fileIn.value = ''; if (attPrev) { attPrev.style.display = 'none'; attPrev.innerHTML = ''; } };
  const clearReply = () => { replyTarget = null; if (replyBar) { replyBar.style.display = 'none'; replyBar.innerHTML = ''; } };

  const attachFileObj = async f => {
    if (!f) return;
    try {
      if (f.type.startsWith('image/')) {
        const data = await compressImageFile(f, 800, 0.82);
        pendingChatAttach = { fileData: data, fileName: f.name || `screenshot_${Date.now()}.jpg`, fileType: 'image/jpeg' };
      } else {
        if (f.size > 450 * 1024) { clearAttach(); return toast('ফাইল ৪৫০ KB-এর কম হতে হবে!', 'error'); }
        const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
        pendingChatAttach = { fileData: data, fileName: f.name, fileType: f.type || 'application/octet-stream' };
      }
      if (attPrev) {
        attPrev.style.display = 'flex';
        attPrev.innerHTML = `<span>📎 প্রস্তুত: <strong>${esc(pendingChatAttach.fileName)}</strong></span><button type="button" class="danger sm" style="margin:0" onclick="document.getElementById('chatFile').value='';this.parentElement.style.display='none';pendingChatAttach=null">✕</button>`;
      }
    } catch (err) { toast('ফাইল লোড ত্রুটি!', 'error'); }
  };

  if (attBtn && fileIn) attBtn.onclick = () => fileIn.click();
  if (fileIn) fileIn.onchange = e => attachFileObj(e.target.files?.[0]);
  input.addEventListener('paste', e => {
    const items = e.clipboardData?.items || [];
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) {
        e.preventDefault();
        const f = it.getAsFile();
        if (f) { attachFileObj(f); toast(L('স্ক্রিনশট যুক্ত হয়েছে — পাঠান বাটনে ক্লিক করুন 📸', 'Screenshot attached — hit Send 📸')); }
        break;
      }
    }
  });
  input.addEventListener('input', () => {
    if (Date.now() - lastTypingSent < 1800) return;
    lastTypingSent = Date.now();
    if (typeof sendTeamTyping === 'function') sendTeamTyping(Boolean(input.value.trim()));
  });

  window.replyToChatMsg = id => {
    const m = messages.find(x => x.id === id); if (!m) return;
    replyTarget = { id: m.id, sender: m.sender || 'User', text: (m.text || m.fileName || (m.audioData ? '🎙️ ভয়েস মেসেজ' : 'Media')).slice(0, 80) };
    if (replyBar) {
      replyBar.style.display = 'flex';
      replyBar.innerHTML = `<span>↩️ উত্তর: <strong>${esc(replyTarget.sender)}</strong> — "${esc(replyTarget.text)}"</span><button type="button" class="secondary sm" style="margin:0;padding:2px 6px" onclick="window._clearChatReply()">✕</button>`;
    }
    input.focus();
  };
  window._clearChatReply = clearReply;

  window.togglePinChatMsg = async id => {
    const m = messages.find(x => x.id === id); if (!m) return;
    const nextPin = !m.pinned;
    if (nextPin) messages.forEach(x => { if (x.pinned && x.id !== id) { x.pinned = false; syncMsgRecord(x); } });
    m.pinned = nextPin;
    persistLocal(); draw();
    if (typeof postCommunityAction === 'function') await postCommunityAction({ action: 'pin_chat', msgId: id });
    await syncMsgRecord(m);
    toast(nextPin ? L('মেসেজ পিন করা হয়েছে 📌', 'Message pinned 📌') : L('পিন সরানো হয়েছে', 'Unpinned'));
  };

  window.reactChatMsg = async (id, emoji) => {
    const m = messages.find(x => x.id === id); if (!m) return;
    const me = (activeAccount?.username || activeAccount?.name || 'user').toLowerCase();
    m.reactions = m.reactions && typeof m.reactions === 'object' ? m.reactions : {};
    const arr = Array.isArray(m.reactions[emoji]) ? m.reactions[emoji] : [];
    m.reactions[emoji] = arr.includes(me) ? arr.filter(u => u !== me) : [...arr, me];
    if (!m.reactions[emoji].length) delete m.reactions[emoji];
    persistLocal(); draw();
    if (typeof postCommunityAction === 'function') await postCommunityAction({ action: 'react_chat', msgId: id, emoji });
    await syncMsgRecord(m);
  };

  window.deleteChatMsg = async id => {
    const m = messages.find(x => x.id === id); if (!m) return;
    const me = (activeAccount?.username || '').toLowerCase();
    if (!isSuperAdmin() && m.username && m.username.toLowerCase() !== me) return toast(L('শুধু নিজের মেসেজ ডিলিট করতে পারবেন!', 'You can only delete your own messages!'), 'error');
    if (!(await askConfirm(L('মেসেজটি ডিলিট করবেন?', 'Delete this message?')))) return;
    messages = messages.filter(x => x.id !== id);
    persistLocal(); draw();
    if (typeof postCommunityAction === 'function') await postCommunityAction({ action: 'delete_chat', msgId: id });
    const ep = getChatEp(id); if (ep) { try { await fetch(ep, { method: 'DELETE' }); } catch (e) {} }
    toast(L('মেসেজ ডিলিট হয়েছে', 'Message deleted'), 'warn');
  };

  window.quickSendChatReply = txt => {
    if (!txt) return;
    input.value = txt;
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  };

  window.submitChatPayload = async ({ text = '', tag = '', attach = null, audioData = '', audioMime = '', audioDuration = 0 }) => {
    const me = activeAccount?.username ? String(activeAccount.username).toLowerCase() : 'user';
    if (typeof getActiveMuteInfo === 'function') {
      const mInfo = getActiveMuteInfo(me);
      if (mInfo && !isSuperAdmin()) {
        toast(`🔇 আপনি মিউট আছেন: ${mInfo.reason || 'সুপার অ্যাডমিন কর্তৃক'}`, 'error');
        return false;
      }
    }
    if (text && typeof findClientBadWord === 'function') {
      const bad = findClientBadWord(text);
      if (bad && !isSuperAdmin()) {
        if (typeof postCommunityAction === 'function') {
          await postCommunityAction({ action: 'send_chat', id: uid(), text, tag });
        } else {
          toast('⚠️ অশালীন/বাজে শব্দ ব্যবহার নিষিদ্ধ! অনুগ্রহ করে শালীন ভাষা ব্যবহার করুন।', 'error');
        }
        return false;
      }
    }
    const msgId = uid();
    const msgObj = {
      id: msgId,
      sender: readProfile().name || activeAccount?.name || 'User',
      role: activeAccount?.id === 'legacy-super-admin' ? 'super_admin' : (activeAccount?.role || 'user'),
      username: me,
      authorId: activeAccount?.id || me,
      text,
      tag,
      replyTo: replyTarget || null,
      pinned: false,
      reactions: {},
      audioData: audioData || undefined,
      audioMime: audioMime || undefined,
      audioDuration: audioDuration || undefined,
      time: new Date().toLocaleString('bn-BD'),
      ts: Date.now(),
      ...(attach || {})
    };
    if (typeof postCommunityAction === 'function') {
      const res = await postCommunityAction({
        action: 'send_chat',
        id: msgId,
        text,
        tag,
        replyTo: msgObj.replyTo,
        ...(attach || {}),
        audioData,
        audioMime,
        audioDuration
      });
      if (!res.ok && res.serverError) return false;
      if (res.ok && res.data?.community?.chat) {
        messages = res.data.community.chat;
        persistLocal();
        clearReply();
        draw();
        await syncMsgRecord(msgObj);
        return true;
      }
    }
    messages.push(msgObj); persistLocal();
    clearReply(); draw();
    await syncMsgRecord(msgObj);
    return true;
  };

  document.querySelectorAll('#chatFilterPills button').forEach(btn => {
    btn.onclick = () => {
      activeFilter = btn.dataset.chatFilter || 'all';
      document.querySelectorAll('#chatFilterPills button').forEach(b => b.classList.toggle('active', b === btn));
      draw();
    };
  });
  if (searchIn) searchIn.oninput = () => draw();
  if (unpinBtn) unpinBtn.onclick = async () => {
    const p = messages.find(x => x.pinned);
    if (p) await window.togglePinChatMsg(p.id);
  };

  const renderTeamRoster = () => {
    if (!teamList) return;
    const accs = readLocalAccounts().filter(a => a.status !== 'suspended');
    const peers = typeof getTeamPeersSnapshot === 'function' ? getTeamPeersSnapshot() : [];
    const onlineSet = new Set(peers.map(p => String(p.username || '').toLowerCase()).filter(Boolean));
    const voiceSet = new Set(peers.filter(p => p.inVoice).map(p => String(p.username || '').toLowerCase()).filter(Boolean));
    const items = [{ name: 'Super Admin', username: 'admin', role: 'super_admin' }, ...accs.map(a => ({ name: a.name, username: a.username, role: a.role }))];
    if ($('chatOnlineStatusText')) {
      $('chatOnlineStatusText').textContent = peers.length ? `🟢 ${peers.length} জন অনলাইন · ${voiceSet.size} জন ভয়েস রুমে` : 'অটো সিঙ্ক চালু';
    }
    teamList.innerHTML = items.slice(0, 18).map(u => {
      const uname = String(u.username || '').toLowerCase();
      const on = onlineSet.has(uname);
      const inv = voiceSet.has(uname);
      return `<div class="chat-member-item" style="cursor:pointer" onclick="openPublicProfile('${esc(uname)}','${esc(u.name)}','${esc(u.role)}')" title="ক্লিক করে প্রোফাইল দেখুন">
        <span>${on ? '🟢' : '👤'} <strong>${esc(u.name)}</strong>${inv ? ' 🔊' : ''}</span>
        <span class="badge-admin" style="font-size:9.5px">${esc(u.role === 'super_admin' ? 'Owner' : u.role)}</span>
      </div>`;
    }).join('');
  };

  const syncCommFolderBadge = () => {
    const fb = $('commFolderBadge'); if (!fb) return;
    const fCnt = $('feedUnreadBadge')?.style.display !== 'none' ? num($('feedUnreadBadge')?.textContent) : 0;
    const cCnt = $('chatUnreadBadge')?.style.display !== 'none' ? num($('chatUnreadBadge')?.textContent) : 0;
    const tot = fCnt + cCnt;
    fb.style.display = tot > 0 ? 'inline-block' : 'none';
    fb.textContent = tot;
  };
  const updateUnreadBadge = () => {
    const badge = $('chatUnreadBadge'); if (!badge) return;
    const isChatOpen = $('liveChat')?.classList.contains('active');
    const me = (activeAccount?.username || '').toLowerCase();
    const latestTs = messages.reduce((mx, m) => Math.max(mx, num(m.ts)), 0);
    if (isChatOpen) {
      if (latestTs) localStorage.setItem(seenKey, String(latestTs));
      badge.style.display = 'none';
      syncCommFolderBadge();
      return;
    }
    const seenTs = num(localStorage.getItem(seenKey));
    const unread = messages.filter(m => num(m.ts) > seenTs && (!m.username || m.username.toLowerCase() !== me)).length;
    badge.style.display = unread > 0 ? 'inline-block' : 'none';
    badge.textContent = unread;
    syncCommFolderBadge();
  };

  const draw = () => {
    const ep = getChatEp();
    const wsOk = typeof isTeamRoomConnected === 'function' && isTeamRoomConnected();
    if ($('chatModeBadge')) {
      $('chatModeBadge').textContent = wsOk ? '🟢 Live Team Room' : (ep ? '🟢 Cloud Sync' : '🟡 Local Mode');
      $('chatModeBadge').className = (wsOk || ep) ? 'badge-success' : 'badge-status status-running';
    }
    renderTeamRoster();

    const pinned = messages.find(m => m.pinned);
    if (pinBar && pinTxt) {
      if (pinned) { pinBar.style.display = 'flex'; pinTxt.innerHTML = `📌 <strong>${esc(pinned.sender || 'Admin')}:</strong> ${esc(pinned.text || pinned.fileName || (pinned.audioData ? '🎙️ ভয়েস মেসেজ' : ''))}`; }
      else pinBar.style.display = 'none';
    }

    const me = (activeAccount?.username || '').toLowerCase(), q = (searchIn?.value || '').trim().toLowerCase();
    const filtered = messages.filter(m => {
      if (activeFilter === 'pinned' && !m.pinned) return false;
      if (activeFilter === 'voice' && !m.audioData) return false;
      if (activeFilter === 'media' && !m.fileData) return false;
      if (activeFilter === 'urgent' && !String(m.tag || '').includes('জরুরি') && !String(m.tag || '').includes('পেমেন্ট')) return false;
      if (q && !`${m.sender || ''} ${m.text || ''} ${m.fileName || ''} ${m.tag || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });

    list.innerHTML = (!filtered.length ? '<div class="chat-msg">টিমের সবাই এখানে মেসেজ, ভয়েস নোট (🎙️), স্ক্রিনশট পাঠাতে এবং লাইভ ভয়েস রুমে সরাসরি কথা বলতে পারবেন।<small>System · প্রস্তুত</small></div>' : '') +
      filtered.map(m => {
        const mUser = String(m.username || '').toLowerCase();
        const isMine = (!mUser && !me) || (mUser && mUser === me);
        let mediaHtml = '';
        if (m.fileData) {
          if (String(m.fileType || '').startsWith('image/')) mediaHtml = `<img src="${m.fileData}" class="chat-img" onclick="openLightbox(this.src)" alt="Image"><a href="${m.fileData}" download="${esc(m.fileName || 'image.jpg')}" style="font-size:11px;color:inherit;display:inline-block;margin-top:3px">⬇ ডাউনলোড</a>`;
          else mediaHtml = `<a href="${m.fileData}" download="${esc(m.fileName || 'file')}" class="chat-file-pill">📄 ${esc(m.fileName || 'File')} ⬇</a>`;
        }
        let audioHtml = '';
        if (m.audioData) {
          const durStr = m.audioDuration ? ` · ${Math.max(1, Math.round(m.audioDuration))}s` : '';
          audioHtml = `<div class="chat-audio-wrap"><audio controls preload="metadata" src="${esc(m.audioData)}"></audio><small style="opacity:.8">🎙️ ভয়েস মেসেজ${durStr}</small></div>`;
        }
        const quoteHtml = m.replyTo ? `<div class="chat-quote">↩️ <strong>${esc(m.replyTo.sender)}:</strong> ${esc(m.replyTo.text)}</div>` : '';
        const tagHtml = m.tag ? `<span class="chat-tag-pill">${esc(m.tag)}</span>` : '';
        const reacts = Object.entries(m.reactions || {}).map(([em, users]) => `<span class="chat-react-pill" onclick="reactChatMsg('${esc(m.id)}','${em}')">${em} ${Array.isArray(users) ? users.length : 1}</span>`).join('');
        const canDel = isSuperAdmin() || isMine;
        const safeSnippet = esc((m.text || m.fileName || 'Voice Note').slice(0, 100));
        return `<div class="chat-msg ${isMine ? 'mine' : ''}">
          <div class="chat-msg-head"><span class="chat-author-link" onclick="openPublicProfile('${esc(mUser)}','${esc(m.sender || 'User')}','${esc(m.role || 'user')}')" title="প্রোফাইল দেখুন">${esc(m.sender || 'User')} <span style="opacity:.7;font-weight:500">(${esc(m.role || 'user')})</span></span>${tagHtml}${m.pinned ? '<span class="chat-tag-pill">📌</span>' : ''}</div>
          ${quoteHtml}
          ${m.text ? `<div>${esc(m.text)}</div>` : ''}
          ${audioHtml}
          ${mediaHtml}
          <div class="chat-actions">
            ${reacts}
            <button type="button" title="উত্তর" onclick="replyToChatMsg('${esc(m.id)}')">↩️</button>
            <button type="button" title="লাইক" onclick="reactChatMsg('${esc(m.id)}','👍')">👍</button>
            <button type="button" title="ডান" onclick="reactChatMsg('${esc(m.id)}','✅')">✅</button>
            <button type="button" title="পিন" onclick="togglePinChatMsg('${esc(m.id)}')">📌</button>
            ${!isMine ? `<button type="button" title="রিপোর্ট" onclick="reportCommunityItem('chat','','','${esc(m.id)}','${esc(mUser)}','${esc(m.sender || 'User')}','${safeSnippet}')">🚩</button>` : ''}
            ${isSuperAdmin() && !isMine && mUser && mUser !== 'admin' ? `<button type="button" title="সতর্ক / কন্ট্রোল" onclick="openPublicProfile('${esc(mUser)}','${esc(m.sender || 'User')}','${esc(m.role || 'user')}')">⚠️</button>` : ''}
            ${canDel ? `<button type="button" title="ডিলিট" onclick="deleteChatMsg('${esc(m.id)}')">🗑️</button>` : ''}
          </div>
          <small>${esc(m.time)}</small>
        </div>`;
      }).join('');
    list.scrollTop = list.scrollHeight;
    updateUnreadBadge();
  };

  refreshOnlineChat = async () => {
    const serverChat = window.__communityStateRef?.chat;
    if (Array.isArray(serverChat) && serverChat.length) {
      messages = serverChat.slice(-150);
      persistLocal();
    }
    const ep = getChatEp();
    if (ep) {
      try {
        const res = await fetch(ep);
        if (res.ok) {
          const d = await res.json();
          if (d && typeof d === 'object') {
            const fbMsgs = Object.entries(d).map(([k, v]) => (v && typeof v === 'object' ? { id: v.id || k, ...v } : null)).filter(x => x && (x.text || x.fileData || x.audioData));
            const byId = new Map();
            [...messages, ...fbMsgs].forEach(m => { if (m?.id) byId.set(m.id, m); });
            messages = Array.from(byId.values()).sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(-150);
            persistLocal();
          }
        }
      } catch (e) {}
    }
    draw();
  };
  window.__redrawTeamChat = () => {
    if (Array.isArray(window.__communityStateRef?.chat)) {
      messages = window.__communityStateRef.chat.slice(-150);
      persistLocal();
    }
    draw();
  };
  draw();
  if ($('chatRefreshBtn')) $('chatRefreshBtn').onclick = () => { if (typeof loadCommunityState === 'function') loadCommunityState(true); else refreshOnlineChat(); };
  setInterval(() => { if (activeAccount) refreshOnlineChat(); }, 10000);

  form.addEventListener('submit', async e => {
    e.preventDefault(); const value = input.value.trim();
    if (!value && !pendingChatAttach) return;
    const ok = await window.submitChatPayload({ text: value, tag: tagSel?.value || '', attach: pendingChatAttach });
    if (ok) {
      input.value = ''; if (tagSel) tagSel.value = ''; clearAttach();
      if (typeof sendTeamTyping === 'function') sendTeamTyping(false);
    }
  });

  if (clearBtn) clearBtn.onclick = async () => {
    if (!isSuperAdmin() || !(await askConfirm('সব চ্যাট মুছবেন?'))) return;
    messages = []; localStorage.setItem(key, '[]');
    if (typeof postCommunityAction === 'function') await postCommunityAction({ action: 'clear_chat' });
    const ep = getChatEp(); if (ep) { try { await fetch(ep, { method: 'DELETE' }); } catch (err) {} }
    draw(); toast('পরিষ্কার হয়েছে', 'warn');
  };
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
    const totReach = num(d.totalReach || (d.works || []).reduce((s, w) => s + num(w.reach), 0));
    const totClicks = num(d.totalClicks || (d.works || []).reduce((s, w) => s + num(w.clicks), 0));
    const totResults = num(d.totalResults || (d.works || []).reduce((s, w) => s + num(w.results), 0));
    const totSpent = (d.works || []).reduce((s, w) => s + num(w.spentUsd), 0);
    const totRev = num(d.totalRevenue || (d.works || []).reduce((s, w) => s + num(w.revenue), 0));
    const avgCpr = totResults > 0 ? usd(totSpent / totResults) : '—';
    const roasVal = (totRev > 0 && num(d.totalBill) > 0) ? (totRev / num(d.totalBill)).toFixed(2) + 'x' : '—';
    window.portalQuickWorkRequest = async (action, idx) => {
      const w = (d.works || [])[idx]; if (!w) return;
      let extraUsd = 0, reqTitle = '', reqNote = '';
      if (action === 'topup') {
        const inp = await askPrompt(`"${w.name}" ক্যাম্পেইনে আর কত ডলার ($) বাজেট বাড়াতে চান?`, '10', 'বাজেট টপ-আপ', { type: 'number' });
        if (inp === null) return;
        extraUsd = num(inp); if (extraUsd <= 0) return toast('সঠিক ডলার ($) দিন!', 'error');
        reqTitle = `[Top-Up +$${extraUsd.toFixed(2)}] ${w.name}`;
        reqNote = `Client Portal Quick Budget Top-up (+$${extraUsd.toFixed(2)}) for campaign: ${w.name}`;
      } else {
        if (!(await askConfirm(`"${w.name}" ক্যাম্পেইনটি পজ (Pause) করার রিকোয়েস্ট পাঠাবেন?`))) return;
        reqTitle = `[PAUSE Request] ${w.name}`;
        reqNote = `Client Portal Quick Pause request for campaign: ${w.name}`;
      }
      const ordEp = `${clean}/ads_hisab_portal_orders.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '');
      try {
        const r = await fetch(ordEp, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId: d.customerId || '', customerName: d.customerName, phone: d.customerPhone || '', platform: w.platform || 'Meta', campName: reqTitle, budget: extraUsd, days: 3, note: reqNote, time: new Date().toLocaleString('bn-BD') }) });
        if (!r.ok) throw new Error('Failed');
        toast(action === 'topup' ? 'বাজেট বাড়ানোর রিকোয়েস্ট এজেন্সির কাছে পাঠানো হয়েছে ✅' : 'ক্যাম্পেইন পজ করার রিকোয়েস্ট পাঠানো হয়েছে ✅');
      } catch (err) { toast('রিকোয়েস্ট পাঠাতে সমস্যা হয়েছে!', 'error'); }
    };
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
      <div class="metrics-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:14px">
        <div class="metric-card m1" style="padding:12px"><small>👁️ Total Reach</small><strong>${totReach.toLocaleString()}</strong></div>
        <div class="metric-card m2" style="padding:12px"><small>🖱️ Total Clicks</small><strong>${totClicks.toLocaleString()}</strong></div>
        <div class="metric-card m3" style="padding:12px"><small>🎯 Results / CPR</small><strong>${totResults.toLocaleString()}</strong><span class="trend">Avg CPR: ${avgCpr}</span></div>
        ${totRev > 0 ? `<div class="metric-card m1" style="padding:12px"><small>📈 Revenue / ROAS</small><strong>${roasVal}</strong><span class="trend">Sales: ${money(totRev)}</span></div>` : ''}
      </div>
      <div style="margin-bottom:14px">${balTxt}</div>
      ${(d.payInfo || d.qrUrl) ? `<div style="padding:12px;background:var(--soft);border:1px solid var(--line);border-radius:10px;font-size:13px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><strong>💳 পেমেন্ট মাধ্যম:</strong><br>${esc(d.payInfo || '')}</div>${d.qrUrl ? `<img src="${esc(d.qrUrl)}" alt="Payment QR" style="width:92px;height:92px;object-fit:contain;border-radius:8px;border:1px solid var(--line);background:#fff;cursor:pointer" onclick="openLightbox('${esc(d.qrUrl).replace(/'/g, "\\'")}')">` : ''}</div>` : ''}
      <h3>⚡ ক্যাম্পেইন ও রেজাল্টসমূহ (${(d.works || []).length})</h3>
      <div class="tablewrap" style="margin-bottom:18px"><table><thead><tr><th>তারিখ</th><th>প্ল্যাটফর্ম ও ক্যাম্পেইন</th><th>ব্যবহৃত $</th><th>মোট বিল</th><th>Reach / Clicks / Results</th><th>স্ট্যাটাস</th><th>দ্রুত অ্যাকশন</th></tr></thead><tbody>${(d.works || []).map((w, idx) => `<tr><td>${esc(w.date)}</td><td>${platformBadge(w.platform)} <strong>${esc(w.name)}</strong><br><small class="muted">${esc(w.page || '')}</small></td><td>${usd(w.spentUsd)}${num(w.refundedUsd) > 0 ? `<br><span class="badge-warn" style="font-size:10px">↩️ -${usd(w.refundedUsd)}</span>` : ''}</td><td>${money(w.bill)}</td><td><small>R: ${num(w.reach).toLocaleString()} · C: ${num(w.clicks).toLocaleString()} · <strong>Res: ${num(w.results)}</strong></small></td><td>${esc(w.status)}</td><td><div style="display:flex;gap:4px;flex-wrap:wrap"><button type="button" class="secondary sm" onclick="portalQuickWorkRequest('topup', ${idx})">+বাজেট</button><button type="button" class="warn sm" onclick="portalQuickWorkRequest('pause', ${idx})">⏸ পজ</button></div></td></tr>`).join('') || '<tr><td colspan="7">কোনো কাজ নেই</td></tr>'}</tbody></table></div>
      <h3>💰 পেমেন্ট হিস্ট্রি (${(d.payments || []).length})</h3>
      <div class="tablewrap" style="margin-bottom:20px"><table><thead><tr><th>তারিখ</th><th>পরিমাণ</th><th>মাধ্যম</th><th>রেফারেন্স ও স্ট্যাটাস</th></tr></thead><tbody>${(d.payments || []).map(p => `<tr><td>${esc(p.date)}</td><td class="good">${money(p.amount)}</td><td>${esc(p.method)}</td><td>${esc(p.ref || '—')} <span class="badge-success" style="font-size:10px">✓ Verified</span></td></tr>`).join('') || '<tr><td colspan="4">কোনো পেমেন্ট নেই</td></tr>'}</tbody></table></div>
      <div class="grid" style="margin-bottom:0">
        <div class="card-add-box" style="margin:0">
          <h3 style="margin:0 0 10px">💳 পেমেন্ট / TrxID জমা দিন</h3>
          <form id="portalPayForm">
            <div class="grid"><div class="field"><label>পরিমাণ (৳) *</label><input id="ppAmount" type="number" min="1" step=".01" required placeholder="5000"></div><div class="field"><label>মাধ্যম *</label><select id="ppMethod"><option>bKash</option><option>Nagad</option><option>Bank</option>${Array.isArray(d.bankAccounts) && d.bankAccounts.length ? `<optgroup label="🏦 ব্যাংক অ্যাকাউন্ট">${d.bankAccounts.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('')}</optgroup>` : ''}<option>Rocket</option><option>Cash</option></select></div></div>
            <div class="field"><label>TrxID / রেফারেন্স *</label><input id="ppTrxId" required placeholder="যেমন: 9GH4K2LP10"></div>
            <div class="field"><label>পেমেন্ট স্লিপ / স্ক্রিনশট (ঐচ্ছিক)</label><input id="ppScreenshotFile" type="file" accept="image/*" style="padding:5px"></div>
            <div class="field"><label>নোট (ঐচ্ছিক)</label><input id="ppNote" placeholder="সেলার নাম্বারের শেষ ৪ সংখ্যা"></div>
            <button type="submit" style="background:#059669">💳 পেমেন্ট ক্লেইম পাঠান</button>
          </form>
        </div>
        <div class="card-add-box" style="margin:0">
          <h3 style="margin:0 0 10px">🔄 নতুন ক্যাম্পেইন অর্ডার / রিনিউ রিকোয়েস্ট পাঠান</h3>
          <form id="portalOrderForm">
            <div class="grid"><div class="field"><label>অ্যাড প্ল্যাটফর্ম *</label><select id="poPlatform"><option value="Meta">Meta / Facebook Ads</option><option value="Google">Google Ads</option><option value="YouTube">YouTube Ads</option><option value="TikTok">TikTok Ads</option></select></div><div class="field"><label>ক্যাম্পেইনের নাম / পোস্ট *</label><input id="poCampName" required placeholder="যেমন: নতুন অফার বুস্টিং"></div><div class="field"><label>বাজেট ($) *</label><input id="poBudget" type="number" min="1" step=".01" required value="20"></div><div class="field"><label>কত দিন? *</label><input id="poDays" type="number" min="1" required value="7"></div></div>
            <div class="field"><label>টার্গেটিং / বিশেষ নির্দেশনা</label><input id="poNote" placeholder="লোকেশন, বয়স বা পোস্ট/ভিডিও লিংক দিন"></div>
            <button type="submit">📩 অর্ডার রিকোয়েস্ট পাঠান</button>
          </form>
        </div>
      </div>`;
    if ($('portalPayForm')) $('portalPayForm').onsubmit = async e => {
      e.preventDefault();
      const payEp = `${clean}/ads_hisab_portal_payments.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '');
      let screenshotData = '';
      const fileEl = $('ppScreenshotFile');
      if (fileEl?.files?.[0]) {
        try { screenshotData = await compressImageFile(fileEl.files[0], 780, 0.78); } catch (_) {}
      }
      try {
        const r = await fetch(payEp, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId: d.customerId || '', customerName: d.customerName, phone: d.customerPhone || '', amount: num($('ppAmount').value), method: $('ppMethod')?.value || 'bKash', trxId: $('ppTrxId').value.trim(), note: $('ppNote').value.trim(), screenshotData, time: new Date().toLocaleString('bn-BD') }) });
        if (!r.ok) throw new Error('Failed');
        e.target.reset(); toast('আপনার পেমেন্ট TrxID ও স্ক্রিনশট এজেন্সির কাছে পাঠানো হয়েছে! অ্যাপ্রুভ হলে ব্যালেন্স আপডেট হবে।');
      } catch (err) { toast('পেমেন্ট তথ্য পাঠাতে সমস্যা হয়েছে!', 'error'); }
    };
    if ($('portalOrderForm')) $('portalOrderForm').onsubmit = async e => {
      e.preventDefault();
      const ordEp = `${clean}/ads_hisab_portal_orders.json` + (cfg.secret ? `?auth=${encodeURIComponent(cfg.secret)}` : '');
      try {
        const r = await fetch(ordEp, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId: d.customerId || '', customerName: d.customerName, phone: d.customerPhone || '', platform: $('poPlatform')?.value || 'Meta', campName: $('poCampName').value.trim(), budget: num($('poBudget').value), days: num($('poDays').value), note: $('poNote').value.trim(), time: new Date().toLocaleString('bn-BD') }) });
        if (!r.ok) throw new Error('Failed');
        e.target.reset(); toast('আপনার অর্ডার রিকোয়েস্টটি এজেন্সির কাছে পাঠানো হয়েছে!');
      } catch (err) { toast('রিকোয়েস্ট পাঠাতে সমস্যা হয়েছে!', 'error'); }
    };
  } catch (err) { $('portalBody').innerHTML = `<h3 style="color:var(--danger)">দুঃখিত, এই ক্লায়েন্ট পোর্টাল লিংকটি পাওয়া যায়নি বা মেয়াদ শেষ হয়েছে।</h3>`; }
  return true;
}

// Graphics Poster Studio & Design Orders Hub
const gfxStudioState = {
  w: 1080,
  h: 1080,
  prodImg: null,
  bgImg: null,
  logoImg: null,
  logoSrc: ''
};

function loadGfxImageFile(inputEl, prop) {
  if (!inputEl) return;
  inputEl.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (!f) { gfxStudioState[prop] = null; renderGfxPoster(); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        gfxStudioState[prop] = img;
        renderGfxPoster();
        toast(L('ছবি পোস্টারে যুক্ত হয়েছে!', 'Image loaded onto canvas!'));
      };
      img.onerror = () => toast(L('ছবি লোড করা যায়নি!', 'Failed to load image!'), 'error');
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f);
  });
}
loadGfxImageFile($('gfxProdFile'), 'prodImg');
loadGfxImageFile($('gfxBgFile'), 'bgImg');

function drawRoundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawCoverImage(ctx, img, x, y, w, h) {
  const ir = img.width / img.height, br = w / h;
  let dw = w, dh = h, dx = x, dy = y;
  if (ir > br) { dh = h; dw = h * ir; dx = x - (dw - w) / 2; }
  else { dw = w; dh = w / ir; dy = y - (dh - h) / 2; }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawContainImage(ctx, img, x, y, w, h) {
  const ir = img.width / img.height, br = w / h;
  let dw = w, dh = h;
  if (ir > br) { dw = w; dh = w / ir; } else { dh = h; dw = h * ir; }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function wrapCanvasLines(ctx, text, maxW) {
  const lines = [];
  String(text || '').split(/\r?\n/).forEach(para => {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); return; }
    let cur = '';
    words.forEach(word => {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = word; }
      else cur = test;
    });
    if (cur) lines.push(cur);
  });
  return lines;
}

function hexLuminance(hex) {
  const m = String(hex || '').replace('#', '');
  if (m.length !== 6) return 0;
  const r = parseInt(m.slice(0, 2), 16) / 255, g = parseInt(m.slice(2, 4), 16) / 255, b = parseInt(m.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

window.setGfxCanvasSize = (w, h, btn) => {
  gfxStudioState.w = Number(w) || 1080;
  gfxStudioState.h = Number(h) || 1080;
  document.querySelectorAll('#gfxSizePills button').forEach(b => b.classList.toggle('active', b === btn));
  const c = $('gfxCanvas');
  if (c) { c.width = gfxStudioState.w; c.height = gfxStudioState.h; }
  if ($('gfxDimBadge')) $('gfxDimBadge').textContent = `${gfxStudioState.w} × ${gfxStudioState.h} px`;
  renderGfxPoster();
};

window.applyGfxTheme = (theme, btn) => {
  const presets = {
    royal: { c1: '#1e3a8a', c2: '#6d28d9', acc: '#f59e0b' },
    sale: { c1: '#7f1d1d', c2: '#dc2626', acc: '#facc15' },
    eid: { c1: '#064e3b', c2: '#059669', acc: '#fbbf24' },
    dark: { c1: '#0f172a', c2: '#1e293b', acc: '#38bdf8' },
    clean: { c1: '#f8fafc', c2: '#e2e8f0', acc: '#2563eb' }
  }[theme];
  if (!presets) return;
  if ($('gfxColor1')) $('gfxColor1').value = presets.c1;
  if ($('gfxColor2')) $('gfxColor2').value = presets.c2;
  if ($('gfxAccent')) $('gfxAccent').value = presets.acc;
  document.querySelectorAll('#gfxThemePills button').forEach(b => b.classList.toggle('active', b === btn));
  renderGfxPoster();
};

window.fillGfxCustomerDefaults = () => {
  const cid = $('gfxPosterCust')?.value || '';
  const c = cid ? db.customers.find(x => x.id === cid) : null;
  if ($('gfxFooterText')) {
    if (c) $('gfxFooterText').value = `${c.name}${c.phone ? ' · ' + c.phone : ''}`;
    else $('gfxFooterText').value = `${db.agency?.name || 'Ads Park BD'}${db.agency?.phone ? ' · ' + db.agency.phone : ''}`;
  }
  renderGfxPoster();
};

window.clearGfxImages = () => {
  gfxStudioState.prodImg = null;
  gfxStudioState.bgImg = null;
  if ($('gfxProdFile')) $('gfxProdFile').value = '';
  if ($('gfxBgFile')) $('gfxBgFile').value = '';
  renderGfxPoster();
  toast(L('পোস্টারের ছবি রিসেট হয়েছে', 'Canvas images cleared'), 'warn');
};

window.renderGfxPoster = () => {
  const canvas = $('gfxCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = gfxStudioState.w || 1080, H = gfxStudioState.h || 1080;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;

  const c1 = $('gfxColor1')?.value || '#1e3a8a';
  const c2 = $('gfxColor2')?.value || '#6d28d9';
  const acc = $('gfxAccent')?.value || '#f59e0b';
  const badge = ($('gfxBadgeText')?.value || '').trim();
  const headline = ($('gfxHeadline')?.value || '').trim() || (db.agency?.name || 'Ads Park BD');
  const subhead = ($('gfxSubhead')?.value || '').trim();
  const cta = ($('gfxCtaText')?.value || '').trim();
  const footer = ($('gfxFooterText')?.value || '').trim() || `${db.agency?.name || 'Ads Park BD'}${db.agency?.phone ? ' · ' + db.agency.phone : ''}`;
  const scale = Math.max(0.7, Math.min(1.35, num($('gfxFontScale')?.value || 100) / 100));
  const useLogo = Boolean($('gfxUseLogo')?.checked);
  const logoSrc = db.agency?.logoUrl || '';

  if (useLogo && logoSrc && gfxStudioState.logoSrc !== logoSrc) {
    gfxStudioState.logoSrc = logoSrc;
    gfxStudioState.logoImg = null;
    const lImg = new Image();
    if (!logoSrc.startsWith('data:')) lImg.crossOrigin = 'anonymous';
    lImg.onload = () => { gfxStudioState.logoImg = lImg; renderGfxPoster(); };
    lImg.onerror = () => { gfxStudioState.logoImg = null; };
    lImg.src = logoSrc;
  }

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (gfxStudioState.bgImg) {
    ctx.save();
    drawCoverImage(ctx, gfxStudioState.bgImg, 0, 0, W, H);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.56)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  const isLightBg = !gfxStudioState.bgImg && hexLuminance(c1) > 0.62 && hexLuminance(c2) > 0.62;
  const ink = isLightBg ? '#0f172a' : '#ffffff';
  const subInk = isLightBg ? '#334155' : 'rgba(255,255,255,0.88)';
  const layout = $('gfxLayoutStyle')?.value || 'classic';
  const pattern = $('gfxPattern')?.value || 'glow';

  // Decorative background patterns
  ctx.save();
  if (pattern === 'glow') {
    ctx.globalAlpha = isLightBg ? 0.09 : 0.16;
    ctx.fillStyle = acc;
    ctx.beginPath(); ctx.arc(W * 0.9, H * 0.12, Math.min(W, H) * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = isLightBg ? c2 : '#ffffff';
    ctx.beginPath(); ctx.arc(W * 0.08, H * 0.9, Math.min(W, H) * 0.2, 0, Math.PI * 2); ctx.fill();
  } else if (pattern === 'dots') {
    ctx.globalAlpha = isLightBg ? 0.12 : 0.16;
    ctx.fillStyle = isLightBg ? '#0f172a' : '#ffffff';
    const step = Math.round(Math.min(W, H) * 0.045);
    for (let x = step; x < W; x += step) {
      for (let y = step; y < H; y += step) {
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (pattern === 'stripes') {
    ctx.globalAlpha = isLightBg ? 0.06 : 0.09;
    ctx.strokeStyle = isLightBg ? '#0f172a' : '#ffffff';
    ctx.lineWidth = Math.round(Math.min(W, H) * 0.018);
    const gap = Math.round(Math.min(W, H) * 0.09);
    for (let x = -H; x < W + H; x += gap) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke();
    }
  }
  ctx.restore();

  const pad = Math.round(Math.min(W, H) * 0.065);
  const isWide = W > H * 1.15;
  const hasProd = Boolean(gfxStudioState.prodImg);

  // Outer subtle border frame
  ctx.save();
  ctx.strokeStyle = isLightBg ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 3;
  drawRoundRect(ctx, pad * 0.42, pad * 0.42, W - pad * 0.84, H - pad * 0.84, 28);
  ctx.stroke();
  ctx.restore();

  // Bold banner top accent ribbon for "bold" layout
  if (layout === 'bold') {
    ctx.save();
    ctx.fillStyle = acc;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H * 0.17); ctx.lineTo(0, H * 0.11); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Top Header Row: Agency Logo / Brand + Offer Badge
  let curY = pad;
  const brandName = db.agency?.name || 'Ads Park BD';
  if (useLogo && gfxStudioState.logoImg) {
    const logoSize = Math.round(Math.min(W, H) * 0.085);
    ctx.save();
    ctx.fillStyle = '#ffffff';
    drawRoundRect(ctx, pad, curY, logoSize, logoSize, 16);
    ctx.fill();
    ctx.clip();
    drawContainImage(ctx, gfxStudioState.logoImg, pad + 6, curY + 6, logoSize - 12, logoSize - 12);
    ctx.restore();
    ctx.fillStyle = ink;
    ctx.font = `700 ${Math.round(Math.min(W, H) * 0.028)}px "Hind Siliguri", Inter, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(brandName, pad + logoSize + 16, curY + logoSize / 2);
  } else {
    ctx.fillStyle = ink;
    ctx.font = `800 ${Math.round(Math.min(W, H) * 0.032)}px "Hind Siliguri", Inter, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(`⚡ ${brandName}`, pad, curY + 8);
  }

  if (badge && layout !== 'center') {
    const bFs = Math.round(Math.min(W, H) * 0.028);
    ctx.font = `800 ${bFs}px "Hind Siliguri", Inter, sans-serif`;
    const bw = Math.min(W * 0.46, ctx.measureText(badge).width + 44);
    const bh = Math.round(bFs * 1.95);
    const bx = W - pad - bw;
    ctx.fillStyle = acc;
    drawRoundRect(ctx, bx, curY, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = hexLuminance(acc) > 0.58 ? '#0f172a' : '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(badge, bx + bw / 2, curY + bh / 2, bw - 22);
    ctx.textAlign = 'left';
  }

  curY += Math.round(Math.min(W, H) * 0.125);

  const footerH = Math.round(Math.min(W, H) * 0.09);
  const availH = H - curY - pad - footerH;
  const isCentered = layout === 'center' && (!hasProd || !isWide);
  const textAreaW = (hasProd && !isCentered) ? (isWide ? Math.round((W - pad * 2.5) * 0.56) : W - pad * 2) : (W - pad * 2);

  if (badge && isCentered) {
    const bFs = Math.round(Math.min(W, H) * 0.028);
    ctx.font = `800 ${bFs}px "Hind Siliguri", Inter, sans-serif`;
    const bw = Math.min(W * 0.72, ctx.measureText(badge).width + 52);
    const bh = Math.round(bFs * 1.95);
    const bx = (W - bw) / 2;
    ctx.fillStyle = acc;
    drawRoundRect(ctx, bx, curY, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = hexLuminance(acc) > 0.58 ? '#0f172a' : '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(badge, W / 2, curY + bh / 2, bw - 22);
    ctx.textAlign = 'left';
    curY += bh + Math.round(Math.min(W, H) * 0.03);
  }

  // Draw product image box if present
  let textAvailH = availH;
  if (hasProd) {
    let px, py, pw, ph;
    if (isWide) {
      pw = Math.round((W - pad * 2.5) * 0.42);
      ph = availH;
      px = W - pad - pw;
      py = curY;
    } else {
      ph = Math.round(availH * 0.42);
      pw = W - pad * 2;
      px = pad;
      py = H - pad - footerH - ph;
      textAvailH = availH - ph - Math.round(pad * 0.4);
    }
    ctx.save();
    ctx.fillStyle = isLightBg ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.12)';
    ctx.strokeStyle = isLightBg ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    drawRoundRect(ctx, px, py, pw, ph, 26);
    ctx.fill();
    ctx.stroke();
    ctx.clip();
    drawContainImage(ctx, gfxStudioState.prodImg, px + 14, py + 14, pw - 28, ph - 28);
    ctx.restore();
  }

  // Headline
  const baseHeadFs = Math.round(Math.min(W, H) * (isWide ? 0.068 : (hasProd ? 0.056 : 0.072)) * scale);
  ctx.font = `800 ${baseHeadFs}px "Hind Siliguri", Inter, sans-serif`;
  ctx.fillStyle = ink;
  ctx.textBaseline = 'top';
  ctx.textAlign = isCentered ? 'center' : 'left';
  const textX = isCentered ? W / 2 : pad;
  const headLines = wrapCanvasLines(ctx, headline, textAreaW).slice(0, 4);
  const headLH = Math.round(baseHeadFs * 1.2);
  headLines.forEach(line => {
    ctx.fillText(line, textX, curY, textAreaW);
    curY += headLH;
  });

  // Subheadline
  if (subhead && curY < pad + Math.min(W, H) * 0.125 + textAvailH - 60) {
    curY += Math.round(baseHeadFs * 0.25);
    const subFs = Math.round(Math.min(W, H) * 0.032 * Math.min(1.12, scale));
    ctx.font = `500 ${subFs}px "Hind Siliguri", Inter, sans-serif`;
    ctx.fillStyle = subInk;
    const subLines = wrapCanvasLines(ctx, subhead, textAreaW).slice(0, 3);
    const subLH = Math.round(subFs * 1.38);
    subLines.forEach(line => {
      ctx.fillText(line, textX, curY, textAreaW);
      curY += subLH;
    });
  }
  ctx.textAlign = 'left';

  // CTA Pill
  if (cta) {
    curY += Math.round(Math.min(W, H) * 0.032);
    const ctaFs = Math.round(Math.min(W, H) * 0.033);
    ctx.font = `800 ${ctaFs}px "Hind Siliguri", Inter, sans-serif`;
    const cw = Math.min(textAreaW, ctx.measureText(cta).width + 64);
    const ch = Math.round(ctaFs * 2.1);
    const maxY = (hasProd && !isWide) ? (H - pad - footerH - Math.round(availH * 0.42) - ch - 12) : (H - pad - footerH - ch - 12);
    const cy = Math.min(curY, maxY);
    const cx = isCentered ? (W - cw) / 2 : pad;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = acc;
    drawRoundRect(ctx, cx, cy, cw, ch, 18);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = hexLuminance(acc) > 0.58 ? '#0f172a' : '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(cta, cx + cw / 2, cy + ch / 2, cw - 24);
    ctx.textAlign = 'left';
  }

  // Footer strip
  const fy = H - pad - Math.round(footerH * 0.72);
  ctx.fillStyle = isLightBg ? 'rgba(15,23,42,0.08)' : 'rgba(0,0,0,0.28)';
  drawRoundRect(ctx, pad, fy, W - pad * 2, Math.round(footerH * 0.85), 14);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.font = `600 ${Math.round(Math.min(W, H) * 0.025)}px "Hind Siliguri", Inter, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = isCentered ? 'center' : 'left';
  ctx.fillText(footer, isCentered ? W / 2 : pad + 20, fy + Math.round(footerH * 0.425), W - pad * 2 - 40);
  ctx.textAlign = 'left';
};

window.copyGfxPosterCaption = () => {
  const badge = ($('gfxBadgeText')?.value || '').trim();
  const head = ($('gfxHeadline')?.value || '').trim();
  const sub = ($('gfxSubhead')?.value || '').trim();
  const cta = ($('gfxCtaText')?.value || '').trim();
  const foot = ($('gfxFooterText')?.value || '').trim() || `${db.agency?.name || 'Ads Park BD'}${db.agency?.phone ? ' · ' + db.agency.phone : ''}`;
  const cap = [badge, head, sub, cta ? `\n${cta}` : '', foot ? `\n📞 ${foot}` : ''].filter(Boolean).join('\n');
  copyText(cap, L('অ্যাড ক্যাপশন', 'Ad Caption'));
};

window.downloadGfxPosterPng = () => {
  const canvas = $('gfxCanvas');
  if (!canvas) return;
  renderGfxPoster();
  try {
    canvas.toBlob(blob => {
      if (!blob) return toast(L('PNG তৈরি করা যায়নি', 'Failed to export PNG'), 'error');
      const u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u;
      a.download = `ads_poster_${gfxStudioState.w}x${gfxStudioState.h}_${today()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 1200);
      toast(L('পোস্টার PNG ডাউনলোড হয়েছে!', 'Poster PNG downloaded!'));
    }, 'image/png');
  } catch (err) {
    toast(L('বাইরের লোগো লিংকের কারণে PNG এক্সপোর্ট ব্লক হয়েছে — লোগো গ্যালারি থেকে আপলোড করুন বা লোগো চেকবক্স আনচেক করুন।', 'External logo URL blocked canvas export — upload logo from device or uncheck logo.'), 'error');
  }
};

window.saveGfxPosterToVault = () => {
  const canvas = $('gfxCanvas');
  if (!canvas) return;
  renderGfxPoster();
  let thumbImg = '';
  try {
    const tmp = document.createElement('canvas');
    const maxDim = 560, scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
    tmp.width = Math.round(canvas.width * scale);
    tmp.height = Math.round(canvas.height * scale);
    tmp.getContext('2d').drawImage(canvas, 0, 0, tmp.width, tmp.height);
    thumbImg = tmp.toDataURL('image/jpeg', 0.8);
  } catch (err) {
    return toast(L('বাইরের লোগো লিংকের কারণে সেভ ব্লক হয়েছে — গ্যালারি থেকে লোগো আপলোড করুন।', 'External image blocked export — upload image from device.'), 'error');
  }
  const headline = ($('gfxHeadline')?.value || '').trim().split(/\r?\n/)[0] || 'Ad Poster';
  const subhead = ($('gfxSubhead')?.value || '').trim();
  const cta = ($('gfxCtaText')?.value || '').trim();
  const cid = $('gfxPosterCust')?.value || '';
  if (!Array.isArray(db.creatives)) db.creatives = [];
  db.creatives.unshift({
    id: uid(),
    updatedAt: Date.now(),
    date: today(),
    customerId: cid,
    platform: 'Meta',
    title: headline.slice(0, 60),
    mediaUrl: '',
    thumbImg,
    note: `Poster Studio (${gfxStudioState.w}×${gfxStudioState.h})`,
    adCopy: [headline, subhead, cta].filter(Boolean).join('\n')
  });
  save();
  logActivity(`পোস্টার সেভ (Creative Vault): ${headline.slice(0, 35)}`);
  if (typeof renderCreativeVault === 'function') renderCreativeVault();
  toast(L('পোস্টার ক্রিয়েটিভ ভল্টে সেভ হয়েছে!', 'Poster saved to Creative Vault!'));
};

function renderGraphicsOrders() {
  const metricsEl = $('gfxOrderMetrics'), tbody = $('gfxOrderRows');
  if (!metricsEl && !tbody) return;
  const list = Array.isArray(db.graphicsOrders) ? db.graphicsOrders : [];
  const totalCount = list.length;
  const activeCount = list.filter(g => ['Pending', 'In Design', 'Revision'].includes(g.status)).length;
  const revCount = list.filter(g => g.status === 'Revision').length;
  const deliveredCount = list.filter(g => g.status === 'Delivered').length;
  const totalCharge = list.reduce((s, g) => s + num(g.charge), 0);
  const totalCost = list.reduce((s, g) => s + num(g.cost), 0);
  const totalProfit = totalCharge - totalCost;

  if (metricsEl) {
    metricsEl.innerHTML = `
      <div class="metric-card m2" style="padding:14px"><small>${L('মোট ডিজাইন অর্ডার', 'Total Design Orders')}</small><strong>${totalCount}</strong><span class="trend">${L('সব প্রজেক্ট', 'All Projects')}</span></div>
      <div class="metric-card m4" style="padding:14px"><small>${L('চলমান ও রিভিশন', 'In Progress / Revision')}</small><strong>${activeCount}</strong><span class="trend">${L('রিভিশন', 'Revisions')}: ${revCount}</span></div>
      <div class="metric-card m3" style="padding:14px"><small>${L('ডেলিভার্ড সম্পন্ন', 'Delivered')}</small><strong>${deliveredCount}</strong><span class="trend">${totalCount ? Math.round((deliveredCount / totalCount) * 100) : 0}%</span></div>
      <div class="metric-card m1 staff-hide" style="padding:14px"><small>${L('ডিজাইন বিল / নিট লাভ', 'Design Bill / Profit')}</small><strong>${money(totalCharge)}</strong><span class="trend">${L('লাভ', 'Profit')}: ${money(totalProfit)}</span></div>
    `;
  }

  if (!tbody) return;
  const sf = $('goStatusFilter')?.value || '';
  const q = ($('goSearch')?.value || '').trim().toLowerCase();
  const filtered = [...list]
    .filter(g => (!sf || g.status === sf) && (!q || `${g.title || ''} ${cname(g.customerId)} ${g.type || ''} ${g.designer || ''} ${g.note || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || num(b.createdAt) - num(a.createdAt));

  const statusOpts = ['Pending', 'In Design', 'Revision', 'Approved', 'Delivered'];
  const statusCls = { Pending: 'status-paused', 'In Design': 'status-running', Revision: 'badge-danger', Approved: 'badge-admin', Delivered: 'badge-success' };

  tbody.innerHTML = filtered.map(g => {
    const cust = db.customers.find(c => c.id === g.customerId);
    const wa = cust?.phone ? normalizeBdPhone(cust.phone) : '';
    const isOverdue = g.deadline && g.deadline < today() && !['Approved', 'Delivered'].includes(g.status);
    const isDueToday = g.deadline && g.deadline === today() && !['Approved', 'Delivered'].includes(g.status);
    const dlBadge = !g.deadline ? '<small class="muted">—</small>' : (isOverdue ? `<span class="badge-danger">🔴 ${esc(g.deadline)}</span>` : (isDueToday ? `<span class="badge-warn">⏰ ${esc(g.deadline)}</span>` : `<small class="muted">📅 ${esc(g.deadline)}</small>`));
    const prof = num(g.charge) - num(g.cost);
    const waMsg = encodeURIComponent(`আসসালামু আলাইকুম ${cust?.name || ''},\nআপনার "${g.title}" (${g.type}) ডিজাইনের আপডেট: ${g.status}${g.link ? `\nডিজাইন ফাইল: ${g.link}` : ''}\n— ${db.agency?.name || 'Ads Park BD'}`);
    const alreadyBilled = Boolean(g.billedWorkId && db.works.some(w => w.id === g.billedWorkId));
    return `<tr>
      <td><strong>${esc(g.date || today())}</strong><br>${dlBadge}</td>
      <td><strong>${esc(cname(g.customerId))}</strong><br><span class="badge-admin" style="font-size:10px">${esc(g.type || 'Ad Poster')}</span> ${platformBadge(g.platform)}</td>
      <td><strong>${esc(g.title)}</strong>${g.designer ? `<br><small class="muted">👤 ${esc(g.designer)}</small>` : ''}${g.note ? `<br><small class="muted">${esc(g.note)}</small>` : ''}${g.link ? `<br><a href="${esc(g.link)}" target="_blank" rel="noopener noreferrer" style="font-size:11.5px">🔗 ${L('ফাইল/ড্রাইভ', 'Design File')} ↗</a>` : ''}</td>
      <td><strong>${num(g.revisions)}</strong> <button type="button" class="secondary sm perm-edit" onclick="incrementGfxRevision('${g.id}')" title="+1 রিভিশন">+১</button></td>
      <td><strong>${money(g.charge)}</strong>${isStaff() ? '' : `<br><small class="${prof >= 0 ? 'good' : 'bad'} priv-blur">${L('লাভ', 'Profit')}: ${money(prof)}</small>`}${alreadyBilled ? `<br><span class="badge-success" style="font-size:10px">✓ ${L('বিল্ড', 'Billed')}</span>` : ''}</td>
      <td><span class="badge-status ${statusCls[g.status] || 'status-running'}" style="font-size:10px;margin-bottom:4px;display:inline-block">${esc(g.status || 'Pending')}</span><br><select class="perm-edit" style="min-height:30px;padding:3px 6px;font-size:11.5px" onchange="changeGfxOrderStatus('${g.id}',this.value)">${statusOpts.map(st => `<option value="${st}" ${g.status === st ? 'selected' : ''}>${st}</option>`).join('')}</select></td>
      <td><div style="display:flex;gap:4px;flex-wrap:wrap">${wa.length >= 11 ? `<a href="https://wa.me/${wa}?text=${waMsg}" target="_blank" rel="noopener noreferrer" style="text-decoration:none"><button type="button" class="wa-btn sm" style="margin:0" title="WhatsApp ডেলিভারি">📲</button></a>` : ''}<button type="button" class="secondary sm perm-edit" onclick="convertGfxToWork('${g.id}')" title="কাস্টমারের বিলে যুক্ত করুন">${alreadyBilled ? '✓ বিল্ড' : '⚡ বিল করুন'}</button><button type="button" class="danger sm perm-del" onclick="deleteGfxOrder('${g.id}')">✕</button></div></td>
    </tr>`;
  }).join('') || `<tr><td colspan="7">${L('কোনো গ্রাফিক্স অর্ডার নেই', 'No graphics orders yet')}</td></tr>`;
}

if ($('gfxOrderForm')) $('gfxOrderForm').onsubmit = e => {
  e.preventDefault();
  if (!hasPerm('canEdit')) return toast(L('এডিট করার অনুমতি নেই!', 'Edit permission required!'), 'error');
  const title = $('goTitle')?.value.trim();
  const customerId = $('goCustomer')?.value || '';
  if (!title || !customerId) return toast(L('কাস্টমার ও ডিজাইন টাইটেল দিন!', 'Customer & title required!'), 'error');
  if (!Array.isArray(db.graphicsOrders)) db.graphicsOrders = [];
  db.graphicsOrders.push({
    id: uid(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    date: $('goDate')?.value || today(),
    customerId,
    type: $('goType')?.value || 'Ad Poster',
    platform: $('goPlatform')?.value || 'Meta',
    title,
    designer: $('goDesigner')?.value || '',
    deadline: $('goDeadline')?.value || '',
    charge: num($('goCharge')?.value),
    cost: isStaff() ? 0 : num($('goCost')?.value),
    status: $('goStatus')?.value || 'Pending',
    revisions: 0,
    link: $('goLink')?.value.trim() || '',
    note: $('goNote')?.value.trim() || '',
    billedWorkId: ''
  });
  save();
  logActivity(`নতুন গ্রাফিক্স অর্ডার: ${title} (${cname(customerId)})`);
  e.target.reset();
  if ($('goDate')) $('goDate').value = today();
  if ($('goDeadline')) $('goDeadline').value = today();
  if ($('goCharge')) $('goCharge').value = 500;
  if ($('goCost')) $('goCost').value = 0;
  toast(L('গ্রাফিক্স অর্ডার সেভ হয়েছে!', 'Graphics order saved!'));
};

window.incrementGfxRevision = id => {
  if (!hasPerm('canEdit')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  const g = (db.graphicsOrders || []).find(x => x.id === id); if (!g) return;
  g.revisions = num(g.revisions) + 1;
  g.status = 'Revision';
  g.updatedAt = Date.now();
  save();
  logActivity(`রিভিশন (+1): ${g.title}`);
  toast(L(`রিভিশন কাউন্ট ${g.revisions} করা হয়েছে`, `Revision count updated to ${g.revisions}`));
};

window.changeGfxOrderStatus = (id, status) => {
  if (!hasPerm('canEdit')) return renderGraphicsOrders();
  const g = (db.graphicsOrders || []).find(x => x.id === id); if (!g) return;
  g.status = status;
  g.updatedAt = Date.now();
  save();
  logActivity(`গ্রাফিক্স স্ট্যাটাস (${status}): ${g.title}`);
  toast(L(`স্ট্যাটাস ${status} আপডেট হয়েছে`, `Status updated to ${status}`));
};

window.convertGfxToWork = async id => {
  if (!hasPerm('canEdit')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  const g = (db.graphicsOrders || []).find(x => x.id === id); if (!g) return;
  if (g.billedWorkId && db.works.some(w => w.id === g.billedWorkId)) {
    if (!(await askConfirm(L('এই ডিজাইন অর্ডারটি ইতিমধ্যেই কাস্টমার বিলে যুক্ত হয়েছে। আবার নতুন বিল তৈরি করবেন?', 'Already billed to works! Create another bill entry?')))) return;
  }
  const charge = num(g.charge);
  if (charge <= 0) return toast(L('চার্জ ০ টাকার বেশি হতে হবে!', 'Charge must be greater than 0!'), 'error');
  const wId = uid();
  db.works.push({
    id: wId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    date: g.date || today(),
    platform: g.platform || 'Meta',
    customerId: g.customerId,
    pageId: '',
    name: `[Graphics · ${g.type || 'Design'}] ${g.title}`,
    days: 1,
    dollar: 0,
    rate: effectiveRateFor(g.customerId, g.date || today()) || 125,
    actualDollar: 0,
    refundedUsd: 0,
    serviceFee: charge,
    serviceFeeType: 'fixed',
    discount: 0,
    taxPct: 0,
    cardId: '',
    actualRate: 0,
    feePct: 0,
    other: num(g.cost),
    staffName: g.designer || '',
    commPct: 0,
    reach: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    creativeLink: g.link || '',
    status: 'completed',
    note: g.note || 'Graphics Order Billing'
  });
  g.billedWorkId = wId;
  if (g.status !== 'Delivered') g.status = 'Delivered';
  g.updatedAt = Date.now();
  save();
  syncCustomerPortalIfLinked(g.customerId);
  logActivity(`গ্রাফিক্স বিল যোগ: ${g.title} (${money(charge)})`);
  toast(L(`কাস্টমার বিলে ${money(charge)} যুক্ত হয়েছে ✅`, `Added ${money(charge)} to client billing ✅`));
};

window.deleteGfxOrder = async id => {
  if (!hasPerm('canDelete') || !(await askConfirm(L('এই গ্রাফিক্স অর্ডারটি মুছবেন?', 'Delete this graphics order?')))) return;
  const g = (db.graphicsOrders || []).find(x => x.id === id);
  if (g) {
    moveToTrash('graphicsOrder', `গ্রাফিক্স: ${g.title}`, g);
    markDeleted(id);
    db.graphicsOrders = (db.graphicsOrders || []).filter(x => x.id !== id);
    save();
    toast(L('ট্র্যাশে পাঠানো হয়েছে', 'Moved to trash'), 'warn');
  }
};

// Campaign Funnel & Budget Planner (#funnelPlannerModal)
let lastFunnelPlan = null;
window.openFunnelPlannerModal = () => {
  if (!$('funnelPlannerModal')) return;
  if ($('fpRate') && !num($('fpRate').value)) $('fpRate').value = rateFor(today()) || num(db.agency?.defaultRate) || 125;
  calcFunnelPlan();
  $('funnelPlannerModal').style.display = 'flex';
};
window.calcFunnelPlan = () => {
  const host = $('funnelPlanOutput'); if (!host) return;
  const plat = $('fpPlatform')?.value || 'Meta';
  const sales = Math.max(1, num($('fpTargetSales')?.value));
  const conv = Math.max(0.5, Math.min(100, num($('fpConvRate')?.value) || 25));
  const cpl = Math.max(0.01, num($('fpCplUsd')?.value) || 0.45);
  const days = Math.max(1, num($('fpDays')?.value) || 15);
  const rate = Math.max(1, num($('fpRate')?.value) || 125);
  const orderVal = Math.max(0, num($('fpOrderVal')?.value));
  const svcPct = Math.max(0, num($('fpSvcPct')?.value));

  const reqLeads = Math.ceil(sales / (conv / 100));
  const totalUsd = +(reqLeads * cpl).toFixed(2);
  const dailyUsd = +(totalUsd / days).toFixed(2);
  const adBillTk = totalUsd * rate;
  const svcFeeTk = adBillTk * (svcPct / 100);
  const totalQuoteTk = adBillTk + svcFeeTk;
  const estRevenueTk = sales * orderVal;
  const estRoas = totalQuoteTk > 0 ? (estRevenueTk / totalQuoteTk) : 0;
  const cpaTk = totalQuoteTk / sales;

  lastFunnelPlan = { plat, sales, conv, cpl, days, rate, orderVal, svcPct, reqLeads, totalUsd, dailyUsd, adBillTk, svcFeeTk, totalQuoteTk, estRevenueTk, estRoas, cpaTk };
  host.innerHTML = `
    <div class="closing-box"><small>${L('প্রয়োজনীয় মেসেজ / লিড', 'Required Leads/Msgs')}</small><strong>${reqLeads.toLocaleString()}</strong></div>
    <div class="closing-box"><small>${L('দৈনিক ও মোট ডলার বাজেট', 'Daily & Total Budget ($)')}</small><strong style="color:var(--brand)">${usd(dailyUsd)}/${L('দিন', 'd')} · ${usd(totalUsd)}</strong></div>
    <div class="closing-box"><small>${L('ক্লায়েন্ট কোটেশন (চার্জসহ)', 'Total Quote (incl. Fee)')}</small><strong class="good">${money(totalQuoteTk)}</strong></div>
    <div class="closing-box"><small>${L('সম্ভাব্য বিক্রি / CPA', 'Est. Revenue / CPA')}</small><strong>${estRevenueTk > 0 ? money(estRevenueTk) : '—'} <small class="muted">(${estRoas > 0 ? `${estRoas.toFixed(2)}x` : `CPA ${money(cpaTk)}`})</small></strong></div>
  `;
};
window.copyFunnelPlanSummary = () => {
  if (!lastFunnelPlan) return;
  const f = lastFunnelPlan;
  copyText(`🎯 *${f.plat} Campaign Funnel & Budget Plan*\nটার্গেট অর্ডার: ${f.sales}টি (${f.days} দিন)\nপ্রয়োজনীয় লিড/মেসেজ (${f.conv}% কনভার্সন): ${f.reqLeads}টি\nপ্রস্তাবিত বাজেট: ${usd(f.totalUsd)} (${usd(f.dailyUsd)}/দিন)\nডলার রেট: ৳${f.rate} + ${f.svcPct}% সার্ভিস চার্জ\nমোট আনুমানিক বাজেট: ${money(f.totalQuoteTk)}${f.estRevenueTk > 0 ? `\nসম্ভাব্য সেল: ${money(f.estRevenueTk)} (ROAS ~${f.estRoas.toFixed(2)}x)` : ''}`, L('ফানেল প্ল্যান', 'Funnel Plan'));
};
window.applyFunnelTo = target => {
  if (!lastFunnelPlan) calcFunnelPlan();
  const f = lastFunnelPlan; if (!f) return;
  closeModal('funnelPlannerModal');
  if (target === 'quote') {
    goToSection('quotations');
    if ($('qtPlatform')) $('qtPlatform').value = f.plat;
    if ($('qtTitle')) $('qtTitle').value = `${f.plat} Funnel Campaign (Target: ${f.sales} Orders / ${f.reqLeads} Leads)`;
    if ($('qtDays')) $('qtDays').value = f.days;
    if ($('qtDollar')) $('qtDollar').value = f.totalUsd;
    if ($('qtRate')) { delete $('qtRate').dataset.manualEdit; $('qtRate').value = f.rate; }
    if ($('qtServiceFee')) $('qtServiceFee').value = f.svcPct;
    if ($('qtServiceFeeType')) $('qtServiceFeeType').value = 'pct';
    if ($('qtNote')) $('qtNote').value = `Est. ${usd(f.dailyUsd)}/day · Avg CPL $${f.cpl}`;
    updateQuotePreview();
    toast(L('ফানেল প্ল্যান কোটেশন ফর্মে বসানো হয়েছে!', 'Funnel plan loaded into Quotation!'));
  } else {
    goToSection('works');
    if ($('wPlatform')) $('wPlatform').value = f.plat;
    if ($('wName')) $('wName').value = `${f.plat} Funnel (${f.sales} Orders Target)`;
    if ($('wDays')) $('wDays').value = f.days;
    if ($('wDollar')) $('wDollar').value = f.totalUsd;
    if ($('wRate')) { delete $('wRate').dataset.manualEdit; $('wRate').value = f.rate; }
    if ($('wServiceFee')) $('wServiceFee').value = f.svcPct;
    if ($('wServiceFeeType')) $('wServiceFeeType').value = 'pct';
    if ($('wNote')) $('wNote').value = `Daily ~${usd(f.dailyUsd)} · Target Leads: ${f.reqLeads}`;
    updateWorkPreview();
    toast(L('ফানেল প্ল্যান কাজের ফর্মে বসানো হয়েছে!', 'Funnel plan loaded into Work form!'));
  }
};

// Service Packages & Rate Card Catalog (db.packages)
function renderPackages() {
  const host = $('packageCardsGrid'); if (!host) return;
  const list = Array.isArray(db.packages) ? db.packages : [];
  const defRate = rateFor(today()) || num(db.agency?.defaultRate) || 125;
  host.innerHTML = list.map(p => {
    const baseTk = num(p.dollar) * defRate;
    const feeTk = p.feeType === 'pct' ? baseTk * (num(p.fee) / 100) : num(p.fee);
    const estTotal = baseTk + feeTk;
    return `<div class="pkg-card">
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px">
          ${platformBadge(p.platform)}
          <span class="badge-admin" style="font-size:10px">${esc(p.category || 'Package')}</span>
        </div>
        <strong style="font-size:14px;display:block">${esc(p.name)}</strong>
        <div style="font-size:12px;margin-top:4px;color:var(--brand);font-weight:700">${num(p.dollar) > 0 ? `${usd(p.dollar)} (${num(p.days) || 7} ${L('দিন', 'd')}) + ` : ''}${p.feeType === 'pct' ? `${num(p.fee)}% ${L('চার্জ', 'Fee')}` : `${money(p.fee)} ${L('ফি', 'Fee')}`} ≈ ${money(estTotal)}</div>
        ${p.note ? `<small class="muted" style="display:block;margin-top:4px;line-height:1.45">${esc(p.note)}</small>` : ''}
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        <button type="button" class="secondary sm" style="margin:0" onclick="applyPackageTo('${p.id}','quote')">📝 কোটেশন</button>
        <button type="button" class="sm" style="margin:0" onclick="applyPackageTo('${p.id}','work')">⚡ কাজ</button>
        <button type="button" class="wa-btn sm" style="margin:0" onclick="copyPackageOffer('${p.id}')" title="WhatsApp অফার কপি">📲</button>
        <button type="button" class="danger sm perm-del" style="margin:0;margin-left:auto" onclick="deletePackage('${p.id}')">✕</button>
      </div>
    </div>`;
  }).join('') || `<div class="muted" style="grid-column:1 / -1;padding:12px;text-align:center">${L('কোনো সার্ভিস প্যাকেজ সেভ করা নেই — উপরের ফর্ম থেকে তৈরি করুন অথবা "স্টার্টার প্যাকেজ লোড করুন" বাটনে ক্লিক করুন।', 'No saved packages yet — create one above or click Load Starter Packages.')}</div>`;
}
if ($('packageForm')) $('packageForm').onsubmit = e => {
  e.preventDefault();
  if (!hasPerm('canEdit')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  const name = $('pkgName')?.value.trim(); if (!name) return;
  if (!Array.isArray(db.packages)) db.packages = [];
  db.packages.unshift({
    id: uid(), updatedAt: Date.now(), name,
    category: $('pkgCategory')?.value || 'Ad Boosting',
    platform: $('pkgPlatform')?.value || 'Meta',
    days: Math.max(1, num($('pkgDays')?.value) || 7),
    dollar: Math.max(0, num($('pkgDollar')?.value)),
    fee: Math.max(0, num($('pkgFee')?.value)),
    feeType: $('pkgFeeType')?.value || 'fixed',
    note: $('pkgNote')?.value.trim() || ''
  });
  save(); logActivity(`নতুন সার্ভিস প্যাকেজ: ${name}`);
  e.target.reset(); if ($('pkgDays')) $('pkgDays').value = 7; if ($('pkgDollar')) $('pkgDollar').value = 50; if ($('pkgFee')) $('pkgFee').value = 1000;
  toast(L('প্যাকেজ ক্যাটালগে সেভ হয়েছে!', 'Package saved to catalog!'));
};
window.seedDefaultPackages = () => {
  if (!hasPerm('canEdit')) return toast(L('অনুমতি নেই!', 'Permission denied!'), 'error');
  if (!Array.isArray(db.packages)) db.packages = [];
  const starters = [
    { name: 'Starter Boosting Pack ($30)', category: 'Ad Boosting', platform: 'Meta', days: 7, dollar: 30, fee: 500, feeType: 'fixed', note: '৭ দিন টার্গেটেড মেসেজ/সেল বুস্টিং + অডিয়েন্স সেটআপ' },
    { name: 'Growth Combo (Ads + 3 Posters)', category: 'Monthly Retainer', platform: 'Meta', days: 15, dollar: 100, fee: 2500, feeType: 'fixed', note: '$100 বুস্টিং + ৩টি প্রোমোশনাল পোস্টার ডিজাইন ও রিপোর্ট' },
    { name: 'Pixel + CAPI + Domain Verify', category: 'Tracking & Setup', platform: 'Meta', days: 2, dollar: 0, fee: 2500, feeType: 'fixed', note: 'Meta Pixel, Conversion API, ওয়েবসাইট ইভেন্ট ও ডোমেইন ভেরিফিকেশন' }
  ];
  let added = 0;
  starters.forEach(st => {
    if (!db.packages.some(x => x.name === st.name)) { db.packages.push({ id: uid(), updatedAt: Date.now(), ...st }); added++; }
  });
  if (!added) return toast(L('স্টার্টার প্যাকেজগুলো আগেই যুক্ত আছে', 'Starter packages already loaded'), 'warn');
  save(); toast(L(`${added}টি স্টার্টার প্যাকেজ যুক্ত হয়েছে!`, `${added} starter packages added!`));
};
window.applyPackageTo = (id, target) => {
  const p = (db.packages || []).find(x => x.id === id); if (!p) return;
  const r = rateFor(today()) || num(db.agency?.defaultRate) || 125;
  if (target === 'quote') {
    goToSection('quotations');
    if ($('qtPlatform')) $('qtPlatform').value = p.platform || 'Meta';
    if ($('qtTitle')) $('qtTitle').value = p.name;
    if ($('qtDays')) $('qtDays').value = p.days || 7;
    if ($('qtDollar')) $('qtDollar').value = num(p.dollar);
    if ($('qtRate')) { delete $('qtRate').dataset.manualEdit; $('qtRate').value = r; }
    if ($('qtServiceFee')) $('qtServiceFee').value = num(p.fee);
    if ($('qtServiceFeeType')) $('qtServiceFeeType').value = p.feeType || 'fixed';
    if ($('qtNote')) $('qtNote').value = p.note || '';
    updateQuotePreview();
    toast(L(`"${p.name}" কোটেশন ফর্মে বসানো হয়েছে!`, `"${p.name}" loaded into Quotation!`));
  } else {
    goToSection('works');
    if ($('wPlatform')) $('wPlatform').value = p.platform || 'Meta';
    if ($('wName')) $('wName').value = p.name;
    if ($('wDays')) $('wDays').value = p.days || 7;
    if ($('wDollar')) $('wDollar').value = num(p.dollar);
    if ($('wRate')) { delete $('wRate').dataset.manualEdit; $('wRate').value = r; }
    if ($('wServiceFee')) $('wServiceFee').value = num(p.fee);
    if ($('wServiceFeeType')) $('wServiceFeeType').value = p.feeType || 'fixed';
    if ($('wNote')) $('wNote').value = p.note || '';
    updateWorkPreview();
    toast(L(`"${p.name}" কাজের ফর্মে বসানো হয়েছে!`, `"${p.name}" loaded into Work form!`));
  }
};
window.copyPackageOffer = id => {
  const p = (db.packages || []).find(x => x.id === id); if (!p) return;
  const r = rateFor(today()) || num(db.agency?.defaultRate) || 125;
  const baseTk = num(p.dollar) * r;
  const feeTk = p.feeType === 'pct' ? baseTk * (num(p.fee) / 100) : num(p.fee);
  const tot = baseTk + feeTk;
  const msg = `📦 *${p.name}* (${p.platform})\n⏳ মেয়াদ: ${p.days} দিন${num(p.dollar) > 0 ? ` · বাজেট: ${usd(p.dollar)}` : ''}\n💰 প্যাকেজ মূল্য: *${money(tot)}*\n${p.note ? `✅ যা থাকছে: ${p.note}\n` : ''}— ${db.agency?.name || 'Ads Park BD'}${db.agency?.phone ? ` (${db.agency.phone})` : ''}`;
  copyText(msg, L('প্যাকেজ অফার', 'Package Offer'));
};
window.deletePackage = async id => {
  if (!hasPerm('canDelete') || !(await askConfirm(L('প্যাকেজটি মুছবেন?', 'Delete this package?')))) return;
  const p = (db.packages || []).find(x => x.id === id);
  if (p) { moveToTrash('package', `প্যাকেজ: ${p.name}`, p); markDeleted(id); db.packages = db.packages.filter(x => x.id !== id); save(); toast(L('ট্র্যাশে পাঠানো হয়েছে', 'Moved to trash'), 'warn'); }
};

// Daily Brief Clipboard & User Plan Request
window.copyDailyBriefText = () => {
  if (isStaff()) return toast(L('শুধু এডমিন/ওনার ব্যবহার করতে পারবেন!', 'Admin/Owner only!'), 'error');
  const todayS = today(), s = computePnlStats(todayS, todayS);
  const allDue = db.customers.reduce((sum, c) => sum + Math.max(0, -clientBalance(c.id)), 0);
  const activeGfx = (db.graphicsOrders || []).filter(g => !['Approved', 'Delivered'].includes(g.status)).length;
  const wTotal = Object.values(getWalletBalances()).reduce((a, b) => a + num(b), 0);
  const brief = `📊 *${db.agency?.name || 'Ads Park BD'} — ডেইলি ব্রিফ (${todayS})*\n` +
    `• আজকের ক্যাম্পেইন: ${s.campaigns}টি (${usd(s.spentUsd)})\n` +
    `• আজকের বিল: ${money(s.totalBill)} | আদায়: ${money(s.collected)}\n` +
    `• আজকের নিট লাভ: ${money(s.netProfit)}\n` +
    `• মোট ক্লায়েন্ট বকেয়া: ${money(allDue)}\n` +
    `• পেন্ডিং ডিজাইন অর্ডার: ${activeGfx}টি\n` +
    `• মোট ওয়ালেট ক্যাশ: ${money(wTotal)}`;
  copyText(brief, L('ডেইলি বিজনেস ব্রিফ', 'Daily Business Brief'));
};

let pendingExpiredSubCreds = null;
function renderSubscriptionModalCards(cfg, selectedKey) {
  const grid = $('subPlanCardsGrid'), sel = $('subPlanSelect');
  const plans = SUB_PLAN_KEYS.map(k => cfg.plans[k]).filter(p => p && p.enabled !== false);
  const activeKey = plans.some(p => p.key === selectedKey) ? selectedKey : (plans[0]?.key || 'monthly');
  if ($('subSelectedPlanKey')) $('subSelectedPlanKey').value = activeKey;
  if (sel) {
    sel.innerHTML = plans.map(p => `<option value="${esc(p.key)}" ${p.key === activeKey ? 'selected' : ''}>${esc(p.label)} (${p.days > 0 ? `${p.days} দিন` : 'আজীবন'}) — ৳${num(p.price).toLocaleString('en-BD')}</option>`).join('');
  }
  const durMap = { daily: '১ দিন', weekly: '৭ দিন', monthly: '৩০ দিন', yearly: '৩৬৫ দিন', lifetime: 'আজীবন' };
  if (grid) {
    grid.innerHTML = plans.map(p => {
      const selCss = p.key === activeKey ? 'border:2px solid var(--brand);background:rgba(49,87,232,.09);transform:translateY(-1px)' : 'border:1px solid var(--line);background:var(--soft)';
      return `<div onclick="selectSubscriptionPlan('${esc(p.key)}')" style="cursor:pointer;padding:11px 10px;border-radius:11px;text-align:center;transition:.15s;${selCss}"><div style="font-size:12px;font-weight:700;color:var(--brand)">${esc(p.label)}</div><div style="font-size:17px;font-weight:800;margin:4px 0">৳${num(p.price).toLocaleString('en-BD')}</div><small class="muted">${durMap[p.key] || ''}</small></div>`;
    }).join('') || '<div class="muted">কোনো প্ল্যান চালু নেই।</div>';
  }
  const curPlan = plans.find(p => p.key === activeKey);
  if ($('subReqSubmitBtn')) {
    $('subReqSubmitBtn').textContent = curPlan ? `📩 ${curPlan.label} (৳${num(curPlan.price).toLocaleString('en-BD')}) রিকোয়েস্ট পাঠান` : '📩 সাবস্ক্রিপশন রিকোয়েস্ট পাঠান';
  }
}
window.selectSubscriptionPlan = key => {
  const cfg = readSubscriptionConfig();
  renderSubscriptionModalCards(cfg, key);
};
let subGatewayConfigured = false;
let subAutoWaitTimer = null;

function stopSubscriptionAutoWaitPoll() {
  if (subAutoWaitTimer) { clearInterval(subAutoWaitTimer); subAutoWaitTimer = null; }
}

function completeAutoActivatedSubscription(account, token, reqItem) {
  stopSubscriptionAutoWaitPoll();
  if (!account) return;
  const accs = readLocalAccounts(), idx = accs.findIndex(a => a.id === account.id);
  if (idx !== -1) accs[idx] = { ...accs[idx], ...account };
  else accs.push(account);
  localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs));
  if (token) serverAuthToken = token;
  if ($('subWaitingAutoBox')) $('subWaitingAutoBox').style.display = 'none';
  pendingExpiredSubCreds = null;
  closeModal('subscriptionModal');
  if (!activeAccount || activeAccount.id === account.id) {
    enterLoggedInUI(account, true);
  } else {
    updateHeaderAndProfile();
  }
  toast(`🎉 পেমেন্ট ভেরিফাইড! ${reqItem?.planLabel || account.plan || ''} প্ল্যান অটোমেটিক চালু হয়েছে ✅`);
}

function startSubscriptionAutoWaitPoll(requestId) {
  stopSubscriptionAutoWaitPoll();
  if (!requestId || !navigator.onLine) return;
  let tries = 0;
  const checkNow = async () => {
    tries += 1;
    if (tries > 30 || !$('subscriptionModal') || $('subscriptionModal').style.display !== 'flex') {
      stopSubscriptionAutoWaitPoll();
      return;
    }
    try {
      const r = await serverFetch('/api/subscription/request-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, ...(pendingExpiredSubCreds || {}) }),
      });
      if (!r.ok) return;
      const d = await r.json();
      if (d.autoActivated && d.account) {
        completeAutoActivatedSubscription(d.account, d.token, d.request);
      } else if (d.status === 'rejected') {
        stopSubscriptionAutoWaitPoll();
        if ($('subWaitingAutoBox')) $('subWaitingAutoBox').style.display = 'none';
        if ($('subReqMsg')) { $('subReqMsg').style.color = '#dc2626'; $('subReqMsg').textContent = '❌ আপনার পেমেন্ট/রিকোয়েস্টটি বাতিল করা হয়েছে।'; }
      }
    } catch (_) {}
  };
  subAutoWaitTimer = setInterval(checkNow, 3000);
}

window.openSubscriptionModal = async (opts = {}) => {
  const modal = $('subscriptionModal');
  if (!modal) return;
  stopSubscriptionAutoWaitPoll();
  if (navigator.onLine) {
    try {
      const r = await fetch('/api/subscription/config?_t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        if (d.subscriptionConfig) writeSubscriptionConfig(d.subscriptionConfig);
        subGatewayConfigured = Boolean(d.gatewayConfigured);
      }
    } catch (_) {}
  }
  const cfg = readSubscriptionConfig();
  const targetAcc = opts.lockedAccount || activeAccount;
  const isExpiredLock = Boolean(opts.expiredLock);
  const canRequest = Boolean(isExpiredLock && pendingExpiredSubCreds) || Boolean(activeAccount && activeAccount.id !== 'legacy-super-admin' && activeAccount.role !== 'super_admin');
  if ($('subLockBanner')) {
    if (isExpiredLock) {
      $('subLockBanner').style.display = 'block';
      $('subLockBanner').textContent = opts.lockMessage || `আপনার ফ্রি ট্রায়াল / সাবস্ক্রিপশন মেয়াদ শেষ হওয়ায় অ্যাকাউন্ট লক হয়েছে 🔒 — নিচের যেকোনো একটি প্ল্যান নিয়ে পুনরায় চালু করুন বা অ্যাডমিনের অনুমতি নিন।`;
    } else {
      $('subLockBanner').style.display = 'none';
    }
  }
  if ($('subAutoInfoPill')) {
    $('subAutoInfoPill').style.display = cfg.autoActivateOnPaid !== false ? 'block' : 'none';
  }
  if ($('subPayOnlineBtn')) {
    $('subPayOnlineBtn').style.display = (canRequest && subGatewayConfigured) ? 'inline-flex' : 'none';
  }
  if ($('subWaitingAutoBox')) $('subWaitingAutoBox').style.display = 'none';
  if ($('subCurrentStatusBox')) {
    if (targetAcc && targetAcc.id !== 'legacy-super-admin') {
      const exp = targetAcc.expiryDate || '';
      const dLeft = exp ? Math.ceil((new Date(exp + 'T00:00:00Z') - new Date(today() + 'T00:00:00Z')) / 86400000) : null;
      $('subCurrentStatusBox').style.display = 'block';
      $('subCurrentStatusBox').innerHTML = targetAcc.subscriptionBypass
        ? `<strong>${esc(targetAcc.name)} (@${esc(targetAcc.username)})</strong> · <span class="badge-success">🆓 ফ্রি অনুমতি (সাবস্ক্রিপশন ছাড়াই আনলিমিটেড চলবে)</span>`
        : `<strong>${esc(targetAcc.name)} (@${esc(targetAcc.username)})</strong> · বর্তমান প্ল্যান: <strong>${esc(targetAcc.plan || 'Trial')}</strong> · ${exp ? `মেয়াদ: <strong>${esc(exp)}</strong> (${dLeft >= 0 ? `${dLeft} দিন বাকি` : '<span class="bad">মেয়াদ শেষ 🔒</span>'})` : 'Lifetime'}`;
    } else {
      $('subCurrentStatusBox').style.display = 'block';
      $('subCurrentStatusBox').innerHTML = `✨ নতুন ইউজারদের জন্য <strong>${cfg.trialDays || 7} দিনের ফ্রি ট্রায়াল</strong> রয়েছে! এরপর পছন্দমতো প্ল্যান নিতে পারবেন।`;
    }
  }
  const payText = cfg.payInfo || db.agency?.payInfo || '';
  if ($('subPayInfoBanner')) {
    if (payText) {
      $('subPayInfoBanner').style.display = 'block';
      $('subPayInfoBanner').innerHTML = `<strong>💳 পেমেন্ট পাঠানোর তথ্য:</strong> ${esc(payText)}`;
    } else {
      $('subPayInfoBanner').style.display = 'none';
    }
  }
  if ($('subRequestForm')) {
    $('subRequestForm').style.display = canRequest ? 'block' : 'none';
    if ($('subSenderPhone') && !isExpiredLock && activeAccount?.phone) $('subSenderPhone').value = activeAccount.phone;
    if ($('subReqMsg')) $('subReqMsg').textContent = '';
  }
  renderSubscriptionModalCards(cfg, $('subSelectedPlanKey')?.value || 'monthly');
  modal.style.display = 'flex';
};
window.closeSubscriptionModal = () => {
  stopSubscriptionAutoWaitPoll();
  pendingExpiredSubCreds = null;
  closeModal('subscriptionModal');
};
window.startOnlineSubscriptionCheckout = async () => {
  const planKey = $('subSelectedPlanKey')?.value || $('subPlanSelect')?.value || 'monthly';
  const msgEl = $('subReqMsg');
  try {
    const r = await serverFetch('/api/subscription/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planKey, ...(pendingExpiredSubCreds || {}) }),
    });
    const d = await r.json();
    if (!r.ok || !d.gatewayUrl) {
      if (msgEl) { msgEl.style.color = '#dc2626'; msgEl.textContent = d.error || 'অনলাইন পেমেন্ট শুরু করা যায়নি।'; }
      return;
    }
    if (d.requestId) startSubscriptionAutoWaitPoll(d.requestId);
    location.assign(d.gatewayUrl);
  } catch (err) {
    if (msgEl) { msgEl.style.color = '#dc2626'; msgEl.textContent = err.message || 'গেটওয়ে সংযোগ ব্যর্থ।'; }
  }
};
if ($('subRequestForm')) $('subRequestForm').onsubmit = async e => {
  e.preventDefault();
  const planKey = $('subSelectedPlanKey')?.value || $('subPlanSelect')?.value || 'monthly';
  const method = $('subPayMethod')?.value || 'bKash';
  const trxId = $('subTrxId')?.value.trim() || '';
  const senderPhone = $('subSenderPhone')?.value.trim() || '';
  const note = $('subReqNote')?.value.trim() || '';
  const msgEl = $('subReqMsg');
  if (!trxId && !note && method !== 'Permission Request') {
    if (msgEl) { msgEl.style.color = '#dc2626'; msgEl.textContent = 'পেমেন্ট TrxID অথবা অনুরোধের নোট লিখুন।'; }
    return;
  }
  const payload = { planKey, method, trxId, senderPhone, note, ...(pendingExpiredSubCreds || {}) };
  if (navigator.onLine) {
    try {
      const r = await serverFetch('/api/subscription/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (!r.ok) {
        if (msgEl) { msgEl.style.color = '#dc2626'; msgEl.textContent = d.error || 'রিকোয়েস্ট পাঠানো যায়নি।'; }
        return;
      }
      const reqs = readSubscriptionRequests();
      if (d.request) { reqs.unshift(d.request); writeSubscriptionRequests(reqs); }
      ['subTrxId', 'subReqNote'].forEach(id => { if ($(id)) $(id).value = ''; });
      if (d.autoActivated && d.account) {
        completeAutoActivatedSubscription(d.account, d.token, d.request);
        return;
      }
      if ($('subWaitingAutoBox') && d.request?.id && method !== 'Permission Request') {
        $('subWaitingAutoBox').style.display = 'block';
        $('subWaitingAutoBox').textContent = '⏳ পেমেন্ট ওয়েবহুক ভেরিফিকেশন চেক করা হচ্ছে — পেমেন্ট কনফার্ম হলেই এই স্ক্রিন থেকে অটোমেটিক প্ল্যান চালু হয়ে যাবে!';
        startSubscriptionAutoWaitPoll(d.request.id);
      }
      if (msgEl) { msgEl.style.color = '#059669'; msgEl.textContent = `✅ ${d.request?.planLabel || planKey} প্ল্যান আবেদন জমা হয়েছে — ভেরিফায়েড পেমেন্ট পেলে অটো চালু হবে অথবা অ্যাডমিন অনুমোদন করবেন।`; }
      toast('সাবস্ক্রিপশন রিকোয়েস্ট পাঠানো হয়েছে ✅');
      return;
    } catch (_) {}
  }
  const cfg = readSubscriptionConfig(), pCfg = cfg.plans[planKey] || cfg.plans.monthly;
  const reqs = readSubscriptionRequests();
  reqs.unshift({
    id: uid(), userId: activeAccount?.id || pendingExpiredSubCreds?.identity || 'user',
    name: activeAccount?.name || pendingExpiredSubCreds?.identity || 'User',
    username: activeAccount?.username || pendingExpiredSubCreds?.identity || '',
    phone: senderPhone || activeAccount?.phone || '', planKey, planLabel: pCfg.label,
    days: pCfg.days, price: pCfg.price, method, trxId, senderPhone, note,
    status: 'pending', createdAt: Date.now(), time: new Date().toLocaleString('bn-BD')
  });
  writeSubscriptionRequests(reqs);
  ['subTrxId', 'subReqNote'].forEach(id => { if ($(id)) $(id).value = ''; });
  if (msgEl) { msgEl.style.color = '#059669'; msgEl.textContent = '✅ সাবস্ক্রিপশন রিকোয়েস্ট সেভ হয়েছে — অ্যাডমিন অনুমোদন করলে চালু হবে!'; }
  toast('সাবস্ক্রিপশন রিকোয়েস্ট পাঠানো হয়েছে ✅');
};
window.requestPlanUpgrade = () => {
  if (!activeAccount) return;
  openSubscriptionModal();
};

// Real-Time Live Voice Conversation (WebSocket -> Server Gemini Live API)
let lvWs = null;
let lvInputCtx = null;
let lvOutputCtx = null;
let lvMicStream = null;
let lvSourceNode = null;
let lvProcessorNode = null;
let lvSilentGain = null;
let lvReady = false;
let lvMuted = false;
let lvNextPlayTime = 0;
const lvActiveSources = new Set();
let lvCurrentUserEl = null;
let lvCurrentAiEl = null;

function setLiveVoiceUiState(state, customMsg = '') {
  const orb = $('lvOrb');
  const st = $('liveVoiceStatusText');
  const startBtn = $('lvStartBtn');
  const muteBtn = $('lvMuteBtn');
  const stopBtn = $('lvStopBtn');
  const meter = $('lvMicMeter');
  if (orb) orb.className = 'lv-orb' + (state === 'listening' ? ' listening' : state === 'speaking' ? ' speaking' : state === 'muted' ? ' muted' : '');
  if (startBtn) startBtn.style.display = (state === 'idle' || state === 'error') ? 'inline-flex' : 'none';
  if (muteBtn) {
    muteBtn.style.display = (state === 'listening' || state === 'speaking' || state === 'muted') ? 'inline-flex' : 'none';
    muteBtn.textContent = lvMuted ? L('🔊 আনমিউট', '🔊 Unmute') : L('🎤 মিউট', '🎤 Mute');
  }
  if (stopBtn) stopBtn.style.display = (state === 'connecting' || state === 'listening' || state === 'speaking' || state === 'muted') ? 'inline-flex' : 'none';
  if (meter && (state === 'idle' || state === 'muted' || state === 'error')) meter.style.width = '0%';
  if (!st) return;
  if (customMsg) { st.textContent = customMsg; return; }
  if (state === 'connecting') st.textContent = L('⏳ লাইভ ভয়েস সংযোগ হচ্ছে...', '⏳ Connecting Live Voice...');
  else if (state === 'listening') st.innerHTML = `<span class="lv-live-dot"></span> ${L('🎙️ শুনছি... সরাসরি কথা বলুন', '🎙️ Listening... Speak naturally')}`;
  else if (state === 'speaking') st.textContent = L('🔊 উত্তর দিচ্ছে... (আপনি চাইলে মাঝখানে কথা বলতে পারেন)', '🔊 Speaking... (You can interrupt anytime)');
  else if (state === 'muted') st.textContent = L('🔇 মাইক্রোফোন মিউট করা আছে', '🔇 Microphone muted');
  else st.textContent = L('কল শুরু করতে নিচের বাটনে ক্লিক করুন', 'Click the button below to start talking');
}

function appendLiveTranscript(role, text, streamChunk = false) {
  const box = $('liveVoiceTranscript'); if (!box || !text) return;
  const firstSys = box.querySelector('.lv-msg.sys');
  if (firstSys && box.children.length === 1 && role !== 'sys') box.innerHTML = '';
  if (role === 'user') {
    lvCurrentAiEl = null;
    if (streamChunk && lvCurrentUserEl) {
      lvCurrentUserEl.dataset.raw = (lvCurrentUserEl.dataset.raw || '') + text;
      lvCurrentUserEl.textContent = `🗣️ ${lvCurrentUserEl.dataset.raw}`;
    } else {
      const div = document.createElement('div');
      div.className = 'lv-msg user';
      div.dataset.raw = text;
      div.textContent = `🗣️ ${text}`;
      box.appendChild(div);
      lvCurrentUserEl = div;
    }
  } else if (role === 'ai') {
    lvCurrentUserEl = null;
    if (streamChunk && lvCurrentAiEl) {
      lvCurrentAiEl.dataset.raw = (lvCurrentAiEl.dataset.raw || '') + text;
      lvCurrentAiEl.textContent = lvCurrentAiEl.dataset.raw;
    } else {
      const div = document.createElement('div');
      div.className = 'lv-msg ai';
      div.dataset.raw = text;
      div.textContent = text;
      box.appendChild(div);
      lvCurrentAiEl = div;
    }
  } else {
    lvCurrentUserEl = null;
    lvCurrentAiEl = null;
    const div = document.createElement('div');
    div.className = 'lv-msg sys';
    div.textContent = text;
    box.appendChild(div);
  }
  box.scrollTop = box.scrollHeight;
}

function flushLivePlaybackQueue() {
  lvActiveSources.forEach(src => { try { src.stop(); } catch (_) {} });
  lvActiveSources.clear();
  if (lvOutputCtx) lvNextPlayTime = lvOutputCtx.currentTime;
  else lvNextPlayTime = 0;
}

function downsampleFloat32To16k(input, inRate) {
  if (!inRate || inRate === 16000) return input;
  const ratio = inRate / 16000;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = input[idx] || 0;
    const s1 = input[Math.min(idx + 1, input.length - 1)] || s0;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}

function float32Pcm16ToBase64(float32Arr) {
  const bytes = new Uint8Array(float32Arr.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < float32Arr.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Arr[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function schedulePcm24kChunk(base64Str) {
  if (!lvOutputCtx) return;
  const bin = atob(base64Str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const sampleCount = Math.floor(bytes.length / 2);
  if (!sampleCount) return;
  const view = new DataView(bytes.buffer);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  const buffer = lvOutputCtx.createBuffer(1, sampleCount, 24000);
  buffer.copyToChannel(float32, 0);

  const startAt = Math.max(lvOutputCtx.currentTime + 0.02, lvNextPlayTime);
  const src = lvOutputCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(lvOutputCtx.destination);
  lvActiveSources.add(src);
  src.onended = () => {
    lvActiveSources.delete(src);
    if (lvActiveSources.size === 0 && lvReady) {
      setLiveVoiceUiState(lvMuted ? 'muted' : 'listening');
    }
  };
  src.start(startAt);
  lvNextPlayTime = startAt + buffer.duration;
  setLiveVoiceUiState('speaking');
}

function buildLiveAgencyContext() {
  if (!$('lvIncludeCtx')?.checked) return '';
  const rate = rateFor(today()) || num(db.agency?.defaultRate) || 125;
  const activeWorks = (db.works || []).filter(w => w.status === 'running').length;
  const lines = [
    `Agency Name: ${db.agency?.name || 'Ads Park BD'}`,
    `Today Date: ${today()}`,
    `Current USD Billing Rate: ৳${rate}`,
    `Total Customers: ${(db.customers || []).length}`,
    `Active Running Campaigns: ${activeWorks}`
  ];
  if (!isStaff()) {
    const todayStats = computePnlStats(today(), today());
    const dueTotal = (db.customers || []).reduce((s, c) => s + Math.max(0, -clientBalance(c.id)), 0);
    lines.push(`Today Billing: ৳${Math.round(todayStats.totalBill)}, Today Net Profit: ৳${Math.round(todayStats.netProfit)}`);
    lines.push(`Total Client Due: ৳${Math.round(dueTotal)}`);
  }
  return lines.join('\n');
}

window.openLiveVoiceModal = () => {
  if (!$('liveVoiceModal')) return;
  if ($('appSidebar')) $('appSidebar').classList.remove('open');
  if ($('sidebarBackdrop')) $('sidebarBackdrop').classList.remove('open');
  $('liveVoiceModal').style.display = 'flex';
  if (!lvReady && !lvWs) setLiveVoiceUiState('idle');
};

window.closeLiveVoiceModal = () => {
  if (lvWs || lvReady) stopLiveVoiceSession();
  closeModal('liveVoiceModal');
};

window.startLiveVoiceSession = async () => {
  if (lvWs || lvReady) return;
  if (location.protocol === 'file:') {
    setLiveVoiceUiState('error', L('লাইভ ভয়েস শুধু ওয়েব সার্ভারে কাজ করে', 'Live Voice requires running on web server'));
    return toast(L('লাইভ ভয়েস ব্যবহারের জন্য অ্যাপটি ব্রাউজার/সার্ভারে খুলুন', 'Please open the app from the web server for Live Voice'), 'error');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setLiveVoiceUiState('error', L('এই ব্রাউজারে মাইক্রোফোন সাপোর্ট নেই', 'Microphone is not supported in this browser'));
    return toast(L('মাইক্রোফোন সাপোর্ট পাওয়া যায়নি', 'Microphone unavailable'), 'error');
  }

  lvMuted = false;
  lvReady = false;
  setLiveVoiceUiState('connecting');

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    lvInputCtx = new AudioCtx({ sampleRate: 16000 });
    lvOutputCtx = new AudioCtx({ sampleRate: 24000 });
    await lvInputCtx.resume();
    await lvOutputCtx.resume();
    lvNextPlayTime = lvOutputCtx.currentTime;

    lvMicStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (err) {
    stopLiveVoiceSession();
    setLiveVoiceUiState('error', L('মাইক্রোফোন অনুমতি পাওয়া যায়নি — ব্রাউজারে Mic Allow করুন', 'Microphone permission denied — please allow Mic'));
    return toast(L('মাইক্রোফোন অনুমতি প্রয়োজন!', 'Microphone permission required!'), 'error');
  }

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/api/live-voice`);
  lvWs = ws;

  ws.onopen = () => {
    if (lvWs !== ws) return;
    ws.send(JSON.stringify({
      type: 'start',
      voiceName: $('lvVoiceSelect')?.value || 'Zephyr',
      mode: $('lvModeSelect')?.value || 'partner',
      agencyContext: buildLiveAgencyContext()
    }));
  };

  ws.onmessage = ev => {
    if (lvWs !== ws) return;
    let msg;
    try { msg = JSON.parse(ev.data); } catch (_) { return; }

    if (msg.type === 'ready') {
      lvReady = true;
      setLiveVoiceUiState('listening');
      appendLiveTranscript('sys', L('✅ লাইভ ভয়েস কল যুক্ত হয়েছে — কথা বলুন!', '✅ Live Voice connected — speak now!'));
      try {
        lvSourceNode = lvInputCtx.createMediaStreamSource(lvMicStream);
        lvProcessorNode = lvInputCtx.createScriptProcessor(2048, 1, 1);
        lvSilentGain = lvInputCtx.createGain();
        lvSilentGain.gain.value = 0;
        lvSourceNode.connect(lvProcessorNode);
        lvProcessorNode.connect(lvSilentGain);
        lvSilentGain.connect(lvInputCtx.destination);
        lvProcessorNode.onaudioprocess = e => {
          if (!lvReady || !lvWs || lvWs.readyState !== WebSocket.OPEN) return;
          const raw = e.inputBuffer.getChannelData(0);
          let sumSq = 0;
          for (let i = 0; i < raw.length; i++) sumSq += raw[i] * raw[i];
          const rms = Math.sqrt(sumSq / raw.length);
          const pct = lvMuted ? 0 : Math.min(100, Math.round(rms * 420));
          if ($('lvMicMeter')) $('lvMicMeter').style.width = `${pct}%`;
          if (lvMuted) return;
          const pcm16k = downsampleFloat32To16k(raw, lvInputCtx.sampleRate);
          const b64 = float32Pcm16ToBase64(pcm16k);
          lvWs.send(JSON.stringify({ type: 'audio', data: b64 }));
        };
      } catch (audioErr) {
        stopLiveVoiceSession();
        setLiveVoiceUiState('error', L('অডিও স্ট্রিম চালু করা যায়নি', 'Failed to start microphone stream'));
      }
      return;
    }

    if (msg.type === 'audio' && msg.data) {
      schedulePcm24kChunk(msg.data);
    } else if (msg.type === 'inputTranscript' && msg.text) {
      appendLiveTranscript('user', msg.text, true);
    } else if (msg.type === 'outputTranscript' && msg.text) {
      appendLiveTranscript('ai', msg.text, true);
    } else if (msg.type === 'interrupted') {
      flushLivePlaybackQueue();
      lvCurrentAiEl = null;
      if (lvReady) setLiveVoiceUiState(lvMuted ? 'muted' : 'listening');
    } else if (msg.type === 'turnComplete') {
      lvCurrentUserEl = null;
      lvCurrentAiEl = null;
      if (lvActiveSources.size === 0 && lvReady) setLiveVoiceUiState(lvMuted ? 'muted' : 'listening');
    } else if (msg.type === 'error') {
      const errMsg = msg.error || L('লাইভ ভয়েস সংযোগে সমস্যা হয়েছে', 'Live Voice connection error');
      appendLiveTranscript('sys', `⚠️ ${errMsg}`);
      toast(errMsg, 'error');
      stopLiveVoiceSession();
      setLiveVoiceUiState('error', errMsg);
    } else if (msg.type === 'closed') {
      if (lvReady || lvWs) {
        stopLiveVoiceSession();
        appendLiveTranscript('sys', L('কল শেষ হয়েছে।', 'Call ended.'));
      }
    }
  };

  ws.onerror = () => {
    if (lvWs !== ws) return;
    stopLiveVoiceSession();
    setLiveVoiceUiState('error', L('সার্ভার ওয়েবসকেট সংযোগ ব্যর্থ হয়েছে', 'WebSocket connection failed'));
    toast(L('লাইভ ভয়েস সার্ভারের সাথে সংযোগ হয়নি', 'Could not connect to Live Voice server'), 'error');
  };

  ws.onclose = () => {
    if (lvWs === ws) {
      stopLiveVoiceSession();
    }
  };
};

window.stopLiveVoiceSession = () => {
  const ws = lvWs;
  lvWs = null;
  lvReady = false;
  lvMuted = false;
  lvCurrentUserEl = null;
  lvCurrentAiEl = null;
  flushLivePlaybackQueue();
  if (ws) {
    try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' })); } catch (_) {}
    try { ws.close(); } catch (_) {}
  }
  if (lvProcessorNode) { try { lvProcessorNode.disconnect(); lvProcessorNode.onaudioprocess = null; } catch (_) {} lvProcessorNode = null; }
  if (lvSourceNode) { try { lvSourceNode.disconnect(); } catch (_) {} lvSourceNode = null; }
  if (lvSilentGain) { try { lvSilentGain.disconnect(); } catch (_) {} lvSilentGain = null; }
  if (lvMicStream) { try { lvMicStream.getTracks().forEach(t => t.stop()); } catch (_) {} lvMicStream = null; }
  if (lvInputCtx) { try { lvInputCtx.close(); } catch (_) {} lvInputCtx = null; }
  if (lvOutputCtx) { try { lvOutputCtx.close(); } catch (_) {} lvOutputCtx = null; }
  setLiveVoiceUiState('idle');
};

window.toggleLiveVoiceMute = () => {
  if (!lvReady) return;
  lvMuted = !lvMuted;
  if (lvMicStream) lvMicStream.getAudioTracks().forEach(t => { t.enabled = !lvMuted; });
  setLiveVoiceUiState(lvMuted ? 'muted' : (lvActiveSources.size > 0 ? 'speaking' : 'listening'));
};

window.sendLiveVoiceText = text => {
  const clean = String(text || '').trim();
  if (!clean) return;
  if (!lvWs || lvWs.readyState !== WebSocket.OPEN || !lvReady) {
    toast(L('আগে "কথা বলা শুরু করুন" বাটনে ক্লিক করে কল চালু করুন', 'Start the Live Voice call first'), 'warn');
    return;
  }
  appendLiveTranscript('user', clean, false);
  lvWs.send(JSON.stringify({ type: 'text', text: clean }));
};

window.sendLiveVoicePreset = promptText => {
  if (!lvReady) {
    startLiveVoiceSession().then(() => {
      const waitReady = setInterval(() => {
        if (lvReady && lvWs?.readyState === WebSocket.OPEN) {
          clearInterval(waitReady);
          sendLiveVoiceText(promptText);
        } else if (!lvWs) {
          clearInterval(waitReady);
        }
      }, 200);
      setTimeout(() => clearInterval(waitReady), 8000);
    });
    return;
  }
  sendLiveVoiceText(promptText);
};

window.copyLiveVoiceTranscript = () => {
  const box = $('liveVoiceTranscript'); if (!box) return;
  const lines = [...box.querySelectorAll('.lv-msg:not(.sys)')].map(el => (el.classList.contains('user') ? '' : 'Assistant: ') + el.textContent.trim()).filter(Boolean);
  if (!lines.length) return toast(L('কপি করার মতো কোনো কথোপকথন নেই', 'No transcript to copy'), 'warn');
  copyText(lines.join('\n'), L('ভয়েস ট্রান্সক্রিপ্ট', 'Voice Transcript'));
};

window.clearLiveVoiceTranscript = () => {
  lvCurrentUserEl = null;
  lvCurrentAiEl = null;
  if ($('liveVoiceTranscript')) {
    $('liveVoiceTranscript').innerHTML = `<div class="lv-msg sys">${L('কল শুরু করে মাইক্রোফোনে সরাসরি কথা বলুন অথবা নিচে লিখে পাঠান।', 'Start the call and speak into your microphone, or type below.')}</div>`;
  }
};

if ($('liveVoiceTextForm')) {
  $('liveVoiceTextForm').onsubmit = e => {
    e.preventDefault();
    const inp = $('liveVoiceTextInput');
    if (!inp) return;
    const val = inp.value.trim();
    if (!val) return;
    inp.value = '';
    sendLiveVoiceText(val);
  };
}
window.addEventListener('beforeunload', () => { try { stopLiveVoiceSession(); } catch (_) {} try { if (typeof disconnectTeamRoomSocket === 'function') disconnectTeamRoomSocket(); } catch (_) {} });

// =========================
// COMMUNITY NEWS FEED, MODERATION, PUBLIC PROFILE & LIVE TEAM VOICE ROOM
// =========================
const COMMUNITY_CACHE_KEY = 'ads_hisab_community_cache_v81';
const FEED_SEEN_KEY = 'ads_hisab_feed_seen_ts_v81';
const SAVED_POSTS_KEY = 'ads_hisab_saved_posts_v81';
const DEFAULT_CLIENT_BAD_WORDS = [
  'madarchod', 'banchod', 'khanki', 'magi', 'chuda', 'harami', 'sala', 'kuttar',
  'fuck', 'fucking', 'bitch', 'bastard', 'asshole', 'dick', 'motherfucker', 'slut', 'whore'
];

let communityState = (() => {
  try {
    const cached = JSON.parse(localStorage.getItem(COMMUNITY_CACHE_KEY) || 'null');
    if (cached && typeof cached === 'object') {
      return {
        posts: Array.isArray(cached.posts) ? cached.posts : [],
        chat: Array.isArray(cached.chat) ? cached.chat : [],
        dms: Array.isArray(cached.dms) ? cached.dms : [],
        notifications: Array.isArray(cached.notifications) ? cached.notifications : [],
        moderation: {
          badWords: Array.isArray(cached.moderation?.badWords) && cached.moderation.badWords.length ? cached.moderation.badWords : [...DEFAULT_CLIENT_BAD_WORDS],
          warnings: Array.isArray(cached.moderation?.warnings) ? cached.moderation.warnings : [],
          mutedUsers: cached.moderation?.mutedUsers && typeof cached.moderation.mutedUsers === 'object' ? cached.moderation.mutedUsers : {},
          reports: Array.isArray(cached.moderation?.reports) ? cached.moderation.reports : [],
          verifiedUsers: Array.isArray(cached.moderation?.verifiedUsers) && cached.moderation.verifiedUsers.length ? cached.moderation.verifiedUsers : ['admin'],
          feedFrozen: Boolean(cached.moderation?.feedFrozen),
          broadcasts: Array.isArray(cached.moderation?.broadcasts) ? cached.moderation.broadcasts : []
        }
      };
    }
  } catch (_) {}
  return {
    posts: [],
    chat: [],
    dms: [],
    notifications: [],
    moderation: { badWords: [...DEFAULT_CLIENT_BAD_WORDS], warnings: [], mutedUsers: {}, reports: [], verifiedUsers: ['admin'], feedFrozen: false, broadcasts: [] }
  };
})();
window.__communityStateRef = communityState;

let activeFeedFilter = 'all';
let pendingFeedImageData = '';
let expandedCommentPosts = new Set();
let activePublicProfileUsername = '';

function isUserVerified(username) {
  const u = String(username || '').trim().toLowerCase();
  if (!u) return false;
  if (u === 'admin') return true;
  return (communityState.moderation?.verifiedUsers || ['admin']).includes(u);
}

function verifiedTickHtml(username) {
  return isUserVerified(username) ? `<span class="verified-tick" title="ভেরিফাইড মেম্বার">✓</span>` : '';
}

function formatFbTimeAgo(ts, fallback) {
  const n = num(ts);
  if (!n) return fallback || '';
  const diff = Math.max(0, Math.floor((Date.now() - n) / 1000));
  if (diff < 60) return 'এইমাত্র';
  if (diff < 3600) return `${Math.floor(diff / 60)} মিনিট আগে`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ঘণ্টা আগে`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} দিন আগে`;
  return fallback || new Date(n).toLocaleDateString('bn-BD');
}

function resolveUserAvatar(username, displayName, savedPic = '') {
  if (savedPic) return savedPic;
  const u = String(username || '').trim().toLowerCase();
  if (u === 'admin') {
    try {
      const p = JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_legacy-super-admin') || '{}');
      if (p.pic) return p.pic;
    } catch (_) {}
  } else if (u) {
    const acc = readLocalAccounts().find(a => String(a.username || '').trim().toLowerCase() === u);
    if (acc) {
      try {
        const p = JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_' + acc.id) || '{}');
        if (p.pic) return p.pic;
      } catch (_) {}
    }
  }
  return defaultAvatarUrl(displayName || username || 'U');
}

function persistCommunityCache() {
  window.__communityStateRef = communityState;
  try { localStorage.setItem(COMMUNITY_CACHE_KEY, JSON.stringify(communityState)); } catch (_) {}
}

function getCurrentActor() {
  const prof = typeof readProfile === 'function' ? readProfile() : {};
  const uname = String(activeAccount?.username || (activeAccount?.id === 'legacy-super-admin' ? 'admin' : 'user')).trim().toLowerCase();
  const role = activeAccount?.id === 'legacy-super-admin' ? 'super_admin' : (activeAccount?.role || 'user');
  return {
    id: activeAccount?.id || uname || 'anon',
    name: prof.name || activeAccount?.name || 'User',
    username: uname,
    role,
    pic: prof.pic || ''
  };
}

function getSavedPostIds() {
  try { return new Set(JSON.parse(localStorage.getItem(SAVED_POSTS_KEY) || '[]')); } catch (_) { return new Set(); }
}

function getActiveMuteInfo(username) {
  const u = String(username || '').trim().toLowerCase();
  if (!u || u === 'admin') return null;
  const m = communityState.moderation?.mutedUsers?.[u];
  if (!m) return null;
  if (m.until > 0 && Date.now() > m.until) return null;
  return m;
}

window.findClientBadWord = text => {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return null;
  const words = communityState.moderation?.badWords?.length ? communityState.moderation.badWords : DEFAULT_CLIENT_BAD_WORDS;
  for (const w of words) {
    const clean = String(w || '').trim().toLowerCase();
    if (!clean || clean.length < 2) continue;
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-z0-9\\u0980-\\u09ff])${escaped}($|[^a-z0-9\\u0980-\\u09ff])`, 'i');
    if (re.test(normalized) || (clean.length >= 4 && normalized.includes(clean))) return clean;
  }
  return null;
};

function applyCommunitySnapshot(next) {
  if (!next || typeof next !== 'object') return;
  communityState = {
    posts: Array.isArray(next.posts) ? next.posts : [],
    chat: Array.isArray(next.chat) ? next.chat : [],
    dms: Array.isArray(next.dms) ? next.dms : [],
    notifications: Array.isArray(next.notifications) ? next.notifications : [],
    moderation: {
      badWords: Array.isArray(next.moderation?.badWords) ? next.moderation.badWords : [...DEFAULT_CLIENT_BAD_WORDS],
      warnings: Array.isArray(next.moderation?.warnings) ? next.moderation.warnings : [],
      mutedUsers: next.moderation?.mutedUsers && typeof next.moderation.mutedUsers === 'object' ? next.moderation.mutedUsers : {},
      reports: Array.isArray(next.moderation?.reports) ? next.moderation.reports : [],
      verifiedUsers: Array.isArray(next.moderation?.verifiedUsers) && next.moderation.verifiedUsers.length ? next.moderation.verifiedUsers : ['admin'],
      feedFrozen: Boolean(next.moderation?.feedFrozen),
      broadcasts: Array.isArray(next.moderation?.broadcasts) ? next.moderation.broadcasts : []
    }
  };
  persistCommunityCache();
  renderNewsFeed();
  checkMyWarnings();
  if (typeof updateDmUnreadBadge === 'function') updateDmUnreadBadge();
  if ($('dmModal')?.style.display === 'flex' && typeof renderDmModal === 'function') renderDmModal();
  if (typeof updateNotifications === 'function') updateNotifications();
  if (typeof window.__redrawTeamChat === 'function') window.__redrawTeamChat();
  if (isAdminOrSuper() && typeof renderAdminModerationPanel === 'function') renderAdminModerationPanel();
  if (activePublicProfileUsername && $('userPublicProfileModal')?.style.display === 'flex') {
    renderPublicProfileBody(activePublicProfileUsername);
  }
}

window.loadCommunityState = async (showToast = false) => {
  try {
    if (!serverAuthToken) { renderNewsFeed(); return; }
    const res = await serverFetch('/api/community', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    applyCommunitySnapshot(data);
    if (showToast) toast(L('নিউজ ফিড ও কমিউনিটি রিফ্রেশ হয়েছে!', 'News Feed refreshed!'));
  } catch (_) {
    renderNewsFeed();
    if (showToast) toast(L('লোকাল ক্যাশ থেকে দেখানো হচ্ছে', 'Loaded from local cache'), 'warn');
  }
};

window.postCommunityAction = async payload => {
  try {
    const res = await serverFetch('/api/community/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, actor: getCurrentActor() })
    });
    const data = await res.json().catch(() => ({}));
    if (data.community) applyCommunitySnapshot(data.community);
    if (!res.ok) {
      toast(data.error || L('অ্যাকশন সম্পন্ন হয়নি', 'Action failed'), 'error');
      return { ok: false, serverError: true, data };
    }
    return { ok: true, data };
  } catch (_) {
    return { ok: false, offline: true };
  }
};

// --- News Feed UI ---
window.clearFeedImage = () => {
  pendingFeedImageData = '';
  if ($('feedImgFile')) $('feedImgFile').value = '';
  if ($('feedImgPreviewWrap')) $('feedImgPreviewWrap').style.display = 'none';
  if ($('feedImgPreview')) $('feedImgPreview').src = '';
};

window.toggleFeedPollBuilder = () => {
  const box = $('feedPollBuilder');
  if (!box) return;
  const open = box.style.display === 'none' || !box.style.display;
  box.style.display = open ? 'block' : 'none';
};

window.setFeedFilter = (filter, btn) => {
  activeFeedFilter = filter || 'all';
  document.querySelectorAll('#feedFilterBar button[data-feed-filter]').forEach(b => b.classList.toggle('active', b === btn));
  renderNewsFeed();
};

if ($('feedImgFile')) {
  $('feedImgFile').onchange = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      pendingFeedImageData = await compressImageFile(f, 900, 0.82);
      if ($('feedImgPreview')) $('feedImgPreview').src = pendingFeedImageData;
      if ($('feedImgPreviewWrap')) $('feedImgPreviewWrap').style.display = 'flex';
      toast('ছবি যুক্ত হয়েছে!');
    } catch (_) {
      toast('ছবি প্রসেস করা যায়নি', 'error');
    }
  };
}

window.setFeedBgStyle = (bg, btn) => {
  if ($('feedBgStyleInput')) $('feedBgStyleInput').value = bg || '';
  document.querySelectorAll('#feedBgPicker .nf-bg-swatch').forEach(b => b.classList.toggle('active', b === btn));
};

window.toggleFeedReactTray = postId => {
  const el = $('nf_react_wrap_' + postId);
  if (!el) return;
  const open = !el.classList.contains('tray-open');
  document.querySelectorAll('.nf-fb-act-wrap.tray-open').forEach(x => x.classList.remove('tray-open'));
  if (open) el.classList.add('tray-open');
};

window.togglePostDropdown = (id, prefix = 'nf_menu_') => {
  const el = $(prefix + id);
  if (!el) return;
  const wasOpen = el.classList.contains('open');
  document.querySelectorAll('.nf-menu-drop.open').forEach(x => x.classList.remove('open'));
  if (!wasOpen) el.classList.add('open');
};

if (!window.__nfDropdownBound) {
  window.__nfDropdownBound = true;
  document.addEventListener('click', e => {
    if (!e.target.closest('.nf-menu-wrap')) {
      document.querySelectorAll('.nf-menu-drop.open').forEach(x => x.classList.remove('open'));
    }
    if (!e.target.closest('.nf-fb-act-wrap')) {
      document.querySelectorAll('.nf-fb-act-wrap.tray-open').forEach(x => x.classList.remove('tray-open'));
    }
  });
}

if ($('feedPostForm')) {
  $('feedPostForm').onsubmit = async e => {
    e.preventDefault();
    if (communityState.moderation?.feedFrozen && !isSuperAdmin()) {
      return toast('🧊 সুপার অ্যাডমিন বর্তমানে ফিড ফ্রিজ করে রেখেছেন!', 'error');
    }
    const content = ($('feedPostText')?.value || '').trim();
    const tag = $('feedTagSelect')?.value || '🚀 কাজের আপডেট';
    const feeling = $('feedFeelingSelect')?.value || '';
    const platform = $('feedPlatformSelect')?.value || '';
    const workTitle = ($('feedWorkRefInput')?.value || '').trim();
    const bgStyle = pendingFeedImageData ? '' : ($('feedBgStyleInput')?.value || '');
    const official = Boolean(isSuperAdmin() && $('feedOfficialCheck')?.checked);
    const pollOpen = $('feedPollBuilder')?.style.display === 'block';
    let poll = null;
    if (pollOpen) {
      const q = ($('feedPollQuestion')?.value || '').trim();
      const opts = [$('feedPollOpt1')?.value, $('feedPollOpt2')?.value, $('feedPollOpt3')?.value].map(x => String(x || '').trim()).filter(Boolean);
      if (q || opts.length) {
        if (!q || opts.length < 2) return toast('পোলের প্রশ্ন ও অন্তত ২টি অপশন দিন!', 'error');
        poll = { question: q, options: opts };
      }
    }
    if (!content && !pendingFeedImageData && !poll) return toast('পোস্টের লেখা বা ছবি দিন!', 'warn');
    const actor = getCurrentActor();
    const mInfo = getActiveMuteInfo(actor.username);
    if (mInfo && !isSuperAdmin()) return toast(`🔇 আপনি মিউট আছেন: ${mInfo.reason || ''}`, 'error');

    const res = await postCommunityAction({
      action: 'create_post',
      id: uid(),
      tag,
      feeling,
      bgStyle,
      official,
      platform,
      workTitle,
      content,
      imageData: pendingFeedImageData,
      poll
    });
    if (res.offline) {
      const bad = findClientBadWord(content);
      if (bad && !isSuperAdmin()) return toast('⚠️ অশালীন/বাজে শব্দ ব্যবহার নিষিদ্ধ!', 'error');
      communityState.posts.unshift({
        id: uid(),
        authorId: actor.id,
        authorName: actor.name,
        authorUsername: actor.username,
        authorRole: actor.role,
        authorPic: actor.pic,
        tag,
        feeling,
        bgStyle,
        platform,
        workTitle,
        content,
        imageData: pendingFeedImageData,
        poll: poll ? { question: poll.question, options: poll.options.map((label, idx) => ({ id: `opt_${idx}_${uid()}`, label, votes: [] })) } : null,
        reactions: {},
        comments: [],
        shares: 0,
        pinned: official,
        official,
        commentsLocked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        time: new Date().toLocaleString('bn-BD')
      });
      persistCommunityCache();
      renderNewsFeed();
    } else if (!res.ok) {
      return;
    }

    if ($('feedPostText')) $('feedPostText').value = '';
    if ($('feedWorkRefInput')) $('feedWorkRefInput').value = '';
    if ($('feedFeelingSelect')) $('feedFeelingSelect').value = '';
    if ($('feedOfficialCheck')) $('feedOfficialCheck').checked = false;
    setFeedBgStyle('', document.querySelector('#feedBgPicker .nf-bg-swatch[data-bg=""]'));
    if ($('feedPollQuestion')) $('feedPollQuestion').value = '';
    if ($('feedPollOpt1')) $('feedPollOpt1').value = '';
    if ($('feedPollOpt2')) $('feedPollOpt2').value = '';
    if ($('feedPollOpt3')) $('feedPollOpt3').value = '';
    if ($('feedPollBuilder')) $('feedPollBuilder').style.display = 'none';
    clearFeedImage();
    toast('পোস্ট পাবলিশ হয়েছে! 🚀');
  };
}

window.reactFeedPost = async (postId, emoji) => {
  document.querySelectorAll('.nf-fb-act-wrap.tray-open').forEach(x => x.classList.remove('tray-open'));
  const res = await postCommunityAction({ action: 'react_post', postId, emoji });
  if (res.offline) {
    const p = communityState.posts.find(x => x.id === postId);
    if (!p) return;
    const me = getCurrentActor().username || getCurrentActor().id;
    p.reactions = p.reactions || {};
    const hadSame = Array.isArray(p.reactions[emoji]) && p.reactions[emoji].includes(me);
    Object.keys(p.reactions).forEach(em => {
      if (!Array.isArray(p.reactions[em])) { delete p.reactions[em]; return; }
      p.reactions[em] = p.reactions[em].filter(u => u !== me);
      if (!p.reactions[em].length) delete p.reactions[em];
    });
    if (!hadSame) p.reactions[emoji] = [...(p.reactions[emoji] || []), me];
    persistCommunityCache(); renderNewsFeed();
  }
};

window.shareFeedPostToFeed = async postId => {
  const p = communityState.posts.find(x => x.id === postId);
  if (!p) return;
  const note = await askPrompt('রিপোস্টের সাথে কিছু লিখুন (ঐচ্ছিক):', '', 'ফিডে শেয়ার / রিপোস্ট');
  if (note === null) return;
  const res = await postCommunityAction({ action: 'share_post', postId, note });
  if (res.offline) {
    const actor = getCurrentActor();
    p.shares = (p.shares || 0) + 1;
    communityState.posts.unshift({
      id: uid(),
      authorId: actor.id,
      authorName: actor.name,
      authorUsername: actor.username,
      authorRole: actor.role,
      authorPic: actor.pic,
      tag: '↗️ শেয়ার্ড পোস্ট',
      platform: p.platform || '',
      workTitle: '',
      content: note.trim(),
      imageData: '',
      poll: null,
      reactions: {},
      comments: [],
      shares: 0,
      sharedFrom: { id: p.id, authorName: p.authorName, authorUsername: p.authorUsername, content: p.content, imageData: p.imageData || '', time: p.time },
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      time: new Date().toLocaleString('bn-BD')
    });
    persistCommunityCache(); renderNewsFeed();
  } else if (!res.ok) return;
  toast('পোস্ট নিউজ ফিডে শেয়ার হয়েছে! ↗️');
};

window.copyFeedPostText = async postId => {
  const p = communityState.posts.find(x => x.id === postId);
  if (!p) return;
  const txt = `${p.authorName || 'Member'}:\n${p.content || ''}`.trim();
  try { await navigator.clipboard.writeText(txt); toast('পোস্টের লেখা কপি হয়েছে! 📋'); } catch (_) { toast('কপি করা যায়নি', 'warn'); }
};

window.sendPostViaDm = postId => {
  const p = communityState.posts.find(x => x.id === postId);
  if (!p) return;
  openDmModal('', '');
  setTimeout(() => {
    if ($('dmInput')) $('dmInput').value = `📌 শেয়ার্ড পোস্ট (${p.authorName}): ${(p.content || '').slice(0, 140)}`;
  }, 60);
};

window.voteFeedPoll = async (postId, optionId) => {
  const res = await postCommunityAction({ action: 'vote_poll', postId, optionId });
  if (res.offline) {
    const p = communityState.posts.find(x => x.id === postId);
    if (!p?.poll) return;
    const me = getCurrentActor().username || getCurrentActor().id;
    p.poll.options.forEach(o => {
      o.votes = (o.votes || []).filter(u => u !== me);
      if (o.id === optionId) o.votes.push(me);
    });
    persistCommunityCache(); renderNewsFeed();
  }
};

window.pinFeedPost = async postId => {
  const res = await postCommunityAction({ action: 'pin_post', postId });
  if (res.offline) {
    const p = communityState.posts.find(x => x.id === postId);
    if (p) { p.pinned = !p.pinned; persistCommunityCache(); renderNewsFeed(); }
  }
  toast('পিন স্ট্যাটাস আপডেট হয়েছে 📌');
};

window.lockFeedPost = async postId => {
  if (!isSuperAdmin()) return;
  const res = await postCommunityAction({ action: 'lock_post', postId });
  if (res.offline) {
    const p = communityState.posts.find(x => x.id === postId);
    if (p) { p.commentsLocked = !p.commentsLocked; persistCommunityCache(); renderNewsFeed(); }
  }
  toast('কমেন্ট লক স্ট্যাটাস আপডেট হয়েছে 🔒');
};

window.toggleOfficialPost = async postId => {
  if (!isSuperAdmin()) return;
  const res = await postCommunityAction({ action: 'mark_official', postId });
  if (res.offline) {
    const p = communityState.posts.find(x => x.id === postId);
    if (p) { p.official = !p.official; if (p.official) p.pinned = true; persistCommunityCache(); renderNewsFeed(); }
  }
  toast('অফিশিয়াল ঘোষণা আপডেট হয়েছে 📣');
};

window.editFeedPost = async postId => {
  const p = communityState.posts.find(x => x.id === postId);
  if (!p) return;
  const next = await askPrompt('পোস্ট আপডেট করুন:', p.content || '', 'পোস্ট এডিট');
  if (next === null) return;
  const clean = next.trim();
  if (!clean) return toast('পোস্ট খালি রাখা যাবে না', 'error');
  const res = await postCommunityAction({ action: 'edit_post', postId, content: clean });
  if (res.offline) {
    if (findClientBadWord(clean) && !isSuperAdmin()) return toast('⚠️ বাজে শব্দ নিষিদ্ধ!', 'error');
    p.content = clean; p.editedAt = Date.now(); p.updatedAt = Date.now(); persistCommunityCache(); renderNewsFeed();
  } else if (!res.ok) return;
  toast('পোস্ট আপডেট হয়েছে!');
};

window.deleteFeedPost = async postId => {
  if (!(await askConfirm('পোস্টটি ডিলিট করবেন?'))) return;
  const res = await postCommunityAction({ action: 'delete_post', postId });
  if (res.offline) {
    communityState.posts = communityState.posts.filter(x => x.id !== postId);
    persistCommunityCache(); renderNewsFeed();
  }
  toast('পোস্ট ডিলিট হয়েছে', 'warn');
};

window.toggleSaveFeedPost = postId => {
  const s = getSavedPostIds();
  if (s.has(postId)) s.delete(postId); else s.add(postId);
  try { localStorage.setItem(SAVED_POSTS_KEY, JSON.stringify(Array.from(s))); } catch (_) {}
  renderNewsFeed();
  toast(s.has(postId) ? 'পোস্ট সেভ হয়েছে 🔖' : 'সেভ থেকে সরানো হয়েছে');
};

window.toggleFeedComments = (postId, focusInput = false) => {
  if (focusInput) expandedCommentPosts.add(postId);
  else if (expandedCommentPosts.has(postId)) expandedCommentPosts.delete(postId);
  else expandedCommentPosts.add(postId);
  renderNewsFeed();
  if (focusInput) setTimeout(() => $('fc_inp_' + postId)?.focus(), 40);
};

window.submitFeedComment = async (e, postId) => {
  e.preventDefault();
  const inp = $('fc_inp_' + postId);
  const text = (inp?.value || '').trim();
  if (!text) return;
  expandedCommentPosts.add(postId);
  const res = await postCommunityAction({ action: 'add_comment', postId, text });
  if (res.offline) {
    if (findClientBadWord(text) && !isSuperAdmin()) return toast('⚠️ বাজে শব্দ ব্যবহার নিষিদ্ধ!', 'error');
    const p = communityState.posts.find(x => x.id === postId);
    if (!p) return;
    if (p.commentsLocked && !isSuperAdmin()) return toast('🔒 কমেন্ট সেকশন লক করা আছে', 'error');
    const actor = getCurrentActor();
    p.comments = p.comments || [];
    p.comments.push({ id: uid(), authorId: actor.id, authorName: actor.name, authorUsername: actor.username, authorRole: actor.role, text, likes: [], replies: [], createdAt: Date.now(), time: new Date().toLocaleString('bn-BD') });
    persistCommunityCache(); renderNewsFeed();
  } else if (!res.ok) return;
  if (inp) inp.value = '';
};

window.toggleReplyBox = (postId, commentId) => {
  const el = $('fr_box_' + commentId);
  if (!el) return;
  el.style.display = el.style.display === 'flex' ? 'none' : 'flex';
  const inp = $('fr_inp_' + commentId);
  if (el.style.display === 'flex' && inp) inp.focus();
};

window.submitFeedReply = async (e, postId, commentId) => {
  e.preventDefault();
  const inp = $('fr_inp_' + commentId);
  const text = (inp?.value || '').trim();
  if (!text) return;
  expandedCommentPosts.add(postId);
  const res = await postCommunityAction({ action: 'add_reply', postId, commentId, text });
  if (res.offline) {
    if (findClientBadWord(text) && !isSuperAdmin()) return toast('⚠️ বাজে শব্দ ব্যবহার নিষিদ্ধ!', 'error');
    const p = communityState.posts.find(x => x.id === postId);
    const c = p?.comments?.find(x => x.id === commentId);
    if (!c) return;
    const actor = getCurrentActor();
    c.replies = c.replies || [];
    c.replies.push({ id: uid(), authorId: actor.id, authorName: actor.name, authorUsername: actor.username, authorRole: actor.role, text, createdAt: Date.now(), time: new Date().toLocaleString('bn-BD') });
    persistCommunityCache(); renderNewsFeed();
  } else if (!res.ok) return;
  if (inp) inp.value = '';
};

window.likeFeedComment = async (postId, commentId) => {
  const res = await postCommunityAction({ action: 'like_comment', postId, commentId });
  if (res.offline) {
    const p = communityState.posts.find(x => x.id === postId);
    const c = p?.comments?.find(x => x.id === commentId);
    if (!c) return;
    const me = getCurrentActor().username || getCurrentActor().id;
    c.likes = c.likes || [];
    c.likes = c.likes.includes(me) ? c.likes.filter(u => u !== me) : [...c.likes, me];
    persistCommunityCache(); renderNewsFeed();
  }
};

window.deleteFeedComment = async (postId, commentId) => {
  if (!(await askConfirm('কমেন্টটি ডিলিট করবেন?'))) return;
  const res = await postCommunityAction({ action: 'delete_comment', postId, commentId });
  if (res.offline) {
    const p = communityState.posts.find(x => x.id === postId);
    if (p) { p.comments = (p.comments || []).filter(c => c.id !== commentId); persistCommunityCache(); renderNewsFeed(); }
  }
};

window.deleteFeedReply = async (postId, commentId, replyId) => {
  if (!(await askConfirm('রিপ্লাইটি ডিলিট করবেন?'))) return;
  const res = await postCommunityAction({ action: 'delete_reply', postId, commentId, replyId });
  if (res.offline) {
    const p = communityState.posts.find(x => x.id === postId);
    const c = p?.comments?.find(x => x.id === commentId);
    if (c) { c.replies = (c.replies || []).filter(r => r.id !== replyId); persistCommunityCache(); renderNewsFeed(); }
  }
};

window.reportCommunityItem = async (itemType, postId, commentId, msgId, targetUsername, targetName, snippet) => {
  const reason = await askPrompt(`"${targetName}" এর কনটেন্ট রিপোর্ট করার কারণ লিখুন:`, 'বাজে শব্দ / অশালীন আচরণ', 'কনটেন্ট রিপোর্ট');
  if (reason === null) return;
  await postCommunityAction({
    action: 'report_item',
    itemType,
    postId,
    commentId,
    msgId,
    targetUsername,
    targetName,
    reason: reason.trim() || 'নিয়ম ভঙ্গ / বাজে শব্দ',
    snippet
  });
  toast('🚩 রিপোর্ট পাঠানো হয়েছে — সুপার অ্যাডমিন রিভিউ করবেন।');
};

function updateFeedUnreadBadge() {
  const badge = $('feedUnreadBadge');
  if (!badge) return;
  const isFeedOpen = $('newsFeed')?.classList.contains('active');
  const me = getCurrentActor().username;
  const posts = communityState.posts || [];
  const latestTs = posts.reduce((mx, p) => Math.max(mx, num(p.createdAt)), 0);
  const syncFb = () => {
    const fb = $('commFolderBadge'); if (!fb) return;
    const fCnt = $('feedUnreadBadge')?.style.display !== 'none' ? num($('feedUnreadBadge')?.textContent) : 0;
    const cCnt = $('chatUnreadBadge')?.style.display !== 'none' ? num($('chatUnreadBadge')?.textContent) : 0;
    const tot = fCnt + cCnt;
    fb.style.display = tot > 0 ? 'inline-block' : 'none';
    fb.textContent = tot;
  };
  if (isFeedOpen) {
    if (latestTs) localStorage.setItem(FEED_SEEN_KEY, String(latestTs));
    badge.style.display = 'none';
    syncFb();
    return;
  }
  const seenTs = num(localStorage.getItem(FEED_SEEN_KEY));
  const unread = posts.filter(p => num(p.createdAt) > seenTs && String(p.authorUsername || '').toLowerCase() !== me).length;
  badge.style.display = unread > 0 ? 'inline-block' : 'none';
  badge.textContent = unread;
  syncFb();
}

const FB_REACT_LIST = [
  { em: '👍', label: 'লাইক', cls: 'reacted' },
  { em: '❤️', label: 'লাভ', cls: 'reacted-love' },
  { em: '😂', label: 'হাহা', cls: 'reacted-warm' },
  { em: '😮', label: 'ওয়াও', cls: 'reacted-warm' },
  { em: '😢', label: 'স্যাড', cls: 'reacted-warm' },
  { em: '🔥', label: 'ফায়ার', cls: 'reacted-warm' }
];
const FB_REACT_MAP = Object.fromEntries(FB_REACT_LIST.map(r => [r.em, r]));

window.renderNewsFeed = () => {
  updateFeedUnreadBadge();
  const listEl = $('newsFeedList');
  if (!listEl) return;

  const actor = getCurrentActor();
  const me = actor.username;
  const savedSet = getSavedPostIds();
  const q = ($('feedSearchInput')?.value || '').trim().toLowerCase();
  const rawPosts = [...(communityState.posts || [])];
  const isFrozen = Boolean(communityState.moderation?.feedFrozen);

  if ($('feedComposerAvatar')) {
    $('feedComposerAvatar').src = actor.pic || defaultAvatarUrl(actor.name || 'U');
  }
  if ($('feedFreezeNotice')) {
    $('feedFreezeNotice').style.display = isFrozen ? 'flex' : 'none';
  }

  const accs = readLocalAccounts().filter(a => a.status !== 'suspended');
  const peers = getTeamPeersSnapshot();
  const onlineSet = new Set(peers.map(p => String(p.username || '').toLowerCase()).filter(Boolean));
  const saProf = (() => { try { return JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_legacy-super-admin') || '{}'); } catch (_) { return {}; } })();
  const members = [
    { name: saProf.name || 'Super Admin', username: 'admin', role: 'super_admin', pic: saProf.pic || '' },
    ...accs.map(a => {
      const pr = (() => { try { return JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_' + a.id) || '{}'); } catch (_) { return {}; } })();
      return { name: pr.name || a.name, username: a.username, role: a.role, pic: pr.pic || '' };
    })
  ];

  // Facebook-style Active Team / Stories Strip
  if ($('feedStoriesBar')) {
    $('feedStoriesBar').innerHTML = members.map(m => {
      const uname = String(m.username || '').toLowerCase();
      const on = onlineSet.has(uname);
      const av = m.pic || defaultAvatarUrl(m.name || 'U');
      return `<div class="nf-story-pill" onclick="openPublicProfile('${esc(uname)}','${esc(m.name)}','${esc(m.role)}')" title="${esc(m.name)} — প্রোফাইল দেখুন">
        <div class="nf-story-ava">
          <img src="${esc(av)}" onerror="this.src='${esc(defaultAvatarUrl(m.name || 'U'))}'" alt="Story">
          ${on ? `<span class="nf-story-dot"></span>` : ''}
        </div>
        <span class="nf-story-name">${esc(m.name.split(' ')[0])}</span>
      </div>`;
    }).join('');
  }

  // Side widgets
  if ($('feedMembersList')) {
    $('feedMembersList').innerHTML = members.map(m => {
      const uname = String(m.username || '').toLowerCase();
      const on = onlineSet.has(uname);
      const warns = (communityState.moderation?.warnings || []).filter(w => w.targetUsername === uname).length;
      const muted = Boolean(getActiveMuteInfo(uname));
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:8px;background:var(--surface);border:1px solid var(--line);cursor:pointer" onclick="openPublicProfile('${esc(uname)}','${esc(m.name)}','${esc(m.role)}')">
        <span style="font-size:12.5px">${on ? '🟢' : '👤'} <strong>${esc(m.name)}</strong>${verifiedTickHtml(uname)} ${muted ? '🔇' : ''}${warns && isSuperAdmin() ? ` <span class="bad" style="font-size:10px">⚠️${warns}</span>` : ''}</span>
        <span class="badge-admin" style="font-size:9.5px">${esc(m.role === 'super_admin' ? 'Owner' : m.role)}</span>
      </div>`;
    }).join('');
  }

  if ($('feedModerationSummary')) {
    const myWarns = (communityState.moderation?.warnings || []).filter(w => w.targetUsername === me).length;
    const myMute = getActiveMuteInfo(me);
    const openReports = (communityState.moderation?.reports || []).filter(r => r.status === 'open').length;
    const latestBc = (communityState.moderation?.broadcasts || [])[0];
    $('feedModerationSummary').innerHTML = `
      <div>• মোট পোস্ট: <strong>${rawPosts.length}</strong> ${isFrozen ? '<span class="badge-danger" style="margin-left:4px">🧊 ফ্রিজড</span>' : ''}</div>
      <div>• অশালীন/বাজে শব্দ ব্যবহার করলে অটো ব্লক ও সতর্কতা দেওয়া হবে।</div>
      <div>• যেকোনো নামের উপর ক্লিক করে প্রোফাইল ও মেসেজ দিন।</div>
      ${latestBc ? `<div style="margin-top:8px;padding:7px 9px;border-radius:8px;background:rgba(24,119,242,.08);border:1px solid rgba(24,119,242,.25);font-size:11.5px">📣 <strong>শেষ ব্রডকাস্ট:</strong> ${esc(latestBc.text)}</div>` : ''}
      ${myMute ? `<div class="bad" style="margin-top:6px">🔇 আপনার পোস্টিং মিউট আছে (${esc(myMute.reason)})</div>` : ''}
      ${myWarns ? `<div class="bad" style="margin-top:4px">⚠️ আপনার মোট সতর্কবার্তা: ${myWarns}টি</div>` : ''}
      ${isSuperAdmin() ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="warn sm" style="margin:0" onclick="goToSection('adminPanel');switchAdminSubTab('moderation')">🚨 কমান্ড সেন্টার (${openReports})</button></div>` : ''}
    `;
  }

  let filtered = rawPosts.filter(p => {
    if (activeFeedFilter === 'pinned' && !p.pinned) return false;
    if (activeFeedFilter === 'official' && !p.official) return false;
    if (activeFeedFilter === 'help' && !String(p.tag || '').includes('সমস্যা')) return false;
    if (activeFeedFilter === 'saved' && !savedSet.has(p.id)) return false;
    if (activeFeedFilter === 'mine' && String(p.authorUsername || '').toLowerCase() !== me) return false;
    if (q && !`${p.authorName} ${p.authorUsername} ${p.content} ${p.tag} ${p.platform} ${p.workTitle} ${p.feeling || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  if (activeFeedFilter === 'popular') {
    filtered.sort((a, b) => {
      const score = x => Object.values(x.reactions || {}).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0) + (x.comments?.length || 0) * 2 + num(x.shares);
      return score(b) - score(a);
    });
  } else {
    filtered.sort((a, b) => (b.official ? 1 : 0) - (a.official ? 1 : 0) || (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || num(b.createdAt) - num(a.createdAt));
  }

  if (!filtered.length) {
    listEl.innerHTML = `<div class="nf-card" style="text-align:center;padding:28px"><div style="font-size:28px;margin-bottom:6px">📰</div><strong>${L('এখনো কোনো পোস্ট নেই', 'No posts yet')}</strong><p class="muted" style="margin:6px 0 0">${L('উপরের বক্স থেকে আপনার কাজের আপডেট, সাফল্য বা প্রশ্ন শেয়ার করুন!', 'Share your first work update, tip or question above!')}</p></div>`;
    return;
  }

  const myPic = actor.pic || defaultAvatarUrl(actor.name || 'U');

  listEl.innerHTML = filtered.map(p => {
    const pUser = String(p.authorUsername || '').toLowerCase();
    const isOwner = pUser && pUser === me;
    const isAuthorOn = onlineSet.has(pUser);
    const pic = p.authorPic || resolveUserAvatar(pUser, p.authorName, '');
    const roleLabel = p.authorRole === 'super_admin' ? 'Super Admin' : (p.authorRole === 'admin' ? 'Admin' : (p.authorRole === 'staff' ? 'Staff' : 'User'));
    const allReactEntries = Object.entries(p.reactions || {}).filter(([, arr]) => Array.isArray(arr) && arr.length > 0);
    const totalReacts = allReactEntries.reduce((s, [, a]) => s + a.length, 0);
    const myReactionEmoji = allReactEntries.find(([, arr]) => arr.includes(me))?.[0] || '';
    const myReactMeta = FB_REACT_MAP[myReactionEmoji] || (myReactionEmoji ? { em: myReactionEmoji, label: 'রিঅ্যাক্ট', cls: 'reacted' } : null);
    const topReactEmojis = allReactEntries.sort((a, b) => b[1].length - a[1].length).slice(0, 3).map(([em]) => em);
    const totalComments = (p.comments || []).length;
    const totalReplies = (p.comments || []).reduce((s, c) => s + (c.replies?.length || 0), 0);
    const shareCount = num(p.shares);
    const isCommentsOpen = expandedCommentPosts.has(p.id) || totalComments <= 2;

    let pollHtml = '';
    if (p.poll && Array.isArray(p.poll.options)) {
      const totVotes = p.poll.options.reduce((s, o) => s + (o.votes?.length || 0), 0);
      pollHtml = `<div class="nf-poll">
        <strong style="font-size:13px">📊 ${esc(p.poll.question)}</strong>
        ${p.poll.options.map(o => {
          const cnt = o.votes?.length || 0;
          const pct = totVotes ? Math.round((cnt / totVotes) * 100) : 0;
          const voted = (o.votes || []).includes(me);
          return `<div class="nf-poll-opt ${voted ? 'voted' : ''}" onclick="voteFeedPoll('${esc(p.id)}','${esc(o.id)}')">
            <div class="nf-poll-fill" style="width:${pct}%"></div>
            <span>${voted ? '✅ ' : ''}${esc(o.label)}</span>
            <strong>${pct}% (${cnt})</strong>
          </div>`;
        }).join('')}
        <small class="muted">মোট ভোট: ${totVotes}</small>
      </div>`;
    }

    const sharedBoxHtml = p.sharedFrom ? `<div class="nf-shared-box">
      <div style="font-size:12px;margin-bottom:4px">
        <strong class="nf-author-link" style="font-size:12.5px" onclick="openPublicProfile('${esc(p.sharedFrom.authorUsername)}','${esc(p.sharedFrom.authorName)}')">${esc(p.sharedFrom.authorName)}</strong>
        ${verifiedTickHtml(p.sharedFrom.authorUsername)}
        <small class="muted"> · ${esc(p.sharedFrom.time || '')}</small>
      </div>
      ${p.sharedFrom.content ? `<div style="font-size:13px;white-space:pre-line">${esc(p.sharedFrom.content)}</div>` : ''}
      ${p.sharedFrom.imageData ? `<img src="${esc(p.sharedFrom.imageData)}" class="nf-post-img" style="max-height:240px;margin-top:6px" onclick="openLightbox(this.src)" alt="Shared">` : ''}
    </div>` : '';

    const canCommentHere = !p.commentsLocked || isSuperAdmin();
    const commentsHtml = isCommentsOpen ? `<div class="nf-comments">
      ${p.commentsLocked ? `<div style="font-size:11.5px;padding:6px 10px;border-radius:8px;background:var(--soft);border:1px solid var(--line);color:var(--muted)">🔒 এই পোস্টের কমেন্ট সেকশন সুপার অ্যাডমিন দ্বারা লক করা আছে।</div>` : ''}
      ${(p.comments || []).map(c => {
        const cUser = String(c.authorUsername || '').toLowerCase();
        const cAva = resolveUserAvatar(cUser, c.authorName, '');
        const cLikes = c.likes || [];
        const cLiked = cLikes.includes(me);
        const canDelC = isSuperAdmin() || cUser === me;
        const repliesHtml = (c.replies || []).length ? `<div class="nf-replies">${c.replies.map(r => {
          const rUser = String(r.authorUsername || '').toLowerCase();
          const rAva = resolveUserAvatar(rUser, r.authorName, '');
          const canDelR = isSuperAdmin() || rUser === me;
          return `<div class="nf-reply-item">
            <img src="${esc(rAva)}" class="nf-r-ava" onerror="this.src='${esc(defaultAvatarUrl(r.authorName || 'U'))}'" alt="R">
            <div style="flex:1;min-width:0">
              <div class="nf-c-bubble" style="padding:5px 10px;font-size:12.5px">
                <strong class="nf-author-link" style="font-size:12px" onclick="openPublicProfile('${esc(rUser)}','${esc(r.authorName)}','${esc(r.authorRole)}')">${esc(r.authorName)}</strong>${verifiedTickHtml(rUser)}
                <div style="margin-top:1px">${esc(r.text)}</div>
              </div>
              <div class="nf-c-meta">
                <span>${formatFbTimeAgo(r.createdAt, r.time)}</span>
                ${canDelR ? `<button type="button" onclick="deleteFeedReply('${esc(p.id)}','${esc(c.id)}','${esc(r.id)}')">মুছুন</button>` : ''}
              </div>
            </div>
          </div>`;
        }).join('')}</div>` : '';

        return `<div class="nf-comment-item">
          <img src="${esc(cAva)}" class="nf-c-ava" onerror="this.src='${esc(defaultAvatarUrl(c.authorName || 'U'))}'" alt="C">
          <div class="nf-c-body">
            <div class="nf-c-bubble">
              <strong class="nf-author-link" style="font-size:12.5px" onclick="openPublicProfile('${esc(cUser)}','${esc(c.authorName)}','${esc(c.authorRole)}')">${esc(c.authorName)}</strong>${verifiedTickHtml(cUser)}
              <div style="margin-top:2px">${esc(c.text)}</div>
            </div>
            <div class="nf-c-meta">
              <button type="button" class="${cLiked ? 'liked-txt' : ''}" onclick="likeFeedComment('${esc(p.id)}','${esc(c.id)}')">${cLiked ? '💙 লাইকড' : 'লাইক'}${cLikes.length ? ` (${cLikes.length})` : ''}</button>
              ${canCommentHere ? `<button type="button" onclick="toggleReplyBox('${esc(p.id)}','${esc(c.id)}')">রিপ্লাই${(c.replies || []).length ? ` (${c.replies.length})` : ''}</button>` : ''}
              <span>${formatFbTimeAgo(c.createdAt, c.time)}</span>
              ${cUser !== me ? `<button type="button" onclick="reportCommunityItem('comment','${esc(p.id)}','${esc(c.id)}','','${esc(cUser)}','${esc(c.authorName)}','${esc(c.text.slice(0, 90))}')">রিপোর্ট</button>` : ''}
              ${isSuperAdmin() && cUser !== me && cUser !== 'admin' ? `<button type="button" style="color:#b45309" onclick="openPublicProfile('${esc(cUser)}','${esc(c.authorName)}','${esc(c.authorRole)}')">⚠️ কন্ট্রোল</button>` : ''}
              ${canDelC ? `<button type="button" style="color:#dc2626" onclick="deleteFeedComment('${esc(p.id)}','${esc(c.id)}')">মুছুন</button>` : ''}
            </div>
            ${repliesHtml}
            ${canCommentHere ? `<form id="fr_box_${esc(c.id)}" style="display:none;gap:6px;margin-top:6px" onsubmit="submitFeedReply(event,'${esc(p.id)}','${esc(c.id)}')">
              <input id="fr_inp_${esc(c.id)}" type="text" placeholder="রিপ্লাই লিখুন..." style="flex:1;padding:6px 12px;font-size:12px;border-radius:99px">
              <button type="submit" class="sm" style="margin:0;border-radius:99px">পাঠান</button>
            </form>` : ''}
          </div>
        </div>`;
      }).join('')}
      ${canCommentHere ? `<form class="nf-c-composer" onsubmit="submitFeedComment(event,'${esc(p.id)}')">
        <img src="${esc(myPic)}" class="nf-c-ava" onerror="this.src='${esc(defaultAvatarUrl(actor.name || 'U'))}'" alt="Me">
        <input id="fc_inp_${esc(p.id)}" type="text" placeholder="একটি কমেন্ট লিখুন...">
        <button type="submit" class="sm" style="margin:0;border-radius:99px;background:#1877f2">পাঠান</button>
      </form>` : ''}
    </div>` : '';

    const useBgCard = p.bgStyle && !p.imageData && !p.poll && !p.sharedFrom && p.content && p.content.length <= 260;

    return `<div class="nf-card ${p.pinned ? 'pinned' : ''} ${p.official ? 'official' : ''}">
      ${p.official ? `<div class="nf-official-ribbon">📣 অফিশিয়াল এজেন্সি ঘোষণা</div>` : ''}
      <div class="nf-card-head">
        <div class="nf-author" onclick="openPublicProfile('${esc(pUser)}','${esc(p.authorName)}','${esc(p.authorRole)}')" title="ক্লিক করে প্রোফাইল দেখুন">
          <div class="nf-ava-wrap">
            <img src="${esc(pic)}" onerror="this.src='${esc(defaultAvatarUrl(p.authorName || 'U'))}'" alt="Avatar">
            ${isAuthorOn ? `<span class="nf-ava-online"></span>` : ''}
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
              <span class="nf-author-link">${esc(p.authorName || 'User')}</span>
              ${verifiedTickHtml(pUser)}
              <span class="badge-admin" style="font-size:9.5px">${esc(roleLabel)}</span>
              ${p.feeling ? `<small class="muted" style="font-size:12px">— অনুভূতি: <strong>${esc(p.feeling)}</strong></small>` : ''}
            </div>
            <small class="muted" style="display:block;font-size:11.5px">${formatFbTimeAgo(p.createdAt, p.time)} · 🌐 ${esc(p.tag || 'আপডেট')}${p.platform ? ` · ${esc(p.platform)}` : ''}${p.pinned ? ' · 📌 পিন্ড' : ''}${p.commentsLocked ? ' · 🔒' : ''}${p.editedAt ? ' · এডিটেড' : ''}</small>
          </div>
        </div>
        <div class="nf-menu-wrap">
          <button type="button" class="secondary sm" style="margin:0;padding:4px 10px;border-radius:99px;font-weight:800" onclick="togglePostDropdown('${esc(p.id)}','nf_menu_')" title="পোস্ট অপশন">•••</button>
          <div id="nf_menu_${esc(p.id)}" class="nf-menu-drop">
            <button type="button" onclick="toggleSaveFeedPost('${esc(p.id)}');togglePostDropdown('${esc(p.id)}','nf_menu_')">${savedSet.has(p.id) ? '🔖 সেভ থেকে সরান' : '🔖 পোস্ট সেভ করুন'}</button>
            <button type="button" onclick="copyFeedPostText('${esc(p.id)}');togglePostDropdown('${esc(p.id)}','nf_menu_')">📋 লেখা কপি করুন</button>
            ${isAdminOrSuper() ? `<button type="button" onclick="pinFeedPost('${esc(p.id)}');togglePostDropdown('${esc(p.id)}','nf_menu_')">${p.pinned ? '📌 আনপিন করুন' : '📌 টপে পিন করুন'}</button>` : ''}
            ${isSuperAdmin() ? `<button type="button" onclick="toggleOfficialPost('${esc(p.id)}');togglePostDropdown('${esc(p.id)}','nf_menu_')">${p.official ? '📣 অফিশিয়াল সরান' : '📣 অফিশিয়াল ঘোষণা'}</button>` : ''}
            ${isSuperAdmin() ? `<button type="button" onclick="lockFeedPost('${esc(p.id)}');togglePostDropdown('${esc(p.id)}','nf_menu_')">${p.commentsLocked ? '🔓 কমেন্ট আনলক' : '🔒 কমেন্ট লক করুন'}</button>` : ''}
            ${(isSuperAdmin() || isOwner) ? `<button type="button" onclick="editFeedPost('${esc(p.id)}');togglePostDropdown('${esc(p.id)}','nf_menu_')">✏️ এডিট করুন</button>` : ''}
            ${isSuperAdmin() && !isOwner && pUser !== 'admin' ? `<button type="button" onclick="togglePostDropdown('${esc(p.id)}','nf_menu_');openPublicProfile('${esc(pUser)}','${esc(p.authorName)}','${esc(p.authorRole)}')">🛡️ সুপার অ্যাডমিন কন্ট্রোল</button>` : ''}
            ${!isOwner ? `<button type="button" onclick="togglePostDropdown('${esc(p.id)}','nf_menu_');reportCommunityItem('post','${esc(p.id)}','','','${esc(pUser)}','${esc(p.authorName)}','${esc((p.content || '').slice(0, 100))}')">🚩 রিপোর্ট করুন</button>` : ''}
            ${(isSuperAdmin() || isOwner) ? `<button type="button" class="danger-item" onclick="togglePostDropdown('${esc(p.id)}','nf_menu_');deleteFeedPost('${esc(p.id)}')">🗑️ পোস্ট ডিলিট</button>` : ''}
          </div>
        </div>
      </div>
      ${p.workTitle ? `<div style="font-size:12px;color:#1877f2;font-weight:700;margin-bottom:6px">🎯 ${esc(p.workTitle)}</div>` : ''}
      ${useBgCard ? `<div class="nf-bg-card nf-bg-${esc(p.bgStyle)}">${esc(p.content)}</div>` : (p.content ? `<div class="nf-body">${esc(p.content)}</div>` : '')}
      ${sharedBoxHtml}
      ${pollHtml}
      ${p.imageData ? `<img src="${esc(p.imageData)}" class="nf-post-img" onclick="openLightbox(this.src)" alt="Post Media">` : ''}
      ${(totalReacts || totalComments || shareCount) ? `<div class="nf-fb-stats">
        <span class="nf-react-pills">${totalReacts ? `<span class="nf-react-emojis">${topReactEmojis.map(em => `<span>${em}</span>`).join('')}</span> <span>${totalReacts} জন</span>` : ''}</span>
        <span style="cursor:pointer" onclick="toggleFeedComments('${esc(p.id)}')">${totalComments ? `${totalComments + totalReplies} কমেন্ট` : ''}${totalComments && shareCount ? ' · ' : ''}${shareCount ? `${shareCount} শেয়ার` : ''}</span>
      </div>` : ''}
      <div class="nf-fb-actions">
        <div class="nf-fb-act-wrap" id="nf_react_wrap_${esc(p.id)}">
          <div class="nf-fb-react-tray">
            ${FB_REACT_LIST.map(r => `<button type="button" title="${r.label}" onclick="reactFeedPost('${esc(p.id)}','${r.em}')">${r.em}</button>`).join('')}
          </div>
          <button type="button" class="nf-fb-act-btn ${myReactMeta ? myReactMeta.cls : ''}" onclick="reactFeedPost('${esc(p.id)}','${myReactionEmoji || '👍'}')" oncontextmenu="event.preventDefault();toggleFeedReactTray('${esc(p.id)}')">
            <span>${myReactMeta ? myReactMeta.em : '👍'}</span>
            <span>${myReactMeta ? myReactMeta.label : 'লাইক'}</span>
          </button>
        </div>
        <button type="button" class="nf-fb-act-btn" onclick="toggleFeedComments('${esc(p.id)}', true)">💬 কমেন্ট</button>
        <div class="nf-menu-wrap" style="display:flex">
          <button type="button" class="nf-fb-act-btn" onclick="togglePostDropdown('${esc(p.id)}','nf_share_')">↗️ শেয়ার</button>
          <div id="nf_share_${esc(p.id)}" class="nf-menu-drop" style="bottom:100%;top:auto;margin-bottom:4px">
            <button type="button" onclick="togglePostDropdown('${esc(p.id)}','nf_share_');shareFeedPostToFeed('${esc(p.id)}')">📰 নিউজ ফিডে শেয়ার করুন</button>
            <button type="button" onclick="togglePostDropdown('${esc(p.id)}','nf_share_');sendPostViaDm('${esc(p.id)}')">✉️ প্রাইভেট মেসেজে (DM) পাঠান</button>
            <button type="button" onclick="togglePostDropdown('${esc(p.id)}','nf_share_');copyFeedPostText('${esc(p.id)}')">📋 লেখা কপি করুন</button>
          </div>
        </div>
      </div>
      ${commentsHtml}
    </div>`;
  }).join('');
};

// --- Public Profile Modal (Only Public Profile for Users; Full Control for Super Admin) ---
window.openPublicProfile = (username, fallbackName = '', fallbackRole = 'user') => {
  const uname = String(username || '').trim().toLowerCase();
  if (!uname) return toast('এই ইউজারের প্রোফাইল পাওয়া যায়নি', 'warn');
  activePublicProfileUsername = uname;
  renderPublicProfileBody(uname, fallbackName, fallbackRole);
  if ($('userPublicProfileModal')) $('userPublicProfileModal').style.display = 'flex';
};

function renderPublicProfileBody(uname, fallbackName = '', fallbackRole = 'user') {
  const body = $('upModalBody'), title = $('upModalTitle');
  if (!body) return;

  const accs = readLocalAccounts();
  let acc = null;
  let prof = {};
  if (uname === 'admin') {
    acc = { id: 'legacy-super-admin', username: 'admin', name: 'Super Admin', role: 'super_admin', status: 'active', plan: 'Owner · Lifetime', userNumber: 1 };
    try { prof = JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_legacy-super-admin') || '{}'); } catch (_) {}
  } else {
    acc = accs.find(a => String(a.username || '').trim().toLowerCase() === uname) || null;
    if (acc) {
      try { prof = JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_' + acc.id) || '{}'); } catch (_) {}
    }
  }

  const displayName = prof.name || acc?.name || fallbackName || uname;
  const role = acc?.id === 'legacy-super-admin' ? 'super_admin' : (acc?.role || fallbackRole || 'user');
  const roleLabel = role === 'super_admin' ? 'Super Admin' : (role === 'admin' ? 'Admin' : (role === 'staff' ? 'Staff' : 'User'));
  const pic = prof.pic || defaultAvatarUrl(displayName);
  const bio = prof.bio || acc?.bio || (role === 'super_admin' ? 'এজেন্সি ওনার ও সিস্টেম অ্যাডমিন' : 'ডিজিটাল মার্কেটিং ও অ্যাডস টিম মেম্বার');

  const peers = getTeamPeersSnapshot();
  const isOnline = peers.some(p => String(p.username || '').toLowerCase() === uname);
  const inVoice = peers.some(p => String(p.username || '').toLowerCase() === uname && p.inVoice);

  const userPosts = (communityState.posts || []).filter(p => String(p.authorUsername || '').toLowerCase() === uname);
  const reactionsGot = userPosts.reduce((s, p) => s + Object.values(p.reactions || {}).reduce((a, b) => a + (Array.isArray(b) ? b.length : 0), 0), 0);
  const commentsMade = (communityState.posts || []).reduce((s, p) => s + (p.comments || []).filter(c => String(c.authorUsername || '').toLowerCase() === uname).length, 0);

  const warnings = (communityState.moderation?.warnings || []).filter(w => w.targetUsername === uname);
  const muteInfo = getActiveMuteInfo(uname);

  if (title) title.textContent = isSuperAdmin() ? `🛡️ ${displayName} — প্রোফাইল ও সুপার অ্যাডমিন কন্ট্রোল` : `👤 ${displayName} — পাবলিক প্রোফাইল`;

  const recentPostsHtml = userPosts.slice(0, 4).map(p => `<div style="padding:8px 10px;border-radius:8px;background:var(--surface);border:1px solid var(--line);margin-bottom:6px;font-size:12.5px">
    <div style="display:flex;justify-content:space-between;gap:6px"><span class="nf-tag">${esc(p.tag || 'আপডেট')}</span><small class="muted">${esc(p.time)}</small></div>
    <div style="margin-top:4px">${esc((p.content || '🖼️ ছবি পোস্ট').slice(0, 140))}</div>
  </div>`).join('') || `<small class="muted">এখনো কোনো পাবলিক পোস্ট নেই।</small>`;

  let superAdminHtml = '';
  if (isSuperAdmin() && uname !== 'admin') {
    const canAccManage = Boolean(acc && acc.id && acc.id !== 'legacy-super-admin');
    const warnHistoryHtml = warnings.length
      ? warnings.slice(0, 4).map(w => `<div style="font-size:11.5px;padding:5px 8px;border-radius:6px;background:rgba(220,38,38,.08);margin-bottom:4px">⚠️ <strong>${esc(w.reason)}</strong> <small class="muted">(${esc(w.time)}) ${w.ack ? '✓ দেখেছে' : '⏳ পেন্ডিং'}</small></div>`).join('')
      : `<small class="muted">কোনো সতর্কবার্তা নেই।</small>`;

    superAdminHtml = `<div class="up-admin-deck">
      <h4 style="margin:0 0 8px;color:#b91c1c">🛡️ সুপার অ্যাডমিন পূর্ণ কন্ট্রোল (অন্য কেউ দেখতে পাবে না)</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px;font-size:12px;margin-bottom:10px">
        <div>📱 মোবাইল: <strong>${esc(prof.phone || acc?.phone || '—')}</strong></div>
        <div>📧 ইমেইল: <strong>${esc(prof.email || acc?.email || '—')}</strong></div>
        <div>🎖️ প্ল্যান: <strong>${esc(acc?.plan || 'Standard')} ${acc?.expiryDate ? `(${acc.expiryDate})` : ''}</strong></div>
        <div>🔐 স্ট্যাটাস: <strong class="${acc?.status === 'suspended' ? 'bad' : 'good'}">${esc(acc?.status || 'active')}</strong> ${muteInfo ? '<span class="bad">(🔇 মিউট)</span>' : ''}</div>
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        ${canAccManage ? `<button type="button" class="secondary sm" onclick="closeModal('userPublicProfileModal');impersonateUser('${esc(acc.id)}')">👁️ প্রিভিউ লগইন</button>` : ''}
        ${canAccManage ? `<button type="button" class="secondary sm" onclick="closeModal('userPublicProfileModal');openEditUserModal('${esc(acc.id)}')">✏️ অ্যাকাউন্ট এডিট</button>` : ''}
        ${canAccManage ? `<button type="button" class="secondary sm" onclick="quickResetUserPass('${esc(acc.id)}')">🔑 পাসওয়ার্ড রিসেট</button>` : ''}
        <button type="button" class="secondary sm" onclick="verifyCommunityUser('${esc(uname)}')">${isUserVerified(uname) ? '☑️ ভেরিফাইড সরান' : '☑️ ভেরিফাইড ব্যাজ দিন'}</button>
        ${canAccManage ? `<button type="button" class="warn sm" onclick="toggleUserStatus('${esc(acc.id)}');setTimeout(()=>openPublicProfile('${esc(uname)}'),80)">${acc.status === 'active' ? '⛔ সাসপেন্ড / ব্লক' : '✓ আনব্লক করুন'}</button>` : ''}
        ${muteInfo
          ? `<button type="button" class="secondary sm" onclick="muteCommunityUser('${esc(uname)}',0,true)">🔊 আনমিউট</button>`
          : `<button type="button" class="warn sm" onclick="muteCommunityUser('${esc(uname)}',24,false)">🔇 ২৪ঘ মিউট</button>`}
        ${warnings.length ? `<button type="button" class="secondary sm" onclick="clearUserWarnings('${esc(uname)}')">🧹 সতর্কতা ক্লিয়ার</button>` : ''}
        <button type="button" class="danger sm" onclick="purgeUserContent('${esc(uname)}','${esc(displayName)}')">🗑️ সব পোস্ট/চ্যাট মুছুন</button>
      </div>

      <form onsubmit="submitWarnFromProfile(event,'${esc(uname)}','${esc(displayName)}')" style="display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:center;margin-bottom:8px">
        <input id="upWarnReasonInput" type="text" placeholder="বাজে শব্দ বা নিয়ম ভঙ্গের সতর্কবার্তা লিখুন..." required style="font-size:12.5px">
        <select id="upWarnMuteSelect" style="width:auto;font-size:12px">
          <option value="0">শুধু সতর্কবার্তা</option>
          <option value="1">সতর্ক + ১ ঘন্টা মিউট</option>
          <option value="24">সতর্ক + ২৪ ঘন্টা মিউট</option>
          <option value="9999">সতর্ক + স্থায়ী মিউট</option>
        </select>
        <button type="submit" class="danger sm" style="margin:0">⚠️ সতর্ক করুন</button>
      </form>
      <div><strong style="font-size:12px;display:block;margin-bottom:4px">📋 সতর্কতার ইতিহাস (${warnings.length}):</strong>${warnHistoryHtml}</div>
    </div>`;
  }

  body.innerHTML = `
    <div class="up-header">
      <img src="${esc(pic)}" onerror="this.src='${esc(defaultAvatarUrl(displayName))}'" alt="Avatar" class="up-avatar-lg">
      <div style="flex:1">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <h3 style="margin:0">${esc(displayName)}${verifiedTickHtml(uname)}</h3>
          <span class="badge-admin">${esc(roleLabel)}</span>
          ${isOnline ? '<span class="badge-success">🟢 অনলাইন</span>' : ''}
          ${inVoice ? '<span class="badge-status status-running">🔊 ভয়েস রুমে</span>' : ''}
          ${muteInfo ? '<span class="badge-danger">🔇 মিউটেড</span>' : ''}
        </div>
        <small class="muted">@${esc(uname)}</small>
        <p style="margin:6px 0 0;font-size:13px">${esc(bio)}</p>
      </div>
    </div>
    <div class="up-stats">
      <div class="up-stat-box"><small class="muted">📰 মোট পোস্ট</small><strong>${userPosts.length}</strong></div>
      <div class="up-stat-box"><small class="muted">👍 পাওয়া রিঅ্যাকশন</small><strong>${reactionsGot}</strong></div>
      <div class="up-stat-box"><small class="muted">💬 কমেন্ট</small><strong>${commentsMade}</strong></div>
    </div>
    ${uname !== getCurrentActor().username ? `<div style="margin-bottom:10px"><button type="button" class="sm" onclick="closeModal('userPublicProfileModal');openDmModal('${esc(uname).replace(/'/g, "\\'")}','${esc(displayName).replace(/'/g, "\\'")}')">✉️ প্রাইভেট মেসেজ (DM) পাঠান</button></div>` : ''}
    <div style="margin-bottom:8px">
      <h4 style="margin:0 0 8px">📝 সাম্প্রতিক পাবলিক পোস্ট</h4>
      ${recentPostsHtml}
    </div>
    ${superAdminHtml}
  `;
}

window.submitWarnFromProfile = async (e, uname, displayName) => {
  e.preventDefault();
  const reason = ($('upWarnReasonInput')?.value || '').trim();
  const muteHours = Number($('upWarnMuteSelect')?.value || 0);
  if (!reason) return;
  await warnCommunityUser(uname, displayName, reason, muteHours);
  if ($('upWarnReasonInput')) $('upWarnReasonInput').value = '';
};

window.warnCommunityUser = async (targetUsername, targetName, reason, muteHours = 0) => {
  if (!isSuperAdmin()) return;
  const res = await postCommunityAction({ action: 'warn_user', targetUsername, targetName, reason, muteHours });
  if (res.offline) {
    communityState.moderation.warnings.unshift({ id: uid(), targetUsername, targetName, reason, issuedBy: getCurrentActor().name, ts: Date.now(), time: new Date().toLocaleString('bn-BD'), ack: false });
    if (muteHours > 0) communityState.moderation.mutedUsers[targetUsername] = { until: muteHours >= 9999 ? 0 : Date.now() + muteHours * 3600000, reason, by: getCurrentActor().name };
    persistCommunityCache(); renderNewsFeed(); renderAdminModerationPanel();
  }
  toast(`⚠️ ${targetName} কে সতর্কবার্তা পাঠানো হয়েছে!`);
};

window.muteCommunityUser = async (targetUsername, hours, unmute = false) => {
  if (!isSuperAdmin()) return;
  await postCommunityAction({ action: 'mute_user', targetUsername, hours, unmute, reason: 'সুপার অ্যাডমিন কর্তৃক মিউট' });
  toast(unmute ? '🔊 ইউজার আনমিউট করা হয়েছে!' : '🔇 ইউজার মিউট করা হয়েছে!', 'warn');
};

window.clearUserWarnings = async targetUsername => {
  if (!isSuperAdmin()) return;
  await postCommunityAction({ action: 'clear_warnings', targetUsername });
  toast('সতর্কতা ও মিউট ক্লিয়ার করা হয়েছে!');
};

window.purgeUserContent = async (targetUsername, displayName) => {
  if (!isSuperAdmin() || !(await askConfirm(`${displayName} (@${targetUsername})-এর সব পোস্ট, কমেন্ট ও চ্যাট মেসেজ মুছে ফেলবেন?`))) return;
  await postCommunityAction({ action: 'purge_user_content', targetUsername });
  toast('ইউজারের সব পোস্ট ও চ্যাট মুছে ফেলা হয়েছে!', 'warn');
};

// --- Warning Banner & Admin Moderation Panel ---
window.checkMyWarnings = () => {
  const banner = $('userWarningBanner'), txtEl = $('userWarningBannerText');
  if (!banner || !txtEl || !activeAccount) return;
  const me = getCurrentActor().username;
  if (!me || isSuperAdmin()) { banner.style.display = 'none'; return; }
  const unack = (communityState.moderation?.warnings || []).filter(w => w.targetUsername === me && !w.ack);
  const mute = getActiveMuteInfo(me);
  if (!unack.length && !mute) { banner.style.display = 'none'; return; }
  const parts = [];
  if (unack.length) parts.push(`⚠️ সুপার অ্যাডমিনের সতর্কবার্তা (${unack.length}): "${unack[0].reason}"`);
  if (mute) parts.push(`🔇 আপনার পোস্ট/চ্যাট মিউট করা আছে (${mute.reason})`);
  txtEl.textContent = parts.join(' · ');
  banner.style.display = 'flex';
};

window.acknowledgeMyWarnings = async () => {
  const me = getCurrentActor().username;
  (communityState.moderation?.warnings || []).forEach(w => { if (w.targetUsername === me) w.ack = true; });
  persistCommunityCache();
  checkMyWarnings();
  await postCommunityAction({ action: 'ack_warning' });
  toast('সতর্কবার্তা গ্রহণ করা হয়েছে — দয়া করে শালীন ভাষা ব্যবহার করুন।');
};

window.saveBadWordsList = async () => {
  if (!isSuperAdmin()) return;
  const raw = ($('saBadWordsInput')?.value || '');
  const words = raw.split(/[,\n]+/).map(w => w.trim().toLowerCase()).filter(Boolean);
  await postCommunityAction({ action: 'set_bad_words', words });
  toast(`🛡️ ${words.length}টি বাজে শব্দ ফিল্টারে সেভ হয়েছে!`);
};

window.resolveModReport = async reportId => {
  if (!isSuperAdmin()) return;
  await postCommunityAction({ action: 'resolve_report', reportId });
  toast('রিপোর্ট সমাধান হিসেবে চিহ্নিত হয়েছে ✅');
};

window.warnFromReport = async (username, name, snippet, reportId) => {
  if (!isSuperAdmin()) return;
  const reason = await askPrompt(`${name} (@${username}) কে কী সতর্কবার্তা পাঠাবেন?`, `বাজে শব্দ / নিয়ম ভঙ্গ (${snippet.slice(0, 40)})`, 'সতর্কবার্তা পাঠান');
  if (reason === null) return;
  await warnCommunityUser(username, name, reason.trim() || 'নিয়ম ভঙ্গের জন্য সতর্কবার্তা', 24);
  if (reportId) await resolveModReport(reportId);
};

window.verifyCommunityUser = async targetUsername => {
  if (!isSuperAdmin()) return;
  const res = await postCommunityAction({ action: 'verify_user', targetUsername });
  if (res.offline) {
    const set = new Set(communityState.moderation.verifiedUsers || ['admin']);
    if (set.has(targetUsername) && targetUsername !== 'admin') set.delete(targetUsername); else set.add(targetUsername);
    communityState.moderation.verifiedUsers = Array.from(set);
    persistCommunityCache(); renderNewsFeed(); renderPublicProfileBody(targetUsername);
  }
  toast('☑️ ভেরিফাইড ব্যাজ আপডেট হয়েছে!');
};

window.toggleCommunityFreeze = async () => {
  if (!isSuperAdmin()) return;
  const nextFrozen = !Boolean(communityState.moderation?.feedFrozen);
  const res = await postCommunityAction({ action: 'set_community_freeze', frozen: nextFrozen });
  if (res.offline) {
    communityState.moderation.feedFrozen = nextFrozen;
    persistCommunityCache(); renderNewsFeed(); renderAdminModerationPanel();
  }
  toast(nextFrozen ? '🧊 ফিড ও টিম চ্যাট ফ্রিজ করা হয়েছে!' : '🔓 ফিড ও চ্যাট আনফ্রিজ করা হয়েছে!', nextFrozen ? 'warn' : 'success');
};

window.submitSuperBroadcast = async e => {
  e.preventDefault();
  if (!isSuperAdmin()) return;
  const inp = $('saBroadcastInput');
  const text = (inp?.value || '').trim();
  if (!text) return;
  const res = await postCommunityAction({ action: 'send_broadcast', text });
  if (res.offline) {
    communityState.moderation.broadcasts = [{ id: uid(), text, by: getCurrentActor().name, ts: Date.now(), time: new Date().toLocaleString('bn-BD') }, ...(communityState.moderation.broadcasts || [])].slice(0, 30);
    persistCommunityCache(); renderNewsFeed(); renderAdminModerationPanel();
  }
  if (inp) inp.value = '';
  toast(`📣 ব্রডকাস্ট পাঠানো হয়েছে: "${text.slice(0, 50)}"`);
};

window.exportCommunityAuditJson = () => {
  if (!isSuperAdmin()) return;
  const blob = new Blob([JSON.stringify(communityState, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `community-audit-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('📥 কমিউনিটি অডিট JSON ডাউনলোড হয়েছে!');
};

window.renderAdminModerationPanel = () => {
  const reports = communityState.moderation?.reports || [];
  const openCount = reports.filter(r => r.status === 'open').length;
  if ($('modReportBadge')) {
    $('modReportBadge').style.display = openCount ? 'inline-block' : 'none';
    $('modReportBadge').textContent = openCount;
  }
  if (!isSuperAdmin()) return;

  const posts = communityState.posts || [];
  const dms = communityState.dms || [];
  const chat = communityState.chat || [];
  const frozen = Boolean(communityState.moderation?.feedFrozen);
  const verifiedCount = (communityState.moderation?.verifiedUsers || ['admin']).length;
  const totalReacts = posts.reduce((s, p) => s + Object.values(p.reactions || {}).reduce((a, b) => a + (Array.isArray(b) ? b.length : 0), 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.comments?.length || 0), 0);
  const mutedCount = Object.keys(communityState.moderation?.mutedUsers || {}).filter(u => getActiveMuteInfo(u)).length;

  if ($('saFeedFreezeBtn')) {
    $('saFeedFreezeBtn').textContent = frozen ? '🔓 আনফ্রিজ ফিড ও চ্যাট' : '🧊 ফিড ও চ্যাট ফ্রিজ';
    $('saFeedFreezeBtn').className = frozen ? 'sm' : 'warn sm';
  }
  if ($('saModKpiGrid')) {
    $('saModKpiGrid').innerHTML = `
      <div class="sa-mod-kpi-box"><small>📰 মোট ফিড পোস্ট</small><strong>${posts.length}</strong></div>
      <div class="sa-mod-kpi-box"><small>👍 রিঅ্যাকশন ও কমেন্ট</small><strong>${totalReacts} · ${totalComments}</strong></div>
      <div class="sa-mod-kpi-box"><small>💬 টিম চ্যাট ও DM</small><strong>${chat.length} · ${dms.length}</strong></div>
      <div class="sa-mod-kpi-box"><small>☑️ ভেরিফাইড / 🔇 মিউট</small><strong>${verifiedCount} / ${mutedCount}</strong></div>
      <div class="sa-mod-kpi-box"><small>🚩 ওপেন রিপোর্ট</small><strong class="${openCount ? 'bad' : 'good'}">${openCount}</strong></div>
    `;
  }
  if ($('saPostManageRows')) {
    $('saPostManageRows').innerHTML = posts.slice(0, 40).map(p => {
      const rCnt = Object.values(p.reactions || {}).reduce((a, b) => a + (Array.isArray(b) ? b.length : 0), 0);
      const cCnt = (p.comments || []).length;
      return `<tr>
        <td><strong style="cursor:pointer;color:var(--brand)" onclick="openPublicProfile('${esc(p.authorUsername)}','${esc(p.authorName)}')">${esc(p.authorName)}</strong><br><small class="muted">${esc(p.time)}</small></td>
        <td style="max-width:260px;white-space:normal">${p.official ? '<span class="badge-admin">📣 অফিশিয়াল</span> ' : ''}${p.pinned ? '<span class="badge-warn">📌</span> ' : ''}${p.commentsLocked ? '🔒 ' : ''}${esc((p.content || (p.imageData ? '🖼️ ছবি পোস্ট' : '📊 পোল')).slice(0, 90))}</td>
        <td><small>👍 ${rCnt} · 💬 ${cCnt}</small></td>
        <td style="white-space:nowrap">
          <button type="button" class="secondary sm" onclick="pinFeedPost('${esc(p.id)}')" title="পিন">${p.pinned ? '📌✓' : '📌'}</button>
          <button type="button" class="secondary sm" onclick="toggleOfficialPost('${esc(p.id)}')" title="অফিশিয়াল ঘোষণা">${p.official ? '📣✓' : '📣'}</button>
          <button type="button" class="secondary sm" onclick="lockFeedPost('${esc(p.id)}')" title="কমেন্ট লক">${p.commentsLocked ? '🔓' : '🔒'}</button>
          <button type="button" class="danger sm" onclick="deleteFeedPost('${esc(p.id)}')" title="ডিলিট">🗑️</button>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="4">কোনো পোস্ট নেই।</td></tr>`;
  }

  const bwIn = $('saBadWordsInput');
  if (bwIn && document.activeElement !== bwIn) {
    bwIn.value = (communityState.moderation?.badWords || DEFAULT_CLIENT_BAD_WORDS).join(', ');
  }
  if ($('saWarnedUsersList')) {
    const warns = communityState.moderation?.warnings || [];
    const muted = communityState.moderation?.mutedUsers || {};
    const byUser = new Map();
    warns.forEach(w => {
      if (!byUser.has(w.targetUsername)) byUser.set(w.targetUsername, { username: w.targetUsername, name: w.targetName, count: 0, lastReason: w.reason });
      byUser.get(w.targetUsername).count += 1;
    });
    Object.keys(muted).forEach(u => {
      if (!byUser.has(u)) byUser.set(u, { username: u, name: u, count: 0, lastReason: muted[u]?.reason || 'Muted' });
    });
    const list = Array.from(byUser.values());
    $('saWarnedUsersList').innerHTML = list.length
      ? list.map(u => {
        const mInfo = getActiveMuteInfo(u.username);
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border-radius:8px;background:var(--surface);border:1px solid var(--line);margin-bottom:6px">
          <div><strong style="cursor:pointer;color:var(--brand)" onclick="openPublicProfile('${esc(u.username)}','${esc(u.name)}')">${esc(u.name)} (@${esc(u.username)})</strong> <span class="badge-danger">⚠️ ${u.count}</span> ${mInfo ? '<span class="badge-warn">🔇 মিউট</span>' : ''}<br><small class="muted">${esc(u.lastReason || '')}</small></div>
          <div style="display:flex;gap:6px">
            <button type="button" class="secondary sm" onclick="openPublicProfile('${esc(u.username)}','${esc(u.name)}')">⚙️ কন্ট্রোল</button>
            ${mInfo ? `<button type="button" class="secondary sm" onclick="muteCommunityUser('${esc(u.username)}',0,true)">🔊 আনমিউট</button>` : ''}
            <button type="button" class="danger sm" onclick="clearUserWarnings('${esc(u.username)}')">🧹 ক্লিয়ার</button>
          </div>
        </div>`;
      }).join('')
      : `<small class="muted">এখনো কোনো ইউজারকে সতর্ক বা মিউট করা হয়নি।</small>`;
  }
  if ($('modReportRows')) {
    $('modReportRows').innerHTML = reports.map(r => `<tr>
      <td><small>${esc(r.time)}</small></td>
      <td><strong style="cursor:pointer;color:var(--brand)" onclick="openPublicProfile('${esc(r.targetUsername)}','${esc(r.targetName)}')">${esc(r.targetName)}</strong><br><small>@${esc(r.targetUsername || 'user')}</small></td>
      <td><span class="badge-${r.itemType === 'auto_filter' ? 'warn' : 'danger'}">${esc(r.itemType === 'auto_filter' ? 'Auto-Guard' : r.itemType)}</span><br><small>${esc(r.reason)}</small><br><small class="muted">By: ${esc(r.reportedBy)}</small></td>
      <td style="max-width:240px;white-space:normal">${esc(r.snippet || '—')}</td>
      <td>${r.status === 'resolved' ? '<span class="badge-success">✓ সমাধান</span>' : `<button type="button" class="warn sm" onclick="warnFromReport('${esc(r.targetUsername)}','${esc(r.targetName)}','${esc(r.snippet)}','${esc(r.id)}')">⚠️ সতর্ক</button><button type="button" class="secondary sm" onclick="resolveModReport('${esc(r.id)}')">✓</button>`}</td>
    </tr>`).join('') || `<tr><td colspan="5">কোনো রিপোর্ট বা বাজে শব্দের অ্যালার্ট নেই ✅</td></tr>`;
  }
};

// --- Team Chat Voice Notes (MediaRecorder) + Live Multi-User Voice Room (WebSocket) ---
let chatRecStream = null, chatMediaRecorder = null, chatRecChunks = [], chatRecTimerInt = null, chatRecStartedAt = 0, chatRecDiscard = false;

function formatRecMMSS(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

window.toggleChatVoiceRecord = async () => {
  if (chatMediaRecorder && chatMediaRecorder.state === 'recording') {
    finishAndSendChatVoiceNote();
    return;
  }
  const actor = getCurrentActor();
  const muteInfo = getActiveMuteInfo(actor.username);
  if (muteInfo && !isSuperAdmin()) return toast(`🔇 আপনি মিউট আছেন: ${muteInfo.reason}`, 'error');
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    return toast('আপনার ব্রাউজার ভয়েস রেকর্ডিং সাপোর্ট করে না', 'error');
  }
  try {
    chatRecStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chatRecChunks = [];
    chatRecDiscard = false;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
    chatMediaRecorder = mimeType ? new MediaRecorder(chatRecStream, { mimeType }) : new MediaRecorder(chatRecStream);
    chatRecStartedAt = Date.now();
    if ($('chatRecBar')) $('chatRecBar').style.display = 'flex';
    if ($('chatVoiceBtn')) $('chatVoiceBtn').classList.add('recording');
    if ($('chatRecTimer')) $('chatRecTimer').textContent = '00:00';
    chatRecTimerInt = setInterval(() => {
      const elapsed = (Date.now() - chatRecStartedAt) / 1000;
      if ($('chatRecTimer')) $('chatRecTimer').textContent = formatRecMMSS(elapsed);
      if (elapsed >= 75) finishAndSendChatVoiceNote();
    }, 300);

    chatMediaRecorder.ondataavailable = ev => { if (ev.data && ev.data.size > 0) chatRecChunks.push(ev.data); };
    chatMediaRecorder.onstop = async () => {
      clearInterval(chatRecTimerInt);
      if ($('chatRecBar')) $('chatRecBar').style.display = 'none';
      if ($('chatVoiceBtn')) $('chatVoiceBtn').classList.remove('recording');
      if (chatRecStream) { try { chatRecStream.getTracks().forEach(t => t.stop()); } catch (_) {} chatRecStream = null; }
      const dur = Math.max(1, (Date.now() - chatRecStartedAt) / 1000);
      const chunks = [...chatRecChunks];
      const shouldDiscard = chatRecDiscard;
      chatRecChunks = [];
      chatMediaRecorder = null;
      if (shouldDiscard || !chunks.length) return;
      const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
      if (blob.size > 750 * 1024) return toast('ভয়েস মেসেজ খুব বড় হয়েছে — আরেকটু ছোট করে পাঠান', 'warn');
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
      if (typeof window.submitChatPayload === 'function') {
        await window.submitChatPayload({ text: '', tag: $('chatTagSelect')?.value || '', audioData: dataUrl, audioMime: blob.type || 'audio/webm', audioDuration: dur });
      }
    };
    chatMediaRecorder.start(250);
  } catch (err) {
    toast('মাইক্রোফোন অনুমতি পাওয়া যায়নি!', 'error');
  }
};

window.cancelChatVoiceNote = () => {
  chatRecDiscard = true;
  if (chatMediaRecorder && chatMediaRecorder.state === 'recording') {
    try { chatMediaRecorder.stop(); } catch (_) {}
  } else {
    clearInterval(chatRecTimerInt);
    if ($('chatRecBar')) $('chatRecBar').style.display = 'none';
    if ($('chatVoiceBtn')) $('chatVoiceBtn').classList.remove('recording');
    if (chatRecStream) { try { chatRecStream.getTracks().forEach(t => t.stop()); } catch (_) {} chatRecStream = null; }
  }
};

window.finishAndSendChatVoiceNote = () => {
  chatRecDiscard = false;
  if (chatMediaRecorder && chatMediaRecorder.state === 'recording') {
    try { chatMediaRecorder.stop(); } catch (_) {}
  }
};

// Live Team Room WebSocket (/api/team-room)
let teamWs = null, teamClientId = '', teamPeersList = [], teamReconnectTimer = null;
let teamTypingMap = new Map();
let tvInVoice = false, tvMuted = false, tvMicStream = null, tvInputCtx = null, tvSourceNode = null, tvProcessorNode = null, tvSilentGain = null, tvOutCtx = null;
const tvPeerPlayCursor = new Map(), tvActiveSpeakers = new Map();

window.getTeamPeersSnapshot = () => teamPeersList || [];
window.isTeamRoomConnected = () => Boolean(teamWs && teamWs.readyState === WebSocket.OPEN);

let teamHeartbeatInt = null;
window.syncTeamRoomHello = () => {
  if (!teamWs || teamWs.readyState !== WebSocket.OPEN || !activeAccount) return;
  const actor = getCurrentActor();
  teamWs.send(JSON.stringify({ type: 'hello', name: actor.name, username: actor.username, role: actor.role, loginTs: sessionLoginTs }));
};

window.sendTeamTyping = isTyping => {
  if (!teamWs || teamWs.readyState !== WebSocket.OPEN || !activeAccount) return;
  teamWs.send(JSON.stringify({ type: 'typing', isTyping: Boolean(isTyping) }));
};

function renderTeamTypingBar() {
  const bar = $('chatTypingBar');
  if (!bar) return;
  const now = Date.now();
  for (const [k, v] of teamTypingMap.entries()) {
    if (now - v.ts > 3500) teamTypingMap.delete(k);
  }
  const names = Array.from(teamTypingMap.values()).map(v => v.name);
  bar.textContent = names.length ? `✍️ ${names.join(', ')} লিখছেন...` : '';
}

function playRemoteTeamPcm16k(senderId, base64Str) {
  if (!tvOutCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    tvOutCtx = new AudioCtx();
  }
  if (tvOutCtx.state === 'suspended') { try { tvOutCtx.resume(); } catch (_) {} }
  const bin = atob(base64Str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const samples = Math.floor(bytes.length / 2);
  if (!samples) return;
  const view = new DataView(bytes.buffer);
  const float32 = new Float32Array(samples);
  for (let i = 0; i < samples; i++) float32[i] = view.getInt16(i * 2, true) / 32768;
  const buffer = tvOutCtx.createBuffer(1, samples, 16000);
  buffer.copyToChannel(float32, 0);
  const prev = tvPeerPlayCursor.get(senderId) || 0;
  const startAt = Math.max(tvOutCtx.currentTime + 0.025, prev);
  const src = tvOutCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(tvOutCtx.destination);
  src.start(startAt);
  tvPeerPlayCursor.set(senderId, startAt + buffer.duration);
}

window.renderTeamVoicePeers = () => {
  const voicePeers = (teamPeersList || []).filter(p => p.inVoice);
  const bar = $('teamVoiceBar'), statusEl = $('tvRoomStatus'), subEl = $('tvRoomSub'), peersEl = $('tvPeersList');
  const joinBtn = $('tvJoinBtn'), muteBtn = $('tvMuteBtn'), leaveBtn = $('tvLeaveBtn');
  if (bar) bar.classList.toggle('active-call', tvInVoice || voicePeers.length > 0);
  if (joinBtn) joinBtn.style.display = tvInVoice ? 'none' : 'inline-flex';
  if (muteBtn) { muteBtn.style.display = tvInVoice ? 'inline-flex' : 'none'; muteBtn.textContent = tvMuted ? '🔇 আনমিউট' : '🎤 মিউট'; }
  if (leaveBtn) leaveBtn.style.display = tvInVoice ? 'inline-flex' : 'none';
  if (statusEl) {
    statusEl.textContent = tvInVoice
      ? `🟢 আপনি লাইভ ভয়েস রুমে আছেন (${voicePeers.length || 1} জন যুক্ত)`
      : (voicePeers.length ? `🔊 লাইভ টিম ভয়েস রুম চলছে (${voicePeers.length} জন কথা বলছেন)` : '🔊 লাইভ টিম ভয়েস রুম (অফলাইন)');
  }
  if (subEl) {
    subEl.textContent = tvInVoice
      ? (tvMuted ? 'আপনার মাইক্রোফোন মিউট করা আছে — কথা বলতে আনমিউট করুন' : 'লাইভ কথা বলছেন — চ্যাটে যুক্ত সবাই শুনতে পাচ্ছে')
      : 'একসাথে যুক্ত হয়ে সরাসরি সবার সাথে কথা বলুন';
  }
  if (peersEl) {
    const now = Date.now();
    peersEl.innerHTML = voicePeers.map(p => {
      const speaking = !p.muted && (tvActiveSpeakers.get(p.clientId) || 0) > now;
      return `<span class="tv-peer ${speaking ? 'speaking' : ''}" onclick="openPublicProfile('${esc(p.username)}','${esc(p.name)}','${esc(p.role)}')">${p.muted ? '🔇' : (speaking ? '🗣️' : '🎙️')} ${esc(p.name)}</span>`;
    }).join('');
  }
};

window.connectTeamRoomSocket = () => {
  if (!activeAccount || !/^https?:$/.test(location.protocol)) return;
  if (teamWs && (teamWs.readyState === WebSocket.OPEN || teamWs.readyState === WebSocket.CONNECTING)) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/api/team-room`);
  teamWs = ws;

  ws.onopen = () => {
    if (teamWs !== ws) return;
    syncTeamRoomHello();
    clearInterval(teamHeartbeatInt);
    teamHeartbeatInt = setInterval(() => {
      if (teamWs && teamWs.readyState === WebSocket.OPEN) {
        try { teamWs.send(JSON.stringify({ type: 'heartbeat' })); } catch (_) {}
      }
    }, 25000);
    if (typeof window.__redrawTeamChat === 'function') window.__redrawTeamChat();
  };

  ws.onmessage = ev => {
    if (teamWs !== ws) return;
    let msg;
    try { msg = JSON.parse(ev.data); } catch (_) { return; }
    if (msg.type === 'force_logout') {
      performLocalLogout(msg.reason || 'সুপার অ্যাডমিন আপনার সেশন রিমোট লগআউট করেছেন!');
      return;
    }
    if (msg.type === 'init') {
      teamClientId = msg.clientId || '';
      if (Array.isArray(msg.peers)) teamPeersList = msg.peers;
      if (msg.community) applyCommunitySnapshot(msg.community);
      if (typeof handleServerVersionSnapshot === 'function') handleServerVersionSnapshot(msg, false);
      renderTeamVoicePeers();
    } else if (msg.type === 'app_update_status') {
      if (typeof handleServerVersionSnapshot === 'function') handleServerVersionSnapshot(msg, true);
    } else if (msg.type === 'peers_update') {
      teamPeersList = Array.isArray(msg.peers) ? msg.peers : [];
      renderTeamVoicePeers();
      renderNewsFeed();
      if (typeof window.__redrawTeamChat === 'function') window.__redrawTeamChat();
    } else if (msg.type === 'community_update' && msg.community) {
      applyCommunitySnapshot(msg.community);
    } else if (msg.type === 'subscription_request' && isSuperAdmin()) {
      if (Array.isArray(msg.subscriptionRequests)) {
        writeSubscriptionRequests(msg.subscriptionRequests);
      } else if (msg.request) {
        const cur = readSubscriptionRequests().filter(x => x.id !== msg.request.id);
        cur.unshift(msg.request);
        writeSubscriptionRequests(cur);
      }
      renderSubscriptionRequests();
      updateNotifications();
      if (msg.request) {
        toast(`💎 নতুন সাবস্ক্রিপশন রিকোয়েস্ট: ${msg.request.name} (${msg.request.planLabel || msg.request.planKey} · ৳${num(msg.request.price)})`, 'warn');
      }
    } else if (msg.type === 'subscription_updated' && isSuperAdmin()) {
      if (Array.isArray(msg.subscriptionRequests)) writeSubscriptionRequests(msg.subscriptionRequests);
      renderSubscriptionRequests();
      renderAdminPanel();
      updateNotifications();
    } else if (msg.type === 'subscription_auto_activated') {
      if (Array.isArray(msg.subscriptionRequests) && isSuperAdmin()) {
        writeSubscriptionRequests(msg.subscriptionRequests);
        renderSubscriptionRequests();
        renderAdminPanel();
        updateNotifications();
        if (msg.request) toast(`⚡ অটো পেমেন্টে প্ল্যান চালু: ${msg.request.name} (${msg.request.planLabel})`);
      }
      if (msg.account && activeAccount && msg.account.id === activeAccount.id) {
        completeAutoActivatedSubscription(msg.account, null, msg.request);
      }
    } else if (msg.type === 'super_broadcast' && msg.broadcast) {
      toast(`📣 সুপার অ্যাডমিন অ্যালার্ট: ${msg.broadcast.text}`, 'warn');
    } else if (msg.type === 'typing') {
      const key = msg.username || msg.senderId;
      if (msg.isTyping) teamTypingMap.set(key, { name: msg.name || 'Someone', ts: Date.now() });
      else teamTypingMap.delete(key);
      renderTeamTypingBar();
    } else if (msg.type === 'voice_audio' && tvInVoice && msg.data && msg.senderId !== teamClientId) {
      tvActiveSpeakers.set(msg.senderId, Date.now() + 650);
      playRemoteTeamPcm16k(msg.senderId, msg.data);
      renderTeamVoicePeers();
    }
  };

  ws.onclose = () => {
    clearInterval(teamHeartbeatInt);
    if (teamWs !== ws) return;
    teamWs = null;
    if (tvInVoice) leaveTeamVoiceRoom();
    if (activeAccount) {
      clearTimeout(teamReconnectTimer);
      teamReconnectTimer = setTimeout(connectTeamRoomSocket, 3500);
    }
  };
};

window.disconnectTeamRoomSocket = () => {
  clearTimeout(teamReconnectTimer);
  clearInterval(teamHeartbeatInt);
  leaveTeamVoiceRoom();
  if (teamWs) {
    const ws = teamWs; teamWs = null;
    try { ws.close(); } catch (_) {}
  }
  teamPeersList = [];
  renderTeamVoicePeers();
};

window.joinTeamVoiceRoom = async () => {
  if (tvInVoice) return;
  const actor = getCurrentActor();
  const muteInfo = getActiveMuteInfo(actor.username);
  if (muteInfo && !isSuperAdmin()) return toast(`🔇 আপনি মিউট আছেন: ${muteInfo.reason}`, 'error');
  if (!teamWs || teamWs.readyState !== WebSocket.OPEN) connectTeamRoomSocket();
  if (!navigator.mediaDevices?.getUserMedia) return toast('ব্রাউজার মাইক্রোফোন সাপোর্ট করে না', 'error');
  try {
    tvMicStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    tvInputCtx = new AudioCtx();
    tvOutCtx = new AudioCtx();
    if (tvOutCtx.state === 'suspended') await tvOutCtx.resume();
    tvSourceNode = tvInputCtx.createMediaStreamSource(tvMicStream);
    tvProcessorNode = tvInputCtx.createScriptProcessor(2048, 1, 1);
    tvSilentGain = tvInputCtx.createGain();
    tvSilentGain.gain.value = 0;
    tvSourceNode.connect(tvProcessorNode);
    tvProcessorNode.connect(tvSilentGain);
    tvSilentGain.connect(tvInputCtx.destination);
    tvInVoice = true;
    tvMuted = false;

    const sendJoin = () => {
      if (teamWs && teamWs.readyState === WebSocket.OPEN) {
        teamWs.send(JSON.stringify({ type: 'voice_join', name: actor.name, username: actor.username, role: actor.role, muted: false }));
      }
    };
    if (teamWs && teamWs.readyState === WebSocket.OPEN) sendJoin();
    else setTimeout(sendJoin, 500);

    tvProcessorNode.onaudioprocess = e => {
      if (!tvInVoice || tvMuted || !teamWs || teamWs.readyState !== WebSocket.OPEN) return;
      const raw = e.inputBuffer.getChannelData(0);
      let sumSq = 0;
      for (let i = 0; i < raw.length; i++) sumSq += raw[i] * raw[i];
      const rms = Math.sqrt(sumSq / raw.length);
      if (rms < 0.008) return; // voice activity threshold avoids sending silence
      tvActiveSpeakers.set(teamClientId, Date.now() + 550);
      const pcm16k = downsampleFloat32To16k(raw, tvInputCtx.sampleRate);
      const b64 = float32Pcm16ToBase64(pcm16k);
      teamWs.send(JSON.stringify({ type: 'voice_audio', data: b64 }));
    };
    renderTeamVoicePeers();
    toast('🔊 লাইভ টিম ভয়েস রুমে যুক্ত হয়েছেন!');
  } catch (err) {
    leaveTeamVoiceRoom();
    toast('মাইক্রোফোন অনুমতি পাওয়া যায়নি!', 'error');
  }
};

window.toggleTeamVoiceMute = () => {
  if (!tvInVoice) return;
  tvMuted = !tvMuted;
  if (tvMicStream) tvMicStream.getAudioTracks().forEach(t => { t.enabled = !tvMuted; });
  if (teamWs && teamWs.readyState === WebSocket.OPEN) teamWs.send(JSON.stringify({ type: 'voice_mute', muted: tvMuted }));
  renderTeamVoicePeers();
};

window.leaveTeamVoiceRoom = () => {
  const wasIn = tvInVoice;
  tvInVoice = false;
  tvMuted = false;
  if (teamWs && teamWs.readyState === WebSocket.OPEN) {
    try { teamWs.send(JSON.stringify({ type: 'voice_leave' })); } catch (_) {}
  }
  if (tvProcessorNode) { try { tvProcessorNode.disconnect(); tvProcessorNode.onaudioprocess = null; } catch (_) {} tvProcessorNode = null; }
  if (tvSourceNode) { try { tvSourceNode.disconnect(); } catch (_) {} tvSourceNode = null; }
  if (tvSilentGain) { try { tvSilentGain.disconnect(); } catch (_) {} tvSilentGain = null; }
  if (tvMicStream) { try { tvMicStream.getTracks().forEach(t => t.stop()); } catch (_) {} tvMicStream = null; }
  if (tvInputCtx) { try { tvInputCtx.close(); } catch (_) {} tvInputCtx = null; }
  if (tvOutCtx) { try { tvOutCtx.close(); } catch (_) {} tvOutCtx = null; }
  tvPeerPlayCursor.clear();
  tvActiveSpeakers.clear();
  renderTeamVoicePeers();
  if (wasIn) toast('ভয়েস রুম থেকে বের হয়েছেন');
};

setInterval(() => {
  if (tvInVoice || (teamPeersList || []).some(p => p.inVoice)) renderTeamVoicePeers();
  renderTeamTypingBar();
}, 800);

// === NEW AGENCY OS SUITE MODULES (DM, LEAD KANBAN, CONTENT CALENDAR, HR PAYSLIP, AI AD COPY, CLIENT REPORT CARD) ===

// 1. 1-to-1 Direct Messages (DM) + Voice Notes + File Attachment + Unread Badge
let dmActivePeer = '';
let dmPendingFile = null;
let dmMediaRec = null;
let dmRecChunks = [];
let dmRecStartTs = 0;

function getDmTeamMembers() {
  const me = getCurrentActor().username;
  const peers = typeof getTeamPeersSnapshot === 'function' ? getTeamPeersSnapshot() : [];
  const onlineSet = new Set(peers.map(p => String(p.username || '').toLowerCase()).filter(Boolean));
  const saProf = (() => { try { return JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_legacy-super-admin') || '{}'); } catch (_) { return {}; } })();
  const list = [
    { username: 'admin', name: saProf.name || 'Super Admin', role: 'super_admin' },
    ...readLocalAccounts().filter(a => a.status !== 'suspended').map(a => {
      const pr = (() => { try { return JSON.parse(localStorage.getItem('ads_hisab_user_profile_v72_' + a.id) || '{}'); } catch (_) { return {}; } })();
      return { username: String(a.username || '').toLowerCase(), name: pr.name || a.name, role: a.role || 'user' };
    })
  ];
  const seen = new Set();
  return list.filter(m => {
    if (!m.username || m.username === me || seen.has(m.username)) return false;
    seen.add(m.username);
    m.online = onlineSet.has(m.username);
    return true;
  });
}

window.updateDmUnreadBadge = () => {
  const badge = $('dmUnreadBadge');
  if (!badge) return;
  const me = getCurrentActor().username;
  const unread = (communityState.dms || []).filter(d => d.toUsername === me && !d.read).length;
  badge.style.display = unread > 0 ? 'flex' : 'none';
  badge.textContent = unread > 99 ? '99+' : String(unread);
};

window.selectDmPeer = async (username, displayName = '') => {
  const target = String(username || '').trim().toLowerCase();
  if (!target) return;
  dmActivePeer = target;
  if ($('dmToUsername')) $('dmToUsername').value = target;
  if ($('dmActivePeerTitle')) $('dmActivePeerTitle').textContent = `${displayName || '@' + target} (@${target}) — প্রাইভেট কথোপকথন`;
  const me = getCurrentActor().username;
  const hasUnread = (communityState.dms || []).some(d => d.fromUsername === target && d.toUsername === me && !d.read);
  if (hasUnread) {
    (communityState.dms || []).forEach(d => { if (d.fromUsername === target && d.toUsername === me) d.read = true; });
    (communityState.notifications || []).forEach(n => { if (n.toUsername === me && n.kind === 'dm' && n.fromUsername === target) n.read = true; });
    persistCommunityCache();
    updateDmUnreadBadge();
    updateNotifications();
    postCommunityAction({ action: 'mark_dm_read', peerUsername: target });
  }
  renderDmModal();
};

window.renderDmModal = () => {
  const peerListEl = $('dmPeerList'), threadEl = $('dmMessages');
  if (!peerListEl || !threadEl) return;
  const me = getCurrentActor().username;
  const members = getDmTeamMembers();
  if (!dmActivePeer && members.length) {
    dmActivePeer = members[0].username;
    if ($('dmToUsername')) $('dmToUsername').value = dmActivePeer;
    if ($('dmActivePeerTitle')) $('dmActivePeerTitle').textContent = `${members[0].name} (@${dmActivePeer}) — প্রাইভেট কথোপকথন`;
  }
  peerListEl.innerHTML = members.map(m => {
    const unread = (communityState.dms || []).filter(d => d.fromUsername === m.username && d.toUsername === me && !d.read).length;
    const isAct = dmActivePeer === m.username;
    return `<div class="dm-peer-item ${isAct ? 'active' : ''}" onclick="selectDmPeer('${esc(m.username).replace(/'/g, "\\'")}','${esc(m.name).replace(/'/g, "\\'")}')">
      <span>${m.online ? '🟢' : '👤'} <span>${esc(m.name)}</span><br><small class="muted">@${esc(m.username)}</small></span>
      ${unread > 0 ? `<span class="badge-danger" style="font-size:10px;padding:1px 6px">${unread}</span>` : ''}
    </div>`;
  }).join('') || `<small class="muted" style="padding:8px">অন্য কোনো টিম মেম্বার এখনো যোগ করা হয়নি</small>`;

  if (!dmActivePeer) {
    threadEl.innerHTML = `<div class="muted" style="text-align:center;margin:auto">বাম দিক থেকে একজন মেম্বার সিলেক্ট করুন</div>`;
    return;
  }
  const conv = (communityState.dms || []).filter(d =>
    (d.fromUsername === me && d.toUsername === dmActivePeer) ||
    (d.fromUsername === dmActivePeer && d.toUsername === me)
  ).sort((a, b) => num(a.ts) - num(b.ts));

  threadEl.innerHTML = conv.length ? conv.map(d => {
    const mine = d.fromUsername === me;
    const mediaHtml = d.fileData
      ? (String(d.fileType || '').startsWith('image/')
        ? `<img src="${esc(d.fileData)}" alt="DM Media" style="max-width:210px;border-radius:8px;margin-top:6px;cursor:pointer;display:block" onclick="openLightbox(this.src)">`
        : `<a href="${esc(d.fileData)}" download="${esc(d.fileName || 'file')}" style="display:inline-block;margin-top:6px;color:inherit;text-decoration:underline">📎 ${esc(d.fileName || 'ডাউনলোড ফাইল')}</a>`)
      : '';
    const audioHtml = d.audioData
      ? `<div class="chat-audio-wrap"><audio controls src="${esc(d.audioData)}"></audio>${d.audioDuration ? `<small>(${num(d.audioDuration)}s)</small>` : ''}</div>`
      : '';
    const canDel = isSuperAdmin() || mine;
    return `<div class="dm-msg ${mine ? 'mine' : ''}">
      <div>${esc(d.text || '')}</div>
      ${mediaHtml}
      ${audioHtml}
      <small style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span>${esc(d.time || '')}${mine && d.read ? ' · ✓✓' : ''}</span>
        ${canDel ? `<button type="button" class="secondary sm" style="padding:0 5px;margin:0;font-size:10px" onclick="deleteDmMsg('${esc(d.id)}')">🗑️</button>` : ''}
      </small>
    </div>`;
  }).join('') : `<div class="muted" style="text-align:center;margin:auto">এখনো কোনো প্রাইভেট মেসেজ নেই — হ্যালো বলুন! 👋</div>`;
  threadEl.scrollTop = threadEl.scrollHeight;
};

window.openDmModal = (peerUsername = '', peerName = '') => {
  if (!$('dmModal')) return;
  $('dmModal').style.display = 'flex';
  if (peerUsername) selectDmPeer(peerUsername, peerName);
  else renderDmModal();
  setTimeout(() => $('dmInput')?.focus(), 60);
};

window.deleteDmMsg = async dmId => {
  const res = await postCommunityAction({ action: 'delete_dm', dmId });
  if (res.offline) {
    communityState.dms = (communityState.dms || []).filter(d => d.id !== dmId);
    persistCommunityCache();
    renderDmModal();
  }
  toast('মেসেজ মুছে ফেলা হয়েছে', 'warn');
};

if ($('dmFile')) {
  $('dmFile').onchange = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      if (f.type.startsWith('image/')) {
        const data = await compressImageFile(f, 800, 0.8);
        dmPendingFile = { data, name: f.name, type: 'image/jpeg' };
      } else {
        if (f.size > 550000) return toast('ফাইলের সাইজ 500KB এর নিচে রাখুন', 'error');
        const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
        dmPendingFile = { data, name: f.name, type: f.type || 'application/octet-stream' };
      }
      if ($('dmRecStatus')) $('dmRecStatus').textContent = `📎 যুক্ত হয়েছে: ${f.name}`;
    } catch (_) { toast('ফাইল প্রসেস করা যায়নি', 'error'); }
  };
}

window.toggleDmVoiceRecord = async () => {
  const btn = $('dmVoiceBtn'), st = $('dmRecStatus');
  if (dmMediaRec && dmMediaRec.state === 'recording') {
    try { dmMediaRec.stop(); } catch (_) {}
    return;
  }
  if (!dmActivePeer) return toast('প্রথমে প্রাপক ইউজার সিলেক্ট করুন!', 'warn');
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return toast('মাইক্রোফোন রেকর্ড সাপোর্ট করে না', 'error');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    dmRecChunks = [];
    dmRecStartTs = Date.now();
    dmMediaRec = new MediaRecorder(stream);
    dmMediaRec.ondataavailable = ev => { if (ev.data?.size) dmRecChunks.push(ev.data); };
    dmMediaRec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      if (btn) { btn.textContent = '🎙️'; btn.classList.remove('danger'); }
      if (st) st.textContent = '';
      const blob = new Blob(dmRecChunks, { type: dmMediaRec.mimeType || 'audio/webm' });
      const dur = Math.max(1, Math.round((Date.now() - dmRecStartTs) / 1000));
      const audioData = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
      const members = getDmTeamMembers();
      const peerObj = members.find(m => m.username === dmActivePeer);
      const res = await postCommunityAction({ action: 'send_dm', id: uid(), toUsername: dmActivePeer, toName: peerObj?.name || dmActivePeer, text: '', audioData, audioDuration: dur });
      if (res.offline) {
        const actor = getCurrentActor();
        communityState.dms = communityState.dms || [];
        communityState.dms.push({ id: uid(), fromUsername: actor.username, fromName: actor.name, fromRole: actor.role, toUsername: dmActivePeer, toName: peerObj?.name || dmActivePeer, text: '', audioData, audioDuration: dur, read: false, ts: Date.now(), time: new Date().toLocaleString('bn-BD') });
        persistCommunityCache(); renderDmModal();
      }
    };
    dmMediaRec.start();
    if (btn) { btn.textContent = '⏹️'; btn.classList.add('danger'); }
    if (st) st.textContent = '🔴 প্রাইভেট ভয়েস রেকর্ড হচ্ছে... থামাতে ⏹️ চাপুন';
  } catch (_) {
    toast('মাইক্রোফোন অনুমতি পাওয়া যায়নি!', 'error');
  }
};

if ($('dmForm')) {
  $('dmForm').onsubmit = async e => {
    e.preventDefault();
    const toU = ($('dmToUsername')?.value || dmActivePeer || '').trim().toLowerCase();
    const text = ($('dmInput')?.value || '').trim();
    if (!toU) return toast('প্রাপক মেম্বার সিলেক্ট করুন!', 'warn');
    if (!text && !dmPendingFile) return;
    const members = getDmTeamMembers();
    const peerObj = members.find(m => m.username === toU);
    const payload = {
      action: 'send_dm', id: uid(), toUsername: toU, toName: peerObj?.name || toU, text,
      fileData: dmPendingFile?.data || '', fileName: dmPendingFile?.name || '', fileType: dmPendingFile?.type || ''
    };
    const res = await postCommunityAction(payload);
    if (res.offline) {
      if (findClientBadWord(text) && !isSuperAdmin()) return toast('⚠️ অশালীন শব্দ ব্যবহার নিষিদ্ধ!', 'error');
      const actor = getCurrentActor();
      communityState.dms = communityState.dms || [];
      communityState.dms.push({ ...payload, fromUsername: actor.username, fromName: actor.name, fromRole: actor.role, read: false, ts: Date.now(), time: new Date().toLocaleString('bn-BD') });
      persistCommunityCache(); renderDmModal();
    } else if (!res.ok) return;
    if ($('dmInput')) $('dmInput').value = '';
    if ($('dmFile')) $('dmFile').value = '';
    if ($('dmRecStatus')) $('dmRecStatus').textContent = '';
    dmPendingFile = null;
  };
}

// 2. Client Lead CRM Kanban Pipeline
const LEAD_STAGES = [
  { key: 'new', title: '🆕 New Lead' },
  { key: 'proposal', title: '📝 Proposal' },
  { key: 'negotiation', title: '💬 Negotiation' },
  { key: 'won', title: '🏆 Won' },
  { key: 'lost', title: '❌ Lost' }
];

window.renderLeadKanban = () => {
  const board = $('leadKanbanBoard');
  if (!board) return;
  const leads = db.leads || [];
  board.innerHTML = LEAD_STAGES.map((st, sIdx) => {
    const colItems = leads.filter(l => (l.stage || 'new') === st.key);
    const cardsHtml = colItems.map(l => {
      const wa = normalizeBdPhone(l.phone || '');
      const waUrl = wa.length >= 10 ? `https://wa.me/${wa}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${l.name}, ${db.agency?.name || 'আমাদের এজেন্সি'} থেকে ${l.platform || 'Ads'} সার্ভিস প্রোপোজাল বিষয়ে যোগাযোগ করছি।`)}` : '';
      return `<div class="kanban-card">
        <strong>${esc(l.name)}</strong>
        <div class="muted">${esc(l.biz || l.platform || 'Inquiry')} · ${esc(l.phone || '')}</div>
        ${l.budget ? `<div style="margin-top:3px;font-weight:700;color:var(--brand)">💰 বাজেট: ${esc(l.budget)}</div>` : ''}
        ${l.followDate ? `<div style="font-size:11px;color:#d97706">📅 ফলোআপ: ${esc(l.followDate)}</div>` : ''}
        ${l.note ? `<div style="font-size:11px;margin-top:3px">${esc(l.note)}</div>` : ''}
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:7px">
          ${sIdx > 0 ? `<button type="button" class="secondary sm" style="padding:2px 6px;margin:0" onclick="moveLeadStage('${l.id}',-1)">◀️</button>` : ''}
          ${sIdx < LEAD_STAGES.length - 1 ? `<button type="button" class="secondary sm" style="padding:2px 6px;margin:0" onclick="moveLeadStage('${l.id}',1)">▶️</button>` : ''}
          ${waUrl ? `<a href="${waUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none"><button type="button" class="wa-btn sm" style="padding:2px 7px;margin:0">📲</button></a>` : ''}
          ${!l.convertedCustId ? `<button type="button" class="sm" style="background:#059669;padding:2px 7px;margin:0" onclick="convertLeadToCustomer('${l.id}')">⚡ কাস্টমার</button>` : `<span class="badge-success" style="font-size:10px">✓ ক্লায়েন্ট</span>`}
          <button type="button" class="danger sm" style="padding:2px 6px;margin:0" onclick="deleteLead('${l.id}')">✕</button>
        </div>
      </div>`;
    }).join('') || `<small class="muted" style="text-align:center;margin-top:16px">খালি</small>`;
    return `<div class="kanban-col">
      <div class="kanban-col-head"><span>${st.title}</span><span class="badge-admin">${colItems.length}</span></div>
      ${cardsHtml}
    </div>`;
  }).join('');
};

window.openLeadPipelineModal = () => {
  if (!$('leadPipelineModal')) return;
  if ($('leadFollowDate') && !$('leadFollowDate').value) $('leadFollowDate').value = today();
  renderLeadKanban();
  $('leadPipelineModal').style.display = 'flex';
};

window.moveLeadStage = (id, delta) => {
  const l = (db.leads || []).find(x => x.id === id);
  if (!l) return;
  const idx = Math.max(0, LEAD_STAGES.findIndex(s => s.key === (l.stage || 'new')));
  const nextIdx = Math.max(0, Math.min(LEAD_STAGES.length - 1, idx + delta));
  l.stage = LEAD_STAGES[nextIdx].key;
  l.updatedAt = Date.now();
  save(); renderLeadKanban();
};

window.convertLeadToCustomer = id => {
  const l = (db.leads || []).find(x => x.id === id);
  if (!l) return;
  const existing = db.customers.find(c => c.name.trim().toLowerCase() === l.name.trim().toLowerCase() || (l.phone && c.phone === l.phone));
  let cid = existing?.id || '';
  if (!cid) {
    cid = uid();
    db.customers.push({
      id: cid, createdAt: Date.now(), updatedAt: Date.now(), portalToken: uid().slice(-6),
      name: l.name, phone: l.phone || '', stage: 'Active Client', followUpDate: l.followDate || '',
      retainer: 0, dueLimit: 0, customRate: 0, lowAdvLimit: 1000, pkgName: '', pkgEnd: '',
      checklist: DEFAULT_CHECKLIST(), note: `From Lead (${l.platform || ''}): ${l.note || ''}`
    });
  }
  l.stage = 'won'; l.convertedCustId = cid; l.updatedAt = Date.now();
  save(); logActivity(`লিড থেকে কাস্টমার রূপান্তর: ${l.name}`); renderLeadKanban();
  toast(`${l.name} কাস্টমার তালিকায় যুক্ত হয়েছে! 🎉`);
};

window.deleteLead = async id => {
  if (!(await askConfirm('লিডটি ডিলিট করবেন?'))) return;
  markDeleted(id);
  db.leads = (db.leads || []).filter(x => x.id !== id);
  save(); renderLeadKanban(); toast('লিড মুছে ফেলা হয়েছে', 'warn');
};

if ($('leadForm')) {
  $('leadForm').onsubmit = e => {
    e.preventDefault();
    db.leads = db.leads || [];
    db.leads.unshift({
      id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
      name: $('leadName').value.trim(), phone: $('leadPhone').value.trim(),
      biz: $('leadBiz')?.value.trim() || '', platform: $('leadPlatform')?.value || 'Meta',
      budget: $('leadBudget')?.value.trim() || '', followDate: $('leadFollowDate')?.value || '',
      stage: $('leadStage')?.value || 'new', note: $('leadNote')?.value.trim() || ''
    });
    save(); logActivity(`নতুন লিড: ${$('leadName').value.trim()}`);
    e.target.reset(); renderLeadKanban(); toast('নতুন লিড যোগ হয়েছে!');
  };
}

// 3. Social Media & Ads Content Calendar
const CAL_STATUSES = ['planned', 'designing', 'ready', 'published'];
const CAL_STATUS_LABELS = { planned: '🟡 Planned', designing: '🔵 Designing', ready: '🟣 Ready', published: '🟢 Published' };

window.renderContentCalendar = () => {
  const host = $('contentCalendarList');
  if (!host) return;
  const mf = $('calMonthFilter')?.value || '', sf = $('calStatusFilter')?.value || '';
  const list = [...(db.contentCalendar || [])].filter(c => {
    if (mf && !String(c.date || '').startsWith(mf)) return false;
    if (sf && (c.status || 'planned') !== sf) return false;
    return true;
  }).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  host.innerHTML = list.length ? list.map(c => {
    const st = c.status || 'planned';
    const cls = st === 'published' ? 'badge-success' : (st === 'ready' ? 'badge-admin' : 'badge-warn');
    return `<div class="cal-item">
      <div style="display:flex;gap:10px;align-items:center;flex:1;min-width:220px">
        <div class="cal-date-pill">${esc(c.date || today())}</div>
        <div>
          <strong>${esc(c.title)}</strong> <span class="badge-admin" style="font-size:10px">${esc(c.platform || 'Meta')} · ${esc(c.type || 'Post')}</span>
          <div class="muted" style="font-size:11.5px">${c.customerId ? esc(cname(c.customerId)) : 'Agency Content'}${c.caption ? ` · ${esc(c.caption.slice(0, 75))}` : ''}</div>
        </div>
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
        <span class="${cls}" style="cursor:pointer" onclick="cycleCalendarStatus('${c.id}')" title="স্ট্যাটাস বদলাতে ক্লিক করুন">${CAL_STATUS_LABELS[st] || st}</span>
        <button type="button" class="secondary sm" style="margin:0" onclick="sendCalendarToWork('${c.id}')" title="ক্যাম্পেইন ফর্মে নিন">⚡</button>
        <button type="button" class="danger sm" style="margin:0" onclick="deleteCalendarItem('${c.id}')">✕</button>
      </div>
    </div>`;
  }).join('') : `<div class="muted" style="text-align:center;padding:22px">এই ফিল্টারে কোনো শিডিউল করা কনটেন্ট নেই</div>`;
};

window.openContentCalendarModal = () => {
  if (!$('contentCalendarModal')) return;
  if ($('calDate') && !$('calDate').value) $('calDate').value = today();
  if ($('calMonthFilter') && !$('calMonthFilter').value) $('calMonthFilter').value = today().slice(0, 7);
  fillSelect('calCustomer', db.customers, L('সর্বসাধারণ / এজেন্সি', 'General / Agency'));
  renderContentCalendar();
  $('contentCalendarModal').style.display = 'flex';
};

window.cycleCalendarStatus = id => {
  const c = (db.contentCalendar || []).find(x => x.id === id);
  if (!c) return;
  const idx = CAL_STATUSES.indexOf(c.status || 'planned');
  c.status = CAL_STATUSES[(idx + 1) % CAL_STATUSES.length];
  c.updatedAt = Date.now();
  save(); renderContentCalendar();
};

window.sendCalendarToWork = id => {
  const c = (db.contentCalendar || []).find(x => x.id === id);
  if (!c) return;
  closeModal('contentCalendarModal');
  goToSection('works');
  if ($('wDate')) $('wDate').value = c.date || today();
  if ($('wCustomer') && c.customerId) { $('wCustomer').value = c.customerId; updatePages(); }
  if ($('wPlatform') && ['Meta', 'Google', 'YouTube', 'TikTok'].includes(c.platform)) $('wPlatform').value = c.platform;
  if ($('wName')) $('wName').value = c.title || '';
  if ($('wAdCopy')) $('wAdCopy').value = c.caption || '';
  updateWorkPreview();
  toast('কনটেন্ট ক্যালেন্ডার থেকে কাজের ফর্মে নেওয়া হয়েছে ⚡');
};

window.deleteCalendarItem = id => {
  markDeleted(id);
  db.contentCalendar = (db.contentCalendar || []).filter(x => x.id !== id);
  save(); renderContentCalendar(); toast('আইটেম মুছে ফেলা হয়েছে', 'warn');
};

if ($('calForm')) {
  $('calForm').onsubmit = e => {
    e.preventDefault();
    db.contentCalendar = db.contentCalendar || [];
    db.contentCalendar.push({
      id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
      date: $('calDate').value || today(), customerId: $('calCustomer')?.value || '',
      platform: $('calPlatform')?.value || 'Meta', type: $('calType')?.value || 'Poster',
      title: $('calTitle').value.trim(), caption: $('calCaption')?.value.trim() || '', status: 'planned'
    });
    save(); logActivity(`কনটেন্ট শিডিউল: ${$('calTitle').value.trim()}`);
    $('calTitle').value = ''; if ($('calCaption')) $('calCaption').value = '';
    renderContentCalendar(); toast('কনটেন্ট ক্যালেন্ডারে যুক্ত হয়েছে 📅');
  };
}

// 4. Staff Attendance (Check-In / Check-Out) & Monthly Salary Payslip PNG
window.openStaffHrModal = (staffName = '') => {
  if (!$('staffHrModal')) return;
  fillStaffSelect('hrStaffSelect');
  if ($('hrMonthInput') && !$('hrMonthInput').value) $('hrMonthInput').value = today().slice(0, 7);
  const targetName = staffName || getCurrentActor().name;
  if ($('hrStaffSelect') && targetName) {
    const opts = Array.from($('hrStaffSelect').options);
    const match = opts.find(o => o.value.toLowerCase() === targetName.toLowerCase());
    if (match) $('hrStaffSelect').value = match.value;
  }
  renderStaffHrModal();
  $('staffHrModal').style.display = 'flex';
};

function getHrTargetStaff() {
  return ($('hrStaffSelect')?.value || getCurrentActor().name || 'Staff').trim();
}

window.staffClockIn = () => {
  const staff = getHrTargetStaff();
  const td = today();
  db.staffAttendance = db.staffAttendance || [];
  const openRec = db.staffAttendance.find(a => a.staffName === staff && a.date === td && !a.outTs);
  if (openRec) return toast(`${staff} ইতিমধ্যে আজকে চেক-ইন করেছেন!`, 'warn');
  const nowTs = Date.now();
  db.staffAttendance.unshift({
    id: uid(), createdAt: nowTs, updatedAt: nowTs,
    staffName: staff, date: td, inTs: nowTs, inTime: new Date(nowTs).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' }),
    outTs: 0, outTime: '', hours: 0, note: ($('hrNoteInput')?.value || '').trim()
  });
  save(); logActivity(`চেক-ইন: ${staff}`); renderStaffHrModal();
  toast(`${staff} সফলভাবে চেক-ইন করেছেন 🟢`);
};

window.staffClockOut = () => {
  const staff = getHrTargetStaff();
  const td = today();
  const rec = (db.staffAttendance || []).find(a => a.staffName === staff && a.date === td && !a.outTs);
  if (!rec) return toast(`${staff}-এর আজকের কোনো অ্যাক্টিভ চেক-ইন নেই!`, 'warn');
  const nowTs = Date.now();
  rec.outTs = nowTs;
  rec.outTime = new Date(nowTs).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
  rec.hours = +Math.max(0.01, (nowTs - num(rec.inTs)) / 3600000).toFixed(2);
  if ($('hrNoteInput')?.value.trim()) rec.note = [rec.note, $('hrNoteInput').value.trim()].filter(Boolean).join(' · ');
  rec.updatedAt = nowTs;
  save(); logActivity(`চেক-আউট (${rec.hours}h): ${staff}`); renderStaffHrModal();
  toast(`${staff} চেক-আউট সম্পন্ন (${rec.hours} ঘণ্টা) 🔴`);
};

window.deleteAttendanceRow = id => {
  if (!isAdminOrSuper() && !hasPerm('canDelete')) return toast('অনুমতি নেই!', 'error');
  markDeleted(id);
  db.staffAttendance = (db.staffAttendance || []).filter(x => x.id !== id);
  save(); renderStaffHrModal(); toast('এটেনডেন্স এন্ট্রি মুছে ফেলা হয়েছে', 'warn');
};

function computeStaffPayslipData() {
  const staff = getHrTargetStaff();
  const ym = $('hrMonthInput')?.value || today().slice(0, 7);
  const baseSalary = num($('hrBaseSalary')?.value);
  const deduction = num($('hrDeduction')?.value);
  const attList = (db.staffAttendance || []).filter(a => a.staffName === staff && String(a.date || '').startsWith(ym));
  const daysPresent = new Set(attList.map(a => a.date)).size;
  const totalHours = +attList.reduce((s, a) => s + num(a.hours), 0).toFixed(2);
  const works = db.works.filter(w => String(w.staffName || '').toLowerCase() === staff.toLowerCase() && String(w.date || '').startsWith(ym));
  const totalProfit = works.reduce((s, w) => s + profit(w), 0);
  const commission = works.reduce((s, w) => s + workCommission(w), 0);
  const sTarget = db.agency?.staffProfitTarget === undefined ? 50000 : num(db.agency.staffProfitTarget);
  const sBonusPct = db.agency?.staffBonusPct === undefined ? 5 : num(db.agency.staffBonusPct);
  const bonus = (sTarget > 0 && totalProfit >= sTarget && sBonusPct > 0) ? totalProfit * (sBonusPct / 100) : 0;
  const salaryPaid = db.expenses.filter(e => e.approvalStatus !== 'pending' && e.category === 'Salary' && String(e.date || '').startsWith(ym) && ((e.title || '').toLowerCase().includes(staff.toLowerCase()) || (e.note || '').toLowerCase().includes(staff.toLowerCase()))).reduce((s, e) => s + num(e.amount), 0);
  const grossPay = baseSalary + commission + bonus;
  const netPayable = Math.max(0, grossPay - deduction - salaryPaid);
  return { staff, ym, baseSalary, deduction, attList, daysPresent, totalHours, worksCount: works.length, totalProfit, commission, bonus, salaryPaid, grossPay, netPayable };
}

window.renderStaffHrModal = () => {
  const d = computeStaffPayslipData();
  const openToday = (db.staffAttendance || []).find(a => a.staffName === d.staff && a.date === today() && !a.outTs);
  if ($('hrTodayStatus')) {
    $('hrTodayStatus').textContent = openToday ? `🟢 অন ডিউটি (${openToday.inTime})` : '⚪ অফ ডিউটি';
    $('hrTodayStatus').className = openToday ? 'badge-success' : 'badge-admin';
  }
  if ($('hrStaffAttStats')) {
    $('hrStaffAttStats').innerHTML = `📅 উপস্থিতি: <strong>${d.daysPresent} দিন</strong> · ⏱️ মোট কাজ: <strong>${d.totalHours} ঘণ্টা</strong> · ⚡ ক্যাম্পেইন: <strong>${d.worksCount}টি</strong>`;
  }
  if ($('hrPayslipPreview')) {
    const ag = db.agency || {};
    $('hrPayslipPreview').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:8px;flex-wrap:wrap;gap:6px">
        <div><strong style="font-size:16px;color:var(--brand)">${esc(ag.name || 'Ads হিসাব ম্যানেজার')}</strong><div class="muted" style="font-size:11.5px">স্যালারি ও কমিশন পেস্লিপ · মাস: ${esc(d.ym)}</div></div>
        <div style="text-align:right"><strong>স্টাফ: ${esc(d.staff)}</strong><div class="muted" style="font-size:11.5px">উপস্থিতি: ${d.daysPresent} দিন (${d.totalHours}h)</div></div>
      </div>
      <div class="payslip-grid">
        <div>মূল বেতন (Base): <strong>${money(d.baseSalary)}</strong></div>
        <div>ক্যাম্পেইন কমিশন (${d.worksCount}): <strong class="good">+${money(d.commission)}</strong></div>
        <div>মাসিক টার্গেট বোনাস: <strong class="good">+${money(d.bonus)}</strong></div>
        <div>মোট গ্রস আয়: <strong>${money(d.grossPay)}</strong></div>
        <div>অগ্রিম / কর্তন: <strong class="bad">-${money(d.deduction)}</strong></div>
        <div>ইতিমধ্যে পরিশোধিত (Salary Exp): <strong class="good">-${money(d.salaryPaid)}</strong></div>
      </div>
      <div style="padding:10px 12px;border-radius:10px;background:rgba(16,185,129,.12);display:flex;justify-content:space-between;align-items:center;font-size:15px">
        <strong>নিট প্রদেয় বেতন (Net Payable):</strong>
        <strong style="color:#059669;font-size:18px">${money(d.netPayable)}</strong>
      </div>
    `;
  }
  if ($('hrAttendanceRows')) {
    $('hrAttendanceRows').innerHTML = d.attList.map(a => `<tr>
      <td>${esc(a.date)}</td><td><strong>${esc(a.staffName)}</strong></td><td>${esc(a.inTime || '—')}</td><td>${esc(a.outTime || 'চলমান')}</td>
      <td>${num(a.hours) > 0 ? `${num(a.hours)} ঘঃ` : '—'}</td><td>${esc(a.note || '—')}</td>
      <td><button type="button" class="danger sm" onclick="deleteAttendanceRow('${a.id}')">✕</button></td>
    </tr>`).join('') || `<tr><td colspan="7">এই মাসে কোনো এটেনডেন্স রেকর্ড নেই</td></tr>`;
  }
};

window.printStaffPayslip = () => {
  document.body.classList.add('printing-payslip');
  window.print();
  setTimeout(() => document.body.classList.remove('printing-payslip'), 450);
};

window.downloadStaffPayslipPng = () => {
  const d = computeStaffPayslipData(), ag = db.agency || {};
  const W = 720, H = 430;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3157e8'; ctx.fillRect(0, 0, W, 14);
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 22px "Hind Siliguri", Inter, sans-serif';
  ctx.fillText(ag.name || 'Ads হিসাব ম্যানেজার', 32, 52);
  ctx.fillStyle = '#64748b'; ctx.font = '13px "Hind Siliguri", Inter, sans-serif';
  ctx.fillText(`SALARY & COMMISSION PAYSLIP · মাস: ${d.ym}`, 32, 76);
  ctx.strokeStyle = '#e2e8f0'; ctx.beginPath(); ctx.moveTo(32, 96); ctx.lineTo(W - 32, 96); ctx.stroke();
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 16px "Hind Siliguri", Inter, sans-serif';
  ctx.fillText(`কর্মী: ${d.staff}   |   উপস্থিতি: ${d.daysPresent} দিন (${d.totalHours} ঘণ্টা)`, 32, 128);
  const rows = [
    ['মূল বেতন (Base Salary)', money(d.baseSalary)],
    [`ক্যাম্পেইন কমিশন (${d.worksCount}টি কাজ)`, `+ ${money(d.commission)}`],
    ['মাসিক টার্গেট বোনাস', `+ ${money(d.bonus)}`],
    ['অগ্রিম / কর্তন', `- ${money(d.deduction)}`],
    ['ইতিমধ্যে পরিশোধিত', `- ${money(d.salaryPaid)}`]
  ];
  let y = 166;
  rows.forEach(([k, v]) => {
    ctx.fillStyle = '#334155'; ctx.font = '14px "Hind Siliguri", Inter, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(k, 36, y);
    ctx.fillStyle = '#0f172a'; ctx.font = 'bold 14px Inter, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(v, W - 36, y);
    ctx.strokeStyle = '#f1f5f9'; ctx.beginPath(); ctx.moveTo(36, y + 10); ctx.lineTo(W - 36, y + 10); ctx.stroke();
    y += 34;
  });
  ctx.fillStyle = '#ecfdf5'; ctx.fillRect(32, y + 10, W - 64, 56);
  ctx.textAlign = 'left'; ctx.fillStyle = '#065f46'; ctx.font = 'bold 16px "Hind Siliguri", Inter, sans-serif';
  ctx.fillText('নিট প্রদেয় (Net Payable):', 48, y + 44);
  ctx.textAlign = 'right'; ctx.font = 'bold 22px Inter, sans-serif';
  ctx.fillText(money(d.netPayable), W - 48, y + 46);
  c.toBlob(blob => {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `payslip_${d.staff.replace(/\s+/g, '_')}_${d.ym}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('স্যালারি পেস্লিপ PNG ডাউনলোড হয়েছে!');
  }, 'image/png');
};

// 5. AI Ad Copy, Hooks & Reels Script Generator + Client Brand Kits
let lastAiCopyResult = null;

window.openAiCopyModal = () => {
  if (!$('aiCopyModal')) return;
  const custId = $('gfxPosterCust')?.value;
  const cust = custId ? db.customers.find(c => c.id === custId) : null;
  if ($('aiCopyBrand') && !$('aiCopyBrand').value) $('aiCopyBrand').value = cust?.name || db.agency?.name || '';
  if ($('aiCopyPhone') && !$('aiCopyPhone').value) $('aiCopyPhone').value = cust?.phone || db.agency?.phone || '';
  $('aiCopyModal').style.display = 'flex';
};

if ($('aiCopyForm')) {
  $('aiCopyForm').onsubmit = async e => {
    e.preventDefault();
    const btn = $('aiCopyBtn');
    const oldTxt = btn?.textContent || '✨ AI ক্যাপশন ও হুক তৈরি করুন';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ AI লিখছে...'; }
    try {
      const res = await fetch('/api/ai-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: $('aiCopyBrand').value.trim(),
          product: $('aiCopyProduct').value.trim(),
          offer: $('aiCopyOffer')?.value.trim() || '',
          platform: $('aiCopyPlatform')?.value || 'Meta Ads',
          tone: $('aiCopyTone')?.value || 'Urgent & Persuasive Bengali',
          phone: $('aiCopyPhone')?.value.trim() || ''
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'AI generation failed');
      lastAiCopyResult = data;
      const hooks = Array.isArray(data.hooks) ? data.hooks : [];
      if ($('aiCopyHooksList')) {
        $('aiCopyHooksList').innerHTML = hooks.map((h, i) => `<div class="ai-hook-pill"><span><strong>#${i + 1}</strong> ${esc(h)}</span><button type="button" class="secondary sm" style="margin:0;flex-shrink:0" onclick="copyText('${esc(h).replace(/'/g, "\\'")}','হুক #${i + 1}')">📋</button></div>`).join('') || '<small class="muted">কোনো হুক পাওয়া যায়নি</small>';
      }
      if ($('aiCopyCaptionBox')) $('aiCopyCaptionBox').textContent = data.caption || '';
      if ($('aiCopyTagsBox')) $('aiCopyTagsBox').textContent = Array.isArray(data.hashtags) ? data.hashtags.join(' ') : '';
      if ($('aiCopyScriptBox')) $('aiCopyScriptBox').textContent = data.voiceScript || '';
      if ($('aiCopyResultBox')) $('aiCopyResultBox').style.display = 'block';
      toast('✨ AI অ্যাড কপি ও স্ক্রিপ্ট তৈরি হয়েছে!');
    } catch (err) {
      toast(err.message || 'AI কপি তৈরি করা যায়নি', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldTxt; }
    }
  };
}

window.applyAiCopyToPoster = () => {
  if (!lastAiCopyResult) return;
  closeModal('aiCopyModal');
  goToSection('graphicsHub');
  if ($('gfxHeadline') && lastAiCopyResult.posterHeadline) $('gfxHeadline').value = lastAiCopyResult.posterHeadline;
  if ($('gfxSubhead') && lastAiCopyResult.posterSubhead) $('gfxSubhead').value = lastAiCopyResult.posterSubhead;
  if ($('gfxCtaText') && lastAiCopyResult.posterCta) $('gfxCtaText').value = lastAiCopyResult.posterCta;
  if (typeof renderGfxPoster === 'function') renderGfxPoster();
  toast('🎨 AI হেডলাইন ও CTA পোস্টার স্টুডিওতে বসানো হয়েছে!');
};

window.shareAiCopyToFeed = () => {
  if (!lastAiCopyResult) return;
  closeModal('aiCopyModal');
  goToSection('newsFeed');
  if ($('feedTagSelect')) $('feedTagSelect').value = '💡 অ্যাডস টিপস';
  if ($('feedPostText')) $('feedPostText').value = `${lastAiCopyResult.caption || ''}\n\n${Array.isArray(lastAiCopyResult.hashtags) ? lastAiCopyResult.hashtags.join(' ') : ''}`.trim();
  toast('নিউজ ফিডে কপি রেডি — পোস্ট বাটন চাপুন!');
};

window.renderBrandKitsSelect = () => {
  const sel = $('gfxBrandKitSelect');
  if (!sel) return;
  const old = sel.value;
  const kits = db.brandKits || [];
  sel.innerHTML = `<option value="">ক্লায়েন্ট ব্র্যান্ড কিট লোড (${kits.length})...</option>` + kits.map(k => `<option value="${esc(k.id)}">${esc(k.name)} (${esc(k.c1)}/${esc(k.c2)})</option>`).join('');
  if (old && kits.some(k => k.id === old)) sel.value = old;
};

window.saveCurrentBrandKit = async () => {
  const custId = $('gfxPosterCust')?.value || '';
  const defName = custId ? cname(custId) : 'Agency Brand Kit';
  const name = await askPrompt('ব্র্যান্ড কিটের নাম লিখুন:', defName, 'ব্র্যান্ড কিট সেভ');
  if (!name || !name.trim()) return;
  db.brandKits = db.brandKits || [];
  const kit = {
    id: uid(), updatedAt: Date.now(), name: name.trim(), custId,
    c1: $('gfxColor1')?.value || '#1e3a8a', c2: $('gfxColor2')?.value || '#6d28d9',
    accent: $('gfxAccent')?.value || '#f59e0b', footer: $('gfxFooterText')?.value || '',
    layout: $('gfxLayoutStyle')?.value || 'classic'
  };
  db.brandKits.unshift(kit);
  save(); renderBrandKitsSelect();
  if ($('gfxBrandKitSelect')) $('gfxBrandKitSelect').value = kit.id;
  toast(`🎨 "${kit.name}" ব্র্যান্ড কিট সেভ হয়েছে!`);
};

window.applySelectedBrandKit = () => {
  const id = $('gfxBrandKitSelect')?.value;
  if (!id) return;
  const kit = (db.brandKits || []).find(k => k.id === id);
  if (!kit) return;
  if ($('gfxPosterCust') && kit.custId) $('gfxPosterCust').value = kit.custId;
  if ($('gfxColor1')) $('gfxColor1').value = kit.c1 || '#1e3a8a';
  if ($('gfxColor2')) $('gfxColor2').value = kit.c2 || '#6d28d9';
  if ($('gfxAccent')) $('gfxAccent').value = kit.accent || '#f59e0b';
  if ($('gfxFooterText') && kit.footer) $('gfxFooterText').value = kit.footer;
  if ($('gfxLayoutStyle') && kit.layout) $('gfxLayoutStyle').value = kit.layout;
  if (typeof renderGfxPoster === 'function') renderGfxPoster();
  toast(`🎨 "${kit.name}" ব্র্যান্ড থিম প্রয়োগ হয়েছে!`);
};

window.deleteSelectedBrandKit = async () => {
  const id = $('gfxBrandKitSelect')?.value;
  if (!id || !(await askConfirm('নির্বাচিত ব্র্যান্ড কিটটি মুছবেন?'))) return;
  markDeleted(id);
  db.brandKits = (db.brandKits || []).filter(k => k.id !== id);
  save(); renderBrandKitsSelect(); toast('ব্র্যান্ড কিট মুছে ফেলা হয়েছে', 'warn');
};

// 6. Client All-Campaigns Performance Summary Report Card
function computeClientSummaryStats() {
  const cid = $('csrCustomer')?.value || '';
  const from = $('csrFrom')?.value || '', to = $('csrTo')?.value || '';
  const cust = db.customers.find(c => c.id === cid) || null;
  const works = db.works.filter(w => {
    if (cid && w.customerId !== cid) return false;
    if (from && String(w.date || '') < from) return false;
    if (to && String(w.date || '') > to) return false;
    return true;
  });
  const totalUsd = works.reduce((s, w) => s + num(w.actualDollar), 0);
  const totalBill = works.reduce((s, w) => s + bill(w), 0);
  const totalReach = works.reduce((s, w) => s + num(w.reach), 0);
  const totalClicks = works.reduce((s, w) => s + num(w.clicks), 0);
  const totalResults = works.reduce((s, w) => s + num(w.conversions), 0);
  const totalRev = works.reduce((s, w) => s + num(w.revenue), 0);
  const cprUsd = totalResults > 0 ? usd(totalUsd / totalResults) : '—';
  const roas = (totalRev > 0 && totalBill > 0) ? (totalRev / totalBill).toFixed(2) + 'x' : '—';
  const bal = cid ? clientBalance(cid) : 0;
  return { cid, cust, from, to, works, totalUsd, totalBill, totalReach, totalClicks, totalResults, totalRev, cprUsd, roas, bal };
}

window.openClientSummaryReportModal = (custId = '') => {
  if (!$('clientSummaryReportModal')) return;
  fillSelect('csrCustomer', db.customers, L('কাস্টমার নির্বাচন', 'Select Customer'));
  if (custId && $('csrCustomer')) $('csrCustomer').value = custId;
  else if (!$('csrCustomer')?.value && db.customers.length) $('csrCustomer').value = db.customers[0].id;
  renderClientSummaryReport();
  $('clientSummaryReportModal').style.display = 'flex';
};

window.renderClientSummaryReport = () => {
  const host = $('csrBody');
  if (!host) return;
  const d = computeClientSummaryStats();
  if (!d.cust) {
    host.innerHTML = `<div class="muted" style="text-align:center;padding:24px">রিপোর্ট দেখার জন্য উপরে একটি কাস্টমার নির্বাচন করুন</div>`;
    return;
  }
  const byPlat = {};
  d.works.forEach(w => {
    const pl = AD_PLATFORMS.includes(w.platform) ? w.platform : 'Meta';
    byPlat[pl] = byPlat[pl] || { count: 0, usd: 0, bill: 0, res: 0 };
    byPlat[pl].count++; byPlat[pl].usd += num(w.actualDollar); byPlat[pl].bill += bill(w); byPlat[pl].res += num(w.conversions);
  });
  host.innerHTML = `
    <div style="padding:14px;border-radius:12px;background:linear-gradient(135deg,#1e3a8a,#4f46e5);color:#fff;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div><strong style="font-size:17px">${esc(d.cust.name)}</strong><div style="font-size:12px;opacity:.88">${esc(d.from || 'শুরু')} → ${esc(d.to || 'আজ')} · মোট ক্যাম্পেইন: ${d.works.length}টি</div></div>
        <div style="text-align:right;font-size:12.5px">ব্যালেন্স: <strong>${d.bal < 0 ? `বকেয়া ${money(-d.bal)}` : (d.bal > 0 ? `অ্যাডভান্স ${money(d.bal)}` : '৳0 (সমন্বিত)')}</strong></div>
      </div>
    </div>
    <div class="perf-grid" style="margin-bottom:12px">
      <div class="perf-stat"><small>মোট ডলার স্পেন্ড</small><strong>${usd(d.totalUsd)}</strong></div>
      <div class="perf-stat"><small>মোট বিল</small><strong>${money(d.totalBill)}</strong></div>
      <div class="perf-stat"><small>Total Reach</small><strong>${d.totalReach.toLocaleString()}</strong></div>
      <div class="perf-stat"><small>Total Clicks</small><strong>${d.totalClicks.toLocaleString()}</strong></div>
      <div class="perf-stat"><small>Total Results</small><strong>${d.totalResults.toLocaleString()}</strong></div>
      <div class="perf-stat"><small>Avg Cost/Result</small><strong>${d.cprUsd}</strong></div>
      <div class="perf-stat"><small>Client Revenue</small><strong>${money(d.totalRev)}</strong></div>
      <div class="perf-stat"><small>Blended ROAS</small><strong>${d.roas}</strong></div>
    </div>
    ${Object.keys(byPlat).length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${Object.entries(byPlat).map(([pl, v]) => `<span class="badge-admin" style="padding:6px 10px">${esc(pl)}: ${v.count}টি · ${usd(v.usd)} · ${v.res} Res</span>`).join('')}</div>` : ''}
    <div class="tablewrap" style="max-height:220px"><table><thead><tr><th>তারিখ</th><th>প্ল্যাটফর্ম ও ক্যাম্পেইন</th><th>ডলার</th><th>বিল</th><th>Reach / Clicks / Res</th></tr></thead><tbody>${d.works.slice(0, 25).map(w => `<tr><td>${esc(w.date)}</td><td>${platformBadge(w.platform)} <strong>${esc(w.name)}</strong></td><td>${usd(w.actualDollar)}</td><td>${money(bill(w))}</td><td><small>R:${num(w.reach)} · C:${num(w.clicks)} · <strong>${num(w.conversions)}</strong></small></td></tr>`).join('') || '<tr><td colspan="5">কোনো ক্যাম্পেইন পাওয়া যায়নি</td></tr>'}</tbody></table></div>
  `;
};

window.prepareClientSummaryWaLink = el => {
  const d = computeClientSummaryStats();
  if (!d.cust) { toast('কাস্টমার নির্বাচন করুন!', 'error'); return false; }
  const wa = normalizeBdPhone(d.cust.phone || '');
  if (!wa) { toast('কাস্টমারের মোবাইল নম্বর নেই!', 'error'); return false; }
  const txt = `📊 *অল-ক্যাম্পেইন পারফরম্যান্স রিপোর্ট*\nক্লায়েন্ট: ${d.cust.name}\nসময়কাল: ${d.from || 'শুরু'} – ${d.to || 'আজ'}\n\n• মোট ক্যাম্পেইন: ${d.works.length}টি\n• মোট স্পেন্ড: ${usd(d.totalUsd)}\n• মোট বিল: ${money(d.totalBill)}\n• Reach: ${d.totalReach.toLocaleString()}\n• Clicks: ${d.totalClicks.toLocaleString()}\n• Results: ${d.totalResults.toLocaleString()} (Avg CPR: ${d.cprUsd})\n• ROAS: ${d.roas}\n\n— ${db.agency?.name || 'Ads হিসাব ম্যানেজার'}`;
  el.href = `https://wa.me/${wa}?text=${encodeURIComponent(txt)}`;
  return true;
};

window.downloadClientSummaryPng = async () => {
  const d = computeClientSummaryStats(), ag = db.agency || {};
  if (!d.cust) return toast('কাস্টমার নির্বাচন করুন!', 'error');
  const W = 800, H = 480;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, 110);
  g.addColorStop(0, '#1e3a8a'); g.addColorStop(1, '#4f46e5');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 115);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px "Hind Siliguri", Inter, sans-serif';
  ctx.fillText(ag.name || 'Ads হিসাব ম্যানেজার', 32, 46);
  ctx.font = '14px "Hind Siliguri", Inter, sans-serif';
  ctx.fillText(`ক্লায়েন্ট পারফরম্যান্স স্কোরকার্ড: ${d.cust.name}`, 32, 74);
  ctx.fillText(`সময়কাল: ${d.from || 'শুরু'} থেকে ${d.to || 'আজ'} · মোট ক্যাম্পেইন: ${d.works.length}টি`, 32, 98);
  const cards = [
    ['মোট স্পেন্ড', usd(d.totalUsd)],
    ['মোট বিল', money(d.totalBill)],
    ['Total Reach', d.totalReach.toLocaleString()],
    ['Total Clicks', d.totalClicks.toLocaleString()],
    ['Total Results', d.totalResults.toLocaleString()],
    ['Avg Cost/Result', d.cprUsd],
    ['Client Revenue', money(d.totalRev)],
    ['Blended ROAS', d.roas]
  ];
  cards.forEach(([lbl, val], i) => {
    const col = i % 4, row = Math.floor(i / 4), bx = 32 + col * 186, by = 142 + row * 92;
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(bx, by, 174, 78);
    ctx.strokeStyle = '#e2e8f0'; ctx.strokeRect(bx, by, 174, 78);
    ctx.fillStyle = '#64748b'; ctx.font = '12px "Hind Siliguri", Inter, sans-serif'; ctx.fillText(lbl, bx + 12, by + 26);
    ctx.fillStyle = '#1e3a8a'; ctx.font = 'bold 17px Inter, sans-serif'; ctx.fillText(val, bx + 12, by + 56);
  });
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 14px "Hind Siliguri", Inter, sans-serif';
  ctx.fillText(`বর্তমান অ্যাকাউন্ট ব্যালেন্স: ${d.bal < 0 ? `বকেয়া ${money(-d.bal)}` : (d.bal > 0 ? `অ্যাডভান্স ${money(d.bal)}` : '৳0.00 (সমন্বিত)')}`, 32, 365);
  ctx.fillStyle = '#64748b'; ctx.font = '12px "Hind Siliguri", Inter, sans-serif';
  ctx.fillText(agencyContactLine(ag), 32, 415);
  ctx.fillText(`Generated on ${today()}`, 32, 442);
  c.toBlob(blob => {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `client_report_${d.cust.name.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('ক্লায়েন্ট রিপোর্ট কার্ড PNG ডাউনলোড হয়েছে!');
  }, 'image/png');
};

// === LIVE APP UPDATE & DEPLOY BROADCAST SYSTEM ===
const ACK_RELOAD_EPOCH_KEY = 'ads_hisab_ack_reload_epoch_v82';
let clientInitialBuildHash = '';
let newServerBuildDetected = false;
let swRegistrationRef = null;
let swWaitingWorker = null;
let swUpdateDetected = false;
let liveUpdateState = { stage: 'idle', message: '', versionLabel: '', reloadEpoch: 1, updatedAt: 0 };
let dismissedLiveBuildTag = '';

function getAckedReloadEpoch() {
  try { return Number(localStorage.getItem(ACK_RELOAD_EPOCH_KEY) || '0') || 0; } catch (_) { return 0; }
}
function setAckedReloadEpoch(epoch) {
  try { localStorage.setItem(ACK_RELOAD_EPOCH_KEY, String(Math.max(0, Number(epoch) || 0))); } catch (_) {}
}

function renderSaLiveUpdateAdminStatus() {
  const badge = $('saLiveUpdateBadge');
  if (!badge) return;
  const st = liveUpdateState || {};
  if (st.stage === 'updating') {
    badge.className = 'badge-warn';
    badge.textContent = '🔄 আপডেট চলছে (সবাই দেখছে)';
  } else if (st.stage === 'ready' || newServerBuildDetected || swUpdateDetected) {
    badge.className = 'badge-success';
    badge.textContent = `✨ আপডেট রেডি (v${st.versionLabel || '82'})`;
  } else {
    badge.className = 'badge-admin';
    badge.textContent = '🟢 স্বাভাবিক';
  }
}

function renderAppLiveUpdateBanner() {
  const st = liveUpdateState || { stage: 'idle', message: '', reloadEpoch: 1 };
  const acked = getAckedReloadEpoch();
  const epochReady = st.stage === 'ready' && Number(st.reloadEpoch || 1) > acked;
  const isUpdating = st.stage === 'updating';
  const hasReadyUpdate = Boolean(newServerBuildDetected || swUpdateDetected || epochReady);
  const currentTag = `${clientInitialBuildHash}|${st.stage}|${st.reloadEpoch}|${swUpdateDetected ? 1 : 0}|${newServerBuildDetected ? 1 : 0}`;
  const isDismissed = !isUpdating && dismissedLiveBuildTag === currentTag;

  const mainBanner = $('appLiveUpdateBanner');
  const mainBadge = $('appLiveUpdateBadge');
  const mainText = $('appLiveUpdateText');
  const mainApplyBtn = $('appLiveUpdateApplyBtn');
  const mainDismissBtn = $('appLiveUpdateDismissBtn');

  const authBanner = $('authLiveUpdateBanner');
  const authText = $('authLiveUpdateText');
  const authBtn = $('authLiveUpdateBtn');

  if (!isUpdating && (!hasReadyUpdate || isDismissed)) {
    if (mainBanner) mainBanner.style.display = 'none';
    if (authBanner) authBanner.style.display = 'none';
    renderSaLiveUpdateAdminStatus();
    return;
  }

  const modeClass = isUpdating ? 'is-updating' : 'is-ready';
  const msgText = isUpdating
    ? (st.message || 'সিস্টেমে নতুন আপডেট চলছে — কিছুক্ষণের মধ্যেই নতুন ফিচার যুক্ত হবে।')
    : (st.message || 'নতুন আপডেট চলে এসেছে! সর্বশেষ পরিবর্তন পেতে রিলোড দিন।');

  if (mainBanner) {
    mainBanner.className = `live-update-banner noprint ${modeClass}`;
    mainBanner.style.display = 'flex';
    if (mainBadge) mainBadge.textContent = isUpdating ? '🔄 আপডেট চলছে' : '✨ নতুন আপডেট';
    if (mainText) mainText.textContent = msgText;
    if (mainApplyBtn) mainApplyBtn.style.display = hasReadyUpdate ? 'inline-flex' : 'none';
    if (mainDismissBtn) mainDismissBtn.style.display = (!isUpdating && hasReadyUpdate) ? 'inline-flex' : 'none';
  }
  if (authBanner) {
    authBanner.className = `live-update-banner ${modeClass}`;
    authBanner.style.display = 'flex';
    if (authText) authText.textContent = msgText;
    if (authBtn) authBtn.style.display = hasReadyUpdate ? 'inline-flex' : 'none';
  }
  renderSaLiveUpdateAdminStatus();
}

function handleServerVersionSnapshot(data, fromBroadcast) {
  if (!data || typeof data !== 'object') return;
  const incomingHash = String(data.buildHash || '').trim();
  const prevStage = liveUpdateState?.stage || 'idle';
  const prevEpoch = Number(liveUpdateState?.reloadEpoch || 1);

  if (incomingHash) {
    if (!clientInitialBuildHash) {
      clientInitialBuildHash = incomingHash;
    } else if (incomingHash !== clientInitialBuildHash) {
      newServerBuildDetected = true;
    }
  }
  if (data.updateStatus && typeof data.updateStatus === 'object') {
    liveUpdateState = {
      stage: data.updateStatus.stage || 'idle',
      message: String(data.updateStatus.message || ''),
      versionLabel: String(data.updateStatus.versionLabel || data.version || ''),
      reloadEpoch: Math.max(1, Number(data.updateStatus.reloadEpoch) || 1),
      updatedAt: Number(data.updateStatus.updatedAt) || Date.now(),
    };
    if (prevStage !== liveUpdateState.stage || prevEpoch !== liveUpdateState.reloadEpoch) {
      dismissedLiveBuildTag = '';
    }
    if (fromBroadcast) {
      if (liveUpdateState.stage === 'updating') {
        toast(`🔄 ${liveUpdateState.message || 'সিস্টেমে নতুন আপডেট চলছে...'}`, 'warn');
      } else if (liveUpdateState.stage === 'ready') {
        toast(`✨ ${liveUpdateState.message || 'নতুন আপডেট চলে এসেছে — রিলোড দিন!'}`, 'ok');
      }
    }
  }
  renderAppLiveUpdateBanner();
}

window.dismissLiveAppUpdate = () => {
  const st = liveUpdateState || { stage: 'idle', reloadEpoch: 1 };
  dismissedLiveBuildTag = `${clientInitialBuildHash}|${st.stage}|${st.reloadEpoch}|${swUpdateDetected ? 1 : 0}|${newServerBuildDetected ? 1 : 0}`;
  renderAppLiveUpdateBanner();
};

window.applyLiveAppUpdate = async () => {
  if (liveUpdateState?.reloadEpoch) setAckedReloadEpoch(liveUpdateState.reloadEpoch);
  try {
    if (swWaitingWorker) swWaitingWorker.postMessage({ type: 'SKIP_WAITING' });
    if (swRegistrationRef?.waiting) swRegistrationRef.waiting.postMessage({ type: 'SKIP_WAITING' });
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if (swRegistrationRef) await swRegistrationRef.update().catch(() => {});
  } catch (_) {}
  location.reload();
};

window.triggerSystemUpdateStatus = async action => {
  if (!isSuperAdmin()) return;
  if (!serverAuthToken) return toast('সুপার অ্যাডমিন সার্ভার লগইন প্রয়োজন', 'error');
  const message = ($('saUpdateCustomMsg')?.value || '').trim();
  try {
    const res = await serverFetch('/api/system/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'আপডেট স্ট্যাটাস পাঠানো যায়নি');
    if (action === 'finish_ready' && data.updateStatus?.reloadEpoch) {
      setAckedReloadEpoch(data.updateStatus.reloadEpoch);
    }
    handleServerVersionSnapshot(data, false);
    if (action === 'start_updating') toast('🔄 সব ইউজারের স্ক্রিনে "আপডেট চলছে" বার্তা পাঠানো হয়েছে!');
    else if (action === 'finish_ready') toast('✅ সবার স্ক্রিনে নতুন আপডেট ও রিলোড নোটিশ পাঠানো হয়েছে!');
    else toast('🟢 লাইভ আপডেট ব্যানার বন্ধ করা হয়েছে।');
  } catch (err) {
    toast(err.message || 'সার্ভার এরর', 'error');
  }
};

let staticHostDetected = false;
async function pollAppVersionStatus(checkSw) {
  if (!staticHostDetected) {
    try {
      const res = await fetch('/api/app-version?_t=' + Date.now(), { cache: 'no-store' });
      if (res.status === 404) {
        staticHostDetected = true;
      } else if (res.ok) {
        const data = await res.json();
        handleServerVersionSnapshot(data, false);
      }
    } catch (_) {}
  }
  if (checkSw && swRegistrationRef) {
    try { await swRegistrationRef.update(); } catch (_) {}
  }
}

// PWA & Boot
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
      swRegistrationRef = reg;
      if (reg.waiting) {
        swWaitingWorker = reg.waiting;
        swUpdateDetected = true;
        renderAppLiveUpdateBanner();
      }
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            swWaitingWorker = nw;
            swUpdateDetected = true;
            renderAppLiveUpdateBanner();
          }
        });
      });
    }).catch(() => {});
  });
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstallPrompt = e; if ($('pwaInstallBtn')) $('pwaInstallBtn').style.display = 'inline-flex'; });
if ($('pwaInstallBtn')) $('pwaInstallBtn').onclick = async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('pwaInstallBtn').style.display = 'none'; };

setInterval(() => { if (!document.hidden) pollAppVersionStatus(true); }, 25000);
window.addEventListener('focus', () => pollAppVersionStatus(true));
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollAppVersionStatus(true); });

(async function bootApp() {
  if (await checkAndRenderPortal()) return;
  let serverReachable = false;
  try {
    const stRes = await fetch('/api/auth/status?_t=' + Date.now(), { credentials: 'same-origin', cache: 'no-store' });
    if (stRes.ok) {
      serverReachable = true;
      const st = await stRes.json();
      handleServerVersionSnapshot(st, false);
      if (st.subscriptionConfig) writeSubscriptionConfig(st.subscriptionConfig);
      if (st.signupPolicy) {
        const meta = readSuperAdminMeta();
        meta.conditions = { ...(meta.conditions || {}), signupPolicy: st.signupPolicy };
        writeSuperAdminMeta(meta);
      }
      applyGlobalNotice();
      if ($('claimAdminPanel')) $('claimAdminPanel').style.display = (!st.adminClaimed && !st.envAdminSet) ? 'block' : 'none';
    }
  } catch (_) {}

  if (serverReachable) {
    try {
      const sessRes = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin'
      });
      const sessData = await sessRes.json().catch(() => null);
      if (sessRes.ok && sessData?.ok && sessData.account && sessData.token) {
        serverAuthToken = sessData.token;
        if (sessData.subscriptionConfig) writeSubscriptionConfig(sessData.subscriptionConfig);
        if (sessData.account.id !== 'legacy-super-admin') {
          const accs = readLocalAccounts(), idx = accs.findIndex(a => a.id === sessData.account.id);
          if (idx !== -1) { accs[idx] = { ...accs[idx], ...sessData.account }; localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs)); }
          else { accs.push(sessData.account); localStorage.setItem(ACCOUNTSKEY, JSON.stringify(accs)); }
        }
        enterLoggedInUI(sessData.account, true);
      } else if (sessData?.subscriptionExpired) {
        const msg = sessData.error || 'সাবস্ক্রিপশন মেয়াদ শেষ — অ্যাকাউন্ট লক!';
        performLocalLogout(msg);
        openSubscriptionModal({ expiredLock: true, lockMessage: msg, lockedAccount: sessData.account, previewOnly: true });
        return;
      } else {
        sessionStorage.removeItem(SESSION_ACC_KEY);
      }
    } catch (_) {}
  } else {
    const rem = decodeRemember(localStorage.getItem(REMEMBER_LOGIN_KEY) || '');
    if (rem?.offlineOnly && rem?.accountId) {
      const acc = rem.accountId === 'legacy-super-admin'
        ? (localStorage.getItem(PASSKEY) ? { id: 'legacy-super-admin', username: 'admin', name: 'Super Admin', email: 'admin@example.com', phone: '01700000000', role: 'super_admin', userNumber: 1, status: 'active' } : null)
        : readLocalAccounts().find(a => a.id === rem.accountId);
      if (acc && acc.status === 'active' && !isAccountExpired(acc)) {
        enterLoggedInUI(acc, true);
      } else if (acc && isAccountExpired(acc)) {
        localStorage.removeItem(REMEMBER_LOGIN_KEY);
        const msg = `আপনার ফ্রি ট্রায়াল / সাবস্ক্রিপশন মেয়াদ (${acc.expiryDate}) শেষ হওয়ায় অ্যাকাউন্ট অটো-লক হয়েছে 🔒`;
        performLocalLogout(msg);
        openSubscriptionModal({ expiredLock: true, lockMessage: msg, lockedAccount: acc, previewOnly: true });
        return;
      }
    }
  }

  const cfg = readCloudSync();
  if (cfg.url && navigator.onLine) await pullFromCloud(true, cfg.url, cfg.secret || '');
  if (!activeAccount) {
    updateHeaderAndProfile(); render(); updateWorkPreview(); updateQuotePreview(); generatePixelCode(); renderMonthlyReport();
    resetAllTransientForms(); clearAuthForms();
    setTimeout(() => { if (!activeAccount) clearAuthForms(); }, 80);
  }
})();

// === SUPER ADMIN EXTENDED POWER SUITE (SESSIONS · TAB MATRIX · MAKER-CHECKER · RISK AUDIT · EXEC PDF · GUIDE) ===
window.approveMakerRequest = id => {
  if (!isSuperAdmin()) return;
  const req = (db.makerRequests || []).find(r => r.id === id);
  if (!req) return;
  const p = req.payload || {};
  if (req.kind === 'rate') db.rates.push({ ...p, updatedAt: Date.now() });
  else if (req.kind === 'deposit') db.cardDeposits.push({ ...p, updatedAt: Date.now() });
  else if (req.kind === 'cardTransfer') db.cardTransfers.push({ ...p, updatedAt: Date.now() });
  else if (req.kind === 'cardRefund') db.cardRefunds.push({ ...p, updatedAt: Date.now() });
  else if (req.kind === 'walletTransfer') {
    if (!Array.isArray(db.walletTransfers)) db.walletTransfers = [];
    db.walletTransfers.push({ ...p, updatedAt: Date.now() });
  }
  markDeleted(id);
  db.makerRequests = (db.makerRequests || []).filter(r => r.id !== id);
  save();
  logActivity(`মেকার-চেকার অনুমোদন: ${req.summary} (${req.amountLabel})`);
  renderAdminPanel();
  toast('✅ মেকার-চেকার রিকোয়েস্ট অনুমোদিত ও মূল হিসাবে যুক্ত হয়েছে!');
};

window.rejectMakerRequest = async id => {
  if (!isSuperAdmin() || !(await askConfirm('এই মেকার-চেকার রিকোয়েস্টটি বাতিল করবেন?'))) return;
  const req = (db.makerRequests || []).find(r => r.id === id);
  markDeleted(id);
  db.makerRequests = (db.makerRequests || []).filter(r => r.id !== id);
  save();
  if (req) logActivity(`মেকার-চেকার বাতিল: ${req.summary}`);
  renderAdminPanel();
  toast('❌ রিকোয়েস্ট বাতিল করা হয়েছে', 'warn');
};

window.loadLiveSessions = async (showToast = false) => {
  if (!isSuperAdmin()) return;
  try {
    if (typeof connectTeamRoomSocket === 'function' && (!teamWs || teamWs.readyState !== WebSocket.OPEN)) {
      connectTeamRoomSocket();
    } else if (typeof syncTeamRoomHello === 'function') {
      syncTeamRoomHello();
    }
    const r = await serverFetch('/api/sessions');
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      const err = new Error(data.error || `HTTP ${r.status}`);
      err.status = r.status;
      throw err;
    }
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const audit = Array.isArray(data.loginAudit) ? data.loginAudit : [];
    if ($('saSessionRows')) {
      $('saSessionRows').innerHTML = sessions.map(s => {
        const mins = Math.max(0, Math.round((Date.now() - num(s.connectedAt)) / 60000));
        const isSelf = s.clientId === teamClientId || s.role === 'super_admin';
        return `<tr>
          <td><strong>${esc(s.name || 'User')}</strong><br><small class="muted">@${esc(s.username || 'guest')} · ${esc(s.role || 'user')}</small></td>
          <td>${esc(s.device || 'Browser')}</td>
          <td><code>${esc(s.ip || 'local')}</code></td>
          <td><small>${mins} মিনিট ধরে</small></td>
          <td>${s.inVoice ? '<span class="badge-success">🎙️ কথা বলছে</span>' : '<span class="muted">—</span>'}</td>
          <td>${isSelf ? '<span class="badge-admin">বর্তমান সেশন</span>' : `<button type="button" class="danger sm" onclick="forceLogoutSession('${esc(s.clientId)}','${esc(s.username)}','${esc(s.name)}')">📤 লগআউট</button>`}</td>
        </tr>`;
      }).join('') || `<tr><td colspan="6">কোনো সক্রিয় সেশন পাওয়া যায়নি।</td></tr>`;
    }
    if ($('saLoginAuditRows')) {
      $('saLoginAuditRows').innerHTML = audit.map(a => `<tr><td><small>${esc(a.time)}</small></td><td><strong>${esc(a.name)}</strong> <small class="muted">(@${esc(a.username)})</small></td><td><span class="badge-admin">${esc(a.role)}</span></td><td>${esc(a.device)}</td><td><code>${esc(a.ip)}</code></td></tr>`).join('') || `<tr><td colspan="5">কোনো লগইন অডিট ইতিহাস নেই।</td></tr>`;
    }
    if (showToast) toast(`🌐 ${sessions.length}টি লাইভ সেশন রিফ্রেশ হয়েছে!`);
  } catch (err) {
    const isNetworkErr = !navigator.onLine || err?.name === 'TypeError' || /failed to fetch|network/i.test(String(err?.message || ''));
    if (err?.status === 404) {
      const actor = typeof getCurrentActor === 'function' ? getCurrentActor() : { name: activeAccount?.name || 'Admin', username: activeAccount?.username || 'admin', role: activeAccount?.role || 'super_admin' };
      const ua = navigator.userAgent || '';
      const localDev = (/android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'macOS' : 'Browser') + ' · ' + (/edg/i.test(ua) ? 'Edge' : /chrome/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Browser');
      if ($('saSessionRows')) {
        $('saSessionRows').innerHTML = `<tr>
          <td><strong>${esc(actor.name)}</strong><br><small class="muted">@${esc(actor.username)} · ${esc(actor.role)}</small></td>
          <td>${esc(localDev)}</td>
          <td><code>লোকাল / স্ট্যাটিক হোস্ট</code></td>
          <td><small>এখন সক্রিয়</small></td>
          <td><span class="muted">—</span></td>
          <td><span class="badge-admin">বর্তমান সেশন</span></td>
        </tr>
        <tr><td colspan="6"><small class="muted">⚠️ এই হোস্টিংয়ে ব্যাকএন্ড সার্ভার (<code>server.ts</code>) চালু নেই, তাই অন্য ডিভাইস ও লাইভ IP দেখা যাচ্ছে না। GitHub Pages শুধু স্ট্যাটিক ফাইল চালায়—লাইভ সেশন, IP ও অটো পেমেন্টের জন্য Render / Railway / VPS বা AI Studio অ্যাপ লিংকে <code>npm start</code> চালান।</small></td></tr>`;
      }
      if (showToast) toast('ব্যাকএন্ড সার্ভার চালু নেই (404) — লাইভ IP ও অন্য ডিভাইস দেখতে Node.js সার্ভার (npm start) প্রয়োজন', 'warn');
      return;
    }
    if (showToast) {
      if (isNetworkErr) toast('সার্ভার সংযোগ পাওয়া যাচ্ছে না (অফলাইন মোড)', 'warn');
      else if (err?.status === 401 || err?.status === 403) toast('সার্ভার সেশন মেয়াদোত্তীর্ণ — একবার লগআউট করে পুনরায় লগইন করুন', 'warn');
      else toast(err?.message || 'সেশন ডেটা আনতে সমস্যা হয়েছে', 'warn');
    }
  }
};

window.forceLogoutSession = async (clientId, targetUsername, displayName) => {
  if (!isSuperAdmin()) return;
  if (!targetUsername && !clientId) return;
  if (!(await askConfirm(`${displayName || '@' + targetUsername}-কে সাথে সাথে রিমোট লগআউট করবেন?`))) return;
  try {
    const r = await serverFetch('/api/sessions/force-logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorRole: activeAccount?.role || 'super_admin', clientId, targetUsername })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error');
    logActivity(`রিমোট ফোর্স লগআউট: ${displayName || targetUsername}`);
    toast(`📤 ${displayName || targetUsername} কে লগআউট করা হয়েছে!`);
    loadLiveSessions(false);
  } catch (err) {
    toast(err.message || 'ফোর্স লগআউট ব্যর্থ', 'error');
  }
};

window.forceLogoutAllNonSuper = async () => {
  if (!isSuperAdmin() || !(await askConfirm('সুপার অ্যাডমিন ছাড়া অনলাইনে থাকা সব স্টাফ ও ইউজারকে সাথে সাথে লগআউট করবেন?'))) return;
  try {
    const r = await serverFetch('/api/sessions/force-logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorRole: activeAccount?.role || 'super_admin', excludeAdmin: true })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error');
    logActivity(`গ্লোবাল ফোর্স লগআউট (${d.kicked || 0} সেশন)`);
    toast(`📤 ${d.kicked || 0}টি সেশন রিমোট লগআউট করা হয়েছে!`, 'warn');
    loadLiveSessions(false);
  } catch (err) {
    toast(err.message || 'ব্যর্থ হয়েছে', 'error');
  }
};

window.renderRoleTabVisibilityMatrix = () => {
  const box = $('saTabMatrixGrid');
  if (!box || !isSuperAdmin()) return;
  const hiddenMap = getRules().hiddenTabsByRole || {};
  const roles = [
    { key: 'staff', label: 'Staff' },
    { key: 'user', label: 'User' },
    { key: 'admin', label: 'Admin' }
  ];
  box.innerHTML = `<table class="sa-tab-matrix"><thead><tr><th>সাইডবার সেকশন / ফিচার</th>${roles.map(r => `<th>${r.label} দেখবে</th>`).join('')}</tr></thead><tbody>` +
    SA_CONFIGURABLE_TABS.map(t => `<tr><td>${t.label}</td>${roles.map(r => {
      const hidden = Array.isArray(hiddenMap[r.key]) && hiddenMap[r.key].includes(t.key);
      return `<td><input type="checkbox" ${!hidden ? 'checked' : ''} onchange="toggleRoleTabVisibility('${r.key}','${t.key}',this.checked)"></td>`;
    }).join('')}</tr>`).join('') + `</tbody></table>`;
};

window.toggleRoleTabVisibility = (role, tabKey, visible) => {
  if (!isSuperAdmin()) return;
  const meta = readSuperAdminMeta();
  meta.conditions = meta.conditions || {};
  meta.conditions.hiddenTabsByRole = meta.conditions.hiddenTabsByRole || {};
  const cur = new Set(Array.isArray(meta.conditions.hiddenTabsByRole[role]) ? meta.conditions.hiddenTabsByRole[role] : []);
  if (visible) cur.delete(tabKey); else cur.add(tabKey);
  meta.conditions.hiddenTabsByRole[role] = Array.from(cur);
  writeSuperAdminMeta(meta);
  applyPermissionClasses();
  triggerAccountCloudSync();
  toast(`${role.toUpperCase()} রোল আপডেট: ${visible ? 'চালু ✅' : 'বন্ধ 🔒'}`);
};

window.resetRoleTabVisibility = async () => {
  if (!isSuperAdmin() || !(await askConfirm('সব রোলের সব মেনু ও ফিচার ডিফল্ট চালু করবেন?'))) return;
  const meta = readSuperAdminMeta();
  meta.conditions = meta.conditions || {};
  meta.conditions.hiddenTabsByRole = {};
  writeSuperAdminMeta(meta);
  applyPermissionClasses();
  renderRoleTabVisibilityMatrix();
  triggerAccountCloudSync();
  toast('সব রোলের সাইডবার মেনু পুনরায় চালু হয়েছে!');
};

window.applyCloneUserTemplate = srcId => {
  if (!srcId) return;
  const src = readLocalAccounts().find(a => a.id === srcId);
  if (!src) return;
  if ($('auRole')) { $('auRole').value = src.role || 'staff'; $('auRole').dispatchEvent(new Event('change')); }
  if ($('auPlan')) $('auPlan').value = src.plan || 'Lifetime';
  const p = { canDelete: false, canEdit: true, canPayments: true, canExpenses: true, ...(src.perms || {}) };
  if ($('auPermDel')) $('auPermDel').checked = Boolean(p.canDelete);
  if ($('auPermEdit')) $('auPermEdit').checked = Boolean(p.canEdit);
  if ($('auPermPay')) $('auPermPay').checked = Boolean(p.canPayments);
  if ($('auPermExp')) $('auPermExp').checked = Boolean(p.canExpenses);
  toast(`🧬 ${src.name}-এর রোল ও পারমিশন কপি করা হয়েছে!`);
};

window.bulkVerifyUsers = async () => {
  if (!isSuperAdmin() || !selectedUserIds.size) return;
  const accs = readLocalAccounts().filter(a => selectedUserIds.has(a.id));
  for (const a of accs) {
    if (typeof verifyCommunityUser === 'function') await verifyCommunityUser(a.username);
  }
  toast(`☑️ ${accs.length} জন ইউজারের ভেরিফাইড ব্যাজ আপডেট হয়েছে!`);
};

window.toggleEmergencyLockdown = async () => {
  if (!isSuperAdmin()) return;
  const curLocked = Boolean(getRules().maintenanceMode && communityState?.moderation?.feedFrozen);
  const next = !curLocked;
  if (!(await askConfirm(next ? '🔒 জরুরি গ্লোবাল লকডাউন চালু করবেন? (শুধু সুপার অ্যাডমিন এডিট করতে পারবেন ও নিউজ ফিড/টিম চ্যাট ফ্রিজ হবে)' : '🔓 জরুরি গ্লোবাল লকডাউন বন্ধ করে সবাইকে পুনরায় সক্রিয় করবেন?', 'গ্লোবাল লকডাউন'))) return;
  const meta = readSuperAdminMeta();
  meta.conditions = { ...(meta.conditions || {}), maintenanceMode: next };
  writeSuperAdminMeta(meta);
  applyGlobalNotice();
  const res = await postCommunityAction({ action: 'set_community_freeze', frozen: next });
  if (res.offline && communityState?.moderation) {
    communityState.moderation.feedFrozen = next;
    persistCommunityCache();
  }
  await postCommunityAction({ action: 'send_broadcast', text: next ? '🔒 জরুরি সিস্টেম লকডাউন চালু হয়েছে — সাময়িকভাবে শুধু পঠনযোগ্য মোড।' : '🔓 সিস্টেম লকডাউন প্রত্যাহার হয়েছে — সবাই স্বাভাবিক কাজ করতে পারবেন।' });
  logActivity(next ? '🔒 জরুরি গ্লোবাল লকডাউন চালু' : '🔓 জরুরি গ্লোবাল লকডাউন বন্ধ');
  renderAdminPanel();
  toast(next ? '🔒 জরুরি গ্লোবাল লকডাউন সক্রিয় হয়েছে!' : '🔓 গ্লোবাল লকডাউন খোলা হয়েছে!', next ? 'warn' : 'success');
};

window.runSaRiskScan = () => {
  if (!isSuperAdmin()) return;
  const box = $('saRiskAuditBox');
  if (!box) return;
  const rules = getRules(), accs = readLocalAccounts();
  const dueLim = num(rules.defaultDueLimit) > 0 ? num(rules.defaultDueLimit) : 5000;
  const highDueCusts = db.customers.filter(c => Math.max(0, billed(c.id) - paid(c.id)) >= dueLim);
  const lossWorks = db.works.filter(w => profit(w) < 0);
  const negCards = db.cards.filter(c => getCardStats(c.id).balance < 0);
  const bals = getWalletBalances();
  const negWallets = Object.entries(bals).filter(([, v]) => v < 0);
  const badAccs = accs.filter(a => a.status === 'suspended' || a.status === 'pending' || isAccountExpired(a));
  const pendingCount = db.payments.filter(p => p.approvalStatus === 'pending').length + db.expenses.filter(e => e.approvalStatus === 'pending').length + (db.makerRequests || []).length;
  const openReps = (communityState?.moderation?.reports || []).filter(r => r.status === 'open').length;

  const items = [
    { cls: highDueCusts.length ? '' : 'ok', title: `💰 বকেয়া ঝুঁকি (${dueLim}৳+ সীমা)`, desc: highDueCusts.length ? `${highDueCusts.length} জন কাস্টমার সীমার উপরে (${highDueCusts.slice(0, 3).map(c => c.name).join(', ')})` : 'সব কাস্টমার বকেয়া সীমার মধ্যে ✅', click: "goToSection('dues')" },
    { cls: lossWorks.length ? '' : 'ok', title: '📉 লস / নেগেটিভ প্রফিট ক্যাম্পেইন', desc: lossWorks.length ? `${lossWorks.length}টি ক্যাম্পেইনে লস হয়েছে — রেট/খরচ যাচাই করুন` : 'কোনো লস ক্যাম্পেইন নেই ✅', click: "goToSection('reports')" },
    { cls: (negCards.length || negWallets.length) ? '' : 'ok', title: '💳 নেগেটিভ কার্ড / ওয়ালেট ব্যালেন্স', desc: (negCards.length || negWallets.length) ? `কার্ড: ${negCards.length} · ওয়ালেট: ${negWallets.length}টি নেগেটিভ` : 'সব কার্ড ও ওয়ালেট ব্যালেন্স ঠিক আছে ✅', click: "goToSection('cards')" },
    { cls: pendingCount ? 'warn' : 'ok', title: '⏳ পেন্ডিং অ্যাপ্রুভাল ও মেকার-চেকার', desc: pendingCount ? `${pendingCount}টি এন্ট্রি অনুমোদনের অপেক্ষায়` : 'সব অ্যাপ্রুভাল ক্লিয়ার ✅', click: "switchAdminSubTab('approvals')" },
    { cls: openReps ? 'warn' : 'ok', title: '🚨 মডারেশন ও বাজে শব্দ রিপোর্ট', desc: openReps ? `${openReps}টি রিপোর্ট সমাধান বাকি` : 'কোনো ওপেন রিপোর্ট নেই ✅', click: "switchAdminSubTab('moderation')" },
    { cls: badAccs.length ? 'warn' : 'ok', title: '👥 পেন্ডিং / মেয়াদোত্তীর্ণ / ব্লকড ইউজার', desc: badAccs.length ? `${badAccs.length} জন ইউজার নজরদারিতে` : 'সব সক্রিয় ইউজার সুস্থ ✅', click: "if($('saStatusFilter')){$('saStatusFilter').value='pending';renderAdminPanel();}" }
  ];

  box.style.display = 'block';
  box.innerHTML = `<div class="card-add-box" style="border:2px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>🕵️ ডিপ এজেন্সি রিস্ক ও অডিট স্ক্যান ফলাফল (${today()})</strong><button type="button" class="secondary sm" style="margin:0" onclick="if($('saRiskAuditBox'))$('saRiskAuditBox').style.display='none'">✕ বন্ধ</button></div><div class="sa-risk-grid">${items.map(i => `<div class="sa-risk-item ${i.cls}" onclick="${i.click}"><strong>${i.title}</strong><div class="muted" style="margin-top:4px">${i.desc}</div></div>`).join('')}</div></div>`;
  toast('🕵️ ডিপ রিস্ক অডিট স্ক্যান সম্পন্ন হয়েছে!');
};

function computeExecReportData(period = 'month') {
  const nowD = new Date(today() + 'T00:00:00Z');
  let from = '';
  if (period === '7d') { const d = new Date(nowD); d.setUTCDate(d.getUTCDate() - 6); from = d.toISOString().slice(0, 10); }
  else if (period === '30d') { const d = new Date(nowD); d.setUTCDate(d.getUTCDate() - 29); from = d.toISOString().slice(0, 10); }
  else if (period === 'month') from = today().slice(0, 7) + '-01';

  const inRange = d => !from || String(d || '') >= from;
  const works = db.works.filter(w => inRange(w.date));
  const pays = db.payments.filter(p => p.approvalStatus !== 'pending' && inRange(p.date));
  const exps = db.expenses.filter(e => e.approvalStatus !== 'pending' && inRange(e.date));
  const totalBill = works.reduce((s, w) => s + bill(w), 0);
  const totalSpendTk = works.reduce((s, w) => s + actual(w), 0);
  const totalUsd = works.reduce((s, w) => s + num(w.actualDollar), 0);
  const totalCollected = pays.reduce((s, p) => s + num(p.amount), 0);
  const totalOfficeExp = exps.reduce((s, e) => s + num(e.amount), 0);
  const campProfit = works.reduce((s, w) => s + profit(w), 0);
  const totalComm = works.reduce((s, w) => s + workCommission(w), 0);
  const netProfit = campProfit - totalOfficeExp - totalComm;
  const marginPct = totalBill > 0 ? ((netProfit / totalBill) * 100).toFixed(1) : '0.0';
  const totalDue = db.customers.reduce((s, c) => s + Math.max(0, billed(c.id) - paid(c.id)), 0);
  const totalCardBalUsd = db.cards.reduce((s, c) => s + getCardStats(c.id).balance, 0);
  const walletBals = getWalletBalances();
  const totalWalletTk = Object.values(walletBals).reduce((s, v) => s + num(v), 0);

  const staffMap = new Map();
  works.forEach(w => {
    const key = (w.staffName || 'Agency Owner').trim() || 'Agency Owner';
    if (!staffMap.has(key)) staffMap.set(key, { name: key, count: 0, usd: 0, bill: 0, profit: 0, comm: 0 });
    const row = staffMap.get(key);
    row.count += 1; row.usd += num(w.actualDollar); row.bill += bill(w); row.profit += profit(w); row.comm += workCommission(w);
  });
  const staffRows = Array.from(staffMap.values()).sort((a, b) => b.profit - a.profit);

  const custMap = new Map();
  works.forEach(w => {
    const k = w.customerId || 'none';
    if (!custMap.has(k)) custMap.set(k, { name: cname(k), bill: 0, profit: 0, count: 0 });
    const c = custMap.get(k); c.bill += bill(w); c.profit += profit(w); c.count += 1;
  });
  const topClients = Array.from(custMap.values()).sort((a, b) => b.bill - a.bill).slice(0, 5);
  return { period, from, works, totalBill, totalSpendTk, totalUsd, totalCollected, totalOfficeExp, campProfit, totalComm, netProfit, marginPct, totalDue, totalCardBalUsd, totalWalletTk, staffRows, topClients };
}

window.renderExecReport = () => {
  const box = $('saExecReportBody');
  if (!box) return;
  const period = $('execPeriodSelect')?.value || 'month';
  const d = computeExecReportData(period), ag = db.agency || {};
  const pTitle = { '7d': 'সাপ্তাহিক (গত ৭ দিন)', month: 'চলতি মাস', '30d': 'গত ৩০ দিন', all: 'সর্বকালীন' }[period] || period;
  box.innerHTML = `
    <div style="padding:14px 16px;border-radius:12px;background:linear-gradient(135deg,#1e3a8a,#4338ca);color:#fff;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div><h2 style="margin:0;font-size:19px">${esc(ag.name || 'Ads হিসাব ম্যানেজার')} — এক্সিকিউটিভ রিপোর্ট</h2><small style="opacity:.9">সময়কাল: ${pTitle} ${d.from ? `(${d.from} থেকে ${today()})` : ''} · তৈরি: ${today()}</small></div>
        <div style="text-align:right"><strong>নিট মার্জিন: ${d.marginPct}%</strong><br><small>মোট ক্যাম্পেইন: ${d.works.length}টি</small></div>
      </div>
    </div>
    <div class="exec-kpi-grid">
      <div class="exec-kpi-card"><small>মোট বিলিং</small><strong>${money(d.totalBill)}</strong></div>
      <div class="exec-kpi-card"><small>ডলার ও এড খরচ</small><strong>${usd(d.totalUsd)} <small class="muted">(${money(d.totalSpendTk)})</small></strong></div>
      <div class="exec-kpi-card"><small>অফিস ও কমিশন খরচ</small><strong class="bad">${money(d.totalOfficeExp + d.totalComm)}</strong></div>
      <div class="exec-kpi-card"><small>নিট প্রফিট</small><strong class="${d.netProfit >= 0 ? 'good' : 'bad'}">${money(d.netProfit)}</strong></div>
      <div class="exec-kpi-card"><small>মোট আদায়</small><strong class="good">${money(d.totalCollected)}</strong></div>
      <div class="exec-kpi-card"><small>মোট বাজার বকেয়া</small><strong class="bad">${money(d.totalDue)}</strong></div>
      <div class="exec-kpi-card"><small>কার্ড ব্যালেন্স ($)</small><strong>${usd(d.totalCardBalUsd)}</strong></div>
      <div class="exec-kpi-card"><small>ওয়ালেট / ক্যাশ (৳)</small><strong>${money(d.totalWalletTk)}</strong></div>
    </div>
    <h4 style="margin:8px 0 6px">👥 স্টাফ / মিডিয়া বায়ার পারফরম্যান্স স্কোরকার্ড</h4>
    <div class="tablewrap" style="margin-bottom:14px"><table><thead><tr><th>স্টাফ / টিম</th><th>ক্যাম্পেইন</th><th>ডলার ($)</th><th>বিল (৳)</th><th>ক্যাম্পেইন লাভ</th><th>কমিশন</th></tr></thead><tbody>${d.staffRows.map(s => `<tr><td><strong>${esc(s.name)}</strong></td><td>${s.count}</td><td>${usd(s.usd)}</td><td>${money(s.bill)}</td><td class="${s.profit >= 0 ? 'good' : 'bad'}">${money(s.profit)}</td><td>${money(s.comm)}</td></tr>`).join('') || '<tr><td colspan="6">এই সময়ে কোনো কাজ নেই</td></tr>'}</tbody></table></div>
    <h4 style="margin:8px 0 6px">🏆 শীর্ষ ৫ ক্লায়েন্ট</h4>
    <div class="tablewrap"><table><thead><tr><th>ক্লায়েন্ট</th><th>ক্যাম্পেইন</th><th>মোট বিল</th><th>ক্যাম্পেইন লাভ</th></tr></thead><tbody>${d.topClients.map(c => `<tr><td><strong>${esc(c.name)}</strong></td><td>${c.count}</td><td>${money(c.bill)}</td><td class="${c.profit >= 0 ? 'good' : 'bad'}">${money(c.profit)}</td></tr>`).join('') || '<tr><td colspan="4">তথ্য নেই</td></tr>'}</tbody></table></div>
  `;
};

window.openExecReportModal = () => {
  if (!isSuperAdmin()) return toast('শুধু সুপার অ্যাডমিন এই রিপোর্ট দেখতে পারবেন', 'error');
  renderExecReport();
  if ($('saExecReportModal')) $('saExecReportModal').style.display = 'flex';
};

window.printExecReport = () => {
  renderExecReport();
  document.body.classList.add('printing-exec');
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-exec'), { once: true });
  setTimeout(() => window.print(), 120);
};

window.downloadExecReportPng = () => {
  const period = $('execPeriodSelect')?.value || 'month';
  const d = computeExecReportData(period), ag = db.agency || {};
  const W = 880, H = 520, c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, 110);
  g.addColorStop(0, '#1e3a8a'); g.addColorStop(1, '#4f46e5');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 110);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px "Hind Siliguri", Inter, sans-serif';
  ctx.fillText(`${ag.name || 'Ads হিসাব ম্যানেজার'} — Executive Report`, 32, 46);
  ctx.font = '14px "Hind Siliguri", Inter, sans-serif';
  ctx.fillText(`Period: ${d.from || 'All Time'} to ${today()} | Campaigns: ${d.works.length} | Margin: ${d.marginPct}%`, 32, 78);
  const tiles = [
    ['মোট বিলিং', money(d.totalBill)],
    ['নিট প্রফিট', money(d.netProfit)],
    ['মোট আদায়', money(d.totalCollected)],
    ['বাজার বকেয়া', money(d.totalDue)],
    ['ডলার খরচ ($)', usd(d.totalUsd)],
    ['অফিস ও কমিশন', money(d.totalOfficeExp + d.totalComm)],
    ['কার্ড ব্যালেন্স', usd(d.totalCardBalUsd)],
    ['ওয়ালেট ব্যালেন্স', money(d.totalWalletTk)]
  ];
  tiles.forEach(([lbl, val], i) => {
    const col = i % 4, row = Math.floor(i / 4), x = 32 + col * 206, y = 136 + row * 96;
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(x, y, 192, 80);
    ctx.strokeStyle = '#e2e8f0'; ctx.strokeRect(x, y, 192, 80);
    ctx.fillStyle = '#64748b'; ctx.font = '12px "Hind Siliguri", Inter, sans-serif'; ctx.fillText(lbl, x + 12, y + 26);
    ctx.fillStyle = '#1e3a8a'; ctx.font = 'bold 17px Inter, sans-serif'; ctx.fillText(val, x + 12, y + 58);
  });
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 15px "Hind Siliguri", Inter, sans-serif';
  ctx.fillText('শীর্ষ পারফর্মার স্টাফ:', 32, 360);
  ctx.font = '13px "Hind Siliguri", Inter, sans-serif';
  d.staffRows.slice(0, 4).forEach((s, idx) => {
    ctx.fillText(`${idx + 1}. ${s.name} — কাজ: ${s.count}, বিল: ${money(s.bill)}, লাভ: ${money(s.profit)}`, 32, 390 + idx * 24);
  });
  ctx.fillStyle = '#64748b'; ctx.font = '12px "Hind Siliguri", Inter, sans-serif';
  ctx.fillText(`Generated by Super Admin · ${today()}`, 32, 496);
  c.toBlob(blob => {
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = `executive_report_${period}_${today()}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
    toast('📥 এক্সিকিউটিভ রিপোর্ট PNG ডাউনলোড হয়েছে!');
  }, 'image/png');
};

window.renderSuperAdminPowerGuide = () => {
  const grid = $('saPowerGuideGrid');
  if (!grid) return;
  const guides = [
    { icon: '👥', title: '১. ইউজার ও পারমিশন টেমপ্লেট', bullets: ['নতুন স্টাফ/অ্যাডমিন/ইউজার তৈরি ও মেয়াদ (+৩০ দিন) নিয়ন্ত্রণ', 'এক ক্লিকে পুরোনো স্টাফের পারমিশন কপি (🧬 Clone Template)', '👁️ ইমপারসনেট প্রিভিউ দিয়ে যেকোনো ইউজারের অ্যাকাউন্ট সরাসরি দেখা', 'বাল্ক সিলেকশন করে একসাথে Active, ভেরিফাইড বা Suspend'], btn: 'ইউজার ট্যাবে যান', act: "switchAdminSubTab('users')" },
    { icon: '🌐', title: '২. লাইভ IP/ডিভাইস ও রিমোট লগআউট', bullets: ['কে কোন ডিভাইস (Android/Windows/Chrome) ও IP থেকে লগইনে আছে দেখা', 'সন্দেহজনক বা পুরোনো কর্মীর সেশন ১ ক্লিকে সাথে সাথে ফোর্স লগআউট', 'জরুরি প্রয়োজনে সব স্টাফ/ইউজারকে এক ক্লিকে লগআউট', 'সর্বশেষ লগইন IP ইতিহাস অডিট ট্র্যাক'], btn: 'লাইভ সেশন দেখুন', act: "switchAdminSubTab('sessions')" },
    { icon: '🔐', title: '৩. মেকার-চেকার ও মেনু লক ম্যাট্রিক্স', bullets: ['দৈনিক ডলার রেট, কার্ড ডিপোজিট/ট্রান্সফার/রিফান্ড ও ওয়ালেট ট্রান্সফারে ২-ধাপের লক', 'স্টাফ সাবমিট করলে মূল হিসাব বদলাবে না যতক্ষণ না আপনি ✓ অনুমোদন দেন', 'রোল-ভিত্তিক সাইডবার ম্যাট্রিক্স দিয়ে Staff/User/Admin-এর যেকোনো পেজ লুকানো', '২৪-ঘণ্টা এডিট লক, লস-ব্লক ও মাস্টার PIN সিকিউরিটি'], btn: 'শর্তাবলি ও মেনু লক', act: "switchAdminSubTab('rules')" },
    { icon: '🕵️', title: '৪. ডিপ রিস্ক অডিট ও এক্সিকিউটিভ PDF', bullets: ['১ ক্লিকে বকেয়া সীমা অতিক্রম, লস ক্যাম্পেইন ও নেগেটিভ কার্ড/ওয়ালেট শনাক্ত', 'সাপ্তাহিক/মাসিক এক্সিকিউটিভ প্রফিট ও স্টাফ পারফরম্যান্স PDF/PNG রিপোর্ট', 'ডিলিট করা ডেটা রিসাইকেল বিন থেকে রিস্টোর বা মাস্টার ফুল ব্যাকআপ'], btn: '📊 এক্সিকিউটিভ PDF খুলুন', act: 'openExecReportModal()' },
    { icon: '📰', title: '৫. নিউজ ফিড, চ্যাট ও মডারেশন কমান্ড', bullets: ['অফিশিয়াল ঘোষণা পোস্ট, ফিড/চ্যাট ফ্রিজ ও সব অনলাইন ইউজারকে ইনস্ট্যান্ট ব্রডকাস্ট', '☑️ ভেরিফাইড ব্লু ব্যাজ দেওয়া ও পোস্টে 📌 পিন / 🔒 কমেন্ট লক', 'বাজে শব্দ অটো-ব্লক, ⚠️ সতর্কবার্তা, 🔇 মিউট ও 🧹 অল-পোস্ট ডিলিট'], btn: 'মডারেশন সেন্টার', act: "switchAdminSubTab('moderation')" },
    { icon: '🔒', title: '৬. জরুরি গ্লোবাল লকডাউন মোড', bullets: ['১ ক্লিকে পুরো সফটওয়্যার Read-Only (মেইনটেন্যান্স) + ফিড/চ্যাট ফ্রিজ', 'অডিট, রেট পরিবর্তন বা জরুরি পরিস্থিতিতে ডেটা পরিবর্তন সম্পূর্ণ বন্ধ রাখা', 'সবাইকে অটো লাইভ নোটিশ দিয়ে সতর্ক করা'], btn: '🔒 লকডাউন টগল করুন', act: 'toggleEmergencyLockdown()' }
  ];
  grid.innerHTML = guides.map(g => `<div class="sa-guide-card"><div><h4>${g.icon} ${g.title}</h4><ul>${g.bullets.map(b => `<li>${b}</li>`).join('')}</ul></div><button type="button" class="secondary sm" style="margin:0;align-self:flex-start" onclick="${g.act}">${g.btn} →</button></div>`).join('');
};

// === ENTERPRISE FINAL SUITE: META LIVE SYNC · PAYMENT WEBHOOKS · PRODUCTION READINESS ===
let lastMetaSyncRows = [];
window.openMetaSyncModal = () => {
  if ($('metaSyncCustomer')) {
    $('metaSyncCustomer').innerHTML = (db.customers || []).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('') || '<option value="">কাস্টমার তৈরি করুন</option>';
  }
  if ($('metaSyncRate')) $('metaSyncRate').value = num(db.agency?.defaultRate) || rateFor(today()) || 125;
  if ($('metaSyncStatus')) $('metaSyncStatus').textContent = '';
  if ($('metaImportAllBtn')) $('metaImportAllBtn').style.display = 'none';
  if ($('metaSyncModal')) $('metaSyncModal').style.display = 'flex';
};

window.fetchMetaCampaignInsights = async () => {
  const adAccountId = ($('metaAdAccInput')?.value || '').trim();
  const datePreset = $('metaDatePreset')?.value || 'today';
  const st = $('metaSyncStatus'), tbody = $('metaSyncRows'), impBtn = $('metaImportAllBtn');
  if (!adAccountId) return toast('Meta Ad Account ID দিন!', 'error');
  if (st) st.textContent = '⏳ Meta Graph API থেকে ডেটা আনা হচ্ছে...';
  try {
    const res = await serverFetch('/api/meta/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adAccountId, datePreset, metaToken: db.agency?.metaToken || '' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Meta Sync failed');
    lastMetaSyncRows = Array.isArray(data.rows) ? data.rows : [];
    if (tbody) {
      tbody.innerHTML = lastMetaSyncRows.map(r => {
        const roas = r.spend > 0 && r.revenueUsd > 0 ? `${(r.revenueUsd / r.spend).toFixed(2)}x` : '—';
        return `<tr><td><strong>${esc(r.campaignName)}</strong><br><small class="muted">${esc(r.dateStart)}</small></td><td>$${num(r.spend).toFixed(2)}</td><td>${num(r.impressions).toLocaleString()}</td><td>${num(r.clicks).toLocaleString()}</td><td>${num(r.results)}</td><td>${roas}</td></tr>`;
      }).join('') || '<tr><td colspan="6" class="muted">এই সময়ে কোনো ক্যাম্পেইন খরচ পাওয়া যায়নি</td></tr>';
    }
    if (impBtn) impBtn.style.display = lastMetaSyncRows.length ? 'inline-flex' : 'none';
    if (st) st.textContent = `✅ ${lastMetaSyncRows.length}টি ক্যাম্পেইন লোড হয়েছে`;
  } catch (err) {
    if (st) st.textContent = `⚠️ ${err.message}`;
    toast(err.message, 'error');
  }
};

window.importMetaRowsToWorks = () => {
  const customerId = $('metaSyncCustomer')?.value || db.customers?.[0]?.id || '';
  const rate = num($('metaSyncRate')?.value) || 125;
  if (!customerId) return toast('আগে অন্তত ১ জন কাস্টমার নির্বাচন করুন!', 'error');
  if (!lastMetaSyncRows.length) return;
  const rawAcc = ($('metaAdAccInput')?.value || '').trim().replace(/^act_/i, '');
  const matchedAa = (db.adAccounts || []).find(a => String(a.adId || '').trim().replace(/^act_/i, '') === rawAcc);
  const matchedCardId = !isStaff() && matchedAa?.cardId ? matchedAa.cardId : '';
  const actRate = (matchedCardId ? cardAvgRate(matchedCardId) : 0) || rateFor(today()) || rate;
  lastMetaSyncRows.forEach(r => {
    const usdSpend = num(r.spend);
    const revTk = num(r.revenueUsd) * rate;
    db.works.push({
      id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
      date: r.dateStop || today(), platform: 'Meta', customerId, pageId: '', adAccountId: matchedAa?.id || '',
      name: `[Meta API] ${r.campaignName}`, days: 1, dollar: usdSpend, actualDollar: usdSpend,
      rate, actualRate: actRate, feePct: num(db.agency?.defaultFeePct) || 0,
      otherCost: 0, serviceFee: 0, serviceFeeType: 'fixed', discount: 0, taxPct: 0,
      cardId: matchedCardId, staffName: activeAccount?.name || 'Admin', commPct: 0,
      reach: num(r.impressions), clicks: num(r.clicks), conversions: num(r.results), revenue: revTk,
      creativeLink: '', status: 'completed', proofImg: '', note: `Meta Campaign ID: ${r.campaignId}`
    });
  });
  save();
  closeModal('metaSyncModal');
  toast(`✅ ${lastMetaSyncRows.length}টি Meta ক্যাম্পেইন কাজের হিসাবে যুক্ত হয়েছে!`);
};

let cachedWebhookPayments = [];
window.loadWebhookPayments = async (notify = false) => {
  const tbody = $('webhookPaymentRows');
  if (!tbody || !serverAuthToken) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="muted">সার্ভার সেশনে লগইন করলে ওয়েবহুক পেমেন্ট দেখাবে</td></tr>';
    return;
  }
  try {
    const res = await serverFetch('/api/webhooks/payment');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');
    cachedWebhookPayments = Array.isArray(data.payments) ? data.payments : [];
    tbody.innerHTML = cachedWebhookPayments.map(p => `<tr>
      <td><small>${esc(p.time || '')}</small></td>
      <td><strong>${esc(p.customerName || 'Client')}</strong><br><small class="muted">${esc(p.senderPhone || '')}</small></td>
      <td><strong class="good">${money(p.amount)}</strong><br><span class="badge-admin">${esc(p.method || 'bKash')}</span></td>
      <td><code>${esc(p.trxId)}</code><br><span class="${p.status === 'claimed' ? 'badge-success' : 'badge-warn'}" style="font-size:10px">${p.status === 'claimed' ? '✅ হিসাবে জমা' : '⚡ ভেরিফায়েড (ক্লেইম বাকি)'}</span></td>
      <td>${p.status === 'claimed' ? '<small class="muted">সম্পন্ন</small>' : `<button type="button" class="sm perm-pay" style="background:#059669;margin:0" onclick="claimWebhookPayment('${esc(p.id)}')">✓ জমা করুন</button>`}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="muted">কোনো ওয়েবহুক পেমেন্ট এখনো আসেনি</td></tr>';
    if (notify) toast('গেটওয়ে ওয়েবহুক তালিকা রিফ্রেশ হয়েছে!');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">${esc(err.message)}</td></tr>`;
  }
};

window.simulateWebhookPayment = async () => {
  if (!isSuperAdmin() || !serverAuthToken) return toast('সুপার অ্যাডমিন সার্ভার লগইন প্রয়োজন', 'error');
  const firstCust = db.customers?.[0];
  try {
    const res = await serverFetch('/api/webhooks/payment/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'bKash',
        amount: 5000,
        customerName: firstCust?.name || 'Webhook Demo Client',
        senderPhone: firstCust?.phone || '01700000000'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Simulation failed');
    await loadWebhookPayments(false);
    toast(`⚡ টেস্ট bKash ওয়েবহুক (${data.payment?.trxId}) রিসিভ হয়েছে!`);
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.claimWebhookPayment = async id => {
  if (!serverAuthToken) return;
  const item = cachedWebhookPayments.find(p => p.id === id);
  if (!item) return;
  const matchCust = (db.customers || []).find(c =>
    (item.senderPhone && normalizeBdPhone(c.phone) === normalizeBdPhone(item.senderPhone)) ||
    String(c.name || '').toLowerCase() === String(item.customerName || '').toLowerCase()
  ) || db.customers?.[0];
  if (!matchCust) return toast('আগে অন্তত ১ জন কাস্টমার তৈরি করুন!', 'error');
  if ((db.payments || []).some(x => x.ref === item.trxId)) return toast('এই TrxID ইতিমধ্যেই জমা করা আছে!', 'warn');
  try {
    const res = await serverFetch('/api/webhooks/payment/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Claim failed');
    db.payments.push({
      id: uid(), createdAt: Date.now(), updatedAt: Date.now(), approvalStatus: 'approved',
      date: today(), customerId: matchCust.id, amount: num(item.amount), method: item.method || 'bKash',
      fee: 0, ref: item.trxId, note: item.note || 'Webhook Auto-Verified'
    });
    save();
    logActivity(`গেটওয়ে ওয়েবহুক পেমেন্ট জমা: ${matchCust.name} (${money(item.amount)} · ${item.trxId})`);
    await loadWebhookPayments(false);
    toast(`✅ ${matchCust.name}-এর ${money(item.amount)} ওয়েবহুক পেমেন্ট হিসাবে জমা হয়েছে!`);
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.refreshProdReadiness = async () => {
  const grid = $('saProdReadinessGrid');
  if (!grid) return;
  let health = {};
  try {
    const r = await fetch('/api/health');
    if (r.ok) health = await r.json();
  } catch (_) {}
  const swActive = Boolean(navigator.serviceWorker?.controller);
  const checks = [
    { label: 'সার্ভার ডেটাবেস ও সিঙ্ক', val: health.workspaceReady ? '🟢 সক্রিয় (JSON Store)' : '🟡 লোকাল মোড' },
    { label: 'সিকিউর Auth (scrypt + Bearer)', val: serverAuthToken ? '🟢 সার্ভার ভেরিফায়েড' : '🟡 অফলাইন সেশন' },
    { label: 'সুপার অ্যাডমিন প্রটেকশন', val: health.adminClaimed ? '🟢 পাসওয়ার্ড এনক্রিপ্টেড' : '⚠️ ক্লেইম বাকি' },
    { label: 'Gemini AI (Voice/TTS/Copy)', val: health.aiConfigured ? '🟢 কনফিগার্ড' : '⚠️ API Key বাকি' },
    { label: 'Meta API & Payment Webhook', val: `Meta: ${health.metaConfigured ? '✅' : '⚙️'} · Webhook: ${health.webhookSecretConfigured ? '🔒' : '🟢 ওপেন'}` },
    { label: 'MP4 স্টুডিও ও PWA অফলাইন', val: `MP4 H.264 Ready · PWA ${swActive ? '🟢' : '🟡'}` }
  ];
  grid.innerHTML = checks.map(c => `<div class="closing-tile"><small>${c.label}</small><strong>${c.val}</strong></div>`).join('');
};

