#!/usr/bin/env node

/**
 * OrionMF 子应用脚手架入口
 *
 * 使用方式：
 *   npx create-orion-subapp my-subapp
 *   npx create-orion-subapp my-subapp --template react
 *   npx create-orion-subapp my-subapp --template vue3
 */

import { createApp } from './create-app.js';

const args = process.argv.slice(2);
const projectName = args[0];
const options = parseOptions(args);

createApp(projectName, options).catch((err) => {
  console.error('创建失败:', err.message);
  process.exit(1);
});

function parseOptions(args) {
  const options = {
    template: 'react',
    force: false,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--template' || arg === '-t') {
      options.template = args[++i] || 'react';
    } else if (arg === '--force' || arg === '-f') {
      options.force = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
OrionMF 子应用脚手架

使用方法:
  npx create-orion-subapp <project-name> [选项]

选项:
  -t, --template <模板>   模板类型: react, vue2, vue3, vanilla (默认: react)
  -f, --force             强制覆盖已存在的目录
  -h, --help              显示帮助信息

示例:
  npx create-orion-subapp my-app
  npx create-orion-subapp my-app --template vue3
  npx create-orion-subapp my-app -t react -f
      `);
      process.exit(0);
    }
  }

  return options;
}