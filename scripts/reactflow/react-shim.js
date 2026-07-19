// 'react' di-resolve ke React global UMD (window.React) yang sudah dimuat WOLFSPACE,
// jadi React TIDAK ikut dibundel dan instance-nya SAMA dengan app.jsx (hooks tak pecah).
module.exports = window.React;
