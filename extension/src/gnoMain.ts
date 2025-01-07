/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import { extensionInfo, getGnoConfig } from './config';
import { notifyIfGeneratedFile, removeTestStatus } from './gnoCheck';
import { setGOROOTEnvVar, toolExecutionEnvironment } from './gnoEnv';
import {
	chooseGoEnvironment,
	offerToInstallLatestGoVersion,
	setEnvironmentVariableCollection
} from './gnoEnvironmentStatus';
import { addImport, addImportToWorkspace } from './gnoImport';
import { installCurrentPackage } from './gnoInstall';
import {
	promptForMissingTool,
	updateGoVarsFromConfig,
	suggestUpdates,
	maybeInstallVSCGO,
	maybeInstallImportantTools
} from './gnoInstallTools';
import { RestartReason, showServerOutputChannel, watchLanguageServerConfiguration } from './language/gnoLanguageServer';
import { lintCode } from './gnoLint';
import { GO_MODE } from './gnoMode';
import { GO111MODULE, goModInit } from './gnoModules';
import { GoRunTestCodeLensProvider } from './gnoRunTestCodelens';
import { disposeGoStatusBar, expandGoStatusBar, outputChannel, updateGoStatusBar } from './gnoStatus';
import {
	getFromGlobalState,
	resetGlobalState,
	resetWorkspaceState,
	setGlobalState,
	setWorkspaceState,
	updateGlobalState
} from './stateUtils';
import { cancelRunningTests, showTestOutput } from './testUtils';
import { cleanupTempDir, getBinPath, getToolsGopath } from './util';
import { clearCacheForTools } from './utils/pathUtils';
import { WelcomePanel } from './welcome';
import vscode = require('vscode');
import { getFormatTool } from './language/legacy/gnoFormat';
import { ExtensionAPI } from './export';
import extensionAPI from './extensionAPI';
import { GoTestExplorer, isVscodeTestingAPIAvailable } from './gnoTest/explore';
import { killRunningPprof } from './gnoTest/profile';
import { GoExplorerProvider } from './gnoExplorer';
import { GoExtensionContext } from './context';
import * as commands from './commands';
import { GoTaskProvider } from './gnoTaskProvider';
import { addPackage } from './gnoAddPkg';

const goCtx: GoExtensionContext = {};

// Allow tests to access the extension context utilities.
interface ExtensionTestAPI {
	globalState: vscode.Memento;
}

