import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      proxy: {
        '/api': {
          // Usa la variable de entorno o un valor por defecto
          target: env.API_URL || 'http://backend:3000',
          changeOrigin: true,
        },
        '/import': {
          target: env.API_URL || 'http://backend:3000',
          changeOrigin: true,
        }
      },
      host: true, 
      port: 5173,
    },
  };
});
