import sharp from "sharp";
export async function imageFeatures(input) {
  const { data } = await sharp(input, { limitInputPixels: 25_000_000 })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(16, 16, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgb = [0, 0, 0];
  for (let i = 0; i < data.length; i++) rgb[i % 3] += data[i] / 256;
  const names = [
    ["墨黑", 35, 35, 35],
    ["云白", 235, 235, 235],
    ["雾灰", 150, 150, 150],
    ["原木", 177, 137, 90],
    ["苔绿", 88, 126, 87],
    ["海蓝", 75, 114, 169],
    ["赤陶", 183, 95, 71],
    ["暖黄", 210, 185, 105],
  ];
  const nearest = names.sort(
    (a, b) =>
      a.slice(1).reduce((v, x, i) => v + (x - rgb[i]) ** 2, 0) -
      b.slice(1).reduce((v, x, i) => v + (x - rgb[i]) ** 2, 0),
  )[0][0];
  return { descriptor: Array.from(data), color: nearest };
}
export function similarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  return Math.round(
    100 *
      (1 -
        Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length) /
          255),
  );
}
