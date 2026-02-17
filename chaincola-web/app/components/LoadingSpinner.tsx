'use client';

import React from 'react';

interface LoadingSpinnerProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  fullPage?: boolean;
  message?: string;
}

/**
 * LoadingSpinner Component
 * 
 * A circular progress indicator with a "C" letter in the center.
 * Features:
 * - 75% filled circular progress (3/4 of the circle)
 * - Dark blue "C" letter in the center
 * - Vibrant blue progress ring
 * - Light blue/white unfilled portion
 * - Smooth rotation animation
 * 
 * @example
 * // Basic usage
 * <LoadingSpinner />
 * 
 * // Custom size
 * <LoadingSpinner size={100} />
 * 
 * // Full page loading
 * <LoadingSpinner fullPage message="Loading..." />
 */
export default function LoadingSpinner({ 
  size = 80, 
  strokeWidth = 8,
  className = '',
  fullPage = false,
  message
}: LoadingSpinnerProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // 75% filled (3/4 of the circle) - matching the image
  const progress = 75;
  const offset = circumference - (progress / 100) * circumference;

  const spinner = (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle (light blue/white - unfilled portion) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E0F2FE"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle (vibrant blue - filled portion) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#3B82F6"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            animation: 'rotateProgress 2s linear infinite',
          }}
        />
      </svg>
      {/* Letter C in the center - dark blue */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span 
          className="font-bold"
          style={{ 
            fontSize: `${size * 0.4}px`,
            lineHeight: 1,
            color: '#1E40AF',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          C
        </span>
      </div>
      <style jsx>{`
        @keyframes rotateProgress {
          0% {
            transform: rotate(-90deg);
          }
          100% {
            transform: rotate(270deg);
          }
        }
      `}</style>
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 bg-gray-50 bg-opacity-75 flex flex-col items-center justify-center z-50">
        {spinner}
        {message && (
          <p className="mt-4 text-gray-600 text-sm font-medium">{message}</p>
        )}
      </div>
    );
  }

  return spinner;
}

