const esbuild = require('esbuild')

esbuild.buildSync({
  entryPoints: ['src/app.js'],
  bundle: true,
  outfile: 'app.js',
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
})

console.log('bundled app.js')
