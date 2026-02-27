import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./client/src/test/setup.ts'],
        alias: {
            '@': path.resolve(__dirname, './client/src'),
            '@shared': path.resolve(__dirname, './shared'),
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './client/src'),
            '@shared': path.resolve(__dirname, './shared'),
        },
    },
});
