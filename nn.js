// StickBuddies — a tiny NEURAL NETWORK library, written from scratch (no libraries, no internet).
//
// A neural network is layers of "neurons". Each neuron adds up its inputs times some weights,
// then squashes the result. Learning = nudging the weights a tiny bit every time the network
// is wrong, so next time it's a little less wrong (that's called backpropagation).
'use strict';

const ACT = {
  relu:    { f: x => (x > 0 ? x : 0),            d: (x, y) => (x > 0 ? 1 : 0) },
  tanh:    { f: x => Math.tanh(x),               d: (x, y) => 1 - y * y },
  sigmoid: { f: x => 1 / (1 + Math.exp(-x)),     d: (x, y) => y * (1 - y) },
  linear:  { f: x => x,                          d: () => 1 },
};

class Layer {
  constructor(nIn, nOut, act) {
    this.nIn = nIn; this.nOut = nOut; this.act = act;
    const scale = Math.sqrt(2 / (nIn + nOut));
    this.W = new Float64Array(nIn * nOut).map(() => (Math.random() * 2 - 1) * scale * 1.7);
    this.b = new Float64Array(nOut);
    this.gW = new Float64Array(nIn * nOut); this.gb = new Float64Array(nOut);
    this.mW = new Float64Array(nIn * nOut); this.vW = new Float64Array(nIn * nOut);
    this.mb = new Float64Array(nOut); this.vb = new Float64Array(nOut);
  }
}

class Net {
  constructor(sizes, acts) {
    this.sizes = sizes; this.acts = acts;
    this.layers = [];
    for (let i = 0; i < sizes.length - 1; i++) this.layers.push(new Layer(sizes[i], sizes[i + 1], acts[i]));
    this.t = 0;
  }
  // Run the network: inputs in, outputs out.
  forward(x) {
    this.trace = [{ a: Float64Array.from(x) }];
    let a = this.trace[0].a;
    for (const L of this.layers) {
      const z = new Float64Array(L.nOut), out = new Float64Array(L.nOut), f = ACT[L.act].f;
      for (let o = 0; o < L.nOut; o++) {
        let s = L.b[o];
        const row = o * L.nIn;
        for (let i = 0; i < L.nIn; i++) s += L.W[row + i] * a[i];
        z[o] = s; out[o] = f(s);
      }
      this.trace.push({ z, a: out });
      a = out;
    }
    return a;
  }
  // Learn from one example. `target` = what the output SHOULD have been.
  // `mask` says which outputs we know the answer for (the others are left alone).
  backward(x, target, mask) {
    const out = this.forward(x);
    const last = this.layers.length - 1;
    let delta = new Float64Array(out.length);
    for (let o = 0; o < out.length; o++) {
      if (mask && !mask[o]) continue;
      const err = out[o] - target[o];
      // sigmoid outputs use cross-entropy loss, which makes the error term simply (out - target)
      delta[o] = this.layers[last].act === 'sigmoid' ? err : err * ACT[this.layers[last].act].d(this.trace[last + 1].z[o], out[o]);
    }
    for (let l = last; l >= 0; l--) {
      const L = this.layers[l], aPrev = this.trace[l].a;
      for (let o = 0; o < L.nOut; o++) {
        const d = delta[o];
        if (!d) continue;
        L.gb[o] += d;
        const row = o * L.nIn;
        for (let i = 0; i < L.nIn; i++) L.gW[row + i] += d * aPrev[i];
      }
      if (l === 0) break;
      const P = this.layers[l - 1], next = new Float64Array(L.nIn), df = ACT[P.act].d;
      for (let i = 0; i < L.nIn; i++) {
        let s = 0;
        for (let o = 0; o < L.nOut; o++) s += L.W[o * L.nIn + i] * delta[o];
        next[i] = s * df(this.trace[l].z[i], this.trace[l].a[i]);
      }
      delta = next;
    }
  }
  // Apply what was learned (Adam optimizer: a smart way of nudging weights).
  step(lr, batch) {
    this.t++;
    const b1 = .9, b2 = .999, eps = 1e-8, c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t);
    for (const L of this.layers) {
      const upd = (w, g, m, v) => {
        for (let i = 0; i < w.length; i++) {
          const gi = clamp(g[i] / batch, -5, 5);
          m[i] = b1 * m[i] + (1 - b1) * gi;
          v[i] = b2 * v[i] + (1 - b2) * gi * gi;
          w[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + eps);
          g[i] = 0;
        }
      };
      upd(L.W, L.gW, L.mW, L.vW);
      upd(L.b, L.gb, L.mb, L.vb);
    }
  }
  copyFrom(net) { this.layers.forEach((L, i) => { L.W.set(net.layers[i].W); L.b.set(net.layers[i].b); }); }
  save() { return this.layers.map(L => [Array.from(L.W, v => +v.toFixed(5)), Array.from(L.b, v => +v.toFixed(5))]); }
  // Load saved weights. If the network has GROWN since (new senses or new choices),
  // keep everything it already knew and start the new parts fresh.
  load(data) {
    if (!data || data.length !== this.layers.length) return false;
    data.forEach(([w, b], li) => {
      const L = this.layers[li], oldOut = b.length, oldIn = w.length / oldOut;
      if (li === 0 && oldIn < L.nIn) for (let o = 0; o < L.nOut; o++) for (let i = oldIn; i < L.nIn; i++) L.W[o * L.nIn + i] = 0;
      for (let o = 0; o < Math.min(oldOut, L.nOut); o++) {
        L.b[o] = b[o];
        for (let i = 0; i < Math.min(oldIn, L.nIn); i++) L.W[o * L.nIn + i] = w[o * oldIn + i];
      }
    });
    return true;
  }
}

