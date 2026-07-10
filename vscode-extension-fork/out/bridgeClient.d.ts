import { ChildProcess } from 'child_process';
export interface VSCodeAction {
    type: 'openFile' | 'applyEdit' | 'runCommand' | 'showMessage' | 'createFile' | 'deleteFile';
    params: Record<string, unknown>;
}
export declare class QuantumBridgeClient {
    private childProcess;
    private pending;
    private buffer;
    private reqId;
    constructor(childProcess: ChildProcess);
    private processBuffer;
    private handleMessage;
    sendAction(action: VSCodeAction): Promise<unknown>;
    executeAction(action: VSCodeAction): Promise<unknown>;
    private openFile;
    private applyEdit;
    private createFile;
    private deleteFile;
}
