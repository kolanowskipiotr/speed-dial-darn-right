import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.join(__dirname, '../vendor');

if (!fs.existsSync(vendorDir)) {
  fs.mkdirSync(vendorDir);
}

// 1. Download simple libraries
async function download(url, filename) {
  console.log(`Downloading ${url}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${url}: ${res.statusText}`);
    let buffer = Buffer.from(await res.arrayBuffer());
    let content = buffer.toString();
    // Remove source mapping URLs to prevent console warnings
    content = content.replace(/\/\/# sourceMappingURL=.*/g, '');
    fs.writeFileSync(path.join(vendorDir, filename), content);
  } catch (err) {
    console.error(`Error downloading ${url}: ${err.message}`);
    // Create empty file to prevent build failure if it's optional
    fs.writeFileSync(path.join(vendorDir, filename), '');
  }
}

await download('https://cdn.jsdelivr.net/npm/marked/marked.min.js', 'marked.min.js');
await download('https://cdn.jsdelivr.net/npm/split.js/dist/split.min.js', 'split.min.js');
await download('https://accounts.google.com/gsi/client', 'gsi-client.js');

// 2. Download Fonts (DM Sans and DM Mono)
const fonts = [
  { name: 'DM-Sans-300', url: 'https://fonts.gstatic.com/s/dmsans/v14/rP2Hp2ywxg089UriCZOIHTED.woff2' },
  { name: 'DM-Sans-400', url: 'https://fonts.gstatic.com/s/dmsans/v14/rP2Hp2ywxg089UriCZOIHTED.woff2' },
  { name: 'DM-Sans-500', url: 'https://fonts.gstatic.com/s/dmsans/v14/rP2Fp2ywxg089UriCZOIHUfDBlC6fA.woff2' },
  { name: 'DM-Sans-600', url: 'https://fonts.gstatic.com/s/dmsans/v14/rP2Fp2ywxg089UriCZOIHVPABlC6fA.woff2' },
  { name: 'DM-Mono-400', url: 'https://fonts.gstatic.com/s/dmmono/v14/n6KnRnS8c_P7al06rGfMJf9v.woff2' },
  { name: 'DM-Mono-500', url: 'https://fonts.gstatic.com/s/dmmono/v14/n6KnRnS8c_P7al06rGfMJTlvWQ.woff2' },
];

let fontsCss = '';
for (const font of fonts) {
  const filename = `${font.name}.woff2`;
  await download(font.url, filename);
  const family = font.name.startsWith('DM-Sans') ? 'DM Sans' : 'DM Mono';
  const weight = font.name.split('-').pop();
  fontsCss += `@font-face {
    font-family: '${family}';
    font-style: normal;
    font-weight: ${weight};
    font-display: swap;
    src: url(/vendor/${filename}) format('woff2');
  }\n`;
}
fs.writeFileSync(path.join(vendorDir, 'fonts.css'), fontsCss);

// 3. Bundle CodeMirror Packages individually
const packages = [
  '@codemirror/view',
  '@codemirror/state',
  '@codemirror/commands',
  '@codemirror/lang-markdown',
  '@codemirror/theme-one-dark',
  '@codemirror/language',
  '@codemirror/search',
  '@codemirror/lang-json',
  '@codemirror/lang-xml',
  '@codemirror/lang-html',
  '@codemirror/lang-javascript'
];

console.log('Bundling CodeMirror packages...');
for (const pkg of packages) {
  const outfile = pkg.replace('/', '-') + '.js';
  console.log(`Bundling ${pkg} -> ${outfile}`);
  await esbuild.build({
    entryPoints: [pkg],
    bundle: true,
    minify: true,
    format: 'esm',
    outfile: path.join(vendorDir, outfile),
    // Mark other codemirror packages as external to keep bundles small and deduplicated
    external: packages.filter(p => p !== pkg),
  });
}

console.log('Done!');
