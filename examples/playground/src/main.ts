import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { devtoolsPlugin } from './devtools'

createApp(App).use(devtoolsPlugin).mount('#app')
