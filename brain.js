// StickBuddies — the BRAIN. Homemade JavaScript AI, no internet, no API key.
//
// How a buddy thinks, every moment:
//   1. NEEDS    energy, fun, social, curiosity slowly change over time.
//   2. DECIDE   a NEURAL NETWORK (nn.js) looks at how the buddy feels and what's around it,
//               and picks a goal (explore, rest, play tag, spar, say hi, watch you...).
//               It starts out guessing. After each goal it gets a REWARD (did that make me
//               feel better?) and learns from it (Q-learning), so it gets smarter over time.
//   3. PLANS    a goal becomes a list of steps ("walk to that window", "jump", "wave").
//               If a step fails, the plan fails and they think again.
//   4. TEAMWORK buddies send each other requests: "boost me up there?", "play tag?",
//               "spar?", "high five?". The friend decides yes or no by nodding or shaking
//               their head, using their own needs and how much they like the asker.
//   5. JUMPING  a second neural network learns how hard to jump and when to double-jump
//               to land on a window. They miss a lot at first, then get good. When it
//               predicts a window is too high, they ask a friend for a boost.
//   6. TASTE    they form their OWN opinions about what you do on the computer (games, videos,
//               apps, songs) and about their own activities: AWESOME / pretty good / this is fine /
//               meh / ugh this sucks. It comes from their personality plus how things actually go
//               for them (not dice rolls). It's written to 'what they like.txt'.
//   7. TEAM     no best friends. They're one team: they always help each other and never say no.
//   8. MEMORY   whether they can trust YOU (gentle hands = trust, flinging = wary).
//   Everything they learn is saved, so they keep getting smarter every time you run them.
//   They never talk and there are no signs over their heads. Like in the videos, they show
//   everything with body language.
'use strict';

const CAST = [
  { id: 'tsc', name: 'The Second Coming', short: 'TSC', color: '#ff7b1c',
    pers: { curious: .95, play: .6, spar: .6, calm: .45, helpful: .8, speed: 1 } },
  { id: 'red', name: 'Red', short: 'Red', color: '#ed1c24',
    pers: { curious: .5, play: .8, spar: .95, calm: .15, helpful: .5, speed: 1.12 } },
  { id: 'green', name: 'Green', short: 'Green', color: '#22b14c',
    pers: { curious: .6, play: .95, spar: .5, calm: .4, helpful: .7, speed: 1.05 } },
  { id: 'blue', name: 'Blue', short: 'Blue', color: '#1c6fd9',
    pers: { curious: .5, play: .5, spar: .3, calm: .9, helpful: .95, speed: .95 } },
  { id: 'yellow', name: 'Yellow', short: 'Yellow', color: '#ffd400',
    pers: { curious: .95, play: .5, spar: .35, calm: .6, helpful: .9, speed: 1 } },
];

// Everything they learned last time (memory.json in the StickBuddies folder).
let savedMem = {};
try { savedMem = PC.loadMemory() || {}; } catch { savedMem = {}; }
let musicOn = false;
const games = []; // shared activities between buddies (tag, spar, high fives, boosts)
let lastBigGame = -60; // tag and sparring need a break in between

function weighted(items, weights) {
  let sum = 0; for (const w of weights) sum += w;
  let r = Math.random() * sum;
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}
function sameFloor(a, b) { return floorOf(a) === floorOf(b); }
function pointAt(b, x, y) {
  const dx = x - b.x, dy = y - (b.y - 44 * S);
  b.face(x);
  b.pointAng = Math.atan2(Math.abs(dx), dy); // 0 = down, PI = straight up
}

// ---------------------------------------------------------------- steps (the building blocks of a plan)
const STEP = {
  // Walk / jump / drop to a spot, which can be on the ground or on top of a window.
  go(br, s) {
    const b = br.b;
    let win = s.win || null, x = s.x;
    if (s.follow) {
      const o = s.follow;
      if (!o || o.held) return 'fail';
      const gap = s.gap ?? 40;
      if (Math.abs(o.x - b.x) <= gap + 8 && sameFloor(o, b) && b.onGround) { b.face(o.x); return 'done'; }
      win = o.standWin; x = o.x - Math.sign(o.x - b.x || 1) * gap;
    }
    const tgt = win ? (plats.find(p => p.win === win && x >= p.x1 - 4 && x <= p.x2 + 4) || plats.find(p => p.win === win)) : allFloors()[0];
    if (!tgt) return 'fail';
    x = win ? clamp(x, tgt.x1 + 12, tgt.x2 - 12) : clamp(x, 14, W - 14);
    const spd = (s.speed || 160) * br.p.speed;
    if (s.t > (s.timeout || 20)) return 'fail';

    if (!b.onGround) {
      b.wantVx = clamp((x - b.x) * 4, -spd * 1.6, spd * 1.6);
      if (s.climbing && b.jumps === 1 && s.t >= s.djAt) b.jump(); // double jump when the jump brain said to
      return 'running';
    }
    const here = floorOf(b);
    if (s.climbing) { // just landed after trying to jump up
      s.climbing = false;
      const ok = b.standWin === win;
      if (!s.boosted) br.jumpSkill.learn(s.climbH, s.jp, s.jd, ok);
      if (!ok) {
        b.show(pick(['…', '?']));
        if (s.boosted) return 'fail';
        s.fails = (s.fails || 0) + 1;
        if (s.fails >= 3) return 'needBoost';
      }
    }
    const onTarget = here.win === win && x >= here.x1 - 2 && x <= here.x2 + 2;
    if (onTarget) return (b.walkTo(x, spd) || Math.abs(b.x - x) < 8) ? 'done' : 'running';

    const dy = here.y - tgt.y;
    if (dy > 4) { // it's higher than me
      // ask the jump brain: can I make this? (only once it has some experience)
      // (while still learning they sometimes try anyway, so they keep practicing)
      if (!s.boosted && br.jumpSkill.tries >= 8 && !s.checked) { s.checked = true; if (br.jumpSkill.chance(dy) < .15 && Math.random() > br.jumpSkill.eps) return 'needBoost'; }
      const lo = Math.max(tgt.x1 + 18, here.x1 + 4), hi = Math.min(tgt.x2 - 18, here.x2 - 4);
      if (lo > hi) { if (here.win) { b.dropT = .3; return 'running'; } return 'fail'; }
      const lx = clamp(x, lo, hi);
      if (Math.abs(b.x - lx) > 10) { b.walkTo(lx, spd * 1.2); return 'running'; }
      const J = br.jumpSkill.choose(dy);
      b.wantVx = 0; b.jump(false, J.p); s.climbing = true; s.climbH = dy; s.jp = J.p; s.jd = J.d; s.djAt = s.t + J.d;
      return 'running';
    }
    // it's lower (or a different window at the same height): step off
    if (!here.win) return 'fail';
    b.walkTo(x, spd);
    if (x >= here.x1 && x <= here.x2) b.dropT = .3;
    return 'running';
  },
  // Stand still doing a pose for a while (or until something happens).
  wait(br, s, dt) {
    const b = br.b;
    b.wantVx = 0;
    if (s.face === 'cursor') b.face(mouse.x);
    else if (s.face && s.face.x !== undefined) b.face(s.face.x);
    if (s.anim) br.pose(s.anim);
    if (s.icon && !s.shown && s.t >= (s.iconAt || 0)) { b.show(s.icon); s.shown = true; }
    if (s.regen) br.needs.energy = Math.min(1, br.needs.energy + s.regen * dt);
    if (s.until && s.until()) return 'done';
    return s.t >= s.dur ? 'done' : 'running';
  },
  // A custom bit of behaviour.
  do(br, s, dt) { return s.fn(br, s, dt); },
};
const go = (win, x, speed, extra) => Object.assign({ kind: 'go', win, x, speed, djAt: 1e9 }, extra);
const wait = (dur, anim, extra) => Object.assign({ kind: 'wait', dur, anim }, extra);
const act = (fn, extra) => Object.assign({ kind: 'do', fn }, extra);

// ---------------------------------------------------------------- shared activities
function newJob(type, data) { const j = Object.assign({ type, t: 0, over: false, replies: new Map() }, data); games.push(j); return j; }
function updateGames(dt) {
  for (const g of games) {
    g.t += dt;
    if ((g.type === 'tag' || g.type === 'spar') && !g.over && g.t > g.dur) { g.over = true; lastBigGame = now; }
    if (g.t > 120) g.over = true; // safety net
  }
  for (const g of games) if (g.over && g.overAt === undefined) g.overAt = g.t;
  for (let i = games.length - 1; i >= 0; i--) if (games[i].over && games[i].t > games[i].overAt + 8) games.splice(i, 1);
}
function inGame(br) { return br.goal && ['tagPlay', 'spar', 'helpBoost', 'greetReply', 'waitGame'].includes(br.goal.name); }

