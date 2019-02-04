import p5 from 'p5/lib/p5.min';
import Stats from 'stats.js';
import CanvasResizer from '../utils/canvas-resizer';
import times from 'lodash/times';
import { hex2rgb } from '../utils/color-helper';
import randomColor from 'randomColor';


/**
 * Constants
 */
interface Point { x: number, y: number };
const ENABLE_STATS = true;
const LIGHT_HIT_COUNT_LIMIT = 3;
const LIGHT_RAY_COUNT = 360;
const LIGHT_ALPHA = 10;
const LIGHT_WEIGHT = 1;



/**
 * Setup environment
 */
const elements = {
  container: document.getElementById('container'),
  stats: document.getElementById('stats'),
};
let p: p5;
const resizer = new CanvasResizer(null, {
  dimension: 'fullscreen',
  dimensionScaleFactor: window.devicePixelRatio
});
const stats = new Stats();

let lights: Point[];
let wallLineSegments: Point[][];
let frameCount = 0;



/**
 * Main/Setup function, initialize stuff...
 */
async function main() {
  new p5((p_) => {
    p = p_;
    p.setup = setup;
    p.draw = draw;
    p.mouseClicked = mouseClicked;
    p.mouseDragged = mouseClicked;
  }, elements.container);

  if (ENABLE_STATS) {
    stats.showPanel(0);
    elements.stats.appendChild(stats.dom);
  }
}


/**
 * p5's setup function
 */
function setup() {
  const renderer: any = p.createCanvas(resizer.width, resizer.height);
  resizer.canvas = renderer.canvas;
  resizer.resize = onWindowResize;
  resizer.init();

  lights = [];

  const triangleWeight = 500;
  const centerX = resizer.width / 2;
  const centerY = resizer.height / 2 + triangleWeight / 5;

  wallLineSegments = [
    // frame
    [{ x: 0, y: 0 }, { x: resizer.width, y: 0 }],
    [{ x: resizer.width, y: 0 }, { x: resizer.width, y: resizer.height }],
    [{ x: resizer.width, y: resizer.height }, { x: 0, y: resizer.height }],
    [{ x: 0, y: resizer.height }, { x: 0, y: 0 }],
    // triangle
    [
      { x: centerX, y: centerY - triangleWeight },
      { x: centerX + (triangleWeight * Math.sqrt(3) / 2), y: centerY + (triangleWeight / 2) }
    ],
    [
      { x: centerX + (triangleWeight * Math.sqrt(3) / 2), y: centerY + (triangleWeight / 2) },
      { x: centerX - (triangleWeight * Math.sqrt(3) / 2), y: centerY + (triangleWeight / 2) }
    ],
    [
      { x: centerX - (triangleWeight * Math.sqrt(3) / 2), y: centerY + (triangleWeight / 2) },
      { x: centerX, y: centerY - triangleWeight }
    ],
  ];

  // p.pixelDensity(1);
  p.background('#000');
}


function mouseClicked() {
  const color = randomColor({
    // luminosity: 'light',
    hue: 'red'
  });

  times(LIGHT_RAY_COUNT, (i) => {
    const angle = i * (2 * Math.PI / LIGHT_RAY_COUNT);
    // Ignore horizontal and vertical rays, because they're ugly
    if (angle % (Math.PI / 2) == 0) return;
    lights.push({
      x: p.mouseX,
      y: p.mouseY,
      angle,
      hitCount: 0,
      color
    });
  });
}


/**
 * Animate stuff...
 */
