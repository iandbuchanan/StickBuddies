// StickBuddies — the WORLD: gravity, floors (your windows), and how the buddies look and move.
// The thinking part lives in brain.js.
'use strict';

const cv = document.getElementById('world');
const ctx = cv.getContext('2d');
let W = 0, H = 0, G = 0; // G = the floor at the top of the taskbar
function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = innerWidth; H = innerHeight; G = H - 2;
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

// In a normal browser (for testing) there's no PC bridge, so pretend.
const PC = window.pc || {
  mouseOver() {}, on() {}, music: async () => [],
  loadMemory: () => { try { return JSON.parse(localStorage.getItem('sb-test-memory')) || {}; } catch { return {}; } },
  saveMemory: d => { try { localStorage.setItem('sb-test-memory', JSON.stringify(d)); } catch { } },
  saveLikes: t => { window.lastLikes = t; },
  writeCode: async (who, file, text) => { window.lastCode = { who, file, text }; return { ok: true, out: 'test' }; },
};

const GRAV = 2000;
const JUMP_V = 760, DOUBLE_V = 640, BOOST_V = 1250;
const S = 1.6; // how big the buddies are
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
let now = 0, realNow = 0;

// ---------------------------------------------------------------- floors
// The ground is the taskbar. Every visible window top is also a floor: { win, wl, x1, x2, y }
const GROUND = { win: null, x1: 0, x2: 1e9, y: 0 };
let plats = [];
function platUnder(x, prevY, y) {
  for (const p of plats) if (x >= p.x1 && x <= p.x2 && prevY <= p.y + 2 && y >= p.y) return p;
  return null;
}
function currentPlat(b) {
  return b.standWin ? plats.find(p => p.win === b.standWin && b.x >= p.x1 - 2 && b.x <= p.x2 + 2) : null;
}
function floorOf(b) {
  const p = currentPlat(b);
  if (p) return p;
  GROUND.y = G; GROUND.x2 = W;
  return GROUND;
}
function allFloors() { GROUND.y = G; GROUND.x2 = W; return [GROUND, ...plats]; }

// Windows moved / opened / closed. Anyone standing on a window rides along with it.
function updatePlats(list) {
  const riders = bodies.filter(b => b.standWin);
  const oldWl = new Map(riders.map(b => [b, b.standWl]));
  plats = list || [];
  for (const b of riders) {
    const mine = plats.filter(p => p.win === b.standWin);
    if (!mine.length) { b.standWin = null; b.onGround = false; continue; }
    const nx = b.x + (mine[0].wl - oldWl.get(b));
    const p = mine.find(q => nx >= q.x1 - 2 && nx <= q.x2 + 2);
    b.x = nx;
    if (!p) { b.standWin = null; b.onGround = false; continue; }
    b.y = p.y; b.standWl = p.wl;
  }
}

// ---------------------------------------------------------------- little effects
const parts = [];
function part(o) { parts.push(Object.assign({ vx: 0, vy: 0, g: 0, life: .5, size: 3, color: '#fff', kind: 'dot' }, o, { max: o.life || .5 })); }
function dust(x, y, n = 5) {
  for (let i = 0; i < n; i++) part({ x: x + rand(-8, 8), y, vx: rand(-80, 80), vy: rand(-70, -10), life: rand(.3, .55), color: 'rgba(225,225,225,.8)', size: rand(2, 3.5), g: 140 });
}
function sparkle(x, y, color) {
  for (let i = 0; i < 6; i++) { const a = rand(0, 7); part({ x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: .35, color, size: 2 }); }
}

// ---------------------------------------------------------------- the mouse (you, the animator)
const mouse = { x: -999, y: -999, px: -999, py: -999, vx: 0, vy: 0, t: -99, grab: null, over: false };

