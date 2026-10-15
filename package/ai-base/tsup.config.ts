import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'antd',
    '@ant-design/icons',
    '@ant-design/x',
    '@ant-design/x-sdk',
    '@ant-design/x-markdown',
    '@ant-design/x-card',
    '@antv/gpt-vis',
    '@cordisjs/core',
    'ajv',
  ],
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.css': 'empty',
    };
  },
});
