import { existsSync, readFileSync } from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';

const STUB_EXTERNALS = new Set(['next/link']);

function posixId(root: string, abs: string): string {
  return relative(root, abs).replace(/\\/g, '/');
}

function isNodeModuleFile(abs: string): boolean {
  return abs.replace(/\\/g, '/').includes('/node_modules/');
}

function collectImports(source: string): string[] {
  const specs: string[] = [];
  const re = /from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) specs.push(m[1]);
  return specs;
}

function collectRequires(source: string): string[] {
  const specs: string[] = [];
  const re = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) specs.push(m[1]);
  return specs;
}

function resolvePackageSpec(root: string, fromFile: string, spec: string): string | null {
  if (isBuiltin(spec) || spec.startsWith('node:')) return null;
  const bases: string[] = [];
  if (/\.(?:c|m)?js$/.test(fromFile)) bases.push(fromFile);
  bases.push(join(root, 'package.json'));
  for (const base of bases) {
    try {
      return createRequire(base).resolve(spec);
    } catch {
      /* try next resolution base */
    }
  }
  return null;
}

function resolveImport(root: string, fromFile: string, spec: string): string | null {
  if (STUB_EXTERNALS.has(spec)) return spec;
  if (isBuiltin(spec) || spec.startsWith('node:')) return null;

  let abs: string | null = null;
  if (spec.startsWith('@/')) {
    abs = join(root, spec.slice(2));
  } else if (spec.startsWith('.')) {
    abs = join(dirname(fromFile), spec);
  } else {
    return resolvePackageSpec(root, fromFile, spec);
  }

  const candidates = [
    abs,
    `${abs}.ts`,
    `${abs}.tsx`,
    `${abs}.js`,
    join(abs, 'index.ts'),
    join(abs, 'index.tsx'),
    join(abs, 'index.js'),
  ];
  for (const c of candidates) {
    if (existsSync(c) && !c.endsWith('.d.ts')) return c;
  }
  return resolvePackageSpec(root, fromFile, spec);
}

