# OTONEI 技术栈与质量工具优化方案

> 评估目标：在尽量不扰动业务功能的前提下，降低前端工具链维护成本、提升测试可信度，并为后续 TypeScript 化和长期维护打基础。

## 实施状态（2026-08-26）

- Oxlint/Oxfmt 已替换 ESLint/Prettier，主质量脚本和 `lint-staged` 已切换到 Ox。
- Oxlint React 插件已启用；`set-state-in-effect`、`purity`、`refs` 保留现有项目例外。
- Playwright 普通/PWA E2E、关键 service 测试和渐进 TypeScript 基建已加入质量链。
- Node/pnpm 的最终支持范围仍以 `package.json`、`.node-version` 和 CI 配置为准；pnpm 只使用 `engines.pnpm` 范围，不固定单一版本，也不声明 `devEngines.packageManager`（否则 pnpm 12 会把自管理版本写进 `pnpm-lock.yaml`）。

## 1. 当前状态

OTONEI 当前主要技术栈：

- React 19
- Vite 8
- JavaScript / JSX
- Oxlint
- Oxfmt
- Vitest
- Testing Library
- Husky + lint-staged
- Firebase
- LocalForage / IndexedDB
- vite-plugin-pwa
- Cloudflare Pages / Docker 两种部署方式

当前质量链大致为：

```text
Oxfmt
  ↓
Oxlint
  ↓
TypeScript
  ↓
Vitest + coverage
  ↓
Vite Build
  ↓
pnpm audit --prod
```

GitHub Actions 通过 `verify:release` 运行：

```text
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:coverage
pnpm run build
pnpm run test:e2e
pnpm run test:e2e:pwa
pnpm audit --prod
```

目前测试数量偏少，主要集中在：

- Cloudflare API Proxy
- Data Validator
- Track Formatter
- useSearch Hook

也就是说，当前测试更偏“局部逻辑测试”，对完整用户流程覆盖不足。

---

# 2. 总体结论

## 推荐结论

### 建议做

1. ESLint → Oxlint
2. Prettier → Oxfmt
3. 保留 Vitest
4. 新增 Playwright E2E
5. 新增 Coverage 门槛
6. 逐步 JavaScript → TypeScript
7. 统一 Node / pnpm 版本来源
8. 逐步清理 CRA 时代的 `REACT_APP_*` 兼容层
9. GitHub Actions 全部锁定完整 Commit SHA

### 暂时不建议做

- 不建议换掉 Vitest
- 不建议引入 Jest
- 不建议一次性全项目 TypeScript 化
- 不建议为了“现代化”重写 Context / Firebase / PWA
- 不建议现在改成 Next.js

---

# 3. 第一优先级：迁移到 Ox

## 目标

把：

```text
ESLint + Prettier
```

替换成：

```text
Oxlint + Oxfmt
```

Vitest 不动。

这和 LabelPilot 的方向保持一致，两个 React 项目可以统一开发习惯和脚本命名。

---

## 3.1 依赖调整

删除：

```text
eslint
@eslint/js
eslint-config-prettier
eslint-plugin-react
eslint-plugin-react-hooks
globals
prettier
```

新增：

```text
oxlint
oxfmt
```

Manifest 使用主版本范围，具体解析版本由 `pnpm-lock.yaml` 锁定；不在 `package.json` 中固定单一版本：

```json
{
  "devDependencies": {
    "oxlint": "^1.80.0",
    "oxfmt": "^0.65.0"
  }
}
```

原因：

- Formatter 升级很容易产生大量无意义 diff。
- Oxlint 升级带来新规则时，也应该显式审查后再更新。

---

## 3.2 scripts 建议

```json
{
  "scripts": {
    "lint": "oxlint . --deny-warnings",
    "format": "oxfmt --write .",
    "format:check": "oxfmt --check .",
    "test": "vitest run",
    "build": "vite build"
  }
}
```

如果后续迁入 TypeScript：

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

最终质量链建议：

```text
format:check
→ lint
→ typecheck
→ test
→ build
→ e2e
```

---

## 3.3 Oxlint 配置原则

不要机械复制 ESLint 所有规则。

当前核心启用：

```text
react
typescript
unicorn
oxc
```

即使当前 OTONEI 还是 JS 项目，也可以提前保留 TypeScript plugin，方便后续渐进迁移。

重点规则建议：

```text
correctness = error

react/rules-of-hooks = error
react/exhaustive-deps = warn

react/error-boundaries = error
react/immutability = error
react/purity = warn 或 error
react/refs = warn
react/set-state-in-render = error
react/set-state-in-effect = warn
```

OTONEI 当前 ESLint 明确关闭了：

```text
react-hooks/set-state-in-effect
react-hooks/purity
react-hooks/refs
```

