import * as vscode from "vscode";
import * as util from "util";
import { GnoExtensionContext } from "../context";
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
  RevealOutputChannelOn,
} from "vscode-languageclient";
import { LanguageClient, ServerOptions } from "vscode-languageclient/node";
import { CompletionItemKind, FoldingContext } from "vscode";
import { ProvideFoldingRangeSignature } from "vscode-languageclient/lib/common/foldingRange";
import {
  GoDocumentFormattingEditProvider,
  usingCustomFormatTool,
} from "./legacy/goFormat";
import { toolExecutionEnvironment } from "../goEnv";
import {
  extensionInfo,
  getGnoConfig,
  getGnoplsBinaryPath,
  getGnoplsConfig,
} from "../config";
import {
  getCheckForToolsUpdatesConfig,
  removeDuplicateDiagnostics,
} from "../util";
import * as WebRequest from "web-request";
import { updateLanguageServerIconGnoStatusBar } from "../gnoStatus";

export interface LanguageServerConfig {
  serverName: string;
  path: string;
  version?: { version: string; goVersion?: string };
  modtime?: Date;
  enabled: boolean;
  flags: string[];
  env: any;
  features: {
    diagnostics: boolean;
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

// adjustGnoplsWorkspaceConfiguration filters unnecessary options and adds any necessary, additional
// options to the gnopls config. See filterGnoplsDefaultConfigValues, passGnoConfigToGnoplsConfigValues.
// If this is for the nightly extension, we also request to activate features under experiments.
async function adjustGnoplsWorkspaceConfiguration(
  cfg: LanguageServerConfig,
  workspaceConfig: any,
  section?: string,
  resource?: vscode.Uri,
): Promise<any> {
  // We process only gnopls config
  if (section !== "gnopls") {
    return workspaceConfig;
  }

  workspaceConfig = filterGnoplsDefaultConfigValues(workspaceConfig, resource);
  // note: workspaceConfig is a modifiable, valid object.
  workspaceConfig = passGnoConfigToGnoplsConfigValues(
    workspaceConfig,
    getGnoConfig(resource),
  );
  // XXX: workspaceConfig = await passInlayHintConfigToGnopls(cfg, workspaceConfig, getGnoConfig(resource));

  // Only modify the user's configurations for the Nightly.
  if (!extensionInfo.isPreview) {
    return workspaceConfig;
  }
  if (workspaceConfig && !workspaceConfig["allExperiments"]) {
    workspaceConfig["allExperiments"] = true;
  }
  return workspaceConfig;
}

// filterGnoplsDefaultConfigValues removes the entries filled based on the default values
// and selects only those the user explicitly specifies in their settings.
// This returns a new object created based on the filtered properties of workspaceConfig.
// Exported for testing.
export function filterGnoplsDefaultConfigValues(
  workspaceConfig: any,
  resource?: vscode.Uri,
): any {
  if (!workspaceConfig) {
    workspaceConfig = {};
  }
  const cfg = getGnoplsConfig(resource);
  const filtered = {} as { [key: string]: any };
  for (const [key, value] of Object.entries(workspaceConfig)) {
    if (typeof value === "function") {
      continue;
    }
    const c = cfg.inspect(key);
    // select only the field whose current value comes from non-default setting.
    if (
      !c ||
      !util.isDeepStrictEqual(c.defaultValue, value) ||
      // c.defaultValue !== value would be most likely sufficient, except
      // when gnopls' default becomes different from extension's default.
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

// passGnoConfigToGnoplsConfigValues passes some of the relevant 'gno.' settings to gnopls settings.
// This assumes `gnoplsWorkspaceConfig` is an output of filterGnoplsDefaultConfigValues,
// so it is modifiable and doesn't contain properties that are not explicitly set.
//   - gno.buildTags and gno.buildFlags are passed as gnopls.build.buildFlags
//     if gnoplsWorkspaceConfig doesn't explicitly set it yet.
export function passGnoConfigToGnoplsConfigValues(
  gnoplsWorkspaceConfig: any,
  gnoWorkspaceConfig: any,
): any {
  if (!gnoplsWorkspaceConfig) {
    gnoplsWorkspaceConfig = {};
  }

  const buildFlags = [] as string[];
  if (gnoWorkspaceConfig?.buildFlags) {
    buildFlags.push(...gnoWorkspaceConfig.buildFlags);
  }
  if (gnoWorkspaceConfig?.buildTags && buildFlags.indexOf("-tags") === -1) {
    buildFlags.push("-tags", gnoWorkspaceConfig?.buildTags);
  }
  // If gnopls.build.buildFlags is set, don't touch it.
  if (
    buildFlags.length > 0 &&
    gnoplsWorkspaceConfig["build.buildFlags"] === undefined
  ) {
    gnoplsWorkspaceConfig["build.buildFlags"] = buildFlags;
  }

  return gnoplsWorkspaceConfig;
}

// buildLanguageClient returns a language client built using the given language server config.
// The returned language client need to be started before use.
export async function buildLanguageClient(
  gnoCtx: GnoExtensionContext,
  cfg: BuildLanguageClientOption,
): Promise<LanguageClient> {
  const gnoplsWorkspaceConfig = await adjustGnoplsWorkspaceConfiguration(
    cfg,
    getGnoplsConfig(),
    "gnopls",
    undefined,
  );

  const documentSelector = [
    // gnopls handles only file URIs.
    { language: "gno", scheme: "file" },
    // TODO: { language: 'gno.mod', scheme: 'file' }
  ];

  // when initialization is failed after the connection is established,
  // we want to handle the connection close error case specially. Capture the error
  // in initializationFailedHandler and handle it in the connectionCloseHandler.
  let initializationError:
    | WebRequest.ResponseError<InitializeError>
    | undefined = undefined;

  const c = new LanguageClient(
    "gno", // id
    cfg.serverName, // name e.g. gnopls
    {
      command: cfg.path,
      // args: ['serve', '--gnoroot='+gnoConfig["gnoroot"]],
      options: { env: cfg.env },
    } as ServerOptions,
    {
      initializationOptions: gnoplsWorkspaceConfig,
      documentSelector,
      uriConverters: {
        // Apply file:/// scheme to all file paths.
        code2Protocol: (uri: vscode.Uri): string =>
          (uri.scheme ? uri : uri.with({ scheme: "file" })).toString(),
        protocol2Code: (uri: string) => vscode.Uri.parse(uri),
      },
      outputChannel: cfg.outputChannel,
      traceOutputChannel: cfg.traceOutputChannel,
      revealOutputChannelOn: RevealOutputChannelOn.Never,
      initializationFailedHandler: (
        error: WebRequest.ResponseError<InitializeError>,
      ): boolean => {
        initializationError = error;
        return false;
      },
      errorHandler: {
        error: (error: Error, message: Message, count: number) => {
          // Allow 5 crashes before shutdown.
          if (count < 5) {
            return {
              message: "", // suppresses error popups
              action: ErrorAction.Continue,
            };
          }
          return {
            action: ErrorAction.Shutdown,
          };
        },
        closed: () => {
          if (initializationError !== undefined) {
            initializationError = undefined;
            // In case of initialization failure, do not try to restart.
            return {
              message: "The gnopls server failed to initialize.",
              action: CloseAction.DoNotRestart,
            };
          }

          // Allow 5 crashes before shutdown.
          const { crashCount = 0 } = gnoCtx;
          gnoCtx.crashCount = crashCount + 1;
          if (gnoCtx.crashCount < 5) {
            return {
              message: "", // suppresses error popups
              action: CloseAction.Restart,
            };
          }
          updateLanguageServerIconGnoStatusBar(false, true);
          return {
            action: CloseAction.DoNotRestart,
          };
        },
      },
      middleware: {
        executeCommand: async (
          command: string,
          args: any[],
          next: ExecuteCommandSignature,
        ) => {
          try {
            return await next(command, args);
          } catch (e) {
            const answer = await vscode.window.showErrorMessage(
              `Command '${command}' failed: ${e}.`,
              "Show Trace",
            );
            if (answer === "Show Trace") {
              gnoCtx.serverOutputChannel?.show();
            }
            return null;
          }
        },
        provideFoldingRanges: async (
          doc: vscode.TextDocument,
          context: FoldingContext,
          token: CancellationToken,
          next: ProvideFoldingRangeSignature,
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
          next: ProvideCodeLensesSignature,
        ): Promise<vscode.CodeLens[]> => {
          const codeLens = await next(doc, token);
          if (!codeLens || codeLens.length === 0) {
            return codeLens ?? [];
          }
          return codeLens.reduce(
            (lenses: vscode.CodeLens[], lens: vscode.CodeLens) => {
              switch (lens.command?.title) {
                case "run test": {
                  return [...lenses, ...createTestCodeLens(lens)];
                }
                default: {
                  return [...lenses, lens];
                }
              }
            },
            [],
          );
        },
        provideDocumentFormattingEdits: async (
          document: vscode.TextDocument,
          options: vscode.FormattingOptions,
          token: vscode.CancellationToken,
          next: ProvideDocumentFormattingEditsSignature,
        ) => {
          if (cfg.features.formatter) {
            return cfg.features.formatter.provideDocumentFormattingEdits(
              document,
              options,
              token,
            );
          }
          return next(document, options, token);
        },
        handleDiagnostics: (
          uri: vscode.Uri,
          diagnostics: vscode.Diagnostic[],
          next: HandleDiagnosticsSignature,
        ) => {
          if (!cfg.features.diagnostics) {
            return null;
          }
          const {
            buildDiagnosticCollection,
            lintDiagnosticCollection,
            vetDiagnosticCollection,
          } = gnoCtx;
          // Deduplicate diagnostics with those found by the other tools.
          removeDuplicateDiagnostics(vetDiagnosticCollection, uri, diagnostics);
          removeDuplicateDiagnostics(
            buildDiagnosticCollection,
            uri,
            diagnostics,
          );
          removeDuplicateDiagnostics(
            lintDiagnosticCollection,
            uri,
            diagnostics,
          );

          return next(uri, diagnostics);
        },
        provideCompletionItem: async (
          document: vscode.TextDocument,
          position: vscode.Position,
          context: vscode.CompletionContext,
          token: vscode.CancellationToken,
          next: ProvideCompletionItemsSignature,
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
          if (
            !Array.isArray(list) &&
            list.isIncomplete &&
            list.items.length > 1
          ) {
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
              if (typeof label !== "string") label = label.label;
              hardcodedFilterText = label;
            }
            for (const item of items) {
              item.filterText = hardcodedFilterText;
            }
          }
          const paramHintsEnabled = vscode.workspace.getConfiguration(
            "editor.parameterHints",
            {
              languageId: "gno",
              uri: document.uri,
            },
          );
          // If the user has parameterHints (signature help) enabled,
          // trigger it for function or method completion items.
          if (paramHintsEnabled) {
            for (const item of items) {
              if (
                item.kind === CompletionItemKind.Method ||
                item.kind === CompletionItemKind.Function
              ) {
                item.command = {
                  title: "triggerParameterHints",
                  command: "editor.action.triggerParameterHints",
                };
              }
            }
          }
          return list;
        },
        // Keep track of the last file change in order to not prompt
        // user if they are actively working.
        didOpen: async (e, next) => {
          gnoCtx.lastUserAction = new Date();
          next(e);
        },
        didChange: async (e, next) => {
          gnoCtx.lastUserAction = new Date();
          next(e);
        },
        didClose: async (e, next) => {
          gnoCtx.lastUserAction = new Date();
          next(e);
        },
        didSave: async (e, next) => {
          gnoCtx.lastUserAction = new Date();
          next(e);
        },
        workspace: {
          configuration: async (
            params: ConfigurationParams,
            token: CancellationToken,
            next: ConfigurationRequest.HandlerSignature,
          ): Promise<any[] | ResponseError<void>> => {
            const configs = await next(params, token);
            if (!configs || !Array.isArray(configs)) {
              return configs;
            }
            const ret = [] as any[];
            for (let i = 0; i < configs.length; i++) {
              let workspaceConfig = configs[i];
              if (!!workspaceConfig && typeof workspaceConfig === "object") {
                const scopeUri = params.items[i].scopeUri;
                const resource = scopeUri
                  ? vscode.Uri.parse(scopeUri)
                  : undefined;
                const section = params.items[i].section;
                workspaceConfig = await adjustGnoplsWorkspaceConfiguration(
                  cfg,
                  workspaceConfig,
                  section,
                  resource,
                );
              }
              ret.push(workspaceConfig);
            }
            return ret;
          },
        },
      },
    } as LanguageClientOptions,
  );
  return c;
}

export function buildLanguageServerConfig(
  gnoConfig: vscode.WorkspaceConfiguration,
): LanguageServerConfig {
  let formatter: GoDocumentFormattingEditProvider | undefined;
  if (usingCustomFormatTool(gnoConfig)) {
    formatter = new GoDocumentFormattingEditProvider();
  }
  const cfg: LanguageServerConfig = {
    serverName: "",
    path: "",
    version: undefined, // compute version lazily
    modtime: undefined,
    enabled: gnoConfig["useLanguageServer"] === true,
    flags: gnoConfig["useLanguageServer"],
    features: {
      // TODO: We should have configs that match these names.
      // Ultimately, we should have a centralized language server config rather than separate fields.
      diagnostics:
        gnoConfig["languageServerExperimentalFeatures"]["diagnostics"],
      formatter: formatter,
    },
    env: toolExecutionEnvironment(),
    checkForUpdates: getCheckForToolsUpdatesConfig(gnoConfig),
  };
  // user has opted out of using the language server.
  if (!cfg.enabled) {
    return cfg;
  }

  const languageServerPath = getLanguageServerToolPath();
  if (!languageServerPath) {
    cfg.enabled = false;
    return cfg;
  }

  cfg.path = languageServerPath;
  cfg.serverName = "gnopls";

  return cfg;
}

export interface BuildLanguageClientOption extends LanguageServerConfig {
  outputChannel?: vscode.OutputChannel;
  traceOutputChannel?: vscode.OutputChannel;
}

// buildLanguageClientOption returns the default, extra configuration
// used in building a new LanguageClient instance. Options specified
// in LanguageServerConfig
export function buildLanguageClientOption(
  gnoCtx: GnoExtensionContext,
  cfg: LanguageServerConfig,
): BuildLanguageClientOption {
  // Reuse the same output channel for each instance of the server.
  if (cfg.enabled) {
    if (!gnoCtx.serverOutputChannel) {
      gnoCtx.serverOutputChannel = vscode.window.createOutputChannel(
        cfg.serverName + " (server)",
      );
    }
    if (!gnoCtx.serverTraceChannel) {
      gnoCtx.serverTraceChannel = vscode.window.createOutputChannel(
        cfg.serverName,
      );
    }
    if (!gnoCtx.govulncheckOutputChannel) {
      gnoCtx.govulncheckOutputChannel =
        vscode.window.createOutputChannel("govulncheck");
    }
  }
  return Object.assign(
    {
      outputChannel: gnoCtx.serverOutputChannel,
      traceOutputChannel: gnoCtx.serverTraceChannel,
    },
    cfg,
  );
}

export async function stopLanguageClient(gnoCtx: GnoExtensionContext) {
  const c = gnoCtx.languageClient;
  gnoCtx.languageClient = undefined;
  if (!c) return false;

  if (c.diagnostics) {
    c.diagnostics.clear();
  }
  // LanguageClient.stop may hang if the language server
  // crashes during shutdown before responding to the
  // shutdown request. Enforce client-side timeout.
  // TODO(hyangah): replace with the new LSP client API that supports timeout
  // and remove this.
  try {
    await race(c.stop(), 2000);
  } catch (e) {
    c.outputChannel?.appendLine(`Failed to stop client: ${e}`);
  }
}

export function toServerInfo(res?: InitializeResult): ServerInfo | undefined {
  if (!res) return undefined;

  const info: ServerInfo = {
    Commands: res.capabilities?.executeCommandProvider?.commands || [],
    Name: res.serverInfo?.name || "unknown",
    Version: res.serverInfo?.version || "unknown",
  };

  return info;
}

const race = function (
  promise: Promise<unknown>,
  timeoutInMilliseconds: number,
) {
  let token: NodeJS.Timeout;
  const timeout = new Promise((resolve, reject) => {
    token = setTimeout(() => reject("timeout"), timeoutInMilliseconds);
  });
  return Promise.race([promise, timeout]).then(() => clearTimeout(token));
};

export function languageServerUsingDefault(
  cfg: vscode.WorkspaceConfiguration,
): boolean {
  const useLanguageServer = cfg.inspect<boolean>("useLanguageServer");
  return (
    useLanguageServer?.globalValue === undefined &&
    useLanguageServer?.workspaceValue === undefined
  );
}

export function getLanguageServerToolPath(): string | undefined {
  return getGnoplsBinaryPath();
}

// createTestCodeLens adds the go.test.cursor and go.debug.cursor code lens
function createTestCodeLens(lens: vscode.CodeLens): vscode.CodeLens[] {
  // CodeLens argument signature in gnopls is [fileName: string, testFunctions: string[], benchFunctions: string[]],
  // so this needs to be deconstructured here
  // Note that there will always only be one test function name in this context
  if (
    (lens.command?.arguments?.length ?? 0) < 2 ||
    (lens.command?.arguments?.[1].length ?? 0) < 1
  ) {
    return [lens];
  }
  return [
    new vscode.CodeLens(lens.range, {
      title: "",
      ...lens.command,
      command: "gno.test.function",
      arguments: [{ functionName: lens.command?.arguments?.[1][0] }],
    }),
  ];
}
