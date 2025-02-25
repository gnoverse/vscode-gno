import path = require('path');
import fs = require('fs');
import vscode = require('vscode');
import { CommandFactory } from './commands';
import { getGnoConfig, getGnoplsConfig } from './config';
import { toolExecutionEnvironment } from './gnoEnv';
import { diagnosticsStatusBarItem, outputChannel } from './gnoStatus';
import { getWorkspaceFolderPath, ICheckResult, resolvePath, runTool } from './util';

/**
 * Runs linter on the current file, package or workspace.
 */
export function lintCode(scope?: string): CommandFactory {
    return (ctx, goCtx) => () => {
        const editor = vscode.window.activeTextEditor;
        if (scope !== 'workspace') {
            if (!editor) {
                vscode.window.showInformationMessage('No editor is active, cannot find current package to lint');
                return;
            }
            
            const languageId = editor.document.languageId;
            outputChannel.appendLine(`Document language ID: ${languageId}`);
            if (languageId !== 'gno') {
                vscode.window.showInformationMessage(
                    `File in the active editor is not a Gno file (detected: ${languageId}), cannot find current package to lint`
                );
                return;
            }
        }

        const documentUri = editor ? editor.document.uri : undefined;
        const goConfig = getGnoConfig(documentUri);
        const goplsConfig = getGnoplsConfig(documentUri);
        
        // Check if diagnostic collection exists
        if (!goCtx.lintDiagnosticCollection) {
            outputChannel.appendLine('Creating new diagnostic collection for tlin');
            goCtx.lintDiagnosticCollection = vscode.languages.createDiagnosticCollection('tlin');
            ctx.subscriptions.push(goCtx.lintDiagnosticCollection);
        }

        outputChannel.appendLine('Linting...');
        diagnosticsStatusBarItem.show();
        diagnosticsStatusBarItem.text = 'Linting...';

        // Get the working directory for path resolution
        const workingDir = getWorkspaceFolderPath(documentUri) || path.dirname(documentUri?.fsPath || '');
        
        outputChannel.appendLine(`Working directory: ${workingDir}`);
        outputChannel.appendLine(`Diagnostic collection: ${goCtx.lintDiagnosticCollection?.name || 'undefined'}`);

        // Store all open documents for quick access later
        const openDocuments = new Map<string, vscode.TextDocument>();
        vscode.workspace.textDocuments.forEach(doc => {
            openDocuments.set(doc.uri.fsPath, doc);
        });

        goLint(documentUri, goConfig, goplsConfig, scope)
            .then((warnings) => {
                if (!goCtx.lintDiagnosticCollection) {
                    outputChannel.appendLine('Error: lintDiagnosticCollection disappeared!');
                    return;
                }
                
                goCtx.lintDiagnosticCollection.clear();
                
                const fixedWarnings = fixFilePathsInResults(warnings, workingDir);
                outputChannel.appendLine(`Processed ${fixedWarnings.length} warnings with fixed paths`);
                
                const diagnosticsMap = new Map<string, vscode.Diagnostic[]>();
                
                fixedWarnings.forEach(warning => {
                    if (!warning.file) {
                        outputChannel.appendLine(`Warning has no file path`);
                        return;
                    }
                    
                    if (!fs.existsSync(warning.file)) {
                        outputChannel.appendLine(`File does not exist: ${warning.file}`);
                        return;
                    }
                    
                    const fileUri = vscode.Uri.file(warning.file);
                    
                    // Convert rows and columns to 0-based values (VSCode)
                    const line = Math.max(0, warning.line - 1);
                    const column = Math.max(0, (warning.col || 0) - 1);
                    
                    // Get the document for a more precise range
                    const openDocument = openDocuments.get(fileUri.fsPath);
                    
                    let range: vscode.Range;
                    
                    if (openDocument) {
                        range = createDiagnosticRange(openDocument, line, column, warning.lineText);
                        outputChannel.appendLine(`Created precise range for ${fileUri.fsPath} at line ${line+1}, col ${column+1}`);
                    } else {
                        range = new vscode.Range(line, column, line, column + 20);
                        outputChannel.appendLine(`Using approximate range for ${fileUri.fsPath} at line ${line+1}, col ${column+1}`);
                    }
                    
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        warning.msg,
                        warning.severity === 'error' 
                            ? vscode.DiagnosticSeverity.Error 
                            : vscode.DiagnosticSeverity.Warning
                    );
                    
                    diagnostic.source = 'tlin';
                    diagnostic.code = {
                        value: `${path.basename(warning.file)}:${warning.line}:${warning.col}`,
                        target: vscode.Uri.file(warning.file)
                    };
                    
                    if (!diagnosticsMap.has(warning.file)) {
                        diagnosticsMap.set(warning.file, []);
                    }
                    diagnosticsMap.get(warning.file)?.push(diagnostic);
                    
                    outputChannel.appendLine(`Added diagnostic for ${warning.file} at line ${warning.line}, col ${warning.col}: ${warning.msg}`);
                });
                
                outputChannel.appendLine(`Setting diagnostics for ${diagnosticsMap.size} files`);
                
                diagnosticsMap.forEach((diagnostics, filePath) => {
                    try {
                        const fileUri = vscode.Uri.file(filePath);
                        
                        goCtx.lintDiagnosticCollection?.set(fileUri, diagnostics);
                        outputChannel.appendLine(`Set ${diagnostics.length} diagnostics for ${fileUri.fsPath}`);
                        
                        // Force VSCode to refresh the diagnostics display
                        vscode.commands.executeCommand('workbench.action.problems.focus');
                        setTimeout(() => {
                            vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
                        }, 100);
                    } catch (err) {
                        outputChannel.appendLine(`Error setting diagnostics: ${err instanceof Error ? err.message : String(err)}`);
                    }
                });
                
                if (diagnosticsMap.size === 0) {
                    outputChannel.appendLine('No diagnostics found.');
                }
                
                diagnosticsStatusBarItem.hide();
            })
            .catch((err) => {
                vscode.window.showInformationMessage('Error: ' + err);
                diagnosticsStatusBarItem.text = 'Linting Failed';
                outputChannel.appendLine(`Linting failed: ${err instanceof Error ? err.message : String(err)}`);
            });
    };
}

