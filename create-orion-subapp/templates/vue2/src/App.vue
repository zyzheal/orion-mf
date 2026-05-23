<template>
  <div class="app">
    <h1>Hello from {{PROJECT_NAME}}</h1>
    <p>This is a Vue 2 sub-app running in OrionMF.</p>
  </div>
</template>

<script>
export default {
  name: 'App',
  props: {
    container: Object,
  },
};
</script>

<style scoped>
.app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 24px;
}
h1 {
  color: #3370e6;
  margin-bottom: 8px;
}
</style>
