import type { GraphPosition } from './types';

export function requireFinitePosition(position: GraphPosition, label = 'Position'): GraphPosition {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new Error(`${label} must have finite x and y coordinates.`);
  }

  return { x: position.x, y: position.y };
}
