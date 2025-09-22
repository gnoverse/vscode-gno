/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import cp = require('child_process');
import path = require('path');
import vscode = require('vscode');
import { CommandFactory } from './commands';
import { getGnoConfig } from './config';
import { toolExecutionEnvironment } from './gnoEnv';
import { isModSupported } from './gnoModules';
import { outputChannel } from './gnoStatus';
import { getBinPath, getCurrentGoPath, getModuleCache } from './util';
import { getEnvPath, getCurrentGoRoot, getCurrentGoWorkspaceFromGOPATH } from './utils/pathUtils';

export const installCurrentPackage: CommandFactory = () => async () => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active, cannot find current package to install');
		return;
	}
	if (editor.document.languageId !== 'gno') {
		vscode.window.showInformationMessage(
			'File in the active editor is not a Go file, cannot find current package to install'
		);
		return;
	}

	const goRuntimePath = getBinPath('gno');
	if (!goRuntimePath) {
		vscode.window.showErrorMessage(
			`Failed to run "go install" to install the package as the "go" binary cannot be found in either GOROOT(${getCurrentGoRoot()}) or PATH(${getEnvPath()})`
		);
		return;
	}

	const env = toolExecutionEnvironment();
	const cwd = path.dirname(editor.document.uri.fsPath);
	const isMod = await isModSupported(editor.document.uri);

	// Skip installing if cwd is in the module cache
	const cache = getModuleCache();
	if (isMod && cache && cwd.startsWith(cache)) {
		return;
	}

	const goConfig = getGnoConfig();
	const buildFlags = goConfig['buildFlags'] || [];
	const args = ['install', ...buildFlags];

	if (goConfig['buildTags'] && buildFlags.indexOf('-tags') === -1) {
		args.push('-tags', goConfig['buildTags']);
	}

	// Find the right importPath instead of directly using `.`. Fixes https://github.com/Microsoft/vscode-go/issues/846
	const currentGoWorkspace = getCurrentGoWorkspaceFromGOPATH(getCurrentGoPath(), cwd);
	const importPath = currentGoWorkspace && !isMod ? cwd.substr(currentGoWorkspace.length + 1) : '.';
	args.push(importPath);

	outputChannel.appendLine(`Installing ${importPath === '.' ? 'current package' : importPath}`);

	cp.execFile(goRuntimePath, args, { env, cwd }, (err, stdout, stderr) => {
		if (err) {
			outputChannel.error(`Installation failed: ${stderr}`);
		} else {
			outputChannel.appendLine('Installation successful');
		}
	});
};
