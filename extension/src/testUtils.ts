/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-useless-escape */
/* eslint-disable no-async-promise-executor */
/* eslint-disable no-prototype-builtins */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import cp = require('child_process');
import path = require('path');
import util = require('util');
import vscode = require('vscode');
import fs = require('fs');

import { toolExecutionEnvironment } from './gnoEnv';
import { getCurrentPackage } from './gnoModules';
import { GoDocumentSymbolProvider } from './gnoDocumentSymbols';
import { getNonVendorPackages } from './gnoPackages';
import { getBinPath, getCurrentGoPath, getTempFilePath, LineBuffer, resolvePath } from './util';
import { parseEnvFile } from './utils/envUtils';
import {
	getEnvPath,
	expandFilePathInOutput,
	getCurrentGoRoot,
	getCurrentGoWorkspaceFromGOPATH
} from './utils/pathUtils';
import { killProcessTree } from './utils/processUtils';
import { GoExtensionContext } from './context';

const testOutputChannel = vscode.window.createOutputChannel('Gno Tests');
const STATUS_BAR_ITEM_NAME = 'Gno Test Cancel';
const statusBarItem = vscode.window.createStatusBarItem(STATUS_BAR_ITEM_NAME, vscode.StatusBarAlignment.Left);
statusBarItem.name = STATUS_BAR_ITEM_NAME;
statusBarItem.command = 'gno.test.cancel';
statusBarItem.text = '$(x) Cancel Running Tests';

/**
 *  testProcesses holds a list of currently running test processes.
 */
const runningTestProcesses: cp.ChildProcess[] = [];

// https://github.com/golang/go/blob/117b1c84d3678a586c168a5f7f2f0a750c27f0c2/src/cmd/go/internal/load/test.go#L487
// uses !unicode.isLower to find test/example/benchmark functions.
// There could be slight difference between \P{Ll} (not lowercase letter)
// & go unicode package's uppercase detection. But hopefully
// these will be replaced by gopls's codelens computation soon.
const testFuncRegex = /^Test$|^Test\P{Ll}.*/u;
//const testFuncRegex = /^Test$|^Test\P{Ll}.*|^Example$|^Example\P{Ll}.*/u;
//const testMethodRegex = /^\(([^)]+)\)\.(Test|Test\P{Ll}.*)$/u;
//const benchmarkRegex = /^Benchmark$|^Benchmark\P{Ll}.*/u;
//const fuzzFuncRegx = /^Fuzz$|^Fuzz\P{Ll}.*/u;
//const testMainRegex = /TestMain\(.*\*testing.M\)/;
//const runTestSuiteRegex = /^\s*suite\.Run\(\w+,\s*(?:&?(?<type1>\w+)\{|new\((?<type2>\w+)\))/mu;

/**
 * Input to goTest.
 */
export interface TestConfig {
	/**
	 * The working directory for `gno test`.
	 */
	dir: string;
	/**
	 * Configuration for the Gno extension
	 */
	goConfig: vscode.WorkspaceConfiguration;
	/**
	 * Test flags to override the testFlags and buildFlags from goConfig.
	 */
	flags: string[];
	/**
	 * Specific function names to test.
	 */
	functions?: string[];
	/**
	 * Test was not requested explicitly. The output should not appear in the UI.
	 */
	background?: boolean;
	/**
	 * Output channel for test output.
	 */
	outputChannel?: vscode.OutputChannel;
	/**
	 * Can be used to terminate the test process.
	 */
	cancel?: vscode.CancellationToken;
	includeSubDirectories?: boolean;
}

export function getTestEnvVars(config: vscode.WorkspaceConfiguration): any {
	const envVars = toolExecutionEnvironment();
	const testEnvConfig = config['testEnvVars'] || {};

	let fileEnv: { [key: string]: any } = {};
	let testEnvFile = config['testEnvFile'];
	if (testEnvFile) {
		testEnvFile = resolvePath(testEnvFile);
		try {
			fileEnv = parseEnvFile(testEnvFile, envVars);
		} catch (e) {
			console.log(e);
		}
	}

	Object.keys(fileEnv).forEach(
		(key) => (envVars[key] = typeof fileEnv[key] === 'string' ? resolvePath(fileEnv[key]) : fileEnv[key])
	);
	Object.keys(testEnvConfig).forEach(
		(key) =>
			(envVars[key] =
				typeof testEnvConfig[key] === 'string' ? resolvePath(testEnvConfig[key]) : testEnvConfig[key])
	);

	return envVars;
}

