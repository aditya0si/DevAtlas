import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RepositoryDetailPanel from '../RepositoryDetailPanel';

jest.mock('framer-motion', () => require('../../test/mocks/framer-motion'));

const repoData = {
  id: 'abc-123',
  name: 'my-repo',
  full_name: 'org/my-repo',
  description: 'A real repository pulled from the API',
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

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const notFoundResponse = () => ({
  ok: false,
  status: 404,
  json: async () => ({ detail: 'Repository not found' }),
  text: async () => JSON.stringify({ detail: 'Repository not found' }),
});

describe('RepositoryDetailPanel drill-down', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('shows a loading state while fetching', () => {
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    render(<RepositoryDetailPanel repoId="abc-123" onClose={jest.fn()} />);
    expect(screen.getByText('Loading repository details...')).toBeInTheDocument();
  });

  it('requests the repository detail API with the clicked repo id', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(okResponse(repoData));
    render(<RepositoryDetailPanel repoId="abc-123" onClose={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('my-repo')).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/repositories/abc-123'),
      expect.anything()
    );
  });

  it('renders real repository data after loading', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(okResponse(repoData));
    render(<RepositoryDetailPanel repoId="abc-123" onClose={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('my-repo')).toBeInTheDocument();
    });
    expect(screen.getByText('org/my-repo')).toBeInTheDocument();
    expect(screen.getByText('A real repository pulled from the API')).toBeInTheDocument();
    expect(screen.getByText('2.8k')).toBeInTheDocument(); // 2847 stars -> 2.8k
    expect(screen.getByText('ai')).toBeInTheDocument(); // classified domain badge
    expect(screen.getByText('View on GitHub')).toHaveAttribute('href', repoData.html_url);
  });

  it('shows an error state when the API request fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notFoundResponse());
    render(<RepositoryDetailPanel repoId="missing" onClose={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load repository')).toBeInTheDocument();
    });
    // The error message appears in both the header and the error body.
    expect(screen.getAllByText('Repository not found')).toHaveLength(2);
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = jest.fn();
    (global.fetch as jest.Mock).mockResolvedValue(okResponse(repoData));
    render(<RepositoryDetailPanel repoId="abc-123" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('my-repo')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Close repository details'));
    expect(onClose).toHaveBeenCalled();
  });

  it('aborts the in-flight request when the repo id changes', async () => {
    // A never-resolving promise keeps the first request pending.
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    const { rerender } = render(<RepositoryDetailPanel repoId="abc-123" onClose={jest.fn()} />);

    // Re-render with a different repo id, which should abort the first request.
    rerender(<RepositoryDetailPanel repoId="def-456" onClose={jest.fn()} />);

    const calls = (global.fetch as jest.Mock).mock.calls;
    // The first call's init should carry an AbortSignal.
    const firstInit = calls[0][1];
    expect(firstInit.signal).toBeInstanceOf(AbortSignal);
    // The second call (new repo) also carries its own signal.
    const secondInit = calls[1][1];
    expect(secondInit.signal).toBeInstanceOf(AbortSignal);
    // The first signal must be aborted after the repo id changed.
    expect(firstInit.signal.aborted).toBe(true);
  });

  it('does not render stale data after the request is aborted', async () => {
    let resolveSignal: (value: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => { resolveSignal = resolve; })
    );
    (global.fetch as jest.Mock).mockResolvedValue(okResponse(repoData));

    const { rerender } = render(<RepositoryDetailPanel repoId="abc-123" onClose={jest.fn()} />);
    // Switch to a new repo, aborting the first request.
    rerender(<RepositoryDetailPanel repoId="def-456" onClose={jest.fn()} />);

    // Resolve the stale first request after it was aborted.
    resolveSignal(okResponse(repoData));

    // The stale response must not render for the new repo id.
    await waitFor(() => {
      expect(screen.queryByText('my-repo')).not.toBeInTheDocument();
    });
  });
});
