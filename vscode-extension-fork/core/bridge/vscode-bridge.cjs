// core/bridge/vscode-bridge.cjs
const ACTIONS = {
  OPEN_FILE:'openFile',
  APPLY_EDIT:'applyEdit',
  SHOW_DIAGNOSTICS:'showDiagnostics',
  RUN_COMMAND:'runCommand',
  SHOW_INPUT_BOX:'showInputBox',
  SHOW_QUICK_PICK:'showQuickPick',
  CREATE_TERMINAL:'createTerminal',
  WRITE_TERMINAL:'writeTerminal',
  GET_WORKSPACE:'getWorkspaceFolders',
};
function encodeAction(a){
  return JSON.stringify({jsonrpc:'2.0',method:'action',params:a,id:a.id||null}) + '\n';
}
function decodeMessage(l){
  try{return JSON.parse(l)}catch(_){return null}
}
module.exports={ACTIONS,encodeAction,decodeMessage};
