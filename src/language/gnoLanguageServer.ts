/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import fs = require('fs');
import path = require('path');
import semver = require('semver');
import util = require('util');
import vscode = require('vscode');
import {
	CancellationToken,
	CloseAction,
	ConfigurationParams,
	ConfigurationRequest,
	ErrorAction,
	ExecuteCommandSignature,
	HandleDiagnosticsSignature,
	InitializeError,
	InitializeResult,
	LanguageClientOptions,
	Message,
	ProvideCodeLensesSignature,
	ProvideCompletionItemsSignature,
	ProvideDocumentFormattingEditsSignature,
	ResponseError,
	RevealOutputChannelOn
} from 'vscode-languageclient';
import moment from 'moment';
import { LanguageClient, ServerOptions } from 'vscode-languageclient/node';
import { getGnoConfig, getGnoplsConfig, getExtensionInfo } from '../config';
import { toolExecutionEnvironment } from '../gnoEnv';
import { GoDocumentFormattingEditProvider, usingCustomFormatTool } from './legacy/gnoFormat';
import { latestToolVersion, promptForMissingTool, promptForUpdatingTool } from '../gnoInstallTools';
import { getTool, Tool } from '../gnoTools';
import { getFromGlobalState, updateGlobalState } from '../stateUtils';
import {
	getBinPath,
	getCheckForToolsUpdatesConfig,
	getCurrentGoPath,
	getGoVersion,
	getWorkspaceFolderPath,
	removeDuplicateDiagnostics,
	daysBetween,
	timeDay,
	timeMinute
} from '../util';
import { getToolFromToolPath } from '../utils/pathUtils';
import { CompletionItemKind, FoldingContext } from 'vscode';
import { ProvideFoldingRangeSignature } from 'vscode-languageclient/lib/common/foldingRange';
import { CommandFactory } from '../commands';
import { updateLanguageServerIconGoStatusBar } from '../gnoStatus';
import { createHash } from 'crypto';
import { GoExtensionContext } from '../context';
import { GoDocumentSelector } from '../gnoMode';
import { get } from 'lodash';

export interface LanguageServerConfig {
	serverName: string;
	path: string;
	version?: { version: string; goVersion?: string };
	modtime?: Date;
	enabled: boolean;
	flags: string[];
	env: any;
	features: {
		formatter?: GoDocumentFormattingEditProvider;
	};
	checkForUpdates: string;
}

export interface ServerInfo {
	Name: string;
	Version?: string;
	GoVersion?: string;
	Commands?: string[];
}

export function updateRestartHistory(goCtx: GoExtensionContext, reason: RestartReason, enabled: boolean) {
	// Keep the history limited to 10 elements.
	goCtx.restartHistory = goCtx.restartHistory ?? [];
	while (goCtx.restartHistory.length > 10) {
		goCtx.restartHistory = goCtx.restartHistory.slice(1);
	}
	goCtx.restartHistory.push(new Restart(reason, new Date(), enabled));
}

function formatRestartHistory(goCtx: GoExtensionContext): string {
	const result: string[] = [];
	for (const restart of goCtx.restartHistory ?? []) {
		result.push(`${restart.timestamp.toUTCString()}: ${restart.reason} (enabled: ${restart.enabled})`);
	}
	return result.join('\n');
}

export enum RestartReason {
	ACTIVATION = 'activation',
	MANUAL = 'manual',
	CONFIG_CHANGE = 'config change',
	INSTALLATION = 'installation'
}

export class Restart {
	reason: RestartReason;
	timestamp: Date;
	enabled: boolean;

	constructor(reason: RestartReason, timestamp: Date, enabled: boolean) {
		this.reason = reason;
		this.timestamp = timestamp;
		this.enabled = enabled;
	}
}

// computes a bigint fingerprint of the machine id.
function hashMachineID(salt?: string): number {
	const hash = createHash('md5').update(`${vscode.env.machineId}${salt}`).digest('hex');
	return parseInt(hash.substring(0, 8), 16);
}

// scheduleGoplsSuggestions sets timeouts for the various gopls-specific
// suggestions. We check user's gopls versions once per day to prompt users to
// update to the latest version. We also check if we should prompt users to
// fill out the survey.
export function scheduleGoplsSuggestions(goCtx: GoExtensionContext) {
	if (getExtensionInfo().isInCloudIDE) {
		return;
	}
	// Some helper functions.
	const usingGo = (): boolean => {
		return vscode.workspace.textDocuments.some((doc) => doc.languageId === 'gno');
	};
	const installGopls = async (cfg: LanguageServerConfig) => {
		const tool = getTool('gnopls');
		const versionToUpdate = await shouldUpdateLanguageServer(tool, cfg);
		if (!versionToUpdate) {
			return;
		}

		promptForUpdatingTool(tool.name, versionToUpdate);
	};
	const update = async () => {
		setTimeout(update, timeDay);
		const cfg = goCtx.latestConfig;
		// trigger periodic update check only if the user is already using gopls.
		// Otherwise, let's check again tomorrow.
		if (!cfg || !cfg.enabled || cfg.serverName !== 'gnopls') {
			return;
		}
		await installGopls(cfg);
	};

	setTimeout(update, 10 * timeMinute);
}

// exported for testing.
export async function stopLanguageClient(goCtx: GoExtensionContext) {
	const c = goCtx.languageClient;
	goCtx.crashCount = 0;
	goCtx.languageClient = undefined;
	if (!c) return false;

	if (c.diagnostics) {
		c.diagnostics.clear();
	}
	// LanguageClient.stop may hang if the language server
	// crashes during shutdown before responding to the
	// shutdown request. Enforce client-side timeout.
	try {
		c.stop(2000);
	} catch (e) {
		c.outputChannel?.appendLine(`Failed to stop client: ${e}`);
	}
}

