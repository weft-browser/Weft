// window.weft for the fork: the same WeftApi the Electron preload exposes, served by the shell's
// own controller (controller.ts), which owns the model and drives pages through engine.ts.
import { Controller } from './controller';

export const controller = new Controller();
window.weft = controller.api;
void controller.start();
