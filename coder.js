// StickBuddies — how the buddies write their OWN code.
//
// Nobody writes their programs for them. They snap together real code building blocks
// (variables, lists, for-loops, if-statements, functions, math, console.log) into a new program,
// run it with Node, and look at what it printed.
//
//  - Every program comes from a list of "choices" (genes). Changing a few choices changes the program
//    a little. That's how they IMPROVE a program: tweak it, run it, keep it if it's better.
//  - They learn which blocks work for them (blocks used in good programs get picked more).
//  - Beginners make mistakes (like using a variable they never made). Every program that crashes
//    teaches them to be more careful, so they make fewer mistakes over time.
//  - "Better" depends on who they are: Yellow loves math, TSC loves drawing patterns, Red loves
//    HUGE numbers, Green loves building with blocks, Blue likes calm, short programs.
'use strict';

const BLOCKS = ['number', 'text', 'list', 'print', 'loop', 'if', 'change', 'function'];

// Build a program from a list of choices. Same choices = same program.
function buildProgram(genes, br) {
  let gi = 0;
  const r = () => { if (gi >= genes.length) genes.push(+Math.random().toFixed(4)); return genes[gi++]; };
  const pickR = arr => arr[Math.floor(r() * arr.length) % arr.length];
  const weights = br.coder.weights;
  const mistakeChance = br.coder.mistakeChance;
  const me = br.b.def.short;
  const words = [...new Set([me, 'team', 'jump', 'dance',
    ...Object.values(br.opinions).filter(o => o.score > .15).map(o => o.name.split(' ')[0]),
    ...Object.values(br.dances).filter(d => d.slots).flatMap(d => d.slots.map(s => s.m))])].slice(0, 10);
  const scope = { nums: [], strs: [], lists: [], funcs: [] };
  const everSeen = ['count', 'total', 'size', 'word', 'things'];     // names a beginner might mix up
  const used = new Set();
  let names = 0;
  const newName = base => base + (names++ ? names : '');

  const num = (loopVar, depth = 0) => {
    const opts = ['lit', 'lit'];
    if (scope.nums.length) opts.push('var', 'var');
    if (loopVar) opts.push('loop', 'loop');
    if (scope.lists.length) opts.push('len');
    if (scope.funcs.length && depth < 1) opts.push('call');
    opts.push('random');
    if (depth < 1) opts.push('math');
    switch (pickR(opts)) {
      case 'lit': return String(1 + Math.floor(r() * 12) * pickR([1, 1, 2, 5, 10]));
      case 'var': {
        if (r() < mistakeChance) { br.coder.madeMistake = true; return pickR(everSeen); } // oops: a variable they never made
        return pickR(scope.nums);
      }
      case 'loop': return loopVar;
      case 'len': return pickR(scope.lists) + '.length';
      case 'call': return `${pickR(scope.funcs)}(${num(loopVar, depth + 1)})`;
      case 'random': return `Math.floor(Math.random() * ${2 + Math.floor(r() * 20)})`;
      case 'math': return `${num(loopVar, depth + 1)} ${pickR(['+', '-', '*', '*', '%'])} ${num(loopVar, depth + 1)}`;
    }
  };
  const str = (loopVar, depth = 0) => {
    const opts = ['word', 'word', 'pattern'];
    if (scope.strs.length) opts.push('var');
    if (scope.lists.length) opts.push('item');
    if (depth < 1) opts.push('join', 'join');
    switch (pickR(opts)) {
      case 'word': return JSON.stringify(pickR(words));
      case 'pattern': return `${JSON.stringify(pickR(['#', '*', '[]', '/\\\\', 'O', '=', '~', '|', '<>']))}.repeat(Math.min(Math.abs(${num(loopVar)}), 40))`;
      case 'var': return pickR(scope.strs);
      case 'item': { const L = pickR(scope.lists); return `${L}[${loopVar || num(null)} % ${L}.length]`; }
      case 'join': return `${str(loopVar, depth + 1)} + " " + ${pickR([str(loopVar, depth + 1), num(loopVar)])}`;
    }
  };
  const cond = loopVar => pickR([
    () => `${num(loopVar)} ${pickR(['<', '>', '==='])} ${num(loopVar)}`,
    () => loopVar ? `${loopVar} % 2 === 0` : `${num(null)} > 5`,
  ])();

  const stmt = (loopVar, depth, indent) => {
    const opts = BLOCKS.filter(k => !(k === 'loop' && depth > 1) && !(k === 'if' && depth > 2) && !(k === 'function' && depth > 0) && !(k === 'change' && !scope.nums.length));
    const k = weighted(opts, opts.map(o => weights[o] || 1));
    used.add(k);
    const pad = '  '.repeat(indent);
    switch (k) {
      case 'number': { const v = newName(pickR(['count', 'total', 'power', 'score', 'size'])); const line = `${pad}let ${v} = ${num(loopVar)};`; scope.nums.push(v); return line; }
      case 'text': { const v = newName(pickR(['word', 'message', 'name'])); const line = `${pad}let ${v} = ${str(loopVar)};`; scope.strs.push(v); return line; }
      case 'list': { const v = newName(pickR(['things', 'moves', 'favorites'])); const items = []; const n = 2 + Math.floor(r() * 4); for (let i = 0; i < n; i++) items.push(pickR(words)); scope.lists.push(v); return `${pad}const ${v} = ${JSON.stringify(items)};`; }
      case 'print': return `${pad}console.log(${r() < .5 ? str(loopVar) : num(loopVar)});`;
      case 'change': { const v = pickR(scope.nums); return `${pad}${v} = ${v} ${pickR(['+', '*', '-'])} ${num(loopVar)};`; }
      case 'loop': {
        const iv = ['i', 'j', 'k'][depth] || 'n', times = 2 + Math.floor(r() * 9);
        const body = []; const count = 1 + Math.floor(r() * 2);
        const before = { nums: scope.nums.length, strs: scope.strs.length, lists: scope.lists.length };
        for (let q = 0; q < count; q++) body.push(stmt(iv, depth + 1, indent + 1));
        scope.nums.length = before.nums; scope.strs.length = before.strs; scope.lists.length = before.lists; // loop variables stay inside the loop
        return `${pad}for (let ${iv} = 0; ${iv} < ${times}; ${iv}++) {\n${body.join('\n')}\n${pad}}`;
      }
      case 'if': {
        const before = { nums: scope.nums.length, strs: scope.strs.length, lists: scope.lists.length };
        const a = stmt(loopVar, depth + 1, indent + 1);
        scope.nums.length = before.nums; scope.strs.length = before.strs; scope.lists.length = before.lists;
        const b = stmt(loopVar, depth + 1, indent + 1);
        scope.nums.length = before.nums; scope.strs.length = before.strs; scope.lists.length = before.lists;
        return `${pad}if (${cond(loopVar)}) {\n${a}\n${pad}} else {\n${b}\n${pad}}`;
      }
      case 'function': {
        const f = newName(pickR(['boost', 'double', 'mix', 'grow']));
        const body = `${pad}function ${f}(x) {\n${pad}  return x ${pickR(['*', '+', '-'])} ${1 + Math.floor(r() * 9)};\n${pad}}`;
        scope.funcs.push(f);
        return body;
      }
    }
  };

  br.coder.madeMistake = false;
  const lines = [];
  const n = 3 + Math.floor(r() * 5);
  for (let s = 0; s < n; s++) lines.push(stmt(null, 0, 0));
  if (!lines.some(l => l.includes('console.log'))) lines.push(`console.log(${str(null)});`); // they always want to SEE something
  return { code: lines.join('\n'), used: [...used] };
}

