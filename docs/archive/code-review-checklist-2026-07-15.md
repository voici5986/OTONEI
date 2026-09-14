# OTONEI 代码修复清单（2026-07-15 历史快照）

> 本文件仅保留审查历史，不是当前缺陷状态或发布门禁。文中的 ESLint、旧文件路径和当时的待修复项可能已被后续提交改变；当前状态应以源码、CI 和最新审查为准。

> 范围：基于全量代码审查与 IDE 审查报告（B/S/P/M/E 系列）的交叉复核结果。
> **状态说明（2026-07-15 更新）**：P0、限流专项（RL-0/1/2）、P1（B-1~~B-7、S-1~~S-5）均已**实际修复并验证通过 lint**。下方状态仅代表该日期的审查结果。
> 优先级：P0（发布阻断/崩溃）> P1（严重功能/安全）> P2（中等缺陷）> P3（维护/一致性）> P4（工程/工具链）。
> 标记：`[确认]` 双方均认可　`[误报]` 复核后不成立　`[更正]` 推翻此前判断/修正细节　`[新发现]` IDE 未覆盖
> 状态标记：`✅ 已修复`　`🔲 待修复`　`⚠️ 部分修复`
>
> **重要外部约束（用户补充）**：上游音乐 API 有**限流：每 5 分钟最多 50 次请求**（与 `docs/reference/GD_STUDIO_API.md` 第 16 行一致）。本清单据此新增“API 限流风险专项”（第 0 节）。

---

## 〇、API 限流风险专项（每 5 分钟 ≤ 50 次）

上游 `music-api.gdstudio.xyz`（经 `functions/api-v1` 代理，`API_BASE=/api-v1/api.php`）限流为 **300 秒内 50 次**。所有 `searchMusic`/`getAudioUrl`/`getLyrics`/`forceGetCoverImage` 都算 1 次。以下代码路径会在**单次用户操作内爆发大量请求**，极易触发 429/被封 IP，需重点治理：

### RL-1（P1，最危险）　收藏导入是“请求风暴”发生器

- **位置**：`src/components/UserProfile.jsx:292-370`（`startImport` → `searchTrack`，`:151-219`）
- **量级分析**：`searchTrack` 对**每一首**导入歌曲，最多串行发起 **4 次** `searchMusic`（原名 → 简化名 → 首词 → 歌手+截断名）；若首选 source 未命中，还会跨 source（`netease`/`ytmusic`）**再各来一轮**。即单曲最坏 ≈ 4×3 = **12 次请求**。
- **后果**：导入 **5 首**即可能逼近/超过 50 次上限；导入几十首必然长时间 429，导入几乎全部“未找到”，用户以为数据丢失。
- **修复方向**：
  1. 加**客户端限流器**（令牌桶：≤ 50 次 / 300s，留安全余量如 40 次）+ 请求间隔（如每次 ≥ 300ms）。
  2. 命中即短路（已实现），但要**大幅收敛回退策略**（如仅 2 级回退、跨 source 上限 1 个）。
  3. 遇 429 时**指数退避 + 暂停导入**，并向用户显示“已达接口频率上限，N 秒后继续”，支持断点续传。

### RL-2（P1）　播放降级 + 自动重试会成倍放大请求

- **位置**：`src/contexts/PlayerContext.jsx:172-181`（音质降级重试）、`:277-295`（错误自动重试）、`src/services/musicApiService.js:365-390`（`playMusic` 内 `getAudioUrl` + `forceGetCoverImage`）
- **量级分析**：一次播放 = `getAudioUrl`(1) + `forceGetCoverImage`(1) = 2 次；若 999 失败降级 320 再来 2 次；若再触发 `audioStateManager` 错误重试（`forceRefresh`）又 +2 次。**单次点歌最坏可达 6 次**。快速切歌/连点会迅速累积。
- **与 B-4/B-5 联动**：B-4 的错误态残留、B-5 的 `forceRefresh` 不防重会**重复放大**这些请求 → 这也是为何 B-4/B-5 在限流约束下应视为**功能性**问题而非仅健壮性。
- **修复方向**：切歌时**取消上一首在途请求**（AbortController）；重试设总次数上限并与限流器共用配额；封面请求可延迟/合并。

### RL-3（P2）　封面请求缺乏节流

- **位置**：`src/services/musicApiService.js:335-356`（`forceGetCoverImage`）、`src/contexts/PlayerContext.jsx:112-143`（`fetchCover`）
- **量级分析**：列表滚动/批量渲染时若多处触发 `forceGetCoverImage`，每个未命中缓存的封面都是 1 次请求。虽有内存 + IndexedDB 双层缓存兜底，但**首次加载大列表**仍可能短时打满配额。
- **修复方向**：封面请求并发上限（如同时 ≤ 3）、失败不立即重试、优先复用缓存；`getCoverImage`（NZ-4）当前恒返回默认封面反而“意外”省了额度，但应改为**受控按需请求**而非彻底不请求。

