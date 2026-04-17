//toBase64
const LOOKUP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
    let output = '';
    const len = bytes.length;
    for (let i = 0; i < len; i += 3) {
        const b1 = bytes[i]!;
        const b2 = i + 1 < len ? bytes[i + 1]! : NaN;
        const b3 = i + 2 < len ? bytes[i + 2]! : NaN;
        const c1 = b1 >> 2;
        const c2 = ((b1 & 3) << 4) | (b2 >> 4);
        const c3 = ((b2 & 15) << 2) | (b3 >> 6);
        const c4 = b3 & 63;
        output += LOOKUP[c1]! + LOOKUP[c2]! + (isNaN(b2) ? '=' : LOOKUP[c3]) + (isNaN(b3) ? '=' : LOOKUP[c4]);
    }
    return output;
}
