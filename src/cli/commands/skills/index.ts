/**
 * Skills CLI Commands
 *
 * Commands for managing Claude Code Skills that agents can use.
 * Shows only QE skills (17 total), filtering out Claude Flow skills.
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface SkillsCommandOptions {
  detailed?: boolean;
  limit?: number;
  category?: string;
  agent?: string;
  confirm?: boolean;
}

/**
 * QE Skill categories (excludes Claude Flow)
 */
interface SkillCategory {
  name: string;
  skills: string[];
}

const QE_SKILLS: SkillCategory[] = [
  {
    name: 'Core Testing',
    skills: [
      'agentic-quality-engineering',
      'context-driven-testing',
      'holistic-testing-pact'
    ]
  },
  {
    name: 'Development',
    skills: [
      'tdd-london-chicago',
      'xp-practices',
      'pair-programming',
      'sparc-methodology'
    ]
  },
  {
    name: 'Testing Techniques',
    skills: [
      'api-testing-patterns',
      'exploratory-testing-advanced',
      'verification-quality',
      'bug-reporting-excellence'
    ]
  },
  {
    name: 'Communication',
    skills: [
      'skill-builder'
    ]
  },
  {
    name: 'Professional',
    skills: [
      'performance-analysis',
      'reasoningbank-agentdb',
      'reasoningbank-intelligence',
      'stream-chain',
      'swarm-advanced',
      'swarm-orchestration'
    ]
  }
];

export class SkillsCommand {
  private static skillsPath = '.claude/skills';

  static async execute(subcommand: string, args: any[] = [], options: SkillsCommandOptions = {}): Promise<void> {
    switch (subcommand) {
      case 'list':
        await this.listSkills(options);
        break;
      case 'search':
        await this.searchSkills(args[0], options);
        break;
      case 'show':
        await this.showSkill(args[0]);
        break;
      case 'enable':
        await this.enableSkill(args[0], options);
        break;
      case 'disable':
        await this.disableSkill(args[0], options);
        break;
      case 'stats':
        await this.showStats();
        break;
      default:
        console.error(chalk.red(`❌ Unknown skills command: ${subcommand}`));
        this.showHelp();
        process.exit(1);
    }
  }

