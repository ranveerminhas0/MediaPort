import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Run cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
    cleanup();
});

// Mocking window.location
Object.defineProperty(window, 'location', {
    value: {
        href: '',
    },
    writable: true,
});
