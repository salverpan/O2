const esbuild = require('esbuild')
const path = require('path')

const vueEsmBundler = path.resolve(__dirname, 'node_modules/vue/dist/vue.esm-bundler.js')

esbuild.build({
  entryPoints: ['src/app.js'],
  bundle: true,
  outfile: 'app.js',
  format: 'iife',
  plugins: [
    {
      name: 'exact-vue-alias',
      setup(build) {
        build.onResolve({ filter: /^vue$/ }, () => ({ path: vueEsmBundler }))
      },
    },
  ],
  define: {
    'process.env.NODE_ENV': '"production"',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
}).then(() => {
  console.log('bundled app.js')
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