// ---------------------------------------------------------------- goals
const GOALS = {
  // ---- go look at somewhere new
  explore: {
    label: 'exploring',
    util: br => .08 + br.needs.curiosity * .7 * br.p.curious,
    make(br) {
      const b = br.b;
      let best = null, bs = -1e9;
      for (let i = 0; i < 12; i++) {
        const f = pick(allFloors());
        if (f.win && br.mem.noReach[f.win] > now) continue;
        const x = rand(f.x1 + 15, Math.min(f.x2, W) - 15);
        const height = floorOf(b).y - f.y;
        let sc = br.novelty(f.win, x) - Math.abs(x - b.x) / 3000 + (f.win ? .15 * br.p.curious : 0);
        if (height > 30 && br.jumpSkill.tries >= 4 && br.jumpSkill.chance(height) < .3) sc -= .2;
        if (sc > bs) { bs = sc; best = { win: f.win, x }; }
      }
      if (!best) return null;
      const steps = [go(best.win, best.x, 150), wait(rand(1.2, 2.5), 'lookAround')];
      if (Math.random() < .3) steps.push(wait(1.2, 'think', { icon: '?' }));
      return steps;
    },
    after(br, failed) { if (!failed) br.needs.curiosity = Math.max(0, br.needs.curiosity - .35); },
  },

  // ---- rest: sit, dangle legs off a window edge, or lie down
  rest: {
    label: 'resting',
    util: br => (1 - br.needs.energy) ** 2 * 1.4 + br.p.calm * .04,
    make(br) {
      // Resting = lying down flat (on the taskbar or on top of a window).
      const b = br.b, here = floorOf(b), dur = rand(10, 18);
      const regen = .06;
      let x = b.x;
      if (here.win) x = clamp(x, here.x1 + 30 * S, here.x2 - 30 * S); // not hanging off the edge
      // leave room if a teammate is already lying there
      while (bodies.some(o => o !== b && o.anim === 'lie' && sameFloor(o, b) && Math.abs(o.x - x) < 45 * S) && Math.abs(x - b.x) < 300) x += 50 * S * (b.x < W / 2 ? 1 : -1);
      return [go(here.win, x, 120, { timeout: 6 }), wait(dur, 'lie', { regen })];
    },
  },

  // ---- you, the animator: be curious about the cursor (or careful, if you've been rough)
  animator: {
    label: 'watching you',
    util: br => {
      if (br.cool.animator > 0 || realNow - mouse.t > 3 || mouse.grab) return 0;
      const d = Math.hypot(mouse.x - br.b.x, mouse.y - br.b.y);
      if (d > 520) return 0;
      if (br.mem.trust < .3) return .55;
      return .2 + br.p.curious * .35 + (br.mem.trust - .5) * .3;
    },
    make(br) {
      br.cool.animator = rand(20, 40);
      const b = br.b;
      br.needs.curiosity = Math.max(0, br.needs.curiosity - .1);
      if (br.mem.trust > .5) br.needs.fun = Math.min(1, br.needs.fun + .12);
      if (br.mem.trust < .3) { // wary: back away and keep an eye on you
        const away = b.x + Math.sign(b.x - mouse.x || 1) * 220;
        return [go(floorOf(b).win, away, 220), wait(2.2, 'stance', { face: 'cursor', icon: '!' })];
      }
      const steps = [wait(.8, 'lookAround', { face: 'cursor' }), wait(1.3, 'wave', { face: 'cursor', icon: pick(['!', '?']) })];
      if (br.mem.trust > .6 && mouse.y > b.y - 240 && Math.abs(mouse.x - b.x) < 400) {
        steps.push(go(floorOf(b).win, mouse.x - 20 * Math.sign(mouse.x - b.x || 1), 150, { timeout: 5 }));
        steps.push(act((br2, s) => { pointAt(b, mouse.x, mouse.y); br2.pose('point'); if (!s.shown) { b.show('♥'); s.shown = true; } return s.t > 1.4 ? 'done' : 'running'; }));
      }
      return steps;
    },
  },

  // ---- say hi to a friend with a high five
  greet: {
    label: 'saying hi',
    util: br => {
      const f = br.pickFriend(o => !inGame(o.brain) && !(o.brain.goal && o.brain.goal.name === 'rest'));
      return f && (now - (br.mem.lastGreet[f.id] || -999)) > 120 ? .05 + br.needs.social * .6 : 0;
    },
    make(br) {
      const F = br.pickFriend(o => !inGame(o.brain));
      if (!F) return null;
      br.mem.lastGreet[F.id] = now;
      const job = newJob('greet', { a: br.b, b: F });
      return [
        go(null, 0, 170, { follow: F, gap: 110, timeout: 8 }),
        act((br2, s) => { // ask
          br2.pose('wave'); br2.b.face(F.x);
          if (!s.sent) { s.sent = true; F.brain.inbox.push({ type: 'greet', from: br2.b, job }); }
          if (job.replies.has(F)) {
            if (job.replies.get(F)) return 'done';
            s.declined = true;
          }
          if (s.declined) { br2.pose('shrug'); if (!s.shown) { br2.b.show('…'); s.shown = true; } return s.t > 3.2 ? 'fail' : 'running'; }
          return s.t > 3.5 ? 'fail' : 'running';
        }),
        ...highFiveSteps(job, F),
      ];
    },
    after(br, failed) { if (!failed) br.needs.social = 0; },
  },

  // ---- invite friends to play tag
  tag: {
    label: 'starting tag',
    util: br => {
      if (showing || schoolMode || br.cool.tag > 0 || br.needs.energy < .5 || now - lastBigGame < 100 || games.some(g => (g.type === 'tag' || g.type === 'spar') && !g.over)) return 0;
      const free = bodies.filter(o => o !== br.b && !inGame(o.brain) && !o.held && o.brain.needs.energy > .35);
      return free.length >= 2 ? br.needs.fun * br.p.play * .9 : 0;
    },
    make(br) {
      br.cool.tag = rand(90, 160);
      const others = bodies.filter(o => o !== br.b && !inGame(o.brain) && !o.held)
        .sort((a, c) => Math.abs(a.x - br.b.x) - Math.abs(c.x - br.b.x)).slice(0, 3);
      const job = newJob('tagInvite', {});
      return [
        act((br2, s) => {
          const mid = others.reduce((m, o) => m + o.x, 0) / others.length;
          pointAt(br2.b, mid, br2.b.y - 60); br2.pose('point');
          if (!s.sent) { s.sent = true; br2.b.show('!'); for (const o of others) o.brain.inbox.push({ type: 'tag', from: br2.b, job }); }
          if (s.t < 2.2 && job.replies.size < others.length) return 'running';
          const yes = others.filter(o => job.replies.get(o));
          if (!yes.length) { s.fail = true; return 'done'; }
          const game = newJob('tag', { players: [br2.b, ...yes], it: br2.b, dur: rand(25, 40), immune: null, immuneUntil: 0 });
          job.game = game;
          return 'done';
        }),
        act((br2, s) => {
          if (!job.game) { br2.pose('shrug'); if (!s.shown) { br2.b.show('…'); s.shown = true; } return s.t > 1.2 ? 'fail' : 'running'; }
          br2.setGoal('tagPlay', [act(tagTick, { game: job.game })]);
          return 'running';
        }),
      ];
    },
  },

  // ---- friendly sparring match (no one gets hurt)
  spar: {
    label: 'asking to spar',
    util: br => {
      if (showing || schoolMode || br.cool.spar > 0 || br.needs.energy < .55 || now - lastBigGame < 60 || games.some(g => g.type === 'spar' && !g.over)) return 0;
      return br.pickFriend(o => !inGame(o.brain) && o.brain.needs.energy > .5) ? br.needs.fun * br.p.spar * .75 : 0;
    },
    make(br) {
      br.cool.spar = rand(80, 150);
      const F = br.pickFriend(o => !inGame(o.brain) && o.brain.needs.energy > .5);
      if (!F) return null;
      const invite = newJob('sparInvite', {});
      return [
        go(null, 0, 180, { follow: F, gap: 90, timeout: 8 }),
        act((br2, s) => {
          br2.b.face(F.x); br2.pose(s.t < 1 ? 'stance' : 'point');
          pointAt(br2.b, F.x, F.y - 40);
          if (!s.sent) { s.sent = true; F.brain.inbox.push({ type: 'spar', from: br2.b, job: invite }); }
          if (invite.replies.has(F)) {
            if (!invite.replies.get(F)) { br2.pose('shrug'); return s.t > 3 ? 'fail' : 'running'; }
            const game = newJob('spar', { a: br2.b, b: F, dur: rand(10, 16), hits: {}, ready: new Set() });
            invite.game = game;
            br2.setGoal('spar', [act(sparTick, { game, other: F })]);
            return 'running';
          }
          return s.t > 3.5 ? 'fail' : 'running';
        }),
      ];
    },
  },

  // ---- practice moves alone (flips, punches, kicks)
  practice: {
    label: 'practicing moves',
    util: br => (br.needs.energy > .5 ? br.p.spar * .15 * br.needs.energy : 0),
    make(br) {
      const b = br.b;
      const move = (anim, dur) => act((br2, s) => { b.animE = clamp(s.t / (dur * .4), 0, 1); br2.pose(anim); return s.t > dur ? 'done' : 'running'; });
      return [
        wait(.6, 'stance'),
        act((br2, s) => { if (!s.j) { s.j = true; b.jump(true); } return b.onGround && s.t > .2 ? 'done' : 'running'; }),
        move('punch', .35), move('punch', .35), move('kick', .5),
        wait(.5, 'stance'),
      ];
    },
    after(br) { br.needs.energy -= .08; br.needs.fun = Math.min(1, br.needs.fun + .15); },
  },

  // ---- dance (only when there's music)
  dance: {
    label: 'dancing',
    util: br => {
      if (!musicOn && !(ears.sureFor > 8)) return 0;
      if (schoolMode) return 0; // you're doing schoolwork: no dance parties
      if (showing && (showing.thing.kind === 'game' || showing.thing.gameVideo)) return 0; // watching you play, not dancing
      const party = bodies.some(o => o !== br.b && o.anim === 'dance' && Math.abs(o.x - br.b.x) < 300);
      return .08 + br.needs.fun * .4 + (party ? .3 : 0);
    },
    make(br) {
      br.startDance(ears.mood() || 'groove', []);
      return [act((br2, s) => { br2.syncToBeat(); br2.danceEffects(); br2.pose('dance'); br2.b.wantVx = 0; return (s.t > 25 || (!ears.isMusic && !musicOn)) ? 'done' : 'running'; })];
    },
    after(br) { br.needs.fun = Math.min(1, br.needs.fun + .25 * (1 + br.danceNow?.feel || 1)); br.endDance(); },
  },

  // ---- you're playing a game or watching a video: sit down together and watch
  watch: {
    label: 'watching you',
    util: br => {
      if (!showing) return 0;
      const others = bodies.filter(o => o !== br.b && o.brain.goal && o.brain.goal.name === 'watch').length;
      return Math.max(.02, .15 + br.scoreOf(showing.thing) * .45 + others * .12);
    },
    after(br) { br.endDance(); },
    make(br) {
      const th = showing.thing, idx = CAST.findIndex(c => c.id === br.b.id);
      const seat = clamp(W / 2 + (idx - 2) * 48 * S, 30, W - 30); // everyone gets their own seat in a row
      return [go(null, seat, 200, { timeout: 12 }), act((br2, s, dt) => watchTick(br2, s, dt, th))];
    },
  },

  // ---- climb onto the window you're using (or walk under it) and check it out
  visitWindow: {
    label: 'checking out your window',
    util: br => (focus && br.cool.visit <= 0 ? .08 + br.needs.curiosity * .35 : 0),
    make(br) {
      br.cool.visit = rand(40, 90);
      const f = focus, th = f.thing;
      const plat = plats.find(p => p.win === f.win && p.x2 - p.x1 > 60);
      const inspect = act((br2, s, dt) => {
        br2.feel(th, dt, 3);
        pointAt(br2.b, (f.x1 + f.x2) / 2, (f.y1 + f.y2) / 2);
        br2.pose(s.t < 1.6 ? 'lookDown' : 'think');
        return s.t > 3.2 ? 'done' : 'running';
      });
      const verdict = act((br2, s) => { br2.pose(poseForScore(br2.scoreOf(th))); return s.t > 1.5 ? 'done' : 'running'; });
      if (plat) return [go(plat.win, rand(plat.x1 + 20, plat.x2 - 20), 170), inspect, verdict];
      return [go(null, clamp((f.x1 + f.x2) / 2 + rand(-120, 120), 30, W - 30), 170), inspect, verdict];
    },
    after(br) { br.needs.curiosity = Math.max(0, br.needs.curiosity - .2); },
  },

  // ---- write a real program (and run it)
  code: {
    label: 'coding',
    util: br => {
      if (br.cool.code > 0 || showing) return 0;
      const likes = affinity(br, { key: 'coding', kind: 'code' });
      return Math.max(.01, .04 + Math.max(0, likes) * .5 + (focus && focus.thing.kind === 'code' ? .35 : 0));
    },
    make(br) {
      br.cool.code = rand(90, 200);
      // They write their OWN program from code blocks (coder.js), try it in _trying.js,
      // and only save it for real if it works and they think it's good.
      const b = br.b, prog = composeProgram(br);
      return [
        wait(1.2, 'think'),
        act((br2, s) => { br2.pose('code'); b.wantVx = 0; br2.needs.curiosity = Math.max(0, br2.needs.curiosity - .004); return s.t > prog.typeTime ? 'done' : 'running'; }),
        act((br2, s) => {
          br2.pose('code');
          if (!s.sent) {
            s.sent = true;
            PC.writeCode(b.name, '_trying.js', prog.text).then(r => { s.result = r || { ok: false }; }).catch(() => { s.result = { ok: false }; });
          }
          return s.result ? 'done' : s.t > 8 ? 'done' : 'running';
        }, { id: 'run' }),
        act((br2, s) => {
          const r = br2.steps.find(x => x.id === 'run').result || { ok: false, out: '' };
          if (!s.logged) {
            s.logged = true;
            const { score, better } = learnFromProgram(br2, prog, r.ok, r.out);
            s.mood = !r.ok ? 'facepalm' : better ? 'cheer' : score > .3 ? 'nod' : 'shrug';
            if (better) {
              PC.writeCode(b.name, prog.file, prog.text).catch(() => {}); // it's good: save it for real
              br2.programs[prog.file] = { version: prog.version, ok: true, when: new Date().toLocaleString(), score: +score.toFixed(2) };
              likesDirty = true;
            }
            const err = (r.out || '').split('\n').find(l => /Error/.test(l)) || 'error';
            console.log(`${b.def.short} ${prog.improving ? 'tried to improve' : 'wrote a new'} program: ${prog.file} -> ${!r.ok ? 'CRASHED (' + err + ')' : better ? 'works and it is better! saved v' + prog.version : 'works, but not better. try again later'}`);
            br2.needs.fun = clamp(br2.needs.fun + (!r.ok ? -.05 : better ? .25 : .08), 0, 1);
          }
          br2.pose(s.t < 1.2 ? s.mood : (s.mood === 'cheer' ? 'nod' : s.mood));
          return s.t > 2 ? 'done' : 'running';
        }),
      ];
    },
  },

  // ---- you're doing schoolwork: sit quietly and "study" with you
  study: {
    label: 'studying with you',
    util: br => (schoolMode ? .25 + br.p.calm * .3 + br.p.helpful * .2 : 0),
    make(br) {
      const idx = CAST.findIndex(c => c.id === br.b.id);
      br.b.bookColor = ['#8a5a2b', '#2b5a8a', '#6a2b8a', '#2b8a4f', '#8a2b3a'][idx];
      return [
        go(null, clamp(W * .12 + idx * 55 * S, 30, W - 30), 150, { timeout: 12 }),
        act((br2, s, dt) => {
          if (br2.cheerOnce) { br2.cheerOnce = false; s.cheerUntil = s.t + 1.6; }
          br2.pose(s.cheerUntil && s.t < s.cheerUntil ? 'cheer' : 'read'); br2.b.wantVx = 0;
          br2.needs.curiosity = Math.max(0, br2.needs.curiosity - dt * .01);
          br2.needs.energy = Math.min(1, br2.needs.energy + dt * .01);
          return !schoolMode || s.t > 90 ? 'done' : 'running';
        }),
      ];
    },
  },

  // ---- just take a moment
  idle: {
    label: 'thinking',
    util: () => .07,
    make: () => [wait(rand(1.5, 3.5), pick(['idle', 'lookAround', 'think']))],
  },
};