export function toServerInfo(res?: InitializeResult): ServerInfo | undefined {
	if (!res) return undefined;

	const info: ServerInfo = {
		Commands: res.capabilities?.executeCommandProvider?.commands || [],
		Name: res.serverInfo?.name || 'unknown'
	};

	try {
		interface serverVersionJSON {
			GoVersion?: string;
			Version?: string;
			// before gopls 0.8.0
			version?: string;
		}
		const v = <serverVersionJSON>(res.serverInfo?.version ? JSON.parse(res.serverInfo.version) : {});
		info.Version = v.Version || v.version;
		info.GoVersion = v.GoVersion;
	} catch (e) {
		// gopls is not providing any info, that's ok.
	}
	return info;
}

export interface BuildLanguageClientOption extends LanguageServerConfig {
	outputChannel?: vscode.OutputChannel;
	traceOutputChannel?: vscode.OutputChannel;
}

// buildLanguageClientOption returns the default, extra configuration
// used in building a new LanguageClient instance. Options specified
// in LanguageServerConfig
export function buildLanguageClientOption(
	goCtx: GoExtensionContext,
	cfg: LanguageServerConfig
): BuildLanguageClientOption {
	// Reuse the same output channel for each instance of the server.
	if (cfg.enabled) {
		if (!goCtx.serverOutputChannel) {
			goCtx.serverOutputChannel = vscode.window.createOutputChannel(cfg.serverName + ' (server)');
		}
		if (!goCtx.serverTraceChannel) {
			goCtx.serverTraceChannel = vscode.window.createOutputChannel(cfg.serverName);
		}
	}
	return Object.assign(
		{
			outputChannel: goCtx.serverOutputChannel,
			traceOutputChannel: goCtx.serverTraceChannel
		},
		cfg
	);
}

export class GoLanguageClient extends LanguageClient implements vscode.Disposable {
	constructor(id: string, name: string, serverOptions: ServerOptions, clientOptions: LanguageClientOptions) {
		super(id, name, serverOptions, clientOptions);
	}
}

