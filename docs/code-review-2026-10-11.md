# OTONEI 深度代码审查报告

| 项目     | 内容                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| 审查日期 | 2026-10-11                                                                             |
| 审查基线 | `main` @ `290b432`（工作树干净，本次审查未改动任何源代码）                             |
| 覆盖范围 | 全部 186 个受版本控制文件，源码约 22,000 行（`src` / `functions` / `e2e` / `scripts`） |
| 审查维度 | ① 安全 ② React 架构·状态·性能 ③ 数据层·网络·缓存·并发 ④ 构建·类型·测试·CI·发布         |
| 方法     | 静态通读 + 只读命令实测 + **一次性探针脚本复现**（探针文件运行后即删，工作树保持干净） |
| 严重级别 | Critical 2 · High 12 · Medium 16 · Low 若干                                            |

> **实证说明**：标记 `【已实证】` 的两条（C1、C2）用可复现探针脚本证实，非推断；React 专项的 H4/H9-H12 及 M 系列多数条目经 grep/实测逐条核实。多线之间的 1 处结论冲突见「九、多线冲突裁决」。

---

## 总体判断

工程素养**高于同类个人项目**：GitHub Actions 全部按 commit SHA 锁定并最小化 `permissions`；CSP / HSTS / 无点击劫持齐全且由测试守住两处配置文件字面一致；React 渲染路径经全仓 grep **无任何 XSS sink**；代理端点经逐行确认为**单源固定目标、非 SSRF**；Firestore 规则基于服务端可信的 `request.auth.uid`，无越权；真实密钥**从未进入 git 历史**（`git log --all -S"AIza"` 命中 0，`.env*.local` 全部被 `.gitignore` 覆盖）；本地 `oxlint --deny-warnings` / `tsc --noEmit` / `vitest run`（157 用例 / 81.3% 语句覆盖）全部实测通过。

真实问题集中在三处系统性缺口：**缓存失效的时序正确性**、**同步时间戳的权威性**、**渲染更新的粒度控制**。三者共同导致「CI 全绿，但用户可感知的回归仍会上线」。

---

## 严重级别速览

| 编号 | 级别                   | 一句话                                                                                                                     | 主要位置                                                         |
| ---- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| C1   | **Critical【已实证】** | `useFirebaseStatus` 无限自激，实测 5s 内 25.6 万次检查、狂发无监听方的事件                                                 | `src/hooks/useFirebaseStatus.ts:82-87`                           |
| C2   | **Critical【已实证】** | `getAudioUrl` 击穿 `forceRefresh` + 去重表泄漏，坏缓存后该音质档 10 分钟不可播                                             | `src/services/musicApiService.js:175-213`                        |
| H1   | High                   | 同步全用客户端 `Date.now()`，时钟回拨静默丢数据                                                                            | `src/services/syncService.js:225-241` 等                         |
| H2   | High                   | 收藏全量首拉无 `limit` + 软删文档永不硬删                                                                                  | `src/services/syncService.js:1042-1071`                          |
| H3   | High                   | 错误响应体被当有效结果缓存 10 分钟（与 C2 叠加放大）                                                                       | `src/services/musicApiService.js:201`                            |
| H4   | High                   | `PlayerContext` 每约 250ms 重建整个 Context 并全树广播；6 个 Provider 全部无 `useMemo`，播放器 4 处 `memo()` 形同装饰      | `src/contexts/PlayerContext.jsx:362`                             |
| H5   | High                   | 本地账户凭据落盘、登出不删除、无失败次数限制                                                                               | `src/contexts/AuthContext.jsx:74-90,193-201`                     |
| H6   | High                   | 「清除缓存」承诺与实际不符（人脸/封面/歌词残留）                                                                           | `src/components/ClearDataButton.jsx:114-118`                     |
| H7   | High                   | 约 78% JS 源码不在 typecheck 覆盖内                                                                                        | `tsconfig.json:7`（`checkJs:false`）                             |
| H8   | High                   | e2e 只测离线降级且跑 dev server，构建产物 0 覆盖                                                                           | `playwright.config.mjs:40-58,33-36`                              |
| H9   | High                   | `AuthContext` 登录同步 effect 被 `checkAvailability` 身份抖动反复重启；异步回调无 active 守卫，重跑会取消用户上一次同步    | `src/contexts/AuthContext.jsx:322-453`                           |
| H10  | High                   | `useSearch` 监听 `favorites_changed` 后 `[...results]` 造假引用全列表刷新，与 H4 叠加成重渲染风暴，且大概率冗余            | `src/hooks/useSearch.ts:245-252`                                 |
| H11  | High                   | `History.jsx` 绕过 `DownloadContext` 自实现下载状态，两页面对同一首歌给出矛盾 UI                                           | `src/pages/History.jsx:22-23,146-171`                            |
| H12  | High                   | `window.scrollTo` / `window` scroll 监听滚动的是「不滚动的容器」，真实滚动容器为 `.main-content`，导航 `scrolled` 为死状态 | `src/App.jsx:59-68`、`src/hooks/useNavigationState.ts:44-52`     |
| M1   | Medium                 | `/api-v1` 是无鉴权公开代理（**非 SSRF**，但可被当免费跳板）                                                                | `functions/api-v1/[[path]].js:123-161`                           |
| M2   | Medium                 | `searchMusic` 不给结果盖 `source`，契约漂移即拒播/串号                                                                     | `src/services/musicApiService.js:62-122`                         |
| M3   | Medium                 | 跨标签页收藏全量覆盖，后写者赢                                                                                             | `src/services/storage.js:285-327`                                |
| M4   | Medium                 | `getLyrics` 深访问 `response.data` 无 null 守卫                                                                            | `src/services/musicApiService.js:302-305`                        |
| M5   | Medium                 | 收藏乐观 state 与存储形状不同源                                                                                            | `src/contexts/FavoritesContext.tsx:105`                          |
| M6   | Medium                 | CI 双跑完整门禁 + 发布不校验 tag 对应的 commit                                                                             | `.github/workflows/main.yml:52`                                  |
| M7   | Medium                 | `index.html` / `/` 缺 `no-cache`，可能白屏                                                                                 | `public/_headers`、`conf/nginx.conf:8-11`                        |
| M8   | Medium                 | `rateLimiter` 测试形同虚设，核心限流无断言                                                                                 | `src/test/rateLimiter.test.js`                                   |
| M9   | Medium                 | CSP `connect-src 'self' https:` 几乎取消外联限制                                                                           | `public/_headers:6`                                              |
| M10  | Medium                 | `errorHandler` 死代码簇；`isFirebaseAvailable` 恒真导入                                                                    | `src/utils/errorHandler.js`、`src/hooks/useFirebaseStatus.ts:27` |

