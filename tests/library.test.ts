import { describe, it, expect } from 'vitest';
import { scopeOf, inScope, boardsIn, addFolder, removeFolder, removeProject, moveBoard, pathOf, homeOf, moveTargets, folderKey, type Library } from '../src/library';

const lib = (): Library => ({
  projects: [{ id: 'p1', name: 'Launch', folders: [{ id: 'f1', name: 'Research' }] }, { id: 'p2', name: 'Ops' }],
  boards: [
    { id: 'a', name: 'Top', projectId: 'p1' },
    { id: 'b', name: 'Filed', projectId: 'p1', folderId: 'f1', fav: true },
    { id: 'c', name: 'Loose' },
    { id: 'd', name: 'Gone', projectId: 'p1', folderId: 'f1', trashed: true },
    { id: 'e', name: 'Orphan', projectId: 'p1', folderId: 'missing' },
  ],
});
const ids = (l: Library, f: string, deep = false) => boardsIn(l, scopeOf(l, f), deep).map(b => b.id);

describe('library scopes', () => {
  it('reads filter values', () => {
    const l = lib();
    expect(scopeOf(l, 'all').kind).toBe('all');
    expect(scopeOf(l, 'trash').kind).toBe('trash');
    expect(scopeOf(l, 'p1').kind).toBe('project');
    expect(scopeOf(l, folderKey('f1')).kind).toBe('folder');
    expect(scopeOf(l, 'f:nope').kind).toBe('all');
    expect(scopeOf(l, 'nope').kind).toBe('all');
  });
  it('lists boards per view', () => {
    const l = lib();
    expect(ids(l, 'all')).toEqual(['a', 'b', 'c', 'e']);
    expect(ids(l, 'fav')).toEqual(['b']);
    expect(ids(l, 'trash')).toEqual(['d']);
    expect(ids(l, 'p1')).toEqual(['a', 'e']);
    expect(ids(l, 'p1', true)).toEqual(['a', 'b', 'e']);
    expect(ids(l, 'f:f1')).toEqual(['b']);
  });
  it('names a board path', () => {
    const l = lib();
    expect(pathOf(l, l.boards[1])).toBe('Launch / Research');
    expect(pathOf(l, l.boards[0])).toBe('Launch');
    expect(pathOf(l, l.boards[4])).toBe('Launch');
    expect(pathOf(l, l.boards[2])).toBe('');
  });
});

describe('library edits', () => {
  it('adds and removes folders', () => {
    const l = lib();
    const f = addFolder(l, 'p2', 'Q4', p => p + '9')!;
    expect(f.id).toBe('f9');
    expect(l.projects[1].folders).toEqual([{ id: 'f9', name: 'Q4' }]);
    removeFolder(l, 'f1');
    expect(l.projects[0].folders).toEqual([]);
    expect(l.boards[1]).toMatchObject({ projectId: 'p1', folderId: '' });
    expect(inScope(l, l.boards[1], scopeOf(l, 'p1'))).toBe(true);
  });
  it('removes a project and frees its boards', () => {
    const l = lib();
    removeProject(l, 'p1');
    expect(l.projects.map(p => p.id)).toEqual(['p2']);
    expect(l.boards[1]).toMatchObject({ projectId: '', folderId: '' });
  });
  it('moves boards and rejects folders from another project', () => {
    const l = lib();
    moveBoard(l, l.boards[2], 'p1', 'f1');
    expect(l.boards[2]).toMatchObject({ projectId: 'p1', folderId: 'f1' });
    moveBoard(l, l.boards[2], 'p2', 'f1');
    expect(l.boards[2]).toMatchObject({ projectId: 'p2', folderId: '' });
    moveBoard(l, l.boards[2], '');
    expect(l.boards[2]).toMatchObject({ projectId: '', folderId: '' });
  });
  it('files new boards where they were made', () => {
    const l = lib();
    expect(homeOf(scopeOf(l, 'f:f1'))).toEqual({ projectId: 'p1', folderId: 'f1' });
    expect(homeOf(scopeOf(l, 'p2'))).toEqual({ projectId: 'p2', folderId: '' });
    expect(homeOf(scopeOf(l, 'fav'))).toEqual({ projectId: '', folderId: '' });
  });
  it('offers every other place as a move target', () => {
    const l = lib();
    expect(moveTargets(l, l.boards[1]).map(t => t.label)).toEqual(['Ops']);
    expect(moveTargets(l, l.boards[0]).map(t => t.label)).toEqual(['Launch / Research', 'Ops']);
    expect(moveTargets(l, l.boards[2]).map(t => t.label)).toEqual(['Launch', 'Launch / Research', 'Ops']);
  });
});

describe('project colors', () => {
  it('is stable per project and honors a chosen color', async () => {
    const { projectColor, PROJECT_COLORS } = await import('../src/library');
    const a = projectColor({ id: 'p1', name: 'A' });
    expect(PROJECT_COLORS).toContain(a);
    expect(projectColor({ id: 'p1', name: 'B' })).toBe(a);
    expect(projectColor({ id: 'p1', name: 'A', color: '#123456' } as never)).toBe('#123456');
  });
});
