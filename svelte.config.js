// Used by svelte-check (npm run check). The build passes its own preprocess options in rollup.config.js.
import sveltePreprocess from 'svelte-preprocess';

export default { preprocess: sveltePreprocess() };
