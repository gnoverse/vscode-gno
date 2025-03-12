import { EventEmitter } from "events";
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import {
    DebugSession,
    InitializedEvent,
    TerminatedEvent,
    StoppedEvent,
    Breakpoint,
    Thread,
    Scope,
    OutputEvent
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';

// Client that handles communication with the Gno debugger process
export class GnoDebuggerClient extends EventEmitter {
    private proc: ChildProcess;
    private outputBuffer: string = "";
    private waitingResolve: ((value: string) => void) | null = null;
    private readonly promptText = "bdg>";

    constructor(private program: string) {
        super();
        this.proc = spawn("gno", ["run", "-debug", program], {
            cwd: process.cwd(),
            env: process.env
        });

        this.proc.stdout?.on('data', (data: Buffer) => {
            this.handleData(data.toString());
        });

        this.proc.stderr?.on('data', (data: Buffer) => {
            this.emit("output", data.toString());
        });
    }

    // Parses debugger output and resolves pending promises when prompt is detected
    private handleData(data: string): void {
        this.emit("output", data);

        this.outputBuffer += data;
        const trimmedBuffer = this.outputBuffer.trim();
        const promptIndex = trimmedBuffer.indexOf(this.promptText);
        if (promptIndex !== -1) {
            const output = trimmedBuffer.substring(0, promptIndex);
            this.outputBuffer = trimmedBuffer.substring(promptIndex + this.promptText.length);
            if (this.waitingResolve) {
                this.waitingResolve(output.trim());
                this.waitingResolve = null;
            }
        }
    }

    // Sends commands to the debugger and returns response as promise
    public sendCommand(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            try {
                this.waitingResolve = resolve;
                this.proc.stdin?.write(command + "\n");
            } catch (error) {
                reject(error);
            }
        });
    }

    public dispose(): void {
        this.proc.kill();
    }

    public async setBreakpoint(line: number): Promise<boolean> {
        const response = await this.sendCommand(`b ${line}`);
        return response.toLowerCase().includes('breakpoint');
    }

    public async getStackTrace(): Promise<{
        frame: number;
        function: string;
        file: string;
        line: number;
        column: number;
    }[]> {
        const response = await this.sendCommand('stack');
        return this.parseStackTrace(response);
    }

    // Parses stack trace output into structured format
    private parseStackTrace(output: string) {
        const frames = [];
        const lines = output.split('\n').filter(l => l.trim());
        for (let i = 0; i < lines.length - 1; i += 2) {
            const frameLine = lines[i];
            const locLine = lines[i + 1];
            const frameMatch = frameLine.match(/^(\d+)\s+in\s+(.+)$/);
            const locMatch = locLine.match(/^at\s+(.+):(\d+):(\d+)$/);
            if (frameMatch && locMatch) {
                frames.push({
                    frame: parseInt(frameMatch[1]),
                    function: frameMatch[2],
                    file: locMatch[1],
                    line: parseInt(locMatch[2]),
                    column: parseInt(locMatch[3]),
                });
            }
        }
        return frames;
    }
}

// Main debug adapter implementation that connects VSCode to the Gno debugger
export class GnoDebugSession extends DebugSession {
    private static THREAD_ID = 1;
    private client: GnoDebuggerClient | undefined;

    public constructor() {
        super();
        this.setDebuggerLinesStartAt1(true);
        this.setDebuggerColumnsStartAt1(true);
    }
    protected async evaluateRequest(
        response: DebugProtocol.EvaluateResponse,
        args: DebugProtocol.EvaluateArguments
    ): Promise<void> {
        console.log("Evaluate request:", args.expression);
        if (!this.client) {
            response.body = { result: "Debugger not initialized", variablesReference: 0 };
            this.sendResponse(response);
            return;
        }
        try {
            const output = await this.client.sendCommand(args.expression);
            response.body = { result: output.trim(), variablesReference: 0 };
        } catch (error) {
            response.body = { result: `Error: ${error}`, variablesReference: 0 };
        }
        this.sendResponse(response);
    }

