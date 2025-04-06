# MacOS build & notarization script
macos_build:
	echo "Building for MacOS"
	pyinstaller app.spec -y

macos_sign:
	echo "Signing for MacOS"
	codesign --deep --force --verbose --verify --sign "$(MACOS_SIGNING_IDENTITY)" --options runtime --entitlements macos/entitlements.plist dist/AudioSummarizer.app

macos_zip:
	echo "Zipping for MacOS"
	cd dist && zip -r AudioSummarizer.zip AudioSummarizer.app

macos_notarize:
	echo "Notarizing for MacOS"
	xcrun notarytool submit --keychain-profile "AC_PASSWORD" --wait dist/AudioSummarizer.zip
	xcrun stapler staple dist/AudioSummarizer.app

macos: macos_build macos_sign macos_zip macos_notarize
	echo "MacOS build complete"
