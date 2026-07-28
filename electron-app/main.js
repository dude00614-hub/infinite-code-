const { app, BrowserWindow } = require('electron');
const path = require('path');

const URL = 'https://dude00614-hub.github.io/infinite-code-/';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Infinite Code',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadURL(URL);
  win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