// ---------------------------------------------------------------- a buddy's body
class Body {
  constructor(def, x) {
    this.def = def; this.id = def.id; this.name = def.name; this.color = def.color;
    this.x = x; this.y = -60 - rand(0, 300); this.vx = 0; this.vy = 0;
    this.facing = Math.random() < .5 ? 1 : -1;
    this.onGround = false; this.jumps = 0; this.dropT = 0;
    this.standWin = null; this.standWl = 0;
    this.wantVx = 0;
    this.anim = 'air'; this.animT = rand(0, 10); this.animE = 0; // what pose to show
    this.flip = 0;          // front-flip spin (0..1)
    this.held = false;      // held by your mouse
    this.flung = 0;         // how hard you threw them
    this.stun = 0; this.inv = 0;
    this.icon = null;       // a little symbol above the head: ! ? ♥ ♪ …
    this.pointAng = 2.3;    // which way the pointing arm aims
    this.P = null;          // smoothed pose
    this.hand = [x, 0]; this.head = [x, 0];
  }
  show(s, t = 1.6) { this.icon = { s, t, max: t }; }
  walkTo(tx, spd) {
    const d = tx - this.x;
    if (Math.abs(d) < 6) { this.wantVx = 0; return true; }
    this.wantVx = Math.sign(d) * spd; this.facing = Math.sign(d);
    return false;
  }
  face(x) { if (Math.abs(x - this.x) > 2) this.facing = Math.sign(x - this.x); }
  jump(flip = false, power = 1) {
    if (this.onGround) {
      this.vy = -JUMP_V * power; this.onGround = false; this.jumps = 1; dust(this.x, this.y, 4);
      if (flip) this.flip = .001;
    } else if (this.jumps < 2) {
      this.vy = -DOUBLE_V; this.jumps = 2; this.flip = .001; // double jumps are always a flip
    }
  }
  boostLaunch(dir) { this.vy = -BOOST_V; this.vx = dir * 120; this.onGround = false; this.jumps = 1; this.flip = .001; }

  physics(dt) {
    if (this.held) {
      this.x = mouse.x; this.y = mouse.y + 62 * S; this.vx = this.vy = 0;
      this.onGround = false; this.standWin = null;
      return;
    }
    this.stun -= dt; this.inv -= dt; this.dropT -= dt;
    if (this.flip > 0) { this.flip += dt * 2.4; if (this.flip >= 1) this.flip = 0; }
    const control = this.stun <= 0;
    if (control) this.vx = approach(this.vx, this.wantVx, (this.onGround ? 2400 : 1000) * dt);
    else if (this.onGround) this.vx = approach(this.vx, 0, 1500 * dt);

    const prevY = this.y;
    this.vy += GRAV * dt;
    if (this.glide && this.vy > 90) this.vy = 90; // pretending to fly: float down slowly
    this.x += this.vx * dt; this.y += this.vy * dt;

    let floor = null;
    if (this.y >= G) floor = G;
    else if (this.vy >= 0 && this.dropT <= 0) {
      const p = platUnder(this.x, prevY, this.y);
      if (p) { floor = p.y; this.standWin = p.win; this.standWl = p.wl; }
    }
    if (floor !== null) {
      if (floor === G) this.standWin = null;
      if (!this.onGround && this.vy > 450) dust(this.x, floor, 6);
      this.landedHard = !this.onGround && this.vy > 1300;
      this.y = floor; this.vy = 0; this.onGround = true; this.jumps = 0; this.flip = 0; this.glide = false;
    } else { this.onGround = false; this.standWin = null; }

    if (this.x < 12) { this.x = 12; this.vx = Math.abs(this.vx) * .3; }
    if (this.x > W - 12) { this.x = W - 12; this.vx = -Math.abs(this.vx) * .3; }
    if (this.y < 74 * S) { this.y = 74 * S; this.vy = Math.abs(this.vy) * .2; }
    this.animT += dt;
    if (this.icon && (this.icon.t -= dt) <= 0) this.icon = null;
  }
}
const bodies = [];