// The choices the decision network can make (one output neuron each).
const ACTIONS = ['explore', 'rest', 'animator', 'greet', 'tag', 'spar', 'practice', 'dance', 'idle', 'watch', 'visitWindow', 'code', 'study'];
const STATE_SIZE = 22;

// Two buddies walk up to each other and high five at the same moment.
function highFiveSteps(job, other) {
  return [
    act((br, s) => {
      const b = br.b;
      if (other.held || s.t > 6) return 'fail';
      if (Math.abs(other.x - b.x) > 34 * S || !sameFloor(b, other)) { b.walkTo(other.x, 140 * br.p.speed); return 'running'; }
      b.face(other.x);
      job['ready_' + b.id] = true;
      br.pose('idle');
      return job['ready_' + other.id] ? 'done' : 'running';
    }),
    act((br, s) => {
      br.b.face(other.x); br.pose('highfive');
      if (!s.fx) { s.fx = true; if (br.b === job.a) sparkle((br.b.x + other.x) / 2, br.b.y - 70 * S, '#fff6a8'); br.b.show('♥'); }
      return s.t > .8 ? 'done' : 'running';
    }),
    act(br => { br.likes(other, .08); return 'done'; }),
  ];
}

// ---- tag: whoever is "it" chases, everyone else runs
function tagTick(br, s, dt) {
  const b = br.b, g = s.game;
  if (g.over) {
    if (!s.endT) { s.endT = s.t; b.show(pick(['♥', '♪'])); }
    br.pose(g.it === b ? 'laugh' : pick(['laugh', 'cheer'])); b.wantVx = 0;
    if (s.t - s.endT > 1.6) {
      br.needs.fun = Math.min(1, br.needs.fun + .45);
      for (const o of g.players) if (o !== b) br.likes(o, .06);
      return 'done';
    }
    return 'running';
  }
  const active = g.players.filter(o => o.brain.goal && o.brain.goal.name === 'tagPlay' && !o.held);
  if (!active.includes(b)) return 'done';
  if (!active.includes(g.it)) g.it = b; // whoever was "it" left the game
  const spd = br.p.speed;
  if (g.it === b) {
    const targets = active.filter(o => o !== b && !(o === g.immune && now < g.immuneUntil));
    if (!targets.length) { b.wantVx = 0; return 'running'; }
    const T = targets.reduce((m, o) => (Math.abs(o.x - b.x) < Math.abs(m.x - b.x) ? o : m));
    const dx = T.x - b.x, dy = T.y - b.y;
    b.wantVx = Math.sign(dx) * 300 * spd; b.face(T.x);
    if (b.onGround && dy < -40 && Math.abs(dx) < 110 && br.jumpSkill.chance(floorOf(b).y - floorOf(T).y) > .5) b.jump();
    if (!b.onGround && b.jumps === 1 && b.vy > -150 && dy < -30) b.jump();
    if (b.onGround && dy > 40 && b.standWin) b.dropT = .3;
    if (Math.abs(dx) < 30 * S && Math.abs(dy) < 45 * S) {
      g.it = T; g.immune = b; g.immuneUntil = now + 1.8;
      T.show('!'); sparkle(T.x, T.y - 40, '#ffffff');
    }
  } else {
    const it = g.it, dx = b.x - it.x, d = Math.abs(dx);
    if (d < 260) {
      let dir = Math.sign(dx) || 1;
      const cornered = (dir < 0 && b.x < 70) || (dir > 0 && b.x > W - 70);
      if (cornered && d < 130 && b.onGround) { dir = -dir; b.jump(true); } // leap right over them
      b.wantVx = dir * 270 * spd; b.face(b.x + dir);
      if (b.onGround && Math.random() < dt * .8) b.jump(Math.random() < .5);
    } else {
      b.wantVx = 0; b.face(it.x);
      if (Math.random() < dt * .4) br.pose('wave');
    }
  }
  return 'running';
}

// ---- spar: bow, trade a few moves, then high five
function sparTick(br, s, dt) {
  const b = br.b, g = s.game, O = s.other;
  if (O.held || !O.brain.goal || O.brain.goal.name !== 'spar') { if (s.t > 2) return 'done'; }
  s.phase = s.phase || 'approach';
  const dx = O.x - b.x, d = Math.abs(dx);
  if (g.over && s.phase !== 'end') { s.phase = 'end'; s.pt = 0; }
  s.pt = (s.pt || 0) + dt;
  if (s.phase === 'approach') {
    if (Math.abs(d - 75 * S) > 14 || !sameFloor(b, O)) b.walkTo(O.x - Math.sign(dx || 1) * 75 * S, 150); else { b.wantVx = 0; b.face(O.x); s.phase = 'bow'; s.pt = 0; }
    if (s.pt > 8) { s.phase = 'bow'; s.pt = 0; }
    return 'running';
  }
  if (s.phase === 'bow') {
    b.face(O.x); b.wantVx = 0; br.pose(s.pt < 1 ? 'bow' : 'stance');
    if (s.pt > 1) g.ready.add(b);
    if (g.ready.size >= 2) { s.phase = 'fight'; s.pt = 0; s.cool = rand(.3, .8); }
    return 'running';
  }
  if (s.phase === 'fight') {
    b.face(O.x);
    if (br.atk) {
      br.atk.t += dt; b.animE = clamp(br.atk.t / .14, 0, 1); br.pose(br.atk.m); b.wantVx = 0;
      if (!br.atk.done && br.atk.t > .14) {
        br.atk.done = true;
        if (d < (br.atk.m === 'kick' ? 50 : 42) * S && sameFloor(b, O)) {
          if (O.brain.blockT > 0) { sparkle(O.x - Math.sign(dx) * 10, O.y - 40, '#bfe3ff'); }
          else {
            O.stun = .25; O.vx = Math.sign(dx) * 200; O.vy = -140;
            g.hits[b.id] = (g.hits[b.id] || 0) + 1;
            sparkle(O.x, O.y - 40, '#ffffff');
          }
        }
      }
      if (br.atk.t > .38) br.atk = null;
      return 'running';
    }
    if (br.blockT > 0) { br.blockT -= dt; br.pose('block'); b.wantVx = 0; return 'running'; }
    s.cool -= dt;
    if (s.micro === 'back') b.wantVx = -Math.sign(dx) * 150;
    else if (d > 46 * S) b.wantVx = Math.sign(dx) * 170 * br.p.speed; else b.wantVx = 0;
    br.pose(Math.abs(b.wantVx) > 20 ? 'walk' : 'stance');
    if (s.cool > 0) return 'running';
    s.cool = rand(.25, .6) * (1.3 - br.p.spar * .5);
    s.micro = null;
    const incoming = O.brain.atk && O.brain.atk.t < .14;
    if (incoming && d < 60 * S && Math.random() < .2 + br.p.calm * .6) { br.blockT = .4; return 'running'; }
    if (d <= 50 * S) {
      if (Math.random() < .15) { s.micro = 'back'; return 'running'; }
      br.atk = { m: Math.random() < .55 ? 'punch' : 'kick', t: 0 };
    }
    return 'running';
  }
  // end: walk together, high five, winner cheers
  if (!s.endSteps) {
    s.endSteps = highFiveSteps(g, O); s.ei = 0;
  }
  if (s.ei < s.endSteps.length) {
    const st = s.endSteps[s.ei]; st.t = (st.t || 0) + dt;
    const r = STEP[st.kind](br, st, dt);
    if (r === 'done') s.ei++; else if (r === 'fail') s.ei = s.endSteps.length;
    return 'running';
  }
  s.after = (s.after || 0) + dt;
  const mine = g.hits[b.id] || 0, theirs = g.hits[O.id] || 0;
  br.pose(mine > theirs ? 'cheer' : mine < theirs ? 'clap' : 'laugh'); b.wantVx = 0;
  if (s.after > 1.4) { br.needs.fun = Math.min(1, br.needs.fun + .4); br.needs.energy -= .1; return 'done'; }
  return 'running';
}