export function getTestFlags(goConfig: vscode.WorkspaceConfiguration, args?: any): string[] {
	let testFlags: string[] = goConfig['testFlags'] || goConfig['buildFlags'] || [];
	testFlags = testFlags.map((x) => resolvePath(x)); // Use copy of the flags, dont pass the actual object from config
	return args && args.hasOwnProperty('flags') && Array.isArray(args['flags']) ? args['flags'] : testFlags;
}

export function getTestTags(goConfig: vscode.WorkspaceConfiguration): string {
	return goConfig['testTags'] !== null ? goConfig['testTags'] : goConfig['buildTags'];
}

/**
 * Returns all Go unit test functions in the given source file.
 *
 * @param the URI of a Go source file.
 * @return test function symbols for the source file.
 */
export async function getTestFunctions(
	goCtx: GoExtensionContext,
	doc: vscode.TextDocument,
	token?: vscode.CancellationToken
): Promise<vscode.DocumentSymbol[] | undefined> {
	const documentSymbolProvider = GoDocumentSymbolProvider(goCtx, true);
	const symbols = await documentSymbolProvider.provideDocumentSymbols(doc);

	if (!symbols || symbols.length === 0 || !symbols[0]) {
		return undefined;
	}

	const children = symbols[0].children;

	return children.filter((sym) => sym.kind === vscode.SymbolKind.Function && testFuncRegex.test(sym.name));
}

/**
 * go test -json output format.
 * which is a subset of https://golang.org/cmd/test2json/#hdr-Output_Format
 * and includes only the fields that we are using.
 */
export interface GoTestOutput {
	Action: string;
	Output?: string;
	Package?: string;
	Test?: string;
	Elapsed?: number; // seconds
}

/**
 * Runs gno test and presents the output in the 'Gno' channel.
 *
 * @param goConfig Configuration for the Gno extension.
 */

