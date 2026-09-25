// StickBuddies — starts everything and runs the main loop.
'use strict';

let showBrain = false, last = 0;

// ---------------------------------------------------------------- you, the animator (mouse)
function bodyAt(x, y) {
  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i];
    if (Math.abs(b.x - x) < 16 * S && y > b.y - 76 * S && y < b.y + 6) return b;
  }
  return null;
}
addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = realNow; });
addEventListener('mousedown', e => {
  const b = bodyAt(e.clientX, e.clientY);
  if (!b) return;
  b.held = true; mouse.grab = b; b.flip = 0;
});
addEventListener('mouseup', () => {
  const b = mouse.grab;
  if (!b) return;
  mouse.grab = null; b.held = false;
  b.vx = clamp(mouse.vx, -2200, 2200); b.vy = clamp(mouse.vy, -2200, 2200);
  const speed = Math.hypot(b.vx, b.vy);
  b.brain.flungSpeed = speed;
  // Gentle hands earn trust. Throwing them around makes them wary of you.
  const T = b.brain.mem;
  if (speed < 500) T.trust = clamp(T.trust + .06, 0, 1);
  else if (speed > 1100) T.trust = clamp(T.trust - .18, 0, 1);
  else T.trust = clamp(T.trust - .03, 0, 1);
  // friends who saw it happen feel the same way (a little)
  for (const o of bodies) if (o !== b && Math.abs(o.x - b.x) < 350) o.brain.mem.trust = clamp(o.brain.mem.trust + (speed > 1100 ? -.06 : .02), 0, 1);
});
addEventListener('contextmenu', e => e.preventDefault());
function updateMouse(dt) {
  if (dt > 0) {
    mouse.vx = lerp(mouse.vx, (mouse.x - mouse.px) / dt, .5);
    mouse.vy = lerp(mouse.vy, (mouse.y - mouse.py) / dt, .5);
  }
  mouse.px = mouse.x; mouse.py = mouse.y;
  const over = !!mouse.grab || !!bodyAt(mouse.x, mouse.y);
  if (over !== mouse.over) { mouse.over = over; PC.mouseOver(over); }
  document.body.style.cursor = mouse.grab ? 'grabbing' : over ? 'grab' : 'default';
}

// ---------------------------------------------------------------- music
// Put your own songs (like Tears of the Kingdom) in the "music" folder. Ctrl+Alt+M = on/off.
const Music = {
  files: [], idx: 0, audio: null,
  async init() {
    try { this.files = await PC.music(); } catch { this.files = []; }
    this.files.sort(() => Math.random() - .5);
    if (this.files.length) this.play();
  },
  play() {
    if (!this.files.length) return;
    const file = this.files[this.idx % this.files.length];
    const a = new Audio(file);
    const name = decodeURIComponent(file.split('/').pop()).replace(/\.\w+$/, '');
    currentSong = { key: 'song:' + name.toLowerCase(), name: `the song "${name}"`, kind: 'music' };
    a.volume = .4;
    a.onended = () => { this.idx++; if (musicOn) this.play(); };
    a.play().catch(() => {});
    this.audio = a; musicOn = true;
  },
  toggle() {
    if (musicOn) { if (this.audio) this.audio.pause(); musicOn = false; }
    else this.play();
  },
};