    // Initializes debug session and declares supported features
    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments
    ): void {
        response.body = response.body || {};
        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsEvaluateForHovers = true;
        response.body.supportsTerminateRequest = true;
        response.body.supportTerminateDebuggee = true;
        response.body.supportsCompletionsRequest = true;
        this.sendResponse(response);
        this.sendEvent(new InitializedEvent());
    }

    // Launches the debugger process and sets up event handlers
    protected async launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: any
    ): Promise<void> {
        try {
            this.client = new GnoDebuggerClient(args.program);

            await new Promise<void>((resolve) => {
                this.client?.on("initialized", () => {
                    resolve();
                });

                setTimeout(() => {
                    resolve();
                }, 5000);
            });

            this.client.on("output", (data: string) => {
                this.sendEvent(new OutputEvent(data, "stdout"));
            });

            this.sendResponse(response);
            this.sendEvent(new StoppedEvent("entry", GnoDebugSession.THREAD_ID));
        } catch (error) {
            console.error("Launch failed:", error);
            this.sendErrorResponse(response, {
                id: 1,
                format: `Failed to launch debugger: ${error}`,
                showUser: true
            });
        }
    }

    // Handles breakpoint setting and clearing
    protected async setBreakpointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): Promise<void> {
        if (!this.client) {
            response.body = { breakpoints: [] };
            this.sendResponse(response);
            return;
        }

        await this.client.sendCommand("clear");
        const breakpoints: Breakpoint[] = [];

        if (args.breakpoints) {
            for (const bp of args.breakpoints) {
                const success = await this.client.setBreakpoint(bp.line);
                breakpoints.push(new Breakpoint(success, bp.line));
            }
        }

        response.body = { breakpoints };
        this.sendResponse(response);
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = { threads: [new Thread(GnoDebugSession.THREAD_ID, "Main Thread")] };
        this.sendResponse(response);
    }

    protected async stackTraceRequest(
        response: DebugProtocol.StackTraceResponse,
        args: DebugProtocol.StackTraceArguments
    ): Promise<void> {
        if (!this.client) {
            response.body = { stackFrames: [] };
            this.sendResponse(response);
            return;
        }

        try {
            const stackFrames = await this.client.getStackTrace();
            response.body = {
                stackFrames: stackFrames.map(f => ({
                    id: f.frame,
                    name: f.function,
                    source: {
                        name: path.basename(f.file),
                        path: f.file
                    },
                    line: f.line,
                    column: f.column
                })),
                totalFrames: stackFrames.length
            };
        } catch (error) {
            response.body = { stackFrames: [] };
        }

        this.sendResponse(response);
    }

    protected scopesRequest(
        response: DebugProtocol.ScopesResponse,
        args: DebugProtocol.ScopesArguments
    ): void {
        const scopes: Scope[] = [{
            name: "Locals (use 'print' to evaluate)",
            variablesReference: 0,
            expensive: false
        }];
        response.body = { scopes: scopes };
        this.sendResponse(response);
    }

    protected async variablesRequest(
        response: DebugProtocol.VariablesResponse,
        args: DebugProtocol.VariablesArguments
    ): Promise<void> {
        response.body = { variables: [] };
        this.sendResponse(response);
    }

    // Manages stepping, continuing and other debug control operations
    protected async stepInRequest(
        response: DebugProtocol.StepInResponse,
        args: DebugProtocol.StepInArguments
    ): Promise<void> {
        if (!this.client) {
            this.sendResponse(response);
            return;
        }
        await this.client.sendCommand("s");
        this.sendResponse(response);
        this.sendEvent(new StoppedEvent('step', GnoDebugSession.THREAD_ID));
    }

    protected async stepInstructionRequest(
        response: DebugProtocol.StepInResponse,
        args: DebugProtocol.StepInArguments
    ): Promise<void> {
        if (!this.client) {
            this.sendResponse(response);
            return;
        }
        await this.client.sendCommand("si");
        this.sendResponse(response);
        this.sendEvent(new StoppedEvent('step', GnoDebugSession.THREAD_ID));
    }

    protected async continueRequest(
        response: DebugProtocol.ContinueResponse,
        args: DebugProtocol.ContinueArguments
    ): Promise<void> {
        if (!this.client) {
            this.sendResponse(response);
            return;
        }
        const output = await this.client.sendCommand("c");
        if (output.toLowerCase().includes("terminated")) {
            this.sendResponse(response);
            this.sendEvent(new TerminatedEvent());
        } else {
            this.sendResponse(response);
            this.sendEvent(new StoppedEvent('breakpoint', GnoDebugSession.THREAD_ID));
        }
    }

    protected sourceRequest(
        response: DebugProtocol.SourceResponse,
        args: DebugProtocol.SourceArguments
    ): void {
        if (args.source && args.source.path) {
            try {
                const content = fs.readFileSync(args.source.path, 'utf8');
                response.body = { content: content };
            } catch (e) {
                response.body = { content: "" };
            }
        } else {
            response.body = { content: "" };
        }
        this.sendResponse(response);
    }

    protected async disconnectRequest(
        response: DebugProtocol.DisconnectResponse,
        args: DebugProtocol.DisconnectArguments
    ): Promise<void> {
        if (this.client) {
            await this.client.sendCommand("q");
            this.client.dispose();
        }
        this.sendResponse(response);
        this.sendEvent(new TerminatedEvent());
    }

    public static run(): void {
        const session = new GnoDebugSession();
        session.start(process.stdin, process.stdout);
    }
}
