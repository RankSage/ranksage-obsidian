import esbuild from 'esbuild';
import process from 'process';

const isWatch = process.argv.includes('--watch');

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    // Obsidian core modules — provided by the Obsidian runtime at load time
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/closebrackets',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/comment',
    '@codemirror/fold',
    '@codemirror/gutter',
    '@codemirror/highlight',
    '@codemirror/history',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/matchbrackets',
    '@codemirror/panel',
    '@codemirror/rangeset',
    '@codemirror/rectangular-selection',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/stream-parser',
    '@codemirror/text',
    '@codemirror/tooltip',
    '@codemirror/view',
    'node:*',
  ],
  format: 'cjs',
  target: 'ES2018',
  logLevel: 'info',
  sourcemap: 'inline',
  treeShaking: true,
  outfile: 'main.js',
});

if (isWatch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
