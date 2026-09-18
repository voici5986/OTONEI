# Firebase 账号同步功能配置指南

本文档描述了如何为 OTONEI 音乐播放器设置 Firebase 来启用账号同步功能。

## 配置步骤

### 1. 创建 Firebase 项目

1. 访问 [Firebase Console](https://console.firebase.google.com/)
2. 点击"创建项目"或"添加项目"
3. 输入项目名称（如"otonei-sync"）
4. 根据需要配置 Google Analytics（可选）
5. 点击"创建项目"完成设置

### 2. 添加 Web 应用

1. 在项目概览页面，点击"Web"图标（`</>`）添加 Web 应用
2. 输入应用昵称（如"OTONEI Web"）
3. 可选择勾选"设置Firebase托管"
4. 点击"注册应用"
5. 系统将显示Firebase配置，包含apiKey、authDomain等信息，保存这些信息

### 3. 配置身份验证服务

1. 在左侧导航栏选择"构建 > Authentication"
2. 点击"开始使用"或"登录方法"标签页
3. 启用以下登录方式：
   - 电子邮件/密码（基本方式）
   - Google（社交登录）
4. 对于Google登录，需要配置OAuth同意屏幕

### 4. 设置Firestore数据库

1. 在左侧导航栏选择"构建 > Firestore Database"
2. 点击"创建数据库"
3. 选择"生产模式"。本地开发需要宽松数据时，请使用 Firebase Emulator，不要在公开项目上部署测试规则。
4. 选择最近的服务器位置
5. 点击"启用"

### 5. 配置数据库规则

将仓库根目录的 `firestore.rules` 部署到 Firestore。该规则同时校验 UID 归属、用户文档字段、收藏/tombstone 结构和历史记录结构。修改同步数据结构时，必须同步更新和验证该规则。

### 6. 设置环境变量

在项目根目录创建`.env.local`文件，并添加以下配置（替换为你自己的Firebase项目信息）：

```
# API配置
VITE_API_BASE=/api-v1/api.php
REACT_APP_API_BASE=/api-v1/api.php

# Firebase配置
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

应用优先读取 `VITE_*`。已有部署在迁移窗口内仍可使用对应的 `REACT_APP_*` 变量；确认所有外部环境已切换后，再单独移除旧变量。

## 功能说明

### 账号同步功能

该功能允许用户：

1. **创建账号/登录**：通过邮箱密码注册或使用 Google 账号快速登录
2. **数据自动同步**：登录后会自动合并本地和云端的收藏和历史记录
3. **手动同步控制**：
   - 上传：将本地数据发送到云端
   - 下载：将云端数据覆盖本地
   - 双向同步：智能合并本地和云端数据

### 增量同步机制

OTONEI 现在使用基于本地时间戳的增量同步机制，这种方式在时钟正常且数据规模较小时可以减少数据传输量和 Firebase 操作次数。

> **重要限制**：`modifiedAt`、历史 `timestamp`、同步游标和冲突排序目前依赖客户端 `Date.now()`。多设备时钟偏差、手动改时或离线时间漂移可能导致变更被提前/延后筛选，不能把本地通过视为真实多设备收敛验证。若要消除该风险，需要服务端拥有的更新时间、持久化 outbox/dirty 状态和确定性的冲突 tie-breaker；仅增加 `serverUpdatedAt` 不足以解决问题。

1. **工作原理**：
   - 系统记录上次同步的时间戳
   - 只同步自上次同步后变化的数据
   - 通过比较本地和云端的最后更新时间，跳过不必要的同步操作

2. **优势**：
   - 减少数据传输量，节省带宽
   - 减少Firebase读写操作次数，降低资源消耗
   - 提高同步速度，改善用户体验

3. **数据结构要求**：
   - 收藏项需要添加`modifiedAt`时间戳字段
   - 用户文档需要添加`lastUpdated`全局时间戳字段

### 数据存储结构

Firebase存储结构设计：

```
/users/{userId}
  - email: string
  - displayName: string
  - createdAt: timestamp
  - lastUpdated: timestamp | number

/users/{userId}/favorites/{encodeURIComponent(source:id)}
  - id: string
  - source: string
  - modifiedAt: number
  - deletedAt: number  // 仅删除 tombstone 存在
  - ...track fields     // 活动收藏的歌曲字段

/users/{userId}/history/{encodeURIComponent(source:id)}
  - song: track
  - timestamp: number
```

同一歌曲的历史文档会更新播放时间，而不是每次播放新建文档。收藏删除通过 tombstone 在多设备之间传播。

`source` 的可播放值为 `netease`、`kuwo`、`joox`、`bilibili` 和 `ytmusic`。`unknown` 仅为旧数据或异常来源的兼容标记，保留在规则中用于读取和迁移，但客户端不会把它提交给音乐 API 播放、歌词或封面接口。

用户中心的“清除本地数据”只删除当前设备的本地副本，不删除云端收藏或历史；清除同步游标后，下次同步可能重新下载云端数据。

## 故障排除

1. **登录失败**：
   - 检查Firebase配置是否正确
   - 确认已启用相应的登录方式
   - 检查网络连接

2. **同步失败**：
   - 检查网络连接
   - 确认Firestore规则允许用户读写操作
   - 检查浏览器控制台是否有错误信息

3. **配置问题**：
   - 确保.env.local文件中的所有Firebase配置变量都已正确设置
   - 重启应用以加载新的环境变量

4. **同步时间戳问题**：
   - 如果同步行为异常，可以尝试清除本地存储中的同步时间戳
   - 在浏览器控制台执行：`localStorage.removeItem('last_sync_timestamp_您的用户ID')`

## 资源优化建议

为了最大限度地减少Firebase资源消耗（特别是对免费账号），建议：

1. **控制同步频率**：
   - 避免频繁手动同步
   - 可以在应用设置中添加"节省模式"选项，减少自动同步频率

2. **监控用量**：
   - 定期检查Firebase控制台中的用量统计
   - 如果接近免费限额，考虑实施更严格的同步限制

3. **数据精简**：
   - 限制历史记录的最大数量
   - 只存储必要的歌曲信息，减少文档大小

## 本地开发建议

开发过程中，建议：

1. 使用 Firebase Emulator 测试规则与同步，不要放宽线上规则
2. 添加多个测试账号测试同步功能
3. 公开部署可进一步启用 Firebase App Check；这需要先在 Firebase Console 注册 Web 应用和验证提供商，仅修改仓库代码不能完成该步骤。

本地单元测试和规则模拟器只能证明局部逻辑与规则语法；上线前仍需单独验证真实 Firebase 项目、多设备并发/离线收敛、App Check、TLS 和部署环境配置。
