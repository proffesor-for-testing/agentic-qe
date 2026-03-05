import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  detectFramework,
  detectProjectConfig,
  resolveRequest,
  isExcludedFile,
} from '../../src/shared/language-detector.js';

describe('Language Auto-Detection (ADR-078)', () => {
  describe('isExcludedFile', () => {
    it('should exclude C# generated files', () => {
      expect(isExcludedFile('Model.g.cs')).toBe(true);
    });

    it('should exclude protobuf Go files', () => {
      expect(isExcludedFile('user.pb.go')).toBe(true);
    });

    it('should exclude Dart freezed files', () => {
      expect(isExcludedFile('model.freezed.dart')).toBe(true);
    });

    it('should exclude Go generated files', () => {
      expect(isExcludedFile('mock_generated.go')).toBe(true);
    });

    it('should not exclude regular files', () => {
      expect(isExcludedFile('user.ts')).toBe(false);
      expect(isExcludedFile('main.go')).toBe(false);
    });
  });

  describe('detectLanguage', () => {
    it('should detect TypeScript from .ts files', () => {
      expect(detectLanguage(['src/app.ts', 'src/utils.ts'])).toBe('typescript');
    });

    it('should detect Python from .py files', () => {
      expect(detectLanguage(['app.py', 'utils.py'])).toBe('python');
    });

    it('should detect Java from .java files', () => {
      expect(detectLanguage(['UserService.java', 'User.java'])).toBe('java');
    });

    it('should detect Go from .go files', () => {
      expect(detectLanguage(['main.go', 'handler.go'])).toBe('go');
    });

    it('should detect Rust from .rs files', () => {
      expect(detectLanguage(['lib.rs', 'main.rs'])).toBe('rust');
    });

    it('should detect C# from .cs files', () => {
      expect(detectLanguage(['Program.cs', 'User.cs'])).toBe('csharp');
    });

    it('should detect Swift from .swift files', () => {
      expect(detectLanguage(['App.swift'])).toBe('swift');
    });

    it('should detect Kotlin from .kt files', () => {
      expect(detectLanguage(['Main.kt'])).toBe('kotlin');
    });

    it('should detect Dart from .dart files', () => {
      expect(detectLanguage(['main.dart'])).toBe('dart');
    });

    it('should use majority vote for mixed files', () => {
      expect(detectLanguage(['a.ts', 'b.ts', 'c.js'])).toBe('typescript');
    });

    it('should return undefined for empty input', () => {
      expect(detectLanguage([])).toBeUndefined();
    });

    it('should return undefined for unknown extensions', () => {
      expect(detectLanguage(['file.xyz', 'other.abc'])).toBeUndefined();
    });

    it('should exclude generated files', () => {
      expect(detectLanguage(['model.g.cs', 'real.ts'])).toBe('typescript');
    });
  });

  describe('detectFramework', () => {
    it('should return default framework for each language', () => {
      expect(detectFramework('typescript')).toBe('vitest');
      expect(detectFramework('javascript')).toBe('jest');
      expect(detectFramework('python')).toBe('pytest');
      expect(detectFramework('java')).toBe('junit5');
      expect(detectFramework('csharp')).toBe('xunit');
      expect(detectFramework('go')).toBe('go-test');
      expect(detectFramework('rust')).toBe('rust-test');
      expect(detectFramework('swift')).toBe('swift-testing');
      expect(detectFramework('kotlin')).toBe('kotlin-junit');
      expect(detectFramework('dart')).toBe('flutter-test');
    });
  });

  describe('detectProjectConfig', () => {
    it('should detect npm project from package.json', () => {
      const config = detectProjectConfig(process.cwd());
      // This project has a package.json
      expect(config).toBeDefined();
      expect(config!.buildTool).toBe('npm');
    });

    it('should return undefined for non-existent directory', () => {
      const config = detectProjectConfig('/tmp/nonexistent-dir-abc123');
      expect(config).toBeUndefined();
    });
  });

  describe('resolveRequest', () => {
    it('should resolve from explicit language and framework', () => {
      const result = resolveRequest({ language: 'java', framework: 'junit5' });
      expect(result).toEqual({ language: 'java', framework: 'junit5' });
    });

    it('should detect language from source files', () => {
      const result = resolveRequest({ sourceFiles: ['User.java', 'Service.java'] });
      expect(result?.language).toBe('java');
      expect(result?.framework).toBe('junit5');
    });

    it('should use explicit framework over detected', () => {
      const result = resolveRequest({ sourceFiles: ['app.ts'], framework: 'jest' });
      expect(result?.language).toBe('typescript');
      expect(result?.framework).toBe('jest');
    });

    it('should return undefined when no language can be determined', () => {
      expect(resolveRequest({})).toBeUndefined();
    });
  });
});
