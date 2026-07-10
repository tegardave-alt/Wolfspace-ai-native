// core/agent/graph.cjs
const { reduceState, finalize } = require('./state.cjs');
const checkpoint = require('./checkpoint.cjs');
const END = '__end__';
const START = '__start__';
class Graph {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
  }
  addNode(name, fn) {
    if (typeof fn !== 'function') throw new Error('addNode: fn must be a function');
    this.nodes.set(name, fn);
    return this;
  }
  addEdge(from, to) {
    if (!this.nodes.has(to) && to !== END) throw new Error('addEdge: unknown node ' + to);
    this.edges.set(from, to);
    return this;
  }
  addConditionalEdges(from, router) {
    this.edges.set(from, router);
    return this;
  }
  compile(opts = {}) {
    const maxSteps = opts.maxSteps ?? 50;
    const onStep = opts.onStep || (() => {});
    const checkpointAfter = opts.checkpointAfter || (() => true);
    const self = this;
    async function invoke(initialState) {
      let state = initialState;
      let current;
      if (state?._next) {
        current = state._next; delete state._next;
      } else {
        const e = self.edges.get(START);
        current = typeof e === 'string' ? e : null;
        if (!current) current = self.nodes.keys().next().value || END;
      }
      let steps = 0;
      while (current !== END) {
        if (steps++ >= maxSteps) {
          state = finalize(state, { status: 'error', summary: 'max steps exceeded' });
          break;
        }
        const fn = self.nodes.get(current);
        if (!fn) { state = finalize(state, { status: 'error', summary: 'unknown node: ' + current }); break; }
        const patch = await fn(state);
        state = reduceState(state, patch || {});
        onStep(current, state);
        if (checkpointAfter(current)) { try { checkpoint.save(state, { dir: opts.checkpointDir }); } catch (_) {} }
        const edge = self.edges.get(current);
        if (!edge) current = END;
        else if (typeof edge === 'string') current = edge;
        else current = edge(state) || END;
      }
      return state;
    }
    return { invoke, END, START };
  }
}
module.exports = { Graph, END, START };