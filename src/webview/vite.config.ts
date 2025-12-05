import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    vue(),
    // 内联所有资源到 HTML
    {
      name: 'inline-all',
      enforce: 'post',
      generateBundle(_, bundle) {
        const htmlFile = Object.keys(bundle).find(k => k.endsWith('.html'));
        const jsFiles = Object.keys(bundle).filter(k => k.endsWith('.js'));
        const cssFiles = Object.keys(bundle).filter(k => k.endsWith('.css'));
        
        if (htmlFile) {
          let html = (bundle[htmlFile] as any).source as string;
          
          // 内联 JS
          for (const jsFile of jsFiles) {
            const js = (bundle[jsFile] as any).code;
            // 更灵活的匹配模式
            const scriptTagRegex = new RegExp(`<script[^>]*src="[^"]*${jsFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*></script>`, 'g');
            const inlineScript = `<script type="module">${js}</script>`;
            html = html.replace(scriptTagRegex, inlineScript);
            delete bundle[jsFile];
          }
          
          // 内联 CSS
          for (const cssFile of cssFiles) {
            const css = (bundle[cssFile] as any).source;
            const linkTag = new RegExp(`<link[^>]*href="[^"]*${cssFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`);
            const inlineStyle = `<style>${css}</style>`;
            html = html.replace(linkTag, inlineStyle);
            delete bundle[cssFile];
          }
          
          (bundle[htmlFile] as any).source = html;
        }
      }
    }
  ],
  build: {
    outDir: '../../dist/webview',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        inlineDynamicImports: true
      }
    }
  },
  base: './'
});

