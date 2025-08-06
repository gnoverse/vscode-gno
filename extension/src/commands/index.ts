/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 * This file contains code modified from the original Go extension for Visual Studio Code.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { GoExtensionContext } from '../context';

//export { applyCoverprofile } from './applyCoverprofile';
export { getConfiguredGoTools } from './getConfiguredGnoTools';
export { getCurrentGoPath } from './getCurrentGnoPath';
export { getCurrentGoRoot } from './getCurrentGnoRoot';
export * from '../gnoTest';
export { installTools } from './installTools';
export { runBuilds } from './runBuilds';
export { showCommands } from './showCommands';
export { startDebugSession } from './startDebugSession';
export { startGnoDevServer, stopGnoDevServer } from './startGnoDevServer';
export { startLanguageServer } from './startLanguageServer';
export { startGoplsMaintainerInterface } from './startLanguageServer';

type CommandCallback<T extends unknown[]> = (...args: T) => Promise<unknown> | unknown;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandFactory<T extends unknown[] = any[]> = (
	ctx: vscode.ExtensionContext,
	goCtx: GoExtensionContext
) => CommandCallback<T>;

export function createRegisterCommand(ctx: vscode.ExtensionContext, goCtx: GoExtensionContext) {
	return function registerCommand(name: string, fn: CommandFactory) {
		ctx.subscriptions.push(vscode.commands.registerCommand(name, fn(ctx, goCtx)));
	};
}