/**
 * Checks and corrects file paths in results
 */
function fixFilePathsInResults(results: ICheckResult[], basePath: string): ICheckResult[] {
    outputChannel.appendLine(`Fixing file paths with base path: ${basePath}`);
    
    return results.map(result => {
        if (!result.file) {
            outputChannel.appendLine('Warning: result has no file path');
            return result;
        }
        
        // Special treatment for paths like “config.gno:44:5”
        // that contain row/column information
        const parts = result.file.split(':');
        if (parts.length > 1) {
            const fileName = parts[0];
    
            if (!path.isAbsolute(fileName) && !fileName.includes('/')) {
                const possiblePaths = [
                    path.join(basePath, fileName),
                    path.join(basePath, 'config', fileName)
                ];
                
                for (const testPath of possiblePaths) {
                    if (fs.existsSync(testPath)) {
                        outputChannel.appendLine(`Resolved relative path ${fileName} to ${testPath}`);
                        return { ...result, file: testPath };
                    }
                }
            }
        }
        
        if (path.isAbsolute(result.file) && fs.existsSync(result.file)) {
            return result;
        }
        
        const candidatePaths = [
            result.file,
            path.join(basePath, result.file),
            path.join(basePath, 'config', result.file),
            path.join(basePath, path.basename(result.file))
        ];
        
        for (const candidate of candidatePaths) {
            if (fs.existsSync(candidate)) {
                outputChannel.appendLine(`Found valid path: ${candidate}`);
                return { ...result, file: candidate };
            }
        }
        
        // Try to recover the current file if available
        if (vscode.window.activeTextEditor?.document.fileName) {
            outputChannel.appendLine(`Using active editor file: ${vscode.window.activeTextEditor.document.fileName}`);
            return { ...result, file: vscode.window.activeTextEditor.document.fileName };
        }
        
        outputChannel.appendLine(`WARNING: Could not resolve file path for: ${result.file}`);
        return result;
    });
}

/**
 * Parses the text-based output of tlin
 */
