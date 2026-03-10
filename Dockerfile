# Use the official Node.js 20 image based on Debian Bookworm
FROM node:20-bookworm-slim

# Install system dependencies:
#  - Puppeteer/Chromium needs a long list of shared libraries
#  - Python3 + pip for yt-dlp and gallery-dl
#  - ffmpeg for audio/video post-processing
#  - curl/wget for general use
RUN apt-get update && apt-get install -y \
    # Puppeteer / Chromium dependencies
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    # FFmpeg for audio/video processing (used by yt-dlp and Apple Music service)
    ffmpeg \
    # Python3 for yt-dlp and gallery-dl
    python3 \
    python3-pip \
    python3-venv \
    # General utilities
    wget \
    curl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp and gallery-dl via pip
RUN pip3 install --no-cache-dir --break-system-packages \
    yt-dlp \
    gallery-dl

# Set the working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the frontend and backend
RUN npm run build

# Render sets the PORT dynamically, default to 3000
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production

# Start the application
CMD ["npm", "run", "start"]
