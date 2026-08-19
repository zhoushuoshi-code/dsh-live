import qrcode from 'qrcode-generator';
/** Render a scannable SVG for a pairing URL. */
export function renderPairingQrSvg(pairingUrl) {
    const url = new URL(pairingUrl);
    if (url.protocol !== 'https:' || !new URLSearchParams(url.hash.slice(1)).has('pair')) {
        throw new Error('invalid pairing URL');
    }
    const code = qrcode(0, 'M');
    code.addData(pairingUrl, 'Byte');
    code.make();
    return Promise.resolve(code.createSvgTag({ cellSize: 4, margin: 8, scalable: true }));
}
//# sourceMappingURL=qr.js.map