当前已通过严格命令行门禁运行；上述三项例外仍保持关闭，避免把迁移变成 React 重构。

迁移阶段记录：

```text
第一阶段：warn，收集差异
第二阶段：修复明确误报与等价规则
第三阶段：Oxlint/Oxfmt 纳入正式门禁
```

这样不会把 Ox 迁移变成一次大规模 React 重构。

---

# 4. 第二优先级：补 Playwright E2E

OTONEI 目前最明显的质量缺口，不是 Lint，而是没有真正覆盖完整用户流程。

## 推荐至少增加 5 条 E2E

### 场景 1：搜索流程

```text
打开首页
→ 输入关键词
→ 发起搜索
→ 返回结果
→ 正确渲染歌曲列表
```

### 场景 2：播放流程

```text
搜索
→ 点击歌曲
→ 播放器进入播放状态
→ 当前歌曲信息正确
```

### 场景 3：收藏流程

```text
搜索歌曲
→ 收藏
→ 打开收藏页
→ 收藏存在
→ 刷新页面
→ 收藏仍然存在
```

重点验证：

```text
IndexedDB / LocalForage 持久化
```

### 场景 4：无 Firebase 降级模式

```text
不配置 Firebase 环境变量
→ 应用正常启动
→ 本地收藏可用
→ 不出现致命错误
```

### 场景 5：PWA / 更新基础流程

至少验证：

```text
manifest 正常
service worker 可以注册
应用离线资源不导致白屏
```

不需要测试 Workbox 的所有内部细节。

---

# 5. 第三优先级：增加测试覆盖率门槛

目前 Vitest 有测试，但没有覆盖率门槛。

建议加入：

```text
@vitest/coverage-v8
```

推荐初始门槛不要太高。

例如：

```text
lines: 60%
functions: 60%
branches: 50%
statements: 60%
```

先保证关键逻辑覆盖。

后续可以提高到：

```text
lines: 75%
functions: 70%
branches: 65%
```

## 优先覆盖目录

```text
src/services/
src/hooks/
src/utils/
```

而不是追求 UI 组件 100%。

重点关注：

- 音源 API 结果标准化
- 播放地址获取
- 收藏同步
- Firebase 降级逻辑
- IndexedDB 数据升级
- 播放历史
- 搜索历史
- 导入导出

---

# 6. 第四优先级：渐进式 TypeScript

OTONEI 很适合 TypeScript，但不建议一次性迁完。

当前已经存在手工 JSDoc 类型，例如 Track 类型。

这说明项目已经开始承担“数据结构约束”的需求，只是还没有真正交给 TS。

## 推荐迁移顺序

### Phase 1：类型定义

```text
src/types.ts（已完成）
```

建立：

```text
Track
Artist
Album
Playlist
SearchResult
MusicSource
AudioQuality
FavoriteRecord
HistoryRecord
```

### Phase 2：纯逻辑

```text
src/utils/
src/services/
```

这些文件最适合先迁。

### Phase 3：Hooks

```text
src/hooks/
```

尤其：

```text
useSearch
usePlayer
useFavorites
useFirebaseSync
```

### Phase 4：Context

```text
src/contexts/
```

### Phase 5：Components / Pages

最后再迁：

```text
src/components/
src/pages/
App.jsx
index.jsx
```

---

## TypeScript 初始配置建议

允许 JS/TS 混用：

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": false,
    "strict": true,
    "noEmit": true
  }
}
```

这样迁移期间：

```text
.js
.jsx
.ts
.tsx
```

可以长期共存。

不需要“大爆炸式迁移”。

---

# 7. Node / pnpm 版本统一

当前项目存在多套版本口径：

```text
package.json
.node-version
GitHub Actions
README
Cloudflare 配置建议
```

容易漂移。

## 推荐

以：

```text
.node-version
```

作为 Node 单一来源。

例如：

```text
26
```

CI：

```yaml
with:
  node-version-file: '.node-version'
