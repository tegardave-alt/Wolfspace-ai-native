const fs = require('fs');
const fp = 'C:/Users/dave/quantum/public/app.jsx';
let s = fs.readFileSync(fp, 'utf8');

// Edit 1: Add handleModeChange after mode state
const old1 = `  const [mode, setMode] = useState("plan"); // "plan" | "build"
  const [canvasAuto, setCanvasAuto] = useState(false); // toggled from the composer`;

const new1 = `  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem("quantum_mode") || "plan"; }
    catch (e) { return "plan"; }
  }); // "plan" | "build"
  const handleModeChange = (newMode) => {
    setMode(newMode);
    localStorage.setItem("quantum_mode", newMode);
  };
  const [canvasAuto, setCanvasAuto] = useState(false); // toggled from the composer`;

if (s.includes(old1)) {
  s = s.replace(old1, new1);
  console.log('Edit 1: OK - handleModeChange added');
} else {
  console.log('Edit 1: FAILED - old_string not found');
  process.exit(1);
}

// Edit 2: Add mode and onModeChange props to Composer usage
const old2 = `              <Composer
                onSend={(t) => doSend(t)}
                onCancel={cancel}
                busy={busy}
              />`;

const new2 = `              <Composer
                onSend={(t) => doSend(t)}
                onCancel={cancel}
                busy={busy}
                mode={mode}
                onModeChange={handleModeChange}
              />`;

if (s.includes(old2)) {
  s = s.replace(old2, new2);
  console.log('Edit 2: OK - mode props added to Composer');
} else {
  console.log('Edit 2: FAILED - old_string not found');
  process.exit(1);
}

// Write back
fs.writeFileSync(fp, s, 'utf8');
console.log('All edits applied successfully');
