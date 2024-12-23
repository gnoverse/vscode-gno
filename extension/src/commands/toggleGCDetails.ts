/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { CommandFactory } from '.';

export const toggleGCDetails: CommandFactory = (ctx, goCtx) => {
	return async () => {
		if (!goCtx.languageServerIsRunning) {
			vscode.window.showErrorMessage(
				'"Gno: Toggle gc details" command is available only when the language server is running'
			);
			return;
		}
		const doc = vscode.window.activeTextEditor?.document.uri.toString();
		if (!doc || !doc.endsWith('.gno')) {
			vscode.window.showErrorMessage('"Gno: Toggle gc details" command cannot run when no Gno file is open.');
			return;
		}
		try {
			await vscode.commands.executeCommand('gnopls.gc_details', doc);
		} catch (e) {
			vscode.window.showErrorMessage(`"Gno: Toggle gc details" command failed: ${e}`);
		}
	};
};
