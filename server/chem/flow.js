// 元素来源去向（转移分配）求解：精确 BigInt 最小费用最大流。
//
// 在唯一正系数配平结果上选定元素 E，只考虑含 E 的物质：
//   反应物 i 含 E 原子共 s_i = c_i·(i 中 E 的原子数) 个（计入系数），
//   生成物 j 含 E 原子共 t_j = d_j·(j 中 E 的原子数) 个。
// 配平守恒保证 Σs_i = Σt_j。用户勾选的允许关系 (i,j) 构成二分图的边，
// x_ij ≥ 0 的整数表示反应物 i 转移给生成物 j 的 E 原子数，要求每种反应物
// 转出之和 = s_i、每种生成物转入之和 = t_j。
//
// 这是运输问题：约束矩阵为二分图点弧关联矩阵（全单位模），且 s、t 为整数，
// 故线性松弛可行 ⟺ 存在非负整数分配，且每条边流量在全部可行分配上的
// 最小/最大值都是整数，等于对应最小费用流的目标值：
//   · 可行性 + 一组分配：所有边费用 0，求流量为 Σs_i 的流；
//   · 边 e 的最小值：e 费用 1、其余费用 0 的最小费用（= min x_e）；
//   · 边 e 的最大值：其余边费用 1、e 费用 0 的最小费用 = Σs_i − max x_e。
// 不可行时，再在“最大流”内部逐边优化，给出每种反应物必然剩余（无法转出）、
// 每种生成物必然缺口（无法转入）的原子数，便于定位需要补勾的关系。

/**
 * 最小费用最大流：逐条最短路增广（SSP）+ 势能，保证约化费用非负。
 * 容量/流量为 BigInt，费用为非负整数（Number）；结点数很小，Dijkstra 取 O(V^2)。
 */
class MinCostFlow {
  constructor(nodeCount) {
    this.g = Array.from({ length: nodeCount }, () => []);
  }

  // 添加有向边 from→to（容量 cap: BigInt，费用 cost: Number），返回边位置便于事后读流量。
  addEdge(from, to, cap, cost) {
    const fwd = { to, rev: this.g[to].length, cap, cost };
    const bwd = { to: from, rev: this.g[from].length, cap: 0n, cost: -cost };
    this.g[from].push(fwd);
    this.g[to].push(bwd);
    return { node: from, pos: this.g[from].length - 1 };
  }

  // 边上已通过的流量 = 反向残余边的容量
  flowOf(ref) {
    const e = this.g[ref.node][ref.pos];
    return this.g[e.to][e.rev].cap;
  }

  /**
   * 从 s 到 t 尽量送出 target 单位流，返回 { flow, cost }（BigInt）。
   * 无法达到 target 时返回实际送出的最大流及对应最小费用。
   */
  run(s, t, target) {
    const n = this.g.length;
    const potential = new Array(n).fill(0);
    let flow = 0n;
    let cost = 0n;

    while (flow < target) {
      // Dijkstra：结点很少，数组版 O(V^2) 足够
      const dist = new Array(n).fill(Infinity);
      const prevNode = new Array(n).fill(-1);
      const prevPos = new Array(n).fill(-1);
      const done = new Array(n).fill(false);
      dist[s] = 0;
      for (;;) {
        let u = -1;
        for (let i = 0; i < n; i++) {
          if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
        }
        if (u < 0) break;
        done[u] = true;
        const edges = this.g[u];
        for (let k = 0; k < edges.length; k++) {
          const e = edges[k];
          if (e.cap <= 0n) continue;
          const nd = dist[u] + e.cost + potential[u] - potential[e.to];
          if (nd < dist[e.to]) {
            dist[e.to] = nd;
            prevNode[e.to] = u;
            prevPos[e.to] = k;
          }
        }
      }
      if (dist[t] === Infinity) break; // 残余网络中已无增广路
      for (let i = 0; i < n; i++) if (dist[i] < Infinity) potential[i] += dist[i];

      let add = target - flow;
      for (let v = t; v !== s; v = prevNode[v]) {
        const cap = this.g[prevNode[v]][prevPos[v]].cap;
        if (cap < add) add = cap;
      }
      for (let v = t; v !== s; v = prevNode[v]) {
        const e = this.g[prevNode[v]][prevPos[v]];
        e.cap -= add;
        this.g[v][e.rev].cap += add;
      }
      flow += add;
      // 势能更新后 potential[t] 即该条增广路的真实费用
      cost += add * BigInt(potential[t]);
    }
    return { flow, cost };
  }
}

/**
 * 布局：含所选元素的物质及其原子总数（计入系数）。
 * coefLeft/coefRight：配平返回的正整数系数（number 或十进制字符串）；
 * leftCounts/rightCounts：parseFormula 返回的 Map 数组。
 * 返回 { reactants: [{index, atoms}], products: [{index, atoms}], total }，
 * index 为原始下标，原子数为十进制字符串。
 */