export async function activate(ctx: vscode.ExtensionContext): Promise<ExtensionAPI | ExtensionTestAPI | undefined> {
	if (process.env['VSCODE_GNO_IN_TEST'] === '1') {
		// TODO: VSCODE_GO_IN_TEST was introduced long before we learned about
		// ctx.extensionMode, and used in multiple places.
		// Investigate if use of VSCODE_GO_IN_TEST can be removed
		// in favor of ctx.extensionMode and clean up.
		if (ctx.extensionMode === vscode.ExtensionMode.Test) {
			return { globalState: ctx.globalState };
		}
		// We shouldn't expose the memento in production mode even when VSCODE_GO_IN_TEST
		// environment variable is set.
		return; // Skip the remaining activation work.
	}
	const start = Date.now();
	setGlobalState(ctx.globalState);
	setWorkspaceState(ctx.workspaceState);
	setEnvironmentVariableCollection(ctx.environmentVariableCollection);

	const cfg = getGnoConfig();
	WelcomePanel.activate(ctx, goCtx);

	const configGOROOT = getGnoConfig()['gnoroot'];
	if (configGOROOT) {
		// We don't support unsetting go.goroot because we don't know whether
		// !configGOROOT case indicates the user wants to unset process.env['GOROOT']
		// or the user wants the extension to use the current process.env['GOROOT'] value.
		// TODO(hyangah): consider utilizing an empty value to indicate unset?
		await setGOROOTEnvVar(configGOROOT);
	}

	await updateGoVarsFromConfig(goCtx);

	// for testing or development mode, always rebuild vscgo.
	if (process.platform !== 'win32') {
		// skip windows until Windows Defender issue reported in golang/vscode-go#3182 can be addressed
		maybeInstallVSCGO(
			ctx.extensionMode,
			ctx.extension.id,
			extensionInfo.version || '',
			ctx.extensionPath,
			extensionInfo.isPreview
		);
	}

	const registerCommand = commands.createRegisterCommand(ctx, goCtx);
	registerCommand('gno.languageserver.restart', commands.startLanguageServer);
	registerCommand('gno.languageserver.maintain', commands.startGoplsMaintainerInterface);

	await maybeInstallImportantTools(cfg.get('alternateTools'));
	await commands.startLanguageServer(ctx, goCtx)(RestartReason.ACTIVATION);

	suggestUpdates();
	offerToInstallLatestGoVersion(ctx);

	registerCommand('gno.builds.run', commands.runBuilds);
	registerCommand('gno.environment.status', expandGoStatusBar);

	GoRunTestCodeLensProvider.activate(ctx, goCtx);

	goCtx.buildDiagnosticCollection = vscode.languages.createDiagnosticCollection('gno');
	ctx.subscriptions.push(goCtx.buildDiagnosticCollection);
	goCtx.lintDiagnosticCollection = vscode.languages.createDiagnosticCollection(
		lintDiagnosticCollectionName(getGnoConfig()['lintTool'])
	);
	ctx.subscriptions.push(goCtx.lintDiagnosticCollection);
	goCtx.vetDiagnosticCollection = vscode.languages.createDiagnosticCollection('go-vet');
	ctx.subscriptions.push(goCtx.vetDiagnosticCollection);

	registerCommand('gno.gnopath', commands.getCurrentGoPath);
	registerCommand('gno.gnoroot', commands.getCurrentGoRoot);
	registerCommand('gno.locate.tools', commands.getConfiguredGoTools);
	registerCommand('gno.impl.cursor', commands.implCursor);
	registerCommand('gno.test.cursor', commands.testAtCursor('test'));
	registerCommand('gno.test.cursorOrPrevious', commands.testAtCursorOrPrevious('test'));
	registerCommand('gno.test.package', commands.testCurrentPackage());
	registerCommand('gno.test.file', commands.testCurrentFile());
	registerCommand('gno.test.workspace', commands.testWorkspace);
	registerCommand('gno.test.previous', commands.testPrevious);
	registerCommand('gno.test.showOutput', () => showTestOutput);
	registerCommand('gno.test.cancel', () => cancelRunningTests);
	registerCommand('gno.import.add', addImport);
	registerCommand('gno.add.package.workspace', addImportToWorkspace);
	registerCommand('gno.tools.install', commands.installTools);
	registerCommand('gno.maketx.addpkg', addPackage());

	if (isVscodeTestingAPIAvailable && cfg.get<boolean>('testExplorer.enable')) {
		GoTestExplorer.setup(ctx, goCtx);
	}

	GoExplorerProvider.setup(ctx);

	registerCommand('gno.debug.startSession', commands.startDebugSession);
	registerCommand('gno.show.commands', commands.showCommands);
	registerCommand('gno.lint.package', lintCode('package'));
	registerCommand('gno.lint.workspace', lintCode('workspace'));
	registerCommand('gno.lint.file', lintCode('file'));
	registerCommand('gno.install.package', installCurrentPackage);
	registerCommand('gno.run.modinit', goModInit);
	registerCommand('gno.extractServerChannel', showServerOutputChannel);
	registerCommand('gno.workspace.resetState', resetWorkspaceState);
	registerCommand('gno.global.resetState', resetGlobalState);
	registerCommand('gno.toggle.gc_details', commands.toggleGCDetails);

	// Go Environment switching commands
	registerCommand('gno.environment.choose', chooseGoEnvironment);

	addOnDidChangeConfigListeners(ctx);
	addOnChangeTextDocumentListeners(ctx);
	addOnChangeActiveTextEditorListeners(ctx);
	addOnSaveTextDocumentListeners(ctx);

	vscode.languages.setLanguageConfiguration(GO_MODE.language, {
		wordPattern: /(-?\d*\.\d\w*)|([^`~!@#%^&*()\-=+[{\]}\\|;:'",.<>/?\s]+)/g
	});

	GoTaskProvider.setup(ctx, vscode.workspace);

	return extensionAPI;
}

function activationLatency(duration: number): string {
	// TODO: generalize and move to goTelemetry.ts
	let bucket = '>=5s';

	if (duration < 100) {
		bucket = '<100ms';
	} else if (duration < 500) {
		bucket = '<500ms';
	} else if (duration < 1000) {
		bucket = '<1s';
	} else if (duration < 5000) {
		bucket = '<5s';
	}
	return 'activation_latency:' + bucket;
}

export function deactivate() {
	return Promise.all([
		goCtx.languageClient?.stop(),
		cancelRunningTests(),
		killRunningPprof(),
		Promise.resolve(cleanupTempDir()),
		Promise.resolve(disposeGoStatusBar()),
	]);
}

function addOnDidChangeConfigListeners(ctx: vscode.ExtensionContext) {
	// Subscribe to notifications for changes to the configuration
	// of the language server, even if it's not currently in use.
	ctx.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => watchLanguageServerConfiguration(goCtx, e))
	);
	ctx.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (e: vscode.ConfigurationChangeEvent) => {
			if (!e.affectsConfiguration('gno')) {
				return;
			}
			const updatedGoConfig = getGnoConfig();

			if (e.affectsConfiguration('gno.gnoroot')) {
				const configGOROOT = updatedGoConfig['gnoroot'];
				if (configGOROOT) {
					await setGOROOTEnvVar(configGOROOT);
				}
			}
			if (
				e.affectsConfiguration('gno.gnoroot') ||
				e.affectsConfiguration('gno.alternateTools') ||
				e.affectsConfiguration('gno.gnopath') ||
				e.affectsConfiguration('gno.toolsEnvVars') ||
				e.affectsConfiguration('gno.testEnvFile')
			) {
				updateGoVarsFromConfig(goCtx);
			}
			// If there was a change in "toolsGopath" setting, then clear cache for go tools
			if (getToolsGopath() !== getToolsGopath(false)) {
				clearCacheForTools();
			}

			if (e.affectsConfiguration('gno.formatTool')) {
				checkToolExists(getFormatTool(updatedGoConfig));
			}
			if (e.affectsConfiguration('gno.lintTool')) {
				checkToolExists(updatedGoConfig['lintTool']);
			}
			if (e.affectsConfiguration('gno.docsTool')) {
				checkToolExists(updatedGoConfig['docsTool']);
			}
			if (e.affectsConfiguration('gno.toolsEnvVars')) {
				const env = toolExecutionEnvironment();
				if (GO111MODULE !== env['GO111MODULE']) {
					const reloadMsg =
						'Reload VS Code window so that the Go tools can respect the change to GO111MODULE';
					vscode.window.showInformationMessage(reloadMsg, 'Reload').then((selected) => {
						if (selected === 'Reload') {
							vscode.commands.executeCommand('workbench.action.reloadWindow');
						}
					});
				}
			}
			if (e.affectsConfiguration('gno.lintTool')) {
				const lintTool = lintDiagnosticCollectionName(updatedGoConfig['lintTool']);
				if (goCtx.lintDiagnosticCollection && goCtx.lintDiagnosticCollection.name !== lintTool) {
					goCtx.lintDiagnosticCollection.dispose();
					goCtx.lintDiagnosticCollection = vscode.languages.createDiagnosticCollection(lintTool);
					ctx.subscriptions.push(goCtx.lintDiagnosticCollection);
					// TODO: actively maintain our own disposables instead of keeping pushing to ctx.subscription.
				}
			}
			if (e.affectsConfiguration('gno.testExplorer.enable')) {
				const msg =
					'Go test explorer has been enabled or disabled. For this change to take effect, the window must be reloaded.';
				vscode.window.showInformationMessage(msg, 'Reload').then((selected) => {
					if (selected === 'Reload') {
						vscode.commands.executeCommand('workbench.action.reloadWindow');
					}
				});
			}
		})
	);
}

function addOnSaveTextDocumentListeners(ctx: vscode.ExtensionContext) {
	vscode.workspace.onDidSaveTextDocument(
		(document) => {
			if (document.languageId !== 'gno') {
				return;
			}
			const session = vscode.debug.activeDebugSession;
			if (session && session.type === 'gno') {
				const neverAgain = { title: "Don't Show Again" };
				const ignoreActiveDebugWarningKey = 'ignoreActiveDebugWarningKey';
				const ignoreActiveDebugWarning = getFromGlobalState(ignoreActiveDebugWarningKey);
				if (!ignoreActiveDebugWarning) {
					vscode.window
						.showWarningMessage(
							'A debug session is currently active. Changes to your Go files may result in unexpected behaviour.',
							neverAgain
						)
						.then((result) => {
							if (result === neverAgain) {
								updateGlobalState(ignoreActiveDebugWarningKey, true);
							}
						});
				}
			}
			if (vscode.window.visibleTextEditors.some((e) => e.document.fileName === document.fileName)) {
				vscode.commands.executeCommand('gno.builds.run', document, getGnoConfig(document.uri));
			}
		},
		null,
		ctx.subscriptions
	);
}

function addOnChangeTextDocumentListeners(ctx: vscode.ExtensionContext) {
	vscode.workspace.onDidChangeTextDocument(removeTestStatus, null, ctx.subscriptions);
	vscode.workspace.onDidChangeTextDocument(notifyIfGeneratedFile, ctx, ctx.subscriptions);
}

function addOnChangeActiveTextEditorListeners(ctx: vscode.ExtensionContext) {
	[updateGoStatusBar].forEach((listener) => {
		// Call the listeners on initilization for current active text editor
		if (vscode.window.activeTextEditor) {
			listener(vscode.window.activeTextEditor);
		}
		vscode.window.onDidChangeActiveTextEditor(listener, null, ctx.subscriptions);
	});
}

function checkToolExists(tool: string) {
	if (tool === getBinPath(tool)) {
		promptForMissingTool(tool);
	}
}

function lintDiagnosticCollectionName(lintToolName: string) {
	if (!lintToolName || lintToolName === 'gnolint') {
		return 'gno-lint';
	}
	return `gno-${lintToolName}`;
}
