 import { defineConfig } from 'vite';

 export default defineConfig({
     server: {
         proxy: {
             '/api': {
                 target: 'http://backend:3000',
             },
             '/import': {
                 target: 'http://backend:3000',
                 changeOrigin: true,
             }
         },
     },
 });