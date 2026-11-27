import "dotenv/config";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { WebSocket, WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMMUNITY_FILE = path.resolve(__dirname, ".community-store.json");

const ALLOWED_VOICES = new Set(["Kore", "Puck", "Charon", "Fenrir", "Zephyr"]);

const DEFAULT_BAD_WORDS = [
  "madarchod", "banchod", "khanki", "magi", "chuda", "harami", "sala", "kuttar",
  "fuck", "fucking", "bitch", "bastard", "asshole", "dick", "motherfucker", "slut", "whore"
];

interface CommunityReply {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorRole: string;
  text: string;
  createdAt: number;
  time: string;
}

interface CommunityComment {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorRole: string;
  text: string;
  likes: string[];
  replies: CommunityReply[];
  createdAt: number;
  time: string;
}

interface CommunityPollOption {
  id: string;
  label: string;
  votes: string[];
}

interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorRole: string;
  authorPic: string;
  tag: string;
  platform: string;
  workTitle: string;
  feeling?: string;
  bgStyle?: string;
  content: string;
  imageData: string;
  poll: { question: string; options: CommunityPollOption[] } | null;
  reactions: Record<string, string[]>;
  comments: CommunityComment[];
  shares?: number;
  sharedFrom?: { id: string; authorName: string; authorUsername: string; content: string; imageData?: string; time?: string } | null;
  pinned: boolean;
  commentsLocked?: boolean;
  official?: boolean;
  editedAt?: number;
  createdAt: number;
  updatedAt: number;
  time: string;
}

interface TeamChatMessage {
  id: string;
  sender: string;
  role: string;
  username: string;
  authorId: string;
  text: string;
  tag: string;
  replyTo: { id: string; sender: string; text: string } | null;
  pinned: boolean;
  reactions: Record<string, string[]>;
  fileData?: string;
  fileName?: string;
  fileType?: string;
  audioData?: string;
  audioMime?: string;
  audioDuration?: number;
  time: string;
  ts: number;
}

interface UserWarning {
  id: string;
  targetUsername: string;
  targetName: string;
  reason: string;
  issuedBy: string;
  ts: number;
  time: string;
  ack: boolean;
}

interface ModerationReport {
  id: string;
  itemType: string;
  postId: string;
  commentId: string;
  msgId: string;
  targetUsername: string;
  targetName: string;
  reason: string;
  reportedBy: string;
  snippet: string;
  ts: number;
  time: string;
  status: string;
}

interface DirectMessage {
  id: string;
  fromUsername: string;
  fromName: string;
  fromRole: string;
  toUsername: string;
  toName: string;
  text: string;
  fileData?: string;
  fileName?: string;
  fileType?: string;
  audioData?: string;
  audioDuration?: number;
  read: boolean;
  ts: number;
  time: string;
}

interface CommunityNotification {
  id: string;
  toUsername: string;
  kind: string;
  text: string;
  fromName: string;
  fromUsername: string;
  postId?: string;
  read: boolean;
  ts: number;
  time: string;
}

interface LoginAuditEntry {
  id: string;
  username: string;
  name: string;
  role: string;
  ip: string;
  device: string;
  ts: number;
  time: string;
}

interface CommunityStore {
  posts: CommunityPost[];
  chat: TeamChatMessage[];
  dms: DirectMessage[];
  notifications: CommunityNotification[];
  moderation: {
    badWords: string[];
    warnings: UserWarning[];
    mutedUsers: Record<string, { until: number; reason: string; by: string }>;
    reports: ModerationReport[];
    verifiedUsers: string[];
    feedFrozen: boolean;
    broadcasts: { id: string; text: string; by: string; ts: number; time: string }[];
    revokedUsers: Record<string, number>;
    loginAudit: LoginAuditEntry[];
  };
}

function createEmptyCommunity(): CommunityStore {
  return {
    posts: [],
    chat: [],
    dms: [],
    notifications: [],
    moderation: {
      badWords: [...DEFAULT_BAD_WORDS],
      warnings: [],
      mutedUsers: {},
      reports: [],
      verifiedUsers: ["admin"],
      feedFrozen: false,
      broadcasts: [],
      revokedUsers: {},
      loginAudit: [],
    },
  };
}

function loadCommunityStore(): CommunityStore {
  try {
    if (fs.existsSync(COMMUNITY_FILE)) {
      const raw = JSON.parse(fs.readFileSync(COMMUNITY_FILE, "utf8")) as Partial<CommunityStore>;
      const base = createEmptyCommunity();
      return {
        posts: Array.isArray(raw.posts) ? raw.posts : [],
        chat: Array.isArray(raw.chat) ? raw.chat : [],
        dms: Array.isArray(raw.dms) ? raw.dms : [],
        notifications: Array.isArray(raw.notifications) ? raw.notifications : [],
        moderation: {
          badWords: Array.isArray(raw.moderation?.badWords) && raw.moderation.badWords.length
            ? raw.moderation.badWords
            : base.moderation.badWords,
          warnings: Array.isArray(raw.moderation?.warnings) ? raw.moderation.warnings : [],
          mutedUsers: raw.moderation?.mutedUsers && typeof raw.moderation.mutedUsers === "object" ? raw.moderation.mutedUsers : {},
          reports: Array.isArray(raw.moderation?.reports) ? raw.moderation.reports : [],
          verifiedUsers: Array.isArray(raw.moderation?.verifiedUsers) && raw.moderation.verifiedUsers.length ? raw.moderation.verifiedUsers : ["admin"],
          feedFrozen: Boolean(raw.moderation?.feedFrozen),
          broadcasts: Array.isArray(raw.moderation?.broadcasts) ? raw.moderation.broadcasts : [],
          revokedUsers: raw.moderation?.revokedUsers && typeof raw.moderation.revokedUsers === "object" ? raw.moderation.revokedUsers : {},
          loginAudit: Array.isArray(raw.moderation?.loginAudit) ? raw.moderation.loginAudit : [],
        },
      };
    }
  } catch {
    // ignore corrupt file and start fresh
  }
  return createEmptyCommunity();
}

const communityStore: CommunityStore = loadCommunityStore();
let saveCommunityTimer: ReturnType<typeof setTimeout> | null = null;
function persistCommunityStore() {
  if (saveCommunityTimer) clearTimeout(saveCommunityTimer);
  saveCommunityTimer = setTimeout(() => {
    try {
      fs.writeFileSync(COMMUNITY_FILE, JSON.stringify(communityStore), "utf8");
    } catch {
      // ignore write errors
    }
  }, 250);
}

function findBadWord(text: string, words: string[]): string | null {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) return null;
  for (const w of words) {
    const clean = String(w || "").trim().toLowerCase();
    if (!clean || clean.length < 2) continue;
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9\u0980-\u09ff])${escaped}($|[^a-z0-9\u0980-\u09ff])`, "i");
    if (re.test(normalized) || (clean.length >= 4 && normalized.includes(clean))) {
      return clean;
    }
  }
  return null;
}

// =========================================================================
// CENTRAL SERVER WORKSPACE, AUTH (scrypt + HMAC Bearer) & ENTERPRISE APIs
// =========================================================================
const WORKSPACE_FILE = path.resolve(__dirname, ".workspace-store.json");

type SubscriptionPlanKey = "daily" | "weekly" | "monthly" | "yearly" | "lifetime";

interface SubscriptionPlanConfig {
  key: SubscriptionPlanKey;
  label: string;
  days: number;
  price: number;
  enabled: boolean;
}

interface SubscriptionConfig {
  trialDays: number;
  payInfo: string;
  autoActivateOnPaid?: boolean;
  plans: Record<SubscriptionPlanKey, SubscriptionPlanConfig>;
}

interface SubscriptionRequest {
  id: string;
  userId: string;
  userNumber: number;
  name: string;
  username: string;
  phone: string;
  email: string;
  planKey: SubscriptionPlanKey;
  planLabel: string;
  days: number;
  price: number;
  method: string;
  trxId: string;
  senderPhone: string;
  note: string;
  status: "pending" | "approved" | "rejected";
  adminNote?: string;
  decidedBy?: string;
  decidedAt?: number;
  createdAt: number;
  time: string;
}

interface ServerAccount {
  id: string;
  userNumber: number;
  name: string;
  username: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: string;
  explicitAdminRole?: boolean;
  plan?: string;
  expiryDate?: string;
  subscriptionBypass?: boolean;
  status: string;
  lastLogin?: string;
  loginCount?: number;
  updatedAt: number;
  permissions?: Record<string, unknown>;
}

interface WebhookPaymentItem {
  id: string;
  trxId: string;
  amount: number;
  method: string;
  senderPhone: string;
  customerName: string;
  customerId?: string;
  note: string;
  source: string;
  status: "verified" | "claimed";
  claimedAt?: number;
  claimedBy?: string;
  ts: number;
  time: string;
}

interface RememberSessionRecord {
  tokenHash: string;
  userId: string;
  username: string;
  role: string;
  rememberMe: boolean;
  createdAt: number;
  exp: number;
}

interface LiveUpdateStatus {
  stage: "idle" | "updating" | "ready";
  message: string;
  versionLabel: string;
  reloadEpoch: number;
  updatedAt: number;
  updatedBy?: string;
}

interface WorkspaceStore {
  adminPassHash: string;
  adminProfile: Record<string, unknown>;
  nextUserId: number;
  accounts: ServerAccount[];
  workspaces: Record<string, Record<string, unknown>>;
  superAdminMeta: Record<string, unknown>;
  globalRules: Record<string, unknown>;
  webhookPayments: WebhookPaymentItem[];
  subscriptionConfig: SubscriptionConfig;
  subscriptionRequests: SubscriptionRequest[];
  rememberSessions: RememberSessionRecord[];
  liveUpdateStatus: LiveUpdateStatus;
  lastDeployedBuildHash: string;
  webhookSecret: string;
  sessionSigningSecret: string;
}

const SUB_PLAN_KEYS: SubscriptionPlanKey[] = ["daily", "weekly", "monthly", "yearly", "lifetime"];

function createDefaultSubscriptionConfig(): SubscriptionConfig {
  return {
    trialDays: 7,
    payInfo: "",
    autoActivateOnPaid: true,
    plans: {
      daily: { key: "daily", label: "Daily (১ দিন)", days: 1, price: 20, enabled: true },
      weekly: { key: "weekly", label: "Weekly (৭ দিন)", days: 7, price: 100, enabled: true },
      monthly: { key: "monthly", label: "Monthly (৩০ দিন)", days: 30, price: 350, enabled: true },
      yearly: { key: "yearly", label: "Yearly (৩৬৫ দিন)", days: 365, price: 3000, enabled: true },
      lifetime: { key: "lifetime", label: "Lifetime (আজীবন)", days: 0, price: 8000, enabled: true },
    },
  };
}

function normalizeSubscriptionConfig(raw?: Partial<SubscriptionConfig> | null): SubscriptionConfig {
  const def = createDefaultSubscriptionConfig();
  const rawPlans = (raw?.plans && typeof raw.plans === "object" ? raw.plans : {}) as Record<string, Partial<SubscriptionPlanConfig>>;
  const plans = { ...def.plans };
  for (const key of SUB_PLAN_KEYS) {
    const src = rawPlans[key];
    if (src && typeof src === "object") {
      const priceNum = Number(src.price);
      const daysNum = Number(src.days);
      plans[key] = {
        key,
        label: String(src.label || def.plans[key].label).trim().slice(0, 60) || def.plans[key].label,
        days: key === "lifetime" ? 0 : (Number.isFinite(daysNum) && daysNum > 0 ? Math.min(3650, Math.round(daysNum)) : def.plans[key].days),
        price: Number.isFinite(priceNum) && priceNum >= 0 ? Math.round(priceNum * 100) / 100 : def.plans[key].price,
        enabled: src.enabled !== false,
      };
    }
  }
  const tDays = Number(raw?.trialDays);
  return {
    trialDays: Number.isFinite(tDays) && tDays >= 1 ? Math.min(90, Math.round(tDays)) : 7,
    payInfo: typeof raw?.payInfo === "string" ? raw.payInfo.trim().slice(0, 300) : def.payInfo,
    autoActivateOnPaid: raw?.autoActivateOnPaid !== false,
    plans,
  };
}

function todayUtcStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysUtc(baseDateStr: string, days: number): string {
  const clean = /^\d{4}-\d{2}-\d{2}$/.test(baseDateStr) ? baseDateStr : todayUtcStr();
  const d = new Date(`${clean}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(days)));
  return d.toISOString().slice(0, 10);
}

function isServerAccountExpired(acc?: ServerAccount | null): boolean {
  if (!acc) return false;
  if (acc.role === "super_admin" || acc.id === "legacy-super-admin" || acc.subscriptionBypass) return false;
  const planLower = String(acc.plan || "").trim().toLowerCase();
  if (planLower === "lifetime" && !acc.expiryDate) return false;
  return Boolean(acc.expiryDate && acc.expiryDate < todayUtcStr());
}

const SERVER_BOOT_ID = crypto.randomBytes(6).toString("hex");
let cachedPkgVersion = "82.17.0";
try {
  const pkgRaw = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as { version?: string };
  if (pkgRaw?.version) cachedPkgVersion = String(pkgRaw.version);
} catch {
  // ignore
}

let cachedBuildHashVal = "";
let cachedBuildHashTs = 0;
function getAppBuildHash(force = false): string {
  const now = Date.now();
  if (!force && cachedBuildHashVal && now - cachedBuildHashTs < 4000) {
    return cachedBuildHashVal;
  }
  const h = crypto.createHash("sha256");
  h.update(cachedPkgVersion);
  const trackedFiles = [
    "package.json",
    "index.html",
    "server.ts",
    "public/app.js",
    "public/style.css",
    "public/sw.js",
    "public/ads-park-video.html",
    "dist/index.html",
    "dist/app.js",
    "dist/style.css",
    "dist/sw.js",
  ];
  for (const rel of trackedFiles) {
    const abs = path.resolve(__dirname, rel);
    try {
      const st = fs.statSync(abs);
      if (st.isFile()) {
        h.update(`${rel}:${st.size}:${Math.trunc(st.mtimeMs)};`);
      }
    } catch {
      // file optional (e.g. dist in dev mode)
    }
  }
  cachedBuildHashVal = h.digest("hex").slice(0, 16);
  cachedBuildHashTs = now;
  return cachedBuildHashVal;
}

function createDefaultLiveUpdateStatus(): LiveUpdateStatus {
  return {
    stage: "idle",
    message: "",
    versionLabel: cachedPkgVersion,
    reloadEpoch: 1,
    updatedAt: Date.now(),
  };
}

function normalizeLiveUpdateStatus(raw?: Partial<LiveUpdateStatus> | null): LiveUpdateStatus {
  const def = createDefaultLiveUpdateStatus();
  const stage = raw?.stage === "updating" || raw?.stage === "ready" ? raw.stage : "idle";
  return {
    stage,
    message: typeof raw?.message === "string" ? raw.message.trim().slice(0, 240) : "",
    versionLabel: typeof raw?.versionLabel === "string" && raw.versionLabel.trim() ? raw.versionLabel.trim().slice(0, 40) : def.versionLabel,
    reloadEpoch: Math.max(1, Number(raw?.reloadEpoch) || 1),
    updatedAt: Number(raw?.updatedAt) || def.updatedAt,
    updatedBy: typeof raw?.updatedBy === "string" ? raw.updatedBy.slice(0, 40) : undefined,
  };
}

function createEmptyWorkspaceStore(): WorkspaceStore {
  return {
    adminPassHash: "",
    adminProfile: { name: "Super Admin", email: "admin@example.com", phone: "01700000000", pic: "" },
    nextUserId: 2,
    accounts: [],
    workspaces: {},
    superAdminMeta: {},
    globalRules: { signupPolicy: "trial7", maintenanceMode: false },
    webhookPayments: [],
    subscriptionConfig: createDefaultSubscriptionConfig(),
    subscriptionRequests: [],
    rememberSessions: [],
    liveUpdateStatus: createDefaultLiveUpdateStatus(),
    lastDeployedBuildHash: "",
    webhookSecret: crypto.randomBytes(24).toString("hex"),
    sessionSigningSecret: crypto.randomBytes(32).toString("hex"),
  };
}

function loadWorkspaceStore(): WorkspaceStore {
  try {
    if (fs.existsSync(WORKSPACE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(WORKSPACE_FILE, "utf8")) as Partial<WorkspaceStore>;
      const base = createEmptyWorkspaceStore();
      const hasSubCfg = Boolean(raw.subscriptionConfig && typeof raw.subscriptionConfig === "object");
      const rawRules = raw.globalRules && typeof raw.globalRules === "object" ? { ...raw.globalRules } : { ...base.globalRules };
      if (!hasSubCfg && (!rawRules.signupPolicy || rawRules.signupPolicy === "open")) {
        rawRules.signupPolicy = "trial7";
      }
      const now = Date.now();
      const validSessions = Array.isArray(raw.rememberSessions)
        ? raw.rememberSessions.filter((s) => s && typeof s.tokenHash === "string" && Number(s.exp) > now).slice(0, 150)
        : [];
      const hasSessionSecret = typeof raw.sessionSigningSecret === "string" && raw.sessionSigningSecret.length >= 32;
      const loaded: WorkspaceStore = {
        adminPassHash: typeof raw.adminPassHash === "string" ? raw.adminPassHash : "",
        adminProfile: raw.adminProfile && typeof raw.adminProfile === "object" ? raw.adminProfile : base.adminProfile,
        nextUserId: Number(raw.nextUserId) || 2,
        accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
        workspaces: raw.workspaces && typeof raw.workspaces === "object" ? raw.workspaces : {},
        superAdminMeta: raw.superAdminMeta && typeof raw.superAdminMeta === "object" ? raw.superAdminMeta : {},
        globalRules: rawRules,
        webhookPayments: Array.isArray(raw.webhookPayments) ? raw.webhookPayments : [],
        subscriptionConfig: normalizeSubscriptionConfig(raw.subscriptionConfig),
        subscriptionRequests: Array.isArray(raw.subscriptionRequests) ? raw.subscriptionRequests : [],
        rememberSessions: validSessions,
        liveUpdateStatus: normalizeLiveUpdateStatus(raw.liveUpdateStatus),
        lastDeployedBuildHash: typeof raw.lastDeployedBuildHash === "string" ? raw.lastDeployedBuildHash : "",
        webhookSecret: typeof raw.webhookSecret === "string" && raw.webhookSecret.length >= 16 ? raw.webhookSecret : base.webhookSecret,
        sessionSigningSecret: hasSessionSecret ? String(raw.sessionSigningSecret) : base.sessionSigningSecret,
      };
      if (!hasSessionSecret) {
        try { fs.writeFileSync(WORKSPACE_FILE, JSON.stringify(loaded), "utf8"); } catch { /* ignore */ }
      }
      return loaded;
    }
  } catch {
    // ignore corrupt file
  }
  return createEmptyWorkspaceStore();
}

