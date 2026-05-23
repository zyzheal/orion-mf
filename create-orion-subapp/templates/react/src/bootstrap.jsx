import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/**
 * OrionMF 子应用生命周期钩子
 */

export async function bootstrap() {
  console.log('[{{PROJECT_NAME}}] bootstrap');
}

export async function mount(props) {
  const { container } = props;
  console.log('[{{PROJECT_NAME}}] mount', props);

  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <App {...props} />
    </React.StrictMode>
  );

  return root;
}

export async function unmount(props) {
  const { container } = props;
  console.log('[{{PROJECT_NAME}}] unmount', props);

  ReactDOM.createRoot(container).unmount();
}

// 开发环境直接挂载
if (process.env.NODE_ENV === 'development') {
  const container = document.getElementById('app');
  if (container) {
    mount({ container });
  }
}