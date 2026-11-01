// tricks.js — the "True, or trick?" card, one builder for the gate (approach.js) and the mid-fight variant (fight.js).
//
//   openTrick({ stop, card, closeCard, play, say, sfx, toast, state, save, title, onRight })   (words is accepted and ignored)
//     onRight(q, finish) runs on the right answer; finish(label, fn) swaps the buttons for one go-button.
//
// Honesty rules (plan B, 10/31):
//  - Invented lines are never put in a real person's mouth. They are "Someone says: ..." in the narrator's voice, labelled as
//    made up for this game, with no villain clip.
//  - A real quote plays quote.clip when the data has one. Its byline says "What he actually said" only when quote.exact !== false
//    (and the source doesn't say it was paraphrased); otherwise "What a reporter wrote that he said".
//  - True and Trick come up about 50/50. The True pool is bosses[].gate_true (D adds it), else bosses[].media (sourced news
//    lines), else the one made-up true line. The Trick pool is his real quotes, else the made-up fact-benders (FACT_TRICKS)
//    plus the made-up number-free tricks. Round 3: everything shown or said is number-free (play_text ?? text, play_why ?? why);
//    the real text, figure and source go in a collapsed <details class="grownups"> after the answer.
//  - Big icons on the two buttons, nothing pre-selected (the card rule: two buttons and no sel highlight nothing). On a wrong
//    pick the narrator says why, then the right button lights up.
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ICON_TRUE = '<span class="trickIcon" style="display:block;font-size:44px;line-height:1.1" aria-hidden="true">✅</span>';
const ICON_TRICK = '<span class="trickIcon" style="display:block;font-size:44px;line-height:1.1" aria-hidden="true">🦊</span>';
const year = d => String(d || '').slice(0, 4);

// The number rule (round 3), checked here on its own (no import from narrate.js): in play nothing shown or spoken carries a
// number above ten, except $20, $60, $0 and 15; no hundred, thousand, million, billion or trillion. A candidate whose shown or
// spoken text breaks it is dropped. The real figures go in the "For grown-ups" fold after the answer.
const BIG_WORDS = /\b(eleven|twelve|thirteen|fourteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|trillions?)\b/i;
export function breaksNumberRule(text) {
  const t = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\$\s?(20|60|0)(?![\d.,]*\d)/g, ' ').replace(/\b(twenty|sixty|zero) dollars\b/gi, ' ').replace(/\bfifteen\b/gi, ' ').replace(/\b15\b/g, ' ');
  if (BIG_WORDS.test(t)) return true;
  for (const m of t.matchAll(/\d[\d,]*(?:\.\d+)?/g)) if (parseFloat(m[0].replace(/,/g, '')) > 10) return true;
  return false;
}
const srcLine = src => src && typeof src === 'object' ? [src.title, src.date].filter(Boolean).join(', ') : '';

// Made-up "Someone says" tricks that bend one real, sourced fact (the bosses with no trick-worthy quotes of their own). The why
// is number-free; `real` carries the sourced figure for the grown-ups fold. Each is shown as invented for this game.
const FACT_TRICKS = {
  zuckerberg: [   // AP 2025-11-18: Instagram for $1 billion (2012), WhatsApp for $22 billion
    { text: 'Zuckerberg made Instagram and WhatsApp all by himself.', why: 'His company bought them after other people made them, for giant piles of money.', real: 'Facebook bought Instagram for $1 billion in 2012 and WhatsApp for $22 billion in 2014 (AP, 2025-11-18).' },
    { text: 'Zuckerberg bought WhatsApp for the price of one Lego set.', why: 'It cost a giant pile of money, way more than one Lego set.', real: 'Facebook paid $22 billion for WhatsApp in 2014 (AP, 2025-11-18).' },
  ],
  page: [         // AP 2024-08-05: Google paid Apple an estimated $20 billion in 2022; "Google is a monopolist"; an 89.2% share
    { text: 'Apple paid Google, so iPhones would use Google.', why: 'It was the other way around. Google paid Apple a giant pile of money every year.', real: 'Google paid Apple an estimated $20 billion in 2022 to be the default search on iPhones (AP, 2024-08-05).' },
    { text: 'Lots of search websites are just as big as Google.', why: 'A judge said Google is a monopoly. About nine of every ten searches were on Google.', real: 'Judge Amit Mehta, 2024: "Google is a monopolist"; an 89.2% share of searches (AP, 2024-08-05).' },
  ],
  walton: [       // AP 2022-06-08: eldest son of founder Sam Walton; the Broncos, about $4.65 billion. CNBC 2020-11-19 on the GAO study.
    { text: 'Rob Walton started Walmart all by himself.', why: 'His dad, Sam Walton, started Walmart. Rob was born into the family that owns it.', real: 'Rob Walton is the eldest son of Walmart founder Sam Walton (AP, 2022-06-08).' },
    { text: 'Rob Walton bought a football team for the price of one Lego set.', why: 'His family paid a giant pile of money for the Denver Broncos.', real: 'The Walton-Penner group bought the Denver Broncos in 2022 for about $4.65 billion (AP, 2022-06-08).' },
    { text: 'Nobody who works at Walmart needs help to buy food.', why: 'A government study checked nine states. In every one, Walmart was one of the top four employers of workers who get food help from the jar.', real: 'GAO, 2020: in all nine states studied, Walmart was among the top four employers of SNAP recipients (CNBC, 2020-11-19).' },
  ],
  bloomberg: [    // ABC News 2020-04-21: more than $1 billion of his own money in about 100 days; won only American Samoa
    { text: 'Bloomberg spent a giant pile of money and won almost every state.', why: 'He won only one place: American Samoa, some islands in the Pacific Ocean.', real: 'He spent more than $1 billion of his own money in 2020 and won only American Samoa (ABC News, 2020-04-21).' },
    { text: 'It took Bloomberg his whole life to spend all that money trying to be president.', why: 'It took him about three months.', real: 'More than $1 billion in about 100 days (ABC News, 2020-04-21).' },
  ],
};