function processTlinOutput(output: string, cwd: string): ICheckResult[] {
    const results: ICheckResult[] = [];
    
    const lines = output.split('\n');
    let currentFile = '';
    let currentSeverity = '';
    let currentMessage = '';
    let currentLine = 0;
    let currentColumn = 0;
    let lineText = '';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('error:') || line.startsWith('warning:') || line.startsWith('info:')) {
            // If we already have a message in progress, we add it to the results.
            if (currentFile && currentLine > 0) {
                results.push({
                    file: currentFile,
                    line: currentLine,
                    col: currentColumn,
                    severity: currentSeverity === 'error' ? 'error' : 'warning',
                    msg: currentMessage.trim(),
                    lineText: lineText
                });
            }
            
            currentSeverity = line.split(':')[0].trim();
            currentMessage = line.substring(line.indexOf(':') + 1).trim();
            currentFile = '';
            currentLine = 0;
            currentColumn = 0;
            lineText = '';
        }
        else if (line.includes('-->')) {
            const fileInfo = line.split('-->')[1].trim();
            const fileInfoParts = fileInfo.split(':');
            
            currentFile = fileInfoParts[0].trim();
            if (fileInfoParts.length > 1) {
                currentLine = parseInt(fileInfoParts[1], 10);
                if (fileInfoParts.length > 2) {
                    currentColumn = parseInt(fileInfoParts[2], 10);
                }
            }
        }
        else if (!line.includes('^') && !line.startsWith('=') && line.length > 0 && currentFile && currentLine > 0 && !lineText) {
            lineText = line;
        }
        else if (line.includes('^')) {
            if (!currentColumn && line.indexOf('^') > 0) {
                currentColumn = line.indexOf('^');
            }
        }
        else if (line.startsWith('=')) {
            currentMessage += ' ' + line.substring(1).trim();
        }
    }
    
    if (currentFile && currentLine > 0) {
        results.push({
            file: currentFile,
            line: currentLine,
            col: currentColumn,
            severity: currentSeverity === 'error' ? 'error' : 'warning',
            msg: currentMessage.trim(),
            lineText: lineText
        });
    }
    
    return results;
}

/**
 * Improved creation of diagnostic ranges for 
 * better underlining in the editor
 */
