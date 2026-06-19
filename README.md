# IRCTC Premium Tatkal Assistant

A production-quality Chrome Extension designed to help users quickly auto-fill the IRCTC train search form specifically for Premium Tatkal bookings.

## Features
- **Auto Detection:** Automatically runs when visiting `irctc.co.in`.
- **Login Assistance:** Auto-fills the username and focuses the password field during login (Does not bypass CAPTCHA or OTP).
- **Search Automation:** Automatically fills Journey From, Journey To, Quota, and Class in the search form based on user preferences.
- **Robust DOM Tracking:** Utilizes `MutationObserver` to gracefully handle IRCTC's dynamic Angular rendering without aggressive polling.
- **Modern UI:** A sleek, dark-themed popup to manage your preferences securely using `chrome.storage.sync`.

## Installation (Chrome / Edge)

1. Clone or download this repository.
2. Open Chrome/Edge and navigate to `chrome://extensions/` (or `edge://extensions/`).
3. Enable **Developer mode** (toggle usually found in the top right).
4. Click **Load unpacked**.
5. Select the `IRCTC-Premium-Tatkal-Assistant` folder.
6. Pin the extension to your toolbar.

## Setup Guide

1. Click the extension icon in the toolbar.
2. Enter your IRCTC Username.
3. Provide your standard "Journey From" and "Journey To" stations exactly as they appear in IRCTC (e.g., `BODINAYAKKANUR - BDNK`).
4. Select `Premium Tatkal` as Quota, and your desired Class.
5. Click **Save Preferences**.
6. Click **Open IRCTC** or visit the site manually. The extension will handle the rest.

## Project Structure
- `manifest.json`: Manifest V3 config file.
- `background.js`: Service worker managing initial defaults.
- `content.js`: Core automation script interacting with the IRCTC website.
- `popup.html/css/js`: The UI components for user preferences.
- `icons/`: Extension branding assets.