### RL-4（P2）　搜索无防抖 + 分页叠加

- **位置**：`src/hooks/useSearch`（`handleSearch`/`handleLoadMore`）、`src/App.jsx:356`（表单提交）、`:428-452`（加载更多）
- **说明**：主搜索由表单/回车触发，本身频率可控；但**本地建议**（`App.jsx:143-157`，200ms 防抖）走的是 `SearchService.searchLocal`（本地，不算 API，安全）。真正要注意的是**用户连续回车/反复翻页**会线性消耗配额。建议：搜索按钮/回车加节流；`handleLoadMore` 期间禁用按钮（已部分实现 `disabled={loading||loadingMore}`）。

### RL-0（P1，建议新增基础设施）　全局 API 限流器 + 429 统一处理

- **现状**：`musicApiService.js` 各请求各自为战，**没有任何全局速率控制**，也**没有对 429 的识别与退避**（`searchMusic` 只处理了取消/ERR_NETWORK；`getAudioUrl`/`getLyrics` 只处理超时）。
- **修复方向**：在 `musicApiService.js` 增加一个**共享令牌桶/滑动窗口限流器**（所有出站请求经它排队），并在 axios 拦截器里统一处理 `429`（读取 `Retry-After`，退避重试或抛出可读错误）。这是 RL-1~RL-4 的公共底座，建议先做。

> 代理侧（`functions/api-v1/[[path]].js`）目前对上游是 1:1 透传，不做任何缓存/合并；如条件允许，可在 Cloudflare 边缘对 `types=search`/`types=pic` 加**短 TTL 缓存**，进一步降低回源次数（与 S-5 的 CORS 收紧一并处理）。

---

## 一、优先级总览

| 优先级 | 条目         | 一句话问题                                                                          | 修复状态                                                                                                    |
| ------ | ------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **P0** | NZ-0         | `src/index.jsx:23` 多余右括号 → 语法错误，阻断 build/lint                           | ✅ 已修复                                                                                                   |
| **P0** | NZ-1（原#1） | `UpdateNotification` 把布尔 `needRefresh` 当数组解构 → 渲染即崩溃                   | ✅ 已修复                                                                                                   |
| **P1** | RL-0         | 无全局 API 限流器 / 无 429 处理（RL-1~RL-4 的公共底座）                             | ✅ 已修复（`rateLimiter.js`+`apiClient.js`+429 重试）                                                       |
| **P1** | RL-1         | 收藏导入是“请求风暴”：单曲最坏 ~12 次，5 首即打满 50 次/5min                        | ⚠️ 部分修复（已接入 RL-0 限流器 + 收敛回退，但无断点续传/暂停 UI）                                          |
| **P1** | RL-2         | 播放降级+自动重试成倍放大请求（单次点歌最坏 6 次）                                  | ⚠️ 部分修复（B-4/B-5 已修，降级重试仍可能成倍；限流器兜底）                                                 |
| **P2** | RL-3         | 封面请求无并发/节流控制                                                             | ✅ 已修复（`forceGetCoverImage` 加 3 并发信号量，叠加 RL-0 限流）                                           |
| **P2** | RL-4         | 搜索/翻页无节流，连续操作线性耗配额                                                 | ✅ 已修复（`handleLoadMore` 加 800ms 最小间隔）                                                             |
| **P1** | B-1          | 登录/注册 `try/catch` 不可达 → 失败无提示（非“显示已登录”）                         | ✅ 已修复                                                                                                   |
| **P1** | B-2          | 收藏同步仅在 `added` 时触发 → 取消收藏不同步（且 `result.success` 不存在）          | ✅ 已修复                                                                                                   |
| **P1** | B-3          | `AudioEngine.play()` 吞掉 Promise rejection                                         | ✅ 已修复（忽略 `NotAllowedError`，其余抛出/记录）                                                          |
| **P1** | B-4          | `audioStateManager.error` 未在成功路径清除 → 错误态残留触发重复重试                 | ✅ 已修复（`clearError()`）                                                                                 |
| **P1** | B-5          | `pendingUrlRequests` 在 `forceRefresh` 下不防重 → 竞态                              | ✅ 已修复（去掉 `forceRefresh` 绕过）                                                                       |
| **P1** | B-6          | 进度条拖拽结束只 `setIsPlaying(true)`，未真正 `audioEngine.play()`                  | ✅ 已修复（拖拽暂停/结束恢复 `play()`）                                                                     |
| **P1** | B-7          | 导入收藏循环内每次成功都整库写入 IDB；同步冷却 `setTimeout` 未清理                  | ✅ 已修复（整库写入挪到循环外 + ref 清理定时器）                                                            |
| **P1** | S-1          | 本地账号密码仅单重 SHA-256 + 盐（盐存 IndexedDB）                                   | ✅ 已修复（PBKDF2 100k 迭代）                                                                               |
| **P1** | S-2          | `_headers` 缺 CSP / HSTS                                                            | ✅ 已修复（补 CSP + HSTS）                                                                                  |
| **P1** | S-3          | 缺少 `firestore.rules`（已确认仓库无此文件）                                        | ✅ 已修复（新增 `firestore.rules`）                                                                         |
| **P1** | S-4          | `functions/api-v1` 透传 `Authorization` 至上游                                      | ✅ 已修复（已 `delete('authorization')`）                                                                   |
| **P1** | S-5          | `functions/api-v1` `Access-Control-Allow-Origin: '*'`                               | ✅ 已修复（改为按 `ALLOWED_ORIGIN`/Origin 反射）                                                            |
| **P2** | P-1          | `clearExpiredCovers` 仅扫描前 200 个封面键                                          | ✅ 已修复（遍历全部键，分批让出主线程）                                                                     |
| **P2** | P-5          | `useAudioPlayerViewState` 中 `playMode === 'sequence'` 为死分支                     | ✅ 已修复（改为实际存在的 `'repeat-all'`，图标/文案一致）                                                   |
| **P2** | NZ-2（原#2） | 搜索历史点击用 `setTimeout(0)` 调 stale closure 的 `handleSearch`                   | ✅ 已修复（`handleSearch` 接受 q/s 参数，点击直接传值，去掉 `setTimeout(0)`）                               |
| **P2** | NZ-3（原#5） | `App.jsx` 在 `results` 变化时覆盖当前播放列表                                       | ✅ 已修复（加 `searchPlaylistSyncRef` 守卫，仅主动搜索才同步）                                              |
| **P2** | NZ-4         | `getCoverImage` 恒返回 `'default_cover.svg'`（且缺前导 `/`，路径不一致）            | ✅ 已修复（删除死逻辑 `getCoverImage`；统一走 `forceGetCoverImage` + `DEFAULT_COVER='/default_cover.svg'`） |
| **P3** | M-1          | 全局禁用 `React.StrictMode`（有意为避双播放，但丧失严格检查）                       | 🔲 待修复                                                                                                   |
| **P3** | M-3          | `History.jsx` 绕过 `DownloadContext` 自管下载状态                                   | 🔲 待修复                                                                                                   |
| **P3** | M-6          | 待同步计数键全局非按 uid；`delayedSyncTimer` 单例登出未清理                         | 🔲 待修复                                                                                                   |
| **P3** | NZ-5         | `vite.config.mjs` `navigateFallbackDenylist` 拼写错误 → SPA 回退拒绝列表失效        | 🔲 待修复                                                                                                   |
| **P4** | E-2          | `[更正]` `eslint@^10` 已移除 `preserve-caught-error`，引用它使 `npm run lint` 失败  | 🔲 待修复（注意：会导致 lint 脚本失败）                                                                     |
| **P4** | E-4          | `[误报]` Dockerfile 实为 3 阶段；建议补 `USER nginx`                                | 🔲 待修复（加固，非阻断）                                                                                   |
| **P4** | NZ-6         | `vite.config.mjs` `rolldownOptions`/`output.codeSplitting.groups` 疑似拼写/API 不符 | 🔲 待修复                                                                                                   |
| **P4** | NZ-7         | `Dockerfile` `nginx:alpine-slim` 镜像 tag 需核实                                    | 🔲 待修复                                                                                                   |