// ---------------------------------------------------------------- brain view (Ctrl+Alt+B)
function drawBrainView() {
  const px = 14, py = 14, w = 430, h = 40 + bodies.length * 50 + 22;
  roundRect(px, py, w, h, 10); ctx.fillStyle = 'rgba(14,16,22,.88)'; ctx.fill();
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = 'bold 13px "Segoe UI", sans-serif';
  ctx.fillText('Neural network brains (learning by trial and error)', px + 12, py + 22);
  bodies.forEach((b, i) => {
    const br = b.brain, yy = py + 46 + i * 50;
    ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(px + 18, yy - 4, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.fillText(`${b.def.short}  ·  ${br.goal ? br.goal.label : '...'}`, px + 32, yy);
    const ops = Object.values(br.opinions).filter(o => o.verdict).sort((p, q) => q.score - p.score);
    const love = ops.length && ops[0].score > .15 ? ops[0].name : '(deciding)';
    const hate = ops.length && ops[ops.length - 1].score < -.15 ? ops[ops.length - 1].name : '(nothing yet)';
    ctx.fillStyle = '#b9c2d0'; ctx.font = '11px "Segoe UI", sans-serif';
    const J = br.jumpSkill;
    ctx.fillText(`decisions: ${br.ai.decisions}  ·  still guessing ${Math.round(br.ai.eps * 100)}%  ·  last reward ${br.lastReward >= 0 ? '+' : ''}${br.lastReward.toFixed(2)}`, px + 32, yy + 15);
    ctx.fillText(`jumps landed ${J.hits}/${J.tries}  ·  loves: ${love}  ·  hates: ${hate}`, px + 32, yy + 29);
  });
  ctx.fillStyle = '#8a93a3'; ctx.font = '10px "Segoe UI", sans-serif';
  ctx.fillText('Their opinions are saved in "what they like.txt"', px + 12, py + h - 10);
}

// ---------------------------------------------------------------- main loop
function frame(ts) {
  const dt = Math.min(.05, (ts - last) / 1000 || 0);
  last = ts; realNow += dt; now += dt;
  updateMouse(dt);
  updateGames(dt);
  updateShowing();
  updateHelping(dt);
  for (const b of bodies) { b.brain.update(dt); b.physics(dt); }

  ctx.clearRect(0, 0, W, H);
  for (const b of bodies) drawBody(b, dt);
  drawParts(dt);
  if (showBrain) drawBrainView();
  requestAnimationFrame(frame);
}

function saveMemory() {
  const out = {};
  for (const b of bodies) out[b.id] = { trust: b.brain.mem.trust, opinions: b.brain.opinions, dances: b.brain.dances, programs: b.brain.programs, coder: b.brain.coder, ai: b.brain.ai.save(), jump: b.brain.jumpSkill.save() };
  out.savedAt = new Date().toLocaleString();
  PC.saveMemory(out);
  if (likesDirty) { likesDirty = false; PC.saveLikes(likesText()); }
}

// The file you can read: what each buddy has decided they like (and don't).
function likesText() {
  const L = ['WHAT THE STICKBUDDIES LIKE', '',
    'Nobody tells them what to like. They decide for themselves from their personality',
    'and from how things actually go for them. Their opinions can change over time.', '',
    `Last updated: ${new Date().toLocaleString()}`, ''];
  for (const b of bodies) {
    L.push('==== ' + b.name.toUpperCase() + ' ====');
    const ops = Object.values(b.brain.opinions).filter(o => o.verdict).sort((p, q) => q.score - p.score);
    if (!ops.length) L.push('  (still making up their mind)');
    for (const o of ops) L.push(`  ${(o.name + ' ').padEnd(34, '.')} ${o.verdict}`);
    const progs = Object.entries(b.brain.programs || {});
    if (progs.length) {
      L.push('  Programs they wrote (in the "their code" folder):');
      for (const [file, pr] of progs) L.push(`    ${file} (version ${pr.version}) - ${pr.ok ? 'works' : 'has a bug'}`);
    }
    const ds = Object.entries(b.brain.dances);
    if (ds.length) {
      L.push('  Their own dances:');
      for (const [type, d] of ds) {
        const who = 'made up by ' + b.def.short + (d.inspiredBy ? ', inspired by ' + d.inspiredBy : '');
        if (!d.slots) continue;
        const kind = SONG_NAMES[d.type || type.split(':')[0]] + (d.themes && d.themes.length ? ' about ' + d.themes.join(' & ') : '');
        L.push(`    for ${kind}: "${d.name}" (version ${d.version}, ${who})`);
        L.push(`       moves: ${d.slots.map(x => x.m).join(' → ')}`);
      }
    }
    L.push('');
  }
  return L.join('\r\n');
}

async function boot() {
  while (innerWidth < 50 || innerHeight < 50) await new Promise(r => setTimeout(r, 100));
  resize();
  CAST.forEach((d, i) => { const b = new Body(d, (i + 1) * W / (CAST.length + 1)); new Brain(b); bodies.push(b); });
  PC.on('windows', d => { updatePlats(d.plats); aliveWins = new Set(d.alive); });
  PC.on('brain', () => { showBrain = !showBrain; });
  PC.on('music', () => Music.toggle());
  setInterval(saveMemory, 10000);
  PC.on('focus', setFocus);
  PC.on('save-now', saveMemory);
  addEventListener('beforeunload', saveMemory);
  setInterval(() => console.log(`t=${Math.round(now)} floors=${plats.length} ` + bodies.map(b => `${b.def.short}:${b.brain.goal ? b.brain.goal.name : '-'}`).join(' ')), 30000);
  Music.init();
  ears.start();
  console.log(`boot ok ${W}x${H}`);
  requestAnimationFrame(ts => { last = ts; requestAnimationFrame(frame); });
}
boot();
