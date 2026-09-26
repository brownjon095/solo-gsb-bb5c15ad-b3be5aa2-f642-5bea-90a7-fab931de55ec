import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFormula } from '../chem/parse.js';
import { balanceEquation } from '../chem/balance.js';
import { flowLayout, solveElementFlow } from '../chem/flow.js';

const counts = (arr) => arr.map((s) => parseFormula(s));

// 配平 + 布局一步到位；断言配平成功
const layoutOf = (left, right, element) => {
  const r = balanceEquation(counts(left), counts(right));
  assert.equal(r.status, 'balanced');
  return flowLayout(r.coefficients.left, r.coefficients.right, counts(left), counts(right), element);
};

const solve = (left, right, element, arcs) =>
  solveElementFlow(layoutOf(left, right, element), arcs);

// 验证一组可行分配：行和 = 反应物原子总数，列和 = 生成物原子总数，min ≤ witness ≤ max
function assertFeasible(flow, layout, arcs) {
  assert.equal(flow.feasible, true);
  assert.equal(flow.arcs.length, arcs.length);

  const out = new Map();
  const into = new Map();
  for (const b of flow.arcs) {
    const w = BigInt(b.witness);
    assert.ok(w >= 0n, '转移量非负');
    assert.ok(w >= BigInt(b.min) && w <= BigInt(b.max), '见证落在 [min, max] 内');
    assert.ok(BigInt(b.min) <= BigInt(b.max), 'min ≤ max');
    out.set(b.reactant, (out.get(b.reactant) || 0n) + w);
    into.set(b.product, (into.get(b.product) || 0n) + w);
  }
  for (const r of layout.reactants) {
    assert.equal(out.get(r.index) || 0n, BigInt(r.atoms), `反应物 ${r.index} 转出之和`);
  }
  for (const p of layout.products) {
    assert.equal(into.get(p.index) || 0n, BigInt(p.atoms), `生成物 ${p.index} 转入之和`);
  }
}

// ---------- 布局 ----------

test('布局：原子总数计入系数，仅含所选元素的物质', () => {
  // 2KMnO4 + 16HCl -> 2KCl + 2MnCl2 + 5Cl2 + 8H2O
  const left = ['KMnO4', 'HCl'];
  const right = ['KCl', 'MnCl2', 'Cl2', 'H2O'];
  const layout = layoutOf(left, right, 'Cl');
  assert.deepEqual(layout, {
    reactants: [{ index: 1, atoms: '16' }], // KMnO4 不含 Cl，被排除
    products: [
      { index: 0, atoms: '2' }, // 2·KCl
      { index: 1, atoms: '4' }, // 2·MnCl2
      { index: 2, atoms: '10' }, // 5·Cl2
      // H2O 不含 Cl，被排除
    ],
    total: '16',
  });

  const oxygen = layoutOf(left, right, 'O');
  assert.deepEqual(oxygen.reactants, [{ index: 0, atoms: '8' }]); // 2·KMnO4
  assert.deepEqual(oxygen.products, [{ index: 3, atoms: '8' }]); // 8·H2O
});

test('布局：两侧原子总数相等（守恒）', () => {
  const layout = layoutOf(['CO2', 'H2O'], ['C6H12O6', 'O2'], 'O');
  const sum = (list) => list.reduce((a, x) => a + BigInt(x.atoms), 0n);
  assert.equal(sum(layout.reactants), sum(layout.products));
  assert.equal(layout.total, '18');
});

// ---------- 可行与边界 ----------

test('单一反应物单一生成物：转移量被唯一确定', () => {
  // CH4 + 2O2 -> CO2 + 2H2O，元素 H：CH4 共 4 个，H2O 共 4 个
  const layout = layoutOf(['CH4', 'O2'], ['CO2', 'H2O'], 'H');
  assert.deepEqual(layout.reactants, [{ index: 0, atoms: '4' }]);
  assert.deepEqual(layout.products, [{ index: 1, atoms: '4' }]);
  const flow = solveElementFlow(layout, [{ reactant: 0, product: 1 }]);
  assertFeasible(flow, layout, [{ reactant: 0, product: 1 }]);
  assert.deepEqual(flow.arcs[0], { reactant: 0, product: 1, witness: '4', min: '4', max: '4' });
});

test('光合作用（2×2）：各关系的最小/最大转移量', () => {
  // 6CO2 + 6H2O -> C6H12O6 + 6O2，元素 O：源 12、6，汇 6、12
  const left = ['CO2', 'H2O'];
  const right = ['C6H12O6', 'O2'];
  const layout = layoutOf(left, right, 'O');
  assert.deepEqual(layout.reactants, [
    { index: 0, atoms: '12' },
    { index: 1, atoms: '6' },
  ]);
  assert.deepEqual(layout.products, [
    { index: 0, atoms: '6' },
    { index: 1, atoms: '12' },
  ]);

  const arcs = [
    { reactant: 0, product: 0 },
    { reactant: 0, product: 1 },
    { reactant: 1, product: 0 },
    { reactant: 1, product: 1 },
  ];
  const flow = solve(left, right, 'O', arcs);
  assertFeasible(flow, layout, arcs);

  // x00 ∈ [0,6]，x01 = 12 − x00 ∈ [6,12]，x10 = 6 − x00 ∈ [0,6]，x11 = x00 ∈ [0,6]
  const bound = (r, p) => flow.arcs.find((b) => b.reactant === r && b.product === p);
  assert.deepEqual([bound(0, 0).min, bound(0, 0).max], ['0', '6']);
  assert.deepEqual([bound(0, 1).min, bound(0, 1).max], ['6', '12']);
  assert.deepEqual([bound(1, 0).min, bound(1, 0).max], ['0', '6']);
  assert.deepEqual([bound(1, 1).min, bound(1, 1).max], ['0', '6']);
});