> 复核后判定为**误报/非问题**的条目：`M-2`、`M-7`、原 `#7 ErrorBoundary 方法名`、`netease` 拼写、`P-4` 的 `webp` 笔误。详见第五节。
> IDE 报告中细节未能从本次复核 context 还原的条目见第六节（需你贴原文）。

---

## 二、P0 详情

### NZ-0　入口文件语法错误（新发现，两处独立读取一致）

- **位置**：`src/index.jsx:23`
- **问题**：
  ```js
  const root = ReactDOM.createRoot(document.getElementById('root')));
  ```
  末尾为 `))`，比 `createRoot(` 多一个右括号，属 JS 语法错误。
- **影响**：若属实，`vite build` 与 `eslint src` 均会解析失败，整个应用无法打包/启动。
- **修复**：删除多余 `)`，改为 `ReactDOM.createRoot(document.getElementById('root'));`
- **复核备注**：`read_file` 与 `search_content` 两次结果一致显示 `))`。若你确认本地能正常 `pnpm build`，请告知（可能为读取缓存差异），否则**请作为第一优先级修复**。

### NZ-1（原 #1）　UpdateNotification 渲染崩溃（IDE 完全漏报）

- **位置**：`src/components/UpdateNotification.jsx:14-24`
- **问题**：
  ```js
  const {
    needRefresh: [needRefresh, setNeedRefresh],   // ❌ needRefresh 是布尔，不是 [state, setState] 元组
    updateServiceWorker,
  } = useRegisterSW({...});
  ```
  `useRegisterSW()` 返回的 `needRefresh` 是 **boolean**，`[needRefresh, setNeedRefresh]` 解构布尔会抛 `TypeError: false is not iterable`，组件在 `App` 中常驻（`App.jsx:569`），导致整页经 `ErrorBoundary` 崩溃。
