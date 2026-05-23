/**
 * OrionMF Vanilla 子应用生命周期钩子
 */

export async function bootstrap() {
  console.log('[{{PROJECT_NAME}}] bootstrap');
}

export async function mount(props) {
  const { container } = props;
  console.log('[{{PROJECT_NAME}}] mount', props);

  // 渲染应用
  container.innerHTML = `
    <div class="app">
      <h1>Hello from {{PROJECT_NAME}}</h1>
      <p>This is a Vanilla JS sub-app running in OrionMF.</p>
    </div>
  `;

  return container;
}

export async function unmount(props) {
  const { container } = props;
  console.log('[{{PROJECT_NAME}}] unmount', props);

  container.innerHTML = '';
}

// 开发环境直接挂载
if (process.env.NODE_ENV === 'development') {
  const container = document.getElementById('app');
  if (container) {
    mount({ container });
  }
}