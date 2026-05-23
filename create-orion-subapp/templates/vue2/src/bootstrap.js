import Vue from 'vue';
import App from './App.vue';

/**
 * OrionMF Vue2 子应用生命周期钩子
 */

export async function bootstrap() {
  console.log('[{{PROJECT_NAME}}] bootstrap');
}

export async function mount(props) {
  const { container } = props;
  console.log('[{{PROJECT_NAME}}] mount', props);

  const instance = new Vue({
    render: (h) => h(App, { props }),
  }).$mount(container);

  return instance;
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