const workspaceStore: WorkspaceStore = loadWorkspaceStore();
function getSessionSigningSecret(): string {
  const envSec = String(process.env.SESSION_SECRET || "").trim();
  if (envSec) return envSec;
  if (!workspaceStore.sessionSigningSecret) {
    workspaceStore.sessionSigningSecret = crypto.randomBytes(32).toString("hex");
  }
  return workspaceStore.sessionSigningSecret;
}
let saveWorkspaceTimer: ReturnType<typeof setTimeout> | null = null;
function persistWorkspaceStore() {
  if (saveWorkspaceTimer) clearTimeout(saveWorkspaceTimer);
  saveWorkspaceTimer = setTimeout(() => {
    try {
      fs.writeFileSync(WORKSPACE_FILE, JSON.stringify(workspaceStore), "utf8");
    } catch {
      // ignore disk write errors
    }
  }, 250);
}

function getActiveWebhookSecret(): string {
  const envSec = String(process.env.PAYMENT_WEBHOOK_SECRET || "").trim();
  if (envSec) return envSec;
  if (!workspaceStore.webhookSecret || workspaceStore.webhookSecret.length < 16) {
    workspaceStore.webhookSecret = crypto.randomBytes(24).toString("hex");
    persistWorkspaceStore();
  }
  return workspaceStore.webhookSecret;
}

function isSslCommerzConfigured(): boolean {
  return Boolean(String(process.env.SSLCOMMERZ_STORE_ID || "").trim() && String(process.env.SSLCOMMERZ_STORE_PASS || "").trim());
}