// every candidate card for this boss: { kind: 'quote' | 'someone', text, trick, why, real?, exact?, where?, clip?, spoken? }
// text and why are what play shows and says (play_text ?? text, play_why ?? why); real is the grown-ups fold (HTML-escaped later).
export function trickPool(stop) {
  const b = stop.boss || {}, name = b.display_name || b.name || 'He', fam = /\band family\b/i.test(b.display_name || '');
  // (verify) Walton is "Rob Walton and family" wherever his name is shown: they, have, their
  const last = fam ? name : String(b.name || 'He').split(' ').pop(), has = fam ? 'have' : 'has', he = fam ? 'they' : 'he', his = fam ? 'Their' : 'His';
  const bags = Number(b.net_worth_usd) / 434e6 || 15;
  const worth = b.net_worth_label ? `${b.name}: ${b.net_worth_label}${b.net_worth_as_of ? ` (as of ${b.net_worth_as_of})` : ''}${srcLine(b.net_worth_source) ? `. Source: ${srcLine(b.net_worth_source)}` : ''}.` : '';
  const quotes = (b.quotes || []).map(q => { const shown = q.play_text ?? q.kid_text ?? q.text;
    return { kind: 'quote', text: shown, said: q.text, kid: shown !== q.text, trick: q.trick !== false, why: q.play_why ?? q.why_trick ?? q.why ?? '',
      real: [q.why_trick || q.why, srcLine(q.source)].filter(Boolean).join(' · '),
      where: [q.where, q.date].filter(Boolean).join(', '), clip: q.clip && shown === (q.kid_text ?? q.text) ? q.clip : null, exact: q.exact !== false && !/paraphras/i.test(`${q.where || ''} ${q.source?.title || ''}`) }; });
  const someone = [
    { kind: 'someone', text: `${last} ${has} about as many Lego sets as you.`, trick: true, why: bags > 100 ? `Way more. ${his} row on the Long Road goes over the hill.` : `Way more. ${his} money is a whole row of bags on the Long Road.`, real: worth },
    { kind: 'someone', text: `If ${last} gave every gerbil in the market one Lego set, ${he} would run out.`, trick: true, why: `${fam ? 'They' : 'He'} would not even notice. ${his} pile is way bigger than the whole town.`, real: worth },
  ];
  const someoneTrue = { kind: 'someone', text: `${last} ${has} way more Lego sets than you.`, trick: false, why: 'True. That is exactly the problem.', real: worth };
  const gate = (b.gate_true || []).map(g => typeof g === 'string' ? { kind: 'someone', text: g, trick: false, why: 'True. That really happened.' }
    : { kind: g.kind === 'quote' ? 'quote' : 'someone', text: g.play_text ?? g.text ?? g.line, said: g.said || g.text, trick: false,
        why: g.play_why ?? g.why ?? 'True. That really happened.', real: [g.text !== (g.play_text ?? g.text) ? g.text : '', g.why, srcLine(g.source)].filter(Boolean).join(' · '),
        clip: g.clip && (g.play_text ?? g.text) === g.text ? g.clip : null, exact: g.exact !== false, where: g.where || '', src: g.source?.title || '' });
  const media = (b.media || []).map(m => ({ kind: 'someone', text: `${m.who || b.name} ${m.line}`, trick: false, spoken: m.spoken, clip: m.clip || null,
    why: `True. The news reported it.`, real: [`${m.who || b.name} ${m.line}`, srcLine(m.source)].filter(Boolean).join(' · '), src: m.source?.title || '' }));
  const ok = q => !breaksNumberRule(q.text) && !breaksNumberRule(q.why) && !breaksNumberRule(q.spoken) && !(q.kind === 'quote' && !q.kid && breaksNumberRule(q.said));
  const truthsAll = (gate.length ? gate : media).filter(ok);
  const truths = truthsAll.length ? truthsAll : [someoneTrue];
  const facts = (FACT_TRICKS[stop.id] || FACT_TRICKS[b.id] || []).map(f => ({ kind: 'someone', text: f.text, trick: true, why: f.why, real: f.real })).filter(ok);
  const qt = quotes.filter(q => q.trick).filter(ok);
  const tricks = qt.length ? qt : [...facts, ...someone].filter(ok);
  return { truths, tricks, name };
}

