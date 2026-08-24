/**
 * Minimal typings for the Web Serial API, which TypeScript's DOM library does
 * not ship. Only the members this dashboard uses are declared.
 */

export interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
}

export interface SerialLike {
  requestPort(): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

export function getSerial(): SerialLike | null {
  if (typeof navigator === "undefined") return null;
  const candidate = (navigator as Navigator & { serial?: SerialLike }).serial;
  return candidate ?? null;
}
