// collect_cards.mjs — every player-facing sentence the game can say, keyed the way narrate.js looks clips up.
//
//   node web/audio/render/collect_cards.mjs [misses.json ...]     → web/audio/render/cards.json  (+ a render list of new clips)
//
// It reads the game's JS as text: each card(), toast() and appended-answer call, plus HINTS, and evaluates the arguments
// with real values: the bosses in data/billionaires.json, the quotes and made-up tricks for each, the eggs, the friends on
// each road, the endings, the jar at 0 to 3 thirds, the bell at 0 to 15 homes. A name the call uses that is defined as a
// `const` above it in the same file is evaluated too (rows, body, choices, total…); anything still unknown makes that
// sentence dynamic and it is left to the browser voice (listed at the end of the run). Every result goes through
// narrate.js's own sentencesOf()/clipKey(), so the keys match what the game asks for at runtime.
//
// Optional args: JSON files holding an array of sentences, e.g. window.__narrate.narrationMisses() copied out of a session.
// Writes cards.json ({ "c_ab12cd34": ["af_heart", 0.95, "<sentence>"] }) and, for clips with no mp3 yet, todo.json
// in $GERBIL_CARDS_DIR (default $TMPDIR/gerbil-cards/) for render_kokoro.py. The whole run, from the repo root:
//
//   PY=~/Desktop/vault/tools/rehearse/.venv/bin/python; W=/tmp/gerbil-cards; mkdir -p $W/empty
//   GERBIL_CARDS_DIR=$W node web/audio/render/collect_cards.mjs
//   $PY web/audio/render/render_kokoro.py $W/wav $W/todo.json                 # Kokoro af_heart 0.95, only the new clips
//   $PY web/audio/render/encode.py web/audio $W/norm $W/wav $W/empty          # trim, -1 dBFS, mp3 48 kbps (empty villain dir)
//
// Kokoro is deterministic, so a clip never needs re-rendering unless its sentence changes (then its key changes too).
// Clips whose key left cards.json are stale; delete them with: comm -13 <(jq -r 'keys[]' cards.json | sort) <(ls ../c_*.mp3 | xargs -n1 basename | sed 's/.mp3//' | grep -E '^c_[0-9a-f]{8}$' | sort)   (only hash keys: c_share is a story clip)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
globalThis.window = {};   // speech.js checks `'speechSynthesis' in window` at load; narrate.js sees no document and stays silent
const HERE = dirname(fileURLToPath(import.meta.url)), WEB = join(HERE, '..', '..'), JS = join(WEB, 'js');
const N = await import(join(JS, 'narrate.js'));
const VOICE = 'af_heart', SPEED = 0.95, DYN = 'QQDYNQQ';

const data = JSON.parse(readFileSync(join(WEB, 'data', 'billionaires.json'), 'utf8'));
const src = f => readFileSync(join(JS, f), 'utf8');

// ---------- the game's own helpers, as main.js and hub.js define them ----------
const trim = x => Number(x.toFixed(1)).toLocaleString('en-US');
const words = n => n >= 1e12 ? `${trim(n / 1e12)} trillion` : n >= 1e9 ? `${trim(n / 1e9)} billion` : n >= 1e6 ? `${trim(n / 1e6)} million` : Math.round(n).toLocaleString('en-US');
const sets = n => `${words(n)} Lego set${n === 1 ? '' : 's'}`;
const LEGO = 20, BAG_USD = data.bag_usd, BAG_SETS = BAG_USD / LEGO;
const teacher = data.ordinary.find(o => o.id === 'teacher'), family = data.ordinary.find(o => o.id === 'family');
const stops = data.bosses.map(b => { const n = Math.round(b.net_worth_usd / LEGO); return { id: b.id, boss: b, sets: n, bags: Math.max(15, Math.round(n / BAG_SETS)) }; });
const NAMES = { alex: 'Molly', william: 'William' };
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
Number.prototype.toLocaleString = (orig => function (l, o) { return orig.call(this, l || 'en-US', o); })(Number.prototype.toLocaleString);

