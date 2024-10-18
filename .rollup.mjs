export default {
	input: 'index.js',
	output: [
		{ file: 'index.cjs.js', format: 'cjs', sourcemap: true, exports: 'auto' },
		{ file: 'index.es.mjs', format: 'esm', sourcemap: true, exports: 'auto' }
	],
};
