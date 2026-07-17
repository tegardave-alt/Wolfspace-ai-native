require('http').get('http://localhost:8090/studio/', function(r) {
  var d = '';
  r.on('data', function(c) { d += c; });
  r.on('end', function() {
    console.log('Status:', r.statusCode);
    console.log('Length:', d.length);
    console.log('Body:', d.substring(0, 200));
  });
}).on('error', function(e) {
  console.log('Error:', e.message);
});