// buildLanguageClient returns a language client built using the given language server config.
// The returned language client need to be started before use.
export async function buildLanguageClient(
	goCtx: GoExtensionContext,
	cfg: BuildLanguageClientOption
): Promise<GoLanguageClient> {
	await getLocalGoplsVersion(cfg); // populate and cache cfg.version
	const goplsWorkspaceConfig = await adjustGoplsWorkspaceConfiguration(cfg, getGnoplsConfig(), 'gnopls', undefined);

	// when initialization is failed after the connection is established,
	// we want to handle the connection close error case specially. Capture the error
	// in initializationFailedHandler and handle it in the connectionCloseHandler.
	let initializationError: ResponseError<InitializeError> | undefined = undefined;

	// cfg is captured by closures for later use during error report.
	const c = new GoLanguageClient(
		'gno', // id
		cfg.serverName, // name e.g. gopls
		{
			command: cfg.path,
			args: ['-mode=stdio', ...cfg.flags],
			options: { env: cfg.env }
		} as ServerOptions,
		{
			initializationOptions: goplsWorkspaceConfig,
			documentSelector: GoDocumentSelector,
			uriConverters: {
				// Apply file:/// scheme to all file paths.
				code2Protocol: (uri: vscode.Uri): string =>
					(uri.scheme ? uri : uri.with({ scheme: 'file' })).toString(),
				protocol2Code: (uri: string) => vscode.Uri.parse(uri)
			},
			outputChannel: cfg.outputChannel,
			traceOutputChannel: cfg.traceOutputChannel,
			revealOutputChannelOn: RevealOutputChannelOn.Never,
			initializationFailedHandler: (error: ResponseError<InitializeError>): boolean => {
				initializationError = error;
				return false;
			},
			errorHandler: {
				error: (error: Error, message: Message, count: number) => {
					// Allow 5 crashes before shutdown.
					if (count < 5) {
						return {
							message: '', // suppresses error popups
							action: ErrorAction.Continue
						};
					}
					return {
						message: '', // suppresses error popups
						action: ErrorAction.Shutdown
					};
				},
				closed: () => {
					if (initializationError !== undefined) {
						suggestGoplsIssueReport(
							goCtx,
							cfg,
							'The gnopls server failed to initialize.',
							errorKind.initializationFailure,
							initializationError
						);
						initializationError = undefined;
						// In case of initialization failure, do not try to restart.
						return {
							message: '', // suppresses error popups - there will be other popups. :-(
							action: CloseAction.DoNotRestart
						};
					}

					// Allow 5 crashes before shutdown.
					const { crashCount = 0 } = goCtx;
					goCtx.crashCount = crashCount + 1;
					if (goCtx.crashCount < 5) {
						updateLanguageServerIconGoStatusBar(c, true);
						return {
							message: '', // suppresses error popups
							action: CloseAction.Restart
						};
					}
					suggestGoplsIssueReport(
						goCtx,
						cfg,
						'The connection to gnopls has been closed. The gnopls server may have crashed.',
						errorKind.crash
					);
					updateLanguageServerIconGoStatusBar(c, true);
					return {
						message: '', // suppresses error popups - there will be other popups.
						action: CloseAction.DoNotRestart
					};
				}
			},
			middleware: {
				handleWorkDoneProgress: async (token, params, next) => {
					switch (params.kind) {
						case 'begin':
							break;
					}
					next(token, params);
				},
				executeCommand: async (command: string, args: any[], next: ExecuteCommandSignature) => {
					try {
						if (command === 'gnopls.tidy') {
							await vscode.workspace.saveAll(false);
						}
					} catch (e) {
						// TODO: how to print ${e} reliably???
						const answer = await vscode.window.showErrorMessage(
							`Command '${command}' failed: ${e}.`,
							'Show Trace'
						);
						if (answer === 'Show Trace') {
							goCtx.serverOutputChannel?.show();
						}
						return null;
					}
				},
				provideFoldingRanges: async (
					doc: vscode.TextDocument,
					context: FoldingContext,
					token: CancellationToken,
					next: ProvideFoldingRangeSignature
				) => {
					const ranges = await next(doc, context, token);
					if ((!ranges || ranges.length === 0) && doc.lineCount > 0) {
						return undefined;
					}
					return ranges;
				},
				provideCodeLenses: async (
					doc: vscode.TextDocument,
					token: vscode.CancellationToken,
					next: ProvideCodeLensesSignature
				): Promise<vscode.CodeLens[]> => {
					const codeLens = await next(doc, token);
					if (!codeLens || codeLens.length === 0) {
						return codeLens ?? [];
					}
					return codeLens.reduce((lenses: vscode.CodeLens[], lens: vscode.CodeLens) => {
						switch (lens.command?.title) {
							case 'run test': {
								return [...lenses, ...createTestCodeLens(lens)];
							}
							default: {
								return [...lenses, lens];
							}
						}
					}, []);
				},
				provideDocumentFormattingEdits: async (
					document: vscode.TextDocument,
					options: vscode.FormattingOptions,
					token: vscode.CancellationToken,
					next: ProvideDocumentFormattingEditsSignature
				) => {
					if (cfg.features.formatter) {
						return cfg.features.formatter.provideDocumentFormattingEdits(document, options, token);
					}
					return next(document, options, token);
				},
				handleDiagnostics: (
					uri: vscode.Uri,
					diagnostics: vscode.Diagnostic[],
					next: HandleDiagnosticsSignature
				) => {
					const { buildDiagnosticCollection, lintDiagnosticCollection, vetDiagnosticCollection } = goCtx;
					// Deduplicate diagnostics with those found by the other tools.
					removeDuplicateDiagnostics(vetDiagnosticCollection, uri, diagnostics);
					removeDuplicateDiagnostics(buildDiagnosticCollection, uri, diagnostics);
					removeDuplicateDiagnostics(lintDiagnosticCollection, uri, diagnostics);

					return next(uri, diagnostics);
				},
				provideCompletionItem: async (
					document: vscode.TextDocument,
					position: vscode.Position,
					context: vscode.CompletionContext,
					token: vscode.CancellationToken,
					next: ProvideCompletionItemsSignature
				) => {
					const list = await next(document, position, context, token);
					if (!list) {
						return list;
					}
					const items = Array.isArray(list) ? list : list.items;

					// Give all the candidates the same filterText to trick VSCode
					// into not reordering our candidates. All the candidates will
					// appear to be equally good matches, so VSCode's fuzzy
					// matching/ranking just maintains the natural "sortText"
					// ordering. We can only do this in tandem with
					// "incompleteResults" since otherwise client side filtering is
					// important.
					if (!Array.isArray(list) && list.isIncomplete && list.items.length > 1) {
						let hardcodedFilterText = items[0].filterText;
						if (!hardcodedFilterText) {
							// tslint:disable:max-line-length
							// According to LSP spec,
							// https://microsoft.github.io/language-server-protocol/specifications/specification-current/#textDocument_completion
							// if filterText is falsy, the `label` should be used.
							// But we observed that's not the case.
							// Even if vscode picked the label value, that would
							// cause to reorder candiates, which is not ideal.
							// Force to use non-empty `label`.
							// https://github.com/golang/vscode-go/issues/441
							let { label } = items[0];
							if (typeof label !== 'string') label = label.label;
							hardcodedFilterText = label;
						}
						for (const item of items) {
							item.filterText = hardcodedFilterText;
						}
					}
					const paramHints = vscode.workspace.getConfiguration('editor.parameterHints', {
						languageId: 'gno',
						uri: document.uri
					});
					// If the user has parameterHints (signature help) enabled,
					// trigger it for function or method completion items.
					if (paramHints.get<boolean>('enabled') === true) {
						for (const item of items) {
							if (item.kind === CompletionItemKind.Method || item.kind === CompletionItemKind.Function) {
								item.command = {
									title: 'triggerParameterHints',
									command: 'editor.action.triggerParameterHints'
								};
							}
						}
					}
					return list;
				},
				// Keep track of the last file change in order to not prompt
				// user if they are actively working.
				didOpen: async (e, next) => {
					goCtx.lastUserAction = new Date();
					next(e);
				},
				didChange: async (e, next) => {
					goCtx.lastUserAction = new Date();
					next(e);
				},
				didClose: async (e, next) => {
					goCtx.lastUserAction = new Date();
					next(e);
				},
				didSave: async (e, next) => {
					goCtx.lastUserAction = new Date();
					next(e);
				},
				workspace: {
					configuration: async (
						params: ConfigurationParams,
						token: CancellationToken,
						next: ConfigurationRequest.HandlerSignature
					): Promise<any[] | ResponseError<void>> => {
						const configs = await next(params, token);
						if (!configs || !Array.isArray(configs)) {
							return configs;
						}
						const ret = [] as any[];
						for (let i = 0; i < configs.length; i++) {
							let workspaceConfig = configs[i];
							if (!!workspaceConfig && typeof workspaceConfig === 'object') {
								const scopeUri = params.items[i].scopeUri;
								const resource = scopeUri ? vscode.Uri.parse(scopeUri) : undefined;
								const section = params.items[i].section;
								workspaceConfig = await adjustGoplsWorkspaceConfiguration(
									cfg,
									workspaceConfig,
									section,
									resource
								);
							}
							ret.push(workspaceConfig);
						}
						return ret;
					}
				}
			}
		} as LanguageClientOptions
	);

	return c;
}

