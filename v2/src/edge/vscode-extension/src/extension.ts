/**
 * Agentic QE Companion - VS Code Extension Entry Point
 *
 * This extension embeds browser-compatible QE agents from @ruvector/edge
 * to provide:
 * - Test suggestions via CodeActionProvider
 * - Coverage decorations in the editor gutter
 * - QE Dashboard webview panel
 * - Inline test hints with suggestions
 * - Test preview on hover
 * - Multi-step test generation quick pick
 * - Coverage gap overlay
 *
 * Phase 1: P1-001 - VS Code Extension Scaffold
 * Phase 1: P1-003 - Inline Test Suggestion UI
 *
 * @module vscode-extension/extension
 * @version 0.2.0
 */

import * as vscode from 'vscode';

import { TestSuggestionProvider } from './providers/TestSuggestionProvider';
import { CoverageDecorationProvider } from './providers/CoverageDecorationProvider';
import { CoverageGapVisualization } from './providers/CoverageGapVisualization';
import { QEPanelProvider } from './views/QEPanelProvider';
import { EdgeAgentService } from './services/EdgeAgentService';
import { AnalysisService } from './services/AnalysisService';
import {
  InlineTestHint,
  TestPreviewHover,
  TestGenerationQuickPick,
  CoverageOverlay,
  CoverageGapQuickPick,
  generateTestFromOptions,
} from './ui';

/**
 * Extension context singleton for service access
 */
let extensionContext: vscode.ExtensionContext | undefined;
let edgeAgentService: EdgeAgentService | undefined;
let analysisService: AnalysisService | undefined;
let testSuggestionProvider: TestSuggestionProvider | undefined;
let coverageDecorationProvider: CoverageDecorationProvider | undefined;
let coverageGapVisualization: CoverageGapVisualization | undefined;
let qePanelProvider: QEPanelProvider | undefined;

// New UI components
let inlineTestHint: InlineTestHint | undefined;
let testPreviewHover: TestPreviewHover | undefined;
let testGenerationQuickPick: TestGenerationQuickPick | undefined;
let coverageOverlay: CoverageOverlay | undefined;

/**
 * Output channel for extension logging
 */
let outputChannel: vscode.OutputChannel;

/**
 * Activate the extension
 *
 * Called when the extension is activated (on supported file types or commands)
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extensionContext = context;

  // Create output channel for logging
  outputChannel = vscode.window.createOutputChannel('Agentic QE');
  context.subscriptions.push(outputChannel);

  log('Activating Agentic QE Companion extension...');

  try {
    // Initialize the EdgeAgentService with @ruvector/edge
    edgeAgentService = new EdgeAgentService(getConfiguration());
    await edgeAgentService.initialize();
    log('EdgeAgentService initialized successfully');

    // Initialize AnalysisService
    analysisService = new AnalysisService(edgeAgentService);
    log('AnalysisService initialized');

    // Register providers
    registerProviders(context);

    // Register UI components
    registerUIComponents(context);

    // Register commands
    registerCommands(context);

    // Register event handlers
    registerEventHandlers(context);

    // Show activation message
    const config = vscode.workspace.getConfiguration('aqe');
    if (!config.get('debugMode')) {
      vscode.window.setStatusBarMessage('Agentic QE ready', 3000);
    }

    log('Agentic QE Companion extension activated successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Failed to activate extension: ${errorMessage}`, 'error');
    vscode.window.showErrorMessage(`Agentic QE failed to activate: ${errorMessage}`);
  }
}

/**
 * Deactivate the extension
 *
 * Called when the extension is deactivated
 */
