var fs=require('fs');  
var c=fs.readFileSync('web/app.jsx','utf8');  
// Bug #4: openCanvas A2UI_STREAMING  
var o1=\"const state = p.flutter\n      ? { flutter: p.source, doc: FLUTTER_COMPILING, files: p.files }\n      : { doc: p.doc || FLUTTER_COMPILING, run };\"  
var n1=\"const state = p.flutter\n      ? { flutter: p.source, doc: p.a2ui ? A2UI_STREAMING : FLUTTER_COMPILING, files: p.files }\n      : { doc: p.doc || FLUTTER_COMPILING, run };\"  
c=c.replace(o1,n1);console.log('Bug4:',c.includes(o1));  
