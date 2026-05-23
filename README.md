# OrionMF 微前端框架

> OrionMF 是 Orion 平台的微前端框架，提供子应用隔离、沙箱、通信、加载等核心能力。

本目录包含两个独立发布的 npm 包：

| 包名 | 用途 | npm |
|------|------|-----|
| `@orion-mf/core` | 微前端核心框架（沙箱、隔离、通信） | https://www.npmjs.com/package/@orion-mf/core |
| `create-orion-subapp` | 子应用脚手架（快速创建子应用） | https://www.npmjs.com/package/create-orion-subapp |

---

## 架构概览

```
┌──────────────────────────────────────────────────────────────────┐
│                        Orion 主应用                               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    @orion-mf/core                           │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │ Sandbox  │  │ Style    │  │ Error    │  │ EventBus │  │  │
│  │  │ (JS隔离) │  │ Isolator │  │ Isolator │  │ (通信层) │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │ Global   │  │ Router   │  │ Crash    │  │ Preload  │  │  │
│  │  │ Store    │  │ Manager  │  │ Recovery │  │ Strategy │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│  │ SubApp 1  │  │ SubApp 2  │  │ SubApp 3  │  │ SubApp N  │   │
│  │ (React)   │  │ (Vue 3)   │  │ (Vue 2)   │  │ (Vanilla) │   │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘   │
│         ↑              ↑              ↑              ↑          │
│         └──────────────┴──────────────┴──────────────┘          │
│                    通过 create-orion-subapp 创建                  │
└──────────────────────────────────────────────────────────────────┘
```

### 核心设计原则

- **JS 沙箱**: 纯 Proxy 方案，隔离全局变量和原型链
- **CSS 隔离**: Shadow DOM + Scoped CSS + 动态样式拦截
- **异常隔离**: Error Boundary + 全局异常捕获 + 熔断器
- **通信机制**: 带版本控制的事件总线
- **四级降级**: Full → Compatible → Iframe → Fallback

### 21 个核心模块

| 模块 | 功能 |
|------|------|
| MFSandboxBridge | 子应用加载与隔离桥梁 |
| Sandbox | JS 沙箱（Proxy 隔离） |
| StyleIsolator | CSS 样式隔离（Shadow DOM） |
| ErrorIsolator | 异常捕获隔离（Error Boundary） |
| GlobalStore | 全局状态管理（CAS 支持） |
| EventBus | 事件总线（版本控制） |
| SubAppDataChannel | 状态写权限控制 |
| RouterManager | 子应用路由管理 |
| PreloadStrategy | 预加载策略（5 种模式） |
| SubAppCache | Keep-Alive 缓存 |
| CrashRecovery | 熔断恢复机制 |
| DegradationStrategy | 四级降级策略 |
| ReactShadowCompat | React + Shadow DOM 兼容 |
| VueShadowCompat | Vue 3 + Shadow DOM 兼容 |
| Vue2ShadowCompat | Vue 2 + Shadow DOM 兼容 |
| DevProxyManager | 在线联调模式 |
| RuntimeCSSPrefixer | CSS 运行时前缀 |
| LeakPrevention | 资源泄漏防护 |
| SecurityPolicyManager | 安全策略配置 |
| ObservabilityManager | 可观测性监控 |
| FrameworkUpgrade | 框架版本升级 |

---

## 目录结构

```
packages/
├── core/                        # @orion-mf/core 微前端核心框架
│   ├── src/
│   │   ├── core/                # 核心模块实现
│   │   │   ├── Sandbox.ts       # JS 沙箱
│   │   │   ├── MFSandboxBridge.ts # 子应用加载
│   │   │   ├── StyleIsolator.ts # CSS 隔离
│   │   │   ├── ErrorIsolator.ts # 异常隔离
│   │   │   ├── EventBus.ts      # 事件总线
│   │   │   ├── GlobalStore.ts   # 全局状态
│   │   │   └── ...              # 其他 15 个模块
│   │   └── build/
│   │       └── complateReactLoader.ts # React loader
│   ├── dist/                    # 编译产物（npm 发布内容）
│   ├── package.json             # 包配置 (@orion-mf/core)
│   ├── tsconfig.json
│   └── .npmignore
│
├── create-orion-subapp/         # 子应用脚手架 CLI
│   ├── bin/
│   │   ├── create.js            # CLI 入口
│   │   └── create-app.js        # 创建逻辑
│   ├── templates/               # 子应用模板
│   │   ├── react/               # React 模板
│   │   ├── vue3/                # Vue 3 模板
│   │   ├── vue2/                # Vue 2 模板
│   │   └── vanilla/             # 原生 JS 模板
│   └── package.json
```

---

## 快速开始

### 主应用使用 @orion-mf/core

```bash
npm install @orion-mf/core
```

```typescript
import { loadSubApp, destroySubApp } from '@orion-mf/core';

// 加载子应用
const instance = await loadSubApp({
  key: 'my-subapp',
  name: 'My Sub App',
  remoteEntry: 'http://localhost:3001/remoteEntry.js',
  cssIsolation: 'shadow-dom',
});

// 销毁子应用
await destroySubApp('my-subapp');
```

### 创建子应用

```bash
# 使用 npx（推荐）
npx create-orion-subapp my-app

# 选择不同框架
npx create-orion-subapp my-app --template vue3
npx create-orion-subapp my-app --template vue2
npx create-orion-subapp my-app --template vanilla

# 进入项目
cd my-app
npm install
npm run dev
```

---

## 开发指南

### 开发 @orion-mf/core

```bash
cd packages/orion-mf
npm install

# 构建
npm run build

# 监听模式
npm run build:watch

# 运行测试
npm test
npm test:coverage

# 类型检查
npm run type-check

# 本地打包测试
npm pack
```

### 发布到 npm

```bash
cd packages/orion-mf
npm publish --access public
```

### 开发 create-orion-subapp

```bash
cd packages/create-orion-subapp
npm install

# 本地测试
node bin/create.js test-app --template react

# 发布到 npm
npm publish --access public
```

---

## 子应用生命周期

```
idle → loading → bootstrapping → mounting → mounted → unmounting → unmounted → error
```

每个子应用需要导出标准生命周期钩子：

```typescript
// src/bootstrap.tsx
export async function bootstrap() {
  console.log('[SubApp] bootstrap');
}

export async function mount(props: SubAppProps) {
  const { container } = props;
  ReactDOM.createRoot(container).render(<App />);
}

export async function unmount(props: SubAppProps) {
  const { container } = props;
  ReactDOM.createRoot(container).unmount();
}
```

---

## 包信息

| 包名 | 版本 | 大小 | 模块数 | 依赖 |
|------|------|------|--------|------|
| `@orion-mf/core` | 1.0.0 | 235.8 KB | 21 | react, react-dom (peer) |
| `create-orion-subapp` | 1.0.0 | 18.0 KB | 4 模板 | ora, inquirer |

---

## 文档

- 微前端子应用接入设计: `docs/architecture/微前端子应用接入与后端交互设计.md`
- 前端微前端开发规范: `docs/cross-cutting/frontend/micro-frontend-development-guide.md`

---

## 许可证

MIT
