import { PAGInit } from '../src/pag';
import { setPAGModule } from '../src/pag-module';
import { TMProject } from '../src/typemonkey';

let pagView;
let pagObjectSet: any = {}

async function main() {
  const statusEl = document.getElementById('status') as HTMLSpanElement;
  statusEl.textContent = 'Loading wasm...';

  const PAG = await PAGInit({ locateFile: (file) => '../lib/' + file });
  setPAGModule(PAG);
  statusEl.textContent = 'WASM Ready';

  const canvas = document.getElementById('tm-canvas') as HTMLCanvasElement;

  const root = PAG.PAGComposition.make(720, 1280);
  const layer = PAG.PAGSolidLayer.make(1000, 720, 1280, 
    { red: 255, green: 0, blue: 0 }, 
    1
  );
  pagObjectSet[0] = root;
  pagObjectSet[1] = layer;
  root.addLayer(layer);

  pagView = await PAG.PAGView.init(root, canvas);


  pagView?.play()

  
}

main();
