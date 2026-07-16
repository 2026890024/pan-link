const CDP = require('chrome-remote-interface');

const CDP_URL = process.argv[2] || 'ws://127.0.0.1:57166/devtools/browser/2a4ef0c4-57db-4d2f-a1c7-757de0898c1b';
const WIDTH = parseInt(process.argv[3]) || 375;
const HEIGHT = parseInt(process.argv[4]) || 812;

async function setViewport() {
  try {
    const client = await CDP({ host: '127.0.0.1', port: 57166 });
    const { Emulation, Page } = client;
    
    // Find current page target
    const { targetInfos } = await client.Target.getTargets();
    const pageTarget = targetInfos.find(t => t.type === 'page');
    
    if (!pageTarget) {
      console.log('No page target found');
      return;
    }
    
    const { targetId } = pageTarget;
    const { sessionId } = await client.Target.attachToTarget({ targetId, flatten: true });
    
    await Emulation.setDeviceMetricsOverride({
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: WIDTH <= 400 ? 3 : 1,
      mobile: WIDTH <= 400,
    });
    
    console.log(`Viewport set to ${WIDTH}x${HEIGHT}`);
    await client.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

setViewport();
