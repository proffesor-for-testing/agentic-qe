/**
 * Patterns Commands - Database-backed pattern management
 *
 * All commands query the actual patterns.db database.
 */

export { patternsList } from './list';
export { patternsSearch } from './search';
export { patternsShow } from './show';
export { patternsExtract } from './extract';
export { patternsStats } from './stats';

// Main command router that uses database-backed implementations
export async function patternsCommand(subcommand: string, args: any[], options: any): Promise<void> {
  const { patternsList } = await import('./list');
  const { patternsSearch } = await import('./search');
  const { patternsShow } = await import('./show');
  const { patternsExtract } = await import('./extract');
  const { patternsStats } = await import('./stats');

  switch (subcommand) {
    case 'list':
      await patternsList(options);
      break;
    case 'search':
      if (!args[0]) {
        console.error('Search query required');
        process.exit(1);
      }
      await patternsSearch(args[0], options);
      break;
    case 'show':
      if (!args[0]) {
        console.error('Pattern ID required');
        process.exit(1);
      }
      await patternsShow(args[0]);
      break;
    case 'extract':
      if (!args[0]) {
        console.error('Directory path required');
        process.exit(1);
      }
      await patternsExtract(args[0], options);
      break;
    case 'stats':
      await patternsStats(options);
      break;
    default:
      console.error(`Unknown patterns command: ${subcommand}`);
      showHelp();
      process.exit(1);
  }
}

function showHelp(): void {
  console.log('\nAvailable commands:');
  console.log('  aqe patterns list      - List all patterns');
  console.log('  aqe patterns search    - Search patterns');
  console.log('  aqe patterns show      - Show pattern details');
  console.log('  aqe patterns extract   - Extract from tests');
  console.log('  aqe patterns stats     - Show statistics');
}
