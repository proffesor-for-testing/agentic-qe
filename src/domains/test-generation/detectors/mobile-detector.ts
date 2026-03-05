/**
 * Mobile Framework Detection for test generation routing (M4.5)
 *
 * Detects SwiftUI, Jetpack Compose, and Flutter Widget patterns
 * to route between unit tests vs widget/UI tests.
 *
 * @module test-generation/detectors
 */

import type { ParsedFile } from '../../../shared/parsers/interfaces.js';

export type MobileUIFramework = 'swiftui' | 'compose' | 'flutter-widget' | 'react-native-component';

export interface MobileDetectionResult {
  framework: MobileUIFramework;
  testStrategy: 'unit' | 'widget' | 'ui';
  imports: string[];
}

/**
 * Detect SwiftUI view patterns in Swift source code.
 * Looks for `import SwiftUI` and `var body: some View`.
 */
export function detectSwiftUIView(content: string, parsed?: ParsedFile): MobileDetectionResult | undefined {
  const hasImport = /import\s+SwiftUI/.test(content);
  const hasBody = /var\s+body\s*:\s*some\s+View/.test(content);
  const hasViewProtocol = parsed?.classes.some(c =>
    c.implements?.includes('View') || c.extends === 'View'
  ) ?? /:\s*View\b/.test(content);

  if (hasImport && (hasBody || hasViewProtocol)) {
    return {
      framework: 'swiftui',
      testStrategy: 'ui',
      imports: ['import Testing', '@testable import MyApp'],
    };
  }

  // Plain Swift class/struct — unit test
  if (parsed?.classes.length || parsed?.functions.length) {
    return undefined; // No SwiftUI detected, fall through to unit test
  }
  return undefined;
}

/**
 * Detect Jetpack Compose composable patterns in Kotlin source code.
 * Looks for `@Composable` annotation.
 */
export function detectComposable(content: string, parsed?: ParsedFile): MobileDetectionResult | undefined {
  const hasComposable = /@Composable/.test(content);
  const hasComposeImport = /import\s+androidx\.compose/.test(content);

  if (hasComposable || hasComposeImport) {
    const hasState = /remember\s*\{|mutableStateOf|collectAsState/.test(content);
    return {
      framework: 'compose',
      testStrategy: hasState ? 'widget' : 'ui',
      imports: [
        'import androidx.compose.ui.test.junit4.createComposeRule',
        'import androidx.compose.ui.test.onNodeWithText',
        'import androidx.compose.ui.test.performClick',
      ],
    };
  }
  return undefined;
}

/**
 * Detect Flutter Widget patterns in Dart source code.
 * Looks for `extends StatelessWidget` / `extends StatefulWidget` / `extends State<T>`.
 */
export function detectFlutterWidget(content: string, parsed?: ParsedFile): MobileDetectionResult | undefined {
  const extendsWidget = /extends\s+(Stateless|Stateful)Widget/.test(content);
  const extendsState = /extends\s+State</.test(content);
  const hasBuildMethod = /Widget\s+build\s*\(BuildContext/.test(content);

  if (extendsWidget || extendsState || hasBuildMethod) {
    return {
      framework: 'flutter-widget',
      testStrategy: 'widget',
      imports: [
        "import 'package:flutter_test/flutter_test.dart';",
        "import 'package:flutter/material.dart';",
      ],
    };
  }
  return undefined;
}

/**
 * Detect React Native component patterns in TSX/JSX source code.
 * Looks for react-native imports and JSX component exports.
 */
export function detectReactNativeComponent(content: string, parsed?: ParsedFile): MobileDetectionResult | undefined {
  const hasRNImport = /from\s+['"]react-native['"]/.test(content);
  const hasRNComponent = /(View|Text|ScrollView|FlatList|TouchableOpacity|Pressable)\b/.test(content);
  const hasJSX = /<[A-Z][a-zA-Z]*[\s/>]/.test(content);

  if (hasRNImport && (hasRNComponent || hasJSX)) {
    // Check if it uses hooks (functional component) vs class component
    const isHookBased = /use(State|Effect|Context|Memo|Callback|Ref)\b/.test(content);
    return {
      framework: 'react-native-component',
      testStrategy: isHookBased ? 'widget' : 'ui',
      imports: [
        "import { render, fireEvent, screen } from '@testing-library/react-native';",
      ],
    };
  }
  return undefined;
}

/**
 * Detect any mobile UI framework from source content.
 * Returns the first match, or undefined for plain unit-testable code.
 */
export function detectMobileFramework(
  content: string,
  language: string,
  parsed?: ParsedFile,
): MobileDetectionResult | undefined {
  switch (language) {
    case 'swift':
      return detectSwiftUIView(content, parsed);
    case 'kotlin':
      return detectComposable(content, parsed);
    case 'dart':
      return detectFlutterWidget(content, parsed);
    case 'typescript':
    case 'javascript':
      return detectReactNativeComponent(content, parsed);
    default:
      return undefined;
  }
}
