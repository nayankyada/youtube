const ytdl = require("@distube/ytdl-core");
const fs = require("fs");

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
];

async function downloadVideo(videoUrl, index) {
  try {
    console.log(`Starting download ${index + 1}/${videos.length}...`);

    const info = await ytdl.getBasicInfo(videoUrl);
    const title = info.videoDetails.title;
    const safeTitle = title.replace(/[<>:"/\\|?*]/g, "_");

    console.log(`Video: ${title}`);
    console.log(`Duration: ${info.videoDetails.lengthSeconds} seconds`);

    const outputPath = `${safeTitle}.mp4`;

    return new Promise((resolve, reject) => {
      const stream = ytdl(videoUrl, {
        quality: "highestvideo",
      });

      const writeStream = fs.createWriteStream(outputPath);

      stream.pipe(writeStream);

      stream.on("progress", (chunkLength, downloaded, total) => {
        const percent = (downloaded / total) * 100;
        process.stdout.write(`\rProgress: ${percent.toFixed(1)}%`);
      });

      writeStream.on("finish", () => {
        console.log(`\nDownloaded: ${outputPath}`);
        resolve();
      });

      writeStream.on("error", (error) => {
        console.log(`\nError downloading ${title}:`, error.message);
        reject(error);
      });
    });
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
      console.log(`Skipping video ${i + 1} due to error`);
      continue;
    }
  }

  console.log("\nAll downloads completed!");
}

downloadAllVideos().catch(console.error);