---

## 一、Critical（已用探针实证）

### C1 · `useFirebaseStatus` 无限自激循环

**探针实测**：`renderHook(() => useFirebaseStatus())` 挂载后 **5 秒内 `checkFirebaseAvailability` 被自动调用 255,971 次并超时**。

**根因**——一条 `state → 依赖 → 重建回调 → effect → 改 state` 的闭环：

- `finally { setIsChecking(false) }`（`src/hooks/useFirebaseStatus.ts:86`）改变 `isChecking`；
- `checkAvailability` 的 `useCallback` 依赖数组含 `isChecking`（`:89`），于是每次 `isChecking` 翻转都重建该回调；
- 触发它的 effect（`:119-121`）又依赖 `checkAvailability`，重建即重跑，再次把 `isChecking` 置回 `true`……循环成立。
- 每次迭代都会 `dispatchFirebaseStatusChange()`（`:67`）派发一个 `firebaseStatusChange` 事件，而**全仓 0 个监听方**——纯烧 CPU 并向浏览器事件系统灌噪声。

**触发场景**：正常在线时靠可用性布尔收敛暂时掩盖，但一次网络抖动 / 离线→在线切换（`:103-117` 分支）即可复现。

**修复方向**：`isChecking` 移出依赖数组（改用 `useRef`）；初始可用性检查只在挂载跑一次，重检由显式调度而非 effect 自激。

### C2 · `getAudioUrl` 击穿 `forceRefresh` + 去重表永久泄漏

**探针实测**：同一首歌按 `冷启动 → 命中缓存 → forceRefresh=true` 顺序请求，第三次**不发网络请求**（正确实现应发），返回的是过期的上游签名 URL。

**根因**（`src/services/musicApiService.js:175-213`）：缓存命中分支 `return cachedData`（`:178-182`）之前**没有任何 `await`**，因此 `try…finally` 的 `finally` 在同一个微任务里同步执行，`pendingUrlRequests.delete(pendingKey)`（`:207`）先于 `pendingUrlRequests.set(pendingKey, urlPromise)`（`:213`）触发——此刻 Map 里还没有该 key，删除为空操作；随后 `set` 把一个「已 resolve 且清理钩子已跑过」的死 Promise 写进去，**该条目永远不会被回收**。而入口的去重检查（`:162`）在判断 `forceRefresh` **之前**执行，之后所有 `forceRefresh=true` 都命中这个死条目。

**实际影响（不止"潜伏"）**：播放错误的自动重试正是 `forceRefresh=true`（`src/contexts/PlayerContext.jsx:351`），音质降级（`:236`）沿用它。因此**一次瞬时坏缓存后，该 `source_id_quality` 在约 10 分钟内无法再播，且不重载标签页就无法恢复**。对照同文件 `getLyrics`（`:324-327`）用 `setTimeout(…, 100)` 延迟删除恰好绕开了此时序陷阱，可见这是 `getAudioUrl` 独有的回归。

**修复方向**：缓存命中分支不与网络分支共用同一 `finally`；或先 `set` 登记、仅网络分支负责清理；命中缓存时直接返回、不进入去重登记路径。

---

## 二、High

### H1 · 同步时间戳全程用客户端 `Date.now()`，时钟回拨静默丢数据

`src/services/syncService.js:225-241`（变更检测 `item.modifiedAt > lastSyncTime`）、`:340`（`now = Date.now()` 写回 `lastSyncTime`）、`:1136`（上传 CAS `item.modifiedAt || now`）等。全仓 `grep serverTimestamp` **零命中**。

设备时钟回拨（NTP 校正 / 用户改时间）后，新增收藏的 `modifiedAt < lastSyncTime`，会被 `getLocalChangesSince` **永久过滤 → 静默永不上传**；跨设备时钟偏移则以「未来时间戳」通过 LWW 覆盖他端较新的真实编辑。

**修复方向**：`modifiedAt` 用 `serverTimestamp()` 做权威序，或变更检测改用显式 dirty 标志 + 墓碑规避回拨漏传。

> 注：规则层 `firestore.rules:9` 的 `isSyncTime` 已接受 `int`，与客户端数值时间戳不冲突——这是设计选择（便于离线判新旧），问题只在「客户端时钟被当作权威」。

### H2 · 收藏「全量首拉」无 `limit` + 软删文档永不硬删

`src/services/syncService.js:1042-1071`：`lastSyncTime === 0`（新设备首次同步）时 `favoritesQuery = favoritesRef`，无 `limit`，`getDocs` 一次性读整个子集合进内存；而收藏删除只写 `deletedAt` 软删，云端文档从不硬删，文档数随删除单调增长。历史侧有 `limit(maxItems)`，收藏侧完全没有。

### H3 · 错误响应体被当有效结果缓存 10 分钟（缓存投毒）

`src/services/musicApiService.js:201` `setMemoryCache(CACHE_TYPES.AUDIO_URLS, cacheKey, response.data)` 无结构校验。上游常在 HTTP 200 下返回 `{ code: -1 }` 无 `url` 的业务错误体（代理 `functions/api-v1/[[path]].js:202` 原样透传，axios 只对非 2xx 抛错，2xx 业务错误不进 `catch`）。坏对象被缓存后（truthy）`AUDIO_URLS`（TTL 10 分钟）全命中；正常靠 `forceRefresh` 绕过——而 **C2 恰好让 `forceRefresh` 失效**，两者叠加。

### H4 · 高频进度与全部 Context value 未 memo，全树每秒约 4 次重渲染（React 专线，本次核实）

`src/contexts/PlayerContext.jsx:362` 的 `contextValue` 是每次渲染新建的对象字面量，其中 `playProgress` / `playedSeconds` / `totalSeconds` 来自原生 `timeupdate`（约 250ms/次，`:306-326`）。**实测 6 个 Provider（Auth/Player/Device/Download/Favorites/Sync）的 value 全部无 `useMemo`（grep 各文件 useMemo 命中均为 0）**，任一 state 变化即广播所有消费者。

放大链（React 专线给出、结构已核实）：`App.jsx:144` 只需 `handlePlay` 却订阅完整 context → 每秒约 4 次重渲染 Header、Navigation、`renderContent()` 与整条搜索结果列表；而 `SearchResultItem` / `MusicCardActions` / `HeartButton` 及列表项**均无 `React.memo`**。播放器组件上挂的 `memo()`（`AudioPlayer.tsx:35`、`DesktopPlayerView.jsx:76`、`MobilePlayerView.jsx:90`）**全部形同装饰**——`memo` 只拦父级 props，拦不住 `useContext` 传播。`isFavorite`（`FavoritesContext.tsx:84-91`）内部还是对 favorites 的 O(n) 线性 `some()` 扫描，500 首收藏上限 × 每个 HeartButton × 每次重渲染。

