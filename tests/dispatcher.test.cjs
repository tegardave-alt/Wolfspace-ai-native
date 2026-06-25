const { runSelfTool } = require('../agent/tools.cjs');

describe('runSelfTool dispatcher', () => {
  it('tool "list" returns {ok:true, output:string} containing ".cjs"', () => {
    const res = runSelfTool('list', {});
    expect(res.ok).toBe(true);
    expect(typeof res.output).toBe('string');
    expect(res.output).toContain('.cjs');
  });

  it('tool "glob" with {pattern:"*config*"} returns {ok:true, output:string} containing "config.json"', () => {
    const res = runSelfTool('glob', { pattern: '*config*' });
    expect(res.ok).toBe(true);
    expect(typeof res.output).toBe('string');
    expect(res.output).toContain('config.json');
  });

  it('tool "read" with {path:"config.json"} returns {ok:true, output:string}', () => {
    const res = runSelfTool('read', { path: 'config.json' });
    expect(res.ok).toBe(true);
    expect(typeof res.output).toBe('string');
  });

  it('tool "todowrite" with pending task returns output containing "test" and "○"', () => {
    const res = runSelfTool('todowrite', { todos: [{ content: 'test', status: 'pending', priority: 'high' }] });
    expect(res.ok).toBe(true);
    expect(typeof res.output).toBe('string');
    expect(res.output).toContain('test');
    expect(res.output).toContain('○');
  });

  it('tool "todowrite" with completed task returns output containing "✓"', () => {
    const res = runSelfTool('todowrite', { todos: [{ content: 'done task', status: 'completed' }] });
    expect(res.ok).toBe(true);
    expect(typeof res.output).toBe('string');
    expect(res.output).toContain('✓');
  });

  it('tool "question" with {question:"apa kabar?"} returns {ok:true, needsAnswer:true, question:"apa kabar?"}', () => {
    const res = runSelfTool('question', { question: 'apa kabar?' });
    expect(res.ok).toBe(true);
    expect(res.needsAnswer).toBe(true);
    expect(res.question).toBe('apa kabar?');
  });

  it('tool "question" with choices returns {ok:true, choices:["A","B"]}', () => {
    const res = runSelfTool('question', { question: 'pilih', choices: ['A', 'B'] });
    expect(res.ok).toBe(true);
    expect(res.choices).toEqual(['A', 'B']);
  });

  it('unknown tool returns {ok:false, output:string} containing "unknown tool"', () => {
    const res = runSelfTool('nonexistent_tool', {});
    expect(res.ok).toBe(false);
    expect(typeof res.output).toBe('string');
    expect(res.output).toContain('unknown tool');
  });
});