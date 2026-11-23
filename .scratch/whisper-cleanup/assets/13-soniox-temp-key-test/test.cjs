// Throwaway test for the wayfinder ticket "Soniox temporary key test". Not app code.
// Usage: node test.cjs <envFile> <wavFile> <outDir>
const fs = require("fs");
const path = require("path");
const WebSocket = require("/Users/thaka/Desktop/Cursor/websocket/node_modules/ws");

const [envFile, wavFile, outDir] = process.argv.slice(2);
const MAIN_KEY = /SONIOX_API_KEY=(.+)/.exec(fs.readFileSync(envFile, "utf8"))[1].trim();
const API = "https://api.soniox.com/v1";
const WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
const MODEL = "stt-rt-v6";
const CHUNK_MS = 100;
const CHUNK_BYTES = 3200; // 100 ms of 16 kHz mono s16le
const RUN = `wf13-${Date.now()}`;
const T0 = Date.now();
const results = { run: RUN, startedAt: new Date(T0).toISOString(), tests: {} };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = () => ((Date.now() - T0) / 1000).toFixed(2);
const log = (...a) => console.log(`[${t()}s]`, ...a);
const save = () => fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2));
const redact = (s) => String(s).replaceAll(MAIN_KEY, "<main-key>").replace(/snx_temp_[A-Za-z0-9_-]+/g, "<temp-key>");

