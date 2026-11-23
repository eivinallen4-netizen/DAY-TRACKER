# Work Better TV

See the [TV releases](https://github.com/eivinallen4-netizen/DAY-TRACKER/releases) for availability. Build 2 is a prerelease under review after Play Protect blocked installation in an Android emulator. The automatic update feed only offers stable releases.

Starting with build 2, the app automatically checks this feed when opened and every six hours while the app is in the foreground. When it finds a newer build it downloads it, checks its SHA-256 digest, package name, build number, and signing certificate, then offers to install it. Android asks you to confirm installation. You can also select **Menu or Back → Check for updates**.

This repository distributes the TV client. The calendar and phone web app run on your Work Better server.
