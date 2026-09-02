// The commit form.
//
// THE HAZARD IT REMOVES. The message field committed ON BLUR: clicking anywhere
// else while text was in the box wrote a commit nobody had asked for. Enter and
// Escape were documented, blur was not, and it was the easiest of the three to
// trigger by accident. Blur now does nothing at all -- leaving the field is not
// a decision, and a commit is.
//
// WHAT ELSE WAS MISSING. A bare input with a placeholder and no buttons: no way
// to confirm by pointer, no way to cancel except a key, no sign of how many
// changes were about to be swept in, and no sign that a commit was running.
//
// NOT VERIFIED IN A RUNNING WINDOW. Source assertions.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const SB = fs
  .readFileSync(path.join(AKAR, "public", "app", "Sidebar.tsx"), "utf8")
  .replace(/\r\n/g, "\n");
const CSS = fs.readFileSync(path.join(AKAR, "public", "styles.css"), "utf8");

// Never assert against a comment that merely names the thing being asserted.
const bersih = SB.split("\n")
  .filter((b: string) => !/^\s*(\/\/|\*)/.test(b))
  .join("\n");

describe("form commit", () => {
  test("leaving the field NEVER commits", () => {
    // This is the whole point of the change.
    const m = bersih.match(/\{committing && \([\s\S]*?\n      \)\}/);
    expect(m).toBeTruthy();
    expect(m![0]).not.toMatch(/onBlur/);
  });

  test("the message is state, so a button can read it", () => {
    // A bare uncontrolled input can only be submitted from its own key
    // handler, which is why the original had nothing but Enter.
    expect(bersih).toMatch(/const \[pesanCommit, setPesanCommit\]/);
    expect(bersih).toMatch(/value=\{pesanCommit\}/);
  });

  test("Enter and Escape still work", () => {
    const m = bersih.match(/\{committing && \([\s\S]*?\n      \)\}/);
    expect(m![0]).toMatch(/e\.key === "Enter"/);
    expect(m![0]).toMatch(/e\.key === "Escape"/);
  });

  test("there is an explicit Commit and an explicit Cancel", () => {
    const m = bersih.match(/\{committing && \([\s\S]*?\n      \)\}/);
    expect(m![0]).toMatch(/onClick=\{\(\) => doCommit\(pesanCommit\)\}/);
    expect(m![0]).toMatch(/onClick=\{\(\) => setCommitting\(false\)\}/);
    expect(m![0]).toMatch(/Cancel/);
  });

  test("Commit is refused without a message, and says why", () => {
    // doCommit already treats an empty message as cancel; the button should
    // not pretend to be available in the first place.
    const m = bersih.match(/\{committing && \([\s\S]*?\n      \)\}/);
    expect(m![0]).toMatch(/disabled=\{busy \|\| !pesanCommit\.trim\(\)\}/);
    expect(m![0]).toMatch(/A message is required/);
  });

  test("it says how many changes are going in, and onto which branch", () => {
    const m = bersih.match(/\{committing && \([\s\S]*?\n      \)\}/);
    expect(m![0]).toMatch(/"Commit " \+ g\.dirtyCount/);
    expect(m![0]).toMatch(/br && br\.current/);
  });

  test("a commit in flight says so", () => {
    const m = bersih.match(/\{committing && \([\s\S]*?\n      \)\}/);
    expect(m![0]).toMatch(/busy \? "Committing/);
  });

  test("opening the form clears the previous message", () => {
    // Otherwise yesterday's text is sitting there, one Enter from being used
    // as today's commit message.
    expect(bersih).toMatch(
      /setPesanCommit\(""\);\s*\n\s*setCommitting\(true\)/,
    );
  });

  test("a disabled Commit does not light up under the pointer", () => {
    // A control that brightens while refusing to act gets clicked repeatedly.
    expect(CSS).toMatch(/\.git-utama:not\(:disabled\):hover/);
  });
});
