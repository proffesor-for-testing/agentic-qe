import React from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Grid3x3,
  Circle,
  Zap,
  Layers,
  Eye,
  EyeOff,
} from 'lucide-react';
import { LayoutAlgorithm } from '../../types';

interface MindMapControlsProps {
  algorithm: LayoutAlgorithm;
  onAlgorithmChange: (algorithm: LayoutAlgorithm) => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  showEdgeLabels: boolean;
  onToggleEdgeLabels: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onExportPNG: () => void;
  onExportJSON: () => void;
}

const LAYOUT_ALGORITHMS: Array<{
  value: LayoutAlgorithm;
  label: string;
  icon: React.ReactNode;
  description: string;
}> = [
  {
    value: 'hierarchical',
    label: 'Hierarchical',
    icon: <Layers className="w-4 h-4" />,
    description: 'Tree-based layout showing clear hierarchy',
  },
  {
    value: 'circular',
    label: 'Circular',
    icon: <Circle className="w-4 h-4" />,
    description: 'Nodes arranged in circular pattern',
  },
  {
    value: 'force',
    label: 'Force-Directed',
    icon: <Zap className="w-4 h-4" />,
    description: 'Physics-based force layout',
  },
  {
    value: 'cose-bilkent',
    label: 'COSE',
    icon: <Grid3x3 className="w-4 h-4" />,
    description: 'Compound spring embedder layout',
  },
];

export const MindMapControls: React.FC<MindMapControlsProps> = ({
  algorithm,
  onAlgorithmChange,
  showLabels,
  onToggleLabels,
  showEdgeLabels,
  onToggleEdgeLabels,
  onZoomIn,
  onZoomOut,
  onFit,
  onExportPNG,
  onExportJSON,
}) => {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 bg-white border-b">
      {/* Layout Algorithm Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Layout:</span>
        <div className="flex gap-1">
          {LAYOUT_ALGORITHMS.map((layout) => (
            <button
              key={layout.value}
              onClick={() => onAlgorithmChange(layout.value)}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors
                ${
                  algorithm === layout.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
              title={layout.description}
            >
              {layout.icon}
              <span className="hidden sm:inline">{layout.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* View Controls */}
      <div className="flex items-center gap-2">
        {/* Toggle Labels */}
        <button
          onClick={onToggleLabels}
          className={`
            p-2 rounded-md transition-colors
            ${showLabels ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
          `}
          title={showLabels ? 'Hide node labels' : 'Show node labels'}
        >
          {showLabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>

        {/* Toggle Edge Labels */}
        <button
          onClick={onToggleEdgeLabels}
          className={`
            p-2 rounded-md transition-colors text-xs
            ${showEdgeLabels ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
          `}
          title={showEdgeLabels ? 'Hide edge labels' : 'Show edge labels'}
        >
          E{showEdgeLabels ? 'on' : 'off'}
        </button>

        <div className="w-px h-6 bg-gray-300" />

        {/* Zoom Controls */}
        <button
          onClick={onZoomIn}
          className="p-2 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={onZoomOut}
          className="p-2 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={onFit}
          className="p-2 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          title="Fit to Screen"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-gray-300" />

        {/* Export Controls */}
        <div className="flex gap-1">
          <button
            onClick={onExportPNG}
            className="px-3 py-1.5 rounded-md bg-primary-500 text-white hover:bg-primary-600 transition-colors text-sm flex items-center gap-1"
            title="Export as PNG"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">PNG</span>
          </button>
          <button
            onClick={onExportJSON}
            className="px-3 py-1.5 rounded-md bg-gray-600 text-white hover:bg-gray-700 transition-colors text-sm flex items-center gap-1"
            title="Export as JSON"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">JSON</span>
          </button>
        </div>
      </div>
    </div>
  );
};
