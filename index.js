const ytdl = require("@distube/ytdl-core");
const fs = require("fs");
const { exec } = require("child_process");
const path = require("path");

// Download mode configuration
// Options: 'video+audio', 'video-only', 'audio-only'
const DOWNLOAD_MODE = 'video+audio';

const videos = [
  "https://youtu.be/YRglbJA0K-8",
  "https://youtu.be/pOwOXCB6aCA",
  "https://youtu.be/aHJw7C34VO0",
  "https://youtu.be/HO8g64JQeQE",
  "https://youtu.be/f9-ZI4tfr7k",
  "https://youtu.be/89Jil-UwsGI",
  "https://youtu.be/_6G46RbyFrE",
  "https://youtu.be/fBCAY50fRmY",
  "https://youtu.be/OvsBn8VNGCo",
  "https://youtu.be/y_3W7sxU6HA",
  // "https://youtu.be/a0oMcc_1_Es",
];

// Helper function to download a single stream
function downloadStream(videoUrl, format, outputPath, type) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${type}...`);

    const stream = ytdl(videoUrl, {
      format: format,
      quality: "highest",
    });

    const writeStream = fs.createWriteStream(outputPath);

    stream.pipe(writeStream);

    stream.on("progress", (chunkLength, downloaded, total) => {
      const percent = (downloaded / total) * 100;
      process.stdout.write(`\r${type} Progress: ${percent.toFixed(1)}%`);
    });

    writeStream.on("finish", () => {
      console.log(`\n${type} downloaded: ${outputPath}`);
      resolve();
    });

    writeStream.on("error", (error) => {
      console.log(`\nError downloading ${type}:`, error.message);
      reject(error);
    });

    stream.on("error", (error) => {
      console.log(`\nStream error for ${type}:`, error.message);
      reject(error);
    });
  });
}

// Helper function to merge video and audio with ffmpeg
function mergeWithFFmpeg(videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpegCommand = `ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a copy -y "${outputPath}"`;

    console.log('Merging with ffmpeg...');
    exec(ffmpegCommand, (error, stdout, stderr) => {
      if (error) {
        console.log(`\nFFmpeg error:`, error.message);
        reject(error);
        return;
      }
      console.log('\nMerging completed successfully!');
      resolve();
    });
  });
}

async function downloadVideo(videoUrl, index) {
  try {
    console.log(`Starting download ${index + 1}/${videos.length}...`);
    console.log(`Download mode: ${DOWNLOAD_MODE}`);

    const info = await ytdl.getInfo(videoUrl);
    const title = info.videoDetails.title;
    const safeTitle = title.replace(/[<>:"/\\|?*]/g, "_");

    console.log(`Video: ${title}`);
    console.log(`Duration: ${info.videoDetails.lengthSeconds} seconds`);

    // Get all available formats
    const allFormats = info.formats;
    console.log(`Total formats available: ${allFormats.length}`);

    // Get highest quality video format
    const videoFormats = ytdl.filterFormats(allFormats, 'videoonly')
      .sort((a, b) => {
        const qualityA = parseInt(a.qualityLabel) || 0;
        const qualityB = parseInt(b.qualityLabel) || 0;
        return qualityB - qualityA;
      });

    // Get highest quality audio format
    const audioFormats = ytdl.filterFormats(allFormats, 'audioonly')
      .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));

    console.log(`Found ${videoFormats.length} video-only formats`);
    console.log(`Found ${audioFormats.length} audio-only formats`);

    // Try to get the highest quality combined format first
    const combinedFormats = ytdl.filterFormats(allFormats, 'videoandaudio');
    console.log(`Found ${combinedFormats.length} video+audio formats`);

    let bestCombinedFormat = combinedFormats
      .filter(format => format.hasVideo && format.hasAudio)
      .sort((a, b) => {
        const videoQualityA = parseInt(a.qualityLabel) || 0;
        const videoQualityB = parseInt(b.qualityLabel) || 0;
        if (videoQualityA !== videoQualityB) {
          return videoQualityB - videoQualityA;
        }
        return (b.audioBitrate || 0) - (a.audioBitrate || 0);
      })[0];

    // Handle different download modes
    if (DOWNLOAD_MODE === 'audio-only') {
      if (audioFormats.length === 0) {
        throw new Error('No audio formats available for download');
      }

      const audioFormat = audioFormats[0];
      const outputPath = `${safeTitle}.${audioFormat.container}`;

      console.log(`Using highest quality audio (${audioFormat.audioBitrate}kbps)`);
      await downloadStream(videoUrl, audioFormat, outputPath, 'audio');
      console.log(`\nDownloaded: ${outputPath}`);

    } else if (DOWNLOAD_MODE === 'video-only') {
      if (videoFormats.length === 0) {
        throw new Error('No video formats available for download');
      }

      const videoFormat = videoFormats[0];
      const outputPath = `${safeTitle}.${videoFormat.container}`;

      console.log(`Using highest quality video (${videoFormat.qualityLabel})`);
      await downloadStream(videoUrl, videoFormat, outputPath, 'video');
      console.log(`\nDownloaded: ${outputPath}`);

    } else if (DOWNLOAD_MODE === 'video+audio') {
      const outputPath = `${safeTitle}.mp4`;

      // Choose between highest combined quality vs highest video-only quality
      const highestCombinedQuality = bestCombinedFormat ? parseInt(bestCombinedFormat.qualityLabel) : 0;
      const highestVideoQuality = videoFormats.length > 0 ? parseInt(videoFormats[0].qualityLabel) : 0;

      if (highestVideoQuality > highestCombinedQuality && videoFormats.length > 0 && audioFormats.length > 0) {
        console.log(`Using highest quality video (${videoFormats[0].qualityLabel}) + audio (${audioFormats[0].audioBitrate}kbps) - will merge with ffmpeg`);

        // Download video and audio separately
        const videoPath = `${safeTitle}_video.${videoFormats[0].container}`;
        const audioPath = `${safeTitle}_audio.${audioFormats[0].container}`;

        await downloadStream(videoUrl, videoFormats[0], videoPath, 'video');
        await downloadStream(videoUrl, audioFormats[0], audioPath, 'audio');

        // Merge with ffmpeg
        await mergeWithFFmpeg(videoPath, audioPath, outputPath);

        // Clean up temporary files
        fs.unlinkSync(videoPath);
        fs.unlinkSync(audioPath);

        console.log(`\nDownloaded: ${outputPath}`);
      } else if (bestCombinedFormat) {
        console.log(`Using combined video+audio format (${bestCombinedFormat.qualityLabel}) - this includes audio`);

        await downloadStream(videoUrl, bestCombinedFormat, outputPath, 'combined');
        console.log(`\nDownloaded: ${outputPath}`);
      } else {
        throw new Error('No suitable format found for download');
      }
    } else {
      throw new Error(`Invalid download mode: ${DOWNLOAD_MODE}. Use 'video+audio', 'video-only', or 'audio-only'`);
    }
  } catch (error) {
    console.log(`\nError processing video ${index + 1}:`, error.message);
    throw error;
  }
}

async function downloadAllVideos() {
  console.log(`Starting download of ${videos.length} videos...`);

  for (let i = 0; i < videos.length; i++) {
    try {
      await downloadVideo(videos[i], i);

      if (i < videos.length - 1) {
        console.log("Waiting 2 seconds before next download...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
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