test('部分关系被禁用时边界收紧', () => {
  // 同上，但不允许 H2O -> C6H12O6：则 CO2 -> C6H12O6 被迫为 6
  const left = ['CO2', 'H2O'];
  const right = ['C6H12O6', 'O2'];
  const arcs = [
    { reactant: 0, product: 0 },
    { reactant: 0, product: 1 },
    { reactant: 1, product: 1 },
  ];
  const flow = solve(left, right, 'O', arcs);
  const layout = layoutOf(left, right, 'O');
  assertFeasible(flow, layout, arcs);
  const bound = (r, p) => flow.arcs.find((b) => b.reactant === r && b.product === p);
  assert.deepEqual([bound(0, 0).min, bound(0, 0).max], ['6', '6']);
  assert.deepEqual([bound(0, 1).min, bound(0, 1).max], ['6', '6']);
  assert.deepEqual([bound(1, 1).min, bound(1, 1).max], ['6', '6']);
});

test('单一反应物多个生成物：每条边都被需求唯一确定', () => {
  // 2KMnO4 + 16HCl -> 2KCl + 2MnCl2 + 5Cl2 + 8H2O，元素 Cl
  const left = ['KMnO4', 'HCl'];
  const right = ['KCl', 'MnCl2', 'Cl2', 'H2O'];
  const arcs = [
    { reactant: 1, product: 0 },
    { reactant: 1, product: 1 },
    { reactant: 1, product: 2 },
  ];
  const flow = solve(left, right, 'Cl', arcs);
  const layout = layoutOf(left, right, 'Cl');
  assertFeasible(flow, layout, arcs);
  const bound = (p) => flow.arcs.find((b) => b.product === p);
  assert.deepEqual([bound(0).min, bound(0).max], ['2', '2']);
  assert.deepEqual([bound(1).min, bound(1).max], ['4', '4']);
  assert.deepEqual([bound(2).min, bound(2).max], ['10', '10']);
});

// ---------- 不可行 ----------

test('生成物无转入关系：不可行并给出缺口与剩余', () => {
  // 光合作用，元素 O，但不允许任何关系指向 C6H12O6
  const left = ['CO2', 'H2O'];
  const right = ['C6H12O6', 'O2'];
  const arcs = [
    { reactant: 0, product: 1 },
    { reactant: 1, product: 1 },
  ];
  const flow = solve(left, right, 'O', arcs);
  assert.equal(flow.feasible, false);
  // C6H12O6 的 6 个 O 完全无法转入
  assert.deepEqual(flow.unmet, [{ index: 0, atoms: '6' }]);
  // 最大流为 12（O2 的容量）：CO2 与 H2O 各自都存在全部转出的最大流，
  // 故没有任何反应物被强制剩余
  assert.deepEqual(flow.leftover, []);
});

test('反应物无转出关系：不可行并给出强制剩余', () => {
  // 光合作用，元素 O，但 H2O 不允许任何转出关系
  const left = ['CO2', 'H2O'];
  const right = ['C6H12O6', 'O2'];
  const arcs = [
    { reactant: 0, product: 0 },
    { reactant: 0, product: 1 },
  ];
  const flow = solve(left, right, 'O', arcs);
  assert.equal(flow.feasible, false);
  // H2O 的 6 个 O 无处可去，必然剩余
  assert.deepEqual(flow.leftover, [{ index: 1, atoms: '6' }]);
  // CO2 的 12 个可补足 O2（12）与 C6H12O6（6）中的 12 个：两侧合计仍缺 6，
  // 但缺口落在哪个生成物上并不唯一（CO2 可自由选择），故无强制缺口
  assert.deepEqual(flow.unmet, []);
});

test('允许关系总量不足：不可行', () => {
  // 2H2 + O2 -> 2H2O，元素 H 共 4 个，但唯一允许的关系被对端需求限制
  const layout = layoutOf(['H2', 'O2'], ['H2O'], 'H');
  assert.equal(layout.total, '4');
  // 不勾选任何指向 H2O 的关系 -> 由端点层判 no-arcs；这里直接给空数组等价不可行
  const flow = solveElementFlow(layout, []);
  assert.equal(flow.feasible, false);
  assert.deepEqual(flow.unmet, [{ index: 0, atoms: '4' }]);
  assert.deepEqual(flow.leftover, [{ index: 0, atoms: '4' }]);
});

// ---------- 大数精确性 ----------

test('超过 2^53 的原子数仍精确（BigInt）', () => {
  const big = '9007199254740993'; // 2^53 + 1
  const layout = {
    reactants: [
      { index: 0, atoms: big },
      { index: 1, atoms: '2' },
    ],
    products: [{ index: 0, atoms: '9007199254740995' }],
    total: '9007199254740995',
  };
  const flow = solveElementFlow(layout, [
    { reactant: 0, product: 0 },
    { reactant: 1, product: 0 },
  ]);
  assert.equal(flow.feasible, true);
  // x0 ≤ big，x1 ≤ 2，x0 + x1 = big + 2 ⟹ x0 = big，x1 = 2 被唯一确定
  assert.deepEqual(flow.arcs[0], { reactant: 0, product: 0, witness: big, min: big, max: big });
  assert.deepEqual(flow.arcs[1], { reactant: 1, product: 0, witness: '2', min: '2', max: '2' });
});

test('大下标化学式的布局（计入系数）', () => {
  const layout = layoutOf(['H1000000'], ['H2'], 'H');
  // H1000000 -> 500000 H2：系数 [1] -> [500000]
  assert.deepEqual(layout.reactants, [{ index: 0, atoms: '1000000' }]);
  assert.deepEqual(layout.products, [{ index: 0, atoms: '1000000' }]);
});
