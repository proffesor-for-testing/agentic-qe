import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingFallbackProps {
  message?: string;
  fullHeight?: boolean;
}

export const LoadingFallback: React.FC<LoadingFallbackProps> = ({
  message = 'Loading...',
  fullHeight = true
}) => {
  return (
    <div className={`flex items-center justify-center bg-white ${fullHeight ? 'h-full' : 'min-h-[200px]'}`}>
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        <span className="text-sm text-gray-600">{message}</span>
      </div>
    </div>
  );
};

export const ComponentLoadingFallback: React.FC = () => (
  <LoadingFallback message="Loading component..." />
);

export const ChartLoadingFallback: React.FC = () => (
  <LoadingFallback message="Loading chart..." fullHeight={false} />
);

export const DashboardLoadingFallback: React.FC = () => (
  <LoadingFallback message="Loading dashboard..." />
);
