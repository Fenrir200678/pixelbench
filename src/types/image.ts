export type Point = { x: number; y: number }
export type Rect = Point & { w: number; h: number }
export type Frame = Rect & { pixels: Uint8ClampedArray }
export type ReferenceImage = { id: string; frame: Frame; name: string }
export type Margins = { left: number; top: number; right: number; bottom: number }
export type SizeRule = { grid: number; min: number; max: number; area: number; target: number }
// mask: a raster mask in image pixels, such as the detailer's segmentation, drawn once instead of points.
export type Stroke = { erase: boolean; size: number; points: Point[]; color?: string; mask?: HTMLCanvasElement }
/** A detailer detection in image pixels: the SAM3 term and its confidence. */
export type Detection = Rect & { term: string; score: number }