export async function goTest(testconfig: TestConfig): Promise<boolean> {
	let outputChannel = testOutputChannel;
	if (testconfig.outputChannel) {
		outputChannel = testconfig.outputChannel;
	}

	const goRuntimePath = getBinPath('gno');
	if (!goRuntimePath) {
		vscode.window.showErrorMessage(
			`Failed to run "gno test" as the "gno" binary cannot be found in PATH(${getEnvPath()})`
		);
		return Promise.resolve(false);
	}

	if (runningTestProcesses.length < 1) {
		outputChannel.clear();
	}

	if (testconfig.goConfig['disableConcurrentTests']) {
		await cancelRunningTests();
	}

	if (!testconfig.background) {
		outputChannel.show(true);
	}

	const testType = 'Tests';

	// Construct the file path for testing
	let testTarget: string;
	if (testconfig.includeSubDirectories) {
		testTarget = './...';
	} else if (testconfig.functions && testconfig.functions.length > 0) {
		const files: string[] = fs.readdirSync(testconfig.dir);
		const testFile: string | undefined = files.find((f: string): boolean => f.endsWith('_test.gno'));
		if (testFile) {
			testTarget = path.join(testconfig.dir, testFile);
		} else {
			testTarget = testconfig.dir;
		}
	} else {
		testTarget = testconfig.dir;
	}

	const args = ['test'];
	const outArgs = ['test'];

	// Add timeout if specified
	if (testconfig.goConfig['testTimeout'] !== '0s') {
		args.push('-timeout', testconfig.goConfig['testTimeout']);
		outArgs.push('-timeout', testconfig.goConfig['testTimeout']);
	}

	// Add test function filter if specified
	if (testconfig.functions && testconfig.functions.length > 0) {
		args.push('-run', testconfig.functions.join('|'));
		outArgs.push('-run', testconfig.functions.join('|'));
	}

	// Add the test target
	args.push(testTarget);
	outArgs.push(testTarget);

	// Add any user specified flags
	if (testconfig.flags) {
		args.push(...testconfig.flags);
		outArgs.push(...testconfig.flags);
	}

	outputChannel.appendLine(['Running tool:', goRuntimePath, ...outArgs].join(' '));
	outputChannel.appendLine('');

	let testResult = false;
	try {
		testResult = await new Promise<boolean>(async (resolve, reject) => {
			const testEnvVars = getTestEnvVars(testconfig.goConfig);
			const tp = cp.spawn(goRuntimePath, args, {
				env: testEnvVars,
				cwd: testconfig.dir
			});
			const outBuf = new LineBuffer();
			const errBuf = new LineBuffer();

			testconfig.cancel?.onCancellationRequested(() => killProcessTree(tp));

			outBuf.onLine((line) => outputChannel.appendLine(line));
			outBuf.onDone((last) => last && outputChannel.appendLine(last));

			errBuf.onLine((line) => outputChannel.appendLine(line));
			errBuf.onDone((last) => last && outputChannel.appendLine(last));

			tp.stdout.on('data', (chunk) => outBuf.append(chunk.toString()));
			tp.stderr.on('data', (chunk) => errBuf.append(chunk.toString()));

			statusBarItem.show();

			tp.on('close', (code, signal) => {
				outBuf.done();
				errBuf.done();

				const index = runningTestProcesses.indexOf(tp, 0);
				if (index > -1) {
					runningTestProcesses.splice(index, 1);
				}

				if (!runningTestProcesses.length) {
					statusBarItem.hide();
				}

				resolve(code === 0);
			});

			runningTestProcesses.push(tp);
		});
	} catch (err) {
		outputChannel.appendLine(`Error: ${testType} failed.`);
		if (err instanceof Error) {
			outputChannel.appendLine((err as Error).message);
		}
	}

	return testResult;
}

// computeTestCommand returns the test command argument list and extra info necessary
// to post process the test results.
// Exported for testing.

export function computeTestCommand(
	testconfig: TestConfig,
	targets: string[]
): {
	args: Array<string>;
	outArgs: Array<string>;
	tmpCoverPath?: string;
} {
	const args: Array<string> = ['test'];

	// user-specified flags
	const argsFlagIdx = testconfig.flags?.indexOf('-args') ?? -1;
	const userFlags = argsFlagIdx < 0 ? testconfig.flags : testconfig.flags.slice(0, argsFlagIdx);
	const userArgsFlags = argsFlagIdx < 0 ? [] : testconfig.flags.slice(argsFlagIdx);

	// flags to limit test time
	if (testconfig.goConfig['testTimeout'] !== '0s') {
		args.push('-timeout', testconfig.goConfig['testTimeout']);
	}

	const outArgs = args.slice(0);

	if (targets.length > 4) {
		outArgs.push('<long arguments omitted>');
	} else {
		outArgs.push(...targets);
	}
	args.push(...targets);

	// ensure that user provided flags are appended last (allow use of -args ...)
	if (args.indexOf('-run') > -1) {
		removeRunFlag(userFlags);
	}

	args.push(...userFlags);
	outArgs.push(...userFlags);

	args.push(...userArgsFlags);
	outArgs.push(...userArgsFlags);

	return {
		args,
		outArgs,
		tmpCoverPath: undefined
	};
}

/**
 * Reveals the output channel in the UI.
 */
export function showTestOutput() {
	testOutputChannel.show(true);
}

/**
 * Iterates the list of currently running test processes and kills them all.
 */
export function cancelRunningTests(): Thenable<boolean> {
	return new Promise<boolean>((resolve, reject) => {
		runningTestProcesses.forEach((tp) => {
			killProcessTree(tp);
		});
		// All processes are now dead. Empty the array to prepare for the next run.
		runningTestProcesses.splice(0, runningTestProcesses.length);
		statusBarItem.hide();
		resolve(true);
	});
}

function removeRunFlag(flags: string[]): void {
	const index: number = flags.indexOf('-run');
	if (index !== -1) {
		flags.splice(index, 2);
	}
}
