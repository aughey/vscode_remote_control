# VS Code Remote Control Extension

This extension allows VS Code to be controlled remotely via WebSocket connection. It connects to a specified WebSocket server on startup and listens for commands.

## Features

- Connects to a remote WebSocket server on startup
- Shows connection status in the status bar
- Displays notifications when commands are received
- Supports basic command types (openFile, executeCommand)
- Manual reconnection command available

## Configuration

The extension can be configured through VS Code settings:

- `remoteControl.websocketUrl`: The WebSocket server URL to connect to (default: "ws://localhost:8080")

## Commands

- `remoteControl.reconnect`: Manually reconnect to the WebSocket server

## Command Format

The extension expects JSON commands in the following format:

```json
{
    "type": "commandType",
    // Additional parameters based on command type
}
```

Supported command types:
- `openFile`: Opens a file in VS Code
  ```json
  {
      "type": "openFile",
      "path": "/path/to/file"
  }
  ```
- `executeCommand`: Executes a VS Code command
  ```json
  {
      "type": "executeCommand",
      "command": "workbench.action.files.save"
  }
  ```

## Installation

1. Clone this repository
2. Run `npm install`
3. Press F5 to start debugging
4. The extension will be installed in your VS Code instance

## Building

To build the extension:

1. Run `npm install` to install dependencies
2. Run `npm run compile` to compile the TypeScript code
3. The compiled extension will be in the `out` directory