```

pnpm 使用范围约束：

```json
{
  "engines": {
    "pnpm": ">=12 <13"
  }
}
```

不使用顶层 `packageManager` 固定单一版本，也不声明 `devEngines.packageManager`：后者会让 pnpm 12 自管理包管理器版本，把解析结果以额外的 `---` 文档头 + `packageManagerDependencies`（含 `@pnpm/exe` 二进制）写进 `pnpm-lock.yaml`，锁文件就不再只记录本次依赖解析结果。

CI 由 `pnpm/setup` 显式安装该范围内的 pnpm；仓库未启用 `engine-strict`，`engines.pnpm` 只声明允许范围，越界版本告警但不硬失败。

目标：

```text
Node：一个来源
pnpm：一个来源
```

---

# 8. 环境变量逐步迁移为 Vite 原生

当前 OTONEI 还保留：

```text
REACT_APP_*
vite-plugin-env-compatible
process.env.*
```

属于 CRA 时代兼容模式。

不是 bug，但长期维护没有必要。

## 推荐迁移到

```text
VITE_API_BASE
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
...
```

代码统一：

```js
import.meta.env.VITE_API_BASE;
```

然后删除：

```text
vite-plugin-env-compatible
```

## 优先级

中低。

原因：

当前兼容层工作正常，不影响业务。

建议在 Ox + E2E + Coverage 完成后再做。

---

# 9. GitHub Actions 优化

当前 CI 逻辑本身合理。

建议补以下几点：

## 9.1 Action 锁完整 Commit SHA

由：

```yaml
uses: actions/checkout@v6
```

改为：

```yaml
uses: actions/checkout@<full commit sha>
```

Docker Action 同样处理：

```text
docker/setup-qemu-action
docker/setup-buildx-action
```

---

## 9.2 增加 concurrency

```yaml
concurrency:
  group: otonei-ci-${{ github.ref }}
  cancel-in-progress: true
```

PR 连续 push 时取消旧 CI。

---

## 9.3 CI 最终顺序

```text
checkout
→ setup node
→ setup pnpm
→ install --frozen-lockfile
→ format:check
→ lint
→ typecheck
→ test:coverage
→ build
→ playwright
→ audit
```

其中：

```text
typecheck
playwright
```

可以在对应阶段完成后再加入。

---

# 10. Docker Release Workflow

当前 Tag 后会构建：

```text
linux/amd64
linux/arm/v7
linux/arm64
```

这个设计可以保留。

建议改进：

1. Docker actions 锁完整 SHA
2. 使用 `docker/login-action`
3. 使用 `docker/build-push-action`
4. 开启 BuildKit Cache
5. 显式声明 `packages: write`
6. 对 Tag 格式做 `vX.Y.Z` 校验

不需要重做发布模式。

---

# 11. 最终建议实施顺序

## Phase A：工具链切换（已完成）

```text
1. ESLint → Oxlint
2. Prettier → Oxfmt
3. lint-staged 改为 Ox
4. CI 改为 Ox
5. 清理 ESLint / Prettier 依赖和配置
```

风险：低到中

收益：中

---

## Phase B：补测试可信度（已完成首轮）

```text
1. 加 @vitest/coverage-v8
2. 给关键 services / hooks 加测试
3. 加 Playwright 本地 fixture 流程
4. 覆盖搜索 / 播放 / 收藏 / 降级模式

第三方音乐 API 不作为 E2E 的真实依赖；相关流程使用固定 fixture 或网络拦截。
首轮全局门槛为 statements 60%、branches 50%、functions 60%、lines 60%。
```

风险：低  
收益：高

---

## Phase C：渐进 TypeScript（已完成当前批次）

```text
types
→ utils
→ services
→ hooks
→ contexts
→ components
```

当前批次已迁移共享类型、核心工具与服务、主要网络/搜索/播放 Hook、Device/Download/Favorites/Sync Context，以及搜索结果和播放器封面等 UI 边界。Auth/Player Context 与大型页面组件继续保留 JS，后续按依赖边界递进迁移。

风险：中  
收益：高

---

## Phase D：工具链收尾（部分完成）

```text
Node / pnpm 单一来源
REACT_APP_* → VITE_*（保留兼容窗口）
GitHub Actions SHA pin
Docker workflow 现代化
```

应用代码已统一从 `src/config/env.ts` 读取 Vite 变量，并保留旧变量回退；`vite-plugin-env-compatible` 暂不删除，待外部部署控制面完成切换后再清理。

风险：低到中  
收益：中

---

# 12. 不建议做的事情

当前不建议：

- React → Next.js
- Vitest → Jest
- Context → Redux，仅为了“正规”
- LocalForage → 其他数据库，仅为了技术统一
- Firebase → 自建后端，仅为了去依赖
- Vite → 其他 bundler
- 全量重写 TypeScript

这些目前都没有足够收益。

---

# 13. 最终目标形态

```text
React 19
Vite 8
TypeScript（渐进）
Oxlint
Oxfmt
Vitest
Testing Library
Playwright
Coverage
Husky + lint-staged

LocalForage / IndexedDB
Firebase
vite-plugin-pwa

Cloudflare Pages
Docker / GHCR
```

质量链：

```text
format
→ lint
→ typecheck
→ unit test + coverage
→ build
→ e2e
→ release
```

## 最终判断

OTONEI 值得迁 Ox。

但真正决定项目稳定性的优先事项不是 Ox 本身，而是：

```text
Playwright
+
Coverage
+
渐进式 TypeScript
```

Ox 更像是“把开发工具链整理干净”，而 E2E、Coverage 和 TypeScript 才是后续长期维护收益最大的部分。