function createDiagnosticRange(document: vscode.TextDocument | undefined, line: number, column: number, lineText?: string): vscode.Range {
    if (!document || line < 0) {
        return new vscode.Range(Math.max(0, line), Math.max(0, column), Math.max(0, line), Math.max(0, column) + 1);
    }
    
    if (line >= document.lineCount) {
        return new vscode.Range(0, 0, 0, 1);
    }

    const documentLineText = document.lineAt(line).text;
    
    const startColumn = Math.max(0, column);
    
    if (lineText) {
        const functionsInMessage = findFunctionsInText(lineText);

        for (const funcName of functionsInMessage) {
            const funcIndex = documentLineText.indexOf(funcName);
            if (funcIndex >= 0) {
                outputChannel.appendLine(`Found problematic function: ${funcName} at index ${funcIndex}`);
                return new vscode.Range(line, funcIndex, line, funcIndex + funcName.length);
            }
        }
    }
    
    if (lineText && lineText.includes('^')) {
        const caretLine = lineText;
        const caretIndex = caretLine.indexOf('^');
        
        if (caretIndex >= 0) {
            let codeLineIndex = -1;
            const lines = lineText.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('^')) {
                    codeLineIndex = i - 1;
                    break;
                }
            }
            
            if (codeLineIndex >= 0 && codeLineIndex < lines.length) {
                const codeLine = lines[codeLineIndex];
                
                if (caretIndex < codeLine.length) {
                    let symbolStart = caretIndex;
                    while (symbolStart > 0 && isSymbolChar(codeLine[symbolStart - 1])) {
                        symbolStart--;
                    }
                    
                    let symbolEnd = caretIndex;
                    while (symbolEnd < codeLine.length && isSymbolChar(codeLine[symbolEnd])) {
                        symbolEnd++;
                    }
                    
                    const symbol = codeLine.substring(symbolStart, symbolEnd);
                    outputChannel.appendLine(`Extracted symbol from caret position: "${symbol}"`);
                    
                    if (symbol && symbol.length > 0) {
                        const documentSymbolIndex = documentLineText.indexOf(symbol);
                        if (documentSymbolIndex >= 0) {
                            return new vscode.Range(line, documentSymbolIndex, line, documentSymbolIndex + symbol.length);
                        }
                    }
                }
            }
        }
    }
    
    if (lineText) {
        const errorMessage = lineText.replace(/\^+/g, '').trim();
        
        const methodMatches = errorMessage.match(/\b([A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*\(\))/g);
        if (methodMatches && methodMatches.length > 0) {
            for (const method of methodMatches) {
                const methodIndex = documentLineText.indexOf(method);
                if (methodIndex >= 0) {
                    outputChannel.appendLine(`Found method call ${method} at index ${methodIndex}`);
                    return new vscode.Range(line, methodIndex, line, methodIndex + method.length);
                }
                
                const methodName = method.substring(0, method.length - 2);
                const methodNameIndex = documentLineText.indexOf(methodName);
                if (methodNameIndex >= 0) {
                    outputChannel.appendLine(`Found method name ${methodName} at index ${methodNameIndex}`);
                    return new vscode.Range(line, methodNameIndex, line, methodNameIndex + methodName.length);
                }
            }
        }
    }
    
    if (startColumn < documentLineText.length) {
        let symbolStart = startColumn;
        while (symbolStart > 0 && isSymbolChar(documentLineText[symbolStart - 1])) {
            symbolStart--;
        }
        
        let symbolEnd = startColumn;
        while (symbolEnd < documentLineText.length && isSymbolChar(documentLineText[symbolEnd])) {
            symbolEnd++;
        }
        
        if (documentLineText.substring(symbolStart, symbolEnd).includes('.')) {
            let methodStart = symbolStart;
            let methodEnd = symbolEnd;
            
            if (symbolEnd < documentLineText.length && documentLineText[symbolEnd] === '(') {
                let parenCount = 1;
                methodEnd = symbolEnd + 1;
                
                while (methodEnd < documentLineText.length && parenCount > 0) {
                    if (documentLineText[methodEnd] === '(') {
                        parenCount++;
                    } else if (documentLineText[methodEnd] === ')') {
                        parenCount--;
                    }
                    methodEnd++;
                }
            }
            
            return new vscode.Range(line, methodStart, line, methodEnd);
        }
        
        if (symbolEnd > symbolStart) {
            return new vscode.Range(line, symbolStart, line, symbolEnd);
        }
    }
    
    const endColumn = Math.min(documentLineText.length, startColumn + 15);
    return new vscode.Range(line, startColumn, line, endColumn);
}

/**
 * Checks whether a character can be part of a symbol (identifier, method, etc.)
 */
function isSymbolChar(char: string): boolean {
    return /[A-Za-z0-9_\.]/.test(char);
}

/**
 * Try to find function names in the error text
 */
function findFunctionsInText(text: string): string[] {
    const result: string[] = [];
    
    const funcRegex = /\b([A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*\([^)]*\))/g;
    const matches = text.match(funcRegex);
    
    if (matches) {
        for (const match of matches) {
            result.push(match);
            
            if (match.endsWith('()')) {
                result.push(match.substring(0, match.length - 2));
            }
        }
    }
    
    return result;
}

/**
 * Runs linter and collects diagnostics
 */