**修复方向**：把 `playProgress/playedSeconds/totalSeconds` 拆成独立 `PlayerProgressContext`（或让 ProgressBar 直接 `audioEngine.on('timeupdate')` 自订阅）；纯函数（`formatTime/parseLyric/seekTo/togglePlay`）放进永不变化的 `PlayerActionsContext`；Provider value 全部 `useMemo`；`isFavorite` 改 `useMemo` 的 Set 查表；给 `SearchResultItem`/`HeartButton` 加 memo。

### H5 · 本地账户凭据落盘 + 登出不删除 + 无失败限制

`src/contexts/AuthContext.jsx:74-90`：离线本地账户把 `passwordSalt` + `passwordHash` + `email` 一并写入 localforage（默认 IndexedDB）。`signOut`（`:193-201`）对本地用户**只清内存态、不删落盘记录**。PBKDF2-100k-SHA256（`:35-45`）已优于历史版本，但盐与哈希同处一条可导出记录、前端仅要求 `length>=6`（`src/components/AuthContainer.jsx:66`）、登录比对（`:132-137`）无任何失败计数 / 退避 / 锁定。

### H6 · 「清除缓存」承诺与实际不符（安全 + 数据两线独立收敛，本次亦亲验）

`src/components/ClearDataButton.jsx:114-118` 勾选「缓存数据（封面、结果等）」只调 `clearMemoryCache()` + `clearBrowserCaches()`；后者（`src/utils/cacheStorage.js:1-20`）只删 Service Worker 的 CacheStorage，**完全不碰** localforage 的 `coverStore`、`avatar-cache:`（人脸 base64，键为 uid/邮箱）、`sonicflow_lyric_`（歌词）。模态框文案（`ClearDataButton.jsx:210`）却承诺清除。共享设备 / 交付设备场景下，上一用户的内容收听画像不随「清除」消失。

### H7 · 约 78% JS 源码不在 typecheck 覆盖内

`tsconfig.json:7` 设 `checkJs:false`：44 个 `.js/.jsx` 被 tsc 解析载入却**不做类型检查**（本次 `tsc --listFilesOnly` 实测纳入 72 文件，其中 45 个为免检的 js/jsx）。App.jsx(599) / UserProfile.jsx(758) / PlayerContext.jsx(395) / AuthContext.jsx(470) 等核心文件的属性访问 / 参数回归，typecheck 与 CI 一律放行。

### H8 · e2e 只测离线降级路径，且跑 dev server

`playwright.config.mjs:40-58` 清空全部 Firebase 环境变量 → e2e 永远只测离线降级，真实同步 / 鉴权路径 **0 覆盖却绿灯**；且 `:33-36` 默认跑 `vite dev`，构建期（分包 / define 替换 / 压缩）回归不被 e2e 抓。`firestore-rules` 的 emulator 测试不依赖 secret（设计正确），但对 `isValidUserDocument` / `isValidHistory` / history 集合无断言。

### H9 · `AuthContext` 登录同步 effect 被回调身份抖动反复重启（React 专线）

`src/contexts/AuthContext.jsx:322-453` 的登录同步 effect，deps（`:453`）含 `checkAvailability`；而 `checkAvailability`（`src/hooks/useFirebaseStatus.ts:39-90`）的 `useCallback` deps 含 `isChecking`（`:89`），其内部 `setIsChecking` 翻转 → 回调换身份 → effect cleanup 后整体重跑（重新 `auth.onAuthStateChanged`、重新注册监听）。每次重跑都调 `resetSyncScheduler()`（`AuthContext.jsx:330`），它经 `syncService.js:862-864` 把排队中的同步 waiter 直接 resolve 成 `{success:false, error:'账号已切换…'}` → **用户看到"上一次同步被打断"，而非登录同步完成**。effect 内 `onAuthStateChanged` 的异步回调在 cleanup 后继续 `setSyncComplete/setCurrentUser`，无 `active` 守卫（对照 `App.jsx:161-183` 的正确写法）。

**修复方向**：`checkAvailability` 移出 deps（用 ref 持最新）；同步触发只在 `currentUser?.uid` 真变化时进行；异步回调加 `let active = true` 守卫。

### H10 · `useSearch` 的 `favorites_changed` → `[...results]` 造假引用刷新，大概率冗余（React 专线）

`src/hooks/useSearch.ts:245-252` 的监听 effect deps 含 `results`，每次搜索/加载更多换引用即卸载重注册；回调里 `dispatch({ type:'REFRESH_RESULTS', payload:[...results] })` **只为制造新数组引用**让每张 `SearchResultItem` 重渲染以刷新心形图标——与 H4 叠加 = 收藏一次触发「每秒 4 次全树广播 × 卡片数 × 一次全列表强刷」。而 `FavoritesContext.tsx:103-108` 已乐观更新、`HeartButton` 本可从 Context 直接读到最新 `isFavorite`，这套 REFRESH_RESULTS 属绕开单向数据流的手工补丁。

### H11 · `History.jsx` 平行实现一套下载状态，两页 UI 矛盾（React 专线，本次核实代码）

`src/pages/History.jsx:22-23` 本地 `downloading` / `currentDownloadingTrack` + `:146-171` 直接调 `downloadTrack`，与 `DownloadContext.tsx:44-69` 的 `handleDownload` + `isTrackDownloading` 完全平行。后果：从历史页下载时 Context 里 `downloading` 恒为 false，`SearchResultItem.tsx:76` / `Favorites.jsx:331` 的按钮不显示 spinner；反之从收藏页下载后切到历史页，历史页新 state 是 false，两处对同一首歌给出矛盾状态。且 `downloadTrack` 的 `onFinishDownload` 回调与 `await` 双通道会让 `setDownloading(false)` 触发两次。

### H12 · 滚动容器假设错误：`window` 根本不滚动（React 专线，本次核实 CSS）

`src/styles/App.css:320-336` 给 `.app-container` 设 `height:100dvh; overflow:hidden`、`.main-content` 设 `overflow-y:auto`——真正的滚动容器是 `.main-content`。因此 `App.jsx:61` 的 `window.scrollTo(0,0)` 是**无效调用**；`useNavigationState.ts:44-52` 的 `window.addEventListener('scroll')` 永不触发，`DesktopNavbar.jsx:31` 消费的 `scrolled` 是**死状态**。另与 Suspense 冲突：`App.jsx:59-68` deps 仅 `[activeTab]`，在 lazy fallback commit 后即执行，chunk 落地后新页面在旧滚动位置挂载。

