import { describe, it, expect } from 'vitest';
import { detectPlatform, AUDIO_PLATFORMS, isYouTubePlaylist, isAppleMusicPlaylist } from '../routes';

describe('detectPlatform', () => {
    it('should detect Spotify links', () => {
        expect(detectPlatform('https://open.spotify.com/track/3p4o4enJPHUV75wdXtRtRM')).toBe('spotify');
        expect(detectPlatform('https://spotify.com/track/123')).toBe('spotify');
    });

    it('should detect SoundCloud links', () => {
        expect(detectPlatform('https://soundcloud.com/artist/track')).toBe('soundcloud');
    });

    it('should detect YouTube Music links', () => {
        expect(detectPlatform('https://music.youtube.com/watch?v=123')).toBe('youtube_music');
    });

    it('should detect Bandcamp links', () => {
        expect(detectPlatform('https://artist.bandcamp.com/track/track')).toBe('bandcamp');
    });

    it('should detect YouTube links', () => {
        expect(detectPlatform('https://www.youtube.com/watch?v=123')).toBe('youtube');
        expect(detectPlatform('https://youtu.be/123')).toBe('youtube');
    });

    it('should detect Instagram links', () => {
        expect(detectPlatform('https://www.instagram.com/p/123/')).toBe('instagram');
    });

    it('should return "generic" for unknown platforms', () => {
        expect(detectPlatform('https://example.com')).toBe('generic');
        expect(detectPlatform('invalid-url')).toBe('generic');
    });
});

describe('AUDIO_PLATFORMS', () => {
    it('should contain the expected audio platforms', () => {
        expect(AUDIO_PLATFORMS).toContain('spotify');
        expect(AUDIO_PLATFORMS).toContain('soundcloud');
        expect(AUDIO_PLATFORMS).toContain('bandcamp');
        expect(AUDIO_PLATFORMS).toContain('youtube_music');
    });

    it('should NOT contain video-only platforms', () => {
        expect(AUDIO_PLATFORMS).not.toContain('youtube');
        expect(AUDIO_PLATFORMS).not.toContain('tiktok');
    });
});

describe('isYouTubePlaylist', () => {
    it('should detect /playlist?list= URLs', () => {
        expect(isYouTubePlaylist('https://www.youtube.com/playlist?list=PLRqwX-V7Uu6ZiZxtDDRCi6uhfTH4FilpH')).toBe(true);
    });

    it('should detect /watch?v=...&list= URLs', () => {
        expect(isYouTubePlaylist('https://www.youtube.com/watch?v=abc123&list=PLRqwX-V7Uu6ZiZxtDDRCi6uhfTH4FilpH')).toBe(true);
    });

    it('should NOT detect single video URLs', () => {
        expect(isYouTubePlaylist('https://www.youtube.com/watch?v=abc123')).toBe(false);
    });

    it('should handle youtu.be short URLs with list param', () => {
        expect(isYouTubePlaylist('https://youtu.be/abc123?list=PLRqwX-V7Uu6ZiZxtDDRCi6uhfTH4FilpH')).toBe(true);
    });
});

describe('isAppleMusicPlaylist', () => {
    it('should detect album links', () => {
        expect(isAppleMusicPlaylist('https://music.apple.com/us/album/dark-love-single/1500332306')).toBe(true);
    });

    it('should detect playlist links', () => {
        expect(isAppleMusicPlaylist('https://music.apple.com/us/playlist/sidhu-moose-wala-deep-cuts/pl.448f04357e3b4b88bdc81062b9a7c64c')).toBe(true);
    });

    it('should NOT detect single track links (with i= parameter)', () => {
        expect(isAppleMusicPlaylist('https://music.apple.com/us/album/dark-love/1500332306?i=1500332307')).toBe(false);
    });

    it('should return false for non-Apple Music links', () => {
        expect(isAppleMusicPlaylist('https://open.spotify.com/playlist/123')).toBe(false);
    });
});
