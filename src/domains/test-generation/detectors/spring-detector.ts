/**
 * Spring Framework Detection for Java test generation
 *
 * Detects Spring annotations on classes to determine the appropriate
 * test annotation strategy (MockitoExtension, WebMvcTest, DataJpaTest, etc.)
 *
 * @module test-generation/detectors
 */

export interface SpringAnnotation {
  type: 'service' | 'controller' | 'repository' | 'component' | 'configuration';
  testAnnotation: string;
}

/**
 * Detect Spring annotations from a list of class decorators.
 * Returns the appropriate Spring test annotation for the detected type,
 * or undefined if no Spring annotations are found.
 *
 * @param decorators - Array of decorator/annotation strings from the AST
 * @returns SpringAnnotation with test annotation, or undefined
 */
export function detectSpringAnnotations(decorators: string[]): SpringAnnotation | undefined {
  for (const dec of decorators) {
    if (dec.includes('@Service')) {
      return { type: 'service', testAnnotation: '@ExtendWith(MockitoExtension.class)' };
    }
    if (dec.includes('@RestController') || dec.includes('@Controller')) {
      return { type: 'controller', testAnnotation: '@WebMvcTest' };
    }
    if (dec.includes('@Repository')) {
      return { type: 'repository', testAnnotation: '@DataJpaTest' };
    }
    if (dec.includes('@Component')) {
      return { type: 'component', testAnnotation: '@ExtendWith(MockitoExtension.class)' };
    }
    if (dec.includes('@Configuration')) {
      return { type: 'configuration', testAnnotation: '@ExtendWith(MockitoExtension.class)' };
    }
  }
  return undefined;
}
