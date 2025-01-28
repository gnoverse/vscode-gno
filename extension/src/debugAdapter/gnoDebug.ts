//import * as vscode from vscode;
import {
	DebugSession,
	InitializedEvent,
	TerminatedEvent,
	StoppedEvent,
	LoggingDebugSession
} from 'vscode-debugadapter';

import { DebugProtocol } from 'vscode-debugprotocol';

interface GnoLaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	program: string; // path gno for debug
}


class GnoDebugSession extends LoggingDebugSession {
	public constructor() {
		super("gno-debug.txt");

		this.setDebuggerLinesStartAt1(true);
		this.setDebuggerColumnsStartAt1(true);
	}

	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
		response.body = response.body || {};
		response.body.supportsConfigurationDoneRequest = true;
		this.sendResponse(response);
		this.sendEvent(new InitializedEvent());
	}

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments, request?: DebugProtocol.Request): void {
		response.body = {
			breakpoints: []
		};
		this.sendResponse(response);
	}

	protected launchRequest(response: DebugProtocol.LaunchResponse, args: GnoLaunchRequestArguments, request?: DebugProtocol.Request): void {
		const programPath = args.program;
		console.log(`Launch gno program : ${programPath}`);
		this.sendResponse(response);
	}
}

GnoDebugSession.run(GnoDebugSession);