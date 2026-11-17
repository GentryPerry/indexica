/**
 * The home library: projects, the folders inside them, and which boards each view shows.
 * Pure functions over the saved index so the home screen stays a thin view.
 */

export interface Folder { id: string; name: string }
export interface Project { id: string; name: string; folders?: Folder[] }
export interface BoardMeta { id: string; name: string; projectId?: string; folderId?: string; fav?: boolean; trashed?: boolean }
export interface Library { projects: Project[]; boards: BoardMeta[] }

/** What the home screen is showing. A folder filter is written as 'f:' + folder id. */
export type Scope =
  | { kind: 'all' | 'fav' | 'trash' }
  | { kind: 'project'; project: Project }
  | { kind: 'folder'; project: Project; folder: Folder };

export const folderKey = (id: string) => 'f:' + id;

/** The folder with this id and the project it sits in. */
export function findFolder(lib: Library, id: string): { project: Project; folder: Folder } | null {
  for (const project of lib.projects) {
    const folder = (project.folders || []).find(f => f.id === id);
    if (folder) return { project, folder };
  }
  return null;
}

/** Turns a filter value into a scope. Unknown projects and folders fall back to all boards. */
export function scopeOf(lib: Library, filter: string): Scope {
  if (filter === 'fav' || filter === 'trash') return { kind: filter };
  if (filter.startsWith('f:')) { const hit = findFolder(lib, filter.slice(2)); if (hit) return { kind: 'folder', ...hit }; return { kind: 'all' }; }
  const project = lib.projects.find(p => p.id === filter);
  return project ? { kind: 'project', project } : { kind: 'all' };
}

/** The folder a board is filed in, if that folder still exists in the board's project. */
export function folderOf(lib: Library, b: BoardMeta): Folder | null {
  if (!b.folderId || !b.projectId) return null;
  const p = lib.projects.find(x => x.id === b.projectId);
  return (p && (p.folders || []).find(f => f.id === b.folderId)) || null;
}

/** "Project / Folder", "Project", or '' for a board outside any project. */
export function pathOf(lib: Library, b: BoardMeta): string {
  const p = lib.projects.find(x => x.id === b.projectId);
  if (!p) return '';
  const f = folderOf(lib, b);
  return f ? p.name + ' / ' + f.name : p.name;
}

/**
 * Whether a board belongs in a view. A project view lists the boards not filed in a folder (folders
 * show as tiles), unless `deep` is set, as it is for counts and searches.
 */
export function inScope(lib: Library, b: BoardMeta, scope: Scope, deep = false): boolean {
  if (scope.kind === 'trash') return !!b.trashed;
  if (b.trashed) return false;
  if (scope.kind !== 'project' && scope.kind !== 'folder') return scope.kind === 'all' || !!b.fav;
  if (b.projectId !== scope.project.id) return false;
  if (scope.kind === 'folder') return b.folderId === scope.folder.id;
  return deep || !folderOf(lib, b);
}

export const boardsIn = (lib: Library, scope: Scope, deep = false) => lib.boards.filter(b => inScope(lib, b, scope, deep));

/** Adds a folder to a project and returns it. */
export function addFolder(lib: Library, projectId: string, name: string, uid: (p: string) => string): Folder | null {
  const p = lib.projects.find(x => x.id === projectId);
  if (!p) return null;
  const f = { id: uid('f'), name };
  p.folders = [...(p.folders || []), f];
  return f;
}

/** Deletes a folder. Its boards stay in the project, outside any folder. */
export function removeFolder(lib: Library, folderId: string) {
  const hit = findFolder(lib, folderId);
  if (!hit) return;
  hit.project.folders = (hit.project.folders || []).filter(f => f.id !== folderId);
  for (const b of lib.boards) if (b.folderId === folderId) b.folderId = '';
}

/** Deletes a project and its folders. Its boards move out to All boards. */
export function removeProject(lib: Library, projectId: string) {
  lib.projects = lib.projects.filter(p => p.id !== projectId);
  for (const b of lib.boards) if (b.projectId === projectId) { b.projectId = ''; b.folderId = ''; }
}

/** Files a board under a project and optionally one of its folders. Empty ids move it out. */
export function moveBoard(lib: Library, b: BoardMeta, projectId: string, folderId = '') {
  const p = lib.projects.find(x => x.id === projectId);
  b.projectId = p ? p.id : '';
  b.folderId = p && (p.folders || []).some(f => f.id === folderId) ? folderId : '';
}

/** Where a new board made in this view should be filed. */
export function homeOf(scope: Scope): { projectId: string; folderId: string } {
  if (scope.kind === 'folder') return { projectId: scope.project.id, folderId: scope.folder.id };
  if (scope.kind === 'project') return { projectId: scope.project.id, folderId: '' };
  return { projectId: '', folderId: '' };
}

/** Every place a board can be moved to, labeled for a menu. Its own project's top level is left out: the menu offers that as Move out of folder. */
export function moveTargets(lib: Library, b: BoardMeta): { label: string; projectId: string; folderId: string }[] {
  const here = folderOf(lib, b)?.id || '';
  const out: { label: string; projectId: string; folderId: string }[] = [];
  for (const p of lib.projects) {
    if (p.id !== b.projectId) out.push({ label: p.name, projectId: p.id, folderId: '' });
    for (const f of p.folders || []) if (!(p.id === b.projectId && f.id === here)) out.push({ label: p.name + ' / ' + f.name, projectId: p.id, folderId: f.id });
  }
  return out;
}
