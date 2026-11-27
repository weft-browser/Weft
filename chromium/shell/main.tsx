// chrome://weft entry: the bridge first (it defines window.weft), then the shell from the app repo,
// and the app's HUD on top of it. In Electron the HUD is its own transparent window because nothing
// in the shell document can paint over a native page view; here the page is an element of this
// document, so the HUD is one too.
import './bridge';
import '../../shell/src/renderer/styles.css';
import { createRoot } from 'react-dom/client';
import { App } from '../../shell/src/renderer/App';
import { Hud } from '../../shell/src/renderer/components/Hud';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, pointerEvents: 'none' }}><Hud /></div>
  </>
);
