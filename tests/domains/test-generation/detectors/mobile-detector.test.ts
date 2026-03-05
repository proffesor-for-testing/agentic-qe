/**
 * Tests for M4.5 Mobile Framework Detectors
 */
import { describe, it, expect } from 'vitest';
import {
  detectSwiftUIView,
  detectComposable,
  detectFlutterWidget,
  detectReactNativeComponent,
  detectMobileFramework,
} from '../../../../src/domains/test-generation/detectors/mobile-detector.js';

describe('Mobile Framework Detectors', () => {
  describe('detectSwiftUIView', () => {
    it('should detect SwiftUI view with import and body', () => {
      const content = `
import SwiftUI

struct ContentView: View {
    var body: some View {
        Text("Hello")
    }
}`;
      const result = detectSwiftUIView(content);
      expect(result).toBeDefined();
      expect(result!.framework).toBe('swiftui');
      expect(result!.testStrategy).toBe('ui');
    });

    it('should return undefined for plain Swift class', () => {
      const content = `
import Foundation

class UserService {
    func getUser(id: String) -> User? { return nil }
}`;
      const result = detectSwiftUIView(content);
      expect(result).toBeUndefined();
    });

    it('should detect SwiftUI via View conformance in parsed data', () => {
      const content = `import SwiftUI\nstruct MyView: View {}`;
      const parsed = {
        functions: [],
        classes: [{ name: 'MyView', methods: [], properties: [], isPublic: true, implements: ['View'], extends: undefined, decorators: [], startLine: 1, endLine: 3 }],
        imports: [],
        language: 'swift' as const,
        filePath: 'MyView.swift',
      };
      const result = detectSwiftUIView(content, parsed as any);
      expect(result).toBeDefined();
      expect(result!.framework).toBe('swiftui');
    });
  });

  describe('detectComposable', () => {
    it('should detect @Composable function', () => {
      const content = `
import androidx.compose.runtime.Composable
import androidx.compose.material.Text

@Composable
fun Greeting(name: String) {
    Text(text = "Hello $name")
}`;
      const result = detectComposable(content);
      expect(result).toBeDefined();
      expect(result!.framework).toBe('compose');
      expect(result!.testStrategy).toBe('ui');
    });

    it('should detect Compose with state as widget strategy', () => {
      const content = [
        '@Composable',
        'fun Counter() {',
        '    val count = remember { mutableStateOf(0) }',
        '    Button(onClick = { count.value++ }) { Text("Count") }',
        '}',
      ].join('\n');
      const result = detectComposable(content);
      expect(result).toBeDefined();
      expect(result!.testStrategy).toBe('widget');
    });

    it('should return undefined for plain Kotlin class', () => {
      const content = `
class UserRepository(private val db: Database) {
    suspend fun getUser(id: Long): User? = db.query(id)
}`;
      const result = detectComposable(content);
      expect(result).toBeUndefined();
    });

    it('should include compose test imports', () => {
      const content = `@Composable fun App() {}`;
      const result = detectComposable(content);
      expect(result!.imports).toContain('import androidx.compose.ui.test.junit4.createComposeRule');
    });
  });

  describe('detectFlutterWidget', () => {
    it('should detect StatelessWidget', () => {
      const content = `
import 'package:flutter/material.dart';

class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container();
  }
}`;
      const result = detectFlutterWidget(content);
      expect(result).toBeDefined();
      expect(result!.framework).toBe('flutter-widget');
      expect(result!.testStrategy).toBe('widget');
    });

    it('should detect StatefulWidget', () => {
      const content = `class CounterWidget extends StatefulWidget {}`;
      const result = detectFlutterWidget(content);
      expect(result).toBeDefined();
      expect(result!.framework).toBe('flutter-widget');
    });

    it('should detect State<T> class', () => {
      const content = `class _CounterState extends State<CounterWidget> {}`;
      const result = detectFlutterWidget(content);
      expect(result).toBeDefined();
    });

    it('should return undefined for plain Dart service', () => {
      const content = `
class AuthService {
  Future<User> login(String email, String password) async {
    return User(email: email);
  }
}`;
      const result = detectFlutterWidget(content);
      expect(result).toBeUndefined();
    });
  });

  describe('detectReactNativeComponent', () => {
    it('should detect RN component with View import', () => {
      const content = `
import React from 'react';
import { View, Text } from 'react-native';

export const MyScreen = () => (
  <View><Text>Hello</Text></View>
);`;
      const result = detectReactNativeComponent(content);
      expect(result).toBeDefined();
      expect(result!.framework).toBe('react-native-component');
    });

    it('should detect hook-based component as widget strategy', () => {
      const content = `
import { View } from 'react-native';
const Counter = () => {
  const [count, setCount] = useState(0);
  return <View />;
};`;
      const result = detectReactNativeComponent(content);
      expect(result).toBeDefined();
      expect(result!.testStrategy).toBe('widget');
    });

    it('should return undefined for non-RN React code', () => {
      const content = `
import React from 'react';
const App = () => <div>Hello</div>;`;
      const result = detectReactNativeComponent(content);
      expect(result).toBeUndefined();
    });
  });

  describe('detectMobileFramework', () => {
    it('should route swift to SwiftUI detector', () => {
      const content = `import SwiftUI\nstruct V: View { var body: some View { Text("") } }`;
      const result = detectMobileFramework(content, 'swift');
      expect(result).toBeDefined();
      expect(result!.framework).toBe('swiftui');
    });

    it('should route kotlin to Compose detector', () => {
      const content = `@Composable fun App() {}`;
      const result = detectMobileFramework(content, 'kotlin');
      expect(result).toBeDefined();
      expect(result!.framework).toBe('compose');
    });

    it('should route dart to Flutter detector', () => {
      const content = `class W extends StatelessWidget { Widget build(BuildContext c) => Container(); }`;
      const result = detectMobileFramework(content, 'dart');
      expect(result).toBeDefined();
      expect(result!.framework).toBe('flutter-widget');
    });

    it('should return undefined for unsupported language', () => {
      const result = detectMobileFramework('some code', 'java');
      expect(result).toBeUndefined();
    });

    it('should return undefined when no UI pattern detected', () => {
      const result = detectMobileFramework('class Repo { fun get() {} }', 'kotlin');
      expect(result).toBeUndefined();
    });
  });
});
