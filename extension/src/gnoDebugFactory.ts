import * as vscode from 'vscode';
import { GnoDebugSession } from './debugAdapter/gnoDebug';

export class GnoDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {    
    createDebugAdapterDescriptor(
        session: vscode.DebugSession,
        executable: vscode.DebugAdapterExecutable | undefined
    ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        // Create a new session each time
        const debugSession = new GnoDebugSession();
        return new vscode.DebugAdapterInlineImplementation(debugSession);
    }
}