// filterGoplsDefaultConfigValues removes the entries filled based on the default values
// and selects only those the user explicitly specifies in their settings.
// This returns a new object created based on the filtered properties of workspaceConfig.
// Exported for testing.
export function filterGoplsDefaultConfigValues(workspaceConfig: any, resource?: vscode.Uri): any {
	if (!workspaceConfig) {
		workspaceConfig = {};
	}
	const cfg = getGnoplsConfig(resource);
	const filtered = {} as { [key: string]: any };
	for (const [key, value] of Object.entries(workspaceConfig)) {
		if (typeof value === 'function') {
			continue;
		}
		const c = cfg.inspect(key);
		// select only the field whose current value comes from non-default setting.
		if (
			!c ||
			!util.isDeepStrictEqual(c.defaultValue, value) ||
			// c.defaultValue !== value would be most likely sufficient, except
			// when gopls' default becomes different from extension's default.
			// So, we also forward the key if ever explicitely stated in one of the
			// settings layers.
			c.globalLanguageValue !== undefined ||
			c.globalValue !== undefined ||
			c.workspaceFolderLanguageValue !== undefined ||
			c.workspaceFolderValue !== undefined ||
			c.workspaceLanguageValue !== undefined ||
			c.workspaceValue !== undefined
		) {
			filtered[key] = value;
		}
	}
	return filtered;
}

// passGoConfigToGoplsConfigValues passes some of the relevant 'go.' settings to gopls settings.
// This assumes `goplsWorkspaceConfig` is an output of filterGoplsDefaultConfigValues,
// so it is modifiable and doesn't contain properties that are not explicitly set.
//   - go.buildTags and go.buildFlags are passed as gopls.build.buildFlags
//     if goplsWorkspaceConfig doesn't explicitly set it yet.
// Exported for testing.
export function passGoConfigToGoplsConfigValues(goplsWorkspaceConfig: any, goWorkspaceConfig: any): any {
	if (!goplsWorkspaceConfig) {
		goplsWorkspaceConfig = {};
	}

	const buildFlags = [] as string[];
	if (goWorkspaceConfig?.buildFlags) {
		buildFlags.push(...goWorkspaceConfig.buildFlags);
	}
	if (goWorkspaceConfig?.buildTags && buildFlags.indexOf('-tags') === -1) {
		buildFlags.push('-tags', goWorkspaceConfig?.buildTags);
	}
	// If gopls.build.buildFlags is set, don't touch it.
	if (buildFlags.length > 0 && goplsWorkspaceConfig['build.buildFlags'] === undefined) {
		goplsWorkspaceConfig['build.buildFlags'] = buildFlags;
	}

	return goplsWorkspaceConfig;
}

// adjustGoplsWorkspaceConfiguration filters unnecessary options and adds any necessary, additional
// options to the gopls config. See filterGoplsDefaultConfigValues, passGoConfigToGoplsConfigValues.
// If this is for the nightly extension, we also request to activate features under experiments.
async function adjustGoplsWorkspaceConfiguration(
	cfg: LanguageServerConfig,
	workspaceConfig: any,
	section?: string,
	resource?: vscode.Uri
): Promise<any> {
	// We process only gopls config
	if (section !== 'gnopls') {
		return workspaceConfig;
	}

	workspaceConfig = filterGoplsDefaultConfigValues(workspaceConfig, resource) || {};
	// note: workspaceConfig is a modifiable, valid object.
	const goConfig = getGnoConfig(resource);
	workspaceConfig = passGoConfigToGoplsConfigValues(workspaceConfig, goConfig);
	workspaceConfig = await passLinkifyShowMessageToGopls(cfg, workspaceConfig);
	if (workspaceConfig && !workspaceConfig['allExperiments']) {
		workspaceConfig['allExperiments'] = true;
	}
	return workspaceConfig;
}

async function passLinkifyShowMessageToGopls(cfg: LanguageServerConfig, goplsConfig: any) {
	goplsConfig = goplsConfig ?? {};

	const goplsVersion = await getLocalGoplsVersion(cfg);
	if (!goplsVersion) return goplsConfig;

	const version = semver.parse(goplsVersion.version);
	// The linkifyShowMessage option was added in v0.14.0-pre.1.
	if ((version?.compare('0.13.99') ?? 1) > 0) {
		goplsConfig['linkifyShowMessage'] = true;
	}
	return goplsConfig;
}

// createTestCodeLens adds the go.test.cursor and go.debug.cursor code lens
function createTestCodeLens(lens: vscode.CodeLens): vscode.CodeLens[] {
	// CodeLens argument signature in gopls is [fileName: string, testFunctions: string[], benchFunctions: string[]],
	// so this needs to be deconstructured here
	// Note that there will always only be one test function name in this context
	if ((lens.command?.arguments?.length ?? 0) < 2 || (lens.command?.arguments?.[1].length ?? 0) < 1) {
		return [lens];
	}
	return [
		new vscode.CodeLens(lens.range, {
			title: '',
			...lens.command,
			command: 'gno.test.cursor',
			arguments: [{ functionName: lens.command?.arguments?.[1][0] }]
		}),
		new vscode.CodeLens(lens.range, {
			title: 'debug test',
			command: 'gno.debug.cursor',
			arguments: [{ functionName: lens.command?.arguments?.[1][0] }]
		})
	];
}

