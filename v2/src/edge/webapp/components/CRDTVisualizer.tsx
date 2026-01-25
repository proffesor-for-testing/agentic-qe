/**
 * CRDTVisualizer Component
 *
 * Visualizes CRDT stores and their synchronization state.
 *
 * @module edge/webapp/components/CRDTVisualizer
 */

import React from 'react';
import type { CRDTStoreInfo, CRDTState } from '../types';

// ============================================
// Types
// ============================================

interface CRDTVisualizerProps {
  crdt: CRDTState;
  onInspect?: (storeId: string) => void;
}

interface CRDTStoreCardProps {
  store: CRDTStoreInfo;
  onInspect?: () => void;
}

// ============================================
// CRDT Type Icons
// ============================================

const typeIcons: Record<string, React.ReactNode> = {
  GCounter: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  LWWRegister: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  ORSet: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  PatternCRDT: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
  ),
};

const typeColors: Record<string, string> = {
  GCounter: 'bg-green-100 text-green-700 border-green-200',
  LWWRegister: 'bg-blue-100 text-blue-700 border-blue-200',
  ORSet: 'bg-purple-100 text-purple-700 border-purple-200',
  PatternCRDT: 'bg-orange-100 text-orange-700 border-orange-200',
};

// ============================================
// CRDTStoreCard Component
// ============================================

const CRDTStoreCard: React.FC<CRDTStoreCardProps> = ({ store, onInspect }) => {
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className={`p-4 rounded-lg border ${typeColors[store.type] || 'bg-gray-100 text-gray-700 border-gray-200'} cursor-pointer hover:shadow-md transition-shadow`}
      onClick={onInspect}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          {typeIcons[store.type]}
          <span className="font-medium">{store.id}</span>
        </div>
        <span className="text-xs font-mono bg-white bg-opacity-50 px-2 py-0.5 rounded">
          v{store.version}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm opacity-75">
        <span>{store.type}</span>
        <span>{formatSize(store.size)}</span>
      </div>
    </div>
  );
};

// ============================================
// CRDTStats Component
// ============================================

interface CRDTStatsProps {
  totalOperations: number;
  conflictsResolved: number;
  lastSync: number;
}

const CRDTStats: React.FC<CRDTStatsProps> = ({
  totalOperations,
  conflictsResolved,
  lastSync,
}) => {
  const formatTime = (timestamp: number): string => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
      <div className="text-center">
        <div className="text-2xl font-bold text-gray-900">{totalOperations}</div>
        <div className="text-sm text-gray-500">Operations</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-green-600">{conflictsResolved}</div>
        <div className="text-sm text-gray-500">Conflicts Resolved</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-semibold text-gray-900">{formatTime(lastSync)}</div>
        <div className="text-sm text-gray-500">Last Sync</div>
      </div>
    </div>
  );
};

// ============================================
// CRDTVisualizer Component
// ============================================

export const CRDTVisualizer: React.FC<CRDTVisualizerProps> = ({
  crdt,
  onInspect,
}) => {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <CRDTStats
        totalOperations={crdt.totalOperations}
        conflictsResolved={crdt.conflictsResolved}
        lastSync={crdt.lastSync}
      />

      {/* Store Grid */}
      {crdt.stores.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No CRDT stores</h3>
          <p className="mt-1 text-sm text-gray-500">
            CRDT stores will appear here when created.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {crdt.stores.map((store) => (
            <CRDTStoreCard
              key={store.id}
              store={store}
              onInspect={onInspect ? () => onInspect(store.id) : undefined}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 p-3 bg-gray-50 rounded-lg text-sm">
        <span className="font-medium text-gray-700">Types:</span>
        {Object.entries(typeColors).map(([type, colors]) => (
          <div key={type} className="flex items-center space-x-1">
            <div className={`w-3 h-3 rounded ${colors.split(' ')[0]}`} />
            <span className="text-gray-600">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CRDTVisualizer;
