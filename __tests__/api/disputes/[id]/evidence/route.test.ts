/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/disputes/[id]/evidence/route';
import { getSessionWallet } from '@/lib/session';

jest.mock('@/lib/session', () => ({
  getSessionWallet: jest.fn(),
}));
jest.mock('@/lib/adminAuth', () => ({
  requireAdminWallet: jest.fn(() => null),
}));
jest.mock('@/lib/contract', () => ({
  checkIsValidator: jest.fn(),
}));
jest.mock('@/lib/logger', () => ({
  createRequestLogger: jest.fn(() => ({
    error: jest.fn(),
  })),
}));

const mockGetSessionWallet = getSessionWallet as jest.MockedFunction<
  typeof getSessionWallet
>;
const mockFindById = jest.fn();
const mockAddEvent = jest.fn();
const mockStore = { findById: mockFindById, addEvent: mockAddEvent };

jest.mock('@/lib/milestoneDisputeStore', () => ({
  MilestoneDisputeStore: {
    getInstance: jest.fn(() => mockStore),
  },
}));

const WALLET = 'GPLAYER0000000000000000000000000000000000000000000000000';
const VALID_CID_V0 = `Qm${'a'.repeat(44)}`;
const VALID_CID_V1 = `b${'a'.repeat(58)}`;

function makeRequest(ipfsHash: unknown, ipfsMimeType = 'image/png') {
  return new NextRequest('http://localhost/api/disputes/7/evidence', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ipfsHash, ipfsMimeType }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSessionWallet.mockReturnValue(WALLET);
  mockFindById.mockReturnValue({
    id: 7,
    playerWallet: WALLET,
    validatorWallet:
      'GVALIDATOR0000000000000000000000000000000000000000000000000',
    status: 'pending',
  });
  mockAddEvent.mockReturnValue({ id: 'event-1' });
});

describe('POST /api/disputes/:id/evidence CID validation', () => {
  it.each(['../../etc/passwd', 'Qm1?x', 'A'.repeat(46)])(
    'rejects invalid CID %s before loading the dispute',
    async (ipfsHash) => {
      const response = await POST(makeRequest(ipfsHash), {
        params: { id: '7' },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'ipfsHash must be a valid IPFS CID',
      });
      expect(mockFindById).not.toHaveBeenCalled();
      expect(mockAddEvent).not.toHaveBeenCalled();
    },
  );

  it.each([VALID_CID_V0, VALID_CID_V1])(
    'accepts a valid CID %s',
    async (ipfsHash) => {
      const response = await POST(makeRequest(` ${ipfsHash} `), {
        params: { id: '7' },
      });

      expect(response.status).toBe(201);
      expect(mockAddEvent).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ ipfsHash }),
      );
    },
  );
});
