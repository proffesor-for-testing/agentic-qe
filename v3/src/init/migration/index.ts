/**
 * Migration Module Index
 * Handles v2 to v3 migration
 */

export { V2Detector, createV2Detector, type V2DetectionInfo } from './detector.js';
export { V2DataMigrator, createV2DataMigrator, type MigrationResult } from './data-migrator.js';
export { V2ConfigMigrator, createV2ConfigMigrator } from './config-migrator.js';
