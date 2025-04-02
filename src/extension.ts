import * as vscode from 'vscode';
import WebSocket from 'ws';

let statusBarItem: vscode.StatusBarItem;
let webSocket: WebSocket | null = null;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    // Create output channel
    outputChannel = vscode.window.createOutputChannel('AugheyRemote Control');

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(radio-tower) AugheyRemote Control";
    statusBarItem.tooltip = "AugheyRemote Control Extension";
    statusBarItem.show();

    // Get configuration
    const config = vscode.workspace.getConfiguration('remoteControl');
    const wsUrl = config.get<string>('websocketUrl');

    if (!wsUrl) {
        vscode.window.showErrorMessage('WebSocket URL not configured');
        return;
    }

    // Connect to WebSocket server
    connectWebSocket(wsUrl);

    // Add command to manually reconnect
    let reconnectCommand = vscode.commands.registerCommand('remoteControl.reconnect', () => {
        const currentConfig = vscode.workspace.getConfiguration('remoteControl');
        const currentWsUrl = currentConfig.get<string>('websocketUrl');
        if (currentWsUrl) {
            connectWebSocket(currentWsUrl);
        }
    });

    // Listen for configuration changes
    let configChangeDisposable = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('remoteControl.websocketUrl')) {
            const newConfig = vscode.workspace.getConfiguration('remoteControl');
            const newWsUrl = newConfig.get<string>('websocketUrl');
            if (newWsUrl) {
                connectWebSocket(newWsUrl);
            }
        }
    });

    context.subscriptions.push(reconnectCommand, configChangeDisposable);
}

function connectWebSocket(url: string) {
    if (webSocket) {
        webSocket.close();
    }

    outputChannel.appendLine(`Connecting to AugheyRemote Control server at ${url}`);

    const ws = new WebSocket(url);
    webSocket = ws;

    ws.on('open', () => {
        vscode.window.showInformationMessage('Connected to AugheyRemote Control server');
        statusBarItem.text = "$(radio-tower) AugheyRemote Control: Connected";
    });

    ws.on('message', (data: WebSocket.Data) => {
        try {
            const command = JSON.parse(data.toString());
            outputChannel.appendLine(`Received command: ${JSON.stringify(command)}`);
            handleCommand(command);
        } catch (error) {
            outputChannel.appendLine(`Error parsing command: ${error}`);
            console.error('Error parsing command:', error);
        }
    });

    ws.on('close', () => {
        vscode.window.showWarningMessage('Disconnected from remote control server');
        statusBarItem.text = "$(radio-tower) Remote Control: Disconnected";
    });

    ws.on('error', (error) => {
        outputChannel.appendLine(`WebSocket error: ${error.message}`);
        vscode.window.showErrorMessage(`WebSocket error: ${error.message}`);
        statusBarItem.text = "$(radio-tower) AugheyRemote Control: Error";
    });
}

function handleCommand(command: any) {
    // Show command received notification
    vscode.window.showInformationMessage(`Command received: ${JSON.stringify(command)}`);

    // Here you can add specific command handling logic
    // For example:
    switch (command.type) {
        case 'openFile':
            if (command.path) {
                vscode.workspace.openTextDocument(command.path);
            }
            break;
        case 'executeCommand':
            if (command.command) {
                vscode.commands.executeCommand(command.command);
            }
            break;
        default:
            console.log('Unknown command type:', command.type);
    }
}

export function deactivate() {
    if (webSocket) {
        webSocket.close();
        webSocket = null;
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    if (outputChannel) {
        outputChannel.dispose();
    }
} 