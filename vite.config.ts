import { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig, loadEnv } from 'vite'
import analyzer from 'vite-bundle-analyzer'
import glsl from 'vite-plugin-glsl'
// import viteBasicSslPlugin from "@vitejs/plugin-basic-ssl";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    plugins: [
      react({}),
      tailwindcss(),
      glsl({
        minify: command === 'build' || Boolean(env.VITE_COMPRESS_GLSL),
      }),
      ...(mode === 'analyze' || env.VITE_ANALYZE_BUNDLE ? [analyzer()] : []),
      // viteBasicSslPlugin()
    ],
    build: {
      rollupOptions: {
        input: {
          app: resolve(__dirname, 'index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './app'),
        '√': resolve(__dirname, './voroforce'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      // The anime pipeline writes into data/ and public/media|json while the
      // dev server runs; without this each write triggers a full page reload.
      watch: {
        ignored: ['**/data/**', '**/public/media/**', '**/public/json/**'],
      },
      headers: {
        // Every image is served from this site now, so the strict policy works
        // everywhere - Safari does not support credentialless.
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
  }
})
