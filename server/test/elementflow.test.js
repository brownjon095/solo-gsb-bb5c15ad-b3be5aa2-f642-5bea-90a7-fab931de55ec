import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeElementFlow } from '../chem/elementflow.js';

const sum = (arr) => arr.reduce((a, b) => a + b, 0n);

// 校验一组分配：非负整数、每物质转出/转入之和恰为原子总数，且只走允许关系。
function assertAllocation(result, supplies, demands, edges) {
  assert.equal(result.status, 'feasible');
  const nR = supplies.length;
  const nP = demands.length;
  const out = new Array(nR).fill(0n);
  const into = new Array(nP).fill(0n);
  assert.equal(result.flows.length, edges.length);
  result.flows.forEach((f, k) => {
    assert.ok(typeof f === 'bigint');
    assert.ok(f >= 0n, '转移量必须为非负整数');
    out[edges[k][0]] += f;
    into[edges[k][1]] += f;
  });
  assert.deepEqual(out, supplies, '每种反应物转出之和等于其原子总数');
  assert.deepEqual(into, demands, '每种生成物转入之和等于其原子总数');
  result.bounds.forEach((b, k) => {
    assert.ok(b.min >= 0n && b.min <= result.flows[k], '最小值不超过见证分配');
    assert.ok(b.max >= result.flows[k], '最大值不小于见证分配');
    assert.ok(b.max <= result.total, '单条转移不超过原子总数');
  });
}

test('2H2 + O2 -> 2H2O 选 H：仅 H2→H2O，4 个原子唯一转移', () => {
  const r = analyzeElementFlow([4n], [4n], [[0, 0]]);
  assertAllocation(r, [4n], [4n], [[0, 0]]);
  assert.deepEqual(r.flows, [4n]);
  assert.deepEqual(r.bounds, [{ min: 4n, max: 4n }]);
});

test('2H2 + O2 -> 2H2O 选 O：O2→H2O 2 个原子唯一转移', () => {
  const r = analyzeElementFlow([2n], [2n], [[0, 0]]);
  assert.equal(r.status, 'feasible');
  assert.deepEqual(r.flows, [2n]);
  assert.deepEqual(r.bounds, [{ min: 2n, max: 2n }]);
});

test('CH4 + 2O2 -> CO2 + 2H2O 选 O：允许关系齐全时两条路均可', () => {
  // 供应：O2=4；需求：CO2=2、H2O=2；O2 可去两者
  const edges = [[0, 0], [0, 1]];
  const r = analyzeElementFlow([4n], [2n, 2n], edges);
  assertAllocation(r, [4n], [2n, 2n], edges);
  // 每个生成物至少需 2，故单条转移上下界均为 2
  assert.deepEqual(r.bounds, [{ min: 2n, max: 2n }, { min: 2n, max: 2n }]);
});

test('完整二分图上各边上下界为 0 与 min(供应, 需求)', () => {
  // 供应 [10,10]，需求 [10,10]，4 条允许关系
  const edges = [[0, 0], [0, 1], [1, 0], [1, 1]];
  const r = analyzeElementFlow([10n, 10n], [10n, 10n], edges);
  assertAllocation(r, [10n, 10n], [10n, 10n], edges);
  for (const b of r.bounds) assert.deepEqual(b, { min: 0n, max: 10n });
});

test('上下界非平凡：供应[2,2] 需求[3,1] 完整图', () => {
  // 需求 3 的生成物从两边各至少取 1；边 (0,0)/(1,0) ∈ [1,2]，
  // 边 (0,1)/(1,1) ∈ [0,1]，且两对之间互补。
  const edges = [[0, 0], [0, 1], [1, 0], [1, 1]];
  const r = analyzeElementFlow([2n, 2n], [3n, 1n], edges);
  assertAllocation(r, [2n, 2n], [3n, 1n], edges);
  assert.deepEqual(r.bounds[0], { min: 1n, max: 2n });
  assert.deepEqual(r.bounds[1], { min: 0n, max: 1n });
  assert.deepEqual(r.bounds[2], { min: 1n, max: 2n });
  assert.deepEqual(r.bounds[3], { min: 0n, max: 1n });
});

test('乙醇燃烧选 O：允许关系不足时不可行并给 Hall 见证', () => {
  // C2H6O + 3O2 -> 2CO2 + 3H2O：O 供应 [1,6]，需求 CO2=4、H2O=3。
  // 乙醇的唯一 1 个 O 最多满足 CO2 需求 4 中的 1；若 O2 只允许流向 H2O，
  // 则 CO2 需求 4 超过其供货反应物（仅乙醇）供应 1，不可行。
  const bad = analyzeElementFlow([1n, 6n], [4n, 3n], [[0, 0], [0, 1], [1, 1]]);
  assert.equal(bad.status, 'infeasible');
  assert.deepEqual(bad.hall.products, [0]);
  assert.deepEqual(bad.hall.reactants, [0]);
  assert.equal(bad.hall.demand, 4n);
  assert.equal(bad.hall.supply, 1n);

  // 再去掉乙醇→CO2：CO2 没有任何供货反应物，供应为 0 的见证。
  const none = analyzeElementFlow([1n, 6n], [4n, 3n], [[0, 1], [1, 1]]);
  assert.equal(none.status, 'infeasible');
  assert.deepEqual(none.hall.products, [0]);
  assert.deepEqual(none.hall.reactants, []);
  assert.equal(none.hall.supply, 0n);
});