// What does this program DO? (they name it themselves)
function nameProgram(code) {
  const has = s => code.includes(s);
  const what = has('.repeat(') ? 'pattern' : has('Math.random') ? 'dice' : has('function ') ? 'machine' : has('for (') ? 'counter' : has('if (') ? 'decider' : has('[') ? 'list' : 'message';
  return what;
}

// How good is this program to THIS buddy? (looks at what it printed)
function judgeProgram(br, out, ok) {
  if (!ok) return -1;
  const lines = out.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return -.5;
  const distinct = new Set(lines).size / lines.length;
  const size = lines.length >= 4 && lines.length <= 40 ? .35 : lines.length > 40 ? -.2 : lines.length === 3 ? .1 : -.3; // a real program shows a few lines
  const text = lines.join('\n');
  const digits = (text.match(/\d/g) || []).length / text.length;
  const symbols = (text.match(/[#*\/\\|O=~<>\[\]]/g) || []).length / text.length;
  const bigNum = Math.max(0, ...(text.match(/\d+/g) || ['0']).map(Number));
  const style = {
    yellow: digits * 1.5 + (text.includes('%') ? .1 : 0),
    tsc: symbols * 1.5,
    red: Math.min(1, Math.log10(bigNum + 1) / 5) * .8 + (bigNum > 9000 ? .3 : 0),
    green: (text.match(/\[\]|#/g) || []).length > 5 ? .6 : symbols,
    blue: lines.length <= 8 ? .5 - digits * .3 : .1,
  }[br.b.id] || 0;
  const enough = Math.min(1, lines.length / 6); // style only counts if there's enough to look at
  return clamp(size + distinct * .3 + style * enough, -1, 1.5);
}

// Put it all together: write a program (a new idea, or improve the best one so far).
function composeProgram(br) {
  const C = br.coder;
  let genes, improving = false;
  if (C.best && Math.random() < .6) {
    genes = C.best.genes.slice();
    const changes = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < changes; i++) genes[Math.floor(Math.random() * genes.length)] = +Math.random().toFixed(4);
    if (Math.random() < .2) genes.length = Math.max(4, genes.length - 3);
    improving = true;
  } else genes = [];
  const { code, used } = buildProgram(genes, br);
  const idea = improving ? C.best.idea : nameProgram(code);
  const file = improving ? C.best.file : `${idea}_${(C.ideas[idea] = (C.ideas[idea] || 0) + 1)}.js`;
  const version = improving ? C.best.version + 1 : 1;
  const text = [
    `// ${file} - ${br.b.name}'s own program (version ${version})`,
    `// I wrote this myself by snapping code blocks together. ${new Date().toLocaleString()}`,
    `// Run it: node ${file}`, '', code, '',
  ].join('\n');
  return { file, text, version, genes, used, idea, improving, mistake: C.madeMistake, typeTime: 5 + code.split('\n').length * .7 };
}

// After running it: learn from what happened.
function learnFromProgram(br, prog, ok, out) {
  const C = br.coder;
  const score = judgeProgram(br, out || '', ok);
  C.runs++;
  if (!ok) { C.fails++; C.mistakeChance = Math.max(.02, C.mistakeChance * .8); }  // crashed: be more careful next time
  for (const k of prog.used) C.weights[k] = clamp((C.weights[k] || 1) + (score - .3) * .25, .2, 3); // blocks in good programs get picked more
  const better = ok && (!C.best || score > C.best.score || (!prog.improving && score > .6));
  if (better) C.best = { genes: prog.genes, score, file: prog.file, idea: prog.idea, version: prog.version };
  return { score, better };
}

function newCoderMemory(saved) {
  return Object.assign({ best: null, weights: { print: 1.6, loop: 1.5 }, mistakeChance: .3, runs: 0, fails: 0, ideas: {} }, saved || {});
}
