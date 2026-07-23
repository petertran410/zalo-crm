/**
 * Workspace — Barrel Export
 * ──────────────────────────
 * Entry point cho tất cả workspace-related imports.
 * Re-export registry + store + types.
 */

// Registry (pure data — no circular dependency)
export { workspaceRegistry } from './registry';

// Store
export { useWorkspaceStore } from './resolver';

// Types
export type { WorkspaceId, WorkspaceConfig, MenuItemConfig } from './types';