function cssModuleExports(css: string): string {
  const names = new Set<string>();
  const re = /\.([A-Za-z_][\w-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) names.add(m[1]);
  const entries = [...names].map((n) => `${JSON.stringify(n)}: ${JSON.stringify(n)}`).join(',');
  return `module.exports = {${entries}}; module.exports.default = module.exports;`;
}

function transpile(fileName: string, source: string): string {
  const stripped = source.replace(/^['"]use client['"];\s*/m, '');
  const result = ts.transpileModule(stripped, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      isolatedModules: true,
      skipLibCheck: true,
      strict: false,
    },
    reportDiagnostics: false,
  });
  return result.outputText;
}

export type LandscapeTickerBundle = {
  js: string;
  css: string;
  files: string[];
};

export function bundleLandscapeTickerHarness(root: string): LandscapeTickerBundle {
  return bundleReactHarness(root, {
    entryRel: 'tests/helpers/landscapeTickerHarnessEntry.tsx',
    exportName: 'LandscapeTickerHarness',
  });
}

export function bundleComparisonHarness(root: string): LandscapeTickerBundle {
  return bundleReactHarness(root, {
    entryRel: 'tests/helpers/comparisonHarnessEntry.tsx',
    exportName: 'ComparisonHarness',
  });
}

function rewriteRequires(
  root: string,
  fromFile: string,
  id: string,
  compiled: string,
): string {
  return compiled.replace(
    /require\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
    (_all, quote: string, spec: string) => {
      if (STUB_EXTERNALS.has(spec)) return `require(${quote}${spec}${quote})`;
      if (isBuiltin(spec) || spec.startsWith('node:')) {
        throw new Error(`Harness bundle cannot load Node builtin "${spec}" from ${id}`);
      }
      const resolved = resolveImport(root, fromFile, spec);
      if (!resolved) {
        throw new Error(`Harness bundle compile cannot resolve "${spec}" from ${id}`);
      }
      if (STUB_EXTERNALS.has(resolved)) return `require(${quote}${spec}${quote})`;
      return `require(${JSON.stringify(posixId(root, resolved))})`;
    },
  );
}

function bundleReactHarness(
  root: string,
  opts: { entryRel: string; exportName: string },
): LandscapeTickerBundle {
  const entry = join(root, opts.entryRel);
  const reactAbs = resolvePackageSpec(root, join(root, 'package.json'), 'react');
  const reactDomClientAbs = resolvePackageSpec(root, join(root, 'package.json'), 'react-dom/client');
  if (!reactAbs || !reactDomClientAbs) {
    throw new Error('Harness bundle cannot resolve installed react / react-dom/client');
  }

  const queue = [entry, reactAbs, reactDomClientAbs];
  const seen = new Set<string>();
  const cssChunks: string[] = [];
  const factories: string[] = [];
  const files: string[] = [];

  while (queue.length) {
    const file = queue.shift()!;
    const id = posixId(root, file);
    if (seen.has(id)) continue;
    seen.add(id);
    files.push(id);

    if (file.endsWith('.css')) {
      const css = readFileSync(file, 'utf8');
      cssChunks.push(css);
      factories.push(
        `${JSON.stringify(id)}: function(exports, require, module) {\n${cssModuleExports(css)}\n}`,
      );
      continue;
    }

    const source = readFileSync(file, 'utf8');
    const fromNodeModules = isNodeModuleFile(file);
    const specs = fromNodeModules
      ? collectRequires(source)
      : [...collectImports(source), ...(file.endsWith('.tsx') ? ['react'] : [])];

    for (const spec of specs) {
      if (STUB_EXTERNALS.has(spec) || isBuiltin(spec) || spec.startsWith('node:')) continue;
      const resolved = resolveImport(root, file, spec);
      if (!resolved) {
        if (fromNodeModules) continue;
        throw new Error(`Harness bundle cannot resolve "${spec}" from ${id}`);
      }
      if (!STUB_EXTERNALS.has(resolved)) queue.push(resolved);
    }

    let compiled: string;
    if (fromNodeModules) {
      compiled = source;
    } else {
      compiled = transpile(file, source);
      if (file.endsWith('.tsx')) {
        compiled = `var React = require("react");\n${compiled}`;
      }
    }
    compiled = rewriteRequires(root, file, id, compiled);

    factories.push(
      `${JSON.stringify(id)}: function(exports, require, module) {\n${compiled}\n}`,
    );
  }

  const entryId = posixId(root, entry);
  const reactId = posixId(root, reactAbs);
  const reactDomClientId = posixId(root, reactDomClientAbs);
  const js = `
(function() {
  var process = { env: { NODE_ENV: 'development' } };
  function LinkStub(props) {
    var href = props.href;
    var children = props.children;
    var rest = Object.assign({}, props);
    delete rest.href;
    delete rest.children;
    var React = require(${JSON.stringify(reactId)});
    return React.createElement('a', Object.assign({ href: href }, rest), children);
  }
  var externals = {
    'next/link': { __esModule: true, default: LinkStub }
  };
  var factories = {${factories.join(',\n')}};
  var cache = {};
  function require(id) {
    if (externals[id]) return externals[id];
    if (cache[id]) return cache[id].exports;
    var factory = factories[id];
    if (!factory) throw new Error('Missing module ' + id);
    var module = { exports: {} };
    cache[id] = module;
    factory(module.exports, require, module);
    return module.exports;
  }
  var React = require(${JSON.stringify(reactId)});
  var ReactDOMClient = require(${JSON.stringify(reactDomClientId)});
  var createRoot = ReactDOMClient.createRoot || (ReactDOMClient.default && ReactDOMClient.default.createRoot);
  if (typeof createRoot !== 'function') {
    throw new Error('Installed react-dom/client does not export createRoot');
  }
  var entry = require(${JSON.stringify(entryId)});
  var Harness = entry[${JSON.stringify(opts.exportName)}] || entry.default;
  var rootEl = document.getElementById('root');
  createRoot(rootEl).render(React.createElement(Harness));
})();
`;

  return { js, css: cssChunks.join('\n'), files };
}
