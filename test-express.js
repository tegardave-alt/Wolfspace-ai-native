const express = require("express");
const app = express();
app.use(express.static("public"));
const server = app.listen(8199, () => {
  const { chromium } = require("@playwright/test");
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
        <script src="http://localhost:8199/vendor/monaco/vs/loader.js"></script>
      </head>
      <body>
        <script>
          require.config({ paths: { 'vs': 'http://localhost:8199/vendor/monaco/vs' }});
          require(['vs/editor/editor.main'], function() {
            window.monacoReady = true;
          });
        </script>
      </body>
      </html>
    `;

    await page.setContent(html);
    console.log("Waiting for Monaco to load via local express server...");
    await page.waitForFunction(() => window.monacoReady, { timeout: 10000 });
    console.log("Running test: creating and disposing 350 editors...");
    await page.evaluate(async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      for (let i = 0; i < 350; i++) {
        const el = document.createElement("div");
        container.appendChild(el);
        const ed = window.monaco.editor.create(el, {
          value: "test " + i,
          language: "javascript",
        });
        // The fix we implemented:
        const model = ed.getModel();
        if (model) model.dispose();
        ed.dispose();
      }
    });
    await new Promise((r) => setTimeout(r, 1000));
    if (leakDetected) {
      console.log("FAIL: Leak was detected!");
    } else {
      console.log(
        "SUCCESS: No leaks detected! The fix works perfectly even with 350 editors.",
      );
    }
    await browser.close();
    server.close();
    process.exit(leakDetected ? 1 : 0);
  })();
});
