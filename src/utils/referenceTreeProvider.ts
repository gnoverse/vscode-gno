import * as vscode from "vscode";

interface ReferenceItem {
  label: string;
  uri: vscode.Uri;
  range: vscode.Range;
}

// Implements TreeDataProvider to manage and display references in the explorer
export class ReferenceTreeProvider
  implements vscode.TreeDataProvider<ReferenceItem>
{
  private references: ReferenceItem[] = []; // Stores the list of references

  private _onDidChangeTreeData: vscode.EventEmitter<ReferenceItem | undefined> =
    new vscode.EventEmitter<ReferenceItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<ReferenceItem | undefined> =
    this._onDidChangeTreeData.event;

  constructor() {}

  // Refresh the tree view with new references and notify VSCode to update the view
  refresh(references: ReferenceItem[]): void {
    this.references = references;
    this._onDidChangeTreeData.fire(undefined);
  }

  // Returns a TreeItem for each reference, defining how it will appear in the tree
  getTreeItem(element: ReferenceItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.label);
    treeItem.command = {
      command: "vscode.open",
      title: "Open File",
      arguments: [element.uri, { selection: element.range }],
    };
    treeItem.tooltip = `${element.uri.fsPath}:${element.range.start.line + 1}`; // Shows file path and line in the tooltip
    treeItem.description = `Line ${element.range.start.line + 1}, Col ${element.range.start.character + 1}`; // Shows line and column
    return treeItem;
  }

  // Returns the list of children (in this case, references) for the tree view
  getChildren(element?: ReferenceItem): Thenable<ReferenceItem[]> {
    if (!element) {
      return Promise.resolve(this.references);
    }
    return Promise.resolve([]);
  }
}
