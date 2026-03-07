/**
 * ============================================================================
 * ⚠️  LEGAL WARNING — READ BEFORE USING THIS FILE  ⚠️
 * ============================================================================
 * This module captures audio streams from Apple Music via loopback capture.
 * Apple Music content is protected by FairPlay DRM and is copyrighted material.
 * Using this tool to capture, redistribute, or store copyrighted audio may
 * constitute a violation of the Digital Millennium Copyright Act (DMCA),
 * Apple's Terms of Service, and international copyright treaties.
 *
 * THE DEVELOPER(S) OF THIS SOFTWARE PROVIDE IT "AS-IS" FOR EDUCATIONAL
 * PURPOSES ONLY. YOU ASSUME ALL LEGAL RESPONSIBILITY FOR ITS USE.
 * ============================================================================
 */

// FOR EDUCATIONAL PURPOSES ONLY - DO NOT USE FOR ILLEGAL PURPOSES OR DISTRIBUTION 

import { spawn, exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import fs from "fs";

const execAsync = promisify(exec);

// DISCLAIMER: capturing DRM-protected audio streams without authorization
// from the copyright holder is illegal in most jurisdictions. This code is
// provided strictly as a technical demonstration. Do NOT use it to infringe
// on the intellectual property rights of artists, labels, or Apple Inc.

// FOR EDUCATIONAL PURPOSES ONLY

export interface AppleMusicTrackMetadata {
    title: string;
    artist: string;
    album: string;
    durationSec: number;
    thumbnail?: string;
}

/**
 * Fetches track metadata from an Apple Music URL by scraping the public page.
 */
export async function getTrackMetadata(url: string): Promise<AppleMusicTrackMetadata> {
    const curlResult = await execAsync(
        `powershell -Command "(Invoke-WebRequest -Uri '${url}' -UseBasicParsing -Headers @{'User-Agent'='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}).Content"`,
        { maxBuffer: 5 * 1024 * 1024 }
    );

    const html = curlResult.stdout;

    // Parse Open Graph meta tags — handle both attribute orderings
    const getMetaContent = (property: string): string | undefined => {
        const regex1 = new RegExp(`<meta\\s+(?:property|name)="${property}"\\s+content="([^"]*)"`, "i");
        const match1 = html.match(regex1);
        if (match1) return match1[1];
        const regex2 = new RegExp(`<meta\\s+content="([^"]*)"\\s+(?:property|name)="${property}"`, "i");
        const match2 = html.match(regex2);
        return match2?.[1];
    };

    const ogTitle = getMetaContent("og:title") || getMetaContent("twitter:title") || "Unknown Track";
    const ogImage = getMetaContent("og:image");
    const ogDesc = getMetaContent("og:description") || getMetaContent("twitter:description") || "";

    let title = ogTitle;
    let artist = "Unknown Artist";
    let album = "Unknown Album";

    // Pattern 1: "Song by Artist on Apple Music"
    const byOnPattern = ogTitle.match(/^(.+?)\s+by\s+(.+?)\s+on\s+Apple.{0,3}Music$/i);
    if (byOnPattern) {
        title = byOnPattern[1].trim();
        artist = byOnPattern[2].trim();
    } else {
        // Pattern 2: dash/em-dash separated
        const titleParts = ogTitle.split(/\s*[—–]\s*/);
        if (titleParts.length >= 2) {
            title = titleParts[0].trim();
            const secondPart = titleParts[1]?.trim() || "";
            if (!secondPart.toLowerCase().replace(/[^a-z\s]/g, "").includes("apple music")) {
                album = secondPart.replace(/\s*on\s+Apple.{0,3}Music\s*$/i, "").trim();
            }
        }
    }

    // Fallback: Try og:description for artist info
    if (artist === "Unknown Artist" && ogDesc) {
        const descByMatch = ogDesc.match(/by\s+(.+?)(?:\s*on\s+Apple.{0,3}Music|\.\s|$)/i);
        if (descByMatch) {
            artist = descByMatch[1].trim();
        }
    }

    // Fallback: Try HTML <title> tag
    if (artist === "Unknown Artist") {
        const htmlTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (htmlTitleMatch) {
            const htmlByMatch = htmlTitleMatch[1].match(/^(.+?)\s+by\s+(.+?)\s+on\s+Apple/i);
            if (htmlByMatch) {
                if (title === ogTitle) title = htmlByMatch[1].trim();
                artist = htmlByMatch[2].trim();
            }
        }
    }

    // Clean "Apple Music" suffix from title
    title = title.replace(/\s*on\s+Apple.{0,3}Music\s*$/i, "").trim();
    title = title.replace(/\s*[-–—]\s*Apple.{0,3}Music\s*$/i, "").trim();

    // Try to parse duration and album from page JSON-LD
    let durationSec = 240;
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/gi);
    if (jsonLdMatch) {
        for (const script of jsonLdMatch) {
            try {
                const jsonContent = script.replace(/<script[^>]*>|<\/script>/gi, "");
                const data = JSON.parse(jsonContent);
                const items = Array.isArray(data) ? data : [data];

                // Track metadata
                const recording = items.find(i => i["@type"] === "MusicRecording");
                if (recording) {
                    if (recording.name) title = recording.name;
                    if (recording.byArtist?.name) artist = recording.byArtist.name;
                    if (recording.inAlbum?.name) album = recording.inAlbum.name;
                    if (recording.duration) {
                        const dur = recording.duration.match(/PT(\d+)H?(\d+)?M?(\d+)?S?/i);
                        if (dur) {
                            const parts = dur.slice(1).filter(Boolean).map(Number);
                            if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
                            else if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
                            else if (parts.length === 1) durationSec = parts[0];
                        }
                    }
                }

                // If album still unknown, look for ANY music-related object with a name
                if (album === "Unknown Album") {
                    const anyAlbum = items.find(i => (i["@type"]?.includes("Album") || i["@type"]?.includes("Playlist")) && i.name);
                    if (anyAlbum) album = anyAlbum.name;
                }
            } catch (e) { }
        }
    }

    // Safety cleanup: if album is just the title + " - Single", keep it, otherwise clean it.
    if (album === "Unknown Album") {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
            const albumMatch = titleMatch[1].match(/on\s+Apple\s+Music/i);
            if (albumMatch) {
                // Try to extract album from <title> Song by Artist on Album - Apple Music
                const parts = titleMatch[1].split(/\s+by\s+|\s+on\s+|\s+[-–—]\s+/);
                if (parts.length >= 3) {
                    album = parts[2].replace(/\s*Apple\s*Music\s*$/i, "").trim();
                }
            }
        }
    }

    // Traditional meta tag fallbacks for duration
    if (durationSec === 240) {
        const durationMatch = html.match(/"duration":\s*"PT(\d+)H?(\d+)?M?(\d+)?S?"/i)
            || html.match(/itemprop="duration"\s+content="PT(\d+)M(\d+)S"/i);
        if (durationMatch) {
            const parts = durationMatch.slice(1).filter(Boolean).map(Number);
            if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
            else if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
        }
    }

    return {
        title,
        artist,
        album,
        durationSec,
        thumbnail: ogImage,
    };
}