// ---------- a small JS scanner: balanced expressions, top-level commas ----------
function scanExpr(s, i, stops = ',)]};') {   // from i to the first top-level char in `stops`; returns the end index
  const st = []; let k = i;
  while (k < s.length) {
    const c = s[k];
    if (c === '"' || c === "'") { k++; while (k < s.length && s[k] !== c) k += s[k] === '\\' ? 2 : 1; k++; continue; }
    if (c === '`') { k = skipTemplate(s, k); continue; }
    if (c === '/' && s[k + 1] === '/') { while (k < s.length && s[k] !== '\n') k++; continue; }
    if (c === '/' && s[k + 1] === '*') { k = s.indexOf('*/', k + 2) + 2; continue; }
    if (c === '/' && /^$|[=(,:!&|?{};[]$/.test(s.slice(0, k).replace(/\s+$/, '').slice(-1))) { k++; while (k < s.length && s[k] !== '/' && s[k] !== '\n') { if (s[k] === '[') { while (k < s.length && s[k] !== ']') k += s[k] === '\\' ? 2 : 1; } k += s[k] === '\\' ? 2 : 1; } k++; continue; }   // regex literal
    if ('([{'.includes(c)) st.push(c);
    else if (')]}'.includes(c)) { if (!st.length) return k; st.pop(); }
    else if (!st.length && stops.includes(c)) return k;
    if (!st.length && c === '\n' && stops.includes('\n')) return k;
    k++;
  }
  return k;
}
function skipTemplate(s, k) { k++; while (k < s.length && s[k] !== '`') { if (s[k] === '\\') { k += 2; continue; } if (s[k] === '$' && s[k + 1] === '{') { k = scanExpr(s, k + 2, '}') + 1; continue; } k++; } return k + 1; }
function args(s, open) { const out = []; let k = open + 1; while (k < s.length) { const e = scanExpr(s, k); out.push(s.slice(k, e).trim()); if (s[e] !== ',') return { out, end: e }; k = e + 1; } return { out, end: k }; }
const idents = code => new Set(code.match(/[A-Za-z_$][\w$]*/g) || []);   // prose words too: an extra name costs nothing

// `const a = …, b = …;` definitions in a file, by name, with their position
function constDefs(code) {
  const defs = Object.create(null); const re = /\bconst\s+(?=[A-Za-z_$])/g; let m;
  while ((m = re.exec(code))) {
    let k = m.index + m[0].length;
    for (;;) {
      const nm = /^([A-Za-z_$][\w$]*)\s*=(?!=)\s*/.exec(code.slice(k)); if (!nm) break;
      const e0 = k + nm[0].length, e = scanExpr(code, e0, ',;\n');
      (defs[nm[1]] = defs[nm[1]] || []).push({ at: k, expr: code.slice(e0, e).trim() });
      if (code[e] !== ',') break; k = e + 1; while (/\s/.test(code[k])) k++;
    }
  }
  return defs;
}

// ---------- evaluation in a scope; anything unknown becomes a marker that poisons its sentence ----------
const stubOf = text => { const p = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive || k === 'toString' || k === 'valueOf' ? () => text : k === Symbol.iterator ? undefined : k === 'length' ? 1 : p, apply: () => block, construct: () => p }); return p; };
const block = stubOf(`<p>${DYN}</p>`);   // what an unknown helper returns (growLine()): its own sentence, so its neighbours still render
const stub = stubOf(DYN);
function evalIn(expr, scope) {
  const px = new Proxy(scope, { has: (t, k) => typeof k === 'string', get: (t, k) => k === Symbol.unscopables ? undefined : k in t ? t[k] : k in globalThis ? globalThis[k] : stub });
  try { return new Function('__s', `with (__s) { return (${expr}); }`)(px); } catch { return stub; }
}
// resolve the consts a call depends on (nearest definition above it), hard axis values first, soft base values last
function scopeFor(code, defs, at, expr, hard, soft, depth = 0, scope = { ...soft, ...hard }) {
  if (depth > 5) return scope;
  for (const id of idents(expr)) {
    if (id in hard || !defs[id] || Object.hasOwn(scope, id) && !(id in soft)) continue;
    const d = defs[id].filter(x => x.at < at).pop(); if (!d) continue;
    const inner = scopeFor(code, defs, d.at, d.expr, hard, soft, depth + 1, Object.create(scope));   // its own deps, without clobbering ours
    scope[id] = evalIn(d.expr, inner);
  }
  return scope;
}
function depsOf(defs, at, expr, seen = new Set(), depth = 0) {
  for (const id of idents(expr)) { if (seen.has(id)) continue; seen.add(id); const d = defs[id]?.filter(x => x.at < at).pop(); if (d && depth < 6) depsOf(defs, d.at, d.expr, seen, depth + 1); }
  return seen;
}
function product(axes) { return axes.reduce((acc, ax) => acc.flatMap(a => ax.values.map(v => ({ ...a, ...v }))), [{}]); }

