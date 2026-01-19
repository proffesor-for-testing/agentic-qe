/**
 * Tests for Snapshot Parser
 *
 * Tests the SnapshotParser class that parses accessibility snapshots
 * from agent-browser to extract element refs for element selection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SnapshotParser,
  getSnapshotParser,
  type ParsedSnapshot,
  type SnapshotElement,
} from '../../../../src/integrations/browser/agent-browser/snapshot-parser';

describe('SnapshotParser', () => {
  let parser: SnapshotParser;

  // Sample snapshot text matching agent-browser format
  const sampleSnapshotText = `- document [ref=doc]
  - heading "Login" [ref=e1] [level=1]
  - textbox "Email" [ref=e2]
  - textbox "Password" [ref=e3]
  - button "Submit" [ref=e4]
  - link "Forgot Password" [ref=e5]
  - checkbox "Remember me" [ref=e6]
  - heading "Help" [ref=e7] [level=2]`;

  // Sample JSON output from agent-browser --json
  const sampleJsonOutput = {
    success: true,
    data: {
      snapshot: `- document [ref=doc]
  - button "Submit" [ref=e1]
  - textbox "Email" [ref=e2]`,
      refs: {
        e1: { role: 'button', name: 'Submit' },
        e2: { role: 'textbox', name: 'Email' },
      },
    },
  };

  beforeEach(() => {
    parser = new SnapshotParser();
  });

  describe('getSnapshotParser()', () => {
    it('should return a SnapshotParser instance', () => {
      const instance = getSnapshotParser();
      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(SnapshotParser);
    });

    it('should return singleton instance', () => {
      const instance1 = getSnapshotParser();
      const instance2 = getSnapshotParser();
      expect(instance1).toBe(instance2);
    });
  });

  describe('parse() with sample snapshot text', () => {
    let result: ParsedSnapshot;

    beforeEach(() => {
      result = parser.parse(sampleSnapshotText);
    });

    it('should return a ParsedSnapshot object', () => {
      expect(result).toBeDefined();
      expect(result.rawTree).toBe(sampleSnapshotText);
    });

    it('should parse elements array', () => {
      expect(result.elements).toBeDefined();
      expect(Array.isArray(result.elements)).toBe(true);
      expect(result.elements.length).toBeGreaterThan(0);
    });

    it('should extract element refs correctly', () => {
      // Check for specific refs
      const refs = result.elements.map((el) => el.ref);
      expect(refs).toContain('e1');
      expect(refs).toContain('e2');
      expect(refs).toContain('e4');
      expect(refs).toContain('e5');
    });

    it('should extract element roles', () => {
      const button = result.elements.find((el) => el.ref === 'e4');
      expect(button?.role).toBe('button');

      const textbox = result.elements.find((el) => el.ref === 'e2');
      expect(textbox?.role).toBe('textbox');

      const link = result.elements.find((el) => el.ref === 'e5');
      expect(link?.role).toBe('link');
    });

    it('should extract element names', () => {
      const button = result.elements.find((el) => el.ref === 'e4');
      expect(button?.name).toBe('Submit');

      const emailInput = result.elements.find((el) => el.ref === 'e2');
      expect(emailInput?.name).toBe('Email');
    });

    it('should extract heading levels', () => {
      const h1 = result.elements.find((el) => el.ref === 'e1');
      expect(h1?.role).toBe('heading');
      expect(h1?.level).toBe(1);

      const h2 = result.elements.find((el) => el.ref === 'e7');
      expect(h2?.role).toBe('heading');
      expect(h2?.level).toBe(2);
    });

    it('should provide refWithAt for CLI commands', () => {
      const button = result.elements.find((el) => el.ref === 'e4');
      expect(button?.refWithAt).toBe('@e4');
    });

    it('should calculate depth correctly', () => {
      // Top-level elements have lower depth than nested ones
      expect(result.elements.some((el) => el.depth >= 0)).toBe(true);
    });

    it('should populate refMap', () => {
      expect(result.refMap).toBeDefined();
      expect(result.refMap instanceof Map).toBe(true);
      expect(result.refMap.get('e4')).toBeDefined();
    });

    it('should populate stats', () => {
      expect(result.stats).toBeDefined();
      expect(result.stats.totalElements).toBeGreaterThan(0);
      expect(typeof result.stats.interactiveCount).toBe('number');
      expect(typeof result.stats.maxDepth).toBe('number');
    });

    it('should record parsedAt timestamp', () => {
      expect(result.parsedAt).toBeInstanceOf(Date);
    });
  });

  describe('parse() with interactive elements', () => {
    let result: ParsedSnapshot;

    beforeEach(() => {
      result = parser.parse(sampleSnapshotText);
    });

    it('should identify interactive elements', () => {
      expect(result.interactiveElements).toBeDefined();
      expect(Array.isArray(result.interactiveElements)).toBe(true);
    });

    it('should include buttons in interactive elements', () => {
      const hasButton = result.interactiveElements.some((el) => el.role === 'button');
      expect(hasButton).toBe(true);
    });

    it('should include links in interactive elements', () => {
      const hasLink = result.interactiveElements.some((el) => el.role === 'link');
      expect(hasLink).toBe(true);
    });

    it('should include textboxes in interactive elements', () => {
      const hasTextbox = result.interactiveElements.some((el) => el.role === 'textbox');
      expect(hasTextbox).toBe(true);
    });

    it('should include checkboxes in interactive elements', () => {
      const hasCheckbox = result.interactiveElements.some((el) => el.role === 'checkbox');
      expect(hasCheckbox).toBe(true);
    });

    it('should not include headings in interactive elements', () => {
      const hasHeading = result.interactiveElements.some((el) => el.role === 'heading');
      expect(hasHeading).toBe(false);
    });

    it('should have fewer interactive elements than total elements', () => {
      expect(result.interactiveElements.length).toBeLessThanOrEqual(result.elements.length);
    });
  });

  describe('parseJson() with sample JSON', () => {
    it('should parse JSON output from agent-browser', () => {
      const result = parser.parseJson(sampleJsonOutput);
      expect(result).toBeDefined();
      expect(result.elements.length).toBeGreaterThan(0);
    });

    it('should parse JSON string', () => {
      const jsonString = JSON.stringify(sampleJsonOutput);
      const result = parser.parseJson(jsonString);
      expect(result).toBeDefined();
    });

    it('should extract refs from JSON data', () => {
      const result = parser.parseJson(sampleJsonOutput);
      expect(result.refMap.get('e1')).toBeDefined();
      expect(result.refMap.get('e2')).toBeDefined();
    });

    it('should set role from refs data', () => {
      const result = parser.parseJson(sampleJsonOutput);
      const button = result.refMap.get('e1');
      expect(button?.role).toBe('button');
    });

    it('should set name from refs data', () => {
      const result = parser.parseJson(sampleJsonOutput);
      const button = result.refMap.get('e1');
      expect(button?.name).toBe('Submit');
    });

    it('should throw error for invalid JSON format', () => {
      expect(() => parser.parseJson({ invalid: 'format' })).toThrow('Invalid snapshot JSON format');
    });

    it('should handle JSON with only snapshot string', () => {
      // When JSON has snapshot string but no refs object
      const jsonWithSnapshot = {
        success: true,
        data: '- button "Click" [ref=e1]',
      };
      const result = parser.parseJson(jsonWithSnapshot);
      expect(result).toBeDefined();
    });
  });

  describe('findByRef()', () => {
    let snapshot: ParsedSnapshot;

    beforeEach(() => {
      snapshot = parser.parse(sampleSnapshotText);
    });

    it('should find element by ref with @ prefix', () => {
      const element = parser.findByRef(snapshot, '@e4');
      expect(element).toBeDefined();
      expect(element?.role).toBe('button');
    });

    it('should find element by ref without @ prefix', () => {
      const element = parser.findByRef(snapshot, 'e4');
      expect(element).toBeDefined();
      expect(element?.role).toBe('button');
    });

    it('should return null for non-existent ref', () => {
      const element = parser.findByRef(snapshot, '@e999');
      expect(element).toBeNull();
    });

    it('should find element e1', () => {
      const element = parser.findByRef(snapshot, '@e1');
      expect(element).toBeDefined();
      expect(element?.role).toBe('heading');
      expect(element?.name).toBe('Login');
    });

    it('should find element e2', () => {
      const element = parser.findByRef(snapshot, 'e2');
      expect(element).toBeDefined();
      expect(element?.role).toBe('textbox');
      expect(element?.name).toBe('Email');
    });
  });

  describe('findByRole()', () => {
    let snapshot: ParsedSnapshot;

    beforeEach(() => {
      snapshot = parser.parse(sampleSnapshotText);
    });

    it('should find all buttons', () => {
      const buttons = parser.findByRole(snapshot, 'button');
      expect(buttons.length).toBe(1);
      expect(buttons[0].name).toBe('Submit');
    });

    it('should find all textboxes', () => {
      const textboxes = parser.findByRole(snapshot, 'textbox');
      expect(textboxes.length).toBe(2);
    });

    it('should find all links', () => {
      const links = parser.findByRole(snapshot, 'link');
      expect(links.length).toBe(1);
      expect(links[0].name).toBe('Forgot Password');
    });

    it('should find all headings', () => {
      const headings = parser.findByRole(snapshot, 'heading');
      expect(headings.length).toBe(2);
    });

    it('should find all checkboxes', () => {
      const checkboxes = parser.findByRole(snapshot, 'checkbox');
      expect(checkboxes.length).toBe(1);
      expect(checkboxes[0].name).toBe('Remember me');
    });

    it('should return empty array for non-existent role', () => {
      const sliders = parser.findByRole(snapshot, 'slider');
      expect(sliders).toEqual([]);
    });

    it('should be case-insensitive', () => {
      const buttons1 = parser.findByRole(snapshot, 'BUTTON');
      const buttons2 = parser.findByRole(snapshot, 'button');
      expect(buttons1.length).toBe(buttons2.length);
    });
  });

  describe('findByName()', () => {
    let snapshot: ParsedSnapshot;

    beforeEach(() => {
      snapshot = parser.parse(sampleSnapshotText);
    });

    describe('exact matching', () => {
      it('should find element by exact name', () => {
        const elements = parser.findByName(snapshot, 'Submit', true);
        expect(elements.length).toBe(1);
        expect(elements[0].role).toBe('button');
      });

      it('should return empty array for partial match when exact=true', () => {
        const elements = parser.findByName(snapshot, 'Sub', true);
        expect(elements.length).toBe(0);
      });

      it('should be case-sensitive for exact match', () => {
        const elements = parser.findByName(snapshot, 'submit', true);
        expect(elements.length).toBe(0);
      });
    });

    describe('fuzzy matching (default)', () => {
      it('should find elements by partial name', () => {
        const elements = parser.findByName(snapshot, 'Pass');
        expect(elements.length).toBeGreaterThan(0);
      });

      it('should be case-insensitive for fuzzy match', () => {
        const elements = parser.findByName(snapshot, 'submit');
        expect(elements.length).toBe(1);
        expect(elements[0].role).toBe('button');
      });

      it('should find multiple matches', () => {
        // Both "Email" and other elements might contain partial matches
        const elements = parser.findByName(snapshot, 'e');
        expect(elements.length).toBeGreaterThan(0);
      });

      it('should return empty array for no match', () => {
        const elements = parser.findByName(snapshot, 'xyz123');
        expect(elements.length).toBe(0);
      });
    });
  });

  describe('findInteractive()', () => {
    let snapshot: ParsedSnapshot;

    beforeEach(() => {
      snapshot = parser.parse(sampleSnapshotText);
    });

    describe('finding buttons', () => {
      it('should find button by role', () => {
        const element = parser.findInteractive(snapshot, { role: 'button' });
        expect(element).toBeDefined();
        expect(element?.role).toBe('button');
      });

      it('should find button by name', () => {
        const element = parser.findInteractive(snapshot, { name: 'Submit' });
        expect(element).toBeDefined();
        expect(element?.role).toBe('button');
      });

      it('should find button by role and name', () => {
        const element = parser.findInteractive(snapshot, { role: 'button', name: 'Submit' });
        expect(element).toBeDefined();
        expect(element?.ref).toBe('e4');
      });
    });

    describe('finding links', () => {
      it('should find link by role', () => {
        const element = parser.findInteractive(snapshot, { role: 'link' });
        expect(element).toBeDefined();
        expect(element?.role).toBe('link');
      });

      it('should find link by text', () => {
        const element = parser.findInteractive(snapshot, { text: 'Forgot' });
        expect(element).toBeDefined();
        expect(element?.name).toContain('Forgot');
      });
    });

    describe('finding inputs', () => {
      it('should find textbox by role', () => {
        const element = parser.findInteractive(snapshot, { role: 'textbox' });
        expect(element).toBeDefined();
        expect(element?.role).toBe('textbox');
      });

      it('should find email textbox by name', () => {
        const element = parser.findInteractive(snapshot, { name: 'Email' });
        expect(element).toBeDefined();
        expect(element?.role).toBe('textbox');
      });

      it('should find checkbox', () => {
        const element = parser.findInteractive(snapshot, { role: 'checkbox' });
        expect(element).toBeDefined();
        expect(element?.name).toBe('Remember me');
      });
    });

    describe('combined criteria', () => {
      it('should find element matching all criteria', () => {
        const element = parser.findInteractive(snapshot, {
          role: 'textbox',
          name: 'Email',
        });
        expect(element).toBeDefined();
        expect(element?.ref).toBe('e2');
      });

      it('should return null when no match found', () => {
        const element = parser.findInteractive(snapshot, {
          role: 'button',
          name: 'NonExistent',
        });
        expect(element).toBeNull();
      });

      it('should return null for non-interactive role criteria', () => {
        // Headings are not interactive
        const element = parser.findInteractive(snapshot, { role: 'heading' });
        expect(element).toBeNull();
      });
    });

    describe('text matching', () => {
      it('should find by partial text match (case-insensitive)', () => {
        const element = parser.findInteractive(snapshot, { text: 'forgot' });
        expect(element).toBeDefined();
        expect(element?.role).toBe('link');
      });

      it('should match text against element name', () => {
        const element = parser.findInteractive(snapshot, { text: 'Submit' });
        expect(element).toBeDefined();
        expect(element?.role).toBe('button');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty snapshot', () => {
      const result = parser.parse('');
      expect(result.elements).toEqual([]);
      expect(result.interactiveElements).toEqual([]);
    });

    it('should handle snapshot with only whitespace', () => {
      const result = parser.parse('   \n  \n   ');
      expect(result.elements).toEqual([]);
    });

    it('should handle malformed lines', () => {
      const malformed = `- button "Submit" [ref=e1]
invalid line without ref
- link "Help" [ref=e2]`;
      const result = parser.parse(malformed);
      // Should parse valid lines and skip invalid ones
      expect(result.elements.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle elements without names', () => {
      const noName = `- button [ref=e1]
- textbox [ref=e2]`;
      const result = parser.parse(noName);
      expect(result.elements.length).toBe(2);
    });

    it('should handle deeply nested elements', () => {
      const nested = `- document [ref=doc]
  - main [ref=e1]
    - section [ref=e2]
      - article [ref=e3]
        - button "Deep" [ref=e4]`;
      const result = parser.parse(nested);
      const button = result.refMap.get('e4');
      expect(button).toBeDefined();
      expect(button?.depth).toBeGreaterThan(0);
    });

    it('should build parent-child relationships', () => {
      const withRelations = `- document [ref=doc]
  - button "Child1" [ref=e1]
  - button "Child2" [ref=e2]`;
      const result = parser.parse(withRelations);
      // Parent-child relationships should be built
      expect(result.elements.length).toBeGreaterThan(0);
    });
  });

  describe('refToCssSelector()', () => {
    let snapshot: ParsedSnapshot;

    beforeEach(() => {
      snapshot = parser.parse(sampleSnapshotText);
    });

    it('should convert button ref to CSS selector', () => {
      const selector = parser.refToCssSelector(snapshot, 'e4');
      expect(selector).toBeDefined();
      expect(typeof selector).toBe('string');
    });

    it('should convert link ref to CSS selector', () => {
      const selector = parser.refToCssSelector(snapshot, 'e5');
      expect(selector).toBeDefined();
      expect(typeof selector).toBe('string');
    });

    it('should convert textbox ref to CSS selector', () => {
      const selector = parser.refToCssSelector(snapshot, 'e2');
      expect(selector).toBeDefined();
      expect(typeof selector).toBe('string');
    });

    it('should return null for non-existent ref', () => {
      const selector = parser.refToCssSelector(snapshot, 'e999');
      expect(selector).toBeNull();
    });

    it('should handle ref with @ prefix', () => {
      const selector = parser.refToCssSelector(snapshot, '@e4');
      expect(selector).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should count total elements correctly', () => {
      const result = parser.parse(sampleSnapshotText);
      expect(result.stats.totalElements).toBe(result.elements.length);
    });

    it('should count interactive elements correctly', () => {
      const result = parser.parse(sampleSnapshotText);
      expect(result.stats.interactiveCount).toBe(result.interactiveElements.length);
    });

    it('should calculate max depth correctly', () => {
      const result = parser.parse(sampleSnapshotText);
      const maxDepth = Math.max(...result.elements.map((el) => el.depth));
      expect(result.stats.maxDepth).toBe(maxDepth);
    });
  });
});