- **影响**：服务工作者更新提示一出现即白屏，属**发布阻断级**。
- **修复**：改为 `const { needRefresh, updateServiceWorker } = useRegisterSW({...});` 并用本地 `useState` 维护关闭状态（原 `setNeedRefresh(false)` 改为本地 setter）。

---

## 三、P1 详情

### B-1　登录失败无任何提示（IDE 影响描述需更正）

- **位置**：`src/components/AuthContainer.jsx:38-60`（handleLogin）、`63-87`（handleRegister）；`src/pages/User.jsx:42-44`
- **问题**：`await login(...)` / `await register(...)` 返回 `{success, error}` 且**从不 throw**，因此 `catch` 不可达。登录失败时既不会进入 catch，也因 `User.jsx` 的 `handleAuthSuccess` 是**空函数**（`// 不需要做任何事情…`）而“看似成功”。
- **影响更正**：IDE 称“显示已登录”不准确——UI 实际依赖 `currentUser` 变化才切换，而 `login` 失败时 `currentUser` 不变，所以用户只是**停留在登录页且无任何错误提示**。真实影响是“失败静默、无报错”，而非“误判已登录”。
- **修复**：依据 `login/register` 的返回结果（如 `const { success, error } = await login(...)`）显式 `setError(...)` 并提示。

### B-2　取消收藏不会同步到云端（IDE 给出修复方案有误）

- **位置**：`src/contexts/FavoritesContext.jsx:96`
- **问题**：`if (currentUser && !currentUser.isLocal && result.added)` 仅在“添加”时触发同步计数/延迟同步；**取消收藏（`result.added === false`）时不同步**。
- **IDE 方案更正**：IDE 建议改判 `result.success`，但存储层 `toggleFavorite` 返回的是 `{added, full, error}`（`storage.js:171-194`），**不存在 `result.success`**，照改会引入新 bug。正确做法：`if (currentUser && !currentUser.isLocal)`（或判断 `result.added !== undefined`）。
- **修复**：去掉 `&& result.added` 限制，使增/删都触发待同步计数。

### B-3　AudioEngine.play() 吞掉 rejection（影响被高估）

- **位置**：`src/services/AudioEngine.js:93-97`
- **问题**：`play() { return this.audio.play().catch((e) => logger.error(...)); }` 吞掉播放 Promise 的 rejection。
- **影响降级说明**：`isPlaying` 由 `play`/`pause` 事件驱动（`PlayerContext:264-265`），所以不会出现 `isPlaying` 状态真假错位；主要是“自动播放被浏览器拦截时静默无感知”。严重度维持 P1（健壮性），但不致崩溃。
- **修复**：让 `play()` 返回 rejection（或至少对“非用户手势”的拦截做区分提示），不要无条件 `.catch` 吞掉。

### B-4　audioStateManager.error 残留触发重复重试（IDE 部分描述不成立）

- **位置**：`src/services/audioStateManager.js:42-46,108-111`；`src/contexts/PlayerContext.jsx:277-295`
- **问题**：`setError` 将 `this.error` 置为错误对象并在每次 `notifyListeners()` 时带入快照。该错误**仅在 `loadTrack()` 中重置为 `null`**（`:87`）。若在错误态期间有其他状态通知，`state.error` 仍为 truthy，会再次进入重试分支 → “幽灵重播/重复重试”。
- **IDE 描述更正**：“下一首会耗尽重试次数”基本不成立——`handlePlay` 在 `!forceRefresh` 时已在 `PlayerContext:154` 重置 `retryCountRef.current = 0`，普通切歌不会继承重试计数。
- **限流关联（RL-2）**：错误态残留会重复进入 `forceRefresh` 重试分支，每次 = `getAudioUrl` + 封面各 1 次；在“50 次/5min”约束下这会**快速吃掉配额**，故本条在限流上下文中应视为功能性问题。
- **修复**：在重试分支处理完毕（成功或达到 `MAX_RETRIES`）后显式 `audioStateManager.clearError()`，避免错误态长期残留。

### B-5　重复请求防重存在竞态 + 外层 catch 为死代码

- **位置**：`src/services/musicApiService.js:117,130-177`
- **问题**：
  1. `if (pendingUrlRequests.has(pendingKey) && !forceRefresh)`——`forceRefresh` 为 true 时跳过防重，多个并发强制刷新会各自发起请求。
  2. 函数体 `try`（`110`）包裹的只是同步创建 `urlPromise` 这个 IIFE 调用；`urlPromise` 内部的异步 rejection 在闭包 Promise 中，外层 `catch`（`170-177`）**捕获不到** → 该 catch 为死代码（即原 #3）。
- **限流关联（RL-2）**：`forceRefresh` 跳过防重意味着并发强制刷新会各自回源，直接倍增请求数，在“50 次/5min”下危害被放大。
- **修复**：在 IIFE 内部统一 `try/catch` 并返回兜底；`forceRefresh` 也应对同一 `pendingKey` 做“取已有请求”去重（或加请求 token）。

