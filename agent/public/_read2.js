var s=require(`fs`).readFileSync(`C:/Users/dave/quantum/public/app.jsx`,`utf8`).split(`\n`);
s.slice(5755,5776).forEach(function(l,i){
  console.log((5756+i)+`: `+l.slice(0,130));
});
