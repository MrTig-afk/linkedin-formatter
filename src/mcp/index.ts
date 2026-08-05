/**
 * MCP server over stdio.
 *
 * Thin transport wiring only - every decision lives in tools.ts as pure
 * functions, so the tests exercise the tools without starting a server.
 *
 * stdio deliberately, not HTTP. The extension's defining guarantee is that
 * nothing leaves the machine; an HTTP transport, even bound to localhost,
 * opens a listening socket and would need its own threat model (PRD S9).
 * Nothing here opens a socket, reads a file, or spawns a process: it is a
 * pure text transformation service on a pipe.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, callTool } from './tools';

const VERSION = '0.1.0';

const server = new Server(
  { name: 'linkedin-formatter', version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, (request) => {
  const result = callTool(request.params.name, request.params.arguments);
  return {
    content: [{ type: 'text' as const, text: result.text }],
    isError: result.isError,
  };
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  // stderr, never stdout: stdout is the JSON-RPC channel and anything
  // non-protocol written there corrupts the stream for the client.
  process.stderr.write(`linkedin-formatter mcp failed to start: ${String(err)}\n`);
  process.exitCode = 1;
});
