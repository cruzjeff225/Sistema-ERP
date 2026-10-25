const { cpSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname,'..');
const target = resolve(root,'dist/src/assets');
mkdirSync(target,{recursive:true});
cpSync(resolve(root,'src/assets'),target,{recursive:true});
console.log('PDF runtime assets copied.');
