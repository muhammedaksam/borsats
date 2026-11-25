import { CLI_COMMANDS, CliIO } from "~/cli/commands";

export const CLI_VERSION = "0.11.0";

export function formatHelpText(): string {
  const lines = [
    `borsats ${CLI_VERSION} - Turkish financial markets data CLI`,
    "",
    "Usage: borsats <command> [args] [options]",
    "",
    "Global Options:",
    "  -h, --help       Show help message",
    "  -v, --version    Show version and exit",
    "  -o, --output     Output format: table | json | csv (default: table)",
    "",
    "Commands:",
  ];

  const names = Object.keys(CLI_COMMANDS);
  const maxLen = Math.max(...names.map((n) => n.length));
  for (const name of names) {
    lines.push(
      `  ${name.padEnd(maxLen + 2, " ")}${CLI_COMMANDS[name].description}`,
    );
  }

  return lines.join("\n");
}

export async function runCli(
  argv: string[],
  customIO?: Partial<CliIO>,
): Promise<number> {
  const io: CliIO = {
    stdout: customIO?.stdout || ((msg) => console.log(msg)),
    stderr: customIO?.stderr || ((msg) => console.error(msg)),
  };

  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    io.stdout(formatHelpText());
    return 0;
  }

  if (argv[0] === "-v" || argv[0] === "--version") {
    io.stdout(`borsats ${CLI_VERSION}`);
    return 0;
  }

  const [cmdName, ...rest] = argv;
  const cmd = CLI_COMMANDS[cmdName];
  if (!cmd) {
    io.stderr(
      `Unknown command: ${cmdName}\nRun "borsats --help" to see available commands.`,
    );
    return 1;
  }

  if (rest.includes("--help") || rest.includes("-h")) {
    io.stdout(`borsats ${cmdName} - ${cmd.description}`);
    return 0;
  }

  try {
    return await cmd.handler(rest, io);
  } catch (err) {
    io.stderr(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

export async function main(): Promise<void> {
  const code = await runCli(process.argv.slice(2));
  if (code !== 0) {
    process.exit(code);
  }
}