export async function watchLanguageServerConfiguration(goCtx: GoExtensionContext, e: vscode.ConfigurationChangeEvent) {
	if (!e.affectsConfiguration('gno')) {
		return;
	}

	if (
		e.affectsConfiguration('gno.useLanguageServer') ||
		e.affectsConfiguration('gno.languageServerFlags') ||
		e.affectsConfiguration('gno.alternateTools') ||
		e.affectsConfiguration('gno.toolsEnvVars') ||
		e.affectsConfiguration('gno.formatTool')
		// TODO: Should we check http.proxy too? That affects toolExecutionEnvironment too.
	) {
		vscode.commands.executeCommand('gno.languageserver.restart', RestartReason.CONFIG_CHANGE);
	}
}

export async function buildLanguageServerConfig(
	goConfig: vscode.WorkspaceConfiguration
): Promise<LanguageServerConfig> {
	let formatter: GoDocumentFormattingEditProvider | undefined;
	if (usingCustomFormatTool(goConfig)) {
		formatter = new GoDocumentFormattingEditProvider();
	}
	const cfg: LanguageServerConfig = {
		serverName: '', // remain empty if gopls binary can't be found.
		path: '',
		enabled: goConfig['useLanguageServer'] === true,
		flags: goConfig['languageServerFlags'] || [],
		features: {
			// TODO: We should have configs that match these names.
			// Ultimately, we should have a centralized language server config rather than separate fields.
			formatter: formatter
		},
		env: toolExecutionEnvironment(),
		checkForUpdates: getCheckForToolsUpdatesConfig(goConfig)
	};
	// user has opted out of using the language server.
	if (!cfg.enabled) {
		return cfg;
	}

	// locate the configured language server tool.
	const languageServerPath = getLanguageServerToolPath();
	if (!languageServerPath) {
		// Assume the getLanguageServerToolPath will show the relevant
		// errors to the user. Disable the language server.
		cfg.enabled = false;
		return cfg;
	}
	cfg.path = languageServerPath;
	cfg.serverName = getToolFromToolPath(cfg.path) ?? '';

	// Get the mtime of the language server binary so that we always pick up
	// the right version.
	const stats = fs.statSync(languageServerPath);
	if (!stats) {
		vscode.window.showErrorMessage(`Unable to stat path to language server binary: ${languageServerPath}.
Please try reinstalling it.`);
		// Disable the language server.
		cfg.enabled = false;
		return cfg;
	}
	cfg.modtime = stats.mtime;
	cfg.version = await getLocalGoplsVersion(cfg);
	return cfg;
}

/**
 *
 * Return the absolute path to the correct binary. If the required tool is not available,
 * prompt the user to install it. Only gopls is officially supported.
 */
export function getLanguageServerToolPath(): string | undefined {
	const goConfig = getGnoConfig();
	// Check that all workspace folders are configured with the same GOPATH.
	if (!allFoldersHaveSameGopath()) {
		vscode.window.showInformationMessage(
			`The Gno language server is currently not supported in a multi-root set-up with different GNOPATHs (${gopathsPerFolder()}).`
		);
		return;
	}
	// Get the path to gopls (getBinPath checks for alternate tools).
	const goplsBinaryPath = getBinPath('gnopls');
	if (path.isAbsolute(goplsBinaryPath)) {
		return goplsBinaryPath;
	}
	const alternateTools = goConfig['alternateTools'];
	if (alternateTools) {
		// The user's alternate language server was not found.
		const goplsAlternate = alternateTools['gnopls'];
		if (goplsAlternate) {
			vscode.window.showErrorMessage(
				`Cannot find the alternate tool ${goplsAlternate} configured for gnopls.
Please install it and reload this VS Code window.`
			);
			return;
		}
	}

	// Prompt the user to install gopls.
	promptForMissingTool('gnopls');
}

function allFoldersHaveSameGopath(): boolean {
	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length <= 1) {
		return true;
	}
	const tempGopath = getCurrentGoPath(vscode.workspace.workspaceFolders[0].uri);
	return vscode.workspace.workspaceFolders.find((x) => tempGopath !== getCurrentGoPath(x.uri)) ? false : true;
}

function gopathsPerFolder(): string[] {
	const result: string[] = [];
	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		result.push(getCurrentGoPath(folder.uri));
	}
	return result;
}

export async function shouldUpdateLanguageServer(
	tool: Tool,
	cfg?: LanguageServerConfig,
	mustCheck?: boolean
): Promise<semver.SemVer | null | undefined> {
	if (!cfg) {
		return null;
	}
	// Only support updating gopls for now.
	if (tool.name !== 'gnopls' || (!mustCheck && (cfg.checkForUpdates === 'off' || getExtensionInfo().isInCloudIDE))) {
		return null;
	}
	if (!cfg.enabled) {
		return null;
	}

	// If the Go version is too old, don't update.
	const goVersion = await getGoVersion();
	if (!goVersion || (tool.minimumGoVersion && goVersion.lt(tool.minimumGoVersion.format()))) {
		return null;
	}

	// First, run the "gopls version" command and parse its results.
	// TODO(rstambler): Confirm that the gopls binary's modtime matches the
	// modtime in the config. Update it if needed.
	const usersVersion = await getLocalGoplsVersion(cfg);

	// We might have a developer version. Don't make the user update.
	if (usersVersion && usersVersion.version === '(devel)') {
		return null;
	}

	// Get the latest gopls version. If it is for nightly, using the prereleased version is ok.
	let latestVersion =
		cfg.checkForUpdates === 'local' ? tool.latestVersion : await latestToolVersion(tool, false);

	// If we failed to get the gopls version, pick the one we know to be latest at the time of this extension's last update
	if (!latestVersion) {
		latestVersion = tool.latestVersion;
	}

	// If "gopls" is so old that it doesn't have the "gopls version" command,
	// or its version doesn't match our expectations, usersVersion will be empty or invalid.
	// Suggest the latestVersion.
	if (!usersVersion || !semver.valid(usersVersion.version)) {
		return latestVersion;
	}

	// If the user's version does not contain a timestamp,
	// default to a semver comparison of the two versions.
	const usersVersionSemver = semver.parse(usersVersion.version, {
		includePrerelease: true,
		loose: true
	});
	return semver.lt(usersVersionSemver!, latestVersion!) ? latestVersion : null;
}