---

## 三、Medium

- **M1 · `/api-v1` 是无鉴权公开代理（确认非 SSRF）**。路径经 `ALLOWED_PATHS.has()` 精确匹配，query key / type / source / bitrate 全白名单，`redirect:'manual'` 且 3xx 直接 502（`functions/api-v1/[[path]].js:152-183`），目标固定 `TARGET_API_BASE`，**无法指定任意主机**。但整个 handler 无任何调用方鉴权，限流是自述的「单实例软限流」（`:28-33`），`CF-Connecting-IP` 按实例计数，IP 池可绕过；任何人可拿本项目域名无限请求上游，耗尽配额或致本 IP 被上游封禁。**修复方向**：Origin/Referer 允许列表 + Firebase App Check；真要限流需上平台级 Rate Limiting/WAF。
- **M2 · `searchMusic` 不给结果盖 `source`**（`src/services/musicApiService.js:62-122`）。返回 track 的 `source` 完全来自 `validateSearchResults`（`src/utils/dataValidator.ts:41`），未把入参 `source` 落到结果上。docs 承诺上游返回含 `source`，故**非必然崩**；但若某源不回显，`assertSupportedApiSource('unknown')`（`:18-23`）会拒播、`getTrackKey` 会把不同源同 id 折叠成 `unknown:123` → 收藏 / 去重 / 封面串号。属「契约漂移即崩、客户端无兜底」。**修复方向**：返回前对每条结果强制盖上入参 `source`，与缓存 key 保持一致。
- **M3 · 跨标签页写覆盖**：`toggleFavorite`（`src/services/storage.js:285-327`）读-改-写整个数组后全量覆盖 localforage；`syncInFlight`（`src/services/syncService.js:59-64`）只是进程内标志。两标签页各有独立模块实例，后写者赢，丢收藏。Firestore 事务 CAS 只保护云端文档，保护不了本地全量覆盖。
- **M4 · `getLyrics` 深访问无 null 守卫**（`src/services/musicApiService.js:302-305`）：内层只有 `finally` 无 `catch`，也没有 `searchMusic` 那样的 `if (!response.data)`。2xx 空体 → `response.data.lyric` 抛 TypeError。
- **M5 · 收藏乐观 state 与存储形状不同源**（`src/contexts/FavoritesContext.tsx:105`）：乐观写入原始 `track`，而存储写 `toPersistedTrack`（id 字符串化、artist 规范化）。当前 `getTrackArtist` 多来源容错暂未暴露，依赖 `artist`/`album` 标量时显形。
- **M6 · CI 双跑 + 发布信任未验证 tag**：`main.yml:52-53` 与 `ci.yml:47-48` 内容完全相同（都跑完整 `verify:release`），tag 发布把门禁重跑一遍（`:22` 给了 45 分钟几乎全耗在重复验证）；且 `main.yml` 不校验被打 tag 的 commit 是否为最近一次 CI 绿色 HEAD——未过门禁但手工打 `v*` 的提交仍可产出发布镜像。
- **M7 · `index.html` / `/` 缺 `no-cache`**：`public/_headers` 的 `/*` 只挂安全头，`conf/nginx.conf:8-11` 的 SPA fallback 也无 `Cache-Control`。HTML 走启发式缓存，SW 未接管时旧 index.html 可能引用已清理的旧 hash 资源 → 白屏。带 hash 的 `/assets/*` 策略本身正确。
- **M8 · `rateLimiter` 测试形同虚设**（`src/test/rateLimiter.test.js`）：全文只测「返回 ok」和「剩余配额 ∈ [0,50)」，**50/5min 的核心限流逻辑无一条断言**。且 `acquire()`（`src/services/rateLimiter.ts:15-27`）是 `for(;;)` 无最大等待次数，配额长期打满会永久挂起。
- **M9 · CSP `connect-src 'self' https:`**（`public/_headers:6`，nginx 侧一致）几乎取消外联限制；因 `script-src 'self'` 严格且无 XSS sink，属纵深防御削弱项。
- **M10 · 死代码簇**：`autoRecover` / `canAutoRecover` / `getRecoverySuggestion`（`src/utils/errorHandler.js` 326 行中约 100 行）0 真实调用；`src/hooks/useFirebaseStatus.ts:27` 把函数 `isFirebaseAvailable` 直接当布尔 `Boolean(getFirebaseAvailability)`，恒为 truthy，使 `isAvailable` 初值失真（数据流问题，非崩溃）。
- **M11 · 事件总线承担跨组件状态同步，契约不一致且有死事件**（React 专线，本次核实）：三套命名风格混用（`favorites_changed` / `local:data_cleared` / `networkStatusChange`）；`UserProfile.jsx:395` 发裸 `Event`（无 detail），与 `FavoritesContext.tsx:110-112` 的 `CustomEvent({detail})` 契约不一致，靠消费者忽略 detail 侥幸可用；`firebaseStatusChange`（C1 的产物）与 `SyncEvents.SYNC_PROGRESS` **零消费者**；`favorites_changed` 一次触发会引发 Favorites 页全量读库 + UserProfile 双读 + History `[...prev]` 白刷（`Favorites.jsx:121`、`UserProfile.jsx:91`、`History.jsx:132`）。另缺 `history_changed`：站在历史页用媒体键切歌，列表不刷新，与 favorites 行为不对称。**修复方向**：改用 Context 暴露的显式 `subscribe` + 版本号，仅 `otonei:ready` 这类跨 bundle 边界事件留在 window。
- **M12 · lint 主动关闭了恰好报警本次高危反模式的三条规则**（React 专线，本次实测）：`.oxlintrc.json:11-13` 全局 `off` 掉 `react/refs`、`react/set-state-in-effect`、`react/purity`。实测 `oxlint . -D correctness` 可复现一批违规，集中在渲染期读写 ref（`Favorites.jsx:74`、`UserProfile.jsx:56`、`ProgressBar.jsx` 渲染体内读写 3 个 ref）、effect 内同步 setState（`App.jsx:156`、`PlayerContext.jsx:156`、`Favorites.jsx:106/239`）——**等于拆掉了检测这些 bug 的烟雾报警器**，`pnpm lint --deny-warnings` 通过不代表这些模式不存在。
- **M13 · 禁用 StrictMode 掩盖四类问题**（React 专线）：`index.jsx:33-36` 以「双渲染导致双播」为由关闭，真实原因是 `AudioEngine` 模块级单例（`AudioEngine.ts:173`）在重挂载时与新 Provider 的 listener 短暂共存。被掩盖的：单例 listener 重复注册、effect 幂等性（H9）、渲染期读写 ref（M12）、双跑副作用靠 ref 去重（`recordPlaybackHistory` 的 `historyRecordedKeyRef` — ref 初值在两次 mount 间共享，现在能跑 ≠ 语义正确）。
- **M14 · `useNetworkStatus` 被实例化 5 份**（React 专线，本次核实调用点）：`App.jsx:70`、`PlayerContext.jsx:21`、`DownloadContext.tsx:39`、`useFirebaseStatus.ts:25`（后者本身被 `App.jsx:76` + `AuthContext.jsx:61` 各调一次）→ 5 份 `online/offline` window 监听 + 5 份 connection `change` 监听 + 5 个各自独立的 `isOnline` state；`useNetworkStatus.ts:132-146` 的 deps 链（`connectionType` → `dispatchNetworkStatusChange` → `handleOnline` → effect 重跑 → 再 dispatch）构成潜在自激环。各消费点对「是否在线」的判定来自**不同实例**。
- **M15 · `Header` 未接收 `suggestionsLoading`**（React 专线，本次核实）：`App.jsx:558` 传入，`Header.jsx:9-24` 解构里没有该 prop → 本地建议检索的 spinner 到不了 UI，`aria-busy`（`:268/:372`）绑的是远端 `loading`，读屏器对本地检索进度零播报。
- **M16 · 播放器重试链两处硬伤**（React 专线，本次核实）：`PlayerContext.jsx:351` 重试**硬编码 `999`**——用户选 320 出错后自动重试用 999，再叠加 C2 的击穿；`toggleLyric`（`:142-151`）在 `setLyricExpanded` 的 **updater 函数内**调 `fetchLyrics` 异步副作用，且 `:154-158` 已有一个覆盖同场景的 effect，属重复劳动（StrictMode 下 updater 双跑会双发 `getLyrics`，靠 `pendingLyricRequests` 兜住）。

