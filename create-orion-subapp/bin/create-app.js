/**
 * OrionMF 子应用创建核心逻辑
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import inquirer from 'inquirer';
import ora from 'ora';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 模板目录
const TEMPLATES = {
  react: 'templates/react',
  vue2: 'templates/vue2',
  vue3: 'templates/vue3',
  vanilla: 'templates/vanilla',
};

/**
 * 创建子应用
 */
export async function createApp(projectName, options = {}) {
  if (!projectName) {
    projectName = await promptProjectName();
  }

  if (!options.template) {
    options.template = await promptTemplate();
  }

  const targetDir = path.resolve(process.cwd(), projectName);

  // 检查目录是否存在
  if (fs.existsSync(targetDir) && !options.force) {
    const { overwrite } = await inquirer.prompt([
      {
        name: 'overwrite',
        type: 'confirm',
        message: `目录 ${projectName} 已存在，是否覆盖？`,
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log('已取消创建');
      return;
    }
  }

  const spinner = ora('正在创建子应用...').start();

  try {
    // 创建目录
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 复制模板
    const templateDir = path.join(__dirname, '..', TEMPLATES[options.template]);
    copyTemplate(templateDir, targetDir, projectName, options);

    spinner.succeed(`子应用 ${projectName} 创建成功！`);

    // 输出后续步骤
    console.log(`
后续步骤:
  cd ${projectName}
  npm install
  npm run dev
`);
  } catch (err) {
    spinner.fail('创建失败: ' + err.message);
    throw err;
  }
}

/**
 * 提示输入项目名称
 */
async function promptProjectName() {
  const { name } = await inquirer.prompt([
    {
      name: 'name',
      type: 'input',
      message: '请输入子应用名称:',
      validate: (input) => {
        if (!input) return '请输入名称';
        if (!/^[a-z0-9-]+$/.test(input)) return '只能使用小写字母、数字和连字符';
        return true;
      },
    },
  ]);
  return name;
}

/**
 * 提示选择模板
 */
async function promptTemplate() {
  const { template } = await inquirer.prompt([
    {
      name: 'template',
      type: 'list',
      message: '请选择框架模板:',
      choices: [
        { name: 'React', value: 'react' },
        { name: 'Vue 3', value: 'vue3' },
        { name: 'Vue 2', value: 'vue2' },
        { name: 'Vanilla (原生)', value: 'vanilla' },
      ],
      default: 'react',
    },
  ]);
  return template;
}

/**
 * 复制模板文件
 */
function copyTemplate(srcDir, destDir, projectName, options) {
  const files = fs.readdirSync(srcDir);

  for (const file of files) {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(destDir, file);

    if (fs.statSync(srcPath).isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyTemplate(srcPath, destPath, projectName, options);
    } else {
      // 读取文件内容并替换占位符
      let content = fs.readFileSync(srcPath, 'utf-8');
      content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
      content = content.replace(/\{\{TEMPLATE\}\}/g, options.template);

      fs.writeFileSync(destPath, content);
    }
  }
}