// ---------- what each file's calls can see ----------
const fileDefs = {}; const defsOf = f => fileDefs[f] = fileDefs[f] || constDefs(src(f));
function bossAxis(f, extra = () => ({})) { return { keys: ['stop', 'L', 'boss'], values: stops.map(s => ({ stop: s, n: s.sets, ...extra(s) })) }; }
function quoteAxis(f) {   // the real quotes and the made-up tricks, per boss; overrides the random pick
  const code = src(f), defs = defsOf(f), at = code.indexOf('card(', code.indexOf('function trickCard'));
  return { keys: ['q'], values: stops.flatMap(s => { const sc = scopeFor(code, defs, at, 'real made', { stop: s, n: s.sets }, { words, state: { tricksSeen: {} } });
    return [...(Array.isArray(sc.real) ? sc.real : []), ...(Array.isArray(sc.made) ? sc.made : [])].map(q => ({ stop: s, n: s.sets, q })); }) };
}
const evalConst = (f, name, scope = {}) => { const d = defsOf(f)[name]?.[0]; return d ? evalIn(d.expr, { words, ...scope }) : undefined; };
const LEVELS = evalConst('approach.js', 'LEVELS') || {}; const levelFor = evalConst('approach.js', 'levelFor', { LEVELS });
const levelOf = s => (typeof levelFor === 'function' ? levelFor(s) : null) || LEVELS[s.id] || {};
const EGGS = evalConst('eggs.js', 'EGGS') || [];
// main.js's instruction-bar text depends on padMode() (the trackpad is the main control on a laptop, 10/31): evaluate it
// both ways. K, moveHint, hintHTML, SAY_MOVE and MENU_HELP are functions of padMode now (HINTS was a table before).
// constDefs stops a definition at a newline, and moveHint, SAY_MOVE and MENU_HELP put their ternary's second arm on an
// indented next line: this reads a top-level const on through its indented continuation lines.
function fullConst(f, name, scope) {
  const code = src(f), m = new RegExp(`^const ${name}\\s*=\\s*`, 'm').exec(code); if (!m) return evalConst(f, name, scope);
  const rest = code.slice(m.index + m[0].length).split('\n'); let expr = rest[0];
  for (let i = 1; i < rest.length && /^\s+\S/.test(rest[i]) && !/^\s*\/\//.test(rest[i]); i++) expr += '\n' + rest[i];
  return evalIn(expr.replace(/;\s*(\/\/.*)?$/, ''), { words, ...scope });
}
function mainText(pad) {
  const padMode = () => pad, K = evalConst('main.js', 'K', { padMode }), moveHint = fullConst('main.js', 'moveHint', { padMode, K });
  const call = v => typeof v === 'function' ? v() : v;
  const hintHTML = evalConst('main.js', 'hintHTML', { padMode, K, moveHint }), HINTS_OLD = evalConst('main.js', 'HINTS', { K });
  const keys = ['hub', 'road', 'fight', 'skip', 'unroll', 'prologue', 'look'];
  const HINTS = typeof hintHTML === 'function' ? Object.fromEntries(keys.map(k => [k, hintHTML(k)]).filter(([, h]) => typeof h === 'string')) : (HINTS_OLD || {});
  return { HINTS, SAY_MOVE: call(fullConst('main.js', 'SAY_MOVE', { padMode, K })), MENU_HELP: call(fullConst('main.js', 'MENU_HELP', { padMode, K })) };
}
const MAIN_TEXT = [mainText(false), mainText(true)];
// the word for A: 'Space' on a keyboard, 'A' on touch, 'Click' with the trackpad (main.js aWord, handed to the files as ctx.aWord)
const A_WORDS = ['Space', 'A', 'Click'];
const STALLS = evalConst('fight.js', 'STALL_DEFS') || [];
const endings = [...src('fight.js').matchAll(/ending\(\s*'([^']+)'\s*,\s*'((?:\\'|[^'])+)'\s*\)/g)].map(m => ({ who: m[1], text: m[2].replace(/\\'/g, "'") }));
const base = { words, sets, trim, BAG_SETS, BAG_USD, bagUSD: BAG_USD, bagSets: BAG_SETS, data, teacher, family, ordinary: data.ordinary, NAMES, EGGS, LEVELS, levelFor,
  state: { returned: 0, beaten: {}, eggs: {}, friends: {}, tricksSeen: {}, player: 'alex' }, ctx: {} };
