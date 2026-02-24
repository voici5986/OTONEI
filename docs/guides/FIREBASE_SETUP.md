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
   - GitHub（社交登录）
4. 对于Google登录，需要配置OAuth同意屏幕
5. 对于GitHub登录，需要在GitHub开发者设置中创建OAuth应用

### 4. 设置Firestore数据库

1. 在左侧导航栏选择"构建 > Firestore Database"
2. 点击"创建数据库"
3. 选择"生产模式"或"测试模式"（推荐开发时使用测试模式）
4. 选择最近的服务器位置
5. 点击"启用"

### 5. 配置数据库规则

在Firestore数据库的"规则"标签页，设置适当的安全规则。例如：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      // 允许用户读写自己的文档
      allow read, write: if request.auth != null && request.auth.uid == userId;

      // 允许用户读写自己的收藏子集合
      match /favorites/{favoriteId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      // 允许用户读写自己的历史记录子集合
      match /history/{historyId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

这条规则确保用户只能访问自己的数据。

### 6. 设置环境变量

在项目根目录创建`.env.local`文件，并添加以下配置（替换为你自己的Firebase项目信息）：

```
# API配置
REACT_APP_API_BASE=/api

# Firebase配置
REACT_APP_FIREBASE_API_KEY=your-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
REACT_APP_FIREBASE_APP_ID=your-app-id
```

## 功能说明

### 账号同步功能

该功能允许用户：

1. **创建账号/登录**：通过邮箱密码注册或使用Google/GitHub账号快速登录
2. **数据自动同步**：登录后会自动合并本地和云端的收藏和历史记录
3. **手动同步控制**：
   - 上传：将本地数据发送到云端
   - 下载：将云端数据覆盖本地
   - 双向同步：智能合并本地和云端数据

### 增量同步机制

SonicFlow现在使用增量同步机制，这种方式可以显著减少数据传输量和Firebase操作次数：

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
/users/{userId}/
  - email: string
  - displayName: string
  - createdAt: timestamp
  - lastUpdated: timestamp  // 新增：文档最后更新时间
  - favorites: array of track objects [
    {
      id: string,
      name: string,
      artist: string,
      album: string,
      cover: string,
      modifiedAt: timestamp  // 新增：项目修改时间
    }
  ]
  - history: array of history items [
    {
      song: {
        id: string,
        name: string,
        // 其他歌曲信息
      },
      timestamp: number  // 播放时间戳
    }
  ]
```

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

1. 使用Firestore测试模式，简化权限管理
2. 添加多个测试账号测试同步功能
3. 使用Firebase模拟器进行本地测试
