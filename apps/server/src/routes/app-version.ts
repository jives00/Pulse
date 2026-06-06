import { Router } from 'express';

const router = Router();

const GITHUB_REPO = 'jives00/Pulse';

// GET /api/app/version — returns latest release tag and APK download URL
router.get('/version', async (_req, res) => {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { 'User-Agent': 'pulse-health-server', Accept: 'application/vnd.github+json' } }
    );
    if (!response.ok) {
      res.status(502).json({ error: 'Failed to fetch release info' });
      return;
    }
    const release = await response.json() as {
      tag_name: string;
      assets: { name: string; browser_download_url: string }[];
    };
    const apk = release.assets.find((a) => a.name.endsWith('.apk'));
    if (!apk) {
      res.status(404).json({ error: 'No APK asset in latest release' });
      return;
    }
    res.json({ tag: release.tag_name, apkUrl: apk.browser_download_url });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
