import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import path from 'node:path';
export default defineConfig({root:'github-app',base:'./',plugins:[react()],resolve:{alias:{'@':path.resolve(import.meta.dirname)}},build:{outDir:'../github-dist',emptyOutDir:true},publicDir:'../public'});