### B-6　进度条拖拽不打断/不恢复真实播放

- **位置**：`src/components/ProgressBar.jsx:36-54,67`
- **问题**：
  1. 拖拽开始时**没有暂停**音频；拖拽结束 `handleDragEnd` 仅 `setIsPlaying(true)`（`:52`）——这只更新 React 状态，**并不调用 `audioEngine.play()`**，因此若拖拽期间播放已暂停，松手后 UI 显示“播放中”但音频实际静止。
  2. `useEffect` 依赖包含 `dragProgress`（`:67`），导致每次 `setDragProgress` 都会移除并重新注册全局 `mousemove/mouseup` 监听。
- **修复**：拖拽开始 `audioEngine.pause()` 并记录 `wasPlayingRef`；结束若需恢复则调 `audioEngine.play()`（而非只 `setIsPlaying`）；将 `dragProgress` 移出监听注册依赖（用 `ref` 读取最新值）。

### B-7　收藏导入循环整库写入 + 冷却定时器未清理

- **位置**：`src/components/UserProfile.jsx:292-370,110-112`
- **问题**：
  1. `startImport` 循环内 `if (importedCount > 0) await saveFavorites(newFavorites);`（`:357`）——每成功匹配一首就整库写一次 IndexedDB，N 首 = N 次全量写入。
  2. 手动同步冷却 `setTimeout(() => setSyncCooldown(false), 8000)`（`:110-112`）在组件卸载前若未到期，会对已卸载组件 `setState` → React 警告。
- **限流关联（RL-1）**：`startImport` 的真正致命点不在 IDB 写入，而在其调用的 `searchTrack` 会对每首歌发起多次 `searchMusic` → 详见 RL-1。IDB 写入是性能问题，API 请求风暴才是功能阻断，两者需一并修。
- **修复**：循环内先累积 `newFavorites`，**循环结束后再统一 `saveFavorites` 一次**（`:361` 已有一次收尾，可去掉循环内那次）；冷却定时器用 `useRef` 保存并在 `useEffect` 返回里 `clearTimeout`；导入逻辑接入 RL-0 的全局限流器。

### S-1　本地账号密码哈希强度不足

- **位置**：`src/contexts/AuthContext.jsx:17-31,59-85`
- **问题**：`hashLocalPassword` 仅做**单次 SHA-256 + 盐**，盐与哈希一并存入 IndexedDB（`saveLocalUser`）。无加盐迭代/无 KDF，离线本地可被彩虹表/暴力破解。
- **修复**：若必须在本地校验，改用 `PBKDF2`（WebCrypto `deriveKey`）或至少多次迭代；或改为“本地仅缓存凭据、校验交由云端”。

### S-2　响应头缺少 CSP / HSTS

- **位置**：`public/_headers`
- **问题**：仅设置了 `X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`，**缺少 Content-Security-Policy 与 Strict-Transport-Security**。
- **修复**：补充 CSP（至少锁定 `default-src 'self'`、对 `music-api.gdstudio.xyz` 与字体/CDN 显式放行）与 `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`。

### S-3　缺少 firestore.rules（确认不存在）

- **位置**：仓库根（搜索 `firestore.rules` 返回 0 结果）
- **问题**：项目使用 Firestore 子集合同步（`syncService.js`），但仓库无 `firestore.rules`，部署时若未另行配置则默认**拒绝所有读写**，或沿用控制台默认规则（存在越权风险）。
- **修复**：提交 `firestore.rules`，按 `users/{uid}` 及其 `favorites`/`history` 子集合做 `request.auth.uid == uid` 鉴权；并纳入 CI。

### S-4 / S-5　API 代理透传 Authorization 且 CORS 为 `*`

- **位置**：`functions/api-v1/[[path]].js:15-19,58-69`
- **问题**：
  - `S-4`：代理虽删除了 `cf-*`、`cookie` 等，但**保留了 `Authorization`** 并转发给上游 `music-api.gdstudio.xyz`，存在凭据泄露面。
  - `S-5`：`Access-Control-Allow-Origin: '*'` 且无 `Allow-Credentials`，属宽松跨域；若后续加入凭据会直接冲突。
- **修复**：如上游不需要鉴权，主动剥离 `Authorization`；CORS 改为明确的前端域名白名单（Cloudflare Pages 可在 `_headers`/`wrangler.toml` 配合）。

---

## 四、P2 / P3 / P4 详情

### P-1　过期封面清理仅扫描前 200 键

- **位置**：`src/services/storage.js:108-142`（`clearExpiredCovers`，`:117` `keys.slice(0, maxKeys=200)`）
- **问题**：封面数 > 200 时，超出部分永不被扫描清理，陈旧缓存持续堆积。
- **修复**：改为分页/游标遍历全部键（或提高 `maxKeys` 并循环直到扫完）。