// ---------------------------------------------------------------- poses
// Angles: 0 = pointing straight down, + = toward where the buddy faces.
// Each limb is [upper, lower-relative-to-upper].
function targetPose(b) {
  const t = b.animT, e = b.animE;
  const P = { lean: .03, fa0: .2, fa1: .3, ba0: -.2, ba1: .3, fl0: .12, fl1: 0, bl0: -.12, bl1: 0 };
  const arms = (f0, f1, b0, b1) => { P.fa0 = f0; P.fa1 = f1; P.ba0 = b0; P.ba1 = b1; };
  const legs = (f0, f1, b0, b1) => { P.fl0 = f0; P.fl1 = f1; P.bl0 = b0; P.bl1 = b1; };
  const stride = (p, amp, bend) => legs(Math.sin(p) * amp, -Math.max(0, Math.cos(p)) * bend - .05, -Math.sin(p) * amp, -Math.max(0, -Math.cos(p)) * bend - .05);
  const s = Math.sin(t * 2.2) * .035;
  switch (b.anim) {
    case 'idle': P.lean = .02 + s; arms(.16 + s, .3, -.16 - s, .3); break;
    case 'lookAround': P.lean = .02; arms(.3, .5, -.1, .3); if (Math.sin(t * 1.3) > 0) P.lean = -.05; break;
    case 'think': P.lean = .08; arms(.9, 2.3, .2, 1.4); break;          // hand on chin
    case 'walk': { const p = t * 9; stride(p, .5, .6); arms(-Math.sin(p) * .45, .35, Math.sin(p) * .45, .35); P.lean = .06; break; }
    case 'run': { const p = t * 15; stride(p, .9, 1.3); arms(-Math.sin(p), 1.4, Math.sin(p), 1.4); P.lean = .32; break; }
    case 'air': { const w = Math.sin(t * 8) * .12; P.lean = .05; arms(2.1 + w, .4, -1.9 - w, -.4); legs(.8, -1.2, .2, -.6); break; }
    case 'tuck': P.lean = .4; arms(1.5, 1.8, 1.3, 1.9); legs(1.9, -2.4, 1.7, -2.3); break; // used during flips
    case 'watchBack': P.lean = .12 + Math.sin(t * 1.6) * .015; arms(1.0, .9, .85, .9); legs(1.55, -1.45, 1.45, -1.35); break; // sitting, watching the screen
    case 'sit': P.lean = .1; arms(1.2, .6, 1.0, .6); legs(1.55, -1.45, 1.45, -1.35); break;
    case 'code': { const k = Math.sin(t * 26); P.lean = .18; arms(1.15, .45 + k * .2, 1.05, .5 - k * .2); legs(1.55, -1.45, 1.45, -1.35); break; } // typing on a laptop
    case 'read': P.lean = .25 + Math.sin(t * .7) * .03; arms(1.25, 1.25, 1.15, 1.35); legs(1.55, -1.45, 1.45, -1.35); break; // reading a book
    case 'stretch': { const k = (Math.sin(t * 2.5) + 1) / 2; P.lean = -.1 * k; arms(3.0, .05, 3.3, -.05); legs(.15, 0, -.15, 0); break; }
    case 'perch': { const k = Math.sin(t * 3); P.lean = .05; arms(-.4, .3, -.6, .3); legs(1.5 + k * .1, -1.1 + k * .5, 1.4 - k * .1, -1.2 - k * .5); break; }
    case 'lie': P.lean = 0; arms(2.6, .2, -2.6, -.2); legs(.1, 0, -.1, 0); break;
    case 'point': P.lean = .05; arms(b.pointAng, 0, -.3, .4); break;
    case 'wave': arms(2.7, .35 + Math.sin(t * 14) * .45, -.2, .3); break;
    case 'nod': P.lean = .05 + Math.max(0, Math.sin(t * 10)) * .18; break;
    case 'shake': P.lean = .02 + Math.sin(t * 16) * .05; arms(.3, .2, -.3, .2); break;
    case 'shrug': P.lean = -.04; arms(.9, 2.5, .7, 2.6); break;
    case 'facepalm': P.lean = .28; arms(2.2, 2.0, -.25, .3); legs(.15, 0, -.15, 0); break;      // ugh...
    case 'lookDown': P.lean = .55; arms(.5, .4, .1, .4); legs(.3, -.2, -.3, -.1); break;      // peeking over the edge
    case 'cheer': { const k = Math.sin(t * 12) * .15; P.lean = -.1; arms(2.8 + k, .2, 3.5 - k, -.2); legs(.25, 0, -.25, 0); break; }
    case 'clap': { const k = (Math.sin(t * 18) + 1) / 2; arms(1.1 + k * .35, 1, .9 + k * .35, 1.1); break; }
    case 'laugh': P.lean = -.22 + Math.sin(t * 22) * .05; arms(.6, 1.9, .4, 2); break;
    case 'boost': P.lean = .35; arms(1.1, .15, 1.0, .2); legs(.95, -1.5, -.5, -.9); break; // crouched, hands cupped
    case 'highfive': P.lean = .05; arms(2.45, .15, -.2, .3); break;
    case 'bow': P.lean = .7; arms(.4, .2, -.2, .2); break;
    case 'stance': { const k = Math.sin(t * 5) * .05; P.lean = .14; arms(.7 + k, 1.5, .35 - k, 1.9); legs(.4, -.35, -.35, -.15); break; }
    case 'punch': P.lean = .12 + .2 * e; arms(lerp(.7, 1.62, e), lerp(1.5, 0, e), .35, 1.9); legs(.45, -.35, -.4, -.1); break;
    case 'kick': P.lean = .12 - .4 * e; arms(.6, 1.4, -.3 - .4 * e, 1.2); legs(lerp(.4, 1.7, e), lerp(-.9, 0, e), -.1, -.05); break;
    case 'block': P.lean = -.05; arms(1.25, 1.9, 1.05, 2.1); legs(.35, -.4, -.3, -.2); break;
    case 'hurt': P.lean = -.45; arms(-1, -.4, -1.6, -.3); legs(.4, -.4, -.05, -.2); break;
    case 'held': { const k = Math.sin(t * 16); P.lean = 0; arms(2.9 + k * .2, .2, 3.4 - k * .2, -.2); legs(k * .6, -.3, -k * .6, -.3); break; }
    case 'dizzy': P.lean = Math.sin(t * 5) * .15; arms(.5 + Math.sin(t * 5) * .3, .3, -.5, .3); break;
    case 'dance': {
      if (b.choreo && b.choreo.slots) {  // their OWN routine, on the music's real beat when they can hear it
        const beat = b.beatMul ? ears.beat() * b.beatMul : t * b.choreo.tempo;
        [P.lean, P.fa0, P.fa1, P.ba0, P.ba1, P.fl0, P.fl1, P.bl0, P.bl1] = routineAt(b.choreo, beat).pose;
        break;
      }
      const type = b.danceType || 'groove', alt = b.danceStyle % 2 === 1;
      if (type === 'epic') {             // boss battle music: headbang + air punches / power stance
        const p = t * 9, k = Math.sin(p), hit = Math.max(0, k);
        if (!alt) { P.lean = .15 + hit * .45; arms(k > 0 ? 1.6 : .6, k > 0 ? .1 : 1.8, k > 0 ? .6 : 1.6, k > 0 ? 1.8 : .1); legs(.45, -.2, -.45, -.1); }
        else { P.lean = -.05 + hit * .2; arms(2.4 + hit * .6, .1, .5, 1.9); legs(.55, -.1, -.55, -.1); }
        break;
      }
      if (type === 'calm') {             // calm / sad music: slow sway
        const p = t * 2.6, k = Math.sin(p);
        P.lean = k * .12;
        if (!alt) arms(2.4 + k * .4, .5, 2.4 - k * .4, .5); else arms(.7 + k * .3, .6, .5 - k * .3, .6);
        legs(.12 + k * .08, 0, -.12 + k * .08, 0);
        break;
      }
      if (type === 'heroic') {           // hero / adventure theme: march with a raised fist
        const p = t * 6, k = Math.sin(p);
        P.lean = -.05;
        legs(Math.max(0, k) * 1.3, -Math.max(0, k) * 1.4, Math.max(0, -k) * 1.3, -Math.max(0, -k) * 1.4);
        if (!alt) arms(2.9, .1, -.3 - k * .4, .4); else arms(1.5 + k * .9, .2, -1.4 + k * .9, .2);
        break;
      }
      if (type === 'electronic') {       // electronic / 8-bit: the robot (jerky, snaps between poses)
        const beat = Math.floor(t * 3.5) % 4;
        const poses = [[1.57, 1.57, -.2, 1.57], [1.57, 0, 1.57, 0], [.2, 1.57, 1.57, -1.57], [2.5, -1.2, .3, 1.2]];
        const q = poses[(beat + (alt ? 2 : 0)) % 4];
        arms(q[0], q[1], q[2], q[3]); P.lean = beat % 2 ? .08 : -.04; legs(.25, 0, -.25, 0);
        break;
      }
      const p = t * 7, k = Math.sin(p), bounce = Math.abs(Math.sin(p));
      if (type === 'happy' && alt) {     // happy / party: the floss
        P.lean = -k * .15; arms(k * 1.2, .2, k * 1.2, .2); legs(.2 - k * .2, 0, -.2 - k * .2, 0);
      } else if (type === 'happy') {     // happy / party: jumping jacks
        const o = (k + 1) / 2; arms(lerp(.3, 2.9, o), .1, lerp(-.3, -2.9, o), -.1); legs(lerp(.08, .45, o), 0, lerp(-.08, -.45, o), 0); P.lean = 0;
      } else if (b.danceStyle === 1) {   // the floss
        P.lean = -k * .15; arms(k * 1.2, .2, k * 1.2, .2); legs(.2 - k * .2, 0, -.2 - k * .2, 0);
      } else if (b.danceStyle === 2) {   // jumping jacks
        const o = (k + 1) / 2; arms(lerp(.3, 2.9, o), .1, lerp(-.3, -2.9, o), -.1); legs(lerp(.08, .45, o), 0, lerp(-.08, -.45, o), 0); P.lean = 0;
      } else if (b.danceStyle === 3) {   // disco point
        const up = k > 0; arms(up ? 2.7 : .9, up ? .1 : 1.6, -.4, .6); P.lean = up ? -.12 : .12; stride(p * .5, .3, .5);
      } else {                           // arms up, side to side
        P.lean = k * .18; arms(2.6 + k * .5, .6, 2.6 - k * .5, .6); stride(p, .35, .4);
      }
      P.lean += bounce * .03;
      break; }
  }
  return P;
}