// Copied from src/cmd/go/internal/modfetch.go.
const pseudoVersionRE = /^v[0-9]+\.(0\.0-|\d+\.\d+-([^+]*\.)?0\.)\d{14}-[A-Za-z0-9]+(\+incompatible)?$/;

// parseTimestampFromPseudoversion returns the timestamp for the given
// pseudoversion. The timestamp is the center component, and it has the
// format "YYYYMMDDHHmmss".
function parseTimestampFromPseudoversion(version: string): moment.Moment | null {
	const split = version.split('-');
	if (split.length < 2) {
		return null;
	}
	if (!semver.valid(version)) {
		return null;
	}
	if (!pseudoVersionRE.test(version)) {
		return null;
	}
	const sv = semver.coerce(version);
	if (!sv) {
		return null;
	}
	// Copied from src/cmd/go/internal/modfetch.go.
	const build = sv.build.join('.');
	const buildIndex = version.lastIndexOf(build);
	if (buildIndex >= 0) {
		version = version.substring(0, buildIndex);
	}
	const lastDashIndex = version.lastIndexOf('-');
	version = version.substring(0, lastDashIndex);
	const firstDashIndex = version.lastIndexOf('-');
	const dotIndex = version.lastIndexOf('.');
	let timestamp: string;
	if (dotIndex > firstDashIndex) {
		// "vX.Y.Z-pre.0" or "vX.Y.(Z+1)-0"
		timestamp = version.substring(dotIndex + 1);
	} else {
		// "vX.0.0"
		timestamp = version.substring(firstDashIndex + 1);
	}
	return moment.utc(timestamp, 'YYYYMMDDHHmmss');
}

interface GoplsVersionOutput {
	GoVersion: string;
	Main: {
		Path: string;
		Version: string;
	};
}

// getLocalGoplsVersion returns the version of gopls that is currently
// installed on the user's machine. This is determined by running the
// `gnopls version` command.
//
// If this command has already been executed, it returns the saved result.
export const getLocalGoplsVersion = async (cfg?: LanguageServerConfig) => {
	if (!cfg) {
		return;
	}
	if (cfg.version) {
		return cfg.version;
	}
	if (cfg.path === '') {
		return;
	}
	const env = toolExecutionEnvironment();
	const cwd = getWorkspaceFolderPath();

	const execFile = util.promisify(cp.execFile);
	try {
		const { stdout } = await execFile(cfg.path, ['version', '-json'], {
			env,
			cwd
		});

		const v = <GoplsVersionOutput>JSON.parse(stdout);
		if (v?.Main.Version) {
			cfg.version = { version: v.Main.Version, goVersion: v.GoVersion };
			return cfg.version;
		}
	} catch (e) {
		// do nothing
	}

	// fall back to the old way (pre v0.8.0)
	let output = '';
	try {
		const { stdout } = await execFile(cfg.path, ['version'], { env, cwd });
		output = stdout;
	} catch (e) {
		// The "gnopls version" command is not supported, or something else went wrong.
		// TODO: Should we propagate this error?
		return;
	}

	const lines = output.trim().split('\n');
	switch (lines.length) {
		case 0:
			// No results, should update.
			// Worth doing anything here?
			return;
		case 1:
			// Built in $GOPATH mode. Should update.
			// TODO: Should we check the Go version here?
			// Do we even allow users to enable gopls if their Go version is too low?
			return;
		case 2:
			// We might actually have a parseable version.
			break;
		default:
			return;
	}

	// The second line should be the sum line.
	// It should look something like this:
	//
	//    golang.org/x/tools/gopls@v0.1.3 h1:CB5ECiPysqZrwxcyRjN+exyZpY0gODTZvNiqQi3lpeo=
	//
	// TODO(stamblerre): We should use a regex to match this, but for now, we split on the @ symbol.
	// The reasoning for this is that gopls still has a golang.org/x/tools/cmd/gopls binary,
	// so users may have a developer version that looks like "golang.org/x/tools@(devel)".
	const moduleVersion = lines[1].trim().split(' ')[0];

	// Get the relevant portion, that is:
	//
	//    golang.org/x/tools/gopls@v0.1.3
	//
	const split = moduleVersion.trim().split('@');
	if (split.length < 2) {
		return;
	}
	// The version comes after the @ symbol:
	//
	//    v0.1.3
	//
	cfg.version = { version: split[1] };
	return cfg.version;
};

// errorKind refers to the different possible kinds of gopls errors.
export enum errorKind {
	initializationFailure,
	crash,
	manualRestart
}

