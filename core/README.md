# @orion-mf/core

OrionMF Core - Micro-frontend isolation and lifecycle management

[![Version](https://img.shields.io/npm/v/@orion-mf/core)](https://www.npmjs.com/package/@orion-mf/core)
[![License](https://img.shields.io/npm/l/@orion-mf/core)](https://github.com/orion-platform/orion-mf/blob/main/LICENSE)

## Install

```bash
npm install @orion-mf/core react react-dom
```

## Usage

```typescript
import { loadSubApp, destroySubApp, getSubApp } from '@orion-mf/core';

// Load sub-app
const instance = await loadSubApp({
  key: 'sub-app-key',
  name: 'Sub App Name',
  remoteEntry: 'http://localhost:3000',
  cssIsolation: 'shadow-dom',
});

// Destroy sub-app
await destroySubApp('sub-app-key');

// Get loaded instance
const instance = getSubApp('sub-app-key');
```

## Features

- **JS Sandbox** - Pure Proxy implementation, ES Module compatible
- **CSS Isolation** - Shadow DOM + Scoped CSS + Dynamic style interception
- **Error Isolation** - Error Boundary + Global error catching + Circuit Breaker
- **Runtime Safety** - Global snapshot/recovery, prototype chain protection
- **Crash Recovery** - Circuit Breaker pattern to prevent repeated failures
- **Four-level Degradation** - Full → Compatible → Iframe → Fallback
- **Event Bus** - Version-controlled event communication
- **Global Store** - Global state with CAS semantics
- **Preload Strategy** - 5 modes: idle, visible, all, smart, manual
- **Keep-Alive** - Sub-app caching for instant restoration

## API Reference

### Core Functions

| Function | Description |
|----------|-------------|
| `loadSubApp(config)` | Load a sub-application |
| `destroySubApp(key)` | Destroy a sub-application |
| `getSubApp(key)` | Get loaded sub-app instance |

### Sandbox

| Function | Description |
|----------|-------------|
| `Sandbox` | JS sandbox with Proxy isolation |
| `getCurrentRunningApp()` | Get current running sub-app |
| `setCurrentRunningApp(key)` | Set current running sub-app |

### Global Store

| Function | Description |
|----------|-------------|
| `setGlobalState(key, value, owner)` | Set global state |
| `getGlobalState(key)` | Get global state |
| `subscribeGlobalState(key, callback)` | Subscribe to state changes |

### Event Bus

| Function | Description |
|----------|-------------|
| `eventBus.createChannel(name, version)` | Create event channel |
| `channel.on(event, handler)` | Subscribe to event |
| `channel.emit(event, payload)` | Emit event |
| `cleanupByOwner(owner)` | Clean up by owner |

## Documentation

- [Chinese Documentation](./docs/design/orion-mf-v2-design.md) - Complete design document
- [Module Federation](https://webpack.js.org/concepts/module-federation/) - Webpack MF docs

## License

MIT
