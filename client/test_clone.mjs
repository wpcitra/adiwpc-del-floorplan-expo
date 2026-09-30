import * as fabric from 'fabric';

// Mock browser env
const canvas = new fabric.Canvas(null, {width: 800, height: 600});
const rect1 = new fabric.Rect({left: 10, top: 10, width: 20, height: 20});
const rect2 = new fabric.Rect({left: 50, top: 50, width: 20, height: 20});
canvas.add(rect1, rect2);

const sel = new fabric.ActiveSelection([rect1, rect2], {canvas});
canvas.setActiveObject(sel);

sel.clone().then((cloned) => {
    console.log("Cloned type:", cloned.type);
    console.log("Cloned has canvas:", !!cloned.canvas);
    cloned.canvas = canvas;
    const items = cloned.getObjects();
    console.log("Items before destroy:", items.map(i => i.left));
    cloned.destroy();
    console.log("Items after destroy:", items.map(i => i.left));
}).catch(console.error);

