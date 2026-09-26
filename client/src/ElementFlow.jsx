import { useState } from 'react';
import FormulaText from './FormulaText.jsx';

// 元素来源去向：选定元素后仅展示含该元素的物质，矩阵勾选允许的
// “反应物 → 生成物”转移关系，服务端做整数运输可行判定并给出上下界。

// 该物质是否含所选元素（按配平返回的单分子组成）。
const hasEl = (comp, el) => comp != null && Object.prototype.hasOwnProperty.call(comp, el);

// 配平系数 × 单分子原子数（BigInt 字符串精确相乘）
function atomTotal(coefficient, comp, el) {
  return (BigInt(coefficient) * BigInt(comp[el])).toString();
}

export default function ElementFlow({ left, right, coefficients, composition }) {
  // 两侧都至少出现一次的元素，按在物质列表中的首次出现顺序排列
  const orderedChoices = [];
  for (const m of [...composition.left, ...composition.right]) {
    for (const el of Object.keys(m)) {
      if (
        !orderedChoices.includes(el) &&
        composition.left.some((c) => hasEl(c, el)) &&
        composition.right.some((c) => hasEl(c, el))
      ) {
        orderedChoices.push(el);
      }
    }
  }

  const [element, setElement] = useState('');
  const [checked, setChecked] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState([]);
  const [networkError, setNetworkError] = useState('');

  // 仅含所选元素的物质（保留原始下标）
  const leftItems = left
    .map((formula, index) => ({ formula, index, comp: composition.left[index] }))
    .filter((x) => hasEl(x.comp, element));
  const rightItems = right
    .map((formula, index) => ({ formula, index, comp: composition.right[index] }))
    .filter((x) => hasEl(x.comp, element));

  const keyOf = (li, rj) => `${li}:${rj}`;

  const chooseElement = (el) => {
    setElement(el);
    // 改变元素：清除勾选与上一次结果
    setChecked(new Set());
    setResult(null);
    setErrors([]);
    setNetworkError('');
  };

  const toggle = (li, rj) => {
    const key = keyOf(li, rj);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // 修改允许关系：清除上一次结果
    setResult(null);
    setErrors([]);
    setNetworkError('');
  };

  const allKey = () => {
    const all = new Set();
    leftItems.forEach((L) => rightItems.forEach((R) => all.add(keyOf(L.index, R.index))));
    return all;
  };
  const everyChecked =
    leftItems.length > 0 &&
    rightItems.length > 0 &&
    leftItems.every((L) => rightItems.every((R) => checked.has(keyOf(L.index, R.index))));
  const toggleAll = () => {
    setChecked(everyChecked ? new Set() : allKey());
    setResult(null);
    setErrors([]);
    setNetworkError('');
  };

  const analyze = async () => {
    const edges = [...checked].map((key) => {
      const [l, r] = key.split(':').map(Number);
      return { left: l, right: r };
    });
    setLoading(true);
    setResult(null);
    setErrors([]);
    setNetworkError('');
    try {
      const res = await fetch('/api/element-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ left, right, element, edges }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.ok) setResult(json.result);
      else setErrors(json.errors ?? []);
    } catch (e) {
      setNetworkError(`请求失败：${e.message}。请确认后端服务已启动。`);
    } finally {
      setLoading(false);
    }
  };

  const flow = result && result.element === element ? result.flow : null;
  const amountOf = (li, rj) =>
    flow?.status === 'feasible'
      ? flow.allocations.find((a) => a.left === li && a.right === rj)
      : null;

  return (
    <div className="feed-section flow-section">
      <h3>元素来源去向</h3>
      <p className="feed-intro">
        基于上方<strong>唯一正系数配平结果</strong>，选择一种元素：系统列出该元素在各反应物与生成物中
        （系数已计入）的原子总数；勾选允许的<strong>反应物 → 生成物</strong>转移关系后，
        把每条关系上的转移量视为非负整数，要求每种物质的转出/转入之和恰等于其原子总数。
        服务端用 BigInt 整数最大流判断能否完成分配，可行时给出一组分配以及每条关系在
        <strong>全部可行分配</strong>中的最小、最大原子数；不可行时指出卡在哪个生成物。
      </p>

      <div className="flow-elements">
        <span className="examples-label">选择元素：</span>
        {orderedChoices.map((el) => (
          <button
            key={el}
            type="button"
            className={`chip flow-el-chip ${el === element ? 'chip-active' : ''}`}
            onClick={() => chooseElement(el)}
          >
            {el}
          </button>
        ))}
      </div>

      {element && (leftItems.length === 0 || rightItems.length === 0) && (
        <div className="notice notice-warn">元素 {element} 未在反应式两侧同时出现。</div>
      )}

      {element && leftItems.length > 0 && rightItems.length > 0 && (
        <>
          <table className="flow-matrix">
            <thead>
              <tr>
                <th className="flow-corner">
                  <label className="flow-all">
                    <input type="checkbox" checked={everyChecked} onChange={toggleAll} />
                    <span>来源 ＼ 去向</span>
                  </label>
                </th>
                {rightItems.map((R) => (
                  <th key={R.index}>
                    <span className="flow-coef">{coefficients.right[R.index]}</span>
                    <FormulaText formula={R.formula} />
                    <div className="flow-need">
                      需 <strong>{atomTotal(coefficients.right[R.index], R.comp, element)}</strong> 个
                    </div>
                  </th>
                ))}
                <th className="flow-supply-head">转出原子总数</th>
              </tr>
            </thead>
            <tbody>
              {leftItems.map((L) => (
                <tr key={L.index}>
                  <th className="flow-side">
                    <span className="flow-coef">{coefficients.left[L.index]}</span>
                    <FormulaText formula={L.formula} />
                    <div className="flow-need">
                      供 <strong>{atomTotal(coefficients.left[L.index], L.comp, element)}</strong> 个
                    </div>
                  </th>
                  {rightItems.map((R) => {
                    const key = keyOf(L.index, R.index);
                    const on = checked.has(key);
                    const alloc = amountOf(L.index, R.index);
                    return (
                      <td key={R.index} className={on ? 'cell-on' : ''}>
                        <label className="flow-cell">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(L.index, R.index)}
                          />
                          {alloc && (
                            <span className="flow-alloc" title="一组可行分配的原子数">
                              {alloc.amount}
                            </span>
                          )}
                        </label>
                      </td>
                    );
                  })}
                  <td className="flow-total">{atomTotal(coefficients.left[L.index], L.comp, element)}</td>
                </tr>
              ))}
              <tr>
                <th className="flow-side">转入原子总数</th>
                {rightItems.map((R) => (
                  <td key={R.index} className="flow-total">
                    {atomTotal(coefficients.right[R.index], R.comp, element)}
                  </td>
                ))}
                <td className="flow-total" />
              </tr>
            </tbody>
          </table>

          <div className="feed-action">
            <button type="button" className="analyze-btn flow-btn" disabled={loading} onClick={analyze}>
              {loading ? '判定中…' : '判定能否分配'}
            </button>
            <span className="syntax-hint">
              已勾选 {checked.size} 条允许关系；修改元素或勾选会清除上一次结果，修改反应式会重置本页。
            </span>
          </div>

          {errors.length > 0 && (
            <ul className="feed-global-errors">
              {errors.map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          )}
          {networkError && <div className="notice notice-error">{networkError}</div>}

          {flow && flow.status === 'no-edges' && (
            <div className="notice notice-warn obs-verdict">
              <strong>尚未勾选转移关系</strong>
              <p>{flow.message}</p>
            </div>
          )}

          {flow && flow.status === 'infeasible' && (
            <div className="notice notice-error obs-verdict">
              <strong>无法完成分配</strong>
              <p>{flow.message}</p>
            </div>
          )}

          {flow && flow.status === 'feasible' && (
            <div className="notice notice-ok obs-verdict">
              <strong>可以完成分配</strong>
              <p>{flow.message}</p>
              <div className="xi-line">
                {element} 原子总数（守恒）：<strong>{flow.total}</strong> 个，均为非负整数转移。
              </div>
              <table className="feed-table flow-bounds-table">
                <thead>
                  <tr>
                    <th>反应物（来源）</th>
                    <th>生成物（去向）</th>
                    <th>一组分配原子数</th>
                    <th>最小可能</th>
                    <th>最大可能</th>
                  </tr>
                </thead>
                <tbody>
                  {flow.allocations.map((a, i) => (
                    <tr key={i}>
                      <td className="el-symbol">
                        <FormulaText formula={left[a.left].trim()} />
                      </td>
                      <td className="el-symbol">
                        <FormulaText formula={right[a.right].trim()} />
                      </td>
                      <td className="num-cell flow-fixed">{a.amount}</td>
                      <td className="num-cell">{a.min}</td>
                      <td className="num-cell">{a.max}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
