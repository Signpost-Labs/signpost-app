/**
 * @jest-environment node
 */
import {
  ProjectRecordStore,
  encodeProjectCursor,
  decodeProjectCursor,
} from '@/lib/projectRecordStore';
import { GET } from '@/app/api/community/projects/route';
import { NextRequest } from 'next/server';

describe('ProjectRecordStore - Keyset Pagination (Issue #68)', () => {
  beforeEach(() => {
    delete process.env.PROJECT_RECORDS_DB_PATH;
    ProjectRecordStore.resetInstance();
  });

  afterEach(() => {
    ProjectRecordStore.resetInstance();
  });

  describe('encodeProjectCursor and decodeProjectCursor', () => {
    it('round-trips createdAt and id accurately', () => {
      const createdAt = 1712345678000;
      const id = 'proj-uuid-1234';
      const encoded = encodeProjectCursor(createdAt, id);
      expect(typeof encoded).toBe('string');

      const decoded = decodeProjectCursor(encoded);
      expect(decoded).toEqual({ createdAt, id });
    });

    it('returns null on malformed cursors', () => {
      expect(decodeProjectCursor('')).toBeNull();
      expect(decodeProjectCursor('not-a-cursor')).toBeNull();
      expect(decodeProjectCursor('invalid:string:format')).toBeNull();
      expect(decodeProjectCursor('abc:def')).toBeNull();
      expect(decodeProjectCursor('-50:abc')).toBeNull();
      expect(decodeProjectCursor(null as unknown as string)).toBeNull();
    });
  });

  describe('list() cursor pagination', () => {
    it('returns empty projects and nextCursor null on empty database', () => {
      const store = ProjectRecordStore.getInstance();
      const result = store.list();
      expect(result.projects).toEqual([]);
      expect(result.nextCursor).toBeNull();
      expect(result.length).toBe(0);
    });

    it('paginates across pages and returns null on the final page', () => {
      const store = ProjectRecordStore.getInstance();

      // Seed 5 projects with ascending creation times
      const projects = [];
      const baseTime = 1710000000000;
      for (let i = 1; i <= 5; i++) {
        const p = store.create({
          title: `Community Initiative ${i}`,
          organization: `Org ${i}`,
          location: `City ${i}`,
          category: 'infrastructure',
          summary: `Summary of initiative ${i}`,
          commitment: `Commitment for ${i}`,
          ownerWallet: `GAAA${i}`,
          milestones: [{ title: `Milestone 1`, detail: `Detail 1` }],
        });
        (
          store as unknown as {
            db: {
              prepare: (sql: string) => {
                run: (t: number, id: string) => void;
              };
            };
          }
        ).db
          .prepare(
            'UPDATE accountability_projects SET created_at = ? WHERE id = ?',
          )
          .run(baseTime + i * 1000, p.id);
        projects.push(p);
      }

      // Page 1: limit 2
      const page1 = store.list({ limit: 2 });
      expect(page1.projects).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();
      expect(page1.projects[0].title).toBe('Community Initiative 5');
      expect(page1.projects[1].title).toBe('Community Initiative 4');

      // Page 2: limit 2 using nextCursor
      const page2 = store.list({ limit: 2, cursor: page1.nextCursor });
      expect(page2.projects).toHaveLength(2);
      expect(page2.nextCursor).not.toBeNull();
      expect(page2.projects[0].title).toBe('Community Initiative 3');
      expect(page2.projects[1].title).toBe('Community Initiative 2');

      // Page 3 (final page): limit 2 using page 2 cursor
      const page3 = store.list({ limit: 2, cursor: page2.nextCursor });
      expect(page3.projects).toHaveLength(1);
      expect(page3.nextCursor).toBeNull();
      expect(page3.projects[0].title).toBe('Community Initiative 1');

      // Verify all 5 projects are reachable in order without duplicates
      const allFetchedIds = [
        ...page1.projects.map((p) => p.id),
        ...page2.projects.map((p) => p.id),
        ...page3.projects.map((p) => p.id),
      ];
      expect(new Set(allFetchedIds).size).toBe(5);
    });

    it('guarantees stable ordering when two or more projects share the exact same created_at', () => {
      const store = ProjectRecordStore.getInstance();

      // Create 3 projects
      const p1 = store.create({
        title: 'Alpha Project',
        organization: 'Org A',
        location: 'Location A',
        category: 'health',
        summary: 'Summary A',
        commitment: 'Commitment A',
        ownerWallet: 'GA1',
        milestones: [{ title: 'M1', detail: 'D1' }],
      });

      const p2 = store.create({
        title: 'Beta Project',
        organization: 'Org B',
        location: 'Location B',
        category: 'health',
        summary: 'Summary B',
        commitment: 'Commitment B',
        ownerWallet: 'GA2',
        milestones: [{ title: 'M1', detail: 'D1' }],
      });

      const p3 = store.create({
        title: 'Gamma Project',
        organization: 'Org C',
        location: 'Location C',
        category: 'health',
        summary: 'Summary C',
        commitment: 'Commitment C',
        ownerWallet: 'GA3',
        milestones: [{ title: 'M1', detail: 'D1' }],
      });

      // Force identical created_at timestamp in SQLite for tie-break testing
      const fixedTimestamp = 1715000000000;
      (
        store as unknown as {
          db: { prepare: (sql: string) => { run: (t: number) => void } };
        }
      ).db
        .prepare('UPDATE accountability_projects SET created_at = ?')
        .run(fixedTimestamp);

      // Page through 1 at a time
      const page1 = store.list({ limit: 1 });
      expect(page1.projects).toHaveLength(1);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = store.list({ limit: 1, cursor: page1.nextCursor });
      expect(page2.projects).toHaveLength(1);
      expect(page2.nextCursor).not.toBeNull();

      const page3 = store.list({ limit: 1, cursor: page2.nextCursor });
      expect(page3.projects).toHaveLength(1);
      expect(page3.nextCursor).toBeNull();

      // All 3 unique projects returned without duplication
      const collected = [
        page1.projects[0].id,
        page2.projects[0].id,
        page3.projects[0].id,
      ];
      expect(new Set(collected).size).toBe(3);
      expect(collected).toContain(p1.id);
      expect(collected).toContain(p2.id);
      expect(collected).toContain(p3.id);
    });

    it('supports positional arguments store.list(limit, cursor)', () => {
      const store = ProjectRecordStore.getInstance();
      for (let i = 1; i <= 3; i++) {
        store.create({
          title: `Project ${i}`,
          organization: `Org ${i}`,
          location: `Loc ${i}`,
          category: 'education',
          summary: `Summary ${i}`,
          commitment: `Commitment ${i}`,
          ownerWallet: `GW${i}`,
          milestones: [{ title: 'M1', detail: 'D1' }],
        });
      }

      const p1 = store.list(2);
      expect(p1.projects).toHaveLength(2);
      expect(p1.nextCursor).not.toBeNull();

      const p2 = store.list(2, p1.nextCursor);
      expect(p2.projects).toHaveLength(1);
      expect(p2.nextCursor).toBeNull();
    });

    it('acts as an array for backward compatibility with array callers', () => {
      const store = ProjectRecordStore.getInstance();
      store.create({
        title: 'Project 1',
        organization: 'Org 1',
        location: 'Loc 1',
        category: 'education',
        summary: 'Summary 1',
        commitment: 'Commitment 1',
        ownerWallet: 'GW1',
        milestones: [{ title: 'M1', detail: 'D1' }],
      });

      const res = store.list();
      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBe(1);
      expect(res[0].title).toBe('Project 1');
      expect(res.slice(0, 1)).toHaveLength(1);
      expect(res.nextCursor).toBeNull();
    });
  });

  describe('GET /api/community/projects', () => {
    it('returns 200 with default 100-row limit shape and headers', async () => {
      const store = ProjectRecordStore.getInstance();
      store.create({
        title: 'API Test Project',
        organization: 'Test Org',
        location: 'Nairobi',
        category: 'energy',
        summary: 'Clean solar project',
        commitment: 'Install 50 panels',
        ownerWallet: 'GWA1',
        milestones: [{ title: 'Panel install', detail: 'Install phase' }],
      });

      const res = await GET();
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe(
        'public, max-age=30, stale-while-revalidate=60',
      );

      const json = await res.json();
      expect(Array.isArray(json.projects)).toBe(true);
      expect(json.projects).toHaveLength(1);
      expect(json.projects[0].title).toBe('API Test Project');
      expect(json.nextCursor).toBeNull();
    });

    it('paginates with limit and cursor query parameters', async () => {
      const store = ProjectRecordStore.getInstance();
      for (let i = 1; i <= 3; i++) {
        store.create({
          title: `API Route Project ${i}`,
          organization: `Org ${i}`,
          location: `Loc ${i}`,
          category: 'education',
          summary: `Summary ${i}`,
          commitment: `Commitment ${i}`,
          ownerWallet: `GW${i}`,
          milestones: [{ title: 'M1', detail: 'D1' }],
        });
      }

      // Request page 1 with limit=2
      const req1 = new NextRequest(
        'http://localhost:3000/api/community/projects?limit=2',
      );
      const res1 = await GET(req1);
      const json1 = await res1.json();
      expect(json1.projects).toHaveLength(2);
      expect(json1.nextCursor).not.toBeNull();

      // Request page 2 with cursor
      const req2 = new NextRequest(
        `http://localhost:3000/api/community/projects?limit=2&cursor=${encodeURIComponent(json1.nextCursor)}`,
      );
      const res2 = await GET(req2);
      const json2 = await res2.json();
      expect(json2.projects).toHaveLength(1);
      expect(json2.nextCursor).toBeNull();
    });
  });
});
