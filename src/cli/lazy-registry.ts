/**
 * Lazy Command Registry
 *
 * Registers lightweight Commander stubs (name + description) for --help,
 * but defers loading the full command factory/handler until the user actually
 * runs the command. This avoids loading all command modules at startup.
 */

import { Command } from 'commander';

export interface LazyCommandDef {
  name: string;
  description: string;
  aliases?: string[];
  factory: () => Promise<Command>;
}

/**
 * Replace a stub command with the real one and re-parse.
 * Shared logic between registerLazyCommand and registerLazyHandler.
 */
function createLazyStub(
  program: Command,
  name: string,
  description: string,
  aliases?: string[],
): Command {
  const stub = program.command(name).description(description);
  if (aliases) {
    for (const a of aliases) {
      stub.alias(a);
    }
  }

  // Disable built-in help on the stub so --help triggers the action
  // instead of displaying the stub's minimal help.
  stub.helpOption(false);
  stub.allowUnknownOption(true);
  stub.allowExcessArguments(true);
  return stub;
}

function removeStub(program: Command, stub: Command): void {
  const cmds = program.commands as Command[];
  const idx = cmds.indexOf(stub);
  if (idx >= 0) cmds.splice(idx, 1);
}

/**
 * Register a lazy command that returns a Command object.
 * Used for command factories (createTestCommand, etc.)
 */
export function registerLazyCommand(program: Command, def: LazyCommandDef): void {
  const stub = createLazyStub(program, def.name, def.description, def.aliases);

  stub.action(async () => {
    try {
      const realCmd = await def.factory();
      removeStub(program, stub);
      program.addCommand(realCmd);
      await program.parseAsync(process.argv);
    } catch (error) {
      console.error(`Failed to load command '${def.name}':`, error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
}

/**
 * Register a lazy handler that implements ICommandHandler.register().
 * Used for handlers registered via the CommandRegistry pattern.
 */
export function registerLazyHandler(
  program: Command,
  name: string,
  description: string,
  factory: () => Promise<{ register(program: Command, context: any): void }>,
  context: any,
  aliases?: string[],
): void {
  const stub = createLazyStub(program, name, description, aliases);

  stub.action(async () => {
    try {
      const handler = await factory();
      removeStub(program, stub);
      handler.register(program, context);
      await program.parseAsync(process.argv);
    } catch (error) {
      console.error(`Failed to load command '${name}':`, error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
}
