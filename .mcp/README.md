# Railway MCP Server for SparkOps

This directory contains the Model Context Protocol (MCP) server for interacting with Railway services.

## Files

- `claude_desktop_config.json` - MCP configuration for Claude Desktop
- `railway_mcp_server.py` - Custom MCP server implementation

## Setup

1. Install MCP dependencies:
```bash
pip install mcp
```

2. Set your Railway API token:
```bash
export RAILWAY_API_TOKEN="your_token_here"
```

3. Add the configuration to Claude Desktop by copying the config to:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/claude/claude_desktop_config.json`

## Available Tools

- `railway_status` - Get current project status
- `railway_deploy` - Deploy project to Railway
- `railway_logs` - Get deployment logs
- `railway_variables` - List environment variables
- `railway_restart` - Restart a service

## Available Resources

- `railway://project/status` - Current project status
- `railway://services/list` - List of all services

## Usage

Once configured in Claude Desktop, you can:
- Ask "What's the status of my Railway project?"
- Request "Deploy the frontend to production"
- Get "Show me the logs for the backend service"
- Check "List all environment variables"

## Notes

- Requires Railway CLI to be installed and logged in
- The MCP server wraps Railway CLI commands
- All commands are executed with proper error handling and JSON output