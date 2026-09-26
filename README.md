# 化学反应式配平网页

基于 **React + Node.js (Express)** 的化学反应式配平工具。用户在左右两侧分别输入反应物与生成物的化学式，服务端构建元素守恒矩阵，使用**精确有理数（BigInt 分数）消元**求解，仅在零空间为一维且全部系数严格为正时输出最大公约数为 1 的最简整数系数。配平成功后还可进行**投料区间分析**：在各反应物投料量的独立区间上，用精确有理数联合计算完全反应后生成物生成量、反应物剩余量的可达范围，并标出每种物质是否限量。此外可进行**实验观测核验**：沿用配平结果与投料区间，为生成物的实际生成量、反应物的实际剩余量填写可选观测闭区间，服务端用精确有理数**联合**判断是否存在同一组投料与反应进度满足全部观测（且至少一种反应物耗尽），可行时给出见证，不可行时指出观测冲突。还可进行**元素来源去向分析**：选定一种元素并勾选允许的“反应物 → 生成物”转移关系，服务端用 **BigInt 整数最大流**判断非负整数原子转移能否同时满足每种物质的转出/转入总量，可行时给出一组分配及每条关系在全部可行分配中的最小、最大原子数，不可行时给出 Hall 型冲突见证。

## 一键启动

需要安装 Docker（含 Compose 插件），无需本机安装 Node.js（依赖安装与前端构建均在镜像内自动完成）。在项目根目录执行：

```bash
docker compose up --build
```

该命令一条即可完成：前后端依赖安装（`npm ci`）→ 前端构建（`vite build`）→ 启动服务。启动后用浏览器访问：

> **http://localhost:3000** （页面与 API 同在 **3000** 端口）

- 页面地址：`http://localhost:3000`
- 配平接口：`POST http://localhost:3000/api/balance`
- 投料区间分析接口：`POST http://localhost:3000/api/feed-analysis`
- 实验观测核验接口：`POST http://localhost:3000/api/observation-check`
- 元素来源去向接口：`POST http://localhost:3000/api/element-flow`

如需修改端口，编辑 `docker-compose.yml` 中的 `"宿主端口:3000"`（容器内固定监听 `PORT=3000`）。停止服务：`Ctrl+C`；后台运行：`docker compose up --build -d`。

## 功能

- **左右两侧分别输入物质**，可动态增删条目，回车快速添加
- **可编辑示例**：点击示例标签载入，载入后可任意修改再配平
- 化学式语法：
  - 元素符号**区分大小写**（`Na`、`Cl`、`CO` 与 `Co` 均按元素表校验）
  - 下标必须为**正整数**（`H2O`、`Ca3(PO4)2`，不允许 `0` 和前导零）
  - 圆括号**最多三层**嵌套（如 `H(He(Li)2)3`）
  - **不支持**电荷（`Fe^3+`）、水合点号（`CuSO4·5H2O`）和前置系数（`2H2O`）
- **语法错误精确定位**：指出左/右侧第几个物质、第几个字符，并用 `^` 标出出错位置
- **精确求解**：RREF（行最简形）高斯消元，全程 BigInt 分数运算，无浮点误差
  - 零空间一维且系数全为严格正数：输出 gcd = 1 的最简整数系数
  - 零空间大于一维：提示**解不唯一**，不任意挑选
  - 只有零解 / 系数异号 / 出现零系数：提示**无正解**
- 结果页展示**配平式**（数字自动下标、系数 1 省略）和**每种元素在两侧的原子总数**
- **投料区间分析（仅对唯一正系数解开放）**：
  - 为每种反应物填写以 **mol** 为单位的非负十进制下限、上限（下限 ≤ 上限，最多 6 位小数），各区间相互独立
  - 生成物初始量为 0，按**完全反应**计算，反应进度 ξ = min(nᵢ/cᵢ)
  - 服务端复用化学式解析与配平结果，用**精确有理数在所有允许投料组合上联合求界**（极值在区间盒子的角点上取得，而非端点独立相减），给出反应进度区间、各生成物 cⱼξ 的最小/最大生成量、各反应物 nᵢ−cᵢξ 的最小/最大剩余量，全部以**约分分数**展示
  - 逐项标出限量情况：**均限量**（所有组合中都限量）、**部分限量**（仅部分组合限量）、**从不限量**；并列最小者**均算限量**
  - 区间错误定位到具体物质（并区分下限/上限字段）；**修改反应式立即清除投料输入与分析结果**
