const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const sdkRoot = 'C:\\Users\\USER\\Android\\Sdk';
const cmdlineToolsDir = path.join(sdkRoot, 'cmdline-tools', 'latest');
const zipPath = path.join(process.env.TEMP || 'C:\\Users\\USER\\AppData\\Local\\Temp', 'cmdline-tools.zip');
const url = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip';
const javaHome = 'C:\\Users\\USER\\jdk-17';

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
  if (!fs.existsSync(sdkRoot)) fs.mkdirSync(sdkRoot, { recursive: true });

  const sdkManagerBat = path.join(cmdlineToolsDir, 'bin', 'sdkmanager.bat');
  if (!fs.existsSync(sdkManagerBat)) {
    console.log('Downloading Android Command Line Tools...');
    await downloadFile(url, zipPath);
    console.log('Extracting Command Line Tools...');
    const extractTemp = path.join(sdkRoot, 'cmdline-temp');
    if (!fs.existsSync(extractTemp)) fs.mkdirSync(extractTemp, { recursive: true });
    execSync(`tar.exe -xf "${zipPath}" -C "${extractTemp}"`, { stdio: 'inherit' });
    
    // In zip, root folder is 'cmdline-tools'
    const extractedInner = path.join(extractTemp, 'cmdline-tools');
    if (fs.existsSync(cmdlineToolsDir)) {
      fs.rmSync(cmdlineToolsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(cmdlineToolsDir), { recursive: true });
    fs.renameSync(extractedInner, cmdlineToolsDir);
    fs.rmSync(extractTemp, { recursive: true, force: true });
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    console.log('Command Line Tools ready at', cmdlineToolsDir);
  }

  // Create local.properties in android directory
  const localPropPath = path.resolve(__dirname, '..', 'android', 'local.properties');
  const escapedSdkDir = sdkRoot.replace(/\\/g, '\\\\');
  fs.writeFileSync(localPropPath, `sdk.dir=${escapedSdkDir}\n`, 'utf8');
  console.log('Wrote android/local.properties pointing to', sdkRoot);

  // Install platform-tools, platforms;android-34, build-tools;34.0.0
  console.log('Accepting licenses and installing Android 34 platform & build-tools...');
  const env = {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: sdkRoot,
    PATH: `${path.join(javaHome, 'bin')};${path.join(cmdlineToolsDir, 'bin')};${process.env.PATH}`,
  };

  try {
    // Automatically accept licenses: echo y | sdkmanager --licenses
    execSync(`cmd.exe /c "echo y | \\"${sdkManagerBat}\\" --licenses"`, { env, stdio: 'inherit' });
    console.log('Installing platform-tools, platforms;android-34, build-tools;34.0.0...');
    execSync(`cmd.exe /c "echo y | \\"${sdkManagerBat}\\" \\"platform-tools\\" \\"platforms;android-34\\" \\"build-tools;34.0.0\\""`, { env, stdio: 'inherit' });
    console.log('Android SDK components installed successfully!');
  } catch (err) {
    console.error('SDK component install note:', err.message);
  }
}

main().catch((err) => {
  console.error('Android SDK setup failed:', err);
  process.exit(1);
});