export async function deactivate(): Promise<void> {
  log('Deactivating Agentic QE Companion extension...');

  try {
    // Shutdown services
    if (edgeAgentService) {
      await edgeAgentService.shutdown();
      edgeAgentService = undefined;
    }

    // Clear providers
    testSuggestionProvider = undefined;
    coverageDecorationProvider = undefined;
    coverageGapVisualization = undefined;
    qePanelProvider = undefined;
    analysisService = undefined;

    // Clear UI components
    inlineTestHint = undefined;
    testPreviewHover = undefined;
    testGenerationQuickPick = undefined;
    coverageOverlay = undefined;

    log('Agentic QE Companion extension deactivated');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Error during deactivation: ${errorMessage}`, 'error');
  }
}

/**
 * Register code providers (CodeAction, Decoration)
 */
function registerProviders(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('aqe');

  // TypeScript and JavaScript document selectors
  const documentSelectors: vscode.DocumentSelector = [
    { language: 'typescript', scheme: 'file' },
    { language: 'javascript', scheme: 'file' },
    { language: 'typescriptreact', scheme: 'file' },
    { language: 'javascriptreact', scheme: 'file' },
  ];

  // Register TestSuggestionProvider as CodeActionProvider
  if (config.get('showTestSuggestions', true)) {
    testSuggestionProvider = new TestSuggestionProvider(analysisService!);
    const codeActionProvider = vscode.languages.registerCodeActionsProvider(
      documentSelectors,
      testSuggestionProvider,
      {
        providedCodeActionKinds: TestSuggestionProvider.providedCodeActionKinds,
      }
    );
    context.subscriptions.push(codeActionProvider);
    log('TestSuggestionProvider registered');
  }

  // Register CoverageDecorationProvider for gutter decorations
  if (config.get('showCoverageDecorations', true)) {
    coverageDecorationProvider = new CoverageDecorationProvider(analysisService!);
    context.subscriptions.push(coverageDecorationProvider);
    log('CoverageDecorationProvider registered');
  }

  // Register QEPanelProvider for webview panel
  qePanelProvider = new QEPanelProvider(context.extensionUri, edgeAgentService!, analysisService!);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(QEPanelProvider.viewType, qePanelProvider)
  );
  log('QEPanelProvider registered');

  // Register CoverageGapVisualization for advanced coverage gap detection
  if (config.get('showCoverageGaps', true)) {
    coverageGapVisualization = new CoverageGapVisualization(analysisService!);
    context.subscriptions.push(coverageGapVisualization);
    log('CoverageGapVisualization registered');
  }
}

/**
 * Register UI components (InlineTestHint, TestPreviewHover, etc.)
 */
function registerUIComponents(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('aqe');

  // TypeScript and JavaScript document selectors
  const documentSelectors: vscode.DocumentSelector = [
    { language: 'typescript', scheme: 'file' },
    { language: 'javascript', scheme: 'file' },
    { language: 'typescriptreact', scheme: 'file' },
    { language: 'javascriptreact', scheme: 'file' },
  ];

  // Register InlineTestHint for inline decorations
  if (config.get('showInlineHints', true)) {
    inlineTestHint = new InlineTestHint(analysisService!);
    context.subscriptions.push(inlineTestHint);

    // Handle hint clicks
    inlineTestHint.onHintClick(async (hintData) => {
      log(`Hint clicked for function: ${hintData.functionInfo.name}`);

      if (hintData.suggestions.length > 0) {
        // Show quick pick for test generation
        await vscode.commands.executeCommand('aqe.showTestQuickPick', {
          functionName: hintData.functionInfo.name,
          code: hintData.functionInfo.code,
        });
      } else {
        // Show test generation quick pick
        await vscode.commands.executeCommand('aqe.suggestTests');
      }
    });

    log('InlineTestHint registered');
  }

  // Register TestPreviewHover for hover functionality
  if (config.get('showTestPreviewHover', true) && inlineTestHint) {
    testPreviewHover = new TestPreviewHover(analysisService!, inlineTestHint);
    const hoverProvider = vscode.languages.registerHoverProvider(
      documentSelectors,
      testPreviewHover
    );
    context.subscriptions.push(hoverProvider);
    log('TestPreviewHover registered');
  }

  // Initialize TestGenerationQuickPick
  testGenerationQuickPick = new TestGenerationQuickPick(analysisService!);
  context.subscriptions.push(testGenerationQuickPick);
  log('TestGenerationQuickPick initialized');

  // Register CoverageOverlay for coverage gap visualization
  if (config.get('showCoverageOverlay', false)) {
    coverageOverlay = new CoverageOverlay(analysisService!);
    context.subscriptions.push(coverageOverlay);
    log('CoverageOverlay registered');
  }
}

/**
 * Register extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // aqe.analyze - Analyze current file
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.analyze', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Analyzing file...',
            cancellable: false,
          },
          async () => {
            const document = editor.document;
            const analysis = await analysisService!.analyzeFile(document);

            // Update coverage decorations
            if (coverageDecorationProvider) {
              coverageDecorationProvider.updateDecorations(editor, analysis);
            }

            // Update inline hints
            if (inlineTestHint) {
              await inlineTestHint.updateHints(editor);
            }

            // Show analysis summary
            const message = `Analysis complete: ${analysis.functions.length} functions, ${analysis.suggestions.length} suggestions`;
            vscode.window.showInformationMessage(message);

            log(`Analyzed ${document.fileName}: ${message}`);
          }
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Analysis failed: ${errorMessage}`);
        log(`Analysis failed: ${errorMessage}`, 'error');
      }
    })
  );

  // aqe.generateTests - Generate tests for selection
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.generateTests', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      const selection = editor.selection;
      if (selection.isEmpty) {
        vscode.window.showWarningMessage('Please select code to generate tests for');
        return;
      }

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Generating tests...',
            cancellable: false,
          },
          async () => {
            const selectedText = editor.document.getText(selection);
            const fileName = editor.document.fileName;

            const suggestions = await analysisService!.suggestTests(selectedText, fileName);

            if (suggestions.length === 0) {
              vscode.window.showInformationMessage('No test suggestions available for this selection');
              return;
            }

            // Show suggestions in quickpick
            const items = suggestions.map((s, i) => ({
              label: `$(beaker) ${s.title}`,
              description: s.description,
              detail: s.code.substring(0, 100) + '...',
              suggestion: s,
            }));

            const selected = await vscode.window.showQuickPick(items, {
              placeHolder: 'Select a test suggestion to insert',
              matchOnDescription: true,
            });

            if (selected) {
              // Insert test code at end of file or in a new test file
              const testCode = selected.suggestion.code;
              await insertTestCode(editor.document, testCode);
            }

            log(`Generated ${suggestions.length} test suggestions for selection`);
          }
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Test generation failed: ${errorMessage}`);
        log(`Test generation failed: ${errorMessage}`, 'error');
      }
    })
  );

  // aqe.showPanel - Show QE Panel
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.showPanel', async () => {
      // Focus the QE panel view
      await vscode.commands.executeCommand('aqe.panel.focus');
      log('QE Panel shown');
    })
  );

  // aqe.suggestTests - Suggest tests for function at cursor
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.suggestTests', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      try {
        const position = editor.selection.active;
        const document = editor.document;

        // Find function at cursor
        const analysis = await analysisService!.analyzeFile(document);
        const functionAtCursor = analysis.functions.find(
          (f) => position.line >= f.startLine && position.line <= f.endLine
        );

        if (!functionAtCursor) {
          vscode.window.showInformationMessage('No function found at cursor position');
          return;
        }

        const suggestions = await analysisService!.suggestTests(
          functionAtCursor.code,
          document.fileName
        );

        if (suggestions.length > 0) {
          vscode.window.showInformationMessage(
            `Found ${suggestions.length} test patterns for ${functionAtCursor.name}`
          );
        }

        log(`Suggested tests for function: ${functionAtCursor.name}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Test suggestion failed: ${errorMessage}`);
        log(`Test suggestion failed: ${errorMessage}`, 'error');
      }
    })
  );

  // aqe.viewPatterns - View stored patterns
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.viewPatterns', async () => {
      try {
        const patterns = await edgeAgentService!.getPatterns();
        const stats = await edgeAgentService!.getStats();

        const message = `Stored Patterns: ${stats.count} patterns, ${stats.dimension}D vectors`;
        vscode.window.showInformationMessage(message);

        log(`Viewed patterns: ${stats.count} patterns`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to view patterns: ${errorMessage}`);
        log(`Failed to view patterns: ${errorMessage}`, 'error');
      }
    })
  );

  // aqe.clearPatterns - Clear pattern cache
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.clearPatterns', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Clear all stored patterns? This cannot be undone.',
        { modal: true },
        'Clear'
      );

      if (confirm === 'Clear') {
        try {
          await edgeAgentService!.clearPatterns();
          vscode.window.showInformationMessage('Pattern cache cleared');
          log('Pattern cache cleared');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Failed to clear patterns: ${errorMessage}`);
          log(`Failed to clear patterns: ${errorMessage}`, 'error');
        }
      }
    })
  );

  // aqe.showCoverageGaps - Show coverage gaps in quick pick
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.showCoverageGaps', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      // Prefer new CoverageOverlay if available
      if (coverageOverlay) {
        await CoverageGapQuickPick.show(coverageOverlay, editor);
        log('Coverage gaps shown (new UI)');
        return;
      }

      // Fall back to CoverageGapVisualization
      if (!coverageGapVisualization) {
        vscode.window.showWarningMessage('Coverage gap visualization not enabled');
        return;
      }

      try {
        await coverageGapVisualization.showCoverageGaps(editor);
        log('Coverage gaps shown');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to show coverage gaps: ${errorMessage}`);
        log(`Failed to show coverage gaps: ${errorMessage}`, 'error');
      }
    })
  );

  // aqe.showTestQuickPick - Show multi-step test generation quick pick
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.showTestQuickPick', async (args?: { functionName: string; code: string; sourceFile?: string }) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      try {
        const code = args?.code || editor.document.getText(editor.selection);
        const functionName = args?.functionName || 'selectedCode';
        const sourceFile = args?.sourceFile || editor.document.fileName;

        if (!code) {
          vscode.window.showWarningMessage('No code selected');
          return;
        }

        // Show the multi-step quick pick
        const options = await testGenerationQuickPick!.show(code, functionName, sourceFile);

        if (options) {
          // Generate test code from options
          const testCode = generateTestFromOptions(options);

          // Insert the test code
          await insertTestCode(editor.document, testCode);

          vscode.window.showInformationMessage(
            `Generated ${options.testType} test with ${options.framework} framework`
          );
          log(`Generated test: ${options.testType} with ${options.framework}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Test generation failed: ${errorMessage}`);
        log(`Test generation failed: ${errorMessage}`, 'error');
      }
    })
  );

  // aqe.insertTest - Insert test code
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.insertTest', async (args?: { code: string }) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !args?.code) {
        return;
      }

      await insertTestCode(editor.document, args.code);
      log('Test code inserted');
    })
  );

  // aqe.copyTestToClipboard - Copy test to clipboard
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.copyTestToClipboard', async (args?: { code: string }) => {
      if (!args?.code) {
        return;
      }

      await vscode.env.clipboard.writeText(args.code);
      vscode.window.showInformationMessage('Test code copied to clipboard');
      log('Test code copied to clipboard');
    })
  );

  // aqe.generateTestsForFunction - Generate tests for a specific function
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.generateTestsForFunction', async (args?: { functionName: string }) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      try {
        const document = editor.document;
        const analysis = await analysisService!.analyzeFile(document);
        const func = analysis.functions.find((f) => f.name === args?.functionName);

        if (!func) {
          vscode.window.showWarningMessage(`Function ${args?.functionName} not found`);
          return;
        }

        // Use quick pick for generation
        await vscode.commands.executeCommand('aqe.showTestQuickPick', {
          functionName: func.name,
          code: func.code,
          sourceFile: document.fileName,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to generate tests: ${errorMessage}`);
        log(`Failed to generate tests: ${errorMessage}`, 'error');
      }
    })
  );

  // aqe.generateEdgeCaseTests - Generate edge case tests for a function
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.generateEdgeCaseTests', async (args?: { functionName: string }) => {
      // Reuse the quick pick with edge cases pre-selected
      await vscode.commands.executeCommand('aqe.generateTestsForFunction', args);
    })
  );

  // aqe.toggleCoverageOverlay - Toggle coverage overlay
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.toggleCoverageOverlay', async () => {
      if (!coverageOverlay) {
        // Initialize if not already done
        coverageOverlay = new CoverageOverlay(analysisService!);
        extensionContext!.subscriptions.push(coverageOverlay);
      }

      coverageOverlay.toggle();
      log('Coverage overlay toggled');
    })
  );

  // aqe.showRefactoringSuggestions - Show refactoring suggestions for testability
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.showRefactoringSuggestions', async (args?: { functionName: string; testability?: unknown }) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !args?.functionName) {
        return;
      }

      try {
        const testability = testSuggestionProvider?.getTestabilityAnalysis(
          editor.document,
          args.functionName
        );

        if (!testability || testability.suggestions.length === 0) {
          vscode.window.showInformationMessage('No refactoring suggestions available');
          return;
        }

        // Show quick pick with suggestions
        const items = testability.suggestions.map((s) => ({
          label: `$(wrench) ${s.title}`,
          description: `+${s.expectedImprovement}% testability`,
          detail: s.description,
          suggestion: s,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a refactoring suggestion',
          matchOnDescription: true,
          matchOnDetail: true,
        });

        if (selected) {
          // Show detailed information about the refactoring
          vscode.window.showInformationMessage(
            `Refactoring: ${selected.suggestion.title} - ${selected.suggestion.description}`
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to show suggestions: ${errorMessage}`);
        log(`Failed to show suggestions: ${errorMessage}`, 'error');
      }
    })
  );

  // aqe.generateAllTests - Generate tests for all functions
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.generateAllTests', async (args?: { documentUri: string; functions: string[] }) => {
      if (!args?.documentUri || !args?.functions) {
        return;
      }

      try {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(args.documentUri));
        const analysis = await analysisService!.analyzeFile(document);

        const untestedFunctions = analysis.functions.filter(
          (f) => !f.hasTests && args.functions.includes(f.name)
        );

        if (untestedFunctions.length === 0) {
          vscode.window.showInformationMessage('All functions already have tests');
          return;
        }

        // Generate tests for each function
        let generatedCount = 0;
        for (const func of untestedFunctions) {
          const suggestions = await analysisService!.suggestTests(func.code, document.fileName);
          if (suggestions.length > 0) {
            await insertTestCode(document, suggestions[0].code);
            generatedCount++;
          }
        }

        vscode.window.showInformationMessage(
          `Generated tests for ${generatedCount} of ${untestedFunctions.length} functions`
        );
        log(`Generated tests for ${generatedCount} functions`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to generate all tests: ${errorMessage}`);
        log(`Failed to generate all tests: ${errorMessage}`, 'error');
      }
    })
  );

  // aqe.viewTestsForFunction - View existing tests for a function
  context.subscriptions.push(
    vscode.commands.registerCommand('aqe.viewTestsForFunction', async (args?: { functionName: string }) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !args?.functionName) {
        return;
      }

      try {
        const sourcePath = editor.document.fileName;
        const testPath = getTestFilePath(sourcePath);
        const testUri = vscode.Uri.file(testPath);

        // Try to open test file
        try {
          const testDoc = await vscode.workspace.openTextDocument(testUri);
          await vscode.window.showTextDocument(testDoc);

          // Search for function name in test file
          const text = testDoc.getText();
          const funcNameLower = args.functionName.toLowerCase();
          const index = text.toLowerCase().indexOf(funcNameLower);

          if (index >= 0) {
            const position = testDoc.positionAt(index);
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
              activeEditor.selection = new vscode.Selection(position, position);
              activeEditor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
              );
            }
          }
        } catch {
          vscode.window.showInformationMessage(`No test file found at ${testPath}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to view tests: ${errorMessage}`);
        log(`Failed to view tests: ${errorMessage}`, 'error');
      }
    })
  );

  log('Commands registered');
}

/**
 * Register event handlers
 */
function registerEventHandlers(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('aqe');

  // Auto-analyze on save
  if (config.get('enableAutoAnalysis', true)) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(async (document) => {
        if (isSupported(document)) {
          try {
            const analysis = await analysisService!.analyzeFile(document);

            // Update decorations if editor is visible
            const editor = vscode.window.visibleTextEditors.find(
              (e) => e.document === document
            );
            if (editor) {
              if (coverageDecorationProvider) {
                coverageDecorationProvider.updateDecorations(editor, analysis);
              }

              if (inlineTestHint) {
                await inlineTestHint.updateHints(editor);
              }

              if (coverageOverlay) {
                await coverageOverlay.updateOverlay(editor);
              }
            }

            // Update diagnostics
            if (testSuggestionProvider) {
              await testSuggestionProvider.updateDiagnostics(document);
            }

            log(`Auto-analyzed on save: ${document.fileName}`);
          } catch (error) {
            // Silent fail for auto-analysis
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(`Auto-analysis failed: ${errorMessage}`, 'warn');
          }
        }
      })
    );
  }

  // Update decorations when editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor && isSupported(editor.document)) {
        try {
          const analysis = await analysisService!.analyzeFile(editor.document);

          if (coverageDecorationProvider) {
            coverageDecorationProvider.updateDecorations(editor, analysis);
          }

          if (inlineTestHint) {
            await inlineTestHint.updateHints(editor);
          }

          if (coverageOverlay) {
            await coverageOverlay.updateOverlay(editor);
          }
        } catch (error) {
          // Silent fail
        }
      }
    })
  );

  // Configuration change handler
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('aqe')) {
        log('Configuration changed, reloading...');
        // Could reinitialize services here if needed
      }
    })
  );

  log('Event handlers registered');
}

/**
 * Get extension configuration
 */
function getConfiguration(): EdgeAgentServiceConfig {
  const config = vscode.workspace.getConfiguration('aqe');

  return {
    vectorDimension: config.get('vectorDimension', 384),
    hnswM: config.get('hnswM', 32),
    hnswEfConstruction: config.get('hnswEfConstruction', 200),
    debugMode: config.get('debugMode', false),
  };
}

/**
 * Configuration interface for EdgeAgentService
 */
export interface EdgeAgentServiceConfig {
  vectorDimension: number;
  hnswM: number;
  hnswEfConstruction: number;
  debugMode: boolean;
}

/**
 * Check if a document is supported by the extension
 */
function isSupported(document: vscode.TextDocument): boolean {
  const supportedLanguages = [
    'typescript',
    'javascript',
    'typescriptreact',
    'javascriptreact',
  ];
  return supportedLanguages.includes(document.languageId);
}

/**
 * Insert generated test code
 */
async function insertTestCode(
  document: vscode.TextDocument,
  testCode: string
): Promise<void> {
  // Determine test file path
  const sourcePath = document.fileName;
  const testPath = getTestFilePath(sourcePath);

  // Check if test file exists
  try {
    const testUri = vscode.Uri.file(testPath);
    const testDoc = await vscode.workspace.openTextDocument(testUri);

    // Append to existing test file
    const edit = new vscode.WorkspaceEdit();
    const lastLine = testDoc.lineCount - 1;
    const lastChar = testDoc.lineAt(lastLine).text.length;
    edit.insert(testUri, new vscode.Position(lastLine, lastChar), '\n\n' + testCode);
    await vscode.workspace.applyEdit(edit);

    // Open the test file
    await vscode.window.showTextDocument(testDoc);
  } catch {
    // Test file doesn't exist, create it
    const testUri = vscode.Uri.file(testPath);
    const edit = new vscode.WorkspaceEdit();
    edit.createFile(testUri, { ignoreIfExists: true });
    edit.insert(testUri, new vscode.Position(0, 0), getTestFileHeader(sourcePath) + '\n\n' + testCode);
    await vscode.workspace.applyEdit(edit);

    const testDoc = await vscode.workspace.openTextDocument(testUri);
    await vscode.window.showTextDocument(testDoc);
  }
}

/**
 * Get test file path from source file path
 */
function getTestFilePath(sourcePath: string): string {
  // Convert source.ts -> source.test.ts
  const ext = sourcePath.match(/\.(tsx?|jsx?)$/)?.[0] || '.ts';
  const basePath = sourcePath.replace(/\.(tsx?|jsx?)$/, '');
  return `${basePath}.test${ext}`;
}

/**
 * Get test file header
 */
function getTestFileHeader(sourcePath: string): string {
  const fileName = sourcePath.split('/').pop()?.replace(/\.(tsx?|jsx?)$/, '') || 'module';
  return `/**
 * Tests for ${fileName}
 * Generated by Agentic QE Companion
 */

import { describe, it, expect } from 'jest';
`;
}

/**
 * Log message to output channel
 */
function log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '[ERROR]' : level === 'warn' ? '[WARN]' : '[INFO]';
  outputChannel.appendLine(`${timestamp} ${prefix} ${message}`);

  const config = vscode.workspace.getConfiguration('aqe');
  if (config.get('debugMode') && level === 'error') {
    outputChannel.show();
  }
}

/**
 * Get the EdgeAgentService instance (for testing)
 */
export function getEdgeAgentService(): EdgeAgentService | undefined {
  return edgeAgentService;
}

/**
 * Get the AnalysisService instance (for testing)
 */
export function getAnalysisService(): AnalysisService | undefined {
  return analysisService;
}
