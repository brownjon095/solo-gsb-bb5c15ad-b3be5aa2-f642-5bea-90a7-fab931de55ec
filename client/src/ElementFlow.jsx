import { useState } from 'react';
import FormulaText from './FormulaText.jsx';

// 元素来源去向：选择配平式中的一种元素，列出其在各反应物/生成物中的
// 原子总数（计入系数），勾选允许的反应物→生成物转移关系后由服务端
// 判定可行性并给出每条关系在全部可行分配中的最小、最大转移原子数。
export default function ElementFlow({ left, right, coefficients, elements }) {
  const [element, setElement] = useState('');
  const [layout, setLayout] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const [flow, setFlow] = useState(null);
  const [errors, setErrors] = useState([]);
  const [networkError, setNetworkError] = useState('');
  const [loadingLayout, setLoadingLayout] = useState(false);
  const [solving, setSolving] = useState(false);

  const clearResult = () => {
    setFlow(null);
    setErrors([]);
    setNetworkError('');
  };

  const post = async (payload) => {
    const res = await fetch('/api/element-flow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  // 更换元素：清除勾选与结果，重新获取各物质原子总数
  const selectElement = async (symbol) => {
    setElement(symbol);
    setChecked(new Set());
    setLayout(null);
    clearResult();
    if (!symbol) return;
    setLoadingLayout(true);
    try {
      const json = await post({ left, right, element: symbol });
      if (json.ok) setLayout(json.result.layout);
      else setErrors(json.errors ?? []);
    } catch (e) {
      setNetworkError(`请求失败：${e.message}。请确认后端服务已启动。`);
    } finally {
      setLoadingLayout(false);
    }
  };

  const toggle = (ri, pi) => {
    const key = `${ri}-${pi}`;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    clearResult(); // 修改勾选即清除上次求解结果
  };

  const solve = async () => {
    setSolving(true);
    clearResult();
    const arcs = [...checked].map((key) => {
      const [reactant, product] = key.split('-').map(Number);
      return { reactant, product };
    });
    try {
      const json = await post({ left, right, element, arcs });
      if (json.ok) {
        setLayout(json.result.layout);
        setFlow(json.result.flow);
      } else {
        setErrors(json.errors ?? []);
      }
    } catch (e) {
      setNetworkError(`请求失败：${e.message}。请确认后端服务已启动。`);
    } finally {
      setSolving(false);
    }
  };

  const formulaOf = (side, i) => (side === 'left' ? left[i] : right[i]).trim();
  const coefOf = (side, i) => (side === 'left' ? coefficients.left[i] : coefficients.right[i]);

  return (
    <div className="feed-section flow-section">
      <h3>元素来源去向</h3>
      <p className="feed-intro">
        选择配平式中的一种元素：系统列出该元素在<strong>各反应物、生成物中的原子总数</strong>
        （计入系数，仅展示含该元素的物质）。勾选允许的<strong>反应物 → 生成物</strong>
        转移关系后，每条关系的转移量视为<strong>非负整数</strong>，要求每种物质的转出/转入之和
        恰好等于其原子总数；系统据此判断能否完成分配，可行时给出一组分配，并求每条允许关系
        在全部可行分配中的最小、最大原子数。
      </p>

      <div className="flow-element-row">
        <label>
          <span className="field-tag">追踪元素</span>
          <select
            className="el-select"
            value={element}
            onChange={(e) => selectElement(e.target.value)}
          >
            <option value="">请选择元素</option>
            {elements.map((el) => (
              <option key={el.symbol} value={el.symbol}>
                {el.symbol}（两侧各 {el.left} 个）
              </option>
            ))}
          </select>
        </label>
        {loadingLayout && <span className="syntax-hint">加载中…</span>}
      </div>

      {errors.length > 0 && (
        <ul className="feed-global-errors">
          {errors.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      )}
      {networkError && <div className="notice notice-error">{networkError}</div>}

      {layout && (
        <>
          <p className="flow-matrix-hint">
            仅列出含 {element} 的物质：该元素在两侧各共 <strong>{layout.total}</strong> 个。
            在行（反应物，转出）与列（生成物，转入）的交叉处勾选允许关系：
          </p>
          <table className="feed-table flow-matrix">
            <thead>
              <tr>
                <th className="flow-corner">转出 ↓ ／ 转入 →</th>
                {layout.products.map((p) => (
                  <th key={p.index}>
                    <span className="feed-coef">{coefOf('right', p.index)}</span>
                    <FormulaText formula={formulaOf('right', p.index)} />
                    <span className="flow-atoms">{p.atoms} 个</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {layout.reactants.map((r) => (
                <tr key={r.index}>
                  <th>
                    <span className="feed-coef">{coefOf('left', r.index)}</span>
                    <FormulaText formula={formulaOf('left', r.index)} />
                    <span className="flow-atoms">{r.atoms} 个</span>
                  </th>
                  {layout.products.map((p) => (
                    <td key={p.index}>
                      <input
                        type="checkbox"
                        checked={checked.has(`${r.index}-${p.index}`)}
                        onChange={() => toggle(r.index, p.index)}
                        title={`${formulaOf('left', r.index)} → ${formulaOf('right', p.index)}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="feed-action">
            <button
              type="button"
              className="analyze-btn flow-btn"
              disabled={solving}
              onClick={solve}
            >
              {solving ? '求解中…' : '求解分配'}
            </button>
            <span className="syntax-hint">
              已勾选 {checked.size} 条关系；修改勾选或更换元素会清除求解结果。
            </span>
          </div>
        </>
      )}

      {flow && flow.status === 'no-arcs' && (
        <div className="notice notice-warn obs-verdict">
          <strong>未勾选关系</strong>
          <p>{flow.message}</p>
        </div>
      )}

      {flow && flow.status === 'infeasible' && (
        <div className="notice notice-error obs-verdict">
          <strong>不可行</strong>
          <p>{flow.message}</p>
          <ul className="obs-reasons">
            {flow.leftover.map((r) => (
              <li key={`l${r.index}`}>
                <FormulaText formula={formulaOf('left', r.index)} />
                ：无论如何分配，至少有 {r.atoms} 个 {element} 原子无法转出。
              </li>
            ))}
            {flow.unmet.map((p) => (
              <li key={`p${p.index}`}>
                <FormulaText formula={formulaOf('right', p.index)} />
                ：无论如何分配，至少还缺 {p.atoms} 个 {element} 原子无法转入。
              </li>
            ))}
          </ul>
        </div>
      )}

      {flow && flow.status === 'feasible' && (
        <div className="notice notice-ok obs-verdict">
          <strong>可行</strong>
          <p>{flow.message}</p>
          <table className="feed-table">
            <thead>
              <tr>
                <th>允许关系（反应物 → 生成物）</th>
                <th>一组分配</th>
                <th>最小原子数</th>
                <th>最大原子数</th>
              </tr>
            </thead>
            <tbody>
              {flow.arcs.map((b, i) => (
                <tr key={i}>
                  <td className="el-symbol">
                    <FormulaText formula={formulaOf('left', b.reactant)} />
                    <span className="flow-arrow"> → </span>
                    <FormulaText formula={formulaOf('right', b.product)} />
                  </td>
                  <td className="num-cell">{b.witness}</td>
                  <td className="num-cell">{b.min}</td>
                  <td className="num-cell">{b.max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
