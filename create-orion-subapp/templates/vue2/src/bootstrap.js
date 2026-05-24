import Vue from 'vue';
import App from './App.vue';

/**
 * OrionMF Vue2 子应用生命周期钩子
 */

export async function bootstrap() {
  console.log('[{{PROJECT_NAME}}] bootstrap');
}

let instance = null;

export async function mount(props) {
  const { container } = props;
  console.log('[{{PROJECT_NAME}}] mount', props);

  instance = new Vue({
    render: (h) => h(App, { props }),
  }).$mount(container);

  return instance;
}

export async function unmount(props) {
  console.log('[{{PROJECT_NAME}}] unmount', props);

  if (instance) {
    instance.$destroy();
    instance = null;
  }
}

// 开发环境直接挂载
if (process.env.NODE_ENV === 'development') {
  const container = document.getElementById('app');
  if (container) {
    mount({ container });
  }
}