import { mount } from 'svelte';
import './styles/global.css';
import App from './App.svelte';

const target = document.getElementById('app');

if (!target) {
  throw new Error('No se encontró el punto de montaje #app.');
}

const app = mount(App, { target });

export default app;