// Alan Becker proportions: big round head, long thin limbs, same thickness everywhere.
// Body sizes. TSC has his own look (like the real TSC): a hollow ring head and longer legs.
const TH = 15 * S, SH = 15 * S, UA = 12 * S, FA = 12 * S, TOR = 24 * S, HR = 9.5 * S, LINE = 3.6 * S;
const TSC_LEG = 17.5 * S, TSC_ARM = 12.5 * S;
const POSE_KEYS = ['lean', 'fa0', 'fa1', 'ba0', 'ba1', 'fl0', 'fl1', 'bl0', 'bl1'];

// Sitting criss-cross with their back to you, facing the screen, watching (like a movie audience).
function drawWatching(b) {
  const breathe = Math.sin(b.animT * 1.6) * .6;
  const hip = [b.x, b.y - 9 * S];
  const neck = [b.x, hip[1] - TOR + breathe];
  const sh = [b.x, neck[1] + 3 * S];
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = b.color; ctx.lineWidth = LINE;
  ctx.beginPath();
  ctx.moveTo(hip[0], hip[1]); ctx.lineTo(neck[0], neck[1]);                          // back
  for (const s of [-1, 1]) {
    ctx.moveTo(sh[0], sh[1]); ctx.lineTo(b.x + s * 9 * S, sh[1] + 11 * S); ctx.lineTo(b.x + s * 13 * S, b.y - 2); // arms resting down
    ctx.moveTo(hip[0], hip[1]); ctx.lineTo(b.x + s * 17 * S, b.y - 3); ctx.lineTo(b.x - s * 5 * S, b.y - 1);      // crossed legs
  }
  ctx.stroke();
  ctx.beginPath();
  if (b.id === 'tsc') { ctx.arc(b.x, neck[1] - HR - 1, HR - LINE / 2, 0, 7); ctx.strokeStyle = b.color; ctx.lineWidth = LINE; ctx.stroke(); } // TSC: hollow ring
  else { ctx.arc(b.x, neck[1] - HR - 1, HR, 0, 7); ctx.fillStyle = b.color; ctx.fill(); } // back of the head
  ctx.restore();
  b.hand = [b.x + 13 * S, b.y - 2]; b.head = [b.x, neck[1] - HR - 1];
}