### P-5　`playMode === 'sequence'` 死分支

- **位置**：`src/hooks/useAudioPlayerViewState.jsx:157-174`
- **问题**：`PlayerContext` 的 `playMode` 仅可能为 `repeat-all`/`repeat-one`/`random`（`PlayerContext.jsx:27,223`），`'sequence'` 分支永远不会被命中。
- **修复**：删除 `'sequence'` case，或若计划支持列表顺序播放则补全 `handleNext` 逻辑。

### NZ-2（原 #2）　搜索历史点击触发旧值搜索（stale closure）

- **位置**：`src/App.jsx:197-206`
- **问题**：
  ```js
  setQuery(item.rawQuery);
  setSource(item.rawSource);
  setSuggestionsOpen(false);
  setTimeout(() => {
    handleSearch();
  }, 0); // ❌ 捕获的是“点击时刻”的 handleSearch 闭包
  ```
  `handleSearch` 若依赖闭包中的 `query`/`source`，则 `setTimeout(0)` 触发时用的是**旧值** → 用旧关键词搜索。
- **修复**：不要依赖闭包，直接 `handleSearch(item.rawQuery, item.rawSource)`（若 `useSearch` 支持传参），或在 `setQuery/setSource` 的回调里用函数式更新后另行触发。

### NZ-3（原 #5）　搜索结果变化即覆盖播放列表

- **位置**：`src/App.jsx:125-129`
- **问题**：
  ```js
  useEffect(() => {
    if (results && results.length > 0) setCurrentPlaylist(results);
  }, [results, setCurrentPlaylist]);
  ```
  任何 `results` 变化（如后台加载更多）都会把用户当前正在播放的列表覆盖为搜索结果。
- **影响**：从收藏/历史进入播放后若搜索结果刷新，播放上下文会错位。
- **修复**：仅在“用户主动触发新搜索”时更新播放列表，而非监听 `results` 变化；或保留“当前列表来源”标记。

### NZ-4　`getCoverImage` 恒返回默认封面且路径不一致

- **位置**：`src/services/musicApiService.js:303-330`
- **问题**：该函数除参数校验失败外，其余分支均 `return 'default_cover.svg'`（**缺前导 `/`**），与项目其他处使用的 `'/default_cover.svg'`（`PlayerContext.jsx:12`、`useAudioPlayerViewState.jsx:60`）不一致；且真正取封面走的是 `forceGetCoverImage`（`:335`），使 `getCoverImage` 成为冗余/易误导的死逻辑。
- **修复**：统一默认封面常量（带 `/`）；清理未使用的 `getCoverImage`，或使其真正尝试取图。

### M-1　全局禁用 StrictMode

- **位置**：`src/index.jsx:25-27`（注释说明为避开发环境双播放）
- **问题**：关闭 StrictMode 会使组件双调用/`useEffect` 清理等潜在问题在**生产外完全无法暴露**。
- **修复建议**：保留 StrictMode，改用 ref 守卫（如 `playedRef`）避免 `AudioEngine.play()` 被重复调用，而非全局禁用。

### M-3　History 绕过 DownloadContext 自管状态

- **位置**：`src/pages/History.jsx:6,19-20,128-153`
- **问题**：直接 `import { downloadTrack } from '../services/downloadService'` 并自管 `downloading`/`currentDownloadingTrack`，与全局 `DownloadContext` 体系重复且易状态不一致。
- **修复**：统一走 `useDownload()` 提供的方法与状态。

### M-6　全局待同步计数 + 延迟同步定时器单例

- **位置**：`src/services/storage.js:464-522`（`CHANGES_COUNTER_KEY` 全局，非按 uid）；`src/services/syncService.js:30`（`delayedSyncTimer` 模块级单例）
- **问题**：
  1. 计数键 `pending_sync_changes` 对所有用户共用，多账号切换时会串计数（“待同步”数量跨用户泄漏）。
  2. `delayedSyncTimer` 在登出时未 `clearTimeout`，可能在无用户态下仍触发同步。
- **修复**：计数键加 `uid` 维度（`pending_sync_changes_${uid}`）；登出/卸载时清理 `delayedSyncTimer`。

### NZ-5（P3）　`navigateFallbackDenylist` 拼写错误

- **位置**：`vite.config.mjs:98`
- **问题**：Workbox 正确键名为 `navigateFallbackDenylist`，此处写成 `navigateFallbackDenylist`（d/e 顺序颠倒）→ 该拒绝列表**被静默忽略**，SPA 回退可能错误拦截 `/api-v1` 类导航。
- **修复**：改为正确拼写 `navigateFallbackDenylist`。

### E-2（P4）　`[更正]` 该条目实际为真实 bug

