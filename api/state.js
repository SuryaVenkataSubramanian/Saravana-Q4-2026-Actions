// Shared state for the Saravana Q4 Meeting - Actions tracker.
// Storage: Upstash Redis (connected through Vercel Storage / Marketplace).
// Uses the Redis REST API directly, so there are no npm dependencies.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const K = {
  status: "q4:status",   // hash: itemId -> status
  owner: "q4:owner",     // hash: itemId -> owner name
  notes: "q4:notes",     // hash: noteId -> JSON {item, text, author, at}
  seeded: "q4:seeded",
};

const STATUSES = ["Not started", "In-progress", "Completed"];
const OWNERS = ["", "Iyyapan", "Surya", "Jubina", "Akash"];
const ITEM_RE = /^s\d{1,2}-\d{1,2}$/;

// Initial data, written once when the store is empty.
const SEED_STATUS = { "s1-1": "In-progress", "s2-1": "In-progress", "s5-3": "In-progress", "s5-4": "In-progress", "s6-1": "In-progress" };
const SEED_NOTES = {
  "seed-s2-1": { item: "s2-1", author: "Surya", at: "2026-11-10T09:00:00.000Z", text: "Started with Marco Spinello, Sadhana across G2, LinkedIn, and X." },
  "seed-s5-3": { item: "s5-3", author: "Surya", at: "2026-11-10T09:00:00.000Z", text: "Leveraged Outplay to initiate GitHub and AI Search based campaigns." },
  "seed-s6-1": { item: "s6-1", author: "Surya", at: "2026-11-10T09:00:00.000Z", text: "Ref: https://kovailtd-my.sharepoint.com/:u:/g/personal/surya_venkatasubramanian_kovai_co/IQAbzXNS_pIjQaSqOxNl3sviAWl8Ou_rlkWcgDxMuPbiUY4?e=rottOf" },
};

async function pipeline(cmds) {
  const r = await fetch(URL_ + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error("Redis error " + r.status);
  const out = await r.json();
  return out.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}

const pairs = arr => { const o = {}; for (let i = 0; i < (arr || []).length; i += 2) o[arr[i]] = arr[i + 1]; return o; };

async function seedIfEmpty() {
  const [ok] = await pipeline([["SET", K.seeded, "1", "NX"]]);
  if (ok !== "OK") return;
  const cmds = [];
  const s = Object.entries(SEED_STATUS).flat();
  if (s.length) cmds.push(["HSET", K.status, ...s]);
  const n = Object.entries(SEED_NOTES).flatMap(([id, v]) => [id, JSON.stringify(v)]);
  if (n.length) cmds.push(["HSET", K.notes, ...n]);
  if (cmds.length) await pipeline(cmds);
}

async function readState() {
  const [status, owner, notes] = await pipeline([["HGETALL", K.status], ["HGETALL", K.owner], ["HGETALL", K.notes]]);
  const noteList = Object.entries(pairs(notes)).map(([id, v]) => {
    try { return Object.assign({ id }, JSON.parse(v)); } catch (e) { return null; }
  }).filter(Boolean);
  return { status: pairs(status), owner: pairs(owner), notes: noteList };
}

function clean(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max); }

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) {
    res.status(503).json({ error: "Storage is not connected. Add an Upstash Redis store to this Vercel project." });
    return;
  }
  try {
    if (req.method === "GET") {
      await seedIfEmpty();
      res.status(200).json(await readState());
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    b = b || {};

    if (b.op === "status") {
      if (!ITEM_RE.test(b.id) || !STATUSES.includes(b.status)) throw badReq("Invalid status update");
      await pipeline([["HSET", K.status, b.id, b.status]]);
    } else if (b.op === "owner") {
      if (!ITEM_RE.test(b.id) || !OWNERS.includes(b.owner)) throw badReq("Invalid owner");
      await pipeline([b.owner ? ["HSET", K.owner, b.id, b.owner] : ["HDEL", K.owner, b.id]]);
    } else if (b.op === "note") {
      const text = clean(b.text, 2000), author = clean(b.author, 40);
      if (!ITEM_RE.test(b.item) || !text) throw badReq("Comment is empty");
      const id = "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await pipeline([["HSET", K.notes, id, JSON.stringify({ item: b.item, text, author, at: new Date().toISOString() })]]);
    } else if (b.op === "deleteNote") {
      if (!/^[A-Za-z0-9-]{1,40}$/.test(b.id || "")) throw badReq("Invalid comment id");
      await pipeline([["HDEL", K.notes, b.id]]);
    } else {
      throw badReq("Unknown action");
    }
    res.status(200).json(await readState());
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : "Could not reach storage" });
  }
};

function badReq(msg) { const e = new Error(msg); e.status = 400; return e; }
