import * as vscode from "vscode";
import * as fs from "fs";
import path, { basename } from "path";

type IDFVersion = {
	name: string
	export: string
	install: string
}

interface IDFVersionQuickPickItem extends vscode.QuickPickItem {
	is_new_installation: boolean
	payload?: IDFVersion
}

function get_version_path(version_path: string): string | null {
	let export_path = path.join(version_path, "esp-idf", "export.ps1");
	let install_path = path.join(version_path, "esp-idf", "install.ps1");
	if(fs.existsSync(export_path) && fs.existsSync(install_path)) return path.join(version_path, "esp-idf");

	export_path = path.join(version_path, "export.ps1");
	install_path = path.join(version_path, "install.ps1");
	if(fs.existsSync(export_path) && fs.existsSync(install_path)) return version_path;

	return null;
}

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand("esp-idf-light.new_terminal", async () => {
		const config = vscode.workspace.getConfiguration();
		const base_paths: string[] = config.get("esp-idf-light.basePaths", []);

		let versions: IDFVersion[] = [];

		base_paths.forEach(base_path => {
			if(!fs.existsSync(base_path)) return;

			let version_paths = fs.readdirSync(base_path);
			version_paths.forEach(version_path => {
				let temp = get_version_path(path.join(base_path, version_path))
				if(temp == null) return;
				else version_path = temp;

				let export_path = path.join(version_path, "export.ps1");
				let install_path = path.join(version_path, "install.ps1");

				versions.push({
					name: path.basename(path.dirname(version_path)),
					export: export_path,
					install: install_path
				})
			});
		});
		versions.sort().reverse();

		const quick_pick = vscode.window.createQuickPick<IDFVersionQuickPickItem>();
        quick_pick.placeholder = "Choose an option";
        quick_pick.canSelectMany = false;
        quick_pick.ignoreFocusOut = false;

		function refresh() {
			let choices: IDFVersionQuickPickItem[] = [];
			versions.forEach(version => {
				choices.push({
					label: version.name,
					detail: path.dirname(version.export),
					is_new_installation: false,
					payload: version
				})
			});

			const additional_installs = vscode.workspace.getConfiguration().get<string[]>("esp-idf-light.additionalInstallations", []);
			additional_installs.forEach(additional_install => {
				let install_path = get_version_path(additional_install);
				if(install_path == null) {
					install_path = additional_install
				}

				choices.push({
					label: additional_install + " (Custom Installation)",
					is_new_installation: false,
					payload: {
						name: additional_install,
						export: path.join(install_path, "export.ps1"),
						install: path.join(install_path, "install.ps1"),
					},
					buttons: [{
						iconPath: new vscode.ThemeIcon("diff-review-close")
					}]
				})
			});

			choices.push({
				label: "Add new installation...",
				is_new_installation: true,
			})

			quick_pick.items = choices;
		}

		quick_pick.onDidAccept(async () => {
            const selected = quick_pick.selectedItems[0];
            if(!selected) return;

			if(selected.is_new_installation){
				const folder_uris = await vscode.window.showOpenDialog({
					canSelectFiles: false,
					canSelectFolders: true,
					canSelectMany: false,
					openLabel: "Select Folder",
					title: "Choose an ESP-IDF installation folder"
				});

				if (folder_uris && folder_uris.length > 0) {
					let selected_path = folder_uris[0].fsPath;
					if(get_version_path(selected_path) != null) {
						const current_paths = vscode.workspace.getConfiguration().get<string[]>("esp-idf-light.additionalInstallations", []);
						const updated = [...current_paths, selected_path];
						console.log(updated)
						await vscode.workspace.getConfiguration().update("esp-idf-light.additionalInstallations", updated, vscode.ConfigurationTarget.Global);
					}
				}
			}else{
				const terminal = vscode.window.createTerminal({
					name: "powershell-idf",
					shellPath: 'powershell.exe',
					shellArgs: [
						"-NoExit",
						"-ExecutionPolicy", "Bypass",
						"-NoProfile",
						"-Command",
						`& {
							. '${selected.payload?.export}';
							if (!$?) {
								Write-Host 'Export failed, running install...';
								. '${selected.payload?.install}';
								. '${selected.payload?.export}';
							}
						}`
					]
				})
				terminal.show();
			}

            quick_pick.hide();
        });

		quick_pick.onDidTriggerItemButton(async (event) => {
            const to_remove = event.item.payload;
			let current_paths = vscode.workspace.getConfiguration().get<string[]>("esp-idf-light.additionalInstallations", []);
			current_paths = current_paths.filter(p => p !== to_remove?.name);
			await vscode.workspace.getConfiguration().update("esp-idf-light.additionalInstallations", current_paths, vscode.ConfigurationTarget.Global);
            refresh();
        });

		refresh();
		quick_pick.show();
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}