"""Railway MCP Server for SparkOps

This MCP server provides tools to interact with Railway services:
- Project management
- Deployment monitoring
- Environment variable management
- Service status checking
"""

import asyncio
import json
import subprocess
import sys
from typing import Any, Dict, List

try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import Resource, Tool, TextContent
except ImportError:
    print("MCP dependencies not found. Install with: pip install mcp")
    sys.exit(1)

# Initialize MCP server
server = Server("railway-mcp-server")

async def run_railway_command(args: List[str]) -> Dict[str, Any]:
    """Execute a Railway command and return the result."""
    try:
        cmd = ["railway"] + args
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            text=True
        )
        
        stdout, stderr = await process.communicate()
        
        return {
            "success": process.returncode == 0,
            "stdout": stdout,
            "stderr": stderr,
            "returncode": process.returncode
        }
    except Exception as e:
        return {
            "success": False,
            "stdout": "",
            "stderr": str(e),
            "returncode": -1
        }

@server.list_tools()
async def list_tools() -> List[Tool]:
    """List available Railway MCP tools."""
    return [
        Tool(
            name="railway_status",
            description="Get current Railway project status",
            inputSchema={
                "type": "object",
                "properties": {},
            }
        ),
        Tool(
            name="railway_deploy",
            description="Deploy current project to Railway",
            inputSchema={
                "type": "object",
                "properties": {
                    "environment": {
                        "type": "string",
                        "description": "Environment to deploy to (optional)",
                        "default": "production"
                    }
                }
            }
        ),
        Tool(
            name="railway_logs",
            description="Get deployment logs from Railway",
            inputSchema={
                "type": "object",
                "properties": {
                    "service": {
                        "type": "string",
                        "description": "Service name (optional)",
                        "default": ""
                    },
                    "lines": {
                        "type": "integer",
                        "description": "Number of log lines to fetch",
                        "default": 50
                    }
                }
            }
        ),
        Tool(
            name="railway_variables",
            description="List environment variables for services",
            inputSchema={
                "type": "object",
                "properties": {
                    "service": {
                        "type": "string",
                        "description": "Service name (optional)",
                        "default": ""
                    }
                }
            }
        ),
        Tool(
            name="railway_restart",
            description="Restart a Railway service",
            inputSchema={
                "type": "object",
                "properties": {
                    "service": {
                        "type": "string",
                        "description": "Service name to restart",
                        "default": ""
                    }
                }
            }
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: Dict[str, Any]) -> List[TextContent]:
    """Execute Railway MCP tools."""
    
    if name == "railway_status":
        result = await run_railway_command(["status"])
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    
    elif name == "railway_deploy":
        env = arguments.get("environment", "production")
        result = await run_railway_command(["up", "--environment", env])
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    
    elif name == "railway_logs":
        service = arguments.get("service", "")
        lines = arguments.get("lines", 50)
        
        args = ["logs", "--lines", str(lines)]
        if service:
            args.extend(["--service", service])
            
        result = await run_railway_command(args)
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    
    elif name == "railway_variables":
        service = arguments.get("service", "")
        
        args = ["variables"]
        if service:
            args.extend(["--service", service])
            
        result = await run_railway_command(args)
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    
    elif name == "railway_restart":
        service = arguments.get("service", "")
        
        if not service:
            return [TextContent(type="text", text=json.dumps({
                "success": False,
                "error": "Service name is required for restart"
            }, indent=2))]
        
        result = await run_railway_command(["restart", "--service", service])
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    
    else:
        return [TextContent(type="text", text=f"Unknown tool: {name}")]

@server.list_resources()
async def list_resources() -> List[Resource]:
    """List available Railway resources."""
    return [
        Resource(
            uri="railway://project/status",
            name="Railway Project Status",
            description="Current status of Railway project",
            mimeType="application/json"
        ),
        Resource(
            uri="railway://services/list",
            name="Railway Services",
            description="List of all Railway services",
            mimeType="application/json"
        )
    ]

@server.read_resource()
async def read_resource(uri: str) -> str:
    """Read Railway resource data."""
    
    if uri == "railway://project/status":
        result = await run_railway_command(["status"])
        return json.dumps(result, indent=2)
    
    elif uri == "railway://services/list":
        result = await run_railway_command(["service", "list"])
        return json.dumps(result, indent=2)
    
    else:
        return json.dumps({"error": f"Unknown resource: {uri}"})

async def main():
    """Run the Railway MCP server."""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options()
        )

if __name__ == "__main__":
    asyncio.run(main())