test('一氧化碳还原氧化铁：来源去向有多解，上下界非平凡', () => {
  // Fe2O3 + 3CO -> 2Fe + 3CO2：选 O，供应 Fe2O3=3、CO=3，需求 3CO2=6。
  // Fe 不含 O 已被过滤。允许 Fe2O3→CO2 与 CO→CO2（完整 2x1 图）。
  const edges = [[0, 0], [1, 0]];
  const r = analyzeElementFlow([3n, 3n], [6n], edges);
  assertAllocation(r, [3n, 3n], [6n], edges);
  // 两边供应都恰为 3，且 CO2 需要 6 ⇒ 每条边固定为 3
  assert.deepEqual(r.bounds, [{ min: 3n, max: 3n }, { min: 3n, max: 3n }]);

  // 改为 Fe2O3 + 4CO（供应 3 与 4，共 7）→ 2Fe + … 需 7 的非配平构造
  // 直接构造运输实例：供应 [4,3]，需求 [5,2]，完整图。
  const edges2 = [[0, 0], [0, 1], [1, 0], [1, 1]];
  const r2 = analyzeElementFlow([4n, 3n], [5n, 2n], edges2);
  assertAllocation(r2, [4n, 3n], [5n, 2n], edges2);
  // (0,0)：min = max(0, 4−2, 5−3) = 2，max = min(4,5) = 4
  assert.deepEqual(r2.bounds[0], { min: 2n, max: 4n });
  // (0,1)：min = max(0, 4−5, 2−3) = 0，max = min(4,2) = 2
  assert.deepEqual(r2.bounds[1], { min: 0n, max: 2n });
  // (1,0)：min = max(0, 3−2, 5−4) = 1，max = min(3,5) = 3
  assert.deepEqual(r2.bounds[2], { min: 1n, max: 3n });
  // (1,1)：min = 0，max = min(3,2) = 2
  assert.deepEqual(r2.bounds[3], { min: 0n, max: 2n });
});

test('Hall 见证：某生成物子集需求大于其允许供货反应物供应之和', () => {
  // 供应 [5,5]（共 10），需求 [8,2]；生成物 0 仅允许反应物 0 供货（供 5 < 需 8）
  const edges = [[0, 0], [0, 1], [1, 1]];
  const r = analyzeElementFlow([5n, 5n], [8n, 2n], edges);
  assert.equal(r.status, 'infeasible');
  assert.deepEqual(r.hall.products, [0]);
  assert.deepEqual(r.hall.reactants, [0]);
  assert.equal(r.hall.demand, 8n);
  assert.equal(r.hall.supply, 5n);

  // 放开反应物 1→生成物 0 后可行
  const edges2 = [[0, 0], [0, 1], [1, 0], [1, 1]];
  const ok = analyzeElementFlow([5n, 5n], [8n, 2n], edges2);
  assertAllocation(ok, [5n, 5n], [8n, 2n], edges2);
  // 生成物 0 需 8：两边合计 10，故每边至少给 3
  assert.equal(ok.bounds[0].min, 3n);
  assert.equal(ok.bounds[2].min, 3n);
});

test('不可行：某反应物无法把原子转出（其连接的生成物需求不足）', () => {
  // 供应 [5,5]，需求 [5,5]；反应物 1 仅能去生成物 1，而生成物 1 只能收 5，
  // 恰好可行；改为需求 [2,8] 且反应物 1 只连生成物 0（需 2）则不可行。
  const bad = analyzeElementFlow([5n, 5n], [2n, 8n], [[0, 0], [0, 1], [1, 0]]);
  assert.equal(bad.status, 'infeasible');
  // Hall 见证应落在生成物 1：其供货反应物只有反应物 0（供 5 < 需 8）
  assert.ok(bad.hall.products.includes(1));
  assert.ok(bad.hall.supply < bad.hall.demand);
});

test('环形自由度：3x3 完整图上的上下界', () => {
  // 供应 [2,3,4]（共 9），需求 [3,3,3]
  const edges = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) edges.push([i, j]);
  const r = analyzeElementFlow([2n, 3n, 4n], [3n, 3n, 3n], edges);
  assertAllocation(r, [2n, 3n, 4n], [3n, 3n, 3n], edges);
  // 边 (i,j) 上界 = min(供应_i, 需求_j)
  const cap = [[2n, 2n, 2n], [3n, 3n, 3n], [3n, 3n, 3n]];
  edges.forEach(([i, j], k) => {
    assert.equal(r.bounds[k].max, cap[i][j], `上界 (${i},${j})`);
    // 下界 = max(0, 供应_i − 其余需求之和, 需求_j − 其余供应之和)
    const otherDemand = sum([3n, 3n, 3n].filter((_, jj) => jj !== j));
    const otherSupply = sum([2n, 3n, 4n].filter((_, ii) => ii !== i));
    const want = [0n, [2n, 3n, 4n][i] - otherDemand, [3n, 3n, 3n][j] - otherSupply].reduce(
      (a, b) => (a > b ? a : b)
    );
    assert.equal(r.bounds[k].min, want, `下界 (${i},${j})`);
  });
});

test('大整数仍精确（远超安全整数范围）', () => {
  const A = 123456789012345678901234567890n;
  const r = analyzeElementFlow([A], [A], [[0, 0]]);
  assert.equal(r.status, 'feasible');
  assert.deepEqual(r.flows, [A]);
  assert.deepEqual(r.bounds[0], { min: A, max: A });
});

test('非守恒输入直接报错（编程错误而非业务不可行）', () => {
  assert.throws(() => analyzeElementFlow([3n], [4n], [[0, 0]]), /不相等/);
});
