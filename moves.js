// StickBuddies — the DANCE MOVE library. Real dance moves + "story" moves that act out a song.
// The buddies build their OWN routines out of these moves (see brain.js), but every move here is
// hand-animated so their dances look like real dancing, not random wiggles.
//
// Each frame is one pose: [lean, frontArm, frontForearm, backArm, backForearm, frontLeg, frontShin, backLeg, backShin]
// Angles: 0 = pointing down, 1.57 = pointing forward, 3.14 = pointing straight up, negative = behind.
// Each frame lasts one beat (or half a beat for fast moves with fast: true).
'use strict';

const LEG = { stand: [.12, 0, -.12, 0], wide: [.35, -.1, -.35, -.1], bent: [.45, -.7, -.25, -.5], tuck: [-.2, -.6, -.6, -.4] };
const pose9 = (lean, fa0, fa1, ba0, ba1, legs = LEG.stand) => [lean, fa0, fa1, ba0, ba1, ...legs];

const MOVES = {
  // ---- big energy
  fistPump:   { energy: .8, frames: [pose9(.05, 2.95, .1, .3, .5, LEG.wide), pose9(.15, 1.7, 1.4, .3, .5, LEG.bent)] },
  headbang:   { energy: 1, fast: true, frames: [pose9(.6, .5, 1.2, .3, 1.2, LEG.wide), pose9(-.05, .6, 1.5, .4, 1.4, LEG.wide)] },
  airGuitar:  { energy: .8, frames: [pose9(-.15, 1.0, 1.9, 1.9, .5, LEG.wide), pose9(.1, .6, 1.6, 1.9, .5, LEG.bent)] },
  stomp:      { energy: .9, frames: [pose9(.1, .4, 1.6, -.3, 1.6, [1.4, -1.7, -.15, 0]), pose9(.25, .3, 1.8, -.2, 1.8, LEG.wide)] },
  jumpingJack:{ energy: .8, frames: [pose9(0, 2.9, .1, -2.9, -.1, [.45, 0, -.45, 0]), pose9(0, .25, .1, -.25, .1, [.08, 0, -.08, 0])] },
  runningMan: { energy: .8, frames: [pose9(.15, .9, 1.5, -.6, 1.2, [1.2, -1.4, -.4, -.1]), pose9(.1, -.5, 1.2, .9, 1.5, [.1, -.1, -.1, 0])] },
  // ---- fun / party
  dab:        { energy: .6, frames: [pose9(.05, .2, .4, -.2, .4), pose9(.4, 2.3, 0, 1.3, 2.5, LEG.wide)] },
  floss:      { energy: .7, fast: true, frames: [pose9(-.1, -.9, .2, -.9, .2, [.3, 0, .05, 0]), pose9(.1, .9, .2, .9, .2, [-.05, 0, -.3, 0])] },
  twist:      { energy: .6, fast: true, frames: [pose9(.1, .9, 1.4, -.5, 1.4, LEG.bent), pose9(-.05, -.5, 1.4, .9, 1.4, [.3, -.7, -.45, -.5])] },
  clapStep:   { energy: .5, frames: [pose9(.05, 1.3, 1.1, 1.1, 1.2, [.4, -.05, -.12, 0]), pose9(.05, .3, .5, -.3, .5, [.12, 0, -.4, -.05])] },
  sprinkler:  { energy: .6, frames: [pose9(.1, 1.3, 0, 2.6, 1.9, LEG.bent), pose9(.05, 1.6, 0, 2.6, 1.9, LEG.bent), pose9(0, 1.9, 0, 2.6, 1.9, LEG.bent), pose9(.05, 1.6, 0, 2.6, 1.9, LEG.bent)] },
  cabbagePatch:{ energy: .5, frames: [pose9(.1, 1.2, 1.7, 1.0, 1.8, LEG.bent), pose9(.05, 1.6, 1.1, 1.4, 1.2, LEG.bent), pose9(0, 1.9, .7, 1.7, .8, LEG.bent), pose9(.05, 1.5, 1.3, 1.3, 1.4, LEG.bent)] },
  discoPoint: { energy: .6, frames: [pose9(-.12, 2.7, .1, -.4, .6, [.3, -.3, -.1, 0]), pose9(.12, .9, 1.6, -.4, .6, [.1, 0, -.3, -.3])] },
  robot:      { energy: .6, snap: true, frames: [pose9(0, 1.57, 1.57, -.2, 1.57), pose9(0, 1.57, 0, 1.57, 0), pose9(.05, .2, 1.57, 1.57, -1.57), pose9(-.05, 2.5, -1.2, .3, 1.2)] },
  // ---- calm
  sway:       { energy: .15, frames: [pose9(.12, 2.4, .5, 2.2, .5, [.2, 0, -.05, 0]), pose9(-.12, 2.6, .5, 2.4, .5, [.05, 0, -.2, 0])] },
  gentleWave: { energy: .2, frames: [pose9(.05, 2.7, .4, -.3, .4), pose9(-.05, 2.4, .9, -.2, .4)] },
  wave:       { energy: .4, frames: [pose9(0, 1.57, .6, 1.57, -.6), pose9(.03, 1.57, -.6, 1.57, .6)] },
  // ---- heroic
  march:      { energy: .6, frames: [pose9(-.05, 2.9, .1, -.6, .3, [1.3, -1.4, -.1, 0]), pose9(-.05, 2.9, .1, -.2, .3, [.1, 0, 1.3, -1.4])] },
  heroPose:   { energy: .3, frames: [pose9(-.08, 2.95, .1, .5, 2.2, LEG.wide), pose9(-.1, 3.0, .05, .5, 2.2, LEG.wide)] },
  // ---- STORY moves: acting out what the song is about
  fly:        { energy: .7, theme: 'fly', fast: true, frames: [pose9(.5, 2.3, .3, -2.3, -.3, LEG.tuck), pose9(.5, 1.1, .2, -1.1, -.2, LEG.tuck)] },
  shootArrow: { energy: .6, theme: 'arrow', frames: [pose9(.05, 1.57, 0, 1.5, -2.6, LEG.wide), pose9(.05, 1.57, 0, 1.5, -2.9, LEG.wide), pose9(-.05, 1.6, 0, -.5, .2, LEG.wide), pose9(0, 1.2, .3, .3, .5)] },
  swordSlash: { energy: .9, theme: 'sword', frames: [pose9(-.15, 3.0, .2, -.4, .4, LEG.wide), pose9(.35, 1.0, .1, -.6, .4, LEG.bent)] },
  swim:       { energy: .5, theme: 'swim', frames: [pose9(.6, 2.4, 0, 2.3, 0, [-.1, -.3, -.4, -.3]), pose9(.6, .3, .9, .2, .9, [.1, -.8, -.5, -.1])] },
  fireball:   { energy: .8, theme: 'fire', frames: [pose9(-.1, .9, 2.2, .7, 2.3, LEG.bent), pose9(.3, 1.57, 0, 1.45, 0, LEG.wide)] },
  zap:        { energy: .8, theme: 'thunder', frames: [pose9(-.1, 2.9, .1, 3.4, -.1, LEG.wide), pose9(.2, 1.57, 0, 1.4, 0, LEG.bent)] },
  sparkle:    { energy: .3, theme: 'magic', frames: [pose9(0, 2.6, .3, -2.6, -.3), pose9(-.05, 1.8, .6, -1.8, -.6, [.25, 0, -.05, 0]), pose9(0, 2.9, .1, -2.9, -.1), pose9(.05, 1.8, .6, -1.8, -.6, [.05, 0, -.25, 0])] },
};