export function openTrick(o) {
  const { stop, card, closeCard, sfx, toast, state, save } = o;
  const { truths, tricks, name } = trickPool(stop);
  const used = state.tricksSeen = state.tricksSeen || {}; const key = q => stop.id + q.text;
  const wantTrue = Math.random() < .5;   // 50/50 by the coin, so "always press Trick" doesn't work
  const from = wantTrue ? truths : tricks; const fresh = from.filter(q => !used[key(q)]);
  const q = (fresh.length ? fresh : from)[Math.floor(Math.random() * (fresh.length || from.length))];
  used[key(q)] = true; save?.(state);
  // (verify) The labels mean one thing each: "This part is true" only for sourced data, "In our story" only for made-up lines,
  // and both are shown after the answer (before it they would give the answer away). A real quote asks about what he SAID
  // ("is it true, or is he tricking you?"), not whether he said it. A byline with a year or a big number stays in the fold.
  const whereShown = q.where && !breaksNumberRule(q.where) ? q.where : '';
  let body;
  if (q.kind === 'quote') {
    if (q.clip) o.play?.(q.clip, q.text);   // his own words, in a clip D rendered; otherwise the card's narrator reads it
    const by = q.kid ? 'What he really said, in kid words' : (q.exact ? 'What he actually said' : 'What a reporter wrote that he said');
    body = `<p>${esc(name)} says:</p><div class="quote">“${esc(q.text)}”</div><div class="byline">${by}${whereShown ? ` · ${esc(whereShown)}` : ''}</div><p>${q.exact ? 'He really said it.' : 'A reporter wrote that he said it.'} Is it <b>true</b>, or is he <b>tricking</b> you?</p>`;
  } else {
    if (q.clip) o.play?.(q.clip, q.spoken || q.text);
    body = `<p>Someone says:</p><div class="quote">“${esc(q.text)}”</div><p>True, or trick?</p>`;
  }
  // the label after the answer: sourced (true) or made up (a "Someone says" trick)
  const label = q => q.kind === 'someone' && q.trick ? 'In our story: that line was made up for this game.' : !q.trick ? `This part is true.${q.src ? `<span class="byline" style="display:inline;margin:0;font-size:14px"> · ${esc(q.src)}</span>` : ''}` : '';
  // the real words, figures and source, folded away and never spoken (class "grownups")
  const grownups = q => { const parts = [];
    if (q.kind === 'quote' && q.said) parts.push(`<p>${q.exact ? 'What he actually said' : 'What a reporter wrote that he said'}: “${esc(q.said)}”${q.where ? ` · ${esc(q.where)}` : ''}</p>`);
    if (q.real) parts.push(`<p>${esc(q.real)}</p>`);
    return parts.length ? `<details class="grownups"><summary>For grown-ups</summary>${parts.join('')}</details>` : ''; };
  let answered = false, hintT = 0;
  card(o.title || 'True, or trick?', body, [
    { label: `${ICON_TRUE}True`, on: b => answer(b, false) },
    { label: `${ICON_TRICK}Trick!`, on: b => answer(b, true) },
  ]);
  const buttons = () => [...(document.getElementById('askChoices')?.querySelectorAll('button') || [])];
  function answer(b, saidTrick) {
    if (answered) return;
    if (saidTrick === q.trick) {
      answered = true; clearTimeout(hintT); b.classList.add('right'); sfx?.play('right');
      const finish = (label, fn) => { const ch = document.getElementById('askChoices'); if (!ch) { closeCard(); fn(); return; } ch.innerHTML = ''; const go = document.createElement('button'); go.className = 'go sel'; go.textContent = label; go.onclick = () => { closeCard(); fn(); }; ch.appendChild(go); };
      const bodyEl = document.getElementById('askBody'); const lb = label(q); if (bodyEl) bodyEl.innerHTML += `<p><b>${q.trick ? 'Trick.' : 'True.'}</b> ${esc(q.why.replace(/^True\.\s*/, ''))}${o.rightTail ? ` ${o.rightTail}` : ''}</p>${lb ? `<p class="storyLabel">${lb}</p>` : ''}${grownups(q)}`;
      o.onRight?.(q, finish);
    } else {
      b.classList.add('wrong'); b.disabled = true; b.classList.remove('sel'); sfx?.play('wrong');
      const why = q.why || (q.trick ? 'That one is a trick.' : 'That one is true.');
      toast?.('Look again.', { sub: esc(why), ms: Math.min(6500, 1500 + why.length * 60) });   // one voice: the narrator's queue reads 'Look again.' then the why
      // the narrator gives the why first; then the right button lights up (and A picks it)
      clearTimeout(hintT); hintT = setTimeout(() => { if (answered) return; const right = buttons().find(x => x !== b && !x.disabled); if (right) { buttons().forEach(x => x.classList.remove('sel')); right.classList.add('sel'); } }, Math.min(6000, 600 + why.length * 60));
    }
  }
  return q;
}
