# create-orion-subapp - OrionMF 子应用脚手架

> 快速创建符合 OrionMF 规范的微前端子应用

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://www.npmjs.com/package/create-orion-subapp)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/orion-platform/orion-mf/blob/main/LICENSE)

## 简介

`create-orion-subapp` 是 OrionMF 微前端框架的官方脚手架工具，用于快速创建符合框架规范的子应用项目。

支持的模板：
- React (默认)
- Vue 3
- Vue 2
- Vanilla (原生 JavaScript)

## 安装

```bash
# 使用 npx (推荐)
npx create-orion-subapp my-subapp

# 或全局安装
npm install -g create-orion-subapp
create-orion-subapp my-subapp
```

## 使用

### 基本用法

```bash
# 创建 React 子应用 (默认)
npx create-orion-subapp my-app

# 创建 Vue3 子应用
npx create-orion-subapp my-app --template vue3

# 创建 Vue2 子应用
npx create-orion-subapp my-app --template vue2

# 创建原生 JavaScript 子应用
npx create-orion-subapp my-app --template vanilla

# 强制覆盖已存在的目录
npx create-orion-subapp my-app --force
```

### 交互式创建

不传入项目名称时，脚手架会交互式询问：

```bash
npx create-orion-subapp
```

## 项目结构

创建的子应用项目结构：

```
my-subapp/
├── src/
│   ├── App.jsx           # 根组件 (React)
│   ├── bootstrap.jsx     # 生命周期钩子
│   └── main.jsx          # 入口文件
├── index.html            # HTML 模板
├── package.json
├── vite.config.js        # Vite 构建配置
└── tsconfig.json         # TypeScript 配置
```

## 开发

### 启动开发服务器

```bash
cd my-subapp
npm install
npm run dev
```

开发服务器将在 `http://localhost:3001` 启动。

### 构建生产版本

```bash
npm run build
```

构建产物将输出到 `dist/` 目录。

## 配置说明

### Vite 配置

子应用使用 Vite 作为构建工具，已配置好 Module Federation 所需的设置：

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
  },
});
```

## 与 OrionMF 集成

子应用需要导出生命周期钩子：

```typescript
// src/bootstrap.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

export async function bootstrap() {
  console.log('[MySubApp] bootstrap');
}

export async function mount(props) {
  const { container } = props;
  const root = ReactDOM.createRoot(container);
  root.render(<App {...props} />);
  return root;
}

export async function unmount(props) {
  const { container } = props;
  ReactDOM.createRoot(container).unmount();
}
```

主应用使用 `@orion-mf/core` 加载子应用：

```typescript
import { loadSubApp } from '@orion-mf/core';

const instance = await loadSubApp({
  key: 'my-subapp',
  remoteEntry: 'http://localhost:3001/remoteEntry.js',
});
```

## 常见问题

### Q: 子应用如何与主应用通信？

A: 使用 OrionMF 的 `EventBus` 模块进行跨子应用通信。

### Q: 子应用样式会污染主应用吗？

A: 不会。OrionMF 使用 Shadow DOM 实现样式隔离。

### Q: 子应用崩溃会影响主应用吗？

A: 不会。OrionMF 的异常隔离机制确保子应用崩溃不会影响主应用。

## 许可证

MIT

---

Related: [OrionMF](https://www.npmjs.com/package/@orion-mf/core)