// suggestGoplsIssueReport prompts users to file an issue with gopls.
export async function suggestGoplsIssueReport(
	goCtx: GoExtensionContext,
	cfg: LanguageServerConfig, // config used when starting this gopls.
	msg: string,
	reason: errorKind,
	initializationError?: ResponseError<InitializeError>
) {
	const issueTime = new Date();

	// Don't prompt users who manually restart to file issues until gopls/v1.0.
	if (reason === errorKind.manualRestart) {
		return;
	}

	// cfg is the config used when starting this crashed gopls instance, while
	// goCtx.latestConfig is the config used by the latest gopls instance.
	// They may be different if gopls upgrade occurred in between.
	// Let's not report issue yet if they don't match.
	if (JSON.stringify(goCtx.latestConfig?.version) !== JSON.stringify(cfg.version)) {
		return;
	}

	// The user may have an outdated version of gopls, in which case we should
	// just prompt them to update, not file an issue.
	const tool = getTool('gnopls');
	if (tool) {
		const versionToUpdate = await shouldUpdateLanguageServer(tool, goCtx.latestConfig, true);
		if (versionToUpdate) {
			promptForUpdatingTool(tool.name, versionToUpdate, true);
			return;
		}
	}

	// Show the user the output channel content to alert them to the issue.
	goCtx.serverOutputChannel?.show();

	if (goCtx.latestConfig?.serverName !== 'gnopls') {
		return;
	}
	const promptForIssueOnGoplsRestartKey = 'promptForIssueOnGoplsRestart';
	let saved: any;
	try {
		saved = JSON.parse(getFromGlobalState(promptForIssueOnGoplsRestartKey, false));
	} catch (err) {
		console.log(`Failed to parse as JSON ${getFromGlobalState(promptForIssueOnGoplsRestartKey, true)}: ${err}`);
		return;
	}
	// If the user has already seen this prompt, they may have opted-out for
	// the future. Only prompt again if it's been more than a year since.
	if (saved) {
		const dateSaved = new Date(saved['date']);
		const prompt = <boolean>saved['prompt'];
		if (!prompt && daysBetween(new Date(), dateSaved) <= 365) {
			return;
		}
	}

	const { sanitizedLog, failureReason } = await collectGoplsLog(goCtx);

	// If the user has invalid values for "go.languageServerFlags", we may get
	// this error. Prompt them to double check their flags.
	let selected: string | undefined;
	if (failureReason === GoplsFailureModes.INCORRECT_COMMAND_USAGE) {
		const languageServerFlags = getGnoConfig()['languageServerFlags'] as string[];
		if (languageServerFlags && languageServerFlags.length > 0) {
			selected = await vscode.window.showErrorMessage(
				`The extension was unable to start the language server.
You may have an invalid value in your "gno.languageServerFlags" setting.
It is currently set to [${languageServerFlags}].
Please correct the setting.`,
				'Open Settings',
				'I need more help.'
			);
			switch (selected) {
				case 'Open Settings':
					await vscode.commands.executeCommand('workbench.action.openSettings', 'gno.languageServerFlags');
					return;
				case 'I need more help':
					// Fall through the automated issue report.
					break;
			}
		}
	}
	const showMessage = sanitizedLog ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
	selected = await showMessage(
		`${msg} Would you like to report a gnopls issue on GitHub?
You will be asked to provide additional information and logs, so PLEASE READ THE CONTENT IN YOUR BROWSER.`,
		'Yes',
		'Next time',
		'Never'
	);
	switch (selected) {
		case 'Yes':
			{
				// Prefill an issue title and report.
				let errKind: string;
				switch (reason) {
					case errorKind.crash:
						errKind = 'crash';
						break;
					case errorKind.initializationFailure:
						errKind = 'initialization';
						break;
				}
				const settings = goCtx.latestConfig.flags.join(' ');
				const title = `gnopls: automated issue report (${errKind})`;
				const goplsStats = await getGoplsStats(goCtx.latestConfig?.path);
				const goplsLog = sanitizedLog
					? `<pre>${sanitizedLog}</pre>`
					: `Please attach the stack trace from the crash.
A window with the error message should have popped up in the lower half of your screen.
Please copy the stack trace and error messages from that window and paste it in this issue.

<PASTE STACK TRACE HERE>

Failed to auto-collect gnopls trace: ${failureReason}.
`;

				const body = `
gnopls version: ${cfg.version?.version}/${cfg.version?.goVersion}
gnopls flags: ${settings}
update flags: ${cfg.checkForUpdates}
extension version: ${getExtensionInfo().version}
environment: ${getExtensionInfo().appName} ${process.platform}
initialization error: ${initializationError}
issue timestamp: ${issueTime.toUTCString()}
restart history:
${formatRestartHistory(goCtx)}

ATTENTION: PLEASE PROVIDE THE DETAILS REQUESTED BELOW.

Describe what you observed.

<ANSWER HERE>

${goplsLog}

<details><summary>gnopls stats -anon</summary>
${goplsStats}
</details>

OPTIONAL: If you would like to share more information, you can attach your complete gnopls logs.

NOTE: THESE MAY CONTAIN SENSITIVE INFORMATION ABOUT YOUR CODEBASE.
DO NOT SHARE LOGS IF YOU ARE WORKING IN A PRIVATE REPOSITORY.

<OPTIONAL: ATTACH LOGS HERE>
`;
				const url = `https://github.com/gnoverse/vscode-gno/issues/new?title=${title}&labels=automatedReport&body=${body}`;
				await vscode.env.openExternal(vscode.Uri.parse(url));
			}
			break;
		case 'Next time':
			break;
		case 'Never':
			updateGlobalState(
				promptForIssueOnGoplsRestartKey,
				JSON.stringify({
					prompt: false,
					date: new Date()
				})
			);
			break;
	}
}

