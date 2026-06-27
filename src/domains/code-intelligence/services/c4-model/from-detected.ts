/**
 * ADR-112 — Detected → C4 spec mapping.
 *
 * Pure, dependency-free functions that convert the code-intelligence DETECTOR
 * output (shared `Detected*` types, produced by ProductFactorsBridgeService's
 * filesystem scan) into the `C4ModelService` Build*Request specs.
 *
 * This is the consolidation seam: the bridge keeps detection; the rich
 * `C4ModelService` does all rendering/analysis/storage. Keeping the mapping pure
 * makes the C1 parity test (every detected element survives into a spec) trivial
 * and keeps zero coupling to the service's async/embedding/memory machinery.
 */

import type {
  C4ProjectInfo,
  DetectedExternalSystem,
  DetectedComponent,
  DetectedRelationship,
  ExternalSystemType,
  C4ComponentType,
  C4RelationshipType as SharedC4RelationshipType,
} from '../../../../shared/c4-model';
import type {
  BuildContextRequest,
  BuildContainerRequest,
  BuildComponentRequest,
  ExternalSystemSpec,
  ComponentSpec,
  ComponentRelationshipSpec,
  SystemType,
  ComponentType,
  C4RelationshipType as DomainC4RelationshipType,
} from './types';

/** The single application container the detector models today (mirrors the
 * legacy bridge, which hardcoded one "Application" container). Real multi-
 * container detection is future work (ADR-112 G-ABORT note). */
export const DEFAULT_CONTAINER_NAME = 'Application';

/** shared ExternalSystemType → domain SystemType (C4ModelService vocabulary). */
const EXTERNAL_SYSTEM_TYPE_MAP: Record<ExternalSystemType, SystemType> = {
  database: 'database',
  cache: 'cache',
  queue: 'message_queue',
  api: 'api',
  storage: 'storage',
  auth: 'authentication',
  monitoring: 'monitoring',
  cloud: 'third_party',
};

/** shared C4ComponentType → domain ComponentType (C4ModelService vocabulary).
 * Types the service lacks (transformer/layer/feature/package/other) fold to the
 * nearest supported concept so no component is dropped. */
const COMPONENT_TYPE_MAP: Record<C4ComponentType, ComponentType> = {
  controller: 'controller',
  service: 'service',
  repository: 'repository',
  facade: 'facade',
  factory: 'factory',
  adapter: 'adapter',
  gateway: 'gateway',
  handler: 'handler',
  validator: 'validator',
  transformer: 'adapter',
  utility: 'utility',
  module: 'module',
  layer: 'module',
  feature: 'module',
  package: 'module',
  other: 'module',
};

export function mapExternalSystemType(type: ExternalSystemType): SystemType {
  return EXTERNAL_SYSTEM_TYPE_MAP[type] ?? 'third_party';
}

export function mapComponentType(type: C4ComponentType): ComponentType {
  return COMPONENT_TYPE_MAP[type] ?? 'module';
}

/** shared C4RelationshipType → domain C4RelationshipType (C4ModelService vocabulary).
 * The two unions diverge (shared `sends`/`reads`/`writes`/`imports`/`stores_data_in`
 * vs domain `sends_to`/`reads_from`/`writes_to`); fold to the nearest domain verb. */
const RELATIONSHIP_TYPE_MAP: Record<SharedC4RelationshipType, DomainC4RelationshipType> = {
  uses: 'uses',
  calls: 'calls',
  imports: 'depends_on',
  depends_on: 'depends_on',
  extends: 'extends',
  implements: 'implements',
  sends: 'sends_to',
  reads: 'reads_from',
  writes: 'writes_to',
  stores_data_in: 'writes_to',
  authenticates_with: 'authenticates_with',
};

export function mapRelationshipType(type: SharedC4RelationshipType): DomainC4RelationshipType {
  return RELATIONSHIP_TYPE_MAP[type] ?? 'uses';
}

/** Detected external systems → C4 ExternalSystemSpec[]. */
export function toExternalSystemSpecs(
  externalSystems: DetectedExternalSystem[],
): ExternalSystemSpec[] {
  return externalSystems.map((es) => ({
    name: es.name,
    type: mapExternalSystemType(es.type),
    technology: es.technology,
    relationshipDescription: es.relationship,
  }));
}

/** Detected components → C4 ComponentSpec[]. */
export function toComponentSpecs(components: DetectedComponent[]): ComponentSpec[] {
  return components.map((c) => ({
    name: c.name,
    type: mapComponentType(c.type),
    technology: c.technology,
    boundary: c.boundary,
    files: c.files,
    responsibilities: c.responsibilities,
  }));
}

/**
 * Detected relationships → C4 ComponentRelationshipSpec[].
 *
 * `DetectedRelationship` references components by `id`; the service re-derives
 * ids by sanitizing the spec's `from`/`to` NAMES. So we translate ids back to
 * names via the component set; relationships whose endpoints aren't in the set
 * are dropped (they can't render) — surfaced by the caller's count delta.
 */
export function toComponentRelationshipSpecs(
  components: DetectedComponent[],
  relationships: DetectedRelationship[],
): ComponentRelationshipSpec[] {
  const nameById = new Map(components.map((c) => [c.id, c.name]));
  const specs: ComponentRelationshipSpec[] = [];
  for (const rel of relationships) {
    const from = nameById.get(rel.sourceId);
    const to = nameById.get(rel.targetId);
    if (from === undefined || to === undefined) continue;
    specs.push({ from, to, type: mapRelationshipType(rel.type) });
  }
  return specs;
}

/** Project + detected external systems → BuildContextRequest. */
export function toContextRequest(
  project: C4ProjectInfo,
  externalSystems: DetectedExternalSystem[],
): BuildContextRequest {
  return {
    systemName: project.name,
    systemDescription: project.description,
    externalSystems: toExternalSystemSpecs(externalSystems),
  };
}

/** Project + detected external systems → BuildContainerRequest (single app container). */
export function toContainerRequest(
  project: C4ProjectInfo,
  externalSystems: DetectedExternalSystem[],
): BuildContainerRequest {
  const externalSpecs = toExternalSystemSpecs(externalSystems);
  return {
    systemName: project.name,
    containers: [
      {
        name: DEFAULT_CONTAINER_NAME,
        type: 'web_application',
        technology: 'TypeScript',
        description: 'Main application',
      },
    ],
    externalSystems: externalSpecs,
    // The legacy bridge drew Rel(app, <external>) for each external system.
    dependencies: externalSpecs.map((es) => ({
      from: DEFAULT_CONTAINER_NAME,
      to: es.name,
      description: es.relationshipDescription,
    })),
  };
}

/** Detected components + relationships → BuildComponentRequest. */
export function toComponentRequest(
  components: DetectedComponent[],
  relationships: DetectedRelationship[],
  containerName: string = DEFAULT_CONTAINER_NAME,
): BuildComponentRequest {
  return {
    containerName,
    components: toComponentSpecs(components),
    relationships: toComponentRelationshipSpecs(components, relationships),
  };
}
