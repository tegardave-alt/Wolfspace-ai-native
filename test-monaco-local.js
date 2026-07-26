const { chromium } = require("@playwright/test");
const path = require("path");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let leakDetected = false;
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("LEAK detected")) {
      leakDetected = true;
      console.log("[BROWSER] " + text);
    }
  });
  page.on("pageerror", (err) => {
    if (err.message.includes("LEAK detected")) {
      leakDetected = true;
    }
    console.log("[BROWSER ERROR] " + err.message);
  });

  const html = `\
    <!DOCTYPE html>
    <html>
    <head>
      <script src="file:///${path.resolve("public/vendor/monaco/vs/loader.js").replace(/\\\\/g, "/")}"></script>
    </head>
    <body>
      <script>
        require.config({ paths: { 'vs': 'file:///${path.resolve("public/vendor/monaco/vs").replace(/\\\\/g, "/")}' }});
        require(['vs/editor/editor.main'], function() {
          window.monacoReady = true;
        });
      </script>
    </body>
    </html>
  `;

  await page.setContent(html);
  console.log("Waiting for Monaco to load locally...");
  await page.waitForFunction(() => window.monacoReady, { timeout: 10000 });
  console.log("Running test: creating and disposing 300 editors...");
  await page.evaluate(async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    for (let i = 0; i < 300; i++) {
      const el = document.createElement("div");
      container.appendChild(el);
      const ed = window.monaco.editor.create(el, {
        value: "test " + i,
        language: "javascript",
      });
      const model = ed.getModel();
      if (model) model.dispose();
      ed.dispose();
    }
  });
  await new Promise((r) => setTimeout(r, 2000));
  if (leakDetected) {
    console.log("FAIL: Leak was detected!");
    process.exit(1);
  } else {
    console.log(
      "SUCCESS: No leaks detected, even after 300 editors. The fix works perfectly.",
    );
    process.exit(0);
  }
  await browser.close();
})();