- **实验观测核验（仅对唯一正系数解开放，沿用上述投料区间）**：
  - 为每种生成物的**实际生成量**、每种反应物的**实际剩余量**填写可选闭区间（mol，非负十进制，最多 6 位小数；上下限必须同时填写，**留空表示未观测**）
  - 服务端用精确有理数**联合**判断是否存在**同一组**初始投料 nᵢ（在投料区间内）与**同一个**反应进度 ξ ≥ 0，使生成量 = cⱼξ、剩余量 = nᵢ−cᵢξ，且**至少一种反应物恰好耗尽**；不会逐项独立比对观测范围
  - 固定某个限量反应物后，所有观测约束都化为 ξ 的一维闭区间交（生成物 ξ ∈ [aⱼ/cⱼ, bⱼ/cⱼ]；反应物由 nᵢ = cᵢξ + rᵢ ∈ [Lᵢ,Uᵢ] 给出界），逐个候选检查
  - 返回**可行**（`feasible`）并附一组见证（ξ、各 nᵢ 投料、各剩余量、各生成量）；**不可行**（`infeasible`）时区分共同约束矛盾（`joint`）与没有任何物质能耗尽（`exhaustion`），并给出带物质名称的冲突说明；一项观测都没填时返回 `no-observation` 提示补填
  - 结论以约分分数展示；修改投料或观测输入会立即清除上一次核验结果
- **元素来源去向（仅对唯一正系数解开放）**：
  - 在配平结果中**选择一种元素**，页面仅列出含该元素的反应物与生成物，并展示其该元素原子总数（配平系数 × 单分子原子数，两侧守恒）
  - 在矩阵中勾选允许的**反应物 → 生成物**转移关系（可表头一键全选/全不选）；每条关系上的转移量为**非负整数**，要求每种反应物转出之和、每种生成物转入之和都等于其原子总数
  - 服务端把它建模为二分图整数运输（b-匹配）问题，用 **BigInt Dinic 最大流**判定：`feasible` 时给出一组整数分配，并基于见证流在残量网络上的环流可达性，求出每条允许关系在**全部可行分配**中的最小、最大原子数；`infeasible` 时由残量割给出 **Hall 型见证**（哪些生成物的需求超过其允许供货反应物的供应之和）并明确提示；一条关系都没勾时返回 `no-edges`
  - **改变所选元素或勾选关系立即清除上一次结果**；反应式改变（含增删物质、载入示例）后整体重挂载，元素选择与结果一并重置

## 本地开发（可选）

需要 Node.js 18+。

```bash
# 终端 1：后端（http://localhost:3000）
cd server && npm install && npm start

# 终端 2：前端开发服务器（http://localhost:5173，/api 自动代理到 3000）
cd client && npm install && npm run dev
```

后端单元测试：

```bash
cd server && npm test
```

## 项目结构

```
├── Dockerfile            # 多阶段构建：前端构建 + 后端依赖 + 运行镜像
├── docker-compose.yml    # 单服务，映射 3000 端口
├── server/
│   ├── index.js          # Express 入口：/api/balance、/api/feed-analysis、/api/observation-check、/api/element-flow、静态托管
│   └── chem/
│       ├── fraction.js      # 精确有理数（BigInt）
│       ├── parse.js         # 化学式递归下降解析器（含错误定位）
│       ├── balance.js       # 元素守恒矩阵 + RREF 消元 + 零空间判定（附各物质元素组成）
│       ├── feed.js          # 投料区间分析：联合求界与限量判定（有理数）
│       ├── observe.js       # 实验观测核验：同一组投料/进度的区间交联合判定
│       └── elementflow.js   # 元素来源去向：BigInt Dinic 最大流可行判定、分配与逐边上下界
└── client/
    └── src/
        ├── App.jsx               # 输入面板、示例、结果展示
        ├── BalanceTools.jsx      # 配平结果区：共享投料区间，串联三个分析模块
        ├── FeedAnalysis.jsx      # 投料区间输入、分析结果与限量标注
        ├── ObservationCheck.jsx  # 实验观测输入、核验结论与见证展示
        ├── ElementFlow.jsx       # 元素选择、转移关系勾选矩阵、分配与上下界
        ├── FracText.jsx          # 约分分数竖排渲染
        ├── FormulaText.jsx       # 化学式数字下标渲染
        └── styles.css
```

