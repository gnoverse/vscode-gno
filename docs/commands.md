# Commands

In addition to integrated editing features, this extension offers a number of commands, which can be executed manually through the [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) (`Ctrl+Shift+P` on Linux/Windows or `Cmd+Shift+P` on macOS).

Some of these commands are also available in the VS Code context menu (right-click). To control which of these commands show up in the editor context menu, update the [`"gno.editorContextMenuCommands"`](settings.md#gnoeditorcontextmenucommands) setting.

Most commands provided by this extension have the prefix `Gno:`.

To view this list:

1. Navigate to the Extensions view (Ctrl+Shift+X).
2. Find the Gno extension and click on it to open the Extension Editor.
3. Click on the `Feature Contributions` tab.
4. Scroll through the list under `Commands`.
5. Finally, you can also see a full list by using a meta command: `Gno: Show All Commands...`.

## Detailed list

<!-- Everything below this line is generated. DO NOT EDIT. -->

### Gno: Current GNOPATH

#### `gno.gnopath`

See the currently set GNOPATH.

### Gno: Current GNOROOT

#### `gno.gnoroot`

See the currently set GNOROOT.

### Gno: Locate Configured Gno Tools

#### `gno.locate.tools`

List all the Gno tools being used by this extension along with their locations.

### Gno: Test Function At Cursor

#### `gno.test.cursor`

Runs a unit test at the cursor.

### Gno: Test Function At Cursor or Test Previous

#### `gno.test.cursorOrPrevious`

Runs a unit test at the cursor if one is found, otherwise re-runs the last executed test.

### Gno: Test File

#### `gno.test.file`

Runs all unit tests in the current file.

### Gno: Test Package

#### `gno.test.package`

Runs all unit tests and filetests in the package of the current file.

### Gno Test: Refresh

#### `gno.test.refresh`

Refresh a test in the test explorer. Only available as a context menu option in the test explorer.

### Gno: Test All Files In Workspace

#### `gno.test.workspace`

Runs all unit tests from all files in the current workspace.

### Gno: Test Previous

#### `gno.test.previous`

Re-runs the last executed test.

### Gno: Toggle Test File

#### `gno.toggle.test.file`

Toggles between file in current active editor and the corresponding test file.

### Gno: Welcome

#### `gno.welcome`

Open the welcome page for the Gno extension.

### Gno: Add Import

#### `gno.import.add`

Add an import declaration

### Gno: Install/Update Tools

#### `gno.tools.install`

install/update the required go packages

### Gno: Show All Commands...

#### `gno.show.commands`

Shows all commands from the Gno extension in the quick pick

### Gno: Lint Workspace

#### `gno.lint.workspace`

Run linter in the current workspace.

### Gno: Initialize gno.mod

#### `gno.run.modinit`

Run `gno mod init` in the workspace folder.

### Gno: Cancel Running Tests

#### `gno.test.cancel`

Cancels running tests.

### Gno: Restart Language Server

#### `gno.languageserver.restart`

Restart the running instance of the language server

### Gno: Add Package To Chain

#### `gno.maketx.addpkg`

Add a package to the Gno blockchain

### Gno: Select Network

#### `gno.network.select`

Select the network from gno.networks that Gno transactions and queries are sent to

### Gno: Call Realm Function

#### `gno.maketx.call`

Call a crossing function of the realm of the active file on the selected network

### Gno: Run Script On Chain

#### `gno.maketx.run`

Run the main function of the active file on the selected network with gnokey maketx run

### Gno: Evaluate Expression In Realm

#### `gno.query.eval`

Evaluate an expression, such as Counter(), in the realm of the active file on the selected network

### Gno: Query Render

#### `gno.query.render`

Show the Render output of the realm of the active file on the selected network

### Gno: Start gnodev

#### `gno.gnodev.start`

Start gnodev in the directory of the active file and open gnoweb

### Gno: Stop gnodev

#### `gno.gnodev.stop`

Stop gnodev and close gnoweb

### Gno: Reload gnodev Packages

#### `gno.gnodev.reload`

Reload the packages loaded by gnodev

### Gno: Reset gnodev Realms State

#### `gno.gnodev.reset`

Reload the packages and reset the realms state

### Gno: Open gnoweb in Browser

#### `gno.gnodev.openExternal`

Open the gnoweb served by gnodev in the external browser

### Gno: Preview Render

#### `gno.render.preview`

Preview the Render output of the realm of the active file in gnoweb, starting gnodev if needed