function loadPcm(file) {
  const buf = fs.readFileSync(file);
  let off = 12;
  while (off < buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") return buf.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}
const PCM = loadPcm(wavFile);
// chunk n of an endless loop over the sample
function chunk(n) {
  const total = Math.floor(PCM.length / CHUNK_BYTES);
  const i = n % total;
  return PCM.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
}

async function createTempKey(body) {
  const res = await fetch(`${API}/auth/temporary-api-key`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MAIN_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ usage_type: "transcribe_websocket", ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`temp key ${res.status}: ${redact(JSON.stringify(json))}`);
  log(`temp key created ref=${body.client_reference_id} expires_at=${json.expires_at}`);
  return json.api_key;
}

function startConfig(extra = {}) {
  return {
    model: MODEL,
    audio_format: "pcm_s16le",
    sample_rate: 16000,
    num_channels: 1,
    language_hints: ["en"],
    enable_endpoint_detection: true,
    ...extra,
  };
}

// One Soniox stream, possibly spread over several connections.
class Stream {
  constructor(name, key) {
    this.name = name;
    this.key = key;
    this.sent = []; // client messages after the start request (pings excluded)
    this.lastSeq = 0;
    this.finalText = "";
    this.events = [];
    this.errors = [];
    this.closes = [];
    this.finished = false;
    this.reconnect = null;
    this.ws = null;
  }
  ev(kind, data = {}) {
    const e = { t: Number(t()), kind, ...data };
    this.events.push(e);
    log(`${this.name}: ${kind}`, redact(JSON.stringify(data)));
  }
  connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${this.key}` }, handshakeTimeout: 10000 });
      this.ws = ws;
      ws.on("open", () => resolve(ws));
      ws.on("unexpected-response", (_req, res) => reject(new Error(`http ${res.statusCode}`)));
      ws.on("error", (err) => { this.ev("socket-error", { message: err.message }); reject(err); });
      ws.on("message", (data, isBinary) => this.onMessage(ws, data, isBinary));
      ws.on("close", (code, reason) => {
        const c = { code, reason: reason.toString() };
        this.closes.push({ t: Number(t()), ...c, current: ws === this.ws });
        this.ev("close", { ...c, current: ws === this.ws });
      });
    });
  }
  onMessage(ws, data) {
    let m;
    try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.type === "reconnect") { this.reconnect = { token: m.reconnect_token, url: m.reconnect_url }; this.ev("reconnect-info", { hasToken: !!m.reconnect_token, url: m.reconnect_url?.split("?")[0] }); return; }
    if (m.type === "reconnected") { this.reconnect.token = m.reconnect_token; this.lastRequest = m.last_request; this.ev("reconnected", { last_request: m.last_request }); this.onReconnected?.(m); return; }
    if (m.type === "pong") return;
    if (m.error_type || m.error_code) {
      const e = { t: Number(t()), onCurrent: ws === this.ws, error_code: m.error_code, error_type: m.error_type, error_message: m.error_message };
      this.errors.push(e);
      this.ev("error", e);
      return;
    }
    if (typeof m.seq === "number") {
      if (m.seq <= this.lastSeq) return;
      this.lastSeq = m.seq;
    }
    for (const tok of m.tokens ?? []) if (tok.is_final && tok.text && tok.text !== "<end>") this.finalText += tok.text;
    if (m.finished) { this.finished = true; this.ev("finished", { total_audio_proc_ms: m.total_audio_proc_ms }); }
  }
  async open(url, extra) {
    await this.connect(url);
    this.ws.send(JSON.stringify(startConfig(extra)));
    this.openedAt = Number(t());
    this.ev("opened");
  }
  send(msg) {
    this.sent.push(msg);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(msg);
  }
  end() { this.send(""); } // empty text frame ends the stream
  waitFinished(ms) {
    return new Promise((resolve) => {
      const start = Date.now();
      const iv = setInterval(() => {
        if (this.finished || this.ws?.readyState === WebSocket.CLOSED || Date.now() - start > ms) { clearInterval(iv); resolve(this.finished); }
      }, 100);
    });
  }
  async reconnectNow() {
    const ws = await this.connect(this.reconnect.url);
    const done = new Promise((resolve) => {
      this.onReconnected = resolve;
      ws.on("close", () => resolve(null));
    });
    ws.send(JSON.stringify({ type: "reconnect", reconnect_token: this.reconnect.token, last_seq: this.lastSeq }));
    const ok = await Promise.race([done, sleep(10000).then(() => null)]);
    if (!ok) return false;
    for (const msg of this.sent.slice(this.lastRequest)) ws.send(msg);
    this.ev("resent", { count: this.sent.length - this.lastRequest });
    return true;
  }
  summary() {
    return { name: this.name, openedAt: this.openedAt, finished: this.finished, errors: this.errors, closes: this.closes, events: this.events, finalText: this.finalText.trim() };
  }
}

// Test 1 + 2: reconnect with a single-use key that is past expires_in_seconds, then hit max_session_duration_seconds.
async function testReconnectAndExpiry() {
  const ref = `${RUN}-A`;
  const MAX = 45;
  const key = await createTempKey({ expires_in_seconds: 10, single_use: true, max_session_duration_seconds: MAX, client_reference_id: ref });
  const s = new Stream("A", key);
  await s.open(WS_URL, { enable_reconnect: true });
  const tStart = Date.now();

  // single_use check: a second stream with the same key, before expiry
  const dup = new Stream("A-dup", key);
  const dupResult = (async () => {
    await sleep(2000);
    try { await dup.open(WS_URL); } catch (e) { dup.ev("open-failed", { message: e.message }); }
    dup.send(chunk(0));
    await sleep(4000);
    try { dup.ws?.close(); } catch {}
    return dup.summary();
  })();

  let n = 0;
  while (Date.now() - tStart < 15000) { s.send(chunk(n++)); await sleep(CHUNK_MS); }
  s.ev("dropping socket (terminate, no close frame)", { keyPastExpiry: true });
  s.ws.terminate();
  // audio keeps being captured during the drop; queue it like a real client would
  const dropStart = Date.now();
  while (Date.now() - dropStart < 3000) { s.sent.push(chunk(n++)); await sleep(CHUNK_MS); }
  let reconnected = false;
  try { reconnected = await s.reconnectNow(); } catch (e) { s.ev("reconnect-failed", { message: e.message }); }

  let expiredAfter = null;
  if (reconnected) {
    while (Date.now() - tStart < (MAX + 30) * 1000 && s.ws.readyState === WebSocket.OPEN) { s.send(chunk(n++)); await sleep(CHUNK_MS); }
    const err = s.errors.find((e) => e.error_type === "temp_api_key_session_expired");
    expiredAfter = err ? Number(((err.t * 1000 + T0 - tStart) / 1000).toFixed(2)) : null;
  }
  results.tests.reconnectAndExpiry = {
    ref, maxSessionSeconds: MAX, reconnected, expiredAfterSecondsFromStreamStart: expiredAfter,
    stream: s.summary(), singleUseSecondStream: await dupResult, endedAt: new Date().toISOString(),
  };
  save();
}

// Clean, normally finished stream (for usage logs).
async function testCleanStream(name, seconds) {
  const ref = `${RUN}-${name}`;
  const key = await createTempKey({ expires_in_seconds: 60, single_use: true, max_session_duration_seconds: 300, client_reference_id: ref });
  const s = new Stream(name, key);
  await s.open(WS_URL);
  for (let n = 0; n < (seconds * 1000) / CHUNK_MS; n++) { s.send(chunk(n)); await sleep(CHUNK_MS); }
  s.end();
  await s.waitFinished(15000);
  return { ref, endedAt: new Date().toISOString(), stream: s.summary() };
}

// Test 4: switch both streams (me, them) to a new lease without a gap; compare with an unswitched baseline.
async function testLeaseSwitch() {
  const SWITCH_AT = 12000, TOTAL = 24000, PREOPEN = 2000;
  const mk = (who, lease) => createTempKey({ expires_in_seconds: 60, single_use: true, max_session_duration_seconds: 300, client_reference_id: `${RUN}-D-${who}-${lease}` });
  const [kBase, kMe1, kThem1] = await Promise.all([
    createTempKey({ expires_in_seconds: 60, single_use: true, max_session_duration_seconds: 300, client_reference_id: `${RUN}-D-base` }),
    mk("me", 1), mk("them", 1),
  ]);
  const base = new Stream("D-base", kBase);
  const me1 = new Stream("D-me-1", kMe1), them1 = new Stream("D-them-1", kThem1);
  await Promise.all([base.open(WS_URL), me1.open(WS_URL), them1.open(WS_URL)]);
  const tStart = Date.now();
  let me2, them2, switched = false, switchInfo = {};
  let n = 0;
  const pre = (async () => {
    await sleep(SWITCH_AT - PREOPEN);
    const [kMe2, kThem2] = await Promise.all([mk("me", 2), mk("them", 2)]);
    me2 = new Stream("D-me-2", kMe2); them2 = new Stream("D-them-2", kThem2);
    try {
      await Promise.all([me2.open(WS_URL), them2.open(WS_URL)]);
      switchInfo.newOpenedWhileOldOpen = me1.ws.readyState === WebSocket.OPEN && them1.ws.readyState === WebSocket.OPEN;
      switchInfo.newOpenedAtMsFromStart = Date.now() - tStart;
    } catch (e) { switchInfo.openError = e.message; }
  })();
  while (Date.now() - tStart < TOTAL) {
    const c = chunk(n++);
    base.send(c);
    if (!switched && Date.now() - tStart >= SWITCH_AT && me2?.ws?.readyState === WebSocket.OPEN) {
      switched = true;
      switchInfo.switchedAtChunk = n - 1;
      me1.end(); them1.end();
    }
    if (switched) { me2.send(c); them2.send(c); } else { me1.send(c); them1.send(c); }
    await sleep(CHUNK_MS);
  }
  await pre;
  base.end(); me2?.end(); them2?.end();
  await Promise.all([base, me1, them1, me2, them2].filter(Boolean).map((s) => s.waitFinished(15000)));
  const norm = (s) => s.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  results.tests.leaseSwitch = {
    switchInfo,
    baseline: norm(base.finalText),
    meJoined: norm(me1.finalText + " " + (me2?.finalText ?? "")),
    themJoined: norm(them1.finalText + " " + (them2?.finalText ?? "")),
    me1Tail: norm(me1.finalText).split(" ").slice(-8).join(" "),
    me2Head: norm(me2?.finalText ?? "").split(" ").slice(0, 8).join(" "),
    streams: [base, me1, them1, me2, them2].filter(Boolean).map((s) => ({ name: s.name, errors: s.errors, closes: s.closes, finished: s.finished })),
    endedAt: new Date().toISOString(),
  };
  save();
}

// Test 3: poll usage logs until every stream ref appears (or timeout).
async function pollUsageLogs(refs, maxMinutes) {
  const found = {};
  const startTime = new Date(T0 - 60000).toISOString();
  const pollStart = Date.now();
  while (Date.now() - pollStart < maxMinutes * 60000) {
    const endTime = new Date(Date.now() + 60000).toISOString();
    let cursor = null;
    do {
      const q = new URLSearchParams({ start_time: startTime, end_time: endTime, limit: "1000" });
      if (cursor) q.set("cursor", cursor);
      const res = await fetch(`${API}/usage-logs?${q}`, { headers: { Authorization: `Bearer ${MAIN_KEY}` } });
      const json = await res.json();
      if (!res.ok) { log("usage-logs error", res.status, redact(JSON.stringify(json))); break; }
      for (const e of json.usage_logs ?? []) {
        if (refs.includes(e.client_reference_id) && !found[e.client_reference_id]) {
          found[e.client_reference_id] = { firstSeenAt: new Date().toISOString(), entry: e };
          log(`usage log appeared for ${e.client_reference_id}: ${e.input_audio_duration_ms} ms, $${e.cost_usd}`);
        }
      }
      cursor = json.next_page_cursor;
    } while (cursor);
    results.tests.usageLogs = { refs, found, missing: refs.filter((r) => !found[r]), polledMinutes: (Date.now() - pollStart) / 60000 };
    save();
    if (refs.every((r) => found[r])) break;
    await sleep(20000);
  }
}

(async () => {
  try {
    await testReconnectAndExpiry();
    results.tests.clean = await testCleanStream("C", 8);
    save();
    await testLeaseSwitch();
    const refs = [`${RUN}-A`, `${RUN}-C`, `${RUN}-D-base`, `${RUN}-D-me-1`, `${RUN}-D-them-1`, `${RUN}-D-me-2`, `${RUN}-D-them-2`];
    await pollUsageLogs(refs, 20);
  } catch (e) {
    results.fatal = redact(e.stack ?? e);
    log("FATAL", results.fatal);
  }
  save();
  log("done");
  process.exit(0);
})();
