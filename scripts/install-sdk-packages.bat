@echo off
set "JAVA_HOME=C:\Users\USER\jdk-17"
set "PATH=C:\Users\USER\jdk-17\bin;%PATH%"
set "SDKMANAGER=C:\Users\USER\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat"

echo Installing platform-tools, platforms;android-34, build-tools;34.0.0...
"%SDKMANAGER%" "platform-tools" "platforms;android-34" "build-tools;34.0.0"
echo Finished installing Android SDK packages.
