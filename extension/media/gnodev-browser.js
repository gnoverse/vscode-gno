function onceDocumentLoaded(f) {
	if (document.readyState === 'loading' || document.readyState === 'uninitialized') {
		document.addEventListener('DOMContentLoaded', f);
	} else {
		f();
	}
}

const vscode = acquireVsCodeApi();

const floatingControls = document.querySelector('.floating-controls');
const forwardButton = floatingControls.querySelector('.forward-button');
const backButton = floatingControls.querySelector('.back-button');
const reloadButton = floatingControls.querySelector('.reload-button');
const resetButton = floatingControls.querySelector('.reset-button');
const openExternalButton = floatingControls.querySelector('.open-external-button');

onceDocumentLoaded(() => {
	forwardButton.addEventListener('click', () => {
		history.forward();
	});

	backButton.addEventListener('click', () => {
		history.back();
	});

	reloadButton.addEventListener('click', () => {
		vscode.postMessage({ type: 'reload' });
	});

	resetButton.addEventListener('click', () => {
		vscode.postMessage({ type: 'reset' });
	});

	openExternalButton.addEventListener('click', () => {
		vscode.postMessage({ type: 'openExternal' });
	});
});