---

## 四、Low（择要）

- **下载**：`downloadService.js:186,236` 文件名直接用 API 可控字符串未净化 basename；主 `fetch` 无超时/中止，挂起会卡死整个串行队列；`content-type` 判定过窄（`application/octet-stream` 常见 flac/m4a 被误伤），走备用路径后仍 `return true`，可能报「下载成功」实则未下载。
- **缓存细节**：`memoryCache.ts:64` 覆盖写不改 LRU 位置（`get` 命中有 `delete+set` 修正，`set` 覆盖未修正）；`AUDIO_METADATA` 缓存桶定义却全仓无使用（死桶）；缓存 key 用 `_` 拼接用户可控 `query`（`musicApiService.js:66`，碰撞概率极低）。
- **设备检测**：`deviceDetector.js` 用 UA 正则 + 屏幕尺寸启发式判设备类型，与 CSS 的 `@media` 断点（`src/config/responsive.mjs`）是两套真相，可能分叉；`App.jsx:575-576` 存在 `? 'main-content' : 'main-content'` 两分支同串的三元残留。`orientationManager` 的 `lockToPortrait` 在非 fullscreen 下必 reject，`App.jsx:509-517` 每次 mount 都会产生一次 rejected promise。
- **无障碍**：`App.jsx` 的搜索联想列表（键盘方向键可导航、Enter 选择）缺少 `role="listbox"`/`option`/`aria-activedescendant`，屏幕阅读器无法感知选中项；更新提示的移动端遮罩（`UpdateNotification.jsx`）未设 `role="dialog"`/`aria-modal`，且用裸 `<div>` 作按钮容器，键盘不可达。`prefers-reduced-motion` 已处理（`index.css:327`）。
- **会话/存储**：Firebase 默认 `local` 持久化，全仓无 `setPersistence`，共享设备不登出即继承上一账号读写权；localStorage 键名内嵌 uid/邮箱（`syncService.js:160`、`avatarCache.js:30`），且不在 H6 的清除范围内。
- **CI/工具链**：`.oxlintrc.json:13-15` 全局关掉 `react/set-state-in-effect`、`purity`、`refs`，可能掩盖副作用类真实告警（建议局部 disable 而非全局）；`pnpm-workspace.yaml` 屏蔽了两条 GHSA 使 `pnpm audit --prod` 对其不设防；`fullyParallel:false + workers:1` 拉长 CI。
- **React 细节（React 专线，择要）**：
  - `AuthContext.jsx:456-467` 的 `login/register/signInWithGoogle/signOut/resetPassword` 全为每次 render 新建闭包（无 `useCallback`），10 处 `useAuth()` 消费者必然全渲染——全仓最纯粹的漏 memo。
  - `AuthContext.jsx:290` `await logout()` 未检查 `firebase.js` 返回的 `{error}`（该函数从不 throw）→ 登出失败会误报成功，`toast.error('退出登录失败')` 是死代码。
  - `AuthContext.jsx:406-408` 登录同步的 30s 超时 `setTimeout` 从不清理，超时后 `syncPromise` 仍在跑（结果被丢弃）。
  - `AudioPlayer.tsx:12` 仅为取 `playerUrl` 订阅整个 context，而 `playerUrl` 全链路死传递（真实 `<audio>` 是 `AudioEngine.ts:53` 模块级单例，不在 React 树里）。
  - `ProgressBar` 在桌面/移动/mini 三处各渲染一份，各自挂 4 个 document 监听（`ProgressBar.jsx:115-118`），窄屏展开时隐藏的那份仍订阅 timeupdate。
  - 死参数：4 个调用点给 `HeartButton` 传 `variant="link"`，但 `HeartButton.jsx:7` 签名没有 `variant` → 静默丢参；`MusicCardActions` 的 `showDelete` 分支全仓无调用方传入 → 永不渲染。
  - `App.jsx:110` 等 4 处动态 `import('./services/storage')` **全无收益**（`storage.js` 已被 `App.jsx:16` 静态引入同一 chunk），同文件 3 处本地模糊匹配实现彼此不一致。

- **CSS/构建**：runtimeCaching 图片用宽泛正则 + CacheFirst 30 天（`vite.config.mjs:82-91`）、MiSansVF CacheFirst 1 年，第三方同 URL 换图长期不回源，建议 StaleWhileRevalidate；MiSansVF.woff2 实测 11.87 MB 偏大，建议子集化 / unicode-range 分片。

---

## 五、与历史审查清单的诚实校准