// ---------------------------------------------------------------- taste: what they think of things
// What you're doing on the computer right now (the window in front), e.g. { key, name, kind: 'game' }.
let focus = null, currentSong = null;
// The video or game that's on right now. It stays 'on' even if you click another window,
// until you close it, minimize it, or that window switches to something else.
let showing = null, showCount = 0, aliveWins = null;
const QUIET_APPS = ['electron', 'searchhost', 'startmenuexperiencehost', 'shellexperiencehost', 'textinputhost', 'lockapp', 'applicationframehost', 'systemsettings', 'snippingtool', 'screenclippinghost', 'screensketch', ''];
function classify(exe, title) {
  const e = exe.toLowerCase(), t = title || '';
  if (QUIET_APPS.includes(e) || (e === 'explorer' && (!t || t === 'Program Manager'))) return null;
  const T = (key, name, kind) => ({ key, name, kind });
  if (e === 'geometrydash') return T('geometry-dash', 'Geometry Dash', 'game');
  if (e.startsWith('minecraft') || e === 'javaw' || /minecraft/i.test(t)) return T('minecraft', 'Minecraft', 'game');
  if (e.startsWith('roblox')) return T('roblox', 'Roblox', 'game');
  if (e.startsWith('fortnite')) return T('fortnite', 'Fortnite', 'game');
  if (e === 'among us') return T('among-us', 'Among Us', 'game');
  if (e === 'terraria') return T('terraria', 'Terraria', 'game');
  if (e.startsWith('steam')) return T('steam', 'Steam', 'store');
  if (e === 'spotify') return T('spotify', 'Spotify', 'music');
  if (/youtube/i.test(t) && /lyric|music video|official (video|audio)|\bsong|soundtrack|\bost\b|theme|remix|\bft\.|\bfeat\b|\bmv\b|\bamv\b|cover|album|playlist|8.?bit|chiptune|lofi|lo-fi|beats|piano|music|instrumental|bgm/i.test(t)) {
    const type = songType(t);
    return Object.assign(T('music-' + type, SONG_NAMES[type], 'video'), { music: true, songType: type, themes: songThemes(t) });
  }
  if (/youtube/i.test(t) && /geometry dash|minecraft|gameplay|let'?s play|speedrun|walkthrough|playthrough|fortnite|roblox|terraria|mario|zelda.*(boss fight|walkthrough)|gaming/i.test(t))
    return Object.assign(T('youtube-gaming', 'gaming videos', 'video'), { gameVideo: true }); // someone playing a game: watch, don't dance
  if (/youtube/i.test(t)) return Object.assign(T('youtube', 'YouTube', 'video'), { songType: songType(t), themes: songThemes(t) });
  if (/netflix|disney\+|prime video|hulu/i.test(t)) return T('shows', 'TV shows', 'video');
  if (['vlc', 'wmplayer', 'video.ui', 'microsoft.media.player', 'mediaplayer'].includes(e)) return T('videos', 'videos', 'video');
  if (e === 'clipchamp') return T('video-editing', 'video editing', 'creative');
  if (e === 'microsoft.photos' || e === 'photos') return T('photos', 'Photos', 'creative');
  if (e === 'paintstudio.view') return T('paint3d', 'Paint 3D', 'creative');
  if (e.startsWith('gimp')) return T('gimp', 'GIMP', 'creative');
  if (e === 'blender') return T('blender', 'Blender', 'creative');
  if (e === 'mspaint' || e === 'paint') return T('paint', 'Paint', 'creative');
  if (e === 'tinkercad' || /tinkercad/i.test(t)) return T('tinkercad', 'Tinkercad', 'creative');
  if (['code', 'notepad++', 'python', 'pythonw', 'idle', 'windowsterminal', 'powershell', 'pwsh', 'cmd', 'mintty', 'git-bash'].includes(e)) return T('coding', 'coding', 'code');
  if (e === 'claude') return T('claude', 'Claude', 'code');
  const work = { winword: 'Word', powerpnt: 'PowerPoint', excel: 'Excel', onenote: 'OneNote', acrord32: 'PDFs', acrobat: 'PDFs', notepad: 'Notepad' };
  if (work[e]) return T(e, work[e], 'reading');
  if (/google docs|\.pdf|homework|assignment/i.test(t)) return T('schoolwork', 'schoolwork', 'reading');
  if (['zoom', 'teams', 'ms-teams', 'skype', 'whatsapp', 'discord'].includes(e)) return T(e, e === 'discord' ? 'Discord' : 'video calls', 'chat');
  if (e === 'explorer') return T('file-explorer', 'File Explorer', 'files');
  if (['chrome', 'msedge', 'firefox', 'brave', 'opera'].includes(e)) {
    // which WEBSITE are you on? (from the tab's title)
    for (const [re, key, name, kind] of SITES) if (re.test(t)) return Object.assign(T('site-' + key, name, kind), { site: true });
    return T('internet', 'the internet', 'browsing');
  }
  const nice = e.charAt(0).toUpperCase() + e.slice(1);
  return T('app-' + e, nice, 'other');
}
const SITES = [
  [/google classroom|classroom\.google/i, 'classroom', 'Google Classroom', 'school'],
  [/google docs|- google docs/i, 'docs', 'Google Docs', 'school'],
  [/google slides/i, 'slides', 'Google Slides', 'school'],
  [/google sheets/i, 'sheets', 'Google Sheets', 'school'],
  [/khan academy/i, 'khan', 'Khan Academy', 'school'],
  [/\bixl\b/i, 'ixl', 'IXL', 'school'], [/quizlet/i, 'quizlet', 'Quizlet', 'school'], [/duolingo/i, 'duolingo', 'Duolingo', 'school'],
  [/kahoot|blooket|gimkit/i, 'quizgames', 'quiz games', 'school'],
  [/wikipedia/i, 'wikipedia', 'Wikipedia', 'reading'],
  [/- google search|google search/i, 'google', 'Google', 'browsing'],
  [/gmail|inbox \(/i, 'gmail', 'Gmail', 'chat'],
  [/scratch/i, 'scratch', 'Scratch', 'code'], [/code\.org/i, 'codeorg', 'Code.org', 'code'],
  [/replit/i, 'replit', 'Replit', 'code'], [/github/i, 'github', 'GitHub', 'code'], [/claude/i, 'claude-web', 'Claude', 'code'],
  [/roblox/i, 'roblox', 'Roblox', 'game'], [/coolmath/i, 'coolmath', 'Coolmath Games', 'game'], [/\bpoki\b/i, 'poki', 'Poki', 'game'],
  [/crazygames|crazy games/i, 'crazygames', 'CrazyGames', 'game'], [/prodigy/i, 'prodigy', 'Prodigy', 'game'],
  [/twitch/i, 'twitch', 'Twitch', 'video'], [/netflix|disney\+|prime video|hulu/i, 'shows', 'TV shows', 'video'],
  [/spotify/i, 'spotify', 'Spotify', 'music'], [/tinkercad/i, 'tinkercad', 'Tinkercad', 'creative'], [/canva/i, 'canva', 'Canva', 'creative'],
  [/amazon/i, 'amazon', 'Amazon', 'browsing'], [/reddit/i, 'reddit', 'Reddit', 'browsing'], [/pinterest/i, 'pinterest', 'Pinterest', 'browsing'],
  [/minecraft/i, 'minecraft-site', 'Minecraft website', 'browsing'], [/zelda|nintendo/i, 'nintendo', 'Nintendo stuff', 'browsing'],
];
function isShow(thing) { return !!(thing && (thing.kind === 'game' || thing.kind === 'video')); }
function watchable() { return !!showing; }

// ---------------------------------------------------------------- their own dances
// Each buddy CHOREOGRAPHS their own routine (4 moves x 4 beats) from the real moves in moves.js,
// picking moves that fit the song (its mood AND what it's about) and their personality.
// Then they keep improving it: swap a move, change the order, and keep the change if it feels
// better to them. They remix teammates' routines too. Red & Green like big moves, Blue likes gentle.
const DANCE_WORDS = {
  epic: ['Thunder', 'Rage', 'Boss', 'Doom', 'Power'], calm: ['Sleepy', 'Gentle', 'Moonlight', 'Breezy', 'Floaty'],
  happy: ['Bouncy', 'Party', 'Silly', 'Sunny', 'Wiggly'], heroic: ['Hero', 'Champion', 'Brave', 'Triforce', 'Legend'],
  electronic: ['Robo', 'Pixel', 'Glitch', 'Laser', 'Byte'], groove: ['Funky', 'Smooth', 'Chill', 'Groovy', 'Fresh'],
  fly: ['Sky', 'Rito', 'Wind', 'Feather'], arrow: ['Arrow', 'Bullseye', 'Archer'], sword: ['Blade', 'Sword'],
  swim: ['Splash', 'Zora', 'Wave'], fire: ['Fire', 'Lava', 'Goron'], thunder: ['Lightning', 'Storm'], magic: ['Sparkle', 'Goddess'],
};
const DANCE_NOUNS = ['Stomp', 'Shuffle', 'Groove', 'Routine', 'Bop', 'Boogie', 'Step', 'Jam', 'Party', 'Showdown'];
const TEMPO_FOR = { epic: 2.4, calm: .8, happy: 2, heroic: 1.6, electronic: 1.9, groove: 1.5 };
function danceKey(type, themes) { return themes && themes.length ? type + ':' + themes.join('+') : type; }
function wantEnergy(br, type) { return clamp(.2 + br.p.play * .45 - br.p.calm * .25 + ({ epic: .3, calm: -.3, happy: .15 }[type] || 0), .1, 1); }
function pickMove(br, type, themes, avoid) {
  const pool = [...(MOOD_MOVES[type] || MOOD_MOVES.groove)];
  for (const th of themes) pool.push(...THEME_MOVES[th], ...THEME_MOVES[th]); // story moves are extra likely
  const want = wantEnergy(br, type);
  const options = pool.filter(m => m !== avoid);
  return weighted(options, options.map(m => Math.max(.05, 1 - Math.abs(MOVES[m].energy - want) * 1.5)));
}
function inventDance(br, type, themes) {
  const slots = [];
  for (const th of themes) slots.push({ m: THEME_MOVES[th][0] });       // act out the story first
  while (slots.length < 4) slots.push({ m: pickMove(br, type, themes, slots.length ? slots[slots.length - 1].m : null) });
  if (Math.random() < .5) slots.sort(() => Math.random() - .5);
  const word = pick(themes.length ? DANCE_WORDS[themes[0]] : DANCE_WORDS[type]);
  return {
    name: `${br.b.def.short}'s ${word} ${pick(DANCE_NOUNS)}`, inventor: br.b.def.short,
    slots, themes, type, tempo: +(TEMPO_FOR[type] * rand(.9, 1.1)).toFixed(2), version: 1,
  };
}
function tweakDance(br, d) {
  const n = JSON.parse(JSON.stringify(d));
  if (Math.random() < .3) { // switch the order of two moves
    const a = Math.floor(rand(0, 4)), c = Math.floor(rand(0, 4));
    [n.slots[a], n.slots[c]] = [n.slots[c], n.slots[a]];
  } else {                  // try a different move in one spot
    const k = Math.floor(rand(0, 4));
    n.slots[k] = { m: pickMove(br, n.type, n.themes || [], n.slots[k].m) };
  }
  n.version = (d.version || 1) + 1;
  return n;
}
// How good does this routine feel to THIS buddy?
function danceFeel(br, d) {
  if (!d || !d.slots) return -1;
  const want = wantEnergy(br, d.type);
  const moves = d.slots.map(s => MOVES[s.m]).filter(Boolean);
  const avg = moves.reduce((s, m) => s + m.energy, 0) / moves.length;
  const distinct = new Set(d.slots.map(s => s.m)).size;
  const themes = d.themes || [];
  const acts = themes.filter(th => d.slots.some(s => MOVES[s.m] && MOVES[s.m].theme === th)).length;
  return clamp(1 - Math.abs(avg - want) * 1.4 + (distinct - 2) * .08 + (themes.length ? (acts / themes.length) * .35 - .2 : 0), -1, 1);
}

// What is the song about? (from the video title)
const SONG_NAMES = { epic: 'epic battle music', calm: 'calm music', happy: 'happy party music', heroic: 'hero theme music', electronic: 'electronic music', groove: 'music videos' };
function songType(title) {
  const t = title.toLowerCase();
  if (/boss|battle|fight|war\b|final|ganon|colgera|molgera|gleeok|gohma|gibdo|kohga|seized|construct|demon|calamity|showdown|versus|\bvs\b|metal|rock|megalovania|rage/.test(t)) return 'epic';
  if (/8.?bit|chiptune|electro|synth|techno|edm|dubstep|remix|phonk/.test(t)) return 'electronic';
  if (/calm|sad|piano|lullaby|relax|sleep|lofi|lo-fi|rain|ballad|memories|goodbye|farewell|peaceful|ambient|night/.test(t)) return 'calm';
  if (/happy|party|dance|fun\b|funny|polka|silly|celebrat|song of|jingle|kids/.test(t)) return 'happy';
  if (/theme|hero|adventure|kingdom|overworld|legend|journey|main title|opening|anthem|triumph/.test(t)) return 'heroic';
  return 'groove';
}
function updateShowing() {
  if (!showing || !aliveWins) return;
  if (aliveWins.has(showing.win)) { showing.goneAt = null; return; }
  if (showing.goneAt == null) showing.goneAt = now;
  if (now - showing.goneAt > 3) { console.log(`show over: ${showing.thing.name} was closed or minimized`); showing = null; }
}
function setFocus(f) {
  if (!f) { focus = null; return; }
  const thing = classify(f.exe, f.title);
  if (thing && f.full && thing.kind === 'other') thing.kind = 'game'; // an unknown full-screen app is probably a game
  focus = thing ? Object.assign(f, { thing }) : null;
  if (isShow(thing)) {
    if (!showing || showing.win !== f.win || showing.thing.key !== thing.key) {
      showing = { win: f.win, thing, id: ++showCount, x1: f.x1, x2: f.x2 };
      console.log(`show started: ${thing.name} - time to watch!`);
    }
    showing.x1 = f.x1; showing.x2 = f.x2;
  } else if (showing && f.win === showing.win) {
    console.log(`show over: that window switched to ${thing ? thing.name : 'something else'}`);
    showing = null; // same window, but now it's not the video/game anymore
  }
  if (thing) console.log(`they noticed: ${thing.name} (${thing.kind})`);
}

// Personality → taste. Built from each buddy's traits, plus a few things only they care about.
const TASTE = {
  tsc: { creative: .45, game: .15, video: .1, 'song-heroic': .3 },           // made by an animator: loves making things
  red: { game: .35, reading: -.45, code: -.2, chat: -.1, 'song-epic': .35, 'song-calm': -.2 },  // action! reading is torture
  green: { game: .2, minecraft: .6, creative: .25, reading: -.2, 'song-happy': .35 },
  blue: { reading: .35, music: .1, game: -.15, chat: .15, 'song-calm': .4, 'song-epic': -.15 }, // calm and thoughtful
  yellow: { code: .55, creative: .2, reading: .15, video: -.15, 'song-electronic': .45 }, // the engineer
};
function affinity(br, thing) {
  const p = br.p;
  const base = {
    game: .1 + p.play * .4 + p.spar * .2 - p.calm * .25, video: .05 + p.play * .2 + p.curious * .15,
    creative: p.curious * .35 + p.play * .1 - .1, code: p.curious * .45 - p.play * .25,
    reading: p.calm * .5 - p.play * .35 - p.spar * .15, school: p.calm * .45 + p.helpful * .15 - p.play * .3, chat: p.helpful * .3 - .15, files: p.curious * .15 - .2,
    browsing: p.curious * .25 - .05, store: p.play * .25 - .05, music: .1 + p.play * .15, other: p.curious * .1 - .15,
  }[thing.kind] ?? 0;
  const t = TASTE[br.b.id] || {};
  const SONG_TASTE = {
    epic: p.spar * .45 + p.play * .1 - p.calm * .25, calm: p.calm * .5 - p.play * .2 - p.spar * .1,
    happy: p.play * .45 - p.calm * .05, heroic: .1 + p.curious * .15 + p.helpful * .1,
    electronic: p.curious * .35 - .05, groove: .1 + p.play * .2,
  };
  const musicBonus = thing.music ? .05 + (SONG_TASTE[thing.songType] || 0) + (t.music || 0) + (t['song-' + thing.songType] || 0) : 0;
  return clamp(base + musicBonus + (t[thing.kind] || 0) + (t[thing.key] || 0), -1, 1);
}
const VERDICTS = [[.45, 'AWESOME!'], [.15, 'pretty good'], [-.15, 'this is fine'], [-.45, 'meh'], [-9, 'ugh, this sucks']];
function verdictOf(score) { return VERDICTS.find(([min]) => score >= min)[1]; }
const POSE_FOR = { 'AWESOME!': 'cheer', 'pretty good': 'clap', 'this is fine': 'nod', 'meh': 'shrug', 'ugh, this sucks': 'facepalm' };
function poseForScore(sc) { return POSE_FOR[verdictOf(sc)]; }
const ACTIVITY_NAMES = {
  explore: 'exploring', rest: 'resting', animator: 'hanging out with you', greet: 'high fives', tag: 'playing tag',
  spar: 'sparring', practice: 'practicing moves', dance: 'dancing', idle: 'doing nothing', watch: 'watching you play', visitWindow: 'checking out your windows',
  code: 'coding', study: 'studying with you',
};
let likesDirty = true;

// Sitting in the audience while you play or watch something.
function watchTick(br, s, dt, th) {
  const b = br.b;
  b.wantVx = 0;
  br.feel(th, dt, 2);
  const sc = br.scoreOf(th);
  // Watching something with the team feels good: it's fun (more fun the more they like it),
  // it's time together, it's interesting, and it's restful. A show they hate is still boring.
  const together = bodies.filter(o => o !== b && o.brain.goal && o.brain.goal.name === 'watch').length;
  br.needs.fun = clamp(br.needs.fun + dt * (.01 + .03 * sc), 0, 1);
  br.needs.social = Math.max(0, br.needs.social - dt * .008 * Math.min(together, 3));
  br.needs.curiosity = Math.max(0, br.needs.curiosity - dt * .012);
  br.needs.energy = Math.min(1, br.needs.energy + dt * .015);
  // Is it MUSIC? They decide by LISTENING for a steady beat (ears.js), not by the title.
  // Once they know this video is music, they keep dancing through the quiet parts.
  // But when YOU are playing a game (or it's a video of someone playing), they watch the game instead,
  // even if the game has music (Geometry Dash is full of music!).
  const gameOn = th.kind === 'game' || th.gameVideo;
  if (showing && ears.isMusic && !gameOn) showing.musicAt = now;
  const remembered = showing && showing.musicAt && now - showing.musicAt < 12 && ears.level > -55;
  // A music video: dance when the ears hear music. Any other video: only if they're SURE it's music
  // (a strong, steady, gap-free beat for 8+ seconds), so talking with background music doesn't count.
  const sure = ears.sureFor > 8 || (showing && showing.sureAt && now - showing.sureAt < 12);
  if (showing && ears.sureFor > 8) showing.sureAt = now;
  const hearing = !gameOn && (ears.ok ? (th.music ? (ears.isMusic || remembered) : sure) : !!th.music);
  if (!hearing && showing) showing.musicType = showing.musicType && remembered ? showing.musicType : null;
  if (hearing && showing && !showing.musicType) {
    showing.musicType = (th.music && th.songType !== 'groove') ? th.songType : (ears.mood() || th.songType || 'groove'); // decide once per song
  }
  const type = hearing ? ((showing && showing.musicType) || 'groove') : null;
  const song = type && { key: 'music-' + type, name: SONG_NAMES[type], kind: 'video', music: true, songType: type };
  if (song) br.feel(song, dt, 1.5);
  if (song && br.scoreOf(song) > -.15) {
    // music they like: get up and dance in their spot!
    b.danceStyle = CAST.findIndex(c => c.id === b.id) % 4;
    b.danceType = type; // dance to what the song feels like
    const themes = th.themes || [];
    const key = danceKey(type, themes);
    if (br.danceNow && br.danceNow.key !== key) br.endDance(); // the song changed
    if (!br.danceNow) br.startDance(type, themes);
    br.danceEffects();
    br.syncToBeat();
    br.needs.fun = clamp(br.needs.fun + dt * .02 * br.danceNow.feel, 0, 1); // a dance that suits them is more fun
    const energy = { epic: .02, happy: .015, electronic: .012, heroic: .012, calm: .003, groove: .01 }[type] ?? .01;
    if (b.anim !== 'dance') b.face(b.x < W / 2 ? 1 : -1);
    br.pose('dance');
    br.needs.fun = clamp(br.needs.fun + dt * .02, 0, 1);
    br.needs.energy = Math.max(0, br.needs.energy - dt * energy);
  } else {
    const cx = showing ? (showing.x1 + showing.x2) / 2 : W / 2;
    if (Math.abs(cx - b.x) > 20) b.face(cx);
    br.pose('watchBack'); // sit still, facing the screen, watching
    if (br.danceNow) br.endDance();
  }
  const stillOn = showing && showing.thing.key === th.key;
  const dur = 25 + 150 * clamp(sc + .3, 0, 1); // likers stay a long time
  if (!stillOn || s.t > dur || (sc < -.35 && s.t > 10)) return 'done';
  return 'running';
}

// ---------------------------------------------------------------- the Brain
class Brain {
  constructor(body) {
    this.b = body; body.brain = this; this.p = body.def.pers;
    this.needs = { energy: rand(.7, 1), fun: rand(.3, .7), social: rand(.3, .7), curiosity: rand(.5, .9) };
    const m = savedMem[body.id] || {};
    this.ai = new QLearner(STATE_SIZE, ACTIONS, m.ai);   // the decision brain (neural network)
    this.jumpSkill = new JumpSkill(m.jump);                // the jumping brain (neural network)
    this.pending = null; this.lastReward = 0; this.eventReward = 0;
    this.opinions = m.opinions || {};   // what they think of things: { key: { name, score, verdict, ... } }
    this.dances = m.dances || {};       // their own dances, one per kind of song
    this.programs = m.programs || {};   // programs they've written
    this.coder = newCoderMemory(m.coder); // what they've learned about coding
    this.danceNow = null;
    this.moodBump = 0; this.reactTo = null;
    this.lastDid = {};
    this.mem = {
      trust: m.trust ?? .55,          // how much they trust you, the animator
      friends: m.friends || {},       // who they like
      visited: new Map(), lastGreet: {}, noReach: {},
    };
    this.goal = null; this.steps = []; this.si = 0;
    this.inbox = []; this.thinkT = rand(.5, 2);
    this.cool = { animator: rand(5, 20), tag: rand(30, 90), spar: rand(40, 100), askBoost: 0, visit: rand(10, 40), code: rand(20, 90) };
    this.poseName = null; this.atk = null; this.blockT = 0;
    this.wasHeld = false; this.flungSpeed = 0;
  }
  pose(name) { this.poseName = name; }
  // Pick which dance to do: their own, a new twist on it, a teammate's, or invent a brand new one.
  startDance(type, themes = []) {
    const key = danceKey(type, themes);
    const mine = this.dances[key] && this.dances[key].slots ? this.dances[key] : null;
    let dance, how;
    const seen = bodies.map(o => o.brain.danceNow).filter(d => d && d.key === key && d.owner !== this.b.id);
    const better = seen.map(d => d.dance).find(d => d.inventor !== this.b.def.short && (!mine || danceFeel(this, d) > danceFeel(this, mine) + .2));
    if (!mine) { dance = inventDance(this, type, themes); how = 'invented'; }
    else if (better && Math.random() < .2) {
      // borrow a teammate's routine, but make it their own: a remix with their own twist and name
      dance = tweakDance(this, tweakDance(this, better));
      dance.name = `${this.b.def.short}'s ${pick(DANCE_WORDS[themes[0] || type])} ${pick(DANCE_NOUNS)}`;
      dance.inspiredBy = better.inventor; dance.inventor = this.b.def.short; dance.version = 1;
      how = 'copied';
    }
    else if (Math.random() < .4) { dance = tweakDance(this, mine); how = 'tweaked'; }
    else { dance = mine; how = 'same'; }
    this.danceNow = { key, type, dance, how, owner: this.b.id, feel: danceFeel(this, dance) };
    this.b.choreo = dance;
    if (how === 'invented') { this.dances[key] = dance; likesDirty = true; console.log(`${this.b.def.short} made up a routine: ${dance.name} (${dance.slots.map(x => x.m).join(', ')})`); }
  }
  // Story moves do things: flying glides through the air, arrows fly, fireballs, lightning.
  danceEffects() {
    const b = this.b;
    if (!b.choreo || !b.choreo.slots) return;
    const beat = b.beatMul ? ears.beat() * b.beatMul : b.animT * b.choreo.tempo;
    const now2 = routineAt(b.choreo, beat);
    const f = b.facing, hx = b.x + f * 22 * S, hy = b.y - 48 * S;
    const changed = now2.name !== this.lastMove || now2.frame !== this.lastFrame;
    if (now2.name === 'fly' && b.onGround && now2.local < .5 && this.lastMove !== 'fly') { b.vy = -420; b.onGround = false; b.glide = true; }
    if (changed && now2.name === 'shootArrow' && now2.frame === 2) part({ x: hx, y: hy, vx: f * 950, vy: -40, g: 60, life: 1.3, kind: 'arrow', color: '#e8d7a8', size: 2 });
    if (changed && now2.name === 'fireball' && now2.frame === 1) for (let i = 0; i < 10; i++) part({ x: hx, y: hy, vx: f * rand(350, 600), vy: rand(-60, 60), life: rand(.4, .8), color: pick(['#ff7b00', '#ffd23f', '#ff3d00']), size: rand(3, 6) });
    if (changed && now2.name === 'zap' && now2.frame === 1) sparkle(hx + f * 30, hy, '#fff27a');
    if (changed && now2.name === 'sparkle') sparkle(b.x + rand(-20, 20), b.y - 70 * S, '#ffffff');
    this.lastMove = now2.name; this.lastFrame = now2.frame;
  }
  // Line the dance up with the real beat: pick half-time / normal / double-time to fit their dance.
  syncToBeat() {
    const b = this.b;
    if (!ears.isMusic || !ears.bps || !b.choreo) { b.beatMul = 0; return; }
    b.beatMul = Math.pow(2, Math.round(Math.log2(b.choreo.tempo / ears.bps)));
  }
  // After dancing: keep the new version only if it felt better.
  endDance() {
    const D = this.danceNow;
    this.danceNow = null; this.b.choreo = null; this.b.beatMul = 0;
    if (!D || D.how === 'same' || D.how === 'invented') return;
    const mine = this.dances[D.key];
    if (!mine || !mine.slots || D.feel > danceFeel(this, mine)) {
      this.dances[D.key] = D.dance; likesDirty = true;
      console.log(`${this.b.def.short} ${D.how === 'copied' ? 'remixed ' + D.dance.inspiredBy + "'s dance into" : 'improved their dance'}: ${D.dance.name} v${D.dance.version}`);
    }
  }
  // Spend some time with a thing and update what they think of it.
  // attention: .25 = just noticing, 2 = really watching, 3 = inspecting up close
  feel(thing, dt, attention) {
    let o = this.opinions[thing.key];
    if (!o) o = this.opinions[thing.key] = { name: thing.name, kind: thing.kind, score: 0, secs: 0 };
    const sample = affinity(this, thing) + (this.needs.fun - .5) * .3 + this.moodBump;
    o.score += (sample - o.score) * clamp(dt * attention / 40, 0, 1);
    o.secs += dt * attention;
    if (o.secs < 12) return;
    const v = verdictOf(o.score);
    if (v !== o.verdict) { o.verdict = v; o.since = new Date().toLocaleString(); this.reactTo = thing; likesDirty = true; }
  }
  // After doing an activity: how did it actually feel? (the reward the learning brain got)
  feelActivity(name, reward) {
    const key = 'do:' + name;
    let o = this.opinions[key];
    if (!o) o = this.opinions[key] = { name: ACTIVITY_NAMES[name] || name, kind: 'activity', score: 0, secs: 0, times: 0 };
    o.times++;
    o.score += (clamp(reward / 1.5, -1, 1) - o.score) * .2;
    if (o.times >= 3) { const v = verdictOf(o.score); if (v !== o.verdict) { o.verdict = v; o.since = new Date().toLocaleString(); likesDirty = true; } }
  }
  scoreOf(thing) { const o = thing && this.opinions[thing.key]; return o ? o.score : affinity(this, thing) * .3; }
  likes(o, amt) { this.mem.friends[o.id] = clamp((this.mem.friends[o.id] || 0) + amt * .35, -1, 1); } // friendships grow slowly
  friendship(o) { return this.mem.friends[o.id] || 0; }
  pickFriend(filter) {
    let best = null, bs = -1e9;
    for (const o of bodies) {
      if (o === this.b || o.held || !filter(o)) continue;
      const s = rand(0, .3) - Math.abs(o.x - this.b.x) / 2500; // no favourites: whoever is close and free
      if (s > bs) { bs = s; best = o; }
    }
    return best;
  }
  novelty(win, x) {
    const t = this.mem.visited.get((win || 'g') + ':' + Math.round(x / 120));
    return t === undefined ? 1 : clamp((now - t) / 150, 0, 1);
  }

  setGoal(name, steps) {
    this.goal = { name, label: (GOALS[name] && GOALS[name].label) || GOAL_LABELS[name] || name };
    this.steps = steps || []; this.si = 0; this.atk = null; this.blockT = 0;
    if (!this.steps.length) this.goal = null;
  }
  finish(failed) {
    const g = this.goal;
    if (failed) this.lastFailed = true;
    this.goal = null; this.steps = [];
    if (g && GOALS[g.name] && GOALS[g.name].after) GOALS[g.name].after(this, failed);
    this.thinkT = rand(.3, 1.2);
  }
  // ---- the neural network decides what to do next
  decide() {
    const state = this.senses();
    const valid = ACTIONS.map(a => GOALS[a].util(this) > 0);
    this.closeTransition(state, valid);
    const { i, guessed } = this.ai.choose(state, valid);
    const name = ACTIONS[i];
    const steps = GOALS[name].make(this);
    if (!steps) { this.thinkT = .5; return; }
    this.setGoal(name, steps);
    this.goal.guessed = guessed;
    this.lastDid[name] = now;
    this.pending = { s: state, a: i, well: this.wellbeing(), t: now };
    if (guessed && Math.random() < .25) this.b.show('?', 1);
  }
  // What the buddy can sense, turned into numbers for the neural network (all between 0 and 1).
  senses() {
    const b = this.b, N = this.needs;
    const friends = bodies.filter(o => o !== b);
    const near = friends.reduce((m, o) => Math.min(m, Math.abs(o.x - b.x)), 9999);
    const free = friends.filter(o => !inGame(o.brain) && !o.held).length;
    const since = k => clamp((now - (this.lastDid[k] ?? -300)) / 300, 0, 1);
    const cursor = realNow - mouse.t < 3 && Math.hypot(mouse.x - b.x, mouse.y - b.y) < 520 ? 1 : 0;
    return [
      N.energy, N.fun, N.social, N.curiosity, this.mem.trust,
      b.standWin ? 1 : 0, Math.min(plats.length / 4, 1),
      1 - Math.min(near / W, 1), free / 4, cursor, musicOn ? 1 : 0,
      since('explore'), since('greet'), since('tag'), since('spar'), since('rest'),
      this.jumpSkill.tries ? this.jumpSkill.hits / this.jumpSkill.tries : .5, 1,
      showing ? 1 : 0, showing ? (this.scoreOf(showing.thing) + 1) / 2 : focus ? (this.scoreOf(focus.thing) + 1) / 2 : .5,
      schoolMode ? 1 : 0, focus && focus.thing.kind === 'code' ? 1 : 0,
    ];
  }
  // How good does the buddy feel? Unmet needs hurt MORE the bigger they get (squared),
  // so rest feels amazing when you're exhausted and does nothing when you're not.
  // Each personality cares about different things.
  wellbeing() {
    const N = this.needs, p = this.p;
    const hurt = (1 - N.energy) ** 2 * 1.2 + (1 - N.fun) ** 2 * (.5 + p.play * .6) +
      N.social ** 2 * (.5 + p.helpful * .4) + N.curiosity ** 2 * (.4 + p.curious * .7);
    return -hurt + this.mem.trust * .2;
  }
  // After a goal: was it a good choice? Give the network its reward and let it learn.
  closeTransition(state, valid, failed) {
    const P = this.pending;
    if (!P) return;
    const took = now - P.t;
    let r = (this.wellbeing() - P.well) * 10 + this.eventReward * 2;
    if (this.lastFailed) r -= .15;
    this.lastFailed = false;
    r = clamp(r, -3, 3);
    this.eventReward = 0;
    this.lastReward = r;
    this.ai.remember(P.s, P.a, r, state, valid);
    this.feelActivity(ACTIONS[P.a], r);
    this.ai.learn();
    this.pending = null;
  }

  startWatching() {
    const state = this.senses();
    const valid = ACTIONS.map(a => GOALS[a].util(this) > 0);
    this.closeTransition(state, valid);
    const steps = GOALS.watch.make(this);
    this.setGoal('watch', steps);
    // the learning brain still gets to learn from how watching turned out
    this.pending = { s: state, a: ACTIONS.indexOf('watch'), well: this.wellbeing(), t: now };
    this.lastDid.watch = now;
  }

  // A friend asked for something. Say yes (nod) or no (shake head).
  handleRequest(req) {
    const b = this.b, from = req.from;
    if (this.pending && !inGame(this)) this.closeTransition(this.senses(), ACTIONS.map(a => GOALS[a].util(this) > 0));
    // They're a team: they always say yes unless they're already busy with a teammate (or you're holding them).
    const busy = inGame(this) || b.held || (this.goal && this.goal.name === 'watch');
    const yes = !busy;
    req.job.replies.set(b, yes);
    if (!yes) {
      if (!busy) this.setGoal('decline', [wait(.9, 'shake', { face: from })]);
      return;
    }
    const nod = wait(.5, 'nod', { face: from });
    if (req.type === 'greet') this.setGoal('greetReply', [nod, ...highFiveSteps(req.job, from)]);
    if (req.type === 'boost') this.setGoal('helpBoost', [nod, ...boostHelperSteps(req.job)]);
    if (req.type === 'tag') {
      this.setGoal('waitGame', [nod, act((br, s) => {
        if (req.job.game) { br.setGoal('tagPlay', [act(tagTick, { game: req.job.game })]); return 'running'; }
        return s.t > 3 ? 'fail' : 'running';
      })]);
    }
    if (req.type === 'spar') {
      this.setGoal('waitGame', [nod, act((br, s) => {
        if (req.job.game) { br.setGoal('spar', [act(sparTick, { game: req.job.game, other: from })]); return 'running'; }
        return s.t > 3 ? 'fail' : 'running';
      })]);
    }
  }

  // A window is too high. Find a friend and ask for a boost.
  planBoost(goStep) {
    const b = this.b;
    const win = goStep.win;
    const tgt = plats.find(p => p.win === win);
    const helper = this.cool.askBoost <= 0 && tgt && this.pickFriend(o => !inGame(o.brain) && o.onGround);
    if (!helper) {
      this.mem.noReach[win] = now + 60;
      this.setGoal('stuck', [wait(1.4, 'shrug', { icon: '…' })]);
      return;
    }
    this.cool.askBoost = 20;
    const job = newJob('boost', { requester: b, helper, win, x: goStep.x });
    const rest = this.steps.slice(this.si + 1);
    const boosted = go(win, goStep.x, 170, { boosted: true, climbing: false, timeout: 12 });
    job.goStep = boosted;
    this.steps = [
      go(null, 0, 190, { follow: helper, gap: 80 * S, timeout: 10 }),
      act((br, s) => { // point up at the window and ask
        pointAt(b, clamp(goStep.x, tgt.x1, tgt.x2), tgt.y); br.pose('point');
        if (!s.sent) { s.sent = true; b.show('?'); helper.brain.inbox.push({ type: 'boost', from: b, job }); }
        if (job.replies.has(helper)) {
          if (job.replies.get(helper)) return 'done';
          br.pose('shrug'); return s.t > 2.5 ? 'fail' : 'running';
        }
        return s.t > 3.5 ? 'fail' : 'running';
      }),
      act((br, s) => { // wait for the helper to get into position, then run and jump off their hands
        if (helper.held || s.t > 14) return 'fail';
        if (!job.helperReady) { br.pose('idle'); b.face(helper.x); return 'running'; }
        const dir = job.dir;
        const start = helper.x - dir * 90 * S;
        if (!s.runUp) {
          if (Math.abs(b.x - start) > 8) { b.walkTo(start, 190 * br.p.speed); return 'running'; }
          s.runUp = true;
        }
        b.wantVx = dir * 260; b.face(helper.x + dir);
        if (Math.abs(b.x - helper.x) < 16 * S && b.onGround) {
          b.boostLaunch(dir); job.launched = true;
          boosted.climbing = true; boosted.climbH = 0; boosted.djAt = boosted.t + .45;
          sparkle(helper.x, helper.y - 30, '#ffffff');
          return 'done';
        }
        return 'running';
      }),
      boosted,
      act((br, s) => { // made it! thank them
        pointAt(b, helper.x, helper.y - 30); br.pose(s.t < .8 ? 'wave' : 'cheer');
        if (!s.shown) { s.shown = true; b.show('♥'); br.likes(helper, .15); helper.brain.likes(b, .08); }
        return s.t > 1.6 ? 'done' : 'running';
      }),
      ...rest,
    ];
    this.si = 0;
  }

  update(dt) {
    const b = this.b, N = this.needs;
    for (const k in this.cool) this.cool[k] -= dt;
    this.poseName = null;

    // needs drift
    const moving = Math.abs(b.vx) > 20;
    N.energy = clamp(N.energy - dt * (moving ? .007 : .002), 0, 1);
    N.fun = clamp(N.fun - dt * .006, 0, 1);
    N.social = clamp(N.social + dt * .006, 0, 1);
    N.curiosity = clamp(N.curiosity + dt * .01, 0, 1);
    this.mem.trust = lerp(this.mem.trust, .55, dt * .004);

    // being held by you
    if (b.held) {
      if (!this.wasHeld) { this.goal = null; this.steps = []; b.show(pick(['!', '?'])); }
      this.wasHeld = true;
      b.anim = 'held'; b.wantVx = 0;
      return;
    }
    if (this.wasHeld && b.onGround) {
      this.wasHeld = false;
      const hard = this.flungSpeed > 1100;
      if (hard) { this.eventReward -= .3; this.moodBump = -.5; } // whatever you had open gets a bad memory
      this.setGoal('afterFling', hard
        ? [wait(1.3, 'dizzy'), wait(1.2, 'shrug', { face: 'cursor', icon: '…' })]
        : [wait(.9, 'nod', { face: 'cursor', icon: this.mem.trust > .5 ? '♥' : '?' })]);
    }
    if (this.wasHeld) { b.anim = b.flip ? 'tuck' : 'air'; b.wantVx = 0; return; }
    if (b.stun > 0) { b.anim = 'hurt'; b.wantVx = 0; return; }

    // remember where I've been
    this.mem.visited.set((b.standWin || 'g') + ':' + Math.round(b.x / 120), now);

    // answer friends
    if (this.inbox.length) {
      const req = this.inbox.shift();
      if (!(req.from.held)) this.handleRequest(req); else req.job.replies.set(b, false);
    }

    b.wantVx = 0;
    if (!this.goal) { this.thinkT -= dt; if (this.thinkT <= 0) this.decide(); }
    if (this.goal) {
      const s = this.steps[this.si];
      if (!s) this.finish(false);
      else {
        s.t = (s.t || 0) + dt;
        const r = STEP[s.kind](this, s, dt);
        if (r === 'done') { this.si++; if (this.si >= this.steps.length) this.finish(false); }
        else if (r === 'fail') this.finish(true);
        else if (r === 'needBoost') this.planBoost(s);
      }
    }

    // INSTINCT: when you start a video or a game, everybody stops and comes to watch (like in the show).
    // The ones who don't like it get bored and leave, but they check back now and then.
    if (showing && b.onGround && !(this.goal && ['watch', 'helpBoost', 'afterFling', 'react', 'breakTime'].includes(this.goal.name))) {
      const seen = showing.id;
      const fresh = this.lastWatchSeen !== seen;
      this.watchCheck = (this.watchCheck ?? 0) - dt;
      if (fresh || this.watchCheck <= 0) {
        this.lastWatchSeen = seen;
        this.watchCheck = rand(20, 40);
        const sc = this.scoreOf(showing.thing);
        const friendsWatching = bodies.some(o => o !== b && o.brain.goal && o.brain.goal.name === 'watch');
        if (fresh || Math.random() < clamp(.35 + sc + (friendsWatching ? .3 : 0), .1, 1)) this.startWatching();
      }
    }

    // INSTINCT: you started schoolwork, so they quiet down and study with you (unless busy with a teammate).
    if (schoolMode && !this.studying && b.onGround && !(this.goal && ['study', 'helpBoost', 'afterFling', 'react', 'breakTime'].includes(this.goal.name))) {
      this.studying = true;
      if (Math.random() < .5 + this.p.calm * .5) {
        this.closeTransition(this.senses(), ACTIONS.map(a => GOALS[a].util(this) > 0));
        this.setGoal('study', GOALS.study.make(this));
        this.pending = { s: this.senses(), a: ACTIONS.indexOf('study'), well: this.wellbeing(), t: now };
      }
    }
    if (!schoolMode) this.studying = false;

    // INSTINCT: music just started and there's no video/game to watch: the ones who like music dance.
    if (ears.sureFor > 8 && !showing && !schoolMode && !(focus && ['other', 'game'].includes(focus.thing.kind)) && b.onGround && !this.heardMusic && !(this.goal && ['dance', 'helpBoost', 'afterFling', 'tagPlay', 'spar'].includes(this.goal.name))) {
      this.heardMusic = true;
      const t2 = ears.mood() || 'groove';
      if (this.scoreOf({ key: 'music-' + t2, name: SONG_NAMES[t2], kind: 'video', music: true, songType: t2 }) > -.15) {
        this.closeTransition(this.senses(), ACTIONS.map(a => GOALS[a].util(this) > 0));
        this.setGoal('dance', GOALS.dance.make(this));
      }
    }
    if (!ears.isMusic) this.heardMusic = false;

    // form opinions about what you're doing on the computer, a little at a time
    this.moodBump *= Math.pow(.97, dt * 10);
    if (focus && focus.thing) this.feel(focus.thing, dt, .25);
    if (currentSong && musicOn) this.feel(currentSong, dt, this.goal && this.goal.name === 'dance' ? 2 : .3);
    if (this.reactTo && b.onGround && (!this.goal || ['explore', 'idle', 'rest', 'practice'].includes(this.goal.name))) {
      const o = this.opinions[this.reactTo.key];
      this.reactTo = null;
      if (o) this.setGoal('react', [wait(1.5, POSE_FOR[o.verdict], { face: focus ? { x: (focus.x1 + focus.x2) / 2 } : null })]);
    }

    // choose the pose to show
    if (b.flip > 0) b.anim = 'tuck';
    else if (!b.onGround && b.glide && this.poseName === 'dance') b.anim = 'dance';
    else if (!b.onGround) b.anim = 'air';
    else if (this.poseName === 'watchBack' && Math.abs(b.vx) < 40) { b.anim = 'watchBack'; b.vx = 0; }
  else if (this.poseName && (Math.abs(b.vx) < 40 || ['highfive', 'point', 'wave', 'stance'].includes(this.poseName))) b.anim = this.poseName;
    else if (Math.abs(b.vx) > 200) b.anim = 'run';
    else if (Math.abs(b.vx) > 15) b.anim = 'walk';
    else b.anim = this.poseName || 'idle';
  }
}
const GOAL_LABELS = {
  tagPlay: 'playing tag', spar: 'sparring', helpBoost: 'giving a boost', greetReply: 'high five!', waitGame: 'getting ready',
  decline: 'saying no thanks', stuck: "can't reach", afterFling: 'recovering', react: 'giving their opinion',
  breakTime: 'telling you to take a break', cheer: 'cheering you on',
};

// The helper's side of a boost: stand under the window, cup hands, launch the friend.
function boostHelperSteps(job) {
  const tgt = () => plats.find(p => p.win === job.win);
  return [
    act((br, s, dt) => {
      const T = tgt();
      if (!T) return 'fail';
      const here = floorOf(job.requester);
      job.floorY = here.y;
      const lx = clamp(job.x, Math.max(T.x1 + 30, here.x1 + 20), Math.min(T.x2 - 30, here.x2 - 20));
      if (!s.goStep) s.goStep = go(here.win, lx, 200, { timeout: 10 });
      s.goStep.t = (s.goStep.t || 0) + dt;
      const r = STEP.go(br, s.goStep, dt);
      if (r === 'fail') return 'fail';
      if (r === 'done') { job.dir = Math.sign(job.requester.x - lx) * -1 || 1; return 'done'; }
      return 'running';
    }),
    act((br, s, dt) => {
      const b = br.b;
      b.face(job.requester.x); br.pose('boost'); job.helperReady = true;
      if (job.launched) { s.l = (s.l || 0) + dt; br.pose('cheer'); return s.l > 1.2 ? 'done' : 'running'; }
      return s.t > 15 || job.requester.held ? 'fail' : 'running';
    }),
  ];
}


// ---------------------------------------------------------------- the programs they write
// Real JavaScript about their own lives: their dance routine, what they like, their jumping, the team,
// plus a favourite project each. If they write the same program again, it's a new, improved version.
function writeProgram(br) {
  const b = br.b, me = b.def.short, date = new Date().toLocaleString();
  const q = v => JSON.stringify(v);
  const ops = Object.values(br.opinions).filter(o => o.verdict).sort((a, c) => c.score - a.score);
  const loves = [...new Set(ops.filter(o => o.score > .15).map(o => o.name))].slice(0, 5);
  const hates = [...new Set(ops.filter(o => o.score < -.15).map(o => o.name))].slice(-5);
  const dance = Object.values(br.dances).filter(d => d.slots).sort((a, c) => (c.version || 1) - (a.version || 1))[0];
  const J = br.jumpSkill;
  const options = [
    ['what_i_like.js', [
      `const loves = ${q(loves)};`, `const hates = ${q(hates)};`,
      `console.log("${me}'s favorite things:");`, `loves.forEach((x, i) => console.log("  " + (i + 1) + ". " + x));`,
      `console.log("Things ${me} does NOT like:");`, `hates.forEach(x => console.log("  - " + x));`,
      `if (!loves.length) console.log("  (still deciding!)");`]],
    ['jump_log.js', [
      `const landed = ${J.hits}, tries = ${J.tries};`, `const pct = tries ? Math.round(100 * landed / tries) : 0;`,
      `console.log("${me} jump report");`, `console.log("[" + "#".repeat(Math.round(pct / 5)) + ".".repeat(20 - Math.round(pct / 5)) + "] " + pct + "% landed");`,
      `console.log(pct > 60 ? "I'm getting really good at this!" : "Still practicing...");`]],
    ['team.js', [
      `const team = ${q(bodies.map(o => ({ name: o.def.short, doing: o.brain.goal ? o.brain.goal.label : 'thinking' })))};`,
      `console.log("TEAM ROLL CALL");`, `for (const t of team) console.log("  " + t.name.padEnd(8) + "is " + t.doing);`,
      `console.log("We always help each other. No best friends, one team!");`]],
    ...(dance ? [['my_dance.js', [
      `const routine = ${q(dance.slots.map(x => x.m))};`, `const name = ${q(dance.name)};`,
      `console.log("Dance: " + name + " (version ${dance.version || 1})");`,
      `let beat = 0;`, `const t = setInterval(() => {`, `  const move = routine[Math.floor(beat / 4) % routine.length];`,
      `  console.log("beat " + (beat + 1) + ": " + move);`, `  if (++beat >= 16) { clearInterval(t); console.log("*bows*"); }`, `}, 120);`]]] : []),
    ...({
      tsc: [['flipbook.js', [`const frames = [[" O ", "/|\\\\", "/ \\\\"], ["\\\\O/", " | ", "/ \\\\"], [" O ", "<|>", "/ \\\\"]];`,
        `frames.forEach((f, i) => { console.log("frame " + (i + 1)); console.log(f.join("\\n")); });`, `console.log("An animation by TSC!");`]]],
      red: [['power_level.js', [`let power = 0;`, `while (power < 9000) power += Math.floor(Math.random() * 900) + 100;`,
        `console.log("RED'S POWER LEVEL: " + power);`, `console.log(power > 9000 ? "IT'S OVER 9000!!!" : "Almost there...");`]]],
      green: [['build_house.js', [`const W = 12, H = 6;`, `for (let y = 0; y < H; y++) {`, `  let row = "";`,
        `  for (let x = 0; x < W; x++) row += (y === 0 || y === H - 1 || x === 0 || x === W - 1) ? "[]" : (y > 2 && x === 6 ? "  " : "  ");`,
        `  console.log(row);`, `}`, `console.log("Green built a house!");`]]],
      blue: [['calm_timer.js', [`const steps = ["breathe in...", "hold...", "breathe out..."];`, `let i = 0;`,
        `const t = setInterval(() => { console.log(steps[i % 3]); if (++i >= 6) { clearInterval(t); console.log("Blue feels calm."); } }, 150);`]]],
      yellow: [['primes.js', [`const primes = [];`, `for (let n = 2; primes.length < 25; n++) if (primes.every(p => n % p)) primes.push(n);`,
        `console.log("Yellow's prime numbers: " + primes.join(" "));`]]],
    }[b.id] || []),
  ];
  // they like working on their own favourite project and on things they care about
  const [file, lines] = Math.random() < .35 ? options[options.length - 1] : pick(options);
  const version = ((br.programs[file] && br.programs[file].version) || 0) + 1;
  const text = [`// ${file} - written by ${b.name} (a StickBuddy), version ${version}`, `// ${date}`, `// Run it: node ${file}`, '', ...lines, ''].join('\n');
  return { file, text, version, typeTime: 6 + lines.length * .8 };
}

// ---------------------------------------------------------------- helping you
let schoolMode = false, schoolFor = 0, lastCheer = 0, playFor = 0, lastBreak = -9999, noiseFor = 0;
function updateHelping(dt) {
  // SCHOOL: you've been on schoolwork (Docs, Classroom, Word, Khan...) for a minute
  const onSchool = focus && ['school', 'reading'].includes(focus.thing.kind);
  schoolFor = onSchool ? schoolFor + dt : Math.max(0, schoolFor - dt * 3);
  const was = schoolMode;
  schoolMode = schoolFor > 60 || (schoolMode && schoolFor > 20);
  if (schoolMode && !was) { console.log('you started schoolwork - they quiet down and study with you'); lastCheer = now; }
  // every 20 minutes of schoolwork: a little cheer to keep you going
  if (schoolMode && now - lastCheer > 1200) {
    lastCheer = now;
    for (const o of bodies) if (!o.held && o.onGround && o.brain.goal && o.brain.goal.name === 'study') o.brain.cheerOnce = true;
  }
  // BREAK: an hour of games / videos in a row
  const playing = showing && (showing.thing.kind === 'game' || showing.thing.kind === 'video');
  playFor = playing ? playFor + dt : Math.max(0, playFor - dt * 2);
  if (playFor > 3600 && now - lastBreak > 1800) {
    lastBreak = now;
    const helper = bodies.filter(o => !o.held && o.onGround).sort((a, c) => c.brain.p.helpful - a.brain.p.helpful)[0];
    if (helper) { console.log(`${helper.def.short} thinks you should take a break`); helper.brain.remindBreak(); }
  }
  // An unknown app making sound for a few seconds is probably a game: watch it, don't dance.
  const loudApp = !showing && focus && ['other', 'browsing', 'game'].includes(focus.thing.kind) && ears.ok && ears.level > -45;
  noiseFor = loudApp ? noiseFor + dt : 0;
  if (noiseFor > 4 && focus) {
    const th = Object.assign({}, focus.thing);
    if (th.kind !== 'browsing') th.kind = 'game';
    else { th.kind = 'video'; th.key = th.key + '-video'; th.name = 'videos on ' + th.name; }
    showing = { win: focus.win, thing: th, id: ++showCount, x1: focus.x1, x2: focus.x2 };
    console.log(`show started: ${th.name} is making sound - time to watch!`);
    noiseFor = 0;
  }
}
Brain.prototype.remindBreak = function () {
  const b = this.b;
  const clockX = W - 40, clockY = G + 20;
  this.closeTransition(this.senses(), ACTIONS.map(a => GOALS[a].util(this) > 0));
  this.setGoal('breakTime', [
    go(null, W - 90, 220, { timeout: 12 }),
    wait(2.2, 'stretch'),
    act((br, s) => { pointAt(b, clockX, clockY); br.pose('point'); return s.t > 2.5 ? 'done' : 'running'; }),
    wait(1.2, 'nod', { face: 'cursor' }),
  ]);
};