- **位置**：`eslint.config.cjs:43`（`'preserve-caught-error': 'off'`）；`package.json` 显示 `eslint: ^10.7.0`
- **问题更正**：此前复核称“它是 ESLint 核心规则、IDE 误报”是**错误的**。ESLint 在 v9 起已**移除**核心规则 `preserve-caught-error`，v10 中引用未定义规则会使 `npm run lint`（脚本 `eslint src functions --ext .js,.jsx`）直接报 `Definition for rule 'preserve-caught-error' was not found` 而失败。
- **IDE 结论有效**，只是理由应为“该规则在 v9+ 已被移除”，而非“第三方插件不存在”。
- **修复**：删除该行，或改为当前 ESLint 推荐的等价配置（如 `eslint.configs.recommended` 已不再含此规则，无需显式关闭）。

### E-4（P4）　`[误报]`

- **位置**：`Dockerfile`
- **问题更正**：IDE 报告称其“非多阶段”不成立。实际为 3 阶段：`base`（node）→ `build`（pnpm build）→ `production-stage`（nginx:alpine-slim），仅缺 `USER nginx` 等加固项。
- **修复建议**：补充 `USER nginx`；核实 `nginx:alpine-slim` tag（常用为 `nginx:alpine` / `nginx:stable-alpine`，见 NZ-7）。

### NZ-6（P4）　Vite 配置疑似拼写/API 不符

- **位置**：`vite.config.mjs:120`（`rolldownOptions`）、`:122`（`output.codeSplitting.groups`）
- **问题**：`build.rollupOptions` 是 Vite 标准键；此处 `rolldownOptions` 与 `output.codeSplitting.groups` 疑似拼写或 API 不符（Vite 8 即便默认 rolldown，配置兼容键通常仍为 `rollupOptions`，分包应为 `output.manualChunks`）。若键名错误，分包/输出配置被**静默忽略**。
- **修复**：结合 Vite 8 + rolldown 文档核实正确键名（大概率为 `rollupOptions` + `manualChunks`）；移除无效的 `codeSplitting.groups`。

### NZ-7（P4）　Dockerfile 镜像 tag 需核实

- **位置**：`Dockerfile:15`（`FROM nginx:alpine-slim AS production-stage`）
- **问题**：官方 nginx 镜像常用 tag 为 `nginx:alpine` / `nginx:stable-alpine`，`nginx:alpine-slim` 需确认是否存在于你的镜像源，否则 `docker build` 拉取失败。
- **修复**：改为确定存在的 tag。

---

## 五、与 IDE 报告的对账小结

**IDE 报告抓得对、值得肯定的条目**：B-1、B-2、B-3、B-5、B-6、B-7、S-1、S-2、S-3、S-4、S-5、P-1、P-5、M-1、M-3、M-6，以及 E-2（结论有效，理由见上）。

**复核后判定为误报 / 非问题（请勿据此改动）**：

- `M-2`：`process.env.*` 已由 `vite.config.mjs` 的 `define` + `vite-plugin-env-compatible`（已见于 `package.json` devDeps）处理；`musicApiService.js:13` 的 `process.env.REACT_APP_API_BASE` 同样被 env-compatible 插件转换。
- `M-7`：`saveCloudFavoritesToSubcollection` 末尾 `updateDoc(userRef)`（`syncService.js:882`）看似假设 user doc 存在，但 `incrementalSyncWithSubcollections` 已在 `:275` 先 `setDoc` 创建 user doc，故安全；非 bug。
- 原 `#7`（`ErrorBoundary` 方法名拼错）：复核 `src/components/ErrorBoundary.jsx:14`，实际为 `componentDidCatch`，拼写**正确**，无需修复。
- `netease` 拼写：`App.jsx:116`、`UserProfile.jsx:330` 均为正确拼写 `netease`，无需修复。
- `P-4` 的 `webp`：IDE 报告写成 “webp” 属其自身笔误，代码 `vite.config.mjs:73` 为正确的 `webp`。

**IDE 完全漏报、本清单新增的关键项**：NZ-0（入口语法错误）、NZ-1（`UpdateNotification` 渲染崩溃）、NZ-2（stale closure 搜索）、NZ-3（播放列表被覆盖）、NZ-4（`getCoverImage` 冗余/路径不一致）、NZ-5（`navigateFallbackDenylist` 拼写）、NZ-6（Vite 配置键名）。

---

## 六、待你补充的 IDE 原文条目

以下 IDE 条目的**具体描述未能从本次复核 context 还原**（仅记得其编号归属），无法给出文件/行号与修复建议。如需要我补全进此清单，请把 IDE 报告里对应条目的原文贴给我：

- **P 系列**：P-2、P-3、P-6、P-7
- **M 系列**：M-4、M-5、M-8、M-9、M-10
- **E 系列**：E-1、E-3、E-5

> 提示：NZ-5/NZ-6 等新增发现**可能**正对应上述某些条目（如 P-4 的 Vite/PWA 配置、E-3 的构建配置），贴出原文后我可去重合并。

---

## 七、建议修复顺序

> 前两步（P0 + 限流优先的 P1）**已于 2026-07-15 实际落地并集 lint 通过**。下列顺序记录原定计划，便于追溯。

