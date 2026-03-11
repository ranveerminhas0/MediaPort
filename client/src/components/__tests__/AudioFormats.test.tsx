import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AudioFormats } from '../AudioFormats';
import { useMutation } from '@tanstack/react-query';

// Mock the dependencies
vi.mock('@tanstack/react-query', () => ({
    useMutation: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
    useToast: () => ({
        toast: vi.fn(),
    }),
}));

vi.mock('lucide-react', () => ({
    Music: () => <div data-testid="music-icon" />,
    Loader2: () => <div data-testid="loader-icon" />,
    Disc3: () => <div data-testid="disc-icon" />,
    X: () => <div data-testid="x-icon" />,
    AlertTriangle: () => <div data-testid="alert-icon" />,
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('AudioFormats Component', () => {
    const mockAudioFormats = [
        { format_id: 'mp3', label: 'MP3 320kbps', ext: 'mp3', quality: '320kbps' },
        { format_id: 'wav', label: 'WAV Lossless', ext: 'wav', quality: 'Lossless' },
    ];

    const defaultProps = {
        audioFormats: mockAudioFormats,
        title: 'Test Song',
        url: 'https://spotify.com/track/123',
        artist: 'Test Artist',
    };

    it('renders all audio format options with correct labels', () => {
        vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);

        render(<AudioFormats {...defaultProps} />);

        expect(screen.getByText('mp3')).toBeInTheDocument();
        expect(screen.getByText('wav')).toBeInTheDocument();
        expect(screen.getByText('320kbps')).toBeInTheDocument();
        expect(screen.getByText('Lossless')).toBeInTheDocument();
    });

    it('triggers the download mutation when a format is selected', () => {
        const mockMutate = vi.fn();
        vi.mocked(useMutation).mockReturnValue({ mutate: mockMutate, isPending: false } as any);

        render(<AudioFormats {...defaultProps} />);

        const getButtons = screen.getAllByText('Get');
        fireEvent.click(getButtons[0]); // Click the first "Get" button (MP3)

        // The mutationFn is called with the object { format: 'mp3' } based on the component code
        expect(mockMutate).toHaveBeenCalledWith({ format: 'mp3' });
    });

    it('shows processing state when a download is in progress', () => {
        vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn(), isPending: true } as any);

        render(<AudioFormats {...defaultProps} />);

        const getButtons = screen.getAllByRole('button', { name: /get/i });
        expect(getButtons[0]).toBeDisabled();
        expect(getButtons[1]).toBeDisabled();
    });
});