`docs/archive/code-review-checklist-2026-07-15.md` 声称 **B-5「pendingUrlRequests 在 forceRefresh 下不防重」已修复**，但本次 C2 探针实测表明**该问题以另一种形态复发**（改为缓存命中时序导致击穿）。已确认为**真已落地**的历史项：RL-0 全局限流器 + 429 处理（滑动窗口在 `rateLimiter.ts`、429+`Retry-After` 在 `functions/api-v1/[[path]].js:147`）、S-1 PBKDF2、S-2 CSP/HSTS、S-3 `firestore.rules`、S-4/S-5 代理头收紧。**建议**：把 C2 作为 B-5 的回归重新登记；注意 429 退避目前**只在代理侧**，客户端 `apiClient.ts` 无拦截器做退避重试。

---

## 六、架构观察（React 专线，本次核实）

模块级**无循环依赖**（实测 `hooks` / `contexts` 从不 import UI 组件），静态分层 `index.jsx → contexts → pages → components → hooks → services → utils` 基本单向。但有 **4 类运行时层级穿透**：

1. **hooks 反向 import contexts**：`useNavigationState.ts:2`、`useAlbumCoverImage.ts:2`、`useAudioPlayerViewState.tsx:2` 直接 `import { useAuth/usePlayer }`——与 `useSearch.ts`（只吃 `isOnline` 入参、不碰 context，是**正确写法**）在同目录并存两套约定。
2. **contexts → hooks → services → hooks 运行时成环**：`PlayerContext.jsx:6` import `useNetworkStatus`，而 `useFirebaseStatus.ts:25` 又内部调用 `useNetworkStatus`，导致同一 hook 被实例化 5 份（见 M14），各持独立 `isOnline` state。
3. **Context 越过自己的 Provider 直调 service 内部事件原语**：`AuthContext.jsx:222/244/251/280` 直接 `triggerEvent(SyncEvents.*)`，绕过 `SyncContext.tsx:203-248` 的 startSync/handleSyncComplete；登出时 `syncStatus`/`isSyncing`/`pendingChanges` 不更新。登出前那段约 90 行（`:206-287`）与 `onAuthStateChanged` 里的 `:336-448` **几乎逐行重复**——同一套生命周期手抄两遍。
4. **service 层持有跨层单例并被 UI 直接读写**：`ProgressBar.jsx:31-39` 直接对模块级 `audioStateManager` 调 `pause()/play()`，真实 transport 状态在 React 之外；`AudioEngine.ts:173` / `audioStateManager.ts:179` 的模块级单例意味着 HMR / 单测隔离 / 未来多窗口都会共享同一个 `<audio>`，且 `audioStateManager.initEngineListeners()` 只在构造时注册一次、**无任何反注册路径**。

**根因判断**：绝大多数 React/性能问题同源——**高频状态塞进顶层单 Context + value 不 memo + 无 selector 订阅**，事件总线则是这套缺失拆层的补丁，而非解耦手段。真正值得先做的三件事：① 把进度状态从 `PlayerContext` 拆走（H1/H4，一个架构决策顺带让 4 处 `memo()` 生效）；② 用 selector 订阅取代 `window CustomEvent` 总线（H10/M11，可整删 `favorites_changed` 链路约 60 行）；③ 恢复被关掉的三条 React lint 规则并恢复 StrictMode（M12/M13）——它们关掉的正是本次 High 级问题最集中的三类反模式。

**可拆接缝（择要）**：`App.jsx`(599) 的搜索建议块（`:36-348` 约 300 行）→ `<GlobalSearchBar>`；`UserProfile.jsx`(758) 的 `searchTrack` + 导入导出（约 268 行）→ `services/favoritesTransfer.js`；`syncService.js`(1453) 承载 **12 个模块级可变状态**无法重置/隔离测试 → `createSyncScheduler()` 工厂 + 纯函数 `mergePolicy.js` + 云仓储适配器。重复实现接缝：三套收藏读取、三份模糊匹配、两份焦点陷阱 + 两份 modal、两套下载状态、三套时间格式化、两套图片缓存。

---

## 七、多线冲突与裁决

| #   | 冲突                                                                                                                                                                                                               | 裁决与依据                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | React 专线在「未发现问题的项」中判 `musicApiService.js:205-209` 的 finally-delete **无泄漏 ✓**，与 **C2**（探针实证：缓存命中时 `finally` 同步跑、`delete` 先于 `set` 造成永久泄漏 + 击穿 `forceRefresh`）直接冲突 | **采纳 C2**（以探针实测为准）。该线只看了网络分支（`await` 之后 finally 确实在 `set` 之后），未覆盖缓存命中分支无 `await` 的同步路径。其对照结论——`getLyrics` 用 `setTimeout(…,100)` 规避（`:322-328`）——反而**印证**了 C2 的时序分析成立。 |
| 2   | 基建线初稿称 `coveragePath()` 未定义、覆盖率门禁会在加载配置时崩溃                                                                                                                                                 | **证伪**。`coveragePath` 在 `vite.config.mjs:10` 有定义，实测 `vitest run --coverage` 正常（157 通过 / 81.3% 语句覆盖）。门禁真实生效。                                                                                                     |
| 3   | 数据线将 `searchMusic` 不盖 `source`（M2）列为 High（"直接崩播放"）                                                                                                                                                | **降级为 Medium**。官方文档（`docs/reference/GD_STUDIO_API.md:37`）明确搜索返回**含 `source` 字段**，当前上游回显，故非必然触发；保留其"契约漂移即崩、客户端无兜底"的真实风险。                                                             |
| 4   | 基建线称本地 Node/pnpm 满足 engines 约束并执行了全部校验                                                                                                                                                           | **一致**。本地实测 node v26.11.1 / pnpm 12.11.2，`typecheck` / `lint` / `vitest` 均 exit 0，结论相互印证。                                                                                                                                  |

---

## 八、修复优先级建议

1. **立即**（改动局部、风险低、收益高）：C1（移出 `isChecking` 依赖）、C2（解耦缓存命中与 `finally`）——C2 同时压制 H3 与 M16 的重试失效。
2. **短期**：H4（把进度状态拆出 `PlayerContext` + 6 个 Provider value 全部 `useMemo`，一个决策顺带让播放器 4 处 `memo()` 生效）、H1（服务端权威时间戳）、H5/H6（凭据落盘与清除语义）、H9（`checkAvailability` 移出 deps + 异步守卫）、H11（`History.jsx` 改用 `useDownload`）。
3. **中期**：H7（分阶段开 `checkJs`，优先播放/收藏/同步链路转 `.tsx`）、H8（e2e 切 `vite preview` 跑构建产物 + 补规则断言）、M12/M13（恢复被关的三条 React lint 规则 + 开发环境恢复 StrictMode）、M3（跨标签页一致性）、M6/M7（CI 精简 + 部署缓存头）。
4. **结构性**：H10/M11（用 Context selector 订阅取代 window CustomEvent 总线，可整删 `favorites_changed` 链路约 60 行）；封面 URL 现落地四层（`coverCacheRef` / memoryCache / `coverStore` / `avatarCache`）且失效互不同步，收敛到单一协调层；`syncService.js` 的 12 个模块级可变状态收进 `createSyncScheduler()` 工厂；删除死缓存桶 `AUDIO_METADATA` 与 `errorHandler` 死代码簇。

