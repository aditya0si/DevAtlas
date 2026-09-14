import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import RepositoryDetailPanel from '../RepositoryDetailPanel';

jest.mock('framer-motion', () => require('../../test/mocks/framer-motion'));

const mockGetRepositoryDetails = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    getRepositoryDetails: (...args: unknown[]) => mockGetRepositoryDetails(...args),
  },
}));

const repoData = {
  id: 'abc-123',
  name: 'my-repo',
  full_name: 'org/my-repo',
  description: 'A real repository pulled from Firestore',
  html_url: 'https://github.com/org/my-repo',
  language: 'TypeScript',
  languages: { TypeScript: 100 },
  stargazers_count: 2847,
  forks_count: 423,
  open_issues_count: 23,
  topics: ['typescript', 'india'],
  default_branch: 'main',
  created_at: '2024-01-15T00:00:00Z',
  updated_at: '2024-07-10T00:00:00Z',
  pushed_at: '2024-07-15T00:00:00Z',
  classification: { domain: 'ai', industry: 'AI/ML' },
  owner: { login: 'org', avatar_url: '', location: 'India', state: 'Karnataka' },
};

describe('RepositoryDetailPanel drill-down', () => {
  beforeEach(() => {
    mockGetRepositoryDetails.mockReset();
  });

  it('shows a loading state while fetching', () => {
    mockGetRepositoryDetails.mockImplementation(() => new Promise(() => {}));
    render(<RepositoryDetailPanel repoId="abc-123" onClose={jest.fn()} />);
    expect(screen.getByText('Loading repository details...')).toBeInTheDocument();
  });

  it('requests the repository detail from the API client with the clicked repo id', async () => {
    mockGetRepositoryDetails.mockResolvedValue(repoData);
    render(<RepositoryDetailPanel repoId="abc-123" onClose={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('my-repo')).toBeInTheDocument();
    });
    expect(mockGetRepositoryDetails).toHaveBeenCalledWith('abc-123', expect.any(AbortSignal));
  });

  it('renders real repository data after loading', async () => {
    mockGetRepositoryDetails.mockResolvedValue(repoData);
    render(<RepositoryDetailPanel repoId="abc-123" onClose={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('my-repo')).toBeInTheDocument();
    });
    expect(screen.getByText('org/my-repo')).toBeInTheDocument();
    expect(screen.getByText('A real repository pulled from Firestore')).toBeInTheDocument();
    expect(screen.getByText('2.8k')).toBeInTheDocument(); // 2847 stars -> 2.8k
    expect(screen.getByText('ai')).toBeInTheDocument(); // classified domain badge
    expect(screen.getByText('View on GitHub')).toHaveAttribute('href', repoData.html_url);
  });

  it('shows an error state when the API request fails', async () => {
    mockGetRepositoryDetails.mockRejectedValue(new Error('Repository not found'));
    render(<RepositoryDetailPanel repoId="missing" onClose={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load repository')).toBeInTheDocument();
    });
    // The error message appears in both the header and the error body.
    expect(screen.getAllByText('Repository not found')).toHaveLength(2);
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = jest.fn();
    mockGetRepositoryDetails.mockResolvedValue(repoData);
    render(<RepositoryDetailPanel repoId="abc-123" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('my-repo')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Close repository details'));
    expect(onClose).toHaveBeenCalled();
  });

  it('aborts the in-flight request when the repo id changes', async () => {
    // A never-resolving promise keeps the first request pending.
    mockGetRepositoryDetails.mockImplementation(() => new Promise(() => {}));
    const { rerender } = render(<RepositoryDetailPanel repoId="abc-123" onClose={jest.fn()} />);

    // Re-render with a different repo id, which should abort the first request.
    rerender(<RepositoryDetailPanel repoId="def-456" onClose={jest.fn()} />);

    const firstSignal = mockGetRepositoryDetails.mock.calls[0][1] as AbortSignal;
    const secondSignal = mockGetRepositoryDetails.mock.calls[1][1] as AbortSignal;
    expect(firstSignal).toBeInstanceOf(AbortSignal);
    expect(secondSignal).toBeInstanceOf(AbortSignal);
    expect(secondSignal).not.toBe(firstSignal);
    // The first signal must be aborted after the repo id changed.
    expect(firstSignal.aborted).toBe(true);
    expect(secondSignal.aborted).toBe(false);
  });

  it('does not render stale data after the request is aborted', async () => {
    let resolveFirst!: (value: unknown) => void;
    mockGetRepositoryDetails.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; })
    );
    // Keep the replacement request pending so only the stale response could
    // ever paint.
    mockGetRepositoryDetails.mockImplementation(() => new Promise(() => {}));

    const { rerender } = render(<RepositoryDetailPanel repoId="abc-123" onClose={jest.fn()} />);
    // Switch to a new repo, aborting the first request.
    rerender(<RepositoryDetailPanel repoId="def-456" onClose={jest.fn()} />);

    // Resolve the stale first request after it was aborted.
    await act(async () => {
      resolveFirst(repoData);
    });

    // The stale response must not render for the new repo id.
    expect(screen.queryByText('my-repo')).not.toBeInTheDocument();
  });
});