const FILES = {
  'main.js': { axes: [{ keys: ['s'], values: stops.map(s => ({ s })) }] },
  'hub.js': { soft: { bosses: data.bosses, city: { progress: 0 } }, axes: [{ keys: ['n'], values: range(0, 15).map(n => ({ n })) }] },
  'fight.js': { soft: { score: 15 * BAG_SETS }, axes: [quoteAxis('fight.js'), bossAxis('fight.js', s => ({ F: { stop: s, total: s.bags, grown: 0, pouch: 3 } })),
    { keys: ['who', 'text'], values: endings }, { keys: ['s'], values: STALLS.map(s => ({ s })) }] },
  'approach.js': { axes: [quoteAxis('approach.js'), bossAxis('approach.js', s => ({ L: levelOf(s), A: { stop: s } })),
    { keys: ['f'], values: stops.flatMap(s => (levelOf(s).friends || []).map(d => ({ f: { def: d } }))) }] },
  'unroll.js': { axes: [bossAxis('unroll.js', s => ({ total: s.bags, U: { stop: s } }))] },
  'celebration.js': { soft: { state: { ...base.state, beaten: Object.fromEntries(stops.map(s => [s.id, {}])) } },
    axes: [{ keys: ['name'], values: [...Object.values(NAMES), 'The gerbil'].map(name => ({ name })) }, { keys: ['friends'], values: range(0, 9).map(friends => ({ friends })) }, { keys: ['secrets'], values: range(0, EGGS.length + stops.length).map(secrets => ({ secrets })) }] },
  'eggs.js': { axes: [{ keys: ['TOTAL'], values: [{ TOTAL: EGGS.length }] }, { keys: ['e'], values: EGGS.map(e => ({ e })) }, { keys: ['count'], values: range(1, EGGS.length).map(k => ({ count: () => k })) }] },
};

