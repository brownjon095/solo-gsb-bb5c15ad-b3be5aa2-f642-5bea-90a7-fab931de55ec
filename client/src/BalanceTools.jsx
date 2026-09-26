import { useState } from 'react';
import FeedAnalysis from './FeedAnalysis.jsx';
import ObservationCheck from './ObservationCheck.jsx';
import ElementFlow from './ElementFlow.jsx';

// 投料区间状态在“投料区间分析”与“实验观测核验”之间共享：
// 观测核验沿用已填写的投料区间，不重复录入。
export default function BalanceTools({ left, right, coefficients, composition }) {
  const [ranges, setRanges] = useState(() => left.map(() => ({ lower: '', upper: '' })));

  const setRangeField = (index, field, value) =>
    setRanges((list) => list.map((r, i) => (i === index ? { ...r, [field]: value } : r)));

  return (
    <>
      <FeedAnalysis
        left={left}
        right={right}
        coefficients={coefficients}
        ranges={ranges}
        onRangesChange={setRangeField}
      />
      <ObservationCheck
        left={left}
        right={right}
        coefficients={coefficients}
        ranges={ranges}
      />
      <ElementFlow
        left={left}
        right={right}
        coefficients={coefficients}
        composition={composition}
      />
    </>
  );
}
