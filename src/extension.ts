import * as vscode from "vscode";
import WebSocket, { AddressInfo, MessageEvent } from "ws";
import * as tcpPorts from "tcp-port-used";
import { Logger } from "./services/Logger";
import http from "http";

let wss: WebSocket.Server | null = null;
let ws: WebSocket | null = null;

let onlyWhenInFocus: boolean | null | undefined = false;

const EXTENSION_ID: string = "eliostruyf.vscode-remote-control";
const APP_NAME: string = "remoteControl";

let statusBarItem: vscode.StatusBarItem;
let webSocket: WebSocket | null = null;
let outputChannel: vscode.OutputChannel;


const warningNotification = (port: number, newPort: number): void => {
  vscode.window
    .showWarningMessage(
      `Remote Control: Port "${port}" was already in use. The extension opened on a port "${newPort}". If you want, you can configure another port via the "remotecontrol.port" workspace setting.`,
      "Configure locally"
    )
    .then(async (option: string | undefined) => {
      if (option === "Configure locally") {
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          `@ext:${EXTENSION_ID}`
        );
        await vscode.commands.executeCommand(
          "workbench.action.openWorkspaceSettings"
        );
      }
    });
};

const startWebsocketServer = async (
  context: vscode.ExtensionContext,
  host: string,
  port: number,
  fallbackPorts: number[],
  showNotification: boolean = false
): Promise<void> => {
  let isInUse = false;
  if (port) {
    isInUse = await tcpPorts.check(port, host);
    if (isInUse) {
      if (fallbackPorts.length > 0) {
        const nextPort = fallbackPorts.shift();
        if (nextPort) {
          startWebsocketServer(context, host, nextPort, fallbackPorts, true);
          return;
        } else {
          isInUse = true;
        }
      } else {
        isInUse = true;
      }
    }
  }

  // Start the API server
  const server = http.createServer();
  wss = new WebSocket.Server({ noServer: true });

  server.on("upgrade", function upgrade(request, socket, head) {
    wss?.handleUpgrade(request, socket, head, function done(ws) {
      wss?.emit("connection", ws, request);
    });
  });

  wss.on("connection", (connection: any) => {
    ws = connection;

    if (ws) {
      ws.addEventListener("message", async (event: MessageEvent) => {
        if (onlyWhenInFocus && !vscode.window.state.focused) {
          return;
        }

        if (event && event.data && event.data) {
          let wsData: CommandData;

          try {
            wsData = JSON.parse(event.data as string);
          } catch (error) {
            Logger.error("Error while parsing the incoming data.");
            Logger.error((error as Error).message);
            return;
          }

          const args = wsData.args;

          if (
            wsData.command === "vscode.open" ||
            wsData.command === "vscode.openFolder" ||
            wsData.command === "markdown.showPreview"
          ) {
            if (args && args[0]) {
              args[0] = vscode.Uri.file(args[0]);
            }
          }

          if (wsData.command === "terminal.execute") {
            let terminal = vscode.window.activeTerminal;

            if (terminal && args) {
              terminal.show(true);
              terminal.sendText(args);
              return;
            }
            return;
          }

          let response: any;
          if (args instanceof Array) {
            response = await vscode.commands.executeCommand(wsData.command, ...args);
          } else {
            response = await vscode.commands.executeCommand(wsData.command, args);
          }

          if (response) {
            try {
              ws?.send(JSON.stringify(response));
            }
            catch (error) {
              Logger.error((error as Error).message);
            }
          };
        }
      });
    }
  });

  server.listen(isInUse ? 0 : port, host, () => {
    const address = server.address();
    const verifiedPort = (address as AddressInfo).port;
    Logger.info(`Remote Control: Listening on "ws://${host}:${verifiedPort}"`);
    //set the remote control port as an environment variable
    context.environmentVariableCollection.replace(
      "REMOTE_CONTROL_PORT",
      `${verifiedPort}`
    );

    if (showNotification) {
      vscode.window.showInformationMessage(
        `Remote Control: Listening on "ws://${host}:${verifiedPort}"`
      );
    }

    const statusbar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    statusbar.text = `$(plug) RC Port: ${verifiedPort}`;
    statusbar.tooltip = `Remote Control: Listening on "ws://${host}:${verifiedPort}"`;
    statusbar.show();

    if (isInUse) {
      warningNotification(port, verifiedPort);
    }
  });

  wss.on("error", (e) => {
    Logger.error(`Error while starting the websocket server.`);
    Logger.error((e as Error).message);
    vscode.window.showErrorMessage(
      `Remote Control: Error while starting the websocket server. Check the output for more details.`
    );
  });

  wss.on("close", () => {
    Logger.info("Closing the ws connection");
  });
};

export function activate(context: vscode.ExtensionContext) {
  Logger.info("VSCode Aughey Remote Control starting...");
  const subscriptions = context.subscriptions;
  const config = vscode.workspace.getConfiguration(APP_NAME);

  const websocketUrl = config.get<string | null>("websocketUrl");

  Logger.info(`WebSocket URL: ${websocketUrl}`);

  if (!websocketUrl) {
    vscode.window.showErrorMessage("WebSocket URL is not configured. Please configure the 'remoteControl.websocketUrl' setting.");
    return;
  }

  // const enabled = config.get<number | null>("enable");
  // const host = config.get<string | null>("host");
  // const port = config.get<number | null>("port");
  // const fallbackPorts = config.get<number[] | null>("fallbacks");
  // onlyWhenInFocus = config.get<boolean | null>("onlyWhenInFocus");

  const openSettings = vscode.commands.registerCommand(
    `${APP_NAME}.openSettings`,
    () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        `@ext:${EXTENSION_ID}`
      );
    }
  );
  subscriptions.push(openSettings);

  // Create output channel
  outputChannel = vscode.window.createOutputChannel('AugheyRemote Control');

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(radio-tower) AugheyRemote Control";
  statusBarItem.tooltip = "AugheyRemote Control Extension";
  statusBarItem.show();

  // Connect to WebSocket server
  connectWebSocket(websocketUrl);

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

  // if (enabled) {
  //   startWebsocketServer(
  //     context,
  //     host || "127.0.0.1",
  //     port || 3710,
  //     (fallbackPorts || []).filter((p) => p !== port)
  //   );

  //   Logger.info("VSCode Remote Control is now active!");
  // } else {
  //   Logger.warning("VSCode Remote Control is not running!");
  // }
}

// this method is called when your extension is deactivated
export function deactivate() {
  ws?.close();
  wss?.close();
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

async function handleCommand(command: any) {
  // Show command received notification
  vscode.window.showInformationMessage(`Command received: ${JSON.stringify(command)}`);

  // Here you can add specific command handling logic
  // For example:
  switch (command.type) {
    case 'openFile':
      if (command.path) {
        vscode.window.showInformationMessage(`Opening file: ${command.path}`);
        const file = vscode.Uri.file(command.path);
        vscode.workspace.openTextDocument(file).then(document => {
          vscode.window.showTextDocument(document);
        });
      }
      break;
    case 'cursor':
      if (command.text) {
        vscode.window.showInformationMessage(`Setting cursor position: ${command.text}`);
        vscode.commands.executeCommand('composer.newAgentChat', command.text);
      }

  }
  //   break;
  //     case 'executeCommand':
  //   if (command.command) {
  //     vscode.commands.executeCommand(command.command);
  //   }
  //   break;
  //     default:
  //   console.log('Unknown command type:', command.type);
  // }
}