// ---------- collect ----------
const out = new Map(), where = new Map(), dynamic = new Map();
function add(sentences, from) {
  for (const s of sentences) {
    if (s.toUpperCase().includes(DYN) || /\bundefined\b|\bNaN\b|\[object|function\s*\(/.test(s)) { const t = s.replace(new RegExp(DYN, 'g'), '…'); if (!dynamic.has(t)) dynamic.set(t, from); continue; }
    const k = N.clipKey(s); if (!out.has(k)) { out.set(k, s); where.set(k, from); }
  }
}
const asText = v => v === stub ? DYN : typeof v === 'string' ? v : v == null ? '' : String(v);
const CALL = /(?<!function\s)\b(card|toast|caption)(?:\?\.)?\(|\.innerHTML\s*\+=\s*/g;
for (const w of A_WORDS) for (const [f, cfg] of Object.entries(FILES)) {
  base.ctx = { aWord: () => w };
  const code = src(f), defs = defsOf(f); let m; CALL.lastIndex = 0;
  while ((m = CALL.exec(code))) {
    const at = m.index, line = code.slice(0, at).split('\n').length, from = `${f}:${line}`;
    let kind = m[1] || 'append', a;
    if (kind === 'append') { const e = scanExpr(code, CALL.lastIndex, ';'); a = [code.slice(CALL.lastIndex, e).trim()]; }
    else { const open = at + m[0].length - 1; a = args(code, open).out; if (!a[0] || /^[a-z]+\s*[,)]?$/i.test(a[0]) && kind !== 'card' && !/['"`]/.test(a[0])) { if (!/['"`]/.test(a.join(''))) continue; } }
    if (kind === 'caption') continue;   // only the prologue calls caption(), and every line there plays its own p_ clip
    const deps = depsOf(defs, at, a.join(' '));
    const axes = cfg.axes.filter(ax => ax.keys.some(k => deps.has(k)));
    let combos = product(axes); if (combos.length > 4000) combos = combos.slice(0, 4000);
    for (const hard of combos) {
      const scope = scopeFor(code, defs, at, a.join(' '), hard, { ...base, ...(cfg.soft || {}) });
      const v = a.map(x => evalIn(x, scope));
      if (kind === 'card') add(N.cardSentences(asText(v[0]), asText(v[1]), Array.isArray(v[2]) ? v[2].map(c => ({ label: asText(c?.label) })) : v[2] === undefined ? [] : [DYN]), from);
      else if (kind === 'toast') add(N.toastSentences(asText(v[0]), asText(v[1]?.sub)), from);
      else add(N.sentencesOf(asText(v[0])), from);
    }
    // both sides of every ternary: the plain literals inside the call, one by one
    for (const lit of a.join(' ').matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`([^`$]*)`/g)) {
      const t = (lit[1] ?? lit[2] ?? lit[3]).replace(/\\(.)/g, '$1');
      if (/[<>;{}=]|px\b|^#|^\w+$/.test(t) || !/[a-z]{2}/i.test(t) || !/\s|[.!?]$/.test(t)) continue;
      add(N.sentencesOf(t), from + ' (literal)');
    }
  }
}
// the instruction bar, both ways of saying it
for (const { MENU_HELP: help } of MAIN_TEXT) if (typeof help === 'string') { add(N.sentencesOf(help), 'MENU_HELP'); add(N.sentencesOf(help, { touch: true }), 'MENU_HELP (touch)'); }   // the menu's help line, both devices
const SILENT = evalConst('main.js', 'SILENT_HINTS') || new Set();   // shown on the bar, never read aloud
for (const { HINTS } of MAIN_TEXT) for (const [k, html] of Object.entries(HINTS)) if (!SILENT.has(k)) { add(N.hintSentences(html, false), `HINTS.${k}`); add(N.hintSentences(html, true), `HINTS.${k} (touch)`); }
// buttons the code builds by hand, and the road sign's choices with "Not yet" (pushed after the map)
for (const g of [['Go!'], ['Open the door!']]) add([N.choicesSentence(g)], 'buttons');
// the road sign's picker (hub.js openSign): the next one unbeaten first ('Next: <name>'), then the rest in road order
{ const ord = stops.map(s => s.boss.display_name || s.boss.name);
  for (let k = 0; k <= ord.length; k++) { const next = ord[k]; const labels = next ? [`<b>Next: ${next}</b>`, ...ord.filter(n => n !== next).map(n => `<b>${n}</b>`), 'Not yet'] : [...ord.map(n => `<b>${n}</b>`), 'Back'];
    add([N.choicesSentence(labels)], 'hub.js openSign');
    if (next) for (const w of A_WORDS) add(N.sentencesOf(`Next is ${next}. Press ${w} to go.`), 'hub.js openSign'); else add(N.sentencesOf(`You beat all ${ord.length}! Pick one to play again.`), 'hub.js openSign'); } }
// the town's spots, said when she walks up (main.js hubPrompt: 'Press Space.' on a keyboard, 'Press A.' on touch, 'Click.' with the trackpad; no 'Press' where A does nothing yet)
for (const m of src('hub.js').matchAll(/say:\s*'((?:\\'|[^'])+)'/g)) { const t = m[1].replace(/\\'/g, "'"); for (const w of ['Space', 'A']) add(N.sentencesOf(t.replace(/\bPress A\b/, `Press ${w}`)), 'hub.js spot'); add(N.sentencesOf(t.replace(/\bPress A\b/, 'Click')), 'hub.js spot (trackpad)'); add(N.sentencesOf(t.replace(/\s*Press A\.?\s*$/, '')), 'hub.js spot'); }
// what the bar says aloud (main.js HINT_SAY), both devices
for (const { SAY_MOVE } of MAIN_TEXT) { if (typeof SAY_MOVE === 'string') { add(N.hintSentences(SAY_MOVE, false), 'HINT_SAY'); add(N.hintSentences(SAY_MOVE, true), 'HINT_SAY (touch)'); } }
// the trick cards (tricks.js openTrick): every true line and trick for every boss, both titles, and the answer appended after
{ const T = await import(join(JS, 'tricks.js')); const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tails = ["He's dizzy. Grab the bags!", "He's dizzy, and the door is unlocked."];
  for (const s of stops) { const { truths, tricks } = T.trickPool(s, words);
    for (const q of [...truths, ...tricks]) {
      let body; if (q.kind === 'quote') body = `<p>${esc(s.boss.name)} says:</p><div class="quote">“${esc(q.text)}”</div><p>Is that <b>true</b>, or a <b>trick</b>?</p>`;
      else body = `<p>Someone says:</p><div class="quote">“${esc(q.text)}”</div><p>True, or trick?</p>`;
      for (const title of ['The gate', 'Spot the trick']) add(N.cardSentences(title, body, [{ label: 'True' }, { label: 'Trick!' }]), 'tricks.js');
      for (const tail of tails) add(N.sentencesOf(`<p><b>${q.trick ? 'Trick.' : 'True.'}</b> ${esc(String(q.why || '').replace(/^True\.\s*/, ''))}${q.kind === 'someone' && q.trick ? ' (That line was made up for this game.)' : ''} ${tail}</p>`), 'tricks.js answer');
    } } }
// the goal line over the game (main.js goalFor), read aloud when it changes: every count it can show
for (const t of ['Walk up to the road sign.', 'Pick the next billionaire at the road sign.', 'One more bag!']) add(N.sentencesOf(t), 'goal');
add(N.sentencesOf("You got the valley's money back!"), 'goal');
// the billionaire's grumble after his takedown (takedowns.js GRUMBLE, a toast)
{ const G = evalConst('takedowns.js', 'GRUMBLE') || {}; for (const [id, t] of Object.entries(G)) add(N.toastSentences(t, ''), `takedowns.js GRUMBLE.${id}`); }
// celebration.js 'Start over?': the count is the payers at runtime (every boss); the scan can't see it
add(N.sentencesOf(`All ${['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][stops.length] || stops.length} billionaires come back.`), 'celebration.js'); out.delete(N.clipKey('All one billionaires come back.'));
for (const t of ['Get to the door.', 'Spot the trick to open the door.', 'Go in!']) add(N.sentencesOf(t), 'goal');
for (const n of new Set(stops.map(s => (levelOf(s).friends || []).length))) for (let k = 0; k < n; k++) add(N.sentencesOf(`Free your friends: ${k} of ${n}`), 'goal');
for (const k of [0, 5, 10]) add(N.sentencesOf(`Bring 15 bags to the jar: ${k} of 15`), 'goal');   // main.js spokenGoal says only these counts
// the road start says the name only (main.js startRoad: narrate(display_name || name)); the shatter's toast
for (const st of stops) add(N.sentencesOf(st.boss.display_name || st.boss.name), 'main.js startRoad');
add(N.toastSentences('Legos for everybody!', ''), 'shatter.js');
// the Long Road's ratio line (unroll.js ratioLine, through ctx.narrate): this row against the longest row laid before it, so
// every pair can come up; the function is read from unroll.js as text and run on the same bag counts
{ const u = src('unroll.js'); const fn = u.slice(u.indexOf('const NUMW'), u.indexOf('\n', u.indexOf('const NUMW'))) + '\n' + u.slice(u.indexOf('function timesWord'), u.indexOf('export function createUnroll'));
  const ratioLine = new Function(fn + '\nreturn ratioLine;')(); const bagsOf = b => Math.max(1, Math.round(b.net_worth_usd / BAG_USD)), nm = b => b.display_name || b.name;
  for (const a of data.bosses) { add(N.sentencesOf(ratioLine(nm(a), null, 0)), 'unroll.js ratioLine'); for (const b of data.bosses) if (b !== a) add(N.sentencesOf(ratioLine(nm(a), nm(b), bagsOf(a) / bagsOf(b))), 'unroll.js ratioLine'); } }
// sentences a session missed (window.__narrate.narrationMisses())
// extra_sentences.json (beside this file): lines built from data at runtime that the call scan can't evaluate (the
// True-or-trick card's question and labels, the takedowns' "In our story..."), always collected
const EXTRA = join(HERE, 'extra_sentences.json');
for (const f of [...(existsSync(EXTRA) ? [EXTRA] : []), ...process.argv.slice(2)]) for (const s of JSON.parse(readFileSync(f, 'utf8'))) add(N.sentencesOf(s), f);

// the voice rule (narrate.js numberRuleOK): a sentence that breaks it is dropped unsaid at runtime (silent cards such as the
// grown-ups page are collected here too), so it gets no clip. Listed, so a spoken line that breaks the rule is seen.
const ruleDropped = [...out].filter(([, s]) => N.numberRuleOK && !N.numberRuleOK(s)); for (const [k] of ruleDropped) out.delete(k);
const cards = Object.fromEntries([...out].sort((a, b) => a[1].localeCompare(b[1])).map(([k, s]) => [k, [VOICE, SPEED, s]]));
writeFileSync(join(HERE, 'cards.json'), JSON.stringify(cards, null, 1) + '\n');
const todo = Object.fromEntries(Object.entries(cards).filter(([k]) => !existsSync(join(WEB, 'audio', `${k}.mp3`))));
const W = process.env.GERBIL_CARDS_DIR || join(tmpdir(), 'gerbil-cards'); mkdirSync(W, { recursive: true }); writeFileSync(join(W, 'todo.json'), JSON.stringify(todo, null, 1));
console.log(`${out.size} sentences → cards.json; ${Object.keys(todo).length} without an mp3 → ${join(W, 'todo.json')}`);
if (process.env.VERBOSE) for (const [k, s] of out) console.log(k, where.get(k).padEnd(28), s);
console.log(`\n${ruleDropped.length} sentences break the voice rule (no clip; the game drops them unsaid):`); for (const [k, t] of ruleDropped) console.log(`  ${(where.get(k) || '').padEnd(28)} ${t}`);
console.log(`\n${dynamic.size} dynamic sentences left to the browser voice:`); for (const [s, f] of dynamic) console.log(`  ${f.padEnd(28)} ${s}`);
