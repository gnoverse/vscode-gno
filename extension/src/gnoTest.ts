/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
'use strict';

import path = require('path');
import vscode = require('vscode');
import { CommandFactory } from './commands';
import { getGnoConfig } from './config';
import { GoExtensionContext } from './context';
import {
	getTestFlags,
	goTest,
	TestConfig,
	//SuiteToTestMap,
	getTestFunctions
} from './testUtils';

// lastTestConfig holds a reference to the last executed TestConfig which allows
// the last test to be easily re-executed.
let lastTestConfig: TestConfig | undefined;

// lastDebugConfig holds a reference to the last executed DebugConfiguration which allows
// the last test to be easily re-executed and debugged.
//let lastDebugConfig: vscode.DebugConfiguration | undefined;
//let lastDebugWorkspaceFolder: vscode.WorkspaceFolder | undefined;

export type TestAtCursorCmd = 'debug' | 'test';

class NotFoundError extends Error {}

async function _testAtCursor(
	goCtx: GoExtensionContext,
	goConfig: vscode.WorkspaceConfiguration,
	cmd: TestAtCursorCmd,
	args: any
) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		throw new NotFoundError('No editor is active.');
	}
	if (!editor.document.fileName.endsWith('_test.gno')) {
		throw new NotFoundError('No tests found. Current file is not a test file.');
	}

	const testFunctions = await getTestFunctions(goCtx, editor.document);
	const testFunctionName = args && args.functionName
		? args.functionName
		: testFunctions?.filter((func) => func.range.contains(editor.selection.start)).map((el) => el.name)[0];

	if (!testFunctionName) {
		throw new NotFoundError('No test function found at cursor.');
	}

	await editor.document.save();
	return runTestAtCursor(editor, testFunctionName, goConfig, args);
}

/**
 * Executes the unit test at the primary cursor using `go test`. Output
 * is sent to the 'Go' channel.
 * @param goConfig Configuration for the Go extension.
 * @param cmd Whether the command is test, benchmark, or debug.
 * @param args
 */
export function testAtCursor(cmd: TestAtCursorCmd): CommandFactory {
	return (ctx, goCtx) => (args: any) => {
		const goConfig = getGnoConfig();
		return _testAtCursor(goCtx, goConfig, cmd, args).catch((err) => {
			if (err instanceof NotFoundError) {
				vscode.window.showInformationMessage(err.message);
			} else {
				console.error(err);
			}
		});
	};
}

/**
 * Executes the unit test at the primary cursor if found, otherwise re-runs the previous test.
 * @param goConfig Configuration for the Go extension.
 * @param cmd Whether the command is test, benchmark, or debug.
 * @param args
 */
export function testAtCursorOrPrevious(cmd: TestAtCursorCmd): CommandFactory {
	return (ctx, goCtx) => async (args: any) => {
		const goConfig = getGnoConfig();
		try {
			await _testAtCursor(goCtx, goConfig, cmd, args);
		} catch (err) {
			if (err instanceof NotFoundError) {
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					await editor.document.save();
				}
				await testPrevious(ctx, goCtx)();
			} else {
				console.error(err);
			}
		}
	};
}

/**
 * Runs the test at cursor.
 */
async function runTestAtCursor(
	editor: vscode.TextEditor,
	testFunctionName: string,
	goConfig: vscode.WorkspaceConfiguration,
	args: any
) {
	const testConfig: TestConfig = {
		goConfig,
		dir: path.dirname(editor.document.fileName),
		flags: getTestFlags(goConfig, args),
		functions: [testFunctionName]
	};
	lastTestConfig = testConfig;
	return goTest(testConfig);
}

/**
 * Runs all tests in the package of the source of the active editor.
 *
 * @param goConfig Configuration for the Go extension.
 */
export function testCurrentPackage(): CommandFactory {
	return () => async (args: any) => {
		const goConfig = getGnoConfig();
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No editor is active.');
			return;
		}

		const testConfig: TestConfig = {
			goConfig,
			dir: path.dirname(editor.document.fileName),
			flags: getTestFlags(goConfig, args)
		};
		lastTestConfig = testConfig;
		return goTest(testConfig);
	};
}

/**
 * Runs all tests from all directories in the workspace.
 *
 * @param goConfig Configuration for the Go extension.
 */
export const testWorkspace: CommandFactory = () => (args: any) => {
	const goConfig = getGnoConfig();
	if (!vscode.workspace.workspaceFolders?.length) {
		vscode.window.showInformationMessage('No workspace is open to run tests.');
		return;
	}

	let workspaceUri: vscode.Uri | undefined = vscode.workspace.workspaceFolders[0].uri;
	if (
		vscode.window.activeTextEditor &&
		vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
	) {
		workspaceUri = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)!.uri;
	}

	const testConfig: TestConfig = {
		goConfig,
		dir: workspaceUri.fsPath,
		flags: getTestFlags(goConfig, args),
		includeSubDirectories: true
	};

	lastTestConfig = testConfig;

	goTest(testConfig).then(null, (err) => {
		console.error(err);
	});
};

/**
 * Runs all tests in the source of the active editor.
 *
 * @param goConfig Configuration for the Go extension.
 * @param isBenchmark Boolean flag indicating if these are benchmark tests or not.
 */
export function testCurrentFile(getConfig = getGnoConfig): CommandFactory {
	return (ctx, goCtx) => async (args: string[]) => {
		const goConfig = getConfig();
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No editor is active.');
			return false;
		}
		if (!editor.document.fileName.endsWith('_test.gno')) {
			vscode.window.showInformationMessage('No tests found. Current file is not a test file.');
			return false;
		}

		return editor.document.save()
			.then(() => {
				return getTestFunctions(goCtx, editor.document).then((testFunctions) => {
					const testConfig: TestConfig = {
						goConfig,
						dir: path.dirname(editor.document.fileName),
						flags: getTestFlags(goConfig, args),
						functions: testFunctions?.map((sym) => sym.name)
					};
					lastTestConfig = testConfig;
					return goTest(testConfig);
				});
			})
			.then(undefined, (err) => {
				console.error(err);
				return Promise.resolve(false);
			});
	};
}

/**
 * Runs the previously executed test.
 */
export const testPrevious: CommandFactory = () => () => {
	if (!lastTestConfig) {
		vscode.window.showInformationMessage('No test has been recently executed.');
		return;
	}
	goTest(lastTestConfig).then(null, (err) => {
		console.error(err);
	});
};