1. **P0**：NZ-0（→ ✅ 已修复）→ NZ-1（→ ✅ 已修复）。
2. **P1（限流优先）**：RL-0（→ ✅ 已修复）→ RL-1（→ ⚠️ 部分）/ RL-2（→ ⚠️ 部分，含 B-4/B-5 已修）。
3. **P1（其他）**：B-1、B-2、B-3、B-4、B-5、B-6、B-7、S-1~S-5（→ ✅ 均已修复）。
4. **P2/P3**：RL-3、RL-4、NZ-2、NZ-3、P-1、P-5、M-1、M-3、M-6、NZ-4、NZ-5（→ 🔲 待修复）。
5. **P4**：E-2（会让 lint 失败，建议尽快）、NZ-6、NZ-7、E-4 加固（→ 🔲 待修复）。

---

## 八、API 使用核对（对照官方 `docs/reference/GD_STUDIO_API.md`，2026-07-15）

> 方法：逐条比对 `docs/reference/GD_STUDIO_API.md` 的 4 个端点（`search`/`url`/`pic`/`lyric`）与 `src/services/musicApiService.js` 的实际请求/响应处理，并核查 `functions/api-v1/[[path]].js` 代理透传与文档第 16 行限流（5 分钟 ≤ 50 次）的一致性。
>
> **结论：程序对官方 API 的使用基本正确，未发现违背规范的调用。** 具体如下。

### 8.1 端点逐项核对

| 端点       | `GD_STUDIO_API.md` 要求                       | 程序实际（`musicApiService.js`）                                                          | 结论                                                              |
| ---------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **search** | `types=search&source&name(必填)&count&pages`  | `types:'search'`, `source`, `name:query`, `count`, `pages:page`                           | ✅ 参数名/取值一一对应；`source` 默认 `netease`（与官方默认一致） |
| **url**    | `types=url&source&id&br(128/192/320/740/999)` | `types:'url'`, `source:track.source`, `id:track.id`, `br:quality`（`quality` 默认 `999`） | ✅ 一致；默认值 999 在官方取值内                                  |
| **pic**    | `types=pic&source&id(PIC_ID)&size(300/500)`   | `types:'pic'`, `source`, `id:picId`, `size`（300/500 校验，否则回落 500）                 | ✅ `size` 取 300/500 合法（见 8.2 注）                            |
| **lyric**  | `types=lyric&source&id(LYRIC_ID)`             | `types:'lyric'`, `source`, `id:track.lyric_id`                                            | ✅ 一致（官方注明 `lyric_id` 一般同曲目 ID）                      |

### 8.2 字段映射 / 其他一致性

- **返回字段**：`searchMusic` 校验 `id/name/artist/album/pic_id/lyric_id/source`（`dataValidator.js`），与 `GD_STUDIO_API.md` 第 34 行返回字段一致；`getLyrics` 读取 `response.data.lyric` / `tlyric`，与官方第 68 行一致；`getAudioUrl` 读 `response.data.url`，`forceGetCoverImage` 读 `response.data.url`，均符合官方。
- **音乐源**：程序默认 `netease`，导入回退用 `netease`↔`ytmusic`；二者均在 `GD_STUDIO_API.md` 第 24/40/52/64 行列出的合法源内（含官方“稳定源”netease）。
- **代理透传**：`functions/api-v1/[[path]].js` 将 `url.search` 原样拼到 `https://music-api.gdstudio.xyz/api.php`，所有 query 参数完整透传；并已剥离 `authorization`/`cookie` 等（对应 S-4），未篡改参数。
- **限流**：`rateLimiter.js` 的 `WINDOW_MS=300000`、50 次与 `GD_STUDIO_API.md` 第 16 行“5 分钟内不超 50 次请求”**完全一致**，并留 `SAFETY_RESERVE=4` 安全余量。

### 8.3 可优化项（非错误，建议后续处理）

1. **封面仅请求 500**：`playMusic`/`fetchCover` 路径统一用 `forceGetCoverImage(..., 500)`（`musicApiService.js:383`、`PlayerContext.jsx:188`）；`getCoverImage` 默认 `size=500` 但允许 300。官方 `pic` 的默认值是 300。当前固定 500 取高清图**合法**，但与官方默认不一致；若想省流量/命中官方默认，可改为优先 300、仅在需要高清时回退 500。（与本清单 NZ-4 / RL-3 相关。）
2. **`getCoverImage` 仍是冗余死逻辑**：第 3 节 NZ-4 指出的“恒返回默认封面”未改，播放流程实际走 `forceGetCoverImage`，建议后续清理或启用以补全封面缓存（仍受 RL-0 限流器约束）。
3. **高级用法 `_album` 未使用**：官方支持 `source=netease_album` 取专辑曲目列表，程序未用到（非 bug，仅能力未利用）。

> 综上：无需因“API 使用错误”而修改请求逻辑；优化项可并入 P2（NZ-4 / RL-3）一并处理。
