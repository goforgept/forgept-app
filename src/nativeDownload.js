import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * Save a file on web (a.download) or native (Filesystem + Share sheet).
 * @param {string} filename  e.g. "Invoice.pdf"
 * @param {Blob|Uint8Array|ArrayBuffer|string} data  File content or base64 string
 * @param {string} mimeType  e.g. "application/pdf"
 */
export async function nativeDownload(filename, data, mimeType = 'application/octet-stream') {
  if (!Capacitor.isNativePlatform()) {
    // Web: use the existing anchor download approach
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    return
  }

  // Native: write to temp dir then open share sheet
  let base64
  if (typeof data === 'string') {
    base64 = data  // already base64
  } else {
    const bytes = data instanceof Uint8Array ? data
      : data instanceof ArrayBuffer ? new Uint8Array(data)
      : new Uint8Array(await data.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    base64 = btoa(bin)
  }

  const result = await Filesystem.writeFile({
    path:      filename,
    data:      base64,
    directory: Directory.Cache,
  })

  await Share.share({
    title: filename,
    url:   result.uri,
    dialogTitle: `Save ${filename}`,
  })
}

/**
 * Convenience wrapper for jsPDF instances.
 * Replaces pdf.save(filename) in every export handler.
 */
export async function savePdf(pdf, filename) {
  const buf = pdf.output('arraybuffer')
  await nativeDownload(filename, buf, 'application/pdf')
}