## API

### `POST /api/balance`

```json
{
  "left": ["H2", "O2"],
  "right": ["H2O"]
}
```

成功响应：

```json
{
  "ok": true,
  "result": {
    "status": "balanced",
    "coefficients": { "left": [2, 1], "right": [2] },
    "elements": [
      { "symbol": "H", "left": 4, "right": 4 },
      { "symbol": "O", "left": 2, "right": 2 }
    ],
    "composition": {
      "left": [{ "H": 2 }, { "O": 2 }],
      "right": [{ "H": 2, "O": 1 }]
    }
  }
}
```

`composition` 为每种物质单分子中各元素的原子数（供来源去向等模块按元素筛选物质）。语法错误时 `ok` 为 `false`，`errors` 中每项含 `side`、`index`、`position`（1 基字符位置）、`message`、`formula`；无解时 `result.status` 为 `no-positive-solution`，解不唯一时为 `not-unique`（并给出 `nullity`）。

### `POST /api/feed-analysis`

请求体在 `balance` 的基础上增加 `ranges`，与反应物（`left`）等长、按 mol 给出非负十进制区间（最多 6 位小数）：

```json
{
  "left": ["H2", "O2"],
  "right": ["H2O"],
  "ranges": [
    { "lower": "2.5", "upper": "3" },
    { "lower": "2", "upper": "2" }
  ]
}
```

成功响应（分数均已约分，单位 mol）：

```json
{
  "ok": true,
  "result": {
    "status": "balanced",
    "coefficients": { "left": [2, 1], "right": [2] },
    "analysis": {
      "xi": { "min": { "num": "5", "den": "4" }, "max": { "num": "3", "den": "2" } },
      "reactants": [
        { "coefficient": "2", "remaining": { "min": { "num": "0", "den": "1" }, "max": { "num": "0", "den": "1" } }, "limiting": "always" },
        { "coefficient": "1", "remaining": { "min": { "num": "1", "den": "2" }, "max": { "num": "3", "den": "4" } }, "limiting": "never" }
      ],
      "products": [
        { "coefficient": "2", "produced": { "min": { "num": "5", "den": "2" }, "max": { "num": "3", "den": "1" } } }
      ]
    }
  }
}
```

`limiting` 取值：`always`（均限量）、`partial`（仅部分组合限量）、`never`（从不限量）。

区间错误时 `ok` 为 `false`，错误定位到物质（与字段）：每项含 `side`（恒为 `left`）、`index`（反应物下标，整体错误为 `-1`）、`field`（`lower` / `upper` / `null`）、`message`。化学式语法错误的字段格式与 `/api/balance` 一致；配平不唯一或无正解时也返回 `ok:false`，说明该分析不开放。

### `POST /api/observation-check`

请求体在 `feed-analysis` 的基础上增加 `remaining`（与反应物等长）和 `produced`（与生成物等长），每项为 `{ lower, upper }`，均为 mol 单位的非负十进制数（最多 6 位小数）；**上下限同时留空 `""` 表示该项未观测**，只填一项会返回校验错误。

```json
{
  "left": ["H2", "O2"],
  "right": ["H2O"],
  "ranges": [
    { "lower": "2", "upper": "4" },
    { "lower": "2", "upper": "5" }
  ],
  "remaining": [
    { "lower": "", "upper": "" },
    { "lower": "3", "upper": "4" }
  ],
  "produced": [
    { "lower": "3", "upper": "4" }
  ]
}
```

HTTP 层 `ok` 恒为 `true`（语法/区间校验失败时仍为 `ok:false`，错误项增加 `section`：`feed` / `remaining` / `produced`），业务结论在 `result.check.status`：

- **可行**（`feasible`）：存在同一组投料与 ξ 满足全部观测且至少一种反应物耗尽；`limitingIndex` 为见证中耗尽的反应物下标，`witness` 给出 ξ、`feeds`（各反应物投料 nᵢ）、`remaining`（各反应物剩余 nᵢ−cᵢξ）、`produced`（各生成物生成 cⱼξ），均为约分分数（单位 mol）：

