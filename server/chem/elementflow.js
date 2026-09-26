// 元素来源去向（整数运输问题，全程 BigInt 精确计算）。
//
// 选定一种元素后，反应物 i 中该元素的原子总数（系数已计入）为供应量 a_i，
// 生成物 j 的原子总数为需求量 b_j（守恒保证 Σa = Σb）；用户勾选允许的
// “反应物 → 生成物”转移关系，每条关系上的转移量为非负整数 x_ij，要求
//     Σ_j x_ij = a_i（该反应物的原子全部转出）
//     Σ_i x_ij = b_j（该生成物的原子全部转入）
// 这就是二分图上的整数运输（b-匹配）问题。用 BigInt Dinic 最大流：
//   · maxflow = Σa 即可行，边上的整数流量即一组分配见证；
//   · 不可行时由残量可达集给出 Hall 型见证（哪些生成物需求超过其允许
//     供货反应物的供应量之和）；
//   · 对每条允许边 e，固定一组可行流 f⁰ 后，任一可行流都可由 f⁰ 在
//     残量网络上沿环调整得到：沿 e 正向过环可增大 e、反向过环可减小 e，
//     故全部可行分配中
//         min x_e = f⁰_e − maxflow(i→j，残量网中删去 e)
//         max x_e = f⁰_e + maxflow(j→i，残量网中删去 e)
//     （删去 e 自身的两个方向，避免零环虚增）。

/** BigInt Dinic 最大流。 */
class Dinic {
  constructor(n) {
    this.n = n;
    this.g = Array.from({ length: n }, () => []);
  }

  // 加入 u→v 的弧，正向容量 cap，反向初始容量 revCap。
  // 返回正向边对象引用（便于读取最终残量推算流量）。
  addEdge(u, v, cap, revCap = 0n) {
    const forward = { to: v, rev: this.g[v].length, cap };
    const backward = { to: u, rev: this.g[u].length, cap: revCap };
    this.g[u].push(forward);
    this.g[v].push(backward);
    return forward;
  }

  bfs(s, t) {
    this.level = new Int32Array(this.n).fill(-1);
    this.level[s] = 0;
    const queue = [s];
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head];
      for (const e of this.g[v]) {
        if (e.cap > 0n && this.level[e.to] === -1) {
          this.level[e.to] = this.level[v] + 1;
          queue.push(e.to);
        }
      }
    }
    return this.level[t] !== -1;
  }

  dfs(v, t, pushed) {
    if (v === t) return pushed;
    const arcs = this.g[v];
    for (let k = this.it[v]; k < arcs.length; k = ++this.it[v]) {
      const e = arcs[k];
      if (e.cap <= 0n || this.level[e.to] !== this.level[v] + 1) continue;
      const d = this.dfs(e.to, t, pushed < e.cap ? pushed : e.cap);
      if (d > 0n) {
        e.cap -= d;
        this.g[e.to][e.rev].cap += d;
        return d;
      }
    }
    return 0n;
  }

  maxFlow(s, t, limit) {
    let flow = 0n;
    while (flow < limit && this.bfs(s, t)) {
      this.it = new Int32Array(this.n);
      while (flow < limit) {
        const pushed = this.dfs(s, t, limit - flow);
        if (pushed === 0n) break;
        flow += pushed;
      }
    }
    return flow;
  }

  /** 残量网络中从 s 沿容量为正的弧可达的节点集合。 */
  reachable(s) {
    const seen = new Uint8Array(this.n);
    seen[s] = 1;
    const queue = [s];
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head];
      for (const e of this.g[v]) {
        if (e.cap > 0n && !seen[e.to]) {
          seen[e.to] = 1;
          queue.push(e.to);
        }
      }
    }
    return seen;
  }
}

