import React from 'react';
export function Feather({ name, size, color }: { name: string; size?: number; color?: string }) {
  return <span data-icon={name} style={{ display: 'inline-block', width: size ?? 16, height: size ?? 16, borderRadius: 3, border: `1px solid ${color ?? '#888'}`, boxSizing: 'border-box' }} />;
}
