// The installed Chrome the browser checks drive. PIXELBENCH_CHROME points to another one.
const defaults = {
  win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
}

export const chromePath = process.env.PIXELBENCH_CHROME ?? defaults[process.platform] ?? 'google-chrome'