// Which moves fit which kind of music
const MOOD_MOVES = {
  epic: ['headbang', 'fistPump', 'airGuitar', 'stomp', 'swordSlash', 'runningMan'],
  happy: ['jumpingJack', 'floss', 'clapStep', 'cabbagePatch', 'twist', 'sprinkler', 'dab'],
  calm: ['sway', 'gentleWave', 'wave'],
  heroic: ['march', 'fistPump', 'heroPose', 'swordSlash', 'clapStep'],
  electronic: ['robot', 'wave', 'discoPoint', 'runningMan', 'sprinkler'],
  groove: ['twist', 'discoPoint', 'clapStep', 'runningMan', 'dab', 'cabbagePatch'],
};
// Which story moves go with which song topic
const THEME_MOVES = { fly: ['fly'], arrow: ['shootArrow'], sword: ['swordSlash'], swim: ['swim'], fire: ['fireball', 'stomp'], thunder: ['zap'], magic: ['sparkle'] };

// What's the song ABOUT? (from the video title, e.g. Colgera = a Rito flying boss = fly + arrows)
function songThemes(title) {
  const t = (title || '').toLowerCase(), out = [];
  if (/rito|colgera|fly|flying|wing|bird|sky|tulin|revali|eagle|dragon|glide|loftwing/.test(t)) out.push('fly');
  if (/rito|colgera|arrow|bow\b|archer|tulin|revali|hunter/.test(t)) out.push('arrow');
  if (/sword|master sword|knight|blade|duel|ganon|construct|link/.test(t)) out.push('sword');
  if (/zora|water|sea\b|ocean|swim|mipha|sidon|river|underwater/.test(t)) out.push('swim');
  if (/goron|fire|volcano|lava|flame|yunobo|gohma|burn|death mountain/.test(t)) out.push('fire');
  if (/gerudo|thunder|lightning|storm|riju|gibdo|sand/.test(t)) out.push('thunder');
  if (/zelda|princess|goddess|magic|sage|temple|light|fairy|spirit/.test(t)) out.push('magic');
  return out.slice(0, 2);
}

// Where is a buddy in their routine right now? Each move in a routine lasts 4 beats.
const BEATS_PER_MOVE = 4;
function routineAt(routine, beat) {
  const n = routine.slots.length, total = n * BEATS_PER_MOVE;
  const pos = ((beat % total) + total) % total;
  const slot = routine.slots[Math.floor(pos / BEATS_PER_MOVE)];
  const move = MOVES[slot.m] || MOVES.sway;
  const local = pos % BEATS_PER_MOVE;                 // 0..4 beats into this move
  const steps = local * (move.fast ? 2 : 1);           // frames go by twice as fast for fast moves
  const i = Math.floor(steps) % move.frames.length, j = (i + 1) % move.frames.length;
  let u = steps % 1;
  u = move.snap ? (u < .25 ? u * 4 : 1) : u * u * (3 - 2 * u); // robot snaps, everything else flows
  return { slot, move, name: slot.m, frame: i, local, pose: move.frames[i].map((v, k) => lerp(v, move.frames[j][k], u)) };
}