```json
{
  "ok": true,
  "result": {
    "status": "balanced",
    "coefficients": { "left": [2, 1], "right": [2] },
    "check": {
      "status": "feasible",
      "limitingIndex": 0,
      "message": "观测可行：存在同一组投料与反应进度满足全部观测，且 H2 完全耗尽。下面给出一组见证（单位 mol）。",
      "witness": {
        "xi": { "num": "3", "den": "2" },
        "feeds": [{ "num": "3", "den": "1" }, { "num": "9", "den": "2" }],
        "remaining": [{ "num": "0", "den": "1" }, { "num": "3", "den": "1" }],
        "produced": [{ "num": "3", "den": "1" }]
      }
    }
  }
}
```

- **不可行**（`infeasible`）：`stage` 为 `joint`（各项观测对 ξ 的共同闭区间已为空，观测互相冲突）或 `exhaustion`（共同区间非空，但每种反应物若耗尽都与观测矛盾）；`reasons` 给出带结构与中文说明的冲突原因。
- **补填提示**（`no-observation`）：所有观测项均留空时返回，`message` 提示至少补填一项观测。

> 核验是对**同一组** (nᵢ, ξ) 的联合可满足性判定（区间交），不是把各观测与可达范围逐项独立比对；例如生成物观测与剩余量观测可能各自落在可达范围内，却只能由不同的 ξ 实现，此时仍判为冲突。

### `POST /api/element-flow`

在唯一正系数配平结果上分析某元素的来源去向。请求体在 `balance` 的基础上增加 `element`（元素符号）与 `edges`（允许的转移关系，下标均为**原始** `left` / `right` 数组下标，且只能指向含该元素的物质，不可重复）：

```json
{
  "left": ["Fe2O3", "CO"],
  "right": ["Fe", "CO2"],
  "element": "O",
  "edges": [
    { "left": 0, "right": 1 },
    { "left": 1, "right": 1 }
  ]
}
```

HTTP 层 `ok` 恒为 `true`（化学式/元素/下标校验失败时为 `ok:false`），业务结论在 `result.flow.status`。响应中 `result.substances` **仅含所选元素的物质**，每项给出原始下标、化学式、配平系数、单分子原子数与计入系数后的原子总数（均为十进制字符串，BigInt 精确）：

- **可行**（`feasible`）：存在非负整数转移量满足每种物质转出/转入之和等于其原子总数；`total` 为该元素守恒原子总数，`allocations` 与请求 `edges` 语义对齐（回原始下标），每项含一组可行分配 `amount` 及该关系在**全部可行分配**中的 `min` / `max`：

```json
{
  "ok": true,
  "result": {
    "status": "balanced",
    "coefficients": { "left": [1, 3], "right": [2, 3] },
    "element": "O",
    "substances": {
      "left": [
        { "index": 0, "formula": "Fe2O3", "coefficient": "1", "perMolecule": "3", "atoms": "3" },
        { "index": 1, "formula": "CO", "coefficient": "3", "perMolecule": "1", "atoms": "3" }
      ],
      "right": [
        { "index": 1, "formula": "CO2", "coefficient": "3", "perMolecule": "2", "atoms": "6" }
      ]
    },
    "flow": {
      "status": "feasible",
      "total": "6",
      "message": "可以完成分配……",
      "allocations": [
        { "left": 0, "right": 1, "amount": "3", "min": "3", "max": "3" },
        { "left": 1, "right": 1, "amount": "3", "min": "3", "max": "3" }
      ]
    }
  }
}
```

- **不可行**（`infeasible`）：勾选关系不足以完成分配；`hall` 给出 Hall 型见证——`products`（需求无法被满足的生成物下标集合）、`reactants`（允许向其供货的反应物下标集合）、`demand` / `supply`（两者原子总数，必有 supply < demand），`message` 为带物质名称的中文说明。
- **补勾提示**（`no-edges`）：`edges` 缺省或为空数组时返回，提示先勾选允许的转移关系；此时同样返回 `substances` 供前端渲染矩阵。

> 判定本质是二分图整数运输（b-匹配）问题：源→反应物容量为供应原子数、允许关系容量无穷、生成物→汇容量为需求原子数，最大流等于总原子数即可行；整容量保证整数见证。逐边最小/最大值由见证流在残量网络上删去该边后的环流最大流得到（`min = f⁰ − maxflow(i→j)`，`max = f⁰ + maxflow(j→i)`），全程 BigInt 无浮点误差。