// ---------------------------------------------------------------- Q-learning (the decision brain)
// The network looks at how the buddy feels and what's around, and guesses how GOOD each choice
// will turn out ("Q-value"). After trying a choice, it sees how things actually turned out and
// corrects its guess. At first it guesses randomly (exploring); over time it trusts itself more.
class QLearner {
  constructor(nIn, actions, saved) {
    this.actions = actions;
    this.q = new Net([nIn, 32, 24, actions.length], ['relu', 'relu', 'linear']);
    this.target = new Net([nIn, 32, 24, actions.length], ['relu', 'relu', 'linear']);
    this.mem = [];
    if (saved && this.q.load(saved.w)) {
      this.eps = Math.max(saved.eps, .25); // new things to learn about, so explore a bit again
      this.decisions = saved.decisions || 0;
      const pad = (a, n, fill) => { const out = Array.from(a); while (out.length < n) out.push(fill); return out.slice(0, n); };
      this.mem = (saved.mem || []).map(e => ({ s: pad(e.s, nIn, 0), a: e.a, r: e.r, s2: pad(e.s2, nIn, 0), valid2: pad(e.valid2, actions.length, false) }));
    }
    else { this.eps = 1; this.decisions = 0; }
    this.target.copyFrom(this.q);
    this.gamma = .5; // how much it cares about what happens after this choice
    this.lastLoss = 0;
  }
  values(state) { return Array.from(this.q.forward(state)); }
  choose(state, valid) {
    const ok = this.actions.map((a, i) => (valid[i] ? i : -1)).filter(i => i >= 0);
    if (Math.random() < this.eps) return { i: pick(ok), guessed: true };
    const v = this.values(state);
    let best = ok[0];
    for (const i of ok) if (v[i] > v[best]) best = i;
    return { i: best, guessed: false };
  }
  remember(s, a, r, s2, valid2) {
    this.mem.push({ s, a, r, s2, valid2 });
    if (this.mem.length > 3000) this.mem.shift();
  }
  learn(iters = 12, batch = 16) {
    if (this.mem.length < 8) return;
    let loss = 0;
    for (let k = 0; k < iters; k++) {
      for (let n = 0; n < batch; n++) {
        const e = pick(this.mem);
        const next = this.target.forward(e.s2);
        let best = -Infinity;
        for (let i = 0; i < next.length; i++) if (e.valid2[i] && next[i] > best) best = next[i];
        if (best === -Infinity) best = 0;
        const want = e.r + this.gamma * best;
        const target = new Float64Array(this.actions.length), mask = new Float64Array(this.actions.length);
        target[e.a] = want; mask[e.a] = 1;
        this.q.backward(e.s, target, mask);
        loss += (this.q.trace[this.q.trace.length - 1].a[e.a] - want) ** 2;
      }
      this.q.step(.003, batch);
    }
    this.lastLoss = loss / (iters * batch);
    this.decisions++;
    this.eps = Math.max(.05, this.eps * .985); // guess less as it learns
    if (this.decisions % 30 === 0) this.target.copyFrom(this.q);
  }
  save() {
    const r = v => +v.toFixed(3);
    const mem = this.mem.slice(-400).map(e => ({ s: Array.from(e.s, r), a: e.a, r: r(e.r), s2: Array.from(e.s2, r), valid2: e.valid2 }));
    return { w: this.q.save(), eps: this.eps, decisions: this.decisions, mem }; // the network AND recent experiences
  }
}

// ---------------------------------------------------------------- the jumping brain
// Learns, by trial and error, how hard to jump and when to double-jump to land on a window
// that is `height` pixels above. It predicts "will this jump land?" and picks the best jump.
class JumpSkill {
  constructor(saved) {
    this.net = new Net([3, 16, 1], ['tanh', 'sigmoid']);
    this.hist = [];
    if (saved && this.net.load(saved.w)) { this.eps = saved.eps; this.tries = saved.tries; this.hits = saved.hits; this.hist = saved.hist || []; }
    else { this.eps = .7; this.tries = 0; this.hits = 0; }
  }
  feats(h, p, d) { return [h / 400, (p - .9) / .35, d / .55 - .5]; }
  prob(h, p, d) { return this.net.forward(this.feats(h, p, d))[0]; }
  best(h) {
    let bp = -1, pick = null;
    for (let i = 0; i < 40; i++) {
      const p = rand(.6, 1.25), d = rand(0, .55);
      const score = this.prob(h, p, d) - .05 * (p - .6);
      if (score > bp) { bp = score; pick = { p, d, chance: this.prob(h, p, d) }; }
    }
    return pick;
  }
  chance(h) { return this.best(h).chance; }
  choose(h) {
    if (Math.random() < this.eps) return { p: rand(.6, 1.25), d: rand(0, .55), guessed: true };
    return this.best(h);
  }
  learn(h, p, d, ok) {
    this.tries++; if (ok) this.hits++;
    this.hist.push([Math.round(h), +p.toFixed(3), +d.toFixed(3), ok ? 1 : 0]);
    if (this.hist.length > 300) this.hist.shift();
    for (let k = 0; k < 40; k++) {
      for (let n = 0; n < 8; n++) {
        const [hh, pp, dd, y] = pick(this.hist);
        this.net.backward(this.feats(hh, pp, dd), [y]);
      }
      this.net.step(.01, 8);
    }
    this.eps = Math.max(.08, this.eps * .96);
  }
  save() { return { w: this.net.save(), eps: this.eps, tries: this.tries, hits: this.hits, hist: this.hist.slice(-150) }; }
}
