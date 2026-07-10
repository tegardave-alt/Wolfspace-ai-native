'use strict';

/**
 * POST /run - Run one code block manually
 */
function handleRun(req, res, deps) {
  if (req.method !== 'POST' || req.url !== '/run') return false;
  
  const { detectLang, reconcileLang, launchesShell, opensGuiWindow, runByLang, analyzeCode } = deps;
  let body = '';
  
  req.on('data', c => body += c);
  req.on('end', async () => {
    let r;
    try {
      const { language, code } = JSON.parse(body);
      let lang = detectLang(language, code || '');
      lang = reconcileLang(lang, code || '');
      
      if (launchesShell(code || '')) {
        r = {
          ok: false,
          language: lang,
          skipped: true,
          error: 'Eksekusi diblokir: kode ini menjalankan proses/shell eksternal atau membuka Python interaktif. Jalankan di terminal secara manual.'
        };
      } else if (opensGuiWindow(lang, code || '')) {
        r = {
          ok: false,
          language: lang,
          skipped: true,
          error: 'Eksekusi diblokir: kode ini membuka jendela GUI desktop (Swing/tkinter/JavaFX) yang akan menggantung sampai timeout. Untuk UI visual gunakan mode Web Dev (Canvas), atau jalankan file-nya manual di luar WOLFSPACE.'
        };
      } else {
        r = await runByLang(lang, code);
        r.language = lang;
        r.quality = analyzeCode(lang, code || '');
      }
    } catch (e) {
      r = { ok: false, error: 'bad request: ' + e.message };
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(r));
  });
  
  return true;
}

module.exports = { handleRun };