export function goLint(
    fileUri: vscode.Uri | undefined,
    goConfig: vscode.WorkspaceConfiguration,
    goplsConfig: vscode.WorkspaceConfiguration,
    scope?: string
): Promise<ICheckResult[]> {
    const lintTool = goConfig['lintTool'] || 'tlin';

    epoch++;
    const closureEpoch = epoch;
    if (tokenSource) {
        if (running) {
            tokenSource.cancel();
        }
        tokenSource.dispose();
    }
    tokenSource = new vscode.CancellationTokenSource();

    const currentWorkspace = getWorkspaceFolderPath(fileUri);
    const cwd = scope === 'workspace' && currentWorkspace 
        ? currentWorkspace 
        : path.dirname(fileUri?.fsPath ?? '');

    if (!path.isAbsolute(cwd)) {
        return Promise.resolve([]);
    }

    const lintFlags: string[] = goConfig['lintFlags'] || [];
    const lintEnv = toolExecutionEnvironment();
    const args: string[] = [];

    if (lintTool === 'tlin') {
        lintFlags.forEach((flag) => {
            if (flag === '--json' || flag === '-json') {
                return;
            }
            
            if (flag.startsWith('--config=') || flag.startsWith('-config=')) {
                const configFilePath = resolvePath(flag.substr(flag.indexOf('=') + 1).trim());
                if (configFilePath) {
                    args.push('-c', configFilePath);
                }
                return;
            }
            
            if (flag.startsWith('--')) {
                args.push('-' + flag.substring(2));
                return;
            }
            
            args.push(flag);
        });
        
        // Check for .tlin.yaml configuration file
        if (!args.includes('-c')) {
            const configPath = path.join(cwd, '.tlin.yaml');
            if (fs.existsSync(configPath)) {
                args.push('-c', configPath);
            }
        }
    } else {
        if (args.indexOf('run') === -1) {
            args.unshift('run');
        }
        
        lintFlags.forEach((flag) => {
            args.push(flag);
        });
    }

    let tlinPath = '';
    if (lintTool === 'tlin') {
        if (scope === 'workspace' && currentWorkspace) {
            tlinPath = currentWorkspace;
        } else if (scope === 'file') {
            tlinPath = fileUri?.fsPath ?? '';
        } else {
            tlinPath = '.';
        }
    } else {
        if (scope === 'workspace' && currentWorkspace) {
            args.push('./...');
        } else if (scope === 'file') {
            args.push(fileUri?.fsPath ?? '');
        } else {
            args.push('.');
        }
    }
    
    if (lintTool === 'tlin' && tlinPath) {
        args.push(tlinPath);
    }

    running = true;
    outputChannel.appendLine(`Running: ${lintTool} ${args.join(' ')}`);
    
    if (lintTool === 'tlin') {
        const cp = require('child_process');
        
        return new Promise<ICheckResult[]>((resolve) => {
            const tlinProcess = cp.spawn(lintTool, args, { 
                cwd, 
                env: lintEnv
            });
            
            let stdoutData = '';
            let stderrData = '';
            
            tlinProcess.stdout.on('data', (data: Buffer) => {
                stdoutData += data.toString();
            });
            
            tlinProcess.stderr.on('data', (data: Buffer) => {
                stderrData += data.toString();
            });
            
            tlinProcess.on('close', (code: number) => {
                if (closureEpoch === epoch) {
                    running = false;
                }
                
                outputChannel.appendLine(`tlin exited with code ${code}`);
                
                let outputToProcess = '';
                
                if (stderrData.trim() && (
                    stderrData.includes('-->') || 
                    stderrData.includes('error:') || 
                    stderrData.includes('warning:')
                )) {
                    outputChannel.appendLine('Using stderr for processing');
                    outputToProcess = stderrData;
                } else if (stdoutData.trim()) {
                    outputChannel.appendLine('Using stdout for processing');
                    outputToProcess = stdoutData;
                }
                
                if (outputToProcess) {
                    const results = processTlinOutput(outputToProcess, cwd);
                    outputChannel.appendLine(`Parsed ${results.length} lint issues`);
                    resolve(results);
                } else {
                    outputChannel.appendLine('No lint output found');
                    resolve([]);
                }
            });
            
            tlinProcess.on('error', (err: Error) => {
                outputChannel.appendLine(`Error spawning tlin: ${err.message}`);
                if (closureEpoch === epoch) {
                    running = false;
                }
                resolve([]);
            });
        });
    } else {
        return runTool(args, cwd, 'warning', false, lintTool, lintEnv, false, tokenSource.token).then(
            (result) => {
                if (closureEpoch === epoch) {
                    running = false;
                }
                return result;
            }
        );
    }
}

let epoch = 0;
let tokenSource: vscode.CancellationTokenSource;
let running = false;