export const showServerOutputChannel: CommandFactory = (ctx, goCtx) => () => {
	if (!goCtx.languageServerIsRunning) {
		vscode.window.showInformationMessage('gnopls is not running');
		return;
	}
	// likely show() is asynchronous, despite the documentation
	goCtx.serverOutputChannel?.show();
	let found: vscode.TextDocument | undefined;
	for (const doc of vscode.workspace.textDocuments) {
		if (doc.fileName.indexOf('extension-output-') !== -1) {
			// despite show() above, this might not get the output we want, so check
			const contents = doc.getText();
			if (contents.indexOf('[Info  - ') === -1) {
				continue;
			}
			if (found !== undefined) {
				vscode.window.showInformationMessage('multiple docs named extension-output-...');
			}
			found = doc;
			// .log, as some decoration is better than none
			vscode.workspace.openTextDocument({
				language: 'log',
				content: contents
			});
		}
	}
	if (found === undefined) {
		vscode.window.showErrorMessage('make sure "gnopls (server)" output is showing');
	}
};

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectGoplsLog(goCtx: GoExtensionContext): Promise<{ sanitizedLog?: string; failureReason?: string }> {
	goCtx.serverOutputChannel?.show();
	// Find the logs in the output channel. There is no way to read
	// an output channel directly, but we can find the open text
	// document, since we just surfaced the output channel to the user.
	// See https://github.com/microsoft/vscode/issues/65108.
	let logs: string | undefined;
	for (let i = 0; i < 10; i++) {
		// try a couple of times until successfully finding the channel.
		for (const doc of vscode.workspace.textDocuments) {
			if (doc.languageId !== 'Log') {
				continue;
			}
			if (doc.isDirty || doc.isClosed) {
				continue;
			}
			if (doc.fileName.indexOf('gnopls (server)') > -1) {
				logs = doc.getText();
				break;
			}
		}
		if (logs) {
			break;
		}
		// sleep a bit before the next try. The choice of the sleep time is arbitrary.
		await sleep((i + 1) * 100);
	}
	return sanitizeGoplsTrace(logs);
}

enum GoplsFailureModes {
	NO_GOPLS_LOG = 'no gnopls log',
	EMPTY_PANIC_TRACE = 'empty panic trace',
	INCORRECT_COMMAND_USAGE = 'incorrect gnopls command usage',
	UNRECOGNIZED_CRASH_PATTERN = 'unrecognized crash pattern'
}

// capture only panic stack trace and the initialization error message.
// exported for testing.
export function sanitizeGoplsTrace(logs?: string): { sanitizedLog?: string; failureReason?: string } {
	if (!logs) {
		return { failureReason: GoplsFailureModes.NO_GOPLS_LOG };
	}
	const panicMsgBegin = logs.lastIndexOf('panic: ');
	if (panicMsgBegin > -1) {
		// panic message was found.
		let panicTrace = logs.substr(panicMsgBegin);
		const panicMsgEnd = panicTrace.search(/\[(Info|Warning|Error)\s+-\s+/);
		if (panicMsgEnd > -1) {
			panicTrace = panicTrace.substr(0, panicMsgEnd);
		}
		const filePattern = /(\S+\.gno):\d+/;
		const sanitized = panicTrace
			.split('\n')
			.map((line: string) => {
				// Even though this is a crash from gopls, the file path
				// can contain user names and user's filesystem directory structure.
				// We can still locate the corresponding file if the file base is
				// available because the full package path is part of the function
				// name. So, leave only the file base.
				const m = line.match(filePattern);
				if (!m) {
					return line;
				}
				const filePath = m[1];
				const fileBase = path.basename(filePath);
				return line.replace(filePath, '  ' + fileBase);
			})
			.join('\n');

		if (sanitized) {
			return { sanitizedLog: sanitized };
		}
		return { failureReason: GoplsFailureModes.EMPTY_PANIC_TRACE };
	}
	// Capture Fatal
	//    foo.go:1: the last message (caveat - we capture only the first log line)
	const m = logs.match(/(^\S+\.gno:\d+:.*$)/gm);
	if (m && m.length > 0) {
		return { sanitizedLog: m[0].toString() };
	}
	const initFailMsgBegin = logs.lastIndexOf('gnopls client:');
	if (initFailMsgBegin > -1) {
		// client start failed. Capture up to the 'Code:' line.
		const initFailMsgEnd = logs.indexOf('Code: ', initFailMsgBegin);
		if (initFailMsgEnd > -1) {
			const lineEnd = logs.indexOf('\n', initFailMsgEnd);
			return {
				sanitizedLog:
					lineEnd > -1
						? logs.substr(initFailMsgBegin, lineEnd - initFailMsgBegin)
						: logs.substr(initFailMsgBegin)
			};
		}
	}
	if (logs.lastIndexOf('Usage:') > -1) {
		return { failureReason: GoplsFailureModes.INCORRECT_COMMAND_USAGE };
	}
	return { failureReason: GoplsFailureModes.UNRECOGNIZED_CRASH_PATTERN };
}

async function getGoplsStats(binpath?: string) {
	if (!binpath) {
		return 'gnopls path unknown';
	}
	const env = toolExecutionEnvironment();
	const cwd = getWorkspaceFolderPath();
	const start = new Date();
	const execFile = util.promisify(cp.execFile);
	try {
		const timeout = 60 * 1000; // 60sec;
		const { stdout } = await execFile(binpath, ['stats', '-anon'], {
			env,
			cwd,
			timeout
		});
		return stdout;
	} catch (e) {
		const duration = new Date().getTime() - start.getTime();
		console.log(`gnopls stats -anon failed: ${JSON.stringify(e)}`);
		return `gnopls stats -anon failed after ${duration} ms. Please check if gopls is killed by OS.`;
	}
}
