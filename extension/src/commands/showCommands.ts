/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { CommandFactory } from '.';
import { getExtensionCommands } from '../util';

export const showCommands: CommandFactory = () => {
	return () => {
		const extCommands = getExtensionCommands();
		extCommands.push({
			command: 'editor.action.goToDeclaration',
			title: 'Gno to Definition'
		});
		extCommands.push({
			command: 'editor.action.goToImplementation',
			title: 'Gno to Implementation'
		});
		extCommands.push({
			command: 'workbench.action.gotoSymbol',
			title: 'Gno to Symbol in File...'
		});
		extCommands.push({
			command: 'workbench.action.showAllSymbols',
			title: 'Gno to Symbol in Workspace...'
		});
		vscode.window.showQuickPick(extCommands.map((x) => x.title)).then((cmd) => {
			const selectedCmd = extCommands.find((x) => x.title === cmd);
			if (selectedCmd) {
				vscode.commands.executeCommand(selectedCmd.command);
			}
		});
	};
};