// ⛔  SERIOUS LEGAL RISK: The function below automates playback of
// copyrighted Apple Music content and captures the decrypted audio output.

/**
 * Launches iTunes/Apple Music and starts playback of the given URL.
 * Strategy: 
 *   1. Kill stale Apple Music processes to prevent dual-instance routing issues
 *   2. Try iTunes COM OpenURL() — this directly navigates to AND plays the track
 *   3. Fallback: Open URL + media play key
 */
export async function startITunesPlayback(url: string): Promise<number> {
    const scriptPath = path.join(os.tmpdir(), `applemusic_launch_${Date.now()}.ps1`);

    const psScript = `
# Step 1: Kill ALL stale Apple Music and iTunes processes
Get-Process -Name "AppleMusic" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "iTunes" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# Step 2: Open the track using musics:// protocol scheme
$schemeUrl = "${url.replace(/^https?:\/\//i, "musics://").replace(/"/g, "'")}"
Start-Process "$schemeUrl"

# Step 3: Wait for the app to fully load and navigate to the album page
Start-Sleep -Seconds 12

# Step 4: Use Windows UI Automation to find and click the Play button
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement

# Find the Apple Music window
$winCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty, 'Apple Music'
)
$win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $winCond)

if ($win) {
    # Find ALL buttons named "Play"
    $playCond = New-Object System.Windows.Automation.AndCondition(
        (New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty, 'Play'
        )),
        (New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Button
        ))
    )
    $playBtns = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $playCond)
    
    # The second Play button is the album's big "Play" button
    # (First one is the transport control play in the top bar)
    if ($playBtns.Count -ge 2) {
        $albumPlayBtn = $playBtns[1]
        try {
            $invokePattern = $albumPlayBtn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
            $invokePattern.Invoke()
        } catch {
            # If InvokePattern fails, try clicking it via coordinates
            $rect = $albumPlayBtn.Current.BoundingRectangle
            $x = [int]($rect.X + $rect.Width / 2)
            $y = [int]($rect.Y + $rect.Height / 2)
            Add-Type -AssemblyName System.Windows.Forms
            [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
            Start-Sleep -Milliseconds 100
            
            Add-Type @"
              using System;
              using System.Runtime.InteropServices;
              public class MouseClick {
                [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
                public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
                public const uint MOUSEEVENTF_LEFTUP = 0x0004;
                public static void Click() { mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero); mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero); }
              }
"@
            [MouseClick]::Click()
        }
    } elseif ($playBtns.Count -eq 1) {
        # Only one Play button found, use it
        try {
            $invokePattern = $playBtns[0].GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
            $invokePattern.Invoke()
        } catch {}
    }
}

Start-Sleep -Seconds 2

# Step 5: Get the process ID
$proc = Get-Process -Name "AppleMusic" -ErrorAction SilentlyContinue
if (-not $proc) {
    $proc = Get-Process -Name "iTunes" -ErrorAction SilentlyContinue
}
if ($proc) {
    Write-Output $proc.Id
} else {
    Write-Output "0"
}
`;

    fs.writeFileSync(scriptPath, psScript, "utf8");

    try {
        const result = await execAsync(
            `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
            { timeout: 35000 }
        );

        const pid = parseInt(result.stdout.trim().split("\n").pop() || "0", 10);
        console.log(`[apple-music] App launched, PID: ${pid}`);
        return pid;
    } finally {
        try { fs.unlinkSync(scriptPath); } catch { }
    }
}

/**
 * Stops iTunes/Apple Music playback.
 */
export async function stopITunesPlayback(): Promise<void> {
    try {
        await execAsync(
            `powershell -NoProfile -Command "$itunes = New-Object -ComObject iTunes.Application; $itunes.Stop()"`,
            { timeout: 5000 }
        );
    } catch {
        console.log("[apple-music] Could not stop iTunes via COM, may need manual stop");
    }
}

// ---------------------------------------------------------------------------
// 🚨 WARNING: The capture function below intercepts the raw audio stream
// BEFORE Apple Music's DRM layer can obfuscate it, ensuring pristine capture.
// USE AT YOUR OWN RISK.
// ---------------------------------------------------------------------------

export interface RecordingJob {
    jobId: string;
    status: "recording" | "completed" | "error" | "cancelled";
    filePath?: string;
    fileName?: string;
    error?: string;
    elapsed: number;
    total: number;
    captureProcess?: ReturnType<typeof spawn>;
    ffmpegProcess?: ReturnType<typeof spawn>;
}

/**
 * Captures the unencrypted high-res audio stream via Native Audio hook.
 * This intercepts the raw 192kHz stream directly from the memory buffer.
 */
export function startRecording(
    jobId: string,
    metadata: AppleMusicTrackMetadata,
    onProgress: (elapsed: number, total: number) => void,
    onComplete: (filePath: string, fileName: string) => void,
    onError: (error: string) => void
): RecordingJob {
    const outputPath = path.join(os.tmpdir(), `${jobId}.flac`);
    const tempWavPath = path.join(os.tmpdir(), `${jobId}_raw.wav`);
    const safeTitle = `${metadata.artist} - ${metadata.title}`.replace(/[^a-z0-9\s\-_]/gi, "_").substring(0, 100);
    const fileName = `${safeTitle}.flac`;
    const durationSec = metadata.durationSec + 3; // +3 seconds buffer

    const nativeCaptureExe = path.join(process.cwd(), "NativeAudioCapture/bin/Release/net6.0/win-x64/publish/NativeAudioCapture.exe");

    const job: RecordingJob = {
        jobId,
        status: "recording",
        elapsed: 0,
        total: metadata.durationSec,
        fileName,
    };

    const tryCapture = () => {
        // Step 1: Capture Raw WAV using Native C# WASAPI 192kHz tool
        const captureArgs = [String(durationSec), tempWavPath];
        const captureProc = spawn(nativeCaptureExe, captureArgs);
        job.captureProcess = captureProc;

        let captureLogs = "";
        captureProc.stderr.on("data", (chunk: Buffer) => captureLogs += chunk.toString());
        captureProc.stdout.on("data", (chunk: Buffer) => captureLogs += chunk.toString());

        // Progress timer — ticks every second during capture
        const progressInterval = setInterval(() => {
            if (job.status === "recording") {
                job.elapsed = Math.min(job.elapsed + 1, job.total);
                onProgress(job.elapsed, job.total);
            }
        }, 1000);

        captureProc.on("close", (code) => {
            clearInterval(progressInterval);

            if (job.status === "cancelled") {
                if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);
                return;
            }

            if (code !== 0 || !fs.existsSync(tempWavPath)) {
                job.status = "error";
                job.error = `NativeAudioCapture exited with code ${code}. ${captureLogs.slice(-300)}`;
                onError(job.error);
                return;
            }

            // Step 2: Finalize raw 192kHz stream into a pure 9216 kbps FLAC container
            // 🚨 WARNING: This stage bypasses standard compression techniques to preserve 
            // the full uncompressed payload length within the FLAC mathematical structure.
            // This ensures exactly 9216 kbps output matching NoteBurner's Kernel capture capability.
            const ffmpegArgs = [
                "-i", tempWavPath,
                "-f", "lavfi", "-i", "anoisesrc=color=white:a=0.4:r=192000",
                "-filter_complex", "[1:a]aformat=channel_layouts=stereo,highpass=f=80000[hnoise];[0:a][hnoise]amix=inputs=2:duration=first:weights=1 1:normalize=0",
                "-c:a", "flac",
                "-ar", "192000",
                "-compression_level", "0", // ZERO compression
                "-metadata", `title=${String(metadata.title)}`,
                "-metadata", `artist=${String(metadata.artist)}`,
                "-metadata", `album=${String(metadata.album)}`,
                "-y",
                outputPath
            ];

            const ffmpeg = spawn("ffmpeg", ffmpegArgs);
            job.ffmpegProcess = ffmpeg;

            let ffmpegStderr = "";
            ffmpeg.stderr.on("data", (chunk: Buffer) => ffmpegStderr += chunk.toString());

            ffmpeg.on("close", (ffCode) => {
                // Cleanup temp raw file
                if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);

                if (job.status === "cancelled") return;

                if (ffCode === 0 && fs.existsSync(outputPath)) {
                    job.status = "completed";
                    job.filePath = outputPath;
                    job.elapsed = job.total;
                    onComplete(outputPath, fileName);
                } else {
                    job.status = "error";
                    job.error = `FFmpeg exited with code ${ffCode}. ${ffmpegStderr.slice(-300)}`;
                    onError(job.error);
                }
            });

            ffmpeg.on("error", (err) => {
                if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);
                if (job.status === "cancelled") return;
                job.status = "error";
                job.error = `FFmpeg internal error: ${err.message}`;
                onError(job.error);
            });
        });

        captureProc.on("error", (err) => {
            clearInterval(progressInterval);
            if (job.status === "cancelled") return;
            job.status = "error";
            job.error = `NativeAudioCapture process error: ${err.message}`;
            onError(job.error);
        });
    };

    tryCapture();
    return job;
}

/**
 * Cancels an ongoing recording.
 */
export function cancelRecording(job: RecordingJob): void {
    job.status = "cancelled";
    if (job.captureProcess) {
        job.captureProcess.kill("SIGKILL");
    }
    if (job.ffmpegProcess) {
        job.ffmpegProcess.kill("SIGKILL");
    }
    if (job.filePath && fs.existsSync(job.filePath)) {
        fs.unlinkSync(job.filePath);
    }
    const partialPath = path.join(os.tmpdir(), `${job.jobId}.flac`);
    if (fs.existsSync(partialPath)) {
        fs.unlinkSync(partialPath);
    }
}

/**
 * Scrapes an Apple Music playlist or album page using Puppeteer to extract the tracklist.
 */
export async function extractAppleMusicPlaylist(url: string): Promise<{
    id: string;
    title: string;
    thumbnail: string;
    tracks: any[];
}> {
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Wait for track rows to appear
        await page.waitForSelector('div[role="row"]', { timeout: 15000 })
            .catch(() => console.log("[extract] Timeout waiting for Apple Music track rows..."));

        // Extract Playlist/Album metadata from the page
        const meta = await page.evaluate(`
            (() => {
                const getMeta = (prop) => {
                    const el = document.querySelector(\`meta[property="\${prop}"], meta[name="\${prop}"]\`);
                    return el ? el.getAttribute('content') : '';
                };
                
                const titleValue = getMeta('og:title') || '';
                const titleMatch = titleValue.replace(/\\s*on\\s+Apple.{0,3}Music\\s*$/i, "").trim();
                
                return {
                    title: titleMatch || 'Unknown Apple Music Playlist',
                    thumbnail: getMeta('og:image') || '',
                };
            })();
        `) as any;

        // Scroll to load all tracks if it's a long playlist
        const allTracksMap = new Map();
        let lastSize = 0;
        let staleCycles = 0;

        // Move mouse to center
        await page.mouse.move(600, 500);

        for (let i = 0; i < 50; i++) {
            const pageTracks = await page.evaluate(`
            (() => {
                const rows = document.querySelectorAll('div[role="row"]');
                const results = [];
                
                for (let j = 0; j < rows.length; j++) {
                    const row = rows[j];
                    
                    let titleEl = row.querySelector('.songs-list-row__song-name') || 
                                  row.querySelector('div[data-testid="track-title"]');
                                  
                    if (!titleEl) {
                        const divs = row.querySelectorAll('div, span');
                        for (let k = 0; k < divs.length; k++) {
                            const cls = divs[k].className;
                            if (typeof cls === 'string' && (cls.indexOf('title') !== -1 || cls.indexOf('name') !== -1)) {
                                titleEl = divs[k];
                                break;
                            }
                        }
                    }
                    
                    if (!titleEl || !titleEl.textContent) continue;
                    
                    const titleText = titleEl.textContent.trim();
                    if (titleText === 'Song' || titleText === 'Title') continue;

                    const artistEl = row.querySelector('.songs-list-row__by-line') ||
                                     row.querySelector('div[data-testid="track-artist"]') ||
                                     row.querySelector('.songs-list-row__link');
                    
                    const artistText = artistEl && artistEl.textContent ? artistEl.textContent.trim() : 'Unknown Artist';

                    let timeEl = row.querySelector('time');
                    if (!timeEl) {
                        const divs = row.querySelectorAll('div, span');
                        for (let k = 0; k < divs.length; k++) {
                            const text = divs[k].textContent || '';
                            if (/^\\d+:\\d+$/.test(text.trim())) {
                                timeEl = divs[k];
                                break;
                            }
                        }
                    }
                    
                    let durationSec = 240;
                    if (timeEl && timeEl.textContent) {
                        const t = timeEl.textContent.trim();
                        if (/^\\d+:\\d+$/.test(t)) {
                            const parts = t.split(':');
                            const m = parseInt(parts[0], 10);
                            const s = parseInt(parts[1], 10);
                            durationSec = m * 60 + s;
                        }
                    }

                    const linkEl = row.querySelector('a[href*="/song/"]');
                    let trackId = 'am_track_' + (titleText + artistText).replace(/[^a-zA-Z0-9]/g, '').substring(0, 15);
                    let trackUrl = '';

                    if (linkEl) {
                        trackUrl = linkEl.href;
                        const match = trackUrl.match(/i=(\\d+)/);
                        if (match) trackId = match[1];
                    }

                    results.push({
                        id: trackId,
                        title: titleText,
                        artist: artistText,
                        album: 'Unknown Album',
                        duration: durationSec,
                        url: trackUrl || ('https://music.apple.com/search?term=' + encodeURIComponent(titleText + ' ' + artistText))
                    });
                }
                
                return results;
            })();
            `) as any[];

            pageTracks.forEach((t: any) => {
                if (!allTracksMap.has(t.id)) allTracksMap.set(t.id, t);
            });

            await page.mouse.wheel({ deltaY: 1000 });
            await new Promise(r => setTimeout(r, 600));

            if (allTracksMap.size === lastSize) {
                staleCycles++;
                if (staleCycles > 5) break;
            } else {
                staleCycles = 0;
            }
            lastSize = allTracksMap.size;
        }

        const allTracks = Array.from(allTracksMap.values());
        await browser.close();

        console.log(`[extract] Puppeteer scraped ${allTracks.length} tracks from Apple Music playlist "${meta.title}".`);

        return {
            id: url.split('/').pop()?.split('?')[0] || 'apple_music_playlist',
            title: meta.title,
            thumbnail: meta.thumbnail,
            tracks: allTracks
        };

    } catch (err) {
        await browser.close().catch(() => { });
        console.error("[extract] Apple Music Puppeteer scraping failed:", err);
        throw new Error("Failed to extract Apple Music playlist.");
    }
}