---

## 九、检查过但确认「无问题」（免重复劳动）

1. **Firestore 越权读写 / 伪造 uid / 读全库**：`firestore.rules:4-8` `isOwner(userId)` 基于 `request.auth.uid`（Firebase ID token 签名，客户端不可伪造），所有 `users` / `favorites` / `history` 路径均 `isOwner` + 字段与长度白名单约束，无 `allow ... if true`。
2. **Firebase web API key 打进 bundle**：Web API key 是公开标识符非机密，`.env.example` 为占位；真实值仅在未提交的 `.env.local`。
3. **SSRF / 开放代理转发任意主机**：见 M1，代理为单源固定目标 + 全白名单 + 拒绝跟随重定向。
4. **XSS / 注入 sink**：全仓 grep `dangerouslySetInnerHTML` / `innerHTML` / `document.write` / `eval(` / `new Function(` / `srcdoc` / `javascript:` —— **零命中**；无 `postMessage` 监听；用户可控串仅进 `<img src>`/`<audio src>`/`fetch`。
5. **明文凭据落盘**：除 H5 的本地账户派生材料外，无明文密码/token 落 localStorage/IndexedDB。
6. **自定义 claim 客户端写入 / 会话降级伪造云端身份**：全仓无 `getIdTokenResult`/`claims`/`useEmulator` 使用，不存在该通路。
7. **供应链与 CI**：Actions 全 SHA pin、`persist-credentials:false`、最小 `permissions`；`allowBuilds:false` 禁用 esbuild/protobufjs 生命周期脚本；无 git/http/非标 registry 依赖；`.dockerignore` 排除 `.env*`；`release.ps1` 全参数化、无 `Invoke-Expression`。
8. **PWA 版本失效**：`build/sw.js` 确认 precache 随 hash 变化正常失效，旧版本无法失效的风险在 HTML/JS 侧不存在。
9. **React 正确性红线**（React 专线交叉核实）：所有早退 return 均在 hooks 之后，**无条件 hook 违规**；`audioEngine.on()` / `audioStateManager.addListener` 的订阅在 `PlayerContext` 三处均有对称 cleanup；`AudioEngine.setSource` 的 requestId 守卫 + `playMusic` 的 `isRequestCurrent` 回调是全仓设计最好的部分，**快速切歌竞态处理正确**；`App.jsx:161-183` 的 debounce 带 active 标志 + clearTimeout 是项目内异步守卫的正面范例；`musicApiService.js:81-87` 的 abort 透传正确。
10. **模块级循环依赖**：实测 `hooks` / `contexts` 目录从不 import `components` / `pages`，ES module 层无环（运行时数据环见「六、架构观察」）。

---

_本报告为只读审查产物，未修改任何源代码。文中所有行号对应基线 commit `290b432`，后续提交可能偏移。_

---

## 十、核实、裁决与本地修复记录（2026-10-11）

以下记录补充并校准上面的原始只读报告。修复保留在本地工作树，没有提交、推送或部署。报告中的编号作为追踪标识，不代表原严重级别和所有推断都已被接受。

### 已落地的必要修复