  /**
   * List all QE skills (excludes Claude Flow)
   */
  private static async listSkills(options: SkillsCommandOptions): Promise<void> {
    const spinner = ora('Loading skills...').start();

    try {
      if (!await fs.pathExists(this.skillsPath)) {
        spinner.fail('Skills directory not found');
        console.log(chalk.yellow('\n💡 Run "aqe init" to initialize skills'));
        return;
      }

      const allSkills = await fs.readdir(this.skillsPath);
      const qeSkills = this.filterQESkills(allSkills);

      if (qeSkills.length === 0) {
        spinner.info('No QE skills found');
        return;
      }

      spinner.succeed(`Found ${qeSkills.length} QE skills`);

      console.log(chalk.blue('\n🎯 Available QE Skills\n'));

      for (const category of QE_SKILLS) {
        const categorySkills = category.skills.filter(skill =>
          qeSkills.some(s => s.includes(skill))
        );

        if (categorySkills.length === 0) continue;

        console.log(chalk.cyan(`\n${category.name} (${categorySkills.length}):`));
        categorySkills.forEach(skill => {
          console.log(`  • ${chalk.yellow(skill)}`);
        });
      }

      console.log(chalk.gray('\nUse "aqe skills show <name>" for details'));
      console.log(chalk.gray(`Total QE Skills: ${qeSkills.length}/17`));
      console.log();

    } catch (error: any) {
      spinner.fail('Failed to list skills');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Search QE skills by keyword
   */
  private static async searchSkills(keyword: string, options: SkillsCommandOptions): Promise<void> {
    if (!keyword) {
      console.error(chalk.red('❌ Keyword is required'));
      console.log(chalk.gray('Example: aqe skills search "testing"'));
      process.exit(1);
    }

    const spinner = ora(`Searching for "${keyword}"...`).start();

    try {
      const allSkills = await fs.readdir(this.skillsPath);
      const qeSkills = this.filterQESkills(allSkills);

      const matches = qeSkills.filter(s =>
        s.toLowerCase().includes(keyword.toLowerCase())
      );

      if (matches.length === 0) {
        spinner.info('No matching QE skills found');
        return;
      }

      spinner.succeed(`Found ${matches.length} matching QE skills`);

      console.log(chalk.blue('\n🔍 Search Results\n'));
      matches.forEach(skill => {
        console.log(`  • ${chalk.cyan(skill)}`);
      });
      console.log();

    } catch (error: any) {
      spinner.fail('Search failed');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Show skill details
   */
  private static async showSkill(skillName: string): Promise<void> {
    if (!skillName) {
      console.error(chalk.red('❌ Skill name is required'));
      process.exit(1);
    }

    const spinner = ora('Loading skill details...').start();

    try {
      // Check if this is a QE skill
      const isQESkill = QE_SKILLS.some(cat =>
        cat.skills.some(s => skillName.includes(s) || s.includes(skillName))
      );

      if (!isQESkill) {
        spinner.warn('This is not a QE skill');
        console.log(chalk.yellow('\n💡 Use "aqe skills list" to see all QE skills'));
        return;
      }

      const skillPath = path.join(this.skillsPath, skillName);

      if (!await fs.pathExists(skillPath)) {
        spinner.fail('Skill not found');
        return;
      }

      const isDirectory = (await fs.stat(skillPath)).isDirectory();

      if (isDirectory) {
        // Skill is a directory - read skill.md or README.md
        const possibleFiles = ['skill.md', 'README.md', 'index.md'];
        let content = '';

        for (const file of possibleFiles) {
          const filePath = path.join(skillPath, file);
          if (await fs.pathExists(filePath)) {
            content = await fs.readFile(filePath, 'utf-8');
            break;
          }
        }

        if (!content) {
          spinner.warn('No documentation found for skill');
          return;
        }

        spinner.succeed('Skill loaded');
        console.log(chalk.blue(`\n📖 ${skillName}\n`));

        // Parse YAML frontmatter if present
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
          console.log(chalk.cyan('Metadata:'));
          console.log(chalk.gray(frontmatterMatch[1]));
          console.log();
        }

        // Show first 20 lines of content
        const lines = content.split('\n');
        const preview = lines.slice(0, 20).join('\n');
        console.log(preview);

        if (lines.length > 20) {
          console.log(chalk.gray(`\n... (${lines.length - 20} more lines)`));
        }
        console.log();

      } else {
        // Skill is a file
        const content = await fs.readFile(skillPath, 'utf-8');
        spinner.succeed('Skill loaded');
        console.log(chalk.blue(`\n📖 ${skillName}\n`));
        console.log(content);
      }

    } catch (error: any) {
      spinner.fail('Failed to load skill');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Enable skill for agents
   */
  private static async enableSkill(skillName: string, options: SkillsCommandOptions): Promise<void> {
    if (!skillName) {
      console.error(chalk.red('❌ Skill name is required'));
      process.exit(1);
    }

    console.log(chalk.yellow('⚠️  Skill enablement requires configuration update'));
    console.log(chalk.gray('Add skill to agent definitions in .claude/agents/'));
    console.log(chalk.gray(`Example: Add "${skillName}" to agent capabilities\n`));
  }

  /**
   * Disable skill for agents
   */
  private static async disableSkill(skillName: string, options: SkillsCommandOptions): Promise<void> {
    if (!skillName) {
      console.error(chalk.red('❌ Skill name is required'));
      process.exit(1);
    }

    console.log(chalk.yellow('⚠️  Skill disablement requires configuration update'));
    console.log(chalk.gray('Remove skill from agent definitions in .claude/agents/'));
    console.log(chalk.gray(`Example: Remove "${skillName}" from agent capabilities\n`));
  }

  /**
   * Show skill statistics
   */
  private static async showStats(): Promise<void> {
    const spinner = ora('Calculating statistics...').start();

    try {
      const allSkills = await fs.readdir(this.skillsPath);
      const qeSkills = this.filterQESkills(allSkills);

      const categoryCounts: Record<string, number> = {};

      for (const category of QE_SKILLS) {
        const count = category.skills.filter(skill =>
          qeSkills.some(s => s.includes(skill))
        ).length;

        if (count > 0) {
          categoryCounts[category.name] = count;
        }
      }

      spinner.succeed('Statistics calculated');

      console.log(chalk.blue('\n📊 QE Skill Statistics\n'));
      console.log(`Total QE Skills: ${chalk.cyan(qeSkills.length.toString())}/17`);

      console.log(chalk.blue('\n📦 By Category:\n'));
      Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, count]) => {
          console.log(`  ${category.padEnd(25)} ${chalk.cyan(count.toString())}`);
        });

      console.log();

    } catch (error: any) {
      spinner.fail('Failed to calculate statistics');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Filter to only QE skills (excludes Claude Flow)
   */
  private static filterQESkills(allSkills: string[]): string[] {
    const qeSkillNames = QE_SKILLS.flatMap(cat => cat.skills);

    return allSkills.filter(skill => {
      // Exclude if it contains 'flow-nexus', 'github', 'agentdb', 'hive-mind'
      if (skill.includes('flow-nexus') ||
          skill.includes('github') ||
          skill.includes('agentdb') ||
          skill.includes('hive-mind')) {
        return false;
      }

      // Include if it matches any QE skill name
      return qeSkillNames.some(qeName =>
        skill.includes(qeName) || qeName.includes(skill)
      );
    });
  }

  /**
   * Show command help
   */
  private static showHelp(): void {
    console.log(chalk.blue('\n📚 Skills Commands:\n'));
    console.log(chalk.cyan('  aqe skills list') + chalk.gray('               - List all QE skills (17 total)'));
    console.log(chalk.cyan('  aqe skills search <keyword>') + chalk.gray('   - Search QE skills by keyword'));
    console.log(chalk.cyan('  aqe skills show <name>') + chalk.gray('        - Show skill details'));
    console.log(chalk.cyan('  aqe skills enable <name>') + chalk.gray('       - Enable skill for agents'));
    console.log(chalk.cyan('  aqe skills disable <name>') + chalk.gray('      - Disable skill'));
    console.log(chalk.cyan('  aqe skills stats') + chalk.gray('              - Show skill statistics'));
    console.log(chalk.blue('\nOptions:\n'));
    console.log(chalk.gray('  --detailed         - Show detailed information'));
    console.log(chalk.gray('  --category <name>  - Filter by category'));
    console.log(chalk.gray('  --agent <id>       - Target specific agent'));
    console.log(chalk.blue('\nExamples:\n'));
    console.log(chalk.gray('  aqe skills list --detailed'));
    console.log(chalk.gray('  aqe skills search "testing"'));
    console.log(chalk.gray('  aqe skills show agentic-quality-engineering'));
    console.log(chalk.gray('  aqe skills stats'));
    console.log();
  }
}

// Export command functions for CLI registration
export async function skillsCommand(subcommand: string, args: any[], options: SkillsCommandOptions): Promise<void> {
  await SkillsCommand.execute(subcommand, args, options);
}
