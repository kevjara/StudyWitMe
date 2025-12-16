// polyfill.mjs
// this is for dummy browser APIs to prevent pdfjs-dist from crashing wehn doing NPM start

if (typeof global.DOMMatrix === "undefined") {
  console.log("Polyfilling DOMMatrix...");
  global.DOMMatrix = class {
    //add dummy methods if more errors appear here, but we don't need anything rn
  };
}

if (typeof global.ImageData === "undefined") {
  console.log("Polyfilling ImageData...");
  global.ImageData = class {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}

if (typeof global.Path2D === "undefined") {
  console.log("Polyfilling Path2D...");
  global.Path2D = class {
    //more dummy stuff if needed.
  };
}