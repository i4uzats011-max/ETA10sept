const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const targetDir = 'C:\\Users\\USER\\jdk-17';
const zipPath = path.join(process.env.TEMP || 'C:\\Users\\USER\\AppData\\Local\\Temp', 'jdk17.zip');
const url = 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse';

function downloadFile(sourceUrl, destPath) {
  return new Promise((resolve, reject) => {
    https.get(sourceUrl, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed with status code: ${res.statusCode}`));
      }
      const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      let lastReport = 0;
      const fileStream = fs.createWriteStream(destPath);
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (totalBytes > 0 && downloaded - lastReport > 15 * 1024 * 1024) {
          console.log(`Downloaded ${Math.round((downloaded / totalBytes) * 100)}% (${(downloaded / (1024 * 1024)).toFixed(1)} MB)`);
          lastReport = downloaded;
        }
      });
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`Download complete: ${(downloaded / (1024 * 1024)).toFixed(1)} MB`);
        resolve();
      });
      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  if (fs.existsSync(path.join(targetDir, 'bin', 'javac.exe'))) {
    console.log('JDK 17 already exists at', targetDir);
    return;
  }
  console.log('Starting JDK 17 download...');
  await downloadFile(url, zipPath);
  console.log('Extracting archive...');
  const extractTemp = 'C:\\Users\\USER\\jdk17-extract';
  if (!fs.existsSync(extractTemp)) fs.mkdirSync(extractTemp, { recursive: true });
  execSync(`tar.exe -xf "${zipPath}" -C "${extractTemp}"`, { stdio: 'inherit' });
  const entries = fs.readdirSync(extractTemp);
  const rootEntry = path.join(extractTemp, entries[0]);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.renameSync(rootEntry, targetDir);
  fs.rmSync(extractTemp, { recursive: true, force: true });
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  console.log('JDK 17 successfully installed at', targetDir);
}

main().catch((err) => {
  console.error('JDK setup failed:', err);
  process.exit(1);
});
