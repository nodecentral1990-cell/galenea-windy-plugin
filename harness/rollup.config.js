// Builds the test page bundle: the real plugin with Windy modules replaced by harness/stubs.
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import rollupSvelte from 'rollup-plugin-svelte';
import rollupSwc from 'rollup-plugin-swc3';
import { less } from 'svelte-preprocess-less';
import sveltePreprocess from 'svelte-preprocess';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const stubs = {
    name: 'windy-stubs',
    resolveId(id) {
        if (id.startsWith('@windy/')) return path.join(here, 'stubs', id.slice(7) + '.ts');
        return null;
    },
};

export default {
    input: path.join(here, 'main.ts'),
    output: { file: path.join(here, 'dist/harness.js'), format: 'iife', sourcemap: false },
    onwarn: () => {},
    plugins: [
        stubs,
        rollupSvelte({
            emitCss: false,
            preprocess: { style: less({ math: 'always' }), script: data => sveltePreprocess().script(data) },
        }),
        rollupSwc({ include: ['**/*.ts', '**/*.svelte'] }),
        resolve({ browser: true, extensions: ['.mjs', '.js', '.ts', '.json'], dedupe: ['svelte'] }),
        commonjs(),
    ],
};