function drawBody(b, dt) {
  if (b.anim === 'watchBack' && b.onGround) { b.P = null; drawWatching(b); return; } // sitting with their back to you, watching
  // Smoothly blend toward the target pose — this is what makes the motion feel animated.
  const T = targetPose(b);
  if (!b.P) b.P = { ...T };
  const k = 1 - Math.exp(-dt * 22);
  for (const key of POSE_KEYS) b.P[key] = lerp(b.P[key], T[key], k);
  const P = b.P, f = b.facing;

  const limb = (o, a0, a1, L1, L2) => {
    const j = [o[0] + Math.sin(a0) * L1 * f, o[1] + Math.cos(a0) * L1];
    const a = a0 + a1;
    return [o, j, [j[0] + Math.sin(a) * L2 * f, j[1] + Math.cos(a) * L2]];
  };
  const tsc = b.id === 'tsc', th = tsc ? TSC_LEG : TH, sh2 = tsc ? TSC_LEG : SH, ua = tsc ? TSC_ARM : UA, fa = tsc ? TSC_ARM : FA;
  const FL = limb([0, 0], P.fl0, P.fl1, th, sh2), BL = limb([0, 0], P.bl0, P.bl1, th, sh2);
  const foot = Math.max(FL[2][1], BL[2][1], FL[1][1], BL[1][1]);
  let hipY = b.y - foot, spin = 0;
  if (b.anim === 'perch') hipY = b.y - 2;
  if (b.anim === 'lie') { hipY = b.y - LINE; spin = -Math.PI / 2; }
  if (b.anim === 'held') hipY = b.y - 30 * S;
  if (b.flip > 0) { spin = b.flip * Math.PI * 2; hipY = b.y - 22 * S; }
  const neck = [Math.sin(P.lean) * TOR * f, -Math.cos(P.lean) * TOR];
  const sh = [neck[0] * .9, neck[1] * .9];
  const FA_ = limb(sh, P.fa0, P.fa1, ua, fa), BA_ = limb(sh, P.ba0, P.ba1, ua, fa);
  const head = [neck[0] + Math.sin(P.lean) * (HR + 1) * f, neck[1] - Math.cos(P.lean) * (HR + 1)];

  b.hand = [b.x + FA_[2][0], hipY + FA_[2][1]];
  b.head = spin && !b.flip ? [b.x - 30 * S * f, b.y - 10] : [b.x + head[0], hipY + head[1]];

  ctx.save();
  ctx.translate(b.x, hipY);
  if (spin) ctx.rotate(spin * f);
  if (b.inv > 0 && Math.floor(realNow * 16) % 2) ctx.globalAlpha = .6;
  const path = () => {
    ctx.beginPath();
    for (const L of [BA_, BL, FL, FA_]) { ctx.moveTo(L[0][0], L[0][1]); ctx.lineTo(L[1][0], L[1][1]); ctx.lineTo(L[2][0], L[2][1]); }
    ctx.moveTo(0, 0); ctx.lineTo(neck[0], neck[1]);
  };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  path(); ctx.strokeStyle = b.color; ctx.lineWidth = LINE; ctx.stroke();
  if (tsc) { ctx.beginPath(); ctx.arc(head[0], head[1], HR - LINE / 2, 0, 7); ctx.strokeStyle = b.color; ctx.lineWidth = LINE; ctx.stroke(); } // TSC: hollow ring head
  else { ctx.beginPath(); ctx.arc(head[0], head[1], HR, 0, 7); ctx.fillStyle = b.color; ctx.fill(); }
  ctx.restore();

  if (b.anim === 'code') { // a little laptop with code scrolling on the screen
    const f = b.facing, bx = b.x + f * 22 * S, by = b.y - 2;
    ctx.fillStyle = '#3a3f47'; ctx.fillRect(bx - 13 * S, by - 3 * S, 26 * S, 3 * S);            // keyboard
    ctx.save(); ctx.translate(bx + f * 12 * S, by - 3 * S); ctx.rotate(-f * .25);
    ctx.fillStyle = '#20242b'; ctx.fillRect(-2 * S, -20 * S, 4 * S, 20 * S);                   // screen (seen from the side)
    ctx.restore();
    ctx.fillStyle = 'rgba(120,220,255,.25)'; ctx.beginPath(); ctx.arc(bx + f * 8 * S, by - 12 * S, 10 * S, 0, 7); ctx.fill(); // screen glow
  }
  if (b.anim === 'read') { // a book in their hands
    const h = b.hand;
    ctx.fillStyle = b.bookColor || '#8a5a2b'; ctx.fillRect(h[0] - 6 * S, h[1] - 9 * S, 12 * S, 10 * S);
    ctx.fillStyle = '#f4efe2'; ctx.fillRect(h[0] - 5 * S, h[1] - 8 * S, 10 * S, 8 * S);
  }
  if (b.anim === 'dizzy') {
    for (let i = 0; i < 3; i++) {
      const a = realNow * 4 + i * 2.1;
      drawStar(b.head[0] + Math.cos(a) * 20, b.head[1] - 20 + Math.sin(a) * 6, 5, '#ffe14d');
    }
  }
}
function drawStar(x, y, r, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawIcon(b) {
  if (!b.icon) return;
  const { s, t, max } = b.icon;
  const pop = 1 + Math.max(0, (t / max - .85)) * 2;
  ctx.globalAlpha = Math.min(1, t * 3);
  ctx.font = `bold ${Math.round(18 * pop)}px "Segoe UI Symbol", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  const x = b.head[0], y = b.head[1] - HR - 12 - Math.sin(realNow * 4) * 1.5;
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(s, x, y);
  ctx.fillStyle = s === '♥' ? '#ff6b8a' : '#ffffff'; ctx.fillText(s, x, y);
  ctx.globalAlpha = 1;
}
function drawParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
    if (p.kind === 'arrow') {
      const a = Math.atan2(p.vy, p.vx), L = 26;
      ctx.strokeStyle = p.color; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x - Math.cos(a) * L, p.y - Math.sin(a) * L); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(a - .4) * 8, p.y - Math.sin(a - .4) * 8); ctx.lineTo(p.x - Math.cos(a + .4) * 8, p.y - Math.sin(a + .4) * 8);
      ctx.closePath(); ctx.fillStyle = '#c9c9c9'; ctx.fill();
    } else if (p.kind === 'text') {
      ctx.font = `bold ${p.size}px "Segoe UI Symbol", sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (.4 + .6 * p.life / p.max), 0, 7); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