| 原编号        | 核实结果与处理                                                                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1、H9        | 确认检查回调身份随检查状态抖动。稳定回调、合并进行中的检查，移除无消费者的 Firebase 状态事件；认证订阅按会话代次隔离，过期回调不能更新新账号状态。补充 StrictMode、账号切换和登出等待/超时回归。                                                                                                              |
| C2、H3        | 确认音频缓存命中后留下已完成 Promise，强制刷新失效。缓存命中不再进入网络登记流程；网络 Promise 在完成后清理；拒绝缺少有效 HTTP(S) URL 的业务错误响应。覆盖冷请求→缓存命中→强制刷新及并发刷新。                                                                                                                |
| H1            | 确认仅靠客户端时间筛选会漏传回拨后的编辑。收藏、删除标记、历史与导入使用持久化 dirty/localRevision；确认上传只清理同一版本。云端 cloudRevision 事务比较与 syncedAt 服务端时间负责冲突和历史排序；旧快照不能撤回已确认的删除。冲突保留本地意图，提示后可重试。旧迁移、裁剪也使用服务端优先排序并检查同步代次。 |
| H2            | 确认收藏读取无界。按文档 ID 分页，保留有界的有效收藏及与本地操作相关的删除记录；历史分页后保留有界的最新集合。云端删除标记仍保留，避免长期离线设备复活已删除收藏。没有采用未经确认的按年龄硬删策略。                                                                                                          |
| H4、H10       | 确认高频进度扩大广播，搜索结果假刷新冗余。进度进入独立 Provider，主播放 Context 不再携带进度；相关 Provider 值 memo、列表组件 memo、收藏查找使用 Set。删掉收藏事件驱动的 results 复制。DeviceContext 原本直接传 state，本次无需修复。                                                                         |
| H5            | 本地账号的盐和哈希保留是离线再次登录的必要行为，普通登出不删除账户。确认缺少尝试限制，加入持久化的设备级 5 次/15 分钟限制；不在限制键中保存邮箱。该机制不抵抗能够读写设备本地存储的人。                                                                                                                       |
| H6            | 确认清理遗漏。清除缓存覆盖内存、CacheStorage、封面 IndexedDB、头像及歌词持久化，并使已挂载缓存失效。缓存代次阻止清理前的请求写回；封面写入/清理串行化。清除本地收藏使用专用 API，避免变成云端批量删除。                                                                                                       |
| H8            | 普通 E2E 改为确定性生产构建 + vite preview；构建阶段也清空测试 Firebase 配置。补充认证生命周期与 Firestore 用户/历史/版本字段规则断言。Fixture 浏览器测试不等同于真实云端鉴权/跨设备验收。                                                                                                                    |
| H11、H12      | 历史页统一使用 DownloadContext；切歌记录变化能通知历史页。滚动重置/监听指向真实 main-content 容器。                                                                                                                                                                                                           |
| M2、M4、M5    | 搜索结果盖上请求的 source；歌词响应允许 null，字段类型归一化；收藏 Context 使用存储返回的规范记录与实际时间/版本。                                                                                                                                                                                            |
| M3、M11       | 通过按账号作用域的 Web Locks 及页内队列序列化本地修改，锁只保护存储读改写而不覆盖网络等待；排队操作捕获账号作用域。核心收藏/历史消费者使用显式 scoped subscription，删除 UI 重复发事件与重复读取。无 Web Locks 的浏览器只具有页内序列化；兼容的跨边界通知保留。                                               |
| M7            | 根 HTML/HTML 文件使用 no-cache；哈希资源保留 immutable，Nginx 子 location 显式继承安全头。Pages 的重叠规则会合并同名头，所以不把 no-cache 放到全局 /*。                                                                                                                                                       |
| M8            | 限流器增加配额耗尽、窗口恢复、取消和等待上限断言；等待可取消且默认最长 310 秒。搜索的超时覆盖等待配额，结束时清理计时器和外部 abort 监听。                                                                                                                                                                    |
| M10、M12、M13 | 删除确认无消费者的错误恢复函数与缓存桶；恢复 react/refs、react/set-state-in-effect、react/purity，并修复暴露出的模式；恢复 StrictMode，订阅清理有回归覆盖。                                                                                                                                                   |
| M14、M15、M16 | 网络状态使用同一外部存储/同一组监听。Header 接收本地 suggestionsLoading。播放失败重试保留所选音质；歌词开关 updater 保持纯函数，由单一 effect 按需请求。                                                                                                                                                      |
| Low 中确认项  | 下载文件名净化、头/响应体读取 30 秒超时、支持二进制音频 MIME、拒绝空内容/错误类型并去掉假成功备用路径；LRU 覆盖写更新位置；更新模态框补 dialog/焦点处理；头像异步结果和封面错误回退有守卫；清理无意义三元表达式/未使用参数。PWA 图片使用基于请求类型的后台更新策略；字体缓存也后台更新。                      |

### 没有直接实施原建议的项

- **H7**：checkJs:false 的类型覆盖缺口确实存在。临时开启完整 JS 检查产生 769 行诊断；这些包含大量既有 JS 类型声明缺失，不能当作 769 个运行时缺陷。本次修复具体错误、恢复 React 规则和补回归，保留已有严格 TS 检查，不用大量 any/忽略指令制造通过。全量 JS/JSX 类型迁移属于后续独立改造，未完成。
- **M1**：公开音乐代理是支持游客的产品行为；固定上游/参数白名单/禁止跟随重定向并不是开放 SSRF。直接强制 Firebase 登录会破坏游客和离线模式。若线上出现滥用，应按实际域名/部署在 Cloudflare 设置入口流量控制；本轮不把客户端限流误称为服务器防滥用。
- **M6**：原报告“未通过门禁的标签仍可发布”的结论不成立。Container Release 的 build 明确依赖 verify，并在被标记提交重新执行完整门禁。重跑有成本，但去掉它需要先建立可验证的、同一提交的 CI 复用协议。本轮保留门禁；另修复 Firestore rules 的 deploy 必须依赖 validate。
- **M9**：connect-src https: 范围宽确实削弱纵深防御，但浏览器直接下载多来源动态签名音频 URL 需要这些连接。没有可靠完整的 CDN 契约前不盲目收紧，否则会破坏下载。保留并记录这一部署/架构约束。
- **M10 的初值断言**：firebase.js 实际导出的是可变布尔值，不是函数；Boolean(importedValue) 本身不会恒真。这部分原结论不成立，检查循环的真实原因仍按 C1 修复。
- **搜索列表无障碍**：Header 已存在 listbox/option/aria-activedescendant，不能重复列为缺失。本次增加的是本地检索忙碌状态，及更新弹窗语义/焦点保护。原报告称更新按钮是裸 div 也不符合当前按钮实现。
- **方向锁与体积/分层建议**：lockToPortrait 已捕获失败，不是未处理的 rejected promise。字体分片、统一全部设备启发式、拆分全量 JS 文件、同步调度器工厂和全部事件/缓存系统替换，保留为改造方向，不以未经证明的风险开展额外重构。

### 同步协议的发布边界

先验证并部署新版 firestore.rules，再发布客户端。旧云端文档可以没有版本字段；文档一旦由新版客户端写入版本字段，后续写入必须携带合法的下一版本与服务端时间。旧客户端试图移除这些字段会明确失败，需要刷新到新版，避免静默降级版本协议。云端规则、线上 OAuth、真实多设备同步以及 Cloudflare/GitHub 发布均须另行验收；本次没有部署。

关于 Pages 头的合并语义，依据 [Cloudflare 官方文档](https://developers.cloudflare.com/pages/configuration/headers/)。锁文件将 @grpc/grpc-js 更新为 1.14.6，并删除两条 audit 忽略；对应 [证书认证通告](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j) 和 [错误信息泄漏通告](https://github.com/grpc/grpc-node/security/advisories/GHSA-f596-whhp-79r4) 描述的是 gRPC 服务端路径，原浏览器应用不能据此直接断言可利用，但现在审计无需屏蔽。

### 本地验证结果

- 最终单元/集成回归：28 个文件，208/208 通过；覆盖率门禁通过（语句 82.73%，分支 73.06%）。
- 严格 Oxlint（包含恢复的三条 React 规则）、Oxfmt、TypeScript、CSS lint、工具链检查与 git diff --check 通过。
- 生产构建通过；构建产物浏览器测试 9/9、PWA 离线/更新提示测试 2/2 通过。已有服务占用 4173 时使用可配置的 4175 测试端口，没有停止已有服务。
- Firestore Emulator 使用与仓库 SHA256 一致的规则和原测试脚本，34 个显式 allow/deny 断言通过，进程退出码 0；另有 12 项补充规则探针通过。便携 Java、模拟器、CLI 配置与临时测试依赖位于被忽略的 .tmp/local-firestore-rules-check，没有安装系统 Java 或访问真实云端数据库。
- pnpm audit --prod：0 已知漏洞；不再屏蔽原来的两条 GHSA。
- 独立复核提出的缓存回填、账号切换、旧快照撤回、导入容量、作用域切换和取消后维护写入问题已修复并回归；复核无剩余重大可执行发现。

构建仍有 Firebase vendor chunk 超过 500 kB 的提示；这属于体积优化，不是构建失败。本地结果不证明线上 OAuth、多设备真实同步、Cloudflare 响应头或 GitHub 发布事件已验收。
