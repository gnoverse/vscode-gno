import vscode = require("vscode");
import { CommandFactory } from ".";
import { Mutex } from "../utils/mutex";
import { getGnoConfig } from "../config";
import {
  stopLanguageClient,
  buildLanguageClient,
  buildLanguageServerConfig,
  buildLanguageClientOption,
  toServerInfo,
} from "../language/gnoLanguageServer";
import { GnoExtensionContext } from "../context";
import { updateLanguageServerIconGnoStatusBar } from "../gnoStatus";
import { LegacyLanguageService } from "../language/registerDefaultProviders";

const languageServerStartMutex = new Mutex();

export const startLanguageServer: CommandFactory = (ctx, gnoCtx) => {
  return async () => {
    const gnoConfig = getGnoConfig();
    const cfg = buildLanguageServerConfig(gnoConfig);

    const unlock = await languageServerStartMutex.lock();
    gnoCtx.latestConfig = cfg;

    try {
      // If the client has already been started, make sure to clear existing
      // diagnostics and stop it.
      if (gnoCtx.languageClient) {
        await stopLanguageClient(gnoCtx);
      }
      updateStatus(gnoCtx, gnoConfig, false);

      // Before starting the language server, make sure to deregister any
      // currently registered language providers.
      if (gnoCtx.legacyLanguageService) {
        gnoCtx.legacyLanguageService.dispose();
        gnoCtx.legacyLanguageService = undefined;
      }

      if (!cfg.enabled) {
        const legacyService = new LegacyLanguageService(ctx, gnoCtx);
        gnoCtx.legacyLanguageService = legacyService;
        ctx.subscriptions.push(legacyService);
        updateStatus(gnoCtx, gnoConfig, false);
        return;
      }

      gnoCtx.languageClient = await buildLanguageClient(
        gnoCtx,
        buildLanguageClientOption(gnoCtx, cfg),
      );
      await gnoCtx.languageClient.start();
      gnoCtx.serverInfo = toServerInfo(gnoCtx.languageClient.initializeResult);
      updateStatus(gnoCtx, gnoConfig, true);
      console.log(`Server: ${JSON.stringify(gnoCtx.serverInfo, null, 2)}`);
    } catch (e) {
      const msg = `Error starting language server: ${e}`;
      console.log(msg);
      gnoCtx.serverOutputChannel?.append(msg);
    } finally {
      unlock();
    }
  };
};

function updateStatus(
  gnoCtx: GnoExtensionContext,
  gnoConfig: vscode.WorkspaceConfiguration,
  didStart: boolean,
) {
  gnoCtx.languageServerIsRunning = didStart;
  vscode.commands.executeCommand("setContext", "gno.gnoplsIsRunning", didStart);
  updateLanguageServerIconGnoStatusBar(
    didStart,
    gnoConfig["useLanguageServer"] === true,
  );
}
