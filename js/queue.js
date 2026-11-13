// Offline-safe answer queue. Every answer is saved locally first, then sent; it is removed only after the server
// gives a definite answer for it (graded / duplicate / rejected). Network failures keep it for a later retry.
// Sending the same client_uuid again is safe: the server returns the earlier result without double counting.
import { rpc, ApiError } from "./api.js?v=858b6233";
import { deviceId } from "./session.js?v=858b6233";

const key = sid => "lg2-queue-" + sid;
const CHUNK = 50;                                   // server accepts 1..50 items per call
// Errors that can never succeed on retry: drop those entries and tell the caller.
const FATAL = new Set(["assignment_closed", "assignment_not_started", "daily_limit", "not_found", "config_error", "invalid_input"]);

function load(sid) { try { return JSON.parse(localStorage.getItem(key(sid))) || []; } catch { return []; } }
function save(sid, list) { localStorage.setItem(key(sid), JSON.stringify(list)); }

export function pendingCount(sid, kind, target) {
  return load(sid).filter(e => e.kind === kind && e.target === target).length;
}
export function pendingCodes(sid, kind, target) {
  return load(sid).filter(e => e.kind === kind && e.target === target).map(e => e.item.question_code);
}

// entry: { kind: "level"|"assignment", target, attemptUuid, item: {client_uuid, question_code, response, seconds, hints_used?, answered_at} }
export function enqueue(sid, entry) {
  const list = load(sid);
  if (!list.some(e => e.item.client_uuid === entry.item.client_uuid)) list.push({ ...entry, source: "online" });
  save(sid, list);
}

// Tries to send everything queued for this child (optionally only one target).
// Returns { results: {client_uuid: result}, attempts: {"kind|target": attemptSummary}, errors: [{kind,target,code,message}], offline: boolean }
export async function flush(sid, only) {
  const out = { results: {}, attempts: {}, errors: [], offline: false };
  let list = load(sid);
  const groups = new Map();
  for (const e of list) {
    if (only && (e.kind !== only.kind || e.target !== only.target)) continue;
    const g = e.kind + "|" + e.target + "|" + e.attemptUuid;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e);
  }
  for (const entries of groups.values()) {
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const first = chunk[0];
      const source = chunk.some(e => e.source === "offline") ? "offline" : "online";
      const items = chunk.map(e => e.item);
      let res;
      try {
        res = first.kind === "assignment"
          ? await rpc("rpc_submit_answers", { p_assignment_id: first.target, p_attempt_client_uuid: first.attemptUuid, p_device: deviceId(), p_source: source, p_items: items })
          : await rpc("rpc_submit_practice", { p_level_id: first.target, p_attempt_client_uuid: first.attemptUuid, p_device: deviceId(), p_items: items });
      } catch (err) {
        const code = err instanceof ApiError ? err.code : "network_or_server";
        if (code === "session_invalid") { out.offline = true; return out; }          // handler is redirecting; keep everything
        if (FATAL.has(code)) {
          const ids = new Set(chunk.map(e => e.item.client_uuid));
          list = list.filter(e => !ids.has(e.item.client_uuid));
          out.errors.push({ kind: first.kind, target: first.target, code, message: err.friendly || String(err) });
          continue;
        }
        // Network or server trouble: keep the entries and mark them as offline so a late send is accepted by the server.
        const ids = new Set(chunk.map(e => e.item.client_uuid));
        list = list.map(e => (ids.has(e.item.client_uuid) ? { ...e, source: "offline" } : e));
        out.offline = true;
        continue;
      }
      const done = new Set();
      for (const r of res.results || []) { out.results[r.client_uuid] = r; done.add(r.client_uuid); }
      if (res.attempt) out.attempts[first.kind + "|" + first.target] = res.attempt;
      list = list.filter(e => !done.has(e.item.client_uuid));
    }
  }
  save(sid, list);
  return out;
}