export function flowLayout(coefLeft, coefRight, leftCounts, rightCounts, element) {
  const reactants = [];
  coefLeft.forEach((c, i) => {
    const k = BigInt(leftCounts[i].get(element) || 0);
    if (k > 0n) reactants.push({ index: i, atoms: (BigInt(c) * k).toString() });
  });
  const products = [];
  coefRight.forEach((d, j) => {
    const k = BigInt(rightCounts[j].get(element) || 0);
    if (k > 0n) products.push({ index: j, atoms: (BigInt(d) * k).toString() });
  });
  const total = reactants.reduce((acc, r) => acc + BigInt(r.atoms), 0n);
  return { reactants, products, total: total.toString() };
}

/**
 * 求解转移分配。
 * layout：flowLayout 的返回；arcs：已校验、已去重的 [{ reactant, product }]
 * （原始下标，两端物质均含所选元素）。
 * 返回：
 *   { feasible: true,  arcs: [{ reactant, product, witness, min, max }] }
 *   { feasible: false, leftover: [{index, atoms}], unmet: [{index, atoms}] }
 * 数值均为十进制字符串；witness 为一组可行分配中该关系的转移量，
 * min/max 为全部可行分配中该关系转移量的最小/最大值；
 * leftover/unmet 为不可行时无论如何分配都无法转出/转入的原子数。
 */
export function solveElementFlow(layout, arcs) {
  const m = layout.reactants.length;
  const n = layout.products.length;
  const S = 0;
  const T = 1 + m + n;
  const rNode = (a) => 1 + a;
  const pNode = (b) => 1 + m + b;
  const total = BigInt(layout.total);

  // 原始下标 → 布局下标
  const rPos = new Map(layout.reactants.map((r, a) => [r.index, a]));
  const pPos = new Map(layout.products.map((p, b) => [p.index, b]));

  // 建图：S→反应物（容量 s_i）、允许关系（容量充足）、生成物→T（容量 t_j）
  const build = ({ supplyCost = () => 0, arcCost = () => 0, demandCost = () => 0 } = {}) => {
    const mcf = new MinCostFlow(2 + m + n);
    layout.reactants.forEach((r, a) => mcf.addEdge(S, rNode(a), BigInt(r.atoms), supplyCost(a)));
    layout.products.forEach((p, b) => mcf.addEdge(pNode(b), T, BigInt(p.atoms), demandCost(b)));
    const refs = arcs.map((arc, k) =>
      mcf.addEdge(rNode(rPos.get(arc.reactant)), pNode(pPos.get(arc.product)), total, arcCost(k))
    );
    return { mcf, refs };
  };

  // 1) 可行性 + 一组分配：全部费用 0，求流量为 Σs_i 的流
  const base = build();
  const first = base.mcf.run(S, T, total);

  if (first.flow < total) {
    // 不可行：在最大流内部逐边优化，求每种物质必然剩余/缺口的原子数。
    // 其余 S→R 边费用 1 ⟺ 最大化该反应物的转出；P→T 边同理最大化转入。
    const maxflow = first.flow;
    const leftover = [];
    layout.reactants.forEach((r, a) => {
      const { mcf } = build({ supplyCost: (k) => (k === a ? 0 : 1) });
      const res = mcf.run(S, T, maxflow);
      const forced = BigInt(r.atoms) - (maxflow - res.cost);
      if (forced > 0n) leftover.push({ index: r.index, atoms: forced.toString() });
    });
    const unmet = [];
    layout.products.forEach((p, b) => {
      const { mcf } = build({ demandCost: (k) => (k === b ? 0 : 1) });
      const res = mcf.run(S, T, maxflow);
      const forced = BigInt(p.atoms) - (maxflow - res.cost);
      if (forced > 0n) unmet.push({ index: p.index, atoms: forced.toString() });
    });
    return { feasible: false, leftover, unmet };
  }

  // 2) 一组可行分配（见证）+ 逐边最小/最大转移量
  const witness = base.refs.map((ref) => base.mcf.flowOf(ref));
  const bounds = arcs.map((arc, k) => {
    // e 费用 1、其余 0：最小费用 = min x_e
    const minCost = build({ arcCost: (q) => (q === k ? 1 : 0) }).mcf.run(S, T, total).cost;
    // 其余边费用 1、e 费用 0：最小费用 = Σs_i − max x_e
    const maxCost = build({ arcCost: (q) => (q === k ? 0 : 1) }).mcf.run(S, T, total).cost;
    return {
      reactant: arc.reactant,
      product: arc.product,
      witness: witness[k].toString(),
      min: minCost.toString(),
      max: (total - maxCost).toString(),
    };
  });

  return { feasible: true, arcs: bounds };
}
