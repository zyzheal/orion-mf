/**
 * complete-react-loader - 自动导入 React
 *
 * 自动修复 JSX 文件缺少 React 导入的问题
 */

// Webpack loader types (peer dependency - not installed at build time)
interface LoaderContext {
  getOptions: () => Record<string, any> | undefined;
  cache: (flag: boolean) => void;
  async: () => (err: Error | null, result?: string) => void;
  resource: string;
}

type LoaderFunction = (this: LoaderContext, source: string) => string | void;

/**
 * Loader 配置选项
 */
export interface CompleteReactLoaderOptions {
  /** 是否启用自动导入 */
  enabled?: boolean;
  /** React 导入语句 */
  importStatement?: string;
}

/**
 * 自动修复 JSX 文件缺少 React 导入
 *
 * 使用方式：
 * ```javascript
 * // webpack.config.js
 * module.exports = {
 *   module: {
 *     rules: [
 *       {
 *         test: /\.(js|jsx|ts|tsx)$/,
 *         exclude: /node_modules/,
 *         use: [
 *           {
 *             loader: 'complete-react-loader',
 *             options: { enabled: true }
 *           }
 *         ]
 *       }
 *     ]
 *   }
 * }
 * ```
 */
const completeReactLoader: LoaderFunction = function (this: LoaderContext, source: string) {
  const options = this.getOptions() as CompleteReactLoaderOptions | undefined;
  const enabled = options?.enabled ?? true;

  if (!enabled) {
    return source;
  }

  // 检测是否包含 JSX
  const hasJSX = /<([a-zA-Z0-9._:-]+)/.test(source);

  // 检测是否已导入 React
  const hasReactImport = /import\s+React\s+from\s+['"]react['"]/.test(source);
  const hasDefaultReact = /import\s+\w+\s+from\s+['"]react['"]/.test(source);

  // 如果有 JSX 但没有导入 React，则自动添加
  if (hasJSX && !hasReactImport && !hasDefaultReact) {
    const importStatement = options?.importStatement ?? "import React from 'react';\n";

    // 查找第一个 import 语句的位置
    const importMatch = source.match(/^import\s+/m);
    if (importMatch) {
      // 插入到第一个 import 之前
      const importIndex = importMatch.index!;
      return source.slice(0, importIndex) + importStatement + source.slice(importIndex);
    }

    // 没有 import，查找第一个非注释/空行的位置
    const firstCodeLineMatch = source.match(/^(?!\/\/|\/\*|\*|\s*$)/m);
    if (firstCodeLineMatch) {
      // 插入到第一个代码行之前
      const codeIndex = firstCodeLineMatch.index!;
      return source.slice(0, codeIndex) + importStatement + source.slice(codeIndex);
    }

    // 直接添加到文件开头
    return importStatement + source;
  }

  return source;
};

export default completeReactLoader;