function normalizePhone11(raw: string): string {
  const digits = String(raw || "").replace(/\D+/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

const initialBuildHash = getAppBuildHash(true);
if (workspaceStore.lastDeployedBuildHash && workspaceStore.lastDeployedBuildHash !== initialBuildHash) {
  if (workspaceStore.liveUpdateStatus.stage === "updating") {
    workspaceStore.liveUpdateStatus = {
      stage: "ready",
      message: "নতুন আপডেট সফলভাবে সম্পন্ন হয়েছে! সর্বশেষ ফিচার পেতে রিলোড দিন।",
      versionLabel: cachedPkgVersion,
      reloadEpoch: Math.max(1, Number(workspaceStore.liveUpdateStatus.reloadEpoch) || 1) + 1,
      updatedAt: Date.now(),
      updatedBy: "system",
    };
  }
  workspaceStore.lastDeployedBuildHash = initialBuildHash;
  persistWorkspaceStore();
} else if (!workspaceStore.lastDeployedBuildHash) {
  workspaceStore.lastDeployedBuildHash = initialBuildHash;
}

function hashServerPass(plain: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(String(plain || ""), salt, 64).toString("hex");
  return `sc1$${salt}$${derived}`;
}

function verifyServerPass(plain: string, storedHash: string): boolean {
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 3 || parts[0] !== "sc1") return false;
  const [, salt, hex] = parts;
  try {
    const derived = crypto.scryptSync(String(plain || ""), salt, 64);
    const target = Buffer.from(hex, "hex");
    if (derived.length !== target.length) return false;
    return crypto.timingSafeEqual(derived, target);
  } catch {
    return false;
  }
}

function timingSafeStrEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

interface AuthSessionClaims {
  id: string;
  username: string;
  role: string;
  name: string;
  iat: number;
  exp: number;
}

function signAuthToken(claims: Omit<AuthSessionClaims, "iat" | "exp">): string {
  const now = Date.now();
  const payload: AuthSessionClaims = {
    ...claims,
    iat: now,
    exp: now + 7 * 24 * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSessionSigningSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyAuthToken(token: string): AuthSessionClaims | null {
  try {
    const [body, sig] = String(token || "").split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", getSessionSigningSecret()).update(body).digest("base64url");
    if (!timingSafeStrEqual(sig, expected)) return null;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AuthSessionClaims;
    if (!claims || !claims.username || Date.now() > Number(claims.exp || 0)) return null;
    const revTs = Number(communityStore.moderation.revokedUsers[claims.username.toLowerCase()] || 0);
    if (revTs > 0 && claims.iat <= revTs && claims.role !== "super_admin") return null;
    return claims;
  } catch {
    return null;
  }
}

function extractBearer(req: express.Request): AuthSessionClaims | null {
  const auth = String(req.headers.authorization || "");
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return verifyAuthToken(auth.slice(7).trim());
}

function sanitizeAccountForClient(acc: ServerAccount): Record<string, unknown> {
  const { passwordHash: _omit, ...safe } = acc;
  return { ...safe, subscriptionBypass: Boolean(acc.subscriptionBypass) };
}

const REMEMBER_COOKIE_NAME = "ads_hisab_session";
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EPHEMERAL_COOKIE_TTL_MS = 12 * 60 * 60 * 1000;

function hashRememberToken(rawToken: string): string {
  return crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");
}

function parseCookieHeader(req: express.Request, targetName: string): string {
  const header = String(req.headers.cookie || "");
  if (!header) return "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === targetName) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return "";
}

function isSameOriginCookieRequest(req: express.Request): boolean {
  const customHdr = String(req.headers["x-requested-with"] || "").trim().toLowerCase();
  const origin = String(req.headers.origin || "").trim();
  const expectedHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().toLowerCase();
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (!expectedHost || originHost !== expectedHost) return false;
    } catch {
      return false;
    }
  }
  return customHdr === "xmlhttprequest" || Boolean(origin && expectedHost);
}

function setRememberCookieHeader(req: express.Request, res: express.Response, rawToken: string, maxAgeSec?: number) {
  const isHttps = req.secure || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase() === "https";
  const attrs = isHttps
    ? "HttpOnly; Secure; SameSite=None; Partitioned; Path=/"
    : "HttpOnly; SameSite=Lax; Path=/";
  const base = `${REMEMBER_COOKIE_NAME}=${encodeURIComponent(rawToken)}; ${attrs}`;
  const cookieStr = typeof maxAgeSec === "number" ? `${base}; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}` : base;
  res.setHeader("Set-Cookie", cookieStr);
}

function pruneAndSaveSession(rec: RememberSessionRecord) {
  const now = Date.now();
  workspaceStore.rememberSessions = [
    rec,
    ...(workspaceStore.rememberSessions || []).filter((s) => s && s.exp > now && s.tokenHash !== rec.tokenHash),
  ].slice(0, 150);
  persistWorkspaceStore();
}

function issueRememberCookie(
  req: express.Request,
  res: express.Response,
  acc: { id: string; username: string; role: string },
  rememberMe: boolean
) {
  const existingRaw = parseCookieHeader(req, REMEMBER_COOKIE_NAME);
  if (existingRaw) {
    const oldHash = hashRememberToken(existingRaw);
    workspaceStore.rememberSessions = (workspaceStore.rememberSessions || []).filter((s) => s.tokenHash !== oldHash);
  }
  const rawToken = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const ttlMs = rememberMe ? REMEMBER_TTL_MS : EPHEMERAL_COOKIE_TTL_MS;
  pruneAndSaveSession({
    tokenHash: hashRememberToken(rawToken),
    userId: acc.id,
    username: acc.username,
    role: acc.role,
    rememberMe,
    createdAt: now,
    exp: now + ttlMs,
  });
  setRememberCookieHeader(req, res, rawToken, rememberMe ? Math.floor(REMEMBER_TTL_MS / 1000) : undefined);
}

function clearRememberCookie(req: express.Request, res: express.Response) {
  const existingRaw = parseCookieHeader(req, REMEMBER_COOKIE_NAME);
  if (existingRaw) {
    const oldHash = hashRememberToken(existingRaw);
    const prevLen = (workspaceStore.rememberSessions || []).length;
    workspaceStore.rememberSessions = (workspaceStore.rememberSessions || []).filter((s) => s.tokenHash !== oldHash);
    if (workspaceStore.rememberSessions.length !== prevLen) persistWorkspaceStore();
  }
  setRememberCookieHeader(req, res, "", 0);
}

function revokeUserRememberSessions(opts: { userId?: string; username?: string; excludeAdmin?: boolean }) {
  const prev = workspaceStore.rememberSessions || [];
  const uLower = String(opts.username || "").trim().toLowerCase();
  const next = prev.filter((s) => {
    if (opts.userId && s.userId === opts.userId) return false;
    if (uLower && String(s.username || "").toLowerCase() === uLower) return false;
    if (opts.excludeAdmin && s.role !== "super_admin" && s.userId !== "legacy-super-admin") return false;
    return true;
  });
  if (next.length !== prev.length) {
    workspaceStore.rememberSessions = next;
    persistWorkspaceStore();
  }
}

function buildSuperAdminAccountPayload() {
  return {
    id: "legacy-super-admin",
    username: "admin",
    name: String(workspaceStore.adminProfile?.name || "Super Admin"),
    email: String(workspaceStore.adminProfile?.email || "admin@example.com"),
    phone: String(workspaceStore.adminProfile?.phone || "01700000000"),
    role: "super_admin",
    userNumber: 1,
    status: "active",
  };
}

function verifyActiveServerAccount(claims: AuthSessionClaims):
  | { ok: true; acc: ServerAccount | null }
  | { ok: false; status: number; error: string; forceLogout?: boolean; subscriptionExpired?: boolean; account?: Record<string, unknown> } {
  if (claims.id === "legacy-super-admin") return { ok: true, acc: null };
  const acc = workspaceStore.accounts.find((a) => a.id === claims.id);
  if (!acc) {
    return { ok: false, status: 401, error: "সেশন অনুমোদিত নয় — অনুগ্রহ করে পুনরায় লগইন করুন।", forceLogout: true };
  }
  if (acc.status === "suspended") {
    return { ok: false, status: 403, error: "অ্যাকাউন্ট ব্লক (Suspended) করা আছে।", forceLogout: true };
  }
  if (acc.status === "pending") {
    return { ok: false, status: 403, error: "আপনার অ্যাকাউন্টটি অ্যাডমিন অনুমোদনের অপেক্ষায় আছে ⏳", forceLogout: true };
  }
  if (isServerAccountExpired(acc)) {
    return {
      ok: false,
      status: 403,
      error: `ফ্রি ট্রায়াল / সাবস্ক্রিপশন মেয়াদ (${acc.expiryDate}) শেষ হওয়ায় অ্যাকাউন্ট অটো-লক হয়েছে 🔒`,
      forceLogout: true,
      subscriptionExpired: true,
      account: sanitizeAccountForClient(acc),
    };
  }
  return { ok: true, acc };
}

function workspaceKeyForClaims(claims: AuthSessionClaims): string {
  if (claims.id === "legacy-super-admin" || claims.role === "staff" || claims.role === "admin" || claims.role === "super_admin") {
    return "master";
  }
  return `acc_${claims.id}`;
}

function isSafeExternalHttpsUrl(rawUrl: string): URL | null {
  try {
    const u = new URL(String(rawUrl || "").trim());
    if (u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase();
    if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return null;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(h)) return null;
    return u;
  } catch {
    return null;
  }
}

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "8mb" }));
  let broadcastCommunity = () => {};
  let broadcastTeamEvent = (_payload: Record<string, unknown>) => {};

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
      workspaceReady: true,
      adminClaimed: Boolean(workspaceStore.adminPassHash || process.env.ADMIN_PASSCODE),
      envAdminSet: Boolean(process.env.ADMIN_PASSCODE),
      metaConfigured: Boolean(process.env.META_ACCESS_TOKEN),
      webhookSecretConfigured: Boolean(process.env.PAYMENT_WEBHOOK_SECRET),
      version: cachedPkgVersion,
      buildHash: getAppBuildHash(),
      serverBootId: SERVER_BOOT_ID,
    });
  });

  app.get("/api/app-version", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({
      ok: true,
      version: cachedPkgVersion,
      buildHash: getAppBuildHash(),
      serverBootId: SERVER_BOOT_ID,
      updateStatus: workspaceStore.liveUpdateStatus,
    });
  });

  app.post("/api/system/update-status", (req, res) => {
    const claims = extractBearer(req);
    if (!claims || claims.role !== "super_admin") {
      res.status(403).json({ error: "শুধু সুপার অ্যাডমিন সিস্টেম আপডেট স্ট্যাটাস নিয়ন্ত্রণ করতে পারবেন।" });
      return;
    }
    const action = String(req.body?.action || "").trim();
    const customMsg = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 240) : "";
    const curEpoch = Math.max(1, Number(workspaceStore.liveUpdateStatus?.reloadEpoch) || 1);

    if (action === "start_updating") {
      workspaceStore.liveUpdateStatus = {
        stage: "updating",
        message: customMsg || "সিস্টেমে নতুন আপডেট চলছে — কিছুক্ষণের মধ্যেই নতুন ফিচার যুক্ত হবে।",
        versionLabel: cachedPkgVersion,
        reloadEpoch: curEpoch,
        updatedAt: Date.now(),
        updatedBy: claims.username,
      };
    } else if (action === "finish_ready") {
      workspaceStore.liveUpdateStatus = {
        stage: "ready",
        message: customMsg || "নতুন আপডেট যুক্ত হয়েছে! সর্বশেষ ফিচার পেতে রিলোড নিন।",
        versionLabel: cachedPkgVersion,
        reloadEpoch: curEpoch + 1,
        updatedAt: Date.now(),
        updatedBy: claims.username,
      };
    } else if (action === "clear") {
      workspaceStore.liveUpdateStatus = {
        stage: "idle",
        message: "",
        versionLabel: cachedPkgVersion,
        reloadEpoch: curEpoch,
        updatedAt: Date.now(),
        updatedBy: claims.username,
      };
    } else {
      res.status(400).json({ error: "সঠিক অ্যাকশন দিন (start_updating, finish_ready, clear)।" });
      return;
    }

    const buildHash = getAppBuildHash(true);
    workspaceStore.lastDeployedBuildHash = buildHash;
    persistWorkspaceStore();
    broadcastTeamEvent({
      type: "app_update_status",
      buildHash,
      version: cachedPkgVersion,
      updateStatus: workspaceStore.liveUpdateStatus,
    });
    res.json({
      ok: true,
      buildHash,
      version: cachedPkgVersion,
      updateStatus: workspaceStore.liveUpdateStatus,
    });
  });

  app.get("/api/auth/status", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({
      ok: true,
      envAdminSet: Boolean(process.env.ADMIN_PASSCODE),
      adminClaimed: Boolean(workspaceStore.adminPassHash || process.env.ADMIN_PASSCODE),
      signupPolicy: String(workspaceStore.globalRules?.signupPolicy || "trial7"),
      maintenanceMode: Boolean(workspaceStore.globalRules?.maintenanceMode),
      subscriptionConfig: workspaceStore.subscriptionConfig,
      version: cachedPkgVersion,
      buildHash: getAppBuildHash(),
      updateStatus: workspaceStore.liveUpdateStatus,
    });
  });

  app.post("/api/auth/session", (req, res) => {
    if (!isSameOriginCookieRequest(req)) {
      res.status(403).json({ ok: false, error: "অনুমোদিত নয়।" });
      return;
    }
    const rawCookie = parseCookieHeader(req, REMEMBER_COOKIE_NAME);
    if (!rawCookie) {
      res.status(401).json({ ok: false, error: "সেশন পাওয়া যায়নি।" });
      return;
    }
    const tokenHash = hashRememberToken(rawCookie);
    const now = Date.now();
    const rec = (workspaceStore.rememberSessions || []).find((s) => s.tokenHash === tokenHash && s.exp > now);
    if (!rec) {
      clearRememberCookie(req, res);
      res.status(401).json({ ok: false, error: "সেশন মেয়াদ শেষ হয়েছে।" });
      return;
    }
    const revTs = Number(communityStore.moderation.revokedUsers[String(rec.username || "").toLowerCase()] || 0);
    if (revTs > 0 && rec.createdAt <= revTs && rec.role !== "super_admin") {
      clearRememberCookie(req, res);
      res.status(401).json({ ok: false, error: "সেশন বাতিল করা হয়েছে।" });
      return;
    }
    const activeCheck = verifyActiveServerAccount({
      id: rec.userId,
      username: rec.username,
      role: rec.role,
      name: rec.username,
      iat: rec.createdAt,
      exp: rec.exp,
    });
    if (!activeCheck.ok) {
      clearRememberCookie(req, res);
      res.status(activeCheck.status).json({
        ok: false,
        error: activeCheck.error,
        forceLogout: true,
        subscriptionExpired: Boolean(activeCheck.subscriptionExpired),
        account: activeCheck.account,
        subscriptionConfig: workspaceStore.subscriptionConfig,
      });
      return;
    }
    const account = rec.userId === "legacy-super-admin"
      ? buildSuperAdminAccountPayload()
      : sanitizeAccountForClient(activeCheck.acc!);
    if (rec.rememberMe) {
      rec.exp = now + REMEMBER_TTL_MS;
      persistWorkspaceStore();
      setRememberCookieHeader(req, res, rawCookie, Math.floor(REMEMBER_TTL_MS / 1000));
    }
    const token = signAuthToken({
      id: String(account.id),
      username: String(account.username),
      role: String(account.role),
      name: String(account.name),
    });
    res.json({
      ok: true,
      token,
      account,
      rememberMe: rec.rememberMe,
      subscriptionConfig: workspaceStore.subscriptionConfig,
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    if (!isSameOriginCookieRequest(req)) {
      res.status(403).json({ ok: false, error: "অনুমোদিত নয়।" });
      return;
    }
    clearRememberCookie(req, res);
    res.json({ ok: true });
  });

  app.post("/api/auth/claim-admin", (req, res) => {
    if (process.env.ADMIN_PASSCODE || workspaceStore.adminPassHash) {
      res.status(409).json({ error: "সুপার অ্যাডমিন পাসওয়ার্ড ইতিমধ্যেই নির্ধারণ করা হয়েছে।" });
      return;
    }
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "admin@example.com";
    const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "01700000000";
    if (password.length < 6) {
      res.status(400).json({ error: "কমপক্ষে ৬ অক্ষরের শক্তিশালী পাসওয়ার্ড দিন।" });
      return;
    }
    workspaceStore.adminPassHash = hashServerPass(password);
    workspaceStore.adminProfile = {
      name: "Super Admin",
      email: email || "admin@example.com",
      phone: phone || "01700000000",
      pic: "",
    };
    persistWorkspaceStore();
    const account = buildSuperAdminAccountPayload();
    const rememberMe = Boolean(req.body?.rememberMe);
    issueRememberCookie(req, res, account, rememberMe);
    const token = signAuthToken({ id: account.id, username: account.username, role: account.role, name: account.name });
    res.json({ ok: true, token, account, rememberMe });
  });

  app.post("/api/auth/login", (req, res) => {
    const identity = typeof req.body?.identity === "string" ? req.body.identity.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const rememberMe = Boolean(req.body?.rememberMe);
    if (!identity || !password) {
      res.status(400).json({ error: "ইউজারনেম এবং পাসওয়ার্ড দিন।" });
      return;
    }

    // 1) Super Admin authentication (process.env.ADMIN_PASSCODE always takes precedence)
    if (identity === "admin") {
      const envPass = process.env.ADMIN_PASSCODE || "";
      if (envPass) {
        if (!timingSafeStrEqual(password, envPass)) {
          res.status(401).json({ error: "সুপার অ্যাডমিন পাসওয়ার্ড সঠিক নয়।" });
          return;
        }
      } else if (workspaceStore.adminPassHash) {
        if (!verifyServerPass(password, workspaceStore.adminPassHash)) {
          res.status(401).json({ error: "সুপার অ্যাডমিন পাসওয়ার্ড সঠিক নয়।" });
          return;
        }
      } else {
        res.status(409).json({ error: "প্রথমবার সুপার অ্যাডমিন পাসওয়ার্ড সেট করুন।", needsAdminClaim: true });
        return;
      }

      const nowStr = new Date().toLocaleString("bn-BD");
      workspaceStore.superAdminMeta = {
        ...workspaceStore.superAdminMeta,
        lastLogin: nowStr,
        loginCount: Number(workspaceStore.superAdminMeta?.loginCount || 0) + 1,
      };
      const account = buildSuperAdminAccountPayload();
      issueRememberCookie(req, res, account, rememberMe);
      persistWorkspaceStore();
      const token = signAuthToken({ id: account.id, username: account.username, role: account.role, name: account.name });
      res.json({ ok: true, token, account, rememberMe });
      return;
    }

    // 2) Registered accounts lookup
    const acc = workspaceStore.accounts.find((a) =>
      [a.username, a.email, a.phone].some((v) => String(v || "").trim().toLowerCase() === identity)
    );
    if (!acc || !verifyServerPass(password, acc.passwordHash)) {
      res.status(401).json({ error: "লগইন তথ্য সঠিক নয়।" });
      return;
    }
    if (acc.status === "suspended") {
      res.status(403).json({ error: "অ্যাকাউন্ট ব্লক (Suspended) করা আছে।" });
      return;
    }
    if (acc.status === "pending") {
      res.status(403).json({ error: "আপনার অ্যাকাউন্টটি অ্যাডমিন অনুমোদনের অপেক্ষায় আছে ⏳" });
      return;
    }
    if (isServerAccountExpired(acc)) {
      res.status(403).json({
        error: `আপনার ফ্রি ট্রায়াল / সাবস্ক্রিপশন মেয়াদ (${acc.expiryDate}) শেষ হওয়ায় অ্যাকাউন্ট অটো-লক হয়েছে 🔒`,
        subscriptionExpired: true,
        account: sanitizeAccountForClient(acc),
        subscriptionConfig: workspaceStore.subscriptionConfig,
      });
      return;
    }

    acc.lastLogin = new Date().toLocaleString("bn-BD");
    acc.loginCount = Number(acc.loginCount || 0) + 1;
    acc.updatedAt = Date.now();
    issueRememberCookie(req, res, acc, rememberMe);
    persistWorkspaceStore();

    const token = signAuthToken({ id: acc.id, username: acc.username, role: acc.role, name: acc.name });
    res.json({ ok: true, token, account: sanitizeAccountForClient(acc), rememberMe, subscriptionConfig: workspaceStore.subscriptionConfig });
  });

  app.post("/api/auth/register", (req, res) => {
    const policy = String(workspaceStore.globalRules?.signupPolicy || "trial7");
    if (policy === "closed") {
      res.status(403).json({ error: "নতুন সেলফ-সাইনআপ বর্তমানে বন্ধ আছে — অ্যাডমিনের সাথে যোগাযোগ করুন।" });
      return;
    }
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "";
    const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase().slice(0, 40) : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 100) : "";
    const phone = typeof req.body?.phone === "string" ? req.body.phone.trim().slice(0, 30) : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!name || !username || !email || !phone || !password) {
      res.status(400).json({ error: "সবগুলো ঘর পূরণ করুন।" });
      return;
    }
    if (username === "admin") {
      res.status(400).json({ error: "admin ইউজারনেম সংরক্ষিত।" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।" });
      return;
    }
    if (workspaceStore.accounts.some((a) => a.username === username || a.email === email)) {
      res.status(409).json({ error: "ইউজারনেম বা ইমেইল আগেই আছে।" });
      return;
    }

    const trialDays = Math.max(1, Math.min(90, Number(workspaceStore.subscriptionConfig?.trialDays) || 7));
    let plan = "Trial";
    let expiryDate = addDaysUtc(todayUtcStr(), trialDays);
    let status = "active";
    if (policy === "open") {
      plan = "Lifetime";
      expiryDate = "";
    } else if (policy === "pending") {
      status = "pending";
    }

    const userNumber = workspaceStore.nextUserId++;
    const newAcc: ServerAccount = {
      id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      userNumber,
      name,
      username,
      email,
      phone,
      passwordHash: hashServerPass(password),
      role: "user",
      plan,
      expiryDate,
      subscriptionBypass: false,
      status,
      lastLogin: status === "pending" ? "অনুমোদনের অপেক্ষায়" : new Date().toLocaleString("bn-BD"),
      loginCount: status === "pending" ? 0 : 1,
      updatedAt: Date.now(),
    };
    workspaceStore.accounts.push(newAcc);
    persistWorkspaceStore();

    if (status === "pending") {
      res.json({ ok: true, pending: true, account: sanitizeAccountForClient(newAcc), subscriptionConfig: workspaceStore.subscriptionConfig });
      return;
    }
    issueRememberCookie(req, res, newAcc, false);
    const token = signAuthToken({ id: newAcc.id, username: newAcc.username, role: newAcc.role, name: newAcc.name });
    res.json({ ok: true, token, account: sanitizeAccountForClient(newAcc), subscriptionConfig: workspaceStore.subscriptionConfig });
  });

  app.post("/api/auth/change-password", (req, res) => {
    const claims = extractBearer(req);
    if (!claims) {
      res.status(401).json({ error: "অনুমতি নেই। অনুগ্রহ করে পুনরায় লগইন করুন।" });
      return;
    }
    const activeCheck = verifyActiveServerAccount(claims);
    if (!activeCheck.ok) {
      res.status(activeCheck.status).json(activeCheck);
      return;
    }
    const oldPass = typeof req.body?.oldPassword === "string" ? req.body.oldPassword : "";
    const newPass = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    if (newPass.length < 6) {
      res.status(400).json({ error: "নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।" });
      return;
    }
    if (claims.id === "legacy-super-admin") {
      if (process.env.ADMIN_PASSCODE) {
        res.status(400).json({ error: "সার্ভার ADMIN_PASSCODE সেট করা থাকলে Settings > Secrets থেকে পরিবর্তন করুন।" });
        return;
      }
      if (!verifyServerPass(oldPass, workspaceStore.adminPassHash)) {
        res.status(401).json({ error: "বর্তমান পাসওয়ার্ড সঠিক নয়।" });
        return;
      }
      workspaceStore.adminPassHash = hashServerPass(newPass);
      const curRaw = parseCookieHeader(req, REMEMBER_COOKIE_NAME);
      const curRec = curRaw ? (workspaceStore.rememberSessions || []).find((s) => s.tokenHash === hashRememberToken(curRaw)) : undefined;
      revokeUserRememberSessions({ userId: "legacy-super-admin" });
      if (curRec) issueRememberCookie(req, res, buildSuperAdminAccountPayload(), curRec.rememberMe);
      persistWorkspaceStore();
      res.json({ ok: true });
      return;
    }
    const acc = workspaceStore.accounts.find((a) => a.id === claims.id);
    if (!acc || !verifyServerPass(oldPass, acc.passwordHash)) {
      res.status(401).json({ error: "বর্তমান পাসওয়ার্ড সঠিক নয়।" });
      return;
    }
    acc.passwordHash = hashServerPass(newPass);
    acc.updatedAt = Date.now();
    const curRaw = parseCookieHeader(req, REMEMBER_COOKIE_NAME);
    const curRec = curRaw ? (workspaceStore.rememberSessions || []).find((s) => s.tokenHash === hashRememberToken(curRaw)) : undefined;
    revokeUserRememberSessions({ userId: acc.id });
    if (curRec) {
      issueRememberCookie(req, res, acc, curRec.rememberMe);
    }
    persistWorkspaceStore();
    res.json({ ok: true });
  });

  app.post("/api/auth/change-username", (req, res) => {
    const claims = extractBearer(req);
    if (!claims) {
      res.status(401).json({ error: "অনুমতি নেই। অনুগ্রহ করে পুনরায় লগইন করুন।" });
      return;
    }
    const activeCheck = verifyActiveServerAccount(claims);
    if (!activeCheck.ok) {
      res.status(activeCheck.status).json(activeCheck);
      return;
    }
    if (claims.id === "legacy-super-admin") {
      res.status(400).json({ error: "admin ইউজারনেম পরিবর্তনযোগ্য নয়।" });
      return;
    }
    const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newUsername = typeof req.body?.newUsername === "string" ? req.body.newUsername.trim().toLowerCase() : "";
    if (!currentPassword) {
      res.status(400).json({ error: "বর্তমান পাসওয়ার্ড দিন।" });
      return;
    }
    if (!/^[a-z0-9._-]{3,40}$/.test(newUsername) || newUsername === "admin") {
      res.status(400).json({ error: "সঠিক নতুন ইউজারনেম দিন (কমপক্ষে ৩ অক্ষর, শুধু ইংরেজি অক্ষর/সংখ্যা/._-, এবং admin সংরক্ষিত)।" });
      return;
    }
    const acc = workspaceStore.accounts.find((a) => a.id === claims.id);
    if (!acc || !verifyServerPass(currentPassword, acc.passwordHash)) {
      res.status(401).json({ error: "বর্তমান পাসওয়ার্ড সঠিক নয়!" });
      return;
    }
    if (workspaceStore.accounts.some((a) => a.id !== acc.id && a.username === newUsername)) {
      res.status(409).json({ error: "এই ইউজারনেম আগেই নেওয়া হয়েছে!" });
      return;
    }
    acc.username = newUsername;
    acc.updatedAt = Date.now();
    (workspaceStore.rememberSessions || []).forEach((s) => {
      if (s.userId === acc.id) s.username = newUsername;
    });
    persistWorkspaceStore();
    const token = signAuthToken({ id: acc.id, username: acc.username, role: acc.role, name: acc.name });
    res.json({ ok: true, token, account: sanitizeAccountForClient(acc) });
  });

  app.get("/api/workspace", (req, res) => {
    const claims = extractBearer(req);
    if (!claims) {
      res.status(401).json({ error: "সেশন অনুমোদিত নয়।" });
      return;
    }
    const activeCheck = verifyActiveServerAccount(claims);
    if (!activeCheck.ok) {
      res.status(activeCheck.status).json({
        error: activeCheck.error,
        forceLogout: true,
        subscriptionExpired: Boolean(activeCheck.subscriptionExpired),
        account: activeCheck.account,
        subscriptionConfig: workspaceStore.subscriptionConfig,
      });
      return;
    }
    const wKey = workspaceKeyForClaims(claims);
    const isAdmin = claims.role === "super_admin" || claims.role === "admin";
    res.json({
      ok: true,
      workspaceKey: wKey,
      db: workspaceStore.workspaces[wKey] || null,
      superAdminMeta: isAdmin ? workspaceStore.superAdminMeta : {},
      globalRules: workspaceStore.globalRules,
      subscriptionConfig: workspaceStore.subscriptionConfig,
      subscriptionRequests: isAdmin
        ? workspaceStore.subscriptionRequests
        : workspaceStore.subscriptionRequests.filter((r) => r.userId === claims.id),
      selfAccount: activeCheck.acc ? sanitizeAccountForClient(activeCheck.acc) : undefined,
      accounts: isAdmin ? workspaceStore.accounts.map(sanitizeAccountForClient) : [],
    });
  });

  app.post("/api/workspace", (req, res) => {
    const claims = extractBearer(req);
    if (!claims) {
      res.status(401).json({ error: "সেশন অনুমোদিত নয়।" });
      return;
    }
    const activeCheck = verifyActiveServerAccount(claims);
    if (!activeCheck.ok) {
      res.status(activeCheck.status).json({
        error: activeCheck.error,
        forceLogout: true,
        subscriptionExpired: Boolean(activeCheck.subscriptionExpired),
        account: activeCheck.account,
        subscriptionConfig: workspaceStore.subscriptionConfig,
      });
      return;
    }
    const wKey = workspaceKeyForClaims(claims);
    const incomingDb = req.body?.db;
    if (incomingDb && typeof incomingDb === "object") {
      workspaceStore.workspaces[wKey] = {
        ...incomingDb,
        _serverUpdatedAt: Date.now(),
        _updatedBy: claims.username,
      };
    }
    if (claims.role === "super_admin") {
      if (req.body?.globalRules && typeof req.body.globalRules === "object") {
        workspaceStore.globalRules = { ...workspaceStore.globalRules, ...req.body.globalRules };
      }
      if (req.body?.superAdminMeta && typeof req.body.superAdminMeta === "object") {
        workspaceStore.superAdminMeta = { ...workspaceStore.superAdminMeta, ...req.body.superAdminMeta };
      }
    }
    persistWorkspaceStore();
    res.json({ ok: true, workspaceKey: wKey, savedAt: Date.now() });
  });

  function activateSubscriptionForAccount(
    acc: ServerAccount | undefined,
    reqItem: SubscriptionRequest,
    decidedBy: string,
    adminNote = "",
    grantBypass = false
  ) {
    reqItem.status = "approved";
    reqItem.adminNote = adminNote;
    reqItem.decidedBy = decidedBy;
    reqItem.decidedAt = Date.now();
    if (acc) {
      const planTitleMap: Record<SubscriptionPlanKey, string> = {
        daily: "Daily",
        weekly: "Weekly",
        monthly: "Monthly",
        yearly: "Yearly",
        lifetime: "Lifetime",
      };
      acc.status = "active";
      if (acc.role !== "super_admin" && acc.role !== "staff" && !acc.explicitAdminRole) {
        acc.role = "user";
      }
      acc.plan = planTitleMap[reqItem.planKey] || "Monthly";
      if (reqItem.planKey === "lifetime") {
        acc.expiryDate = "";
      } else {
        const base = acc.expiryDate && acc.expiryDate >= todayUtcStr() ? acc.expiryDate : todayUtcStr();
        acc.expiryDate = addDaysUtc(base, Math.max(1, Number(reqItem.days) || 30));
      }
      if (grantBypass) acc.subscriptionBypass = true;
      acc.updatedAt = Date.now();
    }
    let commChanged = false;
    communityStore.notifications.forEach((n) => {
      if (n.kind === "subscription_request" && n.postId === reqItem.id && !n.read) {
        n.read = true;
        commChanged = true;
      }
    });
    if (commChanged) persistCommunityStore();
  }

  function notifySuperAdminsSubscription(text: string, acc: ServerAccount, reqId: string, markRead = false) {
    const superTargets = new Set<string>(["admin"]);
    workspaceStore.accounts.forEach((a) => {
      if (a.role === "super_admin" && a.username) superTargets.add(a.username.toLowerCase());
    });
    const tStr = new Date().toLocaleString("bn-BD");
    superTargets.forEach((toUser) => {
      if (toUser === acc.username.toLowerCase()) return;
      communityStore.notifications.unshift({
        id: `subn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        toUsername: toUser,
        kind: "subscription_request",
        text: text.slice(0, 180),
        fromName: acc.name,
        fromUsername: acc.username,
        postId: reqId,
        read: markRead,
        ts: Date.now(),
        time: tStr,
      });
    });
    communityStore.notifications = communityStore.notifications.slice(0, 200);
    persistCommunityStore();
  }

  function tryAutoActivateFromVerifiedPayment(whItem: WebhookPaymentItem, explicitHints?: { username?: string; userId?: string; planKey?: string; subscriptionRequestId?: string }): { matched: boolean; request?: SubscriptionRequest; account?: ServerAccount } {
    if (workspaceStore.subscriptionConfig.autoActivateOnPaid === false) return { matched: false };
    if (whItem.status !== "verified" || !(whItem.amount > 0)) return { matched: false };

    const txLower = String(whItem.trxId || "").trim().toLowerCase();
    const whPhone10 = normalizePhone11(whItem.senderPhone || "");
    const reqById = explicitHints?.subscriptionRequestId
      ? workspaceStore.subscriptionRequests.find((r) => r.id === explicitHints.subscriptionRequestId && r.status === "pending")
      : undefined;
    const reqByTrx = txLower.length >= 4
      ? workspaceStore.subscriptionRequests.find((r) => r.status === "pending" && String(r.trxId || "").trim().toLowerCase() === txLower)
      : undefined;
    const phoneCandidates = whPhone10
      ? workspaceStore.subscriptionRequests.filter(
          (r) =>
            r.status === "pending" &&
            r.method !== "Permission Request" &&
            Number(whItem.amount) >= Number(r.price) &&
            (!String(r.trxId || "").trim() || String(r.trxId).trim().toLowerCase() === txLower) &&
            (normalizePhone11(r.senderPhone) === whPhone10 || normalizePhone11(r.phone) === whPhone10)
        )
      : [];
    const reqByPhone = phoneCandidates.length === 1 ? phoneCandidates[0] : undefined;

    const matchedReq = reqById || reqByTrx || reqByPhone;
    if (matchedReq && Number(whItem.amount) >= Number(matchedReq.price)) {
      const acc = workspaceStore.accounts.find((a) => a.id === matchedReq.userId);
      if (!acc || acc.status === "suspended") return { matched: false };
      whItem.status = "claimed";
      whItem.claimedAt = Date.now();
      whItem.claimedBy = acc.username;
      if (!matchedReq.trxId) matchedReq.trxId = whItem.trxId;
      activateSubscriptionForAccount(acc, matchedReq, "auto_payment_gateway", `অটো পেমেন্ট ভেরিফাইড (${whItem.method} · ${whItem.trxId})`);
      persistWorkspaceStore();
      notifySuperAdminsSubscription(`⚡ অটো পেমেন্টে প্ল্যান চালু: ${acc.name} (@${acc.username}) — ${matchedReq.planLabel} (৳${whItem.amount} · ${whItem.trxId})`, acc, matchedReq.id, true);
      broadcastCommunity();
      broadcastTeamEvent({
        type: "subscription_auto_activated",
        userId: acc.id,
        username: acc.username,
        account: sanitizeAccountForClient(acc),
        request: matchedReq,
        subscriptionRequests: workspaceStore.subscriptionRequests,
      });
      broadcastTeamEvent({
        type: "subscription_updated",
        request: matchedReq,
        subscriptionRequests: workspaceStore.subscriptionRequests,
      });
      return { matched: true, request: matchedReq, account: acc };
    }

    // Optional direct webhook purchase when caller explicitly passes planKey + userId/username
    const hintPlan = String(explicitHints?.planKey || "").trim().toLowerCase() as SubscriptionPlanKey;
    if (SUB_PLAN_KEYS.includes(hintPlan)) {
      const pCfg = workspaceStore.subscriptionConfig.plans[hintPlan];
      if (pCfg && pCfg.enabled !== false && Number(whItem.amount) >= Number(pCfg.price)) {
        const hintUser = String(explicitHints?.username || "").trim().toLowerCase();
        const hintUid = String(explicitHints?.userId || "").trim();
        const acc = workspaceStore.accounts.find((a) => (hintUid && a.id === hintUid) || (hintUser && a.username === hintUser));
        if (acc && acc.status !== "suspended" && acc.role !== "super_admin") {
          const directReq: SubscriptionRequest = {
            id: `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            userId: acc.id,
            userNumber: acc.userNumber,
            name: acc.name,
            username: acc.username,
            phone: acc.phone,
            email: acc.email,
            planKey: hintPlan,
            planLabel: pCfg.label,
            days: pCfg.days,
            price: pCfg.price,
            method: whItem.method || "Gateway",
            trxId: whItem.trxId,
            senderPhone: whItem.senderPhone || acc.phone,
            note: "Direct Verified Gateway Purchase",
            status: "approved",
            createdAt: Date.now(),
            time: new Date().toLocaleString("bn-BD"),
          };
          workspaceStore.subscriptionRequests.unshift(directReq);
          workspaceStore.subscriptionRequests = workspaceStore.subscriptionRequests.slice(0, 250);
          whItem.status = "claimed";
          whItem.claimedAt = Date.now();
          whItem.claimedBy = acc.username;
          activateSubscriptionForAccount(acc, directReq, "auto_payment_gateway", `অটো পেমেন্ট ভেরিফাইড (${whItem.method} · ${whItem.trxId})`);
          persistWorkspaceStore();
          notifySuperAdminsSubscription(`⚡ অটো পেমেন্টে প্ল্যান চালু: ${acc.name} (@${acc.username}) — ${pCfg.label} (৳${whItem.amount} · ${whItem.trxId})`, acc, directReq.id, true);
          broadcastCommunity();
          broadcastTeamEvent({
            type: "subscription_auto_activated",
            userId: acc.id,
            username: acc.username,
            account: sanitizeAccountForClient(acc),
            request: directReq,
            subscriptionRequests: workspaceStore.subscriptionRequests,
          });
          broadcastTeamEvent({
            type: "subscription_updated",
            request: directReq,
            subscriptionRequests: workspaceStore.subscriptionRequests,
          });
          return { matched: true, request: directReq, account: acc };
        }
      }
    }
    return { matched: false };
  }

  app.get("/api/subscription/config", (_req, res) => {
    res.json({
      ok: true,
      subscriptionConfig: workspaceStore.subscriptionConfig,
      gatewayConfigured: isSslCommerzConfigured(),
      autoActivateOnPaid: workspaceStore.subscriptionConfig.autoActivateOnPaid !== false,
    });
  });

  app.post("/api/subscription/config", (req, res) => {
    const claims = extractBearer(req);
    if (!claims || claims.role !== "super_admin") {
      res.status(403).json({ error: "শুধু সুপার অ্যাডমিন সাবস্ক্রিপশন প্ল্যান ও প্রাইস নির্ধারণ করতে পারবেন।" });
      return;
    }
    const incoming = req.body?.subscriptionConfig && typeof req.body.subscriptionConfig === "object"
      ? (req.body.subscriptionConfig as Partial<SubscriptionConfig>)
      : (req.body as Partial<SubscriptionConfig>);
    workspaceStore.subscriptionConfig = normalizeSubscriptionConfig({
      ...workspaceStore.subscriptionConfig,
      ...(incoming || {}),
      plans: {
        ...workspaceStore.subscriptionConfig.plans,
        ...(incoming?.plans && typeof incoming.plans === "object" ? incoming.plans : {}),
      },
    });
    persistWorkspaceStore();
    res.json({
      ok: true,
      subscriptionConfig: workspaceStore.subscriptionConfig,
      gatewayConfigured: isSslCommerzConfigured(),
    });
  });

  app.get("/api/subscription/gateway-info", (req, res) => {
    const claims = extractBearer(req);
    if (!claims || claims.role !== "super_admin") {
      res.status(403).json({ error: "শুধু সুপার অ্যাডমিন পেমেন্ট গেটওয়ে তথ্য দেখতে পারবেন।" });
      return;
    }
    res.json({
      ok: true,
      sslcommerzConfigured: isSslCommerzConfigured(),
      sslcommerzLive: process.env.SSLCOMMERZ_IS_LIVE === "true",
      webhookSecretEnvOverride: Boolean(String(process.env.PAYMENT_WEBHOOK_SECRET || "").trim()),
      webhookSecret: getActiveWebhookSecret(),
      autoActivateOnPaid: workspaceStore.subscriptionConfig.autoActivateOnPaid !== false,
    });
  });

  app.post("/api/subscription/gateway-rotate-secret", (req, res) => {
    const claims = extractBearer(req);
    if (!claims || claims.role !== "super_admin") {
      res.status(403).json({ error: "শুধু সুপার অ্যাডমিন ওয়েবহুক সিক্রেট পরিবর্তন করতে পারবেন।" });
      return;
    }
    if (String(process.env.PAYMENT_WEBHOOK_SECRET || "").trim()) {
      res.status(400).json({ error: "সার্ভার Secrets-এ PAYMENT_WEBHOOK_SECRET সেট করা আছে — সেখান থেকে পরিবর্তন করুন।" });
      return;
    }
    workspaceStore.webhookSecret = crypto.randomBytes(24).toString("hex");
    persistWorkspaceStore();
    res.json({ ok: true, webhookSecret: workspaceStore.webhookSecret });
  });

  app.post("/api/subscription/request", (req, res) => {
    const claims = extractBearer(req);
    let acc: ServerAccount | undefined;
    if (claims) {
      if (claims.id === "legacy-super-admin" || claims.role === "super_admin") {
        res.status(400).json({ error: "সুপার অ্যাডমিনের কোনো সাবস্ক্রিপশন প্রয়োজন নেই।" });
        return;
      }
      acc = workspaceStore.accounts.find((a) => a.id === claims.id);
    } else {
      const identity = typeof req.body?.identity === "string" ? req.body.identity.trim().toLowerCase() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!identity || !password) {
        res.status(401).json({ error: "অনুরোধ পাঠাতে লগইন তথ্য দিন।" });
        return;
      }
      acc = workspaceStore.accounts.find((a) =>
        [a.username, a.email, a.phone].some((v) => String(v || "").trim().toLowerCase() === identity)
      );
      if (!acc || !verifyServerPass(password, acc.passwordHash)) {
        res.status(401).json({ error: "ইউজারনেম বা পাসওয়ার্ড সঠিক নয়।" });
        return;
      }
    }
    if (!acc) {
      res.status(404).json({ error: "অ্যাকাউন্ট পাওয়া যায়নি।" });
      return;
    }
    if (acc.status === "suspended") {
      res.status(403).json({ error: "অ্যাকাউন্ট ব্লক (Suspended) করা আছে।" });
      return;
    }

    const planKeyRaw = String(req.body?.planKey || "").trim().toLowerCase() as SubscriptionPlanKey;
    if (!SUB_PLAN_KEYS.includes(planKeyRaw)) {
      res.status(400).json({ error: "সঠিক প্ল্যান নির্বাচন করুন (Daily, Weekly, Monthly, Yearly, Lifetime)।" });
      return;
    }
    const planCfg = workspaceStore.subscriptionConfig.plans[planKeyRaw];
    if (!planCfg || planCfg.enabled === false) {
      res.status(400).json({ error: "এই প্ল্যানটি বর্তমানে বন্ধ আছে।" });
      return;
    }

    const method = String(req.body?.method || "bKash").trim().slice(0, 30) || "bKash";
    const trxId = String(req.body?.trxId || "").trim().slice(0, 60);
    const senderPhone = String(req.body?.senderPhone || acc.phone || "").trim().slice(0, 30);
    const note = String(req.body?.note || "").trim().slice(0, 250);
    if (!trxId && !note && method !== "Permission Request") {
      res.status(400).json({ error: "পেমেন্ট TrxID অথবা নোট লিখুন।" });
      return;
    }

    const reqItem: SubscriptionRequest = {
      id: `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      userId: acc.id,
      userNumber: acc.userNumber,
      name: acc.name,
      username: acc.username,
      phone: acc.phone,
      email: acc.email,
      planKey: planKeyRaw,
      planLabel: planCfg.label,
      days: planCfg.days,
      price: planCfg.price,
      method,
      trxId,
      senderPhone,
      note,
      status: "pending",
      createdAt: Date.now(),
      time: new Date().toLocaleString("bn-BD"),
    };
    workspaceStore.subscriptionRequests.unshift(reqItem);
    workspaceStore.subscriptionRequests = workspaceStore.subscriptionRequests.slice(0, 250);

    // Check if verified gateway webhook payment with matching TrxID already arrived
    let autoActivated = false;
    let freshToken: string | undefined;
    if (workspaceStore.subscriptionConfig.autoActivateOnPaid !== false && trxId.length >= 4 && method !== "Permission Request") {
      const txLower = trxId.toLowerCase();
      const verifiedWh = workspaceStore.webhookPayments.find(
        (p) => p.status === "verified" && String(p.trxId || "").trim().toLowerCase() === txLower && Number(p.amount) >= Number(planCfg.price)
      );
      if (verifiedWh) {
        verifiedWh.status = "claimed";
        verifiedWh.claimedAt = Date.now();
        verifiedWh.claimedBy = acc.username;
        activateSubscriptionForAccount(acc, reqItem, "auto_payment_gateway", `অটো পেমেন্ট ভেরিফাইড (${verifiedWh.method} · ${verifiedWh.trxId})`);
        autoActivated = true;
        freshToken = signAuthToken({ id: acc.id, username: acc.username, role: acc.role, name: acc.name });
        issueRememberCookie(req, res, acc, false);
      }
    }

    persistWorkspaceStore();
    notifySuperAdminsSubscription(
      autoActivated
        ? `⚡ অটো পেমেন্টে প্ল্যান চালু: ${acc.name} (@${acc.username}) — ${planCfg.label} (৳${planCfg.price} · ${trxId})`
        : `💎 নতুন সাবস্ক্রিপশন রিকোয়েস্ট: ${acc.name} (@${acc.username}) — ${planCfg.label} (৳${planCfg.price})${trxId ? ` · Trx: ${trxId}` : ""}`,
      acc,
      reqItem.id,
      autoActivated
    );
    broadcastCommunity();
    if (autoActivated) {
      broadcastTeamEvent({
        type: "subscription_auto_activated",
        userId: acc.id,
        username: acc.username,
        account: sanitizeAccountForClient(acc),
        request: reqItem,
        subscriptionRequests: workspaceStore.subscriptionRequests,
      });
      broadcastTeamEvent({
        type: "subscription_updated",
        request: reqItem,
        subscriptionRequests: workspaceStore.subscriptionRequests,
      });
    } else {
      broadcastTeamEvent({
        type: "subscription_request",
        request: reqItem,
        subscriptionRequests: workspaceStore.subscriptionRequests,
      });
    }
    res.json({
      ok: true,
      autoActivated,
      request: reqItem,
      ...(autoActivated ? { token: freshToken, account: sanitizeAccountForClient(acc) } : {}),
    });
  });

  app.post("/api/subscription/request-status", (req, res) => {
    const claims = extractBearer(req);
    let acc: ServerAccount | undefined;
    if (claims) {
      acc = workspaceStore.accounts.find((a) => a.id === claims.id);
    } else {
      const identity = typeof req.body?.identity === "string" ? req.body.identity.trim().toLowerCase() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!identity || !password) {
        res.status(401).json({ error: "অনুমতি নেই।" });
        return;
      }
      acc = workspaceStore.accounts.find((a) =>
        [a.username, a.email, a.phone].some((v) => String(v || "").trim().toLowerCase() === identity)
      );
      if (!acc || !verifyServerPass(password, acc.passwordHash)) {
        res.status(401).json({ error: "লগইন তথ্য সঠিক নয়।" });
        return;
      }
    }
    if (!acc) {
      res.status(404).json({ error: "অ্যাকাউন্ট পাওয়া যায়নি।" });
      return;
    }
    const requestId = String(req.body?.requestId || "").trim();
    const reqItem = requestId
      ? workspaceStore.subscriptionRequests.find((r) => r.id === requestId && r.userId === acc!.id)
      : workspaceStore.subscriptionRequests.find((r) => r.userId === acc!.id);
    if (!reqItem) {
      res.status(404).json({ error: "রিকোয়েস্ট পাওয়া যায়নি।" });
      return;
    }
    const isNowActive = reqItem.status === "approved" && acc.status === "active" && !isServerAccountExpired(acc);
    let token: string | undefined;
    if (isNowActive) {
      token = signAuthToken({ id: acc.id, username: acc.username, role: acc.role, name: acc.name });
      issueRememberCookie(req, res, acc, false);
    }
    res.json({
      ok: true,
      status: reqItem.status,
      autoActivated: isNowActive,
      request: reqItem,
      ...(isNowActive ? { token, account: sanitizeAccountForClient(acc) } : {}),
    });
  });

  app.post("/api/subscription/checkout", async (req, res) => {
    const storeId = String(process.env.SSLCOMMERZ_STORE_ID || "").trim();
    const storePass = String(process.env.SSLCOMMERZ_STORE_PASS || "").trim();
    if (!storeId || !storePass) {
      res.status(400).json({ error: "অনলাইন পেমেন্ট গেটওয়ে (SSLCommerz) এখনো সার্ভার Secrets-এ যুক্ত করা হয়নি। পেমেন্ট করে TrxID দিন।" });
      return;
    }
    const claims = extractBearer(req);
    let acc: ServerAccount | undefined;
    if (claims) {
      if (claims.id === "legacy-super-admin" || claims.role === "super_admin") {
        res.status(400).json({ error: "সুপার অ্যাডমিনের সাবস্ক্রিপশন প্রয়োজন নেই।" });
        return;
      }
      acc = workspaceStore.accounts.find((a) => a.id === claims.id);
    } else {
      const identity = typeof req.body?.identity === "string" ? req.body.identity.trim().toLowerCase() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!identity || !password) {
        res.status(401).json({ error: "চেকআউটের জন্য লগইন তথ্য দিন।" });
        return;
      }
      acc = workspaceStore.accounts.find((a) =>
        [a.username, a.email, a.phone].some((v) => String(v || "").trim().toLowerCase() === identity)
      );
      if (!acc || !verifyServerPass(password, acc.passwordHash)) {
        res.status(401).json({ error: "ইউজারনেম বা পাসওয়ার্ড সঠিক নয়।" });
        return;
      }
    }
    if (!acc || acc.status === "suspended") {
      res.status(403).json({ error: "অ্যাকাউন্ট সক্রিয় নয় বা ব্লক করা আছে।" });
      return;
    }

    const planKeyRaw = String(req.body?.planKey || "").trim().toLowerCase() as SubscriptionPlanKey;
    if (!SUB_PLAN_KEYS.includes(planKeyRaw)) {
      res.status(400).json({ error: "সঠিক প্ল্যান নির্বাচন করুন।" });
      return;
    }
    const planCfg = workspaceStore.subscriptionConfig.plans[planKeyRaw];
    if (!planCfg || planCfg.enabled === false || !(planCfg.price > 0)) {
      res.status(400).json({ error: "এই প্ল্যানটি অনলাইন পেমেন্টের জন্য উপযোগী নয়।" });
      return;
    }

    const reqId = `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const tranId = `SUB_${reqId}`;
    const reqItem: SubscriptionRequest = {
      id: reqId,
      userId: acc.id,
      userNumber: acc.userNumber,
      name: acc.name,
      username: acc.username,
      phone: acc.phone,
      email: acc.email,
      planKey: planKeyRaw,
      planLabel: planCfg.label,
      days: planCfg.days,
      price: planCfg.price,
      method: "Online Gateway",
      trxId: tranId,
      senderPhone: acc.phone,
      note: "SSLCommerz Online Checkout",
      status: "pending",
      createdAt: Date.now(),
      time: new Date().toLocaleString("bn-BD"),
    };
    workspaceStore.subscriptionRequests.unshift(reqItem);
    workspaceStore.subscriptionRequests = workspaceStore.subscriptionRequests.slice(0, 250);
    persistWorkspaceStore();

    const rawBase = String(process.env.APP_URL || "").trim().replace(/\/+$/, "") || `${req.protocol}://${req.get("host") || ""}`;
    const apiBase = process.env.SSLCOMMERZ_IS_LIVE === "true"
      ? "https://securepay.sslcommerz.com"
      : "https://sandbox.sslcommerz.com";

    try {
      const form = new URLSearchParams({
        store_id: storeId,
        store_passwd: storePass,
        total_amount: String(planCfg.price),
        currency: "BDT",
        tran_id: tranId,
        success_url: `${rawBase}/api/subscription/sslcommerz/callback?state=success&reqId=${encodeURIComponent(reqId)}`,
        fail_url: `${rawBase}/api/subscription/sslcommerz/callback?state=fail&reqId=${encodeURIComponent(reqId)}`,
        cancel_url: `${rawBase}/api/subscription/sslcommerz/callback?state=cancel&reqId=${encodeURIComponent(reqId)}`,
        ipn_url: `${rawBase}/api/subscription/sslcommerz/callback?state=ipn&reqId=${encodeURIComponent(reqId)}`,
        shipping_method: "NO",
        product_name: `Subscription: ${planCfg.label}`,
        product_category: "SaaS Subscription",
        product_profile: "non-physical-goods",
        cus_name: acc.name || acc.username,
        cus_email: acc.email || "user@example.com",
        cus_add1: "Dhaka",
        cus_city: "Dhaka",
        cus_country: "Bangladesh",
        cus_phone: acc.phone || "01700000000",
      });
      const gwRes = await fetch(`${apiBase}/gwprocess/v4/api.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const gwData = (await gwRes.json()) as { status?: string; GatewayPageURL?: string; failedreason?: string };
      if (gwData?.status !== "SUCCESS" || !gwData.GatewayPageURL) {
        res.status(502).json({ error: gwData?.failedreason || "পেমেন্ট গেটওয়ে সেশন তৈরি করা যায়নি।" });
        return;
      }
      res.json({ ok: true, requestId: reqId, tranId, gatewayUrl: gwData.GatewayPageURL });
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : "গেটওয়ে সংযোগ ব্যর্থ হয়েছে।" });
    }
  });

  app.all("/api/subscription/sslcommerz/callback", express.urlencoded({ extended: false }), async (req, res) => {
    const state = String(req.query?.state || "").toLowerCase();
    const reqId = String(req.query?.reqId || "").trim();
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, string>;
    const valId = String(body.val_id || req.query?.val_id || "").trim();
    const tranId = String(body.tran_id || "").trim();

    const storeId = String(process.env.SSLCOMMERZ_STORE_ID || "").trim();
    const storePass = String(process.env.SSLCOMMERZ_STORE_PASS || "").trim();
    const apiBase = process.env.SSLCOMMERZ_IS_LIVE === "true"
      ? "https://securepay.sslcommerz.com"
      : "https://sandbox.sslcommerz.com";

    const sendPopupResultHtml = (ok: boolean, title: string, desc: string) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f3f5fb;color:#0f172a;text-align:center;padding:24px"><div style="background:#fff;padding:28px;border-radius:16px;max-width:420px;box-shadow:0 12px 30px rgba(0,0,0,.08)"><div style="font-size:40px;margin-bottom:10px">${ok ? "✅" : "⚠️"}</div><h2 style="margin:0 0 8px">${title}</h2><p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.5">${desc}</p><button onclick="if(window.opener){window.close();}else{location.href='/';}" style="background:#3157e8;color:#fff;border:0;padding:10px 18px;border-radius:9px;font-weight:700;cursor:pointer">অ্যাপে ফিরে যান</button><script>setTimeout(function(){if(window.opener){try{window.close();}catch(e){}}},1800);</script></div></body></html>`);
    };

    if ((state !== "success" && state !== "ipn") || !valId || !storeId || !storePass) {
      if (state === "ipn") { res.json({ ok: false }); return; }
      sendPopupResultHtml(false, "পেমেন্ট সম্পন্ন হয়নি", "পেমেন্ট বাতিল বা ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
      return;
    }

    const reqItem = workspaceStore.subscriptionRequests.find(
      (r) => (reqId && r.id === reqId) || (tranId && r.trxId === tranId)
    );
    if (!reqItem) {
      if (state === "ipn") { res.status(404).json({ ok: false }); return; }
      sendPopupResultHtml(false, "অর্ডার পাওয়া যায়নি", "সাবস্ক্রিপশন অর্ডার খুঁজে পাওয়া যায়নি।");
      return;
    }

    try {
      const vUrl = `${apiBase}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(valId)}&store_id=${encodeURIComponent(storeId)}&store_passwd=${encodeURIComponent(storePass)}&v=1&format=json`;
      const vRes = await fetch(vUrl);
      const vData = (await vRes.json()) as { status?: string; tran_id?: string; amount?: string; currency?: string; bank_tran_id?: string; card_type?: string };
      const validStatus = vData?.status === "VALID" || vData?.status === "VALIDATED";
      const validAmount = Number(vData?.amount || 0) >= Number(reqItem.price);
      const validTran = !vData?.tran_id || vData.tran_id === `SUB_${reqItem.id}` || vData.tran_id === reqItem.trxId;
      if (!validStatus || !validAmount || !validTran) {
        if (state === "ipn") { res.status(400).json({ ok: false }); return; }
        sendPopupResultHtml(false, "ভেরিফিকেশন ব্যর্থ", "গেটওয়ে পেমেন্ট যাচাই সফল হয়নি।");
        return;
      }

      if (reqItem.status === "pending") {
        const acc = workspaceStore.accounts.find((a) => a.id === reqItem.userId);
        if (acc && acc.status !== "suspended") {
          const whItem: WebhookPaymentItem = {
            id: `wh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
            trxId: vData.bank_tran_id || valId,
            amount: Number(vData.amount || reqItem.price),
            method: String(vData.card_type || "SSLCommerz").slice(0, 30),
            senderPhone: acc.phone,
            customerName: acc.name,
            note: `Verified SSLCommerz (${reqItem.planLabel})`,
            source: "sslcommerz_verified",
            status: "claimed",
            claimedAt: Date.now(),
            claimedBy: acc.username,
            ts: Date.now(),
            time: new Date().toLocaleString("bn-BD"),
          };
          workspaceStore.webhookPayments.unshift(whItem);
          workspaceStore.webhookPayments = workspaceStore.webhookPayments.slice(0, 120);
          activateSubscriptionForAccount(acc, reqItem, "sslcommerz_auto", `অটো অনলাইন পেমেন্ট (${whItem.method} · ${whItem.trxId})`);
          persistWorkspaceStore();
          notifySuperAdminsSubscription(`⚡ অনলাইন পেমেন্টে প্ল্যান চালু: ${acc.name} (@${acc.username}) — ${reqItem.planLabel} (৳${whItem.amount})`, acc, reqItem.id, true);
          broadcastCommunity();
          broadcastTeamEvent({
            type: "subscription_auto_activated",
            userId: acc.id,
            username: acc.username,
            account: sanitizeAccountForClient(acc),
            request: reqItem,
            subscriptionRequests: workspaceStore.subscriptionRequests,
          });
          broadcastTeamEvent({
            type: "subscription_updated",
            request: reqItem,
            subscriptionRequests: workspaceStore.subscriptionRequests,
          });
        }
      }

      if (state === "ipn") { res.json({ ok: true }); return; }
      sendPopupResultHtml(true, "পেমেন্ট সফল ও প্ল্যান চালু হয়েছে!", "আপনার সাবস্ক্রিপশন স্বয়ংক্রিয়ভাবে সক্রিয় হয়েছে। এখন মূল স্ক্রিনে ফিরে যান।");
    } catch {
      if (state === "ipn") { res.status(502).json({ ok: false }); return; }
      sendPopupResultHtml(false, "যাচাইয়ে ত্রুটি", "পেমেন্ট যাচাই করতে সমস্যা হয়েছে।");
    }
  });

  app.get("/api/subscription/requests", (req, res) => {
    const claims = extractBearer(req);
    if (!claims) {
      res.status(401).json({ error: "অনুমতি নেই।" });
      return;
    }
    const isAdmin = claims.role === "super_admin" || claims.role === "admin";
    res.json({
      ok: true,
      subscriptionRequests: isAdmin
        ? workspaceStore.subscriptionRequests
        : workspaceStore.subscriptionRequests.filter((r) => r.userId === claims.id),
    });
  });

  app.post("/api/subscription/decision", (req, res) => {
    const claims = extractBearer(req);
    if (!claims || claims.role !== "super_admin") {
      res.status(403).json({ error: "শুধু সুপার অ্যাডমিন সাবস্ক্রিপশন অনুমোদন বা বাতিল করতে পারবেন।" });
      return;
    }
    const requestId = String(req.body?.requestId || "").trim();
    const action = req.body?.action === "reject" ? "reject" : "approve";
    const adminNote = String(req.body?.adminNote || "").trim().slice(0, 200);
    const grantBypass = Boolean(req.body?.grantBypass);
    const reqItem = workspaceStore.subscriptionRequests.find((r) => r.id === requestId);
    if (!reqItem) {
      res.status(404).json({ error: "সাবস্ক্রিপশন রিকোয়েস্ট পাওয়া যায়নি।" });
      return;
    }

    const acc = workspaceStore.accounts.find((a) => a.id === reqItem.userId);
    if (action === "approve") {
      activateSubscriptionForAccount(acc, reqItem, claims.username, adminNote, grantBypass);
    } else {
      reqItem.status = "rejected";
      reqItem.adminNote = adminNote;
      reqItem.decidedBy = claims.username;
      reqItem.decidedAt = Date.now();
    }
    persistWorkspaceStore();
    broadcastCommunity();
    if (action === "approve" && acc) {
      broadcastTeamEvent({
        type: "subscription_auto_activated",
        userId: acc.id,
        username: acc.username,
        account: sanitizeAccountForClient(acc),
        request: reqItem,
        subscriptionRequests: workspaceStore.subscriptionRequests,
      });
    }
    broadcastTeamEvent({
      type: "subscription_updated",
      request: reqItem,
      subscriptionRequests: workspaceStore.subscriptionRequests,
    });
    res.json({
      ok: true,
      request: reqItem,
      account: acc ? sanitizeAccountForClient(acc) : null,
      subscriptionRequests: workspaceStore.subscriptionRequests,
    });
  });

  app.post("/api/accounts/upsert", (req, res) => {
    const claims = extractBearer(req);
    if (!claims || (claims.role !== "super_admin" && claims.role !== "admin")) {
      res.status(403).json({ error: "শুধু অ্যাডমিন/সুপার অ্যাডমিন অ্যাকাউন্ট পরিচালনা করতে পারবেন।" });
      return;
    }
    const item = req.body?.account as Record<string, unknown> | undefined;
    if (!item || typeof item !== "object") {
      res.status(400).json({ error: "অবৈধ অ্যাকাউন্ট ডেটা।" });
      return;
    }
    const id = String(item.id || `u_${Date.now().toString(36)}`);
    const username = String(item.username || "").trim().toLowerCase();
    if (!username || username === "admin") {
      res.status(400).json({ error: "সঠিক ইউজারনেম দিন।" });
      return;
    }
    if (workspaceStore.accounts.some((a) => a.id !== id && a.username === username)) {
      res.status(409).json({ error: "এই ইউজারনেম আগেই নেওয়া হয়েছে।" });
      return;
    }
    const existing = workspaceStore.accounts.find((a) => a.id === id);
    const rawPass = typeof item.plainPassword === "string" && item.plainPassword.length >= 6 ? item.plainPassword : "";
    const reqRole = typeof item.role === "string" ? item.role.trim() : "";
    const allowedRoles = new Set(["user", "staff", "admin"]);
    const nextRole = claims.role === "super_admin"
      ? (reqRole === "super_admin" && existing?.role === "super_admin" ? "super_admin" : (allowedRoles.has(reqRole) ? reqRole : (existing?.role || "user")))
      : (existing?.role || "user");
    const nextExplicitAdmin = claims.role === "super_admin"
      ? (nextRole === "admin" ? (item.explicitAdminRole !== undefined ? Boolean(item.explicitAdminRole) : true) : false)
      : Boolean(existing?.explicitAdminRole);
    const nextBypass = claims.role === "super_admin" && item.subscriptionBypass !== undefined
      ? Boolean(item.subscriptionBypass)
      : Boolean(existing?.subscriptionBypass);
    const updated: ServerAccount = {
      id,
      userNumber: Number(item.userNumber) || existing?.userNumber || workspaceStore.nextUserId++,
      name: String(item.name || existing?.name || username).slice(0, 80),
      username,
      email: String(item.email || existing?.email || "").trim().toLowerCase(),
      phone: String(item.phone || existing?.phone || "").trim(),
      passwordHash: rawPass ? hashServerPass(rawPass) : (existing?.passwordHash || hashServerPass(crypto.randomBytes(12).toString("hex"))),
      role: nextRole,
      explicitAdminRole: nextExplicitAdmin,
      plan: String(item.plan || existing?.plan || "Trial"),
      expiryDate: String(item.expiryDate ?? existing?.expiryDate ?? ""),
      subscriptionBypass: nextBypass,
      status: String(item.status || existing?.status || "active"),
      lastLogin: String(item.lastLogin || existing?.lastLogin || ""),
      loginCount: Number(item.loginCount ?? existing?.loginCount ?? 0),
      updatedAt: Date.now(),
      permissions: (item.permissions && typeof item.permissions === "object" ? item.permissions : existing?.permissions) as Record<string, unknown> | undefined,
    };
    if (existing) {
      Object.assign(existing, updated);
    } else {
      workspaceStore.accounts.push(updated);
    }
    (workspaceStore.rememberSessions || []).forEach((s) => {
      if (s.userId === updated.id) {
        s.role = updated.role;
        s.username = updated.username;
      }
    });
    if (updated.status !== "active") {
      revokeUserRememberSessions({ userId: updated.id });
    }
    persistWorkspaceStore();
    res.json({ ok: true, account: sanitizeAccountForClient(updated) });
  });

  app.post("/api/accounts/delete", (req, res) => {
    const claims = extractBearer(req);
    if (!claims || claims.role !== "super_admin") {
      res.status(403).json({ error: "শুধু সুপার অ্যাডমিন অ্যাকাউন্ট ডিলিট করতে পারবেন।" });
      return;
    }
    const id = String(req.body?.id || "");
    workspaceStore.accounts = workspaceStore.accounts.filter((a) => a.id !== id);
    workspaceStore.subscriptionRequests = workspaceStore.subscriptionRequests.filter((r) => r.userId !== id);
    revokeUserRememberSessions({ userId: id });
    persistWorkspaceStore();
    res.json({ ok: true });
  });

  // Live Meta Marketing API Insights Proxy (strictly pinned to graph.facebook.com)
  app.post("/api/meta/sync", async (req, res) => {
    const claims = extractBearer(req);
    if (!claims) {
      res.status(401).json({ error: "অনুমতি নেই। আগে লগইন করুন।" });
      return;
    }
    const activeCheck = verifyActiveServerAccount(claims);
    if (!activeCheck.ok) {
      res.status(activeCheck.status).json(activeCheck);
      return;
    }
    const rawAccount = String(req.body?.adAccountId || "").trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (!rawAccount) {
      res.status(400).json({ error: "সঠিক Meta Ad Account ID দিন (যেমন: act_1234567890)।" });
      return;
    }
    const adAccountId = rawAccount.startsWith("act_") ? rawAccount : `act_${rawAccount}`;
    const allowedPresets = new Set(["today", "yesterday", "last_7d", "last_30d", "this_month"]);
    const datePreset = allowedPresets.has(String(req.body?.datePreset)) ? String(req.body.datePreset) : "today";
    const token = (typeof req.body?.metaToken === "string" && req.body.metaToken.trim()) || process.env.META_ACCESS_TOKEN || "";
    if (!token) {
      res.status(400).json({ error: "Meta API Access Token সেট নেই। Settings বা Secrets-এ META_ACCESS_TOKEN দিন।" });
      return;
    }

    try {
      const url = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(adAccountId)}/insights`);
      url.searchParams.set("level", "campaign");
      url.searchParams.set("date_preset", datePreset);
      url.searchParams.set("fields", "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values,date_start,date_stop");
      url.searchParams.set("limit", "25");
      url.searchParams.set("access_token", token);

      const fbRes = await fetch(url.toString(), { method: "GET" });
      const data = await fbRes.json() as { data?: Array<Record<string, unknown>>; error?: { message?: string } };
      if (!fbRes.ok || data.error) {
        res.status(fbRes.status >= 400 ? fbRes.status : 502).json({ error: data.error?.message || "Meta Graph API error" });
        return;
      }
      const rows = (data.data || []).map((r) => {
        const actions = Array.isArray(r.actions) ? r.actions as Array<{ action_type?: string; value?: string }> : [];
        const vals = Array.isArray(r.action_values) ? r.action_values as Array<{ action_type?: string; value?: string }> : [];
        const conv = actions.find((a) => /purchase|lead|messaging_conversation_started/i.test(String(a.action_type || "")));
        const rev = vals.find((v) => /purchase|omni_purchase/i.test(String(v.action_type || "")));
        return {
          campaignId: String(r.campaign_id || ""),
          campaignName: String(r.campaign_name || "Meta Campaign"),
          spend: Number(r.spend || 0),
          impressions: Number(r.impressions || 0),
          clicks: Number(r.clicks || 0),
          results: Number(conv?.value || 0),
          revenueUsd: Number(rev?.value || 0),
          dateStart: String(r.date_start || ""),
          dateStop: String(r.date_stop || ""),
        };
      });
      res.json({ ok: true, adAccountId, datePreset, rows });
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : "Meta API সংযোগ ব্যর্থ।" });
    }
  });

  // SSRF-Protected Server-Side WhatsApp Gateway Relay
  app.post("/api/wa/send", async (req, res) => {
    const claims = extractBearer(req);
    if (!claims) {
      res.status(401).json({ error: "অনুমতি নেই।" });
      return;
    }
    const activeCheck = verifyActiveServerAccount(claims);
    if (!activeCheck.ok) {
      res.status(activeCheck.status).json(activeCheck);
      return;
    }
    const targetUrl = isSafeExternalHttpsUrl(String(req.body?.apiUrl || ""));
    if (!targetUrl) {
      res.status(400).json({ error: "শুধুমাত্র নিরাপদ পাবলিক HTTPS WhatsApp Gateway URL অনুমোদিত।" });
      return;
    }
    const to = String(req.body?.to || "").replace(/[^\d+]/g, "").slice(0, 22);
    const body = String(req.body?.message || "").trim().slice(0, 2000);
    const token = String(req.body?.token || "").trim();
    if (!to || !body) {
      res.status(400).json({ error: "প্রাপকের নম্বর ও মেসেজ দিন।" });
      return;
    }
    try {
      const gwRes = await fetch(targetUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ to, body, token }),
      });
      res.json({ ok: gwRes.ok, status: gwRes.status });
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : "WhatsApp Gateway ত্রুটি।" });
    }
  });

  // Automated Payment Gateway Webhook (bKash / Nagad / SSLCommerz / SMS Forwarder)
  app.post("/api/webhooks/payment", (req, res) => {
    const expectedSecret = getActiveWebhookSecret();
    const provided = String(req.headers["x-webhook-secret"] || req.headers["x-api-key"] || "").trim();
    if (!provided || !timingSafeStrEqual(provided, expectedSecret)) {
      res.status(401).json({ error: "Invalid or missing x-webhook-secret header." });
      return;
    }
    const rawSms = String(
      req.body?.message ?? req.body?.text ?? req.body?.content ?? req.body?.msg ?? req.body?.body ?? req.body?.sms ?? ""
    ).trim().slice(0, 600);
    const smsSenderHint = String(req.body?.from || req.body?.sender || "").trim();

    let trxId = String(req.body?.trxId || req.body?.transaction_id || "").trim().slice(0, 60);
    let amount = Number(req.body?.amount || 0);
    let method = String(req.body?.method || req.body?.gateway || req.body?.provider || "").trim().slice(0, 30);
    let senderPhone = String(req.body?.senderPhone || req.body?.phone || "").trim().slice(0, 30);

    if (rawSms && (!trxId || !(amount > 0))) {
      const looksIncoming = /received|money\s+received|cash[-\s]?in|payment\s+received/i.test(rawSms);
      if (looksIncoming) {
        if (!trxId) {
          const txMatch = rawSms.match(/(?:Trx\s*ID|Txn\s*ID|Transaction\s*ID|TrxId|TxnId)\s*[:#-]?\s*([A-Z0-9]{6,30})/i);
          if (txMatch?.[1]) trxId = txMatch[1].trim().slice(0, 60);
        }
        if (!(amount > 0)) {
          const amtMatch = rawSms.match(/(?:Amount\s*[:#-]?\s*)?(?:Tk|BDT|৳)\.?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
          if (amtMatch?.[1]) amount = Number(amtMatch[1].replace(/,/g, ""));
        }
        if (!senderPhone) {
          const phMatch = rawSms.match(/(?:from|Sender)\s*[:#-]?\s*(\+?8801[3-9]\d{8}|01[3-9]\d{8})/i);
          if (phMatch?.[1]) senderPhone = phMatch[1].trim();
        }
      }
    }
    if (!method) {
      const hintText = `${smsSenderHint} ${rawSms}`;
      if (/nagad/i.test(hintText)) method = "Nagad";
      else if (/rocket|dbbl/i.test(hintText)) method = "Rocket";
      else method = "bKash";
    }
    const customerName = String(req.body?.customerName || req.body?.name || "Gateway Client").trim().slice(0, 80);
    const note = String(req.body?.note || (rawSms ? rawSms.slice(0, 200) : "Automated Gateway Webhook")).trim().slice(0, 200);
    if (!trxId || !(amount > 0)) {
      res.status(400).json({ error: "trxId and positive amount are required." });
      return;
    }
    if (workspaceStore.webhookPayments.some((p) => p.trxId.toLowerCase() === trxId.toLowerCase())) {
      res.json({ ok: true, duplicate: true });
      return;
    }
    const item: WebhookPaymentItem = {
      id: `wh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      trxId,
      amount,
      method,
      senderPhone,
      customerName,
      note,
      source: "verified_gateway",
      status: "verified",
      ts: Date.now(),
      time: new Date().toLocaleString("bn-BD"),
    };
    workspaceStore.webhookPayments.unshift(item);
    workspaceStore.webhookPayments = workspaceStore.webhookPayments.slice(0, 120);

    const autoMatch = tryAutoActivateFromVerifiedPayment(item, {
      username: typeof req.body?.username === "string" ? req.body.username : undefined,
      userId: typeof req.body?.userId === "string" ? req.body.userId : undefined,
      planKey: typeof req.body?.planKey === "string" ? req.body.planKey : undefined,
      subscriptionRequestId: typeof req.body?.subscriptionRequestId === "string" ? req.body.subscriptionRequestId : undefined,
    });
    persistWorkspaceStore();
    res.json({
      ok: true,
      payment: item,
      autoActivatedSubscription: autoMatch.matched,
      subscriptionRequest: autoMatch.request || null,
    });
  });

  app.get("/api/webhooks/payment", (req, res) => {
    const claims = extractBearer(req);
    if (!claims || (claims.role !== "super_admin" && claims.role !== "admin")) {
      res.status(403).json({ error: "শুধু অ্যাডমিন ওয়েবহুক পেমেন্ট দেখতে পারবেন।" });
      return;
    }
    res.json({ ok: true, payments: workspaceStore.webhookPayments });
  });

  app.post("/api/webhooks/payment/simulate", (req, res) => {
    const claims = extractBearer(req);
    if (!claims || claims.role !== "super_admin") {
      res.status(403).json({ error: "শুধু সুপার অ্যাডমিন টেস্ট ওয়েবহুক চালাতে পারবেন।" });
      return;
    }
    const method = String(req.body?.method || "bKash").slice(0, 25);
    const amount = Math.max(1, Number(req.body?.amount) || 5000);
    const customerName = String(req.body?.customerName || "Demo Client").slice(0, 80);
    const senderPhone = String(req.body?.senderPhone || "01700000000").slice(0, 30);
    const reqTrx = typeof req.body?.trxId === "string" ? req.body.trxId.trim().slice(0, 60) : "";
    const trxId = reqTrx || `${method.slice(0, 2).toUpperCase()}${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const item: WebhookPaymentItem = {
      id: `wh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      trxId,
      amount,
      method,
      senderPhone,
      customerName,
      note: `Auto-Verified ${method} Webhook`,
      source: "simulated_test",
      status: "verified",
      ts: Date.now(),
      time: new Date().toLocaleString("bn-BD"),
    };
    workspaceStore.webhookPayments.unshift(item);
    workspaceStore.webhookPayments = workspaceStore.webhookPayments.slice(0, 120);
    const autoMatch = tryAutoActivateFromVerifiedPayment(item, {
      username: typeof req.body?.username === "string" ? req.body.username : undefined,
      userId: typeof req.body?.userId === "string" ? req.body.userId : undefined,
      planKey: typeof req.body?.planKey === "string" ? req.body.planKey : undefined,
      subscriptionRequestId: typeof req.body?.subscriptionRequestId === "string" ? req.body.subscriptionRequestId : undefined,
    });
    persistWorkspaceStore();
    res.json({ ok: true, payment: item, autoActivatedSubscription: autoMatch.matched, subscriptionRequest: autoMatch.request || null });
  });

  app.post("/api/webhooks/payment/claim", (req, res) => {
    const claims = extractBearer(req);
    if (!claims || (claims.role !== "super_admin" && claims.role !== "admin")) {
      res.status(403).json({ error: "অনুমতি নেই।" });
      return;
    }
    const id = String(req.body?.id || "");
    const item = workspaceStore.webhookPayments.find((p) => p.id === id);
    if (!item) {
      res.status(404).json({ error: "পেমেন্ট পাওয়া যায়নি।" });
      return;
    }
    if (item.status === "claimed") {
      res.status(409).json({ error: "এই TrxID ইতিমধ্যেই হিসাবে জমা করা হয়েছে।" });
      return;
    }
    item.status = "claimed";
    item.claimedAt = Date.now();
    item.claimedBy = claims.username;
    persistWorkspaceStore();
    res.json({ ok: true, payment: item });
  });

  app.get("/api/community", (req, res) => {
    const claims = extractBearer(req);
    if (!claims) {
      res.status(401).json({ error: "সেশন অনুমোদিত নয়।" });
      return;
    }
    const activeCheck = verifyActiveServerAccount(claims);
    if (!activeCheck.ok) {
      res.status(activeCheck.status).json(activeCheck);
      return;
    }
    res.json(communityStore);
  });

  app.post("/api/tts", async (req, res) => {
    try {
      const ai = getAiClient();
      if (!ai) {
        res.status(503).json({ error: "GEMINI_API_KEY is not configured in Secrets." });
        return;
      }
      const rawText = typeof req.body?.text === "string" ? req.body.text.trim() : "";
      if (!rawText) {
        res.status(400).json({ error: "Text is required for speech synthesis." });
        return;
      }
      const text = rawText.slice(0, 2000);
      const requestedVoice = typeof req.body?.voiceName === "string" ? req.body.voiceName.trim() : "Kore";
      const voiceName = ALLOWED_VOICES.has(requestedVoice) ? requestedVoice : "Kore";
      const style = typeof req.body?.style === "string" ? req.body.style.trim().slice(0, 180) : "";

      const model = style ? "gemini-3.8-flash-tts" : "gemini-3.8-flash-lite-tts";
      const part: { text: string; speechMetadata?: { style: string } } = { text };
      if (style) part.speechMetadata = { style };

      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [part] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: "No audio returned by Gemini TTS model." });
        return;
      }
      res.json({ audioBase64: base64Audio, mimeType: "audio/wav", model, voiceName });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate AI voice.";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/ai-script", async (req, res) => {
    try {
      const ai = getAiClient();
      if (!ai) {
        res.status(503).json({ error: "GEMINI_API_KEY is not configured in Secrets." });
        return;
      }
      const brand = typeof req.body?.brand === "string" ? req.body.brand.trim().slice(0, 100) : "Ads Park BD (এডস পার্ক বিডি)";
      const offer = typeof req.body?.offer === "string" ? req.body.offer.trim().slice(0, 400) : "Meta, Google ও TikTok অ্যাডস সার্ভিস";
      const phone = typeof req.body?.phone === "string" ? req.body.phone.trim().slice(0, 40) : "01XXX-XXXXXX";

      const makeReq = (modelName: string) => ai.models.generateContent({
        model: modelName,
        contents: `Create a high-converting 4-scene Bengali Facebook Reels promotional video storyboard for brand "${brand}", offer/topic: "${offer}", contact: "${phone}". Keep headlines concise (2 short lines separated by \\n), impactful subtitles (2-3 short lines), strong CTA, and natural spoken Bengali voiceText.`,
        config: {
          systemInstruction: "You are a senior Bangladeshi digital marketing ad creative director. Output clean JSON matching the schema.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                dur: { type: Type.NUMBER },
                kicker: { type: Type.STRING },
                headline: { type: Type.STRING },
                sub: { type: Type.STRING },
                cta: { type: Type.STRING },
                voiceText: { type: Type.STRING },
                anim: { type: Type.STRING },
                trans: { type: Type.STRING },
                bg1: { type: Type.STRING },
                bg2: { type: Type.STRING },
                accent: { type: Type.STRING },
              },
            },
          },
        },
      });

      let response;
      try {
        response = await makeReq("gemini-4-hydrogen");
      } catch (e: unknown) {
        const emsg = e instanceof Error ? e.message : String(e);
        if (emsg.includes("503") || emsg.includes("UNAVAILABLE")) {
          response = await makeReq("gemini-3.1-flash-lite");
        } else {
          throw e;
        }
      }

      const raw = (response.text ?? "[]").trim();
      const parsed = JSON.parse(raw);
      res.json({ scenes: Array.isArray(parsed) ? parsed : [] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate AI script.";
      if (msg.includes("503") || msg.includes("UNAVAILABLE")) {
        res.status(503).json({ error: "সার্ভার এখন সাময়িকভাবে ব্যস্ত আছে, কয়েক সেকেন্ড পর আবার চেষ্টা করুন।" });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/ai-caption", async (req, res) => {
    try {
      const ai = getAiClient();
      if (!ai) {
        res.status(503).json({ error: "GEMINI_API_KEY is not configured in Secrets." });
        return;
      }
      const brand = typeof req.body?.brand === "string" ? req.body.brand.trim().slice(0, 120) : "Brand";
      const product = typeof req.body?.product === "string" ? req.body.product.trim().slice(0, 300) : "Product / Service";
      const offer = typeof req.body?.offer === "string" ? req.body.offer.trim().slice(0, 200) : "";
      const platform = typeof req.body?.platform === "string" ? req.body.platform.trim().slice(0, 40) : "Meta Ads";
      const tone = typeof req.body?.tone === "string" ? req.body.tone.trim().slice(0, 60) : "Urgent & Persuasive Bengali";
      const phone = typeof req.body?.phone === "string" ? req.body.phone.trim().slice(0, 40) : "";

      const promptText = [
        `Generate high-converting Bangladeshi digital marketing ad creative copy for:`,
        `- Brand/Page: ${brand}`,
        `- Product/Service: ${product}`,
        offer ? `- Offer/Discount: ${offer}` : "",
        `- Platform: ${platform}`,
        `- Tone/Language: ${tone}`,
        phone ? `- Contact/CTA Phone: ${phone}` : "",
        `Return JSON with: 3 attention-grabbing hooks, a ready-to-post Bengali/mixed primary ad caption with bullets and CTA, 6 relevant hashtags, a 30-second Reels voiceover script, and concise posterHeadline (max 2 short lines), posterSubhead, and posterCta for poster canvas.`
      ].filter(Boolean).join("\n");

      const makeCaptionReq = (modelName: string) => ai.models.generateContent({
        model: modelName,
        contents: promptText,
        config: {
          systemInstruction: "You are a senior Bangladeshi performance marketing copywriter. Produce high-CTR Meta, Google & TikTok ad copy tailored for Bangladesh audience.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hooks: { type: Type.ARRAY, items: { type: Type.STRING } },
              caption: { type: Type.STRING },
              hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
              voiceScript: { type: Type.STRING },
              posterHeadline: { type: Type.STRING },
              posterSubhead: { type: Type.STRING },
              posterCta: { type: Type.STRING },
            },
          },
        },
      });

      let response;
      try {
        response = await makeCaptionReq("gemini-4-hydrogen");
      } catch (e: unknown) {
        const emsg = e instanceof Error ? e.message : String(e);
        if (emsg.includes("503") || emsg.includes("UNAVAILABLE")) {
          response = await makeCaptionReq("gemini-3.1-flash-lite");
        } else {
          throw e;
        }
      }

      const parsed = JSON.parse((response.text ?? "{}").trim());
      res.json(parsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate AI ad copy.";
      if (msg.includes("503") || msg.includes("UNAVAILABLE")) {
        res.status(503).json({ error: "AI সার্ভার এখন সাময়িকভাবে ব্যস্ত আছে, কয়েক সেকেন্ড পর আবার চেষ্টা করুন।" });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/community/action", (req, res) => {
    const claims = extractBearer(req);
    if (!claims) {
      res.status(401).json({ error: "কমিউনিটি অ্যাকশনের জন্য লগইন সেশন প্রয়োজন।" });
      return;
    }
    const activeCheck = verifyActiveServerAccount(claims);
    if (!activeCheck.ok) {
      res.status(activeCheck.status).json(activeCheck);
      return;
    }
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const actor = (body.actor && typeof body.actor === "object" ? body.actor : {}) as Record<string, unknown>;
    const actorUsername = claims.username.toLowerCase();
    const actorName = String(actor.name || claims.name || claims.username || "User").trim().slice(0, 60);
    const actorRole = claims.role;
    const actorId = claims.id;
    const actorPic = String(actor.pic || "").slice(0, 200000);
    const isActorSuper = actorRole === "super_admin";
    const isActorAdmin = isActorSuper || actorRole === "admin";
    const now = Date.now();
    const nowStr = new Date(now).toLocaleString("bn-BD");
    const mkId = () => `${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const pushNotif = (toUsername: string, kind: string, text: string, postId = "") => {
      const target = String(toUsername || "").trim().toLowerCase();
      if (!target || target === actorUsername) return;
      communityStore.notifications.unshift({
        id: mkId(),
        toUsername: target,
        kind,
        text: text.slice(0, 180),
        fromName: actorName,
        fromUsername: actorUsername,
        postId,
        read: false,
        ts: now,
        time: nowStr,
      });
      communityStore.notifications = communityStore.notifications.slice(0, 200);
    };

    const checkMute = (): string | null => {
      if (isActorSuper || !actorUsername) return null;
      const m = communityStore.moderation.mutedUsers[actorUsername];
      if (!m) return null;
      if (m.until > 0 && now > m.until) {
        delete communityStore.moderation.mutedUsers[actorUsername];
        persistCommunityStore();
        return null;
      }
      return m.reason || "সুপার অ্যাডমিন আপনার পোস্ট/চ্যাট সাময়িকভাবে বন্ধ রেখেছেন।";
    };

    const checkTextModeration = (txt: string, contextLabel: string): string | null => {
      if (isActorSuper) return null;
      const hit = findBadWord(txt, communityStore.moderation.badWords);
      if (!hit) return null;
      communityStore.moderation.reports.unshift({
        id: mkId(),
        itemType: "auto_filter",
        postId: "",
        commentId: "",
        msgId: "",
        targetUsername: actorUsername,
        targetName: actorName,
        reason: `বাজে শব্দ অটো-ফিল্টার ("${hit}")`,
        reportedBy: "System Auto-Guard",
        snippet: `${contextLabel}: ${txt.slice(0, 140)}`,
        ts: now,
        time: nowStr,
        status: "open",
      });
      communityStore.moderation.reports = communityStore.moderation.reports.slice(0, 120);
      persistCommunityStore();
      broadcastCommunity();
      return `⚠️ অশালীন/বাজে শব্দ ব্যবহার নিষিদ্ধ! অনুগ্রহ করে শালীন ভাষা ব্যবহার করুন।`;
    };

    if (action === "create_post") {
      if (communityStore.moderation.feedFrozen && !isActorSuper) { res.status(403).json({ error: "🧊 সুপার অ্যাডমিন বর্তমানে ফিড ও পোস্ট সাময়িকভাবে ফ্রিজ করে রেখেছেন।" }); return; }
      const muteErr = checkMute();
      if (muteErr) { res.status(403).json({ error: `🔇 আপনি মিউট আছেন: ${muteErr}` }); return; }
      const content = String(body.content || "").trim().slice(0, 3000);
      const imageData = String(body.imageData || "").slice(0, 900000);
      if (!content && !imageData) { res.status(400).json({ error: "পোস্টের লেখা বা ছবি দিন।" }); return; }
      const badErr = checkTextModeration(content, "নিউজ ফিড পোস্ট");
      if (badErr) { res.status(400).json({ error: badErr }); return; }

      const rawPoll = body.poll && typeof body.poll === "object" ? (body.poll as Record<string, unknown>) : null;
      let poll: CommunityPost["poll"] = null;
      if (rawPoll && typeof rawPoll.question === "string" && rawPoll.question.trim() && Array.isArray(rawPoll.options)) {
        const opts = rawPoll.options
          .map((o) => String(o || "").trim().slice(0, 80))
          .filter(Boolean)
          .slice(0, 4)
          .map((label, idx) => ({ id: `opt_${idx}_${mkId()}`, label, votes: [] }));
        if (opts.length >= 2) poll = { question: rawPoll.question.trim().slice(0, 160), options: opts };
      }

      const post: CommunityPost = {
        id: typeof body.id === "string" && body.id ? body.id : mkId(),
        authorId: actorId,
        authorName: actorName,
        authorUsername: actorUsername,
        authorRole: actorRole,
        authorPic: actorPic,
        tag: String(body.tag || "🚀 কাজের আপডেট").slice(0, 40),
        platform: String(body.platform || "").slice(0, 30),
        workTitle: String(body.workTitle || "").slice(0, 100),
        feeling: String(body.feeling || "").slice(0, 50),
        bgStyle: String(body.bgStyle || "").slice(0, 40),
        content,
        imageData,
        poll,
        reactions: {},
        comments: [],
        shares: 0,
        pinned: Boolean(body.official && isActorSuper),
        official: Boolean(body.official && isActorSuper),
        commentsLocked: false,
        createdAt: now,
        updatedAt: now,
        time: nowStr,
      };
      communityStore.posts.unshift(post);
      communityStore.posts = communityStore.posts.slice(0, 200);
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, post, community: communityStore });
      return;
    }

    if (action === "edit_post") {
      const post = communityStore.posts.find((p) => p.id === body.postId);
      if (!post) { res.status(404).json({ error: "পোস্ট পাওয়া যায়নি।" }); return; }
      if (!isActorSuper && post.authorUsername !== actorUsername) { res.status(403).json({ error: "অনুমতি নেই।" }); return; }
      const content = String(body.content || "").trim().slice(0, 3000);
      if (!content) { res.status(400).json({ error: "পোস্ট খালি রাখা যাবে না।" }); return; }
      const badErr = checkTextModeration(content, "পোস্ট এডিট");
      if (badErr) { res.status(400).json({ error: badErr }); return; }
      post.content = content;
      post.editedAt = now;
      post.updatedAt = now;
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "delete_post") {
      const post = communityStore.posts.find((p) => p.id === body.postId);
      if (!post) { res.status(404).json({ error: "পোস্ট পাওয়া যায়নি।" }); return; }
      if (!isActorSuper && post.authorUsername !== actorUsername) { res.status(403).json({ error: "অনুমতি নেই।" }); return; }
      communityStore.posts = communityStore.posts.filter((p) => p.id !== body.postId);
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "pin_post") {
      if (!isActorAdmin) { res.status(403).json({ error: "শুধু অ্যাডমিন বা সুপার অ্যাডমিন পিন করতে পারবেন।" }); return; }
      const post = communityStore.posts.find((p) => p.id === body.postId);
      if (!post) { res.status(404).json({ error: "পোস্ট পাওয়া যায়নি।" }); return; }
      post.pinned = !post.pinned;
      post.updatedAt = now;
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "lock_post") {
      if (!isActorSuper) { res.status(403).json({ error: "শুধু সুপার অ্যাডমিন কমেন্ট লক/আনলক করতে পারবেন।" }); return; }
      const post = communityStore.posts.find((p) => p.id === body.postId);
      if (!post) { res.status(404).json({ error: "পোস্ট পাওয়া যায়নি।" }); return; }
      post.commentsLocked = !post.commentsLocked;
      post.updatedAt = now;
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "mark_official") {
      if (!isActorSuper) { res.status(403).json({ error: "শুধু সুপার অ্যাডমিন অফিশিয়াল ঘোষণা দিতে পারবেন।" }); return; }
      const post = communityStore.posts.find((p) => p.id === body.postId);
      if (!post) { res.status(404).json({ error: "পোস্ট পাওয়া যায়নি।" }); return; }
      post.official = !post.official;
      if (post.official) post.pinned = true;
      post.updatedAt = now;
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "share_post") {
      if (communityStore.moderation.feedFrozen && !isActorSuper) { res.status(403).json({ error: "🧊 ফিড বর্তমানে ফ্রিজ করা আছে।" }); return; }
      const muteErr = checkMute();
      if (muteErr) { res.status(403).json({ error: `🔇 আপনি মিউট আছেন: ${muteErr}` }); return; }
      const orig = communityStore.posts.find((p) => p.id === body.postId);
      if (!orig) { res.status(404).json({ error: "পোস্ট পাওয়া যায়নি।" }); return; }
      const note = String(body.note || "").trim().slice(0, 1500);
      if (note) {
        const badErr = checkTextModeration(note, "পোস্ট শেয়ার");
        if (badErr) { res.status(400).json({ error: badErr }); return; }
      }
      orig.shares = (orig.shares || 0) + 1;
      const sharedPost: CommunityPost = {
        id: mkId(),
        authorId: actorId,
        authorName: actorName,
        authorUsername: actorUsername,
        authorRole: actorRole,
        authorPic: actorPic,
        tag: "↗️ শেয়ার্ড পোস্ট",
        platform: orig.platform || "",
        workTitle: "",
        feeling: "",
        bgStyle: "",
        content: note,
        imageData: "",
        poll: null,
        reactions: {},
        comments: [],
        shares: 0,
        sharedFrom: {
          id: orig.id,
          authorName: orig.authorName,
          authorUsername: orig.authorUsername,
          content: orig.content,
          imageData: orig.imageData || "",
          time: orig.time,
        },
        pinned: false,
        createdAt: now,
        updatedAt: now,
        time: nowStr,
      };
      communityStore.posts.unshift(sharedPost);
      communityStore.posts = communityStore.posts.slice(0, 200);
      pushNotif(orig.authorUsername, "share", `${actorName} আপনার পোস্টটি নিউজ ফিডে শেয়ার করেছেন`, orig.id);
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, post: sharedPost, community: communityStore });
      return;
    }

    if (action === "react_post") {
      const post = communityStore.posts.find((p) => p.id === body.postId);
      if (!post) { res.status(404).json({ error: "পোস্ট পাওয়া যায়নি।" }); return; }
      const emoji = String(body.emoji || "👍").slice(0, 8);
      const userKey = actorUsername || actorId;
      post.reactions = post.reactions || {};
      const alreadySame = Array.isArray(post.reactions[emoji]) && post.reactions[emoji].includes(userKey);
      // Facebook-style: remove previous reaction from this user across all emojis, then toggle clicked emoji
      Object.keys(post.reactions).forEach((em) => {
        if (!Array.isArray(post.reactions[em])) { delete post.reactions[em]; return; }
        post.reactions[em] = post.reactions[em].filter((u) => u !== userKey);
        if (!post.reactions[em].length) delete post.reactions[em];
      });
      if (!alreadySame) {
        post.reactions[emoji] = [...(post.reactions[emoji] || []), userKey];
        pushNotif(post.authorUsername, "like", `${actorName} আপনার পোস্টে ${emoji} রিঅ্যাকশন দিয়েছেন`, post.id);
      }
      post.updatedAt = now;
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "vote_poll") {
      const post = communityStore.posts.find((p) => p.id === body.postId);
      if (!post?.poll) { res.status(404).json({ error: "পোল পাওয়া যায়নি।" }); return; }
      const userKey = actorUsername || actorId;
      post.poll.options.forEach((opt) => {
        opt.votes = (opt.votes || []).filter((u) => u !== userKey);
        if (opt.id === body.optionId) opt.votes.push(userKey);
      });
      post.updatedAt = now;
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "add_comment") {
      if (communityStore.moderation.feedFrozen && !isActorSuper) { res.status(403).json({ error: "🧊 ফিড বর্তমানে ফ্রিজ করা আছে।" }); return; }
      const muteErr = checkMute();
      if (muteErr) { res.status(403).json({ error: `🔇 আপনি মিউট আছেন: ${muteErr}` }); return; }
      const post = communityStore.posts.find((p) => p.id === body.postId);
      if (!post) { res.status(404).json({ error: "পোস্ট পাওয়া যায়নি।" }); return; }
      if (post.commentsLocked && !isActorSuper) { res.status(403).json({ error: "🔒 এই পোস্টের কমেন্ট সেকশন লক করা আছে।" }); return; }
      const text = String(body.text || "").trim().slice(0, 1200);
      if (!text) { res.status(400).json({ error: "কমেন্ট লিখুন।" }); return; }
      const badErr = checkTextModeration(text, "কমেন্ট");
      if (badErr) { res.status(400).json({ error: badErr }); return; }
      post.comments = post.comments || [];
      post.comments.push({
        id: mkId(),
        authorId: actorId,
        authorName: actorName,
        authorUsername: actorUsername,
        authorRole: actorRole,
        text,
        likes: [],
        replies: [],
        createdAt: now,
        time: nowStr,
      });
      pushNotif(post.authorUsername, "comment", `${actorName} আপনার পোস্টে কমেন্ট করেছেন: "${text.slice(0, 50)}"`, post.id);
      post.updatedAt = now;
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "add_reply") {
      if (communityStore.moderation.feedFrozen && !isActorSuper) { res.status(403).json({ error: "🧊 ফিড বর্তমানে ফ্রিজ করা আছে।" }); return; }
      const muteErr = checkMute();
      if (muteErr) { res.status(403).json({ error: `🔇 আপনি মিউট আছেন: ${muteErr}` }); return; }
      const post = communityStore.posts.find((p) => p.id === body.postId);
      const comment = post?.comments?.find((c) => c.id === body.commentId);
      if (!post || !comment) { res.status(404).json({ error: "কমেন্ট পাওয়া যায়নি।" }); return; }
      if (post.commentsLocked && !isActorSuper) { res.status(403).json({ error: "🔒 এই পোস্টের কমেন্ট সেকশন লক করা আছে।" }); return; }
      const text = String(body.text || "").trim().slice(0, 1000);
      if (!text) { res.status(400).json({ error: "রিপ্লাই লিখুন।" }); return; }
      const badErr = checkTextModeration(text, "রিপ্লাই");
      if (badErr) { res.status(400).json({ error: badErr }); return; }
      comment.replies = comment.replies || [];
      comment.replies.push({
        id: mkId(),
        authorId: actorId,
        authorName: actorName,
        authorUsername: actorUsername,
        authorRole: actorRole,
        text,
        createdAt: now,
        time: nowStr,
      });
      pushNotif(comment.authorUsername, "reply", `${actorName} আপনার কমেন্টে রিপ্লাই দিয়েছেন: "${text.slice(0, 50)}"`, post.id);
      post.updatedAt = now;
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "like_comment") {
      const post = communityStore.posts.find((p) => p.id === body.postId);
      const comment = post?.comments?.find((c) => c.id === body.commentId);
      if (!post || !comment) { res.status(404).json({ error: "কমেন্ট পাওয়া যায়নি।" }); return; }
      const userKey = actorUsername || actorId;
      comment.likes = comment.likes || [];
      comment.likes = comment.likes.includes(userKey) ? comment.likes.filter((u) => u !== userKey) : [...comment.likes, userKey];
      post.updatedAt = now;
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "delete_comment") {
      const post = communityStore.posts.find((p) => p.id === body.postId);
      if (!post) { res.status(404).json({ error: "পোস্ট পাওয়া যায়নি।" }); return; }
      const comment = post.comments?.find((c) => c.id === body.commentId);
      if (!comment) { res.status(404).json({ error: "কমেন্ট পাওয়া যায়নি।" }); return; }
      if (!isActorSuper && comment.authorUsername !== actorUsername) { res.status(403).json({ error: "অনুমতি নেই।" }); return; }
      post.comments = post.comments.filter((c) => c.id !== body.commentId);
      post.updatedAt = now;
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "delete_reply") {
      const post = communityStore.posts.find((p) => p.id === body.postId);
      const comment = post?.comments?.find((c) => c.id === body.commentId);
      const reply = comment?.replies?.find((r) => r.id === body.replyId);
      if (!post || !comment || !reply) { res.status(404).json({ error: "রিপ্লাই পাওয়া যায়নি।" }); return; }
      if (!isActorSuper && reply.authorUsername !== actorUsername) { res.status(403).json({ error: "অনুমতি নেই।" }); return; }
      comment.replies = comment.replies.filter((r) => r.id !== body.replyId);
      post.updatedAt = now;
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "send_chat") {
      if (communityStore.moderation.feedFrozen && !isActorSuper) { res.status(403).json({ error: "🧊 সুপার অ্যাডমিন বর্তমানে ফিড ও টিম চ্যাট ফ্রিজ করে রেখেছেন।" }); return; }
      const muteErr = checkMute();
      if (muteErr) { res.status(403).json({ error: `🔇 আপনি মিউট আছেন: ${muteErr}` }); return; }
      const text = String(body.text || "").trim().slice(0, 2000);
      const fileData = typeof body.fileData === "string" ? body.fileData.slice(0, 900000) : "";
      const audioData = typeof body.audioData === "string" ? body.audioData.slice(0, 900000) : "";
      if (!text && !fileData && !audioData) { res.status(400).json({ error: "মেসেজ বা ভয়েস দিন।" }); return; }
      const badErr = checkTextModeration(text, "টিম চ্যাট");
      if (badErr) { res.status(400).json({ error: badErr }); return; }

      const msgObj: TeamChatMessage = {
        id: typeof body.id === "string" && body.id ? body.id : mkId(),
        sender: actorName,
        role: actorRole,
        username: actorUsername,
        authorId: actorId,
        text,
        tag: String(body.tag || "").slice(0, 30),
        replyTo: body.replyTo && typeof body.replyTo === "object" ? (body.replyTo as TeamChatMessage["replyTo"]) : null,
        pinned: false,
        reactions: {},
        fileData: fileData || undefined,
        fileName: typeof body.fileName === "string" ? body.fileName.slice(0, 120) : undefined,
        fileType: typeof body.fileType === "string" ? body.fileType.slice(0, 80) : undefined,
        audioData: audioData || undefined,
        audioMime: typeof body.audioMime === "string" ? body.audioMime.slice(0, 60) : undefined,
        audioDuration: Number(body.audioDuration) || undefined,
        time: nowStr,
        ts: now,
      };
      communityStore.chat.push(msgObj);
      communityStore.chat = communityStore.chat.slice(-150);
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, message: msgObj, community: communityStore });
      return;
    }

    if (action === "react_chat") {
      const m = communityStore.chat.find((x) => x.id === body.msgId);
      if (!m) { res.status(404).json({ error: "মেসেজ পাওয়া যায়নি।" }); return; }
      const emoji = String(body.emoji || "👍").slice(0, 8);
      const u = actorUsername || actorId;
      m.reactions = m.reactions || {};
      const arr = Array.isArray(m.reactions[emoji]) ? m.reactions[emoji] : [];
      m.reactions[emoji] = arr.includes(u) ? arr.filter((x) => x !== u) : [...arr, u];
      if (!m.reactions[emoji].length) delete m.reactions[emoji];
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "pin_chat") {
      const m = communityStore.chat.find((x) => x.id === body.msgId);
      if (!m) { res.status(404).json({ error: "মেসেজ পাওয়া যায়নি।" }); return; }
      const nextPin = !m.pinned;
      if (nextPin) communityStore.chat.forEach((x) => { x.pinned = false; });
      m.pinned = nextPin;
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "delete_chat") {
      const m = communityStore.chat.find((x) => x.id === body.msgId);
      if (!m) { res.status(404).json({ error: "মেসেজ পাওয়া যায়নি।" }); return; }
      if (!isActorSuper && m.username !== actorUsername) { res.status(403).json({ error: "অনুমতি নেই।" }); return; }
      communityStore.chat = communityStore.chat.filter((x) => x.id !== body.msgId);
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "clear_chat") {
      if (!isActorSuper) { res.status(403).json({ error: "শুধু সুপার অ্যাডমিন পারবেন।" }); return; }
      communityStore.chat = [];
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "report_item") {
      communityStore.moderation.reports.unshift({
        id: mkId(),
        itemType: String(body.itemType || "post").slice(0, 30),
        postId: String(body.postId || ""),
        commentId: String(body.commentId || ""),
        msgId: String(body.msgId || ""),
        targetUsername: String(body.targetUsername || "").toLowerCase(),
        targetName: String(body.targetName || "User").slice(0, 60),
        reason: String(body.reason || "বাজে শব্দ / নিয়ম ভঙ্গ").slice(0, 200),
        reportedBy: `${actorName} (@${actorUsername || "user"})`,
        snippet: String(body.snippet || "").slice(0, 160),
        ts: now,
        time: nowStr,
        status: "open",
      });
      communityStore.moderation.reports = communityStore.moderation.reports.slice(0, 120);
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "warn_user") {
      if (!isActorSuper) { res.status(403).json({ error: "শুধু সুপার অ্যাডমিন সতর্ক করতে পারবেন।" }); return; }
      const targetUsername = String(body.targetUsername || "").trim().toLowerCase();
      if (!targetUsername || targetUsername === "admin") { res.status(400).json({ error: "সঠিক ইউজার নির্বাচন করুন।" }); return; }
      const reason = String(body.reason || "বাজে শব্দ বা নিয়ম ভঙ্গের জন্য সতর্কবার্তা").trim().slice(0, 250);
      communityStore.moderation.warnings.unshift({
        id: mkId(),
        targetUsername,
        targetName: String(body.targetName || targetUsername).slice(0, 60),
        reason,
        issuedBy: actorName,
        ts: now,
        time: nowStr,
        ack: false,
      });
      if (body.muteHours && Number(body.muteHours) > 0) {
        const hrs = Number(body.muteHours);
        communityStore.moderation.mutedUsers[targetUsername] = {
          until: hrs >= 9999 ? 0 : now + hrs * 3600000,
          reason,
          by: actorName,
        };
      }
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "ack_warning") {
      communityStore.moderation.warnings.forEach((w) => {
        if (w.targetUsername === actorUsername && (!body.warningId || w.id === body.warningId)) {
          w.ack = true;
        }
      });
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "clear_warnings") {
      if (!isActorSuper) { res.status(403).json({ error: "শুধু সুপার অ্যাডমিন পারবেন।" }); return; }
      const t = String(body.targetUsername || "").trim().toLowerCase();
      communityStore.moderation.warnings = communityStore.moderation.warnings.filter((w) => w.targetUsername !== t);
      delete communityStore.moderation.mutedUsers[t];
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "mute_user") {
      if (!isActorSuper) { res.status(403).json({ error: "শুধু সুপার অ্যাডমিন পারবেন।" }); return; }
      const t = String(body.targetUsername || "").trim().toLowerCase();
      if (!t || t === "admin") { res.status(400).json({ error: "সঠিক ইউজার দিন।" }); return; }
      if (body.unmute) {
        delete communityStore.moderation.mutedUsers[t];
      } else {
        const hrs = Number(body.hours) || 24;
        communityStore.moderation.mutedUsers[t] = {
          until: hrs >= 9999 ? 0 : now + hrs * 3600000,
          reason: String(body.reason || "সুপার অ্যাডমিন কর্তৃক মিউট").slice(0, 200),
          by: actorName,
        };
      }
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "set_bad_words") {
      if (!isActorSuper) { res.status(403).json({ error: "শুধু সুপার অ্যাডমিন পারবেন।" }); return; }
      const words = Array.isArray(body.words)
        ? body.words.map((w) => String(w || "").trim().toLowerCase()).filter(Boolean).slice(0, 200)
        : DEFAULT_BAD_WORDS;
      communityStore.moderation.badWords = [...new Set(words)];
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "resolve_report") {
      if (!isActorSuper) { res.status(403).json({ error: "শুধু সুপার অ্যাডমিন পারবেন।" }); return; }
      const rep = communityStore.moderation.reports.find((r) => r.id === body.reportId);
      if (rep) rep.status = "resolved";
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "purge_user_content") {
      if (!isActorSuper) { res.status(403).json({ error: "শুধু সুপার অ্যাডমিন পারবেন।" }); return; }
      const t = String(body.targetUsername || "").trim().toLowerCase();
      if (!t) { res.status(400).json({ error: "ইউজারনেম দিন।" }); return; }
      communityStore.posts = communityStore.posts.filter((p) => p.authorUsername !== t);
      communityStore.posts.forEach((p) => {
        p.comments = (p.comments || []).filter((c) => c.authorUsername !== t);
        p.comments.forEach((c) => {
          c.replies = (c.replies || []).filter((r) => r.authorUsername !== t);
        });
      });
      communityStore.chat = communityStore.chat.filter((m) => m.username !== t);
      communityStore.dms = communityStore.dms.filter((d) => d.fromUsername !== t && d.toUsername !== t);
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "send_dm") {
      const muteErr = checkMute();
      if (muteErr) { res.status(403).json({ error: `🔇 আপনি মিউট আছেন: ${muteErr}` }); return; }
      const toUsername = String(body.toUsername || "").trim().toLowerCase();
      const toName = String(body.toName || toUsername || "User").trim().slice(0, 60);
      if (!toUsername) { res.status(400).json({ error: "প্রাপক ইউজার নির্বাচন করুন।" }); return; }
      const text = String(body.text || "").trim().slice(0, 2000);
      const fileData = typeof body.fileData === "string" ? body.fileData.slice(0, 900000) : "";
      const audioData = typeof body.audioData === "string" ? body.audioData.slice(0, 900000) : "";
      if (!text && !fileData && !audioData) { res.status(400).json({ error: "মেসেজ বা ভয়েস দিন।" }); return; }
      const badErr = checkTextModeration(text, "প্রাইভেট মেসেজ (DM)");
      if (badErr) { res.status(400).json({ error: badErr }); return; }

      const dmObj: DirectMessage = {
        id: typeof body.id === "string" && body.id ? body.id : mkId(),
        fromUsername: actorUsername,
        fromName: actorName,
        fromRole: actorRole,
        toUsername,
        toName,
        text,
        fileData: fileData || undefined,
        fileName: typeof body.fileName === "string" ? body.fileName.slice(0, 120) : undefined,
        fileType: typeof body.fileType === "string" ? body.fileType.slice(0, 80) : undefined,
        audioData: audioData || undefined,
        audioDuration: Number(body.audioDuration) || undefined,
        read: false,
        ts: now,
        time: nowStr,
      };
      communityStore.dms.push(dmObj);
      communityStore.dms = communityStore.dms.slice(-300);
      pushNotif(toUsername, "dm", `✉️ ${actorName} আপনাকে প্রাইভেট মেসেজ পাঠিয়েছেন: "${(text || "🎙️ মিডিয়া").slice(0, 45)}"`);
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, dm: dmObj, community: communityStore });
      return;
    }

    if (action === "mark_dm_read") {
      const peer = String(body.peerUsername || "").trim().toLowerCase();
      communityStore.dms.forEach((d) => {
        if (d.toUsername === actorUsername && (!peer || d.fromUsername === peer)) d.read = true;
      });
      communityStore.notifications.forEach((n) => {
        if (n.toUsername === actorUsername && n.kind === "dm" && (!peer || n.fromUsername === peer)) n.read = true;
      });
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "delete_dm") {
      const d = communityStore.dms.find((x) => x.id === body.dmId);
      if (!d) { res.status(404).json({ error: "মেসেজ পাওয়া যায়নি।" }); return; }
      if (!isActorSuper && d.fromUsername !== actorUsername) { res.status(403).json({ error: "অনুমতি নেই।" }); return; }
      communityStore.dms = communityStore.dms.filter((x) => x.id !== body.dmId);
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "mark_feed_notifs_read") {
      communityStore.notifications.forEach((n) => {
        if (n.toUsername === actorUsername) n.read = true;
      });
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, community: communityStore });
      return;
    }

    if (action === "verify_user") {
      if (!isActorSuper) { res.status(403).json({ error: "শুধু সুপার অ্যাডমিন ভেরিফাইড ব্যাজ দিতে পারবেন।" }); return; }
      const t = String(body.targetUsername || "").trim().toLowerCase();
      if (!t) { res.status(400).json({ error: "সঠিক ইউজারনেম দিন।" }); return; }
      const list = new Set(communityStore.moderation.verifiedUsers || ["admin"]);
      if (list.has(t) && t !== "admin") list.delete(t);
      else list.add(t);
      communityStore.moderation.verifiedUsers = Array.from(list);
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, verified: list.has(t), community: communityStore });
      return;
    }

    if (action === "set_community_freeze") {
      if (!isActorSuper) { res.status(403).json({ error: "শুধু সুপার অ্যাডমিন ফিড ফ্রিজ করতে পারবেন।" }); return; }
      communityStore.moderation.feedFrozen = Boolean(body.frozen);
      persistCommunityStore();
      broadcastCommunity();
      res.json({ ok: true, feedFrozen: communityStore.moderation.feedFrozen, community: communityStore });
      return;
    }

    if (action === "send_broadcast") {
      if (!isActorSuper) { res.status(403).json({ error: "শুধু সুপার অ্যাডমিন ইনস্ট্যান্ট ব্রডকাস্ট করতে পারবেন।" }); return; }
      const text = String(body.text || "").trim().slice(0, 280);
      if (!text) { res.status(400).json({ error: "ব্রডকাস্ট বার্তা লিখুন।" }); return; }
      const bObj = { id: mkId(), text, by: actorName, ts: now, time: nowStr };
      communityStore.moderation.broadcasts = [bObj, ...(communityStore.moderation.broadcasts || [])].slice(0, 30);
      persistCommunityStore();
      broadcastCommunity();
      broadcastTeamEvent({ type: "super_broadcast", broadcast: bObj });
      res.json({ ok: true, broadcast: bObj, community: communityStore });
      return;
    }

    res.status(400).json({ error: "Unknown community action." });
  });

  function parseDeviceLabel(uaRaw: string): string {
    const ua = String(uaRaw || "");
    if (!ua) return "Unknown Device";
    let os = "Desktop";
    if (/android/i.test(ua)) os = "Android";
    else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
    else if (/windows/i.test(ua)) os = "Windows";
    else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
    else if (/linux/i.test(ua)) os = "Linux";
    let browser = "Browser";
    if (/edg\//i.test(ua)) browser = "Edge";
    else if (/opr\//i.test(ua)) browser = "Opera";
    else if (/chrome|crios/i.test(ua)) browser = "Chrome";
    else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
    else if (/safari/i.test(ua)) browser = "Safari";
    else if (/node|curl|undici/i.test(ua)) browser = "API Client";
    return `${os} · ${browser}`;
  }

  function extractClientIp(req: http.IncomingMessage): string {
    const xff = req.headers["x-forwarded-for"];
    const first = Array.isArray(xff) ? xff[0] : String(xff || "").split(",")[0];
    const ip = (first || req.socket?.remoteAddress || "").trim().replace(/^::ffff:/, "");
    return ip || "local";
  }

  let getLiveSessionsSnapshot: () => Record<string, unknown>[] = () => [];
  let forceLogoutMatchingPeers: (opts: { clientId?: string; targetUsername?: string; excludeAdmin?: boolean; reason?: string }) => number = () => 0;

  app.get("/api/sessions", (req, res) => {
    const claims = extractBearer(req);
    if (!claims || claims.role !== "super_admin") {
      res.status(403).json({ error: "শুধু সুপার অ্যাডমিন সেশন তালিকা দেখতে পারবেন।" });
      return;
    }
    res.json({
      ok: true,
      sessions: getLiveSessionsSnapshot(),
      loginAudit: (communityStore.moderation.loginAudit || []).slice(0, 60),
      revokedUsers: communityStore.moderation.revokedUsers || {},
    });
  });

  app.post("/api/sessions/force-logout", (req, res) => {
    const claims = extractBearer(req);
    if (!claims || claims.role !== "super_admin") {
      res.status(403).json({ error: "শুধু সুপার অ্যাডমিন রিমোট সেশন লগআউট করতে পারবেন।" });
      return;
    }
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const clientId = String(body.clientId || "").trim();
    const targetUsername = String(body.targetUsername || "").trim().toLowerCase();
    const excludeAdmin = Boolean(body.excludeAdmin);
    const reason = String(body.reason || "সুপার অ্যাডমিন সিকিউরিটি চেকের জন্য আপনার সেশন লগআউট করেছেন।").trim().slice(0, 220);

    if (!clientId && !targetUsername && !excludeAdmin) {
      res.status(400).json({ error: "সেশন বা ইউজার নির্বাচন করুন।" });
      return;
    }
    const now = Date.now();
    if (targetUsername && targetUsername !== "admin") {
      communityStore.moderation.revokedUsers[targetUsername] = now;
      revokeUserRememberSessions({ username: targetUsername });
    }
    if (excludeAdmin) {
      getLiveSessionsSnapshot().forEach((s) => {
        const u = String(s.username || "").toLowerCase();
        if (u && u !== "admin" && s.role !== "super_admin") {
          communityStore.moderation.revokedUsers[u] = now;
        }
      });
      revokeUserRememberSessions({ excludeAdmin: true });
    }
    const kicked = forceLogoutMatchingPeers({ clientId, targetUsername, excludeAdmin, reason });
    persistCommunityStore();
    res.json({ ok: true, kicked, sessions: getLiveSessionsSnapshot() });
  });

  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir, {
      setHeaders: (res, filePath) => {
        if (/\.(html|js|css)$/i.test(filePath) || path.basename(filePath) === "sw.js") {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        }
      },
    }));
    app.get("/{*path}", (req, res) => {
      const candidate = path.join(distDir, req.path === "/" ? "index.html" : req.path);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        if (/\.(html|js|css)$/i.test(candidate) || path.basename(candidate) === "sw.js") {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        }
        res.sendFile(candidate);
      } else {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        res.sendFile(path.join(distDir, "index.html"));
      }
    });
  }


  const httpServer = http.createServer(app);
  const wssLiveVoice = new WebSocketServer({ noServer: true });
  const wssTeamRoom = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = (request.url || "").split("?")[0];
    if (pathname === "/api/live-voice") {
      wssLiveVoice.handleUpgrade(request, socket, head, (ws) => {
        wssLiveVoice.emit("connection", ws, request);
      });
    } else if (pathname === "/api/team-room") {
      wssTeamRoom.handleUpgrade(request, socket, head, (ws) => {
        wssTeamRoom.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  interface RoomPeer {
    clientId: string;
    name: string;
    username: string;
    role: string;
    ip: string;
    device: string;
    connectedAt: number;
    lastSeen: number;
    loginTs: number;
    inVoice: boolean;
    muted: boolean;
    lastSpeakTs: number;
  }
  const teamPeers = new Map<WebSocket, RoomPeer>();

  const getPublicPeerList = () =>
    Array.from(teamPeers.values()).map((p) => ({
      clientId: p.clientId,
      name: p.name,
      username: p.username,
      role: p.role,
      inVoice: p.inVoice,
      muted: p.muted,
    }));

  getLiveSessionsSnapshot = () =>
    Array.from(teamPeers.values()).map((p) => ({
      clientId: p.clientId,
      name: p.name,
      username: p.username,
      role: p.role,
      ip: p.ip,
      device: p.device,
      connectedAt: p.connectedAt,
      lastSeen: p.lastSeen,
      inVoice: p.inVoice,
    }));

  forceLogoutMatchingPeers = ({ clientId, targetUsername, excludeAdmin, reason }) => {
    let kicked = 0;
    const payload = JSON.stringify({
      type: "force_logout",
      reason: reason || "সুপার অ্যাডমিন আপনার সেশন বাতিল করেছেন।",
    });
    teamPeers.forEach((p, ws) => {
      const matchId = Boolean(clientId && p.clientId === clientId);
      const matchUser = Boolean(targetUsername && p.username === targetUsername);
      const matchBulk = Boolean(excludeAdmin && p.username !== "admin" && p.role !== "super_admin");
      if ((matchId || matchUser || matchBulk) && !(excludeAdmin && p.role === "super_admin")) {
        kicked += 1;
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(payload); } catch { /* ignore */ }
          setTimeout(() => { try { ws.close(4001, "Force Logout"); } catch { /* ignore */ } }, 150);
        }
      }
    });
    return kicked;
  };

  const broadcastTeamJson = (payload: Record<string, unknown>, exclude?: WebSocket) => {
    const raw = JSON.stringify(payload);
    wssTeamRoom.clients.forEach((client) => {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    });
  };

  broadcastCommunity = () => {
    broadcastTeamJson({ type: "community_update", community: communityStore });
  };
  broadcastTeamEvent = (payload: Record<string, unknown>) => {
    broadcastTeamJson(payload);
  };

  wssTeamRoom.on("connection", (ws, request) => {
    const nowInit = Date.now();
    const ip = extractClientIp(request);
    const device = parseDeviceLabel(String(request.headers["user-agent"] || ""));
    const peer: RoomPeer = {
      clientId: `peer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: "User",
      username: "",
      role: "user",
      ip,
      device,
      connectedAt: nowInit,
      lastSeen: nowInit,
      loginTs: nowInit,
      inVoice: false,
      muted: false,
      lastSpeakTs: 0,
    };
    teamPeers.set(ws, peer);

    ws.send(JSON.stringify({
      type: "init",
      clientId: peer.clientId,
      peers: getPublicPeerList(),
      community: communityStore,
      version: cachedPkgVersion,
      buildHash: getAppBuildHash(),
      updateStatus: workspaceStore.liveUpdateStatus,
    }));

    ws.on("message", (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      peer.lastSeen = Date.now();

      if (msg.type === "heartbeat") {
        const revTs = peer.username ? Number(communityStore.moderation.revokedUsers[peer.username] || 0) : 0;
        if (revTs > 0 && peer.loginTs <= revTs && peer.role !== "super_admin") {
          ws.send(JSON.stringify({ type: "force_logout", reason: "সুপার অ্যাডমিন আপনার সেশন লগআউট করেছেন।" }));
        }
        return;
      }

      if (msg.type === "hello") {
        const uName = String(msg.username || "").trim().toLowerCase();
        const uRole = String(msg.role || "user");
        const loginTs = Number(msg.loginTs) || Date.now();
        const revTs = uName ? Number(communityStore.moderation.revokedUsers[uName] || 0) : 0;
        if (uName && revTs > 0 && loginTs <= revTs && uRole !== "super_admin") {
          ws.send(JSON.stringify({ type: "force_logout", reason: "সুপার অ্যাডমিন আপনার সেশন লগআউট করেছেন। পুনরায় লগইন করুন।" }));
          setTimeout(() => { try { ws.close(4001, "Revoked"); } catch { /* ignore */ } }, 150);
          return;
        }
        const prevUser = peer.username;
        peer.name = String(msg.name || "User").slice(0, 50);
        peer.username = uName;
        peer.role = uRole;
        peer.loginTs = loginTs;
        if (uName && uName !== prevUser) {
          communityStore.moderation.loginAudit.unshift({
            id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
            username: uName,
            name: peer.name,
            role: uRole,
            ip: peer.ip,
            device: peer.device,
            ts: Date.now(),
            time: new Date().toLocaleString("bn-BD"),
          });
          communityStore.moderation.loginAudit = communityStore.moderation.loginAudit.slice(0, 100);
          persistCommunityStore();
        }
        broadcastTeamJson({ type: "peers_update", peers: getPublicPeerList() });
        return;
      }

      if (msg.type === "voice_join") {
        peer.name = String(msg.name || peer.name || "User").slice(0, 50);
        peer.username = String(msg.username || peer.username || "").trim().toLowerCase();
        peer.role = String(msg.role || peer.role || "user");
        peer.inVoice = true;
        peer.muted = Boolean(msg.muted);
        broadcastTeamJson({ type: "peers_update", peers: getPublicPeerList() });
        return;
      }

      if (msg.type === "voice_leave") {
        peer.inVoice = false;
        peer.muted = false;
        broadcastTeamJson({ type: "peers_update", peers: getPublicPeerList() });
        return;
      }

      if (msg.type === "voice_mute") {
        peer.muted = Boolean(msg.muted);
        broadcastTeamJson({ type: "peers_update", peers: getPublicPeerList() });
        return;
      }

      if (msg.type === "voice_audio" && peer.inVoice && !peer.muted && typeof msg.data === "string") {
        peer.lastSpeakTs = Date.now();
        const rawOut = JSON.stringify({
          type: "voice_audio",
          senderId: peer.clientId,
          senderName: peer.name,
          senderUsername: peer.username,
          data: msg.data,
        });
        teamPeers.forEach((otherPeer, otherWs) => {
          if (otherWs !== ws && otherPeer.inVoice && otherWs.readyState === WebSocket.OPEN) {
            otherWs.send(rawOut);
          }
        });
        return;
      }

      if (msg.type === "typing") {
        broadcastTeamJson({
          type: "typing",
          senderId: peer.clientId,
          name: peer.name,
          username: peer.username,
          isTyping: Boolean(msg.isTyping),
        }, ws);
      }
    });

    ws.on("close", () => {
      teamPeers.delete(ws);
      broadcastTeamJson({ type: "peers_update", peers: getPublicPeerList() });
    });

    ws.on("error", () => {
      teamPeers.delete(ws);
      broadcastTeamJson({ type: "peers_update", peers: getPublicPeerList() });
    });
  });

  wssLiveVoice.on("connection", (clientWs) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI["live"]["connect"]>> | null = null;
    let sessionReady = false;
    let closedByClient = false;

    const sendJson = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const closeSession = () => {
      closedByClient = true;
      sessionReady = false;
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // ignore close errors
        }
        liveSession = null;
      }
    };

    clientWs.on("message", async (rawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        return;
      }

      if (msg.type === "start") {
        if (liveSession || sessionReady) return;
        const ai = getAiClient();
        if (!ai) {
          sendJson({ type: "error", error: "GEMINI_API_KEY is not configured in Settings > Secrets." });
          return;
        }

        const reqVoice = typeof msg.voiceName === "string" ? msg.voiceName.trim() : "Zephyr";
        const voiceName = ALLOWED_VOICES.has(reqVoice) ? reqVoice : "Zephyr";
        const mode = typeof msg.mode === "string" ? msg.mode.trim() : "partner";
        const agencyContext = typeof msg.agencyContext === "string" ? msg.agencyContext.trim().slice(0, 1500) : "";

        let modePrompt = "Speak naturally, warmly, and concisely in conversational Bengali (with standard digital marketing English terms where natural, e.g., ROAS, CTR, Pixel, Meta Ads) unless the user speaks English, in which case reply in English.";
        if (mode === "bengali") {
          modePrompt = "Always respond in clear, natural spoken Bengali with short conversational sentences.";
        } else if (mode === "english") {
          modePrompt = "Always respond in clear, natural spoken English with short conversational sentences.";
        } else if (mode === "sales_coach") {
          modePrompt = "Act as an expert Bangladeshi client communication & sales pitch coach for a digital marketing agency. Help the user practice client calls, handle pricing objections, and suggest persuasive Bengali/English replies.";
        }

        const systemInstruction = [
          "You are a friendly, smart real-time Live Voice Assistant inside 'Ads হিসাব ম্যানেজার Pro' (a Meta, Google, YouTube & TikTok Ads Agency workspace).",
          modePrompt,
          "Keep spoken answers practical, crisp, and easy to listen to (usually 1-3 sentences unless asked for details).",
          agencyContext ? `Current workspace context:\n${agencyContext}` : "",
        ].filter(Boolean).join("\n\n");

        try {
          let readySent = false;
          const markReady = () => {
            if (closedByClient || readySent) return;
            readySent = true;
            sessionReady = true;
            sendJson({ type: "ready", voiceName, model: "gemini-3.8-live" });
          };

          const session = await ai.live.connect({
            model: "gemini-3.8-live",
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction,
            },
            callbacks: {
              onopen: () => {
                markReady();
              },
              onmessage: (message: LiveServerMessage) => {
                if (closedByClient) return;
                const content = message.serverContent;
                if (content?.inputTranscription?.text) {
                  sendJson({ type: "inputTranscript", text: content.inputTranscription.text });
                }
                if (content?.outputTranscription?.text) {
                  sendJson({ type: "outputTranscript", text: content.outputTranscription.text });
                }
                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    sendJson({ type: "audio", data: part.inlineData.data });
                  }
                }
                if (content?.interrupted) {
                  sendJson({ type: "interrupted" });
                }
                if (content?.turnComplete) {
                  sendJson({ type: "turnComplete" });
                }
              },
              onerror: (err: unknown) => {
                const errMsg = err instanceof Error ? err.message : "Live voice stream error.";
                sendJson({ type: "error", error: errMsg });
              },
              onclose: () => {
                sessionReady = false;
                liveSession = null;
                sendJson({ type: "closed" });
              },
            },
          });

          if (closedByClient) {
            try {
              session.close();
            } catch {
              // ignore
            }
            return;
          }
          liveSession = session;
          markReady();
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : "Failed to connect to Gemini Live voice session.";
          sendJson({ type: "error", error: errMsg });
        }
        return;
      }

      if (msg.type === "audio" && typeof msg.data === "string" && liveSession && sessionReady) {
        try {
          liveSession.sendRealtimeInput({
            audio: { data: msg.data, mimeType: "audio/pcm;rate=16000" },
          });
        } catch {
          // ignore transient send errors on closing socket
        }
        return;
      }

      if (msg.type === "text" && typeof msg.text === "string" && liveSession && sessionReady) {
        const text = msg.text.trim().slice(0, 1500);
        if (!text) return;
        try {
          liveSession.sendRealtimeInput({ text });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : "Failed to send message to Live session.";
          sendJson({ type: "error", error: errMsg });
        }
        return;
      }

      if (msg.type === "stop") {
        closeSession();
        sendJson({ type: "closed" });
      }
    });

    clientWs.on("close", closeSession);
    clientWs.on("error", closeSession);
  });

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