function draw() {
  if (ENABLE_STATS) stats.begin();

  const lightIndexesToBeDeleted = [];

  lights.forEach((point, i) => {
    // Next point, far enough to cover all the viewport
    const rayEndPoint = {
      x: point.x + Math.cos(point.angle) * 100000,
      y: point.y + Math.sin(-point.angle) * 100000
    };

    // Check all the line segments for intersection
    const allIntersections = [];
    wallLineSegments.forEach((lineSegment) => {
      const intersectionPoint = getIntersection([ point, rayEndPoint ], lineSegment);
      if (!intersectionPoint) return;
      const distance = getDistance(point, intersectionPoint);
      if (distance < 1) return; // ignore already intersected ones
      allIntersections.push({ distance, lineSegment, point: intersectionPoint });
    });

    if (allIntersections.length == 0) {
      // console.log('no intersection');
      lightIndexesToBeDeleted.push(i);
      return;
    }

    // Get the closest intersection distance,
    // and finally get real intersections (it may be multiple, actually 1 or 2)
    const closestIntersectionDistance = minBy(allIntersections, i => i.distance).distance;
    const intersections = allIntersections.filter(i => i.distance == closestIntersectionDistance);

    // Draw the line
    const intersectionPoint = intersections[0].point;
    const color = hex2rgb(point.color);
    const alpha = LIGHT_ALPHA - point.hitCount * (LIGHT_ALPHA / LIGHT_HIT_COUNT_LIMIT);
    p.stroke(color.r, color.g, color.b, LIGHT_ALPHA);
    p.strokeWeight(LIGHT_WEIGHT);
    p.line(point.x, point.y, intersectionPoint.x, intersectionPoint.y);

    // Update angle
    intersections.forEach((i) => {
      let lineAngle = Math.atan2(
        -1 * (i.lineSegment[0].y - i.lineSegment[1].y),
        i.lineSegment[0].x - i.lineSegment[1].x,
      );
      lineAngle = lineAngle < 0 ? Math.PI + lineAngle : lineAngle;
      let lineNormalAngle = lineAngle - Math.PI / 2;
      lineNormalAngle = lineNormalAngle < 0 ? Math.PI + lineNormalAngle : lineNormalAngle;
      let rayAngle = Math.atan2(
        -1 * (i.point.y - point.y),
        i.point.x - point.x
      );

      point.angle = lineNormalAngle - (Math.PI - lineNormalAngle + rayAngle);
    });

    // Update point
    point.x = intersectionPoint.x;
    point.y = intersectionPoint.y;
    point.hitCount++;
  });

  lights = lights.filter((light, i) => {
    return light.hitCount < LIGHT_HIT_COUNT_LIMIT &&
      lightIndexesToBeDeleted.indexOf(i) == -1;
  });

  if (ENABLE_STATS) stats.end();
}


/**
 * On window resized
 */
function onWindowResize(width: number, height: number) {
  p.resizeCanvas(width, height);
}


/**
 * Clean your shit
 */
function dispose() {
  resizer.destroy();
  p.remove();
  p = null;

  Object.keys(elements).forEach((key) => {
    const element = elements[key];
    while (element.firstChild) { element.removeChild(element.firstChild); }
  });
}

function getIntersection(lineSegment1: Point[], lineSegment2: Point[]) {
  const p1 = lineSegment1[0];
  const p2 = lineSegment1[1];
  const p3 = lineSegment2[0];
  const p4 = lineSegment2[1];
  const denom = ((p4.y - p3.y) * (p2.x - p1.x)) - ((p4.x - p3.x) * (p2.y - p1.y));
  const numeA = ((p4.x - p3.x) * (p1.y - p3.y)) - ((p4.y - p3.y) * (p1.x - p3.x));
  const numeB = ((p2.x - p1.x) * (p1.y - p3.y)) - ((p2.y - p1.y) * (p1.x - p3.x));

  if (denom == 0) {
    if (numeA == 0 && numeB == 0) {
      return; // COLINEAR
    }
    return; // PARALLEL
  }

  const uA = numeA / denom;
  const uB = numeB / denom;

  if (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1) {
    return {
      x: p1.x + (uA * (p2.x - p1.x)),
      y: p1.y + (uA * (p2.y - p1.y))
    };
  }

  return;
}


function getDistance(p1: Point, p2: Point) {
  return Math.sqrt(
    Math.pow(p2.y - p1.y, 2) +
    Math.pow(p2.x - p1.x, 2)
  );
}


function minBy(arr, lambda: Function) {
  const mapped = arr.map(lambda);
  const minValue = Math.min.apply(Math, mapped);
  return arr[mapped.indexOf(minValue)];
}


main().catch(err => console.error(err));
(module as any).hot && (module as any).hot.dispose(dispose);