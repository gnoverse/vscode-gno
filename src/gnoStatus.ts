import * as vscode from "vscode";

export let gnoEnvStatusbarItem: vscode.StatusBarItem;
export const languageServerIcon = "$(arrow-up)";
export const languageServerErrorIcon = "$(arrow-down)";

// Updates the Gno status bar icon based on whether the language server is started and enabled.
export function updateLanguageServerIconGnoStatusBar(
  started: boolean,
  enabled: boolean,
) {
  if (!gnoEnvStatusbarItem) {
    return;
  }

  let text = gnoEnvStatusbarItem.text;
  let icon = "";

  if (text.endsWith(languageServerIcon)) {
    text = text.substring(0, text.length - languageServerIcon.length);
  } else if (text.endsWith(languageServerErrorIcon)) {
    text = text.substring(0, text.length - languageServerErrorIcon.length);
  }

  if (started && enabled) {
    icon = languageServerIcon;
  } else if (!started && enabled) {
    icon = languageServerErrorIcon;
  }

  gnoEnvStatusbarItem.text = text + icon;
}
