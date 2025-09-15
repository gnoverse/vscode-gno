/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { getGnoConfig } from './config';
import { getCurrentGoPath, getToolsGopath, resolvePath, substituteEnv } from './util';
import { dirExists } from './utils/pathUtils';
import { getFromGlobalState, updateGlobalState } from './stateUtils';
import { outputChannel } from './gnoStatus';

// toolInstallationEnvironment returns the environment in which tools should
// be installed. It always returns a new object.
export function toolInstallationEnvironment(): NodeJS.Dict<string> {
	const env = newEnvironment();

	// If the go.toolsGopath is set, use its value as the GOPATH for `go` processes.
	// Else use the Current Gopath
	let toolsGopath = getToolsGopath();
	if (toolsGopath) {
		// User has explicitly chosen to use toolsGopath, so ignore GOBIN.
		env['GOBIN'] = '';
	} else {
		toolsGopath = getCurrentGoPath();
	}
	if (!toolsGopath) {
		const msg = 'Cannot install Go tools. Set either go.gopath or go.toolsGopath in settings.';
		vscode.window.showInformationMessage(msg, 'Open User Settings', 'Open Workspace Settings').then((selected) => {
			switch (selected) {
				case 'Open User Settings':
					vscode.commands.executeCommand('workbench.action.openGlobalSettings');
					break;
				case 'Open Workspace Settings':
					vscode.commands.executeCommand('workbench.action.openWorkspaceSettings');
					break;
			}
		});
		return {};
	}
	env['GOPATH'] = toolsGopath;

	// Explicitly set 'auto' so tools that require
	// a newer toolchain can be built.
	// We don't use unset, but unconditionally set this env var
	// since some users may change the env var using GOENV,
	// GOROOT/.goenv, or toolchain modification.
	env['GOTOOLCHAIN'] = 'auto';

	// Unset env vars that would affect tool build process: 'GOROOT', 'GOOS', 'GOARCH', ...
	// Tool installation should be done for the host OS/ARCH (GOHOSTOS/GOHOSTARCH) with
	// the default setup.
	delete env['GOOS'];
	delete env['GOARCH'];
	delete env['GOROOT'];
	delete env['GOFLAGS'];
	delete env['GOENV'];
	delete env['GO111MODULE']; // we require module mode (default) for tools installation.

	return env;
}

// toolExecutionEnvironment returns the environment in which tools should
// be executed. It always returns a new object.
export function toolExecutionEnvironment(uri?: vscode.Uri, addProcessEnv = true): NodeJS.Dict<string> {
	const env = newEnvironment(uri, addProcessEnv);
	const gopath = getCurrentGoPath(uri);
	if (gopath) {
		env['GOPATH'] = gopath;
	}

	// Remove json flag (-json or --json=<any>) from GOFLAGS because it will effect to result format of the execution
	if (env['GOFLAGS'] && env['GOFLAGS'].includes('-json')) {
		env['GOFLAGS'] = env['GOFLAGS'].replace(/(^|\s+)-?-json[^\s]*/g, '');
		outputChannel.debug(`removed -json from GOFLAGS: ${env['GOFLAGS']}`);
	}
	return env;
}

function newEnvironment(uri?: vscode.Uri, addProcessEnv = true): NodeJS.Dict<string> {
	const toolsEnvVars = getGnoConfig(uri)['toolsEnvVars'];
	const env = addProcessEnv ? Object.assign({}, process.env) : {};
	if (toolsEnvVars && typeof toolsEnvVars === 'object') {
		Object.keys(toolsEnvVars).forEach(
			(key) =>
				(env[key] =
					typeof toolsEnvVars[key] === 'string'
						? resolvePath(substituteEnv(toolsEnvVars[key]))
						: toolsEnvVars[key])
		);
	}

	// The http.proxy setting takes precedence over environment variables.
	const httpProxy = vscode.workspace.getConfiguration('http', null).get('proxy');
	if (httpProxy && typeof httpProxy === 'string') {
		env['http_proxy'] = httpProxy;
		env['HTTP_PROXY'] = httpProxy;
		env['https_proxy'] = httpProxy;
		env['HTTPS_PROXY'] = httpProxy;
	}
	return env;
}

// set GOROOT env var. If necessary, shows a warning.
export async function setGOROOTEnvVar(configGOROOT: string) {
	if (!configGOROOT) {
		return;
	}
	const goroot = configGOROOT ? resolvePath(substituteEnv(configGOROOT)) : undefined;

	const currentGOROOT = process.env['GOROOT'];
	if (goroot === currentGOROOT) {
		return;
	}
	if (!(await dirExists(goroot ?? ''))) {
		vscode.window.showWarningMessage(`gno.gnoroot setting is ignored. ${goroot} is not a valid GNOROOT directory.`);
		return;
	}
	const neverAgain = { title: "Don't Show Again" };
	const ignoreGOROOTSettingWarningKey = 'ignoreGOROOTSettingWarning';
	const ignoreGOROOTSettingWarning = getFromGlobalState(ignoreGOROOTSettingWarningKey);
	if (!ignoreGOROOTSettingWarning) {
		vscode.window
			.showInformationMessage(
				`"gno.gnoroot" setting (${goroot}) will be applied and set the GNOROOT environment variable.`,
				neverAgain
			)
			.then((result) => {
				if (result === neverAgain) {
					updateGlobalState(ignoreGOROOTSettingWarningKey, true);
				}
			});
	}

	outputChannel.debug(
		`setting GNOROOT = ${goroot} (old value: ${currentGOROOT}) because "gno.gnoroot": "${configGOROOT}"`
	);
	if (goroot) {
		process.env['GOROOT'] = goroot;
	} else {
		delete process.env.GOROOT;
	}
}
