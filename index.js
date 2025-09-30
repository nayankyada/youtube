const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Links } = require("./dhruv_aug_2025.json");

// Download mode configuration
// Options: 'video+audio', 'video-only', 'audio-only'
const DOWNLOAD_MODE = 'video+audio';

// dont change this array
const videos = Links;


// Helper function to check if file exists and is not empty
function fileExists(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size > 0; // File exists and has content
  } catch (error) {
    return false; // File doesn't exist
  }
}

// Helper function to get video title using yt-dlp with cookies
async function getVideoTitle(videoUrl) {
  return new Promise((resolve, reject) => {
    const command = `yt-dlp --cookies-from-browser chrome --get-title --no-warnings "${videoUrl}"`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// Helper function to check available formats
async function checkAvailableFormats(videoUrl) {
  return new Promise((resolve, reject) => {
    const command = `yt-dlp --cookies-from-browser chrome --list-formats --no-warnings "${videoUrl}"`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`Warning: Could not check formats for ${videoUrl}:`, error.message);
        resolve(null); // Don't fail, just continue without format info
        return;
      }
      resolve(stdout);
    });
  });
}

// Helper function to download with yt-dlp using cookies
async function downloadWithYtDlp(videoUrl, outputPath, mode) {
  return new Promise((resolve, reject) => {
    let command;

    if (mode === 'audio-only') {
      command = `yt-dlp --cookies-from-browser chrome -x --audio-format mp3 --audio-quality 0 -o "${outputPath}.%(ext)s" --no-warnings "${videoUrl}"`;
    } else if (mode === 'video-only') {
      // More flexible format selection with fallbacks
      command = `yt-dlp --cookies-from-browser chrome -f "best[height<=1080]/best[height<=720]/best" -o "${outputPath}.%(ext)s" --no-warnings "${videoUrl}"`;
    } else { // video+audio
      // More flexible format selection with multiple fallbacks
      command = `yt-dlp --cookies-from-browser chrome -f "bestvideo[height<=1080]+bestaudio/bestvideo[height<=720]+bestaudio/best[height<=1080]/best[height<=720]/best" -o "${outputPath}.%(ext)s" --no-warnings "${videoUrl}"`;
    }

    console.log(`Downloading with yt-dlp (using browser cookies)...`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`yt-dlp error:`, error.message);
        if (stderr) {
          console.log(`yt-dlp stderr:`, stderr);
        }
        if (stdout) {
          console.log(`yt-dlp stdout:`, stdout);
        }
        reject(error);
        return;
      }
      console.log(`Download completed!`);
      resolve();
    });
  });
}

// Helper function to retry with exponential backoff
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      // Add random jitter to make requests look more natural
      const jitter = Math.random() * 1000; // 0-1000ms random delay
      const delay = baseDelay * Math.pow(2, attempt - 1) + jitter;
      console.log(`Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function downloadVideo(videoUrl, index) {
  try {
    console.log(`Starting download ${index + 1}/${videos.length}...`);
    console.log(`Download mode: ${DOWNLOAD_MODE}`);

    // Get video title
    const title = await retryWithBackoff(async () => {
      return await getVideoTitle(videoUrl);
    });

    const safeTitle = title.replace(/[<>:"/\\|?*]/g, "_");
    console.log(`Video: ${title}`);

    // Check available formats for debugging
    console.log(`Checking available formats...`);
    const formats = await checkAvailableFormats(videoUrl);
    if (formats) {
      console.log(`Available formats found for ${videoUrl}`);
    } else {
      console.log(`Could not retrieve format information for ${videoUrl}`);
    }

    // Determine output path based on mode
    let outputPath = `${safeTitle}`;

    // Check if file already exists
    const possibleExtensions = ['.mp4', '.webm', '.mkv', '.mp3', '.m4a'];
    let existingFile = null;

    for (const ext of possibleExtensions) {
      const testPath = `${outputPath}${ext}`;
      if (fileExists(testPath)) {
        existingFile = testPath;
        break;
      }
    }

    if (existingFile) {
      console.log(`File already exists: ${existingFile} - skipping download`);
      return;
    }

    // Download with yt-dlp
    await retryWithBackoff(async () => {
      return await downloadWithYtDlp(videoUrl, outputPath, DOWNLOAD_MODE);
    });

    console.log(`\nDownloaded: ${outputPath}`);

  } catch (error) {
    console.log(`\nError processing video ${index + 1}:`, error.message);
    console.log(`Video URL: ${videoUrl}`);
    throw error;
  }
}

async function downloadAllVideos() {
  console.log(`Starting download of ${videos.length} videos...`);
  console.log(`Using browser cookies for authentication...`);

  for (let i = 0; i < videos.length; i++) {
    try {
      await downloadVideo(videos[i], i);

      if (i < videos.length - 1) {
        console.log("Waiting 5 seconds before next download...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.log(`Skipping video ${i + 1} due to error:`, error.message);
      console.log('Full error:', error);
      continue;
    }
  }

  console.log("\nAll downloads completed!");
}

downloadAllVideos().catch(console.error);