/**
 * supplies / demands：正 BigInt 数组（仅含所选元素的物质），要求总和相等。
 * edges：允许转移关系 [[反应物下标, 生成物下标], ...]，下标相对于上面两个
 *   过滤后的数组，且不得重复。
 *
 * 返回：
 *   { status: 'feasible', total, flows: bigint[]（与 edges 对齐）,
 *     bounds: [{ min: bigint, max: bigint }] }
 *   { status: 'infeasible', hall: { products: [...], reactants: [...],
 *     demand: bigint, supply: bigint } }
 */
export function analyzeElementFlow(supplies, demands, edges) {
  const nR = supplies.length;
  const nP = demands.length;
  if (nR === 0 || nP === 0) throw new Error('反应物与生成物均需含有该元素');
  const total = supplies.reduce((acc, x) => acc + x, 0n);
  if (demands.reduce((acc, x) => acc + x, 0n) !== total) {
    throw new Error('元素两侧原子总数不相等（反应式未配平）');
  }

  const S = nR + nP;
  const T = S + 1;
  const N = T + 1;
  const rNode = (i) => i;
  const pNode = (j) => nR + j;
  // 允许关系的容量取 total+1：任一单条转移都不需要超过 total，故永不拥塞。
  const INF = total + 1n;

  const dinic = new Dinic(N);
  const edgeRefs = edges.map(([i, j]) => dinic.addEdge(rNode(i), pNode(j), INF));
  supplies.forEach((a, i) => dinic.addEdge(S, rNode(i), a));
  demands.forEach((b, j) => dinic.addEdge(pNode(j), T, b));

  const flow = dinic.maxFlow(S, T, total);
  if (flow < total) {
    // Hall 见证：残量网中从 S 不可达的生成物集合 X，其允许供货反应物
    // 全部“饱和且无法把原子送入可达侧”，故 supply(N(X)) < demand(X)。
    const reach = dinic.reachable(S);
    const products = [];
    for (let j = 0; j < nP; j++) {
      if (!reach[pNode(j)]) products.push(j);
    }
    const productSet = new Set(products);
    const neighborSet = new Set();
    for (const [i, j] of edges) {
      if (productSet.has(j)) neighborSet.add(i);
    }
    const reactants = [...neighborSet].sort((a, b) => a - b);
    const demand = products.reduce((acc, j) => acc + demands[j], 0n);
    const supply = reactants.reduce((acc, i) => acc + supplies[i], 0n);
    return { status: 'infeasible', hall: { products, reactants, demand, supply } };
  }

  // 见证流 f⁰（允许边初始容量 INF，流量 = 初始容量 − 当前残量）。
  const flows = edgeRefs.map((e) => INF - e.cap);
  const out = new Array(nR).fill(0n);
  const into = new Array(nP).fill(0n);
  edges.forEach(([i, j], k) => {
    out[i] += flows[k];
    into[j] += flows[k];
  });

  // 按见证流构造残量网络；disabled 为不纳入（双向删去）的允许边下标。
  const buildResidual = (disabled) => {
    const d = new Dinic(N);
    edges.forEach(([i, j], k) => {
      if (k === disabled) return;
      const f = flows[k];
      d.addEdge(rNode(i), pNode(j), INF - f, f);
    });
    supplies.forEach((a, i) => d.addEdge(S, rNode(i), a - out[i], out[i]));
    demands.forEach((b, j) => d.addEdge(pNode(j), T, b - into[j], into[j]));
    return d;
  };

  const bounds = edges.map(([i, j], k) => {
    // 还能沿不含 e 的环把 e 减小多少：残量网 i→j 的最大流；环需经 e 的反向
    // 弧（容量 f⁰_e）闭合，故增量上限为 f⁰_e（保证最小不为负）。
    const decrease = buildResidual(k).maxFlow(rNode(i), pNode(j), flows[k]);
    // 同理增大需经 e 的正向弧（容量 INF−f⁰_e）闭合。
    const increase = buildResidual(k).maxFlow(pNode(j), rNode(i), INF - flows[k]);
    return { min: flows[k] - decrease, max: flows[k] + increase };
  });

  return { status: 'feasible', total, flows, bounds };
}
