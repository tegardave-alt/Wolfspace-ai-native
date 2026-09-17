// web_fetch returns Markdown, not innerText.
//
// WHY THIS CHANGED. web_fetch used to give the model document.body.innerText:
// the visible words with the structure discarded -- no links (so the agent
// could not follow anything), no code blocks (documentation arrived as prose),
// no tables. Modern agents, and Claude's own web fetch, hand the model
// Markdown, which keeps that structure while staying far lighter than raw HTML.
// The conversion is htmlToMarkdown in agent/web.ts, and BOTH fetch engines --
// Playwright and the HTTP fallback -- go through it, so there is one shape of
// output and no lingering innerText branch.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const { htmlToMarkdown } = require(path.join(AKAR, "agent", "web.ts"));

describe("htmlToMarkdown", () => {
  test("keeps links as [text](href) -- the thing innerText threw away", () => {
    const md = htmlToMarkdown(
      '<p>see <a href="https://ex.com/doc">the guide</a> now</p>',
    );
    expect(md).toContain("[the guide](https://ex.com/doc)");
  });

  test("keeps code blocks as fences, with the language from the class", () => {
    const md = htmlToMarkdown(
      '<pre><code class="language-js">const x = 1;\nconsole.log(x);</code></pre>',
    );
    expect(md).toMatch(/```js\nconst x = 1;\nconsole\.log\(x\);\n```/);
  });

  test("a '<' inside code is not eaten as a tag", () => {
    const md = htmlToMarkdown("<pre><code>if (a &lt; b) return;</code></pre>");
    expect(md).toContain("if (a < b) return;");
  });

  test("inline code becomes backticks", () => {
    expect(htmlToMarkdown("<p>run <code>npm ci</code></p>")).toContain(
      "`npm ci`",
    );
  });

  test("headings, bold and italic", () => {
    const md = htmlToMarkdown(
      "<h2>Title</h2><p><strong>bold</strong> and <em>it</em></p>",
    );
    expect(md).toContain("## Title");
    expect(md).toContain("**bold**");
    expect(md).toContain("*it*");
  });

  test("lists become - items", () => {
    const md = htmlToMarkdown("<ul><li>one</li><li>two</li></ul>");
    expect(md).toContain("- one");
    expect(md).toContain("- two");
  });

  test("tables become Markdown tables with a header rule", () => {
    const md = htmlToMarkdown(
      "<table><tr><th>Name</th><th>Port</th></tr><tr><td>web</td><td>3000</td></tr></table>",
    );
    expect(md).toContain("| Name | Port |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| web | 3000 |");
  });

  test("images become ![alt](src)", () => {
    expect(htmlToMarkdown('<img alt="logo" src="/a.png">')).toContain(
      "![logo](/a.png)",
    );
  });

  test("blockquote becomes >", () => {
    expect(htmlToMarkdown("<blockquote>quoted</blockquote>")).toMatch(
      /^> quoted/m,
    );
  });

  test("script, style and head are removed entirely", () => {
    const md = htmlToMarkdown(
      "<head><title>t</title></head><body><script>alert(1)</script><style>.a{}</style><p>real</p></body>",
    );
    expect(md).toContain("real");
    expect(md).not.toMatch(/alert|\.a\{/);
  });

  test("entities are decoded", () => {
    expect(htmlToMarkdown("<p>a &amp; b &lt; c &quot;d&quot;</p>")).toContain(
      'a & b < c "d"',
    );
  });

  test("single-quoted attributes work too", () => {
    expect(htmlToMarkdown("<a href='https://x.io'>x</a>")).toContain(
      "[x](https://x.io)",
    );
  });

  test("a link with no href degrades to its text, not a broken []()", () => {
    const md = htmlToMarkdown("<a>just text</a>");
    expect(md).toContain("just text");
    expect(md).not.toContain("]()");
  });

  test("collapses runs of blank lines", () => {
    expect(htmlToMarkdown("<p>a</p><p></p><p></p><p>b</p>")).not.toMatch(
      /\n{3,}/,
    );
  });
});

describe("both fetch engines go through it (no innerText branch left)", () => {
  const SRC = fs.readFileSync(path.join(AKAR, "agent", "web.ts"), "utf8");

  test("the Playwright path takes innerHTML and converts", () => {
    expect(SRC).toMatch(/document\.body \? document\.body\.innerHTML : ""/);
    expect(SRC).toMatch(/return trunc\(htmlToMarkdown\(html\), 8000\)/);
  });

  test("the HTTP fallback converts the same way", () => {
    expect(SRC).toMatch(/resolve\(trunc\(htmlToMarkdown\(body\), 8000\)/);
  });

  test("web_fetch no longer reads body.innerText", () => {
    // webExtract still uses innerText for a single element on purpose; this
    // guards the FETCH path -- the two innerText reads that remain are in
    // webExtract's element/body helpers, not in the fetch engines.
    expect(SRC).not.toMatch(/document\.body\.innerText/);
  });
});
