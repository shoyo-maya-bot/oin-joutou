// 押印上等!! ランキングAPI（Cloudflare Pages Functions + D1）
// D1 のバインディング名は DB。テーブルは初回アクセス時に自動で作られる。
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS scores (pid TEXT PRIMARY KEY, secret TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL, combo INTEGER NOT NULL, perfect INTEGER NOT NULL, role TEXT NOT NULL, clear INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_scores_score ON scores (score DESC, updated_at ASC)`,
  `CREATE TABLE IF NOT EXISTS runs (rid TEXT PRIMARY KEY, pid TEXT NOT NULL, started_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_runs_pid ON runs (pid, started_at)`,
];
const ROLES = ['社長', '専務', '部長', '課長', '係長', '新人', '窓際'];
const HEX32 = /^[0-9a-f]{32}$/;
const NG = /[\u0000-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁯﻿]/g;
let ready = false;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const fail = (error, status = 400) => json({ error }, status);

async function init(db) {
  if (ready) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  ready = true;
}
async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

async function rankOf(db, score) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE score > ?').bind(score).first();
  return (r?.n ?? 0) + 1;
}
async function totalOf(db) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM scores').first();
  return r?.n ?? 0;
}

async function getScores(db, url) {
  const pid = url.searchParams.get('pid') || '';
  const { results } = await db.prepare('SELECT pid, name, score, combo, role FROM scores ORDER BY score DESC, updated_at ASC LIMIT 100').all();
  const top = results.map((r) => ({ name: r.name, score: r.score, combo: r.combo, role: r.role, me: r.pid === pid }));
  let me = null;
  if (HEX32.test(pid)) {
    const row = await db.prepare('SELECT score FROM scores WHERE pid = ?').bind(pid).first();
    if (row) me = { score: row.score, rank: await rankOf(db, row.score) };
  }
  return json({ top, me, total: await totalOf(db) });
}

async function startRun(db, body) {
  const pid = body?.pid;
  if (!HEX32.test(pid || '')) return fail('pid');
  const now = Date.now();
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM runs WHERE pid = ? AND started_at > ?').bind(pid, now - 60_000).first();
  if ((recent?.n ?? 0) >= 6) return fail('rate', 429);
  const rid = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await db.batch([
    db.prepare('INSERT INTO runs (rid, pid, started_at) VALUES (?, ?, ?)').bind(rid, pid, now),
    db.prepare('DELETE FROM runs WHERE started_at < ?').bind(now - 86_400_000),
  ]);
  return json({ rid });
}

async function postScore(db, b) {
  if (!b || typeof b !== 'object') return fail('body');
  const { pid, secret, rid, score, combo, perfect, clear } = b;
  if (!HEX32.test(pid || '') || !HEX32.test(secret || '') || !HEX32.test(rid || '')) return fail('run');
  const name = String(b.name ?? '').replace(NG, '').trim().slice(0, 10);
  if (!name) return fail('name');
  const role = ROLES.includes(b.role) ? b.role : null;
  if (!role || !intIn(score, 0, 250000) || !intIn(combo, 0, 400) || !intIn(perfect, 0, 400) || !(clear === 0 || clear === 1)) return fail('value');

  // プレイ開始の記録と照合（まだ使っていない・本人の・実際に遊べる時間が経っている）
  const run = await db.prepare('SELECT pid, started_at, used FROM runs WHERE rid = ?').bind(rid).first();
  if (!run || run.pid !== pid || run.used) return fail('run');
  const elapsed = (Date.now() - run.started_at) / 1000;
  if (clear === 1 && elapsed < 88) return fail('run');
  if (score > (elapsed + 5) * 2600 || combo > elapsed * 4 + 5 || perfect > elapsed * 4 + 5) return fail('value');
  await db.prepare('UPDATE runs SET used = 1 WHERE rid = ?').bind(rid).run();

  const hash = await sha(secret);
  const cur = await db.prepare('SELECT secret, score FROM scores WHERE pid = ?').bind(pid).first();
  if (cur && cur.secret !== hash) return fail('owner', 403);
  const now = Date.now();
  let improved = false;
  if (!cur) {
    await db.prepare('INSERT INTO scores (pid, secret, name, score, combo, perfect, role, clear, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(pid, hash, name, score, combo, perfect, role, clear, now).run();
    improved = true;
  } else if (score > cur.score) {
    await db.prepare('UPDATE scores SET name=?, score=?, combo=?, perfect=?, role=?, clear=?, updated_at=? WHERE pid=?')
      .bind(name, score, combo, perfect, role, clear, now, pid).run();
    improved = true;
  } else {
    await db.prepare('UPDATE scores SET name=? WHERE pid=?').bind(name, pid).run();
  }
  const best = improved ? score : cur.score;
  return json({ improved, best, rank: await rankOf(db, best), total: await totalOf(db) });
}

export async function onRequest({ request, env }) {
  const db = env.DB;
  if (!db) return fail('db_not_bound', 503);
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  try {
    await init(db);
    if (route === 'scores' && request.method === 'GET') return await getScores(db, url);
    if (route === 'scores' && request.method === 'POST') return await postScore(db, await request.json().catch(() => null));
    if (route === 'start' && request.method === 'POST') return await startRun(db, await request.json().catch(() => null));
    return fail('not_found', 404);
  } catch (e) {
    return fail('server', 500);
  }
}
