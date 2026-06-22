// build.mjs — compile src/app.jsx -> app.js as a static, CSP-friendly bundle.
// Classic JSX transform (React.createElement) so we use the global React UMD build,
// no in-browser Babel, no eval. Run: npm run build
import { build } from 'esbuild';

await build({
  entryPoints: ['src/app.jsx'],
  bundle: true,
  outfile: 'app.js',
  format: 'iife',
  target: ['es2018'],
  jsx: 'transform',          // classic runtime -> React.createElement
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  minify: true,
  legalComments: 'none',
  // React / ReactDOM / jsPDF are provided as globals by <script> tags in index.html.
  define: { 'process.env.NODE_ENV': '"production"' },
});
console.log('Built app.js');
