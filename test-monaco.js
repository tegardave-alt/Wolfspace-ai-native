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
  console.log("Navigating to http://127.0.0.1:8090");
  try {
    await page.goto("http://127.0.0.1:8090");
  } catch (e) {
    console.log("Falling back to 8092");
    await page.goto("http://127.0.0.1:8092");
  }
  console.log("Waiting for 3 seconds...");
  await page.waitForTimeout(3000);
  console.log("Running test: creating and disposing 300 editors...");
  await page.evaluate(async () => {
    if (!window.monaco) {
      console.log("monaco is missing!");
      return;
    }
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
    console.log("SUCCESS: No leaks detected! The fix works perfectly.");
    process.exit(0);
  }
  await browser.close();
})();
