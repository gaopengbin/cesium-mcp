declare module 'lerc' {
  type LercPixelArray =
    | Int8Array
    | Uint8Array
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array
    | Float32Array
    | Float64Array

  interface LercStatistics {
    minValue: number
    maxValue: number
  }

  interface LercDecodeResult {
    width: number
    height: number
    pixels: LercPixelArray[]
    mask: Uint8Array | null
    statistics: LercStatistics[]
  }

  interface LercDecoder {
    decode(buffer: ArrayBuffer): LercDecodeResult
  }

  const Lerc: LercDecoder
  export default Lerc
}
